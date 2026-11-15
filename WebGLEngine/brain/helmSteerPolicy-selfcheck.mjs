// WebGLEngine/brain/helmSteerPolicy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/helmSteerPolicy-selfcheck.mjs      (about ten seconds: a dozen fights)
//
// THE FLY'S STEERING CIRCUIT AT A HELM, HELD. brain/helmSteerPolicy.mjs is brain/helmPolicy.mjs's helm with the wiring a parameter, over the central complex's steering output (brain/pflTopology.mjs: PFL2, PFL3, DNa02, DNa03). Six things hold it:
//
//   1  THE CIRCUIT IS WHAT THE FILE SAYS   the baked topology is the vendored file's neurons and edges (re-derived here); 12 PFL2, 24 PFL3, 2 DNa02, 2 DNa03, 523 connections, none from a neuron to itself twice over; the vendored file names its sources and their hashes
//   2  WHAT THE WIRING SHOWS               every PFL3 reaches a DNa02 and only the DNa02 of the OTHER soma side (all 24; 20 of 24 by the bridge side in the name); every PFL2 reaches both DNa03; DNa03 drives DNa02; the two descending types send almost nothing back
//   3  THE SHAPE AND THE ARITHMETIC        1,248 weights = 480 + 40 + 523 + 200 + 5; forward() against a plain restatement; OVER THE GIANT FIBER CIRCUIT IT IS brain/helmPolicy.mjs TO THE BIT; a synapse carries from the neuron the wiring says to the one it says
//   4  THE ZERO WEIGHTS ARE THE RULE       a ship-against-ship fight with the zero weights at both helms is the fight with no helm network, to the bit, and the networks were asked; a helm that is not zero is another fight; the limits are helmPolicy's
//   5  THE CONTROL                         a random circuit of the same size, the draw of its seed, not the fly's; the same weights another answer; with the synapses at zero the same network
//   6  THE FRONT DOOR                      battleshipDuel seats a helmSteerPolicy brain file at the helm and refuses one a weight short; the report; the export list
//
// SABOTAGE LOG: 25 mutants of brain/helmSteerPolicy.mjs, each a copy of the module with this gate pointed at it (so row 6's `the module at the helm is this one` is red for every copy and is NOT counted). 22 red by name the first time. THREE 0-RED: a helm factory that hands every ship the same helm (the row called the factory twice; it now calls one factory twice), a recurrent matrix never rebuilt after a weight is changed in place (no row changed one; section 3 now does), and an edge's weight SET on the matrix rather than added -- which is the same network when no edge joins a neuron to itself, and none does (now pinned in that row): an equivalent mutant, left. After the two rows: 24 red, 1 equivalent. Red by name: the identity dropped, an edge transposed, two recurrent steps, no tanh on an output, the torque fraction doubled, the throttle read from the unused output, the thrust unclamped, a correction with no enemy, the helm's memory dropped (the section throws), the control the fly's own wiring, another control seed, the four index helpers, the edge check off, the name side read from the first L or R, the policy id, either bias ignored, the core's relu off, features of its own, the torque axes rotated.
"use strict";
import fs from "node:fs";
import * as HS from "./helmSteerPolicy.mjs";
import * as HP from "./helmPolicy.mjs";
import * as PFL from "./pflTopology.mjs";
import * as GFC from "./gfcTopology.mjs";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import { controlTopology } from "./pilotSubFish.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const V = JSON.parse(fs.readFileSync(new URL("../vendor/male-cns/cx-steering-circuit.json", import.meta.url), "utf8")), byId = new Map(V.neurons.map((n) => [n.bodyId, n]));
const mul = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randomW = (lib, seed, scale = 0.3) => { const r = mul(seed), w = lib.zeroWeights(); for (let i = 0; i < w.length; i++) w[i] = Math.fround((r() * 2 - 1) * scale); return w; }, randomX = (seed) => { const r = mul(seed); return Float32Array.from({ length: 12 }, (_, i) => (i ? r() * 2 - 1 : 1)); };
const typeOf = (i) => PFL.NEURON_TYPES[i], H = 40;

