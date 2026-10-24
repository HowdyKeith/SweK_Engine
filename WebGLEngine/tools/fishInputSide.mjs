// WebGLEngine/tools/fishInputSide.mjs -- UNNUMBERED. Run: node tools/fishInputSide.mjs --dir <a fishCaveExport.py export folder> [--cells ID1,ID2] [--midline UM] [--seed N] [--trim UM] [--json FILE]
//
// THE INPUT SIDE OF THE CELLS OF AN EXPORT: reads synapses_in.csv, labels.csv (the soma rows) and, when it is there, synapse_signs.csv, and prints the facts of tools/fishInputSideLib.mjs -- where each cell's input synapses sit
// (three groups), how many partners each group has and how many partners keep to one group, the partners two cells share, and the signs by group. The numbers are COUNTS: no root id is printed or written, so what this prints can go in a note
// (the data terms of the account say the export itself is not for posting). --cells defaults to the ids in mauthner_candidates.json, in that order; a cell is named by its place in the list. The library is gated (tools/fishInputSide-selfcheck.mjs).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { parseTable, inputSide, DOMAINS, ALL } from "./fishInputSideLib.mjs";

/** The root ids of mauthner_candidates.json, read as TEXT: the export writes them as plain 18-digit numbers, which JSON.parse rounds (864691128610327387 comes back as 864691128610327400) -- the first run on a real export died of it. */
function candidateIds(text) {
    const m = /"ids"\s*:\s*\[([^\]]*)\]/.exec(text), ids = m ? m[1].match(/\d+/g) : null;
    if (!ids || !ids.length) throw new Error("mauthner_candidates.json names no ids (pass --cells ID1,ID2)");
    return ids;
}

function main(argv) {
    const arg = (f, d = null) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
    const known = new Set(["--dir", "--cells", "--midline", "--seed", "--trim", "--json"]);
    for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--") && !known.has(argv[i])) { console.error(`fishInputSide: unknown option ${argv[i]}`); return 2; }
    const dir = arg("--dir");
    if (!dir) { console.error("fishInputSide: --dir <an export folder> is required"); return 2; }
    const read = (n, must = true) => { const f = path.join(dir, n); if (!fs.existsSync(f)) { if (must) throw new Error(`${n} is not in ${dir}`); return null; } return fs.readFileSync(f, "utf8"); };
    try {
        const cells = arg("--cells") ? arg("--cells").split(",").map((x) => x.trim()).filter(Boolean) : candidateIds(read("mauthner_candidates.json"));
        const signsText = read("synapse_signs.csv", false);
        const midline = arg("--midline") !== null ? Number(arg("--midline")) : null;
        if (midline !== null && !Number.isFinite(midline)) throw new Error("--midline must be a number (micrometres, left-right axis)");
        const res = inputSide({ synapsesIn: parseTable(read("synapses_in.csv")), labels: parseTable(read("labels.csv")), signs: signsText === null ? null : parseTable(signsText) }, cells, { midlineUm: midline, seed: Number(arg("--seed", 1)), trimUm: Number(arg("--trim", 100)) });
        const f = (v) => (v * 100).toFixed(0) + "%";
        console.log(`[fishInputSide] ${res.cells.length} cell(s); fit: seed ${res.cells[0].fit.seed}, ${res.cells[0].fit.restarts} restarts, far beyond ${res.cells[0].fit.trimUm} um; midline ${res.midlineUm.toFixed(1)} um (${res.midlineFrom}); signs ${res.signs ? "read from synapse_signs.csv" : "NOT in this export (run fishCaveExport.py export with --signs)"}`);
        res.cells.forEach((c, i) => {
            const r = c.report;
            console.log(`cell ${i + 1}: soma at ${c.somaUm.join(" x ")} um, ${c.side > 0 ? "high" : "low"}-y side, ${r.synapses} input synapses from ${r.partners.total} partners${c.dropped ? ` (${c.dropped} rows without a position left out)` : ""}`);
            for (const d of DOMAINS) console.log(`   ${d.padEnd(11)} ${String(r.domains[d].synapses).padStart(5)} synapses (${f(r.domains[d].share)}) centred at (${r.domains[d].centroidUm.join(", ")}) um [front-back, lateral, z], sd (${r.domains[d].sdUm.join(", ")})   partners by commonest group ${r.partners.byDominant[d]}, strong (${"10+"}) ${r.partners.strongByDominant[d]}, ${r.partners.synapsesPerPartner[d]} synapses per partner${r.signs ? `   excitatory ${r.signs[d].excitatory}, inhibitory ${r.signs[d].inhibitory}, untagged ${r.signs[d].untagged}` : ""}`);
            if (r.far.synapses) console.log(`   FAR (more than ${r.trimUm} um from the soma, not in the fit): ${r.far.synapses} synapses from ${r.partners.byDominant.far} partners${r.signs ? `; excitatory ${r.signs.far.excitatory}, inhibitory ${r.signs.far.inhibitory}, untagged ${r.signs.far.untagged}` : ""} -- look at these in the viewer first`);
            console.log(`   ${r.partners.singleDomain} of ${r.partners.total} partners (${f(r.partners.singleDomainShare)}) keep all their synapses to one group`);
        });
        if (res.shared) console.log(`shared by cells 1 and 2: ${res.shared.shared} partners, ${res.shared.sameDomain} in the same group on both; by group: ${Object.entries(res.shared.pairs).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}${res.signs ? `; signs on the two cells: ${Object.entries(res.shared.signPairs).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}` : ""}`);
        const json = arg("--json");
        if (json) { fs.writeFileSync(json, JSON.stringify({ midlineUm: res.midlineUm, signs: res.signs, cells: res.cells.map((c) => ({ somaUm: c.somaUm, side: c.side, dropped: c.dropped, report: c.report })), shared: res.shared }, null, 1) + "\n"); console.log(`wrote ${json} (counts only: no root id in it)`); }
        return 0;
    } catch (e) { console.error("fishInputSide: " + e.message); return 1; }
}
process.exit(main(process.argv.slice(2)));
