// WebGLEngine/brain/pilotSubVestibular-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotSubVestibular-selfcheck.mjs      (~1-2.5s: 1 on the Linux build box, 2.5 on the Windows rig)
//
// THE GATE OF brain/pilotSubVestibular.mjs: the rung 4b pilot (a circuit with a per-cell leak, tuning-derived input, a mirrored pair and the autopilot's laws plus a residual). Built and gated BEFORE any training, as Addendum 5 of
// brain/FISH_VESTIBULAR_HELPER_WIP.md registered. Nothing here is trained. Every number is worked out by hand on a toy circuit, then the real arms are held to the registration's counts.
//
// THE TOY: two inputs, two cells. Input 0: theta 0 (rightward), tonic. Input 1: theta pi/2 (rostral), phasic. Cells 0 and 1. Edges 0>0 count 2, 1>0 count 4, 1>1 count 2; every trained edge magnitude 1, every bias 0.
//   Right-side-down 0.1 rad held (rTonic 0.1), lambda 0.5: tick 1 input 0 = 0.1, cell 0 = 0.1; tick 2 input 0 = 0.1 + 0.5 x 0.1 = 0.15, cell 0 = 0.15 + 0.5 x 0.1 = 0.2. The left copy flips the cosine term: input 0 reads -0.1, relu 0, everything stays 0.
//   One pitch-rate pulse (pPhasic 0.2 once): tick 1 input 1 = 0.2, cell 0 = 0.2, cell 1 = 0.2; tick 2 (no input) input 1 = 0.1, cell 0 = 0.1 + 0.5 x 0.2 = 0.2, cell 1 = 0.1 + 0.1 = 0.2; tick 3: input 1 = 0.05, cells 0.15 and 0.15. With NO STATE the pulse is gone at tick 2.
//   The mirror: a pitch-rate pulse has no lateral part (cos pi/2 = 0), so both copies see it alike; yaw is odd and cancels, pitch is even and doubles.
// WHAT IT HOLDS
//   1 THE ARMS     the counts of the registration: E 25 inputs (14 phasic, 11 tonic), 5 cells, 31 edges, 81 synapses; B 76 / 42 / 301 / 499; whole 84 / 47 / 332 / 580; trainable (no state) 85, 591, 655 and one more with the leak.
//   2 THE CIRCUIT  the refusals, the arm and its names.
//   3 THE CONTROLS ER, CLASS, DEGREE, COUNT and TUNING each keep what they say they keep and move what they say they move, and are a pure function of the seed.
//   4 THE SENSES   the sign rows of Addendum 2: a nose-down body drives rostral-tuned afferents, a right-side-down body ipsilateral-tuned ones; phasic reads the rates, tonic the attitude; the unit-RMS scales; the mirror flips the cosine term only.
//   5 THE LEAK     the worked numbers above; the state resets with the target; NO STATE; lambda clamped and read as a magnitude; a 6-tick cue still moves the readout 3 s later with the leak and not without.
//   6 THE PILOT    the start is the autopilot; yaw odd and the rest even under the mirror; the clamps; the end-to-end sign on real hazard dives (a hazard on the right and one on the left are answered in opposite yaw).
//   7 THE SEARCH   mutate, perturb, train, prune on a stub task; the evaluate seam; the report.
//   8 THE SOURCE   pure.
// NOT CHECKED, said plainly: that any weights exist that dodge the hazard (the trainer decides that); that 25 inputs and 86 weights can express the reflex; the scales over the training dives (the trainer measures them).
//
// SABOTAGED -- 132 mutants of brain/pilotSubVestibular.mjs, each run against a copy of this gate, 4 at a time, a mutant that runs past 90 s counted red (a timeout), and every one red BY NAME (the list):
//   the circuit: arm unchecked / filter ignoring the pathway / whole = E only, inputs unsorted, a missing angle accepted (twice), the kinetic class or the edge count dropped, the cell class dropped; every refusal of topologyOf (shape, empty, range, integer, negative, repeat, zero count);
//   reach: inputs, cells and pairs counted wrong; the controls: repeats allowed, counts shuffled with ER, ER sources or targets fixed (these two never terminate: a timeout), CLASS ignoring the kinetic class or the cell class or reading the kinetic class wrong, DEGREE not swapping / swapping sources /
//   allowing repeats / moving counts, COUNT not shuffling or moving ends, TUNING not shuffling / separating angle from class / rewiring, the control table; the senses: the four signs (pitch, bank, pitch rate, roll rate), tonic and phasic swapped (both signals), sine and cosine swapped, the mirror
//   flipping the sine or both terms or nothing, a scale unused (both kinds), the scale as a sum or not a root or 0 for a silent signal or letting a non-finite sample through, the default scales dropped; the start: persist off by default, a lambda slot with no state, the slot index, the readout size,
//   the edge start ignoring the counts, the bias, lambda and recScale starts, a readout that starts non-zero; the leak: lambda unclamped high or low or non-finite, kept with no state, the input bias dropped, no relu on an input (found 0 red at first for a cell, see below), no leak on inputs or
//   cells, the cell bias dropped or mis-indexed, a signed edge, an edge reading the old activity or the wrong source, the cell leaking another cell, the state not stored, the leak inside the relu; the readout and decode: inputs read instead of cells, no bias, the wrong row, yaw even, pitch / thrust /
//   ballast odd, no left copy, a left copy unmirrored, a right copy mirrored, each control unclamped (4) or clamped wrongly, a non-finite value let through on each of the four controls, the law dropped / its pitch gain / thrust / ballast / sideslip terms changed, no reset / reset on the right copy only /
//   reset every tick, the current dropped from the features, the two copies sharing one state; the search: lambda unclamped by mutate, mutate changing exactly one weight or more than maxK, editing its input, perturb in place or partial, train accepting a worse child / ignoring its seed or its start /
//   aliasing its start / dropping the neutral count / ending the history early, prune keeping everything / reverting everything / one pass only / ignoring its start, the evaluate wrap / options / seam, the report label, the contract's size, the trace mirror and a shared trace state, the persist flag.
//   FIRST RUN, 19 FINDINGS, each a row the gate lacked or code that did nothing: C8, K11, K13 and K16 were EQUIVALENT mutants (an identity map; a self-swap that the repeat check already rejects; an empty-graph guard the loop bound already gives; an unused variable) and K11 and K13 named two DEAD
//   GUARDS in degreeControl, CUT; O24 showed that `sense(state, current)` never used its second argument (attitude and the rates do not depend on the water's current), the argument CUT; O27 showed that the `fin` on the features in the decode was dead (features() already returns finite numbers), CUT;
//   the rest got rows: the default scales option, a negative bias on a central cell, the readout biases (a yaw bias cancels under the mirror and a thrust bias doubles), a non-finite weight on each output row (it had been pitch only), the current reaching the laws, perturb moving every weight,
//   a child scoring exactly its parent counted as neutral, prune's final pass that reverts nothing (passes >= 2), the persist flag, the sort order of the inputs (the real table is already sorted, so a hand-made one), and the number of weights a mutation changes. Four mutants had patterns that matched nothing and were fixed.
// ADDENDUM 8 (4b-D, the dense variant): 25 more mutants, 157 in all, every one red by name: the option off or always on, the offset and the count of the dense block, the start (scale, seed, length, none), the mirror (none, of everything, of the wrong features, with a feature missing, wrong or extra),
//   a missing finite guard, the row of weights an afferent reads (found 0 red: with this toy's weights a wrong row read the same value by coincidence -- the rows now give input 1 its own weight, 2, so a misplaced row reads 0.2 for 0.4), the drive not used, the tuning drive added, the features not handed over, the report label, the flag, the start scale, the left copy unmirrored.
//   Six patterns of the first pass matched nothing after the edit and were rewritten.
// NOT SABOTAGED: the report line's text beyond the arm label and the sizes; what a TRAINED weight vector does (nothing is trained).
"use strict";
import fs from "node:fs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./subTask.mjs";
import * as AS from "./autopilotSub.mjs";
import * as V from "./pilotSubVestibular.mjs";
import * as H from "../tools/subVestibularTasks.mjs";
import * as F from "../tools/fishVestibularCircuit.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e, J = JSON.stringify;
console.log("pilotSubVestibular-selfcheck -- the rung 4b pilot\n");

