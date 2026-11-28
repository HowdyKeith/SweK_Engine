// WebGLEngine/tools/ship/flyTallyCorrect.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// CAN THE FLY'S TALLY LEARN FROM ITS COMPASS'S CORRECTIONS? AS ARITHMETIC (registered in brain/FLY_TALLY_CORRECT_WIP.md before this file existed). The compass-noise round's 48 committed
// flies, their steering untouched, with brain/rl/correctingTally.mjs's tally in place of brain/rl/homingFly.mjs's. DEV (50 lives, seeds 100000001 + 7919 k) chooses ONE setting (g, tau) of
// GRID for all 48 by their mean home in the 26-type scene; HELD (200 lives, seeds 110000001 + 7919 k) is flown ONCE at it: today's and the corrected tally in each scene, and the perfect tally
// in the 26-type. Readings over the 48: C26 (corrected less today's in the 26-type scene) and CP (the same in the plain scene). The command is tools/ship/takeFlyTallyCorrect.mjs.
//
//   SEEDS, ARMS, ALPHA, DEV, HELD, GRID, DEV_RESULTS, RESULTS, SCENE_TALLY_SHA256, FILES, WORDS
//   homeOf(mk, lives, scene)      the mean home of a fly made by mk() for each life, in "plain" (noisy env at sigma 0) or "type" (the 26-type scene)
//   devOne(arm, s, F, lives)      { kind: "dev", arm, s, weightsHash, means: [ one home per GRID setting ] }
//   choose(devLines)              { g, tau, means: [ the 48-fly mean per setting ] }: the highest, a tie to the lower g and then the lower tau
//   heldOne(arm, s, F, at, lives) { kind: "fly", arm, s, weightsHash, ownType, corrType, ownPlain, corrPlain, trueType }
//   zeroOne(F, lives)             { kind: "zero", ... } HOMEP draw 1 with g 0 against today's tally, both scenes (the checks want them equal to the bit)
//   fileOf, parseArgs, checkDev, checkRecords, reading, readingLines
// NOT HERE: the jobs (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { signTest } from "./voxelHome.mjs";
import { NoisyHomeEnv } from "../../brain/rl/noisyCompassEnv.mjs";
import { TypedHomeEnv } from "../../brain/rl/typedSceneEnv.mjs";
import { HomingFly } from "../../brain/rl/homingFly.mjs";
import { CorrectingTally } from "../../brain/rl/correctingTally.mjs";
import * as TS from "./flySceneTally.mjs";
import * as S from "./flySceneTypes.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = TS.SEEDS, ARMS = TS.ARMS, ALPHA = 0.01, DEV_RESULTS = "brain/flyTallyCorrectDev.jsonl", RESULTS = "brain/flyTallyCorrectRound.jsonl";
export const DEV = Object.freeze(Array.from({ length: 50 }, (_, k) => 100000001 + 7919 * k));
export const HELD = Object.freeze(Array.from({ length: 200 }, (_, k) => 110000001 + 7919 * k));
export const GRID = Object.freeze([0.5, 1, 1.5, 2].flatMap((g) => [100, 175, 250, 350, 500].map((tau) => Object.freeze({ g, tau }))));
export const SCENE_TALLY_SHA256 = "95ee36184538cbd69b74eb4dfbbb60347a5d984f31256211cec0cbb93f40909a";
export const FILES = Object.freeze({ ...TS.FILES, sceneTally: TS.RESULTS });
const words = (a, b, c) => Object.freeze([a, b, c]);
export const WORDS = Object.freeze({
    C26: words("IN THE 26-TYPE SCENE THE CORRECTED TALLY FINDS HOME BETTER THAN TODAY'S", "IN THE 26-TYPE SCENE THE CORRECTED TALLY FINDS HOME WORSE THAN TODAY'S", "IN THE 26-TYPE SCENE THE CORRECTED TALLY CANNOT BE TOLD APART FROM TODAY'S"),
    CP: words("IN THE PLAIN SCENE THE CORRECTED TALLY FINDS HOME BETTER THAN TODAY'S", "IN THE PLAIN SCENE THE CORRECTED TALLY FINDS HOME WORSE THAN TODAY'S", "IN THE PLAIN SCENE THE CORRECTED TALLY CANNOT BE TOLD APART FROM TODAY'S"),
});

