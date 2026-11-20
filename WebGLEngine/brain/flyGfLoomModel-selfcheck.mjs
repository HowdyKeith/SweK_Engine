// WebGLEngine/brain/flyGfLoomModel-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/flyGfLoomModel-selfcheck.mjs      (about 2 s)
//
// THE GATE OF brain/flyGfLoomModel.mjs: the Giant Fiber looming-input model of Ache et al. 2019 (Curr Biol 29:1073, STAR Methods "GF Model", eq. 1 to 7) held to the paper's own numbers and to the properties the paper states.
//   1 THE CONSTANTS   every constant is the paper's number (C1 0.0002567, d1 0.019, C2 1.7, C3 42, C4 0.52, d2 0.019, C5 -0.53, C6 0.59, C7 66, C8 -11, d3 0.0375, C9 -0.52, C10 26, C11 7.8, d4 0.011, W 1.45 / 1.62 / 2.27 / 1, smoothing 2.5 ms); frozen.
//   2 THE STIMULUS    theta(t) = 2 atan(r/v / |t|) in degrees: 90 degrees at t = -r/v, 42 degrees at -r/v / tan(21), 180 at contact; the angular velocity is the derivative of the size (checked against a finite difference) and reaches about 5,730 degrees/second at the end of a 10 ms loom
//                     (the paper's Figure 3A axis runs to 6,000); loomStimulus starts at theta0, stops at theta1, is 0 before the disk is there and holds after; the constant-velocity stimulus is theta = v t; bad inputs are refused.
//   3 THE COMPONENTS  LC4 is exactly C1 x the (delayed) angular velocity, linear and through the origin (twice the velocity, twice the potential; no velocity, no potential); LPLC2 is a Gaussian in ln theta whose maximum is C2 at theta = 42 degrees and which is symmetric in ln theta;
//                     the tonic inhibition is a sigmoid from +0.058 mV at 5 degrees through the midpoint C5 + C6/2 at 66 degrees to -0.470 mV at 90 degrees, falling with size (the paper's Figure S3C reads about -0.55 at 90 degrees from an exponential fit, so this is checked
//                     for sign, direction and the midpoint, not against that read-off); the LC4-dependent inhibition is a Gaussian with its minimum C9 at 26 degrees; each component is 0 until the stimulus has been on for its own delay.
//   4 THE SUM         V_GF is the weighted sum of the four components; a weight of 0 silences that input; the smoothed response has one sample per time step, keeps a plateau, and rounds a step.
//   5 THE PEAK TIMES  (the paper's Figure 4B logic) for a pure size input the peak (relative to contact) is at -r/v / tan(21) + d2, a pure velocity input at -r/v + d1, and the size input's slope against r/v (-2.605) is steeper than the velocity input's (-1); the full model's peak lies
//                     BETWEEN the two predictions at r/v 10, 20, 40 and 80 ms ("at times intermediate to those predicted by a perfect rho or eta neuron"); silencing LC4 puts it on the size prediction.
// SABOTAGE (2026-11-15, 44 mutants of brain/flyGfLoomModel.mjs, each run alone in a scratch copy): 41 red BY NAME, 3 equivalent and argued: dropping the `on(d)` guard of the LC4 term and of the size term changes nothing because both stimuli already return size 0 and velocity 0 before they start; widening
//   peakTimes' window from 0.05 s to 0.2 s changes nothing because every peak is before +0.05 s. The first pass left one REAL survivor (the Gaussian's denominator 2 C4^2 written as C4^2: nothing checked the width); the width row closes it.
// NOT CHECKED, said plainly: any agreement with the paper's measured traces (R^2 0.78 to 0.86 is the paper's, not re-computed: no trace was digitised); the original MATLAB in ModelDB (Yale SenseLab 230400) was not compared; the full model's peak is close to the size prediction at slow looms (-184 ms against -189 at r/v 80), which
// is what the weights give, not a claim about the figure's plotted control line, whose values were not read off. With the SIZE input silenced the model's peak follows the velocity prediction only for fast looms (r/v 10 and 20): at slow looms the small velocity term is overtaken by the inhibitory terms, so that case is not gated. No spatial term exists in the model.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./flyGfLoomModel.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const K = M.CONSTANTS, DEG = 180 / Math.PI;

console.log("flyGfLoomModel-selfcheck -- the Giant Fiber looming-input model of Ache et al. 2019\n");

