// physics/xpbd/clothLoopKey-selfcheck.mjs
//
// v3479 -- GRADING THE GPU BUFFER-PASS LOOP. clothLoop.js runs a cloth substep as predict -> per-color solve ->
// collision -> finalize, ping-ponged with no CPU readback, and its header states the property the GPU port rests
// on: "clothFrame is byte-for-byte the v2661 clothSubstep." The module already has a passing selfcheck, so -- the
// weave/tear pattern -- WHAT THIS ADDS IS LAB REACH: the equivalence swept across configs and put under baseline
// and sensitivity, plus one graded number no xpbd device had: the integrator's free-fall closed form. Two keys,
// neither the tautology of grading the loop against the loop:
//
//   FREE-FALL CLOSED FORM   one frame of a free particle lands at pos = g*dt^2, vel = g*dt, to the bit -- the
//                           reference is the closed form, not the integrator re-run.
//   EQUIVALENCE (SWEPT)     the decomposed loop equals clothSubstep byte-for-byte across {iterations x grid}.
//
// *** THE PLANT DROPS -aTilde*lambda FROM THE SOLVE, AND IT IS HONEST: at compliance 0 the term is zero anyway,
// so the broken loop is byte-identical to the monolith; only at positive compliance do they part. *** The
// compliance-key discipline reaching the GPU loop.

import { clothLoopKeys, freeFall, equivalenceSweep, droppedLambdaPlant } from "./clothLoopKey.mjs";

// v3607 -- THIS GATE DRIVES THE SELF-COLLISION PASS 960 TIMES AND RECEIVES AN EMPTY LIST EVERY TIME.
// Its radius is 0.08; v3604 measured this fixture's activation floor at 0.321239, so findCollisionPairs
// returns nothing on every call and the collision solve loops over zero constraints. The pass is ENTERED and
// never EXERCISED -- the same defect v3606 found by hand in clothLoop-selfcheck, and this second instance was
// found by tools/ship/collisionCensus.mjs, which counts it rather than reasoning about it.
//
// NOT FIXED HERE ON PURPOSE: this gate's subject is the KEY, not the contact pass, and changing its fixture
// would move numbers it has frozen. The census carries the fact; real contact parity lives in
// solverParity-selfcheck and the order claim in collisionCensus-selfcheck.
//
// ANTIDOTE: if somebody raises this radius to an active one, the census's BLIND count falls and
// collisionCensus-selfcheck's section 3 goes RED -- rewrite it to the smaller list and name who was fixed,
// do not widen "BLIND" to keep the number.
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const keys = clothLoopKeys();

// ---- 1. THE CLOTH ACTUALLY MOVES, SO THE EQUIVALENCE IS NOT READ OFF A STATIC SHEET -------------------------------
{
    const ff = freeFall();
    ok("the integrator moves the cloth before any equivalence is read off it",
        keys.clothMoves === true && ff.freeFallDrop > 1e-4,
        `the free particle falls ${ff.freeFallDrop.toExponential(3)} in one frame and the swept cloth moves under ` +
        "gravity. Asserted first because two solvers that both did nothing would be byte-identical for the wrong " +
        "reason -- this is the positive control that there is real motion to reproduce");
}

// ---- 2. FREE-FALL MATCHES THE SEMI-IMPLICIT EULER CLOSED FORM ------------------------------------------------------
{
    const ff = freeFall();
    ok("!! one frame of a free particle lands at g*dt^2 with velocity g*dt, exactly",
        ff.freeFallErr === 0,
        `worst deviation from the closed form is ${ff.freeFallErr.toExponential(2)}. predict does vel += g*dt then ` +
        "pos += vel*dt, and finalize reads vel back as (pred-prev)/dt -- so pos = g*dt^2 and vel = g*dt to the bit. " +
        "The reference is the closed form, and no other xpbd device grades the integrator against it");
}

// ---- 3. THE DECOMPOSED LOOP EQUALS THE MONOLITH ACROSS A SWEEP -----------------------------------------------------
{
    const eq = equivalenceSweep();
    ok("!! the buffer-pass loop reproduces clothSubstep byte-for-byte across every swept config",
        eq.equivErr === 0,
        `worst position difference ${eq.equivErr.toExponential(2)} over {1,3,5,8} iterations x three grids, 20 ` +
        "frames each. The selfcheck proves this at one config; sweeping it is the lab reach -- the equivalence is " +
        "a claim about ALL configs, and the sensitivity harness can now plant a divergence into any of them");
}

// ---- 4. THE DROPPED-FEEDBACK PLANT DIVERGES, AND IS HONEST AT COMPLIANCE 0 ----------------------------------------
{
    const p = droppedLambdaPlant();
    ok("!! dropping the -aTilde*lambda feedback term breaks the equivalence at positive compliance",
        p.plantEquivErr > 1e-6,
        `the broken loop departs from the monolith by ${p.plantEquivErr.toExponential(3)} on a shear/bending cloth ` +
        "-- the XPBD feedback term is what makes compliance behave as a physical stiffness, and a loop that drops " +
        "it is a different solver wearing the same passes");

    ok("...and AGREES with the monolith byte-for-byte at compliance 0",
        p.plantAgreesAtZero === 0,
        `with every compliance 0 the broken and correct loops are identical (${p.plantAgreesAtZero.toExponential(2)}) ` +
        "-- the dropped term is aTilde*lambda and aTilde is 0 there, so a check that fired at compliance 0 would be " +
        "accusing something other than the feedback term the plant removes");
}

console.log();
if (fails) { console.log("clothLoopKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("clothLoopKey-selfcheck: all checks pass");
