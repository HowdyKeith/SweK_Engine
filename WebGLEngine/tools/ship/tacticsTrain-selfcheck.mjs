// WebGLEngine/tools/ship/tacticsTrain-selfcheck.mjs -- v4849 (beside tools/ship/tacticsTrain.mjs)
//
// Run: node tools/ship/tacticsTrain-selfcheck.mjs
//
// GRADES THE TOOL THAT FITS THE ENDLESS-SKY TACTICS WEIGHTS IN THE ARENA, AND THE FILE IT WROTE. The tool's whole value is that it cannot flatter itself, and a search over eight numbers scored by a noisy fight has
// more ways to than most: it can climb the seeds it trains on (so there are three sets, disjoint, and the champion is picked on the second and graded once on the third); it can "beat the field" by beating a
// preset nobody would pick (so the incumbent is the best preset on the HELD-OUT seeds, and the champion must beat it head to head AND beat its record against the other seven AND not be led by any preset); it can
// credit a number the arena cannot see (wPlayer changes no battle -- nothing in the arena is a player -- and neither does fleeHyst, which a first full run discovered the hard way: nothing in the arena repairs a ship, so no fleeing ship ever recovers across the bar; both are held at the hand values and this gate runs the battles to say so); and it can read a fight from the wrong side
// (every battle is played from both, and written from the candidate's own point of view).
//
// So this gate holds: the argument parser refuses what it does not know; the battle from the candidate's side on either side; wPlayer's blindness; the mutation (seven numbers, one to three at a time, in range,
// never wPlayer); a search that starts from its preset and reports the score of the weights it returns; the prune; the qualification rule on a table of made-up results (each clause is the only thing that fails in
// its row, and the boundaries are held); run() on a recipe small enough to finish in seconds -- deterministic to the bit, the champion picked on the held-out score and not the train score, the incumbent chosen on
// the held-out seeds, the audit read once after the choice; a search in its own process is the same search; the file (right format, read by the roster's sanitizer with nothing to say, quotes the numbers it was graded
// on); the command line writes only what qualifies; and the SHIPPED file brain/tacticsWeightsTrained.json held to what it says about itself, on numbers recomputed here.
//
// SABOTAGES, v4849 (each broken in place in a scratch checkout, the gate run, the file restored; reds are rows):
//   X1  tacticsTrain.mjs: wPlayer added to the trained keys                                     7 red (the partition, the six-change-a-battle row, the mutation row, the start row, the rounding row, ...)
//   X2  tacticsTrain.mjs: fleeHyst added to the trained keys                                     5 red (the partition, the mutation row, the rounding/hand-values row, the shipped file's hand-values row, ...)
//   X3  tacticsTrain.mjs: mutate() unclamped                                                      1 red (the huge-step-is-held-to-the-range row)
//   X4  tacticsTrain.mjs: a battle on side B read from side A's point of view                     2 red (the side-B perspective row; the shipped file's `by`)
//   X5  tacticsTrain.mjs: evaluate() plays side A only                                            5 red (the perspective row, the battle count, the held-out and audit counts, the file's `by`)
//   X6  tacticsTrain.mjs: train() never updates the score it reports                              1 red (the reported-score-is-the-weights'-score row)
//   X7  tacticsTrain.mjs: train() starts from the hand weights, not its preset                     1 red (the starts-from-its-preset row)
//   X8  tacticsTrain.mjs: prune() accepts every reversion                                         2 red (the never-lowers-the-score row, the shipped file's fixed point)
//   X9  tacticsTrain.mjs: startVector() does not force the hand values                            3 red (the start row, the rounding/hand-values row, the shipped file's)
//   X10 tacticsTrain.mjs: qualifies(): head-to-head floor 8 -> 1                                  2 red (the floor-at-its-edge row; the worse-in-every-way row)
//   X11 tacticsTrain.mjs: qualifies(): field margin dropped                                       2 red (the margin-at-its-edge row; the worse-in-every-way row)
//   X12 tacticsTrain.mjs: qualifies(): held-out clause dropped                                    2 red (the held-out row; the worse-in-every-way row)
//   X13 tacticsTrain.mjs: qualifies(): the preset tolerance ignored                               2 red (the tolerance-at-its-edge row; the worse-in-every-way row)
//   X14 tacticsTrain.mjs: the incumbent chosen on the AUDIT seeds                                 1 red (the incumbent-is-the-held-out-best row)
//   X15 tacticsTrain.mjs: the champion picked on the TRAIN score                                  FIRST RUN 0 red -- the tiny recipe's train-best and held-out-best searches were the same search, so "picked on held-out" and "picked on train" gave one champion.
//                                                                                                 The row now runs a recipe chosen BECAUSE the two differ (iters 12, seed 7400, found by trying five): 1 red
//   X16 tacticsTrain.mjs: the audit read on the held-out seeds                                    1 red (the audit-is-640-battles-on-the-audit-seeds row)
//   X17 tacticsTrain.mjs: the search's numbers not rounded to three places                         1 red (the rounding row)
//   X18 tacticsTrain.mjs: the file drops wPlayer and fleeHyst                                     1 red (the file-is-eight-numbers row)
//   X19 trainTactics.mjs: --workers children are not handed --seed                                FIRST RUN 0 red -- the parallel-equals-sequential row used the default seed, which is also what a child that was never told one trains.
//                                                                                                 The row now uses seed 6100 and requires the report to name 6100/6101 and not 6000/6001: 1 red
//   X20 tacticsTrain.mjs: the audit seeds overlap the held-out seeds                              3 red (the disjoint-seed-sets row, the audit rows)
//   X21 tacticsTrain.mjs: a draw counts 0 in `share`                                              2 red (the evaluate-share row; the file's `by`)
//   X22 brain/tacticsWeightsTrained.json: wClose 0.629 -> 0.7                                      2 red (the file's `by`, the trainer's own rule on recomputed numbers)
//   X23 brain/tacticsWeightsTrained.json: `by` misquotes the audit (54 won -> 53)                  1 red (the `by` row)
//   X24 brain/tacticsWeightsTrained.json: wPlayer 0.35 -> 0                                        1 red (the hand-values row)
//   (and in brain/tacticsRoster-selfcheck.mjs, the roster's own gate: R1-R5, logged there.)
//   FOUND BEFORE THE SABOTAGES, BY THE GATE AND NOT BY ME: (1) the first full run's champion printed "player 0" -- scatter's own wPlayer, passed on by its start -- and the shipped file would have zeroed the game's bias toward the player; found
//   by reading the printout, then held by the start row. (2) The row written to claim "the other seven numbers DO change a battle" went red on fleeHyst: it changes none, in 144 battles by fleeing-prone sides, because nothing in the arena repairs
//   a ship. The first run had moved it for 300 iterations. Two numbers are now held at the hand values and the search moves six. (3) The audit seeds 50001+ were read by two runs while the design was corrected: SPENT_AUDIT_SEEDS, and the
//   shipped file was graded on 60001+, which nothing had read. The first run's champion had looked better on the spent audit (71.7% against 67.3%); the champion is the one the corrected procedure picks on HELD-OUT, and that is what ships.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as T from "./tacticsTrain.mjs";
import * as R from "../../brain/tacticsRoster.mjs";
import { runBattle } from "../../ev/tools/es-arena.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const J = (x) => JSON.stringify(x);
const mkRng = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

