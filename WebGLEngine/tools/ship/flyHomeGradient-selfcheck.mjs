// WebGLEngine/tools/ship/flyHomeGradient-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyHomeGradient-selfcheck.mjs      (about two minutes; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations, its audits and checks of the machine on 2 lives, and it
// starts no process)
//
// THE GATE OF THE GRADIENT ROUND (registered in brain/FLY_HOME_GRADIENT_WIP.md before tools/ship/flyHomeGradient.mjs and tools/ship/takeFlyHomeGradient.mjs existed): does the homing fly's
// walk do better when each fly tried is scored on 16 lives instead of 4?
//   1  THE ROUND'S NUMBERS      HOMEP's recipe with 16 lives a fly tried and nothing else changed; draws, audit, arm; the training lives no life of an audit, a battery, a chooser or the
//                               scoping; round 4's file by its hash; the registration says the same
//   2  ONE TRAINING             a record is the chooser round's walk with the recipe given, the trainer's by hand with the lives given; its scores again; the two checks of the machine
//   3  THE RECORDS              12 draws, a second training, the two checks of the machine; W and G16
//   4  THE COMMAND              it is this round's; it checks the machine before any training; no training of the round's, no process
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the library's and the note's, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's; every one red by name (the number is the rows red):
//   THE ROUND: G1 8 lives a fly 1 | G2 the recipe's iterations 59 3 | G3 the walk on HOMEP's 4 lives whatever the recipe 2 | G4 the walk's last point kept 1 | G5 the home score on the
//   course lives 1 | G6 the machine checked on HOMEP draw 2 5 | G7 the refly held within 1e-9 2 | G8 three of the four floors 2 | G9 the refly not checked in the records 2 | G10 the floors
//   not checked in the records 1 | G11 W against COURSE64 1 | G12 G16 against HOMEP 1 | G13 the sign test's BETTER and WORSE swapped 1 | G14 the rank sum's BETTER and WORSE swapped 1 |
//   G15 round 4's file's own checks skipped 1 | G16 the kept point not checked against the trainer's scores 1 | G17 the second training's walk not compared 1 | G18 the round writes round
//   4's file 1 | G19 the battery not checked 1
//   THE COMMAND: K1 exits 0 on a word it does not know 1 | K2 the trainings start though the machine fails 1 | K3 the floors appended though they do not hold 1 | K4 the job trains with a
//   recipe of its own 1 | K5 the file's draws not counted as done 1 | K6 the second training never in the pool 1 | K7 the second training recorded as a draw 1 | K8 reads without round 4's file 1
//   THE NOTE: M1 its 16 lives are 8 1 | M2 its W a rank sum 1 | M3 it drops the checks of the machine 1 | M4 it says it was written after the chooser round was read 1
//   FOUND BEFORE THE SABOTAGES: the first run of this gate found that a walk of 2 flies tried on 1 life a fly was the walk on 2 (one antithetic pair: the trainer's advantages are +1 and -1
//   whatever the scores), so section 2's walks try 4. The command row as first tightened (the machine's records appended only when they hold, the trainings only after) quoted the
//   command's file append, and this gate's last row, which reads its own text for any file write, went red on the runner's baseline; the runner was stopped (it restored the library it
//   held, checked by hand), the quoted text is put together from two pieces, and the 31 were run again from the start.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Y from "./flyHomeGradient.mjs";
import * as C from "./flyHomeChooser.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as TR from "./flyCompassTrainer.mjs";
import * as PF from "./paintingFly.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import { HomeTrainEnv } from "../../brain/rl/homeTrainEnv.mjs";
import { HomingTrainFly } from "../../brain/rl/homingTrainFly.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TWO = [880051, 880052], COURSE = [880053];
const TINY2 = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, fresh: true, battery: 16 }), TINY1 = Object.freeze({ ...TINY2, trainEps: 1 });
const F = Object.fromEntries(Object.entries(Y.FILES).map(([k, f]) => [k, Y.fileOf(fs.readFileSync(path.join(ENG, f)))]));
const homep = (s) => F.trained.lines.find((r) => r.kind === "draw" && r.arm === "HOMEP" && r.s === s), course64 = (s) => F.trained.lines.find((r) => r.kind === "fly" && r.arm === "COURSE64" && r.s === s);
const homingFloors = F.homing.lines.find((r) => r.kind === "floors");

