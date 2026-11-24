// WebGLEngine/brain/helmCompassPolicy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/helmCompassPolicy-selfcheck.mjs      (about ten seconds: a few fights)
//
// THE FLY'S STEERING CIRCUIT WITH ITS INPUTS AT A HELM, HELD. brain/helmCompassPolicy.mjs is brain/helmSteerPolicy.mjs's createHelmCircuit over the 220-neuron circuit, its recurrent steps taken over the connections only. Five things hold it:
//
//   1  THE CIRCUIT AND THE SHAPE     the baked topology is the vendored file's; the nine cell types and their counts; 11,946 weights = 2,640 + 220 + 7,981 + 1,100 + 5; THE STEERING CIRCUIT IS INSIDE IT (its 40 neurons are neurons 180-219 and its 523 connections are among these, in place)
//   2  THE ARITHMETIC                the sparse forward() is the dense layers BIT FOR BIT; over the steering circuit's own wiring, sparse is brain/helmSteerPolicy.mjs's dense forward to the bit; a synapse carries from the compass to a PFL3 cell; a weight changed in place is seen
//   3  THE ZERO WEIGHTS ARE THE RULE a fight with the zero weights at both helms is the fight with no helm network to the bit, and the networks were asked; a helm that is not zero is another fight
//   4  THE CONTROL AND THE FRONT DOOR a random circuit of the same size by name and seed; battleshipDuel seats a helmCompassPolicy file at the helm and refuses one a weight short; the report; the export list
//   5  WHAT THE SANDBOX'S SEARCH FOUND read off the kept files: the shipped helm, its reading, and that neither champion carries a synapse
//
// SABOTAGE LOG: 24 mutants, each a copy of a module with this gate pointed at it (row 4's `this module at the helm` is red for every copy of this file and is NOT counted). EIGHT of brain/helmCompassPolicy.mjs: seven red by name (the steering circuit's wiring in place of this one, the control the fly's own, another control seed, the policy id, the map of the steering neurons, any wiring name taken, a new control object each call); ONE EQUIVALENT BY DESIGN -- the library made dense instead of sparse is the same float32 values, which is the claim of section 2. FIVE of the sparse path in brain/helmSteerPolicy.mjs (createHelmCircuit's `sparse`): three red (two recurrent steps, either bias ignored); ONE 0-RED, A GAP, CLOSED -- the sparse path's matrix never rebuilt after a weight is changed in place (the in-place row used the real module; the `sparse` row now changes a synapse in place too); one equivalent (`sparse` ignored: dense, the same values). ELEVEN of tools/ship/trainHelmSteer.mjs's circuit option are in that trainer's gate.
"use strict";
import fs from "node:fs";
import * as HC from "./helmCompassPolicy.mjs";
import * as HS from "./helmSteerPolicy.mjs";
import * as CX from "./cxInputsTopology.mjs";
import * as PFL from "./pflTopology.mjs";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import { controlTopology } from "./pilotSubFish.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const mul = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randomW = (lib, seed, scale = 0.1) => { const r = mul(seed), w = lib.zeroWeights(); for (let i = 0; i < w.length; i++) w[i] = Math.fround((r() * 2 - 1) * scale); return w; }, randomX = (seed) => { const r = mul(seed); return Float32Array.from({ length: 12 }, (_, i) => (i ? r() * 2 - 1 : 1)); };
const bits = (a) => Array.from(new Uint32Array(Float32Array.from(a).buffer)).join(), T = CX.NEURON_TYPES;

console.log("helmCompassPolicy-selfcheck -- the fly's steering circuit with its inputs at a helm\n");

