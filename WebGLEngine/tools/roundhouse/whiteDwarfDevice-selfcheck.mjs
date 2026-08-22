// WebGLEngine/tools/roundhouse/whiteDwarfDevice-selfcheck.mjs -- v3422
//
// Run: node tools/roundhouse/whiteDwarfDevice-selfcheck.mjs
//
// *** THE FINDING OF THIS ROUND IS SECTION 4 AND IT WAS NOT PLANNED: THE PLANTED ERROR MAKES ONE KEY LOOK
// BETTER. *** The plant swaps the mass-radius law for the plausible non-relativistic one, R ~ M^(-1/3) with the
// relativistic factor dropped -- which is what a first pass writes down. The "exponent" mode recovers -1/3 by
// regression, so under the plant it returns -0.33333333333333740 against a nominal -0.3336203667: THE WRONG LAW
// SCORES FOUR THOUSAND MILLION TIMES BETTER, because the exponent it was built to recover is the one thing the
// wrong law gets exactly right. A device graded on that key alone would rate the plant a superior model.
//
// THAT IS THE ARGUMENT FOR TWO KEYS IN DIFFERENT REGIMES, MADE BY MEASUREMENT RATHER THAN BY ASSERTION. The
// formula is a PRODUCT of two factors and each mode grades one of them: far below the limit the second factor
// is ~1 and the slope tends to -1/3; at the limit the first is nearly constant and R falls as
// (M_ch - M)^(1/2). An error in either factor is invisible to the other exponent -- and here it is, visible.
"use strict";
import { whiteDwarfDevice, WD_MODES } from "./whiteDwarfBind.mjs";
import * as D from "./devices.mjs";
import { checkMode } from "./knobGate.mjs";

let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);
const B = (mode, config = {}) => whiteDwarfDevice.build({ mode, config });

