// WebGLEngine/tools/ship/flyHomeChooser-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyHomeChooser-selfcheck.mjs      (about two minutes; IT NEVER RUNS THE ROUND -- its walks are of 2 or 3 iterations, its choices on 2 lives, and it starts no process)
//
// THE GATE OF THE CHOOSER ROUND (registered in brain/FLY_HOME_CHOOSER_WIP.md before the trainer's onPoint option, tools/ship/flyHomeChooser.mjs and tools/ship/takeFlyHomeChooser.mjs existed):
// chosen on 256 lives, or by its course score, does the homing fly's point do better than the one its 64 lives chose?
//   1  THE TRAINER'S NEW OPTION   brain/rl/dockPolicy.js's onPoint: with it or without it the answer is the same to the bit; it is handed a copy of every point after its update
//   2  THE ROUND'S NUMBERS        the recipe, draws, audit, arms; each chooser's lives (HOME256's no life of another round's, HOMEBYC's the trainer round's BAT64 lives); round 4's file by its
//                                 hash; the registration says the same
//   3  ONE WALK AND ITS CHOICES   a walk is round 4's training with every point recorded, and the trainer's own score of each on HOMEP's battery; each chooser is the trainer's own
//                                 choice on its lives; a record's scores and audits again
//   4  THE RECORDS                12 walks and 24 choices; C256, CBC, G256, GBC
//   5  THE COMMAND                it is this round's; no walk or choice of the round's, no process
//   6  THE VERDICT                the results file as committed unread at f902ad40, read from the file: the checks, C256, CBC, G256, GBC, the arms, the description after the
//                                 reading, a re-audit, the expectations, the note's result
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the trainer's, the library's and the note's, this gate
// and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's; every one red by name but TWO, findings (the number is the rows red):
//   THE TRAINER (brain/rl/dockPolicy.js): D1 onPoint handed the walk's point itself, not a copy 3 | D2 onPoint after the battery 1 | D3 onPoint handed the iteration plus one 2 | D4 onPoint
//   every other iteration 5 | D5 onPoint draws a random number 4
//   THE ROUND: F1 59 points a walk 4 | F2 HOME256 on 128 lives 1 | F3 HOME256's lives round 4's battery 2 | F4 HOMEBYC on round 4's homing battery 2 | F5 the first best keeps the last of
//   equal scores 2 | F6 the walk without fresh lives 1 | F7 the walk's battery a life off HOMEP's 0 -- A FINDING, see below -- then 1 | F8 the course score flown on the homing life 1 | F9 C256
//   and CBC against COURSE64 2 | F10 G256 and GBC against HOMEP 1 | F11 the sign test's BETTER and WORSE swapped 2 | F12 the rank sum's BETTER and WORSE swapped 1 | F13 round 4's file's own
//   checks skipped 1 | F14 a walk's kept point not checked against HOMEP's 1 | F15 a choice's point not checked to be the first best 1 | F16 the round writes round 4's file 1 | F17 a choice's
//   home score on the course lives 1 | F18 round 4's file's hash another 4 | F19 (after the finding) a walk's kept point not checked against the trainer's scores 1
//   THE COMMAND: C1 exits 0 on a word it does not know 1 | C2 the choices before the walks 1 | C3 the job walks with a recipe of its own 1 | C4 the file's walks not counted as done 0 -- A
//   FINDING, see below -- then 1 | C5 reads without round 4's file 1 | C6 (after the finding) the file's choices not counted as done 1
//   THE NOTE: N1 its HOME256 lives 128 1 | N2 its HOMEBYC lives from 80000000 1 | N3 its C256 a rank sum 1 | N4 it drops that nothing changes without the option 1
//   THE FINDINGS: F7 -- a walk's record said which battery it was meant to keep its point on (T.batteryOf(s)), not which the trainer used, and on a walk of 2 iterations the same point is
//   kept on either; a walk now records the trainer's own score of every point (its onIter observer's), checkRecords requires the kept point to be their first best, and section 3 flies each
//   point by hand on HOMEP's 64 battery lives and requires those scores to the bit. C4 -- section 5 read that the command builds the set of walks the file holds, not that it skips them; it now
//   reads the two filters, of the walks and of the choices. F7, F19, C4 and C6 were run after the fixes, on the same runner; the others before them (the fixes only add rows).
// THE VERDICT'S SABOTAGES (2026-11-19, after the reading, the same runner, this gate alone): V1 a record's home score (HOME256 draw 3) changed in a digit the double holds 1 (the file's
//   hash alone: the change is under the arms row's 5e-5) | V2 CBC against COURSE64 5 | V3 the sign test's BETTER and WORSE swapped 5 | V4 G256 and GBC against HOMEP 4 | V5 the note's CBC
//   says CANNOT 1 | V6 the note's expectation of CBC BETTER is 35 1 | V7 the note names another commit 1 | V8 the note says every expectation came 1 | V9 the note's average gain 0.0051 1.
//   None went 0 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as C from "./flyHomeChooser.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as TR from "./flyCompassTrainer.mjs";
import * as PF from "./paintingFly.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import { HomeTrainEnv } from "../../brain/rl/homeTrainEnv.mjs";
import { HomingTrainFly } from "../../brain/rl/homingTrainFly.mjs";
import { trainDockES, evaluate } from "../../brain/rl/dockPolicy.js";
import { signTest } from "./voxelHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TWO = [880041, 880042], COURSE = [880043], TINY = Object.freeze({ iters: 2, pop: 2, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 16 });
const F = Object.fromEntries(Object.entries(C.FILES).map(([k, f]) => [k, C.fileOf(fs.readFileSync(path.join(ENG, f)))]));
const homep = (s) => F.trained.lines.find((r) => r.kind === "draw" && r.arm === "HOMEP" && r.s === s), course64 = (s) => F.trained.lines.find((r) => r.kind === "fly" && r.arm === "COURSE64" && r.s === s);
// a small homing walk and a small course walk through the trainer, 3 iterations, 2 flies tried, 1 life each, the battery of 2 lives given
const homeOpts = (base) => ({ envFactory: () => new HomeTrainEnv(), obsDim: CE.NR + 2, actDim: 1, maxSteps: 1500, iters: 3, pop: 2, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 5, freshEpisodes: true, policyFactory: () => new HomingTrainFly(T.flyOf("HOMEP", 5)), batteryEps: 2, batteryBase: base });
const courseOpts = (base) => ({ envFactory: () => new CE.CompassEnv(), obsDim: CE.NR + 2, actDim: 1, maxSteps: 1500, iters: 3, pop: 2, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 5, freshEpisodes: true, policyFactory: () => V.policyOf("PLASTIC", 5), batteryEps: 2, batteryBase: base });
const keptOf = (opts) => { let keptAt = -1, prev = -Infinity; const points = []; const res = trainDockES({ ...opts, onIter: ({ it, bestScore }) => { if (bestScore > prev) { keptAt = it; prev = bestScore; } }, onPoint: (p) => points.push(Array.from(p)) }); return { res, keptAt, points }; };

