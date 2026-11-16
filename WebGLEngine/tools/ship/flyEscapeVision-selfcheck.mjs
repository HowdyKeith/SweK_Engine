// WebGLEngine/tools/ship/flyEscapeVision-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeVision-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 5 (registered in brain/FLY_ESCAPE_VISION_WIP.md, amended there in section 3b before any training of the round): THE REAL ESCAPE CIRCUIT -- the two Giant Fibers and
// each one's 10 strongest LC4 and 10 strongest LPLC2 cells, from another chat's data file (vendor/male-cns/giant-fiber-visual-circuit.json), as a policy whose only road from what the fly sees to what
// it does is the wiring.
//   1  THE DATA              brain/gfVisualTopology.mjs is tools/bakeGfVisualTopology.mjs's bake of the data file's bytes, and what the note says of it is true of it
//   2  THE POLICY            brain/rl/maskedCircuitPolicy.mjs: a number goes to the cells it is listed for and no other; the answer is read from the listed cells and no other
//   3  THE ROUND'S NUMBERS   round 3's cfg with four arms of its own; the amendment's starting strengths; a shuffle keeps the strengths; every arm starts as the reflex
//   4  ONE TRAINING          a record's weights are the trainer's from a wrapped policy made here by hand
//   5  THE RECORDS           64 draws; T1 the real wiring against the shuffle, T2 against the free net
//   6  THE COMMAND           it is this round's; no training of the round's, no process
//   7  THE VERDICT           the round's results, read from the committed file
// LOOKS BEFORE THE ROUND, SAID: the two probes on draw 901 (3 iterations, the round's 96 flies tried) that the registration's section 3b reports. Nothing else was trained before the round's own run.
// SABOTAGE LOG (2026-11-16) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); G1 to G31 with this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the
// command as a process) run whole for each, H1 to H6 with this gate and the four earlier escape rounds' gates; every one red by name (the number is the rows red):
//   THE DATA: G1 the bake swaps to and from 1 | G2 the bake puts the left cells first 2 | G3 the bake does not sort the connections 1 | G4 the baked module names another cell a Giant Fiber 6
//   G5 the baked module carries another sha256 1
//   THE POLICY: G6 the answer is not squashed 3 | G7 the starting strengths are not taken 5 | G8 the answer is read from the first cells 5 | G9 a connection runs the wrong way 4 | G10 two steps 1
//   G11 the read-out's bias is not added 2 | G12 a listed number goes to the next cell 3 | G13 a cell is not rectified before the connections: 0 RED AT FIRST (no row gave a cell a negative input);
//   the row that does was added and G13 run again: 1
//   THE ROUND: G14 a connection starts at 0.02 x its count 2 | G15 the shuffle's connections start at zero 2 | G16 the shuffle is the real wiring 3 | G17 every draw has the same shuffle 2
//   G18 the LC4 cells are given the size 1 | G19 GNONE has the real connections 5 | G20 the free net has 112 units 5 | G21 the lead arm is the free net 2 | G22 T1 against the free net, T2 the shuffle 4
//   G23 the round writes round 3's results file 2 | G24 T1's BETTER says WORSE 2 | G25 the wrapper is told one read cell 2 | G26 a policy ignores the seed it is given 1
//   G27 the free net is given the size alone 3 | G28 the looming number is taken to be number 3 2
//   THE COMMAND: G29 the second training is of the free net 1 | G30 the command exits 0 on a word it does not know 1 | G31 the command reads round 3's library 1
//   THE ARMS HOOK (tools/ship/flyEscape.mjs, run once rounds 3 and 4 had ended and before this round began): H1 a round's own arm is wrapped as if it read no cell 3 | H2 the lead a round names is
//   not taken 2 | H3 the arms a round sets its lead against are not taken 1 | H4 the wiring of a round's own arms is not checked 1 | H5 a round's own words are not taken 1 | H6 one arm is a round 1
//   (the row H2 and H3 turn red was written for them: before it, this round's lead and versus were also what the defaults give, so neither could have been seen)
//   THE VERDICT (section 7, this gate run whole for each; the library was not sabotaged again): V1 a failed shuffle's score put with the others in the file 6 | V2 a real-wired fly's score lowered
//   in the file 7 | V3 the note says the wiring cannot be told from a shuffle 1 | V4 the note does not ask for a second round 1 | V5 the note does not say a partial copy was committed 1
//   (a verdict row of mine named GSHUF's lives as 188.8 within 0.05 of a 188.75 and was red on its own number; corrected to the file's)
// TWO ROWS OF MINE WERE WRONG WHEN WRITTEN AND WERE CORRECTED TO THE FILE: "no connection crosses the midline, none leaves a Giant Fiber" (two do, between the fibres; seven lead back), and the note
// carries the first eight characters of the data file's sha256, not all of it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeVision.mjs";
import * as V3 from "./flyEscapeFresh.mjs";
import * as V1 from "./flyEscape.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as RS from "../../brain/rl/reflexStart.mjs";
import * as M from "../../brain/rl/maskedCircuitPolicy.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";
import * as B from "../bakeGfVisualTopology.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, sum = (a) => a.reduce((n, v) => n + v, 0);
const TINY = Object.freeze({ maxSteps: 160, iters: 3, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 8, fresh: true, battery: 30 }), TINY_AUDIT = [880001, 880002, 880003, 880004, 880005, 880006];
const OBS = (() => { const env = new E.EscapeEnv(); let o = env.reset(900001), done = false; const out = []; while (!done) { out.push(o); const r = env.step(E.RULES.reflex(o)); o = r.obs; done = r.done; } return out; })();
const SEEN = OBS.filter((o) => o[0] > 0 && o[V.SIZE] > 0 && o[V.LOOM] > 0);   // ticks at which a mover is in sight and looming

