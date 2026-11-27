// WebGLEngine/tools/ship/flySceneLift-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flySceneLift-selfcheck.mjs      (about a minute; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations on draw 902, audited on 2 homing lives and 1 course life,
// and it starts no process)
//
// THE GATE OF THE SCENE-LIFT ROUND (registered in brain/FLY_SCENE_LIFT_WIP.md before tools/ship/flySceneLift.mjs and tools/ship/takeFlySceneLift.mjs existed): HOMEP's fly and recipe trained in
// the plain scene (HOMEP) and the 26-type scene (HOMET) on draws 13 to 24 -- is the 26-type scene's lift wider for the fly trained there?
//
//   1  THE ROUND'S NUMBERS      draws 13 to 24, two arms and their scenes, recipe, audits; the scene-trained round's file by its hash, passing its own checks; the registration says the same
//   2  THE TRAINING             HOMEP's arm the trained-to-home round's training to the bit, HOMET's the scene-trained round's in the 26-type scene; only the arm's label added
//   3  THE RECORDS              24 draws and a second audit, made here; L, G, R26, RP and the broken sets
//   4  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-26) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the
// command as a process); every one red by name but ONE (the number is the rows red):
//   E1 HOMEP trained in the 26-type scene 4 | E2 the arm not named 2 | E3 the lift the 26-type home alone 3 | E4 G reads p_a 2 | E5 R26 against HOMEP's plain 1 | E6 the recipe not checked 1 |
//   E7 the battery not checked 1 | E8 the hash not checked 1 | E9 the second audit's plain not compared 0 -- A FINDING -- then 1 | E10 the scene-trained file's own checks skipped 1 |
//   E11 draws 12 to 23 3 | E12 BETTER read as WORSE 4 | K1 the command trains HOMET only 1 | K2 no second audit 1 | K3 the command's usage another 2 (voxelHome) | M1 an expectation moved 1
//   THE FINDING: no broken record set changed the second audit's plain score alone, so a check that never compared it passed; the set "a second audit whose plain home differs" was added,
//   and E9 was run again: 1 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as L from "./flySceneLift.mjs";
import * as P from "./flySceneTrained.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as V from "./flyCompass.mjs";
import { packWeights, hashWeights, unpackWeights } from "./paintingFly.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880111, 880112], TINY = Object.freeze({ ...L.RECIPE, iters: 2, pop: 4, trainEps: 1 });
const F = Object.fromEntries(Object.entries(L.FILES).map(([k, f]) => [k, L.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flySceneLift-selfcheck -- the scene-lift round (HOMEP's fly and recipe trained in each scene on draws 13 to 24): the numbers, the training, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! draws 13 to 24 (none of the trained-to-home round's 1 to 12); HOMEP in the plain scene, HOMET in the 26-type; HOMEP's recipe and audits; alpha 0.01; HOMET draw 13 audited twice; this round's own results file",
        J(L.SEEDS) === J([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) && !L.SEEDS.some((s) => T.SEEDS.includes(s)) && J(L.ARMS) === J(["HOMEP", "HOMET"]) && J(L.SCENES) === J({ HOMEP: "all", HOMET: "type" }) &&
        L.RECIPE === T.RECIPE && L.AUDIT === T.AUDIT && L.COURSE_AUDIT === V.AUDIT && L.ALPHA === 0.01 && J(L.RECHECK) === J({ arm: "HOMET", s: 13 }) && L.RESULTS === "brain/flySceneLiftRound.jsonl" && !Object.values(L.FILES).includes(L.RESULTS));
    ok("!! THE SCENE-TRAINED ROUND'S FILE BY ITS HASH, and the tree has it today, passing its own checks", J(L.FILES) === J({ ...P.FILES, scene: P.RESULTS }) && L.TRAINED_SHA256 === "116ab243838357674e7f33f7fdaf695ede878cbf34b3a93c291b3b344a59429d" &&
        F.scene.sha256 === L.TRAINED_SHA256 && sha(P.RESULTS) === L.TRAINED_SHA256 && P.checkRecords(F.scene.lines, F).length === 0);
    const note = src("brain/FLY_SCENE_LIFT_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: two arms on draws 13 to 24, audited home in both scenes; L, G, R26, RP; HOMET draw 13 audited twice; the expectations",
        /\*\*Two arms, each trained on draws 13 to 24\*\*/.test(note) && /\*\*HOMEP: trained in the plain scene\*\*/.test(note) && /\*\*HOMET: trained in the 26-type scene\*\*/.test(note) &&
        /\*\*in the 26-type scene and in the plain scene over the homing round's 200 audit lives\*\*/.test(note) && /\*\*L: does training in the scene widen its lift\?\*\* HOMET's lift \(home in the 26-type scene less home in the plain\) less HOMEP's/.test(note) &&
        /\*\*G: does it raise the landmark gain\?\*\* HOMET's p_c less HOMEP's/.test(note) && /\*\*HOMET draw 13's weights are audited a second time\*\*/.test(note) &&
        /L: \*\*BETTER about 55\*\*, CANNOT 45\. G: CANNOT about 60, above 40\. R26: CANNOT about 60, BETTER 35, WORSE 5\. RP: CANNOT about 70, WORSE 25, BETTER 5\./.test(note));
});

console.log("\n2. THE TRAINING (at 2 iterations on draw 902, on its own 64 battery lives, audited on 2 homing lives and 1 course life)");
section(() => {
    const hp = L.trainOne("HOMEP", 902, TINY, TWO, [TWO[0]]), t2 = T.trainOne("HOMEP", 902, TINY, TWO, [TWO[0]]);
    ok("!! HOMEP'S ARM IS THE TRAINED-TO-HOME ROUND'S TRAINING TO THE BIT (its trainOne: the same weights, kept point and home score, and the battery's score at each iteration), on the draw's own battery",
        hp.arm === "HOMEP" && hp.kind === "draw" && hp.s === 902 && hp.weightsHash === t2.weightsHash && hp.keptAt === t2.keptAt && hp.plain === t2.home && J(hp.history) === J(t2.history) && J(hp.battery) === J(T.batteryOf(902)) && J(hp.recipe) === J(TINY));
    const ht = L.trainOne("HOMET", 902, TINY, TWO, [TWO[0]]), p2 = P.trainOne(902, TINY, TWO, [TWO[0]], T.batteryOf(902), "type");
    ok("!! HOMET'S ARM IS THE SCENE-TRAINED ROUND'S TRAINING IN THE 26-TYPE SCENE to the bit, every field, and not HOMEP's", J(ht) === J(p2) && ht.arm === "HOMET" && ht.weightsHash !== hp.weightsHash);
    const { arm, ...rest } = hp, { arm: a2, ...rest2 } = P.trainOne(902, TINY, TWO, [TWO[0]], T.batteryOf(902), "all");
    ok("and HOMEP's record is the scene-trained round's trainOne in the plain scene with only its arm's name changed; no other arm trains; the second audit is that round's", J(rest) === J(rest2) && a2 === "HOMET" && arm === "HOMEP" &&
        (() => { try { L.trainOne("HOMES", 902, TINY, TWO, [TWO[0]]); return false; } catch (e) { return /no arm HOMES/.test(e.message); } })() && J(L.auditOne(ht, TWO)) === J({ home: ht.home, plain: ht.plain }));
});

console.log("\n3. THE RECORDS (made here; the weights are the committed HOMEP's and HOMET's of draws 1 to 12 or set here)");
section(() => {
    const homep = (k) => N.committedOf("HOMEP", k + 1, F), homet = (k) => F.scene.lines.find((r) => r.kind === "draw" && r.s === k + 1);
    const rec = (arm, k, w, home, plain) => ({ kind: "draw", arm, s: L.SEEDS[k], recipe: { ...L.RECIPE }, battery: T.batteryOf(L.SEEDS[k]), weightCount: 3, weights: packWeights(Float32Array.from(w)), weightsHash: hashWeights(Float32Array.from(w)), keptAt: 7,
        home, plain, measures: { calm: 0.3, wind: 0.6, share: 0.8, gusts: 9, course: 0.7 }, history: [] });
    const made = (fp, ft, wp = (k) => homep(k).weights, wt = (k) => unpackWeights(homet(k).weights)) => { const ds = L.SEEDS.flatMap((s, k) => [rec("HOMEP", k, Array.from(wp(k)), ...fp(k)), rec("HOMET", k, Array.from(wt(k)), ...ft(k))]);
        const d = ds.find((r) => r.arm === "HOMET" && r.s === 13); return [...ds, { kind: "recheck", arm: "HOMET", s: 13, weightsHash: d.weightsHash, home: d.home, plain: d.plain }]; };
    const base = (k) => [0.59 + k / 1000, 0.55 + k / 1000], good = made(base, (k) => [base(k)[0] + 0.02, base(k)[1] + 0.005]);
    ok("!! the made records pass the checks: 12 draws of each arm once each, HOMEP's recipe on their own batteries, their weights the ones they name, HOMET draw 13 audited the same twice", L.checkRecords(good, F).length === 0, L.checkRecords(good, F).join("; "));
    const R = L.reading(good, F);
    ok("!! L is HOMET'S LIFT LESS HOMEP'S, draw for draw: 0.015 wider in all 12 is BETTER; R26 (0.02 up) BETTER; RP (0.005 up) BETTER", R.L.word === L.WORDS.L[0] && R.L.above === 12 && R.L.diffs.every((d) => Math.abs(d - 0.015) < 1e-12) && R.R26.word === L.WORDS.R26[0] && R.RP.word === L.WORDS.RP[0]);
    const X = L.reading(made(base, (k) => [base(k)[0] + 0.01, base(k)[1] + 0.02]), F);
    ok("!! and the lift is not the home score: HOMET 0.01 up in the 26-type scene and 0.02 up in the plain -- R26 BETTER, RP BETTER, L WORSE", X.R26.word === L.WORDS.R26[0] && X.RP.word === L.WORDS.RP[0] && X.L.word === L.WORDS.L[1] && X.L.below === 12);
    const Z = L.reading(made(base, base), F);
    ok("the same scores in both arms are CANNOT for L, R26 and RP, all ties", [Z.L, Z.R26, Z.RP].every((x, i) => x.word === [L.WORDS.L, L.WORDS.R26, L.WORDS.RP][i][2] && x.ties === 12));
    const G1 = L.reading(made(base, base, () => [0.1, 0.1, 1], () => [0.1, 0.1, 2]), F), G2 = L.reading(made(base, base, () => [0.1, 0.1, 2], () => [0.1, 0.1, 1]), F), G0 = L.reading(made(base, base, () => [0.5, 0.1, 1], () => [0.1, 0.5, 1]), F);
    ok("!! G is p_c, the third weight: HOMET's 2 against HOMEP's 1 HIGHER, the other way LOWER, the same p_c with p_a and p_b swapped CANNOT (ties)", G1.G.word === L.WORDS.G[0] && G2.G.word === L.WORDS.G[1] && G0.G.word === L.WORDS.G[2] && G0.G.ties === 12);
    ok("the means: each arm's home in each scene, its lift, p_c and course", Math.abs(R.means.homet.type - R.means.homep.type - 0.02) < 1e-12 && Math.abs(R.means.homet.lift - R.means.homep.lift - 0.015) < 1e-12 &&
        Math.abs(R.means.homep.pc - L.SEEDS.reduce((a, _, k) => a + homep(k).weights[2], 0) / 12) < 1e-6 && Math.abs(R.means.homet.course - 0.7) < 1e-12);
    const LL = L.readingLines(R), LB = L.readingLines(L.reading(good.slice(0, -1), F));
    ok("readingLines prints the checks, the means and each reading's word, and on a failed check only the failure", /^the checks hold/.test(LL[0]) && LL.some((l) => l.trim() === L.WORDS.L[0]) && LL.some((l) => l.trim() === L.WORDS.G[0] || l.trim() === L.WORDS.G[2]) && LL.some((l) => /^  HOMET /.test(l)) &&
        LB[0] === "A CHECK FAILED, AND THE READING IS NOT WEIGHED:" && LB.length === 2);
    const bad = (f) => { const v = JSON.parse(J(good)); f(v); return L.checkRecords(v, F); }, at = (v, arm, s) => v.find((r) => r.kind === "draw" && r.arm === arm && r.s === s);
    const cases = [["a draw missing", (v) => v.splice(v.indexOf(at(v, "HOMEP", 16)), 1), /HOMEP draw 16 is there 0 times/], ["a draw twice", (v) => v.push(JSON.parse(J(at(v, "HOMET", 17)))), /HOMET draw 17 is there 2 times/],
        ["another recipe", (v) => { at(v, "HOMEP", 15).recipe.trainEps = 16; }, /HOMEP draw 15 is not HOMEP's recipe/], ["another battery", (v) => { at(v, "HOMET", 18).battery.base += 1; }, /HOMET draw 18 is not on its own battery/],
        ["weights not the ones named", (v) => { at(v, "HOMEP", 19).weightsHash = "0000000000000000"; }, /HOMEP draw 19's weights are not the ones it names/], ["a score past 1", (v) => { at(v, "HOMET", 20).plain = 1.5; }, /HOMET draw 20 does not hold/],
        ["no measures", (v) => { delete at(v, "HOMEP", 21).measures; }, /HOMEP draw 21 does not hold/], ["no second audit", (v) => v.pop(), /audited a second time/], ["a second audit whose 26-type home differs", (v) => { v[v.length - 1].home += 1e-9; }, /audited a second time/], ["a second audit whose plain home differs", (v) => { v[v.length - 1].plain += 1e-9; }, /audited a second time/],
        ["the second audit of HOMEP", (v) => { v[v.length - 1].arm = "HOMEP"; }, /audited a second time/], ["a draw of the old round's", (v) => { at(v, "HOMET", 24).s = 12; }, /not a registered draw/], ["another arm", (v) => { at(v, "HOMEP", 22).arm = "HOMES"; }, /not a registered draw/]];
    const f2 = cases.filter(([, f, re]) => !bad(f).some((m) => re.test(m))).map(([n]) => n);
    ok(`!! each of ${cases.length} broken record sets is refused by name`, f2.length === 0, f2.join(", "));
    const G = { ...F, scene: { sha256: "0".repeat(64), lines: F.scene.lines } }, H2 = { ...F, scene: { sha256: L.TRAINED_SHA256, lines: F.scene.lines.slice(1) } };
    ok("!! and the scene-trained round's file is weighed first: another refused by its hash, one that fails its own checks refused, and either leaves every reading null",
        /is not the one committed/.test(L.checkRecords(good, G)[0]) && /fails its own checks/.test(L.checkRecords(good, H2)[0]) && L.reading(good, G).L === null && L.reading(good, H2).G === null);
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, L.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMES", "13"], ["job", "HOMET", "12"], ["job", "HOMEP", "25"], ["job", "HOMET", "x"], ["job", "RECHECK", "14"], ["job", "HOMET"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("!! the command's words, as arithmetic (parseArgs): run is four processes or --jobs of at least 1, read takes nothing, job takes an arm and a draw 13 to 24, job RECHECK only 13 -- and eleven other shapes are not words",
        J(L.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(L.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(L.parseArgs(["read"])) === J({ cmd: "read" }) && J(L.parseArgs(["job", "HOMEP", "24"])) === J({ cmd: "job", arm: "HOMEP", s: 24 }) &&
        J(L.parseArgs(["job", "HOMET", "13"])) === J({ cmd: "job", arm: "HOMET", s: 13 }) && J(L.parseArgs(["job", "RECHECK", "13"])) === J({ cmd: "job", arm: "RECHECK", s: 13 }) && no.every((a) => L.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlySceneLift.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, trains each arm on each draw the file does not hold, then HOMET draw 13's weights audited again from the file, and prints no score",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flySceneLift\.mjs"/.test(csrc) &&
        /args\.arm === "RECHECK" \? recheckOf\(args\.s\) : PF\.trainOne\(args\.arm, args\.s\)/.test(csrc) && /kind: "recheck", arm: PF\.RECHECK\.arm, s, weightsHash: r\.weightsHash, \.\.\.PF\.auditOne\(r\)/.test(csrc) && /x\.arm === PF\.RECHECK\.arm && x\.s === s/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /PF\.SEEDS\.flatMap\(\(s\) => PF\.ARMS\.map\(\(arm\) => \(\{ arm, s \}\)\)\)\.filter\(\(j\) => !done\.has\(j\.arm \+ "\/" \+ j\.s\)\)/.test(csrc) && /if \(!failed && !rechecked\)/.test(csrc) && /jobOnce\("RECHECK", PF\.RECHECK\.s\)/.test(csrc) &&
        /usage: node tools\/ship\/takeFlySceneLift\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && !/console\.log\([^)]*\.(home|plain)\b/.test(csrc));
    const me = src("tools/ship/flySceneLift-selfcheck.mjs"), calls = [...me.matchAll(/[LTP]\.trainOne\(([^)]*\)?)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: every training here is of 2 iterations on draw 902, audited on lives not the round's; it starts no process; the file's size and time are what they were",
        calls.length === 6 && calls.every((c) => /^("HOME[A-Z]+", )?902, TINY, TWO, \[TWO\[0\]\]/.test(c)) && TINY.iters === 2 && !TWO.some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) &&
        !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `${calls.length} trainings; the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflySceneLift-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
