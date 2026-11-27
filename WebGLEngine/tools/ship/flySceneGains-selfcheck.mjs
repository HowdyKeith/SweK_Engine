// WebGLEngine/tools/ship/flySceneGains-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flySceneGains-selfcheck.mjs      (about a minute; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations on draw 901, on 2 battery lives, audited on 2 homing lives
// and 1 course life, and it starts no process)
//
// THE GATE OF THE SCENE-GAINS ROUND (registered in brain/FLY_SCENE_GAINS_WIP.md before brain/rl/classGainFly.mjs, tools/ship/flySceneGains.mjs and tools/ship/takeFlySceneGains.mjs existed):
// the compass fly with a gain for each of the 11 ring classes, trained with HOMEP's recipe in the 26-type scene -- does it come home better there than HOMET, and in the plain scene?
//
//   1  THE ROUND'S NUMBERS      draws, recipe, audits, the scene; the scene-trained round's file by its hash, passing its own checks; the registration says the same
//   2  THE FLY                  with every gain 1 HOMEP's fly to the bit; a class's gain scales its ring neurons alone; a gain below 0 is 0; 14 weights
//   3  THE TRAINING             in the 26-type scene, the same twice, not the plain one's; its gains and audits the fly's
//   4  THE RECORDS              12 draws and a second audit, made here; G26, GP, the gains and the broken sets
//   5  THE COMMAND              it is this round's; no training of the round's, no process
//   6  THE VERDICT              the committed results file by its hash; its checks, G26 and GP, the means and gains, what was described after the reading; HOMEG draw 5 audited again to the bit; the note says it
// SABOTAGE LOG (2026-11-27) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the
// command as a process); every one red by name, none 0 (the number is the rows red):
//   Y1 the gains not applied 2 | Y2 the gains not held at 0 3 | Y3 a gain for each of the 26 types 5 | Y4 trained in the plain scene 1 | Y5 G26 against HOMET's plain 1 | Y6 GP against HOMET's 26-type 1 |
//   Y7 the gains not checked 1 | Y8 three weights taken 1 | Y9 the second audit's plain not compared 1 | Y10 the scene-trained file's own checks skipped 1 | Y11 a class off only below 0 2 |
//   Y12 BETTER read as WORSE 2 | K1 the command runs HOMET's jobs 1 | K2 the command's usage another 2 (voxelHome) | M1 an expectation moved 1
//   THE VERDICT (after the reading, the same runner, this gate alone): V1 the results file's hash another 1 | V2 alpha 0.05 1 (both readings CANNOT at either alpha, so it is red
//   by section 1's pinned constant) | V3 G26 against HOMET's plain home 3 | V4 a class off below 0.5 1 | V5 a mean in the note's table 1 | V6 the note's ER4d 10 of 12 1 |
//   V7 an expectation in section 10 moved 1 | V8 the backlog row G26 BETTER 1 | V9 the re-audit compared to draw 6 1 | V10 the class that stands out ER3d 1 -- every one red by name, none 0
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as G from "./flySceneGains.mjs";
import * as P from "./flySceneTrained.mjs";
import * as S from "./flySceneTypes.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as V from "./flyCompass.mjs";
import { CLASSES, NG } from "../../brain/rl/classGainFly.mjs";
import { classesOf } from "../../brain/rl/typedSceneEnv.mjs";
import { NR } from "../../brain/rl/compassEnv.mjs";
import { packWeights, hashWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880111, 880112], TINY = Object.freeze({ ...G.RECIPE, iters: 2, pop: 4, trainEps: 1 }), BAT = (s) => ({ eps: 2, base: 881000 + s });
const F = Object.fromEntries(Object.entries(G.FILES).map(([k, f]) => [k, G.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flySceneGains-selfcheck -- the scene-gains round (a gain for each ring class, trained in the 26-type scene): the numbers, the fly, the training, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! HOMEP's draws, recipe and audits; the 26-type scene; alpha 0.01; one arm, HOMEG; this round's own results file", G.SEEDS === T.SEEDS && G.RECIPE === T.RECIPE && G.AUDIT === T.AUDIT && G.COURSE_AUDIT === V.AUDIT && G.SCENE === "type" && G.ALPHA === 0.01 &&
        J(G.ARMS) === J(["HOMEG"]) && G.RESULTS === "brain/flySceneGainsRound.jsonl" && !Object.values(G.FILES).includes(G.RESULTS));
    ok("!! THE SCENE-TRAINED ROUND'S FILE BY ITS HASH, and the tree has it today, passing its own checks", J(G.FILES) === J({ ...P.FILES, scene: P.RESULTS }) && G.TRAINED_SHA256 === "116ab243838357674e7f33f7fdaf695ede878cbf34b3a93c291b3b344a59429d" &&
        F.scene.sha256 === G.TRAINED_SHA256 && sha(P.RESULTS) === G.TRAINED_SHA256 && P.checkRecords(F.scene.lines, F).length === 0);
    const note = src("brain/FLY_SCENE_GAINS_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the fly, HOMEG on 12 draws in the 26-type scene audited home in both, G26 and GP against HOMET, draw 1 twice, the expectations",
        /\*\*The compass fly with each ring neuron's activity multiplied by its class's gain\*\* \(held at 0 and above\)/.test(note) && /\*\*HOMEG: that fly, trained with HOMEP's recipe in the 26-type scene, 12 draws\*\*/.test(note) &&
        /\*\*in the 26-type scene and in the plain scene over the homing round's 200 audit lives\*\*/.test(note) && /\*\*G26: do the class gains help in the 26-type scene\?\*\* HOMEG's home there less HOMET's\./.test(note) &&
        /\*\*GP: do they cost the plain scene\?\*\* HOMEG's home in the plain scene less HOMET's there\./.test(note) && /\*\*HOMEG draw 1's weights are audited a second time\.\*\*/.test(note) &&
        /G26: CANNOT about 55, BETTER 35, WORSE 10\. GP: CANNOT about 75, WORSE 15, BETTER 10\./.test(note));
});

