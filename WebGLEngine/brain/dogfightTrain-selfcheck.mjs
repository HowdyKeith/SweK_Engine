// WebGLEngine/brain/dogfightTrain-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/dogfightTrain-selfcheck.mjs      (~10 s)
//
// THE SEARCH WITH THE JOB TAKEN OUT, HELD TO THE ORIGINALS. brain/dogfightTrain.mjs is the (1+1)-ES and the prune that brain/pilotFlightPolicy.mjs and brain/pilotFlightMlp.mjs each carry, with the score handed in. A restatement is only as
// good as the check that it IS the thing it restates, so this gate runs it beside the originals:
//
//   1  EQUAL TO THE ORIGINALS   with the flight task's score on a small flight set, trainWith() gives bit for bit what PF.train() and MF.train() give for the same seed (weights, train score, improved, neutral, history), and pruneWith()
//                               what PF.prune() and MF.prune() give from the same moved weights (weights, kept, moved, passes, score) -- for both networks
//   2  THE ES ITSELF            on a synthetic score with a known answer: the best score never falls, a strict gain is `improved` and a tie is `neutral` and MOVES, a sigma of 0 changes nothing (every child is a tie), every
//                               accepted step moves at most maxK weights, the history is [0, every 50, the end], `start` is honoured and not edited, onIter is called once per iteration
//   5  THE BATCHED SEARCH      (added for the jets' second league run) trainBatchedWith(): with ONE batch it is trainWith() bit for bit (weights, improved, neutral, score) on a synthetic score and on the flight task's, for both networks; iteration i judges parent and
//                               child on batch (i - 1) % batches and on that one only; the parent's score on a batch is asked for once per parent -- the number of score calls is worked out here from the accept/reject sequence alone, and the result equals a
//                               NAIVE search written here that re-scores the parent every time; a scripted 6-iteration case with a gain, three ties (one at each edge of the 1e-9 tolerance), a loss and a gain just over the tolerance gives the counts worked
//                               out by hand; trainScore is the mean over ALL the batches of the final weights; a sigma of 0 is all ties; `start` is honoured and not edited; deterministic; onIter says the batch; a non-list of functions is refused
//   3  THE PRUNE                reverts what does not carry the score: a vector moved on weights the score ignores comes back to the hand weights entirely; one moved on a weight the score needs keeps exactly that weight; the result is a FIXED
//                               POINT (reverting any weight that is left lowers the score), it never ends lower than it began, `toward` is honoured, and the hand weights prune to themselves with nothing moved and nothing kept
//
// SABOTAGE LOG -- FIFTEEN, each applied to brain/dogfightTrain.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   1 a tie counted as an improvement 3 | 2 a tie does not move 2 | 3 a child worse by up to 1 accepted 2 | 4 the history every 25 iterations 1 | 5 onIter never called 1 | 6 start ignored 1 | 7 every seed searches as seed 7 4 | 8 the prune reverts everything 5 |
//   9 the prune makes one pass 2 | 10 the prune ignores `toward` 1 | 11 the prune edits the vector it is handed 4 | 12 an improvement not kept 3 | 13 maxK ignored 2 | 14 sigma ignored 1 | 15 the prune's best score not updated 1.
// SABOTAGE LOG OF THE BATCHED SEARCH (section 5) -- TWENTY-FIVE mutants of trainBatchedWith(), each applied to brain/dogfightTrain.mjs in a scratch tree, the gate run, the tree discarded; every one red by name (the number is how many rows went red):
//   B01 every iteration on batch 0 3 | B02 the batch changes every second iteration 2 | B03 the batch drawn at random 6 | B04 the parent scored on batch 0 4 | B05 the child scored on the next batch 4 | B06 the memory not cleared on an improvement 2
//   B07 not cleared on a tie that moves 1 | B08 an improved child's score not remembered 1 | B09 a tied child's score not remembered 1 | B10 the parent re-scored every iteration 2 | B11 a tie does not move 3 | B12 a child worse by up to 1 kept 5
//   B13 a tie counts as an improvement 4 | B14 the improvement tolerance 1e-8 1 | B15 trainScore the last batch's 3 | B16 trainScore the sum 3 | B17 start ignored 1 | B18 every seed searches as seed 7 5 | B19 maxK ignored 5 | B20 sigma ignored 1
//   B21 a bad batch list not refused 1 | B22 onIter does not say the batch 2 | B23 one iteration too few 4 | B24 the final scores are of the starting weights 5 | B25 a list of non-functions passes the check 1.
//   B09 WENT 0 RED THE FIRST TIME: the 60-iteration case on a smooth synthetic score never produces a tie, so the path where a tied child's score is remembered was not run, and only a call count could see it. The scripted six-iteration case (which has three ties)
//   now pins the number of score calls to the one worked out by hand (13), and B09 reads 1.
//   THE FIRST DRAFT'S SYNTHETIC SCORE COULD NOT BE CLIMBED: it asked for two weights out of 1,796, a sparse search that moves one to four weights an iteration never touched them in 120 iterations, every child was a tie, and the row that wants an improvement went
//   red on the unsabotaged code -- the score now asks every seventh weight to move, so about one mutation in seven is a gain.
"use strict";
import * as DT from "./dogfightTrain.mjs";
import * as PF from "./pilotFlightPolicy.mjs";
import * as MF from "./pilotFlightMlp.mjs";
import * as T from "./flightTask.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const sec = (t) => console.log("\n" + t);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) n++; return n; };

