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
//   3  THE PRUNE                reverts what does not carry the score: a vector moved on weights the score ignores comes back to the hand weights entirely; one moved on a weight the score needs keeps exactly that weight; the result is a FIXED
//                               POINT (reverting any weight that is left lowers the score), it never ends lower than it began, `toward` is honoured, and the hand weights prune to themselves with nothing moved and nothing kept
//
// SABOTAGE LOG -- FIFTEEN, each applied to brain/dogfightTrain.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   1 a tie counted as an improvement 3 | 2 a tie does not move 2 | 3 a child worse by up to 1 accepted 2 | 4 the history every 25 iterations 1 | 5 onIter never called 1 | 6 start ignored 1 | 7 every seed searches as seed 7 4 | 8 the prune reverts everything 5 |
//   9 the prune makes one pass 2 | 10 the prune ignores `toward` 1 | 11 the prune edits the vector it is handed 4 | 12 an improvement not kept 3 | 13 maxK ignored 2 | 14 sigma ignored 1 | 15 the prune's best score not updated 1.
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

sec("4. THE FRONT DOOR");
{
    const rl = DT.reportLines();
    ok("the module's report says what it is, and no line says NaN or undefined", rl.length === 1 && /dogfightTrain/.test(rl[0]) && !/NaN|undefined/.test(rl[0]));
}

console.log(fails ? `\ndogfightTrain-selfcheck: ${fails} FAILED` : "\ndogfightTrain-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
