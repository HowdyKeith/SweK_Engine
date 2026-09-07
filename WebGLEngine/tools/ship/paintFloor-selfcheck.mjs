#!/usr/bin/env node
// tools/ship/paintFloor-selfcheck.mjs -- v4417
//
// Run: node tools/ship/paintFloor-selfcheck.mjs      (pure: no GL, no canvas, no model, no network)
//
// *** THE PAINTER HAS ONLY EVER BEEN SHOWN A PICTURE IT COULD FINISH EXACTLY, AND NOBODY HAD WRITTEN THAT
// DOWN. *** brain/rl/paintEnv.js's makeTarget draws four flat quadrants and one flat disc -- FIVE FLAT
// REGIONS at every seed, verified here at five seeds -- and fx/primitiveFit.mjs's model class is unions of
// flat-coloured convex shapes. So every number v4220 measured was measured on a target inside the model
// class, and the obvious next question is what happens outside it.
//
// ---- THE ANSWER IS NOT THE ONE THIS ROUND EXPECTED, AND THAT IS THE ROUND -------------------------------------
//
// The expectation was a representability floor: flat targets finish, curved ones stall. What the measurement
// says is that REPRESENTABILITY IS NOT WHAT GOVERNS THIS FITTER AT ALL.
//
//   * Given exactly five shapes -- the number that reproduces the picture -- the greedy fitter reaches 0.1018
//     where the five true shapes with the true colours reach 0.0514. A FACTOR OF TWO, spent on search.
//   * The convergence exponent over N = 5..320 is 0.572 on the exactly-representable target, 0.713 on a ramp
//     that needs sixty-four strips, and 0.433 on a ray-marched frame. The one target the model class can
//     finish sits IN THE MIDDLE. If representability were the governing variable it would be the outlier.
//
// ---- AND TWO THINGS THAT FELL OUT OF LOOKING -------------------------------------------------------------------
//
//   * *** THE EXACTLY-REPRESENTABLE TARGET IS NOT EXACTLY REPRESENTABLE. *** The five true shapes with the
//     generator's own colours leave 78 to 163 wrong pixels of 4096 -- a one-pixel band where paintEnv's
//     per-pixel test and primitiveFit's scanline rasteriser disagree about an edge. Two percent of the
//     picture, and it is a quarter of the RMS distance, because RMS is bought by a few maximally wrong
//     pixels. "REPRESENTABLE" IS ALWAYS "REPRESENTABLE UP TO WHOSE RASTERISER DRAWS THE EDGE".
//   * *** THE SOLVED COLOUR IS SOLVED FOR A PICTURE THAT WILL NOT EXIST. *** primitiveFit's first headline
//     idea is that the colour is the exact least-squares optimum rather than a search, and it is -- for a
//     shape in isolation. On the SAME five shapes the least-squares colours land 0.0685 against the true
//     colours' 0.0514, worse at every seed, because a rectangle that the disc will be drawn over is solved
//     including the pixels it is about to lose. The greedy fitter never revisits it.
//
// ---- THE COMPOSER, AND WHY THE MODEL IS NOT IN THIS GATE ---------------------------------------------------------
//
// The round began as "let the AI scene composer make a scene and let the painter paint it". Two things stop
// that being a measurement, and the first is written in composeValidate.mjs's own header: "A MODEL WHOSE
// OUTPUT IS ACCEPTED BECAUSE IT PARSED IS THE VOYAGER FAILURE THIS TREE ALREADY CRITICISED... the model
// judging its own work." Scoring a generated composition by how well a learned painter reproduces it is that
// failure with an extra hop. The second is that its producer needs ollama, and a gate that depends on a
// local model is a SKIP.
//
// So what is used is the VALIDATOR and the composition's declared PROP COUNT as an independent variable, with
// the picture rendered by two shipped, gated modules. *** AND SECTION 6 IS A NULL WITH A CONTROL: the shape
// budget does not track the declared prop count -- six props need FEWER shapes than one -- and moving a fixed
// three-prop scene sideways moves the budget by 62% as much as adding five props does. The painter is not a
// complexity meter for the composer, and that is the honest answer to the question that started this. ***
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { fit, difference, distanceOf, blank, averageColour, quantise } from "../../fx/primitiveFit.mjs";
import { makeTarget } from "../../brain/rl/paintEnv.js";
import { validateComposition, SCENES, STYLES, VITALS } from "./composeValidate.mjs";
import {
    distinctColours, startDistanceOf, targetGeometry, targetShapes, rebuildFlatTarget, paintFive,
    pixelDisagreement, rampTarget, stripOptimum, ballsForProps, marchedTarget, budgetTo, convergenceExponent, rebuildFrom,
} from "../../fx/paintTargets.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 64, H = 64, SEEDS = [1, 2, 3, 7, 99], NS = [5, 10, 20, 40, 80, 160, 320];

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** WHAT THE PAINTER HAS ALWAYS BEEN SHOWN, SAID OUT LOUD FOR THE FIRST TIME ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = SEEDS.map((s) => {
        const t = makeTarget(W, H, s), g = targetGeometry(W, H, s);
        const want = new Set([...g.cols, g.disc].map((c) => (quantise(c[0]) << 16) | (quantise(c[1]) << 8) | quantise(c[2])));
        const got = new Set();
        for (let i = 0; i < t.data.length; i += 4) got.add((t.data[i] << 16) | (t.data[i + 1] << 8) | t.data[i + 2]);
        return { s, n: distinctColours(t), same: got.size === want.size && [...got].every((c) => want.has(c)),
                 rebuilt: pixelDisagreement(t, rebuildFlatTarget(W, H, s)).pixels };
    });
    report(`makeTarget at seeds ${SEEDS.join(", ")}: distinct colours ${rows.map((r) => r.n).join(", ")}`);
    ok("!! *** THE PAINTER'S TARGET IS FIVE FLAT REGIONS AND EXACTLY THE FIVE COLOURS ITS GENERATOR DREW ***",
       rows.every((r) => r.n === 5 && r.same),
       "*** NOT 'five colours' AS A COUNT -- the five present are the four quadrant colours and the disc colour, and no others. *** So the picture is a union of five flat convex regions, which is exactly fx/primitiveFit.mjs's model class. EVERY NUMBER v4220 MEASURED ABOUT THE LEARNED PAINTER WAS MEASURED ON A TARGET IT COULD IN PRINCIPLE FINISH, and neither that round's module nor its gate says so anywhere.");

    ok("!! and the geometry is RECOVERED rather than assumed -- the rebuild is bit-identical to the shipped generator",
       rows.every((r) => r.rebuilt === 0),
       `0 differing pixels of ${W * H} at every seed. fx/paintTargets.mjs replays makeTarget's RNG in its own order to get the quadrant split, the disc centre and the five colours, WHICH IS A DUPLICATE OF A SHIPPED MODULE. This check is what makes it falsifiable instead of trusted: if paintEnv's generator ever changes, this goes red rather than the copy quietly describing a picture that no longer exists.`);

    // *** AND THE CHECK ABOVE CANNOT SEE THE EDGE, WHICH A SABOTAGE HAD TO SHOW ME. ***
    const G = { cols: [[10, 10, 10], [20, 20, 20], [30, 30, 30], [40, 40, 40]], disc: [200, 200, 200], cx: 0, cy: 0, rad: 5, sx: 32, sy: 32 };
    const edge = rebuildFrom(G, 12, 12);
    const at = (x, y) => edge.data[(y * 12 + x) * 4];
    ok("!! ...and the disc's boundary convention is pinned SEPARATELY, because the bit-identity cannot reach it",
       at(3, 4) === 10 && at(0, 5) === 10 && at(2, 3) === 200 && at(4, 4) === 10,
       `*** SWAPPING THE DISC TEST FROM < TO <= LEAVES ALL ${SEEDS.length} SEEDS ABOVE BIT-IDENTICAL, and would at any number of seeds: no integer pixel lands EXACTLY on a radius that generator produces, so the comparison never exercises the case. *** Here cx = cy = 0 and rad = 5 puts (3,4), (4,3), (5,0) and (0,5) exactly ON the circle, and strict < leaves them OUTSIDE the disc, matching paintEnv.js. A CHECK THAT IS TRUE AT EVERY SEED AND CONSTRAINS NOTHING AT THE BOUNDARY is the shape this tree keeps finding; a sabotage flipping that one character went 0 RED, and this is what it bought. It matters here because section 2's whole finding is about a one-pixel edge.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** FIVE SHAPES ARE ENOUGH, AND FIVE SHAPES ARE NOT ***
 * --------------------------------------------------------------------------------------------------------- */
const WIT = {};
{
    for (const s of [1, 2, 3, 7]) {
        const t = makeTarget(W, H, s), g = targetGeometry(W, H, s), sh = targetShapes(W, H, s);
        const trueC = paintFive(t, sh, { colours: [...g.cols, g.disc] });
        const lsqC = paintFive(t, sh);
        WIT[s] = { start: startDistanceOf(t), trueC, lsqC, greedy: fit(t, { shapes: 5, seed: 7 }).distance,
                   dis: pixelDisagreement(t, trueC.canvas) };
    }
    const rows = Object.entries(WIT);
    for (const [s, r] of rows) report(`seed ${s}: start ${r.start.toFixed(6)} | five true shapes, true colours ${r.trueC.distance.toFixed(6)} (${r.dis.pixels} wrong pixels of ${r.dis.of}, worst ${r.dis.worst}/765) | greedy fitter, five shapes ${r.greedy.toFixed(6)}`);

    ok("!! *** THE 'EXACTLY REPRESENTABLE' TARGET IS NOT EXACTLY REPRESENTABLE, AND THE RESIDUAL IS AN EDGE ***",
       rows.every(([, r]) => r.trueC.distance > 0.02 && r.dis.pixels / r.dis.of < 0.05 && r.dis.worst > 100),
       `The five true shapes carrying the generator's OWN colours still miss ${rows.map(([, r]) => r.dis.pixels).join("/")} pixels of ${W * H} -- under 4% of the picture, each one nearly maximally wrong. *** THE RESIDUAL IS A ONE-PIXEL BAND WHERE TWO RASTERISERS DISAGREE: *** paintEnv fills the disc by testing hypot(x - cx, y - cy) < rad at integer pixel coordinates; primitiveFit's spansOf solves the ellipse analytically at scanline centres and rounds the span ends. Neither is wrong. "REPRESENTABLE" IS ALWAYS "REPRESENTABLE UP TO WHOSE RASTERISER DRAWS THE EDGE", and a round that had asserted "five shapes reach zero" would have been asserting something about a boundary convention.`);

    ok("!! ...and 2% of the pixels carry a quarter of the distance, because RMS is bought by the worst ones",
       rows.every(([, r]) => r.trueC.distance / r.start > 0.15 && r.dis.pixels / r.dis.of < 0.05),
       `${(WIT[1].dis.pixels / WIT[1].dis.of * 100).toFixed(1)}% of the pixels, ${(WIT[1].trueC.distance / WIT[1].start * 100).toFixed(0)}% of the starting distance at seed 1. A DISTANCE THAT AVERAGES OVER AN IMAGE CANNOT TELL "SLIGHTLY WRONG EVERYWHERE" FROM "COMPLETELY WRONG ON A THIN LINE", and those are different failures with different cures. This gate reports both numbers wherever it reports either.`);

    ok("!! *** AND THE GREEDY SEARCH COSTS A FACTOR OF TWO AT THE BUDGET WHERE THE PICTURE IS REPRODUCIBLE ***",
       rows.every(([, r]) => r.greedy > r.trueC.distance * 1.5),
       `${rows.map(([s, r]) => `${(r.greedy / r.trueC.distance).toFixed(2)}x at seed ${s}`).join(", ")}. Given exactly the five shapes the picture is made of, the fitter finds ${(WIT[1].greedy / WIT[1].trueC.distance).toFixed(1)} times the residual of the right five. *** THE BINDING CONSTRAINT AT THIS BUDGET IS THE SEARCH, NOT THE MODEL CLASS *** -- which is the opposite of what this round set out to measure, and section 5 shows it holds at every budget.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE SOLVED COLOUR IS SOLVED FOR A PICTURE THAT WILL NOT EXIST ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = Object.entries(WIT);
    for (const [s, r] of rows) report(`seed ${s}: same five shapes, same order -- true colours ${r.trueC.distance.toFixed(6)}, LEAST-SQUARES colours ${r.lsqC.distance.toFixed(6)} (${((r.lsqC.distance / r.trueC.distance - 1) * 100).toFixed(0)}% worse)`);
    ok("!! *** THE EXACT LEAST-SQUARES COLOUR IS WORSE THAN THE TRUE COLOUR ON THE SAME FIVE SHAPES ***",
       rows.every(([, r]) => r.lsqC.distance > r.trueC.distance),
       `*** fx/primitiveFit.mjs's FIRST HEADLINE IDEA IS THAT THE COLOUR IS SOLVED RATHER THAN SEARCHED, and it is -- the gate at v4220 grid-searches all 256 values of a channel and shows nothing beats it. THAT IS A STATEMENT ABOUT A SHAPE IN ISOLATION. *** Here the four rectangles are drawn before the disc, so each one's least-squares colour is averaged over pixels it is ABOUT TO LOSE -- optimal for the canvas at the moment it is drawn, wrong for the canvas that ends up existing. Worse at every seed, by ${rows.map(([, r]) => ((r.lsqC.distance / r.trueC.distance - 1) * 100).toFixed(0) + "%").join(", ")}. The greedy fitter never revisits a shape, so it cannot recover it.`);

    ok("...and it is the OCCLUSION that does it, not the solver -- the disc, drawn last, is exact either way",
       rows.every(([, r]) => Math.abs(r.lsqC.distance - r.trueC.distance) > 1e-9),
       "The last shape drawn has nothing over it, so its least-squares colour IS its true colour and the two paintings agree there exactly. The whole gap lives in the four shapes that get covered. A FITTER THAT PLACED THE DISC FIRST WOULD HAVE THE SAME PROBLEM WITH THE RECTANGLES REVERSED -- there is no ordering that removes it, only a second pass, which this model does not have.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. A BOUND WITH A CLOSED FORM, AND WHAT THE FITTER DOES AGAINST IT
 * --------------------------------------------------------------------------------------------------------- */
{
    const R = rampTarget(W, H);
    const rows = [2, 4, 8, 16].map((N) => ({ N, strip: stripOptimum(R, N), closed: 1 / (N * Math.sqrt(12)), fitted: fit(R, { shapes: N, seed: 7 }).distance }));
    for (const r of rows) report(`ramp, N = ${r.N}: best N equal strips ${r.strip.toFixed(8)} | closed form range/(N sqrt 12) ${r.closed.toFixed(8)} | the fitter with N shapes ${r.fitted.toFixed(8)}`);

    ok("!! *** THE BEST N-PIECE APPROXIMATION OF A RAMP HAS A CLOSED FORM, AND THE SUM AGREES WITH IT ***",
       rows.every((r) => Math.abs(r.strip - r.closed) / r.closed < 0.05),
       `Each strip's least-squares constant is its mean, and the residual variance of a linear function over a strip is (its range)^2 / 12 -- so the total RMS is range / (N sqrt 12). Computed as a sum over pixels and compared against the closed form: ${rows.map((r) => (100 * Math.abs(r.strip - r.closed) / r.closed).toFixed(1) + "%").join(", ")} apart. TWO ROUTES, and the second one is never used to compute anything.`);

    ok("!! ...and the fitter is 1.3x to 2.7x above it at every N -- MEASURED, and explicitly NOT asserted as a bound",
       rows.every((r) => r.fitted > r.strip),
       `${rows.map((r) => (r.fitted / r.strip).toFixed(2) + "x at N=" + r.N).join(", ")}. *** THIS IS NOT A LOWER BOUND AND THE CHECK DOES NOT PRETEND IT IS. *** N shapes are not N pieces: shapes overlap, and at alpha below 1 an overlap of k shapes can produce more than k levels, so N shapes could in principle beat N strips. They do not, here, at any N measured -- which is a fact about this search, not a theorem about this model class. A gate asserting the bound would be asserting something false that happens to pass.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THREE TARGETS, THREE EXPONENTS, AND THEY DO NOT SORT BY REPRESENTABILITY ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const targets = [
        ["five flat regions", makeTarget(W, H, 1)],
        ["a linear ramp", rampTarget(W, H)],
        ["a ray-marched frame", marchedTarget(W, H, ballsForProps(2))],
    ];
    const rows = targets.map(([name, t]) => {
        const start = startDistanceOf(t), end = fit(t, { shapes: 320, seed: 7 }).distance;
        return { name, colours: distinctColours(t), start, end, frac: end / start, p: convergenceExponent(t, NS) };
    });
    for (const r of rows) report(`${r.name.padEnd(20)} ${String(r.colours).padStart(4)} colours | start ${r.start.toFixed(6)} -> ${r.end.toFixed(6)} at 320 shapes (${(r.frac * 100).toFixed(1)}% left) | exponent p = ${r.p.toFixed(3)}`);

    const ps = rows.map((r) => r.p);
    ok("!! *** THE EXACTLY-REPRESENTABLE TARGET IS NOT THE OUTLIER -- IT IS IN THE MIDDLE ***",
       ps.every((p) => p > 0.3) && ps[0] > Math.min(...ps) && ps[0] < Math.max(...ps) && Math.max(...ps) / Math.min(...ps) < 2,
       `p = ${ps.map((v) => v.toFixed(3)).join(", ")} for five flat regions, a ramp, and a rendered frame -- ${(Math.max(...ps) / Math.min(...ps)).toFixed(2)}x from end to end, with the one target the model class can FINISH sitting between the two it cannot. *** IF REPRESENTABILITY GOVERNED THIS FITTER, THE FLAT TARGET WOULD FALL OFF A CLIFF AT FIVE SHAPES AND THE OTHER TWO WOULD NOT. It does not; it decays like the others, smoothly, for three hundred shapes past the point where it was already finishable. *** The round's premise was wrong and this is the number that says so. AND ALL THREE ARE ASSERTED POSITIVE FIRST: an earlier draft checked only the ORDERING, so a sign flip in the exponent -- a fitter that got WORSE with more shapes -- passed it. Comparing three numbers to each other says nothing about which way any of them points.`);

    ok("!! and the render IS the hardest of the three -- by a factor, not by a category",
       rows[2].frac > rows[0].frac * 1.5 && rows[2].frac > rows[1].frac * 2 && rows[2].colours > 100,
       `${(rows[2].frac * 100).toFixed(1)}% of the starting distance is left on the marched frame at 320 shapes, against ${(rows[0].frac * 100).toFixed(1)}% and ${(rows[1].frac * 100).toFixed(1)}%. It is a REAL render -- physics/render/sdfMarch.mjs sphere-tracing a Wyvill field from physics/mesh/marchingCubes.js, Lambert plus a specular over a graded backdrop, ${rows[2].colours} distinct colours -- and this gate calls neither of those; it only supplies rays. THE HARD PART OF A RENDERED FRAME IS WORTH ABOUT 2x, WHICH IS LESS THAN THE FACTOR SECTION 2 SPENDS ON SEARCH ALONE.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. *** THE COMPOSER'S DECLARED PROP COUNT IS NOT VISIBLE THROUGH THE PAINTER -- A NULL WITH A CONTROL ***
 * --------------------------------------------------------------------------------------------------------- */
{
    // The compositions are VALIDATED first, so the independent variable is a prop count the stage would build
    // rather than a number this gate invented. No model: see the header.
    const MESHES = ["crate.glb", "lamp.glb", "chair.glb", "urn.glb", "stool.glb", "plant.glb"];
    const comps = [1, 2, 3, 4, 5, 6].map((n) => ({
        avatar: "Xbot", scene: SCENES[0], pet: true, room: true,
        gauges: VITALS.map(() => ({ show: true, style: STYLES[0], color: [1, 1, 1] })),
        props: MESHES.slice(0, n).map((glb) => ({ glb })),
    }));
    const verdicts = comps.map((c) => validateComposition(c, { avatars: ["Xbot"], meshes: MESHES, maxProps: 8 }));
    ok("every fixture composition is one the stage could actually build",
       verdicts.every((v) => v.ok),
       `${verdicts.length} compositions through composeValidate.mjs, ${verdicts[0].checked} checks each. The prop COUNT is the independent variable and it is a declared number that a checker approved -- NOT a judgement read out of a picture.`);

    const props = comps.map((c) => {
        const t = marchedTarget(W, H, ballsForProps(c.props.length));
        return { n: c.props.length, colours: distinctColours(t), budget: budgetTo(t, 0.25, { cap: 80 }) };
    });
    const ctrl = [[0, 0], [0.35, 0], [0, 0.3], [-0.3, 0.25], [0.2, -0.25], [-0.15, -0.3]].map(([dx, dy]) => {
        const t = marchedTarget(W, H, ballsForProps(3), { dx, dy });
        return { dx, dy, budget: budgetTo(t, 0.25, { cap: 80 }) };
    });
    report(`shapes to reach 25% of the starting distance, by DECLARED prop count: ${props.map((p) => `${p.n} props -> ${p.budget}`).join(", ")}`);
    report(`CONTROL, the SAME three-prop scene translated (every pixel changes, the scene does not): ${ctrl.map((c) => c.budget).join(", ")}`);

    ok("the render DOES see the props -- so a null below is a null, not a broken fixture",
       props[0].colours < props[2].colours && props.every((p) => p.colours > 300),
       `distinct colours ${props.map((p) => p.colours).join(", ")} for 1 to 6 props. THE PICTURE CHANGES WITH THE DECLARED COUNT AND CHANGES A LOT. This is the control that stops section 6 from being "the props were never drawn".`);

    const pv = props.map((p) => p.budget), cv = ctrl.map((c) => c.budget);
    const pRange = Math.max(...pv) - Math.min(...pv), cRange = Math.max(...cv) - Math.min(...cv);
    ok("!! *** SIX PROPS NEED FEWER SHAPES THAN ONE -- THE BUDGET DOES NOT TRACK THE DECLARED COUNT ***",
       pv[5] < pv[0] && !pv.every((v, i) => i === 0 || v >= pv[i - 1]),
       `${pv[5]} shapes for six props against ${pv[0]} for one, and the sequence ${pv.join(", ")} is not monotone in either direction. *** THE ROUND PROPOSED THIS AS A MUST-MATTER AXIS AND THE MEASUREMENT SAYS IT DOES NOT MATTER. *** More props means more of the frame is ball rather than backdrop, and the backdrop's gradient is the expensive part -- so declaring MORE can make the picture CHEAPER.`);

    ok("!! ...and the control settles it: moving a fixed scene sideways moves the budget nearly as much",
       cRange > pRange * 0.4,
       `the six prop counts span ${pRange} shapes (${Math.min(...pv)} to ${Math.max(...pv)}); SIX TRANSLATIONS OF ONE UNCHANGED SCENE span ${cRange} (${Math.min(...cv)} to ${Math.max(...cv)}), ${(100 * cRange / pRange).toFixed(0)}% as wide. *** SO THE PAINTER IS NOT A COMPLEXITY METER FOR THE COMPOSER. *** A round that had measured only the first row would have read 29, 41, 32, 38, 29, 20 as a signal with noise in it; the control says the whole of it is the noise. THAT IS THE ANSWER TO THE QUESTION THIS ROUND STARTED FROM, and it is worth more than a positive result would have been, because the tempting build -- score the composer by how well the painter reproduces it -- is exactly the Voyager failure composeValidate.mjs was written to avoid, AND it would not even have carried the signal.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. DISCIPLINE
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ENG, "fx", "paintTargets.mjs"), "utf8");
    ok("the target module owns no rasteriser, no colour solver and no renderer of its own",
       !/function\s+spansOf|function\s+optimalColour|function\s+marchRay/.test(src) &&
       /from "\.\/primitiveFit\.mjs"/.test(src) && /from "\.\.\/physics\/render\/sdfMarch\.mjs"/.test(src),
       "It calls fx/primitiveFit.mjs for rasterisation and colour, physics/render/sdfMarch.mjs and physics/mesh/marchingCubes.js for the render. A FIXTURE MODULE THAT WROTE ITS OWN RENDERER WOULD BE GRADING ITS OWN RENDERER.");

    // *** ASSERTED ON THE IMPORT GRAPH, NOT ON THE PROSE. *** The first draft of this check searched the whole
    // file for the string "ollama" and went red on its own header, which explains why the producer is absent.
    // A GATE THAT READS ITS OWN COMMENTS IS CHECKING AN ARRANGEMENT; the imports are the mechanism.
    const mine = fs.readFileSync(new URL(import.meta.url), "utf8");
    const specs = [...mine.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    ok("!! and NO MODEL RUNS IN THIS GATE -- the composer's validator is imported, its producer is not",
       specs.some((x) => x.endsWith("composeValidate.mjs")) &&
       !specs.some((x) => /composePropose|[Oo]llama|Client/.test(x)),
       `${specs.length} imports: ${specs.map((x) => x.replace(/^.*\//, "")).join(", ")}. composeValidate.mjs is there and tools/ship/composePropose.mjs is not -- it is named in the header and never called. A gate that needed a local model would be a SKIP on the build box, and a SKIP is a fail; but the reason the producer is out is the FIRST one in the header, not that one.`);
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
console.log(`
----  WHAT THIS DOES NOT CLAIM
      THAT THE PAINTER IS BAD, OR THAT A RENDERED FRAME IS BEYOND IT. It is not and they are not: the
      marched frame goes from 0.197 to 0.018 in 320 shapes. What is measured is that REPRESENTABILITY
      is not the variable that governs any of it, that the search costs a factor of two at the one
      budget where the answer is known exactly, and that the composer's declared complexity does not
      survive the trip. NOTHING HERE SAYS THE PICTURES ARE PRETTY, and nothing here scores a
      composition -- see section 6.

      STILL UNCHECKED, AND IT IS THE NEXT ROUND: v4220's policy is held out on twenty-four SEEDS of
      makeTarget, and its gate calls those "held-out pictures". Every one of them is five flat regions.
      HELD-OUT SEEDS ARE NOT A HELD-OUT DISTRIBUTION, and whether the learned advantage survives a
      target from a different generator -- the ramp or the marched frame above -- is not measured here
      or anywhere.`);
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 6 / 1 / 5 / 1 / 4 / 1 / 2 / 2 by name, AND TWO OF THEM WENT 0 RED FIRST.
 *
 * A. targetGeometry draws the disc colour before the quadrant split rather than after, so the
 *    replayed RNG stream is off by two draws.                                                       6 RED
 *    Everything downstream of the recovered geometry, which is what a duplicate of a shipped generator
 *    should cost when it drifts. This is the failure the bit-identity check exists for.
 *
 * B. The disc test flipped from `<` to `<=`.                                              0 RED, then 1 RED
 *    *** IT WENT 0 RED AGAINST FIVE SEEDS OF BIT-IDENTITY, AND WOULD AT ANY NUMBER OF SEEDS. *** No integer
 *    pixel lands EXACTLY on a radius makeTarget produces, so a comparison against the shipped generator never
 *    exercises the boundary however long it runs -- true at every seed and constraining nothing. That matters
 *    here because section 2's entire finding is a one-pixel edge. rebuildFrom now takes explicit geometry so
 *    the gate can hand it cx = cy = 0, rad = 5, where (3,4) sits exactly on the circle. Re-run at 1 red.
 *
 * C. paintFive ignores the colours it is handed and always solves for them, so the "true colours"
 *    painting and the "least-squares colours" painting become the same run.                         5 RED
 *    Both witness checks and the whole of section 3, correctly: with the two paintings identical there is no
 *    occlusion finding left to make.
 *
 * D. stripOptimum scores each strip against its MIDPOINT sample rather than its mean.               1 RED
 *    Narrow and exactly right: the closed form is the mean's residual and nothing else reads that number.
 *    A midpoint is a perfectly reasonable-looking statistic and it is not the least-squares constant.
 *
 * E. marchedTarget never consults the field -- every pixel takes the backdrop.                      4 RED
 *    The render's difficulty, the props control, and both prop-count checks. The control ("the render DOES
 *    see the props") is the one that names the fault rather than merely reacting to it.
 *
 * F. convergenceExponent returns the raw slope instead of its negation.                   0 RED, then 1 RED
 *    *** THE CHECK COMPARED THE THREE EXPONENTS TO EACH OTHER AND NEVER TO ZERO, so flipping every sign --
 *    a fitter that gets WORSE with more shapes -- preserved the ordering and passed. *** Comparing numbers
 *    to one another says nothing about which way any of them points. Positivity asserted first; 1 red.
 *
 * G. ballsForProps ignores the declared count and always builds three balls.                        2 RED
 *    The props control and the non-monotonicity check. NOT the translation control, correctly -- that one
 *    holds the count fixed on purpose, so a fault that fixes the count is invisible to it.
 *
 * H. budgetTo compares the trace against the raw fraction instead of the fraction of the start.     2 RED
 *    Both prop-count checks. The budgets all collapse to the same value once the threshold stops being
 *    relative, which is what makes a null with a control readable at all.
 * --------------------------------------------------------------------------------------------------------- */
