// WebGLEngine/tools/ship/flyEscapeDegree.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 6, AS ARITHMETIC (registered in brain/FLY_ESCAPE_DEGREE_WIP.md before this file existed): IS ROUND 5'S RESULT THE CONVERGENCE, OR THE WIRING? Round 5's cells, inputs, read-out,
// start and trainer (tools/ship/flyEscapeVision.mjs), on 32 NEW draws an arm (17 to 48), three arms:
//   GF      the 369 real connections, each starting at 0.01 x its synapse count
//   GDEG    brain/rl/degreeShuffle.mjs's shuffle of them by the draw (DEGREE_SEED + s): every cell keeps its count in and its count out, and -- the strengths staying in the list's order -- the
//           strengths it receives
//   GSHUF   round 5's free shuffle (shuffledEdges(42, 369, 7000 + s)) with the same 369 strengths in its places' order
// It is tools/ship/flyEscape.mjs's makeEscapeRound() with its own arms and draws. The registration's D1 (GF against GDEG) is that reading's T1 and D2 (GF against GSHUF) its T2; this file adds
// D3 (GDEG against GSHUF) and, described and not tested, how many of an arm's trainings FAIL (a score below FAIL_BELOW).
// The command is tools/ship/takeFlyEscapeDegree.mjs.
"use strict";
import { makeEscapeRound } from "./flyEscape.mjs";
import { ROUND3 } from "./flyEscapeFresh.mjs";
import { rankSum } from "./paintingFly.mjs";
import { CELLS, VISUAL_INPUTS, EDGE_START, SHUFFLE_SEED, WORDS as WORDS5 } from "./flyEscapeVision.mjs";
import { MaskedCircuitPolicy, maskedWeightCount } from "../../brain/rl/maskedCircuitPolicy.mjs";
import { shuffledEdges } from "../../brain/rl/paintCircuitPolicy.mjs";
import { degreeShuffle } from "../../brain/rl/degreeShuffle.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";

export const DEGREE_SEED = 9000, FAIL_BELOW = 0.72, DRAWS = Object.freeze(Array.from({ length: 32 }, (_, k) => 17 + k));
const REAL = Object.freeze(T.EDGES.map((e) => [e[0], e[1]]));
const arm = (edgesOf) => ({ weights: maskedWeightCount(CELLS, VISUAL_INPUTS.length, REAL.length, T.GF.length), under: T.GF.length, circuit: (s) => ({ units: CELLS, edges: edgesOf(s) }),
    make: (s) => ({ obsDim, seed } = {}) => new MaskedCircuitPolicy({ obsDim, units: CELLS, inputs: VISUAL_INPUTS.map((e) => [...e]), edges: edgesOf(s), outputs: [...T.GF], edgeStart: [...EDGE_START], seed: seed ?? 1234 }) });
export const ARMS_OF = Object.freeze({ GF: arm(() => REAL), GDEG: arm((s) => degreeShuffle(REAL, DEGREE_SEED + s)), GSHUF: arm((s) => shuffledEdges(CELLS, REAL.length, SHUFFLE_SEED + s)) });
const D1 = Object.freeze(["THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES BETTER THAN A SHUFFLE THAT KEEPS EVERY CELL'S COUNTS", "THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES WORSE THAN A SHUFFLE THAT KEEPS EVERY CELL'S COUNTS", "THE REAL ESCAPE CIRCUIT'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE THAT KEEPS EVERY CELL'S COUNTS"]);
const D3 = Object.freeze(["KEEPING EVERY CELL'S COUNTS ESCAPES BETTER THAN A FREE SHUFFLE", "KEEPING EVERY CELL'S COUNTS ESCAPES WORSE THAN A FREE SHUFFLE", "KEEPING EVERY CELL'S COUNTS CANNOT BE TOLD APART FROM A FREE SHUFFLE"]);
export const ROUND6 = Object.freeze({ ...ROUND3, arms: ARMS_OF, lead: "GF", versus: Object.freeze(["GDEG", "GSHUF"]), seeds: DRAWS, results: "brain/flyEscapeDegreeRound.jsonl", words: Object.freeze({ T0: WORDS5.T0, T1: D1, T2: WORDS5.T1 }) });
const base = makeEscapeRound(ROUND6);
export const { LEAD, VERSUS, MEMORY, START, REPORT, RECIPE, SEEDS, ARMS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords } = base;
export const WORDS = Object.freeze({ T0: base.WORDS.T0, T3: base.WORDS.T3, D1: base.WORDS.T1, D2: base.WORDS.T2, D3 });

/** makeEscapeRound's reading with the registration's names -- D1 (its T1), D2 (its T2) -- and D3 and `failed: { arm: how many of its trainings scored below FAIL_BELOW }`; with a failed check no test is made. */
export function reading(lines) {
    const R = base.reading(lines), draws = lines.filter((r) => r && r.kind === "draw"), sc = (a) => draws.filter((r) => r.arm === a).sort((x, y) => x.s - y.s).map((r) => r.score);
    const failed = Object.fromEntries(ARMS.map((a) => [a, sc(a).filter((v) => v < FAIL_BELOW).length]));
    if (R.checks.length) return { ...R, D1: null, D2: null, D3: null, failed };
    const t = rankSum(sc("GDEG"), sc("GSHUF"));
    return { ...R, D1: R.T1, D2: R.T2, D3: { ...t, word: D3[t.p <= ALPHA && t.pHigher < t.pLower ? 0 : t.p <= ALPHA && t.pLower < t.pHigher ? 1 : 2] }, failed };
}
/** The reading's lines: makeEscapeRound's, then D3 and the failures, and which of the registration's names each test has. */
export function readingLines(R) {
    const out = base.readingLines(R);
    if (R.D3) out.push("", `D3 (GDEG against GSHUF): GDEG's ranks sum to ${R.D3.sumA} (the middle is ${R.D3.n * (R.D3.n + R.D3.m + 1) / 2}), ties ${R.D3.ties}; exact two-sided p ${R.D3.p.toExponential(3)}`, `  ${R.D3.word}`);
    out.push("", `trainings that FAILED (a score below ${FAIL_BELOW}), of ${SEEDS.length} an arm: ` + ARMS.map((a) => `${a} ${R.failed[a]}`).join("; "), "(the registration's D1 is T1 above, GF against GDEG; its D2 is T2, GF against GSHUF)");
    return out;
}
