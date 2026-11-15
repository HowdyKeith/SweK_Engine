// WebGLEngine/brain/stealthRound6-run.mjs -- Round 6 runner (registered in STEALTH_ROUNDS_WIP.md BEFORE this was run). Run: node brain/stealthRound6-run.mjs
import * as M from "./flyEmdLplc2Gf.mjs";
import * as C from "./crabMlg1.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const Tmin = { fly: 100, crab: 300 }, out = {};
const flyMargin = (wc, st) => { const s = loomingEllipse({ rv: 0.1, wc, stripes: st }), r = M.runStimulus(s.frames, {}); if (!r.spikes.length) return null; const i = Math.min(s.t.length - 1, Math.floor(r.spikes[0] / 0.01 + 1e-9)); return -s.t[i] * 1000; };
const W = 180, H = 60, fps = 30;
const crabMargin = (wc, st) => { const s = loomingEllipse({ rv: 0.4, w: W, h: H, fovDeg: 144, step: 1 / fps, startPx: 3, endPx: 37, cx: 45, cy: 30, wc, stripes: st }), net = C.createNetwork({ W, H }); let a = null; s.frames.forEach((f, k) => { const r = net.step({ w: W, h: H, data: f.data.map((v) => v * 255) }); if (r.alarm[4] && a === null) a = k; }); return a === null ? null : -s.t[a] * 1000; };
console.log("detector  contrast  stripes  margin(ms)");
for (const wc of [1, 0.6, 0.4, 0.2]) for (const st of ["none", "moving"]) {
    const f = flyMargin(wc, st), c = crabMargin(wc, st); out[`fly|${wc}|${st}`] = f; out[`crab|${wc}|${st}`] = c;
    console.log(`fly       ${wc}       ${st.padEnd(6)}  ${f === null ? "MISSED" : f.toFixed(0)}`); console.log(`crab      ${wc}       ${st.padEnd(6)}  ${c === null ? "MISSED" : c.toFixed(0)}`);
}
console.log("\nverdict by detector (T_min fly 100 ms, crab 300 ms, ASSUMED):");
for (const d of ["fly", "crab"]) {
    let cam = false, bet = false;
    for (const wc of [1, 0.6, 0.4, 0.2]) {
        const p = out[`${d}|${wc}|none`], m = out[`${d}|${wc}|moving`];
        if (p !== null && p >= Tmin[d] && (m === null || m < Tmin[d] || m <= 0.8 * p)) cam = true;
        if ((m !== null && p === null) || (m !== null && p !== null && m >= 1.2 * p)) bet = true;
    }
    console.log(`${d}: camouflaged ${cam}, betrays ${bet} -> ${bet ? "BETRAYS" : cam ? "CAMOUFLAGED" : "NEUTRAL"}`);
}
