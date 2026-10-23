// WebGLEngine/tools/fishCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/fishCircuit-selfcheck.mjs      (~3 s)
//
// THE SIBLING GATE OF tools/fishCircuit.mjs, AND OF WHAT IT MADE: the rule that picks a circuit out of the Fish1 paper's open synapse table, held to known answers on graphs small enough to work out by hand, and the vendored circuit and the topology baked
// from it held to the claims vendor/zebrafish/PROVENANCE.md makes. The raw package (3.5 MB of CSV) is not in the tree, so the derivation from it is NOT re-run here; row 8 says so, and re-runs it whenever FISH_TEN_DIR names the unzipped folder.
//
//   1  parseCsv        plain rows, blank lines and CRLF handled, a quoted field refused by name
//   2  synapseRows     columns read BY NAME (a reordered header works), the volume is 8 bbx x 8 bby x 30 bbz in nm^3 exactly, a row with a missing or non-numeric field is dropped and counted, a header without a column is refused
//   3  buildGraph      neurons are the presynaptic sides; an edge is a directed pair of two of them, not a self-loop, counted by its synapses OVER the volume threshold (strictly), direction kept
//   4  peelCore        the densest core by peeling the least-connected neuron (weight in + out to those still there, the smaller id first on a tie), on graphs whose answer is worked out here -- including one where the static degree order and the peeling order DIFFER
//   5  labels          a TEN class beats DMV beats DMV input beats unlabelled; the lists are read from the package's own column and line formats
//   6  circuitOf       neurons ascending with their labels and instance names, edges inside the core only, sorted, weights kept, counts equal
//   7  THE VENDORED FILE AND THE TOPOLOGY   the file has the fly circuit file's shape; its licence line claims no licence the data policy does not state, the citation names the paper; the PROVENANCE file quotes the checksums; brain/zebrafishTopology.mjs is
//                      RE-BAKED from the file here (the baker run into a scratch directory) and equals the checked-in one bit for bit; the baker's --source-label changes the header and nothing else, and its default header is unchanged
//   8  THE DERIVATION  when FISH_TEN_DIR is set: the vendored file is re-derived from the raw package and equals it (but for the time it was fetched)
//
// SABOTAGE LOG: (filled in below once run)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as FC from "./fishCircuit.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, sliceErr = "";
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const err = (fn) => { try { fn(); return ""; } catch (e) { return String(e.message); } };
const set = (...xs) => new Set(xs);

console.log("fishCircuit-selfcheck -- the rule that picks a real zebrafish circuit, and what it made\n");

sec("1. parseCsv");
{
    const r = FC.parseCsv("a,b,c\r\n1,2,3\n\n4,5,6\n");
    ok("!! plain rows, CRLF and LF alike, blank lines dropped, the header kept as row 0", JSON.stringify(r) === '[["a","b","c"],["1","2","3"],["4","5","6"]]', JSON.stringify(r));
    ok("a quoted field is REFUSED by name (this reader is for the package's plain files; guessing at quoting would misread an id)", /quoted field/.test(err(() => FC.parseCsv('a,b\n"1,5",2'))));
}

sec("2. synapseRows");
{
    const rows = FC.parseCsv("bbz,post_id,pre_neuron_id,bbx,bby\n3,20,10,5,4\n1,21,11,,2\n2,22,12,abc,1\n6,23,13,2,2");
    const { rows: r, dropped } = FC.synapseRows(rows);
    ok("!! columns are read BY NAME (this header is shuffled): pre and post come from their own columns, and the volume is 8 bbx x 8 bby x 30 bbz nm^3 EXACTLY (5 x 4 x 3 voxels = 8 x 5 x 8 x 4 x 30 x 3 = 115,200)", r.length === 2 && r[0].pre === 10 && r[0].post === 20 && r[0].volume === 8 * 5 * 8 * 4 * 30 * 3 && r[0].volume === 115200 && r[1].pre === 13 && r[1].post === 23 && r[1].volume === 8 * 2 * 8 * 2 * 30 * 6, JSON.stringify(r));
    ok("!! a row with a missing field and a row with a non-numeric one are DROPPED AND COUNTED (not read as zero, not crashed on): 2 dropped of 4", dropped === 2 && FC.synapseRows(FC.parseCsv("pre_neuron_id,bbx,bby,bbz,post_id\n1,1,1,1,2")).dropped === 0);
    ok("a header without one of the five columns is refused by name", /no pre_neuron_id, post_id, bbx, bby, bbz/.test(err(() => FC.synapseRows(FC.parseCsv("pre_neuron_id,bbx,bby,post_id\n1,1,1,2")))));
}

