#!/usr/bin/env node
// tools/ship/procBrush-selfcheck.mjs -- v4216
//
// Run: node tools/ship/procBrush-selfcheck.mjs      (pure, no canvas)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES fx/procBrush.mjs.
//
// *** MEASURED: THE TREE HAD NO DRAWING SURFACE AT ALL *** -- no painting page, no brush, no stroke model.
//
// LICENCE FIRST, BECAUSE IT DECIDED HOW THIS WAS BUILT. mrdoob/harmony is GPL-3.0. REACHED, NOT CAPTURED. For
// the MIT projects this tree has borrowed from -- sileo, animatelo, frame.js -- reading the source and writing
// fresh is fine and was done; v4215 read frame.js's Frame.js directly. Under GPL-3.0 that is not the same act,
// so *** harmony's SOURCE WAS DELIBERATELY NOT READ *** and what is implemented is the publicly-described
// technique: a brush that draws RELATIONSHIPS between the points already in a stroke rather than stamping a
// dab at each one. Section 6 asserts the module carries that reasoning, because a licence decision nobody can
// find later is a licence decision that gets quietly reversed.
//
// Three traps carry the measurements. Each makes a drawing that looks WRONG rather than one that errors, and
// all three are worst in exactly the same place: where the hand slows down and the points bunch up.
import {
    DEFAULTS, BRUSHES, NAMES, dedupe, neighboursOf, linkSegments, strokeSegments, costOf, naiveCost,
    accumulatedAlpha, StrokeIndex,
} from "../../fx/procBrush.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("procBrush-selfcheck -- brushes that draw relationships, and the three ways that goes wrong\n");

/** A straight drag: evenly spaced, which is what a steady hand produces. */
const line = (n, step = 4) => Array.from({ length: n }, (_, i) => ({ x: i * step, y: 100, t: i * 16 }));
/** A stroke that STOPS: the pointer keeps firing while the hand is still. This is the pathological case. */
const stalled = (moving, still) => [
    ...Array.from({ length: moving }, (_, i) => ({ x: i * 4, y: 100, t: i * 16 })),
    ...Array.from({ length: still }, (_, i) => ({ x: moving * 4, y: 100, t: (moving + i) * 16 })),
];

// ---- 1. THE STALL, WHICH BREAKS THE OTHER TWO --------------------------------------------------------------
console.log("1. *** TRAP 1: A SLOW HAND PILES POINTS IN ONE PLACE, AND EVERYTHING ELSE FOLLOWS FROM IT ***");
{
    const s = stalled(20, 60);
    ok("the fixture really is degenerate: 60 points in one spot", s.length === 80);
    const d = dedupe(s);
    ok("!! *** deduping drops the pile -- 80 points become 21, because sixty of them are the same place ***",
        d.length === 21, s.length + " -> " + d.length);
    ok("...and it keeps the moving part intact", d.slice(0, 20).every((p, i) => p.x === i * 4));
    ok("an already-spread stroke is untouched by it", dedupe(line(50)).length === 50);
    ok("a single point survives", dedupe([{ x: 0, y: 0, t: 0 }]).length === 1);
    ok("an empty stroke does not throw", dedupe([]).length === 0);
    // The consequence, stated as the number it actually saves.
    const before = costOf(s), after = costOf(d);
    ok("!! and the pile was costing real work: distance tests fall with it",
        after < before / 2, before + " tests -> " + after);
}

