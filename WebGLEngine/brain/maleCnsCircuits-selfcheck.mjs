// WebGLEngine/brain/maleCnsCircuits-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/maleCnsCircuits-selfcheck.mjs      (under a second; it reads three files)
//
// THE FLY CIRCUITS READ OFF THE RELEASE'S FLAT FILES, PINNED. vendor/male-cns/ holds three circuits extracted by tools/maleCnsFlatExtract.py (PROVENANCE.md says from what): the steering output (also held, as a helm, by brain/helmSteerPolicy-selfcheck.mjs), THE STEERING CIRCUIT WITH ITS INPUTS, and A TARGET-TRACKING CIRCUIT.
// The last two are DATA ONLY: nothing in the tree runs on them yet, and this gate says what is in them so that whoever builds on them starts from numbers that were checked. It pins: the shape of each file (every edge between two of its neurons, none twice, the sources named by sha256, all three from the SAME source files);
// the transmitter PREDICTIONS (a classifier's call, pooled over a cell type -- `nt` -- with its confidence; NOT a measurement); and what the wiring shows.
//
// AND WHERE THE TRACKING CELLS' DENDRITES ARE (section 5: vendor/male-cns/lc10-positions.json): a place for each LC10a cell off the release's per-synapse file, that the places lie on a sheet, and a gradient along it in which of the two pathways a cell feeds.
//
// AND WHERE THE DARK-LOOMING CELLS' DENDRITES ARE (section 9, 2026-11-22: lc6-positions.json, lc16-positions.json): the same sheet a side; LC6 feeds PVLP151 from the sheet's
// lateral end and DNp103 from its medial end; LC16 feeds pIP1 from the lateral end. Read off the files here (node), not by a separate script: the figures were printed first, then written in.
//
// NO SABOTAGE LOG: there is no module here to break -- the gate reads data. Its numbers were read off the files by a separate script (python, in the session that vendored them) and written here by hand; a file that is re-extracted and differs turns it red.
"use strict";
import fs from "node:fs";
import * as T6 from "./lc6Topology.mjs";
import * as Y6 from "./lc6Synapses.mjs";
import * as L6 from "./lc6Places.mjs";
import * as T16 from "./lc16Topology.mjs";
import * as Y16 from "./lc16Synapses.mjs";
import * as L16 from "./lc16Places.mjs";
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const load = (f) => { const v = JSON.parse(fs.readFileSync(new URL(`../vendor/male-cns/${f}`, import.meta.url), "utf8")), by = new Map(v.neurons.map((n) => [n.bodyId, n])), E = v.edges.map(([a, b, w]) => ({ a: by.get(a), b: by.get(b), w })); return { v, by, E, syn: (ta, tb, pred = () => true) => E.filter((e) => e.a.type === ta && e.b.type === tb && pred(e)).reduce((s, e) => s + e.w, 0), count: (t) => v.neurons.filter((n) => n.type === t).length, nt: (t) => [...new Set(v.neurons.filter((n) => n.type === t).map((n) => n.nt))].join() }; };
const S = load("cx-steering-circuit.json"), I = load("cx-steering-inputs-circuit.json"), T = load("lc10-tracking-circuit.json"), O = load("lc11-object-circuit.json"), K6 = load("lc6-loom-circuit.json"), K16 = load("lc16-loom-circuit.json"), same = (e) => e.a.somaSide === e.b.somaSide, other = (e) => e.a.somaSide !== e.b.somaSide;

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

// the principal axes of a side's centroids: a symmetric 3 x 3 eigenproblem by Jacobi rotations
const axes = (pts) => { const m = [0, 1, 2].map((i) => pts.reduce((a, p) => a + p[i], 0) / pts.length), A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => pts.reduce((a, p) => a + (p[i] - m[i]) * (p[j] - m[j]), 0) / pts.length)), Vv = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 60; sweep++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) { if (Math.abs(A[p][q]) < 1e-9) continue; const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), sn = Math.sin(th); for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - sn * akq; A[k][q] = sn * akp + c * akq; } for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - sn * aqk; A[q][k] = sn * apk + c * aqk; } for (let k = 0; k < 3; k++) { const vkp = Vv[k][p], vkq = Vv[k][q]; Vv[k][p] = c * vkp - sn * vkq; Vv[k][q] = sn * vkp + c * vkq; } }
    const order = [0, 1, 2].sort((i, j) => A[j][j] - A[i][i]); return { mean: m, sd: order.map((i) => Math.sqrt(A[i][i])), vec: order.map((i) => [Vv[0][i], Vv[1][i], Vv[2][i]]) }; };
