#!/usr/bin/env node
// WebGLEngine/tools/ship/splatSort-selfcheck.mjs -- v4264
//
// Run: node tools/ship/splatSort-selfcheck.mjs
//
// *** BACKLOG #138 ARRIVED AS "TAKE THE GPU ODD-EVEN SORT". v4262's RULE SAYS MEASURE THE CONSUMER FIRST,
// *** AND HERE THE CONSUMER IS REAL AND THE OFFERED ALGORITHM IS WRONG FOR IT. *** Gaussian splats are
// alpha-blended with the depth buffer off, so they must be drawn back to front or the picture is wrong. Both
// engine/SplatRenderer.js and render/SplatRenderer.js re-sort every splat on every camera move -- the most
// unambiguous consumer this tree has produced for anything.
//
// And both ran the same line: Array.from(idx).sort((a,b) => keys[a]-keys[b]), boxing every index into a plain
// Array once per frame and paying a call per comparison. 255.87 ms at 500K splats. Section 3 measures the
// replacement; section 4 computes why the odd-even sort is refused, in compare-exchanges rather than big-O.
//
// *** TWO FILES ALSO SAID SOMETHING FALSE ABOUT THIS SORT AND SECTION 5 ASSERTS BOTH CORRECTIONS. ***
"use strict";
import * as S from "../../render/splatSort.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

/** Deterministic depth keys, so every number below is reproducible. */
const mkKeys = (n, seed = 12345) => { const k = new Float32Array(n); let s = seed >>> 0;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; k[i] = ((s >>> 8) / 8388608 - 0.5) * 1000; }
    return k; };

console.log("splatSort-selfcheck -- the consumer is real, the offered algorithm is not the one to take\n");

// =============================================================================================================
console.log("1. *** THE KEY MAPPING: floats sort as integers, or nothing below is exact ***");
{
    // Order-preserving float->uint is the whole trick, and it is where a sign-bit mistake hides silently:
    // a sort that is right for positives and wrong for negatives looks fine on most scenes.
    const probes = [-Infinity, -1e30, -1000, -1, -1e-30, -0, 0, 1e-30, 1, 1000, 1e30, Infinity];
    let bad = 0;
    for (let i = 1; i < probes.length; i++)
        if (!(S.floatKeyToUint(probes[i - 1]) <= S.floatKeyToUint(probes[i]))) bad++;
    ok("the mapping is monotonic across the whole float range, negatives included", bad === 0,
        probes.length + " probes from -Infinity to +Infinity, " + bad + " inversions");
    ok("*** -0 and +0 map to ADJACENT values, so a splat at zero depth cannot flicker between frames ***",
        Math.abs(S.floatKeyToUint(-0) - S.floatKeyToUint(0)) <= 1,
        "-0 -> " + S.floatKeyToUint(-0) + ", +0 -> " + S.floatKeyToUint(0));
    // A random sweep, because twelve hand-picked probes is not a range test.
    let s = 7, inv = 0;
    for (let i = 0; i < 200000; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const a = ((s >>> 8) / 8388608 - 0.5) * 1e6;
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const b = ((s >>> 8) / 8388608 - 0.5) * 1e6;
        if ((a < b) !== (S.floatKeyToUint(a) < S.floatKeyToUint(b))) inv++;
    }
    ok("and over 200,000 random pairs the ordering never disagrees with the floats", inv === 0, inv + " disagreements");
}

