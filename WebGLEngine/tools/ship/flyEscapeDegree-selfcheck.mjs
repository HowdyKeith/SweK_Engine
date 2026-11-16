// WebGLEngine/tools/ship/flyEscapeDegree-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeDegree-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 6 (registered in brain/FLY_ESCAPE_DEGREE_WIP.md before brain/rl/degreeShuffle.mjs and tools/ship/flyEscapeDegree.mjs existed): is round 5's result the convergence onto
// the Giant Fibers, or the wiring? The real circuit against a shuffle that keeps every cell's counts, and against round 5's free shuffle, on 32 new draws an arm.
//   1  THE SHUFFLE           brain/rl/degreeShuffle.mjs keeps every cell's count in and count out, whatever the seed, and moves the sources
//   2  THE ROUND'S NUMBERS   round 5's cells, inputs, read-out and start; three arms; draws 17 to 48; what GDEG keeps and what it loses, counted
//   3  ONE TRAINING          a record's weights are the trainer's from a wrapped policy made here by hand
//   4  THE RECORDS           96 draws; D1, D2, D3; the failures
//   5  THE COMMAND           it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-16) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate, tools/ship/voxelHome-selfcheck.mjs (which probes the command as a
// process), round 5's gate and round 1's run whole for each; every one red by name (the number is the rows red over the four):
//   THE SHUFFLE: K1 swaps targets, not sources 4 | K2 a swap may repeat a connection 4 | K3 a swap may make a connection from a cell to itself 5 | K4 the shuffle does nothing 5
//   K5 one swap tried a connection 2 | K6 the shuffle ignores its seed 4 | K7 a source is given to one connection and not taken from the other 3
//   THE ROUND: K8 GDEG is the free shuffle 3 | K9 GDEG is the real wiring 4 | K10 every draw's GDEG is the same shuffle 3 | K11 the draws are round 5's 6 | K12 sixteen draws an arm 7
//   K13 the failing line is 0.70 2 | K14 D1 against the free shuffle and D2 against GDEG 3 | K15 D3 is GF against GSHUF 1 | K16 D3's BETTER and WORSE each other's 1
//   K17 D3 is made with a failed check 1 | K18 the shuffles start with no strengths 3 | K19 the round writes round 5's results file 1 | K20 D2's words are D1's 1
//   THE COMMAND: K21 trains draw 1 a second time 1 | K22 exits 0 on a word it does not know 1 | K23 reads round 5's library 1
//   THE DRAWS HOOK (tools/ship/flyEscape.mjs): K24 a round's own draws are not taken 6 | K25 the second training is checked for draw 1 2 | K26 any list is a round's draws 1
//   K27 the recheck record may be of any draw: 0 RED AT FIRST (no row had a recheck record naming another draw with the right weights); the row was added and K27 run again: 1
//   Three rows of mine were wrong when written and were corrected to what the code gives: the Giant Fibers' synapse counts, a ring of three (which has no legal swap), and the ranges over the 32 draws.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeDegree.mjs";
import * as V5 from "./flyEscapeVision.mjs";
import * as V3 from "./flyEscapeFresh.mjs";
import * as V1 from "./flyEscape.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as RS from "../../brain/rl/reflexStart.mjs";
import * as M from "../../brain/rl/maskedCircuitPolicy.mjs";
import * as DS from "../../brain/rl/degreeShuffle.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, sum = (a) => a.reduce((n, v) => n + v, 0);
const TINY = Object.freeze({ maxSteps: 160, iters: 3, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 8, fresh: true, battery: 30 }), TINY_AUDIT = [880001, 880002, 880003, 880004, 880005, 880006];
const REAL = T.EDGES.map((e) => [e[0], e[1]]), key = (e) => e[0] * 100 + e[1], counts = (edges, n = 42) => { const i = new Array(n).fill(0), o = new Array(n).fill(0); for (const [to, from] of edges) { i[to]++; o[from]++; } return [i, o]; };
const strengthIn = (edges, w, n = 42) => { const s = new Array(n).fill(0); edges.forEach((e, k) => { s[e[0]] += w[k]; }); return s; };