const model = S.createSubModel(), st = (o) => S.createState({ depth: 30, speed: 2.5, ...o, model });
const TOY = { inputs: [{ name: "i0", theta: 0, myelinated: false }, { name: "i1", theta: Math.PI / 2, myelinated: true }], cells: [{ name: "c0", cls: "A", pathway: "E" }, { name: "c1", cls: "B", pathway: "E" }], edges: [[0, 0, 2], [1, 0, 4], [1, 1, 2]] };
const toyWeights = (p, lambda = 0.5) => { const w = new Float32Array(p.WEIGHT_COUNT); w[0] = w[1] = w[2] = 1; if (p.persist) w[p.LAMBDA_INDEX] = lambda; return w; };
const X = F.extract();

sec("1. THE ARMS (the registration's counts, from the vendored tables)");
{
    const want = { E: { inputs: 25, phasic: 14, tonic: 11, cells: 5, edges: 31, syn: 81, T: 85 }, B: { inputs: 76, phasic: 13, tonic: 63, cells: 42, edges: 301, syn: 499, T: 591 }, whole: { inputs: 84, phasic: 16, tonic: 68, cells: 47, edges: 332, syn: 580, T: 655 } };
    for (const arm of ["E", "B", "whole"]) {
        const c = V.circuitOf(X, arm), w = want[arm], syn = c.edges.reduce((s, e) => s + e[2], 0), ph = c.inputs.filter((a) => a.myelinated).length;
        const keep = V.createVestibularPolicy(c, arm), none = V.createVestibularPolicy(c, arm, { persist: false });
        ok(`!! arm ${arm}: ${w.inputs} inputs (${w.phasic} phasic, ${w.tonic} tonic), ${w.cells} cells, ${w.edges} edges, ${w.syn} synapses`, c.inputs.length === w.inputs && ph === w.phasic && c.inputs.length - ph === w.tonic && c.cells.length === w.cells && c.edges.length === w.edges && syn === w.syn);
        ok(`!! arm ${arm}: ${w.T} trainable weights with no state (the registration's count) and ${w.T + 1} with the leak (lambda is one more), the lambda slot last`, none.WEIGHT_COUNT === w.T && keep.WEIGHT_COUNT === w.T + 1 && keep.LAMBDA_INDEX === w.T && none.LAMBDA_INDEX === -1);
    }
    const ex = F.armOf(X, "E");
    ok("!! the registration's own arithmetic (tools/fishVestibularCircuit.mjs armOf) agrees: T = edges + inputs + cells + 4 cells + 4", ex.trainableT === 85 && F.armOf(X, "B").trainableT === 591 && F.armOf(X, "whole").trainableT === 655);
    const cB = V.circuitOf(X, "B"), cE = V.circuitOf(X, "E"), cW = V.circuitOf(X, "whole");
    ok("!! the arms are the pathways: E's cells are the Mauthner and the 4 commissural, B's the 12 SVN, 11 tangential and 19 vestibulospinal; the whole is both", J(cE.cells.map((c) => c.cls).sort()) === J(["Mauthner", "commissural", "commissural", "commissural", "commissural"]) && cB.cells.filter((c) => c.cls === "SVN").length === 12 && cB.cells.filter((c) => c.cls === "tangential").length === 11 && cB.cells.filter((c) => c.cls === "VS").length === 19 && cW.cells.length === 47);
    ok("!! inputs are sorted by name and every edge points at the input and cell its names say (checked on the first edge of E against the table)", cE.inputs.every((a, i, l) => i === 0 || l[i - 1].name < a.name) && (() => { const e0 = X.edges.find((e) => cE.cells.some((c) => c.name === e.c)), k = cE.edges.findIndex((e) => cE.inputs[e[0]].name === e0.a && cE.cells[e[1]].name === e0.c); return k >= 0 && cE.edges[k][2] === e0.w; })());
    const tiny = { afferents: [{ name: "b", theta: 1, myelinated: true }, { name: "a", theta: 2, myelinated: false }], centrals: [{ name: "c", cls: "X", pathway: "E" }], edges: [{ a: "b", c: "c", w: 5 }, { a: "a", c: "c", w: 3 }] }, ct = V.circuitOf(tiny, "E");
    ok("!! inputs are sorted by name whatever the order of the edges: b then a in the table gives a, b, and each edge follows its own input (a has count 3, b count 5)", J(ct.inputs.map((a) => a.name)) === J(["a", "b"]) && J(ct.edges.map((e) => [ct.inputs[e[0]].name, e[2]]).sort()) === J([["a", 3], ["b", 5]]) && ct.inputs[1].myelinated === true && ct.inputs[0].theta === 2);
    ok("!! every input carries its tuning angle and kinetic class from the tables (the myelinated flag is the afferent's own; the angle is a finite number)", cW.inputs.every((a) => Number.isFinite(a.theta)) && cW.inputs.filter((a) => a.myelinated).every((a) => /^Ear_AnteriorMacula_R_(0[1-9]|1[0-6])$/.test(a.name)));
}

sec("2. THE CIRCUIT (what is refused)");
{
    const bad = (m) => throws(() => V.topologyOf(m));
    ok("!! an unknown arm is refused naming the arms", /arm "left"/.test(throws(() => V.circuitOf(X, "left")) || "") && /whole, B, E/.test(throws(() => V.circuitOf(X, "left")) || ""));
    ok("!! an afferent with no tuning angle is refused when the circuit is made", /no tuning angle/.test(throws(() => V.circuitOf({ ...X, afferents: X.afferents.map((a) => ({ ...a, theta: null })) }, "E")) || ""));
    ok("!! a circuit is { inputs, cells, edges }; none, a missing part, no inputs and no cells are refused", /a circuit is/.test(bad(null) || "") && /a circuit is/.test(bad({ inputs: [], cells: [] }) || "") && /are not a circuit/.test(bad({ ...TOY, inputs: [] }) || "") && /are not a circuit/.test(bad({ ...TOY, cells: [] }) || ""));
    ok("!! an input with no tuning angle is refused", /input 1 has no tuning angle/.test(bad({ ...TOY, inputs: [TOY.inputs[0], { ...TOY.inputs[1], theta: NaN }] }) || ""));
    ok("!! an edge outside the inputs or the cells, a non-integer end, a repeated pair and a count that is not above zero are each refused by name", /edge 0 \[5, 0\] is outside/.test(bad({ ...TOY, edges: [[5, 0, 1]] }) || "") && /edge 0 \[0, 9\] is outside/.test(bad({ ...TOY, edges: [[0, 9, 1]] }) || "") && /edge 0 \[0, 0.5\] is outside/.test(bad({ ...TOY, edges: [[0, 0.5, 1]] }) || "") && /edge 0 \[-1, 0\] is outside/.test(bad({ ...TOY, edges: [[-1, 0, 1]] }) || "") && /edge 1 repeats the pair 0 -> 0/.test(bad({ ...TOY, edges: [[0, 0, 1], [0, 0, 2]] }) || "") && /edge 0 has count 0/.test(bad({ ...TOY, edges: [[0, 0, 0]] }) || ""));
    const t = V.topologyOf(TOY);
    ok("!! the arrays: 2 inputs, 2 cells, 3 edges, the counts and ends as given", t.NI === 2 && t.NC === 2 && t.E === 3 && J(Array.from(t.from)) === "[0,1,1]" && J(Array.from(t.to)) === "[0,0,1]" && J(Array.from(t.count)) === "[2,4,2]");
    ok("!! reach: the edges connect 3 pairs, 2 cells are reached, 2 inputs reach a cell; an input with no edge does not count", J(V.reachOf(TOY)) === J({ pairs: 3, cellsReached: 2, inputsReaching: 2 }) && V.reachOf({ ...TOY, edges: [[1, 0, 1]] }).inputsReaching === 1 && V.reachOf({ ...TOY, edges: [[1, 0, 1]] }).cellsReached === 1);
}

