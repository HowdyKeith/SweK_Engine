// WebGLEngine/brain/pilotDronePolicy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotDronePolicy-selfcheck.mjs      (about a minute)
//
// THE SIBLING GATE OF brain/pilotDronePolicy.mjs: the fruit-fly network as a quadrotor pilot, whose hand weights are the hand pilot (brain/autopilotDrone.mjs) written through the 34 neurons of the Giant Fiber Circuit. The claim worth a gate is not "it flies" -- it is "the weights ARE the hand
// pilot", and "the network IS the circuit". Both are asked of it with an independent restatement of the network written HERE, from the topology file, with no code from the module (brain/pilotRotorPolicy-selfcheck.mjs is the helicopter's, and this gate is built on its shape):
//
//   1  SHAPE          20 features, 34 neurons, 313 synapses, 4 outputs, 1,167 weights, named features and outputs, zero weights all zero
//   2  THE NETWORK IS THE CIRCUIT   with the recurrent weights at zero the network is exactly two layers; with ONE recurrent weight set the output is what three relu steps through that one synapse of the real topology make it; every one of the 313 synapses is in the forward pass,
//                     wired target-first; the network re-reads a weight changed in place; a feature vector is read as finite whatever it holds; the thrust is clamped to [0, 1] and the other three to [-1, 1]; layersOf (the twins' shape) is the same function
//   3  THE HAND WEIGHTS ARE THE HAND PILOT   22 non-zero weights (14 in, 8 out) in the pairs-of-channels layout, each at the value the pilot's law and the feature's scale make it; and over 2,000 random states (any attitude, spin, climb, a motor out in a fifth of them, a battery of any charge,
//                     four kinds of target) the network's four controls are the pilot's to 2e-7 (float32 weights)
//   4  THE FLIGHT IS THE SAME FLIGHT   over the reserve (BASELINE_SET, every kind) the hand-weights pilot flies the hand pilot's flight: the same score to 1e-6 on every flight that is not a tumble, and on the tumbles the same crash
//   5  FEATURES       on target and in trim they are exactly the trims; each of the extras moves exactly the feature the header names; every one is finite for a NaN state; the clamps hold on the extremes
//   6  THE ZERO WEIGHTS fall (thrust 0), noise is deterministic for a seed and scales with sigma, and a noisy pilot flies worse than the hand pilot
//   7  THE TRAINING FUNCTIONS: a sparse mutation moves one to maxK weights and is deterministic for a seed; a search never ends lower than it started on its own set and is deterministic; prune puts every weight that does not matter back to the hand pilot's, a block at a time
//
// SABOTAGE LOG: (filled in below once run)
"use strict";
import * as PP from "./pilotDronePolicy.mjs";
import * as AD from "./autopilotDrone.mjs";
import * as DT from "./droneTask.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as Q from "../physics/mechanics/multirotorModel6dof.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const model = AD.defaultModel(), TRIM = AD.trimOf(model), K = AD.AUTOPILOT_DRONE, KP = AD.attitudeGains(TRIM.alphaPitch), KR = AD.attitudeGains(TRIM.alphaRoll);
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KEYS = ["thrust", "pitch", "roll", "yaw"];
const hand = (s, t, w, c) => AD.pilot(s, t, w, c);
const hoverAt = (extra = {}) => Q.createState(model, { pos: [0, 0, 50], heading: 0, ...extra });

// ---- an independent restatement of the network, from the topology file alone ----------------------------------------------------------------------------------------------------------------------------------
const FEAT = 20, HID = 34, OUT = 4, NEDGE = Topo.EDGES.length, relu = (v) => (v > 0 ? v : 0);
function refForward(w, x, steps = 3) {
    let o = 0; const W1 = w.subarray(o, o += FEAT * HID), b1 = w.subarray(o, o += HID), Wrec = w.subarray(o, o += NEDGE), W2 = w.subarray(o, o += HID * OUT), b2 = w.subarray(o, o += OUT);
    let h = Array.from({ length: HID }, (_, j) => { let s = b1[j]; for (let q = 0; q < FEAT; q++) s += W1[j * FEAT + q] * x[q]; return relu(s); });
    for (let t = 0; t < steps; t++) {
        const n = h.slice();   // the identity (a weight of exactly 1 on every neuron's own previous value) plus the real synapses
        Topo.EDGES.forEach(([to, from], k) => { n[to] += Wrec[k] * h[from]; });
        h = n.map(relu);
    }
    const y = Array.from({ length: OUT }, (_, j) => { let s = b2[j]; for (let k = 0; k < HID; k++) s += W2[j * HID + k] * h[k]; return s; });
    const c = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    return { thrust: c(y[0], 0, 1), pitch: c(y[1], -1, 1), roll: c(y[2], -1, 1), yaw: c(y[3], -1, 1) };
}

console.log("pilotDronePolicy-selfcheck -- the fruit fly's Giant Fiber Circuit as a quadrotor pilot\n");

console.log("1. SHAPE");
{
    ok("!! 20 features, 34 neurons, 313 synapses, 4 outputs and 1,167 weights (20*34 + 34 + 313 + 34*4 + 4)", PP.FEATURES === 20 && PP.HIDDEN === 34 && PP.OUTPUTS === 4 && PP.REC_EDGES === 313 && PP.REC_STEPS === 3 && PP.WEIGHT_COUNT === 20 * 34 + 34 + 313 + 34 * 4 + 4 && PP.WEIGHT_COUNT === 1167);
    ok("the features and outputs are named, the names are unique and in the documented order", PP.FEATURE_NAMES.length === 20 && new Set(PP.FEATURE_NAMES).size === 20 && PP.FEATURE_NAMES[0] === "bias" && PP.FEATURE_NAMES[1] === "pitchErr" && PP.FEATURE_NAMES[7] === "climbErr" && PP.FEATURE_NAMES[15] === "motorOut" && PP.FEATURE_NAMES[19] === "yawRate" && JSON.stringify(PP.OUTPUT_NAMES) === '["thrust","pitch","roll","yaw"]');
    ok("the zero weights are all zero (and are a fresh array each time)", PP.zeroWeights().every((v) => v === 0) && PP.zeroWeights() !== PP.zeroWeights() && PP.zeroWeights().length === 1167);
    ok("the topology is the real circuit's: 34 neurons and 313 synapses from gfcTopology.mjs, every edge a [target, source] pair of valid indices", Topo.NEURON_ORDER.length === 34 && Topo.EDGES.length === 313 && Topo.EDGES.every(([t, s]) => t >= 0 && t < 34 && s >= 0 && s < 34));
}

