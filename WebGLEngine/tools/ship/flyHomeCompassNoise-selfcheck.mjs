// WebGLEngine/tools/ship/flyHomeCompassNoise-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyHomeCompassNoise-selfcheck.mjs      (about thirty seconds; IT NEVER RUNS THE ROUND -- its one fly is flown on 2 lives at home and 1 on the course, and it starts no
// process)
//
// THE GATE OF THE COMPASS-NOISE ROUND (registered in brain/FLY_HOME_COMPASS_NOISE_WIP.md before brain/rl/noisyCompassEnv.mjs, tools/ship/flyHomeCompassNoise.mjs and
// tools/ship/takeFlyHomeCompassNoise.mjs existed): with the heading the compass sees jittered, does finding home fall only as far as the lost course-holding accounts for?
//   1  THE ROUND'S NUMBERS      draws, audits, levels, arms; the committed files by their hashes, each passing its own checks; the line; the registration says the same
//   2  THE NOISE                the seen heading jittered by a stream of the life's own and nothing else; at sigma 0 the plain life to the bit; the lives not edited
//   3  ONE FLY                  a record is its arm's committed fly flown at each sigma by hand; at sigma 0 the committed audits' own functions to the bit
//   4  THE RECORDS              48 flies and a second one; C, R8 and R4
//   5  THE COMMAND              it is this round's; no flight of the round's, no process
// SABOTAGE LOG (2026-11-26) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the noise's, the library's and the note's, this gate
// and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's; every one red by name but FOUR, findings (the number is the rows red):
//   THE NOISE: E1 the noise not from the life's own stream 1 | E2 a draw at sigma 0 too 1 | E3 the true heading moved 2 | E4 the noise twice as wide 1 | E5 the compass life edited (a comment) 1
//   THE ROUND: F1 sigma 1.6 for 0.8 2 | F2 the slope 1 1 | F3 COURSE64's course score round 4's 0 -- NOT A GAP: round 4's COURSE64 record holds the trainer round's score, the same number --
//   replaced by COURSE64's home score the trainer round's course score 1 | F4 home flown as the compass fly 1 | F5 R8 at 0.4 0 -- A FINDING -- then 1 | F6 C against home 0 -- A FINDING --
//   then 1 | F7 BETTER and WORSE swapped 1 | F8 sigma 0 not checked against the committed scores 1 | F9 the predicts file's own checks skipped 0 -- A FINDING -- then 1 | F10 the gradcourse
//   file's hash another 3 | F11 the second fly's scores not compared 1 | F12 the round writes the predicts round's file 1 | F13 the line fitted course on home 2
//   THE COMMAND: K1 exits 0 on a word it does not know 1 | K2 the job flies on lives of its own 1 | K3 the file's flies not counted as done 1 | K4 the second fly never in the pool 1 | K5 the
//   second fly recorded as a fly 1 | K6 reads without the committed files 1.   THE NOTE: M1 its salt another 1 | M2 its slope 0.47 1 | M3 it drops the sigma-0 check 1
//   THE FINDINGS: section 4's made records fell in step at every sigma, and home always with course, so R8 read at 0.4 and C read on home came out the same; records whose home falls at the
//   slope to 0.4 and faster at 0.8, and records whose home rises as course falls, were added. And no made file broke the course-predicts round's own checks; one does now. F3, F5, F6 and F9
//   were run again after the fixes: 1 red each. FOUND BEFORE THE SABOTAGES: a row of section 2 compared the compass life's hash with itself; it now holds the committed hashes of the
//   compass and homing lives. FOUND BY tools/ship/definitionGates-selfcheck.mjs AFTER THEM: courseScore was named by no gate (homeScore only by a namesake); section 3 now names both.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as N from "./flyHomeCompassNoise.mjs";
import * as P from "./flyHomeCoursePredicts.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as PF from "./paintingFly.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import { HomeEnv } from "../../brain/rl/homeEnv.mjs";
import { HomingFly } from "../../brain/rl/homingFly.mjs";
import * as NE from "../../brain/rl/noisyCompassEnv.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880081, 880082], COURSE = [880083];
const F = Object.fromEntries(Object.entries(N.FILES).map(([k, f]) => [k, N.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flyHomeCompassNoise-selfcheck -- the compass-noise round (48 committed flies with the seen heading jittered): the numbers, the noise, one fly, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! round 4's draws 1 to 12 and audits (200 homing lives, the compass round's 200 course lives); sigma 0, 0.2, 0.4 and 0.8; the arms HOMEP, COURSE64, HOME16 and H16BYC; alpha 0.01; this round's own results file",
        N.SEEDS === T.SEEDS && N.AUDIT === T.AUDIT && N.COURSE_AUDIT === V.AUDIT && J(N.SIGMAS) === J([0, 0.2, 0.4, 0.8]) && J(N.ARMS) === J(["HOMEP", "COURSE64", "HOME16", "H16BYC"]) && N.ALPHA === 0.01 &&
        N.RESULTS === "brain/flyHomeCompassNoiseRound.jsonl" && !Object.values(N.FILES).includes(N.RESULTS) && throws(() => N.committedOf("HOMES", 1, F), /no arm HOMES/) && throws(() => N.committedOf("HOMEP", 13, F), /HOMEP draw 13 is not in the files given/));
    ok("!! THE COMMITTED FILES BY THEIR HASHES -- round 4's, the trainer round's, the chooser, gradient, gradient-and-course and course-predicts rounds' -- the tree has them today, and each passes its own checks",
        J(N.SHA256) === J({ trained: "c931f32e5705cdbadeb3ca729958a67a0eb7375593cf2feb02b8c4ac5b5522c6", trainer: "dd6b4646158c4d0e33a7398bfeba6e465b3f2f088abb24be8687a51606da7efe", chooser: "8951af17ed60d6dc296672eee5d75d62ebe21addc11ac33678cb8982d8ee2876",
            gradient: "138ea7125387ad2464c206bb6ffd76ca07a3206e2e7aef71e023d35c991e9024", gradcourse: "b1a5f0d821808df3302d57fdedb16a23dbb490911dcf836f118079235c9e5622", predicts: "99f2f6cfd05319894afda69f048beec7def1ab16dbe0e7359e542f49c61f1511" }) &&
        Object.entries(N.SHA256).every(([k, h]) => F[k].sha256 === h) && N.checkRecords([], F).every((x) => !/file/.test(x)));
    const L = N.lineOf(F.predicts);
    ok("!! THE LINE: least squares of home on course over the course-predicts round's 144 flies, home = 0.2434 + 0.4696 x course", L.n === 144 && near(L.a, 0.2434) && near(L.b, 0.4696), `${L.a.toFixed(6)} + ${L.b.toFixed(6)} x course`);
    const note = src("brain/FLY_HOME_COMPASS_NOISE_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the seen heading jittered by a stream of the life's own and nothing else; the committed scores to the bit at sigma 0; the 48 flies and the levels; C, R8 and R4 with the slope 0.4696; HOMEP draw 1 again",
        /\*\*The heading the ring neurons see is the true heading plus sigma x a normal draw, a new draw for every observation\*\*/.test(note) && /its seed XOR 0x5bd1e995/.test(note) && /\*\*every fly must give its committed course and home scores to the bit at sigma 0\*\*/.test(note) &&
        /\*\*48 committed flies, 12 each\*\*/.test(note) && /\*\*Each flown at sigma 0, 0\.2, 0\.4 and 0\.8 radians\*\*/.test(note) && /\*\*0\.4696\*\* times its fall on the course/.test(note) && /\*\*HOMEP draw 1 is flown a second time\.\*\*/.test(note) && NE.NOISE_SALT === 0x5bd1e995);
});

