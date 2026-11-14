// WebGLEngine/tools/ship/voxelHomeLean.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE VOXEL HOME, ROUND 4, AS ARITHMETIC (registered in brain/VOXEL_HOME_LEAN_WIP.md before this file existed): round 2's builders (tools/ship/voxelHomeDrawn.mjs: the column drawn from 36 numbers)
// STARTED AT THE LEAN -- a builder is the lean plus its network, and the network's output layer starts at zero (brain/rl/leanStart.mjs), so at iteration 0 every builder is the lean. It is
// tools/ship/voxelHome.mjs's makeRound() with round 2's cfg and two keys more: `start: "lean"` and the trainer's history in every record. T0 and T3 are sign tests against the lean's own audit score.
// The command is tools/ship/takeVoxelHomeLean.mjs.
"use strict";
import { makeRound } from "./voxelHome.mjs";
import { ROUND2 } from "./voxelHomeDrawn.mjs";

export const ROUND4 = Object.freeze({ ...ROUND2, start: "lean", history: true, results: "brain/voxelHomeLeanRound.jsonl" });
export const { START, RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, RANDOM_SEEDS, ALPHA, RESULTS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords, WORDS, reading, readingLines } = makeRound(ROUND4);
