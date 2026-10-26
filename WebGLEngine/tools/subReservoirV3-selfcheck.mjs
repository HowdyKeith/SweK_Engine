// WebGLEngine/tools/subReservoirV3-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/subReservoirV3-selfcheck.mjs      (~40 s)
//
// THE GATE OF tools/subReservoirV3.mjs (the relu and tanh reservoirs, the drive scale, the edge of stability, the gains of an arm, the score with its cap count), tools/ship/subEstimatorStudyV3.mjs (one circuit under one arm, the verdict per arm, the report and its bottom line, the command)
// and tools/ship/subEstimatorStudyV3Cmd.mjs: the study of brain/SUBMARINE_WIP.md "RUNG 4a VERSION 3", registered before any v3 circuit was scored. Every number is worked out by hand on small fixtures:
//   THE RESERVOIR.  On the two-cell loop (counts 3 and 12, spectral radius 6) at nominal radius 0.9 the gain is g = 0.15: a pulse d into cell 0 reads [d, 0], [0, 0.45 d], [0.81 d, 0]; with the drive doubled (inScale 2) [2d, 0], [0, 0.9 d], [1.62 d, 0]. tanh with inScale 2: [tanh 2d, 0],
//                   [0, tanh(0.45 tanh 2d)], [tanh(1.8 tanh(0.45 tanh 2d)), 0]; a NEGATIVE pulse passes the positive edge as a negative activity (relu would lose it); with cell 1 inhibitory the return is negative for tanh and 0 for relu. At gain 3 (g = 0.5) the loop returns 9 d
//                   every two ticks and a constant drive runs into CAP: the recurrence c0' = d + 6 c1, c1' = 1.5 c0 with a clip at CAP is worked out beside the model, the clipped ticks counted (capHits) and nothing above CAP ever read.
//   THE EDGE.       Constant drive d into cell 0 of the loop for 21 ticks: cell 0 reads d x (1 + r^2 + ... + r^20) at the last tick (r the nominal radius), so the largest radius at which no cell exceeds 1000 is the root of d x (q^11 - 1) / (q - 1) = 1000, q = r^2, found here by a bisection of
//                   the closed form (r* about 1.359 for d = 1); edgeGain finds it to 1e-4 by its own 16 steps; a rho of 12 handed over doubles it; the statuses (blowsAtFloor, neverBlows) and the steps option are driven by the bound, the floor and the ceiling.
//   THE DRIVE.      1 / the root-mean-square of W_in x over the input cells and the ticks: two dives of three ticks worked out from the seeded weights.
//   THE ARMS.       R and A: the factors (0.9, 0.97, 0.99, 0.995, 0.999) x g*; T: the fixed grid and the drive scale; NO STATE: one setting.
//   THE STUDY.      One circuit under each arm on the smoke dives: the record, the edge found once and kept, the cap counts, the readout lengths (65, 149, 65), the closed loop; the verdict per arm and the bottom line over the arms (PASS in one, FAIL in all, mixed, a leak, a missing arm); the command's arguments, resume and refusals.
// NOT CHECKED, said plainly: that the numbers a full run gives are right beyond what the smoke dives show (that is what the run is for); that a relu reservoir's pulse response says what the driven edge says (the registration measured both and used the driven one).
//
// SABOTAGE LOG (the thing broken -> the rows that went red; every mutant must be red BY NAME):
//   tools/subReservoirV3.mjs, 69 mutants, every one red BY NAME: the constants (the cap, the bound, the interval, the steps, the factors, the tanh grid, the ridge grid, the arms and their freezing); the model (the unit unchecked, a zero or infinite gain refused or accepted, the radius always measured, NO STATE
//   keeping its state, a zero radius dividing, the signs or the counts ignored, only positive activity carried, the drive unscaled or scaling the recurrence or overwriting it, the cap missing or not counted or counted twice, relu letting negatives through, tanh linear, the reading too short or reading the
//   wrong cells or with the wrong constant, a state that is not reset); the drive scale (variance for rms, no guard for zero, one input cell, a mean of absolute values, counted per dive, the last tick dropped); the edge (the floor and the ceiling not tried or inverted, an arithmetic bisection, the search
//   reversed, the blowing end returned, the steps not reported, the radius measured again, the state carried between dives, the last tick not driven, one cell watched, the bound ignored, a tanh model); the gains of an arm (NO STATE's setting and scale, an edge handed in ignored, the factors of the
//   wrong gain, g* or its status dropped, an edge arm scaled, the tanh grid not copied, unscaled or named wrongly); the score (the cap count, a halved readout, the skill against the oracle). ONE finding: the row for a gain of 0 died with its section instead of failing by name (a 'ran to the end' red): the call is now inside the row.
//   tools/ship/subEstimatorStudyV3.mjs, 106 mutants. FIRST RUN: 80 red by name, 3 nameless (T86 T87 T102: the command's rows died on a missing file instead of failing), 23 0-red. Findings, all fixed in the gate: the edge was never compared with one found independently (T11 T12: the selection or the audit dives); the cx
//   record was never recomputed from the library's own parts (T17 the ridge grid of version 2, T20 every audit scored on the first); the closed loop was only asked to be a number (T24 the wrong sets, T25 without the dropout, T26 another readout: now worked by hand, to the digit, on a NO STATE record); the default audit
//   range (T30); the family skill printed for the first audit only (T46) and the edges of the readings (T40 T41: 0.45 / 0.5 / 0.85 / 0.9); the cx line's cap ticks (T45); the arm's verdict line (T57); what prepare is asked and that ONE cache is shared by every call (T94 T95 T96); that a finished run prepares nothing
//   (T92); the progress line's factor (T104) and the report of a run just made (T103); NO STATE not being searched for an edge (T07, now a row on the cache). The command's rows now call it through a guard that turns a throw into a named red. After the fixes every mutant is red BY NAME except THREE, EQUIVALENT in their output and said
//   so: T06 (a spectral radius measured for NO STATE, which the model then ignores: a cost, not a behaviour), T23 (the closed loop run when it was asked off: the record says null either way, minutes wasted), T39 (the references handed to the verdict: its families do not include them).
//   NOT SABOTAGED: the wording of the progress lines beyond what the rows read, and the comments.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as E from "./subHeadingEstimator.mjs";
import * as V from "./subReservoirV3.mjs";
import * as ST from "./ship/subEstimatorStudy.mjs";
import * as S3 from "./ship/subEstimatorStudyV3.mjs";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as T from "../brain/subTask.mjs";
import * as A from "../brain/autopilotSub.mjs";
import * as D from "./subDropout.mjs";
import * as L from "./ship/trainSubState.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const guarded = async (name, f) => { try { await f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const J = (v) => JSON.stringify(v), near = (a, b, tol) => Math.abs(a - b) <= tol, nearAll = (a, b, tol) => a.length === b.length && a.every((v, i) => near(v, b[i], tol));
const NF = E.NF;
console.log("subReservoirV3-selfcheck -- the matched-gain reservoirs and their study\n");

const cellsOf = (...nts) => nts.map((nt, i) => ({ id: i, layer: i, nt }));
const loop = (nt1 = "Exc", sg = 1) => ({ neurons: cellsOf("Exc", nt1), edges: [[0, 1, 3, 1], [1, 0, 12, sg]], io: { inputs: [0], outputs: [1] } });
const chain = { neurons: cellsOf("Exc", "Exc", "Exc"), edges: [[0, 1, 3, 1], [1, 2, 4, 1]], io: { inputs: [0], outputs: [2] } };
const five = { neurons: cellsOf("Exc", "Inh", "Exc", "Inh", "Exc"), edges: [[0, 1, 5, 1], [1, 2, 2, -1], [2, 3, 7, 1], [3, 4, 1, -1], [4, 0, 4, 1], [0, 3, 3, 1], [2, 1, 6, 1], [4, 2, 2, 1]], io: { inputs: [0, 2], outputs: [3, 4] } };
const win0 = (c) => CS.createStatePolicy(c, "x").handWeights();
const unit = (slot, sign = 1) => { const x = new Float64Array(NF); x[slot] = sign; return x; };
const zero = () => new Float64Array(NF);
// a dive whose only drive is the yaw slot: ticks, X (Float32, ticks x 15)
const driveDive = (vals) => { const X = new Float32Array(vals.length * NF); vals.forEach((v, t) => { X[t * NF + E.YAW_FEATURE] = v; }); return { ticks: vals.length, X }; };
const dive = (x5, valid, delta, oracle, cum) => { const n = x5.length, X = new Float32Array(n * NF); x5.forEach((v, t) => { X[t * NF + 5] = v; X[t * NF + 14] = valid[t]; }); return { ticks: n, X, cum: Float32Array.from(cum || new Array(n).fill(0)), delta: Float32Array.from(delta), oracle: Float32Array.from(oracle), valid: Uint8Array.from(valid) }; };

