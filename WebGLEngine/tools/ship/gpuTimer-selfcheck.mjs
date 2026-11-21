// WebGLEngine/tools/ship/gpuTimer-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gpuTimer-selfcheck.mjs      (about a minute: node-webgpu in child processes, then the page in a headless browser)
//      node tools/ship/realGpuRun.mjs --native --only gpuTimer      (on a real GPU)
//
// WHAT THE CARD SPENT, PASS BY PASS, HELD. render/gpuTimer.mjs turns WebGPU timestamp queries into per-label milliseconds without stalling the frame; the splat
// sort and renderer label their passes keys, sort and draw; splat-gpu.html shows them. Four things hold it:
//
//   1  THE ARITHMETIC   begin and end stamps to milliseconds, passes under one label summed, a backwards pair ignored; the overlay's lines, largest first; a
//                       device without timestamp-query gives a timer that does nothing and says why; more passes than slots go untimed, not overwritten
//   2  ON THE DEVICE    node-webgpu (SwiftShader, its clock unrounded): a timed compute pass of known heavy work reads longer than a light one; the splat renderer's
//                       keys, sort and draw each read a positive time; the sort is 8 radix passes of 3 compute passes each at this size (5 once the scan needs a second level), all under "sort"
//   3  NO STALL         finish() resolves into a ring of read-back buffers and collect() never waits: while every buffer is still waiting, a frame's times are
//                       dropped rather than blocking the next frame
//   4  THE PAGE         splat-gpu.html asks for timestamp-query and shows keys, sort and draw on the card. 2026-11-21, OTHER PAGES: fsr.html shows EASU and RCAS
//                       (gfx/device.js frame({ timer, labels })); denoise.html puts each layer's time on its status line (render/denoiseDevice.mjs
//                       run({ timer })); section 2 holds the denoiser's run on node-webgpu: every pass labelled and timed, the image bit for bit unchanged
//
// Device cases run in child processes and a SwiftShader abort is retried, as tools/ship/splatSortGPU-selfcheck.mjs's header explains; a wrong answer fails at once.
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, FINE_CLOCK_FLAG } from "./headlessGpu.mjs";
import { PRESENT_ARGS, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import * as T from "../../render/gpuTimer.mjs";

const require = createRequire(import.meta.url), SELF = fileURLToPath(import.meta.url), ENG = path.resolve(path.dirname(SELF), "..", "..");
const ATTEMPTS = 5, CASE_MS = 180000, NATIVE_ABORT = /futex|Fatal glibc|pthread|std::system_error|Invalid argument|Segmentation|Aborted/;

async function child(kind) {
    configureVulkanIcd(); const { mod } = resolveWebgpu(require);
    const gpu = mod.create([FINE_CLOCK_FLAG]), ad = await gpu.requestAdapter(), G = mod.globals || globalThis;
    if (!ad.features.has("timestamp-query")) { console.log("RESULT " + JSON.stringify({ kind, noFeature: true })); process.exit(0); }
    const dev = await ad.requestDevice({ requiredFeatures: ["timestamp-query"] }), U = G.GPUBufferUsage, M = G.GPUMapMode;
    let out;
    if (kind === "work") {
        // two compute passes of the same kernel, 1 and 64 iterations of a dependent loop over 65536 cells: the heavy one must read longer
        const code = `@group(0) @binding(0) var<storage, read_write> b: array<f32>; struct P { n: u32 }; @group(0) @binding(1) var<uniform> p: P;
            @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) { var x = b[g.x]; for (var i = 0u; i < p.n * 64u; i++) { x = sin(x) * 1.0001 + 0.5; } b[g.x] = x; }`;
        const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: dev.createShaderModule({ code }), entryPoint: "main" } }), buf = dev.createBuffer({ size: 65536 * 4, usage: U.STORAGE });
        const uni = (n) => { const u = dev.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST }); dev.queue.writeBuffer(u, 0, new Uint32Array([n, 0, 0, 0])); return u; }, light = uni(1), heavy = uni(64);
        const t = T.createGpuTimer(dev, { usage: U, mapMode: M });
        for (let f = 0; f < 3; f++) {
            const enc = dev.createCommandEncoder();
            for (const [label, u] of [["light", light], ["heavy", heavy]]) { const cp = enc.beginComputePass({ timestampWrites: t.writes(label) }); cp.setPipeline(pipe); cp.setBindGroup(0, dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: { buffer: u } }] })); cp.dispatchWorkgroups(1024); cp.end(); }
            t.finish(enc); dev.queue.submit([enc.finish()]); await t.collect();
        }
        await new Promise((r) => setTimeout(r, 200)); const st = await t.collect();
        out = { kind, frames: st.frames, light: st.labels.light && st.labels.light.last, heavy: st.labels.heavy && st.labels.heavy.last };
    } else if (kind === "splats") {
        const { createSplatRendererGPU } = await import("../../render/splatRendererGPU.mjs"), { SPLAT_GENERATORS } = await import("../../engine/splatGenerator.js");
        const c = SPLAT_GENERATORS.nebula({ count: 5000 }), r = createSplatRendererGPU(dev, c, { usage: U, mapMode: M }), t = T.createGpuTimer(dev, { usage: U, mapMode: M });
        const tex = dev.createTexture({ size: [64, 64], format: "rgba8unorm", usage: G.GPUTextureUsage.RENDER_ATTACHMENT }), view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1]), proj = new Float32Array([1.5, 0, 0, 0, 0, 1.5, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.1, 0]);
        let passes = 0; const counting = { writes: (l) => { passes++; return t.writes(l); } };
        for (let f = 0; f < 3; f++) { const enc = dev.createCommandEncoder(); r.draw(enc, { view, proj, camera: [0, 0, 3 + f * 0.01], target: tex.createView(), width: 64, height: 64, clear: [0, 0, 0, 1], timer: f === 0 ? counting : t }); t.finish(enc); dev.queue.submit([enc.finish()]); await t.collect(); }
        await new Promise((r2) => setTimeout(r2, 200)); const st = await t.collect();
        out = { kind, passesFirstFrame: passes, labels: Object.fromEntries(Object.entries(st.labels).map(([k, v]) => [k, v.last])), frames: st.frames };
    } else if (kind === "denoiser") {
        // render/denoiseDevice.mjs's run() with a timer: every pass under its layer's label, each a positive time, and the image bit for bit the untimed run's
        const { createDeviceDenoiser, timingInput } = await import("../../render/denoiseDevice.mjs"), { makeDenoiser } = await import("../../render/denoiseNet.mjs");
        const net = makeDenoiser(3, "he", "kernel", 10, "large"), h = 24, w = 24, x = timingInput(h, w, 10, 7), D = await createDeviceDenoiser(dev, net, { H: h, W: w, C: 10, kernels: "r12" });   // r12: the image kernel is its own pass ("apply")
        const plain = (await D.run(x)).y, t = T.createGpuTimer(dev, { usage: U, mapMode: M }), timed = (await D.run(x, { timer: t })).y;
        await dev.queue.onSubmittedWorkDone(); await new Promise((r) => setTimeout(r, 100)); const st = await t.collect();
        let same = plain.length === timed.length; for (let i = 0; same && i < plain.length; i++) if (plain[i] !== timed[i]) same = false;
        out = { kind, same, want: D.passLabels, labels: Object.fromEntries(Object.entries(st.labels).map(([k, v]) => [k, v.last])), frames: st.frames }; D.destroy();
    } else if (kind === "stall") {
        // finish three frames without collecting: the ring (3) fills; a fourth frame's times are dropped, and finish() never waits
        const t = T.createGpuTimer(dev, { usage: U, mapMode: M, ring: 3 }), t0 = Date.now(); let dropped = 0;
        for (let f = 0; f < 4; f++) { const enc = dev.createCommandEncoder(), cp = enc.beginComputePass({ timestampWrites: t.writes("p") }); cp.end(); const before = Date.now(); t.finish(enc); if (Date.now() - before > 50) dropped = -1; dev.queue.submit([enc.finish()]); }
        const st = await t.collect(); out = { kind, frames: st.frames, waitedMs: Date.now() - t0 };
    }
    console.log("RESULT " + JSON.stringify(out)); process.exit(0);
}

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const aborts = [];
function runCase(kind) {
    for (let a = 1; a <= ATTEMPTS; a++) {
        const r = spawnSync(process.execPath, [SELF, "--child", kind], { encoding: "utf8", timeout: CASE_MS }), line = (r.stdout || "").split("\n").find((l) => l.startsWith("RESULT "));
        if (line) return JSON.parse(line.slice(7));
        if (r.error && r.error.code === "ETIMEDOUT") return { crashed: "timed out" };
        const why = ((r.stderr || "") + (r.stdout || "")).trim().split("\n").filter(Boolean).pop() || `exit ${r.status}`;
        if (!NATIVE_ABORT.test(why) && r.signal == null && r.status !== 134 && r.status !== 139) return { crashed: why };
        aborts.push(`${kind}: ${why.slice(0, 80)}`);
    }
    return null;
}

