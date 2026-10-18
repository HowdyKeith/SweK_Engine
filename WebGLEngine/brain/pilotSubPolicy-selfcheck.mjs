// WebGLEngine/brain/pilotSubPolicy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotSubPolicy-selfcheck.mjs      (~25 s)
//
// THE CONNECTOME-WIRED SUBMARINE PILOT: "THE WEIGHTS ARE THE AUTOPILOT" AND "THE NETWORK IS THE CIRCUIT" -- AND THE CIRCUIT IS A PARAMETER. brain/pilotSubPolicy.mjs is brain/pilotFlightPolicy.mjs with the topology passed in;
// this gate asks of it what the flight gate asks of that, with an independent restatement of the network written HERE, and one thing more: that a SECOND circuit (a synthetic ring) makes the same pilot, which is what lets
// a fish connectome be swapped in with no other change.
//
//   1  SHAPE          14 features, 34 neurons, 313 synapses, 4 outputs, 963 weights; named features and outputs; zero weights output zero
//   2  THE CIRCUIT    with the recurrent weights at zero the network is two layers; with ONE recurrent weight set, the change reaches exactly the neurons that synapse reaches (target first, source second, as gfcTopology says);
//                     forward() over the edge list equals layersOf(w) through mlpLayerCpu to 1e-5 and an independent restatement to 1e-5, with random weights; outputs are clamped to [-1, 1]; a non-finite feature is read as 0
//   3  THE HAND WEIGHTS ARE THE AUTOPILOT   26 non-zero weights in the pairs-of-channels layout; over 1,500 random states the network's controls equal autopilotSub.decide() to 1e-5; a whole dive is the autopilot's dive (the
//                     same score on HELD_OUT_SET to 1e-6, and the same fingerprint on a scenario)
//   4  THE CIRCUIT IS A PARAMETER   createSubPolicy refuses a circuit with fewer than 8 neurons and an edge outside it, by name; a synthetic 12-neuron ring gives the same shape rules (12 x 14 + 12 + 12 + 48 + 4 weights), the
//                     same hand-weight pilot (the dive is the autopilot's), and a recurrent weight on ITS edges reaches its neurons and no others
//   5  TRAINING       train() is deterministic for a seed, never lowers the train score it reports, starts from the hand weights, and a short search on a few scenarios improves them; mutate() moves 1..maxK weights;
//                     prune() never lowers the train score and reverts what it can
//
// SABOTAGE LOG -- SEVENTEEN, each applied to brain/pilotSubPolicy.mjs in place, the gate run, the file restored; every one red by name (the number is how many rows went red):
//   P1 output clamp removed 4 | P2 a non-finite feature not read as 0 1 | P3 the recurrent identity dropped 7 | P4 the edge direction swapped 3 | P5 two recurrent steps, not three 1 | P6 the ballast channel's sign 3
//   P7 the pitch channel's scale 4 | P8 the gain schedule dropped from a feature 3 | P9 train never accepts an improvement 2 | P10 train starts from zero weights 2 | P11 mutate moves 20 weights 2
//   P12 a dangling edge allowed 1 | P13 a circuit under 8 neurons allowed 1 | P14 prune reports moved as kept 1 | P15 train accepts a worse child 2 | P16 the hand weights' thrust trim dropped 4
//   P17 the default circuit swapped for 12 of its neurons 7
// P5 went 0 red the first time: forward() and layersOf() read the same REC_STEPS, so a network that quietly takes two steps agreed with itself. The independent three-step restatement (written here, plain arrays) holds
// it. A sabotage of prune that loops forever (restoring a weight it had counted as reverted) HUNG the gate at the 300 s cap: caught by the cap, not by a row, and so replaced by P14.
"use strict";
import * as P from "./pilotSubPolicy.mjs";
import * as A from "./autopilotSub.mjs";
import * as T from "./subTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as Topo from "./gfcTopology.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const KEYS = ["pitch", "yaw", "thrust", "ballast"], near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

