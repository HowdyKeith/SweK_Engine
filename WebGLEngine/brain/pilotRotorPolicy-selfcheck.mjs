// WebGLEngine/brain/pilotRotorPolicy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotRotorPolicy-selfcheck.mjs      (~8 s)
//
// THE SIBLING GATE OF brain/pilotRotorPolicy.mjs: the fruit-fly network as a helicopter pilot, whose hand weights are the hand pilot (brain/autopilotRotor.mjs) written through the 34 neurons of the Giant Fiber Circuit. The claim worth a gate is not "it flies" -- it is
// "the weights ARE the hand pilot", and "the network IS the circuit". Both are asked of it with an independent restatement of the network written HERE, from the topology file, with no code from the module (brain/pilotFlightPolicy-selfcheck.mjs is the aeroplane's):
//
//   1  SHAPE          20 features, 34 neurons, 313 synapses, 4 outputs, 1,167 weights, named features and outputs, zero weights all zero
//   2  THE NETWORK IS THE CIRCUIT   with the recurrent weights at zero the network is exactly two layers; with ONE recurrent weight set the output is what three relu steps through that one synapse of the real topology make it; every one of the 313 synapses
//                     is in the forward pass, wired target-first; the network re-reads a weight changed in place; a feature vector is read as finite whatever it holds; the collective is clamped to [0, 1] and the other three to [-1, 1]; layersOf (the twins' shape) is the same function
//   3  THE HAND WEIGHTS ARE THE HAND PILOT   28 non-zero weights (20 in, 8 out) in the pairs-of-channels layout, each at the value the pilot's law and the feature's scale make it; and over 2,000 random states (any attitude to 80 degrees of bank, spin, climb,
//                     rotor speed, engine in or out, a target of any of the three kinds, with and without a terrain) the network's four controls are the pilot's to 2e-7 (float32 weights)
//   4  THE FLIGHT IS THE SAME FLIGHT   over the reserve (BASELINE_SET, every kind) the hand-weights pilot flies the hand pilot's flight: the same fingerprint, the same score to 1e-9
//   5  FEATURES       on target and in trim they are exactly the trims; each of the extras moves exactly the feature the header names; every one is finite for a NaN state; a gain override reaches the weights
//   6  THE ZERO WEIGHTS fall (collective 0), noise is deterministic for a seed and scales with sigma, and a noisy pilot flies worse than the hand pilot
//   7  THE TRAINING FUNCTIONS: a sparse mutation moves one to maxK weights and is deterministic for a seed; a search never ends lower than it started on its own set and is deterministic; prune puts every weight that does not matter back to the hand pilot's
//
// NOT IN THIS GATE: the brain file's round trip through peerBrain and the roster (the helicopter page, Heli 6, brings both); the trainer (tools/ship/trainRotorPilot-selfcheck.mjs).
//
// SABOTAGE LOG: (filled in below once run)
"use strict";
import * as PP from "./pilotRotorPolicy.mjs";
import * as AR from "./autopilotRotor.mjs";
import * as RT from "./rotorTask.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as H from "../physics/mechanics/rotorcraftModel6dof.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const model = AR.defaultModel(), TRIM = AR.trimOf(model), K = AR.AUTOPILOT_ROTOR;
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KEYS = ["collective", "pitch", "roll", "yaw"];
const hand = (s, t, w, c) => AR.pilot(s, t, w, c);
const hoverAt = (extra = {}) => H.createState(model, { pos: [0, 0, 100], pitch: TRIM.pitchAttitude, bank: TRIM.bank, heading: 0, ...extra });

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
    return { collective: c(y[0], 0, 1), pitch: c(y[1], -1, 1), roll: c(y[2], -1, 1), yaw: c(y[3], -1, 1) };
}

console.log("pilotRotorPolicy-selfcheck -- the fruit fly's Giant Fiber Circuit as a helicopter pilot\n");

