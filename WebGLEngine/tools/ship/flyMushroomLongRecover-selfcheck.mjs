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
//   5  THE VERDICT              the results file as committed unread at 32c77504, read from the file: the checks, G, L and H on each task, USES and b at 0, the arms, the
//                               description after the reading, the hand rule with other recoveries (measured after the reading), re-audits, the expectations, the note's result
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
// THE VERDICT'S SABOTAGES (2026-11-18, after the reading, the same runner, this gate alone): V1 a record's score (REV draw 3) changed in a digit the double holds 1 (the file's hash alone:
//   a change of 1e-12 in a fly that is no arm's least or most is under the arms row's 5e-5) | V2 G against LONG 6 | V3 the rank sum's BETTER and WORSE swapped 5 | V4 H on REV against the
//   plain hand rule 5 | V5 USES needs 0.3 3 | V6 the note's REV H says BETTER 1 | V7 the note's expectation of REV H is WORSE 55 1 | V8 the note names another commit 1 | V9 the note drops
//   that the best hand rule is above every fly 1 | V10 the floors' recovery hand rule on REV changed in a digit the double holds 3 | V11 the note's best hand rule 0.5207 1 | V12 the
//   note's Spearman 0.69 (over all 12, where two flies tie at b 0 and the rank depends on how the tie is broken; the note gives the 10 that found recovery) 1. None went 0 red.
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

console.log("flyMushroomLongRecover-selfcheck -- the long recovery round (the recovering fly trained 240 iterations, against the recovery round's RECOV and the trainer round's LONG): the numbers, one training, the records, the command, the verdict\n");

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

