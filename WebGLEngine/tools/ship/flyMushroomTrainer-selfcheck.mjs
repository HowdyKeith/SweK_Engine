// WebGLEngine/tools/ship/flyMushroomTrainer-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyMushroomTrainer-selfcheck.mjs      (about fifteen seconds; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE MUSHROOM TRAINER ROUND (registered in brain/FLY_MUSHROOM_TRAINER_WIP.md before tools/ship/flyMushroomTrainer.mjs and tools/ship/takeFlyMushroomTrainer.mjs existed): is the
// mushroom fly's shortfall below the hand rule the trainer's choice of point, or its walk?
//   1  THE ROUND'S NUMBERS      the mushroom round's recipe, draws, tasks, audit, hand rule and fly; LONG's 240 iterations; BAT64's lives, none another's; the mushroom file by its hash; the
//                               floors; the registration says the same
//   2  ONE TRAINING EACH        a LONG record's weights are the trainer's from a call made here by hand, and its walk starts as the shorter one; a BAT64 record's are the walk's point it names
//   3  THE RECORDS              48 draws; the mushroom round's file; G, K, HG, HK on each task
//   4  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 19, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's 4; every one red by name (the number is the rows red):
//   THE ROUND: F1 LONG is 60 iterations 3 | F2 LONG keeps its point on 64 lives 2 | F3 BAT64 on 16 lives 2 | F4 BAT64's battery on the audit lives 3 | F5 the draws' batteries share lives 3 |
//   F6 keptAt is the first iteration 1 | F7 G against the hand rule 1 | F8 BETTER and WORSE swapped 1 | F9 ties dropped from the paired test 1 | F10 the hand rule not checked against the
//   mushroom round's 1 | F11 a LONG walk's start not checked 1 | F12 KEEP16 is the mushroom round's PFAM 2 | F13 the recheck is of BAT64 3 | F14 the round writes the mushroom round's file 1 |
//   F15 the fly is the shuffle's 2
//   THE COMMAND: C1 the second training is REV's 1 | C2 exits 0 on a word it does not know 1 | C3 reads the mushroom round's library 1 | C4 reads without the mushroom round's file 1.
//   THE NOTE: N1 its LONG is 200 iterations 1 | N2 its battery from 80000000 1 | N3 its K against the hand rule 1 | N4 its draws are 13 to 24 1
//   F6 WENT 0 RED FIRST, A FINDING: the tiny BAT64 training kept iteration 0, so a library that always says it kept the first was right by luck. The row now scores the walk's points on
//   the 64 lives by hand and takes the first best (iteration 3 of 4 on draw 901); F6 was run again (1 red, as above). N2 was first skipped (its text is in the note twice) and run again on
//   the arms table's.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as T from "./flyMushroomTrainer.mjs";
import * as M from "./flyMushroom.mjs";
import * as PF from "./paintingFly.mjs";
import * as OE from "../../brain/rl/odorEnv.mjs";
import * as MF from "../../brain/rl/mushroomFly.mjs";
import { trainDockES, evaluate } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), H = (p) => PF.hashWeights(p), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TINY_AUDIT = [880001, 880002];
const mushroom = T.fileOf(fs.readFileSync(path.join(ENG, T.MUSHROOM)));

