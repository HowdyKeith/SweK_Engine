// WebGLEngine/brain/gainRun2.mjs -- Rounds 19 and 20 worker (registered BEFORE the run): the contrast-normalised gain. node brain/gainRun2.mjs <lumScale> <contrast> <none|static|down|up> <g1,g2,...> -> a JSON line { cells: { g: spikes }, meanDhat, peak }.
import * as M from "./flyEmdLplc2Gf.mjs";
import * as G from "./gfGain.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const [ls, wc, k, gs] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], process.argv[5].split(",").map(Number)], N = 1000, widths = Array.from({ length: N }, (_, i) => 6 * Math.pow(105 / 6, i / (N - 1)));
const st = { none: ["none", 4], static: ["static", 4], down: ["moving", 4], up: ["moving", -4] }[k];
const frames = loomingEllipse({ widths, stripes: st[0], stripeHz: st[1], wc }).frames, base = G.runGained(frames, { g: 0, tauD: 0, normalize: "contrast", params: { lumScale: ls } }), cells = {};
for (const g of gs) cells[g] = M.lifRun(G.gainedCurrent(base.nAct, base.Dsmooth, g, { lumScale: ls }), { lumScale: ls }).spikes.length;
const pos = base.D.filter((v) => v > 0);
console.log(JSON.stringify({ ls, wc, k, peak: Math.max(...base.nAct), meanDhat: pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 0, nPos: pos.length, cells }));
