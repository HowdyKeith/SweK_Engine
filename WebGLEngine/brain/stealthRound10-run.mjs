// WebGLEngine/brain/stealthRound10-run.mjs -- Round 10 runner (registered BEFORE the run). Run: node brain/stealthRound10-run.mjs
import * as C from "./crabMlg1.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const W = 180, H = 60, fps = 30, SEG = 8;
const build = (rv, st, receding = false) => loomingEllipse({ rv, w: W, h: H, fovDeg: 144, step: 1 / fps, startPx: 3, endPx: 37, cx: 90, cy: 30, stripes: st, receding });
const run = (s, p) => { const net = C.createNetwork({ W, H, params: p }); let sp = 0, a = null; s.frames.forEach((f, k) => { const r = net.step({ w: W, h: H, data: f.data.map((v) => v * 255) }); if (r.spike[SEG]) sp++; if (r.alarm[SEG] && a === null) a = k; }); return { a, sp, size: a === null ? null : s.width[a] * 2 }; };
const variants = []; for (const pol of ["both", "off"]) for (const [nm, pool, pers] of [["S", "segment", 0.5], ["G", "global", 0.5], ["E", "segment", 0.9], ["GE", "global", 0.9]]) variants.push({ name: `${nm}/${pol}`, p: { polarity: pol, ffiPool: pool, aFfi1: pers } });
let animal = 0;
for (const v of variants) {
    const cells = [], ok = [];
    for (const rv of [0.15, 0.5]) { const pl = run(build(rv, "none"), v.p), st = run(build(rv, "static"), v.p), mv = run(build(rv, "moving"), v.p), rc = run(build(rv, "none", true), v.p); const r = (x) => (x.a === null || pl.a === null ? null : x.size / pl.size); cells.push(`r/v ${rv}: plain ${pl.a === null ? "no alarm" : pl.size.toFixed(1)} static ${st.a === null ? "none" : st.size.toFixed(1) + " (x" + r(st).toFixed(2) + ")"} moving ${mv.a === null ? "none" : mv.size.toFixed(1) + " (x" + r(mv).toFixed(2) + ")"} recede ${rc.a === null ? "no" : "ALARM"}`); ok.push(pl.a !== null && st.a !== null && r(st) >= 0.85 && r(st) <= 1.2 && (mv.a === null || r(mv) >= 1.15) && rc.a === null); }
    const al = ok.every(Boolean); if (al) animal++; console.log(`${v.name.padEnd(7)} ${cells.join(" | ")}  -> ${al ? "ANIMAL-LIKE" : "no"}`);
}
console.log(`\nanimal-like variants: ${animal} of ${variants.length}`);
