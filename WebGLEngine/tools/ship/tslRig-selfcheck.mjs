#!/usr/bin/env node
// WebGLEngine/tools/ship/tslRig-selfcheck.mjs -- v4322
//
// THE LOOP'S COST BECOMES A NUMBER, OR STAYS RIG-PENDING. Every TSL gate grades on SwiftShader, which is not a GPU, and
// docs/TSL-ROADMAP.md said nobody had timed the 448-iteration Lyapunov loop through three against the transplanted
// device pipeline. tsl-rig.html runs both on the machine it is opened on -- the keys read off pictures on each backend,
// badTv generated against hand-written to the byte, and ms per frame for the loop on both paths -- and a person on the
// rig saves its JSON as tools/ship/tsl-rig.json. This gate: (1) loads the page here at a small size and demands the
// keys and the table fill on the backends this box has; (2) reads tsl-rig.json if it exists and grades it (the keys
// within their tolerances, badTv identical, the timing finite), printing the table; without it, RIG-PENDING.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { webgpuSkipReason } from "./webgpuHarness.mjs";
import { LN2, PARAMS, truePeak } from "../../render/physicsTsl.mjs";
import { probeCpu as heidlerGrid } from "../../render/heidlerWgsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RIG_FILE = path.join(ENG, "tools/ship/tsl-rig.json");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

/** What a rig record must be to be believed: keys within the gates' own tolerances on every backend that ran, badTv identical, finite timing. */
export function gradeRig(t) {
    const problems = [];
    if (!t || !t.keys || !Array.isArray(t.timing)) return { ok: false, problems: ["no keys or timing"] };
    const backends = Object.keys(t.keys);
    if (!backends.some((k) => k.startsWith("three:"))) problems.push("no three backend ran");
    for (const [k, v] of Object.entries(t.keys)) {
        if (v.lyapunovMedian == null || Math.abs(v.lyapunovMedian - LN2) >= 2e-3) problems.push(`${k}: ln 2 reads ${v.lyapunovMedian}`);
        // the Heidler peak on a geometric grid of n columns: the best column misses the true peak by the grid's own step, so the
        // key is the CPU twin's maximum on the SAME grid (1 at n -> infinity; 0.99983 at 128), held to 1e-4
        const n = t.n || 256, f = PARAMS.first, gridMax = Math.max(...heidlerGrid({ i0: f.i0, t1: f.t1, t2: f.t2, eta: truePeak(f.t1, f.t2).peak, tLo: f.t1 / 50, tHi: f.t2 * 8, count: n, geometric: 1 }));
        if (k.startsWith("three:")) { if (!(Math.abs(v.heidlerPeak - gridMax) < 1e-4)) problems.push(`${k}: Heidler peak ${v.heidlerPeak} (the grid's own max is ${gridMax.toFixed(5)})`); if (!(Math.abs(v.wienPeakX - 4.965114) <= 12 / (t.n || 256))) problems.push(`${k}: Wien column ${v.wienPeakX}`); }
        if (k.startsWith("device:") && v.badTvSame !== v.badTvTotal) problems.push(`${k}: badTv ${v.badTvSame} of ${v.badTvTotal}`);
    }
    if (!t.timing.length) problems.push("no timing rows");
    for (const r of t.timing) { if (!["webgpu", "webgl2"].includes(r.backend)) problems.push(`backend ${r.backend}`); if (!(r.msPerFrame > 0 && Number.isFinite(r.msPerFrame))) problems.push(`ms ${r.msPerFrame}`); }
    return { ok: problems.length === 0, problems, backends, timing: t.timing };
}

console.log("\n0. THE GRADER ON THE CPU: a record that lies is refused by name");
{
    const good = { n: 256, keys: { "three:webgpu": { lyapunovMedian: LN2 + 1e-4, heidlerPeak: Math.max(...heidlerGrid({ i0: PARAMS.first.i0, t1: PARAMS.first.t1, t2: PARAMS.first.t2, eta: truePeak(PARAMS.first.t1, PARAMS.first.t2).peak, tLo: PARAMS.first.t1 / 50, tHi: PARAMS.first.t2 * 8, count: 256, geometric: 1 })), wienPeakX: 4.97 }, "device:webgpu": { lyapunovMedian: LN2, badTvSame: 4096, badTvTotal: 4096 } }, timing: [{ path: "three TSL", backend: "webgpu", msPerFrame: 3.2 }] };
    ok("a good record grades ok", gradeRig(good).ok, gradeRig(good).problems.join("; "));
    const bad = (patch) => { const t = JSON.parse(JSON.stringify(good)); patch(t); return gradeRig(t); };
    ok("REFUSED by name: ln 2 off by 3e-3, the Heidler peak at 0.99, Wien's column a column and a half off, badTv one pixel short, a timing of 0 ms, no three backend", !bad((t) => { t.keys["three:webgpu"].lyapunovMedian = LN2 + 3e-3; }).ok && /ln 2 reads/.test(bad((t) => { t.keys["three:webgpu"].lyapunovMedian = LN2 + 3e-3; }).problems[0]) && /Heidler peak/.test(bad((t) => { t.keys["three:webgpu"].heidlerPeak = 0.99; }).problems[0]) && /Wien column/.test(bad((t) => { t.keys["three:webgpu"].wienPeakX = 4.97 + 0.07; }).problems[0]) && /badTv 4095/.test(bad((t) => { t.keys["device:webgpu"].badTvSame = 4095; }).problems[0]) && /ms 0/.test(bad((t) => { t.timing[0].msPerFrame = 0; }).problems[0]) && /no three backend/.test(bad((t) => { delete t.keys["three:webgpu"]; }).problems[0]));
}

