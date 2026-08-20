// WebGLEngine/tools/mathProbe.mjs — v2599
//
// WHICH FUNCTION COST YOU THE BYTES? Run this on every machine you own and diff the output.
//
//     node tools/mathProbe.mjs
//
// ---- WHY THIS EXISTS ---------------------------------------------------------------------------------------------
//
// Valeriu Palos (vpalos/Krbn) found that Krbn's byte-identical SVG output is byte-identical PER PLATFORM ONLY:
//
//     "the JS VM uses the system's underlying functions for Math.sin/log2/hypot/... and those implementations
//      sometimes vary by very small amounts... you ran your code on Linux => 347017 bytes; when I ran it on
//      Linux I got the exact same result => same SHA hash; when I ran your code on a MacOS I got ~5 numbers
//      very slightly off => 347019 bytes (different SHA)."
//
// HE IS RIGHT ABOUT THE FACT AND THE DIAGNOSIS IS SHARPER THAN "PLATFORM".
//
// IEEE 754 EXACTLY SPECIFIES five operations: + - * / and sqrt (and fma). They are required to be CORRECTLY
// ROUNDED -- there is no freedom, and every conforming platform MUST produce identical bits. Measured here:
//
//     0.1 + 0.2       3fd3333333333334
//     1/3             3fd5555555555555
//     Math.sqrt(2)    3ff6a09e667f3bcd
//
// IEEE 754 DOES NOT SPECIFY sin, cos, tan, log, log2, exp, pow, hypot, cbrt, atan2. It merely RECOMMENDS them.
// Every libm may differ in the last ulp, and they do.
//
// SO THE BOUNDARY IS NOT THE PLATFORM. IT IS THE FUNCTION. Byte-exactness is CROSS-platform for any code path
// that touches only the specified five, and PER-platform the moment a transcendental enters it. "Per-platform
// only" is not a law to accept -- IT IS A CONSEQUENCE OF WHICH CALLS ARE IN THE HOT PATH.
//
// The sharpest example, measured on this machine:
//
//     Math.sqrt(2)      3ff6a09e667f3bcd     <- IEEE GUARANTEES this everywhere
//     Math.pow(2, 0.5)  3ff6a09e667f3bcd     <- IDENTICAL BITS... on THIS machine, BY LUCK
//
// SAME MATHEMATICS. DIFFERENT CONTRACT. One is promised; the other is this libm's opinion. If a hot path says
// pow(x, 0.5), swapping it for sqrt(x) costs nothing and buys a guarantee.
//
// ---- WHAT THIS PROBE DOES ----------------------------------------------------------------------------------------
//
// Hashes each function over a deterministic input sweep and prints ONE LINE PER FUNCTION. Run it on Galaxina
// (Windows), Stellar Atlas (Intel macOS), and the M-series Mac (arm64), then diff. THE LINES THAT DIFFER ARE
// THE FUNCTIONS THAT COST YOU THE BYTES -- no guessing which five numbers moved.
//
// The SPECIFIED block is a CONTROL. If those lines ever differ between two machines, the finding is not "libm
// varies" -- it is that something is very wrong (a JIT bug, x87 80-bit intermediates, or --ffast-math), and
// that is worth knowing far more than a drifting sine.
//
// ---- THE FIX, IF YOU NEED ONE ------------------------------------------------------------------------------------
//
// This is a solved problem with a known name. Java has TWO math libraries: Math (fast, platform libm) and
// StrictMath (bit-reproducible everywhere, implemented in software from Sun's fdlibm). StrictMath EXISTS FOR
// EXACTLY THIS REASON. If a transcendental must be in the deterministic path, ship your own -- a polynomial you
// control is reproducible by construction, because determinism is a property of YOUR code, not of the host's.
import crypto from "node:crypto";
import os from "node:os";

const bits = (x) => {
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, x);
    return b.getBigUint64(0).toString(16).padStart(16, "0");
};

/** Hash a function over a fixed sweep. Same inputs everywhere, so ANY difference is the implementation. */
function probe(fn, inputs) {
    const h = crypto.createHash("sha256");
    let sample = null;
    for (const a of inputs) {
        const v = Array.isArray(a) ? fn(...a) : fn(a);
        if (sample === null) sample = v;
        h.update(bits(v));
    }
    return { hash: h.digest("hex").slice(0, 16), sample };
}

// a deterministic sweep -- no RNG, because A PROBE YOU CANNOT REPRODUCE IS A RUMOUR
const xs = [];
for (let i = 1; i <= 400; i++) xs.push(i / 97);
const pairs = xs.map((x, i) => [x, xs[(i * 7 + 3) % xs.length]]);

// IEEE 754 REQUIRES these to be correctly rounded. THIS BLOCK IS THE CONTROL.
const SPECIFIED = {
    "add        (+)": probe((x) => x + 0.1, xs),
    "sub        (-)": probe((x) => x - 0.1, xs),
    "mul        (*)": probe((x) => x * 3.7, xs),
    "div        (/)": probe((x) => x / 3.7, xs),
    "sqrt       [IEEE]": probe(Math.sqrt, xs),
    "fround     [IEEE]": probe(Math.fround, xs),
};

// IEEE 754 only RECOMMENDS these. Every libm may differ in the last ulp.
const LIBM = {
    "sin": probe(Math.sin, xs),
    "cos": probe(Math.cos, xs),
    "tan": probe(Math.tan, xs),
    "asin": probe((x) => Math.asin(x % 1), xs),
    "atan2": probe(Math.atan2, pairs),
    "exp": probe(Math.exp, xs),
    "log": probe(Math.log, xs),
    "log2": probe(Math.log2, xs),
    "pow": probe((a, b) => Math.pow(a, b), pairs),
    "hypot": probe((a, b) => Math.hypot(a, b), pairs),
    "cbrt": probe(Math.cbrt, xs),
    "sinh": probe(Math.sinh, xs),
};

const plat = `${os.platform()}/${os.arch()} node ${process.versions.node} v8 ${process.versions.v8}`;
console.log("SweK math probe — WHICH FUNCTION COST YOU THE BYTES?");
console.log("platform: " + plat);
console.log("");
console.log("SPECIFIED by IEEE 754 (correctly rounded — these MUST match on every conforming machine):");
for (const [k, v] of Object.entries(SPECIFIED)) console.log("  " + k.padEnd(20) + v.hash);
console.log("");
console.log("NOT specified — libm's choice (these are where byte-exactness goes to die):");
for (const [k, v] of Object.entries(LIBM)) console.log("  " + k.padEnd(20) + v.hash);
console.log("");
console.log("pow(2,0.5) " + bits(Math.pow(2, 0.5)) + "   vs   sqrt(2) " + bits(Math.sqrt(2)) +
            (Math.pow(2, 0.5) === Math.sqrt(2) ? "   IDENTICAL HERE — but only sqrt is PROMISED to be." :
                                                 "   THEY ALREADY DIFFER ON THIS MACHINE."));
console.log("");
console.log("Run on every machine and diff. A SPECIFIED line that differs is not libm variance — it is a bug");
console.log("worth chasing (JIT, x87 80-bit intermediates, fast-math). A libm line that differs is the answer.");

export { probe, bits, SPECIFIED, LIBM };