console.log("helmSteerPolicy-selfcheck -- the fly's steering circuit at a helm\n");

console.log("1. THE CIRCUIT IS WHAT THE FILE SAYS");
section(() => {
    const idx = new Map(V.neurons.map((n, i) => [n.bodyId, i]));
    ok("!! brain/pflTopology.mjs is the vendored file re-derived: the 40 neurons in the file's order with its types and instance names, and the 523 edges as [target, source] pairs in the file's order", PFL.NEURON_ORDER.join() === V.neurons.map((n) => n.bodyId).join() && PFL.NEURON_TYPES.join() === V.neurons.map((n) => n.type).join() && PFL.NEURON_INSTANCES.join() === V.neurons.map((n) => n.instance).join() && PFL.EDGES.length === V.edges.length && PFL.EDGES.every(([to, from], k) => to === idx.get(V.edges[k][1]) && from === idx.get(V.edges[k][0])) && PFL.DATASET === "male-cns:v1.0");
    ok("12 PFL2, 24 PFL3, 2 DNa02, 2 DNa03, six and twelve and one and one a soma side; 523 connections, every one between two of the 40, no pair twice, every weight a whole number of synapses of at least 1", JSON.stringify(Object.fromEntries(Object.entries(HS.NEURONS).map(([t, v]) => [t, v.length]))) === '{"PFL2":12,"PFL3":24,"DNa02":2,"DNa03":2}' && ["PFL2", "PFL3", "DNa02", "DNa03"].every((t) => V.neurons.filter((n) => n.type === t && n.somaSide === "L").length === V.neurons.filter((n) => n.type === t && n.somaSide === "R").length) && V.edgeCount === 523 && V.neuronCount === 40 && new Set(V.edges.map(([a, b]) => a + ">" + b)).size === 523 && V.edges.every(([a, b, w]) => byId.has(a) && byId.has(b) && Number.isInteger(w) && w >= 1));
    ok("the vendored file says where it came from: the dataset, the public bucket's flat-connectome directory, the two source files by name and sha256, the rows read, the types asked for -- and that its licence is as PROVENANCE.md records and was not re-confirmed", V.dataset === "male-cns:v1.0" && /storage\.googleapis\.com\/flyem-male-cns\/v1\.0\/connectome-data\/flat-connectome/.test(V.server) && /^[0-9a-f]{64}$/.test(V.sources.annotations.sha256) && /^[0-9a-f]{64}$/.test(V.sources.weights.sha256) && V.sources.weights.rows === 25568639 && V.types.join() === "PFL2,PFL3,DNa02,DNa03" && /not re-confirmed/.test(V.license) && /significant-only/.test(V.sources.weights.file));
});