// =============================================================================================================
console.log("\n2. *** THE REPLACEMENT PRODUCES THE SAME PERMUTATION, not merely a sorted one ***");
{
    // *** A REWRITE NOBODY COMPARED AGAINST THE ORIGINAL IS NOT A FIX. *** The old comparison sort is kept in
    // the module for exactly this: the radix result must equal it index for index, not just be in order.
    let mismatches = 0, checked = 0;
    for (const n of [0, 1, 2, 3, 7, 64, 1000, 4097, 65537]) {
        const keys = mkKeys(n, n + 1);
        const a = new Uint32Array(n), b = new Uint32Array(n);
        for (let i = 0; i < n; i++) { a[i] = i; b[i] = i; }
        S.radixSortIndices(keys, a, S.makeSortScratch(n));
        S.comparisonSortIndices(keys, b);
        for (let i = 0; i < n; i++) { checked++; if (a[i] !== b[i]) mismatches++; }
    }
    ok("radix and comparison agree index-for-index at nine sizes including 0, 1 and 65537",
        mismatches === 0, checked + " positions compared, " + mismatches + " differ");
    // The result must actually BE sorted -- agreeing with a broken reference would pass the check above.
    const n = 50000, keys = mkKeys(n), idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    S.radixSortIndices(keys, idx, S.makeSortScratch(n));
    let unsorted = 0; for (let i = 1; i < n; i++) if (keys[idx[i - 1]] > keys[idx[i]]) unsorted++;
    ok("  and the output is genuinely ascending, checked against the keys themselves", unsorted === 0,
        unsorted + " inversions in " + n);
    ok("  and it is a PERMUTATION -- every index present exactly once", (() => {
        const seen = new Uint8Array(n); for (let i = 0; i < n; i++) seen[idx[i]]++;
        return Array.prototype.every.call(seen, (v) => v === 1); })());
    // Ties: both sorts are stable, so equal keys keep their original order. Asserted, because a splat cloud
    // with repeated depths (a flat wall) is the case where an unstable sort makes the picture shimmer.
    const tk = new Float32Array(1000); for (let i = 0; i < 1000; i++) tk[i] = (i % 5) * 1.0;
    const ta = new Uint32Array(1000), tb = new Uint32Array(1000);
    for (let i = 0; i < 1000; i++) { ta[i] = i; tb[i] = i; }
    S.radixSortIndices(tk, ta, S.makeSortScratch(1000)); S.comparisonSortIndices(tk, tb);
    ok("*** ties keep their original order and match the comparison sort -- a flat wall must not shimmer ***",
        ta.every((v, i) => v === tb[i]), "1000 splats over 5 distinct depths");
    // CONTROL: the comparison must be able to fail.
    const wrong = Uint32Array.from(ta); wrong[10] = wrong[11]; wrong[11] = ta[10];
    ok("CONTROL: a two-element swap IS detected", !wrong.every((v, i) => v === tb[i]));
}

// =============================================================================================================
console.log("\n3. *** WHAT IT COSTS, at the counts the renderers claim to handle ***");
{
    const rows = [];
    for (const n of [10000, 100000, 500000]) {
        const keys = mkKeys(n), idx = new Uint32Array(n), sc = S.makeSortScratch(n);
        const reps = n > 200000 ? 2 : 3;
        for (let i = 0; i < n; i++) idx[i] = i; S.comparisonSortIndices(keys, idx);
        for (let i = 0; i < n; i++) idx[i] = i; S.radixSortIndices(keys, idx, sc);
        let o = Infinity, r = Infinity;
        for (let t = 0; t < reps; t++) { for (let i = 0; i < n; i++) idx[i] = i;
            const a = process.hrtime.bigint(); S.comparisonSortIndices(keys, idx); const b = process.hrtime.bigint();
            o = Math.min(o, Number(b - a) / 1e6); }
        for (let t = 0; t < reps; t++) { for (let i = 0; i < n; i++) idx[i] = i;
            const a = process.hrtime.bigint(); S.radixSortIndices(keys, idx, sc); const b = process.hrtime.bigint();
            r = Math.min(r, Number(b - a) / 1e6); }
        rows.push({ n, o, r });
        report("  " + String(n).padStart(6) + " splats: comparison " + o.toFixed(2) + " ms, radix " +
            r.toFixed(2) + " ms, " + (o / r).toFixed(1) + "x");
    }
    ok("the radix sort is faster at every size measured", rows.every((x) => x.r < x.o));
    const big = rows[rows.length - 1];
    ok("*** at 500K splats the old sort misses a 60 fps frame and the new one makes it ***",
        big.o > 16.7 && big.r < 16.7,
        "comparison " + big.o.toFixed(1) + " ms (" + (1000 / big.o).toFixed(1) + " fps), radix " +
        big.r.toFixed(1) + " ms (" + (1000 / big.r).toFixed(0) + " fps)");
    ok("  and the speedup is an order of magnitude, not a rounding difference", big.o / big.r > 8,
        (big.o / big.r).toFixed(1) + "x");
    report("timings are the BEST of 2-3 runs on this sandbox's CPU in Node, which flatters both sides " +
        "equally; the ratio is the durable number and the absolute milliseconds are not.");

    // *** ALLOCATION-FREE IS A SEPARATE CLAIM FROM FAST, AND THE TIMING CHECK CANNOT SEE IT. *** Sabotage D
    // made radixSortIndices allocate its own scratch on every call -- the exact defect the caller-supplied
    // scratch exists to prevent, and one that would ship silently -- and went 0 RED, because even with a
    // fresh 65,537-entry histogram per call the radix sort is still far inside the frame budget. Speed was
    // never the right instrument. This asks the direct question instead: did the function WRITE INTO THE
    // SCRATCH IT WAS HANDED? A version that allocates its own leaves the caller's untouched.
    {
        const n = 4096, keys = mkKeys(n, 5), idx = new Uint32Array(n);
        const sc = S.makeSortScratch(n);
        sc.a.fill(0xdeadbeef); sc.b.fill(0xdeadbeef); sc.u.fill(0xdeadbeef); sc.counts.fill(0xdeadbeef);
        for (let i = 0; i < n; i++) idx[i] = i;
        S.radixSortIndices(keys, idx, sc);
        const touched = (arr) => Array.prototype.some.call(arr, (v) => v !== 0xdeadbeef);
        ok("*** the sort writes into the scratch it was HANDED, so it allocates nothing per frame ***",
            touched(sc.u) && touched(sc.counts) && (touched(sc.a) || touched(sc.b)),
            "u " + touched(sc.u) + ", counts " + touched(sc.counts) + ", ping/pong " + (touched(sc.a) || touched(sc.b)));
        // CONTROL: the probe must be able to say "untouched" -- otherwise the check above proves nothing.
        const fresh = S.makeSortScratch(n); fresh.u.fill(0xdeadbeef);
        ok("  CONTROL: an untouched scratch reads as untouched",
            !Array.prototype.some.call(fresh.u, (v) => v !== 0xdeadbeef));
    }
}

