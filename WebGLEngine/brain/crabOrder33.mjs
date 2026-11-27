// WebGLEngine/brain/crabOrder33.mjs -- Round 33's worker (registered BEFORE the run, brain/STEALTH_ROUNDS_WIP.md): crabOrder30.mjs with the texture gain h as an argument, nothing else changed.
//   node brain/crabOrder33.mjs <g> <h> <contrast> <azimuth in degrees> <r/v in s> -> a JSON line.
import * as C from "./crabMlg1.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const S = 4, W = 180 * S, H = 60 * S, fps = 30, [g, hT, wc, AZ, rv] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5]), Number(process.argv[6])], P = { driftGain: g, driftScope: "segment", textureGain: hT }, seg = Math.round(AZ / 22.5);
const mk = (o) => loomingEllipse({ rv, w: W, h: H, fovDeg: 144, step: 1 / fps, startPx: 7 * S, endPx: 37 * S, cx: AZ * S / 2, cy: H / 2, wc, ...o });
const run = (o) => { const s = mk(o), net = C.createNetwork({ W, H, params: P }); let a = null; s.frames.forEach((f, k) => { const r = net.step({ w: W, h: H, data: f.data.map((v) => v * 255) }); if (r.alarm[seg] && a === null) a = k; }); return a === null ? null : s.width[a] * 2 / S; };
console.log(JSON.stringify({ g, h: hT, wc, az: AZ, rv, none: run({ plain: "light" }), static: run({ stripes: "static" }), moving: run({ stripes: "moving" }) }));