console.log("dogfightTrain-selfcheck -- the search, held to the originals\n");

const SMALL = Object.freeze(T.TRAIN_SET.slice(0, 3));   // three flight scenarios: enough to move a score, fast enough to run twice
const policies = { fly: PF, gpu: MF };

sec("1. EQUAL TO THE ORIGINALS");
for (const [name, P] of Object.entries(policies)) {
    const score = (w) => T.evaluate(P.pilotFor(w), SMALL).score;
    const mine = DT.trainWith(P, score, { seed: 5, iters: 14, sigma: 0.3, maxK: 4 }), orig = P.train({ seed: 5, iters: 14, sigma: 0.3, maxK: 4, trainSet: SMALL });
    ok(`!! ${name}: trainWith(policy, the flight task's score) IS policy.train(): the same weights bit for bit, the same train score, the same improved and neutral counts and the same history (seed 5, 14 iterations, 3 scenarios)`,
        same(mine.weights, orig.weights) && mine.trainScore === orig.trainScore && mine.improved === orig.improved && mine.neutral === orig.neutral && JSON.stringify(mine.history) === JSON.stringify(orig.history) && mine.iters === orig.iters, `${mine.improved} improved + ${mine.neutral} neutral, ${diffCount(mine.weights, P.handWeights())} weights moved`);
    const other = DT.trainWith(P, score, { seed: 6, iters: 14 });
    ok(`${name}: a different seed is a different search (the equality above is not two empty runs): different weights, and this search moved weights`, !same(other.weights, mine.weights) && diffCount(mine.weights, P.handWeights()) > 0);
    const p1 = DT.pruneWith(P, score, mine.weights), p2 = P.prune(mine.weights, { trainSet: SMALL });
    ok(`!! ${name}: pruneWith(policy, score, w) IS policy.prune(w): the same weights bit for bit, the same kept, moved, passes and score`, same(p1.weights, p2.weights) && p1.kept === p2.kept && p1.moved === p2.moved && p1.passes === p2.passes && p1.trainScore === p2.trainScore, `kept ${p1.kept} of ${p1.moved} moved in ${p1.passes} passes`);
    const wide = Float32Array.from(P.handWeights()); wide[3] += 0.2; wide[10] -= 0.3; wide[17] += 0.1;
    const q1 = DT.pruneWith(P, score, wide, { toward: P.handWeights() }), q2 = P.prune(wide, { toward: P.handWeights(), trainSet: SMALL });
    ok(`${name}: the same for a hand-moved vector, with \`toward\` given explicitly`, same(q1.weights, q2.weights) && q1.kept === q2.kept && q1.moved === q2.moved && q1.moved === 3);
}

