// WebGLEngine/render/water2d.mjs -- v4506
//
// *** 2D WATER: A PARALLAX-SCROLLED DISPLACEMENT OF THE SCENE, TINTED BY DEPTH OF COLOUR, WITH FOAM BY THRESHOLD (task 52). ***
// The idea is StefanJo3107/2D-Water-Shader (MIT, (c) 2020 Stefan Jovanovic; world/reachedLicences.mjs) -- the Kingdom-style
// water: two displacement textures scrolled in x at two speeds and by the camera's x over a parallax divider, their red and
// green summed into an offset, the scene (a reflection render in the original) read at uv + (offset - 0.5) / amount, tinted
// through a contrast curve by the sample's own greyness, and FOAM where both offset channels exceed a threshold or the
// fragment sits below an edge line that itself leans with the offset. READ AND HAND-WRITTEN, nothing copied: the original is
// a Unity CG surface shader; this is a full-screen pass on gfx/device.js in both languages with a CPU twin.
//
// WHAT MAKES IT GATEABLE, and the reason docs/SHADER-REPO-SWEEP.md kept it out of sixteen: the offset arithmetic is a closed
// form (a texel read at a scrolled, parallaxed coordinate, scaled by a divider) and the foam is a comparison, so a CPU twin
// can name the exact texel every fragment reads and the exact set of foam pixels. Every read here is NEAREST at an integer
// texel computed the same way on both sides (floor of a fract-wrapped or clamped coordinate times the size) -- no sampler,
// no filtering -- so the fragment and the twin disagree only where f32 lands a coordinate across a texel boundary that f64
// lands on this side of, and tools/ship/water2d-selfcheck.mjs counts those rather than hiding them, on a scene whose colour
// IS its texel index. The displacement maps are generated from a seed on the CPU (value noise), so the twin holds the same
// bytes the GPU reads. Sampling the original's bilinear way would look softer and hold nothing exactly.
"use strict";

export const KNOBS = Object.freeze(["time", "camX", "dispSpeed", "detailSpeed", "amount", "parallax", "foamThreshold", "edgeFoamThreshold", "foamAlpha", "tintR", "tintG", "tintB"]);
export const DEFAULT_KNOBS = Object.freeze({ time: 0, camX: 0, dispSpeed: 30, detailSpeed: 60, amount: 40, parallax: 20, foamThreshold: 0.0221, edgeFoamThreshold: 0.0051, foamAlpha: 1, tintR: 0.55, tintG: 0.8, tintB: 0.95 });
export const LUMA = Object.freeze([0.2126, 0.7152, 0.0722]);

/** a small deterministic generator (mulberry32) */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** a displacement map: value noise in R and G from a seed, a lattice of `cells` per side interpolated smoothly and wrapping, as rgba8 */
export function waterNoise(seed, w = 64, h = 64, cells = 8) {
    const R = rng(seed), lat = new Float32Array(cells * cells * 2); for (let i = 0; i < lat.length; i++) lat[i] = R();
    const rgba = new Uint8ClampedArray(w * h * 4), sm = (t) => t * t * (3 - 2 * t);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = i / w * cells, y = j / h * cells, x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0), x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        for (let c = 0; c < 2; c++) { const at = (a, b) => lat[(b * cells + a) * 2 + c];
            const v = (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
            rgba[(j * w + i) * 4 + c] = Math.round(v * 255); }
        rgba[(j * w + i) * 4 + 3] = 255;
    }
    return { rgba, w, h };
}

/** the integer texel a fract-wrapped u and a clamped v read, the fragment's own formula */
export function wrapTexel(u, v, w, h) { const uu = u - Math.floor(u); return [Math.min(w - 1, Math.max(0, Math.floor(uu * w))), Math.min(h - 1, Math.max(0, Math.floor(v * h)))]; }
export function clampTexel(u, v, w, h) { return [Math.min(w - 1, Math.max(0, Math.floor(u * w))), Math.min(h - 1, Math.max(0, Math.floor(v * h)))]; }
const readRG = (tex, x, y) => { const o = (y * tex.w + x) * 4; return [tex.rgba[o] / 255, tex.rgba[o + 1] / 255]; };

/** the offset for a fragment at (u, v) (v already flipped): the two maps' RG summed, each read at its scrolled, parallaxed x */
export function offsetAt(u, v, disp, detail, k) {
    const shift = k.camX / k.parallax;
    const [dx, dy] = wrapTexel(u + k.time / k.dispSpeed + shift, v, disp.w, disp.h), a = readRG(disp, dx, dy);
    const [ex, ey] = wrapTexel(u + k.time / k.detailSpeed + shift, v, detail.w, detail.h), b = readRG(detail, ex, ey);
    return [a[0] + b[0], a[1] + b[1]];
}