console.log("\n2. THE FLY (brain/rl/classGainFly.mjs)");
section(() => {
    const c = N.committedOf("HOMEP", 4, F), w14 = [...c.weights, ...Array(NG).fill(1)];
    ok("!! 11 classes, the scene-types round's (a type up to its first underscore, sorted), 14 weights, the start the compass fly's with every gain 1", NG === 11 && J(CLASSES) === J(classesOf("class")) && CLASSES.cls.length === NR && G.flyOf(4).paramCount() === 14 &&
        J(Array.from(G.flyOf(4).getParams())) === J([0, 0, 1, ...Array(11).fill(1)]));
    ok("!! WITH EVERY GAIN 1 IT IS HOMEP'S FLY TO THE BIT: untrained, and with HOMEP draw 4's committed weights, home in both scenes on the gate's 2 lives",
        S.homeIn(G.flyOf(4), TWO, "type") === S.homeIn(T.flyOf("HOMEP", 4), TWO, "type") && S.homeIn(G.flyOf(4, w14), TWO, "type") === S.homeIn(T.flyOf("HOMEP", 4, c.weights), TWO, "type") && S.homeIn(G.flyOf(4, w14), TWO, "all") === S.homeIn(T.flyOf("HOMEP", 4, c.weights), TWO, "all"));
    const off = (k) => { const w = [...w14]; w[3 + k] = 0; return w; }, neg = [...w14]; neg[3 + 2] = -0.5;
    ok("!! a class's gain is that class's: a class at 0 flies otherwise, a gain below 0 is a gain of 0 to the bit (gains() reads 0), and the weights come back as set", S.homeIn(G.flyOf(4, off(2)), TWO, "type") !== S.homeIn(G.flyOf(4, w14), TWO, "type") &&
        S.homeIn(G.flyOf(4, neg), TWO, "type") === S.homeIn(G.flyOf(4, off(2)), TWO, "type") && G.flyOf(4, neg).gains()[2] === 0 && J(Array.from(G.flyOf(4, neg).getParams())) === J(Array.from(Float32Array.from(neg))) &&
        (() => { try { G.flyOf(4, c.weights); return false; } catch (e) { return /14 weights \(got 3\)/.test(e.message); } })());
    const gw = Array.from({ length: NG }, (_, k) => 0.5 + k / 7), q = G.flyOf(4, [...c.weights, ...gw]), ref = T.flyOf("HOMEP", 4, c.weights), o = new Float64Array(NR + 2).map((_, j) => 0.2 + 0.05 * Math.sin(j)), sc = Float64Array.from(o);
    for (let j = 0; j < NR; j++) sc[j] = o[j] * Math.fround(gw[CLASSES.cls[j]]);
    const a1 = q.act(o), a2 = ref.act(sc), b1 = q.act(o), b2 = ref.act(sc);
    ok("!! and it reads the ring through the gains alone: two ticks of it are the compass fly's two ticks given each ring neuron's activity times its class's gain, to the bit (turn and heading)", J(a1) === J(a2) && J(b1) === J(b2) && q.phi === ref.phi && J(a1) !== J(T.flyOf("HOMEP", 4, c.weights).act(o)));
});