sec("1. the constants of the registration");
await guarded("section 1", async () => {
    ok("!! CAP 10000, BLOWUP 1000, the search interval [0.5, 8] and 16 steps: as registered (the cap above the bound it guards)", V.CAP === 10000 && V.BLOWUP === 1000 && V.GAIN_FLOOR === 0.5 && V.GAIN_CEIL === 8 && V.BISECT_STEPS === 16 && V.CAP > V.BLOWUP);
    ok("!! the factors below the edge are 0.9, 0.97, 0.99, 0.995, 0.999; the tanh gains 0.5, 0.9, 0.99, 1.2, 1.6, 2.4, 4; the ridge grid 1e-6, 1e-4, 1e-2, 1, 100, 1e4, 1e6 (version 2's five and two more upward)", J(V.FACTORS) === "[0.9,0.97,0.99,0.995,0.999]" && J(V.TANH_GAINS) === "[0.5,0.9,0.99,1.2,1.6,2.4,4]" && J(V.LAMBDAS) === "[0.000001,0.0001,0.01,1,100,10000,1000000]" && J(V.LAMBDAS.slice(0, 5)) === J(E.LAMBDAS));
    ok("!! three arms: R relu read from the outputs on the edge grid, A relu read from all cells on the edge grid, T tanh read from the outputs on a fixed grid", J(Object.keys(V.ARMS)) === '["R","A","T"]' && V.ARMS.R.unit === "relu" && !V.ARMS.R.readAll && V.ARMS.R.grid === "edge" && V.ARMS.A.unit === "relu" && V.ARMS.A.readAll && V.ARMS.A.grid === "edge" && V.ARMS.T.unit === "tanh" && !V.ARMS.T.readAll && V.ARMS.T.grid === "fixed" && J(S3.ARM_IDS) === '["R","A","T"]' && S3.ARM_IDS.every((id) => V.ARMS[id].id === id));
    ok("the constants are frozen, and the audit base is 60000 (version 2 read 50000), the registered list of 40 circuits is version 2's", [V.FACTORS, V.TANH_GAINS, V.LAMBDAS, V.ARMS, V.ARMS.R, S3.ARM_IDS].every(Object.isFrozen) && S3.AUDIT_BASE === 60000 && S3.SPECS === ST.SPECS && L.parseSpecs(S3.SPECS).length === 40);
});

