// WebGLEngine/tools/ship/flyHomeGradientCourse-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyHomeGradientCourse-selfcheck.mjs      (about a minute; IT NEVER RUNS THE ROUND -- its one choice scores a committed walk on 1 course life and audits on 2, and it
// starts no process)
//
// THE GATE OF THE GRADIENT-AND-COURSE ROUND (registered in brain/FLY_HOME_GRADIENT_COURSE_WIP.md before tools/ship/flyHomeGradientCourse.mjs and tools/ship/takeFlyHomeGradientCourse.mjs
// existed): the gradient round's walks, their point chosen by the course score -- do the better walk and the better chooser add up?
//   1  THE ROUND'S NUMBERS      draws, audit, arm, chooser; the three committed files by their hashes, each passing its own checks; the registration says the same
//   2  ONE CHOICE               a record is the chooser round's HOMEBYC choice of HOME16's committed walk; its scores by hand on the trainer round's course lives; its audits again
//   3  THE RECORDS              12 choices and a second one; Q, K and G
//   4  THE COMMAND              it is this round's; no choice of the round's, no process
//   5  THE VERDICT              the results file as committed unread at ba08a98a, read from the file: the checks, Q, K, G, the arms, the description after the reading, a
//                               re-audit, the expectations, the note's result
// SABOTAGE LOG (2026-11-25) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the library's and the note's, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's; every one red by name (the number is the rows red):
//   THE ROUND: B1 chosen by HOME256's chooser 5 | B2 the walk of the next draw 2 | B3 the arm left as HOMEBYC 2 | B4 the gradient file's hash another 4 | B5 the gradient file's own checks
//   skipped 1 | B6 the chooser file's own checks skipped 1 | B7 a choice's lives not checked 1 | B8 a choice's walk not checked 1 | B9 a choice's first best not checked 1 | B10 the second
//   choice's score not compared 1 | B11 Q against HOMEBYC 1 | B12 K against HOME16 1 | B13 G against HOMEBYC 1 | B14 the sign test's BETTER and WORSE swapped 1 | B15 the rank sum's BETTER
//   and WORSE swapped 1 | B16 the round writes the gradient round's file 1
//   THE COMMAND: K1 exits 0 on a word it does not know 1 | K2 the job chooses from a file it reads itself 1 | K3 the file's choices not counted as done 1 | K4 the second choice never in the
//   pool 1 | K5 the second choice recorded as a choice 1 | K6 reads without the committed files 1.   THE NOTE: N1 its chooser's lives from 80000000 1 | N2 its K a rank sum 1 | N3 it runs
//   the walks again 1
// THE VERDICT'S SABOTAGES (2026-11-25, after the reading, the same runner, this gate alone): V1 a record's home score (draw 4) changed in a digit the double holds 1 (the file's hash
//   alone) | V2 Q against HOMEBYC 3 | V3 G against HOMEBYC 2 | V4 the sign test's BETTER and WORSE swapped 1 (section 3's made records: every real reading is CANNOT) | V5 the note's Q says
//   BETTER 1 | V6 the note's expectation of K CANNOT is 70 1 | V7 the note names another commit 1 | V8 the note drops that every expectation came 1 | V9 the note's gain over HOME16 0.0041 1.
//   None went 0 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Z from "./flyHomeGradientCourse.mjs";
import * as Y from "./flyHomeGradient.mjs";
import * as C from "./flyHomeChooser.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as TR from "./flyCompassTrainer.mjs";
import * as PF from "./paintingFly.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import { evaluate } from "../../brain/rl/dockPolicy.js";
import { createHash } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TWO = [880061, 880062], COURSE = [880063];
const F = Object.fromEntries(Object.entries(Z.FILES).map(([k, f]) => [k, Z.fileOf(fs.readFileSync(path.join(ENG, f)))]));
const walk = (s) => F.gradient.lines.find((r) => r.kind === "draw" && r.s === s), byc = (s) => F.chooser.lines.find((r) => r.kind === "draw" && r.arm === "HOMEBYC" && r.s === s), course64 = (s) => F.trained.lines.find((r) => r.kind === "fly" && r.arm === "COURSE64" && r.s === s);

