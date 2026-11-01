// WebGLEngine/brain/pilotSubCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotSubCircuit-selfcheck.mjs      (~7 s)
//
// THE GATE OF brain/pilotSubCircuit.mjs: a submarine pilot whose only path from the sensors to the controls is a circuit's wiring, and the controls that say what the wiring did. Every number is worked out by hand on a fixture of
// EIGHT cells (the real circuit is read at the end, from the vendored file, for the totals its notes quote).
//
// THE FIXTURE (cell: layer, transmitter): 0: 2 Exc | 1: 2 Inh | 2: 2 Exc | 3: 1 Exc | 4: 1 Inh | 5: 0 Exc | 6: 0 Exc | 7: 0 unlabeled. Input cells (the outermost layer) 0 1 2; output cells (layer 0) 5 6 7. Edges [from, to, count, sign]:
//   e0 0>3 x2 + | e1 1>3 x1 - | e2 2>4 x1 + | e3 3>5 x3 + | e4 3>6 x1 + | e5 4>6 x2 - | e6 4>5 x1 - | e7 5>6 x1 +        8 edges, counts sum 12 (mean 1.5).   Weights: 14 x 3 + 8 + 8 + 4 x 3 + 4 = 74.
// THE HAND-WORKED PASS (x1 = 0.2, x2 = 0.1, the rest 0; W1 cell0 <- 10 x f1, cell2 <- 20 x f2; no bias; recurrent magnitudes e0..e7 = 1.5 1 1 1 2 1 1 0.5): the input step gives cells 0..2 = 2 0 2; each step is the carry plus
//   magnitude x sign x the source's last activity, then relu:  step 1: cell3 = 3, cell4 = 2 | step 2: cell3 = 6, cell4 = 4, cell5 = 3 - 2 = 1 ... worked in full in the rows below; after 3 steps the cells read [2, 0, 2, 9, 6, 3, 12.5, 0].
//   Readout rows (pitch -0.04 0.01 7 | yaw 0.1 -0.02 0 | thrust 0 0.05 0 | ballast 1 0 0), b2 (0 0 0 -0.5): residuals 0.005, 0.05, 0.625, 2.5; the autopilot's laws on these features: 0.45, 0, 0.2, 0 -> 0.455, 0.05, 0.825, 1 (clamped).
//   With cell 1 (inhibitory) also driven (W1 cell1 <- 10 x f1) the cells read [2, 2, 2, 3, 6, 0, 0, 0]: the inhibition shuts the outputs.
//
// SABOTAGED -- 92 mutants of brain/pilotSubCircuit.mjs, each applied in a scratch tree and run alone against this gate, every one red by a row that names it EXCEPT TWO THAT HANG (M27, M28: the layer control's draw loop never finds a free pair, so
// the gate never ends -- TIMEOUT at 150 s, red as a gate that never ends and not by a row name, the same convention as pilotSubFish-selfcheck's P04 and P22):
//   topologyOf M01 one cell is a circuit | M02 a fractional layer | M03 a negative layer | M04 only layer 0 | M05 no output cells | M06 every cell above layer 0 is an input | M07 layer 1 is an output too | M08 a target past the last cell |
//   M09 a self-loop | M10 a repeated pair | M11 a count of zero | M12 a wrong-signed edge | M13 a sign-0 edge from an unlabeled cell | M14 Exc and Inh swapped (red as the fixture no longer being a valid circuit)
//   reachOf M15 a step short | M16 a step too many | M17 the last input's pairs only | M18 every input reaches | M19 no output counted as reached | M20 any cell counts as an output
//   controls M21 a self-loop drawn | M22 a repeat drawn | M23 every redrawn edge excitatory | M24 redrawn edges lose their counts | M25 ER sources from every cell | M26 ER ignores its seed | M27 LAYER source from the target's layer (HANGS) |
//   M28 LAYER target from the source's layer (HANGS) | M29 LAYER sources from unlabeled cells | M30 LAYER ignores its seed | M31 DEGREE swaps nothing | M32 DEGREE allows a self-loop | M33 DEGREE allows a repeat | M34 DEGREE forgets which pairs exist |
//   M35 DEGREE makes no attempts | M36 DEGREE ignores its seed | M37 SIGN does not permute | M38 SIGN keeps the old edge signs | M39 SIGN permutes the unlabeled cell in | M40 SIGN ignores its seed | M41 COUNT does not permute |
//   M42 COUNT makes every count 1 | M43 COUNT flips the signs | M44 COUNT ignores its seed
//   the start M45 the seed of the input weights | M46 the input scale | M47 no bias | M48 recurrent start ignores the counts | M49 not scaled by the mean | M50 the readout does not start at zero
//   the autopilot's laws M51-M58 (one term each: the pitch error read from the pitch rate, the pitch-rate term from the error, the heading term without pi, the yaw-rate term and the sideslip term without their scales, the speed term's sign,
//   the depth term and the climb term without their scales)
//   the pass M59 no bias at the input step | M60 sensors on the first cells | M61 no relu at the input step | M62 a step short | M63 no carry | M64 Dale's law off | M65 the source's sign ignored | M66 an edge runs backwards | M67 no relu in the steps |
//   M68 readout from the first cells | M69 no readout bias | M70 the residual replaces the autopilot | M71 the residual dropped | M72 pitch clamps to 2 | M73 ballast clamps to 2 | M74 yaw does not clamp | M75 a non-finite output not read as 0 |
//   M76 a non-finite feature in the sensors | M77 a non-finite feature in the law
//   the recipe M78 mutate may change nothing | M79 mutate changes at most one | M80 perturb leaves one weight | M81 a search accepts a worse child | M82 a neutral child never replaces | M83 a search ignores its seed | M84 a search ignores a given start |
//   M85 prune keeps everything | M86 prune reverts everything | M87 prune passes once | M88 prune ignores `toward` | M89-M92 the report and the weight count
// WHAT THE SABOTAGE FOUND, FIXED IN THE GATE: seven 0-red mutants the first time. M60 (the sensors on the first cells) because the fixture's input cells ARE the first cells -- a chain 4>3>2>1>0 whose only input cell is cell 4 now carries it, and
// worked by hand it shows the carry ACCUMULATES (cell 3 reads 1, 2, 3); M61 (no relu at the input step) because no input cell was ever driven negative -- a second small circuit now drives one; M75-M77 (non-finite values) because the
// relu zeroes a NaN before it can be seen -- the rows now put a bias on the cell and a feature the law uses, and clamp all four outputs both ways; M84 (a search ignores a given start): no row gave one; M86 (prune reverts everything) because a
// prune that kept nothing passed a fixed-point row over an empty list -- the row now needs something kept. M14 and M01 first went red only as "section ran to the end"; the first row now names the fixture.
// NOT TRIED: the BFS `seen` test in reachOf (equivalent: a node expanded again at a later step reaches only nodes a shorter walk already reached, so the set within `steps` is the same).
//
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "./pilotSubCircuit.mjs";
import * as PS from "./pilotSubPolicy.mjs";
import * as A from "./autopilotSub.mjs";
import * as T from "./subTask.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const J = (v) => JSON.stringify(v), near = (a, b, tol) => Math.abs(a - b) <= tol;
const nearAll = (a, b, tol) => a.length === b.length && a.every((v, i) => near(v, b[i], tol));
console.log("pilotSubCircuit-selfcheck -- a pilot whose only path is a circuit's wiring\n");

