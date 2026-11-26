// WebGLEngine/tools/ship/flySceneTypes-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flySceneTypes-selfcheck.mjs      (about twenty seconds; IT NEVER RUNS THE ROUND -- its one fly is flown on 1 course life and 2 homing lives, and it starts no process)
//
// THE GATE OF THE SCENE-TYPES ROUND (registered in brain/FLY_SCENE_TYPES_WIP.md before brain/rl/typedSceneEnv.mjs, tools/ship/flySceneTypes.mjs and tools/ship/takeFlySceneTypes.mjs existed):
// when each class of ring neuron sees its own two landmarks, do the committed flies read the scene better and come home better?
//   1  THE ROUND'S NUMBERS      draws, audits, arms, scenes; the compass-error round's file by its hash, passing its own checks; the registration says the same
//   2  THE SCENE                the classes and types from the connectome's ring types; each class's two landmarks, the first the life's own; the life otherwise the plain one; the plain
//                               scene the plain life to the bit, and the round's measures there the compass-error round's
//   3  THE RECORDS              48 flies and a second one; H11, C11, W11, H26
//   4  THE COMMAND              it is this round's; no flight of the round's, no process
// SABOTAGE LOG (2026-11-26) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the scene's, the library's and the note's, this gate
// and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's; every one red by name but THREE (the number is the rows red):
//   THE SCENE: S1 the class the type up to the last underscore 0 -- NOT A GAP: no ring type has two underscores, so the classes are the same -- replaced by the class the type's first three
//   letters 2 | S2 the first class not the life's own 1 | S3 the scene stream the life's seed 1 | S4 three landmarks a class 1 | S5 the plain scene typed too 0 -- NOT A GAP: with one class the
//   typed formula is the plain one to the bit -- replaced by the plain scene with a landmark more 2 | S6 the tuning narrower 1
//   THE ROUND: F1 the measures in the plain scene 1 | F2 home in the plain scene 1 | F3 H11 against the 26-type scene 1 | F4 W11 the calm 1 | F5 H26 against the plain 0 -- A FINDING -- then 1 |
//   F6 BETTER and WORSE swapped 1 | F7 the error file's own checks skipped 1 | F8 the weights not checked 1 | F9 the second fly's type scene not compared 1 | F10 the round writes the error
//   round's file 1
//   THE COMMAND: K1 exits 0 on a word it does not know 1 | K2 the job flies on lives of its own 1 | K3 the file's flies not counted as done 1 | K4 the second fly never in the pool 1 | K5 the
//   second fly recorded as a fly 1 | K6 reads without the committed files 1.   THE NOTE: M1 its classes 10 1 | M2 its salt another 1 | M3 it drops HOMEP draw 1 again 1
//   THE FINDING: section 3's made 26-type scene was above both the plain and the 11-class, so H26 read against either came out the same; a 26-type scene above the plain and under the 11-class
//   was added, and F5 was run again: 1 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as S from "./flySceneTypes.mjs";
import * as E from "./flyCompassError.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import * as TS from "../../brain/rl/typedSceneEnv.mjs";
import { RING_TYPES } from "../../brain/compassRingTopology.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880111, 880112];
const F = Object.fromEntries(Object.entries(S.FILES).map(([k, f]) => [k, S.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flySceneTypes-selfcheck -- the scene-types round (each ring class sees its own two landmarks; the committed flies, untrained for it): the numbers, the scene, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! the compass-error round's draws, arms and audits; the scenes 11 classes and 26 types; alpha 0.01; this round's own results file; the compass-error round's words",
        S.SEEDS === E.SEEDS && S.AUDIT === E.AUDIT && S.COURSE_AUDIT === E.COURSE_AUDIT && S.ARMS === E.ARMS && J(S.SCENES) === J(["class", "type"]) && S.ALPHA === 0.01 && S.RESULTS === "brain/flySceneTypesRound.jsonl" &&
        !Object.values(S.FILES).includes(S.RESULTS) && J(S.parseArgs(["job", "COURSE64", "7"])) === J(E.parseArgs(["job", "COURSE64", "7"])));
    ok("!! THE COMPASS-ERROR ROUND'S FILE BY ITS HASH, and the tree has it today, passing its own checks", J(S.FILES) === J({ ...E.FILES, error: E.RESULTS }) && S.ERROR_SHA256 === "b8c649c2d5946ece9f0fa7ae717ef4a86a177bc9a5d99b66658ca0c2c7cccd8a" && F.error.sha256 === S.ERROR_SHA256 && E.checkRecords(F.error.lines, F).length === 0);
    const note = src("brain/FLY_SCENE_TYPES_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: a class the type up to the first underscore, 11 classes; each its own two, the first the life's own, the rest from a stream of the life's own; the finer scene 26 types; the 48 flies; H11, C11, W11, H26; HOMEP draw 1 again",
        /\*\*Each ring neuron's class\*\* is its type \(`RING_TYPES`\) up to the first underscore/.test(note) && /\*\*11 classes\*\*/.test(note) && /\*\*Each class sees two landmarks of its own\*\*/.test(note) && /\*\*a stream of the life's own \(its seed XOR 0x165667b1\)\*\*/.test(note) &&
        /\*\*The finer scene gives each of the 26 types its own two the same way\.\*\*/.test(note) && /\*\*H11: does the fly come home better in the 11-class scene\?\*\*/.test(note) && /\*\*H26: is the finer scene better still\?\*\*/.test(note) && /\*\*HOMEP draw 1 is flown a second time\.\*\*/.test(note) && TS.SCENE_SALT === 0x165667b1);
});

