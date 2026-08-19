// WebGLEngine/physics/hmc/tune-selfcheck.mjs — v3282
//
// Run: node physics/hmc/tune-selfcheck.mjs   (~6s — MEASURED)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The proposer-adjudicator handshake, gated: (1) the tuned config beats a deliberately bad baseline on
// ESS-per-gradient by a MEASURED factor; (2) the tuned config still passes the exact-moments falsifier the
// proposer cannot write; (3) the degenerate reward (acceptance alone) picks a config its own reward calls
// perfect and the efficiency metric calls terrible — measured, which is the whole argument for the falsifier.

import { gaussian2D } from "./hmc.js";
import { essOf, scoreConfig, tuneHMC, adjudicate } from "./tune.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const target = gaussian2D([1, -1], [[1, 0.8], [0.8, 1]]);

// ---- 0. the ESS estimator itself has to be sane before anything trusts it ---------------------------------------
{
    // iid noise: ESS ~ n. A near-perfectly autocorrelated series: ESS collapses.
    const rngX = (() => { let s = 9; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296 - 0.5; }; })();
    const iid = Array.from({ length: 2000 }, rngX);
    let acc = 0; const sticky = Array.from({ length: 2000 }, () => (acc += rngX() * 0.05));
    const eIid = essOf(iid), eSticky = essOf(sticky);
    ok("ESS ~ n on iid noise and collapses on a random walk (the estimator can tell the difference)",
       eIid > 1200 && eSticky < 200, "iid " + eIid.toFixed(0) + "/2000, random walk " + eSticky.toFixed(0) + "/2000");
}

// ---- 1. TUNED BEATS A BAD BASELINE ON THE THING THAT MATTERS ----------------------------------------------------
const { best } = tuneHMC(target, { seed: 3 });
{
    const baseline = scoreConfig(target, { eps: 0.01, L: 2, n: 600, seed: 3 });   // tiny steps, short trajectories
    ok("!! the tuned config beats the bad baseline on ESS per gradient by a measured factor",
       best.essPerGrad > baseline.essPerGrad * 5,
       "tuned (eps=" + best.eps + ", L=" + best.L + "): " + best.essPerGrad.toExponential(2) + " vs baseline " + baseline.essPerGrad.toExponential(2) +
       " (" + (best.essPerGrad / baseline.essPerGrad).toFixed(0) + "x)");
}

// ---- 2. THE FALSIFIER HOLDS: the tuned config still samples the right distribution ------------------------------
{
    const v = adjudicate(target, best, { seed: 21 });
    ok("!! the ADJUDICATOR passes the tuned config against the exact moments (a verdict the proposer cannot write)",
       v.pass, "mean [" + v.mean[0].toFixed(3) + ", " + v.mean[1].toFixed(3) + "], cov[0][1] " + v.cov[0][1].toFixed(3) + " vs 0.8");
}

// ---- 3. THE DEGENERATE REWARD, MEASURED -------------------------------------------------------------------------
// reward acceptance alone: the search prefers the tiniest eps (acceptance -> 1, mixing -> nothing). Its own
// reward calls it perfect; ESS/grad calls it what it is. This is why "acceptance is high" is an integrator
// diagnostic and NOT a tuning objective.
{
    const { best: degen } = tuneHMC(target, { seed: 3, rewardFn: (s) => s.acceptRate });
    ok("acceptance-only reward picks a config with near-perfect acceptance...",
       degen.acceptRate > 0.98, "accept " + (degen.acceptRate * 100).toFixed(1) + "% at eps=" + degen.eps + ", L=" + degen.L);
    ok("!! ...whose efficiency is FAR worse than the tuned config — the degenerate policy its own reward calls perfect",
       best.essPerGrad > degen.essPerGrad * 3,
       "tuned " + best.essPerGrad.toExponential(2) + " vs degenerate " + degen.essPerGrad.toExponential(2) +
       " (" + (best.essPerGrad / degen.essPerGrad).toFixed(0) + "x) — the falsifier and the efficiency metric are what stand between a learner and this attractor");
}

// ---- 4. determinism ---------------------------------------------------------------------------------------------
{
    const a = tuneHMC(target, { seed: 3 }).best, b = tuneHMC(target, { seed: 3 }).best;
    ok("seeded tuning is bit-identical (a failure reproduces)", a.eps === b.eps && a.L === b.L && a.ess === b.ess);
}

console.log(fails ? ("[tune-selfcheck] FAILED " + fails) : "[tune-selfcheck] all passed");
process.exit(fails ? 1 : 0);