console.log("flyHomeGradient-selfcheck -- the gradient round (HOMEP's walk with each fly tried scored on 16 lives instead of 4): the numbers, one training and the checks of the machine, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! HOMEP'S RECIPE WITH 16 LIVES A FLY TRIED AND NOTHING ELSE CHANGED; round 4's draws 1 to 12 and audit; the arm HOME16; alpha 0.01; 60 points a walk; the machine checked on HOMEP draw 1; this round's own results file",
        J(Y.RECIPE) === J({ ...T.RECIPE, trainEps: 16 }) && Object.keys(T.RECIPE).every((k) => k === "trainEps" || Y.RECIPE[k] === T.RECIPE[k]) && T.RECIPE.trainEps === 4 && Y.LIVES === 16 && Y.SEEDS === T.SEEDS && Y.AUDIT === T.AUDIT && Y.ALPHA === 0.01 && Y.ITERS === 60 &&
        J(Y.ARMS) === J(["HOME16"]) && Y.LEAD === "HOME16" && Y.REFLY_S === 1 && Y.RESULTS === "brain/flyHomeGradientRound.jsonl" && ![T.RESULTS, C.RESULTS, H.RESULTS, TR.RESULTS].includes(Y.RESULTS) && throws(() => Y.trainOne(0), /whole number from 1/));
    const lives = new Map(), add = (x) => lives.set(x, (lives.get(x) || 0) + 1), train = new Set();
    for (let it = 0; it < 60; it++) for (let k = 0; k < 16; k++) train.add(5000 + 104729 * (it + 1) + 17 * k);
    for (const x of [...T.AUDIT, ...V.AUDIT, ...Array.from({ length: 100 }, (_, k) => 30000001 + 7919 * k)]) add(x);
    for (const s of T.SEEDS) for (let k = 0; k < 256; k++) { if (k < 64) { add(T.batteryOf(s).base + 17 * k); add(TR.batteryOf("BAT64", s).base + 17 * k); } add(C.chooserOf("HOME256", s).base + 17 * k); }
    ok("!! THE TRAINING LIVES: each iteration's 16 (seeds 5000 + 104729 (it + 1) + 17 k), the first 4 HOMEP's; none a life of round 4's audits, of a draw's homing or course battery, of the chooser round's 256, or of the scoping",
        train.size === 960 && [...train].every((x) => !lives.has(x)) && [0, 1, 2, 3].every((k) => train.has(5000 + 104729 + 17 * k)) && !train.has(5000 + 104729 + 17 * 16));
    ok("!! ROUND 4'S FILE BY ITS HASH, AND THE FOUR IT CHECKS AGAINST: the tree has them today, and round 4's passes its own checks; its HOMEP draw 1 is there to fly again",
        J(Y.FILES) === J(C.FILES) && Y.TRAINED === T.RESULTS && Y.TRAINED_SHA256 === "c931f32e5705cdbadeb3ca729958a67a0eb7375593cf2feb02b8c4ac5b5522c6" && Y.TRAINED_SHA256 === C.TRAINED_SHA256 && F.trained.sha256 === Y.TRAINED_SHA256 && T.checkRecords(F.trained.lines, F).length === 0 && !!homep(1) && !!homingFloors);
    const note = src("brain/FLY_HOME_GRADIENT_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: 16 lives instead of 4 and HOMEP's battery; the walk's directions HOMEP's; draws 1 to 12; W draw for draw and G16 a rank sum; the machine checked to the bit before any training; written before the chooser round is read; HOME16 draw 1 again",
        /\*\*Each fly tried is scored on 16 lives instead of 4\*\*/.test(note) && /\*\*64 lives at 80000000 \+ 10007 s \+ 17 k\*\*/.test(note) && /\*\*each draw's walk tries the same directions as HOMEP's\*\*/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) &&
        /\*\*W: HOME16 against HOMEP, draw for draw\*\* \(sign test/.test(note) && /\*\*G16: HOME16 against COURSE64\*\* \(rank sum\)/.test(note) && /\*\*that the machine that ran the round flies round 4's HOMEP draw 1 home to its committed score to the bit, and the homing round's floors to its committed floors to the bit\*\*/.test(note) &&
        /\*\*Said first: this registration is written before the chooser round is read\*\*/.test(note) && /\*\*HOME16 draw 1 is trained a second time\.\*\*/.test(note) && /sha256 c931f32e5705cdba/.test(note));
});

