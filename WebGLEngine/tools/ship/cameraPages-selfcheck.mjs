// WebGLEngine/tools/ship/cameraPages-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/cameraPages-selfcheck.mjs      (about a minute: four pages in headless Chromium)
//
// THE SHARED CAMERA AND THE WEBGL2 GPU TIMER ON MORE PAGES, HELD (2026-11-22; Keith: "Shared camera controls on more pages. and GPU timer on the other WebGL2 pages").
// render/cameraControls.mjs replaced the drag-and-wheel code of celltrack-splat.html, ocean-default.html and fluid-webgpu-3d.html; render/gpuTimerGL.mjs times the draws of
// celltrack-splat.html, ocean-default.html and star_gas.html. For each page in a real browser:
//
//   THE CAMERA   it comes up with the shared controls and no page error; a 50 px drag turns the DRAWN camera by the page's own drag feel (0.008 or 0.006 rad a pixel), the wheel
//                brings it nearer within the page's own zoom range, a long drag stops at the page's own pitch limit, F frames what the page frames
//   THE TIMER    the page's draws are timed on the card under their labels (celltrack: trails and nuclei; ocean: water and buoys; star_gas: gas and stars), each a positive time,
//                shown on the page with "on the card"
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PRESENT_ARGS, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("cameraPages-selfcheck -- the shared camera and the WebGL2 GPU timer on more pages\n");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const base = `http://127.0.0.1:${srv.address().port}`, { chromium } = resolvePlaywright(require);
const gl = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
const gpu = webgpuSkipReason(require) ? null : await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });

