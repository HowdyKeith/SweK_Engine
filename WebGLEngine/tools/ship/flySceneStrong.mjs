// WebGLEngine/tools/ship/flySceneStrong.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A STRONGER TRAINER IN THE 26-TYPE SCENE, AS ARITHMETIC (registered in brain/FLY_SCENE_STRONG_WIP.md before this file existed): HOMET16, HOMEP's fly with HOME16's recipe (16 lives a tried fly,
// tools/ship/flyHomeGradient.mjs's RECIPE) trained in the 26-type scene -- the scene-trained round's trainOne with that recipe -- 12 draws, each with its own seed and battery. Each is audited home in
// the 26-type scene and in the plain one over the homing round's 200 audit lives (and its course in the 26-type scene, described). Readings, sign tests over the 12 draws paired by draw: S26 (home
// in the 26-type scene less HOME16's there, from the scene-types round's file) and SP (home in the plain scene less HOME16's committed home). The command is tools/ship/takeFlySceneStrong.mjs.
//
//   SEEDS, AUDIT, COURSE_AUDIT, ALPHA, ARMS, RECIPE, RESULTS, TYPES_SHA256, GRADIENT_SHA256, TRAINED_SHA256, FILES, WORDS
//   trainOne(s, recipe, audit, course, battery)   the scene-trained round's trainOne in the 26-type scene with HOME16's recipe, the record's arm HOMET16
//   auditOne(rec, audit)          { home, plain }: a draw's weights audited home again in each scene
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 12 trainings and the second audit (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { hashWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as P from "./flySceneTrained.mjs";
import * as S from "./flySceneTypes.mjs";
import * as Y from "./flyHomeGradient.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = T.SEEDS, AUDIT = P.AUDIT, COURSE_AUDIT = P.COURSE_AUDIT, ALPHA = 0.01, ARMS = Object.freeze(["HOMET16"]), RECIPE = Y.RECIPE;
export const RESULTS = "brain/flySceneStrongRound.jsonl";
export const TYPES_SHA256 = "b615c753f69a97215609819fc9b2c5c4819b4f70e30c712007ae33d6fe61ba46", GRADIENT_SHA256 = "138ea7125387ad2464c206bb6ffd76ca07a3206e2e7aef71e023d35c991e9024";
export const TRAINED_SHA256 = "116ab243838357674e7f33f7fdaf695ede878cbf34b3a93c291b3b344a59429d";
export const FILES = Object.freeze({ ...P.FILES, scene: P.RESULTS });
const words = (a, b, c) => Object.freeze([a, b, c]);
export const WORDS = Object.freeze({
    S26: words("WITH THE STRONGER TRAINER THE FLY TRAINED IN THE 26-TYPE SCENE FINDS HOME BETTER THERE", "WITH THE STRONGER TRAINER THE FLY TRAINED IN THE 26-TYPE SCENE FINDS HOME WORSE THERE", "WITH THE STRONGER TRAINER THE FLY TRAINED IN THE 26-TYPE SCENE CANNOT BE TOLD APART THERE"),
    SP: words("WITH THE STRONGER TRAINER THE FLY TRAINED IN THE 26-TYPE SCENE FINDS HOME BETTER IN THE PLAIN", "WITH THE STRONGER TRAINER THE FLY TRAINED IN THE 26-TYPE SCENE FINDS HOME WORSE IN THE PLAIN", "WITH THE STRONGER TRAINER THE FLY TRAINED IN THE 26-TYPE SCENE CANNOT BE TOLD APART IN THE PLAIN"),
});

/** See the header. */
export function trainOne(s, recipe = RECIPE, audit = AUDIT, course = COURSE_AUDIT, battery = T.batteryOf(s)) {
    return { ...P.trainOne(s, recipe, audit, course, battery, P.SCENE), arm: "HOMET16" };
}
/** See the header. */
export function auditOne(rec, audit = AUDIT) { return P.auditOne(rec, audit); }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header: job HOMET16 S trains a draw; job RECHECK 1 audits draw 1's weights again. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && rest[0] === "HOMET16" && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "job" && rest.length === 2 && rest[0] === "RECHECK" && rest[1] === String(SEEDS[0])) return { cmd, arm: rest[0], s: SEEDS[0] };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v), unit = (v) => fin(v) && v >= 0 && v <= 1;
const typedOf = (F, s) => F.types.lines.find((r) => r && r.kind === "fly" && r.arm === "HOME16" && r.s === s) || null;
const hometOf = (F, s) => F.scene.lines.find((r) => r && r.kind === "draw" && r.s === s) || null;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.types || F.types.sha256 !== TYPES_SHA256) return [`the scene-types round's file is not the one committed (sha256 ${TYPES_SHA256.slice(0, 16)}...)`];
    if (!F.gradient || F.gradient.sha256 !== GRADIENT_SHA256) return [`the home-gradient round's file is not the one committed (sha256 ${GRADIENT_SHA256.slice(0, 16)}...)`];
    if (!F.scene || F.scene.sha256 !== TRAINED_SHA256) return [`the scene-trained round's file is not the one committed (sha256 ${TRAINED_SHA256.slice(0, 16)}...)`];
    const sb = S.checkRecords(F.types.lines, F); if (sb.length) return [`the scene-types round's file fails its own checks: ${sb[0]}`];
    // the home-gradient file's own checks are the scene-types round's to hold (through the compass-error and compass-noise rounds' files): a check of them here would never be reached
    const tb = P.checkRecords(F.scene.lines, F); if (tb.length) return [`the scene-trained round's file fails its own checks: ${tb[0]}`];
    for (const s of SEEDS) if (!typedOf(F, s)) return [`HOME16 draw ${s} is not in the scene-types round's file`];
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) seen.set(r.s, (seen.get(r.s) || 0) + 1);
    for (const s of SEEDS) { const c = seen.get(s) || 0; if (c !== 1) bad.push(`HOMET16 draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== SEEDS.length) bad.push(`${draws.length} draws (registered: ${SEEDS.length})`);
    for (const r of draws) {
        const id = `HOMET16 draw ${r.s}`;
        if (r.arm !== "HOMET16" || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} is not HOME16's recipe`);
        if (!same(r.battery, T.batteryOf(r.s))) bad.push(`${id} is not on its own battery`);
        let w = null; try { w = unpackWeights(r.weights); } catch { w = null; }
        if (!w || w.length !== r.weightCount || r.weightCount !== 3 || hashWeights(w) !== r.weightsHash) bad.push(`${id}'s weights are not the ones it names`);
        if (!unit(r.home) || !unit(r.plain) || !r.measures || !["calm", "wind", "share", "course"].every((k) => fin(r.measures[k]))) bad.push(`${id} does not hold its home scores and measures`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].s !== SEEDS[0] || re[0].weightsHash !== first.weightsHash || re[0].home !== first.home || re[0].plain !== first.plain) bad.push(`HOMET16 draw ${SEEDS[0]} audited a second time is not there once with the same scores`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, means: null, S26: null, SP: null };
    if (checks.length) return out;
    const d = SEEDS.map((s) => lines.find((r) => r.kind === "draw" && r.s === s)), t1 = SEEDS.map((s) => hometOf(F, s)), c = SEEDS.map((s) => N.committedOf("HOME16", s, F)), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const t = (name, x) => { const r = signTest(x, 0); return { ...r, diffs: x, word: pick(WORDS[name], r) }; };
    out.means = { homet16: { type: mean(d.map((r) => r.home)), plain: mean(d.map((r) => r.plain)), course: mean(d.map((r) => r.measures.course)) },
        home16: { type: mean(SEEDS.map((s) => typedOf(F, s).type.home)), plain: mean(c.map((x) => x.home)), course: mean(SEEDS.map((s) => typedOf(F, s).type.course)) },
        homet: { type: mean(t1.map((r) => r.home)), plain: mean(t1.map((r) => r.plain)), course: mean(t1.map((r) => r.measures.course)) } };
    return { ...out, S26: t("S26", d.map((r, i) => r.home - typedOf(F, SEEDS[i]).type.home)), SP: t("SP", d.map((r, i) => r.plain - c[i].home)) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the scene-types, home-gradient and scene-trained rounds' files as committed and passing their own checks; ${SEEDS.length} HOMET16 draws, each once, HOME16's recipe on its own battery; draw ${SEEDS[0]} audited the same twice`);
    out.push("", "mean home in the 26-type scene, home in the plain scene, course in the 26-type scene:");
    for (const [k, m] of Object.entries(R.means)) out.push(`  ${k.toUpperCase().padEnd(7)} ${f(m.type)} ${f(m.plain)} ${f(m.course)}`);
    for (const k of ["S26", "SP"]) out.push("", `${k}: above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    return out;
}
