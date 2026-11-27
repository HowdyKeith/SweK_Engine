// WebGLEngine/tools/ship/flySceneTally-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flySceneTally-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its flies are flown on 2 lives of its own, and it starts no process)
//
// THE GATE OF THE SCENE-TALLY ROUND (registered in brain/FLY_SCENE_TALLY_WIP.md before tools/ship/flySceneTally.mjs and tools/ship/takeFlySceneTally.mjs existed): the 48 committed flies flown
// home in the 26-type scene with the true way home shown -- is the tally's cost there larger than in the plain scene?
//
//   1  THE ROUND'S NUMBERS      the flies, the audit, the scene; the scene-types and perfect-tally rounds' files by their hashes, passing their own checks; the registration says the same
//   2  THE FLYING               the true way home in the plain scene is the perfect-tally round's at sigma 0 to the bit; in the 26-type scene it is another; a fly is its arm's committed weights
//   3  THE RECORDS              48 flies and a second flight, made here; T26, Q and the broken sets
//   4  THE COMMAND              it is this round's; no flight of the round's, no process (but the verdict's one fly)
//   5  THE VERDICT              the committed results file by its hash; its checks, T26 and Q, the means, what was described after the reading; COURSE64 draw 12 re-flown to the bit; the note says it
// SABOTAGE LOG (2026-11-27) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the
// command as a process); every one red by name, none 0 (the number is the rows red):
//   T1 the plain scene 2 | T2 the true way not shown 1 | T3 shown from the start 1 | T4 T26 against the own plain home 1 | T5 Q without the plain gap 2 | T6 the perfect tally at sigma 0.4 3 |
//   T7 the weights not checked 1 | T8 the second flight not compared 1 | T9 the perfect-tally file's own checks skipped 1 | T10 the scene-types file's hash another 3 | T11 BETTER read as WORSE 3 |
//   T12 every fly HOMEP's weights 1 | K1 the second flight's score not kept 1 | K2 the command's usage another 2 (voxelHome) | M1 an expectation moved 1
//   THE VERDICT (after the reading, the same runner, this gate alone): V1 the results file's hash another 1 | V2 alpha 0.05 1 | V3 T26 against the own plain home 2 | V4 Q without the plain
//   gap 4 | V5 a mean in the note's table 1 | V6 the note's share 24 above 1 | V7 an expectation in section 9 moved 1 | V8 the backlog row Q CANNOT 1 | V9 the re-flight compared to draw 11 1
//   -- all red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as E from "./flySceneTally.mjs";
import * as S from "./flySceneTypes.mjs";
import * as Q from "./flyHomeTrueTally.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import { signTest } from "./voxelHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880111, 880112];
const F = Object.fromEntries(Object.entries(E.FILES).map(([k, f]) => [k, E.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flySceneTally-selfcheck -- the scene-tally round (a perfect tally in the 26-type scene): the numbers, the flying, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! the compass-noise round's 48 flies (HOMEP, COURSE64, HOME16, H16BYC, draws 1 to 12), the homing round's 200 audit lives, the 26-type scene, alpha 0.01, this round's own results file",
        E.SEEDS === S.SEEDS && J(E.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && J(E.ARMS) === J(["HOMEP", "COURSE64", "HOME16", "H16BYC"]) && E.AUDIT === T.AUDIT && E.AUDIT === Q.AUDIT && E.AUDIT.length === 200 && E.SCENE === "type" && E.ALPHA === 0.01 &&
        E.RESULTS === "brain/flySceneTallyRound.jsonl" && !Object.values(E.FILES).includes(E.RESULTS));
    ok("!! THE SCENE-TYPES AND PERFECT-TALLY ROUNDS' FILES BY THEIR HASHES, and the tree has them today, each passing its own checks", J(E.FILES) === J({ ...S.FILES, types: S.RESULTS, tally: Q.RESULTS }) &&
        E.TYPES_SHA256 === "b615c753f69a97215609819fc9b2c5c4819b4f70e30c712007ae33d6fe61ba46" && E.TALLY_SHA256 === "9226e52c44940a5f109ada6594f03258b2c6c131a341cde531abcf6f7b8baeff" &&
        F.types.sha256 === E.TYPES_SHA256 && F.tally.sha256 === E.TALLY_SHA256 && sha(S.RESULTS) === E.TYPES_SHA256 && sha(Q.RESULTS) === E.TALLY_SHA256 && S.checkRecords(F.types.lines, F).length === 0 && Q.checkRecords(F.tally.lines, F).length === 0);
    const note = src("brain/FLY_SCENE_TALLY_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the 48 flies in the 26-type scene with the true way home, over the homing round's 200 audit lives; T26 and Q; HOMEP draw 1 twice; the expectations",
        /\*\*The compass-noise round's 48 committed flies\*\*/.test(note) && /\*\*in the 26-type scene with the true way home shown from HOME_AT\*\*/.test(note) && /\*\*the homing round's 200 audit lives\*\*/.test(note) &&
        /\*\*T26: does a perfect tally still help in the 26-type scene\?\*\* The perfect tally's home there less the fly's own there\./.test(note) && /\*\*Q: is the tally's cost there larger\?\*\* That difference less the same difference in the plain scene\./.test(note) &&
        /\*\*HOMEP draw 1 is flown a second time\.\*\*/.test(note) && /T26: \*\*BETTER about 99\*\*\. Q: \*\*BETTER about 80\*\*, CANNOT 15, WORSE 5\./.test(note));
});

console.log("\n2. THE FLYING (on 2 lives of the gate's own)");
section(() => {
    const c = N.committedOf("HOMEP", 3, F), fl = () => T.flyOf("HOMEP", 3, c.weights), plain = E.trueIn(fl(), TWO, "all"), typed = E.trueIn(fl(), TWO, "type");
    ok("!! IN THE PLAIN SCENE the true way home is the perfect-tally round's at sigma 0 to the bit (its trueHome), and its home is far above the fly's own there", plain === Q.trueHome(fl(), TWO, 0) && plain > S.homeIn(fl(), TWO, "all") + 0.1);
    ok("!! IN THE 26-TYPE SCENE it is flown in that scene: another score than the plain one, and than the fly's own tally there", typed !== plain && typed !== S.homeIn(fl(), TWO, "type") && typed > 0 && typed <= 1);
    const r = E.flyOne("COURSE64", 5, F, TWO), c5 = N.committedOf("COURSE64", 5, F);
    ok("!! a fly is its arm's committed weights flown in the 26-type scene: COURSE64 draw 5's record is its weights' hash and their perfect-tally home there", r.kind === "fly" && r.arm === "COURSE64" && r.s === 5 && r.weightsHash === c5.weightsHash &&
        r.home === E.trueIn(T.flyOf("HOMEP", 5, c5.weights), TWO, "type") && J(Object.keys(r)) === J(["kind", "arm", "s", "weightsHash", "home"]));
});

console.log("\n3. THE RECORDS (made here; the comparison numbers the committed ones)");
section(() => {
    const typed = (a, s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === a && r.s === s), own = (a, s) => N.committedOf(a, s, F).home, tp = (a, s) => F.tally.lines.find((r) => r.kind === "fly" && r.arm === a && r.s === s).levels.find((l) => l.sigma === 0).home;
    const made = (h) => { const fs2 = E.ARMS.flatMap((a) => E.SEEDS.map((s) => ({ kind: "fly", arm: a, s, weightsHash: typed(a, s).weightsHash, home: h(a, s) }))); const f1 = fs2[0]; return [...fs2, { kind: "recheck", arm: "HOMEP", s: 1, home: f1.home }]; };
    const gap = (a, s) => tp(a, s) - own(a, s), good = made((a, s) => typed(a, s).type.home + gap(a, s) + 0.01);
    ok("!! the made records pass the checks: 48 flies once each, their arms' committed weights, HOMEP draw 1 the same twice", E.checkRecords(good, F).length === 0, E.checkRecords(good, F).join("; "));
    const R = E.reading(good, F);
    ok("!! T26 is the perfect tally less the fly's own IN THE 26-TYPE SCENE, Q that less the same in the plain: the plain's gap and 0.01 more, all 48 above, both BETTER", R.T26.word === E.WORDS.T26[0] && R.T26.above === 48 && R.Q.word === E.WORDS.Q[0] && R.Q.above === 48 && R.Q.diffs.every((d) => Math.abs(d - 0.01) < 1e-9));
    const X = E.reading(made((a, s) => typed(a, s).type.home + gap(a, s) - 0.01), F), Z = E.reading(made((a, s) => typed(a, s).type.home + gap(a, s)), F);
    ok("!! and not the other way: the plain's gap less 0.01 is T26 BETTER and Q LESS; the plain's gap to the bit is Q CANNOT", X.T26.word === E.WORDS.T26[0] && X.Q.word === E.WORDS.Q[1] && X.Q.below === 48 && Z.Q.word === E.WORDS.Q[2]);
    const W = E.reading(made((a, s) => typed(a, s).type.home - 0.01), F);
    ok("the perfect tally below the fly's own there is T26 WORSE", W.T26.word === E.WORDS.T26[1] && W.T26.below === 48);
    ok("the means: each arm's own tally in each scene, the perfect tally in the plain (the perfect-tally round's) and in the 26-type (this round's)", Math.abs(R.arms.HOMEP.ownPlain - E.SEEDS.reduce((a, s) => a + own("HOMEP", s), 0) / 12) < 1e-12 &&
        Math.abs(R.arms.H16BYC.truePlain - E.SEEDS.reduce((a, s) => a + tp("H16BYC", s), 0) / 12) < 1e-12 && Math.abs(R.arms.HOME16.trueType - R.arms.HOME16.ownType - (R.arms.HOME16.truePlain - R.arms.HOME16.ownPlain) - 0.01) < 1e-9);
    const LL = E.readingLines(R), LB = E.readingLines(E.reading(good.slice(0, -1), F));
    ok("readingLines prints the checks, the means and each reading's word, and on a failed check only the failure", /^the checks hold/.test(LL[0]) && LL.some((l) => l.trim() === E.WORDS.T26[0]) && LL.some((l) => l.trim() === E.WORDS.Q[0]) && LL.some((l) => /^  COURSE64 /.test(l)) &&
        LB[0] === "A CHECK FAILED, AND THE READING IS NOT WEIGHED:" && LB.length === 2);
    const bad = (f) => { const v = JSON.parse(J(good)); f(v); return E.checkRecords(v, F); }, at = (v, a, s) => v.find((r) => r.kind === "fly" && r.arm === a && r.s === s);
    const cases = [["a fly missing", (v) => v.splice(v.indexOf(at(v, "HOME16", 4)), 1), /HOME16 draw 4 is there 0 times/], ["a fly twice", (v) => v.push(JSON.parse(J(at(v, "COURSE64", 2)))), /COURSE64 draw 2 is there 2 times/],
        ["another fly's weights", (v) => { at(v, "H16BYC", 7).weightsHash = at(v, "HOMEP", 7).weightsHash; }, /H16BYC draw 7 is not its arm's committed weights/], ["a score past 1", (v) => { at(v, "HOMEP", 9).home = 1.01; }, /HOMEP draw 9 does not hold/],
        ["no score", (v) => { delete at(v, "HOMEP", 10).home; }, /HOMEP draw 10 does not hold/], ["no second flight", (v) => v.pop(), /flown a second time/], ["a second flight that differs", (v) => { v[v.length - 1].home += 1e-9; }, /flown a second time/],
        ["the second flight of draw 2", (v) => { v[v.length - 1].s = 2; }, /flown a second time/], ["another arm", (v) => { at(v, "HOME16", 11).arm = "HOMES"; }, /not a registered fly/], ["a draw 13", (v) => { at(v, "HOME16", 12).s = 13; }, /not a registered fly/]];
    const f2 = cases.filter(([, f, re]) => !bad(f).some((m) => re.test(m))).map(([n]) => n);
    ok(`!! each of ${cases.length} broken record sets is refused by name`, f2.length === 0, f2.join(", "));
    const G1 = { ...F, types: { sha256: "0".repeat(64), lines: F.types.lines } }, G2 = { ...F, tally: { sha256: "0".repeat(64), lines: F.tally.lines } }, G3 = { ...F, tally: { sha256: E.TALLY_SHA256, lines: F.tally.lines.slice(1) } }, G4 = { ...F, types: { sha256: E.TYPES_SHA256, lines: F.types.lines.slice(1) } };
    ok("!! and the two rounds' files are weighed first: another of either refused by its hash, either failing its own checks refused, and each leaves every reading null",
        /scene-types round's file is not the one committed/.test(E.checkRecords(good, G1)[0]) && /perfect-tally round's file is not the one committed/.test(E.checkRecords(good, G2)[0]) && /perfect-tally round's file fails its own checks/.test(E.checkRecords(good, G3)[0]) &&
        /scene-types round's file fails its own checks/.test(E.checkRecords(good, G4)[0]) && [G1, G2, G3, G4].every((g) => E.reading(good, g).T26 === null));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, E.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    ok("!! the command's words, as arithmetic (parseArgs, the scene-types round's): run, run --jobs N, read, job ARM S of a registered arm and draw -- and others are not words",
        J(E.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(E.parseArgs(["job", "H16BYC", "12"])) === J({ cmd: "job", arm: "H16BYC", s: 12 }) && J(E.parseArgs(["read"])) === J({ cmd: "read" }) &&
        [[], ["bogus"], ["job", "HOMET", "1"], ["job", "HOMEP", "13"], ["run", "--jobs", "0"], ["read", "x"]].every((a) => E.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlySceneTally.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, flies each fly the file does not hold with the committed files, HOMEP draw 1 a second time (its home kept), and prints no score",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flySceneTally\.mjs"/.test(csrc) && !/flySceneTypes/.test(csrc) &&
        /PF\.flyOne\(args\.arm, args\.s, committedFiles\(\)\)/.test(csrc) && /\{ kind: "recheck", arm, s, home: rec\.home \}/.test(csrc) && /todo\.splice\(Math\.min\(1, todo\.length\), 0, \["HOMEP", PF\.SEEDS\[0\], true\]\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlySceneTally\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && !/console\.log\([^)]*\.home\b/.test(csrc));
    const me = src("tools/ship/flySceneTally-selfcheck.mjs"), calls = [...me.matchAll(/E\.flyOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE FLIES NOTHING OF THE ROUND'S BUT THE VERDICT'S ONE FLY AND LEAVES ITS RESULTS FILE AS IT WAS: one flyOne on its own 2 lives, and section 5's COURSE64 draw 12 on the round's audit; it starts no process; the file's size and time are what they were",
        calls.length === 2 && /, TWO$/.test(calls[0]) && calls[1] === '"COURSE64", 12, F' && !TWO.some((x) => T.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (the results file committed unread at 09062f15, then read once; COURSE64 draw 12 flown home again here with the true way shown, about a minute)");
section(() => {
    const RS = "95ee36184538cbd69b74eb4dfbbb60347a5d984f31256211cec0cbb93f40909a", L = E.fileOf(fs.readFileSync(path.join(ENG, E.RESULTS))), R = E.reading(L.lines, F), f4 = (x) => x.toFixed(4), m = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    ok("!! THE RESULTS FILE IS THE ONE COMMITTED UNREAD (sha256 95ee3618...), 49 records, and its checks hold", L.sha256 === RS && L.lines.length === 49 && R.checks.length === 0, R.checks.join("; "));
    ok("!! T26: A PERFECT TALLY FINDS HOME BETTER IN THE 26-TYPE SCENE (48 above, none below, p 7.1e-15); Q: THE TALLY COSTS MORE THERE THAN IN THE PLAIN (40 above, 8 below, p 3.3e-6)",
        R.T26.word === E.WORDS.T26[0] && R.T26.above === 48 && R.T26.below === 0 && R.T26.ties === 0 && R.T26.p.toExponential(3) === "7.105e-15" && R.Q.word === E.WORDS.Q[0] && R.Q.above === 40 && R.Q.below === 8 && R.Q.ties === 0 &&
        R.Q.p.toExponential(3) === "3.305e-6" && f4(m(R.T26.diffs)) === "0.3789" && f4(m(R.Q.diffs)) === "0.0177");
    const row = (a) => ["ownPlain", "ownType", "truePlain", "trueType"].map((k) => f4(R.arms[a][k])).join(" ");
    ok("the means the note prints, each arm's own tally plain and 26-type, perfect tally plain and 26-type",
        row("HOMEP") === "0.5501 0.5911 0.9164 0.9630" && row("COURSE64") === "0.5541 0.5761 0.9099 0.9630" && row("HOME16") === "0.5517 0.5900 0.9169 0.9623" && row("H16BYC") === "0.5548 0.5797 0.9123 0.9641");
    const flies = L.lines.filter((r) => r.kind === "fly"), byArm = (a) => signTest(flies.map((r, i) => [r, R.Q.diffs[i]]).filter(([r]) => r.arm === a).map(([, d]) => d), 0);
    const typ = (a, s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === a && r.s === s).type.home, tp = (a, s) => F.tally.lines.find((r) => r.kind === "fly" && r.arm === a && r.s === s).levels.find((x) => x.sigma === 0).home;
    const share = flies.map((r) => typ(r.arm, r.s) / r.home - N.committedOf(r.arm, r.s, F).home / tp(r.arm, r.s)), sh = signTest(share, 0), all = (k) => m(E.ARMS.map((a) => R.arms[a][k]));
    ok("!! DESCRIBED AFTER THE READING: Q is the course-chosen flies' (COURSE64 and H16BYC 12 of 12 each; HOMEP and HOME16 8 of 12 each); as a share of the perfect tally's home the own tally keeps the same in both scenes (23 above, 25 below, p 0.89; 0.6048 plain, 0.6066 26-type)",
        ["HOMEP", "COURSE64", "HOME16", "H16BYC"].map((a) => `${byArm(a).above}/${byArm(a).below}`).join(" ") === "8/4 12/0 8/4 12/0" && sh.above === 23 && sh.below === 25 && f4(sh.p) === "0.8854" &&
        f4(all("ownPlain") / all("truePlain")) === "0.6048" && f4(all("ownType") / all("trueType")) === "0.6066");
    const r12 = flies.find((r) => r.arm === "COURSE64" && r.s === 12), again = E.flyOne("COURSE64", 12, F);
    ok("!! COURSE64 draw 12 flown again here: its home in the 26-type scene with the true way shown, over the homing round's 200 audit lives, is the record's to the bit", again.home === r12.home && again.weightsHash === r12.weightsHash);
    const note = src("brain/FLY_SCENE_TALLY_WIP.md").replace(/\s+/g, " "), back = src("brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md");
    ok("!! the note's section 9 says it: the file and its hash, both words, the means, both expectations came, what was described and what it does not mean; the backlog row DONE",
        /## 9\. The result \(the whole results file committed unread at 09062f15, then read once\)/.test(note) && /sha256 95ee36184538cbd6/.test(note) && note.includes("**T26: " + E.WORDS.T26[0] + "**") && note.includes("**Q: " + E.WORDS.Q[0] + "**") &&
        /\| HOMEP \| 0\.5501 \| 0\.5911 \| 0\.9164 \| 0\.9630 \|/.test(note) && /\| H16BYC \| 0\.5548 \| 0\.5797 \| 0\.9123 \| 0\.9641 \|/.test(note) && /\*\*Both expectations came\*\*: T26 BETTER \(99\) and Q BETTER \(80\)/.test(note) &&
        note.includes("**Described after the reading, not registered (the gate recomputes it from the records):**") && /above 0 for 23 flies and below for 25 \(p 0\.89\)/.test(note) && note.includes("**What it does not mean.**") &&
        /\| `fly-scene-tally` \|[^\n]*\*\*REGISTERED[^\n]*DONE 2026-11-27[^\n]*T26 BETTER \(48 of 48[^\n]*Q BETTER \(40 of 48/.test(back));
});

console.log(`\nflySceneTally-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