console.log("2. WHAT THE WIRING SHOWS");
section(() => {
    const E = V.edges.map(([a, b, w]) => ({ a: byId.get(a), b: byId.get(b), w })), between = (ta, tb) => E.filter((e) => e.a.type === ta && e.b.type === tb), sum = (l) => l.reduce((x, e) => x + e.w, 0);
    const p3 = between("PFL3", "DNa02"), crossedSoma = p3.filter((e) => e.a.somaSide !== e.b.somaSide), nameSide = (n) => /_([LR])(\d|$|_)/.exec(n.instance)[1], crossedName = p3.filter((e) => nameSide(e.a) !== nameSide(e.b));
    ok("!! EVERY PFL3 REACHES A DNa02, AND ONLY THE ONE ACROSS THE MIDLINE: 24 connections, one from each of the 24 PFL3 cells, every one to the DNa02 whose cell body is on the other side (by `somaSide`: 24 of 24; by the bridge side in the instance name: 20 of 24) -- 736 synapses, 380 left-to-right and 356 right-to-left", p3.length === 24 && new Set(p3.map((e) => e.a.bodyId)).size === 24 && crossedSoma.length === 24 && crossedName.length === 20 && sum(p3) === 736 && sum(p3.filter((e) => e.a.somaSide === "L")) === 380 && sum(p3.filter((e) => e.a.somaSide === "R")) === 356);
    const p2 = between("PFL2", "DNa03");
    ok("!! every PFL2 reaches BOTH DNa03 (24 connections from 12 cells, 1,571 synapses: the heaviest pathway of the circuit), and PFL2 barely touches DNa02 (5 synapses)", p2.length === 24 && V.neurons.filter((n) => n.type === "PFL2").every((n) => p2.filter((e) => e.a.bodyId === n.bodyId).length === 2) && sum(p2) === 1571 && sum(between("PFL2", "DNa02")) === 5 && Math.max(...["PFL3>PFL3", "PFL3>DNa02", "PFL2>PFL2", "DNa03>DNa02", "PFL3>DNa03"].map((k) => sum(between(...k.split(">"))))) < 1571);
    ok("DNa03 drives DNa02 (552 synapses, 7 the other way), and the descending neurons send almost nothing back up (5 synapses to all 36 PFL cells); within their own type PFL3 cells make 253 connections and PFL2 cells 125", sum(between("DNa03", "DNa02")) === 552 && sum(between("DNa02", "DNa03")) === 7 && sum(between("DNa03", "PFL2")) + sum(between("DNa03", "PFL3")) + sum(between("DNa02", "PFL2")) + sum(between("DNa02", "PFL3")) === 5 && between("PFL3", "PFL3").length === 253 && between("PFL2", "PFL2").length === 125);
    ok("the module's own tables agree with the file: the neurons by type are indices into the hidden layer, and the side in a name is the name's (NOT the soma's: they differ for some PFL cells)", HS.NEURONS.DNa02.join() === "36,37" && HS.NEURONS.PFL3.length === 24 && HS.NAME_SIDES.length === 40 && HS.NAME_SIDES.every((sd, i) => sd === nameSide(V.neurons[i])) && V.neurons.some((n, i) => HS.NAME_SIDES[i] !== n.somaSide));
});