console.log("flyEscapeVision-selfcheck -- the escape round 5 (the real escape circuit): the data, the policy, the numbers, one training, the records, the command\n");

console.log("1. THE DATA (vendor/male-cns/giant-fiber-visual-circuit.json -> brain/gfVisualTopology.mjs)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, "vendor/male-cns/giant-fiber-visual-circuit.json")), d = JSON.parse(bytes.toString("utf8")), note = src("brain/FLY_ESCAPE_VISION_WIP.md"), sha = createHash("sha256").update(bytes).digest("hex");
    ok("!! THE BAKED MODULE IS THE BAKE OF THE DATA FILE'S BYTES, to the character, and carries the file's sha256, whose first eight characters the registration names; the bake's cell groups are LC4, LPLC2 and the Giant Fiber (DNp01), right then left",
        B.bake(bytes) === src("brain/gfVisualTopology.mjs") && T.SOURCE_SHA256 === sha && note.includes("`" + sha.slice(0, 8) + "...`") && T.DATASET === d.dataset && J(B.GROUPS) === J([["LC4", "R"], ["LC4", "L"], ["LPLC2", "R"], ["LPLC2", "L"], ["DNp01", "R"], ["DNp01", "L"]]), sha.slice(0, 16));
    const at = new Map(T.NEURON_ORDER.map((id, i) => [id, i])), byFile = new Map(d.edges.map(([from, to, w]) => [at.get(to) * 100 + at.get(from), w]));
    ok("!! EVERY CELL AND EVERY CONNECTION OF THE FILE, AND NOTHING ELSE: 42 cells (20 LC4, 20 LPLC2, the two Giant Fibers last), each cell's type and side the file's; 369 connections, each [to, from] with the file's synapse count beside it, 3,894 synapses in all; none from a cell to itself, none twice",
        T.NEURON_ORDER.length === 42 && d.neurons.length === 42 && T.NEURON_ORDER.every((id, i) => { const n = d.neurons.find((x) => x.bodyId === id); return n && n.type === T.NEURON_TYPES[i] && n.side === T.NEURON_SIDES[i]; }) && J(T.LC4) === J(Array.from({ length: 20 }, (_, i) => i)) && J(T.LPLC2) === J(Array.from({ length: 20 }, (_, i) => 20 + i)) && J(T.GF) === J([40, 41]) &&
        T.EDGES.length === 369 && d.edges.length === 369 && byFile.size === 369 && T.EDGES.every((e, k) => byFile.get(e[0] * 100 + e[1]) === T.SYNAPSES[k] && e[0] !== e[1]) && sum(T.SYNAPSES) === 3894 && V.CELLS === 42);
    const isGf = (u) => T.GF.includes(u), onto = T.EDGES.map((e, k) => (isGf(e[0]) && !isGf(e[1]) ? T.SYNAPSES[k] : 0)), cross = T.EDGES.filter((e) => T.NEURON_SIDES[e[0]] !== T.NEURON_SIDES[e[1]]), back = T.EDGES.map((e, k) => (isGf(e[1]) && !isGf(e[0]) ? T.SYNAPSES[k] : 0));
    ok("WHAT THE WIRING IS, counted here from the baked file (a row of mine first said no connection crosses the midline and none leaves a Giant Fiber; the file says otherwise and the row was wrong): every one of the 40 visual cells connects onto its own side's Giant Fiber (40 connections, 2,355 of the 3,894 synapses); the ONLY connections across the midline are the two between the Giant Fibers, a synapse each; and 7 connections lead BACK from a Giant Fiber to a visual cell of its side, 10 synapses",
        onto.filter(Boolean).length === 40 && sum(onto) === 2355 && cross.length === 2 && J(cross) === J([[40, 41], [41, 40]]) && cross.every((e) => T.SYNAPSES[T.EDGES.indexOf(e)] === 1) && back.filter(Boolean).length === 7 && sum(back) === 10 && T.EDGES.every((e) => isGf(e[0]) === isGf(e[1]) || T.NEURON_SIDES[e[0]] === T.NEURON_SIDES[e[1]]) &&
        [...T.LC4, ...T.LPLC2].every((u) => T.EDGES.some((e) => e[1] === u && isGf(e[0]) && T.NEURON_SIDES[e[0]] === T.NEURON_SIDES[u])), `${onto.filter(Boolean).length} onto the Giant Fibers, ${sum(onto)} synapses; ${cross.length} cross; ${back.filter(Boolean).length} lead back, ${sum(back)} synapses`);
});