async function main() {
    console.log("[whiteDwarfDevice-selfcheck] electron degeneracy, graded on exponents its own module never forms\n");

    // ---- 1. THE LOW-MASS EXPONENT CONVERGES ON -1/3 ------------------------------------------------------
    {
        const r = B("exponent");
        const wide = B("exponent", { window: 0.2 });
        say(`exponent: window 0.01 -> ${r.slopeMeasured.toFixed(6)} (r2 ${r.r2.toFixed(8)}); window 0.2 -> ${wide.slopeMeasured.toFixed(6)}`);
        ok("!! *** the key is that the slope CONVERGES on -1/3, not that it sits near it ***",
            r.converging && r.slopeErrAbs < 1e-3 && r.slopeErrAbs < wide.slopeErrAbs,
            `${r.slopeMeasured.toFixed(6)} on a 0.01 window against ${wide.slopeMeasured.toFixed(6)} on 0.2. A SLOPE MERELY NEAR -1/3 COULD ` +
            "COME FROM ANY NUMBER OF WRONG LAWS; one that walks onto it as the window shrinks can only come from this one. Nothing here supplies -1/3 to the fit");
    }

    // ---- 2. THE LIMIT EXPONENT IS AN EXACT HALF, FROM THE OTHER FACTOR -----------------------------------
    {
        const r = B("limitOrder"), coarse = B("limitOrder", { eps: 1e-3 });
        say(`limitOrder: eps 1e-5 -> ${r.limitSlope.toFixed(8)} (r2 ${r.limitR2.toFixed(10)}); eps 1e-3 -> ${coarse.limitSlope.toFixed(8)}`);
        ok("!! *** R falls as (M_ch - M)^(1/2) at the limit, and it is an EXACT half approached ***",
            r.limitSlopeErrAbs < 1e-5 && r.limitR2 > 0.9999999 && r.limitSlopeErrAbs < coarse.limitSlopeErrAbs,
            `${r.limitSlope.toFixed(8)} against 0.5. THIS GRADES THE OTHER FACTOR OF THE SAME FORMULA -- the relativistic correction -- ` +
            "which the mode above cannot see at all");
    }

    // ---- 3. mu_e HAS A PREDICTED SCALING AND AN INVARIANCE, WHICH ARE TWO QUESTIONS ----------------------
    {
        const r = B("muScaling");
        say(`muScaling: slope ${r.muSlope}, shape spread ${r.shapeInvariantSpread.toExponential(2)}`);
        ok("!! the Chandrasekhar limit goes as mu_e^-2 EXACTLY",
            r.muSlopeErrAbs < 1e-12,
            `slope ${r.muSlope} against -2, error ${r.muSlopeErrAbs.toExponential(2)} -- 5.826/mu_e^2, and the fit is handed only the radii`);
        ok("...and mu_e enters the radius ONLY through the limit: at a fixed fraction of M_ch, R * M^(1/3) does not move",
            r.shapeInvariantSpread < 1e-12,
            `spread ${r.shapeInvariantSpread.toExponential(2)} across mu_e = 1.8, 2 and 2.6 -- a formula that had smuggled mu_e in anywhere ` +
            "else would break this while passing the slope");
    }

    // ---- 4. *** THE PLANT MAKES ONE KEY LOOK BETTER, AND THAT IS THE ROUND'S FINDING *** ------------------
    {
        const eN = B("exponent"), eP = B("exponent", { planted: true });
        const lN = B("limitOrder"), lP = B("limitOrder", { planted: true });
        const mN = B("muScaling"), mP = B("muScaling", { planted: true });
        say(`plant vs exponent:   nominal err ${eN.slopeErrAbs.toExponential(2)}  PLANTED err ${eP.slopeErrAbs.toExponential(2)}`);
        say(`plant vs limitOrder: nominal err ${lN.limitSlopeErrAbs.toExponential(2)}  PLANTED err ${lP.limitSlopeErrAbs.toExponential(2)} (r2 ${lP.limitR2.toFixed(4)})`);
        ok("!! *** THE PLANTED WRONG LAW SCORES BETTER ON THE EXPONENT KEY THAN THE REAL ONE ***",
            eP.slopeErrAbs < eN.slopeErrAbs,
            `${eP.slopeErrAbs.toExponential(2)} against ${eN.slopeErrAbs.toExponential(2)}. Dropping the relativistic factor leaves EXACTLY ` +
            "M^(-1/3), so the wrong law nails the very exponent this key recovers. A DEVICE GRADED ON THIS KEY ALONE WOULD RATE THE PLANT A " +
            "SUPERIOR MODEL -- which is why a key that a plausible error IMPROVES is worth naming rather than quietly replacing");
        ok("!! ...and the limit key CATCHES it outright, which is what the second regime is for",
            lP.limitSlopeErrAbs > 0.4 && lP.limitR2 < 0.99,
            `the planted slope is ${lP.limitSlope.toExponential(2)} against 0.5, and the fit degrades to r2 ${lP.limitR2.toFixed(4)} -- ` +
            "the naive law is FLAT near the limit because it has no limit");
        ok("!! ...and the mu key is blind TOO, for a stateable reason: the planted law has no mu_e in it at all",
            Math.abs(mP.muSlopeErrAbs - mN.muSlopeErrAbs) < 1e-12 && mP.shapeInvariantSpread < 1e-12,
            "*** AN INVARIANCE A LAW SATISFIES BY IGNORING THE PARAMETER ENTIRELY IS SATISFIED VACUOUSLY -- the 'checks pass because it does " +
            "nothing' shape (v3177). THE INVARIANCE IS NECESSARY AND NOT SUFFICIENT, and saying so is worth more than deleting it ***");
        ok("...and the plant removes the Chandrasekhar limit altogether, not merely the accuracy",
            lN.naiveEverCollapses === false && lN.naiveRatioLow < 1.02 && lN.naiveRatioHigh > 100,
            `the naive radius is finite at 1.5 M_ch, so nothing ever collapses; and it is ${((lN.naiveRatioLow - 1) * 100).toFixed(2)}% off at ` +
            `0.1 solar masses against ${lN.naiveRatioHigh.toFixed(0)}x at the limit. THE FAULT IS TOLD APART BY WHERE IT IS WRONG, NOT BY HOW BIG IT IS`);
    }

    // ---- 5. THE ACCRETION MODE IS REPORTED, NOT KEYED, AND SAYS SO ---------------------------------------
    {
        const r = B("accretion");
        ok("the accretion run-up agrees with its own arithmetic, and is REPORTED rather than graded",
            r.steps === r.stepsPredicted && r.detonated === true,
            `${r.steps} steps to the limit against a predicted ${r.stepsPredicted}. (M_ch - M0)/dM is arithmetic THIS FILE COULD DO ITSELF, so ` +
            "grading it would be a MIRROR (v3201) -- the route that measures is the route that set it. It is here because the run-up to a Type Ia " +
            "is the thing somebody wants to watch, and a disagreement would mean the LOOP had gone wrong rather than the physics");
    }

    // ---- 6. REGISTRY HYGIENE ----------------------------------------------------------------------------
    {
        const dev = await D.getDevice("whitedwarf");
        ok("!! the registry BUILDS it, not merely lists it",
            !!dev && typeof dev.build === "function" && D.DEVICE_NAMES.includes("whitedwarf"),
            "a name in DEVICE_NAMES the factory cannot build passes a set check and FAILS ON USE, inside an agent run rather than here (v3330)");
        ok("!! every declared mode answers, and an undeclared one is REFUSED rather than substituted",
            WD_MODES.every((m) => !!dev.defaults({ mode: m })) && dev.defaults({ mode: "zzz_not_a_mode" }) === null &&
            checkMode(dev, "zzz_not_a_mode").ok === false,
            "defaults() returns null for an undeclared mode, which knobGate reads as a refusal -- the stronger answer, and the one v3420 taught " +
            "checkMode to understand. THE MODE LIST HAS ONE DEFINITION (WD_MODES) for the reason four other binds needed one");
        ok("...and every observable the modes produce is declared by the device",
            WD_MODES.every((m) => Object.keys(B(m)).every((k) => whiteDwarfDevice.observables.includes(k))),
            "an observable a device produces but does not declare is invisible to claimTrace and to the lab-results baseline");
    }

    console.log(failed ? `\n[whiteDwarfDevice-selfcheck] ${failed} FAILED` : "\n[whiteDwarfDevice-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[whiteDwarfDevice-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