console.log("\n3. THE TRAINING (at 2 iterations on draw 901, 2 battery lives, audited on 2 homing lives and 1 course life)");
section(() => {
    const a = G.trainOne(901, TINY, TWO, [TWO[0]], BAT(901)), b = G.trainOne(901, TINY, TWO, [TWO[0]], BAT(901)), pl = G.trainOne(901, TINY, TWO, [TWO[0]], BAT(901), "all");
    ok("!! a training is a HOMEG draw: its seed, recipe and battery recorded, 14 weights that are the ones it names, the same twice, and in the 26-type scene (the plain one's training comes out other weights)",
        a.kind === "draw" && a.arm === "HOMEG" && a.s === 901 && J(a.recipe) === J(TINY) && J(a.battery) === J(BAT(901)) && a.weightCount === 14 && unpackWeights(a.weights).length === 14 && J(a) === J(b) && a.weightsHash !== pl.weightsHash && a.history.length === 2);
    const w = unpackWeights(a.weights);
    ok("!! its gains are its weights' (held at 0), its audits home in each scene the fly's, its measures the scene-types round's measure in the 26-type scene; a second audit gives them again",
        J(a.gains) === J(G.flyOf(901, w).gains()) && a.home === S.homeIn(G.flyOf(901, w), TWO, "type") && a.plain === S.homeIn(G.flyOf(901, w), TWO, "all") && J(a.measures) === J(S.measure(G.flyOf(901, w), [TWO[0]], "type")) && J(G.auditOne(a, TWO)) === J({ home: a.home, plain: a.plain }));
});