console.log("3. THE SHAPE AND THE ARITHMETIC");
section(() => {
    ok("!! 12 features, 40 neurons, 523 synapses, 5 outputs, three recurrent steps: 1,248 weights = 480 + 40 + 523 + 200 + 5; the features, the names and the two limits are helmPolicy's own", HS.FEATURES === 12 && HS.HIDDEN === 40 && HS.REC_EDGES === 523 && HS.OUTPUTS === 5 && HS.REC_STEPS === 3 && HS.WEIGHT_COUNT === 1248 && HS.zeroWeights().length === 1248 && HS.featuresOf === HP.featuresOf && HS.FEATURE_NAMES === HP.FEATURE_NAMES && HS.OUTPUT_NAMES === HP.OUTPUT_NAMES && HS.TORQUE_FRACTION === 0.5 && HS.THROTTLE_FRACTION === 0.3 && HS.POLICY_ID === "helmSteerPolicy");
    const f = Math.fround, plain = (topo, w, x) => { const n = topo.NEURON_ORDER.length, rec = 12 * n + n, out = rec + topo.EDGES.length; let h = Array.from({ length: n }, (_, j) => { let a = w[12 * n + j]; for (let i = 0; i < 12; i++) a = f(a + f(w[j * 12 + i] * x[i])); return Math.max(0, a); }); const M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))); topo.EDGES.forEach(([to, from], k) => { M[to][from] = f(M[to][from] + w[rec + k]); }); for (let s = 0; s < 3; s++) h = M.map((row) => { let a = 0; for (let j = 0; j < n; j++) a = f(a + f(row[j] * h[j])); return Math.max(0, a); }); return [0, 1, 2, 3, 4].map((o) => { let a = w[out + n * 5 + o]; for (let j = 0; j < n; j++) a = f(a + f(w[out + o * n + j] * h[j])); return Math.tanh(a); }); };
    let worst = 0, big = false; for (let s = 1; s <= 20; s++) { const w = randomW(HS, s, 0.2), x = randomX(100 + s), a = HS.forward(w, x), b = plain(PFL, w, x); worst = Math.max(worst, ...a.map((v, i) => Math.abs(v - b[i]))); big = big || a.some((v) => Math.abs(v) > 0.3); }
    ok("!! forward() is a plain restatement written here (loops, nothing shared) to 1e-6 on twenty random networks and inputs, and the outputs are not trivial", worst < 1e-6 && big, `worst difference ${worst.toExponential(2)}`);
    const G = HS.createHelmCircuit(GFC); let same = G.WEIGHT_COUNT === HP.WEIGHT_COUNT; for (let s = 1; s <= 12 && same; s++) { const w = randomW(G, s), x = randomX(200 + s); same = HP.forward(w, x).join() === G.forward(w, x).join(); }
    const SHIP = CS.createCapitalShip(), body = RB.createBody({ mass: SHIP.mass, I: [...SHIP.I] }), ctx = { body, ship: SHIP, foe: { body: { pos: [300, 120, -40], vel: [0, 5, 0] } }, thrustMax: 1500 }, rule = { torque: [10, -20, 30], thrust: 450 }, wg = randomW(G, 5);
    ok("!! OVER THE GIANT FIBER CIRCUIT THIS FILE IS brain/helmPolicy.mjs TO THE BIT: 930 weights, twelve random networks the same five numbers, and the helm's answer to a rule (the corrected torque and thrust) the same", same && JSON.stringify(G.helmFor(wg)(rule, ctx)) === JSON.stringify(HP.helmFor(wg)(rule, ctx)) && JSON.stringify(G.helmFor(wg)(rule, ctx)) !== JSON.stringify(rule));
    const k = PFL.EDGES.findIndex(([to, from]) => typeOf(from) === "PFL3" && typeOf(to) === "DNa02"), [to, from] = PFL.EDGES[k], x0 = Float32Array.from({ length: 12 }, (_, i) => (i ? 0 : 1)), probe = (recW, read) => { const w = HS.zeroWeights(); w[HS.encoderAt(from, 0)] = 1; w[HS.synapseAt(k)] = recW; w[HS.outputAt(2, read)] = 1; return HS.forward(w, x0)[2]; };
    const other = HS.NEURONS.DNa02.find((i) => i !== to);
    ok("!! a weight of 0.5 on ONE REAL SYNAPSE, a PFL3 cell onto its DNa02: after three steps the DNa02 it reaches holds 1.5 and reads out as tanh(1.5); the OTHER DNa02, which that PFL3 does not reach, reads 0; with the weight at 0 nothing arrives", Math.abs(probe(0.5, to) - Math.tanh(1.5)) < 1e-6 && probe(0.5, other) === 0 && probe(0, to) === 0 && typeOf(to) === "DNa02" && typeOf(other) === "DNa02", `synapse ${k}: ${PFL.NEURON_INSTANCES[from]} -> ${PFL.NEURON_INSTANCES[to]}`);
    const wm = randomW(HS, 31, 0.2), xm = randomX(31), before = HS.forward(wm, xm).join(); wm[HS.synapseAt(k)] += 0.7; const after = HS.forward(wm, xm).join();
    ok("!! a weight CHANGED IN PLACE is seen: the same array after one synapse moves answers as a fresh copy of it does, and not as it did before (a search edits weights in place; a stale recurrent matrix would hide every synapse child)", after === HS.forward(Float32Array.from(wm), xm).join() && after !== before && PFL.EDGES.every(([a, b]) => a !== b));
    ok("where the weights are: the helpers land in their blocks and the last weight is the fifth output's bias; a wiring with no edges, or an edge to a neuron it does not have, is refused by name", HS.encoderAt(0, 0) === 0 && HS.hiddenBiasAt(0) === 480 && HS.synapseAt(0) === 520 && HS.outputAt(0, 0) === 1043 && HS.biasAt(4) === 1247 && throwsWith(() => HS.createHelmCircuit({ NEURON_ORDER: [1, 2], EDGES: [] }), /a wiring is \{ NEURON_ORDER, EDGES/) && throwsWith(() => HS.createHelmCircuit({ NEURON_ORDER: [1, 2], EDGES: [[0, 5]] }), /an edge names a neuron the wiring does not have \(\[0, 5\] of 2\)/));
});

