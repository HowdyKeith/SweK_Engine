// WebGLEngine/tools/subReservoirV4-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/subReservoirV4-selfcheck.mjs      (~14 s -- 13.9 s alone at v4905 WIP, to be restated at ship)
//
// THE GATE OF tools/subReservoirV4.mjs (the ring map, the matched-drive weight, the reservoir with W_in as a parameter, the edge under an arm's own input, the gains of an arm), tools/ship/subEstimatorStudyV4.mjs (one circuit under one arm, the bottom line over the two arms, the report, the
// arguments) and tools/ship/subEstimatorStudyV4Cmd.mjs: the study of brain/SUBMARINE_WIP.md "RUNG 4a VERSION 4", registered before any code for it and before any v4 circuit was scored. THE STUDY HAS NOT BEEN RUN; this gate holds the code the run will use.
//   THE CONSTANTS   the seven factors (0.9 ... 0.9999), the slots (rate 5, flag 14), the two frozen arms (FE random input, RM ring input), the audit base 70000, the top factor.
//   THE RING MAP    worked by hand on a five-cell fixture (EPG L, EPG R, PEN_a R, PEN_b L, PEG R): the rate drives PEN_R +w and PEN_L -w and no EPG, the flag drives the EPG cells +w and no PEN, nothing else is connected; w scales; a PEN input cell with no side throws. And on the REAL circuit
//                   (vendor/hemibrain): exactly 88 non-zero weights, 42 on the rate (21 positive on side R, 21 negative on side L), 46 on the flag, none elsewhere.
//   THE MATCHED WEIGHT  the rms drive of the ring map at w = 1 on two worked ticks is sqrt(2.5) = 1.5811; the weight makes the ring map's rms drive equal the random map's to 1e-9; a ring map with no drive gets weight 1.
//   THE MODEL       with the random map it is v3's model bit for bit (state and capHits); with the ring map it is not; a short W_in throws.
//   THE EDGE        under the arm's own input: no drive never blows up; a larger drive has a smaller edge; with the random map it is v3's edgeGain exactly; NO STATE gets the arm's input and no search.
//   THE STUDY       smoke dives (4 fitting, 2 held-out): FE and RM under cx, RM under NO STATE: the record, the factor on the 7-point grid, the edge found per ARM (not shared), the controls carrying the cx cells' sides; the bottom line in every branch; the arguments; the command with its io.
// NOT CHECKED, said plainly: that the numbers a full run gives are right beyond what the smoke dives show (that is what the run is for); that the ring map is a faithful model of the fly's input (it is a registered, simpler thing: see the registration's NOT TESTED).
//
// SABOTAGE LOG, 37 mutants (each applied in place, this gate run, the file restored md5-identical; reds in brackets). tools/subReservoirV4.mjs: the factor 0.9999 dropped [3], 0.9995 -> 0.9996 [1], the flag slot / the rate slot wrong [6 / 7], the side sign flipped [3], EPG given the rate [6], PEN given the flag [6],
// no side check [1], the matched weight inverted [1] or always 1 [1], rmsDrive a mean of absolute values [3], windowFor always the random map [2], the model ignoring W_in [6], the edge ignoring W_in [3], gainsFor finding the edge without W_in [1], NO STATE given the random map [1], the share over pi
// counted at pi/2 [1], the target range signed [1], RM's arm on the random input [3], the cap not counted [1], the width check removed [1], 4 bisection steps [3]. tools/ship/subEstimatorStudyV4.mjs: the audit base 60000 [5], v3's arm R accepted [8], the edge cache shared between arms (get and set) [2], the edge without W_in [1], the
// model without W_in [1], no target range in the references [2], the bottom line's PASS branches swapped [2], the FAIL-in-both wording [1], the top factor the first [2], the half threshold [1], the default arms [4], a leaking arm still read [1].
// FIRST RUNS WENT 0 RED for three, and the rows were written because of them: the edge cache keyed without the arm on the GET only (an equivalent: the cache never hit; re-run with both sides changed [2]); the model built without W_in in runCircuit (the record was only checked for its shape: now each record is RECOMPUTED here from the
// library's parts and must match, readout, lambda and gain); the FAIL-in-both wording (the row tested the arm count and the names of what was not covered but not the sentence that says the v3 conclusion survives).
// BUILT BEFORE THE RUN, AND TWO CLARIFICATIONS OF THE REGISTRATION made while building (nothing had been run): the gate is ONE file, as v3's was, not the two the registration listed; and g* is found under each arm's own W_in (the registration said 'as in v3' and the cliff depends on the drive).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as E from "./subHeadingEstimator.mjs";
import * as V from "./subReservoirV4.mjs";
import * as V3 from "./subReservoirV3.mjs";
import * as S4 from "./ship/subEstimatorStudyV4.mjs";
import * as ST from "./ship/subEstimatorStudy.mjs";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as L from "./ship/trainSubState.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol, J = JSON.stringify;
const NF = E.NF;
console.log("subReservoirV4-selfcheck -- the ring map, the fine edge and their study\n");