console.log("\n2. THE NETWORK IS THE CIRCUIT -- against an independent restatement");
{
    const rnd = mulberry(99), w = PP.zeroWeights(), x = Array.from({ length: 20 }, () => rnd() * 2 - 1);
    for (let i = 0; i < 20 * 34 + 34; i++) w[i] = (rnd() * 2 - 1) * 0.12;
    for (let i = 20 * 34 + 34 + 313; i < w.length; i++) w[i] = (rnd() * 2 - 1) * 0.12;
    w[20 * 34 + 34 + 313 + 34 * 4 + 0] = 0.4;   // the collective's bias, so that its raw output is not stuck below the clamp
    const a = PP.forward(w, x), b = refForward(w, x);
    ok("!! with the recurrent weights at ZERO the network is exactly two layers: relu(W1 x + b1), then W2 h + b2, clamped (the recurrent core is an identity), to 1e-6", KEYS.every((k) => near(a[k], b[k], 1e-6)), KEYS.map((k) => `${f(a[k], 4)}/${f(b[k], 4)}`).join(" "));
    ok("...and the reference is not trivially the answer: pitch, roll and yaw are NOT all at a clamp for these random weights", [a.pitch, a.roll, a.yaw].some((v) => Math.abs(v) < 0.99) && KEYS.some((k) => a[k] !== 0));
    const wr = Float32Array.from(w); for (let i = 20 * 34 + 34; i < 20 * 34 + 34 + 313; i++) wr[i] = (rnd() * 2 - 1) * 0.3;
    const chain = (ww, xx) => { const L = PP.layersOf(ww); let h = Float32Array.from(xx); for (let i = 0; i < L.length - 1; i++) h = mlpLayerCpu(L[i], h, 1); const y = mlpLayerCpu(L[L.length - 1], h, 1); const c = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v); return { thrust: c(y[0], 0, 1), pitch: c(y[1], -1, 1), roll: c(y[2], -1, 1), yaw: c(y[3], -1, 1) }; };
    const twin = chain(wr, x), fast = PP.forward(wr, x), indep = refForward(wr, x);
    ok("!! forward() over the edge list is the SAME FUNCTION as layersOf(w) through mlpLayerCpu (the shape the TSL and GPU twins take) to 1e-5, and both are the independent restatement's to 1e-5 -- with random recurrent weights, so all three steps are in it", KEYS.every((k) => near(fast[k], twin[k], 1e-5) && near(fast[k], indep[k], 1e-5)) && KEYS.some((k) => !near(fast[k], PP.forward(w, x)[k], 1e-6)), KEYS.map((k) => `${f(fast[k], 4)}/${f(twin[k], 4)}/${f(indep[k], 4)}`).join(" "));
    const rec0 = 20 * 34 + 34, edge = Topo.EDGES.findIndex(([t, s]) => t === 4 && s === 2);
    const hw = PP.handWeights(), st = hoverAt({ pitch: -0.02 }), tg = { altitude: 50, heading: 0 }, xf = PP.features(st, tg), base = PP.forward(hw, xf);   // a gentle state: the nose 0.02 rad low, so that no output sits at a clamp and the pitch channel (neuron 2) is lit
    const w2 = Float32Array.from(hw); w2[rec0 + edge] = 0.2;
    const viaNet = PP.forward(w2, xf), viaRef = refForward(w2, xf);
    ok("!! with ONE real synapse set (neuron 2 -> neuron 4, the circuit's edge #" + edge + ", weight 0.2: the pitch channel into the roll channel) the output is what three relu steps through that synapse make it, to 1e-6, and it is not the unmodified output (no output is at a clamp in this state)", edge >= 0 && KEYS.every((k) => Math.abs(base[k]) < 0.99 || k === "thrust") && KEYS.every((k) => near(viaNet[k], viaRef[k], 1e-6)) && KEYS.some((k) => Math.abs(viaNet[k] - base[k]) > 1e-4), `edge ${edge}: ${KEYS.map((k) => `${f(base[k], 4)}->${f(viaNet[k], 4)}`).join(" ")}`);
    const live = Float32Array.from(hw); const before = PP.forward(live, xf); live[rec0 + edge] = 0.2; PP.layersOf(live);
    const [toIdx, fromIdx] = Topo.EDGES[edge], liveBefore = PP.layersOf(live)[1].W[toIdx * 34 + fromIdx];
    live[rec0 + edge] = 0.45;
    ok("!! the network re-reads a RECURRENT weight changed IN PLACE after a forward pass -- forward() reads the weights afresh and the twin's memo (layersOf) is checked against them every call -- so a trainer that mutates a vector it has already run is never run stale", near(PP.forward(live, xf).pitch, refForward(live, xf).pitch, 1e-6) && near(PP.layersOf(live)[1].W[toIdx * 34 + fromIdx], 0.45, 1e-6) && near(liveBefore, 0.2, 1e-6) && KEYS.some((k) => Math.abs(PP.forward(live, xf)[k] - before[k]) > 1e-5), `${f(liveBefore, 3)} -> ${f(PP.layersOf(live)[1].W[toIdx * 34 + fromIdx], 3)}`);
    // EVERY ONE of the 313 synapses is in the forward pass, wired source-to-target as the topology file says
    const lit = PP.zeroWeights(); for (let j = 0; j < 34; j++) lit[20 * 34 + j] = 0.4; for (let i = 20 * 34 + 34 + 313; i < 20 * 34 + 34 + 313 + 136; i++) lit[i] = (rnd() * 2 - 1) * 0.3;
    const x0 = Array.from({ length: 20 }, () => 0), baseLit = PP.forward(lit, x0);
    let worstEdge = 0, silent = 0;
    for (let k = 0; k < 313; k++) { const we = Float32Array.from(lit); we[rec0 + k] = 0.3; const a2 = PP.forward(we, x0), b2 = refForward(we, x0), d = Math.max(...KEYS.map((q) => Math.abs(a2[q] - b2[q]))); worstEdge = Math.max(worstEdge, d); if (KEYS.every((q) => a2[q] === baseLit[q])) silent++; }
    ok("!! each of the circuit's 313 synapses, set alone on a base with every neuron lit, makes the forward pass what the independent restatement says (1e-6): none is dropped, none is wired backwards, and all but a handful change the output", worstEdge < 1e-6 && silent < 60, `worst difference ${worstEdge.toExponential(1)}, ${silent} of 313 leave the four outputs where they were`);
    const nanIn = [...xf]; nanIn[11] = NaN; const zeroIn = [...xf]; zeroIn[11] = 0; const nanOut = PP.forward(hw, nanIn), zeroOut = PP.forward(hw, zeroIn);
    ok("!! a NaN in ONE feature reads as 0 and no more: the output is exactly the one with that feature at 0 (relu(NaN) would silence every neuron the feature feeds)", KEYS.every((q) => nanOut[q] === zeroOut[q]) && KEYS.every((q) => Number.isFinite(nanOut[q])));
    const all = PP.forward(hw, xf.map(() => NaN)), inf = PP.forward(hw, xf.map(() => Infinity));
    ok("a feature vector of all NaN or all Infinity gives finite controls in range", KEYS.every((q) => Number.isFinite(all[q]) && Number.isFinite(inf[q])) && all.thrust >= 0 && all.thrust <= 1);
    const big = PP.zeroWeights(); big[20 * 34 + 34 + 313 + 0] = 50; big[20 * 34 + 34 + 313 + 34 * 4 + 0] = 50; big[20 * 34 + 34 + 313 + 34 + 0] = -50; big[20 * 34 + 34 + 313 + 34 * 4 + 1] = -50; big[20 * 34 + 34 + 313 + 34 * 4 + 2] = 50; big[20 * 34 + 34 + 313 + 34 * 4 + 3] = -50;
    const cl = PP.forward(big, x0);
    ok("!! the outputs are clamped to each control's range: a raw collective of 50 reads 1 and of -50 reads 0 (collective is [0, 1]), the cyclics and the pedal read +-1 (they are [-1, 1])", cl.thrust === 1 && cl.pitch === -1 && cl.roll === 1 && cl.yaw === -1 && PP.controlsOf([-50, 50, -50, 50]).thrust === 0 && PP.controlsOf([-50, 50, -50, 50]).pitch === 1 && KEYS.every((k) => PP.controlsOf([NaN, NaN, NaN, NaN])[k] === 0) && KEYS.every((k) => PP.controlsOf([Infinity, -Infinity, Infinity, -Infinity])[k] === 0));
}

