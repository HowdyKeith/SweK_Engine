// WebGLEngine/brain/gradedPilot-run.mjs -- PILOT for the graded-form round (run BEFORE its registration, said so in the note): the ungated array on the slow exponential stimulus at contrast 1, three readouts, two luminance scales. node brain/gradedPilot-run.mjs <lumScale> <none|static|down|up>
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const ls = Number(process.argv[2]), k = process.argv[3], N = 1000, widths = Array.from({ length: N }, (_, i) => 6 * Math.pow(105 / 6, i / (N - 1)));
const st = { none: ["none", 4], static: ["static", 4], down: ["moving", 4], up: ["moving", -4] }[k];
const r = M.runStimulus(loomingEllipse({ widths, stripes: st[0], stripeHz: st[1] }).frames, { params: { lumScale: ls } });
console.log(JSON.stringify({ ls, k, peak: Math.max(...r.nAct), auc: r.nAct.reduce((a, b) => a + b, 0), spikes: r.spikes.length, firstSpike: r.spikes.length ? r.spikes[0] : null }));
