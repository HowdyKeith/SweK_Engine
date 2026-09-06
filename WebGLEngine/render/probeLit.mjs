// WebGLEngine/render/probeLit.mjs -- v4514 (Probes 1: the device-side sampler)
//
// *** A MESH LIT BY THE PROBE VOLUME, ON BOTH BACKENDS. *** render/splatProbes.mjs (v4513) bakes an order-2 SH irradiance
// volume and packs it as seven RGBA planes; nothing drew with it. This module carries the volume onto gfx/device.js and
// evaluates it per fragment in both shader languages, held to splatProbes' shadeAt by tools/ship/probeLit-selfcheck.mjs.
//
// THE TEXTURE. gfx/device.js has 2D textures and no 3D ones, so the volume travels as ONE 2D ATLAS: width nx, height
// 7 * nz * ny, rgba16float, read by integer texel (textureLoad / texelFetch -- the v4500 finding: the two backends'
// samplers disagree on addressing, integer reads do not). The row of texel (x, y, z) on plane p is (p * nz + z) * ny + y,
// which is exactly the order packProbes lays its floats in, so the upload is the packed array converted to halves and
// nothing is reordered. The halves are the precision the tree's device formats offer for a float texture (rgba16float;
// there is no rgba32float in TEXTURE_FORMATS): a coefficient of 3.5 carries a half-ULP of 0.002, under a 255th on the
// pixel, and the CPU twin reads the SAME halves (halfGrid), so the hold is exact up to the trilinear arithmetic.
//
// THE FRAGMENT. For a world point w with normal n: the grid coordinate (w - min) / step clamped to [0, counts - 1],
// the eight surrounding probes read (seven texels each, 56 reads), weighted trilinearly, the 27 coefficients summed;
// then irradiance E(n) = sum_s coef_s * lobe_s * Y_s(n) with the clamped-cosine lobe factors (pi, 2 pi / 3, pi / 4) and
// the colour is tint * E / pi -- splatProbes.shadeAt, in the same order. No point light: the probes ARE the light. The
// vertex stage, the LAYOUTS.lit slots, the tint chain and the extras are litSphere's, so any lit fleet can switch.
//
// probeAtlas(packed)              -> { width, height, data: Uint16Array of halves }
// uploadProbes(device, packed)    -> the device texture (rgba16float, nearest)
// halfGrid(packed)                -> the grid splatProbes.sampleProbes / shadeAt read, from the SAME halves the texture holds
// probeLitPipelineDesc({ tints }) -> the pipeline over LAYOUTS.lit, uniforms viewProj + probeMin + probeStep + probeCounts
// probeBind(packed, tex)          -> the bind hook for makeGpuDrivenScene: the three vec4s and the atlas each draw
"use strict";
import { LAYOUTS, renderPipelineDesc } from "./gpuDriven.mjs";
import { litVertexGlsl, MAX_TINTS } from "./litSphere.mjs";
import { toHalf, fromHalf } from "../text/slugAtlas.js";
import { unpackProbes, PLANES } from "./splatProbes.mjs";

const f6 = (v) => (Number.isFinite(v) ? v : 0).toFixed(6);
function tintChain(tints, lang) {
    const T = tints || [];
    if (T.length > MAX_TINTS) throw new Error(`probeLit: ${T.length} tints; the chain carries at most ${MAX_TINTS}, by name`);
    const vec = lang === "wgsl" ? "vec3<f32>" : "vec3";
    return T.map((t, i) => `  if (i == ${i + 1}) { return ${vec}(${f6(t[0])}, ${f6(t[1])}, ${f6(t[2])}); }`).join("\n");
}

/** the packed planes as one 2D half-float atlas: width nx, height PLANES * nz * ny, row (p * nz + z) * ny + y */
export function probeAtlas(packed) {
    const [nx, ny, nz] = packed.counts, width = nx, height = PLANES * nz * ny, data = new Uint16Array(width * height * 4);
    if (packed.data.length !== data.length) throw new Error(`probeLit: packed data has ${packed.data.length} floats; ${PLANES} planes of ${nx} x ${ny} x ${nz} need ${data.length}`);
    for (let i = 0; i < data.length; i++) data[i] = toHalf(packed.data[i]);
    return { width, height, data };
}
export function uploadProbes(device, packed) {
    const a = probeAtlas(packed);
    return device.texture({ format: "rgba16float", width: a.width, height: a.height, data: a.data, nearest: true });
}
/** the grid the CPU twin reads: the same halves the texture holds, unpacked */
export function halfGrid(packed) {
    const a = probeAtlas(packed), data = new Float32Array(a.data.length);
    for (let i = 0; i < data.length; i++) data[i] = fromHalf(a.data[i]);
    return unpackProbes({ ...packed, data });
}

