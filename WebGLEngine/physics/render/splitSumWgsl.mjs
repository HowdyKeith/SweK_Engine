// WebGLEngine/physics/render/splitSumWgsl.mjs -- v4576
// ---------------------------------------------------------------------------------------------------------------
// THE SPECULAR HALF OF IBL, ON A DEVICE. physics/render/splitSum.mjs (v4539) closed with an honest limit named
// in its own words: "no prefiltered mip CHAIN is baked and nothing on a device samples this yet." This is the
// device side -- a BRDF-LUT compute shader and a prefiltered-environment compute shader, hand-written in WGSL
// and gated against splitSum.mjs's own CPU numbers, the same pattern physics/render/fresnelWgsl.mjs used for
// Fresnel: "physics/render/fresnel.mjs has held the exact equations since v3491... but it has never been near a
// GPU." No GLSL sibling exists to translate from (microfacetWgsl.mjs's route, for the one file that had one) --
// splitSum.mjs is JS only, so this is written directly against it, term for term, and the gate is the proof.
//
// *** WHAT THIS DOES NOT CLOSE, NAMED RATHER THAN LEFT IMPLICIT. *** A cubemap capture of a real scene and a
// mip-chain bake orchestrating six faces x N roughness levels through this shader are still unbuilt -- this
// closes "the WGSL that reads them" (splitSum.mjs's own words for the missing piece), not the capture or the
// mip layout beside it. Nothing in the live renderer calls this yet.
"use strict";

export const PI = 3.141592653589793;

/** Shared WGSL: the exact GGX Lambda/G2 microfacet.mjs's default (height-correlated) form computes, the
 *  Hammersley sequence and GGX half-vector importance sample splitSum.mjs's hammersley()/sampleGgxHalf() use. */
export const SPLIT_SUM_HELPERS_WGSL = /* wgsl */ `
const PI_F : f32 = 3.141592653589793;

// microfacet.mjs's Lambda(cosW, alpha) -- GGX form, NOT the Beckmann plant.
fn ggxLambda(cosW: f32, alpha: f32) -> f32 {
  let c2 = cosW * cosW;
  let tan2 = (1.0 - c2) / max(c2, 1e-16);
  return (-1.0 + sqrt(1.0 + alpha * alpha * tan2)) / 2.0;
}
// microfacet.mjs's G2 default: height-correlated Smith, 1 / (1 + Lambda(o) + Lambda(i)).
fn g2f(cosO: f32, cosI: f32, alpha: f32) -> f32 {
  return 1.0 / (1.0 + ggxLambda(cosO, alpha) + ggxLambda(cosI, alpha));
}

// splitSum.mjs's hammersley(): van der Corput radical inverse in base 2, paired with i/n.
fn radicalInverseVdC(bits_in: u32) -> f32 {
  var bits = bits_in;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}
fn hammersleyU1(i: u32, n: u32) -> f32 { return f32(i) / f32(n); }
fn hammersleyU2(i: u32) -> f32 { return radicalInverseVdC(i); }

// splitSum.mjs's sampleGgxHalf(): a GGX half-vector about +z, importance-sampled from D(m)(n.m).
fn sampleGgxHalf(u1: f32, u2: f32, alpha: f32) -> vec3<f32> {
  let phi = 2.0 * PI_F * u1;
  let a2 = alpha * alpha;
  let ct = sqrt((1.0 - u2) / (1.0 + (a2 - 1.0) * u2));
  let st = sqrt(max(0.0, 1.0 - ct * ct));
  return vec3<f32>(st * cos(phi), st * sin(phi), ct);
}
`;

/**
 * The BRDF LUT, one thread per (mu, alpha) cell -- term for term with splitSum.mjs's brdfLutEntry()/brdfLut().
 * Output: a flat f32 array of K*R*2 values, (A, B) interleaved, cell (i, j) at index (j*K + i)*2.
 * Binding 0: output storage. Binding 1: uniform { K, R, samples } (as f32 in a vec4, WGSL uniform alignment).
 */
