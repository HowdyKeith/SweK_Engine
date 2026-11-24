// WebGLEngine/tools/ship/takeLoomBench-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeLoomBench-selfcheck.mjs      (a second)
//
// THE LOOM BENCH'S ARITHMETIC, HELD ON TOY CIRCUITS -- never on LC6 or LC16, whose readings are taken once, by tools/ship/takeLoomBench.mjs, after its registration.
//
//   1  THE INDEX AND THE SIDE (and the shuffled arm is the shuffle)  a toy whose eyes feed only their own side's descending neuron reads ipsilateral (+1 at every bearing); one wired across, contralateral
//                               (-1); one feeding both alike, no side (0); e > 0 is the fly's LEFT, as brain/flyTracking.mjs drives it
//   2  THE VERDICT              |index| >= 0.1 at every judged bearing (30 to 90), one sign; 15 degrees is not judged; a mixed or a weak row tells no side
//   3  THE RELAY CUT            cutFrom removes every connection FROM the relay and nothing else (on the toy, and on LC6's matrix by count -- a structural fact, no
//                               reading); a toy whose crossing relay outweighs its direct route reads contralateral, and ipsilateral with the relay cut: "DECIDES"
//   4  THE DECISIONS            decide() over hand-written verdicts: the relay rule, and places and wiring "matter" only when both orientations agree and the control does not
//   5  ONE READ                 with a reading file present the tool refuses, exit 2, and writes nothing
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";
import * as B from "./takeLoomBench.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

/** A toy circuit: cells [type, soma, place], connections [from, to, count]. */
function toy(cells, edges) {
    const topo = { NEURON_ORDER: cells.map((_, i) => 1000 + i), NEURON_TYPES: cells.map((c) => c[0]), EDGES: edges.map(([f, t]) => [t, f]) };
    const syn = { EDGE_COUNTS: edges.map((e) => e[2]), NEURON_NT: cells.map(() => "acetylcholine"), NEURON_SOMA: cells.map((c) => c[1]) }, places = { ACROSS: cells.map((c) => c[2] ?? -1) };
    return { p: FT.pathwayOf({ topo, syn, places, eye: "E", dn: "D" }), types: topo.NEURON_TYPES, relay: "X" };
}
const EYES = [["E", "L", 0.6], ["E", "L", 0.85], ["E", "R", 0.6], ["E", "R", 0.85]], DN = [["D", "L"], ["D", "R"]];   // cells 0-1 left eye, 2-3 right, 4 D left, 5 D right
const ipsiToy = toy([...EYES, ...DN], [[0, 4, 10], [1, 4, 10], [2, 5, 10], [3, 5, 10]]);
const ipsiToyLat = toy([["E", "L", 0.15], ["E", "L", 0.4], ["E", "R", 0.15], ["E", "R", 0.4], ...DN], [[0, 4, 10], [1, 4, 10], [2, 5, 10], [3, 5, 10]]);   // its cells at the lateral end, for the lateral orientation
const contraToy = toy([...EYES, ...DN], [[0, 5, 10], [1, 5, 10], [2, 4, 10], [3, 4, 10]]);
const noneToy = toy([...EYES, ...DN], [[0, 4, 10], [0, 5, 10], [1, 4, 10], [1, 5, 10], [2, 4, 10], [2, 5, 10], [3, 4, 10], [3, 5, 10]]);
// a relay a side (6 X left, 7 X right) taking the eye's output and crossing; the direct route small
const relayToy = toy([...EYES, ...DN, ["X", "L"], ["X", "R"]], [[0, 4, 20], [1, 4, 20], [2, 5, 20], [3, 5, 20], [0, 6, 50], [1, 6, 50], [2, 7, 50], [3, 7, 50], [6, 5, 100], [7, 4, 100]]);
const rowOf = (T, arm = "x:medial") => B.armOf(T.p, T.types, arm, T.relay);

console.log("takeLoomBench-selfcheck -- the loom bench's arithmetic, on toy circuits\n");

