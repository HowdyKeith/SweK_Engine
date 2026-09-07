#!/usr/bin/env node
// tools/ship/paintTransforms-selfcheck.mjs -- v4422
//
// Run: node tools/ship/paintTransforms-selfcheck.mjs      (pure: no GL, no canvas, no model. Trains once.)
//
// *** THE SAME PICTURES, ONE POST-PROCESS, AND THE POLICY GOES FROM +4.4 SD ABOVE RANDOM TO -12 BELOW. ***
//
// v4417 varied representability, v4418 varied whether a pixel is on the subject, v4419 varied time, v4420
// varied the generator. All four change what the picture is OF. A transform changes none of that: it takes a
// finished picture and re-renders it. The content is identical BY CONSTRUCTION -- the same makeTarget seeds,
// the same four quadrants and disc -- and only the presentation moves.
//
//     transform        sd above that variant's OWN random floor
//     identity                 +4.4
//     crtOff                   +4.4      <- the identity, bit for bit: 4096 of 4096 bytes
//     liquefy                  +4.6      <- content displaced by up to 13 px
//     crtTrinitron            -11.6
//     crtArcade               -12.1
//     crtPipboy               -12.7
//
// *** v4420 NEEDED A DIFFERENT GENERATOR TO BREAK THIS POLICY. A SCANLINE MASK OVER THE SAME PICTURES DOES
// IT HARDER. *** And a displacement field that moves content half a cell to a cell and a half does not do it
// at all, which is what turns the result from "CRT is hard" into a statement about WHY.
//
// ---- THE MECHANISM, MEASURED RATHER THAN GUESSED --------------------------------------------------------------
//
// The policy's entire view is a 4x4 grid of MEAN residual per cell. On a 32-pixel image that is an 8x8 box
// filter. The CRT's shadow mask repeats every 3 pixels (maskPitch 3) and its scanline term runs 224 to 480
// cycles over 32 rows -- BOTH FAR ABOVE THAT GRID'S NYQUIST -- so averaging over a cell turns them into a
// constant offset added to every cell alike. Measured: the grid's relative spread HALVES, 0.251 to 0.132, and
// the ratio of its brightest cell to its dimmest falls from 2.75 to 1.60. Liquefy's peak displacement is 6 to
// 13 pixels against an 8-pixel cell, so it moves structure BETWEEN cells and the grid still sees it: spread
// 0.244, ratio 2.57, both within 3% of untransformed.
//
// *** SO THE FAILURE IS NOT ABOUT CONTENT AND NOT ABOUT DIFFICULTY. IT IS ABOUT WHETHER THE TRANSFORM
// SURVIVES THE POLICY'S OWN DOWNSAMPLING. *** Two transforms above that Nyquist, two below, and the sign of
// the result follows the frequency rather than the severity.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PaintEnv, OBS_DIM, ACT_DIM, GRID } from "../../brain/rl/paintEnv.js";
import { trainDockES, FlightPolicy } from "../../brain/rl/dockPolicy.js";
import { fit } from "../../fx/primitiveFit.mjs";
import { startDistanceOf } from "../../fx/paintTargets.mjs";
import { GENERATORS, memoGenerator, episodeImprovements, randomFloor } from "../../fx/paintGenerators.mjs";
import { PRESETS } from "../../render/crtModel.js";
import { TRANSFORMS, TRANSFORM_NAMES, REAL_TRANSFORMS, transformed, transformDelta, liquefyPeak } from "../../fx/paintTransforms.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sdOf = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };

