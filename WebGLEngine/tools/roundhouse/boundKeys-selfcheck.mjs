// WebGLEngine/tools/roundhouse/boundKeys-selfcheck.mjs -- v3420
//
// Run: node tools/roundhouse/boundKeys-selfcheck.mjs
//
// *** FOUR MODULES ARRIVED AT v3410 WITH A PAGE, A GATE AND A REAL EXTERNAL KEY, AND NOTHING BOUND THEM. ***
// physics/quantum/kronigPenney.js, physics/em/hall.js, physics/em/waveguide.js and physics/elasticity/
// buckling.js were each an instrument you could LOOK AT and could not RUN: gradedCoverage counted them ungraded
// because reachability is measured from a device bind, and with no bind there is no lab export, no
// corroboration, no planted error and no lab-results row. AN INSTRUMENT YOU CANNOT RUN IS HALF AN INSTRUMENT.
//
// THEY ARE MODES, NOT DEVICES, AND THAT WAS A READING RATHER THAN A PREFERENCE: buckling shares beam.js's
// fourth-difference operator, hall and waveguide are electromagnetism beside maxwell, and kronigPenney is the
// same 1D Schrodinger subject as the quantum device. v3199's shared-substrate rule -- and the reason it matters
// for buckling is sharp: ONE WRONG ROW IN THAT OPERATOR WOULD BREAK THE STATIC, VIBRATION AND BUCKLING KEYS AT
// ONCE, which is what makes a third question on it worth more than a third device.
//
// EVERY CHECK BELOW GRADES A KEY THE MODULE DOES NOT COMPUTE FOR ITSELF -- an integer, a degeneracy, an
// exponent, or a criterion asked from the opposite side. None of them is "the number did not move".
"use strict";
import { beamDevice } from "./beamBind.mjs";
import { emDevice } from "./emBind.mjs";
import { quantumDevice, QUANTUM_MODES } from "./quantumBind.mjs";
import * as D from "./devices.mjs";

let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);