sec("1. the argument parser and the constants");
// v4850 -- six constants this gate never named (definitionGates' census, at the v4849 merge): what the shipped file must carry
// (FORMAT, POLICY_ID), the battle every fitness reading is taken in (PHYSICS, COUNT, MAX_SECONDS, as the file's own `by` cites
// them), and STEP, which must move exactly the six numbers the arena can see -- a step on wPlayer or fleeHyst would train a
// number no battle reads. SABOTAGED v4850: COUNT 6 -> 5 -> this row RED by name (the shipped `by` still says 6); restored.
{
    const shipped = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "brain", "tacticsWeightsTrained.json"), "utf8"));
    ok("!! the shipped file carries FORMAT and POLICY_ID, its `by` cites the battle the constants define (PHYSICS substrate, COUNT a side, MAX_SECONDS cap), and STEP moves exactly the TRAIN_KEYS",
        shipped.format === T.FORMAT && shipped.policy === T.POLICY_ID && shipped.by.includes(`on the ${T.PHYSICS} substrate`) &&
        shipped.by.includes(`${T.COUNT} ships a side`) && shipped.by.includes(`${T.MAX_SECONDS} s cap`) &&
        J(Object.keys(T.STEP).sort()) === J([...T.TRAIN_KEYS].sort()) && T.TRAIN_KEYS.every((k) => T.STEP[k] > 0) && Object.isFrozen(T.STEP),
        `${T.FORMAT} / ${T.POLICY_ID}; ${T.PHYSICS}, ${T.COUNT} a side, ${T.MAX_SECONDS} s; STEP over ${Object.keys(T.STEP).join(", ")}`);
}
const d0 = T.parseArgs([]);
ok("no arguments is the recorded recipe: 4 runs x 300 iterations, seed 6000, 24 train seeds, one worker, no write, the shipped file as the output", d0.runs === 4 && d0.iters === 300 && d0.seed === 6000 && d0.train === 24 && d0.workers === 1 && d0.one === null && d0.write === false && d0.out === T.DEFAULT_OUT && path.basename(T.DEFAULT_OUT) === "tacticsWeightsTrained.json" && Object.isFrozen(T.RECIPE), J({ ...d0, out: path.basename(d0.out) }));
const d1 = T.parseArgs(["--runs", "3", "--iters", "5", "--train", "4", "--workers", "2", "--seed", "9", "--write", "--out", "x.json", "--quiet"]);
ok("every option is read: --runs, --iters, --seed, --train, --workers, --one, --out, --write, --quiet", d1.runs === 3 && d1.iters === 5 && d1.train === 4 && d1.workers === 2 && d1.seed === 9 && d1.write && d1.quiet && d1.out === "x.json" && T.parseArgs(["--one", "2"]).one === 2);
const e1 = throws(() => T.parseArgs(["--bogus"])), e2 = throws(() => T.parseArgs(["--runs"])), e3 = throws(() => T.parseArgs(["--runs", "many"])), e4 = throws(() => T.parseArgs(["stray"])), e5 = throws(() => T.parseArgs(["--sigma", "1"]));
ok("an unknown option (--sigma is the pilot trainer's, not this one's), a missing value, a non-number and a stray argument are each REFUSED with the reason", /unknown option "--bogus"/.test(e1) && /--runs needs a value/.test(e2) && /--runs needs a number/.test(e3) && /unexpected argument "stray"/.test(e4) && /unknown option "--sigma"/.test(e5), [e1, e2, e3, e4].map((x) => String(x).slice(0, 36)).join(" | "));
ok("--train outside 1..24 is refused (there are 24 train seeds; asking for more would silently train on fewer)", /--train must be 1\.\.24, got 0/.test(throws(() => T.parseArgs(["--train", "0"]))) && /--train must be 1\.\.24, got 25/.test(throws(() => T.parseArgs(["--train", "25"]))) && T.parseArgs(["--train", "24"]).train === 24);
ok("the eight numbers are partitioned: SIX are trained and TWO are not (wPlayer, fleeHyst), together exactly the roster's eight keys in no other order; the four starts are presets; the opponents are all eight presets", J([...T.TRAIN_KEYS, ...T.FIXED_KEYS].sort()) === J([...R.KEYS].sort()) && J(T.FIXED_KEYS) === '["wPlayer","fleeHyst"]' && T.TRAIN_KEYS.length === 6 && J(T.HAND_FIXED) === '{"wPlayer":0.35,"fleeHyst":0.12}' && T.START_PRESETS.every((p) => R.PRESET_IDS.includes(p)) && J(T.OPPONENTS) === J(R.PRESET_IDS) && T.OPPONENTS.length === 8 && Object.isFrozen(T.TRAIN_KEYS) && Object.isFrozen(T.OPPONENTS));
const all = [...T.TRAIN_SEEDS, ...T.HELD_OUT_SEEDS, ...T.AUDIT_SEEDS, ...T.SPENT_AUDIT_SEEDS];
ok("the seed sets (24 train, 24 held-out, 40 audit) and the 40 SPENT audit seeds (read by two runs while the design was corrected, never to be used again) are frozen and disjoint: " + all.length + " seeds, " + new Set(all).size + " distinct; and none is a seed the v4843 matrix used (1 + 7919 i)", Object.isFrozen(T.TRAIN_SEEDS) && Object.isFrozen(T.HELD_OUT_SEEDS) && Object.isFrozen(T.AUDIT_SEEDS) && Object.isFrozen(T.SPENT_AUDIT_SEEDS) && all.length === 128 && new Set(all).size === 128 && all.every((s) => (s - 1) % 7919 !== 0) && T.AUDIT_SEEDS[0] === 60001 && T.SPENT_AUDIT_SEEDS[0] === 50001);
ok("the thresholds are the ones written down before the first search: 8 battles head to head, 0.02 of share, 8 battles of tolerance", T.H2H_FLOOR === 8 && T.FIELD_MARGIN === 0.02 && T.LOSS_TOLERANCE === 8);

