// WebGLEngine/brain/crabRepl30Agg.mjs -- aggregates Round 30 (brain/STEALTH_ROUNDS_WIP.md), written BEFORE any of its runs: Part A with Round 28's predictions, Part B with Round 29's C1 to C4, word for word, each with its MARGIN
//   (positive: inside the line by that much; negative: outside). Run: node brain/crabRepl30Agg.mjs
import fs from "node:fs";
const D = "brain/crabRepl30Runs/", read = (f) => JSON.parse(fs.readFileSync(D + f, "utf8"));
// ---- Part A: Round 28's predictions at r/v 0.42 and 0.85, azimuth 225
const A = {}; for (const f of fs.readdirSync(D).filter((f) => f.startsWith("A_"))) { const r = read(f); A[r.g + "|" + r.rv] = r; }
const RV = [0.42, 0.85], ratio = (x, plain) => (x.size === null ? null : x.size / plain.size);
const p1m = [], p2m = [], p3m = [], p4m = [], p5 = [];
for (const rv of RV) {
    const g0 = A["0|" + rv], g3 = A["300|" + rv], st = ratio(g3.static, g3.plain), mv = ratio(g3.moving, g3.plain), up = ratio(g3.up, g3.plain), mv0 = ratio(g0.moving, g0.plain);
    p1m.push(Math.min(st === null ? -Infinity : Math.min(st - 0.85, 1.2 - st), mv === null ? Infinity : mv - 1.15));
    p2m.push(up === null ? -Infinity : 0.9 - up);
    p3m.push(mv0 === null ? -Infinity : 0.95 - mv0);
    p4m.push(0.05 - Math.abs(g3.plain.size / g0.plain.size - 1));
    p5.push(g0.recede.size !== null);
    console.log(`A r/v ${rv}: plain ${g3.plain.size === null ? "none" : g3.plain.size.toFixed(1)} deg (gain-free ${g0.plain.size === null ? "none" : g0.plain.size.toFixed(1)}) | g300 static ${st === null ? "none" : st.toFixed(3)} moving ${mv === null ? "NO ALARM" : mv.toFixed(3)} UP ${up === null ? "none" : up.toFixed(4)} | gain-free moving ${mv0 === null ? "none" : mv0.toFixed(3)} | recede gain-free ${g0.recede.size === null ? "NO alarm" : "alarm at " + g0.recede.size.toFixed(1)}`);
}
const m = (xs) => Math.min(...xs), P1 = m(p1m) >= 0, P2 = m(p2m) >= 0, P3 = m(p3m) >= 0, P4 = m(p4m) >= 0, P5 = p5.every(Boolean);
console.log(`A predictions (margin = the worse of the two r/v): P1 ${P1} (${m(p1m).toFixed(4)}) | P2 ${P2} (${m(p2m).toFixed(4)}) | P3 ${P3} (${m(p3m).toFixed(4)}) | P4 ${P4} (${m(p4m).toFixed(4)}) | P5 ${P5}`);
console.log(`VERDICT A: ${P1 && P2 ? "SUPPORTED" : "NOT SUPPORTED"}`);
// ---- Part B: Round 29's C1 to C4 at azimuth 225, r/v 0.6
const B = {}; for (const f of fs.readdirSync(D).filter((f) => f.startsWith("B_"))) { const r = read(f); B[r.g + "|" + r.wc] = r; }
const CON = [0.2, 0.4, 0.6, 0.8, 1], rr = (s) => (s === null ? 0 : (74 - s) / 74);
for (const g of [0, 300]) {
    const r = (c, k) => rr(B[g + "|" + c][k]), gr = (c) => r(c, "none"), st = (c) => r(c, "static"), mv = (c) => r(c, "moving");
    console.log(`B g ${g}: r gray/static/moving ` + CON.map((c) => `${c}: ${gr(c).toFixed(3)}/${st(c).toFixed(3)}/${mv(c).toFixed(3)}`).join("  "));
    const c1 = Math.min(gr(0.6) + 0.05 - gr(0.2), gr(1) + 0.05 - gr(0.6)), c2 = Math.min(gr(0.2) - st(0.2) - 0.1, gr(0.2) - mv(0.2) - 0.1, 0.1 - Math.abs(st(0.2) - mv(0.2)));
    const c3 = Math.min(...[0.6, 0.8, 1].map((c) => 0.1 - Math.abs(gr(c) - st(c)))), c4list = [0.6, 0.8, 1].map((c) => gr(c) - mv(c) - 0.1).sort((a, b) => b - a), c4 = c4list[1];   // at least two of three: the second best
    const C1 = c1 >= 0, C2 = c2 > 0, C3 = c3 >= 0, C4 = c4 > 0, n = [C1, C2, C3, C4].filter(Boolean).length;
    console.log(`  C1 ${C1} (${c1.toFixed(3)}) C2 ${C2} (${c2.toFixed(3)}) C3 ${C3} (${c3.toFixed(3)}) C4 ${C4} (${c4.toFixed(3)}) -> ${n}/4`);
    if (g === 300) console.log(`VERDICT B: ${n === 4 ? "SUPPORTED" : "NOT SUPPORTED"} (${n} of 4)`);
}
