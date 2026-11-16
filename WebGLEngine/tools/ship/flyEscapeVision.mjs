// WebGLEngine/tools/ship/flyEscapeVision.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 5, AS ARITHMETIC (registered in brain/FLY_ESCAPE_VISION_WIP.md before this file existed): THE REAL ESCAPE CIRCUIT. Four arms, each a brain/rl/maskedCircuitPolicy.mjs net
// started at the reflex and trained as round 3 trains (tools/ship/flyEscapeFresh.mjs):
//   GF      the 42 real cells of brain/gfVisualTopology.mjs: the looming rate into each LC4 cell, the size into each LPLC2 cell, the 369 real connections, read from the two Giant Fibers
//   GSHUF   the same cells, inputs and read-out; 369 connections placed by the draw's own shuffle (shuffledEdges(42, 369, 7000 + s))
//   FREE    113 units, the looming rate and the size into every one, no connections, every unit read
//   GNONE   the 42 cells with GF's inputs and read-out and no connections: nothing reaches a Giant Fiber
// It is tools/ship/flyEscape.mjs's makeEscapeRound() with round 3's cfg and its own arms: T1 is GF against GSHUF, T2 GF against FREE, T0 the GF flies against the reflex, T3 all 64 against it.
// The command is tools/ship/takeFlyEscapeVision.mjs.
"use strict";
import { makeEscapeRound } from "./flyEscape.mjs";
import { ROUND3 } from "./flyEscapeFresh.mjs";
import { MaskedCircuitPolicy, maskedWeightCount } from "../../brain/rl/maskedCircuitPolicy.mjs";
import { shuffledEdges } from "../../brain/rl/paintCircuitPolicy.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";

export const SIZE = 1, LOOM = 2;                       // the observation's numbers: the mover's angular size, its looming rate (brain/rl/escapeEnv.mjs)
export const CELLS = T.NEURON_ORDER.length, FREE_UNITS = 113, SHUFFLE_SEED = 7000, SYNAPSE_GAIN = 0.01;   // a connection starts at SYNAPSE_GAIN x its synapse count (the registration's amendment of 2026-11-16)
/** The real cells' inputs: the looming rate into each LC4 cell (the velocity encoder), the size into each LPLC2 cell (the size encoder); nothing into a Giant Fiber. */
export const VISUAL_INPUTS = Object.freeze([...T.LC4.map((u) => Object.freeze([u, LOOM])), ...T.LPLC2.map((u) => Object.freeze([u, SIZE]))]);
const REAL = Object.freeze(T.EDGES.map((e) => [e[0], e[1]])), FREE_INPUTS = Object.freeze(Array.from({ length: FREE_UNITS }, (_, u) => [[u, LOOM], [u, SIZE]]).flat()), FREE_OUT = Object.freeze(Array.from({ length: FREE_UNITS }, (_, u) => u));
export const EDGE_START = Object.freeze(T.SYNAPSES.map((n) => n * SYNAPSE_GAIN));   // the real connections' starting weights, in EDGES' order; a shuffle keeps these 369 strengths and puts them in its own 369 places, in its places' order
const arm = (units, inputs, edgesOf, outputs, counts = false) => ({ weights: maskedWeightCount(units, inputs.length, edgesOf(1).length, outputs.length), under: outputs.length,
    circuit: (s) => ({ units, edges: edgesOf(s) }), make: (s) => ({ obsDim, seed } = {}) => new MaskedCircuitPolicy({ obsDim, units, inputs: [...inputs], edges: edgesOf(s), outputs: [...outputs], edgeStart: counts ? [...EDGE_START] : null, seed: seed ?? 1234 }) });
export const ARMS_OF = Object.freeze({
    GF: arm(CELLS, VISUAL_INPUTS, () => REAL, T.GF, true),
    GSHUF: arm(CELLS, VISUAL_INPUTS, (s) => shuffledEdges(CELLS, REAL.length, SHUFFLE_SEED + s), T.GF, true),
    FREE: arm(FREE_UNITS, FREE_INPUTS, () => [], FREE_OUT),
    GNONE: arm(CELLS, VISUAL_INPUTS, () => [], T.GF),
});
export const ROUND5 = Object.freeze({ ...ROUND3, arms: ARMS_OF, lead: "GF", versus: Object.freeze(["GSHUF", "FREE"]), results: "brain/flyEscapeVisionRound.jsonl", words: Object.freeze({
    T0: Object.freeze(["A FLY WITH THE REAL ESCAPE CIRCUIT, STARTED AT THE REFLEX, ESCAPES BETTER THAN THE REFLEX", "A FLY WITH THE REAL ESCAPE CIRCUIT, STARTED AT THE REFLEX, ESCAPES WORSE THAN THE REFLEX", "A FLY WITH THE REAL ESCAPE CIRCUIT, STARTED AT THE REFLEX, CANNOT BE TOLD APART FROM THE REFLEX"]),
    T1: Object.freeze(["THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES BETTER THAN A SHUFFLE OF IT", "THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES WORSE THAN A SHUFFLE OF IT", "THE REAL ESCAPE CIRCUIT'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT"]),
    T2: Object.freeze(["THE REAL ESCAPE CIRCUIT ESCAPES BETTER THAN A FREE NET ON THE SAME TWO NUMBERS", "THE REAL ESCAPE CIRCUIT ESCAPES WORSE THAN A FREE NET ON THE SAME TWO NUMBERS", "THE REAL ESCAPE CIRCUIT CANNOT BE TOLD APART FROM A FREE NET ON THE SAME TWO NUMBERS"]),
}) });
export const { LEAD, VERSUS, MEMORY, START, REPORT, RECIPE, SEEDS, ARMS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, WORDS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords, reading, readingLines } = makeEscapeRound(ROUND5);
