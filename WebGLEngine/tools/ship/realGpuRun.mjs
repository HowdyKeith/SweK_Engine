#!/usr/bin/env node
// WebGLEngine/tools/ship/realGpuRun.mjs -- v4764 -- THE FSR AND FRAME-GENERATION GATES ON A REAL GPU, AND A REPORT THAT SAYS WHICH GPU.
// (The denoiser arc's two device gates joined at its round 12: the learned denoiser on the device, and its timing.)
//
// Every device row in this tree has run on SwiftShader, a CPU rasteriser in a headless browser: the parity rows hold there,
// the quality rows hold there, and every TIME any gate prints is a software renderer's. This runs the FSR and frame-generation
// gates -- every fx/fsr/*-selfcheck.mjs, render/*Tsl*-selfcheck.mjs and render/translucentLayer-selfcheck.mjs -- with the
// harness told to log what each call ran on (SWEK_ADAPTER_LOG), and writes one report: per gate its verdict, its time, the
// adapter it ran on, its failing rows and its measured lines. A run whose adapters are software says so first, loudly: it is
// not a real-hardware run, whatever machine it was on. docs/real-hardware-fsr.md says how to run it and what to send back.
//
//   node tools/ship/realGpuRun.mjs [--out FILE] [--only SUBSTRING]
//   SWEK_LAUNCH_ARGS="--enable-unsafe-webgpu --enable-features=Vulkan" node tools/ship/realGpuRun.mjs   (the browser's flags)
//
// Each gate is one of three kinds, by what it measures (categorize, below, and the doc):
//   exact    mirror and parity rows only: the same on any GPU, or a bug on that GPU
//   quality  dB against a truth: a different GPU's f32 and rasterisation may move a figure; its margin says by how much it can
//   timing   what the GPU takes -- the numbers a real-hardware run is FOR; on SwiftShader they are a CPU's
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HARDWARE_ARGS, hardwareArgsFor } from "./webgpuHarness.mjs";
import { parseArgs, refusalLines } from "./cliArgs.mjs";
import { createRequire } from "node:module";
import http from "node:http";
import { resolvePlaywright, HEADLESS_SHELL, WEBGL_DEFAULT_ARGS } from "./playwrightResolve.mjs";
import { SOFTWARE_HINTS } from "../../ui/localModelProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The gates a real-hardware run covers, relative to the engine root, sorted. */
export function gateList(root = ENG) {
    const pick = (dir, re) => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter((f) => re.test(f)).map((f) => `${dir}/${f}`) : []);
    // the denoiser arc's device round: its exact gate (the network on the device, cell for cell) and its timing gate
    // (what a pass costs, 64 x 64 up to a 1080p frame -- render/learned-denoiser-preregistration.md section 37)
    return [...pick("fx/fsr", /-selfcheck\.mjs$/), ...pick("render", /Tsl.*-selfcheck\.mjs$/), ...pick("render", /^translucentLayer-selfcheck\.mjs$/),
            ...pick("render", /^denoise(Device|Timing)-selfcheck\.mjs$/)].sort();
}

/**
 * A gate's kind from its source: timing if it reads a clock, quality if it grades in dB, exact otherwise. The denoiser's
 * timing gate reads its clocks inside render/denoiseDevice.mjs's timingLadder, so a call to that is a clock read too.
 */
