// WebGLEngine/tools/ship/flyTallyShare-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyTallyShare-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its flies are flown on 2 lives of its own, and it starts no process)
//
// THE GATE OF THE TALLY-SHARE ROUND (registered in brain/FLY_TALLY_SHARE_WIP.md before tools/ship/flyTallyShare.mjs and tools/ship/takeFlyTallyShare.mjs existed): does the fly's own
// tally keep a fixed share of the perfect tally's home in both scenes, tested on 200 fresh lives?
//
//   1  THE ROUND'S NUMBERS      the flies, the fresh lives (none an old audit life), the margin, alpha; the scene-tally round's file by its hash, passing its own checks; the registration says the same
//   2  THE FLYING               the four ways are the four committed rounds' scorers, each another number; a fly is its arm's committed weights; the reproduction flies the OLD audit lives
//   3  THE RECORDS              48 flies, a reproduction and a second flight, made here; EQ (both one-sided tests), D, and the broken sets
//   4  THE COMMAND              it is this round's; no flight of the round's, no process
// SABOTAGE LOG (2026-11-28) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone; the number is the rows red:
//   S1 own plain at sigma 0.4 1 | S2 own 26-type in the plain scene 2 | S3 perfect 26-type in the plain scene 3 | S4 the fresh lives the old audit 3 | S5 the margin 0.05 3 |
//   S6 the upper side at twice the margin 2 | S7 ties counted FOR the claim below 0 -- A FINDING: the made tie was not exactly 0.02 in floating point; the row now gives ties exactly,
//   and S7b (that sabotage again) 1, S7c (ties for the claim above) 1 | S8 d as a difference of homes, not of shares 4 | S9 the reproduction not compared 1 | S10 the weights not checked 1 |
//   S11 the reproduction on the fresh lives 1 | S12 EQUIVALENT on either side alone 2 | S13 the scene-tally file's own checks skipped 1 | S14 the command never reproduces 1 |
//   S15 the second flight's four numbers not kept 1 | M1 an expectation moved 1 -- all red but S7, which is repaired and red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as E from "./flyTallyShare.mjs";
import * as TS from "./flySceneTally.mjs";
import * as S from "./flySceneTypes.mjs";
import * as Q from "./flyHomeTrueTally.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880211, 880212];
const F = Object.fromEntries(Object.entries(E.FILES).map(([k, f]) => [k, E.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flyTallyShare-selfcheck -- the tally-share round (the own tally's share of the perfect tally's home, both scenes, fresh lives): the numbers, the flying, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! the compass-noise round's 48 flies (HOMEP, COURSE64, HOME16, H16BYC, draws 1 to 12), alpha 0.01, the margin 0.02, this round's own results file",
        E.SEEDS === TS.SEEDS && J(E.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && J(E.ARMS) === J(["HOMEP", "COURSE64", "HOME16", "H16BYC"]) && E.ALPHA === 0.01 && E.MARGIN === 0.02 &&
        E.RESULTS === "brain/flyTallyShareRound.jsonl" && !Object.values(E.FILES).includes(E.RESULTS));
    const old = new Set(E.AUDIT);
    ok("!! 200 FRESH LIVES, seeds 80000001 + 7919 k, none of them an old audit life and none repeated; the old audit is the homing round's 200",
        E.FRESH.length === 200 && E.FRESH[0] === 80000001 && E.FRESH[199] === 80000001 + 7919 * 199 && new Set(E.FRESH).size === 200 && !E.FRESH.some((x) => old.has(x)) && E.AUDIT === T.AUDIT && E.AUDIT.length === 200);
    ok("!! THE SCENE-TALLY ROUND'S FILE BY ITS HASH (95ee3618...), the tree has it today, and it passes its own checks (which weigh the scene-types and perfect-tally rounds' files in turn)",
        J(E.FILES) === J({ ...TS.FILES, sceneTally: TS.RESULTS }) && E.SCENE_TALLY_SHA256 === "95ee36184538cbd69b74eb4dfbbb60347a5d984f31256211cec0cbb93f40909a" &&
        F.sceneTally.sha256 === E.SCENE_TALLY_SHA256 && sha(TS.RESULTS) === E.SCENE_TALLY_SHA256 && TS.checkRecords(F.sceneTally.lines, F).length === 0);
    const note = src("brain/FLY_TALLY_SHARE_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the 48 flies four ways on 200 fresh lives at 80000001; EQ by two one-sided tests at 0.02; D; the checks; the expectations",
        /\*\*The compass-noise round's 48 committed flies\*\*/.test(note) && /\*\*Fresh lives: 200 of them, seeds 80000001 \+ 7919 k\*\*/.test(note) && /None of the four numbers is taken from a committed file/.test(note) &&
        /\*\*EQ: is the share the same in both scenes, to within 0\.02\?\*\* Two one-sided exact sign tests/.test(note) && /\*\*D: does the share differ at all\?\*\* d against 0/.test(note) &&
        /EQ: \*\*EQUIVALENT about 85\*\*, NOT SHOWN \(upper side\) 12, \(lower side\) 3\. D: \*\*CANNOT about 75\*\*, ABOVE 20, BELOW 5\./.test(note));
});

console.log("\n2. THE FLYING (on 2 lives of the gate's own)");
section(() => {
    const c = N.committedOf("HOMEP", 3, F), fl = () => T.flyOf("HOMEP", 3, c.weights), four = E.fourOf(fl, TWO);
    ok("!! THE FOUR WAYS ARE THE COMMITTED ROUNDS' SCORERS: own plain is compass-noise homeScore at sigma 0, own 26-type is scene-types homeIn, perfect plain is perfect-tally trueHome at sigma 0, perfect 26-type is scene-tally trueIn",
        four.ownPlain === N.homeScore(fl(), TWO, 0) && four.ownType === S.homeIn(fl(), TWO, "type") && four.truePlain === Q.trueHome(fl(), TWO, 0) && four.trueType === TS.trueIn(fl(), TWO, "type"));
    ok("!! and they are four different flights: no two of the four numbers are the same, and each perfect tally is above its own tally", new Set(Object.values(four)).size === 4 && four.truePlain > four.ownPlain && four.trueType > four.ownType, J(four));
    const r = E.flyOne("COURSE64", 5, F, TWO), c5 = N.committedOf("COURSE64", 5, F);
    ok("!! a fly is its arm's committed weights: COURSE64 draw 5's record is its weights' hash and its four numbers on the lives it was given", r.kind === "fly" && r.arm === "COURSE64" && r.s === 5 && r.weightsHash === c5.weightsHash &&
        J(Object.keys(r)) === J(["kind", "arm", "s", "weightsHash", "ownPlain", "ownType", "truePlain", "trueType"]) && r.trueType === TS.trueIn(T.flyOf("HOMEP", 5, c5.weights), TWO, "type"));
    const cf = E.committedFour(F, "HOMEP", 1);
    ok("!! the reproduction is HOMEP draw 1 on the OLD audit lives, compared to the four committed rounds' numbers (compass-noise, scene-types, perfect-tally at sigma 0, scene-tally)",
        /reproduceOne\(F\) \{ const s = SEEDS\[0\], \{ c, fly \} = flyFor\("HOMEP", s, F\); return \{ kind: "reproduce", arm: "HOMEP", s, weightsHash: c\.weightsHash, \.\.\.fourOf\(fly, AUDIT\) \}; \}/.test(src("tools/ship/flyTallyShare.mjs")) &&
        [cf.ownPlain, cf.ownType, cf.truePlain, cf.trueType].every((v) => v > 0 && v < 1) && cf.trueType === F.sceneTally.lines.find((x) => x.kind === "fly" && x.arm === "HOMEP" && x.s === 1).home);
});

console.log("\n3. THE RECORDS (made here)");
section(() => {
    const wh = (a, s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === a && r.s === s).weightsHash, cf = E.committedFour(F, "HOMEP", 1);
    // made(d): every fly's plain share 0.6 exactly and its 26-type share 0.6 + d(arm, s)
    const made = (d) => { const fl = E.ARMS.flatMap((a) => E.SEEDS.map((s) => ({ kind: "fly", arm: a, s, weightsHash: wh(a, s), ownPlain: 0.54, truePlain: 0.9, ownType: (0.6 + d(a, s)) * 0.95, trueType: 0.95 })));
        const f1 = fl[0]; return [{ kind: "reproduce", arm: "HOMEP", s: 1, weightsHash: wh("HOMEP", 1), ...cf }, ...fl, { kind: "recheck", arm: "HOMEP", s: 1, ownPlain: f1.ownPlain, ownType: f1.ownType, truePlain: f1.truePlain, trueType: f1.trueType }]; };
    const near = made((a, s) => (s % 2 ? 0.005 : -0.005));
    ok("!! the made records pass the checks: 48 flies once each, their arms' committed weights, the reproduction to the bit, HOMEP draw 1 the same twice", E.checkRecords(near, F).length === 0, E.checkRecords(near, F).join("; "));
    const R = E.reading(near, F);
    ok("!! EQ: every d within 0.005 of 0 is EQUIVALENT on both sides (48 of 48 below +0.02 and above -0.02); D: 24 above, 24 below, CANNOT", R.EQ.word === E.WORDS.EQ[0] && R.EQ.upper.k === 48 && R.EQ.lower.k === 48 &&
        R.EQ.upper.p <= 0.01 && R.D.word === E.WORDS.D[2] && R.D.above === 24 && R.D.below === 24);
    const up = E.reading(made(() => 0.03), F), dn = E.reading(made(() => -0.03), F), both = E.reading(made((a, s) => (s % 2 ? 0.03 : -0.03)), F);
    ok("!! and it can fail: every d +0.03 is NOT SHOWN on the upper side and D LARGER; every d -0.03 is NOT SHOWN on the lower side and D SMALLER; half each way is NOT SHOWN on either side",
        up.EQ.word === E.WORDS.EQ[1] && up.D.word === E.WORDS.D[0] && dn.EQ.word === E.WORDS.EQ[2] && dn.D.word === E.WORDS.D[1] && both.EQ.word === E.WORDS.EQ[3] && both.EQ.upper.k === 24 && both.EQ.lower.k === 24);
    // S7 went 0 red on the first draft of this row: a d MADE as (0.62 x 0.95) / 0.95 - 0.54 / 0.9 is not exactly 0.02 in floating point, so no tie was ever met. The ties are given exactly now.
    const at02 = Array(48).fill(0.02), atm02 = Array(48).fill(-0.02);
    ok("!! a d of exactly the margin counts AGAINST the claim on each side (ties against it): 48 values at +0.02 are 0 below it, 48 at -0.02 are 0 above -0.02",
        E.oneSided(at02, E.MARGIN, "below").k === 0 && E.oneSided(atm02, -E.MARGIN, "above").k === 0 && E.oneSided(at02, E.MARGIN, "below").p === 1);
    ok("the one-sided test is the exact binomial tail: 33 of 48 is p below 0.01 and 32 is not", E.oneSided(Array.from({ length: 48 }, (_, i) => (i < 33 ? 0 : 1)), 0.5, "below").p <= 0.01 &&
        E.oneSided(Array.from({ length: 48 }, (_, i) => (i < 32 ? 0 : 1)), 0.5, "below").p > 0.01);
    ok("the share is own over perfect in each scene, and d the 26-type share less the plain", Math.abs(E.shareOf({ ownPlain: 0.54, truePlain: 0.9, ownType: 0.57, trueType: 0.95 }).d - (0.57 / 0.95 - 0.6)) < 1e-15 &&
        Math.abs(R.arms.HOMEP.sharePlain - 0.6) < 1e-12);
    const LL = E.readingLines(R), LB = E.readingLines(E.reading(near.slice(0, -1), F));
    ok("readingLines prints the checks, the means and both words, and on a failed check only the failure", /^the checks hold/.test(LL[0]) && LL.some((l) => l.trim() === E.WORDS.EQ[0]) && LL.some((l) => l.trim() === E.WORDS.D[2]) &&
        LB[0] === "A CHECK FAILED, AND THE READING IS NOT WEIGHED:" && LB.length === 2);
    const bad = (f) => { const v = JSON.parse(J(near)); f(v); return E.checkRecords(v, F); }, at = (v, a, s) => v.find((r) => r.kind === "fly" && r.arm === a && r.s === s);
    const cases = [["a fly missing", (v) => v.splice(v.indexOf(at(v, "HOME16", 4)), 1), /HOME16 draw 4 is there 0 times/], ["a fly twice", (v) => v.push(JSON.parse(J(at(v, "COURSE64", 2)))), /COURSE64 draw 2 is there 2 times/],
        ["another fly's weights", (v) => { at(v, "H16BYC", 7).weightsHash = at(v, "HOMEP", 7).weightsHash; }, /H16BYC draw 7 is not its arm's committed weights/], ["a score past 1", (v) => { at(v, "HOMEP", 9).ownType = 1.01; }, /HOMEP draw 9 does not hold/],
        ["no score", (v) => { delete at(v, "HOMEP", 10).truePlain; }, /HOMEP draw 10 does not hold/], ["a perfect tally of 0", (v) => { at(v, "HOMEP", 11).trueType = 0; }, /HOMEP draw 11 does not hold/],
        ["no reproduction", (v) => v.shift(), /reproduction on the old audit lives is there 0 times/], ["a reproduction one bit off", (v) => { v[0].trueType += 1e-12; }, /reproduction's trueType/],
        ["no second flight", (v) => v.pop(), /flown a second time/], ["a second flight that differs", (v) => { v[v.length - 1].ownPlain += 1e-9; }, /flown a second time/],
        ["the second flight of draw 2", (v) => { v[v.length - 1].s = 2; }, /flown a second time/], ["another arm", (v) => { at(v, "HOME16", 11).arm = "HOMES"; }, /not a registered fly/]];
    const f2 = cases.filter(([, f, re]) => !bad(f).some((m) => re.test(m))).map(([n]) => n);
    ok(`!! each of ${cases.length} broken record sets is refused by name`, f2.length === 0, f2.join(", "));
    const G1 = { ...F, sceneTally: { sha256: "0".repeat(64), lines: F.sceneTally.lines } }, G2 = { ...F, sceneTally: { sha256: E.SCENE_TALLY_SHA256, lines: F.sceneTally.lines.slice(1) } };
    ok("!! and the scene-tally round's file is weighed first: another refused by its hash, one failing its own checks refused, and each leaves every reading null",
        /scene-tally round's file is not the one committed/.test(E.checkRecords(near, G1)[0]) && /scene-tally round's file fails its own checks/.test(E.checkRecords(near, G2)[0]) && [G1, G2].every((g) => E.reading(near, g).EQ === null));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, E.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    ok("!! the command's words, as arithmetic (parseArgs, the scene-types round's): run, run --jobs N, read, job ARM S of a registered arm and draw -- and others are not words",
        J(E.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(E.parseArgs(["job", "H16BYC", "12"])) === J({ cmd: "job", arm: "H16BYC", s: 12 }) && J(E.parseArgs(["read"])) === J({ cmd: "read" }) &&
        [[], ["bogus"], ["job", "HOMET", "1"], ["job", "HOMEP", "13"], ["run", "--jobs", "0"], ["read", "x"]].every((a) => E.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyTallyShare.mjs");
    ok("!! the command is this round's: its library and results file, the committed files read through fileOf, the reproduction first (job REPRODUCE 1), every fly the file does not hold, HOMEP draw 1 a second time with all four numbers kept",
        /from "\.\/flyTallyShare\.mjs"/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /PF\.reproduceOne\(committedFiles\(\)\)/.test(csrc) && /todo\.unshift\(\["REPRODUCE", 1, false\]\)/.test(csrc) &&
        /isRep = raw\[0\] === "job" && raw\[1\] === "REPRODUCE" && raw\[2\] === "1"/.test(csrc) && /PF\.flyOne\(args\.arm, args\.s, committedFiles\(\)\)/.test(csrc) &&
        /\{ kind: "recheck", arm, s, ownPlain: rec\.ownPlain, ownType: rec\.ownType, truePlain: rec\.truePlain, trueType: rec\.trueType \}/.test(csrc) && /no score is printed/.test(csrc) && !/flySceneTally\.mjs"/.test(csrc));
    const me = src("tools/ship/flyTallyShare-selfcheck.mjs"), calls = [...me.matchAll(/E\.flyOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE FLIES NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: one flyOne on its own 2 lives (none a fresh or an audit life), no reproduceOne, no process",
        calls.length === 1 && /, TWO$/.test(calls[0]) && !TWO.some((x) => T.AUDIT.includes(x) || E.FRESH.includes(x)) && !/E\.reproduceOne\(/.test(me.replace(/\/reproduceOne\\\(F\\\)[^/]*\//, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before);
});

console.log(`\nflyTallyShare-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
