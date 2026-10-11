#!/usr/bin/env node
// WebGLEngine/tools/ship/fsr2Coverage-selfcheck.mjs -- v4672
//
// Run: node tools/ship/fsr2Coverage-selfcheck.mjs
// RUNTIME: recorded at the foot of this file.
//
// *** "FSR2 IS COMPLETE" HAS BEEN A SENTENCE IN COMMIT MESSAGES AND NOWHERE ELSE. ***
//
// Fifteen rounds added passes and the only account of what remained was prose in a closing line. This
// grades tools/ship/fsr2Coverage.mjs, whose table maps FSR2's dispatches onto this tree's modules.
//
// *** THE MAPPING ITSELF IS A DECLARATION AND THIS GATE DOES NOT PRETEND OTHERWISE. *** That
// render/temporalReject.mjs "is" ffx_fsr2_depth_clip is a judgement about two pieces of software; a tool
// inferring it from file names would invent a correspondence and report it as a measurement. What IS
// derived, and what every row below holds, is that the named files exist, that the page really imports the
// ones called wired, and that the summary counts are the rows counted -- so the table can be wrong about
// what a pass MEANS and cannot be wrong about what this tree HAS.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { coverage, PASSES, CALLER, ENG } from "./fsr2Coverage.mjs";
import { runnerCallers } from "./runnerCallers.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// *** FROZEN AT WHAT WAS MEASURED. *** Two-sided, the shape kernelReach and runnerCallers use: a pass
// arriving without a caller moves this, and so does one quietly disappearing.
const WIRED_AT_V4672 = 10, GATE_ONLY_AT_V4672 = 1, MISSING_AT_V4672 = 3;

const C = coverage();
console.log("fsr2Coverage-selfcheck -- which of FSR2's passes this tree has, and which of them anything runs\n");

console.log("1. THE TABLE, AND WHETHER IT DESCRIBES THIS TREE");
for (const r of C.rows)
    say(`  ${r.status === "wired" ? "wired    " : r.status === "gate-only" ? "GATE-ONLY" : "MISSING  "}`, r.pass);
say("summary", `${C.wired} wired, ${C.gateOnly} gate-only, ${C.missing} missing, of ${C.total}`);
ok("!! *** every row names files that EXIST, which is how this table stops being a lie for free ***",
   C.brokenRows.length === 0,
   C.brokenRows.length ? C.brokenRows.map((r) => `${r.pass}: ${r.missingFiles.join(", ")}`).join(" | ")
       : `${PASSES.reduce((n, p) => n + p.files.length, 0)} files named across ${C.total} passes, all present. ` +
         "A row naming a module that was renamed or never written is the cheapest way for a coverage " +
         "table to drift into fiction, and nothing else in this tree would have noticed.");
ok("!! ...and every pass called WIRED is really imported by the page, checked against the page's source",
   (() => { const src = fs.readFileSync(path.join(ENG, CALLER), "utf8");
            return C.rows.filter((r) => r.status === "wired")
                         .every((r) => r.files.some((f) => src.includes(`"./${f}"`))); })(),
   `${CALLER} is the only caller the arc has. "Built, gated and correct" and "runs" are different claims, ` +
   "and this arc has shipped passes that were the first without being the second.");
ok("!! ...and the counts ARE the rows counted, so a hand-edited summary cannot drift from its own table",
   C.wired + C.gateOnly + C.missing === C.total &&
   C.wired === C.rows.filter((r) => r.status === "wired").length &&
   C.missing === C.rows.filter((r) => r.status === "MISSING").length,
   "nothing in that module reports a number a reader cannot recompute from the table beside it");

console.log("\n2. THE RATCHET");
ok("!! *** the coverage is what it was measured at: 10 wired, 1 gate-only, 3 missing ***",
   C.wired === WIRED_AT_V4672 && C.gateOnly === GATE_ONLY_AT_V4672 && C.missing === MISSING_AT_V4672,
   `${C.wired}/${C.gateOnly}/${C.missing} against a frozen ${WIRED_AT_V4672}/${GATE_ONLY_AT_V4672}/` +
   `${MISSING_AT_V4672}. Two-sided on purpose: a pass losing its caller moves this and so does one being ` +
   "added, and the round that moves it says which in its closing.");