console.log("\n2. THE SCENE (brain/rl/typedSceneEnv.mjs)");
section(() => {
    const k11 = TS.classesOf("class"), k26 = TS.classesOf("type"), k1 = TS.classesOf("all");
    ok("!! THE CLASSES ARE THE CONNECTOME'S RING TYPES: up to the first underscore, the 11 of ER1 to ER6, every ring neuron in one; by full type, 26; the plain scene one for all; another scene refused",
        J(k11.keys) === J(["ER1", "ER2", "ER3a", "ER3d", "ER3m", "ER3p", "ER3w", "ER4d", "ER4m", "ER5", "ER6"]) && k11.cls.length === CE.NR && RING_TYPES.every((t, j) => k11.keys[k11.cls[j]] === t.split("_")[0]) &&
        k26.keys.length === 26 && RING_TYPES.every((t, j) => k26.keys[k26.cls[j]] === t) && J(k1.keys) === J(["all"]) && throws(() => TS.classesOf("pixel"), /no scene pixel/) && J(TS.MODES) === J(["all", "class", "type"]));
    const seed = 30000001, plain = new CE.CompassEnv(), t11 = new TS.TypedCompassEnv("class"), all = new TS.TypedCompassEnv("all"), p0 = plain.reset(seed), o11 = t11.reset(seed), a0 = all.reset(seed);
    const r = CE.stream((seed ^ 0x165667b1) >>> 0), sets = k11.keys.map((_, g) => (g === 0 ? plain.marks : [0, 1].map(() => ({ az: r() * 2 * Math.PI, s: 0.5 + r() }))));
    const byHand = Array.from({ length: CE.NR }, (_, j) => sets[k11.cls[j]].reduce((v, m) => v + m.s * Math.exp(CE.KR * (Math.cos(CE.wrap(m.az - 0) - CE.PREF[j]) - 1)), 0));
    ok("!! EACH CLASS'S TWO LANDMARKS: the first class the life's own two, the others drawn from the life's own scene stream; a ring neuron's activity the plain formula over its class's two, by hand",
        J(t11.sets[0]) === J(plain.marks) && t11.sets.length === 11 && t11.sets.every((m) => m.length === 2) && J(t11.sets) === J(sets) && Array.from(o11).slice(0, CE.NR).every((v, j) => v === byHand[j]) && o11[CE.GOAL] === p0[CE.GOAL] && o11[CE.CLOCK] === 0);
    const acts = Array.from({ length: 1500 }, (_, t) => [0.15 * Math.sin(t / 41)]); let lifeSame = true, plainSame = J(Array.from(a0)) === J(Array.from(p0));
    for (const a of acts) { const p = plain.step(a), q = t11.step(a), z = all.step(a); lifeSame = lifeSame && plain.th === t11.th && plain.goal === t11.goal && p.reward === q.reward; plainSame = plainSame && J(Array.from(z.obs)) === J(Array.from(p.obs)); }
    ok("!! THE LIFE IS THE PLAIN ONE BUT FOR THE SCENE: with the same turns, the true heading, the goals and the rewards of every tick are the plain life's; and the plain scene (one class for all) is the plain life to the bit, every observation; the compass and homing lives are the bytes committed",
        lifeSame && plainSame && sha("brain/rl/compassEnv.mjs") === "65e75180725ed0b28f17d8e0305ce8dc4395fa1c30a5809f1ec350a290aff1c5" && sha("brain/rl/homeEnv.mjs") === "d75957c82576d1fa2f98f93a90a56e573282ae96192c7f03f3c4f1aba4bf5e25");
    const c = N.committedOf("HOME16", 6, F), fly = () => T.flyOf("HOMEP", 6, c.weights);
    ok("!! THE ROUND'S MEASURES IN THE PLAIN SCENE ARE THE COMPASS-ERROR ROUND'S TO THE BIT, and its home score the homing round's", J(S.measure(fly(), [TWO[0]], "all")) === J(E.measure(fly(), [TWO[0]])) && S.homeIn(fly(), TWO, "all") === H.homeScore(fly(), TWO));
    const rec = S.flyOne("HOME16", 6, F, [TWO[0]], TWO);
    ok("!! A RECORD IS ITS ARM'S COMMITTED FLY IN EACH SCENE: the measures on the course lives given and home with its own tally on the homing lives given",
        rec.kind === "fly" && rec.arm === "HOME16" && rec.s === 6 && rec.weightsHash === c.weightsHash && ["class", "type"].every((m) => J(rec[m]) === J({ ...S.measure(fly(), [TWO[0]], m), home: S.homeIn(fly(), TWO, m) })), `class home ${rec.class.home.toFixed(3)}, type ${rec.type.home.toFixed(3)}`);
});

