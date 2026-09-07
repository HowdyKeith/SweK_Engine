// WebGLEngine/physics/render/microfacetAnisoWgsl.mjs -- v4412
//
// *** ANISOTROPIC GGX ON A DEVICE -- THE PARAMETER EVERY KEY IN THIS ARC HAS BEEN AVERAGING OVER. ***
//
// v4408 put the lobe on a device, v4409 the sampling half, v4410 the visible-normal sampler, v4411 the
// compensation. All four graded an ISOTROPIC model, and that is not a simplification anybody chose -- it is
// written into microfacet.mjs's signature. `D(cosM, alpha)` takes a COSINE, and a lobe that knows only the
// angle from the normal cannot know which way the surface is brushed.
//
//     D(m) = 1 / (pi ax ay ((m.x/ax)^2 + (m.z/ay)^2 + m.y^2)^2)        y up, x tangent, z bitangent
//
// ---- THE FRAME STOPS BEING INCIDENTAL, WHICH IS THE ROUND'S REASON TO EXIST -------------------------------------
//
// v4409's section 7 measured that its fixture could not see a tangent-frame error at all: wo lay in the plane
// z = 0, so wh.z never reached dot(wo, wh) and the departure was EXACTLY zero. It named the limitation and
// said handedness was untested rather than harmless. v4410 began to test it. *** HERE THE FRAME IS A PHYSICAL
// PARAMETER: *** the azimuth of the view direction changes the answer by up to 17.6%, and it changes it by
// EXACTLY ZERO when ax = ay. Those two facts together are the round's control.
//
// ---- AND A KEY THAT DOES NOT EXIST IN THE ISOTROPIC CASE --------------------------------------------------------
//
// *** THE SWAP IDENTITY. *** Rotate the tangent frame a quarter turn about the normal and exchange ax with ay:
// it is the same surface described from a turned frame, so the lobe must not move. It is BIT-EXACT and the
// reason is arithmetic rather than luck -- the two expressions sum the same two terms in opposite order, and
// IEEE addition is commutative. So this is one of the very few keys in the tree that can be asserted as an
// exact zero at f32 without earning a floor first.
//
// ---- WHAT IS NOT NEW ----------------------------------------------------------------------------------------
//
// HEITZ'S SAMPLER WAS ALWAYS ANISOTROPIC. v4410 ported listing 3 and used ax = ay; the two roughnesses enter
// at exactly the two places the paper puts them, the 3.2 stretch and the 3.4 unstretch, and nothing else in
// that algorithm changes. So the sampler is not a new port here -- it is the same one with its second
// parameter finally supplied, and G2 / G1(wo) is still the weight.
//
// Gated in physics/render/microfacetAnisoWgsl-selfcheck.mjs.
"use strict";

/** Modes. `swap` is the key that has no isotropic counterpart. */
export const MODE = Object.freeze({ ndf: 0, weak: 1, strong: 2, identity: 3, swap: 4 });
export const FAULT = Object.freeze({ separable: 1, isoLambda: 2 });