/** the SH evaluation, shared text: coef c[0..8] (vec3), normal n -> E(n) / pi */
const WGSL_EVAL = `
fn probeRow(p: i32, x: i32, y: i32, z: i32, nz: i32, ny: i32) -> vec2<i32> { return vec2<i32>(x, (p * nz + z) * ny + y); }
fn probeIrradiance(w: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
  let counts = vec3<i32>(cam.probeCounts.xyz);
  var t = (w - cam.probeMin.xyz) / max(cam.probeStep.xyz, vec3<f32>(1e-9));
  t = clamp(t, vec3<f32>(0.0), vec3<f32>(counts) - vec3<f32>(1.0));
  let i0 = min(vec3<i32>(floor(t)), counts - vec3<i32>(2));
  let f = t - vec3<f32>(i0);
  var c: array<vec3<f32>, 9>;
  for (var s = 0; s < 9; s++) { c[s] = vec3<f32>(0.0); }
  for (var dz = 0; dz < 2; dz++) { for (var dy = 0; dy < 2; dy++) { for (var dx = 0; dx < 2; dx++) {
    let wgt = select(1.0 - f.x, f.x, dx == 1) * select(1.0 - f.y, f.y, dy == 1) * select(1.0 - f.z, f.z, dz == 1);
    if (wgt == 0.0) { continue; }
    let x = i0.x + dx; let y = i0.y + dy; let z = i0.z + dz;
    var v: array<f32, 28>;
    for (var p = 0; p < 7; p++) { let q = textureLoad(tProbes, probeRow(p, x, y, z, counts.z, counts.y), 0); v[p * 4] = q.x; v[p * 4 + 1] = q.y; v[p * 4 + 2] = q.z; v[p * 4 + 3] = q.w; }
    for (var s = 0; s < 9; s++) { c[s] += wgt * vec3<f32>(v[s * 3], v[s * 3 + 1], v[s * 3 + 2]); }
  } } }
  let d = normalize(n);
  let c0 = 0.28209479177387814; let c1 = 0.4886025119029199;
  let A0 = 3.141592653589793; let A1 = 2.0943951023931953; let A2 = 0.7853981633974483;
  var e = c[0] * (A0 * c0);
  e += c[1] * (A1 * -c1 * d.y) + c[2] * (A1 * c1 * d.z) + c[3] * (A1 * -c1 * d.x);
  e += c[4] * (A2 * 1.0925484305920792 * d.x * d.y) + c[5] * (A2 * -1.0925484305920792 * d.y * d.z) + c[6] * (A2 * 0.31539156525252005 * (3.0 * d.z * d.z - 1.0));
  e += c[7] * (A2 * -1.0925484305920792 * d.x * d.z) + c[8] * (A2 * 0.5462742152960396 * (d.x * d.x - d.y * d.y));
  return max(e / 3.141592653589793, vec3<f32>(0.0));
}`;
const GLSL_EVAL = `
ivec2 probeRow(int p, int x, int y, int z, int nz, int ny) { return ivec2(x, (p * nz + z) * ny + y); }
vec3 probeIrradiance(vec3 w, vec3 n) {
  ivec3 counts = ivec3(probeCounts.xyz);
  vec3 t = (w - probeMin.xyz) / max(probeStep.xyz, vec3(1e-9));
  t = clamp(t, vec3(0.0), vec3(counts) - vec3(1.0));
  ivec3 i0 = min(ivec3(floor(t)), counts - ivec3(2));
  vec3 f = t - vec3(i0);
  vec3 c[9];
  for (int s = 0; s < 9; s++) { c[s] = vec3(0.0); }
  for (int dz = 0; dz < 2; dz++) { for (int dy = 0; dy < 2; dy++) { for (int dx = 0; dx < 2; dx++) {
    float wgt = (dx == 1 ? f.x : 1.0 - f.x) * (dy == 1 ? f.y : 1.0 - f.y) * (dz == 1 ? f.z : 1.0 - f.z);
    if (wgt == 0.0) continue;
    int x = i0.x + dx; int y = i0.y + dy; int z = i0.z + dz;
    float v[28];
    for (int p = 0; p < 7; p++) { vec4 q = texelFetch(tProbes, probeRow(p, x, y, z, counts.z, counts.y), 0); v[p * 4] = q.x; v[p * 4 + 1] = q.y; v[p * 4 + 2] = q.z; v[p * 4 + 3] = q.w; }
    for (int s = 0; s < 9; s++) { c[s] += wgt * vec3(v[s * 3], v[s * 3 + 1], v[s * 3 + 2]); }
  } } }
  vec3 d = normalize(n);
  const float c0 = 0.28209479177387814; const float c1 = 0.4886025119029199;
  const float A0 = 3.141592653589793; const float A1 = 2.0943951023931953; const float A2 = 0.7853981633974483;
  vec3 e = c[0] * (A0 * c0);
  e += c[1] * (A1 * -c1 * d.y) + c[2] * (A1 * c1 * d.z) + c[3] * (A1 * -c1 * d.x);
  e += c[4] * (A2 * 1.0925484305920792 * d.x * d.y) + c[5] * (A2 * -1.0925484305920792 * d.y * d.z) + c[6] * (A2 * 0.31539156525252005 * (3.0 * d.z * d.z - 1.0));
  e += c[7] * (A2 * -1.0925484305920792 * d.x * d.z) + c[8] * (A2 * 0.5462742152960396 * (d.x * d.x - d.y * d.y));
  return max(e / 3.141592653589793, vec3(0.0));
}`;

