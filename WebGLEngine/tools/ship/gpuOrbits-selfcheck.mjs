#!/usr/bin/env node
// WebGLEngine/tools/ship/gpuOrbits-selfcheck.mjs -- v4299 (Level 12)
//
// GRADES render/gpuOrbits.mjs: THE ORRERY'S BODIES PLACED BY A COMPUTE PASS, FED STRAIGHT INTO THE CULL.
//
// The twin is world/orreryView.mjs positionAt() -- the function the 2D page draws with -- so the claim is not
// "the GPU orbits look right" but "the GPU puts every body where the page puts it", at f32. sin and cos on
// SwiftShader are the low-accuracy path (crossBackend-selfcheck measured tan at 4.6e-5), so the tolerance is
// stated against the body's own axis and the worst case is printed, not hidden inside a pass.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl, parseBindings } from "../../render/wgslSpec.mjs";
import * as G from "../../render/gpuDriven.mjs";
import * as O from "../../render/gpuOrbits.mjs";
import { buildOrrery } from "../../world/orrery.mjs";
import { positionAt } from "../../world/orreryView.mjs";
import { nullBackend } from "../../gfx/device.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const TODAY = "2026-09-01", T = 37.25;
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: TODAY });
const { elements, count, names } = O.elementsOf(system);

console.log("\n1. THE ELEMENTS ARE THE ORRERY'S OWN NUMBERS");
{
    ok("the orbit shader validates and declares info, elements, records", validateWgsl(O.orbitWgsl()).length === 0 && parseBindings(O.orbitWgsl()).map((b) => b.name).join() === "info,elements,records");
    ok(`the baked orrery gives ${system.bodies.length} bodies, plus the centre`, count === system.bodies.length + 1 && names[0] === "SweK");
    ok("  every body's axis, period and radius come from buildOrrery unchanged", system.bodies.every((b, i) => elements[(i + 1) * 4] === Math.fround(b.a) && elements[(i + 1) * 4 + 1] === Math.fround(b.period) && elements[(i + 1) * 4 + 3] === Math.fround(b.radius)));
    ok("  the centre sits still at the origin", elements[0] === 0 && elements[1] === 0);
    const cpu = O.orbitRecordsCpu(system, T);
    ok("the twin IS positionAt", system.bodies.every((b, i) => { const p = positionAt(b, T); return cpu[(i + 1) * 4] === Math.fround(p.x) && cpu[(i + 1) * 4 + 1] === Math.fround(p.y); }));
    const nb = nullBackend(); const src = O.makeOrbitSource(nb, system); src.advance(T);
    const sc = G.makeGpuDrivenScene(nb, { lods: [{ name: "b", mesh: G.quadMesh(2) }, { name: "c", mesh: G.quadMesh(1) }], thresholds: [0.02], records: src });
    const ext = Math.max(...system.bodies.map((b) => b.a)), eye = [0, 0, ext * 2.2];
    sc.frame({ viewProj: G.multiply(G.perspective(1, 1, 0.1, 500), G.lookAt(eye, [0, 0, 0])), eye });
    ok("a source with only a cpu() twin drives the null backend's scene", src.count === count && nb.ops.some((o) => o[0] === "drawIndexed"));
}

