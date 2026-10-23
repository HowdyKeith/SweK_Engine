// WebGLEngine/tools/fishCircuit.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/fishCircuit.mjs --dir <the unzipped TEN_analysis folder> [--k 34] [--min-volume 5000000] [--out vendor/zebrafish/fish1-ten-core.json] [--write]
//
// A REAL ZEBRAFISH CIRCUIT FOR THE TREE, FROM DATA THAT IS OPEN: the Fish1 larval-zebrafish EM connectome (Petkova, Januszewski et al., 2025) keeps its 30-million-synapse tables behind a CAVE server that needs a token, but the
// paper's own analysis packages sit in the open bucket gs://fish1-release/paper_data, and the "TEN analysis" package (TEN_analysis.zip) carries the synapse table of the 1,105 neurons the paper analysed: one row per synapse,
// `pre_neuron_id, bbx, bby, bbz, post_id` (the bounding box of the synapse, in voxels of 8 x 8 x 30 nm). This tool turns that table into a directed graph among those neurons and picks the circuit by ONE RULE that has no
// knob but its size:
//
//   NEURONS   the neurons that are the presynaptic side of at least one row (1,105 of them: the ones the package follows).
//   EDGES     a directed pair (pre -> post), both in that set and not the same neuron, WEIGHTED BY HOW MANY SYNAPSES it has, counting only a synapse whose bounding box is larger than `minVolume` nm^3 (the notebook's own
//             first non-zero threshold, 5,000,000 nm^3 = 8 bbx x 8 bby x 30 bbz): a smaller contact is the kind the paper's own sweep drops first.
//   THE CORE  the `k` neurons left after peeling: repeatedly remove the neuron with the least total synaptic weight (in + out, to the neurons still there), the smaller id first on a tie. The densest core, not a chosen one.
//   ORDER     ascending neuron id, so that the order is a function of the data and not of the file.
//
// WHAT THIS IS NOT, SAID PLAINLY: it is real wiring and it is NOT a circuit that anybody has shown to steer anything. The densest core of this set is mostly the fish's dorsal motor nucleus of the vagus (DMV) -- visceral motor
// neurons -- and the tool labels each neuron with the package's own lists (the four TEN classes, DMV, DMV inputs) and says "unlabelled" for the rest. It is the fish counterpart of the tree's use of the fly's Giant Fiber
// Circuit: a real connectome's wiring as the sparsity pattern of a recurrent core, so a result says what real wiring costs or buys over the PD laws, not that a fish can pilot a submarine. The Mauthner (escape) circuit,
// the fish's true analogue of the giant fiber, is in the CAVE tables, which this tool does not read. See vendor/zebrafish/PROVENANCE.md.
//
// The pure functions are exported and gated (tools/fishCircuit-selfcheck.mjs); the command only reads four CSV files and writes one JSON.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function command() {
    const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
    const dir = arg("--dir"); if (!dir) { console.error("fishCircuit: --dir <the unzipped TEN_analysis folder> is required"); process.exit(1); }
    const k = Number(arg("--k", DEFAULTS.k)), minVolume = Number(arg("--min-volume", DEFAULTS.minVolume)), out = path.resolve(ROOT, arg("--out", "vendor/zebrafish/fish1-ten-core.json"));
    const read = (n) => fs.readFileSync(path.join(dir, n), "utf8");
    const { rows, dropped } = synapseRows(parseCsv(read("synapse_sizes.csv"))), graph = buildGraph(rows, minVolume), lists = readLists(read("TEN_cats.csv"), read("DMVIDs.csv"), read("DMV_InputsIDs.csv"));
    const meta = {
        dataset: "fish1_v250915 (paper_data/TEN_analysis.zip of gs://fish1-release)", server: "https://storage.googleapis.com/fish1-release/paper_data/TEN_analysis.zip", fetchedAt: new Date().toISOString(),
        license: "open access under the Fish1 data policy (https://fish1-release.storage.googleapis.com/data_policy.html); no licence text is stated there, only that work using the data must cite the resource paper",
        citation: "Petkova, M. D., Januszewski, M., et al. (2025). A connectomic resource for neural cataloguing and circuit dissection of the larval zebrafish brain. bioRxiv. (Fish1 release, Janelia / Google Research / Harvard)",
        typePattern: `the ${k} neurons of the densest core of the TEN analysis set (peeled by total synaptic weight, synapses over ${minVolume} nm^3)`,
        selection: { rule: "peelCore", k, minVolume, neuronsInSet: graph.neurons.size, pairsInSet: graph.edges.size, rowsRead: rows.length, rowsDropped: dropped },
    };
    const c = circuitOf(graph, lists, meta, k);
    console.log(`[fishCircuit] ${graph.neurons.size} neurons, ${graph.edges.size} pairs over ${minVolume} nm^3; core ${c.neuronCount} neurons, ${c.edgeCount} edges, ${c.edges.reduce((a, e) => a + e[2], 0)} synapses; labels ${JSON.stringify(c.neurons.reduce((o, n) => (o[n.type] = (o[n.type] || 0) + 1, o), {}))}`);
    if (process.argv.includes("--write")) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(c) + "\n"); console.log("[fishCircuit] wrote " + path.relative(ROOT, out)); }
    else console.log("[fishCircuit] dry run (pass --write to write " + path.relative(ROOT, out) + ")");
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) command();