console.log("4. THE ZERO WEIGHTS ARE THE RULE");
section(() => {
    const rule = D.makeSide("rule"), zero = D.makeSide("zero", { helmNet: { module: HS, weights: HS.zeroWeights() } }), a = D.duel(rule, rule, 3, "crossing"), b = D.duel(zero, zero, 3, "crossing");
    ok("!! a ship-against-ship fight with the steering circuit's ZERO weights at both helms is the fight with no helm network TO THE BIT (the fingerprint, the scores, the rounds) -- and the two networks were asked every tick", b.fingerprint === a.fingerprint && JSON.stringify(b.scores) === JSON.stringify(a.scores) && b.rounds.join() === a.rounds.join() && b.brains.seated.join() === "1,1" && b.brains.asked >= 2 * b.ticks - 4 && a.brains.asked === 0, `${b.brains.asked} forward passes in ${b.ticks} ticks`);
    const turn = HS.zeroWeights(); turn[HS.biasAt(2)] = 3; const c = D.duel(D.makeSide("turn", { helmNet: { module: HS, weights: turn } }), rule, 3, "crossing");
    ok("a helm that is not zero (a constant hard turn about the deck's axis) is another fight", c.fingerprint !== a.fingerprint);
    const SHIP = CS.createCapitalShip(), body = RB.createBody({ mass: SHIP.mass, I: [...SHIP.I] }), ctx = { body, ship: SHIP, foe: { body: { pos: [300, 0, 0], vel: [0, 0, 0] } }, thrustMax: 1500 }, full = HS.zeroWeights(); for (let o = 0; o < 4; o++) full[HS.biasAt(o)] = 20;
    const out = HS.helmFor(full)({ torque: [0, 0, 0], thrust: 450 }, ctx), none = HS.helmFor(full)({ torque: [1, 2, 3], thrust: 450 }, { ...ctx, foe: null }), h = HS.helmFor(full); h({ torque: [0, 0, 0], thrust: 450 }, ctx);
    ok("the limits are helmPolicy's: a full correction is half the hull's torque limit about each axis and 0.3 of the pods' thrust, the thrust stays within what the pods give; with no enemy the rule's answer is handed back; each helm remembers what it was shown", out.torque.every((t, i) => Math.abs(t - 0.5 * SHIP.maxAlpha * body.I[i]) < 1e-6 * body.I[i]) && Math.abs(out.thrust - 900) < 1e-6 && HS.helmFor(full)({ torque: [0, 0, 0], thrust: 1400 }, ctx).thrust === 1500 && JSON.stringify(none) === '{"torque":[1,2,3],"thrust":450}' && h.last.x.length === 12 && h.last.y.length === 5 && ((fac) => fac() !== fac())(HS.helmFactory(full)));
});

