// WebGLEngine/tools/subReservoirV5-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/subReservoirV5-selfcheck.mjs      (~10.7 s -- measured 10.4-11.0 s alone at v4905)
//
// THE GATE OF tools/subReservoirV5.mjs (the two flag-free maps, the matched weight, the windows, the gains, the signal check), tools/ship/subEstimatorStudyV5.mjs (one circuit under one arm with its in-sample skill, the bottom line, the side-coding line, the report, the arguments) and
// tools/ship/subEstimatorStudyV5Cmd.mjs: the study of brain/SUBMARINE_WIP.md "RUNG 4a VERSION 5", registered before any code for it and before any v5 circuit was scored. THE STUDY HAS NOT BEEN RUN when this gate is written; it holds the code the run will use.
//   THE CONSTANTS   the arms RMF (signed) and RMU (unsigned), frozen; the audit base 80000; the signal threshold 0.05 and its three families; v4's seven factors.
//   THE MAPS        worked by hand on a five-cell fixture (EPG L, EPG R, PEN_a R, PEN_b L, PEG R): RMF drives PEN_R +w and PEN_L -w on the rate slot only, nothing on the flag slot, nothing on an EPG cell; RMU drives both PEN cells +w. On the REAL circuit: 42 non-zero weights each, all on slot 5, none on
//                   an EPG cell or the flag; RMF 21 positive and 21 negative, RMU 42 positive. A PEN input cell with no side throws in the signed map. The flag in the senses changes nothing about the drive.
//   THE MATCHED WEIGHT  the rms drive of either map at w = 1 on two worked ticks is sqrt(2) = 1.41421; the weight makes it equal the random map's to 1e-9; no drive gives weight 1.
//   THE GAINS       the settings are the seven factors x g*, g* found under the arm's own W_in; NO STATE has one setting and still gets the arm's input; RMF and RMU have different windows.
//   THE SIGNAL CHECK  mean in-sample skill over ER, TYPE-BLOCK and DEGREE only; a mean of 0.05 is a signal, 0.04 is not; other families do not count; a record without its in-sample skill makes the check unknown.
//   THE STUDY       smoke dives: RMF and RMU under cx, RMF under NO STATE: the record, its in-sample skill (recomputed from the library), the factor on the grid, the edge per arm, each record recomputed from the library's parts, the controls carrying the cx cells' sides; every branch of the bottom line; the side-coding line; the arguments; the command.
// NOT CHECKED, said plainly: that the numbers a full run gives are right beyond what the smoke dives show (that is what the run is for); that the flag-free ring map is a faithful model of the fly's input (a registered, simpler thing).
//
// SABOTAGE LOG, 33 mutants (each applied in place, BOTH files' gate run, the file restored md5-identical; reds in brackets). tools/subReservoirV5.mjs: RMU's arm signed [4], the flag added to the map [6], EPG cells given the rate [8], the side sign flipped [3], no side check [1], the unsigned map using the sign [5], the matched weight inverted [1] or always 1 [1],
// windowFor always signed [3], gainsFor given the random window [3], SIGNAL_MIN 0.5 [3], the signal families widened to SIGN [5], missing in-sample skill read as 'no signal' [2], the rate slot 4 [14]. tools/ship/subEstimatorStudyV5.mjs: the audit base 70000 [5], v4's arm FE accepted [9], the edge cache shared between arms [4], the edge without W_in [2], the model
// without W_in [3], the in-sample skill taken on an audit [1] or dropped [2], the NO SIGNAL branch off [1], the PASS-in-both branch swapped [1], the FAIL-survives wording [1], the side-coding threshold [1] and direction [1], the signal line's verdict inverted [1], the default arms [3], a leaking arm still read [1], no target range in the references [2], the signal checks not
// handed to the bottom line [first run 0 RED -> 1 after the row that computes a report's bottom line with an RMF arm at in-sample skill 0.01], the signal check over cx only [1].
// FIRST RUNS WENT 0 RED for three: the boundary of the signal threshold (the mean of three 0.05s is 0.05000000000000001, so '>=' and '>' agreed: now one circuit at exactly SIGNAL_MIN, and a value 1e-9 below), the signal checks not reaching the bottom line (above), and one EQUIVALENT: the matched weight measured with the signed map for the unsigned arm (the rms drive does not depend on the sign, so the weight is the same; it stays, stated).
// A MEASUREMENT CORRECTED WHILE BUILDING: the v4 gate (tools/subReservoirV4-selfcheck.mjs) said '~14 s'; alone it takes 22.9 s, over the sweep's 20 s cap, because its recompute row searched for the edge again. Both gates now use two fitting dives and one held-out dive in their study rows, recompute with the cached edge, and check the edge by a blow-up test at g* and 1.003 g*
// (v4: 11.5 s, v5: 10.1 s alone).
"use strict";
import fs from "node:fs";
import * as E from "./subHeadingEstimator.mjs";
import * as V from "./subReservoirV5.mjs";
import * as V4 from "./subReservoirV4.mjs";
import * as S5 from "./ship/subEstimatorStudyV5.mjs";
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
console.log("subReservoirV5-selfcheck -- the flag-free ring maps and their study\n");

