// WebGLEngine/tools/ship/maleCnsPnKc-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/maleCnsPnKc-selfcheck.mjs      (a second; it reads a few files and starts no process)
//
// THE GATE OF THE PROJECTION NEURONS' DATA (Keith, 2026-11-18: "Let's do all 5"): vendor/male-cns/pn-kc-circuit.json, baked by tools/maleCnsPnKc.py from the public male-cns v1.0 release
// tables (no token; vendor/male-cns/PROVENANCE.md says which). The tables are half a gigabyte and are not in the repo, so this gate cannot re-bake the file; it holds the file to ITSELF, to
// the mushroom body file already vendored (the same 4,064 Kenyon cells, in the same order), and to what the provenance and the bake script say.
//   1  THE CELLS        686 projection neurons and 4,064 Kenyon cells; sorted as the bake sorts; every body once; the Kenyon cells are mushroom-body-circuit.json's, in its order;
//                       a projection neuron's glomerulus is its type's
//   2  THE CONNECTIONS  projection neuron onto Kenyon cell only; indices in range; at least 5 synapses; sorted; every pair once
//   3  THE TOTALS       what is kept adds up to the connections; what is dropped is said
//   4  THE PROVENANCE AND THE BAKE   the same sources, threshold and counts in the file, the provenance and the script; no token anywhere
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate run whole for each; every one red by name, NONE 0 red:
//   THE FILE: D1 the threshold said to be 3 2 | D2 a connection under the threshold 3 | D3 a Kenyon cell becomes a projection neuron 7 | D4 the kept synapses do not add up 2 | D5 a source's
//   sha256 changed 2 | D6 a glomerulus not its type's 2 | D7 a Kenyon cell's body id changed 2.  THE PROVENANCE: P1 its section says Neuprint 1 | P2 it gives another count 1 | P3 the file is
//   not in its contents 1.  THE BAKE (tools/maleCnsPnKc.py): T1 it keeps 3 synapses 1 | T2 it fetches over the network 1 | T3 its groups in another order 1 | T4 it takes Kenyon cell onto
//   projection neuron 1 | T5 it counts the SEZ projection neurons too 1
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
const FILE = "vendor/male-cns/pn-kc-circuit.json", text = src(FILE), M = JSON.parse(text), GROUPS = ["PN", "KC"], MB = JSON.parse(src("vendor/male-cns/mushroom-body-circuit.json"));

console.log("maleCnsPnKc-selfcheck -- the projection neurons' data: the cells, the connections, the totals, the provenance and the bake\n");

