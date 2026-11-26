// WebGLEngine/tools/ship/flyCompassError-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyCompassError-selfcheck.mjs      (about twenty seconds; IT NEVER RUNS THE ROUND -- its one fly is measured on 2 lives, and it starts no process)
//
// THE GATE OF THE COMPASS-ERROR ROUND (registered in brain/FLY_COMPASS_ERROR_WIP.md before tools/ship/flyCompassError.mjs and tools/ship/takeFlyCompassError.mjs existed): what is the compass
// fly's heading error made of, and would leaning harder on the scene help its homing?
//   1  THE ROUND'S NUMBERS      draws, audits, arms, the gust and gain settings; the compass-noise round's file by its hash, passing its own checks; the registration says the same
//   2  THE MEASURES             the error, the calm and the wind, the gusts (found by the life's own gust clock) and their share left, by hand; the gain; one fly's record by hand
//   3  THE RECORDS              48 flies and a second one; W, L and K1 to K3
//   4  THE COMMAND              it is this round's; no flight of the round's, no process
// SABOTAGE LOG (2026-11-26) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the library's and the note's, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's; every one red by name but ONE, a finding (the number is the rows red):
//   THE MEASURES: E1 the error against the goal 1 | E2 the calm to tick 250 1 | E3 every tick a gust 1 | E4 the share left 20 ticks on 2 | E5 the share left the mean 1 | E6 the gain on the first
//   weight 1 | E7 x4 home flown at the trained gain 1 | E8 the circular sd without the log 1
//   THE ROUND: F1 L against one third 1 | F2 K3 against x4's course 1 | F3 K2 the wind 1 | F4 BETTER and WORSE swapped 1 | F5 the course score not checked 1 | F6 the noise file's own checks
//   skipped 1 | F7 the second fly's x4 not compared 0 -- A FINDING -- then 1 | F8 the round writes the noise round's file 1
//   THE COMMAND: K1 exits 0 on a word it does not know 1 | K2 the job measures on lives of its own 1 | K3 the file's flies not counted as done 1 | K4 the second fly never in the pool 1 | K5 the
//   second fly recorded as a fly 1 | K6 reads without the committed files 1.   THE NOTE: M1 its gain x2 1 | M2 its calm before 250 1 | M3 it drops HOMEP draw 1 again 1
//   THE FINDING: section 3's second fly that fails was of another draw, different in every measure, so the check of its trained measures alone caught it; a second fly differing only in its
//   home at x4 was added, and F7 was run again: 1 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "./flyCompassError.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 1e-12) => Math.abs(a - b) < e;
const TWO = [880101, 880102];
const F = Object.fromEntries(Object.entries(E.FILES).map(([k, f]) => [k, E.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flyCompassError-selfcheck -- the compass-error round (the compass fly's heading error in the calm and the wind, and with the landmark gain x4): the numbers, the measures, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! the compass-noise round's draws, arms and homing audit; the compass round's course audit; a gust 0.05 or more with 39 ticks after it; the gain x4; alpha 0.01; this round's own results file; the compass-noise round's words",
        E.SEEDS === N.SEEDS && E.AUDIT === T.AUDIT && E.COURSE_AUDIT === V.AUDIT && E.ARMS === N.ARMS && E.LAG === 39 && E.GUST_MIN === 0.05 && E.GAIN === 4 && E.ALPHA === 0.01 && E.RESULTS === "brain/flyCompassErrorRound.jsonl" &&
        !Object.values(E.FILES).includes(E.RESULTS) && J(E.parseArgs(["job", "H16BYC", "2"])) === J(N.parseArgs(["job", "H16BYC", "2"])) && CE.CALM === 500);
    ok("!! THE COMPASS-NOISE ROUND'S FILE BY ITS HASH, and the tree has it today, passing its own checks",
        J(E.FILES) === J({ ...N.FILES, noise: N.RESULTS }) && E.NOISE_SHA256 === "89be16c3a54a14d49084f5027925fbe2aab958dc99805d09510c3a6dabf4f74a" && F.noise.sha256 === E.NOISE_SHA256 && N.checkRecords(F.noise.lines, F).length === 0);
    const note = src("brain/FLY_COMPASS_ERROR_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the error each tick; the calm before CALM; a gust and its share left; x4 the third weight times 4; the 48 flies on the compass round's 200 audit lives and home at x4; W, L and K1 to K3; HOMEP draw 1 again",
        /\*\*The error\*\* at tick t: the fly's heading as it believes it/.test(note) && /\*\*The calm\*\* is ticks before CALM \(500\)/.test(note) && /\*\*A gust\*\* is a tick at which the true heading moved by other than the fly's own turn, by 0\.05 radians or more/.test(note) &&
        /\*\*a fly's share left is the median over its gusts\*\*/.test(note) && /\*\*x4 is that weight times 4\*\*/.test(note) && /\*\*W: the wind against the calm\*\*/.test(note) && /\*\*K3: does it cost homing\?\*\*/.test(note) && /\*\*HOMEP draw 1 is flown a second time\.\*\*/.test(note));
});

console.log("\n2. THE MEASURES (by hand)");
section(() => {
    ok("the circular sd is sqrt(-2 ln R): 0 for one angle repeated, sqrt(-2 ln cos 0.1) for two angles 0.2 apart", E.circSd([0.3, 0.3, 0.3]) < 1e-7 && near(E.circSd([0, 0.2]), Math.sqrt(-2 * Math.log(Math.cos(0.1)))));
    const c = N.committedOf("COURSE64", 4, F), w4 = E.gained(c.weights, 4);
    ok("!! THE GAIN: x4 is the third weight (p_c) times 4, the other two as trained, in the fly's float weights", w4[0] === Math.fround(c.weights[0]) && w4[1] === Math.fround(c.weights[1]) && w4[2] === Math.fround(Math.fround(c.weights[2]) * 4) && w4.length === 3 &&
        T.flyOf("HOMEP", 4, w4).rates().c === 4 * T.flyOf("HOMEP", 4, c.weights).rates().c);
    // a life by hand: the gusts found by the life's own gust clock (gustAt starts again when a gust blows), the error each tick, the calm and the wind, the shares left
    const fly = T.flyOf("HOMEP", 4, c.weights), env = new CE.CompassEnv(); let o = env.reset(TWO[0]); const e = [], blown = [], small = [];
    for (let t = 0; t < 1500; t++) { const clockBefore = env.gustAt, th0 = env.th, a = fly.act(o), u = Math.max(-0.2, Math.min(0.2, a[0])); o = env.step(a).obs; const gust = t >= CE.CALM && env.gustAt > clockBefore - 1, g = CE.wrap(env.th - CE.wrap(th0 + u));
        if (gust && Math.abs(g) >= 0.05) blown.push(t); else if (gust) small.push(t); e.push(CE.wrap(fly.phi - env.th)); }
    const sh = blown.filter((t) => t >= 1 && t + 39 < 1500).map((t) => CE.wrap(e[t + 39] - e[t - 1]) / CE.wrap(e[t] - e[t - 1])).sort((a, b) => a - b), med = sh.length % 2 ? sh[sh.length >> 1] : (sh[sh.length / 2 - 1] + sh[sh.length / 2]) / 2;
    const m = E.measure(T.flyOf("HOMEP", 4, c.weights), [TWO[0]]);
    ok("!! THE MEASURES BY HAND ON A LIFE: the error each tick its believed heading less the true one; the calm the ticks before CALM; the gusts the ticks the life's gust clock blew, of 0.05 or more; each gust's share left 39 ticks on; the median; the course score",
        near(m.calm, E.circSd(e.slice(0, 500))) && near(m.wind, E.circSd(e.slice(500))) && m.gusts === sh.length && m.share === med && m.course === env.ret && blown.length > 10, `${blown.length} gusts, ${small.length} under 0.05; share ${med.toFixed(3)}`);
    const r = E.flyOne("COURSE64", 4, F, [TWO[0]], TWO);
    ok("!! A RECORD IS ITS ARM'S COMMITTED FLY MEASURED AS TRAINED AND AT x4 ON THE COURSE LIVES GIVEN, AND HOME AT x4 WITH ITS OWN TALLY ON THE HOMING LIVES GIVEN; as trained its course score is the compass round's audit",
        r.kind === "fly" && r.arm === "COURSE64" && r.s === 4 && r.weightsHash === c.weightsHash && J(r.trained) === J(m) && J({ ...r.x4, home: undefined }) === J({ ...E.measure(T.flyOf("HOMEP", 4, w4), [TWO[0]]), home: undefined }) &&
        r.x4.home === H.homeScore(T.flyOf("HOMEP", 4, w4), TWO) && r.trained.course === V.auditScore(T.flyOf("HOMEP", 4, c.weights), [TWO[0]]), `x4 calm ${r.x4.calm.toFixed(3)} against ${r.trained.calm.toFixed(3)}`);
});

console.log("\n3. THE RECORDS (made here)");
section(() => {
    const m = (calm, wind, share, course) => ({ calm, wind, share, gusts: 100, course });
    const rec = (arm, s, d) => { const c = N.committedOf(arm, s, F); return { kind: "fly", arm, s, weightsHash: c.weightsHash, trained: m(0.3, 0.3 + d.w, 0.5 + d.l, c.course), x4: { ...m(0.3 + d.k2, 0.9, 0.5 + d.l + d.k1, 0.6), home: Math.min(1, Math.max(0, c.home + d.k3)) } }; };
    const file = (d, again = 1) => { const out = []; for (const arm of E.ARMS) for (const s of E.SEEDS) out.push(rec(arm, s, d)); const f = out.find((r) => r.arm === "HOMEP" && r.s === again); out.push({ kind: "recheck", arm: "HOMEP", s: 1, trained: f.trained, x4: f.x4 }); return out; };
    const up = { w: 0.4, l: 0.3, k1: -0.3, k2: 0.6, k3: -0.2 }, good = file(up), R = E.reading(good, F), lines = E.readingLines(R).join("\n"), bad = (recs, re) => E.checkRecords(recs, F).some((x) => re.test(x)), at = (arm, s, g) => good.map((r) => (r.kind === "fly" && r.arm === arm && r.s === s ? g(r) : r));
    ok("!! a file of 48 flies and the second one passes every check; a fly missing, not its committed weights, without a measure, off its committed course score, the second of another draw or with another home at x4, or the compass-noise round's file not committed or failing its checks, each fails by name",
        E.checkRecords(good, F).length === 0 && good.length === 49 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.kind === "fly" && r.arm === "HOME16" && r.s === 9)), /HOME16 draw 9 is there 0 times/) &&
        bad(at("HOMEP", 2, (r) => ({ ...r, weightsHash: "0".repeat(16) })), /HOMEP draw 2 is not its arm's committed weights/) && bad(at("COURSE64", 3, (r) => ({ ...r, x4: { ...r.x4, home: null } })), /COURSE64 draw 3 does not hold its measures/) &&
        bad(at("H16BYC", 5, (r) => ({ ...r, trained: { ...r.trained, gusts: 0 } })), /H16BYC draw 5 does not hold its measures/) && bad(at("HOME16", 6, (r) => ({ ...r, trained: { ...r.trained, course: r.trained.course + 1e-12 } })), /HOME16 draw 6 as trained is not its committed course score to the bit/) &&
        bad(file(up, 2), /HOMEP draw 1 flown a second time is not there once/) && bad(good.map((r) => (r.kind === "recheck" ? { ...r, x4: { ...r.x4, home: r.x4.home + 1e-12 } } : r)), /HOMEP draw 1 flown a second time is not there once/) && J(E.checkRecords(good, { ...F, noise: { ...F.noise, sha256: "0".repeat(64) } })) === J(["the compass-noise round's file is not the one committed (sha256 89be16c3a54a14d4...)"]) &&
        J(E.checkRecords(good, { ...F, noise: { ...F.noise, lines: F.noise.lines.filter((r) => !(r.kind === "fly" && r.arm === "HOMEP" && r.s === 8)) } })) === J(["the compass-noise round's file fails its own checks: HOMEP draw 8 is there 0 times (once is registered)"]));
    const down = E.reading(file({ w: -0.1, l: -0.3, k1: 0.2, k2: -0.1, k3: 0.1 }), F), flat = E.reading(file({ w: 0, l: 0, k1: 0, k2: 0, k3: 0 }), F), noR = E.reading(good.filter((r) => r.kind !== "recheck"), F);
    ok("!! W IS WIND LESS CALM, L THE SHARE LEFT LESS ONE HALF, K1 TO K3 x4 LESS AS TRAINED (share left, calm error, home), sign tests over the 48: each in its own direction comes out so, each the other way the other, each at 0 CANNOT (48 ties)",
        R.W.word === E.WORDS.W[0] && R.L.word === E.WORDS.L[0] && R.K1.word === E.WORDS.K1[1] && R.K2.word === E.WORDS.K2[0] && R.K3.word === E.WORDS.K3[1] && R.K3.below === 48 &&
        down.W.word === E.WORDS.W[1] && down.L.word === E.WORDS.L[1] && down.K1.word === E.WORDS.K1[0] && down.K2.word === E.WORDS.K2[1] && down.K3.word === E.WORDS.K3[0] &&
        ["W", "L", "K1", "K2", "K3"].every((k) => flat[k].ties === 48 && flat[k].word === E.WORDS[k][2]) && /K3: above 0, below 48, ties 0/.test(lines) && noR.W === null && /^A CHECK FAILED/.test(E.readingLines(noR)[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, E.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const csrc = src("tools/ship/takeFlyCompassError.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, measures with the registered audits, only what the file does not hold, HOMEP draw 1 a second time in the same pool",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyCompassError\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.flyOne\(args\.arm, args\.s, committedFiles\(\)\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /for \(const arm of PF\.ARMS\) for \(const s of PF\.SEEDS\) if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s, false\]\)/.test(csrc) && /if \(!rechecked\) todo\.splice\(Math\.min\(1, todo\.length\), 0, \["HOMEP", PF\.SEEDS\[0\], true\]\)/.test(csrc) &&
        /again \? \{ kind: "recheck", arm, s, trained: rec\.trained, x4: rec\.x4 \} : rec/.test(csrc) && /usage: node tools\/ship\/takeFlyCompassError\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyCompassError-selfcheck.mjs"), calls = [...me.matchAll(/E\.flyOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one fly is measured on 1 course life and 2 homing lives, not the round's; it starts no process; the file's size and time are what they were",
        J(calls) === J(['"COURSE64", 4, F, [TWO[0]], TWO']) && !TWO.some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyCompassError-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