const cell = (i, cls, side, nt = "Exc") => ({ id: i, layer: i, nt, cls, side });
const FIX = { neurons: [cell(0, "EPG", "L"), cell(1, "EPG", "R"), cell(2, "PEN_a", "R"), cell(3, "PEN_b", "L"), cell(4, "PEG", "R")],
    edges: [[0, 2, 3, 1], [1, 3, 4, 1], [2, 0, 5, 1], [3, 1, 2, 1], [2, 4, 6, 1], [4, 0, 1, 1]], io: { inputs: [0, 1, 2, 3], outputs: [0, 1] } };
const dive = (ticks, rate, flag) => { const X = new Float32Array(ticks * NF); for (let t = 0; t < ticks; t++) { X[t * NF + 5] = rate; X[t * NF + 14] = flag; } return { ticks, X, cum: new Float32Array(ticks), delta: new Float32Array(ticks), oracle: new Float32Array(ticks), valid: new Uint8Array(ticks).fill(1) }; };
const cxCircuit = L.loadCircuit();

sec("1. THE CONSTANTS");
ok("!! two frozen arms: RMF (signed) and RMU (unsigned), both relu, edge grid, the 64 output cells", J(Object.keys(V.ARMS)) === J(["RMF", "RMU"]) && Object.isFrozen(V.ARMS) && V.ARMS.RMF.input === "signed" && V.ARMS.RMU.input === "unsigned" && ["RMF", "RMU"].every((k) => V.ARMS[k].id === k && V.ARMS[k].unit === "relu" && V.ARMS[k].grid === "edge" && V.ARMS[k].readAll === false && Object.isFrozen(V.ARMS[k])));
ok("!! the fresh audit base is 80000 (not v4's 70000), the arm ids are RMF and RMU, the top factor is 0.9999", S5.AUDIT_BASE === 80000 && J(S5.ARM_IDS) === J(["RMF", "RMU"]) && S5.TOP_FACTOR === 0.9999);
ok("!! the signal threshold is 0.05 over exactly ER, TYPE-BLOCK and DEGREE (frozen); the factors, the ridge grid and the slots are v4's", V.SIGNAL_MIN === 0.05 && J(V.SIGNAL_FAMILIES) === J(["er", "layer", "degree"]) && Object.isFrozen(V.SIGNAL_FAMILIES) && J(V.FACTORS) === J(V4.FACTORS) && J(V.LAMBDAS) === J(V4.LAMBDAS) && V.RATE_SLOT === 5 && V.CAP === V4.CAP);

ok("!! the re-exports are v4's own (the same function objects): the model, the edge, the score, the target range, the rms drive and the random map", V.reservoirModel === V4.reservoirModel && V.edgeGain === V4.edgeGain && V.scoreWith === V4.scoreWith && V.targetRange === V4.targetRange && V.rmsDrive === V4.rmsDrive && V.randomWeights === V4.randomWeights && V.randomWeights(FIX).length >= 4 * NF && V.targetRange([]).maxAbs === 0);