console.log("\n5. THE VERDICT (the whole results file was committed at 32c77504 before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, LR.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = LR.reading(lines, F), Fl = R.floors, V = R.tasks.REV, O = R.tasks.ONE;
    const of = (t) => lines.filter((r) => r.kind === "draw" && r.task === t).sort((a, b) => a.s - b.s), rec = (t, s) => of(t).find((r) => r.s === s);
    const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = []; o.forEach((p, k) => { r[p[1]] = k + 1; }); return r; };
    const spearman = (x, y) => { const a = rank(x), b = rank(y), m = (x.length + 1) / 2; let s = 0, sa = 0, sb = 0; for (let i = 0; i < x.length; i++) { s += (a[i] - m) * (b[i] - m); sa += (a[i] - m) ** 2; sb += (b[i] - m) ** 2; } return new Set(x).size === x.length && new Set(y).size === y.length ? s / Math.sqrt(sa * sb) : NaN; };
    ok("!! the results file is the one the run wrote: 26 records, sha256 e63f7b724387733b... (one start, 14.9 minutes on two processes)", lines.length === 26 && createHash("sha256").update(bytes).digest("hex") === "e63f7b724387733b6febff438afcf50d74e06693dbcd3dcabb6cef054f0287b1");
    ok("!! THE CHECKS HOLD: both committed files as committed and passing their own checks, 24 draws each once, every walk starting as its draw's RECOV walk, REV's draw 1 the same twice; the floors the recovery round's -- the start -0.0253 and 0.0080, the hand rule 0.8943 and 0.2220, with a recovery of 0.1 0.7627 and 0.5000 (ONE, REV)",
        R.checks.length === 0 && near(Fl.start.ONE, -0.0253) && near(Fl.start.REV, 0.0080) && near(Fl.hand.ONE, 0.8943) && near(Fl.hand.REV, 0.2220) && near(Fl.handB.ONE, 0.7627) && Fl.handB.REV === 0.5 && lines.find((r) => r.kind === "recheck").weightsHash === rec("REV", 1).weightsHash);
    ok("!! *** REV: G -- BETTER THAN THE RECOVERY ROUND'S FLY (12 of 12 above, p 2/4096); L -- BETTER THAN THE MUSHROOM FLY TRAINED AS LONG WITHOUT RECOVERY (ranks 209, p 0.00027); H -- CANNOT BE TOLD APART FROM THE RULE SET BY HAND (5 above 0.5000, 7 below, p 0.77) ***",
        V.G.word === LR.WORDS.G[0] && V.G.above === 12 && V.G.p === 2 / 4096 && V.L.word === LR.WORDS.L[0] && V.L.sumA === 209 && V.L.ties === 0 && near(V.L.p, 2.744e-4, 5e-7) && V.H.word === LR.WORDS.H[2] && V.H.above === 5 && V.H.below === 7 && V.H.ref === 0.5 && near(V.H.p, 0.7744, 5e-5));
    ok("!! *** ONE: G -- BETTER (12 of 12 above); L -- CANNOT BE TOLD APART FROM LONG (ranks 153, p 0.89); H -- WORSE THAN THE RULE SET BY HAND (1 of 12 above 0.8943, p 26/4096) *** -- USES 10 of 12 on REV with b at 0 in 2, 0 of 12 on ONE with b at 0 in all 12",
        O.G.word === LR.WORDS.G[0] && O.G.above === 12 && O.L.word === LR.WORDS.L[2] && O.L.sumA === 153 && near(O.L.p, 0.8874, 5e-5) && O.H.word === LR.WORDS.H[1] && O.H.above === 1 && O.H.below === 11 && O.H.p === 26 / 4096 && O.H.ref === Fl.hand.ONE &&
        V.arms.RLONG.uses === 10 && V.arms.RLONG.bZero === 2 && O.arms.RLONG.uses === 0 && O.arms.RLONG.bZero === 12);
    const A = V.arms, B = O.arms;
    ok("!! the arms (mean, sd, least, most; with b at 0; b; a): REV RLONG 0.4630 0.0798 0.2747 0.5297, 0.2949, 0.1260, 1.5792 (RECOV 0.3785, LONG 0.2936) | ONE RLONG 0.8638 0.0283 0.7863 0.9000, 0.8638, 0, 1.6646 (RECOV 0.7692, LONG 0.8582)",
        near(A.RLONG.mean, 0.4630) && near(A.RLONG.sd, 0.0798) && near(A.RLONG.min, 0.2747) && near(A.RLONG.max, 0.5297) && near(A.RLONG.ratesOff, 0.2949) && near(A.RLONG.recovery, 0.1260) && near(A.RLONG.rate, 1.5792) && near(A.RECOV.mean, 0.3785) && near(A.LONG.mean, 0.2936) &&
        near(B.RLONG.mean, 0.8638) && near(B.RLONG.sd, 0.0283) && near(B.RLONG.min, 0.7863) && near(B.RLONG.max, 0.9000) && near(B.RLONG.ratesOff, 0.8638) && B.RLONG.recovery === 0 && near(B.RLONG.rate, 1.6646) && near(B.RECOV.mean, 0.7692) && near(B.LONG.mean, 0.8582));
    const rv = of("REV"), nz = rv.filter((r) => r.recovery > 0), z = rv.filter((r) => r.recovery === 0), rcb = F.recover.lines.filter((r) => r.kind === "draw" && r.task === "REV" && r.recovery > 0).map((r) => r.recovery), med = (v) => { const w = [...v].sort((a, b) => a - b); return (w[5] + w[6]) / 2; };
    ok("!! DESCRIBED AFTER THE READING, NOT REGISTERED: on REV the 10 that found recovery score 0.4460 to 0.5297, 5 above 0.5000; draws 1 and 6 never found it (0.3057, 0.2747); b where not 0 from 0.0788 to 0.1945 (mean 0.1513) against RECOV's 0.062 to 0.108; among the 10 Spearman 0.47; kept at iteration 200 or later on REV 8 of 12 (median 220.5), on ONE 4 (median 183)",
        nz.length === 10 && near(Math.min(...nz.map((r) => r.score)), 0.4460) && near(Math.max(...nz.map((r) => r.score)), 0.5297) && nz.filter((r) => r.score > 0.5).length === 5 && J(z.map((r) => r.s)) === J([1, 6]) && near(z[0].score, 0.3057) && near(z[1].score, 0.2747) &&
        near(Math.min(...nz.map((r) => r.recovery)), 0.0788) && near(Math.max(...nz.map((r) => r.recovery)), 0.1945) && near(nz.reduce((n, r) => n + r.recovery, 0) / 10, 0.1513) && Math.min(...rcb).toFixed(3) === "0.062" && Math.max(...rcb).toFixed(3) === "0.108" &&
        spearman(nz.map((r) => r.recovery), nz.map((r) => r.score)).toFixed(2) === "0.47" && rv.filter((r) => r.keptAt >= 200).length === 8 && med(rv.map((r) => r.keptAt)) === 220.5 && of("ONE").filter((r) => r.keptAt >= 200).length === 4 && med(of("ONE").map((r) => r.keptAt)) === 183);
    const handAt = (b, t) => M.auditScore(RC.policyOf(1).setParams([...M.HAND, b / RC.B_SCALE]), t), hs = [0.05, 0.1, 0.15, 0.2, 0.3].map((b) => handAt(b, "REV"));
    ok("!! MEASURED AFTER THE READING, NOT REGISTERED: the hand rule on the audit with a recovery of 0.05, 0.1, 0.15, 0.2, 0.3 scores 0.4320, 0.5000 (the committed floor, to the bit), 0.5223, 0.5307, 0.5110 on REV, and 0.8200 on ONE at 0.05 -- the best, 0.5307, above every trained fly by 0.0010, and 0 of 12 above it",
        near(hs[0], 0.4320) && hs[1] === Fl.handB.REV && near(hs[2], 0.5223) && near(hs[3], 0.5307) && near(hs[4], 0.5110) && near(handAt(0.05, "ONE"), 0.8200) && Math.max(...hs) === hs[3] && near(hs[3] - A.RLONG.max, 0.0010) && rv.every((r) => r.score < hs[3]), hs.map((x) => x.toFixed(4)).join(" "));
    const d12 = rec("REV", 12), d6 = rec("REV", 6), w12 = PF.unpackWeights(d12.weights);
    ok("!! RE-AUDITED AFTER THE READING: REV's draw 12 (the arm's most) gives its score and its score with b at 0 again to the bit, and REV's draw 6 (the least) its score",
        d12.score === A.RLONG.max && M.auditScore(RC.policyOf(12).setParams(w12), "REV") === d12.score && M.auditScore(RC.recoveryOff(12, w12), "REV") === d12.ratesOff && d6.score === A.RLONG.min && M.auditScore(RC.policyOf(6).setParams(PF.unpackWeights(d6.weights)), "REV") === d6.score);
    const note = src("brain/FLY_MUSHROOM_LONG_RECOVER_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 10. The result"));
    ok("the expectations, written before the code, against what came -- every one: REV G BETTER (55), L BETTER (75), H CANNOT (55), USES at least 8 (65) with 10; ONE G BETTER (75), L CANNOT (80), H WORSE (80), b at 0 in at least 10 (85) with 12",
        /REV: G \*\*BETTER about 55\*\*, CANNOT 45\. L \*\*BETTER about 75\*\*, CANNOT 25\. H CANNOT about 55, WORSE 40, BETTER 5\. USES at least 8 of 12, about 65\. ONE: G \*\*BETTER about 75\*\*, CANNOT 25\. L \*\*CANNOT about 80\*\*\. H \*\*WORSE about 80\*\*, CANNOT 20\. b at 0 in at least 10 of 12, about 85\./.test(flat) &&
        V.G.word === LR.WORDS.G[0] && V.L.word === LR.WORDS.L[0] && V.H.word === LR.WORDS.H[2] && V.arms.RLONG.uses >= 8 && O.G.word === LR.WORDS.G[0] && O.L.word === LR.WORDS.L[2] && O.H.word === LR.WORDS.H[1] && O.arms.RLONG.bZero >= 10);
    ok("the registration's RESULT SECTION (section 10) carries the six readings' words, USES, the commit the file was read at, that every expectation came, what section 5 said such a reading would say, the description and the measurement after the reading said as such with the gate's numbers, that the best hand rule is above every fly, and what it does not mean",
        /## 10\. The result/.test(note) && ["REV", "ONE"].every((t) => ["G", "L", "H"].every((k) => res.includes(`**${t} ${k}: ${R.tasks[t][k].word}**`))) && /\*\*USES: 10 of 12 on REV, b at 0 in 2; 0 of 12 on ONE, b at 0 in all 12\.\*\*/.test(res) && /32c77504/.test(res) &&
        /\*\*Every expectation came\*\*/.test(res) && /\*\*with a long enough walk the trainer finds about the recovery the hand rule has, and the recovery round's shortfall was the walk's length\*\*/.test(res) &&
        /\*\*Described after the reading, not registered \(the gate recomputes it from the records\):\*\*/.test(res) && /\*\*Measured after the reading, not registered \(the gate recomputes it\):\*\*/.test(res) && /\*\*0\.5307 \(0\.2\)\*\*/.test(res) &&
        /\*\*So H is CANNOT against the committed rule, and the best of these hand rules is above every trained fly\*\*, by 0\.0010 over the best \(0\.5297\); against it, 0 of 12 are above/.test(res) && /\| REV \| 0\.4630 \(0\.2747, 0\.5297\) \| 0\.2949 \| 0\.1260 \| 0\.3785 \| 0\.2936 \|/.test(res) &&
        /Spearman 0\.47/.test(res) && /8 of 12 kept a point at iteration 200 or later \(the median 220\.5\)/.test(res) && /\*\*What it does not mean\.\*\*/.test(res));
});

console.log(`\nflyMushroomLongRecover-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
