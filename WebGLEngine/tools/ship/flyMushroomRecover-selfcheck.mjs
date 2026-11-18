// WebGLEngine/tools/ship/flyMushroomRecover-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyMushroomRecover-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its training is tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE MUSHROOM RECOVERY ROUND (registered in brain/FLY_MUSHROOM_RECOVER_WIP.md before brain/rl/mushroomRecoverFly.mjs, tools/ship/flyMushroomRecover.mjs and
// tools/ship/takeFlyMushroomRecover.mjs existed): does a fly that can undo its lessons do better when the meanings swap?
//   1  THE FLY                  the recovery by hand on five cells; with p_b 0 it is the mushroom fly action for action; a frozen one has no recovery
//   2  THE ROUND'S NUMBERS      the mushroom round's recipe, draws, tasks, audit and hand rule; the weights; the mushroom file by its hash; the floors; the registration says the same
//   3  ONE TRAINING             a record's weights are the trainer's from a policy made here by hand; its scores again
//   4  THE RECORDS              24 draws; R and H on each task; USES and b at 0
//   5  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 19, this gate,
// tools/ship/flyHomeOffset-selfcheck.mjs and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the commands' 6; every one red by name (the number is the rows red):
//   THE FLY (brain/rl/mushroomRecoverFly.mjs): K1 recovery toward 0 1 | K2 B_SCALE 0.1 3 | K3 the start recovers 1 | K4 a frozen fly recovers 1
//   THE ROUND: F1 recovery off zeroes p_a 1 | F2 the teachers are a shuffle's 2 | F3 R against PFAM 2 | F4 BETTER and WORSE swapped 1 | F5 H against the start 1 | F6 USES needs 0.3 3 |
//   F7 the hand rule's floor recovers 1 | F8 the recheck looked for on ONE 2 | F9 b at 0 counts the others 1 | F10 the round writes the mushroom round's file 1 | F11 the recipe is 40
//   iterations 3.  THE NOTE: N1 its b is 0.1 max(0, p_b) 1 | N2 its recovery toward 0 1 | N3 its R draw for draw 1 | N4 its draws are 13 to 24 1
//   THE COMMAND: C4 recover's second training is ONE's 1 | C5 exits 0 on a word it does not know 1 | C6 reads without the mushroom round's file 1 (and the offset round's command's three)
//   F8 WENT 0 RED FIRST, A FINDING ABOUT THIS GATE: the records made in section 4 gave a draw the same weights on both tasks, so a recheck looked for on ONE matched REV's; they now differ by
//   task, and F8 was run again (2 red, as above). ONE ROW OF MINE WAS WRONG WHEN FIRST RUN: two of the committed ONE flies share a score, so RECOV copied fly for fly is 14 ties, not 12.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as R from "./flyMushroomRecover.mjs";
import * as M from "./flyMushroom.mjs";
import * as PF from "./paintingFly.mjs";
import * as OE from "../../brain/rl/odorEnv.mjs";
import * as MF from "../../brain/rl/mushroomFly.mjs";
import * as RF from "../../brain/rl/mushroomRecoverFly.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TINY_AUDIT = [880001, 880002];
const mushroom = R.fileOf(fs.readFileSync(path.join(ENG, R.MUSHROOM)));

console.log("flyMushroomRecover-selfcheck -- the mushroom recovery round (the mushroom fly with a recovery rate it may learn, against the mushroom round's): the fly, the numbers, one training, the records, the command\n");