console.log("1. SHAPE");
{
    ok("!! 20 features, 34 neurons, 313 synapses, 4 outputs and 1,167 weights (20*34 + 34 + 313 + 34*4 + 4)", PP.FEATURES === 20 && PP.HIDDEN === 34 && PP.OUTPUTS === 4 && PP.REC_EDGES === 313 && PP.REC_STEPS === 3 && PP.WEIGHT_COUNT === 20 * 34 + 34 + 313 + 34 * 4 + 4 && PP.WEIGHT_COUNT === 1167);
    ok("the features and outputs are named, the names are unique and in the documented order", PP.FEATURE_NAMES.length === 20 && new Set(PP.FEATURE_NAMES).size === 20 && PP.FEATURE_NAMES[0] === "bias" && PP.FEATURE_NAMES[1] === "pitchTrim" && PP.FEATURE_NAMES[10] === "climbErr" && PP.FEATURE_NAMES[19] === "engineOut" && JSON.stringify(PP.OUTPUT_NAMES) === '["collective","pitch","roll","yaw"]');
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
    const chain = (ww, xx) => { const L = PP.layersOf(ww); let h = Float32Array.from(xx); for (let i = 0; i < L.length - 1; i++) h = mlpLayerCpu(L[i], h, 1); const y = mlpLayerCpu(L[L.length - 1], h, 1); const c = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v); return { collective: c(y[0], 0, 1), pitch: c(y[1], -1, 1), roll: c(y[2], -1, 1), yaw: c(y[3], -1, 1) }; };
    const twin = chain(wr, x), fast = PP.forward(wr, x), indep = refForward(wr, x);
    ok("!! forward() over the edge list is the SAME FUNCTION as layersOf(w) through mlpLayerCpu (the shape the TSL and GPU twins take) to 1e-5, and both are the independent restatement's to 1e-5 -- with random recurrent weights, so all three steps are in it", KEYS.every((k) => near(fast[k], twin[k], 1e-5) && near(fast[k], indep[k], 1e-5)) && KEYS.some((k) => !near(fast[k], PP.forward(w, x)[k], 1e-6)), KEYS.map((k) => `${f(fast[k], 4)}/${f(twin[k], 4)}/${f(indep[k], 4)}`).join(" "));
    const rec0 = 20 * 34 + 34, edge = Topo.EDGES.findIndex(([t, s]) => t === 4 && s === 2);
    const hw = PP.handWeights(), st = hoverAt({ pitch: TRIM.pitchAttitude - 0.02 }), tg = { altitude: 100, heading: 0 }, xf = PP.features(st, tg), base = PP.forward(hw, xf);   // a gentle state: the nose 0.02 rad low, so that no output sits at a clamp and the pitch channel (neuron 2) is lit
    const w2 = Float32Array.from(hw); w2[rec0 + edge] = 0.2;
    const viaNet = PP.forward(w2, xf), viaRef = refForward(w2, xf);
    ok("!! with ONE real synapse set (neuron 2 -> neuron 4, the circuit's edge #" + edge + ", weight 0.2: the pitch channel into the roll channel) the output is what three relu steps through that synapse make it, to 1e-6, and it is not the unmodified output (no output is at a clamp in this state)", edge >= 0 && KEYS.every((k) => Math.abs(base[k]) < 0.99 || k === "collective") && KEYS.every((k) => near(viaNet[k], viaRef[k], 1e-6)) && KEYS.some((k) => Math.abs(viaNet[k] - base[k]) > 1e-4), `edge ${edge}: ${KEYS.map((k) => `${f(base[k], 4)}->${f(viaNet[k], 4)}`).join(" ")}`);
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
    ok("a feature vector of all NaN or all Infinity gives finite controls in range", KEYS.every((q) => Number.isFinite(all[q]) && Number.isFinite(inf[q])) && all.collective >= 0 && all.collective <= 1);
    const big = PP.zeroWeights(); big[20 * 34 + 34 + 313 + 0] = 50; big[20 * 34 + 34 + 313 + 34 * 4 + 0] = 50; big[20 * 34 + 34 + 313 + 34 + 0] = -50; big[20 * 34 + 34 + 313 + 34 * 4 + 1] = -50; big[20 * 34 + 34 + 313 + 34 * 4 + 2] = 50; big[20 * 34 + 34 + 313 + 34 * 4 + 3] = -50;
    const cl = PP.forward(big, x0);
    ok("!! the outputs are clamped to each control's range: a raw collective of 50 reads 1 and of -50 reads 0 (collective is [0, 1]), the cyclics and the pedal read +-1 (they are [-1, 1])", cl.collective === 1 && cl.pitch === -1 && cl.roll === 1 && cl.yaw === -1 && PP.controlsOf([-50, 50, -50, 50]).collective === 0 && PP.controlsOf([-50, 50, -50, 50]).pitch === 1 && PP.controlsOf([NaN, NaN, NaN, NaN]).collective === 0);
}

