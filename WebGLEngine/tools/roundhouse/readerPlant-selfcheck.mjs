// WebGLEngine/tools/roundhouse/readerPlant-selfcheck.mjs -- v3393
//
// *** THE FIRST READER PLANT, AND IT DEMONSTRATES MECHANICALLY WHAT v3091 PROVED ALGEBRAICALLY. ***
//
// Every plant before this one perturbs a PHYSICS KNOB, which is plantedError.mjs's second design rule: the
// whole path from knob to observable gets graded, and perturbing the measured number would only test the
// comparator. pipe3d cannot be done that way. The failure worth reproducing here is "the solver got the PEAK
// right and the SHAPE wrong", and NO INPUT TO AN LBM PRODUCES THAT -- tau, the forcing and the grid all move
// the peak and the shape together.
//
// So this plant substitutes the READ: every cell in the pipe returns the MEASURED centreline speed, a PLUG
// PROFILE, while the simulation, the closed forms and the comparator are untouched. THAT IS A DIFFERENT KIND
// OF EVIDENCE AND IT IS DECLARED AS SUCH -- pipeDevice.plantKind = "reader", and the census keeps the two
// kinds apart instead of adding them into one coverage number.
//
// WHAT IT SHOWS: FOUR OBSERVABLES, TWO BLIND, AND THE TWO ARE BLIND FOR DIFFERENT REASONS.
//
//   centrelineErrFrac  BIT-IDENTICAL -- blind BY CONSTRUCTION, since the plug is built from that very value
//   nuErrFrac          BIT-IDENTICAL -- blind because it is centrelineErrFrac RESTATED, which is v3091's
//                      algebraic finding (nuErrFrac = e/(1-e) to 5.5e-15) now shown by a perturbation instead
//   profileRms         4.54e-2 -> 6.55e-1
//   flowErrFrac        4.98e-2 -> 9.30e-1, i.e. the plug carries 1.93x the true throughput
//
// *** THE SECOND ONE IS THE POINT. A RESTATEMENT AND A REAL SECOND KEY LOOK THE SAME UNTIL SOMETHING MOVES
// THAT SHOULD SEPARATE THEM. *** v3091 found it by doing the algebra; a plant finds it by running the device,
// which is cheaper and works on quantities whose algebra nobody has done.
"use strict";
import { getDevice } from "./devices.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const dev = await getDevice("pipe3d");
const nominal = await dev.build({ mode: "profile" });
const planted = await dev.build({ mode: "profile", config: { planted: true } });

// ---- 1. THE NULL TEST -------------------------------------------------------------------------------------
{
    ok("!! an unperturbed run reports nothing planted and lands where it always has",
        nominal.planted === false && planted.planted === true &&
        nominal.centrelineErrFrac < 0.05 && nominal.flowErrFrac < 0.1,
        "centrelineErrFrac " + nominal.centrelineErrFrac.toExponential(3) + ", flowErrFrac " +
        nominal.flowErrFrac.toExponential(3) + ". Every claim below is meaningless without this");
}

