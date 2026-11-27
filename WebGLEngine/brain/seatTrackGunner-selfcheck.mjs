// WebGLEngine/brain/seatTrackGunner-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/seatTrackGunner-selfcheck.mjs      (about ten seconds: a few fights)
//
// THE FLY'S TARGET-TRACKING CIRCUIT IN A GUN SEAT, AND THE SPARSE STEP IT RUNS ON, HELD. brain/seatTrackGunner.mjs is brain/seatTurretGunner.mjs's gunner over a wiring of any size; brain/sparseRecurrent.mjs is the recurrent step over the connections only. Five things hold them:
//
//   1  THE SPARSE STEP IS THE DENSE STEP    bit for bit against render/brainTsl.mjs's mlpLayerCpu, over the tracking circuit and over wirings with a self-loop and a repeated pair; the entries kept; an edge to a neuron that is not there refused
//   2  THE CIRCUIT AND THE SHAPE            the baked topology is the vendored file's; 275 LC10a, 2 AOTU019, 2 AOTU025, 2 DNa02; 11,371 weights = 3,091 + 281 + 6,589 + 1,405 + 5; the index helpers; a wiring smaller than the car's refused
//   3  THE ARITHMETIC                       forward() against the dense layers to the bit; OVER THE GIANT FIBER CIRCUIT IT IS brain/gunnerPolicy.mjs TO THE BIT; a synapse carries from the neuron the wiring says to the one it says; a weight changed in place is seen
//   4  THE HAND WEIGHTS ARE THE CAR'S       the same five numbers as the car's hand weights for any features; on the first 34 neurons, no synapse; and IN A FIGHT the untrained tracking gunner is the untrained car's gunner to the bit, with a network asked in every seat
//   5  THE CONTROL AND THE FRONT DOOR       a random circuit of the same size, by name and seed; battleshipDuel seats a seatTrackGunner brain file in the seats and refuses one a weight short; the report; the export list
//
// SABOTAGE LOG: 26 mutants, each a copy of a module with this gate pointed at it (row 5's `this module in the seats` is red for every copy of seatTrackGunner.mjs and is NOT counted). SEVENTEEN of brain/seatTrackGunner.mjs: fourteen red by name (the hand moved one neuron along, its outputs swapped, two recurrent steps, a stale matrix after a weight is changed in place, no tanh, the size check off, the control the fly's own, another control seed, any wiring name taken, the policy id, synapsesUsed counting every synapse, the read-out offsets, the encoder's relu off, one seed for every seat); THREE EQUIVALENT -- the hand's hidden biases and its output biases not moved (the car's hand weights have none: now pinned in section 4, so a hand rule that grows one turns that row red) and the check that the car's hand carries no synapse (it never does). THEN EIGHT MORE of brain/sparseRecurrent.mjs once its step went BY COLUMN and began to skip a silent neuron, all red (no diagonal, a weight set, no relu, the columns descending, a NEGATIVE source skipped as well as a zero one, the product left unrounded, the wrong entry of the matrix, the matrix transposed). Before that, NINE of brain/sparseRecurrent.mjs, ALL RED: no diagonal, an edge's weight set rather than added, the matrix transposed, no relu, double precision, descending columns, the edge check off, a fused multiply-add, the dense matrix without its diagonal.
"use strict";
import fs from "node:fs";
import * as SK from "./seatTrackGunner.mjs";
import * as SR from "./sparseRecurrent.mjs";
import * as ST from "./seatTurretGunner.mjs";
import * as GP from "./gunnerPolicy.mjs";
import * as GFC from "./gfcTopology.mjs";
import * as LC10 from "./lc10Topology.mjs";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import { controlTopology } from "./pilotSubFish.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const mul = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randomW = (lib, seed, scale = 0.05) => { const r = mul(seed), w = lib.zeroWeights(); for (let i = 0; i < w.length; i++) w[i] = Math.fround((r() * 2 - 1) * scale); return w; }, randomX = (seed, n = 11) => { const r = mul(seed); return Float32Array.from({ length: n }, () => r() * 2 - 1); };
const bits = (a) => Array.from(new Uint32Array(Float32Array.from(a).buffer)).join();
const denseStep = (n, W, h) => mlpLayerCpu({ nIn: n, nOut: n, W, b: new Float32Array(n), act: "relu" }, h, 1);

