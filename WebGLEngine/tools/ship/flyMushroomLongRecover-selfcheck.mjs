// WebGLEngine/tools/ship/flyMushroomLongRecover-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyMushroomLongRecover-selfcheck.mjs      (about fifteen seconds; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE LONG RECOVERY ROUND (registered in brain/FLY_MUSHROOM_LONG_RECOVER_WIP.md before tools/ship/flyMushroomLongRecover.mjs and tools/ship/takeFlyMushroomLongRecover.mjs existed):
// does the recovering fly trained four times longer reach the hand rule when the meanings swap?
//   1  THE ROUND'S NUMBERS      the long recipe, draws, tasks, audit; the fly and task not edited; the three committed files by their hashes; the hand rule each task is read against; the
//                               floors; the registration says the same
//   2  ONE TRAINING             a record's weights are the recovery round's training with the long recipe, and the trainer's by hand; a longer walk starts as the shorter one; the
//                               iteration kept; its scores again
//   3  THE RECORDS              24 draws; G, L and H on each task; USES and b at 0
//   4  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the
// command as a process) for all 30; every one red by name but ONE, a finding (the number is the rows red):
//   THE FLY: E1 brain/rl/mushroomRecoverFly.mjs edited (a comment) 1
//   THE ROUND: F1 the recipe the recovery round's 60 iterations 4 | F2 H on REV against the plain hand rule 2 | F3 the fly without recovery 1 | F4 not fresh lives 2 | F5 the iteration kept
//   is the last 1 | F6 the walk's start checked at iteration 0 only 1 | F7 G against LONG 2 | F8 L against RECOV 0 -- A FINDING, see below -- then 1 | F9 the rank sum's BETTER and WORSE
//   swapped 2 | F10 G's BETTER and WORSE swapped 2 | F11 USES needs 0.3 1 | F12 b at 0 counts the others 1 | F13 the recovery file's own checks skipped 1 | F14 the trainer file's own checks
//   skipped 1 | F15 the floors' recovery hand rule not compared 1 | F16 the recheck looked for on ONE 3 | F17 the round writes the recovery round's file 1 | F18 the audit the scoping lives 1
//   | F19 the floors the mushroom round's 1 | F20 the weight count not checked 1
//   THE COMMAND: C1 the second training is ONE's 1 | C2 exits 0 on a word it does not know 1 | C3 the job trains with a recipe of its own 1 | C4 the file's draws not counted as done 1 | C5
//   reads without the committed files 1.   THE NOTE: N1 its 240 iterations are 120 1 | N2 its H on REV is 0.4623 1 | N3 its G is a rank sum 1 | N4 it drops that 0.1 is not the best 1
//   THE FINDING: the records made in section 3 put REV's RLONG above every RECOV and LONG fly, so L came out the same against either, and ONE's L was never asked; ONE's RLONG copies RECOV,
//   so L there is now pinned (ranks 87 and no ties against LONG; against RECOV it would be 150 and 12 ties), and F8 was run again: 1 red. AND ONE NUMBER OF MINE WAS WRONG WHEN FIRST RUN:
//   the made REV scores (0.45 + s/1000) were not above RECOV's best (0.4777), nor ONE's 0.9 + s/10^4 above LONG's (0.9103); they are 0.48 and 0.92 now.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as LR from "./flyMushroomLongRecover.mjs";
import * as RC from "./flyMushroomRecover.mjs";
import * as MT from "./flyMushroomTrainer.mjs";
import * as M from "./flyMushroom.mjs";
import * as PF from "./paintingFly.mjs";
import * as OE from "../../brain/rl/odorEnv.mjs";
import * as RF from "../../brain/rl/mushroomRecoverFly.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TINY4 = Object.freeze({ ...TINY, iters: 4 }), TINY_AUDIT = [880021, 880022];
const F = Object.fromEntries(Object.entries(LR.FILES).map(([k, f]) => [k, LR.fileOf(fs.readFileSync(path.join(ENG, f)))]));
const recov = (t, s) => F.recover.lines.find((r) => r.kind === "draw" && r.task === t && r.arm === "RECOV" && r.s === s), long = (t, s) => F.trainer.lines.find((r) => r.kind === "draw" && r.task === t && r.arm === "LONG" && r.s === s);