/** the foam decision: both channels' displacement past the threshold, or the fragment below the leaning edge line */
export function foamAt(u, v, offset, k) {
    const ox = (offset[0] - 0.5) / k.amount, oy = (offset[1] - 0.5) / k.amount;
    return (Math.abs(ox) > k.foamThreshold && Math.abs(oy) > k.foamThreshold) || v < k.edgeFoamThreshold * ox;
}

/** the original's contrast curve: pow(|c * 2 - 1|, 1 / max(k, 1e-4)) * sign(c - 0.5) + 0.5, per channel */
export function contrastCurve(c, k) { const e = 1 / Math.max(k, 1e-4), s = c - 0.5 > 0 ? 1 : c - 0.5 < 0 ? -1 : 0; return Math.pow(Math.abs(c * 2 - 1), e) * s + 0.5; }

/** the CPU twin: the whole W x H frame; returns rgba8 pixels, the foam mask and the scene texel each pixel read */
export function water2dCpu(scene, disp, detail, W, H, knobs = DEFAULT_KNOBS) {
    const k = { ...DEFAULT_KNOBS, ...knobs }, out = new Uint8ClampedArray(W * H * 4), foam = new Uint8Array(W * H), texel = new Int32Array(W * H * 2);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const u = (i + 0.5) / W, v = 1 - (j + 0.5) / H;   // the original flips v
        const off = offsetAt(u, v, disp, detail, k);
        const au = u + (off[0] - 0.5) / k.amount, av = v + (off[1] - 0.5) / k.amount;
        const [sx, sy] = clampTexel(au, av, scene.w, scene.h), so = (sy * scene.w + sx) * 4, p = j * W + i;
        texel[p * 2] = sx; texel[p * 2 + 1] = sy;
        const col = [scene.rgba[so] / 255, scene.rgba[so + 1] / 255, scene.rgba[so + 2] / 255];
        const grey = col[0] * LUMA[0] + col[1] * LUMA[1] + col[2] * LUMA[2];
        const tint = [contrastCurve(k.tintR, 1 - grey), contrastCurve(k.tintG, 1 - grey), contrastCurve(k.tintB, 1 - grey)];
        let rgb = [col[0] * tint[0], col[1] * tint[1], col[2] * tint[2]];
        const f = foamAt(u, v, off, k); foam[p] = f ? 1 : 0;
        if (f) rgb = rgb.map((c) => k.foamAlpha + (1 - k.foamAlpha) * c);
        out[p * 4] = Math.round(Math.min(1, rgb[0]) * 255); out[p * 4 + 1] = Math.round(Math.min(1, rgb[1]) * 255); out[p * 4 + 2] = Math.round(Math.min(1, rgb[2]) * 255); out[p * 4 + 3] = 255;
    }
    return { pixels: out, foam, texel };
}