console.log("1. THE FLY (brain/rl/mushroomRecoverFly.mjs, by hand on five cells and three output neurons)");
section(() => {
    const edges = [[0, 0, 2], [1, 0, 1], [1, 2, 3], [3, 1, 4], [4, 2, 1]], teach = [[1, 0], [0, 1], [0.5, 0.5]], E = MF.EXPECT, base = [3 * E, 4 * E, 4 * E];
    const v = [0.3, -0.2, 0.5], fly = new RF.MushroomRecoverFly({ nk: 5, nm: 3, edges, teach }).setParams(Float32Array.from([...v, 0.07, 1.4, 4])), V = Array.from(Float32Array.from(v)), Bi = Math.fround(0.07), a = 0.5 * Math.fround(1.4), b = 0.05 * 4;
    const dr = (s) => { let x = Bi; for (let m = 0; m < 3; m++) x += V[m] * (s[m] / base[m] - 1); return x; };
    fly.act({ t: 0, x: [0, 1], us: 0 }); const d1 = fly.act({ t: 1, x: [1, 3], us: -1 })[0];
    // after trial 0 (no outcome yet) recovery leaves w at w0; at trial 1 the punished approach to cells 0 and 1 weakens them, then the drive, then every w moves b of the way back
    const w10 = 1 * (1 - a), w12 = 3 * (1 - 0.5 * a), w31 = 4, d2 = fly.act({ t: 2, x: [1, 3], us: 0 })[0];
    ok("!! THE RECOVERY BY HAND: after each trial's decision every connection moves b = 0.05 max(0, p_b) of the way back to its synapse count -- the drive at the trial after a punishment sees the weakened connections, and the trial after that sees them a fifth of the way back",
        near(d1, dr([w10, w31, w12]), 1e-12) && near(d2, dr([w10 + b * (1 - w10), w31, w12 + b * (3 - w12)]), 1e-12) && near(fly.recovery(), b, 1e-15) && RF.B_SCALE === 0.05);
    const plain = new MF.MushroomFly({ nk: 5, nm: 3, edges, teach }).setParams(Float32Array.from([...v, 0.07, 1.4])), zero = new RF.MushroomRecoverFly({ nk: 5, nm: 3, edges, teach }).setParams(Float32Array.from([...v, 0.07, 1.4, -2]));
    const seq = [{ t: 0, x: [0, 1], us: 0 }, { t: 1, x: [1, 3], us: -1 }, { t: 2, x: [0, 4], us: 1 }, { t: 3, x: [1, 3], us: 0 }];
    ok("!! WITH b AT 0 (p_b 0 or below) IT IS THE MUSHROOM FLY, ACTION FOR ACTION; its start is the mushroom fly's with p_b 0; a frozen one has the mushroom fly's weights and no recovery", J(seq.map((o) => plain.act(o)[0])) === J(seq.map((o) => zero.act(o)[0])) && zero.recovery() === 0 &&
        J(Array.from(new RF.MushroomRecoverFly({ nk: 5, nm: 3, edges, teach }).getParams())) === J([0, 0, 0, Math.fround(0.05), 1, 0]) && new RF.MushroomRecoverFly({ nk: 5, nm: 3, edges, teach, plastic: false }).paramCount() === 4 && new RF.MushroomRecoverFly({ nk: 5, nm: 3, edges, teach, plastic: false }).recovery() === 0);
    const again = fly.act({ t: 0, x: [0, 1], us: -1 })[0], fresh = new RF.MushroomRecoverFly({ nk: 5, nm: 3, edges, teach }).setParams(Float32Array.from([...v, 0.07, 1.4, 4])).act({ t: 0, x: [0, 1], us: 0 })[0];
    ok("a life starts afresh (t 0: every w back at its synapse count, nothing taught by the last life's outcome)", near(again, fresh, 1e-12));
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    ok("!! THE MUSHROOM ROUND'S RECIPE, DRAWS, TASKS, AUDIT, ALPHA, USES LINE AND HAND RULE; the one arm RECOV with 94 weights; b 0.05 max(0, p_b); the hand rule with a recovery of 0.1 (p_b 2) described; this round's own results file; the mushroom file by its committed sha256 -- and it has it today",
        R.RECIPE === M.RECIPE && R.SEEDS === M.SEEDS && R.TASKS === M.TASKS && R.AUDIT === M.AUDIT && R.ALPHA === 0.01 && R.USES_BY === 0.01 && R.HAND === M.HAND && J(R.ARMS) === J(["RECOV"]) && R.LEAD === "RECOV" && R.WEIGHTS === 94 && R.B_SCALE === 0.05 &&
        J(R.HAND_B) === J([...M.HAND, 2]) && R.RESULTS === "brain/flyMushroomRecoverRound.jsonl" && R.MUSHROOM === "brain/flyMushroomRound.jsonl" && R.MUSHROOM_SHA256 === "b4d8db8d8139598765767921a7e43d97ec3e183889a929f4df60653f75e9cc31" &&
        mushroom.sha256 === R.MUSHROOM_SHA256 && createHash("sha256").update(fs.readFileSync(path.join(ENG, R.MUSHROOM))).digest("hex") === R.MUSHROOM_SHA256 && R.policyOf(3).paramCount() === 94 && J(Array.from(R.recoveryOff(3, [...Array(93).fill(0.1), 7]).getParams()).slice(91)) === J([Math.fround(0.1), Math.fround(0.1), 0]) && throws(() => R.policyOf(0), /whole number from 1/) && throws(() => R.trainOne("TWO", 1), /ONE or REV/));
    const fl = R.floors(TINY_AUDIT), mf = M.floors(TINY_AUDIT);
    ok("!! THE FLOORS: the untrained fly and the hand rule (p_b 0) are the mushroom round's to the bit on each task; the hand rule with a recovery of 0.1 is the same rule with p_b 2", J(fl.start) === J(mf.start) && J(fl.hand) === J(mf.hand) && fl.handB.REV === M.auditScore(R.policyOf(1).setParams([...M.HAND, 2]), "REV", TINY_AUDIT) && J(Object.keys(fl)) === J(["kind", "start", "hand", "handB"]));
    const note = src("brain/FLY_MUSHROOM_RECOVER_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the recovery w <- w + b (w0 - w) with b = 0.05 max(0, p_b), after each trial's decision; the weights and the start; draws 1 to 12; R as a rank sum, H a sign test; USES and b at 0 counted; REV's RECOV draw 1 again; the mushroom file's hash",
        /\*\*every Kenyon-cell-to-output connection is drawn back toward its synapse count: w <- w \+ b \(w0 - w\)\*\*, with \*\*b = 0\.05 max\(0, p_b\)\*\*/.test(note) && /\*\*\[v_1\.\.v_91, bias, p_a, p_b\]\*\*/.test(note) && /\*\*the start is the mushroom fly's with p_b 0\*\*/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) &&
        /\*\*R: RECOV against PLASTIC\*\* \(rank sum\)/.test(note) && /\*\*H: RECOV against the hand rule\*\*/.test(note) && /\*\*how many RECOV flies end with b at 0\*\*/.test(note) && /\*\*RECOV draw 1 of REV is trained a second time\.\*\*/.test(note) && /sha256 b4d8db8d81395987/.test(note));
});