console.log("\n3. THE HAND WEIGHTS ARE THE HAND PILOT");
{
    const hw = PP.handWeights(), IN = (h, q) => hw[h * 20 + q], outBase = 20 * 34 + 34 + 313, OUTW = (o, h) => hw[outBase + o * 34 + h];
    const nz = []; hw.forEach((v, i) => { if (v !== 0) nz.push(i); });
    ok("!! 22 non-zero weights: 14 in the input layer and 8 in the readout (the pairs of channels), nothing in the biases or the recurrent core", nz.length === 22 && nz.filter((i) => i < 20 * 34).length === 14 && nz.filter((i) => i >= outBase && i < outBase + 136).length === 8 && nz.every((i) => i < 20 * 34 || (i >= outBase && i < outBase + 136)), `${nz.length}`);
    const P = (o, terms) => terms.every(([q, v]) => near(IN(2 * o, q), v, 1e-6 * Math.max(1, Math.abs(v))) && near(IN(2 * o + 1, q), -v, 1e-6 * Math.max(1, Math.abs(v)))) && near(OUTW(o, 2 * o), 1) && near(OUTW(o, 2 * o + 1), -1);
    ok("!! THRUST = thrustFF + 5 kVs climbErr (features 6 and 7: 1 and 0.85), through the pair of channels (neurons 0 and 1, read back as +1 and -1)", P(0, [[6, 1], [7, 5 * K.kVs]]));
    ok("!! PITCH = 0.1 kTheta pitchErr - 0.5 kQ pitchRate (features 1 and 2: 0.1767 and -0.0505), with kTheta = wn^2 / alpha and kQ = 2 zeta wn / alpha for the pitch authority, neurons 2 and 3", P(1, [[1, 0.1 * KP.kTheta], [2, -0.5 * KP.kQ]]) && near(IN(2, 1), 0.1767, 1e-3) && near(IN(2, 2), -0.1010, 1e-3));
    ok("!! ROLL = 0.1 kTheta bankErr - 0.5 kQ rollRate (features 3 and 4), neurons 4 and 5", P(2, [[3, 0.1 * KR.kTheta], [4, -0.5 * KR.kQ]]));
    ok("!! YAW = 0.5 kYaw yawRateErr (feature 5: 0.58), neurons 6 and 7", P(3, [[5, 0.5 * K.kYaw]]) && near(IN(6, 5), 0.58, 1e-6));
    ok("the bias (feature 0) and the extras (features 8..19) have NO hand weight: the hand pilot does not read them and a search may", [0, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].every((q) => { for (let h = 0; h < 34; h++) if (IN(h, q) !== 0) return false; return true; }));
    ok("a gain override reaches the weights: handWeights({ wn: 7 }) quarters the pitch and roll coefficients (kTheta ~ wn^2) and halves the rate ones (kQ ~ wn), { kVs: 0.2 } sets the thrust's climb-error coefficient to 1.0, { kYaw: 2 } the yaw's to 1.0", near(PP.handWeights({ wn: 7 })[2 * 20 + 1], 0.25 * IN(2, 1), 1e-6) && near(PP.handWeights({ wn: 7 })[2 * 20 + 2], 0.5 * IN(2, 2), 1e-6) && near(PP.handWeights({ wn: 7 })[4 * 20 + 3], 0.25 * IN(4, 3), 1e-6) && near(PP.handWeights({ kVs: 0.2 })[7], 1.0, 1e-6) && near(PP.handWeights({ kYaw: 2 })[6 * 20 + 5], 1.0, 1e-6));
    // the random-state equivalence: the whole pilot, through guidance and the laws, against the network
    const r = mulberry(11), u = (lo, hi) => lo + (hi - lo) * r(), pil = PP.pilotFor(hw);
    let worst = 0, n = 0, out = 0, lowBattery = 0, kinds = { pos: 0, velocity: 0, altitude: 0, land: 0 };
    for (let i = 0; i < 2000; i++) {
        const dead = r() < 0.2, health = [1, 1, 1, 1]; if (dead) health[Math.floor(r() * 4)] = 0;
        const s = Q.createState(model, { pos: [u(-50, 50), u(-50, 50), u(0.5, 200)], pitch: u(-1.2, 1.2), bank: u(-3, 3), heading: u(-3, 3), velocity: [u(-15, 15), u(-15, 15), u(-8, 8)], w: [u(-4, 4), u(-4, 4), u(-3, 3)], health, charge: u(0.05, 1) });
        const k = r(), tg = k < 0.4 ? { pos: [u(-100, 100), u(-100, 100)], altitude: u(5, 100), heading: u(-3, 3) } : k < 0.7 ? { velocity: [u(-8, 8), u(-8, 8)], altitude: u(5, 100) } : k < 0.85 ? { altitude: s.pos[2], land: true } : { altitude: u(5, 100), speed: u(2, 12), pos: [u(-50, 50), u(-50, 50)] };
        kinds[k < 0.4 ? "pos" : k < 0.7 ? "velocity" : k < 0.85 ? "land" : "altitude"]++;
        const a = AD.pilot(s, tg, [0, 0, 0], {}), b = pil(s, tg, [0, 0, 0], {});
        for (const q of KEYS) worst = Math.max(worst, Math.abs(a[q] - b[q]));
        n++; if (dead) out++; if (s.energy < 0.5 * 8e4) lowBattery++;
    }
    ok("!! OVER 2,000 RANDOM STATES THE NETWORK'S FOUR CONTROLS ARE THE HAND PILOT'S to 2e-7 (float32 weights): any attitude to 170 degrees of bank, spin to 4 rad/s, climb and fall, a motor out in a fifth of them, a battery of any charge, four kinds of target", worst < 2e-7 && out > 300 && lowBattery > 600 && Object.values(kinds).every((c) => c > 150), `worst ${worst.toExponential(2)} over ${n} (${out} with a motor out, ${lowBattery} under half charge; ${JSON.stringify(kinds)})`);
}

