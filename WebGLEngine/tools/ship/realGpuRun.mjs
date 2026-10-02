#!/usr/bin/env node
// WebGLEngine/tools/ship/realGpuRun.mjs -- v4764 -- THE FSR AND FRAME-GENERATION GATES ON A REAL GPU, AND A REPORT THAT SAYS WHICH GPU.
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
import { LAUNCH_ARGS } from "./webgpuHarness.mjs";
import { parseArgs, refusalLines } from "./cliArgs.mjs";
import { createRequire } from "node:module";
import http from "node:http";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { SOFTWARE_HINTS } from "../../ui/localModelProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The gates a real-hardware run covers, relative to the engine root, sorted. */
export function gateList(root = ENG) {
    const pick = (dir, re) => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter((f) => re.test(f)).map((f) => `${dir}/${f}`) : []);
    return [...pick("fx/fsr", /-selfcheck\.mjs$/), ...pick("render", /Tsl.*-selfcheck\.mjs$/), ...pick("render", /^translucentLayer-selfcheck\.mjs$/)].sort();
}

/** A gate's kind from its source: timing if it reads a clock, quality if it grades in dB, exact otherwise. */
export function categorize(src) {
    if (/performance\.now|onSubmittedWorkDone|requestAnimationFrame/.test(src)) return "timing";
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

/** The report's first line: whether this was a real-hardware run at all. */
export function verdict(report) {
    const ads = report.adapters;
    if (!ads.length) return "*** NO ADAPTER WAS SEEN: no gate reached a device -- this is not a hardware run ***";
    if (ads.some((a) => a.software !== false)) return `*** SOFTWARE ADAPTER (${ads.filter((a) => a.software !== false).map((a) => a.name).join("; ")}): THIS IS NOT A REAL-HARDWARE RUN -- its times are a CPU's ***`;
    return `a real-hardware run on ${ads.map((a) => a.name).join("; ")}`;
}

export function runGates({ root = ENG, only = null, log = console.log } = {}) {
    const gates = gateList(root).filter((g) => !only || g.includes(only));
    const logFile = path.join(os.tmpdir(), `swek-adapters-${process.pid}-${Date.now()}.jsonl`);
    const report = { at: new Date().toISOString(), platform: `${process.platform} ${os.release()} ${os.arch()}`, node: process.version,
                     launchArgs: process.env.SWEK_LAUNCH_ARGS ? process.env.SWEK_LAUNCH_ARGS.split(/\s+/).filter(Boolean) : [...LAUNCH_ARGS], gates: [], adapters: [] };
    for (const g of gates) {
        const t0 = Date.now();
        const r = spawnSync(process.execPath, [g], { cwd: root, encoding: "utf8", timeout: 600000, env: { ...process.env, SWEK_ADAPTER_LOG: logFile } });
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
export const TREE_SOFTWARE_GL = Object.freeze(["--use-gl=swiftshader"]);
// and the WebGPU side of the same question: eight launches hand-spell `--use-gl=swiftshader --enable-unsafe-webgpu`,
// the harness uses LAUNCH_ARGS, and which adapter each gets on a GPU box is equally unmeasured
export const TREE_SOFTWARE_WEBGPU = Object.freeze(["--use-gl=swiftshader", "--enable-unsafe-webgpu"]);
export const SOFTWARE_GL_CANDIDATES = Object.freeze([
    TREE_SOFTWARE_GL,
    Object.freeze(["--use-angle=swiftshader"]),
    Object.freeze(["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    Object.freeze(["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    Object.freeze([]),
    TREE_SOFTWARE_WEBGPU,
    Object.freeze([...LAUNCH_ARGS]),
    Object.freeze([...LAUNCH_ARGS, "--use-webgpu-adapter=swiftshader"]),
    Object.freeze(["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"]),
]);
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
            const row = { args: [...args], context: false, renderer: null, maxTexture: null, software: null,
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
                 : `WebGL2 ${!r.context ? "NONE" : (r.software ? "SOFTWARE" : "HARDWARE") + " " + r.renderer + " (max texture " + r.maxTexture + ")"}` +
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
        process.exit(0);
    }
    const arg = (k) => cli.values[k] ?? null;
    const out = path.resolve(arg("--out") || path.join(process.cwd(), "real-gpu-run.json"));
    console.log(`\nthe FSR and frame-generation gates, with the harness logging each call's adapter (${process.platform})`);
    const report = runGates({ only: arg("--only") });
    fs.writeFileSync(out, JSON.stringify(report, null, 1));
    console.log(`\n${report.verdict}\n${report.summary}  --  the report: ${out}`);
    process.exitCode = report.gates.every((g) => g.ok) ? 0 : 1;
}