console.log("\n2. THE NOISE (brain/rl/noisyCompassEnv.mjs)");
section(() => {
    const seed = 30000001, gs = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()), acts = Array.from({ length: 1500 }, (_, t) => [0.15 * Math.sin(t / 37)]);
    const plain = new CE.CompassEnv(), zero = new NE.NoisyCompassEnv(0), noisy = new NE.NoisyCompassEnv(0.4), nr = CE.stream((seed ^ 0x5bd1e995) >>> 0);
    let same0 = J(Array.from(plain.reset(seed))) === J(Array.from(zero.reset(seed))), seen = true, truth = true; noisy.reset(seed);
    // the first observation by hand: the plain life's ring activity at the true heading plus 0.4 x the noise stream's first normal draw
    { const e = new CE.CompassEnv(); e.reset(seed); e.th = CE.wrap(0 + gs(nr) * 0.4); seen = J(Array.from(e._obs())) === J(Array.from((() => { const n2 = new NE.NoisyCompassEnv(0.4); return n2.reset(seed); })())); }
    for (const a of acts) { const p = plain.step(a), z = zero.step(a), n = noisy.step(a); same0 = same0 && J(Array.from(p.obs)) === J(Array.from(z.obs)) && p.reward === z.reward; truth = truth && plain.th === noisy.th && plain.goal === noisy.goal && p.reward === n.reward; }
    ok("!! AT SIGMA 0 THE NOISY LIFE IS THE PLAIN ONE TO THE BIT (every observation and reward of a life); WITH NOISE THE TRUE HEADING, GOAL AND REWARD ARE THE PLAIN LIFE'S, and only what the ring neurons see moves -- the first sight by hand, the true heading plus 0.4 x the life's own noise stream",
        same0 && truth && seen && plain.ret === noisy.ret && throws(() => new NE.NoisyCompassEnv(-0.1), /sigma is a number 0 or more/));
    const ph = new HomeEnv(), nh = new NE.NoisyHomeEnv(0.8); ph.reset(seed); nh.reset(seed); let way = true; for (const a of acts) { ph.step(a); nh.step(a); way = way && ph.x === nh.x && ph.y === nh.y; }
    ok("the noisy homing life moves the fly as the plain one does (the way home is the life's); the compass and homing lives are the bytes committed before this round", way && ph.score() === nh.score() &&
        sha("brain/rl/compassEnv.mjs") === "65e75180725ed0b28f17d8e0305ce8dc4395fa1c30a5809f1ec350a290aff1c5" && sha("brain/rl/homeEnv.mjs") === "d75957c82576d1fa2f98f93a90a56e573282ae96192c7f03f3c4f1aba4bf5e25");
});

