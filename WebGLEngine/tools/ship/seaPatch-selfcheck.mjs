// WebGLEngine/tools/ship/seaPatch-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~2 s with a browser; sections 1-3 alone ~0.3 s)
//
// Run: node tools/ship/seaPatch-selfcheck.mjs
//
// THE PATCH LAYER OVER THE VENDORED SEA, HELD TO WHAT IT CLAIMS (steps 2 and 3 of ocean-src-integration):
//   1  THE INPUT    vendor/web-ocean/js/main.js and js/wgsl/ocean.js are the pinned upstream files (sha256); every patch's anchor occurs, in order, exactly as often as the patch says; a drifted anchor throws;
//   2  THE OUTPUT   world/ocean/seaMain.mjs and world/ocean/seaOceanWgsl.mjs are byte for byte what applyPatches() makes of them, with the recorded sha256s, syntactically modules (node --check);
//   3  WHAT MOVED   running the patches BACKWARDS on each generated file gives upstream's bytes exactly, so nothing changed except what the lists name;
//   4  THE API      the api, hook, camera and probe text, cut out of the patched file, run in closures shaped like main()'s: setParams (swellSpread included) and its flags; setPoints and its 64-point clamp;
//                   the external camera (underwater y included) and the skipped pointer lock; the probe plumbing named end to end;
//   5  THE MODULE   (needs a browser; SKIPPED, and said, without one) the patched module loads from the engine's own origin with its imports resolved, exports P and seaApi, and with no WebGPU main()
//                   reports the failure on the page, leaves seaApi.ready false and still lets setParams set P;
//   6  THE PROBE    (needs the software WebGPU adapter; SKIPPED, and said, without one) the PATCHED HEIGHT_PROBE compiled and RUN on Dawn over a synthetic six-layer displacement texture: slot 0 (the camera)
//                   and five page points agree with a CPU twin of upstream's own 4-iteration fixed point, and slot 0 equals upstream's unpatched probe on the same inputs.
// SABOTAGES, each applied in place, restored, md5 verified; every one red by name (rows red): a patch anchor edited 1 | seaMain.mjs with one byte appended 3 | the hook not setting ready 9 | setParams ignoring swellSpread 6 |
// haze raising needLUT always 6 | an import path left relative 3 | the probe reading slot gid.x instead of gid.x - 1 3 | updateCamera not returning after an external camera 4 | one workgroup instead of 1 + count 2.
// NOT GRADED, said plainly: the sea on a GPU after any of this (the sandbox's adapter is a software rasteriser: the PROBE is run, the sea is not), the readback latency (every 8th frame, a few frames late, as upstream), and that
// upstream's files still equal the pinned ones.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as SP from "./seaPatch.mjs";
import os from "node:os";
import { headlessGpuSkipReason, resolveWebgpu, configureVulkanIcd, exitCleanly } from "./headlessGpu.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const up = fs.readFileSync(path.join(ENG, SP.UPSTREAM_PATH)), patchedOnDisk = fs.readFileSync(path.join(ENG, SP.PATCHED_PATH));
const upText = up.toString("utf8");
const oc = fs.readFileSync(path.join(ENG, SP.OCEAN_UPSTREAM_PATH)), ocText = oc.toString("utf8"), ocOnDisk = fs.readFileSync(path.join(ENG, SP.OCEAN_PATCHED_PATH));