const corr = (x, y) => { const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length; return x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0)); };

console.log("5. WHERE THE TRACKING CELLS' DENDRITES ARE (vendor/male-cns/lc10-positions.json, by tools/maleCnsDendritePositions.py)");
section(() => {
    const P = JSON.parse(fs.readFileSync(new URL("../vendor/male-cns/lc10-positions.json", import.meta.url), "utf8")), lc = T.v.neurons.filter((n) => n.type === "LC10a");
    ok("!! a place for every one of the 275 LC10a cells of the tracking file, in its order, each from at least 77 dendrite sites (all but two from 100 or more); 251,485 input sites read off the release's per-synapse file (named by sha256, 124,039,080 rows), of which 158,922 are dendrite; the file says how a dendrite was told from an axon and that its units are voxels", P.cells.length === 275 && P.cells.map((c) => c.bodyId).join() === lc.map((n) => n.bodyId).join() && P.cells.every((c, i) => c.somaSide === lc[i].somaSide && c.dendrite >= 77 && c.dendrite <= c.sites && c.centroid.length === 3 && c.centroid.every(Number.isFinite)) && P.cells.reduce((a, c) => a + c.sites, 0) === 251485 && P.cells.reduce((a, c) => a + c.dendrite, 0) === 158922 && P.sources.partners.sha256 === "43748c76db13e339e9eeb6f4d56e98aab704a4f7fa8bf3cb916b323000070d04" && P.sources.partners.rows === 124039080 && /farther than half its farthest/.test(P.method) && /voxels/.test(P.units) && P.cells.filter((c) => c.dendrite < 100).length === 2 && /not re-confirmed/.test(P.license), `fewest dendrite sites ${Math.min(...P.cells.map((c) => c.dendrite))}`);
    const onto = (type) => { const w = new Map(); for (const e of T.E) if (e.a.type === "LC10a" && e.b.type === type) w.set(e.a.bodyId, (w.get(e.a.bodyId) || 0) + e.w); return w; }, w19 = onto("AOTU019"), w25 = onto("AOTU025"), midX = (P.outputCentres.L[0] + P.outputCentres.R[0]) / 2, R = {};
    for (const side of ["L", "R"]) { const cells = P.cells.filter((c) => c.somaSide === side), ax = axes(cells.map((c) => c.centroid)), v2 = ax.vec[1], medial = Math.sign(midX - ax.mean[0]), s = Math.sign(v2[0]) === medial ? 1 : -1, along = cells.map((c) => s * [0, 1, 2].reduce((a, i) => a + (c.centroid[i] - ax.mean[i]) * v2[i], 0)); R[side] = { ax, c19: corr(cells.map((c) => w19.get(c.bodyId) || 0), along), c25: corr(cells.map((c) => w25.get(c.bodyId) || 0), along), yShare: Math.abs(ax.vec[0][1]) }; }
    ok("!! THE DENDRITES OF A SIDE LIE ON A SHEET: of the three principal spreads of their places the third is under a third of the second on both sides (standard deviations of about 5,800, 3,300 and 800 voxels), the longest axis runs mostly along the dataset's y, and the two sides' sheets are the same size to a twentieth", ["L", "R"].every((sd) => R[sd].ax.sd[2] < R[sd].ax.sd[1] / 3 && R[sd].ax.sd[1] < R[sd].ax.sd[0] && R[sd].yShare > 0.9) && Math.abs(R.L.ax.sd[0] / R.R.ax.sd[0] - 1) < 0.05 && Math.abs(R.L.ax.sd[1] / R.R.ax.sd[1] - 1) < 0.05, `spreads L ${R.L.ax.sd.map((v) => Math.round(v)).join(", ")}; R ${R.R.ax.sd.map((v) => Math.round(v)).join(", ")}`);
    ok("!! AND ALONG THE SHEET'S SECOND AXIS THE TWO PATHWAYS DRAW FROM OPPOSITE ENDS, THE SAME WAY ON BOTH SIDES: with the axis pointed toward the midline, an LC10a cell's synapses onto AOTU019 FALL along it (correlation -0.47 on the left, -0.38 on the right) and its synapses onto AOTU025 RISE (+0.40, +0.39) -- a gradient across the eye in who a tracking cell talks to. WHICH END OF THAT AXIS IS THE FRONT OF THE VISUAL FIELD IS NOT IN THE DATA USED HERE AND IS NOT CLAIMED", R.L.c19 < -0.4 && R.R.c19 < -0.3 && R.L.c25 > 0.3 && R.R.c25 > 0.3, `AOTU019 ${R.L.c19.toFixed(2)}, ${R.R.c19.toFixed(2)}; AOTU025 ${R.L.c25.toFixed(2)}, ${R.R.c25.toFixed(2)}`);
});

