// WebGLEngine/brain/gfGain-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/gfGain-selfcheck.mjs      (about 5 s)
//
// THE GATE OF brain/gfGain.mjs (Round 18): the output-stage divisive gain on the Giant Fiber's input. Written and run BEFORE any stripe stimulus goes through the module.
//   1 THE DRIFT     D = max(0, sum dv) / (w h): a field moving down (dv = 1) gives 1, up gives 0 (the max), horizontal motion 0, a symmetric expansion 0, and it scales with the pixel mean;
//   2 THE SMOOTHING D~ is the first-order low-pass: tauD 0 is the series itself, a step input rises as 1 - exp(-t / tauD) (to within the Euler step), a constant input is a fixed point, bad tauD refused;
//   3 THE CURRENT   I = gfInput(N) / (1 + g D~): g 0 is gfInput; the division is exact per frame (D~ 1, g 3 gives a quarter); mismatched lengths and negative g refused;
//   4 THE RUN       the active count is the plain array's count (the gain does not touch N); a looming square with no vertical drift keeps its spike count at any g; a looming square with a downward-moving field overlaid is silenced at a large g and an upward one is not; g 0 equals gfSimulate;
//   5 THE SOURCE    pure.
// SABOTAGE (2026-11-17, 30 mutants of brain/gfGain.mjs): 30 red after adding the pass-through, defaults and smoothing row (six first-pass survivors: the parameter pass-through to gfInput and lifRun, the use of tauD and of the step in runGained, the defaults of g and tauD).
// NOT CHECKED: that the form means anything for a real neuron (said in the header of the module).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as G from "./gfGain.mjs";
import * as M from "./flyEmdLplc2Gf.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const throws = (f) => { try { f(); return false; } catch (e) { return /gfGain|flyEmdLplc2Gf/.test(e.message); } };

console.log("gfGain-selfcheck -- the output-stage gain on the Giant Fiber's input\n");

console.log("1. THE DRIFT");
{
    const w = 10, h = 8, mk = (f) => Float64Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w)));
    ok("!! D: +1 for a field moving DOWN (dv = +1 everywhere), 0 for UP (the max), 0 for no motion; a symmetric expansion (up above, down below) is 0", near(G.downDrift(mk(() => 1), w, h), 1) && G.downDrift(mk(() => -1), w, h) === 0 && G.downDrift(mk(() => 0), w, h) === 0 && near(G.downDrift(mk((x, y) => (y < 4 ? -1 : 1)), w, h), 0));
    ok("D is the pixel MEAN of dv and absolute (not normalised by the motion strength): downward 3 over a quarter of the pixels with the rest still gives 0.75; doubling dv doubles D", near(G.downDrift(mk((x) => (x < 5 && true ? 3 : 0)), w, h), 1.5) && near(G.downDrift(mk((x, y) => (x < 5 && y < 4 ? 3 : 0)), w, h), 0.75) && near(G.downDrift(mk(() => 2), w, h), 2));
}

console.log("\n2. THE SMOOTHING");
{
    const D = new Array(100).fill(1), s = G.smoothDrift(D, 0.2, 0.01);
    ok("!! tauD 0 returns the series unchanged (a copy), tauD above 0 is the first-order low-pass: a unit step reaches 1 - exp(-t / tauD) (the Euler step: within 0.03), a constant input starting at the constant stays there", G.smoothDrift([0, 1, 2], 0, 0.01).join() === "0,1,2" && G.smoothDrift([0, 1, 2], 0, 0.01) !== undefined && near(s[19], 1 - Math.exp(-0.2 / 0.2), 0.03) && near(s[0], 0.05, 1e-12) && s.every((v, i) => i === 0 || v > s[i - 1]) && s[99] > 0.99 && near(G.smoothDrift(new Array(10).fill(0), 0.2)[9], 0));
    ok("bad tauD (negative, NaN) refused; the smoothed series is as long as the input; the first value is (step / tauD) D(0)", throws(() => G.smoothDrift([1], -1)) && throws(() => G.smoothDrift([1], NaN)) && G.smoothDrift([1, 1, 1], 0.1, 0.01).length === 3 && near(G.smoothDrift([2, 2], 0.1, 0.01)[0], 0.2, 1e-12));
}

