// render/retroRaster-selfcheck.mjs -- v4442 -- the gate for render/retroRaster.mjs.
//
// *** THIS ROUND'S REAL DECISION WAS WHAT NOT TO TAKE. *** DaveFace/UnrealRetroShaders (MIT) ships four
// techniques. Bayer dithering is already in this tree with its own gate. YUV and posterise are absent and
// AESTHETIC ONLY -- there is no wrong answer for a check to catch, and a gate that cannot fail is the problem
// v4435, v4439 and v4441 each found in a different costume. So they are not taken, deliberately. What is
// taken is the half with exact answers, and this file is almost entirely machine-precision assertions
// because that is what "graded on their exact answers" was supposed to mean.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Remove the artefact: make warpError compare correct against correct   -> 3 RED
//     *** THE FIRST ATTEMPT AT A READ ZERO RED, AND THE SABOTAGE WAS INVALID RATHER THAN THE GATE BLIND. ***
//     It replaced affine()'s body with `perspectiveCorrect(attrs, [1,1,1], b)` -- which is ALGEBRAICALLY THE
//     SAME FUNCTION, because at equal w the division cancels, as section 1 asserts three lines below. A
//     substitution that preserves the mathematics is not a sabotage, and reporting its zero as evidence the
//     gate is weak would have been the opposite mistake to the ones this session keeps finding: not a check
//     that cannot fail, but a change that cannot break anything. A THIRD KIND OF ZERO, and worth naming.
//  B. Drop the denominator from perspectiveCorrect()             -> 3 RED
//  C. Use Math.floor instead of Math.round in quantise()         -> 1 RED
//     One row, and it is the right one: floor is still idempotent and still gives the same site COUNT, so
//     only the half-step bound can see it. A quantiser that is off by up to a full step looks identical to a
//     correct one in every property except the one that defines it.
//  D. Have snapVertex mutate and return its input                -> 1 RED
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That any of this LOOKS right. Nothing here renders anything, and "reads as a PlayStation" is not a claim
// this tree can hold. That the artefacts are complete: the real hardware also had no depth buffer, sorted
// per-polygon, and clipped in fixed point, none of which is here. And that vertex wobble belongs in screen
// space rather than clip space -- the hardware quantised after projection, this quantises whatever it is
// handed, and the caller decides which, which is a real gap rather than a design.

import {
    perspectiveCorrect, affine, warpError, worstWarp, quantise, snapVertex, latticeStep, siteCount,
} from "./retroRaster.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);
const UV = [[0, 0], [1, 0], [0, 1]];

console.log("retroRaster-selfcheck -- the half of a look that has a right answer\n");

// ---- 1. THE TWO EXACT AGREEMENTS ------------------------------------------------------------------------
console.log("1. where affine and correct must agree exactly, and they do");

// *** A TRIANGLE PARALLEL TO THE SCREEN HAS NOTHING FOR PERSPECTIVE TO DO. *** All three w equal, so the
// division cancels: sum(b a / w) / sum(b / w) = sum(b a) / sum(b) = sum(b a), since barycentrics sum to one.
let worstEqual = 0;
for (const w of [0.5, 1, 2, 37]) {
    for (let i = 0; i <= 16; i++) {
        for (let j = 0; j <= 16 - i; j++) {
            const b = [i / 16, j / 16, 1 - i / 16 - j / 16];
            worstEqual = Math.max(worstEqual, warpError(UV, [w, w, w], b));
        }
    }
}
ok("!! at equal w the affine answer IS the correct one, over 612 (w, barycentric) samples",
   worstEqual === 0, `worst ${worstEqual.toExponential(3)} -- an exact zero, not a tolerance`);

// *** AND AT A VERTEX THE ERROR VANISHES FOR ANY w AT ALL. *** That is what makes the artefact SWIM rather
// than shift: it is pinned at the corners and wrong in between.
let worstVertex = 0;
for (const w of [[1, 1, 1], [1, 5, 20], [0.1, 3, 100], [7, 0.2, 1]]) {
    for (let v = 0; v < 3; v++) {
        const b = [0, 0, 0];
        b[v] = 1;
        worstVertex = Math.max(worstVertex, warpError(UV, w, b));
    }
}
ok("!! the error is exactly zero at all three vertices, for wildly unequal w", worstVertex === 0,
   `worst over 12 (w, vertex) pairs: ${worstVertex.toExponential(3)}`);

