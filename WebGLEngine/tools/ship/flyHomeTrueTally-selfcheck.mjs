// WebGLEngine/tools/ship/flyHomeTrueTally-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyHomeTrueTally-selfcheck.mjs      (about twenty seconds; IT NEVER RUNS THE ROUND -- its one fly is flown on 2 lives, and it starts no process)
//
// THE GATE OF THE PERFECT-TALLY ROUND (registered in brain/FLY_HOME_TRUE_TALLY_WIP.md before tools/ship/flyHomeTrueTally.mjs and tools/ship/takeFlyHomeTrueTally.mjs existed): with the true way
// home shown in place of its tally, how much better does the homing fly come home, and how much of the noise's cost goes?
//   1  THE ROUND'S NUMBERS      draws, audit, levels, arms; the compass-noise round's file by its hash, passing its own checks; the registration says the same
//   2  THE PERFECT TALLY        the homing fly's life to the turn for home, then the true way home shown and nothing else changed; one fly flown by hand
//   3  THE RECORDS              48 flies and a second one; T0 and T8
//   4  THE COMMAND              it is this round's; no flight of the round's, no process
// SABOTAGE LOG (2026-11-26) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the library's and the note's, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's; every one red by name (the number is the rows red):
//   THE ROUND: G1 the way home shown backwards 1 | G2 the way home shown a tick late 1 | G3 sigma 0.2 for 0.4 3 | G4 the compass not jittered 1 | G5 T0 against the own tally at 0.4 1 | G6 T8
//   without the own tally's fall 1 | G7 BETTER and WORSE swapped 1 | G8 the noise file's own checks skipped 1 | G9 the weights not checked 1 | G10 the second fly's scores not compared 1 | G11
//   the round writes the noise round's file 1 | G12 the noise file's hash another 3
//   THE COMMAND: K1 exits 0 on a word it does not know 1 | K2 the job flies on lives of its own 1 | K3 the file's flies not counted as done 1 | K4 the second fly never in the pool 1 | K5 the
//   second fly recorded as a fly 1 | K6 reads without the committed files 1.   THE NOTE: M1 it shows the way home from the start 1 | M2 its levels 0, 0.2, 0.8 1 (first skipped: its text spans
//   a line of the note; run again on one line) | M3 it drops HOMEP draw 1 again 1
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Q from "./flyHomeTrueTally.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import { HOME_AT } from "../../brain/rl/homeEnv.mjs";
import { HomingFly } from "../../brain/rl/homingFly.mjs";
import { NoisyHomeEnv } from "../../brain/rl/noisyCompassEnv.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const TWO = [880091, 880092];
const F = Object.fromEntries(Object.entries(Q.FILES).map(([k, f]) => [k, Q.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flyHomeTrueTally-selfcheck -- the perfect-tally round (the true way home shown in place of the tally, steering on the fly's own compass): the numbers, the tally, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! the compass-noise round's draws, audit and arms; sigma 0, 0.4 and 0.8; alpha 0.01; this round's own results file; its words those of the compass-noise round's command",
        Q.SEEDS === N.SEEDS && Q.AUDIT === N.AUDIT && Q.AUDIT === T.AUDIT && Q.ARMS === N.ARMS && J(Q.SIGMAS) === J([0, 0.4, 0.8]) && Q.SIGMAS.every((s) => N.SIGMAS.includes(s)) && Q.ALPHA === 0.01 &&
        Q.RESULTS === "brain/flyHomeTrueTallyRound.jsonl" && !Object.values(Q.FILES).includes(Q.RESULTS) && J(Q.parseArgs(["job", "HOME16", "3"])) === J(N.parseArgs(["job", "HOME16", "3"])));
    ok("!! THE COMPASS-NOISE ROUND'S FILE BY ITS HASH, and the tree has it today, passing its own checks (and through them every file it rests on)",
        J(Q.FILES) === J({ ...N.FILES, noise: N.RESULTS }) && Q.NOISE_SHA256 === "89be16c3a54a14d49084f5027925fbe2aab958dc99805d09510c3a6dabf4f74a" && F.noise.sha256 === Q.NOISE_SHA256 && N.checkRecords(F.noise.lines, F).length === 0);
    const note = src("brain/FLY_HOME_TRUE_TALLY_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the true way home shown from the turn for home, everything else the homing fly's; the course and own-tally scores the compass-noise round's; the 48 flies at sigma 0, 0.4 and 0.8; T0 and T8; HOMEP draw 1 again",
        /\*\*From the tick the fly turns for home, the goal it is shown is the true way home\*\*/.test(note) && /\*\*Everything else is the homing fly's\*\*/.test(note) && /\*\*each fly's course scores are the compass-noise round's, as committed\*\*/.test(note) &&
        /\*\*each flown home with the perfect tally at sigma 0, 0\.4 and 0\.8\*\*/.test(note) && /\*\*T0: at sigma 0, the perfect tally against the fly's own\*\*/.test(note) && /\*\*T8: at sigma 0\.8, does the perfect tally fall less\?\*\*/.test(note) && /\*\*HOMEP draw 1 is flown a second time\.\*\*/.test(note));
});

console.log("\n2. THE PERFECT TALLY (HOME16 draw 5, by hand)");
section(() => {
    const c = N.committedOf("HOME16", 5, F), fly = () => T.flyOf("HOMEP", 5, c.weights), seed = TWO[0];
    // the same life twice, tick for tick: the homing fly with its tally, and the fly with the true way home; before the turn they are the same fly seeing the same, after it only the goal differs
    const e1 = new NoisyHomeEnv(0.4), e2 = new NoisyHomeEnv(0.4), h = new HomingFly(fly()), g = fly(); let o1 = e1.reset(seed), o2 = e2.reset(seed), before = true, after = true, n = 0;
    for (let t = 0; t < 1500; t++) {
        let seen = o2; if (o2[CE.CLOCK] >= HOME_AT) { seen = Float64Array.from(o2); seen[CE.GOAL] = Math.atan2(-e2.y, -e2.x); n++; }
        if (t < HOME_AT) before = before && J(Array.from(o1)) === J(Array.from(o2)) && e1.x === e2.x; else if (t === HOME_AT) after = Array.from(seen).every((v, i) => i === CE.GOAL || v === o2[i]) && seen[CE.GOAL] === Math.atan2(-e2.y, -e2.x);
        o1 = e1.step(h.act(o1)).obs; o2 = e2.step(g.act(seen)).obs;
    }
    ok("!! TO THE TURN FOR HOME THE PERFECT-TALLY FLY IS THE HOMING FLY TO THE BIT (every observation and position); FROM IT, ONLY THE GOAL DIFFERS, the bearing from the true position to the door, every tick to the end", before && after && n === 500);
    const tt = (sg) => { const e = new NoisyHomeEnv(sg), f = fly(); let sum = 0; for (const sd of TWO) { let o = e.reset(sd), d = false; while (!d) { let s2 = o; if (o[CE.CLOCK] >= HOME_AT) { s2 = Float64Array.from(o); s2[CE.GOAL] = Math.atan2(-e.y, -e.x); } const r = e.step(f.act(s2)); o = r.obs; d = r.done; } sum += e.score(); } return sum / TWO.length; };
    const r = Q.flyOne("HOME16", 5, F, TWO);
    ok("!! A RECORD IS ITS ARM'S COMMITTED FLY FLOWN HOME WITH THE PERFECT TALLY AT EACH SIGMA, by hand; trueHome is that flight", r.kind === "fly" && r.arm === "HOME16" && r.s === 5 && r.weightsHash === c.weightsHash && J(r.levels) === J(Q.SIGMAS.map((sg) => ({ sigma: sg, home: tt(sg) }))) && Q.trueHome(fly(), TWO, 0.8) === tt(0.8),
        r.levels.map((l) => `${l.sigma}: ${l.home.toFixed(3)}`).join(" "));
});

console.log("\n3. THE RECORDS (made here; the own-tally scores the compass-noise round's)");
section(() => {
    const own = (arm, s) => F.noise.lines.find((r) => r.kind === "fly" && r.arm === arm && r.s === s), lv = (r, sg) => r.levels.find((l) => l.sigma === sg).home;
    // the perfect tally gains g at sigma 0 and falls k times as far as the own tally did
    const rec = (arm, s, g, k) => { const o = own(arm, s), f8 = lv(o, 0.8) - lv(o, 0), f4 = lv(o, 0.4) - lv(o, 0), h0 = Math.min(1, lv(o, 0) + g); return { kind: "fly", arm, s, weightsHash: o.weightsHash, levels: [{ sigma: 0, home: h0 }, { sigma: 0.4, home: Math.max(0, h0 + k * f4) }, { sigma: 0.8, home: Math.max(0, h0 + k * f8) }] }; };
    const file = (g, k, again = 1) => { const out = []; for (const arm of Q.ARMS) for (const s of Q.SEEDS) out.push(rec(arm, s, g, k)); out.push({ kind: "recheck", arm: "HOMEP", s: 1, levels: out.find((r) => r.arm === "HOMEP" && r.s === again).levels }); return out; };
    const good = file(0.3, 0.5), R = Q.reading(good, F), lines = Q.readingLines(R).join("\n"), bad = (recs, re) => Q.checkRecords(recs, F).some((x) => re.test(x)), at = (arm, s, g) => good.map((r) => (r.kind === "fly" && r.arm === arm && r.s === s ? g(r) : r));
    ok("!! a file of 48 flies and the second one passes every check; a fly missing, not its committed weights, at other sigmas, with no score, the second of another draw, or the compass-noise round's file not committed or failing its checks, each fails by name",
        Q.checkRecords(good, F).length === 0 && good.length === 49 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.kind === "fly" && r.arm === "COURSE64" && r.s === 4)), /COURSE64 draw 4 is there 0 times/) &&
        bad(at("HOMEP", 2, (r) => ({ ...r, weightsHash: "0".repeat(16) })), /HOMEP draw 2 is not its arm's committed weights/) && bad(at("HOME16", 3, (r) => ({ ...r, levels: r.levels.map((l, i) => (i === 1 ? { ...l, sigma: 0.2 } : l)) })), /HOME16 draw 3 does not hold a home score at each of sigma 0, 0.4, 0.8/) &&
        bad(at("H16BYC", 5, (r) => ({ ...r, levels: r.levels.map((l, i) => (i === 2 ? { ...l, home: null } : l)) })), /H16BYC draw 5 does not hold a home score/) && bad(file(0.3, 0.5, 2), /HOMEP draw 1 flown a second time is not there once/) &&
        J(Q.checkRecords(good, { ...F, noise: { ...F.noise, sha256: "0".repeat(64) } })) === J(["the compass-noise round's file is not the one committed (sha256 89be16c3a54a14d4...)"]) &&
        J(Q.checkRecords(good, { ...F, noise: { ...F.noise, lines: F.noise.lines.filter((r) => !(r.kind === "fly" && r.arm === "HOME16" && r.s === 7)) } })) === J(["the compass-noise round's file fails its own checks: HOME16 draw 7 is there 0 times (once is registered)"]));
    const worse = Q.reading(file(-0.05, 2), F), same0 = Q.reading(file(0, 1), F), noR = Q.reading(good.filter((r) => r.kind !== "recheck"), F);
    ok("!! T0 IS THE PERFECT TALLY LESS THE FLY'S OWN AT SIGMA 0, T8 ITS FALL TO 0.8 LESS THE OWN TALLY'S, sign tests over the 48: gaining 0.3 and falling half as far is T0 and T8 BETTER; losing 0.05 and falling twice as far is both WORSE; the same as its own is both CANNOT (48 ties)",
        R.T0.word === Q.WORDS.T0[0] && R.T0.above === 48 && R.T8.word === Q.WORDS.T8[0] && R.T8.above === 48 && worse.T0.word === Q.WORDS.T0[1] && worse.T8.word === Q.WORDS.T8[1] && worse.T8.below === 48 &&
        same0.T0.word === Q.WORDS.T0[2] && same0.T0.ties === 48 && same0.T8.word === Q.WORDS.T8[2] && /T0 \(perfect tally less own, at sigma 0\): above 48, below 0, ties 0/.test(lines) && /WITH A PERFECT TALLY THE FLY FINDS HOME BETTER THAN WITH ITS OWN/.test(lines) && noR.T0 === null && /^A CHECK FAILED/.test(Q.readingLines(noR)[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, Q.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const csrc = src("tools/ship/takeFlyHomeTrueTally.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, flies with the registered audit, only what the file does not hold, HOMEP draw 1 a second time in the same pool",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyHomeTrueTally\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.flyOne\(args\.arm, args\.s, committedFiles\(\)\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /for \(const arm of PF\.ARMS\) for \(const s of PF\.SEEDS\) if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s, false\]\)/.test(csrc) && /if \(!rechecked\) todo\.splice\(Math\.min\(1, todo\.length\), 0, \["HOMEP", PF\.SEEDS\[0\], true\]\)/.test(csrc) &&
        /again \? \{ kind: "recheck", arm, s, levels: rec\.levels \} : rec/.test(csrc) && /usage: node tools\/ship\/takeFlyHomeTrueTally\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyHomeTrueTally-selfcheck.mjs"), calls = [...me.matchAll(/Q\.flyOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one fly is flown on 2 lives not the round's; it starts no process; the file's size and time are what they were",
        J(calls) === J(['"HOME16", 5, F, TWO']) && !TWO.some((x) => T.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyHomeTrueTally-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
