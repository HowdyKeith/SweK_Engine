// WebGLEngine/physics/render/microfacetSampleWgsl.mjs -- v4409
//
// *** THE SAMPLING HALF OF THE BSDF ON A DEVICE -- THE HALF A RENDERER NEEDS AND AN INTEGRAL DOES NOT. ***
//
// v4408 put the microfacet LOBE on a device and graded it with microfacet.mjs's three integrals. It closed by
// naming what it had not carried: "the SAMPLING half (sampleHalfVector, sampleDirPdf, bounceWeight,
// misWeight), which is not ported here". This is that half.
//
// ---- IT IS A DIFFERENT KIND OF PORT AND THE DIFFERENCE IS STATED FIRST -----------------------------------------
//
// *** v4408's WGSL WAS TRANSLATED FROM SHIPPED GLSL. THIS IS HAND-WRITTEN, BECAUSE THERE IS NO SHIPPED GLSL
// TO TRANSLATE. *** render/microfacetShader.js carries D, Lambda and G2 and stops there -- a fragment shader
// evaluates a lobe, it does not choose a direction. So the lobe below is still v4408's `lobeWgsl`, composed
// rather than copied, and everything from `sampleHalfVector` down is a NEW transcription of microfacet.mjs's
// JavaScript. A transcription cannot be proved by textual identity, which is exactly why the keys this file is
// graded on have to be analytic. They are, and there are three of them.
//
// ---- KEY 1: THE ALGEBRAIC IDENTITY, WHICH HAS NO FREE PARAMETER AND NO STATISTICS ------------------------------
//
//     f cos_i / pdf = [D G2 F / (4 cos_o cos_i)] cos_i [4 |wo.wh| / (D cos_h)] = F G2 |wo.wh| / (cos_o cos_h)
//
// microfacet.mjs asserts that cancellation in a comment and computes only the right-hand side. Both sides are
// computable, so the gate computes BOTH and subtracts. *** D DISAPPEARS, and that is the whole reason
// importance-sampling the NDF is worth doing. *** At f64 the two routes agree to 4.7e-16 over ten thousand
// directions. At f32 they cannot: the long route computes D twice and divides it out, which is two roundings
// the short route never pays. That gap is a measurement, not a tolerance, and it is what this file reports.
//
// ---- KEY 2: THE MIRROR LIMIT, WHICH IS THE ONE THE QUADRATURE CANNOT REACH ------------------------------------
//
// As alpha -> 0 the NDF concentrates on the normal: every sample returns wh = n, wi is the mirror of wo, and
// the weight collapses to G2(cos_o, cos_o) = 1 / (1 + 2 Lambda(cos_o)). *** SO THE ESTIMATOR HAS ZERO VARIANCE
// THERE AND ITS ANSWER IS A CLOSED FORM. *** At alpha 1e-3 it lands on that constant to EIGHT significant
// figures at three view angles.
//
// *** AND v4408's QUADRATURE IS 49% WRONG AT THE SAME POINT. *** A 500x500 grid over the hemisphere cannot
// resolve a lobe of width 0.001: it reads 0.512 where the answer is 0.999999, and needs 1500x1500 to reach
// 0.982. THE TWO INSTRUMENTS ARE NOT INTERCHANGEABLE AND THIS IS WHERE THE SAMPLER IS THE BETTER ONE. Where
// the quadrature IS converged -- alpha >= 0.05 -- they agree, and that agreement is the cross-check.
//
// ---- KEY 3: WHAT THIS ESTIMATOR IS BLIND TO, WHICH COMPLETES v4408's PARTITION ---------------------------------
//
// microfacet.mjs says it: "a wrong D is INVISIBLE to this weight and must be graded by the integrals in this
// file instead". That is now MEASURED rather than asserted, and it holds for the long route too -- D appears
// once in the numerator and once in the pdf, so it cancels there as well. The three keys partition the model:
//
//     the NDF integral (v4408)     sees D          blind to G
//     the weak furnace (v4408)     sees D and G1 together
//     this estimator               blind to D      sees G2
//
// A tree with only one of them ships a broken renderer that looks fine.
//
// ---- THE RNG IS NOT IN THIS ROUND, ON PURPOSE ------------------------------------------------------------------
//
// v4290 measured that a device's random stream is not portable -- 98.02% of the first 65536 draws differ,
// because f32(u32) rounds and WGSL leaves which neighbour you get implementation-defined. So the (u1, u2) here
// are a STRATIFIED GRID, identical on both machines by construction. That removes the estimator's variance as
// well as the RNG, and what is left in a device-versus-CPU difference is arithmetic.
//
// ---- ONE THING FOUND AND DELIBERATELY NOT FIXED ---------------------------------------------------------------
//
// *** microfacet.mjs's sampler carries THE EXACT CANCELLATION v3494 REMOVED FROM D. *** Its cdf inverse is
//
//     cosH = sqrt((1 - u1) / (u1 * (a2 - 1) + 1))         a difference of numbers near 1
//     algebraically identical                              (1 - u1) + u1 * a2      a sum of positives
//
// -- the same shape, in the same file, un-rewritten, because v3494 was looking at D. At f32 it is worth
// 3.28e-3 in cosH at alpha 0.001, five orders above the rewrite. *** AND IT DOES NOT MOVE THE ESTIMATOR:
// 2.1e-13. *** The samples it corrupts are in the tail where u1 -> 1, they are a vanishing fraction, and the
// weight they carry is smooth. So this file ships microfacet.mjs's form as the default, offers the rewrite
// behind a bit, and reports the pair. A LATENT HAZARD NAMED WITH A NUMBER IS WORTH MORE THAN A FIX NOBODY
// NEEDED -- and the number is what says which it is.
//
// Gated in physics/render/microfacetSampleWgsl-selfcheck.mjs.
"use strict";

