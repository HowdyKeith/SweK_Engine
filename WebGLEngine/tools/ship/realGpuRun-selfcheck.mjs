#!/usr/bin/env node
// WebGLEngine/tools/ship/realGpuRun-selfcheck.mjs -- v4764
//
// tools/ship/realGpuRun.mjs, held to what docs/real-hardware-fsr.md says it does: it runs EVERY FSR and frame-generation gate
// (a gate added under fx/fsr/ or as a render/*Tsl* gate is in the run without anyone listing it), it sorts each into exact,
// quality or timing by the rule the doc states, it reads the tree's row format, and a run records the adapter each gate ran on
// -- and says, first and loudly, when that adapter is software. On this box it is: SwiftShader, and the row that says so is
// the one a real-hardware run turns around. SWEK_LAUNCH_ARGS reaches the browser, as the doc tells a Linux GPU owner to use it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gateList, categorize, parseRows, verdict, runGates } from "./realGpuRun.mjs";
import { webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

console.log("\n1. WHAT THE RUN COVERS, AND HOW IT SORTS IT");
const gates = gateList(ENG);
const fsr = fs.readdirSync(path.join(ENG, "fx/fsr")).filter((f) => f.endsWith("-selfcheck.mjs")).length;
const tsl = fs.readdirSync(path.join(ENG, "render")).filter((f) => /Tsl.*-selfcheck\.mjs$/.test(f)).length;
ok(`every fx/fsr gate (${fsr}), every render/*Tsl* gate (${tsl}) and the translucent layer's: ${gates.length} gates`,
   gates.length === fsr + tsl + 1 && gates.includes("render/translucentLayer-selfcheck.mjs") && gates.includes("render/temporalTslCompute-selfcheck.mjs"));
const kinds = Object.fromEntries(gates.map((g) => [g, categorize(fs.readFileSync(path.join(ENG, g), "utf8"))]));
const of = (k) => gates.filter((g) => kinds[g] === k);
ok(`sorted by the doc's rule -- a clock read is timing, a dB grade quality, the rest exact: timing ${of("timing").length} (${of("timing").map((g) => path.basename(g, "-selfcheck.mjs")).join(", ")}), quality ${of("quality").length}, exact ${of("exact").length}`,
   kinds["fx/fsr/fsr3LiveClock-selfcheck.mjs"] === "timing" && kinds["fx/fsr/fsrFlowCost-selfcheck.mjs"] === "timing" && kinds["fx/fsr/fsrFrameGen-selfcheck.mjs"] === "quality" &&
   kinds["render/opticalFlowTsl-selfcheck.mjs"] === "exact" && kinds["render/temporalTslZoo-selfcheck.mjs"] === "exact");
ok("  ...and the rule on text: a clock is timing even beside dB, dB is quality, neither is exact",
   categorize("const t = performance.now(); // 3 dB") === "timing" && categorize("Math.log10(1 / mse)") === "quality" && categorize("same vector at every block") === "exact");
const rows = parseRows("\n1. X\n  PASS  a\n  FAIL  *** b wrong ***   detail\n  ----  belt8: 12.3 dB\n\nFAIL -- 1 check(s)\n");
ok(`the tree's row format read: a failing row and not the summary, a measured line -- ${JSON.stringify(rows)}`,
   rows.fails.length === 1 && rows.fails[0].startsWith("FAIL  *** b") && rows.measured.join() === "belt8: 12.3 dB" && rows.green === false && parseRows("ALL GREEN\n").green === true);
ok("the verdict leads with a software adapter, and names a hardware one",
   /NOT A REAL-HARDWARE RUN/.test(verdict({ adapters: [{ name: "google swiftshader", software: true }] })) && /NO ADAPTER/.test(verdict({ adapters: [] })) &&
   verdict({ adapters: [{ name: "nvidia ampere", software: false }] }) === "a real-hardware run on nvidia ampere");

console.log("\n2. ON THIS BOX: a run of two gates, and what it says it ran on");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** The adapter is the device's."); fails++; }
else {
    const quiet = () => {};
    const rep = runGates({ root: ENG, only: "translucentLayer-selfcheck", log: quiet });
    const g = rep.gates[0];
    ok(`the gate ran, green, and the harness logged the adapter it ran on: ${g ? g.adapters.join(", ") : "none"}`, rep.gates.length === 1 && g.ok && g.adapters.length === 1 && g.adapters[0] !== "none");
    ok(`*** and the run says what this box is: "${rep.verdict}" ***`, g.software === true && /NOT A REAL-HARDWARE RUN/.test(rep.verdict),
       "on a machine with a GPU this row goes red -- and that is the run's point, not a fault");
    ok(`  ...its kind, time and summary: ${g.category}, ${(g.ms / 1000).toFixed(1)} s, "${rep.summary}"`, g.category === "quality" && g.ms > 0 && rep.summary === "exact 0/0, quality 1/1, timing 0/0");
    const was = process.env.SWEK_LAUNCH_ARGS; process.env.SWEK_LAUNCH_ARGS = "--enable-unsafe-webgpu --no-first-run";
    const rep2 = runGates({ root: ENG, only: "temporalTslZoo-selfcheck", log: quiet });
    if (was === undefined) delete process.env.SWEK_LAUNCH_ARGS; else process.env.SWEK_LAUNCH_ARGS = was;
    const la = rep2.adapters.map((a) => (a.launchArgs || []).join(" "));
    ok(`SWEK_LAUNCH_ARGS reaches the browser: the harness launched with "${la.join("; ")}"`, rep2.gates[0] && rep2.gates[0].ok && la.length === 1 && la[0] === "--enable-unsafe-webgpu --no-first-run");
}

// ---- v4764 SABOTAGE LOG ----------------------------------------------------------------------------------------
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real GPU -- the run exists for one and this box has none; the whole run's length (about ten minutes " +
    "on SwiftShader -- two gates here); and which Linux flags reach which GPU, which the doc offers as a first try, not a finding.");
process.exitCode = fails ? 1 : 0;
