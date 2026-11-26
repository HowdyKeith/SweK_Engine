// WebGLEngine/tools/ship/flyHomeCoursePredicts-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyHomeCoursePredicts-selfcheck.mjs      (about twenty seconds; IT NEVER RUNS THE ROUND -- its one walk is flown on 2 lives at home and 1 on the course, and it starts no
// process)
//
// THE GATE OF THE COURSE-PREDICTS-HOME ROUND (registered in brain/FLY_HOME_COURSE_PREDICTS_WIP.md before tools/ship/flyHomeCoursePredicts.mjs and tools/ship/takeFlyHomeCoursePredicts.mjs
// existed): does the better course-holder find home better, at a fixed stage of training and along a walk?
//   1  THE ROUND'S NUMBERS      draws, audits, iterations, walk sets; the two committed files by their hashes, each passing its own checks; the walks are theirs; the registration says the same
//   2  ONE WALK                 a record is its committed walk's points flown home and on the course by hand; the Spearman correlation by hand
//   3  THE RECORDS              24 walks and a second one; S and W
//   4  THE COMMAND              it is this round's; no flight of the round's, no process
//   5  THE VERDICT              the results file as committed unread at 05491300, read from the file: the checks, S, W, the groups and walks, the description after the reading, a
//                               re-audit, the expectations, the note's result
// SABOTAGE LOG (2026-11-26) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the library's and the note's, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's; every one red by name but ONE, a finding (the number is the rows red):
//   THE ROUND: P1 iteration 50 for 59 2 | P2 the HOMEP set from the gradient round 2 | P3 home flown on the course lives 1 | P4 ties given the lower rank 0 -- A FINDING, see below -- then 1 |
//   P5 no spread gives 0, not none 1 | P6 a correlation that cannot be computed counts above 0 1 | P7 S over the walks 1 | P8 the groups correlate course with course 1 | P9 BETTER and WORSE
//   swapped 1 | P10 the chooser file's own checks skipped 1 | P11 the gradient file's hash another 4 | P12 the flies' points not checked 1 | P13 the second walk's scores not compared 1 | P14
//   the round writes the chooser round's file 1
//   THE COMMAND: K1 exits 0 on a word it does not know 1 | K2 the job flies on lives of its own 1 | K3 the file's walks not counted as done 1 | K4 the second walk never in the pool 1 | K5 the
//   second walk recorded as a walk 1 | K6 reads without the committed files 1.   THE NOTE: M1 its iterations end at 50 1 | M2 a correlation not computed counts above 0 1 | M3 its S over 24 1
//   THE FINDING: section 2's one tie case, 1 1 2 against 1 2 3, gives 0.866 whether a tie takes its mean rank or its lowest; a case with two ties where they differ (0.949 against 0.938) was
//   added, and P4 was run again: 1 red.
// THE VERDICT'S SABOTAGES (2026-11-26, after the reading, the same runner, this gate alone): V1 a fly's home score changed in a digit the double holds 1 (the file's hash alone) | V2 S
//   over the walks 2 | V3 BETTER and WORSE swapped 4 | V4 ties given the lower rank 1 | V5 the note's S says CANNOT 1 | V6 the note's expectation of S BETTER is 75 1 | V7 the note names
//   another commit 1 | V8 the note drops that every expectation came 1 | V9 the note's best course at iteration 20 is 0.6614 1. None went 0 red. FOUND WHEN THE VERDICT WAS FIRST RUN: its
//   range row held 0.6573 for the least group's correlation, a figure of mine; the correlation is 95/143 (0.6643), and the row now holds the exact fractions.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "./flyHomeCoursePredicts.mjs";
import * as Y from "./flyHomeGradient.mjs";
import * as C from "./flyHomeChooser.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as PF from "./paintingFly.mjs";
import { createHash } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TWO = [880071, 880072], COURSE = [880073];
const F = Object.fromEntries(Object.entries(P.FILES).map(([k, f]) => [k, P.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flyHomeCoursePredicts-selfcheck -- the course-predicts-home round (points of the committed homing walks flown home and on the course): the numbers, one walk, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! round 4's draws 1 to 12 and audits (200 homing lives, the compass round's 200 course lives); iterations 0, 10, 20, 30, 40 and 59; the walk sets HOMEP and HOME16; alpha 0.01; this round's own results file",
        P.SEEDS === T.SEEDS && P.AUDIT === T.AUDIT && P.COURSE_AUDIT === V.AUDIT && P.AUDIT.length === 200 && P.COURSE_AUDIT.length === 200 && J(P.ITS) === J([0, 10, 20, 30, 40, 59]) && J(P.SETS) === J(["HOMEP", "HOME16"]) && P.ALPHA === 0.01 &&
        P.RESULTS === "brain/flyHomeCoursePredictsRound.jsonl" && ![T.RESULTS, C.RESULTS, Y.RESULTS, "brain/flyHomeGradientCourseRound.jsonl"].includes(P.RESULTS));
    ok("!! THE TWO COMMITTED FILES BY THEIR HASHES -- the chooser round's and the gradient round's -- the tree has them today, and each passes its own checks",
        J(P.FILES) === J({ ...C.FILES, chooser: C.RESULTS, gradient: Y.RESULTS }) && P.CHOOSER_SHA256 === "8951af17ed60d6dc296672eee5d75d62ebe21addc11ac33678cb8982d8ee2876" && P.GRADIENT_SHA256 === "138ea7125387ad2464c206bb6ffd76ca07a3206e2e7aef71e023d35c991e9024" &&
        F.chooser.sha256 === P.CHOOSER_SHA256 && F.gradient.sha256 === P.GRADIENT_SHA256 && C.checkRecords(F.chooser.lines, F).length === 0 && Y.checkRecords(F.gradient.lines, F).length === 0);
    const hp = P.walkOf("HOMEP", 3, F), h16 = P.walkOf("HOME16", 3, F);
    ok("!! THE WALKS ARE THE COMMITTED ONES: HOMEP's the chooser round's walk records (4 lives a fly tried), HOME16's the gradient round's draws (16), 60 points each; another set or draw is refused",
        hp.kind === "walk" && hp.s === 3 && J(hp.recipe) === J(T.RECIPE) && h16.kind === "draw" && h16.arm === "HOME16" && h16.s === 3 && h16.recipe.trainEps === 16 && C.pointsOf(hp).length === 60 && C.pointsOf(h16).length === 60 &&
        throws(() => P.walkOf("HOMES", 1, F), /no walk set HOMES/) && throws(() => P.flyWalk("HOMEP", 13, F), /the HOMEP walk of draw 13 is not in the files given/));
    // which of the 144 points a committed arm kept and audited: described, so the registration's "a few" can be read against it
    const kept = new Set(); for (const s of T.SEEDS) { const hpk = F.trained.lines.find((r) => r.kind === "draw" && r.arm === "HOMEP" && r.s === s).keptAt; kept.add(`HOMEP/${s}/${hpk}`); for (const a of C.ARMS) kept.add(`HOMEP/${s}/${F.chooser.lines.find((r) => r.kind === "draw" && r.arm === a && r.s === s).keptAt}`); kept.add(`HOME16/${s}/${P.walkOf("HOME16", s, F).keptAt}`); }
    const hit = []; for (const set of P.SETS) for (const s of P.SEEDS) for (const it of P.ITS) if (kept.has(`${set}/${s}/${it}`)) hit.push(`${set} ${s} it ${it}`);
    ok("the points some committed arm kept and audited, counted (the registration says a few): fewer than 1 in 10 of the 144", hit.length < 15, `${hit.length}: ${hit.join(", ")}`);
    const note = src("brain/FLY_HOME_COURSE_PREDICTS_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the iterations and the 24 walks, 144 flies on round 4's audit; S over 12 groups and W over 24 walks, sign tests against 0; a correlation that cannot be computed not above 0; the files' hashes; HOMEP draw 1 again",
        /\*\*The points at iterations 0, 10, 20, 30, 40 and 59 of the 24 committed walks\*\*/.test(note) && /\*\*144 flies\*\*/.test(note) && /\*\*a sign test of the 12 against 0\*\*/.test(note) && /\*\*a sign test of the 24 against 0\*\*/.test(note) &&
        /A correlation that cannot be computed \(a group with tied scores\) counts as not above 0\./.test(note) && /sha256 8951af17ed60d6dc/.test(note) && /sha256 138ea7125387ad24/.test(note) && /\*\*The HOMEP walk of draw 1 is flown a second time\.\*\*/.test(note));
});

