// WebGLEngine/tools/ship/takeSnowFrameTiming.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/takeSnowFrameTiming.mjs [--sizes 320x180,1280x720] [--frames 30] [--warmup 2] [--out snow-frame-timing.json]
//                                          [--passes] [--shadow-res 1024] [--shadow-sweep] [--bracket] [--ablate]     --passes adds a per-pass GPU-millisecond line a size (timestamp queries);
//                                          [--ablate] [--terms shadow,sss,...]     --ablate times the BEAUTY pass with each shading term compiled out of the shader (baseline, term, baseline, ... so drift cancels) and prints what each is worth;
//                                          (`--terms hoist,coarse` are the two terms that remove nothing: hoist times the pass with the fine relief's slow fields (windLocal, scour) read from the vertex stage, coarse with the detail layer fading out sooner and the haze skipping the sky reads that cannot show -- each against the exact path)
//                                          --shadow-res times with another shadow map size;
//                                          --shadow-sweep times every size at shadow maps of 2048, 1024 and 512 in one run (the comparison the shadow cost needs);
//                                          --bracket times the first configuration AGAIN at the end and prints the drift between the two (thermal and power state move a laptop GPU by tens of percent over a run)
//
// THE COMMAND FOR render/snowFrameTiming.mjs: the snow frame graph timed on a NATIVE device (D3D12 on Windows, the Vulkan software adapter on this sandbox), one reading line a size. NO EXPORTS ON PURPOSE
// (the library is held by this file and graded by render/snowFrameTiming-selfcheck.mjs). It is the answer to the browser route on the Windows rig landing on the software adapter: this one reaches the GPU.
// Send back the JSON it writes (adapter name, sizes, per-frame milliseconds -- nothing else). Exits 1 on a GPU error or no adapter, 0 otherwise; it ends through headlessGpu's exitCleanly (Dawn's teardown race).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseOrExit } from "./cliArgs.mjs";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, exitCleanly, FINE_CLOCK_FLAG } from "./headlessGpu.mjs";
import { ABLATION_NAMES } from "../../render/snowAblate.mjs";
import { FORM_TERMS, timeFrames, timingLine, passLine, bracketLine, ablationRows, ablationLine, runAblation, summarise, DEFAULT_SIZES, TIMED_FRAMES, WARMUP_FRAMES } from "../../render/snowFrameTiming.mjs";

const cli = parseOrExit("takeSnowFrameTiming", { values: { "--sizes": "string", "--frames": "number", "--warmup": "number", "--out": "path", "--shadow-res": "number", "--terms": "string" }, flags: ["--passes", "--shadow-sweep", "--bracket", "--ablate"] });
const shadowRes = cli.values["--shadow-res"] ?? 0, wantPasses = cli.flags.has("--passes"), shadowList = cli.flags.has("--shadow-sweep") ? [2048, 1024, 512] : [shadowRes], frames = cli.values["--frames"] ?? TIMED_FRAMES, warmup = cli.values["--warmup"] ?? WARMUP_FRAMES;
const sizes = cli.values["--sizes"] ? cli.values["--sizes"].split(",").map((s) => s.trim().split("x").map(Number)) : DEFAULT_SIZES.map((s) => [...s]);
if (sizes.some((s) => s.length !== 2 || !s.every((v) => Number.isInteger(v) && v >= 16 && v <= 4096))) { console.error("[takeSnowFrameTiming] --sizes wants WIDTHxHEIGHT pairs, 16..4096 each, e.g. 320x180,1280x720"); exitCleanly(2); }
if (shadowRes && !([256, 512, 1024, 1536, 2048, 4096].includes(shadowRes))) { console.error("[takeSnowFrameTiming] --shadow-res wants 256, 512, 1024, 1536, 2048 or 4096"); exitCleanly(2); }
const terms = cli.values["--terms"] ? cli.values["--terms"].split(",").map((t) => t.trim()) : [...ABLATION_NAMES, "all"];
if (cli.flags.has("--ablate") && terms.some((t) => t !== "all" && !FORM_TERMS[t] && !ABLATION_NAMES.includes(t))) { console.error("[takeSnowFrameTiming] --terms wants some of: " + ABLATION_NAMES.join(", ") + ", " + Object.keys(FORM_TERMS).join(", ") + ", all"); exitCleanly(2); }
if (!(Number.isInteger(frames) && frames >= 3 && Number.isInteger(warmup) && warmup >= 1)) { console.error("[takeSnowFrameTiming] --frames wants an integer >= 3 and --warmup an integer >= 1"); exitCleanly(2); }

