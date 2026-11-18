// WebGLEngine/tools/ship/flyCompassBalanced-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyCompassBalanced-selfcheck.mjs      (about a minute; IT NEVER RUNS THE ROUND -- its training is tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE BALANCED COMPASS ROUND (registered in brain/FLY_COMPASS_BALANCED_WIP.md before tools/ship/flyCompassBalanced.mjs and tools/ship/takeFlyCompassBalanced.mjs existed):
// is the real wiring's handicap in the compass round its uneven summed inputs onto the compass neurons?
//   1  THE WIRINGS              PSUM by hand: the shuffle over the 260, the fit, the real sums; PEVEN by hand: the real partners, even sums, no pull
//   2  THE ROUND'S NUMBERS      the compass round's recipe, draws, audit and fly; the arms; the compass file named by its hash; the floors; the registration says the same
//   3  ONE TRAINING             a record's weights are the trainer's from a policy made here by hand; its scores again
//   4  THE RECORDS              24 draws; the compass round's file; A, B, C, D; USES
//   5  THE COMMAND              it is this round's; no training of the round's, no process
//   6  THE VERDICT              the results file as committed unread at e8245294, read from the file: the checks, A, B, C, D, the arms, USES, the rates, re-audits, the trainer, the
//                               measurement after the reading (how much of the compass round's gap each arm accounts for, said as not registered), the expectations, the note's result
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 22, this gate and tools/ship/voxelHome-selfcheck.mjs
// (which probes the command as a process) for the command's 4; every one red by name, NONE 0 red (the number is the rows red):
//   THE WIRINGS: W1 PSUM over all 282 ring neurons 5 | W2 the fit leaves the outputs 2 | W3 300 sweeps 1 | W4 PSUM on PSHUF's seeds 4 | W5 PEVEN evens to 1, not the mean 1 | W6 PEVEN is the real
//   wiring 2 | W7 the wiring is not a copy 2
//   THE ROUND: F1 the compass file's hash another 3 | F2 USES needs 0.3 3 | F3 B against PSHUF 1 | F4 BETTER and WORSE swapped 1 | F5 the start not checked against the compass round's 1 | F6 the
//   compass file's own checks not made 1 | F7 the recipe 40 iterations 3 | F8 the untrained PEVEN is the real wiring 1 | F9 rates at 0 keeps the depression rate 1 | F10 the round writes the compass
//   round's file 1 | F11 a training's fly is PEVEN's 1
//   THE COMMAND: C1 the second training is of draw 2 1 | C2 exits 0 on a word it does not know 1 | C3 reads the compass round's library 1 | C4 reads without the compass round's file 1.  THE NOTE: N1 its
//   draws are 13 to 24 1 | N2 its seed is 9100 1 | N3 its B is against PSHUF 1 | N4 its fit is 300 sweeps 1
//   ONE FINDING BEFORE THE SABOTAGES, OF MINE: the library's `uses` was the compass round's, so its own USES_BY was a number nothing read and F2 could not have reached a reading; it now reads its own.
// THE VERDICT'S SABOTAGES (2026-11-18, after the reading, the same runner, this gate alone): V1 a record's score changed in its last digit 2 | V2 B against PSHUF 4 | V3 USES needs 0.3 5 |
//   V4 the rank sums' BETTER and WORSE swapped 5 | V5 the note's A says BETTER 1 | V6 the note's expectation of C is WORSE 1 | V7 the note names another commit 1 | V8 the note drops 'as far as 12
//   draws can tell' 1 | V9 the note drops what it does not mean 1 | V10 rates at 0 keeps the depression rate 2 | V11 the note's 85 percent is 75 1 | V12 PEVEN evens to 1, not the mean 3 (the
//   third the verdict section throwing on a reading that was not weighed) | V13 the floors' start one digit off 1. None went 0 red. V13 WAS A FINDING ABOUT THE SABOTAGE, NOT THE GATE: its
//   last digit (0.44295126588010525 to ...26) parses to the same double, so only the file's hash saw it and the checks row was never reached; V13b, the start changed in a digit the double
//   holds (...10625), went 3 red, the checks row among them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as B from "./flyCompassBalanced.mjs";
import * as V from "./flyCompass.mjs";
import * as PF from "./paintingFly.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import * as CF from "../../brain/rl/compassFly.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TINY_AUDIT = [880001, 880002];
const NE = 46, NR = 282;
const mat = (E) => { const M = new Float64Array(NE * NR); for (const [j, k, n] of E) M[k * NR + j] = n; return M; };
const corr = (A, Bm) => { const n = A.length, ma = A.reduce((s, x) => s + x, 0) / n, mb = Bm.reduce((s, x) => s + x, 0) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (A[i] - ma) * (Bm[i] - mb); va += (A[i] - ma) ** 2; vb += (Bm[i] - mb) ** 2; } return c / Math.sqrt(va * vb); };
const sums = (E) => { const S = new Float64Array(NE), R = new Float64Array(NR); for (const [j, k, n] of E) { S[k] += n; R[j] += n; } return [S, R]; };
const pull = (E) => { const mean = E.reduce((s, e) => s + e[2], 0) / E.length, S = new Float64Array(NE); for (const [j, k, n] of E) S[k] += n / mean; const m = S.reduce((a, b) => a + b, 0) / NE; let x = 0, y = 0; for (let k = 0; k < NE; k++) { x += (S[k] - m) * Math.cos(CF.ANGLE[k]); y += (S[k] - m) * Math.sin(CF.ANGLE[k]); } return Math.hypot(x, y); };
const rel = (A, R0) => Math.max(...Array.from(A, (x, i) => (R0[i] === 0 ? Math.abs(x) : Math.abs(x - R0[i]) / R0[i])));