console.log("flyEscapeDegree-selfcheck -- the escape round 6 (the convergence, or the wiring?): the shuffle, the numbers, one training, the records, the command\n");

console.log("1. THE SHUFFLE (brain/rl/degreeShuffle.mjs)");
section(() => {
    const seeds = [9017, 9018, 9030, 9048, 5], sh = seeds.map((s) => DS.degreeShuffle(REAL, s));
    ok("!! *** EVERY CELL KEEPS ITS COUNT OF CONNECTIONS IN AND ITS COUNT OUT, EXACTLY, WHATEVER THE SEED *** -- five shuffles of the 369 real connections: each cell's two counts are the real circuit's; 369 distinct connections, none from a cell to itself",
        sh.every((e) => J(counts(e)) === J(counts(REAL)) && e.length === 369 && new Set(e.map(key)).size === 369 && e.every((x) => x[0] !== x[1])));
    ok("!! A CONNECTION KEEPS ITS PLACE IN THE LIST AND ITS TARGET; ONLY ITS SOURCE MOVES -- so the real strengths, in the same order, give every cell exactly the strength it receives in the real circuit (each Giant Fiber its 21 connections: 1,102 and 1,255 synapses), from other cells",
        sh.every((e) => e.every((x, k) => x[0] === REAL[k][0]) && J(strengthIn(e, T.SYNAPSES)) === J(strengthIn(REAL, T.SYNAPSES))) && counts(REAL)[0][40] === 21 && counts(REAL)[0][41] === 21 && strengthIn(REAL, T.SYNAPSES)[40] === 1102 && strengthIn(REAL, T.SYNAPSES)[41] === 1255,
        `the Giant Fibers receive ${strengthIn(REAL, T.SYNAPSES)[40]} and ${strengthIn(REAL, T.SYNAPSES)[41]} synapses`);
    const kept = sh.map((e) => e.filter((x, k) => x[1] === REAL[k][1]).length), setReal = new Set(REAL.map(key)), samePlace = sh.map((e) => e.filter((x) => setReal.has(key(x))).length);
    ok("!! IT IS A SHUFFLE: of 369 connections fewer than 30 keep their own source in any of the five, and fewer than 140 of a shuffle's connections are ones the real circuit has (the circuit is dense within a side, so a moved source often lands on a real pair); two seeds give two lists; the same seed the same list; the list handed in is not touched",
        kept.every((n) => n < 30) && samePlace.every((n) => n < 140) && J(sh[0]) !== J(sh[1]) && J(DS.degreeShuffle(REAL, 9017)) === J(sh[0]) && J(REAL) === J(T.EDGES) && DS.SWAPS_PER_EDGE === 20, `keep their source: ${kept.join(", ")}; in a real place: ${samePlace.join(", ")}`);
    const tiny = DS.degreeShuffle([[1, 0], [3, 2]], 4), ring = DS.degreeShuffle([[1, 0], [2, 1], [0, 2]], 7);
    ok("by hand: two connections 0->1 and 2->3 can only become 2->1 and 0->3 or stay; a ring of three (0->1->2->0) has no swap that does not make a connection from a cell to itself, and comes back as it is; one connection, or none, comes back as it is",
        (J(tiny) === J([[1, 2], [3, 0]]) || J(tiny) === J([[1, 0], [3, 2]])) && J(ring) === J([[1, 0], [2, 1], [0, 2]]) && J(DS.degreeShuffle([[1, 0]], 3)) === J([[1, 0]]) && J(DS.degreeShuffle([], 3)) === J([]));
    ok("what is not a list of connections, or not a seed, is refused by name: a cell to itself, a connection twice, a seed that is not a whole number", throws(() => DS.degreeShuffle([[1, 1]], 1), /none a cell to itself/) && throws(() => DS.degreeShuffle([[1, 0], [1, 0]], 1), /a connection is in the list twice/) && throws(() => DS.degreeShuffle(REAL, 1.5), /the seed is a whole number/) && throws(() => DS.degreeShuffle("x", 1), /edges is a list/));
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_DEGREE_WIP.md"), flat = note.replace(/\s+/g, " ");
    ok("!! THE ROUND IS ROUND 5'S TASK AND TRAINER ON NEW DRAWS: round 3's recipe to the number, the reflex start, the report \"return\", no memory, round 5's audit, floors and alpha; THE DRAWS ARE 17 TO 48 (32 an arm, none of round 5's 1 to 16); three arms, the lead GF against GDEG and GSHUF; its own results file",
        J(V.RECIPE) === J(V3.RECIPE) && V.START === "reflex" && V.REPORT === "return" && V.MEMORY === false && J(V.AUDIT) === J(V5.AUDIT) && J(V.FLOORS) === J(V5.FLOORS) && V.ALPHA === 0.01 && J(V.SEEDS) === J(Array.from({ length: 32 }, (_, k) => 17 + k)) && J(V.SEEDS) === J(V.DRAWS) && !V.SEEDS.some((s) => V5.SEEDS.includes(s)) &&
        J(V.ARMS) === J(["GF", "GDEG", "GSHUF"]) && V.LEAD === "GF" && J(V.VERSUS) === J(["GDEG", "GSHUF"]) && V.RESULTS === "brain/flyEscapeDegreeRound.jsonl" && V.RESULTS !== V5.RESULTS && note.includes("`" + V.RESULTS + "`") && V.ROUND6.arms === V.ARMS_OF && /New draws: 17 to 48, 32 an arm/.test(note) && /96 trainings/.test(note));
    ok("!! THE WORDS ARE THE REGISTRATION'S: D1 (the real wiring against a shuffle that keeps every cell's counts), D2 (round 5's T1's words, to the letter), D3 (keeping the counts against a free shuffle), and round 5's T0 and T3; the failing line is 0.72 and the registration names it",
        J(V.WORDS.D2) === J(V5.WORDS.T1) && J(V.WORDS.T0) === J(V5.WORDS.T0) && J(V.WORDS.T3) === J(V5.WORDS.T3) && ["D1", "D3"].every((d) => V.WORDS[d].length === 3 && /BETTER/.test(V.WORDS[d][0]) && /WORSE/.test(V.WORDS[d][1]) && /CANNOT BE TOLD APART/.test(V.WORDS[d][2]) && flat.includes("`" + V.WORDS[d][0])) &&
        /A SHUFFLE THAT KEEPS EVERY CELL'S COUNTS$/.test(V.WORDS.D1[0]) && /^KEEPING EVERY CELL'S COUNTS .* A FREE SHUFFLE$/.test(V.WORDS.D3[0]) && V.FAIL_BELOW === 0.72 && /a failure being a score below 0\.72/.test(note));
    const inner = (a, s = 20) => V.policyOf(a, s).inner, gf = inner("GF"), dg = inner("GDEG"), sh = inner("GSHUF"), places = (p) => arr(p.to).map((t, k) => [t, p.from[k]]);
    ok("!! EVERY ARM IS ROUND 5'S FLY BUT FOR ITS CONNECTIONS: 454 weights, the 42 cells, round 5's inputs (looming into LC4, size into LPLC2, nothing into a Giant Fiber), read from the two Giant Fibers, inside the reflex wrapper; GF's draw 20 is round 5's GF of that draw weight for weight, and GSHUF's is round 5's GSHUF (shuffledEdges(42, 369, 7020))",
        J(V.WEIGHTS) === J({ GF: 454, GDEG: 454, GSHUF: 454 }) && [gf, dg, sh].every((p) => p instanceof M.MaskedCircuitPolicy && p.units === 42 && J(arr(p.inUnit)) === J(V5.VISUAL_INPUTS.map((e) => e[0])) && J(arr(p.inObs)) === J(V5.VISUAL_INPUTS.map((e) => e[1])) && J(arr(p.out)) === J([40, 41])) && V.ARMS.every((a) => V.policyOf(a, 20) instanceof RS.ReflexStart) &&
        J(arr(V.policyOf("GF", 20).getParams())) === J(arr(V5.policyOf("GF", 20).getParams())) && J(arr(V.policyOf("GSHUF", 20).getParams())) === J(arr(V5.policyOf("GSHUF", 20).getParams())) && J(places(sh)) === J(P.shuffledEdges(42, 369, 7020)) && J(places(gf)) === J(REAL));
    ok("!! *** GDEG IS THE COUNT-KEEPING SHUFFLE OF THE DRAW, WITH EVERY STRENGTH WHERE IT LANDED ***: its connections are degreeShuffle(the real ones, 9000 + the draw), another draw's are others, and its starting weights are the real ones in the real order -- so each cell starts with the strength it receives in the real circuit (0.01 x; the Giant Fibers 23.57 between them) and the three arms' starting strengths are one list",
        V.DEGREE_SEED === 9000 && J(places(dg)) === J(DS.degreeShuffle(REAL, 9020)) && J(places(dg)) !== J(places(inner("GDEG", 21))) && J(places(dg)) !== J(REAL) && J(arr(dg.Wrec)) === J(arr(gf.Wrec)) && J(arr(sh.Wrec)) === J(arr(gf.Wrec)) && J(arr(gf.Wrec)) === J(arr(Float32Array.from(V5.EDGE_START))) &&
        J(strengthIn(places(dg), arr(dg.Wrec))) === J(strengthIn(REAL, arr(gf.Wrec))) && near(strengthIn(places(dg), arr(dg.Wrec))[40] + strengthIn(places(dg), arr(dg.Wrec))[41], 23.57, 1e-4) && J(V.circuitOf("GDEG", 20).edges) === J(DS.degreeShuffle(REAL, 9020)));
    // what the three arms have, counted over the round's 32 draws
    const vis = (e) => e.filter((x) => x[0] >= 40 && x[1] < 40), own = (e) => vis(e).filter((x) => T.NEURON_SIDES[x[0]] === T.NEURON_SIDES[x[1]]).length, within = (e) => e.filter((x) => x[0] < 40 && x[1] < 40 && T.NEURON_TYPES[x[0]] === T.NEURON_TYPES[x[1]] && T.NEURON_SIDES[x[0]] === T.NEURON_SIDES[x[1]]).length;
    const over = (a, f) => V.SEEDS.map((s) => f(V.circuitOf(a, s).edges)), rng = (v) => `${Math.min(...v)} to ${Math.max(...v)}`, D = { n: over("GDEG", (e) => vis(e).length), own: over("GDEG", own), w: over("GDEG", within) }, S = { n: over("GSHUF", (e) => vis(e).length), w: over("GSHUF", within) };
    ok("!! *** WHAT GDEG KEEPS AND WHAT IT LOSES, COUNTED OVER THE ROUND'S 32 DRAWS ***: the real circuit has 40 connections from visual cells onto the Giant Fibers, every one on the fibre's own side, and 295 connections between cells of one type and side. A GDEG draw has 40 to 42 onto the Giant Fibers (a free shuffle 12 to 26) but only 16 to 25 of them on the fibre's own side, and 60 to 92 within a type and side -- no more than a free shuffle's 61 to 88",
        vis(REAL).length === 40 && own(REAL) === 40 && within(REAL) === 295 && J([Math.min(...D.n), Math.max(...D.n)]) === J([40, 42]) && J([Math.min(...S.n), Math.max(...S.n)]) === J([12, 26]) && J([Math.min(...D.own), Math.max(...D.own)]) === J([16, 25]) && J([Math.min(...D.w), Math.max(...D.w)]) === J([60, 92]) && J([Math.min(...S.w), Math.max(...S.w)]) === J([61, 88]),
        `GDEG: onto the Giant Fibers ${rng(D.n)}, own side ${rng(D.own)}, within a type and side ${rng(D.w)}; GSHUF: onto the Giant Fibers ${rng(S.n)}, within ${rng(S.w)}`);
    const A40 = V.AUDIT.slice(0, 40), ref = V.auditScore(E.RULES.reflex, A40), fl = V.floors(A40);
    ok("!! EVERY ARM'S UNTRAINED FLY IS THE REFLEX: on 40 episodes each arm's untrained draw 19 has the reflex's score and counts to the bit, as the floors say", V.ARMS.every((a) => { const p = V.policyOf(a, 19); return J(V.auditScore((o) => p.act(o), A40)) === J(ref); }) && V.ARMS.every((a) => fl.untrained[a] === fl.reflex.score) && J(Object.keys(fl.untrained)) === J(V.ARMS));
    ok("!! A ROUND'S OWN DRAWS (the hook added to tools/ship/flyEscape.mjs for this round): without them a round's draws are 1 to 16, as every earlier round's; a list that is not distinct whole numbers above 0, or has fewer than two, is refused by name",
        J(V5.SEEDS) === J(Array.from({ length: 16 }, (_, k) => k + 1)) && J(V1.SEEDS) === J(V5.SEEDS) && [[3], [3, 3], [0, 2], [1.5, 2], "x"].every((seeds) => throws(() => V1.makeEscapeRound({ ...V.ROUND6, seeds }), /cfg\.seeds is a list of distinct whole numbers above 0, at least two/)) && J(V1.makeEscapeRound({ ...V.ROUND6, seeds: [5, 9] }).SEEDS) === J([5, 9]));
});