console.log("flyMushroomLongRecover-selfcheck -- the long recovery round (the recovering fly trained 240 iterations, against the recovery round's RECOV and the trainer round's LONG): the numbers, one training, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! THE LONG RECIPE IS THE MUSHROOM TRAINER ROUND'S (the mushroom round's with 240 iterations: 16 flies tried, sigma 0.14, lr 0.05, 4 fresh lives each, the best on the fixed 16); the mushroom round's draws 1 to 12, tasks, audit, alpha and USES line; the one arm RLONG with the recovering fly's 94 weights; this round's own results file",
        LR.RECIPE === MT.RECIPES.LONG && J(LR.RECIPE) === J({ iters: 240, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 4, fresh: true, battery: 16 }) && LR.SEEDS === M.SEEDS && J(LR.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && LR.TASKS === M.TASKS && LR.AUDIT === M.AUDIT &&
        LR.ALPHA === 0.01 && LR.USES_BY === 0.01 && J(LR.ARMS) === J(["RLONG"]) && LR.LEAD === "RLONG" && LR.WEIGHTS === 94 && LR.WEIGHTS === RC.WEIGHTS && LR.RESULTS === "brain/flyMushroomLongRecoverRound.jsonl" && throws(() => LR.trainOne("TWO", 1), /ONE or REV/) && throws(() => LR.trainOne("REV", 0), /whole number from 1/));
    ok("!! THE FLY AND THE TASK ARE NOT EDITED: brain/rl/mushroomRecoverFly.mjs, brain/rl/mushroomFly.mjs and brain/rl/odorEnv.mjs are the bytes the recovery round committed (fc2b8f0e)",
        sha("brain/rl/mushroomRecoverFly.mjs") === "17b14f179505ebfaa7a8a4d9976ced4d8170fc5131f5c8edc58d3276c4b203b6" && sha("brain/rl/mushroomFly.mjs") === "41f511af84f7ebbd9f35dc065cfd0419cfaf0c68ab2a5c8fcec8d04c4119220e" && sha("brain/rl/odorEnv.mjs") === "321506d5a9ec909fa3cbde56ab2a3acbd01db21baec0a5ba2ce5b7db7bcd8c4d");
    ok("!! THE THREE COMMITTED FILES BY THEIR HASHES -- the recovery round's, the mushroom trainer round's and the mushroom round's -- and the tree has them today, each passing its own checks",
        J(LR.FILES) === J({ recover: "brain/flyMushroomRecoverRound.jsonl", trainer: "brain/flyMushroomTrainerRound.jsonl", mushroom: "brain/flyMushroomRound.jsonl" }) && LR.RECOVER === RC.RESULTS && LR.TRAINER === MT.RESULTS && LR.FILES.recover === LR.RECOVER && LR.FILES.trainer === LR.TRAINER && LR.RECOVER_SHA256 === "f49dca61697f1407d5018cafc6835624fd832d0a761bcb51f037d10faea08eba" &&
        LR.TRAINER_SHA256 === "b463b5117a486cfca539fd824e0a211c67f937b6a4d91e7ec7b23705fe79b293" && F.recover.sha256 === LR.RECOVER_SHA256 && F.trainer.sha256 === LR.TRAINER_SHA256 && F.mushroom.sha256 === RC.MUSHROOM_SHA256 &&
        RC.checkRecords(F.recover.lines, F.mushroom).length === 0 && MT.checkRecords(F.trainer.lines, F.mushroom).length === 0);
    const rfl = F.recover.lines.find((r) => r.kind === "floors");
    ok("!! H IS READ AGAINST THE HAND RULE COMMITTED FOR THE TASK: on REV the recovery round's with a recovery of 0.1 (0.5000), on ONE the mushroom round's (0.8943)",
        LR.handOf(rfl, "REV") === rfl.handB.REV && LR.handOf(rfl, "ONE") === rfl.hand.ONE && near(LR.handOf(rfl, "REV"), 0.5) && near(LR.handOf(rfl, "ONE"), 0.8943) && throws(() => LR.handOf(rfl, "TWO"), /ONE or REV/));
    const fl = LR.floors(TINY_AUDIT);
    ok("the floors are the recovery round's own function: the untrained fly, the hand rule and the hand rule with a recovery of 0.1, on each task", J(fl) === J(RC.floors(TINY_AUDIT)) && J(Object.keys(fl)) === J(["kind", "start", "hand", "handB"]));
    const note = src("brain/FLY_MUSHROOM_LONG_RECOVER_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: 240 iterations; the first 60 RECOV's walk; draws 1 to 12; G draw for draw, L a rank sum, H against the hand rule committed for the task (0.5000 and 0.8943), and that 0.1 is not the best recovery; USES and b at 0; REV's RLONG draw 1 again; the files' hashes",
        /with \*\*240 iterations\*\*/.test(note) && /\*\*its first 60 iterations are RECOV's walk\*\*/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) && /\*\*G: RLONG against RECOV, draw for draw\*\* \(sign test\)/.test(note) && /\*\*L: RLONG against LONG\*\* \(rank sum\)/.test(note) &&
        /on REV the recovery round's hand rule with a recovery of 0\.1 \(0\.5000\), on ONE the mushroom round's hand rule \(0\.8943\)/.test(note) && /\*\*Said plainly: 0\.1 is not the best recovery for the hand rule on REV\*\*/.test(note) && /\*\*RLONG draw 1 of REV is trained a second time\.\*\*/.test(note) &&
        /sha256 f49dca61697f1407/.test(note) && /sha256 b463b5117a486cfc/.test(note));
});

