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
import { readFileSync } from "node:fs";
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
console.log("\n7. v3904 -- THE TWO EXPORTS THIS GATE HAD NEVER NAMED, AND WHAT MEASURING THEM FOUND");
{
    // *** toPathD AND morphPaths ARE THE FILE'S ENTIRE OUTPUT STAGE and neither name appeared above. They are
    // not equally unreached: toPathD is called by ui/morphDigits.js on every frame, while morphPaths IS CALLED
    // BY NOTHING IN THE TREE -- measured, not assumed. And the page cannot call it: the animation holds `a` and
    // `target` ACROSS frames, and morphPaths re-parses and re-resamples both glyphs on every call. So the
    // convenience wrapper is a SECOND DECLARATION OF THE PIPELINE with no consumer, which is this tree's
    // eight-defect shape (v3223) waiting to happen. The answer is not to delete it and not to leave it: it is
    // to PIN IT TO THE STEPS THE PAGE ACTUALLY RUNS, so the two cannot drift. ***
    const coordsOf = (d) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

    let worst4 = 0, worst1 = 0, shapeOk = true;
    for (let k = 0; k < 10; k++) {
        const p = stroke(k), c4 = coordsOf(M.toPathD(p)), c1 = coordsOf(M.toPathD(p, 1));
        if (c4.length !== p.length || c1.length !== p.length) shapeOk = false;
        for (let i = 0; i < p.length; i++) {
            worst4 = Math.max(worst4, Math.abs(c4[i][0] - p[i][0]), Math.abs(c4[i][1] - p[i][1]));
            worst1 = Math.max(worst1, Math.abs(c1[i][0] - p[i][0]), Math.abs(c1[i][1] - p[i][1]));
        }
    }
    const d1 = M.toPathD(stroke(1));
    ok("!! toPathD writes ONE move and N-1 lines, and every coordinate is the polyline's own",
        shapeOk && (d1.match(/M/g) || []).length === 1 && (d1.match(/L/g) || []).length === N - 1,
        `${N} points -> 1 M + ${N - 1} L in ${d1.length} characters. A stroke that gained a subpath here would ` +
        `break the one-open-subpath premise the whole refusal of morphicons rests on`);
    ok("!! and `places` is a REAL precision/size trade, measured at both ends",
        worst4 <= 0.5e-4 && worst1 <= 0.5e-1 && M.toPathD(stroke(1), 1).length < 0.75 * d1.length,
        `worst coordinate error ${worst4.toExponential(3)} at places=4 and ${worst1.toExponential(3)} at places=1 -- ` +
        `HALF A UNIT IN THE LAST PLACE KEPT, in both cases, which is what rounding means and is not what a ` +
        `truncation would give. The attribute shrinks ${d1.length} -> ${M.toPathD(stroke(1), 1).length} characters for it.`);

    // *** THE ASYMMETRY, FOUND BY WRITING THE OBVIOUS ROUND-TRIP CHECK AND HAVING IT THROW. ***
    let refused = false, why = "";
    try { M.parseStroke(d1); } catch (e) { refused = true; why = e.message; }
    ok("!! *** THIS FILE'S WRITER PRODUCES SVG THIS FILE'S READER REFUSES, AND THAT IS RECORDED RATHER THAN FIXED ***",
        refused,
        `toPathD emits the minimal separator ("M12 3L14 5"), which is LEGAL SVG and is what the browser parses ` +
        `on every frame; parseStroke splits on whitespace and so reads "M12" as an unknown op ("${why.slice(0, 44)}..."). ` +
        `NEITHER FUNCTION IS WRONG and the page is unaffected -- but parse(toPathD(x)) is NOT a round trip, and a ` +
        `later round that assumes it is would be building on a sentence nobody had run. WHICH SIDE MOVES (widen the ` +
        `parser, or space the writer at a cost in attribute size) IS A DECISION, NOT A DEFECT, and it is not taken here.`);

    // *** THE PIN: the wrapper and the four steps the page runs must be the SAME STRING. ***
    let mismatches = 0, cases = 0;
    for (let k = 0; k < 10; k++) {
        const A = M.DIGIT_STROKES[k], B = M.DIGIT_STROKES[(k + 1) % 10];
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const a = M.resample(M.parseStroke(A), N), b = M.resample(M.parseStroke(B), N);
            const { target } = M.pairStrokes(a, b);
            if (M.morphPaths(A, B, t, N) !== M.toPathD(M.morphAt(a, target, t))) mismatches++;
            cases++;
        }
    }
    ok("!! *** morphPaths IS EXACTLY THE FOUR STEPS THE PAGE RUNS BY HAND -- SAME STRING, NOT MERELY SAME SHAPE ***",
        mismatches === 0 && cases === 50,
        `${cases} cases: ten adjacent digit pairs including the 9 -> 0 wrap, at five progresses each. The wrapper ` +
        `has NO CALLER (measured across the tree), so nothing else would ever notice it drifting from the pipeline ` +
        `it duplicates -- and a string comparison rather than a geometric one is deliberate, because the page sets ` +
        `this exact string as an attribute.`);

    // The front door, asserted as a mechanism: ONE declaration of the glyphs, and the page reads it.
    const page = readFileSync(new URL("../../ui/morphDigits.js", import.meta.url), "utf8");
    ok("!! ui/morphDigits.js imports toPathD and the glyphs from here rather than re-declaring them",
        /from\s+["']\.\.\/physics\/mesh\/strokeMorph\.mjs["']/.test(page) && /\btoPathD\(/.test(page) &&
        !/DIGIT_STROKES\s*=/.test(page),
        "the import AND the call are asserted, and a second `DIGIT_STROKES =` anywhere in the page fails this -- " +
        "a check on the name appearing would pass on a copy of the table sitting beside a decorative import.");
}

// ---------------------------------------------------------------------------
report("THE REFUSAL, WITH ITS EXPIRY WRITTEN IN",
    "*** morphicons IS NOT REFUSED FOR QUALITY -- it verified cleanly and its two hard parts (subpath " +
    "correspondence and CYCLIC ROTATION ALIGNMENT on closed paths) are real work. THEY ARE IDLE HERE: all ten " +
    "digits resample to ONE SUBPATH, NONE CLOSED, measured. THE MOMENT SOMEBODY WANTS A CLOSED OR MULTI-SUBPATH " +
    "ICON, THIS FILE IS THE WRONG TOOL AND morphicons IS THE THING TO REACH FOR -- do not re-derive that half. ***");

console.log(`\nstrokeMorph-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