sec("3. THE CONTROLS");
{
    const E = V.circuitOf(X, "E"), W = V.circuitOf(X, "whole"), key = (c) => c.edges.map((e) => e.join(":")).sort().join(",");
    const kin = (c, a) => (c.inputs[a].myelinated ? "p" : "t");
    for (const [nm, f] of Object.entries(V.CONTROLS)) {
        const c = f(W, 5), c2 = f(W, 5), c3 = f(W, 6), tun = nm === "tuning";
        const same = tun ? J(c.inputs) === J(c2.inputs) : key(c) === key(c2), other = tun ? J(c.inputs) !== J(c3.inputs) : key(c) !== key(c3);
        ok(`!! ${nm}: the same seed gives the same circuit, another seed another; the cells and the edge count are kept; no edge is repeated and every end is in range`, same && other && c.edges.length === W.edges.length && J(c.cells) === J(W.cells) && new Set(c.edges.map((e) => e[0] + ":" + e[1])).size === c.edges.length && c.edges.every((e) => e[0] >= 0 && e[0] < 84 && e[1] >= 0 && e[1] < 47));
    }
    ok("!! ER: the edges are redrawn (most pairs differ from the real wiring) and the counts keep their positions", (() => { const c = V.erControl(W, 3), same = c.edges.filter((e, k) => W.edges.some((r) => r[0] === e[0] && r[1] === e[1])).length; return same < 40 && c.edges.every((e, k) => e[2] === W.edges[k][2]); })());
    ok("!! CLASS: every edge keeps its source's kinetic class and its target's cell class, and the pairs are redrawn", (() => { const c = V.classControl(W, 3); return c.edges.every((e, k) => kin(c, e[0]) === kin(W, W.edges[k][0]) && c.cells[e[1]].cls === W.cells[W.edges[k][1]].cls && e[2] === W.edges[k][2]) && key(c) !== key(W); })());
    ok("!! DEGREE: every input keeps its out-degree, every cell its in-degree, every edge its source and its count; the targets moved", (() => {
        const c = V.degreeControl(W, 3), deg = (cc, i) => { const o = new Map(); for (const e of cc.edges) o.set(e[i], (o.get(e[i]) || 0) + 1); return J([...o].sort((a, b) => a[0] - b[0])); };
        return deg(c, 0) === deg(W, 0) && deg(c, 1) === deg(W, 1) && c.edges.every((e, k) => e[0] === W.edges[k][0] && e[2] === W.edges[k][2]) && c.edges.filter((e, k) => e[1] !== W.edges[k][1]).length > 50;
    })());
    ok("!! COUNT: the multiset of counts and every endpoint are kept, the counts moved", (() => { const c = V.countControl(W, 3); return J(c.edges.map((e) => e[2]).sort()) === J(W.edges.map((e) => e[2]).sort()) && c.edges.every((e, k) => e[0] === W.edges[k][0] && e[1] === W.edges[k][1]) && c.edges.filter((e, k) => e[2] !== W.edges[k][2]).length > 100; })());
    ok("!! TUNING: the wiring is exactly as it was; the angles and the kinetic classes are permuted TOGETHER among the inputs (the multiset of (angle, class) pairs is kept, and some input changed)", (() => {
        const c = V.tuningControl(W, 3), tag = (cc) => cc.inputs.map((a) => a.theta + ":" + a.myelinated).sort().join(",");
        return key(c) === key(W) && tag(c) === tag(W) && c.inputs.some((a, i) => a.theta !== W.inputs[i].theta) && c.inputs.every((a, i) => a.name === W.inputs[i].name) && c.inputs.every((a, i) => W.inputs.some((r) => r.theta === a.theta && r.myelinated === a.myelinated));
    })());
    ok("!! the controls do not change the circuit they are given (a deep compare after all five)", (() => { const before = J(E); for (const f of Object.values(V.CONTROLS)) f(E, 9); return J(E) === before; })());
    ok("!! a small circuit's DEGREE control with one edge changes nothing and does not hang; a one-edge ER is a valid circuit", (() => { const one = { ...TOY, edges: [[0, 0, 3]] }; return J(V.degreeControl(one, 1).edges) === J(one.edges) && V.erControl(one, 1).edges.length === 1; })());
    ok("!! the control names the verdict uses: er, class, degree; reported only: count, tuning", J(Object.keys(V.CONTROLS)) === J(["er", "class", "degree", "count", "tuning"]) && Object.isFrozen(V.CONTROLS));
}