console.log("seaPatch-selfcheck -- the patch layer over the vendored sea\n");
console.log("1. THE INPUT");
{
    ok("!! vendor/web-ocean/js/main.js is the pinned upstream file", SP.sha256(up) === SP.UPSTREAM_SHA256, SP.sha256(up).slice(0, 12));
    let applyMsg = ""; try { SP.applyPatches(upText); SP.applyPatches(ocText, SP.OCEAN_PATCHES); } catch (e) { applyMsg = e.message; }
    ok("!! every patch's anchor occurs, in order, exactly as often as the patch says (a patch may only anchor on text the earlier ones left)", applyMsg === "", applyMsg || SP.PATCHES.map((p) => p.id + " x" + p.count).join(", ") + " | " + SP.OCEAN_PATCHES.map((p) => p.id + " x" + p.count).join(", "));
    ok("!! vendor/web-ocean/js/wgsl/ocean.js is the pinned upstream file too", SP.sha256(oc) === SP.OCEAN_UPSTREAM_SHA256, SP.sha256(oc).slice(0, 12));
    let msg = "";
    try { SP.applyPatches(upText.replace("let needSpectrum = true", "let needSpectrumX = true")); } catch (e) { msg = e.message; }
    ok("!! a drifted upstream throws instead of patching quietly", /patch 'hook': anchor occurs 0 times/.test(msg), msg);
}