// 4 flies tried, not 2: with one antithetic pair the trainer's advantages are +1 and -1 whatever the scores, and a walk on 1 life a fly was the walk on 2 (found when this gate was first run)
console.log("\n2. ONE TRAINING AND THE CHECKS OF THE MACHINE (walks of 2 iterations, 4 flies tried, on draw 5; audits and checks on 2 lives)");
section(() => {
    const r = Y.trainOne(5, TINY2, TWO, COURSE), points = [], b = T.batteryOf(5);
    const res = trainDockES({ envFactory: () => new HomeTrainEnv(), obsDim: CE.NR + 2, actDim: 1, maxSteps: 1500, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 5, freshEpisodes: true,
        policyFactory: () => new HomingTrainFly(T.flyOf("HOMEP", 5)), batteryEps: b.eps, batteryBase: b.base, onPoint: (p) => points.push(Array.from(p)) });
    ok("!! A RECORD IS THE TRAINER'S WALK BY HAND WITH THE LIVES GIVEN (2 a fly tried here), HOMEP'S FLY, TASK AND BATTERY: its points and its kept point to the bit; it names its recipe and battery and holds the trainer's score of each point, the kept one their first best",
        r.kind === "draw" && r.arm === "HOME16" && r.s === 5 && J(r.recipe) === J(TINY2) && J(r.battery) === J(b) && r.n === 2 && r.pointsHash === PF.hashWeights(Float32Array.from(points.flat())) && r.weightsHash === PF.hashWeights(res.params) &&
        PF.hashWeights(C.pointsOf(r)[r.keptAt]) === r.weightsHash && r.trainerScores.length === 2 && C.firstBest(r.trainerScores) === r.keptAt && r.weightCount === 3, `kept ${r.keptAt}`);
    const r1 = Y.trainOne(5, TINY1, TWO, COURSE);
    ok("!! THE LIVES A FLY IS TRIED ON REACH THE TRAINER: the same walk with 1 life a fly is another walk", r1.pointsHash !== r.pointsHash && J(r1.recipe) === J(TINY1));
    const w = PF.unpackWeights(r.weights), fly = () => T.flyOf("HOMEP", 5, w);
    ok("the record's scores again: its weights flown home on the lives given and on the course life given, and its rates", r.home === H.homeScore(fly(), TWO) && r.course === V.auditScore(fly(), COURSE) && J(r.rates) === J(fly().rates()) && r.home >= 0 && r.home <= 1, `home ${r.home.toFixed(4)}`);
    const rf = Y.reflyOne(F.trained, TWO), hp = homep(1);
    ok("!! THE FIRST CHECK OF THE MACHINE: round 4's HOMEP draw 1, its committed weights flown home by the homing round's audit, here on 2 lives; it holds only at the committed score to the bit and with the committed weights",
        rf.kind === "refly" && rf.arm === "HOMEP" && rf.s === 1 && rf.weightsHash === hp.weightsHash && rf.home === H.homeScore(T.flyOf("HOMEP", 1, PF.unpackWeights(hp.weights)), TWO) && !Y.reflyHolds(rf, F) &&
        Y.reflyHolds({ ...rf, home: hp.home }, F) && !Y.reflyHolds({ ...rf, home: hp.home + 1e-12 }, F) && !Y.reflyHolds({ ...rf, home: hp.home, weightsHash: homep(2).weightsHash }, F) && !Y.reflyHolds(null, F), `${rf.home.toFixed(4)} on 2 lives`);
    const fl = Y.floors(TWO);
    ok("!! THE SECOND CHECK OF THE MACHINE: the homing round's floors flown again (here on 2 lives); they hold only at the homing round's committed floors to the bit, every one of the four",
        J(fl) === J(H.floors(TWO)) && fl.kind === "floors" && !Y.floorsHold(fl, F) && Y.floorsHold({ ...homingFloors }, F) && ["off", "start", "hand", "told"].every((k) => !Y.floorsHold({ ...homingFloors, [k]: homingFloors[k] + 1e-12 }, F)) && !Y.floorsHold(null, F));
});

