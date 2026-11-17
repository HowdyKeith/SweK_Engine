// WebGLEngine/tools/ship/maleCnsCompassRing-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/maleCnsCompassRing-selfcheck.mjs      (a second; it reads a few files and starts no process)
//
// THE GATE OF THE RING NEURONS' DATA (backlog `fly-compass-learns`): vendor/male-cns/ring-compass-circuit.json, baked by tools/maleCnsCompassRing.py from the public male-cns v1.0 release tables
// (no token; vendor/male-cns/PROVENANCE.md says which). The tables are half a gigabyte and are not in the repo, so this gate cannot re-bake the file; it holds the file to ITSELF, to the compass
// file already vendored (the same 50 compass neurons), and to what the provenance and the bake script say.
//   1  THE CELLS        282 ring neurons and 50 compass neurons; sorted as the bake sorts; every body once; the compass neurons are epg-compass-circuit.json's
//   2  THE CONNECTIONS  ring onto compass only; indices in range; at least 5 synapses; sorted; every pair once
//   3  THE TOTALS       what is kept adds up to the connections; what is dropped is said
//   4  THE PROVENANCE AND THE BAKE   the same sources, threshold and counts in the file, the provenance and the script; no token anywhere
// SABOTAGE LOG (2026-11-17) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate run whole for each; every one red by name:
//   THE FILE: D1 the threshold said to be 3 1 | D2 a connection under the threshold 2 | D3 a ring neuron becomes a compass neuron 4 | D4 the kept synapses do not add up 1 | D5 a source's sha256
//   changed 1 | D6 an edge from compass onto ring 2.  THE PROVENANCE: P1 it says Neuprint 1 | P2 it gives another count 1 | P3 the file is not in its contents 1
//   THE BAKE (tools/maleCnsCompassRing.py): T1 it keeps 3 synapses 1 | T2 it fetches over the network 1 | T3 its groups in another order 1 | T4 it takes compass onto ring 1
//   TWO WENT 0 RED AT FIRST AND WERE FINDINGS: P1 (the row read the whole provenance, and the mushroom body's section says "no token and no Neuprint query" too: it now reads the ring section
//   alone) and T2 (the row's network words missed urllib: it now names urllib, socket and http.client -- and tools/ship/maleCnsMushroomBody-selfcheck.mjs had the same hole, fixed the same way and
//   sabotaged the same way, red). Run again: 1, 1.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const FILE = "vendor/male-cns/ring-compass-circuit.json", text = src(FILE), M = JSON.parse(text), GROUPS = ["RING", "EPG"];

console.log("maleCnsCompassRing-selfcheck -- the ring neurons' data: the cells, the connections, the totals, the provenance and the bake\n");

