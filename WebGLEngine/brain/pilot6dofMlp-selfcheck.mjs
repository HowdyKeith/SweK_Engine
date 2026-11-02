// WebGLEngine/brain/pilot6dofMlp-selfcheck.mjs
//
// Run: node brain/pilot6dofMlp-selfcheck.mjs      (~10 s)
//
// THE SIBLING GATE OF brain/pilot6dofMlp.mjs: the GPU Brain's pilot for the 6-DOF space duel -- 12 features -> 32 relu -> 32 relu -> 5, 1,637 weights -- registered in brain/SIXDOF_GPU_BRAIN_WIP.md before it was built.
//
//   1  shape: 12 -> 32 -> 32 -> 5, 1,637 weights = 384 + 32 + 1024 + 32 + 160 + 5; the layer views are views onto the weights; the senses and outputs are the fruit fly's own
//   2  THE FORWARD PASS: random weights and features, the network against an independent float64 restatement written HERE (to 1e-5: float32 against double) and against render/brainTsl.mjs's mlpLayerCpu chain
//      (to the bit: it IS that chain), then tanh
//   3  THE HAND WEIGHTS ARE THE FRUIT FLY'S HAND PILOT: 32 non-zero weights, all in the first eight neurons; over 300 random states the five outputs equal the fruit fly's hand forward() TO THE BIT; and C-TWIN --
//      the hand MLP flies the fruit fly's hand pilot (and so the PD autopilot) to the same fingerprint on all twenty train and held-out seeds
//   4  the pilot's contract, zero and noise: decide()'s fields; the zero MLP never turns, thrusts or fires; a noisy MLP is another fight
//   5  THE TRAINING FUNCTIONS: mutate moves 1..maxK weights; evaluate IS pilot6dofPolicy.evaluate with this network's pilot; train is deterministic for a seed and accepts only what scores at least its parent; prune puts back
//      a weight that carries nothing (one in a dead neuron) and keeps one that does
//   6  the front door
//
// SABOTAGE LOG (2026-11-02) -- each applied to brain/pilot6dofMlp.mjs with the byte-safe runner, this gate, tools/ship/train6dofMlp-selfcheck.mjs and brain/pilot6dofPolicy-selfcheck.mjs run, the file restored
// byte-identical (sha256); the number is the rows that went red, by name:
//   S1 the second layer without its relu 3 | S2 the second layer passing seven of the eight hand channels 5 | S3 the readout's biases left out of the hand weights 4 | S4 the torque not scaled by the axis' inertia 2
//   S5 the fire output without its tanh 3 | S6 mutate moving up to maxK + 1 weights 1 | S8 prune never putting a weight back 2 | S9 evaluate handing the weights, not the pilot 2
//   S7 train accepting every child: *** 0 RED ON THE FIRST DRAFT, A FINDING ***: the row checked the score train() REPORTS, which a search that takes a worse child never lowers. It now re-scores the weights train()
//      RETURNS against the reported score: re-run, 1 red.
"use strict";
import * as M from "./pilot6dofMlp.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

console.log("1. SHAPE");
{
    const w = M.zeroWeights(), L = M.layersOf(w);
    ok("!! 12 -> 32 -> 32 -> 5, 1,637 weights = 384 + 32 + 1024 + 32 + 160 + 5, and the senses and outputs are the fruit fly's own (the same arrays, not copies)",
        M.LAYER_SIZES.join() === "12,32,32,5" && M.WEIGHT_COUNT === 1637 && L[0].W.length === 384 && L[0].b.length === 32 && L[1].W.length === 1024 && L[1].b.length === 32 && L[2].W.length === 160 && L[2].b.length === 5 &&
        M.FEATURE_NAMES === P6.FEATURE_NAMES && M.OUTPUT_NAMES === P6.OUTPUT_NAMES && M.features === P6.features && M.featuresFrom === P6.featuresFrom && M.TORQUE_GAIN === P6.TORQUE_GAIN);
    L[1].W[5] = 0.75; L[2].b[4] = -0.5;
    ok("  the layer views are views onto the weights, in brain/mlp.js's order (W nOut x nIn, then b), with relu, relu, none",
        w[384 + 32 + 5] === 0.75 && w[1636] === -0.5 && L.map((l) => l.act).join() === "relu,relu,none" && L.every((l) => l.W.length === l.nIn * l.nOut));
}

