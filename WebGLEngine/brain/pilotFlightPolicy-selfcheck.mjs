// WebGLEngine/brain/pilotFlightPolicy-selfcheck.mjs
//
// Run: node brain/pilotFlightPolicy-selfcheck.mjs      (~2 s)
//
// THE SIBLING GATE OF brain/pilotFlightPolicy.mjs (v4867): the fruit-fly network as a real-flight pilot, whose hand weights are the PD autopilot written through the 34 neurons of the Giant Fiber Circuit. The claim worth a gate is not
// "it flies" -- it is "the weights ARE the autopilot", and "the network IS the circuit". Both are asked of it with an independent restatement of the network written HERE, from the topology file, with no code from the module:
//
//   1  shape: 18 features, 34 neurons, 313 synapses, 4 outputs, 1,099 weights, named features and outputs, zero weights all zero
//   2  THE NETWORK IS THE CIRCUIT: with the recurrent weights at zero the network is exactly two layers (relu(W1 x + b1), then W2 h + b2) -- the recurrent core is an identity; with ONE recurrent weight set, the output is what three
//      relu steps through that one synapse of the real topology make it (target index first, source second, as gfcTopology.mjs says); a synapse between two neurons the hand weights never excite changes nothing, exactly;
//      a feature vector is read as finite whatever it holds; the outputs are clamped to [-1, 1] for pitch, roll, yaw and [0, 1] for throttle
//   3  THE HAND WEIGHTS ARE THE AUTOPILOT: 30 non-zero weights (22 in, 8 out) in the pairs-of-channels layout the header gives, each at the value the autopilot's law and the feature's scale make it; and over 1,500 random states (any
//      attitude, any speed from 30 to 60 m/s, spin, wind, target) the network's four controls are the autopilot's to 2e-6 (float32 weights)
//   4  THE FLIGHT IS THE SAME FLIGHT: over the 36 scenarios of the AUDIT and BASELINE sets the hand-weights pilot ends within 1e-5 m of the autopilot's altitude and speed and scores the same to 1e-6 -- not a similar score, the same flight
//   5  features are what the header says: on target and in trim they are exactly [1, stick, throttle, 0 ...]; a bank, a climb error, a sideslip, an airspeed error each move exactly the features the header names and no other of the
//      first eleven; the `upright` factor takes bankComp, stickTrim and climbErr out together; everything is finite for a NaN state; a gain override reaches the weights
//   6  the zero weights output nothing and the aircraft falls; noise is deterministic for a seed, scales with sigma, and a noisy pilot flies worse than the hand pilot and still flies at 0.05
//   7  the brain file round-trips through peerBrain (export, import, the same weights), a file for another policy is refused by name; pilotRoster resolves hand, zero, noise, imported and an unavailable id to pilots that fly
//
// v4869: section 7 also holds the SHIPPED pilot (brain/pilotFlightWeightsDefault.json) to the roster: it imports, resolves as 'shipped', flies, and beats the hand pilot on a recovery start. The training functions have their own gate,
// brain/pilotFlightTrain-selfcheck.mjs.
//
// SABOTAGE LOG -- each applied to brain/pilotFlightPolicy.mjs in a scratch worktree, the gate run, the worktree restored:
//   33 sabotages, every one red by name (the number is how many rows went red):
//   HAND WEIGHTS  P1 the bank comp coefficient from the wrong gain 4 | P2 roll sign flipped 9 | P3 yaw scale 0.2 -> 0.1 4 | P4 throttle climb scale 5 -> 1 4 | P5 readout pair not negated 6 | P6 input pair's second channel not negated 9 | P23 gain overrides ignored 1
//   FEATURES      P7 speed error scale /10 -> /5 4 | P8 stick trim not multiplied by upright 2 | P9 pitch-rate sign flipped 5 | P10 alpha scale 0.2 -> 0.1 2 | P24 the yaw-rate feature reads the roll rate 1 | P25 the bias feature 0 1 | P20 feature names reordered 1 | P21 output names reordered 1
//   FORWARD PASS  P11 throttle clamped to [-1, 1] 3 | P12 pitch clamp removed 3 | P13 two recurrent steps, not three 3 | P14 the recurrent identity removed 9 | P15 synapses read source-first 3 | P17 non-finite output not guarded 1 | P26 the readout rows reversed 9 |
//                 P27 the last synapse of the circuit dropped 1 | P28 no relu after a recurrent step 1 | P29 a NaN feature not read as 0 1 | P30 the input bias read one off 2 | P31 a recurrent step run in place 1
//   THE TWIN      (layersOf, the shape the TSL and GPU twins take) P14b the identity removed 1 | P15b synapses source-first 2 | P16 the memo never invalidated 1
//   OTHER         P18 perturb spread doubled 2 | P19 the zero weights shared between callers 10 | P22 the pilot ignores the wind 3
//   THREE WENT 0 RED THE FIRST TIME: P24 (no hand weight reads feature 17 and no flight row sees it: the rate-and-extras row, against the flight model's own attitude and rates, exists because of it); P27 and P29 once the forward pass was
//   rewritten over the edge list (the random-weight row left the last synapse silent, and relu(NaN) = 0 had been quietly hiding that the NaN guard did anything): the 313-synapses-one-at-a-time row and the one-NaN-feature row exist because of them.
//   THE FORWARD PASS WAS REWRITTEN WHEN THE GATE TOOK 3.1 S AND MOST OF IT WAS mlpLayerCpu's dense 34 x 34 recurrent matrix: over the circuit's own 313 edges it is a third of the multiplies and the gate runs in 1.7 s, which keeps it inside the
//   ship-time sweep's 3 s; the old dense path is kept as layersOf() for the twins and the gate holds the two to each other.
"use strict";
import fs from "node:fs";
import * as PF from "./pilotFlightPolicy.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as T from "./flightTask.mjs";
import * as PR from "./pilotRoster.mjs";
import * as PB from "./peerBrain.mjs";
import * as Topo from "./gfcTopology.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const model = AF.defaultModel(), LEVEL = Object.freeze({ altitude: 300, heading: 0, airspeed: 45 });
const TRIM_AT = (V, extra = {}) => F.createState({ speed: V, pitch: F.trim(model, V).pitchAttitude, ...extra });
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KEYS = ["pitch", "roll", "yaw", "throttle"];

