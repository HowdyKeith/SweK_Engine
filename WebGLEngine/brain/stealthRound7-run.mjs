// WebGLEngine/brain/stealthRound7-run.mjs -- Round 7 runner (registered BEFORE the run in STEALTH_ROUNDS_WIP.md). Run: node brain/stealthRound7-run.mjs
import * as C from "./crabMlg1.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const W = 180, H = 60, fps = 30, SEG = 12;
const build = (rv, st, hz, receding = false) => loomingEllipse({ rv, w: W, h: H, fovDeg: 144, step: 1 / fps, startPx: 3, endPx: 37, cx: 135, cy: 30, stripes: st, stripeHz: hz, receding });
const run = (s, pol) => { const net = C.createNetwork({ W, H, params: { polarity: pol } }); let sp = 0, a = null, wi = null; s.frames.forEach((f, k) => { const r = net.step({ w: W, h: H, data: f.data.map((v) => v * 255) }); if (r.spike[SEG]) sp++; if (r.alarm[SEG] && a === null) a = k; if (r.winner !== null && wi === null) wi = r.winner; }); return { a, sp, size: a === null ? null : s.width[a] * 2, wi }; };
const fmt = (r) => (r.a === null ? "no alarm" : `${r.size.toFixed(1)} deg (frame ${r.a}), ${r.sp} spikes`);
for (const rv of [0.1, 0.3, 0.6]) {
    const pl = run(build(rv, "none", 4), "off"), st = run(build(rv, "static", 4), "off"), m4 = run(build(rv, "moving", 4), "off"), m2 = run(build(rv, "moving", 2.2), "off");
    const rc = run(build(rv, "none", 4, true), "off"), rcb = run(build(rv, "none", 4, true), "both");
    const ratio = (x) => (x.a === null || pl.a === null ? "n/a" : (x.size / pl.size).toFixed(2));
    console.log(`r/v ${rv}: plain ${fmt(pl)} (winner ${pl.wi}) | static ${fmt(st)} ratio ${ratio(st)} | moving 4 Hz ${fmt(m4)} ratio ${ratio(m4)} | moving 2.2 Hz ${fmt(m2)} ratio ${ratio(m2)} | receding off ${rc.a === null ? "no alarm" : "ALARM"}, both ${rcb.a === null ? "no alarm" : "ALARM"}`);
}
