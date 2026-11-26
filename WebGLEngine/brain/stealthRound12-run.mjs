// WebGLEngine/brain/stealthRound12-run.mjs -- Round 12 runner (registered BEFORE the run). Run: node brain/stealthRound12-run.mjs
import * as G from "./flyGfLoomModel.mjs";
const K = G.CONSTANTS, ASPECT = 74 / 53;
const sig = (vel) => (vel > 0 ? -0.2 + 2.1 / (1 + Math.exp(-(Math.log10(vel) - 2.8) / 0.25)) : -0.2);   // figure-read approximation of von Reyn Fig 7F
const stripeSpeed = (theta) => 4 * (theta / ASPECT) / 3;   // degrees/second
// returns { v (smoothed GF response), t, lc4 (the LC4 term, mV, smoothed) } for form "L" or "S", with or without the stripe cue added to the LC4 velocity
function respond(stim, form, cue) {
    const dt = 0.0005, a = stim.start - 0.05, t1 = 0.2, n = Math.floor((t1 - a) / dt) + 1, t = [], lc4 = [], rest = [];
    const velIn = (tt) => stim.thetaDot(tt) + (cue ? stripeSpeed(stim.theta(tt)) * (stim.theta(tt) > 0 ? 1 : 0) : 0);
    for (let i = 0; i < n; i++) { const tt = a + i * dt; t.push(tt); const c = G.components(stim, tt, K); const on = tt - K.d1 >= stim.start, vel = on ? velIn(tt - K.d1) : 0;
        lc4.push(on ? (form === "L" ? K.W_LC4 * K.C1 * vel : sig(vel)) : 0); rest.push(K.W_LPLC2 * c.lplc2 + K.W_i1 * c.i1 + K.W_i2 * c.i2); }
    const half = Math.max(0, Math.round(K.smoothSeconds / dt / 2)), sm = (arr) => arr.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) { s += arr[j]; c++; } return s / c; });
    const l = sm(lc4), r = sm(rest), v = l.map((x, i) => x + r[i]); let k = 0; for (let i = 1; i < n; i++) if (v[i] > v[k]) k = i;
    return { peak: v[k], tPeak: t[k], lc4Peak: Math.max(...l) };
}
console.log("== loom 10 -> 90 deg: GF peak (mV), peak time to contact (ms), LC4 term peak (mV); plain | with stripe cue | relative GF change");
const res = {};
for (const rv of [0.01, 0.02, 0.04, 0.08]) for (const form of ["L", "S"]) { const st = G.loomStimulus(rv), p = respond(st, form, false), c = respond(st, form, true); res[`${form}|${rv}`] = { p, c }; console.log(`r/v ${rv * 1000} ms ${form}: GF ${p.peak.toFixed(3)} mV at ${(p.tPeak * 1000).toFixed(1)} ms, LC4 ${p.lc4Peak.toFixed(3)} | with cue GF ${c.peak.toFixed(3)} at ${(c.tPeak * 1000).toFixed(1)} ms, LC4 ${c.lc4Peak.toFixed(3)} | GF change ${(100 * (c.peak - p.peak) / p.peak).toFixed(2)} %`); }
console.log("\n== stripes alone: a static 40 deg ellipse, only the stripe velocity as LC4 input (above each form's zero-velocity value)");
const still = { start: 0, theta: (t) => (t < 0 ? 0 : 40), thetaDot: () => 0 };
for (const form of ["L", "S"]) { const c = respond(still, form, true), z = respond(still, form, false); console.log(`${form}: LC4 term peak with stripes ${c.lc4Peak.toFixed(4)} mV, without ${z.lc4Peak.toFixed(4)} mV; stripe speed ${stripeSpeed(40).toFixed(1)} deg/s`); }
console.log(`\nS at 0, 38, 86, 630, 5700 deg/s: ${[0, 38, 86, 630, 5700].map((v) => sig(v).toFixed(3)).join(", ")} mV; L (weighted): ${[0, 38, 86, 630, 5700].map((v) => (K.W_LC4 * K.C1 * v).toFixed(3)).join(", ")} mV`);
console.log("\nLC4 peak L vs S on the plain loom: " + [0.01, 0.02, 0.04, 0.08].map((rv) => `r/v ${rv * 1000}: L ${res[`L|${rv}`].p.lc4Peak.toFixed(2)} S ${res[`S|${rv}`].p.lc4Peak.toFixed(2)}`).join(" | "));
console.log("GF peak time L vs S (ms): " + [0.01, 0.02, 0.04, 0.08].map((rv) => `r/v ${rv * 1000}: ${(res[`L|${rv}`].p.tPeak * 1000).toFixed(1)} vs ${(res[`S|${rv}`].p.tPeak * 1000).toFixed(1)}`).join(" | "));
