// WebGLEngine/brain/pilotSubCircuitState-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotSubCircuitState-selfcheck.mjs      (~9 s)
//
// THE GATE OF brain/pilotSubCircuitState.mjs: a submarine pilot whose only memory is a circuit's wiring. Every number is worked out by hand on two circuits of three cells.
//
// CIRCUIT A (a chain): cells 0 > 1 > 2, edges 0>1 count 3 and 1>2 count 4, all excitatory; input cell 0, output cell 2. The matrix has two entries, 3 and 4, in different rows and columns, so its largest singular value is 4 and the scaled gains are
//   0>1: 0.75 and 1>2: 1.0. Weights: the input cell reads feature 1 with weight 1 (input gain 1), bias 0, sigma 1, the pitch output reads cell 2 with weight 2. With feature 1 held at 0.2 the cells read, tick by tick:
//   tick 1 [0.2, 0, 0] | tick 2 [0.2, 0.15, 0] | tick 3 [0.2, 0.15, 0.15]  -> the pitch residual is 2 x 0.15 = 0.3 at tick 3. Switch the input off at tick 4: [0, 0.15, 0.15] | tick 5 [0, 0, 0.15] | tick 6 [0, 0, 0]: the memory is two ticks.
//   With sigma 0.5: tick 3 reads [0.2, 0.075, 0.0375]. With sigma written as 2 it acts as 1, written as -1 as 0. With NO STATE tick 3 reads [0.2, 0, 0].
// CIRCUIT B (inhibition): cells 0 (excitatory), 1, 2 (inhibitory); edges 0>1 count 2 (+) and 2>1 count 2 (-); the matrix [[0,0,0],[2,0,-2],[0,0,0]] has rank 1 and largest singular value sqrt(8) = 2.828427, the gains +0.707107 and -0.707107.
//   Input cells 0 and 2 (features 1 and 2, weight 1), output cell 1. With features 0.2 and 0.1: tick 2 reads cell 1 = 0.707107 x (0.2 - 0.1) = 0.0707107; with features 0.2 and 0.4 the inhibition wins and cell 1 reads 0.
//
// SABOTAGED -- 65 mutants of brain/pilotSubCircuitState.mjs, each run alone in a scratch tree with this gate, and every one red BY NAME (the list, with the number of rows each broke):
//   the circuit's refusals: one cell, no io, an empty / repeated / outside input list, outputs unchecked (2), an edge outside the cells, a self-loop, a repeated pair, a count of zero, a wrong-signed edge (2), an edge of sign 0 from an unlabeled cell;
//   the singular value: inputs and outputs swapped (18), not iterated (16), a Frobenius norm (10), signs ignored (5), the eigenvalue not square-rooted (15); the gains: not scaled (10), signs lost, edges grouped by target (10) or pointing the wrong way (11);
//   the start: the input gain changed (12) or taken out (found 0 red, see below), the bias changed, no sigma (2), the bias not the starting activity (2), the input scale / sigma / seed changed (found 0 red, see below);
//   the dynamics: sigma not clamped when read, allowed above 1, not applied to the recurrent input (2), the state not used (11), NO STATE keeping its state, a negative activity sent on (found 0 red), the sensors reaching the first cells instead of the input cells (2), only 14 features reaching the cells (2), a non-finite feature read as non-zero in the sensors / in the law, no relu (3);
//   the readout and the pilot: the first cells read instead of the outputs (5), no readout bias, the residual replacing the autopilot (6) or dropped (6), pitch clamped to 2 (2), yaw unclamped (2), a non-finite output not 0, the activity not reset for a new dive, a new dive recognised at every call (4), the compass flag always valid / always dark / missing read as dark, the new activity not kept (4), the readout of the old activity (2);
//   the search: sigma unclamped by mutate / perturb, mutate able to change no weight, a search accepting a worse child, ignoring its seed or a given start, prune keeping everything or reverting everything, the wrap not applied (2), the weight count forgetting sigma (6), NO STATE the default (12).
//   FIRST RUN, 8 FINDINGS: S03 was a pattern that matched nothing (the mutant never ran; pattern fixed, now 2 red); S12 (sign 0 from an unlabeled cell: the existing row had a sign of 1, which the label check alone refuses -> a row with sign 0); S17 (a guard for no edges that the first product of the iteration makes
//   unnecessary: DEAD CODE, CUT -- the row 'no edges: 0' still holds); S23, S25, S27 (the start's input scale, sigma and seed -- nothing pinned them, because the output weights start at zero and the start is the autopilot whatever the input weights are -> the frozen STATE_INIT row, with the sigma and bias of handWeights(), the spread of
//   its input weights, and PINNED values of the first three weights read off the code once); S34 (a cell below zero sends nothing: the relu never makes one, so a row hands update() one from outside); S37 (the input gain was 1, so taking it out changed nothing -> a row with an init that has 2). After the fixes the seven re-run mutants are red (S03 2 rows, S12 1, S23 2, S25 1, S27 2, S34 1, S37 1).
//   NOT SABOTAGED: the report line's text beyond the singular value, the power iteration's 1000-step cap and 1e-13 stop (a graph that does not settle is not in the vendored data), and the pilot's behaviour on states the dive runner never hands it.
//
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "./pilotSubCircuitState.mjs";
import * as PC from "./pilotSubCircuit.mjs";
import * as PS from "./pilotSubPolicy.mjs";
import * as A from "./autopilotSub.mjs";
import * as T from "./subTask.mjs";
import * as D from "../tools/subDropout.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const J = (v) => JSON.stringify(v), near = (a, b, tol) => Math.abs(a - b) <= tol, nearAll = (a, b, tol) => a.length === b.length && a.every((v, i) => near(v, b[i], tol));
console.log("pilotSubCircuitState-selfcheck -- a pilot whose only memory is a wiring\n");

