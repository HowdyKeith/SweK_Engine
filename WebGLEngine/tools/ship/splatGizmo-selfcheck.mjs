// WebGLEngine/tools/ship/splatGizmo-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/splatGizmo-selfcheck.mjs      (about a minute: splat-gpu.html on WebGPU in headless Chromium)
//
// THE GIZMO ON THE SPLAT PAGE, HELD. splat-gpu.html ?gizmo=1 moves, turns and scales the cloud about its centre (render/gizmo.mjs, render/gizmoOverlay.mjs): the renderer draws
// with view x M and the eye in the cloud's own frame. Moving the world one way is moving the camera the other, so each is held to the picture the camera gives:
//
//   1  THE TRANSFORM IS EXACT   the cloud moved 0.4 along x is the picture of the camera moved 0.4 the other way; turned 0.6 rad about y (about its centre), the camera orbited
//                               -0.6; scaled 1.5 times, the camera 1.5 times nearer -- each within 2 levels a sample on average; and the transform at rest is the plain picture
//   2  THE GIZMO MOVES IT       a real drag of the x arrow moves the cloud along x (and the camera does not move); without ?gizmo the page has no gizmo and no transform
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PRESENT_ARGS } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

console.log("splatGizmo-selfcheck -- the gizmo on the splat page\n");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
const open = async (q) => { const p = await browser.newPage({ viewport: { width: 640, height: 400 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message)); await p.goto(`http://127.0.0.1:${srv.address().port}/splat-gpu.html?n=20000&ease=0&still=3${q}`); await p.waitForFunction(() => window.__splatGpu && (window.__splatGpu.stopped || window.__splatGpu.error), null, { timeout: 120000 }); return { p, errors }; };
const diff = (a, b) => { let d = 0; for (let k = 0; k < a.grid.length; k++) d += Math.abs(a.grid[k] - b.grid[k]); return d / a.grid.length; };

console.log("1. THE TRANSFORM IS EXACT");
await section(async () => {
    const { p, errors } = await open("&gizmo=1");
    const R = await p.evaluate(async () => {
        const s = window.__splatGpu, X = s.cloudXf, C = s.camera.controls, home = { ...X, position: X.position.slice(), rotation: X.rotation.slice(), scale: X.scale.slice() }, g0 = { target: C.goal.target.slice(), yaw: C.goal.yaw, distance: C.goal.distance };
        const reset = () => { Object.assign(X, { position: home.position.slice(), rotation: home.rotation.slice(), scale: home.scale.slice() }); Object.assign(C.goal, { target: g0.target.slice(), yaw: g0.yaw, distance: g0.distance }); C.snap(); };
        const plain = await s.capture(), out = { plain };
        X.position[0] += 0.4; out.moved = await s.capture(); out.eyeMoved = s.drawEye.slice(); out.eyeWorld = C.pose().eye.slice(); reset();
        C.goal.target = [g0.target[0] - 0.4, g0.target[1], g0.target[2]]; C.snap(); out.camMoved = await s.capture(); reset();
        X.rotation = [0, Math.sin(0.3), 0, Math.cos(0.3)]; out.turned = await s.capture(); reset();
        C.orbit(-0.6, 0); C.snap(); out.camTurned = await s.capture(); reset();
        X.scale = [1.5, 1.5, 1.5]; out.scaled = await s.capture(); reset();
        C.goal.distance = g0.distance / 1.5; C.snap(); out.camNear = await s.capture(); reset();
        out.rest = await s.capture();
        return out;
    });
    await p.close();
    const dm = diff(R.moved, R.camMoved), dt = diff(R.turned, R.camTurned), ds = diff(R.scaled, R.camNear), changed = [diff(R.moved, R.plain), diff(R.turned, R.plain), diff(R.scaled, R.plain)];
    ok("!! MOVED, TURNED AND SCALED, THE CLOUD IS THE CAMERA MOVED THE OTHER WAY: 0.4 along x against the camera 0.4 back, 0.6 rad about y against an orbit of -0.6, 1.5 times against 1.5 times nearer -- within 2 levels a sample, while each differs from the plain picture by far more", dm < 2 && dt < 2 && ds < 2 && changed.every((c) => c > 8) && errors.length === 0, `${dm.toFixed(2)}, ${dt.toFixed(2)}, ${ds.toFixed(2)} levels; against the plain ${changed.map((c) => c.toFixed(1)).join(", ")}`);
    const de = R.eyeMoved.map((v, i) => v - R.eyeWorld[i]);
    ok("!! THE RENDERER IS HANDED THE EYE IN THE CLOUD'S OWN FRAME (its depth sort and its view-dependent colour): with the cloud moved 0.4 along x, the eye it gets is the camera's less 0.4 along x", Math.abs(de[0] + 0.4) < 1e-5 && Math.abs(de[1]) < 1e-5 && Math.abs(de[2]) < 1e-5, de.map((v) => v.toFixed(5)).join(", "));
    ok("!! the transform at rest is the plain picture", diff(R.rest, R.plain) < 0.5, `${diff(R.rest, R.plain).toFixed(2)}`);
});

console.log("2. THE GIZMO MOVES IT");
await section(async () => {
    const { p, errors } = await open("&gizmo=1");
    const pts = await p.evaluate(async () => { const G = await import("/render/gizmo.mjs"), o = window.__splatGpu.gizmo, h = G.handlesOf(o.gizmo, o.transform, o.view).find((x) => x.id === "x"), m = { x: (h.points[0].x + h.points[1].x) / 2, y: (h.points[0].y + h.points[1].y) / 2 }, c = o.transform.position;
        const t0 = G.lineNearRay(c, [1, 0, 0], G.rayAt(o.view, m.x, m.y)), to = G.project(o.view, [c[0] + t0 + 0.3, c[1], c[2]]); return { m, to, before: c.slice(), cam: window.__splatGpu.camera.controls.pose().yaw }; });
    await p.mouse.move(pts.m.x, pts.m.y); await p.mouse.down(); for (let k = 1; k <= 6; k++) await p.mouse.move(pts.m.x + (pts.to.x - pts.m.x) * k / 6, pts.m.y + (pts.to.y - pts.m.y) * k / 6); await p.mouse.up();
    const after = await p.evaluate(() => ({ pos: window.__splatGpu.cloudXf.position.slice(), cam: window.__splatGpu.camera.controls.pose().yaw }));
    await p.close();
    const d = after.pos.map((v, i) => v - pts.before[i]);
    ok("!! A REAL DRAG OF THE x ARROW MOVES THE CLOUD 0.3 ALONG x, and the camera does not move", Math.abs(d[0] - 0.3) < 0.02 && Math.abs(d[1]) < 1e-6 && Math.abs(d[2]) < 1e-6 && after.cam === pts.cam && errors.length === 0, `moved ${d.map((v) => v.toFixed(4)).join(", ")}`);
    const q = await open(""), none = await q.p.evaluate(() => ({ gizmo: window.__splatGpu.gizmo, overlay: !!document.querySelector(".gizmo-overlay") })); await q.p.close();
    ok("!! without ?gizmo the page has no gizmo and no overlay", none.gizmo === null && !none.overlay && q.errors.length === 0);
});

await browser.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 6 mutants of splat-gpu.html, each in a hard-linked copy of the tree: ALL 6 RED -- the pivot not subtracted (turns about the origin), the eye left in the world's
// frame (GREEN at first: this cloud has no harmonics and its soft splats barely reorder; the eye the renderer is handed is now pinned), the model on the wrong side of the view,
// the rotation transposed, the scale ignored, the gizmo not handed the cloud.
