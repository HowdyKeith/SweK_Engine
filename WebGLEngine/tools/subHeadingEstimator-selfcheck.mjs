// WebGLEngine/tools/subHeadingEstimator-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/subHeadingEstimator-selfcheck.mjs      (~60 s)
//
// THE GATE OF tools/subHeadingEstimator.mjs (the reservoir estimator: record, ridge fit, score, the estimator in the loop), tools/ship/subEstimatorStudy.mjs (the registered study: verdict, report, command) and tools/ship/subEstimatorStudyCmd.mjs, the study of
// brain/SUBMARINE_WIP.md "THE ESTIMATOR" and its AMENDMENT. Every number is worked out by hand on small fixtures:
//   RIDGE.     [[2,1],[1,2]] x = [3,3] is solved by [1,1]; with lambda 1 ([[3,1],[1,3]]) by [0.75, 0.75]; [[1,2],[2,1]] (eigenvalues 3 and -1) is refused at lambda 0 and solved at lambda 2 ([[3,2],[2,3]] x = [3,3] -> [0.6, 0.6]).
//   SPECTRAL RADIUS. A two-cell loop with counts 3 and 12 has the eigenvalues +-6 (sqrt(36)); inhibitory on one side, +-6i (the same modulus); a chain has 0; a triangle with counts 2, 3, 4 has 24^(1/3) = 2.884499.
//   THE RESERVOIR. On the two-cell loop at radius 0.9 the gain is g = 0.9 / 6 = 0.15; a pulse d into cell 0 comes back after two ticks as g x 3 x d x g x 12 = 0.81 d (0.9^2): 0.45 d on cell 1 after one. With cell 1 inhibitory the return is relu(-) = 0.
//   THE LEAKY UNIT. Fed 1, 0, 0 at sigma 0.5 it reads 1, 0.5, 0.25. Normal equations of its reading [g, 1] against cum = [1, 2, 3]: A = [[1.3125, 1.75], [1.75, 3]], b = [2.75, 6].
//   THE SCORE. Six ticks fed 0.1 0.2 0.4 0.8 1.0 2.0, valid 1 1 0 0 1 0, delta 0 0 0.25 0.5 0 1.5, a readout that reads the input (cum_hat = the input): the estimate is held at the last valid tick (0.2, then 1.0), so delta_hat = 0.2, 0.6, 1.0 against 0.25, 0.5, 1.5 -> squared errors 0.0025,
//   0.01, 0.25; a second dive fed 1, 3, 5, valid 0 0 1, delta 0.5 1 0 (it STARTS dark: the estimate is held at its first tick) gives delta_hat 0, 2 against 0.5, 1 -> 0.25, 1. Five dark ticks in all, sum of squares 1.5125, RMSE sqrt(0.3025) = 0.55; saying zero: sqrt(3.8125 / 5) = 0.873212.
//   THE LOOP. The pure integrator (a unit with sigma 1 read at 0.2 / 30) is the heading rate integrated by the Riemann sum, so in the loop it is the oracle navigator to within 1e-3 of a score. By hand on level states yawing 0.1 rad/s (w_z = -0.1; the input is 0.1 / 0.2 = 0.5 a tick): reading 0.5, 1.0, 1.5 held 0.5 at the last valid tick, the inner pilot is handed
//   the shown heading 0.3 turned by 0, 0.5, 1.0.
//   THE VERDICT. Family RMSE 0.20 0.22 0.18 0.20 has mean 0.20 and sd 0.01633, so a win needs max(0.02, 0.03266): cx at 0.10 wins (margin 0.10), at 0.17 does not (margin 0.03 < 0.03266).
//
// SABOTAGED -- (the log is written below when the sabotage has run)
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as E from "./subHeadingEstimator.mjs";
import * as ST from "./ship/subEstimatorStudy.mjs";
import * as N from "./subNavigator.mjs";
import * as D from "./subDropout.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "../brain/subTask.mjs";
import * as A from "../brain/autopilotSub.mjs";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as L from "./ship/trainSubState.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const val = (f) => { try { return f(); } catch (e) { return "THREW " + String(e.message || e).slice(0, 100); } };
const guarded = async (name, f) => { try { await f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const J = (v) => JSON.stringify(v), near = (a, b, tol) => Math.abs(a - b) <= tol, nearAll = (a, b, tol) => a.length === b.length && a.every((v, i) => near(v, b[i], tol));
console.log("subHeadingEstimator-selfcheck -- the reservoir estimator and its study\n");

const model6 = S.createSubModel(), mk = (o) => S.createState({ model: model6, ...o });
const cellsOf = (...nts) => nts.map((nt, i) => ({ id: i, layer: i, nt }));
const loop = (nt1 = "Exc", sg = 1) => ({ neurons: cellsOf("Exc", nt1), edges: [[0, 1, 3, 1], [1, 0, 12, sg]], io: { inputs: [0], outputs: [1] } });
const chain = { neurons: cellsOf("Exc", "Exc", "Exc"), edges: [[0, 1, 3, 1], [1, 2, 4, 1]], io: { inputs: [0], outputs: [2] } };
const tri = { neurons: cellsOf("Exc", "Exc", "Exc"), edges: [[0, 1, 2, 1], [1, 2, 3, 1], [2, 0, 4, 1]], io: { inputs: [0], outputs: [2] } };
const f32 = (a) => Float32Array.from(a);
// a dive of the leaky-unit fixtures: ticks, the input in slot 5, valid, delta, oracle, cum
const dive = (x5, valid, delta, oracle, cum) => { const n = x5.length, X = new Float32Array(n * 15); x5.forEach((v, t) => { X[t * 15 + 5] = v; X[t * 15 + 14] = valid[t]; }); return { ticks: n, X, cum: f32(cum || new Array(n).fill(0)), delta: f32(delta), oracle: f32(oracle), valid: Uint8Array.from(valid) }; };

sec("1. ridge regression, worked by hand");
await guarded("section 1", async () => {
    const A2 = Float64Array.from([2, 1, 1, 2]), b2 = Float64Array.from([3, 3]);
    ok("[[2,1],[1,2]] x = [3,3] is solved by [1,1] (to 1e-12); with lambda 1 by [0.75, 0.75]", nearAll(Array.from(E.ridgeSolve(A2, b2, 2, 0)), [1, 1], 1e-12) && nearAll(Array.from(E.ridgeSolve(A2, b2, 2, 1)), [0.75, 0.75], 1e-12));
    const Ab = Float64Array.from([1, 2, 2, 1]), e = throws(() => E.ridgeSolve(Ab, b2, 2, 0));
    ok("a matrix that is not positive definite (eigenvalues 3 and -1) is refused by name at lambda 0 and solved at lambda 2 ([[3,2],[2,3]] x = [3,3] -> [0.6, 0.6])", e !== null && /^subHeadingEstimator\.ridgeSolve: the matrix is not positive definite at row 1/.test(e) && nearAll(Array.from(E.ridgeSolve(Ab, b2, 2, 2)), [0.6, 0.6], 1e-12), e || "did not throw");
    const A3 = Float64Array.from([4, 2, 0, 2, 5, 1, 0, 1, 3]), x3 = [1, -2, 3], b3 = Float64Array.from([4 * 1 + 2 * -2, 2 * 1 + 5 * -2 + 3, -2 + 9]), sol = E.ridgeSolve(A3, b3, 3, 0);
    ok("a 3 x 3 system with a known answer ([1, -2, 3]) is solved to 1e-12 (the substitution runs both ways)", nearAll(Array.from(sol), x3, 1e-12), J(Array.from(sol)));
});

sec("2. the spectral radius and the reservoir, worked by hand");
await guarded("section 2", async () => {
    const sr = (c) => E.spectralRadius(CS.reservoirOf(c));
    ok("a two-cell loop with counts 3 and 12: radius 6 (to 1e-6); inhibitory on one side (eigenvalues +-6i): 6 again; a chain (nilpotent): 0; a triangle with counts 2, 3, 4: 24^(1/3) = 2.884499 (to 1e-5)", near(sr(loop()), 6, 1e-6) && near(sr(loop("Inh", -1)), 6, 1e-6) && sr(chain) === 0 && near(E.spectralRadius(CS.reservoirOf(tri), 3000), Math.cbrt(24), 1e-5), J([sr(loop()), sr(loop("Inh", -1)), sr(chain), sr(tri)]));
    const real = L.loadCircuit(), rcx = E.spectralRadius(CS.reservoirOf(real));
    ok("the vendored heading loop: spectral radius 584.36 (to 0.01), the same from a shorter run (steps 1000): it is a real dominant eigenvalue", near(rcx, 584.36, 0.01) && near(E.spectralRadius(CS.reservoirOf(real), 1000), rcx, 1e-6), String(rcx));
    const P = CS.createStatePolicy(loop(), "x"), win = P.handWeights(), drive = Math.abs(win[5]), x = new Float64Array(15); x[5] = Math.sign(win[5]);
    const M = E.circuitModel(loop(), 0.9); let h = M.init(); const hs = [];
    for (let t = 0; t < 3; t++) { h = M.step(h, t === 0 ? x : new Float64Array(15)); hs.push(Array.from(h)); }
    ok("the two-cell loop at radius 0.9: a pulse of " + drive.toFixed(4) + " into cell 0 reads [d, 0], then [0, 0.45 d] (g 3 d, g = 0.15), then [0.81 d, 0] -- it returns after two ticks scaled by the radius squared (1e-9); the model reports rho 6 and reads 2 numbers (the output cell and a constant)",
        nearAll(hs[0], [drive, 0], 1e-9) && nearAll(hs[1], [0, 0.45 * drive], 1e-9) && nearAll(hs[2], [0.81 * drive, 0], 1e-9) && near(M.rho, 6, 1e-6) && M.n === 2, J(hs));
    const Mi = E.circuitModel(loop("Inh", -1), 0.9); let hi = Mi.init(); const his = []; for (let t = 0; t < 3; t++) { hi = Mi.step(hi, t === 0 ? x : new Float64Array(15)); his.push(Array.from(hi)); }
    ok("with cell 1 inhibitory the return is cut by the relu: the pulse reads [d, 0], [0, 0.45 d], [0, 0] (cell 0 is driven below zero and is silent)", nearAll(his[0], [drive, 0], 1e-9) && nearAll(his[1], [0, 0.45 * drive], 1e-9) && nearAll(his[2], [0, 0], 1e-12), J(his));
    const Mn = E.circuitModel(loop(), 0.9, false); let hn = Mn.init(); hn = Mn.step(hn, x); const hn2 = Mn.step(hn, new Float64Array(15));
    ok("NO STATE: the pulse is not carried -- [d, 0] and then [0, 0] -- and its radius is irrelevant", nearAll(Array.from(hn), [drive, 0], 1e-9) && nearAll(Array.from(hn2), [0, 0], 1e-12));
    const z = new Float64Array(2); M.read(z, Float64Array.from([5, 7]));
    ok("the reading is the output cells plus a constant 1: cell 1's 7 and 1", J(Array.from(z)) === "[7,1]" && E.circuitModel(real, 0.9).n === 65);
    // a five-cell circuit with mixed signs against a naive dense implementation
    const five = { neurons: cellsOf("Exc", "Inh", "Exc", "Inh", "Exc"), edges: [[0, 1, 5, 1], [1, 2, 2, -1], [2, 3, 7, 1], [3, 4, 1, -1], [4, 0, 4, 1], [0, 3, 3, 1], [2, 1, 6, 1], [4, 2, 2, 1]], io: { inputs: [0, 2], outputs: [3, 4] } };
    const Pf = CS.createStatePolicy(five, "f"), wf = Pf.handWeights(), Rf = CS.reservoirOf(five), Mf = E.circuitModel(five, 0.99), g = 0.99 / Mf.rho;
    const dense = (hPrev, xv) => { const o = new Array(5).fill(0); for (let k = 0; k < Rf.E; k++) o[Rf.to[k]] += g * Rf.sign[k] * Rf.mag[k] * hPrev[Rf.from[k]]; Rf.inputs.forEach((cell, a) => { let s = 0; for (let f = 0; f < 15; f++) s += wf[a * 15 + f] * xv[f]; o[cell] += s; }); return o.map((v) => (v > 0 ? v : 0)); };
    let hd = new Array(5).fill(0), hm = Mf.init(), worst = 0, seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let t = 0; t < 8; t++) { const xv = Array.from({ length: 15 }, () => (rnd() - 0.5) * 2); hd = dense(hd, xv); hm = Mf.step(hm, xv); worst = Math.max(worst, ...hd.map((v, i) => Math.abs(v - hm[i]))); }
    ok("a five-cell circuit with mixed signs and eight edges, eight ticks of random input: the model equals a plain dense h' = relu(W_in x + g M h) to 1e-12 (the largest difference: " + worst.toExponential(1) + ")", worst < 1e-12 && Mf.rho > 0);
});

sec("3. the leaky unit, the normal equations, the score and the fit, worked by hand");
await guarded("section 3", async () => {
    const leaky = E.leakyModel(0.5); let g = leaky.init(); const gs = [];
    for (const v of [1, 0, 0]) { const x = new Float64Array(15); x[5] = v; g = leaky.step(g, x); gs.push(g[0]); }
    ok("a leaky unit at sigma 0.5 fed 1, 0, 0 reads 1, 0.5, 0.25; read as [g, 1]", nearAll(gs, [1, 0.5, 0.25], 1e-12) && leaky.n === 2);
    const d1 = dive([1, 0, 0], [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 2, 3]), ne = E.normalEquations(leaky, [d1]);
    ok("normal equations of [g, 1] against cum = [1, 2, 3]: A = [[1.3125, 1.75], [1.75, 3]], b = [2.75, 6] over 3 ticks (1e-9)", nearAll(Array.from(ne.A), [1.3125, 1.75, 1.75, 3], 1e-9) && nearAll(Array.from(ne.b), [2.75, 6], 1e-9) && ne.ticks === 3, J(Array.from(ne.A)));
    const sigma0 = E.leakyModel(0), a = dive([0.1, 0.2, 0.4, 0.8, 1.0, 2.0], [1, 1, 0, 0, 1, 0], [0, 0, 0.25, 0.5, 0, 1.5], [0, 0, 0.26, 0.5, 0, 1.48]), b = dive([1, 3, 5], [0, 0, 1], [0.5, 1, 0], [0.5, 1, 0]);
    const sc = E.scoreReadouts(sigma0, [Float64Array.from([1, 0]), Float64Array.from([0, 0])], [a, b]);
    ok("the score by hand: the estimate is held at the last valid tick (and at the first tick of a dive that starts dark): delta_hat 0.2, 0.6, 1.0 and 0, 2 -> sum of squares 1.5125 over 5 dark ticks; the readout that says 0 scores 3.8125 (= the size of delta); the oracle's miss 0.0005 (1e-6)",
        near(sc.sumSq[0], 1.5125, 1e-6) && near(sc.sumSq[1], 3.8125, 1e-6) && sc.dark === 5 && near(sc.none, 3.8125, 1e-6) && near(sc.oracle, 0.0005, 1e-6), J([Array.from(sc.sumSq), sc.dark, sc.none, sc.oracle]));
    ok("RMSE 0.55 (sqrt(0.3025)); referenceScores gives the same none and oracle RMSEs by themselves (0.873212 and sqrt(0.0001) = 0.01)", near(E.rmseOf(sc.sumSq[0], sc.dark), 0.55, 1e-6) && near(E.referenceScores([a, b]).none, Math.sqrt(0.7625), 1e-6) && near(E.referenceScores([a, b]).oracle, 0.01, 1e-6) && E.referenceScores([a, b]).darkTicks === 5 && E.rmseOf(1, 0) === null);
    const fitx = { setting: 0, lambda: 0, readout: [1, 0] }, fs = E.scoreFit(() => sigma0, fitx, [a, b]);
    ok("scoreFit: rmse 0.55, none 0.873212, skill 1 - 0.55 / 0.873212 = 0.370145, 5 dark ticks (1e-6)", near(fs.rmse, 0.55, 1e-6) && near(fs.none, Math.sqrt(0.7625), 1e-6) && near(fs.skill, 1 - 0.55 / Math.sqrt(0.7625), 1e-6) && fs.darkTicks === 5);
    ok("a dive with no dark tick scores nothing (RMSE null, skill null) and does not divide by zero", E.scoreFit(() => sigma0, fitx, [dive([1, 2], [1, 1], [0, 0], [0, 0])]).rmse === null && E.scoreFit(() => sigma0, fitx, [dive([1, 2], [1, 1], [0, 0], [0, 0])]).skill === null);
    // the fit: a target that IS the leaky unit at sigma 0.5; the fit must find sigma 0.5 and the readout [1, 0]
    let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const synth = () => { const n = 40, x5 = Array.from({ length: n }, () => rnd() * 2 - 1), cum = [], valid = Array.from({ length: n }, (_, t) => (t >= 10 && t < 25 ? 0 : 1)); let gg = 0; x5.forEach((v) => { gg = 0.5 * gg + v; cum.push(gg); }); const delta = cum.map((c, t) => (valid[t] ? 0 : c - cum[9])); return dive(x5, valid, delta, delta, cum); };
    const fitD = [synth(), synth(), synth()], selD = [synth(), synth()], ft = E.fitModel((s) => E.leakyModel(s), [0.25, 0.5, 0.75], E.LAMBDAS, fitD, selD);
    ok("the fit finds the leak that made the target: of sigma 0.25, 0.5, 0.75 and five lambdas (15 candidates) it chooses 0.5 with the smallest lambda, the readout [1, 0] (1e-3) and a selection RMSE under 1e-3", ft.setting === 0.5 && ft.lambda === 1e-6 && ft.candidates.length === 15 && near(ft.readout[0], 1, 1e-3) && near(ft.readout[1], 0, 1e-3) && ft.selRmse < 1e-3, J([ft.setting, ft.lambda, ft.readout, ft.selRmse]));
    const sc2 = E.scoreFit((s) => E.leakyModel(s), ft, selD);
    ok("and it scores the same dives it was chosen on at skill above 0.999", sc2.skill > 0.999, String(sc2.skill));
    const tie = E.fitModel(() => E.leakyModel(0.5), [0.1, 0.2], [1e-6], fitD, selD);
    ok("ties go to the first (the smaller) setting: two settings that are the same model choose the first", tie.setting === 0.1);
    const nanModel = { n: 2, init: () => new Float64Array(1), step: () => Float64Array.from([NaN]), read(out) { out[0] = NaN; out[1] = 1; } };
    const mixed = E.fitModel((s) => (s === 1 ? nanModel : E.leakyModel(0.5)), [1, 0.5], [1e-6, 1], fitD, selD), onlyNan = E.fitModel(() => nanModel, [1], [1e-6], fitD, selD);
    ok("a setting whose activity overflows (NaN) scores Infinity and is never chosen when another is usable; if every setting overflows the fit still returns (RMSE Infinity, a zero readout) and does not throw",
        mixed.setting === 0.5 && mixed.candidates.filter((c) => c.setting === 1).every((c) => c.rmse === Infinity) && onlyNan.selRmse === Infinity && J(onlyNan.readout) === "[0,0]", J(mixed.candidates.slice(0, 2)));
});

sec("4. the senses and the recorded dives");
await guarded("section 4", async () => {
    const x = new Float64Array(15).fill(9), ye = mk({ heading: 0.7, w: [0, 0, -0.1] });
    E.sensesInto(x, ye, { depth: 30, heading: 0, speed: 2 }, [0, 0, 0], true);
    ok("the senses are the heading rate over 0.2 in slot 5 (0.1 / 0.2 = 0.5) and the compass flag in slot 14 (1 valid, 0 dark); every other slot is 0 whatever the state", near(x[5], 0.5, 1e-9) && x[14] === 1 && x.every((v, i) => i === 5 || i === 14 || v === 0) && E.sensesInto(new Float64Array(15), ye, {}, [0, 0, 0], false)[14] === 0);
    const deep = mk({ heading: 0.7, depth: 80, speed: 4, pitch: 0.1, w: [0, 0, -0.1] }), y = E.sensesInto(new Float64Array(15), deep, {}, [0, 0, 0], true);
    ok("depth, speed and pitch do not enter: a deeper, faster, pitched vessel with the same turn reads slot 5 = 0.1 / cos(0.1) / 0.2 = " + (0.1 / Math.cos(0.1) / 0.2).toFixed(5) + " (the heading rate, not the body rate); and a rate of 5 is clamped to 15 (25), -5 to -15",
        near(y[5], 0.1 / Math.cos(0.1) / 0.2, 1e-6) && E.sensesInto(new Float64Array(15), mk({ w: [0, 0, -5] }), {}, [0, 0, 0], true)[5] === 15 && E.sensesInto(new Float64Array(15), mk({ w: [0, 0, 5] }), {}, [0, 0, 0], true)[5] === -15);
    const set = T.TRAIN_SET.slice(0, 2), rec = E.recordSet(set), ref = D.dropout(A.pilot()), logs = [];
    for (const sc of set) { T.fly((st, tg, c) => ref(st, tg, c), sc); logs.push(Array.from(ref.log.valid)); }
    ok("two real dives recorded: 1800 ticks each, 960 dark ticks each, and the dark ticks are exactly the windows the plain dropout draws on the same two dives in the same order", rec.length === 2 && rec.every((d, i) => d.ticks === 1800 && d.valid.reduce((s, v) => s + (v ? 0 : 1), 0) === 960 && J(Array.from(d.valid)) === J(logs[i])));
    let worst = 0, cumWorst = 0, offSlot = 0, flagBad = 0, deltaOnValid = 0;
    for (const d of rec) {
        let tw = 0; for (let t = 0; t < d.ticks; t++) {
            if (d.valid[t] === 1) { tw = t; deltaOnValid = Math.max(deltaOnValid, Math.abs(d.delta[t])); } else { worst = Math.max(worst, Math.abs(d.oracle[t] - d.delta[t])); cumWorst = Math.max(cumWorst, Math.abs(d.cum[t] - d.cum[tw] - d.delta[t])); }
            for (let f = 0; f < 15; f++) if (f !== 5 && f !== 14 && d.X[t * 15 + f] !== 0) offSlot++;
            if (d.X[t * 15 + 14] !== d.valid[t]) flagBad++;
        }
    }
    ok("the record is consistent: delta is 0 on valid ticks; on dark ticks the oracle's estimate is within 3e-3 of delta (the largest " + worst.toExponential(1) + ") and delta equals cum(t) - cum(last valid) to 1e-4 (the largest " + cumWorst.toExponential(1) + "); the compass flag in slot 14 is the valid flag; no slot but 5 and 14 is ever non-zero",
        deltaOnValid === 0 && worst < 3e-3 && cumWorst < 1e-4 && flagBad === 0 && offSlot === 0 && rec.every((d) => d.cum[0] === 0));
    ok("the dives were flown with the oracle behind the dropout, so they are well flown: the second dive's heading changes by less than pi over the dive (cum stays finite and within +-4)", rec.every((d) => Array.from(d.cum).every((v) => Number.isFinite(v) && Math.abs(v) < 4)));
});

sec("5. the estimator in the loop");
await guarded("section 5", async () => {
    const integ = E.leakyModel(1), ro = Float64Array.from([0.2 / 30, 0]), tg = { depth: 30, heading: 0, speed: 2 }, cur = [0, 0, 0], seen = [];
    const inner = (st) => { seen.push({ st, h: S.attitude(st).heading }); return { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }; };
    const est = E.estimatorPilot(integ, Float64Array.from([1, 0]), inner), lvl = () => mk({ heading: 0.3, w: [0, 0, -0.1] });
    const v1 = lvl(); est(v1, tg, cur, { compassValid: 1 }); est(lvl(), tg, cur, { compassValid: 0 }); est(lvl(), tg, cur, { compassValid: 0 });
    ok("by hand: level states yawing 0.1 rad/s read 0.5, 1.0, 1.5 (the unit integrates 0.1 / 0.2 a tick); the first (valid) tick holds 0.5 and is handed the state itself; the two dark ticks are handed the shown heading 0.3 turned by 0.5 and 1.0: 0.8 and 1.3 (1e-9)",
        seen.length === 3 && seen[0].st === v1 && near(seen[0].h, 0.3, 1e-9) && near(seen[1].h, 0.8, 1e-9) && near(seen[2].h, 1.3, 1e-9) && near(est.last.estimate, 1.0, 1e-9), J(seen.map((s) => +s.h.toFixed(4))));
    const t2 = { depth: 30, heading: 0, speed: 2 }; est(lvl(), t2, cur, { compassValid: 0 }); est(lvl(), t2, cur, { compassValid: 0 });
    ok("a NEW target object is a new dive: the unit and the held estimate start again, so its first dark tick (no valid tick behind it) holds its own reading and turns the world by 0 (0.3), the next by 0.5 (0.8)", near(seen[3].h, 0.3, 1e-9) && near(seen[4].h, 0.8, 1e-9));
    const bare = []; const e2 = E.estimatorPilot(integ, Float64Array.from([1, 0]), (st, t, c, aux) => { bare.push(aux); return {}; }); e2(lvl(), tg, cur); e2(lvl(), tg, cur);
    ok("with no 4th argument the compass is read as valid (a pass-through each time, the world untouched)", bare.length === 2 && bare.every((a) => a === null));
    const set = T.TRAIN_SET.filter((d, i) => i % 13 === 0).slice(0, 3), mkpilot = () => D.dropout(E.estimatorPilot(integ, ro, A.pilot()));
    const sInt = T.evaluate(mkpilot(), set).score, sNav = T.evaluate(D.dropout(N.navigator(A.pilot())), set).score, sDrop = T.evaluate(D.dropout(A.pilot()), set).score, sClean = T.evaluate(A.pilot(), set).score;
    ok("a pure integrator of the heading rate in the loop flies the three dives within 1e-3 of the clean autopilot (" + sInt.toFixed(5) + " vs " + sClean.toFixed(5) + ") and 0.1 above the autopilot through the dropout (" + sDrop.toFixed(5) + "); the oracle navigator scores " + sNav.toFixed(5), Math.abs(sInt - sClean) < 1e-3 && sInt > sDrop + 0.05 && Math.abs(sInt - sNav) < 1e-3);
    let worst = 0, darkN = 0; const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    for (const sc of set) {
        const ep = E.estimatorPilot(integ, ro, A.pilot()), tr = { h: 0 };
        const spy = (st, tgt, c, aux) => { const cmd = ep(st, tgt, c, aux); if (aux && aux.compassValid === 0) { worst = Math.max(worst, Math.abs(ep.last.estimate - wrapA(tr.h - S.attitude(st).heading))); darkN++; } return cmd; };
        const w = D.dropout(spy); T.fly((st, tgt, c) => { tr.h = S.attitude(st).heading; return w(st, tgt, c); }, sc);
    }
    ok("the pure integrator's estimate is within 5e-3 rad of the true drift (true heading minus the shown one) at every dark tick of the three dives (the largest " + worst.toExponential(1) + ")", worst < 5e-3 && darkN === 2880);
});

sec("6. the study: the verdict, the report and the command");
await guarded("section 6", async () => {
    const vals = [0.2, 0.3, 0.4];
    ok("beatsLower by hand: values 0.2, 0.3, 0.4 (mean 0.3, sd 0.1): cx at 0.05 wins (margin 0.25 > 0.2), at 0.15 does not (0.15), at 0.10 does not (0.20 is not above 0.20); sd 0: a mean of 1 needs 0.1 -- 0.89 wins, 0.9 does not (the margin must be ABOVE the need)",
        ST.beatsLower(0.05, vals).wins && !ST.beatsLower(0.15, vals).wins && !ST.beatsLower(0.1, vals).wins && near(ST.beatsLower(0.05, vals).needs, 0.2, 1e-12) && near(ST.beatsLower(0.05, vals).m, 0.3, 1e-12) && ST.beatsLower(0.89, [1, 1, 1]).wins && !ST.beatsLower(0.9, [1, 1, 1]).wins);
    const sk = (v) => ({ audit: v[0], safetyAudit: v[1], reserve: v[2] });
    const rec = (family, index, rm, skill = [0.1, 0.1, 0.1], closed = null) => ({ spec: family === "cx" ? "cx" : `${family}:${index}`, family, index, rho: 584.36, chosen: { radius: 0.99, lambda: 1, selRmse: 0.2 }, scores: Object.fromEntries(L.AUDITS.map((a, i) => [a, { rmse: rm[i], skill: skill[i], none: 0.3 }])), closedLoop: closed ? sk(closed) : null });
    const fam = (f, base, skill) => [0, 1, 2, 3].map((i) => rec(f, i, [base + [0, 0.02, -0.02, 0][i], base + [0, 0.02, -0.02, 0][i], base + [0, 0.02, -0.02, 0][i]], skill));
    const ER = fam("er", 0.20), LAYER = fam("layer", 0.21), DEGREE = fam("degree", 0.22);
    const all = (cx, extra = []) => [cx, ...ER, ...LAYER, ...DEGREE, ...extra];
    const pass = ST.verdictOf(all(rec("cx", 0, [0.10, 0.10, 0.10])));
    ok("PASS: a cx at 0.10 (the families at 0.20, 0.21, 0.22, sd 0.01633) beats ER, TYPE-BLOCK and DEGREE on all three audits; the strongest family on each audit is ER, the lowest mean", pass.verdict === "PASS" && /cx beats ER, TYPE-BLOCK and DEGREE on all three audits/.test(pass.why) && J(pass.strongest) === J({ audit: "er", safetyAudit: "er", reserve: "er" }) && near(pass.families.er.audits.audit.m, 0.2, 1e-12) && near(pass.families.er.audits.audit.s, Math.sqrt(0.0008 / 3), 1e-9), pass.verdict + " " + pass.why);
    const btw = ST.verdictOf(all(rec("cx", 0, [0.10, 0.10, 0.19]))), fail = ST.verdictOf(all(rec("cx", 0, [0.30, 0.30, 0.30]))), edge = ST.verdictOf(all(rec("cx", 0, [0.17, 0.17, 0.17])));
    ok("IN BETWEEN: a cx that beats the strongest family on two audits and not the third (0.19 against 0.20: margin 0.01 < 0.03266); FAIL: a cx at 0.30 wins on 0 of 3; and at 0.17 the margin 0.03 is under the need 0.03266 against ER: wins on 0 of 3, FAIL",
        btw.verdict === "IN BETWEEN" && /at least two/.test(btw.why) && fail.verdict === "FAIL" && /wins on 0 of 3 audits/.test(fail.why) && edge.verdict === "FAIL");
    const few = ST.verdictOf([rec("cx", 0, [0.1, 0.1, 0.1]), ...ER, ...LAYER.slice(0, 2), ...DEGREE]), nocx = ST.verdictOf([...ER, ...LAYER, ...DEGREE]), three = ST.verdictOf([rec("cx", 0, [0.1, 0.1, 0.1]), ...ER.slice(0, 3), ...LAYER.slice(0, 3), ...DEGREE.slice(0, 3)]);
    ok("NOT ASSESSED below three finished controls in a family of the verdict (layer, degree here: 2) and with no cx record; exactly three are enough", few.verdict === "NOT ASSESSED" && /layer need at least 3 finished controls/.test(few.why) && nocx.verdict === "NOT ASSESSED" && /no cx record/.test(nocx.why) && three.verdict === "PASS");
    const SIGN = fam("sign", 0.05), withSign = ST.verdictOf(all(rec("cx", 0, [0.10, 0.10, 0.10]), SIGN));
    ok("SIGN (at 0.05, far better than cx) is reported and NOT in the verdict: the same PASS with it present, and it has its own entry in the families", withSign.verdict === "PASS" && withSign.families.sign.n === 4 && withSign.families.sign.audits.audit.wins === false);
    const refs = { spec: "refs", family: "refs", index: 0, none: sk([0.3, 0.3, 0.3]), oracle: sk([0.0005, 0.0004, 0.0008]), leaky: { chosen: { sigma: 0.9999, lambda: 0.01, selRmse: 0.02 }, scores: Object.fromEntries(L.AUDITS.map((a) => [a, { rmse: 0.03, skill: 0.9 }])) }, flights: Object.fromEntries(L.AUDITS.map((a) => [a, { clean: -0.5, dropout: -0.6, navigator: -0.5 }])) };
    const NS = [rec("nostate", 0, [0.30, 0.30, 0.30], [0.0, 0.0, 0.0], [-0.60, -0.60, -0.60])], ERc = fam("er", 0.20, [0.95, 0.95, 0.95]).map((r) => ({ ...r, closedLoop: sk([-0.55, -0.55, -0.55]) }));
    const lines = ST.reportLines([refs, rec("cx", 0, [0.10, 0.10, 0.10], [0.6, 0.6, 0.6], [-0.52, -0.52, -0.52]), ...ERc, ...LAYER, ...DEGREE, ...NS]);
    const L1 = lines.find((l) => /^references /.test(l));
    ok("the report prints the references (NONE 0.3000, ORACLE 0.0005 | 0.0004 | 0.0008), LEAKY1 with its sigma and skill, and the autopilots flown on the audits", /NONE 0\.3000 \| 0\.3000 \| 0\.3000  ORACLE 0\.0005 \| 0\.0004 \| 0\.0008$/.test(L1) && lines.some((l) => /LEAKY1 \(one unit, sigma 0\.9999\): 0\.0300 \| 0\.0300 \| 0\.0300  skill 0\.90 \| 0\.90 \| 0\.90/.test(l)) && lines.some((l) => /clean -0\.5000 \| -0\.5000 \| -0\.5000; through the dropout -0\.6000/.test(l)), L1);
    ok("each family line gives the mean +- sd of its RMSE, cx's own, the threshold a win needs (0.2 - 0.03266 = 0.1673 or lower), its mean skill and what that reads as: ER 0.95 integrates, cx 0.6 has some memory, NO STATE 0.0 does not; SIGN/COUNT/NO STATE are marked as not in the verdict",
        lines.some((l) => /^ER x4: RMSE 0\.2000 \+- 0\.0163 \(cx 0\.1000; a win needs 0\.1673 or lower: WINS\)/.test(l) && /mean skill 0\.95 \| 0\.95 \| 0\.95: integrates$/.test(l)) && lines.some((l) => /^CX .*radius 0\.99, lambda 1 \| RMSE 0\.1000 \| 0\.1000 \| 0\.1000 \| skill 0\.60 \| 0\.60 \| 0\.60$/.test(l)) &&
        lines.some((l) => /^NO STATE x1: .*mean skill 0\.00 \| 0\.00 \| 0\.00: does not integrate   \[reported, not in the verdict\]$/.test(l)) && !lines.some((l) => /WARNING/.test(l)));
    const lines3 = ST.reportLines([refs, rec("cx", 0, [0.10, 0.10, 0.10], [0.6, 0.6, 0.6]), ...fam("er", 0.2, [0.1, 0.1, 0.1]), ...fam("layer", 0.21, [0.1, 0.1, 0.1]), ...fam("degree", 0.22, [0.1, 0.1, 0.1])]), lines4 = ST.reportLines([refs, rec("cx", 0, [0.1, 0.1, 0.1], [0.99, 0.99, 0.99]), ...fam("er", 0.2, [0.99, 0.99, 0.99]), ...fam("layer", 0.21, [0.99, 0.99, 0.99]), ...fam("degree", 0.22, [0.99, 0.99, 0.99])]);
    ok("(reading 3, properly) with every reservoir at skill 0.1 the line appears; with every reservoir at 0.99 it does not", lines3.some((l) => /^reading 3: the single leaky unit has a higher skill/.test(l)) && !lines4.some((l) => /^reading 3/.test(l)));
    const warn = ST.reportLines([refs, rec("cx", 0, [0.1, 0.1, 0.1]), ...ER, ...LAYER, ...DEGREE, rec("nostate", 0, [0.3, 0.3, 0.3], [0.25, 0.1, 0.1])]);
    ok("reading 1: a NO STATE skill above 0.2 on the audit prints the WARNING that nothing is to be read; at exactly 0.2 it does not", warn.some((l) => /^WARNING \(reading 1 of the registration\)/.test(l)) && !ST.reportLines([refs, rec("cx", 0, [0.1, 0.1, 0.1]), ...ER, ...LAYER, ...DEGREE, rec("nostate", 0, [0.3, 0.3, 0.3], [0.2, 0.2, 0.2])]).some((l) => /^WARNING/.test(l)));
    ok("the closed loop block: cx -0.52 closes (-0.52 - -0.60) / (-0.50 - -0.60) = 0.80 of the gap between the dropout autopilot and the oracle navigator, the ER mean of 4 at -0.55 closes 0.50; the last line is the verdict", lines.some((l) => /^closed loop /.test(l)) && lines.some((l) => /^  cx: -0\.5200 \(0\.80\) \| -0\.5200 \(0\.80\) \| -0\.5200 \(0\.80\)$/.test(l)) && lines.some((l) => /^  ER mean of 4: -0\.5500 \(0\.50\) \| -0\.5500 \(0\.50\) \| -0\.5500 \(0\.50\)$/.test(l)) && /^RUNG 4a v2 \(the estimator\): PASS -- /.test(lines[lines.length - 1]), lines[lines.length - 1]);
    ok("the registered constants: audits on base 50000, three controls, a relative edge of 0.1, 2 sd, the readings 0.9 / 0.5 / 0.2; frozen; the registered study is cx, 10 each of ER, TYPE-BLOCK and DEGREE, 4 SIGN, 4 COUNT and NO STATE: 40 circuits", ST.AUDIT_BASE === 50000 && ST.MIN_CONTROLS === 3 && ST.REL_EDGE === 0.1 && ST.SD_FACTOR === 2 && J(ST.READ_SKILL) === J({ integrates: 0.9, some: 0.5, leak: 0.2 }) && Object.isFrozen(ST.READ_SKILL) && L.parseSpecs(ST.SPECS).length === 40 && J(E.RADII) === "[0.9,0.99,0.999]" && J(E.LAMBDAS) === "[0.000001,0.0001,0.01,1,100]" && J(E.LEAKY_SIGMAS) === "[0.95,0.99,0.999,0.9999]" && Object.isFrozen(E.RADII) && Object.isFrozen(E.LAMBDAS));

    // the command, with stand-ins for the work
    const p = (a) => { try { return ST.parseArgs(a); } catch (e) { return { threw: e.message }; } };
    const d = p(["run", "--specs", "cx", "--out", "r.jsonl"]);
    ok("run with specs and --out: audits on base 50000, closed loop on, not smoke, the default circuit file; --audit-base, --smoke, --no-closed-loop and --circuit-file are read; report reads --in", d.cmd === "run" && d.auditBase === 50000 && d.smoke === false && d.closedLoop === true && d.circuitFile === null && p(["run", "--specs", "cx", "--out", "o", "--audit-base", "60000", "--smoke", "--no-closed-loop", "--circuit-file", "c.json"]).auditBase === 60000 && p(["run", "--specs", "cx", "--out", "o", "--smoke"]).smoke === true && p(["run", "--specs", "cx", "--out", "o", "--no-closed-loop"]).closedLoop === false && p(["run", "--specs", "cx", "--out", "o", "--circuit-file", "c.json"]).circuitFile === "c.json" && p(["report", "--in", "x"]).in === "x");
    const bad = [["no command", [], /the first word must be run or report, got undefined/], ["another command", ["train"], /got "train"/], ["a stray word", ["run", "x"], /unexpected argument "x"/], ["an unknown option", ["run", "--specs", "cx", "--out", "o", "--itres", "5"], /unknown option "--itres" \(known for run: --specs, --out, --audit-base, --smoke, --no-closed-loop, --circuit-file\)/],
        ["an option of the other command", ["report", "--in", "x", "--specs", "cx"], /unknown option "--specs" \(known for report: --in\)/], ["a missing value", ["run", "--specs"], /--specs needs a value/], ["an option as a value", ["run", "--specs", "--out", "x"], /--specs needs a value/], ["a non-number", ["run", "--specs", "cx", "--out", "o", "--audit-base", "many"], /--audit-base needs a number, got "many"/],
        ["no specs", ["run", "--out", "o"], /run needs --specs/], ["no --out", ["run", "--specs", "cx"], /run needs --out/], ["a bad spec", ["run", "--specs", "er:99", "--out", "o"], /past index 19/], ["report without --in", ["report"], /report needs --in/]];
    for (const [what, a, re] of bad) { const r = p(a); ok(`${what} is refused by name`, typeof r.threw === "string" && re.test(r.threw), r.threw || J(r)); }
    const files = new Map(), outs = [], errs = [], calls = [], lastOpts = [];
    const standRec = (s, o) => rec(s.family, s.index, [0.2, 0.2, 0.2], [0.1, 0.1, 0.1], o.closedLoop ? [-0.5, -0.5, -0.5] : null);
    const io = (extra = {}) => ({ out: (m) => outs.push(m), err: (m) => errs.push(m), readFile: (f) => { if (!files.has(f)) throw new Error("ENOENT " + f); return files.get(f); }, exists: (f) => files.has(f), appendFile: (f, t) => files.set(f, (files.get(f) || "") + t),
        prepare: (o) => { calls.push("prepare " + J(o)); return {}; }, runReferences: (data, o) => { calls.push("refs"); lastOpts.push(o); return { ...refs, auditBase: o.smoke ? null : o.auditBase, smoke: o.smoke }; }, runCircuit: (s, c, data, o) => { calls.push(s.family + ":" + s.index); lastOpts.push(o); return { ...standRec(s, o), auditBase: o.smoke ? null : o.auditBase, smoke: o.smoke }; }, ...extra });
    const cmd = async (a, i) => { try { return await ST.command(a, i); } catch (e) { errs.push("THREW " + String((e && e.message) || e).slice(0, 120)); return "THREW"; } };
    const c1 = await cmd(["run", "--specs", "cx,er:0-1", "--out", "r.jsonl"], io());
    ok("run prepares the data once, runs the references FIRST and then each circuit in order, appends ONE line per record (4 lines), prints the progress and the report, and exits 0", c1 === 0 && calls.filter((c) => c.startsWith("prepare")).length === 1 && J(calls.slice(1)) === '["refs","cx:0","er:0","er:1"]' && files.get("r.jsonl").trim().split("\n").length === 4 && outs.some((m) => /3 circuits asked for, 0 already in r\.jsonl, 3 to run; references to run; audits on base 50000; closed loop on/.test(m)) && outs.some((m) => /^\[subEstimatorStudy\] er:1 done: radius 0\.99, lambda 1; RMSE 0\.2000 \| 0\.2000 \| 0\.2000; skill 0\.10 \| 0\.10 \| 0\.10$/.test(m)) && outs.some((m) => /^RUNG 4a v2/.test(m)), J(calls));
    calls.length = 0; outs.length = 0;
    const c2 = await cmd(["run", "--specs", "cx,er:0-3", "--out", "r.jsonl"], io());
    ok("a second run with more specs RESUMES: it prepares again, does NOT run the references again, and runs only er:2 and er:3; the report covers all of them", c2 === 0 && J(calls.slice(1)) === '["er:2","er:3"]' && outs.some((m) => /5 circuits asked for, 3 already in r\.jsonl, 2 to run; references already there/.test(m)) && files.get("r.jsonl").trim().split("\n").length === 6 && outs.some((m) => /^ER x4/.test(m)));
    calls.length = 0; outs.length = 0;
    const c3 = await cmd(["run", "--specs", "cx,er:0-3", "--out", "r.jsonl"], io());
    ok("a third run with everything done prepares nothing (no data recorded), runs nothing and prints the report", c3 === 0 && calls.length === 0 && outs.some((m) => /0 to run; references already there/.test(m)) && outs.some((m) => /^RUNG 4a v2/.test(m)));
    errs.length = 0; calls.length = 0; const c4 = await cmd(["run", "--specs", "er:0", "--out", "r.jsonl", "--smoke"], io()), c5 = await cmd(["run", "--specs", "er:0", "--out", "r.jsonl", "--audit-base", "60000"], io());
    ok("a results file of another audit range, or a smoke run onto a real file, is NOT mixed with: exit 1, nothing run, the records named, a way out given", c4 === 1 && c5 === 1 && calls.length === 0 && errs.every((e) => /holds 6 record\(s\) of another audit range or a smoke run \(refs, cx, er:0, er:1, er:2, er:3\)/.test(e) && /use another --out/.test(e)), errs.join(" | ").slice(0, 160));
    lastOpts.length = 0; calls.length = 0; outs.length = 0; const c6 = await cmd(["run", "--specs", "cx", "--out", "s.jsonl", "--smoke", "--no-closed-loop", "--audit-base", "60000"], io());
    ok("--smoke and --no-closed-loop reach the work as options (closedLoop false, smoke true), and a smoke record keeps no audit range", c6 === 0 && lastOpts.length === 2 && lastOpts.every((o) => o.closedLoop === false && o.smoke === true && o.auditBase === 60000) && /"auditBase":null,"smoke":true/.test(files.get("s.jsonl").split("\n")[1]), J(lastOpts[0]));
    calls.length = 0; const c7 = await cmd(["run", "--specs", "cx", "--out", "t.jsonl", "--audit-base", "60000"], io());
    ok("the audit range asked for goes to the data and to the work (60000), and a real record keeps it", c7 === 0 && /"auditBase":60000/.test(calls[0]) && lastOpts.at(-1).auditBase === 60000 && /"auditBase":60000,"smoke":false/.test(files.get("t.jsonl").split("\n")[1]), calls[0]);
    outs.length = 0; errs.length = 0; const c8 = await cmd(["report", "--in", "r.jsonl"], io());
    ok("report prints the table from the file alone and exits 0", c8 === 0 && outs.some((m) => /^CX /.test(m)) && outs.some((m) => /^RUNG 4a v2/.test(m)));
    files.set("empty.jsonl", "\n"); files.set("junk.jsonl", "{oops\n"); errs.length = 0;
    const e1 = await cmd(["report", "--in", "empty.jsonl"], io()), e2 = await cmd(["report", "--in", "missing.jsonl"], io()), e3 = await cmd(["report", "--in", "junk.jsonl"], io()), e4 = await cmd(["run", "--specs", "cx", "--out", "junk.jsonl"], io()), e5 = await cmd(["run", "--specs", "cx", "--out", "z.jsonl", "--circuit-file", "/nonexistent/c.json"], io()), e6 = await cmd(["run", "--specs"], io());
    ok("report refuses an empty file, a missing one and one with a line that is not JSON (exit 1 each); a run onto a file with a bad line, or with a circuit file that cannot be read, is exit 1; a bad argument is exit 2 on stderr", e1 === 1 && e2 === 1 && e3 === 1 && e4 === 1 && e5 === 1 && e6 === 2 && /no records/.test(errs[0]) && /ENOENT/.test(errs[1]) && /line 1 is not JSON/.test(errs[2]) && /line 1 is not JSON/.test(errs[3]) && /cannot read the circuit file/.test(errs[4]) && /^subEstimatorStudy: --specs needs a value/.test(errs[5]), errs.join(" | ").slice(0, 200));
});

sec("7. the real thing on a few throwaway dives, through the command file");
await guarded("section 7", async () => {
    const cmdFile = path.join(HERE, "ship", "subEstimatorStudyCmd.mjs"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "subest-")), file = path.join(dir, "est.jsonl");
    const run = spawnSync(process.execPath, [cmdFile, "run", "--specs", "cx,nostate:0", "--out", file, "--smoke"], { encoding: "utf8" });
    const recs = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [], cx = recs.find((r) => r.spec === "cx"), ns = recs.find((r) => r.spec === "nostate:0"), refs = recs.find((r) => r.spec === "refs");
    ok("a smoke run through the command file: exit 0, three records (refs, cx, nostate:0), the report on stdout; cx has a spectral radius 584.36 and a 65-number readout, NO STATE none; every RMSE is finite and the oracle is far below saying zero", run.status === 0 && recs.length === 3 && cx && near(cx.rho, 584.36, 0.01) && cx.readout.length === 65 && ns.rho === null && L.AUDITS.every((a) => Number.isFinite(cx.scores[a].rmse) && Number.isFinite(ns.scores[a].rmse) && refs.oracle[a] < 0.01 * refs.none[a]) && /RUNG 4a v2/.test(run.stdout), (run.stderr || "").slice(0, 160));
    ok("the leaky unit is the best memory on the throwaway dives, as it is on the real ones (skill above 0.7 on every audit) and NO STATE cannot integrate (skill under 0.2); the closed loop was flown (a score for each audit)", L.AUDITS.every((a) => refs.leaky.scores[a].skill > 0.7 && ns.scores[a].skill < 0.2 && Number.isFinite(cx.closedLoop[a])));
    const again = spawnSync(process.execPath, [cmdFile, "run", "--specs", "cx,nostate:0", "--out", file, "--smoke"], { encoding: "utf8" }), rep = spawnSync(process.execPath, [cmdFile, "report", "--in", file], { encoding: "utf8" }), bad = spawnSync(process.execPath, [cmdFile, "run", "--specs"], { encoding: "utf8" });
    ok("running it again finds everything done and writes nothing (still three lines); report reads the file back (NOT ASSESSED: too few controls); a bad argument is exit 2 on stderr", again.status === 0 && /0 to run; references already there/.test(again.stdout) && fs.readFileSync(file, "utf8").trim().split("\n").length === 3 && rep.status === 0 && /NOT ASSESSED/.test(rep.stdout) && bad.status === 2 && /--specs needs a value/.test(bad.stderr));
    fs.rmSync(dir, { recursive: true, force: true });
});

sec("8. NOT CHECKED");
console.log("  NOT CHECKED  the registered study on its full sets (40 fitting dives, 40 selection dives, the 36-dive audit, the 500-dive safety audit and the reserve, 39 circuits): this gate runs the pieces by hand and the plumbing on a few throwaway dives; the study is the run");
console.log("  NOT CHECKED  that the estimator would transfer to a real gyro (the simulator's rates are exact), or that a linear fit is how a fly's circuit reads its own state");
console.log("  NOT CHECKED  the spectral radius of a matrix with a complex dominant pair that does not alternate (a two-cell loop does; the vendored loop has a real dominant eigenvalue): the estimate is the mean log growth and is accurate to about 1 / steps there");

finished = true;
console.log(fails ? `\nsubHeadingEstimator-selfcheck: ${fails} FAILED` : "\nsubHeadingEstimator-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
