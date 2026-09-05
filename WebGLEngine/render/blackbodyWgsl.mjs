// WebGLEngine/render/blackbodyWgsl.mjs -- v4318
//
// THE BLACKBODY, AS A SHADER WITH A KEY. physics/thermal/blackbody.mjs is Planck's law in its dimensionless shape
// x^n / (e^x - 1) (n = 3 in frequency, 5 in wavelength) and Wien's displacement law as the root of x = n(1 - e^-x).
// Every sample is a closed form of x alone, so a pixel can be an x and the picture the spectrum; and the ROOT is
// a Newton iteration of a few steps, so the GPU can find Wien's peak itself and be graded on it. The keys the
// shader is never handed: x_lambda = 4.965114231744276 and x_nu = 2.8214393721220787 (the module's f64 Newton,
// held by physics/thermal/blackbody-selfcheck.mjs to 1e-12), which the f32 device reaches to a few 1e-6; and the
// picture's brightest column on the row n = 5 sits on x_lambda -- Wien's law read off a framebuffer.
"use strict";

import { planckShape, wienRootNewton, wienResidual, wienConstant, stefanBoltzmannSigma } from "../physics/thermal/blackbody.mjs";

export { planckShape, wienRootNewton, wienConstant, stefanBoltzmannSigma };
export const PLANCK_FN_WGSL = `
fn planckShape(x: f32, n: f32) -> f32 {
  if (x <= 0.0) { return 0.0; }
  if (x < 1e-3) { return pow(x, n - 1.0); }       // x^n / (e^x - 1) -> x^(n-1) as x -> 0, where f32's e^x - 1 loses its digits
  return pow(x, n) / (exp(x) - 1.0);
}
fn wienRoot(n: f32) -> f32 {
  var x = n;                                        // the root sits just below n
  for (var i = 0; i < 24; i = i + 1) { let em = exp(-x); let f = x - n * (1.0 - em); let df = 1.0 - n * em; x = x - f / df; }
  return x;
}
fn wienResidual(x: f32, n: f32) -> f32 { return x - n * (1.0 - exp(-x)); }
`;
const PLANCK_FN_GLSL = `
float planckShape(float x, float n) {
  if (x <= 0.0) return 0.0;
  if (x < 1e-3) return pow(x, n - 1.0);
  return pow(x, n) / (exp(x) - 1.0);
}
float wienRoot(float n) {
  float x = n;
  for (int i = 0; i < 24; i++) { float em = exp(-x); float f = x - n * (1.0 - em); float df = 1.0 - n * em; x = x - f / df; }
  return x;
}
`;
/** Uniforms: xLo, xHi, n, count, mode (0 = the shape on a linear grid in x; 1 = the key: root, residual, shape at the root), pad x3. */
export const PROBE_UNIFORM_FLOATS = 8;
export function packProbeUniforms({ xLo, xHi, n, count, mode = 0 }) { return new Float32Array([xLo, xHi, n, count, mode, 0, 0, 0]); }
/** The probe: invocation i is an x on the grid (mode 0), or in mode 1 the three key numbers in outv[0..2]. */
export function blackbodyProbeWgsl() {
    return `${PLANCK_FN_WGSL}
struct Knobs { xLo: f32, xHi: f32, n: f32, count: f32, mode: f32, p0: f32, p1: f32, p2: f32 };
@group(0) @binding(0) var<storage, read_write> outv: array<f32>;
@group(0) @binding(1) var<uniform> knobs: Knobs;

@compute @workgroup_size(64) fn probe(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  let n = u32(knobs.count);
  if (i >= n) { return; }
  if (knobs.mode > 0.5) {
    if (i == 0u) { outv[0] = wienRoot(knobs.n); }
    if (i == 1u) { outv[1] = wienResidual(wienRoot(knobs.n), knobs.n); }
    if (i == 2u) { outv[2] = planckShape(wienRoot(knobs.n), knobs.n); }
    if (i > 2u) { outv[i] = 0.0; }
    return;
  }
  let u = (f32(i) + 0.5) / f32(n);
  let x = knobs.xLo + (knobs.xHi - knobs.xLo) * u;
  outv[i] = planckShape(x, knobs.n);
}
`;
}
/** The twin, in f32 in the shader's order (mode 0: the grid; mode 1: root, residual, shape at the root). */
export function probeCpu({ xLo, xHi, n, count, mode = 0 }) {
    const f = Math.fround, out = new Float32Array(count);
    const shape = (x) => { if (x <= 0) return 0; if (x < 1e-3) return f(Math.pow(x, f(n - 1))); return f(f(Math.pow(x, n)) / f(f(Math.exp(x)) - 1)); };
    const root = () => { let x = f(n); for (let i = 0; i < 24; i++) { const em = f(Math.exp(-x)); const fx = f(x - f(n * f(1 - em))); const df = f(1 - f(n * em)); x = f(x - f(fx / df)); } return x; };
    if (mode) { const r = root(); out[0] = r; out[1] = f(r - f(n * f(1 - f(Math.exp(-r))))); out[2] = shape(r); return out; }
    for (let i = 0; i < count; i++) { const u = f(f(i + 0.5) / count); out[i] = shape(f(xLo + f(f(xHi - xLo) * u))); }
    return out;
}
/** The CPU's own numbers for the key, from the module the gate trusts (f64). */
export function keyCpu() { return { xLambda: wienRootNewton(5), xNu: wienRootNewton(3), residualLambda: wienResidual(wienRootNewton(5), 5), peakLambda: planckShape(wienRootNewton(5), 5), peakNu: planckShape(wienRootNewton(3), 3), b: wienConstant(), sigma: stefanBoltzmannSigma() }; }

