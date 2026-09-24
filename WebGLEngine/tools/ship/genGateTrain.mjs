#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateTrain.mjs -- harvest the learned gate's training set and train it.
//
// *** THE TRAINING SET COMES OFF fsr.html ITSELF, NOT OFF A COPY OF ITS SCENE MACHINERY. *** The zone plate,
// the smooth field, the checker, the perspective slab and the dolly are all inline in that page. Rebuilding
// them here would make a second implementation that can drift from the one every figure in this arc was
// measured on, and the drift would be invisible. So the page carries a harvest hook that is OFF unless
// something sets `window.__gateHarvest`, and this tool sets it and reads per-block rows back out.
//
// *** IT TRAINS ON `smooth` AND `zone` ONLY. *** render/learned-preregistration.md section 5 fixes the split
// before any of this ran: the checker is held out, and it is held out in the HARD direction -- generation
// LOSES on both training scenes and WINS on the held-out one, so a network that has merely learned to decline
// will look good here and fail there. This tool must never be pointed at the checker, and the gate that grades
// the weights asserts that no training row came from it.
//
// Writes render/genGate-weights.json: layers, the scaler fitted on TRAINING ROWS ONLY, and the provenance.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { N_FEATURES, HIDDEN, fitScaler, applyScaler } from "../../render/genGate.mjs";
import { MLPTrainer } from "../../brain/learn.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TRAIN_SCENES = Object.freeze(["smooth", "zone"]);
export const HELD_OUT = "checker";
export const WEIGHTS = "render/genGate-weights.json";
const UPTO = 40;            // frames driven per scene; the pre-registered measurement window is 6-38
const SPEED = "2";          // slabspeed x2, the pre-registered cell

