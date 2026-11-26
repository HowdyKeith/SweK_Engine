// WebGLEngine/brain/crabOrder.mjs -- Round 29 worker (registered BEFORE the run): the contrast ordering, crab network at 720 x 240, 14 degree start, azimuth 135, r/v 0.5. node brain/crabOrder.mjs <g> <contrast> -> a JSON line.
import * as C from "./crabMlg1.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const S = 4, W = 180 * S, H = 60 * S, fps = 30, [g, wc] = [Number(process.argv[2]), Number(process.argv[3])], P = { driftGain: g, driftScope: "segment" }, seg = 6;
const mk = (o) => loomingEllipse({ rv: 0.5, w: W, h: H, fovDeg: 144, step: 1 / fps, startPx: 7 * S, endPx: 37 * S, cx: 135 * S / 2, cy: H / 2, wc, ...o });
const run = (o) => { const s = mk(o), net = C.createNetwork({ W, H, params: P }); let a = null; s.frames.forEach((f, k) => { const r = net.step({ w: W, h: H, data: f.data.map((v) => v * 255) }); if (r.alarm[seg] && a === null) a = k; }); return a === null ? null : s.width[a] * 2 / S; };
console.log(JSON.stringify({ g, wc, none: run({ plain: "light" }), static: run({ stripes: "static" }), moving: run({ stripes: "moving" }) }));
