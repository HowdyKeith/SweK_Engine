#!/usr/bin/env node
// tools/ship/polyBrush-selfcheck.mjs -- v4421
//
// Run: node tools/ship/polyBrush-selfcheck.mjs      (pure: no GL, no canvas, no model, no network)
//
// *** THE FIFTH PRIMITIVE, AND THE FILL RULE THAT WAS NEVER A CHOICE. ***
//
// fx/primitiveFit.mjs has placed four shapes since v4220. v4419 measured that a kind outside that list
// rasterised BIT-IDENTICALLY to an ellipse and made it refuse instead. This adds `polygon` -- an arbitrary
// closed outline -- and it is the first added kind that costs the fitter nothing structurally: a polygon is a
// filled region with ONE free colour, so optimalColour applies unchanged, and its coverage is spans, so
// differenceChange does too. (Doom fire breaks both; procBrush's segments accumulate at alpha 0.12, which is
// a different compositing model rather than a different shape.)
//
// ---- WHAT HAD TO CHANGE, AND THE MEASUREMENT THAT MADE IT SAFE -------------------------------------------------
//
// spansOf's polygon path took the MIN and MAX crossing on each scanline and filled between them. For a
// triangle or a rectangle that is exactly right -- a convex shape meets a horizontal line exactly twice -- and
// for a concave one it FILLS THE NOTCHES. A five-pointed star came out 18.2% too big, silently. Pairing every
// crossing instead is SVG's `fill-rule: evenodd`, AND THE CHANGE IS SAFE BECAUSE THE THREE EXISTING POLYGON
// KINDS ARE CONVEX: the two rules are bit-identical over 3000 random triangles, rects and rotatedRects, and
// bit-identical to the shipped function, which section 1 measures rather than argues.
//
// ---- THE PART THAT BIT, AND AN UNRELATED GATE IS WHAT CAUGHT IT --------------------------------------------------
//
// *** ADDING "polygon" TO KINDS SILENTLY CHANGED THE SEARCH DISTRIBUTION FOR EVERY EXISTING CALLER. ***
// randomShape() cannot invent a polygon and returns an ELLIPSE for a kind it does not know, so fitStep's
// proposer began drawing ellipses two times in five instead of one in four. Nothing threw. krbnPaint-selfcheck
// went red on a rank-overlap check about something else entirely. ONE FROZEN LIST WAS ANSWERING TWO QUESTIONS
// -- "can this be rasterised" and "can the search invent one" -- and they are now KINDS and SEARCH_KINDS.
//
// ---- AND THE BRUSH LOSES ON ITS OWN HOME GROUND, WHICH IS THE ROUND ----------------------------------------------
//
// Section 4 builds a target OUT OF four glyphs. Five shapes -- a background rectangle and those four glyphs,
// with their own colours -- reproduce it EXACTLY, 0.00000000 at every seed. The fitter given FORTY glyph
// proposals reaches 0.082 to 0.104, and rotated rectangles beat it on the same picture at matched coverage
// (6.8% against 6.5% per proposal) and at four times the search budget.
//
// *** A PRIMITIVE THAT RESEMBLES THE SUBJECT IS NOT THE SAME AS ONE THAT FITS IT. *** A rectangle adapts its
// outline to whatever the residual is; a glyph can only be moved, scaled and turned. Under greedy
// least-squares, flexibility beats resemblance -- and the answer was inside the glyph brush's reach the whole
// time.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
    KINDS, SEARCH_KINDS, fit, spansOf, pointsOf, areaOf, randomShape, mulberry32, blank, drawShape,
    optimalColour, averageColour, difference, distanceOf,
} from "../../fx/primitiveFit.mjs";
import { startDistanceOf } from "../../fx/paintTargets.mjs";
import {
    convexSpans, evenOddSpans, nonZeroSpans, pixelSet, crossingsAt, signedArea, isConvex, fitInto, glyphPolygon,
    glyphMorph, glyphShape, randomGlyph, mutateGlyph, starPolygon, glyphTargetPlan, paintPlan,
} from "../../fx/polyBrush.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 64, H = 64, SEEDS = [1, 2, 3, 4];
const GLYPH_FIT = { propose: (w, h, r) => randomGlyph(w, h, r), mutate: (s, w, h, r) => mutateGlyph(s, w, h, r) };
const D = (t, c) => distanceOf(difference(t, c), W * H);

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE FILL RULE WAS NEVER A CHOICE, AND CHANGING IT IS SAFE BECAUSE THE OLD KINDS ARE CONVEX ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rng = mulberry32(11), rng2 = mulberry32(11);
    let same = 0, shipped = 0, n = 0;
    for (let i = 0; i < 3000; i++) {
        const k = ["triangle", "rect", "rotatedRect"][i % 3];
        const s = randomShape(k, W, H, rng), pts = pointsOf(s);
        if (JSON.stringify(convexSpans(pts, W, H)) === JSON.stringify(evenOddSpans(pts, W, H))) same++;
        const s2 = randomShape(k, W, H, rng2);
        if (JSON.stringify(spansOf(s2, W, H)) === JSON.stringify(evenOddSpans(pointsOf(s2), W, H))) shipped++;
        n++;
    }
    report(`3000 random triangles, rects and rotatedRects: even-odd agrees with the old min/max rule on ${same}, and with the SHIPPED spansOf on ${shipped}`);
    ok("!! *** THE TWO FILL RULES ARE BIT-IDENTICAL ON EVERY CONVEX KIND, WHICH IS WHY THE CHANGE IS SAFE ***",
       same === n && shipped === n,
       `A convex shape meets a horizontal line EXACTLY TWICE, so pairing the sorted crossings IS taking the min and the max. That is the whole safety argument and it is a measurement rather than a sentence -- 3000 of 3000, by string equality on the span lists, against BOTH the extracted old rule and the function as it now ships.`);

    const star = starPolygon();
    const c = pixelSet(convexSpans(star, W, H), W), e = pixelSet(evenOddSpans(star, W, H), W);
    let notch = 0;
    for (const v of c) if (!e.has(v)) notch++;
    report(`a five-pointed star from ui/svgPath.mjs: ${star.length} points, convex ${isConvex(star)}; min/max paints ${c.size} pixels, even-odd ${e.size}`);
    ok("!! ...and on a CONCAVE outline the old rule fills the notches -- a star came out 18% too big",
       !isConvex(star) && notch > 0.1 * c.size && e.size < c.size,
       `${notch} pixels (${(100 * notch / c.size).toFixed(1)}% of what it painted) are the five notches between the points. THE OLD RULE DRAWS THE SHAPE'S ROW-WISE CONVEX HULL, and nothing in the module said so -- it was correct for every kind it had and would have been silently wrong for the first one it did not.`);

    // *** THE HALF-OPEN CROSSING TEST, ON A FIXTURE BUILT TO EXERCISE IT -- A SABOTAGE WENT 0 RED WITHOUT ONE.
    // *** Across all ten glyphs and the star, only 4 vertices of 651 land exactly on a scanline, so the random
    // fixtures never test what happens there. This U has EVERY vertex on one, including a horizontal edge
    // lying along y = 10.5.
    const U = [[10, 10.5], [30, 10.5], [30, 20.5], [20, 20.5], [20, 15.5], [15, 15.5], [15, 20.5], [10, 20.5]];
    const notchXs = crossingsAt(U, 15.5), top = crossingsAt(U, 10.5);
    const uE = pixelSet(evenOddSpans(U, W, H), W), uC = pixelSet(convexSpans(U, W, H), W);
    report(`a U with every vertex on a scanline: crossings at y=15.5 are ${JSON.stringify(notchXs)}, at y=10.5 (a horizontal edge ON the line) ${JSON.stringify(top)}; even-odd paints ${uE.size} px, min/max ${uC.size}`);
    ok("!! a vertex ON the scanline counts ONCE and a horizontal edge along it counts NOT AT ALL",
       notchXs.length === 4 && top.length === 2 && uE.size < uC.size,
       `*** THAT IS WHAT THE HALF-OPEN TEST BUYS AND IT IS THE WHOLE REASON AN EVEN-ODD PAIRING IS WELL DEFINED. *** At y=15.5 the four crossings pair as (10,15) and (20,30), leaving the notch empty; at y=10.5 the horizontal edge contributes nothing because both its endpoints sit ON the line, and the two verticals contribute once each. Count either of those twice and the pairing shifts by one and fills the wrong side. Only 4 vertices of 651 across the glyphs and the star land on a scanline at all, SO NO RANDOM FIXTURE TESTS THIS -- a sabotage of the test went 0 RED until this U existed.`);

    const rows = [6, 9].map((d) => {
        const g = fitInto(glyphPolygon(d), 6, 6, 52, 52);
        const ee = pixelSet(evenOddSpans(g, W, H), W), nz = pixelSet(nonZeroSpans(g, W, H), W);
        let diff = 0;
        for (const v of ee) if (!nz.has(v)) diff++;
        for (const v of nz) if (!ee.has(v)) diff++;
        return { d, ee: ee.size, nz: nz.size, diff };
    });
    for (const r of rows) report(`digit ${r.d}: even-odd ${r.ee} pixels, nonzero ${r.nz}, differing ${r.diff}`);
    ok("!! and SVG's OTHER rule is named rather than left unstated -- it differs on the tree's own glyphs",
       rows.every((r) => r.diff > 20 && r.nz > r.ee),
       `${rows.map((r) => `${r.diff} px at digit ${r.d}`).join(", ")}. The 'nonzero' rule counts winding and so FILLS the overlap of a self-crossing outline where evenodd leaves it empty. Digits 6 and 9 have exactly that loop. EVENODD IS WHAT IS IMPLEMENTED; nonZeroSpans exists in the module to measure the gap and is called by nothing else, so the choice is recorded with a number beside it instead of being a default nobody noticed.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** KINDS WAS ANSWERING TWO QUESTIONS, AND AN UNRELATED GATE IS WHAT CAUGHT IT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    report(`KINDS = ${KINDS.join(", ")}   |   SEARCH_KINDS = ${SEARCH_KINDS.join(", ")}`);
    ok("!! *** THE RASTERISABLE SET AND THE INVENTABLE SET ARE NOW TWO LISTS, BECAUSE THEY ARE TWO QUESTIONS ***",
       KINDS.includes("polygon") && !SEARCH_KINDS.includes("polygon") && SEARCH_KINDS.every((k) => KINDS.includes(k)),
       `*** randomShape() CANNOT INVENT A POLYGON -- an outline has to come from somewhere -- AND IT RETURNS AN ELLIPSE FOR A KIND IT DOES NOT KNOW. *** So the moment "polygon" joined a single KINDS list, fitStep's default proposer began drawing ellipses two times in five instead of one in four, shifting the rng stream and moving numbers in krbnPaint-selfcheck, which is about something else entirely. NOTHING THREW. A frozen list that answers "can this be rasterised" is not the list that answers "can the search make one", and they were the same set for exactly as long as there were four kinds.`);

    ok("...and randomShape still cannot produce one, which is what makes the split necessary rather than tidy",
       (() => { const r = mulberry32(3); for (let i = 0; i < 200; i++) if (randomShape("polygon", W, H, r).kind !== "ellipse") return false; return true; })(),
       "200 draws, every one an ellipse. THE FALL-THROUGH IS STILL THERE INSIDE randomShape and it is harmless there -- nothing asks it for a kind it does not have, now that the proposer draws from SEARCH_KINDS. v4419 closed the same fall-through in spansOf, where it was NOT harmless.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE POLYGON COSTS THE FITTER NOTHING, AND IT IS A COMPARABLE TOOL
 * --------------------------------------------------------------------------------------------------------- */
{
    const r1 = mulberry32(5), r2 = mulberry32(5);
    let ga = 0, ra = 0, empty = 0;
    for (let i = 0; i < 2000; i++) {
        const g = randomGlyph(W, H, r1), a = areaOf(spansOf(g, W, H));
        ga += a; if (a === 0) empty++;
        ra += areaOf(spansOf(randomShape("rotatedRect", W, H, r2), W, H));
    }
    report(`mean covered area per proposal: glyph ${(ga / 2000).toFixed(1)} px (${(100 * ga / 2000 / (W * H)).toFixed(1)}%), rotatedRect ${(ra / 2000).toFixed(1)} px (${(100 * ra / 2000 / (W * H)).toFixed(1)}%); glyph proposals covering nothing: ${empty} of 2000`);
    ok("!! the two primitives are the same SIZE of tool, which is what makes section 5 a fair comparison",
       Math.abs(ga - ra) / ra < 0.15 && empty === 0,
       `${(100 * ga / 2000 / (W * H)).toFixed(1)}% against ${(100 * ra / 2000 / (W * H)).toFixed(1)}%. *** THE OBVIOUS EXPLANATION FOR A LOSS WOULD BE "THE GLYPH IS A SMALLER BRUSH", AND IT IS NOT. *** The tree's digit outlines fill 31% to 81% of their own box, so they are blobs rather than thin loops, and none of 2000 proposals landed empty.`);

    const T = paintPlan(glyphTargetPlan(W, H, 1), W, H);
    const one = fit(T, { shapes: 1, seed: 7, ...GLYPH_FIT });
    ok("...and the shipped colour solver and score need no change at all to take one",
       one.shapes.length === 1 && one.shapes[0].kind === "polygon" && one.shapes[0].colour.length === 3 && one.distance < startDistanceOf(T),
       `one placed polygon, coloured ${one.shapes[0].colour.map((v) => v.toFixed(0)).join(",")} by optimalColour and scored by differenceChange, NEITHER OF WHICH KNOWS WHAT KIND IT IS. That is the whole claim of "costs nothing structurally" and it is asserted on the objects rather than on the diff.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** FIVE SHAPES REPRODUCE THE PICTURE EXACTLY, AND THE SOLVED COLOUR ON THOSE SAME FIVE DOES NOT ***
 * --------------------------------------------------------------------------------------------------------- */
const WITNESS = {};
{
    for (const seed of SEEDS) {
        const plan = glyphTargetPlan(W, H, seed), T = paintPlan(plan, W, H);
        const bgRect = { kind: "rect", x: 0, y: 0, w: W, h: H };
        const trueC = blank(W, H, averageColour(T));
        drawShape(trueC, spansOf(bgRect, W, H), plan.bg, 1);
        for (const { shape, colour } of plan.shapes) drawShape(trueC, spansOf(shape, W, H), colour, 1);
        const lsq = blank(W, H, averageColour(T));
        for (const sh of [bgRect, ...plan.shapes.map((s) => s.shape)]) {
            const sp = spansOf(sh, W, H);
            if (sp.length) drawShape(lsq, sp, optimalColour(T, lsq, sp, 1), 1);
        }
        WITNESS[seed] = { T, start: startDistanceOf(T), trueD: D(T, trueC), lsqD: D(T, lsq),
                          fitted: fit(T, { shapes: 40, seed: 7, alpha: 1, ...GLYPH_FIT }).distance };
    }
    for (const s of SEEDS) report(`seed ${s}: start ${WITNESS[s].start.toFixed(5)} | five shapes with their TRUE colours ${WITNESS[s].trueD.toFixed(8)} | the same five, LEAST-SQUARES colours ${WITNESS[s].lsqD.toFixed(6)} | the fitter with forty glyph proposals ${WITNESS[s].fitted.toFixed(6)}`);

    ok("!! *** A BACKGROUND RECTANGLE AND FOUR GLYPHS REPRODUCE THE PICTURE EXACTLY -- ZERO, NOT SMALL ***",
       SEEDS.every((s) => WITNESS[s].trueD === 0),
       `0.00000000 at every seed, by === on the distance. The target IS those four glyphs on that background, so the answer is inside the brush's reach and there is nothing approximate about it. THAT IS WHAT MAKES THE NEXT TWO NUMBERS MEAN SOMETHING.`);

    ok("!! *** AND THE EXACT LEAST-SQUARES COLOUR ON THOSE EXACT SHAPES GIVES 0.10, NOT 0 ***",
       SEEDS.every((s) => WITNESS[s].lsqD > 0.08),
       `${SEEDS.map((s) => WITNESS[s].lsqD.toFixed(3)).join(", ")} against 0 for the true colours. *** v4417 FOUND THE SOLVER 33% WORSE THAN THE TRUE COLOURS ON AN OCCLUDED SHAPE. HERE IT IS THE DIFFERENCE BETWEEN EXACT AND NOT AT ALL, *** because at alpha 1 an under-shape loses its pixels ENTIRELY and its least-squares colour is averaged over pixels the finished picture never shows. The colour is optimal for each shape at the moment it is drawn and the per-shape optimum is not on the path to the picture.`);

    ok("!! ...and forty proposals do not reach what five shapes could",
       SEEDS.every((s) => WITNESS[s].fitted > WITNESS[s].trueD + 0.05),
       `${SEEDS.map((s) => WITNESS[s].fitted.toFixed(3)).join(", ")} from forty glyph placements, against 0 from five. EIGHT TIMES THE BUDGET, IN THE RIGHT PRIMITIVE, ON A PICTURE MADE OF THAT PRIMITIVE. v4417 measured the same gap at a factor of two on flat regions; on a glyph the search cannot close it at all.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THE MUST-MATTER FAILS, AND IT IS CONTROLLED ON BOTH SIDES ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = SEEDS.map((seed) => {
        const T = WITNESS[seed].T;
        return { seed,
            rect60: fit(T, { shapes: 40, seed: 7 }).distance,
            glyph60: fit(T, { shapes: 40, seed: 7, ...GLYPH_FIT }).distance,
            rect240: fit(T, { shapes: 40, seed: 7, candidates: 240, mutations: 120 }).distance,
            glyph240: fit(T, { shapes: 40, seed: 7, candidates: 240, mutations: 120, ...GLYPH_FIT }).distance };
    });
    for (const r of rows) report(`seed ${r.seed}: rects ${r.rect60.toFixed(6)} / glyphs ${r.glyph60.toFixed(6)} at 60 candidates; ${r.rect240.toFixed(6)} / ${r.glyph240.toFixed(6)} at 240`);
    ok("!! *** ON A PICTURE MADE OF GLYPHS, GLYPHS LOSE TO ROTATED RECTANGLES ***",
       rows.every((r) => r.glyph60 > r.rect60) && rows.filter((r) => r.glyph240 > r.rect240).length >= 3,
       `at every seed at 60 candidates, and ${rows.filter((r) => r.glyph240 > r.rect240).length} of ${rows.length} at 240. *** BOTH OBVIOUS EXPLANATIONS ARE RULED OUT: *** section 3 measured the two tools the same size (6.8% against 6.5% of the canvas per proposal), and quadrupling the search budget helps BOTH and does not change the order. A PRIMITIVE THAT RESEMBLES THE SUBJECT IS NOT THE SAME AS ONE THAT FITS IT -- a rectangle adapts its outline to whatever the residual is, a glyph can only be moved, scaled and turned, and under greedy least-squares flexibility beats resemblance.`);

    const T1 = WITNESS[SEEDS[0]].T;
    const muts = [0, 10, 30].map((m) => ({ m, d: fit(T1, { shapes: 40, seed: 7, mutations: m, ...GLYPH_FIT }).distance }));
    report(`glyph fit with mutations 0 / 10 / 30: ${muts.map((x) => x.d.toFixed(6)).join(" / ")}`);
    ok("!! the glyph MUTATOR is load-bearing -- turning it off costs 9%",
       muts.every((x, i) => i === 0 || x.d < muts[i - 1].d) && muts[0].d > muts[2].d * 1.05,
       `${(100 * (1 - muts[2].d / muts[0].d)).toFixed(1)}% better with the hill climb than without, monotone in the budget. *** A SABOTAGE THAT MADE mutateGlyph RETURN GARBAGE POINTS WENT 0 RED: *** fitStep scores every mutant and a nonsense polygon covers nothing, so it is simply rejected and the fit falls back to its best random candidate -- silently worse, and every check here was an inequality against rectangles that glyphs already lose. NOTHING ASSERTED THAT MUTATION HELPS until this did.`);

    ok("...and more search helps both, which is what says the ordering is about the primitive",
       rows.every((r) => r.rect240 < r.rect60) && rows.filter((r) => r.glyph240 < r.glyph60).length >= 3,
       `rects improve at every seed and glyphs at ${rows.filter((r) => r.glyph240 < r.glyph60).length} of ${rows.length} when the budget goes up four times. IF ONLY ONE HAD IMPROVED, the comparison would have been about which primitive the budget suited rather than about the primitives.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. *** THE SHAPE PARAMETER NO OTHER PRIMITIVE HAS, AND THE TOPOLOGY IT WALKS THROUGH ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const ts = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1];
    const rows = ts.map((t) => {
        const g = fitInto(glyphMorph(0, 8, t), 6, 6, 52, 52);
        return { t, area: Math.abs(signedArea(g)), px: pixelSet(evenOddSpans(g, W, H), W).size };
    });
    for (const r of rows) report(`morph 0 -> 8 at t = ${r.t}: shoelace area ${r.area.toFixed(1).padStart(7)}, painted pixels ${String(r.px).padStart(4)}`);
    ok("!! *** THE AREA FALLS THROUGHOUT AND THE PAINTED REGION DIPS AND COMES BACK -- THAT IS THE FIGURE-EIGHT ***",
       rows.every((r, i) => i === 0 || r.area < rows[i - 1].area) &&
       rows[3].px < rows[0].px && rows[6].px > rows[3].px * 1.2,
       `area ${rows[0].area.toFixed(0)} -> ${rows[6].area.toFixed(0)}, MONOTONE; pixels ${rows.map((r) => r.px).join(" -> ")}, which falls to ${rows[3].px} and returns to ${rows[6].px}. *** THE SHOELACE CANCELS WHEN THE OUTLINE CROSSES ITSELF AND THE PAINT DOES NOT, *** so the two measures diverge exactly where digit 8's two lobes start winding opposite ways. A brush parameter that changes the TOPOLOGY of the mark, not just its coordinates -- and no other kind in KINDS has one.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. DISCIPLINE
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ENG, "fx", "polyBrush.mjs"), "utf8");
    ok("the brush owns no search, no colour solver and no glyph data of its own",
       !/function\s+(fitStep|optimalColour|differenceChange)\b|DIGIT_STROKES\s*=/.test(src) &&
       /from "\.\.\/physics\/mesh\/strokeMorph\.mjs"/.test(src) && /from "\.\.\/ui\/svgPath\.mjs"/.test(src),
       "The ten glyph outlines come from physics/mesh/strokeMorph.mjs and the star from ui/svgPath.mjs's flattener; the fitting is fx/primitiveFit.mjs's. A BRUSH MODULE CARRYING ITS OWN COPY OF THE GLYPHS would drift from the morph they were written for.");

    const fitSrc = fs.readFileSync(path.join(ENG, "fx", "primitiveFit.mjs"), "utf8");
    ok("!! and the search takes its proposer and mutator as ARGUMENTS, so a sixth primitive needs no case in a switch",
       /const propose = o\.propose \|\|/.test(fitSrc) && /const mutate = o\.mutate \|\|/.test(fitSrc),
       "Both default to exactly what fitStep did before. *** mutateShape JITTERS EVERY NUMERIC FIELD, which turns a `points` array into NaN, *** so a polygon could not have been mutated by the existing path however many kinds were added -- the extension point had to be a hook rather than a list.");
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
console.log(`
----  WHAT THIS DOES NOT CLAIM
      THAT THE GLYPH BRUSH IS USELESS. It reaches 0.082 to 0.104 on pictures it has never been tuned
      for, from forty placements, with the shipped solver untouched. What is measured is that it does
      not BEAT a rectangle even where it should be at its strongest, and that both obvious excuses --
      a smaller tool, a starved search -- are ruled out by measurement rather than by argument.

      STILL UNCHECKED: nothing here puts the morph parameter in front of a LEARNER. brain/rl/paintEnv.js
      emits five numbers for a rotatedRect; a polygon brush wants seven, two of which choose a glyph
      and walk between them. Whether a policy can use a topological knob is not measured anywhere.`);
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 5 / 2 / 2 / 1 / 1 / 1 / 3 / 1 by name, and TWO WENT 0 RED FIRST.
 *
 * A. evenOddSpans reverts to the min/max rule.                                                      5 RED
 *    The star, the nonzero comparison, the witness and both search checks. Correctly NOT the bit-identity
 *    check: with both rules the same the two agree everywhere, which is exactly what that check says happens
 *    on convex shapes and would have been a false green if it were the only one.
 *
 * B. spansOf reverts to min/max for polygons, leaving the module's own evenOddSpans correct.        2 RED
 *    The witness stops being exact, because the TARGET is painted with evenOddSpans and the WITNESS is
 *    rasterised through spansOf. *** A TARGET AND A RECONSTRUCTION THAT DISAGREE ABOUT WHAT A SHAPE COVERS
 *    ARE NOT COMPARABLE, and the exact-zero is what notices.
 *
 * C. SEARCH_KINDS gains polygon again -- the bug this round shipped and then caught.                2 RED
 *    The two-lists check, and the glyph-versus-rect comparison, because the "rect" arm starts drawing
 *    polygons randomShape cannot make and hands back ellipses instead.
 *
 * D. crossingsAt loses its half-open test.                                              0 RED, then 1 RED
 *    *** ONLY 4 VERTICES OF 651 ACROSS ALL TEN GLYPHS AND THE STAR LAND EXACTLY ON A SCANLINE, so no random
 *    fixture tests the case the rule exists for. *** The U added in section 1 puts EVERY vertex on one,
 *    including a horizontal edge lying along y = 10.5: with the rule, that edge contributes nothing and each
 *    vertex counts once; without it the pairing shifts by one and fills the wrong side of the notch.
 *
 * E. nonZeroSpans returns the even-odd answer.                                                      1 RED
 *    Only the rule-comparison check, correctly -- nonZeroSpans is called by nothing else, which is the point
 *    of it existing: the rule NOT chosen is measured rather than assumed away.
 *
 * F. mutateGlyph returns garbage points.                                                 0 RED, then 1 RED
 *    *** IT WENT 0 RED BECAUSE fitStep SCORES EVERY MUTANT: *** a nonsense polygon covers nothing, the
 *    candidate is rejected, and the fit quietly falls back to its best random draw. Every check in section 5
 *    was an inequality against rectangles that glyphs already lose, so a silently worse glyph fit passed all
 *    of them. Nothing asserted that mutation HELPS; it now does, and the hill climb is worth 9%.
 *
 * G. paintPlan rasterises the target with the convex rule.                                          3 RED
 *    The same mismatch as B from the other side. Both are caught by the exact-zero rather than by anything
 *    that reads a tolerance.
 *
 * H. glyphShape ignores its rotation.                                                               1 RED
 *    The tool-size check: an unrotated glyph covers a different mean area, and that check is what makes
 *    section 5's comparison fair. It is pleasing that removing a degree of freedom shows up as a SIZE change
 *    rather than as a quality change -- the search simply cannot reach the same placements.
 *
 * *** AND A NOTE ON RUNNING THESE. *** Two of the runs above reported "0 RED" for a gate that had CRASHED on
 * a syntax error and executed no checks at all. The harness now reports a non-zero exit with zero checks as a
 * crash. A SUITE THAT CANNOT TELL "NOTHING FAILED" FROM "NOTHING RAN" measures neither.
 * --------------------------------------------------------------------------------------------------------- */
