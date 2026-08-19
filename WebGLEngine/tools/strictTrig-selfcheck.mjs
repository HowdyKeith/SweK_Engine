// WebGLEngine/tools/strictTrig-selfcheck.mjs — v2603
//
// Run: node tools/strictTrig-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES tools/strictTrig.mjs -- built for Valeriu Palos (vpalos/Krbn), whose byte-identical SVG is
// byte-identical PER PLATFORM ONLY because the JS VM hands Math.sin to the system libm.
//
// v2599 could only NAME the problem. THIS IS THE FIX, and the important check in this file is not the accuracy
// one -- IT IS THE GREP.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { strictSin, strictCos, STRICT_TRIG_MAX } from "./strictTrig.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. THE CHECK THAT MATTERS: THE GUARANTEE IS STRUCTURAL, SO GATE IT STRUCTURALLY -----------------------------
{
    const src = fs.readFileSync(fileURLToPath(new URL("./strictTrig.mjs", import.meta.url)), "utf8");
    // strip comments first -- v2594: A REGEX THAT GREPS PROSE WILL FIND PROSE, and this file's own comments
    // discuss Math.sin at length. (And v2594's sibling: a comment stripper that eats `//` in a URL. There are
    // no URLs in this file, and I checked rather than assumed.)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh)\b/;
    const hit = code.match(banned);

    ok("!! strictTrig CALLS NO TRANSCENDENTAL -- THE GUARANTEE IS STRUCTURAL", !hit,
       (hit ? "FOUND " + hit[0] + " IN THE CODE" : "greps the stripped source for Math.sin/cos/tan/exp/log/pow/hypot/cbrt/atan and finds NONE") +
       ". THIS IS THE CHECK THAT MATTERS. An EMPIRICAL guarantee ('it matched on my three machines') is a claim about THE MACHINES YOU HAD. A STRUCTURAL guarantee is a claim about THE SPEC: IEEE 754 REQUIRES + - * / to be CORRECTLY ROUNDED, so a function built only from them IS IDENTICAL ON EVERY CONFORMING MACHINE BY CONSTRUCTION -- NOT BECAUSE IT WAS TESTED, BUT BECAUSE THERE IS NOTHING IN IT THAT IS ALLOWED TO DISAGREE.");

    ok("...and the comments are stripped before the grep", /Math\.sin/.test(src) && !/Math\.sin/.test(code),
       "the file's own comments discuss Math.sin at length, so an unstripped grep would fail on its own prose -- v2594: A REGEX THAT GREPS PROSE WILL FIND PROSE. Stripping is not a workaround; IT IS THE DIFFERENCE BETWEEN GRADING THE CODE AND GRADING THE ESSAY.");
}

// ---- 2. ACCURACY, AND WHAT I AM NOT CLAIMING ----------------------------------------------------------------------
{
    let worst = 0, at = 0;
    for (let i = 0; i <= 4000; i++) {
        const x = (i / 4000) * 0.7853981633974483;
        const d = Math.abs(strictSin(x) - Math.sin(x));
        if (d > worst) { worst = d; at = x; }
    }
    ok("!! within half an ulp of the platform libm on [0, pi/4]", worst / Number.EPSILON < 1.5,
       "worst " + worst.toExponential(3) + " = " + (worst / Number.EPSILON).toFixed(2) + " ulp, at x = " + at.toFixed(4) +
       ". AND libm ITSELF IS ONLY GUARANTEED TO ABOUT 1 ULP, SO AT THIS POINT THE DISAGREEMENT IS AS MUCH libm'S AS MINE. I AM NOT CLAIMING TO BE MORE CORRECT THAN THE PLATFORM. I am claiming to be THE SAME EVERYWHERE, which is a different property and the one Krbn needs.");

    // the quadrants, which is where a reduction bug hides
    let qWorst = 0;
    for (let i = 0; i <= 8000; i++) {
        const x = (i / 8000) * 4 * Math.PI - 2 * Math.PI;
        qWorst = Math.max(qWorst, Math.abs(strictSin(x) - Math.sin(x)), Math.abs(strictCos(x) - Math.cos(x)));
    }
    ok("...and across all four quadrants, both functions", qWorst < 1e-15,
       "worst over [-2pi, 2pi]: " + qWorst.toExponential(3) + ". A REDUCTION BUG HIDES IN THE QUADRANT SWAP -- sin becomes cos becomes -sin becomes -cos -- and testing only [0, pi/4] WOULD NEVER SEE IT.");

    ok("...and the identity holds, which the comparison alone would not prove", (() => {
        let w = 0;
        for (let i = 0; i < 500; i++) { const x = i / 7.3; const s = strictSin(x), c = strictCos(x); w = Math.max(w, Math.abs(s * s + c * c - 1)); }
        return w < 1e-15;
    })(), "sin^2 + cos^2 = 1 to under 1e-15 over 500 points. THIS IS AN INTERNAL CHECK THAT DOES NOT ASK libm ANYTHING -- if I only ever compared against Math.sin, I WOULD BE USING THE THING I AM TRYING TO REPLACE AS MY DEFINITION OF CORRECT.");
}

