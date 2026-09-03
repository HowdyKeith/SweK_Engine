#!/usr/bin/env node
// tools/ship/paintFields-selfcheck.mjs -- v4423
//
// Run: node tools/ship/paintFields-selfcheck.mjs      (pure: no GL, no canvas, no model. Trains once.)
//
// *** FOUR MORE GENERATORS, THE FIRST TARGET THAT IS NOT A PICTURE, AND A UNIFICATION THAT DOES NOT HOLD. ***
//
// v4420 measured a learned painter across five generators and found it below random on every one it did not
// train on. v4422 found the SAME pictures behind a scanline mask do it harder, and explained that with the
// policy's own 4x4 observation grid going flat. This round adds four sources -- a CPU path tracer, a
// tomographic reconstruction, procedural fBm and a procedural globe -- and asks two things neither round
// could answer alone.
//
// ---- ONE: THE PATH TRACER RETURNS A SCALAR, SO THE COLOUR HAS TO BE PUT ON ------------------------------------
//
// Every target in this arc has been an RGB raster. physics/render/pathTracer.mjs returns a Float64Array of
// RADIANCE, and physics/tomography's filtered back-projection returns a reconstructed field the same way. The
// same field can be replicated to three identical channels or mapped through fx/voxelize/fireRamp.js's
// blackbody ramp. *** THE INFORMATION IS IDENTICAL AND THE FITTER'S PROBLEM IS NOT: *** primitiveFit minimises
// L2 in RGB, and L2 in RGB after a non-linear ramp is not L2 in the field. Measured: on the traced source,
// shapes chosen against one colouring are 12% to 19% worse on the other; on the tomographic source the two are
// interchangeable to within 3%. The obvious explanation -- one field having a heavier tail -- IS MEASURED AND
// FAILS: the traced field's middle 80% occupies 0.81 of its range against tomo's 0.64, which is the wrong way
// round.
//
// ---- TWO: THE TRANSFER TABLE GETS A NEW POSITIVE, AND THE OBVIOUS UNIFICATION DOES NOT SURVIVE --------------
//
// A policy trained on flat regions scores +4.7 sd on the PATH-TRACED column -- above its own training
// distribution -- while tomo gives -15.2 and planet -12.7. *** SO v4420's "WORSE THAN RANDOM ON EVERYTHING IT
// DID NOT TRAIN ON" WAS TOO STRONG, and eleven columns is what says so.
//
// *** AND THE TEMPTING EXTENSION OF v4422 FAILS. *** That round measured the policy's grid contrast halving
// under a CRT and predicted, FOR TRANSFORMS OF FIXED CONTENT, that energy above the grid's Nyquist blinds it.
// It is tempting to read that as "the grid's contrast ranks targets". It does not: across these eleven
// columns the Pearson correlation between grid spread and the policy's sd is 0.34, and the positive columns'
// spreads sit INSIDE the negative columns' range. v4422's claim is about transforms and is untouched; the
// generalisation to different CONTENT is what this round tried and could not support.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PaintEnv, OBS_DIM, ACT_DIM, GRID } from "../../brain/rl/paintEnv.js";
import { trainDockES, FlightPolicy } from "../../brain/rl/dockPolicy.js";
import { fit, blank, averageColour, spansOf, drawShape, optimalColour, difference, distanceOf } from "../../fx/primitiveFit.mjs";
import { GENERATORS, memoGenerator, episodeImprovements, randomFloor, seedSpread } from "../../fx/paintGenerators.mjs";
import {
    FIELD_GENERATORS, RAMPED_GENERATORS, tracedField, tomoField, greyImage, rampImage, isGrey,
    fieldRange, hashPrecisionGap,
} from "../../fx/paintFields.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sdOf = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };

const W = 32, H = 32, STEPS = 20, ITERS = 100, N = 40;
const HELD = Array.from({ length: 24 }, (_, k) => 900000 + k * 2237);
const COLS = { ...GENERATORS, ...FIELD_GENERATORS, tracedRamp: RAMPED_GENERATORS.traced, tomoRamp: RAMPED_GENERATORS.tomo };
const NAMES = Object.keys(COLS);
const GEN = {};
for (const n of NAMES) GEN[n] = memoGenerator(COLS[n], { w: W, h: H });
const mk = (n) => (o = {}) => new PaintEnv({ width: W, height: H, maxSteps: STEPS, targetOf: GEN[n], ...o });
const D = (t, c) => distanceOf(difference(t, c), W * H);

