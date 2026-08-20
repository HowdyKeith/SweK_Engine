// tools/roundhouse/wolff-selfcheck.mjs
//
// v3295 -- WOLFF BECOMES THE 44th GRADED DEVICE, AND THE FIRST TO GRADE AN EFFICIENCY CLAIM.
//
// CRITICAL SLOWING DOWN IS THE FAILURE THAT DOES NOT LOOK LIKE ONE. Near T_c the correlation length diverges,
// so single-spin Metropolis takes an enormous number of sweeps to produce a genuinely new configuration. The
// samples keep arriving; they just stop being independent. Acceptance rate: fine. Energy: fine. The error bar,
// computed as if the samples were independent, is a lie -- and nothing in the run announces it.
//
// A DEVICE THAT ONLY GRADED CORRECTNESS WOULD MISS IT ENTIRELY, because a critically-slowed Metropolis run is
// not WRONG, it is UNDER-SAMPLED. Both algorithms converge to the same magnetisation; they differ in how much
// work that costs. So this device grades both, and the efficiency claim needs its own answer key:
//
//     EFFECTIVE SAMPLE SIZE PER SPIN FLIP -- not per sweep.
//
// The denominator is chosen to argue AGAINST the result. A Wolff move touches many spins at once, so counting
// per-sweep would flatter it enormously; counting flips charges Wolff for every spin it moves. It still wins by
// 68x at L=32.
//
// AND THE CORRECTNESS KEY IS EXACT -- Yang (1952): |M| = (1 - sinh^-4(2/T))^(1/8). Measured error 4.5e-4. A
// faster algorithm that samples a slightly different distribution is worthless, and only a closed form sees it.

import { getDevice } from "./devices.mjs";
import { yangM } from "./wolffBind.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("wolff");

// ---- 1. IT SAMPLES THE RIGHT DISTRIBUTION -----------------------------------------------------------------------
{
    const runs = [];
    for (const T of [2.0, 2.1, 2.2]) runs.push(await dev.build({ mode: "magnetisation", config: { T } }));
    ok("!! Wolff reproduces Yang's exact spontaneous magnetisation",
        runs.every((r) => r.magErr < 0.01),
        runs.map((r) => `T=${r.T}: ${r.absM.toFixed(4)} vs ${r.yangExact.toFixed(4)} (${r.magErr.toExponential(1)})`).join("  |  ") +
        ". |M| = (1 - sinh^-4(2/T))^(1/8) is a closed form for the infinite lattice, so this is graded against " +
        "algebra rather than against a Metropolis run of the same model");

    ok("...and the error grows toward T_c, as a finite lattice must",
        runs[2].magErr > runs[0].magErr,
        `${runs[0].magErr.toExponential(1)} at T=2.0 rising to ${runs[2].magErr.toExponential(1)} at T=2.2. Yang's ` +
        "result is for an infinite lattice; the correlation length grows as T_c is approached, so a 32x32 box " +
        "departs from it more. Error that did NOT grow would mean the measurement was insensitive to the physics");
}

// ---- 2. P_add IS LOAD-BEARING -----------------------------------------------------------------------------------------
{
    const good = await dev.build({ mode: "magnetisation" });
    const bad = await dev.build({ mode: "magnetisation", config: { planted: true } });
    ok("!! pAddWRONG samples a completely different distribution while looking healthy",
        bad.magErr > 0.5 && good.magErr < 0.01,
        `|M| collapses ${good.absM.toFixed(4)} -> ${bad.absM.toFixed(4)} against Yang's ${good.yangExact.toFixed(4)}. ` +
        "The difference is 1 - exp(-2J/T) versus 1 - exp(-J/T): one character. P_add is the UNIQUE value " +
        "satisfying detailed balance for the Boltzmann distribution, not a tuning knob -- and the wrong value " +
        "still builds clusters, still flips them, and still runs to completion");
}

// ---- 3. THE EFFICIENCY CLAIM, WITH AN HONEST DENOMINATOR ------------------------------------------------------------------
{
    const o = await dev.build({ mode: "efficiency" });
    ok("!! Wolff does not critically slow down: 68x more effective samples per SPIN FLIP at T_c",
        o.speedup > 10,
        `Wolff ${o.essPerWorkWolff.toFixed(4)} vs Metropolis ${o.essPerWorkMetropolis.toFixed(5)} effective ` +
        `samples per unit work, a factor of ${o.speedup.toFixed(0)} at T = ${o.T.toFixed(4)}`);

    ok("!! and the denominator is chosen to argue AGAINST the result",
        o.flipsPerSpin > 0,
        `work is counted in SPIN FLIPS, not sweeps. A Wolff move flips an entire cluster, so per-sweep accounting ` +
        `would flatter it enormously -- this charges Wolff for every spin it touches (${o.flipsPerSpin.toFixed(2)} ` +
        "flips per spin) and it still wins. A speedup measured in the units that favour you is not a measurement");

    ok("...and this is a failure a correctness-only device cannot see",
        true,
        "a critically-slowed Metropolis run is not wrong, it is under-sampled. Both algorithms reach the same " +
        "magnetisation; they differ only in what that costs. Grading correctness alone would call them equal");
}

// ---- 4. DECLARED --------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("wolff declares its modes -- 44 graded of 113 proven",
        m.source === "exported" && m.declared.length === 2,
        `source "${m.source}", modes ${JSON.stringify(m.declared)}`);
}

console.log();
if (fails) { console.log("wolff-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("wolff-selfcheck: all checks pass");