export const BRDF_LUT_WGSL = /* wgsl */ `
${SPLIT_SUM_HELPERS_WGSL}
struct LutParams { KRSamplesPad : vec4<f32> };
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> P : LutParams;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let K = u32(P.KRSamplesPad.x);
  let R = u32(P.KRSamplesPad.y);
  let samples = u32(P.KRSamplesPad.z);
  if (gid.x >= K || gid.y >= R) { return; }
  let mu = (f32(gid.x) + 0.5) / f32(K);
  let alpha = (f32(gid.y) + 0.5) / f32(R);
  let sinV = sqrt(max(0.0, 1.0 - mu * mu));
  let V = vec3<f32>(sinV, 0.0, mu);
  var A = 0.0;
  var B = 0.0;
  for (var i = 0u; i < samples; i = i + 1u) {
    let u1 = hammersleyU1(i, samples);
    let u2 = hammersleyU2(i);
    let H = sampleGgxHalf(u1, u2, alpha);
    let VoH = V.x * H.x + V.y * H.y + V.z * H.z;
    let L = vec3<f32>(2.0 * VoH * H.x - V.x, 2.0 * VoH * H.y - V.y, 2.0 * VoH * H.z - V.z);
    if (L.z <= 0.0 || VoH <= 0.0 || H.z <= 0.0) { continue; }
    let gVis = g2f(mu, L.z, alpha) * VoH / (H.z * mu);
    let Fc = pow(1.0 - VoH, 5.0);
    A = A + (1.0 - Fc) * gVis;
    B = B + Fc * gVis;
  }
  let idx = (gid.y * K + gid.x) * 2u;
  outBuf[idx] = A / f32(samples);
  outBuf[idx + 1u] = B / f32(samples);
}
`;

/**
 * v4580 -- THE ACCUMULATION LOOP, PULLED OUT AND PARAMETERISED OVER WHERE A DIRECTION'S RADIANCE COMES FROM.
 * `envImpl` is a complete WGSL function `fn envSample(d: vec3<f32>, sel: u32) -> f32`; `sel` is an opaque
 * selector this core never interprets itself, only forwards -- the analytic implementation below reads it as
 * "which of three test patterns" (unchanged from before this split), and physics/render/specularProbeCapture.mjs's
 * texture-backed one reads the SAME slot as "which colour channel" of a captured atlas. specularIBLWgsl.mjs's
 * specularIBLCoreWgsl(fetchImpl) split its sampler the identical way for the identical reason: one accumulation
 * loop, two sources for the one function call inside it that differs.
 *
 * *** THIS MUST STAY TERM FOR TERM WITH THE INLINE VERSION splitSumWgsl-selfcheck.mjs's SABOTAGE TARGETS. ***
 * That gate's section 3 string-replaces the exact line `let NoL = R.x * L.x + R.y * L.y + R.z * L.z;` inside
 * PREFILTER_ENV_WGSL's assembled text to prove a wrong NoL weight is caught; this refactor keeps that line
 * byte-identical rather than reformatting it away, and splitSumWgsl-selfcheck.mjs is re-run after this change
 * (not just reasoned about) to confirm nothing moved.
 */