// ---- 2. TWO KEYS ARE BIT-IDENTICAL UNDER THE PLANT --------------------------------------------------------
{
    say("centrelineErrFrac " + nominal.centrelineErrFrac.toExponential(12) + " -> " +
        planted.centrelineErrFrac.toExponential(12) + ";  nuErrFrac " + nominal.nuErrFrac.toExponential(12) +
        " -> " + planted.nuErrFrac.toExponential(12));
    ok("!! *** centrelineErrFrac does not move by ONE ULP -- blind by construction ***",
        planted.centrelineErrFrac === nominal.centrelineErrFrac,
        "the plug is built from the MEASURED centreline, not the theoretical one. Planting the theory value " +
        "would have driven this to exactly zero, which LOOKS like blindness and is really a different and " +
        "better-scoring run. BIT-IDENTICAL IS THE CLAIM WORTH MAKING");
    ok("!! *** and nuErrFrac does not move either -- blind because it is centrelineErrFrac RESTATED ***",
        planted.nuErrFrac === nominal.nuErrFrac,
        "v3091 proved that algebraically (nuImplied inverts the SAME closed form the centreline is graded " +
        "against, so nuErrFrac = e/(1-e) to 5.5e-15). THIS SHOWS IT BY RUNNING THE DEVICE: a perturbation that " +
        "moves the field enormously moves neither number. A RESTATEMENT AND A REAL SECOND KEY LOOK THE SAME " +
        "UNTIL SOMETHING MOVES THAT SHOULD SEPARATE THEM");
    ok("...and they are blind for DIFFERENT reasons, which is why finding two is not finding one twice",
        planted.centrelineErrFrac === nominal.centrelineErrFrac && planted.nuErrFrac === nominal.nuErrFrac &&
        nominal.nuErrFrac !== nominal.centrelineErrFrac,
        "one is blind because the plant was built from it; the other because it carries no information the " +
        "first does not. The two numbers are not even equal (" + nominal.centrelineErrFrac.toExponential(4) +
        " against " + nominal.nuErrFrac.toExponential(4) + ") -- being a restatement is not being a copy");
}

// ---- 3. THE TWO REAL KEYS CATCH IT ------------------------------------------------------------------------
{
    const rmsGain = planted.profileRms / nominal.profileRms;
    const flowGain = planted.flowErrFrac / nominal.flowErrFrac;
    say("profileRms " + nominal.profileRms.toExponential(3) + " -> " + planted.profileRms.toExponential(3) +
        " (" + rmsGain.toFixed(1) + "x);  flowErrFrac " + nominal.flowErrFrac.toExponential(3) + " -> " +
        planted.flowErrFrac.toExponential(3) + " (" + flowGain.toFixed(1) + "x)");
    ok("!! the volumetric throughput catches the plug, because its integrand peaks where the centreline is blind",
        planted.flowErrFrac > 0.5 && flowGain > 5,
        "u(r) 2 pi r VANISHES at r = 0 and peaks near R/sqrt(2), so a profile with the right peak and the " +
        "wrong shape is exactly what it is for");
    ok("...and the ratio it reports is the analytic one, not a tuned threshold",
        Math.abs(planted.flowMeasured / planted.flowTheory - 2) < 0.1,
        "a plug at u0 = F R^2/(4 nu) carries u0 pi R^2 against the true pi F R^4/(8 nu) -- EXACTLY 2 in the " +
        "continuum, measured " + (planted.flowMeasured / planted.flowTheory).toFixed(4) + " on this lattice. " +
        "THE SHORTFALL FROM 2 IS THE DISCRETISATION, and it is reported rather than tuned away");
    ok("profileRms moves too, but it is a goodness-of-fit number rather than a physical quantity",
        planted.profileRms > 0.3 && rmsGain > 5,
        rmsGain.toFixed(1) + "x. Listed second on purpose: it has no analytic value an engineer would care " +
        "about independently, which is why flowErrFrac is the device's second KEY and this is a diagnostic");
}

// ---- 4. THE KIND IS DECLARED, AND THE TWO KINDS ARE NEVER SUMMED ------------------------------------------
{
    ok("!! *** pipe3d DECLARES plantKind as 'reader', because no census can derive it ***",
        dev.plantKind === "reader",
        "from outside, a knob plant and a reader plant are both 'a config key goes in and numbers change'. " +
        "Only the author knows WHERE the perturbation enters, so it is declared -- and a bind that has not " +
        "declared reads `undeclared` rather than being assumed a knob");
    ok("...and this plant is honest about what it does NOT grade",
        planted.flowTheory === nominal.flowTheory && planted.nuTheory === nominal.nuTheory,
        "the simulation, both closed forms and the comparator are untouched, so this says NOTHING about " +
        "whether the solver is right -- only about which of the device's four numbers could tell you");
}

console.log(failed ? "\n[readerPlant-selfcheck] FAILED " + failed : "\n[readerPlant-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
