// tools/roundhouse/thermalScaling-selfcheck.mjs
//
// Run: node tools/roundhouse/thermalScaling-selfcheck.mjs   (~50s -- MEASURED, was a typed ~40s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3105 -- thermal's SECOND KEY IS THE SCALING, AND ITS CONVECTION CLAIM DOES NOT SURVIVE BEING MEASURED.
//
// thermal had ONE graded number: alphaErrFrac, the diffusivity measured from a spreading hot spot against
// diffusivityOf(tauG). That one is REAL -- an emergent transport coefficient against a Chapman-Enskog
// prediction, which is not the round-trip tautology kerr and inspiral turned out to be, because the field comes
// from streaming and collision while the formula predicts what those produce.
//
// THE SECOND KEY IS THE SCALING, WHICH NEEDS NO CONSTANT. Chapman-Enskog says alpha = (tauG - 1/2)/3. The
// closed form supplies that 1/3; the RATIO alpha/(tauG - 1/2) recovers it FROM THE SIMULATED FIELD with nothing
// analytic in the comparison, so a wrong constant in diffusivityOf cannot cancel out of it. Same move as
// v3102's inspiral scaling, for the same reason.
//
// AND THE DEGRADATION AT LARGE tauG IS PHYSICS, NOT NOISE. Chapman-Enskog is a SMALL-relaxation-time expansion,
// so the recovered coefficient should drift as tauG grows -- and it does, cleanly. A key that agreed perfectly
// at every tauG would mean the measurement was reading the formula back rather than the field.
//
// THEN THE CONVECTION CLAIM, WHICH IS THE FINDING. thermal declares peakSpeed, kineticEnergy, convecting and
// rayleigh. `rayleigh` IS NEVER COMPUTED -- thermal2d exposes no such member, so the field is declared and
// always absent. And `convecting` is `peak > 1e-4`: MEASURED, peak speed is LINEAR in gravity across a 50x
// range, peak/g spanning 8.66 to 9.67. NOTHING BIFURCATES. What that boolean reports is "g exceeded about
// 1.15e-5" -- a statement about the INPUT wearing the name of an emergent phenomenon. thermal2d's own header
// says the layer "crosses 1708 and then the fluid spontaneously organises into rolls"; on this setup it does
// not, because Rayleigh-Benard onset needs heated-bottom / cooled-top walls this configuration never imposes.
//
// I FOUND IT LATE AND FOR THE WRONG REASON. My first sweep passed gravity and beta and got undefined back for
// all four fields, and I nearly concluded they were dead code -- because I swept the DEFAULT MODE and never
// passed mode:"convect". That is v3095's kerr blind spot exactly, committed again, five rounds later. The
// fields are reachable; what is not there is the bifurcation.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const dev = await getDevice("thermal");

// ---- 1. THE SCALING KEY -------------------------------------------------------------------------------------------
{
    const TAUS = [0.6, 0.8, 1.0, 1.4], ratios = [];
    for (const tauG of TAUS) {
        const o = await dev.build({ config: { tauG } });
        ratios.push(o.alphaMeasured / (tauG - 0.5));
    }
    ok("!! alpha/(tauG - 1/2) recovers 1/3 from the FIELD, with no constant supplied",
        Math.abs(ratios[0] - 1 / 3) < 1e-4,
        "tauG = " + TAUS[0] + " gives " + ratios[0].toFixed(6) + " against 1/3 = 0.333333. Measured by ratio " +
        "from a spreading hot spot, so diffusivityOf's constant is nowhere in the comparison and a wrong one " +
        "cannot cancel");

    ok("!! ...and it DEGRADES at large tauG, which is the expansion showing through",
        ratios[3] < ratios[0] && Math.abs(ratios[3] - 1 / 3) / (1 / 3) > 0.01,
        "ratios " + ratios.map((r) => r.toFixed(6)).join(", ") + " across tauG " + TAUS.join(", ") + ". " +
        "Chapman-Enskog is a SMALL-relaxation-time expansion, so agreement should fall away as tauG grows. A " +
        "key that agreed perfectly everywhere would be reading the formula back rather than the field");

    ok("...and every point is still within a few percent",
        ratios.every((r) => Math.abs(r - 1 / 3) / (1 / 3) < 0.05),
        "worst " + (100 * Math.max(...ratios.map((r) => Math.abs(r - 1 / 3) / (1 / 3)))).toFixed(1) + "%. The " +
        "drift is a trend, not a disagreement");
}

