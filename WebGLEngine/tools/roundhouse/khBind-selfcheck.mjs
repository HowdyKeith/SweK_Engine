// tools/roundhouse/khBind-selfcheck.mjs -- v3766
//
// *** THIS DEVICE HAD NO GATE OF ITS OWN, AND IT ALREADY DECLARED ITS OWN WEAKNESS -- WHICH IS WHAT DECIDED
// WHERE THE PLANT GOES. khBind's header says outright that the peak growth rate comes out near 0.11 against
// Michalke's 0.1897 (a 44% residual), because Michalke is INVISCID and this is a coarse viscous lattice, and
// that "the SHARP claims are the ones with clean answers: where the band ends, and that a peak exists inside
// it". *** A PLANT AIMED AT peakSigmaNorm WOULD HAVE BEEN AIMED AT THE OBSERVABLE THE DEVICE HAS ALREADY SAID
// IS SOFT -- so it is aimed at the abscissa instead, where the claims are sharp. ***
//
// *** THE MISTAKE THE LITERATURE INVITES: Michalke's relation is stated in k*delta with delta the VORTICITY
// THICKNESS, and the HALF-THICKNESS is an equally common convention in the same body of work. k*delta/2 is not
// a scrambled number -- IT IS THE SAME LAYER MEASURED THE OTHER WAY, and it moves THE BAND EDGE BY A FACTOR
// OF TWO while every growth rate stays exactly as measured. THE FLUID IS UNTOUCHED AND ONLY THE X-AXIS LIES. ***

import { khDevice, KH_OBSERVABLES } from "./khBind.mjs";
import { MICHALKE } from "../../simulation/lbm/khDispersion.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const build = khDevice.build;

const honest = await build({ mode: "sweep" });
const planted = await build({ mode: "halfthickness" });

// ---- 1. THE DECLARED GAP IS STILL THERE, AND IS NOT THE PLANT'S TARGET ------------------------------------
console.log("1. THE SOFT OBSERVABLE, LEFT SOFT ON PURPOSE");
{
    ok("!! peakSigmaNorm still sits well off Michalke, exactly as the device's header says",
        honest.peakSigmaErrFrac > 0.3,
        "measured " + honest.peakSigmaNorm.toFixed(6) + " against Michalke's " + honest.michalkePeakSigma.toFixed(6) +
        ", errFrac " + honest.peakSigmaErrFrac.toExponential(3) + ". *** THAT IS VISCOUS DAMPING AT FINITE " +
        "REYNOLDS NUMBER ON A COARSE LATTICE AGAINST AN INVISCID RESULT, DECLARED SINCE v2818 AND NOT A DEFECT. " +
        "A PLANT AIMED HERE WOULD HAVE BEEN AIMED AT AN OBSERVABLE THE DEVICE HAS ALREADY CALLED SOFT ***");
    ok("!! *** AND THE PLANT DOES NOT MOVE IT AT ALL -- THE FLUID IS UNTOUCHED ***",
        planted.peakSigmaNorm === honest.peakSigmaNorm,
        "identical to every digit. The plant changes the ABSCISSA, not the simulation: every growth rate is " +
        "exactly as measured, and only where they are PLOTTED is wrong");
}

// ---- 2. THE SHARP CLAIM, AND THE BINARY IT RESTS ON --------------------------------------------------------
console.log("\n2. WHERE THE BAND ENDS -- THE CLAIM WITH A CLEAN ANSWER");
{
    ok("!! the honest sweep respects the neutral point: inside the band grows, outside does not",
        honest.neutralRespected === true && honest.unstableCount > 0 && honest.stableCount > 0,
        honest.unstableCount + " unstable and " + honest.stableCount + " stable over " + honest.points +
        " points, band edge k*delta = " + MICHALKE.neutral + ". *** BOTH COUNTS MUST BE NON-ZERO OR THE CLAIM " +
        "IS VACUOUS: a sweep entirely inside the band would satisfy 'everything inside grew' by never leaving ***");
    ok("!! *** THE PLANT FLIPS neutralRespected TO FALSE -- A BINARY THE CLAIM RESTS ON ***",
        planted.neutralRespected === false,
        "halving the abscissa moves the band edge by two, so waves that genuinely do NOT grow are relabelled " +
        "as INSIDE the band. In the same class as gyroscope's `precessed` 1 -> 0 and the integer rank of the " +
        "LAPACK key: NOT A TOLERANCE, A VERDICT");
    ok("!! and peakKD halves exactly, which is the arithmetic saying the same thing",
        Math.abs(planted.peakKD * 2 - honest.peakKD) < 1e-9 &&
        planted.peakKDErrFrac > honest.peakKDErrFrac * 3,
        "peakKD " + honest.peakKD.toFixed(5) + " -> " + planted.peakKD.toFixed(5) + ", errFrac " +
        honest.peakKDErrFrac.toExponential(3) + " -> " + planted.peakKDErrFrac.toExponential(3) + ". *** THE " +
        "errFrac SEPARATION IS ONLY 4.8x AND THAT IS HONEST: the honest run is ALREADY 11.7% off in peakKD " +
        "because the sweep has FIVE points, so the peak's resolution is the sweep spacing. THE BINARY IS THE " +
        "STRONG EVIDENCE HERE AND THE RATIO IS THE WEAK ONE -- said rather than left for a reader to discover ***");
    ok("!! the reference is untouched -- one-sided by construction",
        planted.michalkePeakKD === honest.michalkePeakKD && planted.michalkePeakSigma === honest.michalkePeakSigma,
        "MICHALKE is a typed external and never sees the simulation, so a plant on the lattice CANNOT cancel " +
        "against it (v3733)");
    ok("!! and the device DECLARES the plant, with `sweep` first so the contract compares like with like",
        khDevice.plantMode === "halfthickness" && khDevice.plantFlips === "peakKDErrFrac" &&
        khDevice.plantKind === "mode" && khDevice.modes[0] === "sweep",
        "plantFlips names peakKDErrFrac rather than neutralRespected because the census requires a FINITE " +
        "NUMBER THAT MOVES and neutralRespected is a boolean -- the binary is asserted here instead, where a " +
        "gate can read it");
}

report("WHAT THIS DOES NOT CLAIM",
    "That kh's growth rates are accurate -- they are 44% off an inviscid reference and the device says so " +
    "itself. Nor that the SINGLE and NEUTRAL modes are tested: the plant runs the sweep branch only. ONE PLANT " +
    "TESTS ONE CLAIM. And the run is slow -- a sweep is ~33 s here, five lattice runs -- so this gate is one " +
    "of the ~1000 that the ship ritual does not drive.");

console.log("\nkhBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
