// WebGLEngine/tools/ship/flySceneGains.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A GAIN FOR EACH RING CLASS, AS ARITHMETIC (registered in brain/FLY_SCENE_GAINS_WIP.md before this file existed): HOMEG, the compass fly with a gain for each of the 11 ring classes
// (brain/rl/classGainFly.mjs) on HOMEP's wiring, trained with HOMEP's recipe in the 26-type scene (brain/rl/typedHomeTrainEnv.mjs), 12 draws, each with HOMEP's seed and battery. Each is audited
// home in the 26-type scene and in the plain one over the homing round's 200 audit lives, and its course in the 26-type scene (described). Readings, sign tests over the 12 draws paired by draw:
// G26 and GP (HOMEG's home in each scene less HOMET's there, from the scene-trained round's file). The command is tools/ship/takeFlySceneGains.mjs.
//
//   SEEDS, AUDIT, COURSE_AUDIT, ALPHA, ARMS, RECIPE, SCENE, RESULTS, TRAINED_SHA256, FILES, WORDS
//   flyOf(s, weights)             the class-gain fly on draw s's wiring (HOMEP's), with the weights if given
//   trainOne(s, recipe, audit, course, battery, scene)   { kind: "draw", arm: "HOMEG", s, recipe, battery, weightCount, weights, weightsHash, keptAt, gains, home, plain, measures, history }
//   auditOne(rec, audit)          { home, plain }: a draw's weights audited home again in the 26-type scene and the plain one
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 12 trainings and the second audit (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { NR } from "../../brain/rl/compassEnv.mjs";
import { TypedHomeTrainEnv } from "../../brain/rl/typedHomeTrainEnv.mjs";
import { HomingTrainFly } from "../../brain/rl/homingTrainFly.mjs";
import { ClassGainFly, CLASSES, NG } from "../../brain/rl/classGainFly.mjs";
import { hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as S from "./flySceneTypes.mjs";
import * as P from "./flySceneTrained.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as V from "./flyCompass.mjs";

export const SEEDS = T.SEEDS, AUDIT = P.AUDIT, COURSE_AUDIT = P.COURSE_AUDIT, ALPHA = 0.01, ARMS = Object.freeze(["HOMEG"]), RECIPE = T.RECIPE, SCENE = "type";
export const RESULTS = "brain/flySceneGainsRound.jsonl", TRAINED_SHA256 = "116ab243838357674e7f33f7fdaf695ede878cbf34b3a93c291b3b344a59429d";
export const FILES = Object.freeze({ ...P.FILES, scene: P.RESULTS });
const words = (a, b, c) => Object.freeze([a, b, c]);
export const WORDS = Object.freeze({
    G26: words("WITH A GAIN FOR EACH RING CLASS THE FLY FINDS HOME BETTER IN THE 26-TYPE SCENE", "WITH A GAIN FOR EACH RING CLASS THE FLY FINDS HOME WORSE IN THE 26-TYPE SCENE", "WITH A GAIN FOR EACH RING CLASS THE FLY CANNOT BE TOLD APART IN THE 26-TYPE SCENE AT FINDING HOME"),
    GP: words("WITH A GAIN FOR EACH RING CLASS THE FLY FINDS HOME BETTER IN THE PLAIN SCENE", "WITH A GAIN FOR EACH RING CLASS THE FLY FINDS HOME WORSE IN THE PLAIN SCENE", "WITH A GAIN FOR EACH RING CLASS THE FLY CANNOT BE TOLD APART IN THE PLAIN SCENE AT FINDING HOME"),
});

/** See the header. */
export function flyOf(s, weights) { const f = new ClassGainFly({ edges: V.edgesOf("PLASTIC", s) }); return weights ? f.setParams(Float32Array.from(weights)) : f; }
/** See the header: a HOMEG training in the 26-type scene and its audits. */
export function trainOne(s, recipe = RECIPE, audit = AUDIT, course = COURSE_AUDIT, battery = T.batteryOf(s), scene = SCENE) {
    let keptAt = -1, prev = -Infinity;
    const res = trainDockES({ envFactory: () => new TypedHomeTrainEnv(scene), obsDim: NR + 2, actDim: 1, maxSteps: 1500, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => new HomingTrainFly(flyOf(s)), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), batteryEps: battery.eps, batteryBase: battery.base,
        onIter: ({ it, bestScore }) => { if (bestScore > prev) { keptAt = it; prev = bestScore; } } });
    return { kind: "draw", arm: "HOMEG", s, recipe: { ...recipe }, battery: { ...battery }, weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params), keptAt, gains: flyOf(s, res.params).gains(),
        ...auditOne({ s, weights: packWeights(res.params) }, audit), measures: S.measure(flyOf(s, res.params), course, SCENE), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header. */
export function auditOne(rec, audit = AUDIT) { const w = unpackWeights(rec.weights); return { home: S.homeIn(flyOf(rec.s, w), audit, SCENE), plain: S.homeIn(flyOf(rec.s, w), audit, "all") }; }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header: job HOMEG S trains a draw; job RECHECK 1 audits draw 1's weights again. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && rest[0] === "HOMEG" && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "job" && rest.length === 2 && rest[0] === "RECHECK" && rest[1] === String(SEEDS[0])) return { cmd, arm: rest[0], s: SEEDS[0] };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v), unit = (v) => fin(v) && v >= 0 && v <= 1;
const hometOf = (F, s) => F.scene.lines.find((r) => r && r.kind === "draw" && r.s === s) || null;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.scene || F.scene.sha256 !== TRAINED_SHA256) return [`the scene-trained round's file is not the one committed (sha256 ${TRAINED_SHA256.slice(0, 16)}...)`];
    const tb = P.checkRecords(F.scene.lines, F); if (tb.length) return [`the scene-trained round's file fails its own checks: ${tb[0]}`];
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) seen.set(r.s, (seen.get(r.s) || 0) + 1);
    for (const s of SEEDS) { const c = seen.get(s) || 0; if (c !== 1) bad.push(`HOMEG draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== SEEDS.length) bad.push(`${draws.length} draws (registered: ${SEEDS.length})`);
    for (const r of draws) {
        const id = `HOMEG draw ${r.s}`;
        if (r.arm !== "HOMEG" || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} is not HOMEP's recipe`);
        if (!same(r.battery, T.batteryOf(r.s))) bad.push(`${id} is not on its own battery`);
        let w = null; try { w = unpackWeights(r.weights); } catch { w = null; }
        if (!w || w.length !== r.weightCount || r.weightCount !== 3 + NG || hashWeights(w) !== r.weightsHash) bad.push(`${id}'s weights are not the ones it names`);
        else if (!same(r.gains, flyOf(r.s, w).gains())) bad.push(`${id}'s gains are not its weights'`);
        if (!unit(r.home) || !unit(r.plain) || !r.measures || !["calm", "wind", "share", "course"].every((k) => fin(r.measures[k]))) bad.push(`${id} does not hold its home scores and measures`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].s !== SEEDS[0] || re[0].weightsHash !== first.weightsHash || re[0].home !== first.home || re[0].plain !== first.plain) bad.push(`HOMEG draw ${SEEDS[0]} audited a second time is not there once with the same scores`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, means: null, gains: null, G26: null, GP: null };
    if (checks.length) return out;
    const d = SEEDS.map((s) => lines.find((r) => r.kind === "draw" && r.s === s)), t1 = SEEDS.map((s) => hometOf(F, s)), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const t = (name, x) => { const r = signTest(x, 0); return { ...r, diffs: x, word: pick(WORDS[name], r) }; };
    out.means = { homeg: { type: mean(d.map((r) => r.home)), plain: mean(d.map((r) => r.plain)), course: mean(d.map((r) => r.measures.course)), pc: mean(d.map((r) => unpackWeights(r.weights)[2])) },
        homet: { type: mean(t1.map((r) => r.home)), plain: mean(t1.map((r) => r.plain)), course: mean(t1.map((r) => r.measures.course)), pc: mean(t1.map((r) => unpackWeights(r.weights)[2])) } };
    out.gains = CLASSES.keys.map((k, i) => ({ cls: k, mean: mean(d.map((r) => r.gains[i])), off: d.filter((r) => r.gains[i] === 0).length }));
    return { ...out, G26: t("G26", d.map((r, i) => r.home - t1[i].home)), GP: t("GP", d.map((r, i) => r.plain - t1[i].plain)) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the scene-trained round's file as committed and passing its own checks; ${SEEDS.length} HOMEG draws, each once, HOMEP's recipe on its own battery, ${3 + NG} weights each; draw ${SEEDS[0]} audited the same twice`);
    out.push("", "mean home in the 26-type scene, home in the plain scene, course in the 26-type scene, p_c:");
    for (const [k, m] of Object.entries(R.means)) out.push(`  ${k.toUpperCase().padEnd(6)} ${f(m.type)} ${f(m.plain)} ${f(m.course)} ${m.pc.toFixed(3)}`);
    out.push("", "each class's mean gain (draws that switch it off):", "  " + R.gains.map((g) => `${g.cls} ${g.mean.toFixed(2)} (${g.off})`).join(", "));
    for (const k of ["G26", "GP"]) out.push("", `${k}: above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    return out;
}
