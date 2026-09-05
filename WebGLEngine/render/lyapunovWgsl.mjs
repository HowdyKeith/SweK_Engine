// WebGLEngine/render/lyapunovWgsl.mjs -- v4315
//
// swk_lyapunov AT LEVEL 11: the one shader in render/swiftShaderPass.js that is ours rather than a port, given
// the treatment the GPU-driven path gives everything -- a WGSL twin beside the GLSL, a pipeline on gfx/device.js
// that draws on WebGPU and WebGL2 from the same descriptor, and a gate that reads the answer back off both.
//
// The model: every pixel iterates the logistic map x <- r x (1 - x) for itself and shows the LYAPUNOV EXPONENT of
// its orbit, the mean of ln|r (1 - 2x)| -- positive where the map is chaotic, negative in the periodic windows.
// At r = 4 the exponent is exactly ln 2 (physics/chaos/logistic.js records it), a number the fragment is never
// handed: r arrives as a coordinate. That is the external key, and the reason this is the shader to bring across
// first -- a WGSL port can be wrong in a way a diff against its own GLSL would never show, and ln 2 shows it.
//
// Three shapes of the same arithmetic:
//   lyapunovProbeWgsl()   a compute pass (one f32 per invocation, uniforms at binding 1) -- the corpus's shape,
//                         so tools/ship/wgslCorpus.mjs runs it native and in the browser and the crossBackend gate
//                         compares them element for element
//   LYAPUNOV_KEY_WGSL     a full-screen quad writing the exponent in 16 bits across two channels (the raw mode of
//                         the SwiftUI shader, byte for byte) -- what a gate decodes on either backend
//   LYAPUNOV_LOOK_WGSL    a fleet look (render/fleets.mjs): the hull's own coordinates are r and the seed, so a
//                         ship carries its bifurcation diagram, and the shade is the exponent
// and the CPU twin, lyapunovCpu(), in the same f32 arithmetic in the same order as render/swiftShaderModel.mjs.
"use strict";

import { LN2 } from "../physics/chaos/logistic.js";

export { LN2 };
export const DEFAULTS = Object.freeze({ rLo: 3.4, rHi: 4.0, samples: 384, warmup: 64, seedLo: 0.05, seedHi: 0.95 });
/** The period-3 window, r = 1 + sqrt(8) to about 3.857: the widest dark band, where lambda < 0 inside chaos. */
export const PERIOD3 = Object.freeze({ lo: 1 + Math.sqrt(8), hi: 3.857 });

/** The exponent of one orbit, as the WGSL function every shape here splices in. `n` samples after `warm` warmup steps. */
export const LYAPUNOV_FN_WGSL = `
fn lyapunov(r: f32, x0: f32, warm: u32, n: u32) -> f32 {
  var x = x0;
  for (var i = 0u; i < warm; i = i + 1u) { x = r * x * (1.0 - x); }
  var acc = 0.0;
  for (var i = 0u; i < n; i = i + 1u) {
    acc = acc + log(abs(r * (1.0 - 2.0 * x)));
    x = r * x * (1.0 - x);
  }
  return acc / f32(n);
}
`;
const LYAPUNOV_FN_GLSL = `
float lyapunov(float r, float x0, int warm, int n) {
  float x = x0;
  for (int i = 0; i < warm; i++) x = r * x * (1.0 - x);
  float acc = 0.0;
  for (int i = 0; i < n; i++) { acc += log(abs(r * (1.0 - 2.0 * x))); x = r * x * (1.0 - x); }
  return acc / float(n);
}
`;

/** The probe: invocation i sweeps r across [rLo, rHi] and the seed across [seedLo, seedHi] on a cols x rows grid. */
/**
 * v4331 -- THE HAND-WRITTEN COMPUTE TWIN, in the shell a transplant lands in. One invocation per r, the module's own
 * lyapunov() above, the counts passed in because the generated pass BAKES them (a TSL Loop bound is a constant) and a
 * twin that read them from a uniform would be a different program, not the same one written by hand.
 */
export function lyapunovComputeWgsl({ prefix, uniformVar = "u", storage = "out", workgroupSize = 64, warmup, samples }) {
    return `${prefix}
${LYAPUNOV_FN_WGSL}
@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (f32(i) >= ${uniformVar}.span.z) { return; }
  let t = f32(i) / (${uniformVar}.span.z - 1.0);
  let r = ${uniformVar}.span.x + (${uniformVar}.span.y - ${uniformVar}.span.x) * t;
  ${storage}.value[i] = lyapunov(r, ${uniformVar}.span.w, ${warmup}u, ${samples}u);
}
`;
}

