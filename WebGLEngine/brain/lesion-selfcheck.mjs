// WebGLEngine/brain/lesion-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/lesion-selfcheck.mjs      (about 5-10 s: hand fixtures and a few short real tank flights)
//
// THE GATE OF brain/lesion.mjs (backlog item `lesion-toggle`, brain/BACKLOG_2026-11-04_BRAINS.md).
//   1 CLASSES   the fly's and the fish's classes by type and by instance, as the baked topologies say; refusals for a bad `by` and a topology without labels.
//   2 EXACT     a lesioned weight vector flies EXACTLY the pilot whose silenced neurons are forced to 0 at every step (an independent forward with a mask, this gate's own), on both circuits, random weights and inputs; outgoing
//               weights are left, the input is not mutated, silencing nothing is the identity, and bad indices or lengths are refused.
//   3 INERT     the hand weights' inert neurons are exactly those outside the hand channels; a bias > 0, an input weight, or an edge from a live neuron makes a neuron live, and an edge from an inert one does not.
//   4 RANDOM    the random sets: the class's size, distinct from it and from each other, deterministic for a seed, MATCHED on the hand-channel count (and the unmatched draw is not), refused when the circuit cannot supply them.
//   5 ARMS      ids, layer, controls, the base's register carried, entry() flying the lesioned weights, the lesion record; an unknown class or a base without entry() refused.
//   6 READING   costs, rank p and the words on a synthetic task: MORE THAN EVERY, NO MORE THAN ANY, "more than k of the", ties counted against the class; a class lesion whose intact arm was not flown; no random draws.
//   7 REAL      on the switchboard's dropout task: a lesion of the hand weights' inert neurons flies the hand network seed for seed; a lesion of one hand channel moves it.
//   8 SOURCE    no clock, random number or file; the header names the backlog item and the confound.
// NOT CHECKED, said plainly: whether any class matters (that is the experiment); the page.
// SABOTAGE LOG: see the end of brain/LESION_TOGGLE_WIP.md (each mutant of brain/lesion.mjs alone in a scratch copy).
"use strict";
import { pathToFileURL } from "node:url";   // a dynamic import of a filesystem path must be a file URL: new URL("file://" + "C:\\...") crashes on Windows (tools/ship/windowsImport-selfcheck.mjs)
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const LESION_URL = process.env.LESION_UNDER_TEST ? pathToFileURL(process.env.LESION_UNDER_TEST) : new URL("./lesion.mjs", import.meta.url);
const L = await import(LESION_URL.href);
import * as P from "./pilotSubPolicy.mjs";
import * as PF from "./pilotSubFish.mjs";
import * as G from "./gfcTopology.mjs";
import * as Z from "./zebrafishTopology.mjs";
import * as B from "./switchboard.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(LESION_URL, "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), head = src.split("\n").filter((l) => /^\s*\/\//.test(l)).join("\n");
console.log("lesion-selfcheck -- the lesion toggle\n");
const rngOf = (s) => P.mulberry(s);

sec("1. CLASSES");
{
    const g = L.classesOf(G).classes;
    ok("!! the fly's types are the baked ones: GFC2 = 0-9, GFC1 = 10-12, GFC4 = 17 18 28-33, GFC3 the other 13", J(g.GFC2) === J([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) && J(g.GFC1) === J([10, 11, 12]) && J(g.GFC4) === J([17, 18, 28, 29, 30, 31, 32, 33]) && g.GFC3.length === 13 && Object.keys(g).length === 4, J(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.length]))));
    const gi = L.classesOf(G, "instance").classes;
    ok("!! by instance the fly's GFC2 splits L 0 1 4 5 7 and R 2 3 6 8 9 (NEURON_INSTANCES), eight instances in all", J(gi.GFC2_L) === J([0, 1, 4, 5, 7]) && J(gi.GFC2_R) === J([2, 3, 6, 8, 9]) && Object.keys(gi).length === 8);
    const z = L.classesOf(Z).classes;
    ok("!! the fish's types: DMV-input 22, DMV 7, unlabelled 3, TEN-II [18], TEN-IV [32]", z["DMV-input"].length === 22 && z.DMV.length === 7 && z.unlabelled.length === 3 && J(z["TEN-II"]) === "[18]" && J(z["TEN-IV"]) === "[32]");
    ok("!! every neuron is in exactly one class", [G, Z].every((t) => Object.values(L.classesOf(t).classes).flat().sort((a, b) => a - b).join() === Array.from({ length: t.NEURON_ORDER.length }, (_, i) => i).join()));
    ok("!! labels of the wrong length are refused", /has no NEURON_TYPES of its neurons' length/.test(thr(() => L.classesOf({ NEURON_ORDER: [1, 2], NEURON_TYPES: ["a"], EDGES: [] }))));
    ok("!! a bad `by` and a topology without labels are refused by name", /by must be "type" or "instance"/.test(thr(() => L.classesOf(G, "side"))) && /has no NEURON_TYPES/.test(thr(() => L.classesOf({ NEURON_ORDER: [1, 2], EDGES: [] }))) && /has no NEURON_INSTANCES/.test(thr(() => L.classesOf({ NEURON_ORDER: [1], NEURON_TYPES: ["a"], EDGES: [] }, "instance"))));
}

