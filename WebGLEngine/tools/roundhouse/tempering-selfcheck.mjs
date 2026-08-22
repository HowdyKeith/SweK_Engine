// tools/roundhouse/tempering-selfcheck.mjs
//
// v3300 -- PARALLEL TEMPERING BECOMES THE 48th GRADED DEVICE, AND ITS PLANTED ERROR IS THE QUIETEST YET.
//
// Replica exchange runs one copy of the system at each of several temperatures and lets neighbours TRADE
// CONFIGURATIONS, so a replica trapped at low temperature can wander up the ladder, melt, and come back down
// somewhere else. The cure for a sampler that is not wrong, just stuck.
//
// THE SWAP RULE IS THE WHOLE THING: exchanging between beta_i and beta_j is a Metropolis move in the JOINT
// ensemble and must be accepted with P = min(1, exp((beta_i - beta_j)(E_i - E_j))). The tempting alternative --
// "just swap, both configurations are valid" -- is the trap.
//
// *** WHAT MAKES IT QUIET: NOTHING BREAKS. *** Measured with swapAlwaysWRONG:
//
//     T        1.8      2.0      2.2      2.4      2.7
//     correct  0.9542   0.9084   0.8017   0.5129   0.2552     <- a real ladder, hot chains disordered
//     planted  0.6912   0.6624   0.6240   0.5792   0.5453     <- five labels on one blended distribution
//
// Every chain runs to completion. Every chain reports a plausible magnetisation. No exception, no NaN, no
// divergence -- the temperatures have simply been SMEARED TOGETHER, and only a per-temperature answer key sees
// it. The ladder spread collapses 0.699 -> 0.146 and the swap acceptance reads a suspiciously perfect 100%.
//
// THE KEY IS BORROWED RATHER THAN INVENTED, which is the right move: each replica's marginal must still be
// Boltzmann at ITS OWN temperature, so it owes the same Yang magnetisation the plain Ising device already owes.
// No new physics was needed to grade a new algorithm.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("tempering");
const good = await dev.build({ mode: "marginals" });
const bad = await dev.build({ mode: "marginals", config: { planted: true } });

// ---- 1. THE MARGINALS SURVIVE THE EXCHANGE -----------------------------------------------------------------------
{
    ok("!! each replica still samples Boltzmann at its OWN temperature after tempering",
        good.worstMagErrBelowTc < 0.05,
        `worst |M| departure from Yang below T_c: ${good.worstMagErrBelowTc.toFixed(4)}. Configurations move ` +
        "between ensembles every 5 sweeps and the per-temperature distributions still hold -- which is the only " +
        "thing that makes replica exchange worth doing rather than merely faster");

    ok("...and only the sub-critical points are graded, because Yang is 0 above T_c for an INFINITE lattice",
        good.yang.filter((y) => y > 0).length >= 2 && good.yang.some((y) => y === 0),
        `Yang gives ${good.yang.map((y) => y.toFixed(3)).join(", ")} across the ladder. A finite 16x16 lattice ` +
        "retains real magnetisation above T_c, so grading there would fail correct code for being finite -- the " +
        "same finite-size discipline as kuramoto's floor");
}

// ---- 2. THE QUIET FAILURE, CAUGHT THREE INDEPENDENT WAYS -------------------------------------------------------------
{
    ok("!! swapAlwaysWRONG smears every temperature toward a common value",
        bad.worstMagErrBelowTc / good.worstMagErrBelowTc > 5,
        `worst error ${good.worstMagErrBelowTc.toFixed(4)} -> ${bad.worstMagErrBelowTc.toFixed(4)}, a factor of ` +
        `${(bad.worstMagErrBelowTc / good.worstMagErrBelowTc).toFixed(1)}. The planted values ` +
        `${bad.absM.map((m) => m.toFixed(3)).join(", ")} are all plausible magnetisations -- they are simply not ` +
        "the magnetisations of THOSE temperatures");

    ok("!! the ladder SPREAD collapses, which is the same failure seen without any key at all",
        bad.spreadAcrossLadder < good.spreadAcrossLadder * 0.4,
        `${good.spreadAcrossLadder.toFixed(4)} -> ${bad.spreadAcrossLadder.toFixed(4)}. A healthy ladder spreads ` +
        "from ordered to disordered; a smeared one converges. Worth having as a second signature because it needs " +
        "no reference value -- it is visible from the shape of the run alone");

    ok("!! and the swap acceptance reads a suspiciously perfect 100%",
        bad.meanSwapRate > 0.99 && good.meanSwapRate < 0.6,
        `${(good.meanSwapRate * 100).toFixed(0)}% correct vs ${(bad.meanSwapRate * 100).toFixed(0)}% planted. ` +
        "A real Metropolis rule REJECTS -- that is what makes it a rule. An acceptance rate of exactly 1 is the " +
        "cheapest possible tell, and it costs nothing to record");
}

// ---- 3. THREE SIGNATURES, ONE BUG -- and that redundancy is the point ---------------------------------------------------
{
    ok("the three checks are independent: an answer key, a shape, and a rate",
        good.worstMagErrBelowTc < 0.05 && good.spreadAcrossLadder > 0.5 && good.meanSwapRate < 0.6,
        "the marginals need Yang, the spread needs nothing, the acceptance needs nothing. A bug that defeated the " +
        "answer key while preserving both the ladder shape AND a realistic rejection rate would have to be " +
        "constructed deliberately, which is a much stronger position than any one check alone");
}

// ---- 4. DECLARED ------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("tempering declares its mode -- 48 graded of 124 proven",
        m.source === "exported" && m.declared.includes("marginals"),
        `source "${m.source}", modes ${JSON.stringify(m.declared)}`);
}

console.log();
if (fails) { console.log("tempering-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("tempering-selfcheck: all checks pass");
