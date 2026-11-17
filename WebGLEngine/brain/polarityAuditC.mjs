// WebGLEngine/brain/polarityAuditC.mjs -- Round 21 (C), registered before the run: the slow exponential stimulus with the plain ellipse LIGHT, ungated Giant Fiber spikes and the Round 19 gain (lumScale 255, g 1). node brain/polarityAuditC.mjs <light|dark>
import * as M from "./flyEmdLplc2Gf.mjs";
import * as G from "./gfGain.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const plain = process.argv[2], N = 1000, widths = Array.from({ length: N }, (_, i) => 6 * Math.pow(105 / 6, i / (N - 1)));
const r = G.runGained(loomingEllipse({ widths, stripes: "none", plain }).frames, { g: 0, normalize: "contrast" });
console.log(JSON.stringify({ plain, peak: Math.max(...r.nAct), spikes: r.spikes.length, spikesGain1: M.lifRun(G.gainedCurrent(r.nAct, r.Dsmooth, 1)).spikes.length, maxD: Math.max(...r.D) }));