sec("4. THE SENSES (the sign rows of Addendum 2)");
{
    const nd = V.sense(st({ pitch: -0.1 })), up = V.sense(st({ pitch: 0.1 })), rd = V.sense(st({ bank: 0.1 })), rate = V.sense(st({ w: [0.1, 0.2, 0] })), scl = { pTonic: 1, rTonic: 1, pPhasic: 1, rPhasic: 1 };
    const rostralTonic = { theta: Math.PI / 2, myelinated: false }, ipsiTonic = { theta: 0, myelinated: false }, caudalTonic = { theta: -Math.PI / 2, myelinated: false }, contraTonic = { theta: Math.PI, myelinated: false };
    ok("!! a NOSE-DOWN body (the model's pitch is positive nose-up) reads positive nose-down pitch and drives rostral-tuned afferents positively and caudal-tuned negatively; a nose-up body the reverse", near(nd.pTonic, 0.1, 1e-6) && up.pTonic < 0 && V.driveOf(rostralTonic, nd, scl) > 0.09 && V.driveOf(caudalTonic, nd, scl) < -0.09 && V.driveOf(rostralTonic, up, scl) < 0 && V.driveOf(caudalTonic, up, scl) > 0);
    ok("!! a RIGHT-SIDE-DOWN body reads positive right-roll and drives ipsilateral-tuned (angle 0) afferents positively and contralateral ones negatively; a nose-down body drives neither", near(rd.rTonic, 0.1, 1e-6) && V.driveOf(ipsiTonic, rd, scl) > 0.09 && V.driveOf(contraTonic, rd, scl) < -0.09 && Math.abs(V.driveOf(ipsiTonic, nd, scl)) < 1e-9 && Math.abs(V.driveOf(rostralTonic, rd, scl)) < 1e-9);
    ok("!! the RATES: a nose-down pitch rate (the model's pitch rate is positive nose-up, the body y rate the opposite) reads positive and a right-side-down roll rate reads positive; both are phasic, and the attitudes stay at rest", near(rate.pPhasic, 0.2) && near(rate.rPhasic, 0.1) && rate.pTonic === 0 && rate.rTonic === 0 && nd.pPhasic === 0 && rd.rPhasic === 0);
    ok("!! tonic afferents read the attitude and phasic ones the rate: the same body drives a tonic and a phasic rostral afferent by different signals", V.driveOf({ theta: Math.PI / 2, myelinated: false }, { pTonic: 0.3, pPhasic: 0.7, rTonic: 0, rPhasic: 0 }, scl) === 0.3 && V.driveOf({ theta: Math.PI / 2, myelinated: true }, { pTonic: 0.3, pPhasic: 0.7, rTonic: 0, rPhasic: 0 }, scl) === 0.7 && V.driveOf({ theta: 0, myelinated: false }, { pTonic: 0, pPhasic: 0, rTonic: 0.4, rPhasic: 0.9 }, scl) === 0.4 && V.driveOf({ theta: 0, myelinated: true }, { pTonic: 0, pPhasic: 0, rTonic: 0.4, rPhasic: 0.9 }, scl) === 0.9);
    ok("!! the drive is sin(theta) P + cos(theta) R: at 45 degrees both count equally, and each signal is multiplied by ITS OWN scale", near(V.driveOf({ theta: Math.PI / 4, myelinated: false }, { pTonic: 1, rTonic: 1, pPhasic: 0, rPhasic: 0 }, scl), Math.SQRT2) && near(V.driveOf({ theta: Math.PI / 4, myelinated: false }, { pTonic: 1, rTonic: 1, pPhasic: 0, rPhasic: 0 }, { ...scl, pTonic: 2, rTonic: 3 }), (2 + 3) * Math.SQRT1_2) && near(V.driveOf({ theta: Math.PI / 4, myelinated: true }, { pTonic: 0, rTonic: 0, pPhasic: 1, rPhasic: 1 }, { ...scl, pPhasic: 2, rPhasic: 3 }), (2 + 3) * Math.SQRT1_2));
    ok("!! the mirror flips the COSINE (lateral) term only: sin(theta) P - cos(theta) R", near(V.driveOf({ theta: Math.PI / 4, myelinated: false }, { pTonic: 1, rTonic: 0.5, pPhasic: 0, rPhasic: 0 }, scl, true), (1 - 0.5) * Math.SQRT1_2) && near(V.driveOf({ theta: Math.PI / 4, myelinated: false }, { pTonic: 1, rTonic: 0.5, pPhasic: 0, rPhasic: 0 }, scl, false), (1 + 0.5) * Math.SQRT1_2));
    const samples = [{ pTonic: 3, rTonic: 0, pPhasic: 1, rPhasic: 0 }, { pTonic: -4, rTonic: 0, pPhasic: 1, rPhasic: 0 }];
    const sc = V.scalesFrom(samples);
    ok("!! scales make each signal unit RMS over the samples (sqrt((9+16)/2) = 3.5355 gives 0.2828; a unit signal gives 1); a signal that is always zero keeps scale 1; no samples give all 1", near(sc.pTonic, 1 / Math.sqrt(12.5)) && near(sc.pPhasic, 1) && sc.rTonic === 1 && sc.rPhasic === 1 && J(V.scalesFrom([])) === J({ pTonic: 1, rTonic: 1, pPhasic: 1, rPhasic: 1 }) && near(Math.sqrt(samples.reduce((s, v) => s + (v.pTonic * sc.pTonic) ** 2, 0) / 2), 1));
    ok("!! a non-finite sample counts as zero in the scale", near(V.scalesFrom([{ pTonic: NaN, rTonic: 2, pPhasic: 0, rPhasic: 0 }, { pTonic: 1, rTonic: 2, pPhasic: 0, rPhasic: 0 }]).pTonic, Math.SQRT2));
    ok("!! the four signals, by name", J(V.SENSES) === J(["pTonic", "rTonic", "pPhasic", "rPhasic"]) && Object.isFrozen(V.SENSES));
}

