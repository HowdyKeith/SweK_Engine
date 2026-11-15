// WebGLEngine/brain/stealthRound8-run.mjs -- Round 8 runner (registered BEFORE the run). Run: node brain/stealthRound8-run.mjs
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const res = {};
for (const pol of ["both", "off", "on"]) for (const rv of [0.05, 0.1]) for (const st of ["none", "static", "moving"]) {
    const s = loomingEllipse({ rv, stripes: st }), r = M.runStimulus(s.frames, { params: { polarity: pol } }), pk = Math.max(...r.nAct);
    const th = r.spikes.length ? s.theta[Math.min(s.t.length - 1, Math.floor(r.spikes[0] / 0.01 + 1e-9))] : null;
    res[`${pol}|${rv}|${st}`] = { pk, sp: r.spikes.length, th };
    console.log(`${pol.padEnd(4)} r/v ${rv} ${st.padEnd(6)} peak ${String(pk).padStart(5)} spikes ${String(r.spikes.length).padStart(3)} first-spike ${th === null ? "-" : th.toFixed(1)}`);
}
console.log("\nmoving/plain and static/plain peak ratios:");
for (const pol of ["both", "off", "on"]) for (const rv of [0.05, 0.1]) { const p = res[`${pol}|${rv}|none`].pk, m = res[`${pol}|${rv}|moving`].pk, t = res[`${pol}|${rv}|static`].pk; console.log(`${pol} r/v ${rv}: moving ${p ? (m / p).toFixed(3) : "n/a"} static ${p ? (t / p).toFixed(3) : "n/a"} (plain ${p})`); }
for (const rv of [0.05, 0.1]) console.log(`off plain / both plain at ${rv}: ${(res[`off|${rv}|none`].pk / res[`both|${rv}|none`].pk).toFixed(3)}; on plain / off plain: ${(res[`on|${rv}|none`].pk / res[`off|${rv}|none`].pk).toFixed(3)}`);