import { lobeWgsl, FAULT as LOBE_FAULT } from "./microfacetWgsl.mjs";

/**
 * The uniform bits. 1/2/4 are microfacetWgsl.mjs's, unchanged and asserted below, so a fault means the same
 * thing in both kernels. 8 is a REPAIR rather than a fault, named the way v4408 named hostTrig.
 */
export const FAULT = Object.freeze({ wrongPdf: 1, separable: LOBE_FAULT.separable, beckmann: LOBE_FAULT.beckmann });
export const REPAIR = Object.freeze({ stableCdf: 8 });

/** 0: the estimator. 1: the two routes to f cos_i / pdf, one sample per lane. 2: the balance heuristic. */
export const MODE = Object.freeze({ estimate: 0, identity: 1, mis: 2 });

const WGSL_HEAD = /* wgsl */ `
// microfacet-sample.wgsl -- GENERATED. The three lobe functions are render/microfacetShader.js's own GLSL text,
// translated by physics/render/microfacetWgsl.mjs; everything below the lobe is a transcription of
// physics/render/microfacet.mjs's sampling half and is graded by analytic keys rather than by textual identity.
struct Params {
  mode      : u32,
  faults    : u32,
  laneCount : u32,
  nStrat    : u32,   // the stratified grid is nStrat x nStrat, so u1 and u2 are the SAME on both machines
  count     : u32,   // how many entries the caller wants written, for the per-sample modes
  pad       : u32,
  alpha     : f32,
  cosO      : f32,
};
@group(0) @binding(0) var<uniform>             P    : Params;
@group(0) @binding(1) var<storage, read_write> part : array<f32>;

const PI : f32 = 3.141592653589793;`;

