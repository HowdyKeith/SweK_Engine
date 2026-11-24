// WebGLEngine/brain/stealthRound13-run.mjs -- Round 13 runner (registered BEFORE the run). Run: node brain/stealthRound13-run.mjs
import * as C from "./crabMlg1.mjs";
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const CON = [0.2, 0.4, 0.6, 0.8, 1.0], STR = ["none", "static", "moving"];
const configs = [];
// crab
const W = 180, H = 60, fps = 30, SEG = 6;
for (const pol of ["both", "off"]) configs.push({ name: `crab/${pol}`, run: (wc, st) => { const s = loomingEllipse({ rv: 0.3, w: W, h: H, fovDeg: 144, step: 1 / fps, startPx: 3, endPx: 37, cx: 67, cy: 30, stripes: st, wc }), net = C.createNetwork({ W, H, params: { polarity: pol } }); let a = null; s.frames.forEach((f, k) => { const r = net.step({ w: W, h: H, data: f.data.map((v) => v * 255) }); if (r.alarm[SEG] && a === null) a = k; }); return a === null ? 0 : (74 - s.width[a] * 2) / 74; }, norm: false });
for (const ls of [255, 1]) for (const pol of ["both", "off"]) configs.push({ name: `fly/${pol}/lum${ls}`, run: (wc, st) => { const s = loomingEllipse({ rv: 0.1, stripes: st, wc }); return Math.max(...M.runStimulus(s.frames, { params: { polarity: pol, lumScale: ls } }).nAct); }, norm: true });
const near = (a, b, t) => Math.abs(a - b) <= t;
const summary = [];
for (const cfg of configs) {
    const raw = {}; for (const wc of CON) for (const st of STR) raw[`${wc}|${st}`] = cfg.run(wc, st);
    const mx = cfg.norm ? Math.max(...Object.values(raw)) : 1, r = (wc, st) => (mx > 0 ? raw[`${wc}|${st}`] / mx : 0);
    console.log(`\n${cfg.name}  r (gray / static / moving) by contrast:`); for (const wc of CON) console.log(`  ${wc}: ${r(wc, "none").toFixed(2)} / ${r(wc, "static").toFixed(2)} / ${r(wc, "moving").toFixed(2)}`);
    const g = (wc) => r(wc, "none"), s = (wc) => r(wc, "static"), m = (wc) => r(wc, "moving");
    const C1 = g(0.2) <= g(0.6) + 0.05 && g(0.6) <= g(1.0) + 0.05;
    const C2 = g(0.2) - s(0.2) > 0.1 && g(0.2) - m(0.2) > 0.1 && near(s(0.2), m(0.2), 0.1);
    const C3 = [0.6, 0.8, 1.0].every((c) => near(g(c), s(c), 0.1));
    const C4 = [0.6, 0.8, 1.0].filter((c) => g(c) - m(c) > 0.1).length >= 2;
    const score = [C1, C2, C3, C4].filter(Boolean).length; summary.push({ name: cfg.name, C1, C2, C3, C4, score });
    console.log(`  C1 ${C1} C2 ${C2} C3 ${C3} C4 ${C4}  -> score ${score}/4`);
}
console.log("\nSUMMARY"); for (const x of summary) console.log(`${x.name.padEnd(16)} C1 ${x.C1 ? "Y" : "n"} C2 ${x.C2 ? "Y" : "n"} C3 ${x.C3 ? "Y" : "n"} C4 ${x.C4 ? "Y" : "n"}  score ${x.score}`);
