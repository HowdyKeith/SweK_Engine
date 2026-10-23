// WebGLEngine/brain/pilotSubFish-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotSubFish-selfcheck.mjs      (~25 s)
//
// THE SIBLING GATE OF brain/pilotSubFish.mjs AND brain/zebrafishTopology.mjs: the Fish1 core as the submarine's pilot, and the random control of its size. brain/pilotSubPolicy-selfcheck.mjs holds createSubPolicy() itself for the fly
// and for a synthetic ring; this gate asks the same questions of THE FISH, with the circuit restated here from the vendored data and not from the module that was baked from it, so that a network that quietly used another circuit,
// or an edge the data does not have, or the control standing in for the fish, is caught:
//
//   1  SHAPE          14 features, 34 neurons, 153 synapses, 4 outputs, 803 weights, for the fish and for the control; the zero weights output nothing
//   2  THE CIRCUIT IS THE FISH'S   the topology is the vendored JSON's, neuron by neuron and edge by edge, restated here (the ids in ascending order, each edge [to, from] by index, none twice, none a self-loop, every weight a positive whole
//                     number of synapses); the recurrent matrix the network builds has a non-zero exactly at the identity and at those edges; the totals the PROVENANCE file quotes (153 edges, 308 synapses, 26 reciprocal, the labels) are true
//   3  THE FORWARD PASS   with the recurrent weights at zero it is two layers; it is the layersOf() chain through mlpLayerCpu to 1e-5; it is an independent three-step restatement over the fish's own edge list to 1e-5 (so a network that quietly
//                     takes two steps, or reads another circuit, is caught); outputs clamp and a non-finite feature reads 0
//   4  THE HAND WEIGHTS ARE THE AUTOPILOT   26 non-zero weights, the recurrent core zero; over 1,500 random states the fish's and the control's controls are autopilotSub.decide()'s to 1e-5 AND each other's (all the circuits START as one pilot); a whole dive
//   5  THE CONTROL    34 neurons and 153 edges, none a self-loop or a repeat, deterministic for its seed and different for another, NOT the fish's edges (17 of 153 coincide, a random pair's expectation is 20), pinned by a hash; a request for more edges
//                     than fit is refused by name
//   6  TRAINING       a short search on the fish is deterministic for a seed, never lowers its score on its own set, and its reported score is its weights'
//   (the module is imported AFTER an exit handler is registered, so that a module which ended the process on import cannot end the gate green; run as a command it prints its four report lines)
//
// SABOTAGE LOG (22 mutants of brain/pilotSubFish.mjs, 12 of the baked brain/zebrafishTopology.mjs, 9 of vendor/zebrafish/fish1-ten-core.json; each run alone against this gate, or against tools/fishCircuit-selfcheck.mjs where said, in a scratch tree):
//   the control generator P01-P11, P20-P22 (ignores its seed, a self-loop, a repeated edge, colliding edge keys, one edge too few or too many, the refusal off by one, the control labelled with real-looking ids, the edges not
//   frozen, the seed constant or the default seed changed, the seed plus one, the edges drawn [from, to], the neurons drawn from the first n - 1) -- red by name, EXCEPT P04 and P22, which make the generator unable to finish the
//   5-neuron complete digraph the gate asks for and HANG: killed by the gate's own time limit, red as a gate that never ends and not by a row name (they were TIMEOUT at 900 s and again at 45 s);
//   the circuits P12-P16 (the fish built on another circuit, THE CONTROL BUILT ON THE FISH'S -- 0 red until the row that restates the control network's recurrent matrix from the control's own edges, the report leaving
//   out the control, the fish named for the fly, the control named for the fish); the command block P17-P19 (exits 1, runs on import -- red because the gate registers an exit handler BEFORE importing the module, so a
//   module that ends the process on import ends the gate RED and not green with half its rows unprinted, prints nothing).
//   the baked topology Z01-Z09 (first neuron id, two ids exchanged, a neuron dropped, an edge flipped, dropped, duplicated, a self-loop, retargeted, two edges exchanged) -- red here, and all twelve Z01-Z12 red in
//   tools/fishCircuit-selfcheck.mjs's re-bake row, which is the one that sees Z10-Z12 (the dataset line, a type, an instance name): THIS GATE DOES NOT READ THEM and says so;
//   the vendored JSON V01-V09: V01 (a weight), V06 (the selection record), V07 (rows dropped), V08 (the edge count field), V02-V04 are red here; V05 (a licence line that names CC-BY) and V09 (the CAVE host as the
//   server) are red in tools/fishCircuit-selfcheck.mjs and 0 red HERE, because the claims about the licence and the host are that gate's; V01, V07, V08 are 0 red there for the mirror reason.
//   EVERY MUTANT IS RED IN AT LEAST ONE OF THE TWO GATES, and none is equivalent.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as PS from "./pilotSubPolicy.mjs";
import * as ZF from "./zebrafishTopology.mjs";
import * as A from "./autopilotSub.mjs";
import * as T from "./subTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
// brain/pilotSubFish.mjs is imported AFTER this handler: a module that called process.exit() on import (its command-line block run unguarded) would end the gate green with half its rows unprinted
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED: something it imported, or the gate itself, called process.exit()"); process.exitCode = 1; } });
const PF = await import("./pilotSubFish.mjs");
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const KEYS = ["pitch", "yaw", "thrust", "ballast"], near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const attempt = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
const J = JSON.parse(fs.readFileSync(path.join(ENG, "vendor", "zebrafish", "fish1-ten-core.json"), "utf8"));
const FISH = PF.FISH, CONTROL = PF.CONTROL, N = 34, E = 153, W = 14 * N + N + E + N * 4 + 4, R0 = 14 * N + N;