console.log("\n2. THE FORWARD PASS");
{
    // an independent restatement, in float64, of what the header says the network is
    const restate = (w, x) => {
        const h1 = Array.from({ length: 32 }, (_, j) => { let s = w[384 + j]; for (let f = 0; f < 12; f++) s += w[j * 12 + f] * x[f]; return Math.max(0, s); });
        const h2 = Array.from({ length: 32 }, (_, j) => { let s = w[416 + 1024 + j]; for (let k = 0; k < 32; k++) s += w[416 + j * 32 + k] * h1[k]; return Math.max(0, s); });
        return Array.from({ length: 5 }, (_, o) => { let s = w[1472 + 160 + o]; for (let k = 0; k < 32; k++) s += w[1472 + o * 32 + k] * h2[k]; return Math.tanh(s); });
    };
    const rng = mulberry(11); let worst = 0, chainSame = true;
    for (let t = 0; t < 50; t++) {
        const w = Float32Array.from({ length: M.WEIGHT_COUNT }, () => (rng() - 0.5) * 0.6), x = Array.from({ length: 12 }, () => (rng() - 0.5) * 3);
        const y = M.forward(w, x), r = restate(w, x);
        for (let o = 0; o < 5; o++) worst = Math.max(worst, Math.abs(y[o] - r[o]));
        let h = Float32Array.from(x); for (const l of M.layersOf(w)) h = mlpLayerCpu(l, h, 1);
        if (!y.every((v, o) => Object.is(v, Math.tanh(h[o])))) chainSame = false;
    }
    ok("!! the network is what the header says: an independent float64 restatement agrees to 1e-5 over 50 random weight sets (float32 against double)", worst < 1e-5, `worst ${worst.toExponential(2)}`);
    ok("!! ...and it IS render/brainTsl.mjs's mlpLayerCpu chain (the float32 mirror of the GPU kernel) then tanh, to the bit", chainSame);
}

console.log("\n3. THE HAND WEIGHTS ARE THE FRUIT FLY'S HAND PILOT");
{
    const hw = M.handWeights(), fly = P6.handWeights(), L = M.layersOf(hw);
    const nz = hw.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
    const outside = [0, 1].some((l) => { for (let h = M.HAND_NEURONS; h < 32; h++) { if (L[l].b[h] !== 0) return true; for (let k = 0; k < L[l].nIn; k++) if (L[l].W[h * L[l].nIn + k] !== 0) return true; } return false; }) ||
        [...Array(5).keys()].some((o) => { for (let h = M.HAND_NEURONS; h < 32; h++) if (L[2].W[o * 32 + h] !== 0) return true; return false; });
    ok("  32 non-zero weights (the fruit fly's 14 rows, 8 pass-throughs, 8 readouts, 2 gate biases), every one in the first eight neurons", nz === 32 && !outside && M.HAND_NEURONS === 8, `${nz} non-zero`);
    // 300 random ship states against random targets: the five outputs, to the bit
    const rng = mulberry(23), I = RB.boxInertia({ m: P6.SHIP_MASS, hx: P6.HALF[0], hy: P6.HALF[1], hz: P6.HALF[2] }); let same = 0;
    const qn = () => { const q = [rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5], n = Math.hypot(...q); return q.map((v) => v / n); };
    for (let t = 0; t < 300; t++) {
        const body = RB.createBody({ mass: P6.SHIP_MASS, I, pos: [(rng() - 0.5) * 200, (rng() - 0.5) * 60, (rng() - 0.5) * 60], q: qn(), vel: [(rng() - 0.5) * 20, (rng() - 0.5) * 6, (rng() - 0.5) * 6], w: [(rng() - 0.5) * 4, (rng() - 0.5) * 4, (rng() - 0.5) * 4] });
        const target = { pos: [(rng() - 0.5) * 200, (rng() - 0.5) * 60, (rng() - 0.5) * 60], vel: [(rng() - 0.5) * 20, 0, 0] }, opts = { weaponSpeed: 260, ...P6.PAGE_AUTOPILOT };
        const x = P6.features(body, target, opts), a = M.forward(hw, x), b = P6.forward(fly, x);
        if (a.every((v, o) => Object.is(v, b[o]))) same++;
    }
    ok("!! *** over 300 random states, the hand MLP's five outputs ARE the fruit fly's hand pilot's, to the bit (every zero term adds exactly 0 in float32) ***", same === 300, `${same} of 300`);
    const seeds = [...P6.TRAIN_SEEDS, ...P6.HELD_OUT_SEEDS], mlp = M.pilotFor(hw); let fp = 0;
    for (const seed of seeds) { const a = P6.duel(mlp, "autopilot", { seed }), b = P6.duel("hand", "autopilot", { seed }); if (a.fingerprint === b.fingerprint && a.score === b.score && a.hits === b.hits) fp++; }
    ok("!! *** C-TWIN: the hand MLP flies the fruit fly's hand pilot to the same fingerprint, score and hits on all twenty train and held-out seeds -- the two brains start from one pilot ***", fp === seeds.length, `${fp} of ${seeds.length}`);
}

