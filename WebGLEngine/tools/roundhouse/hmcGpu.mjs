// tools/roundhouse/hmcGpu.mjs — v3282
//
// THE SECOND KERNEL. Same architecture magmapGpu established at v2903: THE GPU PROPOSES, THE CPU ADJUDICATES.
//
// The kernel is HMC's batch leapfrog: one thread per chain, each rolling L kick-drift-kick steps over the 2D
// correlated-Gaussian target. The gradient S^-1 (q - mu) is PURE ARITHMETIC — the "specified operations only"
// rule (+ - * /, nothing transcendental) that magmap had to engineer around holds here by construction, so
// there is no trig table to ship and no vendor transcendental rounding to argue about. Momenta are drawn on the
// CPU and passed in; given its inputs the kernel is DETERMINISTIC, which is what makes it adjudicable at all.
//
// TWO MIRRORS, PINNED TOGETHER (the v3062/v3064 idiom):
//   leapfrogF64Flat — the reference. The gate proves it BIT-IDENTICAL to physics/hmc/hmc.js's leapfrog on the
//                     fixture, so this file cannot quietly become a second, drifting definition of the step.
//   leapfrogF32     — the same flat code with Math.fround after every arithmetic op: IEEE binary32, which is
//                     what WGSL f32 computes. The worst f64-vs-f32 endpoint gap over a big seeded batch is the
//                     MEASURED FLOOR, and the tolerance a device must beat is earned from it here, once — not
//                     widened after the first failure.
//
// SCOPE, STATED SO IT CANNOT BE OVERSOLD. Until v4466 this paragraph said the sandbox has no GPU; it has had the
// headless Dawn device (tools/ship/headlessGpu.mjs) since v4292, and the gate now runs the kernel's step text on it
// over the seeded batch and grades the endpoints with the CPU adjudicator (section 6). What a REAL vendor's f32 does
// is still hmc-bench.html's question, and that verdict is recomputed by the CPU adjudicator from the returned
// endpoints — the device reports a measurement, never a verdict, which is the fleet's standing rule.
"use strict";
import { leapfrog, gaussian2D } from "../../physics/hmc/hmc.js";

// MEASURED f32 FLOOR (see hmcGpu-selfcheck): worst |f64 - f32| over q,p endpoints for 4096 seeded chains at
// eps=0.18, L=24 on the standard fixture. Re-measured by the gate every run; the gate FAILS if it ever exceeds
// HMC_TOL, so the tolerance stays earned.
export const F32_FLOOR_HMC = 2.5e-5;    // headroom over the measured worst; the gate re-measures every run
export const HMC_TOL = 5e-5;

// the fixture the kernel is graded on — the same one every HMC gate uses.
export const HMC_FIXTURE = { mu: [1, -1], S: [[1, 0.8], [0.8, 1]], eps: 0.18, L: 24 };

// v4466 -- ONE BODY, TWO BINDING LAYOUTS. The bench page and the fleet job bind the kernel as it has always been
// (uniform 0, qin 1, pin 2, qout 3, pout 4); the cross-backend corpus and the headless harness take ONE out buffer
// at binding 0 and a float uniform at 1. Rather than a second copy of the leapfrog that could drift, the step text
// is written once (HMC_STEP_WGSL) and both layouts are rendered around it by hmcKernelWgsl(); the gate asserts the
// shipped string is byte for byte what it was before the split, and that both renderings contain the same step.
export const HMC_STEP_WGSL = `  var g = gradU(qx, qy);
  for (var s: u32 = 0u; s < P.L; s = s + 1u) {
    px = px - 0.5 * P.eps * g.x;  py = py - 0.5 * P.eps * g.y;   // half kick
    qx = qx + P.eps * px;         qy = qy + P.eps * py;          // full drift
    g = gradU(qx, qy);
    px = px - 0.5 * P.eps * g.x;  py = py - 0.5 * P.eps * g.y;   // half kick
  }`;

/**
 * The kernel text. { probe: false } is the shipped layout (WGSL_HMC); { probe: true } is the harness layout: out at
 * binding 0 holding qx, qy, px, py per chain, a float uniform at 1 (i00, i01, i11, mu0, mu1, eps, L, n), qin at 2
 * and pin at 3 -- the same arithmetic, so the corpus can hold the two backends to it byte for byte.
 */