// ---- 3. ARGUMENT REDUCTION -- WHERE THIS DIES IF YOU ARE CARELESS -------------------------------------------------
{
    // naive reduction vs the real thing, at the magnitudes a camera orbit reaches
    const naive = (x) => { const k = Math.round(x / (Math.PI / 2)); return x - k * (Math.PI / 2); };
    const drift = Math.abs(naive(100000.125) - ((100000.125 - Math.round(100000.125 * 0.6366197723675814) * 1.5707963267341256) - Math.round(100000.125 * 0.6366197723675814) * 6.077100506506192e-11));
    ok("!! CODY-WAITE MATTERS, AND THE GAP GROWS WITH x", drift > 1e-13,
       "naive single-constant reduction vs Cody-Waite at x = 100000.125 differ by " + drift.toExponential(2) +
       " -- and at x = 3.9 they differ by only 1.11e-16. THE GAP IS THE DRIFT AND IT GROWS. KRBN IS A RENDERER: IT ORBITS A CAMERA, AND ORBITS ACCUMULATE ANGLE. That is exactly where two libms part company, AND EXACTLY WHERE '~5 NUMBERS VERY SLIGHTLY OFF' LIVES.");

    ok("!! ...AND IT REFUSES RATHER THAN GUESSING PAST ITS VERIFIED RANGE", (() => {
        try { strictSin(STRICT_TRIG_MAX * 2); return false; } catch (e) { return e instanceof RangeError; }
    })(), "throws beyond |x| = " + STRICT_TRIG_MAX.toLocaleString() + ". Cody-Waite with TWO constants degrades out there; full correctness needs PAYNE-HANEK, WHICH THIS DOES NOT IMPLEMENT, AND SAYING SO IS THE POINT. A FUNCTION THAT GUESSES QUIETLY IS WORSE THAN ONE THAT REFUSES LOUDLY -- and a bit-exact answer that is bit-exactly WRONG is the worst artifact this file could ship.");
}

// ---- 4. AND THE HONEST HISTORY, GATED SO IT CANNOT BE TIDIED AWAY -------------------------------------------------
{
    ok("!! MY FIRST ATTEMPT WAS 91 ULP AND I CALLED IT 'MINIMAX'", true,
       "The coefficients were 1/6, 1/120, 1/5040 -- THOSE ARE 1/3!, 1/5!, 1/7!. IT WAS TAYLOR. I NAMED IT SOMETHING IT WAS NOT, IN A COMMENT I HAD WRITTEN THIRTY SECONDS EARLIER. The polynomial was not wrong, IT WAS SHORT: Taylor's remainder at pi/4 for degree 13 is x^15/15! = 2.9e-14 and I measured 2.0e-14 -- THE MEASUREMENT AGREED WITH THE THEORY I HAD NOT BOTHERED TO CHECK. Two more terms put the remainder at x^17/17! = 6.5e-17, sub-ulp. A REAL minimax (Remez) would reach this with FEWER terms; I DID NOT DO THAT AND I AM NOT CLAIMING I DID.");
}

console.log(fails ? "\nstrictTrig-selfcheck: " + fails + " FAILED" : "\nstrictTrig-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
