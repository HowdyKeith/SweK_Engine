// WebGLEngine/brain/openItems2-run.mjs -- (1) the crab model's receding-ball alarm and the Round 5 stripes with an OFF-only grouping layer (polarity "off"), (2) a stripe onset that fades in. Run: node brain/openItems2-run.mjs
import * as C from "./crabMlg1.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const W = 180, H = 60, fps = 30;
const build = (rv, st, wc = 1) => loomingEllipse({ rv, w: W, h: H, fovDeg: 144, step: 1 / fps, startPx: 3, endPx: 37, cx: 45, cy: 30, stripes: st, wc });
const run = (s, frames, p) => { const net = C.createNetwork({ W, H, params: p }); let sp = 0, a = null; frames.forEach((f, k) => { const r = net.step({ w: W, h: H, data: f.data.map((v) => v * 255) }); if (r.spike[4]) sp++; if (r.alarm[4] && a === null) a = k; }); return { a, sp, size: a === null ? null : s.width[a] * 2, margin: a === null ? null : -s.t[a] * 1000 }; };
const fmt = (r) => (r.a === null ? "no alarm" : `alarm frame ${r.a}, ${r.size.toFixed(1)} deg, margin ${r.margin.toFixed(0)} ms, ${r.sp} spike frames`);
console.log("== 1. receding and approaching ball (az 90) by polarity");
for (const pol of ["both", "off"]) { const p = { polarity: pol }, a = C.runPanorama(C.approachingBall({ az0: 90 }).frames, { params: p }), r = C.runPanorama(C.approachingBall({ az0: 90, receding: true }).frames, { params: p }); console.log(`${pol}: approach alarm frame ${a.firstAlarm} winner ${a.winner}; receding alarm ${r.firstAlarm}`); }
console.log("\n== 2. Round 5 stimuli by polarity");
for (const pol of ["both", "off"]) for (const rv of [0.2, 0.4]) { const out = {}; for (const st of ["none", "static", "moving"]) { const s = build(rv, st); out[st] = run(s, s.frames, { polarity: pol }); } console.log(`${pol} r/v ${rv}: plain ${fmt(out.none)} | static ${fmt(out.static)} | moving ${fmt(out.moving)}`); }
console.log("\n== 3. moving stripes fading in over the first N frames (blend of the plain and the moving sequence), polarity both and off");
for (const pol of ["both", "off"]) for (const rv of [0.2, 0.4]) for (const N of [30, 60]) { const pl = build(rv, "none"), mv = build(rv, "moving"); const frames = mv.frames.map((f, k) => { const w = Math.min(1, k / N), d = new Float32Array(f.data.length); for (let i = 0; i < d.length; i++) d[i] = pl.frames[k].data[i] * (1 - w) + f.data[i] * w; return { w: W, h: H, data: d }; }); console.log(`${pol} r/v ${rv} fade ${N}: ${fmt(run(mv, frames, { polarity: pol }))}  (plain: ${fmt(run(pl, pl.frames, { polarity: pol }))})`); }
console.log("\n== 4. contrast sweep for the margins, polarity off, moving vs plain (r/v 0.4)");
for (const wc of [1, 0.6, 0.4, 0.2]) { const pl = build(0.4, "none", wc), mv = build(0.4, "moving", wc); console.log(`wc ${wc}: plain ${fmt(run(pl, pl.frames, { polarity: "off" }))} | moving ${fmt(run(mv, mv.frames, { polarity: "off" }))}`); }