sec("2. THE MAPS");
{
    const f = V.rateWeights(FIX, 2.5), u = V.rateWeights(FIX, 2.5, { signed: false }), at = (w, a, s) => w[a * NF + s];
    ok("!! RMF on the fixture: the rate drives PEN_R (+2.5, row 2) and PEN_L (-2.5, row 3) and no EPG cell (rows 0, 1)", at(f, 2, 5) === 2.5 && at(f, 3, 5) === -2.5 && at(f, 0, 5) === 0 && at(f, 1, 5) === 0);
    let others = 0; for (let a = 0; a < 4; a++) for (let s = 0; s < NF; s++) if (s !== 5 && (f[a * NF + s] !== 0 || u[a * NF + s] !== 0)) others++;
    ok("!! NO FLAG: the flag slot (14) and every other slot are zero on every cell in both maps, and exactly 2 numbers are non-zero in each (the two PEN cells)", others === 0 && [...f].filter((x) => x !== 0).length === 2 && [...u].filter((x) => x !== 0).length === 2 && f.length === 4 * NF);
    ok("!! RMU on the fixture: both PEN cells +2.5 whatever their side, no EPG cell", at(u, 2, 5) === 2.5 && at(u, 3, 5) === 2.5 && at(u, 0, 5) === 0 && at(u, 1, 5) === 0);
    ok("!! w scales and defaults to 1", V.rateWeights(FIX)[2 * NF + 5] === 1 && V.rateWeights(FIX, 2)[3 * NF + 5] === -2);
    const bad = { ...FIX, neurons: FIX.neurons.map((n, i) => (i === 2 ? { ...n, side: undefined } : n)) };
    ok("!! a PEN input cell with no side throws in the signed map (naming it) and is fine in the unsigned one", /side/.test(throws(() => V.rateWeights(bad)) || "") && throws(() => V.rateWeights(bad, 1, { signed: false })) === null);
    const rf = V.rateWeights(cxCircuit, 1), ru = V.rateWeights(cxCircuit, 1, { signed: false }), nzOf = (w) => { const o = []; for (let i = 0; i < w.length; i++) if (w[i] !== 0) o.push([Math.floor(i / NF), i % NF, w[i]]); return o; };
    const nf = nzOf(rf), nu = nzOf(ru), cells = cxCircuit.io.inputs.map((i) => cxCircuit.neurons[i]);
    ok("!! on the REAL circuit RMF has exactly 42 non-zero weights, all on slot 5, 21 positive (side R) and 21 negative (side L), every one on a PEN cell; none on an EPG cell or the flag", nf.length === 42 && nf.every((x) => x[1] === 5 && cells[x[0]].cls.startsWith("PEN") && (x[2] > 0) === (cells[x[0]].side === "R")) && nf.filter((x) => x[2] > 0).length === 21 && nf.filter((x) => x[2] < 0).length === 21);
    ok("!! on the REAL circuit RMU has exactly 42 non-zero weights, all positive, on slot 5, on the same PEN cells as RMF", nu.length === 42 && nu.every((x) => x[1] === 5 && x[2] > 0 && cells[x[0]].cls.startsWith("PEN")) && J(nu.map((x) => x[0])) === J(nf.map((x) => x[0])));
}

sec("3. THE MATCHED WEIGHT");
{
    const dv = [dive(2, 2, 1)], win0 = CS.createStatePolicy(FIX, "x").handWeights();
    ok("!! at w = 1 either map's rms drive on two ticks of rate 2 is sqrt((4 + 4) / 4) = 1.41421 (worked by hand; the flag, 1 here, adds nothing)", near(V.rmsDrive(FIX, V.rateWeights(FIX, 1), dv), Math.SQRT2, 1e-9) && near(V.rmsDrive(FIX, V.rateWeights(FIX, 1, { signed: false }), dv), Math.SQRT2, 1e-9));
    ok("!! the flag in the senses changes nothing about the drive: the same dive with the flag at 0 and at 1 has the same rms drive under both maps", V.rmsDrive(FIX, V.rateWeights(FIX, 1), [dive(2, 2, 0)]) === V.rmsDrive(FIX, V.rateWeights(FIX, 1), [dive(2, 2, 1)]));
    let sq = 0; for (let t = 0; t < 2; t++) for (let a = 0; a < 4; a++) { let s = 0; for (let f = 0; f < NF; f++) s += win0[a * NF + f] * dv[0].X[t * NF + f]; sq += s * s; }
    const rnd = Math.sqrt(sq / 8), wf = V.matchedWeight(V.ARMS.RMF, FIX, dv), wu = V.matchedWeight(V.ARMS.RMU, FIX, dv);
    ok("!! the matched weight is the random map's rms (summed independently) over the arm's map at w = 1, and with it the drive equals the random map's to 1e-9, for both arms", near(wf, rnd / Math.SQRT2, 1e-9) && near(wu, rnd / Math.SQRT2, 1e-9) && near(V.rmsDrive(FIX, V.windowFor(V.ARMS.RMF, FIX, dv), dv), rnd, 1e-9) && near(V.rmsDrive(FIX, V.windowFor(V.ARMS.RMU, FIX, dv), dv), rnd, 1e-9), `w ${wf.toFixed(6)}`);
    ok("!! a map with no drive (all-zero senses) gets weight 1", V.matchedWeight(V.ARMS.RMF, FIX, [dive(2, 0, 0)]) === 1 && V.matchedWeight(V.ARMS.RMU, FIX, []) === 1);
    ok("!! windowFor gives each arm its own map at its own weight (RMF signed, RMU unsigned: the two windows differ)", J([...V.windowFor(V.ARMS.RMF, FIX, dv)]) === J([...V.rateWeights(FIX, wf)]) && J([...V.windowFor(V.ARMS.RMU, FIX, dv)]) === J([...V.rateWeights(FIX, wu, { signed: false })]) && J([...V.windowFor(V.ARMS.RMF, FIX, dv)]) !== J([...V.windowFor(V.ARMS.RMU, FIX, dv)]));
}