console.log("\n2. THE OUTPUT");
{
    const made = SP.applyPatches(upText);
    ok("!! world/ocean/seaMain.mjs is byte for byte what applyPatches makes of the vendored file", patchedOnDisk.equals(Buffer.from(made, "utf8")), patchedOnDisk.length + " bytes");
    ok("!! ... and has the recorded sha256 (PATCHED_SHA256)", SP.sha256(patchedOnDisk) === SP.PATCHED_SHA256, SP.sha256(patchedOnDisk).slice(0, 12));
    const chk = spawnSync(process.execPath, ["--check", path.join(ENG, SP.PATCHED_PATH)], { encoding: "utf8" });
    ok("  it parses as a module (node --check)", chk.status === 0, (chk.stderr || "").split("\n")[0]);
    ok("  no relative './wgsl/' import is left: the patched module can live outside the vendor directory (four wgsl modules by absolute vendor path, the patched ocean.js by ours)", !/from '\.\/wgsl\//.test(patchedOnDisk.toString("utf8")) && (patchedOnDisk.toString("utf8").match(/from '\/vendor\/web-ocean\/js\/wgsl\//g) || []).length === 4 && /from '\/world\/ocean\/seaOceanWgsl\.mjs'/.test(patchedOnDisk.toString("utf8")));
    ok("!! world/ocean/seaOceanWgsl.mjs is byte for byte what the ocean.js patches make, has the recorded sha256, parses as a module, and keeps no relative import",
        ocOnDisk.equals(Buffer.from(SP.applyPatches(ocText, SP.OCEAN_PATCHES), "utf8")) && SP.sha256(ocOnDisk) === SP.OCEAN_PATCHED_SHA256 && spawnSync(process.execPath, ["--check", path.join(ENG, SP.OCEAN_PATCHED_PATH)]).status === 0 && !/from '\.\//.test(ocOnDisk.toString("utf8")));
}

console.log("\n3. WHAT MOVED");
{
    let back = patchedOnDisk.toString("utf8");
    for (const p of [...SP.PATCHES].reverse()) back = back.split(p.replace).join(p.find);
    ok("!! the patches run BACKWARDS on seaMain.mjs give upstream's bytes exactly: nothing changed that PATCHES does not list", Buffer.from(back, "utf8").equals(up));
    let backO = ocOnDisk.toString("utf8");
    for (const p of [...SP.OCEAN_PATCHES].reverse()) backO = backO.split(p.replace).join(p.find);
    ok("!! ... and the same for the ocean.js patches", Buffer.from(backO, "utf8").equals(oc));
    report("the whole change: " + SP.reportLines(upText).slice(1).join(" | "));
}

console.log("\n4. THE API");
{
    const t = patchedOnDisk.toString("utf8");
    const a = t.indexOf("export const seaApi = {"), aEnd = t.indexOf("\n};\n", a) + 4;
    const h = t.indexOf("  seaApi.raise = "), hEnd = t.indexOf("  seaApi.ready = true;\n", h) + "  seaApi.ready = true;\n".length;
    ok("!! the api and hook text are found in the patched file", a > 0 && aEnd > a && h > 0 && hEnd > h);
    const apiSrc = t.slice(a, aEnd).replace("export const seaApi", "const seaApi"), hookSrc = t.slice(h, hEnd);
    const P = { windSpeed: 7, swellHs: 1.8, swellSpread: 48, haze: 3, foam: 1, bloom: 0.1 };
    const mk = () => new Function("P", `${apiSrc}\n const before = { ready: seaApi.ready };\n let needSpectrum = false, needLUT = false, envFull = 0, waterH = 0.42;\n${hookSrc}\n return { seaApi, before, flags: () => ({ needSpectrum, needLUT, envFull }), clear: () => { needSpectrum = false; needLUT = false; envFull = 0; } };`)(P);
    const w = mk();
    ok("!! before the hook runs the api is not ready, and setParams sets P with no raise to call (the sea reads P at its start)", w.before.ready === false);
    const pre = new Function("P", `${apiSrc}\n const r = seaApi.setParams({ swellHs: 2.5 }); return { r, ready: seaApi.ready };`)({ ...P });
    ok("  setParams before main() has built its flags still sets P and does not throw", pre.r.join() === "swellHs" && pre.ready === false);
    w.clear(); const r1 = w.seaApi.setParams({ swellSpread: 30, swellHs: 2, bogus: 1, foam: NaN, windSpeed: "9" });
    ok("!! setParams sets every key P has -- swellSpread, the one with no slider, included -- ignores the unknown key and the non-number, and takes a numeric string", r1.join() === "swellSpread,swellHs,windSpeed" && P.swellSpread === 30 && P.swellHs === 2 && P.windSpeed === 9 && !("bogus" in P) && P.foam === 1, JSON.stringify(P));
    ok("!! the spectrum keys raise needSpectrum and not needLUT; envFull is raised", w.flags().needSpectrum && !w.flags().needLUT && w.flags().envFull === 2);
    w.clear(); w.seaApi.setParams({ haze: 6 });
    ok("!! haze raises needLUT and NOT needSpectrum", w.flags().needLUT && !w.flags().needSpectrum && P.haze === 6);
    w.clear(); w.seaApi.setParams({ foam: 2, bloom: 0.2 });
    ok("  foam and bloom raise neither flag (upstream's sliders for them raise none), only envFull", !w.flags().needSpectrum && !w.flags().needLUT && w.flags().envFull === 2);
    ok("  after the hook: ready is true and waterHeight() reads the closure's waterH", w.seaApi.ready === true && w.seaApi.waterHeight() === 0.42);
    const pt = new Function("P", `${apiSrc}\n const a = seaApi.setPoints([1, 2, 3, 4]); const b = seaApi.count; const p = Array.from(seaApi.points.subarray(0, 4)); const c = seaApi.setPoints(new Array(400).fill(5)); return { a, b, c, count: seaApi.count, p, max: seaApi.MAX_POINTS, hs: seaApi.heights.length };`)({ ...P });
    ok("!! setPoints takes world (x, z) pairs, clamps at MAX_POINTS (64) and the heights array is the same size", pt.a === 2 && pt.b === 2 && pt.c === 64 && pt.count === 64 && pt.p.join() === "1,2,3,4" && pt.max === 64 && pt.hs === 64);
    // the camera patch: the line it adds to updateCamera, run against a cam and a seaApi.camera
    const cl = t.indexOf("    if (seaApi.camera) { const c = seaApi.camera;"), clEnd = t.indexOf("\n", cl);
    const camSrc = t.slice(cl, clEnd);
    const camRun = (camera) => new Function("camera", `const seaApi = { camera }; const cam = { x: 0, y: 2.4, z: 0, yaw: 0, pitch: -0.1, fovY: 1, speed: 6 }; const dt = 1;\n const r = (function(){ ${camSrc}\n return 'free'; })();\n return { r, cam };`)(camera);
    const ext = camRun({ x: 10, y: -5, z: 7, yaw: 1, pitch: 0.2, fovY: 0.7 }), free = camRun(null);
    ok("!! with seaApi.camera set the sea's camera IS that camera (underwater y included -- upstream's clamp is skipped) and updateCamera returns before keys or clamps; with none it falls through to upstream's free camera",
        ext.r === undefined && ext.cam.x === 10 && ext.cam.y === -5 && ext.cam.z === 7 && ext.cam.yaw === 1 && ext.cam.pitch === 0.2 && ext.cam.fovY === 0.7 && free.r === "free" && free.cam.y === 2.4);
    ok("!! the probe plumbing is whole: one workgroup per point plus the camera's, the copy and the readback sized for 1 + 64 slots, the page's points written to the device every frame, the heights taken from slot 1 on",
        /cp\.dispatchWorkgroups\(1 \+ seaApi\.count\)/.test(t) && /copyBufferToBuffer\(probeOut, 0, probeRead, 0, PROBE_N \* 4\)/.test(t) && /getMappedRange\(0, PROBE_N \* 4\)/.test(t) && /writeBuffer\(probePts, 0, seaApi\.points\)/.test(t) && /seaApi\.heights\.set\(hh\.subarray\(1, PROBE_N\)\)/.test(t) && /\{ buffer: probePts \}\], 'probe'/.test(t));
    ok("  the pointer lock is not requested for an externally driven camera, the canvas and the size come from seaApi when given", /if \(!seaApi\.camera && document\.pointerLockElement/.test(t) && /seaApi\.canvas \|\| document\.getElementById\('c'\)/.test(t) && /seaApi\.size \? seaApi\.size\.w : 0/.test(t));
}

console.log("\n5. THE MODULE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 never load the module, so they cannot show that its imports resolve from the engine's origin");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__sea.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><canvas id=c></canvas><div id=fps></div><div id=panel></div><div id=err></div>"); }
            if (u === "/__log") { res.writeHead(404); return res.end(); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message)));
            await pg.addInitScript(() => { try { Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined }); } catch {} });
            await pg.goto(base + "/__sea.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const M = await import("/world/ocean/seaMain.mjs");
                await new Promise((res) => setTimeout(res, 300));
                const applied = M.seaApi.setParams({ swellSpread: 33 });
                return { keys: Object.keys(M).sort(), ready: M.seaApi.ready, err: document.getElementById("err").textContent, applied, spread: M.P.swellSpread, same: M.P === M.seaApi.P };
            });
            ok("!! the patched module loads from the engine's origin (its five wgsl imports resolve), exporting P and seaApi", r.keys.join() === "P,seaApi", r.keys.join());
            ok("!! with no WebGPU main() reports it on the page, seaApi stays NOT ready, and setParams still sets upstream's P (swellSpread 33)", /WebGPU/.test(r.err) && r.ready === false && r.applied.join() === "swellSpread" && r.spread === 33 && r.same, r.err);
            ok("  no uncaught page error", errs.length === 0, errs.join(" | "));
        } finally { await br.close(); server.close(); }
    }
}