const require_ = createRequire(import.meta.url);
const skip = headlessGpuSkipReason(require_);
if (skip) { console.log("[takeSnowFrameTiming] SKIPPED -- " + skip); exitCleanly(0); }
configureVulkanIcd();
const { mod } = resolveWebgpu(require_);
Object.assign(globalThis, mod.globals || {});
const gpu = mod.create([FINE_CLOCK_FLAG]);   // the fine clock: timestamp queries are not rounded to 100 us   // kept reachable on purpose: a Dawn instance collected under a live device is the 0xC0000005 / SIGSEGV headlessGpu.mjs's v4691 note measured
const adapter = await gpu.requestAdapter();
if (!adapter) { console.log("[takeSnowFrameTiming] requestAdapter() returned null -- no GPU to time"); exitCleanly(1); }
const info = adapter.info || {}, name = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || "unknown adapter";
console.log("[takeSnowFrameTiming] adapter: " + name + (/swiftshader|llvmpipe|software/i.test(name) ? "  *** SOFTWARE: these times are a CPU's ***" : ""));
const hasTs = adapter.features && adapter.features.has("timestamp-query");
if (wantPasses && !hasTs) console.log("[takeSnowFrameTiming] this adapter has no timestamp-query: --passes will print nothing");
const device = await adapter.requestDevice({ requiredFeatures: hasTs ? ["timestamp-query"] : [] });
const out = { generatedFrom: "tools/ship/takeSnowFrameTiming.mjs", at: new Date().toISOString(), platform: process.platform + " " + process.arch, adapter: name, frames, warmup, runs: [] };
let bad = 0, first = null;
for (const sr of shadowList) for (const [w, h] of sizes) {
    const r = await timeFrames(device, { width: w, height: h, warmup, frames, shadowRes: sr });
    await new Promise((res) => setTimeout(res, 50));   // an uncaptured error arrives after the queue is idle
    if (r.errors.length) bad++;
    if (!first) first = { r, w, h, sr };
    console.log("  ----  " + timingLine(r, name));
    if (r.errors.length) console.log("  FAIL  GPU errors at " + w + "x" + h + ": " + r.errors.slice(0, 3).join(" | ").slice(0, 300));
    let passRun = null;
    if (wantPasses && hasTs) {
        passRun = await timeFrames(device, { width: w, height: h, warmup, frames, shadowRes: sr, passTimers: true });
        console.log("  ----  " + passLine(passRun, name, summarise(r.perFrame).median));
    }
    out.runs.push({ width: w, height: h, shadowRes: sr || 2048, passes: passRun ? Object.fromEntries(Object.entries(passRun.passes).map(([n, l]) => [n, summarise(l.map((v) => Math.max(v, 1e-6)))])) : null, perFrame: r.perFrame, encode: r.encode, batchedMs: r.batchedMs, batchedFrames: r.batchedFrames, errors: r.errors, summary: summarise(r.perFrame) });
}
if (cli.flags.has("--ablate")) {
    if (!hasTs) console.log("[takeSnowFrameTiming] --ablate needs timestamp-query, which this adapter lacks: nothing to time");
    else for (const [w, h] of sizes) {
        const seq = await runAblation(device, { width: w, height: h, terms, warmup, frames, shadowRes: shadowList[0] });
        const rows = ablationRows(seq).sort((a, b) => b.saves - a.saves);
        for (const row of rows) console.log("  ----  " + ablationLine(w, h, shadowList[0], row, name));
        out.ablation = (out.ablation || []).concat([{ width: w, height: h, shadowRes: shadowList[0] || 2048, sequence: seq, rows }]);
    }
}
if (cli.flags.has("--bracket") && first) {
    const again = await timeFrames(device, { width: first.w, height: first.h, warmup, frames, shadowRes: first.sr });
    console.log("  ----  " + bracketLine({ ...first.r, shadowRes: first.sr }, again, name));
    out.bracket = { width: first.w, height: first.h, shadowRes: first.sr || 2048, start: summarise(first.r.perFrame).median, end: summarise(again.perFrame).median };
}
if (cli.values["--out"]) { fs.writeFileSync(path.resolve(cli.values["--out"]), JSON.stringify(out, null, 1)); console.log("[takeSnowFrameTiming] wrote " + cli.values["--out"]); }
exitCleanly(bad ? 1 : 0);