console.log("\n2. THE POLICY (brain/rl/maskedCircuitPolicy.mjs)");
section(() => {
    // three units by hand: number 2 into unit 0, number 1 into unit 1, both onto unit 2, the answer read from unit 2
    const mk = (o = {}) => new M.MaskedCircuitPolicy({ obsDim: 4, units: 3, inputs: [[0, 2], [1, 1]], edges: [[2, 0], [2, 1]], outputs: [2], seed: 9, ...o }), p = mk({ edgeStart: [0.5, 0.25] }), w = arr(p.getParams());
    const obs = [9, 0.4, 0.8, 9], h0 = Math.max(0, Math.fround(w[0]) * 0.8), h1 = Math.max(0, Math.fround(w[1]) * 0.4);
    p.setParams(Float32Array.from([1, 2, 0, 0, 0, 0.5, 0.25, 0.3, 0.1]));
    const h = arr(p.activity(obs)), want = [0.8, 0.8, 3 * (0.5 * 0.8 + 0.25 * 0.8)];
    ok("!! THE WEIGHTS ARE [inputs][a bias a unit][connections][read-out][the read-out's bias] AND THE ARITHMETIC IS A RECTIFIED UNIT, THREE STEPS ALONG THE CONNECTIONS, tanh OF THE READ-OUT -- three units by hand: 9 weights; unit 0 is its weight x number 2, unit 1 its weight x number 1, unit 2 gathers both for three steps; the answer is tanh(0.3 x unit 2 + 0.1)",
        w.length === 9 && M.maskedWeightCount(3, 2, 2, 1) === 9 && p.paramCount() === 9 && P.REC_STEPS === 3 && h.every((v, i) => near(v, want[i], 1e-6)) && near(p.act(obs)[0], Math.tanh(0.3 * want[2] + 0.1), 1e-6) && J(arr(p.getParams())) === J(arr(Float32Array.from([1, 2, 0, 0, 0, 0.5, 0.25, 0.3, 0.1]))) && (h0 >= 0 && h1 >= 0));
    const neg = arr(p.activity([9, 0.4, -0.8, 9]));
    ok("!! A CELL IS RECTIFIED BEFORE ANYTHING LEAVES IT (sabotage G13 first went 0 red, and this row is its answer): number 2 at -0.8 leaves unit 0 silent, so unit 2 gathers unit 1 alone for three steps, 3 x 0.25 x 0.8 = 0.6 -- not the 0.4 it would hold had unit 0's negative input gone down the connection once",
        neg[0] === 0 && near(neg[1], 0.8, 1e-6) && near(neg[2], 0.6, 1e-6));
    ok("!! `edgeStart` IS THE CONNECTIONS' STARTING WEIGHTS, IN THE CONNECTIONS' ORDER, AND WITHOUT IT THEY START AT 0; the biases start at 0; the input and read-out weights come from the seed (the same seed, the same weights; another, others)",
        J(w.slice(5, 7)) === J([0.5, 0.25]) && J(arr(mk().getParams()).slice(5, 7)) === J([0, 0]) && J(w.slice(2, 5)) === J([0, 0, 0]) && w[8] === 0 && w[0] !== 0 && w[1] !== 0 && w[7] !== 0 && J(arr(mk().getParams())) === J(arr(mk().getParams())) && J(arr(mk({ seed: 10 }).getParams())) !== J(arr(mk().getParams())));
    const q = mk({ edgeStart: [0.5, 0.25] }); q.setParams(Float32Array.from([1, 2, 0, 0, 0, 0.5, 0.25, 0.3, 0.1]));
    const base = q.act(obs)[0], other = q.act([-5, 0.4, 0.8, 77])[0], moved = q.act([9, 0.5, 0.8, 9])[0];
    ok("!! A NUMBER NOT LISTED FOR ANY CELL REACHES NOTHING, AND A CELL NOT READ CHANGES NOTHING BUT THROUGH THE WIRING: numbers 0 and 3 changed and the answer is the same to the bit, number 1 changed and it moves; with the two connections cut (their weights 0) the answer is tanh of the read-out's bias whatever is seen",
        base === other && base !== moved && (() => { const c = mk(); c.setParams(Float32Array.from([1, 2, 0, 0, 0, 0, 0, 0.3, 0.1])); return c.act(obs)[0] === c.act([1, 2, 3, 4])[0] && near(c.act(obs)[0], Math.tanh(0.1), 1e-7); })());
    ok("what is not a policy of this kind is refused by name: a cell or a number outside the range, a pair twice, a connection from a cell to itself, no cell read, a cell read twice, starting weights that are not one a connection, a weight list of another length",
        throws(() => mk({ inputs: [[3, 0]] }), /inputs is a list of \[unit 0\.\.2, observation 0\.\.3\]/) && throws(() => mk({ inputs: [[0, 4]] }), /inputs is a list/) && throws(() => mk({ inputs: [[0, 1], [0, 1]] }), /\[0,1\] twice in inputs/) && throws(() => mk({ edges: [[1, 1]] }), /an edge from a unit to itself/) && throws(() => mk({ edges: [[2, 0], [2, 0]] }), /twice in edges/) &&
        throws(() => mk({ outputs: [] }), /outputs is a list of distinct units 0\.\.2, at least one/) && throws(() => mk({ outputs: [2, 2] }), /outputs is a list of distinct units/) && throws(() => mk({ edgeStart: [1] }), /edgeStart is a finite number an edge, 2 of them/) && throws(() => mk().setParams(new Float32Array(8)), /setParams: 9 weights \(got 8\)/) && throws(() => mk({ units: 0 }), /whole numbers above 0/));
});

