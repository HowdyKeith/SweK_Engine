// WebGLEngine/tools/ship/flyHomeOffset-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyHomeOffset-selfcheck.mjs      (about ten seconds; IT NEVER RUNS THE ROUND -- it flies a handful of lives that are not the round's, and it starts no process)
//
// THE GATE OF THE OFFSET-AGAINST-WOBBLE ROUND (registered in brain/FLY_HOME_OFFSET_WIP.md before tools/ship/flyHomeOffset.mjs and tools/ship/takeFlyHomeOffset.mjs existed): which heading
// error does finding home forgive?
//   1  THE ERRORS               by hand from the life's seed: none, a fixed offset with its sign drawn, an Ornstein-Uhlenbeck wobble; their size and correlation measured
//   2  A LIFE                   a course life and a homing life flown here by hand with the error; the fly is the compass round's with vision off
//   3  THE ROUND'S NUMBERS      the arms, the size, the correlation time, the audit; the registration says the same
//   4  THE RECORDS              three arms; O, W, X, Y
//   5  THE COMMAND              it is this round's; no life of the round's, no process
//   6  THE VERDICT              the results file as committed unread at 1b43f9ea, read from the file: the checks, O, W, X, Y, the arms, lives flown again, the costs measured
//                               after the reading (said as not registered), the expectations, the note's result
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 18, this gate,
// tools/ship/flyMushroomRecover-selfcheck.mjs and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the commands' 6; every one red by name, NONE 0 red:
//   THE ROUND: O1 the offset is 10 degrees 2 | O2 the wobble's correlation time 200 2 | O3 the error from the life's own seed 2 | O4 the offset always + 1 | O5 the wobble starts at 0 1 |
//   O6 the wobble's step not scaled 1 | O7 vision on 2 | O8 the homing life without the home vector 1 | O9 O's costs the other way round 2 | O10 X compares the course 1 | O11 the audit on
//   the homing round's lives 1 | O12 BETTER and WORSE swapped 2 | O13 the recheck is of WOBBLE 3 | O14 the error set after the act 1.  THE NOTE: N1 its offset 30 degrees 1 | N2 its
//   correlation time 100 1 | N3 its audit from 70000001 1 | N4 its X on the course 1
//   THE COMMAND: C1 offset's second flight is of TOLD 1 | C2 exits 0 on a word it does not know 1 | C3 reads the homing round's library 1 (and the recovery round's command's three, below)
//   ONE ROW OF MINE WAS TOO TIGHT WHEN FIRST RUN: the wobble's correlation 50 ticks apart came out 0.301 on 40,000 ticks against a window from 0.30; the stream is now 200,000 ticks, the
//   one-tick correlation (exp(-1/50) = 0.9802) is checked to 0.002, and the 50-tick window is three standard errors (0.32 to 0.42).
// THE VERDICT'S SABOTAGES (2026-11-18, after the reading, the same runner, this gate alone): V1 a WOBBLE life's home score changed in a digit the double holds 2 | V2 X compares the course 4 |
//   V3 BETTER and WORSE swapped 7 | V4 O's costs the other way round 5 | V5 the note's O says the other way 1 | V6 the note's expectation of Y is BETTER 1 | V7 the note names another commit 1 |
//   V8 the note says homing forgives a wobble 1 | V9 the note drops what it does not mean 1 | V10 the note's homing cost 0.1602 1 | V11 a TOLD life's course score changed in a digit the
//   double holds 1 (the file's hash: the lives flown again are WOBBLE's and OFFSET's). V10 WENT 0 RED FIRST, A FINDING: the result row read the offset's costs and not the wobble's; it
//   reads both now, and V10 was run again (1 red). TWO NUMBERS OF MINE WERE WRONG WHEN FIRST RUN: the course costs are 0.0539 and 0.0514, not the 0.0540 and 0.0515 that rounded means give.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as P from "./flyHomeOffset.mjs";
import * as V from "./flyCompass.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import * as HE from "../../brain/rl/homeEnv.mjs";
import * as HF from "../../brain/rl/homingFly.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, D = Math.PI / 180;
const g = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

console.log("flyHomeOffset-selfcheck -- the offset-against-wobble round (a fly told its heading with a fixed offset, or a wandering error of the same size, on holding a course and finding home): the errors, a life, the numbers, the records, the command\n");

