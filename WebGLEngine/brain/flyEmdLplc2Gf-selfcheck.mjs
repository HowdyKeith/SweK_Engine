// WebGLEngine/brain/flyEmdLplc2Gf-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/flyEmdLplc2Gf-selfcheck.mjs      (about 25 s)
//
// THE GATE OF brain/flyEmdLplc2Gf.mjs: the EMD, LPLC2 and Giant Fiber model of Zhao et al. 2023 (iScience 26:106337, STAR Methods, eq. 1 to 10, Table 1) and its variant with the units at the measured lattice positions of vendor/male-cns/giant-fiber-visual-retinotopy.json.
//   1 THE PARAMETERS   Table 1 and the Methods: step 10 ms, tau_HP 250 ms, tau_LP 50 ms, cutoffs 0 and 0.05, L0 = L1 = 2, field side 100 pixels, E_leak -60, V_th -50, V_re -70, V_min -80, R 1, RK4 at 0.5 ms; frozen.
//   2 THE GEOMETRY     the cross: arm width side/3, four arms of equal area that do not overlap and leave the central square out, mirror-symmetric; the summed-area table and the box sums equal a brute-force sum (clipping to the frame, rounding, empty boxes).
//   3 THE DETECTOR     direction selectivity of the half-detectors summed over ON and OFF paths: a bar moving right gives a positive horizontal map, left negative, down a positive vertical map, up negative, a dark and a light bar the same sign, a still scene zero; reset() restores the rest state; bad frames and options are refused.
//   4 THE GIANT FIBER  gfInput is w N_k dN_k/dt (N in thousands, per second); the integrate-and-fire core matches the analytic solution (the charging curve to 1e-6 mV, the first spike time and the inter-spike interval of a constant current), clamps at -80 mV, rests at E_leak, spike counts rise with the current.
//   5 THE PAPER'S RESULTS (properties, on the paper's 200 x 150 frame, field 100)   silent (no active unit, no spike) for bars, edges and gratings in all four directions, for the receding square and for inward cross motion; active for a looming square, a constant-edge-speed square and outward cross motion; the ADDITIVE control answers a bar and a grating;
//                      a threshold L0 far above the signals silences everything; with L1 negative three arms are enough; the active population of a constant-edge-speed square is unimodal and peaks when the square's side is about the field's side; the Giant Fiber's first spike comes at a nearly constant angular size across r/v (coefficient of variation under 0.15,
//                      the paper's 0.077) with the spike time linear in r/v, for every Giant Fiber setting tried (w 10 to 160, tau_m 50 to 200 ms); the first-spike size grows with the field side (60 < 80 < 100 < 120 pixels): the paper's prediction that the receptive field sets the threshold.
//   6 THE LATTICE VARIANT   latticeUnits places the cells by their lobula plate centroid, the lattice's diagonals as the visual field's front and up (a unit displaced (+1, -1) lattice units is toward the FRONT, (+1, +1) UP), the centre maps to the frame's centre, units outside the frame are dropped and counted, a side is chosen, the scale is degPerColumn; populationCentroid is the mean of the active units;
//                      runLattice scales the count to the pixel-array equivalent; on the real file the array is silent for a bar, fires for a looming square at a roughly constant size, and the centroid of the active units lands within 20 pixels (about 12 degrees) of the looming centre at five positions.
//   7 THE SOURCE       pure but for the stimulus files the gate reads.
// SABOTAGE (2026-11-15, 74 mutants of brain/flyEmdLplc2Gf.mjs, each run alone in a scratch copy, four at a time): 70 red BY NAME, 1 equivalent and argued (an empty box: bx = ax gives 0 from the table arithmetic as well), 3 invalid mutation strings (not applied). The first pass left FIVE real survivors (the rounding of fractional box corners, the up arm's term in
//   the additive sum, gfSimulate's pass-through of its parameters, the looming square's end condition, the receding square's reversal of its times and sizes): each got a row (fractional corners 3.6 and 9.4, the additive L1 row, the gfSimulate row, the end-size row, the receding row) and all five are red now.
// DIFFERENCES FROM THE PAPER, SAID PLAINLY (measured, not tuned away): the first-spike size here is about 49 degrees (46 to 52 at r/v 20 to 100 ms), not the paper's 34, and depends on the Giant Fiber's w and tau_m (which the paper gives only as ranges) and on the field side; at r/v = 10 ms the square moves about 5 pixels per 10 ms frame, beyond the detector's range, and the model does NOT fire (the
// paper reports firing from 10 ms: pinned below so a change is noticed). Luminance units (0 to 255 here) and the units of N_act dN/dt are assumptions (see the module header). NOT CHECKED: the authors' MATLAB; the robot tests; the real-world videos.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./flyEmdLplc2Gf.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const throws = (f) => { try { f(); return false; } catch (e) { return /flyEmdLplc2Gf/.test(e.message); } };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, cv = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) / mean(a);