sec("2. the reservoir, worked by hand");
await guarded("section 2", async () => {
    const wl = win0(loop()), d = Math.abs(wl[5]), x = unit(5, Math.sign(wl[5])), xneg = unit(5, -Math.sign(wl[5])), roll = (M, xs) => { let h = M.init(); const out = []; for (const xv of xs) { h = M.step(h, xv); out.push(Array.from(h)); } return out; };
    const relu = roll(V.reservoirModel(loop(), { gain: 0.9 }), [x, zero(), zero()]);
    ok("!! relu, the two-cell loop at 0.9: a pulse d reads [d, 0], [0, 0.45 d], [0.81 d, 0] (g = 0.9 / 6 = 0.15; 1e-9), the same as version 2's model", nearAll(relu[0], [d, 0], 1e-9) && nearAll(relu[1], [0, 0.45 * d], 1e-9) && nearAll(relu[2], [0.81 * d, 0], 1e-9) && J(relu) === J(roll(E.circuitModel(loop(), 0.9), [x, zero(), zero()])), J(relu));
    const scaled = roll(V.reservoirModel(loop(), { gain: 0.9, inScale: 2 }), [x, zero(), zero()]);
    ok("!! the drive scale multiplies the DRIVE and not the recurrence: with inScale 2 the pulse reads [2d, 0], [0, 0.9 d], [1.62 d, 0]", nearAll(scaled[0], [2 * d, 0], 1e-9) && nearAll(scaled[1], [0, 0.9 * d], 1e-9) && nearAll(scaled[2], [1.62 * d, 0], 1e-9), J(scaled));
    const th = roll(V.reservoirModel(loop(), { unit: "tanh", gain: 0.9, inScale: 2 }), [x, zero(), zero()]), t1 = Math.tanh(2 * d), t2 = Math.tanh(0.45 * t1), t3 = Math.tanh(1.8 * t2);
    ok("!! tanh with inScale 2: [tanh 2d, 0], [0, tanh(0.45 tanh 2d)], [tanh(1.8 tanh(0.45 tanh 2d)), 0] (1e-12)", nearAll(th[0], [t1, 0], 1e-12) && nearAll(th[1], [0, t2], 1e-12) && nearAll(th[2], [t3, 0], 1e-12), J(th));
    const thn = roll(V.reservoirModel(loop(), { unit: "tanh", gain: 0.9, inScale: 2 }), [xneg, zero(), zero()]);
    ok("!! tanh carries a NEGATIVE activity along a positive edge: a negative pulse reads [-tanh 2d, 0], [0, -tanh(0.45 tanh 2d)], [-tanh(1.8 tanh(0.45 tanh 2d)), 0] (relu would lose it)", nearAll(thn[0], [-t1, 0], 1e-12) && nearAll(thn[1], [0, -t2], 1e-12) && nearAll(thn[2], [-t3, 0], 1e-12), J(thn));
    const thi = roll(V.reservoirModel(loop("Inh", -1), { unit: "tanh", gain: 0.9, inScale: 2 }), [x, zero(), zero()]), rli = roll(V.reservoirModel(loop("Inh", -1), { gain: 0.9 }), [x, zero(), zero()]);
    ok("!! with cell 1 inhibitory the return is NEGATIVE for tanh ([-tanh(1.8 tanh(0.45 tanh 2d)), 0] on tick 3) and silent for relu ([0, 0])", near(thi[2][0], -t3, 1e-12) && thi[2][0] < 0 && nearAll(rli[2], [0, 0], 1e-12), J([thi[2], rli[2]]));
    const none = roll(V.reservoirModel(loop(), { gain: 0.9, persist: false }), [x, zero()]);
    ok("NO STATE (persist false) carries nothing: [d, 0] then [0, 0], for both units", nearAll(none[0], [d, 0], 1e-9) && nearAll(none[1], [0, 0], 1e-12) && nearAll(roll(V.reservoirModel(loop(), { unit: "tanh", gain: 4, persist: false, inScale: 2 }), [x, zero()])[1], [0, 0], 1e-12));
    const given = roll(V.reservoirModel(loop(), { gain: 0.9, rho: 12 }), [x, zero(), zero()]), M12 = V.reservoirModel(loop(), { gain: 0.9, rho: 12 });
    ok("a spectral radius handed in is used and not measured again: rho 12 gives the gain 0.075, so the pulse reads [d, 0], [0, 0.225 d], [0.2025 d, 0], and the model reports 12; measured it is 6", nearAll(given[1], [0, 0.225 * d], 1e-9) && nearAll(given[2], [0.2025 * d, 0], 1e-9) && M12.rho === 12 && near(V.reservoirModel(loop(), { gain: 0.9 }).rho, 6, 1e-6));
    // a five-cell circuit of mixed signs against a plain dense reckoning, for both units
    const Rf = CS.reservoirOf(five), wf = win0(five), rhoF = E.spectralRadius(Rf);
    for (const [unitName, f] of [["relu", (v) => (v > 0 ? v : 0)], ["tanh", Math.tanh]]) {
        const inScale = unitName === "tanh" ? 1.7 : 1, M = V.reservoirModel(five, { unit: unitName, gain: 0.99, inScale }), g = 0.99 / rhoF;
        let hd = new Array(5).fill(0), hm = M.init(), worst = 0, seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        for (let t = 0; t < 10; t++) { const xv = Array.from({ length: NF }, () => (rnd() - 0.5) * 2), o = new Array(5).fill(0); for (let k = 0; k < Rf.E; k++) o[Rf.to[k]] += g * Rf.sign[k] * Rf.mag[k] * hd[Rf.from[k]]; Rf.inputs.forEach((cell, a) => { let s = 0; for (let ff = 0; ff < NF; ff++) s += wf[a * NF + ff] * xv[ff]; o[cell] += inScale * s; }); hd = o.map(f); hm = M.step(hm, xv); worst = Math.max(worst, ...hd.map((v, i) => Math.abs(v - hm[i]))); }
        ok(`!! a five-cell circuit with mixed signs and eight edges, ten ticks of random input: the ${unitName} model equals a plain dense reckoning to 1e-12 (largest difference ${worst.toExponential(1)})`, worst < 1e-12 && M.capHits() === 0);
    }
    // the cap: gain 3 on the loop (g = 0.5): c0' = d + 6 c1, c1' = 1.5 c0, clipped at CAP
    const drv = [...Array(30)].map(() => x), Mc = V.reservoirModel(loop(), { gain: 3 }), rc = roll(Mc, drv); let c0 = 0, c1 = 0, hitsHand = 0, top = 0; const hand = [];
    for (let t = 0; t < 30; t++) { let n0 = d + 6 * c1, n1 = 1.5 * c0; if (n0 > V.CAP) { n0 = V.CAP; hitsHand++; } if (n1 > V.CAP) { n1 = V.CAP; hitsHand++; } c0 = n0; c1 = n1; hand.push([c0, c1]); top = Math.max(top, c0, c1); }
    ok("!! gain 3 on the loop returns 9 d every two ticks and a constant drive runs into CAP: the model equals the hand recurrence c0' = d + 6 c1, c1' = 1.5 c0 clipped at 10000 over 30 ticks (1e-6 relative), and no cell is ever read above CAP", rc.every((r, t) => nearAll(r, hand[t], 1e-6 * Math.max(1, hand[t][0], hand[t][1]))) && Math.max(...rc.flat()) === V.CAP && hitsHand > 3, `top ${Math.max(...rc.flat())}, hand hits ${hitsHand}`);
    ok("!! and the ticks that touched the cap are COUNTED: capHits equals the hand count (" + hitsHand + "); a model that never reaches it counts 0", Mc.capHits() === hitsHand && V.reservoirModel(loop(), { gain: 0.9 }).capHits() === 0);
    const Mt = V.reservoirModel(loop(), { unit: "tanh", gain: 3, inScale: 5 }); roll(Mt, drv);
    ok("tanh has no cap to touch: the count stays 0 and the activity stays within (-1, 1) even at gain 3", Mt.capHits() === 0 && roll(V.reservoirModel(loop(), { unit: "tanh", gain: 3, inScale: 5 }), drv).flat().every((v) => Math.abs(v) < 1));
    const z = new Float64Array(3), M2 = V.reservoirModel(loop(), { gain: 0.9 }), M3 = V.reservoirModel(loop(), { gain: 0.9, readAll: true }); M2.read(z, Float64Array.from([5, 7])); const z3 = new Float64Array(3); M3.read(z3, Float64Array.from([5, 7]));
    const real = L.loadCircuit();
    ok("!! the reading: the output cells and a constant 1 ([7, 1], 2 numbers), or with readAll every cell and a constant ([5, 7, 1], 3 numbers); the vendored circuit reads 65 numbers or 149 (148 cells and a constant)", J(Array.from(z.slice(0, 2))) === "[7,1]" && M2.n === 2 && J(Array.from(z3)) === "[5,7,1]" && M3.n === 3 && V.reservoirModel(real, { gain: 0.9 }).n === 65 && V.reservoirModel(real, { gain: 0.9, readAll: true }).n === 149 && V.reservoirModel(real, { unit: "tanh", gain: 1 }).n === 65);
    const e1 = throws(() => V.reservoirModel(loop(), { unit: "gelu", gain: 1 })), e2 = throws(() => V.reservoirModel(loop(), { gain: -1 })), e3 = throws(() => V.reservoirModel(loop(), { gain: NaN })), e4 = throws(() => V.reservoirModel(loop(), { gain: Infinity }));
    ok("!! an unknown unit, a negative gain, a NaN and an infinite gain are refused by name", /the unit must be relu or tanh/.test(e1 || "") && /the gain must be a number of 0 or more/.test(e2 || "") && /the gain must be a number/.test(e3 || "") && /the gain must be a number/.test(e4 || ""), J([e1, e2, e3, e4]));
    ok("!! a gain of 0 is allowed (no recurrence, finite), and a chain (spectral radius 0, nothing to divide by) is finite for both units: the pulse reads [d, 0, 0] and then [0, 0, 0], and the model reports rho 0", (() => { try { return V.reservoirModel(loop(), { gain: 0 }).step(new Float64Array(2), x).every(Number.isFinite); } catch { return false; } })() && ["relu", "tanh"].every((u) => { const M = V.reservoirModel(chain, { unit: u, gain: 0.9 }), r = roll(M, [x, zero()]); return r.flat().every(Number.isFinite) && nearAll(r[1], [0, 0, 0], 1e-12) && M.rho === 0; }));
});

sec("3. the drive scale, worked by hand");
await guarded("section 3", async () => {
    const wl = win0(five), NI = 2, dvA = driveDive([1, -1, 2]), dvB = driveDive([0.5, 3, -2]);
    const rms = (dives) => { let s = 0, n = 0; for (const dd of dives) for (let t = 0; t < dd.ticks; t++) for (let a = 0; a < NI; a++) { let v = 0; for (let f = 0; f < NF; f++) v += wl[a * NF + f] * dd.X[t * NF + f]; s += v * v; n++; } return Math.sqrt(s / n); };
    const hand = (() => { let s = 0; for (const x5 of [1, -1, 2, 0.5, 3, -2]) for (const f of [wl[0 * NF + 5], wl[1 * NF + 5]]) s += (f * x5) ** 2; return 1 / Math.sqrt(s / 12); })();
    ok("!! the drive scale is 1 / the root-mean-square of W_in x over the two input cells of the five-cell circuit and six ticks of two dives, worked from the seeded weights (1e-6)", near(V.driveScale(five, [dvA, dvB]), hand, 1e-6) && near(V.driveScale(five, [dvA, dvB]), 1 / rms([dvA, dvB]), 1e-6), `${V.driveScale(five, [dvA, dvB]).toFixed(5)} against ${hand.toFixed(5)}`);
    const s1 = V.driveScale(five, [dvA, dvB]), sc2 = V.driveScale(five, [driveDive([2, -2, 4]), driveDive([1, 6, -4])]);
    ok("!! the scale is what makes the drive's rms 1 (a drive twice as large has half the scale), counts every tick of every dive (the first dive alone gives another scale) and a dive of no ticks adds nothing", near(sc2, s1 / 2, 1e-9) && !near(V.driveScale(five, [dvA]), s1, 1e-6) && near(V.driveScale(five, [dvA, { ticks: 0, X: new Float32Array(0) }, dvB]), s1, 1e-12));
    ok("a drive of zero (no dives, or all-zero senses) gives the scale 1, not a division by zero", V.driveScale(five, []) === 1 && V.driveScale(five, [driveDive([0, 0, 0])]) === 1);
});

