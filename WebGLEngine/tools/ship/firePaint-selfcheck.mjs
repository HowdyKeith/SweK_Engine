#!/usr/bin/env node
// tools/ship/firePaint-selfcheck.mjs -- v4419
//
// Run: node tools/ship/firePaint-selfcheck.mjs      (pure: no GL, no canvas, no model, no network)
//
// *** EVERY TARGET THE PAINTER HAS EVER BEEN SHOWN STANDS STILL. *** makeTarget's five flat regions, v4417's
// ramp and ray-marched frame, v4418's four Krbn projections -- one picture each, held while the fitter works.
// render/doomFire.mjs is a SEEDED cellular automaton, and v4178 took its RNG as a constructor argument
// precisely so that "same seed, same field, frame for frame" would be true by construction. So the target can
// be made to MOVE UNDER A RULE THAT IS EXACTLY KNOWN, which is the one thing no fixture in this arc has been.
//
// ---- THE QUESTION, AND THE THIRD RUN THAT MAKES IT HONEST -------------------------------------------------------
//
// primitiveFit is greedy and stateless: it has no notion of a previous frame. A renderer painting a fire would
// obviously keep the canvas and add to it. Comparing those two alone would answer the wrong question, so there
// are three:
//
//   warm              one canvas, 10 shapes added per frame           -- what a real-time painter would do
//   cold, 10 shapes   from flat, 10 shapes, every frame               -- same per-frame work, no memory
//   cold, same TOTAL  from flat, as many shapes as warm has by now    -- same shapes, no staleness
//
// *** AND A STILL-TARGET CONTROL, WHICH IS WHAT MAKES THE THIRD ONE MEAN ANYTHING. *** On a target that does
// not move, "add 10 shapes to the canvas each round" and "fit 10k shapes from flat" are THE SAME COMPUTATION,
// because fit() is itself incremental. Measured over 25 frames the two curves are equal TO THE LAST BIT at
// every frame. So on a moving target the entire gap between them is the motion, isolated rather than argued.
//
//   MOVING:  warm is 32.7% better than cold-at-the-same-per-frame-cost, and 15.1% WORSE than cold-at-the-same-
//            total-shapes. The staleness COMPOUNDS -- 1.6%, 4.1%, 9.9%, 15.1% at 4, 8, 16 and 24 frames -- and
//            warm bottoms out at 0.0645 and stays there while cold-same-total is still falling at 0.0484.
//
// *** AND THE FIRE MOVES BY MORE THAN A WHOLE RESIDUAL PER FRAME: *** one step is 0.0702 against the 0.0662
// left after sixty shapes, a ratio of 1.06. The painter is behind after one frame, permanently.
//
// ---- A PALETTE THE COLOUR SOLVER CANNOT REACH -------------------------------------------------------------------
//
// Doom fire is 37 fixed colours; optimalColour() returns a continuous least-squares mean that is almost never
// one of them -- 12 of 60 here, median 8.12 RGB units away. Snapping every colour to the nearest palette entry
// costs 5.7%. *** SO primitiveFit's FIRST HEADLINE IDEA IS WORTH ABOUT A EIGHTEENTH OF ONE FRAME OF THE TARGET
// MOVING, on this target. *** It is exact and it is correct and it is not where the error is.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { fit, spansOf, areaOf, KINDS } from "../../fx/primitiveFit.mjs";
import { PALETTE } from "../../render/doomFire.mjs";
import { distinctColours, startDistanceOf, convergenceExponent } from "../../fx/paintTargets.mjs";
import { fireFrames, imageDistance, pixelsMoved, trackFrames, nearestPalette, snapToPalette } from "../../fx/firePaint.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const W = 64, H = 64, K = 25, BUDGET = 10, SEED = 7;
const FRAMES = fireFrames(K, { w: W, h: H });
const PAINT60 = fit(FRAMES[0], { shapes: 60, seed: SEED });
const MOVING = trackFrames(FRAMES, { budget: BUDGET, seed: SEED });
const STILL = trackFrames(Array(K).fill(FRAMES[0]), { budget: BUDGET, seed: SEED });

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE TARGET MOVES BY MORE THAN A WHOLE RESIDUAL PER FRAME, AND THE MOTION SATURATES AT ONCE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const steps = [1, 2, 4, 8, 16, 24].map((k) => ({ k, moved: pixelsMoved(FRAMES[0], FRAMES[k]), d: imageDistance(FRAMES[0], FRAMES[k]) }));
    report(`frame 200 of a seeded fire: ${distinctColours(FRAMES[0])} of the palette's ${PALETTE.length} colours present, flat-average start distance ${startDistanceOf(FRAMES[0]).toFixed(6)}`);
    for (const s of steps) report(`  +${String(s.k).padStart(2)} frames: ${String(s.moved).padStart(4)} of ${W * H} pixels changed, distance ${s.d.toFixed(6)}`);

    const one = steps[0].d;
    ok("!! *** ONE STEP OF THE RULE MOVES THE TARGET FURTHER THAN SIXTY SHAPES OF PAINTING REMOVED ***",
       one > PAINT60.distance,
       `one frame ${one.toFixed(6)} against the ${PAINT60.distance.toFixed(6)} left after ${PAINT60.shapes.length} shapes -- a ratio of ${(one / PAINT60.distance).toFixed(3)}. *** THE PAINTER IS BEHIND AFTER A SINGLE FRAME AND CANNOT CATCH UP, and that is a property of the subject rather than of the search: the fire is not drifting, it is RESAMPLING ITSELF. *** 23% of the pixels change every step.`);

    ok("!! ...and the motion SATURATES immediately -- one step is three quarters of what twenty-four do",
       steps[0].d > 0.6 * steps[5].d && steps[4].d < 1.15 * steps[3].d && steps[5].moved < steps[3].moved * 1.15,
       `${steps.map((s) => s.d.toFixed(4)).join(" -> ")} at +1, +2, +4, +8, +16, +24. THIS IS A STATIONARY PROCESS, NOT A DRIFT: the automaton has a fixed point and wanders around it, so "the target after twenty-four frames" is no further away than "the target after eight". A fixture that drifted would let a tracker fall behind by an amount that keeps growing, and the finding below would be about the fixture.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE STILL CONTROL: TWO RUNS THAT ARE THE SAME COMPUTATION, TO THE LAST BIT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    let same = 0;
    for (let k = 0; k < K; k++) if (STILL.warm[k] === STILL.coldTotal[k]) same++;
    report(`still target, ${K} rounds: warm ${STILL.warm.slice(0, 4).map((v) => v.toFixed(6)).join(" ")} ... ${STILL.warm[K - 1].toFixed(6)}`);
    report(`                          cold ${STILL.coldTotal.slice(0, 4).map((v) => v.toFixed(6)).join(" ")} ... ${STILL.coldTotal[K - 1].toFixed(6)}`);
    ok("!! *** ON A TARGET THAT DOES NOT MOVE, WARM-STARTING AND REFITTING ARE BIT-IDENTICAL ***",
       same === K,
       `equal at ${same} of ${K} frames, by === on the float. *** fit() IS ITSELF INCREMENTAL: it draws one shape at a time onto a canvas it never resets, so "add ten more" and "fit ten more from the start" walk the same states with the same rng. NOT AN APPROXIMATION AND NOT A COINCIDENCE. *** This is the control that makes section 3 a measurement: whatever separates those two curves on a MOVING target is the motion and nothing else.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** WARM-STARTING BEATS RE-SOLVING AND LOSES TO REFITTING, AND THE GAP COMPOUNDS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const w = mean(MOVING.warm.slice(1)), cb = mean(MOVING.coldBudget.slice(1)), ct = mean(MOVING.coldTotal.slice(1));
    report(`moving target, means over frames 1..${K - 1}: warm ${w.toFixed(6)} | cold at ${BUDGET} shapes/frame ${cb.toFixed(6)} | cold at the same TOTAL shapes ${ct.toFixed(6)}`);
    ok("!! keeping the canvas beats starting from grey every frame, at the same per-frame cost",
       w < cb * 0.85,
       `${(100 * (1 - w / cb)).toFixed(1)}% better. Obvious, and it had never been measured -- and it is the comparison a renderer would make, ${BUDGET} shapes of work per frame either way.`);

    const stale = [4, 8, 16, 24].map((n) => ({ n, w: mean(MOVING.warm.slice(1, n + 1)), c: mean(MOVING.coldTotal.slice(1, n + 1)) }));
    for (const s of stale) report(`  staleness after ${String(s.n).padStart(2)} frames: ${(100 * (s.w / s.c - 1)).toFixed(1)}%   (warm ${s.w.toFixed(6)}, cold at the same total ${s.c.toFixed(6)})`);
    ok("!! *** BUT IT LOSES TO THE SAME SHAPES FITTED FRESH, AND THE GAP GROWS WITH EVERY FRAME ***",
       stale.every((s, i) => i === 0 || s.w / s.c > stale[i - 1].w / stale[i - 1].c) && stale[3].w / stale[3].c > 1.12,
       `${stale.map((s) => (100 * (s.w / s.c - 1)).toFixed(1) + "%").join(" -> ")} at 4, 8, 16 and 24 frames -- MONOTONE. *** THE ACCUMULATED SHAPES CARRY STALE INFORMATION AND THE PAINTER HAS NO WAY TO RETIRE THEM: *** fit() discards a candidate that cannot improve the picture, and it has no operation at all for removing one it already drew. On a still target this gap is EXACTLY ZERO, at every frame, so every point of it is the motion.`);

    const tail = (a) => a.slice(3);
    const spread = (a) => Math.max(...tail(a)) / Math.min(...tail(a)) - 1;
    const gain = (a) => 1 - a[K - 1] / a[1];
    const worsened = (a) => { let n = 0; for (let i = 2; i < K; i++) if (a[i] > a[i - 1]) n++; return n; };
    report(`frames 3..${K - 1}: warm stays inside a ${(100 * spread(MOVING.warm)).toFixed(1)}% band (${Math.min(...tail(MOVING.warm)).toFixed(6)} to ${Math.max(...tail(MOVING.warm)).toFixed(6)}) while cold at the same totals spans ${(100 * spread(MOVING.coldTotal)).toFixed(1)}% (${Math.min(...tail(MOVING.coldTotal)).toFixed(6)} to ${Math.max(...tail(MOVING.coldTotal)).toFixed(6)})`);
    ok("!! ...and warm settles into a narrow band while refitting keeps marching down",
       spread(MOVING.warm) < spread(MOVING.coldTotal) / 3 && gain(MOVING.warm) < gain(MOVING.coldTotal) * 0.6 &&
       worsened(MOVING.warm) > worsened(MOVING.coldTotal),
       `*** THE FIRST DRAFT CLAIMED WARM "HITS A FLOOR AND STAYS THERE" AND THE MEASUREMENT SAID OTHERWISE: *** it does keep improving, by ${(100 * gain(MOVING.warm)).toFixed(1)}% from frame 1 to frame ${K - 1}, and asserting a flat line would have been a check that failed for the right reason. What is true is the RATE: cold at the same shape counts improves ${(100 * gain(MOVING.coldTotal)).toFixed(1)}% over the same frames, so warm takes ${(100 * gain(MOVING.warm) / gain(MOVING.coldTotal)).toFixed(0)}% of the improvement from the same extra shapes, hovers in a band a quarter as wide, and goes BACKWARDS on ${worsened(MOVING.warm)} of ${K - 2} frames against cold's ${worsened(MOVING.coldTotal)}. Each new shape has to paint over the last one's mistake as well as the target's change, and fit() has no operation for removing one it already drew.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** A PALETTE THE EXACT COLOUR SOLVER CANNOT REACH, AND WHAT SOLVING IS WORTH AGAINST IT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const ds = PAINT60.shapes.map((s) => nearestPalette(s.colour).distance).sort((a, b) => a - b);
    const onPalette = ds.filter((d) => d < 0.5).length;
    const snapped = snapToPalette(FRAMES[0], PAINT60.shapes);
    const oneFrame = imageDistance(FRAMES[0], FRAMES[1]);
    report(`${PAINT60.shapes.length} solved colours against ${PALETTE.length} palette entries: ${onPalette} land ON one, distance min ${ds[0].toFixed(2)} / median ${ds[ds.length >> 1].toFixed(2)} / max ${ds[ds.length - 1].toFixed(2)} RGB units`);
    report(`same shapes, same order, colours snapped to the nearest entry: ${snapped.distance.toFixed(6)} against the solved ${PAINT60.distance.toFixed(6)}`);

    ok("!! the exact least-squares colour is almost never a colour the target contains",
       onPalette < PAINT60.shapes.length / 3 && ds[ds.length >> 1] > 3,
       `${onPalette} of ${PAINT60.shapes.length}. A shape covers a mixture of palette entries and the mean of a mixture is not a member of it -- so the solver returns a colour the fire could not have produced, correctly, because it is solving for the LEAST SQUARES and not for plausibility.`);

    ok("!! *** AND SOLVING IT EXACTLY IS WORTH AN EIGHTEENTH OF ONE FRAME OF THE TARGET MOVING ***",
       PAINT60.distance < snapped.distance && (snapped.distance - PAINT60.distance) < oneFrame * 0.2,
       `solving buys ${(100 * (1 - PAINT60.distance / snapped.distance)).toFixed(1)}% -- ${(snapped.distance - PAINT60.distance).toFixed(6)} in absolute terms -- against ${oneFrame.toFixed(6)} for a single step of the fire. *** primitiveFit's FIRST HEADLINE IDEA IS EXACT, IS CORRECT, AND IS NOT WHERE THE ERROR IS ON THIS TARGET. *** v4417 found the same solver actively WRONG for a shape that gets occluded; this is the other half of its boundary -- right, and small.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** AN UNKNOWN SHAPE KIND USED TO BE AN ELLIPSE, BIT FOR BIT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const made = { kind: "doomFire", x: 20, y: 20, rx: 8, ry: 8 };
    const ell = { kind: "ellipse", x: 20, y: 20, rx: 8, ry: 8 };
    const a = spansOf(made, W, H), b = spansOf(ell, W, H);
    report(`spansOf({ kind: "doomFire", x, y, rx, ry }) -> ${a.length} rows, ${areaOf(a)} pixels; the same fields as an ellipse -> ${b.length} rows, ${areaOf(b)} pixels`);
    ok("!! *** A KIND THAT IS NOT IN KINDS NOW COVERS NOTHING, WHERE IT USED TO BE AN ELLIPSE ***",
       a.length === 0 && b.length > 0 && !KINDS.includes("doomFire") && KINDS.includes("ellipse"),
       `*** MEASURED BEFORE THE FIX: 16 rows and 208 pixels, BIT-IDENTICAL to the ellipse -- not "plausible", THE SAME SPANS. *** pointsOf() returns null for anything it does not recognise and spansOf() read that as "so it must be the ellipse", so a fifth primitive added to KINDS by name alone did not look like it worked, IT WAS ROUND. Returning no spans is the refusal that costs nothing: fitStep already treats an empty coverage as a rejected candidate, so no caller changes.`);

    ok("...and KINDS is now load-bearing rather than decorative -- it is what the refusal consults",
       KINDS.every((k) => spansOf({ kind: k, x: 20, y: 20, w: 10, h: 10, rx: 8, ry: 8, angle: 0.3, x1: 5, y1: 5, x2: 25, y2: 8, x3: 12, y3: 30, points: [[5, 5], [30, 8], [12, 30]] }, W, H).length > 0),
       `every one of ${KINDS.join(", ")} still rasterises. A FROZEN LIST NOTHING READS IS A COMMENT; this is the first thing in the module that consults it at run time. *** THE FIRST DRAFT ALSO ASSERTED KINDS.length === 4 AND v4421 BROKE IT BY ADDING A FIFTH. *** A count is not a contract: what this check needs is that the list does not contain the invented kind and does contain the real ones, which is a property, and the length was an arrangement that happened to hold.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. *** AND THE EXPONENT LEAVES v4417's BAND, WHICH CORRECTS SOMETHING v4418 SAID ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const p = convergenceExponent(FRAMES[0], [5, 10, 20, 40, 80, 160, 320]);
    const prior = { "five flat regions": 0.572, "a ramp": 0.713, "a marched frame": 0.433, "a Krbn projection": 0.378 };
    report(`fire's convergence exponent p = ${p.toFixed(3)}, against ${Object.entries(prior).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    ok("!! *** A FIFTH GENERATOR DOES NOT LAND IN THE BAND, AND v4418 SAID THE FOURTH DID ***",
       p > 0 && p < Math.min(...Object.values(prior)) / 1.5,
       `${p.toFixed(3)} is ${(Math.min(...Object.values(prior)) / p).toFixed(2)}x below the lowest of the four. *** v4418's section 5 says "a fourth independent generator lands in the same band, which is more evidence for that round's conclusion". THE FIFTH DOES NOT, AND ONE ROUND LATER IS THE RIGHT TIME TO SAY SO. *** v4417's CONCLUSION IS UNTOUCHED -- representability is still not the governing variable, and fire is no more representable than the ramp -- but "the exponents sit in a narrow band" was a claim about four points and it is not a law. Spatial frequency is the obvious candidate for what fire has that the other four do not, and NAMING A CANDIDATE IS NOT MEASURING ONE.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. DISCIPLINE
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ENG, "fx", "firePaint.mjs"), "utf8");
    ok("the module owns no automaton, no rasteriser and no colour solver of its own",
       !/class\s+DoomFire|function\s+(spansOf|optimalColour|fitStep)\b|PALETTE\s*=\s*\[/.test(src) &&
       /from "\.\.\/render\/doomFire\.mjs"/.test(src) && /from "\.\/primitiveFit\.mjs"/.test(src),
       "It calls render/doomFire.mjs for the fire and its palette, fx/primitiveFit.mjs for the fitting. addShapes() is fit()'s own loop with the canvas taken as an argument instead of created -- SAME fitStep, SAME drawShape, SAME rejection rule -- which is the only reason the still-target control can come out bit-identical.");

    // *** ASSERTED ON EVERY CHANNEL, BECAUSE A SABOTAGE READING ONLY RED WENT 0 RED. *** The palette's red
    // component repeats across adjacent intensities (223 at 12 and 13, 215 at 15 and 16, 207 at 18 and 19),
    // so a red-only comparison misses real changes -- and every check that reads pixelsMoved survived it,
    // because they read RATIOS and a zero. A helper whose contract is "how many pixels differ AT ALL" needs
    // the contract held, not the ratios it happens to feed.
    const one = { data: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]), w: 2, h: 1 };
    const chans = [1, 2].map((k) => { const d = new Uint8ClampedArray(one.data); d[k] = (d[k] + 40) & 255; return pixelsMoved(one, { data: d, w: 2, h: 1 }); });
    ok("!! pixelsMoved counts a change in ANY channel, not just the first",
       chans.every((n) => n === 1) && pixelsMoved(one, one) === 0,
       `a green-only change and a blue-only change each count as ${chans.join(" and ")} pixel; an image against itself counts 0. THE FIRE'S PALETTE REPEATS ITS RED COMPONENT at six pairs of adjacent intensities, so red alone is not a proxy for "the picture changed".`);

    ok("!! and the fire is SEEDED, so every number above is reproducible rather than a fire that looked right",
       (() => { const a = fireFrames(3), b = fireFrames(3); return a.every((im, i) => pixelsMoved(im, b[i]) === 0); })(),
       "Two independent runs, identical frame for frame. v4178 took the RNG as a constructor argument FROM THE START for exactly this: \"an unseeded automaton cannot be checked against anything -- you are left asserting that fire looks like fire\". This round is what that decision was for.");
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
console.log(`
----  WHAT THIS DOES NOT CLAIM
      THAT A TRACKING PAINTER IS A BAD IDEA. It is 33% better than the alternative a stateless fitter
      offers, and the comparison it loses is to a run doing far more work per frame. What is measured
      is that the loss EXISTS, that it COMPOUNDS, and that it is exactly zero when the target holds
      still -- so it is the motion and not the warm start.

      STILL UNCHECKED: fit() has no operation for RETIRING a shape. Every finding in section 3 points
      at one -- a painter that could drop the shape whose contribution has gone most negative would
      have somewhere to spend the budget that warm-starting currently wastes -- and nothing here
      builds it or measures what it would be worth.`);
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 2 / 0 / 5 / 5 / 3 / 1 / 1 / 1 / 1 by name, one 0 EARNED and one 0 THAT BOUGHT A CHECK.
 *
 * A. addShapes clears the canvas on entry, so the warm run becomes a cold one.                      2 RED
 *    The still-target identity and the warm-beats-cold comparison. Correctly NOT the staleness check: with
 *    warm reduced to cold-at-the-budget it is no longer the curve that check reads.
 *
 * B. addShapes draws a step whose delta is non-negative -- the discard rule removed.        0 RED, EARNED
 *    *** MEASURED RATHER THAN ASSUMED: in 250 fitStep calls across the whole run the branch NEVER FIRES. ***
 *    fitStep returns the best of sixty candidates plus a hill climb, and on a target this busy an improving
 *    shape is always among them, so the sabotage is INERT on this fixture and 0 red is the right answer. It
 *    is also already gated where it belongs -- primitiveFit-selfcheck asserts "the distance never increases
 *    -- a step that cannot improve is discarded, not drawn". A GUARD THAT NEVER FIRES ON ONE FIXTURE IS
 *    STILL RIGHT TO KEEP, and adding a fixture here to make it fire would be gold-plating another gate's key.
 *
 * C. fireFrames never advances the automaton, so every frame is the same picture.                   5 RED
 *    The motion checks, the staleness, the plateau and the palette pricing -- everything that needs the
 *    target to move. Not the still-target identity, correctly: that check WANTS a still target and gets one.
 *
 * D. fireFrames skips the settle, so the fixture is the ignition transient instead of a fire.       5 RED
 *    A front climbing an empty grid is a different picture from a burning one -- fewer colours, a different
 *    motion, a different exponent -- and five checks say so. THIS IS THE ONE THAT WOULD HAVE BEEN EASIEST TO
 *    SHIP BY ACCIDENT: the frames still look like fire.
 *
 * E. trackFrames gives cold-same-total the per-frame budget instead of the accumulated one.         3 RED
 *    The third run collapses onto the second, so the still-target identity breaks and the two comparisons
 *    that need "the same shapes, no staleness" have nothing to compare against.
 *
 * F. nearestPalette returns the FARTHEST entry.                                                     1 RED
 *    Only the pricing check, and correctly: nothing else reads it. Snapping to the worst entry makes the
 *    snapped painting far worse, so "solving buys a small amount" fails on the size of the gap.
 *
 * G. snapToPalette keeps the solved colour instead of snapping.                                     1 RED
 *    The pricing check again, from the other side: the two paintings become identical and the gap goes to
 *    zero, which fails the strict inequality. A CHECK ASSERTING ONLY "SMALL" WOULD HAVE PASSED THIS.
 *
 * H. The unknown-kind refusal removed from fx/primitiveFit.mjs -- back to the silent ellipse.       1 RED
 *    Section 5, which is what that fix exists for. Narrow because the fault is narrow: nothing else in the
 *    tree constructs a shape whose kind is not in KINDS.
 *
 * I. pixelsMoved compares only the red channel.                                          0 RED, then 1 RED
 *    *** IT WENT 0 RED BECAUSE EVERY CHECK THAT READS pixelsMoved READS A RATIO OR A ZERO, *** and both
 *    survive a channel-blind comparison. The palette's red component repeats across six pairs of adjacent
 *    intensities, so red alone genuinely misses changes -- the helper's contract is "how many pixels differ
 *    AT ALL" and nothing held it to that. A two-pixel fixture with a green-only and a blue-only change now
 *    does. Re-run at 1 red.
 * --------------------------------------------------------------------------------------------------------- */