console.log("pilotSubPolicy-selfcheck -- a connectome-wired submarine pilot\n");

console.log("1. SHAPE");
{
    ok("!! 14 features, 34 neurons, 313 synapses, 4 outputs, 963 weights (14 x 34 + 34 + 313 + 34 x 4 + 4)", P.FEATURES === 14 && P.HIDDEN === 34 && P.REC_EDGES === 313 && P.OUTPUTS === 4 && P.WEIGHT_COUNT === 963 && P.FEATURES * P.HIDDEN + P.HIDDEN + P.REC_EDGES + P.HIDDEN * P.OUTPUTS + P.OUTPUTS === 963, `${P.WEIGHT_COUNT}`);
    ok("the features and outputs are named, in the order the header gives, and frozen", P.FEATURE_NAMES.length === 14 && P.OUTPUT_NAMES.join() === "pitch,yaw,thrust,ballast" && P.FEATURE_NAMES[0] === "bias" && P.FEATURE_NAMES[8] === "depthErr" && Object.isFrozen(P.FEATURE_NAMES) && Object.isFrozen(P.OUTPUT_NAMES));
    const z = P.forward(P.zeroWeights(), new Array(14).fill(1));
    ok("the zero weights are all zero and output exactly zero for any features", P.zeroWeights().every((v) => v === 0) && P.zeroWeights().length === 963 && KEYS.every((k) => z[k] === 0));
}

