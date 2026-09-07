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
export const FAULT = Object.freeze({
    wrongPdf: 1, separable: LOBE_FAULT.separable, beckmann: LOBE_FAULT.beckmann,
    // v4410 -- Heitz's two named traps, as bits rather than as a second copy of the listing.
    noWarp: 16, noDegenerate: 32,
});
export const REPAIR = Object.freeze({ stableCdf: 8 });

/** v4410 -- which distribution the half-vector is drawn from. */
export const SAMPLER = Object.freeze({ ndf: 0, vndf: 1 });
/** v4410 -- how (u1, u2) is generated. Both are DETERMINISTIC: v4290 proved a device's RNG is not portable. */
export const PATTERN = Object.freeze({ stratified: 0, hammersley: 1 });

/** 0: the estimator. 1: the two routes to f cos_i / pdf, one sample per lane. 2: the balance heuristic. */
export const MODE = Object.freeze({ estimate: 0, identity: 1, mis: 2, census: 3, moments: 4, vdc: 5 });

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
  sampler   : u32,   // v4410 -- 0 draws from D, 1 draws from D_visible. BOTH IN ONE KERNEL ON PURPOSE:
                     // "the answer must not depend on which sampler drew it" is then a claim about one
                     // shader text rather than a comparison between two, which could differ for a second reason.
  pattern   : u32,   // 0 stratified midpoints, 1 Hammersley. v4410 measures why the visible-normal sampler
                     // needs the second one and the plain sampler does not.
  padA      : u32,
  alpha     : f32,
  cosO      : f32,
  padB      : f32,
  padC      : f32,
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

// v4410 -- van der Corput base 2 over SIXTEEN BITS ONLY, and the width is the portability argument.
// v4290 measured that f32(u32) rounds and that WGSL leaves WHICH neighbour you get implementation-defined --
// 98.02% of the first 65536 draws differ between conformant devices. A 16-bit integer is under 2^24, so
// f32() of it is EXACT on every conformant device, and 65536.0 is a power of two, so the division is exact
// too. This sequence is therefore identical on the CPU and on any device, by construction rather than by luck.
fn vanDerCorput16(i : u32) -> f32 {
  var b : u32 = i & 0xffffu;
  b = ((b & 0x00ffu) << 8u) | ((b & 0xff00u) >> 8u);
  b = ((b & 0x0f0fu) << 4u) | ((b & 0xf0f0u) >> 4u);
  b = ((b & 0x3333u) << 2u) | ((b & 0xccccu) >> 2u);
  b = ((b & 0x5555u) << 1u) | ((b & 0xaaaau) >> 1u);
  return f32(b & 0xffffu) / 65536.0;
}

// The sample point. Stratified midpoints tile the unit SQUARE, which suits a sampler whose u1 maps
// monotonically to cos_h; Hammersley is a low-discrepancy SET, which is what the visible-normal sampler needs
// because it maps (u1, u2) onto a DISK where a square grid becomes wildly anisotropic near the centre.
fn samplePoint(k : u32) -> vec2<f32> {
  let n = P.nStrat;
  if (P.pattern == 1u) {
    let total = n * n;
    return vec2<f32>((f32(k) + 0.5) / f32(total), vanDerCorput16(k));
  }
  return vec2<f32>((f32(k / n) + 0.5) / f32(n), (f32(k % n) + 0.5) / f32(n));
}

// Heitz 2018 (JCGT 7:4) listing 3, isotropic, IN THE PAPER'S OWN Z-UP FRAME with one named swap at each end,
// exactly as physics/render/microfacet.mjs writes it. The section numbers are the paper's.
fn sampleVisibleNormal(wo : vec3<f32>, a : f32, u1 : f32, u2 : f32) -> vec3<f32> {
  let Ve = vec3<f32>(wo.x, wo.z, wo.y);                       // y-up -> z-up. Named swap, one of two.
  let Vh = normalize(vec3<f32>(a * Ve.x, a * Ve.y, Ve.z));    // 3.2 stretch
  let lensq = Vh.x * Vh.x + Vh.y * Vh.y;                      // 4.1 basis about Vh
  // *** THE DEGENERATE CASE IS NOT DECORATION. *** wo along the normal makes lensq exactly 0 and
  // inverseSqrt(0) infinite, so T1 is NaN and so is everything after it -- at the centre of every flat
  // surface facing the camera. FAULT.noDegenerate removes the guard and the gate reads the NaN.
  let degenerate = lensq > 0.0 || (P.faults & 32u) != 0u;
  let T1 = select(vec3<f32>(1.0, 0.0, 0.0),
                  vec3<f32>(-Vh.y, Vh.x, 0.0) * inverseSqrt(lensq), degenerate);
  let T2 = cross(Vh, T1);
  let r = sqrt(u1);                                           // 4.2 uniform disk...
  let phi = 2.0 * PI * u2;
  let t1 = r * cos(phi);
  let t2raw = r * sin(phi);
  let s = 0.5 * (1.0 + Vh.z);
  // ...WARPED to the projected area of the hemisphere. Dropping this still proposes NO backfacing facet, so
  // the cheap structural check passes while the distribution is wrong by up to 35%. FAULT.noWarp drops it.
  let t2 = select((1.0 - s) * sqrt(max(0.0, 1.0 - t1 * t1)) + s * t2raw, t2raw, (P.faults & 16u) != 0u);
  let k = sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2));            // 4.3 reproject
  let Nh = t1 * T1 + t2 * T2 + k * Vh;
  let Ne = normalize(vec3<f32>(a * Nh.x, a * Nh.y, max(0.0, Nh.z)));   // 3.4 unstretch
  return vec3<f32>(Ne.x, Ne.z, Ne.y);                         // z-up -> y-up. The second half of the swap.
}