const cell = (i, cls, side, nt = "Exc") => ({ id: i, layer: i, nt, cls, side });
const FIX = { neurons: [cell(0, "EPG", "L"), cell(1, "EPG", "R"), cell(2, "PEN_a", "R"), cell(3, "PEN_b", "L"), cell(4, "PEG", "R")],
    edges: [[0, 2, 3, 1], [1, 3, 4, 1], [2, 0, 5, 1], [3, 1, 2, 1], [2, 4, 6, 1], [4, 0, 1, 1]], io: { inputs: [0, 1, 2, 3], outputs: [0, 1] } };
const dive = (ticks, rate, flag) => { const X = new Float32Array(ticks * NF); for (let t = 0; t < ticks; t++) { X[t * NF + 5] = rate; X[t * NF + 14] = flag; } return { ticks, X, cum: new Float32Array(ticks), delta: new Float32Array(ticks), oracle: new Float32Array(ticks), valid: new Uint8Array(ticks).fill(1) }; };
const cxCircuit = L.loadCircuit();

sec("1. THE CONSTANTS");
ok("!! the factors are the seven registered: 0.9, 0.97, 0.99, 0.995, 0.999, 0.9995, 0.9999 (v3's five and two finer), frozen", J(V.FACTORS) === J([0.9, 0.97, 0.99, 0.995, 0.999, 0.9995, 0.9999]) && Object.isFrozen(V.FACTORS));
ok("!! the slots are the heading rate (5) and the compass flag (the last, 14); the cap, the bound and the ridge grid are v3's", V.RATE_SLOT === 5 && V.FLAG_SLOT === 14 && V.FLAG_SLOT === NF - 1 && V.CAP === V3.CAP && V.BLOWUP === V3.BLOWUP && J(V.LAMBDAS) === J(V3.LAMBDAS));
ok("!! two frozen arms: FE (relu, edge grid, random input, the 64 output cells) and RM (the same with the ring input)", J(Object.keys(V.ARMS)) === J(["FE", "RM"]) && Object.isFrozen(V.ARMS) && Object.isFrozen(V.ARMS.FE) && V.ARMS.FE.input === "random" && V.ARMS.RM.input === "ring" && ["FE", "RM"].every((k) => V.ARMS[k].unit === "relu" && V.ARMS[k].grid === "edge" && V.ARMS[k].readAll === false && V.ARMS[k].id === k));
ok("!! the study's constants: the fresh audit base 70000 (not 60000, v3's), the arm ids FE and RM, the top factor 0.9999", S4.AUDIT_BASE === 70000 && J(S4.ARM_IDS) === J(["FE", "RM"]) && S4.TOP_FACTOR === 0.9999);