// ---- the fixture ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const NEURONS = [[2, "Exc"], [2, "Inh"], [2, "Exc"], [1, "Exc"], [1, "Inh"], [0, "Exc"], [0, "Exc"], [0, "Unlabeled"]].map(([layer, nt], i) => ({ id: 100 + i, layer, nt }));
const EDGES = [[0, 3, 2, 1], [1, 3, 1, -1], [2, 4, 1, 1], [3, 5, 3, 1], [3, 6, 1, 1], [4, 6, 2, -1], [4, 5, 1, -1], [5, 6, 1, 1]];
const FIX = { neurons: NEURONS, edges: EDGES };
const N = 8, E = 8, NI = 3, NO = 3, F = 14, WC = F * NI + N + E + 4 * NO + 4;   // 74
const OFF = { b: F * NI, rec: F * NI + N, w2: F * NI + N + E, b2: F * NI + N + E + 4 * NO };
const X = (o) => { const x = new Array(14).fill(0); for (const [i, v] of Object.entries(o)) x[i] = v; return x; };
function handBuilt(P, { drive1 = false, rec = [1.5, 1, 1, 1, 2, 1, 1, 0.5] } = {}) {
    const w = P.zeroWeights();
    w[0 * F + 1] = 10; w[2 * F + 2] = 20; if (drive1) w[1 * F + 1] = 10;
    rec.forEach((m, k) => { w[OFF.rec + k] = m; });
    [[-0.04, 0.01, 7], [0.1, -0.02, 0], [0, 0.05, 0], [1, 0, 0]].forEach((row, o) => row.forEach((v, j) => { w[OFF.w2 + o * NO + j] = v; }));
    w[OFF.b2 + 3] = -0.5;
    return w;
}

