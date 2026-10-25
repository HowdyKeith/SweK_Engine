// WebGLEngine/tools/flyCxLib.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/flyCx.mjs; both halves are held by tools/flyCx-selfcheck.mjs)
//
// THE PURE HALF OF tools/flyCx.mjs: cut the fruit fly's HEADING LOOP out of the hemibrain connectome's open adjacency export. The central complex keeps a heading as a bump of activity on a ring of cells (the compass cells, E-PG), moves the bump
// when the animal turns (P-EN cells, driven by turning), and holds it steady (Delta7 cells, P-EG cells). `traced-neurons.csv` lists every traced neuron of the hemibrain v1.2 volume with its type and instance name; `traced-total-connections.csv`
// lists every pair with the total number of synapses between them. This file picks the cells of five types and the pairs among them with at least `minWeight` synapses (default 3, the usual floor in the central-complex papers; fixed, not tuned).
// SIGNS ARE NOT IN THE EXPORT. They are assigned BY CELL TYPE from the central-complex literature, as the author remembers it, and the output says so: E-PG, P-EN and P-EG excitatory (cholinergic), Delta7 inhibitory (glutamatergic, acting as
// inhibition). THEY ARE TO BE CHECKED AGAINST THE PAPERS BEFORE THE FILE IS TRUSTED. The circuit is in the shape brain/pilotSubCircuit.mjs takes: { neurons: [{ id, cls, nt, layer, side, instance }], edges: [[from, to, n, sign]], io }, with the
// CELL TYPE in the place of the layer (so that the type-block control keeps which type feeds which) and `io` naming the input cells (E-PG and P-EN, where heading and turning arrive in the fly) and the output cells (E-PG and P-EG).
// Pure functions: no file, no clock, no Math.random. See tools/flyCx-selfcheck.mjs.
"use strict";

/** The five cell types, in the order that gives them their `layer` number, with the transmitter the literature gives them. */
export const CELL_TYPES = Object.freeze([
    Object.freeze({ type: "EPG", cls: "EPG", nt: "Exc" }), Object.freeze({ type: "PEN_a(PEN1)", cls: "PEN_a", nt: "Exc" }), Object.freeze({ type: "PEN_b(PEN2)", cls: "PEN_b", nt: "Exc" }),
    Object.freeze({ type: "Delta7", cls: "Delta7", nt: "Inh" }), Object.freeze({ type: "PEG", cls: "PEG", nt: "Exc" }),
]);
export const INPUT_CLASSES = Object.freeze(["EPG", "PEN_a", "PEN_b"]), OUTPUT_CLASSES = Object.freeze(["EPG", "PEG"]);
export const DEFAULTS = Object.freeze({ minWeight: 3 });
export const SIGN_SOURCE = "assigned by cell type from the central-complex literature as remembered by the author, NOT read from the export (which has no signs): E-PG, P-EN and P-EG excitatory (cholinergic), Delta7 inhibitory (glutamatergic, acting as inhibition); to be checked against the papers";
export const REQUIRED_NEURON_COLUMNS = Object.freeze(["bodyId", "type", "instance"]);

const BODY = /^\d+$/;
/** The hemisphere a cell's instance name ends in (`_L`, `_R`, `_L4`, `_R8`, `_L1L9R8_R` ...): "L", "R", or null for a name that says neither. */
export function sideOfInstance(instance) {
    const m = /_([LR])\d*$/.exec(String(instance));
    return m ? m[1] : null;
}
/** The cells of the five types out of the rows of traced-neurons.csv ({ bodyId, type, instance } as text): { cells: [...], skipped } in ascending body id (numeric), each { id, cls, nt, layer, side, instance }. A row whose id is not a whole number is skipped and counted. */
export function neuronsOf(rows) {
    const byType = new Map(CELL_TYPES.map((t, k) => [t.type, { ...t, layer: k }])), cells = []; let skipped = 0;
    for (const r of rows) {
        const t = byType.get(String(r.type ?? "").trim());
        if (!t) continue;
        const id = String(r.bodyId ?? "").trim();
        if (!BODY.test(id)) { skipped++; continue; }
        cells.push({ id: Number(id), cls: t.cls, nt: t.nt, layer: t.layer, side: sideOfInstance(r.instance), instance: String(r.instance ?? "") });
    }
    cells.sort((a, b) => a.id - b.id);
    for (let i = 1; i < cells.length; i++) if (cells[i].id === cells[i - 1].id) throw new Error(`flyCx.neuronsOf: body id ${cells[i].id} is listed twice`);
    return { cells, skipped };
}
/**
 * The edges among `cells` out of the connection rows ({ pre, post, weight } as numbers or text; an iterable, so that a file of 1.5 million rows is never held as objects): every ordered pair of two chosen cells with weight at least `minWeight`,
 * as [from index, to index, weight, sign of the source's transmitter], sorted by (from, to). A self-loop is skipped and counted; a pair below the floor is counted with its synapses; a repeated pair is refused (the export has one row a pair).
 */