export const PROBE_UNIFORM_FLOATS = 8;
export function packProbeUniforms({ rLo, rHi, samples, warmup, seedLo, seedHi, cols, rows }) {
    return new Float32Array([rLo, rHi, samples, warmup, seedLo, seedHi, cols, rows]);
}
export function lyapunovProbeWgsl() {
    return `${LYAPUNOV_FN_WGSL}
struct Knobs { rLo: f32, rHi: f32, samples: f32, warmup: f32, seedLo: f32, seedHi: f32, cols: f32, rows: f32 };
@group(0) @binding(0) var<storage, read_write> outv: array<f32>;
@group(0) @binding(1) var<uniform> knobs: Knobs;

@compute @workgroup_size(64) fn probe(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  let cols = u32(knobs.cols); let rows = u32(knobs.rows);
  if (i >= cols * rows) { return; }
  let cx = i % cols; let cy = i / cols;
  let r = knobs.rLo + (knobs.rHi - knobs.rLo) * ((f32(cx) + 0.5) / f32(cols));
  let x0 = knobs.seedLo + (knobs.seedHi - knobs.seedLo) * ((f32(cy) + 0.5) / f32(rows));
  outv[i] = lyapunov(r, x0, u32(knobs.warmup), u32(knobs.samples));
}
`;
}
/** The twin of the probe, in f32 in the same order: one value per grid cell. */
export function lyapunovCpu(r, x0, { samples = DEFAULTS.samples, warmup = DEFAULTS.warmup } = {}) {
    const f = Math.fround; let x = f(x0); r = f(r);
    for (let k = 0; k < warmup; k++) x = f(r * x * f(1 - x));
    let acc = 0;
    for (let k = 0; k < samples; k++) { acc = f(acc + f(Math.log(Math.abs(f(r * f(1 - 2 * x)))))); x = f(r * x * f(1 - x)); }
    return f(acc / samples);
}
export function probeCpu({ rLo, rHi, samples, warmup, seedLo, seedHi, cols, rows }) {
    const f = Math.fround, out = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) { const cx = i % cols, cy = Math.floor(i / cols);
        const r = f(rLo + f(f(rHi - rLo) * f(f(cx + 0.5) / cols))), x0 = f(seedLo + f(f(seedHi - seedLo) * f(f(cy + 0.5) / rows)));
        out[i] = lyapunovCpu(r, x0, { samples, warmup }); }
    return out;
}

