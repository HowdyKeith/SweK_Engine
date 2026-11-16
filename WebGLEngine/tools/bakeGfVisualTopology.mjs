// WebGLEngine/tools/bakeGfVisualTopology.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/bakeGfVisualTopology.mjs [--write]     (without --write it prints whether brain/gfVisualTopology.mjs is what it would write)
//
// BAKES brain/gfVisualTopology.mjs FROM vendor/male-cns/giant-fiber-visual-circuit.json (another chat's data file: the two Giant Fibers and each one's 10 strongest LC4 and 10 strongest LPLC2 cells,
// from Neuprint male-cns:v1.0; see brain/FLY_ESCAPE_VISION_WIP.md section 1). The cells are put in a fixed order -- LC4 right, LC4 left, LPLC2 right, LPLC2 left, the right Giant Fiber, the left -- each
// group by bodyId ascending, and every connection of the file becomes [to, from] over that order with its synapse count beside it. Nothing is chosen here: the file's 42 cells and 369 connections, all.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), SRC = "vendor/male-cns/giant-fiber-visual-circuit.json", OUT = "brain/gfVisualTopology.mjs";
export const GROUPS = Object.freeze([["LC4", "R"], ["LC4", "L"], ["LPLC2", "R"], ["LPLC2", "L"], ["DNp01", "R"], ["DNp01", "L"]]);

/** The module's text for the bytes of the data file. */
export function bake(bytes) {
    const d = JSON.parse(bytes.toString("utf8")), cells = GROUPS.flatMap(([type, side]) => d.neurons.filter((n) => n.type === type && n.side === side).sort((a, b) => a.bodyId - b.bodyId));
    if (cells.length !== d.neurons.length) throw new Error(`bakeGfVisualTopology: ${d.neurons.length - cells.length} cells of the file are of no group (LC4, LPLC2, DNp01; right, left)`);
    const at = new Map(cells.map((n, i) => [n.bodyId, i])), edges = d.edges.map(([from, to, w]) => { if (!at.has(from) || !at.has(to)) throw new Error(`bakeGfVisualTopology: the connection ${from} -> ${to} names a cell the file does not hold`); return [at.get(to), at.get(from), w]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const idx = (type) => cells.map((n, i) => (n.type === type ? i : -1)).filter((i) => i >= 0), J = JSON.stringify;
    return `// WebGLEngine/brain/gfVisualTopology.mjs
//
// BAKED by tools/bakeGfVisualTopology.mjs from ${SRC} -- do not hand-edit.
// Source: Janelia FlyEM's male-cns connectome (dataset "${d.dataset}"), the two Giant Fibers (DNp01) and, for each, its 10 strongest LC4 and 10 strongest LPLC2 cells, with every connection among
// those 42 cells. The data file is another chat's (origin/claude/inspiring-mayer-9mdcut); what it is and is not is in brain/FLY_ESCAPE_VISION_WIP.md section 1.
//
// NEURON_ORDER[i] is the Neuprint bodyId of cell i: LC4 right, LC4 left, LPLC2 right, LPLC2 left, the right Giant Fiber, the left. EDGES are [toIdx, fromIdx] pairs into that order, sorted, and
// SYNAPSES[k] is the synapse count of EDGES[k]. LC4, LPLC2 and GF are the cells' indices by type.
"use strict";

export const DATASET = ${J(d.dataset)};
export const SOURCE_SHA256 = ${J(createHash("sha256").update(bytes).digest("hex"))};
export const NEURON_ORDER = Object.freeze(${J(cells.map((n) => n.bodyId))});
export const NEURON_TYPES = Object.freeze(${J(cells.map((n) => n.type))});
export const NEURON_SIDES = Object.freeze(${J(cells.map((n) => n.side))});
export const LC4 = Object.freeze(${J(idx("LC4"))});
export const LPLC2 = Object.freeze(${J(idx("LPLC2"))});
export const GF = Object.freeze(${J(idx("DNp01"))});
export const EDGES = Object.freeze(${J(edges.map((e) => [e[0], e[1]]))}.map((e) => Object.freeze(e)));
export const SYNAPSES = Object.freeze(${J(edges.map((e) => e[2]))});
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--write")) { console.error("usage: node tools/bakeGfVisualTopology.mjs [--write]"); process.exitCode = 2; }
    else {
        const text = bake(fs.readFileSync(path.join(ENG, SRC))), out = path.join(ENG, OUT), have = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
        if (args[0] === "--write") { fs.writeFileSync(out, text); console.log(`wrote ${OUT}`); }
        else { console.log(have === text ? `${OUT} is what this would write` : `${OUT} is NOT what this would write (run with --write)`); process.exitCode = have === text ? 0 : 1; }
    }
}