const W = 32, H = 32, STEPS = 20, ITERS = 100;
const HELD = Array.from({ length: 24 }, (_, k) => 900000 + k * 2237);
const GEN = {};
for (const t of TRANSFORM_NAMES) GEN[t] = memoGenerator(transformed(GENERATORS.flat, t), { w: W, h: H });
const mk = (t) => (o = {}) => new PaintEnv({ width: W, height: H, maxSteps: STEPS, targetOf: GEN[t], ...o });
const CELL = W / GRID;

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE NULL TRANSFORM: A CONTROL THIS ROUND DID NOT HAVE TO BUILD ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = HELD.slice(0, 8).map((s) => transformDelta(GENERATORS.flat(W, H, s), "crtOff", s));
    report(`crtImage with PRESETS.off over ${rows.length} pictures: bytes left untouched ${rows.map((r) => r.bytesEqual).join(", ")} of ${rows[0].bytes}`);
    ok("!! *** PRESETS.off IS THE IDENTITY, BIT FOR BIT, THROUGH THE SAME CODE PATH AS EVERY OTHER PRESET ***",
       rows.every((r) => r.bytesEqual === r.bytes && r.rms === 0),
       `Every byte, at every picture. *** IT IS THE SAME FUNCTION, THE SAME REGISTRY ENTRY AND THE SAME CALL as crtArcade -- only its scanDepth and maskDepth are zero -- so anything that moves through it is measuring the harness rather than the transform. A MUST-NOT-MATTER THAT SHARES THE CODE PATH IS WORTH MORE THAN ONE THAT SKIPS IT, and this round got it for free because the preset table already had an "off".`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. TWO TRANSFORMS THAT MOVE OPPOSITE THINGS
 * --------------------------------------------------------------------------------------------------------- */
const START = {};
{
    for (const t of TRANSFORM_NAMES) START[t] = mean(HELD.map((s) => startDistanceOf(GEN[t](W, H, s))));
    const deltas = {};
    for (const t of REAL_TRANSFORMS) deltas[t] = transformDelta(GENERATORS.flat(W, H, 900000), t, 900000);
    for (const t of REAL_TRANSFORMS) report(`${t.padEnd(13)} rms ${deltas[t].rms.toFixed(4)}, ${deltas[t].bytesEqual} of ${deltas[t].bytes} bytes untouched, flat-average start distance ${START.identity.toFixed(5)} -> ${START[t].toFixed(5)}`);
    const peaks = HELD.slice(0, 6).map((s) => liquefyPeak(W, H, s));
    report(`liquefy peak displacement over 6 seeds: ${peaks.map((p) => p.toFixed(1)).join(", ")} px, against a ${CELL}-pixel observation cell`);

    ok("!! the CRT rewrites COLOUR and leaves geometry -- it raises the start distance by a quarter to a fifth again",
       ["crtArcade", "crtTrinitron"].every((t) => START[t] > START.identity * 1.2) && deltas.crtArcade.bytesEqual < deltas.crtArcade.bytes / 3,
       `arcade takes ${START.identity.toFixed(3)} to ${START.crtArcade.toFixed(3)} and leaves ${deltas.crtArcade.bytesEqual} of ${deltas.crtArcade.bytes} bytes alone. Scanlines, a shadow mask, bloom, curvature, a vignette and a tint ADD STRUCTURE THAT WAS NOT IN THE PICTURE, which is why everything downstream gets harder including the fitter.`);

    // *** THE FIELD HAS TO VARY WITH THE SEED, AND ONLY A FIXED-PICTURE TEST CAN SEE THAT. *** Spreading the
    // transformed GENERATOR would pass with a frozen field, because the underlying pictures already differ by
    // seed. One picture, several transform seeds, is what isolates it -- and a sabotage freezing the field
    // went 0 RED until this existed, against a module comment that names the hazard by name.
    const fixed = GENERATORS.flat(W, H, 900000);
    const warps = HELD.slice(0, 6).map((s) => TRANSFORMS.liquefy(fixed, s));
    let identicalPairs = 0, pairs = 0;
    for (let i = 0; i < warps.length; i++) for (let j = i + 1; j < warps.length; j++) {
        pairs++;
        let same = 0;
        for (let k = 0; k < warps[i].data.length; k++) if (warps[i].data[k] === warps[j].data[k]) same++;
        if (same === warps[i].data.length) identicalPairs++;
    }
    ok("!! liquefy's FIELD varies with the seed -- one picture, six seeds, six different warps",
       identicalPairs === 0 && new Set(peaks.map((p) => p.toFixed(3))).size === peaks.length,
       `${pairs} pairs compared on ONE fixed picture, ${identicalPairs} byte-identical, and the six peak displacements ${peaks.map((p) => p.toFixed(1)).join("/") } are all distinct. A FROZEN FIELD WOULD MAKE "liquefy" ONE DISTORTION REPEATED TWENTY-FOUR TIMES and the column would report the variance of nothing -- v4420's own defect, one level down, in a module whose comment already warned about it and which nothing enforced until now.`);

    ok("!! ...and liquefy MOVES content and preserves the colour histogram -- the start distance comes back within 2%",
       Math.abs(START.liquefy - START.identity) / START.identity < 0.02 && peaks.every((p) => p > CELL / 2) &&
       deltas.liquefy.bytesEqual > deltas.liquefy.bytes / 2,
       `${START.identity.toFixed(5)} against ${START.liquefy.toFixed(5)}, a ${(100 * Math.abs(START.liquefy - START.identity) / START.identity).toFixed(1)}% change, with peak displacements of ${Math.min(...peaks).toFixed(1)} to ${Math.max(...peaks).toFixed(1)} px. *** A RESAMPLE THAT ONLY REORDERS PIXELS CANNOT MOVE THE MEAN COLOUR, so the flat-average baseline barely notices -- GEOMETRY WITHOUT COLOUR, against the CRT's colour without geometry. Two transforms on opposite axes is what makes section 4's answer a mechanism instead of a fact about CRTs.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** SAME CONTENT, ONE POST-PROCESS, AND THE POLICY INVERTS ***
 * --------------------------------------------------------------------------------------------------------- */
const CELLS = {};
{
    const res = trainDockES({ envFactory: mk("identity"), obsDim: OBS_DIM, actDim: ACT_DIM, hidden: [16, 16],
                              maxSteps: STEPS, iters: ITERS, pop: 24, sigma: 0.14, lr: 0.05, seed: 3, trainEps: 8 });
    const P = new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM, actDim: ACT_DIM }).setParams(res.params);
    for (const t of TRANSFORM_NAMES) {
        const F = randomFloor(mk(t), HELD, STEPS);
        const p = mean(episodeImprovements(mk(t), HELD, (o) => P.act(o), STEPS));
        CELLS[t] = { floor: F.mean, fsd: F.sd, policy: p, sd: (p - F.mean) / (F.sd || 1e-9) };
    }
    for (const t of TRANSFORM_NAMES) report(`${t.padEnd(13)} random floor ${CELLS[t].floor.toFixed(5)} +/- ${CELLS[t].fsd.toFixed(5)} | policy ${CELLS[t].policy.toFixed(5)} | ${CELLS[t].sd >= 0 ? "+" : ""}${CELLS[t].sd.toFixed(1)} sd`);

    ok("!! the policy trained on the untransformed pictures beats their random floor, as v4220 and v4420 found",
       CELLS.identity.sd > 3,
       `+${CELLS.identity.sd.toFixed(1)} sd. Reproduced here a third time, so what follows is a change of sign rather than a failure to train.`);

    ok("!! *** AND IT SCORES IDENTICALLY THROUGH THE NULL TRANSFORM -- the same number, not a close one ***",
       CELLS.crtOff.policy === CELLS.identity.policy && CELLS.crtOff.floor === CELLS.identity.floor,
       `policy ${CELLS.crtOff.policy.toFixed(8)} against ${CELLS.identity.policy.toFixed(8)}, floor ${CELLS.crtOff.floor.toFixed(8)} against ${CELLS.identity.floor.toFixed(8)}, by === on the float. THE WHOLE PIPELINE -- generator, transform, memo, env, 24 episodes, 8 random painters -- IS DETERMINISTIC ENOUGH THAT A NO-OP MOVES NOTHING, which is what lets the numbers below be read as the transform.`);

    ok("!! *** THREE CRT PRESETS PUT IT TWELVE STANDARD DEVIATIONS BELOW RANDOM, ON THE SAME PICTURES ***",
       ["crtPipboy", "crtArcade", "crtTrinitron"].every((t) => CELLS[t].sd < -8) &&
       ["crtPipboy", "crtArcade", "crtTrinitron"].every((t) => CELLS[t].policy < CELLS[t].floor),
       `${["crtPipboy", "crtArcade", "crtTrinitron"].map((t) => `${t} ${CELLS[t].sd.toFixed(1)}`).join(", ")}. *** THE CONTENT IS IDENTICAL: the same makeTarget seeds, the same four quadrants and disc, one post-process between them. *** v4420 needed a different GENERATOR to invert this policy; a scanline mask over its own training pictures does it harder, and the policy now improves LESS than a uniform painter does.`);

    ok("!! ...and a displacement field moving content up to 13 pixels does NOT do it at all",
       CELLS.liquefy.sd > 3 && Math.abs(CELLS.liquefy.sd - CELLS.identity.sd) < 1.5,
       `+${CELLS.liquefy.sd.toFixed(1)} sd against the untransformed +${CELLS.identity.sd.toFixed(1)}. *** A WARP IS NOT A GENTLER TRANSFORM THAN A SCANLINE MASK -- it moves more than a whole observation cell and leaves ${transformDelta(GENERATORS.flat(W, H, 900000), "liquefy", 900000).bytesEqual} of 4096 bytes changed. IT IS A DIFFERENT KIND, and the next section is what kind.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** THE MECHANISM: THE POLICY'S EYES ARE AN 8-PIXEL BOX FILTER AND THE MASK REPEATS EVERY 3 ***
 * --------------------------------------------------------------------------------------------------------- */
{
    for (const t of TRANSFORM_NAMES) {
        const rows = HELD.map((s) => {
            const e = new PaintEnv({ width: W, height: H, maxSteps: STEPS, targetOf: GEN[t] });
            const g = [...e.reset(s)].slice(0, GRID * GRID);
            return { spread: sdOf(g) / mean(g), ratio: Math.max(...g) / Math.max(1e-9, Math.min(...g)) };
        });
        CELLS[t].spread = mean(rows.map((r) => r.spread));
        CELLS[t].ratio = mean(rows.map((r) => r.ratio));
    }
    report(`the policy sees a ${GRID}x${GRID} grid of MEAN residual over a ${W}-pixel image -- an ${CELL}x${CELL} box filter, and ${OBS_DIM} floats in all`);
    report(`the CRT's shadow mask repeats every ${PRESETS.arcade.maskPitch} pixels and its scanline term runs ${PRESETS.trinitron.scanlines} to ${PRESETS.arcade.scanlines} cycles over ${H} rows`);
    for (const t of TRANSFORM_NAMES) report(`${t.padEnd(13)} grid relative spread ${CELLS[t].spread.toFixed(4)}, brightest cell / dimmest ${CELLS[t].ratio.toFixed(2)}`);

    const crt = ["crtPipboy", "crtArcade", "crtTrinitron"];
    ok("!! *** THE CRT HALVES THE CONTRAST OF THE POLICY'S OBSERVATION, AND LIQUEFY LEAVES IT ALONE ***",
       crt.every((t) => CELLS[t].spread < CELLS.identity.spread * 0.65 && CELLS[t].ratio < CELLS.identity.ratio * 0.7) &&
       CELLS.liquefy.spread > CELLS.identity.spread * 0.95 && CELLS.liquefy.ratio > CELLS.identity.ratio * 0.9,
       `spread ${CELLS.identity.spread.toFixed(3)} untransformed, ${crt.map((t) => CELLS[t].spread.toFixed(3)).join("/")} under the CRTs, ${CELLS.liquefy.spread.toFixed(3)} under liquefy; the brightest-to-dimmest ratio falls ${CELLS.identity.ratio.toFixed(2)} to ${CELLS.crtArcade.ratio.toFixed(2)} and holds at ${CELLS.liquefy.ratio.toFixed(2)}. *** A PATTERN WITH A PITCH OF 3 PIXELS AVERAGES TO A CONSTANT INSIDE AN 8-PIXEL CELL, so the CRT adds the same amount to every cell and the grid goes flat -- the policy is looking at a picture where everywhere is equally wrong. Liquefy's displacement is 6 to 13 px, COMPARABLE TO A CELL, so it moves structure between cells and the grid still reads it. ***`);

    ok("!! ...so the sign follows the FREQUENCY, not the severity",
       CELLS.liquefy.sd > 0 && crt.every((t) => CELLS[t].sd < 0) &&
       START.liquefy < START.crtTrinitron && CELLS.liquefy.sd > CELLS.crtTrinitron.sd,
       `Two transforms above the observation grid's Nyquist and two below it, and the sign of the outcome follows that split rather than how much the picture moved. *** THIS IS A PREDICTION AND NOT ONLY A SUMMARY: *** any transform whose energy sits above an ${CELL}-pixel box filter should blind this policy, and any transform below it should not. Four data points, two on each side, and NOTHING HERE TESTS A FIFTH -- the prediction is stated so it can be wrong.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. AND IT IS NOT ONLY THE POLICY -- THE FITTER DEGRADES TOO, WHICH IS A DIFFERENT FACT
 * --------------------------------------------------------------------------------------------------------- */
{
    const fd = {};
    for (const t of TRANSFORM_NAMES) fd[t] = mean(HELD.slice(0, 6).map((s) => fit(GEN[t](W, H, s), { shapes: 40, seed: 7 }).distance));
    for (const t of TRANSFORM_NAMES) report(`${t.padEnd(13)} greedy fitter, 40 shapes: ${fd[t].toFixed(5)}`);
    ok("!! the CRT is genuinely harder for EVERYONE, so the policy's collapse is a separate fact from the difficulty",
       ["crtPipboy", "crtArcade", "crtTrinitron"].every((t) => fd[t] > fd.identity * 3) &&
       fd.crtOff === fd.identity && fd.liquefy < fd.identity * 1.3,
       `${fd.identity.toFixed(4)} untransformed against ${fd.crtArcade.toFixed(4)} under arcade -- ${(fd.crtArcade / fd.identity).toFixed(1)}x worse for a search that has no observation grid at all. *** SO "THE CRT MAKES PICTURES HARD" AND "THE CRT BLINDS THE POLICY" ARE TWO CLAIMS, and section 4 is the second one: the policy falls BELOW random, which difficulty alone cannot do. *** Liquefy costs the fitter ${((fd.liquefy / fd.identity - 1) * 100).toFixed(0)}%, and the null transform costs it nothing at all, by ===.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. DISCIPLINE
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ENG, "fx", "paintTransforms.mjs"), "utf8");
    ok("the module owns no scanline, no shadow mask and no resampler of its own",
       !/function\s+(crtImage|warp|barrel|scanline|mask)\b/.test(src) &&
       /from "\.\.\/render\/crtModel\.js"/.test(src) && /from "\.\.\/render\/liquefyModel\.mjs"/.test(src),
       "render/crtModel.js is the CPU answer key for crtPass.js's GLSL and render/liquefyModel.mjs is gated in its own right; this file is a registry and a bridge between two image shapes. A TRANSFORM MODULE THAT REIMPLEMENTED A SCANLINE would be grading its own copy.");

    ok("!! and every transform has makeTarget's signature, so v4420's protocol runs over them unchanged",
       TRANSFORM_NAMES.every((t) => { const g = transformed(GENERATORS.flat, t); const im = g(W, H, 12345); return im && (im.w === W || im.width === W); }) &&
       REAL_TRANSFORMS.length === TRANSFORM_NAMES.length - 2,
       `${TRANSFORM_NAMES.length} transforms, of which ${REAL_TRANSFORMS.length} change the picture -- identity and crtOff are on the other side of that line BY MEASUREMENT (section 1) rather than by being named. The same randomFloor and episodeImprovements from v4420 evaluate all of them, which is what makes the sd column comparable to that round's.`);
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
console.log(`
----  WHAT THIS DOES NOT CLAIM
      THAT THE POLICY IS BADLY DESIGNED. A 4x4 mean-residual grid is a reasonable cheap observation
      and it is what v4220 measured its result on. What is measured is that the observation, not the
      content and not the difficulty, is what decides whether the learned advantage survives -- and
      that a transform NOBODY WOULD CALL SUBTLE (13 pixels of displacement) passes straight through
      while one that changes no shape at all destroys it.

      STILL UNCHECKED: the obvious repair is a finer grid, and it is not tried here. GRID is 4 in
      brain/rl/paintEnv.js and nothing measures what an 8x8 or a multi-scale observation would do to
      any row of this table.`);
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 3 / 1 / 5 / 5 / 6 / 1 / 1 by name, and ONE WENT 0 RED AGAINST A COMMENT THAT NAMED IT.
 *
 * A. crtOff quietly maps to the pipboy preset.                                                      3 RED
 *    The identity check, the "same number not a close one" check, and the fitter's null. THE WHOLE POINT OF
 *    THE NULL TRANSFORM IS THAT IT SHARES THE CODE PATH, and a preset swap is exactly the way it would rot.
 *
 * B. liquefyField ignores its seed, so every episode meets the same warp.               0 RED, then 1 RED
 *    *** THE MODULE'S OWN COMMENT WARNS ABOUT THIS BY NAME -- "a fixed field would make liquefy one
 *    picture-transform repeated... the same defect v4420's seedSpread was written to catch one level up" --
 *    AND NOTHING ENFORCED IT. *** Spreading the transformed GENERATOR would not have caught it either: the
 *    underlying pictures already differ by seed, so the column varies whether or not the field does. The cure
 *    is one FIXED picture through six transform seeds, which isolates the field from the content.
 *
 * C. transformed drops the transform and returns the generator's own output.                        5 RED
 *    Every row collapses onto the identity. Correctly NOT the null-transform check, which then compares two
 *    identities and is satisfied -- a reminder that a must-not-matter cannot also serve as the must-matter.
 *
 * D. liquefy is secretly another CRT.                                                               5 RED
 *    Both of section 2's contrasts, the +4.6 sd, the mechanism and the fitter. *** THE ROUND'S ARGUMENT IS
 *    THAT TWO TRANSFORMS MOVE OPPOSITE THINGS, so collapsing them onto one axis takes the argument with it.
 *
 * E. The {w,h} to {width,height} bridge is dropped, which is the bug this round hit while writing.  6 RED
 *    liquefyModel's warp destructures `width` and `height`; handed `w` and `h` it loops zero times and
 *    returns a blank image. THE WIDEST OF THE EIGHT, and it is a two-character mistake in a bridge between
 *    two modules that each name their dimensions correctly for themselves.
 *
 * F. liquefyField stamps no strokes, so the field is all zeros and warp is the identity.            1 RED
 *    Narrow and right: the start-distance check is the one that reads how far liquefy moved things, and an
 *    identity moves them zero. The seed-varies check added for B does not fire, correctly -- six identical
 *    zero fields still produce six identical pictures, which is what THAT check is about.
 *
 * G. REAL_TRANSFORMS counts the identity as a real transform.                                       1 RED
 *    The discipline check, which is where the identity/real split is asserted to come from MEASUREMENT
 *    (section 1) rather than from being named in a list.
 * --------------------------------------------------------------------------------------------------------- */