console.log("\n2. ONE WALK (HOME16's committed walk of draw 5, flown on 2 lives at home and 1 on the course)");
section(() => {
    const r = P.flyWalk("HOME16", 5, F, TWO, COURSE), w = P.walkOf("HOME16", 5, F), pts = C.pointsOf(w);
    ok("!! A RECORD IS ITS COMMITTED WALK'S POINTS AT THE SIX ITERATIONS, EACH THE COMPASS FLY WITH THAT POINT FLOWN HOME AND ON THE COURSE BY HAND, with the walk's hash and each point's",
        r.kind === "walk" && r.set === "HOME16" && r.s === 5 && r.pointsHash === w.pointsHash && J(r.its) === J(P.ITS) && r.flies.length === 6 &&
        r.flies.every((f, k) => f.it === P.ITS[k] && f.weightsHash === PF.hashWeights(pts[P.ITS[k]]) && f.home === H.homeScore(T.flyOf("HOMEP", 5, pts[P.ITS[k]]), TWO) && f.course === V.auditScore(T.flyOf("HOMEP", 5, pts[P.ITS[k]]), COURSE)),
        r.flies.map((f) => `${f.it}: ${f.home.toFixed(3)}/${f.course.toFixed(3)}`).join(" "));
    ok("!! THE SPEARMAN CORRELATION BY HAND: 1 for the same order, -1 for the other, ties given their mean rank (0.866 for 1 1 2 against 1 2 3, 0.949 for 1 1 2 3 3 against 2 1 3 5 4), and none (NaN) with no spread",
        P.spearman([3, 1, 2], [30, 10, 20]) === 1 && P.spearman([1, 2, 3], [3, 2, 1]) === -1 && near(P.spearman([1, 1, 2], [1, 2, 3]), Math.sqrt(3) / 2, 1e-12) && Number.isNaN(P.spearman([1, 1, 1], [1, 2, 3])) && near(P.spearman([1, 2, 3, 4], [1, 3, 2, 4]), 0.8, 1e-12) &&
        near(P.spearman([1, 1, 2, 3, 3], [2, 1, 3, 5, 4]), 0.9486832980505138, 1e-12));   // two ties, where the lowest rank would give 0.938 (the sabotage P4 found 1 1 2 against 1 2 3 the same either way)
});

