// WebGLEngine/tools/ship/flyHomeGradient.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HOMING FLY'S WALK ON 16 LIVES A FLY, AS ARITHMETIC (registered in brain/FLY_HOME_GRADIENT_WIP.md before this file existed): DOES HOMEP'S WALK DO BETTER WHEN EACH FLY TRIED IS SCORED
// ON 16 LIVES INSTEAD OF 4? HOME16 is the trained-to-home round's HOMEP training (tools/ship/flyTrainedHome.mjs) with that one change: the chooser round's walk (tools/ship/flyHomeChooser.mjs
// walkOne, every point and the trainer's own score of each recorded) with the recipe's trainEps 16, its point the first best on its draw's 64 battery lives, as HOMEP's was. Weighed against
// HOMEP and COURSE64 as committed in brain/flyTrainedHomeRound.jsonl. Readings: W (HOME16 against HOMEP draw for draw, an exact sign test of the differences) and G16 (HOME16 against COURSE64,
// an exact rank sum). The round is run on another machine, so two of its records check the machine: round 4's HOMEP draw 1 flown home again, and the homing round's floors, each to the
// committed numbers to the bit. The command is tools/ship/takeFlyHomeGradient.mjs.
//
//   LIVES, RECIPE, SEEDS, AUDIT, ALPHA, ITERS, ARMS, LEAD, REFLY_S, RESULTS, TRAINED, TRAINED_SHA256, FILES, WORDS
//   trainOne(s, recipe, audit, course)  { kind: "draw", arm: "HOME16", s, recipe, battery, n, points, pointsHash, trainerScores, keptAt, weightCount, weights, weightsHash, rates, home, course }
//   reflyOne(trained, audit)            { kind: "refly", arm: "HOMEP", s: 1, weightsHash, home }: round 4's HOMEP draw 1 (trained: fileOf round 4's file) flown home again
//   floors(audit)                       the homing round's floors flown again (tools/ship/flyHome.mjs floors)
//   reflyHolds(rec, F), floorsHold(rec, F)   whether a refly or floors record is the committed numbers to the bit (the command asks both before any training)
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: round 4's FILES and its own file, each fileOf its committed file)
// NOT HERE: the 13 trainings and the two checks of the machine (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { rankSum, hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as C from "./flyHomeChooser.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";

export const LIVES = 16, RECIPE = Object.freeze({ ...T.RECIPE, trainEps: LIVES }), SEEDS = T.SEEDS, AUDIT = T.AUDIT, ALPHA = 0.01, ITERS = RECIPE.iters;
export const ARMS = Object.freeze(["HOME16"]), LEAD = "HOME16", REFLY_S = 1;
export const RESULTS = "brain/flyHomeGradientRound.jsonl", TRAINED = T.RESULTS, TRAINED_SHA256 = C.TRAINED_SHA256;
export const FILES = Object.freeze({ ...T.FILES, trained: TRAINED });
const three = (a, b) => Object.freeze([`${a} FINDS HOME BETTER THAN ${b}`, `${a} FINDS HOME WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b} AT FINDING HOME`]);
const H16 = "THE HOMING FLY WALKED ON 16 LIVES A FLY";
export const WORDS = Object.freeze({ W: three(H16, "THE HOMING FLY WALKED ON 4"), G16: three(H16, "THE FLY TRAINED TO HOLD A COURSE") });
const FLOOR_KEYS = Object.freeze(["off", "start", "hand", "told"]);