sec("4. THE GAINS");
{
    const dv = [dive(30, 1.5, 1)], g = V.gainsFor(V.ARMS.RMF, FIX, dv, { edge: { gain: 1.2, status: "edge" } });
    ok("!! the settings are the seven factors x g*, g* and its status are kept, the drive scale is 1 and the arm's window comes back with them", J(g.settings) === J(V.FACTORS.map((x) => x * 1.2)) && g.gStar === 1.2 && g.status === "edge" && g.inScale === 1 && J([...g.win]) === J([...V.windowFor(V.ARMS.RMF, FIX, dv)]));
    const ns = V.gainsFor(V.ARMS.RMU, FIX, dv, { persist: false });
    ok("!! NO STATE has one setting and nothing found and still gets the arm's input", J(ns.settings) === "[1]" && ns.gStar === null && ns.status === "noRecurrence" && J([...ns.win]) === J([...V.windowFor(V.ARMS.RMU, FIX, dv)]));
    const found = V.gainsFor(V.ARMS.RMF, FIX, dv, {});
    ok("!! with no edge handed over, g* is found under THE ARM'S OWN window (v4's edge procedure with that window), and the two arms' edges are found separately", found.gStar === V.edgeGain(FIX, dv, { win: V.windowFor(V.ARMS.RMF, FIX, dv) }).gain);
}

sec("5. THE SIGNAL CHECK");
{
    const rec = (family, skill) => ({ family, fitScore: skill === undefined ? undefined : { rmse: 0.2, skill } });
    const mk = (s) => [rec("er", s), rec("layer", s), rec("degree", s), rec("sign", 0.9), rec("cx", 0.9), rec("nostate", 0.9)];
    const a = V.signalCheck(mk(0.06)), b = V.signalCheck(mk(0.04)), c = V.signalCheck(mk(0.05));
    ok("!! a mean in-sample skill of 0.06 over ER, TYPE-BLOCK and DEGREE is a signal, 0.04 is not, and 0.05 is (at least)", a.signal === true && b.signal === false && c.signal === true && near(a.mean, 0.06, 1e-12) && a.n === 3);
    ok("!! the threshold is AT LEAST: a mean in-sample skill of exactly SIGNAL_MIN (one circuit at SIGNAL_MIN, so the mean is exact) is a signal", V.signalCheck([rec("er", V.SIGNAL_MIN)]).signal === true && V.signalCheck([rec("er", V.SIGNAL_MIN - 1e-9)]).signal === false);
    ok("!! only those three families count: SIGN, cx and NO STATE at skill 0.9 do not lift a 0.04 mean", b.signal === false && near(b.mean, 0.04, 1e-12));
    ok("!! the mean is over the circuits (two at 0.10, one at -0.02 gives 0.06), not over the families", near(V.signalCheck([rec("er", 0.1), rec("er", 0.1), rec("degree", -0.02)]).mean, 0.06, 1e-12));
    ok("!! a record without its in-sample skill, or no such records, makes the check unknown (null), not a pass", V.signalCheck([rec("er", undefined), rec("layer", 0.5)]).signal === null && V.signalCheck([]).signal === null && V.signalCheck([rec("sign", 0.9)]).signal === null);
}