// ---- an independent restatement of the network, from the topology file alone --------------------------------------------------------------------------------------------------------------------------------------
const FEAT = 18, HID = 34, OUT = 4, NEDGE = Topo.EDGES.length, relu = (v) => (v > 0 ? v : 0);
function refForward(w, x, steps = 3) {
    let o = 0; const W1 = w.subarray(o, o += FEAT * HID), b1 = w.subarray(o, o += HID), Wrec = w.subarray(o, o += NEDGE), W2 = w.subarray(o, o += HID * OUT), b2 = w.subarray(o, o += OUT);
    let h = Array.from({ length: HID }, (_, j) => { let s = b1[j]; for (let f = 0; f < FEAT; f++) s += W1[j * FEAT + f] * x[f]; return relu(s); });
    for (let t = 0; t < steps; t++) {
        const n = h.slice();   // the identity (a weight of exactly 1 on every neuron's own previous value) plus the real synapses
        Topo.EDGES.forEach(([to, from], k) => { n[to] += Wrec[k] * h[from]; });
        h = n.map(relu);
    }
    const y = Array.from({ length: OUT }, (_, j) => { let s = b2[j]; for (let k = 0; k < HID; k++) s += W2[j * HID + k] * h[k]; return s; });
    const c = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    return { pitch: c(y[0], -1, 1), roll: c(y[1], -1, 1), yaw: c(y[2], -1, 1), throttle: c(y[3], 0, 1) };
}

console.log("pilotFlightPolicy-selfcheck -- the fruit fly's Giant Fiber Circuit as a real-flight pilot\n");

console.log("1. SHAPE");
{
    ok("!! 18 features, 34 neurons, 313 synapses, 4 outputs and 1,099 weights (18*34 + 34 + 313 + 34*4 + 4)", PF.FEATURES === 18 && PF.HIDDEN === 34 && PF.OUTPUTS === 4 && PF.REC_EDGES === 313 && PF.REC_STEPS === 3 && PF.WEIGHT_COUNT === 18 * 34 + 34 + 313 + 34 * 4 + 4 && PF.WEIGHT_COUNT === 1099 && PF.zeroWeights().length === 1099);
    ok("the features and outputs are named, the names are unique and in the documented order", PF.FEATURE_NAMES.length === 18 && new Set(PF.FEATURE_NAMES).size === 18 && PF.FEATURE_NAMES[0] === "bias" && PF.FEATURE_NAMES[1] === "stickTrim" && PF.FEATURE_NAMES[10] === "speedErr" && PF.FEATURE_NAMES[17] === "yawRate" && PF.OUTPUT_NAMES.join() === "pitch,roll,yaw,throttle");
    ok("the zero weights are all zero (and are a fresh array each time)", PF.zeroWeights().every((v) => v === 0) && PF.zeroWeights() !== PF.zeroWeights());
    ok("the topology is the real circuit's: 34 neurons and 313 synapses from gfcTopology.mjs, every edge a [target, source] pair of valid indices", Topo.NEURON_ORDER.length === 34 && Topo.EDGES.length === 313 && Topo.EDGES.every(([t, s]) => t >= 0 && t < 34 && s >= 0 && s < 34));
}

