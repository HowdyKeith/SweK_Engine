// WebGLEngine/brain/polarityAuditA.mjs -- Round 21 (A), registered before the run: the Round 3 table with the plain ellipse LIGHT. node brain/polarityAuditA.mjs <both|off|on>
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const pol = process.argv[2], out = {};
for (const rv of [0.05, 0.1]) { const o = {}; for (const [nm, st, hz, plain] of [["plainLight", "none", 4, "light"], ["plainDark", "none", 4, "dark"], ["static", "static", 4, "dark"], ["down", "moving", 4, "dark"], ["up", "moving", -4, "dark"]]) o[nm] = Math.max(...M.runStimulus(loomingEllipse({ rv, stripes: st, stripeHz: hz, plain }).frames, { params: { polarity: pol } }).nAct); out[rv] = o; }
console.log(JSON.stringify({ pol, out }));
