// WebGLEngine/render/stereographic.mjs -- v4499
//
// *** THE LITTLE PLANET: A STEREOGRAPHIC VIEW OF procPlanet's EQUIRECTANGULAR BAKE (task 45). *** Nothing in the tree
// was stereographic before this: render/panini.js quotes Panini as "the cylindrical analogue of the stereographic
// projection" and is itself not called from main.js. This module is the projection as a pure function, a fragment pass
// in both languages that samples the bake through gfx/device.js, and a CPU twin that computes the same picture texel
// for texel, so tools/ship/stereographic-selfcheck.mjs can hold the two backends to it.
//
// THE MAP. The bake (world/procPlanet.js bakeEquirect) is rows of latitude from +pi/2 at row 0 to -pi/2 at the last,
// columns of longitude from -pi at column 0; a direction is d = (cos lat cos lon, sin lat, cos lat sin lon), y up. The
// little planet puts the SOUTH pole (lat -pi/2, the bottom row) at the picture's centre and projects the sphere
// stereographically from the north pole onto the tangent plane at the south pole: a picture point (x, y) in plane units
// (the frame's shorter half-side is one unit, divided by `zoom`) maps to r2 = x^2 + y^2 and the direction
//     d_local = ( 2x, -(1 - r2), 2y ) / (1 + r2)
// so the origin is the south pole, r = 1 the equator and r -> infinity the north pole -- the horizon curls up into a
// circle around the planet, which is the whole look. `roll` spins the planet about its axis (a rotation about y, a
// shift of longitude) and `tilt` leans the axis toward the viewer (a rotation about x) before the lookup. Sampling is
// NEAREST on both sides, with the longitude seam wrapped by fract() in the shader rather than by the sampler, so the
// CPU twin and the fragment take the same texel except where f32 rounding lands on a texel boundary.
"use strict";

export const KNOBS = Object.freeze(["zoom", "roll", "tilt", "aspect"]);
export const DEFAULT_KNOBS = Object.freeze({ zoom: 1.0, roll: 0.0, tilt: 0.0 });
export const TEXTURE_BINDING = "tEquirect";

/** picture point (plane units, y up) -> unit direction on the sphere in the bake's frame (y up), after roll and tilt */
export function planeToDir(x, y, { zoom = 1, roll = 0, tilt = 0 } = {}) {
    const px = x / zoom, py = y / zoom, r2 = px * px + py * py, k = 1 / (1 + r2);
    let dx = 2 * px * k, dy = -(1 - r2) * k, dz = 2 * py * k;
    // tilt: lean the axis toward the viewer (rotate about x), then roll: spin about the axis (rotate about y)
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const ty = dy * ct - dz * st, tz = dy * st + dz * ct; dy = ty; dz = tz;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const rx = dx * cr - dz * sr, rz = dx * sr + dz * cr; dx = rx; dz = rz;
    return [dx, dy, dz];
}

/** unit direction -> equirect (u, v) in [0, 1): u along longitude from -pi at 0, v down from the north pole at 0 */
export function dirToUv(d) {
    const lon = Math.atan2(d[2], d[0]), lat = Math.asin(Math.max(-1, Math.min(1, d[1])));
    let u = (lon + Math.PI) / (2 * Math.PI); u -= Math.floor(u);
    const v = 0.5 - lat / Math.PI;
    return [u, v];
}

/** the texel a nearest sample takes: u wrapped, v clamped */
export function nearestTexel(u, v, w, h) {
    const uu = u - Math.floor(u);
    const x = Math.min(w - 1, Math.max(0, Math.floor(uu * w))), y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
    return [x, y];
}

/** picture pixel (i, j) of a W x H frame -> plane point, the fragment's own formula: uv.y is flipped (0 at the top) */
export function pixelToPlane(i, j, W, H) {
    const u = (i + 0.5) / W, v = (j + 0.5) / H, aspect = W / H;
    return [(u * 2 - 1) * aspect, 1 - v * 2];
}