console.log("1. THE CONSTANTS");
{
    const paper = { C1: 0.0002567, d1: 0.019, C2: 1.7, C3: 42, C4: 0.52, d2: 0.019, C5: -0.53, C6: 0.59, C7: 66, C8: -11, d3: 0.0375, C9: -0.52, C10: 26, C11: 7.8, d4: 0.011, W_LPLC2: 1.45, W_LC4: 1.62, W_i1: 2.27, W_i2: 1, smoothSeconds: 0.0025 };
    ok("!! every constant is the paper's number (eq. 3 to 7, STAR Methods), and there are no others", Object.keys(paper).every((k) => K[k] === paper[k]) && Object.keys(K).length === Object.keys(paper).length);
    ok("the constants are frozen", Object.isFrozen(K));
}

console.log("\n2. THE STIMULUS");
{
    const rv = 0.02;
    ok("!! theta is 90 degrees at t = -r/v, 42 degrees at t = -r/v / tan(21 degrees), 180 at contact and after", near(M.loomTheta(rv, -rv), 90, 1e-9) && near(M.loomTheta(rv, -rv / Math.tan(21 / DEG)), 42, 1e-9) && M.loomTheta(rv, 0) === 180 && M.loomTheta(rv, 0.1) === 180);
    let worst = 0; for (const t of [-0.5, -0.2, -0.08, -0.03, -0.02, -0.01]) { const h = 1e-7, fd = (M.loomTheta(rv, t + h) - M.loomTheta(rv, t - h)) / (2 * h); worst = Math.max(worst, Math.abs(fd - M.loomThetaDot(rv, t)) / M.loomThetaDot(rv, t)); }
    ok("!! the angular velocity is the derivative of the size (finite difference, relative error under 1e-6)", worst < 1e-6, "worst " + worst.toExponential(1));
    ok("a 10 ms loom reaches 1/rv radians/second = 5,730 degrees/second at the moment the disk reaches 90 degrees (the paper's Figure 3A axis runs to 6,000)", near(M.loomThetaDot(0.01, -0.01), DEG / 0.01, 1e-6));
    const s = M.loomStimulus(0.02);
    ok("!! loomStimulus: starts when the disk is 10 degrees, stops at 90, is 0 before it appears, holds 90 after with no velocity", near(s.theta(s.start), 10, 1e-9) && near(s.theta(s.stop - 1e-9), 90, 1e-4) && s.theta(s.start - 0.001) === 0 && s.thetaDot(s.start - 0.001) === 0 && s.theta(s.stop + 0.5) === 90 && s.thetaDot(s.stop + 0.5) === 0 && s.start < s.stop && near(s.stop, -0.02, 1e-12));
    const s5 = M.loomStimulus(0.02, { theta0: 5, theta1: 90 }); ok("the wild-type control stimulus starts at 5 degrees", near(s5.theta(s5.start), 5, 1e-9) && s5.start < s.start);
    const c = M.constantVelocityStimulus(500);
    ok("the constant-velocity stimulus is theta = v t to 90 degrees (eq. 2): 500 degrees/second reaches 90 in 0.18 s and holds", near(c.theta(0.1), 50, 1e-9) && near(c.stop, 0.18, 1e-12) && c.thetaDot(0.1) === 500 && c.thetaDot(0.2) === 0 && c.theta(1) === 90);
    const bad = (f) => { try { f(); return false; } catch (e) { return /flyGfLoomModel/.test(e.message); } };
    ok("bad inputs are refused by name: r/v not positive or not a number, theta0 not below theta1, theta1 at 180, a non-positive velocity", bad(() => M.loomStimulus(0)) && bad(() => M.loomStimulus(NaN)) && bad(() => M.loomStimulus("a")) && bad(() => M.loomStimulus(0.02, { theta0: 90, theta1: 10 })) && bad(() => M.loomStimulus(0.02, { theta0: 10, theta1: 180 })) && bad(() => M.constantVelocityStimulus(0)) && bad(() => M.constantVelocityStimulus(-5)));
}

