// WebGLEngine/brain/maleCnsCircuits-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/maleCnsCircuits-selfcheck.mjs      (under a second; it reads three files)
//
// THE FLY CIRCUITS READ OFF THE RELEASE'S FLAT FILES, PINNED. vendor/male-cns/ holds three circuits extracted by tools/maleCnsFlatExtract.py (PROVENANCE.md says from what): the steering output (also held, as a helm, by brain/helmSteerPolicy-selfcheck.mjs), THE STEERING CIRCUIT WITH ITS INPUTS, and A TARGET-TRACKING CIRCUIT.
// The last two are DATA ONLY: nothing in the tree runs on them yet, and this gate says what is in them so that whoever builds on them starts from numbers that were checked. It pins: the shape of each file (every edge between two of its neurons, none twice, the sources named by sha256, all three from the SAME source files);
// the transmitter PREDICTIONS (a classifier's call, pooled over a cell type -- `nt` -- with its confidence; NOT a measurement); and what the wiring shows.
//
// NO SABOTAGE LOG: there is no module here to break -- the gate reads data. Its numbers were read off the files by a separate script (python, in the session that vendored them) and written here by hand; a file that is re-extracted and differs turns it red.
"use strict";
import fs from "node:fs";
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const load = (f) => { const v = JSON.parse(fs.readFileSync(new URL(`../vendor/male-cns/${f}`, import.meta.url), "utf8")), by = new Map(v.neurons.map((n) => [n.bodyId, n])), E = v.edges.map(([a, b, w]) => ({ a: by.get(a), b: by.get(b), w })); return { v, by, E, syn: (ta, tb, pred = () => true) => E.filter((e) => e.a.type === ta && e.b.type === tb && pred(e)).reduce((s, e) => s + e.w, 0), count: (t) => v.neurons.filter((n) => n.type === t).length, nt: (t) => [...new Set(v.neurons.filter((n) => n.type === t).map((n) => n.nt))].join() }; };
const S = load("cx-steering-circuit.json"), I = load("cx-steering-inputs-circuit.json"), T = load("lc10-tracking-circuit.json"), same = (e) => e.a.somaSide === e.b.somaSide, other = (e) => e.a.somaSide !== e.b.somaSide;

console.log("maleCnsCircuits-selfcheck -- three fly circuits off the release's flat files\n");

console.log("1. THE FILES");
section(() => {
    const shape = ({ v, by }) => v.neuronCount === v.neurons.length && v.edgeCount === v.edges.length && new Set(v.edges.map(([a, b]) => a + ">" + b)).size === v.edges.length && v.edges.every(([a, b, w]) => by.has(a) && by.has(b) && Number.isInteger(w) && w >= 1) && by.size === v.neurons.length && v.dataset === "male-cns:v1.0" && /not re-confirmed/.test(v.license);
    ok("!! each file is whole: the counts it states, every edge between two of its own neurons, no pair twice, whole synapse counts, no neuron twice, the dataset named and the licence said to be unconfirmed for this route", shape(S) && shape(I) && shape(T), `${S.v.neuronCount}/${S.v.edgeCount}, ${I.v.neuronCount}/${I.v.edgeCount}, ${T.v.neuronCount}/${T.v.edgeCount} neurons/edges`);
    const src = (x) => JSON.stringify(x.v.sources);
    ok("!! all three were read off the SAME three source files (annotations 2177e246..., significant-only weights 5c536423... of 25,568,639 rows, transmitter predictions 95c92892...)", src(S) === src(I) && src(I) === src(T) && S.v.sources.annotations.sha256 === "2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2" && S.v.sources.weights.sha256 === "5c536423a62a688e59e7b441f9c04d6272c9a1f017e35814cf561f8c275d9e9e" && S.v.sources.weights.rows === 25568639 && S.v.sources.neurotransmitters.sha256 === "95c9289220663abeb3409f3ad9e5a7f8a53f8093f5139d15502cd08da8879621");
    const sub = I.v.neurons.filter((n) => S.by.has(n.bodyId)), ids = new Set(sub.map((n) => n.bodyId)), inner = I.v.edges.filter(([a, b]) => ids.has(a) && ids.has(b));
    ok("!! THE STEERING CIRCUIT IS INSIDE THE ONE WITH ITS INPUTS: the same 40 neurons, and the edges among them the same 523 with the same weights -- and DNa02 in the tracking file is the same two neurons", sub.length === 40 && JSON.stringify(inner) === JSON.stringify(S.v.edges) && T.v.neurons.filter((n) => n.type === "DNa02").map((n) => n.bodyId).join() === S.v.neurons.filter((n) => n.type === "DNa02").map((n) => n.bodyId).join());
});

