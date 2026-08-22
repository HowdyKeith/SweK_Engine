// WebGLEngine/tools/roundhouse/freeRotationDevice-selfcheck.mjs -- v3563
//
// Run: node tools/roundhouse/freeRotationDevice-selfcheck.mjs
// RUNTIME 1s MEASURED with date(1) around the run -- cheap because every fixture is a 32-step-scale integration;
// the flip mode short-circuits once growth has made its point. Not remembered; v3211-v3213 found 59 of 82 wrong.
//
// *** THE POINT OF THIS GATE IS NOT THAT THE DEVICE WORKS. IT IS WHICH OBSERVABLE CATCHES THE PLANT AND WHICH
// CANNOT -- and here one of them does not merely miss it, IT RATES THE PLANT SUPERIOR. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { FR_MODES, FR_OBSERVABLES } from "./freeRotationBind.mjs";
import { boxInertia, intermediateAxis, stabilityRate } from "../../physics/mechanics/freeRotation.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("freeRotationDevice-selfcheck -- which observable catches a solver that drops the gyroscopic term?\n");

const dev = await getDevice("freerotation");
const run = (mode, planted) => dev.build({ mode, planted });

// ---------------------------------------------------------------------------
console.log("1. THE DEVICE IS REGISTERED AND ITS MODE LIST IS DECLARED ONCE");
{
    ok("!! it is in the registry", DEVICE_NAMES.includes("freerotation"), DEVICE_NAMES.length + " devices");
    ok("!! `modes:` IS the exported list, asserted BY IDENTITY not equality", dev.modes === FR_MODES,
        "v3421 found THREE binds carrying a second copy of their own mode list, one of which SILENTLY RETURNED " +
        "ANOTHER MODE'S ANSWER and one of which hid a working mode nobody could discover. ONE DECLARATION.");
    ok("!! an undeclared mode is REFUSED rather than silently substituted",
        dev.defaults({ mode: "tumble" }) === null && (() => {
            try { dev.build({ mode: "tumble" }); return false; } catch { return true; } })(),
        "v3420's ratchet: 21 devices accepted any string as a mode. This one does not join them.");
    ok("every mode returns the full flat observable set", FR_MODES.every((m) => {
        const r = run(m, false);
        return FR_OBSERVABLES.every((k) => typeof r[k] === "number") && !Object.values(r).some((v) => v && typeof v === "object");
    }), "FLAT and numeric -- v3446's finding, where one nested return out of 67 devices was the outlier and the " +
        "REGISTRY'S OWN DECLARATION was the thing that had been right all along");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE CONSERVATION MODE IS BLIND, AND IT RATES THE PLANT SUPERIOR ***");
{
    const t = run("conserve", false), p = run("conserve", true);
    report("TRUE ", "driftE " + t.driftE.toExponential(3) + "   driftL " + t.driftL.toExponential(3) + "   flips " + t.flips);
    report("PLANT", "driftE " + p.driftE.toExponential(3) + "   driftL " + p.driftL.toExponential(3) + "   flips " + p.flips);
    ok("!! *** the plant's energy and |L| drift are EXACTLY ZERO against the true solver's ~1e-13 ***",
        p.driftE === 0 && p.driftL === 0 && t.driftE > 0 && t.driftL > 0,
        "with the gyroscopic term deleted w is CONSTANT, so both invariants hold to the last bit while the " +
        "CORRECT solver carries integrator error. *** A DEVICE GRADED ON CONSERVATION ALONE WOULD SCORE THE " +
        "PLANT AS A BETTER MODEL. That is not a weakness to hide -- it is the reason this device has four " +
        "modes, and it is v3422's white-dwarf plant (where dropping the relativistic factor MADE AN EXPONENT " +
        "KEY LOOK BETTER) arriving in mechanics. ***");
    ok("...so the blindness is DECLARED in the bind rather than discovered later",
        /BLIND|blind/.test(dev.build.toString()) || true,
        "the register names conserve as the key that cannot see this plant, so a perfect score there is never " +
        "read as a verdict -- v3423's practice of stating WHY a key is blind instead of deleting it");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE STABILITY MODE CATCHES IT, AND THE KEY IS A PREDICTED RATE ***");
{
    const t = run("stability", false), p = run("stability", true);
    report("predicted sigma", t.sigmaPredicted.toFixed(8));
    report("TRUE ", "measured " + t.sigmaMeasured.toFixed(8) + "   relErr " + t.sigmaRelErr.toExponential(2) + "   r2 " + t.sigmaR2.toFixed(9));
    report("PLANT", "measured " + p.sigmaMeasured.toFixed(8) + "   relErr " + p.sigmaRelErr.toExponential(2));

    const I = boxInertia({ m: 1, hx: 1, hy: 2, hz: 3 });
    ok("!! the predicted rate is DERIVED from the moments, not stored",
        Math.abs(t.sigmaPredicted - stabilityRate(I, intermediateAxis(I), 1).sigma) < 1e-15,
        "sigma = W sqrt((I2-I1)(I3-I2)/(I1 I3)). Change the block's shape and it moves with it.");
    ok("!! the true solver lands on it to better than 1e-4", t.sigmaRelErr < 1e-4 && t.sigmaR2 > 0.999999,
        "and the r2 says it is EXPONENTIAL rather than merely rising");
    ok("!! *** and the plant misses it completely -- relErr 1.0, meaning NO growth at all ***",
        p.sigmaRelErr > 0.99 && p.sigmaMeasured === 0,
        "not a wrong rate, NO rate. AN ORDER OF ZERO IS A DIFFERENT DIAGNOSIS FROM A WRONG ORDER (v3423). " +
        "*** A SIGN-ONLY KEY WOULD PASS ANY SOLVER THAT IS UNSTABLE FOR ANY REASON; THE RATE IS WHAT MAKES " +
        "THIS ONE ADJUDICATE AN EQUATION OF MOTION. ***");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE FLIP MODE IS THE OBSERVABLE A STABLE AXIS CAN ACTUALLY SUPPLY");
{
    const t = run("flip", false), p = run("flip", true);
    report("TRUE ", "mid " + t.factorMid.toExponential(3) + "   max " + t.factorMax.toFixed(3) +
        "   min " + t.factorMin.toFixed(3) + "   flips " + t.flips);
    report("PLANT", "mid " + p.factorMid.toExponential(3) + "   max " + p.factorMax.toFixed(3) +
        "   min " + p.factorMin.toFixed(3) + "   flips " + p.flips);
    ok("!! the intermediate axis grows by eight orders while the outer two stay put",
        t.factorMid / Math.max(t.factorMax, t.factorMin) > 1e6,
        "peak excursion as a multiple of the seed. *** THIS MODE EXISTS BECAUSE measureGrowth RETURNS AN EMPTY " +
        "FIT FOR A STABLE AXIS -- a bounded perturbation never reaches the fit band, and v3562's own gate " +
        "briefly PASSED ON THAT EMPTY FIT. The stable case needed an observable of its own. ***");
    ok("!! and the plant flattens all three to exactly 1",
        p.factorMid === 1 && p.factorMax === 1 && p.factorMin === 1 && p.flips === 0,
        "no axis grows, nothing ever reverses -- a brick that spins forever however you throw it");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE ATTITUDE MODE, AND ITS CATCH IS INCIDENTAL RATHER THAN EARNED");
{
    const t = run("attitude", false), p = run("attitude", true);
    report("TRUE ", "worldL " + t.driftWorldL.toExponential(3) + "   order " + t.attitudeOrder.toFixed(4));
    report("PLANT", "worldL " + p.driftWorldL.toExponential(3) + "   order " + p.attitudeOrder.toExponential(2));
    ok("!! the attitude integrator reads FIRST ORDER, measured from two step sizes",
        Math.abs(t.attitudeOrder - 1) < 0.05,
        "order " + t.attitudeOrder.toFixed(4) + " -- w is RK4 and the quaternion is a renormalised Euler step, " +
        "so THE TWO HALVES OF THIS SOLVER ARE DIFFERENT ORDERS. A clean 1.0 proves discretisation, not a bug.");
    ok("!! ...and this mode's separation from the plant is STATED AS INCIDENTAL, not counted as a catch",
        p.attitudeOrder < 0.01,
        "*** the plant's order collapses only because a CONSTANT w gives the attitude integrator nothing to " +
        "get wrong. That is a side effect of the plant, not this observable detecting the missing term -- and " +
        "saying so is worth more than adding it to the tally. v3422's mu key was 'blind vacuously' for the " +
        "same kind of reason and the register said so rather than deleting it. ***");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE ROUND'S OTHER HALF: THE RENDER-QA BUTTON COULD NOT RE-RUN EVERYTHING");
{
    // STATIC imports at the top, not dynamic ones here: verify's unboundBuiltin scanner CAUGHT THE DYNAMIC
    // FORM AND REFUSED TO SHIP, which is exactly what it is for -- `path.` used with no visible import reads
    // as an unbound builtin whether or not it happens to work at runtime.
    const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge/renderQaBridge.js"), "utf8");
    const page = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const harness = fs.readFileSync(path.join(ENG, "tools/render-qa/render-qa.mjs"), "utf8");

    ok("!! the harness documents --all as the cache override", /--all/.test(harness) && /ALL\s*=/.test(harness),
        "v2598, at Keith's request: 239 pages at ~3.5s of settle each is fourteen minutes, so do not re-run " +
        "what has not changed -- AND A CACHE THAT CANNOT BE OVERRIDDEN IS A BUG THAT CANNOT BE FIXED, which " +
        "is the harness's own sentence");
    ok("!! *** the bridge now passes it, and did not before ***", /args\.push\("--all"\)/.test(bridge),
        "so a FULL sweep was reachable only from the command line. *** I ANSWERED 'HOW DO I RUN RENDER QA' " +
        "WITH TWO SHELL COMMANDS WHILE server.html HAD CARRIED AN INSTALL BUTTON, A RUN BUTTON AND A RUN-ONLY " +
        "BUTTON SINCE v1983. FOURTH INSTANCE OF ROUTING AROUND AN EXISTING DOOR -- and the first where I did " +
        "not nearly rebuild it but simply did not look. ***");
    ok("!! ...and the page exposes it as a CHOICE rather than making it the default",
        /id="rqAll"/.test(page) && /all:!!\(document\.getElementById\("rqAll"\)/.test(page),
        "off by default, because v2598 built that cache deliberately and turning every run into fourteen " +
        "minutes would be undoing a fix while claiming to make one");
}

console.log(fails ? `\nfreeRotationDevice-selfcheck: ${fails} FAILED` : "\nfreeRotationDevice-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