console.log("1. THE INDEX AND THE SIDE");
await section(() => {
    const a = rowOf(ipsiToy), b = rowOf(contraToy), c = rowOf(noneToy);
    ok("!! eyes feeding only their own side's descending neuron read IPSILATERAL, wired across CONTRALATERAL (past 0.1 either way, mirror images of each other: the constant drive on both descending neurons dilutes it), feeding both alike NO SIDE -- at every bearing; and the lateral orientation reads cells at the lateral end, the medial does not", B.JUDGED.every((d) => a.row[d] >= 0.1 && b.row[d] <= -0.1 && Math.abs(a.row[d] + b.row[d]) < 1e-12 && Math.abs(c.row[d]) < 1e-12) && a.verdict.side === "ipsilateral" && b.verdict.side === "contralateral" && !c.verdict.tells && rowOf(ipsiToyLat, "x:lateral").verdict.side === "ipsilateral" && !rowOf(ipsiToyLat, "x:medial").verdict.tells, JSON.stringify([a.row, b.row]));
    const e = Math.PI / 3, h = ipsiToy.p.circuit(ipsiToy.p.matrix()).cells(e);
    ok("!! e > 0 IS THE FLY'S LEFT: a loom at +60 degrees drives the left eye and the left descending neuron of the ipsilateral toy more", h[0] + h[1] > h[2] + h[3] && h[ipsiToy.p.dnL] > h[ipsiToy.p.dnR]);
    ok("!! the index is (L - R)(e) less (L - R)(-e), over all four activities", (() => { const c2 = contraToy.p.circuit(contraToy.p.matrix()), A = c2.cells(e), Bb = c2.cells(-e), L = contraToy.p.dnL, R = contraToy.p.dnR; return Math.abs(B.ipsiAt(contraToy.p, c2, 60) - ((A[L] - A[R]) - (Bb[L] - Bb[R])) / (A[L] + A[R] + Bb[L] + Bb[R])) < 1e-12; })());
});

await section(() => {
    const plain = rowOf(ipsiToy).row[60], seeds = Array.from({ length: 20 }, (_, k) => k + 1), got = seeds.map((sd) => rowOf(ipsiToy, `x:shuffled:${sd}`).row[60]);
    const direct = seeds.map((sd) => B.ipsiAt(ipsiToy.p, ipsiToy.p.circuit(ipsiToy.p.matrix(ipsiToy.p.retarget(sd)), { front: 1 }), 60));
    ok("!! the shuffled arm IS the shuffle: for every seed its index is the circuit over the retargeted matrix's, and some seeds' shuffles move the toy's side", got.every((v, k) => v === direct[k]) && got.some((v) => v !== plain), `${got.filter((v) => v !== plain).length} of 20 seeds move it`);
});

console.log("2. THE VERDICT");
await section(() => {
    const row = (v) => Object.fromEntries(B.BEARINGS.map((d, k) => [d, v[k]]));
    ok("!! one sign at or past 0.1 at every bearing from 30 to 90 tells the side; 15 degrees is not judged", B.verdictOf(row([0.01, 0.1, 0.3, 0.4, 0.2, 0.15])).side === "ipsilateral" && B.verdictOf(row([0, -0.2, -0.1, -0.5, -0.3, -0.12])).side === "contralateral");
    ok("!! a mixed row, or one under 0.1 anywhere from 30 to 90, tells no side", !B.verdictOf(row([0.5, 0.5, 0.5, -0.5, 0.5, 0.5])).tells && !B.verdictOf(row([0.5, 0.5, 0.5, 0.5, 0.099, 0.5])).tells && B.verdictOf(row([0.5, 0.5, 0.5, 0.5, 0.099, 0.5])).side === null);
});