console.log("flyEmdLplc2Gf-selfcheck -- the EMD, LPLC2 and Giant Fiber model of Zhao et al. 2023\n");

console.log("1. THE PARAMETERS");
{
    const P = M.PARAMS;
    ok("!! Table 1 and the Methods: step 10 ms, tau_HP 250 ms, tau_LP 50 ms, cutoffs 0 and 0.05, L0 = L1 = 2, side 100, E_leak -60, V_th -50, V_re -70, V_min -80, R 1, RK4 0.5 ms", P.step === 0.01 && P.tauHP === 0.25 && P.tauLP === 0.05 && P.cutOn === 0 && P.cutOff === 0.05 && P.L0 === 2 && P.L1 === 2 && P.rfSide === 100 && P.eLeak === -60 && P.vTh === -50 && P.vRe === -70 && P.vMin === -80 && P.R === 1 && P.rkStep === 0.0005);
    ok("the assumptions are the ones the header names (w 40, tau_m 100 ms, luminance x 255, multiplicative) and the object is frozen", P.w === 40 && P.tauM === 0.1 && P.lumScale === 255 && P.integration === "multiplicative" && Object.isFrozen(P));
}

console.log("\n2. THE GEOMETRY");
{
    const A = M.crossArms(50, 50, 90), area = (b) => (b[1] - b[0]) * (b[3] - b[2]), inter = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[2], b[2]));
    ok("!! the cross: arms of width side/3 = 30, each 30 x 30, right [65,95]x[35,65], left [5,35]x[35,65], down [35,65]x[65,95], up [35,65]x[5,35]", JSON.stringify(A.r) === "[65,95,35,65]" && JSON.stringify(A.l) === "[5,35,35,65]" && JSON.stringify(A.d) === "[35,65,65,95]" && JSON.stringify(A.u) === "[35,65,5,35]" && ["r", "l", "d", "u"].every((k) => area(A[k]) === 900));
    const ks = ["r", "l", "d", "u"], centre = [35, 65, 35, 65];
    ok("the four arms do not overlap each other and leave the central square out", ks.every((a, i) => ks.every((b, j) => i >= j || inter(A[a], A[b]) === 0)) && ks.every((k) => inter(A[k], centre) === 0));
    const B = M.crossArms(10, 20, 60); ok("an arm is translated with the unit's centre and scales with the side", B.r[0] === 10 + 10 && B.r[1] === 10 + 30 && B.u[2] === 20 - 30 && B.u[3] === 20 - 10);
    const w = 17, h = 13, m = new Float64Array(w * h); let s = 12345; for (let i = 0; i < m.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; m[i] = (s % 1000) / 100 - 5; }
    const I = M.integral(m, w, h), brute = (x0, x1, y0, y1) => { let t = 0; for (let y = Math.max(0, Math.round(y0)); y < Math.min(h, Math.round(y1)); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, Math.round(x1)); x++) t += m[y * w + x]; return t; };
    const boxes = [[0, 17, 0, 13], [2, 9, 3, 8], [-5, 4, -3, 6], [10, 30, 8, 40], [3.4, 8.6, 1.2, 6.7], [3.6, 9.4, 1.6, 6.4], [2.5, 7.5, 2.5, 7.5], [5, 5, 1, 9], [9, 4, 1, 9], [20, 25, 1, 9]];
    ok("!! the summed-area table and box sums equal a brute-force sum: the whole frame, an inner box, boxes clipped at the edges, fractional corners rounded to the nearest pixel (3.4 and 3.6, 8.6 and 9.4: a floor would differ), an empty box, a reversed box and a box outside the frame", boxes.every((b) => near(M.boxSum(I, w, h, ...b), brute(...b), 1e-9)));
}