// ---- 2. THE SEARCH, AND THE FIX THAT WAS WORSE THAN THE PROBLEM ------------------------------------------
console.log("\n2. *** TRAP 2: ALL-PAIRS NEIGHBOUR SEARCH IS O(n^2) -- AND THE OBVIOUS FIX BROKE THE BRUSH ***");
{
    const n = 5000;
    const s = line(n);
    ok("!! *** all-pairs on a 5,000-point stroke is 12,497,500 distance tests, during a drag ***",
        naiveCost(n) === 12497500 && costOf(s, { index: false }) === 12497500, naiveCost(n).toLocaleString());
    const real = costOf(s);
    ok("!! *** the spatial grid costs 72,400 -- 173x less ***",
        real === 72400, real.toLocaleString() + " vs " + naiveCost(n).toLocaleString());
    // Linearity: doubling the stroke must roughly double the cost.
    const c1 = costOf(line(2000)), c2 = costOf(line(4000));
    ok("!! doubling the stroke roughly DOUBLES the grid cost, where all-pairs quadruples",
        (c2 / c1) > 1.9 && (c2 / c1) < 2.1 && (naiveCost(4000) / naiveCost(2000)) > 3.9,
        "grid " + (c2 / c1).toFixed(3) + "x vs naive " + (naiveCost(4000) / naiveCost(2000)).toFixed(3) + "x");

    // *** THE PART THAT MATTERS MOST, BECAUSE IT IS WHERE MY FIRST ANSWER WAS WRONG. ***
    // A bounded lookback window ALSO cuts the cost -- measured, 475,344 for the same stroke -- and it was
    // written, and it was shipped in the first draft of this file. Then measuring what it DREW showed it had
    // removed the point of the brush: a circle that takes more than the window to come back around gets NO
    // link between its two passes, and links that are far apart in TIME but close in SPACE are exactly what
    // makes this kind of brush look drawn rather than traced.
    const circle = (m, r = 60) => Array.from({ length: m }, (_, i) =>
        ({ x: 200 + r * Math.cos(i / m * 2 * Math.PI), y: 200 + r * Math.sin(i / m * 2 * Math.PI), t: i * 16 }));
    const farLinks = (m) => {
        const pts = dedupe(circle(m));
        const ix = new StrokeIndex(DEFAULTS.radius);
        let far = 0;
        for (let i = 0; i < pts.length; i++) {
            const { found } = neighboursOf(pts, i, { index: ix });
            for (const f of found.slice(0, DEFAULTS.maxLinks)) if (i - f.index > 8) far++;
            ix.add(pts[i], i);
        }
        return far;
    };
    ok("!! *** a circle links its end back to its start -- the SELF-CROSSING link, which a 96-point lookback "
       + "window measured at ZERO for a 160-point circle ***",
        farLinks(160) > 0, farLinks(160) + " far links on a 160-point circle");
    ok("...and it keeps doing so as the stroke gets longer, which is what the window could not",
        farLinks(320) > 0 && farLinks(80) > 0, "80:" + farLinks(80) + " 160:" + farLinks(160) + " 320:" + farLinks(320));

    // The index must never MISS a neighbour the all-pairs search would have found. A 3x3 block of
    // radius-wide cells is a superset by construction, and this asserts it rather than reasoning about it.
    const messy = Array.from({ length: 400 }, (_, i) =>
        ({ x: 200 + 90 * Math.cos(i * 0.37), y: 200 + 90 * Math.sin(i * 0.21), t: i * 16 }));
    const pts = dedupe(messy);
    const ix = new StrokeIndex(DEFAULTS.radius);
    let mismatches = 0;
    for (let i = 0; i < pts.length; i++) {
        const withIx = neighboursOf(pts, i, { index: ix }).found.map((f) => f.index).sort((a, b) => a - b).join(",");
        const without = neighboursOf(pts, i, {}).found.map((f) => f.index).sort((a, b) => a - b).join(",");
        if (withIx !== without) mismatches++;
        ix.add(pts[i], i);
    }
    ok("!! *** the grid finds EXACTLY what all-pairs finds, on a 400-point self-crossing scribble -- a faster "
       + "search that quietly misses neighbours would be the same defect as the window, undetected ***",
        mismatches === 0, mismatches + " points disagreed");
    ok("the first point tests nothing", neighboursOf(line(10), 0, {}).tests === 0);
}