console.log("seatTrackGunner-selfcheck -- the fly's target-tracking circuit in a gun seat\n");

console.log("1. THE SPARSE STEP IS THE DENSE STEP");
section(() => {
    const n = 281, core = SR.createCore(n, LC10.EDGES); let same = true, live = 0;
    for (let s = 1; s <= 6; s++) { const r = mul(s), wrec = Float32Array.from({ length: LC10.EDGES.length }, () => (r() < 0.5 ? 0 : Math.fround((r() * 2 - 1) * 0.3))), vals = core.build(wrec), W = core.dense(wrec); let hs = Float32Array.from({ length: n }, () => (r() < 0.3 ? 0 : r() * 2 - 1)), hd = Float32Array.from(hs); for (let k = 0; k < 3; k++) { hs = core.step(vals, hs); hd = denseStep(n, W, hd); if (bits(hs) !== bits(hd)) same = false; } live += hs.filter((v) => v > 0).length; }
    ok("!! over the tracking circuit (281 neurons, 6,589 connections), six random sets of synapse weights (half of them zero) and inputs, three steps each: the step over the connections is render/brainTsl.mjs's dense layer BIT FOR BIT, and the outputs are not all zero", same && live > 300, `${live} live values compared; ${core.entries} entries kept of ${n * n}`);
    ok("the entries kept are the diagonal and the connections, once each: 281 + 6,589 (the circuit has no connection from a neuron to itself and no pair twice)", core.entries === 281 + 6589 && core.n === 281 && LC10.EDGES.every(([a, b]) => a !== b) && new Set(LC10.EDGES.map(([a, b]) => a * 281 + b)).size === 6589);
    const odd = [[0, 1], [1, 0], [2, 2], [0, 1], [3, 0]], c2 = SR.createCore(4, odd), wr = Float32Array.from([0.5, -0.25, 0.75, 0.125, 2]), v = c2.build(wr), W = c2.dense(wr), h = Float32Array.from([1, 2, 3, -4]);
    ok("!! a connection from a neuron to ITSELF adds to the diagonal's 1 and a pair listed TWICE adds twice, as the dense matrix has always been made: [2,2] holds 1.75, [0,1] holds 0.625 -- and the step is the dense step", c2.entries === 4 + 3 && W[2 * 4 + 2] === 1.75 && W[0 * 4 + 1] === 0.625 && bits(c2.step(v, h)) === bits(denseStep(4, W, h)) && c2.step(v, h).join() === "2.25,1.75,5.25,0");
    ok("refused by name: an edge to a neuron the wiring does not have, and arguments that are not a size and a list", throwsWith(() => SR.createCore(3, [[0, 3]]), /an edge names a neuron the wiring does not have \(\[0, 3\] of 3\)/) && throwsWith(() => SR.createCore(0, []), /the number of neurons, the \[toIdx, fromIdx\] pairs/) && throwsWith(() => SR.createCore(3, null), /the number of neurons/));
});

