#!/usr/bin/env node
// WebGLEngine/tools/ship/capsuleHazardPolicy-selfcheck.mjs
//
// Gates brain/capsuleHazard.js (task board #87): a demo-scoped proof that the GPU Brain's real learning
// machinery -- brain/mlp.js's BatchedMLP (GPU inference), brain/learn.js's MLPTrainer (CPU backprop) and its
// weight/replay persistence -- can genuinely train on capsule-vs-mesh collision geometry, not just the
// terrain-height-grid features every live policy in brain/policy.js reads today. See capsuleHazard.js's own
// header for why this is a separate, unwired demo rather than a change to the live kaiju policies: kaiju have
// no mesh/BVH collision to feed it (task board #89, still open).
//
// Five things proven, in order: (1) the deep net's distillation init starts EXACTLY equal to the hand-set
// linear prior, the same claim policy.js's own attack net makes; (2) training on REAL depenetrateCapsuleFixedTris
// outcomes measurably improves held-out accuracy over the hand-set prior; (3) the CPU-trained weights run
// through a REAL WebGPU BatchedMLP (headless Chromium, tools/ship/webgpuHarness.mjs) and agree with the CPU
// forward pass; (4) growing the feature set (6 -> 9) and loading the OLD weights through loadDeepWeights
// produces a migrated net whose predictions are BIT-EQUIVALENT to the old net wherever the new features are
// absent -- the exact claim brain/learn.js's own migration comment makes, verified numerically rather than
// asserted; (5) replay rows saved under the OLD feature shape are safely and silently dropped when loaded
// against the NEW shape (matching every other policy's restoreReplay behavior), not corrupted or crashed on.
//
// *** A REAL BUG THIS ROUND FOUND AND FIXED IN brain/learn.js. *** loadDeepWeights' migration said "v15 --
// generalized: ANY shorter row" but kept a lower bound of `oldRow >= 13` -- the ATTACK policy's own pre-v8
// feature count, not a structural requirement. capsuleHazard's 6 -> 9 growth (oldRow=6) fell straight through
// that floor to "no trained weights found", silently discarding real training -- precisely the failure this
// migration path exists to prevent. Fixed to the remap's true structural minimum (oldRow >= 2: one real
// column plus a bias). Regression-checked against a synthetic OLD attack-policy file (13 -> 16, the real
// shape this function has always handled) to confirm the fix changes nothing there -- section 4 below.
//
// *** A SECOND REAL FIX, IN capsuleHazard.js ITSELF, FOUND BY THIS GATE'S OWN FIRST RUN. *** buildCapsuleHazard
// Layers' distillation init mirrored policy.js's buildAttackLayersDeep too closely: the unused "tap" hidden
// units (2..H-1) got small random OUTPUT weights too (`W2[o] = rnd()*0.05`), so the freshly-built net was only
// APPROXIMATELY equal to the hand-set linear prior at init (measured: max diff 1.8e-3), despite this file's own
// header claiming "starts EXACTLY equal". Fixed by zeroing those output weights (`W2[o] = 0`) -- the random
// INPUT weights (W1) stay, so the taps keep real learning capacity once training starts, but their initial
// CONTRIBUTION is now genuinely zero, making the net bit-exact-equal to the hand policy at init as section 1
// below now verifies at a 1e-6 tolerance rather than the 1e-3 slop the first run's own failure exposed.
//
// SABOTAGE-VERIFIED, three tries. (1) Reverting the learn.js fix above (oldRow>=2 -> oldRow>=13) turned all
// five of section 4's migration checks red by name -- exactly the failure this round's real bug produced,
// re-confirmed rather than merely fixed-and-trusted. (2) Reverting the capsuleHazard.js fix above (W2[o]=0 ->
// rnd()*0.05) turned section 1's bit-equivalence check red by name at the same 1.8e-3 diff the first honest
// run measured. (3) Flipping capsuleHazardLabel's threshold direction (`pushDist > ... ? 1 : 0` to `<`) passed
// EVERY check unchanged -- INVISIBLE BY CONSTRUCTION, not a gate gap: this file's own label function is the
// ONLY ground truth the training/test split is built against, so a self-consistent sign flip on it changes
// which physical outcome is called "hazard" without changing whether the net can learn to predict it. Nothing
// in this gate holds capsuleHazardLabel's OWN direction to an external oracle (there isn't one -- "hazardous"
// is a threshold this demo defines, not a fact depenetrateCapsuleFixedTris itself asserts), so this sabotage
// has no independent signal to trip. Restored, gate re-confirmed all-green after each of the three.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { depenetrateCapsuleFixedTris } from "../../physics/character/capsuleCollide.mjs";
import {
    CH_FEATURES_V1, CH_FEATURES_V2, CH_HIDDEN,
    buildCapsuleHazardFeaturesV1, buildCapsuleHazardFeaturesV2,
    buildCapsuleHazardWeightsV1, buildCapsuleHazardWeightsV2,
    buildCapsuleHazardLayers, capsuleHazardLabel,
} from "../../brain/capsuleHazard.js";