// ---- 3. THE BLACK BLOB -------------------------------------------------------------------------------------
console.log("\n3. *** TRAP 3: LINKING TO EVERY NEIGHBOUR TURNS A DENSE AREA SOLID ***");
{
    // The arithmetic, first -- this is why the cap exists at all.
    ok("!! at alpha 0.12, EIGHT overlapping links already reach 0.64 opacity",
        Math.abs(accumulatedAlpha(0.12, 8) - 0.6404) < 0.0005, accumulatedAlpha(0.12, 8).toFixed(4));
    ok("!! ...and twenty reach 0.92 -- which on a page is black, in exactly the spot the hand slowed down",
        accumulatedAlpha(0.12, 20) > 0.92, accumulatedAlpha(0.12, 20).toFixed(4));

    // A tight cluster: many points inside one radius.
    const cluster = Array.from({ length: 60 }, (_, i) => ({ x: 100 + (i % 8) * 2, y: 100 + Math.floor(i / 8) * 2, t: i * 16 }));
    const segs = linkSegments(cluster, 59, {});
    ok("!! *** the link count is CAPPED, so a 40-neighbour cluster draws maxLinks lines and not forty ***",
        segs.length === DEFAULTS.maxLinks, segs.length + " links");
    ok("...and every link is fainter than the base alpha, because density divides it down",
        segs.every((s) => s.alpha < DEFAULTS.alpha));

    // BOTH guards are needed, and this is the check that shows the second one does something the cap does not.
    const sparse = [{ x: 0, y: 0, t: 0 }, { x: 5, y: 0, t: 16 }, { x: 10, y: 0, t: 32 }];
    const sparseSegs = linkSegments(sparse, 2, {});
    const denseAlpha = segs[0].alpha, sparseAlpha = sparseSegs[0].alpha;
    ok("!! *** a DENSE region draws fainter lines than a sparse one even though both are capped at the same "
       + "count -- the cap alone would make every crowded area identical ***",
        denseAlpha < sparseAlpha, "dense " + denseAlpha.toFixed(4) + " vs sparse " + sparseAlpha.toFixed(4));
    ok("a point with no neighbours in range draws nothing rather than a zero-length segment",
        linkSegments([{ x: 0, y: 0, t: 0 }, { x: 9999, y: 9999, t: 16 }], 1, {}).length === 0);
    ok("the first point of a stroke draws no links", linkSegments(line(10), 0, {}).length === 0);
}

// ---- 4. THE BRUSHES DIFFER, AND EACH IN THE WAY IT CLAIMS ---------------------------------------------------
console.log("\n4. each brush is actually a different brush, not the same one renamed");
{
    ok("there are several", NAMES.length >= 5, NAMES.join(","));
    const s = line(40);
    const out = {};
    for (const b of NAMES) out[b] = strokeSegments(s, b, {});
    ok("every brush produces segments on a real stroke", NAMES.every((b) => out[b].length > 0));

    ok("!! `line` is the control: exactly one segment per point after the first",
        out.line.length === s.length - 1, out.line.length);
    ok("!! the relational brushes produce MANY more -- that is the whole difference",
        out.sketchy.length > out.line.length * 2, out.sketchy.length + " vs " + out.line.length);

    // fur must OVERSHOOT: its endpoints go past the neighbour, so its bounding box exceeds sketchy's.
    const span = (segs) => { let mn = Infinity, mx = -Infinity; for (const g of segs) { mn = Math.min(mn, g.x1, g.x2); mx = Math.max(mx, g.x1, g.x2); } return mx - mn; };
    ok("!! *** fur reaches FURTHER than sketchy from the same points -- it overshoots the neighbour, which is "
       + "what makes it bristle rather than hatch ***",
        span(out.fur) > span(out.sketchy), span(out.fur).toFixed(1) + " vs " + span(out.sketchy).toFixed(1));

    // shaded must vary alpha with distance; sketchy must not.
    const alphas = (segs) => new Set(segs.map((g) => g.alpha.toFixed(6)));
    ok("!! shaded varies its opacity with distance -- more than one alpha value across a stroke",
        alphas(out.shaded).size > 1, alphas(out.shaded).size + " distinct alphas");
    ok("!! ...and its nearest link is stronger than its furthest, which is the direction that makes it tone",
        (() => { const g = BRUSHES.shaded(line(40), 20, {}); return g[0].alpha > g[g.length - 1].alpha; })());

    // ribbon must respond to SPEED -- the only brush that reads the timestamps.
    const slow = [{ x: 0, y: 0, t: 0 }, { x: 1, y: 0, t: 100 }];
    const fast = [{ x: 0, y: 0, t: 0 }, { x: 60, y: 0, t: 16 }];
    ok("!! *** ribbon is THINNER when the stroke is fast -- the one brush that uses t, which is why points "
       + "carry a timestamp at all ***",
        BRUSHES.ribbon(fast, 1, {})[0].width < BRUSHES.ribbon(slow, 1, {})[0].width,
        "fast " + BRUSHES.ribbon(fast, 1, {})[0].width.toFixed(2) + " vs slow " + BRUSHES.ribbon(slow, 1, {})[0].width.toFixed(2));
    ok("...and a zero time delta does not divide by zero", Number.isFinite(BRUSHES.ribbon(
        [{ x: 0, y: 0, t: 5 }, { x: 3, y: 0, t: 5 }], 1, {})[0].width));
}