sec("2. THE RING MAP");
{
    const w = V.ringWeights(FIX, 2.5), at = (a, f) => w[a * NF + f];
    ok("!! on the fixture the rate drives PEN_R (+w) and PEN_L (-w) and no EPG cell: cell rows 2 (PEN_a R) = +2.5, 3 (PEN_b L) = -2.5, rows 0 and 1 (EPG) = 0", at(2, 5) === 2.5 && at(3, 5) === -2.5 && at(0, 5) === 0 && at(1, 5) === 0, `${at(0, 5)} ${at(1, 5)} ${at(2, 5)} ${at(3, 5)}`);
    ok("!! the flag drives the EPG cells (+w, both sides) and no PEN cell", at(0, 14) === 2.5 && at(1, 14) === 2.5 && at(2, 14) === 0 && at(3, 14) === 0);
    let others = 0; for (let a = 0; a < 4; a++) for (let f = 0; f < NF; f++) if (f !== 5 && f !== 14 && w[a * NF + f] !== 0) others++;
    ok("!! nothing else is connected: the other 13 features have no weight on any cell, the matrix is NI x NF and exactly 4 numbers are non-zero", others === 0 && w.length === 4 * NF && [...w].filter((x) => x !== 0).length === 4);
    ok("!! w scales it: the default is 1, and doubling w doubles every weight", V.ringWeights(FIX)[2 * NF + 5] === 1 && [...V.ringWeights(FIX, 2)].every((x, i) => x === 2 * V.ringWeights(FIX, 1)[i]));
    const bad = { ...FIX, neurons: FIX.neurons.map((n, i) => (i === 2 ? { ...n, side: undefined } : n)) };
    ok("!! a PEN input cell with no side throws (a silent zero would be a map with a hole), naming the cell", /side/.test(throws(() => V.ringWeights(bad)) || ""), String(throws(() => V.ringWeights(bad))).slice(0, 90));
    const real = V.ringWeights(cxCircuit, 1), nz = []; for (let i = 0; i < real.length; i++) if (real[i] !== 0) nz.push([Math.floor(i / NF), i % NF, real[i]]);
    const rate = nz.filter((x) => x[1] === 5), flag = nz.filter((x) => x[1] === 14);
    ok("!! on the REAL circuit exactly 88 weights are non-zero: 42 on the rate (21 positive, 21 negative), 46 on the flag, none on any other feature", nz.length === 88 && rate.length === 42 && flag.length === 46 && rate.filter((x) => x[2] > 0).length === 21 && rate.filter((x) => x[2] < 0).length === 21 && nz.length === rate.length + flag.length, `${nz.length} = ${rate.length} + ${flag.length}`);
    const cells = cxCircuit.io.inputs.map((i) => cxCircuit.neurons[i]);
    ok("!! on the real circuit every positive rate weight sits on a side-R PEN cell, every negative on a side-L PEN cell, and every flag weight on an EPG cell", rate.every((x) => cells[x[0]].cls.startsWith("PEN") && (x[2] > 0) === (cells[x[0]].side === "R")) && flag.every((x) => cells[x[0]].cls === "EPG"));
}

sec("3. THE MATCHED WEIGHT");
{
    const dv = [dive(2, 2, 1)], ring1 = V.ringWeights(FIX, 1), win0 = CS.createStatePolicy(FIX, "x").handWeights();
    ok("!! the rms drive of the ring map at w = 1 on two ticks of rate 2 and flag 1 is sqrt((1 + 1 + 4 + 4) / 4) = 1.58114 (worked by hand)", near(V.rmsDrive(FIX, ring1, dv), Math.sqrt(2.5), 1e-9), String(V.rmsDrive(FIX, ring1, dv)));
    let sq = 0; for (let t = 0; t < 2; t++) for (let a = 0; a < 4; a++) { let s = 0; for (let f = 0; f < NF; f++) s += win0[a * NF + f] * dv[0].X[t * NF + f]; sq += s * s; }
    const rndRms = Math.sqrt(sq / 8);
    ok("!! the random map's rms drive, summed independently from the seeded weights, is what rmsDrive reports", near(V.rmsDrive(FIX, V.randomWeights(FIX), dv), rndRms, 1e-9), `${rndRms.toFixed(6)}`);
    const w = V.matchedWeight(FIX, dv);
    ok("!! the matched weight is the random map's rms over the ring map's at w = 1, and with it the two maps have the same rms drive to 1e-9", near(w, rndRms / Math.sqrt(2.5), 1e-9) && near(V.rmsDrive(FIX, V.ringWeights(FIX, w), dv), rndRms, 1e-9), `w ${w.toFixed(6)}`);
    ok("!! a ring map with no drive (all-zero senses) gets weight 1, not a division by zero", V.matchedWeight(FIX, [dive(2, 0, 0)]) === 1 && V.rmsDrive(FIX, ring1, []) === 0);
    ok("!! windowFor gives the arm its map: FE the random weights, RM the ring map at the matched weight", J([...V.windowFor(V.ARMS.FE, FIX, dv)].slice(0, 20)) === J([...win0].slice(0, 20)) && J([...V.windowFor(V.ARMS.RM, FIX, dv)]) === J([...V.ringWeights(FIX, w)]));
}

