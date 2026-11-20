// WebGLEngine/brain/stealthRound16-exp.mjs -- Round 16 part (c): the divisive gain on the 10 s exponential stimulus. Run: node brain/stealthRound16-exp.mjs <global|local> <g> <none|static|down|up>  -> a JSON line (peak count).
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const [scope, g, k] = [process.argv[2], Number(process.argv[3]), process.argv[4]], N = 1000, widths = Array.from({ length: N }, (_, i) => 6 * Math.pow(105 / 6, i / (N - 1)));
const st = { none: ["none", 4], static: ["static", 4], down: ["moving", 4], up: ["moving", -4] }[k];
const frames = loomingEllipse({ widths, stripes: st[0], stripeHz: st[1] }).frames;
console.log(JSON.stringify({ scope, g, k, peak: Math.max(...M.runStimulus(frames, { params: { downGain: g, downScope: scope } }).nAct) }));
