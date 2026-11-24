// WebGLEngine/brain/stealthRound3-run.mjs -- Round 3 runner (predictions registered in STEALTH_ROUNDS_WIP.md BEFORE this was run). Run: node brain/stealthRound3-run.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const retino = JSON.parse(fs.readFileSync(path.join(HERE, "..", "vendor", "male-cns", "giant-fiber-visual-retinotopy.json"), "utf8"));
const lat = M.latticeUnits(retino).units;
const dets = { A: { params: {} }, B: { params: { integration: "additive" } }, C: { params: { surroundKappa: 1 } }, D: { params: {}, units: lat } };
const out = {};
for (const rv of [0.05, 0.1]) for (const st of ["none", "static", "moving"]) {
    const s = loomingEllipse({ rv, stripes: st });
    for (const [name, d] of Object.entries(dets)) {
        let nAct, spikes, nEff;
        if (d.units) { const r = M.runLattice(s.frames, d.units, { params: d.params }); nAct = r.nEff; spikes = r.spikes; } else { const r = M.runStimulus(s.frames, { params: d.params }); nAct = r.nAct; spikes = r.spikes; }
        const peak = Math.max(...nAct);
        let th = null; if (spikes.length) th = s.theta[Math.min(s.t.length - 1, Math.floor(spikes[0] / 0.01 + 1e-9))];
        out[`${name}|${rv}|${st}`] = { peak, spikes: spikes.length, theta: th };
    }
}
console.log("det  r/v   stripes   peakN   spikes  theta@first");
for (const [k, v] of Object.entries(out)) { const [n, rv, st] = k.split("|"); console.log(`${n}    ${rv}  ${st.padEnd(7)}  ${v.peak.toFixed(0).padStart(6)}  ${String(v.spikes).padStart(6)}  ${v.theta === null ? "-" : v.theta.toFixed(1)}`); }
console.log("\nmoving-stripe ratio (peak N moving / plain), static ratio:");
for (const n of Object.keys(dets)) for (const rv of [0.05, 0.1]) { const p = out[`${n}|${rv}|none`].peak, m = out[`${n}|${rv}|moving`].peak, t = out[`${n}|${rv}|static`].peak; console.log(`${n} r/v ${rv}: moving ${(m / p).toFixed(3)}  static ${(t / p).toFixed(3)}  (plain ${p.toFixed(0)})`); }