console.log("\n4. THE FLIGHT IS THE SAME FLIGHT");
{
    const net = PP.pilotFor(PP.handWeights()), a = DT.evaluate(hand, DT.BASELINE_SET), b = DT.evaluate(net, DT.BASELINE_SET);
    const steady = a.runs.map((r, i) => [r, b.runs[i]]).filter(([r]) => r.kind !== "motor"), tumbles = a.runs.map((r, i) => [r, b.runs[i]]).filter(([r]) => r.kind === "motor");
    ok("!! OVER THE RESERVE THE HAND-WEIGHTS NETWORK FLIES THE HAND PILOT'S FLIGHT: on the 12 hover, recovery and goto flights the same fingerprint of the states, the same tick count and the score to 1e-6 (float32 weights) on every one -- not a similar score, the same flight", steady.length === 12 && steady.every(([r, s]) => r.fingerprint === s.fingerprint && r.ticks === s.ticks && near(r.score, s.score, 1e-6)), `${steady.filter(([r, s]) => r.fingerprint === s.fingerprint).length} of ${steady.length} fingerprints equal`);
    ok("...and on the 8 motor flights, which are tumbles (a spinning quadrotor amplifies the 1e-7 of float32 weights into a different tumble, said plainly), the same OUTCOME: every one is a crash for both pilots, with a cost within 0.8 of the other's (the crash cost is 3 + 4 x speed / 25, and the speeds differ)", tumbles.length === 8 && tumbles.every(([r, s]) => r.status === s.status && r.settled === s.settled && Math.abs(r.score - s.score) < 0.8), tumbles.map(([r, s]) => `${r.score.toFixed(2)}/${s.score.toFixed(2)}`).join(" "));
}

