// WebGLEngine/render/zoomBlur.mjs -- v4504
//
// *** THE ZOOM BLUR: A RADIAL MARCH TOWARD AN ARBITRARY CENTRE (task 46). *** render/bloomPass.js's GODRAYS_FS is the
// tree's one radial march, and it is a god-ray pass: it marches toward the SUN, adds only samples that are bright (a
// luminance gate) and at the far plane (a depth gate), decays them along the way, and hands the result to the composite
// to ADD on top of the scene. This is the other thing a radial march is for: every fragment averages the scene's colour
// along the line from itself toward a centre anybody chooses (a uniform), with no gate, no decay and no addition -- the
// output REPLACES the scene, the way a zoom blur in a compositor does. Both languages, one CPU twin, one gate
// (tools/ship/zoomBlur-selfcheck.mjs) that holds the two backends to the twin and runs GODRAYS_FS beside it on the same
// scene so the two passes' differences are measured rather than described.
//
// THE MARCH. N samples at uv_i = uv - (uv - centre) * strength * i / (N - 1), i = 0 .. N - 1: the fragment's own texel
// first, the point `strength` of the way to the centre last; the mean of the N bilinear samples is the answer. The
// sample position is CLAMPED to the texel-centre range [0.5 / size, 1 - 0.5 / size] in the shader itself, because the
// two backends' samplers disagree at the edge (WebGL2 clamps, WebGPU's default repeats -- the v4500 finding) and a
// bilinear sample half a texel outside the image would read a different neighbour on each; inside that range the two
// backends and the twin interpolate the same four texels with the same weights, up to f32.
"use strict";

export const N_SAMPLES = 32;
export const KNOBS = Object.freeze(["cx", "cy", "strength"]);
export const DEFAULT_KNOBS = Object.freeze({ cx: 0.5, cy: 0.5, strength: 0.35 });
export const TEXTURE_BINDING = "tScene";

/** the i-th sample position for a fragment at (u, v) marching toward (cx, cy) */
export function samplePos(u, v, i, { cx = 0.5, cy = 0.5, strength = 0.35 } = {}, n = N_SAMPLES) {
    const t = strength * i / (n - 1);
    return [u - (u - cx) * t, v - (v - cy) * t];
}

/** a bilinear sample of an rgba8 image at (u, v), texel centres at (i + 0.5) / w, the position clamped to the centre range */
export function bilinear(rgba, w, h, u, v) {
    const uu = Math.min(1 - 0.5 / w, Math.max(0.5 / w, u)), vv = Math.min(1 - 0.5 / h, Math.max(0.5 / h, v));
    const x = uu * w - 0.5, y = vv * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const at = (px, py, c) => rgba[(py * w + px) * 4 + c];
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) out[c] = (at(x0, y0, c) * (1 - fx) + at(x1, y0, c) * fx) * (1 - fy) + (at(x0, y1, c) * (1 - fx) + at(x1, y1, c) * fx) * fy;
    return out;
}

/** the CPU twin: the whole frame, RGBA8, the mean of N bilinear samples along each pixel's march; the scene is W x H rgba8 */
export function zoomBlurCpu(scene, W, H, knobs = DEFAULT_KNOBS, n = N_SAMPLES) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const u = (i + 0.5) / W, v = (j + 0.5) / H; let r = 0, g = 0, b = 0;
        for (let k = 0; k < n; k++) { const [su, sv] = samplePos(u, v, k, knobs, n); const s = bilinear(scene.rgba, scene.w, scene.h, su, sv); r += s[0]; g += s[1]; b += s[2]; }
        const o = (j * W + i) * 4; out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
    }
    return out;
}

/* ---------------------------------------------------------------------------------------------------------
 * The pass, both languages: render/stereographic.mjs's full-screen triangle (uv.y = 0 at the top) and the march.
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
uniform float cx; uniform float cy; uniform float strength;
uniform sampler2D tScene;
out vec4 fragColor;
const int N = ${N_SAMPLES};
void main() {
  vec2 size = vec2(textureSize(tScene, 0));
  vec2 lo = 0.5 / size, hi = 1.0 - 0.5 / size;
  vec2 c = vec2(cx, cy), d = vUv - c;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = strength * float(i) / float(N - 1);
    vec2 p = clamp(vUv - d * t, lo, hi);
    acc += texture(tScene, p).rgb;
  }
  fragColor = vec4(acc / float(N), 1.0);
}`;

export const FRAGMENT_WGSL = `struct U { cx: f32, cy: f32, strength: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tScene: texture_2d<f32>;

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
  let size = vec2f(textureDimensions(tScene));
  let lo = 0.5 / size; let hi = 1.0 - 0.5 / size;
  let c = vec2f(u.cx, u.cy); let d = uv - c;
  var acc = vec3f(0.0);
  for (var i = 0; i < ${N_SAMPLES}; i++) {
    let t = u.strength * f32(i) / f32(${N_SAMPLES - 1});
    let p = clamp(uv - d * t, lo, hi);
    acc += textureSample(tScene, samp, p).rgb;
  }
  return vec4f(acc / f32(${N_SAMPLES}), 1.0);
}`;

export function zoomBlurPipelineDesc() {
    return {
        shaders: { wgsl: FRAGMENT_WGSL, glsl: { vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        attributes: [], stride: 0,
        uniforms: KNOBS.map((name) => ({ name, type: "f32" })),
    };
}

/** upload a scene as a linearly-sampled rgba8 texture on the device */
export function sceneTexture(device, scene) {
    return device.texture({ format: "rgba8unorm", width: scene.w, height: scene.h, data: scene.rgba });
}

/** draw one zoom-blurred frame inside a pass */
export function drawZoomBlur(pass, pipeline, texture, knobs = DEFAULT_KNOBS) {
    pass.use(pipeline);
    pass.uniform("cx", knobs.cx); pass.uniform("cy", knobs.cy); pass.uniform("strength", knobs.strength);
    pass.texture(TEXTURE_BINDING, texture);
    pass.draw(3);
}