// =============================================================================================================
console.log("\n4. *** THE REFUSAL: odd-even transposition, priced in compare-exchanges ***");
{
    // The offered algorithm needs N passes of N/2 compare-exchanges. It is beautiful on a machine with O(N)
    // processors and this is a browser. The refusal is a ratio, not an opinion about big-O.
    for (const n of [10000, 100000, 500000]) {
        const oe = S.oddEvenCompareExchanges(n), cs = S.comparisonCount(n);
        report("  n=" + String(n).padStart(6) + ": odd-even " + oe.toExponential(2) +
            " compare-exchanges vs " + cs.toExponential(2) + " comparisons -- " +
            (oe / cs).toExponential(2) + "x more work");
    }
    ok("odd-even is quadratic: doubling n roughly quadruples the work",
        Math.abs(S.oddEvenCompareExchanges(200000) / S.oddEvenCompareExchanges(100000) - 4) < 0.1,
        (S.oddEvenCompareExchanges(200000) / S.oddEvenCompareExchanges(100000)).toFixed(3) + "x for 2x n");
    ok("*** at 500K splats it is over 10,000x the work of the sort it would replace ***",
        S.oddEvenCompareExchanges(500000) / S.comparisonCount(500000) > 1e4,
        (S.oddEvenCompareExchanges(500000) / S.comparisonCount(500000)).toExponential(2) + "x");
    ok("and nothing from that repository was vendored", (() => {
        let hits = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (/^\.git$|node_modules/.test(e.name)) continue; const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else if (/odd.?even|transposition/i.test(e.name)) hits++; } };
        walk(ROOT); return hits === 0; })());
    report("*** WHAT WAS TAKEN IS THE PREMISE AND NOT THE ALGORITHM: *** that this sort should stop being a " +
        "comparison sort. A depth key is a float, a float has a bit pattern that sorts as an integer, and " +
        "integers can be COUNTED. That is a CPU radix sort, and it fits the frame budget without a GPU pass.");
}