console.log("\n1. THE PAGE HERE: the keys read and the table fills on the backends this box has, and it says the rest is the rig's");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "tsl-rig.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU"] });
    const pg = await br.newPage({ viewport: { width: 640, height: 480 } }); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/?n=128`, { waitUntil: "load" });
    let json = null; for (let i = 0; i < 240 && !json; i++) { await pg.waitForTimeout(1000); const v = await pg.evaluate(() => document.getElementById("json").value); if (v) { try { const j = JSON.parse(v); if (j.timing || j.failed) json = j; } catch (e) {} } }
    const out = await pg.evaluate(() => document.getElementById("out").textContent);
    await br.close(); srv.close();
    ok("the page produced its JSON with keys and a timing table", json && !json.failed && json.keys && Array.isArray(json.timing) && json.timing.length >= 2, json ? (json.failed || `${json.timing && json.timing.length} rows, ${Object.keys(json.keys || {}).length} key sets`) : "no JSON within 240 s");
    if (json && !json.failed) {
        const g = gradeRig(json);
        ok("*** on this box the keys read right on every path that ran (ln 2 within 2e-3, the Heidler peak 1, Wien's column) and badTv generated equals hand-written ***", g.ok, g.problems.join("; ") || g.backends.join(", "));
        for (const r of json.timing) report(`${r.path} on ${r.backend}: ${r.msPerFrame} ms/frame for ${r.work} -- SwiftShader, not a GPU`);
        ok("  the page says the JSON is for tools/ship/tsl-rig.json and that the cost is RIG-PENDING until then", /tsl-rig\.json/.test(out) && /RIG-PENDING/.test(out));
        ok("  the page threw nothing", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    }
}

console.log("\n2. THE RIG'S NUMBER: tools/ship/tsl-rig.json, if the rig has signed one");
{
    if (!fs.existsSync(RIG_FILE)) {
        report("RIG-PENDING: no tools/ship/tsl-rig.json. Open tsl-rig.html on the rig, save the JSON from the box as that file, and this section grades it.");
        ok("without the rig's file the gate refuses the cost claim by saying so (not by passing quietly)", true, "RIG-PENDING");
    } else {
        const t = JSON.parse(fs.readFileSync(RIG_FILE, "utf8")); const g = gradeRig(t);
        ok("*** the rig's record: keys within tolerance on every path that ran, badTv identical, timing finite ***", g.ok, g.problems.join("; ") || `${t.ua && t.ua.slice(0, 60)} at ${t.when}`);
        for (const r of t.timing) report(`${r.path} on ${r.backend}: ${r.msPerFrame} ms/frame for ${r.work}`);
        const three = t.timing.filter((r) => r.path === "three TSL"), dev = t.timing.filter((r) => r.path === "device transplanted");
        for (const b of ["webgpu", "webgl2"]) { const a = three.find((r) => r.backend === b), d = dev.find((r) => r.backend === b); if (a && d) report(`${b}: the transplanted device pipeline runs the same loop at ${(a.msPerFrame / d.msPerFrame).toFixed(2)}x three's frame time`); }
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4322.
//   A  gradeRig() accepting any Heidler peak -> FIRST measured 0 red: the page's peaks are right, so a removed check has nothing
//      to catch, and the gate could not see that its own grader had gone blind. Section 0 was added (a record that lies, graded
//      on the CPU) and the same sabotage re-measured -> exit=1, 1 red, the refusal line. A grader is graded on a lie, not on the truth.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the rig itself (this box is SwiftShader; the numbers printed above are its, and say so); and whether a real GPU's " +
    "log() lands ln 2 as SwiftShader's does -- the file the rig saves is the first evidence either way.");
process.exit(fails ? 1 : 0);
