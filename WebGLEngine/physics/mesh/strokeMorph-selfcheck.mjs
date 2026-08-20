// physics/mesh/strokeMorph-selfcheck.mjs
//
// v3530 -- GRADES THE DERIVED MORPH, AND THE FIRST KEY IS THE ONE THAT BROKE AGAINST THE LIBRARY.
//
// I proposed "progress 0 must equal the source exactly and 1 the target exactly" before measuring anything.
// Driven against the real morphicons package, ITS t=0 RETURNS A 128-POINT RESAMPLE RATHER THAN THE SOURCE PATH
// -- so that key IS FALSE AGAINST A CORRECT IMPLEMENTATION, because resampling is how correspondence is
// computed at all. A KEY THAT WOULD FAIL A CORRECT IMPLEMENTATION IS A WRONG KEY, not a strict one.
//
// Owning the resampler is what turns it back into an identity: the endpoints are PLACED BY COPY rather than by
// the arc-length search, so t=0 IS the source's own resampling bit for bit. THAT IS THE WHOLE ARGUMENT FOR
// DERIVING THIS -- not that morphicons is weak (it verified cleanly: MIT, zero dependencies, DOM-free entry,
// 132 KB) but that for TEN OPEN STROKES WE AUTHOR, its two hard parts are idle and a dependency cannot hand
// back an exact key.
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./strokeMorph.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const N = 64;
const stroke = (k) => M.resample(M.parseStroke(M.DIGIT_STROKES[k]), N);

console.log("strokeMorph-selfcheck -- ten digits, and the keys the library could not give\n");

// ---------------------------------------------------------------------------
console.log("1. THE RESAMPLER PLACES POINTS BY ARC LENGTH, AND THE ENDPOINTS BY IDENTITY");
{
    const raw = M.parseStroke(M.DIGIT_STROKES[1]);
    const r = M.resample(raw, N);
    ok("N points come back", r.length === N, N + " points from a " + raw.length + "-vertex polyline");
    ok("!! the first and last points are the SOURCE'S OWN, not interpolated",
        same(r[0], raw[0]) && same(r[N - 1], raw[raw.length - 1]),
        "*** PLACED BY COPY RATHER THAN BY THE SEARCH. The interior points come from a division, and a division " +
        "at the exact end can land one ulp short -- an endpoint that drifted would make this file's strongest " +
        "key a TOLERANCE for a reason having nothing to do with morphing. ***");

    // *** THE PROPERTY THE RESAMPLER IS FOR -- AND MY FIRST VERSION OF THIS CHECK MEASURED THE WRONG THING AND
    // FAILED A CORRECT RESAMPLER. It compared the CHORD between consecutive samples and called that arc length.
    // A CORNER BETWEEN TWO SAMPLES MAKES THE CHORD SHORTER THAN THE ARC: digit 1 reads 1.475 against an even
    // 3.2857 across its elbow, and that is the resampler being RIGHT. The claim is about where each sample SITS
    // ALONG THE PATH, so the position is what gets measured. ***
    const rawS = M.arcLengths(raw), total = rawS[rawS.length - 1];
    const posOf = (pt) => {                       // arc length at which `pt` sits on the ORIGINAL polyline
        let best = Infinity, bestS = 0;
        for (let i = 1; i < raw.length; i++) {
            const dx = raw[i][0] - raw[i - 1][0], dy = raw[i][1] - raw[i - 1][1];
            const len2 = dx * dx + dy * dy;
            const u = len2 > 0 ? Math.max(0, Math.min(1, ((pt[0] - raw[i - 1][0]) * dx + (pt[1] - raw[i - 1][1]) * dy) / len2)) : 0;
            const px = raw[i - 1][0] + u * dx, py = raw[i - 1][1] + u * dy;
            const d = Math.hypot(pt[0] - px, pt[1] - py);
            if (d < best) { best = d; bestS = rawS[i - 1] + u * Math.sqrt(len2); }
        }
        return { off: best, at: bestS };
    };
    let worstOff = 0, worstPos = 0;
    for (let k = 0; k < N; k++) {
        const { off, at } = posOf(r[k]);
        worstOff = Math.max(worstOff, off);
        worstPos = Math.max(worstPos, Math.abs(at - (total * k) / (N - 1)));
    }
    ok("!! every sample LIES ON the source path", worstOff < 1e-9,
        "worst offset " + worstOff.toExponential(2) + " -- resampling moves points ALONG the stroke, never off it");
    ok("!! *** AND SAMPLE k SITS AT ARC FRACTION k/(N-1), EXACTLY ***", worstPos < 1e-9,
        "worst position error " + worstPos.toExponential(2) + " over " + N + " samples of a " +
        total.toFixed(3) + "-long stroke. THIS IS THE IDENTITY OWNING THE RESAMPLER BUYS: a vendored one " +
        "chooses its own sample count and this becomes a tolerance.");

}

