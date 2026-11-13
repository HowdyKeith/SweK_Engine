// WebGLEngine/brain/seatGunnerFish-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/seatGunnerFish-selfcheck.mjs      (a few seconds: six fights)
//
// THE FISH IN A GUN SEAT, HELD TO THE FRUIT FLY'S CONTRACT (brain/seatGunnerPolicy-selfcheck.mjs holds that one). brain/seatGunnerFish.mjs is the seat gunner's network over the larval zebrafish's circuit, and the same library over a random circuit of its size as the control. Six things hold it:
//
//   1  THE SHAPE          700 weights = 12 x 34 + 34 + 153 + 34 x 3 + 3; five layers (the encoder, the recurrent step three times, the read-out); the recurrent matrix is the identity plus a weight on each of the fish's 153 synapses and NOTHING anywhere else; the features and the names are the fruit fly's own
//   2  THE ARITHMETIC     forward() against a plain restatement written here (loops, no shared code) to 1e-6 on random weights; THE FRUIT FLY'S WIRING THROUGH THIS FILE IS brain/seatGunnerPolicy.mjs TO THE BIT; a weight on a synapse reaches the neuron the wiring says it does and no other
//   3  THE CONTROL        the same sizes, 153 edges with no self-loop and no repeat, the draw of seed 4242 (brain/pilotSubFish.mjs's, the submarine's own control), not the fish's wiring; the same weights give another answer
//   4  THE HAND TWIN      the hand weights are three non-zero weights and ARE the hand gunner, to the bit, in a ship-against-ship fight of twenty-six seats -- the fish's and the control's; the zero gunner never fires
//   5  THE TRAINER'S HOOKS liveIndices are the nineteen weights of the hand path and each one moves an output; mutate moves one to maxK weights and perturb all of them, from a seeded generator; a bad wiring is refused by name
//   6  THE FRONT DOOR     a fish brain file is seated by battleshipDuel.sideFromBrains and a truncated one refused; the export list is pinned and the report says real numbers
//
// SABOTAGE LOG: (22 mutants, each applied to a COPY of brain/seatGunnerFish.mjs with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red. ONE ROW IS RED IN EVERY COPY AND IS NOT COUNTED: section 6's seat row asks that the module battleshipDuel seats IS this
// file, and a copy is another module -- an artifact of sabotaging a copy, not a kill.)
//   F1 the fish has the fruit fly's wiring 11 | F2 two recurrent steps 5 | F3 no identity in the recurrent step 7 | F4 a synapse is wired backwards 5 | F5 the read-out is relu 4 | F6 the encoder is linear 3 | F7 the outputs are not squashed 3 | F8 the trigger's bias is -1 in the hand weights 2
//   F9 the hand weights drive the pitch output 4 | F10 the hand weights read the bias feature 4 | F11 the live weights leave out unit 0's bias 2 | F12 the live weights take unit 1's read-out 3 | F13 the live output biases are off by one 3 | F14 mutate may move five weights 1 | F15 perturb is mutate 1
//   F16 the control is the fish 2 | F17 the control is another draw 1 | F18 the seat runs the fruit fly's network on these weights 1 | F19 the layers are never rebuilt 1 | F20 an edge out of range is let in 1 | F21 the read-out is cut one early 7 | F22 every seat shares one sight 1
// None went 0 red. NOT CHECKED: anything about a TRAINED fish (none exists), and the GPU batch with this network (brain/seatGunnerGpu.mjs takes any `decide.net`; its own gate flies the fruit fly's and the GPU Brain's).
"use strict";
import * as SF from "./seatGunnerFish.mjs";
import * as SG from "./seatGunnerPolicy.mjs";
import * as ZF from "./zebrafishTopology.mjs";
import * as GFC from "./gfcTopology.mjs";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import { controlTopology } from "./pilotSubFish.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const F = 12, H = 34, E = 153, O = 3, REC = F * H + H, OUT = REC + E, BIAS = OUT + H * O;
const rnd = (seed) => { const r = SF.rngFor(seed); return () => r() * 2 - 1; };
const randomWeights = (lib, seed, scale = 0.4) => { const r = rnd(seed), w = lib.zeroWeights(); for (let i = 0; i < w.length; i++) w[i] = Math.fround(r() * scale); return w; };
const randomX = (seed) => { const r = rnd(seed); return Float32Array.from({ length: F }, (_, i) => (i ? r() : 1)); };
/** forward(), restated with nothing shared: f32 sums in the layer's own order (the bias first, then the inputs in turn), relu in the hidden layers, the identity plus the wiring's weights three times, tanh at the end. */
function plain(topo, w, x) {
    const n = topo.NEURON_ORDER.length, rec = F * n + n, out = rec + topo.EDGES.length, f = Math.fround;
    let h = Array.from({ length: n }, (_, j) => { let a = w[F * n + j]; for (let i = 0; i < F; i++) a = f(a + f(w[j * F + i] * x[i])); return Math.max(0, a); });
    const M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    topo.EDGES.forEach(([to, from], k) => { M[to][from] = f(M[to][from] + w[rec + k]); });
    for (let s = 0; s < 3; s++) h = M.map((row) => { let a = 0; for (let j = 0; j < n; j++) a = f(a + f(row[j] * h[j])); return Math.max(0, a); });
    return [0, 1, 2].map((o) => { let a = w[out + n * O + o]; for (let j = 0; j < n; j++) a = f(a + f(w[out + o * n + j] * h[j])); return Math.tanh(a); });
}
const close = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