console.log("\n3. ONE TRAINING (2 iterations, 4 flies tried, 1 life each, a battery of 2, on draw 901)");
section(() => {
    const r = R.trainOne("REV", 901, TINY, TINY_AUDIT);
    const byHand = trainDockES({ envFactory: () => new OE.OdorEnv({ task: "REV", nk: 4064 }), obsDim: 1, actDim: 1, maxSteps: 30, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 901, freshEpisodes: true, batteryEps: 2, policyFactory: () => new RF.MushroomRecoverFly({ nk: 4064, nm: 91, edges: M.CIRCUIT.edges, teach: M.teachFor("PLASTIC", 1) }) });
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A POLICY MADE HERE BY HAND (the recovering fly on the real teachers, the REV life, fresh lives, the battery), to the hash; it carries both rates and its score with p_b at 0",
        PF.hashWeights(byHand.params) === r.weightsHash && r.weightCount === 94 && J(r.recipe) === J(TINY) && r.kind === "draw" && r.task === "REV" && r.arm === "RECOV" && r.s === 901 && Number.isFinite(r.ratesOff) && r.recovery === 0.05 * Math.max(0, PF.unpackWeights(r.weights)[93]));
    const w = PF.unpackWeights(r.weights);
    ok("the tiny training's weights give its score again, and its score with p_b at 0 is the same weights' with the last at 0", M.auditScore(R.policyOf(901).setParams(w), "REV", TINY_AUDIT) === r.score && M.auditScore(R.recoveryOff(901, w), "REV", TINY_AUDIT) === r.ratesOff, `${r.score.toFixed(4)}, at 0 ${r.ratesOff.toFixed(4)}`);
});

