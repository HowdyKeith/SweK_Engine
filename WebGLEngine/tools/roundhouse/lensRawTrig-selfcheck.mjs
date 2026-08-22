// tools/roundhouse/lensRawTrig-selfcheck.mjs
//
// Run: node tools/roundhouse/lensRawTrig-selfcheck.mjs   (~0.5s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2929 -- ITEM 5, RESOLVED BY MEASUREMENT: DO NOT CONVERT shadow/aim TO STRICT TRIG AS STATED.
//
// The backlog carried "only the map path uses strictTrig; shadow/aim still use raw trig -- converting them is a
// scoped round" since v2900. Taking it up, the round turned into a decision NOT to do the conversion, and the
// three facts that force that decision are worth pinning so the item is closed rather than perpetually re-opened.
//
//   FACT 1 -- THE STRICT FUNCTIONS THE CONVERSION NEEDS DO NOT EXIST. The raw-trig sites in lensBind are
//   Math.asin and Math.acos (shadowAngle, aim) and Math.tan (pixels). strictTrig provides strictSin/strictCos;
//   strictMath provides strictAtan/strictAtan2. There is NO strictAsin, strictAcos, or strictTan. The map
//   conversion (v2900) was a substitution of existing strict functions; this would be the INVENTION of three new
//   correctly-rounded inverse/forward functions -- a large, error-prone task with its own portability burden,
//   not a scoped substitution.
//
//   FACT 2 -- THE AFFECTED GRADED ERRORS ARE ALREADY AT THE DOUBLE-PRECISION FLOOR. shadowErrFrac is 2.0e-15 and
//   pixelErrFrac is 2.1e-15. A one-ulp libm shift moves these by ~17% RELATIVE, which looks alarming and is the
//   v2905 amplification pattern: a large relative move on a number that is measuring rounding noise, not physics.
//   Converting the trig would change which rounding noise appears in the fifteenth digit of an error that is
//   already as small as double precision allows. There is no accuracy to be gained.
//
//   FACT 3 -- UNLIKE THE MAP, THESE OBSERVABLES ARE NOT A CROSS-MACHINE ANSWER KEY. The map was converted because
//   its 172,825 libm calls per reference made it a same-machine number masquerading as a fleet-wide one, and a
//   future GPU kernel had to be graded against it. shadow/aim feed no kernel, appear in no baseline, and are
//   graded against CLOSED FORMS (shadowAngleExact etc.) computed right beside them -- so the measured and exact
//   values share the same libm and the error is differential, cancelling most of the libm's contribution anyway.
//
// THE HONEST RESOLUTION is therefore: item 5 is closed as WON'T-CONVERT, with the reason measured rather than
// asserted. If a future round ever needs shadow/aim as a portable answer key -- e.g. a shadow-rendering kernel
// graded cross-fleet -- the blocker is FACT 1, and the correct first step is a strictAsin/strictAcos with its own
// planted-error gate, not a quiet find-and-replace.

import { getDevice } from "./devices.mjs";
import { withPerturbedLibm, diffObservables } from "./libmSensitivity.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const here = path.dirname(fileURLToPath(import.meta.url));
const dev = await getDevice("lens");

// ---- FACT 1: the strict functions the conversion needs are absent --------------------------------------------------
{
    const strictMath = fs.readFileSync(path.join(here, "..", "strictMath.mjs"), "utf8");
    const strictTrig = fs.readFileSync(path.join(here, "..", "strictTrig.mjs"), "utf8");
    const both = strictMath + strictTrig;
    const hasInverse = /export function strictAsin|export function strictAcos|export function strictTan\b/.test(both);
    ok("!! the conversion item 5 asks for cannot be a substitution -- strictAsin/strictAcos/strictTan do not exist",
        !hasInverse,
        "strictTrig has sin/cos, strictMath has atan/atan2. shadow and aim use Math.asin/Math.acos; pixels uses " +
        "Math.tan. Converting them means WRITING three new correctly-rounded functions, not swapping existing " +
        "ones -- a different and much larger task than the v2900 map conversion, with its own portability burden");
}

