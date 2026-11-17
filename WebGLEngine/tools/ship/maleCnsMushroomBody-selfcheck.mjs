// WebGLEngine/tools/ship/maleCnsMushroomBody-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/maleCnsMushroomBody-selfcheck.mjs      (a second; it reads one file and two texts, and starts no process)
//
// THE GATE OF THE MUSHROOM BODY'S DATA (backlog `fly-mushroom-body-data`): vendor/male-cns/mushroom-body-circuit.json, baked by tools/maleCnsMushroomBody.py from the public male-cns v1.0 release
// tables (no token; vendor/male-cns/PROVENANCE.md says which, with their sizes and sha256). The tables are half a gigabyte and are not in the repo, so this gate cannot re-bake the file; it holds
// the file to ITSELF -- every connection is between two of its cells and is at least the threshold, and the totals it carries for every pair of groups add up to its connections -- and to what the
// provenance and the bake script say.
//   1  THE CELLS        the five groups and their counts; sorted as the bake sorts; every body once
//   2  THE CONNECTIONS  indices in range, at least 5 synapses, sorted, every pair once; the one connection of a cell onto itself
//   3  THE TOTALS       what is kept adds up to the connections, group pair by group pair; what is dropped is said; the shares the provenance quotes
//   4  THE PROVENANCE AND THE BAKE   the same sources, threshold and counts in the file, the provenance and the script; no token anywhere
// SABOTAGE LOG (2026-11-17) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate run whole for each; every one red by name, none 0 red:
//   THE FILE: D1 the threshold said to be 3 1 | D2 a connection weakened under the threshold 2 | D3 two connections out of order 1 | D4 the KC-to-MBON totals do not add up 2
//   D5 a Kenyon cell becomes an output neuron 3 | D6 a source's sha256 changed 1 | D7 the dataset is another version 1 | D8 the dropped synapses not counted 2
//   THE PROVENANCE: P1 it says Neuprint 1 | P2 it gives another count 1 | P3 it hides the licence gap 1 | P4 the file is not in its contents 1
//   THE BAKE (tools/maleCnsMushroomBody.py): T1 it keeps 3 synapses 1 | T2 it fetches over the network 1 | T3 its groups in another order 1
//   Two rows of mine were wrong when written and were corrected to the data: the one connection of a cell onto itself is the right APL neuron's (14 synapses), not a Kenyon cell's; and a
//   phrase of the provenance was matched with the wrong capital.
//   2026-11-17, LATER: the bake row's network words missed urllib (found by the ring neurons' gate, tools/ship/maleCnsCompassRing-selfcheck.mjs, whose sabotage T2 went 0 red on the same words);
//   they now name urllib, socket and http.client, and the bake given `import urllib.request` goes red here: 1.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-4) => Math.abs(a - b) < e;
const FILE = "vendor/male-cns/mushroom-body-circuit.json", text = src(FILE), M = JSON.parse(text), GROUPS = ["KC", "MBON", "DAN", "APL", "DPM"];

console.log("maleCnsMushroomBody-selfcheck -- the mushroom body's data: the cells, the connections, the totals, the provenance and the bake\n");

