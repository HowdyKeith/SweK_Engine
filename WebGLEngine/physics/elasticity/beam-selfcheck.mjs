// WebGLEngine/physics/elasticity/beam-selfcheck.mjs — v3319
//
// Run: node physics/elasticity/beam-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Continuum mechanics, which this lab had none of, and TWO EXACT KEYS FROM ONE DISCRETISATION that fail in
// different ways:
//
//   STATIC   delta = F L^3 / (3 E I). A first-year exam number, no series, no special functions.
//   DYNAMIC  the free-vibration frequencies are set by the roots of cos(b) cosh(b) = -1, so the ratios
//            f2/f1 = 6.2669 and f3/f1 = 17.5475 are IRRATIONAL numbers no plausible bug produces by accident.
//
// The static test loads the beam and asks where it ends up; the dynamic test never loads it and asks how it
// rings. Same fourth-difference stencil, same boundary rows, different sensitivities: a wrong free-end row moves
// the mode ratios while barely touching the tip deflection, and a wrong EI scaling moves the deflection while
// leaving every ratio alone. Either alone would miss half of what the other catches -- which is not a
// hypothetical, because a single wrong row broke both of them at once while this was being built.

import { BETA, tipDeflection, naturalOmega, stiffness, solve, measureTipDeflection, measureModes } from "./beam.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE MATRIX IS SYMMETRIC, AND IT WAS NOT ------------------------------------------------------------------
// The natural free-end row is [2, -4, 2], giving K[n-1][n-2] = -4 against K[n-2][n-1] = -2. That asymmetry
// halved the tip stiffness -- the static deflection converged cleanly to FL^3/(6EI), a settled-looking wrong
// constant -- and fed a non-symmetric matrix to a solver that assumes symmetry, which returned a SPURIOUS ZERO
// eigenvalue and a first mode of 0.0000 against 3.516. One mistake, two symptoms, neither obviously the other's.
{
    const n = 40, K = stiffness(n);
    let worst = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) worst = Math.max(worst, Math.abs(K[i][j] - K[j][i]));
    ok("!! the stiffness matrix is SYMMETRIC (the free-end row is a half cell and must be scaled as one)",
       worst === 0, "worst |K[i][j] - K[j][i]| = " + worst);
}

// ---- 2. STATIC: THE TIP DEFLECTION, AND IT CONVERGES AT SECOND ORDER --------------------------------------------------
{
    const rows = [50, 100, 200].map((n) => { const r = measureTipDeflection({ n }); return { n, ...r, rel: Math.abs(r.tip - r.exact) / r.exact }; });
    ok("!! the measured tip deflection lands on F L^3 / (3 E I)",
       rows[2].rel < 5e-5,
       rows.map((r) => "n=" + r.n + ": " + r.tip.toFixed(6)).join(", ") + " against exact " + rows[0].exact.toFixed(6) +
       " — relative error " + rows[2].rel.toExponential(2) + " at n=200");
    const r1 = rows[0].rel / rows[1].rel, r2 = rows[1].rel / rows[2].rel;
    ok("!! ...and doubling the grid QUARTERS the error, so what remains is the discretisation and not a leak",
       r1 > 3 && r1 < 5 && r2 > 3 && r2 < 5,
       "error ratios " + r1.toFixed(2) + " and " + r2.toFixed(2) + " against the 4.00 a second-order scheme owes");
}

// ---- 3. DYNAMIC: THE TRANSCENDENTAL RATIOS -------------------------------------------------------------------------------
// The absolute frequencies carry the grid's discretisation error; the RATIOS largely cancel it, which is both
// the classic behaviour and the sharper test -- 6.2669 and 17.5475 are irrational and nothing produces them by
// luck.
{
    const md = measureModes({ n: 120, count: 3 });
    ok("no spurious zero mode survives (the symmetry bug produced exactly one)",
       md.omegas[0] > 1, "first omega " + md.omegas[0].toFixed(4));
    const rMeas = [md.omegas[1] / md.omegas[0], md.omegas[2] / md.omegas[0]];
    const rExact = [md.exact[1] / md.exact[0], md.exact[2] / md.exact[0]];
    const worst = Math.max(Math.abs(rMeas[0] - rExact[0]) / rExact[0], Math.abs(rMeas[1] - rExact[1]) / rExact[1]);
    ok("!! the mode RATIOS match the roots of cos(b)cosh(b) = -1 to four digits",
       worst < 1e-3,
       "measured " + rMeas.map((x) => x.toFixed(4)).join(", ") + " against " + rExact.map((x) => x.toFixed(4)).join(", ") +
       " — worst relative " + worst.toExponential(2));
    const absWorst = Math.max(...md.omegas.map((o, i) => Math.abs(o - md.exact[i]) / md.exact[i]));
    ok("!! ...and the ABSOLUTE frequencies are less accurate than the ratios, exactly as they should be",
       absWorst > worst,
       "absolute worst " + absWorst.toExponential(2) + " against ratio worst " + worst.toExponential(2) +
       " — the grid error is common to all three modes and largely cancels in a ratio, so a ratio that were WORSE " +
       "than the absolutes would mean the modes were wrong in different ways");
    ok("the beta roots are the textbook ones",
       Math.abs(BETA[0] - 1.8751041) < 1e-6 && Math.abs(BETA[1] - 4.6940911) < 1e-6,
       BETA.map((b) => b.toFixed(6)).join(", "));
}

// ---- 4. THE TWO KEYS ARE SENSITIVE TO DIFFERENT MISTAKES ----------------------------------------------------------------
// Scaling EI moves the deflection and leaves every ratio untouched: a device with only the dynamic key would
// call a beam ten times too stiff perfectly correct.
{
    const soft = measureTipDeflection({ n: 100, E: 1 });
    const stiff = measureTipDeflection({ n: 100, E: 10 });
    ok("!! a tenfold EI change moves the DEFLECTION by ten times",
       Math.abs(soft.tip / stiff.tip - 10) < 0.01, (soft.tip / stiff.tip).toFixed(4) + "x");
    const mA = measureModes({ n: 80, E: 1, count: 3 });
    const mB = measureModes({ n: 80, E: 10, count: 3 });
    const rA = mA.omegas[1] / mA.omegas[0], rB = mB.omegas[1] / mB.omegas[0];
    ok("!! ...and leaves the mode RATIOS untouched, which is why one key cannot replace the other",
       Math.abs(rA - rB) < 1e-9,
       "f2/f1 = " + rA.toFixed(6) + " at E=1 and " + rB.toFixed(6) + " at E=10 — a beam ten times too stiff passes the dynamic key perfectly");
}

// ---- 5. determinism ---------------------------------------------------------------------------------------------------------
{
    const a = measureTipDeflection({ n: 60 }), b = measureTipDeflection({ n: 60 });
    ok("repeat solves are bit-identical (a failure reproduces)", a.tip === b.tip);
}

console.log(fails ? ("[beam-selfcheck] FAILED " + fails) : "[beam-selfcheck] all passed");
process.exit(fails ? 1 : 0);