/* ------------------------------------------------------------------------------------------------------------
 * 1. FOUR NEW SOURCES, AND ONE THAT IS DELIBERATELY ABSENT
 * --------------------------------------------------------------------------------------------------------- */
{
    const news = ["traced", "tomo", "nebula", "planet"];
    const rows = news.map((n) => ({ n, ...seedSpread(COLS[n], HELD.slice(0, 6), { w: W, h: H }) }));
    for (const r of rows) report(`${r.n.padEnd(8)} mean pairwise distance over ${r.pairs} seed pairs ${r.mean.toFixed(6)}, worst identical-pixel fraction ${r.worstIdenticalFraction.toFixed(4)}`);
    ok("!! four new sources, every one moving under its seed",
       rows.every((r) => r.mean > 0.05 && r.worstIdenticalFraction < 0.98),
       `traced is a CPU path tracer -- global illumination and a real transport integral; tomo is a FILTERED BACK-PROJECTION, a RECONSTRUCTION rather than a render, whose streaks come from angular undersampling and were put there by no object in the scene; nebula is procedural fBm; planet is a globe on black. v4420's seedSpread is what checks them, on the wrappers the env is fed.`);

    const pict = fs.existsSync(path.join(ENG, "ev", "pict.js"));
    const assets = fs.readdirSync(ENG, { recursive: true }).filter((f) => typeof f === "string" && /\.(pict|pct)$/i.test(f));
    ok("!! *** AND THE ONLY NON-PROCEDURAL SOURCE IN THE TREE HAS NO DATA TO DECODE, WHICH IS SAID RATHER THAN SKIPPED ***",
       pict && assets.length === 0,
       `ev/pict.js decodes classic-Mac PICT images and would be the only HAND-DRAWN distribution available -- art rather than a formula, which is exactly the held-out distribution v4420's finding most wants. The tree contains ${assets.length} .pict or .pct files and nothing calls decodePICT. "WE HAVE A PICT DECODER" AND "WE HAVE PICT IMAGES" ARE TWO FACTS AND ONLY THE FIRST IS TRUE; a round that quietly left it off the list would have left the reader to assume otherwise.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE SCALAR SOURCE HAS TO BE COLOURED, AND THE SOLVED COLOUR ON A GREY TARGET IS EXACTLY GREY ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const f = tracedField(W, H, 900000);
    const g = greyImage(f, W, H), r = rampImage(f, W, H);
    const { lo, hi } = fieldRange(f);
    report(`the path tracer returns ${f.constructor.name}, ${f.length} scalars in [${lo.toFixed(3)}, ${hi.toFixed(3)}] -- one number per pixel, not three`);
    ok("the grey colouring is exactly grey and the ramp is not",
       isGrey(g) && !isGrey(r),
       "greyImage replicates the field to three identical channels; rampImage maps it through fx/voxelize/fireRamp.js's blackbody stops, whose blue channel stays at zero for the first two thirds and then climbs.");

    const fitted = fit(g, { shapes: 20, seed: 7 });
    const notGrey = fitted.shapes.filter((s) => !(s.colour[0] === s.colour[1] && s.colour[1] === s.colour[2]));
    ok("!! *** optimalColour ON A GREY TARGET RETURNS EXACTLY GREY -- 0 OF 20, BY === ON THE CHANNELS ***",
       notGrey.length === 0,
       `The solver averages (t - cur)/alpha + cur per channel, and three identical inputs give three identical outputs BIT FOR BIT -- not nearly. *** SO TWO THIRDS OF THE COLOUR SOLVER'S WORK IS A COPY ON A SCALAR SOURCE, and primitiveFit's distanceOf divides by pixels * 3 while all the information is in one channel. *** Neither is a fault; both are worth knowing before a scalar target's numbers are compared with an RGB one's.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE SAME FIELD, TWO COLOURINGS, TWO DIFFERENT PROBLEMS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const replay = (target, shapes, alpha = 0.5) => {
        const c = blank(W, H, averageColour(target));
        for (const s of shapes) {
            const sp = spansOf(s, W, H);
            if (!sp.length) continue;
            const col = optimalColour(target, c, sp, alpha);
            if (col) drawShape(c, sp, col, alpha);
        }
        return D(target, c);
    };
    const SEEDS = HELD.slice(0, 12);
    const table = {};
    for (const src of ["traced", "tomo"]) {
        table[src] = SEEDS.map((seed) => {
            const f = src === "traced" ? tracedField(W, H, seed) : tomoField(W, H, seed);
            const g = greyImage(f, W, H), r = rampImage(f, W, H);
            const gf = fit(g, { shapes: N, seed: 7 }), rf = fit(r, { shapes: N, seed: 7 });
            return { greySelf: gf.distance, rampSelf: rf.distance,
                     rampOnGrey: replay(g, rf.shapes), greyOnGrey: replay(g, gf.shapes) };
        });
    }
    for (const src of ["traced", "tomo"]) {
        const rel = table[src].map((r) => r.rampOnGrey / r.greySelf - 1);
        report(`${src.padEnd(7)} the OTHER colouring's geometry, replayed on this one: ${rel.map((v) => (v * 100).toFixed(0) + "%").join(" ")}`);
    }

    ok("!! the replay is EXACT when the shapes are the target's own -- the control that makes the rest readable",
       table.traced.every((r) => r.greyOnGrey === r.greySelf),
       `${table.traced.length} seeds, equal by === on the float. The replay re-solves each colour against the canvas as it goes, exactly as fit() does, so handing it back a fit's own shapes reproduces that fit's distance TO THE BIT. Without that, every number below could have been the replay rather than the colouring.`);

    const tr = mean(table.traced.map((r) => Math.abs(r.rampOnGrey / r.greySelf - 1)));
    const to = mean(table.tomo.map((r) => Math.abs(r.rampOnGrey / r.greySelf - 1)));
    ok("!! *** ON THE TRACED SOURCE THE COLOURING CHANGES WHICH GEOMETRY MATTERS; ON THE TOMOGRAPHIC ONE IT DOES NOT ***",
       tr > 0.08 && to < 0.05 && tr > to * 2,
       `mean absolute change ${(100 * tr).toFixed(1)}% against ${(100 * to).toFixed(1)}%. L2 IN RGB AFTER A NON-LINEAR RAMP IS NOT L2 IN THE FIELD, so the two colourings pose different problems -- but by how much depends on the source, and by a factor of ${(tr / to).toFixed(1)} here.`);

    const range = (src) => mean(HELD.slice(0, 12).map((s) => {
        const f = src === "traced" ? tracedField(W, H, s) : tomoField(W, H, s);
        const a = [...f].sort((x, y) => x - y), { lo, hi } = fieldRange(f);
        return (a[Math.floor(0.9 * a.length)] - a[Math.floor(0.1 * a.length)]) / ((hi - lo) || 1);
    }));
    const bulkT = range("traced"), bulkO = range("tomo");
    report(`the obvious explanation, measured: the middle 80% of the traced field occupies ${bulkT.toFixed(3)} of its range, tomo's ${bulkO.toFixed(3)}`);
    ok("!! ...and the obvious explanation FAILS, which is recorded rather than dropped",
       bulkT > bulkO,
       `A heavier tail would compress the bulk into a small part of the range and make a ramp's non-linearity bite harder. THE TRACED FIELD'S BULK IS WIDER, NOT NARROWER -- ${bulkT.toFixed(2)} against ${bulkO.toFixed(2)} -- SO THE CANDIDATE PREDICTS THE WRONG SIGN. The effect is real and measured at a factor of ${(tr / to).toFixed(1)}; what causes it is not established here, and naming a candidate that fails is worth more than leaving the reader to supply one that would.`);

    let crossWins = 0, crossTotal = 0;
    for (const src of ["traced", "tomo"]) for (const r of table[src]) { crossTotal++; if (r.rampOnGrey < r.greySelf) crossWins++; }
    ok("!! and in a minority of cases the OTHER objective's search found better geometry for THIS one",
       crossWins > 2 && crossWins < crossTotal / 2,
       `${crossWins} of ${crossTotal}. *** A SEARCH RUN AGAINST A DIFFERENT COLOURING SOMETIMES BEATS YOUR OWN SEARCH AT YOUR OWN OBJECTIVE, which is only possible because the greedy fitter is far from optimal -- v4417 measured that gap at a factor of two and v4421 at "cannot close it at all". *** It is a MINORITY, and reporting it as a technique rather than as a symptom would be the overclaim available here.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** ONE FIXTURE IS NOT PORTABLE ACROSS PRECISIONS, AND THE HARNESS RECORDED IT YEARS AGO ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const gap = hashPrecisionGap(256);
    report(`the nebula's hash, sin(x*127.1 + y*311.7)*43758.5453, at f64 against an f32 simulation: worst |difference| ${gap.worst.toFixed(4)}, mean ${gap.mean.toFixed(4)} over ${gap.samples} samples of a value in [0, 1)`);
    ok("!! *** THE NEBULA WOULD BE A DIFFERENT PICTURE ON A DEVICE, AND THAT IS A NUMBER NOW ***",
       gap.mean > 0.2 && gap.worst > 0.5,
       `A mean error of ${gap.mean.toFixed(2)} on a value that lives in [0, 1) means the two precisions produce essentially UNRELATED numbers, not slightly different ones. tools/ship/webgpuHarness.mjs's header has recorded the same construction returning "0.921690 on the CPU and 0.240234 on the GPU" since v4270 and called it a caution; this is the same fact as a measurement. *** EVERY OTHER TARGET IN THIS ARC WOULD SURVIVE BEING GENERATED ON A DEVICE. THIS ONE WOULD NOT, and a round that ported these fixtures to WGSL would find that out the hard way.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** ELEVEN COLUMNS, AND A NEW POSITIVE -- v4420's READING WAS TOO STRONG ***
 * --------------------------------------------------------------------------------------------------------- */
const CELLS = {};
{
    const res = trainDockES({ envFactory: mk("flat"), obsDim: OBS_DIM, actDim: ACT_DIM, hidden: [16, 16],
                              maxSteps: STEPS, iters: ITERS, pop: 24, sigma: 0.14, lr: 0.05, seed: 3, trainEps: 8 });
    const P = new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM, actDim: ACT_DIM }).setParams(res.params);
    for (const n of NAMES) {
        const F = randomFloor(mk(n), HELD, STEPS);
        const p = mean(episodeImprovements(mk(n), HELD, (o) => P.act(o), STEPS));
        CELLS[n] = { floor: F.mean, policy: p, sd: (p - F.mean) / (F.sd || 1e-9) };
    }
    const sorted = [...NAMES].sort((a, b) => CELLS[b].sd - CELLS[a].sd);
    for (const n of sorted) report(`${n.padEnd(12)} floor ${CELLS[n].floor.toFixed(5)} | policy ${CELLS[n].policy.toFixed(5)} | ${CELLS[n].sd >= 0 ? "+" : ""}${CELLS[n].sd.toFixed(1)} sd`);

    ok("!! it still beats its own training distribution, and v4420's five columns still read as they did",
       CELLS.flat.sd > 3 && CELLS.marched.sd < 0 && CELLS.krbn.sd < 0 && CELLS.fire.sd < 0,
       `flat +${CELLS.flat.sd.toFixed(1)}, and marched/krbn/fire below their floors as that round found. The four new columns are ADDED to a table that reproduces, not to a new one.`);

    ok("!! *** AND THE PATH-TRACED COLUMN IS POSITIVE -- ABOVE THE TRAINING DISTRIBUTION ITSELF ***",
       CELLS.traced.sd > 3 && CELLS.traced.sd > CELLS.flat.sd - 1,
       `+${CELLS.traced.sd.toFixed(1)} sd on a CPU path tracer's output, against +${CELLS.flat.sd.toFixed(1)} on the pictures it trained on, and +${CELLS.tracedRamp.sd.toFixed(1)} on the same field through the ramp. *** v4420 CONCLUDED "WORSE THAN RANDOM ON EVERY GENERATOR IT DID NOT TRAIN ON" FROM FOUR OFF-DIAGONAL COLUMNS, AND ELEVEN SAYS THAT WAS TOO STRONG. *** The correction is the round's, not a reader's: two spheres and a ground plane are large smooth regions, which is what flat quadrants are too.`);

    ok("...and the two hardest columns are a reconstruction and a small subject on black",
       CELLS.tomo.sd < -8 && CELLS.planet.sd < -8,
       `tomo ${CELLS.tomo.sd.toFixed(1)}, planet ${CELLS.planet.sd.toFixed(1)}. A FILTERED BACK-PROJECTION IS FULL OF STREAKS THAT NO OBJECT PUT THERE and a globe on black is v4418's "a third of the budget outside the subject" made into a whole target.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. *** AND THE TEMPTING UNIFICATION OF v4422 DOES NOT SURVIVE ELEVEN COLUMNS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = NAMES.map((n) => {
        const s = HELD.map((seed) => {
            const e = new PaintEnv({ width: W, height: H, maxSteps: STEPS, targetOf: GEN[n] });
            const g = [...e.reset(seed)].slice(0, GRID * GRID);
            return sdOf(g) / mean(g);
        });
        return { n, spread: mean(s), sd: CELLS[n].sd };
    }).sort((a, b) => b.spread - a.spread);
    for (const r of rows) report(`${r.n.padEnd(12)} grid spread ${r.spread.toFixed(4)} | policy ${r.sd >= 0 ? "+" : ""}${r.sd.toFixed(1)} sd`);

    const xs = rows.map((r) => r.spread), ys = rows.map((r) => r.sd);
    const mx = mean(xs), my = mean(ys);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
    const r = num / Math.sqrt(dx * dy);
    const pos = rows.filter((x) => x.sd > 0), neg = rows.filter((x) => x.sd < 0);
    ok("!! *** THE GRID-CONTRAST STATISTIC DOES NOT RANK TARGETS: r = 0.34, AND THE POSITIVES SIT INSIDE THE NEGATIVES ***",
       Math.abs(r) < 0.4 &&
       Math.min(...pos.map((x) => x.spread)) > Math.min(...neg.map((x) => x.spread)) &&
       Math.max(...pos.map((x) => x.spread)) < Math.max(...neg.map((x) => x.spread)),
       `Pearson ${r.toFixed(3)} over ${rows.length} columns; the positive columns span ${Math.min(...pos.map((x) => x.spread)).toFixed(3)} to ${Math.max(...pos.map((x) => x.spread)).toFixed(3)}, strictly INSIDE the negatives' ${Math.min(...neg.map((x) => x.spread)).toFixed(3)} to ${Math.max(...neg.map((x) => x.spread)).toFixed(3)}. nebula has the HIGHEST contrast of all and is ${CELLS.nebula.sd.toFixed(1)} sd. *** v4422's CLAIM WAS ABOUT TRANSFORMS OF FIXED CONTENT AND IS UNTOUCHED: it measured the SAME pictures losing half their grid contrast under a CRT. READING IT AS "THE STATISTIC RANKS TARGETS" IS THE EXTENSION, AND IT IS THE ONE THIS ROUND TRIED AND COULD NOT SUPPORT. *** A mechanism that explains one experiment is not a variable that orders a different one.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. DISCIPLINE
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ENG, "fx", "paintFields.mjs"), "utf8");
    ok("the module owns no tracer, no reconstruction, no noise and no ramp of its own",
       !/function\s+(render|radon|filteredBackProjection|fbm|blackbodyRamp)\b/.test(src) &&
       /from "\.\.\/physics\/render\/pathTracer\.mjs"/.test(src) &&
       /from "\.\.\/physics\/tomography\/ct\.js"/.test(src) &&
       /from "\.\/voxelize\/fireRamp\.js"/.test(src),
       "The tracer, the Radon transform and its filtered back-projection, the fBm nebula, the globe and the blackbody ramp are all imported from modules gated in their own right. THIS FILE COLOURS FIELDS AND NOTHING ELSE -- and the ramp being a SHIPPED one matters, because inventing a ramp to make section 3's point would have been choosing the answer.");

    ok("!! and every column has makeTarget's signature, so v4420's protocol runs over all eleven unchanged",
       NAMES.length === 11 && NAMES.every((n) => { const im = COLS[n](W, H, 12345); return im && (im.w === W || im.width === W); }),
       `${NAMES.length} columns through the same randomFloor and episodeImprovements as v4420 and v4422. THE SD COLUMN IS COMPARABLE ACROSS THREE ROUNDS because it is the same two functions, which is the whole reason they were factored out rather than written per gate.`);
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
console.log(`
----  WHAT THIS DOES NOT CLAIM
      THAT THE COLOURING QUESTION IS SETTLED. Section 3 measures that two colourings of one field pose
      measurably different problems and that the size of the difference depends on the source; the
      CAUSE is not established, and the one candidate tested predicts the wrong sign.

      NOR THAT ELEVEN COLUMNS SETTLE THE TRANSFER QUESTION. One training row, on one generator. What
      eleven columns DO settle is that four off-diagonal columns were not enough to say "everything",
      which is what v4420 said and what this round corrects.`);
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 2 / 3 / 1 / 2 / 1 / 1 / 1 / 1 by name. No 0 reds, and ONE IS INSTRUCTIVE ANYWAY.
 *
 * A. greyImage writes a different value into the green channel.                                     2 RED
 *    The isGrey check and, correctly, the exact-grey solver check -- optimalColour then returns three
 *    DIFFERENT numbers, which is the whole property section 2 asserts.
 *
 * B. rampImage is secretly the grey one.                                                            3 RED
 *    The colouring contrast collapses to zero, so both of section 3's measurements have nothing to compare.
 *    NOT the exact-replay control, correctly: replaying a fit's own shapes is exact whatever the colouring.
 *
 * C. tracedField freezes its SCENE -- the same two spheres and camera at every seed.                 1 RED
 *    *** AND seedSpread CORRECTLY DOES NOT FIRE, which is worth reading. *** The tracer's own sampling seed
 *    still varies, so the pictures still differ by Monte Carlo noise and section 1's check -- which asks
 *    whether the PICTURE varies -- is satisfied. What moves is the transfer column, and the correlation check
 *    catches it. "DOES THE PICTURE VARY" AND "DOES THE SCENE VARY" ARE TWO QUESTIONS and this gate only ever
 *    claimed the first.
 *
 * D. tomoField returns the phantom instead of its reconstruction.                                   2 RED
 *    A clean ellipse phantom has none of the streaks the inverse problem puts there, so the colouring
 *    contrast and the histogram measurement both move. THIS IS THE ONE THAT WOULD HAVE LOOKED FINE: a
 *    phantom is a perfectly good picture, and only the numbers say it is not a RECONSTRUCTION.
 *
 * E. hashPrecisionGap's "f32" path drops every fround, so both sides are f64.                       1 RED
 *    The gap goes to zero and the portability claim fails. A PRECISION SIMULATION THAT IS NOT SIMULATING A
 *    PRECISION is the exact shape of instrument this tree keeps finding, and it is why the check asserts a
 *    LARGE gap rather than merely a non-zero one.
 *
 * F. nebulaImage returns to a camera in +/-20, which the parallax cannot see.                       1 RED
 *    *** THIS IS THE BUG THIS ROUND SHIPPED AND CAUGHT: *** nebulaColorAt offsets by cam.x * 0.00035 against
 *    a domain scaled by 2.4, so +/-20 world units move the sampling point by 0.007 and twenty-four seeds
 *    produce nearly one picture -- mean pairwise distance 0.0088 against the other three sources' 0.18 to
 *    0.27. The module is behaving exactly as designed; the caller had the wrong scale. seedSpread caught it,
 *    the third generator in three rounds it has caught.
 *
 * G. fieldRange reports a fixed [0, 1] instead of the field's own ends.                             1 RED
 *    The histogram measurement, which is the one thing that reads the range directly. The colourings still
 *    produce pictures -- clipped ones -- which is why this lands narrowly rather than everywhere.
 *
 * H. isGrey always returns true.                                                                    1 RED
 *    Only the check that reads it, and correctly: it is a predicate used in one place, and the exact-grey
 *    solver check goes through optimalColour rather than through this.
 * --------------------------------------------------------------------------------------------------------- */