sec("5. THE LEAK (worked numbers on the toy)");
{
    const p = V.createVestibularPolicy(TOY, "toy"), none = V.createVestibularPolicy(TOY, "toy", { persist: false }), w = toyWeights(p, 0.5), w0 = toyWeights(none);
    const hold = Array.from({ length: 2 }, () => ({ pTonic: 0, rTonic: 0.1, pPhasic: 0, rPhasic: 0 })), a = p.activityTrace(w, hold);
    ok("!! right-side-down 0.1 held, lambda 0.5: tick 1 input 0 = 0.1 and cell 0 = 0.1; tick 2 input 0 = 0.15 and cell 0 = 0.2 (the cell leaks its own last activity too)", near(a[0][0], 0.1) && near(a[0][2], 0.1) && near(a[1][0], 0.15) && near(a[1][2], 0.2) && a[0][1] === 0 && a[0][3] === 0 && a[1][3] === 0);
    const left = p.activityTrace(w, hold, true);
    ok("!! the left copy flips the cosine term: input 0 reads -0.1, the relu holds everything at 0", left.every((r) => r.every((v) => v === 0)));
    const pulse = [{ pTonic: 0, rTonic: 0, pPhasic: 0.2, rPhasic: 0 }, ...Array.from({ length: 2 }, () => ({ pTonic: 0, rTonic: 0, pPhasic: 0, rPhasic: 0 }))], b = p.activityTrace(w, pulse);
    ok("!! one pitch-rate pulse, lambda 0.5: tick 1 cells [0.2, 0.2]; tick 2 input 1 = 0.1 and cells [0.2, 0.2]; tick 3 input 1 = 0.05 and cells [0.15, 0.15] (a central cell takes the afferent's NEW activity the same tick)", near(b[0][1], 0.2) && near(b[0][2], 0.2) && near(b[0][3], 0.2) && near(b[1][1], 0.1) && near(b[1][2], 0.2) && near(b[1][3], 0.2) && near(b[2][1], 0.05) && near(b[2][2], 0.15) && near(b[2][3], 0.15));
    const bn = none.activityTrace(w0, pulse);
    ok("!! NO STATE: the same pulse is gone at tick 2 (inputs 0, cells 0) and is [0.2, 0.2] only at tick 1", near(bn[0][2], 0.2) && near(bn[0][3], 0.2) && bn[1].every((v) => v === 0) && bn[2].every((v) => v === 0));
    const w2 = toyWeights(p, 0.5); w2[0] = -1; w2[1] = -1;
    ok("!! an edge weight is a MAGNITUDE (a trained -1 acts as 1: every edge is excitatory, so the sign of the stored weight cannot turn it inhibitory)", J(p.activityTrace(w2, pulse)) === J(b));
    const wb = toyWeights(p, 0.5); wb[3] = -0.05; wb[5] = 0.3;
    const bb = p.activityTrace(wb, hold);
    ok("!! the biases: input 0's bias is added before the relu (0.1 - 0.05 = 0.05) and a central cell's bias is added to its weighted input (cell 0 = 0.3 + 1 x 0.05 = 0.35)", near(bb[0][0], 0.05, 1e-6) && near(bb[0][2], 0.35, 1e-6) && near(bb[0][3], 0));
    const wl = toyWeights(p, 1.7), wz = toyWeights(p, -0.4);
    ok("!! lambda is read clamped to [0, 1]: 1.7 acts as 1 (tick 2 input 1 = 0.2 + 0.2), -0.4 as 0 (nothing carries)", near(p.activityTrace(wl, pulse)[1][1], 0.2) && near(p.activityTrace(wz, pulse)[1][1], 0));
    const wcb = toyWeights(p, 0.5); wcb[6] = -1;   // cell 1's bias
    ok("!! a central cell's activity is rectified (a bias of -1 leaves cell 1 at 0, not -1, on every tick) while its leaky copy of itself carries only what was positive", p.activityTrace(wcb, pulse).every((r) => r[3] >= 0) && near(p.activityTrace(wcb, pulse)[0][3], 0));
    const sc2 = V.createVestibularPolicy(TOY, "toy", { scales: { rTonic: 2 } });
    ok("!! the `scales` option reaches the drive: with rTonic scaled by 2 the held right-side-down body drives input 0 at 0.2 instead of 0.1; the other signals keep scale 1", near(sc2.activityTrace(toyWeights(sc2, 0.5), hold)[0][0], 0.2) && near(sc2.activityTrace(toyWeights(sc2, 0.5), [{ pTonic: 0, rTonic: 0, pPhasic: 0.2, rPhasic: 0 }])[0][1], 0.2));
    const wn = toyWeights(p, NaN);
    ok("!! a non-finite lambda reads as 0 (no memory) rather than poisoning every cell", p.activityTrace(wn, pulse).every((r) => r.every(Number.isFinite)) && near(p.activityTrace(wn, pulse)[1][1], 0));
    const rd = (pp, ww) => pp.pilotFor(ww);
    ok("!! the start (hand weights): lambda 0.99, edge magnitudes 0.3 x count / mean count (mean 8/3: 0.225, 0.45, 0.225), biases 0, a zero readout", (() => { const h = p.handWeights(); return near(h[p.LAMBDA_INDEX], 0.99, 1e-6) && near(h[0], 0.3 * 2 / (8 / 3), 1e-6) && near(h[1], 0.3 * 4 / (8 / 3), 1e-6) && near(h[2], 0.3 * 2 / (8 / 3), 1e-6) && h.slice(3, 7).every((v) => v === 0) && h.slice(7, p.LAMBDA_INDEX).every((v) => v === 0); })() && none.handWeights().length === 7 + 8 + 4 && p.zeroWeights().every((v) => v === 0));
    // the pilot: the state is held while the target object is the same and reset when it changes
    const tgtA = { depth: 30, heading: 0, speed: 2.5 }, tgtB = { depth: 30, heading: 0, speed: 2.5 };
    const OFF_W2 = 3 + 4, RW = (o, cell) => OFF_W2 + o * 2 + cell;   // the toy: 3 edges, 4 cells of bias; output o reads cell `cell`
    const ww = new Float32Array(p.WEIGHT_COUNT); ww[0] = ww[1] = ww[2] = 1; ww[p.LAMBDA_INDEX] = 0.9; ww[RW(2, 0)] = 0.1;   // thrust reads cell 0 (a small weight, so the clamp is never reached)
    const pulseS = st({ w: [0, 0.2, 0] }), rest = st({}), thr = (pil, s, t) => pil(s, t, [0, 0, 0]).thrust - AS.decide(s, t).thrust;
    const pa = p.pilotFor(ww), a1 = thr(pa, pulseS, tgtA), a2 = thr(pa, rest, tgtA), a3 = thr(pa, rest, tgtA);
    const pb = p.pilotFor(ww); thr(pb, pulseS, tgtA); const b2 = thr(pb, rest, tgtB), pc = p.pilotFor(ww), c1 = thr(pc, rest, tgtA);
    ok("!! the state is held while the target object is the same (a pulse leaves the thrust raised on the next two ticks: the cells leak their own activity and the central cell takes the afferent's, so the response builds before it fades) and RESET when it changes (a new target object reads exactly as a fresh pilot)", a1 > 1e-4 && a2 > a1 && a3 > 1e-4 && near(b2, c1, 1e-9) && c1 < 1e-6);
}