sec("4. the edge of stability, worked by hand");
await guarded("section 4", async () => {
    const wl = win0(loop()), d = Math.abs(wl[5]), T = 21, dv = driveDive(new Array(T).fill(Math.sign(wl[5])));
    // closed form: cell 0 at the last tick reads d (1 + q + ... + q^10), q = r^2; the largest r with that <= 1000
    const last = (r) => { const q = r * r; let s = 0, p = 1; for (let j = 0; j <= 10; j++) { s += p; p *= q; } return d * s; };
    let lo = 0.5, hi = 8; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (last(mid) > 1000) hi = mid; else lo = mid; }
    const rstar = lo, e = V.edgeGain(loop(), [dv]);
    ok("!! edgeGain finds the largest nominal radius at which no cell of the loop exceeds 1000 in 21 ticks of constant drive: the root of d (1 + q + ... + q^10) = 1000 worked out here by a bisection of the closed form (" + rstar.toFixed(5) + "), to 1e-4 relative", near(e.gain, rstar, 1e-4 * rstar) && e.status === "edge" && e.steps === 16 && rstar > 1.2 && rstar < 1.6, J(e));
    const at = (g) => { const M = V.reservoirModel(loop(), { gain: g }); let h = M.init(), mx = 0; for (let t = 0; t < T; t++) { h = M.step(h, dv.X.subarray(t * NF, t * NF + NF)); mx = Math.max(mx, ...h); } return mx; };
    ok("!! the gain it returns does NOT blow up (the largest activity is under the bound) and a gain 0.02 percent higher DOES (over it)", at(e.gain) <= 1000 && at(e.gain * 1.0002) > 1000, `${at(e.gain).toFixed(1)} and ${at(e.gain * 1.0002).toFixed(1)}`);
    const eh = V.edgeGain(loop(), [dv], { rho: 12 });
    ok("a spectral radius handed in is the one used: rho 12 (twice the true 6) doubles the edge in nominal radius (1e-3 relative)", near(eh.gain, 2 * rstar, 2e-3 * rstar), J(eh));
    const eb = V.edgeGain(loop(), [dv], { bound: 1e-9 }), en = V.edgeGain(loop(), [dv], { bound: 1e12, ceil: 1.2 }), e1s = V.edgeGain(loop(), [dv], { steps: 1 }), e2d = V.edgeGain(loop(), [dv, dv]);
    ok("!! when even the floor blows up the answer is the floor with the status blowsAtFloor and no steps; when even the ceiling does not it is the ceiling with the status neverBlows", J(eb) === '{"gain":0.5,"status":"blowsAtFloor","steps":0}' && J(en) === '{"gain":1.2,"status":"neverBlows","steps":0}', J([eb, en]));
    ok("!! the bisection is GEOMETRIC: three steps from [0.5, 8] try 2 (blows up), 1 (does not), 1.414 (does not, the edge being 1.54) and return the square root of 2 (an arithmetic bisection would try 4.25, 2.375, 1.4375); one step tries 2 and returns the floor 0.5; the bound and the interval can be changed", near(V.edgeGain(loop(), [dv], { steps: 3 }).gain, Math.SQRT2, 1e-9) && V.edgeGain(loop(), [dv], { steps: 3 }).steps === 3 && e1s.gain === 0.5 && e1s.steps === 1 && e1s.status === "edge" && V.edgeGain(loop(), [dv], { floor: 1.0, ceil: 2 }).gain > 1.0 && V.edgeGain(loop(), [dv], { floor: 1.0, ceil: 2 }).gain < 2);
    ok("every dive is driven (the edge of two identical dives is the edge of one); a dive that does not blow up alone and one that does give the edge of the one that does", near(e2d.gain, e.gain, 1e-12) && near(V.edgeGain(loop(), [driveDive([1, 1, 1]), dv]).gain, e.gain, 1e-12) && V.edgeGain(loop(), [driveDive([1, 1, 1])]).status === "neverBlows");
    const neg = V.edgeGain(loop(), [driveDive(new Array(T).fill(-Math.sign(wl[5])))]);
    ok("a drive that the relu silences never blows up whatever the gain: status neverBlows", neg.status === "neverBlows" && neg.gain === 8, J(neg));
    const ed = V.edgeGain(loop(), [dv, driveDive(new Array(T).fill(3 * Math.sign(wl[5])))]);
    ok("the dive with the larger drive sets the edge: a second dive with three times the drive lowers it", ed.gain < e.gain && ed.status === "edge", `${ed.gain.toFixed(4)} against ${e.gain.toFixed(4)}`);
});

sec("5. the gains of an arm");
await guarded("section 5", async () => {
    const wl = win0(loop()), dv = driveDive(new Array(21).fill(Math.sign(wl[5]))), e = V.edgeGain(loop(), [dv]);
    const gr = V.gainsFor(V.ARMS.R, loop(), [dv]);
    ok("!! arm R: the settings are the five factors x g* (1e-12), g* and its status are the edge's, inScale 1", nearAll(gr.settings, V.FACTORS.map((f) => f * e.gain), 1e-12) && gr.gStar === e.gain && gr.status === "edge" && gr.inScale === 1 && gr.settings.length === 5);
    const gp = V.gainsFor(V.ARMS.A, loop(), [dv], { edge: { gain: 2, status: "edge", steps: 16 } });
    ok("an edge handed in is used and not found again (g* 2: 1.8, 1.94, 1.98, 1.99, 1.998); arm A has the same gains as arm R", nearAll(gp.settings, [1.8, 1.94, 1.98, 1.99, 1.998], 1e-12) && gp.gStar === 2 && nearAll(V.gainsFor(V.ARMS.A, loop(), [dv]).settings, gr.settings, 1e-12));
    const gt = V.gainsFor(V.ARMS.T, loop(), [dv]);
    ok("!! arm T: the fixed grid, no g* (null), the status fixedGrid and inScale = the drive scale of the fitting dives; the settings are a copy (pushing to them leaves the grid alone)", J(gt.settings) === J(V.TANH_GAINS) && gt.gStar === null && gt.status === "fixedGrid" && gt.inScale === V.driveScale(loop(), [dv]) && gt.inScale !== 1 && gt.settings !== V.TANH_GAINS && (() => { try { gt.settings.push(99); } catch { return false; } return V.TANH_GAINS.length === 7; })());
    const gn = V.gainsFor(V.ARMS.R, loop(), [dv], { persist: false }), gnt = V.gainsFor(V.ARMS.T, loop(), [dv], { persist: false });
    ok("!! NO STATE has no recurrence to tune: one setting (1), no g*, the status noRecurrence, and for tanh the drive scale still (relu 1)", J(gn.settings) === "[1]" && gn.gStar === null && gn.status === "noRecurrence" && gn.inScale === 1 && J(gnt.settings) === "[1]" && gnt.inScale === V.driveScale(loop(), [dv]));
    ok("a relu circuit whose edge is not found (the interval has none) carries the status through", V.gainsFor(V.ARMS.R, loop(), [driveDive([1, 1, 1])]).status === "neverBlows" && V.gainsFor(V.ARMS.R, loop(), [driveDive([1, 1, 1])]).gStar === 8);
});

sec("6. the score and its cap count");
await guarded("section 6", async () => {
    const dvs = [dive([0.1, 0.2, 0.4, 0.8, 1.0, 2.0], [1, 1, 0, 0, 1, 0], [0, 0, 0.25, 0.5, 0, 1.5], [0, 0, 0.2, 0.4, 0, 1.4]), dive([1.5, 3.5, 5], [0, 0, 1], [0.5, 1.5, 0], [0.4, 1.4, 0])];
    const mk = (g) => V.reservoirModel(loop(), { gain: g }), readout = [0.7, 0.2], fit = { setting: 0.9, readout };
    const a = V.scoreWith(mk(0.9), readout, dvs), b = E.scoreFit((g) => E.circuitModel(loop(), g), fit, dvs);
    ok("!! scoreWith equals version 2's scoreFit for the same reservoir (rmse, none, oracle, skill, dark ticks), and adds the cap count (0)", ["rmse", "none", "oracle", "skill", "darkTicks"].every((k) => near(a[k], b[k], 1e-12)) && a.capHits === 0 && a.darkTicks === 5 && Number.isFinite(a.rmse), J(a));
    const hot = dive([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], new Array(30).fill(0), new Array(30).fill(0.1), new Array(30).fill(0.1)), Mh = mk(3), s = V.scoreWith(Mh, readout, [hot]);
    ok("!! a reservoir run into the cap says so while scoring: the ticks that touched it are counted (more than 3, and the model's own count)", s.capHits > 3 && s.capHits === Mh.capHits() && s.darkTicks === 30, J(s));
});

