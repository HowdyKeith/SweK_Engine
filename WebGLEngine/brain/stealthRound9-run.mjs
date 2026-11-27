// WebGLEngine/brain/stealthRound9-run.mjs -- Round 9 runner (registered BEFORE the run). Run: node brain/stealthRound9-run.mjs
import * as C from "./crabMlg1.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const W = 180, H = 60, fps = 30, N = 300, SEG = 4;
const widths = Array.from({ length: N }, (_, k) => 7 * Math.pow(37 / 7, k / (N - 1)));
const build = (st, receding = false) => { const s = loomingEllipse({ widths: receding ? [...widths].reverse() : widths, w: W, h: H, fovDeg: 144, step: 1 / fps, cx: 45, cy: 30, stripes: st }); return s; };
const run = (s, pol) => { const net = C.createNetwork({ W, H, params: { polarity: pol } }); let sp = 0, a = null; s.frames.forEach((f, k) => { const r = net.step({ w: W, h: H, data: f.data.map((v) => v * 255) }); if (r.spike[SEG]) sp++; if (r.alarm[SEG] && a === null) a = k; }); return { a, sp, tAlarm: a === null ? null : a / fps }; };
const fmt = (r) => (r.a === null ? "no alarm" : `alarm at ${r.tAlarm.toFixed(2)} s (frame ${r.a}), ${r.sp} spike frames`);
for (const pol of ["both", "off"]) { const o = {}; for (const st of ["none", "static", "moving"]) o[st] = run(build(st), pol); const rc = run(build("none", true), pol); const q = (x) => (x.a === null || o.none.a === null ? "n/a" : (x.tAlarm / o.none.tAlarm).toFixed(2)); console.log(`${pol}: plain ${fmt(o.none)} | static ${fmt(o.static)} (time ratio ${q(o.static)}) | moving ${fmt(o.moving)} (time ratio ${q(o.moving)}) | contracting plain ${rc.a === null ? "no alarm" : "ALARM at " + rc.tAlarm.toFixed(2) + " s"}`); }
