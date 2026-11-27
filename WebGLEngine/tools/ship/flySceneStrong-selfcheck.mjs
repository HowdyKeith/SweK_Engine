// WebGLEngine/tools/ship/flySceneStrong-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flySceneStrong-selfcheck.mjs      (about a minute; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations on draw 901, on 2 battery lives, audited on 2 homing lives
// and 1 course life, and it starts no process)
//
// THE GATE OF THE SCENE-STRONG ROUND (registered in brain/FLY_SCENE_STRONG_WIP.md before tools/ship/flySceneStrong.mjs and tools/ship/takeFlySceneStrong.mjs existed): HOMEP's fly with HOME16's
// recipe (16 lives a tried fly) trained in the 26-type scene -- does the stronger trainer find there what HOMEP's recipe could not tell apart, against HOME16 trained in the plain scene?
//
//   1  THE ROUND'S NUMBERS      draws, HOME16's recipe, audits; the scene-types, home-gradient and scene-trained rounds' files by their hashes, passing their own checks; the registration says the same
//   2  THE TRAINING             the scene-trained round's training in the 26-type scene with HOME16's recipe, to the bit; only the arm's label added; not HOMEP's recipe's nor the plain scene's
//   3  THE RECORDS              12 draws and a second audit, made here; S26, SP and the broken sets
//   4  THE COMMAND              it is this round's; no training of the round's, no process
//   5  THE VERDICT              the committed results file by its hash; its checks, S26 and SP, the means, what was described after the reading; HOMET16 draw 7 audited again to the bit; the note says it
// SABOTAGE LOG (2026-11-27) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the
// command as a process); every one red by name but TWO (the number is the rows red):
//   Z1 HOMEP's recipe 2 | Z2 trained in the plain scene 2 | Z3 the arm not named 2 | Z4 S26 against HOMET's 26-type home 3 | Z5 SP against HOMET's plain home 3 | Z6 the recipe not checked 1 |
//   Z7 the battery not checked 1 | Z8 the hash not checked 2 | Z9 the second audit's plain not compared 1 | Z10 the home-gradient file's own checks skipped 0 -- A FINDING | Z11 the scene-types
//   file's hash not checked 0 -- A FINDING | Z12 BETTER read as WORSE 2 | K1 the command runs HOMET's jobs 1 | K2 no second audit 1 | K3 the command's usage another 2 (voxelHome) |
//   M1 an expectation moved 1
//   THE FINDINGS: a broken file was refused all the same through another file's checks (the scene-trained round's own checks hold the scene-types file's hash; the scene-types round's hold the
//   home-gradient file's, through the compass-error and compass-noise rounds'), and the row read only that some refusal was given. The library's own check of the home-gradient file could never
//   be reached and is gone; the row now asks that each refusal NAME THE FILE BROKEN. Run again (this gate alone): Z10 now the scene-types file's own checks skipped 1 | Z11 1 | and a new
//   Z13 the home-gradient file's hash not checked 1.
//   THE VERDICT (after the reading, the same runner, this gate alone): V1 the results file's hash another 1 | V2 alpha 0.05 3 | V3 SP against HOMET's plain home 4 | V4 a mean in
//   the note's table 1 | V5 the note's HOMET comparison 6 of 12 1 | V6 an expectation in section 10 moved 1 | V7 the backlog row S26 BETTER 1 | V8 the re-audit compared to draw 8 1 |
//   V9 HOMET16 against HOMET in the plain, not the 26-type 1 -- every one red by name, none 0
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as G from "./flySceneStrong.mjs";
import * as P from "./flySceneTrained.mjs";
import * as S from "./flySceneTypes.mjs";
import * as Y from "./flyHomeGradient.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as V from "./flyCompass.mjs";
import { unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880111, 880112], TINY = Object.freeze({ ...G.RECIPE, iters: 2, pop: 4, trainEps: 2 }), BAT = (s) => ({ eps: 2, base: 881000 + s });
const F = Object.fromEntries(Object.entries(G.FILES).map(([k, f]) => [k, G.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flySceneStrong-selfcheck -- the scene-strong round (HOME16's recipe trained in the 26-type scene): the numbers, the training, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! HOMEP's draws and audits; HOME16'S RECIPE (HOMEP's with 16 lives a tried fly); alpha 0.01; one arm, HOMET16; this round's own results file",
        G.SEEDS === T.SEEDS && G.RECIPE === Y.RECIPE && J(G.RECIPE) === J({ ...T.RECIPE, trainEps: 16 }) && G.AUDIT === T.AUDIT && G.COURSE_AUDIT === V.AUDIT && G.ALPHA === 0.01 && J(G.ARMS) === J(["HOMET16"]) &&
        G.RESULTS === "brain/flySceneStrongRound.jsonl" && !Object.values(G.FILES).includes(G.RESULTS));
    ok("!! THE SCENE-TYPES, HOME-GRADIENT AND SCENE-TRAINED ROUNDS' FILES BY THEIR HASHES, and the tree has them today, each passing its own checks",
        J(G.FILES) === J({ ...P.FILES, scene: P.RESULTS }) && G.FILES.types === S.RESULTS && G.FILES.gradient === Y.RESULTS && G.TYPES_SHA256 === "b615c753f69a97215609819fc9b2c5c4819b4f70e30c712007ae33d6fe61ba46" &&
        G.GRADIENT_SHA256 === "138ea7125387ad2464c206bb6ffd76ca07a3206e2e7aef71e023d35c991e9024" && G.TRAINED_SHA256 === "116ab243838357674e7f33f7fdaf695ede878cbf34b3a93c291b3b344a59429d" &&
        sha(S.RESULTS) === G.TYPES_SHA256 && sha(Y.RESULTS) === G.GRADIENT_SHA256 && sha(P.RESULTS) === G.TRAINED_SHA256 &&
        S.checkRecords(F.types.lines, F).length === 0 && Y.checkRecords(F.gradient.lines, F).length === 0 && P.checkRecords(F.scene.lines, F).length === 0);
    const note = src("brain/FLY_SCENE_STRONG_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: HOMET16 on 12 draws audited home in both scenes, S26 and SP against HOME16, draw 1 twice, the expectations",
        /\*\*HOMET16: HOMEP's fly with HOME16's recipe \(HOMEP's with 16 lives a tried fly\), trained in the 26-type scene, 12 draws\*\*/.test(note) &&
        /\*\*in the 26-type scene and in the plain scene over the homing round's 200 audit lives\*\*/.test(note) &&
        /\*\*S26: does the stronger trainer find the scene's gain\?\*\* HOMET16's home in the 26-type scene less HOME16's there\./.test(note) &&
        /\*\*SP: what does it cost in the plain scene\?\*\* HOMET16's home in the plain scene less HOME16's committed home\./.test(note) && /\*\*HOMET16 draw 1's weights are audited a second time\.\*\*/.test(note) &&
        /S26: CANNOT about 65, BETTER 20, WORSE 15\. SP: CANNOT about 70, WORSE 25, BETTER 5\./.test(note));
});

console.log("\n2. THE TRAINING (at 2 iterations on draw 901, 2 battery lives, audited on 2 homing lives and 1 course life)");
section(() => {
    const a = G.trainOne(901, TINY, TWO, [TWO[0]], BAT(901)), b = G.trainOne(901, TINY, TWO, [TWO[0]], BAT(901));
    const p2 = P.trainOne(901, TINY, TWO, [TWO[0]], BAT(901), "type"), pl = P.trainOne(901, TINY, TWO, [TWO[0]], BAT(901), "all"), { arm, ...r1 } = a, { arm: a2, ...r2 } = p2;
    ok("!! a training is a HOMET16 draw: its seed, recipe and battery recorded, three weights that are the ones it names, the same twice",
        a.kind === "draw" && a.arm === "HOMET16" && a.s === 901 && J(a.recipe) === J(TINY) && J(a.battery) === J(BAT(901)) && a.weightCount === 3 && J(a) === J(b));
    ok("!! IT IS THE SCENE-TRAINED ROUND'S TRAINING IN THE 26-TYPE SCENE TO THE BIT, every field but the arm's name (the battery's score at each iteration too), and not the plain scene's; its audit is that round's",
        J(r1) === J(r2) && arm === "HOMET16" && a2 === "HOMET" && a.weightsHash !== pl.weightsHash && J(G.auditOne(a, TWO)) === J({ home: a.home, plain: a.plain }) && a.home !== a.plain);
    const p4 = P.trainOne(901, { ...TINY, trainEps: 4 }, TWO, [TWO[0]], BAT(901), "type"), fsrc = G.trainOne.toString();
    ok("!! and the recipe matters: the same training with HOMEP's 4 lives a tried fly is another; unless told, the round trains with HOME16's recipe, the draw's own battery and the 26-type scene",
        p4.weightsHash !== a.weightsHash && /^function trainOne\(s, recipe = RECIPE, audit = AUDIT, course = COURSE_AUDIT, battery = T\.batteryOf\(s\)\)/.test(fsrc) && /P\.trainOne\(s, recipe, audit, course, battery, P\.SCENE\)/.test(fsrc) && P.SCENE === "type");
});

console.log("\n3. THE RECORDS (made here, from the committed HOMET weights; the comparison numbers the committed HOME16 ones)");
section(() => {
    const homet = (s) => F.scene.lines.find((r) => r.kind === "draw" && r.s === s), com = (s) => N.committedOf("HOME16", s, F), typ = (s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === "HOME16" && r.s === s).type.home;
    const made = (dt, dp) => { const ds = G.SEEDS.map((s, i) => ({ ...JSON.parse(J(homet(s))), arm: "HOMET16", recipe: { ...G.RECIPE }, home: typ(s) + dt(i), plain: com(s).home + dp(i) }));
        return [...ds, { kind: "recheck", arm: "HOMET16", s: 1, weightsHash: ds[0].weightsHash, home: ds[0].home, plain: ds[0].plain }]; };
    const up = () => 0.01, down = () => -0.01, good = made(up, down);
    ok("!! the made records pass the checks: 12 draws once each, HOME16's recipe on their own batteries, their weights the ones they name, and draw 1 audited the same twice", G.checkRecords(good, F).length === 0, G.checkRecords(good, F).join("; "));
    const R = G.reading(good, F), Z = G.reading(made(() => 0, () => 0), F);
    ok("!! S26 IS READ AGAINST HOME16'S HOME IN THE 26-TYPE SCENE (the scene-types round's) and SP against HOME16's committed home: 12 up BETTER, 12 down WORSE, the same to the bit CANNOT (ties)",
        R.S26.word === G.WORDS.S26[0] && R.S26.above === 12 && R.SP.word === G.WORDS.SP[1] && R.SP.below === 12 && Z.S26.word === G.WORDS.S26[2] && Z.S26.ties === 12 && Z.SP.word === G.WORDS.SP[2] && Z.SP.ties === 12);
    const X = G.reading(made((i) => homet(G.SEEDS[i]).home - typ(G.SEEDS[i]), (i) => homet(G.SEEDS[i]).plain - com(G.SEEDS[i]).home), F);
    ok("!! and not against HOMET's: at HOMET's own scores the differences are HOMET's less HOME16's, to 1e-12",
        X.S26.diffs.every((d, i) => Math.abs(d - (homet(G.SEEDS[i]).home - typ(G.SEEDS[i]))) < 1e-12) && X.SP.diffs.every((d, i) => Math.abs(d - (homet(G.SEEDS[i]).plain - com(G.SEEDS[i]).home)) < 1e-12) && X.S26.diffs.some((d) => Math.abs(d) > 1e-6));
    ok("the means: HOMET16's, HOME16's (committed) and HOMET's (the scene-trained round's file) in each scene", Math.abs(R.means.homet16.type - R.means.home16.type - 0.01) < 1e-12 && Math.abs(R.means.homet16.plain - R.means.home16.plain + 0.01) < 1e-12 &&
        Math.abs(R.means.homet.type - G.SEEDS.reduce((a, s) => a + homet(s).home, 0) / 12) < 1e-12);
    const LL = G.readingLines(R), LB = G.readingLines(G.reading(good.slice(0, -1), F));
    ok("readingLines prints the checks, the means and each reading's word, and on a failed check only the failure", /^the checks hold/.test(LL[0]) && LL.some((l) => l.trim() === G.WORDS.S26[0]) && LL.some((l) => l.trim() === G.WORDS.SP[1]) && LL.some((l) => /^  HOMET16 /.test(l)) && LL.some((l) => /^  HOME16 /.test(l)) &&
        LB[0] === "A CHECK FAILED, AND THE READING IS NOT WEIGHED:" && LB.length === 2);
    const bad = (f) => { const v = JSON.parse(J(good)); f(v); return G.checkRecords(v, F); };
    const cases = [["a draw missing", (v) => v.splice(3, 1), /draw 4 is there 0 times/], ["a draw twice", (v) => v.splice(3, 0, JSON.parse(J(v[3]))), /draw 4 is there 2 times/],
        ["HOMEP's recipe", (v) => { v[2].recipe.trainEps = 4; }, /draw 3 is not HOME16's recipe/], ["another battery", (v) => { v[4].battery.base += 1; }, /draw 5 is not on its own battery/],
        ["weights not the ones named", (v) => { v[5].weightsHash = "0000000000000000"; }, /draw 6's weights are not the ones it names/], ["a home score past 1", (v) => { v[6].home = 1.2; }, /draw 7 does not hold/],
        ["no measures", (v) => { delete v[7].measures; }, /draw 8 does not hold/], ["no second audit", (v) => v.pop(), /audited a second time/], ["a second audit whose 26-type home differs", (v) => { v[12].home += 1e-9; }, /audited a second time/],
        ["a second audit whose plain home differs", (v) => { v[12].plain += 1e-9; }, /audited a second time/], ["a second audit of other weights", (v) => { v[12].weightsHash = v[3].weightsHash; }, /audited a second time/], ["another arm", (v) => { v[8].arm = "HOMET"; }, /draw 9 is not a registered draw/]];
    const f2 = cases.filter(([, f, re]) => !bad(f).some((m) => re.test(m))).map(([n]) => n);
    ok(`!! each of ${cases.length} broken record sets is refused by name`, f2.length === 0, f2.join(", "));
    const other = (k, lines) => ({ ...F, [k]: { sha256: "0".repeat(64), lines: lines || F[k].lines } }), short = (k, h) => ({ ...F, [k]: { sha256: h, lines: F[k].lines.slice(1) } });
    const NAME = { types: "scene-types", gradient: "home-gradient", scene: "scene-trained" }, first = (F2) => G.checkRecords(good, F2)[0] || "";
    const refused = Object.keys(NAME).every((k) => first(other(k)).startsWith(`the ${NAME[k]} round's file is not the one committed`) && G.reading(good, other(k)).S26 === null);
    const own = [["types", G.TYPES_SHA256, /^the scene-types round's file fails its own checks: /], ["gradient", G.GRADIENT_SHA256, /^the scene-types round's file fails its own checks: .*the gradient file fails its own checks: /],
        ["scene", G.TRAINED_SHA256, /^the scene-trained round's file fails its own checks: /]].every(([k, h, re]) => re.test(first(short(k, h))) && G.reading(good, short(k, h)).SP === null);
    ok("!! and the three files compared against are weighed first, each refusal NAMING THE FILE BROKEN: each another refused by its own hash, each failing its own checks refused (the home-gradient file's through the scene-types round's), and either leaves every reading null", refused && own);
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, G.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMET", "1"], ["job", "HOMET16", "13"], ["job", "HOMET16", "x"], ["job", "RECHECK", "2"], ["job", "HOMET16"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("!! the command's words, as arithmetic (parseArgs): run is four processes or --jobs of at least 1, read takes nothing, job HOMET16 takes a registered draw, job RECHECK only draw 1 -- and ten other shapes are not words",
        J(G.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(G.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(G.parseArgs(["read"])) === J({ cmd: "read" }) && J(G.parseArgs(["job", "HOMET16", "12"])) === J({ cmd: "job", arm: "HOMET16", s: 12 }) &&
        J(G.parseArgs(["job", "RECHECK", "1"])) === J({ cmd: "job", arm: "RECHECK", s: 1 }) && no.every((a) => G.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlySceneStrong.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, trains with the registered recipe, only the draws the file does not hold, then draw 1's weights audited again from the file, and prints no score",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flySceneStrong\.mjs"/.test(csrc) && !/flySceneTrained/.test(csrc) &&
        /args\.arm === "RECHECK" \? recheckOf\(args\.s\) : PF\.trainOne\(args\.s\)/.test(csrc) && /kind: "recheck", arm: "HOMET16", s, weightsHash: r\.weightsHash, \.\.\.PF\.auditOne\(r\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /const todo = PF\.SEEDS\.filter\(\(s\) => !done\.has\(s\)\);/.test(csrc) && /if \(!failed && !rechecked\)/.test(csrc) && /jobOnce\("RECHECK", PF\.SEEDS\[0\]\)/.test(csrc) && /jobOnce\("HOMET16", s\)/.test(csrc) &&
        /usage: node tools\/ship\/takeFlySceneStrong\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && !/console\.log\([^)]*\.(home|plain)\b/.test(csrc));
    const me = src("tools/ship/flySceneStrong-selfcheck.mjs"), calls = [...me.matchAll(/[GP]\.trainOne\(([^)]*\)?)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: every training here is of 2 iterations on draw 901 on its own 2 battery lives, audited on lives not the round's; it starts no process; the file's size and time are what they were",
        calls.length === 5 && (me.match(/G\.auditOne\(/g) || []).length === 2 && /G\.auditOne\(r7\)/.test(me) && calls.every((c) => /^901, (TINY|\{ \.\.\.TINY, trainEps: 4 \}), TWO, \[TWO\[0\]\], BAT\(901/.test(c)) && TINY.iters === 2 && !TWO.some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) &&
        !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `${calls.length} trainings, one audit of the round's (HOMET16 draw 7 in section 5); the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (the results file committed unread at b6c8aac8, then read once; HOMET16 draw 7 audited home again here in both scenes, a minute or two)");
section(() => {
    const RS = "2eaf6a3e33f37190ef5388d90a3b8dcbb9046bbe2b6bde1649f52884822e1754", RF = G.fileOf(fs.readFileSync(path.join(ENG, G.RESULTS))), R = G.reading(RF.lines, F), f4 = (x) => x.toFixed(4), m = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    ok("!! THE RESULTS FILE IS THE ONE COMMITTED UNREAD (sha256 2eaf6a3e...), 13 records, and its checks hold", RF.sha256 === RS && RF.lines.length === 13 && R.checks.length === 0, R.checks.join("; "));
    ok("!! S26 CANNOT (8 above, 4 below, p 0.39); SP CANNOT (2 above, 10 below, p 0.039)", R.S26.word === G.WORDS.S26[2] && R.S26.above === 8 && R.S26.below === 4 && R.S26.ties === 0 && R.S26.p.toExponential(3) === "3.877e-1" &&
        R.SP.word === G.WORDS.SP[2] && R.SP.above === 2 && R.SP.below === 10 && R.SP.ties === 0 && R.SP.p.toExponential(3) === "3.857e-2");
    const row = (a) => ["type", "plain", "course"].map((k) => f4(R.means[a][k])).join(" ");
    ok("the means the note prints: each fly's home in each scene and its course", row("homet16") === "0.5993 0.5502 0.7170" && row("home16") === "0.5900 0.5517 0.7149" && row("homet") === "0.6000 0.5474 0.7135");
    const d = G.SEEDS.map((s) => RF.lines.find((r) => r.kind === "draw" && r.s === s)), ht = G.SEEDS.map((s) => F.scene.lines.find((r) => r.kind === "draw" && r.s === s)), h16 = G.SEEDS.map((s) => N.committedOf("HOME16", s, F));
    const typ = (s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === "HOME16" && r.s === s).type.home, ab = (x) => { const t = signTest(x, 0); return `${t.above}/${t.below}`; }, pc = (r) => unpackWeights(r.weights)[2];
    const lift = d.map((r, i) => (r.home - r.plain) - (typ(G.SEEDS[i]) - h16[i].home)), kept = d.map((r) => r.keptAt);
    ok("!! DESCRIBED AFTER THE READING: against HOMET 5 of 12 in the 26-type scene (0.0007 below), 9 of 12 in the plain (0.0029 above); the lift wider than HOME16's in 10 of 12 (0.0491 against 0.0383, p 0.039); p_c above HOME16's in 9 (2.030 against 1.685), below HOMET's in 10 (2.132); kept from 4 to 56, 31.8 on average, HOMET's 32.9",
        ab(d.map((r, i) => r.home - ht[i].home)) === "5/7" && f4(-m(d.map((r, i) => r.home - ht[i].home))) === "0.0007" && ab(d.map((r, i) => r.plain - ht[i].plain)) === "9/3" && f4(m(d.map((r, i) => r.plain - ht[i].plain))) === "0.0029" &&
        ab(lift) === "10/2" && signTest(lift, 0).p.toFixed(3) === "0.039" && f4(m(d.map((r) => r.home - r.plain))) === "0.0491" && f4(m(G.SEEDS.map((s, i) => typ(s) - h16[i].home))) === "0.0383" &&
        ab(d.map((r, i) => pc(r) - h16[i].weights[2])) === "9/3" && m(d.map(pc)).toFixed(3) === "2.030" && m(h16.map((r) => r.weights[2])).toFixed(3) === "1.685" && ab(d.map((r, i) => pc(r) - pc(ht[i]))) === "2/10" && m(ht.map(pc)).toFixed(3) === "2.132" &&
        Math.min(...kept) === 4 && Math.max(...kept) === 56 && m(kept).toFixed(1) === "31.8" && m(ht.map((r) => r.keptAt)).toFixed(1) === "32.9");
    const r7 = d[6], again = G.auditOne(r7);
    ok("!! HOMET16 draw 7 audited again here: its home in the 26-type scene and in the plain, over the homing round's 200 audit lives, are the record's to the bit", r7.s === 7 && again.home === r7.home && again.plain === r7.plain);
    const note = src("brain/FLY_SCENE_STRONG_WIP.md").replace(/\s+/g, " "), back = src("brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md");
    ok("!! the note's section 10 says it: the file and its hash, both words, the means, both expectations came, what was described and what it does not mean; the backlog row DONE",
        /## 10\. The result \(the whole results file committed unread at b6c8aac8, then read once\)/.test(note) && /sha256 2eaf6a3e33f37190/.test(note) && note.includes("**S26: " + R.S26.word + "**") && note.includes("**SP: " + R.SP.word + "**") &&
        /\| HOMET16 \| 0\.5993 \| 0\.5502 \| 0\.7170 \|/.test(note) && /\| HOME16 \| 0\.5900 \| 0\.5517 \| 0\.7149 \|/.test(note) && /\| HOMET \| 0\.6000 \| 0\.5474 \| 0\.7135 \|/.test(note) &&
        /\*\*Both expectations came\*\*: S26 CANNOT \(65\) and SP CANNOT \(70\)/.test(note) && note.includes("**Described after the reading, not registered (the gate recomputes it from the records):**") &&
        /is above in 5 of 12 there \(0\.0007 below on average\)/.test(note) && note.includes("**What it does not mean.**") &&
        /\| `fly-scene-strong` \|[^\n]*\*\*REGISTERED[^\n]*DONE 2026-11-27[^\n]*S26 CANNOT \(8 of 12[^\n]*SP CANNOT \(2 of 12/.test(back));
});

console.log(`\nflySceneStrong-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