console.log("\n3. THE COMPONENTS");
{
    const a = M.constantVelocityStimulus(500), b = M.constantVelocityStimulus(1000);
    const ta = 0.05, ca = M.components(a, ta), cb = M.components(b, ta);
    ok("!! LC4 is exactly C1 x the angular velocity: 500 degrees/second gives 0.12835 mV, 1000 gives twice that (linear), and no velocity gives 0", near(ca.lc4, 0.0002567 * 500, 1e-12) && near(cb.lc4, 2 * ca.lc4, 1e-12) && near(M.components(a, 0.5).lc4, 0, 1e-12) && M.components(a, -1).lc4 === 0);
    // LPLC2 on a slow constant-velocity disk: theta = 100 t; theta(t - d2) = 42 at t = 0.42 + d2
    const s = M.constantVelocityStimulus(100), tpk = 0.42 + K.d2;
    ok("!! LPLC2 is C2 = 1.7 mV at theta = 42 degrees (measured through the delay) and lower on both sides", near(M.components(s, tpk).lplc2, 1.7, 1e-9) && M.components(s, tpk - 0.05).lplc2 < 1.7 && M.components(s, tpk + 0.05).lplc2 < 1.7);
    const up = 100 * (0.42 * Math.exp(0.3) + K.d2) / 100;   // theta = 42 e^0.3 at this time
    ok("!! LPLC2 is symmetric in ln theta: equal at 42 e^0.3 and 42 e^-0.3 degrees", near(M.components(s, 0.42 * Math.exp(0.3) + K.d2).lplc2, M.components(s, 0.42 * Math.exp(-0.3) + K.d2).lplc2, 1e-9) && up > 0);
    ok("!! LPLC2's WIDTH is C4: one C4 away from the peak in ln theta (theta = 42 e^0.52 = 70.6 degrees, or 42 e^-0.52 = 25.0) the potential is C2 exp(-1/2) = 1.031 mV, and two C4 below C2 exp(-2) = 0.230 (14.9 degrees; two above would be past the 90 degrees the disk reaches)", near(M.components(s, 0.42 * Math.exp(K.C4) + K.d2).lplc2, 1.7 * Math.exp(-0.5), 1e-9) && near(M.components(s, 0.42 * Math.exp(-K.C4) + K.d2).lplc2, 1.7 * Math.exp(-0.5), 1e-9) && near(M.components(s, 0.42 * Math.exp(-2 * K.C4) + K.d2).lplc2, 1.7 * Math.exp(-2), 1e-9));
    const at = (th) => M.components(M.constantVelocityStimulus(100), th / 100 + K.d3).i1;   // size th at the moment the delayed size is th
    ok("!! the tonic inhibition is a sigmoid of size: +0.058 mV at 5 degrees, C5 + C6/2 = -0.235 at 66 degrees, -0.470 at 90, falling with size", near(at(5), 0.058, 1e-3) && near(at(66), K.C5 + K.C6 / 2, 1e-9) && near(at(90), -0.470, 1e-3) && at(5) > at(30) && at(30) > at(66) && at(66) > at(90));
    const i2 = (th) => M.components(M.constantVelocityStimulus(100), th / 100 + K.d4).i2;
    ok("!! the LC4-dependent inhibition is a Gaussian of size with its minimum C9 = -0.52 mV at 26 degrees", near(i2(26), -0.52, 1e-9) && i2(26) < i2(10) && i2(26) < i2(50) && near(i2(26 - 5), i2(26 + 5), 1e-9));
    const cs = M.constantVelocityStimulus(100);
    ok("!! each component is 0 until the stimulus has been on for its own delay (LC4 and LPLC2 0.019 s, tonic 0.0375 s, LC4-dependent 0.011 s) and nonzero at it", [["lc4", K.d1], ["lplc2", K.d2], ["i1", K.d3], ["i2", K.d4]].every(([k, d]) => M.components(cs, d - 1e-6)[k] === 0 && M.components(cs, d + 1e-4)[k] !== 0));
}

console.log("\n4. THE SUM");
{
    const s = M.loomStimulus(0.02), t = -0.05, c = M.components(s, t);
    const sum = 1.45 * c.lplc2 + 1.62 * c.lc4 + 2.27 * c.i1 + 1 * c.i2;
    ok("!! V_GF is the weighted sum of the four components (1.45, 1.62, 2.27, 1)", near(M.gfPotential(s, t), sum, 1e-12) && Math.abs(sum) > 0.01);
    ok("!! a weight of 0 silences that input; an override changes only the named weight", near(M.gfPotential(s, t, { weights: { W_LC4: 0 } }), sum - 1.62 * c.lc4, 1e-12) && near(M.gfPotential(s, t, { weights: { W_LPLC2: 0, W_i1: 0, W_i2: 0 } }), 1.62 * c.lc4, 1e-12) && near(M.gfPotential(s, t, { weights: { W_i2: 2 } }), sum + c.i2, 1e-12));
    const r = M.gfResponse(s, { t0: -0.3, t1: 0.0, dt: 0.0005 });
    ok("the response has one sample per step and its parts add up to the unsmoothed sum", r.t.length === r.v.length && r.t.length === Math.floor(0.3 / 0.0005) + 1 && near(r.t[1] - r.t[0], 0.0005, 1e-12) && r.parts.lc4.length === r.t.length);
    const flat = M.gfResponse(M.constantVelocityStimulus(1), { t0: 1, t1: 1.2, dt: 0.0005 });   // a very slow disk: the components barely change over 0.2 s, so smoothing keeps the plateau
    const raw = flat.t.map((x) => M.gfPotential(M.constantVelocityStimulus(1), x));
    ok("smoothing keeps a plateau (a very slow disk's smoothed potential equals the raw one within 1e-4 mV) and rounds a step (the smoothed step's largest sample-to-sample change is smaller than the raw step's)", Math.max(...flat.v.map((x, i) => Math.abs(x - raw[i]))) < 1e-4 && (() => { const st = M.gfResponse(M.constantVelocityStimulus(1e6), { t0: 0, t1: 0.2, dt: 0.0005 }); let rawJump = 0, smJump = 0; const rr = st.t.map((x) => M.gfPotential(M.constantVelocityStimulus(1e6), x)); for (let i = 1; i < rr.length; i++) { rawJump = Math.max(rawJump, Math.abs(rr[i] - rr[i - 1])); smJump = Math.max(smJump, Math.abs(st.v[i] - st.v[i - 1])); } return smJump < rawJump; })());
    ok("peak() finds the maximum and answers null for an empty response", (() => { const p = M.peak({ t: [0, 1, 2], v: [0, 3, 1] }); return p.t === 1 && p.v === 3; })() && M.peak({ t: [], v: [] }) === null && M.peak(null) === null);
}

