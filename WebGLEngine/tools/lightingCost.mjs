#!/usr/bin/env node
// WebGLEngine/tools/lightingCost.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT THE NEW LIGHTING COSTS ON A REAL GRAPHICS CARD. Every picture check of render/clusteredLights.mjs and render/volumetricFog.mjs ran on SwiftShader, a CPU rasteriser:
// right pictures, but no idea of the cost. Keith (2026-11-27): "lets do 1 through 6" -- 3 being "time the new lighting on your rig". This loads each page in Chrome on the
// GPU (tools/ship/webgpuHarness.mjs HARDWARE_ARGS, or SWEK_LAUNCH_ARGS), at 1920 x 1080, holds the lights still, lets each page settle, and reads what the CARD spent on
// each pass by its own clock:
//   WebGL2  lights-demo.html        EXT_disjoint_timer_query_webgl2 through render/gpuTimerAuto.js (labels shadows, lit, fog, and the rest)
//   WebGPU  lights-gpu.html, flight-gpu.html            timestamp queries through render/gpuTimer.mjs (labels shadows, lit or scene, fog)
//   WebGL2  ocean-default.html (?lights=1)              its own render/gpuTimerGL.mjs (labels shadows, water, buoys, fog)
// each in its variants (CONFIGS below): the plain lighting, soft shadows, fog without shadows in it, fog with the moon's or sun's shafts, fog with the spot lights' beams.
// Then THE COST OF EACH FEATURE is the variant's total less the variant it adds to (costOf), and the page's frame interval says whether the frame kept up.
//
//   node tools/lightingCost.mjs [--out FILE] [--only SUBSTRING] [--seconds 4] [--size 1920x1080] [--allow-software]
//
// It writes ONE JSON report (by default render/lighting-cost-<box>-<UTC stamp>.json; never overwrites) and prints a table. A software adapter or renderer is refused --
// its times are a CPU's -- unless --allow-software (the gate's), and then the report says first that it measures no graphics card.
// Held by tools/ship/lightingCost-selfcheck.mjs. The rig's commands: docs/RIG_RUNS_2026-11-27.md.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every page variant timed: { id, page, query, backend, base (the id it adds to, for costOf), feature }. */
export const CONFIGS = Object.freeze([
    { id: "gl.lit", page: "lights-demo.html", query: "", backend: "webgl2", base: null, feature: "clustered lights, shadow atlas, sun cascades, cookie" },
    { id: "gl.soft", page: "lights-demo.html", query: "&soft=1", backend: "webgl2", base: "gl.lit", feature: "soft shadows (PCSS, 16 + 16 taps)" },
    { id: "gl.fog", page: "lights-demo.html", query: "&fog=1&shafts=0", backend: "webgl2", base: "gl.lit", feature: "fog, no shadows in it (48 steps)" },
    { id: "gl.shafts", page: "lights-demo.html", query: "&fog=1&spots=0", backend: "webgl2", base: "gl.fog", feature: "the moon's shafts (a cascade lookup a step)" },
    { id: "gl.beams", page: "lights-demo.html", query: "&fog=1", backend: "webgl2", base: "gl.shafts", feature: "two spot lights' beams (each a lookup a step)" },
    { id: "gpu.lit", page: "lights-gpu.html", query: "", backend: "webgpu", base: null, feature: "clustered lights, shadow atlas, sun cascades, cookie" },
    { id: "gpu.soft", page: "lights-gpu.html", query: "&soft=1", backend: "webgpu", base: "gpu.lit", feature: "soft shadows (PCSS, 16 + 16 taps)" },
    { id: "gpu.fog", page: "lights-gpu.html", query: "&fog=1&shafts=0", backend: "webgpu", base: "gpu.lit", feature: "fog, no shadows in it (48 steps)" },
    { id: "gpu.shafts", page: "lights-gpu.html", query: "&fog=1&spots=0", backend: "webgpu", base: "gpu.fog", feature: "the moon's shafts (a cascade lookup a step)" },
    { id: "gpu.beams", page: "lights-gpu.html", query: "&fog=1", backend: "webgpu", base: "gpu.shafts", feature: "two spot lights' beams (each a lookup a step)" },
    { id: "flight.lit", page: "flight-gpu.html", query: "&lights=1", backend: "webgpu", base: null, feature: "the flight page lit: shots and flashes as clustered lights, sun cascades" },
    { id: "flight.fog", page: "flight-gpu.html", query: "&lights=1&fog=1&shafts=0", backend: "webgpu", base: "flight.lit", feature: "its haze (16 steps)" },
    { id: "flight.shafts", page: "flight-gpu.html", query: "&lights=1&fog=1", backend: "webgpu", base: "flight.fog", feature: "the sun's shafts between the ships" },
    { id: "sea.plain", page: "ocean-default.html", query: "", backend: "webgl2", base: null, feature: "the physics sea as it always was (one pass, no engine lighting)" },
    { id: "sea.lit", page: "ocean-default.html", query: "&lights=1", backend: "webgl2", base: "sea.plain", feature: "the sea lit: buoy lamps, three searchlights, sun cascades" },
    { id: "sea.fog", page: "ocean-default.html", query: "&lights=1&fog=1&shafts=0", backend: "webgl2", base: "sea.lit", feature: "sea-level haze (48 steps)" },
    { id: "sea.shafts", page: "ocean-default.html", query: "&lights=1&fog=1&beams=0", backend: "webgl2", base: "sea.fog", feature: "the sun's shafts in it" },
    { id: "sea.beams", page: "ocean-default.html", query: "&lights=1&fog=1", backend: "webgl2", base: "sea.shafts", feature: "the three searchlights' beams" },
]);
export const STATE_VAR = Object.freeze({ "lights-demo.html": "__lights", "lights-gpu.html": "__lightsGpu", "flight-gpu.html": "__flightLights", "ocean-default.html": "__ocean" });
export const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|warp|software/i;