export function hmcKernelWgsl({ probe = false } = {}) {
    const decl = probe
        ? `struct Params { i00: f32, i01: f32, i11: f32, mu0: f32, mu1: f32, eps: f32, L: u32, n: u32 };
@group(0) @binding(0) var<storage, read_write> out : array<f32>;   // 4*n: qx qy px py per chain
@group(0) @binding(1) var<uniform> P : Params;
@group(0) @binding(2) var<storage, read> qin : array<f32>;    // 2*n: q0x q0y per chain
@group(0) @binding(3) var<storage, read> pin : array<f32>;    // 2*n`
        : `struct Params { i00: f32, i01: f32, i11: f32, mu0: f32, mu1: f32, eps: f32, L: u32, n: u32 };
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read> qin : array<f32>;    // 2*n: q0x q0y per chain
@group(0) @binding(2) var<storage, read> pin : array<f32>;    // 2*n
@group(0) @binding(3) var<storage, read_write> qout : array<f32>;
@group(0) @binding(4) var<storage, read_write> pout : array<f32>;`;
    const bound = `  if (i >= P.n) { return; }`;
    const write = probe ? `  out[4u*i] = qx; out[4u*i+1u] = qy; out[4u*i+2u] = px; out[4u*i+3u] = py;`
                        : `  qout[2u*i] = qx; qout[2u*i+1u] = qy;
  pout[2u*i] = px; pout[2u*i+1u] = py;`;
    return `
// hmc-leapfrog.wgsl -- one thread per chain: L kick-drift-kick steps over U = 0.5 (q-mu)^T Sinv (q-mu).
// SPECIFIED OPERATIONS ONLY: + - * /. The gradient is Sinv (q - mu); no transcendentals anywhere, so the only
// arithmetic in play is IEEE f32 add/mul, which the CPU mirror (Math.fround) reproduces exactly.
${decl}

fn gradU(qx: f32, qy: f32) -> vec2<f32> {
  let dx = qx - P.mu0; let dy = qy - P.mu1;
  return vec2<f32>(P.i00 * dx + P.i01 * dy, P.i01 * dx + P.i11 * dy);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
${bound}
  var qx = qin[2u*i]; var qy = qin[2u*i+1u];
  var px = pin[2u*i]; var py = pin[2u*i+1u];
${HMC_STEP_WGSL}
${write}
}
`;
}
export const WGSL_HMC = hmcKernelWgsl({ probe: false });
export const WGSL_HMC_PROBE = hmcKernelWgsl({ probe: true });

/**
 * The probe layout's uniform. The struct is the SHIPPED one -- L and n are u32 -- so the kernel body is the same
 * text in both layouts; the harnesses carry uniforms as a Float32Array, so the two integers travel as the f32 whose
 * bits they are (a denormal, which JavaScript copies without flushing) and the shader reads them back as u32.
 */
export function probeUniforms(n, { inv = fixtureInv(), mu = HMC_FIXTURE.mu, eps = HMC_FIXTURE.eps, L = HMC_FIXTURE.L } = {}) {
    const buf = new ArrayBuffer(32), dv = new DataView(buf);
    [inv[0], inv[1], inv[2], mu[0], mu[1], eps].forEach((v, k) => dv.setFloat32(4 * k, v, true));
    dv.setUint32(24, L >>> 0, true); dv.setUint32(28, n >>> 0, true);
    return new Float32Array(buf);
}

// ---- flat CPU mirrors -------------------------------------------------------------------------------------------
// rounder r is identity for the f64 reference and Math.fround for the f32 mirror — ONE implementation, one knob,
// so the two cannot drift from each other; the gate pins the f64 one to the shipping leapfrog.
function leapfrogFlat(q0x, q0y, p0x, p0y, inv, mu, eps, L, r) {
    let qx = r(q0x), qy = r(q0y), px = r(p0x), py = r(p0y);
    const [i00, i01, i11] = inv, [mu0, mu1] = mu;
    const grad = (x, y) => { const dx = r(x - mu0), dy = r(y - mu1);
        return [r(r(i00 * dx) + r(i01 * dy)), r(r(i01 * dx) + r(i11 * dy))]; };
    let g = grad(qx, qy);
    for (let s = 0; s < L; s++) {
        px = r(px - r(r(0.5 * eps) * g[0])); py = r(py - r(r(0.5 * eps) * g[1]));
        qx = r(qx + r(eps * px)); qy = r(qy + r(eps * py));
        g = grad(qx, qy);
        px = r(px - r(r(0.5 * eps) * g[0])); py = r(py - r(r(0.5 * eps) * g[1]));
    }
    return [qx, qy, px, py];
}
export const leapfrogF64Flat = (qx, qy, px, py, inv, mu, eps, L) => leapfrogFlat(qx, qy, px, py, inv, mu, eps, L, (x) => x);
export const leapfrogF32 = (qx, qy, px, py, inv, mu, eps, L) => leapfrogFlat(qx, qy, px, py, inv, mu, eps, L, Math.fround);

