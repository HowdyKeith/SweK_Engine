// WebGLEngine/tools/ship/flyEscapeSplit.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 7, AS ARITHMETIC (registered in brain/FLY_ESCAPE_SPLIT_WIP.md before this file existed): WHICH PART OF THE COUNTS? Round 6 said the real wiring's edge over a free shuffle is
// what a count-keeping shuffle keeps. Round 6's cells, inputs, read-out, start and trainer, on 32 NEW draws an arm (49 to 80), five arms -- in every one the 369 real strengths in the list's order:
//   GDEG    round 6's: degreeShuffle(the real connections, 9000 + s). Every cell keeps its count in, its count out, the strengths it receives. The control.
//   GIN     brain/rl/splitShuffle.mjs's inShuffle (IN_SEED + s): a connection keeps its target. Every cell keeps its count in and what it receives; not its count out.
//   GOUT    outShuffle (OUT_SEED + s): a connection keeps its source. Every cell keeps its count out and what it sends; not its count in.
//   GGF     keepOnto the two Giant Fibers (ONTO_SEED + s): the 42 connections onto them are the real ones, whole; the other 327 are placed freely among the places not onto a fibre.
//   GSHUF   round 5's free shuffle (shuffledEdges(42, 369, 7000 + s)).
// It is tools/ship/flyEscape.mjs's makeEscapeRound() with its own arms and draws. The registration's R0 (GDEG against GSHUF) is that reading's T1; this file adds K1 (GIN), K2 (GOUT) and K3 (GGF),
// each against GSHUF, and -- described, given no word -- each of the three beside GDEG, and how many of an arm's trainings FAIL (a score below FAIL_BELOW).
// The command is tools/ship/takeFlyEscapeSplit.mjs.
"use strict";
import { makeEscapeRound } from "./flyEscape.mjs";
import { ROUND3 } from "./flyEscapeFresh.mjs";
import { rankSum } from "./paintingFly.mjs";
import { CELLS, VISUAL_INPUTS, EDGE_START, SHUFFLE_SEED } from "./flyEscapeVision.mjs";
import { DEGREE_SEED, FAIL_BELOW as FAIL6, WORDS as WORDS6 } from "./flyEscapeDegree.mjs";
import { MaskedCircuitPolicy, maskedWeightCount } from "../../brain/rl/maskedCircuitPolicy.mjs";
import { shuffledEdges } from "../../brain/rl/paintCircuitPolicy.mjs";
import { degreeShuffle } from "../../brain/rl/degreeShuffle.mjs";
import { inShuffle, outShuffle, keepOnto } from "../../brain/rl/splitShuffle.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";

export const IN_SEED = 11000, OUT_SEED = 12000, ONTO_SEED = 13000, FAIL_BELOW = FAIL6, DRAWS = Object.freeze(Array.from({ length: 32 }, (_, k) => 49 + k));
export const PARTS = Object.freeze({ K1: "GIN", K2: "GOUT", K3: "GGF" });   // the registration's test -> the arm it sets against GSHUF
const REAL = Object.freeze(T.EDGES.map((e) => [e[0], e[1]]));
const arm = (edgesOf) => ({ weights: maskedWeightCount(CELLS, VISUAL_INPUTS.length, REAL.length, T.GF.length), under: T.GF.length, circuit: (s) => ({ units: CELLS, edges: edgesOf(s) }),
    make: (s) => ({ obsDim, seed } = {}) => new MaskedCircuitPolicy({ obsDim, units: CELLS, inputs: VISUAL_INPUTS.map((e) => [...e]), edges: edgesOf(s), outputs: [...T.GF], edgeStart: [...EDGE_START], seed: seed ?? 1234 }) });
