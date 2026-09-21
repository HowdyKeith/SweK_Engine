#!/usr/bin/env node
// WebGLEngine/tools/ship/drivePolicy-selfcheck.mjs -- Racing city 3 (task 66)
//
// THE BRAIN THAT LEARNS TO DRIVE: brain/drivePolicy.mjs behind race-brain.html, headless on the vendored wasm and then in the browser on
// both backends. Section 1, the shape: 1396 weights split into the encoder (9 -> 46), REC_STEPS=3 weight-tied copies of the
// connectome-masked 46 -> 46 recurrent layer and the decoder (46 -> 2) mlpLayerCpu takes; the recurrent mask structural (every entry
// outside the real 842 EPG edges exactly 0) and, at Wrec=0, exactly the identity; the forward pass equal to a plain float32 relu MLP
// (encoder, 3 recurrent steps, decoder) written here; the zero policy silent; the hand policy's rule readable off its outputs
// UNCHANGED by the connectome core, AND a direct structural check that every hidden unit outside its 8 active channels stays exactly
// zero through every recurrent step (not just invisible at the outputs -- see the SABOTAGE section for why the output-only version of
// this check is not enough on its own); the features of order one at the finish line. Section 1b re-derives brain/epgTopology.mjs
// from the vendored citation on every run (neuron order, and the 842 edges as an exact SET match against the vendored file -- length
// and set-equality both, not just "same count and every entry is real", which a duplicated edge can satisfy while crowding out a
// different real one). Section 2, the baselines: the zero policy stands still on seed 1 (no lap, under a metre), the hand policy laps
// seeds 1 to 4 inside 60 s with no wheel off the asphalt -- UNCHANGED by the rewiring, since the hand policy's behavior is byte-identical
// to the old plain 9 -> 8 -> 2 net's (the identity-trick proof, measured not just asserted). Section 3, LEARNING: forty (1+1)-ES
// candidates from the hand at sigma 0.05 on the two train seeds accept several, raise the train score, cut seed 1's lap time and still
// lap the held-out seed; the same seed trains the same weights; from ZERO the search climbs over sixty iterations and does not lap,
// which is recorded, not hidden. Section 4, the auto-trainer: the store is a ratchet on the held-out score (a worse offer refused, a
// malformed one refused at the door), the audit seed is scored beside it without a vote, and regret is a number from the first attempt.
// Section 5, the race: trained, hand and zero drive one world in lockstep; the order is trained, hand, zero; a second run is the same
// fingerprint; the replay from the input log alone reaches the same fingerprint and results; two zero cars tie and the fleet
// fingerprint orders them the same way twice. Section 6, IN THE BROWSER ON BOTH BACKENDS: the same three-car race for 20 s in the
// page's wasm to node's fingerprint, and the three trucks (red, green, yellow) drawn at their poses on the track.
//
// MEASURED AT THE ROUND (the EPG rewiring, this box): the recurrent mask 0 of 1228 forbidden slots nonzero; Wrec=0 exactly the
// identity; forward equals the gate's float32 relu MLP (encoder, 3 recurrent steps, decoder); the hand policy's rule unchanged
// (steer tanh(1.5), drive tanh(0.8)) AND every hidden unit outside channels 0-7 exactly zero through all 3 recurrent steps, for a
// battery of four feature vectors; brain/epgTopology.mjs's 46 neurons and 842 edges an exact set match against the vendored file;
// the zero policy -0.00 m; the hand laps seeds 1..4 in 57.6 / 56.5 / 56.3 / 58.9 s with 0 off-asphalt samples (identical to the old
// architecture's own numbers, as the identity-trick proof requires); 40 candidates from the hand at sigma 0.05 on seeds 1 and 4 in
// 35.0 s: 4 accepted, 583 -> 750, seed 1's lap 57.6 -> 40.3 s, held-out seed 2 lapped in 37.6 s with 194 off; from zero 60 candidates
// in 38.6 s climb -0 -> 3 -> 3 -> 3 -> 5 -> 7 -> 7 monotone, no lap; two auto-trainer attempts of 12 in 17.4 s, regret 0 on both;
// machine fingerprint 0df0f92e; three cars for 60 s in 1.4 s: 375 m (56.4 s) / 377 m / 4 m (the zero car shoved by the trained car
// coming round; 0.0000 m at 20 s), order 0 > 1 > 2, fingerprint 86a4e7c1 twice and from the log alone; the tie 1 > 0 here and 0 > 1
// under fleet ffffffff (the OLD comparison fleet, deadbeef, no longer flips the order against the new 1396-float weight vectors --
// a weight vector's byte length changes its FNV hash, so that specific collision was never a property of the tie-break logic itself,
// only of the retired 98-float ones; re-measured fresh, not carried over); the browser's 20 s race f27e1428 = node's; the trucks
// 53 / 23 / 35-36 % of their windows on both backends.
//
// SABOTAGE (the EPG rewiring): A a stray nonzero recurrent-matrix entry outside the real 842 edges -> 2 red (the structural-mask
// check AND the Wrec=0-identity check, since expandRecurrent() always adds it regardless of Wrec's own content). B handWeights()
// given one nonzero recurrent weight on a REAL edge out of one of its 8 active channels (edge index 4, real synapse 7->22) -> a
// GENUINE FINDING, not a clean catch: this measurably pollutes hidden unit 22 to 5.85 over 3 recurrent steps, but the OUTPUT-ONLY
// checks stayed GREEN throughout, because (1) the h0 test point has speed=0, so channel 7 (the polluted edge's source) is silent
// for it, and (2) the h1 test point only checks a loose sign (`h1[1] < 0`), and handWeights()'s decoder has zero weight on every
// column outside channels 0-7, so a polluted unit 22 never reaches an output unless it loops back into 0-7 within REC_STEPS-1
// further hops -- which it does not here, but nothing structural guarantees that for a different edge. Picking Wrec[0] (the very
// first real edge, 28->22) ALSO went 0 red, for the same reason one level up: neither endpoint is among channels 0-7, so THAT edge
// is invisible to the hand policy's forward pass entirely, for any input. Fixed by adding a direct structural check that walks
// layersOf(hand)'s recurrent steps and asserts every unit outside 0-7 is EXACTLY zero, for a battery of inputs that activates every
// one of the 8 channels -- that check catches both. C forward() without the final tanh -> 2 red (the twin, the hand policy's rule).
// D brain/epgTopology.mjs given one duplicated real edge (crowding out a different real one, 841 of 842 entries actually distinct)
// -> ANOTHER GENUINE FINDING: the original 1b check ("same length, every Topo edge is a real one") stayed GREEN, because a duplicate
// satisfies both conditions trivially. Fixed by comparing topoEdgeSet.size (catches the duplicate directly) against both
// Topo.EDGES.length and rawEdgeSet.size -- a true three-way set-equality rather than a weaker length-plus-membership check.
// E (found by adversarial review, not this file's own author) REC_STEPS changed 3 -> 1 -> ALL 41 CHECKS STAYED GREEN, end to
// end, re-verified here before fixing: every OTHER check in section 1 reads D.REC_STEPS FROM THE MODULE UNDER TEST to build
// its own expectation (`layers.length === 2 + D.REC_STEPS`), so none of them can catch REC_STEPS itself changing; and unlike
// the mask checks, no hand-policy behavioral check can catch it either -- identity-composed-with-itself is the identity for
// ANY step count when Wrec=0, and the ES-training assertions use loose bounds a shallower-but-still-functional core also
// satisfies (in the review's run it even trained FASTER: 7 accepted vs 4). Fixed with a check against the hardcoded literal
// 3, the one place in this file a shape number is asserted without reading it back from the module it is supposed to hold
// to account.
//
// Run: node tools/ship/drivePolicy-selfcheck.mjs      (~2.1 min, measured: the ES is the cost, and the recurrent core makes each
// forward pass heavier than the old plain 9 -> 8 -> 2 net's, so this gate now runs longer than the ~0.83 min the pre-rewiring
// architecture measured)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";
import { mlpLayerCpu } from "../../render/brainTsl.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import * as Topo from "../../brain/epgTopology.mjs";
import * as C from "../../physics/raceCar.mjs";
import * as T from "../../world/raceTrack.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[GLBParser\]|\[box3d\]|\[CityGen\]/.test(String(a[0]))) log(...a); }; };
quiet();
const st = await initNode();
if (!st.ready) { console.log("  SKIP  box3d wasm: " + st.reason); console.log("\nFAIL -- the wasm is the substrate"); process.exit(1); }
const m = mod(), worldFrom = () => worldFromModule(m, [0, -9.81, 0]);
const timed = (f) => { const t0 = performance.now(); const r = f(); return { r, ms: performance.now() - t0 }; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the shape: 9 -> 46 (encoder) -> connectome-masked recurrent core -> 2 (decoder), through the GPU kernel's f32 twin, the zero and the hand");
{
    // !! REC_STEPS is checked against the HARDCODED LITERAL 3, not just internally-consistent with itself: every
    // other check in this section reads D.REC_STEPS FROM THE MODULE UNDER TEST to build its own expectation (e.g.
    // `layers.length === 2 + D.REC_STEPS` below), which can never catch REC_STEPS changing -- and unlike the mask
    // checks, no hand-policy behavioral check can catch it either, since identity-composed-with-itself is the
    // identity for ANY number of steps (relu(I@h)=h regardless of REC_STEPS when Wrec=0), and the ES-training
    // assertions use loose bounds a shallower-but-still-functional core can also satisfy. Found by adversarial
    // review: REC_STEPS=1 left every other check in this file GREEN end to end (re-verified here before fixing).
    ok("1396 weights: 9 x 46 + 46 + 842 + 46 x 2 + 2; REC_STEPS is 3", D.WEIGHT_COUNT === 1396 && D.zeroWeights().length === 1396 && D.FEATURE_NAMES.length === D.FEATURES && D.HIDDEN === 46 && D.REC_EDGES === 842 && D.REC_STEPS === 3);
    const layers = D.layersOf(D.zeroWeights());
    ok("layersOf splits them into an 9->46 relu encoder, REC_STEPS=3 weight-tied 46->46 relu recurrent layers (the SAME matrix object each time), and a 46->2 none decoder",
        layers.length === 2 + D.REC_STEPS && layers[0].nIn === 9 && layers[0].nOut === 46 && layers[0].act === "relu" && layers[0].W.length === 9 * 46 && layers[0].b.length === 46 &&
        layers.slice(1, -1).every((l) => l.nIn === 46 && l.nOut === 46 && l.act === "relu" && l.W === layers[1].W) &&
        layers[layers.length - 1].nIn === 46 && layers[layers.length - 1].nOut === 2 && layers[layers.length - 1].act === "none" && layers[layers.length - 1].W.length === 46 * 2);
    {
        const w = D.perturb(D.zeroWeights(), 0.7, () => 0.37), rec = D.layersOf(w)[1].W;
        const edgeSet = new Set(Topo.EDGES.map(([to, from]) => to * 46 + from));
        let forbidden = 0, total = 0;
        for (let to = 0; to < 46; to++) for (let from = 0; from < 46; from++) { if (to === from || edgeSet.has(to * 46 + from)) continue; total++; if (rec[to * 46 + from] !== 0) forbidden++; }
        ok("!! *** THE RECURRENT MASK IS STRUCTURAL: at large random weights, EVERY entry outside the real 842 EPG edges (plus the identity diagonal) is exactly 0 ***", forbidden === 0, `${forbidden} of ${total} forbidden slots nonzero`);
        const recZero = D.layersOf(D.zeroWeights())[1].W;
        let isIdentity = true; for (let i = 0; i < 46 * 46; i++) if (recZero[i] !== (i % 47 === 0 ? 1 : 0)) isIdentity = false;
        ok("...and with Wrec at zeroWeights()'s default (what handWeights() leaves it at), the expanded matrix is EXACTLY the identity -- nothing more, nothing less", isIdentity);
    }
    // a plain relu MLP, written here (encoder, REC_STEPS recurrent steps, decoder), against the twin
    const w = D.perturb(D.zeroWeights(), 0.7, () => 0.37), x = [1, 0.3, -0.2, 0.1, -0.4, 0.2, 0.5, -0.1, 0];
    const plain = (() => {
        const f = Math.fround, ls = D.layersOf(w);
        let h = x.slice();
        for (let li = 0; li < ls.length - 1; li++) {
            const { nIn, nOut, W, b } = ls[li], nh = [];
            for (let o = 0; o < nOut; o++) { let acc = f(b[o]); for (let k = 0; k < nIn; k++) acc = f(acc + f(f(h[k]) * f(W[o * nIn + k]))); nh.push(f(Math.max(0, acc))); }
            h = nh;
        }
        const { nIn, nOut, W, b } = ls[ls.length - 1], y = [];
        for (let o = 0; o < nOut; o++) { let acc = f(b[o]); for (let k = 0; k < nIn; k++) acc = f(acc + f(f(h[k]) * f(W[o * nIn + k]))); y.push(Math.tanh(acc)); }
        return y;
    })();
    const got = D.forward(w, x);
    ok("forward equals a plain float32 relu MLP written here (encoder, REC_STEPS recurrent steps, decoder), then tanh", near(got[0], plain[0], 1e-6) && near(got[1], plain[1], 1e-6), `${got.map((v) => v.toFixed(5))} vs ${plain.map((v) => v.toFixed(5))}`);
    ok("the zero policy answers steer 0, drive 0 to anything", D.forward(D.zeroWeights(), x).every((v) => v === 0));
    const hand = D.handWeights(), h0 = D.forward(hand, [1, 0, 0, 0, 0.5, 0, 0, 0, 0]), h1 = D.forward(hand, [1, 0.65, 0, 0, 0, 0, 1, 0, 0]);
    ok("the hand policy's rule reads off its outputs UNCHANGED BY THE CONNECTOME CORE: half a lookahead angle steers tanh(1.5), a standing car drives tanh(0.8); at 13 m/s into a full turn it brakes", near(h0[0], Math.tanh(1.5), 1e-6) && near(h0[1], Math.tanh(0.8), 1e-6) && h1[1] < 0, `${h0.map((v) => v.toFixed(3))}, drive into the turn ${h1[1].toFixed(3)}`);
    // !! *** A DIRECT STRUCTURAL CHECK, NOT JUST AN OUTPUT-VALUE ONE -- MEASURED TO MATTER, NOT ADDED ON SPEC. ***
    // A single stray recurrent weight on an edge OUT of one of the hand policy's 8 active channels (e.g. real edge 7->22)
    // measurably pollutes hidden unit 22 to 5.85 over 3 recurrent steps (found while sabotage-testing this file: Wrec[0],
    // the first real edge, happens to run 28->22 -- neither endpoint among channels 0-7 -- so THAT edge is invisible to
    // every check here; edge index 4, 7->22, IS reachable from channel 7 and DOES pollute unit 22 -- and still neither
    // h0's outputs (speed=0 in that test point, so channel 7 is silent) nor h1's loose `h1[1] < 0` sign check catch it,
    // because handWeights()'s decoder has zero weight on every column outside 0-7, so a polluted unit 22 never reaches
    // an output UNLESS it loops back into 0-7 within REC_STEPS-1 further hops -- which it does not here, but there is no
    // structural reason it couldn't for a different edge, so an output-only check is not a general guarantee). This
    // walks the SAME layers forward() does and asserts every unit outside 0-7 is EXACTLY zero at every recurrent step,
    // for both test points above plus a battery that activates every one of the 8 channels at least once.
    {
        const battery = [[1, 0, 0, 0, 0.5, 0, 0, 0, 0], [1, 0.65, 0, 0, 0, 0, 1, 0, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1], [1, -1, -1, -1, -1, -1, -1, -1, 1]];
        let dirty = null;
        for (const xb of battery) {
            const layers = D.layersOf(hand); let h = Float32Array.from(xb);
            for (let li = 0; li < layers.length - 1 && !dirty; li++) {
                h = mlpLayerCpu(layers[li], h, 1);
                for (let u = 8; u < D.HIDDEN; u++) if (h[u] !== 0) { dirty = { li, u, v: h[u], xb }; break; }
            }
        }
        ok("!! *** every hidden unit OUTSIDE the hand policy's 8 active channels is EXACTLY zero at every recurrent step, for every test input -- not just invisible at the outputs ***", dirty === null, dirty ? `layer ${dirty.li}, unit ${dirty.u} = ${dirty.v} for input ${JSON.stringify(dirty.xb)}` : "clean");
    }
    const surface = D.surfaceFor(1), cp = T.checkpoints(surface.track)[0], pose = { pos: [cp.x + 5, 2, cp.z], yaw: Math.PI / 2, speed: 0 };
    const f = D.features(surface, pose);
    ok("the features at the finish line, facing along the road: bias 1, speed 0, across 0, heading 0, on the asphalt, every one of order one", f.length === 9 && f[0] === 1 && f[1] === 0 && near(f[2], 0, 1e-6) && near(f[3], 0, 1e-6) && f[8] === 0 && f.every((v) => Math.abs(v) <= 2), f.map((v) => v.toFixed(3)).join(","));
    ok("  ...and a car pointed 45 degrees left of the road reads heading -0.5 (the road is to its right)", near(D.features(surface, { ...pose, yaw: Math.PI / 2 + Math.PI / 4 })[3], -0.5, 1e-6));
}

sec("1b. THE HIDDEN LAYER IS A REAL, CITABLE FLY CIRCUIT -- MEASURED AGAINST THE VENDORED DATA DIRECTLY, NOT A BAKED NUMBER TRUSTED ON FAITH");
{
    const raw = JSON.parse(fs.readFileSync(new URL("../../vendor/male-cns/epg-compass-circuit.json", import.meta.url), "utf8"));
    const epgNeurons = raw.neurons.filter((n) => n.type === "EPG");
    ok("!! brain/epgTopology.mjs's neuron order (the hidden-unit index <-> real bodyId mapping) matches the vendored file's own EPG-only neurons, in order",
        Topo.NEURON_ORDER.length === epgNeurons.length && Topo.NEURON_ORDER.every((id, i) => id === epgNeurons[i].bodyId));
    const idIndex = new Map(epgNeurons.map((n, i) => [n.bodyId, i]));
    const rawEdgeSet = new Set(raw.edges.filter(([from, to]) => idIndex.has(from) && idIndex.has(to)).map(([from, to]) => `${idIndex.get(to)},${idIndex.get(from)}`));
    const topoEdgeSet = new Set(Topo.EDGES.map(([to, from]) => `${to},${from}`));
    // !! Set EQUALITY, not just "same length and every Topo edge is a real one" -- that weaker check passes on a
    // DUPLICATE (one real edge counted twice, crowding out a different real edge that then has zero representation):
    // measured directly while sabotage-testing this file (one duplicated pair, 841 of 842 entries actually distinct,
    // and the weaker length+membership check stayed green throughout). topoEdgeSet.size catches the duplicate
    // directly; the two-way size comparison against rawEdgeSet then pins down "exactly the real set, no more, no less".
    ok("!! ...and its 842 edges are exactly the vendored file's own EPG-EPG edges: none dropped, none invented, none duplicated, none a self-loop, none crossing to an EPGt neuron",
        Topo.EDGES.length === topoEdgeSet.size && topoEdgeSet.size === rawEdgeSet.size && Topo.EDGES.every(([to, from]) => rawEdgeSet.has(`${to},${from}`)) && Topo.EDGES.every(([to, from]) => to !== from),
        `${Topo.EDGES.length} entries, ${topoEdgeSet.size} unique, ${rawEdgeSet.size} in the vendored file`);
    report("a hidden unit's identity and the recurrent core's shape are the fly's own measured wiring, re-derived from the vendored citation on every run rather than typed once and trusted");
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the baselines: zero stands still, the hand laps every seed");
const hand = D.handWeights();
let handLap1 = null;
{
    const z = D.episode(worldFrom, D.zeroWeights(), D.surfaceFor(1), { seconds: 45 });
    ok("*** the zero policy does not lap: no lap, under a metre of progress, every wheel on the asphalt ***", z.laps === 0 && Math.abs(z.metres) < 1 && z.off === 0, `${z.metres.toFixed(2)} m, score ${z.score.toFixed(2)}`);
    const rows = [1, 2, 3, 4].map((seed) => ({ seed, ...D.episode(worldFrom, hand, D.surfaceFor(seed), { seconds: 60 }) }));
    handLap1 = rows[0].lapTime;
    report("the hand policy: " + rows.map((r) => `seed ${r.seed} ${r.laps} lap in ${r.lapTime && r.lapTime.toFixed(1)} s, ${r.metres.toFixed(0)} m, ${r.off} off`).join("; "));
    ok("*** the hand policy laps seeds 1 to 4 inside 60 s with no wheel sample off the asphalt ***", rows.every((r) => r.laps >= 1 && r.lapTime < 60 && r.off === 0));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. LEARNING: the ES from the hand cuts the lap time and generalises; from zero it climbs and does not lap");
let trained = null;
{
    const { r, ms } = timed(() => D.train(worldFrom, { seed: 7, iters: 40, seconds: 60, start: hand, sigma: 0.05 }));
    trained = r.weights;
    const e1 = D.episode(worldFrom, trained, D.surfaceFor(1), { seconds: 60 }), e2 = D.episode(worldFrom, trained, D.surfaceFor(2), { seconds: 60 });
    report(`40 candidates from the hand at sigma 0.05 on seeds ${D.TRAIN_SEEDS.join(", ")} in ${(ms / 1000).toFixed(1)} s: ${r.accepted} accepted, score ${r.history[0].score.toFixed(0)} -> ${r.trainScore.toFixed(0)}; seed 1: ${e1.laps} laps, first in ${e1.lapTime && e1.lapTime.toFixed(1)} s (hand ${handLap1.toFixed(1)}), ${e1.off} off; held-out seed 2: ${e2.laps} laps in ${e2.lapTime && e2.lapTime.toFixed(1)} s, ${e2.off} off`);
    ok("*** the ES accepts candidates, raises the train score, and the trained policy laps seed 1 FASTER than the hand ***", r.accepted >= 3 && r.trainScore > r.history[0].score && e1.laps >= 1 && e1.lapTime < handLap1 - 5);
    ok("  ...and still laps the held-out seed it never trained on", e2.laps >= 1 && e2.lapTime < 60, `${e2.lapTime && e2.lapTime.toFixed(1)} s`);
    ok("  sigma widens on a win and narrows on a loss, staying in [0.02, 1]", r.history.every((h) => h.sigma >= 0.02 && h.sigma <= 1) && r.history.length >= 5);
    const a = D.train(worldFrom, { seed: 11, iters: 8, seconds: 30, start: hand, sigma: 0.05 }), b = D.train(worldFrom, { seed: 11, iters: 8, seconds: 30, start: hand, sigma: 0.05 });
    ok("the same seed trains the same weights (hash) and the same history", D.weightsHash(a.weights) === D.weightsHash(b.weights) && JSON.stringify(a.history) === JSON.stringify(b.history), D.weightsHash(a.weights));
    const c = D.train(worldFrom, { seed: 12, iters: 8, seconds: 30, start: hand, sigma: 0.05 });
    ok("  a different seed, different weights", D.weightsHash(c.weights) !== D.weightsHash(a.weights));
    const { r: z, ms: zms } = timed(() => D.train(worldFrom, { seed: 7, iters: 60, seconds: 45 }));
    const ze = D.episode(worldFrom, z.weights, D.surfaceFor(1), { seconds: 45 });
    report(`from ZERO, 60 candidates at sigma 0.5 in ${(zms / 1000).toFixed(1)} s: ${z.accepted} accepted, score ${z.history.map((h) => h.score.toFixed(0)).join(" -> ")}; on seed 1 ${ze.metres.toFixed(0)} m, ${ze.laps} laps, ${ze.off} off`);
    ok("from zero the search CLIMBS (the score never falls and ends above 3) and does not lap in sixty candidates -- said, not hidden: the hand start is where the ES pays", z.history.every((h, i) => i === 0 || h.score >= z.history[i - 1].score) && z.trainScore > 3 && ze.laps === 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. the auto-trainer: a ratchet on the held-out score, an audit that never votes, regret as a number");
{
    const store = D.driveStore();
    ok("an empty store holds nothing; a malformed offer is refused at the door", store.current() === null && store.offer({ weights: new Float32Array(3), score: 1 }).accepted === false && store.offer({ weights: D.zeroWeights().fill(NaN), score: 1 }).ok === false);
    const held = D.evaluate(worldFrom, hand, D.HELD_OUT_SEEDS, { seconds: 45 }).score;
    const first = store.offer({ weights: hand, score: held, by: "hand" }), worse = store.offer({ weights: D.zeroWeights(), score: held - 1, by: "zero" });
    ok("the hand is accepted into an empty store; a worse offer is refused and the hand kept", first.accepted && !worse.accepted && worse.reason === "kept the better policy" && store.current().hash === D.weightsHash(hand), `held ${held.toFixed(1)}`);
    const { r: at, ms } = timed(() => { const t = D.createAutoTrainer(worldFrom, { store, itersPerAttempt: 12, seconds: 45 }); t.attempt(1); t.attempt(2); return t; });
    const rep = at.report();
    report(`two attempts of 12 in ${(ms / 1000).toFixed(1)} s: ${JSON.stringify(at.history.map((h) => ({ held: +h.held.toFixed(1), audit: +h.audit.toFixed(1), accepted: h.accepted, regret: h.regret === null ? null : +h.regret.toFixed(2) })))}; report ${JSON.stringify({ ...rep, bestAuditEver: +rep.bestAuditEver.toFixed(1), heldAudit: +rep.heldAudit.toFixed(1), regret: +rep.regret.toFixed(2) })}`);
    ok("*** every attempt scores the held-out seed (the vote) and the audit seed (no vote), and regret is a number from the first attempt ***", at.history.length === 2 && at.history.every((h) => Number.isFinite(h.held) && Number.isFinite(h.audit) && Number.isFinite(h.regret)) && Number.isFinite(rep.regret) && rep.regret >= 0);
    ok("  the store still holds a lapping policy (the ratchet only opens upward)", store.current().score >= held);
    ok("machineFingerprint is stable across two runs of the canonical scene", D.machineFingerprint(m) === D.machineFingerprint(m), D.machineFingerprint(m));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. the race: trained, hand and zero in one world in lockstep; the fingerprint; the replay; the tie-break");
const fleet = D.machineFingerprint(m);
let race20 = null;
{
    const { r: R, ms } = timed(() => D.race(worldFrom, [trained, hand, D.zeroWeights()], { seed: 1, seconds: 60, fleet }));
    report(`three cars, 60 s, ${ms.toFixed(0)} ms: ` + R.results.map((q) => `car ${q.car} ${q.laps} laps ${q.metres.toFixed(0)} m${q.lapTime ? " first in " + q.lapTime.toFixed(1) + " s" : ""}`).join("; ") + `; order ${R.order.join(" > ")}; fingerprint ${R.fingerprint}`);
    ok("*** the order is trained, hand, zero: the learned policy beats the hand it started from, and the zero car never drives (the metres it shows are the trained car shoving it as it comes round on its second lap) ***", R.order.join() === "0,1,2" && R.results[0].laps >= 1 && R.results[2].laps === 0 && R.results[2].metres < 10);
    const R2 = D.race(worldFrom, [trained, hand, D.zeroWeights()], { seed: 1, seconds: 60, fleet });
    ok("a second run is the same fingerprint, the same results", R2.fingerprint === R.fingerprint && JSON.stringify(R2.results.map((q) => [q.laps, q.metres])) === JSON.stringify(R.results.map((q) => [q.laps, q.metres])));
    const P = D.replay(worldFrom, R);
    ok("*** the replay from the input log alone, with no policies, reaches the same fingerprint and the same results ***", P.fingerprint === R.fingerprint && JSON.stringify(P.results.map((q) => [q.laps, +q.metres.toFixed(3)])) === JSON.stringify(R.results.map((q) => [q.laps, +q.metres.toFixed(3)])) && P.order.join() === R.order.join(), P.fingerprint);
    ok("  the log holds one input per car per tick, clamped to the contract", R.log.length === R.ticks && R.log.every((row) => row.length === 3 && row.every((u) => u.steer >= -1 && u.steer <= 1 && u.throttle >= 0 && u.throttle <= 1 && u.brake >= 0 && u.brake <= 1)));
    // v_epg -- the comparison fleet is picked to actually flip the order under this policy's own (now 1396-float) weight
    // hashes: "deadbeef" happened to flip it against the OLD 98-float hand/perturbed-zero weights, but a weight vector's
    // byte length changes its FNV hash, so that specific collision was never a property of the tie-break logic itself --
    // it was a coincidence of the old weight vectors. Measured fresh against THIS shape: "ffffffff" flips it (1 > 0 here,
    // 0 > 1 there); "deadbeef" no longer does. Re-measure this constant again if WEIGHT_COUNT ever changes again.
    const tie = D.race(worldFrom, [D.zeroWeights(), D.perturb(D.zeroWeights(), 1e-7, () => 0.5)], { seed: 1, seconds: 3, fleet }), tie2 = D.race(worldFrom, [D.zeroWeights(), D.perturb(D.zeroWeights(), 1e-7, () => 0.5)], { seed: 1, seconds: 3, fleet: "ffffffff" });
    ok("two cars that tie (both still) are ordered by the fleet fingerprint folded with their policy hashes -- deterministic, and fleet ffffffff orders them the other way round from this machine's fleet (measured: 1 > 0 here, 0 > 1 there)", tie.order.length === 2 && tie.order.join() === D.race(worldFrom, [D.zeroWeights(), D.perturb(D.zeroWeights(), 1e-7, () => 0.5)], { seed: 1, seconds: 3, fleet }).order.join() && tie.order.join() !== tie2.order.join(), `fleet ${fleet}: ${tie.order.join(" > ")}; fleet ffffffff: ${tie2.order.join(" > ")}`);
    race20 = D.race(worldFrom, [trained, hand, D.zeroWeights()], { seed: 1, seconds: 20, fleet });
    ok("  before anyone comes round (20 s) the zero car has not moved a tenth of a metre", race20.results[2].laps === 0 && race20.results[2].metres < 0.1, `${race20.results[2].metres.toFixed(4)} m`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. IN THE BROWSER ON BOTH BACKENDS: the same three-car race to node's fingerprint, the three trucks at their poses");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 400, H = 400, FOV = 0.9, eye = [0, 120, 0.5], target = [0, 0, 0];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target, trained: Array.from(trained), hand: Array.from(hand), fleet }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const K = await import("/world/kenneyKit.mjs");
            const T = await import("/world/raceTrack.mjs");
            const C = await import("/physics/raceCar.mjs");
            const D = await import("/brain/drivePolicy.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const { CityGen } = await import("/world/CityGen.js");
            const { box3d } = await import("/physics/box3d/box3dLoader.js");
            const { worldFromModule } = await import("/render/slugTicker.mjs");
            const { W, H, FOV, eye, target } = a; const out = {};
            const ps = await box3d.init(); if (!ps.ready) return { error: "box3d: " + ps.reason };
            const worldFrom = () => worldFromModule(box3d._mod, [0, -9.81, 0]);
            const t0 = performance.now(), R = D.race(worldFrom, [Float32Array.from(a.trained), Float32Array.from(a.hand), D.zeroWeights()], { seed: 1, seconds: 20, fleet: a.fleet }), raceMs = performance.now() - t0;
            const readBytes = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); return r.arrayBuffer(); };
            const readImage = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" }); const oc = new OffscreenCanvas(bmp.width, bmp.height), ctx = oc.getContext("2d"); ctx.drawImage(bmp, 0, 0); return K.imageToColormap(ctx.getImageData(0, 0, bmp.width, bmp.height)); };
            const kit = await K.loadKit("racing", { readBytes, readImage, baseUrlOf: (p) => new URL("/" + p, location.href).href });
            const track = T.generateTrack({ seed: 1 }), placements = T.tilePlacements(track), world = V.miniWorld(); T.trackWorld(track, world, CityGen); const packed = V.meshWorld(world);
            const files = ["vehicle-truck-red.glb", "vehicle-truck-green.glb", "vehicle-truck-yellow.glb"], trucks = R.results.map((q, i) => ({ file: files[i], ...C.truckPlacement(q.pose) }));
            const cam = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 800), G.lookAt(eye, target)), eye };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const sc = K.kitScene(dev, kit, [...placements, ...trucks], G, L, { light: V.SUN, extraFleets: [{ name: "world", mesh: packed.mesh, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(V.SUN), records: Float32Array.from([0, 0, 0, 1]), extras: new Float32Array(4) }] });
                const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                out[backend] = { path: sc.path, errs, pixels: Array.from(f.pixels) };
                sc.destroy(); dev.destroy();
            }
            return { ...out, fingerprint: R.fingerprint, order: R.order, results: R.results.map((q) => ({ laps: q.laps, metres: q.metres, pos: q.pose.pos })), raceMs, failed: kit.failed };
        }` });
        ok("the browser ran the race on its wasm and drew the trucks on both backends", r.ok && r.result && !r.result.error && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.error || ((r.result.webgpu && r.result.webgpu.errs) || []).join(" | ")).slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result && r.result.webgpu && r.result.webgl2) {
            const R = r.result, N = W * H;
            report(`the browser raced 20 s in ${R.raceMs.toFixed(0)} ms: fingerprint ${R.fingerprint} (node ${race20.fingerprint}), order ${R.order.join(" > ")}`);
            ok("*** the browser's 20 s race is node's: the same fingerprint, the same order, the same results ***", R.fingerprint === race20.fingerprint && R.order.join() === race20.order.join() && R.results.every((q, i) => q.laps === race20.results[i].laps && near(q.metres, race20.results[i].metres, 1e-3)));
            const vp = G.multiply(G.perspective(FOV, W / H, 0.5, 800), G.lookAt(eye, target));
            const project = (p) => { const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15]; return [Math.round((x / w * 0.5 + 0.5) * W), Math.round((1 - (y / w * 0.5 + 0.5)) * H)]; };
            const window_ = (px, cx, cy, half) => { const o = []; for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) if (x >= 0 && y >= 0 && x < W && y < H) { const i = (y * W + x) * 4; o.push([px[i], px[i + 1], px[i + 2]]); } return o; };
            const hues = [(c) => c[0] > c[1] * 1.6 && c[0] > c[2] * 1.6 && c[0] > 90, (c) => c[1] > c[0] * 1.5 && c[1] > c[2] * 1.1 && c[1] > 90, (c) => c[0] > 150 && c[1] > 110 && c[2] < c[1] * 0.6];
            const apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            for (const bk of ["webgpu", "webgl2"]) {
                const shares = R.results.map((q, i) => { const [cx, cy] = project([q.pos[0], 1, q.pos[2]]); const w = window_(R[bk].pixels, cx, cy, 4); return w.filter(hues[i]).length / Math.max(1, w.length); });
                ok(`${bk}: the red, green and yellow trucks are drawn at their cars' poses (${shares.map((v) => (v * 100).toFixed(0) + " %").join(", ")} of a 9 x 9 window in each hue)`, shares.every((v) => v > 0.1), R[bk].path);
            }
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(R.webgpu.pixels, R.webgl2.pixels) < N * 0.03, `${apart(R.webgpu.pixels, R.webgl2.pixels)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the policy's forward pass ON THE DEVICE (brain/mlp.js's BatchedMLP; the twin it is held to here is the CPU one the kernels gate holds bit for bit); a brain that laps from ZERO (sixty candidates climb and do not lap; the idle trainer's longer run is race-brain.html's, unmeasured beyond what section 3 records); cars that see each other (the features carry no other car); the page's idle loop (eyeballed).");
process.exit(fails ? 1 : 0);