console.log("\n3. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_VISION_WIP.md"), flatNote = note.replace(/\s+/g, " ");
    ok("!! THE ROUND IS ROUND 3'S WITH ARMS OF ITS OWN: round 3's cfg, the four arms, the lead GF against GSHUF and the free net, its own results file and words; round 3's recipe to the number (fresh episodes, a battery of 200), the reflex start, the report \"return\", no memory; the draws, the audit, alpha and the floors are round 3's",
        J(V.ROUND5) === J({ ...V3.ROUND3, arms: V.ARMS_OF, lead: "GF", versus: ["GSHUF", "FREE"], results: "brain/flyEscapeVisionRound.jsonl", words: V.ROUND5.words }) && V.ROUND5.arms === V.ARMS_OF && J(V.RECIPE) === J(V3.RECIPE) && V.START === "reflex" && V.REPORT === "return" && V.MEMORY === false && V.LEAD === "GF" && J(V.VERSUS) === J(["GSHUF", "FREE"]) &&
        J(V.ARMS) === J(["GF", "GSHUF", "FREE", "GNONE"]) && J(V.SEEDS) === J(V3.SEEDS) && J(V.AUDIT) === J(V3.AUDIT) && V.ALPHA === 0.01 && J(V.FLOORS) === J(V3.FLOORS) && V.RESULTS === "brain/flyEscapeVisionRound.jsonl" && note.includes("`" + V.RESULTS + "`") && V.RESULTS !== V3.RESULTS);
    ok("!! THE WORDS ARE THIS ROUND'S AND THE REGISTRATION CARRIES THEM: T0, T1 and T2 name the real escape circuit, its shuffle and the free net on the same two numbers; T3 is round 3's",
        ["T0", "T1", "T2"].every((t) => V.WORDS[t].length === 3 && /^(A FLY WITH )?THE REAL ESCAPE CIRCUIT/.test(V.WORDS[t][0]) && /BETTER/.test(V.WORDS[t][0]) && /WORSE/.test(V.WORDS[t][1]) && /CANNOT BE TOLD APART/.test(V.WORDS[t][2]) && flatNote.includes("`" + V.WORDS[t][0])) && /A SHUFFLE OF IT$/.test(V.WORDS.T1[0]) && /A FREE NET ON THE SAME TWO NUMBERS$/.test(V.WORDS.T2[0]) && /THE REFLEX$/.test(V.WORDS.T0[0]) && J(V.WORDS.T3) === J(V3.WORDS.T3));
    const inner = (a, s = 2) => V.policyOf(a, s).inner, gf = inner("GF"), sh = inner("GSHUF"), fr = inner("FREE"), no = inner("GNONE");
    ok("!! THE ARMS' WEIGHT COUNTS ARE THE REGISTRATION'S -- GF 454, GSHUF 454, FREE 453 (113 units), GNONE 85 -- and are what the policies hold; each is a masked circuit inside the reflex wrapper; the seen numbers are the size (number 1) and the looming rate (number 2)",
        J(V.WEIGHTS) === J({ GF: 454, GSHUF: 454, FREE: 453, GNONE: 85 }) && V.ARMS.every((a) => inner(a) instanceof M.MaskedCircuitPolicy && V.policyOf(a, 2) instanceof RS.ReflexStart && V.policyOf(a, 2).getParams().length === V.WEIGHTS[a]) && V.FREE_UNITS === 113 && fr.units === 113 && gf.units === 42 && V.SIZE === 1 && V.LOOM === 2 &&
        /\| \*\*FREE\*\*[^\n]*113[^\n]*453/.test(note) && /454/.test(note) && /\| \*\*GNONE\*\*[^\n]*85/.test(note));
    ok("!! THE REAL CELLS SEE AS THE REGISTRATION SAYS: the looming rate goes into each LC4 cell and into nothing else, the size into each LPLC2 cell and into nothing else, NOTHING into a Giant Fiber; the answer is read from the two Giant Fibers alone -- in GF, GSHUF and GNONE alike; the free net gives both numbers to every unit and reads every unit",
        J(V.VISUAL_INPUTS) === J([...T.LC4.map((u) => [u, 2]), ...T.LPLC2.map((u) => [u, 1])]) && [gf, sh, no].every((p) => J(arr(p.inUnit)) === J(V.VISUAL_INPUTS.map((e) => e[0])) && J(arr(p.inObs)) === J(V.VISUAL_INPUTS.map((e) => e[1])) && J(arr(p.out)) === J([40, 41])) &&
        fr.inUnit.length === 226 && arr(fr.inObs).every((o) => o === 1 || o === 2) && J(arr(fr.out)) === J(Array.from({ length: 113 }, (_, u) => u)) && fr.to.length === 0 && no.to.length === 0);
    const real = T.EDGES.map((e) => e[0] * 100 + e[1]), places = (p) => arr(p.to).map((t, k) => t * 100 + p.from[k]), s2 = places(sh), s3 = places(inner("GSHUF", 3)), setReal = new Set(real);
    ok("!! *** THE AMENDMENT: A CONNECTION STARTS AT 0.01 x ITS SYNAPSE COUNT *** -- GF's 369 connections are the baked ones in the baked order and start at 0.01 x the baked counts (38.94 in all, 23.55 of it from the visual cells onto the Giant Fibers); and the registration's section 3b says so",
        V.SYNAPSE_GAIN === 0.01 && J(places(gf)) === J(real) && J(arr(gf.Wrec)) === J(arr(Float32Array.from(T.SYNAPSES, (n) => n * 0.01))) && J(V.EDGE_START) === J(T.SYNAPSES.map((n) => n * 0.01)) && near(sum(V.EDGE_START), 38.94, 1e-9) && near(sum(arr(gf.Wrec).filter((_, k) => gf.to[k] >= 40 && gf.from[k] < 40)), 23.55, 1e-4) && /0\.01 x its synapse count/.test(note) && /## 3b\. AMENDMENT/.test(note));
    const ontoGf = (p) => arr(p.to).filter((t) => t >= 40).length;
    ok("!! *** A SHUFFLE KEEPS THE 369 STRENGTHS AND MOVES THE PLACES ***: a GSHUF draw's connections are shuffledEdges(42, 369, 7000 + the draw) -- 369 distinct places, none a cell to itself, not the real places, another draw's others -- and its starting weights are the real ones, the same list in the same order, so the two arms differ in WHERE the strengths are and nothing else; no arm but these two has connections",
        V.SHUFFLE_SEED === 7000 && J(s2) === J(P.shuffledEdges(42, 369, 7002).map((e) => e[0] * 100 + e[1])) && new Set(s2).size === 369 && arr(sh.to).every((t, k) => t !== sh.from[k]) && J(s2) !== J(real) && s2.filter((k) => setReal.has(k)).length < 150 && J(s2) !== J(s3) && J(arr(sh.Wrec)) === J(arr(gf.Wrec)) && J(V.circuitOf("GSHUF", 2).edges) === J(P.shuffledEdges(42, 369, 7002)) && J(V.circuitOf("GF", 9).edges) === J(T.EDGES) && arr(fr.Wrec).length === 0 && arr(no.Wrec).length === 0,
        `connections onto a Giant Fiber: real ${ontoGf(gf)}, the shuffle of draw 2 ${ontoGf(sh)}; places shared ${s2.filter((k) => setReal.has(k)).length}`);
    // what each arm's network can do before the wrapper zeroes its read-out: give the read-out weights and see whether the answer depends on what is seen
    const live = (p) => { const w = p.getParams(); for (let k = 1; k <= p.out.length; k++) w[w.length - 1 - k] = 0.5; p.setParams(w); return new Set(SEEN.map((o) => p.act(o)[0])).size; };
    ok("!! *** WITHOUT CONNECTIONS NOTHING REACHES A GIANT FIBER ***: with its read-out weights set, GNONE's network answers ONE number over every tick at which a mover looms (what it sees cannot reach what it does), while GF's and the free net's answers vary with what is seen -- this is why the round has GNONE, and why the amendment was needed",
        SEEN.length > 20 && live(inner("GNONE")) === 1 && live(inner("GF")) > 5 && live(inner("FREE")) > 5, `${SEEN.length} ticks; distinct answers: GNONE ${live(inner("GNONE"))}, GF ${live(inner("GF"))}, GSHUF ${live(inner("GSHUF"))}, FREE ${live(inner("FREE"))}`);
    const A40 = V.AUDIT.slice(0, 40), ref = V.auditScore(E.RULES.reflex, A40), fl = V.floors(A40);
    ok("!! EVERY ARM'S UNTRAINED FLY IS THE REFLEX: the wrapper zeroes the read-out (its last weights: one a read cell, and the bias), so on 40 episodes each arm's untrained draw 3 has the reflex's score and counts to the bit, as the floors say",
        V.ARMS.every((a) => { const p = V.policyOf(a, 3), w = arr(p.getParams()), u = V.ARMS_OF[a].under; return w.slice(-(u + 1)).every((v) => v === 0) && J(V.auditScore((o) => p.act(o), A40)) === J(ref); }) && V.ARMS.every((a) => fl.untrained[a] === fl.reflex.score) && J(Object.keys(fl.untrained)) === J(V.ARMS) && J([V.ARMS_OF.GF.under, V.ARMS_OF.GSHUF.under, V.ARMS_OF.FREE.under, V.ARMS_OF.GNONE.under]) === J([2, 2, 113, 2]));
    const other = V1.makeEscapeRound({ ...V.ROUND5, lead: "FREE", versus: ["GNONE"], results: "x" }), dflt = V1.makeEscapeRound({ ...V.ROUND5, arms: { FREE: V.ARMS_OF.FREE, GNONE: V.ARMS_OF.GNONE, GF: V.ARMS_OF.GF }, lead: undefined, versus: undefined, results: "x" });
    ok("!! THE LEAD AND WHAT IT IS SET AGAINST ARE THE ONES A ROUND NAMES, not the first arms: the same arms with the lead FREE against GNONE alone give that lead and that one arm (and no T2 words are needed); with none named, the lead is the first arm and the next two are what it is set against",
        other.LEAD === "FREE" && J(other.VERSUS) === J(["GNONE"]) && dflt.LEAD === "FREE" && J(dflt.VERSUS) === J(["GNONE", "GF"]) && J(other.ARMS) === J(V.ARMS));
    ok("a round's own arms are checked where they are handed in: fewer than two, an arm with no maker, a lead that is not an arm, or a versus that is the lead, is refused by name", throws(() => V1.makeEscapeRound({ ...V.ROUND5, arms: { GF: V.ARMS_OF.GF } }), /cfg\.arms is/) && throws(() => V1.makeEscapeRound({ ...V.ROUND5, arms: { A: { weights: 1, under: 1 }, B: V.ARMS_OF.GF } }), /cfg\.arms is/) &&
        throws(() => V1.makeEscapeRound({ ...V.ROUND5, lead: "FLY" }), /cfg\.lead is one of the arms/) && throws(() => V1.makeEscapeRound({ ...V.ROUND5, versus: ["GF"] }), /cfg\.lead is one of the arms/));
});

