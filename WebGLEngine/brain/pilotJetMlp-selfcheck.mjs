// WebGLEngine/brain/pilotJetMlp-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotJetMlp-selfcheck.mjs      (~8 s)
//
// THE SIBLING GATE OF brain/pilotJetMlp.mjs: the GPU Brain's plain multilayer perceptron as the JET's pilot, whose hand weights are the jet's fighting autopilot written through nine relu channels of each layer. The network (the three layers, the forward pass, the GPU layer views) is the trainer's MLP's and is held by brain/pilotFlightMlp-selfcheck.mjs; the features and the
// jet's laws are brain/pilotJetPolicy.mjs's and are held by its gate. What this gate holds is the part that is new: THE WEIGHTS ARE THE AUTOPILOT, to float32, through THESE layers, and they are the fruit fly's -- the two brains start from the same laws.
//
//   1  SHAPE              18 -> 32 -> 32 -> 4, 1,796 weights; the network's functions are the trainer's MLP's, the features and names are the jet's fruit fly's (imported, not restated)
//   2  THE HAND WEIGHTS   43 non-zero (the trainer's MLP's 38 with the jet's gains and the limiter's: three into neuron 8, one passing it through the second layer, one out of it); over 1,500 random jet states the four controls are the autopilot's to 2e-6 and the fruit fly's hand weights' to 1e-6; the limiter neuron is the limiter
//   3  THE TWINS          the layers handed to the GPU (render/brainTsl.mjs's mlpLayerCpu, the f32 mirror of the kernel) agree with the CPU twin to 1e-4 on the hand weights and on random ones; the layers are views onto the weights
//   4  THE FLIGHT         the 24 jet fights flown with the hand-weights network in seat A are the hand pilot's fights, hit for hit; the trainer's gains write the trainer's MLP's weights
//   5  THE BRAIN FILE     the policy descriptor, the round trip, a file for another policy refused by name (the trainer's MLP, the jet's fruit fly) and the front door
//
// SABOTAGE LOG -- (filled in below once run)
"use strict";
import * as M from "./pilotJetMlp.mjs";
import * as PM from "./pilotFlightMlp.mjs";
import * as PJ from "./pilotJetPolicy.mjs";
import * as PF from "./pilotFlightPolicy.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as JF from "./jetFight.mjs";
import * as PB from "./peerBrain.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const KEYS = ["pitch", "roll", "yaw", "throttle"];
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jet = AF.jetModel(), G = AF.AUTOPILOT_JET_FIGHT;
const jetState = (o) => F.createState({ mass: jet.mass, inertia: jet.inertia, ...o });
const O_W1 = 0, O_B1 = 576, O_W2 = 608, O_B2 = 1632, O_W3 = 1664, O_B3 = 1792;

console.log("pilotJetMlp-selfcheck -- the GPU Brain's perceptron as the jet's pilot\n");

console.log("1. SHAPE");
{
    ok("!! 18 features -> 32 -> 32 -> 4 and 1,796 weights, the trainer's MLP re-exported and not copied: raw, forward, controlsOf, layersOf and zeroWeights are pilotFlightMlp's own functions", M.FEATURES === 18 && M.WIDTH === 32 && M.OUTPUTS === 4 && M.WEIGHT_COUNT === 1796 && M.LAYER_SIZES.join() === "18,32,32,4" && M.raw === PM.raw && M.forward === PM.forward && M.controlsOf === PM.controlsOf && M.layersOf === PM.layersOf && M.zeroWeights === PM.zeroWeights);
    ok("the features and the names are the JET'S fruit fly's (the same senses, the same four controls), imported: the very functions and arrays of pilotJetPolicy, and not the trainer's", M.features === PJ.features && M.featuresFrom === PJ.featuresFrom && M.FEATURE_NAMES === PJ.FEATURE_NAMES && M.OUTPUT_NAMES === PJ.OUTPUT_NAMES && M.JET_GAINS === PJ.JET_GAINS && M.FEATURE_NAMES !== PF.FEATURE_NAMES);
}