sec("2. one battle, from the candidate's side");
{
    const scatter = T.vectorOf("scatter"), skittish = T.vectorOf("skittish"), seed = T.TRAIN_SEEDS[0];
    const raw = (a, b) => runBattle({ seed, weightsA: a, weightsB: b, count: 6, maxSeconds: 60, physics: "box3d" });
    const rA = raw(scatter, skittish), rB = raw(skittish, scatter), fA = T.fight(scatter, skittish, seed, "A"), fB = T.fight(scatter, skittish, seed, "B");
    ok("the candidate on side A: win iff the arena's winner is A, and the margin is its survivors minus theirs over six; on side B the same battle is read the other way round", fA.win === (rA.winner === "A") && fB.win === (rB.winner === "B") && Math.abs(fA.margin - (rA.survA - rA.survB) / 6) < 1e-12 && Math.abs(fB.margin - (rB.survB - rB.survA) / 6) < 1e-12 && fA.share === (rA.winner === "A" ? 1 : rA.winner === "draw" ? 0.5 : 0), `A: ${rA.winner} ${rA.survA}-${rA.survB}; B: ${rB.winner} ${rB.survB}-${rB.survA}`);
    const sw = T.evaluate(scatter, T.TRAIN_SEEDS.slice(0, 6), ["skittish"]), ks = T.evaluate(skittish, T.TRAIN_SEEDS.slice(0, 6), ["scatter"]);
    ok("!! the perspective is the candidate's on EITHER side: scatter beats skittish and skittish loses to scatter over the same twelve battles, with the wins and the losses swapped (a perspective flipped on side B would call the losses wins)", sw.battles === 12 && ks.battles === 12 && sw.wins === ks.losses && sw.losses === ks.wins && sw.wins > sw.losses && sw.score > 0.5 && ks.score < 0.5, `scatter ${sw.wins}-${sw.losses}-${sw.draws}, skittish ${ks.wins}-${ks.losses}-${ks.draws}`);
    const ev = T.evaluate(scatter, T.TRAIN_SEEDS.slice(0, 2), ["hand", "sharp", "focus"]);
    const sum = (k) => Object.values(ev.byOpponent).reduce((a, x) => a + x[k], 0);
    ok("evaluate() is every opponent on every seed from both sides: 3 opponents x 2 seeds x 2 sides = " + ev.battles + " battles, the per-opponent tallies add up to the whole, share is wins plus half the draws", ev.battles === 12 && sum("battles") === 12 && sum("wins") === ev.wins && sum("losses") === ev.losses && sum("draws") === ev.draws && ev.wins + ev.losses + ev.draws === 12 && Math.abs(ev.share - (ev.wins + 0.5 * ev.draws) / 12) < 1e-12 && Object.keys(ev.byOpponent).join() === "hand,sharp,focus");
    // wPlayer: nothing in the arena is a player, so the bias toward the player cannot change a battle; fleeHyst: nothing in the arena repairs a ship, so a fleeing ship's health never climbs back over the bar
    let same = 0, n = 0;
    for (const id of ["scatter", "hand", "brawler"]) for (let s = 0; s < 3; s++) {
        const a = { ...T.vectorOf(id), wPlayer: -2 }, b = { ...T.vectorOf(id), wPlayer: 4 }, opp = T.vectorOf("sharp"), sd = 777 + s * 7919;
        n++; if (J(runBattle({ seed: sd, weightsA: a, weightsB: opp, count: 6, maxSeconds: 60, physics: "box3d" })) === J(runBattle({ seed: sd, weightsA: b, weightsB: opp, count: 6, maxSeconds: 60, physics: "box3d" }))) same++;
    }
    ok("!! wPLAYER IS INVISIBLE TO THE ARENA: with it at -2 and at 4 nine battles (three presets, three seeds) are the same battle to the last field -- which is why it is not trained and keeps the hand value", same === n && n === 9, `${same} of ${n} identical`);
    let hs = 0, hn = 0;
    for (const base of [T.vectorOf("skittish"), { ...T.vectorOf("hand"), fleeHealth: 0.9, fleeOdds: 0.95 }]) for (const opp of ["stubborn", "brawler"]) for (let q = 0; q < 3; q++) for (const side of ["A", "B"]) {
        const sd = 9001 + q * 7919, run = (h) => runBattle({ seed: sd, weightsA: side === "A" ? { ...base, fleeHyst: h } : T.vectorOf(opp), weightsB: side === "A" ? T.vectorOf(opp) : { ...base, fleeHyst: h }, count: 6, maxSeconds: 60, physics: "box3d" });
        hn++; if (J(run(0)) === J(run(1))) hs++;
    }
    ok("!! fLEEHYST IS INVISIBLE TOO, and it took a full training run to find out: with it at 0 and at 1, twenty-four battles by fleeing-prone sides (a skittish side, a hand side told to break off at 90% health) are the same battle to the last field -- the hysteresis is the margin a fleeing ship must RECOVER to re-engage, and nothing in the arena repairs a ship (0 of 144 differed when this was measured). The first run moved it for 300 iterations and pruning put it back", hs === hn && hn === 24, `${hs} of ${hn} identical`);
    ok("...and the other six DO change a battle (each one moved to the edge of its range changes at least one of twelve battles), so the claim is not that nothing is visible", T.TRAIN_KEYS.every((k) => { const lo = { ...scatter, [k]: R.RANGES[k][0] }, hi = { ...scatter, [k]: R.RANGES[k][1] }; return [701, 702, 703, 704, 705, 706].some((sd) => J(runBattle({ seed: sd, weightsA: lo, weightsB: T.vectorOf("hand"), count: 6, maxSeconds: 60, physics: "box3d" })) !== J(runBattle({ seed: sd, weightsA: hi, weightsB: T.vectorOf("hand"), count: 6, maxSeconds: 60, physics: "box3d" }))); }));
}

