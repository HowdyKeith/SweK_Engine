// WebGLEngine/tools/ship/voxelHomeBoth.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE VOXEL HOME, ROUND 6, AS ARITHMETIC (registered in brain/VOXEL_HOME_BOTH_WIP.md before this file existed): THE TWO TOGETHER. Round 4's builders (tools/ship/voxelHomeLean.mjs: the lean plus a
// network whose output layer starts at zero) trained with round 5's MANY (96 builders tried an iteration for 24). It is tools/ship/voxelHome.mjs's makeRound() with round 4's cfg and `pop: 96`, so a
// training, the audit, the floors and the four tests round 4 made (T0 and T3 against the lean, T1, T2) are that code's. This file adds what is the round's own: round 4's results file as `BEFORE`, and
//   P3   every builder against its round 4 self (the same arm, the same draw): a sign test over the 80 pairs
//   P0   this round's 16 FLY builders against round 4's 16: the exact rank-sum
// The command is tools/ship/takeVoxelHomeBoth.mjs.
//
//   ROUND6, BEFORE, WORDS (round 4's and P0, P3), and makeRound's: START, RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, RANDOM_SEEDS, ALPHA, RESULTS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs
//   checkRecords(lines, beforeLines)   makeRound's checks, and: round 4's file holds its 80 draws, each once
//   reading(lines, beforeLines)        makeRound's reading, and { P0, P3, before: { arm: { mean, homes } }, moreHomes: how many builders finish more plans than their round 4 selves }; with a failed check no test is made
//   readingLines(R)
"use strict";
import { makeRound, signTest } from "./voxelHome.mjs";
import { ROUND4 } from "./voxelHomeLean.mjs";
import { rankSum } from "./paintingFly.mjs";

export const ROUND6 = Object.freeze({ ...ROUND4, pop: 96, results: "brain/voxelHomeBothRound.jsonl" });
export const BEFORE = ROUND4.results;
const R6 = makeRound(ROUND6);
export const { START, RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, RANDOM_SEEDS, ALPHA, RESULTS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs } = R6;
const P3_WORDS = ["FROM THE LEAN, MORE BUILDERS TRIED BUILDS MORE OF A HOME", "FROM THE LEAN, MORE BUILDERS TRIED BUILDS LESS OF A HOME", "FROM THE LEAN, MORE BUILDERS TRIED CANNOT BE TOLD APART FROM ROUND 4'S"];
export const WORDS = Object.freeze({ ...R6.WORDS, P3: Object.freeze(P3_WORDS), P0: Object.freeze(P3_WORDS.map((w) => "A FLY-WIRED BUILDER, " + w)) });

const earlier = (beforeLines) => (beforeLines || []).filter((r) => r && r.kind === "draw" && Number.isFinite(r.score));
/** See the header. */
export function checkRecords(lines, beforeLines = null) {
    const bad = R6.checkRecords(lines), seen = new Map();
    for (const r of earlier(beforeLines)) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    if (seen.size !== ARMS.length * SEEDS.length || !ARMS.every((a) => SEEDS.every((s) => seen.get(a + "/" + s) === 1))) bad.push(`round 4's file (${BEFORE}) does not hold its 80 draws, each once`);
    return bad;
}
/** See the header. */
export function reading(lines, beforeLines = null) {
    const checks = checkRecords(lines, beforeLines), base = R6.reading(lines), draws = lines.filter((r) => r && r.kind === "draw"), old = earlier(beforeLines);
    const before = {}; for (const a of ARMS) { const v = old.filter((r) => r.arm === a); if (v.length) before[a] = { mean: v.reduce((n, r) => n + r.score, 0) / v.length, homes: v.reduce((n, r) => n + (r.homes || 0), 0) }; }
    if (checks.length) return { ...base, checks, T0: null, T1: null, T2: null, T3: null, P0: null, P3: null, before, moreHomes: null };
    const selfOf = (r) => old.find((o) => o.arm === r.arm && o.s === r.s), word = (more, less) => (more ? 0 : less ? 1 : 2);
    const diffs = draws.map((r) => r.score - selfOf(r).score), s = signTest(diffs, 0), P3 = { ...s, sign: true, word: WORDS.P3[word(s.p <= ALPHA && s.above > s.below, s.p <= ALPHA && s.below > s.above)] };
    const fly = (L) => L.filter((r) => r.arm === "FLY").sort((p, q) => p.s - q.s).map((r) => r.score), t = rankSum(fly(draws), fly(old)), P0 = { ...t, word: WORDS.P0[word(t.p <= ALPHA && t.pHigher < t.pLower, t.p <= ALPHA && t.pLower < t.pHigher)] };
    return { ...base, checks, P0, P3, before, moreHomes: draws.filter((r) => r.homes > selfOf(r).homes).length };
}
/** See the header. */
export function readingLines(R) {
    const out = R6.readingLines(R), f = (x) => x.toFixed(4);
    out.push("", "round 4's arms (24 builders tried an iteration): " + Object.entries(R.before).map(([a, b]) => `${a} ${f(b.mean)}, homes ${b.homes}`).join("; "));
    if (R.moreHomes !== null) out.push(`builders that finish more of the 200 plans than their round 4 selves: ${R.moreHomes} of ${ARMS.length * SEEDS.length}`);
    if (R.P3) out.push("", `P3 (every builder against its round 4 self): of ${R.P3.n} pairs, ${R.P3.above} above, ${R.P3.below} below, ${R.P3.ties} equal; exact two-sided p ${R.P3.p.toExponential(3)}`, `  ${R.P3.word}`);
    if (R.P0) out.push("", `P0 (this round's FLY against round 4's FLY): the ranks sum to ${R.P0.sumA} (the middle is ${R.P0.n * (R.P0.n + R.P0.m + 1) / 2}), ties ${R.P0.ties}; exact two-sided p ${R.P0.p.toExponential(3)}`, `  ${R.P0.word}`);
    return out;
}