console.log("6. THE SMALL-OBJECT CIRCUIT (vendor/male-cns/lc11-object-circuit.json, 2026-11-21: 151 neurons, 7,936 connections)");
section(() => {
    // the choice, by one rule stated before any fight: the descending neuron taking the most of LC11's output, directly and through one relay, is DNp35; the
    // relays are the central-brain types taking at least 2,000 synapses from LC11 and giving at least 400 to DNp35 (read off the whole release by a separate script)
    const shapeOk = O.v.neuronCount === O.v.neurons.length && O.v.edgeCount === O.v.edges.length && new Set(O.v.edges.map(([a, b]) => a + ">" + b)).size === O.v.edges.length && O.v.edges.every(([a, b, w]) => O.by.has(a) && O.by.has(b) && Number.isInteger(w) && w >= 1) && /not re-confirmed/.test(O.v.license);
    ok("!! the file is whole and was read off the same three source files as the others", shapeOk && JSON.stringify(O.v.sources) === JSON.stringify(T.v.sources), `${O.v.neuronCount}/${O.v.edgeCount}`);
    ok("143 LC11 (68 left, 75 right), and one AVLP079, AVLP080, AVLP086 and DNp35 a side", ["LC11", "AVLP079", "AVLP080", "AVLP086", "DNp35"].map(O.count).join() === "143,2,2,2,2" && O.v.neurons.filter((n) => n.type === "LC11" && n.somaSide === "L").length === 68 && ["AVLP079", "AVLP080", "AVLP086", "DNp35"].every((t) => O.v.neurons.filter((n) => n.type === t).map((n) => n.somaSide).sort().join() === "L,R"));
    ok("!! THE THREE RELAYS ARE PREDICTED GABA (a classifier's call); LC11 and DNp35 acetylcholine", ["AVLP079", "AVLP080", "AVLP086"].every((t) => O.nt(t) === "gaba") && O.nt("LC11") === "acetylcholine" && O.nt("DNp35") === "acetylcholine");
    ok("!! EVERY ONE OF THE 143 LC11 CELLS REACHES DNp35 DIRECTLY, 2,027 synapses, each on its own side only (right 1,271, left 756)", new Set(O.E.filter((e) => e.a.type === "LC11" && e.b.type === "DNp35").map((e) => e.a.bodyId)).size === 143 && O.syn("LC11", "DNp35") === 2027 && O.syn("LC11", "DNp35", other) === 0 && O.syn("LC11", "DNp35", (e) => e.a.somaSide === "R") === 1271);
    ok("!! THE RULE THAT CHOSE THE RELAYS HOLDS IN THE FILE: AVLP079, AVLP080 and AVLP086 each take at least 2,000 synapses from LC11 (3,219, 2,097, 2,122) and give at least 400 to DNp35 (576, 815, 444), all on their own side", O.syn("LC11", "AVLP079") === 3219 && O.syn("LC11", "AVLP080") === 2097 && O.syn("LC11", "AVLP086") === 2122 && O.syn("AVLP079", "DNp35") === 576 && O.syn("AVLP080", "DNp35") === 815 && O.syn("AVLP086", "DNp35") === 444 && ["AVLP079", "AVLP080", "AVLP086"].every((t) => O.syn("LC11", t, other) === 0));
    ok("!! AND THE INHIBITION COMES BACK: AVLP079 returns 1,792 synapses to LC11 and AVLP086 595 -- a feedback loop the tracking circuit does not have; LC11 onto LC11 is the file's bulk (6,967 connections, 15,491 synapses)", O.syn("AVLP079", "LC11") === 1792 && O.syn("AVLP086", "LC11") === 595 && O.E.filter((e) => e.a.type === "LC11" && e.b.type === "LC11").length === 6967 && O.syn("LC11", "LC11") === 15491);
});