console.log("flyMushroomTrainer-selfcheck -- the mushroom trainer round (a walk four times longer, and the best on 64 lives of the draw's own, against the mushroom round's flies): the numbers, the trainings, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! THE MUSHROOM ROUND'S RECIPE, DRAWS, TASKS, AUDIT, ALPHA AND HAND RULE; the arms LONG and BAT64, the lead LONG; LONG's recipe is the mushroom round's with 240 iterations and nothing else; this round's own results file; the mushroom round's file by the sha256 it was committed with -- and it has that hash today",
        T.RECIPE === M.RECIPE && T.SEEDS === M.SEEDS && T.TASKS === M.TASKS && T.AUDIT === M.AUDIT && T.ALPHA === 0.01 && T.HAND === M.HAND && J(T.ARMS) === J(["LONG", "BAT64"]) && T.LEAD === "LONG" && T.LONG_ITERS === 240 &&
        J(T.RECIPES.LONG) === J({ ...M.RECIPE, iters: 240 }) && T.RECIPES.BAT64 === M.RECIPE && T.RESULTS === "brain/flyMushroomTrainerRound.jsonl" && T.MUSHROOM === "brain/flyMushroomRound.jsonl" &&
        T.MUSHROOM_SHA256 === "b4d8db8d8139598765767921a7e43d97ec3e183889a929f4df60653f75e9cc31" && mushroom.sha256 === T.MUSHROOM_SHA256 && createHash("sha256").update(fs.readFileSync(path.join(ENG, T.MUSHROOM))).digest("hex") === T.MUSHROOM_SHA256 && mushroom.lines.length === 98);
    ok("!! EACH ARM'S LIVES AND OPTIONS: BAT64 keeps its point on 64 lives from 70000000 + 10007 x draw (batteryEps 64, batteryBase), LONG on the recipe's 16 at the trainer's fixed 5000 (no option); an arm or draw that is not one is refused by name",
        T.BAT_EPS === 64 && T.BAT_BASE === 70000000 && T.BAT_STEP === 10007 && J(T.batteryOf("BAT64", 3)) === J({ eps: 64, base: 70030021 }) && J(T.batteryOf("LONG", 3)) === J({ eps: 16, base: null }) &&
        J(T.optionsOf("BAT64", 12)) === J({ batteryEps: 64, batteryBase: 70120084 }) && J(T.optionsOf("LONG", 1)) === J({}) && throws(() => T.batteryOf("KEEP16", 1), /no arm KEEP16/) && throws(() => T.optionsOf("LONG", 0), /whole number from 1/) && throws(() => T.trainOne("LONG", "TWO", 1), /ONE or REV/));
    const lives = (base, n, step = 17) => Array.from({ length: n }, (_, k) => base + step * k), train = []; for (let it = 0; it < 240; it++) train.push(...lives(5000 + 104729 * (it + 1), 4));
    const bats = T.SEEDS.map((s) => lives(T.batteryOf("BAT64", s).base, 64)), sets = { train, fixed: lives(5000, 16), audit: [...T.AUDIT], scoping: lives(3000001, 200, 7919), scoping2: lives(6000001, 200, 7919) }, all = new Set();
    let clash = 0; for (const v of [...Object.values(sets), ...bats]) for (const x of v) { if (all.has(x)) clash++; all.add(x); }
    ok("!! NO LIFE IS TWO THINGS: the 12 draws' 64-life batteries (768 lives), the 960 training lives of a 240-iteration walk, the fixed 16, the 200 audit lives and the 400 scoping lives are 2,344 different seeds", clash === 0 && all.size === 768 + 960 + 16 + 200 + 400);
    const few = T.AUDIT.slice(0, 2), fl = T.floors(few);
    ok("!! THE FLOORS: the start and the hand rule on each task are the mushroom round's flies (this round's file must carry the mushroom round's numbers to the bit)", fl.kind === "floors" && J(fl.start) === J(M.floors(few).start) && J(fl.hand) === J(M.floors(few).hand) && J(Object.keys(fl)) === J(["kind", "start", "hand"]));
    const note = src("brain/FLY_MUSHROOM_TRAINER_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: draws 1 to 12; LONG's 240 iterations; BAT64's 64 lives from 70000000 + 10007 s; G, K, HG and HK as sign tests; LONG draw 1 of ONE trained a second time; the mushroom file's hash",
        /\*\*draws 1 to 12\*\*/.test(note) && /\| \*\*LONG\*\* \| \*\*240 iterations\*\*, the best on the fixed 16 \|/.test(note) && /\*\*the best on 64 lives of the draw's own\*\* \(seeds 70000000 \+ 10007 s \+ 17 k\)/.test(note) && /\*\*G: LONG against KEEP16\*\*, draw for draw/.test(note) && /\*\*K: BAT64 against KEEP16\*\*, draw for draw/.test(note) &&
        /\*\*HG: LONG against the hand rule\*\*/.test(note) && /\*\*HK: BAT64 against the hand rule\.\*\*/.test(note) && /\*\*LONG draw 1 of ONE is trained a second time\.\*\*/.test(note) && /sha256 b4d8db8d81395987/.test(note) && /alpha 0\.01, exact two-sided sign tests, ties against the claim/.test(note));
});

