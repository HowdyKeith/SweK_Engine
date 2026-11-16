// Round 16 SCALE SWEEP (EXPLORATORY, run AFTER the registered result; the registered g values 0.1 to 100 were too small for the model's scale). Run: node brain/stealthRound16-scale.mjs <global|local> <g>
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const scope = process.argv[2], g = Number(process.argv[3]), o = {};
for (const rv of [0.05, 0.1]) { const pk = {}; for (const [nm, st, hz] of [["none", "none", 4], ["static", "static", 4], ["down", "moving", 4], ["up", "moving", -4]]) pk[nm] = Math.max(...M.runStimulus(loomingEllipse({ rv, stripes: st, stripeHz: hz }).frames, { params: { downGain: g, downScope: scope } }).nAct); o[rv] = pk; }
console.log(JSON.stringify({ scope, g, o }));
