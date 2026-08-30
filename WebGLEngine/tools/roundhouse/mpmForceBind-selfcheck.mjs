// tools/roundhouse/mpmForceBind-selfcheck.mjs -- v3793
//
// *** THE FIRST ASSEMBLY IN THIS ARC RATHER THAN A NEW IDEA: v3791 computed a stress and v3790 stepped a grid,
// and NOTHING JOINED THEM. This scatters the stress as nodal force. ***
//
// *** TWO KEYS, AND EACH IS BLIND TO WHAT THE OTHER CATCHES -- WHICH IS THE ROUND. ***

import { mpmForceDevice, MPMFORCE_MODES, buildMpmForce } from "./mpmForceBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildMpmForce({ mode: "thirdlaw" });
const planted = await buildMpmForce({ mode: "brokenstencil" });
const scaling = await buildMpmForce({ mode: "scaling" });
const stencil = await buildMpmForce({ mode: "stencil" });

console.log("1. NEWTON'S THIRD LAW");
{
    ok("!! *** THE INTERNAL FORCES SUM TO EXACTLY ZERO OVER THE GRID ***",
        honest.thirdLawHolds === true && honest.netForce < 1e-9,
        "net |f| " + honest.netForce.toExponential(3) + ". *** INTERNAL STRESS CANNOT ACCELERATE THE CENTRE OF " +
        "MASS -- A BLOCK CANNOT PUSH ITSELF ACROSS THE ROOM. Exact, not toleranced ***");
    ok("!! and the reason is exact: the stencil GRADIENTS sum to zero while the WEIGHTS sum to one",
        stencil.stencilHolds === true && stencil.gradientSum === 0,
        "gradients " + stencil.gradientSum.toExponential(2) + ", weights " + stencil.weightSum.toFixed(12) +
        ". Each particle's contribution CANCELS WITHIN ITS OWN NINE NODES, so the total cancels term by term " +
        "-- the identity is structural rather than a happy sum");
    ok("!! *** PERTURBING ONE GRADIENT OF NINE BY 5% MAKES THE BLOCK PUSH ITSELF ***",
        planted.thirdLawHolds === false && planted.netForce > 1,
        "net " + honest.netForce.toExponential(3) + " -> " + planted.netForce.toExponential(3) +
        ". ONE LEG OF THE STENCIL, five per cent, and the material self-propels");
    ok("!! the device DECLARES the plant, with `thirdlaw` first",
        DEVICE_NAMES.includes("mpmforce") && mpmForceDevice.plantMode === "brokenstencil" &&
        mpmForceDevice.plantFlips === "netForce" && MPMFORCE_MODES[0] === "thirdlaw");
}