console.log("\n5. THE FEATURES ARE WHAT THE HEADER SAYS");
{
    const tg = { altitude: 50, heading: 0 }, on = PP.features(hoverAt(), tg);
    ok("!! ON TARGET AND IN TRIM the features are the trims: 1 (the bias), the hover's thrust (feature 6: 0.4169), the height over the legs' depth over 50 m (feature 8: 0.9986), and every error, rate, speed, attitude, location and flag at 0 (to 1e-9)", near(on[0], 1) && near(on[6], TRIM.thrust, 1e-12) && near(on[8], (50 - 0.07) / 50, 1e-9) && [1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].every((q) => Math.abs(on[q]) < 1e-9), on.map((v) => f(v, 4)).join(" "));
    const pitched = PP.features(hoverAt({ pitch: 0.05 }), tg), banked = PP.features(hoverAt({ bank: 0.05 }), tg);
    ok("!! a nose-up error of 0.05 rad moves the pitch error by -0.5 (feature 1: the attitude asked for less the attitude flown, over 0.1 rad) and the pitch extra by +0.1 (feature 13: over 0.5), the thrust feed-forward by 1/cos(0.05) - 1 of the hover's, and no bank, roll or yaw feature", near(pitched[1] - on[1], -0.5, 1e-9) && near(pitched[13] - on[13], 0.1, 1e-9) && near(pitched[6] / on[6], 1 / Math.cos(0.05), 1e-9) && [3, 4, 5, 12].every((q) => Math.abs(pitched[q] - on[q]) < 1e-9));
    ok("!! a bank error of 0.05 rad moves the bank error by -0.5 (feature 3) and the bank extra by +0.1 (feature 12), and no pitch feature", near(banked[3] - on[3], -0.5, 1e-9) && near(banked[12] - on[12], 0.1, 1e-9) && [1, 2, 13].every((q) => Math.abs(banked[q] - on[q]) < 1e-9));
    const rr = Q.rates(hoverAt({ w: [0.2, 0.3, 0.1] })), rates = PP.features(hoverAt({ w: [0.2, 0.3, 0.1] }), tg);
    ok("!! body rates move their own features, read from the model's own rates: the pitch rate over 0.5 is feature 2, the roll rate over 0.5 is feature 4, the yaw-rate error (feature 5: the yaw rate asked for less the one flown, over 0.5) falls by the yaw rate over 0.5, and the yaw rate itself is feature 19 -- for a spin the model reports as pitch " + f(rr.pitch, 3) + ", roll " + f(rr.roll, 3) + ", yaw " + f(rr.yaw, 3), near(rates[2], rr.pitch / 0.5, 1e-9) && near(rates[4], rr.roll / 0.5, 1e-9) && near(rates[5] - on[5], -rr.yaw / 0.5, 1e-9) && near(rates[19], rr.yaw, 1e-9) && Math.abs(rr.pitch) > 0.05 && Math.abs(rr.roll) > 0.05 && Math.abs(rr.yaw) > 0.02);
    const climbing = PP.features(hoverAt({ velocity: [0, 0, 3] }), tg), moving = PP.features(hoverAt({ velocity: [8, 4, 0] }), { velocity: [8, 4], altitude: 50, heading: 0 });
    ok("!! a climb of 3 m/s moves the climb error (feature 7: the climb asked for less the one flown, over 5) to -0.6 and nothing else of the extras (the climb rate itself is no feature: it is in the error); the ground speed is feature 10 along the nose and feature 11 to the right, over 10 m/s (heading 0: 8 ahead and 4 to the LEFT of the right wing = -0.4)", near(climbing[7], -0.6, 1e-9) && near(moving[10], 0.8, 1e-9) && near(moving[11], -0.4, 1e-9) && [8, 9, 10, 11, 12, 13, 14, 15, 16].every((q) => q === 8 || near(climbing[q], on[q], 1e-9)), `${f(climbing[7], 3)}; ${f(moving[10], 3)} ${f(moving[11], 3)}`);
    const sl = PP.features(hoverAt({ heading: 1.0, velocity: [8, 4, 0] }), { velocity: [8, 4], altitude: 50, heading: 1.0 }), hh = 1.0;
    ok("!! THE SPEED ALONG THE NOSE AND TO THE RIGHT ARE THE GROUND VELOCITY IN THE NOSE'S FRAME (heading 1.0 rad, velocity 8 east and 4 north): ahead (8 cos 1 - 4 sin 1) / 10 = " + f((8 * Math.cos(hh) - 4 * Math.sin(hh)) / 10, 4) + " and to the right (-8 sin 1 - 4 cos 1) / 10 = " + f((-8 * Math.sin(hh) - 4 * Math.cos(hh)) / 10, 4) + " -- both components and a heading that is not 0, so a sign slip in either is seen", near(sl[10], (8 * Math.cos(hh) - 4 * Math.sin(hh)) / 10, 1e-9) && near(sl[11], (-8 * Math.sin(hh) - 4 * Math.cos(hh)) / 10, 1e-9), `${f(sl[10], 4)} ${f(sl[11], 4)}`);
    const turned = PP.features(hoverAt({ heading: 1.0 }), { altitude: 50, heading: 0 });
    ok("!! the heading error is feature 14, over pi, wrapped: nose 1.0 rad right of a heading of 0 reads -1/pi; and across the wrap (nose at 3.0, asked for -3.0) it is the short way round, (2 pi - 6) / pi", near(turned[14], -1 / Math.PI, 1e-9) && near(PP.features(hoverAt({ heading: 3.0 }), { altitude: 50, heading: -3.0 })[14], (2 * Math.PI - 6) / Math.PI, 1e-9), `${f(turned[14], 4)}`);
    const dead = PP.features(hoverAt({ failed: 1 }), tg), weak = PP.features(hoverAt({ health: [1, 0.6, 1, 1] }), tg), sick = PP.features(hoverAt({ health: [1, 0.4, 1, 1] }), tg);
    ok("!! the motor-out flag (feature 15) is 1 when any motor's health is under a half (a motor gone, a propeller at 40%) and 0 for a healthy one and for a damaged one at 60%; the thrust feed-forward then rises by 4 over the working motors (feature 6: 4/3 of the hover's), and the yaw-rate error (feature 5) is forced to 0", dead[15] === 1 && sick[15] === 1 && weak[15] === 0 && on[15] === 0 && near(dead[6], on[6] * 4 / 3, 1e-9) && dead[5] === 0 && weak[6] === on[6], `${dead[15]} ${sick[15]} ${weak[15]} ${f(dead[6] / on[6], 4)}`);
    const where = [0, 1, 2, 3].map((i) => PP.features(hoverAt({ failed: i }), tg)), two = PP.features(hoverAt({ failed: [0, 2] }), tg), twoFB = PP.features(hoverAt({ failed: [1, 2] }), tg);
    ok("!! WHICH MOTOR (features 9 and 16): motor 0 is front right (left -1, front +1), 1 front left (+1, +1), 2 rear left (+1, -1), 3 rear right (-1, -1); with no motor out both are 0; with two on the same side (0 and 2: both clockwise, one front and one rear) the front/rear sum is 0 and the left/right -1 + 1 = 0... and with 1 and 2 (both left) the left is 2 (clamped to +-2) and the front/rear 0", [[-1, 1], [1, 1], [1, -1], [-1, -1]].every(([lr, fb], i) => where[i][9] === lr && where[i][16] === fb) && on[9] === 0 && on[16] === 0 && two[9] === 0 && two[16] === 0 && twoFB[9] === 2 && twoFB[16] === 0, where.map((x) => `${x[9]},${x[16]}`).join(" "));
    const ahead = PP.features(hoverAt(), { pos: [20, 0], altitude: 50 }), right = PP.features(hoverAt(), { pos: [0, -20], altitude: 50 }), turnedPt = PP.features(hoverAt({ heading: Math.PI / 2 }), { pos: [0, -20], altitude: 50 });
    ok("!! the point to hold in the nose's frame (features 17 ahead, 18 to the right, over 20 m): a point 20 m ahead reads (1, 0), one 20 m to the right (world -Y at heading 0) reads (0, 1), and the same point with the nose turned 90 degrees right (it is then straight ahead) reads (1, 0); no point reads (0, 0)", near(ahead[17], 1, 1e-9) && near(ahead[18], 0, 1e-9) && near(right[17], 0, 1e-9) && near(right[18], 1, 1e-9) && near(turnedPt[17], 1, 1e-9) && near(turnedPt[18], 0, 1e-9) && on[17] === 0 && on[18] === 0);
    const high = PP.features(hoverAt({ pos: [0, 0, 500] }), { altitude: 500, heading: 0 }), floor = PP.features(hoverAt({ pos: [0, 0, 0.0684] }), { altitude: 0, land: true });
    ok("!! height over the ground (feature 8, over 50 m) clamps at 4 for 500 m up, and reads about 0 on the legs", high[8] === 4 && Math.abs(floor[8]) < 0.01, `${high[8]} ${f(floor[8], 4)}`);
    const nanS = hoverAt(); nanS.pos = [NaN, NaN, NaN]; nanS.vel = [NaN, NaN, NaN]; nanS.q = [NaN, NaN, NaN, NaN];
    ok("!! every feature is finite for a state of NaN, and the pilot built on them returns finite controls in range", (() => { const x = PP.features(nanS, tg); const c = PP.pilotFor(PP.handWeights())(nanS, tg); return x.every(Number.isFinite) && KEYS.every((k) => Number.isFinite(c[k])); })());
    const ext = PP.features(hoverAt({ bank: 3.0, pitch: 1.4, velocity: [90, 90, 70], w: [40, 40, 40] }), { pos: [900, -900], altitude: 900, heading: 0 });
    ok("!! the clamps on the extremes hold: a bank of 172 degrees, a speed of 127 m/s, rates of 40 rad/s, a point 1.3 km away -- no feature outside its documented range (rates +-30 and +-6, errors +-12 and +-32, speeds +-4, the failed-motor signs +-2, bank +-7, pitch +-4, the point +-4)", Math.abs(ext[2]) <= 30 && Math.abs(ext[4]) <= 30 && Math.abs(ext[5]) <= 30 && Math.abs(ext[19]) <= 6 && Math.abs(ext[1]) <= 12 && Math.abs(ext[3]) <= 32 && Math.abs(ext[10]) <= 4 && Math.abs(ext[11]) <= 4 && Math.abs(ext[9]) <= 2 && Math.abs(ext[16]) <= 2 && Math.abs(ext[12]) <= 7 && Math.abs(ext[13]) <= 4 && Math.abs(ext[17]) <= 4 && Math.abs(ext[18]) <= 4 && Math.abs(ext[7]) <= 12, ext.map((v) => f(v, 2)).join(" "));
}