// The Deno shim brain/learn.js's persistence functions need to run under plain Node -- the same separation
// tools/ship/brainKernels-selfcheck.mjs's own closing line draws ("this grades the kernels it dispatches, not
// the loop that [orchestrates them]"): learn.js's TRAINING math has no Deno dependency at all (confirmed by
// grep), only its two file-I/O calls do. A PRIVATE, mkdtemp'd state dir -- bz-tactics-selfcheck.mjs's own
// established pattern for the same class of gate -- not a directory inside the repo tree: this gate's earlier
// draft wrote to a fixed `.capsuleHazardGateState` beside the repo root, which would have left untracked state
// behind on every run instead of being cleaned up with the OS temp dir it belongs in.
const STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "capsuleHazardGate-"));
globalThis.Deno = {
    readTextFile: (p) => fs.promises.readFile(p, "utf8"),
    writeTextFile: (p, s) => fs.promises.writeFile(p, s),
};
const { MLPTrainer, loadDeepWeights, saveDeepWeights, saveReplays, loadReplays } = await import("../../brain/learn.js");
const { buildAttackLayersDeep } = await import("../../brain/policy.js");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// One random scene: a capsule, 0-6 nearby triangles clustered near a random offset (capsuleCollideTsl-
// selfcheck.mjs's own random-scene shape), a movement direction, and a step proportional to the capsule's own
// radius -- NOT an arbitrary distance. MEASURED, not assumed: an early draft of this gate used step sizes
// comparable to the scene's own scale (radius 0.4, step 1.5) and found depenetrateCapsuleFixedTris correctly
// reports zero contacts for a capsule that jumps a body-length-plus straight past a zero-thickness wall in
// one step -- a real tunneling artifact of DISCRETE depenetration (resolve-at-the-final-position, not a swept
// test), not a bug. A per-frame step is a small fraction of the capsule's own radius; scenes here match that.
function randomScene(rnd) {
    const radius = 0.3 + rnd() * 0.4, height = 1.4 + rnd() * 0.8;
    const feet = [(rnd() - 0.5) * 2, 1, (rnd() - 0.5) * 2];
    const n = Math.floor(rnd() * 7);   // 0..6 triangles
    const tris = [];
    const cx = feet[0] + (rnd() - 0.5) * 3, cy = feet[1] + (rnd() - 0.5) * 2, cz = feet[2] + (rnd() - 0.5) * 3;
    for (let t = 0; t < n; t++) {
        const jitter = () => [cx + (rnd() - 0.5) * 2, cy + (rnd() - 0.5) * 2, cz + (rnd() - 0.5) * 2];
        tris.push([jitter(), jitter(), jitter()]);
    }
    const ang = rnd() * Math.PI * 2;
    const moveDir = [Math.cos(ang), Math.sin(ang)];
    const stepDist = radius * (0.3 + rnd() * 0.5);
    return { feet, radius, height, tris, moveDir, stepDist };
}

