// WebGLEngine/tools/ship/flySceneTrained-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flySceneTrained-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations on draws 901 and 902, on 2 battery lives, audited on 2
// homing lives and 1 course life, and it starts no process)
//
// THE GATE OF THE SCENE-TRAINED ROUND (registered in brain/FLY_SCENE_TRAINED_WIP.md before brain/rl/typedHomeTrainEnv.mjs, tools/ship/flySceneTrained.mjs and tools/ship/takeFlySceneTrained.mjs
// existed): HOMEP's fly and recipe trained in the 26-type scene -- does it come home better there than HOMEP trained in the plain one, and does it cost the plain scene?
//
//   1  THE ROUND'S NUMBERS      draws, recipe, audits, the scene; the scene-types round's file by its hash, passing its own checks; the registration says the same
//   2  THE TRAINING LIFE        the typed homing life, paid its score on the last tick and nothing before; the plain scene the plain training life to the bit
//   3  THE TRAINING             a training in the 26-type scene, the same twice, not the plain one's; in the plain scene HOMEP's training to the bit; its audits the scene-types round's measures
//   4  THE RECORDS              12 draws and a second audit, made here; R26, RP
//   5  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-26) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone, but K5 through tools/ship/voxelHome-selfcheck.mjs (which
// probes the command as a process); every one red by name but ONE (the number is the rows red):
//   THE LIFE: E1 paid every tick 3 | E2 its dist never moves 3 | E3 the plain life 3
//   THE ROUND: L1 trained in the plain scene 1 | L2 home audited in the plain 1 | L3 the plain audit in the 26-type 2 | L4 the measures in the plain 1 | L5 the shuffled fly 2 | L6 R26 against the
//   plain home 2 | L7 RP against the 26-type home 3 | L8 the recipe not checked 1 | L9 the battery not checked 1 | L10 the weights' hash not checked 1 | L11 the second audit's plain score not
//   compared 1 | L12 the scene-types file's own checks skipped 1 | L13 BETTER read as WORSE 3 | L14 the episodes not fresh 1 | L15 another battery 0 -- A FINDING -- then 1 |
//   N1 the scene-types file's hash another 3 | N2 the 11-class scene 2 | N3 the home audit the course lives 1
//   THE COMMAND: K1 another recipe 1 | K2 no second audit 1 | K3 the second audit of draw 2 1 | K4 the run prints a score 1 | K5 exits 0 on a word it does not know 1 (voxelHome)
//   THE NOTE: M1 its draws 8 1 | M2 its expectations moved 1
//   THE FINDING: at 2 iterations the battery chose the same point whichever lives it was, so the plain-scene row matched HOMEP's training on another battery; the row now compares the battery's
//   score at each iteration as well (the record's history), and L15 was run again: 1 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as P from "./flySceneTrained.mjs";
import * as S from "./flySceneTypes.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as V from "./flyCompass.mjs";
import { TypedHomeTrainEnv } from "../../brain/rl/typedHomeTrainEnv.mjs";
import { TypedHomeEnv } from "../../brain/rl/typedSceneEnv.mjs";
import { HomeTrainEnv } from "../../brain/rl/homeTrainEnv.mjs";
import { packWeights, unpackWeights } from "./paintingFly.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880111, 880112], TINY = Object.freeze({ ...P.RECIPE, iters: 2, pop: 4, trainEps: 1 }), BAT = (s) => ({ eps: 2, base: 881000 + s });
const F = Object.fromEntries(Object.entries(P.FILES).map(([k, f]) => [k, P.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flySceneTrained-selfcheck -- the scene-trained round (HOMEP's fly and recipe trained in the 26-type scene): the numbers, the training life, the training, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! HOMEP's draws, recipe and audits (the homing round's 200 lives home, the compass round's 200 on the course); the 26-type scene; alpha 0.01; one arm, HOMET; this round's own results file",
        P.SEEDS === T.SEEDS && J(P.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && P.RECIPE === T.RECIPE && P.AUDIT === T.AUDIT && P.COURSE_AUDIT === V.AUDIT && P.SCENE === "type" && P.ALPHA === 0.01 &&
        J(P.ARMS) === J(["HOMET"]) && P.RESULTS === "brain/flySceneTrainedRound.jsonl" && !Object.values(P.FILES).includes(P.RESULTS));
    ok("!! THE SCENE-TYPES ROUND'S FILE BY ITS HASH, and the tree has it today, passing its own checks", J(P.FILES) === J({ ...S.FILES, types: S.RESULTS }) && P.TYPES_SHA256 === "b615c753f69a97215609819fc9b2c5c4819b4f70e30c712007ae33d6fe61ba46" &&
        F.types.sha256 === P.TYPES_SHA256 && sha(S.RESULTS) === P.TYPES_SHA256 && S.checkRecords(F.types.lines, F).length === 0);
    const note = src("brain/FLY_SCENE_TRAINED_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: HOMET, HOMEP's fly and recipe in the 26-type scene, 12 draws; audited home in both scenes on the homing round's lives; R26 and RP; draw 1 audited twice; the expectations",
        /\*\*HOMET: HOMEP's fly and recipe, trained in the 26-type scene, 12 draws\*\*/.test(note) && /\*\*in the 26-type scene over the homing round's 200 audit lives\*\*/.test(note) && /\*\*in the plain scene\*\* over the same lives/.test(note) &&
        /\*\*R26: does training in the scene add to it\?\*\*/.test(note) && /\*\*RP: does it cost the plain scene\?\*\*/.test(note) && /\*\*HOMET draw 1's weights are audited a second time\*\*/.test(note) &&
        /R26: CANNOT about 60, BETTER 30, WORSE 10\. RP: CANNOT about 70, WORSE 20, BETTER 10\./.test(note));
});

console.log("\n2. THE TRAINING LIFE (brain/rl/typedHomeTrainEnv.mjs)");
section(() => {
    const walk = (env, ref) => { let o = env.reset(TWO[0]), q = ref.reset(TWO[0]), same = J(Array.from(o)) === J(Array.from(q)), paid = [], done = false, t = 0;
        while (!done) { const a = [0.15 * Math.sin(t++ / 37)], r = env.step(a), u = ref.step(a); same = same && J(Array.from(r.obs)) === J(Array.from(u.obs)) && r.done === u.done; paid.push([r.reward, r.info.dist]); done = r.done; }
        return { same, paid, score: ref.score() }; };
    const ty = walk(new TypedHomeTrainEnv("type"), new TypedHomeEnv("type")), last = ty.paid[ty.paid.length - 1];
    ok("!! IN THE 26-TYPE SCENE the training life is the typed homing life tick for tick, and pays nothing but its homing score on the last tick (its dist 1 less what is paid)",
        ty.same && ty.paid.length > 1 && ty.paid.slice(0, -1).every(([r, d]) => r === 0 && d === 1) && last[0] === ty.score && last[1] === 1 - ty.score && ty.score > 0);
    const pl = walk(new TypedHomeTrainEnv("all"), new HomeTrainEnv()), pr = (() => { const e = new HomeTrainEnv(); e.reset(TWO[0]); let done = false, t = 0, out = []; while (!done) { const r = e.step([0.15 * Math.sin(t++ / 37)]); out.push([r.reward, r.info.dist]); done = r.done; } return out; })();
    ok("in the plain scene (one class for all) it is brain/rl/homeTrainEnv.mjs's life to the bit, observations and pay", pl.same && J(pl.paid) === J(pr));
    const d = new TypedHomeTrainEnv("type"), e = new TypedHomeTrainEnv("all"); d.reset(TWO[1]); e.reset(TWO[1]);
    ok("and the 26-type scene is not the plain one: the ring sees other landmarks", J(Array.from(d._obs())) !== J(Array.from(e._obs())));
});

console.log("\n3. THE TRAINING (at 2 iterations on draws 901 and 902, 2 battery lives, audited on 2 homing lives and 1 course life)");
section(() => {
    const a = P.trainOne(901, TINY, TWO, [TWO[0]], BAT(901)), b = P.trainOne(901, TINY, TWO, [TWO[0]], BAT(901)), c = P.trainOne(902, TINY, TWO, [TWO[0]], BAT(902)), pa = P.trainOne(901, TINY, TWO, [TWO[0]], BAT(901), "all");
    ok("!! a training is a HOMET draw: its seed, recipe and battery recorded, three weights that are the ones it names, the best kept at an iteration it saw, the same twice and another for another draw",
        a.kind === "draw" && a.arm === "HOMET" && a.s === 901 && J(a.recipe) === J(TINY) && J(a.battery) === J(BAT(901)) && a.weightCount === 3 && unpackWeights(a.weights).length === 3 && a.keptAt >= 0 && a.keptAt < TINY.iters &&
        J(a) === J(b) && a.weightsHash !== c.weightsHash && a.history.length === TINY.iters);
    ok("!! IT TRAINS IN THE 26-TYPE SCENE: the same draw trained in the plain scene comes out other weights", pa.weightsHash !== a.weightsHash);
    const w = unpackWeights(a.weights), fl = () => T.flyOf("HOMEP", 901, w);
    ok("!! its audits: home in the 26-type scene and in the plain one are the scene-types round's homeIn there, its measures that round's measure in the 26-type scene; a second audit gives them again",
        a.home === S.homeIn(fl(), TWO, "type") && a.plain === S.homeIn(fl(), TWO, "all") && a.home !== a.plain && J(a.measures) === J(S.measure(fl(), [TWO[0]], "type")) && J(P.auditOne(a, TWO)) === J({ home: a.home, plain: a.plain }));
    const t2 = T.trainOne("HOMEP", 902, TINY, TWO, [TWO[0]]), p2 = P.trainOne(902, TINY, TWO, [TWO[0]], T.batteryOf(902), "all");
    ok("!! IN THE PLAIN SCENE IT IS HOMEP'S TRAINING TO THE BIT (the trained-to-home round's trainOne, same recipe, battery and seed; the battery's score at each iteration too): only the scene is changed",
        p2.weightsHash === t2.weightsHash && p2.keptAt === t2.keptAt && p2.plain === t2.home && J(p2.history) === J(t2.history) && p2.history.length === TINY.iters);
});

console.log("\n4. THE RECORDS (made here, from the committed HOMEP weights; the comparison numbers the committed ones)");
section(() => {
    const typed = (s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === "HOMEP" && r.s === s), com = (s) => N.committedOf("HOMEP", s, F);
    const made = (dt, dp) => { const ds = P.SEEDS.map((s, i) => ({ kind: "draw", arm: "HOMET", s, recipe: { ...P.RECIPE }, battery: T.batteryOf(s), weightCount: 3, weights: packWeights(com(s).weights), weightsHash: com(s).weightsHash, keptAt: 5,
        home: typed(s).type.home + dt(i), plain: com(s).home + dp(i), measures: { calm: 0.3, wind: 0.6, share: 0.8, gusts: 9, course: 0.7 }, history: [] }));
        return [...ds, { kind: "recheck", arm: "HOMET", s: 1, weightsHash: ds[0].weightsHash, home: ds[0].home, plain: ds[0].plain }]; };
    const up = () => 0.01, down = () => -0.01, mix = (i) => (i % 2 ? 0.01 : -0.01), good = made(up, mix);
    ok("!! the made records pass the checks: 12 draws once each, HOMEP's recipe on their own batteries, their weights the ones they name, and draw 1 audited the same twice", P.checkRecords(good, F).length === 0, P.checkRecords(good, F).join("; "));
    const R = P.reading(good, F), D = P.reading(made(down, down), F), Z = P.reading(made(() => 0, up), F);
    ok("!! R26 is read against HOMEP's home IN THE 26-TYPE SCENE and RP against its committed home: 12 up there BETTER, 12 down WORSE, half and half or ties CANNOT",
        R.R26.word === P.WORDS.R26[0] && R.R26.above === 12 && R.RP.word === P.WORDS.RP[2] && D.R26.word === P.WORDS.R26[1] && D.RP.word === P.WORDS.RP[1] && Z.R26.word === P.WORDS.R26[2] && Z.R26.ties === 12 && Z.RP.word === P.WORDS.RP[0]);
    const mid = (i) => (com(P.SEEDS[i]).home + typed(P.SEEDS[i]).type.home) / 2, X = P.reading(made((i) => mid(i) - typed(P.SEEDS[i]).type.home, (i) => mid(i) - com(P.SEEDS[i]).home), F);
    ok("!! and not the other way: both home scores halfway between HOMEP's plain home and its 26-type one -- under the 26-type, R26 WORSE; above the plain, RP BETTER",
        P.SEEDS.every((s) => typed(s).type.home > com(s).home) && X.R26.word === P.WORDS.R26[1] && X.RP.word === P.WORDS.RP[0]);
    ok("the means: HOMET's and HOMEP's in each scene, HOMEP's from the committed files", Math.abs(R.means.homet.type - R.means.homep.type - 0.01) < 1e-12 && Math.abs(R.means.homep.plain - P.SEEDS.reduce((a, s) => a + com(s).home, 0) / 12) < 1e-12);
    const L = P.readingLines(R), LB = P.readingLines(P.reading(good.slice(0, -1), F));
    ok("readingLines prints the checks, the means and each reading's word, and on a failed check only the failure", /^the checks hold/.test(L[0]) && L.some((l) => l.trim() === P.WORDS.R26[0]) && L.some((l) => l.trim() === P.WORDS.RP[2]) && L.some((l) => /^  HOMET /.test(l)) &&
        LB[0] === "A CHECK FAILED, AND THE READING IS NOT WEIGHED:" && LB.length === 2 && !LB.some((l) => /BETTER|WORSE/.test(l)));
    const bad = (f) => { const v = JSON.parse(J(good)); f(v); return P.checkRecords(v, F); };
    const cases = [["a draw missing", (v) => v.splice(3, 1), /draw 4 is there 0 times/], ["a draw twice", (v) => v.splice(3, 0, JSON.parse(J(v[3]))), /draw 4 is there 2 times/],
        ["another recipe", (v) => { v[2].recipe.iters = 61; }, /draw 3 is not HOMEP's recipe/], ["another battery", (v) => { v[4].battery.base += 1; }, /draw 5 is not on its own battery/],
        ["weights not the ones named", (v) => { v[5].weightsHash = "0000000000000000"; }, /draw 6's weights are not the ones it names/], ["a home score past 1", (v) => { v[6].home = 1.2; }, /draw 7 does not hold/],
        ["no measures", (v) => { delete v[7].measures; }, /draw 8 does not hold/], ["no second audit", (v) => v.pop(), /audited a second time/], ["a second audit that differs", (v) => { v[12].plain += 1e-9; }, /audited a second time/],
        ["another arm", (v) => { v[8].arm = "HOMEP"; }, /draw 9 is not a registered draw/]];
    const fails2 = cases.filter(([, f, re]) => !bad(f).some((m) => re.test(m))).map(([n]) => n);
    ok(`!! each of ${cases.length} broken record sets is refused by name: a draw missing or twice, another recipe or battery, weights not the ones named, a score past 1, no measures, no second audit or one that differs, another arm`, fails2.length === 0, fails2.join(", "));
    const G = { ...F, types: { sha256: "0".repeat(64), lines: F.types.lines } }, H2 = { ...F, types: { sha256: P.TYPES_SHA256, lines: F.types.lines.slice(1) } };
    ok("!! and the scene-types round's file is weighed first: another file refused by its hash, one that fails its own checks refused, and either leaves every reading null",
        /is not the one committed/.test(P.checkRecords(good, G)[0]) && /fails its own checks/.test(P.checkRecords(good, H2)[0]) && P.reading(good, G).R26 === null && P.reading(good, H2).RP === null);
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, P.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMEP", "1"], ["job", "HOMET", "13"], ["job", "HOMET", "x"], ["job", "RECHECK", "2"], ["job", "HOMET"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("!! the command's words, as arithmetic (parseArgs): run is four processes or --jobs of at least 1, read takes nothing, job HOMET takes a registered draw, job RECHECK only draw 1 -- and ten other shapes are not words",
        J(P.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(P.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(P.parseArgs(["read"])) === J({ cmd: "read" }) && J(P.parseArgs(["job", "HOMET", "12"])) === J({ cmd: "job", arm: "HOMET", s: 12 }) &&
        J(P.parseArgs(["job", "RECHECK", "1"])) === J({ cmd: "job", arm: "RECHECK", s: 1 }) && no.every((a) => P.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlySceneTrained.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains with the registered recipe and audits, only the draws the file does not hold, then draw 1's weights audited again from the file",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flySceneTrained\.mjs"/.test(csrc) &&
        /args\.arm === "RECHECK" \? recheckOf\(args\.s\) : PF\.trainOne\(args\.s\)/.test(csrc) && /kind: "recheck", arm: "HOMET", s, weightsHash: r\.weightsHash, \.\.\.PF\.auditOne\(r\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /const todo = PF\.SEEDS\.filter\(\(s\) => !done\.has\(s\)\);/.test(csrc) && /if \(!failed && !rechecked\)/.test(csrc) && /jobOnce\("RECHECK", PF\.SEEDS\[0\]\)/.test(csrc) && /usage: node tools\/ship\/takeFlySceneTrained\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) &&
        !/console\.log\([^)]*\.(home|plain)\b/.test(csrc));
    const me = src("tools/ship/flySceneTrained-selfcheck.mjs"), calls = [...me.matchAll(/P\.trainOne\(([^)]*\)?)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: every training here is of 2 iterations on draw 901 or 902, audited on lives not the round's; it starts no process; the file's size and time are what they were",
        calls.length === 5 && calls.every((c) => /^90[12], TINY, TWO, \[TWO\[0\]\]/.test(c)) && TINY.iters === 2 && !TWO.some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) &&
        !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflySceneTrained-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