console.log("\n3. THE DETECTOR");
{
    const W = 40, H = 30, dir = (d, kind = "bar") => M.translating({ kind, direction: d, bar: 6, speed: 100, w: W, h: H, frames: 20 }).frames;
    const sums = (frames) => { const m = M.createModel({ w: W, h: H, keepMaps: true }); let sh = 0, sv = 0; for (const f of frames) { const r = m.step(f); if (r.maps) { for (const v of r.maps.dh) sh += v; for (const v of r.maps.dv) sv += v; } } return { sh, sv }; };
    const R = sums(dir("right")), L = sums(dir("left")), D = sums(dir("down")), U = sums(dir("up"));
    ok("!! the half-detectors are direction selective: a bar moving right gives a positive horizontal map and left a negative one, down a positive vertical map and up a negative one, and the other axis stays near 0", R.sh > 0 && L.sh < 0 && D.sv > 0 && U.sv < 0 && Math.abs(R.sv) < 0.02 * Math.abs(R.sh) && Math.abs(D.sh) < 0.02 * Math.abs(D.sv), `right ${R.sh.toExponential(2)}, left ${L.sh.toExponential(2)}, down ${D.sv.toExponential(2)}, up ${U.sv.toExponential(2)}`);
    const light = dir("right").map((f) => ({ w: f.w, h: f.h, data: f.data.map((v) => 1 - v) })), RL = sums(light);
    ok("!! ON and OFF paths are added: a LIGHT bar moving right (the ON pathway) gives the same sign as the dark bar (the OFF pathway), and of a similar size", RL.sh > 0 && RL.sh > 0.2 * R.sh && RL.sh < 5 * R.sh, `light ${RL.sh.toExponential(2)} dark ${R.sh.toExponential(2)}`);
    const still = sums(Array.from({ length: 10 }, () => M.blank(W, H, 0.5)));
    ok("a still scene gives exactly 0", still.sh === 0 && still.sv === 0);
    const m = M.createModel({ w: W, h: H }), a = M.blank(W, H, 0.5), first = m.step(a);
    ok("the first frame only sets the rest state: no active unit; an active-unit map has one entry per unit", first.nAct === 0 && first.active.length === W * H && first.active.every((v) => v === 0));
    const seq = dir("right"), mm = M.createModel({ w: W, h: H, keepMaps: true }); const o1 = seq.map((f) => mm.step(f).maps && mm.step.length); mm.reset();
    let s1 = 0; const m2 = M.createModel({ w: W, h: H, keepMaps: true }); for (const f of seq) { const r = m2.step(f); if (r.maps) for (const v of r.maps.dh) s1 += v; } m2.reset(); let s2 = 0; for (const f of seq) { const r = m2.step(f); if (r.maps) for (const v of r.maps.dh) s2 += v; }
    ok("reset() restores the rest state: the same sequence gives the same map sums", near(s1, s2, 1e-6 * Math.abs(s1)) && s1 !== 0 && o1.length === seq.length);
    ok("bad inputs are refused: a frame of another size, a tiny frame, an unknown integration", throws(() => M.createModel({ w: W, h: H }).step(M.blank(W + 1, H))) && throws(() => M.createModel({ w: 3, h: 3 })) && throws(() => M.createModel({ w: W, h: H, params: { integration: "max" } })) && throws(() => M.loomingSquare({ rv: 0 })) && throws(() => M.translating({ kind: "dot" })) && throws(() => M.translating({ direction: "diagonal" })));
}

