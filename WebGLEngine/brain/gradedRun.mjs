// WebGLEngine/brain/gradedRun.mjs -- Round 17 worker (registered BEFORE the run). node brain/gradedRun.mjs <global|local> <lumScale> <g> <contrast> <none|static|down|up>  -> a JSON line { spikes, peak }.
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const [scope, ls, g, wc, k] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5]), process.argv[6]], N = 1000, widths = Array.from({ length: N }, (_, i) => 6 * Math.pow(105 / 6, i / (N - 1)));
const st = { none: ["none", 4], static: ["static", 4], down: ["moving", 4], up: ["moving", -4] }[k];
const r = M.runStimulus(loomingEllipse({ widths, stripes: st[0], stripeHz: st[1], wc }).frames, { params: { lumScale: ls, downGain: g, downScope: scope } });
console.log(JSON.stringify({ scope, ls, g, wc, k, spikes: r.spikes.length, peak: Math.max(...r.nAct) }));