sec("4. THE MODEL");
{
    const drive = [dive(40, 1.5, 1)], m3 = V3.reservoirModel(FIX, { unit: "relu", gain: 1.1 }), m4 = V.reservoirModel(FIX, { unit: "relu", gain: 1.1 });
    let h3 = m3.init(), h4 = m4.init(), same = true; for (let t = 0; t < 40; t++) { h3 = m3.step(h3, drive[0].X.subarray(t * NF, t * NF + NF)); h4 = m4.step(h4, drive[0].X.subarray(t * NF, t * NF + NF)); if (J([...h3]) !== J([...h4])) same = false; }
    ok("!! with the random map the model is v3's model bit for bit over 40 ticks (state), and the sizes and the radius agree", same && m3.n === m4.n && m3.rho === m4.rho);
    const mr = V.reservoirModel(FIX, { unit: "relu", gain: 1.1, win: V.ringWeights(FIX, 1) }); let hr = mr.init(); for (let t = 0; t < 40; t++) hr = mr.step(hr, drive[0].X.subarray(t * NF, t * NF + NF));
    ok("!! with the ring map it is a different reservoir (the state differs from the random map's)", J([...hr]) !== J([...h4]));
    ok("!! a W_in with fewer than NI x NF numbers throws, an unknown unit throws, a negative or infinite gain throws", /W_in/.test(throws(() => V.reservoirModel(FIX, { gain: 1, win: new Float64Array(3) })) || "") && /unit/.test(throws(() => V.reservoirModel(FIX, { unit: "sigmoid", gain: 1 })) || "") && throws(() => V.reservoirModel(FIX, { gain: -1 })) && throws(() => V.reservoirModel(FIX, { gain: Infinity })));
    const hot = V.reservoirModel(FIX, { unit: "relu", gain: 1.1, win: V.ringWeights(FIX, 1e6) }); let hh = hot.init(); for (let t = 0; t < 40; t++) hh = hot.step(hh, drive[0].X.subarray(t * NF, t * NF + NF));
    ok("!! a huge drive runs into the cap: no cell above CAP and the clipped ticks are counted", Math.max(...hh) <= V.CAP && hot.capHits() > 0 && m4.capHits() === 0, `${hot.capHits()} cap ticks`);
}

sec("5. THE EDGE, UNDER THE ARM'S OWN INPUT");
{
    const dv = [dive(30, 1.5, 1)], zero = new Float64Array(4 * NF), small = V.ringWeights(FIX, 1), big = V.ringWeights(FIX, 40);
    ok("!! with no drive nothing blows up at any gain: status neverBlows, the gain is the ceiling", V.edgeGain(FIX, dv, { win: zero }).status === "neverBlows" && V.edgeGain(FIX, dv, { win: zero }).gain === V3.GAIN_CEIL);
    const eS = V.edgeGain(FIX, dv, { win: small }), eB = V.edgeGain(FIX, dv, { win: big });
    ok("!! a larger drive has a smaller edge (the cliff depends on the input): w = 40 < w = 1", eB.gain < eS.gain && eB.status === "edge" && eS.status === "edge", `${eB.gain.toFixed(4)} < ${eS.gain.toFixed(4)}`);
    ok("!! with the random map the edge is v3's edgeGain exactly (same gain, status and steps)", J(V.edgeGain(FIX, dv)) === J(V3.edgeGain(FIX, dv)));
    const f = V.gainsFor(V.ARMS.RM, FIX, dv, { edge: { gain: 1.2, status: "edge" } }), fe = V.gainsFor(V.ARMS.FE, FIX, dv, { edge: { gain: 1.2, status: "edge" } });
    ok("!! gainsFor: the settings are the seven factors x g*, g* and its status are kept, the drive scale is 1, and the arm's W_in comes back with it (ring for RM, random for FE)", J(f.settings) === J(V.FACTORS.map((x) => x * 1.2)) && f.gStar === 1.2 && f.status === "edge" && f.inScale === 1 && J([...f.win]) === J([...V.windowFor(V.ARMS.RM, FIX, dv)]) && J([...fe.win].slice(0, 12)) === J([...V.randomWeights(FIX)].slice(0, 12)));
    const ns = V.gainsFor(V.ARMS.RM, FIX, dv, { persist: false });
    ok("!! NO STATE has one setting and nothing found, and still gets the arm's input (the ring map for RM)", J(ns.settings) === "[1]" && ns.gStar === null && ns.status === "noRecurrence" && J([...ns.win]) === J([...V.windowFor(V.ARMS.RM, FIX, dv)]));
    const found = V.gainsFor(V.ARMS.RM, FIX, dv, {});
    ok("!! with no edge handed over, gainsFor finds it under the ARM'S OWN input (RM's g* is the one found with the ring map, not v3's)", found.gStar === V.edgeGain(FIX, dv, { win: V.windowFor(V.ARMS.RM, FIX, dv) }).gain);
    const tr = V.targetRange([{ ticks: 3, cum: Float32Array.from([0.5, -4, 1]) }, { ticks: 2, cum: Float32Array.from([1, 2]) }, { ticks: 2, cum: Float32Array.from([0, -3.2]) }]);
    ok("!! the target's range: the largest |change| over the dives (4) and the share of dives above pi (2 of 3: the -4 and the -3.2), the empty set 0", near(tr.maxAbs, 4, 1e-6) && near(tr.overPi, 2 / 3, 1e-12) && V.targetRange([]).maxAbs === 0 && V.targetRange([]).overPi === 0);
}