console.log("pilotSubFish-selfcheck -- the Fish1 core, and a random circuit of its size, as submarine pilots\n");

console.log("1. SHAPE");
{
    ok("!! 14 features, 34 neurons, 153 synapses, 4 outputs, 803 weights (14 x 34 + 34 + 153 + 34 x 4 + 4) -- for the fish AND for the control", [FISH, CONTROL].every((P) => P.FEATURES === 14 && P.HIDDEN === N && P.REC_EDGES === E && P.OUTPUTS === 4 && P.WEIGHT_COUNT === W) && W === 803, `${FISH.WEIGHT_COUNT} / ${CONTROL.WEIGHT_COUNT}`);
    ok("the fish is a different network from the fly's (963 weights, 313 synapses) and from the control (the same shape, other edges)", FISH.WEIGHT_COUNT !== PS.FLY.WEIGHT_COUNT && FISH.REC_EDGES !== PS.FLY.REC_EDGES && JSON.stringify(ZF.EDGES) !== JSON.stringify(PF.CONTROL_TOPOLOGY.EDGES));
    const z = FISH.forward(FISH.zeroWeights(), new Array(14).fill(1));
    ok("the zero weights are all zero (803 of them, a fresh array each time) and output exactly zero for any features", FISH.zeroWeights().length === 803 && FISH.zeroWeights().every((v) => v === 0) && FISH.zeroWeights() !== FISH.zeroWeights() && KEYS.every((k) => z[k] === 0));
}

