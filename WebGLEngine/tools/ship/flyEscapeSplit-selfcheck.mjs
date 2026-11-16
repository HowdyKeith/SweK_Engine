// WebGLEngine/tools/ship/flyEscapeSplit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeSplit-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 7 (registered in brain/FLY_ESCAPE_SPLIT_WIP.md before brain/rl/splitShuffle.mjs and tools/ship/flyEscapeSplit.mjs existed): which part of the counts carries round 6's
// difference -- each cell's count in, its count out, or what the two Giant Fibers receive? Five arms on 32 new draws an arm.
//   1  THE SHUFFLES          brain/rl/splitShuffle.mjs: what each of the three keeps, exactly, and what it lets go
//   2  THE ROUND'S NUMBERS   round 6's task and trainer; five arms; draws 49 to 80; what each arm gives the Giant Fibers, counted
//   3  ONE TRAINING          a record's weights are the trainer's from a wrapped policy made here by hand
//   4  THE RECORDS           160 draws; R0, K1, K2, K3; each part beside GDEG; the failures
//   5  THE COMMAND           it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-16) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a
// process) run whole for each; every one red by name, none 0 red (the number is the rows red over the two):
//   THE SHUFFLES (brain/rl/splitShuffle.mjs): S1 inShuffle keeps the source, not the target 4 | S2 outShuffle keeps the target, not the source 4 | S3 a redrawn end may repeat a connection 4
//   S4 a redrawn end may be the cell itself 5 | S5 the redraw ignores its seed 5 | S6 keepOnto keeps nothing 4 | S7 keepOnto places the others onto a kept cell too 7 | S8 keepOnto ignores its seed 2
//   S9 keepOnto places the others in order, unshuffled 2 | S10 the redraw always takes the first free cell 7
//   THE ROUND (tools/ship/flyEscapeSplit.mjs): F1 GIN is the out shuffle 4 | F2 GOUT is the in shuffle 4 | F3 GGF keeps what two visual cells receive 3 | F4 GDEG is the real wiring 3
//   F5 every draw's GIN is one shuffle 3 | F6 the draws are round 6's 5 | F7 sixteen draws an arm 8 | F8 K1 is of GOUT and K2 of GIN 4 | F9 the K tests are against GDEG 1
//   F10 the K tests' BETTER and WORSE each other's 1 | F11 the K tests are made with a failed check 1 | F12 the parts are set beside GSHUF, not GDEG 1 | F13 the lead is GIN 3
//   F14 the failing line is 0.70 2 | F15 the round writes round 6's results file 1 | F16 R0's words are K1's 1 | F17 GOUT's seeds are GIN's 3 | F18 the shuffles start with no strengths 4
//   F19 R0 is against GOUT 3 | F20 every draw's free shuffle is one shuffle 2 | F21 a failure is any score under 0.76 2
//   THE COMMAND: C1 the second training is of the second draw 1 | C2 exits 0 on a word it does not know 1 | C3 reads round 6's library 1
//   Two throws of mine could never fire (a list of distinct connections always leaves a free cell, and always fits its places) and were taken out before the sabotages, with the row that pretended to
//   test one of them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeSplit.mjs";
import * as V6 from "./flyEscapeDegree.mjs";
import * as V5 from "./flyEscapeVision.mjs";
import * as V3 from "./flyEscapeFresh.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as RS from "../../brain/rl/reflexStart.mjs";
import * as M from "../../brain/rl/maskedCircuitPolicy.mjs";
import * as DS from "../../brain/rl/degreeShuffle.mjs";
import * as SS from "../../brain/rl/splitShuffle.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: 160, iters: 3, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 8, fresh: true, battery: 30 }), TINY_AUDIT = [880001, 880002, 880003, 880004, 880005, 880006];
const REAL = T.EDGES.map((e) => [e[0], e[1]]), key = (e) => e[0] * 100 + e[1], counts = (edges, n = 42) => { const i = new Array(n).fill(0), o = new Array(n).fill(0); for (const [to, from] of edges) { i[to]++; o[from]++; } return [i, o]; };
const sumBy = (edges, w, end, n = 42) => { const s = new Array(n).fill(0); edges.forEach((e, k) => { s[e[end]] += w[k]; }); return s; }, legal = (e) => e.length === 369 && new Set(e.map(key)).size === 369 && e.every((x) => x[0] !== x[1] && x[0] >= 0 && x[0] < 42 && x[1] >= 0 && x[1] < 42);
const lo = (v) => Math.min(...v), hi = (v) => Math.max(...v), span = (v) => [lo(v), hi(v)], rng = (v) => `${lo(v)} to ${hi(v)}`;