console.log("1. THE CELLS");
section(() => {
    const count = (f, a = M.cells) => { const c = {}; for (const x of a) { const k = f(x); c[k] = (c[k] || 0) + 1; } return c; };
    ok("!! THE FILE IS WHAT IT SAYS: the male-cns v1.0 dataset's ring neurons onto its compass neurons, topology only, at a threshold of 5 synapses, from the public release tables; its groups RING and EPG in that order",
        M.format === "swek-connectome-topology-v1" && M.circuit === "ring neurons onto compass neurons" && M.dataset === "male-cns:v1.0" && M.minSynapses === 5 && J(M.groups) === J(GROUPS) && /gs:\/\/flyem-male-cns\/v1\.0\/connectome-data\/flat-connectome\//.test(M.source) && !("xyz" in (M.cells[0] || {})));
    const ring = M.cells.filter((x) => x.group === "RING"), epg = M.cells.filter((x) => x.group === "EPG");
    ok("!! 332 CELLS: 282 ring neurons (ER1 28, ER2 41, ER3 151, ER4 37, ER5 21, ER6 4) and 50 compass neurons (46 EPG, 4 EPGt); 167 with the soma on the left, 165 on the right; every cell a body id, a type, an instance and a side",
        M.cells.length === 332 && ring.length === 282 && epg.length === 50 && J(count((x) => x.type.match(/^ER\d/)[0], ring)) === J({ ER1: 28, ER2: 41, ER3: 151, ER4: 37, ER5: 21, ER6: 4 }) && J(count((x) => x.type, epg)) === J({ EPG: 46, EPGt: 4 }) &&
        J(count((x) => x.side)) === J({ L: 167, R: 165 }) && M.cells.every((x) => Number.isSafeInteger(x.bodyId) && x.bodyId > 0 && typeof x.type === "string" && typeof x.instance === "string" && (x.side === "L" || x.side === "R")));
    const key = (x) => [GROUPS.indexOf(x.group), x.type, x.bodyId], before = (a, b) => { const p = key(a), q = key(b); return p[0] !== q[0] ? p[0] < q[0] : p[1] !== q[1] ? p[1] < q[1] : p[2] < q[2]; };
    ok("!! the cells are sorted as the bake sorts (group, then type, then body id) and every body is there once", M.cells.every((x, i) => i === 0 || before(M.cells[i - 1], x)) && new Set(M.cells.map((x) => x.bodyId)).size === 332);
    const old = JSON.parse(src("vendor/male-cns/epg-compass-circuit.json")), oldIds = new Set((old.neurons || old.cells).map((n) => Number(n.bodyId)));
    ok("!! THE 50 COMPASS NEURONS ARE THE 50 OF vendor/male-cns/epg-compass-circuit.json, body for body -- the two files are of the same cells", oldIds.size === 50 && epg.every((x) => oldIds.has(x.bodyId)));
});

console.log("\n2. THE CONNECTIONS");
section(() => {
    const E = M.edges, ring = (i) => M.cells[i] && M.cells[i].group === "RING", epg = (i) => M.cells[i] && M.cells[i].group === "EPG";
    ok("!! 8,847 CONNECTIONS, EACH [ring neuron, compass neuron, synapses] -- from a ring neuron onto a compass neuron, never the other way or within a group -- of at least 5 synapses, sorted by pre and then post, every pair once",
        E.length === 8847 && E.every((e) => e.length === 3 && e.every(Number.isInteger) && ring(e[0]) && epg(e[1]) && e[2] >= M.minSynapses) && E.every((e, i) => i === 0 || E[i - 1][0] < e[0] || (E[i - 1][0] === e[0] && E[i - 1][1] < e[1])));
    const strongest = E.reduce((a, e) => (e[2] > a[2] ? e : a)), reach = new Set(E.map((e) => e[0])).size;
    ok("!! CLOSE TO ALL-TO-ALL, AS THE PROVENANCE SAYS: 260 of the 282 ring neurons reach a compass neuron, and the kept connections are 63 percent of the 14,100 possible pairs; the strongest is 75 synapses, an ER4m neuron onto EPG(PB08)_L4",
        reach === 260 && Math.round(100 * E.length / (282 * 50)) === 63 && strongest[2] === 75 && M.cells[strongest[0]].type === "ER4m" && M.cells[strongest[1]].instance === "EPG(PB08)_L4", `${reach} reach, ${(100 * E.length / 14100).toFixed(1)} percent`);
});

console.log("\n3. THE TOTALS");
section(() => {
    const T = M.totals, kept = M.edges.reduce((a, e) => a + e[2], 0);
    ok("!! WHAT IS KEPT ADDS UP TO THE CONNECTIONS, AND WHAT IS DROPPED IS SAID: at every weight 11,719 connections carrying 124,264 synapses; kept, the file's 8,847 carrying 117,073 -- 94 percent of the synapses",
        J(Object.keys(T)) === J(["RING>EPG"]) && T["RING>EPG"].keptConnections === M.edges.length && T["RING>EPG"].keptSynapses === kept && T["RING>EPG"].connections === 11719 && T["RING>EPG"].synapses === 124264 && kept === 117073 && Math.round(100 * kept / 124264) === 94);
});

console.log("\n4. THE PROVENANCE AND THE BAKE");
section(() => {
    const prov = src("vendor/male-cns/PROVENANCE.md"), flat = prov.slice(prov.indexOf("## Circuit: Ring neurons"), prov.indexOf("## Contents")).replace(/\s+/g, " "), tool = src("tools/maleCnsCompassRing.py"), mb = JSON.parse(src("vendor/male-cns/mushroom-body-circuit.json"));
    ok("!! THE FILE'S SOURCES ARE THE MUSHROOM BODY'S, TO THE BYTE COUNT AND THE SHA256 -- the same two public release tables the provenance names",
        J(M.sources) === J(mb.sources) && M.sources.every((s) => prov.includes("`" + s.sha256 + "`") && prov.includes("`" + s.name + "`")));
    ok("!! THE PROVENANCE SAYS WHAT THE FILE HOLDS AND HOW IT WAS GOT, IN ITS OWN SECTION (read alone: sabotage P1 first went 0 red because the mushroom body's section says the same words): the same public tables, no token and not Neuprint; 332 cells; 8,847 connections of at least 5 synapses out of 11,719; topology only, one direction; close to all-to-all; and the file is in its contents",
        /## Circuit: Ring neurons onto the compass neurons \(ER > EPG\)/.test(prov) && /from the same two public release tables/.test(flat) && /no token and no Neuprint query/.test(flat) && /332 cells/.test(flat) && /\*\*the file keeps the 8,847 of at least 5 synapses\*\*/.test(flat) && /11,719 such connections carrying 124,264 synapses/.test(flat) &&
        /Topology only, and only one direction/.test(flat) && /The wiring is close to all-to-all/.test(flat) && /- `ring-compass-circuit\.json`/.test(prov));
    ok("!! THE BAKE SCRIPT IS THE ONE THE PROVENANCE NAMES AND ITS THRESHOLD IS THE FILE'S: tools/maleCnsCompassRing.py, MIN_SYNAPSES = 5, the two groups in the file's order, the dataset's name; it reads only the two paths it is given -- no URL, no network library (sabotage T2 first went 0 red on urllib), no token, no Neuprint query",
        /\*\*`tools\/maleCnsCompassRing\.py`\*\*/.test(prov) && /^MIN_SYNAPSES = 5$/m.test(tool) && /^GROUPS = \["RING", "EPG"\]$/m.test(tool) && /^DATASET = "male-cns:v1\.0"$/m.test(tool) && !/https?:\/\/|urlopen|urllib|requests|socket|http\.client|token|Authorization|neuprint\.janelia/i.test(tool.replace(/^#.*$/gm, "")) && /def main\(ann_path, w_path, out_path\)/.test(tool) && /w\.body_pre\.isin\(ring\) & w\.body_post\.isin\(epg\)/.test(tool));
    const sha = createHash("sha256").update(fs.readFileSync(path.join(ENG, FILE))).digest("hex");
    ok("the file is one line of JSON and a newline, as the bake writes it (a hand edit that re-indents it is seen here)", text.endsWith("\n") && text.indexOf("\n") === text.length - 1 && /^[0-9a-f]{64}$/.test(sha), sha.slice(0, 16));
});

console.log(`\nmaleCnsCompassRing-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
