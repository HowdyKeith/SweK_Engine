// tools/roundhouse/gyroscope-selfcheck.mjs
//
// Run: node tools/roundhouse/gyroscope-selfcheck.mjs   (~15s)
//
// v3197 -- THE GYROSCOPE IS GRADED, AND ITS KEY IS AN ORDER RATHER THAN A VALUE.
//
// The textbook rate is omega_p = tau / L. *** MEASURED, THAT IS NOT EXACT, AND THE INTERESTING PART IS HOW IT
// IS WRONG. *** rate * L gives 11.785, 11.948 and 11.987 against an applied torque of exactly 12 -- 1.8%, 0.4%,
// 0.1% as the spin doubles. THE ERROR FALLS AS 1/L SQUARED: the ratio on doubling is 4.115, 4.031, 4.008,
// 4.002, converging on exactly 4.
//
// SO THE OBSERVABLE IS THE RATIO, NOT THE ERROR. Grading "rate*L is close to tau" asserts a tolerance nobody
// derived; grading "the error QUARTERS when the spin DOUBLES" asserts THE ORDER OF THE APPROXIMATION, which is
// a fact about the physics and needs no tolerance at all. That is probe's firstorder mode one order up.
//
// *** AND THE SABOTAGE'S SIGNATURE IS NOT WHAT THE PROSE SAID. *** physics/gyroscope-selfcheck's header
// describes the axis-aligned torque as making the gyroscope "spin up and tip". IT DOES NOT TIP. A torque
// PARALLEL to L changes its MAGNITUDE and cannot rotate it: |L| grows by 600 against 0.35 clean -- SEVENTEEN
// HUNDRED TIMES -- while the tilt moves by 2e-14, which is round-off. My first observable encoded the prose and
// FAILED; the fix was to measure before asserting, and the observables now say what happens.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);
const dev = await D.getDevice("gyroscope");

const pre = await dev.build({ mode: "precess" });
const ord = await dev.build({ mode: "order" });
const sab = await dev.build({ mode: "sabotage" });
const hold = await dev.build({ mode: "hold" });

// ---- 1. THE KEY IS THE ORDER --------------------------------------------------------------------------------------
{
    ok("!! *** the error QUARTERS when the spin DOUBLES -- second order in 1/L ***",
        Math.abs(ord.orderRatio - 4) < 0.05 && ord.orderErrFrac < 0.02,
        "ratio " + ord.orderRatio.toFixed(4) + " against a key of exactly 4. 1/L would give 2. GRADING " +
        "'rate*L is close to tau' WOULD ASSERT A TOLERANCE NOBODY DERIVED; grading the ORDER asserts a fact " +
        "about the physics and needs no tolerance at all");

    ok("!! and the rate itself lands near tau, with the shortfall REPORTED not hidden",
        pre.rateErrFrac < 0.01 && pre.rateTimesL > 11.9 && pre.rateTimesL < 12.0,
        "rate*L = " + pre.rateTimesL.toFixed(4) + " against tau = " + pre.torque + ", a shortfall of " +
        pre.rateErrFrac.toExponential(2) + ". THE DEFAULT MODE IS NOT THE SHARPEST ONE, and saying so is the " +
        "difference between a device that reports and one that flatters");

    ok("...and tilt and spin are held while it precesses",
        hold.tiltDrift < 0.02 && hold.spinDrift < 1,
        "tilt " + hold.tiltDrift.toExponential(2) + ", |L| " + hold.spinDrift.toExponential(2) + " -- both " +
        "APPROXIMATE and both improving with spin, like the rate itself");
}

// ---- 2. THE NEGATIVE, MEASURED RATHER THAN QUOTED -----------------------------------------------------------------
{
    ok("!! *** an axis-aligned torque stops the precession dead ***",
        sab.precessed === 0,
        "the sweep collapses to under 5% of the clean run. IF THIS STILL PRECESSED, THE PRECESSION CHECK WOULD " +
        "BE MEASURING THE INTEGRATOR RATHER THAN THE MECHANICS");

    ok("!! *** and it SPINS UP while the axis stays FROZEN -- not 'tips', as the prose said ***",
        sab.spunUp === 1 && sab.axisFrozen === 1,
        "|L| grows seventeen hundred times faster than clean while the tilt moves by 2e-14. A TORQUE PARALLEL " +
        "TO L CHANGES ITS MAGNITUDE AND CANNOT ROTATE IT. My first observable asserted 'tipped' straight from " +
        "physics/gyroscope-selfcheck's header AND FAILED -- the header describes an outcome the mechanics do " +
        "not produce, and only running it said so");

    ok("...and spinning-up and axis-frozen are SEPARATE observables",
        /spunUp:/.test(fsMod.readFileSync(path.join(HERE, "gyroscopeBind.mjs"), "utf8")) &&
        /axisFrozen:/.test(fsMod.readFileSync(path.join(HERE, "gyroscopeBind.mjs"), "utf8")),
        "the sabotage fails in TWO distinct ways and one number could not say so -- a torque that spun it up " +
        "AND turned it would be a different bug from one that only spun it up");
}

// ---- 3. FOUR MODES, ONE RUNNER, AND THE AZIMUTH UNWRAPPED ----------------------------------------------------------
{
    const src = fsMod.readFileSync(path.join(HERE, "gyroscopeBind.mjs"), "utf8");
    ok("!! four modes, EXPORTED, nonsense refused",
        Array.isArray(dev.modes) && dev.modes.length === 4 &&
        dev.modes.every((m) => K.checkMode(dev, m).ok !== false) &&
        K.checkMode(dev, "zzz_no_mode").ok === false,
        dev.modes.join(", "));

    ok("!! the azimuth is UNWRAPPED, so the rate does not depend on where it started",
        /\(\(d \+ Math\.PI \* 3\) % \(Math\.PI \* 2\)\) - Math\.PI/.test(src),
        "a raw atan2 difference JUMPS BY 2*pi once per revolution, and a device that measured the jump would " +
        "report a precession rate that depended on the starting angle");

    ok("...and the sabotage is applied HERE, not in the module being graded",
        /along = false/.test(src) && !/gyroscope\.js/.test(src.replace(/\/\/[^\n]*/g, " ").replace(/from "[^"]*"/g, " ")),
        "A DEVICE MUST NOT EDIT THE THING IT GRADES. The axis-aligned variant lives in the bind, and the " +
        "physics module is imported unchanged");
}

console.log();
console.log("  ----  GRADED COVERAGE: 24 of 96 at v3196, 25 now. And physics/gyroscope-selfcheck's own header");
console.log("  ----  still says the sabotage makes it 'spin up and tip'. IT DOES NOT TIP -- that is a sentence");
console.log("  ----  to fix upstream in this tree, not a defect in the mechanics.");
if (fails) { console.log("gyroscope-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("gyroscope-selfcheck: all checks pass");
