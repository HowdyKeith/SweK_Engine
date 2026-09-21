// WebGLEngine/tools/bakeConnectomeTopology.mjs
//
// Run: node tools/bakeConnectomeTopology.mjs --in <vendor/male-cns/*.json> --out <brain/*Topology.mjs>
//      --circuit-name "<label used in the header comment>" [--include-types TYPE1,TYPE2] [--write]
//
// GENERIC version of the logic tools/bakeGfcTopology.mjs pioneered for the Giant Fiber Circuit: extracts a
// vendored male-cns circuit's own connectivity graph into a small, synchronous, environment-agnostic brain/
// module (no fs/fetch at runtime, identical in Node and a browser) that a policy imports to constrain a
// masked-recurrent hidden layer to REAL biological connectivity rather than an invented one. See
// vendor/male-cns/PROVENANCE.md for each circuit's own citation; this tool only reshapes vendored data.
//
// tools/bakeGfcTopology.mjs is left as-is (already gated by brain/gunnerPolicy-selfcheck.mjs's section 1b,
// which re-derives brain/gfcTopology.mjs from the vendored JSON directly -- not by invoking that tool as a
// subprocess, so nothing here risks it). This tool is the generalized path for every circuit after the
// first; a second near-duplicate per-circuit tool was rejected in favor of this one, parameterized.
//
// --include-types restricts which vendored neurons become hidden units at all -- e.g. a circuit's raw fetch
// may include a related-but-distinct subtype (male-cns's EPG fetch also pulled 4 EPGt tangential neurons at
// a separate PB position) that a caller may want excluded from a clean recurrent-ring story. Edges where
// EITHER endpoint falls outside the included set are dropped, same as edges to a bodyId outside the fetch
// entirely (both cases mean "this hidden layer doesn't have a slot for that neuron").
//
// NEURON_ORDER fixes the hidden-unit index <-> real bodyId mapping (index i is always the i'th included
// neuron, in vendored-file order) so a hidden unit's identity is traceable back to a real, citable neuron.
// EDGES are [toIdx, fromIdx] pairs -- target first, source second -- matching brain/mlp.js's own
// W[o*nIn+k] convention (the target/output neuron's activation is a weighted sum over its SOURCE inputs),
// which happens to be exactly the direction a synapse's postsynaptic/presynaptic roles already read in.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argVal(flag) {
    const i = process.argv.indexOf(flag);
    return i === -1 ? null : process.argv[i + 1];
}

const inArg = argVal("--in"), outArg = argVal("--out"), circuitName = argVal("--circuit-name") || "circuit";
const includeTypesArg = argVal("--include-types");
if (!inArg || !outArg) {
    console.error("bakeConnectomeTopology: --in <vendored json> and --out <brain/*Topology.mjs> are required");
    process.exit(1);
}
const IN_PATH = path.resolve(ROOT, inArg);
const OUT_PATH = path.resolve(ROOT, outArg);
const includeTypes = includeTypesArg ? new Set(includeTypesArg.split(",").map((s) => s.trim())) : null;

const data = JSON.parse(fs.readFileSync(IN_PATH, "utf8"));
const neurons = includeTypes ? data.neurons.filter((n) => includeTypes.has(n.type)) : data.neurons;
if (neurons.length === 0) throw new Error(`bakeConnectomeTopology: --include-types ${includeTypesArg} matched no neurons in ${inArg}`);
const indexOf = new Map(neurons.map((n, i) => [n.bodyId, i]));

// Two things this bake deliberately does NOT re-derive, mirroring tools/bakeGfcTopology.mjs's own header:
// (1) the from/to direction is trusted as-is from the vendored file, which trusts it from the raw Neuprint
//     fetch's own [from, to] pair (Neuprint's :ConnectsTo semantics, per PROVENANCE.md) -- an untestable
//     trust boundary, not a defect.
// (2) each edge's real Neuprint synapse .weight (aggregated connection strength) is thrown away here --
//     only which pairs are wired survives into EDGES, not how strongly. A policy's own ES trains its own
//     weight for each real edge on top of the real topology, so a fixed biological strength would only
//     fight the search, not inform it. What is real here is the WIRING, not the weights.
const edgeSet = new Set();
const edges = [];
let droppedOutsideInclude = 0;
for (const [from, to] of data.edges) {
    const fromIdx = indexOf.get(from), toIdx = indexOf.get(to);
    if (fromIdx === undefined || toIdx === undefined) { droppedOutsideInclude++; continue; }
    if (fromIdx === toIdx) throw new Error(`bakeConnectomeTopology: edge ${from}->${to} is a self-loop -- the recurrent core's identity term already covers self-persistence, and this bake has never seen one in the real data, so treat it as a surprise, not a case to silently absorb`);
    const key = toIdx * neurons.length + fromIdx;
    if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([toIdx, fromIdx]); }
}

const body = `// WebGLEngine/${path.relative(ROOT, OUT_PATH).replace(/\\/g, "/")}
//
// BAKED by tools/bakeConnectomeTopology.mjs from ${path.relative(ROOT, IN_PATH).replace(/\\/g, "/")} -- do not hand-edit.
// Source: Janelia FlyEM's male-cns connectome (dataset ${JSON.stringify(data.dataset)}), ${circuitName}.
// Full citation and fetch method: vendor/male-cns/PROVENANCE.md.
//
// NEURON_ORDER[i] is the real Neuprint bodyId of hidden unit i in this circuit's masked-recurrent core -- a
// hidden unit's identity is a real, citable neuron, not an anonymous slot. EDGES are [toIdx, fromIdx] pairs
// (target index first, source index second) into NEURON_ORDER: a consuming policy's recurrent weight vector
// has exactly one trainable entry per edge here, in this order, and every other (row, col) of the expanded
// ${neurons.length} x ${neurons.length} recurrent matrix is permanently zero.
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
    console.log(`[bakeConnectomeTopology] wrote ${path.relative(ROOT, OUT_PATH)}: ${neurons.length} neurons, ${edges.length} edges (${droppedOutsideInclude} raw edges dropped for referencing a neuron outside --include-types)`);
} else {
    console.log(`[bakeConnectomeTopology] dry run: ${neurons.length} neurons, ${edges.length} edges, ${droppedOutsideInclude} dropped (pass --write to write ${path.relative(ROOT, OUT_PATH)})`);
}