console.log("\n6. THE ZERO WEIGHTS AND NOISE");
{
    const zero = PP.pilotFor(PP.zeroWeights()), s = hoverAt(), c = zero(s, { altitude: 100 });
    ok("!! the zero weights output nothing: collective 0, cyclics 0, pedal 0 -- and the quadrotor FALLS (a hover from 40 m ends 'crashed' within a few seconds)", KEYS.every((k) => c[k] === 0) && (() => { const r = DT.fly(zero, DT.scenario(1, "hover")); return r.status !== "airborne" && r.ticks < 800; })());
    const a = PP.perturb(PP.handWeights(), 0.1, mulberry(5)), b = PP.perturb(PP.handWeights(), 0.1, mulberry(5)), c2 = PP.perturb(PP.handWeights(), 0.1, mulberry(6)), z = PP.perturb(PP.handWeights(), 0, mulberry(5));
    const spread = (v) => { const h = PP.handWeights(); let s2 = 0; for (let i = 0; i < v.length; i++) s2 += (v[i] - h[i]) ** 2; return Math.sqrt(s2 / v.length); };
    ok("!! noise is deterministic for a seed, different for another, absent at sigma 0, and scales with sigma: the spread of hand + noise about the hand weights is within 5% of sigma, and the copy is a new array", a.every((v, i) => v === b[i]) && a.some((v, i) => v !== c2[i]) && z.every((v, i) => v === PP.handWeights()[i]) && near(spread(a) / 0.1, 1, 0.05) && near(spread(PP.perturb(PP.handWeights(), 0.3, mulberry(5))) / 0.3, 1, 0.05) && a !== PP.handWeights(), `${(spread(a) / 0.1).toFixed(3)}`);
    const small = DT.TRAIN_SET.filter((q, i) => i % 3 === 0), hv = DT.evaluate(PP.pilotFor(PP.handWeights()), small), nv = DT.evaluate(PP.pilotFor(PP.perturb(PP.handWeights(), 0.3, mulberry(5))), small);
    ok("!! a noisy pilot flies WORSE than the hand pilot (hand + noise of 0.3 on every weight scores lower on the same flights)", nv.score < hv.score - 0.01, `${hv.score.toFixed(4)} -> ${nv.score.toFixed(4)}`);
}


// ---- a score whose interactions the gate controls, for prune's logic (prune takes `score` for it): eight weights with random pairwise and cubic interactions, from a seed -----------------------------------------------------
const SYN_IDX = [100, 150, 200, 250, 300, 350, 400, 450];
function synth(seed, hw) {
    const r = mulberry(seed), Q = SYN_IDX.map(() => SYN_IDX.map(() => (r() - 0.5) * 6)), g = SYN_IDX.map(() => (r() - 0.5) * 3);
    const T3 = Array.from({ length: 6 }, () => [Math.floor(r() * 8), Math.floor(r() * 8), Math.floor(r() * 8), (r() - 0.5) * 40]);
    const d0 = SYN_IDX.map(() => [-0.3, -0.2, -0.1, 0.1, 0.2, 0.3][Math.floor(r() * 6)]);
    const w = Float32Array.from(hw); SYN_IDX.forEach((i, k) => { w[i] += d0[k]; });
    let calls = 0;
    const score = (x) => {
        calls++; const d = SYN_IDX.map((i) => x[i] - hw[i]); let s = 0;
        for (let a = 0; a < 8; a++) { s += g[a] * d[a]; for (let b = 0; b < 8; b++) s -= Q[a][b] * d[a] * d[b] * (a === b ? 1 : 0.5); }
        for (let c = 0; c < 6; c++) s += T3[c][3] * d[T3[c][0]] * d[T3[c][1]] * d[T3[c][2]];
        return s;
    };
    return { w, score, calls: () => calls };
}

