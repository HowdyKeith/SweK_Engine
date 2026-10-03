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
import { gateList, categorize, parseRows, verdict, runGates, runLaunchArgs, probeSoftwareGl, softwareGlLines, TREE_SOFTWARE_GL,
         probeNativeAdapters, nativeAdapterLines } from "./realGpuRun.mjs";
import { webgpuSkipReason, launchArgsFor, hardwareArgsFor, parityArgsFor, HARDWARE_ARGS } from "./webgpuHarness.mjs";
import { gateReport } from "./gateReport.mjs";
const GR = gateReport("tools/ship/realGpuRun-selfcheck.mjs");

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
    // *** RIG RUN 2 -- THIS ROW ASSERTED THE BOX, AND WENT RED ON THE BOX THE RUN EXISTS FOR. *** It required a SOFTWARE
    // adapter, so Keith's rig read "a real-hardware run on nvidia pascal" and failed -- "that is the run's point, not a
    // fault" was written beside a red that every GPU owner would see. What the run must get right on any box is that its
    // verdict AGREES with the adapter the harness logged: software -> NOT A REAL-HARDWARE RUN, hardware -> named.
    const agrees = g.software === true ? /NOT A REAL-HARDWARE RUN/.test(rep.verdict)
                                       : rep.verdict === "a real-hardware run on " + g.adapters[0];
    ok(`*** and the run says what this box is, as the harness saw it: "${rep.verdict}" ***`, !!g && agrees,
       `adapter ${g ? g.adapters[0] : "none"} (${g && g.software ? "software" : "hardware"}) -- the verdict names it either way`);
    ok(`  ...its kind, time and summary: ${g.category}, ${(g.ms / 1000).toFixed(1)} s, "${rep.summary}"`, g.category === "quality" && g.ms > 0 && rep.summary === "exact 0/0, quality 1/1, timing 0/0");
    const was = process.env.SWEK_LAUNCH_ARGS; process.env.SWEK_LAUNCH_ARGS = "--enable-unsafe-webgpu --no-first-run";
    const rep2 = runGates({ root: ENG, only: "temporalTslZoo-selfcheck", log: quiet });
    if (was === undefined) delete process.env.SWEK_LAUNCH_ARGS; else process.env.SWEK_LAUNCH_ARGS = was;
    const la = rep2.adapters.map((a) => (a.launchArgs || []).join(" "));
    ok(`SWEK_LAUNCH_ARGS reaches the browser: the harness launched with "${la.join("; ")}"`, rep2.gates[0] && rep2.gates[0].ok && la.length === 1 && la[0] === "--enable-unsafe-webgpu --no-first-run");
}

console.log("\n3. RIG RUN 2: WHAT \"SOFTWARE GL\" GETS ON THIS BOX, PER FLAG SET");
// 72 files launch with --use-gl=swiftshader and hold their pixels to SwiftShader's. On Keith's rig all twelve such gates
// in the run were red, some with a context that answered null. This section is the measurement a fix to them needs:
// it is RED where the tree's spelling does not get a software renderer, and its lines say which spelling does.
if (skip) { console.log("  SKIP  no browser: " + skip); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const probe = await probeSoftwareGl();
    for (const l of softwareGlLines(probe)) console.log("  ----  " + l);
    GR.table("which renderer each flag set gets on this box", ["flags", "WebGL2", "WebGL2 renderer", "draws", "WebGPU"],
             probe.rows.map((r) => [r.args.join(" ") || "(no flags)", r.error ? "launch threw" : !r.context ? "none" : (r.software ? "software" : "hardware"),
                                    r.renderer || r.error || "", r.draws || "", r.webgpu || ""]),
             "the headless shell this box resolves; on a GPU box this table is the measurement a fix to the 72 needs");
    const tree = probe.rows.find((r) => r.args.join(" ") === TREE_SOFTWARE_GL.join(" "));
    const holds = (r) => r.draws === "draws" && /held$/.test(r.sustain || "");   // rig run 9: one draw AND a hundred under work
    const working = probe.rows.filter((r) => r.context && r.software && holds(r)).map((r) => r.args.join(" ") || "(no flags)");
    ok(`!! *** the tree's software-GL spelling (${TREE_SOFTWARE_GL.join(" ")}) gets a SOFTWARE WebGL2 renderer on this box ***`,
       // rig run 4: and DRAWS -- the rig named SwiftShader for this spelling and still lost the context in the gates
       probe.ok && !!tree && tree.context && tree.software === true && holds(tree),
       !probe.ok ? probe.reason
       : `got ${tree && tree.context ? (tree.software ? "software" : "HARDWARE") + ": " + tree.renderer + " -- " + tree.draws + " / " + tree.sustain : "no WebGL2 context" + (tree && tree.error ? " (" + tree.error + ")" : "")}` +
         (tree && tree.software && holds(tree) ? "" : `. Every gate launched with it is holding a ${tree && tree.context ? "GPU's" : "dead context's"} pixels to SwiftShader's. ` +
          `Spellings that DO get software here: ${working.join(" | ") || "NONE"}`));
}