// ---- 5. DETERMINISM, WHICH REPLAY DEPENDS ON ---------------------------------------------------------------
console.log("\n5. the same stroke gives the same mark, and drawing it live equals replaying it");
{
    const s = line(60);
    ok("!! strokeSegments is deterministic -- no randomness, so a saved stroke replays identically",
        JSON.stringify(strokeSegments(s, "sketchy", {})) === JSON.stringify(strokeSegments(s, "sketchy", {})));
    // Incremental (live) vs whole-stroke (replay) must agree, or a drawing changes when you reload it.
    const pts = dedupe(s);
    const incremental = [];
    for (let i = 0; i < pts.length; i++) incremental.push(...BRUSHES.sketchy(pts, i, {}));
    ok("!! *** drawing point-by-point gives byte-identical output to rendering the whole stroke at once -- "
       + "otherwise a picture would change the moment it was reloaded ***",
        JSON.stringify(incremental) === JSON.stringify(strokeSegments(s, "sketchy", {})));
    ok("an unknown brush name returns nothing rather than a default mark", strokeSegments(s, "nope", {}).length === 0);
    ok("an empty stroke gives no segments", strokeSegments([], "sketchy", {}).length === 0);
    ok("every segment is finite -- no NaN reaches a canvas",
        strokeSegments(s, "shaded", {}).every((g) => [g.x1, g.y1, g.x2, g.y2, g.alpha, g.width].every(Number.isFinite)));
}

// ---- 6. THE LICENCE DECISION IS WRITTEN DOWN WHERE IT WILL BE FOUND -----------------------------------------
console.log("\n6. *** the GPL reasoning is IN the module, because a decision nobody can find gets reversed ***");
{
    const src = fs.readFileSync(path.join(ROOT, "fx", "procBrush.mjs"), "utf8");
    ok("!! the module names harmony's licence", /GPL-3\.0/.test(src));
    ok("!! *** and records that the source was deliberately NOT read, which is the whole difference between "
       + "this and how v4215 took frame.js ***", /NOT READ|not read/.test(src));
    ok("it states the posture this tree uses for copyleft", /REACHED, NOT CAPTURED/i.test(src));
    // And it must not have quietly become a vendored copy.
    ok("no harmony attribution or copyright line was pasted in", !/mrdoob\s*\/\s*harmony['"]/.test(src) && !/Copyright.*harmony/i.test(src));
}

console.log("\nprocBrush-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