const WGSL_TAIL = /* wgsl */ `
// microfacet.mjs sampleHalfVector(), term for term, y up. THE DENOMINATOR IS ITS SHIPPED FORM by default:
// u1 * (a2 - 1) + 1, which is the difference-of-numbers-near-1 that v3494 rewrote in D and did not rewrite
// here. REPAIR.stableCdf selects the sum of positives instead, and the gate measures both rather than
// assuming either. Neither is a fault: they are the same number in exact arithmetic.
fn sampleHalfVector(u1 : f32, u2 : f32, a : f32) -> vec3<f32> {
  let a2 = a * a;
  let denShipped = u1 * (a2 - 1.0) + 1.0;
  let denStable  = (1.0 - u1) + u1 * a2;
  let den = select(denShipped, denStable, (P.faults & 8u) != 0u);
  let cosH = sqrt((1.0 - u1) / den);
  let sinH = sqrt(max(0.0, 1.0 - cosH * cosH));
  let phi  = 2.0 * PI * u2;
  return vec3<f32>(sinH * cos(phi), cosH, sinH * sin(phi));
}

// The pdf of the SAMPLED DIRECTION, not of the half-vector: the 1/(4|wo.wh|) is the reflection's Jacobian.
fn sampleDirPdf(cosH : f32, dotOH : f32, a : f32) -> f32 {
  return ggxD(cosH, a) * cosH / (4.0 * abs(dotOH));
}

// f = D G2 F / (4 cos_o cos_i). F is 1 throughout this file, as microfacet.mjs's default is.
fn bsdfEval(cosO : f32, cosI : f32, cosH : f32, a : f32) -> f32 {
  if (cosI <= 0.0 || cosO <= 0.0) { return 0.0; }
  return ggxD(cosH, a) * g2(cosO, cosI, a) / (4.0 * cosO * cosI);
}

// f cos_i / pdf, with the cancellation taken ANALYTICALLY. wrongPdf keeps the weight and divides by the
// COSINE pdf instead -- microfacet.mjs's named plant, the commonest bug in a path tracer's BSDF.
fn bounceWeight(cosO : f32, cosI : f32, cosH : f32, dotOH : f32, a : f32) -> f32 {
  if (cosI <= 0.0 || cosO <= 0.0) { return 0.0; }
  let g = g2(cosO, cosI, a);
  if ((P.faults & 1u) != 0u) {
    return g * ggxD(cosH, a) / (4.0 * cosO * cosI) * cosI / (cosI / PI);
  }
  return g * abs(dotOH) / (cosO * cosH);
}

fn misWeight(pThis : f32, pOther : f32) -> f32 {
  let s = pThis + pOther;
  return select(0.0, pThis / s, s > 0.0);
}

// One stratum index -> the sample, the two routes, and the weight. Returned together so a caller reading the
// identity and a caller reading the estimator cannot be looking at different directions.
struct Sample { w : f32, longRoute : f32, ok : f32 };
fn oneSample(k : u32) -> Sample {
  let n = P.nStrat;
  let u1 = (f32(k / n) + 0.5) / f32(n);
  let u2 = (f32(k % n) + 0.5) / f32(n);
  let so = sqrt(max(0.0, 1.0 - P.cosO * P.cosO));
  let wo = vec3<f32>(so, P.cosO, 0.0);
  let wh = sampleHalfVector(u1, u2, P.alpha);
  let dotOH = dot(wo, wh);
  let wi = 2.0 * dotOH * wh - wo;
  let w = bounceWeight(P.cosO, wi.y, wh.y, dotOH, P.alpha);
  var lr : f32 = 0.0;
  var ok : f32 = 0.0;
  if (wi.y > 0.0 && dotOH > 0.0) {
    let pdf = sampleDirPdf(wh.y, dotOH, P.alpha);
    if (pdf > 0.0) { lr = bsdfEval(P.cosO, wi.y, wh.y, P.alpha) * wi.y / pdf; ok = 1.0; }
  }
  return Sample(w, lr, ok);
}

@compute @workgroup_size(64)
fn sample(@builtin(global_invocation_id) gid : vec3<u32>) {
  let lane = gid.x;
  if (lane >= P.laneCount) { return; }

  if (P.mode == 0u) {
    // The estimator: one lane per stripe of the stratified grid, striding by laneCount. The host divides by
    // the sample count in f64, exactly as v4407 and v4408 add their partials there.
    let total = P.nStrat * P.nStrat;
    var s : f32 = 0.0;
    var k = lane;
    loop {
      if (k >= total) { break; }
      s = s + oneSample(k).w;
      k = k + P.laneCount;
    }
    part[lane] = s;
    return;
  }

  if (P.mode == 1u) {
    // The identity, one sample per lane: the short route, the long route, and whether the sample was usable.
    if (lane >= P.count) { return; }
    let sm = oneSample(lane);
    part[lane * 3u]      = sm.w;
    part[lane * 3u + 1u] = sm.longRoute;
    part[lane * 3u + 2u] = sm.ok;
    return;
  }

  // The balance heuristic, one pair per lane. The pdfs are ARBITRARY POSITIVE NUMBERS on purpose: the property
  // is p/(p+q) + q/(p+q) = 1 and it must not depend on where the numbers came from.
  if (lane >= P.count) { return; }
  let pa = part[lane * 3u];
  let pb = part[lane * 3u + 1u];
  part[lane * 3u + 2u] = misWeight(pa, pb) + misWeight(pb, pa);
}`;

/** HEAD + v4408's lobe, composed rather than copied + the sampling half. */
export function buildSampleWgsl(plant = {}) {
    return WGSL_HEAD + "\n\n" + lobeWgsl(plant) + "\n" + WGSL_TAIL;
}