sec("6. THE STUDY ON SMOKE DIVES");
{
    const data = ST.prepare({ auditBase: 70000, smoke: true }), cache = new Map(), spec = (s) => L.parseSpecs(s)[0];
    const fe = S4.runCircuit(V.ARMS.FE, spec("cx"), cxCircuit, data, { smoke: true, edgeCache: cache, closedLoop: false });
    const rm = S4.runCircuit(V.ARMS.RM, spec("cx"), cxCircuit, data, { smoke: true, edgeCache: cache, closedLoop: false });
    const rn = S4.runCircuit(V.ARMS.RM, spec("nostate:0"), cxCircuit, data, { smoke: true, edgeCache: cache, closedLoop: false });
    const onGrid = (r) => V.FACTORS.some((f) => near(r.calibration.factor, f, 1e-9));
    ok("!! a record names its arm and spec, keeps g*, its status and the factor chosen ON THE SEVEN-POINT GRID, the gain = factor x g*, a smoke record has audit base null", fe.arm === "FE" && rm.arm === "RM" && fe.spec === "cx" && fe.calibration.status === "edge" && onGrid(fe) && onGrid(rm) && near(fe.calibration.gain, fe.calibration.factor * fe.calibration.gStar, 1e-9) && fe.auditBase === null && fe.smoke === true, `FE ${fe.calibration.factor.toFixed(4)} x ${fe.calibration.gStar.toFixed(4)}, RM ${rm.calibration.factor.toFixed(4)} x ${rm.calibration.gStar.toFixed(4)}`);
    ok("!! the edge is found PER ARM and under that arm's input: FE's and RM's g* for cx differ, and the cache holds one entry for each", fe.calibration.gStar !== rm.calibration.gStar && cache.has("FE|cx") && cache.has("RM|cx") && cache.size === 2, `${fe.calibration.gStar.toFixed(5)} vs ${rm.calibration.gStar.toFixed(5)}`);
    ok("!! FE's g* is the one v3's procedure finds for cx on the same fitting dives (the only change in FE is the grid)", fe.calibration.gStar === V3.edgeGain(cxCircuit, data.fit, { rho: E.spectralRadius(CS.reservoirOf(cxCircuit)) }).gain);
    ok("!! NO STATE has no edge and a single setting, under the ring map too; the three audits are scored for every record", rn.calibration.gStar === null && rn.calibration.status === "noRecurrence" && ["audit", "safetyAudit", "reserve"].every((a) => a in fe.scores || Object.keys(fe.scores).length === 3) && Object.keys(fe.scores).length === 3 && Object.keys(rm.scores).length === 3);
    // the record recomputed from the library's own parts: the readout and the choice are what a fit of the arm's own model gives (FE random input, RM ring input)
    const refit = (arm, rec) => { const c = cxCircuit, rho = E.spectralRadius(CS.reservoirOf(c)), win = V.windowFor(arm, c, data.fit), g = V.gainsFor(arm, c, data.fit, { rho, win }), mk = (gain) => V.reservoirModel(c, { unit: "relu", gain, rho, persist: true, readAll: false, inScale: 1, win }), f = E.fitModel(mk, g.settings, V.LAMBDAS, data.fit, data.sel); return J(f.readout) === J(rec.readout) && f.lambda === rec.chosen.lambda && f.setting === rec.chosen.setting; };
    ok("!! each record is what a fit of that arm's own model gives, recomputed here from the library's parts (FE with the random input, RM with the ring input): same readout, same lambda, same gain", refit(V.ARMS.FE, fe) && refit(V.ARMS.RM, rm) && J(fe.readout) !== J(rm.readout));
    ok("!! the readout has 65 numbers (the 64 output cells and a constant), the closed loop is null when asked off", fe.readout.length === 65 && rm.readout.length === 65 && fe.closedLoop === null);
    const ctl = L.circuitFor(spec("layer:0"), cxCircuit), er = L.circuitFor(spec("er:0"), cxCircuit), dg = L.circuitFor(spec("degree:0"), cxCircuit), sg = L.circuitFor(spec("sign:0"), cxCircuit), ct = L.circuitFor(spec("count:0"), cxCircuit);
    ok("!! every control keeps the cx cells' type, side and input cells (so the SAME map is applied to each by label): ER, TYPE-BLOCK, DEGREE, SIGN, COUNT", [ctl, er, dg, sg, ct].every((c) => c.neurons.every((n, i) => n.cls === cxCircuit.neurons[i].cls && n.side === cxCircuit.neurons[i].side) && J(c.io.inputs) === J(cxCircuit.io.inputs)));
    ok("!! the ring map on a control is the same matrix as on cx (the map reads the cells, not the wiring)", J([...V.ringWeights(er, 1)]) === J([...V.ringWeights(cxCircuit, 1)]));
}