console.log("\n2. THE CIRCUIT");
{
    const r = rnd(5), w = Float32Array.from({ length: P.WEIGHT_COUNT }, () => (r() - 0.5) * 0.8), x = Array.from({ length: 14 }, () => (r() - 0.5) * 2), R0 = 14 * 34 + 34;
    const wz = Float32Array.from(w); for (let k = 0; k < P.REC_EDGES; k++) wz[R0 + k] = 0;
    const two = (ww, xx) => { const h = []; for (let j = 0; j < 34; j++) { let sum = ww[14 * 34 + j]; for (let f = 0; f < 14; f++) sum += ww[j * 14 + f] * xx[f]; h.push(Math.max(0, sum)); } const o = R0 + 313, y = []; for (let k = 0; k < 4; k++) { let sum = ww[o + 34 * 4 + k]; for (let j = 0; j < 34; j++) sum += ww[o + k * 34 + j] * h[j]; y.push(Math.max(-1, Math.min(1, sum))); } return y; };
    const f0 = P.forward(wz, x), t0 = two(wz, x);
    ok("!! with the recurrent weights at zero the network is exactly two layers, relu(W1 x + b1) then W2 h + b2 (the recurrent core is an identity): equal to a hand-written two-layer net to 1e-6", KEYS.every((k, i) => near(f0[k], t0[i], 1e-6)), KEYS.map((k, i) => `${f0[k].toFixed(5)}/${t0[i].toFixed(5)}`).join(" "));
    const [to, from] = Topo.EDGES[0], w1 = Float32Array.from(wz); w1[R0] = 2.5;
    const hid = (ww) => { const L = P.layersOf(ww); let h = Float32Array.from(x); for (let i = 0; i < L.length - 1; i++) h = mlpLayerCpu(L[i], h, 1); return h; };
    const hz = hid(wz), h1 = hid(w1), changed = []; for (let j = 0; j < 34; j++) if (Math.abs(h1[j] - hz[j]) > 1e-6) changed.push(j);
    ok("!! ONE recurrent weight (edge 0) changes only the hidden units that synapse can reach: its target, and whatever the target feeds through the other (zero) edges -- here exactly the target (the others are zero), target first, source second", changed.length <= 1 && (changed.length === 0 ? Math.abs(hz[from]) < 1e-9 : changed[0] === to), `edge [${to}, ${from}] changed ${JSON.stringify(changed)}; source activity ${hz[from].toFixed(4)}`);
    const chain = (ww, xx) => { const L = P.layersOf(ww); let h = Float32Array.from(xx); for (let i = 0; i < L.length - 1; i++) h = mlpLayerCpu(L[i], h, 1); const y = mlpLayerCpu(L[L.length - 1], h, 1); const c = (v) => Math.max(-1, Math.min(1, v)); return KEYS.map((_, i) => c(y[i])); };
    const fast = P.forward(w, x), twin = chain(w, x);
    ok("!! forward() over the circuit's edge list is the SAME FUNCTION as layersOf(w) through mlpLayerCpu (the shape the TSL and GPU twins take) to 1e-5, with random recurrent weights so all three steps are in it", KEYS.every((k, i) => near(fast[k], twin[i], 1e-5)) && Math.abs(fast.pitch - f0.pitch) + Math.abs(fast.yaw - f0.yaw) + Math.abs(fast.thrust - f0.thrust) > 1e-3, KEYS.map((k, i) => `${fast[k].toFixed(5)}/${twin[i].toFixed(5)}`).join(" "));
    // an independent restatement: THREE recurrent steps over the circuit's own edge list, written here with plain arrays (not the module's typed ones, not layersOf)
    const indep = (ww, xx) => {
        let h = []; for (let j = 0; j < 34; j++) { let sum = ww[14 * 34 + j]; for (let f = 0; f < 14; f++) sum += ww[j * 14 + f] * xx[f]; h.push(Math.max(0, sum)); }
        for (let step = 0; step < 3; step++) { const n = h.slice(); Topo.EDGES.forEach(([to, from], k) => { n[to] += ww[R0 + k] * h[from]; }); h = n.map((v) => Math.max(0, v)); }
        const o = R0 + 313; return KEYS.map((_, k) => { let sum = ww[o + 34 * 4 + k]; for (let j = 0; j < 34; j++) sum += ww[o + k * 34 + j] * h[j]; return Math.max(-1, Math.min(1, sum)); });
    };
    const ind = indep(w, x);
    ok("!! and both are an INDEPENDENT restatement's to 1e-5 -- three recurrent steps (REC_STEPS is 3), written here over the edge list with plain arrays, so a network that quietly takes two is caught", P.FEATURES === 14 && KEYS.every((k, i) => near(fast[k], ind[i], 1e-5)) && Object.keys(P).includes("FLY") && P.FLY.REC_STEPS === 3, KEYS.map((k, i) => `${fast[k].toFixed(5)}/${ind[i].toFixed(5)}`).join(" "));
    const big = P.forward(Float32Array.from({ length: P.WEIGHT_COUNT }, () => 50), new Array(14).fill(3)), nf = P.forward(w, x.map((v, i) => (i % 3 === 0 ? NaN : v)));
    ok("the outputs are clamped to [-1, 1] (huge weights), and a non-finite feature is read as 0 (the output is finite and equals the same call with that feature 0)", KEYS.every((k) => Math.abs(big[k]) <= 1) && KEYS.every((k) => Number.isFinite(nf[k])) && KEYS.every((k) => near(nf[k], P.forward(w, x.map((v, i) => (i % 3 === 0 ? 0 : v)))[k], 1e-12)));
}

