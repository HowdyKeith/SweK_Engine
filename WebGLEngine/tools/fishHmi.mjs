// WebGLEngine/tools/fishHmi.mjs -- UNNUMBERED. Run: node tools/fishHmi.mjs --xlsx <em_zfish1_dataframe.xlsx> [--somas <cave_somas_in_big_box.csv>] [--depth 2] [--midline-um 259.208] [--out vendor/zebrafish/fish1-hmi-spn.json] [--write]
//
// THE HINDBRAIN MOTION INTEGRATOR'S CIRCUIT TO THE SPINAL PROJECTION NEURONS, FROM DATA THAT IS OPEN: the Fish1 release (Petkova, Januszewski et al., 2025) keeps a second analysis package in its open bucket, HMI_analysis.zip, whose
// data/em_zfish1_dataframe.xlsx lists 999 cells by soma id with the synapses a person traced, their class, neurotransmitter and network level. tools/fishHmiLib.mjs documents the package and the one rule that cuts the circuit (the spinal projection neurons
// that steer TURNING and FORWARD swimming, the labelled cells that feed them, and the labelled cells that feed those, with signs from the neurotransmitter). This command reads the xlsx, prints what the rule selected and, with --write, writes the circuit
// JSON. --somas gives each neuron a side of the midline from its soma position (the package's own data/cave_somas_in_big_box.csv, soma voxels of 8 x 8 x 30 nm); the midline defaults to 259.208 um, the median of the 179,930 somas of the volume along the left-right axis.
// The pure functions are in tools/fishHmiLib.mjs and gated (tools/fishHmi-selfcheck.mjs). *** NO EXPORTS ON PURPOSE: a command-line entry point.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readXlsx, cellsOf, edgesOf, circuitOf, REQUIRED_COLUMNS, DEFAULTS } from "./fishHmiLib.mjs";
import { parseTable } from "./fishInputSideLib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function main(argv) {
    const known = new Set(["--xlsx", "--somas", "--depth", "--midline-um", "--out", "--write"]);
    for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--") && !known.has(argv[i])) { console.error(`fishHmi: unknown option ${argv[i]}`); return 2; }
    const arg = (f, d = null) => { const i = argv.indexOf(f); if (i === -1) return d; if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`${f} needs a value`); return argv[i + 1]; };
    let xlsx, depth, midlineUm, out, somasFile;
    try {
        xlsx = arg("--xlsx"); somasFile = arg("--somas");
        depth = Number(arg("--depth", DEFAULTS.depth)); midlineUm = Number(arg("--midline-um", DEFAULTS.midlineUm));
        out = path.resolve(ROOT, arg("--out", "vendor/zebrafish/fish1-hmi-spn.json"));
        if (!xlsx) throw new Error("--xlsx <em_zfish1_dataframe.xlsx> is required");
        if (!Number.isInteger(depth) || depth < 1) throw new Error(`--depth must be a whole number of 1 or more, got ${arg("--depth")}`);
        if (!Number.isFinite(midlineUm)) throw new Error(`--midline-um must be a number, got ${arg("--midline-um")}`);
    } catch (e) { console.error("fishHmi: " + e.message); return 2; }
    try {
        const bytes = fs.readFileSync(xlsx), sheet = readXlsx(bytes), missing = REQUIRED_COLUMNS.filter((c) => !sheet.header.includes(c));
        if (missing.length) throw new Error(`the sheet has no column ${missing.map((c) => JSON.stringify(c)).join(", ")} (it has ${sheet.header.join(", ")})`);
        const { cells, dropped } = cellsOf(sheet.rows), { edges, stats } = edgesOf(sheet.rows, cells);
        let somas = null, somaNote = "no soma positions: no sides";
        if (somasFile) {
            const t = parseTable(fs.readFileSync(somasFile, "utf8"));
            if (!t.length || !("id" in t[0]) || !("_x" in t[0]) || !("_y" in t[0]) || !("_z" in t[0])) throw new Error("the soma file has no id, _x, _y, _z columns");
            somas = new Map(t.map((r) => [String(r.id), [Number(r._x), Number(r._y), Number(r._z)]]));
            somaNote = `${somas.size} soma positions from ${path.basename(somasFile)}`;
        }
        const c = circuitOf(cells, edges, { depth, somas, midlineUm }), s = c.selection;
        console.log(`[fishHmi] ${sheet.rows.length} rows, ${cells.size} cells (${dropped} rows without a usable Cell ID); ${stats.tuples} synapse tuples: ${stats.identified} identified, ${stats.unidentified} to an unidentified partner, ${stats.malformed} malformed, ${stats.parseFailRows} unreadable lists; ${edges.size} distinct pairs`);
        console.log(`[fishHmi] circuit (depth ${depth}): ${s.neurons} neurons (${s.targets} spinal projection neurons, ${JSON.stringify(s.byLayer)} by layer), ${s.edges} edges (${s.excitatoryEdges} excitatory, ${s.inhibitoryEdges} inhibitory), ${s.synapses} synapses; ${s.leftOutPairsWithoutASign} pairs (${s.leftOutSynapsesWithoutASign} synapses) onto them from a cell with no label left out; sides: ${JSON.stringify(s.bySide)} (${somaNote})`);
        console.log(`[fishHmi] by class ${JSON.stringify(s.byClass)}; by SPN group ${JSON.stringify(s.byGroup)}`);
        const meta = {
            dataset: "fish1_v250915 (paper_data/HMI_analysis.zip of gs://fish1-release): data/em_zfish1_dataframe.xlsx", server: "https://storage.googleapis.com/fish1-release/paper_data/HMI_analysis.zip", sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
            license: "open access under the Fish1 data policy (https://fish1-release.storage.googleapis.com/data_policy.html); no licence text is stated there, only that work using the data must cite the resource paper; none is claimed here",
            citation: "Petkova, M. D., Januszewski, M., et al. (2025). A connectomic resource for neural cataloguing and circuit dissection of the larval zebrafish brain. bioRxiv. (Fish1 release, Janelia Research Campus / Google Research / Harvard.)",
            ids: "SOMA ids of the CAVE somas table (the dataframe's Cell ID), not root ids",
            typePattern: `the spinal projection neurons and the labelled cells that feed them, to depth ${depth} (sign from the neurotransmitter: VGluT2 +1, Gad1B -1)`, build: stats, selection: s,
        };
        const json = { meta, neurons: c.neurons, edges: c.edges };
        if (argv.includes("--write")) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(json) + "\n"); console.log("[fishHmi] wrote " + path.relative(ROOT, out)); }
        else console.log("[fishHmi] dry run (pass --write to write " + path.relative(ROOT, out) + ")");
        return 0;
    } catch (e) { console.error("fishHmi: " + e.message); return 1; }
}
process.exit(main(process.argv.slice(2)));