// *** TWO CENSUSES, WRITTEN SEPARATELY, ABOUT THE SAME FILE. ***
const gateOnlyRows = C.rows.filter((r) => r.status === "gate-only");
// runnerCallers walks the tree itself; it is given the same root this census uses so the two
// are looking at one thing and not at two snapshots.
const runnerGateOnly = runnerCallers(ENG).gateOnly.map((x) => x.file);
say("  the gate-only pass", gateOnlyRows.map((r) => r.pass).join(", ") || "(none)");
say("  runnerCallers' gate-only runners", runnerGateOnly.join(", "));
ok("!! *** the one gate-only pass is the one runnerCallers independently calls gate-only ***",
   gateOnlyRows.length === 1 &&
   gateOnlyRows[0].files.some((f) => runnerGateOnly.includes(f)),
   "two censuses written in different rounds for different questions -- one walks FSR2's pipeline, the " +
   "other walks compute runners and their importers -- agreeing about render/luminancePyramidGPU.mjs. " +
   "Neither is derived from the other, which is the only reason the agreement is worth anything. v4668 " +
   "widened runnerCallers' ratchet for exactly this file, with the reason recorded there.");

console.log("\n3. WHAT IS ACTUALLY LEFT, WHICH IS THE POINT OF COUNTING");
for (const r of C.rows.filter((x) => x.status === "MISSING")) say(`  ${r.pass}`, r.note || "(no note)");
ok("!! *** every MISSING pass carries a note saying what is absent, not just an empty list ***",
   C.rows.filter((r) => r.status === "MISSING").every((r) => typeof r.note === "string" && r.note.length > 40),
   "an empty array is a fact about this table; a reader needs the fact about the SOFTWARE. Two of these " +
   "are capability gaps and one is an optimisation, and a count that did not distinguish them would " +
   "report this tree as further from FSR2 than it is.");
ok("  ...and the optimisation is named as one rather than counted as a capability",
   C.rows.some((r) => r.status === "MISSING" && /optimisation, not a capability/.test(r.note || "")),
   "single-pass SPD computes the same numbers luminancePyramidGPU already computes, one dispatch per mip " +
   "instead of one in total. Listing it keeps the table honest about not being a like-for-like port; " +
   "counting it as a missing FEATURE would be the opposite kind of dishonesty.");

console.log(fails ? `\nfsr2Coverage-selfcheck: ${fails} FAILED` : "\nfsr2Coverage-selfcheck: ALL GREEN");
console.log("unchecked here: whether each mapping is CORRECT -- that this tree's temporalReject really is " +
            "what ffx_fsr2_depth_clip does is a judgement about two pieces of software and no census can " +
            "make it, which is why PASSES is hand-written and labelled as the part to distrust; whether a " +
            "wired pass is wired CORRECTLY, which is every other gate in this arc; and FSR3, none of whose " +
            "passes appear here at all -- its frame interpolation is a different pipeline and would need " +
            "its own table rather than rows appended to this one.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   V1  a row names a module that does not exist            1 RED.
//   V2  the page stops importing a pass called wired        2 RED -- including the cross-census row, because
//       the pass falls out of `wired` and into `gate-only` and the two censuses then disagree.
//   V3  a MISSING pass loses its note                       1 RED.
//   V4  a pass silently dropped from the table              1 RED, the ratchet.
//   V5  the summary counts hand-written instead of derived   2 RED.
// Five mutations, five caught, no 0-RED. V2 is the one worth reading: it moves a pass from wired to
// gate-only WITHOUT changing the table, which is the failure this whole file exists for -- a coverage
// document that keeps claiming a pass runs after the only thing running it stopped.
//
// RUNTIME: 2,009 ms median of five (1,905 2,003 2,009 2,036 2,081). Inside the quick sweep's 3,000 ms,
// and nearly all of it is runnerCallers' own tree walk, which this gate calls to get a SECOND opinion
// about the gate-only runner rather than deriving one from its own table.
//
process.exitCode = fails ? 1 : 0;
