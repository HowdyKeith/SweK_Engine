// WebGLEngine/physics/render/fresnelWgsl.mjs -- v4416
//
// *** THE F = 1 THAT EVERY ROUND FROM v4408 TO v4413 CLOSED ITS UNCHECKED LIST WITH. ***
//
// Six rounds of microfacet work ran on a device with the Fresnel term set to one, and each of them said so:
// "FRESNEL, F = 1 THROUGHOUT". physics/render/fresnel.mjs has held the exact equations since v3491 and is
// gated hard at f64 -- Brewster from a sign, the critical angle from a boolean, R + T = 1 with T computed
// independently -- but it has never been near a GPU, and the microfacet lobe has never carried it.
//
// ---- WHY THE TWO HALVES BELONG IN ONE ROUND ------------------------------------------------------------------
//
// fresnel.mjs's header says the reason F was left out, and it is not laziness:
//
//     "The white furnace test sets F = 1 precisely to take Fresnel out of the picture, because with a real
//      Fresnel term energy LEGITIMATELY LEAVES the reflection lobe -- it is transmitted, not lost -- and the
//      furnace deficit would stop meaning 'this model fails to conserve energy'. THOSE TWO DEFICITS LOOK
//      IDENTICAL FROM THE NUMBER ALONE AND ONE IS A MODEL FAILURE WHILE THE OTHER IS PHYSICS."
//
// *** THAT SENTENCE IS AN ASSERTION UNTIL SOMEBODY MAKES THE TWO NUMBERS EQUAL. *** The gate does: at each
// roughness there is an index -- recovered by bisection, never typed -- at which a CORRECT lobe on a metal
// and a BROKEN lobe on a white surface return the same directional albedo to the last bit of f64. So a check
// on the furnace number certifies both, and the thing that separates them is not a tolerance. It is the
// TRANSMITTED SHARE, accumulated alongside the reflected one, which closes the deficit exactly in one case
// and is identically zero in the other -- fresnel-selfcheck.mjs's "T is never defined as 1 - R", lifted from
// a single interface to a whole lobe.
//
// ---- AND WHAT THE DEVICE ADDS THAT f64 CANNOT SHOW -------------------------------------------------------------
//
// *** BREWSTER'S ZERO DOES NOT EXIST IN f32, AND THE ANGLE IS STILL RECOVERABLE TO THE f32 FLOOR. *** The p
// amplitude passes through zero quadratically, so its SQUARE is flat there and locating the angle by hunting
// the minimum loses half the machine's digits -- the classic sqrt(eps). Locating it by the SIGN CHANGE loses
// none, because a sign is exact at every magnitude. Both routes run on the same device against the same
// function in mode `brewster`, and the gate measures the gap rather than asserting it.
//
// Two legitimate spellings are carried alongside the plants, because a variant is not a fault:
//
//   VARIANT.schlickLobe  -- Schlick instead of the exact equations, which is what real-time renderers ship
//   VARIANT.powFive      -- pow(m, 5.0) instead of m*m*m*m*m, which is what a port writes without thinking
//   VARIANT.separableG   -- the separable G2, which IS a model failure and is here to collide with Fresnel
//   VARIANT.fAtCosO      -- Fresnel evaluated at the MACROSCOPIC cosine instead of the microfacet's, which is
//                           a real and popular bug and is invisible at low roughness because the two coincide
//
// FAULT.pForS and FAULT.noTransmissionFactor are fresnel.mjs's two plants, transcribed so the detection split
// that round measured at f64 can be re-measured on f32 -- where "bit-identical at normal incidence" is a
// stronger claim than it was, because a different rounding could have broken the tie either way.
//
// Gated in physics/render/fresnelWgsl-selfcheck.mjs.
"use strict";

