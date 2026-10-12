// WebGLEngine/tools/denoiseBuildProbe.mjs -- the denoiser arc, section 56: which kernel shapes FXC can build
//
// Run:  node tools/denoiseBuildProbe.mjs [--probe r17|r16] [--sizes 64,256,1024] [--out <file>] [--cap <seconds>]
//                                          [--native-only | --browser-only] [--dxc on|off]
//
// --dxc (round 19's probe, section 64): natively, ask Dawn for DXC (on) or forbid it (off); without it Dawn chooses. Only
// a package whose Dawn loads DXC can honour "on" -- node-webgpu 0.6.2 is the first, and ships dxcompiler.dll beside dawn.node
// (section 64); 0.6.0's never did (sections 52-53). Each shape's dump names the compiler that really ran, whatever was asked.
// SWEK_WEBGPU=<package dir> runs a node-webgpu other than the one the tree resolves (tools/ship/headlessGpu.mjs).
//
// --probe r17 (the default; section 59): round 17's shapes, render/denoiseCompile.mjs's BUILD_PROBE_R17, each built ONCE and
// timed at every size in --sizes (default 64, 256 and 1024), held to the twin at 64 x 64. --probe r16 is section 56's list,
// BUILD_PROBE, at 64 x 64 alone, as it ran then.
//
// Round 16's first rig runs stopped every denoiser gate at realGpuRun's 30-minute cap, on both GPUs, in each gate's native
// part (section 56): node-webgpu's FXC never finished the pixel-tiled kernel's pipeline. This builds and runs each kernel
// shape in render/denoiseCompile.mjs's BUILD_PROBE once:
//   - natively, each in its OWN PROCESS, stopped at --cap seconds (default 180) -- a shape FXC cannot finish costs the cap,
//     not the run. A stopped shape says so; nothing of it is lost but its build;
//   - then in Chrome, from the engine's origin, on the browser's own adapter (its D3D12 compiler is DXC), the same list,
//     each raced against the same cap -- launched with realGpuRun's hardware flags (section 57: without them, on Windows,
//     the harness asks Chrome for SwiftShader, and the first probes' Chrome rows were SwiftShader's).
// Per shape: whether it built, the build's wall-clock time, a pass on the device's clock at each size, and whether every cell
// at 64 x 64 is the twin's or the fused mirror's -- render/denoiseCompile.mjs's measureSizes() -- and, natively, what Dawn's
// shader dump says FXC made of it. The report is rewritten after every shape, so a run stopped part way keeps what it measured.
// It decides nothing itself: sections 56 and 59 fix what each probe's results may choose. It exports nothing.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { BUILD_PROBE, BUILD_PROBE_R17, jobFor, measureSizes, dumpStats, dawnFlags } = await imp("render/denoiseCompile.mjs");
const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROBES = { r16: BUILD_PROBE, r17: BUILD_PROBE_R17 }, PROBE = arg("--probe") || "r17";
if (!PROBES[PROBE]) { console.log(`[denoiseBuildProbe] no probe "${PROBE}" -- the probes are ${Object.keys(PROBES).join(", ")}`); process.exit(2); }
const DXC = arg("--dxc");
if (DXC !== null && DXC !== "on" && DXC !== "off") { console.log(`[denoiseBuildProbe] --dxc is "on" or "off", not "${DXC}"`); process.exit(2); }
const DXC_FLAGS = DXC === "on" ? ["enable-dawn-features=use_dxc"] : DXC === "off" ? ["disable-dawn-features=use_dxc"] : [];
const SHAPES = PROBES[PROBE], SIZES = (arg("--sizes") || (PROBE === "r16" ? "64" : "64,256,1024")).split(",").map(Number);
if (!SIZES.length || SIZES.some((n) => !(n >= 8 && n % 8 === 0)) || SIZES[0] !== 64) { console.log("[denoiseBuildProbe] --sizes are multiples of 8, the first 64 (where each shape is held to the twin)"); process.exit(2); }