/** Drive fsr.html over the training scenes with the harvest hook on. */
export async function harvest({ scenes = TRAIN_SCENES, upto = UPTO, speed = SPEED } = {}) {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 3600000, args: { scenes, upto, speed }, script: `async (a) => {
        const rows = [];
        for (const scene of a.scenes) {
            const ifr = document.createElement("iframe");
            ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
            document.body.appendChild(ifr);
            await new Promise((res) => { ifr.onload = res; });
            const d = ifr.contentDocument, $ = (id) => d.getElementById(id);
            const until = async (fn, ms) => { const t0 = Date.now();
                while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r2 => setTimeout(r2, 40)); } return false; };
            const fno = () => { const m = /frame (\\d+)/.exec((($("metric") || {}).textContent || "")); return m ? Number(m[1]) : -1; };
            await until(() => fno() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 180000);
            const want = [["scene", scene], ["shading", "off"], ["reactive", "off"], ["camera", "objects"],
                          ["slabspeed", a.speed], ["genfield", "block"], ["gensource", "presented"],
                          ["genengine", "cpu"], ["genframe", "on"]];
            let last = null;
            for (const [id, v] of want) { const e = $(id); if (e) { e.value = v; last = e; } }
            last.dispatchEvent(new Event("change"));
            await until(() => fno() === 0, 180000);
            // THE HOOK IS SET ON THE IFRAME'S OWN window, which is the one the page's tick() reads.
            ifr.contentWindow.__gateHarvest = [];
            $("run").click();
            await until(() => fno() >= a.upto, 3000000);
            $("run").click();
            for (const row of ifr.contentWindow.__gateHarvest) rows.push(row);
            ifr.remove();
        }
        return { rows };
    }` });
    if (!r.ok) throw new Error(`genGateTrain.harvest: the page did not run -- ${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
    return r.result.rows;
}

/**
 * Train the pre-registered shape: [N_FEATURES -> HIDDEN, relu] then [HIDDEN -> 1, sigmoid].
 *
 * *** brain/learn.js's MLPTrainer IS A BANDIT HEAD AND ITS `step()` SAMPLES ITS REPLAY BUFFER AT RANDOM. ***
 * That is what it was built for and it is not changed here. What it means for a supervised split is that the
 * pass count is a budget rather than an epoch count, and the seed below is what makes a run reproducible.
 */
export function train(rows, { steps = 4000, lr = 0.05, seed = 7 } = {}) {
    let sd = seed >>> 0;
    const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const X = [], Y = [];
    for (const row of rows) {
        const nb = row.y.length;
        for (let b = 0; b < nb; b++) { X.push(row.x.slice(b * N_FEATURES, (b + 1) * N_FEATURES)); Y.push(row.y[b]); }
    }
    if (!X.length) throw new Error("genGateTrain.train: no rows harvested");
    const flat = Float32Array.from(X.flat());
    const scaler = fitScaler(flat);
    const Z = applyScaler(flat, scaler);
    // Xavier-ish init off the same seed, so a re-run reproduces the weights rather than merely the shape.
    const L1 = { nIn: N_FEATURES, nOut: HIDDEN, act: "relu",
                 W: Float32Array.from({ length: HIDDEN * N_FEATURES }, () => (rnd() * 2 - 1) / Math.sqrt(N_FEATURES)),
                 b: new Float32Array(HIDDEN) };
    const L2 = { nIn: HIDDEN, nOut: 1, act: "sigmoid",
                 W: Float32Array.from({ length: HIDDEN }, () => (rnd() * 2 - 1) / Math.sqrt(HIDDEN)),
                 b: new Float32Array(1) };
    const t = new MLPTrainer([L1, L2], { lr, batch: 32, minBuffer: 64, bufferCap: X.length + 8 });
    for (let i = 0; i < X.length; i++)
        t.buffer.push({ x: Z.subarray(i * N_FEATURES, (i + 1) * N_FEATURES), r: Y[i], w: 1 });
    let did = 0;
    for (let s = 0; s < steps; s++) if (t.step()) did++;
    return { layers: [L1, L2], scaler, n: X.length, base: Y.reduce((a, b) => a + b, 0) / Y.length, steps: did };
}

export function writeWeights(out, { rows, model, scenes }) {
    const j = {
        note: "The learned per-block gate. Trained by tools/ship/genGateTrain.mjs on the scenes named in " +
              "`trainedOn` ONLY; render/learned-preregistration.md section 5 holds out " + HELD_OUT + ". The " +
              "scaler is fitted on TRAINING ROWS ALONE -- fitting it on the held-out rows too is the quietest " +
              "way to make a held-out measurement report an in-distribution one.",
        trainedOn: scenes, heldOut: HELD_OUT, features: N_FEATURES, hidden: HIDDEN,
        rows: model.n, baseRate: model.base, steps: model.steps, frames: rows.length,
        scaler: { mean: Array.from(model.scaler.mean), sd: Array.from(model.scaler.sd) },
        layers: model.layers.map((L) => ({ nIn: L.nIn, nOut: L.nOut, act: L.act, W: Array.from(L.W), b: Array.from(L.b) })),
    };
    fs.writeFileSync(path.join(ENG, out), JSON.stringify(j, null, 1) + "\n");
    return j;
}

// pathToFileURL, not a template literal: tools/ship/winPathGuard-selfcheck.mjs names `file://` + a path
// as a Windows-fragile idiom, and it caught this one the round it landed.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rows = await harvest();
    const bad = rows.filter((r) => !TRAIN_SCENES.includes(r.scene));
    if (bad.length) throw new Error(`genGateTrain: ${bad.length} harvested rows are not from ${TRAIN_SCENES.join("/")} -- the split is the measurement`);
    const model = train(rows);
    const j = writeWeights(WEIGHTS, { rows, model, scenes: TRAIN_SCENES });
    console.log(`[gate] ${rows.length} frames, ${j.rows} blocks, base rate ${j.baseRate.toFixed(4)}, ${j.steps} steps -> ${WEIGHTS}`);
}