sec("3. the mutation, the search and the prune");
{
    const rng = mkRng(11), base = T.vectorOf("hand");
    let bad = 0, plr = 0, k1 = 0, k3 = 0, cnt = 0; const ks = new Set();
    for (let i = 0; i < 300; i++) {
        const c = T.mutate(base, rng), changed = R.KEYS.filter((k) => c[k] !== base[k]);
        cnt++; if (changed.length < 1 || changed.length > 3) bad++; if (c.wPlayer !== base.wPlayer || c.fleeHyst !== base.fleeHyst) plr++; if (changed.length === 1) k1++; if (changed.length === 3) k3++;
        for (const k of changed) { ks.add(k); if (c[k] < R.RANGES[k][0] || c[k] > R.RANGES[k][1] || !Number.isFinite(c[k])) bad++; if (!T.TRAIN_KEYS.includes(k)) bad++; }
    }
    ok("300 mutations: each moves one to three numbers (all of 1, 2 and 3 occur), only ever from the six trainable ones (all six occur), never wPlayer or fleeHyst, and every number stays finite and inside the learner's range", bad === 0 && plr === 0 && k1 > 20 && k3 > 20 && ks.size === 6, `1 number ${k1}, 3 numbers ${k3}; keys ${[...ks].sort().join(",")}`);
    const edge = { ...base, wClose: 3.99, fleeHealth: 0.99 }, held = Array.from({ length: 200 }, () => T.mutate(edge, mkRng(5), 40));
    ok("a huge step is HELD to the range (a number cannot leave -2..4 or 0..1 however far the step)", held.every((c) => R.KEYS.every((k) => c[k] >= R.RANGES[k][0] && c[k] <= R.RANGES[k][1])));
    const a = T.mutate(base, mkRng(3)), b = T.mutate(base, mkRng(3));
    ok("a mutation is a function of its random stream (the same stream gives the same child)", J(a) === J(b));
    const s0 = T.train({ start: "scatter", seed: 1, iters: 0, trainSeeds: T.TRAIN_SEEDS.slice(0, 3) }), scat = T.vectorOf("scatter"), hand = T.vectorOf("hand");
    ok("!! A SEARCH STARTS FROM ITS PRESET, WITH THE HAND VALUES FOR THE TWO NUMBERS THE ARENA CANNOT SEE: with no iterations it returns scatter's six trainable numbers untouched (not the hand weights') and wPlayer 0.35 and fleeHyst 0.12 although scatter's own wPlayer is 0 -- the first full run shipped a champion whose player bias had been zeroed by its start", scat.wPlayer === 0 && hand.wPlayer === 0.35 && T.TRAIN_KEYS.every((k) => s0.weights[k] === scat[k]) && s0.weights.wPlayer === 0.35 && s0.weights.fleeHyst === 0.12 && J(T.startVector("scatter")) === J({ ...scat, wPlayer: 0.35, fleeHyst: 0.12 }) && T.TRAIN_KEYS.some((k) => scat[k] !== hand[k]) && s0.improved === 0 && s0.neutral === 0);
    const seeds3 = T.TRAIN_SEEDS.slice(0, 3), t1 = T.train({ start: "scatter", seed: 5, iters: 6, trainSeeds: seeds3 }), t2 = T.train({ start: "scatter", seed: 5, iters: 6, trainSeeds: seeds3 });
    ok("a search is deterministic for its seed, and the train score it reports IS the score of the weights it returns on the train seeds", J(t1.weights) === J(t2.weights) && t1.trainScore === t2.trainScore && Math.abs(t1.trainScore - T.evaluate(t1.weights, seeds3).score) < 1e-12, `${t1.trainScore.toFixed(4)}, ${t1.improved} improvements + ${t1.neutral} neutral`);
    const moved = { ...T.startVector("scatter"), wWeak: 0.9, wThreat: 0.6, fleeOdds: 0.2 }, pr = T.prune(moved, { toward: "scatter", trainSeeds: seeds3 }), again = T.prune(pr.weights, { toward: "scatter", trainSeeds: seeds3 });
    ok("!! prune() puts back what carries nothing and no more: it never lowers the train score, keeps no more than it was given, reports honestly what it moved and kept, and pruning its answer again reverts nothing (a fixed point)", pr.moved === 3 && pr.kept <= 3 && pr.trainScore >= T.evaluate(moved, seeds3).score - 1e-9 && Math.abs(pr.trainScore - T.evaluate(pr.weights, seeds3).score) < 1e-12 && again.kept === again.moved && again.passes === 1 && TRAIN_ONLY(pr.weights, moved), `${pr.moved} moved -> ${pr.kept} kept in ${pr.passes} pass(es)`);
    function TRAIN_ONLY(w, orig) { return R.KEYS.every((k) => T.TRAIN_KEYS.includes(k) || w[k] === orig[k]); }
    const noop = T.prune(T.startVector("scatter"), { toward: "scatter", trainSeeds: seeds3 });
    ok("a vector that already IS its start has nothing to prune: moved 0, kept 0, one pass", noop.moved === 0 && noop.kept === 0 && noop.passes === 1);
}