console.log("\n3. THE HAND WEIGHTS ARE THE HAND PILOT");
{
    const hw = PP.handWeights(), IN = (h, q) => hw[h * 20 + q], outBase = 20 * 34 + 34 + 313, OUTW = (o, h) => hw[outBase + o * 34 + h];
    const nz = []; hw.forEach((v, i) => { if (v !== 0) nz.push(i); });
    ok("!! 28 non-zero weights: 20 in the input layer and 8 in the readout (the pairs of channels), nothing in the biases or the recurrent core", nz.length === 28 && nz.filter((i) => i < 20 * 34).length === 20 && nz.filter((i) => i >= outBase && i < outBase + 136).length === 8 && nz.every((i) => i < 20 * 34 || (i >= outBase && i < outBase + 136)), `${nz.length}`);
    const P = (o, terms) => terms.every(([q, v]) => near(IN(2 * o, q), v, 1e-6 * Math.max(1, Math.abs(v))) && near(IN(2 * o + 1, q), -v, 1e-6 * Math.max(1, Math.abs(v)))) && near(OUTW(o, 2 * o), 1) && near(OUTW(o, 2 * o + 1), -1);
    ok("!! COLLECTIVE = collectiveFF + 5 kVs climbErr (features 9 and 10: 1 and 0.6), through the pair of channels (neurons 0 and 1, read back as +1 and -1)", P(0, [[9, 1], [10, 5 * K.kVs]]));
    ok("!! PITCH = pitchTrim + 0.1 kTheta pitchErr - 0.5 kQ pitchRate (features 1, 2, 3: 1, 0.4, -0.95), neurons 2 and 3", P(1, [[1, 1], [2, 0.1 * K.kTheta], [3, -0.5 * K.kQ]]));
    ok("!! ROLL = rollTrim + 0.1 kPhi bankErr - 0.5 kP rollRate (features 4, 5, 6: 1, 0.26, -0.45), neurons 4 and 5", P(2, [[4, 1], [5, 0.1 * K.kPhi], [6, -0.5 * K.kP]]));
    ok("!! YAW = pedalFF + 0.5 kYaw (yawRateCmd - yawRate) (features 7, 8: 1, 0.7), neurons 6 and 7", P(3, [[7, 1], [8, 0.5 * K.kYaw]]));
    ok("the extras (features 11..19) have NO hand weight: the hand pilot does not read them and a search may", [11, 12, 13, 14, 15, 16, 17, 18, 19].every((q) => { for (let h = 0; h < 34; h++) if (IN(h, q) !== 0) return false; return true; }));
    ok("a gain override reaches the weights: handWeights({ kTheta: 3 }) changes only the pitch channel's pitch-error coefficient (0.3), and { kVs: 0.2 } the collective's climb-error one (1.0)", near(PP.handWeights({ kTheta: 3 })[2 * 20 + 2], 0.3, 1e-6) && near(PP.handWeights({ kVs: 0.2 })[0 * 20 + 10], 1.0, 1e-6) && PP.handWeights({ kTheta: 3 }).every((v, i) => i === 2 * 20 + 2 || i === 3 * 20 + 2 || v === hw[i]));
    // the random-state equivalence: the whole pilot, through guidance and the laws, against the network
    const r = mulberry(11), u = (lo, hi) => lo + (hi - lo) * r(), pil = PP.pilotFor(hw);
    let worst = 0, n = 0, engineOut = 0, terrain = 0, kinds = { pos: 0, velocity: 0, agl: 0, land: 0 };
    for (let i = 0; i < 2000; i++) {
        const out = r() < 0.2, withT = r() < 0.5;
        const s = H.createState(model, { pos: [u(-50, 50), u(-50, 50), u(20, 400)], pitch: u(-0.6, 0.6), bank: u(-1.4, 1.4), heading: u(-3, 3), velocity: [u(-20, 20), u(-20, 20), u(-10, 10)], w: [u(-1, 1), u(-1, 1), u(-1, 1)], omega: u(24, 34), engine: out ? "out" : "running" });
        const k = r(), tg = k < 0.4 ? { pos: [u(-300, 300), u(-300, 300)], altitude: u(50, 300), heading: u(-3, 3) } : k < 0.7 ? { velocity: [u(-15, 15), u(-15, 15)], agl: u(10, 100) } : k < 0.85 ? { altitude: s.pos[2], land: true } : { pos: [u(-100, 100), u(-100, 100)], agl: u(5, 50), speed: u(5, 20) };
        kinds[k < 0.4 ? "pos" : k < 0.7 ? "velocity" : k < 0.85 ? "land" : "agl"]++;
        const opts = withT ? { terrain: (x, y) => 30 * Math.sin(x / 80) + 20 * Math.cos(y / 60) } : {};
        const a = AR.pilot(s, tg, [0, 0, 0], opts), b = pil(s, tg, [0, 0, 0], opts);
        for (const q of KEYS) worst = Math.max(worst, Math.abs(a[q] - b[q]));
        n++; if (out) engineOut++; if (withT) terrain++;
    }
    ok("!! OVER 2,000 RANDOM STATES THE NETWORK'S FOUR CONTROLS ARE THE HAND PILOT'S to 2e-7 (float32 weights): any attitude to 80 degrees of bank, spin, climb and fall, rotor speed 24..34, the engine out in a fifth of them, four kinds of target, a terrain in half of them", worst < 2e-7 && engineOut > 300 && terrain > 900 && Object.values(kinds).every((c) => c > 150), `worst ${worst.toExponential(2)} over ${n} (${engineOut} engine-out, ${terrain} over terrain; ${JSON.stringify(kinds)})`);
}

