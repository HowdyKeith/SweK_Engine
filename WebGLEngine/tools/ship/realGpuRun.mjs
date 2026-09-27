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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
    const out = path.resolve(arg("--out") || path.join(process.cwd(), "real-gpu-run.json"));
    console.log(`\nthe FSR and frame-generation gates, with the harness logging each call's adapter (${process.platform})`);
    const report = runGates({ only: arg("--only") });
    fs.writeFileSync(out, JSON.stringify(report, null, 1));
    console.log(`\n${report.verdict}\n${report.summary}  --  the report: ${out}`);
    process.exitCode = report.gates.every((g) => g.ok) ? 0 : 1;
}