// This gate's own forward of a createSubPolicy pilot with a mask of silenced neurons forced to 0 after the input layer and after every recurrent step: what "silenced" MEANS, written apart from the library.
function maskedForward(topo, w, x, dead) {
    const H = topo.NEURON_ORDER.length, F = P.FEATURES, R = topo.EDGES.length, REC = F * H + H, W2 = REC + R, B2 = W2 + H * P.OUTPUTS;
    let h = new Float64Array(H);
    for (let j = 0; j < H; j++) { let s = w[F * H + j]; for (let f = 0; f < F; f++) s += w[j * F + f] * x[f]; h[j] = dead.has(j) ? 0 : Math.max(0, s); }
    for (let st = 0; st < P.REC_STEPS; st++) { const n = Float64Array.from(h); topo.EDGES.forEach(([to, from], k) => { n[to] += w[REC + k] * h[from]; }); for (let j = 0; j < H; j++) n[j] = dead.has(j) ? 0 : Math.max(0, n[j]); h = n; }
    const y = []; for (let o = 0; o < P.OUTPUTS; o++) { let s = w[B2 + o]; for (let j = 0; j < H; j++) s += w[W2 + o * H + j] * h[j]; y.push(Math.max(-1, Math.min(1, s))); }
    return y;
}
sec("2. EXACT");
{
    let worst = 0, cases = 0, moved = 0;
    for (const [topo, pol] of [[G, P.FLY], [Z, PF.FISH]]) for (let s = 1; s <= 12; s++) {
        const r = rngOf(100 + s), w = Array.from({ length: pol.WEIGHT_COUNT }, () => (r() - 0.5) * 1.2), k = 1 + Math.floor(r() * 9);
        const dead = [...new Set(Array.from({ length: k }, () => Math.floor(r() * pol.HIDDEN)))], lw = L.lesionWeights(topo, w, dead);
        for (let t = 0; t < 6; t++) {
            const x = Array.from({ length: P.FEATURES }, () => (r() - 0.5) * 3), a = pol.forward(Float32Array.from(lw), x), b = maskedForward(topo, Float32Array.from(w), x, new Set(dead));
            const intact = pol.forward(Float32Array.from(w), x), d = Math.max(...["pitch", "yaw", "thrust", "ballast"].map((c, o) => Math.abs(a[c] - b[o])));
            worst = Math.max(worst, d); cases++; if (["pitch", "yaw", "thrust", "ballast"].some((c) => Math.abs(intact[c] - a[c]) > 1e-6)) moved++;
        }
    }
    ok("!! a lesioned vector flies exactly the masked pilot (this gate's own forward) on both circuits: 144 random weight vectors x inputs, worst difference under 1e-5", worst < 1e-5 && cases === 144, `worst ${worst.toExponential(2)}`);
    ok("!! and the lesion is not a no-op on those cases (most outputs move from the intact pilot)", moved > 100, `${moved} of ${cases} moved`);
    const r = rngOf(7), w = Array.from({ length: P.FLY.WEIGHT_COUNT }, () => r() - 0.5), copy = [...w], lw = L.lesionWeights(G, w, [3, 20]);
    const H = 34, F = P.FEATURES, REC = F * H + H, W2 = REC + G.EDGES.length;
    ok("!! only the silenced neurons' input rows, biases and incoming edges change; outgoing weights, other rows and the output bias are left; the input array is not mutated", J(w) === J(copy) && lw.length === w.length && lw.every((v, i) => {
        const row = i < F * H ? Math.floor(i / F) : i < REC ? i - F * H : -1, edge = i >= REC && i < W2 ? G.EDGES[i - REC] : null;
        const hit = (row === 3 || row === 20) || (edge && (edge[0] === 3 || edge[0] === 20));
        return hit ? v === 0 : v === w[i];
    }) && G.EDGES.some(([to]) => to === 3 || to === 20) && lw.slice(W2).every((v, i) => v === w[W2 + i]));
    ok("!! silencing nothing is the identity (same values, a fresh array)", (() => { const o = L.lesionWeights(G, w, []); return o !== w && J(o) === J(w); })());
    ok("!! refused: a wrong weight count, an index outside the circuit, a non-integer, a repeat, a non-list", /takes 963 weights, got 962/.test(thr(() => L.lesionWeights(G, w.slice(1), [0]))) && /neuron 34 is not one of the circuit's 34/.test(thr(() => L.lesionWeights(G, w, [34]))) && /neuron 1.5/.test(thr(() => L.lesionWeights(G, w, [1.5]))) && /named twice/.test(thr(() => L.lesionWeights(G, w, [2, 2]))) && /list of indices/.test(thr(() => L.lesionWeights(G, w, 2))) && /neuron -1/.test(thr(() => L.lesionWeights(G, w, [-1]))));
}

sec("3. INERT");
{
    const hw = Array.from(P.FLY.handWeights());
    ok("!! the hand weights' inert neurons are exactly 8-33 (everything outside the eight hand channels)", J(L.inertOf(G, hw)) === J(Array.from({ length: 26 }, (_, i) => i + 8)), J(L.inertOf(G, hw)));
    ok("!! HAND_CHANNELS is 0..7 (a relu pair per output)", J(L.HAND_CHANNELS) === J([0, 1, 2, 3, 4, 5, 6, 7]));
    const F = P.FEATURES, H = 34, REC = F * H + H, w1 = [...hw]; w1[F * H + 20] = 0.5;
    const w2 = [...hw]; w2[25 * F + 3] = -0.2;
    const w3 = [...hw], k3 = G.EDGES.findIndex(([to, from]) => from < 8 && to >= 8); w3[REC + k3] = 0.3;
    const w4 = [...hw], k4 = G.EDGES.findIndex(([to, from]) => from >= 8 && to >= 8 && from !== to); w4[REC + k4] = 0.3;
    const w5 = [...hw]; w5[F * H + 20] = -0.5;
    ok("!! a positive bias makes a neuron live; a negative bias alone does not", !L.inertOf(G, w1).includes(20) && L.inertOf(G, w5).includes(20));
    ok("!! a non-zero input weight (either sign) makes a neuron live", !L.inertOf(G, w2).includes(25));
    ok("!! an edge from a live neuron makes its target live; an edge from an inert neuron does not", !L.inertOf(G, w3).includes(G.EDGES[k3][0]) && J(L.inertOf(G, w4)) === J(L.inertOf(G, hw)), `edges ${J(G.EDGES[k3])} ${J(G.EDGES[k4])}`);
    // A chain live -> a -> b whose SECOND edge comes EARLIER in the edge list, so one pass in edge order cannot reach b: only a fixed point does.
    let chain = null;
    G.EDGES.forEach(([a, from], k1) => { if (chain || from >= 8 || a < 8) return; const k2 = G.EDGES.findIndex(([b, f2], k) => k < k1 && f2 === a && b >= 8 && b !== a); if (k2 >= 0) chain = [k1, k2]; });
    if (chain) { const w6 = [...hw]; w6[REC + chain[0]] = 0.3; w6[REC + chain[1]] = 0.4; ok("!! liveness carries along a chain to a fixed point: live -> a -> b makes b live even when the a -> b edge comes first in the list", !L.inertOf(G, w6).includes(G.EDGES[chain[1]][0]), J(chain.map((k) => G.EDGES[k]))); }
    else ok("!! a chain with its second edge first exists in the fly's circuit for the fixed-point row", false);
    ok("!! a wrong length is refused", /takes 963 weights/.test(thr(() => L.inertOf(G, hw.slice(2)))));
}

sec("4. RANDOM");
{
    const g = L.classesOf(G).classes, s = L.randomSets(G, g.GFC2, { count: 6, seed: 9 });
    ok("!! six sets the size of GFC2 (10), each sorted and of distinct neurons, distinct from GFC2 and from each other", s.length === 6 && s.every((x) => x.length === 10 && new Set(x).size === 10 && x.join() === [...x].sort((a, b) => a - b).join() && x.join() !== g.GFC2.join()) && new Set(s.map((x) => x.join())).size === 6);
    ok("!! MATCHED: each holds exactly as many hand channels as the class (GFC2 has all 8; GFC1 has 0; a class of [0, 20] has 1)", s.every((x) => x.filter((j) => j < 8).length === 8) && L.randomSets(G, g.GFC1, { count: 5, seed: 2 }).every((x) => x.every((j) => j >= 8)) && L.randomSets(G, [0, 20], { count: 5, seed: 2 }).every((x) => x.filter((j) => j < 8).length === 1));
    const u = L.randomSets(G, g.GFC2, { count: 20, seed: 9, matched: false });
    ok("!! the unmatched draw is not matched: among 20 sets of 10 some hold fewer than 8 hand channels", u.some((x) => x.filter((j) => j < 8).length < 8) && u.every((x) => x.length === 10));
    ok("!! deterministic for a seed, different for another", J(L.randomSets(G, g.GFC3, { count: 4, seed: 5 })) === J(L.randomSets(G, g.GFC3, { count: 4, seed: 5 })) && J(L.randomSets(G, g.GFC3, { count: 4, seed: 5 })) !== J(L.randomSets(G, g.GFC3, { count: 4, seed: 6 })));
    ok("!! the draws spread: 40 matched sets of GFC1's size touch more than 20 of the 26 non-hand neurons", new Set(L.randomSets(G, g.GFC1, { count: 40, seed: 1 }).flat()).size > 20);
    ok("!! refused: a class that is every neuron (no other set), a bad count", /fewer than 1 distinct/.test(thr(() => L.randomSets(G, Array.from({ length: 34 }, (_, i) => i), { count: 1 }))) && /count must be a positive integer/.test(thr(() => L.randomSets(G, [1], { count: 0 }))) && /fewer than 3 distinct matched/.test(thr(() => L.randomSets(G, [0, 1, 2, 3, 4, 5, 6, 7], { count: 3 }))));
}

sec("5. ARMS");
{
    const hw = Array.from(P.FLY.handWeights()), reg = () => "reg";
    const base = { id: "net", layer: "flying", controls: ["autopilot"], entry: (id) => ({ pilot: "network", circuit: "gfc", weights: hw, id }), register: reg };
    const arms = L.lesionArms({ base, topo: G, className: "GFC1", draws: 3, seed: 4 });
    ok("!! one class arm and three random arms, ids net~GFC1 and net~rand1..3-GFC1, all flying, all held to the intact arm", J(arms.map((a) => a.id)) === J(["net~GFC1", "net~rand1-GFC1", "net~rand2-GFC1", "net~rand3-GFC1"]) && arms.every((a) => a.layer === "flying" && J(a.controls) === J(["net"])));
    const rw = (() => { const r = rngOf(31); return Array.from({ length: P.FLY.WEIGHT_COUNT }, () => r() - 0.5); })(), rarm = L.lesionArms({ base: { ...base, entry: () => ({ pilot: "network", circuit: "gfc", weights: rw }) }, topo: G, className: "GFC4", draws: 1 })[0];
    ok("!! on weights where the class is live, entry() flies weights that differ from the intact ones exactly by the lesion", J(rarm.entry("x").weights) === J(L.lesionWeights(G, rw, [17, 18, 28, 29, 30, 31, 32, 33])) && J(rarm.entry("x").weights) !== J(rw));
    const um = L.lesionArms({ base, topo: G, className: "GFC2", draws: 8, seed: 3, matched: false });
    ok("!! matched: false reaches the draws: the record says unmatched and some draw of GFC2's size holds fewer than its 8 hand channels", um.slice(1).every((a) => a.lesion.matched === false) && um.slice(1).some((a) => a.lesion.neurons.filter((j) => j < 8).length < 8) && /a random set the size of GFC2/.test(um[1].note));
    ok("!! entry() is the base's entry with the lesioned weights (the same pilot kind and circuit, the id passed through)", (() => { const e = arms[0].entry("sb-3"); return e.pilot === "network" && e.circuit === "gfc" && e.id === "sb-3" && J(e.weights) === J(L.lesionWeights(G, hw, [10, 11, 12])); })());
    ok("!! the random arms fly their own sets, and the base's register is carried", J(arms[1].entry("x").weights) === J(L.lesionWeights(G, hw, [...arms[1].lesion.neurons])) && arms.every((a) => a.register === reg) && !("register" in L.lesionArms({ base: { ...base, register: undefined }, topo: G, className: "GFC1", draws: 1 })[0] && L.lesionArms({ base: { ...base, register: undefined }, topo: G, className: "GFC1", draws: 1 })[0].register));
    ok("!! the lesion record: of, cls, by, neurons, random, matched, and the count already inert (GFC1 of the hand weights: all 3)", (() => { const l = arms[0].lesion; return l.of === "net" && l.cls === "GFC1" && l.by === "type" && J(l.neurons) === "[10,11,12]" && l.random === false && l.matched === true && l.inert === 3 && arms[1].lesion.random === true; })());
    ok("!! the note names the neurons and says when they were already inert", /3 neurons silenced/.test(arms[0].note) && /10 11 12/.test(arms[0].note) && /3 already inert/.test(arms[0].note) && /matched random set the size of GFC1/.test(arms[1].note));
    ok("!! by instance works and unknown classes and bad bases are refused", L.lesionArms({ base, topo: G, className: "GFC2_L", by: "instance", draws: 1 })[0].lesion.neurons.join() === "0,1,4,5,7" && /"GFCX" is not a type of this circuit/.test(thr(() => L.lesionArms({ base, topo: G, className: "GFCX" }))) && /base is an arm with an id and an entry/.test(thr(() => L.lesionArms({ base: { id: "x" }, topo: G, className: "GFC1" }))));
}

{
    const hw = Array.from(P.FLY.handWeights()), fw = Array.from(PF.FISH.handWeights()), e = (circuit, weights) => ({ id: "a", entry: () => ({ pilot: circuit, circuit, weights }) });
    ok("!! topologyOf: a gfc network flies the fly's circuit, the fish pilot the zebrafish core; the autopilot (no weights), an unknown circuit, a wrong weight count and an arm without entry() have none", L.topologyOf(e("gfc", hw)) === L.TOPOLOGIES.gfc && L.TOPOLOGIES.gfc.NEURON_TYPES === G.NEURON_TYPES && L.topologyOf(e("fish", fw)) === L.TOPOLOGIES.fish && L.TOPOLOGIES.fish.NEURON_TYPES === Z.NEURON_TYPES && L.topologyOf(e("gfc", null)) === null && L.topologyOf(e("flycx", hw)) === null && L.topologyOf(e("gfc", hw.slice(1))) === null && L.topologyOf({ id: "x" }) === null && L.topologyOf(e("fish", hw)) === null);
}

sec("6. READING");
{
    // A synthetic flying task: each arm's score on key k is its `s[k]`; the board pairs them as usual.
    const task = { name: "syn", layer: "flying", run: (arm, range) => { const o = []; for (let n = range.from; n <= range.to; n++) o.push({ key: "k" + n, score: arm.s[n], bad: false }); return o; } };
    const mkBoard = (intact, cls, rands) => {
        const b = B.createBoard().addTask(task).addArm({ id: "net", layer: "flying", s: intact });
        b.addArm({ id: "net~C", layer: "flying", controls: ["net"], s: cls, lesion: { of: "net", cls: "C", by: "type", neurons: [1, 2], random: false, matched: true, inert: 1 } });
        rands.forEach((r, k) => b.addArm({ id: `net~rand${k + 1}-C`, layer: "flying", controls: ["net"], s: r, lesion: { of: "net", cls: "C", by: "type", neurons: [3, 4], random: true, matched: true, inert: 0 } }));
        return b;
    };
    const I = [0.9, 0.8, 0.7];
    let b = mkBoard(I, [0.5, 0.4, 0.3], [[0.9, 0.8, 0.6], [0.8, 0.8, 0.7], [0.85, 0.75, 0.7]]), res = b.run("syn", [...b.arms.keys()], { from: 0, to: 2 }), rd = L.lesionReading(b, res), st = rd.studies[0];
    ok("!! the cost is intact minus lesioned, averaged over the paired scenarios: 0.4 for the class, 0.0333 / 0.0333 / 0.0333 for the draws", Math.abs(st.cost - 0.4) < 1e-12 && st.randomCosts.length === 3 && st.randomCosts.every((c) => Math.abs(c - 0.1 / 3) < 1e-12), J(st.randomCosts));
    ok("!! a class costing more than every draw has p = 1/(1+3) = 0.25 and reads MORE THAN EVERY, naming the smallest p three draws can give", Math.abs(st.p - 0.25) < 1e-12 && /costs \+0\.4000, MORE THAN EVERY 3 matched random sets of its size/.test(rd.lines[0]) && /rank p = 0\.250, the smallest 3 draws can give is 0\.250/.test(rd.lines[0]) && /1 already inert/.test(rd.lines[0]), rd.lines[0]);
    b = mkBoard(I, I, [[0.5, 0.5, 0.5], [0.1, 0.1, 0.1]]); res = b.run("syn", [...b.arms.keys()], { from: 0, to: 2 }); rd = L.lesionReading(b, res);
    ok("!! a class costing nothing against draws that cost is NO MORE THAN ANY, p = 1", rd.studies[0].p === 1 && /NO MORE THAN ANY 2 matched random sets/.test(rd.lines[0]), rd.lines[0]);
    b = mkBoard(I, [0.7, 0.6, 0.5], [[0.9, 0.8, 0.7], [0.7, 0.6, 0.5], [0.5, 0.5, 0.5], [0.9, 0.8, 0.6]]); res = b.run("syn", [...b.arms.keys()], { from: 0, to: 2 }); rd = L.lesionReading(b, res);
    ok("!! a draw that costs EXACTLY the class counts against it (a tie is not a win): costs 0.2 against 0, 0.2, 0.233, 0.033 -> 2 at least, p = 3/5, 'more than 2 of the 4'", Math.abs(rd.studies[0].p - 0.6) < 1e-12 && /more than 2 of the 4 matched random sets/.test(rd.lines[0]), rd.lines[0]);
    b = mkBoard(I, [0.7, 0.6, 0.5], [[0.9, 0.8, 0.7], [0.5, 0.5, 0.5], [0.9, 0.8, 0.6]]); res = b.run("syn", [...b.arms.keys()], { from: 0, to: 2 }); rd = L.lesionReading(b, res);
    ok("!! one draw costing more of three reads 'more than 2 of the 3', not MORE THAN EVERY, p = 2/4", Math.abs(rd.studies[0].p - 0.5) < 1e-12 && /more than 2 of the 3 matched random sets/.test(rd.lines[0]), rd.lines[0]);
    b = mkBoard(I, [0.5, 0.4, 0.3], [[0.1, 0.1, 0.1]]); res = b.run("syn", ["net~C", "net~rand1-C"], { from: 0, to: 2 }); rd = L.lesionReading(b, res);
    ok("!! a class lesion flown without its intact arm says so and computes nothing", rd.studies[0].missing === true && /its intact arm net was not flown, so no lesion reading/.test(rd.lines[0]));
    b = mkBoard(I, [0.5, 0.4, 0.3], []); res = b.run("syn", ["net", "net~C"], { from: 0, to: 2 }); rd = L.lesionReading(b, res);
    ok("!! with no random draw flown the line says it is compared with nothing", /no random lesion of its size was flown, so it is not compared with anything/.test(rd.lines[0]));
    b = mkBoard(I, [0.5, 0.4, 0.3], [[0.1, 0.1, 0.1]]); b.addArm({ id: "other~rand1-C", layer: "flying", controls: [], s: [0, 0, 0], lesion: { of: "other", cls: "C", by: "type", neurons: [3, 4], random: true, matched: true, inert: 0 } });
    b.addArm({ id: "other", layer: "flying", s: [0, 0, 0] }); res = b.run("syn", [...b.arms.keys()], { from: 0, to: 2 }); rd = L.lesionReading(b, res);
    ok("!! a random draw of another intact arm is not counted for this class, and random arms get no study of their own", rd.studies.length === 1 && rd.studies[0].draws === 1);
}

sec("7. REAL (the switchboard's dropout task)");
{
    const hw = Array.from(P.FLY.handWeights()), board = B.standardBoard({ hand: hw }), base = board.arms.get("network-hand");
    const inert = L.inertOf(G, hw);
    board.addArm({ id: "hand~inert", layer: "flying", controls: ["network-hand"], entry: (id) => ({ ...base.entry(id), weights: L.lesionWeights(G, hw, inert) }), note: "" });
    board.addArm({ id: "hand~yaw", layer: "flying", controls: ["network-hand"], entry: (id) => ({ ...base.entry(id), weights: L.lesionWeights(G, hw, [2]) }), note: "" });
    const res = board.run("dropout", ["network-hand", "hand~inert", "hand~yaw"], { from: 0, to: 1 }, { seconds: 40 });
    ok("!! silencing the 26 inert neurons of the hand network flies it seed for seed (the same scores exactly)", J(res.runs["hand~inert"]) === J(res.runs["network-hand"]), J(res.runs["network-hand"].map((r) => r.score.toFixed(4))));
    ok("!! silencing one yaw channel (neuron 2) moves the score on every seed", res.runs["hand~yaw"].every((r, i) => Math.abs(r.score - res.runs["network-hand"][i].score) > 1e-4), J(res.runs["hand~yaw"].map((r) => r.score.toFixed(4))));
}

sec("7b. NAMES");
ok("!! groupingsOf: type and instance for a createSubPolicy circuit; a topology with LABELS offers exactly its labels' keys; LESION_BIAS is -1e30", J(L.groupingsOf(G)) === '["type","instance"]' && J(L.groupingsOf(Z)) === '["type","instance"]' && J(L.groupingsOf({ LABELS: { a: [], b: [] } })) === '["a","b"]' && J(L.groupingsOf(null)) === '["type","instance"]' && L.LESION_BIAS === -1e30);

sec("8. SOURCE");
{
    ok("!! no clock, no Math.random, no file or DOM in the library", !/Date\.now|new Date|performance\.now|Math\.random|node:fs|readFile|document\.|window\./.test(code));
    ok("!! the header names the backlog item and the hand-channel confound, and says the random control is matched by default", /lesion-toggle/.test(head) && /handWeights\(\)/.test(head) && /ALL GFC2/.test(head) && /MATCHED by default/.test(head));
}

finished = true;
console.log(`\n${fails ? "FAIL" : "PASS"}  lesion-selfcheck: ${fails} failing row${fails === 1 ? "" : "s"}`);
if (fails) process.exitCode = 1;