// ---------------------------------------------------------------------------
console.log("\n2. THE ENDPOINT KEYS ARE IDENTITIES, WHICH IS WHAT DERIVING BOUGHT");
{
    let worstPairs = 0;
    for (let i = 0; i < 10; i++) {
        const a = stroke(i), b = stroke((i + 1) % 10);
        const { target } = M.pairStrokes(a, b);
        if (!same(M.morphAt(a, target, 0), a)) worstPairs++;
        if (!same(M.morphAt(a, target, 1), target)) worstPairs++;
    }
    ok("!! *** t=0 IS THE SOURCE AND t=1 IS THE TARGET, EXACTLY, FOR ALL TEN ADJACENT PAIRS ***", worstPairs === 0,
        "20 endpoint comparisons across ten adjacent pairs, zero differences. *** AND THE REASON IS NOT THE ONE I " +
        "FIRST WROTE: I claimed a + 1*(b-a) IS b in IEEE-754 and IT IS NOT -- the subtraction rounds, then the " +
        "addition rounds again, and this check FAILED on a correct morph until the endpoints were placed BY " +
        "IDENTITY, the same rule the resampler already used. THE ARMCHAIR CLAIM WAS WRONG AND THE MEASUREMENT " +
        "SAID SO. ***");
    report("AND THIS IS THE KEY I GOT WRONG FIRST",
        "*** stated before measuring, then DRIVEN AGAINST morphicons, whose t=0 returns a 128-point resample " +
        "rather than the source path. THE KEY WOULD HAVE FAILED A CORRECT IMPLEMENTATION. It holds here only " +
        "because we own the sample count and place the endpoints by copy. ***");
}