console.log("\n3. THE RECORDS (made here from the committed walks)");
section(() => {
    const rec = (set, s, f) => { const pts = C.pointsOf(P.walkOf(set, s, F)); return { kind: "walk", set, s, pointsHash: P.walkOf(set, s, F).pointsHash, its: [...P.ITS], flies: P.ITS.map((it, k) => ({ it, weightsHash: PF.hashWeights(pts[it]), ...f(set, s, k) })) }; };
    const file = (f, again = 1) => { const out = []; for (const set of P.SETS) for (const s of P.SEEDS) out.push(rec(set, s, f)); out.push({ kind: "recheck", set: "HOMEP", s: 1, flies: out.find((r) => r.set === "HOMEP" && r.s === again).flies }); return out; };
    // home follows course exactly, and both differ draw to draw and point to point
    const up = (set, s, k) => ({ course: 0.6 + s / 1000 + k / 100, home: 0.5 + s / 1000 + k / 100 }), good = file(up), R = P.reading(good, F), lines = P.readingLines(R).join("\n");
    const bad = (recs, re, FF = F) => P.checkRecords(recs, FF).some((x) => re.test(x)), at = (set, s, g) => good.map((r) => (r.kind === "walk" && r.set === set && r.s === s ? g(r) : r));
    ok("!! a file of 24 walks and the second one passes every check; a walk missing, of another walk's points, at other iterations, a fly not its point, a fly with no home score, the second walk of another draw or with other scores, each fails by name",
        P.checkRecords(good, F).length === 0 && good.length === 25 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.kind === "walk" && r.set === "HOME16" && r.s === 4)), /the HOME16 walk of draw 4 is there 0 times/) &&
        bad(at("HOMEP", 2, (r) => ({ ...r, pointsHash: P.walkOf("HOMEP", 3, F).pointsHash })), /the HOMEP walk of draw 2 is not its committed walk's points/) && bad(at("HOMEP", 3, (r) => ({ ...r, its: [0, 10, 20, 30, 40, 50] })), /the HOMEP walk of draw 3 is not its committed walk's points at iterations 0, 10, 20, 30, 40, 59/) &&
        bad(at("HOME16", 5, (r) => ({ ...r, flies: r.flies.map((f, k) => (k === 2 ? { ...f, weightsHash: r.flies[3].weightsHash } : f)) })), /the HOME16 walk of draw 5's flies are not its points at their iterations/) &&
        bad(at("HOME16", 6, (r) => ({ ...r, flies: r.flies.map((f, k) => (k === 0 ? { ...f, home: null } : f)) })), /the HOME16 walk of draw 6 has a fly with no home score/) &&
        bad(file(up, 2), /the HOMEP walk of draw 1 flown a second time is not there once with the same scores/) && bad(good.map((r) => (r.kind === "recheck" ? { ...r, flies: r.flies.map((f, k) => (k === 1 ? { ...f, home: f.home + 1e-12 } : f)) } : r)), /flown a second time is not there once/));
    ok("!! the chooser or gradient round's file not committed, or failing its own checks, fails by name and no record is weighed",
        J(P.checkRecords(good, { ...F, chooser: { ...F.chooser, sha256: "0".repeat(64) } })) === J(["the chooser round's file is not the one committed (sha256 8951af17ed60d6dc...)"]) &&
        J(P.checkRecords(good, { ...F, gradient: { ...F.gradient, sha256: "1".repeat(64) } })) === J(["the gradient round's file is not the one committed (sha256 138ea7125387ad24...)"]) &&
        J(P.checkRecords(good, { ...F, gradient: { ...F.gradient, lines: F.gradient.lines.filter((r) => !(r.kind === "draw" && r.s === 3)) } })) === J(["the gradient round's file fails its own checks: HOME16 draw 3 is there 0 times (once is registered)"]) &&
        J(P.checkRecords(good, { ...F, chooser: { ...F.chooser, lines: F.chooser.lines.filter((r) => !(r.kind === "walk" && r.s === 3)) } })[0]).startsWith("\"the chooser round's file fails its own checks:"));
    const down = P.reading(file((set, s, k) => ({ course: 0.6 + s / 1000 + k / 100, home: 0.5 - s / 1000 - k / 100 })), F), flat = P.reading(file((set, s, k) => ({ course: 0.6 + s / 1000 + k / 100, home: 0.5 })), F), noR = P.reading(good.filter((r) => r.kind !== "recheck"), F);
    ok("!! S IS A SIGN TEST OF THE 12 GROUPS' CORRELATIONS (a walk set at one iteration, over 12 draws), W OF THE 24 WALKS' (over 6 points): home following course is S BETTER (12 above) and W BETTER (24); home against course is WORSE in both; home with no spread is CANNOT (every correlation none, a tie)",
        R.S.word === P.WORDS.S[0] && R.S.above === 12 && R.W.word === P.WORDS.W[0] && R.W.above === 24 && R.groups.length === 12 && R.walks.length === 24 && R.groups.every((g) => g.rho === 1) && R.pooled > 0.9 &&
        down.S.word === P.WORDS.S[1] && down.S.below === 12 && down.W.word === P.WORDS.W[1] && down.W.below === 24 && flat.S.word === P.WORDS.S[2] && flat.S.ties === 12 && flat.W.ties === 24 && flat.W.word === P.WORDS.W[2] &&
        /S \(the 12 groups against 0\): above 12, below 0, ties 0/.test(lines) && /AT A FIXED STAGE OF TRAINING, THE BETTER COURSE-HOLDER FINDS HOME BETTER/.test(lines) && noR.S === null && /^A CHECK FAILED/.test(P.readingLines(noR)[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, P.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMES", "1"], ["job", "HOMEP", "x"], ["job", "HOMEP", "0"], ["job", "HOME16", "13"], ["job", "HOMEP"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job HOMEP or HOME16 and a draw 1 to 12 -- and nothing else", J(P.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(P.parseArgs(["read"])) === J({ cmd: "read" }) && J(P.parseArgs(["job", "HOME16", "12"])) === J({ cmd: "job", arm: "HOME16", s: 12 }) && no.every((a) => P.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyHomeCoursePredicts.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, flies with the registered audits, only what the file does not hold, the second HOMEP walk of draw 1 in the same pool",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyHomeCoursePredicts\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.flyWalk\(args\.arm, args\.s, committedFiles\(\)\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /for \(const set of PF\.SETS\) for \(const s of PF\.SEEDS\) if \(!done\.has\(set \+ "\/" \+ s\)\) todo\.push\(\[set, s, false\]\)/.test(csrc) && /if \(!rechecked\) todo\.splice\(Math\.min\(1, todo\.length\), 0, \["HOMEP", PF\.SEEDS\[0\], true\]\)/.test(csrc) &&
        /again \? \{ kind: "recheck", set, s, flies: rec\.flies \} : rec/.test(csrc) && /usage: node tools\/ship\/takeFlyHomeCoursePredicts\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyHomeCoursePredicts-selfcheck.mjs"), calls = [...me.matchAll(/P\.flyWalk\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one walk is flown on 2 lives at home and 1 on the course, not the round's (and one call refused); it starts no process; the file's size and time are what they were",
        J(calls) === J(['"HOMEP", 13, F', '"HOME16", 5, F, TWO, COURSE']) && ![...TWO, ...COURSE].some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before,
        `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (the whole results file was committed at 05491300 before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, P.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = P.reading(lines, F), g = (set, it) => R.groups.find((x) => x.set === set && x.it === it), rhos = R.walks.map((w) => w.rho);
    ok("!! the results file is the one the run wrote: 25 records, sha256 99f2f6cfd0531989... (one start, 42.3 minutes on four processes)", lines.length === 25 && createHash("sha256").update(bytes).digest("hex") === "99f2f6cfd05319894afda69f048beec7def1ab16dbe0e7359e542f49c61f1511");
    ok("!! THE CHECKS HOLD: both committed files as committed and passing their own checks; 24 walks each once, every fly its point; the HOMEP walk of draw 1 the same twice", R.checks.length === 0);
    ok("!! *** S -- AT A FIXED STAGE OF TRAINING, THE BETTER COURSE-HOLDER FINDS HOME BETTER (12 of 12 groups above 0, p 2/4096); W -- ALONG A WALK, FINDING HOME AND HOLDING A COURSE RISE AND FALL TOGETHER (24 of 24 above 0, p 2/2^24) ***",
        R.S.word === P.WORDS.S[0] && R.S.above === 12 && R.S.p === 2 / 4096 && R.W.word === P.WORDS.W[0] && R.W.above === 24 && R.W.p === 2 / 2 ** 24);
    ok("!! the groups' correlations from 95/143 = 0.66 (HOMEP at 20) to 142/143 = 0.99 (HOMEP at 10); the walks' from 1/7 = 0.14 (HOME16 draw 2) to 1; over all 144 flies 0.8749",
        near(Math.min(...R.groups.map((x) => x.rho)), 95 / 143, 1e-12) && near(g("HOMEP", 20).rho, Math.min(...R.groups.map((x) => x.rho)), 1e-12) && near(Math.max(...R.groups.map((x) => x.rho)), 142 / 143, 1e-12) && near(g("HOMEP", 10).rho, Math.max(...R.groups.map((x) => x.rho)), 1e-12) &&
        near(Math.min(...rhos), 1 / 7, 1e-12) && R.walks.find((w) => w.rho === Math.min(...rhos)).set === "HOME16" && R.walks.find((w) => w.rho === Math.min(...rhos)).s === 2 && near(Math.max(...rhos), 1, 1e-12) && near(R.pooled, 0.8749), `pooled ${R.pooled.toFixed(4)}`);
    ok("!! DESCRIBED AFTER THE READING, NOT REGISTERED: the homing walks wander in holding a course and home follows -- HOMEP's mean course 0.6641 at iteration 20 and 0.6258 at 30, its mean home 0.5541 and 0.5448; HOME16's best mean home (0.5535, at 40) where its mean course is best (0.6597)",
        near(g("HOMEP", 20).course, 0.6641) && near(g("HOMEP", 30).course, 0.6258) && near(g("HOMEP", 20).home, 0.5541) && near(g("HOMEP", 30).home, 0.5448) && near(g("HOME16", 40).home, 0.5535) && near(g("HOME16", 40).course, 0.6597) &&
        P.ITS.every((it) => g("HOME16", it).home <= g("HOME16", 40).home && g("HOME16", it).course <= g("HOME16", 40).course));
    const w = lines.find((r) => r.kind === "walk" && r.set === "HOME16" && r.s === 2), f0 = w.flies[5], pts = C.pointsOf(P.walkOf("HOME16", 2, F));
    ok("!! RE-AUDITED AFTER THE READING: HOME16 draw 2's last point (the weakest walk) gives its home and course scores again to the bit", H.homeScore(T.flyOf("HOMEP", 2, pts[59]), T.AUDIT) === f0.home && V.auditScore(T.flyOf("HOMEP", 2, pts[59]), V.AUDIT) === f0.course);
    const note = src("brain/FLY_HOME_COURSE_PREDICTS_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 9. The result"));
    ok("the expectations, written before the code, against what came -- every one: S BETTER (85), W BETTER (60)", /S: \*\*BETTER about 85\*\*, CANNOT 15\. W: BETTER about 60, CANNOT 40\./.test(flat) && R.S.word === P.WORDS.S[0] && R.W.word === P.WORDS.W[0]);
    ok("the registration's RESULT SECTION (section 9) carries both readings' words, the commit the file was read at, that every expectation came, the description after the reading said as such, and what it does not mean",
        /## 9\. The result/.test(note) && res.includes(`**S: ${R.S.word}**`) && res.includes(`**W: ${R.W.word}**`) && /05491300/.test(res) && /\*\*Every expectation came\*\*/.test(res) &&
        /\*\*Described after the reading, not registered \(the gate recomputes it from the records\):\*\*/.test(res) && /0\.6641/.test(res) && /\*\*What it does not mean\.\*\*/.test(res));
});

console.log(`\nflyHomeCoursePredicts-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
