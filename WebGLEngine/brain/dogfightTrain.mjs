// WebGLEngine/brain/dogfightTrain.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SEARCH, WITHOUT THE JOB. brain/pilotFlightPolicy.mjs and brain/pilotFlightMlp.mjs each carry a train() and a prune() that search their own weights on brain/flightTask.mjs -- the loop is the same in both and the job is hard-wired
// into it. The dogfight (brain/dogfightTask.mjs) is a different job for the SAME two networks, so this module is that loop with the job taken out: it asks a policy for its hand weights and its sparse mutation, asks the CALLER for
// a score, and does the rest.
//
//   trainWith(policy, score, { seed, iters, sigma, maxK, start })     a sparse-mutation (1+1)-ES: from `start` (default the policy's hand weights, which ARE the autopilot's laws), mutate 1..maxK weights by a gaussian of sigma, keep the child
//                                                                     if it scores at least as well (a strict gain counts as improved, a tie as neutral -- a tie MOVES, which is how a search drifts across a flat patch), `iters` times
//   trainBatchedWith(policy, scores, { seed, iters, sigma, maxK, start })   the same (1+1)-ES with the job in BATCHES: `scores[b](w)` is the score of w on batch b, and iteration i judges the child against its parent on ONE batch, (i - 1) % batches
//                                                                     -- parent and child on the SAME batch, so the comparison is paired, and a different batch each time, so a search of `iters` iterations meets every batch about iters / batches
//                                                                     times and cannot settle on the quirks of one small set (a search that scores twelve fights can win them by something that is not flying). The parent's score on a batch is
//                                                                     asked for once per parent (it is remembered until the parent changes). With ONE batch it is trainWith(), bit for bit.
//   pruneWith(policy, score, w, { toward })                           put each weight that differs from `toward` (default the hand weights) back, one at a time, keeping the reversion if the score does not fall; repeat until a pass
//                                                                     reverts nothing (a FIXED POINT: every weight that is left carries the score)
//
// *** IT IS HELD TO THE ORIGINALS, NOT TO ITSELF (brain/dogfightTrain-selfcheck.mjs): *** with the flight task's score it gives, bit for bit, what PF.train / PF.prune and MF.train / MF.prune give for the same seed -- the same weights, the same
// scores, the same counts -- so a search run here on fights is the search the flight pilots were trained by, on a different job. A score is a function of the weights alone; the search holds no randomness but its seed.
"use strict";

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A (1+1)-ES over a policy's weights. `score(w)` is a number to maximise. Returns { weights, trainScore, history ([{ i, score }] every 50 iterations and at the end), iters, improved, neutral }. */
export function trainWith(policy, score, { seed = 7, iters = 600, sigma = 0.3, maxK = 4, start = null, onIter = null } = {}) {
    const rng = mulberry(seed);
    let best = start ? Float32Array.from(start) : policy.handWeights(), bestScore = score(best), improved = 0, neutral = 0;
    const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = policy.mutate(best, sigma, rng, maxK), s = score(cand);
        if (s > bestScore + 1e-9) { best = cand; bestScore = s; improved++; } else if (s >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % 50 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved, neutral });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved, neutral };
}

/**
 * A (1+1)-ES whose iterations are each judged on ONE batch of a list (see the header). `scores` is a non-empty array of functions of the weights. Returns { weights, trainScore (the mean over ALL the batches of the final weights' scores), batchScores (each of those), iters, improved, neutral }.
 * Iteration i (from 1) mutates 1..maxK weights, scores parent and child on batch (i - 1) % scores.length, and keeps the child if it is at least as good there (a strict gain is `improved`, a tie `neutral`, and a tie MOVES, as in trainWith).
 * `onIter(i, { improved, neutral, batch })` is called once per iteration.
 */
export function trainBatchedWith(policy, scores, { seed = 7, iters = 600, sigma = 0.3, maxK = 4, start = null, onIter = null } = {}) {
    if (!Array.isArray(scores) || scores.length < 1 || !scores.every((f) => typeof f === "function")) throw new Error("trainBatchedWith(): scores must be a non-empty array of functions (one per batch)");
    const rng = mulberry(seed), nB = scores.length, parent = new Array(nB).fill(null);   // parent[b]: the current parent's score on batch b, once it has been asked for
    let best = start ? Float32Array.from(start) : policy.handWeights(), improved = 0, neutral = 0;
    for (let i = 1; i <= iters; i++) {
        const b = (i - 1) % nB, cand = policy.mutate(best, sigma, rng, maxK);
        const sp = parent[b] !== null ? parent[b] : (parent[b] = scores[b](best)), sc = scores[b](cand);
        if (sc > sp + 1e-9) { best = cand; improved++; parent.fill(null); parent[b] = sc; } else if (sc >= sp - 1e-9) { best = cand; neutral++; parent.fill(null); parent[b] = sc; }
        if (onIter) onIter(i, { improved, neutral, batch: b });
    }
    const batchScores = scores.map((f) => f(best));
    return { weights: best, trainScore: batchScores.reduce((a, x) => a + x, 0) / nB, batchScores, iters, improved, neutral };
}

/** Revert every weight that differs from `toward` while the score does not fall, to a fixed point. Returns { weights, kept (weights still different), moved (different when it began), passes, trainScore }. */
export function pruneWith(policy, score, w, { toward = null } = {}) {
    const base0 = toward ? Float32Array.from(toward) : policy.handWeights(), out = Float32Array.from(w);
    const differs = () => { const idx = []; for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - base0[i]) > 1e-6) idx.push(i); return idx; };
    const moved = differs().length; let best = score(out), passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const i of differs()) {
            const keep = out[i]; out[i] = base0[i];
            const s = score(out);
            if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep;
        }
    } while (reverted > 0);
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}

export function reportLines() {
    return ["[dogfightTrain] a (1+1)-ES (whole-set or batched: each iteration judged on one batch of a list) and a prune over a policy's weights, with the job (the score) handed in: the loop brain/pilotFlightPolicy.mjs and brain/pilotFlightMlp.mjs train by, on any job"];
}
