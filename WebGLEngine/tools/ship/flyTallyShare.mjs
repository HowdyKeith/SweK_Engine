// WebGLEngine/tools/ship/flyTallyShare.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DOES THE FLY'S OWN TALLY KEEP A FIXED SHARE OF THE PERFECT TALLY'S HOME? AS ARITHMETIC (registered in brain/FLY_TALLY_SHARE_WIP.md before this file
// existed). The compass-noise round's 48 committed flies, each flown FOUR ways on 200 FRESH lives (seeds 80000001 + 7919 k, which no round has flown):
// own tally plain (flyHomeCompassNoise.homeScore, sigma 0), own tally 26-type (flySceneTypes.homeIn, "type"), perfect tally plain
// (flyHomeTrueTally.trueHome, sigma 0) and perfect tally 26-type (flySceneTally.trueIn, "type"). A fly's share in a scene is own over perfect there;
// d is the 26-type share less the plain share. Readings over the 48: EQ (two one-sided exact sign tests, d below +MARGIN and above -MARGIN, each at
// ALPHA) and D (d against 0, two-sided). The command is tools/ship/takeFlyTallyShare.mjs.
//
//   SEEDS, AUDIT, FRESH, MARGIN, ALPHA, ARMS, RESULTS, SCENE_TALLY_SHA256, FILES, WORDS
//   fourOf(fly, lives)            { ownPlain, ownType, truePlain, trueType } for one fly on those lives
//   flyOne(arm, s, F, lives)      { kind: "fly", arm, s, weightsHash, ...fourOf }
//   reproduceOne(F)               { kind: "reproduce", arm: "HOMEP", s, ...fourOf on the OLD audit lives }   (the checks compare it to the committed rounds')
//   shareOf(r), oneSided(values, ref, side), fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)
// NOT HERE: the 50 jobs (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { signTest } from "./voxelHome.mjs";
import * as TS from "./flySceneTally.mjs";
import * as S from "./flySceneTypes.mjs";
import * as Q from "./flyHomeTrueTally.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = TS.SEEDS, AUDIT = TS.AUDIT, ARMS = TS.ARMS, ALPHA = 0.01, MARGIN = 0.02, RESULTS = "brain/flyTallyShareRound.jsonl";
export const FRESH = Object.freeze(Array.from({ length: 200 }, (_, k) => 80000001 + 7919 * k));
export const SCENE_TALLY_SHA256 = "95ee36184538cbd69b74eb4dfbbb60347a5d984f31256211cec0cbb93f40909a";
export const FILES = Object.freeze({ ...TS.FILES, sceneTally: TS.RESULTS });
export const WORDS = Object.freeze({
    EQ: Object.freeze(["THE FLY'S OWN TALLY KEEPS THE SAME SHARE OF THE PERFECT TALLY'S HOME IN BOTH SCENES, TO WITHIN 0.02",
                       "THE SHARE IS NOT SHOWN THE SAME TO WITHIN 0.02: IT MAY BE LARGER IN THE 26-TYPE SCENE",
                       "THE SHARE IS NOT SHOWN THE SAME TO WITHIN 0.02: IT MAY BE SMALLER IN THE 26-TYPE SCENE",
                       "THE SHARE IS NOT SHOWN THE SAME TO WITHIN 0.02 ON EITHER SIDE"]),
    D: Object.freeze(["THE SHARE IS LARGER IN THE 26-TYPE SCENE", "THE SHARE IS SMALLER IN THE 26-TYPE SCENE", "THE SHARE CANNOT BE TOLD APART BETWEEN THE SCENES"]),
});

