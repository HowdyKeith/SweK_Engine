// WebGLEngine/tools/ship/flyHomeCompassNoise.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A NOISIER COMPASS, AS ARITHMETIC (registered in brain/FLY_HOME_COMPASS_NOISE_WIP.md before this file existed): 48 committed flies (HOMEP, COURSE64, HOME16, H16BYC, 12 each) flown with the
// heading their compass sees jittered (brain/rl/noisyCompassEnv.mjs) at sigma 0, 0.2, 0.4 and 0.8, at home and on the course, on round 4's audit. Readings, sign tests over the 48: C (course at
// 0.8 against course at 0), R8 and R4 (home's fall from sigma 0 less SLOPE x the course fall, at 0.8 and 0.4, against 0), SLOPE the line the course-predicts round's 144 flies trace (least
// squares, home on course). The command is tools/ship/takeFlyHomeCompassNoise.mjs.
//
//   SEEDS, AUDIT, COURSE_AUDIT, ALPHA, SIGMAS, ARMS, RESULTS, SHA256, FILES, WORDS
//   lineOf(predicts)              { a, b }: home = a + b x course over the course-predicts round's 144 flies (predicts: fileOf its file)
//   committedOf(arm, s, F)        { weights, weightsHash, home, course }: the arm's committed fly of draw s and its committed audit scores
//   courseScore(fly, lives, sigma), homeScore(fly, lives, sigma)   the compass fly flown on the noisy compass life, and as the homing fly on the noisy homing life
//   flyOne(arm, s, F, audit, course)   { kind: "fly", arm, s, weightsHash, levels: [{ sigma, home, course }] }
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 49 jobs (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { hashWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import { NoisyCompassEnv, NoisyHomeEnv } from "../../brain/rl/noisyCompassEnv.mjs";
import { HomingFly } from "../../brain/rl/homingFly.mjs";
import * as C from "./flyHomeChooser.mjs";
import * as Y from "./flyHomeGradient.mjs";
import * as Z from "./flyHomeGradientCourse.mjs";
import * as P from "./flyHomeCoursePredicts.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as V from "./flyCompass.mjs";

export const SEEDS = T.SEEDS, AUDIT = T.AUDIT, COURSE_AUDIT = V.AUDIT, ALPHA = 0.01, SIGMAS = Object.freeze([0, 0.2, 0.4, 0.8]), ARMS = Object.freeze(["HOMEP", "COURSE64", "HOME16", "H16BYC"]);
export const RESULTS = "brain/flyHomeCompassNoiseRound.jsonl";
export const FILES = Object.freeze({ ...C.FILES, chooser: C.RESULTS, gradient: Y.RESULTS, gradcourse: Z.RESULTS, predicts: P.RESULTS });
export const SHA256 = Object.freeze({ trained: C.TRAINED_SHA256, trainer: T.TRAINER_SHA256, chooser: P.CHOOSER_SHA256, gradient: P.GRADIENT_SHA256,
    gradcourse: "b1a5f0d821808df3302d57fdedb16a23dbb490911dcf836f118079235c9e5622", predicts: "99f2f6cfd05319894afda69f048beec7def1ab16dbe0e7359e542f49c61f1511" });
export const WORDS = Object.freeze({
    C: Object.freeze(["THE NOISIER COMPASS HOLDS A COURSE BETTER", "THE NOISIER COMPASS HOLDS A COURSE WORSE", "THE NOISIER COMPASS CANNOT BE TOLD APART AT HOLDING A COURSE"]),
    R8: Object.freeze(["AT SIGMA 0.8 FINDING HOME FALLS LESS THAN THE LOST COURSE-HOLDING ACCOUNTS FOR", "AT SIGMA 0.8 FINDING HOME FALLS FURTHER THAN THE LOST COURSE-HOLDING ACCOUNTS FOR", "AT SIGMA 0.8 FINDING HOME FALLS AS FAR AS THE LOST COURSE-HOLDING ACCOUNTS FOR, AS FAR AS CAN BE TOLD"]),
    R4: Object.freeze(["AT SIGMA 0.4 FINDING HOME FALLS LESS THAN THE LOST COURSE-HOLDING ACCOUNTS FOR", "AT SIGMA 0.4 FINDING HOME FALLS FURTHER THAN THE LOST COURSE-HOLDING ACCOUNTS FOR", "AT SIGMA 0.4 FINDING HOME FALLS AS FAR AS THE LOST COURSE-HOLDING ACCOUNTS FOR, AS FAR AS CAN BE TOLD"]),
});

/** See the header. */
export function lineOf(predicts) {
    const fl = predicts.lines.filter((r) => r && r.kind === "walk").flatMap((r) => r.flies), n = fl.length, mx = fl.reduce((p, f) => p + f.course, 0) / n, my = fl.reduce((p, f) => p + f.home, 0) / n;
    let sxy = 0, sxx = 0; for (const f of fl) { sxy += (f.course - mx) * (f.home - my); sxx += (f.course - mx) ** 2; }
    const b = sxy / sxx; return { a: my - b * mx, b, n };
}
/** See the header. */
export function committedOf(arm, s, F) {
    const find = (file, f) => (F && F[file] ? F[file].lines.find(f) || null : null);
    let w = null, home = null, course = null;
    if (arm === "HOMEP") { const r = find("trained", (x) => x.kind === "draw" && x.arm === "HOMEP" && x.s === s); if (r) { w = r.weights; home = r.home; course = r.course; } }
    else if (arm === "COURSE64") { const t = find("trainer", (x) => x.kind === "draw" && x.arm === "BAT64" && x.s === s), h = find("trained", (x) => x.kind === "fly" && x.arm === "COURSE64" && x.s === s); if (t && h) { w = t.weights; home = h.home; course = t.score; } }
    else if (arm === "HOME16") { const r = find("gradient", (x) => x.kind === "draw" && x.arm === "HOME16" && x.s === s); if (r) { w = r.weights; home = r.home; course = r.course; } }
    else if (arm === "H16BYC") { const r = find("gradcourse", (x) => x.kind === "draw" && x.arm === "H16BYC" && x.s === s); if (r) { w = r.weights; home = r.home; course = r.course; } }
    else throw new Error(`flyHomeCompassNoise.committedOf: no arm ${arm}`);
    if (!w) throw new Error(`flyHomeCompassNoise.committedOf: ${arm} draw ${s} is not in the files given`);
    const weights = unpackWeights(w); return { weights, weightsHash: hashWeights(weights), home, course };
}
/** See the header. */
export function courseScore(fly, lives, sigma) { const env = new NoisyCompassEnv(sigma); let sum = 0; for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { const r = env.step(fly.act(o)); o = r.obs; done = r.done; } sum += env.ret; } return sum / lives.length; }
/** See the header. */
export function homeScore(fly, lives, sigma) { const env = new NoisyHomeEnv(sigma), h = new HomingFly(fly); let sum = 0; for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { const r = env.step(h.act(o)); o = r.obs; done = r.done; } sum += env.score(); } return sum / lives.length; }
/** See the header. */
export function flyOne(arm, s, F, audit = AUDIT, course = COURSE_AUDIT) {
    const c = committedOf(arm, s, F), fly = () => T.flyOf("HOMEP", s, c.weights);
    return { kind: "fly", arm, s, weightsHash: c.weightsHash, levels: SIGMAS.map((sigma) => ({ sigma, home: homeScore(fly(), audit, sigma), course: courseScore(fly(), course, sigma) })) };
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && ARMS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v);
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    for (const [k, h] of Object.entries(SHA256)) if (!F || !F[k] || F[k].sha256 !== h) bad.push(`the ${k} file (${FILES[k]}) is not the one committed (sha256 ${h.slice(0, 16)}...)`);
    if (bad.length) return bad;
    const own = [["trained", T.checkRecords(F.trained.lines, F)], ["gradient", Y.checkRecords(F.gradient.lines, F)], ["gradcourse", Z.checkRecords(F.gradcourse.lines, F)], ["predicts", P.checkRecords(F.predicts.lines, F)]];
    for (const [k, b] of own) if (b.length) bad.push(`the ${k} file fails its own checks: ${b[0]}`);
    if (bad.length) return bad;
    const flies = lines.filter((r) => r && r.kind === "fly"), seen = new Map();
    for (const r of flies) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (flies.length !== ARMS.length * SEEDS.length) bad.push(`${flies.length} flies (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of flies) {
        const id = `${r.arm} draw ${r.s}`; let c = null; try { c = ARMS.includes(r.arm) && SEEDS.includes(r.s) ? committedOf(r.arm, r.s, F) : null; } catch { /* said below */ }
        if (!c) { bad.push(`${id} is not a registered fly`); continue; }
        if (r.weightsHash !== c.weightsHash) bad.push(`${id} is not its arm's committed weights`);
        if (!Array.isArray(r.levels) || !same(r.levels.map((l) => l && l.sigma), SIGMAS) || !r.levels.every((l) => fin(l.home) && l.home >= 0 && l.home <= 1 && fin(l.course))) { bad.push(`${id} does not hold a home and course score at each of sigma ${SIGMAS.join(", ")}`); continue; }
        if (r.levels[0].home !== c.home || r.levels[0].course !== c.course) bad.push(`${id} at sigma 0 is not its committed home and course scores to the bit`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = flies.find((r) => r.arm === "HOMEP" && r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].arm !== "HOMEP" || re[0].s !== SEEDS[0] || !same(re[0].levels, first.levels)) bad.push(`HOMEP draw ${SEEDS[0]} flown a second time is not there once with the same scores`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), flies = lines.filter((r) => r && r.kind === "fly"), out = { checks, line: null, arms: {}, C: null, R8: null, R4: null };
    if (checks.length) return out;
    const L = lineOf(F.predicts), at = (r, sg) => r.levels[SIGMAS.indexOf(sg)], resid = (r, sg) => (at(r, sg).home - r.levels[0].home) - L.b * (at(r, sg).course - r.levels[0].course);
    out.line = L;
    for (const arm of ARMS) { const v = flies.filter((r) => r.arm === arm); out.arms[arm] = SIGMAS.map((sg, k) => ({ sigma: sg, home: v.reduce((n, r) => n + r.levels[k].home, 0) / v.length, course: v.reduce((n, r) => n + r.levels[k].course, 0) / v.length })); }
    const c = signTest(flies.map((r) => at(r, 0.8).course - r.levels[0].course), 0), r8 = signTest(flies.map((r) => resid(r, 0.8)), 0), r4 = signTest(flies.map((r) => resid(r, 0.4)), 0);
    return { ...out, C: { ...c, word: pick(WORDS.C, c) }, R8: { ...r8, resid: flies.map((r) => resid(r, 0.8)), word: pick(WORDS.R8, r8) }, R4: { ...r4, resid: flies.map((r) => resid(r, 0.4)), word: pick(WORDS.R4, r4) } };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the committed files as committed and passing their own checks; ${ARMS.length * SEEDS.length} flies, each once, its arm's committed weights, at sigma ${SIGMAS.join(", ")}, at sigma 0 its committed scores to the bit; HOMEP draw ${SEEDS[0]} the same twice`);
    out.push("", `the line (the course-predicts round's ${R.line.n} flies): home = ${f(R.line.a)} + ${f(R.line.b)} x course`, "", "each arm's mean course / home at each sigma:");
    for (const [arm, v] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(9)} ${v.map((l) => `${l.sigma}: ${f(l.course)} / ${f(l.home)}`).join(" | ")}`);
    const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    out.push("", `C (course at 0.8 against course at 0, fly for fly): above ${R.C.above}, below ${R.C.below}, ties ${R.C.ties}; exact two-sided p ${R.C.p.toExponential(3)}`, `  ${R.C.word}`);
    for (const k of ["R8", "R4"]) out.push("", `${k} (home's fall less ${f(R.line.b)} x the course fall, against 0): above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}; mean ${f(mean(R[k].resid))}`, `  ${R[k].word}`);
    return out;
}