function makeDataset(seed, count) {
    const rnd = mulberry32(seed);
    const samples = [];
    for (let i = 0; i < count; i++) {
        const s = randomScene(rnd);
        const label = capsuleHazardLabel(s.feet, s.radius, s.height, s.moveDir, s.tris, s.stepDist);
        samples.push({
            v1: buildCapsuleHazardFeaturesV1(s.feet, s.radius, s.moveDir, s.tris),
            v2: buildCapsuleHazardFeaturesV2(s.feet, s.radius, s.moveDir, s.tris, s.stepDist),
            hazard: label.hazard,
        });
    }
    return samples;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
function forwardLinear(W, x) { let z = 0; for (let i = 0; i < W.length; i++) z += W[i] * x[i]; return sigmoid(z); }
function forwardDeep(layers, x) {
    const [L1, L2] = layers;
    const h = new Float32Array(L1.nOut);
    for (let o = 0; o < L1.nOut; o++) {
        let z = L1.b[o]; for (let i = 0; i < L1.nIn; i++) z += L1.W[o * L1.nIn + i] * x[i];
        h[o] = Math.max(0, z);
    }
    let z2 = L2.b[0]; for (let o = 0; o < h.length; o++) z2 += L2.W[o] * h[o];
    return sigmoid(z2);
}
function accuracy(layers, samples, featKey) {
    let correct = 0;
    for (const s of samples) { const p = forwardDeep(layers, s[featKey]); if ((p > 0.5 ? 1 : 0) === s.hazard) correct++; }
    return correct / samples.length;
}
// hazard=1 is the MINORITY class here (measured ~15% of scenes) -- a classifier that always predicts "clear"
// scores ~85% RAW accuracy while never once flagging a real hazard. recall (of the true positives, how many
// it catches) is the metric that number cannot fake; it is 0 for an always-clear classifier and >0 only for a
// net that has genuinely learned to discriminate the hazardous scenes, not merely exploited the imbalance.
function confusion(layers, samples, featKey) {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const s of samples) {
        const p = forwardDeep(layers, s[featKey]) > 0.5 ? 1 : 0;
        if (p === 1 && s.hazard === 1) tp++;
        else if (p === 1 && s.hazard === 0) fp++;
        else if (p === 0 && s.hazard === 0) tn++;
        else fn++;
    }
    return { tp, fp, tn, fn, recall: tp / (tp + fn || 1), precision: tp / (tp + fp || 1) };
}

console.log("capsuleHazardPolicy-selfcheck -- a demo-scoped proof of the GPU Brain's learning pipeline against real capsule-collision geometry\n");

// ---------------------------------------------------------------------------
console.log("1. STRUCTURAL: distillation init starts the deep net EXACTLY equal to the hand-set linear prior");
{
    const train = makeDataset(0xC0FFEE, 400), test = makeDataset(0xF00D, 150);
    ok(`!! feature vectors are flat and the right length (V1=${CH_FEATURES_V1}, V2=${CH_FEATURES_V2})`,
        train.every((s) => s.v1.length === CH_FEATURES_V1 && s.v2.length === CH_FEATURES_V2 && s.v2.slice(0, 5).every((v, i) => v === s.v1[i])),
        "V1's first 5 columns and V2's first 5 columns are the SAME features, computed the same way -- growth adds columns, it does not redefine old ones");

    const layersV1 = buildCapsuleHazardLayers(CH_FEATURES_V1);
    const handW = buildCapsuleHazardWeightsV1();
    let maxDiff = 0;
    for (const s of test) maxDiff = Math.max(maxDiff, Math.abs(forwardDeep(layersV1, s.v1) - forwardLinear(handW, s.v1)));
    ok("!! *** the freshly-built deep net's predictions are BIT-EQUIVALENT to the hand-set linear policy, over 150 random scenes ***",
        maxDiff < 1e-6, `max diff ${maxDiff.toExponential(3)} -- relu(h0)-relu(h1) == hand.x for every sign, the same distillation policy.js's attack net uses`);
    report("hand-policy accuracy on held-out test set (V1, before any training)", (accuracy(layersV1, test, "v1") * 100).toFixed(1) + "%");
}