/** Open a page, wait for its camera (or timer), and drive the camera: { a, b, c, d, e, errors } -- poses before, after a drag, after the wheel, after a long drag down, after F. */
async function drive(browser, url, { rpp, settle = 1500, ready = "window.__camera" } = {}) {
    const p = await browser.newPage({ viewport: { width: 1000, height: 700 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + url); await p.waitForFunction(ready, null, { timeout: 90000 }); await wait(800);
    const at = await p.evaluate(() => { const c = window.__camera && window.__camera.input ? document.querySelector("canvas") : null; for (let y = 650; y > 200; y -= 25) for (let x = 500; x < 950; x += 25) { const e = document.elementFromPoint(x, y); if (e && e.tagName === "CANVAS") return [x, y]; } return null; });
    const pose = () => p.evaluate(() => { const q = window.__camera.controls.pose(); return { yaw: q.yaw, pitch: q.pitch, distance: q.distance, target: q.target, opts: { minPitch: window.__camera.controls.options.minPitch, maxPitch: window.__camera.controls.options.maxPitch } }; });
    const out = { errors, at };
    if (!at) return out;
    out.a = await pose(); await p.mouse.move(...at); await p.mouse.down(); await p.mouse.move(at[0] + 50, at[1], { steps: 5 }); await p.mouse.up(); await wait(settle); out.b = await pose();
    await p.mouse.wheel(0, -300); await wait(settle); out.c = await pose();
    await p.mouse.move(...at); await p.mouse.down(); await p.mouse.move(at[0], at[1] + 600, { steps: 8 }); await p.mouse.up(); await wait(settle); out.d = await pose();
    await p.mouse.move(...at); await p.mouse.down(); await p.mouse.move(at[0], at[1] - 600, { steps: 8 }); await p.mouse.up(); await wait(settle); out.f = await pose();   // a long drag UP: the lower pitch limit
    await p.evaluate(() => window.__camera.controls.zoom(3)); await wait(settle); await p.keyboard.press("KeyF"); await wait(settle); out.e = await pose();
    out.page = p; return out;
}
const near = (a, b, e = 2e-3) => Math.abs(a - b) < e;
const camOk = (r, rpp, maxPitch, minPitch) => r.at && r.errors.length === 0 && near(r.b.yaw, r.a.yaw - 50 * rpp) && r.c.distance < r.b.distance && near(r.d.pitch, maxPitch, 1e-6) && near(r.f.pitch, minPitch, 1e-6) && Math.abs(r.e.distance - r.c.distance * 3) > 1e-2;
const camLine = (r) => (r.at ? `yaw ${r.a.yaw.toFixed(3)} -> ${r.b.yaw.toFixed(3)}, distance ${r.b.distance.toFixed(1)} -> ${r.c.distance.toFixed(1)}, pitch after a long drag down ${r.d.pitch.toFixed(4)}, up ${r.f.pitch.toFixed(4)}, F -> ${r.e.distance.toFixed(1)}; ${r.errors.slice(0, 1).join("")}` : `no canvas found under the pointer; ${r.errors.slice(0, 1).join("")}`);

console.log("1. celltrack-splat.html (WebGL2)");
await section(async () => {
    const r = await drive(gl, "/celltrack-splat.html", { rpp: 0.008 });
    ok("!! THE CAMERA: a 50 px drag turns the drawn camera by 0.4 rad (the page's 0.008), the wheel brings it nearer, long drags stop at the page's pitch limits 1.55 and 0.12, it starts framed on the cells (3.2 of their radii, not the module's default 3), F frames the cells, no page error", camOk(r, 0.008, 1.55, 0.12) && r.a.distance > 10, camLine(r));
    const t = r.page ? await r.page.evaluate(async () => { for (let k = 0; k < 60 && !window.__gpuTimes; k++) await new Promise((q) => setTimeout(q, 100)); return { times: window.__gpuTimes || null, text: (document.getElementById("gpuTimes") || {}).textContent || "" }; }) : null;
    ok("!! THE TIMER: the trails and the nuclei timed on the card, each a positive time, shown with \"on the card\"", t && t.times && t.times.trails > 0 && t.times.nuclei > 0 && /on the card/.test(t.text), JSON.stringify(t));
    if (r.page) await r.page.close();
});

console.log("2. ocean-default.html (WebGL2)");
await section(async () => {
    const r = await drive(gl, "/ocean-default.html", { rpp: 0.006 });
    ok("!! THE CAMERA: a 50 px drag turns the drawn camera by 0.3 rad (the page's 0.006), the wheel nearer, long drags stop at the page's pitch limits 1.45 and 0.06, F frames the sea, no page error", camOk(r, 0.006, 1.45, 0.06) && r.c.distance >= 30, camLine(r));
    const t = r.page ? await r.page.evaluate(async () => { for (let k = 0; k < 60 && !(window.__ocean.gpuTimes); k++) await new Promise((q) => setTimeout(q, 100)); return { times: window.__ocean.gpuTimes || null, hud: (document.getElementById("hud") || {}).textContent || "" }; }) : null;
    ok("!! THE TIMER: the water and the buoys timed on the card, each a positive time, on the status text with \"on the card\"", t && t.times && t.times.water > 0 && t.times.buoys > 0 && /on the card/.test(t.hud), JSON.stringify(t && t.times));
    if (r.page) await r.page.close();
});

console.log("3. fluid-webgpu-3d.html (WebGPU)");
if (!gpu) console.log(`  ----  skipped: ${webgpuSkipReason(require)}`);
else await section(async () => {
    // the solver needs 12 storage buffers a shader stage; SwiftShader offers 10, so here the page shows its own refusal and never builds a camera -- said, and the wiring read
    const probe = await gpu.newPage(); await probe.goto(base + "/fluid-webgpu-3d.html"); await wait(6000);
    const refused = await probe.evaluate(() => { const n = document.getElementById("note"); return n && /storage buffers per stage; the solver needs 12/.test(n.textContent) ? n.textContent : null; }); await probe.close();
    if (refused) console.log(`  ----  the page cannot run on this adapter (${refused.replace(/.*This GPU/, "this GPU")}); its camera is held by its source below, and runs on a real GPU`);
    else { const r = await drive(gpu, "/fluid-webgpu-3d.html", { rpp: 0.008 }); ok("!! THE CAMERA: a 50 px drag turns the drawn camera by 0.4 rad, the wheel nearer, a long drag stops at the page's pitch limit 1.4, F frames the tank, no page error", camOk(r, 0.008, 1.4, -1.4), camLine(r)); if (r.page) await r.page.close(); }
});
await section(() => {
    const src = fs.readFileSync(path.join(ENG, "fluid-webgpu-3d.html"), "utf8");
    ok("!! ITS SOURCE: the shared controls with the page's own start (yaw 0.7, pitch 0.5, 1.9 tank widths about the tank's centre), pitch range -1.4 to 1.4, zoom 0.7 to 4 widths; bound to the canvas with F on the tank; ticked and read in writeCam; the old drag code gone",
        /createCameraControls\(\{ up: "y", yaw: 0\.7, pitch: 0\.5, distance: NX \* 1\.9, target: \[NX \/ 2, NY \/ 2, NZ \/ 2\], fovY: 1\.05, minPitch: -1\.4, maxPitch: 1\.4, minDistance: NX \* 0\.7, maxDistance: NX \* 4 \}\)/.test(src)
        && /camInput = bindCameraControls\(cvs, controls, \{ focusOn:/.test(src) && /if \(camInput\) camInput\.tick\(/.test(src) && /const pose = controls\.pose\(\), eye = pose\.eye;/.test(src) && !/yaw -= \(e\.clientX - lx\)/.test(src));
});

console.log("4. star_gas.html (WebGL2, the timer only)");
await section(async () => {
    const p = await gl.newPage({ viewport: { width: 1000, height: 700 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/star_gas.html"); await p.waitForFunction(() => window.__gpuTimer, null, { timeout: 60000 }).catch(() => {});
    const t = await p.evaluate(async () => { for (let k = 0; k < 80 && !(window.__gpuTimer && window.__gpuTimer.stats().frames); k++) await new Promise((q) => setTimeout(q, 100)); const st = window.__gpuTimer ? window.__gpuTimer.stats() : null; return { labels: st && Object.fromEntries(Object.entries(st.labels).map(([k, v]) => [k, v.ms])), text: (document.getElementById("gpuTimes") || {}).textContent || "" }; });
    await p.close();
    ok("!! THE TIMER: the gas and the stars timed on the card, each a positive time, shown with \"on the card\", no page error", t.labels && t.labels.gas > 0 && t.labels.stars > 0 && /on the card/.test(t.text) && errors.length === 0, JSON.stringify(t.labels) + " " + errors.slice(0, 1).join(""));
});

await gl.close(); if (gpu) await gpu.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 13 mutants of the four pages, each in a hard-linked copy of the tree: ALL 13 RED. celltrack-splat (the controls never ticked, its pitch range lost --
// GREEN at first, as the default pole limit 1.5508 sat within the check's 1e-3 of the page's 1.55; held to 1e-6 now, and the lower limit by a drag up --, the cells not framed
// on load -- GREEN at first; the starting distance is checked now --, the nuclei untimed, the timer never finished); ocean-default (its drag feel, the controls never ticked,
// the water untimed, the times not published); star_gas (the gas untimed, the lines not shown); fluid-webgpu-3d, by its source here (the old drag kept beside the new, the
// controls never ticked).
