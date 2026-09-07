#!/usr/bin/env node
// tools/ship/paintTransfer-selfcheck.mjs -- v4420
//
// Run: node tools/ship/paintTransfer-selfcheck.mjs      (pure: no GL, no canvas, no model, no network. Trains.)
//
// *** "HELD-OUT PICTURES" MEANT HELD-OUT SEEDS, AND ONE GENERATOR OVER THE SIGN FLIPS. ***
//
// v4220 trained a policy to PLACE shapes and evaluated it on twenty-four seeds its gate calls "held-out
// pictures", finding it beats a measured random floor by more than three standard deviations. That claim is
// TRUE AND IT STILL PASSES. What nobody had said is that every one of those twenty-four is makeTarget --
// four flat quadrants and a disc -- so varying the seed varies the colours and the split AND NOTHING ELSE.
// Held-out seeds and a held-out distribution are different claims, and this round measures the difference.
//
// ---- THE TRANSFER MATRIX, IN STANDARD DEVIATIONS ABOVE EACH GENERATOR'S OWN RANDOM FLOOR ----------------------
//
//                     flat     ramp   marched    krbn     fire
//     trained on flat  +4.4     +4.0     -6.0    -1.2     -2.0
//     trained on fire -12.0     -1.5     -5.4    -3.1    +19.2
//
// *** THE DIAGONAL IS STRONGLY POSITIVE AND ALMOST EVERY OFF-DIAGONAL IS BELOW ZERO. *** A policy trained on
// flat regions is SIX SD WORSE THAN UNIFORMLY RANDOM PLACEMENT on a ray-marched frame; one trained on fire is
// TWELVE SD WORSE on flat regions. It does not merely fail to transfer, IT TRANSFERS NEGATIVELY, which is
// worse than having learned nothing at all.
//
// The one positive off-diagonal is flat -> ramp at +4.0, and it has an obvious reason: both are large
// low-frequency fields where a big rectangle in roughly the right place is most of the answer. NAMED HERE
// RATHER THAN LEFT OUT, because an exception that is explained is worth more than a table with no holes.
//
// ---- AND THE FAILURE IS UNIFORM, NOT A FEW BAD EPISODES ---------------------------------------------------------
//
// On its own distribution each policy loses to the random painter on 1 to 8 of the 24 episodes. Off it, on 13
// to 22 of 24. So the negative numbers above are not a mean dragged by outliers; the policy is worse nearly
// everywhere it did not train.
//
// ---- WHAT THE TRAINING DID NOT CHANGE ---------------------------------------------------------------------------
//
// The trained policy covers 24% of the canvas per proposal, on every generator. So does an UNTRAINED one --
// 23.7% to 24.8%, indistinguishable -- while random covers 15.8% by construction. *** THE SHAPE'S SIZE IS SET
// BY THE ARCHITECTURE, NOT BY THE TRAINING: *** near-zero outputs from a fresh tanh network land mid-range,
// and mid-range is a shape of about that area. What training moved is WHERE the shape goes, and where is
// exactly the part that is a fact about one distribution.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PaintEnv, OBS_DIM, ACT_DIM, makeTarget } from "../../brain/rl/paintEnv.js";
import { trainDockES, FlightPolicy } from "../../brain/rl/dockPolicy.js";
import { spansOf, areaOf } from "../../fx/primitiveFit.mjs";
import { distinctColours } from "../../fx/paintTargets.mjs";
import { GENERATORS, GENERATOR_NAMES, memoGenerator, seedSpread, episodeImprovements, randomFloor, lcg } from "../../fx/paintGenerators.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const STEPS = 20, ITERS = 100, W = 32, H = 32;
const HELD = Array.from({ length: 24 }, (_, k) => 900000 + k * 2237);   // v4220's own held-out seeds
const GEN = {};
for (const n of GENERATOR_NAMES) GEN[n] = memoGenerator(GENERATORS[n], { w: W, h: H });
const mk = (n) => (o = {}) => new PaintEnv({ width: W, height: H, maxSteps: STEPS, targetOf: GEN[n], ...o });

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** WHAT "HELD OUT" MEANT: THE SEED MOVED AND THE GENERATOR DID NOT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const colours = HELD.map((s) => distinctColours(makeTarget(W, H, s)));
    report(`v4220's twenty-four held-out seeds: distinct colours ${Math.min(...colours)} to ${Math.max(...colours)} across all of them`);
    ok("!! *** EVERY ONE OF THE HELD-OUT 'PICTURES' IS FIVE FLAT REGIONS ***",
       colours.every((c) => c === 5),
       `${colours.length} seeds, ${colours[0]} colours each. *** VARYING THE SEED VARIES THE FOUR QUADRANT COLOURS, THE DISC COLOUR, THE SPLIT AND THE DISC's PLACE. IT DOES NOT VARY WHAT KIND OF PICTURE IT IS. *** v4220's gate calls these "held-out pictures" and beats the random floor on them by more than three sd, which is true and still passes -- but held-out SEEDS and a held-out DISTRIBUTION are different claims and only the first was ever measured.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. FIVE GENERATORS, AND EVERY ONE HAS TO MOVE UNDER ITS SEED
 * --------------------------------------------------------------------------------------------------------- */
{
    // *** MEASURED ON THE WRAPPERS THE ENV ACTUALLY GETS, NOT ON THE RAW GENERATORS. *** The first draft
    // checked GENERATORS[n] while every episode below is fed GEN[n] -- the memoised wrapper -- so a cache
    // keyed on nothing rather than on the seed handed all 24 episodes one picture and this check saw nothing.
    // A SABOTAGE DOING EXACTLY THAT WENT 1 RED, and the red was an incidental one about shape size.
    const rows = GENERATOR_NAMES.map((n) => ({ n, ...seedSpread(GEN[n], HELD.slice(0, 8), { w: W, h: H }) }));
    for (const r of rows) report(`${r.n.padEnd(8)} mean pairwise distance over ${r.pairs} seed pairs ${r.mean.toFixed(6)}, worst identical-pixel fraction ${r.worstIdenticalFraction.toFixed(4)}`);
    ok("!! no generator hands two different seeds the same picture",
       rows.every((r) => r.worstIdenticalFraction < 0.98 && r.mean > 0.1),
       `*** THE FIRST DRAFT OF THE KRBN GENERATOR PICKED A MESH WITH seed % 4 AND VARIED NOTHING ELSE, so two of six seeds landed on the same mesh and produced BYTE-IDENTICAL pictures -- worstIdenticalFraction 1.0000. *** seedSpread is what caught it, before any policy number was read off it. A generator that can hand the same picture to two "different" episodes reports the variance of nothing, which is this round's own subject one level down. The light direction is now seeded too.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** EACH GENERATOR HAS ITS OWN RANDOM FLOOR, AND THEY DIFFER BY 4.5x ***
 * --------------------------------------------------------------------------------------------------------- */
const FLOOR = {};
{
    for (const n of GENERATOR_NAMES) FLOOR[n] = randomFloor(mk(n), HELD, STEPS);
    for (const n of GENERATOR_NAMES) report(`${n.padEnd(8)} random floor ${FLOOR[n].mean.toFixed(5)} +/- ${FLOOR[n].sd.toFixed(5)} over 8 independent uniform painters`);
    const ms = GENERATOR_NAMES.map((n) => FLOOR[n].mean);
    ok("!! the floors span 4.5x, so 'beats random by N sd' is a statement about a DISTRIBUTION",
       Math.max(...ms) / Math.min(...ms) > 3 && GENERATOR_NAMES.every((n) => FLOOR[n].sd > 0),
       `${GENERATOR_NAMES.map((n) => `${n} ${FLOOR[n].mean.toFixed(4)}`).join(", ")} -- ${(Math.max(...ms) / Math.min(...ms)).toFixed(1)}x from the Krbn frame to the ramp. CARRYING ONE FLOOR TO ANOTHER GENERATOR WOULD MAKE A POLICY LOOK TRANSFORMATIVE ON AN EASY TARGET AND BROKEN ON A HARD ONE with nothing about the policy having changed, so every row below is measured against its own column's floor.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** THE TRANSFER MATRIX: THE DIAGONAL IS POSITIVE AND ALMOST EVERYTHING ELSE IS BELOW RANDOM ***
 * --------------------------------------------------------------------------------------------------------- */
const ROWS = {};
{
    for (const trainOn of ["flat", "fire"]) {
        const res = trainDockES({ envFactory: mk(trainOn), obsDim: OBS_DIM, actDim: ACT_DIM, hidden: [16, 16],
                                  maxSteps: STEPS, iters: ITERS, pop: 24, sigma: 0.14, lr: 0.05, seed: 3, trainEps: 8 });
        const P = new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM, actDim: ACT_DIM }).setParams(res.params);
        ROWS[trainOn] = { policy: P, cells: GENERATOR_NAMES.map((n) => {
            const per = episodeImprovements(mk(n), HELD, (o) => P.act(o), STEPS);
            const m = mean(per);
            let lost = 0;
            for (let i = 0; i < HELD.length; i++) if (per[i] < FLOOR[n].per[i]) lost++;
            return { n, mean: m, sd: (m - FLOOR[n].mean) / (FLOOR[n].sd || 1e-9), lost };
        }) };
        report(`trained on ${trainOn.toUpperCase()}: ${ROWS[trainOn].cells.map((c) => `${c.n} ${c.sd >= 0 ? "+" : ""}${c.sd.toFixed(1)}`).join("  ")}   (sd above each column's own random floor)`);
    }

    const diag = [ROWS.flat.cells[0], ROWS.fire.cells[4]];
    ok("!! each policy beats its OWN generator's random floor by more than 3 sd -- v4220's claim, twice",
       diag.every((c) => c.sd > 3),
       `flat +${diag[0].sd.toFixed(1)} sd, fire +${diag[1].sd.toFixed(1)} sd. The training works and this round does not say otherwise. THE TRAINING BUDGET IS ${ITERS} ITERATIONS RATHER THAN v4220's 150 and the flat row is unchanged to a tenth of a sd, so nothing below is an artefact of undertraining.`);

    const off = [...ROWS.flat.cells.filter((c) => c.n !== "flat"), ...ROWS.fire.cells.filter((c) => c.n !== "fire")];
    const below = off.filter((c) => c.sd < 0);
    ok("!! *** AND OFF ITS OWN DISTRIBUTION IT IS WORSE THAN UNIFORMLY RANDOM PLACEMENT, SEVEN TIMES OF EIGHT ***",
       below.length >= 7 && Math.min(...off.map((c) => c.sd)) < -5,
       `${below.length} of ${off.length} off-diagonal cells are BELOW the random floor, the worst at ${Math.min(...off.map((c) => c.sd)).toFixed(1)} sd. *** IT DOES NOT MERELY FAIL TO TRANSFER, IT TRANSFERS NEGATIVELY -- worse than having learned nothing, because a uniform painter would have done better. *** The single positive off-diagonal is flat -> ramp at +${ROWS.flat.cells[1].sd.toFixed(1)}, and it has a reason: both are large low-frequency fields where one big rectangle in roughly the right place is most of the answer. AN EXCEPTION WITH A REASON IS WORTH MORE THAN A TABLE WITH NO HOLES.`);

    ok("!! ...and the two rows are not the same policy failing -- the matrix has structure",
       ROWS.fire.cells[4].sd > ROWS.flat.cells[4].sd + 10 && ROWS.flat.cells[0].sd > ROWS.fire.cells[0].sd + 10,
       `on FIRE the fire-trained policy scores ${ROWS.fire.cells[4].sd.toFixed(1)} sd against the flat-trained one's ${ROWS.flat.cells[4].sd.toFixed(1)}; on FLAT the positions reverse, ${ROWS.flat.cells[0].sd.toFixed(1)} against ${ROWS.fire.cells[0].sd.toFixed(1)}. *** THAT IS WHAT RULES OUT "THE SECOND TRAINING SIMPLY DID NOT WORK". *** Each policy is excellent exactly where it trained and worse than random almost everywhere else, which is a statement about the EVALUATION and not about the learner.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THE FAILURE IS UNIFORM ACROSS EPISODES, NOT A MEAN DRAGGED BY OUTLIERS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const own = [ROWS.flat.cells[0], ROWS.fire.cells[4]];
    const off = [...ROWS.flat.cells.filter((c) => c.n !== "flat"), ...ROWS.fire.cells.filter((c) => c.n !== "fire")];
    for (const r of ["flat", "fire"]) report(`trained on ${r.toUpperCase()}: episodes lost to the random painter, of ${HELD.length} -- ${ROWS[r].cells.map((c) => `${c.n} ${c.lost}`).join(", ")}`);
    ok("!! on its own generator it loses a minority of episodes; off it, a large majority",
       own.every((c) => c.lost <= HELD.length / 2) && off.filter((c) => c.lost > HELD.length * 0.5).length >= 6,
       `own ${own.map((c) => c.lost).join(" and ")} of ${HELD.length}; off-diagonal ${off.map((c) => c.lost).join(", ")}. A NEGATIVE MEAN CAN BE ONE CATASTROPHIC EPISODE AND TWENTY-THREE GOOD ONES, and that would be a different finding with a different cure. It is not: the policy is worse on most of the pictures it did not train on, one at a time.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. *** WHAT THE TRAINING DID NOT CHANGE: THE SIZE OF THE SHAPE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const untrained = new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM, actDim: ACT_DIM, seed: 3 });
    const areaOfRun = (n, act) => {
        let a = 0, c = 0;
        for (const s of HELD.slice(0, 8)) {
            const e = mk(n)(); let o = e.reset(s);
            for (let t = 0; t < STEPS; t++) { const act1 = act(o, t); a += areaOf(spansOf(e.shapeFor(act1), W, H)); c++; o = e.step(act1).obs; }
        }
        return a / c / (W * H);
    };
    const rows = GENERATOR_NAMES.map((n) => {
        const r = lcg(1000);
        return { n, trained: areaOfRun(n, (o) => ROWS.flat.policy.act(o)), untrained: areaOfRun(n, (o) => untrained.act(o)),
                 random: areaOfRun(n, () => [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]) };
    });
    for (const r of rows) report(`${r.n.padEnd(8)} mean covered area per proposal: trained ${(100 * r.trained).toFixed(1)}%, UNTRAINED ${(100 * r.untrained).toFixed(1)}%, random ${(100 * r.random).toFixed(1)}%`);
    ok("!! *** THE SHAPE'S SIZE IS THE ARCHITECTURE'S, NOT THE TRAINING'S -- UNTRAINED PROPOSES THE SAME AREA ***",
       rows.every((r) => Math.abs(r.trained - r.untrained) < 0.03 && Math.abs(r.trained - r.random) > 0.05),
       `trained and untrained agree to within ${(100 * Math.max(...rows.map((r) => Math.abs(r.trained - r.untrained)))).toFixed(1)} points at every generator, while both differ from random by ${(100 * Math.min(...rows.map((r) => Math.abs(r.trained - r.random)))).toFixed(1)} or more. A fresh tanh network outputs near zero, and near zero maps to the MIDDLE of this env's size range. *** SO THE OBVIOUS EXPLANATION -- "IT LEARNED THAT BIG SHAPES WIN, AND BIG SHAPES LOSE ON A FIRE" -- IS WRONG, AND THE MEASUREMENT IS WHAT SAYS SO. *** What training moved is WHERE the shape goes, and where is precisely the part that is a fact about one distribution.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. DISCIPLINE
 * --------------------------------------------------------------------------------------------------------- */
{
    const env = fs.readFileSync(path.join(ENG, "brain", "rl", "paintEnv.js"), "utf8");
    ok("the env's default generator is unchanged -- makeTarget, so nothing that existed behaves differently",
       /this\.targetOf = typeof opts\.targetOf === "function" \? opts\.targetOf : makeTarget;/.test(env) &&
       /this\.target = this\.targetOf\(this\.w, this\.h, seed\);/.test(env),
       "One parameter with makeTarget as its default. v4220's gate passes untouched, which is the test of whether a change like this is a widening or a rewrite.");

    const gen = fs.readFileSync(path.join(ENG, "fx", "paintGenerators.mjs"), "utf8");
    ok("!! the floor and the policy are measured by the SAME function, which is why it is one function",
       /export function episodeImprovements/.test(gen) && /episodeImprovements\(mkEnv, seeds, \(\) =>/.test(gen) &&
       !/class\s|function\s+(makeTarget|rampTarget|marchedTarget|krbnTarget)\b/.test(gen),
       "randomFloor calls episodeImprovements and so does every policy row above. A FLOOR MEASURED BY ONE LOOP AND A POLICY BY A SLIGHTLY DIFFERENT ONE is the comparison that drifts in silence -- a different step count, a different reset, an env rebuilt in one and reused in the other -- and this whole round is a subtraction between the two. The generators themselves are all imported; this module writes none of them.");
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
console.log(`
----  WHAT THIS DOES NOT CLAIM
      THAT v4220 IS WRONG. Its claim is that the policy beats a measured random floor by more than
      three sd on held-out pictures, and that claim is reproduced here twice, at a smaller training
      budget. What is added is that "held-out pictures" meant held-out SEEDS, and that one generator
      over the sign flips -- so the number was never evidence about anything but makeTarget.

      NOR THAT THE POLICY COULD NOT LEARN TO TRANSFER. Nothing here trains on more than one
      generator, and a policy shown all five might well hold up on all five. THAT IS THE NEXT ROUND
      AND IT IS NOT THIS ONE: what is measured is what the existing evaluation supports, which is
      less than it was read to support.`);
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 5 / 3 / 1 / 1 / 1 / 1 / 1 / 3 / 5 by name, and one went 1 RED FOR THE WRONG REASON.
 *
 * A. PaintEnv ignores targetOf and builds makeTarget whatever it is handed.                         5 RED
 *    Every generator becomes flat, so the floors collapse together, the matrix loses its structure and the
 *    per-episode counts follow. The discipline check names the fault directly, which is what that check is
 *    for -- the others only say something is wrong.
 *
 * B. memoGenerator caches one picture for every seed.                            1 RED FOR THE WRONG REASON
 *    *** IT WENT 1 RED AND THE RED WAS THE SHAPE-SIZE CHECK -- INCIDENTAL. *** Section 2 was measuring
 *    seedSpread on GENERATORS[n], the RAW generators, while every episode in the gate is fed GEN[n], the
 *    MEMOISED wrapper. So the one check written to catch "this generator does not vary" could not see a
 *    wrapper that handed all twenty-four episodes the same picture. THE CHECK AND THE THING UNDER TEST WERE
 *    DIFFERENT OBJECTS, which is v4414's defect in a new place. Section 2 now measures the wrappers the env
 *    actually gets; re-run at 3 red, one of them section 2.
 *
 * C. seededKrbn drops the seeded light -- the first draft, which picked a mesh with seed % 4.        1 RED
 * D. seededRamp ignores its seed.                                                                   1 RED
 * E. seededFire ignores its seed.                                                                   1 RED
 *    All three land on section 2 and nowhere else, correctly: a generator that does not vary is exactly what
 *    that section exists to refuse, and it refuses each of them before any policy number is read off it.
 *
 * F. randomFloor uses one painter, so the spread is zero.                                           1 RED
 * G. randomFloor gives every painter the same rng seed -- eight painters, one sequence.             1 RED
 *    Both collapse the floor's standard deviation to zero, and both are caught by the check that asserts the
 *    floors are real. A DIVISION BY A ZERO SPREAD WOULD HAVE MADE EVERY sd IN THE MATRIX INFINITE and the
 *    round would have read as a spectacular result.
 *
 * H. randomFloor measures its floor over six more steps than the policy gets.                       3 RED
 *    *** THIS IS THE DRIFT THE SHARED-PROTOCOL CHECK IS ABOUT, and it is worth noticing that it is only
 *    possible because randomFloor passes `steps` on rather than taking the episode from the policy's side.
 *    The floor rises above the policy everywhere, so the diagonal fails and the round would have concluded
 *    the opposite of the truth -- with no error, no crash, and a table that looks exactly as plausible.
 *
 * I. episodeImprovements reports the final distance instead of the improvement.                     5 RED
 *    The sign of everything inverts. Broad and uninteresting, which is what a sabotage of the innermost
 *    measurement should be.
 *
 * *** AND A NOTE ON RUNNING THESE. *** The first pass timed out during G, which left the tree sabotaged AND a
 * clean backup beside it; the next pass then copied the SABOTAGED file over that backup, and the original was
 * gone. The harness now refuses to start when a stale backup exists. A SABOTAGE SUITE THAT CANNOT RESTORE IS
 * WORSE THAN NO SUITE -- it edits the thing it is grading.
 * --------------------------------------------------------------------------------------------------------- */