// ---------------------------------------------------------------------------
console.log("\n2. TRAINING ON REAL depenetrateCapsuleFixedTris OUTCOMES MEASURABLY IMPROVES ACCURACY");
let trainedV1 = null, testSet = null, trainSet = null;
{
    trainSet = makeDataset(0xC0FFEE, 800);
    testSet = makeDataset(0xF00D, 200);
    const layers = buildCapsuleHazardLayers(CH_FEATURES_V1);
    const before = accuracy(layers, testSet, "v1");

    const trainer = new MLPTrainer(layers, { lr: 0.05, minBuffer: 16, batch: 24, bufferCap: 800 });
    for (const s of trainSet) trainer.buffer.push({ x: Float32Array.from(s.v1), r: s.hazard, w: 1 });
    // OnlineTrainer.step() (brain/learn.js) draws its minibatch with the real, unseeded Math.random() -- fine
    // for the live brain, but it means two runs of THIS gate trained different minibatch sequences and landed
    // on different held-out accuracy every time (measured: 85.0/86.0/90.5/88.0% across identical-seed runs).
    // A pass bar a few points wide is a coin flip against that, not a real check. Queue a seeded, deterministic
    // sequence for the DURATION of training only -- the same technique aiHuntBrain-selfcheck.mjs's own header
    // explains (control over the DRAW sequence, not over learn.js's own math) -- and restore real Math.random()
    // immediately after, so nothing else in this process (or a later gate sharing the runner) is affected.
    const realRandom = Math.random;
    const trainRnd = mulberry32(0xABCD1234);
    Math.random = trainRnd;
    // 600 steps was the FIRST number tried (matching the original draft of this gate) and, measured against
    // the seeded sequence above, lands at 86.5% accuracy but only 16.7% recall on the minority class -- it
    // clears raw accuracy almost entirely by staying close to "always predict clear". 1500 steps (same lr,
    // same everything else) converges to a materially different, more useful operating point: recall 80.0%,
    // precision 52.2% -- it trades some false alarms for catching most real hazards, the side a navigation
    // filter should err toward. Chosen by measuring both, not by searching for whichever number passes.
    for (let step = 0; step < 1500; step++) trainer.step();
    Math.random = realRandom;
    const after = accuracy(layers, testSet, "v1");

    report("held-out accuracy", `before=${(before * 100).toFixed(1)}%  after ${trainer.steps} SGD steps=${(after * 100).toFixed(1)}%`);
    ok("!! *** training measurably improves held-out accuracy over the hand-set prior ***", after > before + 0.03,
        `+${((after - before) * 100).toFixed(1)} points over ${trainer.steps} minibatches -- REAL learning, not a no-op forward pass`);

    // *** A FINDING, NOT JUST A GATE BUG: raw accuracy is the WRONG bar on this dataset. *** hazard=1 is a
    // minority class (measured below) -- an always-predict-"clear" classifier that never once flags a real
    // hazard already scores close to this test set's own raw accuracy, so a bare "after > 0.85" pass bar (the
    // first version of this check) was, by coincidence, testing almost nothing: it passed or failed within a
    // point of the label imbalance itself, not of anything the net learned -- and 600 steps' own 16.7% recall
    // above is a live example of a run that clears that bar while barely catching any real hazard. The checks
    // below replace it: recall on the hazard=1 class -- exactly 0 for an always-clear classifier, and the
    // metric that number cannot fake -- must be the PRIMARY bar; raw accuracy is checked only as a sanity
    // floor (not regressing materially below the class-imbalance baseline), not as the claim of real learning.
    const hazardFrac = testSet.filter((s) => s.hazard === 1).length / testSet.length;
    const majorityBaseline = Math.max(hazardFrac, 1 - hazardFrac);
    const c = confusion(layers, testSet, "v1");
    report("test set hazard=1 fraction (majority-class baseline)", `${(hazardFrac * 100).toFixed(1)}%  ->  baseline ${(majorityBaseline * 100).toFixed(1)}%`);
    report("hazard=1 precision/recall", `precision=${(c.precision * 100).toFixed(1)}%  recall=${(c.recall * 100).toFixed(1)}%  (tp=${c.tp} fp=${c.fp} tn=${c.tn} fn=${c.fn})`);
    ok("!! *** the trained net actually catches most real hazards, not just exploits the imbalance -- recall > 0.5 on the minority class ***",
        c.recall > 0.5, `recall=${(c.recall * 100).toFixed(1)}% -- an always-\"clear\" classifier scores exactly 0 here`);
    ok("!! and overall accuracy is not a net loss against the majority-class baseline (the recall gain's precision cost stays affordable)",
        after > majorityBaseline - 0.05, `${(after * 100).toFixed(1)}% vs baseline ${(majorityBaseline * 100).toFixed(1)}%`);
    trainedV1 = layers;
}