console.log("flyHomeGradientCourse-selfcheck -- the gradient-and-course round (HOME16's walks, their point chosen by the course score): the numbers, one choice, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! round 4's draws 1 to 12 and audit; the arm H16BYC, chosen by the chooser round's HOMEBYC; alpha 0.01; 60 points a walk; this round's own results file",
        Z.SEEDS === T.SEEDS && Z.AUDIT === T.AUDIT && Z.ALPHA === 0.01 && Z.ITERS === 60 && J(Z.ARMS) === J(["H16BYC"]) && Z.LEAD === "H16BYC" && Z.CHOOSER === "HOMEBYC" && C.ARMS.includes(Z.CHOOSER) &&
        Z.RESULTS === "brain/flyHomeGradientCourseRound.jsonl" && ![T.RESULTS, C.RESULTS, Y.RESULTS].includes(Z.RESULTS) && throws(() => Z.chooseOne(13, F.gradient), /HOME16 draw 13 is not in the file given/));
    ok("!! THE THREE COMMITTED FILES BY THEIR HASHES -- the gradient round's, the chooser round's and round 4's -- the tree has them today, and each passes its own checks",
        J(Z.FILES) === J({ ...C.FILES, chooser: "brain/flyHomeChooserRound.jsonl", gradient: "brain/flyHomeGradientRound.jsonl" }) && Z.GRADIENT_SHA256 === "138ea7125387ad2464c206bb6ffd76ca07a3206e2e7aef71e023d35c991e9024" &&
        Z.CHOOSER_SHA256 === "8951af17ed60d6dc296672eee5d75d62ebe21addc11ac33678cb8982d8ee2876" && F.gradient.sha256 === Z.GRADIENT_SHA256 && F.chooser.sha256 === Z.CHOOSER_SHA256 && F.trained.sha256 === C.TRAINED_SHA256 &&
        Y.checkRecords(F.gradient.lines, F).length === 0 && C.checkRecords(F.chooser.lines, F).length === 0 && T.checkRecords(F.trained.lines, F).length === 0);
    const note = src("brain/FLY_HOME_GRADIENT_COURSE_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: no walk run again; the HOMEBYC chooser on BAT64 lives; draws 1 to 12; Q and K draw for draw, G a rank sum; the three files' hashes; H16BYC draw 1 again",
        /\*\*No walk is run again\*\*/.test(note) && /\*\*the best course score on the trainer round's BAT64 lives\*\* \(seeds 40000000 \+ 10007 s \+ 17 k\)/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) &&
        /\*\*Q: H16BYC against HOME16, draw for draw\*\* \(sign test/.test(note) && /\*\*K: H16BYC against HOMEBYC, draw for draw\*\* \(sign test\)/.test(note) && /\*\*G: H16BYC against COURSE64\*\* \(rank sum\)/.test(note) &&
        /sha256 138ea7125387ad24/.test(note) && /sha256 8951af17ed60d6dc/.test(note) && /sha256 c931f32e5705cdba/.test(note) && /\*\*H16BYC draw 1 is chosen a second time\.\*\*/.test(note));
});

console.log("\n2. ONE CHOICE (HOME16's committed walk of draw 5, scored on 1 course life, audited on 2)");
section(() => {
    const w = walk(5), r = Z.chooseOne(5, F.gradient, TWO, COURSE, 1), pts = C.pointsOf(w), b = TR.batteryOf("BAT64", 5);
    const byHand = pts.map((p) => C.trainerScore(evaluate(Float32Array.from(p), { envFactory: () => new CE.CompassEnv(), obsDim: CE.NR + 2, actDim: 1, maxSteps: 1500, policyFactory: () => V.policyOf("PLASTIC", 5), episodes: 1, seedBase: b.base })));
    ok("!! A RECORD IS THE CHOOSER ROUND'S HOMEBYC CHOICE OF HOME16'S COMMITTED WALK: its walk's hash, HOMEBYC's lives, every point's course score flown here by hand on the trainer round's first BAT64 life of the draw, the first best kept, that point's weights",
        r.kind === "draw" && r.arm === "H16BYC" && r.s === 5 && r.walkHash === w.pointsHash && J(r.chooser) === J(C.chooserOf("HOMEBYC", 5)) && r.chooser.base === b.base && r.chooser.eps === 64 && J(r.scores) === J(byHand) &&
        r.keptAt === C.firstBest(byHand) && r.weightsHash === PF.hashWeights(pts[r.keptAt]) && r.weightCount === 3, `kept ${r.keptAt}`);
    const fly = () => T.flyOf("HOMEP", 5, PF.unpackWeights(r.weights)), c = C.chooseOne("HOMEBYC", 5, { ...w, kind: "walk" }, TWO, COURSE, 1);
    ok("the record's audits again -- its point flown home on the lives given and on the course life given, its rates -- and it is the chooser round's own record but for its arm",
        r.home === H.homeScore(fly(), TWO) && r.course === V.auditScore(fly(), COURSE) && J(r.rates) === J(fly().rates()) && J({ ...c, arm: "H16BYC" }) === J(r), `home ${r.home.toFixed(4)}`);
});