console.log("flyCompassBalanced-selfcheck -- the balanced compass round (random partners given the real summed inputs; the real partners given even ones): the wirings, the numbers, one training, the records, the command\n");

console.log("1. THE WIRINGS (tools/ship/flyCompassBalanced.mjs)");
section(() => {
    const [S0, R0] = sums(CF.REAL), live = [...Array(NR).keys()].filter((j) => R0[j] > 0);
    ok("the real wiring's summed synapses onto each compass neuron and out of each ring neuron (B.SUMS), and the ring neurons with a real connection: 260 of the 282 (B.LIVE)", J(Array.from(B.SUMS.input)) === J(Array.from(S0)) && J(Array.from(B.SUMS.output)) === J(Array.from(R0)) && J(B.LIVE) === J(live) && B.LIVE.length === 260);
    const r = CE.stream(9001), seen = new Set(), E = [];
    for (const e of CF.REAL) { let j, k; do { j = live[Math.floor(r() * live.length)]; k = Math.floor(r() * NE); } while (seen.has(j * NE + k)); seen.add(j * NE + k); E.push([j, k, e[2]]); }
    for (let t = 0; t < 3000; t++) { const o = new Float64Array(NR); for (const e of E) o[e[0]] += e[2]; for (const e of E) e[2] *= R0[e[0]] / o[e[0]]; const i = new Float64Array(NE); for (const e of E) i[e[1]] += e[2]; for (const e of E) e[2] *= S0[e[1]] / i[e[1]]; }
    const u = B.edgesOf("PSUM", 1), [Su, Ru] = sums(u);
    ok("!! PSUM BY HAND: 8,836 connections, the real synapse counts in the real order, onto pairs drawn without repeats from the 260 x 46 (seed 9000 + draw), then 3,000 sweeps of every ring neuron's strengths scaled to its real sum and then every compass neuron's -- the module's, to the bit",
        J(u) === J(E) && B.SUM_SEED === 9000 && B.SWEEPS === 3000 && J(B.summedShuffle(9001)) === J(E) && u.length === 8836 && new Set(u.map((e) => e[0] * NE + e[1])).size === 8836 && u.every((e) => B.LIVE.includes(e[0]) && e[2] > 0));
    ok("!! PSUM'S SUMS ARE THE REAL WIRING'S (each compass neuron's input and each ring neuron's output to 1e-12) AND SO IS ITS PULL (536.31), while its partners are random: its weights correlate 0.521 with the real's (a plain shuffle's 0.017); its strengths run 0.04 to 268",
        rel(Su, S0) < 1e-12 && rel(Ru, R0) < 1e-12 && near(pull(u), 536.31, 0.005) && near(pull(CF.REAL), 536.31, 0.005) && near(corr(mat(u), mat(CF.REAL)), 0.521, 5e-4) && near(corr(mat(V.edgesOf("PSHUF", 1)), mat(CF.REAL)), 0.017, 5e-4) && near(Math.min(...u.map((e) => e[2])), 0.04, 0.005) && near(Math.max(...u.map((e) => e[2])), 268.36, 0.005),
        `pull ${pull(u).toFixed(2)}, corr ${corr(mat(u), mat(CF.REAL)).toFixed(3)}`);
    const ev = B.edgesOf("PEVEN", 7), [Se] = sums(ev), m = S0.reduce((a, b) => a + b, 0) / NE;
    ok("!! PEVEN BY HAND: the real partners in the real order, each strength times the mean summed input over the 46 over its own compass neuron's: every compass neuron's sum the mean (2543.59), the pull 0, its weights correlating 0.979 with the real's; the same for every draw",
        ev.length === 8836 && ev.every((e, i) => e[0] === CF.REAL[i][0] && e[1] === CF.REAL[i][1] && e[2] === CF.REAL[i][2] * m / S0[e[1]]) && Array.from(Se).every((x) => Math.abs(x - m) < 1e-9) && near(m, 2543.59, 0.005) && pull(ev) < 1e-9 && near(corr(mat(ev), mat(CF.REAL)), 0.979, 5e-4) && J(ev) === J(B.edgesOf("PEVEN", 2)) && J(ev) === J(B.evened()));
    const a = B.edgesOf("PSUM", 3); a[0][2] = -1; a.push([0, 0, 1]);
    ok("an arm's wiring is a copy each call (changing one leaves the next as it was), another draw is another shuffle, and an arm or a draw that is not one is refused by name",
        J(B.edgesOf("PSUM", 3)) === J(B.summedShuffle(9003)) && J(B.edgesOf("PSUM", 3)) !== J(B.edgesOf("PSUM", 4)) && throws(() => B.edgesOf("PSHUF", 1), /no arm PSHUF/) && throws(() => B.edgesOf("PSUM", 0), /whole number from 1/));
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    const cbytes = fs.readFileSync(path.join(ENG, B.COMPASS));
    ok("!! THE COMPASS ROUND'S RECIPE, DRAWS, AUDIT, ALPHA AND USES LINE; the arms PSUM and PEVEN with 3 weights each, the lead PSUM; this round's own results file; the compass round's file named by the sha256 it was committed with (363cdbf5...) -- and it has that hash today",
        B.RECIPE === V.RECIPE && B.SEEDS === V.SEEDS && B.AUDIT === V.AUDIT && B.ALPHA === 0.01 && B.USES_BY === 0.01 && J(B.ARMS) === J(["PSUM", "PEVEN"]) && B.LEAD === "PSUM" && J(B.WEIGHTS) === J({ PSUM: 3, PEVEN: 3 }) && B.RESULTS === "brain/flyCompassBalancedRound.jsonl" &&
        B.COMPASS === V.RESULTS && B.COMPASS_SHA256 === "363cdbf5147d4137ad2b6d3de26e0e14ca7709a75e77aaad9317c15cad6c0527" && createHash("sha256").update(cbytes).digest("hex") === B.COMPASS_SHA256 && B.compassOf(cbytes).sha256 === B.COMPASS_SHA256 && B.compassOf(cbytes).lines.length === 38);
    const fly = B.policyOf("PEVEN", 1), w = [1.3, 0, 1.6], off = B.ratesOff("PSUM", 2, w);
    ok("the fly is the compass round's on the arm's wiring, its start (0, 0, 1); with a and b at 0 the same weights' third is kept",
        fly instanceof CF.CompassFly && J(Array.from(fly.getParams())) === J([0, 0, 1]) && PF.hashEdges(Array.from(fly.w0)) === PF.hashEdges(Array.from(new CF.CompassFly({ edges: B.edgesOf("PEVEN", 1) }).w0)) && J(Array.from(off.getParams())) === J([0, 0, Math.fround(1.6)]));
    const few = B.AUDIT.slice(0, 2), fl = B.floors(few);
    ok("!! THE FLOORS: vision off and the start are the compass library's flies (this round's file must carry the compass round's numbers to the bit); the untrained PSUM (draw 1) and PEVEN flies are this round's wirings with vision on",
        fl.kind === "floors" && fl.off === V.auditScore(V.policyOf("FROZEN", 1).setParams([0]), few) && fl.start === V.auditScore(V.policyOf("FROZEN", 1), few) && fl.untrained.PSUM === V.auditScore(B.policyOf("PSUM", 1), few) && fl.untrained.PEVEN === V.auditScore(B.policyOf("PEVEN", 1), few) && fl.untrained.PEVEN !== fl.start);
    const note = src("brain/FLY_COMPASS_BALANCED_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: draws 1 to 12; PSUM over the 260 ring neurons with a real connection, seed 9000 + draw, 3,000 sweeps; PEVEN's evening; A PSUM against PSHUF, B PEVEN against PLASTIC, C and D; PSUM draw 1 trained a second time; the compass file's hash",
        /\*\*draws 1 to 12\*\*/.test(note) && /\*\*the 260 ring neurons with a real connection\*\* x 46 \(seed \*\*9000 \+ draw\*\*\); then \*\*3,000 sweeps\*\*/.test(note) && /\*\*each strength times the mean summed input over the 46 compass neurons, over its own compass neuron's\*\*/.test(note) &&
        /\*\*A: PSUM against PSHUF\*\*/.test(note) && /\*\*B: PEVEN against PLASTIC\*\*/.test(note) && /\*\*C: PSUM against PLASTIC\*\* and \*\*D: PEVEN against PSHUF\*\*/.test(note) && /\*\*PSUM draw 1 is trained a second time\.\*\*/.test(note) && /sha256 363cdbf5147d4137/.test(note) && /alpha 0\.01, exact rank sums, two-sided, ties against the claim/.test(note));
});