console.log("1. THE ERRORS (by hand from the life's seed plus 777)");
section(() => {
    const take = (f, n) => Array.from({ length: n }, () => f());
    const off = (seed) => { const r = CE.stream(seed + 777); return (r() < 0.5 ? 1 : -1) * 20 * D; }, wob = (seed, n) => { const r = CE.stream(seed + 777), a = Math.exp(-1 / 50), k = Math.sqrt(1 - a * a) * 20 * D; let e = g(r) * 20 * D; return take(() => (e = a * e + k * g(r)), n); };
    ok("!! TOLD's error is 0 every tick; OFFSET's is 20 degrees every tick with its sign the first draw of the life's error stream; WOBBLE's is e <- a e + sqrt(1 - a^2) 20 degrees x a normal draw, a = exp(-1/50), started at 20 degrees x a normal draw -- the module's, to the bit",
        take(P.errorStream("TOLD", 5), 9).every((x) => x === 0) && [11, 12, 13, 14].every((s) => J(take(P.errorStream("OFFSET", s), 9)) === J(Array(9).fill(off(s)))) && [11, 12].every((s) => J(take(P.errorStream("WOBBLE", s), 300)) === J(wob(s, 300))) && throws(() => P.errorStream("BOTH", 1), /no arm BOTH/));
    const w = wob(4242, 200000), m = w.reduce((a, b) => a + b, 0) / w.length, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length), acAt = (L) => w.slice(L).reduce((a, x, i) => a + (x - m) * (w[i] - m), 0) / (w.length - L) / sd ** 2, ac = acAt(50), ac1 = acAt(1);
    const signs = P.AUDIT.map((s) => Math.sign(P.errorStream("OFFSET", s)()));
    ok("!! THE WOBBLE IS 20 DEGREES ACROSS 200,000 TICKS (19 to 21), ITS CORRELATION ONE TICK APART exp(-1/50) = 0.9802 (0.978 to 0.982) AND 50 TICKS APART ABOUT 1/e (0.32 to 0.42: three standard errors, which is about 0.016 at this length); OFFSET's sign is + on 80 to 120 of the 200 audit lives", sd / D > 19 && sd / D < 21 && ac1 > 0.978 && ac1 < 0.982 && ac > 0.32 && ac < 0.42 && signs.filter((x) => x > 0).length >= 80 && signs.filter((x) => x > 0).length <= 120 && signs.every((x) => x !== 0),
        `sd ${(sd / D).toFixed(2)} degrees, correlation at 1 ${ac1.toFixed(4)} and at 50 ${ac.toFixed(3)}, + on ${signs.filter((x) => x > 0).length}`);
});

console.log("\n2. A LIFE (flown here by hand)");
section(() => {
    const course = (arm, seed) => { const f = V.policyOf("FROZEN", 1).setParams([0]), env = new CE.CompassEnv(), err = P.errorStream(arm, seed); let o = env.reset(seed), done = false; while (!done) { f.phi = env.th + err(); const r = env.step(f.act(o)); o = r.obs; done = r.done; } return env.ret; };
    const home = (arm, seed) => { const f = V.policyOf("FROZEN", 1).setParams([0]), env = new CE.CompassEnv(), err = P.errorStream(arm, seed); let o = env.reset(seed), x = 0, y = 0, hx = 0, hy = 0, out = 0, closest = Infinity, done = false;
        while (!done) { f.phi = env.th + err(); const seen = Float64Array.from(o); if (o[CE.CLOCK] >= 1000) seen[CE.GOAL] = Math.atan2(-hy, -hx); const a = f.act(seen); hx += Math.cos(f.phi); hy += Math.sin(f.phi); const r = env.step(a); x += Math.cos(env.th); y += Math.sin(env.th); const d = Math.hypot(x, y); if (env.t === 1000) out = d; else if (env.t > 1000) closest = Math.min(closest, d); o = r.obs; done = r.done; }
        return Math.max(0, 1 - closest / out); };
    const seeds = [880001, 880002], got = P.ARMS.map((a) => seeds.map((s) => P.lifeScores(a, s)));
    ok("!! A LIFE BY HAND: the compass life's return with the believed heading set to the true heading plus the error before each tick, and a homing life with a home vector summed here, are the module's, for all three arms on two lives",
        P.ARMS.every((a, i) => seeds.every((s, j) => near(got[i][j].course, course(a, s), 1e-12) && near(got[i][j].home, home(a, s), 1e-12))));
    const f = P.flyOf();
    ok("the fly is the compass round's FROZEN fly with p_c 0 (vision off: its heading moves only by its own turns); a record holds an arm's course and home scores for every life given, in order",
        J(Array.from(f.getParams())) === J([0]) && f.plastic === false && J(P.armRecord("OFFSET", seeds)) === J({ kind: "arm", arm: "OFFSET", lives: 2, course: got[1].map((x) => x.course), home: got[1].map((x) => x.home) }));
});

