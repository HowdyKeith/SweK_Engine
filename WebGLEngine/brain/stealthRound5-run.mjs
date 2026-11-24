// WebGLEngine/brain/stealthRound5-run.mjs -- Round 5 runner (predictions registered in STEALTH_ROUNDS_WIP.md BEFORE this was run). Run: node brain/stealthRound5-run.mjs
import * as C from "./crabMlg1.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const W = 180, H = 60, SEG = 4, fps = 30;
const rows = {};
console.log("r/v   stripes   alarmSeg4  frame  size(deg)  winner  lsl   spikes4  peakF4  anyAlarmSegs");
for (const rv of [0.2, 0.4]) for (const st of ["none", "static", "moving"]) {
    const s = loomingEllipse({ rv, w: W, h: H, fovDeg: 144, step: 1 / fps, startPx: 3, endPx: 37, cx: 45, cy: 30, stripes: st });
    const frames = s.frames.map((f) => ({ w: W, h: H, data: f.data.map((v) => v * 255) }));
    const net = C.createNetwork({ W, H }); let spikes4 = 0, peakF = 0, a4 = null, first = null, wi = null, ls = null; const alarmSegs = new Set();
    frames.forEach((f, k) => { const r = net.step(f); if (r.spike[SEG]) spikes4++; peakF = Math.max(peakF, r.F[SEG]); r.alarm.forEach((v, j) => { if (v) alarmSegs.add(j); }); if (r.alarm[SEG] && a4 === null) a4 = k; if (r.lsl !== null && first === null) { first = k; wi = r.winner; ls = r.lsl; } });
    // the size at the alarm
    const size = a4 === null ? null : s.theta[a4] ? (s.width[a4] * 2) : null;   // width in pixels x 2 = degrees (0.5 px/deg)
    rows[`${rv}|${st}`] = { a4, size, spikes4, peakF, wi, ls, n: frames.length };
    console.log(`${rv}   ${st.padEnd(7)}   ${a4 !== null ? "yes" : "no "}        ${a4 === null ? "-" : a4}    ${size === null ? "-" : size.toFixed(1)}      ${wi === null ? "-" : wi}     ${ls === null ? "-" : ls}    ${spikes4}   ${peakF.toFixed(2)}   [${[...alarmSegs].sort((a, b) => a - b)}]  (${frames.length} frames)`);
}
console.log("\nmoving over plain: spike ratio, size ratio at alarm");
for (const rv of [0.2, 0.4]) { const p = rows[`${rv}|none`], m = rows[`${rv}|moving`], t = rows[`${rv}|static`]; console.log(`r/v ${rv}: spike ratio moving ${(m.spikes4 / Math.max(1, p.spikes4)).toFixed(3)} static ${(t.spikes4 / Math.max(1, p.spikes4)).toFixed(3)}; size ratio moving ${m.size && p.size ? (m.size / p.size).toFixed(3) : "n/a"} static ${t.size && p.size ? (t.size / p.size).toFixed(3) : "n/a"}; peak F plain ${p.peakF.toFixed(2)} moving ${m.peakF.toFixed(2)}`); }