console.log("\n4. THE RECORDS (made here; PLASTIC is the mushroom round's as committed)");
section(() => {
    const pl = (t, s) => mushroom.lines.find((r) => r.kind === "draw" && r.task === t && r.arm === "PLASTIC" && r.s === s), mfl = mushroom.lines.find((r) => r.kind === "floors"), wts = (t, s) => Float32Array.from([...Array(91).fill(t === "ONE" ? 0.02 : 0.01), 0.1, 1, s % 3 === 0 ? 0 : 1.4]);
    const hist = Array.from({ length: 7 }, (_, k) => ({ it: [0, 10, 20, 30, 40, 50, 59][k], ret: 0.2 + k / 100 }));
    const rec = (t, s, score, off) => ({ kind: "draw", task: t, arm: "RECOV", s, recipe: { ...R.RECIPE }, weightCount: 94, weights: PF.packWeights(wts(t, s)), weightsHash: PF.hashWeights(wts(t, s)), rate: 0.5, recovery: s % 3 === 0 ? 0 : 0.07, ratesOff: off, score, history: hist });
    const file = (f, recheck = 1) => { const out = []; for (const t of R.TASKS) for (const s of R.SEEDS) { const [sc, off] = f(t, s); out.push(rec(t, s, sc, off)); } out.push({ kind: "recheck", task: "REV", arm: "RECOV", s: recheck, weightsHash: out.find((r) => r.task === "REV" && r.s === recheck).weightsHash }, { kind: "floors", start: mfl.start, hand: mfl.hand, handB: { ONE: 0.75, REV: 0.46 } }); return out; };
    // REV: RECOV above every PLASTIC fly and the hand rule; on draws 3, 6, 9, 12 b is 0 and the score with b at 0 the same. ONE: RECOV a hair either side of PLASTIC, all under the hand rule
    const sc = (t, s) => (t === "REV" ? [0.31 + s / 1000, s % 3 === 0 ? 0.31 + s / 1000 : 0.2] : [pl(t, s).score + (s % 2 ? 1e-6 : -1e-6), pl(t, s).score + (s % 2 ? 1e-6 : -1e-6)]);
    const good = file(sc), Rd = R.reading(good, mushroom), lines = R.readingLines(Rd).join("\n"), V = Rd.tasks.REV, O = Rd.tasks.ONE;
    ok("!! a file of 24 draws with REV's draw 1 a second time and the floors passes every check; a draw missing, a fly of 93 weights, no score with b at 0, the second training of draw 2, a start one part in 10^15 off the mushroom round's, and a mushroom file that is not the committed one each fail by name",
        R.checkRecords(good, mushroom).length === 0 && good.length === 26 && /^the checks hold/.test(lines) && R.checkRecords(good.filter((r) => !(r.task === "ONE" && r.s === 12)), mushroom).some((x) => /ONE RECOV draw 12 is there 0 times/.test(x)) &&
        R.checkRecords(good.map((r) => (r.task === "REV" && r.s === 5 ? { ...r, weightCount: 93 } : r)), mushroom).some((x) => /REV RECOV draw 5 has 93 weights/.test(x)) && R.checkRecords(good.map((r) => (r.task === "ONE" && r.s === 4 ? { ...r, ratesOff: null } : r)), mushroom).some((x) => /ONE RECOV draw 4 has no score with its recovery at 0/.test(x)) &&
        J(R.checkRecords(file(sc, 2), mushroom)) === J(["REV RECOV draw 1 trained a second time is not there once with the same weights"]) && J(R.checkRecords(good.map((r) => (r.kind === "floors" ? { ...r, start: { ...r.start, REV: r.start.REV * (1 + 1e-15) + 1e-17 } } : r)), mushroom)) === J(["the start and the hand rule are not the mushroom round's to the bit: the fly, task or audit is not the same"]) &&
        R.checkRecords(good, { ...mushroom, sha256: "0".repeat(64) }).some((x) => /the mushroom round's file is not the one committed/.test(x)));
    ok("!! R IS RECOV AGAINST THE MUSHROOM ROUND'S PLASTIC (an exact rank sum), H RECOV AGAINST THE TASK'S HAND RULE (a sign test): REV -> R BETTER (ranks 222), H BETTER (12 above 0.2220), USES 8 of 12, b at 0 in 4; ONE -> R CANNOT, H WORSE (12 below 0.8943)",
        V.R.word === R.WORDS.R[0] && V.R.sumA === 222 && V.H.word === R.WORDS.H[0] && V.H.above === 12 && V.H.ref === mfl.hand.REV && V.arms.RECOV.uses === 8 && V.arms.RECOV.bZero === 4 && O.R.word === R.WORDS.R[2] && O.H.word === R.WORDS.H[1] && O.H.below === 12 && near(O.arms.PLASTIC.mean, 0.7757) &&
        /R \(RECOV against PLASTIC\): RECOV's ranks sum to 222 \(the middle is 150\)/.test(lines) && /THE FLY THAT CAN RECOVER DOES BETTER THAN THE MUSHROOM ROUND'S FLY/.test(lines) && /USES 8 of 12, b at 0 in 4/.test(lines));
    const tied = R.reading(file((t, s) => [pl(t, s).score, pl(t, s).score]), mushroom), noFl = R.reading(good.filter((r) => r.kind !== "floors"), mushroom);
    ok("RECOV equal to PLASTIC fly for fly is all ties and CANNOT, p 1 (14 ties: two of the committed ONE flies share a score; ties count against the claim); a fly whose score falls by 0.005 with b at 0 does not USE it; with a failed check no reading is weighed and the first line says so",
        tied.tasks.ONE.R.ties === 14 && tied.tasks.ONE.R.p === 1 && tied.tasks.ONE.R.word === R.WORDS.R[2] && !R.uses({ score: 0.3, ratesOff: 0.295 }) && R.uses({ score: 0.3, ratesOff: 0.2 }) && noFl.tasks.REV.R === null && /^A CHECK FAILED/.test(R.readingLines(noFl)[0]));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, R.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "1"], ["job", "REV", "RECOV", "1"], ["job", "TWO", "1"], ["job", "REV", "0"], ["job", "ONE", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job TASK S for ONE or REV and draws 1 to 12 -- and nothing else", J(R.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(R.parseArgs(["read"])) === J({ cmd: "read" }) && J(R.parseArgs(["job", "REV", "12"])) === J({ cmd: "job", task: "REV", s: 12 }) && no.every((a) => R.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyMushroomRecover.mjs");
    ok("!! the command is this round's -- its library and results file, and the mushroom round's file read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, and trains REV's draw 1 a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyMushroomRecover\.mjs"/.test(csrc) && /PF\.trainOne\(args\.task, args\.s\)/.test(csrc) && /PF\.reading\(linesOf\(\), PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, PF\.MUSHROOM\)\)\)\)/.test(csrc) &&
        /if \(!done\.has\(task \+ "\/" \+ s\)\) todo\.push\(\[task, s\]\)/.test(csrc) && /await jobOnce\("REV", PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", task: "REV", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyMushroomRecover\.mjs run \[--jobs N\] \| read \| job TASK S/.test(csrc));
    const me = src("tools/ship/flyMushroomRecover-selfcheck.mjs"), calls = [...me.matchAll(/R\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one training through the round's code is tiny and on draw 901 (and one refused); it starts no process; the file's size and time are what they were",
        calls.length === 2 && /^"TWO", 1$/.test(calls[0]) && /^"REV", 901, TINY, TINY_AUDIT$/.test(calls[1]) && !R.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyMushroomRecover-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