console.log("3. THE RELAY CUT");
await section(async () => {
    const M = relayToy.p.matrix(), r = B.cutFrom(M, relayToy.types, "X");
    ok("!! cutFrom removes every connection FROM the relay (two here) and leaves every other weight as it was", r.cut === 2 && Array.from(M.val).every((v, t) => (relayToy.types[M.src[t]] === "X" ? r.M.val[t] === 0 : r.M.val[t] === v)));
    const whole = rowOf(relayToy), cut = rowOf(relayToy, "x:medial:cut");
    ok("!! A CROSSING RELAY THAT OUTWEIGHS THE DIRECT ROUTE reads contralateral, and with the relay cut ipsilateral: the relay decides", whole.verdict.side === "contralateral" && cut.verdict.side === "ipsilateral" && cut.cut === 2, JSON.stringify([whole.row, cut.row]));
    const L6 = await B.pathwayFor("lc6"), M6 = L6.p.matrix(), c6 = B.cutFrom(M6, L6.types, "PVLP151"), T6 = await import("../../brain/lc6Topology.mjs");
    const fromRelay = new Set(); T6.EDGES.forEach(([to, from]) => { if (T6.NEURON_TYPES[from] === "PVLP151") fromRelay.add(`${to},${from}`); });
    ok("!! on LC6's own matrix the cut removes exactly PVLP151's outgoing connections (a count from the topology, not a reading)", c6.cut === fromRelay.size && c6.cut > 0, `${c6.cut} connections`);
});

console.log("4. THE DECISIONS");
await section(() => {
    const V = (tells, side = null) => ({ verdict: { tells, side } }), base = { "lc16:medial": V(true, "ipsilateral"), "lc16:lateral": V(true, "ipsilateral"), "lc16:flat": V(true, "ipsilateral"), "lc16:shuffled:4242": V(false) };
    const d1 = B.decide({ ...base, "lc6:medial": V(true, "contralateral"), "lc6:lateral": V(false), "lc6:flat": V(true, "contralateral"), "lc6:shuffled:4242": V(true, "contralateral"), "lc6:medial:cut": V(true, "ipsilateral"), "lc6:lateral:cut": V(true, "ipsilateral") });
    ok("!! the relay DECIDES where LC6 tells a side and the cut arm tells the other (or none); where LC6 tells none it is not judged", d1.relay.medial === "DECIDES" && /not judged/.test(d1.relay.lateral));
    const d2 = B.decide({ ...base, "lc6:medial": V(true, "ipsilateral"), "lc6:lateral": V(true, "ipsilateral"), "lc6:flat": V(true, "ipsilateral"), "lc6:shuffled:4242": V(true, "ipsilateral"), "lc6:medial:cut": V(true, "ipsilateral"), "lc6:lateral:cut": V(false) });
    ok("!! ...and does not decide where the cut arm tells the same side; a cut arm telling none DECIDES", d2.relay.medial === "does not decide" && d2.relay.lateral === "DECIDES");
    ok("!! places and wiring MATTER only when both orientations tell one side and the control does not; LC6 split across orientations is not judged", d2.record.lc16.places === "do not matter" && d2.record.lc16.wiring === "MATTER" && d2.record.lc6.places === "do not matter" && d1.record.lc6.places === "not judged");
});

console.log("5. ONE READ");
await section(() => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "loombench-")), "reading.json"); fs.writeFileSync(tmp, "{}");
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("./takeLoomBench.mjs", import.meta.url))], { env: { ...process.env, LOOM_BENCH_READING: tmp }, encoding: "utf8" });
    ok("!! with a reading file present the tool refuses (exit 2), says so, and leaves the file as it was", r.status === 2 && /second read is refused/.test(r.stderr) && fs.readFileSync(tmp, "utf8") === "{}", `exit ${r.status}`);
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeLoomBench.mjs held by its gate (it found these 5 unnamed at the ship):
{
    const EXPORTS = await import("./takeLoomBench.mjs");
    const NAMED = ["ARMS", "PATHWAYS", "READING", "SHUFFLE_SEED", "THRESHOLD"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 9 mutants of tools/ship/takeLoomBench.mjs, each in a hard-linked copy of the tree: ALL 9 RED (the index's sign flipped, the threshold not on the
// magnitude, 15 degrees judged, the cut removing the relay's inputs instead of its outputs, the cut arm not cut, lateral flown as medial, the relay rule ignoring which
// side, a second read allowed, the shuffle not shuffled -- the last GREEN at first: no toy was shuffled; one is now, over 20 seeds).
