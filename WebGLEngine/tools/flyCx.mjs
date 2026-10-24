// WebGLEngine/tools/flyCx.mjs -- UNNUMBERED. Run: node tools/flyCx.mjs --dir <exported-traced-adjacencies-v1.2> [--min-weight 3] [--out vendor/hemibrain/hemibrain-cx-heading-loop.json] [--write]
//        or:  node tools/flyCx.mjs --neurons <traced-neurons.csv> --connections <traced-total-connections.csv> ...
//
// THE FRUIT FLY'S HEADING LOOP FROM DATA THAT IS OPEN: the hemibrain v1.2 release (Scheffer et al. 2020, Janelia FlyEM / Google) keeps its adjacency export in a public bucket (https://storage.googleapis.com/hemibrain/v1.2/exported-traced-adjacencies-v1.2.tar.gz,
// 45,872,577 bytes; no token). This command reads the two tables of it that matter, cuts the five cell types of the central complex's heading loop (E-PG, P-EN_a, P-EN_b, Delta7, P-EG) and the pairs among them with at least --min-weight synapses (default 3),
// prints what it found and, with --write, writes the circuit JSON. tools/flyCxLib.mjs documents the rule and the one thing it does NOT take from the data (the signs). The pure functions are gated (tools/flyCx-selfcheck.mjs).
// *** NO EXPORTS ON PURPOSE: a command-line entry point.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { circuitOf, CELL_TYPES, DEFAULTS, REQUIRED_NEURON_COLUMNS, SIGN_SOURCE } from "./flyCxLib.mjs";
import { parseTable } from "./fishInputSideLib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** The rows of traced-total-connections.csv as { pre, post, weight } text, one at a time; refuses a header that is not bodyId_pre,bodyId_post,weight and a row without three fields. */
function* connectionRows(text) {
    let at = text.indexOf("\n");
    if (at < 0) throw new Error("the connections file has no rows");
    if (text.slice(0, at).trim() !== "bodyId_pre,bodyId_post,weight") throw new Error(`the connections file's header is ${JSON.stringify(text.slice(0, at).trim())}, not bodyId_pre,bodyId_post,weight`);
    let row = 1;
    while (at + 1 < text.length) {
        let end = text.indexOf("\n", at + 1); if (end < 0) end = text.length;
        const line = text.slice(at + 1, end).replace(/\r$/, ""); at = end; row++;
        if (!line) continue;
        const f = line.split(",");
        if (f.length !== 3) throw new Error(`line ${row} of the connections file has ${f.length} fields, not 3`);
        yield { pre: f[0], post: f[1], weight: f[2] };
    }
}

function main(argv) {
    const known = new Set(["--dir", "--neurons", "--connections", "--min-weight", "--out", "--write"]);
    for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--") && !known.has(argv[i])) { console.error(`flyCx: unknown option ${argv[i]}`); return 2; }
    const arg = (f, d = null) => { const i = argv.indexOf(f); if (i === -1) return d; if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`${f} needs a value`); return argv[i + 1]; };
    let neuronsFile, connFile, minWeight, out;
    try {
        const dir = arg("--dir");
        neuronsFile = arg("--neurons", dir && path.join(dir, "traced-neurons.csv")); connFile = arg("--connections", dir && path.join(dir, "traced-total-connections.csv"));
        minWeight = Number(arg("--min-weight", DEFAULTS.minWeight)); out = path.resolve(ROOT, arg("--out", "vendor/hemibrain/hemibrain-cx-heading-loop.json"));
        if (!neuronsFile || !connFile) throw new Error("--dir <export folder> (or --neurons and --connections) is required");
        if (!Number.isInteger(minWeight) || minWeight < 1) throw new Error(`--min-weight must be a whole number of 1 or more, got ${arg("--min-weight")}`);
    } catch (e) { console.error("flyCx: " + e.message); return 2; }
    try {
        const nBytes = fs.readFileSync(neuronsFile), cBytes = fs.readFileSync(connFile), table = parseTable(nBytes.toString("utf8"));
        const missing = REQUIRED_NEURON_COLUMNS.filter((c) => !table.length || !(c in table[0]));
        if (missing.length) throw new Error(`the neurons file has no column ${missing.join(", ")}`);
        const c = circuitOf(table, connectionRows(cBytes.toString("utf8")), { minWeight }), s = c.selection;
        console.log(`[flyCx] ${table.length} traced neurons in the table; ${s.connectionRows} connection rows read`);
        console.log(`[flyCx] heading loop: ${s.neurons} neurons ${JSON.stringify(s.byClass)}, sides ${JSON.stringify(s.bySide)}; ${s.edges} edges of at least ${minWeight} synapses (${s.excitatoryEdges} excitatory, ${s.inhibitoryEdges} inhibitory), ${s.synapses} synapses; ${s.belowFloorPairs} pairs (${s.belowFloorSynapses} synapses) between these cells below the floor left out`);
        console.log(`[flyCx] input cells ${c.io.inputs.length} (E-PG and P-EN), output cells ${c.io.outputs.length} (E-PG and P-EG); edges by class pair ${JSON.stringify(s.byClassPair)}`);
        const meta = {
            dataset: "hemibrain:v1.2 (exported-traced-adjacencies-v1.2: traced-neurons.csv, traced-total-connections.csv)", server: "https://storage.googleapis.com/hemibrain/v1.2/exported-traced-adjacencies-v1.2.tar.gz",
            files: { "traced-neurons.csv": { bytes: nBytes.length, sha256: sha(nBytes) }, "traced-total-connections.csv": { bytes: cBytes.length, sha256: sha(cBytes) } },
            license: "CC-BY 4.0 as the hemibrain release states it (to be re-read from the release's own text; none is claimed here beyond that)",
            citation: "Scheffer, L. K., Xu, C. S., Januszewski, M., et al. (2020). A connectome and analysis of the adult Drosophila central brain. eLife 9:e57443. (Janelia FlyEM, Google, hemibrain v1.2.)",
            ids: "hemibrain body ids (the export's bodyId)", signs: SIGN_SOURCE, cellTypes: CELL_TYPES.map((t) => `${t.type} (${t.nt})`), build: { minWeight }, selection: s,
        };
        const json = { meta, neurons: c.neurons, edges: c.edges, io: c.io };
        if (argv.includes("--write")) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(json) + "\n"); console.log("[flyCx] wrote " + path.relative(ROOT, out)); }
        else console.log("[flyCx] dry run (pass --write to write " + path.relative(ROOT, out) + ")");
        return 0;
    } catch (e) { console.error("flyCx: " + e.message); return 1; }
}
process.exit(main(process.argv.slice(2)));