console.log("\n2. THE CIRCUIT IS THE FISH'S");
{
    const ids = J.neurons.map((n) => n.bodyId), idx = new Map(ids.map((id, i) => [id, i])), pairs = J.edges.map(([a, b]) => [idx.get(b), idx.get(a)]);   // [toIdx, fromIdx]
    ok("!! THE TOPOLOGY IS THE VENDORED DATA'S, restated here: 34 neuron ids in ascending order, each the module's NEURON_ORDER entry; each of the 153 edges [to, from] by index in the file's own order, none a self-loop, none twice, every weight a positive whole number of synapses",
        ids.length === 34 && ids.every((id, i) => i === 0 || id > ids[i - 1]) && ZF.NEURON_ORDER.length === 34 && ZF.NEURON_ORDER.every((id, i) => id === ids[i]) && pairs.length === 153 && ZF.EDGES.length === 153 && ZF.EDGES.every((e, i) => e[0] === pairs[i][0] && e[1] === pairs[i][1])
        && pairs.every(([t, f]) => t !== f && t >= 0 && f >= 0) && new Set(pairs.map((p) => p.join())).size === 153 && J.edges.every((e) => Number.isInteger(e[2]) && e[2] >= 1));
    ok("!! THE TOTALS THE PROVENANCE FILE QUOTES ARE TRUE of the vendored data: 153 edges, 308 synapses, 26 of the directed edges reciprocal, and the labels 22 DMV inputs, 7 DMV, 1 TEN class II, 1 TEN class IV, 3 unlabelled; the selection record says 1,105 neurons, 3,519 pairs, 83,323 rows read, 103 dropped, k 34, minimum volume 5,000,000",
        J.neuronCount === 34 && J.edgeCount === 153 && J.edges.reduce((a, e) => a + e[2], 0) === 308 && J.edges.filter(([a, b]) => J.edges.some((e) => e[0] === b && e[1] === a)).length === 26
        && (() => { const c = J.neurons.reduce((o, n) => (o[n.type] = (o[n.type] || 0) + 1, o), {}); return Object.keys(c).length === 5 && c["DMV-input"] === 22 && c.DMV === 7 && c["TEN-II"] === 1 && c["TEN-IV"] === 1 && c.unlabelled === 3; })() && J.selection.neuronsInSet === 1105 && J.selection.pairsInSet === 3519 && J.selection.rowsRead === 83323 && J.selection.rowsDropped === 103 && J.selection.k === 34 && J.selection.minVolume === 5000000);
    const w = Float32Array.from({ length: W }, (_, i) => (i >= R0 && i < R0 + E ? 0.37 : 0)), L = FISH.layersOf(w), rec = L[1].W;
    const want = new Set(ZF.EDGES.map(([t, f]) => t * N + f)); for (let i = 0; i < N; i++) want.add(i * N + i);
    let exact = true; for (let t = 0; t < N; t++) for (let f = 0; f < N; f++) { const nz = rec[t * N + f] !== 0; if (nz !== want.has(t * N + f)) exact = false; }
    ok("!! THE RECURRENT MATRIX THE NETWORK BUILDS HAS A NON-ZERO EXACTLY AT THE IDENTITY AND AT THE 153 EDGES (187 of 1,156 entries: 34 on the diagonal, 153 edges): every other weight between two neurons is permanently zero, and the edge [to, from] puts its weight at row `to`, column `from`", exact && want.size === 187 && L.length === 5 && L.slice(1, 4).every((l) => l.W === rec), `${want.size} entries`);
    const wc = Float32Array.from({ length: W }, (_, i) => (i >= R0 && i < R0 + E ? 0.37 : 0)), Lc = CONTROL.layersOf(wc), recC = Lc[1].W, wantC = new Set(PF.CONTROL_TOPOLOGY.EDGES.map(([t, f]) => t * N + f)); for (let i = 0; i < N; i++) wantC.add(i * N + i);
    let exactC = true, sameAsFish = 0; for (let t = 0; t < N; t++) for (let f = 0; f < N; f++) { const nz = recC[t * N + f] !== 0; if (nz !== wantC.has(t * N + f)) exactC = false; if (nz && rec[t * N + f] !== 0 && t !== f) sameAsFish++; }
    ok("!! THE CONTROL NETWORK'S RECURRENT MATRIX IS THE CONTROL'S: a non-zero exactly at the identity and at ITS 153 edges (not the fish's -- only the coinciding edges, 17, are non-zero in both), so the network that is trained as 'the control' is the random circuit and not a second copy of the fish", exactC && wantC.size === 187 && sameAsFish === 17, `${sameAsFish} edges in both`);
    ok("the fish's and the control's neuron ids are told apart: the real ones are Fish1 ids (over 10 billion), the control's are the labels 9000..9033 that no real neuron has", ZF.NEURON_ORDER.every((id) => id > 1e9) && PF.CONTROL_TOPOLOGY.NEURON_ORDER.every((id, i) => id === 9000 + i));
}