console.log("\n3. THE HAND WEIGHTS ARE THE AUTOPILOT");
{
    const w = P.handWeights(), R0 = 14 * 34 + 34;
    ok("!! 26 non-zero weights (18 in, 8 out) in the pairs-of-channels layout, the recurrent core all zero, the biases all zero", w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0) === 26 && w.subarray(14 * 34, 14 * 34 + 34).every((v) => v === 0) && w.subarray(R0, R0 + 313).every((v) => v === 0) && w.subarray(R0 + 313 + 34 * 4).every((v) => v === 0), `${w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)}`);
    const r = rnd(11), u = (lo, hi) => lo + (hi - lo) * r(); let mx = 0;
    for (let i = 0; i < 1500; i++) {
        const st = S.createState({ depth: u(10, 40), speed: u(0.8, 4), heading: u(-3, 3), pitch: u(-0.5, 0.5), bank: u(-0.6, 0.6), gamma: u(-0.3, 0.3), w: [u(-0.1, 0.1), u(-0.1, 0.1), u(-0.1, 0.1)] }), tg = { depth: u(14, 40), heading: u(-3, 3), speed: u(1.5, 3.5) }, cv = [u(-0.5, 0.5), u(-0.5, 0.5), u(-0.1, 0.1)];
        const a = A.decide(st, tg, cv), b = P.pilotFor(w)(st, tg, cv); for (const k of KEYS) mx = Math.max(mx, Math.abs(a[k] - b[k]));
    }
    ok("!! over 1,500 random states, targets and currents the network's controls equal autopilotSub.decide() to 1e-5 (the hand weights are the autopilot, to float32)", mx < 1e-5, `max |diff| ${mx.toExponential(3)}`);
    const sc = T.scenario(14, "current"), fa = T.fly(A.pilot(), sc), fn = T.fly(P.pilotFor(w), sc);
    ok("!! a whole dive is the autopilot's dive: the same score to 1e-6 on a current scenario, and on HELD_OUT_SET (30 dives) to 1e-6", Math.abs(fa.score - fn.score) < 1e-6 && Math.abs(T.evaluate(A.pilot(), T.HELD_OUT_SET).score - P.evaluate(w, T.HELD_OUT_SET).score) < 1e-6, `${fa.score.toFixed(6)} vs ${fn.score.toFixed(6)}`);
    const moved = P.handWeights({ kTheta: 10 });
    ok("handWeights(gains) follows the gains it is given (kTheta 10 changes the pitch channel, and only it) and the defaults are AUTOPILOT_SUB's", moved[0 * 14 + 2] !== w[0 * 14 + 2] && moved[0 * 14 + 2] === Math.fround(0.3 * 10) && moved[2 * 14 + 2] === w[2 * 14 + 2] && w[0 * 14 + 2] === Math.fround(0.3 * A.AUTOPILOT_SUB.kTheta));
}

console.log("\n4. THE CIRCUIT IS A PARAMETER");
{
    const err = (topo) => { try { P.createSubPolicy(topo); return null; } catch (e) { return e.message; } };
    ok("!! a circuit of fewer than 8 neurons is refused (the hand weights need a relu pair per output), and an edge outside the circuit is refused, both by name", /at least 8/.test(err({ NEURON_ORDER: [1, 2, 3], EDGES: [] }) || "") && /outside/.test(err({ NEURON_ORDER: Array.from({ length: 12 }, (_, i) => i), EDGES: [[0, 12]] }) || ""));
    const N = 12, ring = { NEURON_ORDER: Array.from({ length: N }, (_, i) => 9000 + i), EDGES: Array.from({ length: N }, (_, i) => [(i + 1) % N, i]) }, R = P.createSubPolicy(ring, "a synthetic ring");
    ok("!! a synthetic 12-neuron ring has the shape the rules give: 14 x 12 + 12 + 12 + 12 x 4 + 4 = 244 weights, 12 hidden, 12 synapses", R.HIDDEN === 12 && R.REC_EDGES === 12 && R.WEIGHT_COUNT === 14 * 12 + 12 + 12 + 48 + 4 && R.WEIGHT_COUNT === 244, `${R.WEIGHT_COUNT}`);
    const wr = R.handWeights(), sc = T.scenario(5, "recovery");
    ok("!! and its hand-weight pilot IS the autopilot: the dive is the same to 1e-6 (the circuit does not know it is a ring or a fly -- this is the seam a fish connectome plugs into)", Math.abs(T.fly(R.pilotFor(wr), sc).score - T.fly(A.pilot(), sc).score) < 1e-6);
    const x = Array.from({ length: 14 }, (_, i) => (i === 2 ? 1.5 : 0)), w1 = Float32Array.from(wr), R0r = 14 * 12 + 12; const base = R.forward(wr, x);
    w1[R0r + 0] = 3;   // ring edge 0 is [1, 0]: neuron 0 (the pitch channel's +z unit, active at feature 2 = 1.5) feeds neuron 1 (its -z twin, silent in the hand weights)
    const mod = R.forward(w1, x), w2 = Float32Array.from(wr); w2[R0r + 6] = 3;   // ring edge 6 is [7, 6]: neuron 6 is the ballast channel's +z unit, silent at this input
    ok("!! a recurrent weight on one of the ring's OWN edges is a real parameter: edge 0 (neuron 0 -> 1, both in the pitch channel and active) changes the pitch, and edge 6 (a silent source) changes nothing", Math.abs(mod.pitch - base.pitch) > 0.05 && KEYS.every((k) => Number.isFinite(mod[k])) && KEYS.every((k) => R.forward(w2, x)[k] === base[k]), `pitch ${base.pitch.toFixed(4)} -> ${mod.pitch.toFixed(4)}`);
}