console.log("\n5. THE PEAK TIMES (Figure 4B logic)");
{
    const rvs = [0.01, 0.02, 0.04, 0.08], tolMs = 0.5;
    const pureEta = M.peakTimes(rvs, { weights: { W_LC4: 0, W_i1: 0, W_i2: 0 } }), pureRho = M.peakTimes(rvs, { weights: { W_LPLC2: 0, W_i1: 0, W_i2: 0 } });
    const predEta = rvs.map((r) => -r / Math.tan(21 / DEG) + K.d2), predRho = rvs.map((r) => -r + K.d1);
    ok("!! a pure size input peaks at -r/v / tan(21 degrees) + d2 of contact (within 0.5 ms) at r/v 10, 20, 40, 80 ms", pureEta.every((p, i) => Math.abs(p.t - predEta[i]) * 1000 < tolMs), pureEta.map((p) => (p.t * 1000).toFixed(1)).join(", "));
    ok("!! a pure velocity input peaks at -r/v + d1 of contact (within 0.5 ms), less half the smoothing window: its potential ends in a sharp step when the disk stops, and the 2.5 ms centred moving average puts the peak 1.25 ms before that edge", pureRho.every((p, i) => Math.abs(p.t - (predRho[i] - K.smoothSeconds / 2)) * 1000 < tolMs), pureRho.map((p) => (p.t * 1000).toFixed(1)).join(", "));
    const slope = (ps) => (ps[3].t - ps[0].t) / (rvs[3] - rvs[0]);
    ok("!! the size input's slope against r/v (-2.605) is steeper than the velocity input's (-1): the paper's reason a perfect eta neuron differs from a perfect rho neuron", near(slope(pureEta), -1 / Math.tan(21 / DEG), 0.02) && near(slope(pureRho), -1, 0.02) && slope(pureEta) < slope(pureRho));
    const full = M.peakTimes(rvs);
    ok("!! the FULL model's peak lies between the velocity prediction and the size prediction at every r/v (\"intermediate\", the paper's statement), strictly", full.every((p, i) => p.t < predRho[i] && p.t > predEta[i] - 0.005 && p.t - predEta[i] > -0.005 && p.t > Math.min(predEta[i], predRho[i]) - 0.005 && p.t < predRho[i]), full.map((p) => (p.t * 1000).toFixed(0)).join(", "));
    const noLc4 = M.peakTimes(rvs, { weights: { W_LC4: 0 } });
    ok("!! silencing LC4 puts the peak on the size prediction (within 4 ms) at every r/v; silencing the SIZE input follows the velocity prediction at the fast looms r/v 10 and 20 (within 4 ms)", noLc4.every((p, i) => Math.abs(p.t - predEta[i]) * 1000 < 4) && (() => { const nl = M.peakTimes([0.01, 0.02], { weights: { W_LPLC2: 0 } }); return Math.abs(nl[0].t - predRho[0]) * 1000 < 4 && Math.abs(nl[1].t - predRho[1]) * 1000 < 4; })(), noLc4.map((p) => (p.t * 1000).toFixed(1)).join(", "));
    ok("the peak potential of the full model is a few millivolts (2.5 to 3.3 mV at r/v 10 to 80; the paper's control responses peak at 3 to 5 mV for the LC11 control, Figure 2E)", full.every((p) => p.v > 2 && p.v < 4), full.map((p) => p.v.toFixed(2)).join(", "));
    ok("the report lines print the equation and the four peak times", M.reportLines().length === 2 && /Ache et al. 2019/.test(M.reportLines()[0]));
}

console.log("\n6. THE SOURCE");
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "flyGfLoomModel.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file, no network, no import", !/Math\.random|Date\.now|performance\.now|document\.|window\.|fetch\(|node:|readFileSync|^import\s/m.test(src));
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);