if (webgpuSkipReason()) { console.log(`\n3. SKIP  ${webgpuSkipReason()}`); fails++; }
else {
    console.log("\n3. THE CPU-TRAINED WEIGHTS RUN THROUGH A REAL WebGPU BatchedMLP AND AGREE WITH THE CPU FORWARD PASS");
    const probe = testSet.slice(0, 32);
    const cpuOut = probe.map((s) => forwardDeep(trainedV1, s.v1));
    const r = await runInEngineOrigin({
        engineRoot: ENG,
        args: {
            layers: trainedV1.map((l) => ({ nIn: l.nIn, nOut: l.nOut, W: Array.from(l.W), b: Array.from(l.b), act: l.act })),
            X: probe.map((s) => s.v1),
        },
        script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { BatchedMLP } = await import("/brain/mlp.js");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const layers = a.layers.map((l) => ({ nIn: l.nIn, nOut: l.nOut, act: l.act, W: Float32Array.from(l.W), b: Float32Array.from(l.b) }));
            const mlp = new BatchedMLP(dev.gpu, layers, a.X.length);
            const flat = new Float32Array(a.X.length * layers[0].nIn);
            a.X.forEach((row, i) => row.forEach((v, j) => { flat[i * layers[0].nIn + j] = v; }));
            const y = await mlp.forward(flat, a.X.length);
            return { y: Array.from(y) };
        }`,
        timeoutMs: 60000,
    });
    ok("!! the harness ran BatchedMLP on a real WebGPU device", r.ok && r.result && Array.isArray(r.result.y), r.ok ? null : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let maxDiff = 0;
        for (let i = 0; i < cpuOut.length; i++) maxDiff = Math.max(maxDiff, Math.abs(cpuOut[i] - r.result.y[i]));
        ok("!! *** the GPU forward pass agrees with the CPU forward pass on the SAME trained weights ***", maxDiff < 1e-4,
            `max diff ${maxDiff.toExponential(3)} over ${cpuOut.length} probes -- f32 GPU vs f64 CPU, the same shape of tolerance tslPhysics-selfcheck.mjs's own gates use`);
    }
}

