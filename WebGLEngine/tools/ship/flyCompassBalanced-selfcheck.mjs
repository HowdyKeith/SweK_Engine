// WebGLEngine/tools/ship/flyCompassBalanced-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyCompassBalanced-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its training is tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE BALANCED COMPASS ROUND (registered in brain/FLY_COMPASS_BALANCED_WIP.md before tools/ship/flyCompassBalanced.mjs and tools/ship/takeFlyCompassBalanced.mjs existed):
// is the real wiring's handicap in the compass round its uneven summed inputs onto the compass neurons?
//   1  THE WIRINGS              PSUM by hand: the shuffle over the 260, the fit, the real sums; PEVEN by hand: the real partners, even sums, no pull
//   2  THE ROUND'S NUMBERS      the compass round's recipe, draws, audit and fly; the arms; the compass file named by its hash; the floors; the registration says the same
//   3  ONE TRAINING             a record's weights are the trainer's from a policy made here by hand; its scores again
//   4  THE RECORDS              24 draws; the compass round's file; A, B, C, D; USES
//   5  THE COMMAND              it is this round's; no training of the round's, no process
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

console.log(`\nflyCompassBalanced-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