console.log("8. THE DARK-LOOMING CELLS, LC6 AND LC16 (vendor/male-cns/lc6-loom-circuit.json, lc16-loom-circuit.json, 2026-11-22)");
section(() => {
    // the choice, by LC11's rule: the descending neuron taking the most of the type's output directly and through one relay; relays the central-brain types taking at least
    // 2,000 synapses from it and giving at least 400 to that neuron (read off the whole release by a separate script; the numbers below are the files')
    const whole = (X) => X.v.neuronCount === X.v.neurons.length && X.v.edgeCount === X.v.edges.length && X.v.edges.every(([a, b, w]) => X.by.has(a) && X.by.has(b) && Number.isInteger(w) && w >= 1) && JSON.stringify(X.v.sources) === JSON.stringify(T.v.sources);
    ok("!! both files are whole and read off the same three source files as the others", whole(K6) && whole(K16), `${K6.v.neuronCount}/${K6.v.edgeCount}, ${K16.v.neuronCount}/${K16.v.edgeCount}`);
    ok("124 LC6 (59 left, 65 right) with PVLP151 (2 a side) and DNp103 (1 a side); 182 LC16 (88 left, 94 right) with pIP1 (1 a side); every cell predicted acetylcholine", ["LC6", "PVLP151", "DNp103"].map(K6.count).join() === "124,4,2" && ["LC16", "pIP1"].map(K16.count).join() === "182,2" && K6.v.neurons.filter((n) => n.type === "LC6" && n.somaSide === "L").length === 59 && K16.v.neurons.filter((n) => n.type === "LC16" && n.somaSide === "L").length === 88 && [K6, K16].every((X) => X.v.neurons.every((n) => n.nt === "acetylcholine")));
    ok("!! LC6 reaches DNp103 directly (848 synapses) and through PVLP151 (2,679 in, 406 out), every LC6 synapse on its own side -- and PVLP151's onto DNp103 MOSTLY CROSS THE MIDLINE (389 of the 406)", K6.syn("LC6", "DNp103") === 848 && K6.syn("LC6", "PVLP151") === 2679 && K6.syn("PVLP151", "DNp103") === 406 && K6.syn("PVLP151", "DNp103", other) === 389 && K6.syn("LC6", "DNp103", other) === 0 && K6.syn("LC6", "PVLP151", other) === 0);
    ok("!! LC16 reaches pIP1 directly (1,296 synapses, on its own side) and through no relay the rule admits; LC16 onto LC16 is its file's bulk (14,596)", K16.syn("LC16", "pIP1") === 1296 && K16.syn("LC16", "pIP1", other) === 0 && K16.syn("LC16", "LC16") === 14596 && K16.v.neurons.length === 184);
});

console.log("7. WHERE THE SMALL-OBJECT CELLS' DENDRITES ARE (vendor/male-cns/lc11-positions.json, by tools/maleCnsDendritePositions.py, 2026-11-21)");
section(() => {
    const P = JSON.parse(fs.readFileSync(new URL("../vendor/male-cns/lc11-positions.json", import.meta.url), "utf8")), lc = O.v.neurons.filter((n) => n.type === "LC11");
    ok("!! a place for every one of the 143 LC11 cells, in the circuit's order, each from at least 1,159 dendrite sites; 343,904 input sites read off the same per-synapse file as LC10a's (sha256 43748c76..., 124,039,080 rows), 316,652 of them dendrite", P.cells.length === 143 && P.cells.map((c) => c.bodyId).join() === lc.map((n) => n.bodyId).join() && P.cells.every((c, i) => c.somaSide === lc[i].somaSide && c.dendrite >= 1159 && c.dendrite <= c.sites && c.centroid.every(Number.isFinite)) && P.cells.reduce((a, c) => a + c.sites, 0) === 343904 && P.cells.reduce((a, c) => a + c.dendrite, 0) === 316652 && P.sources.partners.sha256 === "43748c76db13e339e9eeb6f4d56e98aab704a4f7fa8bf3cb916b323000070d04" && P.type === "LC11");
    const w = new Map(); for (const e of O.E) if (e.a.type === "LC11" && e.b.type === "DNp35") w.set(e.a.bodyId, (w.get(e.a.bodyId) || 0) + e.w);
    const midX = (P.outputCentres.L[0] + P.outputCentres.R[0]) / 2, R = {};
    for (const side of ["L", "R"]) { const cells = P.cells.filter((c) => c.somaSide === side), ax = axes(cells.map((c) => c.centroid)), v2 = ax.vec[1], medial = Math.sign(midX - ax.mean[0]), s = Math.sign(v2[0]) === medial ? 1 : -1, along = cells.map((c) => s * [0, 1, 2].reduce((a, i) => a + (c.centroid[i] - ax.mean[i]) * v2[i], 0)); R[side] = { ax, c: corr(cells.map((c) => w.get(c.bodyId) || 0), along) }; }
    ok("!! THE DENDRITES OF A SIDE LIE ON A SHEET, the two sides' the same size to a twentieth: the third spread under a third of the second (standard deviations of about 6,000, 2,900 and 840 voxels)", ["L", "R"].every((sd) => R[sd].ax.sd[2] < R[sd].ax.sd[1] / 3 && R[sd].ax.sd[1] < R[sd].ax.sd[0]) && Math.abs(R.L.ax.sd[0] / R.R.ax.sd[0] - 1) < 0.05 && Math.abs(R.L.ax.sd[1] / R.R.ax.sd[1] - 1) < 0.05, `spreads L ${R.L.ax.sd.map((v) => Math.round(v)).join(", ")}; R ${R.R.ax.sd.map((v) => Math.round(v)).join(", ")}`);
    ok("!! AND DNp35 DRAWS FROM ONE END OF THE SHEET'S SECOND AXIS, THE SAME WAY ON BOTH SIDES: with the axis pointed toward the midline, an LC11 cell's synapses onto DNp35 FALL along it (correlation -0.71 on the left, -0.56 on the right) -- the lateral end's cells feed it most. WHICH PART OF THE VISUAL FIELD THAT END IS, IS NOT IN THE DATA USED HERE AND IS NOT CLAIMED", R.L.c < -0.6 && R.R.c < -0.45, `${R.L.c.toFixed(2)}, ${R.R.c.toFixed(2)}`);
});

