#!/usr/bin/env node
// WebGLEngine/tools/ship/rigCanvas-selfcheck.mjs -- v4300
//
// RECORDS WHAT THE SANDBOX CAN SEE, SO THE RIG CAN SAY WHETHER IT SEES THE SAME. Every WebGPU frame graded here
// went offscreen (the headless shell loses the device on a canvas-targeted pass). gpu-rig-check.html draws the
// same scene INTO a canvas on a real browser and compares. This gate (1) renders that scene offscreen on both
// backends here and writes tools/ship/rig-expected.json -- the per-colour pixel counts -- (2) loads the page
// here, where it takes WebGL2, and requires its own comparison to PASS against the file it just wrote, so the
// page's logic is exercised end to end before it is handed to a box nobody can watch from here.
//
// *** RIG-PENDING: open gpu-rig-check.html on Galaxina (Windows + GPU, over localhost or https) and read the
// verdict. PASS on webgpu is the fact this tree has never had. FAIL: paste the JSON into the next round. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const EXPECTED = path.join(ENG, "tools/ship/rig-expected.json");

console.log("\n1. THE SANDBOX'S PICTURE, OFFSCREEN, ON BOTH BACKENDS");
const skip = webgpuSkipReason();
let hist = null;
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: {}, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const records = G.gridScene({});
            const lods = [{ name: "mid", mesh: G.quadMesh(2, [0, 1, 0, 1]) }, { name: "coarse", mesh: G.quadMesh(1, [0, 0, 1, 1]) }, { name: "fine", mesh: G.quadMesh(4, [1, 0, 0, 1]) }];
            const CAM = { eye: [0, 0, 6], target: [0, 0, 0], fov: Math.PI / 3, near: 0.1, far: 100 };
            const proj = G.perspective(CAM.fov, 1, CAM.near, CAM.far), view = G.lookAt(CAM.eye, CAM.target), viewProj = G.multiply(proj, view);
            const scene = G.makeGpuDrivenScene(dev, { lods, thresholds: [0.025, 0.04], records, occlusion: "twoPhase" });
            scene.frame({ viewProj, view, proj, eye: CAM.eye });
            const f = scene.frame({ viewProj, view, proj, eye: CAM.eye, read: true }); const p = await f.pixels;
            const hist = {}; for (let i = 0; i < p.pixels.length; i += 4) { const k = p.pixels[i] + "," + p.pixels[i + 1] + "," + p.pixels[i + 2]; hist[k] = (hist[k] || 0) + 1; }
            out[backend] = { hist, counts: await scene.readCounts(), path: scene.path, phase2Ran: f.phase2Ran };
            scene.destroy(); dev.destroy();
        }
        return out;
    }` });
    ok("*** the rig scene renders offscreen on both backends here ***", r.ok, r.ok ? `${r.result.webgpu.path} | ${r.result.webgl2.path}` : r.reason);
    if (r.ok) {
        const W = r.result.webgpu, L = r.result.webgl2, keys = [...new Set([...Object.keys(W.hist), ...Object.keys(L.hist)])];
        let worst = 0; for (const k of keys) worst = Math.max(worst, Math.abs((W.hist[k] || 0) - (L.hist[k] || 0)));
        ok("  the two backends agree per colour within edge pixels", worst <= 600, `largest difference ${worst}`);
        ok("  two-phase occlusion ran on WebGPU", W.phase2Ran === true);
        hist = W.hist;
        const file = { from: "the sandbox's WebGPU backend, offscreen (SwiftShader), v4300", scene: "gridScene 16x16, three LODs, camera [0,0,6], two-phase Hi-Z, 256x256", hist: W.hist, webgl2: L.hist, counts: W.counts, tolerance: 600, written: new Date().toISOString() };
        fs.writeFileSync(EXPECTED, JSON.stringify(file, null, 1));
        ok("  and tools/ship/rig-expected.json is written for the rig to compare against", fs.existsSync(EXPECTED), `${keys.length} colours, ${Object.values(W.hist).reduce((a, b) => a + b, 0)} pixels`);
    }
}

console.log("\n2. THE PAGE, HERE: IT LOADS, COMPARES ITSELF TO THE FILE, AND PASSES ON WebGL2");
{
    const pw = resolvePlaywright(createRequire(import.meta.url));
    if (!pw || !fs.existsSync(HEADLESS_SHELL) || !hist) { console.log("  SKIP  no browser or no expected file"); fails++; }
    else {
        const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
        const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "gpu-rig-check.html" : u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
            s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await br.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" }); await pg.waitForTimeout(3000);
        const st = await pg.evaluate(() => ({ text: document.getElementById("out").textContent, json: document.getElementById("json").value }));
        await br.close(); srv.close();
        let j = null; try { j = JSON.parse(st.json); } catch {}
        ok("the page ran and produced its JSON", !!j && !j.failed, st.text.slice(0, 160));
        ok("  it took WebGL2 here (this shell cannot present WebGPU)", !!j && j.backend === "webgl2");
        ok("*** its own comparison against the file PASSES: the page's logic works before it goes to the rig ***", !!j && j.pass === true, j ? `worst per-colour difference ${j.worstDiff}` : "");
        ok("  and the page threw nothing", errs.filter((e) => !/favicon/.test(e)).length === 0, errs.slice(0, 2).join(" | ") || "clean");
        const src = fs.readFileSync(path.join(ENG, "gpu-rig-check.html"), "utf8");
        ok("  the page requests the DEFAULT device, so on a real browser it will present WebGPU to the canvas", /requestDevice\(cv, \{\}\)/.test(src) && !/offscreen: true/.test(src));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here, BY CONSTRUCTION: WebGPU presenting to a canvas. That is the rig's fact to report. Everything above " +
    "proves the page will ask the right question and grade the answer; it cannot answer it from a shell with no compositor.");
process.exit(fails ? 1 : 0);
