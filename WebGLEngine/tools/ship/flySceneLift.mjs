// WebGLEngine/tools/ship/flySceneLift.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE 26-TYPE SCENE'S LIFT, AS ARITHMETIC (registered in brain/FLY_SCENE_LIFT_WIP.md before this file existed): HOMEP's fly and recipe trained on draws 13 to 24, each from its own seed and
// battery, in two arms: HOMEP in the plain scene (the trained-to-home round's training) and HOMET in the 26-type scene (the scene-trained round's), both tools/ship/flySceneTrained.mjs's
// trainOne, only the scene told apart. Each draw is audited home in the 26-type scene and in the plain one over the homing round's 200 audit lives (and its course in the 26-type scene, described).
// Readings, sign tests over the 12 draws paired by draw: L (HOMET's lift -- home in the 26-type scene less in the plain -- less HOMEP's), G (HOMET's p_c less HOMEP's), R26 and RP (HOMET's home
// in each scene less HOMEP's). The command is tools/ship/takeFlySceneLift.mjs.
//
//   SEEDS, AUDIT, COURSE_AUDIT, ALPHA, ARMS, SCENES, RECIPE, RECHECK, RESULTS, TRAINED_SHA256, FILES, WORDS
//   trainOne(arm, s, recipe, audit, course, battery)   the scene-trained round's trainOne in the arm's scene, the record's arm the arm's
//   auditOne(rec, audit)          { home, plain }: a draw's weights audited home again in each scene
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 24 trainings and the second audit (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { hashWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as P from "./flySceneTrained.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = Object.freeze(Array.from({ length: 12 }, (_, k) => k + 13)), AUDIT = P.AUDIT, COURSE_AUDIT = P.COURSE_AUDIT, ALPHA = 0.01, RECIPE = P.RECIPE;
export const ARMS = Object.freeze(["HOMEP", "HOMET"]), SCENES = Object.freeze({ HOMEP: "all", HOMET: "type" }), RECHECK = Object.freeze({ arm: "HOMET", s: 13 });
export const RESULTS = "brain/flySceneLiftRound.jsonl", TRAINED_SHA256 = "116ab243838357674e7f33f7fdaf695ede878cbf34b3a93c291b3b344a59429d";
export const FILES = Object.freeze({ ...P.FILES, scene: P.RESULTS });
const words = (a, b, c) => Object.freeze([a, b, c]);
export const WORDS = Object.freeze({
    L: words("TRAINED IN THE 26-TYPE SCENE THE FLY GAINS MORE THERE OVER THE PLAIN", "TRAINED IN THE 26-TYPE SCENE THE FLY GAINS LESS THERE OVER THE PLAIN", "TRAINED IN THE 26-TYPE SCENE THE FLY CANNOT BE TOLD APART IN WHAT THAT SCENE GAINS IT"),
    G: words("TRAINED IN THE 26-TYPE SCENE THE FLY'S LANDMARK GAIN IS HIGHER", "TRAINED IN THE 26-TYPE SCENE THE FLY'S LANDMARK GAIN IS LOWER", "TRAINED IN THE 26-TYPE SCENE THE FLY'S LANDMARK GAIN CANNOT BE TOLD APART"),
    R26: P.WORDS.R26, RP: P.WORDS.RP,
});

/** See the header. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT, course = COURSE_AUDIT, battery = T.batteryOf(s)) {
    if (!ARMS.includes(arm)) throw new Error(`flySceneLift.trainOne: no arm ${arm}`);
    return { ...P.trainOne(s, recipe, audit, course, battery, SCENES[arm]), arm };
}
/** See the header. */
export function auditOne(rec, audit = AUDIT) { return P.auditOne(rec, audit); }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header: job ARM S trains a draw; job RECHECK 13 audits HOMET draw 13's weights again. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && ARMS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "job" && rest.length === 2 && rest[0] === "RECHECK" && rest[1] === String(RECHECK.s)) return { cmd, arm: rest[0], s: RECHECK.s };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v), unit = (v) => fin(v) && v >= 0 && v <= 1;
const drawOf = (lines, arm, s) => lines.find((r) => r && r.kind === "draw" && r.arm === arm && r.s === s) || null;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.scene || F.scene.sha256 !== TRAINED_SHA256) return [`the scene-trained round's file is not the one committed (sha256 ${TRAINED_SHA256.slice(0, 16)}...)`];
    const tb = P.checkRecords(F.scene.lines, F); if (tb.length) return [`the scene-trained round's file fails its own checks: ${tb[0]}`];
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== ARMS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.arm} draw ${r.s}`;
        if (!ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} is not HOMEP's recipe`);
        if (!same(r.battery, T.batteryOf(r.s))) bad.push(`${id} is not on its own battery`);
        let w = null; try { w = unpackWeights(r.weights); } catch { w = null; }
        if (!w || w.length !== r.weightCount || r.weightCount !== 3 || hashWeights(w) !== r.weightsHash) bad.push(`${id}'s weights are not the ones it names`);
        if (!unit(r.home) || !unit(r.plain) || !r.measures || !["calm", "wind", "share", "course"].every((k) => fin(r.measures[k]))) bad.push(`${id} does not hold its home scores and measures`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = drawOf(lines, RECHECK.arm, RECHECK.s);
    if (re.length !== 1 || !first || re[0].arm !== RECHECK.arm || re[0].s !== RECHECK.s || re[0].weightsHash !== first.weightsHash || re[0].home !== first.home || re[0].plain !== first.plain)
        bad.push(`${RECHECK.arm} draw ${RECHECK.s} audited a second time is not there once with the same scores`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, means: null, L: null, G: null, R26: null, RP: null };
    if (checks.length) return out;
    const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length, of = (arm) => SEEDS.map((s) => drawOf(lines, arm, s)), pc = (r) => unpackWeights(r.weights)[2], lift = (r) => r.home - r.plain;
    const hp = of("HOMEP"), ht = of("HOMET"), t = (name, x) => { const r = signTest(x, 0); return { ...r, diffs: x, word: pick(WORDS[name], r) }; };
    out.means = Object.fromEntries([["homet", ht], ["homep", hp]].map(([k, v]) => [k, { type: mean(v.map((r) => r.home)), plain: mean(v.map((r) => r.plain)), lift: mean(v.map(lift)), pc: mean(v.map(pc)), course: mean(v.map((r) => r.measures.course)) }]));
    return { ...out, L: t("L", ht.map((r, i) => lift(r) - lift(hp[i]))), G: t("G", ht.map((r, i) => pc(r) - pc(hp[i]))), R26: t("R26", ht.map((r, i) => r.home - hp[i].home)), RP: t("RP", ht.map((r, i) => r.plain - hp[i].plain)) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the scene-trained round's file as committed and passing its own checks; ${SEEDS.length} draws of each of ${ARMS.join(" and ")}, each once, HOMEP's recipe on its own battery; ${RECHECK.arm} draw ${RECHECK.s} audited the same twice`);
    out.push("", "mean home in the 26-type scene, home in the plain scene, the lift, p_c, course in the 26-type scene:");
    for (const [k, m] of Object.entries(R.means)) out.push(`  ${k.toUpperCase().padEnd(6)} ${f(m.type)} ${f(m.plain)} ${f(m.lift)} ${m.pc.toFixed(3)} ${f(m.course)}`);
    for (const k of ["L", "G", "R26", "RP"]) out.push("", `${k}: above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    return out;
}