/** The struct's layout: six u32 then two f32, all scalars, 32 bytes. */
export function packSampleParams({ mode, faults = 0, laneCount, nStrat = 0, count = 0, alpha = 0, cosO = 0 }) {
    const buf = new ArrayBuffer(32), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = mode; u[1] = faults; u[2] = laneCount; u[3] = nStrat; u[4] = count; u[5] = 0;
    f[6] = alpha; f[7] = cosO;
    return { buf, u32: u, f32: f };
}

/** The host half of the reduction: add the f32 partials in f64 and divide by the sample count. */
export const meanOf = (partials, nStrat) => {
    let s = 0;
    for (let i = 0; i < partials.length; i++) s += partials[i];
    return s / (nStrat * nStrat);
};

/**
 * *** THE KEY THE QUADRATURE CANNOT REACH. *** As alpha -> 0 every sample returns wh = n, so wi is the mirror
 * of wo, cos_i = cos_o, cos_h = 1, |wo.wh| = cos_o, and the weight collapses to G2(cos_o, cos_o) with no
 * dependence on the sample at all. The estimator therefore has ZERO VARIANCE there and its answer is this
 * closed form -- which is why one lane and a million lanes give the same eight digits.
 */
export const mirrorLimit = (alpha, cosO) => 1 / (1 + 2 * lambdaGgx(cosO, alpha));
const lambdaGgx = (cosW, alpha) => {
    const c2 = cosW * cosW, tan2 = (1 - c2) / Math.max(c2, 1e-16);
    return (-1 + Math.sqrt(1 + alpha * alpha * tan2)) / 2;
};

/**
 * The f32 MIRROR of the device's estimator: the same strata, the same stripes, the same order, Math.fround
 * after every operation and a Float32Array for the partials. v4405's lesson and v4408's, kept -- a mirror that
 * holds its partials in f64 is not modelling `array<f32>`.
 */
export function estimateEmulated(alpha, cosO, { nStrat = 128, laneCount = 64, stableCdf = false } = {}) {
    const fr = Math.fround, part = new Float32Array(laneCount), total = nStrat * nStrat;
    const a = fr(alpha), c = fr(cosO), a2 = fr(a * a);
    const so = fr(Math.sqrt(Math.max(0, fr(1 - fr(c * c)))));
    for (let lane = 0; lane < laneCount; lane++) {
        let s = 0;
        for (let k = lane; k < total; k += laneCount) {
            const u1 = fr(fr(fr(Math.floor(k / nStrat)) + 0.5) / fr(nStrat));
            const u2 = fr(fr(fr(k % nStrat) + 0.5) / fr(nStrat));
            const den = stableCdf ? fr(fr(1 - u1) + fr(u1 * a2)) : fr(fr(u1 * fr(a2 - 1)) + 1);
            const cosH = fr(Math.sqrt(fr(fr(1 - u1) / den)));
            const sinH = fr(Math.sqrt(Math.max(0, fr(1 - fr(cosH * cosH)))));
            const phi = fr(fr(fr(2 * Math.PI) * u2));
            const wh = [fr(sinH * fr(Math.cos(phi))), cosH, fr(sinH * fr(Math.sin(phi)))];
            const dotOH = fr(fr(fr(so * wh[0]) + fr(c * wh[1])) + 0);
            const cosI = fr(fr(fr(2 * dotOH) * wh[1]) - c);
            s = fr(s + fr(weightEmulated(c, cosI, cosH, dotOH, a)));
        }
        part[lane] = s;
    }
    return meanOf(part, nStrat);
}

/** bounceWeight at binary32: G2 height-correlated, F = 1, and the analytic cancellation already taken. */
export function weightEmulated(cosO, cosI, cosH, dotOH, alpha) {
    const fr = Math.fround;
    if (cosI <= 0 || cosO <= 0) return 0;
    const lo = lambdaEmulated(cosO, alpha), li = lambdaEmulated(cosI, alpha);
    const g = fr(1 / fr(fr(1 + lo) + li));
    return fr(fr(g * fr(Math.abs(dotOH))) / fr(cosO * cosH));
}
function lambdaEmulated(cosW, alpha) {
    const fr = Math.fround, c2 = fr(cosW * cosW);
    const tan2 = fr(fr(1 - c2) / fr(Math.max(c2, 1e-16)));
    return fr(fr(-1 + fr(Math.sqrt(fr(1 + fr(fr(alpha * alpha) * tan2))))) / 2);
}
