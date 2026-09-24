#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateFolds.mjs -- v4698: the runner render/learned-folds-preregistration.md declares.
//
// *** BUILT AND GATED IN THE PRE-REGISTRATION'S ROUND, AND NOT RUN ON FSR DATA IN IT. *** tools/ship/
// foldStats-selfcheck.mjs drives `runFolds` over SYNTHETIC scenes to prove its structure -- no fold trains on
// the scene it scores, a seed reproduces a run bit for bit, the two shuffled arms differ only in their
// permutation -- and never calls `harvestAll`. The measurement is the next round's, through this file as
// committed here.
//
// *** A BLOCK IS USED ONLY IF IT IS FINITE IN BOTH FEATURE SETS. *** Every arm then scores the identical
// population and a difference between arms is a difference between feature sets. tools/ship/genGateTransfer.mjs
// said this of itself at v4696 and filtered each set on its own row; it is fixed there too.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { N_FEATURES, N_FEATURES_V2, fitScaler, applyScaler, forward, auc } from "../../render/genGate.mjs";
import { MLPTrainer } from "../../brain/learn.js";
import { ARMS, declared, seededRng, h4, c11, usableFolds } from "./foldStats.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE = "tools/ship/genGate-folds7.json";
export const RESULT = "tools/ship/genGate-folds7-result.json";

/** Rows usable by EVERY arm: finite in v1 AND v2. */
export function jointRows(frames) {
    const X1 = [], X2 = [], Y = [];
    for (const f of frames) for (let b = 0; b < f.y.length; b++) {
        const r1 = f.x.slice(b * N_FEATURES, (b + 1) * N_FEATURES);
        const r2 = f.x2.slice(b * N_FEATURES_V2, (b + 1) * N_FEATURES_V2);
        if (!r1.every(Number.isFinite) || !r2.every(Number.isFinite)) continue;
        X1.push(...r1); X2.push(...r2); Y.push(f.y[b]);
    }
    return { x1: Float32Array.from(X1), x2: Float32Array.from(X2), y: Uint8Array.from(Y), n: Y.length };
}

/** Distinct, reproducible streams per (seed, purpose): init+sampling, and each shuffled arm's permutation. */
const STREAM = Object.freeze({ fit: 0x1000, SHUF_A: 0x2000, SHUF_B: 0x3000 });
const rngFor = (seed, purpose) => seededRng(Math.imul(seed, 0x9e3779b1) ^ STREAM[purpose]);

export function fit(x, y, n, nf, seed, d, scaler) {
    const rnd = rngFor(seed, "fit");
    const Z = applyScaler(x, scaler);
    const H = d.hidden;
    const L1 = { nIn: nf, nOut: H, act: "relu",
                 W: Float32Array.from({ length: H * nf }, () => (rnd() * 2 - 1) / Math.sqrt(nf)), b: new Float32Array(H) };
    const L2 = { nIn: H, nOut: 1, act: "sigmoid",
                 W: Float32Array.from({ length: H }, () => (rnd() * 2 - 1) / Math.sqrt(H)), b: new Float32Array(1) };
    const t = new MLPTrainer([L1, L2], { lr: d.lr, batch: d.batch, minBuffer: 64, bufferCap: n + 8, rng: rnd });
    for (let i = 0; i < n; i++) t.buffer.push({ x: Z.subarray(i * nf, (i + 1) * nf), r: y[i], w: 1 });
    for (let s = 0; s < d.steps; s++) t.step();
    return { layers: [L1, L2], scaler };
}

export function shuffled(y, seed, arm) {
    const out = Uint8Array.from(y), rnd = rngFor(seed, arm);
    for (let i = out.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
}

/**
 * Leave one scene out over d.scenes, every arm, every seed. Returns per-fold per-arm per-seed held-out AUCs and
 * each fold's held-out label counts. `trainedOn` records, per fold, which scenes reached training, and `scalers`
 * the per-set scaler every arm of that fold used -- C5 is then a check on records the loop wrote, for the
 * scaler as well as the weights, and not on the loop's source text. (v4698: the first draft recorded the scenes
 * alone, so a scaler fitted on the held-out rows passed; a sabotage found it.)
 */
export function runFolds(byScene, d) {
    const results = {}, meta = {}, trainedOn = {}, scalers = {};
    for (const held of d.scenes) {
        const trainScenes = d.scenes.filter((s) => s !== held);
        trainedOn[held] = trainScenes.slice();
        const tr = jointRows(trainScenes.flatMap((s) => byScene[s])), te = jointRows(byScene[held]);
        const pos = te.y.reduce((a, v) => a + v, 0);
        meta[held] = { n: te.n, pos, neg: te.n - pos };
        results[held] = Object.fromEntries(ARMS.map((a) => [a, []]));
        const sc = { v1: fitScaler(tr.x1), v2: fitScaler(tr.x2) };
        scalers[held] = sc;
        for (const seed of d.seeds) for (const arm of ARMS) {
            const v2 = arm !== "V1";
            const [xtr, xte, nf] = v2 ? [tr.x2, te.x2, N_FEATURES_V2] : [tr.x1, te.x1, N_FEATURES];
            const ytr = arm.startsWith("SHUF") ? shuffled(tr.y, seed, arm) : tr.y;
            const m = fit(xtr, ytr, tr.n, nf, seed, d, v2 ? sc.v2 : sc.v1);
            results[held][arm].push(auc(forward(m.layers, applyScaler(xte, m.scaler), te.n), te.y).auc);
        }
    }
    return { results, meta, trainedOn, scalers };
}

export async function harvestAll(d) {
    const { harvest } = await import("./genGateTrain.mjs");
    const byScene = {};
    for (const s of d.scenes) byScene[s] = await harvest({ scenes: [s], upto: d.upto, speed: d.speed });
    return byScene;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared();
    const byScene = await harvestAll(d);
    fs.writeFileSync(path.join(ENG, CACHE), JSON.stringify(byScene));
    const run = runFolds(byScene, d);
    const { usable } = usableFolds(run.meta, d);
    const out = { declared: d, ...run, c11: c11(run.results, usable, d.alpha), h4: h4(run.results, run.meta, d) };
    fs.writeFileSync(path.join(ENG, RESULT), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ c11: out.c11.fired, h4: out.h4.reportable ? out.h4.supported : out.h4.why }));
}