console.log("\n2. THE NETWORK IS THE CIRCUIT -- against an independent restatement");
{
    const rnd = mulberry(99), w = PF.zeroWeights(), x = Array.from({ length: 18 }, () => rnd() * 2 - 1);
    for (let i = 0; i < 18 * 34 + 34; i++) w[i] = (rnd() * 2 - 1) * 0.12;
    for (let i = 18 * 34 + 34 + 313; i < w.length; i++) w[i] = (rnd() * 2 - 1) * 0.12;
    const a = PF.forward(w, x), b = refForward(w, x);
    ok("!! with the recurrent weights at ZERO the network is exactly two layers: relu(W1 x + b1), then W2 h + b2, clamped (the recurrent core is an identity), to 1e-6", KEYS.every((k) => near(a[k], b[k], 1e-6)), KEYS.map((k) => `${a[k].toFixed(5)}/${b[k].toFixed(5)}`).join(" "));
    ok("...and the reference is not trivially the answer: pitch, roll and yaw are NOT all at a clamp for these random weights", [a.pitch, a.roll, a.yaw].some((v) => Math.abs(v) < 0.99) && KEYS.some((k) => a[k] !== 0));
    // the twin: layersOf(w) is the network in the shape the TSL and GPU twins take; forward() computes the same function over the edge list. RANDOM RECURRENT WEIGHTS TOO, so the three steps are in it.
    const wr = Float32Array.from(w); for (let i = 18 * 34 + 34; i < 18 * 34 + 34 + 313; i++) wr[i] = (rnd() * 2 - 1) * 0.3;
    const chain = (ww, xx) => { const L = PF.layersOf(ww); let h = Float32Array.from(xx); for (let i = 0; i < L.length - 1; i++) h = mlpLayerCpu(L[i], h, 1); const y = mlpLayerCpu(L[L.length - 1], h, 1); const c = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v); return { pitch: c(y[0], -1, 1), roll: c(y[1], -1, 1), yaw: c(y[2], -1, 1), throttle: c(y[3], 0, 1) }; };
    const twin = chain(wr, x), fast = PF.forward(wr, x), indep = refForward(wr, x);
    ok("!! forward() over the edge list is the SAME FUNCTION as layersOf(w) through mlpLayerCpu (the shape the TSL and GPU twins take) to 1e-5, and both are the independent restatement's to 1e-5 -- with random recurrent weights, so all three steps are in it", KEYS.every((k) => near(fast[k], twin[k], 1e-5) && near(fast[k], indep[k], 1e-5)) && Math.abs(fast.pitch - a.pitch) + Math.abs(fast.roll - a.roll) + Math.abs(fast.yaw - a.yaw) > 1e-3, KEYS.map((k) => `${fast[k].toFixed(5)}/${twin[k].toFixed(5)}/${indep[k].toFixed(5)}`).join(" "));
    const rec0 = 18 * 34 + 34, edge = Topo.EDGES.findIndex(([t, s]) => t === 4 && s === 2);
    // neurons 2 and 4 are the positive channel of roll and the positive channel of yaw in the hand weights: an edge between them carries one output into another (the state below banks right, so the roll channel is the one that is lit)
    const hw = PF.handWeights(), st = TRIM_AT(45, { bank: 0.2 }), tg = { altitude: 330, heading: 0.5, airspeed: 45 }, xf = PF.features(st, tg), base = PF.forward(hw, xf);
    const w2 = Float32Array.from(hw); w2[rec0 + edge] = 0.2;
    const viaNet = PF.forward(w2, xf), viaRef = refForward(w2, xf);
    ok("!! with ONE real synapse set (neuron 2 -> neuron 4, the circuit's edge #" + edge + ", weight 0.2) the output is what three relu steps through that synapse make it, to 1e-6, and it is not the unmodified output", edge >= 0 && KEYS.every((k) => near(viaNet[k], viaRef[k], 1e-6)) && Math.abs(viaNet.yaw - base.yaw) > 1e-3 && near(viaNet.pitch, base.pitch, 1e-9), `yaw ${base.yaw.toFixed(5)} -> ${viaNet.yaw.toFixed(5)} (reference ${viaRef.yaw.toFixed(5)})`);
    const live = Float32Array.from(hw), before = PF.forward(live, xf); live[rec0 + edge] = 0.2;
    const [toIdx, fromIdx] = Topo.EDGES[edge], liveBefore = PF.layersOf(live)[1].W[toIdx * 34 + fromIdx];   // the twin's layers, memoised, before the weight changes
    live[rec0 + edge] = 0.45;
    ok("!! the network re-reads a RECURRENT weight changed IN PLACE after a forward pass -- forward() reads the weights afresh and the twin's memo (layersOf) is checked against them every call -- so a trainer that mutates a vector it has already run does not fly a stale circuit", Math.abs(PF.forward(live, xf).yaw - before.yaw) > 0.1 && Math.abs(PF.forward(live, xf).yaw - viaNet.yaw) > 0.01 && near(liveBefore, 0.2, 1e-6) && near(PF.layersOf(live)[1].W[toIdx * 34 + fromIdx], 0.45, 1e-6), `yaw ${before.yaw.toFixed(4)} -> ${PF.forward(live, xf).yaw.toFixed(4)}; layers ${liveBefore.toFixed(3)} -> ${PF.layersOf(live)[1].W[toIdx * 34 + fromIdx].toFixed(3)}`);
    // EVERY ONE of the 313 synapses is in the forward pass, wired source-to-target as the topology file says: a base vector with every hidden neuron lit (a positive bias on each, random readout), then each synapse alone at 0.3
    const lit = PF.zeroWeights(); for (let j = 0; j < 34; j++) lit[18 * 34 + j] = 0.4; for (let i = 18 * 34 + 34 + 313; i < 18 * 34 + 34 + 313 + 136; i++) lit[i] = (rnd() * 2 - 1) * 0.3;
    const x0 = Array.from({ length: 18 }, () => 0), baseLit = PF.forward(lit, x0);
    let wrong = 0, silent = 0, worstEdge = 0;
    for (let k = 0; k < 313; k++) { const we = Float32Array.from(lit); we[rec0 + k] = 0.3; const a2 = PF.forward(we, x0), b2 = refForward(we, x0), d = Math.max(...KEYS.map((q) => Math.abs(a2[q] - b2[q]))); worstEdge = Math.max(worstEdge, d); if (d > 1e-6) wrong++; if (Math.max(...KEYS.map((q) => Math.abs(a2[q] - baseLit[q]))) < 1e-7) silent++; }
    ok("!! each of the circuit's 313 synapses, set alone on a base with every neuron lit, makes the forward pass what the independent restatement says (1e-6): none is dropped, none is wired backwards, and all but a handful change the output at all", wrong === 0 && silent <= 40, `${wrong} wrong, ${silent} of 313 silent (a neuron whose output weight is clamped away), worst ${worstEdge.toExponential(2)}`);
    const nanIn = [...xf]; nanIn[11] = NaN; const zeroIn = [...xf]; zeroIn[11] = 0; const nanOut = PF.forward(hw, nanIn), zeroOut = PF.forward(hw, zeroIn);
    ok("!! a NaN in ONE feature reads as 0 and no more: the output is exactly the one with that feature at 0 (relu(NaN) would silence every neuron the feature feeds, and the throttle with it)", KEYS.every((q) => nanOut[q] === zeroOut[q]) && nanOut.throttle > 0.1, JSON.stringify(nanOut));
    const quiet = Topo.EDGES.findIndex(([t, s]) => t >= 20 && s >= 20), w3 = Float32Array.from(hw); w3[rec0 + quiet] = 3;
    const same = PF.forward(w3, xf);
    ok("!! a synapse between two neurons the hand weights never excite (" + Topo.EDGES[quiet] + ", both above 19) changes NOTHING, exactly -- the other neurons' activity is zero and relu keeps it so", quiet >= 0 && KEYS.every((k) => same[k] === base[k]));
    const wild = PF.forward(hw, [NaN, Infinity, -Infinity, 1e30, -1e30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    ok("!! a feature vector with NaN, infinity and 1e30 in it gives finite controls inside their ranges", KEYS.every((k) => Number.isFinite(wild[k])) && Math.abs(wild.pitch) <= 1 && Math.abs(wild.roll) <= 1 && Math.abs(wild.yaw) <= 1 && wild.throttle >= 0 && wild.throttle <= 1, JSON.stringify(wild));
    const big = Float32Array.from(hw); for (let o = 0; o < 4; o++) big[18 * 34 + 34 + 313 + o * 34 + 2 * o] = 1e4;
    const sat = PF.forward(big, PF.features(TRIM_AT(45), { ...LEVEL, altitude: 800 }));
    ok("!! the outputs are CLAMPED: pitch, roll and yaw to [-1, 1] and the throttle to [0, 1] (a huge output weight saturates them at +1, and a negative one the throttle at 0)", sat.pitch <= 1 && sat.roll >= -1 && sat.roll <= 1 && sat.yaw >= -1 && sat.yaw <= 1 && sat.throttle <= 1 && PF.forward(Float32Array.from({ length: 1099 }, (_, i) => (i === 18 * 34 + 34 + 313 + 3 * 34 + 6 ? -50 : 0)), [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).throttle === 0);
    const k1 = PF.forward(hw, xf), k2 = PF.forward(hw, xf);
    ok("the forward pass is deterministic and does not mutate the weights", JSON.stringify(k1) === JSON.stringify(k2) && hw.every((v, i) => v === PF.handWeights()[i]));
}

console.log("\n3. THE HAND WEIGHTS ARE THE AUTOPILOT");
{
    const w = PF.handWeights(), K = AF.AUTOPILOT_FLIGHT, nz = [];
    w.forEach((v, i) => { if (v !== 0) nz.push(i); });
    ok("!! 30 non-zero weights: 22 in the input layer (4 + 2 + 2 + 3 terms, each in a pair of channels) and 8 in the readout; the biases and the recurrent core are zero", nz.length === 30 && nz.filter((i) => i < 612).length === 22 && nz.filter((i) => i >= 612 + 34 + 313 && i < 612 + 34 + 313 + 136).length === 8 && nz.every((i) => i < 612 || i >= 959) && w.subarray(612, 612 + 34).every((v) => v === 0) && w.subarray(646, 959).every((v) => v === 0) && w.subarray(1095).every((v) => v === 0), `${nz.length} non-zero`);
    const W1 = (h, f) => w[h * 18 + f], W2 = (o, h) => w[959 + o * 34 + h];
    const pair = (o, f, v) => near(W1(2 * o, f), v, 1e-6) && near(W1(2 * o + 1, f), -v, 1e-6);
    ok("!! each channel is a PAIR (z and -z) read back as the difference: the readout is +1 on the first neuron and -1 on the second", [0, 1, 2, 3].every((o) => W2(o, 2 * o) === 1 && W2(o, 2 * o + 1) === -1));
    ok("!! PITCH = stickTrim + kBankInv bankComp + kVsPitch climbErr - 0.5 kQ pitchRate: the weights on features 1, 3, 4, 5 are 1, 0.55, 0.35 and -0.175", pair(0, 1, 1) && pair(0, 3, K.kBankInv) && pair(0, 4, K.kVsPitch) && pair(0, 5, -0.5 * K.kQ));
    ok("!! ROLL = 0.5 kBank bankErr - kP rollRate: the weights on features 6 and 7 are 1.1 and -0.28", pair(1, 6, 0.5 * K.kBank) && pair(1, 7, -K.kP));
    ok("!! YAW = 0.2 kCoord turnErr - 0.1 kBeta beta: the weights on features 8 and 9 are 0.2 and -0.16", pair(2, 8, 0.2 * K.kCoord) && pair(2, 9, -0.1 * K.kBeta));
    ok("!! THROTTLE = thrTrim + 10 kSpd speedErr + 5 kClimbThr climb: the weights on features 2, 10 and 11 are 1, 0.6 and 0.5", pair(3, 2, 1) && pair(3, 10, 10 * K.kSpd) && pair(3, 11, 5 * K.kClimbThr));
    ok("!! handWeights(gains) reaches the weights: kBank 3 puts 1.5 on the roll channel, kQ 0 takes the pitch-rate weight to 0, and the default is the autopilot's own gains", near(PF.handWeights({ kBank: 3 })[2 * 18 + 6], 1.5, 1e-6) && PF.handWeights({ kQ: 0 })[0 * 18 + 5] === 0 && JSON.stringify(Array.from(PF.handWeights())) === JSON.stringify(Array.from(PF.handWeights({}))) && PF.handWeights({ kBank: 3 })[2 * 18 + 6] !== w[2 * 18 + 6]);
    const hand = PF.pilotFor(w), rnd = mulberry(4242); let worst = 0, worstWhere = "";
    for (let i = 0; i < 1500; i++) {
        const st = F.createState({ speed: 30 + rnd() * 30, heading: rnd() * 6 - 3, pitch: rnd() - 0.5, bank: rnd() * 6 - 3, gamma: (rnd() - 0.5) * 0.5, w: [rnd() * 2 - 1, rnd() - 0.5, rnd() - 0.5] });
        const tg = { altitude: 300 + rnd() * 200 - 100, heading: rnd() * 6 - 3, airspeed: 38 + rnd() * 14 }, wv = [rnd() * 10 - 5, rnd() * 10 - 5, rnd() * 2 - 1];
        const a = AF.pilot(st, tg, wv), b = hand(st, tg, wv);
        for (const k of KEYS) { const d = Math.abs(a[k] - b[k]); if (d > worst) { worst = d; worstWhere = k; } }
    }
    ok("!! over 1,500 random states (any attitude, 30-60 m/s, spinning, in a wind, any target) the network's four controls are the autopilot's to 2e-6 (float32 weights)", worst < 2e-6, `worst ${worst.toExponential(2)} (${worstWhere})`);
}

console.log("\n4. THE FLIGHT IS THE SAME FLIGHT");
{
    const hand = PF.pilotFor(PF.handWeights()), ap = (s, t, w) => AF.pilot(s, t, w);
    let dAlt = 0, dV = 0, dHdg = 0, dScore = 0, n = 0, baseSum = 0, baseN = 0, baseCrashed = 0;
    for (const set of [T.AUDIT_SET, T.BASELINE_SET]) for (const sc of set) {
        const a = T.fly(ap, sc), b = T.fly(hand, sc);
        dAlt = Math.max(dAlt, Math.abs(a.final.alt - b.final.alt)); dV = Math.max(dV, Math.abs(a.final.V - b.final.V)); dHdg = Math.max(dHdg, Math.abs(a.final.hdg - b.final.hdg)); dScore = Math.max(dScore, Math.abs(a.score - b.score)); n++;
        if (set === T.BASELINE_SET) { baseSum += b.score; baseN++; if (b.status !== "airborne") baseCrashed++; }
    }
    ok("!! over the 36 scenarios of the AUDIT and BASELINE sets (every kind: nominal, recovery, gusty) the hand-weights pilot ends within 1e-5 m of the autopilot's altitude, 1e-5 m/s of its speed and 1e-7 rad of its heading, and scores the same to 1e-6 -- the same flight, not a similar score", n === 36 && dAlt < 1e-5 && dV < 1e-5 && dHdg < 1e-7 && dScore < 1e-6, `${n} flights; altitude ${dAlt.toExponential(2)}, speed ${dV.toExponential(2)}, heading ${dHdg.toExponential(2)}, score ${dScore.toExponential(2)}`);
    ok("!! on the BASELINE set the network pilot scores -0.3577 (the autopilot's pinned number), none ending early", near(baseSum / baseN, -0.3577, 6e-5) && baseCrashed === 0, `${(baseSum / baseN).toFixed(4)} over ${baseN} flights`);
}

console.log("\n5. THE FEATURES ARE WHAT THE HEADER SAYS");
{
    const t45 = F.trim(model, 45), onTarget = PF.features(TRIM_AT(45), LEVEL);
    ok("!! on target and in trim the features are exactly [1, the trim stick, the trim throttle, then zeros] (bank comp, climb error, rates, bank error, turn error, beta, speed error, climb, ... all 0 to 1e-9; alpha and pitch are the trim attitude)", near(onTarget[0], 1) && near(onTarget[1], t45.pitch, 2e-3) && near(onTarget[2], t45.throttle, 2e-3) && [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 17].every((i) => near(onTarget[i], 0, 1e-9)) && near(onTarget[12], t45.alpha / 0.2, 1e-6) && near(onTarget[16], t45.pitchAttitude / 0.5, 1e-9), onTarget.map((v) => v.toFixed(3)).join(" "));
    const diff = (a, b) => a.map((v, i) => Math.abs(v - b[i]) > 1e-12 ? i : -1).filter((i) => i >= 0);
    const bank = PF.features(TRIM_AT(45, { bank: 0.2 }), LEVEL), speedErr = PF.features(TRIM_AT(45), { ...LEVEL, airspeed: 40 }), altErr = PF.features(TRIM_AT(45), { ...LEVEL, altitude: 320 }), hdgErr = PF.features(TRIM_AT(45), { ...LEVEL, heading: 0.4 });
    ok("!! a 0.2 rad bank moves features 3 (bank comp), 6 (bank error), 8 (turn error), 9 (sideslip, from the attitude with the velocity level), 13 (bank) and 12, 16 (alpha and pitch of the banked body) and no rate, speed or altitude feature", JSON.stringify(diff(onTarget, bank)) === JSON.stringify([3, 6, 8, 9, 12, 13, 16]) || diff(onTarget, bank).every((i) => [1, 3, 6, 8, 9, 12, 13, 16].includes(i)) && [3, 6, 8, 13].every((i) => diff(onTarget, bank).includes(i)), `moved: ${diff(onTarget, bank).map((i) => PF.FEATURE_NAMES[i]).join(", ")}`);
    ok("!! an airspeed target 5 m/s low moves the speed error (feature 10, -0.5 scaled by 10) and the throttle trim (feature 2) and nothing else", JSON.stringify(diff(onTarget, speedErr)) === JSON.stringify([2, 10]) && near(speedErr[10], -0.5, 1e-9), `moved: ${diff(onTarget, speedErr).map((i) => PF.FEATURE_NAMES[i]).join(", ")}`);
    ok("!! 20 m of altitude error moves the climb error (feature 4: 2.4 m/s / 5 = 0.48) and the altitude error (feature 14: 20/50) and nothing else", JSON.stringify(diff(onTarget, altErr)) === JSON.stringify([4, 14]) && near(altErr[4], 0.48, 1e-9) && near(altErr[14], 0.4, 1e-9), `moved: ${diff(onTarget, altErr).map((i) => PF.FEATURE_NAMES[i]).join(", ")}`);
    ok("!! a heading error of 0.4 rad moves the bank error (feature 6: 0.44 / 0.5) and the heading error (feature 15: 0.4 / pi) and nothing else", JSON.stringify(diff(onTarget, hdgErr)) === JSON.stringify([6, 15]) && near(hdgErr[6], 0.44 / 0.5, 1e-9) && near(hdgErr[15], 0.4 / Math.PI, 1e-9), `moved: ${diff(onTarget, hdgErr).map((i) => PF.FEATURE_NAMES[i]).join(", ")}`);
    // the seven extras and the rate features, against the flight model's own attitude and rates (not through guidance)
    const st = F.createState({ speed: 44, pitch: 0.2, gamma: 0.1, bank: 0.3, heading: 0.1, w: [0.1, -0.2, -0.05] }), ft = PF.features(st, { altitude: 310, heading: 0.1, airspeed: 44 }), at = F.attitude(st), rt = F.rates(st);
    ok("!! the rate features and the extras are the flight model's own numbers at their documented scales: pitch rate / 0.5 = 0.4, roll rate = 0.1, yaw rate / 0.2 = 0.25 (and the turn error is the coordinated rate less it), climb / 5, alpha / 0.2, bank / 0.5, altitude error / 50, pitch / 0.5", near(ft[5], rt.pitch / 0.5, 1e-9) && near(ft[5], 0.4, 1e-9) && near(ft[7], rt.roll, 1e-9) && near(ft[7], 0.1, 1e-9) && near(ft[17], rt.yaw / 0.2, 1e-9) && near(ft[17], 0.25, 1e-9) && near(ft[8], (9.80665 * Math.tan(at.bank) / at.airspeed - rt.yaw) / 0.2, 1e-9) && near(ft[11], st.vel[2] / 5, 1e-9) && near(ft[12], at.alpha / 0.2, 1e-9) && near(ft[13], at.bank / 0.5, 1e-9) && near(ft[14], (310 - 300) / 50 - 0, 1e-9) && near(ft[16], at.pitch / 0.5, 1e-9), `rates ${ft[5].toFixed(3)} ${ft[7].toFixed(3)} ${ft[17].toFixed(3)}; extras ${[11, 12, 13, 14, 16].map((i) => ft[i].toFixed(3)).join(" ")}`);
    const inv = PF.features(F.createState({ speed: 45, bank: 2.9 }), { ...LEVEL, altitude: 340 });
    ok("!! `upright` takes features 1, 3 and 4 out together: inverted, the stick trim, the bank comp and the climb error are all exactly 0 while the bank (feature 13) is not", inv[1] === 0 && inv[3] === 0 && inv[4] === 0 && Math.abs(inv[13]) > 1);
    const bad = F.createState({ speed: 45 }); bad.vel = [NaN, 0, 0]; bad.w = [NaN, Infinity, 0];
    ok("!! a NaN state gives eighteen FINITE features and the pilot gives finite controls", PF.features(bad, LEVEL).length === 18 && PF.features(bad, LEVEL).every(Number.isFinite) && KEYS.every((k) => Number.isFinite(PF.pilotFor(PF.handWeights())(bad, LEVEL)[k])));
    ok("!! featuresFrom(guidance) is features(): the eighteen features of a state and a target are the eighteen of its guidance record", JSON.stringify(PF.featuresFrom(AF.guidance(st, { altitude: 310, heading: 0.1, airspeed: 44 }))) === JSON.stringify(PF.features(st, { altitude: 310, heading: 0.1, airspeed: 44 })));
    ok("the features are deterministic, and the wind is read (a tailwind changes the airspeed features: speed error and throttle)", JSON.stringify(PF.features(TRIM_AT(45), LEVEL)) === JSON.stringify(PF.features(TRIM_AT(45), LEVEL)) && PF.features(TRIM_AT(45), LEVEL, [10, 0, 0])[10] > 0.9);
}

console.log("\n6. ZERO, NOISE");
{
    const zero = PF.pilotFor(PF.zeroWeights()), c = zero(TRIM_AT(45), LEVEL);
    ok("!! the zero weights output NOTHING: all four controls are exactly 0 and the aircraft falls (all 18 baseline scenarios end early)", KEYS.every((k) => c[k] === 0) && T.evaluate(zero, T.BASELINE_SET).crashed === 18);
    const rng = () => 0.3, p1 = PF.perturb(PF.handWeights(), 0.05, mulberry(5)), p2 = PF.perturb(PF.handWeights(), 0.05, mulberry(5)), p3 = PF.perturb(PF.handWeights(), 0.05, mulberry(6)), big = PF.perturb(PF.handWeights(), 0.5, mulberry(5));
    void rng;
    const sd = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length), hw = PF.handWeights();
    ok("!! perturb() is deterministic for a seed, different for another, copies rather than edits, and its spread is sigma (0.05 -> within 15%; 0.5 -> 10x)", JSON.stringify(Array.from(p1)) === JSON.stringify(Array.from(p2)) && JSON.stringify(Array.from(p1)) !== JSON.stringify(Array.from(p3)) && hw.every((v, i) => v === PF.handWeights()[i]) && Math.abs(sd(p1, hw) / 0.05 - 1) < 0.15 && Math.abs(sd(big, hw) / sd(p1, hw) - 10) < 1, `${sd(p1, hw).toFixed(4)} and ${sd(big, hw).toFixed(4)}`);
    const noisy = T.evaluate(PF.pilotFor(p1), T.BASELINE_SET), hand = T.evaluate(PF.pilotFor(hw), T.BASELINE_SET);
    ok("!! a pilot with noise 0.05 on every weight STILL FLIES (no flight ends early) and scores worse than the hand pilot", noisy.crashed === 0 && noisy.score < hand.score - 0.05, `${noisy.score.toFixed(4)} vs ${hand.score.toFixed(4)}`);
}

console.log("\n7. THE BRAIN FILE AND THE ROSTER");
{
    const DESC = PB.describePolicy("pilotFlightPolicy", PF), hw = PF.handWeights();
    ok("the policy descriptor is { id, FEATURES, HIDDEN, OUTPUTS, WEIGHT_COUNT } = { pilotFlightPolicy, 18, 34, 4, 1099 }", DESC.id === "pilotFlightPolicy" && DESC.FEATURES === 18 && DESC.HIDDEN === 34 && DESC.OUTPUTS === 4 && DESC.WEIGHT_COUNT === 1099);
    const blob = PB.exportBrain(DESC, hw, { score: -0.3577, by: "the gate" }), back = PB.importBrain(DESC, JSON.parse(JSON.stringify(blob)));
    ok("!! exportBrain -> JSON -> importBrain gives back the same weights, bit for bit, and the score", back.ok && back.weights.length === 1099 && back.weights.every((v, i) => v === hw[i]) && back.meta.score === -0.3577);
    const other = PB.importBrain(DESC, PB.exportBrain(PB.describePolicy("pilotAircraftPolicy", { FEATURES: 12, HIDDEN: 34, OUTPUTS: 3, WEIGHT_COUNT: 860 }), new Float32Array(860)));
    ok("!! a brain file for ANOTHER policy is refused by name", !other.ok && /pilotAircraftPolicy/.test(other.reason) && /pilotFlightPolicy/.test(other.reason), other.reason);
    const ctx = { PP: PF, shipped: null, imported: back.weights, brainPilotOn: false, scriptedName: "PD autopilot" };
    const flies = (w) => { const f = PF.pilotFor(w), r = T.fly(f, T.scenario(2, "nominal")); return r.status === "airborne"; };
    const rs = ["hand", "noise05", "imported", "zero", "scripted"].map((id) => PR.resolveTeam("A", id, ctx, 3));
    ok("!! pilotRoster resolves hand, noise05, imported and zero to weight vectors of the right length (one per aircraft), scripted to no weights, and each of the network ones to a pilot function that answers four controls", rs.slice(0, 4).every((r) => !r.scripted && r.weights.length === 3 && r.weights.every((w) => w.length === 1099) && KEYS.every((k) => Number.isFinite(PF.pilotFor(r.weights[0])(TRIM_AT(45), LEVEL)[k]))) && rs[4].scripted && rs[4].weights === null, rs.map((r) => r.id + ":" + r.label).join(" | "));
    ok("...the hand, noise-0.05 and imported pilots fly (airborne for 40 s) and the zero pilot does not", flies(rs[0].weights[0]) && flies(rs[1].weights[0]) && flies(rs[2].weights[0]) && !flies(rs[3].weights[0]));
    const bogus = PR.resolveTeam("A", "league", ctx, 2);
    ok("!! a choice the page does not hold (league) falls back to the hand weights AND SAYS SO", bogus.problems.length === 1 && /league/.test(bogus.problems[0]) && bogus.weights.every((w) => w.every((v, i) => v === hw[i])));
    const shippedBlob = JSON.parse(fs.readFileSync(new URL("./pilotFlightWeightsDefault.json", import.meta.url), "utf8")), shippedImp = PB.importBrain(DESC, shippedBlob);
    ok("!! the SHIPPED pilot (brain/pilotFlightWeightsDefault.json, made by tools/ship/trainPilotFlight.mjs; tools/ship/trainFlightPilot-selfcheck.mjs holds it to its `by`) imports through the page's importer", shippedImp.ok && shippedImp.weights.length === 1099, shippedImp.ok ? "" : shippedImp.reason);
    if (shippedImp.ok) {
        const sh = PR.resolveTeam("A", "shipped", { ...ctx, shipped: shippedImp.weights }, 3), unavailable = PR.resolveTeam("A", "shipped", ctx, 3);
        const rec = T.scenario(3, "recovery"), fs1 = T.fly(PF.pilotFor(sh.weights[0]), rec), fh = T.fly(PF.pilotFor(hw), rec);
        ok("!! pilotRoster resolves 'shipped' to the shipped file's weights (one vector per aircraft, labelled 'shipped pilot brain', no problems), the pilot flies and does better than the hand pilot on a recovery start; where the page holds no shipped pilot the choice falls back to the hand weights AND SAYS SO", sh.problems.length === 0 && /shipped pilot brain/.test(sh.label) && sh.weights.length === 3 && sh.weights.every((v) => v.every((x, i) => x === shippedImp.weights[i])) && fs1.status === "airborne" && fs1.score > fh.score && unavailable.problems.length === 1 && /shipped/.test(unavailable.problems[0]) && unavailable.weights.every((v) => v.every((x, i) => x === hw[i])), `recovery 3: ${fs1.score.toFixed(3)} vs the hand pilot's ${fh.score.toFixed(3)}`);
    }
    const L = PF.reportLines();
    ok("the front door names the module, the circuit and the 1,099 weights, says how many of them the hand weights use, and no line says NaN or undefined", L.some((l) => /pilotFlightPolicy/.test(l) && /34 neurons/.test(l) && /1099/.test(l)) && L.some((l) => /30 of 1099 non-zero/.test(l)) && L.every((l) => !/NaN|undefined/.test(l)));
}

console.log("\n8. THE TRAINING FUNCTIONS EXIST AND ANSWER FOR THE AUTOPILOT (brain/pilotFlightTrain-selfcheck.mjs holds what they do)");
{
    const hw = PF.handWeights(), two = T.TRAIN_SET.slice(0, 2), t0 = PF.train({ seed: 1, iters: 0, trainSet: two }), p0 = PF.prune(hw, { trainSet: two });
    ok("!! train() with no iterations returns the hand weights untouched, scored on the scenarios it was given, and prune() of the hand weights moves and keeps nothing: the autopilot is where both start and where a prune ends", t0.weights.every((v, i) => v === hw[i]) && t0.improved === 0 && t0.neutral === 0 && t0.trainScore === PF.evaluate(hw, two).score && p0.moved === 0 && p0.kept === 0 && p0.trainScore === t0.trainScore && typeof PF.mutate === "function");
}

console.log(fails ? `\npilotFlightPolicy-selfcheck: ${fails} FAILED` : "\npilotFlightPolicy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
