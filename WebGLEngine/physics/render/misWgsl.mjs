// WebGLEngine/physics/render/misWgsl.mjs -- v4413
//
// *** MULTIPLE IMPORTANCE SAMPLING WITH THE TWO STRATEGIES ACTUALLY COMBINED -- WHICH v4409 COMPUTED THE
// WEIGHTS FOR AND NEVER USED. ***
//
// v4409 measured the balance heuristic's defining property and found it is not exact: 12.6% of pairs miss 1 by
// one ULP on a device and 10.8% at f64, the SAME rate, so it is arithmetic rather than precision. It then said
// plainly what it had not done -- "this samples the NDF only, so the MIS weights are computed and never USED;
// a real next-event estimator pairs this with a light sample, and combining two estimators is a round of its
// own". This is that round, and the weights are now load-bearing.
//
// ---- WHAT IS GENUINELY NEW CODE, AS OPPOSED TO NEWLY EXERCISED --------------------------------------------------
//
// *** THE BSDF's PDF AT A DIRECTION SOMEBODY ELSE CHOSE. *** A sampler never needs this: it knows the pdf of
// what it drew because it drew it. An MIS estimator must evaluate the OTHER strategy's pdf at its own sample,
// which means reconstructing the half-vector from wo and wi and asking what the visible-normal distribution
// would have given. That reconstruction is the classic bug site in a path tracer -- it is where a renderer
// silently double-counts or loses light -- and nothing in v4408 through v4412 needed it.
//
// ---- THE THREE KEYS ---------------------------------------------------------------------------------------------
//
//   1. UNBIASEDNESS: BSDF-only, light-only and MIS estimate the SAME integral. Three routes, one number, and
//      the two single strategies share no code with each other.
//   2. THE WEIGHTS SUM TO 1 PER DIRECTION, and this round can finally measure what v4409's ULP COSTS -- the
//      earlier round said "one ULP is beneath the sampling noise of any renderer" without an estimator to
//      test it on.
//   3. MIS BOUNDS THE DAMAGE, which is the whole argument for it and is a measurement rather than a slogan.
//      All three Veach regimes are reachable here: a small light where BSDF sampling is useless, a large one
//      over a near-mirror where LIGHT sampling is useless, and the middle where MIS beats both.
//
// The light is a CONE of half-angle tmax about a direction, radiance 1 -- the simplest emitter with a solid
// angle that can be swept from a pinprick to the whole hemisphere, which is what makes the three regimes one
// parameter apart instead of three fixtures.
//
// Gated in physics/render/misWgsl-selfcheck.mjs.
"use strict";

/** Which estimator. `mis` uses the balance heuristic; `misRenorm` forces the weights to sum to exactly 1. */
export const STRATEGY = Object.freeze({ bsdf: 0, light: 1, mis: 2, misRenorm: 3 });
/** 0: the estimator's per-sample contributions. 1: the two weights at one direction, for the sum check. */
export const MODE = Object.freeze({ estimate: 0, weights: 1, pdf: 2 });
export const FAULT = Object.freeze({ noWeight: 1, powerHeuristic: 2 });