console.log("\n3. THE CURRENT");
{
    const N = [0, 100, 300, 600, 600, 400], base = M.gfInput(N), I0 = G.gainedCurrent(N, N.map(() => 5), 0), I1 = G.gainedCurrent(N, N.map(() => 1), 3);
    ok("!! g 0 is gfInput exactly; D~ = 1, g = 3 divides every frame's current by 4; the division is per frame (D~ 0 on some frames, 1 on others)", I0.every((v, i) => v === base[i]) && I1.every((v, i) => near(v, base[i] / 4, 1e-12)) && G.gainedCurrent(N, [0, 0, 1, 1, 0, 0], 1).every((v, i) => near(v, base[i] / ([2, 3].includes(i) ? 2 : 1), 1e-12)));
    ok("negative g refused, mismatched lengths refused, and negative currents (a falling count) are divided too (same sign)", throws(() => G.gainedCurrent(N, N, -1)) && throws(() => G.gainedCurrent(N, [0, 0], 1)) && base[5] < 0 && G.gainedCurrent(N, N.map(() => 1), 1)[5] === base[5] / 2);
}

console.log("\n4. THE RUN");
{
    const loom = M.loomingSquare({ rv: 0.1 }).frames, plain = M.runStimulus(loom, {}), r0 = G.runGained(loom, { g: 0 }), rBig = G.runGained(loom, { g: 1e9 });
    ok("!! the active count is the plain array's count at every frame (the gain never touches N), and g 0 reproduces gfSimulate's spikes exactly", r0.nAct.every((v, i) => v === plain.nAct[i]) && rBig.nAct.every((v, i) => v === plain.nAct[i]) && JSON.stringify(r0.spikes) === JSON.stringify(plain.spikes) && plain.spikes.length > 3);
    ok("!! a looming square has about no net downward drift: even g 1e9 keeps its spikes (same count)", rBig.spikes.length === plain.spikes.length && Math.max(...rBig.D) < 1e-3 * Math.max(1, Math.max(...rBig.D) + 1), `max D ${Math.max(...rBig.D).toExponential(2)}`);
    const scene = (dy) => loom.map((f, k) => { const d = Float32Array.from(f.data), by = Math.round((dy > 0 ? 10 : 135) + dy * k * 0.6); for (let y = by; y < by + 12; y++) for (let x = 178; x < 190; x++) if (y >= 0 && y < 150) d[y * 200 + x] = 1; return { w: 200, h: 150, data: d }; });
    const sp = (dy, g) => G.runGained(scene(dy), { g, tauD: 0 });
    const base = sp(1, 0), down = sp(1, 1e6), up = sp(-1, 1e6), upBase = sp(-1, 0);
    ok("!! direction-specific: a bar passing DOWN far from a looming square silences the Giant Fiber at a large g (0 spikes against the g 0 count) while a bar passing UP keeps its spikes (same count as at g 0); the active counts are identical at every g", base.spikes.length > 0 && down.spikes.length === 0 && up.spikes.length === upBase.spikes.length && up.spikes.length > 0 && JSON.stringify(down.nAct) === JSON.stringify(base.nAct), `down ${base.spikes.length} -> ${down.spikes.length}; up ${upBase.spikes.length} -> ${up.spikes.length}`);
    const rp = G.runGained(loom, { g: 0, params: { w: 80, tauM: 0.05 } }), pp = M.runStimulus(loom, { params: { w: 80, tauM: 0.05 } }), rd = G.runGained(scene(1), {}), rt = G.runGained(scene(1), { g: 10, tauD: 0.2 });
    ok("!! the Giant Fiber and array parameters pass through (w 80 and tau_m 50 ms give gfSimulate's spikes for those values, which differ from the default's), the defaults are g 0 and tauD 0 (no gain, D~ equal to D), and tauD smooths: D~ is the low-passed D (its own smoothDrift) and differs from D", JSON.stringify(rp.spikes) === JSON.stringify(pp.spikes) && rp.spikes.length !== plain.spikes.length && JSON.stringify(rd.spikes) === JSON.stringify(G.runGained(scene(1), { g: 0 }).spikes) && rd.Dsmooth.every((v, i) => v === rd.D[i]) && rt.Dsmooth.every((v, i) => near(v, G.smoothDrift(rt.D, 0.2, 0.01)[i], 1e-12)) && rt.Dsmooth.some((v, i) => Math.abs(v - rt.D[i]) > 1e-6), `w80 ${rp.spikes.length} vs ${plain.spikes.length}`);
    const mid = [0.1, 1, 10, 100].map((g) => sp(1, g).spikes.length);
    ok("the spike count never rises as g grows (the gain only divides)", mid.every((v, i) => i === 0 || v <= mid[i - 1]) && mid[0] <= base.spikes.length, mid.join(", "));
}

console.log("\n5. THE SOURCE");
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "gfGain.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file or network (the only import is the fly array)", !/Math\.random|Date\.now|performance\.now|document\.|window\.|fetch\(|node:|readFileSync/.test(src) && (src.match(/^import\s/gm) || []).length === 1);
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);