sec("7. one circuit under one arm (the smoke dives)");
await guarded("section 7", async () => {
    const circuit = L.loadCircuit(), data = ST.prepare({ auditBase: 60000, smoke: true }), spec = (s) => L.parseSpecs(s)[0], cache = new Map(), base = { smoke: true, closedLoop: false, edgeCache: cache };
    const rcx = S3.runCircuit(V.ARMS.R, spec("cx"), circuit, data, base);
    ok("!! the record of cx under arm R: the spec, the arm, the family and index, no audit range (a smoke record), the spectral radius 584.36, the calibration (g*, status edge, the factor chosen and the gain = factor x g*, inScale 1), the choice and a readout of 65 numbers", rcx.spec === "cx" && rcx.arm === "R" && rcx.family === "cx" && rcx.index === 0 && rcx.auditBase === null && rcx.smoke === true && near(rcx.rho, 584.36, 0.01) && rcx.calibration.status === "edge" && V.FACTORS.some((f) => near(f, rcx.calibration.factor, 1e-9)) && near(rcx.calibration.gain, rcx.calibration.factor * rcx.calibration.gStar, 1e-9) && rcx.calibration.inScale === 1 && near(rcx.calibration.gStar, 1.18, 0.05) && rcx.readout.length === 65 && V.LAMBDAS.includes(rcx.chosen.lambda) && rcx.chosen.setting === rcx.calibration.gain && rcx.closedLoop === null, J(rcx.calibration));
    ok("!! the scores: for each of the three audits an rmse, a none, an oracle, a skill, the dark ticks and the cap count, all finite numbers", ["audit", "safetyAudit", "reserve"].every((a) => ["rmse", "none", "oracle", "skill", "darkTicks", "capHits"].every((k) => Number.isFinite(rcx.scores[a][k]))));
    ok("!! the edge is found ONCE per circuit and kept: the cache now holds cx; a cache holding a made-up edge (g* 2) is used by arm A, whose record then carries g* 2 and a gain that is a factor of 2", cache.has("cx") && cache.get("cx").gain === rcx.calibration.gStar && (() => { const c2 = new Map([["cx", { gain: 2, status: "edge", steps: 16 }]]), r = S3.runCircuit(V.ARMS.A, spec("cx"), circuit, data, { ...base, edgeCache: c2 }); return r.calibration.gStar === 2 && near(r.calibration.gain, r.calibration.factor * 2, 1e-12); })());
    const rhoCx = E.spectralRadius(CS.reservoirOf(circuit)), mkCx = (g) => V.reservoirModel(circuit, { unit: "relu", gain: g, rho: rhoCx }), edgeFit = V.edgeGain(circuit, data.fit, { rho: rhoCx }), fitCx = E.fitModel(mkCx, V.gainsFor(V.ARMS.R, circuit, data.fit, { rho: rhoCx, edge: edgeFit }).settings, V.LAMBDAS, data.fit, data.sel);
    ok("!! the edge of cx is the one found on the FITTING dives (not the selection or the audit dives), and the choice, the readout and every audit's rmse are what the library's own parts give for cx under arm R, audit by audit (1e-12): the three audits are three different scores", rcx.calibration.gStar === edgeFit.gain && fitCx.setting === rcx.chosen.setting && fitCx.lambda === rcx.chosen.lambda && nearAll(fitCx.readout, rcx.readout, 1e-12) && ["audit", "safetyAudit", "reserve"].every((a) => near(V.scoreWith(mkCx(fitCx.setting), fitCx.readout, data.audits[a]).rmse, rcx.scores[a].rmse, 1e-12)) && new Set(["audit", "safetyAudit", "reserve"].map((a) => rcx.scores[a].rmse)).size === 3, `lambda ${rcx.chosen.lambda}`);
    ok("!! a lambda above 100 is reachable and chosen (the ridge grid reaches 1e4 and 1e6): cx under arm R on the smoke dives chooses " + rcx.chosen.lambda, V.LAMBDAS.includes(rcx.chosen.lambda) && rcx.chosen.lambda > 100);
    const ra = S3.runCircuit(V.ARMS.A, spec("cx"), circuit, data, base);
    ok("!! arm A reads ALL cells: a readout of 149 numbers, the same g* as arm R (the cache), and the same fit machinery", ra.arm === "A" && ra.readout.length === 149 && ra.calibration.gStar === rcx.calibration.gStar && ra.calibration.status === "edge");
    const rt = S3.runCircuit(V.ARMS.T, spec("er:0"), circuit, data, base), c0 = L.circuitFor(spec("er:0"), circuit);
    ok("!! arm T: tanh, no g* (null), the status fixedGrid, inScale = the drive scale of the fitting dives, the gain one of the tanh grid, a readout of 65 numbers, and the factor null", rt.arm === "T" && rt.calibration.gStar === null && rt.calibration.status === "fixedGrid" && rt.calibration.factor === null && near(rt.calibration.inScale, V.driveScale(c0, data.fit), 1e-12) && V.TANH_GAINS.includes(rt.calibration.gain) && rt.readout.length === 65 && rt.family === "er" && rt.index === 0);
    const rn = S3.runCircuit(V.ARMS.R, spec("nostate:0"), circuit, data, base);
    ok("!! NO STATE: no spectral radius (null), the status noRecurrence, one setting (1), no factor", rn.rho === null && rn.calibration.status === "noRecurrence" && rn.calibration.gain === 1 && rn.calibration.gStar === null && rn.calibration.factor === null && rn.chosen.setting === 1);
    // the same fit by hand from the library's own parts
    const mk = (g) => V.reservoirModel(c0, { unit: "tanh", gain: g, rho: E.spectralRadius(CS.reservoirOf(c0)), inScale: V.driveScale(c0, data.fit) }), fit = E.fitModel(mk, V.TANH_GAINS, V.LAMBDAS, data.fit, data.sel);
    ok("!! the choice and the readout of arm T for er:0 are what the library's fit gives for the tanh model on the same dives, gains and ridge grid (1e-12)", fit.setting === rt.chosen.setting && fit.lambda === rt.chosen.lambda && nearAll(fit.readout, rt.readout, 1e-12) && near(rt.scores.audit.rmse, V.scoreWith(mk(fit.setting), fit.readout, data.audits.audit).rmse, 1e-12));
    const rl = S3.runCircuit(V.ARMS.R, spec("nostate:0"), circuit, data, { ...base, closedLoop: true, auditBase: 60000, smoke: false });
    const cn = L.circuitFor(spec("nostate:0"), circuit), mkN = (g) => V.reservoirModel(cn, { unit: "relu", gain: g, rho: 1, persist: false }), handLoop = (a) => T.evaluate(D.dropout(E.estimatorPilot(mkN(rl.chosen.setting), Float64Array.from(rl.readout), A.pilot())), data.sets[a]).score;
    ok("!! with the closed loop on, the score of each audit is the fitted estimator flown in the place of the oracle through the DROPOUT on that audit's own dives (worked here by hand from the record's readout, to the digit); a record carries its audit range (60000), a smoke record none (null); with no range given the default is 60000", ["audit", "safetyAudit", "reserve"].every((a) => rl.closedLoop[a] === handLoop(a)) && new Set(["audit", "safetyAudit", "reserve"].map((a) => rl.closedLoop[a])).size === 3 && rl.auditBase === 60000 && rl.smoke === false && rcx.auditBase === null && S3.runCircuit(V.ARMS.R, spec("nostate:0"), circuit, data, { closedLoop: false, edgeCache: new Map() }).auditBase === 60000);
    ok("!! NO STATE is not searched for an edge: after running it under arm R the cache holds no entry for it, and its record has no spectral radius", !cache.has("nostate:0") && rn.rho === null);
    ok("with the closed loop off the record says null; with it on and the circuit run on smoke dives it carries three numbers", rcx.closedLoop === null && Object.keys(rl.closedLoop).length === 3);
});