console.log("\n4. THE GIANT FIBER");
{
    const I = M.gfInput([0, 1000, 3000, 3000], { w: 40, step: 0.01 });
    ok("!! gfInput is w N_k dN_k/dt: the first frame 0; N 1000 (1 thousand) rising 1 thousand in 10 ms: 40 x 1 x 100 = 4000; N 3000 rising 2 thousand: 40 x 3 x 200 = 24000; a constant N gives 0", I[0] === 0 && near(I[1], 4000, 1e-9) && near(I[2], 24000, 1e-9) && I[3] === 0);
    ok("a falling count gives a negative current (the paper clamps the potential at -80 mV for that reason)", M.gfInput([3000, 1000], { w: 40 })[1] < 0);
    const tau = 0.1, E = -60, run = (cur, n) => M.lifRun(Array(n).fill(cur), {});
    const sub = run(8, 30);
    let worst = 0; for (let k = 0; k < sub.vTrace.length; k += 37) { const t = (k + 1) * 0.0005; worst = Math.max(worst, Math.abs(sub.vTrace[k] - (E + 8 * (1 - Math.exp(-t / tau))))); }
    ok("!! a constant current below threshold charges the unit along E + R I (1 - exp(-t / tau_m)) to within 1e-6 mV (RK4), and no spike", worst < 1e-6 && sub.spikes.length === 0, "worst " + worst.toExponential(1));
    const sp = run(12, 120), first = sp.spikes[0], second = sp.spikes[1], t1 = -tau * Math.log(1 - 10 / 12), dtI = tau * Math.log((E + 12 + 70) / (E + 12 + 50));
    ok("!! a constant current above threshold: the first spike at -tau ln(1 - (V_th - E)/(R I)) = 179.2 ms and the next after tau ln((E + I - V_re)/(E + I - V_th)) = 239.8 ms (within 1 ms), the potential reset to V_re", sp.spikes.length >= 4 && Math.abs(first - t1) < 0.001 && Math.abs(second - first - dtI) < 0.001, `first ${(first * 1000).toFixed(1)} ms, interval ${((second - first) * 1000).toFixed(1)} ms`);
    const neg = run(-100, 100);
    ok("!! V is clamped at -80 mV and reached (a strongly negative current), and a unit with no input rests at E_leak with no spike", near(Math.min(...neg.vTrace), -80, 1e-12) && neg.vTrace.every((v) => v >= -80) && M.lifRun(Array(50).fill(0), {}).vTrace.every((v) => v === -60) && M.lifRun(Array(50).fill(0), {}).spikes.length === 0);
    const counts = [11, 15, 25, 60].map((c) => run(c, 200).spikes.length);
    ok("the spike count rises with the current (11, 15, 25, 60 mV: strictly more spikes each) and the trace has 20 samples per frame", counts[0] < counts[1] && counts[1] < counts[2] && counts[2] < counts[3] && sp.vTrace.length === 120 * 20 && sp.V.length === 120, counts.join(", "));
    const g = M.gfSimulate([0, 100, 400, 900, 1600, 1600, 1600], {});
    ok("gfSimulate is lifRun(gfInput): the same spikes", JSON.stringify(g.spikes) === JSON.stringify(M.lifRun(M.gfInput([0, 100, 400, 900, 1600, 1600, 1600], {}), {}).spikes) && g.V.length === 7);
}