console.log("\n2. ONE TRAINING (2 and 4 iterations, 4 flies tried, 1 life each, a battery of 2, on draw 901)");
section(() => {
    const r = LR.trainOne("REV", 901, TINY, TINY_AUDIT), rc = RC.trainOne("REV", 901, TINY, TINY_AUDIT);
    const byHand = trainDockES({ envFactory: () => new OE.OdorEnv({ task: "REV", nk: 4064 }), obsDim: 1, actDim: 1, maxSteps: 30, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 901, freshEpisodes: true, batteryEps: 2, policyFactory: () => new RF.MushroomRecoverFly({ nk: 4064, nm: 91, edges: M.CIRCUIT.edges, teach: M.teachFor("PLASTIC", 1) }) });
    ok("!! A RECORD'S WEIGHTS ARE THE RECOVERY ROUND'S TRAINING WITH THE RECIPE GIVEN, AND THE TRAINER'S FROM A POLICY MADE HERE BY HAND, to the hash; its scores, rates and history are the recovery round's record's", r.weightsHash === rc.weightsHash && PF.hashWeights(byHand.params) === r.weightsHash &&
        r.score === rc.score && r.ratesOff === rc.ratesOff && r.rate === rc.rate && r.recovery === rc.recovery && J(r.history) === J(rc.history) && r.kind === "draw" && r.task === "REV" && r.arm === "RLONG" && r.s === 901 && r.weightCount === 94 && J(r.recipe) === J(TINY));
    const r4 = LR.trainOne("REV", 901, TINY4, TINY_AUDIT), w = PF.unpackWeights(r4.weights);
    ok("!! A LONGER WALK STARTS AS THE SHORTER ONE: 4 iterations of draw 901 have the 2-iteration walk's battery return at iterations 0 and 1 to the bit (the trainer draws the same noise and lives for an iteration whatever the length)",
        r4.history.length === 4 && r4.history[0].ret === rc.history[0].ret && r4.history[1].ret === rc.history[1].ret && r4.history[0].it === 0 && r4.history[1].it === 1, `${r4.history.map((h) => h.ret.toFixed(4)).join(" ")}`);
    const best = r4.history.reduce((b, h, i) => (h.ret > r4.history[b].ret ? i : b), 0);
    ok("the iteration kept is the first whose battery return no later one beats (the trainer keeps the best on its battery, ties to the earlier)", r4.keptAt === best && Number.isInteger(r.keptAt) && r.keptAt >= 0 && r.keptAt < 2, `kept ${r4.keptAt}`);
    ok("the 4-iteration training's weights give its score again, and its score with p_b at 0 is the same weights' with the last at 0", M.auditScore(RC.policyOf(901).setParams(w), "REV", TINY_AUDIT) === r4.score && M.auditScore(RC.recoveryOff(901, w), "REV", TINY_AUDIT) === r4.ratesOff, `${r4.score.toFixed(4)}, at 0 ${r4.ratesOff.toFixed(4)}`);
});

