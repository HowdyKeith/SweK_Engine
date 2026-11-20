// WebGLEngine/brain/stealthRound15-run.mjs -- Round 15 runner (registered BEFORE the run). Run: node brain/stealthRound15-run.mjs
import * as O from "./oppLoom.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const N = 1000, widths = Array.from({ length: N }, (_, k) => 6 * Math.pow(105 / 6, k / (N - 1)));
const stim = { none: ["none", 4], static: ["static", 4], down: ["moving", 4], up: ["moving", -4] };
const frames = {}; for (const [k, [st, hz]] of Object.entries(stim)) frames[k] = loomingEllipse({ widths, stripes: st, stripeHz: hz }).frames;
const res = {};
for (const d of ["U", "G", "L"]) for (const k of Object.keys(stim)) {
    const r = O.runOpp(frames[k], { opp: d === "U" ? { scope: "global", rho: 1 } : { scope: d === "G" ? "global" : "local" } }), pk = Math.max(...(d === "U" ? r.nActRaw : r.nAct)), rawPk = Math.max(...r.nActRaw);
    const act = r.Rs.filter((v, i) => v !== null && r.nActRaw[i] > 0.05 * rawPk);
    res[`${d}|${k}`] = { pk, rawPk, Rfrac: act.length ? act.filter((v) => v >= 0.5).length / act.length : 0, Rmin: act.length ? Math.min(...act) : null, Rmax: act.length ? Math.max(...act) : null, nAct: act.length };
    console.log(`${d} ${k.padEnd(6)} peak ${String(pk).padStart(5)} (raw ${rawPk}); R_down over ${act.length} active frames: ${act.length ? Math.min(...act).toFixed(3) + " to " + Math.max(...act).toFixed(3) : "-"}; fraction of active frames with R >= 0.5: ${(res[`${d}|${k}`].Rfrac).toFixed(2)}`);
}
console.log("\nratios to the same detector's plain ellipse:");
for (const d of ["U", "G", "L"]) console.log(`${d}: static ${(res[`${d}|static`].pk / res[`${d}|none`].pk).toFixed(3)}  down ${(res[`${d}|down`].pk / res[`${d}|none`].pk).toFixed(3)}  up ${(res[`${d}|up`].pk / res[`${d}|none`].pk).toFixed(3)}`);
console.log("\nretention (plain / U plain) and the up control (up / U up):"); for (const d of ["G", "L"]) console.log(`${d}: plain ${(res[`${d}|none`].pk / res["U|none"].pk).toFixed(3)}, up ${(res[`${d}|up`].pk / res["U|up"].pk).toFixed(3)}`);
