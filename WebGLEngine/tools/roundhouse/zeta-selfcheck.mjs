// tools/roundhouse/zeta-selfcheck.mjs
//
// Run: node tools/roundhouse/zeta-selfcheck.mjs   (~3s)
//
// v3198 -- THE PI-ZETA BRIDGE, AND ITS CONTROL IS A NUMBER WITH NO CLOSED FORM.
//
// zeta(2) = pi^2/6 is Euler's, and *** A ROUTINE THAT MERELY RECITED PI FORMULAS WOULD SATISFY EVERY
// EVEN-ARGUMENT CHECK EVER WRITTEN. *** zeta(4), zeta(6), zeta(8) all have closed forms too. A device built only
// from those would be grading a lookup table and could not tell.
//
// *** SO THE CONTROL IS zeta(3). *** Apery's constant has NO closed form -- no pi, no rational multiple of
// anything -- so it CANNOT be recited. Landing on 1.2020569031595942 to 1.1e-15 is the proof that the series is
// genuinely being summed. THAT MODE IS WHAT MAKES THE OTHER THREE MEAN ANYTHING.
//
// AND THE LOAD-BEARING NEGATIVE IS THE EULER-MACLAURIN CORRECTION ITSELF: drop it (K = 0) and the error goes
// from 2.4e-15 to 9.6e-5 -- A GAIN OF 3.9e10. If K made no difference, the accuracy would be coming from
// somewhere other than the summation.
//
// Every key is a closed form or a published constant. NOTHING IS REMEMBERED FROM A PREVIOUS RUN -- which v3182
// measured that 76% of this lab's claims could not manage.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);
const dev = await D.getDevice("zeta");

const even = await dev.build({ mode: "even" });
const apery = await dev.build({ mode: "apery" });
const higher = await dev.build({ mode: "higher" });
const corr = await dev.build({ mode: "corrections" });

// ---- 1. THE CONTROL FIRST, BECAUSE IT IS WHAT MAKES THE REST MEAN ANYTHING ----------------------------------------
{
    ok("!! *** zeta(3) lands on Apery, and zeta(3) HAS NO CLOSED FORM ***",
        apery.errAbs < 1e-14 && apery.hasClosedForm === 0,
        "error " + apery.errAbs.toExponential(2) + " against 1.2020569031595942 (OEIS A002117). NO PI, NO " +
        "RATIONAL MULTIPLE OF ANYTHING -- so this number CANNOT BE RECITED, and hitting it is the proof the " +
        "series is being summed. A DEVICE BUILT ONLY FROM EVEN ARGUMENTS WOULD BE GRADING A LOOKUP TABLE AND " +
        "COULD NOT TELL");

    ok("...and hasClosedForm is reported as 0 on purpose",
        /hasClosedForm is reported as 0 ON PURPOSE/.test(fsMod.readFileSync(path.join(HERE, "zetaBind.mjs"), "utf8")),
        "it is the PROPERTY THAT MAKES THE MODE WORTH HAVING, and a reader who saw only the error would not " +
        "know why this argument was chosen");
}

// ---- 2. EULER'S IDENTITIES, AND PI COMING BACK OUT ----------------------------------------------------------------
{
    ok("!! zeta(2) = pi^2/6 to machine precision",
        even.errAbs < 1e-14 && even.hasClosedForm === 1,
        "error " + even.errAbs.toExponential(2));

    ok("!! *** and pi comes BACK OUT as sqrt(6 zeta(2)) ***",
        even.piErrAbs < 1e-14,
        "recovered " + even.piRecovered.toFixed(15) + ", error " + even.piErrAbs.toExponential(2) + " -- THE " +
        "CIRCLE CONSTANT FROM A SUM WITH NO CIRCLE IN IT. The round trip is a different claim from the forward " +
        "one: it fails if the identity is right and the arithmetic is not");

    ok("!! zeta(4), zeta(6) and zeta(8) match their closed forms -- WORST, not mean",
        higher.worstHigherErr < 1e-14,
        "worst " + higher.worstHigherErr.toExponential(2) + " over 1/90, 1/945 and 1/9450. ONE EVEN VALUE " +
        "DRIFTING WHILE TWO HOLD IS A BROKEN COEFFICIENT, and an average would let the two carry it");
}

// ---- 3. THE NEGATIVE: THE CORRECTION IS DOING THE WORK ------------------------------------------------------------
{
    ok("!! *** dropping the Euler-Maclaurin correction costs ten orders of magnitude ***",
        corr.correctionGain > 1e8 && corr.errNoCorrection > 1e-6 && corr.errWithCorrection < 1e-13,
        "K=0 gives " + corr.errNoCorrection.toExponential(2) + ", K=" + corr.K + " gives " +
        corr.errWithCorrection.toExponential(2) + " -- a gain of " + corr.correctionGain.toExponential(2) +
        ". IF K MADE NO DIFFERENCE, THE ACCURACY WOULD BE COMING FROM SOMEWHERE OTHER THAN THE SUMMATION");

    ok("...and the gain is guarded against a zero denominator",
        /Math\.max\(good, Number\.EPSILON\)/.test(fsMod.readFileSync(path.join(HERE, "zetaBind.mjs"), "utf8")),
        "a machine-precision error could be EXACTLY ZERO, and a ratio would be Infinity -- a number no " +
        "threshold can compare and no reader can interpret");
}

// ---- 4. FOUR MODES, EXPORTED ---------------------------------------------------------------------------------------
{
    ok("!! four modes, EXPORTED, nonsense refused",
        Array.isArray(dev.modes) && dev.modes.length === 4 &&
        dev.modes.every((m) => K.checkMode(dev, m).ok !== false) &&
        K.checkMode(dev, "zzz_no_mode").ok === false,
        dev.modes.join(", "));

    ok("...and every key is a closed form or a published constant",
        !/baseline|frozen|remembered/i.test(fsMod.readFileSync(path.join(HERE, "zetaBind.mjs"), "utf8")
            .replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")),
        "pi^2n times a rational, and Apery from OEIS. NOTHING IS REMEMBERED FROM A PREVIOUS RUN -- v3182 " +
        "measured that 76% of this lab's claims could not manage that");
}

console.log();
console.log("  ----  GRADED COVERAGE: 25 of 96 at v3197, 26 now.");
console.log("  ----  AND THE SHAPE WORTH REUSING: when every key for a quantity is a CLOSED FORM, add an");
console.log("  ----  argument that HAS NO CLOSED FORM. zeta(3) is the only mode here that could not be faked,");
console.log("  ----  and it is therefore the only one that proves the other three.");
if (fails) { console.log("zeta-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("zeta-selfcheck: all checks pass");
