// WebGLEngine/tools/ship/flyEscapeMemory.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 4, AS ARITHMETIC (registered in brain/FLY_ESCAPE_MEMORY_WIP.md before this file existed): round 3's flies (started at the reflex, trained on fresh episodes, chosen on a
// battery of 200; tools/ship/flyEscapeFresh.mjs) WITH MEMORY BETWEEN TICKS -- a unit's activity at the end of a tick is carried, by half, into the next (brain/rl/carryCircuit.mjs). Four arms: the
// MLP has nothing to carry. It is tools/ship/flyEscape.mjs's makeEscapeRound() with round 3's cfg and `memory: true`. This file adds round 3's results file as `BEFORE` and
//   M3   every fly against its round 3 self (the same arm, the same draw, no memory): a sign test over the 64 pairs
// The command is tools/ship/takeFlyEscapeMemory.mjs.
//
//   ROUND4, BEFORE, WORDS (the earlier four and M3), and makeEscapeRound's: MEMORY, START, REPORT, RECIPE, SEEDS, ARMS, PLAIN_UNITS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs
//   checkRecords(lines, beforeLines)   makeEscapeRound's checks, and: round 3's file holds the 64 draws of these four arms, each once
//   reading(lines, beforeLines)        makeEscapeRound's reading, and { M3, before: { arm: mean }, gap: { arm: { battery, audit } } }; with a failed check no test is made
//   readingLines(R)
"use strict";
import { makeEscapeRound } from "./flyEscape.mjs";
import { ROUND3 } from "./flyEscapeFresh.mjs";
import { signTest } from "./voxelHome.mjs";

export const ROUND4 = Object.freeze({ ...ROUND3, memory: true, results: "brain/flyEscapeMemoryRound.jsonl" });
export const BEFORE = ROUND3.results;
const R4 = makeEscapeRound(ROUND4);
export const { MEMORY, START, REPORT, RECIPE, SEEDS, ARMS, PLAIN_UNITS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs } = R4;
export const WORDS = Object.freeze({ ...R4.WORDS, M3: Object.freeze(["MEMORY BETWEEN TICKS ESCAPES BETTER THAN NONE", "MEMORY BETWEEN TICKS ESCAPES WORSE THAN NONE", "MEMORY BETWEEN TICKS CANNOT BE TOLD APART FROM NONE"]) });

/** Round 3's draws of THIS round's arms (its MLP is not among them). */
const earlier = (beforeLines) => (beforeLines || []).filter((r) => r && r.kind === "draw" && Number.isFinite(r.score) && ARMS.includes(r.arm));
/** See the header. */
export function checkRecords(lines, beforeLines = null) {
    const bad = R4.checkRecords(lines), seen = new Map();
    for (const r of earlier(beforeLines)) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    if (seen.size !== ARMS.length * SEEDS.length || !ARMS.every((a) => SEEDS.every((s) => seen.get(a + "/" + s) === 1))) bad.push(`round 3's file (${BEFORE}) does not hold the ${ARMS.length * SEEDS.length} draws of these arms, each once`);
    return bad;
}
const gapOf = (draws, ref) => { const out = {}; for (const a of ARMS) { const v = draws.filter((r) => r.arm === a && Array.isArray(r.history) && r.history.length); if (v.length) out[a] = { battery: v.reduce((n, r) => n + Math.max(...r.history.map((h) => h.ret)) - r.history[0].ret, 0) / v.length, audit: v.reduce((n, r) => n + r.score - ref, 0) / v.length }; } return out; };
/** See the header. */
export function reading(lines, beforeLines = null) {
    const checks = checkRecords(lines, beforeLines), base = R4.reading(lines), draws = lines.filter((r) => r && r.kind === "draw"), old = earlier(beforeLines);
    const before = {}; for (const a of ARMS) { const v = old.filter((r) => r.arm === a); if (v.length) before[a] = v.reduce((n, r) => n + r.score, 0) / v.length; }
    const ref = base.floors && base.floors.reflex ? base.floors.reflex.score : NaN, gap = gapOf(draws, ref);
    if (checks.length) return { ...base, checks, T0: null, T1: null, T2: null, T3: null, asked: null, M3: null, before, gap };
    const s = signTest(draws.map((r) => r.score - old.find((o) => o.arm === r.arm && o.s === r.s).score), 0), M3 = { ...s, sign: true, word: WORDS.M3[s.p <= ALPHA && s.above > s.below ? 0 : s.p <= ALPHA && s.below > s.above ? 1 : 2] };
    return { ...base, checks, M3, before, gap };
}
/** See the header. */
export function readingLines(R) {
    const out = R4.readingLines(R), f = (x) => x.toFixed(4);
    out.push("", "round 3's arms (the same flies with no memory): " + Object.entries(R.before).map(([a, m]) => `${a} ${f(m)}`).join("; "));
    out.push("the gain the trainer saw on its battery, and the gain on the audit: " + Object.entries(R.gap).map(([a, g]) => `${a} ${f(g.battery)} and ${f(g.audit)}`).join("; "));
    if (R.M3) out.push("", `M3 (every fly against its round 3 self): of ${R.M3.n} pairs, ${R.M3.above} above, ${R.M3.below} below, ${R.M3.ties} equal; exact two-sided p ${R.M3.p.toExponential(3)}`, `  ${R.M3.word}`);
    return out;
}