console.log("\n5. THE PAPER'S RESULTS (the 200 x 150 frame, field 100 pixels)");
const loomRv = {};
{
    const run = (fr, params) => M.runStimulus(fr, { params: params || {} }), silent = (fr, p) => { const r = run(fr, p); return Math.max(...r.nAct) === 0 && r.spikes.length === 0; };
    const dirs = ["right", "left", "down", "up"];
    ok("!! SILENT for unidirectional motion: a bar, an edge and a grating in all four directions give no active unit and no spike", dirs.every((d) => ["bar", "edge", "grating"].every((k) => silent(M.translating({ kind: k, direction: d, bar: 20, frames: 60 }).frames))));
    ok("!! SILENT for contraction: the receding square (the looming square played backwards), inward cross motion; and for a static scene", silent(M.loomingSquare({ rv: 0.05, receding: true }).frames) && silent(M.crossMotion({ outward: false }).frames) && silent(Array.from({ length: 30 }, () => M.blank(200, 150, 0.5))));
    const loom = run(M.loomingSquare({ rv: 0.05 }).frames), edge = run(M.constantEdgeSquare({ speed: 50 }).frames), cross = run(M.crossMotion({ outward: true }).frames);
    ok("!! ACTIVE for a looming square, a constant-edge-speed expanding square (both dark and bright) and outward cross motion", Math.max(...loom.nAct) > 500 && loom.spikes.length > 5 && Math.max(...edge.nAct) > 500 && edge.spikes.length > 5 && Math.max(...cross.nAct) > 0 && Math.max(...run(M.constantEdgeSquare({ speed: 50, dark: false }).frames).nAct) > 500, `loom ${Math.max(...loom.nAct)}, edge ${Math.max(...edge.nAct)}, cross ${Math.max(...cross.nAct)}`);
    const addP = { integration: "additive" }, barF = M.translating({ kind: "bar", direction: "right", frames: 60 }).frames, grF = M.translating({ kind: "grating", direction: "right", bar: 20, frames: 60 }).frames;
    ok("!! the ADDITIVE control answers what the multiplicative unit ignores: a bar and a grating give active units (the paper's Figure 2A third to eighth columns, lower row)", Math.max(...run(barF, addP).nAct) > 1000 && Math.max(...run(grF, addP).nAct) > 1000 && Math.max(...run(barF).nAct) === 0);
    ok("!! the additive unit sums FOUR terms including the up arm's, which is the one compared with L1: with L1 very large the up term is 0 and the cross motion's count falls, with L1 very negative it is huge and every unit with any arm active counts", (() => { const cr = M.crossMotion({ outward: true }).frames, a = Math.max(...run(cr, { integration: "additive" }).nAct), hi = Math.max(...run(cr, { integration: "additive", L1: 1e9 }).nAct), lo = Math.max(...run(cr, { integration: "additive", L1: -1e9 }).nAct); return lo > a && a > hi; })());
    { const g1 = M.gfSimulate([0, 600, 1500, 2600, 3000, 3000], { w: 40 }), g2 = M.gfSimulate([0, 600, 1500, 2600, 3000, 3000], { w: 400 }), g3 = M.gfSimulate([0, 600, 1500, 2600, 3000, 3000], { w: 40, tauM: 0.01 });
      ok("!! gfSimulate passes its parameters through: a ten times larger w gives more spikes, a much shorter tau_m changes the potential", g2.spikes.length > g1.spikes.length && JSON.stringify(g3.V) !== JSON.stringify(g1.V)); }
    { const ls = M.loomingSquare({ rv: 0.05 }), grow = ls.side.at(-1) - ls.side.at(-2), rc = M.loomingSquare({ rv: 0.05, receding: true });
      ok("!! the looming square runs to its end size and stops at the last frame that does not pass it: the last side is at most 105 and the next frame would exceed 105; the first side is at least 6 and the frame before would be smaller", ls.side.at(-1) <= 105 + 1e-9 && ls.side.at(-1) + grow > 105 && ls.side[0] >= 6 - 1e-9 && ls.side[0] - (ls.side[1] - ls.side[0]) < 6 + 1e-6 && ls.t.every((x, i) => i === 0 || near(x - ls.t[i - 1], 0.01, 1e-9)));
      ok("!! the receding square reverses the sequence AND its times, angles and sides together (the size decreases, the times run backwards)", rc.side[0] > rc.side.at(-1) && rc.theta[0] > rc.theta.at(-1) && rc.t[0] === ls.t.at(-1) && rc.t.at(-1) === ls.t[0] && rc.side[0] === ls.side.at(-1) && rc.frames[0].data.every((v, i) => v === ls.frames.at(-1).data[i])); }
    ok("a threshold L0 far above the signals silences even the looming square", silent(M.loomingSquare({ rv: 0.05 }).frames, { L0: 1e9 }));
    const threeArm = []; { const X = 99.5, Y = 74.5; for (let k = 0; k < 40; k++) { const len = 50 * 0.01 * k * 2, f = M.blank(200, 150, 0.5); for (let y = 0; y < 150; y++) for (let x = 0; x < 200; x++) { const dx = x - X, dy = y - Y; if ((Math.abs(dy) <= 5 && Math.abs(dx) <= 5 + len) || (Math.abs(dx) <= 5 && dy >= 0 && dy <= 5 + len)) f.data[y * 200 + x] = 0; } threeArm.push(f); } }
    ok("!! L1 negative lets a unit fire with only THREE arms expanding (a cross with no UP arm: eq. 5 compares the up arm with L1): silent with L1 = 2, active with L1 very negative (the closed-loop setting of the paper)", silent(threeArm) && Math.max(...run(threeArm, { L1: -1e9 }).nAct) > 0);
    const ce = M.constantEdgeSquare({ speed: 50, startPx: 6, endPx: 196 }), n = edge.nAct.length > 0 ? run(ce.frames).nAct : [], k = n.indexOf(Math.max(...n)), side = 6 + 2 * 50 * 0.01 * k;
    let rises = 0, falls = 0; for (let i = 1; i < n.length; i++) { if (n[i] > n[i - 1] + 20) rises++; if (n[i] < n[i - 1] - 20) falls++; }
    ok("!! the active population of a constant-edge-speed square is UNIMODAL: it rises from 0, peaks when the square's side is about the field's side (80 to 110 pixels for a field of 100), and falls back to 0 (peak 3,000 to 4,500 units)", n[0] === 0 && n[n.length - 1] === 0 && k > 10 && k < n.length - 10 && side > 80 && side < 110 && n[k] > 3000 && n[k] < 4500 && rises > 3 && falls > 3 && (() => { let ch = 0, dir = 0; for (let i = 1; i < n.length; i++) { const d = Math.sign(n[i] - n[i - 1]); if (d !== 0 && dir !== 0 && d !== dir) ch++; if (d !== 0) dir = d; } return ch <= 6; })(), `peak ${n[k]} at side ${side.toFixed(0)} px`);
    const rvs = [0.02, 0.05, 0.1], an = rvs.map((rv) => { const s = M.loomingSquare({ rv }), r = M.runStimulus(s.frames, {}); loomRv[rv] = { s, r, nAct: r.nAct }; return M.loomAnalysis(rv); });
    const th = an.map((a) => a.firstSpikeTheta), tf = an.map((a) => a.firstSpikeT);
    ok("!! the Giant Fiber's first spike comes at a nearly CONSTANT angular size across r/v 20, 50 and 100 ms (coefficient of variation under 0.15; the paper 0.077), between 35 and 65 degrees (the paper 34)", th.every((v) => v !== null) && cv(th) < 0.15 && th.every((v) => v > 35 && v < 65), th.map((v) => v.toFixed(1)).join(", ") + ", CV " + cv(th).toFixed(3));
    const xs = rvs, ys = tf, mx = mean(xs), my = mean(ys), slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0), r2 = (() => { const ss = ys.reduce((a, y) => a + (y - my) ** 2, 0), res = ys.reduce((a, y, i) => a + (y - (my + slope * (xs[i] - mx))) ** 2, 0); return 1 - res / ss; })();
    ok("!! the first-spike time (relative to collision) is LINEAR in r/v (R^2 above 0.98; the paper Figure 4C), earlier for slower looms (slope between -3.5 and -1.5)", r2 > 0.98 && slope < -1.5 && slope > -3.5, `R^2 ${r2.toFixed(4)}, slope ${slope.toFixed(2)}`);
    const settings = [[10, 0.1], [40, 0.1], [160, 0.1], [40, 0.05], [40, 0.2]], cvs = settings.map(([w, tau]) => { const ths = rvs.map((rv) => { const s = loomRv[rv].s, g = M.gfSimulate(loomRv[rv].nAct, { w, tauM: tau }); if (!g.spikes.length) return null; const i = Math.min(s.t.length - 1, Math.floor(g.spikes[0] / 0.01 + 1e-9)); return s.theta[i]; }); return ths.every((v) => v !== null) ? cv(ths) : 9; });
    ok("!! the size threshold is robust to the Giant Fiber's free parameters: for w 10, 40, 160 and tau_m 50, 100, 200 ms the first-spike size still has a coefficient of variation under 0.2 across r/v", cvs.every((c) => c < 0.2), cvs.map((c) => c.toFixed(2)).join(", "));
    const rfTh = [60, 80, 100, 120].map((rf) => M.loomAnalysis(0.05, { params: { rfSide: rf } }).firstSpikeTheta);
    ok("!! the receptive-field side sets the threshold: the first-spike size grows with the field (60, 80, 100, 120 pixels give strictly larger sizes: the paper's prediction for the angular-size threshold)", rfTh.every((v) => v !== null) && rfTh[0] < rfTh[1] && rfTh[1] < rfTh[2] && rfTh[2] < rfTh[3] && rfTh[0] > 25 && rfTh[3] < 80, rfTh.map((v) => v.toFixed(1)).join(" < "));
    const fast = M.runStimulus(M.loomingSquare({ rv: 0.01 }).frames, {});
    ok("PINNED LIMITATION (the paper reports firing at r/v = 10 ms): at r/v 10 ms the square moves about 5 pixels per frame and the model fires no spike here", fast.spikes.length === 0 && Math.max(...fast.nAct) < 100, "N_act max " + Math.max(...fast.nAct));
}

