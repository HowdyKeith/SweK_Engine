// WebGLEngine/tools/ship/flyHomeCoursePredicts.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DOES HOLDING A COURSE PREDICT FINDING HOME? AS ARITHMETIC (registered in brain/FLY_HOME_COURSE_PREDICTS_WIP.md before this file existed). The points at iterations 0, 10, 20, 30, 40 and 59
// of the 24 committed homing walks -- the chooser round's 12 HOMEP walks and the gradient round's 12 HOME16 walks -- each flown on round 4's audit at home and on the course. Readings: S (for
// each of the 12 groups of one walk set at one iteration, the Spearman correlation of course and home over its 12 draws; a sign test of the 12 against 0) and W (for each of the 24 walks, the
// Spearman correlation over its 6 points; a sign test of the 24 against 0). The command is tools/ship/takeFlyHomeCoursePredicts.mjs.
//
//   SEEDS, AUDIT, COURSE_AUDIT, ALPHA, ITS, SETS, RESULTS, CHOOSER_SHA256, GRADIENT_SHA256, FILES, WORDS
//   walkOf(set, s, F)             the committed walk of a set and draw (HOMEP: the chooser round's walk record; HOME16: the gradient round's draw)
//   flyWalk(set, s, F, audit, course)   { kind: "walk", set, s, pointsHash, its, flies: [{ it, weightsHash, home, course }] }
//   spearman(x, y)                the rank correlation, ties given their mean rank; NaN if either side has no spread
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 25 jobs (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { hashWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as C from "./flyHomeChooser.mjs";
import * as Y from "./flyHomeGradient.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";

export const SEEDS = T.SEEDS, AUDIT = T.AUDIT, COURSE_AUDIT = V.AUDIT, ALPHA = 0.01, ITS = Object.freeze([0, 10, 20, 30, 40, 59]), SETS = Object.freeze(["HOMEP", "HOME16"]);
export const RESULTS = "brain/flyHomeCoursePredictsRound.jsonl";
export const CHOOSER_SHA256 = "8951af17ed60d6dc296672eee5d75d62ebe21addc11ac33678cb8982d8ee2876", GRADIENT_SHA256 = "138ea7125387ad2464c206bb6ffd76ca07a3206e2e7aef71e023d35c991e9024";
export const FILES = Object.freeze({ ...C.FILES, chooser: C.RESULTS, gradient: Y.RESULTS });
export const WORDS = Object.freeze({
    S: Object.freeze(["AT A FIXED STAGE OF TRAINING, THE BETTER COURSE-HOLDER FINDS HOME BETTER", "AT A FIXED STAGE OF TRAINING, THE BETTER COURSE-HOLDER FINDS HOME WORSE", "AT A FIXED STAGE OF TRAINING, HOLDING A COURSE DOES NOT DETECTABLY PREDICT FINDING HOME"]),
    W: Object.freeze(["ALONG A WALK, FINDING HOME AND HOLDING A COURSE RISE AND FALL TOGETHER", "ALONG A WALK, FINDING HOME FALLS AS HOLDING A COURSE RISES", "ALONG A WALK, FINDING HOME AND HOLDING A COURSE DO NOT DETECTABLY MOVE TOGETHER"]),
});

/** See the header. */
export function walkOf(set, s, F) {
    if (!SETS.includes(set)) throw new Error(`flyHomeCoursePredicts.walkOf: no walk set ${set}`);
    const lines = set === "HOMEP" ? F && F.chooser && F.chooser.lines : F && F.gradient && F.gradient.lines, kind = set === "HOMEP" ? "walk" : "draw";
    return (lines || []).find((r) => r && r.kind === kind && r.s === s) || null;
}
/** See the header. */
export function flyWalk(set, s, F, audit = AUDIT, course = COURSE_AUDIT) {
    const w = walkOf(set, s, F); if (!w) throw new Error(`flyHomeCoursePredicts.flyWalk: the ${set} walk of draw ${s} is not in the files given`);
    const pts = C.pointsOf(w);
    return { kind: "walk", set, s, pointsHash: w.pointsHash, its: [...ITS], flies: ITS.map((it) => { const fly = () => T.flyOf("HOMEP", s, pts[it]); return { it, weightsHash: hashWeights(pts[it]), home: H.homeScore(fly(), audit), course: V.auditScore(fly(), course) }; }) };
}
const ranks = (v) => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length); for (let i = 0; i < o.length; ) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
/** See the header. */
export function spearman(x, y) {
    const a = ranks(x), b = ranks(y), n = x.length, ma = a.reduce((p, q) => p + q, 0) / n, mb = b.reduce((p, q) => p + q, 0) / n; let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
    return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : NaN;
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && SETS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v);
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.chooser || F.chooser.sha256 !== CHOOSER_SHA256) bad.push(`the chooser round's file is not the one committed (sha256 ${CHOOSER_SHA256.slice(0, 16)}...)`);
    else { const c = C.checkRecords(F.chooser.lines, F); if (c.length) bad.push(`the chooser round's file fails its own checks: ${c[0]}`); }
    if (!F || !F.gradient || F.gradient.sha256 !== GRADIENT_SHA256) bad.push(`the gradient round's file is not the one committed (sha256 ${GRADIENT_SHA256.slice(0, 16)}...)`);
    else { const g = Y.checkRecords(F.gradient.lines, F); if (g.length) bad.push(`the gradient round's file fails its own checks: ${g[0]}`); }
    if (bad.length) return bad;
    const walks = lines.filter((r) => r && r.kind === "walk"), seen = new Map();
    for (const r of walks) { const k = r.set + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const set of SETS) for (const s of SEEDS) { const c = seen.get(set + "/" + s) || 0; if (c !== 1) bad.push(`the ${set} walk of draw ${s} is there ${c} times (once is registered)`); }
    if (walks.length !== SETS.length * SEEDS.length) bad.push(`${walks.length} walks flown (registered: ${SETS.length * SEEDS.length})`);
    for (const r of walks) {
        const id = `the ${r.set} walk of draw ${r.s}`, w = SETS.includes(r.set) ? walkOf(r.set, r.s, F) : null;
        if (!w) { bad.push(`${id} is not a registered walk`); continue; }
        if (r.pointsHash !== w.pointsHash || !same(r.its, ITS) || !Array.isArray(r.flies) || r.flies.length !== ITS.length) { bad.push(`${id} is not its committed walk's points at iterations ${ITS.join(", ")}`); continue; }
        const pts = C.pointsOf(w);
        if (!r.flies.every((f, k) => f && f.it === ITS[k] && f.weightsHash === hashWeights(pts[ITS[k]]))) bad.push(`${id}'s flies are not its points at their iterations`);
        if (!r.flies.every((f) => f && fin(f.home) && f.home >= 0 && f.home <= 1 && fin(f.course))) bad.push(`${id} has a fly with no home score from 0 to 1 or no course score`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = walks.find((r) => r.set === "HOMEP" && r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].set !== "HOMEP" || re[0].s !== SEEDS[0] || !same(re[0].flies, first.flies)) bad.push(`the HOMEP walk of draw ${SEEDS[0]} flown a second time is not there once with the same scores`);
    return bad;
}
const word = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
const nanToTie = (v) => (Number.isFinite(v) ? v : 0);
/** See the header. A failed check leaves both readings null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), walks = lines.filter((r) => r && r.kind === "walk"), out = { checks, groups: [], walks: [], pooled: null, S: null, W: null };
    if (checks.length) return out;
    const of = (set, s) => walks.find((r) => r.set === set && r.s === s), all = walks.flatMap((r) => r.flies);
    for (const set of SETS) for (const [k, it] of ITS.entries()) { const fl = SEEDS.map((s) => of(set, s).flies[k]); out.groups.push({ set, it, rho: spearman(fl.map((f) => f.course), fl.map((f) => f.home)), home: fl.reduce((n, f) => n + f.home, 0) / fl.length, course: fl.reduce((n, f) => n + f.course, 0) / fl.length }); }
    for (const set of SETS) for (const s of SEEDS) { const fl = of(set, s).flies; out.walks.push({ set, s, rho: spearman(fl.map((f) => f.course), fl.map((f) => f.home)) }); }
    out.pooled = spearman(all.map((f) => f.course), all.map((f) => f.home));
    const S = signTest(out.groups.map((g) => nanToTie(g.rho)), 0), W = signTest(out.walks.map((w) => nanToTie(w.rho)), 0);
    return { ...out, S: { ...S, word: word(WORDS.S, S) }, W: { ...W, word: word(WORDS.W, W) } };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-"), g = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the chooser and gradient rounds' files as committed and passing their own checks; ${SETS.length * SEEDS.length} walks, each once, its points at iterations ${ITS.join(", ")} flown home and on the course; the HOMEP walk of draw ${SEEDS[0]} the same twice`);
    out.push("", `the groups (a walk set at one iteration, 12 draws): Spearman of course and home; mean home; mean course`);
    for (const x of R.groups) out.push(`  ${x.set.padEnd(7)} iteration ${String(x.it).padStart(2)}: ${f(x.rho).padStart(5)} | home ${g(x.home)} | course ${g(x.course)}`);
    out.push("", `along each walk (6 points): ${R.walks.map((w) => `${w.set} ${w.s} ${f(w.rho)}`).join(", ")}`, `over all ${R.walks.length * 6} flies: ${f(R.pooled)}`);
    out.push("", `S (the 12 groups against 0): above ${R.S.above}, below ${R.S.below}, ties ${R.S.ties}; exact two-sided p ${R.S.p.toExponential(3)}`, `  ${R.S.word}`);
    out.push("", `W (the 24 walks against 0): above ${R.W.above}, below ${R.W.below}, ties ${R.W.ties}; exact two-sided p ${R.W.p.toExponential(3)}`, `  ${R.W.word}`);
    return out;
}