const envOf = (scene) => (scene === "plain" ? new NoisyHomeEnv(0) : scene === "type" ? new TypedHomeEnv("type") : null);
/** See the header. */
export function homeOf(mk, lives, scene) {
    const env = envOf(scene); if (!env) throw new Error(`flyTallyCorrect.homeOf: scene "plain" or "type", not ${scene}`);
    let sum = 0;
    for (const seed of lives) { const fly = mk(); let o = env.reset(seed), done = false; while (!done) { const r = env.step(fly.act(o)); o = r.obs; done = r.done; } sum += env.score(); }
    return sum / lives.length;
}
const innerOf = (arm, s, F) => { const c = N.committedOf(arm, s, F); return { c, inner: () => T.flyOf("HOMEP", s, c.weights) }; };
/** See the header. */
export function devOne(arm, s, F, lives = DEV) { const { c, inner } = innerOf(arm, s, F); return { kind: "dev", arm, s, weightsHash: c.weightsHash, means: GRID.map(({ g, tau }) => homeOf(() => new CorrectingTally(inner(), g, tau), lives, "type")) }; }
/** See the header. */
export function choose(devLines) {
    const devs = devLines.filter((r) => r && r.kind === "dev");
    const means = GRID.map((_, i) => devs.reduce((a, r) => a + r.means[i], 0) / devs.length);
    let best = 0; for (let i = 1; i < GRID.length; i++) if (means[i] > means[best]) best = i;   // GRID runs g then tau upward, so the first of a tie is the lower g, then the lower tau
    return { g: GRID[best].g, tau: GRID[best].tau, means };
}
/** See the header. */
export function heldOne(arm, s, F, at, lives = HELD) {
    const { c, inner } = innerOf(arm, s, F);
    return { kind: "fly", arm, s, weightsHash: c.weightsHash,
        ownType: S.homeIn(inner(), lives, "type"), corrType: homeOf(() => new CorrectingTally(inner(), at.g, at.tau), lives, "type"),
        ownPlain: N.homeScore(inner(), lives, 0), corrPlain: homeOf(() => new CorrectingTally(inner(), at.g, at.tau), lives, "plain"),
        trueType: TS.trueIn(inner(), lives, "type") };
}
/** See the header. */
export function zeroOne(F, lives = HELD) {
    const s = SEEDS[0], { inner } = innerOf("HOMEP", s, F);
    return { kind: "zero", arm: "HOMEP", s, zeroType: homeOf(() => new CorrectingTally(inner(), 0, 250), lives, "type"), ownType: homeOf(() => new HomingFly(inner()), lives, "type"),
        zeroPlain: homeOf(() => new CorrectingTally(inner(), 0, 250), lives, "plain"), ownPlain: homeOf(() => new HomingFly(inner()), lives, "plain") };
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** run | dev [--jobs N] | read | job ARM S | devjob ARM S | zerojob */
export function parseArgs(argv) {
    if (argv[0] === "dev") { const a = TS.parseArgs(["run", ...argv.slice(1)]); return a ? { ...a, cmd: "dev" } : null; }
    if (argv[0] === "devjob") { const a = TS.parseArgs(["job", ...argv.slice(1)]); return a ? { ...a, cmd: "devjob" } : null; }
    if (argv[0] === "zerojob") return argv.length === 1 ? { cmd: "zerojob" } : null;
    return TS.parseArgs(argv);
}

const fin = (v) => Number.isFinite(v), unit = (v) => fin(v) && v >= 0 && v <= 1, KEYS = ["ownType", "corrType", "ownPlain", "corrPlain", "trueType"];
const typedOf = (F, arm, s) => F.types.lines.find((r) => r && r.kind === "fly" && r.arm === arm && r.s === s) || null;
const flySet = (lines, kind, bad, label) => {
    const v = lines.filter((r) => r && r.kind === kind), seen = new Map();
    for (const r of v) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${label}: ${arm} draw ${s} is there ${c} times (once is registered)`); }
    return v;
};
const filesOk = (F) => {
    if (!F || !F.sceneTally || F.sceneTally.sha256 !== SCENE_TALLY_SHA256) return `the scene-tally round's file is not the one committed (sha256 ${SCENE_TALLY_SHA256.slice(0, 16)}...)`;
    const eb = TS.checkRecords(F.sceneTally.lines, F); return eb.length ? `the scene-tally round's file fails its own checks: ${eb[0]}` : null;
};
/** The DEV file: 48 flies once each, their committed weights, a home per setting; and the choice line, which must be choose()'s answer. */
export function checkDev(devLines, F) {
    const f = filesOk(F); if (f) return [f];
    const bad = [], devs = flySet(devLines, "dev", bad, "DEV");
    for (const r of devs) {
        const ty = typedOf(F, r.arm, r.s); if (!ty) { bad.push(`DEV: ${r.arm} draw ${r.s} is not a registered fly`); continue; }
        if (r.weightsHash !== ty.weightsHash) bad.push(`DEV: ${r.arm} draw ${r.s} is not its arm's committed weights`);
        if (!Array.isArray(r.means) || r.means.length !== GRID.length || !r.means.every(unit)) bad.push(`DEV: ${r.arm} draw ${r.s} does not hold a home for each of the ${GRID.length} settings`);
    }
    const ch = devLines.filter((r) => r && r.kind === "choice");
    if (ch.length !== 1) bad.push(`DEV: the choice is there ${ch.length} times (once is registered)`);
    else if (!bad.length) { const want = choose(devLines); if (ch[0].g !== want.g || ch[0].tau !== want.tau || JSON.stringify(ch[0].means) !== JSON.stringify(want.means)) bad.push(`DEV: the written choice (g ${ch[0].g}, tau ${ch[0].tau}) is not the highest of the ${GRID.length} means (g ${want.g}, tau ${want.tau})`); }
    return bad;
}
/** See the header: the DEV file's checks first, then HELD's. */
export function checkRecords(lines, devLines, F) {
    const db = checkDev(devLines, F); if (db.length) return db.map((m) => `the DEV file: ${m}`);
    const at = devLines.find((r) => r.kind === "choice"), bad = [], flies = flySet(lines, "fly", bad, "HELD");
    for (const r of flies) {
        const id = `${r.arm} draw ${r.s}`, ty = typedOf(F, r.arm, r.s);
        if (!ty) { bad.push(`${id} is not a registered fly`); continue; }
        if (r.weightsHash !== ty.weightsHash) bad.push(`${id} is not its arm's committed weights`);
        if (!KEYS.every((k) => unit(r[k]))) bad.push(`${id} does not hold its five home scores`);
    }
    const held = lines.filter((r) => r && r.kind === "held");
    if (held.length !== 1 || held[0].g !== at.g || held[0].tau !== at.tau) bad.push(`HELD was not flown at the DEV file's choice (g ${at.g}, tau ${at.tau})`);
    const z = lines.filter((r) => r && r.kind === "zero");
    if (z.length !== 1 || z[0].zeroType !== z[0].ownType || z[0].zeroPlain !== z[0].ownPlain || !unit(z[0].ownType)) bad.push("at g 0 the corrected tally is not today's to the bit in both scenes (or the check is not there once)");
    const re = lines.filter((r) => r && r.kind === "recheck"), first = flies.find((r) => r.arm === "HOMEP" && r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].arm !== "HOMEP" || re[0].s !== SEEDS[0] || !KEYS.every((k) => re[0][k] === first[k])) bad.push(`HOMEP draw ${SEEDS[0]} flown a second time is not there once with the same five numbers`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, devLines, F) {
    const checks = checkRecords(lines, devLines, F), out = { checks, at: null, arms: {}, C26: null, CP: null };
    if (checks.length) return out;
    const flies = lines.filter((r) => r.kind === "fly"), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length, at = devLines.find((r) => r.kind === "choice");
    for (const arm of ARMS) { const v = flies.filter((r) => r.arm === arm); out.arms[arm] = Object.fromEntries(KEYS.map((k) => [k, mean(v.map((r) => r[k]))])); }
    const t = (name, d) => { const x = signTest(d, 0); return { ...x, diffs: d, word: pick(WORDS[name], x) }; };
    const gap = mean(flies.map((r) => r.trueType - r.ownType)), gain = mean(flies.map((r) => r.corrType - r.ownType));
    return { ...out, at: { g: at.g, tau: at.tau, means: at.means }, C26: t("C26", flies.map((r) => r.corrType - r.ownType)), CP: t("CP", flies.map((r) => r.corrPlain - r.ownPlain)), closed: gain / gap };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the scene-tally round's file as committed; DEV's 48 flies once each with a home per setting, and its choice the highest of the ${GRID.length}; HELD's 48 flies once each at that choice, their arms' committed weights; g 0 is today's tally to the bit; HOMEP draw ${SEEDS[0]} the same twice`);
    out.push("", `the setting chosen on DEV: g ${R.at.g}, tau ${R.at.tau}`, "each arm's mean home on HELD: today's 26-type | corrected 26-type | today's plain | corrected plain | perfect 26-type");
    for (const [arm, a] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(9)} ${f(a.ownType)} | ${f(a.corrType)} | ${f(a.ownPlain)} | ${f(a.corrPlain)} | ${f(a.trueType)}`);
    for (const k of ["C26", "CP"]) out.push("", `${k}: above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    out.push("", `described: the share of the gap to the perfect tally the correction closes in the 26-type scene: ${f(R.closed)}`);
    return out;
}