sec("2. THE ES ITSELF");
{
    const P = MF, H = P.handWeights();
    const target = Float32Array.from(H, (v, i) => v + (i % 7 === 0 ? 0.5 : 0));   // a known answer: every seventh weight wants to be 0.5 higher, so about one mutation in seven is a gain and the rest are losses
    const score = (w) => { let s = 0; for (let i = 0; i < w.length; i++) s -= Math.abs(w[i] - target[i]); return s; };
    const calls = []; const r = DT.trainWith(P, score, { seed: 11, iters: 120, sigma: 0.3, maxK: 2, onIter: (i, s) => calls.push([i, s.score, s.improved, s.neutral]) });
    ok("!! THE BEST SCORE NEVER FALLS and the search finds the known answer's direction: the score at the end is above the start's and no entry in the history is below the one before; improved + neutral never exceeds the iterations", r.history.every((h, i) => i === 0 || h.score >= r.history[i - 1].score) && r.trainScore > r.history[0].score && r.improved + r.neutral <= 120 && r.improved > 0, `${r.history[0].score.toFixed(3)} -> ${r.trainScore.toFixed(3)}, ${r.improved} improved, ${r.neutral} neutral`);
    ok("!! THE HISTORY IS [0, every 50, the end]: entries at iterations 0, 50, 100 and 120, and onIter was called once per iteration with the running counts", JSON.stringify(r.history.map((h) => h.i)) === "[0,50,100,120]" && calls.length === 120 && calls[0][0] === 1 && calls[119][0] === 120 && calls.every((c, i) => i === 0 || (c[1] >= calls[i - 1][1] && c[2] >= calls[i - 1][2] && c[3] >= calls[i - 1][3])) && calls[119][2] === r.improved && calls[119][3] === r.neutral);
    const flat = DT.trainWith(P, score, { seed: 11, iters: 30, sigma: 0 });
    ok("!! A SIGMA OF 0 CHANGES NOTHING: every child is a tie, so every iteration is a neutral move (a tie MOVES) and the weights are still the hand weights, with no improvement", flat.improved === 0 && flat.neutral === 30 && same(flat.weights, H) && flat.trainScore === score(H));
    const one = DT.trainWith(P, score, { seed: 3, iters: 1, sigma: 0.3, maxK: 1 }), three = DT.trainWith(P, score, { seed: 3, iters: 1, sigma: 0.3, maxK: 4 });
    ok("a child moves between 1 and maxK weights: with maxK 1 an iteration moves at most 1; with maxK 4 at most 4; and a sparse search over a thousand weights does not touch the rest", diffCount(one.weights, H) <= 1 && diffCount(three.weights, H) <= 4 && DT.trainWith(P, score, { seed: 4, iters: 40, maxK: 2 }).weights.length === P.WEIGHT_COUNT);
    const start = Float32Array.from(H); start[7] = 0.5; const copy = Float32Array.from(start);
    const s0 = DT.trainWith(P, score, { seed: 2, iters: 0, start }), s5 = DT.trainWith(P, score, { seed: 2, iters: 5, maxK: 2, start });
    ok("!! `start` IS HONOURED AND NOT EDITED: with no iterations the search returns the vector it was given, scored, with a one-entry history; with five it moves at most 5 x 2 weights away from that vector (not from the hand weights); and the vector it was handed is the same after as before", same(start, copy) && same(s0.weights, copy) && s0.trainScore === score(copy) && s0.history.length === 1 && s0.iters === 0 && diffCount(s5.weights, copy) <= 10 && Math.abs(diffCount(s5.weights, H) - diffCount(s5.weights, copy)) <= 1);
    ok("deterministic: the same seed and score give the same search, run twice", same(DT.trainWith(P, score, { seed: 9, iters: 20 }).weights, DT.trainWith(P, score, { seed: 9, iters: 20 }).weights));
}