/** 0 the reflectance curve, 1 Brewster by two routes, 2 the critical angle, 3 the closure, 4 the lobe. */
export const MODE = Object.freeze({ curve: 0, brewster: 1, critical: 2, energy: 3, albedo: 4 });
/** fresnel.mjs's two plants, term for term. */
export const FAULT = Object.freeze({ pForS: 1, noTransmissionFactor: 2 });
/** Legitimate choices, NOT faults -- except separableG, which is a model failure kept here to collide. */
export const VARIANT = Object.freeze({ schlickLobe: 1, powFive: 2, separableG: 4, fAtCosO: 8 });

export const FRESNEL_WGSL = /* wgsl */ `
// fresnel.wgsl -- the exact equations, Schlick, and the GGX lobe carrying one of them. Term for term with
// physics/render/fresnel.mjs and physics/render/microfacet.mjs; nothing here is derived a second time.
struct Params {
  mode      : u32,
  faults    : u32,
  variant   : u32,
  laneCount : u32,
  count     : u32,
  nSamp     : u32,
  n1        : f32,
  n2        : f32,
  alpha     : f32,
  cosO      : f32,
  f0        : f32,
  padA      : f32,   // MODE.brewster reads it as the bracket's magnitude floor -- see the guard below
};
@group(0) @binding(0) var<uniform>             P   : Params;
@group(0) @binding(1) var<storage, read_write> out : array<f32>;

const PI : f32 = 3.141592653589793;

struct Fr { Rs : f32, Rp : f32, Ts : f32, Tp : f32, tir : f32, cosT : f32, };

// The exact Fresnel equations for one interface. TOTAL INTERNAL REFLECTION IS A BRANCH, NOT A LARGE NUMBER --
// past the critical angle there is no transmitted ray, so R is exactly 1 at any precision and no tolerance
// enters. The transmittance carries (n2 cos_t)/(n1 cos_i), the ratio of projected solid angles, WITHOUT WHICH
// |t|^2 is not a transmittance at all and R + T does not close.
fn fresnelAt(cosI : f32, n1 : f32, n2 : f32) -> Fr {
  let ci = clamp(cosI, 0.0, 1.0);
  let sinT = (n1 / n2) * sqrt(max(0.0, 1.0 - ci * ci));
  if (sinT >= 1.0) { return Fr(1.0, 1.0, 0.0, 0.0, 1.0, 0.0); }
  let ct = sqrt(1.0 - sinT * sinT);
  let rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
  var rpv = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
  if ((P.faults & 1u) != 0u) { rpv = rs; }
  let ts = 2.0 * n1 * ci / (n1 * ci + n2 * ct);
  let tp = 2.0 * n1 * ci / (n2 * ci + n1 * ct);
  var k = (n2 * ct) / (n1 * ci);
  if ((P.faults & 2u) != 0u) { k = 1.0; }
  return Fr(rs * rs, rpv * rpv, k * ts * ts, k * tp * tp, 0.0, ct);
}

// The p amplitude on its own, because its SIGN is what locates Brewster and its square hides it.
fn rpAmp(cosI : f32, n1 : f32, n2 : f32) -> f32 {
  let ci = clamp(cosI, 0.0, 1.0);
  let sinT = (n1 / n2) * sqrt(max(0.0, 1.0 - ci * ci));
  if (sinT >= 1.0) { return 1.0; }
  let ct = sqrt(1.0 - sinT * sinT);
  if ((P.faults & 1u) != 0u) { return (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct); }
  return (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
}

// Schlick. The fifth power is written as four multiplies by default and as pow() under VARIANT.powFive,
// because pow(x, 5.0) on a GPU is exp2(5 * log2(x)) and a port that reaches for it is choosing a different
// function, not a different spelling.
fn schlickF(cosI : f32, f0 : f32) -> f32 {
  let m = 1.0 - clamp(cosI, 0.0, 1.0);
  if ((P.variant & 2u) != 0u) { return f0 + (1.0 - f0) * pow(m, 5.0); }
  return f0 + (1.0 - f0) * m * m * m * m * m;
}

fn ggxLambda(cosW : f32, a : f32) -> f32 {
  let c2 = cosW * cosW;
  let tan2 = (1.0 - c2) / max(c2, 1.0e-16);
  return (-1.0 + sqrt(1.0 + a * a * tan2)) / 2.0;
}
fn g1(cosW : f32, a : f32) -> f32 { return 1.0 / (1.0 + ggxLambda(cosW, a)); }
fn g2(cosO : f32, cosI : f32, a : f32) -> f32 {
  // The SEPARABLE form is not an approximation of the height-correlated one, it is a different model, and it
  // loses energy. It is a VARIANT flag rather than a fault bit because this round needs it to be reachable.
  if ((P.variant & 4u) != 0u) { return g1(cosO, a) * g1(cosI, a); }
  return 1.0 / (1.0 + ggxLambda(cosO, a) + ggxLambda(cosI, a));
}

fn vanDerCorput16(i : u32) -> f32 {
  var b : u32 = i & 0xffffu;
  b = ((b & 0x00ffu) << 8u) | ((b & 0xff00u) >> 8u);
  b = ((b & 0x0f0fu) << 4u) | ((b & 0xf0f0u) >> 4u);
  b = ((b & 0x3333u) << 2u) | ((b & 0xccccu) >> 2u);
  b = ((b & 0x5555u) << 1u) | ((b & 0xaaaau) >> 1u);
  return f32(b & 0xffffu) / 65536.0;
}

// Heitz 2018 listing 3, isotropic -- v4410's port, reused rather than re-derived.
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

@compute @workgroup_size(64)
fn fres(@builtin(global_invocation_id) gid : vec3<u32>) {
  let lane = gid.x;
  if (lane >= P.laneCount) { return; }

  if (P.mode == 0u) {
    // The reflectance curve, plus BOTH spellings of Schlick's fifth power at the same cosine.
    if (lane >= P.count) { return; }
    // *** THE COSINES ARE k/count WITH count A POWER OF TWO, SO EVERY ONE IS EXACT AT BOTH PRECISIONS. ***
    // A grid of (k + 0.5)/count would put a ROUNDED argument into each machine and the comparison would
    // measure the grid as well as the function. It also makes the last lane cos = 1 EXACTLY, which is where
    // the polarisation plant's bit-identity has to be read, and never cos = 0, where the transmission
    // factor's denominator vanishes.
    let ci = f32(lane + 1u) / f32(P.count);
    let f = fresnelAt(ci, P.n1, P.n2);
    let m = 1.0 - clamp(ci, 0.0, 1.0);
    out[lane * 6u + 0u] = 0.5 * (f.Rs + f.Rp);
    out[lane * 6u + 1u] = f.Rs;
    out[lane * 6u + 2u] = f.Rp;
    out[lane * 6u + 3u] = 0.5 * (f.Ts + f.Tp);
    out[lane * 6u + 4u] = P.f0 + (1.0 - P.f0) * m * m * m * m * m;
    out[lane * 6u + 5u] = P.f0 + (1.0 - P.f0) * pow(m, 5.0);
    return;
  }

  if (P.mode == 1u) {
    // *** THE SAME ANGLE, THE SAME DEVICE, THE SAME FUNCTION -- FOUND TWICE, ONCE FROM A SIGN AND ONCE FROM
    // A MAGNITUDE. *** r_p passes through zero LINEARLY, so its square is flat there: the minimum route can
    // only resolve the angle to about sqrt(eps), while a sign is exact at every magnitude including denormal.
    if (lane != 0u) { return; }
    let lo0 = 0.01;
    let hi0 = 0.999;
    let aEnd = rpAmp(lo0, P.n1, P.n2);
    let bEnd = rpAmp(hi0, P.n1, P.n2);
    out[6] = aEnd;
    out[7] = bEnd;
    // *** A BISECTION BRACKETS A ROOT AND CANNOT INVENT ONE. *** fresnel.mjs's guard, ported with its reason:
    // at n1 = n2 the amplitude is identically zero and the endpoints come back as float dust, whose SIGNS are
    // a coin flip -- so a signs-only guard bisects on rounding noise and returns an angle for an interface
    // that does not exist. The magnitude floor is what refuses. -1 is the sentinel for "no such angle".
    if (abs(aEnd) < P.padA || abs(bEnd) < P.padA || sign(aEnd) == sign(bEnd)) {
      out[0] = -1.0; out[1] = -1.0; out[2] = -1.0; out[3] = 0.0; out[4] = 0.0; out[5] = 0.0;
      return;
    }
    var lo = lo0;
    var hi = hi0;
    let sLo = sign(aEnd);
    for (var i = 0u; i < 60u; i = i + 1u) {
      let m = 0.5 * (lo + hi);
      if (sign(rpAmp(m, P.n1, P.n2)) == sLo) { lo = m; } else { hi = m; }
    }
    let cSign = 0.5 * (lo + hi);

    // Route two: hunt the minimum of r_p SQUARED. The square is FLAT at the root, which is the shape the
    // folklore says costs half the machine's digits.
    var a = lo0;
    var b = hi0;
    for (var i = 0u; i < 200u; i = i + 1u) {
      let m1 = a + (b - a) / 3.0;
      let m2 = b - (b - a) / 3.0;
      let v1 = rpAmp(m1, P.n1, P.n2);
      let v2 = rpAmp(m2, P.n1, P.n2);
      if (v1 * v1 < v2 * v2) { b = m2; } else { a = m1; }
    }
    let cMinRp = 0.5 * (a + b);

    // Route three: hunt the minimum of the UNPOLARISED reflectance -- the only one of the three a renderer
    // can actually observe, because it is the number that reaches a pixel. Its minimum sits ON TOP OF R_s/2
    // rather than at zero, so resolving it means distinguishing values that differ in their low bits.
    var c = lo0;
    var d = hi0;
    for (var i = 0u; i < 200u; i = i + 1u) {
      let m1 = c + (d - c) / 3.0;
      let m2 = d - (d - c) / 3.0;
      let f1 = fresnelAt(m1, P.n1, P.n2);
      let f2 = fresnelAt(m2, P.n1, P.n2);
      if (0.5 * (f1.Rs + f1.Rp) < 0.5 * (f2.Rs + f2.Rp)) { d = m2; } else { c = m1; }
    }
    let cMinR = 0.5 * (c + d);
    let fm = fresnelAt(cMinR, P.n1, P.n2);

    out[0] = cSign;
    out[1] = cMinRp;
    out[2] = cMinR;
    out[3] = rpAmp(cSign, P.n1, P.n2);
    out[4] = rpAmp(cMinRp, P.n1, P.n2);
    out[5] = 0.5 * (fm.Rs + fm.Rp);
    return;
  }

  if (P.mode == 2u) {
    // The critical angle read off a YES/NO. There is no magnitude in the loop for a compensating error to
    // hide in -- the bisection asks only WHETHER a transmitted ray exists.
    if (lane != 0u) { return; }
    var a = 0.999;
    var b = 0.0001;
    let atB = fresnelAt(b, P.n1, P.n2).tir;
    for (var i = 0u; i < 60u; i = i + 1u) {
      let m = 0.5 * (a + b);
      if (fresnelAt(m, P.n1, P.n2).tir == atB) { b = m; } else { a = m; }
    }
    let c = 0.5 * (a + b);
    out[0] = c;
    out[1] = fresnelAt(c * 0.99, P.n1, P.n2).Rs;              // inside TIR: exactly 1
    out[2] = fresnelAt(min(1.0, c * 1.01), P.n1, P.n2).Rs;    // outside: strictly below 1
    out[3] = fresnelAt(c * 0.99, P.n1, P.n2).Ts;              // and nothing transmitted
    return;
  }

  if (P.mode == 3u) {
    // R + T - 1, both polarisations, with T computed from the transmission amplitudes rather than as 1 - R.
    if (lane >= P.count) { return; }
    let ci = f32(lane + 1u) / f32(P.count);
    let f = fresnelAt(ci, P.n1, P.n2);
    out[lane * 2u + 0u] = f.Rs + f.Ts - 1.0;
    out[lane * 2u + 1u] = f.Rp + f.Tp - 1.0;
    return;
  }

  // mode 4 -- the lobe with a real Fresnel term, and THE TRANSMITTED SHARE ACCUMULATED ALONGSIDE IT. Under
  // visible-normal sampling the estimator is F * G2 / G1(wo); the complement (1 - F) * G2 / G1(wo) is the
  // energy that went THROUGH the interface, and the two must sum to the F = 1 albedo sample for sample.
  var sR : f32 = 0.0;
  var sT : f32 = 0.0;
  var sOne : f32 = 0.0;
  let so = sqrt(max(0.0, 1.0 - P.cosO * P.cosO));
  let wo = vec3<f32>(so, P.cosO, 0.0);
  var k = lane;
  loop {
    if (k >= P.nSamp) { break; }
    let wh = sampleVNDF(wo, P.alpha, (f32(k) + 0.5) / f32(P.nSamp), vanDerCorput16(k));
    let d = dot(wo, wh);
    let wi = 2.0 * d * wh - wo;
    if (wi.y > 0.0) {
      let w = g2(wo.y, wi.y, P.alpha) / g1(wo.y, P.alpha);
      // *** FRESNEL IS A FUNCTION OF THE ANGLE AT THE MICROFACET, NOT AT THE SURFACE. *** Passing cos_o is
      // the popular version of this mistake and it is invisible wherever the lobe is narrow, because the two
      // angles coincide in that limit -- so a smooth-material fixture certifies it.
      let ca = select(d, P.cosO, (P.variant & 8u) != 0u);
      var F : f32;
      if ((P.variant & 1u) != 0u) {
        F = schlickF(ca, P.f0);
      } else {
        let f = fresnelAt(ca, P.n1, P.n2);
        F = 0.5 * (f.Rs + f.Rp);
      }
      sR = sR + F * w;
      sT = sT + (1.0 - F) * w;
      sOne = sOne + w;
    }
    k = k + P.laneCount;
  }
  out[lane * 4u + 0u] = sR;
  out[lane * 4u + 1u] = sT;
  out[lane * 4u + 2u] = sOne;
  out[lane * 4u + 3u] = 0.0;
}`;

/** Six u32 then six f32, all scalars, 48 bytes -- the shape every kernel in this arc uses. */
export function packFresnelParams({ mode = 0, faults = 0, variant = 0, laneCount = 1, count = 0, nSamp = 0,
                                    n1 = 1, n2 = 1.5, alpha = 0, cosO = 0, f0 = 0, eps = 0 }) {
    const buf = new ArrayBuffer(48), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = mode; u[1] = faults; u[2] = variant; u[3] = laneCount; u[4] = count; u[5] = nSamp;
    f[6] = n1; f[7] = n2; f[8] = alpha; f[9] = cosO; f[10] = f0; f[11] = eps;
    return { buf, u32: u, f32: f };
}

/** Fold the per-lane partials of MODE.albedo into the three means. The division is in f64 on the host. */
export function albedoOf(partials, nSamp) {
    let R = 0, T = 0, one = 0;
    for (let i = 0; i < partials.length / 4; i++) { R += partials[i * 4]; T += partials[i * 4 + 1]; one += partials[i * 4 + 2]; }
    return { E: R / nSamp, T: T / nSamp, one: one / nSamp };
}
