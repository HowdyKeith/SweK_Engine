// WebGLEngine/tools/ship/flyEscapeReflex.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 2, AS ARITHMETIC (registered in brain/FLY_ESCAPE_REFLEX_WIP.md before this file existed): round 1's five arms STARTED AT THE REFLEX -- a fly is half the reflex's answer plus
// its network's output, the network's output layer at zero (brain/rl/reflexStart.mjs), so at iteration 0 every fly is the reflex -- and trained by a trainer that keeps the best RETURN
// (brain/rl/escapeEnv.mjs REPORT "return"). It is tools/ship/flyEscape.mjs's makeEscapeRound() with those two keys. T0 and T3 are sign tests against the reflex's own audit score.
// The command is tools/ship/takeFlyEscapeReflex.mjs.
"use strict";
import { makeEscapeRound } from "./flyEscape.mjs";

export const ROUND2 = Object.freeze({ results: "brain/flyEscapeReflexRound.jsonl", start: "reflex", report: "return" });
export const { START, REPORT, RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, WORDS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords, reading, readingLines } = makeEscapeRound(ROUND2);