sec("8. the verdict per arm, the report and the bottom line");
await guarded("section 8", async () => {
    const A3 = ["audit", "safetyAudit", "reserve"], sc = (rmse, skill, caps = 0) => Object.fromEntries(A3.map((a, i) => [a, { rmse: Array.isArray(rmse) ? rmse[i] : rmse, skill: Array.isArray(skill) ? skill[i] : skill, none: 0.3, oracle: 0.001, darkTicks: 100, capHits: caps }]));
    const rec = (arm, family, index, rmse, skill, extra = {}) => ({ spec: family === "cx" ? "cx" : `${family}:${index}`, arm, family, index, auditBase: 60000, smoke: false, rho: 5, calibration: family === "nostate" ? { gStar: null, status: "noRecurrence", factor: null, gain: 1, inScale: 1 } : { gStar: 1.25, status: "edge", factor: 0.99, gain: 1.2375, inScale: 1 }, chosen: { setting: 1.2375, lambda: 100, selRmse: 0.1 }, readout: [0], scores: sc(rmse, skill, extra.caps || 0), closedLoop: extra.cl || null });
    const arm = (id, cx, fam, opts = {}) => [rec(id, "cx", 0, cx, opts.cxSkill ?? 0.5, { cl: opts.cl }), ...["er", "layer", "degree"].flatMap((f) => [0, 1, 2].map((i) => rec(id, f, i, fam, opts.famSkill ?? 0.1, { caps: opts.caps || 0 }))), ...(opts.nostate === undefined ? [] : [rec(id, "nostate", 0, 0.3, opts.nostate)])];
    const refs = { spec: "refs", family: "refs", index: 0, auditBase: 60000, smoke: false, none: { audit: 0.3, safetyAudit: 0.3, reserve: 0.3 }, oracle: { audit: 0.001, safetyAudit: 0.001, reserve: 0.001 }, leaky: { chosen: { sigma: 0.9999, lambda: 0.01, selRmse: 0.02 }, scores: Object.fromEntries(A3.map((a) => [a, { rmse: 0.03, skill: 0.9 }])) }, flights: Object.fromEntries(A3.map((a) => [a, { clean: -0.54, dropout: -0.65, navigator: -0.54 }])) };
    const win = (id) => arm(id, 0.1, 0.3), lose = (id) => arm(id, 0.3, 0.2), mid = (id) => [rec(id, "cx", 0, [0.1, 0.1, 0.19], 0.5), ...["er", "layer", "degree"].flatMap((f) => [0, 1, 2].map((i) => rec(id, f, i, 0.2, 0.1)))];
    const bottom = (recs) => reportLines3(recs).filter((l) => /BOTTOM LINE/.test(l)).join(" || ");
    const reportLines3 = S3.reportLines;
    const v = S3.armVerdict([...win("R"), ...lose("A")], "R"), v2 = S3.armVerdict([...win("R"), ...lose("A")], "A");
    ok("!! the verdict of an arm reads only that arm's records: cx at 0.10 against families at 0.30 is a PASS in R, and the same file read for A (cx 0.30 against 0.20) is a FAIL; the references are never a circuit", v.verdict === "PASS" && v2.verdict === "FAIL" && S3.armVerdict([refs, ...win("R")], "R").verdict === "PASS" && S3.armVerdict(win("R"), "T").verdict === "NOT ASSESSED");
    ok("!! BOTTOM LINE, a PASS in any arm: 'PASS in arm R -- the v2 FAIL was confounded with gain calibration' and the verdicts of the three arms", /BOTTOM LINE: PASS in arm R -- the v2 FAIL was confounded with gain calibration/.test(bottom([refs, ...win("R"), ...lose("A"), ...lose("T")])) && /R PASS, A FAIL, T FAIL/.test(bottom([refs, ...win("R"), ...lose("A"), ...lose("T")])), bottom([refs, ...win("R"), ...lose("A"), ...lose("T")]));
    ok("!! BOTTOM LINE, a PASS in the LAST arm alone is found too, and two PASSes are both named", /PASS in arm T /.test(bottom([refs, ...lose("R"), ...lose("A"), ...win("T")])) && /PASS in arm R, T /.test(bottom([refs, ...win("R"), ...lose("A"), ...win("T")])));
    ok("!! BOTTOM LINE, FAIL in all three: 'FAIL in all three arms -- the v2 conclusion survives matched calibration'", /BOTTOM LINE: FAIL in all three arms -- the v2 conclusion survives matched calibration/.test(bottom([refs, ...lose("R"), ...lose("A"), ...lose("T")])));
    ok("!! BOTTOM LINE, no PASS and not all FAIL: reported as it is with each verdict (cx winning two of three audits against every family is IN BETWEEN)", S3.armVerdict(mid("A"), "A").verdict === "IN BETWEEN" && /BOTTOM LINE: no PASS in any arm, reported as it is \(R FAIL, A IN BETWEEN, T FAIL\)/.test(bottom([refs, ...lose("R"), ...mid("A"), ...lose("T")])), bottom([refs, ...lose("R"), ...mid("A"), ...lose("T")]));
    ok("!! BOTTOM LINE, an arm with no records: 'NOT YET -- arm T has no records' (and nothing is concluded from two arms, even two PASSes)", /BOTTOM LINE: NOT YET -- arm T has no records/.test(bottom([refs, ...win("R"), ...win("A")])) && !/PASS in arm/.test(bottom([refs, ...win("R"), ...win("A")])));
    const few = [rec("R", "cx", 0, 0.1, 0.5), rec("R", "er", 0, 0.3, 0.1)];
    ok("an arm with too few controls is NOT ASSESSED and the bottom line says so", /arm R is not assessed; arm A has no records; arm T has no records/.test(bottom([refs, ...few])), bottom([refs, ...few]));
    const leakT = [...win("R"), ...win("A"), ...win("T"), rec("T", "nostate", 0, 0.3, 0.5)], lt = reportLines3([refs, ...leakT]);
    ok("!! a NO STATE control with a skill above 0.2 prints the warning for that arm, the arm is NOT READ and the bottom line says 'arm T is not read (leak)' instead of concluding from the other two", lt.some((l) => /WARNING \(reading a\): NO STATE has a skill above 0.2 in arm T/.test(l)) && /arm T is not read \(leak\)/.test(bottom([refs, ...leakT])) && !/PASS in arm/.test(bottom([refs, ...leakT])) && !reportLines3([refs, ...win("R"), ...win("A"), ...win("T"), rec("T", "nostate", 0, 0.3, 0.1)]).some((l) => /WARNING/.test(l)));
    const fl = reportLines3([refs, ...arm("R", 0.1, 0.3, { cxSkill: 0.7, famSkill: 0.6, caps: 2 })]), pr = fl.filter((l) => /^ARM R|^  CX|^  ER|^  families/.test(l)).join("\n");
    ok("!! the arm's lines: the header with its name and circuit count, the cx line with g*, its status, the gain as a factor of g* and the cap ticks, the family line with the cx comparison, the mean skill and its reading, the ticks that touched the cap, and the families whose mean skill reaches 0.5", /ARM R \(relu, edge-matched\), 10 circuits:/.test(pr) && /CX: g\* 1\.250 \(edge\), gain 1\.238 = 0\.990 x g\*, lambda 100 \| RMSE 0\.1000 \| 0\.1000 \| 0\.1000 \| skill 0\.70 \| 0\.70 \| 0\.70 \| cap ticks 0 \| 0 \| 0/.test(pr) && /ER x3: RMSE 0\.3000 \+- 0\.0000 \(cx 0\.1000; a win needs 0\.2700 or lower: WINS\)/.test(pr) && /mean skill 0\.60 \| 0\.60 \| 0\.60: has some memory/.test(pr) && /; 18 ticks touched the cap/.test(pr) && /families whose mean skill on the audit reaches 0\.5: ER, TYPE-BLOCK, DEGREE/.test(pr), pr.slice(0, 700));
    ok("!! families whose mean skill reaches 0.5 'none' when none does: NO STATE never counts (skill 0.9 here) and neither does cx (0.5 here, a circuit and not a family)", reportLines3([refs, ...arm("R", 0.1, 0.3, { nostate: 0.9 })]).some((l) => /families whose mean skill on the audit reaches 0\.5: none/.test(l)));
    const clr = reportLines3([refs, ...arm("R", 0.1, 0.3, { cl: { audit: -0.60, safetyAudit: -0.60, reserve: -0.60 } })]).filter((l) => /closed loop, cx/.test(l)).join("");
    ok("!! the closed loop row: the audit score and the fraction of the gap between the dropout autopilot (-0.65) and the oracle navigator (-0.54) it closes, (-0.60 + 0.65) / 0.11 = 0.45", /closed loop, cx: -0\.6000 \(0\.45\) \| -0\.6000 \(0\.45\) \| -0\.6000 \(0\.45\)/.test(clr), clr);
    const famWith = (skills, cxCaps = 0) => [rec("R", "cx", 0, 0.1, 0.5, { caps: cxCaps }), ...["er", "layer", "degree"].flatMap((f) => [0, 1, 2].map((i) => rec("R", f, i, 0.3, skills)))];
    const erLine = (skills) => reportLines3([refs, ...famWith(skills)]).find((l) => /^  ER x3/.test(l));
    ok("!! the readings of a family's mean skill: 0.45 does not integrate, 0.5 has some memory, 0.85 has some memory, 0.9 integrates (the edges are version 2's)", /mean skill 0\.45 \| 0\.45 \| 0\.45: does not integrate/.test(erLine(0.45)) && /: has some memory/.test(erLine(0.5)) && /: has some memory/.test(erLine(0.85)) && /: integrates/.test(erLine(0.9)) && /: integrates/.test(erLine(0.95)));
    ok("!! the mean skill is printed for each of the three audits (a family at 0.1, 0.5 and 0.9 reads 0.10 | 0.50 | 0.90) and the reading is from the FIRST audit", /mean skill 0\.10 \| 0\.50 \| 0\.90: does not integrate/.test(erLine([0.1, 0.5, 0.9])) && /mean skill 0\.90 \| 0\.10 \| 0\.10: integrates/.test(erLine([0.9, 0.1, 0.1])));
    ok("!! the cx line prints the cap ticks of each audit (3, 5, 7 for a record that touched the cap that often)", reportLines3([refs, ...famWith(0.1, 3)]).some((l) => /^  CX/.test(l) && /cap ticks 3 \| 3 \| 3/.test(l)) && (() => { const r = rec("R", "cx", 0, 0.1, 0.5); r.scores.audit.capHits = 3; r.scores.safetyAudit.capHits = 5; r.scores.reserve.capHits = 7; return reportLines3([refs, r, ...famWith(0.1).slice(1)]).some((l) => /cap ticks 3 \| 5 \| 7/.test(l)); })());
    ok("!! each arm closes with its own verdict line: 'RUNG 4a v3, arm R: PASS -- cx beats ER, TYPE-BLOCK and DEGREE on all three audits'", reportLines3([refs, ...win("R")]).some((l) => l === "  RUNG 4a v3, arm R: PASS -- cx beats ER, TYPE-BLOCK and DEGREE on all three audits") && reportLines3([refs, ...lose("T")]).some((l) => /^  RUNG 4a v3, arm T: FAIL -- /.test(l)));
    const rl = reportLines3([refs, ...win("R")]);
    ok("the references are printed first: NONE, ORACLE, the leaky unit (sigma 0.9999, skill 0.90) and the flights", /^references .*NONE 0\.3000 \| 0\.3000 \| 0\.3000  ORACLE 0\.0010/.test(rl[0]) && /LEAKY1 \(one unit, sigma 0\.9999\): 0\.0300 \| 0\.0300 \| 0\.0300  skill 0\.90 \| 0\.90 \| 0\.90/.test(rl[1]) && /clean -0\.5400 \| -0\.5400 \| -0\.5400; through the dropout -0\.6500/.test(rl[2]));
});