// ---- the key on both backends: a full-screen picture, x across, n down; raw mode encodes shape / peak in 16 bits ----
export const KEY_UNIFORMS = Object.freeze([{ name: "knobs", type: "vec4" }, { name: "range", type: "vec4" }]);
export const BLACKBODY_KEY_WGSL = `
struct Cam { knobs: vec4<f32>, range: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
${PLANCK_FN_WGSL}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@location(0) p: vec3<f32>) -> VOut {
  var o: VOut;
  o.pos = vec4<f32>(p.xy, 0.0, 1.0);
  o.uv = vec2<f32>(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let x = cam.knobs.x + (cam.knobs.y - cam.knobs.x) * v.uv.x;
  let n = cam.knobs.z + (cam.knobs.w - cam.knobs.z) * v.uv.y;
  let s = planckShape(x, n) / planckShape(wienRoot(n), n);    // 1 at Wien's peak, by the device's own root
  if (cam.range.x > 0.5) {
    let e = clamp(s, 0.0, 1.0);
    return vec4<f32>(floor(e * 255.0) / 255.0, fract(e * 255.0), 0.0, 1.0);
  }
  let warm = vec3<f32>(1.0, 0.62, 0.25); let cold = vec3<f32>(0.05, 0.04, 0.12);
  return vec4<f32>(mix(cold, warm, clamp(s, 0.0, 1.0)), 1.0);
}
`;
export const BLACKBODY_KEY_VERTEX_GLSL = `#version 300 es
precision highp float;
in vec3 p; out vec2 vUv;
void main() { gl_Position = vec4(p.xy, 0.0, 1.0); vUv = vec2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5); }
`;
export const BLACKBODY_KEY_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform vec4 knobs; uniform vec4 range;
in vec2 vUv; out vec4 fragColor;
${PLANCK_FN_GLSL}
void main() {
  float x = knobs.x + (knobs.y - knobs.x) * vUv.x;
  float n = knobs.z + (knobs.w - knobs.z) * vUv.y;
  float s = planckShape(x, n) / planckShape(wienRoot(n), n);
  if (range.x > 0.5) { float e = clamp(s, 0.0, 1.0); fragColor = vec4(floor(e * 255.0) / 255.0, fract(e * 255.0), 0.0, 1.0); return; }
  vec3 warm = vec3(1.0, 0.62, 0.25); vec3 cold = vec3(0.05, 0.04, 0.12);
  fragColor = vec4(mix(cold, warm, clamp(s, 0.0, 1.0)), 1.0);
}
`;
/** The key pipeline: a full-screen quad, no depth, the two vec4 uniforms. */
export function keyPipelineDesc() {
    return { shaders: { wgsl: BLACKBODY_KEY_WGSL, glsl: { vertex: BLACKBODY_KEY_VERTEX_GLSL, fragment: BLACKBODY_KEY_FRAGMENT_GLSL } }, vs: "vs", fs: "fs",
             buffers: [{ stride: 12, stepMode: "vertex", attributes: [{ name: "p", size: 3, offset: 0, location: 0 }] }], uniforms: KEY_UNIFORMS, depthWrite: false, depthCompare: "always" };
}
export const QUAD = Float32Array.from([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]);
export const DEFAULTS = Object.freeze({ xLo: 0, xHi: 12, nLo: 2, nHi: 6 });
/** Decode one raw pixel back to shape / peak in [0, 1]. */
export function decodeKey(px, i) { return (px[i] + px[i + 1] / 255) / 255; }
/**
 * Draw the key and read every row's brightest column: { rows: [{ n, peakX, peak }], width, height, pixels }. With
 * `n` fixed (nLo = nHi = n) every row is the same spectrum and peakX is the device's Wien root, to a column.
 */
export async function readKey(device, { n = null, xLo = DEFAULTS.xLo, xHi = DEFAULTS.xHi, nLo = DEFAULTS.nLo, nHi = DEFAULTS.nHi, raw = true } = {}) {
    const pipe = device.pipeline(keyPipelineDesc()), vb = device.buffer({ data: QUAD, usage: "vertex" });
    const lo = n == null ? nLo : n, hi = n == null ? nHi : n;
    const fr = await device.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe); pass.uniform("knobs", [xLo, xHi, lo, hi]); pass.uniform("range", [raw ? 1 : 0, 0, 0, 0]); pass.vertices(vb, 0); pass.draw(6); }, { read: true, depth: false });
    try { vb.destroy(); } catch (e) {}
    if (!fr || !fr.pixels) return null;
    const W = fr.width, H = fr.height, rows = [];
    for (let y = 0; y < H; y++) { let best = -1, bx = 0; for (let x = 0; x < W; x++) { const v = raw ? decodeKey(fr.pixels, (y * W + x) * 4) : fr.pixels[(y * W + x) * 4] / 255; if (v > best) { best = v; bx = x; } }
        // the readback's row 0 is the top of the picture, which is uv.y = 1 (the quad's +y): n runs from nHi at row 0 down to nLo
        const nv = hi - (hi - lo) * ((y + 0.5) / H);
        rows.push({ n: nv, peakX: xLo + (xHi - xLo) * ((bx + 0.5) / W), peak: best, col: bx }); }
    return { rows, width: W, height: H, binWidth: (xHi - xLo) / W, pixels: fr.pixels };
}

// v4468 -- the probe manifest (docs/GPU-KERNEL-CONTRACT.md): the corpus's grid at n = 5, the f32 twin, 1e-5 RELATIVE
// (the shape peaks near 21 at n = 5, and exp and pow are the device's).
export const PROBES = Object.freeze([Object.freeze({
    id: "blackbodyWgsl.blackbodyProbeWgsl", code: () => blackbodyProbeWgsl(), entryPoint: "probe",
    args: Object.freeze({ xLo: 0, xHi: 12, n: 5, count: 2048 }),
    pack: packProbeUniforms, cpu: probeCpu, outCount: 2048, workgroups: 32, rel: 1e-5,
    key: () => keyCpu(),
})]);
