// WebGLEngine/physics/quantum/landauZener-selfcheck.mjs — v3284
//
// Run: node physics/quantum/landauZener-selfcheck.mjs   (~25s — MEASURED; the v=60 sweeps dominate)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The key is the closed form P = exp(-pi D^2 / 2v), which the integrator does not contain. It is checked ACROSS
// THE CURVE, not at a point, because a factor-of-two slip reproduces the same SHAPE and only the range tells
// them apart. Both counterintuitive limits are pinned. Where the finite window cannot support the exact value
// (deep adiabatic, P < 0.03) the claim is narrowed to an order of magnitude WITH the measured swing quoted,
// rather than the tolerance being widened to cover a number the instrument cannot resolve.

import { lzExact, lzSweep, lzCurve, couplingWRONG } from "./landauZener.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE CURVE where the window is converged -------------------------------------------------------------
{
    const curve = lzCurve({ Ds: [0.4, 0.6, 0.8, 1.0, 1.2], v: 4 });
    let worst = 0; const det = [];
    for (const p of curve) {
        worst = Math.max(worst, Math.abs(p.measured - p.exact) / p.exact);
        det.push("D=" + p.D + ": " + p.measured.toFixed(4) + " vs " + p.exact.toFixed(4));
    }
    ok("!! measured survival tracks exp(-pi D^2 / 2v) across the curve (tol 1.5%, EARNED from a measured 0.62% floor)",
       worst < 0.015, det.join(", ") + " — worst relative " + (worst * 100).toFixed(2) + "%");
}

// ---- 2. A SECOND SWEEP RATE, so the key is not one lucky value of v ---------------------------------------------
{
    const a = lzSweep({ D: 0.5, v: 60 }), b = lzSweep({ D: 4.0, v: 60 });
    const ra = Math.abs(a.pDiabatic - lzExact(0.5, 60)) / lzExact(0.5, 60);
    const rb = Math.abs(b.pDiabatic - lzExact(4.0, 60)) / lzExact(4.0, 60);
    ok("!! and at v = 60, fifteen times faster, the same formula holds to 0.5%",
       ra < 0.005 && rb < 0.005,
       "P(D=0.5) = " + a.pDiabatic.toFixed(4) + " vs " + lzExact(0.5, 60).toFixed(4) +
       ", P(D=4.0) = " + b.pDiabatic.toFixed(4) + " vs " + lzExact(4.0, 60).toFixed(4));
    ok("!! FAST sweeps jump the gap (P -> 1): speed PRESERVES the state, it does not destroy it",
       a.pDiabatic > 0.97, "P(v=60, D=0.5) = " + a.pDiabatic.toFixed(4));
    ok("!! ...and 'fast' is set by D^2/v, not by v alone — the same v=60 with stronger coupling is no longer fast",
       b.pDiabatic < 0.75, "P(v=60, D=4.0) = " + b.pDiabatic.toFixed(4) + " — identical sweep rate, different physics");
}

// ---- 3. THE ADIABATIC LIMIT, claimed only as far as the instrument reaches ---------------------------------------
{
    const r = lzSweep({ D: 1.7, v: 1 });
    const ex = lzExact(1.7, 1);
    ok("!! slow sweeps follow the crossing round: survival suppressed by ~2 orders of magnitude (adiabatic theorem)",
       r.pDiabatic < 0.03 && r.pDiabatic > 0.003,
       "P = " + r.pDiabatic.toExponential(3) + " vs exact " + ex.toExponential(3) +
       " — HONEST SCOPE: below P ~ 0.03 the coherent leftover of a finite window exceeds the survival itself; " +
       "widening the window was measured swinging -16.0% / +5.4% / +35.9% without settling, so this is an " +
       "order-of-magnitude claim and not a match");
}

// ---- 4. UNITARITY IS MEASURED, NEVER ENFORCED --------------------------------------------------------------------
{
    const small = lzSweep({ D: 1, v: 4 }), big = lzSweep({ D: 0.5, v: 60 });
    ok("norm drift stays under 1e-3 with no renormalization anywhere (tol EARNED: measured 1.9e-4 worst)",
       Math.abs(small.norm - 1) < 1e-3 && Math.abs(big.norm - 1) < 1e-3,
       "drift " + Math.abs(small.norm - 1).toExponential(1) + " over " + small.steps + " steps, " +
       Math.abs(big.norm - 1).toExponential(1) + " over " + big.steps);
}

// ---- 5. SABOTAGE: the factor-of-two coupling slip -----------------------------------------------------------------
{
    const bad = lzCurve({ Ds: [0.6, 1.0], v: 4, coupling: couplingWRONG });
    const worst = Math.max(...bad.map((p) => Math.abs(p.measured - p.exact) / p.exact));
    ok("D instead of D/2 off-diagonal FAILS the curve while staying perfectly well behaved (detection power)",
       worst > 0.5 && bad.every((p) => Math.abs(p.norm - 1) < 1e-3),
       "sabotaged P(D=1) = " + bad[1].measured.toFixed(4) + " vs exact " + bad[1].exact.toFixed(4) +
       " — unit norm, smooth populations, a real avoided crossing, and the whole curve wrong");
}

// ---- 6. STUECKELBERG: the end-time average is physics, and the raw end value shows why ---------------------------
{
    const a = lzSweep({ D: 1.4, v: 1, T: 120 }), b = lzSweep({ D: 1.4, v: 1, T: 150 });
    const spreadEnd = Math.abs(a.pAtEnd - b.pAtEnd) / a.pAtEnd;
    const spreadAvg = Math.abs(a.pDiabatic - b.pDiabatic) / a.pDiabatic;
    ok("averaging over end times beats reading one end time (the finite-window oscillation is real, measured)",
       spreadAvg < spreadEnd,
       "changing T by 25%: raw end value moves " + (spreadEnd * 100).toFixed(1) + "%, averaged value " + (spreadAvg * 100).toFixed(1) + "%");
}

// ---- 7. convergence and determinism ------------------------------------------------------------------------------
{
    const coarse = lzSweep({ D: 1, v: 4, T: 40, dt: 1.6e-3 }), fine = lzSweep({ D: 1, v: 4, T: 40, dt: 8e-4 });
    ok("halving the timestep barely moves the answer (RK4 converged at the shipped step)",
       Math.abs(coarse.pDiabatic - fine.pDiabatic) < 5e-4,
       "|dP| = " + Math.abs(coarse.pDiabatic - fine.pDiabatic).toExponential(2));
    const x = lzSweep({ D: 1, v: 4 }), y = lzSweep({ D: 1, v: 4 });
    ok("repeat runs are bit-identical (a failure reproduces)", x.pDiabatic === y.pDiabatic);
}

console.log(fails ? ("[landauZener-selfcheck] FAILED " + fails) : "[landauZener-selfcheck] all passed");
process.exit(fails ? 1 : 0);
