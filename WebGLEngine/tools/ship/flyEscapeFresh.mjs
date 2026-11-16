// WebGLEngine/tools/ship/flyEscapeFresh.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 3, AS ARITHMETIC (registered in brain/FLY_ESCAPE_FRESH_WIP.md before this file existed): round 2's flies (started at the reflex; tools/ship/flyEscapeReflex.mjs) trained by a
// trainer that flies each iteration's flies on that iteration's OWN episodes and keeps the weights best on 200 episodes it never trains on (brain/rl/dockPolicy.js: freshEpisodes, batteryEps). It is
// tools/ship/flyEscape.mjs's makeEscapeRound() with round 2's cfg and two keys, so a training, the audit, the floors and round 2's four tests are that code's. This file adds round 2's results file as
// `BEFORE` and
//   P3   every fly against its round 2 self (the same arm, the same draw): a sign test over the 80 pairs
// The command is tools/ship/takeFlyEscapeFresh.mjs.
//
//   ROUND3, BEFORE, WORDS (round 2's and P3), and makeEscapeRound's: START, REPORT, RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs
//   checkRecords(lines, beforeLines)   makeEscapeRound's checks, and: round 2's file holds its 80 draws, each once
//   reading(lines, beforeLines)        makeEscapeRound's reading, and { P3, before: { arm: mean }, gap: { arm: { battery, audit } } }; with a failed check no test is made
//   readingLines(R)
"use strict";
import { makeEscapeRound } from "./flyEscape.mjs";
import { ROUND2 } from "./flyEscapeReflex.mjs";
import { signTest } from "./voxelHome.mjs";

export const ROUND3 = Object.freeze({ ...ROUND2, fresh: true, battery: 200, results: "brain/flyEscapeFreshRound.jsonl" });
export const BEFORE = ROUND2.results;
const R3 = makeEscapeRound(ROUND3);
export const { START, REPORT, RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs } = R3;
export const WORDS = Object.freeze({ ...R3.WORDS, P3: Object.freeze(["FRESH EPISODES AND A LARGER BATTERY ESCAPE BETTER THAN ROUND 2'S TRAINER", "FRESH EPISODES AND A LARGER BATTERY ESCAPE WORSE THAN ROUND 2'S TRAINER", "FRESH EPISODES AND A LARGER BATTERY CANNOT BE TOLD APART FROM ROUND 2'S TRAINER"]) });

const earlier = (beforeLines) => (beforeLines || []).filter((r) => r && r.kind === "draw" && Number.isFinite(r.score));
/** See the header. */
export function checkRecords(lines, beforeLines = null) {
    const bad = R3.checkRecords(lines), seen = new Map();
    for (const r of earlier(beforeLines)) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    if (seen.size !== ARMS.length * SEEDS.length || !ARMS.every((a) => SEEDS.every((s) => seen.get(a + "/" + s) === 1))) bad.push(`round 2's file (${BEFORE}) does not hold its 80 draws, each once`);
    return bad;
}
/** The gain a trainer saw on its own battery (the best reading of a training's history less its first, the reflex's there) and the gain on the audit (the score less the reflex's), an arm's means. */
const gapOf = (draws, ref) => { const out = {}; for (const a of ARMS) { const v = draws.filter((r) => r.arm === a && Array.isArray(r.history) && r.history.length); if (v.length) out[a] = { battery: v.reduce((n, r) => n + Math.max(...r.history.map((h) => h.ret)) - r.history[0].ret, 0) / v.length, audit: v.reduce((n, r) => n + r.score - ref, 0) / v.length }; } return out; };
/** See the header. */
export function reading(lines, beforeLines = null) {
    const checks = checkRecords(lines, beforeLines), base = R3.reading(lines), draws = lines.filter((r) => r && r.kind === "draw"), old = earlier(beforeLines);
    const before = {}; for (const a of ARMS) { const v = old.filter((r) => r.arm === a); if (v.length) before[a] = v.reduce((n, r) => n + r.score, 0) / v.length; }
    const ref = base.floors && base.floors.reflex ? base.floors.reflex.score : NaN, gap = gapOf(draws, ref), gapBefore = gapOf(old, ref);
    if (checks.length) return { ...base, checks, T0: null, T1: null, T2: null, T3: null, asked: null, P3: null, before, gap, gapBefore };
    const s = signTest(draws.map((r) => r.score - old.find((o) => o.arm === r.arm && o.s === r.s).score), 0), P3 = { ...s, sign: true, word: WORDS.P3[s.p <= ALPHA && s.above > s.below ? 0 : s.p <= ALPHA && s.below > s.above ? 1 : 2] };
    return { ...base, checks, P3, before, gap, gapBefore };
}
/** See the header. */
export function readingLines(R) {
    const out = R3.readingLines(R), f = (x) => x.toFixed(4);
    out.push("", "round 2's arms (8 fixed training episodes, a battery of 24): " + Object.entries(R.before).map(([a, m]) => `${a} ${f(m)}`).join("; "));
    out.push("the gain the trainer saw on its battery, and the gain on the audit: " + Object.entries(R.gap).map(([a, g]) => `${a} ${f(g.battery)} and ${f(g.audit)}`).join("; "));
    out.push("the same for round 2: " + Object.entries(R.gapBefore).map(([a, g]) => `${a} ${f(g.battery)} and ${f(g.audit)}`).join("; "));
    if (R.P3) out.push("", `P3 (every fly against its round 2 self): of ${R.P3.n} pairs, ${R.P3.above} above, ${R.P3.below} below, ${R.P3.ties} equal; exact two-sided p ${R.P3.p.toExponential(3)}`, `  ${R.P3.word}`);
    return out;
}
