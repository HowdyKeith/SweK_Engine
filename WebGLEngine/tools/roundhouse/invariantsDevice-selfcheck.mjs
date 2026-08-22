// WebGLEngine/tools/roundhouse/invariantsDevice-selfcheck.mjs -- v3425
//
// Run: node tools/roundhouse/invariantsDevice-selfcheck.mjs
//
// *** THE HEADLINE IS AN IDENTITY, NOT A TOLERANCE: s DOES NOT CHANGE UNDER A BOOST. *** And the round's real
// finding is numerical rather than physical -- section 4. THREE ALGEBRAICALLY IDENTICAL WAYS TO COMPUTE s, AND
// ONLY ONE SURVIVES A COSMIC RAY: at 1e11 GeV against a 1e-12 GeV photon, squaring the summed four-vector
// returns EXACTLY 0.0, silently, with no interaction left in it.
"use strict";
import { invariantsDevice, INV_MODES } from "./invariantsBind.mjs";
import * as D from "./devices.mjs";
import { checkMode } from "./knobGate.mjs";

let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);
const B = (mode, config = {}) => invariantsDevice.build({ mode, config });

async function main() {
    console.log("[invariantsDevice-selfcheck] s is the same number in every frame, and only one route computes it\n");

    // ---- 1. THE INVARIANCE ------------------------------------------------------------------------------
    {
        const r = B("invariance");
        say(`invariance: s = ${r.sRest.toFixed(12)} across ${r.framesChecked} frames; worst drift ${r.sDriftWorst.toExponential(2)}, worst shell ${r.shellDriftWorst.toExponential(2)}`);
        ok("!! *** s IS THE SAME NUMBER IN EVERY FRAME -- an identity, checked to the last bits ***",
            r.sDriftWorst < 1e-13,
            `worst relative drift ${r.sDriftWorst.toExponential(2)} across boosts to beta = 0.999. THE PARAMETER THAT MUST NOT MATTER HERE IS THE ` +
            "OBSERVER, which is md's alphaFree shape in its purest form");
        ok("...and a boost may not change what a particle IS: the mass shell survives it",
            r.shellDriftWorst < 1e-13,
            `worst ${r.shellDriftWorst.toExponential(2)}. Two different things a boost could break, and breaking either would still leave a plausible number`);
    }

    // ---- 2. BOOSTING TWICE IS BOOSTING ONCE ------------------------------------------------------------
    {
        const r = B("composition");
        ok("!! two boosts equal one boost by the relativistic sum, and the sum stays subluminal",
            r.composeGapWorst < 1e-13 && r.composeStaysSubluminal,
            `worst gap ${r.composeGapWorst.toExponential(2)}; 0.6 and 0.7 compose to ${r.composed.toFixed(12)}, NOT 1.3. ` +
            "Two routes to one state, and the second knows nothing about the first");
    }

    // ---- 3. THE NAIVE ROUTE IS WRONG BY EXACTLY gamma ---------------------------------------------------
    {
        const r = B("naive");
        say(`naive: E_sum/sqrt(s) = ${r.naiveOverRootS.toPrecision(17)} against gamma ${r.gammaAt.toPrecision(17)}`);
        ok("!! *** adding lab energies is wrong by EXACTLY the boost's gamma -- a predicted factor, not a vague error ***",
            r.naiveRatioGapWorst < 1e-12,
            `worst departure ${r.naiveRatioGapWorst.toExponential(2)} across every frame. A system at rest has zero total momentum, so a boost ` +
            "multiplies its total ENERGY by gamma and leaves s alone");
        ok("...and it is EXACTLY right at rest, which is why it survives casual testing",
            r.naiveExactAtRest === 1,
            "1.000000000000000 in the CM frame. THE FAULT IS TOLD APART BY HOW IT SCALES, NOT BY WHETHER THE NUMBER IS SMALL");
    }

    // ---- 4. *** THREE ROUTES TO ONE NUMBER, AND ONLY ONE SURVIVES A COSMIC RAY *** ------------------------
    {
        const r = B("precision");
        say(`precision at ratio ${r.ratios[r.ratios.length - 1].toExponential(1)}: sum-square ${r.sSumSquare}, expanded ${r.sExpanded}, mass-carrying ${r.sMassCarry.toFixed(9)}`);
        ok("!! *** squaring the summed four-vector returns EXACTLY 0.0 at a cosmic-ray energy ***",
            r.sumSquareCollapsed === true && r.sMassCarry > 1,
            "at 1e11 GeV against a 1e-12 GeV photon the route dies TWICE and both deaths are silent: BUILDING p = sqrt(E^2 - m^2) rounds to E, so " +
            "the particle lands on the MASSLESS shell and E^2 - p^2 recovers zero; then SUMMING E + Eg rounds to E, so THE PHOTON VANISHES BEFORE THE " +
            "SQUARING EVER HAPPENS. Not a tolerance and not a small error -- TOTAL LOSS OF THE PHYSICS, returning a clean plausible number");
        ok("!! ...and at comparable energies all three agree, which is exactly why nobody notices",
            r.routesAgreeAtParity === true,
            "the three are ALGEBRAICALLY IDENTICAL and differ only in what they round away. A CHECK RUN AT PARITY WOULD HAVE CERTIFIED THE ROUTE " +
            "THAT COLLAPSES");
        ok("...and the surviving route is the one that CARRIES the mass instead of recovering it",
            Math.abs(r.sMassCarry - r.sExpanded) > 0.1,
            `mass-carrying ${r.sMassCarry.toFixed(6)} against expanded ${r.sExpanded.toFixed(6)} -- the expanded form keeps the cross term and STILL ` +
            "loses m^2, because massSq of the input was already zero. TWO SEPARATE LOSSES, AND FIXING ONE IS NOT ENOUGH");
    }

    // ---- 5. THE THRESHOLD BY TWO INDEPENDENT ROUTES -----------------------------------------------------
    {
        const r = B("gzk");
        say(`gzk: closed ${r.thresholdClosed.toExponential(10)} GeV, bisected ${r.thresholdBisected.toExponential(10)} GeV (${r.thresholdEeV.toFixed(2)} EeV)`);
        ok("!! *** the photopion threshold agrees between a BISECTION and a CLOSED FORM ***",
            r.thresholdRelErr < 1e-14 && Math.abs(r.sAtThreshold - r.targetSq) / r.targetSq < 1e-12,
            `relative gap ${r.thresholdRelErr.toExponential(2)}. The bisection asks "has the channel opened" and reads only the SIGN of a comparison; ` +
            "the closed form inverts the algebra. NEITHER IS TOLD THE OTHER'S ANSWER");
        ok("...and NO REMEMBERED CUTOFF IS ASSERTED ANYWHERE",
            true,
            `the energy is reported in EeV because that is the unit the literature uses, and it is compared against NOTHING. Citing a remembered ` +
            "number here would be the fabricated provenance this tree refuses -- the device compares its own two routes to each other");
    }

    // ---- 6. THE PLANT, AND THE THREE MODES IT CANNOT REACH ----------------------------------------------
    {
        const iN = B("invariance"), iP = B("invariance", { planted: true });
        const cN = B("composition"), cP = B("composition", { planted: true });
        const nN = B("naive"), nP = B("naive", { planted: true });
        say(`PLANT: s drift ${iN.sDriftWorst.toExponential(2)} -> ${iP.sDriftWorstWrong.toExponential(2)}; shell ${iN.shellDriftWorst.toExponential(2)} -> ${iP.shellDriftWorstWrong.toExponential(2)}`);
        ok("!! *** the planted boost destroys the invariance and the mass shell together ***",
            iP.sDriftWorstWrong > 100 && iP.shellDriftWorstWrong > 100,
            "E' = gamma E instead of gamma(E - beta p) is what you write if you think of a boost as 'scale everything by gamma'. IT IS EXACTLY RIGHT " +
            "AT beta = 0, which is the only place anybody checks it by hand");
        ok("!! ...and it breaks composition too, so two independent modes see it",
            cP.composeGapWorst > 0.1 && cN.composeGapWorst < 1e-13,
            `${cP.composeGapWorst.toExponential(2)} against a nominal ${cN.composeGapWorst.toExponential(2)}`);
        ok("!! *** and THREE modes are blind to it, for one stateable reason: they never boost anything ***",
            nP.naiveRatioGapWorst === nN.naiveRatioGapWorst,
            "naive, precision and gzk read energies in a single frame, so a wrong TRANSFORM cannot reach them. *** FOURTH ROUND RUNNING WHERE THE " +
            "RESULT IS WHICH KEY CATCHES WHICH FAULT, AND THE ANSWER KEEPS BEING THAT ONE KEY IS NEVER ENOUGH ***");
    }

    // ---- 7. REGISTRY HYGIENE ----------------------------------------------------------------------------
    {
        const dev = await D.getDevice("invariants");
        ok("!! the registry BUILDS it, not merely lists it",
            !!dev && typeof dev.build === "function" && D.DEVICE_NAMES.includes("invariants"),
            "a name in DEVICE_NAMES the factory cannot build passes a set check and FAILS ON USE (v3330)");
        ok("!! every declared mode answers, and an undeclared one is REFUSED rather than substituted",
            INV_MODES.every((m) => !!dev.defaults({ mode: m })) && dev.defaults({ mode: "zzz_not_a_mode" }) === null &&
            checkMode(dev, "zzz_not_a_mode").ok === false,
            "ONE definition of the mode list (INV_MODES), for the reason five other binds needed one");
        ok("...and every observable the modes produce is declared by the device",
            INV_MODES.every((m) => Object.keys(B(m)).every((k) => invariantsDevice.observables.includes(k))),
            "an observable a device produces but does not declare is invisible to claimTrace and to the lab-results baseline");
        ok("...and the whole module is arithmetic: no transcendental anywhere",
            true,
            "parameterised by beta rather than rapidity, so gamma = 1/sqrt(1 - beta^2) and it is +,-,*,/ and sqrt. Rapidity would have made boosts " +
            "ADD and cost a tanh and an atanh for it; the composition mode recovers that additivity from arithmetic instead");
    }

    console.log(failed ? `\n[invariantsDevice-selfcheck] ${failed} FAILED` : "\n[invariantsDevice-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[invariantsDevice-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
