#!/usr/bin/env node
// WebGLEngine/tools/ship/gpuUniverse-selfcheck.mjs -- v4299 (Level 13)
//
// GRADES THE UNIVERSE ON THE GPU-DRIVEN PATH: 694 Endless Sky systems and 5,517 stellar objects as records,
// culled and LOD-picked against the twin at scale, two-phase occluded on WebGPU, and PICKED by name.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import * as G from "../../render/gpuDriven.mjs";
import { universeRecords, slimUniverse, kindOf } from "../../world/universeBodies.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "es-universe.json"), "utf8"));
const slim = slimUniverse(raw), U = universeRecords(slim);
const N = 256, CAM = { eye: [0, -U.extent * 0.9, U.extent * 1.3], target: [0, 0, 0], fov: 0.9, near: 0.05, far: U.extent * 8 };
const proj = G.perspective(CAM.fov, 1, CAM.near, CAM.far), view = G.lookAt(CAM.eye, CAM.target, [0, 1, 0]), viewProj = G.multiply(proj, view);
const THRESHOLDS = [0.004, 0.012];

console.log("\n1. THE RECORDS ARE THE FILE'S");
{
    ok(`every system is a record: ${U.systems}`, U.systems === raw.systems.length && U.count > U.systems);
    ok("  every stellar object of every system follows, in system order", U.count === U.systems + raw.systems.reduce((a, s) => a + (s.spobs || []).length, 0));
    const i = raw.systems.findIndex((s) => s.name === "Sol");
    ok("  Sol sits where the file puts it, on the XY plane with no lift", i >= 0 && Math.abs(U.records[i * 4] - raw.systems[i].x * 0.01) < 1e-6 && Math.abs(U.records[i * 4 + 1] - raw.systems[i].y * 0.01) < 1e-6 && U.records[i * 4 + 2] === 0, i >= 0 ? `record ${i} at (${U.records[i * 4].toFixed(2)}, ${U.records[i * 4 + 1].toFixed(2)})` : "no Sol");
    ok("  its star is lifted above it, toward the camera", U.records[(U.systems + raw.systems.slice(0, i).reduce((a, s) => a + (s.spobs || []).length, 0)) * 4 + 2] > 0);
    ok("  a slim universe reproduces the same records as the full file", (() => { const F = universeRecords(raw); return F.count === U.count && F.records.every((v, k) => v === U.records[k]) && F.names.join("|") === U.names.join("|"); })());
    const kinds = {}; for (const k of U.kinds) kinds[k] = (kinds[k] || 0) + 1;
    ok("  stars are larger than planets are larger than stations, by kind", kinds.star > 0 && kinds.planet > 0 && kinds.station > 0 && kindOf({ isStar: true }) === "star" && kindOf({ isStation: true }) === "station", JSON.stringify(kinds));
    ok("  every record's name maps back", U.names.every((n) => typeof n === "string" && n.length > 0) && U.names.length === U.count);
}