/* ---------------------------------------------------------------------------------------------------------
 * The pass, both languages. The full-screen triangle of render/stereographic.mjs; every read an integer texel.
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
uniform float time; uniform float camX; uniform float dispSpeed; uniform float detailSpeed; uniform float amount; uniform float parallax;
uniform float foamThreshold; uniform float edgeFoamThreshold; uniform float foamAlpha; uniform float tintR; uniform float tintG; uniform float tintB;
uniform sampler2D tScene;
uniform sampler2D tDisp;
uniform sampler2D tDetail;
out vec4 fragColor;
ivec2 wrapTexel(vec2 uv, ivec2 size) { float uu = fract(uv.x); return ivec2(clamp(int(floor(uu * float(size.x))), 0, size.x - 1), clamp(int(floor(uv.y * float(size.y))), 0, size.y - 1)); }
ivec2 clampTexel(vec2 uv, ivec2 size) { return ivec2(clamp(int(floor(uv.x * float(size.x))), 0, size.x - 1), clamp(int(floor(uv.y * float(size.y))), 0, size.y - 1)); }
float curve(float c, float k) { float e = 1.0 / max(k, 1e-4); return pow(abs(c * 2.0 - 1.0), e) * sign(c - 0.5) + 0.5; }
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float shift = camX / parallax;
  vec2 a = texelFetch(tDisp, wrapTexel(vec2(uv.x + time / dispSpeed + shift, uv.y), textureSize(tDisp, 0)), 0).rg;
  vec2 b = texelFetch(tDetail, wrapTexel(vec2(uv.x + time / detailSpeed + shift, uv.y), textureSize(tDetail, 0)), 0).rg;
  vec2 offset = a + b;
  vec2 adjusted = uv + (offset - 0.5) / amount;
  vec3 col = texelFetch(tScene, clampTexel(adjusted, textureSize(tScene, 0)), 0).rgb;
  float grey = dot(col, vec3(${LUMA.join(", ")}));
  vec3 tint = vec3(curve(tintR, 1.0 - grey), curve(tintG, 1.0 - grey), curve(tintB, 1.0 - grey));
  vec3 rgb = col * tint;
  float ox = (offset.x - 0.5) / amount, oy = (offset.y - 0.5) / amount;
  bool foam = (abs(ox) > foamThreshold && abs(oy) > foamThreshold) || uv.y < edgeFoamThreshold * ox;
  if (foam) rgb = vec3(foamAlpha) + (1.0 - foamAlpha) * rgb;
  fragColor = vec4(rgb, 1.0);
}`;

export const FRAGMENT_WGSL = `struct U { time: f32, camX: f32, dispSpeed: f32, detailSpeed: f32, amount: f32, parallax: f32, foamThreshold: f32, edgeFoamThreshold: f32, foamAlpha: f32, tintR: f32, tintG: f32, tintB: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var tDisp: texture_2d<f32>;
@group(0) @binding(3) var tDetail: texture_2d<f32>;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = vec2f((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5);
  return o;
}

fn wrapTexel(uv: vec2f, size: vec2i) -> vec2i { let uu = fract(uv.x); return vec2i(clamp(i32(floor(uu * f32(size.x))), 0, size.x - 1), clamp(i32(floor(uv.y * f32(size.y))), 0, size.y - 1)); }
fn clampTexel(uv: vec2f, size: vec2i) -> vec2i { return vec2i(clamp(i32(floor(uv.x * f32(size.x))), 0, size.x - 1), clamp(i32(floor(uv.y * f32(size.y))), 0, size.y - 1)); }
fn curve(c: f32, k: f32) -> f32 { let e = 1.0 / max(k, 1e-4); return pow(abs(c * 2.0 - 1.0), e) * sign(c - 0.5) + 0.5; }

@fragment
fn fs(@location(0) vUv: vec2f) -> @location(0) vec4f {
  let uv = vec2f(vUv.x, 1.0 - vUv.y);
  let shift = u.camX / u.parallax;
  let a = textureLoad(tDisp, wrapTexel(vec2f(uv.x + u.time / u.dispSpeed + shift, uv.y), vec2i(textureDimensions(tDisp))), 0).rg;
  let b = textureLoad(tDetail, wrapTexel(vec2f(uv.x + u.time / u.detailSpeed + shift, uv.y), vec2i(textureDimensions(tDetail))), 0).rg;
  let offset = a + b;
  let adjusted = uv + (offset - 0.5) / u.amount;
  let col = textureLoad(tScene, clampTexel(adjusted, vec2i(textureDimensions(tScene))), 0).rgb;
  let grey = dot(col, vec3f(${LUMA.join(", ")}));
  let tint = vec3f(curve(u.tintR, 1.0 - grey), curve(u.tintG, 1.0 - grey), curve(u.tintB, 1.0 - grey));
  var rgb = col * tint;
  let ox = (offset.x - 0.5) / u.amount; let oy = (offset.y - 0.5) / u.amount;
  let foam = (abs(ox) > u.foamThreshold && abs(oy) > u.foamThreshold) || uv.y < u.edgeFoamThreshold * ox;
  if (foam) { rgb = vec3f(u.foamAlpha) + (1.0 - u.foamAlpha) * rgb; }
  return vec4f(rgb, 1.0);
}`;

export function water2dPipelineDesc() {
    return {
        shaders: { wgsl: FRAGMENT_WGSL, glsl: { vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        attributes: [], stride: 0,
        uniforms: KNOBS.map((name) => ({ name, type: "f32" })),
    };
}

/** upload an rgba8 image nearest (every read is by integer texel anyway) */
export function imageTexture(device, img) { return device.texture({ format: "rgba8unorm", width: img.w, height: img.h, data: img.rgba, nearest: true }); }

/** draw one water frame inside a pass */
export function drawWater2d(pass, pipeline, sceneTex, dispTex, detailTex, knobs = DEFAULT_KNOBS) {
    const k = { ...DEFAULT_KNOBS, ...knobs };
    pass.use(pipeline);
    for (const name of KNOBS) pass.uniform(name, k[name]);
    pass.texture("tScene", sceneTex, 0); pass.texture("tDisp", dispTex, 1); pass.texture("tDetail", detailTex, 2);
    pass.draw(3);
}