console.log("9. WHERE THE DARK-LOOMING CELLS' DENDRITES ARE (vendor/male-cns/lc6-positions.json, lc16-positions.json, by tools/maleCnsDendritePositions.py, 2026-11-22)");
section(() => {
    const sheet = (X, file, type, targets) => {
        const P = JSON.parse(fs.readFileSync(new URL(`../vendor/male-cns/${file}`, import.meta.url), "utf8")), lc = X.v.neurons.filter((n) => n.type === type), midX = (P.outputCentres.L[0] + P.outputCentres.R[0]) / 2, R = { P, lc, side: {} };
        for (const side of ["L", "R"]) {
            const cells = P.cells.filter((c) => c.somaSide === side), ax = axes(cells.map((c) => c.centroid)), v2 = ax.vec[1], s = Math.sign(v2[0]) === Math.sign(midX - ax.mean[0]) ? 1 : -1, along = cells.map((c) => s * [0, 1, 2].reduce((a, i) => a + (c.centroid[i] - ax.mean[i]) * v2[i], 0));
            R.side[side] = { ax, c: Object.fromEntries(targets.map((t) => { const w = new Map(); for (const e of X.E) if (e.a.type === type && e.b.type === t) w.set(e.a.bodyId, (w.get(e.a.bodyId) || 0) + e.w); return [t, corr(cells.map((c) => w.get(c.bodyId) || 0), along)]; })) };
        }
        R.flat = ["L", "R"].every((sd) => R.side[sd].ax.sd[2] < R.side[sd].ax.sd[1] / 3 && R.side[sd].ax.sd[1] < R.side[sd].ax.sd[0]) && [0, 1].every((k) => Math.abs(R.side.L.ax.sd[k] / R.side.R.ax.sd[k] - 1) < 0.05);
        R.whole = P.type === type && P.cells.length === lc.length && P.cells.map((c) => c.bodyId).join() === lc.map((n) => n.bodyId).join() && P.cells.every((c, i) => c.somaSide === lc[i].somaSide && c.dendrite <= c.sites && c.centroid.every(Number.isFinite)) && P.sources.partners.sha256 === "43748c76db13e339e9eeb6f4d56e98aab704a4f7fa8bf3cb916b323000070d04";
        return R;
    };
    const A = sheet(K6, "lc6-positions.json", "LC6", ["PVLP151", "DNp103"]), B = sheet(K16, "lc16-positions.json", "LC16", ["pIP1"]), sum = (R, k) => R.P.cells.reduce((a, c) => a + c[k], 0), f = (R, t) => ["L", "R"].map((sd) => R.side[sd].c[t].toFixed(2)).join(" / ");
    ok("!! a place for every LC6 (124) and LC16 (182) cell, in the circuits' order, each from at least 224 dendrite sites, off the same per-synapse file as LC10a's and LC11's: 89,166 input sites for LC6 (69,585 dendrite), 98,241 for LC16 (75,744)", A.whole && B.whole && sum(A, "sites") === 89166 && sum(A, "dendrite") === 69585 && sum(B, "sites") === 98241 && sum(B, "dendrite") === 75744 && [A, B].every((R) => R.P.cells.every((c) => c.dendrite >= 224)));
    ok("!! BOTH TYPES' DENDRITES LIE ON A SHEET A SIDE, the two sides the same size to a twentieth (standard deviations of about 5,400, 2,950 and 700 voxels; LC10a's and LC11's are the same shape)", A.flat && B.flat, ["L", "R"].map((sd) => `LC6 ${sd} ${A.side[sd].ax.sd.map((x) => x.toFixed(0)).join("/")}, LC16 ${sd} ${B.side[sd].ax.sd.map((x) => x.toFixed(0)).join("/")}`).join("; "));
    ok("!! LC6 FEEDS ITS TWO TARGETS FROM OPPOSITE ENDS OF THE SHEET'S SECOND AXIS (pointed toward the midline): PVLP151 from the lateral end (correlation -0.58 left, -0.70 right), DNp103's direct input from the medial end -- clearly on the left (+0.42), weakly on the right (+0.21)", A.side.L.c.PVLP151 < -0.5 && A.side.R.c.PVLP151 < -0.5 && A.side.L.c.DNp103 > 0.35 && A.side.R.c.DNp103 > 0.15, `PVLP151 ${f(A, "PVLP151")}; DNp103 ${f(A, "DNp103")}`);
    ok("!! LC16 FEEDS pIP1 FROM THE LATERAL END, as LC11 feeds DNp35 (-0.55 left, -0.46 right). WHICH PART OF THE VISUAL FIELD EITHER END IS, IS NOT IN THE DATA USED HERE AND IS NOT CLAIMED", B.side.L.c.pIP1 < -0.4 && B.side.R.c.pIP1 < -0.4, `pIP1 ${f(B, "pIP1")}`);
});