console.log("1. THE CELLS");
section(() => {
    const count = (f) => { const c = {}; for (const x of M.cells) { const k = f(x); c[k] = (c[k] || 0) + 1; } return c; }, g = count((x) => x.group), side = count((x) => x.side);
    ok("!! THE FILE IS WHAT IT SAYS: the male-cns v1.0 dataset's mushroom body, topology only, at a threshold of 5 synapses, from the public release tables; its groups are KC, MBON, DAN, APL and DPM in that order",
        M.format === "swek-connectome-topology-v1" && M.circuit === "mushroom body" && M.dataset === "male-cns:v1.0" && M.minSynapses === 5 && J(M.groups) === J(GROUPS) && /gs:\/\/flyem-male-cns\/v1\.0\/connectome-data\/flat-connectome\//.test(M.source) && !("xyz" in (M.cells[0] || {})));
    ok("!! 4,505 CELLS: 4,064 Kenyon cells, 97 output neurons, 340 dopamine neurons, 2 APL and 2 DPM; 2,266 with the soma on the right and 2,239 on the left; every cell a body id, a type, an instance and a side",
        M.cells.length === 4505 && J(g) === J({ KC: 4064, MBON: 97, DAN: 340, APL: 2, DPM: 2 }) && J(side) === J({ R: 2266, L: 2239 }) && M.cells.every((x) => Number.isSafeInteger(x.bodyId) && x.bodyId > 0 && typeof x.type === "string" && typeof x.instance === "string" && (x.side === "L" || x.side === "R")), J(g));
    const kcTypes = count((x) => (x.group === "KC" ? x.type : "-")), dan = M.cells.filter((x) => x.group === "DAN"), pam = dan.filter((x) => /^PAM/.test(x.type)).length, ppl1 = dan.filter((x) => /^PPL1/.test(x.type)).length;
    ok("the Kenyon cells' types are the annotation's (KCg-m 1,342, KCab-s 657, KCab-m 536, KCab-c 488, KCa'b'-ap2 291, ...); the dopamine neurons are 316 PAM, 16 PPL1 and 8 others; the APL and DPM cells are typed so",
        kcTypes["KCg-m"] === 1342 && kcTypes["KCab-s"] === 657 && kcTypes["KCab-m"] === 536 && kcTypes["KCab-c"] === 488 && kcTypes["KCa'b'-ap2"] === 291 && pam === 316 && ppl1 === 16 && dan.length - pam - ppl1 === 8 && M.cells.filter((x) => x.group === "APL").every((x) => x.type === "APL") && M.cells.filter((x) => x.group === "DPM").every((x) => x.type === "DPM"));
    const key = (x) => [GROUPS.indexOf(x.group), x.type, x.bodyId], before = (a, b) => { const p = key(a), q = key(b); return p[0] !== q[0] ? p[0] < q[0] : p[1] !== q[1] ? p[1] < q[1] : p[2] < q[2]; };
    ok("!! the cells are sorted as the bake sorts (group, then type, then body id) and every body is there once -- so an edge's indices mean the same cells on every bake", M.cells.every((x, i) => i === 0 || before(M.cells[i - 1], x)) && new Set(M.cells.map((x) => x.bodyId)).size === 4505);
});

console.log("\n2. THE CONNECTIONS");
section(() => {
    const E = M.edges, n = M.cells.length;
    ok("!! 101,392 CONNECTIONS, EACH [pre, post, synapses] BETWEEN TWO OF THE FILE'S CELLS AND OF AT LEAST 5 SYNAPSES, sorted by pre and then post, every ordered pair once", E.length === 101392 && E.every((e) => e.length === 3 && e.every(Number.isInteger) && e[0] >= 0 && e[0] < n && e[1] >= 0 && e[1] < n && e[2] >= M.minSynapses) &&
        E.every((e, i) => i === 0 || E[i - 1][0] < e[0] || (E[i - 1][0] === e[0] && E[i - 1][1] < e[1])));
    const self = E.filter((e) => e[0] === e[1]);
    ok("one connection is a cell onto itself, and it is the table's, kept as it is: the right APL neuron, 14 synapses onto itself (the APL is one great cell a side whose arbours meet)", self.length === 1 && M.cells[self[0][0]].group === "APL" && M.cells[self[0][0]].instance === "APL_R" && self[0][2] === 14, J(self));
    const strongest = E.reduce((a, e) => (e[2] > a[2] ? e : a));
    ok("the strongest connection is 1,878 synapses, and it is of the APL or DPM loop onto or from the Kenyon cells' partners -- a feedback cell's, not a single Kenyon cell's", strongest[2] === 1878 && [M.cells[strongest[0]].group, M.cells[strongest[1]].group].some((g) => g === "APL" || g === "DPM" || g === "MBON" || g === "DAN"), `${M.cells[strongest[0]].group} > ${M.cells[strongest[1]].group}`);
});

console.log("\n3. THE TOTALS");
section(() => {
    const T = M.totals, by = {}; for (const [p, q, s] of M.edges) { const k = M.cells[p].group + ">" + M.cells[q].group; by[k] = by[k] || { c: 0, s: 0 }; by[k].c++; by[k].s += s; }
    const bad = Object.keys(T).filter((k) => !(by[k] ? by[k].c === T[k].keptConnections && by[k].s === T[k].keptSynapses : T[k].keptConnections === 0 && T[k].keptSynapses === 0) || T[k].keptConnections > T[k].connections || T[k].keptSynapses > T[k].synapses);
    ok("!! *** WHAT IS KEPT ADDS UP TO THE CONNECTIONS, GROUP PAIR BY GROUP PAIR *** -- for each of the 25 pairs of groups the file's kept connections and synapses are the sum of its edges, and never more than the pair's totals at every weight; no edge is of a pair the totals do not name",
        Object.keys(T).length === 25 && bad.length === 0 && Object.keys(by).every((k) => k in T), bad.join(", "));
    const sum = Object.values(T).reduce((a, t) => [a[0] + t.connections, a[1] + t.synapses, a[2] + t.keptConnections, a[3] + t.keptSynapses], [0, 0, 0, 0]);
    ok("!! AND WHAT IS DROPPED IS SAID: at every weight there are 1,018,725 connections carrying 2,794,887 synapses; the file keeps 101,392 carrying 1,349,913 -- 10 percent of the connections and 48 percent of the synapses", J(sum) === J([1018725, 2794887, 101392, 1349913]), J(sum));
    const share = (k) => T[k].keptSynapses / T[k].synapses;
    ok("!! THE SHARES THE PROVENANCE QUOTES ARE THE FILE'S: kept, 87 percent of KC-to-MBON synapses, 92 percent of DAN-to-MBON, over 99 percent of KC-to-APL, APL-to-KC and KC-to-DPM; and only 16 to 22 percent of DAN-to-KC, KC-to-DAN and KC-to-KC",
        near(share("KC>MBON"), 0.869) && near(share("DAN>MBON"), 0.921) && ["KC>APL", "APL>KC", "KC>DPM"].every((k) => share(k) > 0.99) && near(share("DAN>KC"), 0.161) && near(share("KC>DAN"), 0.220) && near(share("KC>KC"), 0.184),
        ["KC>MBON", "DAN>MBON", "DAN>KC", "KC>DAN", "KC>KC"].map((k) => `${k} ${share(k).toFixed(3)}`).join(", "));
});

console.log("\n4. THE PROVENANCE AND THE BAKE");
section(() => {
    const prov = src("vendor/male-cns/PROVENANCE.md"), flat = prov.replace(/\s+/g, " "), tool = src("tools/maleCnsMushroomBody.py");
    ok("!! THE FILE'S SOURCES ARE THE PROVENANCE'S, TO THE BYTE COUNT AND THE SHA256: the annotation table (14,483,314 bytes) and the traced connection table (508,025,642 bytes) of the v1.0 release",
        M.sources.length === 2 && M.sources[0].name === "body-annotations-male-cns-v1.0-minconf-0.5.feather" && M.sources[0].bytes === 14483314 && M.sources[1].name === "connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather" && M.sources[1].bytes === 508025642 &&
        M.sources.every((s) => /^[0-9a-f]{64}$/.test(s.sha256) && prov.includes("`" + s.sha256 + "`") && prov.includes("`" + s.name + "`")) && /\| `body-annotations-male-cns-v1\.0-minconf-0\.5\.feather` \| 14,483,314 \|/.test(prov) && /\| `connectome-weights-male-cns-v1\.0-minconf-0\.5-traced-only\.feather` \| 508,025,642 \|/.test(prov));
    ok("!! THE PROVENANCE SAYS WHAT THE FILE HOLDS AND HOW IT WAS GOT: its own section; the public bucket, no token and not Neuprint; 4,505 cells; 101,392 connections of at least 5 synapses out of 1,018,725; topology only; the licence as recorded for the dataset, and that the bucket states none; and the file is in its contents",
        /## Circuit: Mushroom Body \(MB\)/.test(prov) && /\*\*This file was NOT fetched the way the two above were\.\*\*/.test(flat) && /public release bucket/.test(flat) && /no token/.test(flat) && /4,505 cells/.test(flat) && /\*\*the file keeps the 101,392 of at least 5 synapses\*\*/.test(flat) && /1,018,725 connections carrying 2,794,887 synapses/.test(flat) &&
        /Topology only: no skeletons, no coordinates/.test(flat) && /the bucket's README states none/.test(flat) && /- `mushroom-body-circuit\.json`/.test(prov));
    ok("!! THE BAKE SCRIPT IS THE ONE THE PROVENANCE NAMES AND ITS THRESHOLD IS THE FILE'S: tools/maleCnsMushroomBody.py, MIN_SYNAPSES = 5, the five groups in the file's order, the dataset's name; it reads only the two paths it is given -- no URL, no token, no Neuprint query",
        /`tools\/maleCnsMushroomBody\.py`/.test(prov) && /^MIN_SYNAPSES = 5$/m.test(tool) && /^GROUPS = \["KC", "MBON", "DAN", "APL", "DPM"\]$/m.test(tool) && /^DATASET = "male-cns:v1\.0"$/m.test(tool) && !/https?:\/\/|urlopen|urllib|requests|socket|http\.client|token|Authorization|neuprint\.janelia/i.test(tool.replace(/^#.*$/gm, "")) && /def main\(ann_path, w_path, out_path\)/.test(tool));
    const sha = createHash("sha256").update(fs.readFileSync(path.join(ENG, FILE))).digest("hex");
    ok("the file is one line of JSON and a newline, as the bake writes it (a hand edit that re-indents it is seen here)", text.endsWith("\n") && text.indexOf("\n") === text.length - 1 && /^[0-9a-f]{64}$/.test(sha), sha.slice(0, 16));
});

console.log(`\nmaleCnsMushroomBody-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