console.log("1. THE CELLS");
section(() => {
    const count = (f, a = M.cells) => { const c = {}; for (const x of a) { const k = f(x); c[k] = (c[k] || 0) + 1; } return c; };
    ok("!! THE FILE IS WHAT IT SAYS: the male-cns v1.0 dataset's projection neurons onto its Kenyon cells, topology only, at a threshold of 5 synapses, from the public release tables; its groups PN and KC in that order",
        M.format === "swek-connectome-topology-v1" && M.circuit === "projection neurons onto Kenyon cells" && M.dataset === "male-cns:v1.0" && M.minSynapses === 5 && J(M.groups) === J(GROUPS) && /gs:\/\/flyem-male-cns\/v1\.0\/connectome-data\/flat-connectome\//.test(M.source) && !("xyz" in (M.cells[0] || {})));
    const pn = M.cells.filter((x) => x.group === "PN"), kc = M.cells.filter((x) => x.group === "KC");
    ok("!! 4,750 CELLS: 686 projection neurons (343 with the soma on each side) and 4,064 Kenyon cells; every cell a body id, a type and a side",
        M.cells.length === 4750 && pn.length === 686 && kc.length === 4064 && J(count((x) => x.side, pn)) === J({ L: 343, R: 343 }) && M.cells.every((x) => Number.isSafeInteger(x.bodyId) && x.bodyId > 0 && typeof x.type === "string" && (x.side === "L" || x.side === "R" || x.side === null)));
    const key = (x) => [GROUPS.indexOf(x.group), x.type, x.bodyId], before = (a, b) => { const p = key(a), q = key(b); return p[0] !== q[0] ? p[0] < q[0] : p[1] !== q[1] ? p[1] < q[1] : p[2] < q[2]; };
    ok("!! the cells are sorted as the bake sorts (group, then type, then body id) and every body is there once", M.cells.every((x, i) => i === 0 || before(M.cells[i - 1], x)) && new Set(M.cells.map((x) => x.bodyId)).size === 4750);
    ok("!! THE 4,064 KENYON CELLS ARE vendor/male-cns/mushroom-body-circuit.json's, BODY FOR BODY AND IN ITS ORDER -- so the two files join by position", J(kc.map((x) => x.bodyId)) === J(MB.cells.filter((x) => x.group === "KC").map((x) => x.bodyId)));
    const glom = (x) => (x.type.startsWith("M_") || !x.type.includes("_") ? null : x.type.split("_")[0]), uni = pn.filter((x) => x.glomerulus !== null);
    ok("!! A PROJECTION NEURON'S GLOMERULUS IS ITS TYPE BEFORE THE FIRST UNDERSCORE, AND NONE FOR A MULTIGLOMERULAR TYPE (\"M_\"): 348 in 72 glomeruli, 338 multiglomerular; a Kenyon cell has none",
        pn.every((x) => x.glomerulus === glom(x)) && uni.length === 348 && new Set(uni.map((x) => x.glomerulus)).size === 72 && pn.length - uni.length === 338 && kc.every((x) => x.glomerulus === null) && pn.find((x) => x.type === "DA1_lPN").glomerulus === "DA1");
});

console.log("\n2. THE CONNECTIONS");
section(() => {
    const E = M.edges, isPN = (i) => M.cells[i] && M.cells[i].group === "PN", isKC = (i) => M.cells[i] && M.cells[i].group === "KC";
    ok("!! 19,980 CONNECTIONS, EACH [projection neuron, Kenyon cell, synapses] -- never the other way or within a group -- of at least 5 synapses, sorted by pre and then post, every pair once",
        E.length === 19980 && E.every((e) => e.length === 3 && e.every(Number.isInteger) && isPN(e[0]) && isKC(e[1]) && e[2] >= M.minSynapses) && E.every((e, i) => i === 0 || E[i - 1][0] < e[0] || (E[i - 1][0] === e[0] && E[i - 1][1] < e[1])));
    const reach = new Set(E.map((e) => e[0])).size, deg = new Map(); for (const e of E) deg.set(e[1], (deg.get(e[1]) || 0) + 1);
    const d = M.cells.map((x, i) => (x.group === "KC" ? deg.get(i) || 0 : null)).filter((x) => x !== null).sort((a, b) => a - b);
    ok("!! AS THE PROVENANCE SAYS: 271 of the 686 projection neurons reach a Kenyon cell; 3,768 of the 4,064 Kenyon cells are reached, by a median of 5 projection neurons and at most 16", reach === 271 && d.filter((x) => x > 0).length === 3768 && d[2032] === 5 && d[4063] === 16, `${reach} reach`);
});

console.log("\n3. THE TOTALS");
section(() => {
    const T = M.totals, kept = M.edges.reduce((a, e) => a + e[2], 0);
    ok("!! WHAT IS KEPT ADDS UP TO THE CONNECTIONS, AND WHAT IS DROPPED IS SAID: at every weight 22,586 connections carrying 390,928 synapses; kept, the file's 19,980 carrying 385,887 -- 99 percent of the synapses",
        J(Object.keys(T)) === J(["PN>KC"]) && T["PN>KC"].keptConnections === M.edges.length && T["PN>KC"].keptSynapses === kept && T["PN>KC"].connections === 22586 && T["PN>KC"].synapses === 390928 && kept === 385887 && Math.round(100 * kept / 390928) === 99);
});

console.log("\n4. THE PROVENANCE AND THE BAKE");
section(() => {
    const prov = src("vendor/male-cns/PROVENANCE.md"), flat = prov.slice(prov.indexOf("## Circuit: Projection neurons"), prov.indexOf("## Contents")).replace(/\s+/g, " "), tool = src("tools/maleCnsPnKc.py");
    ok("!! THE FILE'S SOURCES ARE THE MUSHROOM BODY'S, TO THE BYTE COUNT AND THE SHA256 -- the same two public release tables the provenance names", J(M.sources) === J(MB.sources) && M.sources.every((s) => prov.includes("`" + s.sha256 + "`") && prov.includes("`" + s.name + "`")));
    ok("!! THE PROVENANCE SAYS WHAT THE FILE HOLDS AND HOW IT WAS GOT, IN ITS OWN SECTION (read alone): the same public tables, no token and not Neuprint; 4,750 cells; 19,980 connections of at least 5 synapses out of 22,586; topology only, one direction; the Kenyon cells in the mushroom body file's order; and the file is in its contents",
        /## Circuit: Projection neurons onto the Kenyon cells \(ALPN > KC\)/.test(prov) && /from the same two public release tables/.test(flat) && /no token and no Neuprint query/.test(flat) && /4,750 cells/.test(flat) && /\*\*the file keeps the 19,980 of at least 5 synapses\*\*/.test(flat) && /22,586 such connections carrying 390,928 synapses/.test(flat) &&
        /Topology only, and only one direction/.test(flat) && /exactly the order `mushroom-body-circuit\.json` has them/.test(flat) && /- `pn-kc-circuit\.json`/.test(prov));
    ok("!! THE BAKE SCRIPT IS THE ONE THE PROVENANCE NAMES AND ITS THRESHOLD IS THE FILE'S: tools/maleCnsPnKc.py, MIN_SYNAPSES = 5, the two groups in the file's order, the dataset's name; it reads only the two paths it is given -- no URL, no network library, no token, no Neuprint query; it keeps projection neuron onto Kenyon cell only",
        /\*\*`tools\/maleCnsPnKc\.py`\*\*/.test(prov) && /^MIN_SYNAPSES = 5$/m.test(tool) && /^GROUPS = \["PN", "KC"\]$/m.test(tool) && /^DATASET = "male-cns:v1\.0"$/m.test(tool) && !/https?:\/\/|urlopen|urllib|requests|socket|http\.client|token|Authorization|neuprint\.janelia/i.test(tool.replace(/^#.*$/gm, "")) &&
        /def main\(ann_path, w_path, out_path\)/.test(tool) && /s = w\[w\.body_pre\.isin\(pns\) & w\.body_post\.isin\(kcs\)\]/.test(tool) && /return "PN" if cls == "ALPN" else "KC" if cls == "Kenyon_Cell" else None/.test(tool));
    const sha = createHash("sha256").update(fs.readFileSync(path.join(ENG, FILE))).digest("hex");
    ok("the file is one line of JSON and a newline, as the bake writes it (a hand edit that re-indents it is seen here), and its sha256 is the bake's", text.endsWith("\n") && text.indexOf("\n") === text.length - 1 && sha === "b885db58c7284b2096a7fcecb6d72d39e0ab9ec65640315ce559023f570af1e7", sha.slice(0, 16));
});

console.log(`\nmaleCnsPnKc-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