/** A row's total on the card: the sum of its labels (ms). */
export const totalOf = (labels) => (labels ? Object.values(labels).reduce((s, v) => s + v, 0) : null);
/** Each feature's cost: its row's total less its base row's (both measured), and the ratio. Pure. */
export function costOf(rows) {
    const by = new Map(rows.map((r) => [r.id, r]));
    return rows.map((r) => {
        const b = r.base ? by.get(r.base) : null, t = totalOf(r.gpu), tb = b ? totalOf(b.gpu) : null;
        return { id: r.id, feature: r.feature, totalMs: t, addsMs: t != null && tb != null ? t - tb : r.base ? null : t, overBase: t != null && tb ? t / tb : null, frameMs: r.frameMs };
    });
}
/** The table the run prints. Pure. */
export function tableLines(report) {
    const f = (v, d = 2) => (v == null || !Number.isFinite(v) ? "   --" : v.toFixed(d).padStart(7));
    const lines = [`${report.software ? "*** SOFTWARE RENDERER: THESE ARE A CPU'S TIMES, NOT A GRAPHICS CARD'S *** " : ""}${report.adapters.join(" | ")}`, `${"variant".padEnd(15)} ${"card ms".padStart(7)} ${"adds ms".padStart(7)} ${"x base".padStart(7)} ${"frame ms".padStart(8)}  feature`];
    for (const c of report.costs) { const r = report.rows.find((x) => x.id === c.id) || {}; lines.push(`${c.id.padEnd(15)} ${f(c.totalMs)} ${f(c.addsMs)} ${f(c.overBase)} ${f(c.frameMs, 1).padStart(8)}  ${c.feature}${r.error ? "  (" + r.error + ")" : !r.gpu ? "  (no card times: " + (r.timer || "no timer") + ")" : ""}`); }
    return lines;
}

function parse(argv) {
    const o = { out: null, only: null, seconds: 4, size: [1920, 1080], allowSoftware: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--out") o.out = argv[++i]; else if (a === "--only") o.only = argv[++i]; else if (a === "--seconds") o.seconds = Number(argv[++i]);
        else if (a === "--size") o.size = argv[++i].split("x").map(Number); else if (a === "--allow-software") o.allowSoftware = true;
        else throw new Error(`lightingCost: unknown argument ${a}`);
    }
    if (!(o.seconds > 0) || o.size.length !== 2 || !o.size.every((v) => v >= 64)) throw new Error("lightingCost: --seconds > 0, --size WxH of 64 or more");
    return o;
}