console.log("\n7. THE TRAINING FUNCTIONS");
{
    const hw = PP.handWeights(), rng = mulberry(3);
    const kids = Array.from({ length: 200 }, () => PP.mutate(hw, 0.3, rng, 4)), moved = kids.map((k) => { let n = 0; for (let i = 0; i < k.length; i++) if (k[i] !== hw[i]) n++; return n; });
    ok("!! a sparse mutation moves 1 to maxK weights and no more: over 200 children with maxK 4 every child differs from its parent in 1..4 places, all four counts occur, the parent is untouched, and with maxK 1 it is always one", moved.every((n) => n >= 1 && n <= 4) && [1, 2, 3, 4].every((n) => moved.includes(n)) && PP.handWeights().every((v, i) => v === hw[i]) && Array.from({ length: 30 }, () => PP.mutate(hw, 0.3, rng, 1)).every((k) => k.reduce((n, v, i) => n + (v !== hw[i] ? 1 : 0), 0) === 1), `counts ${[1, 2, 3, 4].map((n) => moved.filter((m) => m === n).length).join("/")}`);
    ok("a mutation is deterministic for a seed and different for another, and the step is a gaussian of sigma: the mean absolute move over many children is within 20% of 0.8 sigma", JSON.stringify(Array.from(PP.mutate(hw, 0.3, mulberry(9)))) === JSON.stringify(Array.from(PP.mutate(hw, 0.3, mulberry(9)))) && JSON.stringify(Array.from(PP.mutate(hw, 0.3, mulberry(9)))) !== JSON.stringify(Array.from(PP.mutate(hw, 0.3, mulberry(10)))) && (() => { const r2 = mulberry(21); let s = 0, n = 0; for (let j = 0; j < 400; j++) { const k = PP.mutate(hw, 0.3, r2, 1); for (let i = 0; i < k.length; i++) if (k[i] !== hw[i]) { s += Math.abs(k[i] - hw[i]); n++; } } return near(s / n, 0.3 * Math.sqrt(2 / Math.PI), 0.06); })());
    const one = [DT.scenario(2, "hover"), DT.scenario(2, "goto")];
    const t0 = PP.evaluate(hw, one).score, tr = PP.train({ seed: 4, iters: 6, sigma: 0.3, trainSet: one }), tr2 = PP.train({ seed: 4, iters: 6, sigma: 0.3, trainSet: one });
    ok("!! A SEARCH NEVER ENDS LOWER THAN IT STARTED ON ITS OWN SET, IS DETERMINISTIC FOR A SEED, AND COUNTS ITS MOVES: six iterations from the hand weights on two flights end at or above the hand score, the history opens at the hand score, improved + neutral is at most the iterations, and a second run is bit-identical", tr.trainScore >= t0 - 1e-12 && near(tr.history[0].score, t0, 1e-12) && tr.history.length >= 2 && tr.improved + tr.neutral <= 6 && tr.iters === 6 && tr.weights.every((v, i) => v === tr2.weights[i]) && tr.trainScore === tr2.trainScore, `${t0.toFixed(4)} -> ${tr.trainScore.toFixed(4)}, ${tr.improved} improved, ${tr.neutral} neutral`);
    const seen = [], big = PP.train({ seed: 4, iters: 40, sigma: 3, trainSet: one, onIter: (i, s) => seen.push(s.score) });
    const increases = seen.reduce((n, s, i) => n + (s > (i ? seen[i - 1] : t0) + 1e-9 ? 1 : 0), 0);
    ok("!! THE SEARCH'S REPORT IS TRUE OF ITS WEIGHTS: forty iterations from the hand weights at sigma 3 (big steps: some children are worse, some better) return weights whose OWN score on the set is the trainScore it reports, never below the start, and `improved` is the number of times the score really rose (counted here from the per-iteration reports) -- a search that took a worse child would return weights that score less than it says", PP.evaluate(big.weights, one).score === big.trainScore && big.trainScore >= t0 - 1e-12 && big.improved === increases && big.improved > 0 && big.neutral > 0 && seen.length === 40, `${t0.toFixed(4)} -> ${big.trainScore.toFixed(4)}; ${big.improved} improved (${increases} seen), ${big.neutral} neutral`);
    const tr3 = PP.train({ seed: 5, iters: 6, sigma: 0.3, trainSet: one });
    ok("the search's seed is its own: seed 5 and seed 4 (same recipe, same flights) end at different weights", tr3.weights.some((v, i) => v !== tr.weights[i]) && tr3.history.length >= 2);
    const dflt = PP.evaluate(hw), tdz = PP.train({ seed: 1, iters: 0 });
    ok("!! evaluate() AND train() DEFAULT TO THE TRAIN SET (34 scenarios: the hand-weights network's -2.914164, pinned; the hand pilot's is -2.925885 -- the 12 motor flights are tumbles, and 1e-7 of float32 makes a different tumble): the default is what a search sees, and the held-out and audit sets are never its default", near(dflt.score, -2.914164, 5e-6) && dflt.runs.length === 34 && near(tdz.trainScore, dflt.score, 1e-12) && tdz.history.length >= 1, `${dflt.score.toFixed(6)}`);
    const start = PP.perturb(hw, 0.05, mulberry(8)), tz = PP.train({ seed: 4, iters: 0, start, trainSet: one });
    ok("a search with no iterations returns its start (the hand weights by default, a given `start` otherwise) at its own score", tz.weights.every((v, i) => v === start[i]) && PP.train({ seed: 1, iters: 0, trainSet: one }).weights.every((v, i) => v === hw[i]) && near(tz.trainScore, PP.evaluate(start, one).score, 1e-12));
    // prune: a vector that is the hand weights plus weights the flights never read goes back to the hand weights exactly
    const dirty = Float32Array.from(hw), deadEdge = Topo.EDGES.findIndex(([to]) => to >= 8); dirty[16 * 20 + 5] = 0.7; dirty[12 * 20 + 19] = -0.4; dirty[20 * 34 + 34 + deadEdge] = 0.2;
    const pr = PP.prune(dirty, { trainSet: one });
    ok("!! PRUNE PUTS BACK EVERY WEIGHT THAT DOES NOT MATTER: the hand weights with three weights nothing reads (the bank error into an unused neuron, the engine-out flag into another, a synapse into a neuron the readout does not read) come back as the hand weights exactly (moved 3, kept 0), at the hand score", pr.moved === 3 && pr.kept === 0 && pr.weights.every((v, i) => v === hw[i]) && near(pr.trainScore, PP.evaluate(hw, one).score, 1e-12), `moved ${pr.moved} kept ${pr.kept}`);
    const sy = synth(1200, hw), spr = PP.prune(sy.w, { score: sy.score });
    const stillWorse = SYN_IDX.filter((i) => Math.abs(spr.weights[i] - hw[i]) > 1e-6).every((i) => { const x = Float32Array.from(spr.weights); x[i] = hw[i]; return sy.score(x) < spr.trainScore - 1e-9; });
    ok("!! PRUNE ENDS AT A FIXED POINT, AND GETS THERE IN MORE THAN ONE PASS WHEN IT HAS TO: on a score with interactions between eight weights (seed 1200: found by search, one the group test and a single one-at-a-time pass leave 3 weights on) prune ends with 2 kept in 3 passes, the score it reports is the weights' own, and putting back any ONE of the weights it kept lowers the score", spr.kept === 2 && spr.passes === 3 && spr.moved === 8 && stillWorse && spr.trainScore === sy.score(spr.weights), `kept ${spr.kept} of ${spr.moved} in ${spr.passes} passes`);
    const junk = Float32Array.from(hw); for (let k = 0; k < 300; k++) junk[600 + k] += 0.05 + 0.001 * k;
    const flat = { n: 0 }; const jr = PP.prune(junk, { score: (x) => { flat.n++; return 0; } });
    ok("!! PRUNE TESTS A BLOCK AT A TIME BEFORE IT TESTS A WEIGHT AT A TIME: 300 weights moved and none of them matters (a flat score) go back in THREE evaluations -- the starting score, the block, and the one-at-a-time loop's pass over what is left (nothing) -- not 300; the cost of a prune is what a flight over the set costs, and a search leaves a thousand weights moved", jr.kept === 0 && jr.moved >= 300 && flat.n <= 3 && jr.weights.every((v, i) => v === hw[i]), `${flat.n} evaluations for ${jr.moved} moved weights`);
    const half = Float32Array.from(hw); for (let k = 0; k < 300; k++) half[600 + k] += 0.05 + 0.001 * k; half[1100] += 1;
    const hcalls = { n: 0 }, hr = PP.prune(half, { score: (x) => { hcalls.n++; return 5 * (x[1100] - hw[1100]); } });
    ok("!! A BLOCK THAT FAILS IS HALVED, AND BOTH HALVES ARE TRIED: 300 weights that do not matter and one at the far end of the vector that does (a score of 5 x its deviation) -- the whole block fails, the first half (all harmless) goes back in ONE evaluation and the second is narrowed down to the one that matters in about two evaluations a level: under 30 evaluations in all, not 300, and the weights that matter stays", hr.kept === 1 && hr.moved === 301 && Math.abs(hr.weights[1100] - (hw[1100] + 1)) < 1e-6 && hr.weights.every((v, i) => i === 1100 || v === hw[i]) && hcalls.n <= 30, `${hcalls.n} evaluations`);
}