export function edgesAmong(rows, cells, minWeight = DEFAULTS.minWeight) {
    if (!(Number.isInteger(minWeight) && minWeight >= 1)) throw new Error(`flyCx.edgesAmong: minWeight must be a whole number of 1 or more, got ${minWeight}`);
    const index = new Map(cells.map((c, k) => [c.id, k])), seen = new Set(), edges = [], stats = { rows: 0, between: 0, selfLoops: 0, belowFloor: 0, belowFloorSynapses: 0 };
    for (const r of rows) {
        stats.rows++;
        const pre = Number(r.pre), post = Number(r.post), w = Number(r.weight);
        if (!index.has(pre) || !index.has(post)) continue;
        if (!(Number.isInteger(w) && w >= 1)) throw new Error(`flyCx.edgesAmong: the pair ${pre} > ${post} has weight ${r.weight}, which is not a whole number of 1 or more`);
        if (pre === post) { stats.selfLoops++; continue; }
        const key = pre + ">" + post;
        if (seen.has(key)) throw new Error(`flyCx.edgesAmong: the pair ${key} is listed twice`);
        seen.add(key); stats.between++;
        if (w < minWeight) { stats.belowFloor++; stats.belowFloorSynapses += w; continue; }
        edges.push([index.get(pre), index.get(post), w, cells[index.get(pre)].nt === "Exc" ? 1 : -1]);
    }
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return { edges, stats };
}
/** The input and output cells by index: the cells whose class is in INPUT_CLASSES / OUTPUT_CLASSES. */
export function ioOf(cells) {
    const pick = (names) => cells.map((c, k) => (names.includes(c.cls) ? k : -1)).filter((k) => k >= 0);
    return { inputs: pick(INPUT_CLASSES), outputs: pick(OUTPUT_CLASSES) };
}
/** Everything: { neurons, edges, io, selection } for the neuron rows and the connection rows. Refuses a table with none of the five types. */
export function circuitOf(neuronRows, connectionRows, { minWeight = DEFAULTS.minWeight } = {}) {
    const { cells, skipped } = neuronsOf(neuronRows);
    if (!cells.length) throw new Error("flyCx.circuitOf: no neuron of the five types (" + CELL_TYPES.map((t) => t.type).join(", ") + ") in the table");
    const missing = CELL_TYPES.filter((t) => !cells.some((c) => c.cls === t.cls)).map((t) => t.type);
    if (missing.length) throw new Error(`flyCx.circuitOf: no neuron of type ${missing.join(", ")} in the table`);
    const { edges, stats } = edgesAmong(connectionRows, cells, minWeight), count = (f) => cells.reduce((m, c) => { const k = f(c); m[k] = (m[k] || 0) + 1; return m; }, {});
    const pairs = {}; for (const [a, b, n] of edges) { const k = cells[a].cls + ">" + cells[b].cls; pairs[k] = pairs[k] || { edges: 0, synapses: 0 }; pairs[k].edges++; pairs[k].synapses += n; }
    return {
        neurons: cells, edges, io: ioOf(cells),
        selection: { rule: "headingLoop", minWeight, neurons: cells.length, edges: edges.length, synapses: edges.reduce((s, e) => s + e[2], 0), excitatoryEdges: edges.filter((e) => e[3] > 0).length, inhibitoryEdges: edges.filter((e) => e[3] < 0).length,
            byClass: count((c) => c.cls), bySide: count((c) => c.side || "none"), byClassPair: pairs, skippedNeuronRows: skipped, connectionRows: stats.rows, pairsBetweenChosenCells: stats.between, selfLoops: stats.selfLoops, belowFloorPairs: stats.belowFloor, belowFloorSynapses: stats.belowFloorSynapses },
    };
}