console.log("\n3. THE FORWARD PASS");
{
    const r = rnd(5), w = Float32Array.from({ length: W }, () => (r() - 0.5) * 0.8), x = Array.from({ length: 14 }, () => (r() - 0.5) * 2);
    const wz = Float32Array.from(w); for (let k = 0; k < E; k++) wz[R0 + k] = 0;
    const two = (ww, xx) => { const h = []; for (let j = 0; j < N; j++) { let sum = ww[14 * N + j]; for (let f = 0; f < 14; f++) sum += ww[j * 14 + f] * xx[f]; h.push(Math.max(0, sum)); } const o = R0 + E, y = []; for (let k = 0; k < 4; k++) { let sum = ww[o + N * 4 + k]; for (let j = 0; j < N; j++) sum += ww[o + k * N + j] * h[j]; y.push(Math.max(-1, Math.min(1, sum))); } return y; };
    const f0 = FISH.forward(wz, x), t0 = two(wz, x);
    ok("!! with the recurrent weights at zero the network is exactly two layers, relu(W1 x + b1) then W2 h + b2: equal to a hand-written two-layer net to 1e-6", KEYS.every((k, i) => near(f0[k], t0[i], 1e-6)), KEYS.map((k, i) => `${f0[k].toFixed(5)}/${t0[i].toFixed(5)}`).join(" "));
    const chain = (ww, xx) => { const L = FISH.layersOf(ww); let h = Float32Array.from(xx); for (let i = 0; i < L.length - 1; i++) h = mlpLayerCpu(L[i], h, 1); const y = mlpLayerCpu(L[L.length - 1], h, 1); return KEYS.map((_, i) => Math.max(-1, Math.min(1, y[i]))); };
    const indep = (ww, xx) => {
        let h = []; for (let j = 0; j < N; j++) { let sum = ww[14 * N + j]; for (let f = 0; f < 14; f++) sum += ww[j * 14 + f] * xx[f]; h.push(Math.max(0, sum)); }
        for (let step = 0; step < 3; step++) { const n = h.slice(); J.edges.forEach(([from, to], k) => { n[J.neurons.findIndex((q) => q.bodyId === to)] += ww[R0 + k] * h[J.neurons.findIndex((q) => q.bodyId === from)]; }); h = n.map((v) => Math.max(0, v)); }
        const o = R0 + E; return KEYS.map((_, k) => { let sum = ww[o + N * 4 + k]; for (let j = 0; j < N; j++) sum += ww[o + k * N + j] * h[j]; return Math.max(-1, Math.min(1, sum)); });
    };
    const fast = FISH.forward(w, x), twin = chain(w, x), ind = indep(w, x);
    ok("!! forward() is the layersOf() chain through mlpLayerCpu (the shape the TSL and GPU twins take) to 1e-5 AND an independent restatement's -- three recurrent steps over the FISH'S OWN edge list, read from the vendored JSON, with plain arrays -- to 1e-5, with random recurrent weights so the recurrence is in it",
        KEYS.every((k, i) => near(fast[k], twin[i], 1e-5) && near(fast[k], ind[i], 1e-5)) && Math.abs(fast.pitch - f0.pitch) + Math.abs(fast.yaw - f0.yaw) + Math.abs(fast.thrust - f0.thrust) > 1e-3 && FISH.REC_STEPS === 3, KEYS.map((k, i) => `${fast[k].toFixed(5)}/${ind[i].toFixed(5)}`).join(" "));
    const big = FISH.forward(Float32Array.from({ length: W }, () => 50), new Array(14).fill(3)), nf = FISH.forward(w, x.map((v, i) => (i % 3 === 0 ? NaN : v)));
    ok("the outputs are clamped to [-1, 1] (huge weights), and a non-finite feature is read as 0 (the output is finite and equals the same call with that feature 0)", KEYS.every((k) => Math.abs(big[k]) <= 1) && KEYS.every((k) => Number.isFinite(nf[k]) && near(nf[k], FISH.forward(w, x.map((v, i) => (i % 3 === 0 ? 0 : v)))[k], 1e-12)));
}

