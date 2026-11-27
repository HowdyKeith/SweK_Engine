// WebGLEngine/tools/ship/flySceneMixed-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flySceneMixed-selfcheck.mjs      (about a minute; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations on draw 901, on 2 battery lives, audited on 2 homing lives
// and 1 course life, and it starts no process)
//
// THE GATE OF THE SCENE-MIXED ROUND (registered in brain/FLY_SCENE_MIXED_WIP.md before brain/rl/mixedHomeTrainEnv.mjs, tools/ship/flySceneMixed.mjs and tools/ship/takeFlySceneMixed.mjs
// existed): HOMEP's fly and recipe trained on lives of both scenes -- does it keep the 26-type scene's home (against HOMET) and the plain's (against HOMEP)?
//
//   1  THE ROUND'S NUMBERS      draws, recipe, audits; the scene-trained round's file by its hash, passing its own checks; the registration says the same
//   2  THE MIXED LIFE           an odd seed the 26-type scene's training life to the bit, an even one the plain's; a tried fly's 4 lives two of each, the battery's 64 thirty-two of each
//   3  THE TRAINING             on the mixed life, the same twice; not the 26-type alone nor the plain alone; on the 26-type life alone it is the scene-trained round's training to the bit
//   4  THE RECORDS              12 draws and a second audit, made here; M26, MP and the broken sets
//   5  THE COMMAND              it is this round's; no training of the round's, no process
//   6  THE VERDICT              the committed results file by its hash; its checks, M26 and MP, the means, what was described after the reading; HOMEM draw 9 audited again to the bit; the note says it
// SABOTAGE LOG (2026-11-27) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the
// command as a process); every one red by name, none 0 (the number is the rows red):
//   X1 the scenes by parity swapped 1 | X2 every life the 26-type scene's 2 | X3 trained on the plain life 1 | X4 M26 against HOMEP's 26-type home 2 | X5 MP against HOMET's plain home 3 |
//   X6 the recipe not checked 1 | X7 the battery not checked 1 | X8 the hash not checked 1 | X9 the second audit's plain not compared 1 | X10 the scene-trained file's own checks skipped 1 |
//   X11 BETTER read as WORSE 2 | K1 the command runs HOMET's jobs 2 | K2 no second audit 1 | K3 the command's usage another 2 (voxelHome) | M1 an expectation moved 1
//   THE VERDICT (after the reading, the same runner, this gate alone): V1 the results file's hash another 1 | V2 alpha 0.05 3 | V3 M26 against HOMET's plain home 4 | V4 a mean in
//   the note's table 1 | V5 the note's plain against HOMET 7 above 1 | V6 an expectation in section 10 moved 1 | V7 the backlog row M26 WORSE 1 | V8 the re-audit compared to draw 8 1 |
//   V9 HOMEM against HOMEP's plain, not HOMET's 1 -- every one red by name, none 0
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as M from "./flySceneMixed.mjs";
import * as P from "./flySceneTrained.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as V from "./flyCompass.mjs";
import { MixedHomeTrainEnv, sceneOf } from "../../brain/rl/mixedHomeTrainEnv.mjs";
import { TypedHomeTrainEnv } from "../../brain/rl/typedHomeTrainEnv.mjs";
import { packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880111, 880112], TINY = Object.freeze({ ...M.RECIPE, iters: 2, pop: 4, trainEps: 2 }), BAT = (s) => ({ eps: 2, base: 881000 + s });
const F = Object.fromEntries(Object.entries(M.FILES).map(([k, f]) => [k, M.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flySceneMixed-selfcheck -- the scene-mixed round (HOMEP's fly and recipe trained on lives of both scenes): the numbers, the mixed life, the training, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! HOMEP's draws, recipe and audits; alpha 0.01; one arm, HOMEM; this round's own results file", M.SEEDS === T.SEEDS && M.RECIPE === T.RECIPE && M.AUDIT === T.AUDIT && M.COURSE_AUDIT === V.AUDIT && M.ALPHA === 0.01 && J(M.ARMS) === J(["HOMEM"]) &&
        M.RESULTS === "brain/flySceneMixedRound.jsonl" && !Object.values(M.FILES).includes(M.RESULTS));
    ok("!! THE SCENE-TRAINED ROUND'S FILE BY ITS HASH, and the tree has it today, passing its own checks", J(M.FILES) === J({ ...P.FILES, scene: P.RESULTS }) && M.TRAINED_SHA256 === "116ab243838357674e7f33f7fdaf695ede878cbf34b3a93c291b3b344a59429d" &&
        F.scene.sha256 === M.TRAINED_SHA256 && sha(P.RESULTS) === M.TRAINED_SHA256 && P.checkRecords(F.scene.lines, F).length === 0);
    const note = src("brain/FLY_SCENE_MIXED_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the mixed life by the seed's parity, HOMEM on 12 draws audited home in both scenes, M26 against HOMET and MP against HOMEP, draw 1 twice, the expectations",
        /\*\*The mixed training life is the 26-type scene's on a life whose seed is odd and the plain scene's on one whose seed is even\*\*/.test(note) && /\*\*HOMEM: HOMEP's fly and recipe, trained on the mixed life, 12 draws\*\*/.test(note) &&
        /\*\*in the 26-type scene and in the plain scene over the homing round's 200 audit lives\*\*/.test(note) && /\*\*M26: does it keep the 26-type scene's gain\?\*\* HOMEM's home in the 26-type scene less HOMET's there\./.test(note) &&
        /\*\*MP: does it keep the plain scene\?\*\* HOMEM's home in the plain scene less HOMEP's committed home\./.test(note) && /\*\*HOMEM draw 1's weights are audited a second time\.\*\*/.test(note) &&
        /M26: CANNOT about 80, WORSE 15, BETTER 5\. MP: CANNOT about 80, WORSE 10, BETTER 10\./.test(note));
});

console.log("\n2. THE MIXED LIFE (brain/rl/mixedHomeTrainEnv.mjs)");
section(() => {
    const walk = (env, ref, seed) => { let o = env.reset(seed), q = ref.reset(seed), same = J(Array.from(o)) === J(Array.from(q)), done = false, t = 0, n = 0;
        while (!done) { const a = [0.15 * Math.sin(t++ / 37)], r = env.step(a), u = ref.step(a); same = same && J(Array.from(r.obs)) === J(Array.from(u.obs)) && r.reward === u.reward && r.done === u.done && J(r.info) === J(u.info); done = r.done; n++; }
        return same && n > 1 && env.score() === ref.score(); };
    const m = new MixedHomeTrainEnv();
    ok("!! AN ODD SEED IS THE 26-TYPE SCENE'S TRAINING LIFE AND AN EVEN ONE THE PLAIN'S, tick for tick, observations, pay and score -- one mixed life after another", walk(m, new TypedHomeTrainEnv("type"), 880111) && m.scene === "type" &&
        walk(m, new TypedHomeTrainEnv("all"), 880112) && m.scene === "all" && walk(m, new TypedHomeTrainEnv("type"), 880113) && sceneOf(1) === "type" && sceneOf(2) === "all" && m.maxSteps === new TypedHomeTrainEnv("type").maxSteps);
    const dsrc = src("brain/rl/dockPolicy.js"), lifeSeeds = (base, k) => Array.from({ length: k }, (_, j) => base + j * 17), count = (v) => v.filter((x) => sceneOf(x) === "type").length;
    ok("!! the trainer's lives step by 17 from their first (brain/rl/dockPolicy.js), so a tried fly's 4 fresh lives are two of each scene at every iteration, and each draw's 64 battery lives thirty-two of each",
        /\(opts\.seedBase === undefined \? 5000 : opts\.seedBase\) \+ k \* 17/.test(dsrc) && /5000 \+ 104729 \* \(it \+ 1\)/.test(dsrc) && Array.from({ length: 60 }, (_, it) => count(lifeSeeds(5000 + 104729 * (it + 1), 4))).every((c) => c === 2) &&
        M.SEEDS.every((s) => count(lifeSeeds(T.batteryOf(s).base, 64)) === 32));
});

console.log("\n3. THE TRAINING (at 2 iterations on draw 901, 2 battery lives, audited on 2 homing lives and 1 course life)");
section(() => {
    const a = M.trainOne(901, TINY, TWO, [TWO[0]], BAT(901)), b = M.trainOne(901, TINY, TWO, [TWO[0]], BAT(901));
    const ty = M.trainOne(901, TINY, TWO, [TWO[0]], BAT(901), () => new TypedHomeTrainEnv("type")), pl = M.trainOne(901, TINY, TWO, [TWO[0]], BAT(901), () => new TypedHomeTrainEnv("all"));
    ok("!! a training is a HOMEM draw on the mixed life: its seed, recipe and battery recorded, three weights that are the ones it names, the same twice, and not the 26-type life's alone nor the plain's alone",
        a.kind === "draw" && a.arm === "HOMEM" && a.s === 901 && J(a.recipe) === J(TINY) && J(a.battery) === J(BAT(901)) && a.weightCount === 3 && J(a) === J(b) && a.weightsHash !== ty.weightsHash && a.weightsHash !== pl.weightsHash && ty.weightsHash !== pl.weightsHash);
    const p2 = P.trainOne(901, TINY, TWO, [TWO[0]], BAT(901), "type"), { arm, ...r1 } = ty, { arm: a2, ...r2 } = p2;
    ok("!! ON THE 26-TYPE LIFE ALONE IT IS THE SCENE-TRAINED ROUND'S TRAINING TO THE BIT, every field but the arm's name (the battery's score at each iteration too); its audit is that round's", J(r1) === J(r2) && arm === "HOMEM" && a2 === "HOMET" && J(M.auditOne(a, TWO)) === J({ home: a.home, plain: a.plain }) && a.home !== a.plain);
});

console.log("\n4. THE RECORDS (made here, from the committed HOMET weights; the comparison numbers the committed ones)");
section(() => {
    const homet = (s) => F.scene.lines.find((r) => r.kind === "draw" && r.s === s), com = (s) => N.committedOf("HOMEP", s, F);
    const made = (dt, dp) => { const ds = M.SEEDS.map((s, i) => ({ ...JSON.parse(J(homet(s))), arm: "HOMEM", home: homet(s).home + dt(i), plain: com(s).home + dp(i) }));
        return [...ds, { kind: "recheck", arm: "HOMEM", s: 1, weightsHash: ds[0].weightsHash, home: ds[0].home, plain: ds[0].plain }]; };
    const up = () => 0.01, down = () => -0.01, good = made(up, down);
    ok("!! the made records pass the checks: 12 draws once each, HOMEP's recipe on their own batteries, their weights the ones they name, and draw 1 audited the same twice", M.checkRecords(good, F).length === 0, M.checkRecords(good, F).join("; "));
    const R = M.reading(good, F), Z = M.reading(made(() => 0, () => 0), F);
    ok("!! M26 IS READ AGAINST HOMET'S HOME IN THE 26-TYPE SCENE and MP against HOMEP's committed home: 12 up BETTER, 12 down WORSE, the same to the bit CANNOT (ties)",
        R.M26.word === M.WORDS.M26[0] && R.M26.above === 12 && R.MP.word === M.WORDS.MP[1] && R.MP.below === 12 && Z.M26.word === M.WORDS.M26[2] && Z.M26.ties === 12 && Z.MP.word === M.WORDS.MP[2] && Z.MP.ties === 12);
    const X = M.reading(made((i) => com(M.SEEDS[i]).home + 0.3 - homet(M.SEEDS[i]).home, (i) => homet(M.SEEDS[i]).plain - 0.3 - com(M.SEEDS[i]).home), F);
    ok("!! and not swapped: home in the 26-type scene far above HOMEP's plain home but at HOMET's 26-type home less nothing is not BETTER by the wrong one -- 0.3 above HOMEP's plain, 0.3 below HOMET's plain",
        X.M26.diffs.every((d, i) => Math.abs(d - (com(M.SEEDS[i]).home + 0.3 - homet(M.SEEDS[i]).home)) < 1e-12) && X.MP.diffs.every((d, i) => Math.abs(d - (homet(M.SEEDS[i]).plain - 0.3 - com(M.SEEDS[i]).home)) < 1e-12) && X.MP.word === M.WORDS.MP[1]);
    ok("the means: HOMEM's, HOMET's (the scene-trained round's file) and HOMEP's (committed) in each scene", Math.abs(R.means.homem.type - R.means.homet.type - 0.01) < 1e-12 && Math.abs(R.means.homem.plain - R.means.homep.plain + 0.01) < 1e-12 && Math.abs(R.means.homet.type - 0.6000) < 1e-4);
    const LL = M.readingLines(R), LB = M.readingLines(M.reading(good.slice(0, -1), F));
    ok("readingLines prints the checks, the means and each reading's word, and on a failed check only the failure", /^the checks hold/.test(LL[0]) && LL.some((l) => l.trim() === M.WORDS.M26[0]) && LL.some((l) => l.trim() === M.WORDS.MP[1]) && LL.some((l) => /^  HOMEM /.test(l)) && LL.some((l) => /^  HOMEP /.test(l)) &&
        LB[0] === "A CHECK FAILED, AND THE READING IS NOT WEIGHED:" && LB.length === 2);
    const bad = (f) => { const v = JSON.parse(J(good)); f(v); return M.checkRecords(v, F); };
    const cases = [["a draw missing", (v) => v.splice(3, 1), /draw 4 is there 0 times/], ["a draw twice", (v) => v.splice(3, 0, JSON.parse(J(v[3]))), /draw 4 is there 2 times/],
        ["another recipe", (v) => { v[2].recipe.iters = 61; }, /draw 3 is not HOMEP's recipe/], ["another battery", (v) => { v[4].battery.base += 1; }, /draw 5 is not on its own battery/],
        ["weights not the ones named", (v) => { v[5].weightsHash = "0000000000000000"; }, /draw 6's weights are not the ones it names/], ["a home score past 1", (v) => { v[6].home = 1.2; }, /draw 7 does not hold/],
        ["no measures", (v) => { delete v[7].measures; }, /draw 8 does not hold/], ["no second audit", (v) => v.pop(), /audited a second time/], ["a second audit whose 26-type home differs", (v) => { v[12].home += 1e-9; }, /audited a second time/],
        ["a second audit whose plain home differs", (v) => { v[12].plain += 1e-9; }, /audited a second time/], ["a second audit of other weights", (v) => { v[12].weightsHash = v[3].weightsHash; }, /audited a second time/], ["another arm", (v) => { v[8].arm = "HOMET"; }, /draw 9 is not a registered draw/]];
    const f2 = cases.filter(([, f, re]) => !bad(f).some((m) => re.test(m))).map(([n]) => n);
    ok(`!! each of ${cases.length} broken record sets is refused by name`, f2.length === 0, f2.join(", "));
    const G = { ...F, scene: { sha256: "0".repeat(64), lines: F.scene.lines } }, H2 = { ...F, scene: { sha256: M.TRAINED_SHA256, lines: F.scene.lines.slice(1) } };
    ok("!! and the scene-trained round's file is weighed first: another refused by its hash, one that fails its own checks refused, and either leaves every reading null",
        /is not the one committed/.test(M.checkRecords(good, G)[0]) && /fails its own checks/.test(M.checkRecords(good, H2)[0]) && M.reading(good, G).M26 === null && M.reading(good, H2).MP === null);
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, M.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMET", "1"], ["job", "HOMEM", "13"], ["job", "HOMEM", "x"], ["job", "RECHECK", "2"], ["job", "HOMEM"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("!! the command's words, as arithmetic (parseArgs): run is four processes or --jobs of at least 1, read takes nothing, job HOMEM takes a registered draw, job RECHECK only draw 1 -- and ten other shapes are not words",
        J(M.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(M.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(M.parseArgs(["read"])) === J({ cmd: "read" }) && J(M.parseArgs(["job", "HOMEM", "12"])) === J({ cmd: "job", arm: "HOMEM", s: 12 }) &&
        J(M.parseArgs(["job", "RECHECK", "1"])) === J({ cmd: "job", arm: "RECHECK", s: 1 }) && no.every((a) => M.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlySceneMixed.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, trains with the registered recipe on the mixed life, only the draws the file does not hold, then draw 1's weights audited again from the file, and prints no score",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flySceneMixed\.mjs"/.test(csrc) && !/flySceneTrained/.test(csrc) &&
        /args\.arm === "RECHECK" \? recheckOf\(args\.s\) : PF\.trainOne\(args\.s\)/.test(csrc) && /kind: "recheck", arm: "HOMEM", s, weightsHash: r\.weightsHash, \.\.\.PF\.auditOne\(r\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /const todo = PF\.SEEDS\.filter\(\(s\) => !done\.has\(s\)\);/.test(csrc) && /if \(!failed && !rechecked\)/.test(csrc) && /jobOnce\("RECHECK", PF\.SEEDS\[0\]\)/.test(csrc) && /jobOnce\("HOMEM", s\)/.test(csrc) &&
        /usage: node tools\/ship\/takeFlySceneMixed\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && !/console\.log\([^)]*\.(home|plain)\b/.test(csrc));
    const me = src("tools/ship/flySceneMixed-selfcheck.mjs"), calls = [...me.matchAll(/[MP]\.trainOne\(([^)]*\)?)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: every training here is of 2 iterations on draw 901 on its own 2 battery lives, audited on lives not the round's; it starts no process; the file's size and time are what they were",
        calls.length === 5 && (me.match(/M\.auditOne\(/g) || []).length === 2 && /M\.auditOne\(r9\)/.test(me) && calls.every((c) => /^901, TINY, TWO, \[TWO\[0\]\], BAT\(901/.test(c)) && TINY.iters === 2 && !TWO.some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) &&
        !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `${calls.length} trainings, one audit of the round's (HOMEM draw 9 in section 6); the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (the results file committed unread at 608d47d2, then read once; HOMEM draw 9 audited home again here in both scenes, a minute or two)");
section(() => {
    const RS = "77c2543175f9f65e11df190b1c9c5c4c6bada91b40a8e257cdf24d3088770966", RF = M.fileOf(fs.readFileSync(path.join(ENG, M.RESULTS))), R = M.reading(RF.lines, F), f4 = (x) => x.toFixed(4), m = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    ok("!! THE RESULTS FILE IS THE ONE COMMITTED UNREAD (sha256 77c25431...), 13 records, and its checks hold", RF.sha256 === RS && RF.lines.length === 13 && R.checks.length === 0, R.checks.join("; "));
    ok("!! M26 CANNOT (6 above, 6 below, p 1.0); MP CANNOT (2 above, 10 below, p 0.039)", R.M26.word === M.WORDS.M26[2] && R.M26.above === 6 && R.M26.below === 6 && R.M26.ties === 0 && R.M26.p.toExponential(3) === "1.000e+0" &&
        R.MP.word === M.WORDS.MP[2] && R.MP.above === 2 && R.MP.below === 10 && R.MP.ties === 0 && R.MP.p.toExponential(3) === "3.857e-2");
    const row = (a) => ["type", "plain", "course"].map((k) => f4(R.means[a][k])).join(" ");
    ok("the means the note prints: each fly's home in each scene and its course", row("homem") === "0.5996 0.5483 0.7150" && row("homet") === "0.6000 0.5474 0.7135" && row("homep") === "0.5911 0.5501 0.7130");
    const d = M.SEEDS.map((s) => RF.lines.find((r) => r.kind === "draw" && r.s === s)), ht = M.SEEDS.map((s) => F.scene.lines.find((r) => r.kind === "draw" && r.s === s)), hp = M.SEEDS.map((s) => N.committedOf("HOMEP", s, F));
    const typ = (s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === "HOMEP" && r.s === s).type.home, wm = (v) => [0, 1, 2].map((j) => m(v.map((x) => x[j])).toFixed(3)).join(" ");
    const tP = signTest(d.map((r, i) => r.plain - ht[i].plain), 0), tL = signTest(d.map((r, i) => (r.home - r.plain) - (ht[i].home - ht[i].plain)), 0), tC = signTest(d.map((r, i) => unpackWeights(r.weights)[2] - unpackWeights(ht[i].weights)[2]), 0);
    const tT = signTest(d.map((r, i) => r.home - typ(M.SEEDS[i])), 0);
    ok("!! DESCRIBED AFTER THE READING: against HOMET in the plain 6 above, 6 below (0.0009), its lift 7 above, 5 below, p_c 5 above, 7 below; the weights 1.018 -0.616 2.098 against HOMET's 0.996 -0.604 2.132 and HOMEP's 0.955 -0.760 1.768; against HOMEP in the 26-type 10 of 12 (p 0.039, 0.0086); HOMEP's edge in the plain 0.0018",
        `${tP.above}/${tP.below}` === "6/6" && f4(m(d.map((r, i) => r.plain - ht[i].plain))) === "0.0009" && `${tL.above}/${tL.below}` === "7/5" && `${tC.above}/${tC.below}` === "5/7" &&
        wm(d.map((r) => unpackWeights(r.weights))) === "1.018 -0.616 2.098" && wm(ht.map((r) => unpackWeights(r.weights))) === "0.996 -0.604 2.132" && wm(hp.map((r) => r.weights)) === "0.955 -0.760 1.768" &&
        `${tT.above}/${tT.below}` === "10/2" && tT.p.toFixed(3) === "0.039" && f4(m(d.map((r, i) => r.home - typ(M.SEEDS[i])))) === "0.0086" && f4(-m(R.MP.diffs)) === "0.0018");
    const r9 = d[8], again = M.auditOne(r9);
    ok("!! HOMEM draw 9 audited again here: its home in the 26-type scene and in the plain, over the homing round's 200 audit lives, are the record's to the bit", r9.s === 9 && again.home === r9.home && again.plain === r9.plain);
    const note = src("brain/FLY_SCENE_MIXED_WIP.md").replace(/\s+/g, " "), back = src("brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md");
    ok("!! the note's section 10 says it: the file and its hash, both words, the means, both expectations came, what was described and what it does not mean; the backlog row DONE",
        /## 10\. The result \(the whole results file committed unread at 608d47d2, then read once\)/.test(note) && /sha256 77c2543175f9f65e/.test(note) && note.includes("**M26: " + R.M26.word + "**") && note.includes("**MP: " + R.MP.word + "**") &&
        /\| HOMEM \| 0\.5996 \| 0\.5483 \| 0\.7150 \|/.test(note) && /\| HOMET \| 0\.6000 \| 0\.5474 \| 0\.7135 \|/.test(note) && /\| HOMEP \| 0\.5911 \| 0\.5501 \| 0\.7130 \|/.test(note) &&
        /\*\*Both expectations came\*\*: M26 CANNOT \(80\) and MP CANNOT \(80\)/.test(note) && note.includes("**Described after the reading, not registered (the gate recomputes it from the records):**") &&
        /Against HOMET it is the same in the plain scene too \(6 above, 6 below, p 1\.0; 0\.0009 on average\)/.test(note) && note.includes("**What it does not mean.**") &&
        /\| `fly-scene-mixed` \|[^\n]*\*\*REGISTERED[^\n]*DONE 2026-11-27[^\n]*M26 CANNOT \(6 of 12[^\n]*MP CANNOT \(2 of 12/.test(back));
});

console.log(`\nflySceneMixed-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
