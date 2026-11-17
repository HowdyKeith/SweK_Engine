// WebGLEngine/tools/bakeCompassRingTopology.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/bakeCompassRingTopology.mjs [--write]     (without --write it prints whether brain/compassRingTopology.mjs is what it would write)
//
// BAKES brain/compassRingTopology.mjs FROM vendor/male-cns/ring-compass-circuit.json (tools/maleCnsCompassRing.py's file: the 282 ring neurons, the 50 compass neurons and every ring-to-compass
// connection of at least 5 synapses; vendor/male-cns/PROVENANCE.md). The ring neurons in bodyId order; the 46 CORE compass neurons (type EPG) in bodyId order -- the 4 EPGt are left out, and with
// them the connections onto them, which the module counts; every other connection becomes [ring index, compass index] with its synapse count beside it. Nothing else is chosen here.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), SRC = "vendor/male-cns/ring-compass-circuit.json", OUT = "brain/compassRingTopology.mjs";

/** The module's text for the bytes of the data file. */
export function bake(bytes) {
    const d = JSON.parse(bytes.toString("utf8")), byId = (a, b) => a.bodyId - b.bodyId;
    const ring = d.cells.filter((c) => c.group === "RING").sort(byId), epg = d.cells.filter((c) => c.group === "EPG" && c.type === "EPG").sort(byId), tangential = d.cells.filter((c) => c.group === "EPG" && c.type !== "EPG");
    if (ring.length + epg.length + tangential.length !== d.cells.length) throw new Error("bakeCompassRingTopology: a cell of the file is of no group");
    const ri = new Map(ring.map((c, i) => [c.bodyId, i])), ei = new Map(epg.map((c, i) => [c.bodyId, i])), cell = (i) => d.cells[i];
    const edges = [], dropped = [0, 0];
    for (const [p, q, w] of d.edges) { const a = cell(p), b = cell(q); if (!ri.has(a.bodyId)) throw new Error(`bakeCompassRingTopology: a connection from ${a.bodyId}, not a ring neuron`); if (!ei.has(b.bodyId)) { dropped[0]++; dropped[1] += w; continue; } edges.push([ri.get(a.bodyId), ei.get(b.bodyId), w]); }
    edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const J = JSON.stringify;
    return `// WebGLEngine/brain/compassRingTopology.mjs
//
// BAKED by tools/bakeCompassRingTopology.mjs from ${SRC} -- do not hand-edit.
// Source: Janelia FlyEM's male-cns connectome (dataset "${d.dataset}"), from its public release tables: the ring neurons (ER types) and the core compass neurons (EPG), and every connection of at
// least ${d.minSynapses} synapses from a ring neuron onto a compass neuron. The 4 tangential compass neurons (EPGt) and the connections onto them are left out (DROPPED_ONTO_EPGT).
//
// RING_ORDER[j] is the bodyId of ring neuron j and EPG_ORDER[k] of compass neuron k, each in bodyId order. EDGES are [ringIdx, epgIdx] pairs, sorted, and SYNAPSES[n] is the synapse count of EDGES[n].
// EPG_INSTANCES[k] is the compass neuron's instance, whose _L1.._L8 / _R1.._R8 is its glomerulus.
"use strict";

export const DATASET = ${J(d.dataset)};
export const SOURCE_SHA256 = ${J(createHash("sha256").update(bytes).digest("hex"))};
export const MIN_SYNAPSES = ${J(d.minSynapses)};
export const RING_ORDER = Object.freeze(${J(ring.map((c) => c.bodyId))});
export const RING_TYPES = Object.freeze(${J(ring.map((c) => c.type))});
export const EPG_ORDER = Object.freeze(${J(epg.map((c) => c.bodyId))});
export const EPG_INSTANCES = Object.freeze(${J(epg.map((c) => c.instance))});
export const EDGES = Object.freeze(${J(edges.map((e) => [e[0], e[1]]))}.map((e) => Object.freeze(e)));
export const SYNAPSES = Object.freeze(${J(edges.map((e) => e[2]))});
export const DROPPED_ONTO_EPGT = Object.freeze({ connections: ${dropped[0]}, synapses: ${dropped[1]} });
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--write")) { console.error("usage: node tools/bakeCompassRingTopology.mjs [--write]"); process.exitCode = 2; }
    else {
        const text = bake(fs.readFileSync(path.join(ENG, SRC))), out = path.join(ENG, OUT), have = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
        if (args[0] === "--write") { fs.writeFileSync(out, text); console.log(`wrote ${OUT}`); }
        else { console.log(have === text ? `${OUT} is what this would write` : `${OUT} is NOT what this would write (run with --write)`); process.exitCode = have === text ? 0 : 1; }
    }
}
