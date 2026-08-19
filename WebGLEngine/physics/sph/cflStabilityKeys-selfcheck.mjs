// physics/sph/cflStabilityKeys-selfcheck.mjs -- v3842
//
// TIER-2 GRADING FOR THE SPH STABILITY PAIR, AGAINST GENUINE EXTERNAL KEYS -- values from OUTSIDE the engine's
// own machinery, so agreement is evidence and not a mirror. Two keys, one per module:
//
//   A. cfl.js  -> THE CFL BOUNDARY IS A CLOSED FORM. This is the shape that made FDTD gradeable: an explicit
//      scheme for a hyperbolic PDE is stable iff the Courant number stays under a limit the von Neumann analysis
//      gives in closed form. We build a minimal 1-D linear-advection solver, measure its per-mode amplification
//      against the closed-form |g|, locate the stability boundary, and confirm cfl.js's Courant number and its
//      ok flag mark exactly that boundary. The key -- |g(C, theta)| and the C=1 limit -- comes from the analysis,
//      not from cfl.js.
//
//   B. stability.mjs -> ENERGY MAY NOT RISE. In a system whose only external force is gravity (conservative) and
//      whose only boundary is dissipative (the wall clamp removes energy), total mechanical energy E(T) <= E(0)
//      is the first law, external to the solver. E(T)/E(0) > 1 is therefore an instability with no tolerance to
//      argue about. We grade the shipped viscosity against it.
//
// One-core sandbox: numbers here are ratios and check counts, never milliseconds.

import { cflNumber } from "./cfl.js";
import { energyRatio } from "./stability.mjs";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// ---- A minimal 1-D linear advection solver on a periodic grid: u_t + a u_x = 0, a = 1, dx = 1/N. -------------
const upwindStep = (u, C) => { const n = u.length, o = new Array(n); for (let i = 0; i < n; i++) { const im = (i - 1 + n) % n; o[i] = u[i] - C * (u[i] - u[im]); } return o; };
const ftcsStep = (u, C) => { const n = u.length, o = new Array(n); for (let i = 0; i < n; i++) { const ip = (i + 1) % n, im = (i - 1 + n) % n; o[i] = u[i] - (C / 2) * (u[ip] - u[im]); } return o; };

// CLOSED-FORM amplification factors (von Neumann). theta = 2*pi*k/N is the mode's phase per cell.
const gUpwind = (C, th) => Math.hypot(1 - C + C * Math.cos(th), -C * Math.sin(th));   // upwind
const gFtcs = (C, th) => Math.hypot(1, C * Math.sin(th));                              // FTCS: sqrt(1 + C^2 sin^2)

// MEASURED per-step growth of Fourier mode k, from the solver itself.
function measuredG(step, C, N, k, steps = 1) {
    let u = Array.from({ length: N }, (_, i) => Math.cos(2 * Math.PI * k * i / N));
    const amp = (v) => { let a = 0, b = 0; for (let i = 0; i < N; i++) { const ph = 2 * Math.PI * k * i / N; a += v[i] * Math.cos(ph); b += v[i] * Math.sin(ph); } return Math.hypot(a, b); };
    const a0 = amp(u);
    for (let m = 0; m < steps; m++) u = step(u, C);
    return Math.pow(amp(u) / a0, 1 / steps);
}

