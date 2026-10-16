// WebGLEngine/brain/pilotFlightTrain-selfcheck.mjs
//
// Run: node brain/pilotFlightTrain-selfcheck.mjs      (~42 s)
//
// THE TRAINING FUNCTIONS OF THE FRUIT-FLY PILOT, GRADED ON WHAT A (1+1)-ES FROM THE AUTOPILOT MUST DO (v4869; they lived in brain/pilotFlightPolicy-selfcheck.mjs for a day and took it from 1.8 s to 26 s, out of the quick sweep and
// into the rotation, so they were moved here and the policy gate is fast again). tools/ship/trainFlightPilot-selfcheck.mjs holds the TOOL built on them; this file holds mutate, train, prune and evaluate of brain/pilotFlightPolicy.mjs:
//
//   1  mutate: deterministic for an rng and a COPY; SPARSE (1..maxK weights, all counts occur, spread over the whole vector, a gaussian of sigma); maxK honoured
//   2  evaluate: the task's evaluate() over that weights' pilot, the default set TRAIN_WIDE_SET (40)
//   3  train: deterministic for a seed, a (1+1)-ES FROM THE HAND WEIGHTS (starts at the autopilot's score, never ends below it, reports the score of the weights it returns), improved and neutral counted apart and pinned for a seed,
//      onIter once per iteration, `start` honoured and copied, the default set TRAIN_WIDE_SET
//   4  prune: puts back every weight the result does not need, never scores below the search's own result, ends at a FIXED POINT (and a case that needs three passes takes three), reverts TOWARD the vector it is given
//
// SABOTAGE LOG (v4869) -- each applied to brain/pilotFlightPolicy.mjs in a scratch worktree, the gate run, the worktree restored. THIRTEEN, every one red by name (the number is how many rows went red):
//   M1 mutate: always one weight 4 | M2 mutate: only the first 40 weights picked 4 | M3 mutate: edits the parent in place (see below) | M4 train: a neutral child not accepted 2 | M5 train: any child accepted, so the best can fall 4 |
//   M6 train: `start` ignored 1 | M7 prune: one pass, not repeated to a fixed point 1 | M8 prune: `toward` ignored 1 | M9 prune: a weight reverted even when the score falls a lot 3 | M10 evaluate: the default set TRAIN_SET 1 |
//   M11 train: the default train set TRAIN_SET 1 | M12 train: onIter never called 1 | M13 train: the seed ignored 2.
//   M3 HUNG THE GATE: a mutate that edits its parent in place corrupts the weights every later row starts from, and the rows after it ran for more than 200 s (a hang is a red, but a minutes-long one is a bad one). The mutate rows now come
//   first and, if any is red, the gate says so and stops: M3 is red at once.
//   v4870: THE SAME THIRTEEN, applied to brain/pilotFlightMlp.mjs (the suite below runs for both networks), every one red by name: M1 2 | M2 1 | M3 3 | M4 2 | M5 3 | M6 1 | M7 1 | M8 1 | M9 3 | M10 1 | M11 1 | M12 1 | M13 3. The GPU
//   brain's multi-pass prune case is seed 5, 50 iterations on 3 scenarios (99 moved, 16 kept, three passes): no seed under 40 iterations on 6 scenarios needed a third pass for this network.
//   TWO WENT 0 RED THE FIRST TIME AND THE ROWS WERE STRENGTHENED: M7 (the 'fixed point' row held for a search whose first pass was already a fixed point, so a single pass passed: it now also takes a search that needs three passes -- seed 7, 30
//   iterations, 54 moved and 15 kept -- and asks for exactly three) and M11 (no row ran train() or prune() on their DEFAULT set: the start score at zero iterations now has to be the autopilot's on the 40 scenarios, -0.4655, not on the 12, -0.4529).
"use strict";
import * as PF from "./pilotFlightPolicy.mjs";
import * as MF from "./pilotFlightMlp.mjs";
import * as T from "./flightTask.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

console.log("pilotFlightTrain-selfcheck -- mutate, train, prune of the two flight pilots\n");