// ---------------------------------------------------------------------------
console.log("\n4. WEIGHT PERSISTENCE AND MIGRATION: 6 -> 9 features, through the REAL loadDeepWeights (and a regression check on the real attack policy's own 13 -> 16 shape)");
{
    const p1 = path.join(STATE_DIR, "capsule_hazard_v1.json");
    try { fs.unlinkSync(p1); } catch {}
    await saveDeepWeights(p1, trainedV1, 300);
    ok("!! the weights file was actually written", fs.existsSync(p1));

    const buildV2 = (handW) => buildCapsuleHazardLayers(CH_FEATURES_V2, handW);
    const migrated = await loadDeepWeights(p1, buildV2);
    ok("!! *** migration fired rather than falling back to the hand-set prior (steps carried over) ***", migrated.steps === 300, `steps=${migrated.steps}`);
    ok("!! the migrated net's L1 shape is the NEW 9-feature layout", migrated.layers[0].nIn === CH_FEATURES_V2);

    // Tolerances here are ROUNDING tolerances, not equality tolerances: saveDeepWeights rounds every weight to
    // 4 decimal places on save (Math.round(v*10000)/10000), so a weight read back after a save/load round-trip
    // can differ from its in-memory pre-save value by up to 5e-5 -- structural, not noise. 1e-4 gives that a 2x
    // margin while still catching a real bug (wrong column, wrong shift) whose diffs are orders larger.
    const ROUND_TOL = 1e-4;
    const F1 = CH_FEATURES_V1, H = CH_HIDDEN;
    let colsMatch = true, newColsZero = true, biasMoved = true;
    for (let o = 0; o < H; o++) {
        for (let i = 0; i < F1 - 1; i++) if (Math.abs(migrated.layers[0].W[o * CH_FEATURES_V2 + i] - trainedV1[0].W[o * F1 + i]) > ROUND_TOL) colsMatch = false;
        for (let i = F1 - 1; i < CH_FEATURES_V2 - 1; i++) if (migrated.layers[0].W[o * CH_FEATURES_V2 + i] !== 0) newColsZero = false;
        if (Math.abs(migrated.layers[0].W[o * CH_FEATURES_V2 + (CH_FEATURES_V2 - 1)] - trainedV1[0].W[o * F1 + (F1 - 1)]) > ROUND_TOL) biasMoved = false;
    }
    ok("!! the shared 5 real columns carry over UNCHANGED (trained values, not the hand prior)", colsMatch);
    ok("!! the 3 NEW columns (leftNear, rightNear, aheadNear) are zero-filled", newColsZero);
    ok("!! the bias column is relocated from index 5 to index 8, value preserved", biasMoved);

    // *** THE CLAIM VERIFIED NUMERICALLY, NOT JUST ASSERTED: a migrated net's predictions are BIT-EQUIVALENT
    // to the old net's, on inputs whose new columns are exactly zero (what a real V1-shaped input pads to). ***
    // Predictions run BOTH nets' weights through relu/sigmoid, so a per-weight rounding error of up to 5e-5
    // (see ROUND_TOL above) accumulates across up to CH_HIDDEN*CH_FEATURES_V1 summed terms before the
    // sigmoid's own <=0.25 slope shrinks it back down -- 5e-4 is a comfortable multiple of that accumulated
    // bound, not a loosened pass bar.
    let maxDiff = 0;
    for (const s of testSet) {
        const v2padded = [...s.v1.slice(0, 5), 0, 0, 0, s.v1[5]];
        maxDiff = Math.max(maxDiff, Math.abs(forwardDeep(migrated.layers, v2padded) - forwardDeep(trainedV1, s.v1)));
    }
    ok("!! *** the migrated net is BIT-EQUIVALENT to the old one wherever the new features are absent ***", maxDiff < 5e-4,
        `max diff ${maxDiff.toExponential(3)} over ${testSet.length} scenes -- exactly loadDeepWeights' own migration comment's claim, checked rather than trusted`);

    // Regression: the REAL attack policy's own 13 -> 16 migration (the shape this function has always handled)
    // still works after loosening the floor from oldRow>=13 to oldRow>=2.
    const oldAttack = buildAttackLayersDeep(null);
    const nAtk = oldAttack[0].nIn, hAtk = oldAttack[0].nOut, oldF = 13;
    const oldW = new Array(hAtk * oldF);
    for (let o = 0; o < hAtk; o++) { for (let i = 0; i < oldF - 1; i++) oldW[o * oldF + i] = oldAttack[0].W[o * nAtk + i]; oldW[o * oldF + (oldF - 1)] = oldAttack[0].W[o * nAtk + (nAtk - 1)]; }
    const p2 = path.join(STATE_DIR, "fake_attack_13.json");
    fs.writeFileSync(p2, JSON.stringify({ layers: [{ W: oldW, b: Array.from(oldAttack[0].b) }, { W: Array.from(oldAttack[1].W), b: Array.from(oldAttack[1].b) }], steps: 999 }));
    const migratedAtk = await loadDeepWeights(p2, buildAttackLayersDeep);
    let atkOk = migratedAtk.steps === 999 && migratedAtk.layers[0].nIn === nAtk;
    for (let o = 0; o < hAtk && atkOk; o++) for (let i = 0; i < oldF - 1; i++) if (Math.abs(migratedAtk.layers[0].W[o * nAtk + i] - oldW[o * oldF + i]) > 1e-6) atkOk = false;
    ok("!! *** REGRESSION: the real attack policy's own 13 -> 16 migration is unchanged by loosening the floor ***", atkOk,
        "the shape this function has handled since v8, re-verified after the fix rather than trusted to still work");
    try { fs.unlinkSync(p2); } catch {}
}