// ---- 2. THE CONVECTION CLAIM, MEASURED ---------------------------------------------------------------------------
{
    const GS = [2e-6, 6e-6, 1e-5, 2e-5, 5e-5, 1e-4], peaks = [];
    for (const gravity of GS) {
        const o = await dev.build({ mode: "convect", config: { gravity, beta: 1, steps: 1200 } });
        peaks.push(o.peakSpeed);
    }
    const r = peaks.map((p, i) => p / GS[i]);
    const spread = (Math.max(...r) - Math.min(...r)) / Math.min(...r);

    ok("!! peak speed is LINEAR in gravity -- nothing bifurcates",
        spread < 0.25,
        "peak/g spans " + Math.min(...r).toFixed(2) + " to " + Math.max(...r).toFixed(2) + ", a " +
        (100 * spread).toFixed(1) + "% spread over a FIFTY-FOLD range in g. A convective onset would show a " +
        "threshold; this is linear response");

    ok("!! so `convecting` is a fixed cutoff on that line, not an onset detector",
        (await dev.build({ mode: "convect", config: { gravity: 1e-5, beta: 1, steps: 1200 } })).convecting === false &&
        (await dev.build({ mode: "convect", config: { gravity: 2e-5, beta: 1, steps: 1200 } })).convecting === true,
        "it flips between g = 1e-5 and 2e-5 because peak crosses the hardcoded 1e-4 there -- it reports " +
        "'g exceeded about 1.15e-5', which is a statement about the INPUT wearing the name of an emergent " +
        "phenomenon. Do not cite it as evidence of convection");

    ok("...and the source says so where a reader will find it",
        (await dev.build({ mode: "convect", config: { gravity: 1e-4, beta: 1, steps: 1200 } })).convectingIsThreshold === true,
        "the field is kept under its existing name because consumers read it, and carries a companion flag " +
        "rather than being quietly renamed out from under them");
}

// ---- 3. THE OBSERVABLE THAT IS DECLARED AND NEVER PRODUCED -----------------------------------------------------------
{
    const o = await dev.build({ mode: "convect", config: { gravity: 1e-4, beta: 1, steps: 1200 } });
    ok("!! `rayleigh` is declared and NEVER computed",
        o.rayleigh === undefined,
        "thermal2d exposes no rayleigh member, so the field is absent in every mode. Declared-and-absent reads " +
        "as available in a catalogue -- the same shape as kerr's mode-gated schwarz* fields, which is why this " +
        "is asserted rather than left for the next census to trip over");
    console.log("  NOTE   thermal now has TWO real keys: alphaErrFrac (value vs Chapman-Enskog) and the scaling");
    console.log("         above (the LAW, by ratio). What it does NOT have is a graded bifurcation -- the setup");
    console.log("         imposes no heated-bottom / cooled-top walls, so there is no onset to grade. Adding one");
    console.log("         is a change to the SIMULATION, not to the grading, and is its own round.");
    console.log("  v3313  AND THAT SIMULATION ALREADY EXISTS ELSEWHERE: simulation/lbm/benardSweep.mjs imposes the");
    console.log("         heated-bottom/cooled-top walls and grades the onset against Rayleigh's 1707.76, with Nu");
    console.log("         EXACTLY one below onset because the convective term is identically absent. So the round");
    console.log("         this note asks for is not 'build a bifurcation' -- it is 'bind the existing one to the");
    console.log("         thermal device', which is a much smaller and better-defined job than the note implies.");
}

console.log();
if (fails) { console.log("thermalScaling-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("thermalScaling-selfcheck: all checks pass");
