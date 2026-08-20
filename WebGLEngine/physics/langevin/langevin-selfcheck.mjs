// WebGLEngine/physics/langevin/langevin-selfcheck.mjs — v3282
//
// Run: node physics/langevin/langevin-selfcheck.mjs   (~4s — MEASURED, dominated by the Jarzynski ensembles)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Three exact keys, none fed to the simulation: equipartition <x^2> = kT/k, Einstein MSD = 2Dt, and the
// Jarzynski equality <e^(-W/kT)> = e^(-dF/kT) with dF = (kT/2) ln(k1/k0) — an identity over NONEQUILIBRIUM
// trajectories, exact at ANY driving speed. The relax step is the exact OU conditional and work is accumulated
// by the discrete protocol, so there is NO timestep error to hide in: a miss is a bug, never "the integrator".
//
// The point of the round is section 5: a work-accumulation bug produces trajectories that are statistically
// PERFECT — equipartition passes on the same paths — while the reported free energy is wrong. Only the
// Jarzynski key sees it. Its mirror (mis-scaled noise) is the loud version, caught by equipartition at once.

import { equipartitionRun, msdRun, jarzynskiRun, ouStepNoiseWRONG, workIncrementWRONG } from "./langevin.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. EQUIPARTITION -------------------------------------------------------------------------------------------
{
    const r = equipartitionRun({ k: 2, kT: 1, n: 200000, seed: 11 });
    ok("!! <x^2> in a static trap equals kT/k (stationary OU variance)", Math.abs(r.x2 - r.exact) < 0.01,
       "measured " + r.x2.toFixed(4) + " vs exact " + r.exact.toFixed(4));
}

// ---- 2. EINSTEIN RELATION ---------------------------------------------------------------------------------------
{
    const r = msdRun({ kT: 1, gamma: 1, dt: 0.05, steps: 400, nTraj: 4000, seed: 13 });
    ok("!! free-particle MSD = 2 D t with D = kT/gamma", Math.abs(r.msd / r.exact - 1) < 0.05,
       "MSD " + r.msd.toFixed(2) + " vs 2Dt = " + r.exact.toFixed(2) + " (ratio " + (r.msd / r.exact).toFixed(3) + ")");
}

// ---- 3. JARZYNSKI HOLDS AT TWO SPEEDS, AGAINST THE CLOSED FORM ---------------------------------------------------
let fast;
{
    fast = jarzynskiRun({ k0: 1, k1: 4, steps: 4, nTraj: 30000, seed: 17 });     // slammed: far from equilibrium
    const slow = jarzynskiRun({ k0: 1, k1: 4, steps: 60, nTraj: 30000, seed: 19 });  // gentle
    ok("!! Jarzynski recovers dF = (kT/2) ln(k1/k0) from FAST driving (the equality is speed-independent)",
       Math.abs(fast.dFjarzynski - fast.dFexact) < 0.04,
       "recovered " + fast.dFjarzynski.toFixed(4) + " vs exact " + fast.dFexact.toFixed(4) + " with <W> = " + fast.meanW.toFixed(3) + " (heavily dissipative)");
    ok("!! ...and from slow driving too", Math.abs(slow.dFjarzynski - slow.dFexact) < 0.03,
       "recovered " + slow.dFjarzynski.toFixed(4) + ", <W> = " + slow.meanW.toFixed(3));
    // ---- 4. THE SECOND LAW, as the average of the same identity ------------------------------------------------
    ok("!! <W> >= dF always, and the excess SHRINKS as the driving slows (second law, measured)",
       fast.meanW > fast.dFexact && slow.meanW > slow.dFexact && (slow.meanW - slow.dFexact) < (fast.meanW - fast.dFexact) * 0.35,
       "dissipated: fast " + (fast.meanW - fast.dFexact).toFixed(3) + " -> slow " + (slow.meanW - slow.dFexact).toFixed(3));
}