console.log("\n2. THE HAND WEIGHTS ARE THE AUTOPILOT");
{
    const w = M.handWeights(), hw = PJ.handWeights(), nz = []; w.forEach((v, i) => { if (v !== 0) nz.push(i); });
    ok("!! 43 NON-ZERO WEIGHTS: 25 in the first layer (the fruit fly's 22 on neurons 0..7 and the limiter's three on neuron 8), 9 passing the nine through the second (an identity on neurons 0..8) and 9 reading them out (the pairs as +1 and -1, the limiter as -1 into the pitch); every bias is zero", nz.length === 43 && nz.filter((i) => i < O_B1).length === 25 && nz.filter((i) => i >= O_W2 && i < O_B2).length === 9 && nz.filter((i) => i >= O_W3 && i < O_B3).length === 9 && nz.every((i) => (i < O_B1) || (i >= O_W2 && i < O_B2) || (i >= O_W3 && i < O_B3)) && Array.from({ length: 9 }, (_, h) => w[O_W2 + h * 32 + h]).every((v) => v === 1));
    ok("!! THE FIRST LAYER IS THE FRUIT FLY'S, NEURON FOR NEURON (the same 25 numbers in the same rows), and the limiter is neuron 8: 2.4 on feature 12, 3 on feature 13 and -1.56 on feature 14; the readout is +1 and -1 on each pair and -1 on neuron 8 into the pitch, and nothing reads neuron 8 into the roll, yaw or throttle", Array.from({ length: 9 * 18 }, (_, i) => w[O_W1 + i] === hw[i]).every(Boolean) && near(w[O_W1 + 8 * 18 + 12], 2.4, 1e-6) && near(w[O_W1 + 8 * 18 + 13], 3, 1e-6) && near(w[O_W1 + 8 * 18 + 14], -1.56, 1e-6) && [0, 1, 2, 3].every((o) => w[O_W3 + o * 32 + 2 * o] === 1 && w[O_W3 + o * 32 + 2 * o + 1] === -1) && w[O_W3 + 8] === -1 && w[O_W3 + 32 + 8] === 0 && w[O_W3 + 64 + 8] === 0 && w[O_W3 + 96 + 8] === 0);
    ok("...and the trainer's own gains write the trainer's own MLP weights (no limiter): handWeights(AUTOPILOT_FLIGHT) is PM.handWeights() to the bit, 38 non-zero", JSON.stringify(Array.from(M.handWeights(AF.AUTOPILOT_FLIGHT))) === JSON.stringify(Array.from(PM.handWeights())) && M.handWeights(AF.AUTOPILOT_FLIGHT).filter((v) => v !== 0).length === 38);
    const hand = M.pilotFor(w), fly = PJ.pilotFor(hw), rnd = mulberry(4242); let worst = 0, worstFly = 0;
    for (let i = 0; i < 1500; i++) {
        const alt = 300 + rnd() * 7700;
        const st = jetState({ pos: [0, 0, alt], speed: 70 + rnd() * 120, heading: rnd() * 6 - 3, pitch: rnd() * 1.2 - 0.6, bank: rnd() * 6.2 - 3.1, gamma: rnd() - 0.5, w: [rnd() * 2 - 1, rnd() - 0.5, rnd() - 0.5] });
        const tg = { altitude: alt + rnd() * 1000 - 500, heading: rnd() * 6 - 3, airspeed: 80 + rnd() * 100 }, wv = [rnd() * 30 - 15, rnd() * 30 - 15, rnd() * 6 - 3];
        const a = AF.decide(st, tg, wv, { ...G, model: jet }).controls, b = hand(st, tg, wv), c = fly(st, tg, wv);
        for (const k of KEYS) { worst = Math.max(worst, Math.abs(a[k] - b[k])); worstFly = Math.max(worstFly, Math.abs(c[k] - b[k])); }
    }
    ok("!! OVER 1,500 RANDOM JET STATES (any attitude, 70 to 190 m/s, 300 to 8,000 m, spinning, a wind of up to 15 m/s, any target) THE MLP'S FOUR CONTROLS ARE THE AUTOPILOT'S TO 2e-6 (float32 weights) AND THE FRUIT FLY'S HAND WEIGHTS' TO 1e-6: the two brains start from the same laws", worst < 2e-6 && worstFly < 1e-6, `autopilot ${worst.toExponential(2)}, fruit fly ${worstFly.toExponential(2)}`);
    const T0 = { altitude: 2000, heading: 0, airspeed: 120 }, lim = (alpha, q) => { const s = jetState({ pos: [0, 0, 2000], speed: 120, pitch: alpha, bank: 0 }); s.w = [0, -q, 0]; return s; };
    const noL = M.pilotFor(M.handWeights({ ...G, alphaLimit: 0 }));
    ok("!! THE LIMITER NEURON IS THE LIMITER, THROUGH BOTH LAYERS: at an angle of attack of 0.25 rad the MLP's pitch is -1 (the autopilot's) and the same MLP without the limiter neuron's is not; at 0.05 the two MLPs give the same pitch to the bit; and with a pitch rate of 0.4 rad/s at 0.08 rad it is -1 again (the lead)", hand(lim(0.25, 0), T0).pitch === -1 && noL(lim(0.25, 0), T0).pitch > -0.5 && hand(lim(0.05, 0), T0).pitch === noL(lim(0.05, 0), T0).pitch && hand(lim(0.08, 0.4), T0).pitch === -1 && noL(lim(0.08, 0.4), T0).pitch > -0.5);
}