const cellsOf = (...nts) => nts.map((nt, i) => ({ id: i, layer: i, nt }));
const CA = { neurons: cellsOf("Exc", "Exc", "Exc"), edges: [[0, 1, 3, 1], [1, 2, 4, 1]], io: { inputs: [0], outputs: [2] } };
const CB = { neurons: cellsOf("Exc", "Exc", "Inh"), edges: [[0, 1, 2, 1], [2, 1, 2, -1]], io: { inputs: [0, 2], outputs: [1] } };
const F = 15;
const X = (o) => { const x = new Array(F).fill(0); for (const [i, v] of Object.entries(o)) x[i] = v; return x; };
// weight layout for a circuit with NI inputs, N cells, NO outputs: [W_in: F x NI][bias: N][sigma][W_out: 4 x NO][b_out: 4]
const layout = (NI, N, NO) => ({ b: F * NI, sigma: F * NI + N, w2: F * NI + N + 1, b2: F * NI + N + 1 + 4 * NO });
const wA = (P, { sigma = 1 } = {}) => { const w = P.zeroWeights(), o = layout(1, 3, 1); w[0 * F + 1] = 1; w[o.sigma] = sigma; w[o.w2 + 0] = 2; return w; };   // the pitch output reads cell 2 with weight 2
const run = (P, w, xs) => { let h = new Float64Array(P.HIDDEN); const out = []; for (const x of xs) { const r = P.step(w, x, h); h = r.h; out.push({ h: Array.from(h), c: r.controls }); } return out; };