export const ANISO_WGSL = /* wgsl */ `
// microfacet-aniso.wgsl -- physics/render/microfacet.mjs's Daniso, lambdaAniso and the anisotropic visible-
// normal sampler, term for term. y is up; x is the TANGENT and z the BITANGENT, which is the frame the whole
// round is about.
struct Params {
  mode      : u32,
  faults    : u32,
  laneCount : u32,
  nTheta    : u32,
  nPhi      : u32,
  count     : u32,
  ax        : f32,
  ay        : f32,
  cosO      : f32,
  phiO      : f32,   // THE VIEW AZIMUTH, which is a free parameter for the first time in this arc
  padA      : f32,
  padB      : f32,
};
@group(0) @binding(0) var<uniform>             P    : Params;
@group(0) @binding(1) var<storage, read_write> part : array<f32>;

const PI : f32 = 3.141592653589793;

// A SUM OF POSITIVES, for v3494's reason and with v4408's finding in view: nothing here cancels, where the
// textbook cos^2(a^2 - 1) + 1 does -- and it matters more than in the isotropic case, because the tangential
// terms are divided by roughnesses that can be small.
fn dAniso(m : vec3<f32>, ax : f32, ay : f32) -> f32 {
  if (m.y <= 0.0) { return 0.0; }
  let tx = m.x / ax;
  let tz = m.z / ay;
  let t = tx * tx + tz * tz + m.y * m.y;
  // The parentheses are the swap identity: multiplication is commutative but NOT associative, so (PI ax) ay
  // and (PI ay) ax differ by a rounding. Grouped this way the only operation asked to commute is ax * ay.
  return 1.0 / (PI * (ax * ay) * (t * t));
}

// The roughness a direction sees is its own azimuthal blend of ax and ay, kept implicit rather than computed
// as an angle and a cos^2/sin^2 pair -- which would be a second place for the frame to be wrong.
fn lambdaAniso(w : vec3<f32>, ax : f32, ay : f32) -> f32 {
  let c2 = w.y * w.y;
  if (c2 >= 1.0) { return 0.0; }
  let tx = ax * w.x;
  let tz = ay * w.z;
  // isoLambda is the plant that matters: the ISOTROPIC Lambda used with the anisotropic D, which is the
  // anisotropic form of exactly the mistake the weak furnace test was invented to catch.
  let aniso = (tx * tx + tz * tz) / c2;
  let iso = ax * ax * (1.0 - c2) / c2;
  return (-1.0 + sqrt(1.0 + select(aniso, iso, (P.faults & 2u) != 0u))) / 2.0;
}

fn g1A(w : vec3<f32>, ax : f32, ay : f32) -> f32 { return 1.0 / (1.0 + lambdaAniso(w, ax, ay)); }
fn g2A(wo : vec3<f32>, wi : vec3<f32>, ax : f32, ay : f32) -> f32 {
  let sep = g1A(wo, ax, ay) * g1A(wi, ax, ay);
  let hc = 1.0 / (1.0 + lambdaAniso(wo, ax, ay) + lambdaAniso(wi, ax, ay));
  return select(hc, sep, (P.faults & 1u) != 0u);
}

fn woDir() -> vec3<f32> {
  let so = sqrt(max(0.0, 1.0 - P.cosO * P.cosO));
  return vec3<f32>(so * cos(P.phiO), P.cosO, so * sin(P.phiO));
}

// Heitz listing 3, ANISOTROPIC -- the form the paper actually publishes. v4410 ported this with ax = ay; the
// two roughnesses enter at 3.2 and 3.4 and nothing else changes.
fn sampleVNDF(wo : vec3<f32>, ax : f32, ay : f32, u1 : f32, u2 : f32) -> vec3<f32> {
  let Ve = vec3<f32>(wo.x, wo.z, wo.y);                        // y-up -> the paper's z-up
  let Vh = normalize(vec3<f32>(ax * Ve.x, ay * Ve.y, Ve.z));   // 3.2 stretch
  let lensq = Vh.x * Vh.x + Vh.y * Vh.y;
  let T1 = select(vec3<f32>(1.0, 0.0, 0.0),
                  vec3<f32>(-Vh.y, Vh.x, 0.0) * inverseSqrt(lensq), lensq > 0.0);
  let T2 = cross(Vh, T1);
  let r = sqrt(u1);
  let phi = 2.0 * PI * u2;
  let t1 = r * cos(phi);
  let s = 0.5 * (1.0 + Vh.z);
  let t2 = (1.0 - s) * sqrt(max(0.0, 1.0 - t1 * t1)) + s * (r * sin(phi));
  let k = sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2));
  let Nh = t1 * T1 + t2 * T2 + k * Vh;
  let Ne = normalize(vec3<f32>(ax * Nh.x, ay * Nh.y, max(0.0, Nh.z)));   // 3.4 unstretch
  return vec3<f32>(Ne.x, Ne.z, Ne.y);                          // z-up -> y-up
}

fn vanDerCorput16(i : u32) -> f32 {
  var b : u32 = i & 0xffffu;
  b = ((b & 0x00ffu) << 8u) | ((b & 0xff00u) >> 8u);
  b = ((b & 0x0f0fu) << 4u) | ((b & 0xf0f0u) >> 4u);
  b = ((b & 0x3333u) << 2u) | ((b & 0xccccu) >> 2u);
  b = ((b & 0x5555u) << 1u) | ((b & 0xaaaau) >> 1u);
  return f32(b & 0xffffu) / 65536.0;
}

@compute @workgroup_size(64)
fn aniso(@builtin(global_invocation_id) gid : vec3<u32>) {
  let lane = gid.x;
  if (lane >= P.laneCount) { return; }

  if (P.mode == 4u) {
    // *** THE SWAP IDENTITY, PER LANE AND WITH NO INTEGRAL. *** Rotate m a quarter turn about the normal and
    // exchange the two roughnesses. Same surface, turned frame. The two expressions sum the SAME TWO TERMS in
    // opposite order, and IEEE addition is commutative, so this is exactly zero and not nearly zero.
    if (lane >= P.count) { return; }
    let th = (f32(lane / 16u) + 0.5) / 16.0 * (PI / 2.0);
    let ph = (f32(lane % 16u) + 0.5) / 16.0 * 2.0 * PI;
    let m = vec3<f32>(sin(th) * cos(ph), cos(th), sin(th) * sin(ph));
    let mr = vec3<f32>(-m.z, m.y, m.x);
    part[lane * 2u]      = dAniso(m, P.ax, P.ay);
    part[lane * 2u + 1u] = dAniso(mr, P.ay, P.ax);
    return;
  }

  if (P.mode == 3u) {
    // f cos_i / pdf against G2 / G1(wo), per direction, no averaging -- v4410's key with two roughnesses.
    if (lane >= P.count) { return; }
    let wo = woDir();
    let wh = sampleVNDF(wo, P.ax, P.ay, (f32(lane) + 0.5) / f32(P.count), vanDerCorput16(lane));
    let dOH = dot(wo, wh);
    let wi = 2.0 * dOH * wh - wo;
    var lr : f32 = 0.0;
    var sh : f32 = 0.0;
    var okv : f32 = 0.0;
    if (wi.y > 0.0 && dOH > 0.0) {
      let pdf = g1A(wo, P.ax, P.ay) * dAniso(wh, P.ax, P.ay) / (4.0 * wo.y);
      if (pdf > 0.0) {
        lr = dAniso(wh, P.ax, P.ay) * g2A(wo, wi, P.ax, P.ay) / (4.0 * wo.y * wi.y) * wi.y / pdf;
        sh = g2A(wo, wi, P.ax, P.ay) / g1A(wo, P.ax, P.ay);
        okv = 1.0;
      }
    }
    part[lane * 3u] = sh; part[lane * 3u + 1u] = lr; part[lane * 3u + 2u] = okv;
    return;
  }

  if (P.mode == 0u) {
    // INT D(m)(n.m) dm over the hemisphere, which must be 1 at every (ax, ay). A TWO-dimensional grid now:
    // an anisotropic lobe is not azimuthally symmetric, so the phi integral is real work rather than a 2 pi.
    let dth = (PI / 2.0) / f32(P.nTheta);
    let dph = 2.0 * PI / f32(P.nPhi);
    var s : f32 = 0.0;
    var i = lane;
    loop {
      if (i >= P.nTheta) { break; }
      let th = (f32(i) + 0.5) * dth;
      let ct = cos(th);
      let st = sin(th);
      var j : u32 = 0u;
      loop {
        if (j >= P.nPhi) { break; }
        let ph = (f32(j) + 0.5) * dph;
        s = s + dAniso(vec3<f32>(st * cos(ph), ct, st * sin(ph)), P.ax, P.ay) * ct * st * dth * dph;
        j = j + 1u;
      }
      i = i + P.laneCount;
    }
    part[lane] = s;
    return;
  }

  // The furnace integrals: weak over the full sphere with G1, strong over the hemisphere with G2.
  let strong = P.mode == 2u;
  let wo = woDir();
  let thMax = select(PI, PI / 2.0, strong);
  let dth = thMax / f32(P.nTheta);
  let dph = 2.0 * PI / f32(P.nPhi);
  var s : f32 = 0.0;
  var i = lane;
  loop {
    if (i >= P.nTheta) { break; }
    let th = (f32(i) + 0.5) * dth;
    let ct = cos(th);
    let st = sin(th);
    var j : u32 = 0u;
    loop {
      if (j >= P.nPhi) { break; }
      let ph = (f32(j) + 0.5) * dph;
      let wi = vec3<f32>(st * cos(ph), ct, st * sin(ph));
      let h = wo + wi;
      let hl = sqrt(dot(h, h));
      if (hl >= 1.0e-9) {
        let wh = h / hl;
        let mask = select(select(0.0, g1A(wo, P.ax, P.ay), dot(wo, wh) / wo.y > 0.0),
                          g2A(wo, wi, P.ax, P.ay), strong);
        s = s + dAniso(wh, P.ax, P.ay) * mask / (4.0 * abs(wo.y)) * st * dth * dph;
      }
      j = j + 1u;
    }
    i = i + P.laneCount;
  }
  part[lane] = s;
}`;

/** Six u32 then four f32, all scalars, 48 bytes. */
export function packAnisoParams({ mode, faults = 0, laneCount, nTheta = 0, nPhi = 0, count = 0,
                                  ax = 0, ay = 0, cosO = 0, phiO = 0 }) {
    const buf = new ArrayBuffer(48), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = mode; u[1] = faults; u[2] = laneCount; u[3] = nTheta; u[4] = nPhi; u[5] = count;
    f[6] = ax; f[7] = ay; f[8] = cosO; f[9] = phiO;
    return { buf, u32: u, f32: f };
}

/** The host half: add the f32 partials in f64. The kernel already carries its own dtheta dphi. */
export const sumOf = (partials) => { let s = 0; for (let i = 0; i < partials.length; i++) s += partials[i]; return s; };