sec("3. buildGraph");
{
    const mk = (pre, post, volume) => ({ pre, post, volume });
    const rows = [mk(1, 2, 100), mk(1, 2, 100), mk(1, 2, 6), mk(2, 1, 100), mk(1, 1, 100), mk(2, 9, 100), mk(3, 1, 100), mk(1, 3, 5), mk(3, 3, 100)];
    const g = FC.buildGraph(rows, 5);
    ok("!! the neurons are the PRESYNAPTIC sides (1, 2, 3), not the post ids (9 is a partner nobody follows)", [...g.neurons].sort().join() === "1,2,3");
    ok("!! an edge is a DIRECTED pair of two neurons, counted by its synapses, a self-loop never counted, a partner outside the set never counted: 1>2 has three synapses over 5 (100, 100, 6), 2>1 one, 3>1 one; 1>3 has one of exactly 5 and 5 is NOT over 5; 2>9 and the loops are not edges", g.edges.get("1>2") === 3 && g.edges.get("2>1") === 1 && g.edges.get("3>1") === 1 && !g.edges.has("1>3") && !g.edges.has("2>9") && !g.edges.has("1>1") && !g.edges.has("3>3") && g.edges.size === 3, JSON.stringify([...g.edges]));
    ok("the threshold is a parameter and STRICT: at 6 the 1>2 pair keeps two synapses (100, 100) and not the 6; at the default (5,000,000 nm^3) a 4,000,000 nm^3 synapse is dropped and a 5,000,001 kept", FC.buildGraph(rows, 6).edges.get("1>2") === 2 && FC.DEFAULTS.minVolume === 5000000 && !FC.buildGraph([mk(1, 2, 4000000), mk(2, 1, 1)]).edges.has("1>2") && FC.buildGraph([mk(1, 2, 5000001), mk(2, 1, 1)]).edges.has("1>2") && !FC.buildGraph([mk(1, 2, 5000000), mk(2, 1, 1)]).edges.has("1>2"));
}

sec("4. peelCore");
{
    // K5 on 10..14 (every directed pair, weight 3) plus a pendant chain 20-21-22 hanging off 10 and a lone heavy pair 30<->31 that is dense but small
    const E = new Map(); const add = (a, b, c) => E.set(a + ">" + b, c);
    for (let a = 10; a <= 14; a++) for (let b = 10; b <= 14; b++) if (a !== b) add(a, b, 3);
    add(10, 20, 1); add(20, 21, 1); add(21, 22, 1); add(30, 31, 40); add(31, 30, 40);
    // weights: a clique neuron 24 (10 also has the chain's 1), the chain 20/21 weigh 2 and 22 weighs 1, the heavy pair 80 each
    ok("!! THE DENSEST CORE IS THE HEAVIEST, worked out by hand: the chain (weight 1-2) goes first, then the clique members (24 each), the pair (80 each) last -- peeling this 10-neuron graph to 7 leaves the clique and the pair, to 2 leaves the pair alone, and to 6 loses the clique member with the smallest id on the tie (10) while the pair and the rest stay",
        FC.peelCore(E, 7).join() === "10,11,12,13,14,30,31" && FC.peelCore(E, 2).join() === "30,31" && FC.peelCore(E, 6).join() === "11,12,13,14,30,31", FC.peelCore(E, 7).join() + " | " + FC.peelCore(E, 6).join());
    const P = new Map([["1>2", 5], ["2>3", 5], ["3>4", 1], ["4>5", 1]]);   // a path 1-2-3-4-5, the first two links heavy
    // the static order is not the peeling order: a triangle 1,2,3 (weight 3 a link, 6 a neuron) and a star whose centre 4 weighs 8 and whose four leaves 5..8 weigh 2 each.
    // Sorted once by weight the top three are 4, 1, 2; PEELED, the leaves go first, the centre falls to 0 with them, and the triangle is what is left.
    const S = new Map([["1>2", 3], ["2>3", 3], ["3>1", 3], ["4>5", 2], ["4>6", 2], ["4>7", 2], ["4>8", 2]]);
    ok("!! PEELING UPDATES THE WEIGHTS AS IT GOES (a single sort by the first weights gives a different core): the star centre weighs 8 to the triangle's 6 at the start and would be kept, but once its leaves are gone it weighs 0 and goes too -- the core of 3 is the triangle, 1,2,3, and not 1,2,4 (and of 4 it is the triangle and leaf 8, because the centre, tied with the last leaf at 2, goes on the smaller id); the path's core of 3 is 1,2,3 and of 2 is 2,3", FC.peelCore(S, 3).join() === "1,2,3" && FC.peelCore(S, 4).join() === "1,2,3,8" && FC.peelCore(P, 3).join() === "1,2,3" && FC.peelCore(P, 2).join() === "2,3", FC.peelCore(S, 3).join());
    const tie = new Map([["5>6", 3], ["1>2", 3]]);   // four neurons weighing 3 each: the tie is all of them
    ok("!! A TIE IS BROKEN BY THE SMALLER ID, so the answer is a function of the data and not of the file's row order: 1 goes first (leaving 2, which now weighs 0), then 2, then 5 -- peeling to 3 leaves 2,5,6, to 2 leaves 5,6, and the same edges in the other order give the same", FC.peelCore(tie, 3).join() === "2,5,6" && FC.peelCore(tie, 2).join() === "5,6" && FC.peelCore(new Map([["1>2", 3], ["5>6", 3]]), 3).join() === "2,5,6");
    ok("a core at least as large as the graph is the whole graph (sorted, ascending), a core of 0 is empty, and the answer is the same twice", FC.peelCore(P, 5).join() === "1,2,3,4,5" && FC.peelCore(P, 99).join() === "1,2,3,4,5" && FC.peelCore(P, 0).length === 0 && FC.peelCore(E, 7).join() === FC.peelCore(E, 7).join());
    ok("a reciprocal pair counts BOTH ways in a neuron's weight (a>b of 3 and b>a of 4 weigh 7 each) and a neuron with no edge never takes part", (() => { const R = new Map([["1>2", 3], ["2>1", 4], ["2>3", 1]]); return FC.peelCore(R, 2).join() === "1,2" && !FC.peelCore(R, 9).includes(99); })());
}