async function main() {
    console.log("[boundKeys-selfcheck] the four v3410 modules, now reachable from the roundhouse\n");

    // ---- 1. BUCKLING: THE KEY IS AN INTEGER --------------------------------------------------------------
    {
        const r = beamDevice.build({ mode: "buckling" });
        say(`buckling: P_cr ${r.pcr.toFixed(6)} vs exact ${r.pcrExact.toFixed(6)}, ratios ${r.oddSquare2.toFixed(4)} and ${r.oddSquare3.toFixed(4)}, refine ${r.refineRatio.toFixed(3)}`);
        ok("!! *** the higher critical loads land on the ODD SQUARES, and an integer is a far harder target than a fitted constant ***",
            Math.abs(r.oddSquare2 - 9) < 0.02 && Math.abs(r.oddSquare3 - 25) < 0.05,
            `${r.oddSquare2.toFixed(4)} against 9 and ${r.oddSquare3.toFixed(4)} against 25 -- NOTHING HERE WAS TOLD THOSE NUMBERS. ` +
            "A wrong operator would have to be wrong by the SAME factor at every mode to leave both ratios intact");
        ok("...and the absolute load matches pi^2 EI/(4L^2), which the ratios alone could not catch",
            r.pcrRelErr < 1e-4 && Math.abs(r.closedFormPcr - r.pcrExact) < 1e-12,
            `relative error ${r.pcrRelErr.toExponential(2)} -- a scale error preserves every ratio, so the two checks fail on different faults`);
        ok("!! ...and the error QUARTERS when the grid doubles, measured rather than asserted",
            Math.abs(r.refineRatio - 4) < 0.15,
            `${r.refineRatio.toFixed(4)} against 4 -- two grids, so this is a number and not a fit`);
    }

    // ---- 2. WAVEGUIDE: THE BOUNDARY CONDITION IS THE PHYSICS ---------------------------------------------
    {
        const r = emDevice.build({ mode: "waveguide" });
        say(`waveguide: TE10 ${r.te10.toFixed(6)} vs pi/a ${r.te10Exact.toFixed(6)}, TE01/TE20 gap ${r.degenerateGap.toExponential(2)}, TM lowest ${r.tmLowest.toFixed(4)}`);
        ok("!! *** TE01 and TE20 are DEGENERATE for a 2:1 guide, and NOTHING IN THE MATRIX KNOWS THAT ***",
            r.degenerateGap < 1e-10,
            `they agree to ${r.degenerateGap.toExponential(2)}. The degeneracy falls out of the GEOMETRY, not the discretisation, ` +
            "so agreement is a RESULT rather than a restatement of the method");
        ok("!! *** THERE IS NO TM10, AND THAT IS WHY THE MODE SET IS CHECKED AND NOT ONLY THE FREQUENCIES ***",
            r.tmHasTe10 === false && r.tmLowest > r.te10Exact * 2,
            `TM's lowest is ${r.tmLowest.toFixed(4)} (TM11), not ${r.te10Exact.toFixed(4)}. Ez must vanish on a conductor so TM needs both ` +
            "indices at least 1. Solving TM with the NEUMANN operator returns TE10 -- a tidy, plausible cutoff for a pipe that does not exist");
        ok("...and TE10 reaches pi/a, with the Neumann problem's single zero eigenvalue dropped BY NAME",
            r.te10RelErr < 5e-3 && Math.abs(r.neumannZero) < 1e-9,
            `TE10 within ${r.te10RelErr.toExponential(2)}; the dropped eigenvalue is ${r.neumannZero.toExponential(2)} -- ` +
            "dropped because A CONSTANT HAS NO CURVATURE, not because it happens to be small");
    }

    // ---- 3. HALL: THE NEGATIVE IS A PREDICTED EXPONENT, NOT A MAGNITUDE ----------------------------------
    {
        const r = emDevice.build({ mode: "hall" });
        say(`hall: rho_xx ${r.rhoXX.toExponential(5)}, naive 1/sigma_xx ${r.rhoXXNaive.toExponential(5)}, gap ${r.naiveGapRel.toExponential(3)} at wcTau ${r.wcTau.toExponential(3)}`);
        ok("!! *** rho_xx IS NOT 1/sigma_xx, AND THE GAP IS EXACTLY (omega_c tau)^2 ***",
            Math.abs(r.gapOverWcTauSq - 1) < 0.05,
            `gap/(wcTau)^2 = ${r.gapOverWcTauSq.toFixed(6)}. True for a scalar, FALSE for a tensor -- and at this field the gap is ` +
            `${r.naiveGapRel.toExponential(2)}, invisible to any tolerance anyone would write, while at omega_c tau ~ 8.8 it is 77x. ` +
            "THE TWO CASES ARE TOLD APART BY THEIR EXPONENT, NOT BY WHETHER THE NUMBER IS SMALL (v3201's rule, in a different subject)");
        ok("!! ...and tau IS A PARAMETER THAT MUST NOT MATTER: rho_xy = B/(nq) carries no tau at all",
            r.rhoXYTauSpread < 0.02,
            `sweeping tau over twenty-fold moves rho_xy by ${(r.rhoXYTauSpread * 100).toFixed(2)}% -- md's alphaFree shape, pointed at a ` +
            "real material constant. A model that had smuggled tau into the Hall term would move here and nowhere else");
    }

    // ---- 4. KRONIG-PENNEY: THE CRITERION ASKED FROM THE OPPOSITE SIDE ------------------------------------
    {
        const r = await quantumDevice.build({ mode: "bands" });
        say(`bands: ${r.bandCount} bands, ${r.gapCount} gaps, widest ${r.widestGap.toFixed(4)}, edge |rhs|-1 worst ${r.edgeRhsWorst.toExponential(2)}`);
        ok("!! the band edges sit where |rhs| = 1 EXACTLY",
            r.edgeRhsWorst < 1e-12,
            `worst departure ${r.edgeRhsWorst.toExponential(2)} -- an energy is allowed exactly when |rhs| <= 1, so the edges are that criterion's roots`);
        ok("!! *** AND THE GAPS ARE CHECKED FROM THE OTHER SIDE, WHICH A SLOPPY ROOT FIND CANNOT SATISFY ***",
            r.insideGapWorst > 1 && r.insideBandWorst <= 1,
            `the middle of every gap reads |rhs| = ${r.insideGapWorst.toFixed(4)} (FORBIDDEN) and the middle of every band ` +
            `${r.insideBandWorst.toFixed(4)} (ALLOWED). Reporting edges alone would let a bisection that converged on the wrong ` +
            "thing look tidy; asking the criterion the opposite question is what makes the forbidden gap a falsifier");
        ok("...and the mode's own barrier knob is used, because the shared default made the margin meaningless",
            r.widestGap > 1,
            `widest gap ${r.widestGap.toFixed(4)}. At the tunnel mode's shared V0 the gap midpoints read |rhs| = 1.00003 -- true, and ` +
            "a margin that thin is evidence of nothing. A FIXTURE SHARED WITH ANOTHER MODE IS NOT AUTOMATICALLY THE RIGHT FIXTURE");
    }

    // ---- 5. THE MODE LIST WAS DECLARED TWICE, AND ADDING A MODE FOUND IT THE WORST WAY -------------------
    {
        // *** build({mode:"bands"}) SILENTLY RETURNED THE "well" ANSWER. *** `modes:` on the device and a
        // hardcoded array inside quantumDefaults were two copies and only one was updated -- so a caller got a
        // plausible result for a question it did not ask, which is worse than a red gate.
        const bands = await quantumDevice.build({ mode: "bands" });
        const bogus = await quantumDevice.build({ mode: "notAMode" });
        ok("!! *** the quantum mode list has ONE definition, so a declared mode cannot silently fall back ***",
            QUANTUM_MODES.includes("bands") && bands.bandCount > 0 && bands.levelErrWorst === null,
            "the two copies disagreed the moment a mode was added, and the failure was SILENT rather than a refusal");
        ok("...and an UNDECLARED mode still falls back to the default, unchanged",
            bogus.levelErrWorst !== null && bogus.bandCount === undefined,
            "the fallback is the existing behaviour and is deliberately left alone -- this round fixed the SECOND DECLARATION, not the policy");
    }

    // ---- 6. THE POINT OF BINDING: THE ROUNDHOUSE CAN NOW RUN THEM ----------------------------------------
    {
        const beam = await D.getDevice("beam"), em = await D.getDevice("em"), q = await D.getDevice("quantum");
        const declared = (dev, m) => dev.modes.includes(m) && !!dev.defaults({ mode: m });
        ok("!! *** all four are DECLARED MODES on registered devices, so every roundhouse tool reaches them ***",
            declared(beam, "buckling") && declared(em, "waveguide") && declared(em, "hall") && declared(q, "bands"),
            "lab export, corroboration, a planted error and a lab-results row all key off the registry -- which is the whole reason " +
            "a page and a gate were not enough. NO NEW DEVICE WAS ADDED, so promptCost's count and the device census are untouched");
        ok("...and each new mode returns observables the device already declares",
            beamDevice.observables.includes("oddSquare2") && emDevice.observables.includes("gapOverWcTauSq") &&
            quantumDevice.observables.includes("insideGapWorst"),
            "an observable a device produces but does not declare is invisible to claimTrace and to the lab-results baseline");
    }

    console.log(failed ? `\n[boundKeys-selfcheck] ${failed} FAILED` : "\n[boundKeys-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[boundKeys-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
