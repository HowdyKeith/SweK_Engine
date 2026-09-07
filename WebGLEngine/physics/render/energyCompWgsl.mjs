// WebGLEngine/physics/render/energyCompWgsl.mjs -- v4411
//
// *** THE MULTIPLE-SCATTERING COMPENSATION ON A DEVICE -- AND THE CLOSURE IT IS GRADED BY CANNOT SEE ITS OWN
// TABLE. ***
//
// physics/render/energyCompensation.mjs (v3492) is the rare case where the answer key existed before the code:
// v3490 measured what single-scattering GGX throws away, and this term returns it, under a requirement written
// down a round earlier -- E + INT f_ms cos dw = 1, at every roughness and every view angle.
//
//     f_ms(mu_o, mu_i) = (1 - E(mu_o)) (1 - E(mu_i)) / (pi (1 - E_avg))       E_avg = 2 INT E(mu) mu dmu
//
// *** THE CLOSURE IS ALGEBRA IN WHATEVER E IT IS HANDED, AND THAT IS THIS ROUND'S SUBJECT. *** Integrate f_ms
// against cos and the denominator cancels: INT f_ms cos dw = 1 - E(mu_o), EXACTLY, for ANY table. So the
// closure reads 1 whether E is right or nonsense. That module's header says "AN EXACT CLOSURE IS PROOF OF
// CONSISTENCY, NEVER OF CORRECTNESS", written at v3492 as a caution; v4411 turns it into a measurement in the
// one place it was pointed at itself -- hand it an E of 0.039 for a surface returning 0.982 of its light and
// the closure still reads 1.00014, while the lobe manufactures 96% of that surface's energy out of nothing.
//
// ---- WHAT THE TABLE IS FOR AND WHY IT GOES ON A DEVICE AT ALL ------------------------------------------------
//
// A renderer ships E as a TEXTURE and interpolates it per shading point. So the device's job is not to build
// the table -- that is a bake -- it is to READ one and integrate the lobe, which is what this kernel does. The
// table arrives as a storage buffer, exactly as a texture would, and the kernel does what a shader would do:
// albedoAt() by linear interpolation, then the hemisphere integral.
//
// TWO THINGS ARE THEREFORE MEASURABLE HERE THAT ARE NOT MEASURABLE ON THE CPU:
//
//   1. Whether the closure survives f32. The residual at K = 24 is around 1e-5 at f64; binary32 has about
//      1.2e-7 of relative resolution and the integral sums a few hundred terms, so the two are within two
//      orders of each other and it is not obvious which wins. Measured rather than assumed.
//   2. Whether the three device-measured E's this arc produced -- v4408's quadrature, v4409's NDF sampler and
//      v4410's visible-normal sampler, which differ at about 1e-4 -- move the compensation by more or less
//      than that. The lobe divides by (1 - E_avg), which is SMALL at low roughness, so a 1e-4 error in E can
//      be amplified. That amplification is the round's second number and nobody had computed it.
//
// Gated in physics/render/energyCompWgsl-selfcheck.mjs.
"use strict";

/** Fault bits. Both are energyCompensation.mjs's own named plants, as uniform bits rather than a second kernel. */
export const FAULT = Object.freeze({ noDenominator: 1 });

/** 0: the closure, one lane per stripe of the hemisphere grid. 1: the lobe itself, one pair per lane. */
export const MODE = Object.freeze({ closure: 0, lobe: 1 });