// f cos_i / pdf under visible-normal sampling: the whole lobe cancels and G2 / G1(wo) is what is left.
fn visibleBounceWeight(cosO : f32, cosI : f32, a : f32) -> f32 {
  if (cosI <= 0.0 || cosO <= 0.0) { return 0.0; }
  return g2(cosO, cosI, a) / g1(cosO, a);
}

// The pdf of the sampled DIRECTION under visible-normal sampling. No dot product: the reflection's Jacobian
// cancels the max(0, wo.wh) inside D_visible outright.
fn visibleNormalDirPdf(cosO : f32, cosH : f32, a : f32) -> f32 {
  return g1(cosO, a) * ggxD(cosH, a) / (4.0 * cosO);
}

// One stratum index -> the sample, the two routes, and the weight. Returned together so a caller reading the
// identity and a caller reading the estimator cannot be looking at different directions.
struct Sample { w : f32, longRoute : f32, ok : f32 };
fn oneSample(k : u32) -> Sample {
  let uv = samplePoint(k);
  let so = sqrt(max(0.0, 1.0 - P.cosO * P.cosO));
  let wo = vec3<f32>(so, P.cosO, 0.0);
  let vndf = P.sampler == 1u;
  let wh = select(sampleHalfVector(uv.x, uv.y, P.alpha),
                  sampleVisibleNormal(wo, P.alpha, uv.x, uv.y), vndf);
  let dotOH = dot(wo, wh);
  let wi = 2.0 * dotOH * wh - wo;
  let w = select(bounceWeight(P.cosO, wi.y, wh.y, dotOH, P.alpha),
                 visibleBounceWeight(P.cosO, wi.y, P.alpha), vndf);
  var lr : f32 = 0.0;
  var ok : f32 = 0.0;
  if (wi.y > 0.0 && dotOH > 0.0) {
    let pdf = select(sampleDirPdf(wh.y, dotOH, P.alpha), visibleNormalDirPdf(P.cosO, wh.y, P.alpha), vndf);
    if (pdf > 0.0) { lr = bsdfEval(P.cosO, wi.y, wh.y, P.alpha) * wi.y / pdf; ok = 1.0; }
  }
  return Sample(w, lr, ok);
}

// v4410 -- what a sample IS, for the counting claims: whether the facet faces the viewer at all, and whether
// the reflection cleared the horizon. THESE ARE TWO DIFFERENT THINGS and the sampler only guarantees the first.
struct Census { backfacing : f32, belowHorizon : f32 };
fn oneCensus(k : u32) -> Census {
  let uv = samplePoint(k);
  let so = sqrt(max(0.0, 1.0 - P.cosO * P.cosO));
  let wo = vec3<f32>(so, P.cosO, 0.0);
  let wh = select(sampleHalfVector(uv.x, uv.y, P.alpha),
                  sampleVisibleNormal(wo, P.alpha, uv.x, uv.y), P.sampler == 1u);
  let dotOH = dot(wo, wh);
  let cosI = 2.0 * dotOH * wh.y - wo.y;
  return Census(select(0.0, 1.0, dotOH <= 0.0), select(0.0, 1.0, cosI <= 0.0));
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

  if (P.mode == 3u) {
    // The census: one lane per stripe, counting backfacing facets and below-horizon reflections separately.
    let total = P.nStrat * P.nStrat;
    var b : f32 = 0.0;
    var h : f32 = 0.0;
    var k = lane;
    loop {
      if (k >= total) { break; }
      let c = oneCensus(k);
      b = b + c.backfacing;
      h = h + c.belowHorizon;
      k = k + P.laneCount;
    }
    part[lane * 2u] = b;
    part[lane * 2u + 1u] = h;
    return;
  }

  if (P.mode == 4u) {
    // The first two moments of the SINGLE-SAMPLE weight, which is the quantity that decides how many samples a
    // renderer needs. Reported as raw sums so the host does the division in f64 -- a variance computed as
    // E[w^2] - E[w]^2 at f32 loses most of its digits when the two are close, and they are.
    let total = P.nStrat * P.nStrat;
    var s1 : f32 = 0.0;
    var s2 : f32 = 0.0;
    var k = lane;
    loop {
      if (k >= total) { break; }
      let w = oneSample(k).w;
      s1 = s1 + w;
      s2 = s2 + w * w;
      k = k + P.laneCount;
    }
    part[lane * 2u] = s1;
    part[lane * 2u + 1u] = s2;
    return;
  }

  if (P.mode == 5u) {
    // The radical inverse itself, read back so the host can check it is EXACT rather than assume it.
    if (lane >= P.count) { return; }
    part[lane] = vanDerCorput16(lane);
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

/** The struct's layout: eight u32 then four f32, all scalars, 48 bytes. Callers size the buffer from
 * `pack.length` rather than from a literal, so growing the struct cannot leave a gate reading past its end. */
export function packSampleParams({ mode, faults = 0, laneCount, nStrat = 0, count = 0,
                                   sampler = 0, pattern = 0, alpha = 0, cosO = 0 }) {
    const buf = new ArrayBuffer(48), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = mode; u[1] = faults; u[2] = laneCount; u[3] = nStrat; u[4] = count;
    u[5] = sampler; u[6] = pattern; u[7] = 0;
    f[8] = alpha; f[9] = cosO;
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