sec("5d. 4b-D, THE DENSE-INPUT VARIANT (Addendum 8)");
{
    const dp = V.createVestibularPolicy(TOY, "toyD", { dense: true }), dn = V.createVestibularPolicy(TOY, "toyD", { dense: true, persist: false });
    ok("!! the dense variant's counts: the toy has 14 x 2 = 28 more weights (48 with the leak, 47 without); the real arms are the registration's D counts, 1,831 (whole), 1,655 (B) and 435 (E) with no state and one more with the leak; the tuning-derived pilot is unchanged (20 on the toy)", dp.WEIGHT_COUNT === 48 && dn.WEIGHT_COUNT === 47 && V.createVestibularPolicy(TOY, "t").WEIGHT_COUNT === 20 && [["whole", 1831], ["B", 1655], ["E", 435]].every(([arm, d]) => V.createVestibularPolicy(V.circuitOf(X, arm), arm, { dense: true, persist: false }).WEIGHT_COUNT === d && V.createVestibularPolicy(V.circuitOf(X, arm), arm, { dense: true }).WEIGHT_COUNT === d + 1 && F.armOf(X, arm).trainableD === d) && dp.dense === true && dn.dense === true && V.createVestibularPolicy(TOY, "t").dense === false && dp.LAMBDA_INDEX === 19 && dn.LAMBDA_INDEX === -1);
    const OFF_IN = 20, wD = (extra = {}) => { const w = new Float32Array(48); w[0] = w[1] = w[2] = 1; w[19] = 0.5; for (const [k, v] of Object.entries(extra)) w[Number(k)] = v; return w; };
    const x0 = (o) => { const x = new Array(14).fill(0); for (const [k, v] of Object.entries(o)) x[Number(k)] = v; return x; };
    // input 0 reads pitchErr (2) and headingErr (4); input 1 reads pitchRate (3)
    const W1 = wD({ [OFF_IN + 0 * 14 + 2]: 1, [OFF_IN + 0 * 14 + 4]: 1, [OFF_IN + 1 * 14 + 3]: 2 }), tr = dp.activityTrace(W1, [x0({ 2: 0.1, 4: 0.3, 3: -0.2 })]), trL = dp.activityTrace(W1, [x0({ 2: 0.1, 4: 0.3, 3: -0.2 })], true);
    ok("!! worked: input 0 = pitchErr 0.1 + headingErr 0.3 = 0.4, input 1 = 2 x pitchRate -0.2 -> relu 0; cell 0 = 0.4 (edge 0>0, weight 1), cell 1 = 0; the LEFT copy flips headingErr (lateral): input 0 = 0.1 - 0.3 -> relu 0, everything 0", near(tr[0][0], 0.4) && tr[0][1] === 0 && near(tr[0][2], 0.4) && tr[0][3] === 0 && trL[0].every((v) => v === 0));
    const tr2 = dp.activityTrace(W1, [x0({ 3: 0.2 })]), tr2L = dp.activityTrace(W1, [x0({ 3: 0.2 })], true);
    ok("!! pitchRate is even under the mirror: both copies read input 1 = 2 x 0.2 = 0.4 (its own row of weights, not input 0's), so cell 0 = 0.4 (edge 1>0) and cell 1 = 0.4 (edge 1>1) in both", near(tr2[0][1], 0.4) && near(tr2[0][2], 0.4) && near(tr2[0][3], 0.4) && J(tr2) === J(tr2L));
    const lat = [4, 5, 6, 11], side = [];
    for (let f = 0; f < 14; f++) { const w = wD({ [OFF_IN + f]: 1 }), a = dp.activityTrace(w, [x0({ [f]: 0.3 })])[0][0], b = dp.activityTrace(w, [x0({ [f]: 0.3 })], true)[0][0]; side.push([f, near(a, 0.3), lat.includes(f) ? b === 0 : near(b, 0.3)]); }
    ok("!! exactly four features are odd under the mirror: headingErr (4), yawRate (5), beta (6) and bank (11) read 0.3 in the right copy and are flipped (relu 0) in the left; the other ten are the same in both", J(V.LATERAL) === J([4, 5, 6, 11]) && Object.isFrozen(V.LATERAL) && side.every(([, r, l]) => r && l));
    const permuted = { ...TOY, inputs: TOY.inputs.map((a, i) => ({ ...a, theta: 2.5 + i, myelinated: !a.myelinated })) }, dq = V.createVestibularPolicy(permuted, "q", { dense: true });
    ok("!! the dense variant does not read the tuning angles or the kinetic classes: a circuit with other angles and the classes swapped gives the same activity", J(dq.activityTrace(W1, [x0({ 2: 0.1, 4: 0.3, 3: 0.2 })])) === J(dp.activityTrace(W1, [x0({ 2: 0.1, 4: 0.3, 3: 0.2 })])));
    const nan = dp.activityTrace(W1, [x0({ 2: NaN, 4: 0.3 })]);
    ok("!! a non-finite feature counts as 0 in the dense drive (input 0 = 0.3, not NaN)", nan[0].every(Number.isFinite) && near(nan[0][0], 0.3));
    const hw = dp.handWeights(), gaussSeq = (() => { let a = 4711; const rng = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; const g = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; return Array.from({ length: 28 }, () => g() * 0.2); })();
    ok("!! the dense start: the 28 input weights are the seeded gaussians x 0.2 (seed 4711, the other dense pilots' start; re-derived here), after the lambda; the edges, biases and lambda are as for the tuning-derived pilot, the readout zero; the tuning-derived pilot has no such block", gaussSeq.every((g, i) => near(hw[OFF_IN + i], g, 1e-6)) && near(hw[19], 0.99, 1e-6) && near(hw[0], 0.3 * 2 / (8 / 3), 1e-6) && hw.slice(7, 19).every((v) => v === 0) && V.INIT.inScale === 0.2 && V.createVestibularPolicy(TOY, "t").handWeights().length === 20);
    const dE = V.createVestibularPolicy(V.circuitOf(X, "whole"), "whole", { dense: true }), setD = T.BASELINE_SET.filter((q) => q.kind === "nominal").slice(0, 2);
    ok("!! the dense start IS the autopilot too (the readout is zero): the hand weights score the PD autopilot on two dives; and a dense weight vector of zeros likewise", near(dE.evaluate(dE.handWeights(), setD).score, T.evaluate(AS.pilot(), setD).score, 1e-9) && near(dE.evaluate(dE.zeroWeights(), setD).score, T.evaluate(AS.pilot(), setD).score, 1e-9));
    // the mirror end to end: weights from input 0 on bank (11); yaw and pitch read cell 0
    const RW = (o, cell) => 7 + o * 2 + cell, W3 = wD({ [OFF_IN + 11]: 1, [RW(1, 0)]: 1, [RW(0, 0)]: 1 }), tgt = { depth: 30, heading: 0, speed: 2.5 };
    const res = (state) => { const o = dp.pilotFor(W3)(state, tgt, [0, 0, 0]), b = AS.decide(state, tgt); return { yaw: o.yaw - b.yaw, pitch: o.pitch - b.pitch }; };
    const rr = res(st({ bank: 0.1 })), rl = res(st({ bank: -0.1 }));
    ok("!! MIRROR end to end (dense): a right-side-down and a left-side-down body give residual yaw of equal size and opposite sign and the same pitch, and the feature read is the bank the pilot is given", rr.yaw > 0.01 && near(rr.yaw, -rl.yaw, 1e-9) && near(rr.pitch, rl.pitch, 1e-9) && rr.pitch > 0.01);
    const big = dp.perturb(wD(), 50, rng0(3));
    ok("!! mutate and perturb keep lambda (index 19, BEFORE the dense block) in [0, 1] and leave the dense weights free; the weights stay in the dense block's range", big[19] >= 0 && big[19] <= 1 && Array.from(big.slice(20)).some((v) => Math.abs(v) > 1) && dp.mutate(wD(), 50, rng0(5), 4).length === 48);
    ok("!! the report says the input is DENSE from the 14 features and counts the dense weights; the tuning-derived pilot's report does not", /DENSE trained input from the 14 features/.test(dp.reportLines()[0]) && /48 trained weights/.test(dp.reportLines()[0]) && !/DENSE/.test(V.createVestibularPolicy(TOY, "t").reportLines()[0]) && /tuning-derived input/.test(V.createVestibularPolicy(TOY, "t").reportLines()[0]));
    function rng0(a = 5) { return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; }
}