console.log("\n3. ONE FLY (COURSE64 draw 5, flown on 2 lives at home and 1 on the course at each sigma)");
section(() => {
    const r = N.flyOne("COURSE64", 5, F, TWO, COURSE), c = N.committedOf("COURSE64", 5, F), fly = () => T.flyOf("HOMEP", 5, c.weights);
    const byHand = (sg) => { const eh = new NE.NoisyHomeEnv(sg), h = new HomingFly(fly()); let sh = 0; for (const seed of TWO) { let o = eh.reset(seed), d = false; while (!d) { const x = eh.step(h.act(o)); o = x.obs; d = x.done; } sh += eh.score(); }
        const ec = new NE.NoisyCompassEnv(sg), f2 = fly(); let sc = 0; for (const seed of COURSE) { let o = ec.reset(seed), d = false; while (!d) { const x = ec.step(f2.act(o)); o = x.obs; d = x.done; } sc += ec.ret; } return { sigma: sg, home: sh / TWO.length, course: sc / COURSE.length }; };
    ok("!! A RECORD IS ITS ARM'S COMMITTED FLY FLOWN AT EACH SIGMA BY HAND, at home as the homing fly and on the course as the compass fly; at sigma 0 the committed audits' own functions to the bit",
        r.kind === "fly" && r.arm === "COURSE64" && r.s === 5 && r.weightsHash === c.weightsHash && J(r.levels) === J(N.SIGMAS.map(byHand)) && r.levels[0].home === H.homeScore(fly(), TWO) && r.levels[0].course === V.auditScore(fly(), COURSE),
        r.levels.map((l) => `${l.sigma}: ${l.course.toFixed(3)}/${l.home.toFixed(3)}`).join(" "));
    ok("the round's two audits at sigma 0 are the committed ones to the bit: courseScore the compass round's auditScore, homeScore the homing round's", N.courseScore(fly(), COURSE, 0) === V.auditScore(fly(), COURSE) && N.homeScore(fly(), TWO, 0) === H.homeScore(fly(), TWO) && N.courseScore(fly(), COURSE, 0.4) === r.levels[2].course && N.homeScore(fly(), TWO, 0.4) === r.levels[2].home);
    const tr = (f) => F.trained.lines.find(f), hp = tr((x) => x.kind === "draw" && x.arm === "HOMEP" && x.s === 2), c64 = tr((x) => x.kind === "fly" && x.arm === "COURSE64" && x.s === 2), bat = F.trainer.lines.find((x) => x.kind === "draw" && x.arm === "BAT64" && x.s === 2);
    const h16 = F.gradient.lines.find((x) => x.kind === "draw" && x.s === 2), hb = F.gradcourse.lines.find((x) => x.kind === "draw" && x.s === 2), k = (a) => N.committedOf(a, 2, F);
    ok("!! EACH ARM'S COMMITTED FLY: HOMEP round 4's; COURSE64 the trainer round's BAT64 weights, with round 4's home score and the trainer round's course score; HOME16 and H16BYC their rounds'",
        k("HOMEP").weightsHash === hp.weightsHash && k("HOMEP").home === hp.home && k("HOMEP").course === hp.course && k("COURSE64").weightsHash === bat.weightsHash && bat.weightsHash === c64.weightsHash && k("COURSE64").home === c64.home && k("COURSE64").course === bat.score &&
        k("HOME16").weightsHash === h16.weightsHash && k("HOME16").home === h16.home && k("H16BYC").weightsHash === hb.weightsHash && k("H16BYC").course === hb.course);
});

