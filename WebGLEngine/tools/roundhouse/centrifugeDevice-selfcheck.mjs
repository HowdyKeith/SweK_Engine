// WebGLEngine/tools/roundhouse/centrifugeDevice-selfcheck.mjs -- v3423
//
// Run: node tools/roundhouse/centrifugeDevice-selfcheck.mjs
//
// The module's own gate checks ONE STEP AT A TIME -- the terminal speed, the scalings of s, neutral buoyancy,
// banding, determinism. *** THE SOLUTION OF dr/dt = s omega^2 r IS r(t) = r0 exp(s omega^2 t), AND NOTHING
// ANYWHERE INTEGRATED IT. *** Every key here is a fact about the path.
//
// AND THE ROUND'S SECOND FINDING IS THE SAME SHAPE AS v3422's: THE PLANT IS CAUGHT BY THREE KEYS AND MISSED BY
// TWO, EACH FOR A REASON THAT CAN BE STATED. The planted error evaluates the centrifugal field at a FIXED
// radius instead of the particle's own -- the slip you make by reasoning from gravitational settling, where the
// field really is uniform. It leaves the sedimentation coefficient untouched and the band ORDER intact, so
// EVERY SINGLE-STEP CHECK IN THE MODULE'S GATE PASSES ON IT.
"use strict";
import { centrifugeDevice, CF_MODES } from "./centrifugeBind.mjs";
import * as D from "./devices.mjs";
import { checkMode } from "./knobGate.mjs";

let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);
const B = (mode, config = {}) => centrifugeDevice.build({ mode, config });