export const ARMS_OF = Object.freeze({
    GDEG: arm((s) => degreeShuffle(REAL, DEGREE_SEED + s)),
    GIN: arm((s) => inShuffle(REAL, CELLS, IN_SEED + s)),
    GOUT: arm((s) => outShuffle(REAL, CELLS, OUT_SEED + s)),
    GGF: arm((s) => keepOnto(REAL, CELLS, [...T.GF], ONTO_SEED + s)),
    GSHUF: arm((s) => shuffledEdges(CELLS, REAL.length, SHUFFLE_SEED + s)),
});
const three = (what) => Object.freeze([`${what} ESCAPES BETTER THAN A FREE SHUFFLE`, `${what} ESCAPES WORSE THAN A FREE SHUFFLE`, `${what} CANNOT BE TOLD APART FROM A FREE SHUFFLE`]);
const T0 = Object.freeze(["A FLY WHOSE WIRING KEEPS EVERY CELL'S COUNTS, STARTED AT THE REFLEX, ESCAPES BETTER THAN THE REFLEX", "A FLY WHOSE WIRING KEEPS EVERY CELL'S COUNTS, STARTED AT THE REFLEX, ESCAPES WORSE THAN THE REFLEX", "A FLY WHOSE WIRING KEEPS EVERY CELL'S COUNTS, STARTED AT THE REFLEX, CANNOT BE TOLD APART FROM THE REFLEX"]);
const KW = Object.freeze({ K1: three("KEEPING EVERY CELL'S COUNT IN"), K2: three("KEEPING EVERY CELL'S COUNT OUT"), K3: three("KEEPING ONLY WHAT THE TWO GIANT FIBERS RECEIVE") });
export const ROUND7 = Object.freeze({ ...ROUND3, arms: ARMS_OF, lead: "GDEG", versus: Object.freeze(["GSHUF"]), seeds: DRAWS, results: "brain/flyEscapeSplitRound.jsonl", words: Object.freeze({ T0, T1: WORDS6.D3 }) });
const base = makeEscapeRound(ROUND7);
export const { LEAD, VERSUS, MEMORY, START, REPORT, RECIPE, SEEDS, ARMS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords } = base;
export const WORDS = Object.freeze({ T0: base.WORDS.T0, T3: base.WORDS.T3, R0: base.WORDS.T1, ...KW });

/** makeEscapeRound's reading with the registration's names -- R0 (its T1) -- and K1, K2, K3, `beside: { arm: its rank sum against GDEG, no word }` and `failed: { arm: how many of its trainings scored below FAIL_BELOW }`; with a failed check no test is made. */
export function reading(lines) {
    const R = base.reading(lines), draws = lines.filter((r) => r && r.kind === "draw"), sc = (a) => draws.filter((r) => r.arm === a).sort((x, y) => x.s - y.s).map((r) => r.score);
    const failed = Object.fromEntries(ARMS.map((a) => [a, sc(a).filter((v) => v < FAIL_BELOW).length]));
    if (R.checks.length) return { ...R, R0: null, K1: null, K2: null, K3: null, beside: null, failed };
    const K = Object.fromEntries(Object.entries(PARTS).map(([k, a]) => { const t = rankSum(sc(a), sc("GSHUF")); return [k, { ...t, word: KW[k][t.p <= ALPHA && t.pHigher < t.pLower ? 0 : t.p <= ALPHA && t.pLower < t.pHigher ? 1 : 2] }]; }));
    return { ...R, R0: R.T1, ...K, beside: Object.fromEntries(Object.values(PARTS).map((a) => [a, rankSum(sc(a), sc("GDEG"))])), failed };
}
/** The reading's lines: makeEscapeRound's, then K1 to K3, each part beside GDEG, the failures, and which of the registration's names the reading's T1 has. */
export function readingLines(R) {
    const out = base.readingLines(R), mid = (t) => t.n * (t.n + t.m + 1) / 2;
    for (const [k, a] of Object.entries(PARTS)) if (R[k]) out.push("", `${k} (${a} against GSHUF): ${a}'s ranks sum to ${R[k].sumA} (the middle is ${mid(R[k])}), ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    if (R.beside) { out.push("", "described, and given no word -- each part beside GDEG, which keeps both counts:"); for (const [a, t] of Object.entries(R.beside)) out.push(`  ${a} beside GDEG: ${a}'s ranks sum to ${t.sumA} (the middle is ${mid(t)}); exact two-sided p ${t.p.toExponential(3)}`); }
    out.push("", `trainings that FAILED (a score below ${FAIL_BELOW}), of ${SEEDS.length} an arm: ` + ARMS.map((a) => `${a} ${R.failed[a]}`).join("; "), "(the registration's R0 is T1 above, GDEG against GSHUF)");
    return out;
}
