#!/usr/bin/env node
// WebGLEngine/tools/ship/rigTiming-selfcheck.mjs -- v4316
//
// SPEED BECOMES A NUMBER, OR STAYS RIG-PENDING. Every level since 11 has closed with "SPEED, until the rig answers":
// this sandbox draws on SwiftShader, which is not the box that would show the GPU-driven path's advantage. Now
// gpu-rig-check.html carries a TIMING TABLE -- ms per frame for both routes at the universe's size (6,241 records)
// and ten times it (62,500), counts awaited so the GPU has finished -- and a person on the rig saves the page's
// JSON as tools/ship/rig-timing.json. This gate: (1) loads the page here and demands the table has numbers on the
// route this box has; (2) reads rig-timing.json if it exists and grades it (shape, both routes, the GPU-driven
// route present, the numbers finite), printing the table; without it, RIG-PENDING, and the tree's speed claim
// stays what it has always honestly been -- unmade.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const TIMING_FILE = path.join(ENG, "tools/ship/rig-timing.json");

/** What a timing record must be to be believed: both sizes, finite positive numbers, the route named. */
export function gradeTiming(t) {
    const problems = [];
    if (!t || !Array.isArray(t.timing) || !t.timing.length) return { ok: false, problems: ["no timing table"] };
    for (const row of t.timing) { if (!["webgpu", "webgl2"].includes(row.backend)) problems.push(`backend ${row.backend}`); if (!(row.msPerFrame > 0 && Number.isFinite(row.msPerFrame))) problems.push(`ms ${row.msPerFrame}`); if (!(row.records >= 6000)) problems.push(`records ${row.records}`); if (!/drawIndexed/.test(row.path || "")) problems.push(`path ${row.path}`); }
    const gpuDriven = t.timing.filter((r) => r.path === "compute+drawIndexedIndirect"), twin = t.timing.filter((r) => r.path === "cpu-twin+drawIndexed");
    const sizes = new Set(t.timing.map((r) => r.records));
    if (sizes.size < 2) problems.push("only one size");
    return { ok: problems.length === 0, problems, gpuDriven, twin, sizes: [...sizes].sort((a, b) => a - b), ua: t.ua, when: t.when, backend: t.backend };
}

console.log("\n1. THE PAGE HERE: the timing table fills on the route this box has, and says the rest is the rig's");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "gpu-rig-check.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await br.newPage({ viewport: { width: 640, height: 480 } }); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" });
    let json = null; for (let i = 0; i < 90 && !json; i++) { await pg.waitForTimeout(1000); const v = await pg.evaluate(() => document.getElementById("json").value); if (v) { try { const j = JSON.parse(v); if (j.timing || j.failed) json = j; } catch (e) {} } }
    const out = await pg.evaluate(() => document.getElementById("out").textContent);
    await br.close(); srv.close();
    ok("the page produced its JSON with a timing table", json && Array.isArray(json.timing) && json.timing.length >= 2, json ? (json.failed || `${json.timing && json.timing.length} rows`) : "no JSON within 90 s");
    if (json && json.timing) {
        const g = gradeTiming(json);
        ok("  every row is a real measurement: a named backend, a named route, 6,000+ records, finite positive ms; two sizes", g.ok, g.problems.join("; ") || g.sizes.join("/") + " records");
        for (const r of json.timing) report(`${r.backend} ${r.path} at ${r.records} records: ${r.msPerFrame} ms/frame (${r.fps} fps) -- SwiftShader, not a GPU`);
        ok("  the page says the JSON is for tools/ship/rig-timing.json and that speed is RIG-PENDING until then", /rig-timing\.json/.test(out) && /RIG-PENDING/.test(out));
        ok("  the page threw nothing", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    }
}

console.log("\n2. THE RIG'S NUMBER: tools/ship/rig-timing.json, if the rig has signed one");
{
    if (!fs.existsSync(TIMING_FILE)) {
        report("RIG-PENDING: no tools/ship/rig-timing.json. Open gpu-rig-check.html on Galaxina, save the JSON from the box as that file, and this section grades it. Until then no sentence in this tree may say the GPU-driven path is fast.");
        ok("without the rig's file the gate refuses the speed claim by saying so (not by passing quietly)", true, "RIG-PENDING");
    } else {
        const t = JSON.parse(fs.readFileSync(TIMING_FILE, "utf8")), g = gradeTiming(t);
        ok("the rig's timing table is a real one (shape, both routes named, two sizes, finite ms)", g.ok, g.problems.join("; "));
        ok("  it carries the GPU-driven route (compute + drawIndexedIndirect) -- the route this sandbox can never time", g.gpuDriven.length >= 2, `${g.gpuDriven.length} GPU-driven rows, ${g.twin.length} twin rows`);
        for (const r of t.timing) report(`${r.backend} ${r.path} at ${r.records} records: ${r.msPerFrame} ms/frame (${r.fps} fps) on ${t.ua}`);
        if (g.gpuDriven.length && g.twin.length) { const big = (rows) => rows.reduce((b, r) => (r.records > (b ? b.records : 0) ? r : b), null); const gd = big(g.gpuDriven), tw = big(g.twin);
            report(`at ${gd.records} records the GPU-driven route is ${(tw.msPerFrame / gd.msPerFrame).toFixed(2)}x the twin's speed on this rig -- THE number, signed ${t.when}`); }
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4316.
//   A  the page timing 0 frames (N = 0) -> exit=1, 1 red: ms reads null on both rows and gradeTiming refuses them.
//   B  the page timing only the default route (the second device dropped) -> not measured here: this box has one
//      route worth naming either way, so the table's shape is the same; on the rig the file would carry one route
//      and section 2's "carries the GPU-driven route" line would be red. Recorded as the rig file's claim, not this
//      section's.
//   C  gradeTiming() accepting any path -> measured with a fixture rig-timing.json whose twin rows say
//      "drawArrays": unsabotaged, 1 red ("path drawArrays"); sabotaged, 0 red -- a made-up route accepted as a
//      measurement. The path check is what makes the file a claim about THESE routes.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SPEED. Still. This gate builds the question and refuses to answer it from SwiftShader; the number is whatever " +
    "tools/ship/rig-timing.json says once a person on the rig saves it, and the gate will read it back and print the ratio.");
process.exit(fails ? 1 : 0);
