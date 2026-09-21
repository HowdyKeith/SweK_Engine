#!/usr/bin/env node
// WebGLEngine/tools/ship/runnerCallers-selfcheck.mjs -- v4654
//
// Run: node tools/ship/runnerCallers-selfcheck.mjs
// RUNTIME: 1,872 ms median of five (1,800 1,841 1,872 1,900 1,921), under the sweep's 3,000 ms
// threshold -- and the first draft was THIRTY-SIX SECONDS, past the 20,000 ms SIGKILL cap. See the
// performance note at the foot of this file.
//
// *** kernelReach.mjs CLOSED THE ARC'S KERNEL CENSUS AT ZERO AND MOVED THE PROBLEM UP ONE LEVEL. ***
//
// A WGSL kernel becomes "reachable" the moment a runner imports it. v4647 gave the temporal arc's last six
// kernels a runner and reported the census at zero; v4648 added a rasteriser the same way. Both rounds were
// right about what they measured and neither asked the next question, which kernelReach's own closing line
// names: "a module imported but never called would still read as reachable".
//
// MEASURED: 15 modules in this tree build and dispatch a compute pipeline. THREE were imported by nothing but
// their own selfcheck, and two of the three were this session's -- v4647's temporalLockGPU and v4648's
// visibilityGPU. Closing a reachability gap by adding a caller that only a gate calls is moving the debt, not
// paying it, and this file is what makes that visible on the round it happens rather than six rounds later.
//
// *** v4654 PAID ONE OF THEM IN THE ROUND THAT ADDED THIS FILE. *** fsr.html now constructs TemporalLockGPU
// and feeds SHADING_SHIFT's output to the reject chain's `shading` input -- an argument that chain has
// accepted since v4594 and that nothing had ever supplied. The census reads 3 -> 2 as a result, which is the
// only way to know a census of this kind can move at all.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runnerCallers, isRunner, importsModule, walkSource, isGate } from "./runnerCallers.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const R = runnerCallers(ENG);

console.log("\n1. THE POPULATION");
say("runners", `${R.runners.length} modules build AND dispatch a compute pipeline`);
say("reach", `${R.gateOnly.length} imported only by a gate, ${R.uncalled.length} imported by nothing at all`);
for (const x of R.gateOnly) say(`  gate-only (gates=${x.gates})`, x.file);
ok("the population is real and not degenerate, which would make every row below vacuous",
   R.runners.length > 8 && R.runners.some((r) => r.production > 0),
   `${R.runners.length} runners, ${R.runners.filter((r) => r.production > 0).length} with a production ` +
   "importer. A census where nothing had a caller would pass a ratchet and mean nothing.");
ok("!! *** the arc's five wired runners are NOT in the gate-only list, so the list is selective ***",
   ["render/temporalGPU.mjs", "render/motionVectorsGPU.mjs", "render/temporalRejectGPU.mjs",
    "render/objectMotionGPU.mjs", "render/temporalLockGPU.mjs"]
       .every((f) => !R.gateOnly.some((g) => g.file === f)),
   "fsr.html imports all five. A census that named every runner would be a list of runners, not a finding.");
ok("!! ...and temporalLockGPU left the list IN THE ROUND THAT ADDED THIS FILE",
   R.runners.some((r) => r.file === "render/temporalLockGPU.mjs" && r.production > 0)
   && R.runners.find((r) => r.file === "render/temporalLockGPU.mjs").by.includes("fsr.html"),
   `imported by ${(R.runners.find((r) => r.file === "render/temporalLockGPU.mjs") || {}).by?.join(", ")}. ` +
   "v4647 shipped it with no caller outside its gate; this round feeds its shading mask to the reject " +
   "chain's `shading` argument, which has been accepted and never supplied since v4594.");

console.log("\n2. THE TWO SOURCE READERS, WHICH ARE OPPOSITE CHOICES AND BOTH DELIBERATE");
// *** PICKING WRONG IN EACH DIRECTION IS HOW THIS SECTION WAS EARNED. *** codeOnly blanks string contents, so
// an import census built on it finds NOTHING -- measured, it called all fifteen gate-only, including the five
// fsr.html plainly imports. noComments keeps them, so a header describing a runner would read as one.
ok("!! *** an import path is a STRING, so the import scan must keep string contents ***",
   importsModule('import { X } from "./render/temporalLockGPU.mjs";', "temporalLockGPU") === true,
   "built on codeOnly this returns false for every import in the tree, because codeOnly blanks exactly the " +
   "text an import path is made of -- sourceScan.mjs's docstring says to use noComments when the thing " +
   "sought is TEXT the code contains, and a module path is a route.");
ok("...and a mention in PROSE is not an import",
   importsModule('// this pairs with ./render/temporalLockGPU.mjs, which owns the ring\nconst a = 1;', "temporalLockGPU") === false,
   "v4637 found kernelReach counting comments as callers; the same predicate one layer up would count a " +
   "header's cross-reference as a dependency");