/** the CPU twin: the whole frame, RGBA8, nearest-sampled from the bake */
export function littlePlanetCpu(bake, W, H, knobs = DEFAULT_KNOBS) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const [x, y] = pixelToPlane(i, j, W, H);
        const d = planeToDir(x, y, knobs), [u, v] = dirToUv(d), [tx, ty] = nearestTexel(u, v, bake.w, bake.h);
        const s = (ty * bake.w + tx) * 4, o = (j * W + i) * 4;
        out[o] = bake.rgba[s]; out[o + 1] = bake.rgba[s + 1]; out[o + 2] = bake.rgba[s + 2]; out[o + 3] = 255;
    }
    return out;
}

/* ---------------------------------------------------------------------------------------------------------
 * The fragment pass, both languages. The vertex stage is render/badTvDevicePass.mjs's full-screen triangle with the
 * same flipped uv (uv.y = 0 at the top), so the two files share one orientation rule.
 * ------------------------------------------------------------------------------------------------------- */
export const VERTEX_GLSL = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2) * 2.0 - 1.0, float(gl_VertexID & 2) * 2.0 - 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = vec2((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
}`;

export const FRAGMENT_GLSL = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float zoom; uniform float roll; uniform float tilt; uniform float aspect;
uniform sampler2D tEquirect;
out vec4 fragColor;
void main() {
  float px = (vUv.x * 2.0 - 1.0) * aspect / zoom, py = (1.0 - vUv.y * 2.0) / zoom;
  float r2 = px * px + py * py, k = 1.0 / (1.0 + r2);
  float dx = 2.0 * px * k, dy = -(1.0 - r2) * k, dz = 2.0 * py * k;
  float ct = cos(tilt), st = sin(tilt);
  float ty = dy * ct - dz * st, tz = dy * st + dz * ct; dy = ty; dz = tz;
  float cr = cos(roll), sr = sin(roll);
  float rx = dx * cr - dz * sr, rz = dx * sr + dz * cr; dx = rx; dz = rz;
  float lon = atan(dz, dx), lat = asin(clamp(dy, -1.0, 1.0));
  float u = fract((lon + 3.14159265358979) / 6.28318530717959), v = 0.5 - lat / 3.14159265358979;
  fragColor = texture(tEquirect, vec2(u, clamp(v, 0.0, 1.0)));
}`;

export const FRAGMENT_WGSL = `struct U { zoom: f32, roll: f32, tilt: f32, aspect: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tEquirect: texture_2d<f32>;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = vec2f((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5);
  return o;
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let px = (uv.x * 2.0 - 1.0) * u.aspect / u.zoom; let py = (1.0 - uv.y * 2.0) / u.zoom;
  let r2 = px * px + py * py; let k = 1.0 / (1.0 + r2);
  var dx = 2.0 * px * k; var dy = -(1.0 - r2) * k; var dz = 2.0 * py * k;
  let ct = cos(u.tilt); let st = sin(u.tilt);
  let ty = dy * ct - dz * st; let tz = dy * st + dz * ct; dy = ty; dz = tz;
  let cr = cos(u.roll); let sr = sin(u.roll);
  let rx = dx * cr - dz * sr; let rz = dx * sr + dz * cr; dx = rx; dz = rz;
  let lon = atan2(dz, dx); let lat = asin(clamp(dy, -1.0, 1.0));
  let uu = fract((lon + 3.14159265358979) / 6.28318530717959); let vv = 0.5 - lat / 3.14159265358979;
  return textureSample(tEquirect, samp, vec2f(uu, clamp(vv, 0.0, 1.0)));
}`;

export function stereographicPipelineDesc() {
    return {
        shaders: { wgsl: FRAGMENT_WGSL, glsl: { vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        attributes: [], stride: 0,
        uniforms: KNOBS.map((name) => ({ name, type: "f32" })),
    };
}

/** upload a bake as a nearest-sampled rgba8 texture on the device */
export function bakeTexture(device, bake) {
    return device.texture({ format: "rgba8unorm", width: bake.w, height: bake.h, data: bake.rgba, nearest: true });
}

/** draw one little-planet frame inside a pass */
export function drawLittlePlanet(pass, pipeline, texture, W, H, knobs = DEFAULT_KNOBS) {
    pass.use(pipeline);
    pass.uniform("zoom", knobs.zoom); pass.uniform("roll", knobs.roll); pass.uniform("tilt", knobs.tilt); pass.uniform("aspect", W / H);
    pass.texture(TEXTURE_BINDING, texture);
    pass.draw(3);
}