sec("6. THE STUDY ON SMOKE DIVES");
{
    const data = ST.prepare({ auditBase: 80000, smoke: true }), cache = new Map(), spec = (s) => L.parseSpecs(s)[0], opts = { smoke: true, edgeCache: cache, closedLoop: false };
    data.fit = data.fit.slice(0, 2); data.sel = data.sel.slice(0, 1);   // two fitting dives and one held-out: the gate asks what the code does, not what a full run finds, and the sweep's cap is 20 s
    const rf = S5.runCircuit(V.ARMS.RMF, spec("cx"), cxCircuit, data, opts), ru = S5.runCircuit(V.ARMS.RMU, spec("cx"), cxCircuit, data, opts), rn = S5.runCircuit(V.ARMS.RMF, spec("nostate:0"), cxCircuit, data, opts);
    const onGrid = (r) => V.FACTORS.some((f) => near(r.calibration.factor, f, 1e-9));
    ok("!! a record names its arm and spec, keeps g*, its status and the factor ON THE SEVEN-POINT GRID, gain = factor x g*, a smoke record has audit base null", rf.arm === "RMF" && ru.arm === "RMU" && rf.spec === "cx" && rf.calibration.status === "edge" && onGrid(rf) && onGrid(ru) && near(rf.calibration.gain, rf.calibration.factor * rf.calibration.gStar, 1e-9) && rf.auditBase === null && rf.smoke === true, `RMF ${rf.calibration.factor.toFixed(4)} x ${rf.calibration.gStar.toFixed(4)}, RMU ${ru.calibration.factor.toFixed(4)} x ${ru.calibration.gStar.toFixed(4)}`);
    ok("!! the edge is found PER ARM under that arm's own input: RMF's and RMU's g* for cx differ and the cache holds one entry for each", rf.calibration.gStar !== ru.calibration.gStar && cache.has("RMF|cx") && cache.has("RMU|cx") && cache.size === 2, `${rf.calibration.gStar.toFixed(5)} vs ${ru.calibration.gStar.toFixed(5)}`);
    const refit = (arm, rec) => { const c = cxCircuit, rho = E.spectralRadius(CS.reservoirOf(c)), win = V.windowFor(arm, c, data.fit), g = V.gainsFor(arm, c, data.fit, { rho, win, edge: cache.get(arm.id + "|cx") }), mk = (gain) => V.reservoirModel(c, { unit: "relu", gain, rho, persist: true, readAll: false, inScale: 1, win }), f = E.fitModel(mk, g.settings, V.LAMBDAS, data.fit, data.sel); return { same: J(f.readout) === J(rec.readout) && f.lambda === rec.chosen.lambda && f.setting === rec.chosen.setting, fit: V.scoreWith(mk(f.setting), f.readout, data.fit) }; };
    // the edge of a record, checked WITHOUT searching for it again: driven by the fitting dives under the arm's own window, no cell passes the bound at g* and some cell does at 1.003 g* (the bisection is 16 steps: its answer is within 1e-4 of the edge)
    const blowsAt = (arm, gain) => { const rho = E.spectralRadius(CS.reservoirOf(cxCircuit)), m = V.reservoirModel(cxCircuit, { unit: "relu", gain, rho, win: V.windowFor(arm, cxCircuit, data.fit) }); for (const d of data.fit) { let h = m.init(); for (let t = 0; t < d.ticks; t++) { h = m.step(h, d.X.subarray(t * NF, t * NF + NF)); for (let i = 0; i < h.length; i++) if (h[i] > V.BLOWUP) return true; } } return false; };
    ok("!! each record's g* is the edge of THAT ARM'S OWN input: no cell passes the bound at g*, and one does at 1.003 g*, for both arms (checked without searching again)", [[V.ARMS.RMF, rf], [V.ARMS.RMU, ru]].every(([arm, r]) => !blowsAt(arm, r.calibration.gStar) && blowsAt(arm, r.calibration.gStar * 1.003)));
    const a = refit(V.ARMS.RMF, rf), b = refit(V.ARMS.RMU, ru);
    ok("!! each record is what a fit of that arm's own model gives, recomputed from the library's parts (same readout, lambda, gain) and the two arms' readouts differ", a.same && b.same && J(rf.readout) !== J(ru.readout));
    ok("!! each record carries its IN-SAMPLE skill: the score of the fitted readout on the FITTING dives, as the library scores it (rmse and skill, both arms)", near(rf.fitScore.skill, a.fit.skill, 1e-12) && near(rf.fitScore.rmse, a.fit.rmse, 1e-12) && near(ru.fitScore.skill, b.fit.skill, 1e-12) && Number.isFinite(rf.fitScore.skill) && rf.fitScore.skill !== rf.scores.audit.skill);
    ok("!! NO STATE has no edge and one setting, under the arm's input too; the readout has 65 numbers; three audits are scored", rn.calibration.gStar === null && rn.calibration.status === "noRecurrence" && rf.readout.length === 65 && Object.keys(rf.scores).length === 3 && ["audit", "safetyAudit", "reserve"].every((x) => x in rf.scores) && rf.closedLoop === null && rn.fitScore.skill === 0);
    const er = L.circuitFor(spec("er:0"), cxCircuit), tb = L.circuitFor(spec("layer:0"), cxCircuit), dg = L.circuitFor(spec("degree:0"), cxCircuit);
    ok("!! the controls keep the cx cells' type, side and input cells, so the SAME map applies to each by label (ER, TYPE-BLOCK, DEGREE) and the map is the same matrix as on cx", [er, tb, dg].every((c) => c.neurons.every((n, i) => n.cls === cxCircuit.neurons[i].cls && n.side === cxCircuit.neurons[i].side) && J(c.io.inputs) === J(cxCircuit.io.inputs) && J([...V.rateWeights(c, 1)]) === J([...V.rateWeights(cxCircuit, 1)])));
}