sec("1. reservoirOf: the circuit as arrays, and what it refuses");
guarded("section 1", () => {
    const r = C.reservoirOf(CA);
    ok("three cells, two edges in file order with their counts and signs, the input and output cells as given", r.N === 3 && r.E === 2 && J(Array.from(r.from)) === "[0,1]" && J(Array.from(r.to)) === "[1,2]" && J(Array.from(r.mag)) === "[3,4]" && J(Array.from(r.sign)) === "[1,1]" && J(r.inputs) === "[0]" && J(r.outputs) === "[2]");
    const bad = (mut) => throws(() => C.reservoirOf(mut));
    const withEdge = (e) => ({ ...CA, edges: [CA.edges[0], e] });
    const rows = [["nothing", () => bad(null), /a circuit is \{ neurons, edges, io/], ["a circuit with no io", () => bad({ neurons: CA.neurons, edges: CA.edges }), /io: \{ inputs, outputs \}/], ["one cell", () => bad({ ...CA, neurons: [CA.neurons[0]], edges: [], io: { inputs: [0], outputs: [0] } }), /1 neurons are not a circuit/],
        ["no input cells", () => bad({ ...CA, io: { inputs: [], outputs: [2] } }), /io\.inputs must be a non-empty list of distinct cell indices/], ["an input cell listed twice", () => bad({ ...CA, io: { inputs: [0, 0], outputs: [2] } }), /io\.inputs/], ["an input cell outside the circuit", () => bad({ ...CA, io: { inputs: [3], outputs: [2] } }), /io\.inputs/],
        ["a fractional input cell", () => bad({ ...CA, io: { inputs: [0.5], outputs: [2] } }), /io\.inputs/], ["no output cells", () => bad({ ...CA, io: { inputs: [0], outputs: [] } }), /io\.outputs must be a non-empty list/], ["an output cell outside the circuit", () => bad({ ...CA, io: { inputs: [0], outputs: [-1] } }), /io\.outputs/],
        ["an edge outside the cells", () => bad(withEdge([1, 3, 1, 1])), /edge 1 \[1, 3\] is outside the 3 neurons/], ["a self-loop", () => bad(withEdge([2, 2, 1, 1])), /edge 1 is a self-loop on neuron 2/], ["a repeated pair", () => bad(withEdge([0, 1, 1, 1])), /edge 1 repeats the pair 0 -> 1/],
        ["a count of zero", () => bad(withEdge([1, 2, 0, 1])), /edge 1 has count 0/], ["a sign that is not its source's", () => bad(withEdge([1, 2, 4, -1])), /edge 1 has sign -1 but its source cell 1 is Exc/], ["an edge from a cell with no label", () => bad({ ...CA, neurons: cellsOf("Exc", "Exc", "Unlabeled"), edges: [CA.edges[0], [2, 0, 1, 1]] }), /source cell 2 is Unlabeled/],
        ["an edge of sign 0 from a cell with no label (the sign matches the label's 0 and still it is refused)", () => bad({ ...CA, neurons: cellsOf("Exc", "Exc", "Unlabeled"), edges: [CA.edges[0], [2, 0, 1, 0]] }), /edge 1 has sign 0 but its source cell 2 is Unlabeled/]];
    for (const [what, f, re] of rows) { const e = f(); ok(`reservoirOf refuses ${what} by name`, e !== null && /^pilotSubCircuitState\.reservoirOf: /.test(e) && re.test(e), e || "did not throw"); }
});

sec("2. the largest singular value");
guarded("section 2", () => {
    const sv = (c) => C.largestSingularValue(C.reservoirOf(c));
    ok("a chain with entries 3 and 4 in different rows and columns: 4 (to 1e-9)", near(sv(CA), 4, 1e-9), String(sv(CA)));
    ok("a rank-one signed matrix [[0,0,0],[2,0,-2],[0,0,0]]: sqrt(8) = 2.828427 (to 1e-9)", near(sv(CB), Math.sqrt(8), 1e-9), String(sv(CB)));
    ok("a single edge of count 5: 5; no edges: 0", near(sv({ ...CA, edges: [[0, 1, 5, 1]] }), 5, 1e-9) && sv({ ...CA, edges: [] }) === 0);
    const full = { neurons: cellsOf("Exc", "Exc"), edges: [[0, 1, 1, 1], [1, 0, 1, 1]], io: { inputs: [0], outputs: [1] } };
    ok("two cells wired to each other with count 1: the matrix is [[0,1],[1,0]] and its largest singular value is 1; with a count of 3 one way and 4 the other it is 4", near(sv(full), 1, 1e-9) && near(sv({ ...full, edges: [[0, 1, 3, 1], [1, 0, 4, 1]] }), 4, 1e-9));
    ok("a negative sign does not change the size of a single edge (count 5, inhibitory source): 5", near(sv({ neurons: cellsOf("Inh", "Exc"), edges: [[0, 1, 5, -1]], io: { inputs: [0], outputs: [1] } }), 5, 1e-9));
    ok("deterministic: the same value twice, to the bit", sv(CB) === sv(CB));
    const P = C.createStatePolicy(CB);
    ok("the policy reports it: sigmaMax 2.828427 and the report line says so", near(P.sigmaMax, Math.sqrt(8), 1e-9) && /largest singular value 2\.828 scaled to 1/.test(P.reportLines()[0]), P.reportLines()[0]);
});

sec("3. the dynamics, tick by tick, worked by hand");
guarded("section 3", () => {
    const P = C.createStatePolicy(CA, "A"), w = wA(P), on = X({ 1: 0.2 }), off = X({});
    const r = run(P, w, [on, on, on, off, off, off]);
    ok("circuit A, input on: the cells read [0.2, 0, 0], [0.2, 0.15, 0], [0.2, 0.15, 0.15] (gains 0.75 and 1.0)", nearAll(r[0].h, [0.2, 0, 0], 1e-6) && nearAll(r[1].h, [0.2, 0.15, 0], 1e-6) && nearAll(r[2].h, [0.2, 0.15, 0.15], 1e-6), J(r.slice(0, 3).map((x) => x.h.map((v) => +v.toFixed(4)))));
    ok("input off: [0, 0.15, 0.15], [0, 0, 0.15], [0, 0, 0] -- the memory is two ticks", nearAll(r[3].h, [0, 0.15, 0.15], 1e-6) && nearAll(r[4].h, [0, 0, 0.15], 1e-6) && nearAll(r[5].h, [0, 0, 0], 1e-6), J(r.slice(3).map((x) => x.h.map((v) => +v.toFixed(4)))));
    ok("the pitch control is the autopilot's law plus the readout: 0 + 2 x cell 2 = 0, 0, 0.3 over the first three ticks, 0.3 at tick 4, 0.3 at tick 5, 0 at tick 6 (the law is 0: feature 2 is 0)", nearAll(r.map((x) => x.c.pitch), [0, 0, 0.3, 0.3, 0.3, 0], 1e-6), J(r.map((x) => +x.c.pitch.toFixed(4))));
    const half = run(P, wA(P, { sigma: 0.5 }), [on, on, on]);
    ok("sigma 0.5 halves each hop: tick 3 reads [0.2, 0.075, 0.0375]", nearAll(half[2].h, [0.2, 0.075, 0.0375], 1e-6), J(half[2].h));
    const hi = run(P, wA(P, { sigma: 2 }), [on, on, on]), lo = run(P, wA(P, { sigma: -1 }), [on, on, on]);
    ok("sigma is clamped to [0, 1] where it is read: written as 2 it acts as 1 (tick 3 [0.2, 0.15, 0.15]), written as -1 it acts as 0 (no recurrence: [0.2, 0, 0])", nearAll(hi[2].h, [0.2, 0.15, 0.15], 1e-6) && nearAll(lo[2].h, [0.2, 0, 0], 1e-6));
    const NS = C.createStatePolicy(CA, "A-nostate", { persist: false }), ns = run(NS, wA(NS), [on, on, on]);
    ok("NO STATE: the activity of the last tick is not used, so tick 3 reads [0.2, 0, 0] (no recurrence) and the readout stays 0", nearAll(ns[2].h, [0.2, 0, 0], 1e-9) && ns.every((x) => x.c.pitch === 0) && NS.persist === false && P.persist === true);
    const PB = C.createStatePolicy(CB, "B"), wb = PB.zeroWeights(), ob = layout(2, 3, 1); wb[0 * F + 1] = 1; wb[1 * F + 2] = 1; wb[ob.sigma] = 1; wb[ob.w2 + 0] = 1;
    const b1 = run(PB, wb, [X({ 1: 0.2, 2: 0.1 }), X({ 1: 0.2, 2: 0.1 })]), b2 = run(PB, wb, [X({ 1: 0.2, 2: 0.4 }), X({ 1: 0.2, 2: 0.4 })]);
    ok("circuit B: excitation from cell 0 (0.2) less inhibition from cell 2 (0.1) at the gain 0.707107 reads 0.0707107 on cell 1 at tick 2; with the inhibition at 0.4 it wins and cell 1 reads 0 -- the sign is the SOURCE's", near(b1[1].h[1], 0.0707107, 1e-6) && b1[0].h[1] === 0 && b2[1].h[1] === 0 && near(b1[1].h[0], 0.2, 1e-9) && near(b1[1].h[2], 0.1, 1e-9), J(b1[1].h));
    const wb2 = PB.zeroWeights(); wb2[0 * F + 1] = 1; wb2[ob.sigma] = 1; wb2[ob.b + 1] = 0.05;
    ok("a cell's bias drives it before anything else: cell 1 with bias 0.05 and no input reads 0.05 at tick 1; a negative bias is shut by the relu (reads 0)", near(run(PB, wb2, [X({})])[0].h[1], 0.05, 1e-7) && (() => { const wn = PB.zeroWeights(); wn[ob.b + 1] = -0.5; return run(PB, wn, [X({})])[0].h[1] === 0; })());
    const wneg = PB.zeroWeights(); wneg[0 * F + 1] = -1; wneg[ob.sigma] = 1;
    ok("the input step is a relu: an input cell driven negative (feature 1 of 0.2 at weight -1) is silent and sends nothing on (cell 1 reads 0 at tick 2)", run(PB, wneg, [X({ 1: 0.2 }), X({ 1: 0.2 })])[1].h[1] === 0 && run(PB, wneg, [X({ 1: 0.2 })])[0].h[0] === 0);
    const wnon = PB.zeroWeights(); wnon[0 * F + 1] = 1; wnon[ob.sigma] = 1;
    ok("a cell that is not an input cell receives no sensor drive: in circuit B cell 1 reads 0 at tick 1 whatever the features are (and cell 0, an input, reads its drive)", run(PB, wnon, [X({ 1: 0.2, 2: 0.9, 5: 3 })])[0].h[1] === 0 && near(run(PB, wnon, [X({ 1: 0.2 })])[0].h[0], 0.2, 1e-9));
    ok("a cell below zero sends nothing on: handed the activity [-1, 0, 0] from outside (the relu never makes one) circuit A's cell 1 stays at its bias 0.5 instead of being pulled to 0.5 - 0.75 x 1", near(C.createStatePolicy(CA, "A").update(Object.assign(wA(P), { [layout(1, 3, 1).b + 1]: 0.5 }), X({}), Float64Array.from([-1, 0, 0]))[1], 0.5, 1e-9));
    const g2 = C.createStatePolicy(CA, "A-gain2", {}, { ...C.STATE_INIT, inputGain: 2 });
    ok("the input gain is the one in the init handed to the policy: with 2 the input cell reads 0.4 (feature 0.2 at weight 1) where the shipped 1 reads 0.2", near(run(g2, wA(g2), [on])[0].h[0], 0.4, 1e-9) && near(run(P, w, [on])[0].h[0], 0.2, 1e-9) && C.STATE_INIT.inputGain === 1);
    const wf = PB.zeroWeights(); wf[0 * F + 14] = 1; wf[ob.sigma] = 1;
    ok("the 15th feature is an input like the others: weight 1 from feature 14 to cell 0 reads that feature (0.7 gives 0.7)", near(run(PB, wf, [X({ 14: 0.7 })])[0].h[0], 0.7, 1e-9));
    const wnan = PB.zeroWeights(); wnan[0 * F + 1] = 1; wnan[ob.b + 0] = 0.5; wnan[ob.sigma] = 1;
    ok("a non-finite feature is read as 0 in the sensors: with a bias of 0.5 on cell 0, feature 1 = NaN or Infinity leaves the cell at its bias 0.5", near(run(PB, wnan, [X({ 1: NaN })])[0].h[0], 0.5, 1e-9) && near(run(PB, wnan, [X({ 1: Infinity })])[0].h[0], 0.5, 1e-9));
    ok("a non-finite feature is read as 0 in the autopilot's law too: thrust with feature 1 = NaN and feature 7 = 0.4 is 0.2", near(PB.step(PB.zeroWeights(), X({ 1: NaN, 7: 0.4 }), new Float64Array(3)).controls.thrust, 0.2, 1e-9));
    const big = PB.zeroWeights(); [50, -50, 50, -50].forEach((v, o) => { big[ob.b2 + o] = v; });
    const nanw = PB.zeroWeights(); for (let o = 0; o < 4; o++) nanw[ob.b2 + o] = NaN;
    const yc = PB.step(big, X({}), new Float64Array(3)).controls;
    ok("the four controls clamp to [-1, 1] both ways (+50 -> 1, -50 -> -1) and a NaN readout bias reads as 0", yc.pitch === 1 && yc.yaw === -1 && yc.thrust === 1 && yc.ballast === -1 && Object.values(PB.step(nanw, X({}), new Float64Array(3)).controls).every((v) => v === 0));
    const wlaw = PB.zeroWeights(), small = X({ 1: 0.1, 2: 0.05, 3: 0.1, 4: 0.02, 5: 0.05, 6: 0.01, 7: 0.1, 8: 0.2, 9: -0.1 }), ys = PB.step(wlaw, small, new Float64Array(3)).controls;
    ok("with every weight at zero the pilot is the autopilot's laws: pitch 0.225 - 0.24 = -0.015, yaw 3 pi x 0.02 - 0.1 - 0.004 = 0.0845, thrust 0.15, ballast 0.045", near(ys.pitch, -0.015, 1e-9) && near(ys.yaw, 3 * Math.PI * 0.02 - 0.104, 1e-9) && near(ys.thrust, 0.15, 1e-9) && near(ys.ballast, 0.045, 1e-9), J(ys));
});

sec("4. the pilot in a dive: reset, the compass flag, the start");
guarded("section 4", () => {
    const P = C.createStatePolicy(CA, "A"), w = wA(P), st = { vel: [2, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0], pos: [0, 0, -30] };
    const t1 = { depth: 30, heading: 0, speed: 2 }, t2 = { depth: 30, heading: 0, speed: 2 };
    const w1 = P.zeroWeights(), o = layout(1, 3, 1); w1[0 * F + 0] = 1; w1[o.sigma] = 1; w1[o.w2 + 0] = 1;   // the input cell reads the bias feature (always 1); the pitch output reads cell 2
    const pilot = P.pilotFor(w1);
    const base = P.pilotFor(P.zeroWeights())(st, t1, [0, 0, 0]).pitch, p = [1, 2, 3, 4].map(() => pilot(st, t1, [0, 0, 0]).pitch - base);
    ok("flown as a pilot (state, target, current): the residual on the pitch grows tick by tick as the signal crosses the chain -- 0, 0, then (cell 2 reads 0.75 once, from the 3rd tick on): ticks 1 to 4 add 0, 0, 0.75, 0.75 to the autopilot's pitch", nearAll(p, [0, 0, 0.75, 0.75], 1e-4), J(p.map((v) => +v.toFixed(4))));
    const again = pilot(st, t2, [0, 0, 0]).pitch - base, cont = pilot(st, t2, [0, 0, 0]).pitch - base;
    ok("a NEW target object starts a new dive: the activity is cleared (the next tick is again a first tick: 0), while the same target object carries on (the second tick: still 0 -- the signal has not crossed yet)", near(again, 0, 1e-6) && near(cont, 0, 1e-6));
    const third = [pilot(st, t2, [0, 0, 0]).pitch - base, pilot(st, t2, [0, 0, 0]).pitch - base];
    ok("and the dive goes on from there (ticks 3 and 4 of the second dive add 0.75 again)", nearAll(third, [0.75, 0.75], 1e-3), J(third));
    const PB = C.createStatePolicy({ neurons: cellsOf("Exc", "Exc"), edges: [[0, 1, 1, 1]], io: { inputs: [0], outputs: [1] } }, "flag"), wfl = PB.zeroWeights(), ol = layout(1, 2, 1); wfl[0 * F + 14] = 1; wfl[ol.sigma] = 1; wfl[ol.w2 + 2 * 1 + 0] = 0.5;   // the thrust output reads cell 1
    const pf = PB.pilotFor(wfl), t3 = { depth: 30, heading: 0, speed: 2 };
    const lawThrust = A.pilot()(st, t3, [0, 0, 0]).thrust, v = [0, 0, 0].map(() => pf(st, t3, [0, 0, 0], { compassValid: 1 }).thrust - lawThrust), tg = { ...t3 }, pf2 = PB.pilotFor(wfl);
    const dark = [0, 0, 0].map(() => pf2(st, tg, [0, 0, 0], { compassValid: 0 }).thrust - lawThrust), none = PB.pilotFor(wfl), t4 = { ...t3 }, nn = [0, 0, 0].map(() => none(st, t4, [0, 0, 0]).thrust - lawThrust);
    ok("the 15th feature is the compass flag: told 'valid' (compassValid 1) the input cell reads 1, so the thrust gains 0, then 0.5 x 1, ... ; told 'dark' (compassValid 0) it reads 0 and the thrust gains nothing; told nothing (no 4th argument) it is read as valid",
        v[2] > 0.4 && nearAll(dark, [0, 0, 0], 1e-9) && nearAll(nn, v, 1e-9), J(v.map((x) => +x.toFixed(3))) + " / " + J(dark) + " / " + J(nn.map((x) => +x.toFixed(3))));
    const real = JSON.parse(fs.readFileSync(path.join(ENG, "vendor/hemibrain/hemibrain-cx-heading-loop.json"), "utf8")), circuit = { neurons: real.neurons, edges: real.edges, io: real.io };
    const R = C.createStatePolicy(circuit, "CX", { wrap: (pl) => D.dropout(pl) }), NSR = C.createStatePolicy(circuit, "CX-nostate", { persist: false, wrap: (pl) => D.dropout(pl) }), w0 = R.handWeights(), hw = PS.handWeights();
    let worst = 0, s = 9; const rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; let h = new Float64Array(148);
    for (let q = 0; q < 100; q++) { const x = Array.from({ length: 15 }, (_, f) => (f === 0 ? 1 : (rng() - 0.5) * 2)), r = R.step(w0, x, h); h = r.h; const b = PS.forward(hw, x.slice(0, 14)); for (const k of ["pitch", "yaw", "thrust", "ballast"]) worst = Math.max(worst, Math.abs(r.controls[k] - b[k])); }
    ok("the real circuit's pilot STARTS AS THE AUTOPILOT: over 100 ticks of random features the largest difference from the existing hand weights is " + worst.toExponential(1), worst < 1e-6);
    const set = T.TRAIN_SET.slice(0, 4), apd = T.evaluate(D.dropout(A.pilot()), set), st0 = R.evaluate(w0, set), ns0 = NSR.evaluate(NSR.handWeights(), set);
    ok("flown with the compass dropout on four training dives the start scores exactly what the autopilot scores with the same dropout, with and without state (to 1e-9)", near(st0.score, apd.score, 1e-9) && near(ns0.score, apd.score, 1e-9) && st0.runs.length === 4, `${st0.score.toFixed(6)} / ${ns0.score.toFixed(6)} vs ${apd.score.toFixed(6)}`);
    ok("the wrapped evaluation sees the dropout: the same weights flown WITHOUT the wrap score better than with it (the dropout costs the autopilot something)", C.createStatePolicy(circuit, "CX-nowrap").evaluate(w0, T.TRAIN_SET).score > R.evaluate(w0, T.TRAIN_SET).score + 0.05);
});

sec("5. training: the existing recipe on this pilot");
guarded("section 5", () => {
    const P = C.createStatePolicy(CB, "B"), set = T.TRAIN_SET.slice(0, 2), r1 = P.train({ seed: 3, iters: 8, trainSet: set }), r2 = P.train({ seed: 3, iters: 8, trainSet: set }), r3 = P.train({ seed: 4, iters: 8, trainSet: set });
    ok("a short search is deterministic for a seed, different for another, never lowers its score, and reports its own score", J(Array.from(r1.weights)) === J(Array.from(r2.weights)) && r1.trainScore === r2.trainScore && J(Array.from(r1.weights)) !== J(Array.from(r3.weights)) && r1.trainScore >= P.evaluate(P.handWeights(), set).score - 1e-9 && near(r1.trainScore, P.evaluate(r1.weights, set).score, 1e-9));
    let s = 5; const rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, w = P.handWeights();
    const ms = Array.from({ length: 80 }, () => Array.from(P.mutate(w, 0.3, rng, 4)).filter((v, i) => v !== w[i]).length), distinct = new Set(ms);
    ok("mutate changes 1 to 4 weights (80 draws: never 0, never more than 4, all of 1 to 4 seen) and not its parent", Math.min(...ms) >= 1 && Math.max(...ms) <= 4 && [1, 2, 3, 4].every((k) => distinct.has(k)) && J(Array.from(w)) === J(Array.from(P.handWeights())));
    const hit = []; for (let i = 0; i < 4000; i++) { const m = P.mutate(P.handWeights(), 5, rng, 4); hit.push(m[P.SIGMA_INDEX]); }
    ok("sigma stays in [0, 1] however hard it is mutated (4,000 mutations with a step of 5), reaching both ends", hit.every((v) => v >= 0 && v <= 1) && hit.some((v) => v === 0) && hit.some((v) => v === 1));
    const pp = P.perturb(P.handWeights(), 5, rng);
    ok("perturb moves every weight except where sigma is pinned to an end, and keeps sigma in [0, 1]", pp[P.SIGMA_INDEX] >= 0 && pp[P.SIGMA_INDEX] <= 1 && Array.from(pp).every((v, i) => i === P.SIGMA_INDEX || v !== P.handWeights()[i]));
    const wild = P.perturb(P.handWeights(), 0.05, rng), pw = P.prune(wild, { trainSet: set }), base = P.handWeights(), kept = []; for (let i = 0; i < P.WEIGHT_COUNT; i++) if (Math.abs(pw.weights[i] - base[i]) > 1e-6) kept.push(i);
    ok("prune ends at a fixed point and kept something: putting any ONE kept weight back lowers the train score (up to 12 checked)", kept.length >= 1 && pw.kept === kept.length && pw.moved === P.WEIGHT_COUNT && kept.slice(0, 12).every((i) => { const v = Float32Array.from(pw.weights); v[i] = base[i]; return P.evaluate(v, set).score < pw.trainScore - 1e-9; }), `${pw.moved} moved, ${pw.kept} kept`);
    const k0 = P.train({ seed: 9, iters: 0, start: r1.weights, trainSet: set });
    ok("a search given a start begins from it (no children: the same weights and score); pruning the start moves nothing", J(Array.from(k0.weights)) === J(Array.from(r1.weights)) && P.prune(P.handWeights(), { trainSet: set }).moved === 0);
});

sec("6. the real heading loop (vendor/hemibrain/hemibrain-cx-heading-loop.json)");
guarded("section 6", () => {
    const real = JSON.parse(fs.readFileSync(path.join(ENG, "vendor/hemibrain/hemibrain-cx-heading-loop.json"), "utf8")), circuit = { neurons: real.neurons, edges: real.edges, io: real.io }, R = C.reservoirOf(circuit);
    ok("148 cells, 7,080 edges, 88 input cells and 64 output cells; 15 x 88 + 148 + 1 + 4 x 64 + 4 = 1,729 trained weights; the recurrent weights are not among them", R.N === 148 && R.E === 7080 && R.inputs.length === 88 && R.outputs.length === 64 && C.createStatePolicy(circuit).WEIGHT_COUNT === 1729);
    const sv = C.largestSingularValue(R);
    ok("the largest singular value of its signed count matrix is 950.87 (to 0.05): the scaling that makes the recurrent map non-expanding is large because the counts are", near(sv, 950.866, 0.05), sv.toFixed(3));
    const P = C.createStatePolicy(circuit), w = P.handWeights(); let h = new Float64Array(148); const x = Array.from({ length: 15 }, (_, f) => (f === 0 ? 1 : 0.5));
    for (let t = 0; t < 200; t++) h = P.update(w, x, h);
    const top = Math.max(...h);
    ok("under a constant input the cells settle to an activity of order one (largest 0.5 to 3) and most are active, not saturated or silent", top > 0.5 && top < 3 && Array.from(h).filter((v) => v > 0).length > 60, `largest ${top.toFixed(3)}, ${Array.from(h).filter((v) => v > 0).length} active`);
    const w1 = P.handWeights(), nIn = 15 * 88; let sum = 0, sum2 = 0; for (let i = 0; i < nIn; i++) { sum += w1[i]; sum2 += w1[i] * w1[i]; }
    const mean = sum / nIn, sd = Math.sqrt(sum2 / nIn - mean * mean);
    ok("the start of everything that is not the circuit is the frozen STATE_INIT {seed 4711, inScale 0.2, inputGain 1, sigma0 0.95, bias 0}: sigma 0.95 and every bias 0 in handWeights(), the input weights of mean 0 and spread 0.2 (the sample: mean " + mean.toFixed(4) + ", sd " + sd.toFixed(4) + ")", Object.isFrozen(C.STATE_INIT) && J(C.STATE_INIT) === '{"seed":4711,"inScale":0.2,"inputGain":1,"sigma0":0.95,"bias":0}' && near(w1[P.SIGMA_INDEX], 0.95, 1e-6) && Array.from(w1.slice(nIn, nIn + 148)).every((v) => v === 0) && near(mean, 0, 0.01) && near(sd, 0.2, 0.01));
    ok("PINNED, not worked by hand (these were read off this code once): the first three input weights of seed 4711 are -0.044074, -0.444712, -0.376250 (to 1e-5), so a different seed or a different draw order shows", near(w1[0], -0.044074, 1e-5) && near(w1[1], -0.444712, 1e-5) && near(w1[2], -0.376250, 1e-5));
    ok("the controls of brain/pilotSubCircuit.mjs keep the circuit's io and give valid reservoirs of the same 148 cells and 7,080 edges (ER, TYPE-BLOCK via the cell type, DEGREE, SIGN, COUNT)", Object.entries(PC.CONTROLS).every(([k, f]) => { const c = f(circuit, 7); const r = C.reservoirOf(c); return J(c.io) === J(circuit.io) && r.N === 148 && r.E === 7080; }));
});

sec("7. NOT CHECKED");
console.log("  NOT CHECKED  that the pilot can use its memory: this gate holds the build (the start is the autopilot, the dynamics are the ones worked by hand, the reset and the flag do what they say); whether a search finds a use for the wiring is the experiment's");
console.log("  NOT CHECKED  that the singular-value scaling is the right way to make a reservoir of a connectome (it is the one the note fixed); the fly's own gain is not known");

// v4898 -- FEATURES by name (definitionGates counts an export no gate names): the stateful pilot reads the base policy's features plus ONE (the carried state's input), which is what sizes its input weights.
ok("FEATURES is the base policy's FEATURES + 1 (the extra input the carried state occupies)", C.FEATURES === PS.FEATURES + 1 && C.FEATURES > PS.FEATURES);
finished = true;
console.log(fails ? `\npilotSubCircuitState-selfcheck: ${fails} FAILED` : "\npilotSubCircuitState-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