ok("!! *** a runner is an IDIOM, so the runner test must blank strings ***",
   isRunner('const a = dev.compute({ wgsl: W }); dev.frame(({pass}) => pass.dispatch(a, [1]));') === true
   && isRunner('// a runner calls dev.compute({ wgsl }) and then pass.dispatch(p, groups)\nexport const x = 1;') === false,
   "a file whose HEADER describes what a runner does is not a runner, and a census keyed on the words would " +
   "admit every module in this arc that explains itself");
ok("...and a module that compiles a pipeline but never dispatches one is not a runner either",
   isRunner("const p = dev.compute({ wgsl: W }); export default p;") === false,
   "building a pipeline is not running it; the census is about what the engine can DISPATCH");

console.log("\n3. THE RATCHET");
// Seeded at what was measured, two-sided, the shape kernelReach-selfcheck uses -- and which went red there on
// the same run a round's work landed, which is the behaviour a ratchet is for.
const GATE_ONLY_AT_V4654 = 2;
ok("!! *** no THIRD compute runner arrives with only a gate able to construct it ***",
   R.gateOnly.length <= GATE_ONLY_AT_V4654,
   `${R.gateOnly.length} against a frozen ${GATE_ONLY_AT_V4654}: ${R.gateOnly.map((x) => x.file).join(", ")}. ` +
   "OWED for each: a caller in production, or a note saying why a gate is the only sensible one. " +
   "render/visibilityGPU.mjs's is the honest second case for now -- fsr.html builds its scene analytically " +
   "and derives ids from its own ray cast, so a triangle rasteriser has nothing to rasterise there.");
ok("...and the ratchet is not left behind by real progress",
   R.gateOnly.length >= GATE_ONLY_AT_V4654 - 1,
   `${R.gateOnly.length} against ${GATE_ONLY_AT_V4654}. A ratchet with slack in it is a ratchet holding nothing.`);
ok("!! ...and NOTHING is imported by nobody at all, which is a different and worse debt",
   R.uncalled.length === 0,
   `${R.uncalled.length}. A runner only a gate imports is reachable from a test; one nothing imports is ` +
   "reachable from nowhere, and merging the two would let the second hide inside the first.");

console.log(fails ? `\nrunnerCallers-selfcheck: ${fails} FAILED` : "\nrunnerCallers-selfcheck: ALL GREEN");
console.log("unchecked here: whether an imported runner is ever CONSTRUCTED or DISPATCHED at runtime, which " +
            "is kernelReach's own unchecked line one level further on and is not answerable statically -- " +
            "fsr.html constructs all six inside a try/catch that leaves them null on a device that refuses, " +
            "and a page that imported one and never touched it would read the same here; the CPU-side " +
            "modules, which this census ignores entirely because it is about compute dispatch; and whether " +
            "a production importer is production -- a demo page is not an engine, and fsr.html is a " +
            "measurement instrument that happens not to be a gate.");
//
// SABOTAGE LOG -- applied to tools/ship/runnerCallers.mjs (and once to fsr.html), run, and restored.
//   V1  the import scan reads codeOnly, blanking paths       5 RED
//   V2  the runner test reads raw text, so prose counts      2 RED
//   V3  dispatch no longer required to be a runner           1 RED
//   V4  fsr.html stops importing temporalLockGPU             3 RED -- the repair's own control
//   V5  gates counted as production importers                1 RED
//   V6  the runner pre-filter narrowed to ".compute( {"      3 RED, population 15 -> 0
//   V7  the importer pre-filter narrowed to base + ".mjs"    1 RED
//   V8  the memo keyed on a constant, so one file's text serves all   2 RED
//
// *** PERFORMANCE, BECAUSE IT WAS A CORRECTNESS PROBLEM AT THE SWEEP'S EDGE. *** The first draft called
// noComments once per (runner, file) pair -- fifteen passes over four thousand files -- and ran in 36
// SECONDS, past the 20,000 ms SIGKILL cap and not merely the 3,000 ms budget. A gate the sweep kills reports
// nothing at all, which is worse than a slow one. Three changes, each verified to leave the census identical
// at 15 runners and 2 gate-only: memoise the stripping (36 s -> 6.5 s), pre-filter on a raw substring before
// the expensive readers (-> 3.45 s), and memoise ON TOP of the filter (-> 1.87 s).
//
// THE PRE-FILTERS ARE SOUND AND NOT APPROXIMATE, which is why they are a filter and not a heuristic:
// codeOnly and noComments only ever REMOVE characters, so a file whose raw text lacks ".compute(" cannot
// contain it afterwards, and one whose raw text lacks a basename cannot import it. V6 and V7 narrow each
// filter past soundness and both go red.
//
process.exitCode = fails ? 1 : 0;