/** See the header. */
export function fourOf(fly, lives) {
    return { ownPlain: N.homeScore(fly(), lives, 0), ownType: S.homeIn(fly(), lives, "type"), truePlain: Q.trueHome(fly(), lives, 0), trueType: TS.trueIn(fly(), lives, "type") };
}
const flyFor = (arm, s, F) => { const c = N.committedOf(arm, s, F); return { c, fly: () => T.flyOf("HOMEP", s, c.weights) }; };
/** See the header. */
export function flyOne(arm, s, F, lives = FRESH) { const { c, fly } = flyFor(arm, s, F); return { kind: "fly", arm, s, weightsHash: c.weightsHash, ...fourOf(fly, lives) }; }
/** See the header. */
export function reproduceOne(F) { const s = SEEDS[0], { c, fly } = flyFor("HOMEP", s, F); return { kind: "reproduce", arm: "HOMEP", s, weightsHash: c.weightsHash, ...fourOf(fly, AUDIT) }; }
/** A fly's 26-type share less its plain share. */
export function shareOf(r) { return { plain: r.ownPlain / r.truePlain, type: r.ownType / r.trueType, d: r.ownType / r.trueType - r.ownPlain / r.truePlain }; }
/** Exact one-sided sign test that `values` lie on `side` ("below" | "above") of ref; ties against the claim. */
export function oneSided(values, ref, side) {
    const n = values.length, k = values.filter((v) => (side === "below" ? v < ref : v > ref)).length;
    let c = 1, tail = 0; for (let i = 0; i <= n; i++) { if (i >= k) tail += c; c = c * (n - i) / (i + 1); }
    return { n, k, p: tail / 2 ** n };
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export function parseArgs(argv) { return TS.parseArgs(argv); }

const fin = (v) => Number.isFinite(v), unit = (v) => fin(v) && v >= 0 && v <= 1, KEYS = ["ownPlain", "ownType", "truePlain", "trueType"];
const typedOf = (F, arm, s) => F.types.lines.find((r) => r && r.kind === "fly" && r.arm === arm && r.s === s) || null;
const tallyOf = (F, arm, s) => { const r = F.tally.lines.find((x) => x && x.kind === "fly" && x.arm === arm && x.s === s); const l = r ? r.levels.find((x) => x.sigma === 0) : null; return l ? l.home : null; };
const sceneOf = (F, arm, s) => { const r = F.sceneTally.lines.find((x) => x && x.kind === "fly" && x.arm === arm && x.s === s); return r ? r.home : null; };
/** The four numbers the committed rounds hold for one fly on the old audit lives. */
export function committedFour(F, arm, s) { return { ownPlain: N.committedOf(arm, s, F).home, ownType: typedOf(F, arm, s).type.home, truePlain: tallyOf(F, arm, s), trueType: sceneOf(F, arm, s) }; }
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.sceneTally || F.sceneTally.sha256 !== SCENE_TALLY_SHA256) return [`the scene-tally round's file is not the one committed (sha256 ${SCENE_TALLY_SHA256.slice(0, 16)}...)`];
    const eb = TS.checkRecords(F.sceneTally.lines, F); if (eb.length) return [`the scene-tally round's file fails its own checks: ${eb[0]}`];
    const old = new Set(AUDIT); if (FRESH.some((x) => old.has(x)) || new Set(FRESH).size !== FRESH.length) return ["a fresh life is an old audit life, or repeats"];
    const flies = lines.filter((r) => r && r.kind === "fly"), seen = new Map();
    for (const r of flies) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (flies.length !== ARMS.length * SEEDS.length) bad.push(`${flies.length} flies (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of flies) {
        const id = `${r.arm} draw ${r.s}`, ty = ARMS.includes(r.arm) && SEEDS.includes(r.s) ? typedOf(F, r.arm, r.s) : null;
        if (!ty) { bad.push(`${id} is not a registered fly`); continue; }
        if (r.weightsHash !== ty.weightsHash) bad.push(`${id} is not its arm's committed weights`);
        if (!KEYS.every((k) => unit(r[k])) || !(r.truePlain > 0 && r.trueType > 0)) bad.push(`${id} does not hold its four home scores`);
    }
    const rep = lines.filter((r) => r && r.kind === "reproduce");
    if (rep.length !== 1) bad.push(`the reproduction on the old audit lives is there ${rep.length} times (once is registered)`);
    else { const want = committedFour(F, "HOMEP", SEEDS[0]); for (const k of KEYS) if (rep[0][k] !== want[k]) bad.push(`the reproduction's ${k} on the old audit lives is ${rep[0][k]}, the committed rounds hold ${want[k]}: the scorers are not the ones those rounds flew`); }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = flies.find((r) => r.arm === "HOMEP" && r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].arm !== "HOMEP" || re[0].s !== SEEDS[0] || !KEYS.every((k) => re[0][k] === first[k])) bad.push(`HOMEP draw ${SEEDS[0]} flown a second time is not there once with the same four numbers`);
    return bad;
}
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, arms: {}, EQ: null, D: null };
    if (checks.length) return out;
    const flies = lines.filter((r) => r && r.kind === "fly"), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    for (const arm of ARMS) {
        const v = flies.filter((r) => r.arm === arm);
        out.arms[arm] = { ...Object.fromEntries(KEYS.map((k) => [k, mean(v.map((r) => r[k]))])), sharePlain: mean(v.map((r) => shareOf(r).plain)), shareType: mean(v.map((r) => shareOf(r).type)) };
    }
    const d = flies.map((r) => shareOf(r).d);
    const upper = oneSided(d, MARGIN, "below"), lower = oneSided(d, -MARGIN, "above"), up = upper.p <= ALPHA, lo = lower.p <= ALPHA;
    const two = signTest(d, 0);
    return { ...out, d,
        EQ: { upper, lower, word: up && lo ? WORDS.EQ[0] : !up && lo ? WORDS.EQ[1] : up && !lo ? WORDS.EQ[2] : WORDS.EQ[3] },
        D: { ...two, word: two.p <= ALPHA && two.above > two.below ? WORDS.D[0] : two.p <= ALPHA && two.below > two.above ? WORDS.D[1] : WORDS.D[2] },
        T26: signTest(flies.map((r) => r.trueType - r.ownType), 0), Q: signTest(flies.map((r) => (r.trueType - r.ownType) - (r.truePlain - r.ownPlain)), 0) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the scene-tally round's file as committed and passing its own checks; ${ARMS.length * SEEDS.length} flies, each once, its arm's committed weights; the four scorers reproduce the committed rounds' numbers for HOMEP draw ${SEEDS[0]} on the old audit lives to the bit; HOMEP draw ${SEEDS[0]} the same twice on the fresh lives`);
    out.push("", "each arm's mean home on the fresh lives: own plain | own 26-type | perfect plain | perfect 26-type || share plain | share 26-type");
    for (const [arm, a] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(9)} ${f(a.ownPlain)} | ${f(a.ownType)} | ${f(a.truePlain)} | ${f(a.trueType)} || ${f(a.sharePlain)} | ${f(a.shareType)}`);
    out.push("", `EQ: d below +${MARGIN} for ${R.EQ.upper.k} of ${R.EQ.upper.n} (one-sided p ${R.EQ.upper.p.toExponential(3)}); d above -${MARGIN} for ${R.EQ.lower.k} of ${R.EQ.lower.n} (one-sided p ${R.EQ.lower.p.toExponential(3)})`, `  ${R.EQ.word}`);
    out.push("", `D: above ${R.D.above}, below ${R.D.below}, ties ${R.D.ties}; exact two-sided p ${R.D.p.toExponential(3)}`, `  ${R.D.word}`);
    out.push("", `described: round E's T26 on these lives above ${R.T26.above}, below ${R.T26.below} (p ${R.T26.p.toExponential(3)}); its Q above ${R.Q.above}, below ${R.Q.below} (p ${R.Q.p.toExponential(3)})`);
    return out;
}