sec("4. qualifies(): the only door to a written file");
const E = (wins, losses) => ({ wins, losses, draws: 80 - wins - losses });
const fine = Object.fromEntries(R.PRESET_IDS.map((id) => [id, E(40, 30)]));
const good = { h2h: E(40, 25), fieldChamp: 0.62, fieldIncumbent: 0.56, heldOut: E(30, 20), byPreset: fine };
const only = (mut) => T.qualifies({ ...good, ...mut });
ok("a champion that leads the incumbent head to head by the floor or more, beats its record against the other seven by the margin, leads on the held-out seeds and is led by no preset qualifies, with no reason against it", T.qualifies(good).ok && T.qualifies(good).reasons.length === 0);
const q1 = only({ h2h: E(30, 23) }), q1b = only({ h2h: E(31, 23) });
ok("THE HEAD-TO-HEAD FLOOR IS HELD AT ITS EDGE: a lead of 7 of the 80 audit battles fails on that alone, exactly 8 qualifies", !q1.ok && q1.reasons.length === 1 && /leads the incumbent by 7 battles/.test(q1.reasons[0]) && q1b.ok, q1.reasons.join("; "));
const q2 = only({ fieldChamp: 0.5799 }), q2b = only({ fieldChamp: 0.5801 });
ok("THE FIELD MARGIN IS HELD AT ITS EDGE: a share 0.0199 above the incumbent's against the other seven fails on that alone, 0.0201 above qualifies (a lead over the incumbent bought by losing to everyone else is not a better policy)", !q2.ok && q2.reasons.length === 1 && /other seven presets/.test(q2.reasons[0]) && q2b.ok && only({ fieldChamp: 0.56 }).reasons.length === 1, q2.reasons.join("; "));
const q3 = only({ heldOut: E(20, 20) }), q3b = only({ heldOut: E(19, 20) });
ok("an even or negative held-out record against the incumbent fails on that alone", !q3.ok && q3.reasons.length === 1 && /held-out/.test(q3.reasons[0]) && !q3b.ok && q3b.reasons.length === 1, q3.reasons.join("; "));
const q4 = only({ byPreset: { ...fine, brawler: E(22, 30) } }), q4b = only({ byPreset: { ...fine, brawler: E(22, 29) } });
ok("NO PRESET MAY LEAD IT BY THE TOLERANCE: a preset that leads by 8 battles fails on that alone (named), by 7 is allowed", !q4.ok && q4.reasons.length === 1 && /preset 'brawler' leads it by 8 battles/.test(q4.reasons[0]) && q4b.ok, q4.reasons.join("; "));
const bad = T.qualifies({ h2h: E(20, 35), fieldChamp: 0.5, fieldIncumbent: 0.56, heldOut: E(10, 20), byPreset: { ...fine, scatter: E(10, 30), hand: E(10, 25) } });
ok("a champion worse in every way fails with every reason (head to head, field, held-out, and each preset that leads it by the tolerance, by name)", !bad.ok && bad.reasons.length === 5, bad.reasons.map((r) => r.slice(0, 28)).join(" | "));