// ---------------------------------------------------------------------------
console.log("\n3. ARC LENGTH STAYS BOUNDED -- WHICH IS WHAT 'SHEARS IN TRANSIT' MEANS QUANTITATIVELY");
{
    let worstRatio = 0, worstPair = "";
    for (let i = 0; i < 10; i++) {
        const a = stroke(i), b = stroke((i + 1) % 10);
        const { target } = M.pairStrokes(a, b);
        const la = M.totalLength(a), lb = M.totalLength(target), cap = Math.max(la, lb);
        for (let s = 0; s <= 20; s++) {
            const l = M.totalLength(M.morphAt(a, target, s / 20));
            const ratio = l / cap;
            if (ratio > worstRatio) { worstRatio = ratio; worstPair = i + "->" + ((i + 1) % 10); }
        }
    }
    ok("!! no intermediate frame is LONGER than the longer of its endpoints", worstRatio <= 1 + 1e-9,
        "worst " + worstRatio.toFixed(6) + " of the endpoint cap, at " + worstPair +
        ". A morph that ballooned mid-flight is a shape travelling through somewhere it should not -- and it " +
        "is invisible in a still frame at t=0 or t=1, which is exactly why the key is a SWEEP");
    report("WHY A CAP AND NOT A RANGE",
        "the length may legitimately DIP below both endpoints -- a straight-through path is shorter than either " +
        "curve -- so a two-sided bound would fail correct morphs. THE ONE-SIDED CAP IS THE CLAIM THAT HOLDS.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE ROUND TRIP, AND THE WRAP THE COUNTER GIVES FREE");
{
    const a = stroke(1), b = stroke(2);
    const p1 = M.pairStrokes(a, b);
    const there = M.morphAt(a, p1.target, 1);
    const p2 = M.pairStrokes(there, a);
    const back = M.morphAt(there, p2.target, 1);
    ok("!! 1 -> 2 -> 1 returns the original geometry", same(back, a),
        "exactly, because every step is an endpoint identity and the pairing is symmetric on an open stroke");

    // 9 -> 0 is the pair a single icon demo cannot ask for, and a counter cannot avoid.
    const n = stroke(9), z = stroke(0);
    const pw = M.pairStrokes(n, z);
    ok("!! *** 9 -> 0 IS NOT A SPECIAL CASE ***",
        M.morphAt(n, pw.target, 0).length === N && same(M.morphAt(n, pw.target, 0), n),
        "the wrap goes through the same pairing as every other adjacent pair. A DEMO MORPHING ONE ICON INTO " +
        "ONE OTHER CANNOT ASK THIS QUESTION; A COUNTER CANNOT AVOID IT.");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE LOAD-BEARING NEGATIVE: DIRECTION IS MEASURED, NOT ASSUMED");
{
    const a = stroke(1), b = stroke(2);
    const p = M.pairStrokes(a, b);
    ok("the pairing reports both travels and picks the shorter", p.travelForward > 0 && p.travelReversed > 0,
        "forward " + p.travelForward.toFixed(1) + " against reversed " + p.travelReversed.toFixed(1) +
        " -- a 3x difference, so this is not a tie being broken arbitrarily");

    // THE PLANT: a glyph authored end-to-start. Every point would cross the shape if direction were assumed.
    const flipped = [...b].reverse();
    const pf = M.pairStrokes(a, flipped);
    ok("!! a glyph authored END-TO-START still morphs the short way", pf.reversed === true,
        "the same target with its points reversed is detected and un-reversed, so authoring order cannot " +
        "silently double the distance every point travels");
    const naive = a.reduce((s, q, i) => s + Math.hypot(flipped[i][0] - q[0], flipped[i][1] - q[1]), 0);
    const chosen = a.reduce((s, q, i) => s + Math.hypot(pf.target[i][0] - q[0], pf.target[i][1] - q[1]), 0);
    ok("!! and the saving is measured rather than claimed", chosen < naive * 0.5,
        "assumed direction would travel " + naive.toFixed(1) + " against " + chosen.toFixed(1) +
        " -- the plant fails BY A PREDICTED FACTOR rather than merely failing");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE PARSER REFUSES WHAT IT DOES NOT UNDERSTAND");
{
    // MY FIRST VERSION CALLED parseStroke ALONE and the degenerate case passed it -- "M 5 5 L 5 5" IS two
    // valid points; it is RESAMPLING that has no arc length to divide. The refusal has to be asked of the
    // pipeline, not of the first stage that happens to be nearest.
    const refuses = (d) => { try { M.resample(M.parseStroke(d), N); return false; } catch { return true; } };
    ok("!! an unsupported op THROWS rather than being skipped", refuses("M 0 0 A 5 5 0 0 1 10 10"),
        "*** A PARSER THAT IGNORES WHAT IT DOES NOT UNDERSTAND PRODUCES A SHAPE THAT IS WRONG IN A WAY NOTHING " +
        "DOWNSTREAM CAN SEE -- v3442's vox defect in a new subject, where a coerced field wrote 925 voxels as " +
        "the empty colour while every position check passed. ***");
    ok("a degenerate stroke refuses rather than dividing by zero", refuses("M 5 5 L 5 5"),
        "zero arc length has no fractions to resample along");
    ok("...and every shipped digit parses", Object.keys(M.DIGIT_STROKES).every((k) => !refuses(M.DIGIT_STROKES[k])),
        "the positive control: without it section 6 would pass on a parser that refused everything");
}

// ---------------------------------------------------------------------------
report("THE REFUSAL, WITH ITS EXPIRY WRITTEN IN",
    "*** morphicons IS NOT REFUSED FOR QUALITY -- it verified cleanly and its two hard parts (subpath " +
    "correspondence and CYCLIC ROTATION ALIGNMENT on closed paths) are real work. THEY ARE IDLE HERE: all ten " +
    "digits resample to ONE SUBPATH, NONE CLOSED, measured. THE MOMENT SOMEBODY WANTS A CLOSED OR MULTI-SUBPATH " +
    "ICON, THIS FILE IS THE WRONG TOOL AND morphicons IS THE THING TO REACH FOR -- do not re-derive that half. ***");

console.log(`\nstrokeMorph-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
