// WebGLEngine/brain/seatTurretCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/seatTurretCircuit-selfcheck.mjs      (about ten seconds: a dozen fights)
//
// THE TURRET SEAT'S NETWORK OVER ANY WIRING, AND ITS CONTROL, HELD. brain/seatTurretCircuit.mjs is brain/gunnerPolicy.mjs's network with the wiring a parameter, and the same network over a random circuit of the fly's size. Five things hold it:
//
//   1  OVER THE FLY'S WIRING IT IS THE CAR'S NETWORK TO THE BIT   forward() against brain/gunnerPolicy.mjs's on random weights and inputs; the layers; the hand weights and the zero weights are that file's own
//   2  THE CONTROL IS A RANDOM CIRCUIT OF THE FLY'S SIZE            34 neurons, 313 edges, no self-loop, no repeat, the draw of its seed (the submarine's controlTopology), not the fly's wiring; another seed is another circuit; the same seed the same object
//   3  A WIRING SHOWS ONLY THROUGH ITS SYNAPSES                     with every synapse at zero the fly and the control are the same network, and the car's hand weights fly the same fight over either TO THE BIT; with weight on a synapse they differ, and a synapse carries from the neuron the WIRING says to the one it says
//   4  IT SEATS AND FLIES                                           the control's gunner is seatTurretGunner's own with the control's forward in it (the rates, the hand's error, the rounds-left sense); tools/ship/pairPool.mjs flies a spec that names a wiring over that wiring, and refuses a wiring on another policy
//   5  THE FRONT DOOR                                               wiringOf by name, the refusals, the report, the export list
//
// SABOTAGE LOG: (12 mutants, each applied to a COPY of the module with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red):
//   brain/seatTurretCircuit.mjs: U1 the control is the fly's wiring 7 | U2 every control is seed 4242's 2 | U3 two recurrent steps 4 | U4 no identity in the recurrent step 5 | U5 a synapse is wired backwards 4 | U6 the gunner runs the fly's forward 2 | U7 every seat shares one stream 3
//     U8 another size is taken 2 | U9 a control's name is any text 2 | U10 the layers are never rebuilt 1
//   tools/ship/pairPool.mjs: Q11 a named wiring is flown over the fly's 2 | Q12 a wiring is taken on any policy 1
// None went 0 red. ONE ROW OF THE FIRST DRAFT WAS WRONG AND THE GATE SAID SO BEFORE ANY SABOTAGE: weights with every synapse set flew the SAME fight over both wirings (a gunner that useless never fires over either), so 'the two are different fights' was false of them; the row now flies the big search's champion,
// whose one synapse means 'always fire' only over the fly's wiring. NOT CHECKED: any control but seeds 4242 and 7, a degree-preserving or type-preserving control (this one is uniform), and a SEARCH over the control in a real fight (tools/ship/trainTurretSeatBig-selfcheck.mjs holds one in made-up fights).
"use strict";
import * as TC from "./seatTurretCircuit.mjs";
import * as GP from "./gunnerPolicy.mjs";
import * as ST from "./seatTurretGunner.mjs";
import * as GFC from "./gfcTopology.mjs";
import * as D from "./battleshipDuel.mjs";
import * as P from "../tools/ship/pairPool.mjs";
import { controlTopology } from "./pilotSubFish.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const rnd = (seed) => { const r = ST.rngFor(seed); return () => r() * 2 - 1; }, randomW = (seed, scale = 0.4) => { const r = rnd(seed), w = ST.zeroWeights(); for (let i = 0; i < w.length; i++) w[i] = Math.fround(r() * scale); return w; }, randomX = (seed) => { const r = rnd(seed); return Float32Array.from({ length: 11 }, (_, i) => (i ? r() : 1)); };
const C = TC.controlOf(), H = 34, START = GP.handWeights();

console.log("seatTurretCircuit-selfcheck -- the turret seat's network over any wiring, and its control\n");

console.log("1. OVER THE FLY'S WIRING IT IS THE CAR'S NETWORK TO THE BIT");
section(() => {
    let same = true, big = false; for (let s = 1; s <= 30 && same; s++) { const w = randomW(s), x = randomX(100 + s), a = GP.forward(w, x), b = TC.fly.forward(w, x); same = a.join() === b.join(); big = big || a.some((v) => Math.abs(v) > 0.3); }
    ok("!! thirty random networks and inputs: forward() over the fly's wiring is brain/gunnerPolicy.mjs's five numbers to the bit (and they are not trivial)", same && big);
    const w = randomW(3), a = GP.layersOf(w), b = TC.fly.layersOf(w);
    ok("the layers are that file's (five: the encoder, the recurrent step three times as ONE layer, the read-out; the recurrent matrix entry for entry); the sizes, the names, the hand weights and the zero weights are its own", b.length === 5 && b[1] === b[2] && b[2] === b[3] && a.every((l, i) => l.nIn === b[i].nIn && l.nOut === b[i].nOut && l.act === b[i].act && Array.from(l.W).join() === Array.from(b[i].W).join()) && TC.fly.WEIGHT_COUNT === 896 && TC.fly.handWeights === GP.handWeights && TC.fly.zeroWeights === ST.zeroWeights && TC.fly.topology === GFC && TC.fly.edges === GFC.EDGES && TC.fly.FEATURE_NAMES === GP.FEATURE_NAMES);
});

