#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateCalibrate.mjs -- v4693: fit on TRAIN, choose the threshold on VALIDATION.
//
// *** THE HELD-OUT SCENE IS NOT REACHABLE FROM THIS FILE. *** It harvests TRAIN_ONLY and VALIDATE_ON, and
// the threshold comes out of render/genGate.mjs's rateMatch(), which takes SCORES AND A TARGET RATE and has
// no argument a checker row could arrive through. That is control C5, and it is a property of the call
// signatures rather than a promise -- render/learned-calibration-preregistration.md section 6.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { N_FEATURES, applyScaler, forward, rateMatch, auc } from "../../render/genGate.mjs";
import { trainThreeWay, TRAIN_ONLY, VALIDATE_ON, HELD_OUT, WEIGHTS_V2 } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Flatten harvested frames into (rows, labels) -- the same unpacking train() does, kept in one place. */
export function flatten(rows) {
    const X = [], Y = [];
    for (const row of rows) for (let b = 0; b < row.y.length; b++) {
        X.push(...row.x.slice(b * N_FEATURES, (b + 1) * N_FEATURES)); Y.push(row.y[b]);
    }
    return { x: Float32Array.from(X), y: Uint8Array.from(Y), n: Y.length };
}

export async function calibrate(opts = {}) {
    const { model, trainRows, valRows } = await trainThreeWay(opts);
    const V = flatten(valRows);
    const Z = applyScaler(V.x, model.scaler);
    const p = forward(model.layers, Z, V.n);
    const base = V.y.reduce((a, v) => a + v, 0) / V.n;
    // *** THE RULE, AS FIXED IN SECTION 4: the smallest tau whose keep-rate meets VALIDATION's base rate. ***
    const rm = rateMatch(p, base);
    const A = auc(p, V.y);
    // S5, declared as a secondary and computed here so it can be REPORTED and never promoted.
    let bestTau = 0.5, bestAcc = -1;
    for (let t = 0.01; t < 1; t += 0.01) {
        let hit = 0; for (let i = 0; i < V.n; i++) hit += ((p[i] >= t) === (V.y[i] === 1)) ? 1 : 0;
        if (hit / V.n > bestAcc) { bestAcc = hit / V.n; bestTau = t; }
    }
    return { model, trainRows, valRows, val: { n: V.n, base, auc: A, rateMatch: rm, bestTau, bestAcc } };
}

export function writeV2(out, c) {
    const j = {
        note: "The learned per-block gate, v4693. Weights and scaler fitted on TRAIN only; the THRESHOLD is " +
              "chosen on VALIDATION by rate matching, the parameter-free rule fixed in " +
              "render/learned-calibration-preregistration.md section 4 BEFORE any of this ran. The held-out " +
              "scene named below was not harvested by the tool that produced this file.",
        trainedOn: [...TRAIN_ONLY], validatedOn: VALIDATE_ON, heldOut: HELD_OUT,
        features: N_FEATURES, hidden: c.model.layers[0].nOut,
        rows: c.model.n, baseRate: c.model.base, steps: c.model.steps,
        tau: c.val.rateMatch.tau, tauRule: "rateMatch to the validation base rate",
        validation: { n: c.val.n, base: c.val.base, keptRate: c.val.rateMatch.rate,
                      auc: c.val.auc.auc, bestTau: c.val.bestTau, bestAcc: c.val.bestAcc },
        scaler: { mean: Array.from(c.model.scaler.mean), sd: Array.from(c.model.scaler.sd) },
        layers: c.model.layers.map((L) => ({ nIn: L.nIn, nOut: L.nOut, act: L.act, W: Array.from(L.W), b: Array.from(L.b) })),
    };
    fs.writeFileSync(path.join(ENG, out), JSON.stringify(j, null, 1) + "\n");
    return j;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const c = await calibrate();
    const j = writeV2(WEIGHTS_V2, c);
    console.log(`[cal] train ${c.model.n} blocks (base ${c.model.base.toFixed(4)}), ` +
        `validation ${c.val.n} blocks (base ${c.val.base.toFixed(4)}), ` +
        `AUC ${c.val.auc.auc === null ? "n/a" : c.val.auc.auc.toFixed(4)}, ` +
        `tau ${j.tau.toFixed(4)} keeping ${(c.val.rateMatch.rate * 100).toFixed(1)}% ` +
        `[S5: bestTau ${c.val.bestTau.toFixed(2)} acc ${c.val.bestAcc.toFixed(4)}] -> ${WEIGHTS_V2}`);
}