/** One variant in a fresh page: wait for it, let it settle `seconds`, read the card's times and the frame interval. */
async function timeOne(browser, port, c, { seconds, size }) {
    const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const sv = STATE_VAR[c.page];
    try {
        await page.goto(`http://127.0.0.1:${port}/${c.page}?ease=0&t=3.5${c.query}`);
        await page.waitForFunction((v) => window[v] && (window[v].ready || window[v].error || (window[v].frames || 0) >= 3), sv, { timeout: 120000 });
        const r = await page.evaluate(async ({ v, ms }) => {
            const s = window[v]; if (s.error) return { error: String(s.error) };
            // 2026-11-27 (the publish merge) -- THE CARD'S TIMES ARE AVERAGED OVER THE SETTLE, NOT READ OFF ITS LAST FRAME. A page publishes one frame's pass
            // times (ocean-default's state.gpuTimes is the latest frame collected), so reading them once at the end measured a single frame: on SwiftShader the
            // lit sea's water pass read anywhere from 138 to 252 ms run to run, and a fog row "cost more than its base" or not by the frame it happened to land on.
            // Every distinct reading published during the settle is kept and each label is the mean of them; and a page that has published none when the settle
            // ends is waited on for up to 10 s more (the fullest sea variant had answered no timer query within 0.8 s on SwiftShader), then reported as it is.
            const g = window.__gpuTimerAuto, read = () => (s.gpuTimes ? s.gpuTimes : g && g.state === "on" ? g.labels : null), seen = [];
            const sample = () => { const x = read(); if (x && x !== seen.at(-1)?.ref) seen.push({ ref: x, v: { ...x } }); };
            const f0 = s.frames, t0 = performance.now();
            await new Promise((res) => { const id = setInterval(sample, 25); setTimeout(() => { clearInterval(id); res(); }, ms); });
            const frames = s.frames - f0, dt = performance.now() - t0;
            for (let waited = 0; !seen.length && waited < 10000; waited += 50) { await new Promise((res) => setTimeout(res, 50)); sample(); }
            const gl = document.querySelector("canvas")?.getContext("webgl2"), dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
            const glName = gl ? (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null;
            const keys = [...new Set(seen.flatMap((x) => Object.keys(x.v)))];
            const gpu = seen.length ? Object.fromEntries(keys.map((k) => { const v = seen.map((x) => x.v[k]).filter((n) => typeof n === "number"); return [k, v.reduce((a, b) => a + b, 0) / v.length]; })) : null;
            return { gpu, samples: seen.length, timer: s.gpuTimer || (g ? g.state : "none"), adapter: s.adapter || glName, software: s.software ?? null, frameMs: frames > 0 ? dt / frames : null, frames };
        }, { v: sv, ms: seconds * 1000 });
        if (errors.length && !r.error) r.error = errors[0];
        return r;
    } catch (e) { return { error: e.message.split("\n")[0] }; }
    finally { await page.close(); }
}

export async function run(argv = process.argv.slice(2), { log = console.log } = {}) {
    const o = parse(argv), require = createRequire(path.join(ENG, "tools", "ship", "x.mjs"));
    const { resolvePlaywright, HEADLESS_SHELL } = await import(pathToFileURL(path.join(ENG, "tools", "ship", "playwrightResolve.mjs")).href);
    const { HARDWARE_ARGS } = await import(pathToFileURL(path.join(ENG, "tools", "ship", "webgpuHarness.mjs")).href);
    const { boxId } = await import(pathToFileURL(path.join(ENG, "tools", "ship", "hostScale.mjs")).href);
    const { chromium } = resolvePlaywright(require), args = process.env.SWEK_LAUNCH_ARGS ? process.env.SWEK_LAUNCH_ARGS.split(/\s+/).filter(Boolean) : [...HARDWARE_ARGS];
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
    const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const configs = CONFIGS.filter((c) => !o.only || c.id.includes(o.only) || c.page.includes(o.only));
    const browser = await chromium.launch({ args, ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), rows = [];
    try {
        for (const c of configs) { log(`  ${c.id} ...`); rows.push({ ...c, ...(await timeOne(browser, srv.address().port, c, o)) }); }
    } finally { await browser.close(); srv.close(); }
    const adapters = [...new Set(rows.map((r) => r.adapter).filter(Boolean))], software = adapters.some((a) => SOFTWARE.test(a)) || rows.some((r) => r.software === true);
    const report = { tool: "tools/lightingCost.mjs", when: new Date().toISOString(), box: boxId(), platform: process.platform, launchArgs: args, size: o.size, seconds: o.seconds, software, adapters, rows, costs: costOf(rows) };
    for (const l of tableLines(report)) log(l);
    if (software && !o.allowSoftware) { log("REFUSED: a software adapter or renderer timed these; its times are a CPU's (--allow-software writes them anyway)"); return { report, written: null, code: 2 }; }
    const out = o.out || path.join(ENG, "render", `lighting-cost-${report.box}-${report.when.replace(/[:.]/g, "-")}.json`);
    if (fs.existsSync(out)) throw new Error(`lightingCost: ${out} exists; a report is never overwritten`);
    fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n"); log(`wrote ${path.relative(ENG, out).replace(/\\/g, "/")}`);
    return { report, written: out, code: rows.some((r) => r.error) ? 1 : 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().then((r) => process.exit(r.code), (e) => { console.error(e.message); process.exit(1); });
}