console.log("\n3. ONE TRAINING (2 iterations, 4 flies tried, 1 life each, a battery of 2, on draw 901)");
section(() => {
    const r = B.trainOne("PSUM", 901, TINY, TINY_AUDIT);
    const byHand = trainDockES({ envFactory: () => new CE.CompassEnv(), obsDim: 284, actDim: 1, maxSteps: 1500, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 901, freshEpisodes: true, batteryEps: 2, policyFactory: () => new CF.CompassFly({ edges: B.summedShuffle(9901) }) });
    ok("!! A PSUM RECORD'S WEIGHTS ARE THE TRAINER'S FROM A POLICY MADE HERE BY HAND (the fly on the draw's fitted shuffle; the compass life; fresh lives; the battery), to the hash; it carries its rates, its score with a and b at 0, and its wiring",
        PF.hashWeights(byHand.params) === r.weightsHash && r.weightCount === 3 && r.rates && Number.isFinite(r.rates.c) && Number.isFinite(r.ratesOff) && r.edges === 8836 && r.edgesHash === PF.hashEdges(B.summedShuffle(9901)) && J(r.recipe) === J(TINY) && r.kind === "draw" && r.arm === "PSUM" && r.s === 901);
    const w = PF.unpackWeights(r.weights);
    ok("the tiny training's weights give its score again, and its score with a and b at 0 is the same weights' with the first two at 0", V.auditScore(B.policyOf("PSUM", 901).setParams(w), TINY_AUDIT) === r.score && V.auditScore(B.ratesOff("PSUM", 901, w), TINY_AUDIT) === r.ratesOff, `${r.score.toFixed(4)}, at 0 ${r.ratesOff.toFixed(4)}`);
});