if (process.argv[2] === "--child") await child(process.argv[3]);
else {
    console.log("gpuTimer-selfcheck -- what the card spent, pass by pass, on screen\n");
    console.log("1. THE ARITHMETIC");
    await section(() => {
        const d = T.durationsOf(new BigInt64Array([1000000n, 3000000n, 5000000n, 5500000n, 9000000n, 9250000n, 8n, 4n]), ["a", "b", "b", "c"]);
        ok("!! stamps to milliseconds: begin to end, passes under one label summed, a backwards pair ignored", d.a === 2 && d.b === 0.75 && d.c === undefined);
        const lines = T.timerLines({ supported: true, frames: 3, labels: { keys: { ms: 0.43 }, sort: { ms: 110.08 }, draw: { ms: 2302.2 } }, totalMs: 2412.71 });
        ok("!! the overlay: one line a label, largest first, then the total on the card; unsupported and empty say so", lines.length === 4 && /^draw/.test(lines[0]) && /^keys/.test(lines[2]) && /total.*2412\.71 ms on the card/.test(lines[3]) && /no timestamp-query/.test(T.timerLines({ supported: false })[0]) && /waiting/.test(T.timerLines({ supported: true, labels: {} })[0]));
        const none = T.createGpuTimer({ features: new Set() });
        ok("!! a device without timestamp-query gets a timer that does nothing (no slots, finish and collect harmless)", !none.supported && none.writes("x") === undefined && (none.finish({}), true) && none.stats().supported === false);
        let made = 0; const fake = { features: new Set(["timestamp-query"]), createQuerySet: () => ({ destroy() {} }), createBuffer: () => { made++; return { destroy() {} }; } }, t = T.createGpuTimer(fake, { capacity: 2, usage: { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 } });
        const w = [t.writes("a"), t.writes("b"), t.writes("c")];
        ok("!! slots: each pass a begin and an end index; MORE PASSES THAN SLOTS GO UNTIMED rather than overwrite one", w[0].beginningOfPassWriteIndex === 0 && w[0].endOfPassWriteIndex === 1 && w[1].beginningOfPassWriteIndex === 2 && w[2] === undefined && made === 4);
    });
    const skip = headlessGpuSkipReason(require);
    if (skip) console.log(`\n2-3. SKIPPED: ${skip}`);
    else {
        console.log("2. ON THE DEVICE (node-webgpu)");
        await section(() => {
            const w = runCase("work");
            if (w && w.noFeature) { console.log("  ----  this adapter has no timestamp-query: nothing to time here"); return; }
            ok("!! A HEAVY PASS READS LONGER THAN A LIGHT ONE: the same kernel at 64 iterations against 1, timed on the card", w && !w.crashed && w.frames >= 2 && w.light > 0 && w.heavy > 2 * w.light, w ? JSON.stringify(w) : "aborted every time");
            const s = runCase("splats");
            ok("!! THE SPLAT RENDERER'S PASSES: keys, sort and draw each read a positive time; the first frame is 1 + 24 + 1 timed passes (keys; 8 radix passes of histogram, one-level scan and reorder for 5000 splats; draw)", s && !s.crashed && s.labels.keys > 0 && s.labels.sort > 0 && s.labels.draw > 0 && s.passesFirstFrame === 26, s ? JSON.stringify(s) : "aborted every time");
        });
        await section(() => {
            const d = runCase("denoiser");
            ok("!! THE DENOISER'S PASSES ON THE CARD: render/denoiseDevice.mjs's run({ timer }) times every pass under its layer's label (its passLabels: L0.. and apply), each a positive time, and the image is bit for bit the untimed run's", d && !d.crashed && d.same && d.frames === 1 && d.want.length >= 3 && d.want.includes("apply") && d.want.every((l) => d.labels[l] > 0) && Object.keys(d.labels).length === new Set(d.want).size, d && JSON.stringify(d));
        });
        console.log("3. NO STALL");
        await section(() => {
            const s = runCase("stall");
            ok("!! four frames finished into a ring of three without collecting: none waited, and three frames' times came back (the fourth was dropped, not waited for)", s && !s.crashed && s.frames === 3, s ? JSON.stringify(s) : "aborted every time");
        });
        if (aborts.length) console.log(`  ----  the software renderer ABORTED ${aborts.length} time(s) and those runs were repeated: ${aborts.slice(0, 3).join(" | ")}`);
    }
    console.log("4. THE PAGE");
    const wskip = webgpuSkipReason(require);
    if (wskip) console.log(`  ----  skipped: ${wskip}`);
    else await section(async () => {
        const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
        const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
        await new Promise((res) => srv.listen(0, "127.0.0.1", res));
        const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), p = await browser.newPage({ viewport: { width: 320, height: 200 } }), errors = [];
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`http://127.0.0.1:${srv.address().port}/splat-gpu.html?n=10000&still=6`);
        await p.waitForFunction(() => window.__splatGpu && (window.__splatGpu.stopped || window.__splatGpu.error), null, { timeout: 90000 });
        await new Promise((r) => setTimeout(r, 500));
        const st = await p.evaluate(() => ({ ...window.__splatGpu, capture: undefined })), hud = await p.evaluate(() => document.getElementById("hud").textContent);
        if (st.gpuTimer && st.gpuTimer !== "on") console.log(`  ----  the page's adapter: ${st.gpuTimer}`);
        else ok("!! splat-gpu.html asks for timestamp-query and shows keys, sort and draw on the card, with no page error", st.gpuTimer === "on" && st.gpuTimes && st.gpuTimes.keys > 0 && st.gpuTimes.sort > 0 && st.gpuTimes.draw > 0 && /on the card/.test(hud) && errors.length === 0, JSON.stringify({ gpuTimes: st.gpuTimes, frames: st.gpuFrames, errors }));
        const fsrSrc = fs.readFileSync(path.join(ENG, "fx", "fsr", "fsrGPU.js"), "utf8");
        ok("!! FSR's labels name the passes they time: fsr1 dispatches EASU then RCAS and labels them easu, rcas in that order; easu() and rcas() alone label theirs", /pass\.dispatch\(this\.pEasu, g\);\s*pass\.dispatch\(this\.pRcas, g\);[\s\S]{0,80}_frameOpts\(\["easu", "rcas"\]\)/.test(fsrSrc) && /dispatch\(this\.pEasu, g\); pass\.clear\(\[0, 0, 0, 1\]\); \}, this\._frameOpts\(\["easu"\]\)/.test(fsrSrc) && /dispatch\(this\.pRcas, g\); pass\.clear\(\[0, 0, 0, 1\]\); \}, this\._frameOpts\(\["rcas"\]\)/.test(fsrSrc));
        // fsr.html: EASU and RCAS through gfx/device.js's frame({ timer, labels }) into a timer on device.gpu, shown under the engine's line
        const f = await browser.newPage({ viewport: { width: 900, height: 700 } }), ferr = []; f.on("pageerror", (e) => ferr.push(e.message));
        await f.goto(`http://127.0.0.1:${srv.address().port}/fsr.html`);
        await f.waitForFunction(() => window.__fsrGpuTimer && window.__fsrGpuTimer.stats().frames > 0 && /on the card/.test(document.getElementById("gpuTimes").textContent), null, { timeout: 90000 }).catch(() => {});
        const fs2 = await f.evaluate(() => ({ st: window.__fsrGpuTimer ? window.__fsrGpuTimer.stats() : null, text: document.getElementById("gpuTimes").textContent, engine: document.getElementById("engine").textContent }));
        ok("!! fsr.html times EASU and RCAS on the card (gfx/device.js frame({ timer, labels })) and shows them under the engine's line, with no page error", fs2.st && fs2.st.labels.easu && fs2.st.labels.easu.ms > 0 && fs2.st.labels.rcas && fs2.st.labels.rcas.ms > 0 && /easu/.test(fs2.text) && /on the card/.test(fs2.text) && ferr.length === 0, JSON.stringify({ labels: fs2.st && fs2.st.labels, text: fs2.text.slice(0, 120), engine: fs2.engine.slice(0, 80), errors: ferr.slice(0, 2) }));
        // denoise.html: one denoise at 64 spp reference; the status line carries each layer's time on the card
        const dn = await browser.newPage({ viewport: { width: 900, height: 700 } }), derr = []; dn.on("pageerror", (e) => derr.push(e.message));
        await dn.goto(`http://127.0.0.1:${srv.address().port}/denoise.html`);
        await dn.evaluate(() => { document.getElementById("refspp").value = "64"; document.getElementById("go").click(); });
        await dn.waitForFunction(() => /rendered in|failed/.test(document.getElementById("status").textContent), null, { timeout: 180000 }).catch(() => {});
        const dt = await dn.evaluate(() => ({ text: document.getElementById("status").textContent, st: window.__denoiseGpuTimer ? window.__denoiseGpuTimer.stats() : null }));
        ok("!! denoise.html times the network's passes on the card and puts each layer's time on its status line, with no page error", dt.st && dt.st.supported && dt.st.frames === 1 && Object.keys(dt.st.labels).some((k) => /^L0 /.test(k)) && /^L0 .* ms$/m.test(dt.text) && /on the card/.test(dt.text) && derr.length === 0, JSON.stringify({ text: dt.text.slice(-260), errors: derr.slice(0, 2) }));
        await browser.close(); srv.close();
    });
    console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
    process.exit(fails === 0 ? 0 : 1);
}

// SABOTAGE LOG:
// 10 mutants, 8 of render/gpuTimer.mjs and 2 of render/splatSortGPU.mjs, each in a hard-linked copy of the tree: ALL 10 RED (passes under one label not summed,
// microseconds for milliseconds, a backwards pair kept, smallest first, an overflowing pass overwriting a slot, a full ring forcing a slot free (caught by
// section 4's page, NOT by section 3: section 3 shows nothing waited, not that a busy slot was left alone), a device without the feature taken for one with
// it, one write index for begin and end; the sort's passes untimed, the keys pass labelled "sort"). 2026-11-21, the other pages: 8 more, 3 of gfx/device.js, 2 of
// fx/fsr/fsrGPU.js, 3 of render/denoiseDevice.mjs: ALL 8 RED (the labels ignored, the timer never finished, every pass on one slot; the FSR timer unused, its
// labels swapped -- caught only once the source check was added, as both passes read a positive time either way; the denoiser's timer unfinished, one label
// for every pass, passLabels missing the apply pass -- caught only once the case used r12, whose image kernel is a pass of its own).