console.log("\n4. THE HAND WEIGHTS ARE THE AUTOPILOT");
{
    const wf = FISH.handWeights(), wc = CONTROL.handWeights();
    ok("!! 26 non-zero weights (18 in, 8 out) in the pairs-of-channels layout, the recurrent core all zero, the biases all zero -- for the fish and for the control", [wf, wc].every((w) => w.length === W && w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0) === 26 && w.subarray(14 * N, 14 * N + N).every((v) => v === 0) && w.subarray(R0, R0 + E).every((v) => v === 0) && w.subarray(R0 + E + N * 4).every((v) => v === 0)));
    const r = rnd(11), u = (lo, hi) => lo + (hi - lo) * r(); let mxA = 0, mxC = 0, mxFly = 0;
    for (let i = 0; i < 1500; i++) {
        const st = S.createState({ depth: u(10, 40), speed: u(0.8, 4), heading: u(-3, 3), pitch: u(-0.5, 0.5), bank: u(-0.6, 0.6), gamma: u(-0.3, 0.3), w: [u(-0.1, 0.1), u(-0.1, 0.1), u(-0.1, 0.1)] }), tg = { depth: u(14, 40), heading: u(-3, 3), speed: u(1.5, 3.5) }, cv = [u(-0.5, 0.5), u(-0.5, 0.5), u(-0.1, 0.1)];
        const a = A.decide(st, tg, cv), b = FISH.pilotFor(wf)(st, tg, cv), c = CONTROL.pilotFor(wc)(st, tg, cv), fl = PS.FLY.pilotFor(PS.FLY.handWeights())(st, tg, cv);
        for (const k of KEYS) { mxA = Math.max(mxA, Math.abs(a[k] - b[k])); mxC = Math.max(mxC, Math.abs(a[k] - c[k])); mxFly = Math.max(mxFly, Math.abs(fl[k] - b[k])); }
    }
    ok("!! over 1,500 random states, targets and currents the FISH'S controls equal autopilotSub.decide() to 1e-5, the control's do too, and the fly's: all three circuits START as one pilot", mxA < 1e-5 && mxC < 1e-5 && mxFly < 1e-5, `max |diff| ${mxA.toExponential(2)} / ${mxC.toExponential(2)} / ${mxFly.toExponential(2)}`);
    const sc = T.scenario(14, "current"), fa = T.fly(A.pilot(), sc), fn = T.fly(FISH.pilotFor(wf), sc);
    ok("!! a whole dive is the autopilot's dive: the same score to 1e-6 on a current scenario and on HELD_OUT_SET (30 dives), for the fish", Math.abs(fa.score - fn.score) < 1e-6 && Math.abs(T.evaluate(A.pilot(), T.HELD_OUT_SET).score - FISH.evaluate(wf, T.HELD_OUT_SET).score) < 1e-6, `${fa.score.toFixed(6)} vs ${fn.score.toFixed(6)}`);
}