console.log("\n4. THE RECORDS (made here, from the committed HOMET weights with gains set here)");
section(() => {
    const homet = (s) => F.scene.lines.find((r) => r.kind === "draw" && r.s === s);
    const made = (dt, dp, gk = () => 1) => { const ds = G.SEEDS.map((s, i) => { const w = Float32Array.from([...unpackWeights(homet(s).weights), ...Array.from({ length: NG }, (_, k) => gk(k, i))]);
        return { kind: "draw", arm: "HOMEG", s, recipe: { ...G.RECIPE }, battery: T.batteryOf(s), weightCount: 14, weights: packWeights(w), weightsHash: hashWeights(w), keptAt: 5, gains: G.flyOf(s, w).gains(), home: homet(s).home + dt(i), plain: homet(s).plain + dp(i), measures: { calm: 0.3, wind: 0.6, share: 0.8, gusts: 9, course: 0.7 }, history: [] }; });
        return [...ds, { kind: "recheck", arm: "HOMEG", s: 1, weightsHash: ds[0].weightsHash, home: ds[0].home, plain: ds[0].plain }]; };
    const good = made(() => 0.01, () => -0.01, (k, i) => (k === 0 && i < 5 ? -0.2 : 1 + k / 10));
    ok("!! the made records pass the checks: 12 draws once each, HOMEP's recipe on their own batteries, 14 weights the ones they name and their gains, and draw 1 audited the same twice", G.checkRecords(good, F).length === 0, G.checkRecords(good, F).join("; "));
    const R = G.reading(good, F), Z = G.reading(made(() => 0, () => 0), F);
    ok("!! G26 and GP are read against HOMET's home in each scene: 12 up in the 26-type BETTER and 12 down in the plain WORSE; the same to the bit CANNOT (ties)",
        R.G26.word === G.WORDS.G26[0] && R.G26.above === 12 && R.GP.word === G.WORDS.GP[1] && R.GP.below === 12 && Z.G26.word === G.WORDS.G26[2] && Z.G26.ties === 12 && Z.GP.ties === 12);
    ok("!! the gains described: each class's mean over the 12 draws (held at 0) and how many draws switch it off, in the classes' order",
        R.gains.length === 11 && R.gains[0].cls === "ER1" && R.gains[0].off === 5 && Math.abs(R.gains[0].mean - 7 / 12) < 1e-6 && R.gains[3].off === 0 && Math.abs(R.gains[3].mean - 1.3) < 1e-6 && J(R.gains.map((g) => g.cls)) === J(CLASSES.keys));
    ok("the means: HOMEG's and HOMET's in each scene and their p_c", Math.abs(R.means.homeg.type - R.means.homet.type - 0.01) < 1e-12 && Math.abs(R.means.homeg.plain - R.means.homet.plain + 0.01) < 1e-12 && Math.abs(R.means.homeg.pc - R.means.homet.pc) < 1e-6);
    const LL = G.readingLines(R), LB = G.readingLines(G.reading(good.slice(0, -1), F));
    ok("readingLines prints the checks, the means, the gains and each reading's word, and on a failed check only the failure", /^the checks hold/.test(LL[0]) && LL.some((l) => l.trim() === G.WORDS.G26[0]) && LL.some((l) => l.trim() === G.WORDS.GP[1]) && LL.some((l) => /ER1 0\.58 \(5\)/.test(l)) &&
        LB[0] === "A CHECK FAILED, AND THE READING IS NOT WEIGHED:" && LB.length === 2);
    const bad = (f) => { const v = JSON.parse(J(good)); f(v); return G.checkRecords(v, F); };
    const cases = [["a draw missing", (v) => v.splice(3, 1), /draw 4 is there 0 times/], ["a draw twice", (v) => v.splice(3, 0, JSON.parse(J(v[3]))), /draw 4 is there 2 times/],
        ["another recipe", (v) => { v[2].recipe.trainEps = 16; }, /draw 3 is not HOMEP's recipe/], ["another battery", (v) => { v[4].battery.eps = 16; }, /draw 5 is not on its own battery/],
        ["weights not the ones named", (v) => { v[5].weightsHash = "0000000000000000"; }, /draw 6's weights are not the ones it names/], ["three weights", (v) => { const w = unpackWeights(v[6].weights).slice(0, 3); v[6].weights = packWeights(w); v[6].weightCount = 3; v[6].weightsHash = hashWeights(w); }, /draw 7's weights are not the ones it names/],
        ["gains not the weights'", (v) => { v[1].gains[4] = 9; }, /draw 2's gains are not its weights'/], ["a home score past 1", (v) => { v[7].home = 1.2; }, /draw 8 does not hold/], ["no measures", (v) => { delete v[8].measures; }, /draw 9 does not hold/],
        ["no second audit", (v) => v.pop(), /audited a second time/], ["a second audit whose 26-type home differs", (v) => { v[12].home += 1e-9; }, /audited a second time/], ["a second audit whose plain home differs", (v) => { v[12].plain += 1e-9; }, /audited a second time/],
        ["another arm", (v) => { v[9].arm = "HOMET"; }, /draw 10 is not a registered draw/]];
    const f2 = cases.filter(([, f, re]) => !bad(f).some((m) => re.test(m))).map(([n]) => n);
    ok(`!! each of ${cases.length} broken record sets is refused by name`, f2.length === 0, f2.join(", "));
    const G1 = { ...F, scene: { sha256: "0".repeat(64), lines: F.scene.lines } }, H2 = { ...F, scene: { sha256: G.TRAINED_SHA256, lines: F.scene.lines.slice(1) } };
    ok("!! and the scene-trained round's file is weighed first: another refused by its hash, one that fails its own checks refused, and either leaves every reading null",
        /is not the one committed/.test(G.checkRecords(good, G1)[0]) && /fails its own checks/.test(G.checkRecords(good, H2)[0]) && G.reading(good, G1).G26 === null && G.reading(good, H2).GP === null);
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, G.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMET", "1"], ["job", "HOMEG", "13"], ["job", "HOMEG", "x"], ["job", "RECHECK", "2"], ["job", "HOMEG"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("!! the command's words, as arithmetic (parseArgs): run is four processes or --jobs of at least 1, read takes nothing, job HOMEG takes a registered draw, job RECHECK only draw 1 -- and ten other shapes are not words",
        J(G.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(G.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(G.parseArgs(["read"])) === J({ cmd: "read" }) && J(G.parseArgs(["job", "HOMEG", "12"])) === J({ cmd: "job", arm: "HOMEG", s: 12 }) &&
        J(G.parseArgs(["job", "RECHECK", "1"])) === J({ cmd: "job", arm: "RECHECK", s: 1 }) && no.every((a) => G.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlySceneGains.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, trains with the registered recipe, only the draws the file does not hold, then draw 1's weights audited again from the file, and prints no score",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flySceneGains\.mjs"/.test(csrc) && !/flySceneMixed|flySceneTrained/.test(csrc) &&
        /args\.arm === "RECHECK" \? recheckOf\(args\.s\) : PF\.trainOne\(args\.s\)/.test(csrc) && /kind: "recheck", arm: "HOMEG", s, weightsHash: r\.weightsHash, \.\.\.PF\.auditOne\(r\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /const todo = PF\.SEEDS\.filter\(\(s\) => !done\.has\(s\)\);/.test(csrc) && /if \(!failed && !rechecked\)/.test(csrc) && /jobOnce\("RECHECK", PF\.SEEDS\[0\]\)/.test(csrc) && /jobOnce\("HOMEG", s\)/.test(csrc) &&
        /usage: node tools\/ship\/takeFlySceneGains\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && !/console\.log\([^)]*\.(home|plain)\b/.test(csrc));
    const me = src("tools/ship/flySceneGains-selfcheck.mjs"), calls = [...me.matchAll(/G\.trainOne\(([^)]*\)?)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: every training here is of 2 iterations on draw 901 on its own 2 battery lives, audited on lives not the round's; it starts no process; the file's size and time are what they were",
        calls.length === 3 && (me.match(/G\.auditOne\(/g) || []).length === 2 && /G\.auditOne\(r5\)/.test(me) && calls.every((c) => /^901, TINY, TWO, \[TWO\[0\]\], BAT\(901/.test(c)) && TINY.iters === 2 && !TWO.some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) &&
        !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `${calls.length} trainings, one audit of the round's (HOMEG draw 5 in section 6); the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (the results file committed unread at 69e4f26a, then read once; HOMEG draw 5 audited home again here in both scenes, a minute or two)");
section(() => {
    const RS = "3eaf89494e2645ea55be355e054e1992b6f80024d983961b225fc72545ab85cd", RF = G.fileOf(fs.readFileSync(path.join(ENG, G.RESULTS))), R = G.reading(RF.lines, F), f4 = (x) => x.toFixed(4), m = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    ok("!! THE RESULTS FILE IS THE ONE COMMITTED UNREAD (sha256 3eaf8949...), 13 records, and its checks hold", RF.sha256 === RS && RF.lines.length === 13 && R.checks.length === 0, R.checks.join("; "));
    ok("!! G26 CANNOT (5 above, 7 below, p 0.77); GP CANNOT (6 above, 6 below, p 1.0)", R.G26.word === G.WORDS.G26[2] && R.G26.above === 5 && R.G26.below === 7 && R.G26.ties === 0 && R.G26.p.toExponential(3) === "7.744e-1" &&
        R.GP.word === G.WORDS.GP[2] && R.GP.above === 6 && R.GP.below === 6 && R.GP.ties === 0 && R.GP.p.toExponential(3) === "1.000e+0");
    const row = (a) => [f4(R.means[a].type), f4(R.means[a].plain), f4(R.means[a].course), R.means[a].pc.toFixed(3)].join(" ");
    ok("the means and gains the note prints", row("homeg") === "0.5943 0.5471 0.7178 1.989" && row("homet") === "0.6000 0.5474 0.7135 2.132" &&
        R.gains.map((g) => `${g.cls} ${g.mean.toFixed(2)} (${g.off})`).join(", ") === "ER1 0.87 (3), ER2 1.26 (0), ER3a 0.90 (0), ER3d 1.16 (1), ER3m 0.73 (1), ER3p 1.21 (0), ER3w 1.30 (1), ER4d 1.59 (0), ER4m 0.67 (2), ER5 1.14 (0), ER6 0.99 (2)");
    const d = G.SEEDS.map((s) => RF.lines.find((r) => r.kind === "draw" && r.s === s)), ht = G.SEEDS.map((s) => F.scene.lines.find((r) => r.kind === "draw" && r.s === s)), hp = G.SEEDS.map((s) => N.committedOf("HOMEP", s, F));
    const typ = (s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === "HOMEP" && r.s === s).type.home, offs = d.map((r) => r.gains.filter((g) => g === 0).length), ab = (x) => { const t = signTest(x, 0); return `${t.above}/${t.below}`; };
    const gi = (k) => CLASSES.keys.indexOf(k), above1 = (k) => d.filter((r) => r.gains[gi(k)] > 1).length;
    ok("!! DESCRIBED AFTER THE READING: six draws switch a class off, ten in all; ER4d above 1 in 11 of 12 (never below 0.81), ER2 in 10; the lift narrower than HOMET's in 8 of 12 (0.0054), p_c lower in 9; course the same (6/6); against HOMEP 6 of 12 in each scene",
        offs.filter((x) => x > 0).length === 6 && offs.reduce((a, b) => a + b, 0) === 10 && above1("ER4d") === 11 && Math.min(...d.map((r) => r.gains[gi("ER4d")])).toFixed(2) === "0.81" && above1("ER2") === 10 &&
        ab(d.map((r, i) => (r.home - r.plain) - (ht[i].home - ht[i].plain))) === "4/8" && f4(-m(d.map((r, i) => (r.home - r.plain) - (ht[i].home - ht[i].plain)))) === "0.0054" &&
        ab(d.map((r, i) => unpackWeights(r.weights)[2] - unpackWeights(ht[i].weights)[2])) === "3/9" && ab(d.map((r, i) => r.measures.course - ht[i].measures.course)) === "6/6" &&
        ab(d.map((r, i) => r.home - typ(G.SEEDS[i]))) === "6/6" && ab(d.map((r, i) => r.plain - hp[i].home)) === "6/6");
    const r5 = d[4], again = G.auditOne(r5);
    ok("!! HOMEG draw 5 audited again here: its home in the 26-type scene and in the plain, over the homing round's 200 audit lives, are the record's to the bit", r5.s === 5 && again.home === r5.home && again.plain === r5.plain);
    const note = src("brain/FLY_SCENE_GAINS_WIP.md").replace(/\s+/g, " "), back = src("brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md");
    ok("!! the note's section 10 says it: the file and its hash, both words, the means and gains, both expectations came, what was described and what it does not mean; the backlog row DONE",
        /## 10\. The result \(the whole results file committed unread at 69e4f26a, then read once\)/.test(note) && /sha256 3eaf89494e2645ea/.test(note) && note.includes("**G26: " + R.G26.word + "**") && note.includes("**GP: " + R.GP.word + "**") &&
        /\| HOMEG \| 0\.5943 \| 0\.5471 \| 0\.7178 \| 1\.989 \|/.test(note) && /\| HOMET \| 0\.6000 \| 0\.5474 \| 0\.7135 \| 2\.132 \|/.test(note) && note.includes("ER4d 1.59 (0), ER4m 0.67 (2)") &&
        /\*\*Both expectations came\*\*: G26 CANNOT \(55\) and GP CANNOT \(75\)/.test(note) && note.includes("**Described after the reading, not registered (the gate recomputes it from the records):**") &&
        /ER4d's gain is above 1 in 11 draws of 12 \(mean 1\.59, never below 0\.81\)/.test(note) && note.includes("**What it does not mean.**") &&
        /\| `fly-scene-gains` \|[^\n]*\*\*REGISTERED[^\n]*DONE 2026-11-27[^\n]*G26 CANNOT \(5 of 12[^\n]*GP CANNOT \(6 of 12/.test(back));
});

console.log(`\nflySceneGains-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