sec("7. THE BOTTOM LINE AND THE REPORT");
{
    const b = S4.bottomLine;
    ok("!! RM PASS and FE not: the v3 FAIL was an input-map confound", /input-map confound/.test(b({ FE: "FAIL", RM: "PASS" })) && /ring-map arm and not in the fine-edge arm/.test(b({ FE: "IN BETWEEN", RM: "PASS" })));
    ok("!! FE PASS and RM not: it was the approach to the edge", /approach to the edge/.test(b({ FE: "PASS", RM: "FAIL" })) && /fine-edge arm and not in the ring-map arm/.test(b({ FE: "PASS", RM: "IN BETWEEN" })));
    ok("!! PASS in both is said as both; FAIL in both says the v3 conclusion survives and names what was NOT covered", /PASS in both arms/.test(b({ FE: "PASS", RM: "PASS" })) && /FAIL in both arms -- the v3 conclusion survives a structured input and a closer approach to the edge/.test(b({ FE: "FAIL", RM: "FAIL" })) && /glomerulus-level shift/.test(b({ FE: "FAIL", RM: "FAIL" })));
    ok("!! anything else is reported as it is, with the verdicts", /no PASS in either arm/.test(b({ FE: "IN BETWEEN", RM: "FAIL" })) && /FE IN BETWEEN, RM FAIL/.test(b({ FE: "IN BETWEEN", RM: "FAIL" })));
    ok("!! an arm with no records, a leaking arm (NO STATE above 0.2) or an unassessed arm is NOT YET and is named as such", /NOT YET.*arm RM has no records/.test(b({ FE: "FAIL" })) && /NOT YET.*arm FE is not read \(leak\)/.test(b({ FE: "PASS", RM: "FAIL" }, { FE: true })) && /NOT YET.*arm RM is not assessed/.test(b({ FE: "FAIL", RM: "NOT ASSESSED" })));
    const rec = (arm, family, index, factor, skill, caps = 0) => ({ spec: family === "cx" ? "cx" : `${family}:${index}`, arm, family, index, auditBase: 70000, smoke: false, calibration: { gStar: factor === null ? null : 1.2, status: factor === null ? "noRecurrence" : "edge", factor, gain: factor === null ? 1 : factor * 1.2, inScale: 1 }, chosen: { setting: 1, lambda: 1, selRmse: 0.2 }, readout: [], closedLoop: null,
        scores: Object.fromEntries(["audit", "safetyAudit", "reserve"].map((a) => [a, { rmse: 0.3, none: 0.3, oracle: 0.01, skill, darkTicks: 100, capHits: caps }])) });
    const recs = [rec("FE", "cx", 0, 0.9999, 0.1), rec("FE", "er", 0, 0.9999, 0.1, 5), rec("FE", "er", 1, 0.99, 0.1), rec("FE", "nostate", 0, null, 0), rec("RM", "cx", 0, 0.999, 0.1), rec("RM", "er", 0, 0.9995, 0.1), rec("RM", "nostate", 0, null, 0)];
    const lines = S4.reportLines(recs).join("\n");
    ok("!! the report counts the circuits that chose the top factor per arm (FE: 2 of 3 stateful, said to be at least half; RM: 0 of 2) and reports the cap ticks", /ARM FE[\s\S]*chose the top factor 0\.9999: 2 of 3 -- at least half: the grid is still the limit/.test(lines) && /ARM RM[\s\S]*chose the top factor 0\.9999: 0 of 2(?! --)/.test(lines) && /15 ticks touched the cap|5 ticks touched the cap|ticks touched the cap/.test(lines));
    const withRefs = S4.reportLines([{ family: "refs", none: { audit: 0.3, safetyAudit: 0.3, reserve: 0.3 }, oracle: { audit: 0.01, safetyAudit: 0.01, reserve: 0.01 }, leaky: { chosen: { sigma: 0.9 }, scores: { audit: { rmse: 0.1, skill: 0.9 }, safetyAudit: { rmse: 0.1, skill: 0.9 }, reserve: { rmse: 0.1, skill: 0.9 } } }, targetRange: { audit: { maxAbs: 4.5, overPi: 0.25 }, safetyAudit: { maxAbs: 3, overPi: 0 }, reserve: { maxAbs: 2, overPi: 0 } } }, ...recs]).join("\n");
    ok("!! the references' target range is reported per audit (largest change and the share above pi) with its reading", /target \(cumulative heading change\)[^\n]*4\.50 \| 3\.00 \| 2\.00[^\n]*0\.25 \| 0\.00 \| 0\.00/.test(withRefs));
}

