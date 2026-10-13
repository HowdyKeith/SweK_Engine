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
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gateList, categorize, parseRows, verdict, runGates, runLaunchArgs, probeSoftwareGl, softwareGlLines, TREE_SOFTWARE_GL,
         probeNativeAdapters, nativeAdapterLines, GATE_TIMEOUT_MS, RETIRED_SOFTWARE_GL, TREE_SOFTWARE_WEBGPU, SOFTWARE_GL_CANDIDATES,
         NATIVE_LAUNCH, readAdapterLog, gateEntry, addAdapters, nodeWebgpuRecord,
         NATIVE_USE, nativeGateList, nativeLaunchArgs, nativeSweepCompare } from "./realGpuRun.mjs";   // v4851, section 66: NATIVE_LAUNCH..nodeWebgpuRecord; v4853, section 69: the last four
import { noteNativeAdapter } from "./headlessGpu.mjs";
import { webgpuSkipReason, launchArgsFor, hardwareArgsFor, parityArgsFor, HARDWARE_ARGS, softwareClaims } from "./webgpuHarness.mjs";
import { gateReport } from "./gateReport.mjs";
const GR = gateReport("tools/ship/realGpuRun-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

console.log("\n1. WHAT THE RUN COVERS, AND HOW IT SORTS IT");
const gates = gateList(ENG);
const fsr = fs.readdirSync(path.join(ENG, "fx/fsr")).filter((f) => f.endsWith("-selfcheck.mjs")).length;
const tsl = fs.readdirSync(path.join(ENG, "render")).filter((f) => /Tsl.*-selfcheck\.mjs$/.test(f)).length;
ok(`every fx/fsr gate (${fsr}), every render/*Tsl* gate (${tsl}), the translucent layer's and the denoiser's three: ${gates.length} gates`,
   gates.length === fsr + tsl + 4 && gates.includes("render/translucentLayer-selfcheck.mjs") && gates.includes("render/temporalTslCompute-selfcheck.mjs") &&
   gates.includes("render/denoiseDevice-selfcheck.mjs") && gates.includes("render/denoiseTiming-selfcheck.mjs") && gates.includes("render/denoiseCompile-selfcheck.mjs"));
ok(`  ...and each may run ${GATE_TIMEOUT_MS / 60000} minutes -- the rig's Intel took 498 s over one denoiser gate when the cap was 600 s (section 42)`,
   GATE_TIMEOUT_MS >= 3 * 498000);
const kinds = Object.fromEntries(gates.map((g) => [g, categorize(fs.readFileSync(path.join(ENG, g), "utf8"))]));
const of = (k) => gates.filter((g) => kinds[g] === k);
ok(`sorted by the doc's rule -- a clock read is timing, a dB grade quality, the rest exact: timing ${of("timing").length} (${of("timing").map((g) => path.basename(g, "-selfcheck.mjs")).join(", ")}), quality ${of("quality").length}, exact ${of("exact").length}`,
   kinds["fx/fsr/fsr3LiveClock-selfcheck.mjs"] === "timing" && kinds["fx/fsr/fsrFlowCost-selfcheck.mjs"] === "timing" && kinds["fx/fsr/fsrFrameGen-selfcheck.mjs"] === "quality" &&
   kinds["render/opticalFlowTsl-selfcheck.mjs"] === "exact" && kinds["render/temporalTslZoo-selfcheck.mjs"] === "exact" &&
   kinds["render/denoiseTiming-selfcheck.mjs"] === "timing" && kinds["render/denoiseDevice-selfcheck.mjs"] === "exact" && kinds["render/denoiseCompile-selfcheck.mjs"] === "timing");
ok("  ...and the rule on text: a clock is timing even beside dB, dB is quality, neither is exact",
   categorize("const t = performance.now(); // 3 dB") === "timing" && categorize("Math.log10(1 / mse)") === "quality" && categorize("same vector at every block") === "exact");
const rows = parseRows("\n1. X\n  PASS  a\n  FAIL  *** b wrong ***   detail\n  ----  belt8: 12.3 dB\n\nFAIL -- 1 check(s)\n");
ok(`the tree's row format read: a failing row and not the summary, a measured line -- ${JSON.stringify(rows)}`,
   rows.fails.length === 1 && rows.fails[0].startsWith("FAIL  *** b") && rows.measured.join() === "belt8: 12.3 dB" && rows.green === false && parseRows("ALL GREEN\n").green === true);
ok("the verdict leads with a software adapter, and names a hardware one",
   /NOT A REAL-HARDWARE RUN/.test(verdict({ adapters: [{ name: "google swiftshader", software: true }] })) && /NO ADAPTER/.test(verdict({ adapters: [] })) &&
   verdict({ adapters: [{ name: "nvidia ampere", software: false }] }) === "a real-hardware run on nvidia ampere");
{   // *** denoiser round 12, on the rig: `--only denoise` on a checkout without those gates ran none, read "NO ADAPTER WAS
    // SEEN" and exited 0. *** The CLI itself, asked for a gate no checkout has: it must say so, name the commit, and exit 1.
    const tmp = path.join(os.tmpdir(), `swek-realgpu-empty-${process.pid}.json`);
    const r = spawnSync(process.execPath, ["tools/ship/realGpuRun.mjs", "--only", "no-such-gate-anywhere", "--out", tmp], { cwd: ENG, encoding: "utf8", timeout: 60000 });
    const rep = fs.existsSync(tmp) ? JSON.parse(fs.readFileSync(tmp, "utf8")) : null;
    try { fs.unlinkSync(tmp); } catch {}
    const head = spawnSync("git", ["log", "-1", "--format=%h"], { cwd: ENG, encoding: "utf8" }).stdout.trim();
    ok(`!! *** an --only that matches no gate is said first and exits non-zero: exit ${r.status}, "${(rep && rep.verdict || "").slice(0, 90)}..." ***`,
       r.status === 1 && !!rep && rep.gates.length === 0 && rep.only === "no-such-gate-anywhere" &&
       /^\*\*\* NO GATE MATCHED --only "no-such-gate-anywhere": NOTHING RAN/.test(rep.verdict) && /NO GATE MATCHED/.test(r.stdout || "") && !/NO ADAPTER/.test(r.stdout || ""),
       (r.stderr || "").split("\n")[0].slice(0, 120));
    ok(`  ...and the report and the log name the checkout's commit: "${rep && rep.commit}"`,
       !!rep && !!head && String(rep.commit).startsWith(head + " ") && rep.verdict.includes(`(${head} `) && (r.stdout || "").includes("on " + rep.commit));
}
{   // round 19's probe (the denoiser arc, section 64): a SWEK_WEBGPU this box cannot load stops the run BEFORE any gate. As a
    // skip, each native gate passed and the report read as a green real-hardware run with no native row in it (review of
    // section 64: a failed npm install, or a `set` line ending in a space). An absolute path that holds nothing, and a relative one.
    // SABOTAGE (round 19's probe): the refusal taken out of the CLI -> this row red alone (the gate ran, exit 1, and wrote a report).
    const tmp = path.join(os.tmpdir(), `swek-realgpu-refused-${process.pid}.json`);
    const run = (v) => spawnSync(process.execPath, ["tools/ship/realGpuRun.mjs", "--only", "denoiseCompile", "--out", tmp],
                                 { cwd: ENG, encoding: "utf8", timeout: 600000, env: { ...process.env, SWEK_WEBGPU: v } });
    const abs = run(path.join(os.tmpdir(), "swek-no-such-webgpu")), rel = run("no-such-webgpu");
    const wrote = fs.existsSync(tmp); try { fs.unlinkSync(tmp); } catch {}
    ok(`!! *** a SWEK_WEBGPU this box cannot load stops the run before any gate: exit ${abs.status} and ${rel.status}, no report written ***`,
       abs.status === 2 && rel.status === 2 && !wrote && /holds no node-webgpu package/.test(abs.stderr || "") && /not an absolute path/.test(rel.stderr || ""),
       `${(abs.stderr || "").trim().slice(0, 110)} | ${(rel.stderr || "").trim().slice(0, 90)}`);
}

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
                              "deviceUniformsPerDraw", "gpuDriven", "gpuTerrain", "slugTicker", "slugProjective", "headlessGpu",
                              // rig run 13: the two that hold the browser's WebGPU to node-webgpu's, which on win32 is the GPU
                              "deviceCompute", "crossBackend"];
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
           bare.length === 0, bare.length ? bare.slice(0, 4).join("; ") : "the 14 that went newly red when an ordinary win32 run put WebGPU on SwiftShader alone, and the 2 that hold it to node-webgpu");
    }
    {   // rig run 13: a gate that launches its own browser and draws through both routes -- no harness call for the scan above to read
        const DIRECT = ["orreryPost"], bare = DIRECT.filter((g) =>
            !/chromium\.launch\(\{ executablePath: HEADLESS_SHELL, args: \[\.\.\.PARITY_ARGS\] \}\)/.test(fs.readFileSync(path.join(ENG, "tools/ship", g + "-selfcheck.mjs"), "utf8")));
        ok(`  ...and the ${DIRECT.length} that launch their own browser for both routes launch it with PARITY_ARGS`, bare.length === 0,
           bare.length ? "not: " + bare.join(", ") : DIRECT.join(", ") + " -- on the rig its WebGL launch left WebGPU no adapter, and the preferred route fell to WebGL2");
    }
    {   // rig run 12, Keith's option (a): seven WebGL2 gates whose rows hold a backend to a model of SwiftShader's rasterisation.
        // Their two-backend launch takes PARITY_ARGS too (on the GTX 1080 both backends then run on the GPU), and those rows go
        // through softwareClaims -- asserted on a software adapter, printed on a hardware one, with a held row counting which.
        // Each gate's other launches are single-backend and stay ordinary, so the scan counts, not "every call".
        const MODEL_GATES = { slugDevice: [1, 1], slugCurve: [1, 1], slugShatter: [1, 1], gpuUniverse: [1, 1], tslRace: [2, 2],
                              img2three: [1, 0], threeUpstreamPaths: [1, 0] };   // [launches with PARITY_ARGS, softwareClaims scopes]
        const off = [];
        for (const [g, [np, nc]] of Object.entries(MODEL_GATES)) {
            const src = fs.readFileSync(path.join(ENG, "tools/ship", g + "-selfcheck.mjs"), "utf8");
            const p = (src.match(/(runInEngineOrigin|runWgslCompute)\(\{ launchArgs: PARITY_ARGS,/g) || []).length;
            const c = (src.match(/softwareClaims\(ok, r\)/g) || []).length, h = (src.match(/\bSW\.held\(\d+\)/g) || []).length;
            if (p !== np || c !== nc || h !== nc) off.push(`${g}: ${p} PARITY_ARGS launch(es), ${c} scope(s), ${h} held row(s) -- want ${np}, ${nc}, ${nc}`);
        }
        ok(`  ...and the ${Object.keys(MODEL_GATES).length} SwiftShader-model gates launch their two-backend run with PARITY_ARGS and scope their model rows`,
           off.length === 0, off.length ? off.slice(0, 3).join("; ") : "img2three, slugDevice, slugCurve, slugShatter, gpuUniverse, tslRace, threeUpstreamPaths");
        // and softwareClaims does what the scope says, on a made-up result of each kind -- no browser needed
        const run = (software) => { const said = [], got = []; const fake = (l, c) => got.push([l, c]);
            const SW = softwareClaims(fake, { software, adapter: { vendor: "v", architecture: "a" } }, (m) => said.push(m));
            const r1 = SW("model row", true), r2 = SW("*** model row ***", false); SW.held(2);
            return { said, got, r1, r2, held: got[got.length - 1] }; };
        const sw = run(true), hw = run(false);
        ok("  softwareClaims on a SOFTWARE adapter asserts every row (a false one fails) and its held row passes",
           sw.got.length === 3 && sw.got[0][1] === true && sw.got[1][1] === false && sw.said.length === 0 && sw.r1 && sw.r2 && sw.held[1] === true);
        ok("  ...and on a HARDWARE adapter asserts none, prints each with whether it held there, and its held row passes",
           hw.got.length === 1 && hw.said.length === 2 && /holds here too: model row$/.test(hw.said[0]) && /does not hold here: model row$/.test(hw.said[1]) &&
           !hw.r1 && !hw.r2 && hw.held[1] === true && /reported on a hardware adapter \(v a\)/.test(hw.held[0]));
        const short = (() => { const got = []; const SW = softwareClaims((l, c) => got.push(c), { software: true }, () => {}); SW("x", true); SW.held(2); return got[got.length - 1]; })();
        ok("  ...and its held row goes red when fewer rows ran than the gate says", short === false);
        // and when the rows ran on the wrong side of the scope: counts that add up are not enough (sabotage S4 read green without this)
        const wrongSide = (software, field) => { const got = []; const SW = softwareClaims((l, c) => got.push(c), { software }, () => {});
            SW[field] = 2; SW.held(2); return got[got.length - 1]; };
        ok("  ...and when the rows were reported on a software adapter, or asserted on a hardware one, though the count adds up",
           wrongSide(true, "reported") === false && wrongSide(false, "asserted") === false);
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
    // *** rig run 11 -- THIS ROW ASSERTED THE BOX. *** "On this box the default is software" read red on Keith's rig, whose
    // default IS the GPU (nvidia / pascal, D3D12) -- the very fact this section exists to report. What holds on any box: the
    // default way of asking gets an adapter, and the line says which kind.
    const d0 = native.rows[0] || {};
    console.log(`  ----  node-webgpu's default adapter here: ${d0.adapter ? (d0.software ? "SOFTWARE " : "HARDWARE ") + d0.adapter : d0.error || "none"}`);
    ok("  ...and the default way of asking gets an adapter, whichever kind this box has", native.ok && !!d0.adapter,
       d0.adapter || d0.error || "no adapter");
}

console.log("\n6. ROUND 19 (section 66, v4851): NATIVE ADAPTERS NAMED, EACH GATE KEEPS ITS SKIPS, AND THE PACKAGE AND ITS COMPILER RECORDED");
// Section 65: the GTX 1080 report read "NO ADAPTER WAS SEEN" over a compile gate whose native half ran on the 1080, because
// adapter names came only from the browser harness and Chrome did not run there. Every row here drives realGpuRun with
// fixtures -- no GPU, no gate run -- except the last, which runs the CLI on an --only that matches nothing.
{
    const GATE = "render/denoiseCompile-selfcheck.mjs";
    const P = { vendor: "nvidia", architecture: "pascal", description: "D3D12 driver version 32.0.15.8180" };
    const PNAME = "nvidia pascal D3D12 driver version 32.0.15.8180";
    const line = (o) => JSON.stringify({ gate: GATE, ...o });
    // the 1080 run as section 65 describes it: one record, the native half, and nothing from a browser
    const ONLY_NATIVE = line({ adapter: P, software: false, launchArgs: ["node-webgpu (native)"] }) + "\n" +
                        JSON.stringify({ gate: "render/other-selfcheck.mjs", adapter: { vendor: "google", architecture: "swiftshader" }, software: true, launchArgs: [] }) + "\n";
    const one = gateEntry({ gate: GATE, src: "timingLadder(", status: 0, ms: 5, stdout: "", logText: ONLY_NATIVE });
    const runAds = addAdapters([], one.adapters), said = verdict({ adapters: runAds });
    // SABOTAGED v4851: adapterLabel returning the bare name (no "(native)") -> RED by name ("a real-hardware run on nvidia pascal D3D12 driver version 32.0.15.8180"), with the next three rows: 4 red; restored, md5 verified.
    // SABOTAGED v4851: readAdapterLog dropping records whose launchArgs hold NATIVE_LAUNCH (the browser-only reading of section 65) -> RED by name ("*** NO ADAPTER WAS SEEN ..."), with the next two rows: 3 red; restored, md5 verified.
    ok(`!! *** a log holding only a native record names that adapter, hardware and labelled native -- not NO ADAPTER WAS SEEN: "${said}" ***`,
       said === `a real-hardware run on ${PNAME} (native)` && one.entry.adapters.join("|") === `${PNAME} (native)` && one.entry.software === false &&
       runAds.length === 1 && runAds[0].native === true && runAds[0].software === false && NATIVE_LAUNCH === "node-webgpu (native)");

    // and the record headlessGpu.mjs writes itself, not a copy of its shape typed here: noteNativeAdapter into a captured log
    let buf = "";
    noteNativeAdapter({ info: { vendor: "intel", architecture: "gen-9", description: "D3D12 driver version 31.0.101.2137" }, isFallbackAdapter: false },
                      { gate: path.join(ENG, "render/denoiseTiming-selfcheck.mjs"), env: { SWEK_ADAPTER_LOG: "(captured)" }, append: (f, l) => { buf += l; }, say: () => {} });
    const noted = readAdapterLog(buf, "render/denoiseTiming-selfcheck.mjs");
    // SABOTAGED v4851: NATIVE_LAUNCH spelled "node-webgpu native" (no longer the launch entry noteNativeAdapter writes) -> RED by name, with the row above and the row below: 3 red; restored, md5 verified.
    ok(`  ...and the record noteNativeAdapter writes reads back as a native hardware adapter: ${JSON.stringify(noted)}`,
       noted.adapters.length === 1 && noted.adapters[0].native === true && noted.adapters[0].software === false &&
       noted.names.join("|") === "intel gen-9 D3D12 driver version 31.0.101.2137 (native)" &&
       verdict({ adapters: addAdapters([], noted.adapters) }) === "a real-hardware run on intel gen-9 D3D12 driver version 31.0.101.2137 (native)");

    // a browser call that reached no device, beside the native one that did; and a native record that does not say its kind
    const mixed = gateEntry({ gate: GATE, src: "", status: 0, ms: 1, logText: line({ adapter: null, software: null, launchArgs: ["--enable-unsafe-webgpu"] }) + "\n" + ONLY_NATIVE });
    const unsaid = gateEntry({ gate: GATE, src: "", status: 0, ms: 1, logText: line({ adapter: P, launchArgs: ["node-webgpu (native)"] }) });
    const unsaidVerdict = verdict({ adapters: addAdapters([], unsaid.adapters) });
    // SABOTAGED v4851: readAdapterLog listing the adapterless "none" record as an adapter -> RED by name ("*** SOFTWARE ADAPTER (none) ..."), 1 red; restored, md5 verified.
    // SABOTAGED v4851: readAdapterLog defaulting a missing software to false (x.software ?? false) -> RED by name (the unsaid record read as hardware), 1 red; restored, md5 verified.
    ok(`  ...a browser call with no device is not an adapter, and a record that does not say hardware stays software: "${verdict({ adapters: addAdapters([], mixed.adapters) })}" | "${unsaidVerdict.slice(0, 40)}..."`,
       verdict({ adapters: addAdapters([], mixed.adapters) }) === `a real-hardware run on ${PNAME} (native)` && mixed.entry.adapters.join("|") === `none|${PNAME} (native)` &&
       mixed.entry.software === false && /^\*\*\* SOFTWARE ADAPTER \(nvidia pascal .* \(native\)\): THIS IS NOT A REAL-HARDWARE RUN/.test(unsaidVerdict) && unsaid.entry.software === true);

    // one GPU read by both halves is two lines: which half reached it is the point of the label
    const both = addAdapters([], [{ name: PNAME, software: false, launchArgs: ["--enable-unsafe-webgpu"], native: false }, { name: PNAME, software: false, launchArgs: ["node-webgpu (native)"], native: true }]);
    addAdapters(both, one.adapters);
    // SABOTAGED v4851: addAdapters deduplicating by name instead of label -> RED by name (one line, the native half lost), 1 red; restored, md5 verified.
    ok(`  ...and one GPU seen by the browser and natively is two adapters, each once: ${both.map((a) => a.native ? "native" : "browser").join(", ")}`,
       both.length === 2 && both[0].native === false && both[1].native === true && verdict({ adapters: both }) === `a real-hardware run on ${PNAME}; ${PNAME} (native)`);

    // SKIP lines: the rows a native gate stood aside, and why
    const OUT = "\n1. NATIVE\n  PASS  r15 natively\n  SKIP  r18t natively: the compiler is FXC (section 66)\n  ----  native adapter: x (hardware)\n" +
                "   SKIP  round 16 shapes on D3D12: the probe ran round 17 only\nALL GREEN\n";
    const pr = parseRows(OUT);
    // SABOTAGED v4851: parseRows returning skips: [] -> RED by name ("[]"), 1 red; restored, md5 verified.
    ok(`!! *** each gate keeps its SKIP lines, trimmed, beside its fails and measured lines: ${JSON.stringify(pr.skips)} ***`,
       Array.isArray(pr.skips) && pr.skips.length === 2 && pr.skips[0] === "SKIP  r18t natively: the compiler is FXC (section 66)" &&
       pr.skips[1] === "SKIP  round 16 shapes on D3D12: the probe ran round 17 only" && pr.fails.length === 0 && pr.measured.length === 1 && pr.green === true);
    const ge = gateEntry({ gate: GATE, src: "", status: 0, ms: 1, stdout: OUT, logText: ONLY_NATIVE });
    const runSrc = fs.readFileSync(path.join(ENG, "tools/ship/realGpuRun.mjs"), "utf8");
    // SABOTAGED v4851: gateEntry leaving skips out of the entry -> 0 red BY NAME, a finding: runGates (section 2) and this row
    // read entry.skips.length and the gate died unnamed. Redone as gateEntry handing skips: [] -> RED by name ("carries them (0)"), 1 red; restored, md5 verified.
    // SABOTAGED v4851: runGates pushing an entry with skips undefined -> 0 red BY NAME (section 2 died in runGates, unnamed), a finding;
    // redone as runGates pushing its own copy, skips: [], in place of the entry gateEntry built -> RED by name (the source half), 1 red; restored, md5 verified.
    ok(`  ...and the report entry carries them (${ge.entry.skips.length}), built by gateEntry inside runGates, its adapters merged by addAdapters`,
       JSON.stringify(ge.entry.skips) === JSON.stringify(pr.skips) && /const \{ entry, adapters \} = gateEntry\(\{ gate: g,/.test(runSrc) &&
       /report\.gates\.push\(entry\);\s*addAdapters\(report\.adapters, adapters\);/.test(runSrc));

    // the package, and the compiler it predicts -- nativeCompiler, the rule the native gates choose their sets by
    const rec = (pkg, platform, env = {}) => nodeWebgpuRecord({ from: "/pkgs/webgpu-x/index.js", pkg, platform, env });
    const p062 = rec({ version: "0.6.2", dxcBeside: true, dir: "/pkgs/webgpu-062" }, "win32", { SWEK_WEBGPU: "/pkgs/webgpu-062" });
    const p060 = rec({ version: "0.6.0", dxcBeside: true, dir: "/pkgs/webgpu-060" }, "win32");
    const noDll = rec({ version: "0.6.2", dxcBeside: false, dir: "/pkgs/webgpu-062" }, "win32");
    const lin = rec({ version: "0.6.2", dxcBeside: true, dir: "/pkgs/webgpu-062" }, "linux"), none = rec(null, "win32");
    // SABOTAGED v4851: nodeWebgpuRecord asking nativeCompiler for platform "win32" whatever the platform -> RED by name (linux "DXC"), with the CLI row below: 2 red; restored, md5 verified.
    // SABOTAGED v4851: dxcBeside left out of the record (always null) -> RED by name, 1 red; restored, md5 verified.
    // SABOTAGED v4851: compiler for no package taken from nativeCompiler alone ("FXC") -> RED by name, 1 red; restored, md5 verified.
    ok(`!! *** the report records the package, its dxcBeside and its predicted compiler: 0.6.2+dll on win32 ${p062.compiler}, 0.6.0+dll ${p060.compiler}, 0.6.2 no dll ${noDll.compiler}, linux ${lin.compiler}, no package ${none.compiler} ***`,
       p062.compiler === "DXC" && p060.compiler === "FXC" && noDll.compiler === "FXC" && lin.compiler === null && none.compiler === null &&
       p062.version === "0.6.2" && p062.dxcBeside === true && p062.dir === "/pkgs/webgpu-062" && p062.from === "/pkgs/webgpu-x/index.js" &&
       p062.chosenBy === "SWEK_WEBGPU" && p060.chosenBy !== "SWEK_WEBGPU" && /resolver/.test(p060.chosenBy) && noDll.dxcBeside === false && none.dxcBeside === null && none.version === null,
       JSON.stringify(p062));

    // and the CLI writes that record: an --only that matches nothing still resolves the package and writes its report
    const tmp = path.join(os.tmpdir(), `swek-realgpu-pkg-${process.pid}.json`);
    const r = spawnSync(process.execPath, ["tools/ship/realGpuRun.mjs", "--only", "no-such-gate-anywhere", "--out", tmp], { cwd: ENG, encoding: "utf8", timeout: 60000 });
    const rep = fs.existsSync(tmp) ? JSON.parse(fs.readFileSync(tmp, "utf8")) : null;
    try { fs.unlinkSync(tmp); } catch {}
    const nw = (rep && rep.nodeWebgpu) || {};
    const want = nw.version ? nodeWebgpuRecord({ from: nw.from, pkg: { version: nw.version, dxcBeside: nw.dxcBeside, dir: nw.dir } }).compiler : null;
    // SABOTAGED v4851: the CLI back to the v4850 record (version, from, chosenBy only) -> RED by name, 1 red; restored, md5 verified.
    ok(`  ...and the CLI writes it into the report and its log line: ${JSON.stringify(nw)}`,
       !!rep && "dxcBeside" in nw && "compiler" in nw && "dir" in nw && nw.compiler === want &&
       (process.platform === "win32" || nw.compiler === null) && /dxcompiler\.dll beside dawn\.node: .*; predicted compiler: /.test(r.stdout || ""),
       (r.stdout || "").split("\n").find((l) => /predicted compiler/.test(l)) || (r.stderr || "").slice(0, 120));
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
// RIG RUN 13: U4 orreryPost launched with an ordinary run's LAUNCH_ARGS -> 1 red, the direct-launch row naming it. U1 crossBackend's browser wrapper without PARITY_ARGS -> 1 red, the scan row ("crossBackend: runWgslCompute({
// ...o });"). U2/U3, each gate's SAME ADAPTER row with one side's name altered -> 1 red in deviceCompute and 1 in crossBackend
// (on Linux both sides are SwiftShader, so only an altered reading can part them here). All restored, md5 verified.
// RIG RUN 12 (option a). Against tools/ship/webgpuHarness.mjs: S1 softwareClaims reporting on a software adapter too -> 2 red
// here (both scope rows) and 1 in slugCurve-selfcheck (its held row, "0 asserted, 4 reported"); S4 the held row checking only
// that the count adds up -> 1 red, the wrong-side row -- which this file did NOT have when S4 first ran: it read green, and the
// row was added for it. Against tools/ship/slugCurve-selfcheck.mjs: S2 its two-backend launch without PARITY_ARGS -> 1 red, the
// scan row, naming it. Against tools/ship/slugDevice-selfcheck.mjs: S3 one model row back on plain ok -> 1 red there, the held
// row ("4 asserted, 0 reported" of 6). All restored, md5 verified.
// RIG RUN 4, section 4. Against tools/ship/webgpuHarness.mjs: A1 win32's LAUNCH_ARGS without the adapter flag -> 1 red, the
// ordinary-run row; A2 the adapter flag on every platform -> 1 red, the linux/darwin row. Against tools/ship/realGpuRun.mjs:
// R7 runLaunchArgs falling back to launchArgsFor -> 1 red, the hardware row ("... --use-webgpu-adapter=swiftshader"); R8
// runGates not handing SWEK_LAUNCH_ARGS to the child -> 1 red, the plumbing row ("launched with --enable-unsafe-webgpu").
// That row's first draft passed under R8: on Linux HARDWARE_ARGS is LAUNCH_ARGS, so it now hands the run a third set. All
// four restored, md5 verified.
// DENOISER ROUND 12, ON THE RIG (an --only that matched nothing read "NO ADAPTER WAS SEEN" and exited 0). Against
// tools/ship/realGpuRun.mjs: E1 the CLI's exit code back to every-gate-ok, which an empty list satisfies -> 1 red, the
// empty-selection row ("exit 0"); E2 the empty-selection verdict removed -> 2 red, both rows ("NO ADAPTER WAS SEEN"); E3 the
// commit not recorded -> 1 red, the commit row ("null"). All three restored, md5 verified.
// DENOISER ROUND 14 (section 42: the Intel took 498 s over one gate against a 600 s cap). Against tools/ship/realGpuRun.mjs: T1
// GATE_TIMEOUT_MS back to 600000 -> 1 red, the cap row. Restored, md5 verified.
{
    const w = GR.write();
    console.log("\n  ----  gate report: " + (w.written ? "written to " + w.file : w.why) +
                ` -- ${w.doc.tables.length} tables, ${w.doc.tables.reduce((n, t) => n + t.rows.length * t.columns.length, 0)} cells`);
}
// *** v4831 -- THE THREE FLAG LISTS THE SOFTWARE-GL PROBE IS BUILT ON, NAMED BY THE GATE NAMED FOR THEIR MODULE. ***
// tools/ship/definitionGates-selfcheck.mjs counted RETIRED_SOFTWARE_GL, TREE_SOFTWARE_WEBGPU and SOFTWARE_GL_CANDIDATES as
// definitions nobody had looked at: probeSoftwareGl spends them and no gate named them. The row holds the three facts the
// rig runs settled (see the module's note on rig run 10): the tree's WebGPU launch is its GL launch plus exactly one flag;
// the retired spelling is NOT in the tree's launch any more but stays a candidate, so the table keeps saying why it went;
// and the candidate table probeSoftwareGl defaults to starts with the tree's own spelling, holds no set twice, and every
// set is frozen. SABOTAGE, restored: "--use-gl=swiftshader" added back to TREE_SOFTWARE_WEBGPU -> RED.
{
    const key = (a) => a.join(" ");
    const keys = SOFTWARE_GL_CANDIDATES.map(key);
    const probeSrc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "realGpuRun.mjs"), "utf8");
    ok("!! the software-GL candidates: the tree's WebGPU launch is its GL launch plus --enable-unsafe-webgpu, the retired flag is out of both and still a candidate, the tree's spelling is tried first",
       key(TREE_SOFTWARE_WEBGPU) === key([...TREE_SOFTWARE_GL, "--enable-unsafe-webgpu"]) &&
       RETIRED_SOFTWARE_GL.length === 1 && RETIRED_SOFTWARE_GL[0] === "--use-gl=swiftshader" &&
       !TREE_SOFTWARE_GL.includes(RETIRED_SOFTWARE_GL[0]) && !TREE_SOFTWARE_WEBGPU.includes(RETIRED_SOFTWARE_GL[0]) &&
       keys[0] === key(TREE_SOFTWARE_GL) && keys.includes(key(RETIRED_SOFTWARE_GL)) && keys.includes(key(TREE_SOFTWARE_WEBGPU)) &&
       new Set(keys).size === keys.length && SOFTWARE_GL_CANDIDATES.every((a) => Object.isFrozen(a)) &&
       /export async function probeSoftwareGl\(sets = SOFTWARE_GL_CANDIDATES,/.test(probeSrc),
       `${SOFTWARE_GL_CANDIDATES.length} candidates, first [${keys[0]}]; tree WebGPU [${key(TREE_SOFTWARE_WEBGPU)}]; retired [${key(RETIRED_SOFTWARE_GL)}]`);
}

// v4853 -- SECTION 69, SABOTAGED. Each against tools/ship/realGpuRun.mjs, this gate run, restored byte-identical (md5):
//   X1  NATIVE_USE call-only, so a runner imported under another name is missed -> 2 RED: the fixture row, the tree row
//   X2  nativeGateList reading comments and strings                            -> 2 RED: the same two (this gate, which names
//       the runners only in strings, joins the sweep)
//   X3  the native sweep taking an FSR run's hardware flags                    -> 2 RED: the flags row, the CLI row
//   X4  a red under both packages holding whatever its rows                    -> 1 RED: the rule's fixture row
//   X5  a regression read as a held gate                                       -> 1 RED: the same row
//   X6  the rule not asking for one commit                                     -> 1 RED: the same row
console.log("\n7. SECTION 69 (v4853): THE WHOLE NATIVE SWEEP -- EVERY GATE THAT MAKES A node-webgpu DEVICE, FOUND BY READING CODE");
{
    // a fixture tree: a call, an import under another name (four real gates do this), a comment and a string -- only the first two count
    const F = { "/r/a/one-selfcheck.mjs": "const W = H.resolveWebgpu();\n", "/r/b/two-selfcheck.mjs": "import { runWgslComputeNative as run } from \"./headlessGpu.mjs\";\nawait run({});\n",
                "/r/c/three-selfcheck.mjs": "// runWgslComputeNative( is what the others use\nconst x = 1;\n", "/r/d/four-selfcheck.mjs": "const s = \"runWgslComputeToTextureNative(\";\n" };
    const got = nativeGateList("/r", { files: Object.keys(F), read: (f) => F[f] });
    ok("!! section 69: a gate is native when its CODE uses headlessGpu's loader or a compute runner -- called, or imported under another name -- and not when a comment or a string names one",
       got.join() === "a/one-selfcheck.mjs,b/two-selfcheck.mjs", JSON.stringify(got));
    const tree = nativeGateList(), must = ["render/denoiseDevice-selfcheck.mjs", "render/denoiseTiming-selfcheck.mjs", "render/denoiseCompile-selfcheck.mjs", "brain/conv2d-selfcheck.mjs",
        "tools/ship/deviceCompute-selfcheck.mjs", "tools/ship/badTvWgsl-selfcheck.mjs", "tools/ship/bloomFusedTexture-selfcheck.mjs"];
    console.log(`  ----  the whole native sweep here: ${tree.length} gates`);
    ok("!! section 69: the tree's native sweep holds the denoiser's three device gates, conv2d, the compute gates, and the gates that import a runner under another name -- and not this gate, which names them only in strings",
       must.every((g) => tree.includes(g)) && !tree.includes("tools/ship/realGpuRun-selfcheck.mjs") && tree.every((g) => NATIVE_USE.test(fs.readFileSync(path.join(ENG, g), "utf8"))) &&
       JSON.stringify(tree) === JSON.stringify([...tree].sort()), `${tree.length}: ${must.filter((g) => !tree.includes(g)).join(", ") || "all named present"}`);
    // the native sweep hands the browser no flags of its own: the gates take theirs, as in a verify, so the only difference between
    // two native sweeps is the package -- an FSR run's hardware flags would redden SwiftShader-measured rows on both packages alike
    ok("!! section 69: the native sweep's browser flags are the gates' own unless SWEK_LAUNCH_ARGS names some -- never the hardware set an FSR run takes",
       nativeLaunchArgs({}) === null && JSON.stringify(nativeLaunchArgs({ SWEK_LAUNCH_ARGS: " --a  --b " })) === '["--a","--b"]' &&
       JSON.stringify(runLaunchArgs({}, "win32")) !== JSON.stringify(nativeLaunchArgs({})),
       `unset: ${JSON.stringify(nativeLaunchArgs({}))}; an FSR run on win32 unset: ${JSON.stringify(runLaunchArgs({}, "win32"))}`);
    // section 69's rule on fixtures: a pinned sweep and a candidate's, gate by gate
    const sweep = (v, gates, commit = "abc1234 2026-10-13 a commit") => ({ commit, nodeWebgpu: { version: v }, gates: gates.map(([gate, ok, fails = []]) => ({ gate, ok, fails })) });
    const P0 = sweep("0.6.0", [["g/a", true], ["g/b", false, ["FAIL  !! row x   worst 1.2e-3"]], ["g/c", false, ["FAIL  row y   3"]]]);
    const cmp = (gates, v = "0.6.2") => nativeSweepCompare(P0, sweep(v, gates));
    const held = cmp([["g/a", true], ["g/b", false, ["FAIL  !! row x   worst 9.9e-3"]], ["g/c", true]]);
    const regress = cmp([["g/a", false, ["FAIL  row z   1"]], ["g/b", false, ["FAIL  !! row x   1"]], ["g/c", true]]);
    const changed = cmp([["g/a", true], ["g/b", false, ["FAIL  !! row w   1"]], ["g/c", true]]);
    const unpaired = cmp([["g/a", true], ["g/b", false, ["FAIL  !! row x   1"]]]), samePkg = cmp([["g/a", true], ["g/b", true], ["g/c", true]], "0.6.0");
    ok("!! section 69's rule: a gate holds green under the candidate, or red under BOTH with the same failing rows (whatever their numbers); a regression, a changed red, a gate missing from one sweep, two sweeps of one package, or of two commits, do not",
       held.ok && held.count.green === 1 && held.count["shared-red"] === 1 && held.count.fixed === 1 &&
       !regress.ok && regress.bad.map((r) => r.gate + ":" + r.kind).join() === "g/a:regression" &&
       !changed.ok && changed.bad.map((r) => r.gate + ":" + r.kind).join() === "g/b:changed" &&
       !unpaired.ok && unpaired.bad.map((r) => r.gate + ":" + r.kind).join() === "g/c:unpaired" && !samePkg.ok && !nativeSweepCompare(P0, { gates: [] }).ok &&
       !nativeSweepCompare(P0, sweep("0.6.2", [["g/a", true], ["g/b", true], ["g/c", true]], "def5678 2026-10-13 another")).ok && held.commit === "abc1234",
       `held ${JSON.stringify(held.count)}; regression ${regress.bad.length}, changed ${changed.bad.length}, unpaired ${unpaired.bad.length}, same package ${samePkg.ok}`);
    // section 69's condition H: the pilot here, both sweeps at one commit, committed as written and held to the rule
    const pil = (v) => JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", `native-sweep-r69-linux-${v}.json`), "utf8"));
    const H69 = nativeSweepCompare(pil("0.6.0"), pil("0.6.2")), swept = new Set(H69.rows.map((r) => r.gate)), since = tree.filter((g) => !swept.has(g));
    console.log(`  ----  section 69, H (here): ${H69.pinned} against ${H69.candidate} at ${H69.commit}: ${JSON.stringify(H69.count)}` +
                (since.length ? `; native gates added since, not in the pilot: ${since.join(", ")}` : ""));
    ok("!! *** section 69, condition H: the pilot's two native sweeps here -- 0.6.0 and 0.6.2, one commit -- hold by the rule: every gate green under 0.6.2, none a regression ***",
       H69.ok && H69.pinned === "0.6.0" && H69.candidate === "0.6.2" && H69.count.regression === 0 && H69.rows.length >= 26 && pil("0.6.2").native === true && pil("0.6.0").native === true,
       `${H69.rows.length} gates, ${H69.bad.length} failing the rule`);
    // the CLI's --native: an --only that matches no native gate still says so, exits 1, and marks its report as the native sweep
    const tmp = path.join(os.tmpdir(), `swek-realgpu-native-${process.pid}.json`);
    const { SWEK_LAUNCH_ARGS: _unset, ...envNoArgs } = process.env;
    const r = spawnSync(process.execPath, ["tools/ship/realGpuRun.mjs", "--native", "--only", "no-such-gate-anywhere", "--out", tmp], { cwd: ENG, encoding: "utf8", timeout: 60000, env: envNoArgs });
    const rep = fs.existsSync(tmp) ? JSON.parse(fs.readFileSync(tmp, "utf8")) : null;
    try { fs.unlinkSync(tmp); } catch {}
    ok("  section 69: realGpuRun --native is accepted, says it is the native sweep, and its report carries native: true, the package it ran on, and no browser flags of its own",
       r.status === 1 && !!rep && rep.native === true && rep.gates.length === 0 && /the whole native sweep/.test(r.stdout || "") && !!rep.nodeWebgpu && "version" in rep.nodeWebgpu && rep.launchArgs === null,
       `exit ${r.status}; native ${rep && rep.native}; ${(r.stderr || "").split("\n")[0].slice(0, 100)}`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real GPU -- the run exists for one and this box has none; the whole run, 8 min 25 s on SwiftShader, " +
    "measured once and too long for a gate -- two gates here; and which Linux flags reach which GPU, which the doc offers as a first try, not a finding.");
process.exitCode = fails ? 1 : 0;
