// WebGLEngine/brain/gainRun.mjs -- Round 18 worker (registered BEFORE the run). node brain/gainRun.mjs <tauD> <lumScale> <contrast> <none|static|down|up> <g1,g2,...> -> a JSON line { cells: { g: spikes } }.
// One array pass per stimulus; the gained Giant Fiber is re-run for every g from the same N and D series (the gain does not touch N).
import * as M from "./flyEmdLplc2Gf.mjs";
import * as G from "./gfGain.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const [tauD, ls, wc, k, gs] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4]), process.argv[5], process.argv[6].split(",").map(Number)], N = 1000, widths = Array.from({ length: N }, (_, i) => 6 * Math.pow(105 / 6, i / (N - 1)));
const st = { none: ["none", 4], static: ["static", 4], down: ["moving", 4], up: ["moving", -4] }[k];
const frames = loomingEllipse({ widths, stripes: st[0], stripeHz: st[1], wc }).frames, base = G.runGained(frames, { g: 0, tauD, params: { lumScale: ls } }), cells = {};
for (const g of gs) cells[g] = lifSpikes(g);
function lifSpikes(g) { const cur = G.gainedCurrent(base.nAct, base.Dsmooth, g, { lumScale: ls }); return M.lifRun(cur, { lumScale: ls }).spikes.length; }
console.log(JSON.stringify({ tauD, ls, wc, k, peak: Math.max(...base.nAct), meanD: base.D.reduce((a, b) => a + b, 0) / base.D.length, maxDs: Math.max(...base.Dsmooth), cells }));