const sOk = (s, who) => { if (!Number.isInteger(s) || s < 1) throw new Error(`flyHomeGradient.${who}: a draw is a whole number from 1 (got ${s})`); };
/** See the header: the chooser round's walk with the recipe given, its kept point audited at home and on the course. */
export function trainOne(s, recipe = RECIPE, audit = AUDIT, course = V.AUDIT) {
    sOk(s, "trainOne"); const w = C.walkOne(s, recipe), p = C.pointsOf(w)[w.keptAt], fly = () => T.flyOf("HOMEP", s, p);
    return { kind: "draw", arm: LEAD, s, recipe: w.recipe, battery: w.battery, n: w.n, points: w.points, pointsHash: w.pointsHash, trainerScores: w.trainerScores, keptAt: w.keptAt,
        weightCount: p.length, weights: packWeights(p), weightsHash: hashWeights(p), rates: fly().rates(), home: H.homeScore(fly(), audit), course: V.auditScore(fly(), course) };
}
const homepOf = (F, s) => (F && F.trained ? F.trained.lines.find((r) => r && r.kind === "draw" && r.arm === "HOMEP" && r.s === s) || null : null);
const courseOf = (F, s) => (F && F.trained ? F.trained.lines.find((r) => r && r.kind === "fly" && r.arm === "COURSE64" && r.s === s) || null : null);
/** See the header. */
export function reflyOne(trained, audit = AUDIT) {
    const hp = homepOf({ trained }, REFLY_S); if (!hp) throw new Error(`flyHomeGradient.reflyOne: HOMEP draw ${REFLY_S} is not in the file given`);
    return { kind: "refly", arm: "HOMEP", s: REFLY_S, weightsHash: hp.weightsHash, home: H.homeScore(T.flyOf("HOMEP", REFLY_S, unpackWeights(hp.weights)), audit) };
}
/** See the header. */
export function floors(audit = AUDIT) { return H.floors(audit); }
/** See the header. */
export function reflyHolds(rec, F) { const hp = homepOf(F, REFLY_S); return !!(rec && hp && rec.kind === "refly" && rec.arm === "HOMEP" && rec.s === REFLY_S && rec.weightsHash === hp.weightsHash && rec.home === hp.home); }
/** See the header. */
export function floorsHold(rec, F) { const hf = F && F.homing ? F.homing.lines.find((r) => r && r.kind === "floors") : null; return !!(rec && hf && rec.kind === "floors" && FLOOR_KEYS.every((k) => Number.isFinite(rec[k]) && rec[k] === hf[k])); }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. `job` takes the arm and a registered draw; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && ARMS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v), FIRST = SEEDS[0];
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.trained || F.trained.sha256 !== TRAINED_SHA256) bad.push(`the trained-to-home round's file is not the one committed (sha256 ${TRAINED_SHA256.slice(0, 16)}...)`);
    else { const tb = T.checkRecords(F.trained.lines, F); if (tb.length) bad.push(`the trained-to-home round's file fails its own checks: ${tb[0]}`); }
    if (bad.length) return bad;
    const refly = lines.filter((r) => r && r.kind === "refly"), fl = lines.filter((r) => r && r.kind === "floors");
    if (refly.length !== 1 || !reflyHolds(refly[0], F)) bad.push(`the machine did not fly round 4's HOMEP draw ${REFLY_S} home to its committed score to the bit`);
    if (fl.length !== 1 || !floorsHold(fl[0], F)) bad.push("the machine did not fly the homing round's floors to its committed floors to the bit");
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const s of SEEDS) { const c = seen.get(LEAD + "/" + s) || 0; if (c !== 1) bad.push(`${LEAD} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== SEEDS.length) bad.push(`${draws.length} draws (registered: ${SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.arm} draw ${r.s}`;
        if (r.arm !== LEAD || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (!same(r.battery, T.batteryOf(r.s))) bad.push(`${id} kept its point on other lives than its draw's 64`);
        let pts = null; try { pts = r.n === ITERS ? C.pointsOf(r) : null; } catch { /* said below */ }
        if (!pts || hashWeights(unpackWeights(r.points)) !== r.pointsHash || !pts.every((p) => p.length === 3 && p.every(Number.isFinite))) { bad.push(`${id} does not hold ${ITERS} points of 3 finite weights with its hash`); continue; }
        if (!(Array.isArray(r.trainerScores) && r.trainerScores.length === ITERS && r.trainerScores.every(fin)) || C.firstBest(r.trainerScores) !== r.keptAt) bad.push(`${id}'s kept point is not the first best of the trainer's own scores on its battery`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (r.weightCount !== 3 || !w || w.length !== 3 || hashWeights(w) !== r.weightsHash || !Number.isInteger(r.keptAt) || !pts[r.keptAt] || hashWeights(pts[r.keptAt]) !== r.weightsHash) bad.push(`${id}'s weights are not its walk's point ${r.keptAt}`);
        if (!(fin(r.home) && r.home >= 0 && r.home <= 1) || !fin(r.course)) bad.push(`${id} has no home score from 0 to 1 or no course score`);
        if (!(r.rates && ["a", "b", "c"].every((k) => fin(r.rates[k]) && r.rates[k] >= 0))) bad.push(`${id}'s rates are not finite and 0 or more`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash || re[0].pointsHash !== first.pointsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same walk and weights`);
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (w, better, worse) => (better ? w[0] : worse ? w[1] : w[2]);
/** See the header. HOMEP and COURSE64 are round 4's as committed; a failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), own = lines.filter((r) => r && r.kind === "draw" && r.arm === LEAD).sort((a, b) => a.s - b.s), arms = {};
    const ref = { HOMEP: SEEDS.map((s) => homepOf(F, s)).filter(Boolean), COURSE64: SEEDS.map((s) => courseOf(F, s)).filter(Boolean) };
    for (const [arm, v] of [[LEAD, own], ["HOMEP", ref.HOMEP], ["COURSE64", ref.COURSE64]]) { if (!v.length) continue; arms[arm] = { ...stats(v.map((r) => r.home)), course: v.reduce((n, r) => n + r.course, 0) / v.length };
        if (v.every((r) => Number.isInteger(r.keptAt))) arms[arm].keptAt = v.map((r) => r.keptAt);
        if (v.every((r) => r.rates)) arms[arm].rates = Object.fromEntries(["a", "b", "c"].map((k) => [k, v.reduce((n, r) => n + r.rates[k], 0) / v.length])); }
    const out = { checks, arms, W: null, G16: null };
    if (checks.length) return out;
    const d = SEEDS.map((s, i) => own[i].home - ref.HOMEP[i].home), w = signTest(d, 0), g = rankSum(own.map((r) => r.home), ref.COURSE64.map((r) => r.home));
    return { ...out, W: { ...w, a: LEAD, b: "HOMEP", diffs: d, word: pick(WORDS.W, w.p <= ALPHA && w.above > w.below, w.p <= ALPHA && w.below > w.above) },
        G16: { ...g, a: LEAD, b: "COURSE64", word: pick(WORDS.G16, g.p <= ALPHA && g.pHigher < g.pLower, g.p <= ALPHA && g.pLower < g.pHigher) } };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4)), e = (x) => (x === null || x === undefined ? "-" : x.toExponential(2));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: round 4's file as committed and passing its own checks; the machine flew round 4's HOMEP draw ${REFLY_S} home and the homing round's floors to the committed numbers to the bit; ${SEEDS.length} draws, each once, HOMEP's recipe with ${LIVES} lives a fly tried, its battery, ${ITERS} points and a trainer's score each, the kept point their first best; ${LEAD} draw ${FIRST} the same twice`);
    out.push("", `the arms (the mean of 12 flies; ${AUDIT.length} homing audit lives; course is the compass round's audit; HOMEP and COURSE64 as committed):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(9)} home ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | course ${f(s.course)}${s.rates ? ` | rates a ${e(s.rates.a)} b ${e(s.rates.b)} c ${e(s.rates.c)}` : ""}${s.keptAt ? ` | kept at ${s.keptAt.join(" ")}` : ""}`);
    if (R.W) out.push("", `W (${R.W.a} against ${R.W.b}, draw for draw): above ${R.W.above}, below ${R.W.below}, ties ${R.W.ties}; exact two-sided p ${R.W.p.toExponential(3)}`, `  ${R.W.word}`);
    if (R.G16) out.push("", `G16 (${R.G16.a} against ${R.G16.b}): ${R.G16.a}'s ranks sum to ${R.G16.sumA} (the middle is ${R.G16.n * (R.G16.n + R.G16.m + 1) / 2}), ties ${R.G16.ties}; exact two-sided p ${R.G16.p.toExponential(3)}`, `  ${R.G16.word}`);
    return out;
}