console.log("flyEscapeSplit-selfcheck -- the escape round 7 (which part of the counts?): the shuffles, the numbers, one training, the records, the command\n");

console.log("1. THE SHUFFLES (brain/rl/splitShuffle.mjs)");
section(() => {
    const seeds = [11049, 11050, 11080, 5, 6], inn = seeds.map((s) => SS.inShuffle(REAL, 42, s)), out = seeds.map((s) => SS.outShuffle(REAL, 42, s)), gf = seeds.map((s) => SS.keepOnto(REAL, 42, [40, 41], s)), RC = counts(REAL);
    ok("every shuffle is a legal list whatever the seed: 369 distinct connections among the 42 cells, none from a cell to itself; two seeds give two lists, the same seed the same list, and the list handed in is not touched",
        [inn, out, gf].every((L) => L.every(legal) && J(L[0]) !== J(L[1])) && J(SS.inShuffle(REAL, 42, 11049)) === J(inn[0]) && J(SS.outShuffle(REAL, 42, 11049)) === J(out[0]) && J(SS.keepOnto(REAL, 42, [40, 41], 11049)) === J(gf[0]) && J(REAL) === J(T.EDGES.map((e) => [e[0], e[1]])));
    ok("!! *** inShuffle KEEPS EVERY CONNECTION'S TARGET, AND SO EVERY CELL'S COUNT IN AND WHAT IT RECEIVES *** (each Giant Fiber its 21 connections and its 1,102 and 1,255 synapses) -- AND NOT ITS COUNT OUT: in each of five shuffles the counts out are not the real ones, and fewer than 30 connections keep their own source",
        inn.every((e) => e.every((x, k) => x[0] === REAL[k][0]) && J(counts(e)[0]) === J(RC[0]) && J(sumBy(e, T.SYNAPSES, 0)) === J(sumBy(REAL, T.SYNAPSES, 0)) && J(counts(e)[1]) !== J(RC[1]) && e.filter((x, k) => x[1] === REAL[k][1]).length < 30) && RC[0][40] === 21 && RC[0][41] === 21 && sumBy(REAL, T.SYNAPSES, 0)[40] === 1102 && sumBy(REAL, T.SYNAPSES, 0)[41] === 1255);
    ok("!! *** outShuffle KEEPS EVERY CONNECTION'S SOURCE, AND SO EVERY CELL'S COUNT OUT AND WHAT IT SENDS -- AND NOT ITS COUNT IN ***: the counts in are not the real ones, fewer than 30 connections keep their own target, and the Giant Fibers, which receive 42 connections in the real circuit, receive fewer than 30",
        out.every((e) => e.every((x, k) => x[1] === REAL[k][1]) && J(counts(e)[1]) === J(RC[1]) && J(sumBy(e, T.SYNAPSES, 1)) === J(sumBy(REAL, T.SYNAPSES, 1)) && J(counts(e)[0]) !== J(RC[0]) && e.filter((x, k) => x[0] === REAL[k][0]).length < 30 && counts(e)[0][40] + counts(e)[0][41] < 30));
    const ontoReal = REAL.map((e, k) => [k, e]).filter(([, e]) => e[0] >= 40);
    ok("!! *** keepOnto KEEPS THE 42 CONNECTIONS ONTO THE TWO GIANT FIBERS WHOLE, IN THEIR PLACES IN THE LIST, AND NOTHING ELSE ***: every one of them is the real one, no other connection is onto a fibre, the other 327 are not the real list's (fewer than 40 of them keep both ends), and the other cells' counts in are not the real ones",
        ontoReal.length === 42 && gf.every((e) => ontoReal.every(([k, x]) => J(e[k]) === J(x)) && e.filter((x) => x[0] >= 40).length === 42 && e.filter((x, k) => x[0] < 40 && J(x) === J(REAL[k])).length < 40 && J(counts(e)[0].slice(0, 40)) !== J(RC[0].slice(0, 40)) && counts(e)[0][40] === 21 && counts(e)[0][41] === 21));
    ok("by hand: 0->1 and 2->3 among four cells -- inShuffle leaves the targets 1 and 3 and never gives 1 itself; outShuffle leaves the sources 0 and 2; keepOnto [1] leaves 0->1 where it is and puts the other connection anywhere not onto cell 1; and a cell that every other cell already reaches can only be reached by them again",
        [1, 2, 3, 4, 5, 6, 7, 8].every((s) => { const a = SS.inShuffle([[1, 0], [3, 2]], 4, s), b = SS.outShuffle([[1, 0], [3, 2]], 4, s), c = SS.keepOnto([[1, 0], [3, 2]], 4, [1], s); return a[0][0] === 1 && a[1][0] === 3 && a[0][1] !== 1 && a[1][1] !== 3 && b[0][1] === 0 && b[1][1] === 2 && b[0][0] !== 0 && J(c[0]) === J([1, 0]) && c[1][0] !== 1 && c[1][0] !== c[1][1]; }) &&
        J(SS.inShuffle([[0, 1], [0, 2]], 3, 9).map((e) => e[1]).sort()) === J([1, 2]) && J(SS.inShuffle([], 3, 1)) === J([]) && new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => J(SS.inShuffle([[1, 0], [3, 2]], 4, s)))).size > 1);
    ok("what is not a list of connections, a count of cells, a seed or a list of cells is refused by name",
        throws(() => SS.inShuffle([[1, 1]], 3, 1), /none a cell to itself/) && throws(() => SS.outShuffle([[1, 0], [1, 0]], 3, 1), /a connection is in the list twice/) && throws(() => SS.inShuffle(REAL, 42, 1.5), /the seed is a whole number/) && throws(() => SS.outShuffle("x", 3, 1), /edges is a list/) && throws(() => SS.inShuffle([[5, 0]], 3, 1), /pairs of cells 0\.\.2/) &&
        throws(() => SS.keepOnto(REAL, 42, [42], 1), /onto is a list of cells 0\.\.41/) && throws(() => SS.keepOnto(REAL, 1, [0], 1), /units is a whole number, at least 2/) && J(SS.keepOnto([[1, 0], [0, 1], [2, 0], [0, 2]], 3, [1, 2], 1)) === J([[1, 0], [0, 1], [2, 0], [0, 2]]));
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_SPLIT_WIP.md");
    ok("!! THE ROUND IS ROUND 6'S TASK AND TRAINER ON NEW DRAWS: its recipe to the number, the reflex start, the report \"return\", no memory, its audit, floors, failing line (0.72) and alpha; THE DRAWS ARE 49 TO 80 (32 an arm, none of round 5's or round 6's); five arms, the lead GDEG against GSHUF; its own results file",
        J(V.RECIPE) === J(V6.RECIPE) && J(V.RECIPE) === J(V3.RECIPE) && V.START === "reflex" && V.REPORT === "return" && V.MEMORY === false && J(V.AUDIT) === J(V6.AUDIT) && J(V.FLOORS) === J(V6.FLOORS) && V.ALPHA === 0.01 && V.FAIL_BELOW === 0.72 && V.FAIL_BELOW === V6.FAIL_BELOW && J(V.SEEDS) === J(Array.from({ length: 32 }, (_, k) => 49 + k)) && J(V.SEEDS) === J(V.DRAWS) &&
        !V.SEEDS.some((s) => V5.SEEDS.includes(s) || V6.SEEDS.includes(s)) && J(V.ARMS) === J(["GDEG", "GIN", "GOUT", "GGF", "GSHUF"]) && V.LEAD === "GDEG" && J(V.VERSUS) === J(["GSHUF"]) && V.RESULTS === "brain/flyEscapeSplitRound.jsonl" && ![V5.RESULTS, V6.RESULTS].includes(V.RESULTS) && note.includes("`" + V.RESULTS + "`") && V.ROUND7.arms === V.ARMS_OF &&
        /New draws: 49 to 80, 32 an arm/.test(note) && /160 trainings/.test(note) && /a score below 0\.72/.test(note));
    ok("!! THE WORDS: R0 is round 6's D3 to the letter; K1 is of the count in, K2 the count out, K3 what the two Giant Fibers receive, each against a free shuffle, each with BETTER, WORSE and CANNOT BE TOLD APART in that order; T0 is of a fly whose wiring keeps every cell's counts; and K1, K2, K3 are the arms the registration gives them",
        J(V.WORDS.R0) === J(V6.WORDS.D3) && J(V.PARTS) === J({ K1: "GIN", K2: "GOUT", K3: "GGF" }) && ["K1", "K2", "K3", "T0"].every((d) => V.WORDS[d].length === 3 && /BETTER/.test(V.WORDS[d][0]) && /WORSE/.test(V.WORDS[d][1]) && /CANNOT BE TOLD APART/.test(V.WORDS[d][2])) && /COUNT IN ESCAPES BETTER THAN A FREE SHUFFLE$/.test(V.WORDS.K1[0]) && /COUNT OUT ESCAPES BETTER THAN A FREE SHUFFLE$/.test(V.WORDS.K2[0]) &&
        /^KEEPING ONLY WHAT THE TWO GIANT FIBERS RECEIVE ESCAPES BETTER THAN A FREE SHUFFLE$/.test(V.WORDS.K3[0]) && /KEEPS EVERY CELL'S COUNTS/.test(V.WORDS.T0[0]) && J(V.WORDS.T3) === J(V6.WORDS.T3) && /K1: GIN against GSHUF\. K2: GOUT against GSHUF\. K3: GGF against GSHUF/.test(note) && /R0: GDEG against GSHUF/.test(note));
    const inner = (a, s = 50) => V.policyOf(a, s).inner, places = (p) => arr(p.to).map((t, k) => [t, p.from[k]]), all = V.ARMS.map((a) => inner(a));
    ok("!! EVERY ARM IS ROUND 6'S FLY BUT FOR ITS CONNECTIONS: 454 weights, the 42 cells, round 5's inputs, read from the two Giant Fibers, inside the reflex wrapper; and THE FIVE ARMS' STARTING STRENGTHS ARE ONE LIST, the real synapse counts x 0.01 in the real order",
        J(V.WEIGHTS) === J({ GDEG: 454, GIN: 454, GOUT: 454, GGF: 454, GSHUF: 454 }) && all.every((p) => p instanceof M.MaskedCircuitPolicy && p.units === 42 && J(arr(p.inUnit)) === J(V5.VISUAL_INPUTS.map((e) => e[0])) && J(arr(p.inObs)) === J(V5.VISUAL_INPUTS.map((e) => e[1])) && J(arr(p.out)) === J([40, 41]) && J(arr(p.Wrec)) === J(arr(Float32Array.from(V5.EDGE_START)))) && V.ARMS.every((a) => V.policyOf(a, 50) instanceof RS.ReflexStart));
    ok("!! *** EACH ARM IS ITS OWN SHUFFLE OF THE DRAW ***: GDEG is degreeShuffle(real, 9000 + s) and round 6's GDEG of that draw weight for weight; GIN inShuffle(real, 42, 11000 + s); GOUT outShuffle(real, 42, 12000 + s); GGF keepOnto(real, 42, the two fibres, 13000 + s); GSHUF shuffledEdges(42, 369, 7000 + s) and round 5's; no two arms' lists are one list, and another draw's are others",
        V.IN_SEED === 11000 && V.OUT_SEED === 12000 && V.ONTO_SEED === 13000 && J(places(inner("GDEG"))) === J(DS.degreeShuffle(REAL, 9050)) && J(arr(V.policyOf("GDEG", 50).getParams())) === J(arr(V6.policyOf("GDEG", 50).getParams())) && J(places(inner("GIN"))) === J(SS.inShuffle(REAL, 42, 11050)) && J(places(inner("GOUT"))) === J(SS.outShuffle(REAL, 42, 12050)) &&
        J(places(inner("GGF"))) === J(SS.keepOnto(REAL, 42, [40, 41], 13050)) && J(places(inner("GSHUF"))) === J(P.shuffledEdges(42, 369, 7050)) && J(arr(V.policyOf("GSHUF", 50).getParams())) === J(arr(V5.policyOf("GSHUF", 50).getParams())) && new Set(all.map((p) => J(places(p)))).size === 5 && V.ARMS.every((a) => J(places(inner(a))) !== J(places(inner(a, 51))) && J(V.circuitOf(a, 50).edges) === J(places(inner(a)))));
    const over = (a, f) => V.SEEDS.map((s) => f(V.circuitOf(a, s).edges)), onto = (e) => e.filter((x) => x[0] >= 40).length, syn = (e) => { let n = 0; e.forEach((x, k) => { if (x[0] >= 40) n += T.SYNAPSES[k]; }); return n; }, realOnto = (e) => e.filter((x, k) => x[0] >= 40 && J(x) === J(REAL[k])).length;
    const O = Object.fromEntries(V.ARMS.map((a) => [a, { n: over(a, onto), syn: over(a, syn), real: over(a, realOnto), inOk: over(a, (e) => J(counts(e)[0]) === J(counts(REAL)[0])), outOk: over(a, (e) => J(counts(e)[1]) === J(counts(REAL)[1])), legal: over(a, legal) }]));
    ok("!! *** WHAT EACH ARM GIVES THE TWO GIANT FIBERS, COUNTED OVER THE ROUND'S 32 DRAWS *** (the real circuit: 42 connections, 2,357 of the 3,894 synapses): GDEG, GIN and GGF 42 and 2,357 in every draw; GOUT 12 to 25 connections carrying 51 to 489 synapses; GSHUF 9 to 28 carrying 49 to 360. Only GGF's 42 are the real connections themselves, every draw",
        V.ARMS.every((a) => O[a].legal.every(Boolean)) && ["GDEG", "GIN", "GGF"].every((a) => J(span(O[a].n)) === J([42, 42]) && J(span(O[a].syn)) === J([2357, 2357])) && J(span(O.GOUT.n)) === J([12, 25]) && J(span(O.GOUT.syn)) === J([51, 489]) && J(span(O.GSHUF.n)) === J([9, 28]) && J(span(O.GSHUF.syn)) === J([49, 360]) &&
        J(span(O.GGF.real)) === J([42, 42]) && hi(O.GDEG.real) < 12 && hi(O.GIN.real) < 12 && T.SYNAPSES.reduce((a, b) => a + b, 0) === 3894 && /9 to 28 connections \(mean 16\.8\) carrying 49 to 360/.test(note.replace(/\s+/g, " ")),
        `onto the fibres -- GOUT ${rng(O.GOUT.n)} (${rng(O.GOUT.syn)} synapses), GSHUF ${rng(O.GSHUF.n)} (${rng(O.GSHUF.syn)}); real ones among them: GDEG up to ${hi(O.GDEG.real)}, GIN up to ${hi(O.GIN.real)}`);
    ok("!! AND WHICH COUNTS EACH KEEPS, EVERY DRAW: GDEG both; GIN the counts in and not the counts out; GOUT the counts out and not the counts in; GGF and GSHUF neither",
        O.GDEG.inOk.every(Boolean) && O.GDEG.outOk.every(Boolean) && O.GIN.inOk.every(Boolean) && !O.GIN.outOk.some(Boolean) && O.GOUT.outOk.every(Boolean) && !O.GOUT.inOk.some(Boolean) && !O.GGF.inOk.some(Boolean) && !O.GGF.outOk.some(Boolean) && !O.GSHUF.inOk.some(Boolean) && !O.GSHUF.outOk.some(Boolean));
    const A40 = V.AUDIT.slice(0, 40), ref = V.auditScore(E.RULES.reflex, A40), fl = V.floors(A40);
    ok("!! EVERY ARM'S UNTRAINED FLY IS THE REFLEX: on 40 episodes each arm's untrained draw 51 has the reflex's score and counts to the bit, as the floors say", V.ARMS.every((a) => { const p = V.policyOf(a, 51); return J(V.auditScore((o) => p.act(o), A40)) === J(ref); }) && V.ARMS.every((a) => fl.untrained[a] === fl.reflex.score) && J(Object.keys(fl.untrained)) === J(V.ARMS));
});