sec("7. THE BOTTOM LINE AND THE REPORT");
{
    const b = S5.bottomLine, T = { RMF: true, RMU: true };
    ok("!! NO SIGNAL in the signed arm: the bottom line says so, says the arm tells nothing about the wiring and what would change next, whatever the verdicts", /NO SIGNAL in the flag-free ring-map arm/.test(b({ RMF: "FAIL", RMU: "FAIL" }, {}, { RMF: false, RMU: true })) && /says nothing about the wiring/.test(b({ RMF: "PASS", RMU: "PASS" }, {}, { RMF: false, RMU: false })) && /readout or the cells read, not the wiring/.test(b({ RMF: "FAIL", RMU: "FAIL" }, {}, { RMF: false })));
    ok("!! RMF PASS with a signal: RMU PASS too is 'whatever the sign'; RMU not passing (or without signal) is the side-coded turn signal", /PASS in both arms.*whatever the sign/.test(b({ RMF: "PASS", RMU: "PASS" }, {}, T)) && /side-coded arm and not in the unsigned one/.test(b({ RMF: "PASS", RMU: "FAIL" }, {}, T)) && /side-coded arm and not in the unsigned one/.test(b({ RMF: "PASS", RMU: "PASS" }, {}, { RMF: true, RMU: false })));
    ok("!! RMF FAIL with a signal: the v4 conclusion survives a ring map without the flag, names the unsigned verdict (and its NO SIGNAL) and what was not covered", /v4 conclusion survives a ring map without the flag \(unsigned control: FAIL\)/.test(b({ RMF: "FAIL", RMU: "FAIL" }, {}, T)) && /unsigned control: IN BETWEEN, NO SIGNAL/.test(b({ RMF: "FAIL", RMU: "IN BETWEEN" }, {}, { RMF: true, RMU: false })) && /glomerulus-level shift/.test(b({ RMF: "FAIL", RMU: "FAIL" }, {}, T)));
    ok("!! anything else is reported as it is, and a missing, leaking or unassessed arm is NOT YET", /no PASS in the flag-free ring-map arm, reported as it is \(RMF IN BETWEEN, RMU FAIL\)/.test(b({ RMF: "IN BETWEEN", RMU: "FAIL" }, {}, T)) && /NOT YET.*arm RMU has no records/.test(b({ RMF: "FAIL" }, {}, T)) && /NOT YET.*arm RMF is not read \(leak\)/.test(b({ RMF: "PASS", RMU: "FAIL" }, { RMF: true }, T)) && /NOT YET.*arm RMU is not assessed/.test(b({ RMF: "FAIL", RMU: "NOT ASSESSED" }, {}, T)));
    const rec = (arm, family, index, factor, skill, fitSkill, caps = 0) => ({ spec: family === "cx" ? "cx" : `${family}:${index}`, arm, family, index, auditBase: 80000, smoke: false, calibration: { gStar: factor === null ? null : 1.2, status: factor === null ? "noRecurrence" : "edge", factor, gain: factor === null ? 1 : factor * 1.2, inScale: 1 }, chosen: { setting: 1, lambda: 1, selRmse: 0.2 }, readout: [], closedLoop: null,
        fitScore: fitSkill === undefined ? undefined : { rmse: 0.2, skill: fitSkill }, scores: Object.fromEntries(["audit", "safetyAudit", "reserve"].map((a) => [a, { rmse: 0.3, none: 0.3, oracle: 0.01, skill, darkTicks: 100, capHits: caps }])) });
    const fams = ["cx", "er", "er", "layer", "layer", "degree", "degree", "sign", "count", "nostate"];
    const mkArm = (arm, skillOf, fitOf) => fams.map((f, i) => rec(arm, f, i, f === "nostate" ? null : 0.99, skillOf(f), fitOf(f)));
    const recs = [...mkArm("RMF", (f) => (f === "er" ? 0.3 : 0.1), () => 0.08), ...mkArm("RMU", (f) => (f === "er" ? 0.1 : 0.1), () => 0.01)];
    const lines = S5.reportLines(recs).join("\n");
    ok("!! the report prints each arm's signal check with the mean in-sample skill, the circuit count and the verdict of the check (RMF SIGNAL at 0.080, RMU NO SIGNAL at 0.010)", /ARM RMF[\s\S]*signal check \(registered\): mean in-sample skill[^\n]*0\.080 \(6 circuits; the arm needs 0\.05\): SIGNAL/.test(lines) && /ARM RMU[\s\S]*0\.010 \(6 circuits; the arm needs 0\.05\): NO SIGNAL -- this arm says nothing about the wiring/.test(lines));
    ok("!! the side-coding line (reading e): over the families present RMF exceeds RMU by more than 0.05 only in ER (0.30 against 0.10): 1 of 6 families, so it 'does not matter' in most", /RMF against RMU \(reading e\)[^\n]*ER 0\.30 \/ 0\.10[^\n]*exceeds RMU by more than 0\.05 in 1 of 6 families -- the side coding does not matter in most families/.test(lines));
    ok("!! the report closes with the bottom line, and a missing signal field reads NOT KNOWN", /BOTTOM LINE/.test(lines.split("\n").at(-1)) && /NOT KNOWN/.test(S5.reportLines(mkArm("RMF", () => 0.1, () => undefined).concat(mkArm("RMU", () => 0.1, () => undefined))).join("\n")));
    const fams3 = ["cx", "er", "er", "er", "layer", "layer", "layer", "degree", "degree", "degree", "nostate"], mkArm3 = (arm, fitOf) => fams3.map((f, i) => rec(arm, f, i, f === "nostate" ? null : 0.99, 0.1, fitOf(f)));
    const nsLines = S5.reportLines([...mkArm3("RMF", () => 0.01), ...mkArm3("RMU", () => 0.08)]);
    ok("!! the report's bottom line is computed WITH the signal checks: an RMF arm whose in-sample skill is 0.01 ends 'NO SIGNAL in the flag-free ring-map arm' whatever its verdict", /NO SIGNAL in the flag-free ring-map arm/.test(nsLines.at(-1)) && !/survives/.test(nsLines.at(-1)));
    const refsLine = S5.reportLines([{ family: "refs", none: { audit: 0.3, safetyAudit: 0.3, reserve: 0.3 }, oracle: { audit: 0.01, safetyAudit: 0.01, reserve: 0.01 }, leaky: { chosen: { sigma: 0.9 }, scores: { audit: { rmse: 0.1, skill: 0.9 }, safetyAudit: { rmse: 0.1, skill: 0.9 }, reserve: { rmse: 0.1, skill: 0.9 } } }, targetRange: { audit: { maxAbs: 4.5, overPi: 0.25 }, safetyAudit: { maxAbs: 3, overPi: 0 }, reserve: { maxAbs: 2, overPi: 0 } } }, ...recs]).join("\n");
    ok("!! the references' target range is reported per audit with its reading, and the top-factor count per arm is kept (RMF: 8 of 8 stateful circuits chose 0.99, none 0.9999)", /target \(cumulative heading change\)[^\n]*4\.50 \| 3\.00 \| 2\.00[^\n]*0\.25 \| 0\.00 \| 0\.00/.test(refsLine) && /chose the top factor 0\.9999: 0 of 9(?! --)/.test(lines));
}

