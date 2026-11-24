// WebGLEngine/brain/stealthRound14-run.mjs -- Round 14 runner (registered BEFORE the run). Run: node brain/stealthRound14-run.mjs
import * as M from "./flyEmdLplc2Gf.mjs";
import * as O from "./oppLoom.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const det = { U: null, G: { scope: "global" }, L: { scope: "local" } };
const peak = (frames, d, params = {}) => Math.max(...(det[d] ? O.runOpp(frames, { params, opp: det[d] }).nAct : M.runStimulus(frames, { params }).nAct));
console.log("== A. loom, stripes none/static/down/up; peak count and ratio to the same detector's plain ellipse (lumScale 255)");
const A = {};
for (const rv of [0.05, 0.1]) for (const d of ["U", "G", "L"]) { const pk = {}; for (const [nm, st, hz] of [["none", "none", 4], ["static", "static", 4], ["down", "moving", 4], ["up", "moving", -4]]) pk[nm] = peak(loomingEllipse({ rv, stripes: st, stripeHz: hz }).frames, d); A[`${d}|${rv}`] = pk; console.log(`r/v ${rv} ${d}: plain ${pk.none} | static ${pk.static} (${(pk.static / pk.none).toFixed(3)}) | down ${pk.down} (${(pk.down / pk.none).toFixed(3)}) | up ${pk.up} (${(pk.up / pk.none).toFixed(3)})`); }
console.log("\nretention of the pure loom (plain / U plain) and the up-stripe control (up / U up):");
for (const rv of [0.05, 0.1]) for (const d of ["G", "L"]) console.log(`r/v ${rv} ${d}: plain ${(A[`${d}|${rv}`].none / A[`U|${rv}`].none).toFixed(3)}, up ${(A[`${d}|${rv}`].up / A[`U|${rv}`].up).toFixed(3)}`);
console.log("\n== B. Round 13 ordering (r/v 100 ms), C1 to C4");
const CON = [0.2, 0.4, 0.6, 0.8, 1.0], near = (a, b, t) => Math.abs(a - b) <= t, scores = [];
for (const d of ["G", "L"]) for (const ls of [255, 1]) {
    const raw = {}; for (const wc of CON) for (const st of ["none", "static", "moving"]) raw[`${wc}|${st}`] = peak(loomingEllipse({ rv: 0.1, stripes: st, wc }).frames, d, { lumScale: ls });
    const mx = Math.max(...Object.values(raw)), r = (wc, st) => (mx > 0 ? raw[`${wc}|${st}`] / mx : 0), g = (c) => r(c, "none"), s = (c) => r(c, "static"), m = (c) => r(c, "moving");
    console.log(`${d}/lum${ls}: ` + CON.map((c) => `${c}: ${g(c).toFixed(2)}/${s(c).toFixed(2)}/${m(c).toFixed(2)}`).join("  "));
    const C1 = g(0.2) <= g(0.6) + 0.05 && g(0.6) <= g(1.0) + 0.05, C2 = g(0.2) - s(0.2) > 0.1 && g(0.2) - m(0.2) > 0.1 && near(s(0.2), m(0.2), 0.1), C3 = [0.6, 0.8, 1.0].every((c) => near(g(c), s(c), 0.1)), C4 = [0.6, 0.8, 1.0].filter((c) => g(c) - m(c) > 0.1).length >= 2;
    const sc = [C1, C2, C3, C4].filter(Boolean).length; scores.push({ d, ls, C1, C2, C3, C4, sc }); console.log(`   C1 ${C1} C2 ${C2} C3 ${C3} C4 ${C4} -> ${sc}/4`);
}
console.log("\nSUMMARY"); for (const x of scores) console.log(`${x.d}/lum${x.ls}  C1 ${x.C1 ? "Y" : "n"} C2 ${x.C2 ? "Y" : "n"} C3 ${x.C3 ? "Y" : "n"} C4 ${x.C4 ? "Y" : "n"}  score ${x.sc}`);