console.log("2. THE CIRCUIT AND THE SHAPE");
section(() => {
    const V = JSON.parse(fs.readFileSync(new URL("../vendor/male-cns/lc10-tracking-circuit.json", import.meta.url), "utf8")), idx = new Map(V.neurons.map((n, i) => [n.bodyId, i]));
    ok("!! brain/lc10Topology.mjs is the vendored file re-derived: the 281 neurons in the file's order with its types, the 6,589 edges as [target, source] pairs in the file's order", LC10.NEURON_ORDER.join() === V.neurons.map((n) => n.bodyId).join() && LC10.NEURON_TYPES.join() === V.neurons.map((n) => n.type).join() && LC10.EDGES.length === V.edges.length && LC10.EDGES.every(([to, from], k) => to === idx.get(V.edges[k][1]) && from === idx.get(V.edges[k][0])) && LC10.DATASET === "male-cns:v1.0");
    ok("!! 11 features, 281 neurons (275 LC10a, 2 AOTU019, 2 AOTU025, 2 DNa02), 6,589 synapses, 5 outputs, three steps: 11,371 weights = 3,091 + 281 + 6,589 + 1,405 + 5; the features, the outputs and what a seat reads are the turret seat's own; its policy id is its own", SK.FEATURES === 11 && SK.HIDDEN === 281 && SK.REC_EDGES === 6589 && SK.OUTPUTS === 5 && SK.REC_STEPS === 3 && SK.WEIGHT_COUNT === 11371 && SK.zeroWeights().length === 11371 && JSON.stringify(Object.fromEntries(Object.entries(SK.NEURONS).map(([t, v]) => [t, v.length]))) === '{"LC10a":275,"AOTU019":2,"AOTU025":2,"DNa02":2}' && SK.NEURONS.DNa02.join() === "279,280" && SK.FEATURE_NAMES === ST.FEATURE_NAMES && SK.OUTPUT_NAMES === ST.OUTPUT_NAMES && SK.READ_OUTPUTS === ST.READ_OUTPUTS && SK.LIVE_FEATURES === ST.LIVE_FEATURES && SK.LIVE_FEATURES_RATIONED === ST.LIVE_FEATURES_RATIONED && SK.POLICY_ID === "seatTrackGunner" && SK.POLICY_ID !== ST.POLICY_ID);
    ok("where the weights are: the helpers land in their blocks, the last weight is the fifth output's bias; a wiring with no edges, an edge to a neuron it does not have, and A WIRING SMALLER THAN THE CAR'S 34 NEURONS are refused by name", SK.encoderAt(0, 0) === 0 && SK.encoderAt(280, 10) === 3090 && SK.hiddenBiasAt(0) === 3091 && SK.synapseAt(0) === 3372 && SK.outputAt(0, 0) === 9961 && SK.biasAt(4) === 11370 && throwsWith(() => SK.createGunnerCircuit({ NEURON_ORDER: [1], EDGES: [] }), /a wiring is \{ NEURON_ORDER, EDGES/) && throwsWith(() => SK.createGunnerCircuit({ NEURON_ORDER: Array(40).fill(0), EDGES: [[0, 40]] }), /an edge names a neuron/) && throwsWith(() => SK.createGunnerCircuit({ NEURON_ORDER: Array(33).fill(0), EDGES: [[0, 1]] }), /the car's hand rule needs 34 neurons to stand on \(the wiring has 33\)/));
});

console.log("3. THE ARITHMETIC");
section(() => {
    let same = true, big = false; for (let s = 1; s <= 8; s++) { const w = randomW(SK, s, 0.15), x = randomX(50 + s), L = SK.layersOf(w); let h = Float32Array.from(x); for (let i = 0; i < L.length - 1; i++) h = mlpLayerCpu(L[i], h, 1); const d = ST.post(mlpLayerCpu(L[L.length - 1], h, 1)), a = SK.forward(w, x); if (bits(a) !== bits(d)) same = false; if (a.some((v) => Math.abs(v) > 0.2)) big = true; }
    ok("!! forward() is the DENSE LAYERS (layersOf(), three full 281 x 281 steps through mlpLayerCpu, then the seat's tanh) BIT FOR BIT on eight random networks and inputs, and the outputs are not trivial", same && big);
    const G = SK.createGunnerCircuit(GFC); let gp = G.WEIGHT_COUNT === GP.WEIGHT_COUNT && G.WEIGHT_COUNT === 896; for (let s = 1; s <= 12 && gp; s++) { const w = randomW(G, s, 0.3), x = randomX(80 + s); gp = bits(G.forward(w, x)) === bits(ST.post(GP.forward(w, x))) || bits(G.forward(w, x)) === bits(GP.forward(w, x)); }
    ok("!! OVER THE GIANT FIBER CIRCUIT THIS FILE IS brain/gunnerPolicy.mjs TO THE BIT: 896 weights in the same places (the index helpers are the turret seat's), twelve random networks the same five numbers, and its hand weights are the car's as they are", gp && [0, 5, 33].every((h) => G.encoderAt(h, 3) === ST.encoderAt(h, 3) && G.hiddenBiasAt(h) === ST.hiddenBiasAt(h) && G.outputAt(2, h) === ST.outputAt(2, h)) && G.synapseAt(7) === ST.synapseAt(7) && G.biasAt(1) === ST.biasAt(1) && G.handWeights().join() === GP.handWeights().join());
    const k = LC10.EDGES.findIndex(([to, from]) => LC10.NEURON_TYPES[from] === "AOTU019" && LC10.NEURON_TYPES[to] === "DNa02"), [to, from] = LC10.EDGES[k], other = SK.NEURONS.DNa02.find((i) => i !== to), x0 = new Float32Array(11);
    const probe = (recW, read) => { const w = SK.zeroWeights(); w[SK.hiddenBiasAt(from)] = 1; w[SK.synapseAt(k)] = recW; w[SK.outputAt(2, read)] = 1; return SK.forward(w, x0)[2]; };
    ok("!! a weight of 0.5 on ONE REAL SYNAPSE, an AOTU019 cell onto the DNa02 it reaches: after three steps that DNa02 holds 1.5 and reads out as tanh(1.5); the OTHER DNa02 (AOTU019 reaches only the one across the midline) reads 0; with the weight at 0 nothing arrives", Math.abs(probe(0.5, to) - Math.tanh(1.5)) < 1e-6 && probe(0.5, other) === 0 && probe(0, to) === 0, `synapse ${k}: ${LC10.NEURON_INSTANCES[from]} -> ${LC10.NEURON_INSTANCES[to]}`);
    const wm = randomW(SK, 31), xm = randomX(31), before = bits(SK.forward(wm, xm)); wm[SK.synapseAt(k)] += 0.7; wm[SK.hiddenBiasAt(from)] = 1; const after = bits(SK.forward(wm, xm));
    ok("!! a weight CHANGED IN PLACE is seen: the same array after a synapse moves answers as a fresh copy of it does, and not as before (a search edits weights in place); synapsesUsed counts the synapses that carry a weight", after === bits(SK.forward(Float32Array.from(wm), xm)) && after !== before && SK.synapsesUsed(SK.zeroWeights()) === 0 && SK.synapsesUsed(wm) === 6589 && (() => { const z = SK.zeroWeights(); z[SK.synapseAt(5)] = 1; z[SK.outputAt(0, 0)] = 1; return SK.synapsesUsed(z); })() === 1);
});

console.log("4. THE HAND WEIGHTS ARE THE CAR'S");
section(() => {
    const hw = SK.handWeights(), g = GP.handWeights(); let same = true, moved = false; for (let s = 1; s <= 30; s++) { const x = randomX(200 + s); x[0] = s % 3 ? 1 : 0; const a = SK.forward(hw, x), b = ST.post(GP.forward(g, x)), c = GP.forward(g, x); if (bits(a) !== bits(b) && bits(a) !== bits(c)) same = false; if (a.some((v) => Math.abs(v) > 0.05)) moved = true; }
    const where = []; for (let i = 0; i < hw.length; i++) if (hw[i] !== 0) where.push(i);
    ok("!! the hand weights give the CAR'S hand weights' five numbers BIT FOR BIT on thirty random feature vectors (and they are not all zero); they sit on the first 34 neurons only, carry NO weight on any of the 6,589 synapses, and are as many as the car's (which have no hidden bias and no output bias: none is moved because there is none)", same && moved && [...Array(34).keys()].every((h) => g[ST.hiddenBiasAt(h)] === 0) && [0, 1, 2, 3, 4].every((o) => g[ST.biasAt(o)] === 0) && SK.synapsesUsed(hw) === 0 && where.length === Array.from(g).filter((v) => v !== 0).length && where.every((i) => (i < SK.hiddenBiasAt(0) ? Math.floor(i / 11) < 34 : i < SK.synapseAt(0) ? i - SK.hiddenBiasAt(0) < 34 : i >= SK.outputAt(0, 0) && (i >= SK.biasAt(0) || (i - SK.outputAt(0, 0)) % 281 < 34))));
    const rule = D.makeSide("rule"), track = D.makeSide("track", { network: { module: SK, weights: hw } }), car = D.makeSide("car", { network: { module: ST, weights: ST.handWeights() } }), a = D.duel(track, rule, 3, "crossing"), b = D.duel(car, rule, 3, "crossing"), r = D.duel(rule, rule, 3, "crossing");
    ok("!! IN A FIGHT THE UNTRAINED TRACKING GUNNER IS THE UNTRAINED CAR'S GUNNER TO THE BIT (the fingerprint, the scores, the rounds) -- with a 281-neuron network asked in each of thirteen seats -- and it is not the hand gunner's fight", a.fingerprint === b.fingerprint && JSON.stringify(a.scores) === JSON.stringify(b.scores) && a.rounds.join() === b.rounds.join() && a.brains.seated.join() === "13,0" && a.brains.asked === b.brains.asked && a.brains.asked > 5000 && a.fingerprint !== r.fingerprint, `${a.brains.asked} forward passes in ${a.ticks} ticks`);
    const fire = Float32Array.from(hw); fire[SK.biasAt(2)] = 5;
    ok("a gunner that is not the hand weights (the trigger held) is another fight", D.duel(D.makeSide("f", { network: { module: SK, weights: fire } }), rule, 3, "crossing").fingerprint !== a.fingerprint);
});

console.log("5. THE CONTROL AND THE FRONT DOOR");
section(() => {
    const C = SK.control, w = randomW(SK, 9), x = randomX(9), z = Float32Array.from(w); z.fill(0, SK.synapseAt(0), SK.synapseAt(6589)); const real = new Set(LC10.EDGES.map(([a, b]) => a * 281 + b)), shared = C.edges.filter(([a, b]) => real.has(a * 281 + b)).length;
    ok("!! the control is a random circuit of the tracking circuit's size -- 281 neurons, 6,589 edges, the draw of seed 4242, not the fly's (it shares few of its edges) -- the same 11,371 weights give another answer over it, with the synapses at zero the same answer, and its hand weights are the same hand", C.HIDDEN === 281 && C.REC_EDGES === 6589 && C.WEIGHT_COUNT === 11371 && JSON.stringify(C.edges) === JSON.stringify(controlTopology(LC10, 4242).EDGES) && shared < 1500 && bits(SK.forward(w, x)) !== bits(C.forward(w, x)) && bits(SK.forward(z, x)) === bits(C.forward(z, x)) && C.handWeights().join() === SK.handWeights().join(), `${shared} of 6589 edges shared`);
    ok("a wiring by NAME: `fly` is this file's own, `control:4242` is `control` itself, `control:7` another circuit (one object a seed), any other name refused", bits(SK.wiringOf().forward(w, x)) === bits(SK.forward(w, x)) && SK.wiringOf("control:4242") === C && SK.wiringOf("control:7") === SK.wiringOf("control:7") && SK.wiringOf("control:7") !== C && throwsWith(() => SK.wiringOf("random"), /a wiring is "fly" or "control:<seed>" \(got random\)/));
    const hw = SK.handWeights(), blob = PB.exportBrain(PB.describePolicy(SK.POLICY_ID, SK), hw, { by: "a peer's tracking gunner" }), r = D.sideFromBrains("s", [blob]), bad = D.sideFromBrains("b", [{ ...blob, weights: blob.weights.slice(1) }]), car = D.sideFromBrains("c", [PB.exportBrain(PB.describePolicy(ST.POLICY_ID, ST), ST.handWeights())]);
    ok("!! a seatTrackGunner brain file is seated IN THE SEATS by battleshipDuel.sideFromBrains (this module, the file's weights); a file a weight short is refused with the count; and a gunnerPolicy file still seats the car's gunner", r.refused.length === 0 && r.seated[0].role === "seat" && D.seatNetOf(r.side, "main-a").module === SK && D.seatNetOf(r.side, "main-a").weights.join() === hw.join() && /weight count 11370 does not match seatTrackGunner's current 11371/.test(bad.refused[0].reason) && D.seatNetOf(car.side, "main-a").module === ST);
    ok("the report says real numbers", /11 features, 281 neurons \(275 LC10a, 2 AOTU019, 2 AOTU025, 2 DNa02\), 6589 synapses, 5 outputs: 11371 weights; the hand weights are the race car's hand rule on the first 34 neurons and no synapse/.test(SK.reportLines()[1]));
    ok("the export lists", Object.keys(SK).sort().join() === "CONTROL_SEED,FEATURES,FEATURE_NAMES,HIDDEN,LIVE_FEATURES,LIVE_FEATURES_RATIONED,NEURONS,OUTPUTS,OUTPUT_NAMES,POLICY_ID,READ_OUTPUTS,REC_EDGES,REC_STEPS,WEIGHT_COUNT,biasAt,control,createGunnerCircuit,edges,encoderAt,forward,gunnerFactory,gunnerFor,handWeights,hiddenBiasAt,layersOf,outputAt,post,reportLines,synapseAt,synapsesUsed,topology,wiringOf,zeroWeights" && Object.keys(SR).join() === "createCore");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