console.log("\n4. THE FLIGHT IS THE SAME FLIGHT");
{
    const net = PP.pilotFor(PP.handWeights()), a = RT.evaluate(hand, RT.BASELINE_SET), b = RT.evaluate(net, RT.BASELINE_SET);
    ok("!! OVER THE RESERVE (every kind, 20 flights) THE HAND-WEIGHTS NETWORK FLIES THE HAND PILOT'S FLIGHT: the same fingerprint of the states, the same tick count and the score to 1e-6 (float32 weights) on every one -- not a similar score, the same flight", a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint && r.ticks === b.runs[i].ticks && near(r.score, b.runs[i].score, 1e-6)) && near(a.score, b.score, 1e-6), `${a.score.toFixed(6)} / ${b.score.toFixed(6)}; ${a.runs.filter((r, i) => r.fingerprint === b.runs[i].fingerprint).length} of ${a.runs.length} fingerprints equal`);
}

console.log("\n5. THE FEATURES ARE WHAT THE HEADER SAYS");
{
    const tg = { altitude: 100, heading: 0 }, on = PP.features(hoverAt(), tg);
    ok("!! ON TARGET AND IN TRIM the features are the trims: 1 (the bias), the hover cyclics and collective, the pedal of the hover, the hover's own bank and pitch attitude over 0.5, the height over 50 m, and every error, rate and speed at 0 (to 1e-3)", near(on[0], 1) && near(on[1], TRIM.pitch, 1e-6) && near(on[4], TRIM.roll, 1e-6) && near(on[7], TRIM.yaw, 5e-3) && near(on[9], TRIM.collective, 5e-3) && near(on[16], TRIM.bank / 0.5, 1e-6) && near(on[17], TRIM.pitchAttitude / 0.5, 1e-6) && [2, 3, 5, 6, 8, 10, 11, 13, 14, 15, 18, 19].every((q) => Math.abs(on[q]) < 1e-3) && near(on[12], (100 - TRIM.skidDrop) / 50, 1e-3), on.map((v) => f(v, 3)).join(" "));
    const pitched = PP.features(hoverAt({ pitch: TRIM.pitchAttitude + 0.05 }), tg), banked = PP.features(hoverAt({ bank: TRIM.bank + 0.05 }), tg);
    ok("!! a nose-up error of 0.05 rad moves the pitch error by -0.5 (feature 2: the error asked for less the error flown, over 0.1 rad) and the pitch extra by +0.1 (feature 17: over 0.5), and no bank, roll or yaw feature", near(pitched[2] - on[2], -0.5, 5e-3) && near(pitched[17] - on[17], 0.1, 5e-3) && [5, 6, 8, 16, 18].every((q) => Math.abs(pitched[q] - on[q]) < 5e-3));
    ok("!! a bank error of 0.05 rad moves the bank error by -0.5 (feature 5) and the bank extra by +0.1 (feature 16), and no pitch feature", near(banked[5] - on[5], -0.5, 5e-3) && near(banked[16] - on[16], 0.1, 5e-3) && [2, 3, 17].every((q) => Math.abs(banked[q] - on[q]) < 5e-3));
    const rates = PP.features(hoverAt({ w: [0.2, 0.3, 0.1] }), tg);
    const rr = H.rates(hoverAt({ w: [0.2, 0.3, 0.1] }));
    ok("!! body rates move their own features, read from the model's own rates: the pitch rate over 0.5 is feature 3, the roll rate over 0.5 is feature 6, and the yaw-rate error (feature 8: the yaw rate asked for, less the one flown, over 0.5) falls by the yaw rate over 0.5 -- for a spin the model reports as pitch " + f(rr.pitch, 3) + ", roll " + f(rr.roll, 3) + ", yaw " + f(rr.yaw, 3), near(rates[3], rr.pitch / 0.5, 1e-9) && near(rates[6], rr.roll / 0.5, 1e-9) && near(rates[8] - on[8], -rr.yaw / 0.5, 1e-6) && Math.abs(rr.pitch) > 0.05 && Math.abs(rr.roll) > 0.05 && Math.abs(rr.yaw) > 0.02);
    const climbing = PP.features(hoverAt({ velocity: [0, 0, 3] }), { altitude: 100, heading: 0 }), moving = PP.features(hoverAt({ velocity: [8, 4, 0] }), { velocity: [8, 4], altitude: 100, heading: 0 });
    ok("!! a climb of 3 m/s is feature 13 at +0.6 (over 5) and moves the climb error (feature 10: the climb asked for less the one flown); the ground speed is feature 14 along the nose and feature 15 to the right, over 10 m/s (heading 0: 8 ahead and 4 to the LEFT of the right wing = -0.4)", near(climbing[13], 0.6, 1e-6) && climbing[10] < on[10] - 0.1 && near(moving[14], 0.8, 1e-6) && near(moving[15], -0.4, 1e-6), `${f(climbing[13], 3)} / ${f(climbing[10], 3)}; ${f(moving[14], 3)} ${f(moving[15], 3)}`);
    const turned = PP.features(hoverAt({ heading: 1.0 }), { altitude: 100, heading: 0 }), spun = PP.features(hoverAt({ heading: 1.0, velocity: [8, 0, 0] }), { velocity: [8, 0], altitude: 100, heading: 1.0 });
    ok("!! the heading error is feature 18, over pi, wrapped: nose 1.0 rad right of a heading of 0 reads -1/pi; and the speed along the nose follows the HEADING (a velocity of 8 m/s along +x with the nose at 1.0 rad has 8 cos(1.0) = 4.32 ahead, so feature 14 is 0.432)", near(turned[18], -1 / Math.PI, 1e-6) && near(spun[14], 0.8 * Math.cos(1.0), 1e-6), `${f(turned[18], 4)} ${f(spun[14], 4)}`);
    const outF = PP.features(hoverAt({ engine: "out" }), tg), slow = PP.features(hoverAt({ omega: 20 }), tg), fast = PP.features(hoverAt({ omega: 36 }), tg);
    ok("!! the engine-out flag (feature 19) is 1 for an engine out and for a rotor under 80% of its speed (the low-rotor horn), 0 for a healthy one; the rotor speed error (feature 11) is the speed less the design over 3, and is clamped at +-6", outF[19] === 1 && slow[19] === 1 && on[19] === 0 && near(fast[11], (36 - model.spec.rotor.omega0) / 3, 1e-6) && near(slow[11], Math.max(-6, (20 - model.spec.rotor.omega0) / 3), 1e-6), `${outF[19]} ${slow[19]} ${on[19]} ${f(fast[11], 3)} ${f(slow[11], 3)}`);
    const over = PP.features(hoverAt({ pos: [0, 0, 100] }), tg, [0, 0, 0], { terrain: () => 40 }), highUp = PP.features(hoverAt({ pos: [0, 0, 500] }), tg), lowDown = PP.features(hoverAt({ pos: [0, 0, 1.5] }), { altitude: 1.5, heading: 0 });
    ok("!! height over the ground (feature 12, over 50 m) is over the ground the pilot is HANDED: 100 m up over a 40 m plateau reads (100 - 40 - the skids' drop) / 50, 500 m up over flat ground clamps at 4, and the skids on the ground read about 0", near(over[12], (100 - 40 - TRIM.skidDrop) / 50, 1e-3) && highUp[12] === 4 && Math.abs(lowDown[12]) < 0.1, `${f(over[12], 3)} ${highUp[12]} ${f(lowDown[12], 3)}`);
    const nanS = hoverAt(); nanS.pos = [NaN, NaN, NaN]; nanS.vel = [NaN, NaN, NaN]; nanS.q = [NaN, NaN, NaN, NaN];
    ok("!! every feature is finite for a state of NaN, and the pilot built on them returns finite controls in range", (() => { const x = PP.features(nanS, tg); const c = PP.pilotFor(PP.handWeights())(nanS, tg); return x.every(Number.isFinite) && KEYS.every((k) => Number.isFinite(c[k])); })());
    const ext = PP.features(hoverAt({ bank: 1.45, pitch: 1.1, velocity: [90, 90, 70], w: [20, 20, 20] }), tg);
    ok("!! the clamps on the extremes hold: a bank of 83 degrees, a speed of 125 m/s, rates of 20 rad/s -- no feature outside its documented range (pitch rate +-12, bank error +-16, speed +-4, climb +-6, bank +-7, pitch +-4)", Math.abs(ext[3]) <= 12 && Math.abs(ext[5]) <= 16 && Math.abs(ext[14]) <= 4 && Math.abs(ext[15]) <= 4 && Math.abs(ext[13]) <= 6 && Math.abs(ext[16]) <= 7 && Math.abs(ext[17]) <= 4 && Math.abs(ext[6]) <= 12 && Math.abs(ext[8]) <= 12 && Math.abs(ext[10]) <= 12, ext.map((v) => f(v, 2)).join(" "));
}

