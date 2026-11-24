// WebGLEngine/brain/pilotSubPlain.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/pilotSubPlain-selfcheck.mjs; the backlog entry is the "plain-net-shaped control trained on the 14 tank features" of the head-to-head round H2, brain/HEAD_TO_HEAD.md on claude/wizardly-einstein-wr30pd)
//
// THE PLAIN CONTROL OF THE 963-WEIGHT TANK NETWORKS: the same pilot as brain/pilotSubPolicy.mjs's -- the 14 features of the PD autopilot, a layer of relu units, the autopilot's laws written through the weights so that it STARTS as the autopilot, four controls clamped to [-1, 1] -- with NO WIRING at all.
// brain/pilotSubPolicy.mjs createSubPolicy() takes any circuit as a parameter and lets the circuit's edges be the only recurrent weights that exist; a circuit with no edges is a plain feed-forward net, so this file is one call: 50 hidden units, 14 x 50 + 50 + 0 + 50 x 4 + 4 = 954 weights, against the fly's Giant Fiber Circuit network's 963 (14 x 34 + 34 + 313 + 34 x 4 + 4)
// and the fish's 803: the weight count matched to within 1 percent, the wiring removed. It is the control for the question the head-to-head round asks of every brain on the tank's tasks: does it beat a net of its size that has no connectome in it? (The rung 4b plain nets, brain/pilotSubPlainNet.mjs, are the control for the fish
// VESTIBULAR pilot on its four tilt signals; this is the control for the 14-feature pilots.)
// WHAT IT IS NOT: trained. A champion is made by `node tools/ship/trainPilotSub.mjs --circuit plain14 --write` (tools/ship/trainSubPilot.mjs, the fly's and the fish's recipe, the same dives and the same audits) and lives in brain/pilotSubWeightsPlain14Wip.json. Pure: no I/O, no clock, no Math.random.
"use strict";
import { createSubPolicy } from "./pilotSubPolicy.mjs";

export const HIDDEN = 50;
/** A circuit with `hidden` neurons and no edge: { NEURON_ORDER, EDGES }, frozen. The hand weights need at least eight neurons (a relu pair for each of the four controls). */
export function plainTopology(hidden = HIDDEN) {
    if (!Number.isInteger(hidden) || hidden < 8 || hidden > 400) throw new Error(`pilotSubPlain.plainTopology: the hidden layer is a whole number of units from 8 to 400, got ${JSON.stringify(hidden)}`);
    return Object.freeze({ NEURON_ORDER: Object.freeze(Array.from({ length: hidden }, (_, i) => 8000 + i)), EDGES: Object.freeze([]) });
}
/** The plain pilot of `hidden` units: the contract of brain/pilotSubPolicy.mjs's createSubPolicy. */
export const plainPolicy = (hidden = HIDDEN, name = `a plain 14-${hidden}-4 relu net (no wiring)`) => createSubPolicy(plainTopology(hidden), name);
export const PLAIN14 = plainPolicy(HIDDEN);

export const reportLines = () => PLAIN14.reportLines();
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