console.log("\n3. THE ROUND'S NUMBERS");
section(() => {
    const lives = new Set(); let clash = 0; const add = (x) => { if (lives.has(x)) clash++; lives.add(x); };
    P.AUDIT.forEach(add); V.AUDIT.forEach(add); for (let k = 0; k < 200; k++) add(50000001 + 7919 * k); for (let k = 0; k < 100; k++) add(30000001 + 7919 * k); for (let k = 0; k < 400; k++) add(20000001 + 7919 * k);
    ok("!! the arms TOLD, OFFSET and WOBBLE, the lead OFFSET; 20 degrees; 50 ticks; the error stream at the life's seed plus 777; 200 audit lives 60000001 + 7919 k, none the compass or homing rounds' audit lives nor a scoping life; alpha 0.01; this round's results file",
        J(P.ARMS) === J(["TOLD", "OFFSET", "WOBBLE"]) && P.LEAD === "OFFSET" && near(P.SIZE, 20 * D, 1e-15) && P.TAU === 50 && P.ERR_SEED_ADD === 777 && P.AUDIT.length === 200 && P.AUDIT[0] === 60000001 && P.AUDIT[199] === 60000001 + 7919 * 199 && clash === 0 && lives.size === 1100 && P.ALPHA === 0.01 && P.RESULTS === "brain/flyHomeOffsetRound.jsonl");
    const note = src("brain/FLY_HOME_OFFSET_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the three arms, 20 degrees, 50 ticks, the seed plus 777, 200 audit lives 60000001 + 7919 k, the fly with vision off; O, W, X, Y as sign tests over the lives; OFFSET flown a second time",
        /the true heading \*\*plus 20 degrees\*\*, the sign drawn for the life/.test(note) && /standard deviation \*\*20 degrees\*\* and correlation time \*\*50 ticks\*\*/.test(note) && /the life's seed plus 777/.test(note) && /\*\*200 audit lives, seeds 60000001 \+ 7919 k\*\*/.test(note) && /with p_c 0: vision off/.test(note) &&
        /\*\*O: for OFFSET, the course cost against the home cost\*\*/.test(note) && /\*\*W: for WOBBLE, the home cost against the course cost\*\*/.test(note) && /\*\*X: OFFSET's home score against WOBBLE's\*\*/.test(note) && /\*\*Y: OFFSET's course score against WOBBLE's\*\*/.test(note) && /\*\*OFFSET is flown a second time\.\*\*/.test(note) && /alpha 0\.01, exact two-sided sign tests over the 200 lives, ties against the claim/.test(note));
});

