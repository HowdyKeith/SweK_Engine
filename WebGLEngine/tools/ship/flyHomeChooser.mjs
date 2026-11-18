// WebGLEngine/tools/ship/flyHomeChooser.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// CHOOSING THE HOMING FLY'S POINT, AS ARITHMETIC (registered in brain/FLY_HOME_CHOOSER_WIP.md before this file existed): ON 256 LIVES, OR BY ITS COURSE SCORE?
// The walks are the trained-to-home round's HOMEP walks (tools/ship/flyTrainedHome.mjs), run again through brain/rl/dockPolicy.js with its onPoint observer, every point recorded; each walk's
// kept point must be HOMEP's committed weights to the bit. Two choosers of a walk's point, each the first best by the trainer's own score:
//   HOME256  the best homing score on 256 lives of the draw's own (seeds BASE256 + STEP s + 17 k)
//   HOMEBYC  the best course score on the trainer round's BAT64 lives (tools/ship/flyCompassTrainer.mjs batteryOf("BAT64", s)), the compass fly on the compass life, as COURSE64 was chosen
// weighed against HOMEP and COURSE64 as committed in brain/flyTrainedHomeRound.jsonl. Readings: C256 and CBC (each chooser against HOMEP draw for draw, exact sign tests of the differences),
// G256 and GBC (each against COURSE64, exact rank sums). The command is tools/ship/takeFlyHomeChooser.mjs.
//
//   RECIPE, SEEDS, AUDIT, ALPHA, ARMS, LEAD, ITERS, EPS256, BASE256, STEP, RESULTS, TRAINED, TRAINED_SHA256, FILES, WORDS
//   trainerScore(ev)                   the trainer's own score of an evaluation: dock rate x 1000 less the mean distance less crashes x 200
//   chooserOf(arm, s)                  { score: "home" | "course", eps, base }: the lives an arm's chooser scores a point on
//   walkOne(s, recipe)                 { kind: "walk", s, recipe, battery, n, points, pointsHash, trainerScores, keptAt, weightsHash }: HOMEP's training of draw s with every point recorded, and the
//                                      trainer's own score of each on its battery (its observer onIter's)
//   pointsOf(walk)                     the walk's points, each a Float32Array of the compass fly's 3 weights
//   scoreOf(arm, s, point, eps)        a point's score by the arm's chooser (eps lives, the chooser's own unless given)
//   firstBest(scores)                  the first index of the greatest score (the trainer keeps the first best)
//   chooseOne(arm, s, walk, audit, course, eps)   { kind: "draw", arm, s, chooser, walkHash, scores, keptAt, weightCount, weights, weightsHash, rates, home, course }
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: round 4's FILES and its own file, each fileOf its committed file)
// NOT HERE: the 12 walks and 24 choices (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES, evaluate } from "../../brain/rl/dockPolicy.js";
import { NR, CompassEnv } from "../../brain/rl/compassEnv.mjs";
import { HomeTrainEnv } from "../../brain/rl/homeTrainEnv.mjs";
import { HomingTrainFly } from "../../brain/rl/homingTrainFly.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as TR from "./flyCompassTrainer.mjs";

export const RECIPE = T.RECIPE, SEEDS = T.SEEDS, AUDIT = T.AUDIT, ALPHA = 0.01, ITERS = T.RECIPE.iters;
export const ARMS = Object.freeze(["HOME256", "HOMEBYC"]), LEAD = "HOME256", EPS256 = 256, BASE256 = 90000000, STEP = 10007;
export const RESULTS = "brain/flyHomeChooserRound.jsonl", TRAINED = T.RESULTS, TRAINED_SHA256 = "c931f32e5705cdbadeb3ca729958a67a0eb7375593cf2feb02b8c4ac5b5522c6";
export const FILES = Object.freeze({ ...T.FILES, trained: TRAINED });
const three = (a, b) => Object.freeze([`${a} FINDS HOME BETTER THAN ${b}`, `${a} FINDS HOME WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b} AT FINDING HOME`]);
const C2 = "THE HOMING FLY CHOSEN ON 256 LIVES", CC = "THE HOMING FLY CHOSEN BY ITS COURSE SCORE", HP = "THE HOMING FLY CHOSEN ON ITS 64 LIVES", CO = "THE FLY TRAINED TO HOLD A COURSE";
export const WORDS = Object.freeze({ C256: three(C2, HP), CBC: three(CC, HP), G256: three(C2, CO), GBC: three(CC, CO) });