sec("5. labels");
{
    const lists = FC.readLists("classI,classII,classIII,classIV\n101,201,301,401\n102,202,,402\n0,203,,\n", "501\n502\n101\n\n", "601\n602\n501\n");
    ok("!! the lists are read from the package's formats: TEN_cats.csv is four COLUMNS of unequal length (a blank cell is no id, a 0 is no id), the other two are one id a line; the class names lose their 'class' prefix", lists.classes.get("I").size === 2 && lists.classes.get("II").size === 3 && lists.classes.get("III").size === 1 && lists.classes.get("IV").size === 2 && lists.dmv.size === 3 && lists.dmvInput.size === 3 && lists.classes.get("I").has(101) && !lists.classes.get("I").has(0), JSON.stringify([...lists.classes].map(([k, v]) => [k, v.size])));
    ok("!! A TEN CLASS BEATS DMV BEATS A DMV INPUT BEATS 'unlabelled': 101 is in classI and in the DMV list and is TEN-I; 501 is in the DMV list and the inputs and is DMV; 601 is an input; 999 is unlabelled", FC.labelOf(101, lists) === "TEN-I" && FC.labelOf(501, lists) === "DMV" && FC.labelOf(601, lists) === "DMV-input" && FC.labelOf(999, lists) === "unlabelled" && FC.labelOf(402, lists) === "TEN-IV");
}

sec("6. circuitOf");
{
    const g = { neurons: set(5, 3, 9, 7), edges: new Map([["9>3", 2], ["3>9", 1], ["5>3", 1], ["7>3", 1], ["3>7", 6]]) };
    const lists = { classes: new Map(), dmv: set(3), dmvInput: set(9) };
    const c = FC.circuitOf(g, lists, { dataset: "d", note: "x" }, 3);
    ok("!! the core's neurons are ASCENDING with their labels and 'fish1:<id>' instance names, the edges are only those INSIDE the core, sorted by (from, to), their weights kept, the counts equal to the arrays, and the meta carried through (3, 7, 9 are the core: 5 weighs 1 and goes)", JSON.stringify(c.neurons) === JSON.stringify([{ bodyId: 3, type: "DMV", instance: "fish1:3" }, { bodyId: 7, type: "unlabelled", instance: "fish1:7" }, { bodyId: 9, type: "DMV-input", instance: "fish1:9" }]) && JSON.stringify(c.edges) === JSON.stringify([[3, 7, 6], [3, 9, 1], [7, 3, 1], [9, 3, 2]]) && c.neuronCount === 3 && c.edgeCount === 4 && c.dataset === "d" && c.note === "x", JSON.stringify(c.edges));
}