console.log("\n4. THE RECORDS (made here)");
section(() => {
    const n = 200, mk = (arm, c, h) => ({ kind: "arm", arm, lives: n, course: Array.from({ length: n }, (_, i) => c(i)), home: Array.from({ length: n }, (_, i) => h(i)) });
    // TOLD 0.9 / 0.99; OFFSET costs the course 0.05 and home a hair; WOBBLE costs the course 0.05 +- a hair alternating and home 0.3
    const T = mk("TOLD", (i) => 0.9 - i * 1e-4, (i) => 0.99), O = mk("OFFSET", (i) => 0.85 - i * 1e-4, (i) => 0.99 - 1e-4), W = mk("WOBBLE", (i) => 0.85 - i * 1e-4 + (i % 2 ? 1e-5 : -1e-5), (i) => 0.69);
    const good = [T, O, W, P.recheckOf(O)], R = P.reading(good), lines = P.readingLines(R).join("\n");
    ok("!! three arms of 200 lives with OFFSET flown twice passes every check; an arm missing, an arm twice, a life too few, a home score above 1, and a second flight that differs each fail by name",
        P.checkRecords(good).length === 0 && /^the checks hold/.test(lines) && P.checkRecords([T, O, P.recheckOf(O)]).some((x) => /WOBBLE is there 0 times/.test(x)) && P.checkRecords([...good, T]).some((x) => /TOLD is there 2 times/.test(x)) &&
        P.checkRecords([T, { ...O, home: O.home.slice(1) }, W, P.recheckOf(O)]).some((x) => /OFFSET does not hold 200 lives of each kind/.test(x)) && P.checkRecords([T, O, { ...W, home: W.home.map((x, i) => (i === 7 ? 1.01 : x)) }, P.recheckOf(O)]).some((x) => /WOBBLE's scores are not/.test(x)) &&
        J(P.checkRecords([T, O, W, { ...P.recheckOf(O), hash: "0".repeat(16) }])) === J(["OFFSET flown a second time is not there once with the same scores"]));
    ok("!! O IS OFFSET'S COURSE COST LESS ITS HOME COST, W WOBBLE'S HOME COST LESS ITS COURSE COST, X OFFSET'S HOME AGAINST WOBBLE'S, Y OFFSET'S COURSE AGAINST WOBBLE'S, LIFE FOR LIFE: here O BETTER (200 above), W BETTER, X BETTER, Y CANNOT (100 and 100)",
        R.O.word === P.WORDS.O[0] && R.O.above === 200 && R.W.word === P.WORDS.W[0] && R.W.above === 200 && R.X.word === P.WORDS.X[0] && R.X.above === 200 && R.Y.word === P.WORDS.Y[2] && R.Y.above === 100 && R.Y.below === 100 && near(R.arms.WOBBLE.home, 0.69, 1e-12) && /AN OFFSET COSTS HOLDING A COURSE MORE THAN FINDING HOME/.test(lines) && /Y: above 100, below 100, ties 0 of 200/.test(lines));
    const flip = P.reading([T, mk("OFFSET", (i) => 0.89 - i * 1e-4, (i) => 0.80), W, P.recheckOf(mk("OFFSET", (i) => 0.89 - i * 1e-4, (i) => 0.80))]), tied = P.reading([T, O, mk("WOBBLE", (i) => 0.85 - i * 1e-4, (i) => 0.69), P.recheckOf(O)]), bad = P.reading([T, O, P.recheckOf(O)]);
    ok("an offset that costs homing more than the course is O WORSE; equal course scores life for life are 200 ties and Y CANNOT (ties count against the claim); with a failed check no reading is weighed and the first line says so",
        flip.O.word === P.WORDS.O[1] && flip.O.below === 200 && tied.Y.ties === 200 && tied.Y.word === P.WORDS.Y[2] && bad.O === null && bad.Y === null && /^A CHECK FAILED/.test(P.readingLines(bad)[0]));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, P.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job"], ["job", "BOTH"], ["job", "OFFSET", "1"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM for the three arms -- and nothing else", J(P.parseArgs(["run"])) === J({ cmd: "run", jobs: 3 }) && J(P.parseArgs(["read"])) === J({ cmd: "read" }) && J(P.parseArgs(["job", "WOBBLE"])) === J({ cmd: "job", arm: "WOBBLE" }) && no.every((a) => P.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyHomeOffset.mjs");
    ok("!! the command is this round's -- its library and results file -- reads its words through parseArgs alone, refuses a run of no processes itself, flies only the arms the file does not hold, and flies OFFSET a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyHomeOffset\.mjs"/.test(csrc) && /PF\.armRecord\(args\.arm\)/.test(csrc) &&
        /const todo = PF\.ARMS\.filter\(\(a\) => !done\.has\(a\)\);/.test(csrc) && /await jobOnce\(PF\.LEAD\)/.test(csrc) && /PF\.recheckOf\(r\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyHomeOffset\.mjs run \[--jobs N\] \| read \| job ARM/.test(csrc));
    const me = src("tools/ship/flyHomeOffset-selfcheck.mjs"), calls = [...me.matchAll(/P\.armRecord\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE FLIES NO LIFE OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one arm record is of 2 lives that are not the round's; it starts no process; the file's size and time are what they were",
        calls.length === 1 && /^"OFFSET", seeds$/.test(calls[0]) && !P.AUDIT.includes(880001) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (the whole results file was committed at 1b43f9ea before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, P.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = P.reading(lines), A = R.arms, rec = (a) => lines.find((r) => r.kind === "arm" && r.arm === a);
    const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length, cost = (a, k) => mean(rec("TOLD")[k].map((x, i) => x - rec(a)[k][i]));
    ok("!! the results file is the one the run wrote: 4 records, sha256 f2ef4ddc62469ee7... (one start, 2.6 minutes on two processes)", lines.length === 4 && createHash("sha256").update(bytes).digest("hex") === "f2ef4ddc62469ee713dcb2055479071282658dbe651b738a39ec8803cce1b052");
    ok("!! THE CHECKS HOLD: each arm once with 200 lives of each kind, every score in range, OFFSET flown a second time the same", R.checks.length === 0 && lines.find((r) => r.kind === "recheck").hash === P.recheckOf(rec("OFFSET")).hash);
    ok("!! *** O: AN OFFSET COSTS HOLDING A COURSE MORE THAN FINDING HOME *** -- on all 200 lives (p 1.2e-60)", R.O.word === P.WORDS.O[0] && R.O.above === 200 && R.O.below === 0 && R.O.p < 1e-59);
    ok("!! *** W: A WOBBLE COSTS FINDING HOME MORE THAN HOLDING A COURSE *** -- on 169 of the 200 lives, 31 the other way (p 3.4e-24)", R.W.word === P.WORDS.W[0] && R.W.above === 169 && R.W.below === 31 && near(R.W.p, 3.413e-24, 1e-27));
    ok("!! *** X: WITH AN OFFSET THE FLY FINDS HOME BETTER THAN WITH A WOBBLE OF THE SAME SIZE *** -- on 197 of 200 lives (p 1.7e-54); Y: AT HOLDING A COURSE THEY CANNOT BE TOLD APART (82 above, 118 below, p 0.013)",
        R.X.word === P.WORDS.X[0] && R.X.above === 197 && R.X.below === 3 && R.Y.word === P.WORDS.Y[2] && R.Y.above === 82 && R.Y.below === 118 && near(R.Y.p, 0.01313, 5e-5));
    ok("!! the arms (course | home, the mean of 200 lives): TOLD 0.9046 | 0.9958, OFFSET 0.8506 | 0.9962, WOBBLE 0.8531 | 0.7356",
        near(A.TOLD.course, 0.9046) && near(A.TOLD.home, 0.9958) && near(A.OFFSET.course, 0.8506) && near(A.OFFSET.home, 0.9962) && near(A.WOBBLE.course, 0.8531) && near(A.WOBBLE.home, 0.7356));
    const again = [0, 99, 199].map((i) => P.lifeScores("WOBBLE", P.AUDIT[i])), againO = P.lifeScores("OFFSET", P.AUDIT[42]);
    ok("!! FLOWN AGAIN AFTER THE READING: WOBBLE's lives 1, 100 and 200 and OFFSET's life 43 give their course and home scores again to the bit",
        again.every((s, j) => s.course === rec("WOBBLE").course[[0, 99, 199][j]] && s.home === rec("WOBBLE").home[[0, 99, 199][j]]) && againO.course === rec("OFFSET").course[42] && againO.home === rec("OFFSET").home[42]);
    ok("!! MEASURED AFTER THE READING, NOT REGISTERED -- THE COSTS: the offset costs the course 0.0539 and homing nothing (TOLD less OFFSET at home is -0.0004: the offset fly came home a hair better); the wobble costs the course 0.0514 and homing 0.2602",
        near(cost("OFFSET", "course"), 0.0539) && near(cost("OFFSET", "home"), -0.0004) && near(cost("WOBBLE", "course"), 0.0514) && near(cost("WOBBLE", "home"), 0.2602), `${cost("OFFSET", "course").toFixed(4)} ${cost("OFFSET", "home").toFixed(4)} ${cost("WOBBLE", "course").toFixed(4)} ${cost("WOBBLE", "home").toFixed(4)}`);
    const note = src("brain/FLY_HOME_OFFSET_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 9. The result"));
    ok("the expectations, written before the code, against what came -- every one: O BETTER (95), W BETTER (95), X BETTER (97), Y CANNOT (55)",
        /O \*\*BETTER about 95 percent\*\*\. W \*\*BETTER about 95\*\*\. X \*\*BETTER about 97\*\*\. Y CANNOT about 55, WORSE 25, BETTER 20/.test(flat) && R.O.word === P.WORDS.O[0] && R.W.word === P.WORDS.W[0] && R.X.word === P.WORDS.X[0] && R.Y.word === P.WORDS.Y[2]);
    ok("the registration's RESULT SECTION (section 9) carries the four readings' words, the commit the file was read at, that every expectation came, what section 4 said such a reading would say, the measurement after the reading said as such, and what it does not mean",
        /## 9\. The result/.test(note) && ["O", "W", "X", "Y"].every((t) => res.includes(`**${t}: ${R[t].word}**`)) && /1b43f9ea/.test(res) && /Every expectation came/.test(res) && /finding home with a home vector kept in the fly's own heading forgives an offset and not a wobble/.test(res) &&
        /Measured after the reading \(not registered; the gate recomputes it\)/.test(res) && /costs the course 0\.0539 and homing nothing/.test(res) && /The wobble costs the course 0\.0514 and homing 0\.2602/.test(res) && /What it does not mean/.test(res) && /only that offsets are the kind of error homing forgives/.test(res));
});

console.log(`\nflyHomeOffset-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
