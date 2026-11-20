// WebGLEngine/brain/stealthRound11-run.mjs -- Round 11 runner (registered BEFORE the run). Run: node brain/stealthRound11-run.mjs
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const res = {};
for (const g of [1, 0.5, 0.25, 0.1, 0.03, 0]) for (const rv of [0.05, 0.1]) for (const st of ["none", "static", "moving"]) { const s = loomingEllipse({ rv, stripes: st }); res[`${g}|${rv}|${st}`] = Math.max(...M.runStimulus(s.frames, { params: { onGain: g } }).nAct); }
console.log("gain  r/v   plain  static  moving | static ratio  moving ratio | plain vs gain 1");
let gstar = null;
for (const g of [1, 0.5, 0.25, 0.1, 0.03, 0]) { const row = []; let both = true; for (const rv of [0.05, 0.1]) { const p = res[`${g}|${rv}|none`], s = res[`${g}|${rv}|static`], m = res[`${g}|${rv}|moving`]; const mr = p ? m / p : NaN, sr = p ? s / p : NaN; if (!(mr <= 0.6)) both = false; row.push(`${String(g).padEnd(5)} ${rv}  ${String(p).padStart(5)} ${String(s).padStart(6)} ${String(m).padStart(6)}  | ${sr.toFixed(3)}  ${mr.toFixed(3)}  | ${(p / res[`1|${rv}|none`]).toFixed(3)}`); } console.log(row.join("\n")); if (both && gstar === null) gstar = g; }
console.log(`\nlargest gain with BOTH moving-stripe ratios <= 0.6: ${(() => { let best = null; for (const g of [1, 0.5, 0.25, 0.1, 0.03, 0]) { const ok = [0.05, 0.1].every((rv) => res[`${g}|${rv}|moving`] / res[`${g}|${rv}|none`] <= 0.6); if (ok) { best = g; break; } } return best; })()}`);