export function categorize(src) {
    if (/performance\.now|onSubmittedWorkDone|requestAnimationFrame|timingLadder\(/.test(src)) return "timing";
    if (/\bdB\b|PSNR|Math\.log10/.test(src)) return "quality";
    return "exact";
}

/** A gate's printed rows: its failing ones, its measured lines ("----"), and its verdict. */
export function parseRows(stdout) {
    const lines = String(stdout).split("\n");
    return { fails: lines.filter((l) => /^\s*FAIL\s/.test(l) && !/^\s*FAIL --/.test(l)).map((l) => l.trim().slice(0, 400)),
             measured: lines.filter((l) => /^\s*----\s/.test(l)).map((l) => l.trim().replace(/^----\s+/, "").slice(0, 400)),
             green: lines.some((l) => /^ALL GREEN|all (checks )?pass/.test(l.trim())) };
}

/**
 * The report's first line: whether this was a real-hardware run at all. *** DENOISER ROUND 12, ON THE RIG -- A RUN OF NO
 * GATES READ "NO ADAPTER WAS SEEN" AND EXITED 0. *** Keith's `--only denoise` ran on a checkout without the denoiser's gates,
 * matched nothing, and said only that no device was reached. An empty selection says so first, with what was asked for and
 * the commit it was asked of, and the CLI exits 1 on it.
 */
export function verdict(report) {
    const ads = report.adapters;
    if (report.gates && !report.gates.length)
        return `*** NO GATE MATCHED${report.only ? ` --only "${report.only}"` : ""}: NOTHING RAN -- this checkout (${report.commit ? report.commit.split(" ").slice(0, 2).join(" ") : "commit unknown"}) has no such gate; ` +
               "is it on the branch that added it? ***";
    if (!ads.length) return "*** NO ADAPTER WAS SEEN: no gate reached a device -- this is not a hardware run ***";
    if (ads.some((a) => a.software !== false)) return `*** SOFTWARE ADAPTER (${ads.filter((a) => a.software !== false).map((a) => a.name).join("; ")}): THIS IS NOT A REAL-HARDWARE RUN -- its times are a CPU's ***`;
    return `a real-hardware run on ${ads.map((a) => a.name).join("; ")}`;
}

/**
 * *** v4778 RIG RUN 4 -- THE FLAGS A REAL-HARDWARE RUN HANDS ITS GATES. *** The owner's SWEK_LAUNCH_ARGS if set; else this
 * platform's HARDWARE_ARGS, NOT LAUNCH_ARGS: on win32 an ordinary run now asks for the SwiftShader adapter (webgpuHarness.mjs),
 * and this run exists to reach the GPU. Every gate it runs goes through runInEngineOrigin, which reads SWEK_LAUNCH_ARGS.
 */
export function runLaunchArgs(env = process.env, platform = process.platform) {
    return env.SWEK_LAUNCH_ARGS ? env.SWEK_LAUNCH_ARGS.split(/\s+/).filter(Boolean) : hardwareArgsFor(platform);
}

export function runGates({ root = ENG, only = null, log = console.log, launchArgs = runLaunchArgs() } = {}) {
    const gates = gateList(root).filter((g) => !only || g.includes(only));
    const logFile = path.join(os.tmpdir(), `swek-adapters-${process.pid}-${Date.now()}.jsonl`);
    // the checkout's commit, so a report says which tree it ran -- the rig's empty run came from a checkout behind the branch
    const git = spawnSync("git", ["log", "-1", "--format=%h %cs %s"], { cwd: root, encoding: "utf8" });
    const report = { at: new Date().toISOString(), platform: `${process.platform} ${os.release()} ${os.arch()}`, node: process.version,
                     commit: git.status === 0 ? git.stdout.trim().slice(0, 120) : null, only, launchArgs, gates: [], adapters: [] };
    for (const g of gates) {
        const t0 = Date.now();
        const r = spawnSync(process.execPath, [g], { cwd: root, encoding: "utf8", timeout: 600000,
                                                    env: { ...process.env, SWEK_ADAPTER_LOG: logFile, SWEK_LAUNCH_ARGS: launchArgs.join(" ") } });
        const ms = Date.now() - t0, rows = parseRows(r.stdout || "");
        const seen = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.gate === g) : [];
        const names = [...new Set(seen.map((x) => (x.adapter ? [x.adapter.vendor, x.adapter.architecture, x.adapter.description].filter(Boolean).join(" ") || "unnamed" : "none")))];
        const entry = { gate: g, category: categorize(fs.readFileSync(path.join(root, g), "utf8")), ok: r.status === 0, ms, adapters: names,
                        software: seen.length ? seen.some((x) => x.software !== false) : null, fails: rows.fails, measured: rows.measured };
        report.gates.push(entry);
        for (const x of seen) { const name = x.adapter ? [x.adapter.vendor, x.adapter.architecture, x.adapter.description].filter(Boolean).join(" ") || "unnamed" : "none";
            if (!report.adapters.some((a) => a.name === name)) report.adapters.push({ name, software: x.software, launchArgs: x.launchArgs }); }
        log(`  ${entry.ok ? "PASS" : "FAIL"}  ${g}  [${entry.category}]  ${(ms / 1000).toFixed(1)} s  on ${names.join(", ") || "no adapter"}`);
    }
    try { fs.unlinkSync(logFile); } catch {}
    report.verdict = verdict(report);
    report.summary = ["exact", "quality", "timing"].map((c) => { const gs = report.gates.filter((x) => x.category === c); return `${c} ${gs.filter((x) => x.ok).length}/${gs.length}`; }).join(", ");
    return report;
}