// inverse covariance of the fixture (what the kernel's Params carry).
export function fixtureInv() {
    const S = HMC_FIXTURE.S, det = S[0][0] * S[1][1] - S[0][1] * S[0][1];
    return [S[1][1] / det, -S[0][1] / det, S[0][0] / det];   // [i00, i01, i11]
}

// deterministic batch of start states (LCG + Box-Muller) shared by the bench page and the gate.
export function makeBatch(nChains = 4096, seed = 77) {
    let s = seed >>> 0, spare = null;
    const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
    const gauss = () => { if (spare != null) { const g = spare; spare = null; return g; }
        const a = Math.sqrt(-2 * Math.log(u())), b = 2 * Math.PI * u(); spare = a * Math.sin(b); return a * Math.cos(b); };
    const { mu } = HMC_FIXTURE;
    const qin = new Float32Array(2 * nChains), pin = new Float32Array(2 * nChains);
    for (let i = 0; i < nChains; i++) { qin[2 * i] = mu[0] + gauss(); qin[2 * i + 1] = mu[1] + gauss(); pin[2 * i] = gauss(); pin[2 * i + 1] = gauss(); }
    return { qin, pin, n: nChains };
}

// measure the worst f64-vs-f32 endpoint gap over a seeded batch — the floor a device tolerance is earned from.
export function measureF32Floor(nChains = 4096, seed = 77) {
    const { qin, pin, n } = makeBatch(nChains, seed);
    const inv = fixtureInv(), { mu, eps, L } = HMC_FIXTURE;
    let worst = 0;
    for (let i = 0; i < n; i++) {
        const a = leapfrogF64Flat(qin[2 * i], qin[2 * i + 1], pin[2 * i], pin[2 * i + 1], inv, mu, eps, L);
        const b = leapfrogF32(qin[2 * i], qin[2 * i + 1], pin[2 * i], pin[2 * i + 1], inv, mu, eps, L);
        for (let k = 0; k < 4; k++) worst = Math.max(worst, Math.abs(a[k] - b[k]));
    }
    return worst;
}

// the CPU ADJUDICATOR for a device run: given the inputs and the device's returned endpoints, recompute the f64
// reference and grade against HMC_TOL. Returns counts and the worst gap — a measurement the hub can re-grade
// from the same numbers; the verdict never comes from the device.
export function adjudicateDeviceRun(qin, pin, qout, pout, n) {
    const inv = fixtureInv(), { mu, eps, L } = HMC_FIXTURE;
    let worst = 0, bad = 0;
    for (let i = 0; i < n; i++) {
        const ref = leapfrogF64Flat(qin[2 * i], qin[2 * i + 1], pin[2 * i], pin[2 * i + 1], inv, mu, eps, L);
        const got = [qout[2 * i], qout[2 * i + 1], pout[2 * i], pout[2 * i + 1]];
        let w = 0; for (let k = 0; k < 4; k++) w = Math.max(w, Math.abs(ref[k] - got[k]));
        worst = Math.max(worst, w);
        if (w > HMC_TOL) bad++;
    }
    return { worst, bad, n, tol: HMC_TOL, pass: bad === 0 };
}

// tie to the shipping leapfrog so the gate can pin equivalence without re-deriving the fixture.
export function shippingLeapfrogEndpoint(qx, qy, px, py) {
    const t = gaussian2D(HMC_FIXTURE.mu, HMC_FIXTURE.S);
    const r = leapfrog([qx, qy], [px, py], HMC_FIXTURE.eps, HMC_FIXTURE.L, t.gradU);
    return [r.q[0], r.q[1], r.p[0], r.p[1]];
}