console.log("\n5. TRAINING");
{
    const set = T.TRAIN_SET.filter((s, i) => i % 5 === 0), a = P.train({ seed: 3, iters: 4, trainSet: set }), b = P.train({ seed: 3, iters: 4, trainSet: set }), c = P.train({ seed: 4, iters: 4, trainSet: set });
    ok("!! train() is deterministic for a seed (same weights, same score), differs for another seed, and its reported score is the score of the weights it returns", a.trainScore === b.trainScore && a.weights.every((v, i) => v === b.weights[i]) && !a.weights.every((v, i) => v === c.weights[i]) && Math.abs(P.evaluate(a.weights, set).score - a.trainScore) < 1e-12, `${a.trainScore.toFixed(5)}`);
    const h0 = P.evaluate(P.handWeights(), set).score;
    ok("!! it starts from the hand weights and NEVER lowers the score: the result is at least the hand weights' on the set it trained on, history[0] is that score, and the history never falls", a.trainScore >= h0 - 1e-12 && Math.abs(a.history[0].score - h0) < 1e-12 && a.history.every((h, i) => i === 0 || h.score >= a.history[i - 1].score - 1e-12), `${h0.toFixed(5)} -> ${a.trainScore.toFixed(5)}`);
    const r = rnd(2), w = P.handWeights(); let moved = true; for (let i = 0; i < 40; i++) { const m = P.mutate(w, 0.3, r, 4); const n = m.reduce((c2, v, j) => c2 + (v !== w[j] ? 1 : 0), 0); if (n < 1 || n > 4) moved = false; }
    ok("mutate() moves between 1 and maxK weights (40 draws) and leaves the original alone", moved && w.every((v, i) => v === P.handWeights()[i]));
    const g = P.train({ seed: 7, iters: 12, sigma: 0.3, trainSet: set });
    ok("!! a short search improves on the hand weights: 12 iterations on 8 scenarios find a better pilot (the loop is not a no-op)", g.trainScore > h0 + 1e-4 && g.improved >= 1, `${h0.toFixed(5)} -> ${g.trainScore.toFixed(5)} (${g.improved} improved)`);
    const pr = P.prune(g.weights, { trainSet: set });
    ok("prune() never lowers the train score and never keeps more changed weights than it was given", pr.trainScore >= g.trainScore - 1e-9 && pr.kept <= pr.moved, `moved ${pr.moved} kept ${pr.kept}`);
    const rl = P.reportLines();
    ok("the report says real numbers and names the circuit: 34 neurons, 313 synapses, 963 weights", rl.length === 2 && rl.every((l) => !/NaN|undefined/.test(l)) && /34 neurons/.test(rl[0]) && /963 weights/.test(rl[0]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
