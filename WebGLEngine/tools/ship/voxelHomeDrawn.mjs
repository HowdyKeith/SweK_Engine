// WebGLEngine/tools/ship/voxelHomeDrawn.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE VOXEL HOME, ROUND 2, AS ARITHMETIC (registered in brain/VOXEL_HOME_DRAWN_WIP.md before this file existed): round 1's builders with the column DRAWN from 36 numbers (brain/rl/buildEnv.mjs's
// `choice: "drawn"`) where round 1's named it with 2. It is tools/ship/voxelHome.mjs's makeRound() with this round's cfg and nothing else: the recipe, the draws, the audit plans, the random builders
// (flown on the named environment: a random builder is the same builder either way), the checks, the three tests and their words are that file's. What differs is here: 36 outputs, so each arm's
// weight count, PLAIN's 38 units, and the results file; and its floors carry the lean to the unfinished columns, with no network. The command is tools/ship/takeVoxelHomeDrawn.mjs.
"use strict";
import { makeRound } from "./voxelHome.mjs";

export const ROUND2 = Object.freeze({ choice: "drawn", plainUnits: 38, weights: Object.freeze({ FLY: 2967, SHUF: 2967, PLAIN: 2962, FISH: 2807, MLP: 1540 }), results: "brain/voxelHomeDrawnRound.jsonl" });
export const { RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, RANDOM_SEEDS, ALPHA, RESULTS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords, WORDS, reading, readingLines } = makeRound(ROUND2);