// ---- the key: a full-screen picture of the exponent, 16 bits across two channels, on either backend ----------------
/** Uniforms as the pipeline lists them: rLo, rHi, samples, warmup, seedLo, seedHi, raw, pad. */
export const KEY_UNIFORMS = Object.freeze([{ name: "knobs", type: "vec4" }, { name: "seeds", type: "vec4" }]);
export const LYAPUNOV_KEY_WGSL = `
struct Cam { knobs: vec4<f32>, seeds: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
${LYAPUNOV_FN_WGSL}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@location(0) p: vec3<f32>) -> VOut {
  var o: VOut;
  o.pos = vec4<f32>(p.xy, 0.0, 1.0);
  o.uv = vec2<f32>(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let r = cam.knobs.x + (cam.knobs.y - cam.knobs.x) * v.uv.x;
  let x0 = cam.seeds.x + (cam.seeds.y - cam.seeds.x) * v.uv.y;
  let lam = lyapunov(r, x0, u32(cam.knobs.w), u32(cam.knobs.z));
  if (cam.seeds.z > 0.5) {
    let e = clamp((lam + 3.0) / 4.0, 0.0, 1.0);
    return vec4<f32>(floor(e * 255.0) / 255.0, fract(e * 255.0), 0.0, 1.0);
  }
  let chaos = clamp(lam / ${LN2}, -1.0, 1.0);
  let hot = vec3<f32>(0.35, 0.95, 0.85); let cold = vec3<f32>(0.08, 0.06, 0.2);
  return vec4<f32>(mix(cold, hot, max(chaos, 0.0)), 1.0);
}
`;
export const LYAPUNOV_KEY_VERTEX_GLSL = `#version 300 es
precision highp float;
in vec3 p; out vec2 vUv;
void main() { gl_Position = vec4(p.xy, 0.0, 1.0); vUv = vec2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5); }
`;
export const LYAPUNOV_KEY_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform vec4 knobs; uniform vec4 seeds;
in vec2 vUv; out vec4 fragColor;
${LYAPUNOV_FN_GLSL}
void main() {
  float r = knobs.x + (knobs.y - knobs.x) * vUv.x;
  float x0 = seeds.x + (seeds.y - seeds.x) * vUv.y;
  float lam = lyapunov(r, x0, int(knobs.w), int(knobs.z));
  if (seeds.z > 0.5) { float e = clamp((lam + 3.0) / 4.0, 0.0, 1.0); fragColor = vec4(floor(e * 255.0) / 255.0, fract(e * 255.0), 0.0, 1.0); return; }
  float chaos = clamp(lam / ${LN2}, -1.0, 1.0);
  vec3 hot = vec3(0.35, 0.95, 0.85); vec3 cold = vec3(0.08, 0.06, 0.2);
  fragColor = vec4(mix(cold, hot, max(chaos, 0.0)), 1.0);
}
`;
/** The key pipeline: a full-screen quad, no depth, the two vec4 uniforms. */
export function keyPipelineDesc() {
    return { shaders: { wgsl: LYAPUNOV_KEY_WGSL, glsl: { vertex: LYAPUNOV_KEY_VERTEX_GLSL, fragment: LYAPUNOV_KEY_FRAGMENT_GLSL } }, vs: "vs", fs: "fs",
             buffers: [{ stride: 12, stepMode: "vertex", attributes: [{ name: "p", size: 3, offset: 0, location: 0 }] }], uniforms: KEY_UNIFORMS, depthWrite: false, depthCompare: "always" };
}
export const QUAD = Float32Array.from([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]);
/** Decode one raw pixel back to the exponent: the two-channel encoding, undone. */
export function decodeKey(px, i) { return ((px[i] + px[i + 1] / 255) / 255) * 4 - 3; }
/**
 * Draw the key on a device and read the exponent at every pixel. `r` fixed (rLo = rHi = r) makes every pixel the
 * key; the default sweep draws the bifurcation picture. Returns { lams: Float32Array, width, height, median }.
 */
export async function readKey(device, { r = null, rLo = DEFAULTS.rLo, rHi = DEFAULTS.rHi, samples = DEFAULTS.samples, warmup = DEFAULTS.warmup, seedLo = DEFAULTS.seedLo, seedHi = DEFAULTS.seedHi, raw = true } = {}) {
    const pipe = device.pipeline(keyPipelineDesc()), vb = device.buffer({ data: QUAD, usage: "vertex" });
    const lo = r == null ? rLo : r, hi = r == null ? rHi : r;
    const fr = await device.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe); pass.uniform("knobs", [lo, hi, samples, warmup]); pass.uniform("seeds", [seedLo, seedHi, raw ? 1 : 0, 0]); pass.vertices(vb, 0); pass.draw(6); }, { read: true, depth: false });
    try { vb.destroy(); } catch (e) {}
    if (!fr || !fr.pixels) return null;
    const n = fr.width * fr.height, lams = new Float32Array(n);
    for (let i = 0; i < n; i++) lams[i] = raw ? decodeKey(fr.pixels, i * 4) : NaN;
    const sorted = Array.from(lams).sort((a, b) => a - b);
    return { lams, width: fr.width, height: fr.height, median: sorted[n >> 1], pixels: fr.pixels };
}

// ---- the look: a race whose hull is its own bifurcation diagram ----------------------------------------------------
/**
 * The fleet look (render/fleets.mjs LOOKS.lyapunov): the hull's UNSPUN local x is r across [rLo, rHi] and its local
 * y the seed, so the diagram is painted on the ship and turns with it; the shade is the exponent, lit a little by
 * the normal so the hull still reads as a solid. `chaos` = (rLo, rHi, samples, warmup); `light` as the lit look.
 */
export const LYAPUNOV_LOOK_WGSL = `
struct Cam { viewProj: mat4x4<f32>, light: vec4<f32>, chaos: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
${LYAPUNOV_FN_WGSL}
fn turned(p: vec3<f32>, yaw: f32) -> vec3<f32> {
  let ca = cos(yaw); let sa = sin(yaw);
  return vec3<f32>(p.x * ca - p.y * sa, p.x * sa + p.y * ca, p.z);
}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) n: vec3<f32>, @location(2) local: vec2<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(5) extra: vec4<f32>, @location(4) n: vec3<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + turned(p, extra.x) * rec.w, 1.0);
  o.color = color; o.n = turned(n, extra.x); o.local = p.xy;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let r = cam.chaos.x + (cam.chaos.y - cam.chaos.x) * clamp(v.local.x * 0.5 + 0.5, 0.0, 1.0);
  let x0 = 0.05 + 0.9 * clamp(v.local.y * 0.5 + 0.5, 0.0, 1.0);
  let lam = lyapunov(r, x0, u32(cam.chaos.w), u32(cam.chaos.z));
  let chaos = clamp(lam / ${LN2}, -1.0, 1.0);
  let l = max(dot(normalize(v.n), normalize(cam.light.xyz)), 0.0);
  let shade = cam.light.w + (1.0 - cam.light.w) * l;
  let hot = vec3<f32>(0.35, 0.95, 0.85); let cold = vec3<f32>(0.08, 0.06, 0.2);
  return vec4<f32>(mix(cold, hot, max(chaos, 0.0)) * shade * v.color.rgb, v.color.a);
}
`;
export const LYAPUNOV_LOOK_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj; uniform vec4 light; uniform vec4 chaos;
in vec3 p; in vec4 color; in vec4 rec; in vec4 ident; in vec4 extra; in vec3 n;
out vec4 vColor; out vec3 vN; out vec2 vLocal;
vec3 turned(vec3 q, float yaw) { float ca = cos(yaw), sa = sin(yaw); return vec3(q.x * ca - q.y * sa, q.x * sa + q.y * ca, q.z); }
void main() { gl_Position = viewProj * vec4(rec.xyz + turned(p, extra.x) * rec.w, 1.0); vColor = color; vN = turned(n, extra.x); vLocal = p.xy; }
`;
export const LYAPUNOV_LOOK_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform vec4 light; uniform vec4 chaos;
in vec4 vColor; in vec3 vN; in vec2 vLocal; out vec4 fragColor;
${LYAPUNOV_FN_GLSL}
void main() {
  float r = chaos.x + (chaos.y - chaos.x) * clamp(vLocal.x * 0.5 + 0.5, 0.0, 1.0);
  float x0 = 0.05 + 0.9 * clamp(vLocal.y * 0.5 + 0.5, 0.0, 1.0);
  float lam = lyapunov(r, x0, int(chaos.w), int(chaos.z));
  float c = clamp(lam / ${LN2}, -1.0, 1.0);
  float l = max(dot(normalize(vN), normalize(light.xyz)), 0.0);
  float shade = light.w + (1.0 - light.w) * l;
  vec3 hot = vec3(0.35, 0.95, 0.85); vec3 cold = vec3(0.08, 0.06, 0.2);
  fragColor = vec4(mix(cold, hot, max(c, 0.0)) * shade * vColor.rgb, vColor.a);
}
`;
/** The look's uniforms and the knobs a fleet binds: fewer samples than the key, because a hull is drawn every frame. */
export const LOOK_UNIFORMS = Object.freeze([{ name: "viewProj", type: "mat4" }, { name: "light", type: "vec4" }, { name: "chaos", type: "vec4" }]);
export const LOOK_KNOBS = Object.freeze([DEFAULTS.rLo, DEFAULTS.rHi, 96, 32]);

// v4468 -- THE PROBE MANIFEST (docs/GPU-KERNEL-CONTRACT.md): what a lab-wide gate needs to run this kernel and grade
// it, by name. This module is the TEMPLATE the contract points at. A chaotic map is not compared element by element,
// so the entry names the gate that grades it by column medians instead of a tolerance.
export const PROBES = Object.freeze([Object.freeze({
    id: "lyapunovWgsl.lyapunovProbeWgsl", code: () => lyapunovProbeWgsl(), entryPoint: "probe",
    args: Object.freeze({ rLo: 3.4, rHi: 4.0, samples: 384, warmup: 64, seedLo: 0.05, seedHi: 0.95, cols: 64, rows: 32 }),
    pack: packProbeUniforms, cpu: probeCpu, outCount: 2048, workgroups: 32,
    graded: "tools/ship/physicsShaders-selfcheck.mjs -- column medians to 3e-2; the logistic map at r near 4 is chaotic, so element-for-element is not a claim",
    key: () => ({ ln2: LN2, atR4: lyapunovCpu(4, 0.3, { samples: 4096, warmup: 256 }) }),
})]);