console.log("1. THE CIRCUIT AND THE SHAPE");
section(() => {
    const V = JSON.parse(fs.readFileSync(new URL("../vendor/male-cns/cx-steering-inputs-circuit.json", import.meta.url), "utf8")), idx = new Map(V.neurons.map((n, i) => [n.bodyId, i]));
    ok("!! brain/cxInputsTopology.mjs is the vendored file re-derived: the 220 neurons in the file's order with its types, the 7,981 edges as [target, source] pairs in the file's order", CX.NEURON_ORDER.join() === V.neurons.map((n) => n.bodyId).join() && T.join() === V.neurons.map((n) => n.type).join() && CX.EDGES.length === V.edges.length && CX.EDGES.every(([to, from], k) => to === idx.get(V.edges[k][1]) && from === idx.get(V.edges[k][0])) && CX.DATASET === "male-cns:v1.0");
    ok("!! 12 features, 220 neurons (46 EPG, 42 Delta7, 18 FC2A, 27 FC2B, 47 FC2C, 12 PFL2, 24 PFL3, 2 DNa02, 2 DNa03), 7,981 synapses, 5 outputs, three steps: 11,946 weights = 2,640 + 220 + 7,981 + 1,100 + 5; the features, the names and the limits are helmPolicy's; its policy id is its own", HC.FEATURES === 12 && HC.HIDDEN === 220 && HC.REC_EDGES === 7981 && HC.OUTPUTS === 5 && HC.REC_STEPS === 3 && HC.WEIGHT_COUNT === 11946 && HC.zeroWeights().length === 11946 && JSON.stringify(Object.fromEntries(Object.entries(HC.NEURONS).map(([t, v]) => [t, v.length]))) === '{"EPG":46,"Delta7":42,"FC2A":18,"FC2B":27,"FC2C":47,"PFL2":12,"PFL3":24,"DNa02":2,"DNa03":2}' && HC.featuresOf === HS.featuresOf && HC.FEATURE_NAMES === HS.FEATURE_NAMES && HC.TORQUE_FRACTION === 0.5 && HC.THROTTLE_FRACTION === 0.3 && HC.POLICY_ID === "helmCompassPolicy" && HC.encoderAt(0, 0) === 0 && HC.hiddenBiasAt(0) === 2640 && HC.synapseAt(0) === 2860 && HC.outputAt(0, 0) === 10841 && HC.biasAt(4) === 11945);
    const map = HC.STEERING, key = new Map(CX.EDGES.map(([to, from], k) => [to * 220 + from, k]));
    ok("!! THE STEERING CIRCUIT IS INSIDE THIS ONE: its 40 neurons are neurons 180-219 here in the same order, and every one of its 523 connections is a connection here between the same two neurons (so a weight on a synapse there has a synapse to sit on here)", map.join() === Array.from({ length: 40 }, (_, i) => 180 + i).join() && PFL.EDGES.every(([to, from]) => key.has(map[to] * 220 + map[from])) && PFL.NEURON_TYPES.every((t, i) => T[map[i]] === t));
});

console.log("2. THE ARITHMETIC");
section(() => {
    let same = true, big = false; for (let s = 1; s <= 8; s++) { const w = randomW(HC, s), x = randomX(40 + s), L = HC.layersOf(w); let h = Float32Array.from(x); for (let i = 0; i < L.length - 1; i++) h = mlpLayerCpu(L[i], h, 1); const y = mlpLayerCpu(L[L.length - 1], h, 1), d = [0, 1, 2, 3, 4].map((o) => Math.tanh(y[o])), a = HC.forward(w, x); if (bits(a) !== bits(d)) same = false; if (a.some((v) => Math.abs(v) > 0.2)) big = true; }
    ok("!! forward() -- the recurrent steps over the 7,981 connections only -- is the DENSE LAYERS (three full 220 x 220 steps through mlpLayerCpu) BIT FOR BIT on eight random networks and inputs, and the outputs are not trivial", same && big);
    const sp = HS.createHelmCircuit(PFL, { sparse: true }); let eq = sp.WEIGHT_COUNT === HS.WEIGHT_COUNT; for (let s = 1; s <= 12 && eq; s++) { const w = randomW(HS, s, 0.3), x = randomX(90 + s); eq = bits(sp.forward(w, x)) === bits(HS.forward(w, x)); }
    const wi = randomW(HS, 77, 0.3), xi = randomX(77), [pt, pf] = PFL.EDGES[0]; wi[HS.hiddenBiasAt(pf)] = 2; const b0 = bits(sp.forward(wi, xi)); wi[HS.synapseAt(0)] += 0.9; const b1 = bits(sp.forward(wi, xi));
    ok("!! `sparse` changes nothing but the cost: over the steering circuit's own wiring the sparse library's forward is brain/helmSteerPolicy.mjs's dense forward TO THE BIT on twelve random networks -- and after a synapse is CHANGED IN PLACE it still is (the sparse path keeps its own copy of the matrix, which must be rebuilt)", eq && b1 !== b0 && b1 === bits(HS.forward(Float32Array.from(wi), xi)));
    const k = CX.EDGES.findIndex(([to, from]) => T[from] === "EPG" && T[to] === "PFL3"), [to, from] = CX.EDGES[k], x0 = Float32Array.from({ length: 12 }, (_, i) => (i ? 0 : 1)), probe = (recW, read) => { const w = HC.zeroWeights(); w[HC.encoderAt(from, 0)] = 1; w[HC.synapseAt(k)] = recW; w[HC.outputAt(2, read)] = 1; return HC.forward(w, x0)[2]; };
    const notReached = HC.NEURONS.PFL3.find((i) => !CX.EDGES.some(([t, f]) => t === i && f === from));
    ok("!! a weight of 0.5 on ONE REAL SYNAPSE, a compass cell onto a PFL3 cell: after three steps the PFL3 it reaches holds 1.5 and reads out as tanh(1.5); a PFL3 that compass cell does not reach reads 0; with the weight at 0 nothing arrives", Math.abs(probe(0.5, to) - Math.tanh(1.5)) < 1e-6 && notReached !== undefined && probe(0.5, notReached) === 0 && probe(0, to) === 0, `synapse ${k}: ${CX.NEURON_INSTANCES[from]} -> ${CX.NEURON_INSTANCES[to]}`);
    const wm = randomW(HC, 31), xm = randomX(31); wm[HC.hiddenBiasAt(from)] = 2; const before = bits(HC.forward(wm, xm)); wm[HC.synapseAt(k)] += 0.7; const after = bits(HC.forward(wm, xm));
    ok("!! a weight CHANGED IN PLACE is seen: the same array after one synapse moves answers as a fresh copy of it does, and not as it did before", after === bits(HC.forward(Float32Array.from(wm), xm)) && after !== before);
});