console.log("\n3. ONE TRAINING (3 iterations, 16 flies tried, 160 ticks, a battery of 30, on draw 901)");
section(() => {
    const byHand = (edges) => trainDockES({ envFactory: (o = {}) => new E.EscapeEnv({ maxSteps: 160, report: "return", ...o }), obsDim: 13, actDim: 1, maxSteps: 160, iters: 3, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 8, seed: 901, freshEpisodes: true, batteryEps: 30,
        policyFactory: ({ obsDim, seed }) => new RS.ReflexStart(new M.MaskedCircuitPolicy({ obsDim, units: 42, inputs: V5.VISUAL_INPUTS.map((e) => [...e]), edges, outputs: [40, 41], edgeStart: T.SYNAPSES.map((n) => n * 0.01), seed }), { rule: E.RULES.reflex, tail: 3 }) });
    const want = { GIN: SS.inShuffle(REAL, 42, 11901), GOUT: SS.outShuffle(REAL, 42, 12901), GGF: SS.keepOnto(REAL, 42, [40, 41], 13901) };
    const recs = { GIN: V.trainOne("GIN", 901, TINY, TINY_AUDIT), GOUT: V.trainOne("GOUT", 901, TINY, TINY_AUDIT), GGF: V.trainOne("GGF", 901, TINY, TINY_AUDIT) }, d = V.trainOne("GDEG", 901, TINY, TINY_AUDIT), d6 = V6.trainOne("GDEG", 901, TINY, TINY_AUDIT);
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A WRAPPED POLICY MADE HERE BY HAND, for each of the three new arms (the draw's shuffle, the real strengths in the real order, read from the two Giant Fibers, inside the reflex wrapper; fresh episodes; the recipe's battery), to the hash; each record carries its own wiring; and this round's GDEG training is round 6's code's, to the hash",
        Object.keys(want).every((a) => PF.hashWeights(byHand(want[a]).params) === recs[a].weightsHash && recs[a].weightCount === 454 && recs[a].edges === 369 && recs[a].units === 42 && recs[a].edgesHash === PF.hashEdges(want[a]) && J(recs[a].recipe) === J(TINY)) &&
        new Set([...Object.values(recs), d].map((r) => r.edgesHash)).size === 4 && new Set([...Object.values(recs), d].map((r) => r.weightsHash)).size === 4 && d.weightsHash === d6.weightsHash && d.edgesHash === PF.hashEdges(DS.degreeShuffle(REAL, 9901)));
    const r = recs.GIN, start = arr(V.policyOf("GIN", 901).getParams()), end = arr(PF.unpackWeights(r.weights)), p = V.policyOf("GIN", 901); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore((o) => p.act(o), TINY_AUDIT, 160);
    ok("the tiny training is a training (its weights moved), and its weights give its score again: in the GIN fly of that draw, audited on the same episodes, to the bit", start.some((v, i) => v !== end[i]) && a.score === r.score && a.alive === r.alive && a.fledPass === r.fledPass, `${start.filter((v, i) => v !== end[i]).length} of 454 weights moved`);
});