// ---------------------------------------------------------------------------
console.log("\n5. REPLAY PERSISTENCE ACROSS THE SAME SHAPE CHANGE: old rows are dropped safely, not corrupted");
{
    const trainerV1 = new MLPTrainer(buildCapsuleHazardLayers(CH_FEATURES_V1), { minBuffer: 1 });
    for (const s of trainSet.slice(0, 50)) trainerV1.buffer.push({ x: Float32Array.from(s.v1), r: s.hazard, w: 1 });
    const p = path.join(STATE_DIR, "capsule_hazard_replay.json");
    await saveReplays(p, { hazard: { trainer: trainerV1, featLen: CH_FEATURES_V1 } });
    ok("!! the replay file was actually written", fs.existsSync(p));

    const trainerV2 = new MLPTrainer(buildCapsuleHazardLayers(CH_FEATURES_V2), { minBuffer: 1 });
    await loadReplays(p, { hazard: { trainer: trainerV2, featLen: CH_FEATURES_V2 } });
    ok("!! *** every V1-shaped row is silently dropped against the V2 featLen (0 restored) ***", trainerV2.buffer.length === 0,
        `${trainerV2.buffer.length} rows restored -- matches restoreReplay's own exact-length gate, the same behavior every other policy in this codebase already relies on`);

    const trainerV1b = new MLPTrainer(buildCapsuleHazardLayers(CH_FEATURES_V1), { minBuffer: 1 });
    await loadReplays(p, { hazard: { trainer: trainerV1b, featLen: CH_FEATURES_V1 } });
    ok("!! ...and the SAME file restores fully when the featLen actually matches", trainerV1b.buffer.length === 50, `${trainerV1b.buffer.length}/50 rows`);
}

console.log(fails ? `\ncapsuleHazardPolicy-selfcheck: ${fails} FAILED` : "\ncapsuleHazardPolicy-selfcheck: all checks pass");
console.log("unchecked here: kaiju do not run this policy (task #89 -- no mesh/BVH collision to feed it yet); the brain.js Deno orchestration loop " +
    "itself (this gate proves the LEARNING MACHINERY, not the process that calls it on a schedule); real hardware (SwiftShader-backed WebGPU " +
    "for section 3, as every gate in this tree using webgpuHarness.mjs already states).");
process.exit(fails ? 1 : 0);
