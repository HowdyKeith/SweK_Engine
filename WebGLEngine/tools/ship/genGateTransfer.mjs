#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateTransfer.mjs -- v4696: leave one scene out, two feature sets, identical folds.
//
// *** EVERYTHING EXCEPT THE FEATURE SET IS HELD FIXED. *** Same harvested frames, same folds, same trainer,
// same seed, same width, same step budget. render/learned-transfer-preregistration.md clause (b) is a
// comparison between two feature sets, and it is only that if nothing else moves between the two runs.
//
// *** THE HARVEST IS ONE DRIVE PER SCENE, NOT ONE PER SET. *** fsr.html's hook emits both vectors for the
// same blocks, because the page's slab position advances per frame and two drives of the same scene are not
// the same data.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { N_FEATURES, N_FEATURES_V2, HIDDEN, fitScaler, applyScaler, forward, auc, aucP } from "../../render/genGate.mjs";
import { harvest } from "./genGateTrain.mjs";
import { MLPTrainer } from "../../brain/learn.js";
import { seededRng } from "./foldStats.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SCENES = Object.freeze(["smooth", "zone", "checker"]);
export const CACHE = "tools/ship/genGate-folds.json";

/** Pull the rows for one feature set out of a harvested frame list. */
export function rowsOf(frames, which) {
    const NF = which === "v2" ? N_FEATURES_V2 : N_FEATURES;
    const key = which === "v2" ? "x2" : "x";
    const X = [], Y = [];
    for (const f of frames) for (let b = 0; b < f.y.length; b++) {
        const r = f[key].slice(b * NF, (b + 1) * NF);
        // A declined block can carry a non-finite ratio; drop it from BOTH sets alike. v4698: until then this
        // tested only the set being built, so a block non-finite in v2 alone stayed in v1 -- the comment's claim
        // with the code's opposite. Inert on the committed cache, which holds no non-finite value in either set.
        const r1 = f.x.slice(b * N_FEATURES, (b + 1) * N_FEATURES), r2 = f.x2.slice(b * N_FEATURES_V2, (b + 1) * N_FEATURES_V2);
        if (!r1.every(Number.isFinite) || !r2.every(Number.isFinite)) continue;
        X.push(...r); Y.push(f.y[b]);
    }
    return { x: Float32Array.from(X), y: Uint8Array.from(Y), n: Y.length, nf: NF };
}

function fit(train, nf, seed) {
    let sd = seed >>> 0;
    const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const scaler = fitScaler(train.x.length === 0 ? new Float32Array(nf) : train.x);
    const Z = applyScaler(train.x, scaler);
    const L1 = { nIn: nf, nOut: HIDDEN, act: "relu",
                 W: Float32Array.from({ length: HIDDEN * nf }, () => (rnd() * 2 - 1) / Math.sqrt(nf)),
                 b: new Float32Array(HIDDEN) };
    const L2 = { nIn: HIDDEN, nOut: 1, act: "sigmoid",
                 W: Float32Array.from({ length: HIDDEN }, () => (rnd() * 2 - 1) / Math.sqrt(HIDDEN)),
                 b: new Float32Array(1) };
    // v4698: the sampler is seeded too. At v4696 it was not, so "same seed" held the init fixed and nothing after.
    const t = new MLPTrainer([L1, L2], { lr: 0.05, batch: 32, minBuffer: 64, bufferCap: train.n + 8, rng: seededRng(seed) });
    for (let i = 0; i < train.n; i++) t.buffer.push({ x: Z.subarray(i * nf, (i + 1) * nf), r: train.y[i], w: 1 });
    for (let s = 0; s < 4000; s++) t.step();
    return { layers: [L1, L2], scaler };
}

/**
 * One leave-one-scene-out pass for one feature set. `shuffle` is control C8: the labels are permuted inside
 * the TRAINING folds only, so a set that still scores off 0.5 is scoring on something the harness supplies.
 */
export function leaveOneOut(byScene, which, { seed = 7, shuffle = false } = {}) {
    const perFold = [], pooled = { p: [], y: [] };
    for (const held of SCENES) {
        const trainFrames = SCENES.filter((s) => s !== held).flatMap((s) => byScene[s]);
        const train = rowsOf(trainFrames, which), test = rowsOf(byScene[held], which);
        if (shuffle) {
            let sd = (seed * 31 + 7) >>> 0;
            const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
            for (let i = train.n - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = train.y[i]; train.y[i] = train.y[j]; train.y[j] = t; }
        }
        const m = fit(train, train.nf, seed);
        const p = forward(m.layers, applyScaler(test.x, m.scaler), test.n);
        const a = auc(p, test.y);
        perFold.push({ held, n: test.n, base: test.y.reduce((x, v) => x + v, 0) / test.n, auc: a.auc });
        for (let i = 0; i < test.n; i++) { pooled.p.push(p[i]); pooled.y.push(test.y[i]); }
    }
    const pa = auc(Float32Array.from(pooled.p), Uint8Array.from(pooled.y));
    return { which, shuffle, perFold, pooled: { n: pa.pos + pa.neg, auc: pa.auc, test: aucP(pa.auc, pa.pos, pa.neg) } };
}

export async function harvestAll({ upto = 40, speed = "2" } = {}) {
    const byScene = {};
    for (const s of SCENES) byScene[s] = await harvest({ scenes: [s], upto, speed });
    return byScene;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const byScene = await harvestAll();
    fs.writeFileSync(path.join(ENG, CACHE), JSON.stringify(byScene));
    const out = {
        v2: leaveOneOut(byScene, "v2"),
        v1: leaveOneOut(byScene, "v1"),
        shuffled: leaveOneOut(byScene, "v2", { shuffle: true }),
    };
    fs.writeFileSync(path.join(ENG, "tools/ship/genGate-transfer.json"), JSON.stringify(out, null, 1) + "\n");
    for (const k of ["v2", "v1", "shuffled"])
        console.log(`[transfer] ${k.padEnd(9)} pooled AUC ${out[k].pooled.auc.toFixed(4)} ` +
            `(n=${out[k].pooled.n}, p=${out[k].pooled.test.p === null ? "n/a" : out[k].pooled.test.p.toExponential(2)})  ` +
            `folds ${out[k].perFold.map((f) => `${f.held}:${f.auc === null ? "n/a" : f.auc.toFixed(3)}`).join(" ")}`);
}
