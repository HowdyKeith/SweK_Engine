// WebGLEngine/tools/fishCircuitLib.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/fishCircuit.mjs, which holds the rule's documentation)
//
// THE PURE HALF OF tools/fishCircuit.mjs: parse the Fish1 TEN-analysis package's CSV text, build the directed graph, peel it to its densest core, label the neurons, and shape the circuit JSON. No I/O, no clock. The command reads four files and writes one;
// tools/fishCircuit-selfcheck.mjs holds both halves. (Split like tools/ship/trainSubPilot.mjs and trainPilotSub.mjs: a library with a caller other than its gate, and a command with no exports.)
"use strict";
export const DEFAULTS = Object.freeze({ k: 34, minVolume: 5000000 });
export const VOXEL_NM = Object.freeze([8, 8, 30]);

/** Rows of a CSV with a header, as arrays of strings (no quoting in the package's four files; a quote is refused rather than guessed at). */
export function parseCsv(text) {
    const lines = String(text).split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.some((l) => l.includes('"'))) throw new Error("fishCircuit.parseCsv: a quoted field -- this reader is for the package's plain files");
    return lines.map((l) => l.split(","));
}
/** The synapse table as [{ pre, post, volume }] (volume in nm^3 from the bounding box); a row with a missing field is dropped and counted. */
export function synapseRows(csvRows) {
    const head = csvRows[0], col = (n) => head.indexOf(n);
    const ip = col("pre_neuron_id"), iq = col("post_id"), ix = col("bbx"), iy = col("bby"), iz = col("bbz");
    if ([ip, iq, ix, iy, iz].some((i) => i < 0)) throw new Error("fishCircuit.synapseRows: the header has no pre_neuron_id, post_id, bbx, bby, bbz");
    const rows = []; let dropped = 0;
    for (const r of csvRows.slice(1)) {
        const v = [r[ip], r[iq], r[ix], r[iy], r[iz]];
        if (v.some((x) => x === undefined || x === "" || !Number.isFinite(Number(x)))) { dropped++; continue; }
        rows.push({ pre: Number(r[ip]), post: Number(r[iq]), volume: VOXEL_NM[0] * Number(r[ix]) * VOXEL_NM[1] * Number(r[iy]) * VOXEL_NM[2] * Number(r[iz]) });
    }
    return { rows, dropped };
}
/** The graph: the neurons (the presynaptic sides), and the edges among them as a Map "pre>post" -> synapse count, counting rows whose volume is over `minVolume`. */
export function buildGraph(rows, minVolume = DEFAULTS.minVolume) {
    const neurons = new Set(rows.map((r) => r.pre)), edges = new Map();
    for (const r of rows) {
        if (!neurons.has(r.post) || r.post === r.pre || !(r.volume > minVolume)) continue;
        const key = r.pre + ">" + r.post; edges.set(key, (edges.get(key) || 0) + 1);
    }
    return { neurons, edges };
}
/** The `k` neurons left after peeling the least-connected one at a time (total weight in + out, to those still there; the smaller id first on a tie). Only neurons with at least one edge take part. */
export function peelCore(edges, k) {
    const w = new Map(), adj = new Map();
    const add = (a, b, c) => { w.set(a, (w.get(a) || 0) + c); (adj.get(a) || adj.set(a, []).get(a)).push([b, c]); };
    for (const [key, c] of edges) { const [a, b] = key.split(">").map(Number); add(a, b, c); add(b, a, c); }
    const alive = new Set(w.keys());
    while (alive.size > k) {
        let pick = null;
        for (const n of alive) if (pick === null || w.get(n) < w.get(pick) || (w.get(n) === w.get(pick) && n < pick)) pick = n;
        alive.delete(pick);
        for (const [m, c] of adj.get(pick)) if (alive.has(m)) w.set(m, w.get(m) - c);
    }
    return [...alive].sort((a, b) => a - b);
}
/** The package's own labels for one neuron: its TEN class (I-IV), DMV or DMV input, else "unlabelled". */
export function labelOf(id, lists) {
    for (const [name, set] of lists.classes) if (set.has(id)) return "TEN-" + name;
    if (lists.dmv.has(id)) return "DMV";
    if (lists.dmvInput.has(id)) return "DMV-input";
    return "unlabelled";
}
/** The lists from the package's TEN_cats.csv (four columns, classI..classIV), DMVIDs.csv and DMV_InputsIDs.csv (one id a line). */
export function readLists(tenCatsCsv, dmvCsv, dmvInputCsv) {
    const cats = parseCsv(tenCatsCsv), classes = new Map();
    cats[0].forEach((h, j) => classes.set(h.replace(/^class/, ""), new Set(cats.slice(1).map((r) => Number(r[j])).filter((x) => Number.isFinite(x) && x !== 0))));
    const ids = (t) => new Set(String(t).split(/\r?\n/).map((l) => Number(l.trim())).filter((x) => Number.isFinite(x) && x !== 0));
    return { classes, dmv: ids(dmvCsv), dmvInput: ids(dmvInputCsv) };
}
/** The vendored circuit JSON (the shape of vendor/male-cns/giant-fiber-circuit.json: neurons[{ bodyId, type, instance }], edges[[from, to, weight]]) for the core of a graph. */
export function circuitOf(graph, lists, meta, k = DEFAULTS.k) {
    const core = peelCore(graph.edges, k), inCore = new Set(core);
    const neurons = core.map((id) => ({ bodyId: id, type: labelOf(id, lists), instance: "fish1:" + id }));
    const edges = [...graph.edges].map(([key, c]) => [...key.split(">").map(Number), c]).filter(([a, b]) => inCore.has(a) && inCore.has(b)).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return { ...meta, neuronCount: neurons.length, edgeCount: edges.length, neurons, edges };
}