console.log("\n4. THE PILOT'S CONTRACT, ZERO AND NOISE");
{
    const I = RB.boxInertia({ m: P6.SHIP_MASS, hx: P6.HALF[0], hy: P6.HALF[1], hz: P6.HALF[2] }), body = RB.createBody({ mass: P6.SHIP_MASS, I, pos: [0, 0, 0], q: [1, 0, 0, 0] });
    const d = M.pilotFor(M.handWeights())(body, { pos: [100, 5, 0], vel: [0, 0, 0] }, { ...P6.PAGE_AUTOPILOT });
    ok("  pilotFor() answers in decide()'s shape: a body-frame torque of three, a thrust of 0 or the page's force, a boolean fire, the range and the facing cosine",
        d.torqueBody.length === 3 && d.torqueBody.every(Number.isFinite) && (d.thrust === 0 || d.thrust === P6.PAGE_AUTOPILOT.thrustForce) && typeof d.firing === "boolean" && Math.abs(d.range - Math.hypot(100, 5)) < 1e-9 && d.facingCos <= 1);
    const z = P6.duel(M.pilotFor(M.zeroWeights()), "autopilot", { seed: 3 }), zf = P6.duel("zero", "autopilot", { seed: 3 });
    ok("  the zero MLP never turns, thrusts or fires (tanh 0 is not > 0): it fires nothing and flies the fruit fly's zero pilot's fight", z.shotsFired === 0 && z.fingerprint === zf.fingerprint);
    const noisy = M.perturb(M.handWeights(), 0.05, mulberry(5)), hn = P6.duel(M.pilotFor(noisy), "autopilot", { seed: 3 }), ha = P6.duel(M.pilotFor(M.handWeights()), "autopilot", { seed: 3 });
    ok("  a noisy MLP is another fight from the hand MLP it is made from (the weights reach the ship), and noise is deterministic for its seed",
        hn.fingerprint !== ha.fingerprint && M.perturb(M.handWeights(), 0.05, mulberry(5)).every((v, i) => Object.is(v, noisy[i])));
}

console.log("\n5. THE TRAINING FUNCTIONS");
{
    const hw = M.handWeights(), rng = mulberry(9); let inRange = true;
    for (let t = 0; t < 200; t++) { const c = M.mutate(hw, 0.3, rng, 4); let k = 0; for (let i = 0; i < c.length; i++) if (c[i] !== hw[i]) k++; if (k < 1 || k > 4) inRange = false; }
    ok("  mutate() moves one to four weights of 1,637, never more (a collision of two picks on one weight is one)", inRange);
    const e1 = M.evaluate(hw, P6.HELD_OUT_SEEDS), e2 = P6.evaluate("hand", P6.HELD_OUT_SEEDS);
    ok("  evaluate() IS pilot6dofPolicy.evaluate() with this network's pilot: the hand MLP's held-out tally is the fruit fly's hand pilot's", e1.score === e2.score && e1.wins === e2.wins && e1.losses === e2.losses && e1.hits === e2.hits, P6.describeEval(e1));
    const a = M.train({ seed: 31, iters: 12, trainSeeds: [1, 2, 3] }), b = M.train({ seed: 31, iters: 12, trainSeeds: [1, 2, 3] });
    // the weights it RETURNS are re-scored: a first draft checked only the score it reported, which a search that took a worse child kept unchanged (sabotage S7 went 0 red on it)
    const rescored = M.evaluate(a.weights, [1, 2, 3]).score;
    ok("!! train() is deterministic for its seed, and the weights it returns score exactly what it reports, at or above where it started (it accepts a child only at or above its parent)",
        a.weights.every((v, i) => Object.is(v, b.weights[i])) && a.trainScore === b.trainScore && Math.abs(rescored - a.trainScore) < 1e-9 && a.trainScore >= a.history[0].score - 1e-9 && a.improved + a.neutral <= 12,
        `${a.improved} improved, ${a.neutral} neutral; returned weights score ${rescored.toFixed(4)} against the reported ${a.trainScore.toFixed(4)}`);
    // a weight into neuron 20 (no output reads it) carries nothing and goes back; a hand weight that the duel needs stays
    const dead = Float32Array.from(hw); dead[20 * 12 + 3] = 0.8;
    const pd = M.prune(dead, { trainSeeds: [1, 2] });
    const live = Float32Array.from(hw); live[2 * 12 + 1] = 0; live[2 * 12 + 5] = 0;   // neuron 2's error and spin weights: the y-axis torque channel, switched off
    const pl = M.prune(live, { toward: M.zeroWeights(), trainSeeds: [1, 2] });
    ok("!! prune() puts back a weight that carries nothing (one into a neuron no output reads) and keeps what the score needs (pruning the hand pilot toward zero keeps weights)",
        pd.kept === 0 && pd.moved === 1 && pl.kept > 0, `dead: ${pd.moved} moved, ${pd.kept} kept; toward zero: ${pl.kept} of ${pl.moved} kept`);
}

console.log("\n6. THE FRONT DOOR");
{
    const lines = M.reportLines();
    ok("  reportLines() names the network, its weight count, the fruit fly's senses and the hand weights' count", /12 -> 32 -> 32 -> 5/.test(lines[0]) && /1637 weights/.test(lines[0]) && /32 of 1637 non-zero/.test(lines[1]));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether a search makes this network a better pilot than its hand weights. brain/SIXDOF_GPU_BRAIN_WIP.md's registered round answered it (H1 met), held by tools/ship/train6dofMlp-selfcheck.mjs section 5.");
process.exit(fails ? 1 : 0);