console.log("\n4. ONE TRAINING (3 iterations, 16 flies tried, 160 ticks, a battery of 30, on draw 901)");
section(() => {
    const r = V.trainOne("GF", 901, TINY, TINY_AUDIT), sh = V.trainOne("GSHUF", 901, TINY, TINY_AUDIT), fr = V.trainOne("FREE", 901, TINY, TINY_AUDIT);
    const by = (edges, units, inputs, outputs, start) => trainDockES({ envFactory: (o = {}) => new E.EscapeEnv({ maxSteps: 160, report: "return", ...o }), obsDim: 13, actDim: 1, maxSteps: 160, iters: 3, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 8, seed: 901, freshEpisodes: true, batteryEps: 30,
        policyFactory: ({ obsDim, seed }) => new RS.ReflexStart(new M.MaskedCircuitPolicy({ obsDim, units, inputs, edges, outputs, edgeStart: start, seed }), { rule: E.RULES.reflex, tail: outputs.length + 1 }) });
    const direct = by(T.EDGES.map((e) => [...e]), 42, V.VISUAL_INPUTS.map((e) => [...e]), [40, 41], T.SYNAPSES.map((n) => n * 0.01)), dsh = by(P.shuffledEdges(42, 369, 7901), 42, V.VISUAL_INPUTS.map((e) => [...e]), [40, 41], T.SYNAPSES.map((n) => n * 0.01));
    const start = arr(V.policyOf("GF", 901).getParams()), end = arr(PF.unpackWeights(r.weights));
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A WRAPPED POLICY MADE HERE BY HAND (the baked cells, inputs, connections and their 0.01 x synapse starts, read from the two Giant Fibers, inside the reflex wrapper; the environment that reports the return; fresh episodes; the recipe's battery), to the hash -- for GF, and for GSHUF with the draw's own shuffle; the record carries its arm's weight count and wiring",
        PF.hashWeights(direct.params) === r.weightsHash && PF.hashWeights(dsh.params) === sh.weightsHash && r.weightsHash !== sh.weightsHash && r.weightCount === 454 && r.edges === 369 && r.units === 42 && r.edgesHash === PF.hashEdges(T.EDGES) && sh.edgesHash === PF.hashEdges(P.shuffledEdges(42, 369, 7901)) && sh.edgesHash !== r.edgesHash && fr.weightCount === 453 && fr.edges === 0 && fr.units === 113 && J(r.recipe) === J(TINY) &&
        J(r.history) === J(direct.history.map((h) => ({ it: h.it, ret: h.avgReturn, lived: h.dockRate }))));
    ok("the tiny training is a training: GF's weights at its end are not the weights it started with (so the hash above is of something the trainer did)", start.length === end.length && start.some((v, i) => v !== end[i]), `${start.filter((v, i) => v !== end[i]).length} of ${start.length} weights moved`);
    const again = [["GF", r], ["GSHUF", sh], ["FREE", fr]].map(([arm, rec]) => { const p = V.policyOf(arm, 901); p.setParams(PF.unpackWeights(rec.weights)); const a = V.auditScore((o) => p.act(o), TINY_AUDIT, 160); return a.score === rec.score && a.alive === rec.alive && a.fledPass === rec.fledPass; });
    ok("!! THE WEIGHTS GIVE THE SCORE AGAIN: a record's weights in its arm's fly of that draw (for GSHUF, that draw's shuffle), audited on the same episodes, give its score and counts to the bit", again.every(Boolean));
});