sec("9. the command");
await guarded("section 9", async () => {
    const pa = (...a) => { try { return S3.parseArgs(a); } catch (e) { return String(e.message); } };
    ok("!! arguments: run needs --specs and --out; the arms default to R,A,T; --arms R,T keeps its order; the audit base defaults to 60000; --smoke and --no-closed-loop are switches; report needs --in", /run needs --specs/.test(pa("run", "--out", "x")) && /run needs --out/.test(pa("run", "--specs", "cx")) && J(pa("run", "--specs", "cx", "--out", "o").arms) === '["R","A","T"]' && J(pa("run", "--specs", "cx", "--out", "o", "--arms", "T, R").arms) === '["T","R"]' && pa("run", "--specs", "cx", "--out", "o").auditBase === 60000 && pa("run", "--specs", "cx", "--out", "o", "--audit-base", "7").auditBase === 7 && pa("run", "--specs", "cx", "--out", "o", "--smoke").smoke === true && pa("run", "--specs", "cx", "--out", "o", "--no-closed-loop").closedLoop === false && pa("run", "--specs", "cx", "--out", "o").closedLoop === true && /report needs --in/.test(pa("report")) && pa("report", "--in", "f").in === "f");
    ok("!! twelve ways to take the arguments wrongly are refused by name: no command, a wrong command, a bare word, an unknown option, an option with no value (at the end and before another option), a non-number audit base, an unknown arm, an arm named twice, a bad spec, the circuit file taken, an option of the other command",
        /the first word must be run or report/.test(pa()) && /the first word must be run or report, got "go"/.test(pa("go")) && /unexpected argument "x"/.test(pa("run", "x")) && /unknown option "--bogus"/.test(pa("run", "--bogus", "1")) && /--out needs a value/.test(pa("run", "--specs", "cx", "--out")) && /--specs needs a value/.test(pa("run", "--specs", "--out", "o")) && /--audit-base needs a number, got "abc"/.test(pa("run", "--specs", "cx", "--out", "o", "--audit-base", "abc")) && /unknown arm "Q"/.test(pa("run", "--specs", "cx", "--out", "o", "--arms", "R,Q")) && /an arm is named twice/.test(pa("run", "--specs", "cx", "--out", "o", "--arms", "R,R")) && pa("run", "--specs", "wiggle:3", "--out", "o").length > 0 && pa("run", "--specs", "cx", "--out", "o", "--circuit-file", "c.json").circuitFile === "c.json" && /unknown option "--specs"/.test(pa("report", "--specs", "cx")));
    const outs = [], errs = [], files = new Map(), calls = [], caches = new Set(), prepArgs = []; let prepared = 0, refsRuns = 0;
    const cmd = async (a, i) => { try { return await S3.command(a, i); } catch (e) { return "THREW " + String(e.message || e).slice(0, 100); } };
    const fileLines = (f) => (files.get(f) || "").trim().split("\n").filter(Boolean);
    const io = (extra = {}) => ({ out: (m) => outs.push(m), err: (m) => errs.push(m), readFile: (f) => { if (!files.has(f)) throw new Error("no such file " + f); return files.get(f); }, appendFile: (f, s) => files.set(f, (files.get(f) || "") + s), exists: (f) => files.has(f),
        prepare: (o) => { prepared++; prepArgs.push(o); return { stub: true, auditBase: o.auditBase }; }, runReferences: () => { refsRuns++; return { spec: "refs", family: "refs", index: 0, auditBase: 60000, smoke: false, none: { audit: 0.3, safetyAudit: 0.3, reserve: 0.3 }, oracle: { audit: 0.001, safetyAudit: 0.001, reserve: 0.001 }, leaky: { chosen: { sigma: 0.9999, lambda: 0.01, selRmse: 0.02 }, scores: { audit: { rmse: 0.03, skill: 0.9 }, safetyAudit: { rmse: 0.03, skill: 0.9 }, reserve: { rmse: 0.03, skill: 0.9 } } }, flights: null }; },
        runCircuit: (arm, s, circuit, data, opts) => { calls.push(`${arm.id} ${L.specName(s)} ${opts.edgeCache instanceof Map}`); caches.add(opts.edgeCache); return { spec: L.specName(s), arm: arm.id, family: s.family, index: s.index, auditBase: opts.smoke ? null : opts.auditBase, smoke: !!opts.smoke, rho: 1, calibration: { gStar: arm.id === "A" ? 1.1 : null, status: "x", factor: arm.id === "A" ? 0.99 : null, gain: 1, inScale: 1 }, chosen: { setting: 1, lambda: 100, selRmse: 0.1 }, readout: [0], scores: Object.fromEntries(["audit", "safetyAudit", "reserve"].map((a) => [a, { rmse: 0.2, skill: 0.1, none: 0.3, oracle: 0.001, darkTicks: 5, capHits: 0 }])), closedLoop: null }; }, ...extra });
    let code = await cmd(["run", "--specs", "cx,er:0", "--arms", "R,A", "--out", "res.jsonl"], io());
    const lines1 = fileLines("res.jsonl").map((l) => JSON.parse(l)), outs1 = outs.slice();
    ok("!! a run: the references first (once), then the circuits circuit by circuit and arm by arm inside it (R cx, A cx, R er:0, A er:0), each handed the shared edge cache; one JSON line a record; exit 0; the progress lines say what was run", code === 0 && refsRuns === 1 && prepared === 1 && J(calls) === '["R cx true","A cx true","R er:0 true","A er:0 true"]' && lines1.length === 5 && lines1[0].family === "refs" && J(lines1.slice(1).map((r) => r.arm + r.spec)) === '["Rcx","Acx","Rer:0","Aer:0"]' && outs.some((l) => /2 circuits x 2 arms \(R, A\), 0 already in res\.jsonl, 4 to run; references to run; audits on base 60000; closed loop on/.test(l)) && outs.some((l) => /R cx done: gain 1\.000, lambda 100; RMSE 0\.2000/.test(l)));
    ok("!! one edge cache is shared by every call of a run (the same Map each time); prepare is asked for the audit base 60000 and no smoke; the progress line of an arm with a factor says it (0.990 x g*); the report at the end is of the records just made (the arm's header with its two circuits)", caches.size === 1 && J(prepArgs) === '[{"auditBase":60000,"smoke":false}]' && outs1.some((l) => /A cx done: gain 1\.000 \(0\.990 x g\*\), lambda 100/.test(l)) && outs1.some((l) => /^ARM R \(relu, edge-matched\), 2 circuits:/.test(l)) && outs1.some((l) => /^ARM A .*2 circuits:/.test(l)));
    calls.length = 0; outs.length = 0; code = await cmd(["run", "--specs", "cx,er:0,er:1", "--arms", "R,A", "--out", "res.jsonl"], io());
    ok("!! a run again RESUMES: only the (arm, circuit) pairs not in the file are run (R er:1 and A er:1), the references are not run again, and the file grows by exactly two lines", code === 0 && J(calls) === '["R er:1 true","A er:1 true"]' && refsRuns === 1 && fileLines("res.jsonl").length === 7 && outs.some((l) => /3 circuits x 2 arms \(R, A\), 4 already in res\.jsonl, 2 to run; references already there/.test(l)));
    calls.length = 0; outs.length = 0; code = await cmd(["run", "--specs", "cx", "--arms", "R,T", "--out", "res.jsonl"], io());
    ok("an arm that is not in the file for a circuit that is (T cx) is run: the resume key is the PAIR, not the circuit", code === 0 && J(calls) === '["T cx true"]');
    calls.length = 0; outs.length = 0; const preparedBefore = prepared; code = await cmd(["run", "--specs", "cx,er:0", "--arms", "R,A", "--out", "res.jsonl"], io());
    ok("!! when everything is done nothing is prepared or run and the report is printed; exit 0", code === 0 && calls.length === 0 && prepared === preparedBefore && outs.some((l) => /0 to run; references already there/.test(l)) && outs.some((l) => /^ARM R/.test(l)));
    errs.length = 0; files.set("other.jsonl", J({ spec: "refs", family: "refs", index: 0, auditBase: 50000, smoke: false }) + "\n"); code = await cmd(["run", "--specs", "cx", "--out", "other.jsonl"], io());
    ok("!! a file holding a record of ANOTHER audit range (version 2's 50000) is refused, not mixed: exit 1 and the message names the file and the record", code === 1 && errs.some((e) => /other\.jsonl holds 1 record\(s\) of another audit range or a smoke run \(refs\)/.test(e)));
    errs.length = 0; files.set("smoke.jsonl", J({ spec: "refs", family: "refs", index: 0, auditBase: null, smoke: true }) + "\n"); code = await cmd(["run", "--specs", "cx", "--out", "smoke.jsonl"], io());
    const e1 = errs.length; errs.length = 0; files.set("real.jsonl", J({ spec: "refs", family: "refs", index: 0, auditBase: 60000, smoke: false }) + "\n"); const codeReal = await cmd(["run", "--specs", "cx", "--out", "real.jsonl", "--smoke"], io());
    ok("!! a smoke record in a file of a real run is refused (a smoke record has no audit range), and a real record in a file of a smoke run is: exit 1 both ways with a message", code === 1 && e1 === 1 && codeReal === 1 && errs.length === 1, J([code, e1, codeReal, errs.length]));
    errs.length = 0; files.set("junk.jsonl", "{not json}\n"); code = await cmd(["run", "--specs", "cx", "--out", "junk.jsonl"], io());
    ok("an unreadable results file is refused with exit 1 and a message prefixed with the command's name", code === 1 && /^subEstimatorStudyV3: /.test(errs[0] || ""));
    errs.length = 0; outs.length = 0; code = await cmd(["report", "--in", "res.jsonl"], io());
    ok("report prints the lines of the file and exits 0; a missing file is exit 1, an empty file is exit 1 'has no records', and a bad argument is exit 2", code === 0 && outs.some((l) => /^ARM R/.test(l)) && (await cmd(["report", "--in", "nope.jsonl"], io())) === 1 && (errs.length = 0, files.set("empty.jsonl", ""), await cmd(["report", "--in", "empty.jsonl"], io())) === 1 && /has no records/.test(errs[0] || "") && (await cmd(["bogus"], io())) === 2);
    errs.length = 0; code = await cmd(["run", "--specs", "cx", "--out", "o2.jsonl", "--circuit-file", "/nonexistent/circuit.json"], io());
    ok("a circuit file that cannot be read is exit 1 'cannot read the circuit file'", code === 1 && /cannot read the circuit file/.test(errs[0] || ""));
    prepArgs.length = 0; files.delete("sm.jsonl"); await cmd(["run", "--specs", "nostate:0", "--arms", "R", "--out", "sm.jsonl", "--smoke", "--audit-base", "7", "--no-closed-loop"], io());
    ok("!! with --smoke and --audit-base 7 prepare is asked for exactly that ({ auditBase: 7, smoke: true }) and a smoke record carries no audit range", J(prepArgs) === '[{"auditBase":7,"smoke":true}]' && fileLines("sm.jsonl").map((l) => JSON.parse(l)).filter((r) => r.family !== "refs").every((r) => r.auditBase === null && r.smoke === true));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v3cmd-")); const real = path.join(tmp, "r.jsonl");
    try {
        const cmdFile = path.join(path.dirname(new URL(import.meta.url).pathname), "ship", "subEstimatorStudyV3Cmd.mjs"), cp = (await import("node:child_process")).spawnSync(process.execPath, [cmdFile, "report", "--in", real], { encoding: "utf8" });
        ok("the command file runs the command and sets the exit code from it: a report of a file that is not there prints the message and exits 1", cp.status === 1 && /subEstimatorStudyV3: /.test(cp.stderr), `${cp.status} ${cp.stderr.slice(0, 80)}`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

finished = true;
console.log("  NOT CHECKED  that a full run's numbers are right beyond what the smoke dives show (that is what the run is for); that a relu reservoir's pulse response says what the driven edge says (the registration measured both and used the driven one)");
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