console.log("\n4. THE RECORDS");
section(() => {
    const compass = B.compassOf(fs.readFileSync(path.join(ENG, B.COMPASS))), cdraw = (arm, s) => compass.lines.find((r) => r.kind === "draw" && r.arm === arm && r.s === s), cfl = compass.lines.find((r) => r.kind === "floors");
    const hist = Array.from({ length: 7 }, (_, k) => ({ it: [0, 10, 20, 30, 40, 50, 59][k], ret: 0.5 + k / 100 })), made = new Map();
    const stub = (arm, s) => { const k = arm + s; if (!made.has(k)) { const w = B.policyOf(arm, s).getParams(), e = B.edgesOf(arm, s); made.set(k, { edges: e.length, edgesHash: PF.hashEdges(e), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w) }); } return made.get(k); };
    const rec = (arm, s, score) => ({ kind: "draw", arm, s, recipe: { ...B.RECIPE }, ...stub(arm, s), rates: { a: 0.014, b: 0, c: 1.5e-5 }, ratesOff: score - 0.2, score, history: hist });
    const flo = () => ({ kind: "floors", off: cfl.off, start: cfl.start, untrained: { PSUM: 0.44, PEVEN: 0.50 } });
    const file = (f, first = 1) => { const out = []; for (const s of B.SEEDS) for (const arm of B.ARMS) out.push(f(arm, s)); out.push({ kind: "recheck", arm: "PSUM", s: first, weightsHash: out.find((r) => r.arm === "PSUM" && r.s === first).weightsHash }, flo()); return out; };
    // PSUM a hair either side of PLASTIC's own committed flies, PEVEN a hair either side of PSHUF's: A WORSE, B BETTER, C and D CANNOT
    const hair = (s) => (s % 2 ? 1e-6 : -1e-6), pulled = (arm, s) => rec(arm, s, arm === "PSUM" ? cdraw("PLASTIC", s).score + hair(s) : cdraw("PSHUF", s).score + hair(s)), good = file(pulled), R = B.reading(good, compass), lines = B.readingLines(R).join("\n");
    ok("!! a file of 24 draws with PSUM draw 1 a second time and the compass round's floors passes every check; a draw missing, PSUM with PEVEN's wiring, a fly without a rates-at-0 score, a second training of draw 2, a start one part in 10^15 off the compass round's, and a compass file that is not the committed one each fail by name",
        B.checkRecords(good, compass).length === 0 && good.length === 26 && /^the checks hold: the compass round's file as committed/.test(lines) && B.checkRecords(good.filter((r) => !(r.arm === "PEVEN" && r.s === 12)), compass).some((x) => /PEVEN draw 12 is there 0 times/.test(x)) &&
        B.checkRecords(good.map((r) => (r.arm === "PSUM" && r.s === 5 ? { ...r, edgesHash: stub("PEVEN", 5).edgesHash } : r)), compass).some((x) => /PSUM draw 5's wiring is not its arm's/.test(x)) && B.checkRecords(good.map((r) => (r.arm === "PEVEN" && r.s === 4 ? { ...r, ratesOff: null } : r)), compass).some((x) => /PEVEN draw 4 has no score with its rates at 0/.test(x)) &&
        J(B.checkRecords(file(pulled, 2), compass)) === J(["PSUM draw 1 trained a second time is not there once with the same weights"]) && J(B.checkRecords(good.map((r) => (r.kind === "floors" ? { ...r, start: r.start * (1 + 1e-15) } : r)), compass)) === J(["vision off and the start are not the compass round's to the bit: the fly, task or audit is not the same"]) &&
        B.checkRecords(good, { ...compass, sha256: "0".repeat(64) }).some((x) => /the compass round's file is not the one committed/.test(x)) && B.checkRecords(good, { ...compass, lines: compass.lines.filter((r) => !(r.arm === "PSHUF" && r.s === 3)) }).some((x) => /fails its own checks: PSHUF draw 3 is there 0 times/.test(x)));
    ok("!! A IS PSUM AGAINST PSHUF, B PEVEN AGAINST PLASTIC, C PSUM AGAINST PLASTIC, D PEVEN AGAINST PSHUF, EXACT RANK SUMS FROM THE COMPASS ROUND'S COMMITTED FLIES: PSUM a hair round PLASTIC's and PEVEN round PSHUF's -> A WORSE (ranks 78), B BETTER (222), C and D CANNOT; USES 12 of 12",
        R.A.word === B.WORDS.A[1] && R.A.sumA === 78 && R.A.a === "PSUM" && R.A.b === "PSHUF" && R.B.word === B.WORDS.B[0] && R.B.sumA === 222 && R.B.a === "PEVEN" && R.B.b === "PLASTIC" && R.C.word === B.WORDS.C[2] && R.D.word === B.WORDS.D[2] && R.arms.PSUM.uses === 12 && R.arms.PEVEN.uses === 12 &&
        near(R.arms.PLASTIC.mean, 0.6464) && near(R.arms.PSHUF.mean, 0.6765) && /A \(PSUM against PSHUF\): PSUM's ranks sum to 78 \(the middle is 150\)/.test(lines) && /THE REAL WIRING WITH ITS SUMMED INPUTS EVENED DOES BETTER THAN THE REAL WIRING/.test(lines));
    const tied = B.reading(file((arm, s) => rec(arm, s, arm === "PSUM" ? cdraw("PLASTIC", s).score : cdraw("PSHUF", s).score)), compass), lean = B.reading(file((arm, s) => ({ ...pulled(arm, s), ratesOff: pulled(arm, s).score - 0.005 })), compass);
    ok("PSUM equal to PLASTIC fly for fly is 12 ties and CANNOT (ties count against the claim); a fly whose score falls by 0.005 with a and b at 0 does not USE them", tied.C.ties === 12 && tied.C.word === B.WORDS.C[2] && lean.arms.PSUM.uses === 0 && B.uses({ score: 0.7, ratesOff: 0.68 }) && !B.uses({ score: 0.012, ratesOff: 0.002 }));
    const noFl = B.reading(good.filter((r) => r.kind !== "floors"), compass);
    ok("with no floors, or a failed check, no reading is weighed and the first line says so", noFl.A === null && noFl.D === null && /^A CHECK FAILED/.test(B.readingLines(noFl)[0]));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, B.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "PLASTIC", "1"], ["job", "PSUM", "x"], ["job", "PSUM", "0"], ["job", "PEVEN", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for PSUM or PEVEN and draws 1 to 12 -- and nothing else", J(B.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(B.parseArgs(["read"])) === J({ cmd: "read" }) && J(B.parseArgs(["job", "PEVEN", "12"])) === J({ cmd: "job", arm: "PEVEN", s: 12 }) && no.every((a) => B.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyCompassBalanced.mjs");
    ok("!! the command is this round's -- its library and results file, and the compass round's file read through compassOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, and trains THE LEAD ARM'S FIRST DRAW a second time (PSUM, draw 1)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyCompassBalanced\.mjs"/.test(csrc) && !/from "\.\/flyCompass\.mjs"/.test(csrc) && /PF\.reading\(linesOf\(\), PF\.compassOf\(fs\.readFileSync\(path\.join\(ENG, PF\.COMPASS\)\)\)\)/.test(csrc) &&
        /if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s\]\)/.test(csrc) && /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyCompassBalanced\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyCompassBalanced-selfcheck.mjs"), calls = [...me.matchAll(/B\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one training through the round's code is of 2 iterations with 4 flies tried on draw 901; it starts no process; the file's size and time are what they were",
        calls.length === 1 && /^"PSUM", 901, TINY, TINY_AUDIT$/.test(calls[0]) && TINY.iters === 2 && TINY.pop === 4 && !B.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} training, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (the whole results file was committed at e8245294 before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, B.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), compass = B.compassOf(fs.readFileSync(path.join(ENG, B.COMPASS)));
    const R = B.reading(lines, compass), A = R.arms, F = R.floors, cfl = compass.lines.find((r) => r.kind === "floors");
    const all = [...lines.filter((r) => r.kind === "draw"), ...compass.lines.filter((r) => r.kind === "draw" && (r.arm === "PLASTIC" || r.arm === "PSHUF"))];
    const of = (a) => all.filter((r) => r.arm === a).sort((x, y) => x.s - y.s), sc = (a) => of(a).map((r) => r.score), rec = (a, s) => lines.find((r) => r.kind === "draw" && r.arm === a && r.s === s), lost = (a) => of(a).map((r) => r.score - r.ratesOff);
    const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k + 1)); return r; };
    const spear = (x, y) => { const a = rank(x), b = rank(y), n = x.length; return 1 - 6 * a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / (n * (n * n - 1)); };
    const range = (a, f) => [Math.min(...of(a).map(f)), Math.max(...of(a).map(f))], within = ([lo, hi], L, H) => lo > L && hi < H;
    ok("!! the results file is the one the run wrote: 26 records, sha256 24a6bb78dfd9a39d... (two starts: the first was lost to a container restart before it wrote a line, the second wrote all 26)",
        lines.length === 26 && createHash("sha256").update(bytes).digest("hex") === "24a6bb78dfd9a39dd5db6189cd9f87d7434a043611ac05bf3782beed8eab4dd4");
    ok("!! THE CHECKS HOLD: the compass round's file as committed and passing its own checks; 24 draws each once; PSUM draw 1 the same twice; vision off 0.5041 and the start 0.4430 the compass round's to the bit; untrained PSUM (draw 1) 0.4357, PEVEN 0.5019",
        R.checks.length === 0 && lines.filter((r) => r.kind === "draw").length === 24 && F.off === cfl.off && F.start === cfl.start && near(F.off, 0.5041) && near(F.start, 0.4430) && near(F.untrained.PSUM, 0.4357) && near(F.untrained.PEVEN, 0.5019) &&
        lines.find((r) => r.kind === "recheck").weightsHash === rec("PSUM", 1).weightsHash);
    ok("!! *** A: A SHUFFLE GIVEN THE REAL WIRING'S SUMMED INPUTS DOES WORSE THAN A PLAIN SHUFFLE *** -- ranks 78, the fewest there can be (every PSUM fly below every PSHUF one), p 7.4e-7",
        R.A.word === B.WORDS.A[1] && R.A.a === "PSUM" && R.A.b === "PSHUF" && R.A.sumA === 78 && R.A.ties === 0 && near(R.A.p, 2 / 2704156, 1e-12) && Math.max(...sc("PSUM")) < Math.min(...sc("PSHUF")));
    ok("!! *** B: THE REAL WIRING WITH ITS SUMMED INPUTS EVENED DOES BETTER THAN THE REAL WIRING *** -- ranks 222, the most there can be (every PEVEN fly above every PLASTIC one), p 7.4e-7",
        R.B.word === B.WORDS.B[0] && R.B.a === "PEVEN" && R.B.b === "PLASTIC" && R.B.sumA === 222 && R.B.ties === 0 && near(R.B.p, 2 / 2704156, 1e-12) && Math.min(...sc("PEVEN")) > Math.max(...sc("PLASTIC")));
    ok("!! C: PSUM CANNOT BE TOLD APART FROM THE REAL WIRING -- ranks 135, p 0.41. D: PEVEN CANNOT BE TOLD APART FROM A PLAIN SHUFFLE -- ranks 125, p 0.16. With the pull matched, the partners are told neither better nor worse",
        R.C.word === B.WORDS.C[2] && R.C.a === "PSUM" && R.C.b === "PLASTIC" && R.C.sumA === 135 && R.C.ties === 0 && near(R.C.p, 0.4095, 5e-5) && R.D.word === B.WORDS.D[2] && R.D.a === "PEVEN" && R.D.b === "PSHUF" && R.D.sumA === 125 && R.D.ties === 0 && near(R.D.p, 0.1600, 5e-5));
    ok("!! the arms (mean, sd, least, most; with a and b at 0): PSUM 0.6434 0.0061 0.6331 0.6553, 0.3645 | PEVEN 0.6719 0.0061 0.6642 0.6836, 0.4963 | PLASTIC 0.6464 and PSHUF 0.6765 as the compass round committed them",
        near(A.PSUM.mean, 0.6434) && near(A.PSUM.sd, 0.0061) && near(A.PSUM.min, 0.6331) && near(A.PSUM.max, 0.6553) && near(A.PSUM.ratesOff, 0.3645) && near(A.PEVEN.mean, 0.6719) && near(A.PEVEN.sd, 0.0061) && near(A.PEVEN.min, 0.6642) && near(A.PEVEN.max, 0.6836) && near(A.PEVEN.ratesOff, 0.4963) &&
        near(A.PLASTIC.mean, 0.6464) && near(A.PSHUF.mean, 0.6765) && A.PSUM.n === 12 && A.PEVEN.n === 12);
    ok("!! USES 12 OF 12 IN EACH NEW ARM: with a and b at 0 PSUM loses 0.236 to 0.303 and PEVEN 0.168 to 0.186 (PLASTIC 0.259 to 0.286, PSHUF 0.170 to 0.210); THE RECOVERY RATE WENT TO 0 IN ALL 24",
        A.PSUM.uses === 12 && A.PEVEN.uses === 12 && within([Math.min(...lost("PSUM")), Math.max(...lost("PSUM"))], 0.235, 0.304) && within([Math.min(...lost("PEVEN")), Math.max(...lost("PEVEN"))], 0.168, 0.187) && [...of("PSUM"), ...of("PEVEN")].every((r) => r.rates.b === 0));
    ok("!! DESCRIBED AFTER THE READING, NOT REGISTERED -- THE TRAINED RATES FOLLOW THE SUMS, NOT THE PARTNERS: PSUM a 0.0138 to 0.0193, c 1.22 to 1.78e-5, means 0.0165 and 1.62e-5 (PLASTIC's 0.0160, 1.63e-5); PEVEN a 0.0101 to 0.0135, c 1.92 to 2.27e-5, means 0.0115 and 2.10e-5 (PSHUF's 0.0114, 1.97e-5); the further on c the lower the score, Spearman -0.40 in PSUM and -0.72 in PEVEN",
        within(range("PSUM", (r) => r.rates.a), 0.0137, 0.0193) && within(range("PSUM", (r) => r.rates.c), 1.22e-5, 1.78e-5) && within(range("PEVEN", (r) => r.rates.a), 0.0101, 0.0135) && within(range("PEVEN", (r) => r.rates.c), 1.92e-5, 2.27e-5) &&
        near(A.PSUM.a, 0.0165) && near(A.PSUM.c, 1.62e-5, 5e-8) && near(A.PEVEN.a, 0.0115) && near(A.PEVEN.c, 2.10e-5, 5e-8) && near(A.PLASTIC.a, 0.0160) && near(A.PSHUF.a, 0.0114) &&
        near(spear(of("PSUM").map((r) => r.rates.c), sc("PSUM")), -0.399, 5e-4) && near(spear(of("PEVEN").map((r) => r.rates.c), sc("PEVEN")), -0.720, 5e-4));
    const again = (a, s, zero) => { const r = rec(a, s), w = PF.unpackWeights(r.weights); return V.auditScore(zero ? B.ratesOff(a, s, w) : B.policyOf(a, s).setParams(w)); };
    ok("!! RE-AUDITED AFTER THE READING: PSUM draw 2 (the arm's least) gives its score and its score with a and b at 0 again on the 200 lives to the bit, and PEVEN draw 5 (the arm's most) its score",
        rec("PSUM", 2).score === A.PSUM.min && rec("PEVEN", 5).score === A.PEVEN.max && again("PSUM", 2) === rec("PSUM", 2).score && again("PSUM", 2, true) === rec("PSUM", 2).ratesOff && again("PEVEN", 5) === rec("PEVEN", 5).score);
    const H = (a) => A[a].history.map((h) => h.ret);
    ok("WHAT THE TRAINER SAW (its own battery, the mean of 12): PSUM 0.5852 at iteration 0 to 0.6472 at 59; PEVEN 0.6138 to 0.6867 (PLASTIC 0.5906 to 0.6513, PSHUF 0.6084 to 0.6740)",
        J(A.PSUM.history.map((h) => h.it)) === J([0, 10, 20, 30, 40, 50, 59]) && near(H("PSUM")[0], 0.5852) && near(H("PSUM")[6], 0.6472) && near(H("PEVEN")[0], 0.6138) && near(H("PEVEN")[6], 0.6867) && near(H("PLASTIC")[6], 0.6513) && near(H("PSHUF")[6], 0.6740));
    const real = pull(CF.REAL), psums = B.SEEDS.map((s) => pull(B.edgesOf("PSUM", s))), m = (a) => A[a].mean, gap = m("PSHUF") - m("PLASTIC");
    ok("!! MEASURED AFTER THE READING, NOT REGISTERED -- HOW MUCH OF THE COMPASS ROUND'S GAP: every PEVEN fly above every PSUM fly (least 0.6642, most 0.6553); of PSHUF over PLASTIC's 0.0301, evening the real sums closes 0.0255 (85 percent) and the real sums on random partners open 0.0332 (110 percent); all 12 PSUM wirings carry the real pull (536.31) to 1e-9, PEVEN's is under 1e-9",
        Math.min(...sc("PEVEN")) > Math.max(...sc("PSUM")) && near(gap, 0.0301) && near(m("PEVEN") - m("PLASTIC"), 0.0255) && near((m("PEVEN") - m("PLASTIC")) / gap, 0.847, 5e-4) && near(m("PSHUF") - m("PSUM"), 0.0332) && near((m("PSHUF") - m("PSUM")) / gap, 1.101, 5e-4) &&
        near(real, 536.31, 0.005) && psums.every((p) => Math.abs(p - real) < 1e-9) && pull(B.edgesOf("PEVEN", 1)) < 1e-9);
    const note = src("brain/FLY_COMPASS_BALANCED_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 9. The result"));
    ok("the expectations, written before the code, against what came -- every one: A WORSE (85), B BETTER (85), C CANNOT (55), D CANNOT (55), USES 12 of 12 in each new arm (85), PSUM's mean between 0.62 and 0.66 (65) at 0.6434, PEVEN's between 0.65 and 0.70 (65) at 0.6719",
        /A: \*\*WORSE about 85 percent\.\*\* B: \*\*BETTER about 85\.\*\* C: CANNOT about 55, WORSE about 35\. D: CANNOT about 55, WORSE about 35\. USES 12 of 12 in each new arm, about 85\. PSUM's mean between 0\.62 and 0\.66, about 65; PEVEN's between 0\.65 and 0\.70, about 65/.test(flat) &&
        R.A.word === B.WORDS.A[1] && R.B.word === B.WORDS.B[0] && R.C.word === B.WORDS.C[2] && R.D.word === B.WORDS.D[2] && A.PSUM.uses === 12 && A.PEVEN.uses === 12 && m("PSUM") >= 0.62 && m("PSUM") <= 0.66 && m("PEVEN") >= 0.65 && m("PEVEN") <= 0.70);
    ok("the registration's RESULT SECTION (section 9) carries the four readings' words, the commit the file was read at, that every expectation came, what section 4 said such a reading would say, the measurement after the reading said as such with the gate's numbers, and what it does not mean",
        /## 9\. The result/.test(note) && ["A", "B", "C", "D"].every((t) => res.includes(`**${t}: ${R[t].word}**`)) && /e8245294/.test(res) && /Every expectation came/.test(res) && /the pull is all of T1, as far as 12 draws can tell/.test(res) && /recovery rate went to 0 in all 24/.test(res) &&
        /Measured after the reading \(not registered; the gate recomputes it\)/.test(res) && /closes 0\.0255 of it \(85 percent\)/.test(res) && /opens 0\.0332 \(110 percent\)/.test(res) && /least PEVEN fly 0\.6642, the most PSUM fly 0\.6553/.test(res) && /What it does not mean/.test(res) && /not that they cost the animal/.test(res));
});

console.log(`\nflyCompassBalanced-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