console.log("\n3. ONE TRAINING (3 iterations, 16 flies tried, 160 ticks, a battery of 30, on draw 901)");
section(() => {
    const r = V.trainOne("GDEG", 901, TINY, TINY_AUDIT), g = V.trainOne("GF", 901, TINY, TINY_AUDIT), g5 = V5.trainOne("GF", 901, TINY, TINY_AUDIT), edges = DS.degreeShuffle(REAL, 9901);
    const direct = trainDockES({ envFactory: (o = {}) => new E.EscapeEnv({ maxSteps: 160, report: "return", ...o }), obsDim: 13, actDim: 1, maxSteps: 160, iters: 3, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 8, seed: 901, freshEpisodes: true, batteryEps: 30,
        policyFactory: ({ obsDim, seed }) => new RS.ReflexStart(new M.MaskedCircuitPolicy({ obsDim, units: 42, inputs: V5.VISUAL_INPUTS.map((e) => [...e]), edges, outputs: [40, 41], edgeStart: T.SYNAPSES.map((n) => n * 0.01), seed }), { rule: E.RULES.reflex, tail: 3 }) });
    ok("!! A GDEG RECORD'S WEIGHTS ARE THE TRAINER'S FROM A WRAPPED POLICY MADE HERE BY HAND (the draw's count-keeping shuffle, the real strengths in the real order, read from the two Giant Fibers, inside the reflex wrapper; fresh episodes; the recipe's battery), to the hash; the record carries its wiring; and this round's GF training is round 5's code's, to the hash",
        PF.hashWeights(direct.params) === r.weightsHash && r.weightCount === 454 && r.edges === 369 && r.units === 42 && r.edgesHash === PF.hashEdges(edges) && r.edgesHash !== g.edgesHash && g.edgesHash === PF.hashEdges(T.EDGES) && g.weightsHash === g5.weightsHash && r.weightsHash !== g.weightsHash && J(r.recipe) === J(TINY));
    const start = arr(V.policyOf("GDEG", 901).getParams()), end = arr(PF.unpackWeights(r.weights)), p = V.policyOf("GDEG", 901); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore((o) => p.act(o), TINY_AUDIT, 160);
    ok("the tiny training is a training (its weights moved), and its weights give its score again: in the GDEG fly of that draw, audited on the same episodes, to the bit", start.some((v, i) => v !== end[i]) && a.score === r.score && a.alive === r.alive && a.fledPass === r.fledPass, `${start.filter((v, i) => v !== end[i]).length} of 454 weights moved`);
});