console.log("2. THE CONTROL IS A RANDOM CIRCUIT OF THE FLY'S SIZE");
section(() => {
    const keys = new Set(C.edges.map(([a, b]) => a * H + b)), flyKeys = new Set(GFC.EDGES.map(([a, b]) => a * H + b)), ref = controlTopology(GFC, 4242), shared = [...keys].filter((k) => flyKeys.has(k)).length;
    ok("!! 34 neurons and 313 edges, none from a neuron to itself, none twice, the draw of seed 4242 that brain/pilotSubFish.mjs's controlTopology gives; the same weight count and layout as the fly's", C.HIDDEN === 34 && C.REC_EDGES === 313 && keys.size === 313 && C.edges.every(([a, b]) => a !== b && a >= 0 && b >= 0 && a < 34 && b < 34) && JSON.stringify(C.edges) === JSON.stringify(ref.EDGES) && C.WEIGHT_COUNT === 896 && TC.CONTROL_SEED === 4242);
    ok("it is NOT the fly's wiring (it shares 80 of its 313 edges with it -- about what chance gives two circuits this dense -- and not 313); another seed is another circuit; the same seed is the same object", shared === 80 && shared < 313 && JSON.stringify(TC.controlOf(7).edges) !== JSON.stringify(C.edges) && TC.controlOf(4242) === C && TC.controlOf() === C && TC.controlOf(7) === TC.controlOf(7), `${shared} shared`);
});