export function probeLitWgsl(tints = null) {
    return `
struct Cam { viewProj: mat4x4<f32>, probeMin: vec4<f32>, probeStep: vec4<f32>, probeCounts: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var tProbes: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) n: vec3<f32>, @location(2) w: vec3<f32>, @location(3) @interpolate(flat) tint: i32 };
fn tintOf(i: i32, own: vec3<f32>) -> vec3<f32> {
${tintChain(tints, "wgsl")}
  return own;
}
${WGSL_EVAL}
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(4) n: vec3<f32>, @location(5) extra: vec4<f32>) -> VOut {
  var o: VOut;
  let w = rec.xyz + p * rec.w;
  o.pos = cam.viewProj * vec4<f32>(w, 1.0);
  o.color = color;
  o.n = n;
  o.w = w;
  o.tint = i32(extra.y + 0.5);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  return vec4<f32>(tintOf(v.tint, v.color.rgb) * probeIrradiance(v.w, v.n), v.color.a);
}
`;
}
export function probeLitFragmentGlsl(tints = null) {
    return `#version 300 es
precision highp float;
uniform vec4 probeMin; uniform vec4 probeStep; uniform vec4 probeCounts;
uniform sampler2D tProbes;
in vec4 vColor; in vec3 vN; in vec3 vW; flat in float vE; flat in int vT; out vec4 fragColor;
vec3 tintOf(int i, vec3 own) {
${tintChain(tints, "glsl")}
  return own;
}
${GLSL_EVAL}
void main() {
  fragColor = vec4(tintOf(vT, vColor.rgb) * probeIrradiance(vW, vN), vColor.a);
}
`;
}
export const PROBE_LIT_WGSL = probeLitWgsl(null);
export const PROBE_LIT_VERTEX_GLSL = litVertexGlsl();
export const PROBE_LIT_FRAGMENT_GLSL = probeLitFragmentGlsl(null);

export function probeLitPipelineDesc({ cull = null, frontFace = null, blend = null, tints = null } = {}) {
    return renderPipelineDesc({
        layout: LAYOUTS.lit,
        shaders: { wgsl: probeLitWgsl(tints), glsl: { vertex: litVertexGlsl(), fragment: probeLitFragmentGlsl(tints) } },
        uniforms: [{ name: "viewProj", type: "mat4" }, { name: "probeMin", type: "vec4" }, { name: "probeStep", type: "vec4" }, { name: "probeCounts", type: "vec4" }],
        cull, frontFace, blend,
    });
}
/** the three vec4s a packed volume needs in the shader */
export function probeUniforms(packed) {
    return { probeMin: Float32Array.from([...packed.min, 0]), probeStep: Float32Array.from([...packed.step, 0]), probeCounts: Float32Array.from([...packed.counts, 0]) };
}
export function probeBind(packed, tex) {
    const u = probeUniforms(packed);
    return (pass) => { pass.uniform("probeMin", u.probeMin); pass.uniform("probeStep", u.probeStep); pass.uniform("probeCounts", u.probeCounts); pass.texture("tProbes", tex, 0); };
}