console.log("\n4. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, ret: 0.65 + (k === 0 ? 0 : 0.03) + s / 100000, lived: 0 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), score, alive: 170, fed: 0.5, strikes: 400, caught: 30, passes: 300, fledPass: 60, history: hist(s) }; };
    const flo = () => ({ kind: "floors", ...Object.fromEntries(Object.entries(V.FLOORS).map(([k, v]) => [k, { score: v, alive: 150, fed: 0.3, strikes: 400, caught: 40, passes: 300, fledPass: 80 }])), untrained: Object.fromEntries(V.ARMS.map((a) => [a, V.FLOORS.reflex])) });
    const file = (scoreOf, first = 49) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "GDEG", s: first, weightsHash: out.find((r) => r.arm === "GDEG" && r.s === first).weightsHash }, flo()); return out; };
    const lvl = (m) => (arm, s) => m[arm] + s / 100000, flat = { GDEG: 0.75, GIN: 0.75, GOUT: 0.75, GGF: 0.75, GSHUF: 0.75 }, good = file(lvl(flat)), copy = () => JSON.parse(J(good));
    ok("!! a file of 160 draws (five arms, draws 49 to 80) with GDEG DRAW 49 a second time passes every check and its first line says 160 and draw 49; a draw of round 6's (draw 20), a GIN draw recorded with GOUT's wiring or another draw's, a second training of draw 50 in draw 49's place, and a second-training record that says draw 50 each fail by name",
        V.checkRecords(good).length === 0 && good.length === 162 && /^the checks hold: 160 draws, each once.*GDEG draw 49 the same twice/.test(V.readingLines(V.reading(good))[0]) &&
        (() => { const L = copy(); L[0].s = 20; return V.checkRecords(L).some((b) => /GDEG draw 20 is not a registered draw/.test(b)); })() &&
        [PF.hashEdges(V.circuitOf("GOUT", 60).edges), PF.hashEdges(V.circuitOf("GIN", 61).edges)].every((h) => { const L = copy(), g = L.find((r) => r.arm === "GIN" && r.s === 60); g.edgesHash = h; return J(V.checkRecords(L)) === J(["GIN draw 60's wiring is not its arm's"]); }) &&
        J(V.checkRecords(file(lvl(flat), 50))) === J(["GDEG draw 49 trained a second time is not there once with the same weights"]) && (() => { const L = copy(); L.find((r) => r.kind === "recheck").s = 50; return J(V.checkRecords(L)) === J(["GDEG draw 49 trained a second time is not there once with the same weights"]); })(), V.checkRecords(good).slice(0, 2).join(" | "));
    const rd = (m) => V.reading(file(lvl({ ...flat, ...m }))), W = V.WORDS, words = (R) => [R.R0.word, R.K1.word, R.K2.word, R.K3.word];
    const fib = rd({ GOUT: 0.70, GSHUF: 0.70 }), inOnly = rd({ GOUT: 0.70, GGF: 0.70, GSHUF: 0.70 }), outOnly = rd({ GIN: 0.70, GGF: 0.70, GSHUF: 0.70 }), none = rd({ GIN: 0.70, GOUT: 0.70, GGF: 0.70, GSHUF: 0.70 }), same = V.reading(good), worse = rd({ GDEG: 0.70, GIN: 0.70, GOUT: 0.70, GGF: 0.70, GSHUF: 0.74 });
    ok("!! R0 IS GDEG AGAINST GSHUF, K1 GIN, K2 GOUT, K3 GGF, EACH AGAINST GSHUF, rank sums of 32 against 32 with their own words: (the fibres) GDEG, GIN and GGF above GOUT and GSHUF -> BETTER, BETTER, CANNOT, BETTER; (the counts in alone) -> BETTER, BETTER, CANNOT, CANNOT; (the counts out alone) -> BETTER, CANNOT, BETTER, CANNOT; (no one part) -> BETTER, CANNOT, CANNOT, CANNOT; all level -> CANNOT four times; all below the free shuffle -> WORSE four times",
        J(words(fib)) === J([W.R0[0], W.K1[0], W.K2[2], W.K3[0]]) && J(words(inOnly)) === J([W.R0[0], W.K1[0], W.K2[2], W.K3[2]]) && J(words(outOnly)) === J([W.R0[0], W.K1[2], W.K2[0], W.K3[2]]) && J(words(none)) === J([W.R0[0], W.K1[2], W.K2[2], W.K3[2]]) && J(words(same)) === J([W.R0[2], W.K1[2], W.K2[2], W.K3[2]]) && J(words(worse)) === J([W.R0[1], W.K1[1], W.K2[1], W.K3[1]]) &&
        fib.R0 === fib.T1 && fib.K1.n === 32 && fib.K1.m === 32 && fib.K3.p < 1e-10 && fib.K1.sumA === 1552 && fib.K2.sumA === 1040);
    ok("!! EACH PART BESIDE GDEG IS DESCRIBED AND GIVEN NO WORD: a rank sum of the part's 32 against GDEG's 32 (a part level with GDEG at the middle, 1040; a part wholly below it at 528, p under 1e-10), for GIN, GOUT and GGF and no other arm",
        J(Object.keys(fib.beside)) === J(["GIN", "GOUT", "GGF"]) && fib.beside.GOUT.sumA === 528 && fib.beside.GOUT.p < 1e-10 && fib.beside.GIN.sumA === 1040 && fib.beside.GGF.sumA === 1040 && Object.values(fib.beside).every((t) => t.word === undefined && t.n === 32 && t.m === 32));
    const mixed = V.reading(file((arm, s) => (arm === "GSHUF" && s % 4 === 0 ? 0.68 : arm === "GOUT" && s % 8 === 1 ? 0.70 : arm === "GIN" && s === 60 ? 0.7199 : 0.75) + s / 1000000)), lines = V.readingLines(mixed).join("\n");
    ok("!! THE FAILURES ARE COUNTED AS REGISTERED, A SCORE BELOW 0.72: a GSHUF arm with every fourth draw at 0.68 has 8 of 32, a GOUT arm with every eighth at 0.70 has 4, a GIN arm with one draw at 0.7199 has 1, the others none; T0 is the 32 GDEG flies against the reflex and T3 all 160; the lines say K1 to K3, each part beside GDEG, the failures, and that R0 is the reading's T1",
        J(mixed.failed) === J({ GDEG: 0, GIN: 1, GOUT: 4, GGF: 0, GSHUF: 8 }) && mixed.T0.n === 32 && mixed.T0.above === 32 && mixed.T3.n === 160 && mixed.T3.above === 160 && /K1 \(GIN against GSHUF\): GIN's ranks sum to /.test(lines) && /K2 \(GOUT against GSHUF\)/.test(lines) && /K3 \(GGF against GSHUF\)/.test(lines) && /GGF beside GDEG: GGF's ranks sum to /.test(lines) &&
        /trainings that FAILED \(a score below 0\.72\), of 32 an arm: GDEG 0; GIN 1; GOUT 4; GGF 0; GSHUF 8/.test(lines) && /T1 \(GDEG against GSHUF\)/.test(lines) && /the registration's R0 is T1 above, GDEG against GSHUF/.test(lines) && [mixed.R0.word, mixed.K1.word, mixed.K2.word, mixed.K3.word].every((w) => lines.includes("\n  " + w)));
    ok("with a failed check no test is made: a file short of a draw has R0, K1, K2, K3 and the parts beside GDEG null, still counts the failures, and says a check failed first", (() => { const R = V.reading(good.filter((r) => !(r.arm === "GGF" && r.s === 70))); return R.R0 === null && R.K1 === null && R.K2 === null && R.K3 === null && R.beside === null && J(R.failed) === J({ GDEG: 0, GIN: 0, GOUT: 0, GGF: 0, GSHUF: 0 }) && /A CHECK FAILED/.test(V.readingLines(R)[0]) && R.checks.some((x) => /GGF draw 70 is there 0 times/.test(x)); })());
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "GF", "49"], ["job", "GIN", "x"], ["job", "GIN", "48"], ["job", "GIN", "81"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for one of this round's five arms and one of ITS draws: draw 48 and draw 81 are not, nor is the real wiring, which is not an arm here)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "GGF", "80"])) === J({ cmd: "job", arm: "GGF", s: 80 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeSplit.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, and trains THE LEAD ARM'S FIRST DRAW a second time (by the library's names for them: GDEG, draw 49)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeSplit\.mjs"/.test(csrc) && !/Degree|Vision|"\.\/flyEscape\.mjs"|"\.\/flyEscapeFresh\.mjs"|voxelHome/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && !/jobOnce\(PF\.LEAD, 1\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeSplit\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && V.SEEDS[0] === 49);
    const me = src("tools/ship/flyEscapeSplit-selfcheck.mjs"), calls = [...me.matchAll(/V6?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its five trainings through the rounds' code are of 3 iterations with 16 flies tried on draw 901; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 5 && calls.every((c) => /^"(GDEG|GIN|GOUT|GGF)", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 3 && TINY.pop === 16 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before && typeof createHash === "function", `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyEscapeSplit-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