// =============================================================================================================
console.log("\n5. *** BOTH RENDERERS SAID SOMETHING FALSE ABOUT THIS SORT ***");
{
    const eng = read("engine/SplatRenderer.js"), ren = read("render/SplatRenderer.js");
    for (const [name, src, rel] of [["engine/SplatRenderer.js", eng, "../render/splatSort.mjs"],
                                    ["render/SplatRenderer.js", ren, "./splatSort.mjs"]]) {
        ok("  " + name + " imports the radix sort", src.includes('from "' + rel + '"'));
        ok("    and calls it", /radixSortIndices\(keys, idx, this\._sortScratch\)/.test(src));
        ok("    with scratch allocated ONCE, not per frame", /makeSortScratch\(/.test(src) &&
            !/makeSortScratch\([^)]*\)\s*;[\s\S]{0,200}_sort\(/.test(src));
        // *** STRIP COMMENTS FIRST -- BOTH FILES NOW QUOTE THE OLD LINE IN THE PARAGRAPH EXPLAINING WHY IT
        // *** WENT. *** This check went red on the quoted correction, which is the third time in three rounds
        // that a byte-scan has read this tree's own commentary as the thing it describes (v4262's influence
        // scan, v4263's "one requirement" grep, and now this). The rule is settled: if a check is about CODE,
        // remove the comments before looking.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
        ok("    and the old per-frame Array.from(...).sort is gone from the CODE",
            !/Array\.from\((?:idx|this\._sortIdx|sortable)\)[\s\S]{0,80}\.sort\(/.test(code) &&
            !/\.sort\(\(a, b\) =>/.test(code));
        ok("      and the old line is still QUOTED in the comment that explains why it went",
            /Array\.from\(idx\)\.sort/.test(src));
    }
    // The two corrections, asserted as quoted-and-marked rather than merely absent -- v4263's lesson.
    const flat = (t) => t.replace(/^\s*\/\/ ?/gm, "").replace(/\s+/g, " ");
    ok("*** engine/: 'radix-style' was a false description of a comparison sort, and says so ***",
        /USED TO SAY THE CPU SORT WAS "radix-style" AND IT WAS NOT/.test(flat(eng)) &&
        /it genuinely is a radix sort/.test(flat(eng)));
    ok("*** render/: the header claimed >500K interactively while its own sort comment said 32K ***",
        /TRUE ONLY SINCE v4264/.test(flat(ren)) && /3\.7 fps/.test(flat(ren)) &&
        /the claim was simply false/.test(flat(ren)));
    ok("  and the honest inline comment's number is preserved rather than deleted",
        /for typical N=32K it's fine/.test(flat(ren)) || /"for typical N=32K it's fine/.test(flat(ren)));
    report("the file disagreed with ITSELF -- the header optimistic, the comment beside the code honest. " +
        "The measurement settled which half was wrong, and the code now makes the header true.");
}

// =============================================================================================================
// SABOTAGE LOG -- each applied to a working tree, confirmed present with grep -c before the run was read,
// and restored md5-identical afterwards. Counts are what the runs printed, including where I predicted wrong.
//
//   A  floatKeyToUint stops special-casing negatives (returns b ^ 0x80000000 always).
//      -> 5 RED across sections 1 and 2, with 12,409 of 200,000 random pairs mis-ordered. Positives still
//      sort correctly, so a scene entirely in front of the camera would look FINE -- which is why section 1
//      sweeps the whole float range rather than trusting a handful of positive probes.
//
//   B  the second radix pass dropped (shift <= 0), so only the low 16 bits are sorted.
//      -> 3 RED. The output is still a permutation and still LOOKS plausible; it is simply wrong above 16
//      bits. Only the index-for-index comparison against the old sort catches that.
//
//   C  the final scatter pass walked the input backwards, intended as an instability sabotage.
//      -> 2 RED, and *** NOT THE ONES I PREDICTED. *** I expected it to break ties only and land on the
//      flat-wall check. It broke the ORDER outright -- 47,926 inversions in 50,000 -- because reversing the
//      walk while the counters still march forward is not "unstable", it is a different algorithm. The
//      recorded result is what ran; the ties check remains worth having and this sabotage is not what
//      exercises it.
//
//   D  the scratch allocated inside radixSortIndices instead of being the caller's.
//      -> *** 0 RED ON THE FIRST WRITING, AND IT IS THE ONE I HAD NAMED "the sabotage that would ship". ***
//      A timing assertion cannot see it: even with a fresh 65,537-entry histogram per call the radix sort is
//      still far inside the frame budget, so the clock says fine while every frame allocates. Speed was the
//      wrong instrument for an allocation claim. Section 3 now fills the caller's scratch with a sentinel and
//      asserts the function WROTE INTO IT, with a control that the probe can still read "untouched". 1 RED.
//
//   E  the corrected header in render/SplatRenderer.js reverted to the bare ">500K interactively" claim.
//      -> 1 RED in section 5. Small, and it is the sentence a reader trusts before they measure anything.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE PICTURE. Nothing in this gate renders a splat -- it asserts that the new " +
    "sort returns the same permutation as the old one, which makes the RENDER unchanged by construction, but " +
    "no frame was drawn and no WebGL context was created. The timings are Node on this sandbox's CPU, best " +
    "of two or three runs, and a browser's JIT may differ; the RATIO is the durable claim and the absolute " +
    "milliseconds are not. The 500K figure is also a synthetic key distribution -- uniform random depths -- " +
    "and a real splat cloud is clustered, which changes a radix sort's memory behaviour but not its work. " +
    "And the odd-even refusal is priced in COMPARE-EXCHANGES, an operation count and not a measurement: " +
    "nothing here ran that shader, on the same principle as v4262 -- the shape is wrong, and how good the " +
    "implementation is remains unmeasured.");
process.exit(fails ? 1 : 0);