console.log("== KEY A: the CFL boundary is a closed form (cfl.js graded against von Neumann) ==");
const N = 64;
// A1. THE SOLVER MATCHES THE CLOSED-FORM AMPLIFICATION -- measured |g| == analytic |g|, the external key.
for (const C of [0.3, 0.7, 0.9, 1.0, 1.2]) for (const k of [8, 16, 32]) {
    const th = 2 * Math.PI * k / N;
    ok(near(measuredG(upwindStep, C, N, k), gUpwind(C, th), 1e-9), `upwind |g| measured == von Neumann at C=${C}, k=${k}`);
}
for (const C of [0.2, 0.5, 0.9]) {
    ok(near(measuredG(ftcsStep, C, N, 16), gFtcs(C, 2 * Math.PI * 16 / N), 1e-9), `FTCS |g| measured == von Neumann at C=${C}`);
}
// A2. THE BOUNDARY IS AT C=1 for upwind (the Nyquist mode |g| = |1-2C| crosses 1 there); FTCS is unconditional.
{
    const nyq = 32, th = Math.PI;
    ok(measuredG(upwindStep, 0.9, N, nyq) < 1 && near(measuredG(upwindStep, 0.9, N, nyq), Math.abs(1 - 2 * 0.9), 1e-9), "upwind STABLE below C=1 (Nyquist |g|=|1-2C|<1)");
    ok(measuredG(upwindStep, 1.0, N, nyq) <= 1 + 1e-9 && near(measuredG(upwindStep, 1.0, N, nyq), 1, 1e-9), "upwind MARGINAL exactly at C=1 (|g|=1)");
    ok(measuredG(upwindStep, 1.1, N, nyq) > 1 && near(measuredG(upwindStep, 1.1, N, nyq), Math.abs(1 - 2 * 1.1), 1e-9), "upwind UNSTABLE above C=1 (|g|>1)");
    ok(measuredG(ftcsStep, 0.2, N, 16) > 1 && measuredG(ftcsStep, 0.05, N, 16) > 1, "FTCS unstable even at tiny C (unconditional -- the textbook result)");
}
// A3. *** cfl.js GRADED: its Courant number and ok flag mark exactly the closed-form boundary. *** For a state
//     whose fastest 'particle' moves at speed a=1 with smoothing length h=dx and step dt, cflNumber must report
//     C = a*dt/dx and be ok iff C <= 1 -- i.e. iff the advection scheme above is stable. Same question, and the
//     answer key is the von Neumann limit, not cfl.js itself.
for (const C of [0.5, 0.9, 1.0, 1.5, 3.0]) {
    const a = 1, dx = 1 / N, dt = C * dx / a;                       // choose dt so a*dt/dx == C
    const world = { particles: [{ vx: a, vy: 0, vz: 0 }, { vx: 0.3, vy: 0, vz: 0 }] };
    const r = cflNumber(world, dx, dt);
    const stableByVonNeumann = C <= 1;                              // upwind Nyquist boundary
    ok(near(r.courant, C, 1e-9), `cfl.js Courant == a*dt/dx at C=${C}`);
    ok(r.ok === stableByVonNeumann, `cfl.js ok flag matches the closed-form CFL stability at C=${C} (ok=${r.ok})`);
}

console.log("== KEY B: energy may not rise (stability.mjs graded against the first law) ==");
// B. The external key: gravity is conservative, the wall clamp is dissipative, so E(T) <= E(0). E(T)/E(0) > 1 is
//    the instability. Grade the SHIPPED viscosity against it, and confirm a high viscosity conserves. Short
//    horizon so the sandbox stays quick; the sign of (ratio - 1) is what the key reads, not its magnitude.
{
    const shipped = energyRatio({ visc: 0.1, c: 15, T: 0.3, dt: 1 / 500 });
    const high = energyRatio({ visc: 3.0, c: 15, T: 0.3, dt: 1 / 500 });
    ok(shipped > 1, `SHIPPED viscosity 0.1 VIOLATES energy conservation: E(T)/E(0) = ${shipped.toFixed(4)} > 1 -- energy created from nowhere`);
    ok(high <= 1, `a viscosity of 3.0 CONSERVES: E(T)/E(0) = ${high.toFixed(4)} <= 1`);
    ok(shipped > high, `and the ratio falls with viscosity (${shipped.toFixed(4)} -> ${high.toFixed(4)}): the bifurcation stability.mjs bisects for is real`);
    console.log(`  E(T)/E(0): shipped(0.1) = ${shipped.toFixed(4)} [OVER],  high(3.0) = ${high.toFixed(4)} [ok]`);
}

if (fail) { console.error(`\ncflStabilityKeys-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`\ncflStabilityKeys-selfcheck: all ${pass} pass. cfl.js graded against the closed-form CFL limit; stability.mjs against energy conservation -- both external keys.`);