console.log("seatGunnerFish-selfcheck -- the fish in a gun seat\n");

console.log("1. THE SHAPE");
section(() => {
    ok("!! 12 features, the 34 neurons and 153 synapses of the Fish1 TEN core, 3 outputs, three recurrent steps: 700 weights = 408 + 34 + 153 + 102 + 3", SF.FEATURES === F && SF.HIDDEN === H && SF.HIDDEN === ZF.NEURON_ORDER.length && SF.REC_EDGES === E && SF.REC_EDGES === ZF.EDGES.length && SF.OUTPUTS === O && SF.REC_STEPS === 3 && SF.WEIGHT_COUNT === 700 && SF.zeroWeights().length === 700);
    ok("the features, the feature and output names, the read-out and the aim gain are the fruit fly's own (the same functions and arrays, not copies)", SF.features === SG.features && SF.post === SG.post && SF.FEATURE_NAMES === SG.FEATURE_NAMES && SF.OUTPUT_NAMES === SG.OUTPUT_NAMES && SF.AIM_GAIN === SG.AIM_GAIN);
    const w = randomWeights(SF, 5), L = SF.layersOf(w);
    ok("five layers: the encoder (12 -> 34, relu), the recurrent step three times (the SAME 34 x 34 layer, relu), the read-out (34 -> 3, none), each cut from the vector where the layout says", L.length === 5 && L.map((l) => `${l.nIn}>${l.nOut}:${l.act}`).join() === "12>34:relu,34>34:relu,34>34:relu,34>34:relu,34>3:none" && L[1] === L[2] && L[2] === L[3]
        && L[0].W[0] === w[0] && L[0].W[F * H - 1] === w[F * H - 1] && L[0].b[0] === w[F * H] && L[4].W[0] === w[OUT] && L[4].W[H * O - 1] === w[BIAS - 1] && L[4].b[2] === w[699]);
    const M = L[1].W, on = new Set(ZF.EDGES.map(([to, from]) => to * H + from)); let stray = 0, wired = 0, diag = 0;
    for (let i = 0; i < H * H; i++) { const d = i % (H + 1) === 0, base = d ? 1 : 0; if (on.has(i)) { if (M[i] !== base) wired++; } else if (M[i] !== base) stray++; if (d && !on.has(i) && M[i] === 1) diag++; }
    ok("!! the recurrent matrix is the identity plus a weight on each of the fish's 153 synapses, and not one entry anywhere else differs from the identity", stray === 0 && wired === E && on.size === E && diag === H - [...on].filter((i) => i % (H + 1) === 0).length, `${wired} wired, ${stray} stray`);
    ok("the same weights give the same layers back without rebuilding them, and a moved synapse rebuilds them", SF.layersOf(w) === L && (() => { const v = Float32Array.from(w); const a = SF.layersOf(v); v[REC + 7] += 0.5; const b = SF.layersOf(v); return a !== b && b[1].W[ZF.EDGES[7][0] * H + ZF.EDGES[7][1]] !== a[1].W[ZF.EDGES[7][0] * H + ZF.EDGES[7][1]]; })());
});