sec("8. THE ARGUMENTS AND THE COMMAND");
{
    const pa = (a) => S5.parseArgs(a);
    ok("!! run needs --specs and --out; the arms default to RMF,RMU; the audit base to 80000; v4's arm FE or a repeat is refused", /specs/.test(throws(() => pa(["run", "--out", "x"])) || "") && /out/.test(throws(() => pa(["run", "--specs", "cx"])) || "") && J(pa(["run", "--specs", "cx", "--out", "x"]).arms) === J(["RMF", "RMU"]) && pa(["run", "--specs", "cx", "--out", "x"]).auditBase === 80000 && /unknown arm/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--arms", "FE"])) || "") && /twice/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--arms", "RMF,RMF"])) || ""));
    ok("!! --arms picks one arm, --smoke and --no-closed-loop are flags, report needs --in, a bad first word is refused", J(pa(["run", "--specs", "cx", "--out", "x", "--arms", "RMU", "--smoke", "--no-closed-loop"])) === J({ cmd: "run", specs: "cx", arms: ["RMU"], out: "x", auditBase: 80000, smoke: true, closedLoop: false, circuitFile: null }) && /--in/.test(throws(() => pa(["report"])) || "") && /run or report/.test(throws(() => pa(["fly"])) || ""));
    const files = new Map(), logs = [], errs = [], calls = { circuits: [], refs: 0, prepared: [] };
    const dataFake = { fit: [], sel: [], audits: { audit: [dive(2, 1, 1)], safetyAudit: [dive(2, 1, 1)], reserve: [dive(2, 1, 1)] }, sets: {} };
    const refsFake = { family: "refs", none: { audit: 0.3, safetyAudit: 0.3, reserve: 0.3 }, oracle: { audit: 0.01, safetyAudit: 0.01, reserve: 0.01 }, leaky: { chosen: { sigma: 0.9 }, scores: { audit: { rmse: 0.1, skill: 0.9 }, safetyAudit: { rmse: 0.1, skill: 0.9 }, reserve: { rmse: 0.1, skill: 0.9 } } } };
    const io = { out: (m) => logs.push(m), err: (m) => errs.push(m), readFile: (f) => files.get(f), appendFile: (f, t) => files.set(f, (files.get(f) || "") + t), exists: (f) => files.has(f),
        prepare: (o) => { calls.prepared.push(o); return dataFake; }, runReferences: (d, o) => { calls.refs++; return { ...refsFake, auditBase: o.auditBase, smoke: !!o.smoke }; },
        runCircuit: (arm, s, c, d, o) => { calls.circuits.push(arm.id + "|" + s.family + s.index); return { spec: s.family === "cx" ? "cx" : `${s.family}:${s.index}`, arm: arm.id, family: s.family, index: s.index, auditBase: o.auditBase, smoke: !!o.smoke, calibration: { gStar: 1.2, status: "edge", factor: 0.9999, gain: 1.19988, inScale: 1 }, chosen: { setting: 1.19988, lambda: 1, selRmse: 0.2 }, readout: [], closedLoop: null, fitScore: { rmse: 0.2, skill: 0.1 }, scores: Object.fromEntries(["audit", "safetyAudit", "reserve"].map((a) => [a, { rmse: 0.3, none: 0.3, oracle: 0.01, skill: 0.1, darkTicks: 10, capHits: 0 }])) }; } };
    const run = async (args) => S5.command(args, io);
    const code1 = await run(["run", "--specs", "cx,er:0", "--out", "R.jsonl"]);
    const lines1 = String(files.get("R.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
    ok("!! a run writes the references first (one record WITH the target range of each audit) and then one record per (arm, circuit): 1 + 2 x 2 = 5 lines, exit 0", code1 === 0 && lines1.length === 5 && lines1[0].family === "refs" && ["audit", "safetyAudit", "reserve"].every((a) => a in lines1[0].targetRange) && calls.refs === 1 && calls.circuits.length === 4, `${lines1.length} lines, ${calls.circuits.join(" ")}`);
    ok("!! the audit base 80000 and the smoke flag are handed to prepare", calls.prepared[0].auditBase === 80000 && calls.prepared[0].smoke === false);
    const before = calls.circuits.length, code2 = await run(["run", "--specs", "cx,er:0,er:1", "--out", "R.jsonl"]);
    ok("!! it is resumable: a second run with one more circuit runs only that circuit under both arms (2 more calls) and not the references again", code2 === 0 && calls.circuits.length === before + 2 && calls.refs === 1 && calls.circuits.slice(before).every((c) => /er1$/.test(c)), `code ${code2}, calls ${calls.circuits.slice(before).join(" ")}, errs ${errs.join("; ").slice(0, 120)}`);
    files.set("S.jsonl", J({ ...lines1[1], auditBase: 70000 }) + "\n"); const code3 = await run(["run", "--specs", "cx", "--out", "S.jsonl"]);
    ok("!! a results file holding another audit base (v4's 70000) is refused (exit 1), not mixed", code3 === 1 && errs.some((m) => /another audit range/.test(m)));
    const code4 = await run(["report", "--in", "R.jsonl"]);
    ok("!! report prints the arms, the signal check and the bottom line for a results file; a missing file is exit 1; a bad argument list is exit 2", code4 === 0 && logs.some((m) => /RUNG 4a v5 BOTTOM LINE/.test(m)) && logs.some((m) => /ARM RMF/.test(m)) && logs.some((m) => /signal check/.test(m)) && (await run(["report", "--in", "nope.jsonl"])) === 1 && (await run(["run"])) === 2 && errs.some((m) => /subEstimatorStudyV5/.test(m)));
    const cmdSrc = fs.readFileSync(new URL("./ship/subEstimatorStudyV5Cmd.mjs", import.meta.url), "utf8");
    ok("!! the command file is three lines that import command from the study and set the exit code", /import \{ command \} from "\.\/subEstimatorStudyV5\.mjs"/.test(cmdSrc) && /process\.exitCode = await command\(process\.argv\.slice\(2\)\)/.test(cmdSrc));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
