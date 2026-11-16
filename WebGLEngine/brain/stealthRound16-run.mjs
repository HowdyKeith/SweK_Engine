// WebGLEngine/brain/stealthRound16-run.mjs -- Round 16 runner (registered BEFORE the run). One setting per call:  node brain/stealthRound16-run.mjs <U|global|local> <g>   -> a JSON line on stdout.
// Aggregate with: node brain/stealthRound16-agg.mjs
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const scope = process.argv[2], g = Number(process.argv[3]);
const params0 = scope === "U" ? {} : { downGain: g, downScope: scope };
const peak = (frames, p = {}) => Math.max(...M.runStimulus(frames, { params: { ...params0, ...p } }).nAct);
const out = { scope, g, A: {}, B: {} };
for (const rv of [0.05, 0.1]) { const o = {}; for (const [nm, st, hz] of [["none", "none", 4], ["static", "static", 4], ["down", "moving", 4], ["up", "moving", -4]]) o[nm] = peak(loomingEllipse({ rv, stripes: st, stripeHz: hz }).frames); out.A[rv] = o; }
for (const ls of [255, 1]) { const raw = {}; for (const wc of [0.2, 0.4, 0.6, 0.8, 1.0]) for (const st of ["none", "static", "moving"]) raw[`${wc}|${st}`] = peak(loomingEllipse({ rv: 0.1, stripes: st, wc }).frames, { lumScale: ls }); out.B[ls] = raw; }
console.log(JSON.stringify(out));
