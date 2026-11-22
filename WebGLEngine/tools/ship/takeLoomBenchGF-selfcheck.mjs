// WebGLEngine/tools/ship/takeLoomBenchGF-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeLoomBenchGF-selfcheck.mjs      (a second; nothing on LC4 or LPLC2 is read)
//
// THE SECOND LOOM BENCH'S OWN PARTS, HELD. tools/ship/takeLoomBenchGF.mjs calls tools/ship/takeLoomBench.mjs's arithmetic (held on toy circuits by its own gate); here:
//   1  THE PATHWAYS   LC4 onto DNp04 with no relay, LPLC2 onto DNp01 with PVLP151 as its relay; the ten registered arms; the cut removes exactly PVLP151's outgoing
//                     connections from LPLC2's matrix (a count off the topology, not a reading)
//   2  THE DECISIONS  decide() over hand-written verdicts: the relay rule for LPLC2 (and not judged where LPLC2 tells no side), places and wiring for both types
//   3  ONE READ       with a reading file present the tool refuses, exit 2, and writes nothing
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeLoomBenchGF.mjs";
import * as B from "./takeLoomBench.mjs";
import * as LPT from "../../brain/lplc2Topology.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

console.log("takeLoomBenchGF-selfcheck -- the second loom bench's own parts\n");
console.log("1. THE PATHWAYS");
section(() => {
    const a = G.pathwayFor("lc4"), b = G.pathwayFor("lplc2");
    ok("!! LC4 onto DNp04 with no relay (126 cells, 71 left), LPLC2 onto DNp01 with PVLP151 (185 cells, 94 left)", a.p.dn === "DNp04" && a.relay === null && a.p.eyeL.length + a.p.eyeR.length === 126 && a.p.eyeL.length === 71 && b.p.dn === "DNp01" && b.relay === "PVLP151" && b.p.eyeL.length + b.p.eyeR.length === 185 && b.p.eyeL.length === 94);
    ok("the ten registered arms: both types in both orientations, flat and shuffled 4242, and LPLC2's two relay cuts (LC4 has no relay to cut)", G.ARMS.length === 10 && G.ARMS.filter((x) => x.endsWith(":cut")).join() === "lplc2:medial:cut,lplc2:lateral:cut");
    const M = b.p.matrix(), c = B.cutFrom(M, b.types, "PVLP151"), from = new Set(); LPT.EDGES.forEach(([to, f]) => { if (LPT.NEURON_TYPES[f] === "PVLP151") from.add(`${to},${f}`); });
    ok("!! the cut removes exactly PVLP151's outgoing connections from LPLC2's matrix (a count off the topology, not a reading)", c.cut === from.size && c.cut > 0, `${c.cut}`);
});
console.log("2. THE DECISIONS");
section(() => {
    const V = (tells, side = null) => ({ verdict: { tells, side } }), I = V(true, "ipsilateral"), C = V(true, "contralateral"), N = V(false);
    const d1 = G.decide({ "lc4:medial": I, "lc4:lateral": I, "lc4:flat": I, "lc4:shuffled:4242": N, "lplc2:medial": I, "lplc2:lateral": N, "lplc2:flat": I, "lplc2:shuffled:4242": I, "lplc2:medial:cut": C, "lplc2:lateral:cut": I });
    ok("!! the relay DECIDES where LPLC2 tells a side and its cut arm tells the other; where LPLC2 tells none it is not judged", d1.relay.medial === "DECIDES" && /not judged/.test(d1.relay.lateral));
    const d2 = G.decide({ "lc4:medial": I, "lc4:lateral": I, "lc4:flat": C, "lc4:shuffled:4242": I, "lplc2:medial": I, "lplc2:lateral": I, "lplc2:flat": I, "lplc2:shuffled:4242": N, "lplc2:medial:cut": I, "lplc2:lateral:cut": N });
    ok("!! ...does not decide where the cut tells the same side, DECIDES where it tells none; places and wiring matter only against both orientations agreeing", d2.relay.medial === "does not decide" && d2.relay.lateral === "DECIDES" && d2.record.lc4.places === "MATTER" && d2.record.lc4.wiring === "do not matter" && d2.record.lplc2.wiring === "MATTER" && d1.record.lplc2.places === "not judged");
});
console.log("3. ONE READ");
section(() => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "loombenchgf-")), "r.json"); fs.writeFileSync(tmp, "{}");
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("./takeLoomBenchGF.mjs", import.meta.url))], { env: { ...process.env, LOOM_BENCH_GF_READING: tmp }, encoding: "utf8" });
    ok("!! with a reading file present the tool refuses (exit 2), says so, and leaves the file as it was", r.status === 2 && /second read is refused/.test(r.stderr) && fs.readFileSync(tmp, "utf8") === "{}", `exit ${r.status}`);
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
});
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 5 mutants of tools/ship/takeLoomBenchGF.mjs, each in a hard-linked copy of the tree: ALL 5 RED (LPLC2 given no relay, LC4 read onto the Giant Fiber, the relay
// rule ignoring which side, a second read allowed, the wiring judged against the flat arm).