console.log("\n6. THE LATTICE VARIANT");
{
    const retino = JSON.parse(fs.readFileSync(path.join(HERE, "..", "vendor", "male-cns", "giant-fiber-visual-retinotopy.json"), "utf8"));
    const synth = { cells: [{ type: "LPLC2", side: "R", bodyId: 1, lop: { x: 10, y: 10 } }, { type: "LPLC2", side: "R", bodyId: 2, lop: { x: 12, y: 8 } }, { type: "LPLC2", side: "R", bodyId: 3, lop: { x: 12, y: 12 } }, { type: "LPLC2", side: "R", bodyId: 4, lop: { x: 8, y: 8 } }, { type: "LPLC2", side: "R", bodyId: 5, lop: { x: 8, y: 12 } }, { type: "LPLC2", side: "L", bodyId: 6, lop: { x: 99, y: 99 } }, { type: "LC4", side: "R", bodyId: 7, lop: { x: 1, y: 1 } }, { type: "LPLC2", side: "R", bodyId: 8, lop: null }] };
    const S = M.latticeUnits(synth, { degPerColumn: 5, degPerPixel: 1, frameW: 200, frameH: 150 }), by = (id) => S.units.find((u) => u.bodyId === id);
    ok("!! latticeUnits: only LPLC2 cells of the chosen side with a lobula plate position (5 of the 8 entries); the centre of the five maps to the frame's centre (99.5, 74.5)", S.units.length === 5 && S.dropped === 0 && near(S.center.x0, 10, 1e-9) && near(S.center.y0, 10, 1e-9) && near(by(1).x, 99.5, 1e-9) && near(by(1).y, 74.5, 1e-9));
    ok("!! a unit displaced (+2, -2) lattice units is toward the FRONT (image +x by 2 sqrt 2 x 5 = 14.1 pixels at 1 degree/pixel), (+2, +2) is UP (image y smaller by 14.1), (-2, -2) DOWN, (-2, +2) the BACK; elevation and azimuth are in degrees", near(by(2).x - 99.5, 14.142, 1e-3) && near(by(2).y, 74.5, 1e-3) && near(by(3).y, 74.5 - 14.142, 1e-3) && near(by(3).x, 99.5, 1e-3) && near(by(4).y, 74.5 + 14.142, 1e-3) && near(by(5).x, 99.5 - 14.142, 1e-3) && near(by(2).azimuth, 14.142, 1e-3) && near(by(3).elevation, 14.142, 1e-3));
    const s2 = M.latticeUnits(synth, { degPerColumn: 10, degPerPixel: 1 }), s3 = M.latticeUnits(synth, { degPerColumn: 5, degPerPixel: 1, frameW: 29, frameH: 150 }), sL = M.latticeUnits(synth, { side: "L", degPerPixel: 1 });
    ok("degPerColumn scales the layout (10 doubles the displacement), units outside the frame are dropped and counted, side L picks the left cells, and no matching cell is refused", near(s2.units.find((u) => u.bodyId === 2).x - 99.5, 28.284, 1e-3) && s3.dropped === 2 && s3.units.length === 3 && sL.units.length === 1 && throws(() => M.latticeUnits(synth, { side: "X" })) && throws(() => M.latticeUnits({ cells: [] })));
    const pc = M.populationCentroid([{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: 40 }], [1, 0, 1]);
    ok("populationCentroid is the mean of the active units, and null when none is active", near(pc.x, 10) && near(pc.y, 20) && pc.n === 2 && M.populationCentroid([{ x: 1, y: 1 }], [0]) === null);
    const L = M.latticeUnits(retino), nRight = retino.cells.filter((c) => c.type === "LPLC2" && c.side === "R" && c.lop).length;
    ok("!! on the real file: the right-side LPLC2 cells are placed (all of them accounted for: placed + dropped = the 91 with a lobula plate centroid), the units lie inside the frame", nRight === 91 && L.units.length + L.dropped === nRight && L.units.length > 40 && L.units.every((u) => u.x >= 0 && u.x <= 199 && u.y >= 0 && u.y <= 149), `${L.units.length} placed, ${L.dropped} dropped`);
    const bar = M.runLattice(M.translating({ kind: "bar", direction: "right", bar: 20, frames: 60 }).frames, L.units);
    const th = [0.02, 0.05, 0.1].map((rv) => { const s = M.loomingSquare({ rv }), r = M.runLattice(s.frames, L.units); if (!r.spikes.length) return null; return s.theta[Math.min(s.t.length - 1, Math.floor(r.spikes[0] / 0.01 + 1e-9))]; });
    ok("!! the lattice array is silent for a moving bar, fires for a looming square at r/v 20, 50 and 100 ms at a roughly constant size (coefficient of variation under 0.2, each between 35 and 75 degrees)", Math.max(...bar.nAct) === 0 && bar.spikes.length === 0 && th.every((v) => v !== null) && cv(th) < 0.2 && th.every((v) => v > 35 && v < 75), th.map((v) => v && v.toFixed(1)).join(", ") + ", CV " + (th.every((v) => v) ? cv(th).toFixed(3) : "-"));
    ok("runLattice scales the active count to the pixel-array equivalent: nEff = nAct x (200 x 150 / units)", (() => { const s = M.loomingSquare({ rv: 0.1 }), r = M.runLattice(s.frames, L.units), sc = 30000 / L.units.length; return r.nEff.every((v, i) => near(v, r.nAct[i] * sc, 1e-9)) && Math.max(...r.nAct) > 0; })());
    const errs = [[99.5, 74.5], [60, 60], [140, 90], [100, 40], [50, 110]].map(([cx, cy]) => { const s = M.loomingSquare({ rv: 0.1, cx, cy, startPx: 6, endPx: 90 }), r = M.runLattice(s.frames, L.units), last = [...r.centroids].reverse().find((c) => c); return last ? Math.hypot(last.x - cx, last.y - cy) : 999; });
    ok("!! DIRECTION: the centroid of the active units lands within 20 pixels (about 12 degrees) of the looming's centre at five positions across the field", errs.every((e) => e < 20), errs.map((e) => e.toFixed(1)).join(", ") + " px");
}