console.log("\n3. THE RECORDS (made here; HOMEP and COURSE64 are round 4's as committed)");
section(() => {
    const ptsOf = (s) => Array.from({ length: 60 }, (_, i) => [0.001 * i + 0.0001 * s, 0, 0.00001 * s]);
    const draw = (s, home) => { const pts = ptsOf(s), k = 5 + s, flat = Float32Array.from(pts.flat()), p = Float32Array.from(pts[k]);
        return { kind: "draw", arm: "HOME16", s, recipe: { ...Y.RECIPE }, battery: T.batteryOf(s), n: 60, points: PF.packWeights(flat), pointsHash: PF.hashWeights(flat), trainerScores: Array.from({ length: 60 }, (_, i) => (i === k ? 900 : 800 - i)), keptAt: k,
            weightCount: 3, weights: PF.packWeights(p), weightsHash: PF.hashWeights(p), rates: { a: 0.01, b: 0, c: 0.00001 }, home, course: 0.66 }; };
    const file = (f, again = 1) => { const out = [{ kind: "refly", arm: "HOMEP", s: 1, weightsHash: homep(1).weightsHash, home: homep(1).home }, { ...homingFloors }]; for (const s of T.SEEDS) out.push(draw(s, f(s)));
        const d = out.find((r) => r.kind === "draw" && r.s === again); out.push({ kind: "recheck", arm: "HOME16", s: 1, weightsHash: d.weightsHash, pointsHash: d.pointsHash }); return out; };
    const good = file((s) => 0.58 + s / 1e4), R = Y.reading(good, F), lines = Y.readingLines(R).join("\n"), bad = (recs, re, FF = F) => Y.checkRecords(recs, FF).some((x) => re.test(x)), at = (s, f) => good.map((r) => (r.kind === "draw" && r.s === s ? f(r) : r));
    ok("!! a file of 12 draws, the second training and the two checks of the machine passes every check; a draw missing, trained on 4 lives a fly, on another battery, of 59 points, whose kept point is not the first best of the trainer's scores, whose weights are not its point, or with no home score, each fails by name",
        Y.checkRecords(good, F).length === 0 && good.length === 15 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.kind === "draw" && r.s === 4)), /HOME16 draw 4 is there 0 times/) && bad(at(5, (r) => ({ ...r, recipe: { ...r.recipe, trainEps: 4 } })), /HOME16 draw 5 was trained with another recipe/) &&
        bad(at(6, (r) => ({ ...r, battery: TR.batteryOf("BAT64", 6) })), /HOME16 draw 6 kept its point on other lives than its draw's 64/) && bad(at(7, (r) => ({ ...r, n: 59 })), /HOME16 draw 7 does not hold 60 points/) &&
        bad(at(8, (r) => ({ ...r, trainerScores: r.trainerScores.map((x, i) => (i === 0 ? 1000 : x)) })), /HOME16 draw 8's kept point is not the first best of the trainer's own scores/) &&
        bad(at(9, (r) => ({ ...r, keptAt: r.keptAt + 1, trainerScores: r.trainerScores.map((x, i) => (i === r.keptAt + 1 ? 1000 : x)) })), /HOME16 draw 9's weights are not its walk's point 15/) && bad(at(10, (r) => ({ ...r, home: null })), /HOME16 draw 10 has no home score from 0 to 1/));
    ok("!! the machine's checks missing or a bit off, the second training of draw 2 or of another walk, round 4's file not committed, or failing its own checks, each fail by name",
        bad(good.filter((r) => r.kind !== "refly"), /the machine did not fly round 4's HOMEP draw 1 home to its committed score to the bit/) && bad(good.map((r) => (r.kind === "refly" ? { ...r, home: r.home + 1e-12 } : r)), /the machine did not fly round 4's HOMEP draw 1 home/) &&
        bad(good.filter((r) => r.kind !== "floors"), /the machine did not fly the homing round's floors to its committed floors to the bit/) && bad(good.map((r) => (r.kind === "floors" ? { ...r, told: r.told + 1e-12 } : r)), /the machine did not fly the homing round's floors/) &&
        bad(file((s) => 0.58 + s / 1e4, 2), /HOME16 draw 1 trained a second time is not there once with the same walk and weights/) && bad(good.map((r) => (r.kind === "recheck" ? { ...r, pointsHash: "0".repeat(16) } : r)), /HOME16 draw 1 trained a second time is not there once/) &&
        J(Y.checkRecords(good, { ...F, trained: { ...F.trained, sha256: "0".repeat(64) } })) === J(["the trained-to-home round's file is not the one committed (sha256 c931f32e5705cdba...)"]) &&
        J(Y.checkRecords(good, { ...F, trained: { ...F.trained, lines: F.trained.lines.filter((r) => !(r.arm === "HOMES" && r.s === 3)) } })) === J(["the trained-to-home round's file fails its own checks: HOMES draw 3 is there 0 times (once is registered)"]));
    const hpHome = T.SEEDS.map((s) => homep(s).home), c64 = T.SEEDS.map((s) => course64(s).home), g = PF.rankSum(hpHome, c64), eq = Y.reading(file((s) => homep(s).home), F), worse = Y.reading(file((s) => homep(s).home - 0.001), F), noR = Y.reading(good.filter((r) => r.kind !== "refly"), F);
    ok("!! W IS HOME16 AGAINST HOMEP DRAW FOR DRAW (an exact sign test of the differences), G16 HOME16 AGAINST COURSE64 (an exact rank sum): above every fly is W BETTER (12 above) and G16 BETTER (222); equal to HOMEP is W CANNOT (12 ties, p 1) and G16 round 4's G (ranks 97, WORSE); 0.001 under is W WORSE",
        R.W.word === Y.WORDS.W[0] && R.W.above === 12 && R.W.b === "HOMEP" && R.G16.word === Y.WORDS.G16[0] && R.G16.sumA === 222 && R.G16.b === "COURSE64" && eq.W.word === Y.WORDS.W[2] && eq.W.ties === 12 && eq.W.p === 1 && eq.G16.sumA === g.sumA && g.sumA === 97 && eq.G16.word === Y.WORDS.G16[1] &&
        worse.W.word === Y.WORDS.W[1] && worse.W.below === 12 && near(R.arms.HOMEP.mean, 0.5501) && near(R.arms.COURSE64.mean, 0.5541) && /W \(HOME16 against HOMEP, draw for draw\): above 12, below 0, ties 0/.test(lines) && /G16 \(HOME16 against COURSE64\): HOME16's ranks sum to 222 \(the middle is 150\)/.test(lines) &&
        /THE HOMING FLY WALKED ON 16 LIVES A FLY FINDS HOME BETTER THAN THE HOMING FLY WALKED ON 4/.test(lines) && noR.W === null && noR.G16 === null && /^A CHECK FAILED/.test(Y.readingLines(noR)[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, Y.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMEP", "1"], ["job", "HOME16", "x"], ["job", "HOME16", "0"], ["job", "HOME16", "13"], ["job", "HOME16"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job HOME16 S for draws 1 to 12 -- and nothing else", J(Y.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(Y.parseArgs(["run", "--jobs", "13"])) === J({ cmd: "run", jobs: 13 }) && J(Y.parseArgs(["read"])) === J({ cmd: "read" }) && J(Y.parseArgs(["job", "HOME16", "12"])) === J({ cmd: "job", arm: "HOME16", s: 12 }) && no.every((a) => Y.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyHomeGradient.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains with the registered defaults, trains only what the file does not hold, and the second training of draw 1 in the same pool",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyHomeGradient\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.trainOne\(args\.s\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /done = new Set\(have\.filter\(\(r\) => r\.kind === "draw"\)\.map\(\(r\) => r\.arm \+ "\/" \+ r\.s\)\)/.test(csrc) && /const todo = PF\.SEEDS\.filter\(\(s\) => !done\.has\(PF\.LEAD \+ "\/" \+ s\)\)\.map\(\(s\) => \[PF\.LEAD, s, false\]\)/.test(csrc) &&
        /if \(!rechecked\) todo\.splice\(Math\.min\(1, todo\.length\), 0, \[PF\.LEAD, PF\.SEEDS\[0\], true\]\)/.test(csrc) && /again \? \{ kind: "recheck", arm, s, weightsHash: rec\.weightsHash, pointsHash: rec\.pointsHash \} : rec/.test(csrc) &&
        /usage: node tools\/ship\/takeFlyHomeGradient\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    // the command's append, put together so that this gate's own text holds no file write (the last row reads it for one)
    const APPEND = "fs.appendFileS" + "ync(FILE, JSON.stringify(r) + \"\\n\");";
    const iMachine = csrc.indexOf("const r = PF.reflyOne(F.trained); if (!PF.reflyHolds(r, F)) stop ="), iFloors = csrc.indexOf("const r = PF.floors(); if (!PF.floorsHold(r, F)) stop ="), iTrain = csrc.indexOf("await Promise.all(");
    ok("!! THE COMMAND CHECKS THE MACHINE BEFORE ANY TRAINING: round 4's HOMEP draw 1 flown home, then the floors, each appended only if it holds to the bit, and on a failure it stops before the trainings start",
        iMachine > 0 && iFloors > iMachine && iTrain > iFloors && csrc.indexOf("if (stop) {") < iTrain && /!stop && !linesOf\(\)\.some\(\(r\) => r\.kind === "floors"\)/.test(csrc) && /!linesOf\(\)\.some\(\(r\) => r\.kind === "refly"\)/.test(csrc) &&
        csrc.includes("if (!PF.reflyHolds(r, F)) stop = `this machine does not fly round 4's HOMEP draw ${PF.REFLY_S} home to its committed score to the bit`; else { " + APPEND) &&
        csrc.includes("if (!PF.floorsHold(r, F)) stop = \"this machine does not fly the homing round's floors to its committed floors to the bit\"; else { " + APPEND) &&
        csrc.includes("if (stop) { console.error(`stopped before any training: ${stop}. Nothing of this round's is worth running here.`); process.exitCode = 1; }\n    else {\n"));
    const me = src("tools/ship/flyHomeGradient-selfcheck.mjs"), calls = [...me.matchAll(/Y\.(trainOne|reflyOne|floors)\(([^)]*)\)/g)].map((m) => m[1] + "(" + m[2] + ")");
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its trainings through the round's code are of 2 iterations (and one refused), its checks of the machine on 2 lives not the round's; it starts no process; the file's size and time are what they were",
        J(calls) === J(["trainOne(0)", "trainOne(5, TINY2, TWO, COURSE)", "trainOne(5, TINY1, TWO, COURSE)", "reflyOne(F.trained, TWO)", "floors(TWO)"]) && ![...TWO, ...COURSE].some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) &&
        !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyHomeGradient-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
