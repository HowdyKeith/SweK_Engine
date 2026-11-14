// WebGLEngine/tools/ship/voxelHomeLong.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE VOXEL HOME, ROUND 3, AS ARITHMETIC (registered in brain/VOXEL_HOME_LONG_WIP.md before this file existed): round 2's builders (tools/ship/voxelHomeDrawn.mjs: the column drawn from 36 numbers)
// trained for 1,000 iterations where round 2 trained them for 150. It is tools/ship/voxelHome.mjs's makeRound() with round 2's cfg and three keys more: the iterations, the trainer's history in every
// record, and round 2's results file as `before` -- T3 reads this round's 16 FLY builders against that file's. The command is tools/ship/takeVoxelHomeLong.mjs.
"use strict";
import { makeRound } from "./voxelHome.mjs";
import { ROUND2 } from "./voxelHomeDrawn.mjs";

export const ROUND3 = Object.freeze({ ...ROUND2, iters: 1000, history: true, before: ROUND2.results, results: "brain/voxelHomeLongRound.jsonl" });
export const { BEFORE, RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, RANDOM_SEEDS, ALPHA, RESULTS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords, WORDS, reading, readingLines } = makeRound(ROUND3);