console.log("\n3. THE TWINS");
{
    const hw = M.handWeights(), rnd = mulberry(31), L = M.layersOf(hw);
    ok("!! layersOf() is three brain/mlp.js layers (relu, relu, none) whose W and b are VIEWS onto the weights, and the hand weights written through them are the ones the CPU twin reads: 576 + 32, 1,024 + 32, 128 + 4", L.length === 3 && L.map((l) => l.act).join() === "relu,relu,none" && L[0].W.buffer === hw.buffer && L[2].b.byteOffset === hw.byteOffset + O_B3 * 4 && L[0].W.length === 576 && L[1].W.length === 1024 && L[2].W.length === 128);
    let worstHand = 0, worstRnd = 0;
    for (let i = 0; i < 60; i++) {
        const st = jetState({ pos: [0, 0, 500 + rnd() * 6000], speed: 70 + rnd() * 120, pitch: rnd() - 0.5, bank: rnd() * 6 - 3 }), tg = { altitude: 2000 + rnd() * 1000, heading: rnd() * 6 - 3, airspeed: 90 + rnd() * 80 };
        const x = M.features(st, tg), y = M.raw(hw, x); let h = Float32Array.from(x); for (const l of M.layersOf(hw)) h = mlpLayerCpu(l, h, 1);
        worstHand = Math.max(worstHand, ...Array.from(h).map((v, k) => Math.abs(v - y[k])));
        const rw = M.zeroWeights(); for (let k = 0; k < rw.length; k++) rw[k] = (rnd() * 2 - 1) * 0.5;
        const yr = M.raw(rw, x); let hr = Float32Array.from(x); for (const l of M.layersOf(rw)) hr = mlpLayerCpu(l, hr, 1);
        worstRnd = Math.max(worstRnd, ...Array.from(hr).map((v, k) => Math.abs(v - yr[k])));
    }
    ok("!! the f32 mirror of the GPU kernel (render/brainTsl.mjs's mlpLayerCpu chain) agrees with the CPU twin to 1e-4 on the jet's hand weights over 60 jet states, and on 60 random networks", worstHand < 1e-4 && worstRnd < 1e-4, `hand ${worstHand.toExponential(2)}, random ${worstRnd.toExponential(2)}`);
}