sec("6. THE PILOT (the start, the mirror, the clamps, the sign on real hazard dives)");
{
    const rest0 = () => st({});
    const E = V.circuitOf(X, "E"), p = V.createVestibularPolicy(E, "E"), set = T.BASELINE_SET.filter((s) => s.kind === "nominal").slice(0, 3);
    ok("!! the start IS the autopilot: the hand weights score exactly the PD autopilot on the dives (the readout is zero)", near(p.evaluate(p.handWeights(), set).score, T.evaluate(AS.pilot(), set).score, 1e-9));
    ok("!! and a zero weight vector (lambda 0) is the autopilot too", near(p.evaluate(p.zeroWeights(), set).score, T.evaluate(AS.pilot(), set).score, 1e-9));
    const sc = set[0], s0 = st({ pitch: 0.05, bank: 0.1 }), ap = AS.decide(s0, sc.target), got = p.pilotFor(p.handWeights())(s0, sc.target, [0, 0, 0]);
    ok("!! the first command from the hand weights equals the autopilot's on the same state, field by field", ["pitch", "yaw", "thrust", "ballast"].every((k) => near(got[k], ap[k], 1e-6)));
    const toy = V.createVestibularPolicy(TOY, "toy"), OFF_W2 = 3 + 4, RW = (o, cell) => OFF_W2 + o * 2 + cell, tgt = { depth: 30, heading: 0, speed: 2.5 }, clampTo = (v) => Math.max(-1, Math.min(1, v));
    const pulse = st({ w: [0, 0.2, 0] }), W2 = toyWeights(toy, 0.5); W2[RW(1, 1)] = 2; W2[RW(0, 1)] = 2;   // yaw and pitch read cell 1 with weight 2
    const q = toy.pilotFor(W2)(pulse, tgt, [0, 0, 0]), apq = AS.decide(pulse, tgt);
    ok("!! MIRROR: a pitch-rate pulse has no lateral part, so both copies hold cell 1 at 0.2: yaw (odd) is the law + 0.4 - 0.4 = the law; pitch (even) is the law + 0.4 + 0.4", near(q.yaw, clampTo(apq.yaw), 1e-6) && near(q.pitch, clampTo(apq.pitch + 0.8), 1e-6));
    const W3 = toyWeights(toy, 0.5); W3[RW(1, 0)] = 1; W3[RW(0, 0)] = 1;   // yaw and pitch read cell 0
    const resid = (s) => { const o = toy.pilotFor(W3)(s, tgt, [0, 0, 0]), b = AS.decide(s, tgt); return { yaw: o.yaw - b.yaw, pitch: o.pitch - b.pitch }; };
    const rr = resid(st({ bank: 0.1 })), rl = resid(st({ bank: -0.1 }));
    ok("!! MIRROR end to end: a right-side-down and a left-side-down body give residual yaw of equal size and OPPOSITE sign (the right copy answers the first; the left copy, with its yaw negated, the second) and the SAME pitch", near(rr.yaw, 0.1, 1e-6) && near(rl.yaw, -0.1, 1e-6) && near(rr.pitch, 0.1, 1e-6) && near(rl.pitch, 0.1, 1e-6));
    const big = toyWeights(toy, 0.5); for (let o = 0; o < 4; o++) big[RW(o, 1)] = 1e6;
    const c = toy.pilotFor(big)(pulse, tgt, [0, 0, 0]);
    ok("!! every control is clamped to [-1, 1], whatever the weights say (1e6 on every output)", c.pitch === 1 && c.thrust === 1 && c.ballast === 1 && c.yaw >= -1 && c.yaw <= 1);
    const big2 = toyWeights(toy, 0.5); big2[RW(1, 0)] = 1e6; const c2 = toy.pilotFor(big2)(st({ bank: 0.1 }), tgt, [0, 0, 0]), big3 = toyWeights(toy, 0.5); big3[RW(1, 0)] = 1e6; const c3 = toy.pilotFor(big3)(st({ bank: -0.1 }), tgt, [0, 0, 0]);
    ok("!! yaw clamps at both ends (+1 from the right copy, -1 from the left copy's negated yaw)", c2.yaw === 1 && c3.yaw === -1);
    for (const [o, nmO] of [[0, "pitch"], [1, "yaw"], [2, "thrust"], [3, "ballast"]]) {
        const nanW = toyWeights(toy, 0.5); nanW[RW(o, 1)] = NaN; const nc = toy.pilotFor(nanW)(pulse, tgt, [0, 0, 0]);
        ok(`!! a non-finite ${nmO} readout weight cannot put a non-finite number on any control (it reads as 0)`, ["pitch", "yaw", "thrust", "ballast"].every((k) => Number.isFinite(nc[k])));
    }
    const OFF_B2 = OFF_W2 + 8, bw = toyWeights(toy, 0.5); bw[OFF_B2 + 2] = 0.05; bw[OFF_B2 + 1] = 0.07;
    const bo = toy.pilotFor(bw)(rest0(), tgt, [0, 0, 0]), b0 = AS.decide(rest0(), tgt);
    ok("!! the readout biases are added in each copy: a thrust bias of 0.05 gives the thrust 0.10 (both copies, even) and a yaw bias of 0.07 gives the yaw nothing (odd, so the copies cancel)", near(bo.thrust - b0.thrust, 0.1, 1e-6) && near(bo.yaw - b0.yaw, 0, 1e-6));
    const cur = [0.4, 0.2, 0], moving = st({ speed: 2, bank: 0.05 }), withCur = p.pilotFor(p.handWeights())(moving, tgt, cur), apCur = AS.decide(moving, tgt, cur);
    ok("!! the water's current reaches the autopilot's laws and the features (at the hand weights the commands equal the autopilot's in a current, field by field, and differ from its command in still water)", ["pitch", "yaw", "thrust", "ballast"].every((k) => near(withCur[k], apCur[k], 1e-6)) && Math.abs(withCur.thrust - AS.decide(moving, tgt).thrust) > 1e-4);
    // the end-to-end sign on real hazard dives, as the DIFFERENCE from the same dive with no hazard (so the autopilot's own movement cancels)
    const dives = H.hazardDives(), right = dives.find((d) => d.side === 1), leftD = dives.filter((d) => d.side === -1).find((d) => d.sc.seed === right.sc.seed);
    const NCe = 5, OFFW2 = 31 + 30, yawW = (pol) => { const w = pol.handWeights(); for (let cI = 0; cI < NCe; cI++) w[OFFW2 + 1 * NCe + cI] = 0.5; return w; };
    const yawsOf = (pol, dive, hazard) => { const ys = [], pilot = pol.pilotFor(yawW(pol)); H.run((s, t, cv) => { const out = pilot(s, t, cv); ys.push(out.yaw - AS.decide(s, t, cv).yaw); return out; }, dive.sc, hazard ? { disturb: H.hazardDisturbance(dive, 0) } : {}); return ys; };
    const clean = yawsOf(p, right, false), yr = yawsOf(p, right, true), yl = yawsOf(p, leftD, true), cleanL = yawsOf(p, leftD, false), i0 = Math.round(right.t0 / T.DT), i1 = Math.round(leftD.t0 / T.DT);
    const dpk = (a, b, i) => { let best = 0; for (let k = i; k < i + 12; k++) { const d = a[k] - b[k]; if (Math.abs(d) > Math.abs(best)) best = d; } return best; };
    const dR = dpk(yr, clean, i0), dL = dpk(yl, cleanL, i1);
    ok("!! END TO END on real hazard dives (rung 0, one dive seed, from the right and from the left): the two runs equal the no-hazard run until the launch, and in the 12 ticks after it the residual yaw differs from it by amounts of OPPOSITE sign (not equal size: the autopilot's own motion is a different background for the two copies)", near(yr[i0 - 5], clean[i0 - 5], 1e-12) && near(yl[i1 - 5], cleanL[i1 - 5], 1e-12) && Math.abs(dR) > 0.02 && Math.abs(dL) > 0.02 && Math.sign(dR) === -Math.sign(dL), `right ${dR.toFixed(3)}, left ${dL.toFixed(3)}`);
    const pn = V.createVestibularPolicy(E, "En", { persist: false }), yn = yawsOf(pn, right, true), cn = yawsOf(pn, right, false);
    const later = (a, b, k) => Math.abs(a[k] - b[k]), kk = i0 + 90 + 8, early = Math.max(...Array.from({ length: 12 }, (_, j) => later(yr, clean, i0 + j))), earlyN = Math.max(...Array.from({ length: 12 }, (_, j) => later(yn, cn, i0 + j)));
    ok("!! THE REGISTERED QUESTION'S FIRST HALF (Addendum 5, a worked answer): with the leak (hand weights, lambda 0.99) the cue's effect on the residual yaw is still at least a quarter of its early size 3 s later; with NO STATE it is a small fraction of its early size by then", early > 0.02 && later(yr, clean, kk) > 0.25 * early && earlyN > 0 && later(yn, cn, kk) < 0.1 * earlyN, `with ${later(yr, clean, kk).toFixed(3)} of ${early.toFixed(3)}; none ${later(yn, cn, kk).toFixed(3)} of ${earlyN.toFixed(3)}`);
}