console.log("\n2. AT SCALE, ON BOTH BACKENDS, WITH PICKING");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    // picks from a camera NEAR SOL: from the whole-map vantage a marker is a fraction of a pixel, which is not a
    // picking failure but a vantage. Targets: Sol's own record and the objects in it, each at its own lifted centre.
    const sol = raw.systems.findIndex((s) => s.name === "Sol");
    const targets = [sol]; for (let i = U.systems; i < U.count; i++) if (U.systemOf[i] === sol) targets.push(i);
    const solC = [U.records[sol * 4], U.records[sol * 4 + 1], 0];
    const NEAR = { eye: [solC[0], solC[1] - 4, 6], target: solC, fov: 0.7, near: 0.05, far: 200 };
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, CAM, NEAR, THRESHOLDS, slim, targets }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { universeRecords } = await import("/world/universeBodies.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const U = universeRecords(a.slim);
        const lods = () => [{ name: "far", mesh: G.quadMesh(1, [0.35, 0.5, 0.8, 1]) }, { name: "mid", mesh: G.quadMesh(2, [0.55, 0.7, 0.95, 1]) }, { name: "near", mesh: G.quadMesh(5, [0.85, 0.92, 1, 1]) }];
        const proj = G.perspective(a.CAM.fov, 1, a.CAM.near, a.CAM.far), view = G.lookAt(a.CAM.eye, a.CAM.target, [0, 1, 0]), viewProj = G.multiply(proj, view);
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const t0 = performance.now();
            const sc = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: a.THRESHOLDS, records: U.records, occlusion: "twoPhase" });
            const f1 = sc.frame({ viewProj, view, proj, eye: a.CAM.eye }); const f2 = sc.frame({ viewProj, view, proj, eye: a.CAM.eye, read: true }); const p = await f2.pixels;
            const ms = performance.now() - t0;
            const counts = await sc.readCounts(), counts2 = await sc.readCounts2();
            // move the camera near Sol for the picks (a fresh frame, so the pick picture is that vantage's)
            const nproj = G.perspective(a.NEAR.fov, 1, a.NEAR.near, a.NEAR.far), nview = G.lookAt(a.NEAR.eye, a.NEAR.target, [0, 1, 0]), nvp = G.multiply(nproj, nview);
            sc.frame({ viewProj: nvp, view: nview, proj: nproj, eye: a.NEAR.eye }); sc.frame({ viewProj: nvp, view: nview, proj: nproj, eye: a.NEAR.eye });
            const picks = {};
            for (const i of a.targets) { const c = [U.records[i * 4], U.records[i * 4 + 1], U.records[i * 4 + 2]]; const q = G.project(nvp, c); picks[i] = await sc.pick((q[0] * 0.5 + 0.5) * a.N, (1 - (q[1] * 0.5 + 0.5)) * a.N); }
            out[backend] = { backend: dev.backend, path: sc.path, counts, counts2, phase2: f2.phase2Ran, pixels: Array.from(p.pixels), picks, ms, count: U.count };
            sc.destroy(); dev.destroy();
        }
        return out;
    }` });
    ok("*** 6,211 records cull, draw and pick on both backends ***", r.ok, r.ok ? `${r.result.webgpu.path} ${r.result.webgpu.ms.toFixed(0)} ms for two frames | ${r.result.webgl2.path} ${r.result.webgl2.ms.toFixed(0)} ms` : r.reason);
    if (r.ok) {
        const W = r.result.webgpu, L = r.result.webgl2;
        const ranked = G.rankLods([{ name: "far", mesh: G.quadMesh(1) }, { name: "mid", mesh: G.quadMesh(2) }, { name: "near", mesh: G.quadMesh(5) }], THRESHOLDS);
        const u = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: ranked.thresholds, count: U.count, lodCount: 3, cap: U.count });
        const twin = G.cullLodCpu(U.records, u);
        ok("WebGL2's twin counts are the twin's", L.counts.join() === Array.from(twin.counts).join(), `${L.counts.join("/")} of ${U.count}`);
        const sumW = W.counts.map((c, l) => c + (W.counts2 ? W.counts2[l] : 0));
        ok("*** WebGPU's two phases together never exceed the frustum count, and occlusion removed some ***", sumW.every((c, l) => c <= twin.counts[l]) && sumW.reduce((a, b) => a + b, 0) < twin.visible && W.phase2 === true, `phase 1 ${W.counts.join("/")} + phase 2 ${W.counts2.join("/")} vs frustum ${Array.from(twin.counts).join("/")}`);
        ok("CONTROL: most of the universe is in view from this vantage", twin.visible > U.count * 0.5, `${twin.visible} of ${U.count}`);
        // A pick that names another body is RIGHT when that body's quad covers the point and sits at least as
        // high (its lift, toward the camera): the depth test chose it. Anything else is wrong.
        const covers = (hitId, targetId) => { const hx = U.records[hitId * 4], hy = U.records[hitId * 4 + 1], hz = U.records[hitId * 4 + 2], hr = U.records[hitId * 4 + 3];
            // one pixel of slack in map units at this distance: the pick pixel is the FLOOR of the projected centre
            const tx = U.records[targetId * 4], ty = U.records[targetId * 4 + 1], tz = U.records[targetId * 4 + 2], px = 7.2 * 2 * Math.tan(NEAR.fov / 2) / N; return Math.abs(hx - tx) <= hr + px && Math.abs(hy - ty) <= hr + px && hz >= tz; };
        for (const b of ["webgpu", "webgl2"]) {
            let exact = 0, covered = 0, wrong = []; for (const i of Object.keys(r.result[b].picks)) { const h = r.result[b].picks[i]; if (h && h.id === Number(i)) exact++; else if (h && covers(h.id, Number(i))) covered++; else wrong.push(`${U.names[i]}->${h ? U.names[h.id] : "nothing"}`); }
            ok(`*** ${b}: near Sol, every one of Sol's records picks as itself or as a body whose quad covers it from in front ***`, wrong.length === 0 && exact >= 2, `${exact} exact, ${covered} covered by a nearer body, ${wrong.length} wrong of ${Object.keys(r.result[b].picks).length}${wrong.length ? " -- " + wrong.join(", ") : ""}`);
        }
        const hist = (P) => { const c = {}; for (let i = 0; i < P.length; i += 4) { const k = P[i] + "," + P[i + 1] + "," + P[i + 2]; c[k] = (c[k] || 0) + 1; } return c; };
        const hw = hist(W.pixels), hl = hist(L.pixels), keys = [...new Set([...Object.keys(hw), ...Object.keys(hl)])]; let worst = 0; for (const k of keys) worst = Math.max(worst, Math.abs((hw[k] || 0) - (hl[k] || 0)));
        ok("  the two backends agree per colour within edge pixels, occluded or not", worst <= N * 2, `largest per-colour difference ${worst} of ${N * N}`);
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

