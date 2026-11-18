// WebGLEngine/tools/ship/flyTrainedHome.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// TRAINED TO FIND HOME, AS ARITHMETIC (registered in brain/FLY_TRAINED_HOME_WIP.md before this file existed): DOES A COMPASS FLY TRAINED FOR HOMING DO BETTER THAN ONE TRAINED TO HOLD A COURSE?
// The task is brain/rl/homeTrainEnv.mjs (the homing life, its return the homing score) and the fly brain/rl/homingTrainFly.mjs round the compass round's fly. Arms, 12 draws each:
//   HOMEP     the compass round's PLASTIC fly, trained on the homing score
//   HOMES     the compass round's PSHUF fly, trained on the homing score
//   COURSE64  the trainer round's BAT64 flies as committed (brain/flyCompassTrainerRound.jsonl), flown home; nothing trained
// The recipe is the compass round's with the best kept on 64 lives of the draw's own (BAT_BASE + BAT_STEP s + 17 k); the audit is the homing round's (tools/ship/flyHome.mjs).
// Readings: G (HOMEP against COURSE64) and T1 (HOMEP against HOMES), exact rank sums; H (against the hand rule) and V (against vision off), sign tests. The command is
// tools/ship/takeFlyTrainedHome.mjs.
//
//   RECIPE, SEEDS, AUDIT, ALPHA, ARMS, TRAINED, LEAD, BAT_EPS, BAT_BASE, BAT_STEP, RESULTS, HOMING, HOMING_SHA256, TRAINER, TRAINER_SHA256, WORDS
//   batteryOf(s)                       { eps: 64, base: BAT_BASE + BAT_STEP s }: the trainer round's BAT64 lives
//   flyOf(arm, s, weights)             the arm's compass fly (HOMEP and COURSE64 the real wiring, HOMES the compass round's shuffle), with the weights if given
//   trainOne(arm, s, recipe, audit, course)  { kind: "draw", arm, s, recipe, battery, weightCount, weights, weightsHash, rates, keptAt, home, course, history }
//   courseOne(s, trainer, audit)       { kind: "fly", arm: "COURSE64", s, weightsHash, rates, home, course } (trainer: fileOf the trainer round's file; rates and course its record's)
//   floors(audit), fileOf(bytes)
//   FILES                              the four committed files the round reads: the homing and trainer rounds' and the two they check against (the compass and balanced rounds')
//   parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: { homing, trainer, compass, balanced }, each fileOf its committed file)
// NOT HERE: the 24 trainings and 12 audits (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { NR } from "../../brain/rl/compassEnv.mjs";
import { HomeTrainEnv } from "../../brain/rl/homeTrainEnv.mjs";
import { HomingTrainFly } from "../../brain/rl/homingTrainFly.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as V from "./flyCompass.mjs";
import * as H from "./flyHome.mjs";
import * as TR from "./flyCompassTrainer.mjs";

export const RECIPE = V.RECIPE, SEEDS = V.SEEDS, AUDIT = H.AUDIT, ALPHA = 0.01;
export const ARMS = Object.freeze(["HOMEP", "HOMES", "COURSE64"]), TRAINED = Object.freeze({ HOMEP: "PLASTIC", HOMES: "PSHUF" }), LEAD = "HOMEP";
export const BAT_EPS = 64, BAT_BASE = 80000000, BAT_STEP = 10007;
export const RESULTS = "brain/flyTrainedHomeRound.jsonl", HOMING = H.RESULTS, HOMING_SHA256 = "e04f2c0b519d9c76cba1d466b93cc1a909e0bc43dde01b5612c77ceec64de0a3", TRAINER = TR.RESULTS, TRAINER_SHA256 = "dd6b4646158c4d0e33a7398bfeba6e465b3f2f088abb24be8687a51606da7efe";
export const FILES = Object.freeze({ homing: HOMING, trainer: TRAINER, compass: H.COMPASS, balanced: H.BALANCED });
const three = (a, b) => Object.freeze([`${a} FINDS HOME BETTER THAN ${b}`, `${a} FINDS HOME WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b} AT FINDING HOME`]);
const HP = "THE FLY TRAINED TO FIND HOME";
export const WORDS = Object.freeze({ G: three(HP, "THE SAME FLY TRAINED TO HOLD A COURSE"), T1: three(HP, "ONE ON A SHUFFLE TRAINED THE SAME WAY"), H: three(HP, "THE RULE SET BY HAND"), V: three(HP, "PATH INTEGRATION ALONE") });