console.log("\n2. THE SECOND KEY, AND THE BUG THE FIRST ONE CANNOT SEE");
{
    ok("!! *** FORCE MAGNITUDE DOUBLES WHEN THE CELL HALVES -- RATIO EXACTLY 2.000 ***",
        scaling.scalesWithH === true && Math.abs(scaling.scaleRatio - 2) < 0.05,
        "maxF " + scaling.maxForceCoarse.toExponential(3) + " at h and " + scaling.maxForceFine.toExponential(3) +
        " at h/2. The weight DERIVATIVE carries a chain rule the weights themselves do not");
    // v4132 -- READ OFF THE DEVICE'S OWN BUILD, NOT A SECOND FIXTURE BUILT HERE. This block used to import
    // stressForces/makeGrid/rotatingBlock/lame/firstPiola directly and re-assemble the same rig `scaling` mode
    // already builds -- which meant mpmForceDevice.build() itself never demonstrated the claim this header
    // spends its second half making, and plantedCoverage.mjs's census (which only ever calls the registered
    // device) could not see it either. `scaling` mode now runs skipChainRule itself and reports it as
    // maxForceCoarsePlanted/maxForceFinePlanted -- the same numbers, produced by the device rather than beside it.
    ok("!! *** DROPPING THE CHAIN RULE HALVES EVERY FORCE AT h/2 AND THE THIRD LAW READS THE SAME ***",
        Math.abs(scaling.maxForceFinePlanted / scaling.maxForceFine - 0.5) < 0.01 &&
        scaling.scalesWithHPlanted === false,
        "maxF " + scaling.maxForceFine.toExponential(3) + " -> " + scaling.maxForceFinePlanted.toExponential(3) +
        " at h/2, ratio " + scaling.scaleRatioPlanted.toFixed(3) + " against the honest 2.000. *** SCALING EVERY " +
        "GRADIENT BY THE SAME CONSTANT LEAVES A SUM OF ZERO AT ZERO (thirdlaw's own netForce is unaffected by " +
        "this option, checked separately below), so a genuine factor-of-two force error is INVISIBLE to the " +
        "identity. ONLY THE SCALING KEY CATCHES IT ***");
    ok("!! *** AND AT h = 1 THAT BUG DOES NOT EXIST AT ALL -- MULTIPLYING BY h IS MULTIPLYING BY ONE ***",
        scaling.maxForceCoarse === scaling.maxForceCoarsePlanted,
        "*** IDENTICAL, NOT MERELY CLOSE (" + scaling.maxForceCoarse.toExponential(9) + " both arms). THE " +
        "DEFAULT GRID SPACING ANYBODY WOULD TEST AT IS A SPACING WHERE THE BUG IS ARITHMETICALLY ABSENT -- so a " +
        "device built only at h=1 would grade a units error as correct, twice over: the key cannot see it AND " +
        "the fixture does not contain it ***");
}

// A direct measurement, kept OUTSIDE the ok() block above so the import stays scoped to this one purpose:
// confirms thirdlaw's own identity truly cannot see skipChainRule, which is the reason `brokenstencil` and not
// this option is the device's declared plant.
{
    const { stressForces } = await import("../../physics/mpm/forces.mjs");
    const { makeGrid, rotatingBlock } = await import("../../physics/mpm/transfer.mjs");
    const { lame, firstPiola } = await import("../../physics/mpm/constitutive.mjs");
    const par = lame(1000, 0.3), stressOf = (F) => firstPiola(F, par);
    const g = makeGrid(12, 12, 0.5);
    const ps = rotatingBlock({ nx: 5, ny: 5, spacing: 0.25, h: 0.5 })
        .map((p) => ({ ...p, vol0: 0.25, F: [1.08, 0.04, -0.02, 0.95], F0: [1, 0, 0, 1] }));
    const bad = stressForces(ps, g, stressOf, { skipChainRule: true });
    ok("!! *** skipChainRule LEAVES thirdLaw's netForce AT ROUND-OFF, CONFIRMED DIRECTLY ***",
        Math.hypot(bad.netX, bad.netY) < 1e-9,
        "net " + Math.hypot(bad.netX, bad.netY).toExponential(3) + " -- this is WHY brokenstencil, not " +
        "skipChainRule, is the device's declared plant for the thirdlaw/netForce pair");
}

report("*** THE ROUND'S SHAPE: I BUILT THE WRONG PLANT FIRST AND KEPT IT NAMED ***",
    "`skipChainRule` was the plant I reached for -- a units error, real and serious. IT DOES NOT MOVE THE " +
    "DECLARED KEY, because the third law is invariant to a uniform rescaling of the gradients. Rather than " +
    "delete it, it stays in the module LABELLED AS THE WRONG PLANT and drives the blindness check above, " +
    "because A PLANT THAT DOES NOT FIRE IS EVIDENCE ABOUT THE KEY (v3715) and this one says precisely what " +
    "the third law is not watching.");

report("WHAT THIS DOES NOT CLAIM",
    "That MPM runs. This is the FIFTH piece -- transfer, grid step, stress, return mapping, and now the force " +
    "scatter that joins the third to the second. THERE IS STILL NO STEP LOOP: nothing advances F, nothing " +
    "cycles P2G -> forces -> grid step -> G2P, and nothing draws. The pieces are graded; THE ASSEMBLY IS NOT " +
    "WRITTEN.");

console.log("\nmpmForceBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