sec("5. run(): a small recipe, end to end");
const recipe = { runs: 2, iters: 3, seed: 6000, train: 3 }, lines = [];
const a1 = T.run(recipe, (m) => lines.push(m)), b1 = T.run(recipe);
ok("the same recipe gives the same champion to the bit (same numbers, same seed chosen, same scores)", J(a1.champion.weights) === J(b1.champion.weights) && a1.champion.seed === b1.champion.seed && a1.champion.h2h.wins === b1.champion.h2h.wins && a1.champion.held.score === b1.champion.held.score, T.hashOf(a1.champion.weights));
ok("each search starts from its own preset in the recorded order (scatter, then stubborn), and the champion is the run with the best HELD-OUT score, the runs listed best-first", a1.runs.map((r) => r.start).sort().join() === "scatter,stubborn" && a1.runs.every((r, i, arr) => !i || arr[i - 1].held.score >= r.held.score) && a1.champion.seed === a1.runs[0].seed, a1.runs.map((r) => `${r.seed} ${r.start}: train ${r.trainScore.toFixed(3)} held-out ${r.held.score.toFixed(3)}`).join(" | "));
const heldCheck = T.evaluate(a1.champion.weights, T.HELD_OUT_SEEDS);
ok("the held-out score is the score against ALL EIGHT presets from both sides on the 24 held-out seeds -- the objective the search trained on, on seeds it did not", a1.champion.held.score === heldCheck.score && heldCheck.battles === 8 * 2 * 24, `${heldCheck.battles} battles`);
const inc = a1.incumbent, byHeld = T.OPPONENTS.map((id) => ({ id, share: T.evaluate(T.vectorOf(id), T.HELD_OUT_SEEDS, T.OPPONENTS.filter((o) => o !== id)).share })).sort((x, y) => y.share - x.share);
ok("!! the INCUMBENT is the best preset on the HELD-OUT seeds against the other seven (never the audit): the same preset, the same share, and the table is what the log prints", inc.id === byHeld[0].id && Math.abs(inc.share - byHeld[0].share) < 1e-12 && inc.table.length === 8 && inc.table.every((t, i, arr) => !i || arr[i - 1].share >= t.share) && lines.some((l) => /^incumbent \(best preset on the held-out seeds/.test(l)), `${inc.id} ${(100 * inc.share).toFixed(1)}%`);
const others = T.OPPONENTS.filter((o) => o !== inc.id), au = T.evaluate(a1.champion.weights, T.AUDIT_SEEDS);
ok("!! the audit is the champion against every preset on the 40 AUDIT seeds from both sides (80 battles each, 640 in all), read after the choice; the head to head is its row against the incumbent; the incumbent is scored against the SAME seven others", a1.champion.audit.score === au.score && au.battles === 640 && a1.champion.h2h.battles === 80 && J(a1.champion.h2h) === J(au.byOpponent[inc.id]) && Math.abs(a1.champion.fieldChamp - T.evaluate(a1.champion.weights, T.AUDIT_SEEDS, others).share) < 1e-12 && Math.abs(a1.champion.fieldIncumbent - T.evaluate(T.vectorOf(inc.id), T.AUDIT_SEEDS, others).share) < 1e-12, `${au.battles} battles; head to head ${a1.champion.h2h.wins}-${a1.champion.h2h.losses}`);
ok("the numbers of every search are rounded to three places, and wPlayer and fleeHyst are exactly the hand values in every one", a1.runs.every((r) => R.KEYS.every((k) => Math.abs(r.weights[k] * 1000 - Math.round(r.weights[k] * 1000)) < 1e-6) && r.weights.wPlayer === T.HAND_FIXED.wPlayer && r.weights.fleeHyst === T.HAND_FIXED.fleeHyst));
ok("the log says what it did: the incumbent, one line a run, the champion 'picked on the held-out field score', the audit, each preset, and a verdict line", lines.length >= 1 + 2 + 3 + 1 && lines.some((l) => /picked on the held-out field score/.test(l)) && lines.some((l) => /^  against each preset: /.test(l)) && /QUALIFIES|DOES NOT QUALIFY/.test(lines[lines.length - 1]), `${lines.length} lines`);
{
    // a recipe CHOSEN BECAUSE its train-best search is not its held-out-best one (found by trying five): without it "picked on the held-out score" is a sentence and not a rule -- sabotage X15 (pick on the train score) went 0 red on a recipe where the two agreed
    const DISC = { runs: 3, iters: 12, seed: 7400, train: 3 };
    const sp = T.finish(DISC, Array.from({ length: DISC.runs }, (_, k) => T.searchOne(DISC, k)), () => {});
    const trainBest = [...sp.runs].sort((x, y) => y.trainScore - x.trainScore)[0];
    ok("*** WHEN THE TRAIN-BEST SEARCH AND THE HELD-OUT-BEST SEARCH ARE DIFFERENT SEARCHES, THE CHAMPION IS THE HELD-OUT-BEST ONE ***", trainBest.seed !== sp.champion.seed && sp.champion.held.score === Math.max(...sp.runs.map((r) => r.held.score)) && trainBest.held.score < sp.champion.held.score, `train-best seed ${trainBest.seed} (train ${trainBest.trainScore.toFixed(3)}, held-out ${trainBest.held.score.toFixed(3)}); champion seed ${sp.champion.seed} (held-out ${sp.champion.held.score.toFixed(3)})`);
}

sec("6. a search in its own process is the same search");
{
    const tool = path.join(ENG, "tools", "ship", "trainTactics.mjs"), args = ["--runs", "2", "--iters", "3", "--train", "3", "--seed", "6000"];
    const child = (k) => spawnSync(process.execPath, [tool, ...args, "--one", String(k)], { encoding: "utf8", timeout: 120000 });
    const c0 = child(0), c1 = child(1), line = (c) => (c.stdout || "").split("\n").find((l) => l.startsWith("SEARCH "));
    const w0 = line(c0) && JSON.parse(line(c0).slice(7)), w1 = line(c1) && JSON.parse(line(c1).slice(7));
    ok("!! `--one K` runs search K and prints it as one line of JSON, and the numbers it prints are the in-process search's to the bit", c0.status === 0 && c1.status === 0 && !!w0 && !!w1 && w0.seed === 6000 && w1.seed === 6001 && J(w0.weights) === J(a1.runs.find((r) => r.seed === 6000).weights) && J(w1.weights) === J(a1.runs.find((r) => r.seed === 6001).weights) && w0.start === "scatter" && w1.start === "stubborn");
    // a NON-DEFAULT seed: children that were not handed --seed would train the recipe's 6000 and the report would differ (sabotage X19 went 0 red when this row used the default)
    const args2 = ["--runs", "2", "--iters", "3", "--train", "3", "--seed", "6100"];
    const par = spawnSync(process.execPath, [tool, ...args2, "--workers", "2"], { encoding: "utf8", timeout: 240000 }), seq = spawnSync(process.execPath, [tool, ...args2], { encoding: "utf8", timeout: 240000 });
    const keep = (s) => (s || "").split("\n").filter((l) => !/^  search \d+\/\d+ \(seed \d+, from \w+\) done in/.test(l)).join("\n");
    ok("!! `--workers 2` gives the sequential answer: the report (the incumbent, every held-out score, the champion, the audit, each preset, the verdict) is identical line for line, apart from the parent's own timing lines (which are there for the parallel run and absent from the sequential one: the searches really ran in child processes)", par.status === 0 && seq.status === 0 && keep(par.stdout) === keep(seq.stdout) && /search 1\/2/.test(par.stdout) && /seed 610[01]/.test(par.stdout) && !/seed 600[01]/.test(par.stdout) && !/done in/.test(seq.stdout) && /QUALIFIES|DOES NOT QUALIFY/.test(seq.stdout), `exit ${par.status}/${seq.status}`);
}

sec("7. the file it writes");
const fake = { incumbent: a1.incumbent, champion: { ...a1.champion, weights: { ...T.startVector("scatter"), wWeak: -0.54, wThreat: 0, wFocus: -0.16, fleeHealth: 0.12 }, kept: 4, start: "scatter", h2h: { wins: 41, losses: 22, draws: 17, battles: 80 }, fieldChamp: 0.631, fieldIncumbent: 0.6 }, verdict: { ok: true, reasons: [] } };
const blob = T.blobOf(fake, { runs: 4, iters: 300, seed: 6000, train: 24 });
const san = R.sanitizeWeights(blob);
ok("the blob is a swek-tactics-v1 file for esTactics whose `weights` are the eight numbers in the roster's KEYS order, and the roster's own sanitizer reads it with NOTHING to say (eight applied, no problem, nothing clamped) to the same numbers", blob.format === "swek-tactics-v1" && blob.policy === "esTactics" && J(Object.keys(blob.weights)) === J(R.KEYS) && san.applied === 8 && san.problems.length === 0 && R.KEYS.every((k) => san.weights[k] === blob.weights[k]), `${san.applied} applied`);
ok("`by` records the arena and its substrate, the seed and the preset the search started from, the count of numbers that differ from it, the seed ranges of all three sets, wPlayer's exemption and value, the incumbent, and the audit quoted against it, the field share and each preset", /box3d substrate \(ships collide\)/.test(blob.by) && /seed \d+ of 4 searches \(6000\.\.6003\) from the preset 'scatter'/.test(blob.by) && /4 of the 6 numbers differ from it/.test(blob.by) && blob.by.includes("[30001..") && blob.by.includes("[40001..") && blob.by.includes("[60001..") && /wPlayer and fleeHyst are not trained/.test(blob.by) && blob.by.includes(`keep the hand values ${T.vectorOf("hand").wPlayer} and ${T.vectorOf("hand").fleeHyst}`) && blob.by.includes(`incumbent '${a1.incumbent.id}'`) && /41 won, 22 lost, 17 drawn/.test(blob.by) && /63\.1% \(the incumbent's 60\.0%\)/.test(blob.by) && T.OPPONENTS.every((id) => blob.by.includes(id + " ")), blob.by.slice(0, 100));
ok("`score` is the HELD-OUT field score the champion was picked on, to three places", blob.score === Number(fake.champion.held.score.toFixed(3)));

sec("8. the command line writes only what qualifies");
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-")), out = path.join(tmp, "t.json"), tool = path.join(ENG, "tools", "ship", "trainTactics.mjs");
    const shipped = T.DEFAULT_OUT, mtime0 = fs.existsSync(shipped) ? fs.statSync(shipped).mtimeMs : null;
    const small = ["--runs", "1", "--iters", "2", "--train", "2", "--quiet", "--out", out];
    const run1 = spawnSync(process.execPath, [tool, ...small], { encoding: "utf8", timeout: 240000 });
    ok("without --write nothing is written (neither the --out file nor the shipped one)", run1.status === 0 && !fs.existsSync(out) && (mtime0 === null || fs.statSync(shipped).mtimeMs === mtime0), `exit ${run1.status}`);
    const run2 = spawnSync(process.execPath, [tool, ...small, "--write"], { encoding: "utf8", timeout: 240000 });
    ok("with --write but a champion that does not beat the incumbent (two iterations cannot), it exits 1, says why, and writes NOTHING", run2.status === 1 && !fs.existsSync(out) && /not written/.test(run2.stdout), `exit ${run2.status}: ${run2.stdout.trim().slice(0, 100)}`);
    const run3 = spawnSync(process.execPath, [tool, "--bogus"], { encoding: "utf8", timeout: 20000 });
    ok("an unknown option exits 2 before any training", run3.status === 2 && /unknown option/.test(run3.stderr), run3.stderr.trim().slice(0, 80));
    fs.rmSync(tmp, { recursive: true, force: true });
}

sec("9. the SHIPPED file: brain/tacticsWeightsTrained.json is what it says it is, on numbers recomputed here");
{
    const file = path.join(ENG, "brain", "tacticsWeightsTrained.json"), blobF = JSON.parse(fs.readFileSync(file, "utf8")), sanF = R.sanitizeWeights(blobF), w = blobF.weights;
    ok("the file is a swek-tactics-v1 file for esTactics, the roster's own sanitizer reads it with nothing to say (eight applied, none clamped, none unknown), and the eight numbers are in KEYS order", blobF.format === "swek-tactics-v1" && blobF.policy === "esTactics" && sanF.applied === 8 && sanF.problems.length === 0 && J(Object.keys(w)) === J(R.KEYS) && R.KEYS.every((k) => w[k] >= R.RANGES[k][0] && w[k] <= R.RANGES[k][1]), T.hashOf(w));
    ok("!! wPLAYER AND fLEEHYST ARE THE HAND VALUES 0.35 and 0.12 (the arena cannot see either, so the search never moved them, and the first full run shipped a champion whose scatter start had zeroed wPlayer)", w.wPlayer === 0.35 && w.fleeHyst === 0.12 && w.wPlayer === T.HAND_FIXED.wPlayer && w.fleeHyst === T.HAND_FIXED.fleeHyst);
    const inc = T.incumbentOf(), others = T.OPPONENTS.filter((o) => o !== inc.id), au = T.evaluate(w, T.AUDIT_SEEDS), h2h = au.byOpponent[inc.id];
    const fieldChamp = T.evaluate(w, T.AUDIT_SEEDS, others).share, fieldInc = T.evaluate(T.vectorOf(inc.id), T.AUDIT_SEEDS, others).share, heldOut = T.evaluate(w, T.HELD_OUT_SEEDS, [inc.id]), heldAll = T.evaluate(w, T.HELD_OUT_SEEDS);
    const m = /seed (\d+) of (\d+) searches \((\d+)\.\.(\d+)\) from the preset '(\w+)'.* (\d+) iterations over (\d+) train seeds .* \((\d) of the 6 numbers differ from it\)/.exec(blobF.by || "");
    const startV = m && T.startVector(m[5]), differ = m ? T.TRAIN_KEYS.filter((k) => Math.abs(w[k] - startV[k]) > 1e-9).length : -1;
    ok("!! what the file SAYS about itself is what the code gets: its `by` names the incumbent (the best preset on the HELD-OUT seeds, recomputed), quotes the head to head on the audit seeds, the share against the other seven for it and for the incumbent, every preset's record, the seed and the start it came from, and the count of numbers that differ from that start; its `score` is the held-out field score",
        !!m && blobF.by.includes(`incumbent '${inc.id}'`) && blobF.by.includes(`${h2h.wins} won, ${h2h.losses} lost, ${h2h.draws} drawn against '${inc.id}'`) && blobF.by.includes(`${(100 * fieldChamp).toFixed(1)}% (the incumbent's ${(100 * fieldInc).toFixed(1)}%)`) && T.OPPONENTS.every((id) => blobF.by.includes(`${id} ${au.byOpponent[id].wins}-${au.byOpponent[id].losses}`)) &&
        Number(m[8]) === differ && T.START_PRESETS.includes(m[5]) && Number(m[2]) === 4 && blobF.score === Number(heldAll.score.toFixed(3)), `${inc.id}: ${h2h.wins}-${h2h.losses}-${h2h.draws}; field ${(100 * fieldChamp).toFixed(1)}% vs ${(100 * fieldInc).toFixed(1)}%; ${differ} numbers differ from '${m && m[5]}'`);
    ok("!! IT BEATS THE FIELD where it was never trained, and the trainer's OWN rule says so: the rule that decides whether a file is written (the head-to-head floor, the field margin, a held-out lead, no preset leading it by the tolerance) accepts this file on numbers recomputed here", T.qualifies({ h2h, fieldChamp, fieldIncumbent: fieldInc, heldOut: heldOut.byOpponent[inc.id], byPreset: au.byOpponent }).ok, `audit ${h2h.wins}-${h2h.losses} against ${inc.id}; held-out ${heldOut.byOpponent[inc.id].wins}-${heldOut.byOpponent[inc.id].losses}`);
    ok("...and it has the better of EVERY preset on the audit, not only the incumbent (more battles won than lost against each of the eight), so it is not a rock that one paper beats", T.OPPONENTS.every((id) => au.byOpponent[id].wins > au.byOpponent[id].losses), T.OPPONENTS.map((id) => `${id} ${au.byOpponent[id].wins}-${au.byOpponent[id].losses}`).join(" "));
    const side = (sd) => { let wn = 0, ls = 0; for (const seed of T.AUDIT_SEEDS) { const f = T.fight(w, T.vectorOf(inc.id), seed, sd); if (f.win) wn++; else if (f.loss) ls++; } return { wn, ls }; };
    const sa = side("A"), sb = side("B");
    ok("!! ...from EACH SIDE: it wins more than it loses against the incumbent as side A and as side B (a lead that came from the side the arena favours would show as one side's and not the other's)", sa.wn > sa.ls && sb.wn > sb.ls, `as A ${sa.wn}-${sa.ls}, as B ${sb.wn}-${sb.ls}`);
    ok("it is a SMALL change to its start, not a new policy: no more than five of the six numbers differ from it (the rest went back toward it), and at least one does", differ >= 1 && differ <= 5, `${differ} of 6`);
    const again = T.prune(w, { toward: m ? m[5] : "scatter", trainSeeds: T.TRAIN_SEEDS });
    ok("pruning the shipped vector again, toward its start and on the train seeds, reverts nothing (a fixed point: every number left is one the score needs)", again.kept === again.moved && again.passes === 1, `${again.moved} moved, ${again.kept} kept, ${again.passes} pass(es)`);
}

console.log(fails ? `\ntacticsTrain-selfcheck: ${fails} FAILED` : "\ntacticsTrain-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