console.log("\n3. THE RECORDS (made here; the plain scene's numbers the committed ones)");
section(() => {
    const err = (arm, s) => F.error.lines.find((r) => r.kind === "fly" && r.arm === arm && r.s === s);
    const rec = (arm, s, d) => { const e = err(arm, s).trained, h = N.committedOf(arm, s, F).home, m = (dc, dw, dh, dh2) => ({ calm: e.calm, wind: e.wind + dw, share: 0.7, gusts: 100, course: e.course + dc, home: Math.min(1, Math.max(0, h + dh + dh2)) });
        return { kind: "fly", arm, s, weightsHash: err(arm, s).weightsHash, class: m(d.c, d.w, d.h, 0), type: m(d.c, d.w, d.h, d.t) }; };
    const file = (d, again = 1) => { const out = []; for (const arm of S.ARMS) for (const s of S.SEEDS) out.push(rec(arm, s, d)); const f = out.find((r) => r.arm === "HOMEP" && r.s === again); out.push({ kind: "recheck", arm: "HOMEP", s: 1, class: f.class, type: f.type }); return out; };
    const up = { c: 0.05, w: -0.1, h: 0.04, t: 0.01 }, good = file(up), R = S.reading(good, F), lines = S.readingLines(R).join("\n"), bad = (recs, re) => S.checkRecords(recs, F).some((x) => re.test(x)), at = (arm, s, g) => good.map((r) => (r.kind === "fly" && r.arm === arm && r.s === s ? g(r) : r));
    ok("!! a file of 48 flies and the second one passes every check; a fly missing, not its committed weights, without a scene's measures, the second of another draw or another type-scene score, or the compass-error round's file not committed or failing its checks, each fails by name",
        S.checkRecords(good, F).length === 0 && good.length === 49 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.kind === "fly" && r.arm === "HOMEP" && r.s === 11)), /HOMEP draw 11 is there 0 times/) &&
        bad(at("COURSE64", 2, (r) => ({ ...r, weightsHash: "0".repeat(16) })), /COURSE64 draw 2 is not its arm's committed weights/) && bad(at("H16BYC", 3, (r) => ({ ...r, type: { ...r.type, home: null } })), /H16BYC draw 3 does not hold its measures and home score in each scene/) &&
        bad(file(up, 2), /HOMEP draw 1 flown a second time is not there once/) && bad(good.map((r) => (r.kind === "recheck" ? { ...r, type: { ...r.type, home: r.type.home + 1e-12 } } : r)), /HOMEP draw 1 flown a second time is not there once/) &&
        J(S.checkRecords(good, { ...F, error: { ...F.error, sha256: "0".repeat(64) } })) === J(["the compass-error round's file is not the one committed (sha256 b8c649c2d5946ece...)"]) &&
        J(S.checkRecords(good, { ...F, error: { ...F.error, lines: F.error.lines.filter((r) => !(r.kind === "fly" && r.arm === "HOME16" && r.s === 2)) } })) === J(["the compass-error round's file fails its own checks: HOME16 draw 2 is there 0 times (once is registered)"]));
    const down = S.reading(file({ c: -0.05, w: 0.1, h: -0.04, t: -0.01 }), F), flat = S.reading(file({ c: 0, w: 0, h: 0, t: 0 }), F), split = S.reading(file({ c: 0.05, w: 0, h: -0.02, t: 0 }), F), finer = S.reading(file({ c: 0, w: 0, h: 0.04, t: -0.01 }), F), noR = S.reading(good.filter((r) => r.kind !== "recheck"), F);
    ok("!! H11, C11 AND W11 ARE THE 11-CLASS SCENE LESS THE COMMITTED (home, course) AND THE COMPASS-ERROR ROUND'S (wind), H26 THE 26-TYPE LESS THE 11-CLASS HOME, sign tests over the 48: each in its direction so, each the other way the other, each at 0 CANNOT; course up with home down reads them apart; the 26-type scene above the plain but under the 11-class is H26 WORSE",
        R.H11.word === S.WORDS.H11[0] && R.C11.word === S.WORDS.C11[0] && R.W11.word === S.WORDS.W11[1] && R.H26.word === S.WORDS.H26[0] && R.H11.above === 48 && down.H11.word === S.WORDS.H11[1] && down.C11.word === S.WORDS.C11[1] && down.W11.word === S.WORDS.W11[0] && down.H26.word === S.WORDS.H26[1] &&
        ["H11", "C11", "W11", "H26"].every((k) => flat[k].ties === 48 && flat[k].word === S.WORDS[k][2]) && split.C11.word === S.WORDS.C11[0] && split.H11.word === S.WORDS.H11[1] && split.W11.ties === 48 && finer.H26.word === S.WORDS.H26[1] && finer.H26.below === 48 && /H11: above 48, below 0, ties 0/.test(lines) && noR.H11 === null && /^A CHECK FAILED/.test(S.readingLines(noR)[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, S.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const csrc = src("tools/ship/takeFlySceneTypes.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, flies with the registered audits, only what the file does not hold, HOMEP draw 1 a second time in the same pool",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flySceneTypes\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.flyOne\(args\.arm, args\.s, committedFiles\(\)\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) &&
        /for \(const arm of PF\.ARMS\) for \(const s of PF\.SEEDS\) if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s, false\]\)/.test(csrc) && /if \(!rechecked\) todo\.splice\(Math\.min\(1, todo\.length\), 0, \["HOMEP", PF\.SEEDS\[0\], true\]\)/.test(csrc) &&
        /again \? \{ kind: "recheck", arm, s, class: rec\.class, type: rec\.type \} : rec/.test(csrc) && /usage: node tools\/ship\/takeFlySceneTypes\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flySceneTypes-selfcheck.mjs"), calls = [...me.matchAll(/S\.flyOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one fly is flown on 1 course life and 2 homing lives, not the round's; it starts no process; the file's size and time are what they were",
        J(calls) === J(['"HOME16", 6, F, [TWO[0]], TWO']) && !TWO.some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflySceneTypes-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