console.log("10. THE BAKED MODULES FOR LC6 AND LC16 ARE THE VENDORED FILES (brain/lc6Topology.mjs, lc6Synapses.mjs, lc6Places.mjs and lc16's, 2026-11-22)");
await (async () => {
    const { placesOf } = await import("../tools/bakeDendritePlaces.mjs"), r6 = (v) => Math.round(v * 1e6) / 1e6;
    for (const [n, X, T, Y, L] of [["lc6", K6, T6, Y6, L6], ["lc16", K16, T16, Y16, L16]]) {
        const P = JSON.parse(fs.readFileSync(new URL(`../vendor/male-cns/${n}-positions.json`, import.meta.url), "utf8")), pl = placesOf(P);
        const idx = new Map(T.NEURON_ORDER.map((b, k) => [b, k])), V = X.v;
        const topo = T.NEURON_ORDER.join() === V.neurons.map((x) => x.bodyId).join() && T.NEURON_TYPES.join() === V.neurons.map((x) => x.type).join() && T.EDGES.length === V.edges.length && T.EDGES.every(([to, from], k) => to === idx.get(V.edges[k][1]) && from === idx.get(V.edges[k][0]));
        const syn = Y.EDGE_COUNTS.join() === V.edges.map((e) => e[2]).join() && Y.NEURON_NT.join() === V.neurons.map((x) => x.nt).join() && Y.NEURON_SOMA.join() === V.neurons.map((x) => x.somaSide).join();
        const places = T.NEURON_ORDER.every((b, k) => (pl.has(b) ? L.ACROSS[k] === r6(pl.get(b).across) && L.ALONG[k] === r6(pl.get(b).along) : L.ACROSS[k] === -1 && L.ALONG[k] === -1)) && pl.size === P.cells.length;
        ok(`!! ${n.toUpperCase()}'S BAKED MODULES ARE ITS VENDORED FILES: the neurons in the file's order, every edge [to, from] the file's (${T.EDGES.length.toLocaleString()}), its synapse counts, transmitters and soma sides, and each cell's rank across and along its side's sheet (-1 for the ${T.NEURON_ORDER.length - P.cells.length} that are not ${n.toUpperCase()})`, topo && syn && places, JSON.stringify({ topo, syn, places }));
    }
})().catch((e) => ok(`!! the section THREW instead of answering: ${e.message}`, false));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