// ================================================================================================================================================================================================================
sec("1. topologyOf: the circuit as arrays, and what it refuses");
guarded("section 1", () => {
    let t = null; const e0 = throws(() => { t = C.topologyOf(FIX); });
    ok("the fixture is a valid circuit (every edge's sign is its source cell's)", e0 === null, e0 || "");
    if (!t) return;
    ok("8 cells, 8 edges; the input cells are the outermost layer (0 1 2) and the output cells layer 0 (5 6 7); layers and signs by cell (the unlabeled cell has none)", t.N === 8 && t.E === 8 && J(t.inputs) === "[0,1,2]" && J(t.outputs) === "[5,6,7]" && J(t.layer) === "[2,2,2,1,1,0,0,0]" && J(t.sg) === "[1,-1,1,1,-1,1,1,0]" && t.top === 2);
    ok("the edges are kept as typed arrays in file order with their counts and signs", J(Array.from(t.from)) === "[0,1,2,3,3,4,4,5]" && J(Array.from(t.to)) === "[3,3,4,5,6,6,5,6]" && J(Array.from(t.count)) === "[2,1,1,3,1,2,1,1]" && J(Array.from(t.sign)) === "[1,-1,1,1,1,-1,-1,1]");
    const bad = (mut) => throws(() => C.topologyOf(mut));
    const withEdge = (e) => ({ neurons: NEURONS, edges: [...EDGES.slice(0, 7), e] });
    const rows = [
        ["nothing", () => bad(null), /a circuit is \{ neurons/], ["one cell", () => bad({ neurons: [NEURONS[0]], edges: [] }), /1 neurons are not a circuit/],
        ["a layer that is not a whole number", () => bad({ neurons: NEURONS.map((n, i) => (i === 3 ? { ...n, layer: 1.5 } : n)), edges: EDGES }), /neuron 3 has layer 1\.5/], ["a negative layer", () => bad({ neurons: NEURONS.map((n, i) => (i === 3 ? { ...n, layer: -1 } : n)), edges: EDGES }), /neuron 3 has layer -1/],
        ["every cell in layer 0", () => bad({ neurons: NEURONS.map((n) => ({ ...n, layer: 0 })), edges: [] }), /every neuron is in layer 0/], ["no layer 0", () => bad({ neurons: NEURONS.map((n) => ({ ...n, layer: n.layer + 1 })), edges: [] }), /no neuron in layer 0/],
        ["an edge outside the cells", () => bad(withEdge([0, 8, 1, 1])), /edge 7 \[0, 8\] is outside the 8 neurons/], ["a negative cell index", () => bad(withEdge([-1, 5, 1, 1])), /outside the 8 neurons/], ["a self-loop", () => bad(withEdge([5, 5, 1, 1])), /edge 7 is a self-loop on neuron 5/],
        ["a repeated pair", () => bad(withEdge([3, 5, 1, 1])), /edge 7 repeats the pair 3 -> 5/], ["a count of zero", () => bad(withEdge([5, 6, 0, 1])), /edge 7 has count 0/], ["a negative count", () => bad(withEdge([5, 6, -1, 1])), /count -1/],
        ["a sign that is not its source's", () => bad(withEdge([5, 6, 1, -1])), /edge 7 has sign -1 but its source cell 5 is Exc/], ["an edge from a cell with no label", () => bad(withEdge([7, 6, 1, 1])), /edge 7 has sign 1 but its source cell 7 is Unlabeled/],
        ["an edge with sign 0", () => bad(withEdge([7, 6, 1, 0])), /edge 7 has sign 0/],
    ];
    for (const [what, f, re] of rows) { const e = f(); ok(`topologyOf refuses ${what} by name`, e !== null && /^pilotSubCircuit\.topologyOf: /.test(e) && re.test(e), e || "did not throw"); }
});

// ================================================================================================================================================================================================
sec("2. the policy: its shape and its forward pass, worked by hand");
guarded("section 2", () => {
    const P = C.createCircuitPolicy(FIX, "fixture");
    ok("74 weights (14 x 3 inputs + 8 biases + 8 edges + 4 x 3 readout + 4), 8 cells, 8 edges, 3 input cells, 3 output cells, 4 outputs, 3 recurrent steps; the contract names are all there", P.WEIGHT_COUNT === WC && P.HIDDEN === 8 && P.REC_EDGES === 8 && P.INPUT_CELLS === 3 && P.OUTPUT_CELLS === 3 && P.OUTPUTS === 4 && P.REC_STEPS === 3 && P.FEATURES === 14 &&
        ["zeroWeights", "forward", "pilotFor", "handWeights", "perturb", "mutate", "evaluate", "train", "prune", "reportLines"].every((k) => typeof P[k] === "function") && P.name === "fixture" && P.zeroWeights().length === WC);
    const w = handBuilt(P), h = Array.from(P.activity(w, X({ 1: 0.2, 2: 0.1 })));
    ok("the cells after the input step and three recurrent steps read [2, 0, 2, 9, 6, 3, 12.5, 0] (worked by hand: cell 0 and 2 driven, the excitatory path 0>3>5,6 carries, the inhibitory cell 4 takes from 5 and 6)", nearAll(h, [2, 0, 2, 9, 6, 3, 12.5, 0], 1e-9), J(h));
    const y = P.forward(w, X({ 1: 0.2, 2: 0.1 }));
    ok("the controls are the autopilot's laws plus the readout: pitch 0.455, yaw 0.05, thrust 0.825 and ballast clamped to 1 (the residual 2.5 would have been 2.5)", near(y.pitch, 0.455, 1e-6) && near(y.yaw, 0.05, 1e-6) && near(y.thrust, 0.825, 1e-6) && y.ballast === 1, J(y));
    const w2 = handBuilt(P); w2[OFF.rec + 5] = -1;
    const y2 = P.forward(w2, X({ 1: 0.2, 2: 0.1 }));
    ok("DALE'S LAW: a recurrent magnitude stored with the wrong sign (edge 5, an inhibitory cell's) acts as its absolute value times the SOURCE cell's sign: the same controls", near(y2.pitch, y.pitch, 1e-9) && near(y2.yaw, y.yaw, 1e-9) && near(y2.thrust, y.thrust, 1e-9), J(y2));
    const wi = handBuilt(P, { drive1: true }), hi = Array.from(P.activity(wi, X({ 1: 0.2, 2: 0.1 })));
    ok("driving the inhibitory input cell 1 as well shuts the outputs: the cells read [2, 2, 2, 3, 6, 0, 0, 0] (inhibition from 1 on cell 3 and from 4 on cells 5 and 6)", nearAll(hi, [2, 2, 2, 3, 6, 0, 0, 0], 1e-9), J(hi));
    const wb = P.zeroWeights(); wb[OFF.b + 5] = 0.5; wb[OFF.w2 + 1 * NO + 0] = 0.3;
    const yb = P.forward(wb, X({}));
    ok("a cell's bias drives it with no sensor input (cell 5 at 0.5, read into yaw by 0.3: 0.15), and the unlabeled output cell 7 and the input cells with no weight on the readout change nothing", near(yb.yaw, 0.15, 1e-6) && yb.pitch === 0 && yb.thrust === 0 && yb.ballast === 0, J(yb));
    const wn = P.zeroWeights(); wn[OFF.b + 5] = -0.5; wn[OFF.w2 + 1 * NO + 0] = 0.3;
    ok("a negative bias is shut by the relu (cell 5 at -0.5 reads 0)", P.forward(wn, X({})).yaw === 0);
    const wr = P.zeroWeights(); wr[OFF.w2 + 3 * NO + 2] = 100; wr[OFF.b + 7] = 0.1;
    ok("the unlabeled output cell is read like any other (cell 7 at its bias 0.1, ballast weight 100: 10, clamped to 1)", P.forward(wr, X({})).ballast === 1);
    const yz = P.forward(P.zeroWeights(), X({ 1: 0.2, 2: 0.1 }));
    ok("with every weight at zero the pilot IS the autopilot's laws: pitch 4.5 x 0.1 = 0.45, yaw 0, thrust 0.2 + 0.5 x 0 = 0.2, ballast 0", near(yz.pitch, 0.45, 1e-9) && yz.yaw === 0 && near(yz.thrust, 0.2, 1e-9) && yz.ballast === 0, J(yz));
    const lawIn = X({ 1: 0.7, 2: 0.2, 3: 0.5, 4: 0.1, 5: 0.3, 6: 0.2, 7: 0.4, 8: 0.5, 9: -0.2 }), yl = P.forward(P.zeroWeights(), lawIn), K = A.AUTOPILOT_SUB;
    const want = { pitch: 0.3 * K.kTheta * 0.2 - 0.2 * K.kQ * 0.5, yaw: Math.PI * K.kHdg * 0.1 - 0.2 * K.kR * 0.3 - 0.2 * K.kBeta * 0.2, thrust: 0.7 + K.kSpd * 0.4, ballast: 10 * K.kBalD * 0.5 + 0.5 * K.kBalV * -0.2 };
    ok("all four laws on every feature they use: pitch from features 2 and 3, yaw from 4, 5 and 6, thrust from 1 and 7, ballast from 8 and 9 (gains kTheta 15, kQ 12, kHdg 3, kR 10, kBeta 2, kSpd 0.5, kBalD 0.03, kBalV 0.3)",
        near(yl.pitch, Math.max(-1, Math.min(1, want.pitch)), 1e-9) && near(yl.yaw, Math.max(-1, Math.min(1, want.yaw)), 1e-9) && near(yl.thrust, Math.max(-1, Math.min(1, want.thrust)), 1e-9) && near(yl.ballast, Math.max(-1, Math.min(1, want.ballast)), 1e-9), J(yl) + " vs " + J(want));
    const small = X({ 1: 0.1, 2: 0.05, 3: 0.1, 4: 0.02, 5: 0.05, 6: 0.01, 7: 0.1, 8: 0.2, 9: -0.1 }), ys = P.forward(P.zeroWeights(), small);
    ok("an unclamped case, so the laws are not hidden by the clamp: pitch 0.225 - 0.24 = -0.015, yaw 3 pi x 0.02 - 0.1 - 0.004 = 0.0845, thrust 0.15, ballast 0.06 - 0.015 = 0.045", near(ys.pitch, -0.015, 1e-9) && near(ys.yaw, 3 * Math.PI * 0.02 - 0.104, 1e-9) && near(ys.thrust, 0.15, 1e-9) && near(ys.ballast, 0.045, 1e-9), J(ys));
    const nanOut = P.forward(w, X({ 1: NaN, 2: Infinity }));
    ok("a non-finite feature reads as 0, and every control is finite and within [-1, 1]", Object.values(nanOut).every((v) => Number.isFinite(v) && v >= -1 && v <= 1) && J(nanOut) === J(P.forward(w, X({}))));
    const big = P.zeroWeights(); [50, -50, 50, -50].forEach((v, o) => { big[OFF.b2 + o] = v; });
    const yc = P.forward(big, X({})), nanw = P.zeroWeights(); for (let o = 0; o < 4; o++) nanw[OFF.b2 + o] = NaN;
    ok("the controls clamp to [-1, 1] in both directions, each of the four (+50 -> 1, -50 -> -1), and a NaN weight reads as 0 in each of the four", yc.pitch === 1 && yc.yaw === -1 && yc.thrust === 1 && yc.ballast === -1 && Object.values(P.forward(nanw, X({}))).every((v) => v === 0), J(yc) + " " + J(P.forward(nanw, X({}))));
    const wnan = P.zeroWeights(); wnan[OFF.b + 0] = 0.5; wnan[0 * F + 1] = 10;
    ok("a non-finite sensor feature is read as 0 in the sensors: with a bias of 0.5 on input cell 0 and a weight of 10 from feature 1, feature 1 = NaN or Infinity leaves the cell at its bias 0.5 (exactly as feature 1 = 0)", Array.from(P.activity(wnan, X({ 1: NaN })))[0] === 0.5 && Array.from(P.activity(wnan, X({ 1: Infinity })))[0] === 0.5 && Array.from(P.activity(wnan, X({ 1: -Infinity })))[0] === 0.5);
    ok("a non-finite feature is read as 0 in the autopilot's laws as well: thrust with feature 1 = NaN and feature 7 = 0.4 is 0.5 x 0.4 = 0.2", near(P.forward(P.zeroWeights(), X({ 1: NaN, 7: 0.4 })).thrust, 0.2, 1e-9) && near(P.forward(P.zeroWeights(), X({ 1: Infinity, 7: 0.4 })).thrust, 0.2, 1e-9));
    const ra = (() => { const m = handBuilt(P); return P.forward(m, X({ 1: 0.2, 2: 0.1 })); })();
    ok("forward reads its weights afresh each call (a vector changed in place is never run stale)", (() => { const m = handBuilt(P), a = P.forward(m, X({ 1: 0.2, 2: 0.1 })); m[OFF.w2 + 2 * NO + 1] = 0; const b = P.forward(m, X({ 1: 0.2, 2: 0.1 })); return near(a.thrust, 0.825, 1e-6) && near(b.thrust, 0.2, 1e-6) && ra.pitch === a.pitch; })());
    // a chain 4>3>2>1>0 (four steps long, the pilot takes three) and an input cell that is NOT the first cell: the sensors must reach cell 4, and the activity must stop one cell short of the output
    const chain = { neurons: [0, 1, 2, 3, 4].map((l) => ({ id: l, layer: l, nt: "Exc" })), edges: [[4, 3, 1, 1], [3, 2, 1, 1], [2, 1, 1, 1], [1, 0, 1, 1]] }, PC = C.createCircuitPolicy(chain, "chain"), wc = PC.zeroWeights();
    wc[0 * F + 1] = 5;
    const offc = { rec: F * 1 + 5, w2: F * 1 + 5 + 4 };   /* 14 weights for the one input cell, 5 biases, then the 4 edges, then the readout */ for (let k = 0; k < 4; k++) wc[offc.rec + k] = 1; wc[offc.w2 + 0] = 1;
    const hc = Array.from(PC.activity(wc, X({ 1: 0.2 })));
    ok("a four-step chain 4>3>2>1>0 with the sensors on its only input cell (cell 4, not the first cell; it reads 5 x 0.2 = 1): each step is the carry PLUS the edge's input, so cell 3 reads 1, 2, 3 and cell 2 reads 0, 1, 3 and cell 1 reads 0, 0, 1 over the three steps, and the output cell 0 is still 0: [0, 1, 3, 3, 1], and the output adds nothing (pitch 0)", J(hc) === "[0,1,3,3,1]" && PC.forward(wc, X({ 1: 0.2 })).pitch === 0, J(hc));
    const neg = { neurons: [{ id: 0, layer: 0, nt: "Exc" }, { id: 1, layer: 1, nt: "Exc" }, { id: 2, layer: 2, nt: "Exc" }, { id: 3, layer: 2, nt: "Exc" }], edges: [[2, 1, 1, 1], [3, 1, 1, 1], [1, 0, 1, 1]] }, PN = C.createCircuitPolicy(neg, "neg"), wn2 = PN.zeroWeights();
    wn2[0 * F + 1] = -5; wn2[1 * F + 1] = 5; const offn = { rec: F * 2 + 4 }; for (let k = 0; k < 3; k++) wn2[offn.rec + k] = 1;
    ok("the input step is a relu: an input cell driven NEGATIVE (cell 2, -1) is silent and takes nothing from the cell driven positive (cell 3, +1): cell 1 reads 1, 2, 3 over the three steps and the output 0, 1, 3 -- the negative drive, if it were passed along, would cancel the positive one at the first step", J(Array.from(PN.activity(wn2, X({ 1: 0.2 })))) === "[3,3,0,1]", J(Array.from(PN.activity(wn2, X({ 1: 0.2 })))));
    const reps = P.reportLines();
    ok("the report says what the circuit is and how far it reaches (8 neurons, 8 synapses, 74 weights; 2 of 3 output cells reached)", reps.length === 2 && /8 neurons, 8 synapses/.test(reps[0]) && /74 weights/.test(reps[0]) && /3 input cells/.test(reps[0]) && /3 output cells/.test(reps[0]) && /reach 2 of the 3 output cells/.test(reps[1]), reps.join(" | "));
});

// ================================================================================================================================================================================================================
sec("3. the start: the autopilot, exactly, from the same input weights for every circuit");
guarded("section 3", () => {
    const P = C.createCircuitPolicy(FIX), w0 = P.handWeights();
    ok("INIT is frozen and says seed 4711, input scale 0.2, bias 0.1, recurrent scale 0.3", Object.isFrozen(C.INIT) && C.INIT.seed === 4711 && C.INIT.inScale === 0.2 && C.INIT.bias === 0.1 && C.INIT.recScale === 0.3);
    ok("the start has every cell's bias at 0.1, the recurrent magnitudes at 0.3 x count / mean count ([0.4, 0.2, 0.2, 0.6, 0.2, 0.4, 0.2, 0.2]) and the readout and its bias at ZERO", w0.length === WC && Array.from(w0.subarray(OFF.b, OFF.rec)).every((v) => near(v, 0.1, 1e-7)) &&
        nearAll(Array.from(w0.subarray(OFF.rec, OFF.w2)), [0.4, 0.2, 0.2, 0.6, 0.2, 0.4, 0.2, 0.2], 1e-6) && Array.from(w0.subarray(OFF.w2)).every((v) => v === 0));
    const inW = Array.from(w0.subarray(0, OFF.b)), mean = inW.reduce((s, v) => s + v, 0) / inW.length, sd = Math.sqrt(inW.reduce((s, v) => s + (v - mean) ** 2, 0) / inW.length);
    ok("the 42 input weights are seeded gaussians of about 0.2 (mean within 0.1 of 0, sd within 0.1 of 0.2, not all alike) and the same on a second call", Math.abs(mean) < 0.1 && Math.abs(sd - 0.2) < 0.1 && new Set(inW).size > 30 && J(Array.from(P.handWeights())) === J(Array.from(w0)));
    const other = C.createCircuitPolicy(C.erControl(FIX, 3)), w1 = other.handWeights();
    ok("another circuit with the same input cells starts from the SAME input weights and biases (circuits are compared from one start); the recurrent block differs with the wiring", J(Array.from(w1.subarray(0, OFF.rec))) === J(Array.from(w0.subarray(0, OFF.rec))));
    let worst = 0, s = 7; const rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const hw = PS.handWeights();
    for (let t = 0; t < 300; t++) { const x = Array.from({ length: 14 }, (_, f) => (f === 0 ? 1 : (rng() - 0.5) * 2)); const a = P.forward(w0, x), b = PS.forward(hw, x); for (const k of ["pitch", "yaw", "thrust", "ballast"]) worst = Math.max(worst, Math.abs(a[k] - b[k])); }
    ok("the start is the existing pilots' hand weights (the autopilot's laws through relu pairs) to 1e-6 over 300 random feature vectors, whatever the wiring", worst < 1e-6, "worst " + worst.toExponential(2));
    const set = T.TRAIN_SET.slice(0, 3), a = P.evaluate(w0, set), b = PS.evaluate(PS.handWeights(), set);
    ok("flown on three training dives the start scores what the existing hand weights score (to 1e-6) and ends the same dives", near(a.score, b.score, 1e-6) && a.crashed === b.crashed, `${a.score.toFixed(6)} vs ${b.score.toFixed(6)}`);
    ok("pilotFor(weights) is a pilot function usable as brain/subTask.mjs flies it: three dives flown, none ended early that the existing hand weights complete", typeof P.pilotFor(w0) === "function" && a.runs.length === 3 && a.runs.every((r, i) => r.status === b.runs[i].status));
});

// ================================================================================================================================================================================================================
sec("4. training: the existing recipe on this policy");
guarded("section 4", () => {
    const P = C.createCircuitPolicy(FIX), set = T.TRAIN_SET.slice(0, 2), r1 = P.train({ seed: 3, iters: 6, trainSet: set }), r2 = P.train({ seed: 3, iters: 6, trainSet: set }), r3 = P.train({ seed: 4, iters: 6, trainSet: set });
    ok("a short search is deterministic for a seed (twice the same weights and score), different for another, never lowers its score, and counts improvements and neutral moves", J(Array.from(r1.weights)) === J(Array.from(r2.weights)) && r1.trainScore === r2.trainScore && J(Array.from(r1.weights)) !== J(Array.from(r3.weights)) &&
        r1.trainScore >= P.evaluate(P.handWeights(), set).score - 1e-9 && r1.improved + r1.neutral <= 6 && r1.history[0].i === 0 && r1.history[r1.history.length - 1].i === 6, `${r1.improved} improved, ${r1.neutral} neutral`);
    ok("the reported score is the weights' own score on the set", near(r1.trainScore, P.evaluate(r1.weights, set).score, 1e-9));
    const rng = (() => { let s = 5; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })(), w = P.handWeights();
    const ms = Array.from({ length: 80 }, () => Array.from(P.mutate(w, 0.3, rng, 4)).filter((v, i) => v !== w[i]).length), distinct = new Set(ms);
    ok("mutate changes 1 to 4 weights (80 draws: never 0, never more than 4, all of 1, 2, 3 and 4 seen -- a draw may land twice on one weight) and does not touch its parent", Math.min(...ms) >= 1 && Math.max(...ms) <= 4 && [1, 2, 3, 4].every((k) => distinct.has(k)) && J(Array.from(w)) === J(Array.from(P.handWeights())), J([...distinct].sort()));
    const m3 = Array.from({ length: 40 }, () => Array.from(P.mutate(w, 0.3, rng, 1)).filter((v, i) => v !== w[i]).length);
    ok("with maxK 1 it changes exactly one weight, every time", m3.every((c) => c === 1));
    const p = P.perturb(w, 0.1, rng);
    ok("perturb moves every weight", Array.from(p).every((v, i) => v !== w[i]));
    const pr = P.prune(r1.weights, { trainSet: set });
    ok("prune puts weights back toward the start without lowering the train score, and reports what it moved and kept", pr.trainScore >= r1.trainScore - 1e-9 && pr.kept <= pr.moved && pr.moved >= 0 && pr.weights.length === WC, `${pr.moved} moved, ${pr.kept} kept`);
    const wild = P.perturb(P.handWeights(), 0.05, rng), pw = P.prune(wild, { trainSet: set }), base = P.handWeights();
    const kept = []; for (let i = 0; i < WC; i++) if (Math.abs(pw.weights[i] - base[i]) > 1e-6) kept.push(i);
    const sc = (v) => P.evaluate(v, set).score;
    ok("prune ends at a fixed point: of the weights it keeps different from the start, putting any ONE back lowers the train score (checked for up to 12 of them), and it moved every weight of a fully perturbed vector (" + WC + ")", pw.moved === WC && pw.kept === kept.length && kept.slice(0, 12).every((i) => { const v = Float32Array.from(pw.weights); v[i] = base[i]; return sc(v) < pw.trainScore - 1e-9; }) && near(sc(pw.weights), pw.trainScore, 1e-9), `${pw.moved} moved, ${pw.kept} kept`);
    const kept0 = P.train({ seed: 9, iters: 0, start: r1.weights, trainSet: set });
    ok("a search given a start begins from it (no children: the weights are the start's, the score the start's)", J(Array.from(kept0.weights)) === J(Array.from(r1.weights)) && near(kept0.trainScore, P.evaluate(r1.weights, set).score, 1e-9));
    ok("prune kept something (a perturbed vector this large leaves weights the score needs; a prune that reverts everything is caught here)", pw.kept >= 1 && kept.length >= 1);
    const same = P.prune(P.handWeights(), { trainSet: set });
    ok("pruning the start itself moves and keeps nothing; pruning toward another vector measures from that vector", same.moved === 0 && same.kept === 0 && P.prune(wild, { toward: wild, trainSet: set }).moved === 0);
});

// ================================================================================================================================================================================================================
sec("5. reach: how many output cells the input cells can get to");
guarded("section 5", () => {
    ok("in 3 steps every input cell reaches output cells 5 and 6 and none reaches 7 (the unlabeled cell has no incoming edge): 2 output cells reached, 3 input cells reaching, 6 input-output pairs", J(C.reachOf(FIX)) === J({ outputsReached: 2, inputsReaching: 3, pairs: 6 }), J(C.reachOf(FIX)));
    ok("in 2 steps the same (0>3>5, 2>4>6 and so on); in 1 step none (the input cells reach only layer 1)", J(C.reachOf(FIX, 2)) === J({ outputsReached: 2, inputsReaching: 3, pairs: 6 }) && J(C.reachOf(FIX, 1)) === J({ outputsReached: 0, inputsReaching: 0, pairs: 0 }));
    const cut = { neurons: NEURONS, edges: EDGES.filter((e) => !(e[0] === 3 && e[1] === 5) && !(e[0] === 4 && e[1] === 5) && !(e[0] === 5)) };
    ok("with the edges into cell 5 and out of it removed, only cell 6 is reached (via 3 and 4): 1 output cell, 3 pairs", J(C.reachOf(cut)) === J({ outputsReached: 1, inputsReaching: 3, pairs: 3 }), J(C.reachOf(cut)));
    const one = { neurons: NEURONS, edges: [EDGES[0], EDGES[3]] };
    ok("a single path 0>3>5: one input cell reaches one output cell in 2 steps, none in 1", J(C.reachOf(one, 2)) === J({ outputsReached: 1, inputsReaching: 1, pairs: 1 }) && C.reachOf(one, 1).pairs === 0);
});

// ================================================================================================================================================================================================================
sec("6. the controls: what each keeps and what each throws away");
guarded("section 6", () => {
    const topo = C.topologyOf(FIX), counts = Array.from(topo.count).sort(), edgeKey = (e) => e[0] + ">" + e[1];
    const outDeg = (c) => { const d = new Array(8).fill(0); c.edges.forEach((e) => d[e[0]]++); return d; }, inDeg = (c) => { const d = new Array(8).fill(0); c.edges.forEach((e) => d[e[1]]++); return d; };
    const pairsOf = (c) => c.edges.map((e) => [FIX.neurons[e[0]].layer, FIX.neurons[e[1]].layer].join(">")).sort().join(",");
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const valid = (c) => { try { C.topologyOf(c); return true; } catch (e) { return false; } };
    for (const name of ["er", "layer", "degree", "sign", "count"]) {
        const f = C.CONTROLS[name], cs = seeds.map((s) => f(FIX, s));
        ok(`${name}: every draw is a valid circuit of the same 8 cells and 8 edges, the same counts as a set, no self-loop or repeat, every edge's sign its source's, and the neurons unchanged except for ${name === "sign" ? "the permuted transmitters" : "nothing"}`,
            cs.every((c) => valid(c) && c.edges.length === 8 && J(c.edges.map((e) => e[2]).sort()) === J(counts) && c.neurons.length === 8 && (name === "sign" || c.neurons === FIX.neurons)), cs.filter((c) => !valid(c)).length + " invalid");
        ok(`${name}: deterministic for a seed (the same circuit twice), different for another seed, and different from the original`, J(f(FIX, 5)) === J(f(FIX, 5)) && new Set(cs.map((c) => J(c.edges) + J(c.neurons.map((n) => n.nt)))).size >= 5 && cs.some((c) => J(c.edges) !== J(EDGES) || J(c.neurons.map((n) => n.nt)) !== J(NEURONS.map((n) => n.nt))));
    }
    const er = seeds.map((s) => C.erControl(FIX, s)), ly = seeds.map((s) => C.layerControl(FIX, s)), dg = seeds.map((s) => C.degreeControl(FIX, s)), sg = seeds.map((s) => C.signControl(FIX, s)), ct = seeds.map((s) => C.countControl(FIX, s));
    ok("ER draws its sources only among the signed cells (never the unlabeled cell 7) and the counts stay with their edge position (edge k keeps count k)", er.every((c) => c.edges.every((e, k) => e[0] !== 7 && e[2] === topo.count[k])));
    ok("ER does not keep the layers: some draw has an edge from a different layer pair than the original's", er.some((c) => pairsOf(c) !== pairsOf(FIX)));
    ok("LAYER keeps the multiset of (source layer > target layer) pairs exactly, with the original counts by position and the source always a signed cell", ly.every((c) => pairsOf(c) === pairsOf(FIX) && c.edges.every((e, k) => e[2] === topo.count[k] && e[0] !== 7)));
    ok("LAYER moves the endpoints: every draw has at least one edge somewhere else than the original, and some draw differs from the original as a whole", ly.some((c) => J(c.edges) !== J(EDGES)) && ly.every((c) => c.edges.some((e, k) => edgeKey(e) !== edgeKey(EDGES[k]))));
    ok("DEGREE keeps every cell's out-degree and in-degree, every edge its source, sign and count, and only moves targets", dg.every((c) => J(outDeg(c)) === J(outDeg(FIX)) && J(inDeg(c)) === J(inDeg(FIX)) && c.edges.every((e, k) => e[0] === EDGES[k][0] && e[2] === EDGES[k][2] && e[3] === EDGES[k][3])));
    ok("DEGREE does move targets (some draw is not the original) -- and not all draws are the same", dg.some((c) => J(c.edges) !== J(EDGES)) && new Set(dg.map((c) => J(c.edges))).size >= 3);
    ok("SIGN keeps endpoints and counts exactly, keeps the unlabeled cell unlabeled, permutes the transmitters among the signed cells (5 excitatory and 2 inhibitory remain), and every edge's sign follows its source's NEW transmitter",
        sg.every((c) => c.edges.every((e, k) => e[0] === EDGES[k][0] && e[1] === EDGES[k][1] && e[2] === EDGES[k][2] && e[3] === (c.neurons[e[0]].nt === "Exc" ? 1 : -1)) && c.neurons[7].nt === "Unlabeled" && c.neurons.filter((n) => n.nt === "Exc").length === 5 && c.neurons.filter((n) => n.nt === "Inh").length === 2));
    ok("SIGN actually permutes (some draw flips an edge's sign) and leaves the layers and ids alone", sg.some((c) => c.edges.some((e, k) => e[3] !== EDGES[k][3])) && sg.every((c) => c.neurons.every((n, i) => n.layer === NEURONS[i].layer && n.id === NEURONS[i].id)));
    ok("COUNT keeps endpoints and signs exactly and permutes the counts (the same multiset; some draw moves a count)", ct.every((c) => c.edges.every((e, k) => e[0] === EDGES[k][0] && e[1] === EDGES[k][1] && e[3] === EDGES[k][3])) && ct.some((c) => c.edges.some((e, k) => e[2] !== EDGES[k][2])));
    ok("the controls do not change the circuit they were made from (the fixture's edges and neurons are as they were)", J(FIX.edges) === J([[0, 3, 2, 1], [1, 3, 1, -1], [2, 4, 1, 1], [3, 5, 3, 1], [3, 6, 1, 1], [4, 6, 2, -1], [4, 5, 1, -1], [5, 6, 1, 1]]) && FIX.neurons[1].nt === "Inh");
    ok("CONTROLS names all five and is frozen", Object.isFrozen(C.CONTROLS) && J(Object.keys(C.CONTROLS)) === '["er","layer","degree","sign","count"]' && C.CONTROLS.er === C.erControl && C.CONTROLS.layer === C.layerControl && C.CONTROLS.degree === C.degreeControl && C.CONTROLS.sign === C.signControl && C.CONTROLS.count === C.countControl);
    const tiny = { neurons: [{ nt: "Exc", layer: 1 }, { nt: "Exc", layer: 0 }, { nt: "Inh", layer: 0 }], edges: [[0, 1, 1, 1], [0, 2, 1, 1]] };
    ok("a circuit with two edges and two output cells gives controls too (every pair that fits), and a control of a circuit with no edges has none", C.layerControl(tiny, 1).edges.length === 2 && C.erControl({ neurons: tiny.neurons, edges: [] }, 1).edges.length === 0 && C.degreeControl({ neurons: tiny.neurons, edges: [tiny.edges[0]] }, 1).edges.length === 1);
    const r = C.degreeControl({ neurons: [{ nt: "Exc", layer: 1 }, { nt: "Exc", layer: 1 }, { nt: "Exc", layer: 0 }, { nt: "Exc", layer: 0 }], edges: [[0, 2, 1, 1], [1, 3, 1, 1]] }, 9);
    ok("DEGREE swaps targets between two edges when it can (0>2, 1>3 may become 0>3, 1>2): the out-degrees stay 1, 1 and the in-degrees stay 1 on cells 2 and 3", J(r.edges.map((e) => e[0])) === "[0,1]" && J(r.edges.map((e) => e[1]).sort()) === "[2,3]");
});

// ================================================================================================================================================================================================================
sec("7. the real circuit (vendor/zebrafish/fish1-hmi-spn.json), restated from the file");
guarded("section 7", () => {
    const j = JSON.parse(fs.readFileSync(path.join(ENG, "vendor/zebrafish/fish1-hmi-spn.json"), "utf8")), circuit = { neurons: j.neurons, edges: j.edges }, t = C.topologyOf(circuit);
    ok("the file holds 99 neurons (31 in layer 2, 18 in layer 1, 50 in layer 0) and 148 edges, and is a valid circuit: 31 input cells, 50 output cells", t.N === 99 && t.E === 148 && t.inputs.length === 31 && t.outputs.length === 50 && j.neurons.filter((n) => n.layer === 1).length === 18);
    const P = C.createCircuitPolicy(circuit, "HMI");
    ok("885 weights = 14 x 31 + 99 + 148 + 4 x 50 + 4; the input cells reach 43 of the 50 output cells in 3 steps, every input cell reaches one, 699 input-output pairs", P.WEIGHT_COUNT === 14 * 31 + 99 + 148 + 4 * 50 + 4 && P.WEIGHT_COUNT === 885 && J(P.reach) === J({ outputsReached: 43, inputsReaching: 31, pairs: 699 }), J(P.reach));
    let worst = 0, s = 11; const rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; const hw = PS.handWeights(), w0 = P.handWeights();
    for (let q = 0; q < 200; q++) { const x = Array.from({ length: 14 }, (_, f) => (f === 0 ? 1 : (rng() - 0.5) * 2)); const a = P.forward(w0, x), b = PS.forward(hw, x); for (const k of ["pitch", "yaw", "thrust", "ballast"]) worst = Math.max(worst, Math.abs(a[k] - b[k])); }
    ok("the real circuit's pilot starts as the autopilot: 200 random feature vectors, the largest difference from the existing hand weights " + worst.toExponential(1), worst < 1e-6);
    const x = Array.from({ length: 14 }, (_, f) => (f === 0 ? 1 : 0.5)), h = P.activity(w0, x);
    ok("at the start the sensors reach the SPNs through the wiring: at least 40 of the 50 output cells are active for a typical input", t.outputs.filter((i) => h[i] > 0).length >= 40, t.outputs.filter((i) => h[i] > 0).length + " of 50");
    const reaches = {}; for (const [k, f] of Object.entries(C.CONTROLS)) reaches[k] = [1, 2, 3, 4, 5].map((q) => C.reachOf(f(circuit, q)).pairs);
    ok("the controls' reach, the confound the report must print: ER 150-250 pairs, LAYER 250-400, DEGREE 200-450, SIGN and COUNT exactly the fish's 699 (they do not touch the wiring)",
        reaches.er.every((v) => v >= 120 && v <= 260) && reaches.layer.every((v) => v >= 250 && v <= 400) && reaches.degree.every((v) => v >= 200 && v <= 450) && reaches.sign.every((v) => v === 699) && reaches.count.every((v) => v === 699), J(reaches));
    for (const [k, f] of Object.entries(C.CONTROLS)) { const c = f(circuit, 2); ok(`${k} of the real circuit: 99 neurons, 148 edges, valid, the same 31 input and 50 output cells`, c.neurons.length === 99 && c.edges.length === 148 && C.topologyOf(c).inputs.length === 31 && C.topologyOf(c).outputs.length === 50); }
});

// ================================================================================================================================================================================================================
sec("8. NOT CHECKED");
console.log("  NOT CHECKED  that the pilot can learn anything through the wiring: this gate holds the build (the start is the autopilot, the pass is the one worked by hand, the controls keep what they say); whether a search finds a gain is the experiment's, not this gate's");
console.log("  NOT CHECKED  that the controls are the right nulls: they keep different things (ER the size, LAYER the layers, DEGREE the hubs, SIGN and COUNT the wiring) and none keeps the reach of the real wiring, which is why the reach is printed");

finished = true;
console.log(fails ? `\npilotSubCircuit-selfcheck: ${fails} FAILED` : "\npilotSubCircuit-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