console.log("\n4. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, ret: 0.65 + (k === 0 ? 0 : 0.03) + s / 100000, lived: 0 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), score, alive: 170, fed: 0.5, strikes: 400, caught: 30, passes: 300, fledPass: 60, history: hist(s) }; };
    const flo = () => ({ kind: "floors", ...Object.fromEntries(Object.entries(V.FLOORS).map(([k, v]) => [k, { score: v, alive: 150, fed: 0.3, strikes: 400, caught: 40, passes: 300, fledPass: 80 }])), untrained: Object.fromEntries(V.ARMS.map((a) => [a, V.FLOORS.reflex])) });
    const file = (scoreOf, first = 17) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "GF", s: first, weightsHash: out.find((r) => r.arm === "GF" && r.s === first).weightsHash }, flo()); return out; };
    const lvl = (gf, dg, sh) => (arm, s) => ({ GF: gf, GDEG: dg, GSHUF: sh })[arm] + s / 100000, good = file(lvl(0.75, 0.75, 0.75));
    ok("!! a file of 96 draws (three arms, draws 17 to 48) with GF DRAW 17 a second time passes every check and its first line says 96 and draw 17; a draw of round 5's (draw 3), a GDEG draw recorded with the real wiring or with another draw's shuffle, and a second training of draw 18 in draw 17's place each fail by name",
        V.checkRecords(good).length === 0 && good.length === 98 && /^the checks hold: 96 draws, each once.*GF draw 17 the same twice/.test(V.readingLines(V.reading(good))[0]) &&
        (() => { const L = JSON.parse(J(good)); L[0].s = 3; return V.checkRecords(L).some((b) => /GF draw 3 is not a registered draw/.test(b)); })() &&
        [PF.hashEdges(T.EDGES), PF.hashEdges(DS.degreeShuffle(REAL, 9031))].every((h) => { const L = JSON.parse(J(good)), g = L.find((r) => r.arm === "GDEG" && r.s === 30); g.edgesHash = h; return J(V.checkRecords(L)) === J(["GDEG draw 30's wiring is not its arm's"]); }) &&
        J(V.checkRecords(file(lvl(0.75, 0.75, 0.75), 18))) === J(["GF draw 17 trained a second time is not there once with the same weights"]), V.checkRecords(good).slice(0, 2).join(" | "));
    ok("!! THE SECOND TRAINING'S RECORD MUST SAY IT IS OF DRAW 17 (sabotage K27 first went 0 red, and this row is its answer): the same file with that record's draw written as 18 -- its weights still draw 17's -- fails by name", (() => { const L = JSON.parse(J(good)); L.find((r) => r.kind === "recheck").s = 18; return J(V.checkRecords(L)) === J(["GF draw 17 trained a second time is not there once with the same weights"]); })());
    const a = V.reading(file(lvl(0.75, 0.75, 0.70))), b = V.reading(file(lvl(0.75, 0.70, 0.70))), c = V.reading(file(lvl(0.70, 0.75, 0.72))), same = V.reading(good);
    ok("!! D1 IS GF AGAINST GDEG, D2 GF AGAINST GSHUF, D3 GDEG AGAINST GSHUF, rank-sums of 32 against 32 with the registration's words: (the convergence) GF and GDEG level and both above GSHUF -> D1 CANNOT, D2 BETTER, D3 BETTER; (the wiring) GF above both, which are level -> D1 BETTER, D2 BETTER, D3 CANNOT; GF below both and GDEG above GSHUF -> D1 WORSE, D2 WORSE, D3 BETTER; all level -> CANNOT three times",
        a.D1.word === V.WORDS.D1[2] && a.D2.word === V.WORDS.D2[0] && a.D3.word === V.WORDS.D3[0] && b.D1.word === V.WORDS.D1[0] && b.D2.word === V.WORDS.D2[0] && b.D3.word === V.WORDS.D3[2] && c.D1.word === V.WORDS.D1[1] && c.D2.word === V.WORDS.D2[1] && c.D3.word === V.WORDS.D3[0] &&
        [same.D1, same.D2, same.D3].every((t, k) => t.word === V.WORDS["D" + (k + 1)][2]) && a.D1.n === 32 && a.D1.m === 32 && a.D3.n === 32 && a.D2.p < 1e-10 && V.reading(file(lvl(0.75, 0.70, 0.75))).D3.word === V.WORDS.D3[1]);
    const mixed = V.reading(file((arm, s) => (arm === "GSHUF" && s % 4 === 0 ? 0.68 : arm === "GDEG" && s === 20 ? 0.7199 : 0.75) + s / 1000000)), lines = V.readingLines(mixed).join("\n");
    ok("!! THE FAILURES ARE COUNTED AS REGISTERED, A SCORE BELOW 0.72: a GSHUF arm with every fourth draw at 0.68 has 8 of 32, a GDEG arm with one draw at 0.7199 has 1, GF none; T0 is the 32 GF flies against the reflex and T3 all 96; the lines say D3, the failures, and which of the reading's tests D1 and D2 are",
        J(mixed.failed) === J({ GF: 0, GDEG: 1, GSHUF: 8 }) && mixed.T0.n === 32 && mixed.T0.above === 32 && mixed.T3.n === 96 && mixed.T3.above === 96 && /D3 \(GDEG against GSHUF\): GDEG's ranks sum to /.test(lines) && /trainings that FAILED \(a score below 0\.72\), of 32 an arm: GF 0; GDEG 1; GSHUF 8/.test(lines) && /T1 \(GF against GDEG\)/.test(lines) && /T2 \(GF against GSHUF\)/.test(lines) && /D1 is T1 above, GF against GDEG; its D2 is T2, GF against GSHUF/.test(lines));
    ok("with a failed check no test is made: a file short of a draw has D1, D2 and D3 null and says a check failed first", (() => { const R = V.reading(good.filter((r) => !(r.arm === "GDEG" && r.s === 40))); return R.D1 === null && R.D2 === null && R.D3 === null && /A CHECK FAILED/.test(V.readingLines(R)[0]) && R.checks.some((x) => /GDEG draw 40 is there 0 times/.test(x)); })());
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "FREE", "17"], ["job", "GF", "x"], ["job", "GF", "16"], ["job", "GF", "49"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for one of this round's three arms and one of ITS draws: draw 16 and draw 49 are not, nor is an arm of round 5's alone)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "GDEG", "48"])) === J({ cmd: "job", arm: "GDEG", s: 48 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeDegree.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, and trains THE LEAD ARM'S FIRST DRAW a second time (by the library's names for them: GF, draw 17), not draw 1",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeDegree\.mjs"/.test(csrc) && !/Vision|"\.\/flyEscape\.mjs"|"\.\/flyEscapeFresh\.mjs"|voxelHome/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && !/jobOnce\(PF\.LEAD, 1\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeDegree\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && V.SEEDS[0] === 17);
    const me = src("tools/ship/flyEscapeDegree-selfcheck.mjs"), calls = [...me.matchAll(/V5?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its three trainings through the rounds' code are of 3 iterations with 16 flies tried on draw 901; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 3 && calls.every((c) => /^"(GF|GDEG)", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 3 && TINY.pop === 16 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyEscapeDegree-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