console.log("\n3. THE RECORDS (made here; HOME16, HOMEBYC and COURSE64 are the committed rounds')");
section(() => {
    const choice = (s, home, at = 10 + s) => { const p = Float32Array.from(C.pointsOf(walk(s))[at]);
        return { kind: "draw", arm: "H16BYC", s, chooser: C.chooserOf("HOMEBYC", s), walkHash: walk(s).pointsHash, scores: Array.from({ length: 60 }, (_, i) => (i === at ? -0.4 : -0.5 - i / 1e4)), keptAt: at, weightCount: 3, weights: PF.packWeights(p), weightsHash: PF.hashWeights(p), rates: { a: 0.01, b: 0, c: 0.00001 }, home, course: 0.66 }; };
    const file = (f, again = 1) => { const out = T.SEEDS.map((s) => choice(s, f(s))), d = out.find((r) => r.s === again); out.push({ kind: "recheck", arm: "H16BYC", s: 1, weightsHash: d.weightsHash, home: d.home }); return out; };
    const top = (s) => 0.58 + s / 1e4, good = file(top), R = Z.reading(good, F), lines = Z.readingLines(R).join("\n"), bad = (recs, re, FF = F) => Z.checkRecords(recs, FF).some((x) => re.test(x)), at = (s, g) => good.map((r) => (r.kind === "draw" && r.s === s ? g(r) : r));
    ok("!! a file of 12 choices and the second one passes every check; a choice missing, on other lives, of another walk, with 59 scores, whose point is not the first best (a later one of two equal), whose weights are not its point, or with no home score, each fails by name",
        Z.checkRecords(good, F).length === 0 && good.length === 13 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.kind === "draw" && r.s === 4)), /H16BYC draw 4 is there 0 times/) &&
        bad(at(2, (r) => ({ ...r, chooser: C.chooserOf("HOME256", 2) })), /H16BYC draw 2 was chosen on other lives than HOMEBYC's/) && bad(at(3, (r) => ({ ...r, walkHash: walk(4).pointsHash })), /H16BYC draw 3 is not a choice of HOME16's walk of its draw/) &&
        bad(at(5, (r) => ({ ...r, scores: r.scores.slice(1) })), /H16BYC draw 5 does not hold a score for each of the 60 points/) && bad(at(6, (r) => ({ ...r, scores: r.scores.map((x, i) => (i === 2 ? -0.4 : x)) })), /H16BYC draw 6's point is not the first best of its scores/) &&
        bad(at(7, (r) => { const p = Float32Array.from(C.pointsOf(walk(7))[0]); return { ...r, weights: PF.packWeights(p), weightsHash: PF.hashWeights(p) }; }), /H16BYC draw 7's weights are not its walk's point 17/) && bad(at(8, (r) => ({ ...r, home: null })), /H16BYC draw 8 has no home score/));
    ok("!! the second choice of draw 2 or of another score, the gradient or chooser round's file not committed, or failing its own checks, each fail by name",
        bad(file(top, 2), /H16BYC draw 1 chosen a second time is not there once/) && bad(good.map((r) => (r.kind === "recheck" ? { ...r, home: r.home + 1e-12 } : r)), /H16BYC draw 1 chosen a second time is not there once/) &&
        J(Z.checkRecords(good, { ...F, gradient: { ...F.gradient, sha256: "0".repeat(64) } })) === J(["the gradient round's file is not the one committed (sha256 138ea7125387ad24...)"]) &&
        J(Z.checkRecords(good, { ...F, chooser: { ...F.chooser, sha256: "0".repeat(64) } })) === J(["the chooser round's file is not the one committed (sha256 8951af17ed60d6dc...)"]) &&
        J(Z.checkRecords(good, { ...F, gradient: { ...F.gradient, lines: F.gradient.lines.filter((r) => !(r.kind === "draw" && r.s === 3)) } })) === J(["the gradient round's file fails its own checks: HOME16 draw 3 is there 0 times (once is registered)"]) &&
        J(Z.checkRecords(good, { ...F, chooser: { ...F.chooser, lines: F.chooser.lines.filter((r) => !(r.kind === "draw" && r.arm === "HOMEBYC" && r.s === 3)) } })) === J(["the chooser round's file fails its own checks: HOMEBYC draw 3 is there 0 times (once is registered)"]));
    const g = PF.rankSum(T.SEEDS.map((s) => byc(s).home), T.SEEDS.map((s) => course64(s).home)), asB = Z.reading(file((s) => byc(s).home), F), asH = Z.reading(file((s) => walk(s).home - 0.001), F), noR = Z.reading(good.filter((r) => r.kind !== "recheck"), F);
    ok("!! Q IS H16BYC AGAINST HOME16 AND K AGAINST HOMEBYC, DRAW FOR DRAW (exact sign tests), G AGAINST COURSE64 (an exact rank sum): above every fly is Q, K and G BETTER (12, 12, 222); equal to HOMEBYC is K CANNOT (12 ties) and G the chooser round's GBC (160); 0.001 under HOME16 is Q WORSE",
        R.Q.word === Z.WORDS.Q[0] && R.Q.above === 12 && R.Q.b === "HOME16" && R.K.word === Z.WORDS.K[0] && R.K.above === 12 && R.K.b === "HOMEBYC" && R.G.word === Z.WORDS.G[0] && R.G.sumA === 222 && R.G.b === "COURSE64" &&
        asB.K.word === Z.WORDS.K[2] && asB.K.ties === 12 && asB.K.p === 1 && asB.G.sumA === g.sumA && g.sumA === 160 && asH.Q.word === Z.WORDS.Q[1] && asH.Q.below === 12 && near(R.arms.HOME16.mean, 0.5517) && near(R.arms.HOMEBYC.mean, 0.5542) && near(R.arms.COURSE64.mean, 0.5541) &&
        /Q \(H16BYC against HOME16, draw for draw\): above 12, below 0, ties 0/.test(lines) && /THE 16-LIFE WALK CHOSEN BY ITS COURSE SCORE FINDS HOME BETTER THAN THE 4-LIFE WALK CHOSEN BY ITS COURSE SCORE/.test(lines) && noR.Q === null && /^A CHECK FAILED/.test(Z.readingLines(noR)[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, Z.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMEBYC", "1"], ["job", "H16BYC", "x"], ["job", "H16BYC", "0"], ["job", "H16BYC", "13"], ["job", "H16BYC"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job H16BYC S for draws 1 to 12 -- and nothing else", J(Z.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(Z.parseArgs(["read"])) === J({ cmd: "read" }) && J(Z.parseArgs(["job", "H16BYC", "12"])) === J({ cmd: "job", arm: "H16BYC", s: 12 }) && no.every((a) => Z.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyHomeGradientCourse.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, chooses with the registered defaults from the committed walks, only what the file does not hold, the second choice of draw 1 in the same pool",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyHomeGradientCourse\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.chooseOne\(args\.s, committedFiles\(\)\.gradient\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /const todo = PF\.SEEDS\.filter\(\(s\) => !done\.has\(PF\.LEAD \+ "\/" \+ s\)\)\.map\(\(s\) => \[PF\.LEAD, s, false\]\)/.test(csrc) && /if \(!rechecked\) todo\.splice\(Math\.min\(1, todo\.length\), 0, \[PF\.LEAD, PF\.SEEDS\[0\], true\]\)/.test(csrc) &&
        /again \? \{ kind: "recheck", arm, s, weightsHash: rec\.weightsHash, home: rec\.home \} : rec/.test(csrc) && /usage: node tools\/ship\/takeFlyHomeGradientCourse\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyHomeGradientCourse-selfcheck.mjs"), calls = [...me.matchAll(/Z\.chooseOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one choice scores a committed walk on 1 course life and audits on lives not the round's (and one call refused); it starts no process; the file's size and time are what they were",
        J(calls) === J(["13, F.gradient", "5, F.gradient, TWO, COURSE, 1"]) && ![...TWO, ...COURSE].some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before,
        `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (the whole results file was committed at ba08a98a before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, Z.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = Z.reading(lines, F), A = R.arms, mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    ok("!! the results file is the one the run wrote: 13 records, sha256 b1a5f0d821808df3... (one start, 38.6 minutes on four processes)", lines.length === 13 && createHash("sha256").update(bytes).digest("hex") === "b1a5f0d821808df3302d57fdedb16a23dbb490911dcf836f118079235c9e5622");
    ok("!! THE CHECKS HOLD: the three committed files as committed and passing their own checks; 12 choices of HOME16's walks on HOMEBYC's lives, each the first best of its 60 scores; draw 1 the same twice", R.checks.length === 0);
    ok("!! *** Q -- CANNOT BE TOLD APART FROM HOME16 (9 above, 3 below, p 0.15); K -- CANNOT BE TOLD APART FROM HOMEBYC (5 above, 7 below, p 0.77); G -- CANNOT BE TOLD APART FROM COURSE64 (ranks 169, p 0.29) ***",
        R.Q.word === Z.WORDS.Q[2] && R.Q.above === 9 && R.Q.below === 3 && R.Q.p === 598 / 4096 && R.K.word === Z.WORDS.K[2] && R.K.above === 5 && R.K.below === 7 && near(R.K.p, 0.7744) && R.G.word === Z.WORDS.G[2] && R.G.sumA === 169 && near(R.G.p, 0.2913));
    ok("!! the arms (home mean, sd, least, most; course): H16BYC 0.5548 0.0027 0.5470 0.5578, 0.6687 | HOME16 0.5517, 0.6555 | HOMEBYC 0.5542, 0.6686 | COURSE64 0.5541, 0.6688",
        near(A.H16BYC.mean, 0.5548) && near(A.H16BYC.sd, 0.0027) && near(A.H16BYC.min, 0.5470) && near(A.H16BYC.max, 0.5578) && near(A.H16BYC.course, 0.6687) && near(A.HOME16.mean, 0.5517) && near(A.HOMEBYC.mean, 0.5542) && near(A.COURSE64.mean, 0.5541) && near(A.COURSE64.course, 0.6688));
    ok("!! DESCRIBED AFTER THE READING, NOT REGISTERED: H16BYC is above HOME16 by 0.0031 on average (below on draws 5, 6 and 7), above HOMEBYC by 0.0006, above COURSE64 by 0.0006; its course score is COURSE64's to within 0.0002",
        near(mean(R.Q.diffs), 0.0031) && J(R.Q.diffs.map((d, i) => (d < 0 ? i + 1 : 0)).filter(Boolean)) === J([5, 6, 7]) && near(mean(R.K.diffs), 0.0006) && near(A.H16BYC.mean - A.COURSE64.mean, 0.0006) && Math.abs(A.H16BYC.course - A.COURSE64.course) < 0.0002);
    const d1 = lines.find((r) => r.kind === "draw" && r.s === 1);
    ok("!! RE-AUDITED AFTER THE READING: H16BYC draw 1 gives its home score again to the bit", H.homeScore(T.flyOf("HOMEP", 1, PF.unpackWeights(d1.weights)), T.AUDIT) === d1.home);
    const note = src("brain/FLY_HOME_GRADIENT_COURSE_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 9. The result"));
    ok("the expectations, written before the code, against what came -- every one: Q CANNOT (55), K CANNOT (80), G CANNOT (75)",
        /Q: CANNOT about 55, BETTER 35, WORSE 10\. K: CANNOT about 80, BETTER 10, WORSE 10\. G: CANNOT about 75, BETTER 15, WORSE 10\./.test(flat) && ["Q", "K", "G"].every((k) => R[k].word === Z.WORDS[k][2]));
    ok("the registration's RESULT SECTION (section 9) carries the three readings' words, the commit the file was read at, that every expectation came, the description after the reading said as such, and what it does not mean",
        /## 9\. The result/.test(note) && ["Q", "K", "G"].every((k) => res.includes(`**${k}: ${R[k].word}**`)) && /ba08a98a/.test(res) && /\*\*Every expectation came\*\*/.test(res) &&
        /\*\*Described after the reading, not registered \(the gate recomputes it from the records\):\*\*/.test(res) && /0\.0031 on average/.test(res) && /\*\*What it does not mean\.\*\*/.test(res));
});

console.log(`\nflyHomeGradientCourse-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