sec("7. THE SEARCH (on a stub task: the score is how close the thrust at one fixed state is to 0.6, so the gate stays quick)");
{
    const rng0 = (a = 5) => () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    const tgt = { depth: 30, heading: 0, speed: 2.5 }, probe = st({ w: [0, 0.2, 0] });
    const task = (pilot) => ({ score: -Math.abs(pilot(probe, tgt, [0, 0, 0]).thrust - 0.6) });
    const mk = (extra = {}) => V.createVestibularPolicy(TOY, "toy", { evaluate: task, ...extra });
    const p = mk(), w = toyWeights(p, 0.99), m = p.mutate(w, 5, rng0(), 4), changed = Array.from(m).filter((v, i) => v !== w[i]).length;
    ok("!! mutate changes between 1 and maxK weights, does not touch its input, and keeps lambda in [0, 1] whatever the step", changed >= 1 && changed <= 4 && w[p.LAMBDA_INDEX] === Math.fround(0.99) && (() => { const r = rng0(7); for (let i = 0; i < 300; i++) { const q = p.mutate(w, 50, r, 20); if (q[p.LAMBDA_INDEX] < 0 || q[p.LAMBDA_INDEX] > 1) return false; } return true; })());
    ok("!! mutate's number of changed weights is drawn from 1 to maxK: over 400 mutations of 20 weights with maxK 4 the fewest is 1 and the most is exactly 4", (() => { const r = rng0(11); let lo = 99, hi = 0; for (let i = 0; i < 400; i++) { const q = p.mutate(w, 0.5, r, 4), n = Array.from(q).filter((v, j) => v !== w[j]).length; lo = Math.min(lo, n); hi = Math.max(hi, n); } return lo === 1 && hi === 4; })());
    ok("!! perturb moves every weight (lambda too, then clamps it), keeps lambda in [0, 1] and leaves its input alone", (() => { const q = p.perturb(w, 5, rng0()); return Array.from(q).filter((v, i) => v !== w[i]).length === p.WEIGHT_COUNT && q[p.LAMBDA_INDEX] >= 0 && q[p.LAMBDA_INDEX] <= 1 && w[0] === 1; })());
    const none = V.createVestibularPolicy(TOY, "toy", { persist: false }), wn = toyWeights(none);
    ok("!! with no state there is no lambda slot: mutate and perturb keep the length", none.mutate(wn, 5, rng0()).length === wn.length && none.perturb(wn, 5, rng0()).length === wn.length && wn.length === 19);
    let wrapped = 0; const seen = [], seam = V.createVestibularPolicy(TOY, "toy", { evaluate: (pilot, set, o) => { seen.push({ type: typeof pilot, set, o }); return { score: -1 }; }, wrap: (pl) => { wrapped++; return pl; } });
    const r = seam.evaluate(seam.handWeights(), "SET", { gauge: 1 });
    ok("!! the evaluate seam: the task is whatever `evaluate` says, called with the (wrapped) pilot, the set and the options; the wrap is applied to the pilot first; the default evaluator is the subTask one", r.score === -1 && seen.length === 1 && seen[0].type === "function" && seen[0].set === "SET" && seen[0].o.gauge === 1 && wrapped === 1 && near(V.createVestibularPolicy(TOY, "toy").evaluate(V.createVestibularPolicy(TOY, "toy").zeroWeights(), T.BASELINE_SET.slice(0, 1)).score, T.evaluate(AS.pilot(), T.BASELINE_SET.slice(0, 1)).score, 1e-9));
    const t1 = p.train({ seed: 3, iters: 60, sigma: 0.3 }), t2 = p.train({ seed: 3, iters: 60, sigma: 0.3 }), t3 = p.train({ seed: 4, iters: 60, sigma: 0.3 });
    ok("!! train: the seed fixes the run (two runs equal, another seed differs), the score never falls and ends better than the start, the history runs from iteration 0 to the last, and improved + neutral cannot exceed the iterations", J(Array.from(t1.weights)) === J(Array.from(t2.weights)) && J(Array.from(t1.weights)) !== J(Array.from(t3.weights)) && t1.history[0].i === 0 && t1.history[t1.history.length - 1].i === 60 && t1.history.every((h, i, l) => i === 0 || h.score >= l[i - 1].score) && t1.trainScore > t1.history[0].score && t1.improved >= 1 && t1.improved + t1.neutral <= 60 && t1.iters === 60);
    const flat = V.createVestibularPolicy(TOY, "toy", { evaluate: () => ({ score: -1 }) }), tf = flat.train({ seed: 3, iters: 20 });
    ok("!! a child that scores exactly its parent replaces it and is counted apart: on a task that cannot tell weights apart all 20 children are neutral, none improved, and the weights moved", tf.neutral === 20 && tf.improved === 0 && J(Array.from(tf.weights)) !== J(Array.from(flat.handWeights())));
    const t4 = p.train({ seed: 3, iters: 0, start: w });
    ok("!! train from a given start with no iterations returns the start unchanged (a copy, not the same array)", J(Array.from(t4.weights)) === J(Array.from(w)) && t4.weights !== w && t4.history.length === 1);
    ok("!! train never accepts a worse child: the final score equals the best of the history", t1.trainScore === t1.history[t1.history.length - 1].score && near(p.evaluate(t1.weights).score, t1.trainScore, 1e-9));
    const pr = p.prune(t1.weights);
    ok("!! prune puts back every weight that is not needed: it keeps fewer than were moved, the score does not fall, and every kept weight differs from the start", pr.kept < pr.moved && pr.passes >= 2 && pr.trainScore >= t1.trainScore - 1e-9 && near(p.evaluate(pr.weights).score, pr.trainScore, 1e-9) && pr.passes >= 1 && (() => { const h = p.handWeights(); let k = 0; for (let i = 0; i < h.length; i++) if (Math.abs(pr.weights[i] - h[i]) > 1e-6) k++; return k === pr.kept; })());
    ok("!! prune toward a given start reverts to THAT start, not the hand weights", (() => { const alt = p.handWeights(); alt[0] = 0.9; const out = p.prune(alt, { toward: alt }); return out.kept === 0 && out.moved === 0; })());
    const rep = p.reportLines();
    ok("!! the report names the arm, the sizes, the weight count and the reach", rep.length === 2 && /toy \(2 inputs, 2 cells, 3 synapses\) as a leaky-state mirrored pair/.test(rep[0]) && /20 trained weights/.test(rep[0]) && /2 of 2 inputs reach a cell; 2 of 2 cells are reached/.test(rep[1]) && /NO-STATE/.test(none.reportLines()[0]) && /19 trained weights/.test(none.reportLines()[0]));
    ok("!! the contract of brain/pilotSubPolicy.mjs is there: name, FEATURES 14, HIDDEN (all cells), OUTPUTS 4, WEIGHT_COUNT, the functions the trainer calls", p.name === "toy" && p.FEATURES === 14 && p.OUTPUTS === 4 && p.HIDDEN === 4 && p.INPUTS === 2 && p.CELLS === 2 && p.EDGES === 3 && p.persist === true && none.persist === false && ["zeroWeights", "handWeights", "pilotFor", "perturb", "mutate", "evaluate", "train", "prune", "reportLines", "activityTrace"].every((k) => typeof p[k] === "function"));
}

sec("8. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./pilotSubVestibular.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! pure: no Math.random, no clock, no file or network, no process", !/Math\.random|Date\.now|new Date|performance\.now|\bfs\b|node:fs|node:net|\bfetch\(|process\./.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