console.log("\n6. THE ZERO WEIGHTS AND NOISE");
{
    const zero = PP.pilotFor(PP.zeroWeights()), s = hoverAt(), c = zero(s, { altitude: 100 });
    ok("!! the zero weights output nothing: collective 0, cyclics 0, pedal 0 -- and the helicopter FALLS (a hover at 120 m with them ends 'crashed' or 'landed' well before 30 s)", KEYS.every((k) => c[k] === 0) && (() => { const r = RT.fly(zero, RT.scenario(1, "hover")); return r.status !== "airborne" && r.ticks < 1800; })());
    const a = PP.perturb(PP.handWeights(), 0.1, mulberry(5)), b = PP.perturb(PP.handWeights(), 0.1, mulberry(5)), c2 = PP.perturb(PP.handWeights(), 0.1, mulberry(6)), z = PP.perturb(PP.handWeights(), 0, mulberry(5));
    const spread = (v) => { const h = PP.handWeights(); let s2 = 0; for (let i = 0; i < v.length; i++) s2 += (v[i] - h[i]) ** 2; return Math.sqrt(s2 / v.length); };
    ok("!! noise is deterministic for a seed, different for another, absent at sigma 0, and scales with sigma: the spread of hand + noise about the hand weights is within 5% of sigma, and the copy is a new array", a.every((v, i) => v === b[i]) && a.some((v, i) => v !== c2[i]) && z.every((v, i) => v === PP.handWeights()[i]) && near(spread(a) / 0.1, 1, 0.05) && near(spread(PP.perturb(PP.handWeights(), 0.3, mulberry(5))) / 0.3, 1, 0.05) && a !== PP.handWeights(), `${(spread(a) / 0.1).toFixed(3)}`);
    const small = RT.TRAIN_SET.filter((q, i) => i % 3 === 0), hv = RT.evaluate(PP.pilotFor(PP.handWeights()), small), nv = RT.evaluate(PP.pilotFor(PP.perturb(PP.handWeights(), 0.3, mulberry(5))), small);
    ok("!! a noisy pilot flies WORSE than the hand pilot (hand + noise of 0.3 on every weight scores lower on the same flights)", nv.score < hv.score - 0.01, `${hv.score.toFixed(4)} -> ${nv.score.toFixed(4)}`);
}