// ---- THE CHILD: one shape, node-webgpu's default adapter, Dawn's shader dump on stdout -----------------------------
if (args.includes("--child")) {
    const id = arg("--child"), out = arg("--result");
    const H = await imp("tools/ship/headlessGpu.mjs");
    let result;
    try {
        H.configureVulkanIcd();
        // section 61: the device's clock unrounded -- round 17's native times were all whole multiples of 65,536 ns (section 60)
        // section 64: one entry per key -- the fine clock's disable entry and --dxc off's merged, as the compile gate's children
        const { mod } = H.resolveWebgpu(), gpu = mod.create(dawnFlags([...DXC_FLAGS, H.FINE_CLOCK_FLAG]));
        const v = SHAPES.find((x) => x.id === id), a = await gpu.requestAdapter(), info = a.info || {};
        const dev = await a.requestDevice({ requiredFeatures: a.features.has("timestamp-query") ? ["timestamp-query"] : [], // a device that can hold the largest size's buffers (a 32-channel layer at 1024 x 1024 is 128 MiB a buffer): storage
        // limits only, spelled out so tools/ship/wgslSpec-selfcheck.mjs can read that no workgroup limit is raised
        requiredLimits: { maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxBufferSize: a.limits.maxBufferSize } });
        try { result = { ...(await measureSizes(dev, v, SIZES)), adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") }; }
        finally { dev.destroy(); }
    } catch (e) { result = { built: false, reason: String(e && e.message || e).slice(0, 300) }; }
    // the result goes to a file first: on Windows a write to a pipe may still be queued when the process ends (section 45)
    if (out) fs.writeFileSync(out, JSON.stringify(result));
    console.log("@@RESULT " + JSON.stringify(result));
    H.exitCleanly ? H.exitCleanly(0) : process.exit(0);
}

// ---- THE PARENT ----------------------------------------------------------------------------------------------------
const OUT = path.resolve(arg("--out") || "denoise-build-probe.json"), CAP_S = Number(arg("--cap") || 180);
const git = spawnSync("git", ["log", "-1", "--format=%h %cs %s"], { cwd: ENG, encoding: "utf8" });
const HP = await imp("tools/ship/headlessGpu.mjs"), WGPU = HP.resolveWebgpu(), WPKG = HP.webgpuPackage(WGPU.from);
const report = { at: new Date().toISOString(), platform: `${process.platform} ${os.release()} ${os.arch()}`, node: process.version,
                 commit: git.status === 0 ? git.stdout.trim().slice(0, 120) : null, probe: PROBE, sizes: SIZES, capSeconds: CAP_S,
                 nodeWebgpu: { version: WPKG ? WPKG.version : null, from: WGPU.from || null, refused: WGPU.refused || null,
                               dxcBeside: WPKG ? WPKG.dxcBeside : null, dxc: DXC || "Dawn's choice" }, native: [], browser: null };
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
const line = (where, id, r) => console.log(`  ${where}  ${id.padEnd(20)} ` + (r.stopped ? `STOPPED at the ${CAP_S} s cap -- not built` :
    r.built ? `built in ${(r.buildMs / 1000).toFixed(1)} s; ${r.exact ? "exact" : "NOT EXACT"} at 64 x 64` + (r.dump ? `; dump: ${r.dump.compiler}, ${r.dump.lines} lines, ${r.dump.loops} loops` : "") +
              r.sizes.map((x) => `\n      ${String(x.N).padStart(4)} x ${String(x.N).padEnd(4)} ${x.passMs.toFixed(3)} ms a pass (${x.clock} clock, ${x.passes} passes)` + (x.exact === null ? "" : ` -- ${x.detail}`)).join("")
            : `NOT BUILT -- ${r.reason}`));
console.log(`[denoiseBuildProbe] probe ${PROBE} at ${SIZES.join(", ")}; ${report.commit}; each shape stopped at ${CAP_S} s; the report is ${OUT}`);

if (!args.includes("--browser-only")) {
    console.log(`native (node-webgpu ${report.nodeWebgpu.version || "unresolved"}${WPKG && WPKG.dxcBeside && process.platform === "win32" ? ", DXC beside dawn.node" : ""}; DXC ${report.nodeWebgpu.dxc}; ` +
                `on Windows, D3D12 through the compiler each dump names), one process a shape:`);
    if (WGPU.refused) { console.log("  " + WGPU.refused); process.exit(2); }
    for (const v of SHAPES) {
        const resFile = path.join(os.tmpdir(), `swek-denoise-probe-${process.pid}-${v.id}.json`);
        try { fs.unlinkSync(resFile); } catch {}
        const t0 = Date.now();
        const r = spawnSync(process.execPath, [SELF, "--child", v.id, "--result", resFile, "--probe", PROBE, "--sizes", SIZES.join(","), ...(DXC ? ["--dxc", DXC] : [])], { cwd: ENG, encoding: "utf8", timeout: CAP_S * 1000, maxBuffer: 1 << 29 });
        let got = null; try { got = JSON.parse(fs.readFileSync(resFile, "utf8")); fs.unlinkSync(resFile); } catch {}
        const at = (r.stdout || "").lastIndexOf("@@RESULT ");
        if (!got && at >= 0) try { got = JSON.parse((r.stdout.slice(at + 9).split("\n")[0] || "").trim()); } catch {}
        const stopped = !got && !!r.error && /ETIMEDOUT/.test(r.error.code || r.error.message || "");
        const dumpFile = path.join(os.tmpdir(), `swek-denoise-probe-dump-${v.id}.txt`);
        try { fs.writeFileSync(dumpFile, r.stdout || ""); } catch {}
        const res = got ? { ...got, dump: dumpStats(r.stdout || "", jobFor(v).entry) }
                        : { built: false, stopped, reason: stopped ? `stopped at the ${CAP_S} s cap` : `no result (exit ${r.status}): ${(r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 200)}` };
        report.native.push({ id: v.id, what: v.what, cfg: v.cfg || v.opts || null, seconds: (Date.now() - t0) / 1000, dumpFile, ...res });
        save(); line("native ", v.id, res);
    }
}

if (!args.includes("--native-only")) {
    console.log("browser (Chrome from the engine's origin; on Windows, D3D12 through DXC):");
    const { runInEngineOrigin } = await imp("tools/ship/webgpuHarness.mjs"), { runLaunchArgs } = await imp("tools/ship/realGpuRun.mjs");
    // *** SECTION 57: THE FIRST PROBES' CHROME RAN ON SWIFTSHADER. *** The harness's default flags on win32 ask for the SwiftShader
    // adapter (webgpuHarness.mjs LAUNCH_ARGS); realGpuRun hands its gates the hardware flags, and so does this, unless
    // SWEK_LAUNCH_ARGS says otherwise. The report names the adapter Chrome gave, and the flags.
    const launchArgs = runLaunchArgs();
    report.browserLaunchArgs = launchArgs;
    const r = await runInEngineOrigin({ engineRoot: ENG, launchArgs, timeoutMs: (CAP_S * SHAPES.length + 120) * 1000, args: { cap: CAP_S * 1000, probe: PROBE, sizes: SIZES }, script: `async (a) => {
        const C = await import("/render/denoiseCompile.mjs"), out = [];
        if (!navigator.gpu) return { error: "no navigator.gpu" };
        let adapter = null;
        for (const v of (a.probe === "r16" ? C.BUILD_PROBE : C.BUILD_PROBE_R17)) {
            const ad = await navigator.gpu.requestAdapter(); if (!ad) return { error: "no adapter", out };
            const i = ad.info || {}; adapter = adapter || [i.vendor, i.architecture, i.description].filter(Boolean).join(" / ");
            const dev = await ad.requestDevice({ requiredFeatures: ad.features.has("timestamp-query") ? ["timestamp-query"] : [],
                                                  requiredLimits: { maxStorageBufferBindingSize: ad.limits.maxStorageBufferBindingSize, maxBufferSize: ad.limits.maxBufferSize } });
            let timer; const cap = new Promise((res) => { timer = setTimeout(() => res({ built: false, stopped: true }), a.cap); });
            let res; try { res = await Promise.race([C.measureSizes(dev, v, a.sizes), cap]); } catch (e) { res = { built: false, reason: String(e && e.message || e).slice(0, 200) }; }
            clearTimeout(timer);
            out.push({ id: v.id, ...res });
            if (!res.stopped) dev.destroy();
        }
        return { adapter, out };
    }` });
    if (r.skipped) { report.browser = { skipped: r.reason }; console.log("  browser  SKIP -- " + r.reason); }
    else {
        report.browser = { ok: r.ok, pageErrors: r.pageErrors, adapter: r.result?.adapter || null, error: r.result?.error || (r.ok ? null : r.reason), rows: r.result?.out || [] };
        for (const x of report.browser.rows) line("browser", x.id, x);
        if (report.browser.error) console.log("  browser  " + report.browser.error);
    }
    save();
}
const n = report.native.filter((x) => x.built).length;
console.log(`[denoiseBuildProbe] native: ${n} of ${report.native.length} built` + (report.browser?.rows ? `; browser: ${report.browser.rows.filter((x) => x.built).length} of ${report.browser.rows.length}` : "") +
            ` -- wrote ${OUT}`);
const H = await imp("tools/ship/headlessGpu.mjs");
H.exitCleanly ? H.exitCleanly(0) : process.exit(0);