console.log("\n5. THE CONTROL");
{
    const CT = PF.CONTROL_TOPOLOGY, keys = CT.EDGES.map((e) => e.join(","));
    ok("!! 34 neurons and 153 edges (the fish's counts), every edge inside the 34, none a self-loop, none twice, the topology frozen", CT.NEURON_ORDER.length === 34 && CT.EDGES.length === 153 && CT.EDGES.every(([t, f]) => t >= 0 && t < 34 && f >= 0 && f < 34 && t !== f) && new Set(keys).size === 153 && Object.isFrozen(CT) && Object.isFrozen(CT.EDGES));
    const hashOf = (edges) => { let h = 2166136261; for (const [a, b] of edges) { h ^= a * 64 + b; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
    const again = PF.controlTopology(ZF, PF.CONTROL_SEED), other = PF.controlTopology(ZF, PF.CONTROL_SEED + 1);
    ok("!! it is DETERMINISTIC for its seed (4242: the same 153 edges, pinned by a hash, bfae5aaa) and DIFFERENT for another seed, and it asks for the fish's counts whatever the fish's edges are", PF.CONTROL_SEED === 4242 && hashOf(CT.EDGES) === "bfae5aaa" && JSON.stringify(again.EDGES) === JSON.stringify(CT.EDGES) && JSON.stringify(other.EDGES) !== JSON.stringify(CT.EDGES) && other.EDGES.length === 153 && PF.controlTopology({ NEURON_ORDER: new Array(12).fill(0), EDGES: new Array(20).fill([0, 1]) }, 3).EDGES.length === 20, hashOf(CT.EDGES));
    ok("a call without a seed uses the control seed (so the control in the tree is the one anybody gets by asking for 'the control')", JSON.stringify(PF.controlTopology(ZF).EDGES) === JSON.stringify(CT.EDGES));
    const fish = new Set(ZF.EDGES.map((e) => e.join(","))), shared = keys.filter((k) => fish.has(k)).length;
    ok("!! IT IS NOT THE FISH'S WIRING: 17 of its 153 edges are also the fish's (a random pair of such circuits shares about 20), so the control asks whether ANY sparse core of this size does what the real one does, and the answer is not built in", shared === 17 && shared < 40, `${shared} shared`);
    const err = (fn) => { try { fn(); return ""; } catch (e) { return String(e.message); } };
    ok("a request for more edges than fit among the neurons (n x (n - 1) + 1) is refused by name, and the largest that fits is made (a complete digraph on 5 neurons)", /do not fit/.test(err(() => PF.controlTopology({ NEURON_ORDER: new Array(5).fill(0), EDGES: new Array(21).fill([0, 1]) }))) && PF.controlTopology({ NEURON_ORDER: new Array(5).fill(0), EDGES: new Array(20).fill([0, 1]) }).EDGES.length === 20);
    const cli = spawnSync(process.execPath, [path.join(ENG, "brain", "pilotSubFish.mjs")], { encoding: "utf8", timeout: 60000 });
    ok("run as a command the module prints its four report lines and exits 0 (and importing it, as this gate does, prints nothing and exits nothing)", cli.status === 0 && cli.stdout.trim().split("\n").length === 4 && /Fish1 TEN-analysis core/.test(cli.stdout) && /random circuit/.test(cli.stdout), cli.stdout.trim().split("\n").length + " lines");
    ok("reportLines() names both networks, their neurons and synapses and the 803 weights", PF.reportLines().length === 4 && PF.reportLines().every((l) => typeof l === "string") && /Fish1 TEN-analysis core \(34 neurons, 153 synapses\)/.test(PF.reportLines()[0]) && /random circuit/.test(PF.reportLines()[2]) && /803 weights/.test(PF.reportLines()[0]));
}

console.log("\n6. TRAINING");
{
    const set = T.TRAIN_SET.filter((s, i) => i % 5 === 0), a = FISH.train({ seed: 3, iters: 4, trainSet: set }), b = FISH.train({ seed: 3, iters: 4, trainSet: set }), c = FISH.train({ seed: 4, iters: 4, trainSet: set });
    ok("!! train() on the fish is deterministic for a seed, differs for another seed, and its reported score is the score of the weights it returns", a.trainScore === b.trainScore && a.weights.length === 803 && a.weights.every((v, i) => v === b.weights[i]) && !a.weights.every((v, i) => v === c.weights[i]) && Math.abs(FISH.evaluate(a.weights, set).score - a.trainScore) < 1e-12, `${a.trainScore.toFixed(5)}`);
    const h0 = FISH.evaluate(FISH.handWeights(), set).score;
    ok("!! it starts from the hand weights and NEVER lowers the score: at least the hand weights' on the set it trained on, history[0] is that score", a.trainScore >= h0 - 1e-12 && Math.abs(a.history[0].score - h0) < 1e-12, `${h0.toFixed(5)} -> ${a.trainScore.toFixed(5)}`);
    const moved = FISH.mutate(FISH.handWeights(), 0.3, rnd(9), 4), n = moved.reduce((k, v, i) => k + (v !== FISH.handWeights()[i] ? 1 : 0), 0);
    ok("a mutation moves one to four of the 803 weights and a recurrent weight is among the places it can land (over 400 children, some land in the recurrent block [510-663) and none outside the vector)", n >= 1 && n <= 4 && (() => { const r2 = rnd(21); let hit = 0; for (let i = 0; i < 400; i++) { const m = FISH.mutate(FISH.handWeights(), 0.3, r2, 4), h = FISH.handWeights(); for (let q = R0; q < R0 + E; q++) if (m[q] !== h[q]) hit++; } return hit > 20; })());
}

finished = true;
console.log(fails ? `\npilotSubFish-selfcheck: ${fails} FAILED` : "\npilotSubFish-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