console.log("\n6. THE HEIGHT PROBE ON THE DEVICE");
{
    const skip = headlessGpuSkipReason(require_);
    if (skip) {
        report("device half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-5 read text, and text cannot show that the patched probe compiles or finds the label whose displaced position is each point");
    } else {
        // load the patched wgsl module in node: its absolute '/vendor/...' imports become file URLs
        const tmp = path.join(os.tmpdir(), "seaOceanWgsl-" + process.pid + ".mjs");
        const vendorUrl = "file://" + path.join(ENG, "vendor/web-ocean/js/wgsl/");
        fs.writeFileSync(tmp, ocOnDisk.toString("utf8").split("'/vendor/web-ocean/js/wgsl/").join("'" + vendorUrl));
        const W = await import("file://" + tmp); fs.unlinkSync(tmp);
        const probeUp = (await import("file://" + path.join(ENG, "vendor/web-ocean/js/wgsl/ocean.js"))).HEIGHT_PROBE;
        ok("!! the patched probe differs from upstream's only by the three patches (it names pts, gid and the runtime-sized output) and the unpatched one does not", /var<storage, read> pts: array<vec2f>/.test(W.HEIGHT_PROBE) && /outH\[gid\.x\]/.test(W.HEIGHT_PROBE) && !/pts/.test(probeUp) && /array<f32, 4>/.test(probeUp));
        // a synthetic displacement field: six 8x8 layers of rgba16float whose values are exact in half float, a smooth ramp plus one bump, wrapped
        const L = 8, CASC = 6, invL = [1 / 100, 1 / 37, 1 / 11, 1 / 5, 1 / 3, 1 / 2];
        const tex = new Uint16Array(L * L * 4 * CASC), hv = (x) => { if (Math.abs(x) < 6.2e-5) return 0; const f = new Float32Array([x]); const u = new Uint32Array(f.buffer)[0]; const sgn = (u >>> 16) & 0x8000, e = ((u >>> 23) & 0xff) - 127 + 15, m = (u >>> 13) & 0x3ff; return x === 0 ? 0 : sgn | (e << 10) | m; };
        const val = (c, i, j, ch) => ch === 0 ? 0.25 * Math.sin(2 * Math.PI * i / L + c) : ch === 1 ? (c === 0 ? 1.5 : 0.25) * Math.cos(2 * Math.PI * (i + 2 * j) / L - c) : 0.25 * Math.cos(2 * Math.PI * j / L + c);
        const q = (x) => { const f16 = hv(x); const s = (f16 & 0x8000) ? -1 : 1, e = (f16 >> 10) & 31, m = f16 & 1023; return x === 0 ? 0 : s * Math.pow(2, e - 15) * (1 + m / 1024); };
        for (let c = 0; c < CASC; c++) for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) for (let ch = 0; ch < 3; ch++) tex[((c * L + j) * L + i) * 4 + ch] = hv(val(c, i, j, ch));
        const T = (c, i, j, ch) => q(val(c, ((i % L) + L) % L, ((j % L) + L) % L, ch));
        const bil = (c, u, v, ch) => { const px = u * L - 0.5, py = v * L - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
            return (T(c, x0, y0, ch) * (1 - fx) + T(c, x0 + 1, y0, ch) * fx) * (1 - fy) + (T(c, x0, y0 + 1, ch) * (1 - fx) + T(c, x0 + 1, y0 + 1, ch) * fx) * fy; };
        const dispAt = (x, z) => { const d = [0, 0, 0]; for (let c = 0; c < CASC; c++) for (let ch = 0; ch < 3; ch++) d[ch] += bil(c, x * invL[c], z * invL[c], ch); return d; };
        const twinH = (gx, gz) => { let x0 = gx, z0 = gz; for (let i = 0; i < 4; i++) { const d = dispAt(x0, z0); x0 = gx - d[0]; z0 = gz - d[2]; } return dispAt(x0, z0)[1]; };
        const pts = [[3.2, -7.5], [40, 12.25], [-90.5, 61], [0.5, 0.5], [7.75, 120.4]], camXZ = [-12.5, 33.25];
        const frame = new Float32Array(96); frame[16] = camXZ[0]; frame[18] = camXZ[1];
        for (let c = 0; c < CASC; c++) frame[48 + c + (c >= 4 ? 0 : 0)] = invL[c];   // cascInvL at floats 48..55 (two vec4)
        const icd = configureVulkanIcd(); const { mod } = resolveWebgpu(require_);
        const gpu = mod.create([]), adapter = await gpu.requestAdapter(), dev = await adapter.requestDevice(), G = mod.globals || globalThis, U = G.GPUBufferUsage, TUg = G.GPUTextureUsage, MM = G.GPUMapMode;
        const run = async (code, withPts) => {
            const shader = dev.createShaderModule({ code }), ci = await shader.getCompilationInfo(), errs = ci.messages.filter((m) => m.type === "error").map((m) => m.lineNum + ":" + m.message);
            if (errs.length) return { errs };
            const fb = dev.createBuffer({ size: 384, usage: U.UNIFORM | U.COPY_DST }); dev.queue.writeBuffer(fb, 0, frame);
            const nOut = 1 + pts.length, ob = dev.createBuffer({ size: Math.max(16, nOut * 4), usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }), rb = dev.createBuffer({ size: Math.max(16, nOut * 4), usage: U.COPY_DST | U.MAP_READ });
            const pb = dev.createBuffer({ size: 64 * 8, usage: U.STORAGE | U.COPY_DST }); dev.queue.writeBuffer(pb, 0, new Float32Array(pts.flat()));
            const tx = dev.createTexture({ size: [L, L, CASC], format: "rgba16float", usage: TUg.TEXTURE_BINDING | TUg.COPY_DST }); dev.queue.writeTexture({ texture: tx }, tex, { bytesPerRow: L * 8, rowsPerImage: L }, [L, L, CASC]);
            const sm = dev.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "repeat", addressModeV: "repeat" });
            const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint: "main" } });
            const entries = [{ binding: 0, resource: { buffer: fb } }, { binding: 1, resource: tx.createView({ dimension: "2d-array" }) }, { binding: 2, resource: sm }, { binding: 3, resource: { buffer: ob } }];
            if (withPts) entries.push({ binding: 4, resource: { buffer: pb } });
            dev.pushErrorScope("validation");
            const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries }), enc = dev.createCommandEncoder(), cp = enc.beginComputePass();
            cp.setPipeline(pipe); cp.setBindGroup(0, bg); cp.dispatchWorkgroups(withPts ? nOut : 1); cp.end(); enc.copyBufferToBuffer(ob, 0, rb, 0, nOut * 4); dev.queue.submit([enc.finish()]);
            const verr = await dev.popErrorScope(); if (verr) return { errs: [String(verr.message).slice(0, 200)] };
            await rb.mapAsync(MM.READ); const v = Array.from(new Float32Array(rb.getMappedRange()).slice(0, nOut)); rb.unmap(); return { v };
        };
        const patched = await run(W.HEIGHT_PROBE, true), upstream = await run(probeUp, false);
        if (patched.errs) ok("!! the patched probe compiles and runs", false, patched.errs.join(" | "));
        else {
            const want = [twinH(camXZ[0], camXZ[1]), ...pts.map(([x, z]) => twinH(x, z))], worst = Math.max(...want.map((w, i) => Math.abs(w - patched.v[i])));
            ok("!! the patched HEIGHT_PROBE returns, for slot 0 the camera's water height and for slots 1.. each page point's, equal to a CPU twin of upstream's own fixed point over the same displacement texture (worst difference under 5e-3)", worst < 5e-3,
                "worst " + worst.toExponential(2) + "; heights " + patched.v.map((x) => x.toFixed(3)).join(", ") + " vs twin " + want.map((x) => x.toFixed(3)).join(", "));
            ok("!! the points are different places: the page's heights are not all one number, and the camera's slot equals upstream's unpatched probe on the same inputs", new Set(patched.v.slice(1).map((x) => x.toFixed(3))).size > 1 && !upstream.errs && Math.abs(upstream.v[0] - patched.v[0]) < 1e-6, upstream.errs ? upstream.errs.join(" | ") : "upstream slot 0 " + upstream.v[0].toFixed(4) + ", patched " + patched.v[0].toFixed(4));
        }
        dev.destroy();
    }
}

console.log(`\nseaPatch-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