/**
 * *** RIG RUN 2 -- WHICH RENDERER DOES "SOFTWARE GL" GET ON THIS BOX? *** 72 files launch the headless shell with
 * `--use-gl=swiftshader` and hold what they draw to SwiftShader's bits. On Keith's rig (Windows, a GeForce, the headless
 * shell npm brings today) every one of the twelve such gates in the run went red, several with a context that answers
 * null (MAX_TEXTURE_SIZE of null, a shader that throws with no log) and several drawing real pixels that are not
 * SwiftShader's. On this Linux box every candidate below lands on SwiftShader -- there is no GPU to land on -- so the
 * flag cannot be chosen here. This asks the browser, per candidate, which WebGL2 renderer it hands out. Nothing is
 * changed by it; the answer is what a fix to the 72 must be built on.
 */
// *** rig run 10 -- ANSWERED. *** Keith's rig, this probe's sustained loop: --use-gl=swiftshader "CONTEXT LOST within 100
// draws", alone and with --enable-unsafe-webgpu; --use-angle=swiftshader, with or without --enable-unsafe-swiftshader, "100
// half-float draws held". The same finding v4684 made for four gates (playwrightResolve.mjs WEBGL_DEFAULT_ARGS), now on the
// rest: every launch in the tree takes webglLaunchArgs(), and THE TREE'S SPELLING IS WEBGL_DEFAULT_ARGS. The retired one
// stays a candidate by name, so the table keeps saying why it went.
export const RETIRED_SOFTWARE_GL = Object.freeze(["--use-gl=swiftshader"]);
export const TREE_SOFTWARE_GL = Object.freeze([...WEBGL_DEFAULT_ARGS]);
// and the WebGPU side: the launches that also want WebGPU add --enable-unsafe-webgpu to the same default (on Linux it keeps
// its SwiftShader adapter, measured; on win32 it had none under the retired spelling either)
export const TREE_SOFTWARE_WEBGPU = Object.freeze([...WEBGL_DEFAULT_ARGS, "--enable-unsafe-webgpu"]);
export const SOFTWARE_GL_CANDIDATES = Object.freeze([
    TREE_SOFTWARE_GL,
    RETIRED_SOFTWARE_GL,
    Object.freeze(["--use-angle=swiftshader"]),
    Object.freeze(["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    Object.freeze([]),
    TREE_SOFTWARE_WEBGPU,
    Object.freeze([...RETIRED_SOFTWARE_GL, "--enable-unsafe-webgpu"]),
    // rig run 4: spelled from HARDWARE_ARGS, so the two rows Keith's decision was read off stay the same two on win32
    // now that LAUNCH_ARGS is the second of them
    Object.freeze([...HARDWARE_ARGS]),
    Object.freeze([...HARDWARE_ARGS, "--use-webgpu-adapter=swiftshader"]),
    Object.freeze(["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"]),
    // *** rig run 9 -- A SET WITH BOTH BACKENDS ON SWIFTSHADER, ON WINDOWS. *** Since rig run 4 an ordinary win32 run puts
    // WebGPU on SwiftShader and leaves WebGL2 on the GPU's ANGLE D3D11, and every gate that holds the two backends to
    // each other compares two rasterisers: 14 went newly red in Keith's rig.html run (91 went green). Every measured set
    // with ANGLE on SwiftShader lost the WebGPU adapter. These are the next candidates, nothing more -- the table says.
    Object.freeze(["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-features=Vulkan", "--use-vulkan=swiftshader"]),
    Object.freeze(["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--ignore-gpu-blocklist"]),
    Object.freeze(["--use-angle=swiftshader-webgl", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"]),
    Object.freeze(["--use-angle=vulkan", "--use-vulkan=swiftshader", "--enable-features=Vulkan", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"]),
    Object.freeze(["--use-angle=d3d11-warp", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"]),
]);

/**
 * *** rig run 9 -- AND THE NATIVE SIDE: WHICH ADAPTER node-webgpu HANDS OUT, PER WAY OF ASKING. *** headlessGpu-selfcheck holds
 * node-webgpu and the browser to ONE adapter. On win32 Dawn's default is D3D12 -- the GTX 1080 on Keith's rig -- so with the
 * browser on SwiftShader the two cannot agree. Whether Dawn there can be asked for SwiftShader is unmeasured; this asks it
 * three ways and reports each, changing nothing.
 */
export async function probeNativeAdapters({ requireFn = createRequire(import.meta.url) } = {}) {
    const { resolveWebgpu, configureVulkanIcd } = await import("./headlessGpu.mjs");
    const { mod, from } = resolveWebgpu(requireFn);
    if (!mod) return { ok: false, reason: "node-webgpu does not resolve", rows: [] };
    // as the harness does before every native call: point Dawn's Vulkan backend at the browser bundle's SwiftShader
    // driver, unless VK_ICD_FILENAMES already chose one. On Linux that is the only adapter there is; on win32 it is
    // what 'backend=vulkan' would need to reach SwiftShader at all
    const icd = configureVulkanIcd();
    const asks = [["create([]), requestAdapter()", [], {}], ["create([]), forceFallbackAdapter", [], { forceFallbackAdapter: true }],
                  ["create(['adapter=SwiftShader'])", ["adapter=SwiftShader"], {}], ["create(['backend=vulkan'])", ["backend=vulkan"], {}]];
    const rows = [];
    for (const [label, flags, opts] of asks) {
        try {
            const a = await mod.create(flags).requestAdapter(opts);
            const i = a ? (a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {})) : null;
            const name = i ? [i.vendor, i.architecture, i.description].filter(Boolean).join(" / ") : null;
            rows.push({ label, adapter: name, software: name ? SOFTWARE_HINTS.test(name) : null, error: null });
        } catch (e) { rows.push({ label, adapter: null, software: null, error: String((e && e.message) || e).slice(0, 120) }); }
    }
    return { ok: true, from, icd: icd.path || "(none found)", rows };
}
export function nativeAdapterLines(probe) {
    if (!probe.ok) return ["node-webgpu: not probed -- " + probe.reason];
    return probe.rows.map((r) => `${r.label.padEnd(40)} ${r.error ? "THREW " + r.error : r.adapter ? (r.software ? "SOFTWARE " : "HARDWARE ") + r.adapter : "no adapter"}`);
}
export async function probeSoftwareGl(sets = SOFTWARE_GL_CANDIDATES, { executablePath = HEADLESS_SHELL } = {}) {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    if (!pw.chromium || !executablePath) return { ok: false, reason: "no playwright or no headless shell", rows: [] };
    // a LOOPBACK page: navigator.gpu exists only in a secure context, and about:blank is not one
    const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end("<!doctype html><title>gl probe</title>"); });
    await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const rows = [];
    try {
        for (const args of sets) {
            const row = { args: [...args], context: false, renderer: null, maxTexture: null, software: null, draws: null, sustain: null,
                          webgpu: null, webgpuSoftware: null, error: null };
            let b = null;
            try {
                b = await pw.chromium.launch({ executablePath, args: [...args] });
                const p = await b.newPage();
                await p.goto(url);
                Object.assign(row, await p.evaluate(async () => {
                    const out = { context: false };
                    const gl = document.createElement("canvas").getContext("webgl2");
                    if (gl) {
                        const d = gl.getExtension("WEBGL_debug_renderer_info");
                        Object.assign(out, { context: !gl.isContextLost(), maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                            renderer: String(d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) });
                        // rig run 4: a context that ANSWERS is not one that DRAWS. Keith's rig named SwiftShader for
                        // --use-gl=swiftshader and still lost the context in the gates (a compile that "threw null",
                        // MAX_TEXTURE_SIZE of null). So: compile effectMerge's shape -- a bufferless gl_VertexID
                        // triangle -- draw it, read the centre back, and say whether the context survived.
                        try {
                            const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x);
                                if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error("compile: " + gl.getShaderInfoLog(x)); return x; };
                            const pr = gl.createProgram();
                            gl.attachShader(pr, sh(gl.VERTEX_SHADER, "#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}"));
                            gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, "#version 300 es\nprecision highp float;out vec4 o;void main(){o=vec4(0.2,0.4,0.6,1.0);}"));
                            gl.linkProgram(pr);
                            if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(pr));
                            gl.useProgram(pr); gl.drawArrays(gl.TRIANGLES, 0, 3);
                            const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                            out.draws = gl.isContextLost() ? "CONTEXT LOST after drawing" : (px[2] > 100 ? "draws" : "drew nothing: " + Array.from(px).join(","));
                        } catch (e) { out.draws = (gl.isContextLost() ? "CONTEXT LOST: " : "failed: ") + String((e && e.message) || e).slice(0, 80); }
                        // rig run 9: and does it STAY alive under work? effectMerge-selfcheck's compiles "threw null" on the rig
                        // -- a lost context's info log, reproduced here by losing one on purpose -- while the one triangle above
                        // drew. So: a loop-heavy fragment, 100 draws into a half-float target, read back every tenth, then a
                        // pause for a loss the GPU process reports late. The browser's own console names the suspect:
                        // "Automatic fallback to software WebGL has been deprecated. Please use the --enable-unsafe-swiftshader".
                        try {
                            const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x);
                                if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error("compile: " + gl.getShaderInfoLog(x)); return x; };
                            const pr = gl.createProgram();
                            gl.attachShader(pr, sh(gl.VERTEX_SHADER, "#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}"));
                            gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, "#version 300 es\nprecision highp float;uniform float uT;out vec4 o;void main(){vec2 q=gl_FragCoord.xy/256.0;float a=0.0;for(int i=0;i<64;i++){a+=sin(q.x*float(i)+uT)*cos(q.y*float(i)-uT);}o=vec4(a,q,1.0);}"));
                            gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(pr));
                            const half = !!gl.getExtension("EXT_color_buffer_float"), tex = gl.createTexture();
                            gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                            gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, 256, 256, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
                            const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
                            gl.viewport(0, 0, 256, 256); gl.useProgram(pr); const uT = gl.getUniformLocation(pr, "uT");
                            let k = 0;
                            for (; k < 100 && !gl.isContextLost(); k++) { gl.uniform1f(uT, k * 0.1); gl.drawArrays(gl.TRIANGLES, 0, 3);
                                if (k % 10 === 9) gl.readPixels(0, 0, 1, 1, gl.RGBA, half ? gl.FLOAT : gl.UNSIGNED_BYTE, half ? new Float32Array(4) : new Uint8Array(4)); }
                            await new Promise((r) => setTimeout(r, 300));
                            out.sustain = gl.isContextLost() ? `CONTEXT LOST within ${k} draws` : `100 ${half ? "half-float" : "8-bit"} draws held`;
                        } catch (e) { out.sustain = (gl.isContextLost() ? "CONTEXT LOST: " : "failed: ") + String((e && e.message) || e).slice(0, 80); }
                    }
                    try {
                        const a = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
                        const i = (a && a.info) || {};
                        out.webgpu = !navigator.gpu ? "no navigator.gpu" : !a ? "no adapter"
                            : [i.vendor, i.architecture, i.description].filter(Boolean).join(" / ") || "an adapter with no info";
                    } catch (e) { out.webgpu = "threw: " + String((e && e.message) || e).slice(0, 80); }
                    return out;
                }));
                row.software = row.renderer ? SOFTWARE_HINTS.test(row.renderer) : null;
                row.webgpuSoftware = /no |threw/.test(row.webgpu || "no ") ? null : SOFTWARE_HINTS.test(row.webgpu);
            } catch (e) { row.error = String((e && e.message) || e).split("\n")[0].slice(0, 160); }
            finally { if (b) await b.close().catch(() => {}); }
            rows.push(row);
        }
    } finally { srv.close(); }
    return { ok: true, executablePath, rows };
}
export function softwareGlLines(probe) {
    if (!probe.ok) return ["software GL: not probed -- " + probe.reason];
    return probe.rows.map((r) => `${(r.args.join(" ") || "(no flags)").padEnd(70)} ` +
        (r.error ? "LAUNCH THREW " + r.error
                 : `WebGL2 ${!r.context ? "NONE" : (r.software ? "SOFTWARE" : "HARDWARE") + " " + r.renderer + " (max texture " + r.maxTexture + ") -- " + r.draws + (r.sustain ? " / " + r.sustain : "")}` +
                   ` | WebGPU ${r.webgpuSoftware === null ? r.webgpu : (r.webgpuSoftware ? "SOFTWARE " : "HARDWARE ") + r.webgpu}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    // v4776 -- parsed by cliArgs.mjs rather than read off argv: `--onyl fsr` used to run EVERY gate and say nothing,
    // which on a real GPU is the longest run this tool makes. A mistyped option is refused with a did-you-mean.
    const CLI = { values: { "--out": "path", "--only": "string" }, flags: ["--gl-flags"] };
    const cli = parseArgs(process.argv.slice(2), CLI);
    if (cli.errors.length) { for (const l of refusalLines("realGpuRun", cli.errors, CLI)) console.error(l); process.exit(2); }
    if (cli.flags.has("--gl-flags")) {
        const probe = await probeSoftwareGl();
        console.log(`\nrealGpuRun --gl-flags: which WebGL2 renderer each flag set gets from ${probe.executablePath || "(no browser)"}`);
        for (const l of softwareGlLines(probe)) console.log("  " + l);
        const native = await probeNativeAdapters();
        console.log(`\nand node-webgpu (${native.from || "unresolved"}), Vulkan driver ${native.icd || "-"}, asked for an adapter four ways:`);
        for (const l of nativeAdapterLines(native)) console.log("  " + l);
        process.exit(0);
    }
    const arg = (k) => cli.values[k] ?? null;
    const out = path.resolve(arg("--out") || path.join(process.cwd(), "real-gpu-run.json"));
    console.log(`\nthe FSR, frame-generation and denoiser gates, with the harness logging each call's adapter (${process.platform})`);
    const report = runGates({ only: arg("--only") });
    console.log(`  on ${report.commit || "a checkout git could not name"}`);
    fs.writeFileSync(out, JSON.stringify(report, null, 1));
    console.log(`\n${report.verdict}\n${report.summary}  --  the report: ${out}`);
    // a run of no gates is not a green one
    process.exitCode = report.gates.length && report.gates.every((g) => g.ok) ? 0 : 1;
}