console.log("\n2. ONE TRAINING EACH (tiny, on draw 901)");
section(() => {
    const byHand = (o) => trainDockES({ envFactory: () => new OE.OdorEnv({ task: "REV", nk: 4064 }), obsDim: 1, actDim: 1, maxSteps: 30, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 901, freshEpisodes: true, batteryEps: 2, policyFactory: () => new MF.MushroomFly({ nk: 4064, nm: 91, edges: M.CIRCUIT.edges, teach: M.teachFor("PLASTIC", 1) }), ...o });
    const long = T.trainOne("LONG", "REV", 901, { ...TINY, iters: 4 }, TINY_AUDIT), short = byHand({ iters: 2 });
    ok("!! A LONG RECORD'S WEIGHTS ARE THE TRAINER'S FROM A CALL MADE HERE BY HAND (the mushroom round's PLASTIC fly, the REV life, fresh lives, the fixed battery), to the hash; ITS WALK STARTS AS THE SHORTER ONE (its history at iteration 0 is a 2-iteration training's)",
        H(byHand({ iters: 4 }).params) === long.weightsHash && J(long.history[0]) === J({ it: 0, ret: short.history[0].avgReturn }) && long.history.length === 4 && J(long.battery) === J({ eps: 16, base: null }) && long.arm === "LONG" && long.task === "REV" && long.weightCount === 93);
    const bat = T.trainOne("BAT64", "REV", 901, { ...TINY, iters: 4 }, TINY_AUDIT), walk = [1, 2, 3, 4].map((k) => byHand({ iters: k, keep: "last" })), base = T.BAT_BASE + T.BAT_STEP * 901;
    const on64 = walk.map((w) => { const e = evaluate(w.params, { envFactory: () => new OE.OdorEnv({ task: "REV", nk: 4064 }), obsDim: 1, actDim: 1, maxSteps: 30, policyFactory: () => M.policyOf("PLASTIC", 1), episodes: 64, seedBase: base }); return e.dockRate * 1000 - e.avgDist - (e.avgCrashes || 0) * 200; });
    let first = 0; for (let i = 1; i < on64.length; i++) if (on64[i] > on64[first]) first = i;
    ok("!! A BAT64 RECORD'S WEIGHTS ARE THE WALK'S POINT AT THE ITERATION IT SAYS IT KEPT, AND THAT IS THE FIRST BEST OF THE WALK'S POINTS ON ITS 64 LIVES, SCORED HERE BY HAND (iteration 3 of 4 on draw 901); the trainer by hand with those lives gives the same weights",
        first === 3 && bat.keptAt === first && H(walk[first].params) === bat.weightsHash && H(byHand({ iters: 4, batteryEps: 64, batteryBase: base }).params) === bat.weightsHash && J(bat.battery) === J({ eps: 64, base: 79016307 }), `kept ${bat.keptAt}, on 64 lives ${on64.map((x) => x.toFixed(4)).join(" ")}`);
    ok("each tiny training's weights give its score again", M.auditScore(M.policyOf("PLASTIC", 901).setParams(PF.unpackWeights(bat.weights)), "REV", TINY_AUDIT) === bat.score && M.auditScore(M.policyOf("PLASTIC", 901).setParams(PF.unpackWeights(long.weights)), "REV", TINY_AUDIT) === long.score);
});