console.log("2. THE ARITHMETIC");
section(() => {
    let worst = 0; for (let s = 1; s <= 20; s++) { const w = randomWeights(SF, s), x = randomX(100 + s), a = SF.forward(w, x), b = plain(ZF, w, x); worst = Math.max(worst, ...a.map((v, i) => Math.abs(v - b[i]))); }
    ok("!! forward() is the plain restatement to 1e-6 on twenty random networks and inputs, and the outputs are not trivial (some beyond 0.3 either way)", worst < 1e-6 && Array.from({ length: 20 }, (_, s) => SF.forward(randomWeights(SF, s + 1), randomX(101 + s))).flat().some((v) => v > 0.3) && Array.from({ length: 20 }, (_, s) => SF.forward(randomWeights(SF, s + 1), randomX(101 + s))).flat().some((v) => v < -0.3), `worst difference ${worst.toExponential(2)}`);
    const fly = SF.createSeatCircuit(GFC); let same = fly.WEIGHT_COUNT === SG.WEIGHT_COUNT;
    for (let s = 1; s <= 10 && same; s++) { const w = randomWeights(fly, s), x = randomX(200 + s); same = SG.forward(w, x).join() === fly.forward(w, x).join(); }
    ok("!! THE FRUIT FLY'S WIRING THROUGH THIS FILE IS brain/seatGunnerPolicy.mjs TO THE BIT: 860 weights, ten random networks, the same three numbers; its hand weights and live weights are that file's", same && fly.handWeights().join() === SG.handWeights().join() && fly.liveIndices().join() === SG.liveIndices().join());
    // one synapse: the encoder lights the source neuron from the bias feature, a weight on synapse k carries it to the target, and only a read-out of the TARGET sees the weight
    const k = ZF.EDGES.findIndex(([to, from]) => to !== from && !ZF.EDGES.some(([t2, f2]) => t2 === from && f2 === to)), [to, from] = ZF.EDGES[k], x0 = Float32Array.from({ length: F }, (_, i) => (i ? 0 : 1));
    const probe = (rec, readFrom) => { const w = SF.zeroWeights(); w[from * F] = 1; w[REC + k] = rec; w[OUT + readFrom] = 1; return SF.forward(w, x0)[0]; };
    const other = Array.from({ length: H }, (_, j) => j).find((j) => j !== to && j !== from && !ZF.EDGES.some(([t2, f2]) => f2 === from && t2 === j) && !ZF.EDGES.some(([t2, f2]) => f2 === to && t2 === j));
    ok("a weight of 0.5 on one synapse: after three steps its target neuron holds 1.5 (0.5 a step from a source that holds 1) and reads out as tanh(1.5); the source still reads tanh(1); a neuron neither wires to reads 0; with the weight at 0 the target reads 0", Math.abs(probe(0.5, to) - Math.tanh(1.5)) < 1e-6 && Math.abs(probe(0.5, from) - Math.tanh(1)) < 1e-6 && probe(0.5, other) === 0 && probe(0, to) === 0, `synapse ${k}: neuron ${from} -> ${to}`);
});