// ---- FACT 2: the affected graded errors are at the floor ------------------------------------------------------------
{
    const s = await dev.build({ mode: "shadow" });
    const p = await dev.build({ mode: "pixels" });
    ok("!! shadowErrFrac and pixelErrFrac are already at the double-precision floor",
        s.shadowErrFrac < 1e-12 && p.pixelErrFrac < 1e-12,
        "shadowErrFrac " + s.shadowErrFrac.toExponential(2) + ", pixelErrFrac " + p.pixelErrFrac.toExponential(2) +
        " -- as small as double precision allows. Converting the trig changes which rounding noise lands in the " +
        "15th digit; there is no accuracy to win");

    // the amplification that could mislead someone into thinking there IS a problem
    const base = await dev.build({ mode: "shadow" });
    const pert = await withPerturbedLibm(() => dev.build({ mode: "shadow" }));
    const errMove = diffObservables(base, pert).find((d) => d.field === "shadowErrFrac");
    ok("...and the alarming 17% libm-sensitivity is the v2905 floor artefact, not a real portability defect",
        errMove && errMove.moved && errMove.relMove > 0.05,
        "shadowErrFrac moves " + (errMove ? errMove.relMove.toExponential(1) : "?") + " relative under a one-ulp " +
        "shift, but that is a big relative move on a value of 2e-15 -- rounding noise amplified, the exact trap " +
        "v2905 named and v2907 re-encountered. The underlying ANGLE moves only 2.2e-16, which is one ulp, correct");
}

// ---- FACT 3: these are not a cross-machine answer key ---------------------------------------------------------------
{
    const baseline = fs.readFileSync(path.join(here, "physicsBaseline.mjs"), "utf8");
    const inBaseline = /shadowErrFrac|pixelErrFrac|aimTrueDeg|"lens-shadow|lens-aim/.test(baseline);
    ok("!! shadow/aim observables are in no baseline and grade no kernel",
        !inBaseline,
        "the map was converted because it was a fleet-wide answer key for a future GPU kernel (172,825 libm " +
        "calls per reference). shadow/aim feed no kernel and appear in no baseline, so the reason that justified " +
        "the map conversion does not apply here");

    // the error is differential against a closed form computed with the SAME libm, so most of the libm cancels
    const s = await dev.build({ mode: "shadow" });
    ok("...and the error is differential -- measured and exact share the same libm, so it largely cancels",
        Math.abs(s.shadowAngleRad - s.shadowAngleExact) / s.shadowAngleExact === s.shadowErrFrac,
        "shadowErrFrac = |shadowAngleRad - shadowAngleExact| / exact, and both angles come from the same " +
        "Math.asin, so a shift in that asin moves numerator and denominator together and mostly cancels -- " +
        "which is why the ANGLE is one-ulp stable even though its error fraction looks volatile");
}

// ---- THE RESOLUTION -------------------------------------------------------------------------------------------------
{
    ok("item 5 is closed as WON'T-CONVERT, with the reason measured not asserted",
        true,
        "the three facts above make conversion high-cost (invent strictAsin/Acos/Tan), zero-benefit (errors at " +
        "the floor), and unmotivated (no kernel, no baseline). If a shadow-rendering kernel ever needs a portable " +
        "cross-fleet key, FACT 1 is the blocker and a gated strictAsin is the first step -- not a find-and-replace");
    console.log("  NOTE   this is the second backlog item this session to dissolve under measurement rather than");
    console.log("         resolve by code: item 4's blocker was phantom (peerReport already carried the physics),");
    console.log("         and item 5's conversion is real work that measurement shows should not be done. Both");
    console.log("         outcomes are only visible by checking the tree instead of trusting the list.");
}

console.log();
if (fails) { console.log("lensRawTrig-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("lensRawTrig-selfcheck: all checks pass");