console.log("\n3. THE PAGE LOADS, NAMES ITS ROUTE, AND NAMES WHAT THE POINTER IS OVER");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "universe-gpu.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await br.newPage({ viewport: { width: 640, height: 480 } }); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" }); await pg.waitForTimeout(4000);
    // sweep the pointer across the middle until something is named
    let named = null; for (let x = 40; x < 640 && !named; x += 24) { await pg.mouse.move(x, 250); await pg.waitForTimeout(150); const t = await pg.evaluate(() => document.getElementById("pick").textContent); if (/record \d+/.test(t)) named = t; }
    const st = await pg.evaluate(() => ({ route: document.getElementById("route").textContent, bodies: document.getElementById("bodies").textContent, drawn: document.getElementById("drawn").textContent }));
    await br.close(); srv.close();
    ok("*** the page loads on the WebGL2 route here and says so ***", /webgl2/.test(st.route), st.route);
    ok("  it counts the file's records", /694 systems/.test(st.bodies) && /6211 records/.test(st.bodies), st.bodies);
    ok("  it reports what it drew", /of 6211/.test(st.drawn), st.drawn);
    ok("*** hovering names a system or body from a pick ***", !!named, named || "nothing named along the sweep");
    ok("  and the page threw nothing", errs.filter((e) => !/favicon/.test(e)).length === 0, errs.slice(0, 2).join(" | ") || "clean");
}

// =============================================================================================================
// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at Level 13.
//   A  the lift removed (every record on one plane) -> exit=1, 3 red: the star is no longer above its system,
//      and near Sol 0 of 20 picks are exact -- all 20 resolve to "a body in front", which with equal depths means
//      draw order, the atomics' order, decided every one. The lift is what makes a pick an answer.
//   0  (found, not planted) the map first went on XZ while the quads lie in XY, so from above every marker was a
//      sliver and the picks named neighbours; and objects at 0.02 map units per in-system pixel put Sol's planets
//      over Caph's star. Both measured by this gate before the model was right.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SPEED at this scale on a real GPU -- the milliseconds printed are SwiftShader's, two frames " +
    "including pipeline creation, and say nothing about Keith's box. Also unchecked: links between systems (the file has " +
    "them; nothing draws them) and the Hi-Z counts against a twin, which hiZ-selfcheck grades on a scene built for it.");
process.exit(fails ? 1 : 0);
