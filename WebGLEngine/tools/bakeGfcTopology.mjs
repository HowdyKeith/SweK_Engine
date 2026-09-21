// WebGLEngine/tools/bakeGfcTopology.mjs
//
// Run: node tools/bakeGfcTopology.mjs [--write]
//
// Extracts the Giant Fiber Circuit's own connectivity graph (34 neurons, 313 directed synaptic edges) out of
// vendor/male-cns/giant-fiber-circuit.json and bakes it into brain/gfcTopology.mjs -- a small, synchronous,
// environment-agnostic module (no fs/fetch at runtime, works identically in Node and a browser) that
// brain/gunnerPolicy.mjs imports to constrain its masked-recurrent hidden layer to a REAL biological
// connectivity pattern rather than an invented one. See vendor/male-cns/PROVENANCE.md for the data's own
// citation; this file only reshapes it for brain/'s use.
//
// NEURON_ORDER fixes the hidden-unit index <-> real bodyId mapping (index i is always data.neurons[i]'s
// neuron) so a hidden unit's identity is traceable back to a real, citable neuron rather than an anonymous
// slot. EDGES are [toIdx, fromIdx] pairs -- target first, source second -- matching brain/mlp.js's own
// W[o*nIn+k] convention (the target/output neuron's activation is a weighted sum over its SOURCE inputs),
// which happens to be exactly the direction a synapse's postsynaptic/presynaptic roles already read in.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IN_PATH = path.join(ROOT, "vendor", "male-cns", "giant-fiber-circuit.json");
const OUT_PATH = path.join(ROOT, "brain", "gfcTopology.mjs");

const data = JSON.parse(fs.readFileSync(IN_PATH, "utf8"));
const neurons = data.neurons;
const indexOf = new Map(neurons.map((n, i) => [n.bodyId, i]));

// Two things this bake deliberately does NOT re-derive, both worth naming rather than leaving a reader to wonder:
// (1) the from/to direction is trusted as-is from vendor/male-cns/giant-fiber-circuit.json, which trusts it from
//     the raw Neuprint fetch's own [from, to] pair (Neuprint's :ConnectsTo semantics, per PROVENANCE.md) -- that
//     fetch ran on the maintainer's own machine and its script isn't vendored, so a from/to swap upstream would
//     transpose every edge in this bake and nothing in this repo would catch it. An untestable trust boundary,
//     not a defect.
// (2) each edge's real Neuprint synapse .weight (aggregated connection strength) is fetched and vendored but
//     THROWN AWAY here -- only which pairs are wired survives into EDGES, not how strongly. Deliberate: the ES
//     trains its own weight for each real edge on top of the real topology, so a fixed biological strength would
//     only fight the search, not inform it. What is real here is the WIRING, not the weights.
const edgeSet = new Set();
const edges = [];
for (const [from, to] of data.edges) {
    const fromIdx = indexOf.get(from), toIdx = indexOf.get(to);
    if (fromIdx === undefined || toIdx === undefined) throw new Error(`bakeGfcTopology: edge ${from}->${to} references a bodyId outside the 34-neuron set`);
    if (fromIdx === toIdx) throw new Error(`bakeGfcTopology: edge ${from}->${to} is a self-loop -- the recurrent core's identity term already covers self-persistence, and this bake has never seen one in the real data, so treat it as a surprise, not a case to silently absorb`);
    const key = toIdx * neurons.length + fromIdx;
    if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([toIdx, fromIdx]); }
}

const body = `// WebGLEngine/brain/gfcTopology.mjs
//
// BAKED by tools/bakeGfcTopology.mjs from vendor/male-cns/giant-fiber-circuit.json -- do not hand-edit.
// Source: Janelia FlyEM's male-cns connectome (dataset ${JSON.stringify(data.dataset)}), the Giant Fiber
// Circuit (cell types GFC1-GFC4). Full citation and fetch method: vendor/male-cns/PROVENANCE.md.
//
// NEURON_ORDER[i] is the real Neuprint bodyId of hidden unit i in brain/gunnerPolicy.mjs's masked-recurrent
// core -- a hidden unit's identity is a real, citable neuron, not an anonymous slot. EDGES are [toIdx,
// fromIdx] pairs (target index first, source index second) into NEURON_ORDER: brain/gunnerPolicy.mjs's
// recurrent weight vector has exactly one trainable entry per edge here, in this order, and every other
// (row, col) of the expanded ${neurons.length} x ${neurons.length} recurrent matrix is permanently zero.
"use strict";

export const DATASET = ${JSON.stringify(data.dataset)};
export const NEURON_ORDER = Object.freeze([${neurons.map((n) => n.bodyId).join(", ")}]);
export const NEURON_TYPES = Object.freeze([${neurons.map((n) => JSON.stringify(n.type)).join(", ")}]);
export const NEURON_INSTANCES = Object.freeze([${neurons.map((n) => JSON.stringify(n.instance)).join(", ")}]);
export const EDGES = Object.freeze([
    ${edges.map(([toIdx, fromIdx]) => `[${toIdx}, ${fromIdx}]`).join(", ")}
]);
`;

if (process.argv.includes("--write")) {
    fs.writeFileSync(OUT_PATH, body);
    console.log(`[bakeGfcTopology] wrote ${path.relative(ROOT, OUT_PATH)}: ${neurons.length} neurons, ${edges.length} edges`);
} else {
    console.log(`[bakeGfcTopology] dry run: ${neurons.length} neurons, ${edges.length} edges (pass --write to write ${path.relative(ROOT, OUT_PATH)})`);
}
