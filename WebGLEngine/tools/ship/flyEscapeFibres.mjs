// WebGLEngine/tools/ship/flyEscapeFibres.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 8, AS ARITHMETIC (registered in brain/FLY_ESCAPE_FIBRES_WIP.md before this file existed): ARE THE GIANT FIBERS' OWN INPUTS ENOUGH? Round 7's K3 -- a shuffle that keeps only
// the 42 real connections onto the two Giant Fibers (GGF) against a free shuffle (GSHUF) -- missed the line at p 0.013 on 32 draws an arm. This is that one test on 128 NEW draws an arm (81 to 208),
// the number fixed and its reason said before the run. The two arms are round 7's own objects (tools/ship/flyEscapeSplit.mjs ARMS_OF), so their flies are built by round 7's code.
// It is tools/ship/flyEscape.mjs's makeEscapeRound() with those arms and draws. The registration's F1 (GGF against GSHUF) is that reading's T1, with round 7's K3's words; this file adds -- described,
// given no word -- how many of an arm's trainings FAIL (a score below FAIL_BELOW) and the share of the 128 x 128 pairs in which the GGF fly has the higher score (a tie counts a half).
// The command is tools/ship/takeFlyEscapeFibres.mjs.
"use strict";
import { makeEscapeRound } from "./flyEscape.mjs";
import { ROUND3 } from "./flyEscapeFresh.mjs";
import * as V7 from "./flyEscapeSplit.mjs";

export const FAIL_BELOW = V7.FAIL_BELOW, DRAWS = Object.freeze(Array.from({ length: 128 }, (_, k) => 81 + k));
export const ARMS_OF = Object.freeze({ GGF: V7.ARMS_OF.GGF, GSHUF: V7.ARMS_OF.GSHUF });
const T0 = Object.freeze(["A FLY WHOSE GIANT FIBERS KEEP THEIR REAL INPUTS, STARTED AT THE REFLEX, ESCAPES BETTER THAN THE REFLEX", "A FLY WHOSE GIANT FIBERS KEEP THEIR REAL INPUTS, STARTED AT THE REFLEX, ESCAPES WORSE THAN THE REFLEX", "A FLY WHOSE GIANT FIBERS KEEP THEIR REAL INPUTS, STARTED AT THE REFLEX, CANNOT BE TOLD APART FROM THE REFLEX"]);
export const ROUND8 = Object.freeze({ ...ROUND3, arms: ARMS_OF, lead: "GGF", versus: Object.freeze(["GSHUF"]), seeds: DRAWS, results: "brain/flyEscapeFibresRound.jsonl", words: Object.freeze({ T0, T1: V7.WORDS.K3 }) });
const base = makeEscapeRound(ROUND8);
export const { LEAD, VERSUS, MEMORY, START, REPORT, RECIPE, SEEDS, ARMS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords } = base;
export const WORDS = Object.freeze({ T0: base.WORDS.T0, T3: base.WORDS.T3, F1: base.WORDS.T1 });

/** makeEscapeRound's reading with the registration's name F1 (its T1), `failed: { arm: how many of its trainings scored below FAIL_BELOW }` and `share` (see the header); with a failed check no test is made and there is no share. */
export function reading(lines) {
    const R = base.reading(lines), draws = lines.filter((r) => r && r.kind === "draw"), sc = (a) => draws.filter((r) => r.arm === a).map((r) => r.score);
    const failed = Object.fromEntries(ARMS.map((a) => [a, sc(a).filter((v) => v < FAIL_BELOW).length]));
    if (R.checks.length) return { ...R, F1: null, share: null, failed };
    return { ...R, F1: R.T1, share: (R.T1.sumA - R.T1.n * (R.T1.n + 1) / 2) / (R.T1.n * R.T1.m), failed };
}
/** The reading's lines: makeEscapeRound's, then the share of pairs, the failures, and which of the registration's names the reading's T1 has. */
export function readingLines(R) {
    const out = base.readingLines(R);
    if (R.share !== null && R.share !== undefined) out.push("", `a GGF fly has the higher score in ${(R.share * 100).toFixed(1)} of 100 pairs with a GSHUF fly (a tie counts a half; 50 is no difference)`);
    out.push("", `trainings that FAILED (a score below ${FAIL_BELOW}), of ${SEEDS.length} an arm: ` + ARMS.map((a) => `${a} ${R.failed[a]}`).join("; "), "(the registration's F1 is T1 above, GGF against GSHUF)");
    return out;
}