const sOk = (s, who) => { if (!Number.isInteger(s) || s < 1) throw new Error(`flyHomeChooser.${who}: a draw is a whole number from 1 (got ${s})`); };
const aOk = (arm, who) => { if (!ARMS.includes(arm)) throw new Error(`flyHomeChooser.${who}: no arm ${arm} (the arms are ${ARMS.join(", ")})`); };
/** See the header. */
export function trainerScore(ev) { return ev.dockRate * 1000 - ev.avgDist - (ev.avgCrashes || 0) * 200; }
/** See the header. */
export function chooserOf(arm, s) { aOk(arm, "chooserOf"); sOk(s, "chooserOf"); if (arm === "HOME256") return { score: "home", eps: EPS256, base: BASE256 + STEP * s }; const b = TR.batteryOf("BAT64", s); return { score: "course", eps: b.eps, base: b.base }; }
/** See the header: round 4's trainOne("HOMEP", s) to its trainDockES call, with the observer. */
export function walkOne(s, recipe = RECIPE) {
    sOk(s, "walkOne"); const b = T.batteryOf(s), points = [], trainerScores = [];
    const res = trainDockES({ envFactory: () => new HomeTrainEnv(), obsDim: NR + 2, actDim: 1, maxSteps: 1500, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => new HomingTrainFly(T.flyOf("HOMEP", s)), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), batteryEps: b.eps, batteryBase: b.base, onPoint: (p) => points.push(Array.from(p)), onIter: ({ score }) => trainerScores.push(score) });
    const flat = Float32Array.from(points.flat()), kept = points.findIndex((p) => hashWeights(Float32Array.from(p)) === hashWeights(res.params));
    return { kind: "walk", s, recipe: { ...recipe }, battery: b, n: points.length, points: packWeights(flat), pointsHash: hashWeights(flat), trainerScores, keptAt: kept, weightsHash: hashWeights(res.params) };
}
/** See the header. */
export function pointsOf(walk) { const flat = unpackWeights(walk.points); return Array.from({ length: walk.n }, (_, i) => flat.slice(3 * i, 3 * i + 3)); }
/** See the header. */
export function scoreOf(arm, s, point, eps) {
    const c = chooserOf(arm, s), episodes = eps === undefined ? c.eps : eps;
    const ev = c.score === "home"
        ? evaluate(Float32Array.from(point), { envFactory: () => new HomeTrainEnv(), obsDim: NR + 2, actDim: 1, maxSteps: 1500, policyFactory: () => new HomingTrainFly(T.flyOf("HOMEP", s)), episodes, seedBase: c.base })
        : evaluate(Float32Array.from(point), { envFactory: () => new CompassEnv(), obsDim: NR + 2, actDim: 1, maxSteps: 1500, policyFactory: () => V.policyOf("PLASTIC", s), episodes, seedBase: c.base });
    return trainerScore(ev);
}
/** See the header. */
export function firstBest(scores) { let b = -1, best = -Infinity; scores.forEach((x, i) => { if (x > best) { best = x; b = i; } }); return b; }
/** See the header: a chooser's point of a walk, and its audit at home (and on the compass round's course lives, described). */
export function chooseOne(arm, s, walk, audit = AUDIT, course = V.AUDIT, eps) {
    aOk(arm, "chooseOne"); sOk(s, "chooseOne"); if (!walk || walk.kind !== "walk" || walk.s !== s) throw new Error(`flyHomeChooser.chooseOne: the walk given is not draw ${s}'s`);
    const pts = pointsOf(walk), scores = pts.map((p) => scoreOf(arm, s, p, eps)), keptAt = firstBest(scores), w = pts[keptAt], fly = () => T.flyOf("HOMEP", s, w);
    return { kind: "draw", arm, s, chooser: chooserOf(arm, s), walkHash: walk.pointsHash, scores, keptAt, weightCount: w.length, weights: packWeights(w), weightsHash: hashWeights(w), rates: fly().rates(), home: H.homeScore(fly(), audit), course: V.auditScore(fly(), course) };
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. `job` takes WALK or a registered arm, and a draw; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && (rest[0] === "WALK" || ARMS.includes(rest[0])) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v);
const homepOf = (F, s) => F.trained.lines.find((r) => r && r.kind === "draw" && r.arm === "HOMEP" && r.s === s) || null;
const courseOf = (F, s) => F.trained.lines.find((r) => r && r.kind === "fly" && r.arm === "COURSE64" && r.s === s) || null;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.trained || F.trained.sha256 !== TRAINED_SHA256) bad.push(`the trained-to-home round's file is not the one committed (sha256 ${TRAINED_SHA256.slice(0, 16)}...)`);
    else { const tb = T.checkRecords(F.trained.lines, F); if (tb.length) bad.push(`the trained-to-home round's file fails its own checks: ${tb[0]}`); }
    if (bad.length) return bad;
    const walks = lines.filter((r) => r && r.kind === "walk"), draws = lines.filter((r) => r && r.kind === "draw"), wOf = new Map();
    for (const s of SEEDS) { const c = walks.filter((r) => r.s === s).length; if (c !== 1) bad.push(`the walk of draw ${s} is there ${c} times (once is registered)`); }
    if (walks.length !== SEEDS.length) bad.push(`${walks.length} walks (registered: ${SEEDS.length})`);
    for (const r of walks) {
        const id = `the walk of draw ${r.s}`;
        if (!SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE) || !same(r.battery, T.batteryOf(r.s))) bad.push(`${id} is not HOMEP's recipe and battery`);
        let pts = null; try { pts = r.n === ITERS ? pointsOf(r) : null; } catch { /* said below */ }
        if (!pts || hashWeights(unpackWeights(r.points)) !== r.pointsHash || !pts.every((p) => p.length === 3 && p.every(Number.isFinite))) { bad.push(`${id} does not hold ${ITERS} points of 3 finite weights with its hash`); continue; }
        if (!(Array.isArray(r.trainerScores) && r.trainerScores.length === ITERS && r.trainerScores.every(fin)) || firstBest(r.trainerScores) !== r.keptAt) bad.push(`${id}'s kept point is not the first best of the trainer's own scores on its battery`);
        const hp = homepOf(F, r.s);
        if (!hp || r.weightsHash !== hp.weightsHash || r.keptAt !== hp.keptAt || hashWeights(pts[r.keptAt]) !== hp.weightsHash) bad.push(`${id}'s kept point is not HOMEP's committed weights to the bit`);
        wOf.set(r.s, r);
    }
    const seen = new Map(); for (const r of draws) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== ARMS.length * SEEDS.length) bad.push(`${draws.length} choices (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.arm} draw ${r.s}`;
        if (!ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered choice`); continue; }
        if (!same(r.chooser, chooserOf(r.arm, r.s))) bad.push(`${id} was chosen on other lives than its chooser's`);
        const wk = wOf.get(r.s);
        if (!wk || r.walkHash !== wk.pointsHash) { bad.push(`${id} is not a choice of its draw's walk`); continue; }
        if (!(Array.isArray(r.scores) && r.scores.length === ITERS && r.scores.every(fin))) { bad.push(`${id} does not hold a score for each of the ${ITERS} points`); continue; }
        if (r.keptAt !== firstBest(r.scores)) bad.push(`${id}'s point is not the first best of its scores`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (r.weightCount !== 3 || !w || w.length !== 3 || hashWeights(w) !== r.weightsHash || hashWeights(pointsOf(wk)[r.keptAt]) !== r.weightsHash) bad.push(`${id}'s weights are not its walk's point ${r.keptAt}`);
        if (!fin(r.home) || !fin(r.course)) bad.push(`${id} has no home or course score`);
        if (!(r.rates && ["a", "b", "c"].every((k) => fin(r.rates[k])))) bad.push(`${id} does not say its rates`);
    }
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (w, better, worse) => (better ? w[0] : worse ? w[1] : w[2]);
/** See the header. HOMEP and COURSE64 are round 4's as committed; a failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), draws = lines.filter((r) => r && r.kind === "draw"), arms = {};
    const of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s);
    const ref = { HOMEP: F && F.trained ? SEEDS.map((s) => homepOf(F, s)).filter(Boolean) : [], COURSE64: F && F.trained ? SEEDS.map((s) => courseOf(F, s)).filter(Boolean) : [] };
    for (const arm of [...ARMS, "HOMEP", "COURSE64"]) { const v = ARMS.includes(arm) ? of(arm) : ref[arm]; if (!v.length) continue; arms[arm] = { ...stats(v.map((r) => r.home)), course: v.reduce((n, r) => n + r.course, 0) / v.length };
        if (v.every((r) => Number.isInteger(r.keptAt))) arms[arm].keptAt = v.map((r) => r.keptAt); }
    const out = { checks, arms, C256: null, CBC: null, G256: null, GBC: null };
    if (checks.length) return out;
    const home = (arm) => (ARMS.includes(arm) ? of(arm) : ref[arm]).map((r) => r.home);
    const paired = (name, arm) => { const d = SEEDS.map((s, i) => home(arm)[i] - home("HOMEP")[i]), h = signTest(d, 0); return { ...h, a: arm, b: "HOMEP", diffs: d, word: pick(WORDS[name], h.p <= ALPHA && h.above > h.below, h.p <= ALPHA && h.below > h.above) }; };
    const ranks = (name, arm) => { const h = rankSum(home(arm), home("COURSE64")); return { ...h, a: arm, b: "COURSE64", word: pick(WORDS[name], h.p <= ALPHA && h.pHigher < h.pLower, h.p <= ALPHA && h.pLower < h.pHigher) }; };
    return { ...out, C256: paired("C256", "HOME256"), CBC: paired("CBC", "HOMEBYC"), G256: ranks("G256", "HOME256"), GBC: ranks("GBC", "HOMEBYC") };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: round 4's file as committed and passing its own checks; ${SEEDS.length} walks, each once, HOMEP's recipe and battery, ${ITERS} points each, every kept point HOMEP's committed weights to the bit; ${ARMS.length * SEEDS.length} choices, each once, on its chooser's lives, of its draw's walk, the first best of its scores`);
    out.push("", `the arms (the mean of 12 flies; ${AUDIT.length} homing audit lives; course is the compass round's audit; HOMEP and COURSE64 as committed):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(9)} home ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | course ${f(s.course)}${s.keptAt ? ` | kept at ${s.keptAt.join(" ")}` : ""}`);
    for (const name of ["C256", "CBC"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${t.b}, draw for draw): above ${t.above}, below ${t.below}, ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    for (const name of ["G256", "GBC"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${t.b}): ${t.a}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    return out;
}
