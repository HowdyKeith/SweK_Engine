// WebGLEngine/tools/ship/flySceneMixed.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// TRAINED IN BOTH SCENES AT ONCE, AS ARITHMETIC (registered in brain/FLY_SCENE_MIXED_WIP.md before this file existed): HOMEM, HOMEP's fly and recipe trained on the mixed training life
// (brain/rl/mixedHomeTrainEnv.mjs: the 26-type scene on odd seeds, the plain on even), 12 draws, each with HOMEP's seed and battery. Each is audited home in the 26-type scene and in the plain one
// over the homing round's 200 audit lives (the scene-trained round's auditOne), and its course in the 26-type scene (described). Readings, sign tests over the 12 draws paired by draw: M26 (home in
// the 26-type scene less HOMET's there, from the scene-trained round's file) and MP (home in the plain scene less HOMEP's committed home). The command is tools/ship/takeFlySceneMixed.mjs.
//
//   SEEDS, AUDIT, COURSE_AUDIT, ALPHA, ARMS, RECIPE, RESULTS, TRAINED_SHA256, FILES, WORDS
//   trainOne(s, recipe, audit, course, battery, envFactory)   (the mixed life unless given, for the gate) { kind: "draw", arm: "HOMEM", s, recipe, battery, weightCount, weights, weightsHash, keptAt, home, plain, measures, history }
//   auditOne(rec, audit)          { home, plain }: a draw's weights audited home again in the 26-type scene and the plain one
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 12 trainings and the second audit (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { NR } from "../../brain/rl/compassEnv.mjs";
import { MixedHomeTrainEnv } from "../../brain/rl/mixedHomeTrainEnv.mjs";
import { HomingTrainFly } from "../../brain/rl/homingTrainFly.mjs";
import { hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as S from "./flySceneTypes.mjs";
import * as P from "./flySceneTrained.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = T.SEEDS, AUDIT = P.AUDIT, COURSE_AUDIT = P.COURSE_AUDIT, ALPHA = 0.01, ARMS = Object.freeze(["HOMEM"]), RECIPE = T.RECIPE;
export const RESULTS = "brain/flySceneMixedRound.jsonl", TRAINED_SHA256 = "116ab243838357674e7f33f7fdaf695ede878cbf34b3a93c291b3b344a59429d";
export const FILES = Object.freeze({ ...P.FILES, scene: P.RESULTS });
const words = (a, b, c) => Object.freeze([a, b, c]);
export const WORDS = Object.freeze({
    M26: words("TRAINED IN BOTH SCENES THE FLY FINDS HOME BETTER IN THE 26-TYPE THAN TRAINED THERE ALONE", "TRAINED IN BOTH SCENES THE FLY FINDS HOME WORSE IN THE 26-TYPE THAN TRAINED THERE ALONE", "TRAINED IN BOTH SCENES THE FLY CANNOT BE TOLD APART IN THE 26-TYPE FROM ONE TRAINED THERE ALONE"),
    MP: words("TRAINED IN BOTH SCENES THE FLY FINDS HOME BETTER IN THE PLAIN THAN TRAINED THERE ALONE", "TRAINED IN BOTH SCENES THE FLY FINDS HOME WORSE IN THE PLAIN THAN TRAINED THERE ALONE", "TRAINED IN BOTH SCENES THE FLY CANNOT BE TOLD APART IN THE PLAIN FROM ONE TRAINED THERE ALONE"),
});

const fly = (s, w) => T.flyOf("HOMEP", s, w);
/** See the header: a HOMEM training on the mixed life and its audits. */
export function trainOne(s, recipe = RECIPE, audit = AUDIT, course = COURSE_AUDIT, battery = T.batteryOf(s), envFactory = () => new MixedHomeTrainEnv()) {
    let keptAt = -1, prev = -Infinity;
    const res = trainDockES({ envFactory, obsDim: NR + 2, actDim: 1, maxSteps: 1500, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => new HomingTrainFly(fly(s)), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), batteryEps: battery.eps, batteryBase: battery.base,
        onIter: ({ it, bestScore }) => { if (bestScore > prev) { keptAt = it; prev = bestScore; } } });
    return { kind: "draw", arm: "HOMEM", s, recipe: { ...recipe }, battery: { ...battery }, weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params), keptAt,
        ...auditOne({ s, weights: packWeights(res.params) }, audit), measures: S.measure(fly(s, res.params), course, P.SCENE), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header. */
export function auditOne(rec, audit = AUDIT) { return P.auditOne(rec, audit); }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header: job HOMEM S trains a draw; job RECHECK 1 audits draw 1's weights again. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && rest[0] === "HOMEM" && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "job" && rest.length === 2 && rest[0] === "RECHECK" && rest[1] === String(SEEDS[0])) return { cmd, arm: rest[0], s: SEEDS[0] };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v), unit = (v) => fin(v) && v >= 0 && v <= 1;
const typedOf = (F, s) => F.types.lines.find((r) => r && r.kind === "fly" && r.arm === "HOMEP" && r.s === s) || null;
const hometOf = (F, s) => F.scene.lines.find((r) => r && r.kind === "draw" && r.s === s) || null;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.scene || F.scene.sha256 !== TRAINED_SHA256) return [`the scene-trained round's file is not the one committed (sha256 ${TRAINED_SHA256.slice(0, 16)}...)`];
    const tb = P.checkRecords(F.scene.lines, F); if (tb.length) return [`the scene-trained round's file fails its own checks: ${tb[0]}`];
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) seen.set(r.s, (seen.get(r.s) || 0) + 1);
    for (const s of SEEDS) { const c = seen.get(s) || 0; if (c !== 1) bad.push(`HOMEM draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== SEEDS.length) bad.push(`${draws.length} draws (registered: ${SEEDS.length})`);
    for (const r of draws) {
        const id = `HOMEM draw ${r.s}`;
        if (r.arm !== "HOMEM" || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} is not HOMEP's recipe`);
        if (!same(r.battery, T.batteryOf(r.s))) bad.push(`${id} is not on its own battery`);
        let w = null; try { w = unpackWeights(r.weights); } catch { w = null; }
        if (!w || w.length !== r.weightCount || r.weightCount !== 3 || hashWeights(w) !== r.weightsHash) bad.push(`${id}'s weights are not the ones it names`);
        if (!unit(r.home) || !unit(r.plain) || !r.measures || !["calm", "wind", "share", "course"].every((k) => fin(r.measures[k]))) bad.push(`${id} does not hold its home scores and measures`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].s !== SEEDS[0] || re[0].weightsHash !== first.weightsHash || re[0].home !== first.home || re[0].plain !== first.plain) bad.push(`HOMEM draw ${SEEDS[0]} audited a second time is not there once with the same scores`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, means: null, M26: null, MP: null };
    if (checks.length) return out;
    const d = SEEDS.map((s) => lines.find((r) => r.kind === "draw" && r.s === s)), t1 = SEEDS.map((s) => hometOf(F, s)), c = SEEDS.map((s) => N.committedOf("HOMEP", s, F)), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const t = (name, x) => { const r = signTest(x, 0); return { ...r, diffs: x, word: pick(WORDS[name], r) }; };
    out.means = { homem: { type: mean(d.map((r) => r.home)), plain: mean(d.map((r) => r.plain)), course: mean(d.map((r) => r.measures.course)) }, homet: { type: mean(t1.map((r) => r.home)), plain: mean(t1.map((r) => r.plain)), course: mean(t1.map((r) => r.measures.course)) },
        homep: { type: mean(SEEDS.map((s) => typedOf(F, s).type.home)), plain: mean(c.map((x) => x.home)), course: mean(SEEDS.map((s) => typedOf(F, s).type.course)) } };
    return { ...out, M26: t("M26", d.map((r, i) => r.home - t1[i].home)), MP: t("MP", d.map((r, i) => r.plain - c[i].home)) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the scene-trained round's file as committed and passing its own checks; ${SEEDS.length} HOMEM draws, each once, HOMEP's recipe on its own battery; draw ${SEEDS[0]} audited the same twice`);
    out.push("", "mean home in the 26-type scene, home in the plain scene, course in the 26-type scene:");
    for (const [k, m] of Object.entries(R.means)) out.push(`  ${k.toUpperCase().padEnd(6)} ${f(m.type)} ${f(m.plain)} ${f(m.course)}`);
    for (const k of ["M26", "MP"]) out.push("", `${k}: above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    return out;
}