console.log("3. A WIRING SHOWS ONLY THROUGH ITS SYNAPSES");
section(() => {
    const w = randomW(9), x = randomX(9), z = Float32Array.from(w); z.fill(0, ST.synapseAt(0), ST.synapseAt(313));
    ok("!! the same 896 weights give another answer over the control than over the fly's wiring; with every synapse at zero they give the SAME answer (the recurrent step is the identity whatever the wiring)", TC.fly.forward(w, x).join() !== C.forward(w, x).join() && TC.fly.forward(z, x).join() === C.forward(z, x).join());
    const fly = D.makeSide("fly", { network: { module: ST, weights: START } }), ctl = D.makeSide("ctl", { network: { module: C, weights: START } }), hand = D.makeSide("h"), a = D.duel(fly, hand, 3, "broadside"), b = D.duel(ctl, hand, 3, "broadside");
    ok("!! the car's hand weights (no weight on any synapse) fly the same ship-against-ship fight over the control as over the fly's wiring TO THE BIT -- the fingerprint, the scores, the rounds; and the networks were asked", a.fingerprint === b.fingerprint && JSON.stringify(a.scores) === JSON.stringify(b.scores) && a.rounds.join() === b.rounds.join() && b.brains.asked > 500);
    // one synapse of the control: the source lit from the bias feature, a weight on the synapse, the target read by output 0
    const k = C.edges.findIndex(([to, from]) => !C.edges.some(([t2, f2]) => t2 === from && f2 === to) && !GFC.EDGES.some(([t2, f2]) => t2 === to && f2 === from)), [to, from] = C.edges[k], x0 = Float32Array.from({ length: 11 }, (_, i) => (i ? 0 : 1));
    const probe = (lib, rec) => { const v = ST.zeroWeights(); v[ST.encoderAt(from, 0)] = 1; v[ST.synapseAt(k)] = rec; v[ST.outputAt(0, to)] = 1; return lib.forward(v, x0)[0]; };
    const sharedIdx = GFC.EDGES[k][0] === to && GFC.EDGES[k][1] === from;
    ok("!! a weight of 0.5 on a synapse of the CONTROL that the fly does not have carries from its source to its target over the control (1.5 after three steps: tanh(1.5) at the read-out) and with the weight at 0 nothing arrives; over the fly's wiring that same weight sits on ANOTHER synapse and this read-out does not see it that way", Math.abs(probe(C, 0.5) - Math.tanh(1.5)) < 1e-6 && probe(C, 0) === 0 && !sharedIdx && probe(TC.fly, 0.5) !== probe(C, 0.5), `control synapse ${k}: neuron ${from} -> ${to}`);
    ok("a wiring of another size, and one with an edge to a neuron it does not have, are refused by name", throwsWith(() => TC.createTurretCircuit({ NEURON_ORDER: [1, 2, 3], EDGES: [[0, 1]] }), /has its sizes, 34 neurons and 313 edges \(got 3 and 1\)/) && throwsWith(() => TC.createTurretCircuit({ NEURON_ORDER: GFC.NEURON_ORDER, EDGES: GFC.EDGES.map((e, i) => (i ? e : [0, 99])) }), /an edge names a neuron the wiring does not have \(\[0, 99\] of 34\)/) && throwsWith(() => TC.createTurretCircuit(null), /a wiring is \{ NEURON_ORDER, EDGES/));
});

console.log("4. IT SEATS AND FLIES");
section(() => {
    const w = randomW(5), sight = () => ({ yaw: 0.5, pitch: 0.3, fire: true, target: 9 }), seat = { id: "s", slew: { yaw: 3, pitch: 2.5 }, arc: { yaw: [-2, 2], pitch: [-1, 1] }, gun: { magazine: 100 } }, st = { yaw: 0.1, pitch: 0, gun: { ammo: 25 } }, body = { pos: [0, 0, 0], vel: [0, 0, 0] }, tg = [{ id: 9, pos: [0, 300, 0], vel: [0, -20, 5] }];
    const g = C.gunnerFor(w, sight, { ammoSense: true }), out = g(seat, st, body, tg, 0), y = C.forward(w, g.last.x);
    ok("!! the control's gunner is seatTurretGunner's own with the CONTROL'S forward in it: the command is the seat's angle plus the control's rates times the slew, the trigger the control's third output, the rounds-left sense reaches it (0.75 spent), and a batch would be handed the control's forward", Math.abs(out.yaw - (0.1 + y[0] * 3 / 30)) < 1e-9 && Math.abs(out.pitch - y[1] * 2.5 / 30) < 1e-9 && out.fire === (y[2] > 0) && g.last.x[6] === 0.75 && g.net.forward === C.forward && g.net.layersOf === C.layersOf && g.last.y.join() === y.join() && y.join() !== GP.forward(w, g.last.x).join());
    const k = C.gunnerFactory(w, () => sight, { sigma: 0.03, seed: 4 }), a = k(seat, 0), b = k(seat, 1); a(seat, st, body, tg, 0); b(seat, st, body, tg, 0);
    ok("the factory gives each seat a gunner and a stream of its own for the hand's error", a !== b && a.shake.join() !== b.shake.join() && a.shake.some((v) => v !== 0));
    const syn = Float32Array.from(START); syn[ST.synapseAt(17)] = 0.84;   // the big search's champion: over the FLY'S wiring synapse 17 joins the bias unit to the `aligned` unit and the gunner always fires; over the control's, weight 17 sits on another edge
    const job = (wiring) => ({ x: { id: "n", network: { policy: "gunnerPolicy", weights: Array.from(syn), ...(wiring ? { wiring } : {}) } }, y: { id: "h" }, kind: "broadside", seed: 3 }), direct = (lib) => D.pair(D.makeSide("n", { network: { module: lib, weights: syn } }), D.makeSide("h"), 3, "broadside").lead;
    ok("!! the pool flies a spec that names a wiring OVER THAT WIRING: with `control:4242` the pair is the control library's own pair, with `fly` or nothing said it is seatTurretGunner's, and the two are different fights (the weights are the big search's champion, whose one synapse means 'always fire' only over the fly's wiring)", P.leadOf(job("control:4242")) === direct(C) && P.leadOf(job()) === direct(ST) && P.leadOf(job("fly")) === direct(ST) && direct(C) !== direct(ST) && P.sideOf(job("control:4242").x).network.module === C && P.sideOf(job().x).network.module === ST);
    ok("a wiring on a network that is not the turret seat's, and a wiring that is not a name, are refused by name", throwsWith(() => P.sideOf({ id: "x", network: { policy: "seatGunnerMlp", weights: [], wiring: "control:4242" } }), /only gunnerPolicy, .* have another wiring to fly \(got seatGunnerMlp with wiring control:4242\)/) && throwsWith(() => P.sideOf(job("random").x), /a wiring is "fly" or "control:<seed>" \(got random\)/));
});

console.log("5. THE FRONT DOOR");
section(() => {
    ok("wiringOf by name: `fly` (and nothing said) is the fly's library, `control:4242` the control's, `control:7` another; a name that is neither, and a seed that is not a whole number from 1, are refused", TC.wiringOf("fly") === TC.fly && TC.wiringOf() === TC.fly && TC.wiringOf("control:4242") === C && TC.wiringOf("control:7") === TC.controlOf(7) && throwsWith(() => TC.wiringOf("control"), /a wiring is "fly" or "control:<seed>"/) && throwsWith(() => TC.controlOf(0), /a control's seed is a whole number from 1 \(got 0\)/) && throwsWith(() => TC.controlOf(1.5), /got 1\.5/));
    ok("the report says real numbers; the export list", /896 weights; the control of seed 4242 shares 80 of its 313 edges with the fly's/.test(TC.reportLines()[1]) && Object.keys(TC).sort().join() === "CONTROL_SEED,controlOf,createTurretCircuit,fly,reportLines,wiringOf");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