console.log("flyHomeChooser-selfcheck -- the chooser round (HOMEP's walks again, the point chosen on 256 homing lives or by the course score): the trainer's option, the numbers, one walk, the records, the command\n");

console.log("1. THE TRAINER'S NEW OPTION (brain/rl/dockPolicy.js onPoint)");
section(() => {
    const opts = homeOpts(C.BASE256 + C.STEP * 5), plain = trainDockES(opts), seen = [], its = [], withIt = trainDockES({ ...opts, onPoint: (p, it) => { seen.push(Array.from(p)); its.push(it); p[0] = 99; } }), last = trainDockES({ ...opts, keep: "last" });
    ok("!! WITH onPoint OR WITHOUT IT, THE TRAINER'S ANSWER IS THE SAME TO THE BIT: the point handed back, the history and the best evaluation -- even when the observer writes into what it is handed",
        PF.hashWeights(plain.params) === PF.hashWeights(withIt.params) && J(plain.history) === J(withIt.history) && J(plain.best) === J(withIt.best));
    const k = keptOf(opts);
    ok("!! IT IS HANDED A COPY OF EVERY POINT AFTER ITS UPDATE, IN ORDER: one an iteration with its number, the last the walk's last point (keep \"last\"), the one kept at the iteration the trainer kept",
        seen.length === 3 && J(its) === J([0, 1, 2]) && PF.hashWeights(Float32Array.from(seen[2])) === PF.hashWeights(last.params) && k.points.length === 3 && J(k.points) === J(seen) && PF.hashWeights(Float32Array.from(k.points[k.keptAt])) === PF.hashWeights(plain.params), `kept ${k.keptAt}`);
    const dsrc = src("brain/rl/dockPolicy.js"), at = dsrc.indexOf("if (opts.onPoint) opts.onPoint(theta.slice(), it);");
    ok("the option is one line, after the update and before the battery, handing a copy (theta.slice()); the trainer's other options are as they were",
        at > dsrc.indexOf("for (let j = 0; j < n; j++) theta[j] += scale * grad[j];") && at < dsrc.indexOf("const ev = evaluate(theta, { ...evOpts, episodes: opts.batteryEps || 24, seedBase: opts.batteryBase });") && (dsrc.match(/onPoint/g) || []).length >= 2 && /keep === "last"/.test(dsrc));
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    ok("!! ROUND 4'S RECIPE, DRAWS 1 TO 12 AND AUDIT; the arms HOME256 and HOMEBYC; 60 points a walk; alpha 0.01; this round's own results file",
        C.RECIPE === T.RECIPE && C.SEEDS === T.SEEDS && C.AUDIT === T.AUDIT && C.ITERS === 60 && J(C.ARMS) === J(["HOME256", "HOMEBYC"]) && C.LEAD === "HOME256" && C.ALPHA === 0.01 && C.RESULTS === "brain/flyHomeChooserRound.jsonl" && throws(() => C.chooserOf("HOMEP", 1), /no arm HOMEP/) && throws(() => C.walkOne(0), /whole number from 1/));
    const lives = new Map(), add = (x) => lives.set(x, (lives.get(x) || 0) + 1);
    T.AUDIT.forEach(add); V.AUDIT.forEach(add); for (const s of T.SEEDS) { const c = C.chooserOf("HOME256", s), b = T.batteryOf(s), t = TR.batteryOf("BAT64", s); for (let k = 0; k < 64; k++) { add(b.base + 17 * k); add(t.base + 17 * k); } for (let k = 0; k < 256; k++) add(c.base + 17 * k); }
    for (let it = 0; it < 60; it++) for (let k = 0; k < 4; k++) add(5000 + 104729 * (it + 1) + 17 * k); for (let k = 0; k < 16; k++) add(5000 + 17 * k); for (let k = 0; k < 100; k++) add(30000001 + 7919 * k);
    ok("!! THE CHOOSERS' LIVES: HOME256 256 homing lives of the draw's own, 90000000 + 10007 s + 17 k, no life of the audits, of round 4's or the trainer round's batteries, of training or of the scoping; HOMEBYC the course score on the trainer round's BAT64 lives exactly (40000000 + 10007 s + 17 k)",
        C.EPS256 === 256 && C.BASE256 === 90000000 && C.STEP === 10007 && C.SEEDS.every((s) => J(C.chooserOf("HOME256", s)) === J({ score: "home", eps: 256, base: 90000000 + 10007 * s }) && J(C.chooserOf("HOMEBYC", s)) === J({ score: "course", eps: TR.batteryOf("BAT64", s).eps, base: TR.batteryOf("BAT64", s).base }) && TR.batteryOf("BAT64", s).eps === 64) &&
        [...lives.values()].every((c) => c === 1) && lives.size === 200 + 200 + 12 * (128 + 256) + 240 + 16 + 100);
    ok("!! ROUND 4'S FILE BY ITS HASH, AND THE FOUR IT CHECKS AGAINST: the tree has them today, and round 4's passes its own checks",
        C.TRAINED === T.RESULTS && C.TRAINED_SHA256 === "c931f32e5705cdbadeb3ca729958a67a0eb7375593cf2feb02b8c4ac5b5522c6" && J(C.FILES) === J({ ...T.FILES, trained: "brain/flyTrainedHomeRound.jsonl" }) && F.trained.sha256 === C.TRAINED_SHA256 && T.checkRecords(F.trained.lines, F).length === 0);
    ok("the trainer's own score: dock rate x 1000 less the mean distance less crashes x 200; the first best keeps the earlier of two equal scores, as the trainer does",
        C.trainerScore({ dockRate: 0.5, avgDist: 0.25, avgCrashes: 0.1 }) === 500 - 0.25 - 20 && C.trainerScore({ dockRate: 0, avgDist: 0.4 }) === -0.4 && C.firstBest([0.1, 0.3, 0.2, 0.3]) === 1 && C.firstBest([-2, -1]) === 1);
    const note = src("brain/FLY_HOME_CHOOSER_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the trainer's one new option and that nothing changes without it; every walk's kept point HOMEP's to the bit; the two choosers and their lives; draws 1 to 12; C256 and CBC draw for draw, G256 and GBC rank sums; round 4's file's hash",
        /\*\*one new option, `onPoint`\*\*/.test(note) && /\*\*Without it nothing changes\.\*\*/.test(note) && /\*\*Every walk's kept point is checked against HOMEP's committed weights to the bit\*\*/.test(note) && /\*\*256 lives of the draw's own\*\* \(seeds 90000000 \+ 10007 s \+ 17 k\)/.test(note) &&
        /\*\*course score on the trainer round's BAT64 lives\*\* \(seeds 40000000 \+ 10007 s \+ 17 k\)/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) && /\*\*C256: HOME256 against HOMEP, draw for draw\*\* \(sign test/.test(note) && /\*\*G256: HOME256 against COURSE64\*\* \(rank sum\)/.test(note) && /sha256 c931f32e5705cdba/.test(note));
});

console.log("\n3. ONE WALK AND ITS CHOICES (a walk of 2 iterations on draw 5; small walks of 3 through the trainer; choices on 2 lives)");
section(() => {
    const w = C.walkOne(5, TINY), r4 = T.trainOne("HOMEP", 5, TINY, TWO, COURSE), pts = C.pointsOf(w);
    const onBattery = pts.map((p) => C.trainerScore(evaluate(Float32Array.from(p), { envFactory: () => new HomeTrainEnv(), obsDim: CE.NR + 2, actDim: 1, maxSteps: 1500, policyFactory: () => new HomingTrainFly(T.flyOf("HOMEP", 5)), episodes: 64, seedBase: T.batteryOf(5).base })));
    ok("!! A WALK IS ROUND 4'S TRAINING WITH EVERY POINT RECORDED: its kept point is round 4's trainOne's to the bit, at the iteration round 4 says it kept, and among its points; the trainer's own score of each point is the point flown here by hand on HOMEP's 64 battery lives, and the kept one is their first best",
        w.kind === "walk" && w.s === 5 && w.n === 2 && pts.length === 2 && w.weightsHash === r4.weightsHash && w.keptAt === r4.keptAt && PF.hashWeights(pts[w.keptAt]) === r4.weightsHash && J(w.battery) === J(T.batteryOf(5)) && J(w.recipe) === J(TINY) && w.pointsHash === PF.hashWeights(PF.unpackWeights(w.points)) &&
        J(w.trainerScores) === J(onBattery) && C.firstBest(w.trainerScores) === w.keptAt, `kept ${w.keptAt}; ${onBattery.map((x) => x.toFixed(2)).join(", ")}`);
    const kh = keptOf(homeOpts(C.chooserOf("HOME256", 5).base)), sh = kh.points.map((p) => C.scoreOf("HOME256", 5, p, 2)), kc = keptOf(courseOpts(C.chooserOf("HOMEBYC", 5).base)), scc = kc.points.map((p) => C.scoreOf("HOMEBYC", 5, p, 2));
    ok("!! EACH CHOOSER IS THE TRAINER'S OWN CHOICE ON ITS LIVES: on a homing walk with HOME256's lives as its battery, and a course walk with HOMEBYC's (the trainer round's BAT64 lives), the first best of the chooser's scores is the point the trainer kept",
        C.firstBest(sh) === kh.keptAt && PF.hashWeights(Float32Array.from(kh.points[C.firstBest(sh)])) === PF.hashWeights(kh.res.params) && C.firstBest(scc) === kc.keptAt && PF.hashWeights(Float32Array.from(kc.points[C.firstBest(scc)])) === PF.hashWeights(kc.res.params), `kept ${kh.keptAt} and ${kc.keptAt}`);
    const byHand = evaluate(Float32Array.from(pts[1]), { envFactory: () => new CE.CompassEnv(), obsDim: CE.NR + 2, actDim: 1, maxSteps: 1500, policyFactory: () => V.policyOf("PLASTIC", 5), episodes: 2, seedBase: 40000000 + 10007 * 5 });
    ok("a point's course score is the compass fly flown on the compass life over the chooser's lives, by the trainer's own score; its home score the homing life over 256 lives of the draw's own", C.scoreOf("HOMEBYC", 5, pts[1], 2) === C.trainerScore(byHand) &&
        C.scoreOf("HOME256", 5, pts[1], 2) === C.trainerScore(evaluate(Float32Array.from(pts[1]), { envFactory: () => new HomeTrainEnv(), obsDim: CE.NR + 2, actDim: 1, maxSteps: 1500, policyFactory: () => new HomingTrainFly(T.flyOf("HOMEP", 5)), episodes: 2, seedBase: 90000000 + 10007 * 5 })));
    const c = C.chooseOne("HOMEBYC", 5, w, TWO, COURSE, 2), cw = C.pointsOf(w)[c.keptAt];
    ok("!! A CHOICE'S RECORD: its chooser and lives, its walk's hash, a score for every point, the first best kept, that point's weights and rates, its home score on the audit lives given flown here by hand and its course score on the course lives given",
        c.kind === "draw" && c.arm === "HOMEBYC" && c.s === 5 && J(c.chooser) === J(C.chooserOf("HOMEBYC", 5)) && c.walkHash === w.pointsHash && c.scores.length === 2 && c.scores.every((x, i) => x === C.scoreOf("HOMEBYC", 5, pts[i], 2)) && c.keptAt === C.firstBest(c.scores) &&
        c.weightsHash === PF.hashWeights(cw) && c.weightCount === 3 && J(c.rates) === J(T.flyOf("HOMEP", 5, cw).rates()) && c.home === H.homeScore(T.flyOf("HOMEP", 5, cw), TWO) && c.course === V.auditScore(T.flyOf("HOMEP", 5, cw), COURSE) && throws(() => C.chooseOne("HOME256", 6, w), /not draw 6's/), `home ${c.home.toFixed(4)}`);
});

console.log("\n4. THE RECORDS (made here; HOMEP and COURSE64 are round 4's as committed)");
section(() => {
    const ptsOf = (s) => { const hp = PF.unpackWeights(homep(s).weights), out = []; for (let i = 0; i < 60; i++) out.push(i === homep(s).keptAt ? Array.from(hp) : [0.001 * i, 0, 0.00001 * s]); return out; };
    const walk = (s, pts = ptsOf(s)) => { const flat = Float32Array.from(pts.flat()); return { kind: "walk", s, recipe: { ...C.RECIPE }, battery: T.batteryOf(s), n: 60, points: PF.packWeights(flat), pointsHash: PF.hashWeights(flat), trainerScores: Array.from({ length: 60 }, (_, i) => (i === homep(s).keptAt ? 900 : 800 - i)), keptAt: homep(s).keptAt, weightsHash: homep(s).weightsHash }; };
    const choice = (arm, s, home, at = 10 + s, wk = walk(s)) => { const scores = Array.from({ length: 60 }, (_, i) => (i === at ? -0.4 : -0.5 - i / 1e4)), p = Float32Array.from(C.pointsOf(wk)[at]);
        return { kind: "draw", arm, s, chooser: C.chooserOf(arm, s), walkHash: wk.pointsHash, scores, keptAt: at, weightCount: 3, weights: PF.packWeights(p), weightsHash: PF.hashWeights(p), rates: { a: 0.01, b: 0, c: 0.00001 }, home, course: 0.66 }; };
    const file = (f) => { const out = T.SEEDS.map((s) => walk(s)); for (const s of T.SEEDS) for (const arm of C.ARMS) out.push(choice(arm, s, f(arm, s))); return out; };
    // HOME256 above every HOMEP and COURSE64 fly; HOMEBYC each draw's HOMEP home score exactly
    const sc = (arm, s) => (arm === "HOME256" ? 0.58 + s / 1e4 : homep(s).home), good = file(sc), R = C.reading(good, F), lines = C.readingLines(R).join("\n"), bad = (recs, re, FF = F) => C.checkRecords(recs, FF).some((x) => re.test(x));
    ok("!! a file of 12 walks and 24 choices passes every check; a walk missing, a walk whose kept point is not HOMEP's, a walk of 59 points, another battery, a walk whose points are not their hash, and a walk whose kept point is not the first best of the trainer's scores each fail by name",
        C.checkRecords(good, F).length === 0 && good.length === 36 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.kind === "walk" && r.s === 4)), /the walk of draw 4 is there 0 times/) &&
        bad(good.map((r) => (r.kind === "walk" && r.s === 5 ? { ...r, keptAt: r.keptAt + 1 } : r)), /the walk of draw 5's kept point is not HOMEP's committed weights to the bit/) && bad(good.map((r) => (r.kind === "walk" && r.s === 6 ? { ...r, n: 59 } : r)), /the walk of draw 6 does not hold 60 points/) &&
        bad(good.map((r) => (r.kind === "walk" && r.s === 7 ? { ...r, battery: TR.batteryOf("BAT64", 7) } : r)), /the walk of draw 7 is not HOMEP's recipe and battery/) && bad(good.map((r) => (r.kind === "walk" && r.s === 8 ? { ...r, pointsHash: "0".repeat(16) } : r)), /the walk of draw 8 does not hold 60 points/) &&
        bad(good.map((r) => (r.kind === "walk" && r.s === 10 ? { ...r, trainerScores: r.trainerScores.map((x, i) => (i === (r.keptAt + 1) % 60 ? 1000 : x)) } : r)), /the walk of draw 10's kept point is not the first best of the trainer's own scores on its battery/) &&
        bad(good.map((r) => (r.kind === "walk" && r.s === 11 ? { ...r, trainerScores: r.trainerScores.slice(1) } : r)), /the walk of draw 11's kept point is not the first best of the trainer's own scores/));
    const wk9 = walk(9), other = walk(9, ptsOf(9).map((p, i) => (i === 0 ? [0.5, 0, 0] : p)));
    ok("!! a choice on another chooser's lives, of another walk, with 59 scores, whose point is not the first best of its scores (a later one of two equal), whose weights are not its walk's point, or with no home score, each fails by name; so does round 4's file not committed, or failing its own checks",
        bad(good.map((r) => (r.kind === "draw" && r.arm === "HOME256" && r.s === 2 ? { ...r, chooser: { ...r.chooser, eps: 64 } } : r)), /HOME256 draw 2 was chosen on other lives than its chooser's/) && bad(good.map((r) => (r.kind === "draw" && r.arm === "HOMEBYC" && r.s === 9 ? { ...r, walkHash: other.pointsHash } : r)), /HOMEBYC draw 9 is not a choice of its draw's walk/) &&
        bad(good.map((r) => (r.kind === "draw" && r.arm === "HOMEBYC" && r.s === 3 ? { ...r, scores: r.scores.slice(1) } : r)), /HOMEBYC draw 3 does not hold a score for each of the 60 points/) &&
        bad(good.map((r) => (r.kind === "draw" && r.arm === "HOME256" && r.s === 4 ? { ...r, scores: r.scores.map((x, i) => (i === 2 ? -0.4 : x)) } : r)), /HOME256 draw 4's point is not the first best of its scores/) &&
        bad(good.map((r) => (r.kind === "draw" && r.arm === "HOME256" && r.s === 5 ? { ...r, weightsHash: PF.hashWeights(Float32Array.from([0.5, 0, 0])), weights: PF.packWeights(Float32Array.from([0.5, 0, 0])) } : r)), /HOME256 draw 5's weights are not its walk's point 15/) &&
        bad(good.map((r) => (r.kind === "draw" && r.arm === "HOMEBYC" && r.s === 6 ? { ...r, home: null } : r)), /HOMEBYC draw 6 has no home or course score/) && wk9.pointsHash !== other.pointsHash &&
        J(C.checkRecords(good, { ...F, trained: { ...F.trained, sha256: "0".repeat(64) } })) === J(["the trained-to-home round's file is not the one committed (sha256 c931f32e5705cdba...)"]) &&
        J(C.checkRecords(good, { ...F, trained: { ...F.trained, lines: F.trained.lines.filter((r) => !(r.arm === "HOMES" && r.s === 3)) } })) === J(["the trained-to-home round's file fails its own checks: HOMES draw 3 is there 0 times (once is registered)"]));
    const hpHome = T.SEEDS.map((s) => homep(s).home), c64 = T.SEEDS.map((s) => course64(s).home), g = PF.rankSum(hpHome, c64);
    ok("!! C256 AND CBC ARE EACH CHOOSER AGAINST HOMEP DRAW FOR DRAW (exact sign tests of the differences), G256 AND GBC EACH AGAINST COURSE64 (exact rank sums): HOME256 above every fly is C256 BETTER (12 above) and G256 BETTER (222); HOMEBYC equal to HOMEP is CBC CANNOT (12 ties, p 1) and GBC round 4's G (ranks 97, WORSE)",
        R.C256.word === C.WORDS.C256[0] && R.C256.above === 12 && R.C256.b === "HOMEP" && R.G256.word === C.WORDS.G256[0] && R.G256.sumA === 222 && R.G256.b === "COURSE64" && R.CBC.word === C.WORDS.CBC[2] && R.CBC.ties === 12 && R.CBC.p === 1 &&
        R.GBC.sumA === g.sumA && g.sumA === 97 && R.GBC.word === C.WORDS.GBC[1] && near(R.arms.HOMEP.mean, 0.5501) && near(R.arms.COURSE64.mean, 0.5541) && /C256 \(HOME256 against HOMEP, draw for draw\): above 12, below 0, ties 0/.test(lines) && /G256 \(HOME256 against COURSE64\): HOME256's ranks sum to 222 \(the middle is 150\)/.test(lines) &&
        /THE HOMING FLY CHOSEN ON 256 LIVES FINDS HOME BETTER THAN THE HOMING FLY CHOSEN ON ITS 64 LIVES/.test(lines));
    const worse = C.reading(file((arm, s) => (arm === "HOMEBYC" ? homep(s).home - 0.001 : sc(arm, s))), F), noW = C.reading(good.filter((r) => !(r.kind === "walk" && r.s === 1)), F);
    ok("HOMEBYC 0.001 under each HOMEP fly is CBC WORSE (12 below); with a failed check no reading is weighed and the first line says so", worse.CBC.word === C.WORDS.CBC[1] && worse.CBC.below === 12 && noW.C256 === null && noW.GBC === null && /^A CHECK FAILED/.test(C.readingLines(noW)[0]));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, C.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HOMEP", "1"], ["job", "WALK", "x"], ["job", "WALK", "0"], ["job", "HOMEBYC", "13"], ["job", "WALK"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for WALK, HOME256 or HOMEBYC and draws 1 to 12 -- and nothing else", J(C.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(C.parseArgs(["read"])) === J({ cmd: "read" }) && J(C.parseArgs(["job", "WALK", "3"])) === J({ cmd: "job", arm: "WALK", s: 3 }) && J(C.parseArgs(["job", "HOMEBYC", "12"])) === J({ cmd: "job", arm: "HOMEBYC", s: 12 }) && no.every((a) => C.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyHomeChooser.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, walks and chooses with the registered defaults, the walks first, each choice of its draw's walk from the file, only what the file does not hold",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyHomeChooser\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.walkOne\(args\.s\)\)/.test(csrc) && /JSON\.stringify\(PF\.chooseOne\(args\.arm, args\.s, walk\)\)/.test(csrc) &&
        /const walk = linesOf\(\)\.find\(\(r\) => r\.kind === "walk" && r\.s === args\.s\)/.test(csrc) && /\(await phase\(walks, jobs\)\) \|\| \(await phase\(choices, jobs\)\)/.test(csrc) && /walked = new Set\(have\.filter\(\(r\) => r\.kind === "walk"\)/.test(csrc) && /chosen = new Set\(have\.filter\(\(r\) => r\.kind === "draw"\)/.test(csrc) &&
        /const walks = PF\.SEEDS\.filter\(\(s\) => !walked\.has\(s\)\)\.map\(\(s\) => \["WALK", s\]\)/.test(csrc) && /for \(const arm of PF\.ARMS\) if \(!chosen\.has\(arm \+ "\/" \+ s\)\) choices\.push\(\[arm, s\]\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyHomeChooser\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyHomeChooser-selfcheck.mjs"), calls = [...me.matchAll(/C\.(walkOne|chooseOne)\(([^)]*)\)/g)].map((m) => m[1] + "(" + m[2] + ")");
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one walk through the round's code is of 2 iterations, its one choice on 2 lives and audited on lives not the round's (and two calls refused); it starts no process; the file's size and time are what they were",
        J(calls) === J(["walkOne(0)", "walkOne(5, TINY)", "chooseOne(\"HOMEBYC\", 5, w, TWO, COURSE, 2)", "chooseOne(\"HOME256\", 6, w)"]) && ![...TWO, ...COURSE].some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before,
        `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (the whole results file was committed at f902ad40 before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, C.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = C.reading(lines, F), A = R.arms;
    const of = (a) => lines.filter((r) => r.kind === "draw" && r.arm === a).sort((x, y) => x.s - y.s), B = of("HOMEBYC"), H2 = of("HOME256"), hp = T.SEEDS.map((s) => homep(s)), dB = B.map((r, i) => r.home - hp[i].home), dH = H2.map((r, i) => r.home - hp[i].home), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    ok("!! the results file is the one the run wrote: 36 records, sha256 8951af17ed60d6dc... (three starts: the two-hour limit and a container restart)", lines.length === 36 && createHash("sha256").update(bytes).digest("hex") === "8951af17ed60d6dc296672eee5d75d62ebe21addc11ac33678cb8982d8ee2876");
    ok("!! THE CHECKS HOLD: round 4's file as committed and passing its own checks; 12 walks, every kept point HOMEP's committed weights to the bit and the first best of the trainer's own scores; 24 choices, each the first best of its chooser's scores", R.checks.length === 0 && lines.filter((r) => r.kind === "walk").length === 12);
    ok("!! *** C256 -- CHOSEN ON 256 LIVES, IT CANNOT BE TOLD APART FROM HOMEP (6 above, 6 below, p 1); CBC -- CHOSEN BY ITS COURSE SCORE, IT FINDS HOME BETTER THAN HOMEP (11 of 12 above, p 26/4096) ***",
        R.C256.word === C.WORDS.C256[2] && R.C256.above === 6 && R.C256.below === 6 && R.C256.p === 1 && R.CBC.word === C.WORDS.CBC[0] && R.CBC.above === 11 && R.CBC.below === 1 && R.CBC.p === 26 / 4096);
    ok("!! *** G256 -- CANNOT BE TOLD APART FROM COURSE64 (ranks 110, p 0.020); GBC -- CANNOT BE TOLD APART FROM COURSE64 (ranks 160, p 0.59) ***",
        R.G256.word === C.WORDS.G256[2] && R.G256.sumA === 110 && near(R.G256.p, 0.0205) && R.GBC.word === C.WORDS.GBC[2] && R.GBC.sumA === 160 && near(R.GBC.p, 0.5899));
    ok("!! the arms (home mean, sd, least, most; course): HOME256 0.5523 0.0021 0.5488 0.5565, 0.6532 | HOMEBYC 0.5542 0.0028 0.5481 0.5571, 0.6686 | HOMEP 0.5501, 0.6501 | COURSE64 0.5541, 0.6688",
        near(A.HOME256.mean, 0.5523) && near(A.HOME256.sd, 0.0021) && near(A.HOME256.min, 0.5488) && near(A.HOME256.max, 0.5565) && near(A.HOME256.course, 0.6532) && near(A.HOMEBYC.mean, 0.5542) && near(A.HOMEBYC.sd, 0.0028) && near(A.HOMEBYC.min, 0.5481) && near(A.HOMEBYC.max, 0.5571) && near(A.HOMEBYC.course, 0.6686) &&
        near(A.HOMEP.mean, 0.5501) && near(A.HOMEP.course, 0.6501) && near(A.COURSE64.mean, 0.5541) && near(A.COURSE64.course, 0.6688));
    const bh = signTest(B.map((r, i) => r.home - H2[i].home), 0);
    ok("!! DESCRIBED AFTER THE READING, NOT REGISTERED: HOMEBYC is above HOMEP by 0.0041 on average (round 4's gap), below on draw 6 alone; HOME256 by 0.0022; neither chooser kept HOMEP's own point on any draw; HOMEBYC against HOME256 draw for draw 8 above, 4 below (not registered, p 0.39)",
        near(mean(dB), 0.0041) && J(B.filter((r, i) => dB[i] < 0).map((r) => r.s)) === J([6]) && near(mean(dH), 0.0022) && B.every((r, i) => r.keptAt !== hp[i].keptAt) && H2.every((r, i) => r.keptAt !== hp[i].keptAt) && bh.above === 8 && bh.below === 4 && near(bh.p, 0.3877));
    const b3 = B.find((r) => r.s === 12);
    ok("!! RE-AUDITED AFTER THE READING: HOMEBYC's draw 12 (the largest gain) gives its home score again to the bit", H.homeScore(T.flyOf("HOMEP", 12, PF.unpackWeights(b3.weights)), T.AUDIT) === b3.home);
    const note = src("brain/FLY_HOME_CHOOSER_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 10. The result"));
    ok("the expectations, written before the code, against what came: C256 CANNOT (60), G256 CANNOT (60) and GBC CANNOT (65) came; CBC came BETTER, which was given 25",
        /C256: CANNOT about 60, BETTER 35\. CBC: CANNOT about 70, BETTER 25\. G256: CANNOT about 60, WORSE 30\. GBC: CANNOT about 65, WORSE 30\./.test(flat) && R.C256.word === C.WORDS.C256[2] && R.CBC.word === C.WORDS.CBC[0] && R.G256.word === C.WORDS.G256[2] && R.GBC.word === C.WORDS.GBC[2]);
    ok("the registration's RESULT SECTION (section 10) carries the four readings' words, the commit the file was read at, the expectation that did not come, the description after the reading said as such, and what it does not mean",
        /## 10\. The result/.test(note) && ["C256", "CBC", "G256", "GBC"].every((k) => res.includes(`**${k}: ${R[k].word}**`)) && /f902ad40/.test(res) && /\*\*Three of the four expectations came\*\*/.test(res) &&
        /\*\*Described after the reading, not registered \(the gate recomputes it from the records\):\*\*/.test(res) && /0\.0041 on average/.test(res) && /\*\*What it does not mean\.\*\*/.test(res));
});

console.log(`\nflyHomeChooser-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