console.log("3. THE CONTROL");
section(() => {
    const C = SF.control, T = C.topology, ref = controlTopology(ZF, 4242), keys = new Set(T.EDGES.map(([a, b]) => a * H + b)), fishKeys = new Set(ZF.EDGES.map(([a, b]) => a * H + b));
    ok("the control is the same sizes (34 neurons, 153 edges, 700 weights), no self-loop, no repeat, and it is the draw of seed 4242 that the submarine's control is", C.HIDDEN === H && C.REC_EDGES === E && C.WEIGHT_COUNT === 700 && keys.size === E && T.EDGES.every(([a, b]) => a !== b) && JSON.stringify(T.EDGES) === JSON.stringify(ref.EDGES) && SF.CONTROL_SEED === 4242);
    const shared = [...keys].filter((i) => fishKeys.has(i)).length, w = randomWeights(SF, 9), x = randomX(9);
    ok("!! it is NOT the fish's wiring (fewer than a third of its edges are the fish's) and the same 700 weights give another answer; with the synapses at zero the two are the same network", shared < E / 3 && SF.forward(w, x).join() !== C.forward(w, x).join() && (() => { const v = Float32Array.from(w); v.fill(0, REC, OUT); return SF.forward(v, x).join() === C.forward(v, x).join(); })(), `${shared} of 153 edges shared`);
});

console.log("4. THE HAND TWIN");
section(() => {
    const hand = SF.handWeights(), nz = Array.from(hand).map((v, i) => [i, v]).filter(([, v]) => v !== 0);
    ok("the hand weights are three: `aimed` into hidden unit 0 (1), unit 0 into the trigger (4), the trigger's bias (-2)", JSON.stringify(nz) === JSON.stringify([[SG.FEATURE_NAMES.indexOf("aimed"), 1], [OUT + 2 * H, 4], [BIAS + 2, -2]]));
    const xa = randomX(3); xa[3] = 1; const xn = Float32Array.from(xa); xn[3] = 0;
    ok("... no correction, and the trigger is on exactly when the sight's flag is", SF.forward(hand, xa).slice(0, 2).join() === "0,0" && SF.forward(hand, xa)[2] > 0 && SF.forward(hand, xn)[2] < 0);
    const rule = D.makeSide("rule"), a = D.duel(rule, rule, 3, "broadside"), fish = D.makeSide("fish", { network: { module: SF, weights: hand } }), b = D.duel(fish, fish, 3, "broadside"), ctl = D.makeSide("control", { network: { module: SF.control, weights: SF.control.handWeights() } }), c = D.duel(ctl, ctl, 3, "broadside");
    ok("!! a ship-against-ship fight with the fish's hand weights in all twenty-six seats is the hand gunner's fight TO THE BIT (the fingerprint, the scores, the rounds), and the networks were asked; the control's hand weights the same", b.fingerprint === a.fingerprint && JSON.stringify(b.scores) === JSON.stringify(a.scores) && b.rounds.join() === a.rounds.join() && b.brains.seated.join() === "13,13" && b.brains.asked > 1000 && a.brains.asked === 0 && c.fingerprint === a.fingerprint && a.rounds[0] > 50, `${b.brains.asked} forward passes, rounds ${b.rounds}`);
    const zero = D.makeSide("zero", { network: { module: SF, weights: SF.zeroWeights() }, cannon: false }), z = D.duel(zero, D.makeSide("nc", { cannon: false }), 3, "broadside");
    ok("the zero gunner never fires: thirteen seats of zero weights fire no round in a fight in which the other ship's hand gunners do", z.rounds[0] === 0 && z.rounds[1] > 50 && z.brains.asked > 100, `rounds ${z.rounds}`);
});