const sOk = (s, who) => { if (!SEEDS.includes(s) && !(Number.isInteger(s) && s > 12)) throw new Error(`flyTrainedHome.${who}: a draw is a whole number from 1 (got ${s})`); };
/** See the header: the 64 lives a training keeps its point on. */
export function batteryOf(s) { sOk(s, "batteryOf"); return { eps: BAT_EPS, base: BAT_BASE + BAT_STEP * s }; }
/** See the header. */
export function flyOf(arm, s, weights) {
    if (!ARMS.includes(arm)) throw new Error(`flyTrainedHome.flyOf: no arm ${arm}`); sOk(s, "flyOf");
    const f = V.policyOf(arm === "HOMES" ? "PSHUF" : "PLASTIC", s); return weights ? f.setParams(Float32Array.from(weights)) : f;
}
/** See the header: a HOMEP or HOMES training and its audit at home (and on the compass round's course lives, described). */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT, course = V.AUDIT) {
    if (!TRAINED[arm]) throw new Error(`flyTrainedHome.trainOne: no trained arm ${arm} (the trained arms are HOMEP and HOMES)`); sOk(s, "trainOne");
    const b = batteryOf(s); let keptAt = -1, prev = -Infinity;
    const res = trainDockES({ envFactory: () => new HomeTrainEnv(), obsDim: NR + 2, actDim: 1, maxSteps: 1500, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => new HomingTrainFly(flyOf(arm, s)), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), batteryEps: b.eps, batteryBase: b.base,
        onIter: ({ it, bestScore }) => { if (bestScore > prev) { keptAt = it; prev = bestScore; } } });
    const fly = () => flyOf(arm, s, res.params);
    return { kind: "draw", arm, s, recipe: { ...recipe }, battery: b, weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params), rates: fly().rates(), keptAt,
        home: H.homeScore(fly(), audit), course: V.auditScore(fly(), course), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header: a COURSE64 fly (the trainer round's BAT64 draw s, as committed) flown home. */
export function courseOne(s, trainer, audit = AUDIT) {
    sOk(s, "courseOne"); const r = trainer.lines.find((x) => x.kind === "draw" && x.arm === "BAT64" && x.s === s); if (!r) throw new Error(`flyTrainedHome.courseOne: BAT64 draw ${s} is not in the trainer round's file`);
    return { kind: "fly", arm: "COURSE64", s, weightsHash: r.weightsHash, rates: r.rates, home: H.homeScore(flyOf("COURSE64", s, unpackWeights(r.weights)), audit), course: r.score };
}
/** See the header: the homing round's floors (they must be its to the bit). */
export function floors(audit = AUDIT) { return H.floors(audit); }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. `job` takes a registered arm and draw only; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && ARMS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), FIRST = SEEDS[0], fin = (v) => Number.isFinite(v);
/** See the header. F holds fileOf each of FILES; both rounds' files must be the ones committed and pass their own checks. */
export function checkRecords(lines, F) {
    const bad = [], { homing, trainer, compass, balanced } = F || {};
    if (!homing || homing.sha256 !== HOMING_SHA256) bad.push(`the homing round's file is not the one committed (sha256 ${HOMING_SHA256.slice(0, 16)}...)`);
    else { const hb = H.checkRecords(homing.lines, compass, balanced); if (hb.length) bad.push(`the homing round's file fails its own checks: ${hb[0]}`); }
    if (!trainer || trainer.sha256 !== TRAINER_SHA256) bad.push(`the trainer round's file is not the one committed (sha256 ${TRAINER_SHA256.slice(0, 16)}...)`);
    else { const tb = TR.checkRecords(trainer.lines, compass); if (tb.length) bad.push(`the trainer round's file fails its own checks: ${tb[0]}`); }
    if (bad.length) return bad;
    const recs = lines.filter((r) => r && (r.kind === "draw" || r.kind === "fly")), seen = new Map();
    for (const r of recs) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (recs.length !== ARMS.length * SEEDS.length) bad.push(`${recs.length} records (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of recs) {
        const id = `${r.arm} draw ${r.s}`;
        if (!ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!(fin(r.home) && r.home >= 0 && r.home <= 1)) bad.push(`${id} has no score at home from 0 to 1`);
        if (r.arm === "COURSE64") {
            const c = trainer.lines.find((x) => x.kind === "draw" && x.arm === "BAT64" && x.s === r.s);
            if (r.kind !== "fly" || !c || r.weightsHash !== c.weightsHash || r.course !== c.score || !same(r.rates, c.rates)) bad.push(`${id} is not the trainer round's BAT64 fly as committed`);
            continue;
        }
        if (r.kind !== "draw" || !same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (!same(r.battery, batteryOf(r.s))) bad.push(`${id} kept its point on other lives than its draw's 64`);
        if (r.weightCount !== 3) bad.push(`${id} has ${r.weightCount} weights (the fly has 3)`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!fin(r.course)) bad.push(`${id} has no course score`);
        if (!(r.rates && fin(r.rates.a) && fin(r.rates.b) && fin(r.rates.c) && r.rates.a >= 0 && r.rates.b >= 0 && r.rates.c >= 0)) bad.push(`${id}'s rates are not finite and 0 or more`);
        if (!(Number.isInteger(r.keptAt) && r.keptAt >= 0 && r.keptAt < RECIPE.iters)) bad.push(`${id} does not say which iteration it kept`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = recs.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors"), hfl = homing.lines.find((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !["off", "start", "hand", "told"].every((k) => fin(fl[0][k]))) bad.push("the floors are not there once");
    else if (!hfl || !["off", "start", "hand", "told"].every((k) => fl[0][k] === hfl[k])) bad.push("the floors are not the homing round's to the bit: the fly, task or audit is not the same");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), recs = lines.filter((r) => r && (r.kind === "draw" || r.kind === "fly")), fl = lines.find((r) => r && r.kind === "floors") || null;
    const of = (arm) => recs.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), home = (arm) => of(arm).map((r) => r.home), arms = {};
    for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; arms[arm] = { ...stats(home(arm)), course: v.reduce((n, r) => n + r.course, 0) / v.length };
        if (v.every((r) => r.rates)) arms[arm].rates = Object.fromEntries(["a", "b", "c"].map((k) => [k, v.reduce((n, r) => n + r.rates[k], 0) / v.length])); }
    const out = { checks, arms, floors: fl, G: null, T1: null, H: null, V: null };
    if (checks.length) return out;
    const rs = (name, a, b) => { const h = rankSum(home(a), home(b)), w = WORDS[name]; return { ...h, a, b, word: h.p <= ALPHA && h.pHigher < h.pLower ? w[0] : h.p <= ALPHA && h.pLower < h.pHigher ? w[1] : w[2] }; };
    const sg = (name, ref) => { const h = signTest(home(LEAD), ref), w = WORDS[name]; return { ...h, a: LEAD, ref, word: h.p <= ALPHA && h.above > h.below ? w[0] : h.p <= ALPHA && h.below > h.above ? w[1] : w[2] }; };
    return { ...out, G: rs("G", "HOMEP", "COURSE64"), T1: rs("T1", "HOMEP", "HOMES"), H: sg("H", fl.hand), V: sg("V", fl.off) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4)), g = (x) => (x === null || x === undefined ? "-" : x.toExponential(2));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: both committed files as committed and passing their own checks; ${ARMS.length * SEEDS.length} flies, each once, the trained ones with the recipe and their 64 lives, the COURSE64 ones the trainer round's as committed; ${LEAD} draw ${FIRST} the same twice; the floors the homing round's to the bit`);
    out.push("", `the arms (the mean of 12 flies; ${AUDIT.length} homing audit lives; course is the compass round's audit):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(9)} home ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | course ${f(s.course)}${s.rates ? ` | rates a ${g(s.rates.a)} b ${g(s.rates.b)} c ${g(s.rates.c)}` : ""}`);
    if (R.floors) out.push("", `vision off ${f(R.floors.off)}, the start ${f(R.floors.start)}, the hand rule ${f(R.floors.hand)}, told ${f(R.floors.told)}`);
    for (const name of ["G", "T1"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${t.b}): ${t.a}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    for (const name of ["H", "V"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${f(t.ref)}): above ${t.above}, below ${t.below}, ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    return out;
}