console.log("\n3. THE RECORDS (made here; KEEP16 is the mushroom round's PLASTIC as committed)");
section(() => {
    const keep = (t, s) => mushroom.lines.find((r) => r.kind === "draw" && r.task === t && r.arm === "PLASTIC" && r.s === s), mfl = mushroom.lines.find((r) => r.kind === "floors"), wts = (s) => Float32Array.from([...Array(91).fill(0.01), 0.1, 1 + s / 100]);
    const hist = (arm, t, s) => { const n = T.RECIPES[arm].iters, it = [0, 10, 20, n - 1]; return it.map((i, k) => ({ it: i, ret: k === 0 && arm === "LONG" ? keep(t, s).history[0].ret : 0.3 + k / 100 })); };
    const rec = (t, arm, s, score) => ({ kind: "draw", task: t, arm, s, recipe: { ...T.RECIPES[arm] }, battery: T.batteryOf(arm, s), weightCount: 93, weights: PF.packWeights(wts(s)), weightsHash: H(wts(s)), rate: 0.6, keptAt: arm === "LONG" ? 200 : 30, score, history: hist(arm, t, s) });
    const file = (f, first = 1) => { const out = []; for (const t of T.TASKS) for (const arm of T.ARMS) for (const s of T.SEEDS) out.push(rec(t, arm, s, f(t, arm, s))); out.push({ kind: "recheck", task: "ONE", arm: "LONG", s: first, weightsHash: out.find((r) => r.task === "ONE" && r.arm === "LONG" && r.s === first).weightsHash }, { kind: "floors", start: mfl.start, hand: mfl.hand }); return out; };
    // ONE: LONG above every KEEP16 fly and a hair either side of the hand rule; BAT64 a hair under KEEP16 on 9 draws and over on 3, all under the hand rule
    const hair = (s) => (s % 2 ? 1e-4 : -1e-4), sc = (t, arm, s) => (arm === "LONG" ? mfl.hand[t] + hair(s) : keep(t, s).score + (s <= 9 ? -1e-6 : 1e-6));
    const good = file(sc), R = T.reading(good, mushroom), lines = T.readingLines(R).join("\n"), O = R.tasks.ONE;
    ok("!! a file of 48 draws with ONE's LONG draw 1 a second time and the mushroom round's floors passes every check; a draw missing, BAT64 kept on the fixed 16, LONG with 60 iterations, a LONG walk that does not start as its draw's committed one, a hand rule one part in 10^15 off, and a mushroom file that is not the committed one each fail by name",
        T.checkRecords(good, mushroom).length === 0 && good.length === 50 && /^the checks hold: the mushroom round's file/.test(lines) && T.checkRecords(good.filter((r) => !(r.task === "REV" && r.arm === "BAT64" && r.s === 12)), mushroom).some((x) => /REV BAT64 draw 12 is there 0 times/.test(x)) &&
        T.checkRecords(good.map((r) => (r.arm === "BAT64" && r.s === 5 && r.task === "ONE" ? { ...r, battery: { eps: 16, base: null } } : r)), mushroom).some((x) => /ONE BAT64 draw 5 kept its point on other lives than its arm's/.test(x)) &&
        T.checkRecords(good.map((r) => (r.arm === "LONG" && r.s === 4 && r.task === "REV" ? { ...r, recipe: { ...T.RECIPE } } : r)), mushroom).some((x) => /REV LONG draw 4 was trained with another recipe/.test(x)) &&
        T.checkRecords(good.map((r) => (r.arm === "LONG" && r.s === 6 && r.task === "ONE" ? { ...r, history: [{ it: 0, ret: r.history[0].ret + 1e-9 }, ...r.history.slice(1)] } : r)), mushroom).some((x) => /ONE LONG draw 6's walk does not start as its draw's committed one/.test(x)) &&
        J(T.checkRecords(good.map((r) => (r.kind === "floors" ? { ...r, hand: { ...r.hand, ONE: r.hand.ONE * (1 + 1e-15) } } : r)), mushroom)) === J(["the start and the hand rule are not the mushroom round's to the bit: the fly, task or audit is not the same"]) &&
        T.checkRecords(good, { ...mushroom, sha256: "0".repeat(64) }).some((x) => /the mushroom round's file is not the one committed/.test(x)) && J(T.checkRecords(file(sc, 2), mushroom)) === J(["ONE LONG draw 1 trained a second time is not there once with the same weights"]));
    ok("!! G AND K ARE LONG AND BAT64 AGAINST KEEP16, DRAW FOR DRAW; HG AND HK AGAINST THE TASK'S HAND RULE: LONG a hair either side of the hand rule (every KEEP16 fly below it) -> G BETTER (12 above, p 2^-11), HG CANNOT (6 and 6); BAT64 a hair under KEEP16 on 9 draws -> K CANNOT (3 above), HK WORSE (12 below)",
        O.G.word === T.WORDS.G[0] && O.G.above === 12 && O.G.p === 2 ** -11 && O.G.a === "LONG" && O.HG.word === T.WORDS.HG[2] && O.HG.above === 6 && O.HG.ref === mfl.hand.ONE && O.K.word === T.WORDS.K[2] && O.K.above === 3 && O.K.below === 9 && O.HK.word === T.WORDS.HK[1] && O.HK.below === 12 &&
        near(O.arms.KEEP16.mean, 0.7757) && near(R.tasks.REV.arms.KEEP16.mean, 0.2524) && /G \(LONG against KEEP16, draw for draw\): above 12, below 0, ties 0 of 12/.test(lines) && /A WALK FOUR TIMES LONGER DOES BETTER THAN THE MUSHROOM ROUND'S WALK/.test(lines));
    const tied = T.reading(file((t, arm, s) => (arm === "BAT64" ? keep(t, s).score + (s <= 2 ? 0 : 1e-6) : sc(t, arm, s))), mushroom), noFl = T.reading(good.filter((r) => r.kind !== "floors"), mushroom);
    ok("ties count against the claim (BAT64 above KEEP16 on 10 draws and equal on 2 is CANNOT); with a failed check no reading is weighed and the first line says so",
        tied.tasks.ONE.K.ties === 2 && tied.tasks.ONE.K.above === 10 && tied.tasks.ONE.K.word === T.WORDS.K[2] && noFl.tasks.ONE.G === null && noFl.tasks.REV.HK === null && /^A CHECK FAILED/.test(T.readingLines(noFl)[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, T.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "LONG", "1"], ["job", "ONE", "PLASTIC", "1"], ["job", "TWO", "LONG", "1"], ["job", "ONE", "LONG", "0"], ["job", "REV", "BAT64", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job TASK ARM S for ONE or REV, LONG or BAT64 and draws 1 to 12 -- and nothing else", J(T.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(T.parseArgs(["read"])) === J({ cmd: "read" }) && J(T.parseArgs(["job", "REV", "BAT64", "12"])) === J({ cmd: "job", task: "REV", arm: "BAT64", s: 12 }) && no.every((a) => T.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyMushroomTrainer.mjs");
    ok("!! the command is this round's -- its library and results file, and the mushroom round's file read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, and trains ONE's LONG draw 1 a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyMushroomTrainer\.mjs"/.test(csrc) && /PF\.trainOne\(args\.arm, args\.task, args\.s\)/.test(csrc) && /PF\.reading\(linesOf\(\), PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, PF\.MUSHROOM\)\)\)\)/.test(csrc) &&
        /if \(!done\.has\(task \+ "\/" \+ arm \+ "\/" \+ s\)\) todo\.push\(\[task, arm, s\]\)/.test(csrc) && /await jobOnce\("ONE", PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", task: "ONE", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyMushroomTrainer\.mjs run \[--jobs N\] \| read \| job TASK ARM S/.test(csrc));
    const me = src("tools/ship/flyMushroomTrainer-selfcheck.mjs"), calls = [...me.matchAll(/T\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its two trainings through the round's code are tiny and on draw 901 (and one refused); it starts no process; the file's size and time are what they were",
        calls.length === 3 && /^"LONG", "TWO", 1$/.test(calls[0]) && /^"LONG", "REV", 901, \{ \.\.\.TINY, iters: 4 \}, TINY_AUDIT$/.test(calls[1]) && /^"BAT64", "REV", 901, \{ \.\.\.TINY, iters: 4 \}, TINY_AUDIT$/.test(calls[2]) && !T.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyMushroomTrainer-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