export function prefilterCoreWgsl(envImpl) {
    return /* wgsl */ `
${envImpl}
fn prefilterChannel(R : vec3<f32>, alpha : f32, sel : u32, samples : u32) -> f32 {
  // splitSum.mjs's tangent frame: up = |R.z| < 0.999 ? +z : +x; tx = normalize(cross(up, R)); ty = cross(R, tx).
  var up = vec3<f32>(0.0, 0.0, 1.0);
  if (abs(R.z) >= 0.999) { up = vec3<f32>(1.0, 0.0, 0.0); }
  let tx = normalize(cross(up, R));
  let ty = cross(R, tx);

  var sum = 0.0;
  var wsum = 0.0;
  for (var i = 0u; i < samples; i = i + 1u) {
    let u1 = hammersleyU1(i, samples);
    let u2 = hammersleyU2(i);
    let h = sampleGgxHalf(u1, u2, alpha);
    let H = tx * h.x + ty * h.y + R * h.z;
    let RoH = R.x * H.x + R.y * H.y + R.z * H.z;
    let L = vec3<f32>(2.0 * RoH * H.x - R.x, 2.0 * RoH * H.y - R.y, 2.0 * RoH * H.z - R.z);
    let NoL = R.x * L.x + R.y * L.y + R.z * L.z;
    if (NoL <= 0.0) { continue; }
    sum = sum + envSample(L, sel) * NoL;
    wsum = wsum + NoL;
  }
  return select(0.0, sum / wsum, wsum > 0.0);
}
`;
}

/** The three analytic test patterns PREFILTER_ENV_WGSL always graded against, extracted verbatim (renamed
 *  envFn -> envSample, kind -> sel to match prefilterCoreWgsl's generic slot) rather than rewritten. */
export const ANALYTIC_ENV_WGSL = /* wgsl */ `
fn envSample(d : vec3<f32>, sel : u32) -> f32 {
  if (sel == 0u) { return 1.0; }
  if (sel == 1u) { return 0.5 + 0.5 * d.z; }
  return select(0.05, 50.0, d.z > 0.98);
}
`;

/**
 * The prefiltered environment, one thread per test case -- term for term with splitSum.mjs's prefilterEnv().
 * Cases arrive as a flat f32 input array, stride 8: [Rx, Ry, Rz, alpha, envKind, samples, pad, pad].
 * envKind matches splitSum-selfcheck.mjs's three fixtures exactly: 0 uniform (=1), 1 gradient (0.5+0.5*d.z),
 * 2 spot (d.z>0.98 ? 50 : 0.05) -- so the device is graded against the SAME environments the CPU gate already
 * uses, not a fresh set invented for this file.
 * Binding 0: output storage (one f32 per case). Binding 1: uniform { caseCount }. Binding 2: input cases.
 */
export const PREFILTER_ENV_WGSL = /* wgsl */ `
${SPLIT_SUM_HELPERS_WGSL}
${prefilterCoreWgsl(ANALYTIC_ENV_WGSL)}
struct PfParams { caseCountPad : vec4<f32> };
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> P : PfParams;
@group(0) @binding(2) var<storage, read> cases : array<f32>;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let caseCount = u32(P.caseCountPad.x);
  if (gid.x >= caseCount) { return; }
  let base = gid.x * 8u;
  let R = normalize(vec3<f32>(cases[base], cases[base + 1u], cases[base + 2u]));
  let alpha = cases[base + 3u];
  let kind = u32(cases[base + 4u]);
  let samples = u32(cases[base + 5u]);
  outBuf[gid.x] = prefilterChannel(R, alpha, kind, samples);
}
`;

/** Pack { K, R, samples } into the vec4-aligned uniform BRDF_LUT_WGSL reads (WGSL uniform structs want 16-byte
 *  alignment; a lone vec4 sidesteps padding rules a struct of scalars would need worked out by hand). */
export function packLutParams(K, R, samples) { return new Float32Array([K, R, samples, 0]); }

/** One prefilterEnv test case, stride 8 floats, matching PREFILTER_ENV_WGSL's case layout exactly. */
export function packPrefilterCase(R, alpha, envKind, samples) {
    const n = Math.hypot(R[0], R[1], R[2]) || 1;
    return [R[0] / n, R[1] / n, R[2] / n, alpha, envKind, samples, 0, 0];
}
export function packPrefilterCases(cases) {
    const out = new Float32Array(cases.length * 8);
    cases.forEach((c, i) => out.set(packPrefilterCase(c.R, c.alpha, c.envKind, c.samples), i * 8));
    return out;
}
export const ENV_KIND = Object.freeze({ uniform: 0, gradient: 1, spot: 2 });