sec("8. THE ARGUMENTS AND THE COMMAND");
{
    const pa = (a) => S4.parseArgs(a);
    ok("!! run needs --specs and --out; the arms default to FE,RM; the audit base to 70000; an arm of v3 (R) or a repeat is refused", /specs/.test(throws(() => pa(["run", "--out", "x"])) || "") && /out/.test(throws(() => pa(["run", "--specs", "cx"])) || "") && J(pa(["run", "--specs", "cx", "--out", "x"]).arms) === J(["FE", "RM"]) && pa(["run", "--specs", "cx", "--out", "x"]).auditBase === 70000 && /unknown arm/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--arms", "R"])) || "") && /twice/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--arms", "FE,FE"])) || ""));
    ok("!! --arms picks one arm, --smoke and --no-closed-loop are flags, report needs --in, a bad first word is refused", J(pa(["run", "--specs", "cx", "--out", "x", "--arms", "RM", "--smoke", "--no-closed-loop"])) === J({ cmd: "run", specs: "cx", arms: ["RM"], out: "x", auditBase: 70000, smoke: true, closedLoop: false, circuitFile: null }) && /--in/.test(throws(() => pa(["report"])) || "") && /run or report/.test(throws(() => pa(["fly"])) || ""));
    const files = new Map(), logs = [], errs = [], calls = { circuits: [], refs: 0, prepared: [] };
    const dataFake = { fit: [], sel: [], audits: { audit: [dive(2, 1, 1)], safetyAudit: [dive(2, 1, 1)], reserve: [dive(2, 1, 1)] }, sets: {} };
    const refsFake = { family: "refs", none: { audit: 0.3, safetyAudit: 0.3, reserve: 0.3 }, oracle: { audit: 0.01, safetyAudit: 0.01, reserve: 0.01 }, leaky: { chosen: { sigma: 0.9 }, scores: { audit: { rmse: 0.1, skill: 0.9 }, safetyAudit: { rmse: 0.1, skill: 0.9 }, reserve: { rmse: 0.1, skill: 0.9 } } } };
    const io = { out: (m) => logs.push(m), err: (m) => errs.push(m), readFile: (f) => files.get(f), appendFile: (f, t) => files.set(f, (files.get(f) || "") + t), exists: (f) => files.has(f),
        prepare: (o) => { calls.prepared.push(o); return dataFake; }, runReferences: (d, o) => { calls.refs++; return { ...refsFake, auditBase: o.auditBase, smoke: !!o.smoke }; },
        runCircuit: (arm, s, c, d, o) => { calls.circuits.push(arm.id + "|" + s.family + s.index); return { spec: s.family === "cx" ? "cx" : `${s.family}:${s.index}`, arm: arm.id, family: s.family, index: s.index, auditBase: o.auditBase, smoke: !!o.smoke, calibration: { gStar: 1.2, status: "edge", factor: 0.9999, gain: 1.19988, inScale: 1 }, chosen: { setting: 1.19988, lambda: 1, selRmse: 0.2 }, readout: [], closedLoop: null, scores: Object.fromEntries(["audit", "safetyAudit", "reserve"].map((a) => [a, { rmse: 0.3, none: 0.3, oracle: 0.01, skill: 0.1, darkTicks: 10, capHits: 0 }])) }; } };
    const run = async (args) => S4.command(args, io);
    const code1 = await run(["run", "--specs", "cx,er:0", "--out", "R.jsonl"]);
    const lines1 = String(files.get("R.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
    ok("!! a run writes the references first (one record, WITH the target range of each audit) and then one record per (arm, circuit): 1 + 2 x 2 = 5 lines, exit 0", code1 === 0 && lines1.length === 5 && lines1[0].family === "refs" && lines1[0].targetRange.audit.maxAbs === 0 && ["audit", "safetyAudit", "reserve"].every((a) => a in lines1[0].targetRange) && calls.refs === 1 && calls.circuits.length === 4, `${lines1.length} lines, ${calls.circuits.join(" ")}`);
    ok("!! the audit base 70000 and the smoke flag are handed to prepare", calls.prepared[0].auditBase === 70000 && calls.prepared[0].smoke === false);
    const before = calls.circuits.length, code2 = await run(["run", "--specs", "cx,er:0,er:1", "--out", "R.jsonl"]);
    ok("!! it is resumable: a second run with one more circuit runs only that circuit under both arms (2 more calls), and runs the references no more", code2 === 0 && calls.circuits.length === before + 2 && calls.refs === 1 && calls.circuits.slice(before).every((c) => /er1$/.test(c)), `code ${code2}, calls ${calls.circuits.slice(before).join(" ")}, refs ${calls.refs}, errs ${errs.join("; ").slice(0, 160)}`);
    files.set("S.jsonl", J({ ...lines1[1], auditBase: 60000 }) + "\n"); const code3 = await run(["run", "--specs", "cx", "--out", "S.jsonl"]);
    ok("!! a results file holding another audit base is refused (exit 1), not mixed", code3 === 1 && errs.some((m) => /another audit range/.test(m)));
    const code4 = await run(["report", "--in", "R.jsonl"]);
    ok("!! report prints the arms and the bottom line for a results file; a missing file or an empty one is exit 1", code4 === 0 && logs.some((m) => /RUNG 4a v4 BOTTOM LINE/.test(m)) && logs.some((m) => /ARM FE/.test(m)) && logs.some((m) => /ARM RM/.test(m)) && (await run(["report", "--in", "nope.jsonl"])) === 1);
    ok("!! a bad argument list is exit 2 and says so", (await run(["run"])) === 2 && errs.some((m) => /subEstimatorStudyV4/.test(m)));
    const cmdSrc = fs.readFileSync(new URL("./ship/subEstimatorStudyV4Cmd.mjs", import.meta.url), "utf8");
    ok("!! the command file is three lines that import command from the study and set the exit code", /import \{ command \} from "\.\/subEstimatorStudyV4\.mjs"/.test(cmdSrc) && /process\.exitCode = await command\(process\.argv\.slice\(2\)\)/.test(cmdSrc));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