console.log("\n12. THE NAMED PIECES (featuresFrom, reportLines)");
{
    const st = Q.createState(model, { pos: [0, 0, 30], velocity: [2, 0, 0] }), tg = { altitude: 30 };
    const wind = [1.5, 0.5, 0], viaGuidance = PP.featuresFrom(AD.guidance(st, tg, wind, {}), st), direct = PP.features(st, tg, wind, {});
    ok("!! featuresFrom(guidance, state) IS features(state, target, wind, opts): the same twenty finite numbers whichever door the pilot comes in by", viaGuidance.length === 20 && viaGuidance.every((v, i) => v === direct[i]) && viaGuidance.every(Number.isFinite));
    const side = PP.features(Q.createState(model, { pos: [0, 0, 30], velocity: [0, 2, 0] }), tg, [0, 0, 0], {}), iF = PP.FEATURE_NAMES.indexOf("speedFwd"), iR = PP.FEATURE_NAMES.indexOf("speedRight");
    ok("!! featuresFrom reads the velocity in the BODY frame, by hand: at 2 m/s straight ahead speedFwd is 0.2 (2 / 10) and speedRight 0; at 2 m/s sideways (to the left) speedFwd is 0 and speedRight -0.2; the bias is exactly 1 and there are as many numbers as FEATURE_NAMES (the wind reaches the attitude reader only, so no feature moves with it -- said here, not hidden)", direct.length === PP.FEATURE_NAMES.length && direct[0] === 1 && Math.abs(direct[iF] - 0.2) < 1e-12 && Math.abs(direct[iR]) < 1e-12 && Math.abs(side[iF]) < 1e-12 && Math.abs(side[iR] + 0.2) < 1e-12 && PP.features(st, tg, [6, 3, 0], {}).every((v, i) => v === direct[i]));
    const L = PP.reportLines();
    ok("!! reportLines() is the module's printed report: an array of strings opening with its own name, naming the Giant Fiber Circuit as a quadrotor pilot with 20 features, 4 controls and 1167 weights", Array.isArray(L) && L.length >= 2 && L.every((l) => typeof l === "string") && L[0].startsWith("[pilotDronePolicy]") && /Giant Fiber Circuit/.test(L[0]) && /1167 weights/.test(L[0]));
}

console.log(fails ? `\npilotDronePolicy-selfcheck: ${fails} FAILED` : "\npilotDronePolicy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