console.log("\n4. RIG RUN 4: AN ORDINARY RUN ON WINDOWS ASKS FOR SWIFTSHADER WebGPU, AND THIS RUN ASKS FOR THE GPU");
// Keith's decision, off his --gl-flags table: the device rows were measured on SwiftShader, and win32's pair put WebGPU on
// the GTX 1080 (about forty exact rows red). Both platforms' answers are read here, so a Linux box checks win32's.
{
    const win = launchArgsFor("win32"), winHw = hardwareArgsFor("win32"), lin = launchArgsFor("linux");
    ok(`win32: an ordinary run's flags are "${win.join(" ")}" -- the measured pair plus the SwiftShader adapter`,
       win.join(" ") === "--enable-unsafe-webgpu --use-angle=d3d11 --use-webgpu-adapter=swiftshader");
    ok(`  ...and a real-hardware run's are the pair alone, "${winHw.join(" ")}", which Keith's rig measured on nvidia / pascal`,
       winHw.join(" ") === "--enable-unsafe-webgpu --use-angle=d3d11");
    ok(`linux and darwin are unchanged: "${lin.join(" ")}" for both kinds -- neither was measured with the adapter flag on a GPU`,
       lin.join(" ") === "--enable-unsafe-webgpu" && hardwareArgsFor("linux").join(" ") === lin.join(" ") &&
       launchArgsFor("darwin").join(" ") === "--enable-unsafe-webgpu" && hardwareArgsFor("darwin").join(" ") === "--enable-unsafe-webgpu");
    const runWin = runLaunchArgs({}, "win32");
    ok(`!! *** realGpuRun hands its gates the HARDWARE flags on win32, not an ordinary run's: "${runWin.join(" ")}" ***`,
       runWin.join(" ") === winHw.join(" ") && !runWin.includes("--use-webgpu-adapter=swiftshader"));
    // rig run 10, Keith's decision: a gate that holds the two backends to each other launches with PARITY_ARGS -- the pair on
    // win32 (no flag set there puts both on SwiftShader, measured), LAUNCH_ARGS elsewhere
    ok(`win32: the two-backend gates' flags are "${parityArgsFor("win32").join(" ")}" -- both backends on the GPU, one rasteriser`,
       parityArgsFor("win32").join(" ") === winHw.join(" ") && !parityArgsFor("win32").includes("--use-webgpu-adapter=swiftshader"));
    ok("  ...and elsewhere they are an ordinary run's: SwiftShader for both, as every pixel row there was measured",
       parityArgsFor("linux").join(" ") === lin.join(" ") && parityArgsFor("darwin").join(" ") === launchArgsFor("darwin").join(" "));
    {   // and the fourteen launch with them: every runInEngineOrigin / runWgslCompute call in each passes PARITY_ARGS
        const PARITY_GATES = ["tslWide", "deviceTexture", "slugFill", "slugMelt", "litSphere", "stereographic", "slugMorph", "hiZ",
                              "deviceUniformsPerDraw", "gpuDriven", "gpuTerrain", "slugTicker", "slugProjective", "headlessGpu"];
        const bare = [];
        for (const g of PARITY_GATES) {
            const src = fs.readFileSync(path.join(ENG, "tools/ship", g + "-selfcheck.mjs"), "utf8");
            // [^\n]+ and not [^\n]* -- a star before the closing slash reads as a comment's end to vba/runtimeGap.mjs's stripper,
            // which then blanked this file's code back to the last opener and dropped it from two census rows (found by that gate)
            const calls = src.match(/(runInEngineOrigin|runWgslCompute)\(\{[^\n]+/g) || [];
            if (!calls.length) bare.push(g + " (no launch found)");
            for (const c of calls) if (!/^\w+\(\{ launchArgs: PARITY_ARGS,/.test(c)) bare.push(g + ": " + c.slice(0, 60));
        }
        ok(`  ...and the ${PARITY_GATES.length} gates that hold the two backends to one picture launch every call with PARITY_ARGS`,
           bare.length === 0, bare.length ? bare.slice(0, 4).join("; ") : "the 14 that went newly red when an ordinary win32 run put WebGPU on SwiftShader alone");
    }
    ok("  ...and an owner's SWEK_LAUNCH_ARGS still wins over both",
       runLaunchArgs({ SWEK_LAUNCH_ARGS: " --enable-unsafe-webgpu  --enable-features=Vulkan " }, "win32").join(" ") === "--enable-unsafe-webgpu --enable-features=Vulkan");
    if (skip) { console.log("  SKIP  no browser: " + skip); console.log("  ----  *** NOT A PASS. ***"); fails++; }
    else {
        // With SWEK_LAUNCH_ARGS UNSET in this process, the gate's browser can only get the run's flags if runGates hands
        // them to the child. On this box HARDWARE_ARGS and LAUNCH_ARGS are the same flag, so the run is given a set that
        // is neither -- otherwise a runGates that passed nothing would read green here and only be wrong on win32.
        const was = process.env.SWEK_LAUNCH_ARGS; delete process.env.SWEK_LAUNCH_ARGS;
        const mark = [...HARDWARE_ARGS, "--no-first-run"];
        const rep = runGates({ root: ENG, only: "translucentLayer-selfcheck", log: () => {}, launchArgs: mark });
        const dflt = runLaunchArgs();
        if (was !== undefined) process.env.SWEK_LAUNCH_ARGS = was;
        const logged = rep.adapters.map((a) => (a.launchArgs || []).join(" "));
        ok(`  ...and runGates hands the run's flags to the gate itself: launched with "${logged.join("; ")}", nothing in the environment`,
           rep.gates[0] && rep.gates[0].ok && logged.length === 1 && logged[0] === mark.join(" ") && rep.launchArgs.join(" ") === mark.join(" "));
        ok(`  ...and the run's flags, unset, are this box's HARDWARE_ARGS: "${dflt.join(" ")}"`, dflt.join(" ") === HARDWARE_ARGS.join(" "));
    }
}

console.log("\n5. RIG RUN 9: WHICH ADAPTER node-webgpu HANDS OUT, PER WAY OF ASKING");
// headlessGpu-selfcheck holds node-webgpu and the browser to one adapter; with the browser on SwiftShader on win32 the native
// side must reach it too, and whether Dawn there can is the rig's to say. Here the probe must at least ask all four ways and
// read what it gets: on this box every way is SwiftShader, through the browser bundle's Vulkan driver.
{
    const native = await probeNativeAdapters();
    for (const l of nativeAdapterLines(native)) console.log("  ----  " + l);
    ok(`node-webgpu asked four ways, each answered with an adapter or a reason: ${native.rows.map((r) => r.adapter ? (r.software ? "software" : "hardware") : r.error ? "threw" : "none").join(", ")}`,
       native.ok && native.rows.length === 4 && native.rows.every((r) => r.adapter || r.error || r.adapter === null),
       `from ${native.from}, Vulkan driver ${native.icd}`);
    ok("  ...and on this box the default is software, as every device row here was measured on", native.ok && native.rows[0].software === true,
       native.rows[0] ? native.rows[0].adapter || native.rows[0].error || "no adapter" : "not probed");
}

// ---- v4764 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against tools/ship/realGpuRun.mjs: R1 the render gates left out of the run -> 3; R2 dB read before the clock -> 1; R3 the
// summary line counted as a failing row -> 1; R4 a software adapter never named -> 2; R5 the log not handed to the gates -> 3;
// R6 measured lines not read -> 1. Against tools/ship/webgpuHarness.mjs: H1 the log never written -> 3; H2 SWEK_LAUNCH_ARGS
// ignored -> 1; H3 a gate logged by its full path (the runner then finds no adapter for it) -> 3; H4 the flags not logged -> 1.
// Ten, none green.
// RIG RUN 2: G1 section 2's verdict row looking for "a real-hardware run on" on a software box -> 1 red (only the software
// branch can be driven red without a GPU); S1 probeSoftwareGl reading a SwiftShader renderer as hardware -> 1 red, the
// tree-spelling row, "got HARDWARE: ANGLE (... SwiftShader driver)". Both restored, md5 verified.
// RIG RUN 4: D1 the probe's fragment blue channel 0.6 -> 0.0 in realGpuRun.mjs (the triangle still draws, in the wrong
// colour) -> 1 red, the tree-spelling row, "drew nothing: 51,102". Restored, md5 verified.
// RIG RUN 9: D2 the sustained loop losing its context at draw 50 (WEBGL_lose_context) -> 1 red, the tree-spelling row,
// "CONTEXT LOST within 51 draws". Restored, md5 verified.
// RIG RUN 10, against tools/ship/webgpuHarness.mjs and tools/ship/hiZ-selfcheck.mjs: P1 parityArgsFor("win32") falling back to an
// ordinary run's -> 1 red, the win32 parity row ("... --use-webgpu-adapter=swiftshader"); P2 one hiZ call launched without
// PARITY_ARGS -> 1 red, the scan row, naming it. Both restored, md5 verified.
// RIG RUN 4, section 4. Against tools/ship/webgpuHarness.mjs: A1 win32's LAUNCH_ARGS without the adapter flag -> 1 red, the
// ordinary-run row; A2 the adapter flag on every platform -> 1 red, the linux/darwin row. Against tools/ship/realGpuRun.mjs:
// R7 runLaunchArgs falling back to launchArgsFor -> 1 red, the hardware row ("... --use-webgpu-adapter=swiftshader"); R8
// runGates not handing SWEK_LAUNCH_ARGS to the child -> 1 red, the plumbing row ("launched with --enable-unsafe-webgpu").
// That row's first draft passed under R8: on Linux HARDWARE_ARGS is LAUNCH_ARGS, so it now hands the run a third set. All
// four restored, md5 verified.
{
    const w = GR.write();
    console.log("\n  ----  gate report: " + (w.written ? "written to " + w.file : w.why) +
                ` -- ${w.doc.tables.length} tables, ${w.doc.tables.reduce((n, t) => n + t.rows.length * t.columns.length, 0)} cells`);
}
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real GPU -- the run exists for one and this box has none; the whole run, 8 min 25 s on SwiftShader, " +
    "measured once and too long for a gate -- two gates here; and which Linux flags reach which GPU, which the doc offers as a first try, not a finding.");
process.exitCode = fails ? 1 : 0;