console.log("\n3. THE RECORDS (made here; RECOV and LONG are the committed rounds')");
section(() => {
    const rfl = F.recover.lines.find((r) => r.kind === "floors"), wts = (t, s) => Float32Array.from([...Array(91).fill(t === "ONE" ? 0.02 : 0.01), 0.1, 1, s % 4 === 0 ? 0 : 2 + s / 10]);
    // a walk that starts as its draw's RECOV walk: the battery return at iterations 0 and 40 copied from the committed record
    const hist = (t, s) => { const rc = recov(t, s).history, at = (it) => rc.find((h) => h.it === it).ret; return [0, 40, 80, 120, 160, 200, 239].map((it) => ({ it, ret: it <= 40 ? at(it) : 0.3 + it / 1e4 })); };
    const rec = (t, s, score, off) => ({ kind: "draw", task: t, arm: "RLONG", s, recipe: { ...LR.RECIPE }, weightCount: 94, weights: PF.packWeights(wts(t, s)), weightsHash: PF.hashWeights(wts(t, s)), rate: 0.5, recovery: s % 4 === 0 ? 0 : 0.1, ratesOff: off, score, keptAt: 100 + s, history: hist(t, s) });
    const file = (f, recheck = 1) => { const out = []; for (const t of LR.TASKS) for (const s of LR.SEEDS) { const [sc, off] = f(t, s); out.push(rec(t, s, sc, off)); } out.push({ kind: "recheck", task: "REV", arm: "RLONG", s: recheck, weightsHash: out.find((r) => r.task === "REV" && r.s === recheck).weightsHash }, { ...rfl }); return out; };
    // REV: 0.48 + s/10^4, above every RECOV fly (the most 0.4777) and LONG fly and below the hand rule's 0.5; on draws 4, 8, 12 b is 0. ONE: each draw's RECOV score exactly, under the hand rule's 0.8943
    const sc = (t, s) => (t === "REV" ? [0.48 + s / 1e4, s % 4 === 0 ? 0.48 + s / 1e4 : 0.3] : [recov(t, s).score, recov(t, s).score]);
    const good = file(sc), R = LR.reading(good, F), lines = LR.readingLines(R).join("\n"), V = R.tasks.REV, O = R.tasks.ONE, bad = (recs, re, FF = F) => LR.checkRecords(recs, FF).some((x) => re.test(x));
    ok("!! a file of 24 draws with REV's draw 1 a second time and the floors passes every check; a draw missing, another recipe, a fly of 93 weights, weights not their hash, no score with b at 0, no iteration kept, and a walk that does not start as its draw's RECOV walk (one part in 10^15 at iteration 40) each fail by name",
        LR.checkRecords(good, F).length === 0 && good.length === 26 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.task === "ONE" && r.s === 12)), /ONE RLONG draw 12 is there 0 times/) &&
        bad(good.map((r) => (r.task === "REV" && r.s === 3 ? { ...r, recipe: { ...r.recipe, iters: 60 } } : r)), /REV RLONG draw 3 was trained with another recipe/) && bad(good.map((r) => (r.task === "REV" && r.s === 5 ? { ...r, weightCount: 93 } : r)), /REV RLONG draw 5 has 93 weights/) &&
        bad(good.map((r) => (r.task === "ONE" && r.s === 6 ? { ...r, weightsHash: "0".repeat(16) } : r)), /ONE RLONG draw 6's weights are not 94 finite numbers with its hash/) && bad(good.map((r) => (r.task === "ONE" && r.s === 4 ? { ...r, ratesOff: null } : r)), /ONE RLONG draw 4 has no score, or none with its recovery at 0/) &&
        bad(good.map((r) => (r.task === "REV" && r.s === 7 ? { ...r, keptAt: 240 } : r)), /REV RLONG draw 7 does not say which iteration it kept/) &&
        bad(good.map((r) => (r.task === "REV" && r.s === 9 ? { ...r, history: r.history.map((h) => (h.it === 40 ? { ...h, ret: h.ret * (1 + 1e-15) + 1e-17 } : h)) } : r)), /REV RLONG draw 9's walk does not start as its draw's RECOV walk/));
    ok("!! the second training of draw 2, floors one part in 10^15 off the recovery round's, a committed file that is not the one committed, or one that fails its own checks, each fail by name and no record is weighed",
        J(LR.checkRecords(file(sc, 2), F)) === J(["REV RLONG draw 1 trained a second time is not there once with the same weights"]) &&
        J(LR.checkRecords(good.map((r) => (r.kind === "floors" ? { ...r, handB: { ...r.handB, REV: r.handB.REV * (1 + 1e-15) } } : r)), F)) === J(["the floors are not the recovery round's to the bit: the fly, task or audit is not the same"]) &&
        J(LR.checkRecords(good, { ...F, recover: { ...F.recover, sha256: "0".repeat(64) } })) === J(["the recovery round's file is not the one committed (sha256 f49dca61697f1407...)"]) &&
        J(LR.checkRecords(good, { ...F, trainer: { ...F.trainer, sha256: "1".repeat(64) } })) === J(["the mushroom trainer round's file is not the one committed (sha256 b463b5117a486cfc...)"]) &&
        J(LR.checkRecords(good, { ...F, recover: { ...F.recover, lines: F.recover.lines.filter((r) => !(r.task === "ONE" && r.s === 3 && r.kind === "draw")) } })) === J(["the recovery round's file fails its own checks: ONE RECOV draw 3 is there 0 times (once is registered)"]) &&
        J(LR.checkRecords(good, { ...F, trainer: { ...F.trainer, lines: F.trainer.lines.filter((r) => !(r.task === "REV" && r.arm === "LONG" && r.s === 5)) } })) === J(["the mushroom trainer round's file fails its own checks: REV LONG draw 5 is there 0 times (once is registered)"]));
    ok("!! G IS RLONG AGAINST RECOV DRAW FOR DRAW (an exact sign test of the differences), L RLONG AGAINST LONG (an exact rank sum), H RLONG AGAINST THE TASK'S COMMITTED HAND RULE (a sign test): REV -> G BETTER (12 above), L BETTER (ranks 222), H WORSE (12 below 0.5000), USES 9 of 12, b at 0 in 3; ONE -> G CANNOT (12 ties, p 1), L WORSE (ranks 87, no ties: RECOV's ONE scores against LONG's), H WORSE (12 below 0.8943)",
        V.G.word === LR.WORDS.G[0] && V.G.above === 12 && V.G.b === "RECOV" && V.L.word === LR.WORDS.L[0] && V.L.sumA === 222 && V.L.b === "LONG" && V.H.word === LR.WORDS.H[1] && V.H.below === 12 && V.H.ref === rfl.handB.REV && V.arms.RLONG.uses === 9 && V.arms.RLONG.bZero === 3 &&
        O.G.ties === 12 && O.G.p === 1 && O.G.word === LR.WORDS.G[2] && O.L.word === LR.WORDS.L[1] && O.L.sumA === 87 && O.L.ties === 0 && O.H.word === LR.WORDS.H[1] && O.H.ref === rfl.hand.ONE && O.H.below === 12 && near(O.arms.RECOV.mean, 0.7692) && near(O.arms.LONG.mean, 0.8582) && near(V.arms.RECOV.mean, 0.3785) && near(V.arms.LONG.mean, 0.2936) &&
        /G \(RLONG against RECOV, draw for draw\): above 12, below 0, ties 0/.test(lines) && /L \(RLONG against LONG\): RLONG's ranks sum to 222 \(the middle is 150\)/.test(lines) && /THE RECOVERING FLY TRAINED FOUR TIMES LONGER DOES BETTER THAN THE RECOVERY ROUND'S FLY/.test(lines) && /USES 9 of 12, b at 0 in 3/.test(lines));
    const worse = LR.reading(file((t, s) => (t === "REV" ? [recov(t, s).score - 0.01, 0.2] : sc(t, s))), F), above = LR.reading(file((t, s) => (t === "ONE" ? [0.92 + s / 1e4, 0.92] : sc(t, s))), F), noFl = LR.reading(good.filter((r) => r.kind !== "floors"), F);
    ok("RLONG 0.01 under each RECOV fly is G WORSE (12 below); ONE above the hand rule and every LONG fly (the most 0.9103) is H BETTER and L BETTER (222); with a failed check no reading is weighed and the first line says so",
        worse.tasks.REV.G.word === LR.WORDS.G[1] && worse.tasks.REV.G.below === 12 && above.tasks.ONE.H.word === LR.WORDS.H[0] && above.tasks.ONE.L.word === LR.WORDS.L[0] && above.tasks.ONE.L.sumA === 222 && noFl.tasks.REV.G === null && noFl.tasks.ONE.H === null && /^A CHECK FAILED/.test(LR.readingLines(noFl)[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, LR.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "1"], ["job", "REV", "RLONG", "1"], ["job", "TWO", "1"], ["job", "REV", "0"], ["job", "ONE", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job TASK S for ONE or REV and draws 1 to 12 -- and nothing else", J(LR.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(LR.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(LR.parseArgs(["read"])) === J({ cmd: "read" }) && J(LR.parseArgs(["job", "REV", "12"])) === J({ cmd: "job", task: "REV", s: 12 }) && no.every((a) => LR.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyMushroomLongRecover.mjs");
    ok("!! the command is this round's -- its library and results file, the three committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains with the registered defaults, trains only what the file does not hold, and trains REV's draw 1 a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyMushroomLongRecover\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.trainOne\(args\.task, args\.s\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /done = new Set\(have\.filter\(\(r\) => r\.kind === "draw"\)\.map\(\(r\) => r\.task \+ "\/" \+ r\.s\)\)/.test(csrc) && /if \(!done\.has\(task \+ "\/" \+ s\)\) todo\.push\(\[task, s\]\)/.test(csrc) &&
        /await jobOnce\("REV", PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", task: "REV", arm: PF\.LEAD, s: PF\.SEEDS\[0\], weightsHash: r\.weightsHash/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyMushroomLongRecover\.mjs run \[--jobs N\] \| read \| job TASK S/.test(csrc));
    const me = src("tools/ship/flyMushroomLongRecover-selfcheck.mjs"), calls = [...me.matchAll(/LR\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its trainings through the round's code are tiny and on draw 901 (two refused); it starts no process; the file's size and time are what they were",
        J(calls) === J(['"TWO", 1', '"REV", 0', '"REV", 901, TINY, TINY_AUDIT', '"REV", 901, TINY4, TINY_AUDIT']) && !LR.SEEDS.includes(901) && !TINY_AUDIT.some((x) => LR.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before,
        `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyMushroomLongRecover-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