console.log("5. THE CONTROL");
section(() => {
    const C = HS.control, keys = new Set(C.edges.map(([a, b]) => a * H + b)), real = new Set(PFL.EDGES.map(([a, b]) => a * H + b)), shared = [...keys].filter((k) => real.has(k)).length, w = randomW(HS, 9), x = randomX(9), z = Float32Array.from(w); z.fill(0, HS.synapseAt(0), HS.synapseAt(523));
    ok("!! the control is a random circuit of the steering circuit's size -- 40 neurons, 523 edges, no self-loop, no repeat, the draw of seed 4242 -- and not the fly's (it shares fewer than half its edges with it); the same 1,248 weights give another answer over it, and with the synapses at zero the same answer", C.HIDDEN === 40 && C.REC_EDGES === 523 && C.WEIGHT_COUNT === 1248 && keys.size === 523 && C.edges.every(([a, b]) => a !== b) && JSON.stringify(C.edges) === JSON.stringify(controlTopology(PFL, 4242).EDGES) && shared < 262 && HS.forward(w, x).join() !== C.forward(w, x).join() && HS.forward(z, x).join() === C.forward(z, x).join(), `${shared} of 523 edges shared`);
});

section(() => {
    const w = randomW(HS, 12), x = randomX(12), other = HS.wiringOf("control:7");
    ok("!! a wiring by NAME: `fly` is this file's own network, `control:4242` is `control` itself, `control:7` another circuit of the same size (one object a seed, another answer), and any other name is refused", HS.wiringOf().forward(w, x).join() === HS.forward(w, x).join() && HS.wiringOf("fly").WEIGHT_COUNT === 1248 && HS.wiringOf("control:4242") === HS.control && other === HS.wiringOf("control:7") && other !== HS.control && other.REC_EDGES === 523 && other.forward(w, x).join() !== HS.control.forward(w, x).join() && throwsWith(() => HS.wiringOf("random"), /a wiring is "fly" or "control:<seed>" \(got random\)/));
});

console.log("6. THE FRONT DOOR");
section(() => {
    const w = randomW(HS, 4, 0.05), blob = PB.exportBrain(PB.describePolicy("helmSteerPolicy", HS), w, { by: "a peer's steering helm" }), r = D.sideFromBrains("s", [blob]), bad = D.sideFromBrains("b", [{ ...blob, weights: blob.weights.slice(1) }]), d = D.duel(r.side, D.makeSide("rule"), 2, "head-on");
    ok("!! a helmSteerPolicy brain file is seated AT THE HELM by battleshipDuel.sideFromBrains (the module at the helm is this one, with the file's weights) and fights; a file a weight short is refused with the count; and a helmPolicy file still seats helmPolicy", r.refused.length === 0 && r.seated[0].role === "helm" && r.seated[0].where.join() === "helm" && r.side.helmNet.module === HS && r.side.helmNet.weights.join() === w.join() && d.brains.seated.join() === "1,0" && d.brains.asked > 100 && /weight count 1247 does not match helmSteerPolicy's current 1248/.test(bad.refused[0].reason) && D.sideFromBrains("h", [PB.exportBrain(PB.describePolicy("helmPolicy", HP), HP.zeroWeights())]).side.helmNet.module === HP);
    ok("the report says real numbers", /12 features, 40 neurons \(12 PFL2, 24 PFL3, 2 DNa02, 2 DNa03\), 523 synapses, 5 outputs: 1248 weights; 20 of the 24 PFL3-to-DNa02 connections join a bridge side to the other side's DNa02 \(all 24 by soma side\)/.test(HS.reportLines()[1]));
    ok("the export list", Object.keys(HS).sort().join() === "CONTROL_SEED,FEATURES,FEATURE_NAMES,HIDDEN,NAME_SIDES,NEURONS,OUTPUTS,OUTPUT_NAMES,POLICY_ID,REC_EDGES,REC_STEPS,THROTTLE_FRACTION,TORQUE_FRACTION,WEIGHT_COUNT,biasAt,control,createHelmCircuit,encoderAt,featuresOf,forward,handWeights,helmFactory,helmFor,hiddenBiasAt,layersOf,outputAt,perturb,reportLines,synapseAt,topology,wiringOf,zeroWeights");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