export const COMP_WGSL = /* wgsl */ `
// energy-compensation.wgsl -- physics/render/energyCompensation.mjs's msLobe and compensatedAlbedo, term for
// term. The E table arrives as a buffer because that is how a renderer ships it: a texture, read and
// interpolated per shading point. NOTHING HERE BUILDS THE TABLE -- that is a bake, and it is the CPU's job.
struct Params {
  mode      : u32,
  faults    : u32,
  laneCount : u32,
  K         : u32,   // table entries in mu, a REAL parameter of the method and not an implementation detail
  nTheta    : u32,   // the hemisphere grid the lobe is integrated on
  count     : u32,
  hostTrig  : u32,   // v4411 -- read sin and cos of the grid from the buffer instead of computing them.
  padA      : u32,
  muO       : f32,
  eAvg      : f32,
};
@group(0) @binding(0) var<uniform>             P     : Params;
@group(0) @binding(1) var<storage, read_write> part  : array<f32>;
@group(0) @binding(2) var<storage, read>       table : array<f32>;
// The theta grid's sine and cosine, in f64 on the host and stored as f32. v4408 measured that WGSL bounds sin
// and cos by 2^-11 ABSOLUTE, so this is the only way to ask whether a residual belongs to the transcendental.
@group(0) @binding(3) var<storage, read>       trig  : array<f32>;

const PI : f32 = 3.141592653589793;

// energyCompensation.mjs albedoAt(): linear interpolation into the table, clamped at both ends. This is what a
// shader does with a 1D texture and it is deliberately NOT a smarter interpolation -- the closure residual's
// order in K is a statement about THIS interpolation, and improving it here would break that measurement.
fn albedoAt(mu : f32) -> f32 {
  let x = mu * f32(P.K) - 0.5;
  let i = u32(clamp(floor(x), 0.0, f32(P.K - 2u)));
  let f = clamp(x - f32(i), 0.0, 1.0);
  return table[i] * (1.0 - f) + table[i + 1u] * f;
}

// The multiple-scattering lobe. noDenominator drops the 1/(1 - E_avg): it UNDER-compensates by exactly
// (1 - E) E_avg, and at low roughness E_avg -> 1 so it compensates almost nothing -- invisible exactly where
// there was almost nothing to compensate, which is that module's own description of the plant.
fn msLobe(muO : f32, muI : f32) -> f32 {
  let num = (1.0 - albedoAt(muO)) * (1.0 - albedoAt(muI));
  let den = select(PI * (1.0 - P.eAvg), PI, (P.faults & 1u) != 0u);
  return num / den;
}

@compute @workgroup_size(64)
fn compensate(@builtin(global_invocation_id) gid : vec3<u32>) {
  let lane = gid.x;
  if (lane >= P.laneCount) { return; }

  if (P.mode == 1u) {
    // The lobe at a grid of (mu_o, mu_i), so reciprocity is checked on the DEVICE's arithmetic rather than
    // inferred from the CPU's. The expression is symmetric by construction and this asks whether f32 agrees.
    if (lane >= P.count) { return; }
    let n = P.count;
    let a = (f32(lane / 16u) + 0.5) / 16.0;
    let b = (f32(lane % 16u) + 0.5) / 16.0;
    part[lane * 2u]      = msLobe(a, b);
    part[lane * 2u + 1u] = msLobe(b, a);
    return;
  }

  // *** THE HEMISPHERE INTEGRAL IS COMPUTED AND NEVER REPLACED BY THE CLOSED FORM (1 - E). *** Substituting it
  // would make this return 1 by construction and the gate would be grading arithmetic. energyCompensation.mjs
  // says exactly that about its own CPU version; a port that took the shortcut would be a different function
  // wearing the same name.
  let dth = (PI / 2.0) / f32(P.nTheta);
  var s : f32 = 0.0;
  var i = lane;
  loop {
    if (i >= P.nTheta) { break; }
    let th = (f32(i) + 0.5) * dth;
    let ct = select(cos(th), trig[i * 2u + 1u], P.hostTrig == 1u);
    let st = select(sin(th), trig[i * 2u], P.hostTrig == 1u);
    s = s + msLobe(P.muO, ct) * ct * st * dth;
    i = i + P.laneCount;
  }
  part[lane] = s;
}`;

/** Seven u32, a pad, then two f32, all scalars, 48 bytes. */
export function packCompParams({ mode, faults = 0, laneCount, K = 0, nTheta = 0, count = 0,
                                 hostTrig = 0, muO = 0, eAvg = 0 }) {
    const buf = new ArrayBuffer(48), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = mode; u[1] = faults; u[2] = laneCount; u[3] = K; u[4] = nTheta; u[5] = count; u[6] = hostTrig;
    f[8] = muO; f[9] = eAvg;
    return { buf, u32: u, f32: f };
}

/** The theta grid's sine and cosine at the kernel's own midpoints, taken in f64 and stored as f32. */
export function trigTable(nTheta) {
    const t = new Float32Array(nTheta * 2), dth = Math.fround(Math.fround(Math.PI) / 2 / Math.fround(nTheta));
    for (let i = 0; i < nTheta; i++) {
        const th = Math.fround(Math.fround(Math.fround(i) + 0.5) * dth);
        t[i * 2] = Math.sin(th); t[i * 2 + 1] = Math.cos(th);
    }
    return t;
}

/**
 * The host half: add the f32 partials in f64, apply the 2 PI the CPU applies last, and add E(mu_o).
 *
 * *** E(mu_o) IS READ THROUGH THE SAME INTERPOLATION THE KERNEL USES, not from the table directly. *** The
 * closure is E(mu_o) + INT f_ms cos dw, and both terms must come from the same reading of the table or the
 * residual would carry a difference between two ways of asking the same question.
 */
export function closeFrom(partials, table, muO) {
    let s = 0;
    for (let i = 0; i < partials.length; i++) s += partials[i];
    return albedoAtJs(table, muO) + s * 2 * Math.PI;
}

/** energyCompensation.mjs albedoAt(), against a raw array. Kept here so the host reads the table the kernel's way. */
export function albedoAtJs(E, mu) {
    const K = E.length, x = mu * K - 0.5;
    const i = Math.max(0, Math.min(K - 2, Math.floor(x)));
    const f = Math.min(1, Math.max(0, x - i));
    return E[i] * (1 - f) + E[i + 1] * f;
}
