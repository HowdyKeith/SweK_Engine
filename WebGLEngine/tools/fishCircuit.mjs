// WebGLEngine/tools/fishCircuit.mjs -- UNNUMBERED (the version is chosen at ship time; the pure functions are tools/fishCircuitLib.mjs, which tools/fishCircuit-selfcheck.mjs holds)
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
// The pure functions are in tools/fishCircuitLib.mjs and gated (tools/fishCircuit-selfcheck.mjs); this command only reads four CSV files and writes one JSON. *** NO EXPORTS ON PURPOSE (tools/ship/trainPilotSub.mjs has none either): a command-line entry point and not a module.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, parseCsv, synapseRows, buildGraph, readLists, circuitOf } from "./fishCircuitLib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
command();