console.log("\n2. THE GPU PUTS EVERY BODY WHERE positionAt PUTS IT");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { T, bodies: raw.bodies, TODAY }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const O = await import("/render/gpuOrbits.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const { buildOrrery } = await import("/world/orrery.mjs");
        const system = buildOrrery(a.bodies, { today: a.TODAY });
        const ext = Math.max(...system.bodies.map((b) => b.a)), eye = [0, 0, ext * 2.2];
        const proj = G.perspective(1, 1, 0.1, 500), view = G.lookAt(eye, [0, 0, 0]), viewProj = G.multiply(proj, view);
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const src = O.makeOrbitSource(dev, system);
            const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "big", mesh: G.quadMesh(2, [1, 1, 0, 1]) }, { name: "small", mesh: G.quadMesh(1, [0, 0.5, 1, 1]) }], thresholds: [0.02], records: src });
            const o = { backend: dev.backend, path: src.advance(a.T).path };
            const f = sc.frame({ viewProj, eye, read: true }); const p = await f.pixels;
            o.records = Array.from(await src.readRecords()); o.counts = await sc.readCounts(); o.pixels = Array.from(p.pixels);
            src.advance(a.T + 100); sc.frame({ viewProj, eye }); o.records2 = Array.from(await src.readRecords());
            sc.destroy(); src.destroy(); dev.destroy(); out[backend] = o;
        }
        return out;
    }` });
    ok("*** the orbit pass runs and feeds the cull on WebGPU; WebGL2 runs the twin ***", r.ok && r.result.webgpu.path === "compute" && r.result.webgl2.path === "cpu", r.ok ? "" : r.reason);
    if (r.ok) {
        const W = r.result.webgpu, cpu = O.orbitRecordsCpu(system, T);
        let worstRel = 0, worstName = "";
        for (let i = 0; i < count; i++) { const a = Math.max(0.05, elements[i * 4]); const d = Math.hypot(W.records[i * 4] - cpu[i * 4], W.records[i * 4 + 1] - cpu[i * 4 + 1]) / a; if (d > worstRel) { worstRel = d; worstName = names[i]; } }
        // Measured at Level 12: 1.9e-4 of the axis with the raw angle, and sin/cos are SwiftShader's low-accuracy
        // path (tan measured 4.6e-5 off at v4290). The bound is stated against that measurement, not chosen
        // to pass, and the worst body is printed so a regression has a name.
        ok("*** every GPU position is within 2e-4 of its axis from positionAt ***", worstRel < 2e-4, `worst ${worstRel.toExponential(2)} of the axis, on ${worstName}`);
        ok("  radii travel through untouched", system.bodies.every((b, i) => W.records[(i + 1) * 4 + 3] === Math.fround(b.radius)));
        ok("  z is 0: the orbit plane is the page's plane", W.records.every((v, i) => i % 4 !== 2 || v === 0));
        ok("CONTROL: 100 days later every orbiting body has moved", system.bodies.every((b, i) => Math.hypot(W.records2[(i + 1) * 4] - W.records[(i + 1) * 4], W.records2[(i + 1) * 4 + 1] - W.records[(i + 1) * 4 + 1]) > 1e-3));
        const ext = Math.max(...system.bodies.map((b) => b.a)), eye = [0, 0, ext * 2.2];
        const u = G.packCullUniforms({ planes: G.frustumPlanes(G.multiply(G.perspective(1, 1, 0.1, 500), G.lookAt(eye, [0, 0, 0]))), eye, thresholds: [0.02], count, lodCount: 2, cap: count });
        const twin = G.cullLodCpu(cpu, u);
        ok("*** the cull counts on the GPU-written records equal the twin's on positionAt's ***", W.counts.join() === Array.from(twin.counts).join(), `gpu ${W.counts.join("/")} twin ${Array.from(twin.counts).join("/")}`);
        ok("  and WebGL2's twin route agrees", r.result.webgl2.counts.join() === Array.from(twin.counts).join());
        const hist = (P) => { const c = {}; for (let i = 0; i < P.length; i += 4) { const k = P[i] + "," + P[i + 1] + "," + P[i + 2]; c[k] = (c[k] || 0) + 1; } return c; };
        const hw = hist(W.pixels), hl = hist(r.result.webgl2.pixels);
        const keys = [...new Set([...Object.keys(hw), ...Object.keys(hl)])]; let worstHist = 0; for (const k of keys) worstHist = Math.max(worstHist, Math.abs((hw[k] || 0) - (hl[k] || 0)));
        ok("  the two backends' frames agree per colour to within a body's edge pixels", worstHist <= 64, `largest per-colour count difference ${worstHist} pixels`);
        ok("CONTROL: bodies were drawn", (hw["255,255,0"] || 0) + (hw["0,128,255"] || 0) > 50);
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

console.log("\n3. THE PAGE: orrery-gpu.html LOADS, PICKS A ROUTE AND SAYS WHICH");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const page = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    ok("the page imports the orbit source, the GPU-driven scene and the device, and links the 2D orrery", /gpuOrbits\.mjs/.test(page) && /gpuDriven\.mjs/.test(page) && /gfx\/device\.js/.test(page) && /orrery\.html/.test(page));
    ok("  and refuses to pretend when there is no device", /nothing can be drawn/.test(page));
    // Loaded WITHOUT WebGPU flags: this shell cannot present WebGPU to a canvas, so the page's WebGL2 fallback is
    // the route under test, and the HUD must say so. (The WebGPU route is graded in section 2, offscreen.)
    const { resolvePlaywright, HEADLESS_SHELL } = await import("./playwrightResolve.mjs");
    const { createRequire } = await import("node:module"); const http = await import("node:http");
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "orrery-gpu.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await br.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" }); await pg.waitForTimeout(1500);
    const st = await pg.evaluate(() => ({ route: document.getElementById("route").textContent, drawn: document.getElementById("drawn").textContent, t: Number(document.getElementById("t").textContent) }));
    const shot1 = await pg.screenshot({ type: "png" }); await pg.waitForTimeout(400); const shot2 = await pg.screenshot({ type: "png" });
    await br.close(); srv.close();
    ok("*** the page loads and takes the WebGL2 route here, saying so in the HUD ***", /webgl2/.test(st.route) && /CPU twin/.test(st.route), st.route);
    ok("  the clock runs and the counts are reported", st.t > 0 && /of 15/.test(st.drawn), `t=${st.t} drawn ${st.drawn}`);
    ok("  the picture moves", !shot1.equals(shot2));
    ok("  and the page threw nothing", errs.filter((e) => !/favicon/.test(e)).length === 0, errs.slice(0, 2).join(" | ") || "clean");
}

// =============================================================================================================
// SABOTAGE LOG -- each applied, gate run, exit code read, restored. MEASURED at Level 12.
//   A  the angular rate doubled in the WGSL -> exit=1, 1 red: worst 1.99 of the axis on heerich (a body on the
//      far side of its orbit). Counts and pictures stayed within bounds: the cull does not know where a body
//      SHOULD be, only where it is -- which is why positionAt is the oracle and not the frame.
//   B  the orbit pass never dispatched -> exit=1, 6 red: every record reads back as zero, the radii are gone,
//      nothing moves after 100 days, the GPU culls 0/15 against the twin's 7/8, and no bodies are drawn.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE PICTURE AGAINST THE 2D ORRERY. The 2D page draws discs, labels and orbit rings in " +
    "canvas 2D; this draws quads through the device. What is compared is WHERE, not how it looks -- the " +
    "position is the physics, the disc is the view. Also unchecked: f32 sin/cos over very many periods, where " +
    "2*PI*t/period loses precision on the GPU before it does in f64.");
process.exit(fails ? 1 : 0);