async function main() {
    console.log("[centrifugeDevice-selfcheck] sedimentation, graded on the trajectory rather than the step\n");

    // ---- 1. TWO RIGHT ANSWERS, AND CONFLATING THEM WOULD BREAK ONE OF THEM -------------------------------
    {
        const r = B("rate");
        say(`rate: continuous ${r.rateContinuous.toFixed(6)}, discrete-exact ${r.rateDiscreteExact.toFixed(6)}, recovered ${r.rateRecovered.toFixed(6)} (r2 ${r.logFitR2})`);
        ok("!! *** the trajectory reproduces THE DISCRETE MAP'S exact rate to machine precision ***",
            r.recoveredVsDiscrete < 1e-11 && r.logFitR2 > 0.999999999,
            `off by ${r.recoveredVsDiscrete.toExponential(2)}. Forward Euler turns dr/dt = k r into r_{n+1} = r_n(1 + k dt), whose exact growth rate ` +
            "is ln(1 + k dt)/dt and NOT k. THIS ASKS WHETHER THE STEPPER DOES WHAT IT SAYS");
        ok("...and it differs from the CONTINUOUS rate by a real, small amount, which is a different question",
            r.recoveredVsContinuous > 1e-6 && r.recoveredVsContinuous < 1e-2,
            `${r.recoveredVsContinuous.toExponential(2)} from k. A CHECK AGAINST k ALONE WOULD HAVE CALLED THE EXACT DISCRETE ANSWER AN ERROR; ` +
            "a check against ln(1+k dt)/dt alone would pass an integrator that converged on nothing. Both, or neither means anything");
    }

    // ---- 2. THE ORDER IS FORWARD EULER'S OWN CLAIM ------------------------------------------------------
    {
        const r = B("order");
        say(`order: ${r.orderMeasured.toFixed(6)} from error ratios ${r.errRatios.map((x) => x.toFixed(4)).join(", ")} over 4x refinements`);
        ok("!! *** quartering dt quarters the gap to the continuous rate -- FIRST ORDER, measured ***",
            Math.abs(r.orderMeasured - 1) < 0.02 && r.errRatios.every((x) => Math.abs(x - 4) < 0.2),
            `p = ${r.orderMeasured.toFixed(4)} against 1. This is what forward Euler claims, and NOTHING IN THE LAB HAD EVER CHECKED IT for this module`);
    }

    // ---- 3. A DOUBLING TIME THAT DOES NOT KNOW WHERE IT STARTED -----------------------------------------
    {
        const r = B("doubling");
        say(`doubling: ${r.doublingTimes.map((t) => t.toFixed(3)).join(" / ")} for r0 spanning 100x; theory ln2/k = ${r.doublingTheory.toFixed(4)}`);
        ok("!! *** exponential growth has a doubling time INDEPENDENT of r0, and that invariance IS what separating by s means ***",
            r.doublingSpread < 1e-9 && Math.abs(r.doublingTimes[0] - r.doublingTheory) / r.doublingTheory < 1e-3,
            `spread ${r.doublingSpread} across a hundredfold range of starting radius. A number that belongs to the FLUID AND THE PARTICLE, not to the geometry`);
    }

    // ---- 4. NEUTRAL BUOYANCY AS A BIFURCATION, RECOVERED FROM BEHAVIOUR ----------------------------------
    {
        const r = B("neutral");
        ok("!! the fluid density comes back by BISECTING ON WHICH WAY THE PARTICLE MOVES",
            r.neutralRelErr < 1e-12 && r.driftAtNeutral === 0,
            `recovered ${r.neutralDensityRecovered} against a configured ${r.neutralDensityConfigured}, and at neutral buoyancy the drift is EXACTLY ` +
            `${r.driftAtNeutral} -- an exact zero in a float, not a small number. Nothing in the bisection reads rhoF: THE SIGN OF ONE STEP IS THE ONLY ` +
            "INPUT, so the measuring route is independent of the setting route (v3201)");
    }

    // ---- 5. *** WHICH KEYS CATCH THE PLANT, AND WHY THE OTHERS CANNOT *** ---------------------------------
    {
        const rN = B("rate"), rP = B("rate", { planted: true });
        const oN = B("order"), oP = B("order", { planted: true });
        const dN = B("doubling"), dP = B("doubling", { planted: true });
        const nN = B("neutral"), nP = B("neutral", { planted: true });
        const bN = B("bands"), bP = B("bands", { planted: true });
        say(`PLANT: rate r2 ${rN.logFitR2} -> ${rP.logFitR2.toFixed(6)}; order ${oN.orderMeasured.toFixed(4)} -> ${oP.orderMeasured.toFixed(4)}; doubling spread ${dN.doublingSpread} -> ${dP.doublingSpread.toFixed(4)}`);
        ok("!! *** the log fit collapses: the planted motion is LINEAR, not exponential ***",
            rP.logFitR2 < 0.99 && rP.recoveredVsDiscrete > 0.1,
            `r2 falls from ${rN.logFitR2} to ${rP.logFitR2.toFixed(6)} over a decade of growth. Over a SHORT run the two curves are nearly the same, ` +
            "which is exactly why a single-step check cannot see it");
        ok("!! ...and the planted integrator converges on NOTHING, which is sharper than converging wrongly",
            Math.abs(oP.orderMeasured) < 0.05 && oP.errRatios.every((x) => Math.abs(x - 1) < 0.1),
            `order ${oP.orderMeasured.toFixed(4)} with error ratios ${oP.errRatios.map((x) => x.toFixed(4)).join(", ")} -- refining dt does not help, because the ` +
            "error is not a discretisation error at all. AN ORDER OF ZERO IS A DIFFERENT DIAGNOSIS FROM A WRONG ORDER");
        ok("!! ...and the doubling time stops belonging to the fluid and becomes proportional to r0",
            dP.doublingSpread > 0.9 && dP.doublingTimes[2] / dP.doublingTimes[0] > 50,
            `${dP.doublingTimes.map((t) => t.toFixed(3)).join(" / ")} for r0 spanning 100x -- a hundredfold spread. *** A CENTRIFUGE WHOSE DOUBLING TIME ` +
            "DEPENDS ON WHERE THE PARTICLE STARTED IS NOT SEPARATING BY SEDIMENTATION COEFFICIENT AT ALL ***");
        ok("!! *** AND TWO KEYS ARE BLIND, EACH FOR A REASON THAT CAN BE STATED ***",
            nP.neutralRelErr === nN.neutralRelErr && bP.bandOrderCorrect === true && bN.bandOrderCorrect === true,
            "the bifurcation is blind because the plant changes THE FIELD and not s, and s is zero at neutral buoyancy whatever the field does; " +
            "the band ORDER is blind because the plant scales every species by the same factor. *** SO EVERY SINGLE-STEP CHECK IN THE MODULE'S OWN " +
            "GATE PASSES ON THE PLANT -- which is the entire argument for grading the trajectory, made by measurement rather than by assertion ***");
    }

    // ---- 6. REGISTRY HYGIENE ----------------------------------------------------------------------------
    {
        const dev = await D.getDevice("centrifuge");
        ok("!! the registry BUILDS it, not merely lists it",
            !!dev && typeof dev.build === "function" && D.DEVICE_NAMES.includes("centrifuge"),
            "a name in DEVICE_NAMES the factory cannot build passes a set check and FAILS ON USE (v3330)");
        ok("!! every declared mode answers, and an undeclared one is REFUSED rather than substituted",
            CF_MODES.every((m) => !!dev.defaults({ mode: m })) && dev.defaults({ mode: "zzz_not_a_mode" }) === null &&
            checkMode(dev, "zzz_not_a_mode").ok === false,
            "ONE definition of the mode list (CF_MODES), for the reason five other binds needed one");
        ok("...and every observable the modes produce is declared by the device",
            CF_MODES.every((m) => Object.keys(B(m)).every((k) => centrifugeDevice.observables.includes(k))),
            "an observable a device produces but does not declare is invisible to claimTrace and to the lab-results baseline");
    }

    console.log(failed ? `\n[centrifugeDevice-selfcheck] ${failed} FAILED` : "\n[centrifugeDevice-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[centrifugeDevice-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