console.log("\n7. THE TRAINING FUNCTIONS");
{
    const hw = PP.handWeights(), rng = mulberry(3);
    const kids = Array.from({ length: 200 }, () => PP.mutate(hw, 0.3, rng, 4)), moved = kids.map((k) => { let n = 0; for (let i = 0; i < k.length; i++) if (k[i] !== hw[i]) n++; return n; });
    ok("!! a sparse mutation moves 1 to maxK weights and no more: over 200 children with maxK 4 every child differs from its parent in 1..4 places, all four counts occur, the parent is untouched, and with maxK 1 it is always one", moved.every((n) => n >= 1 && n <= 4) && [1, 2, 3, 4].every((n) => moved.includes(n)) && PP.handWeights().every((v, i) => v === hw[i]) && Array.from({ length: 30 }, () => PP.mutate(hw, 0.3, rng, 1)).every((k) => k.reduce((n, v, i) => n + (v !== hw[i] ? 1 : 0), 0) === 1), `counts ${[1, 2, 3, 4].map((n) => moved.filter((m) => m === n).length).join("/")}`);
    ok("a mutation is deterministic for a seed and different for another, and the step is a gaussian of sigma: the mean absolute move over many children is within 20% of 0.8 sigma", JSON.stringify(Array.from(PP.mutate(hw, 0.3, mulberry(9)))) === JSON.stringify(Array.from(PP.mutate(hw, 0.3, mulberry(9)))) && JSON.stringify(Array.from(PP.mutate(hw, 0.3, mulberry(9)))) !== JSON.stringify(Array.from(PP.mutate(hw, 0.3, mulberry(10)))) && (() => { const r2 = mulberry(21); let s = 0, n = 0; for (let j = 0; j < 400; j++) { const k = PP.mutate(hw, 0.3, r2, 1); for (let i = 0; i < k.length; i++) if (k[i] !== hw[i]) { s += Math.abs(k[i] - hw[i]); n++; } } return near(s / n, 0.3 * Math.sqrt(2 / Math.PI), 0.06); })());
    const one = [RT.scenario(2, "hover"), RT.scenario(2, "terrain")];
    const t0 = PP.evaluate(hw, one).score, tr = PP.train({ seed: 4, iters: 6, sigma: 0.3, trainSet: one }), tr2 = PP.train({ seed: 4, iters: 6, sigma: 0.3, trainSet: one });
    ok("!! A SEARCH NEVER ENDS LOWER THAN IT STARTED ON ITS OWN SET, IS DETERMINISTIC FOR A SEED, AND COUNTS ITS MOVES: six iterations from the hand weights on two flights end at or above the hand score, the history opens at the hand score, improved + neutral is at most the iterations, and a second run is bit-identical", tr.trainScore >= t0 - 1e-12 && near(tr.history[0].score, t0, 1e-12) && tr.history.length >= 2 && tr.improved + tr.neutral <= 6 && tr.iters === 6 && tr.weights.every((v, i) => v === tr2.weights[i]) && tr.trainScore === tr2.trainScore, `${t0.toFixed(4)} -> ${tr.trainScore.toFixed(4)}, ${tr.improved} improved, ${tr.neutral} neutral`);
    const start = PP.perturb(hw, 0.05, mulberry(8)), tz = PP.train({ seed: 4, iters: 0, start, trainSet: one });
    ok("a search with no iterations returns its start (the hand weights by default, a given `start` otherwise) at its own score", tz.weights.every((v, i) => v === start[i]) && PP.train({ seed: 1, iters: 0, trainSet: one }).weights.every((v, i) => v === hw[i]) && near(tz.trainScore, PP.evaluate(start, one).score, 1e-12));
    // prune: a vector that is the hand weights plus weights the flights never read goes back to the hand weights exactly
    const dirty = Float32Array.from(hw), deadEdge = Topo.EDGES.findIndex(([to]) => to >= 8); dirty[16 * 20 + 5] = 0.7; dirty[12 * 20 + 19] = -0.4; dirty[20 * 34 + 34 + deadEdge] = 0.2;
    const pr = PP.prune(dirty, { trainSet: one });
    ok("!! PRUNE PUTS BACK EVERY WEIGHT THAT DOES NOT MATTER: the hand weights with three weights nothing reads (the bank error into an unused neuron, the engine-out flag into another, a synapse into a neuron the readout does not read) come back as the hand weights exactly (moved 3, kept 0), at the hand score", pr.moved === 3 && pr.kept === 0 && pr.weights.every((v, i) => v === hw[i]) && near(pr.trainScore, PP.evaluate(hw, one).score, 1e-12), `moved ${pr.moved} kept ${pr.kept}`);
    const needed = Float32Array.from(hw); needed[4 * 20 + 4] = 0.4;   // the roll channel's trim coefficient (1 -> 0.4: the hover's -0.194 of roll becomes -0.078) is read by every flight: it matters
    const pr2 = PP.prune(needed, { trainSet: one });
    ok("!! ...and KEEPS one that does: the roll channel's trim coefficient moved from 1 to 0.4 hurts, so prune leaves it (kept 1), and the result scores no worse than the input", pr2.kept === 1 && pr2.weights[84] === Float32Array.from([0.4])[0] && pr2.trainScore >= PP.evaluate(needed, one).score - 1e-12, `kept ${pr2.kept}`);
}

console.log(fails ? `\npilotRotorPolicy-selfcheck: ${fails} FAILED` : "\npilotRotorPolicy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