sec("3. THE PRUNE");
{
    const P = MF, H = P.handWeights();
    const score = (w) => -Math.abs(w[0] - 1.5);   // only weight 0 matters, and wants to be 1.5
    const moved = Float32Array.from(H); moved[0] = 1.5; moved[40] += 0.7; moved[200] -= 0.4; moved[900] += 0.2;
    const r = DT.pruneWith(P, score, moved);
    ok("!! THE PRUNE KEEPS WHAT CARRIES THE SCORE AND ONLY THAT: of four moved weights, the one the score needs (weight 0) stays at 1.5 and the three it ignores come back to the hand weights exactly", r.moved === 4 && r.kept === 1 && Math.abs(r.weights[0] - 1.5) < 1e-6 && r.weights[40] === H[40] && r.weights[200] === H[200] && r.weights[900] === H[900] && r.trainScore === score(r.weights), `${r.kept} of ${r.moved}`);
    ok("!! A FIXED POINT: reverting any weight that is left strictly lowers the score, the score never ends below where it began, and a second prune of the result changes nothing", (() => { for (let i = 0; i < r.weights.length; i++) if (Math.abs(r.weights[i] - H[i]) > 1e-6) { const t = Float32Array.from(r.weights); t[i] = H[i]; if (!(score(t) < score(r.weights) - 1e-9)) return false; } const again = DT.pruneWith(P, score, r.weights); return same(again.weights, r.weights) && again.passes === 1 && r.trainScore >= score(moved) - 1e-9; })());
    const none = DT.pruneWith(P, score, H);
    ok("the hand weights prune to themselves: nothing moved, nothing kept, one pass, the same score", none.moved === 0 && none.kept === 0 && none.passes === 1 && same(none.weights, H) && none.trainScore === score(H));
    const alt = Float32Array.from(H); alt[3] = 0.9; const toward = Float32Array.from(alt), w2 = Float32Array.from(alt); w2[50] += 0.5;
    const t = DT.pruneWith(P, score, w2, { toward });
    ok("!! `toward` IS WHAT IS REVERTED TO, not the hand weights: pruning toward a vector that has weight 3 at 0.9 leaves weight 3 at 0.9 (it is not 'moved' from there) and sends the one extra weight back to ITS value there", t.moved === 1 && t.kept === 0 && Math.abs(t.weights[3] - 0.9) < 1e-6 && t.weights[50] === toward[50]);
    const frozenIn = Float32Array.from(moved), before = Float32Array.from(moved); DT.pruneWith(P, score, frozenIn);
    ok("the vector it is handed is not edited (a copy is pruned)", same(frozenIn, before));
}

