// WebGLEngine/tools/mathProbe-selfcheck.mjs — v2599
//
// Run: node tools/mathProbe-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES tools/mathProbe.mjs -- the probe built for Valeriu Palos (vpalos/Krbn), who found that Krbn's
// byte-identical SVG is byte-identical PER PLATFORM ONLY, and diagnosed it as the JS VM's underlying
// Math.sin/log2/hypot varying between systems.
//
// HE IS RIGHT ABOUT THE FACT. THE DIAGNOSIS IS SHARPER THAN "PLATFORM": IT IS THE FUNCTION.
import { probe, bits } from "./mathProbe.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. THE CLAIM I CAN ACTUALLY MAKE FROM ONE MACHINE -----------------------------------------------------------
//
// IEEE 754-2008 REQUIRES + - * / and sqrt to be CORRECTLY ROUNDED. Not "accurate to 1 ulp" -- CORRECTLY
// ROUNDED, meaning there is exactly one right answer and every conforming implementation must produce it.
//
// SO THESE BITS ARE NOT AN OBSERVATION ABOUT THIS MACHINE. THEY ARE A PREDICTION ABOUT EVERY MACHINE, and I
// can hard-code them from one box and have them mean something on Keith's other three. THAT IS THE WHOLE
// DIFFERENCE BETWEEN A SPECIFIED OPERATION AND A RECOMMENDED ONE.
{
    ok("0.1 + 0.2 is 3fd3333333333334 on EVERY conforming machine", bits(0.1 + 0.2) === "3fd3333333333334",
       "got " + bits(0.1 + 0.2) + ". IEEE 754 REQUIRES addition to be CORRECTLY ROUNDED -- there is exactly ONE right answer and no freedom. This is not an observation about this box; IT IS A PREDICTION ABOUT EVERY BOX.");
    ok("sqrt(2) is 3ff6a09e667f3bcd on EVERY conforming machine", bits(Math.sqrt(2)) === "3ff6a09e667f3bcd",
       "got " + bits(Math.sqrt(2)) + ". sqrt IS IN THE SPEC. sin IS NOT. That single fact is the entire boundary Valeriu ran into, and it is a property of the FUNCTION, NOT OF THE PLATFORM.");
    ok("1/3 is 3fd5555555555555 on EVERY conforming machine", bits(1 / 3) === "3fd5555555555555",
       "division is specified too. ANY code path touching ONLY + - * / sqrt fma IS BYTE-EXACT ACROSS PLATFORMS -- 'per-platform only' IS NOT A LAW TO ACCEPT, IT IS A CONSEQUENCE OF WHICH CALLS ARE IN THE HOT PATH.");
}

// ---- 2. THE ONE THAT SHOULD CHANGE HOW YOU WRITE THE HOT PATH ----------------------------------------------------
{
    const same = Math.pow(2, 0.5) === Math.sqrt(2);
    ok("!! pow(2,0.5) AND sqrt(2) ARE THE SAME MATHS AND DIFFERENT CONTRACTS", true,
       "pow(2,0.5) = " + bits(Math.pow(2, 0.5)) + ", sqrt(2) = " + bits(Math.sqrt(2)) + " -- " +
       (same ? "IDENTICAL ON THIS MACHINE, AND THAT IS LUCK, NOT A GUARANTEE." : "ALREADY DIFFERENT ON THIS MACHINE.") +
       " sqrt IS SPECIFIED; pow IS MERELY RECOMMENDED, SO ITS LAST ULP IS THIS LIBM'S OPINION. If a hot path says pow(x, 0.5), swapping it for sqrt(x) COSTS NOTHING AND BUYS A GUARANTEE. THIS CHECK ASSERTS TRUE ON PURPOSE: it is here to be READ, and it would be dishonest to assert `same` -- ON SOME MACHINE IT WILL NOT BE.");
}

// ---- 3. THE PROBE MUST BE A MEASUREMENT, NOT A MOOD ---------------------------------------------------------------
{
    const xs = [];
    for (let i = 1; i <= 50; i++) xs.push(i / 97);
    const a = probe(Math.sin, xs), b = probe(Math.sin, xs);
    ok("the probe hashes the same twice", a.hash === b.hash,
       a.hash + " twice. NO RNG ANYWHERE IN THE SWEEP -- A PROBE YOU CANNOT REPRODUCE IS A RUMOUR, and this one is going to three machines whose ONLY difference should be the libm.");
    ok("...and different functions hash differently", probe(Math.cos, xs).hash !== a.hash,
       "or the probe cannot tell sin from cos and every line would agree for the wrong reason -- A PROBE THAT CANNOT DISAGREE IS DECORATION.");
    ok("...and it is sensitive to a ONE-ULP change", (() => {
        // move a single result by the smallest possible amount. If the hash does not notice, it cannot find
        // what Valeriu found: "~5 numbers VERY SLIGHTLY off".
        const nudged = probe((x) => (x === xs[7] ? Math.sin(x) * (1 + Number.EPSILON) : Math.sin(x)), xs);
        return nudged.hash !== a.hash;
    })(), "nudge ONE of 50 results by one epsilon -> the hash moves. THAT IS THE WHOLE REQUIREMENT: Valeriu's symptom was '~5 numbers very slightly off' out of a 347,017-byte file. A HASH THAT ONLY NOTICES BIG CHANGES WOULD HAVE MISSED HIS BUG ENTIRELY.");
}

// ---- 4. THE HONEST LIMIT -----------------------------------------------------------------------------------------
{
    ok("!! I CANNOT HARD-CODE THE LIBM HASHES, AND SAYING SO IS THE POINT", true,
       "The SPECIFIED block above is asserted against LITERAL BIT PATTERNS because the spec entitles me to. The libm block is NOT, and it MUST NOT BE -- I have ONE platform here (linux/x64) and hard-coding sin's hash from it would turn THIS MACHINE'S LIBM INTO THE DEFINITION OF CORRECT. It is not. It is one opinion of several, and the whole point of the probe is to collect the others. A CHECK THAT ASSUMES ITS OWN MACHINE IS THE REFERENCE IS NOT A CHECK, IT IS A MIRROR.");
    ok("...and the fix has a name, which means it is a solved problem", true,
       "Java ships TWO math libraries: Math (fast, platform libm) and StrictMath (bit-reproducible everywhere, implemented in software from Sun's fdlibm). StrictMath EXISTS FOR EXACTLY THIS REASON. If a transcendental must be in a deterministic path, SHIP YOUR OWN -- a polynomial you control is reproducible BY CONSTRUCTION, because DETERMINISM IS A PROPERTY OF YOUR CODE, NOT OF THE HOST'S.");
}

console.log(fails ? "\nmathProbe-selfcheck: " + fails + " FAILED" : "\nmathProbe-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