console.log("\n5. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, ret: 0.65 + (k === 0 ? 0 : 0.03) + s / 100000, lived: 0 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), score, alive: 170, fed: 0.5, strikes: 400, caught: 30, passes: 300, fledPass: 60, history: hist(s) }; };
    const flo = () => ({ kind: "floors", ...Object.fromEntries(Object.entries(V.FLOORS).map(([k, v]) => [k, { score: v, alive: 150, fed: 0.3, strikes: 400, caught: 40, passes: 300, fledPass: 80 }])), untrained: Object.fromEntries(V.ARMS.map((a) => [a, V.FLOORS.reflex])) });
    const file = (scoreOf, lead = "GF") => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: lead, s: 1, weightsHash: out.find((r) => r.arm === lead && r.s === 1).weightsHash }, flo()); return out; };
    const flat = (arm, s) => 0.70 + s / 100000, good = file(flat);
    ok("!! a file of 64 draws (the four arms) with GF draw 1 a second time passes every check and its first line says 64 and GF; a draw of an arm of another round, a GSHUF draw recorded with the real wiring, a second training of another arm in the lead's place, and a record short of its arm's weights each fail by name",
        V.checkRecords(good).length === 0 && good.length === 66 && /^the checks hold: 64 draws, each once.*GF draw 1 the same twice/.test(V.readingLines(V.reading(good))[0]) &&
        (() => { const L = JSON.parse(J(good)); L[0].arm = "FLY"; return V.checkRecords(L).some((b) => /FLY draw 1 is not a registered draw/.test(b)); })() &&
        (() => { const L = JSON.parse(J(good)), g = L.find((r) => r.arm === "GSHUF" && r.s === 4); g.edgesHash = PF.hashEdges(T.EDGES); return J(V.checkRecords(L)) === J(["GSHUF draw 4's wiring is not its arm's"]); })() &&
        J(V.checkRecords(file(flat, "FREE"))) === J(["GF draw 1 trained a second time is not there once with the same weights"]) &&
        (() => { const L = JSON.parse(J(good)), g = L.find((r) => r.arm === "GNONE" && r.s === 2); g.weightCount = 454; return V.checkRecords(L).some((b) => /GNONE draw 2 has 454 weights \(its arm has 85\)/.test(b)); })(), V.checkRecords(good).slice(0, 2).join(" | "));
    const R = (gf, sh, fr, no = 0.6465) => V.reading(file((arm, s) => ({ GF: gf, GSHUF: sh, FREE: fr, GNONE: no })[arm] + (arm === "GNONE" ? 0 : s / 100000)));
    const a = R(0.75, 0.70, 0.80), b = R(0.70, 0.75, 0.66), c = R(0.70, 0.70, 0.70), low = R(0.60, 0.62, 0.70);
    ok("!! T1 IS THE REAL WIRING AGAINST ITS SHUFFLE AND T2 AGAINST THE FREE NET, rank-sums of 16 against 16 with this round's words: GF above GSHUF and below FREE -> BETTER THAN A SHUFFLE, WORSE THAN A FREE NET; the other way round -> WORSE, BETTER; level -> CANNOT BE TOLD APART, twice",
        a.T1.word === V.WORDS.T1[0] && a.T2.word === V.WORDS.T2[1] && b.T1.word === V.WORDS.T1[1] && b.T2.word === V.WORDS.T2[0] && c.T1.word === V.WORDS.T1[2] && c.T2.word === V.WORDS.T2[2] && a.T1.n === 16 && a.T1.m === 16 && a.T1.p < 1e-6);
    ok("!! T0 IS THE 16 GF FLIES AGAINST THE REFLEX AND T3 ALL 64: GF at 0.75 -> BETTER THAN THE REFLEX (16 of 16); at 0.60 -> WORSE; T3 counts 64 flies, the GNONE flies at the reflex's own number counted equal, against; and T1 is said to be asked of flies that do the task only when both GF's mean and GSHUF's are at or above the reflex",
        a.T0.word === V.WORDS.T0[0] && a.T0.above === 16 && a.T0.n === 16 && low.T0.word === V.WORDS.T0[1] && a.T3.n === 64 && a.T3.above === 48 && a.T3.ties === 16 && a.T3.below === 0 && a.asked === true && low.asked === false && R(0.75, 0.60, 0.70).asked === false);
    const lines = V.readingLines(a).join("\n");
    ok("the reading's lines name this round's arms and tests: a row an arm, `T0 (GF against the reflex)`, `T1 (GF against GSHUF)`, `T2 (GF against FREE)`, the words, and no arm of another round", /\nGF +16 /.test(lines) && /\nGSHUF +16 /.test(lines) && /\nFREE +16 /.test(lines) && /\nGNONE +16 /.test(lines) && /T0 \(GF against the reflex\): of 16, 16 above/.test(lines) && /T1 \(GF against GSHUF\)/.test(lines) && /T2 \(GF against FREE\)/.test(lines) && lines.includes(V.WORDS.T1[0]) && lines.includes(V.WORDS.T2[1]) && /T1 IS ASKED OF FLIES THAT DO THE TASK: the GF arm's mean and the GSHUF arm's/.test(lines) && !/\n(FLY|SHUF|PLAIN|FISH|MLP) /.test(lines));
});

