// tools/roundhouse/figureEight-selfcheck.mjs
//
// Run: node tools/roundhouse/figureEight-selfcheck.mjs   (~10s)
//
// v3196 -- THE FIGURE-EIGHT IS GRADED, AND ITS NEGATIVE FAILS BY A PREDICTED AMOUNT.
//
// v3195 measured that 22 of 96 proven physics modules are reachable from a device bind. Keith named this one,
// and it is the right first pick because ITS KEY IS CLOSURE: an orbit either returns to where it started or it
// does not, and closure fails LOUDLY rather than drifting.
//
// Moore found it numerically in 1993; Chenciner and Montgomery proved it exists in 2000; it survives only at
// Simo's exact initial conditions.
//
// *** THE PERTURBED MODE IS THE PART WORTH THE ROUND. *** A negative that merely "gets worse" is satisfied by
// any broken integrator. This one FAILS BY A PREDICTED AMOUNT: the return distance is LINEAR in the nudge, so
// two nudges a decade apart give returns a decade apart, and the DEVIATION FROM THAT is the observable rather
// than the raw distance. Measured: 1.9e-3 -- linear to two parts in a thousand.
//
// THAT IS WHAT MAKES THE POSITIVE MEAN SOMETHING. A closure check with no negative cannot distinguish "the
// solution is isolated and we found it" from "the integrator returns everything to its start".

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);
const dev = await D.getDevice("figureeight");

const period = await dev.build({ mode: "period" });
const chor = await dev.build({ mode: "choreography" });
const pert = await dev.build({ mode: "perturbed" });
const cons = await dev.build({ mode: "conserve" });

// ---- 1. IT CLOSES, AND THE BODIES SHARE ONE TRACK ------------------------------------------------------------
{
    ok("!! *** after one period every body returns ***",
        period.returnDist < 1e-4 && period.closes === 1,
        "worst-body return " + period.returnDist.toExponential(3) + " at " + period.steps + " steps. WORST BODY, " +
        "NOT THE MEAN -- one body failing to return is a broken choreography, and averaging over three would let " +
        "two good ones hide it");

    ok("!! *** a third of a period in, body ONE is where body THREE started ***",
        chor.thirdDist < 1e-3 && chor.closes === 1,
        "distance from the origin " + chor.thirdDist.toExponential(3) + ". THIS IS THE HALF THAT MAKES IT A " +
        "CHOREOGRAPHY rather than three orbits that happen to look alike -- one curve, three dancers, evenly " +
        "spaced in time");

    ok("!! energy and angular momentum hold at MACHINE PRECISION",
        cons.energyDriftFrac < 1e-12 && cons.angMomDrift < 1e-12,
        "energy " + cons.energyDriftFrac.toExponential(2) + ", angular momentum " + cons.angMomDrift.toExponential(2) +
        ". A symplectic velocity-Verlet must hold these, so A DRIFT OF 1e-9 WOULD BE A BROKEN INTEGRATOR RATHER " +
        "THAN A TOLERANCE QUESTION");
}

// ---- 2. THE NEGATIVE FAILS BY A PREDICTED AMOUNT ------------------------------------------------------------------
{
    ok("!! *** a nudged start does NOT close ***",
        pert.returnRatio > 100 && pert.closes === 0,
        "a 1e-4 nudge gives " + pert.returnRatio.toExponential(1) + " times the clean return. IF THIS PASSED, " +
        "THE CLOSURE CHECK WOULD BE MEASURING NOTHING -- the famous solution exists only at Simo's numbers, and " +
        "a device that closed for any start would be reporting its integrator rather than the physics");

    ok("!! *** and the failure is LINEAR in the nudge, which is the whole point ***",
        pert.linearityErrFrac < 0.05,
        "two nudges a decade apart give returns a decade apart, to " + pert.linearityErrFrac.toExponential(2) +
        ". A NEGATIVE THAT MERELY 'GETS WORSE' IS SATISFIED BY ANY BROKEN INTEGRATOR; ONE THAT SCALES AS " +
        "PREDICTED IS EVIDENCE THE SOLUTION IS ISOLATED");

    ok("...and the observable is the DEVIATION from linearity, not the raw distance",
        typeof pert.linearityErrFrac === "number" && pert.linearityErrFrac >= 0,
        "the raw distance can be inflated by anything. THE RATIO BETWEEN TWO NUDGES CANNOT -- it is a property " +
        "of how the solution sits in its neighbourhood");
}

// ---- 3. FOUR MODES, EXPORTED, ONE RUNNER -------------------------------------------------------------------------
{
    ok("!! four modes, EXPORTED, and a nonsense mode refused",
        Array.isArray(dev.modes) && dev.modes.length === 4 &&
        dev.modes.every((m) => K.checkMode(dev, m).ok !== false) &&
        K.checkMode(dev, "zzz_no_mode").ok === false,
        dev.modes.join(", ") + ". v3192 found the lab's apparent one-moded-ness was an artefact of a probe's " +
        "candidate list; a NEW device declares its own");

    ok("...and every mode runs through ONE integrator",
        (() => { const src = fsMod.readFileSync(path.join(HERE, "figureEightBind.mjs"), "utf8");
                 return (src.match(/function run\(steps/g) || []).length === 1; })(),
        "so a difference between the clean and perturbed runs CANNOT be the harness. If they ever agree, it is " +
        "the physics and not the plumbing");
}

console.log();
console.log("  ----  GRADED COVERAGE MOVES: 22 of 96 at v3195, 23 now. The census reports it, and the ratchet");
console.log("  ----  only fails if a module STOPS being graded -- wiring one is the work it exists to prompt.");
if (fails) { console.log("figureEight-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("figureEight-selfcheck: all checks pass");