console.log("\n4. THE RECORDS (made here; level 0 each fly's committed scores)");
section(() => {
    // each fly loses d on the course at sigma s and home loses k x d: k = the line's slope is R CANNOT (residual 0, a tie), more is WORSE
    const rec = (arm, s, k, k8 = k) => { const c = N.committedOf(arm, s, F); return { kind: "fly", arm, s, weightsHash: c.weightsHash, levels: N.SIGMAS.map((sg) => { const d = sg / 10 + s / 1e4; return { sigma: sg, course: c.course - d, home: Math.min(1, Math.max(0, c.home - (sg === 0.8 ? k8 : k) * d)) }; }).map((l, i) => (i === 0 ? { sigma: 0, course: c.course, home: c.home } : l)) }; };
    const file = (k, again = 1, k8 = k) => { const out = []; for (const arm of N.ARMS) for (const s of N.SEEDS) out.push(rec(arm, s, k, k8)); out.push({ kind: "recheck", arm: "HOMEP", s: 1, levels: out.find((r) => r.arm === "HOMEP" && r.s === again).levels }); return out; };
    const good = file(1), R = N.reading(good, F), lines = N.readingLines(R).join("\n"), bad = (recs, re) => N.checkRecords(recs, F).some((x) => re.test(x)), at = (arm, s, g) => good.map((r) => (r.kind === "fly" && r.arm === arm && r.s === s ? g(r) : r));
    ok("!! a file of 48 flies and the second one passes every check; a fly missing, not its committed weights, at other sigmas, off its committed scores at sigma 0, with no score, the second of another draw or other scores, each fails by name",
        N.checkRecords(good, F).length === 0 && good.length === 49 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.kind === "fly" && r.arm === "H16BYC" && r.s === 4)), /H16BYC draw 4 is there 0 times/) &&
        bad(at("HOMEP", 2, (r) => ({ ...r, weightsHash: "0".repeat(16) })), /HOMEP draw 2 is not its arm's committed weights/) && bad(at("COURSE64", 3, (r) => ({ ...r, levels: r.levels.map((l, i) => (i === 3 ? { ...l, sigma: 1.6 } : l)) })), /COURSE64 draw 3 does not hold a home and course score at each of sigma 0, 0.2, 0.4, 0.8/) &&
        bad(at("HOME16", 5, (r) => ({ ...r, levels: r.levels.map((l, i) => (i === 0 ? { ...l, home: l.home + 1e-12 } : l)) })), /HOME16 draw 5 at sigma 0 is not its committed home and course scores to the bit/) &&
        bad(at("HOME16", 6, (r) => ({ ...r, levels: r.levels.map((l, i) => (i === 2 ? { ...l, course: null } : l)) })), /HOME16 draw 6 does not hold a home and course score/) && bad(file(1, 2), /HOMEP draw 1 flown a second time is not there once/) &&
        J(N.checkRecords(good, { ...F, predicts: { ...F.predicts, sha256: "0".repeat(64) } })) === J(["the predicts file (brain/flyHomeCoursePredictsRound.jsonl) is not the one committed (sha256 99f2f6cfd0531989...)"]) &&
        J(N.checkRecords(good, { ...F, gradcourse: { ...F.gradcourse, lines: F.gradcourse.lines.filter((r) => !(r.kind === "draw" && r.s === 3)) } })) === J(["the gradcourse file fails its own checks: H16BYC draw 3 is there 0 times (once is registered)"]) &&
        J(N.checkRecords(good, { ...F, predicts: { ...F.predicts, lines: F.predicts.lines.filter((r) => !(r.kind === "walk" && r.set === "HOME16" && r.s === 3)) } })) === J(["the predicts file fails its own checks: the HOME16 walk of draw 3 is there 0 times (once is registered)"]));
    const L = N.lineOf(F.predicts), asLine = N.reading(file(L.b), F), less = N.reading(file(0.2), F), noR = N.reading(good.filter((r) => r.kind !== "recheck"), F), split = N.reading(file(L.b, 1, 1), F), rises = N.reading(file(-0.5), F);
    ok("!! C IS COURSE AT 0.8 AGAINST COURSE AT 0, R8 AND R4 HOME'S FALL LESS THE LINE'S SLOPE x THE COURSE FALL, sign tests over the 48: home falling 1 a unit of course is C WORSE (48 below), R8 and R4 WORSE; falling at the slope R CANNOT; 0.2 a unit R BETTER; at the slope to 0.4 and 1 a unit at 0.8, R4 CANNOT and R8 WORSE; home rising as course falls, C still WORSE (C reads the course, not home)",
        R.C.word === N.WORDS.C[1] && R.C.below === 48 && R.R8.word === N.WORDS.R8[1] && R.R8.below === 48 && R.R4.word === N.WORDS.R4[1] && asLine.R8.word === N.WORDS.R8[2] && asLine.R8.resid.every((x) => Math.abs(x) < 1e-12) &&
        less.R8.word === N.WORDS.R8[0] && less.R4.word === N.WORDS.R4[0] && split.R4.word === N.WORDS.R4[2] && split.R8.word === N.WORDS.R8[1] && rises.C.word === N.WORDS.C[1] && rises.C.below === 48 && rises.R8.word === N.WORDS.R8[0] && /R8 \(home's fall less 0\.4696 x the course fall, against 0\): above 0, below 48/.test(lines) && /AT SIGMA 0\.8 FINDING HOME FALLS FURTHER THAN THE LOST COURSE-HOLDING ACCOUNTS FOR/.test(lines) && noR.C === null && /^A CHECK FAILED/.test(N.readingLines(noR)[0]),
        `along the line: ${asLine.R8.above} above, ${asLine.R8.below} below, ${asLine.R8.ties} ties`);
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, N.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMES", "1"], ["job", "HOMEP", "x"], ["job", "COURSE64", "0"], ["job", "H16BYC", "13"], ["job", "HOMEP"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for the four arms and draws 1 to 12 -- and nothing else", J(N.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(N.parseArgs(["read"])) === J({ cmd: "read" }) && J(N.parseArgs(["job", "COURSE64", "12"])) === J({ cmd: "job", arm: "COURSE64", s: 12 }) && no.every((a) => N.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyHomeCompassNoise.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, flies with the registered audits, only what the file does not hold, HOMEP draw 1 a second time in the same pool",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyHomeCompassNoise\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.flyOne\(args\.arm, args\.s, committedFiles\(\)\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /for \(const arm of PF\.ARMS\) for \(const s of PF\.SEEDS\) if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s, false\]\)/.test(csrc) && /if \(!rechecked\) todo\.splice\(Math\.min\(1, todo\.length\), 0, \["HOMEP", PF\.SEEDS\[0\], true\]\)/.test(csrc) &&
        /again \? \{ kind: "recheck", arm, s, levels: rec\.levels \} : rec/.test(csrc) && /usage: node tools\/ship\/takeFlyHomeCompassNoise\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyHomeCompassNoise-selfcheck.mjs"), calls = [...me.matchAll(/N\.flyOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one fly is flown on 2 lives at home and 1 on the course, not the round's; it starts no process; the file's size and time are what they were",
        J(calls) === J(['"COURSE64", 5, F, TWO, COURSE']) && ![...TWO, ...COURSE].some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before,
        `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyHomeCompassNoise-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