sec("7. THE VENDORED FILE AND THE TOPOLOGY");
{
    const dir = path.join(ENG, "vendor", "zebrafish"), J = JSON.parse(fs.readFileSync(path.join(dir, "fish1-ten-core.json"), "utf8")), fly = JSON.parse(fs.readFileSync(path.join(ENG, "vendor", "male-cns", "giant-fiber-circuit.json"), "utf8"));
    const prov = fs.readFileSync(path.join(dir, "PROVENANCE.md"), "utf8");
    ok("!! the file has the fly circuit file's shape, so the baker reads it unchanged: the keys dataset, server, fetchedAt, license, citation, typePattern, neuronCount, edgeCount, neurons, edges (and the selection record), each neuron { bodyId, type, instance }, each edge [from, to, weight]", ["dataset", "server", "fetchedAt", "license", "citation", "typePattern", "neuronCount", "edgeCount", "neurons", "edges"].every((k) => k in J && k in fly) && "selection" in J && J.neurons.every((n) => Number.isInteger(n.bodyId) && typeof n.type === "string" && typeof n.instance === "string") && J.edges.every((e) => e.length === 3));
    ok("!! IT CLAIMS NO LICENCE THE DATA POLICY DOES NOT STATE, AND CITES THE PAPER: the licence line says open access under the data policy and that no licence text is stated (not CC-BY, not MIT); the citation names Petkova, Januszewski, 2025 and bioRxiv; the server is the open bucket's, not the CAVE server", /open access/.test(J.license) && /no licence text is stated/.test(J.license) && !/CC-BY|MIT|Apache/.test(J.license) && /Petkova/.test(J.citation) && /Januszewski/.test(J.citation) && /2025/.test(J.citation) && /bioRxiv/.test(J.citation) && /storage\.googleapis\.com\/fish1-release\/paper_data\//.test(J.server) && !/brain-wire-test/.test(J.server));
    const hexes = prov.match(/\b[0-9a-f]{64}\b/g) || [];
    ok("!! THE PROVENANCE FILE QUOTES THE CHECKSUMS of the package and of the four files read from it (five sha256 values, all distinct), says no token was needed, names the CAVE host it did not use and the Mauthner circuit it does not hold, and cites the paper", hexes.length === 5 && new Set(hexes).size === 5 && /needed no token/.test(prov) && /global\.brain-wire-test\.org/.test(prov) && /Mauthner/.test(prov) && /Petkova/.test(prov) && /bioRxiv/.test(prov) && /fa18e512cdf4eaceb195ae0ee4b9812ec0c85b3a0a20969a085ac38b2da4fe92/.test(prov), `${hexes.length} checksums`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fishbake_")), outFile = path.join(tmp, "zebrafishTopology.mjs");
    const bake = (extra) => spawnSync(process.execPath, [path.join(ENG, "tools", "bakeConnectomeTopology.mjs"), "--in", path.join(dir, "fish1-ten-core.json"), "--out", outFile, "--circuit-name", "the densest 34-neuron core of the TEN analysis set (22 DMV inputs, 7 DMV, 2 TEN, 3 unlabelled)", ...extra, "--write"], { encoding: "utf8", timeout: 60000 });
    const label = ["--source-label", "The Fish1 larval-zebrafish EM connectome (Petkova, Januszewski et al., 2025), paper_data/TEN_analysis.zip of gs://fish1-release", "--provenance", "vendor/zebrafish/PROVENANCE.md"], b = bake(label);
    const rebaked = b.status === 0 ? fs.readFileSync(outFile, "utf8").replace(/^\/\/ WebGLEngine\/.*\n/, "") : "", checked = fs.readFileSync(path.join(ENG, "brain", "zebrafishTopology.mjs"), "utf8").replace(/^\/\/ WebGLEngine\/.*\n/, "");
    ok("!! brain/zebrafishTopology.mjs IS THE BAKER'S OUTPUT for the vendored file, byte for byte but for its first line (the output's own path): nobody edited a neuron or an edge by hand", b.status === 0 && rebaked.length > 500 && rebaked === checked, b.stderr.slice(0, 120));
    const body = fs.readFileSync(path.join(ENG, "brain", "zebrafishTopology.mjs"), "utf8");
    ok("!! and the header does not claim the fly: it names the Fish1 connectome and the zebrafish PROVENANCE file, and says nothing of Janelia FlyEM, male-cns or Neuprint", /Fish1 larval-zebrafish EM connectome/.test(body) && /vendor\/zebrafish\/PROVENANCE\.md/.test(body) && !/FlyEM|male-cns|Neuprint/.test(body));
    // the baker's default text is the text it always was, and --source-label changes the header lines and nothing else
    const flyOut = path.join(tmp, "fly.mjs"), plain = spawnSync(process.execPath, [path.join(ENG, "tools", "bakeConnectomeTopology.mjs"), "--in", path.join(ENG, "vendor", "male-cns", "giant-fiber-circuit.json"), "--out", flyOut, "--circuit-name", "the Giant Fiber Circuit", "--write"], { encoding: "utf8", timeout: 60000 });
    const flyBody = plain.status === 0 ? fs.readFileSync(flyOut, "utf8") : "";
    ok("!! THE BAKER'S DEFAULT HEADER IS UNCHANGED (it still names Janelia FlyEM's male-cns, Neuprint and vendor/male-cns/PROVENANCE.md), and the data lines (neuron order, types, instances, edges) of a labelled bake and a plain bake of the SAME input are identical: --source-label touches the header and only the header", /Janelia FlyEM's male-cns connectome \(dataset "male-cns:v1.0"\), the Giant Fiber Circuit\./.test(flyBody) && /vendor\/male-cns\/PROVENANCE\.md/.test(flyBody) && /real Neuprint bodyId/.test(flyBody)
        && (() => { const out2 = path.join(tmp, "fish_plain.mjs"); const p2 = spawnSync(process.execPath, [path.join(ENG, "tools", "bakeConnectomeTopology.mjs"), "--in", path.join(dir, "fish1-ten-core.json"), "--out", out2, "--circuit-name", "x", "--write"], { encoding: "utf8", timeout: 60000 }); const data = (t) => t.split("\n").filter((l) => /^export const (NEURON_ORDER|NEURON_TYPES|NEURON_INSTANCES|EDGES)|^    \[/.test(l)).join("\n"); return p2.status === 0 && data(fs.readFileSync(out2, "utf8")) === data(body) && data(body).length > 500; })());
    fs.rmSync(tmp, { recursive: true, force: true });
}

sec("8. THE DERIVATION FROM THE RAW PACKAGE");
{
    const dir = process.env.FISH_TEN_DIR;
    if (!dir || !fs.existsSync(path.join(dir, "synapse_sizes.csv"))) console.log("  ----  NOT CHECKED HERE: the raw package (TEN_analysis.zip, 3.5 MB) is not in the tree. Set FISH_TEN_DIR to the unzipped folder to re-derive vendor/zebrafish/fish1-ten-core.json from it; the pure functions above are what that derivation is made of");
    else {
        const read = (n) => fs.readFileSync(path.join(dir, n), "utf8"), sha = (n) => crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, n))).digest("hex");
        const J = JSON.parse(fs.readFileSync(path.join(ENG, "vendor", "zebrafish", "fish1-ten-core.json"), "utf8")), prov = fs.readFileSync(path.join(ENG, "vendor", "zebrafish", "PROVENANCE.md"), "utf8");
        const { rows, dropped } = FC.synapseRows(FC.parseCsv(read("synapse_sizes.csv"))), g = FC.buildGraph(rows), lists = FC.readLists(read("TEN_cats.csv"), read("DMVIDs.csv"), read("DMV_InputsIDs.csv"));
        const c = FC.circuitOf(g, lists, {}, 34);
        ok("!! THE VENDORED CIRCUIT IS RE-DERIVED FROM THE RAW PACKAGE: the same 34 neurons with the same labels, the same 153 weighted edges, and the selection record's counts (1,105 neurons, 3,519 pairs, rows read and dropped) -- and the four files are the ones whose checksums the PROVENANCE file quotes", JSON.stringify(c.neurons) === JSON.stringify(J.neurons) && JSON.stringify(c.edges) === JSON.stringify(J.edges) && g.neurons.size === J.selection.neuronsInSet && g.edges.size === J.selection.pairsInSet && rows.length === J.selection.rowsRead && dropped === J.selection.rowsDropped && ["synapse_sizes.csv", "TEN_cats.csv", "DMVIDs.csv", "DMV_InputsIDs.csv"].every((n) => prov.includes(sha(n))));
    }
}

console.log(fails ? `\nfishCircuit-selfcheck: ${fails} FAILED` : "\nfishCircuit-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