// ---- 5. THE TRAP, BOTH DIRECTIONS -------------------------------------------------------------------------------
{
    // (a) the QUIET failure: work increment missing its 1/2. The trajectories are THE SAME PATHS (same step, same
    // rng): equipartition still passes on them, and only the Jarzynski key disagrees.
    const eq = equipartitionRun({ k: 2, kT: 1, n: 200000, seed: 11 });   // paths untouched by the work bug
    const bad = jarzynskiRun({ k0: 1, k1: 4, steps: 4, nTraj: 30000, seed: 17, workInc: workIncrementWRONG });
    ok("a work-accumulation bug leaves the TRAJECTORIES statistically perfect (equipartition still passes)",
       Math.abs(eq.x2 - eq.exact) < 0.01, "the paths cannot testify against the ledger");
    ok("!! ...and the JARZYNSKI key catches it — the reported free energy is the wrong number",
       Math.abs(bad.dFjarzynski - bad.dFexact) > 0.15,
       "recovered " + bad.dFjarzynski.toFixed(4) + " vs exact " + bad.dFexact.toFixed(4) + " — trajectory-level checks are blind to this by construction");
    // (b) the LOUD failure: mis-scaled noise. Equipartition catches it immediately.
    const eqBad = equipartitionRun({ k: 2, kT: 1, n: 100000, seed: 11, step: ouStepNoiseWRONG });
    ok("mis-scaled noise is caught by equipartition at once (the loud mirror of the quiet bug)",
       Math.abs(eqBad.x2 - eqBad.exact) > 0.15, "<x^2> " + eqBad.x2.toFixed(4) + " vs kT/k " + eqBad.exact.toFixed(4));
}

// ---- 6. determinism ---------------------------------------------------------------------------------------------
{
    const a = jarzynskiRun({ nTraj: 2000, seed: 5 }), b = jarzynskiRun({ nTraj: 2000, seed: 5 });
    ok("seeded ensembles are bit-identical (a failure reproduces)", a.dFjarzynski === b.dFjarzynski && a.meanW === b.meanW);
}

// ---- 7. v3283 -- CROOKS: the theorem Jarzynski averages, graded on the whole distribution ------------------------
{
    const { crooksRun, crooksAnalyze } = await import("./langevin.js");
    const { Wf, Wr, dFexact, kT } = crooksRun({ steps: 8, nTraj: 40000, seed: 23 });
    const a = crooksAnalyze(Wf, Wr, kT);
    ok("!! the forward and (negated) reverse work histograms CROSS AT dF (Crooks, pointwise)",
       a.crossing != null && Math.abs(a.crossing - dFexact) < 0.06,
       a.crossing == null ? "no crossing found" : "crossing " + a.crossing.toFixed(4) + " vs dF " + dFexact.toFixed(4));
    ok("!! ...and the log-ratio ln[P_F(W)/P_R(-W)] is a LINE of slope 1/kT through dF",
       a.slope != null && Math.abs(a.slope - 1 / kT) < 0.12 && Math.abs(a.dFfromFit - dFexact) < 0.06,
       "slope " + a.slope.toFixed(4) + " vs 1/kT = " + (1 / kT).toFixed(1) + ", dF from fit " + a.dFfromFit.toFixed(4) + " over " + a.binsUsed + " bins — the WHOLE distribution is locked, not just its average");
    // the work-ledger bug now fails a SECOND independent identity
    const bad = crooksRun({ steps: 8, nTraj: 40000, seed: 23, workInc: workIncrementWRONG });
    const ab = crooksAnalyze(bad.Wf, bad.Wr, kT);
    ok("...and the work-ledger sabotage now fails CROOKS too (two independent identities against one quiet bug)",
       ab.crossing == null || Math.abs(ab.crossing - dFexact) > 0.15 || (ab.slope != null && Math.abs(ab.slope - 1 / kT) > 0.2),
       "sabotaged crossing " + (ab.crossing == null ? "none" : ab.crossing.toFixed(4)) + ", slope " + (ab.slope == null ? "n/a" : ab.slope.toFixed(4)));
}

console.log(fails ? ("[langevin-selfcheck] FAILED " + fails) : "[langevin-selfcheck] all passed");
process.exit(fails ? 1 : 0);