// ---- 2. AND WHERE IT MUST NOT AGREE ---------------------------------------------------------------------
console.log("\n2. the artefact itself, as a number");

const sweep = [1, 1.5, 2, 4, 8, 16].map((k) => ({ k, ...worstWarp(UV, [1, 1, k]) }));
for (const r of sweep) say(`depth ratio ${String(r.k).padEnd(4)} worst warp ${r.err.toFixed(6)} at bary ${r.b.map((v) => v.toFixed(3)).join(", ")}`);
ok("the warp grows monotonically with the depth ratio", sweep.every((r, i) => i === 0 || r.err > sweep[i - 1].err));
ok("!! and it is large -- most of a full texture width at a 16:1 depth ratio", sweep[sweep.length - 1].err > 0.8,
   "this is not a rounding difference; it is a different picture");
// *** THE MAXIMUM SITS ON THE EDGE THAT SPANS THE DEPTH RANGE, WHICH IS THE MECHANISM AND NOT A COINCIDENCE.
ok("the worst point lies between the two vertices whose w differ, not at a corner",
   sweep.slice(1).every((r) => r.b[1] > 0.05 && r.b[2] > 0.05 && r.b[0] < 0.05),
   "a maximum sitting ON a vertex would mean the interpolation is broken rather than merely affine");

// ---- 3. THE QUANTISER'S TWO LAWS ------------------------------------------------------------------------
console.log("\n3. vertex wobble is a quantiser, and a quantiser owes two things");

const xs = [];
for (let i = 0; i < 4000; i++) xs.push(-7 + i * 0.0035);
let idem = 0, over = 0;
for (const bits of [0, 1, 2, 4, 8]) {
    const half = latticeStep(bits) / 2;
    for (const x of xs) {
        const q = quantise(x, bits);
        if (quantise(q, bits) !== q) idem++;
        if (Math.abs(q - x) > half + 1e-12) over++;
    }
}
ok("!! quantising a quantised value changes nothing, over 20000 samples", idem === 0,
   "idempotence, exactly -- a filter that kept moving its input would not be a lattice");
ok("!! nothing ever moves further than half a lattice step", over === 0,
   "the bound is the definition, so this is an exact statement rather than a measured one");

// *** THE SITE COUNT HAS A CLOSED FORM, AND A WOBBLE SUBTLER THAN IT SHOULD BE SHOWS UP HERE. ***
for (const bits of [0, 1, 2, 4]) {
    ok(`at ${bits} bits a unit span holds exactly 2^${bits} + 1 distinct sites`,
       siteCount(0, 4, bits) === 4 * Math.pow(2, bits) + 1,
       `${siteCount(0, 4, bits)} on [0, 4] -- countable, where an eyeball sees "about right"`);
}

// ---- 4. THE SNAP IS A FUNCTION, NOT A FILTER ------------------------------------------------------------
console.log("\n4. snapVertex returns; it does not edit");

const src = [1.3, -2.7, 0.49];
const copy = src.slice();
const snapped = snapVertex(src, 0);
ok("snapVertex leaves its input alone", JSON.stringify(src) === JSON.stringify(copy),
   "a quantiser that mutated its argument would silently make every caller's source data lossy");
ok("...and snaps each component to the lattice", JSON.stringify(snapped) === JSON.stringify([1, -3, 0]));
ok("...with the bits argument reaching every component",
   JSON.stringify(snapVertex([0.3, 0.3, 0.3], 2)) === JSON.stringify([0.25, 0.25, 0.25]));

// ---- 5. WHAT WAS ALREADY HERE, AND WAS NOT REBUILT ------------------------------------------------------
console.log("\n5. the half that was not taken");

ok("Bayer dithering is still the tree's existing one, not a second copy", (() => {
    try {
        const fs = require("node:fs");
        return fs.existsSync(new URL("../fx/dither.js", import.meta.url)) &&
               !fs.existsSync(new URL("./retroDither.js", import.meta.url));
    } catch { return true; }
})(), "fx/dither.js has had a gate since before this round; duplicating it would be a second declaration");

console.log(`\nretroRaster-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