console.log("\n6. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "FLY", "1"], ["job", "GF", "x"], ["job", "GF", "17"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for one of this round's four arms and a draw; eight other shapes are not words, a job for an arm of another round among them)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "GNONE", "16"])) === J({ cmd: "job", arm: "GNONE", s: 16 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeVision.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, and trains THE LEAD ARM's draw 1 a second time (GF, by the library's name for it, not an arm written into the command)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeVision\.mjs"/.test(csrc) && !/"\.\/flyEscape\.mjs"|"\.\/flyEscapeFresh\.mjs"|"\.\/flyEscapeReflex\.mjs"|"\.\/flyEscapeMemory\.mjs"|flyEscapeFreshRound|voxelHome/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, 1\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: 1/.test(csrc) && !/"FLY"|"GF"/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeVision\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyEscapeVision-selfcheck.mjs"), calls = [...me.matchAll(/V3?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its three trainings through the round's code are of 3 iterations with 16 flies tried on draw 901; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 3 && calls.every((c) => /^"(GF|GSHUF|FREE)", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 3 && TINY.pop === 16 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n7. THE VERDICT (round 5; the whole results file was committed at 3b26b297 before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = V.reading(lines), A = R.arms, draws = lines.filter((r) => r.kind === "draw"), ref = R.floors.reflex.score;
    const sc = (a) => draws.filter((r) => r.arm === a).sort((x, y) => x.s - y.s).map((r) => r.score);
    ok("!! the results file is the one the run wrote: 66 records, sha256 edcc2fd93bf76ecc...", lines.length === 66 && createHash("sha256").update(bytes).digest("hex") === "edcc2fd93bf76eccb9d02a6b83ca8d92fa5130ce0a6652212eb120b3855bf791");
    ok("!! THE CHECKS HOLD, AND THE START WAS THE REFLEX: 64 draws each once, round 3's recipe, each arm's weight count and wiring (a GSHUF draw's its own shuffle), GF draw 1 the same twice, a history in every record, the registered floors -- and the untrained fly of every arm scores the reflex's 0.6465, to the bit", R.checks.length === 0 && V.ARMS.every((a) => R.floors.untrained[a] === ref) && near(ref, 0.6465), R.checks.slice(0, 2).join(" | "));
    ok("!! *** T1: THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES BETTER THAN A SHUFFLE OF IT *** -- the first time in this work a real wiring is told from its shuffle. Asked of flies that do the task; the real circuit's ranks sum to 333, the middle is 264; exact two-sided p 0.0085 against the registered 0.01",
        R.asked === true && R.T1 && R.T1.word === V.WORDS.T1[0] && R.T1.sumA === 333 && near(R.T1.p, 0.008463, 1e-6) && R.T1.p < V.ALPHA);
    const gf = sc("GF"), sh = sc("GSHUF"), failed = draws.filter((r) => r.arm === "GSHUF" && r.score < 0.72).map((r) => r.s).sort((a, b) => a - b);
    ok("!! *** WHAT THE DIFFERENCE IS, SAID WITH IT: NOT A BETTER FLY, A SURER TRAINING *** -- the 16 real-wired flies all end between 0.741 and 0.757 (sd 0.003); 12 of the 16 shuffles end in the same place (0.743 to 0.752) and 4 do not (draws 5, 10, 12 and 13: 0.685, 0.707, 0.662, 0.686). The best shuffle (0.7524) is above 14 of the 16 real-wired flies. And the p is 0.0085 beside a line at 0.01: one shuffle family, 16 draws",
        gf.every((v) => v > 0.741 && v < 0.757) && near(A.GF.sd, 0.0031) && J(failed) === J([5, 10, 12, 13]) && sh.filter((v) => v > 0.7425 && v < 0.7525).length === 12 && near(sh[4], 0.6851) && near(sh[9], 0.7073) && near(sh[11], 0.6623) && near(sh[12], 0.6855) && near(Math.max(...sh), 0.7524) && gf.filter((v) => v < Math.max(...sh)).length === 14);
    ok("!! T2: THE REAL ESCAPE CIRCUIT CANNOT BE TOLD APART FROM A FREE NET ON THE SAME TWO NUMBERS, and it leans below it (ranks 206, the middle 264; p 0.029; the free net's mean 0.7571 against 0.7501). T0: with the real circuit all 16 beat the reflex (p 3.1e-5) -> BETTER. T3: 48 of the 64 above the reflex and the 16 GNONE flies equal to it, counted against (p 7.7e-5) -> BETTER",
        R.T2 && R.T2.word === V.WORDS.T2[2] && R.T2.sumA === 206 && near(R.T2.p, 0.028797, 1e-6) && R.T0 && R.T0.word === V.WORDS.T0[0] && R.T0.above === 16 && R.T3 && R.T3.word === V.WORDS.T3[0] && R.T3.above === 48 && R.T3.ties === 16 && R.T3.below === 0 && near(R.T3.p, 7.733e-5, 1e-8));
    ok("!! the arms (mean, sd; lives of 200; feeds; caught by a strike): GF 0.7501 0.0031, 193.4, 0.533, 0.015 | GSHUF 0.7323 0.0286, 188.8, 0.521, 0.025 | FREE 0.7571 0.0103, 185.6, 0.586, 0.036 | GNONE 0.6465 0, 156, 0.513, 0.107 (the reflex's own row). The real circuit's flies are caught least; the free net's feed most and are caught more -- two ways to about the same score; round 3's 13-number arms averaged 0.741",
        near(A.GF.mean, 0.7501) && near(A.GSHUF.mean, 0.7323) && near(A.GSHUF.sd, 0.0286) && near(A.FREE.mean, 0.7571) && near(A.FREE.sd, 0.0103) && near(A.GNONE.mean, 0.6465) && A.GNONE.sd < 1e-12 && near(A.GF.alive, 193.4, 0.05) && near(A.GSHUF.alive, 188.75, 0.01) && near(A.FREE.alive, 185.6, 0.05) && A.GNONE.alive === 156 &&
        near(A.GF.fed, 0.533, 5e-4) && near(A.FREE.fed, 0.586, 5e-4) && near(A.GF.caught, 0.015, 5e-4) && near(A.GSHUF.caught, 0.025, 5e-4) && near(A.FREE.caught, 0.0361, 5e-4));
    const none = draws.filter((r) => r.arm === "GNONE"), still = none.filter((r) => { const w = PF.unpackWeights(r.weights), w0 = V.policyOf("GNONE", r.s).getParams(); return arr(w).every((v, i) => v === w0[i]); }).length;
    ok("!! *** WITHOUT CONNECTIONS NOTHING WAS LEARNED, AS IT HAD TO BE ***: all 16 GNONE trainings end with the weights they began with, weight for weight, at the reflex's score to the bit and a battery reading that never moves (0.6513 at every reading) -- so whatever the other arms learned came through connections (or, in the free net, through cells that both see and are read)",
        none.length === 16 && still === 16 && none.every((r) => r.score === ref && r.history.every((h) => h.ret === r.history[0].ret)) && near(A.GNONE.history[0].ret, 0.6513), `${still} of 16 unmoved`);
    const H = (a) => A[a].history.map((h) => h.ret);
    ok("!! WHAT THE TRAINER SAW, AND IT IS WHAT SECTION 3b SAID TO WATCH: the real circuit's first reading is 0.547, far BELOW the reflex's 0.651 there -- its two Giant Fibers are driven hard, so the trainer's first step throws the fly about -- and it climbs to 0.743; the shuffle starts at 0.666 and creeps to 0.722; the free net's readings wander (0.723, then 0.660 at the end; the weights kept are the best reading's)",
        near(H("GF")[0], 0.5474) && near(H("GF")[6], 0.7434) && near(H("GSHUF")[0], 0.6658) && near(H("GSHUF")[6], 0.7222) && near(H("FREE")[0], 0.7229) && near(H("FREE")[6], 0.6603) && H("GF")[0] < H("GNONE")[0] - 0.1);
    const again = ["GF", "GSHUF", "FREE", "GNONE"].flatMap((arm) => [4, 12].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore((o) => p.act(o)); return [arm, s, a.score === r.score && a.alive === r.alive && a.fledPass === r.fledPass && a.caught === r.caught]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS COUNTS AGAIN: draws 4 and 12 of every arm (the best real-wired fly and the worst shuffle among them), audited here on the 200 episodes through the wrapped fly, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/FLY_ESCAPE_VISION_WIP.md"), res = note.slice(note.indexOf("## 10. The result"));
    ok("the expectations, written before the code, against what came: T1 CANNOT BE TOLD APART was the 72 percent guess and BETTER, given 14, is what came; T2 CANNOT the 50, came; T3 BETTER the 55, came; T0 BETTER was given 30 and came; GNONE at the reflex came; some arm above 0.68 was given 30 percent and three are above 0.73",
        /\*\*T1: CANNOT BE TOLD APART about 72 percent, BETTER about 14/.test(note) && /T2: CANNOT about 50/.test(note) && /T3: BETTER about 55/.test(note) && /BETTER about 30, CANNOT about 55/.test(note) && /above 0\.68:\s+about 30 percent/.test(note) && ["GF", "GSHUF", "FREE"].every((a) => A[a].mean > 0.73));
    ok("the registration's RESULT SECTION (section 10, and not the list of possible words in section 4) carries the four readings' words, says that a partial copy of the file was committed unread while the run wrote it, and says that T1 wants a second round before it is believed", /## 10\. The result/.test(note) && [["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word], ["T3", R.T3.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)) && /2b048f15/.test(res) && /a second round/.test(res) && /would want a second round before it is believed/.test(note));
});

console.log(`\nflyEscapeVision-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