function suite(label, P, pins) {
    const ok2 = (name, cond, detail) => ok(label + ": " + name, cond, detail);
    console.log(`\n${label}: mutate, train, prune`);
    const hw = P.handWeights(), small = T.TRAIN_SET.slice(0, 6), changed = (a, b) => { const idx = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) idx.push(i); return idx; };
    const before = Array.from(hw), m1 = P.mutate(hw, 0.3, mulberry(1)), m1b = P.mutate(hw, 0.3, mulberry(1)), m2 = P.mutate(hw, 0.3, mulberry(2));
    ok2("!! mutate() is deterministic for an rng, different for another, and a COPY: the weights it was given are untouched", JSON.stringify(Array.from(m1)) === JSON.stringify(Array.from(m1b)) && JSON.stringify(Array.from(m1)) !== JSON.stringify(Array.from(m2)) && JSON.stringify(Array.from(hw)) === JSON.stringify(before) && m1 !== hw);
    const rng = mulberry(7), hits = new Set(), ks = new Set(), deltas = [];
    for (let i = 0; i < 400; i++) { const m = P.mutate(hw, 0.3, rng), idx = changed(hw, m); ks.add(idx.length); idx.forEach((j) => { hits.add(j); deltas.push(m[j] - hw[j]); }); }
    const sdv = Math.sqrt(deltas.reduce((a, v) => a + v * v, 0) / deltas.length);
    ok2("!! mutate() is SPARSE: each child differs from its parent in 1 to 4 weights (maxK), all four counts occur, the weights it picks are spread over the whole vector (not the first few), and a step is a gaussian of sigma 0.3 (rms within 10%)", Math.min(...ks) === 1 && Math.max(...ks) === 4 && ks.size === 4 && hits.size > 0.2 * P.WEIGHT_COUNT && Math.max(...hits) > 0.86 * P.WEIGHT_COUNT && near(sdv, 0.3, 0.03), `counts ${[...ks].sort().join("")}, ${hits.size} distinct weights, rms step ${sdv.toFixed(3)}`);
    const one = P.mutate(hw, 0.3, mulberry(3), 1), wide = new Set(); for (let i = 0; i < 200; i++) wide.add(changed(hw, P.mutate(hw, 0.3, mulberry(100 + i), 8)).length);
    ok2("...maxK is honoured: 1 means exactly one weight, 8 reaches 8", changed(hw, one).length === 1 && Math.max(...wide) === 8 && Math.min(...wide) >= 1);
    if (fails) { console.log("  ----  the rest is not run: mutate() is wrong above, and every training row below would measure that (a mutate that edits its parent in place made the next rows run for minutes, not seconds)"); console.log(`\npilotFlightTrain-selfcheck: ${fails} FAILED`); process.exit(1); }
    ok2("!! evaluate(weights, set) is the task's evaluate() over that weights' pilot, and its default set is TRAIN_WIDE_SET (the 40 the searches train on)", P.evaluate(hw, small).score === T.evaluate(P.pilotFor(hw), small).score && P.evaluate(hw, small).runs.length === 6 && T.TRAIN_WIDE_SET.length === 40 && P.evaluate(hw).runs.length === 40 && P.evaluate(hw).score === T.evaluate(P.pilotFor(hw), T.TRAIN_WIDE_SET).score);
    const seen = []; let r = P.train({ seed: 2, iters: 12, trainSet: small, onIter: (i, st) => seen.push([i, st.score, st.improved, st.neutral]) });
    const r2 = P.train({ seed: 2, iters: 12, trainSet: small }), r3 = P.train({ seed: 3, iters: 12, trainSet: small }), h0 = P.evaluate(hw, small).score;
    ok2("!! train() is deterministic for a seed (the same weights to the bit, the same counts) and different for another", JSON.stringify(Array.from(r.weights)) === JSON.stringify(Array.from(r2.weights)) && r.improved === r2.improved && r.neutral === r2.neutral && JSON.stringify(Array.from(r.weights)) !== JSON.stringify(Array.from(r3.weights)));
    ok2("!! train() is a (1+1)-ES FROM THE HAND WEIGHTS: it starts at the autopilot's own score, never ends below it, and the score it reports is the score of the weights it returns (so 'best so far' is tracked on the right child)", near(r.history[0].score, h0, 1e-12) && r.trainScore > h0 + 1e-6 && near(r.trainScore, P.evaluate(r.weights, small).score, 1e-12), `${h0.toFixed(4)} -> ${r.trainScore.toFixed(4)}`);
    ok2(`!! a child that IMPROVES replaces its parent and a child that scores EXACTLY what its parent did also replaces it, counted apart: the counts are pinned for this seed (${pins.improved} of 12 improve, ${pins.neutral} are neutral, at seed 2)`, r.improved === pins.improved && r.neutral === pins.neutral && r.iters === 12, `${r.improved} improved, ${r.neutral} neutral`);
    ok2("onIter is called once per iteration, in order, with the running best and the two counts (the last call is the result), and the history holds iteration 0 and the last", seen.length === 12 && seen.every((x, i) => x[0] === i + 1) && seen[11][1] === r.trainScore && seen[11][2] === r.improved && seen[11][3] === r.neutral && r.history[0].i === 0 && r.history[r.history.length - 1].i === 12 && seen.every((x, i, a) => !i || x[1] >= a[i - 1][1] - 1e-12));
    const st = P.train({ seed: 2, iters: 0, start: m1, trainSet: small });
    ok2("`start` is honoured and copied: zero iterations return the start vector (equal, not the same array)", JSON.stringify(Array.from(st.weights)) === JSON.stringify(Array.from(m1)) && st.weights !== m1 && st.improved === 0 && st.neutral === 0);
    const pr = P.prune(r.weights, { trainSet: small }), diff = (w, v) => { const a = []; for (let i = 0; i < w.length; i++) if (Math.abs(w[i] - v[i]) > 1e-6) a.push(i); return a; };
    ok2("!! prune() puts back every weight the result does not need: it ends with no more weights differing from the autopilot than the search moved, never scores below the search's own result, and a weight it reverted is the autopilot's value exactly", pr.moved === diff(r.weights, hw).length && pr.kept === diff(pr.weights, hw).length && pr.kept < pr.moved && pr.trainScore >= r.trainScore - 1e-9 && near(pr.trainScore, P.evaluate(pr.weights, small).score, 1e-12) && Array.from(pr.weights).every((v, i) => Math.abs(v - hw[i]) <= 1e-6 || v === r.weights[i]), `moved ${pr.moved}, kept ${pr.kept}`);
    const keptIdx = diff(pr.weights, hw), costs = keptIdx.map((i) => { const w = Float32Array.from(pr.weights); w[i] = hw[i]; return P.evaluate(w, small).score; });
    ok2("!! prune() ends at a FIXED POINT: putting back any single weight it kept makes the train score fall (they all carry the result)", keptIdx.length > 0 && costs.every((c) => c < pr.trainScore - 1e-9), `${keptIdx.length} kept; the cheapest to lose costs ${(pr.trainScore - Math.max(...costs)).toExponential(1)}`);
    const away = P.perturb(hw, 0.0, mulberry(1)); away[5] += 0.4;
    const pt = P.prune(r.weights, { toward: away, trainSet: small });
    ok2("prune() reverts TOWARD the vector it is given, not always toward the autopilot: toward a vector that differs from the hand weights in one weight, every weight it leaves differing from that vector is one the result needed", pt.moved === diff(r.weights, away).length && diff(pt.weights, away).length === pt.kept && pt.weights !== r.weights);
    const mp = pins.multi, mset = T.TRAIN_SET.slice(0, mp.scenarios), r7 = P.train({ seed: mp.seed, iters: mp.iters, trainSet: mset }), p7 = P.prune(r7.weights, { trainSet: mset }), k7 = diff(p7.weights, hw), c7 = k7.map((i) => { const w = Float32Array.from(p7.weights); w[i] = hw[i]; return P.evaluate(w, mset).score; });
    ok2(`!! prune() REPEATS TO A FIXED POINT: a search whose first pass reverts weights that make others revertible takes three passes (seed ${mp.seed}, ${mp.iters} iterations on ${mp.scenarios} scenarios: ${mp.moved} moved, ${mp.kept} kept), and ends where no single kept weight can be put back without a fall`, p7.passes === 3 && p7.moved === mp.moved && p7.kept === mp.kept && c7.every((c) => c < p7.trainScore - 1e-9), `${p7.passes} passes, ${p7.moved} moved, ${p7.kept} kept`);
    ok2("!! train() and prune() use TRAIN_WIDE_SET by default: with no iterations the start score train() reports, and the score prune() reports for the hand weights, are the autopilot's score on the 40 scenarios (-0.4655), not on the 12 of TRAIN_SET (-0.4529)", near(P.train({ seed: 1, iters: 0 }).trainScore, -0.4655, 6e-5) && near(P.prune(hw).trainScore, -0.4655, 6e-5));
}

suite("fruit fly", PF, { improved: 4, neutral: 2, multi: { seed: 7, iters: 30, scenarios: 6, moved: 54, kept: 15 } });
suite("GPU brain", MF, { improved: 3, neutral: 5, multi: { seed: 5, iters: 50, scenarios: 3, moved: 99, kept: 16 } });

console.log(fails ? `\npilotFlightTrain-selfcheck: ${fails} FAILED` : "\npilotFlightTrain-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