console.log("\n4. THE FLIGHT IS THE SAME FLIGHT");
{
    const hand = M.pilotFor(M.handWeights());
    let same = 0, worstScore = 0;
    for (const sc of JF.JET_FIGHT_SET) {
        const a = JF.duel(AF.jetFightPilot, sc), b = JF.duel(hand, sc);
        if (["dealt", "taken", "fired", "firedB", "statusA", "statusB", "ticks", "killedB", "firstHit"].every((k) => a[k] === b[k])) same++;
        worstScore = Math.max(worstScore, Math.abs(a.score - b.score));
    }
    ok("!! THE 24 JET FIGHTS: the MLP with the hand weights in seat A flies every one the hand pilot flies -- every hit dealt and taken, every round, both statuses, the tick the fight ended on and the time of the first hit identical -- and the score differs by exactly 0", same === 24 && worstScore === 0, `${same} of 24, score difference ${worstScore}`);
    const zero = JF.duel(M.pilotFor(M.zeroWeights()), JF.scenario(1, "tail"));
    ok("the zero weights output nothing and the jet falls: a fight flown with them ends with A on the ground and nothing fired", (zero.statusA === "crashed" || zero.statusA === "touchdown") && zero.fired === 0);
}

console.log("\n5. THE BRAIN FILE AND THE FRONT DOOR");
{
    const DESC = PB.describePolicy("pilotJetMlp", M), hw = M.handWeights();
    ok("the policy descriptor is { id, FEATURES, HIDDEN, OUTPUTS, WEIGHT_COUNT } = { pilotJetMlp, 18, 32, 4, 1796 }", DESC.id === "pilotJetMlp" && DESC.FEATURES === 18 && DESC.HIDDEN === 32 && DESC.OUTPUTS === 4 && DESC.WEIGHT_COUNT === 1796);
    const blob = PB.exportBrain(DESC, hw, { score: 0.897, by: "the gate" }), back = PB.importBrain(DESC, JSON.parse(JSON.stringify(blob)));
    ok("!! exportBrain -> JSON -> importBrain gives back the same weights, bit for bit, and the score", back.ok && back.weights.length === 1796 && back.weights.every((v, i) => v === hw[i]) && back.meta.score === 0.897);
    const trainer = PB.exportBrain(PB.describePolicy("pilotFlightMlp", PM), PM.handWeights(), { score: 0 }), fly = PB.exportBrain(PB.describePolicy("pilotJetPolicy", PJ), PJ.handWeights(), { score: 0 });
    const a = PB.importBrain(DESC, trainer), b = PB.importBrain(DESC, fly), c = PB.importBrain(PB.describePolicy("pilotFlightMlp", PM), blob);
    ok("!! A BRAIN FILE FOR THE TRAINER'S MLP, AND ONE FOR THE JET'S FRUIT FLY, ARE REFUSED BY THIS IMPORTER BY NAME, and this brain's file is refused by the trainer's MLP's importer (the same 1,796 weights mean different things in the two: a jet's file in a trainer's pilot flies it into the ground)", !a.ok && /pilotFlightMlp/.test(a.reason) && !b.ok && /pilotJetPolicy/.test(b.reason) && !c.ok && /pilotJetMlp/.test(c.reason), `${a.reason} | ${b.reason}`);
    const L = M.reportLines();
    ok("the front door names the module, the layer sizes and the 1,796 weights, says that 43 are not zero, and no line says NaN or undefined", L.length === 2 && /pilotJetMlp/.test(L[0]) && /18 -> 32 -> 32 -> 4/.test(L[0]) && /1796 weights/.test(L[0]) && /43 of 1796 non-zero/.test(L[1]) && !L.some((l) => /NaN|undefined/.test(l)), L[1]);
    ok("the export list is pinned", Object.keys(M).sort().join(",") === "FEATURES,FEATURE_NAMES,HIDDEN,JET_GAINS,LAYER_SIZES,OUTPUTS,OUTPUT_NAMES,WEIGHT_COUNT,WIDTH,controlsOf,features,featuresFrom,forward,handWeights,layersOf,pilotFor,raw,reportLines,zeroWeights", Object.keys(M).sort().join(","));
}

console.log(fails ? `\npilotJetMlp-selfcheck: ${fails} FAILED` : "\npilotJetMlp-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