console.log("\n6b. THE SURROUND VARIANT (Round 3, detector C)");
{
    const s = M.loomingSquare({ rv: 0.05 }), peak = (p) => Math.max(...M.runStimulus(s.frames, { w: 200, h: 150, params: p }).nAct);
    const base = peak({}), off = peak({ surroundKappa: null }), huge = peak({ surroundKappa: 1e9 }), k0 = peak({ surroundKappa: 0 }), k1 = peak({ surroundKappa: 1 }), kh = peak({ surroundKappa: 0.2 });
    ok("!! surroundKappa null is the plain model, and an enormous kappa never inhibits (the same peak as without)", base > 0 && off === base && huge === base, `${base}, ${off}, ${huge}`);
    ok("!! kappa 0 (any ring motion inhibits) lowers the looming square's peak, and the peak never rises as kappa falls (kappa 0 <= 0.2 <= 1 <= plain)", k0 < base && k0 <= kh && kh <= k1 && k1 <= base, `${k0} <= ${kh} <= ${k1} <= ${base}`);
    ok("a bad kappa (negative) or ring (outer not above 1) is refused", throws(() => M.createModel({ w: 20, h: 20, params: { surroundKappa: -1 } })) && throws(() => M.createModel({ w: 20, h: 20, params: { surroundKappa: 1, surroundOuter: 1 } })));
}

console.log("\n7. THE SOURCE");
{
    const src = fs.readFileSync(path.join(HERE, "flyEmdLplc2Gf.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file or network, no import", !/Math\.random|Date\.now|performance\.now|document\.|window\.|fetch\(|node:|readFileSync|^import\s/m.test(src));
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);
