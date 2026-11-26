// WebGLEngine/tools/ship/flyHomeTrueTally.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A PERFECT TALLY, AS ARITHMETIC (registered in brain/FLY_HOME_TRUE_TALLY_WIP.md before this file existed): the compass-noise round's 48 flies flown home on its noisy homing life
// (brain/rl/noisyCompassEnv.mjs) with the true way home shown from HOME_AT -- the bearing from the fly's true position to its door -- where the homing fly (brain/rl/homingFly.mjs) shows the
// bearing from its tally; steering stays on the fly's own compass. At sigma 0, 0.4 and 0.8, on round 4's audit. Readings, sign tests over the 48: T0 (the perfect tally's home score at sigma
// 0 less the fly's own, committed) and T8 (its fall from sigma 0 to 0.8 less the own tally's fall, as the compass-noise round committed it). The command is tools/ship/takeFlyHomeTrueTally.mjs.
//
//   SEEDS, AUDIT, ALPHA, SIGMAS, ARMS, RESULTS, NOISE_SHA256, FILES, WORDS
//   trueHome(fly, lives, sigma)   the compass fly flown on the noisy homing life with the true way home shown from HOME_AT
//   flyOne(arm, s, F, audit)      { kind: "fly", arm, s, weightsHash, levels: [{ sigma, home }] }
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 49 jobs (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { signTest } from "./voxelHome.mjs";
import { NoisyHomeEnv } from "../../brain/rl/noisyCompassEnv.mjs";
import { CLOCK, GOAL } from "../../brain/rl/compassEnv.mjs";
import { HOME_AT } from "../../brain/rl/homeEnv.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = N.SEEDS, AUDIT = N.AUDIT, ALPHA = 0.01, SIGMAS = Object.freeze([0, 0.4, 0.8]), ARMS = N.ARMS;
export const RESULTS = "brain/flyHomeTrueTallyRound.jsonl", NOISE_SHA256 = "89be16c3a54a14d49084f5027925fbe2aab958dc99805d09510c3a6dabf4f74a";
export const FILES = Object.freeze({ ...N.FILES, noise: N.RESULTS });
export const WORDS = Object.freeze({
    T0: Object.freeze(["WITH A PERFECT TALLY THE FLY FINDS HOME BETTER THAN WITH ITS OWN", "WITH A PERFECT TALLY THE FLY FINDS HOME WORSE THAN WITH ITS OWN", "WITH A PERFECT TALLY THE FLY CANNOT BE TOLD APART FROM ITSELF WITH ITS OWN AT FINDING HOME"]),
    T8: Object.freeze(["WITH A PERFECT TALLY A NOISIER COMPASS COSTS HOMING LESS", "WITH A PERFECT TALLY A NOISIER COMPASS COSTS HOMING MORE", "WITH A PERFECT TALLY A NOISIER COMPASS COSTS HOMING AS MUCH, AS FAR AS CAN BE TOLD"]),
});

/** See the header. */
export function trueHome(fly, lives, sigma) {
    const env = new NoisyHomeEnv(sigma); let sum = 0;
    for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { let seen = o; if (o[CLOCK] >= HOME_AT) { seen = Float64Array.from(o); seen[GOAL] = Math.atan2(-env.y, -env.x); } const r = env.step(fly.act(seen)); o = r.obs; done = r.done; } sum += env.score(); }
    return sum / lives.length;
}
/** See the header. */
export function flyOne(arm, s, F, audit = AUDIT) {
    const c = N.committedOf(arm, s, F);
    return { kind: "fly", arm, s, weightsHash: c.weightsHash, levels: SIGMAS.map((sigma) => ({ sigma, home: trueHome(T.flyOf("HOMEP", s, c.weights), audit, sigma) })) };
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export function parseArgs(argv) { return N.parseArgs(argv); }

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v);
const ownOf = (F, arm, s) => F.noise.lines.find((r) => r && r.kind === "fly" && r.arm === arm && r.s === s) || null;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.noise || F.noise.sha256 !== NOISE_SHA256) return [`the compass-noise round's file is not the one committed (sha256 ${NOISE_SHA256.slice(0, 16)}...)`];
    const nb = N.checkRecords(F.noise.lines, F); if (nb.length) return [`the compass-noise round's file fails its own checks: ${nb[0]}`];
    const flies = lines.filter((r) => r && r.kind === "fly"), seen = new Map();
    for (const r of flies) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (flies.length !== ARMS.length * SEEDS.length) bad.push(`${flies.length} flies (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of flies) {
        const id = `${r.arm} draw ${r.s}`, own = ARMS.includes(r.arm) && SEEDS.includes(r.s) ? ownOf(F, r.arm, r.s) : null;
        if (!own) { bad.push(`${id} is not a registered fly`); continue; }
        if (r.weightsHash !== own.weightsHash) bad.push(`${id} is not its arm's committed weights`);
        if (!Array.isArray(r.levels) || !same(r.levels.map((l) => l && l.sigma), SIGMAS) || !r.levels.every((l) => fin(l.home) && l.home >= 0 && l.home <= 1)) bad.push(`${id} does not hold a home score at each of sigma ${SIGMAS.join(", ")}`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = flies.find((r) => r.arm === "HOMEP" && r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].arm !== "HOMEP" || re[0].s !== SEEDS[0] || !same(re[0].levels, first.levels)) bad.push(`HOMEP draw ${SEEDS[0]} flown a second time is not there once with the same scores`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves both readings null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, arms: {}, T0: null, T8: null };
    if (checks.length) return out;
    const flies = lines.filter((r) => r && r.kind === "fly"), ownAt = (r, sg) => ownOf(F, r.arm, r.s).levels.find((l) => l.sigma === sg), at = (r, sg) => r.levels.find((l) => l.sigma === sg);
    for (const arm of ARMS) { const v = flies.filter((r) => r.arm === arm); out.arms[arm] = SIGMAS.map((sg) => ({ sigma: sg, home: v.reduce((n, r) => n + at(r, sg).home, 0) / v.length, own: v.reduce((n, r) => n + ownAt(r, sg).home, 0) / v.length, course: v.reduce((n, r) => n + ownAt(r, sg).course, 0) / v.length })); }
    const d0 = flies.map((r) => at(r, 0).home - ownAt(r, 0).home), d8 = flies.map((r) => (at(r, 0.8).home - at(r, 0).home) - (ownAt(r, 0.8).home - ownAt(r, 0).home)), t0 = signTest(d0, 0), t8 = signTest(d8, 0);
    return { ...out, T0: { ...t0, diffs: d0, word: pick(WORDS.T0, t0) }, T8: { ...t8, diffs: d8, word: pick(WORDS.T8, t8) } };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the compass-noise round's file as committed and passing its own checks; ${ARMS.length * SEEDS.length} flies, each once, its arm's committed weights, at sigma ${SIGMAS.join(", ")}; HOMEP draw ${SEEDS[0]} the same twice`);
    out.push("", "each arm's mean home with the perfect tally / with its own (the compass-noise round's), and course, at each sigma:");
    for (const [arm, v] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(9)} ${v.map((l) => `${l.sigma}: ${f(l.home)} / ${f(l.own)}, course ${f(l.course)}`).join(" | ")}`);
    out.push("", `T0 (perfect tally less own, at sigma 0): above ${R.T0.above}, below ${R.T0.below}, ties ${R.T0.ties}; exact two-sided p ${R.T0.p.toExponential(3)}; mean ${f(mean(R.T0.diffs))}`, `  ${R.T0.word}`);
    out.push("", `T8 (the perfect tally's fall to sigma 0.8 less its own tally's): above ${R.T8.above}, below ${R.T8.below}, ties ${R.T8.ties}; exact two-sided p ${R.T8.p.toExponential(3)}; mean ${f(mean(R.T8.diffs))}`, `  ${R.T8.word}`);
    return out;
}