console.log("3. THE ZERO WEIGHTS ARE THE RULE");
section(() => {
    const rule = D.makeSide("rule"), zero = D.makeSide("zero", { helmNet: { module: HC, weights: HC.zeroWeights() } }), a = D.duel(rule, rule, 3, "crossing"), b = D.duel(zero, zero, 3, "crossing");
    ok("!! a ship-against-ship fight with the ZERO weights at both helms is the fight with no helm network TO THE BIT (the fingerprint, the scores, the rounds) -- and the two 220-neuron networks were asked every tick", b.fingerprint === a.fingerprint && JSON.stringify(b.scores) === JSON.stringify(a.scores) && b.rounds.join() === a.rounds.join() && b.brains.seated.join() === "1,1" && b.brains.asked >= 2 * b.ticks - 4, `${b.brains.asked} forward passes in ${b.ticks} ticks`);
    const turn = HC.zeroWeights(); turn[HC.biasAt(2)] = 3;
    ok("a helm that is not zero (a constant hard turn about the deck's axis) is another fight", D.duel(D.makeSide("turn", { helmNet: { module: HC, weights: turn } }), rule, 3, "crossing").fingerprint !== a.fingerprint);
});

console.log("4. THE CONTROL AND THE FRONT DOOR");
section(() => {
    const C = HC.control, w = randomW(HC, 9), x = randomX(9), z = Float32Array.from(w); z.fill(0, HC.synapseAt(0), HC.synapseAt(7981)); const real = new Set(CX.EDGES.map(([a, b]) => a * 220 + b)), shared = C.edges.filter(([a, b]) => real.has(a * 220 + b)).length;
    ok("!! the control is a random circuit of this circuit's size -- 220 neurons, 7,981 edges, the draw of seed 4242, not the fly's -- the same 11,946 weights give another answer over it and, with the synapses at zero, the same answer; by NAME: `fly` this file's own, `control:4242` the control itself, `control:7` another, any other name refused", C.HIDDEN === 220 && C.REC_EDGES === 7981 && C.WEIGHT_COUNT === 11946 && JSON.stringify(C.edges) === JSON.stringify(controlTopology(CX, 4242).EDGES) && shared < 2500 && bits(HC.forward(w, x)) !== bits(C.forward(w, x)) && bits(HC.forward(z, x)) === bits(C.forward(z, x)) && bits(HC.wiringOf().forward(w, x)) === bits(HC.forward(w, x)) && HC.wiringOf("control:4242") === C && HC.wiringOf("control:7") === HC.wiringOf("control:7") && HC.wiringOf("control:7") !== C && throwsWith(() => HC.wiringOf("random"), /a wiring is "fly" or "control:<seed>" \(got random\)/), `${shared} of 7981 edges shared`);
    const wv = randomW(HC, 4, 0.02), blob = PB.exportBrain(PB.describePolicy("helmCompassPolicy", HC), wv, { by: "a peer's compass helm" }), r = D.sideFromBrains("s", [blob]), bad = D.sideFromBrains("b", [{ ...blob, weights: blob.weights.slice(1) }]);
    ok("!! a helmCompassPolicy brain file is seated AT THE HELM by battleshipDuel.sideFromBrains (this module, the file's weights); a file a weight short is refused with the count; a helmSteerPolicy file still seats the smaller helm", r.refused.length === 0 && r.seated[0].role === "helm" && r.side.helmNet.module === HC && r.side.helmNet.weights.join() === wv.join() && /weight count 11945 does not match helmCompassPolicy's current 11946/.test(bad.refused[0].reason) && D.sideFromBrains("h", [PB.exportBrain(PB.describePolicy("helmSteerPolicy", HS), HS.zeroWeights())]).side.helmNet.module === HS);
    ok("the report says real numbers", /12 features, 220 neurons \(46 EPG, 42 Delta7, 18 FC2A, 27 FC2B, 47 FC2C, 12 PFL2, 24 PFL3, 2 DNa02, 2 DNa03\), 7981 synapses, 5 outputs: 11946 weights; the steering circuit's 40 neurons are neurons 180-219 of it/.test(HC.reportLines()[1]));
    ok("the export list", Object.keys(HC).sort().join() === "CONTROL_SEED,FEATURES,FEATURE_NAMES,HIDDEN,NEURONS,OUTPUTS,OUTPUT_NAMES,POLICY_ID,REC_EDGES,REC_STEPS,STEERING,THROTTLE_FRACTION,TORQUE_FRACTION,WEIGHT_COUNT,biasAt,control,edges,encoderAt,featuresOf,forward,handWeights,helmFactory,helmFor,hiddenBiasAt,layersOf,outputAt,perturb,reportLines,synapseAt,topology,wiringOf,zeroWeights");
});

console.log("5. WHAT THE SANDBOX'S SEARCH FOUND (read off the kept files; nothing is flown)");
section(() => {
    const B = new URL("./", import.meta.url), J = (f) => JSON.parse(fs.readFileSync(new URL(f, B), "utf8")), rd = J("helmCompassWeightsDefault.reading.json"), blob = J("helmCompassWeightsDefault.json"), imp = PB.importBrain(PB.describePolicy(HC.POLICY_ID, HC), blob), w = imp.weights, fr = J("rig-results/helmCompass/s9600.json"), cr = J("rig-results/helmCompassControl/s9620.json"), moved = (v) => { const o = []; v.forEach((x, i) => { if (x !== 0) o.push(i); }); return o; };
    ok("!! THE SHIPPED COMPASS HELM (brain/helmCompassWeightsDefault.json) imports, is the weights of the fly-wiring search's record, and is THREE WEIGHTS AND NO SYNAPSE: throttle back (the throttle bias at -0.97), and one path -- the spin about z into neuron 21 (a compass cell), neuron 21 onto the torque about z", imp.ok && w.join() === Float32Array.from(fr.weights).join() && moved(w).join() === [HC.encoderAt(21, 6), HC.outputAt(2, 21), HC.biasAt(3)].join() && w[HC.biasAt(3)] < -0.9 && HC.FEATURE_NAMES[6] === "wZ" && T[21] === "EPG" && fr.synapses === 0 && fr.circuit === "compass");
    ok("!! THE READING, AS KEPT (600 audit pairs, seeds 26001-, read once): H1 it LEADS the rule (+0.466, z 15.2); H2 its synapses are exactly 0; H3 it leads the control's champion (+0.101, z 3.9); H4 against the escape circuit's shipped helm CANNOT BE TOLD (+0.067, z 1.6) -- and the control's champion is TWO weights, a constant path that throttles back, with no synapse either", rd.circuit === "compass" && rd.words.H1 === "LEADS" && Math.abs(rd.reading.H1.mean - 0.466) < 5e-4 && rd.reading.H1.n === 600 && rd.reading.H2.mean === 0 && rd.words.H3 === "LEADS" && Math.abs(rd.reading.H3.mean - 0.101) < 5e-4 && rd.words.H4 === "CANNOT BE TOLD" && Math.abs(rd.reading.H4.mean - 0.067) < 5e-4 && rd.verdict.ok && moved(cr.weights).join() === [HC.encoderAt(57, 0), HC.outputAt(3, 57)].join() && cr.synapses === 0 && cr.wiring === "control:4242" && fr.iters === 150 && cr.iters === 150);
    ok("!! SO H3 IS AGAIN NOT A FINDING ABOUT WIRING, AND THE FILE SAYS SO: 52 synapse children were tried by each search and none kept, and the shipped file's `by` says the wiring took no part and names the circuit it was searched over", fr.by.synapse === 0 && fr.tried.synapse === 52 && cr.by.synapse === 0 && cr.tried.synapse === 52 && /NEITHER CHAMPION CARRIES A WEIGHT ON A SYNAPSE, SO THE WIRING TOOK NO PART/.test(blob.by) && /searches over the fly's steering circuit with its inputs \(the compass and the goal cells\)/.test(blob.by) && /seeds 26001-26150 of each kind/.test(blob.by) && /EPG\/Delta7\/FC2A-C/.test(blob.citation));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