sec("5. THE BATCHED SEARCH");
{
    const P = MF, H = P.handWeights();
    const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const targetOf = (b) => Float32Array.from(H, (v, i) => v + (i % 7 === b ? 0.5 : 0));   // batch b wants every seventh weight (offset b) 0.5 higher: three batches that agree on nothing, so a move judged on one is a loss on another
    const scoreB = (b) => (w) => { const t = targetOf(b); let s = 0; for (let i = 0; i < w.length; i++) s -= Math.abs(w[i] - t[i]); return s; };
    // 1. one batch is trainWith
    for (const [name, Q] of Object.entries(policies)) {
        const sc = (w) => T.evaluate(Q.pilotFor(w), SMALL).score;
        const a = DT.trainBatchedWith(Q, [sc], { seed: 5, iters: 14, sigma: 0.3, maxK: 4 }), b = DT.trainWith(Q, sc, { seed: 5, iters: 14, sigma: 0.3, maxK: 4 });
        ok(`!! ONE BATCH IS trainWith(), bit for bit (${name}, on the flight task): the same weights, improved and neutral counts and train score, and batchScores is that one score`, same(a.weights, b.weights) && a.improved === b.improved && a.neutral === b.neutral && a.trainScore === b.trainScore && a.batchScores.length === 1 && a.batchScores[0] === b.trainScore, `${a.improved} improved, ${a.neutral} neutral`);
    }
    const one = DT.trainBatchedWith(P, [scoreB(0)], { seed: 11, iters: 120, sigma: 0.3, maxK: 2 }), ref = DT.trainWith(P, scoreB(0), { seed: 11, iters: 120, sigma: 0.3, maxK: 2 });
    ok("one batch is trainWith() on the synthetic score too, over 120 iterations, and the search did find gains (so the equality is not two searches that both did nothing)", same(one.weights, ref.weights) && one.improved === ref.improved && one.neutral === ref.neutral && one.improved > 0);
    // 2 + 3. the batches, the pairing and the parent's memory
    const scores3 = [0, 1, 2].map(scoreB), log = [], iterEnds = [], seen = [];
    const wrapped = scores3.map((f, b) => (w) => { log.push(b); return f(w); });
    const run = DT.trainBatchedWith(P, wrapped, { seed: 21, iters: 60, sigma: 0.3, maxK: 2, onIter: (i, st) => { iterEnds.push([i, log.length, st.batch, st.improved, st.neutral]); seen.push(st.batch); } });
    const perIter = iterEnds.map((e, i) => log.slice(i === 0 ? 0 : iterEnds[i - 1][1], e[1]));
    ok("!! ITERATION i IS JUDGED ON BATCH (i - 1) % 3 AND ON THAT ONE ONLY, PARENT AND CHILD ALIKE: onIter reports batches 0,1,2,0,1,2,..., and every score call inside iteration i (one or two of them) is to that batch", seen.every((b, i) => b === i % 3) && perIter.every((c, i) => (c.length === 1 || c.length === 2) && c.every((b) => b === i % 3)), `${seen.slice(0, 7).join()}...`);
    // the calls the memory should have saved: re-derived from the accept/reject sequence alone
    let known = new Set(), expectCalls = 0, prev = [0, 0];
    for (const e of iterEnds) { const b = e[2], accepted = e[3] + e[4] > prev[0] + prev[1]; expectCalls += 1 + (known.has(b) ? 0 : 1); if (accepted) known = new Set([b]); else known.add(b); prev = [e[3], e[4]]; }
    expectCalls += 3;   // the final scores of the three batches
    ok("!! THE PARENT'S SCORE ON A BATCH IS ASKED FOR ONCE PER PARENT: the number of score calls equals the one worked out here from the accept/reject sequence (a child is always scored; the parent only on a batch it has not been scored on since it last changed; an accepted child's score on its batch is the new parent's)", log.length === expectCalls && log.length < 2 * 60 + 3, `${log.length} calls, ${expectCalls} expected, ${2 * 60 + 3} if nothing were remembered`);
    // the naive search, written from the spec: re-score the parent every time
    const naive = (() => { const rng = mulberry(21); let best = Float32Array.from(H), imp = 0, neu = 0; for (let i = 1; i <= 60; i++) { const b = (i - 1) % 3, cand = P.mutate(best, 0.3, rng, 2), sp = scores3[b](best), sc = scores3[b](cand); if (sc > sp + 1e-9) { best = cand; imp++; } else if (sc >= sp - 1e-9) { best = cand; neu++; } } return { best, imp, neu }; })();
    ok("!! THE MEMORY CHANGES NOTHING: the search equals a naive one written here from the description (the parent re-scored on its batch every iteration): the same weights, improved and neutral counts", same(run.weights, naive.best) && run.improved === naive.imp && run.neutral === naive.neu && run.improved > 0 && run.neutral >= 0, `${run.improved} improved, ${run.neutral} neutral`);
    ok("trainScore IS THE MEAN OVER ALL THE BATCHES OF THE FINAL WEIGHTS, and batchScores each of them (not the last batch's, not their sum)", run.batchScores.length === 3 && run.batchScores.every((x, b) => x === scores3[b](run.weights)) && Math.abs(run.trainScore - (run.batchScores[0] + run.batchScores[1] + run.batchScores[2]) / 3) < 1e-12 && run.iters === 60);
    // 4. a scripted case, every outcome worked out by hand: the child is the parent plus 1 on weight 0
    const stub = { handWeights: () => Float32Array.of(0, 0), mutate: (w) => { const c = Float32Array.from(w); c[0] += 1; return c; } };
    const tab0 = { 0: 0, 1: 1, 2: 0, 3: -1, 4: -1 + 1e-10, 5: 0 }, tab1 = { 0: 0, 1: 0, 2: 0, 3: -5e-10, 4: 0.3, 5: 0.3 + 2e-9 };
    let scriptedCalls = 0;
    const sa = DT.trainBatchedWith(stub, [(w) => { scriptedCalls++; return tab0[w[0]]; }, (w) => { scriptedCalls++; return tab1[w[0]]; }], { iters: 6 });
    ok("!! THE ACCEPTANCE RULE, BY HAND: six iterations alternating two batches -- (1) a gain of 1 on batch 0, kept; (2) a tie on batch 1, kept (a tie moves); (3) a loss of 1 on batch 0, REJECTED (the parent stays); (4) a loss of 5e-10 on batch 1, inside the 1e-9 tolerance, kept as a tie; (5) a gain of 1e-10 on batch 0, a tie, kept; (6) a gain of 2e-9 on batch 1, over the tolerance, an improvement -- so 2 improved, 3 neutral, the final weight 5 and the final scores [0, 0.3 + 2e-9]; and 13 score calls in all, worked out by hand: 2 + 2 + 2 + 1 (the parent's score on batch 1 was remembered from the tie in (2)) + 2 + 2 for the iterations and 2 for the final scores",
        sa.improved === 2 && sa.neutral === 3 && sa.weights[0] === 5 && scriptedCalls === 13 && sa.batchScores[0] === tab0[5] && sa.batchScores[1] === tab1[5] && Math.abs(sa.trainScore - (tab0[5] + tab1[5]) / 2) < 1e-15, `${sa.improved} improved, ${sa.neutral} neutral, weight ${sa.weights[0]}`);
    // 5. the rest
    const flat = DT.trainBatchedWith(P, scores3, { seed: 11, iters: 30, sigma: 0 });
    ok("!! A SIGMA OF 0 CHANGES NOTHING: every child is a tie, so every iteration is a neutral move, nothing is an improvement, and the weights are still the hand weights, with the mean of the batches' scores of them", flat.improved === 0 && flat.neutral === 30 && same(flat.weights, H) && Math.abs(flat.trainScore - (scores3[0](H) + scores3[1](H) + scores3[2](H)) / 3) < 1e-12);
    const st = Float32Array.from(H); st[7] = 0.5; const copy = Float32Array.from(st), s5 = DT.trainBatchedWith(P, scores3, { seed: 2, iters: 5, maxK: 2, start: st }), s0 = DT.trainBatchedWith(P, scores3, { seed: 2, iters: 0, start: st });
    ok("!! `start` IS HONOURED AND NOT EDITED: with no iterations the search returns the vector it was given and scores it; with five it is at most 5 x 2 weights from that vector; the vector handed in is the same after", same(st, copy) && same(s0.weights, copy) && s0.improved === 0 && s0.neutral === 0 && diffCount(s5.weights, copy) <= 10 && s0.batchScores[0] === scores3[0](copy));
    const m1 = DT.trainBatchedWith(P, scores3, { seed: 3, iters: 1, sigma: 0.3, maxK: 1 }), m4 = DT.trainBatchedWith(P, scores3, { seed: 3, iters: 1, sigma: 0.3, maxK: 4 });
    ok("a child moves between 1 and maxK weights: with maxK 1 an iteration moves at most 1 and with maxK 4 at most 4", diffCount(m1.weights, H) <= 1 && diffCount(m4.weights, H) <= 4);
    ok("deterministic, and a function of the seed: the same seed gives the same search twice, another seed another", same(DT.trainBatchedWith(P, scores3, { seed: 9, iters: 25 }).weights, DT.trainBatchedWith(P, scores3, { seed: 9, iters: 25 }).weights) && !same(DT.trainBatchedWith(P, scores3, { seed: 9, iters: 25 }).weights, DT.trainBatchedWith(P, scores3, { seed: 10, iters: 25 }).weights));
    const refused = (f) => { try { f(); return false; } catch (e) { return /scores must be a non-empty array of functions/.test(e.message); } };
    ok("!! A BATCH LIST THAT IS NOT A LIST OF FUNCTIONS IS REFUSED, by name: an empty list, a function instead of a list, and a list with a number in it each throw before any search", refused(() => DT.trainBatchedWith(P, [], { iters: 1 })) && refused(() => DT.trainBatchedWith(P, scores3[0], { iters: 1 })) && refused(() => DT.trainBatchedWith(P, [scores3[0], 3], { iters: 1 })));
}

sec("4. THE FRONT DOOR");
{
    const rl = DT.reportLines();
    ok("the module's report says what it is (including the batched search), and no line says NaN or undefined", rl.length === 1 && /dogfightTrain/.test(rl[0]) && /batched/.test(rl[0]) && !/NaN|undefined/.test(rl[0]));
}

console.log(fails ? `\ndogfightTrain-selfcheck: ${fails} FAILED` : "\ndogfightTrain-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