console.log("2. THE TRANSMITTER PREDICTIONS (a classifier's call for the cell type, not a measurement)");
section(() => {
    const all = [...S.v.neurons, ...I.v.neurons, ...T.v.neurons];
    ok("every neuron of all three files has a predicted transmitter and a confidence between 0 and 1, and a cell type has one prediction", all.every((n) => typeof n.nt === "string" && n.nt.length && n.ntConfidence > 0 && n.ntConfidence <= 1) && ["EPG", "Delta7", "FC2A", "PFL2", "PFL3", "DNa02", "DNa03"].every((t) => !I.nt(t).includes(",")));
    ok("!! TWO CELL TYPES ARE NOT PREDICTED EXCITATORY: Delta7 is GLUTAMATE (in the fly's brain glutamate is commonly inhibitory -- the ring's own inhibition) and AOTU019 is GABA; every other type here is acetylcholine -- EPG, FC2A-C, PFL2, PFL3, DNa02, DNa03, LC10a, AOTU025", I.nt("Delta7") === "glutamate" && T.nt("AOTU019") === "gaba" && ["EPG", "FC2A", "FC2B", "FC2C", "PFL2", "PFL3", "DNa02", "DNa03"].every((t) => I.nt(t) === "acetylcholine") && T.nt("LC10a") === "acetylcholine" && T.nt("AOTU025") === "acetylcholine");
});

console.log("3. THE STEERING CIRCUIT WITH ITS INPUTS (220 neurons, 7,981 connections)");
section(() => {
    ok("46 EPG, 42 Delta7, 18 FC2A, 27 FC2B, 47 FC2C, 12 PFL2, 24 PFL3, 2 DNa02, 2 DNa03", ["EPG", "Delta7", "FC2A", "FC2B", "FC2C", "PFL2", "PFL3", "DNa02", "DNa03"].map(I.count).join() === "46,42,18,27,47,12,24,2,2" && I.v.neuronCount === 220 && I.v.edgeCount === 7981);
    const fc = (to) => I.syn("FC2A", to) + I.syn("FC2B", to) + I.syn("FC2C", to);
    ok("!! BOTH INPUTS ARRIVE AT THE PFL CELLS: the HEADING from the compass, directly (EPG to PFL3 1,182 synapses, to PFL2 1,036) and through Delta7 (5,617 and 3,269); the GOAL from the fan-shaped body's FC2 cells (7,690 onto PFL3, 4,333 onto PFL2)", I.syn("EPG", "PFL3") === 1182 && I.syn("EPG", "PFL2") === 1036 && I.syn("Delta7", "PFL3") === 5617 && I.syn("Delta7", "PFL2") === 3269 && fc("PFL3") === 7690 && fc("PFL2") === 4333);
    ok("the compass is most of the file (EPG to Delta7 19,896, Delta7 to Delta7 26,539, EPG to EPG 11,486, Delta7 to EPG 4,294) and almost nothing runs back up from the output (PFL3 to EPG 20, to FC2A 16; the descending neurons to EPG 0)", I.syn("EPG", "Delta7") === 19896 && I.syn("Delta7", "Delta7") === 26539 && I.syn("EPG", "EPG") === 11486 && I.syn("Delta7", "EPG") === 4294 && I.syn("PFL3", "EPG") === 20 && I.syn("PFL3", "FC2A") === 16 && I.syn("DNa02", "EPG") + I.syn("DNa03", "EPG") === 0);
});

console.log("4. THE TARGET-TRACKING CIRCUIT (281 neurons, 6,589 connections)");
section(() => {
    ok("275 LC10a (135 left, 140 right), 2 AOTU019, 2 AOTU025, 2 DNa02", ["LC10a", "AOTU019", "AOTU025", "DNa02"].map(T.count).join() === "275,2,2,2" && T.v.neurons.filter((n) => n.type === "LC10a" && n.somaSide === "L").length === 135 && T.v.neuronCount === 281 && T.v.edgeCount === 6589);
    ok("!! THE EYE'S SMALL-OBJECT CELLS REACH TWO CELLS A SIDE, EACH ON ITS OWN SIDE ONLY: LC10a to AOTU019 14,210 synapses (from 206 of the 275) and to AOTU025 7,031, not one across the midline", T.syn("LC10a", "AOTU019") === 14210 && T.syn("LC10a", "AOTU019", other) === 0 && T.syn("LC10a", "AOTU025") === 7031 && T.syn("LC10a", "AOTU025", other) === 0 && new Set(T.E.filter((e) => e.a.type === "LC10a" && e.b.type === "AOTU019").map((e) => e.a.bodyId)).size === 206);
    ok("!! AND THE TWO REACH THE STEERING NEURON DIFFERENTLY: AOTU019 (predicted GABA) only the DNa02 ACROSS the midline (586 synapses, 0 on its own side); AOTU025 (acetylcholine) only the DNa02 on its OWN side (401, 0 across) -- an object on one side reaches both steering neurons, with opposite predicted signs", T.syn("AOTU019", "DNa02") === 586 && T.syn("AOTU019", "DNa02", same) === 0 && T.syn("AOTU025", "DNa02") === 401 && T.syn("AOTU025", "DNa02", other) === 0);
    ok("most of the file's connections are LC10a to LC10a (6,189 of 6,589; 25,244 synapses); the descending neuron sends one synapse back", T.E.filter((e) => e.a.type === "LC10a" && e.b.type === "LC10a").length === 6189 && T.syn("LC10a", "LC10a") === 25244 && T.syn("DNa02", "AOTU025") + T.syn("DNa02", "AOTU019") + T.syn("DNa02", "LC10a") === 1);
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