console.log("5. THE TRAINER'S HOOKS");
section(() => {
    const live = SF.liveIndices(), hand = SF.handWeights(), probes = [1, 2, 3, 4, 5, 6].map((s) => { const x = randomX(300 + s); x[3] = s % 2; return x; });
    ok("the live weights are nineteen: unit 0's twelve encoder weights and its bias, its three weights into the outputs, the three output biases", live.join() === [...Array.from({ length: F }, (_, i) => i), F * H, OUT, OUT + H, OUT + 2 * H, BIAS, BIAS + 1, BIAS + 2].join());
    const moves = (i) => probes.some((x) => { const v = Float32Array.from(hand); v[i] += 0.7; return SF.forward(v, x).join() !== SF.forward(hand, x).join(); });
    ok("!! every one of them moves an output from the hand weights, and a weight of another hidden unit (its encoder row, its read-out) moves none", live.every(moves) && !moves(5 * F + 2) && !moves(OUT + 5) && !moves(REC + 3));
    const m = Array.from({ length: 200 }, (_, s) => { const c = SF.mutate(hand, 0.3, SF.rngFor(s + 1), 4); let n = 0; for (let i = 0; i < c.length; i++) if (c[i] !== hand[i]) n++; return n; });
    const p = SF.perturb(hand, 0.3, SF.rngFor(1)); let all = 0; for (let i = 0; i < p.length; i++) if (p[i] !== hand[i]) all++;
    ok("mutate moves one to four weights (never none, never five; all four counts occur in 200 children) and leaves its parent alone; perturb moves all 700; the same seed is the same child", Math.min(...m) >= 1 && Math.max(...m) === 4 && [1, 2, 3, 4].every((k) => m.includes(k)) && Array.from(hand).filter((v) => v !== 0).length === 3 && all === 700 && SF.mutate(hand, 0.3, SF.rngFor(7)).join() === SF.mutate(hand, 0.3, SF.rngFor(7)).join() && SF.mutate(hand, 0.3, SF.rngFor(7)).join() !== SF.mutate(hand, 0.3, SF.rngFor(8)).join());
    ok("a wiring with no neurons, with no edges, or with an edge to a neuron it does not have is refused by name", throwsWith(() => SF.createSeatCircuit({ NEURON_ORDER: [], EDGES: [[0, 1]] }), /a wiring is \{ NEURON_ORDER, EDGES/) && throwsWith(() => SF.createSeatCircuit({ NEURON_ORDER: [1, 2], EDGES: [] }), /a wiring is/) && throwsWith(() => SF.createSeatCircuit({ NEURON_ORDER: [1, 2], EDGES: [[0, 2]] }), /an edge names a neuron the wiring does not have \(\[0, 2\] of 2\)/));
});

console.log("6. THE FRONT DOOR");
section(() => {
    const blob = PB.exportBrain(PB.describePolicy("seatGunnerFish", SF), SF.handWeights(), { by: "a peer's fish" }), r = D.sideFromBrains("fishy", [blob]), bad = D.sideFromBrains("bad", [{ ...blob, weights: blob.weights.slice(0, 699) }]);
    ok("!! a fish brain file is seated in all thirteen seats by battleshipDuel.sideFromBrains (the module in the seat is this one) and one a weight short is refused with the count", r.refused.length === 0 && r.seated[0].where.length === 13 && D.seatNetOf(r.side, "main-a").module === SF && D.seatedBrains(r.side).total === 13 && bad.seated.length === 0 && /weight count 699 does not match seatGunnerFish's current 700/.test(bad.refused[0].reason));
    ok("the report says real numbers", SF.reportLines().length === 2 && /12 features, 34 hidden neurons \(the Fish1 TEN core, 153 synapses\), 3 outputs: 700 weights; .* in 3 non-zero weights; nothing is trained/.test(SF.reportLines()[1]));
    ok("the export list", Object.keys(SF).sort().join() === "AIM_GAIN,CONTROL_SEED,FEATURES,FEATURE_NAMES,HIDDEN,OUTPUTS,OUTPUT_NAMES,REC_EDGES,REC_STEPS,WEIGHT_COUNT,control,createSeatCircuit,features,forward,gunnerFactory,gunnerFor,handWeights,layersOf,liveIndices,mutate,perturb,post,reportLines,rngFor,zeroWeights");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
