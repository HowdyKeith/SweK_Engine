// WebGLEngine/tools/ship/flySceneTally.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A PERFECT TALLY IN THE 26-TYPE SCENE, AS ARITHMETIC (registered in brain/FLY_SCENE_TALLY_WIP.md before this file existed): the compass-noise round's 48 committed flies flown home in the
// 26-type scene (brain/rl/typedSceneEnv.mjs) with the true way home shown from HOME_AT -- the bearing from the fly's true position to its door, as the perfect-tally round shows it -- over the
// homing round's 200 audit lives. Readings, sign tests over the 48: T26 (that home less the fly's own-tally home in the 26-type scene, the scene-types round's) and Q (that difference less the same
// difference in the plain scene: the perfect-tally round's home at sigma 0 less the committed home). The command is tools/ship/takeFlySceneTally.mjs.
//
//   SEEDS, AUDIT, ALPHA, ARMS, SCENE, RESULTS, TYPES_SHA256, TALLY_SHA256, FILES, WORDS
//   trueIn(fly, lives, mode)      the compass fly flown on the homing life in a scene with the true way home shown from HOME_AT
//   flyOne(arm, s, F, audit)      { kind: "fly", arm, s, weightsHash, home }
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 49 jobs (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { signTest } from "./voxelHome.mjs";
import { CLOCK, GOAL } from "../../brain/rl/compassEnv.mjs";
import { HOME_AT } from "../../brain/rl/homeEnv.mjs";
import { TypedHomeEnv } from "../../brain/rl/typedSceneEnv.mjs";
import * as S from "./flySceneTypes.mjs";
import * as Q from "./flyHomeTrueTally.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = S.SEEDS, AUDIT = S.AUDIT, ALPHA = 0.01, ARMS = S.ARMS, SCENE = "type", RESULTS = "brain/flySceneTallyRound.jsonl";
export const TYPES_SHA256 = "b615c753f69a97215609819fc9b2c5c4819b4f70e30c712007ae33d6fe61ba46", TALLY_SHA256 = "9226e52c44940a5f109ada6594f03258b2c6c131a341cde531abcf6f7b8baeff";
export const FILES = Object.freeze({ ...S.FILES, types: S.RESULTS, tally: Q.RESULTS });
const words = (a, b, c) => Object.freeze([a, b, c]);
export const WORDS = Object.freeze({
    T26: words("IN THE 26-TYPE SCENE A PERFECT TALLY FINDS HOME BETTER THAN THE FLY'S OWN", "IN THE 26-TYPE SCENE A PERFECT TALLY FINDS HOME WORSE THAN THE FLY'S OWN", "IN THE 26-TYPE SCENE A PERFECT TALLY CANNOT BE TOLD APART FROM THE FLY'S OWN AT FINDING HOME"),
    Q: words("IN THE 26-TYPE SCENE THE TALLY COSTS HOMING MORE THAN IN THE PLAIN", "IN THE 26-TYPE SCENE THE TALLY COSTS HOMING LESS THAN IN THE PLAIN", "IN THE 26-TYPE SCENE THE TALLY COSTS HOMING AS MUCH AS IN THE PLAIN, AS FAR AS CAN BE TOLD"),
});

/** See the header. */
export function trueIn(fly, lives, mode) {
    const env = new TypedHomeEnv(mode); let sum = 0;
    for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { let seen = o; if (o[CLOCK] >= HOME_AT) { seen = Float64Array.from(o); seen[GOAL] = Math.atan2(-env.y, -env.x); } const r = env.step(fly.act(seen)); o = r.obs; done = r.done; } sum += env.score(); }
    return sum / lives.length;
}
/** See the header. */
export function flyOne(arm, s, F, audit = AUDIT) { const c = N.committedOf(arm, s, F); return { kind: "fly", arm, s, weightsHash: c.weightsHash, home: trueIn(T.flyOf("HOMEP", s, c.weights), audit, SCENE) }; }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export function parseArgs(argv) { return S.parseArgs(argv); }

const fin = (v) => Number.isFinite(v);
const typedOf = (F, arm, s) => F.types.lines.find((r) => r && r.kind === "fly" && r.arm === arm && r.s === s) || null;
const tallyOf = (F, arm, s) => { const r = F.tally.lines.find((x) => x && x.kind === "fly" && x.arm === arm && x.s === s); const l = r ? r.levels.find((x) => x.sigma === 0) : null; return l ? l.home : null; };
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.types || F.types.sha256 !== TYPES_SHA256) return [`the scene-types round's file is not the one committed (sha256 ${TYPES_SHA256.slice(0, 16)}...)`];
    if (!F.tally || F.tally.sha256 !== TALLY_SHA256) return [`the perfect-tally round's file is not the one committed (sha256 ${TALLY_SHA256.slice(0, 16)}...)`];
    const tb = S.checkRecords(F.types.lines, F); if (tb.length) return [`the scene-types round's file fails its own checks: ${tb[0]}`];
    const qb = Q.checkRecords(F.tally.lines, F); if (qb.length) return [`the perfect-tally round's file fails its own checks: ${qb[0]}`];
    const flies = lines.filter((r) => r && r.kind === "fly"), seen = new Map();
    for (const r of flies) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (flies.length !== ARMS.length * SEEDS.length) bad.push(`${flies.length} flies (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of flies) {
        const id = `${r.arm} draw ${r.s}`, ty = ARMS.includes(r.arm) && SEEDS.includes(r.s) ? typedOf(F, r.arm, r.s) : null;
        if (!ty) { bad.push(`${id} is not a registered fly`); continue; }
        if (r.weightsHash !== ty.weightsHash) bad.push(`${id} is not its arm's committed weights`);
        if (!(fin(r.home) && r.home >= 0 && r.home <= 1)) bad.push(`${id} does not hold its home score`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = flies.find((r) => r.arm === "HOMEP" && r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].arm !== "HOMEP" || re[0].s !== SEEDS[0] || re[0].home !== first.home) bad.push(`HOMEP draw ${SEEDS[0]} flown a second time is not there once with the same home score`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, arms: {}, T26: null, Q: null };
    if (checks.length) return out;
    const flies = lines.filter((r) => r && r.kind === "fly"), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const four = (r) => ({ ownPlain: N.committedOf(r.arm, r.s, F).home, ownType: typedOf(F, r.arm, r.s).type.home, truePlain: tallyOf(F, r.arm, r.s), trueType: r.home });
    for (const arm of ARMS) { const v = flies.filter((r) => r.arm === arm).map(four); out.arms[arm] = Object.fromEntries(["ownPlain", "ownType", "truePlain", "trueType"].map((k) => [k, mean(v.map((x) => x[k]))])); }
    const t = (name, d) => { const x = signTest(d, 0); return { ...x, diffs: d, word: pick(WORDS[name], x) }; }, fs4 = flies.map(four);
    return { ...out, T26: t("T26", fs4.map((x) => x.trueType - x.ownType)), Q: t("Q", fs4.map((x) => (x.trueType - x.ownType) - (x.truePlain - x.ownPlain))) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the scene-types and perfect-tally rounds' files as committed and passing their own checks; ${ARMS.length * SEEDS.length} flies, each once, its arm's committed weights; HOMEP draw ${SEEDS[0]} the same twice`);
    out.push("", "each arm's mean home: own tally plain | own tally 26-type | perfect tally plain | perfect tally 26-type");
    for (const [arm, a] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(9)} ${f(a.ownPlain)} | ${f(a.ownType)} | ${f(a.truePlain)} | ${f(a.trueType)}`);
    for (const k of ["T26", "Q"]) out.push("", `${k}: above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    return out;
}