export const MIS_WGSL = /* wgsl */ `
// mis.wgsl -- the two strategies and the balance heuristic, term for term with physics/render/microfacet.mjs.
// The lobe is GGX isotropic (v4412's anisotropy is a separate kernel; combining the two is not this round).
struct Params {
  mode      : u32,
  strategy  : u32,
  faults    : u32,
  laneCount : u32,
  nSamp     : u32,
  count     : u32,
  alpha     : f32,
  cosO      : f32,
  cosL      : f32,   // the light direction's elevation
  phiL      : f32,   // ...and its azimuth, so the light is NOT in the view plane
  tmax      : f32,   // the cone's half-angle: ONE parameter sweeps all three Veach regimes
  padA      : f32,
};
@group(0) @binding(0) var<uniform>             P    : Params;
@group(0) @binding(1) var<storage, read_write> part : array<f32>;

const PI : f32 = 3.141592653589793;

fn ggxD(cosM : f32, a : f32) -> f32 {
  let a2 = a * a;
  let c2 = cosM * cosM;
  let t = (1.0 - c2) + a2 * c2;
  return select(a2 / (PI * t * t), 0.0, cosM <= 0.0);
}
fn ggxLambda(cosW : f32, a : f32) -> f32 {
  let c2 = cosW * cosW;
  let tan2 = (1.0 - c2) / max(c2, 1.0e-16);
  return (-1.0 + sqrt(1.0 + a * a * tan2)) / 2.0;
}
fn g1(cosW : f32, a : f32) -> f32 { return 1.0 / (1.0 + ggxLambda(cosW, a)); }
fn g2(cosO : f32, cosI : f32, a : f32) -> f32 { return 1.0 / (1.0 + ggxLambda(cosO, a) + ggxLambda(cosI, a)); }

fn vanDerCorput16(i : u32) -> f32 {
  var b : u32 = i & 0xffffu;
  b = ((b & 0x00ffu) << 8u) | ((b & 0xff00u) >> 8u);
  b = ((b & 0x0f0fu) << 4u) | ((b & 0xf0f0u) >> 4u);
  b = ((b & 0x3333u) << 2u) | ((b & 0xccccu) >> 2u);
  b = ((b & 0x5555u) << 1u) | ((b & 0xaaaau) >> 1u);
  return f32(b & 0xffffu) / 65536.0;
}

fn dirOf(c : f32, p : f32) -> vec3<f32> {
  let s = sqrt(max(0.0, 1.0 - c * c));
  return vec3<f32>(s * cos(p), c, s * sin(p));
}

// Heitz listing 3, isotropic -- v4410's port, which this round uses rather than re-derives.
fn sampleVNDF(wo : vec3<f32>, a : f32, u1 : f32, u2 : f32) -> vec3<f32> {
  let Ve = vec3<f32>(wo.x, wo.z, wo.y);
  let Vh = normalize(vec3<f32>(a * Ve.x, a * Ve.y, Ve.z));
  let lensq = Vh.x * Vh.x + Vh.y * Vh.y;
  let T1 = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(-Vh.y, Vh.x, 0.0) * inverseSqrt(lensq), lensq > 0.0);
  let T2 = cross(Vh, T1);
  let r = sqrt(u1);
  let phi = 2.0 * PI * u2;
  let t1 = r * cos(phi);
  let s = 0.5 * (1.0 + Vh.z);
  let t2 = (1.0 - s) * sqrt(max(0.0, 1.0 - t1 * t1)) + s * (r * sin(phi));
  let k = sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2));
  let Nh = t1 * T1 + t2 * T2 + k * Vh;
  let Ne = normalize(vec3<f32>(a * Nh.x, a * Nh.y, max(0.0, Nh.z)));
  return vec3<f32>(Ne.x, Ne.z, Ne.y);
}

// *** THE PIECE NOTHING BEFORE THIS ROUND NEEDED: the BSDF's pdf at a direction it did not choose. *** The
// half-vector has to be RECONSTRUCTED from wo and wi, and this is where a path tracer silently double-counts.
fn bsdfPdfAt(wo : vec3<f32>, wi : vec3<f32>, a : f32) -> f32 {
  if (wi.y <= 0.0) { return 0.0; }
  let h = wo + wi;
  let hl = sqrt(dot(h, h));
  if (hl < 1.0e-9) { return 0.0; }
  let wh = h / hl;
  if (wh.y <= 0.0 || dot(wo, wh) <= 0.0) { return 0.0; }
  return g1(wo.y, a) * ggxD(wh.y, a) / (4.0 * wo.y);
}

// f cos_i, evaluated -- the rasteriser's recipe, which next-event estimation needs because the LIGHT picked
// the direction. v3495 said exactly that about its CPU twin.
fn fCos(wo : vec3<f32>, wi : vec3<f32>, a : f32) -> f32 {
  if (wi.y <= 0.0) { return 0.0; }
  let h = wo + wi;
  let hl = sqrt(dot(h, h));
  if (hl < 1.0e-9) { return 0.0; }
  let wh = h / hl;
  return ggxD(wh.y, a) * g2(wo.y, wi.y, a) / (4.0 * wo.y);
}

fn conePdf(tmax : f32) -> f32 { return 1.0 / (2.0 * PI * (1.0 - cos(tmax))); }

fn sampleCone(L : vec3<f32>, tmax : f32, u1 : f32, u2 : f32) -> vec3<f32> {
  let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), abs(L.y) < 0.9);
  let t = normalize(cross(up, L));
  let b = cross(L, t);
  let ct = 1.0 - u1 * (1.0 - cos(tmax));
  let st = sqrt(max(0.0, 1.0 - ct * ct));
  let ph = 2.0 * PI * u2;
  return normalize(ct * L + st * cos(ph) * t + st * sin(ph) * b);
}

// The balance heuristic. noWeight drops it entirely -- which DOUBLE-COUNTS, because both strategies then
// contribute in full. powerHeuristic is Veach's beta = 2 variant: NOT a fault, a different legitimate choice,
// and the gate measures how much the choice is worth rather than asserting one.
fn misW(pThis : f32, pOther : f32) -> f32 {
  if ((P.faults & 1u) != 0u) { return 1.0; }
  if ((P.faults & 2u) != 0u) {
    let a2 = pThis * pThis;
    let b2 = pOther * pOther;
    return select(0.0, a2 / (a2 + b2), a2 + b2 > 0.0);
  }
  let s = pThis + pOther;
  return select(0.0, pThis / s, s > 0.0);
}

// One sample's contribution under whichever strategy is selected. The two strategies draw DIFFERENT
// directions from the same (u1, u2), which is what a renderer does: one sample budget, two taps.
fn contribution(k : u32) -> f32 {
  let u1 = (f32(k) + 0.5) / f32(P.nSamp);
  let u2 = vanDerCorput16(k);
  let wo = dirOf(P.cosO, 0.0);
  let L = dirOf(P.cosL, P.phiL);
  let cosMax = cos(P.tmax);
  var v : f32 = 0.0;

  if (P.strategy != 1u) {
    let wh = sampleVNDF(wo, P.alpha, u1, u2);
    let d = dot(wo, wh);
    let wi = 2.0 * d * wh - wo;
    if (wi.y > 0.0 && dot(wi, L) >= cosMax) {
      var w : f32 = 1.0;
      if (P.strategy >= 2u) {
        let pb = bsdfPdfAt(wo, wi, P.alpha);
        let pl = conePdf(P.tmax);
        w = misW(pb, pl);
        // misRenorm forces the pair to sum to exactly 1, which is how this round measures what v4409's ULP costs.
        if (P.strategy == 3u) { w = 1.0 - misW(pl, pb); }
      }
      v = v + w * g2(wo.y, wi.y, P.alpha) / g1(wo.y, P.alpha);
    }
  }

  if (P.strategy != 0u) {
    let wi = sampleCone(L, P.tmax, u1, u2);
    if (wi.y > 0.0) {
      let pl = conePdf(P.tmax);
      var w : f32 = 1.0;
      if (P.strategy >= 2u) { w = misW(pl, bsdfPdfAt(wo, wi, P.alpha)); }
      v = v + w * fCos(wo, wi, P.alpha) / pl;
    }
  }
  return v;
}

@compute @workgroup_size(64)
fn mis(@builtin(global_invocation_id) gid : vec3<u32>) {
  let lane = gid.x;
  if (lane >= P.laneCount) { return; }

  if (P.mode == 1u) {
    // The two weights at ONE direction, so their sum can be read rather than inferred. v4409 measured the
    // sum on arbitrary pdf pairs; these are the pdfs an estimator actually meets.
    if (lane >= P.count) { return; }
    let wo = dirOf(P.cosO, 0.0);
    let L = dirOf(P.cosL, P.phiL);
    let wi = sampleCone(L, P.tmax, (f32(lane) + 0.5) / f32(P.count), vanDerCorput16(lane));
    let pb = bsdfPdfAt(wo, wi, P.alpha);
    let pl = conePdf(P.tmax);
    part[lane * 2u]      = misW(pb, pl);
    part[lane * 2u + 1u] = misW(pl, pb);
    return;
  }

  if (P.mode == 2u) {
    // *** THE KERNEL'S OWN pdf RECONSTRUCTION, HELD TO THE pdf ITS OWN SAMPLER KNEW. ***
    // A sabotage of this function went 0 RED without this mode, and it deserved to: MIS is unbiased for ANY
    // pair of weights that sums to 1, so a wrong pdf inside the balance heuristic cannot move the estimator's
    // MEAN at all -- only its variance. Every mean-based check in this gate is therefore blind to it by
    // construction, and the only cure is to compare the two routes to the pdf directly, here, on the device.
    if (lane >= P.count) { return; }
    let wo = dirOf(P.cosO, 0.0);
    let wh = sampleVNDF(wo, P.alpha, (f32(lane) + 0.5) / f32(P.count), vanDerCorput16(lane));
    let d = dot(wo, wh);
    let wi = 2.0 * d * wh - wo;
    var known : f32 = 0.0;
    var rebuilt : f32 = 0.0;
    if (wi.y > 0.0 && d > 0.0) {
      known = g1(wo.y, P.alpha) * ggxD(wh.y, P.alpha) / (4.0 * wo.y);   // no reconstruction: wh is in hand
      rebuilt = bsdfPdfAt(wo, wi, P.alpha);                             // and the estimator's route
    }
    part[lane * 2u] = known;
    part[lane * 2u + 1u] = rebuilt;
    return;
  }

  // The estimator: per-lane sum and sum of squares, so the host gets both the mean AND the variance -- the
  // variance IS the subject here, not a diagnostic.
  var s1 : f32 = 0.0;
  var s2 : f32 = 0.0;
  var k = lane;
  loop {
    if (k >= P.nSamp) { break; }
    let c = contribution(k);
    s1 = s1 + c;
    s2 = s2 + c * c;
    k = k + P.laneCount;
  }
  part[lane * 2u] = s1;
  part[lane * 2u + 1u] = s2;
}`;

/** Six u32 then six f32, all scalars, 48 bytes. */
export function packMisParams({ mode = 0, strategy = 0, faults = 0, laneCount, nSamp = 0, count = 0,
                                alpha = 0, cosO = 0, cosL = 0, phiL = 0, tmax = 0 }) {
    const buf = new ArrayBuffer(48), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = mode; u[1] = strategy; u[2] = faults; u[3] = laneCount; u[4] = nSamp; u[5] = count;
    f[6] = alpha; f[7] = cosO; f[8] = cosL; f[9] = phiL; f[10] = tmax;
    return { buf, u32: u, f32: f };
}

/** Mean and single-sample sigma from the per-lane sums. The division is in f64 on the host, as always here. */
export function statsOf(partials, nSamp) {
    let s1 = 0, s2 = 0;
    for (let i = 0; i < partials.length / 2; i++) { s1 += partials[i * 2]; s2 += partials[i * 2 + 1]; }
    const mean = s1 / nSamp;
    return { mean, sigma: Math.sqrt(Math.max(0, s2 / nSamp - mean * mean)) };
}
