// WebGLEngine/tools/ship/cameraControls-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/cameraControls-selfcheck.mjs      (seconds, and half a minute for section 3's headless browser)
//
// ONE SET OF CAMERA CONTROLS, HELD. render/cameraControls.mjs is orbit, fly and focus over one eased pose, and a DOM binding; splat-gpu.html is its first user.
//
//   1  THE CAMERA      the view's axes are orthonormal and right-handed, the eye is the old splat page's formula (up "y") and render/orbitCamera.mjs's (up "z"); orbit keeps the
//                      target and the distance, look (fly) keeps the EYE, pan moves eye and target together across the view by the distance's share, move goes where the
//                      camera faces, zoom multiplies the distance within its limits, focus fits a sphere in the field of view with its margin; the pitch stops short of the
//                      poles; THE EASING is PlayCanvas's, frame-rate independent (ten steps of 10 ms land where one of 100 ms does), and settles
//   2  THE DOM         against a fake element: a left drag orbits (fly: looks), a right drag or shift-drag pans, the wheel zooms, two fingers pinch to zoom, W flies forward
//                      at the fly speed (shift faster), F focuses on what focusOn gives, a key typed in a text field moves nothing, detach() removes every listener
//   3  THE PAGE        splat-gpu.html in headless Chromium: a mouse drag turns the camera, the wheel brings it nearer, F frames the cloud, C switches to fly, with no page error
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as C from "../../render/cameraControls.mjs";
import * as OC from "../../render/orbitCamera.mjs";
import { PRESENT_ARGS, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => a.map((v, i) => v - b[i]), len = (a) => Math.hypot(...a), near = (a, b, e = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < e);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

console.log("cameraControls-selfcheck -- orbit, fly and focus over one eased pose\n");

console.log("1. THE CAMERA");
await section(() => {
    let orth = true; for (const up of ["y", "z"]) for (const [y, p] of [[0, 0], [0.7, 0.3], [-2, -1.2], [3, 1.4]]) { const a = C.axesOf(y, p, up); orth = orth && [a.back, a.right, a.up].every((v) => Math.abs(len(v) - 1) < 1e-12) && Math.abs(dot(a.back, a.right)) < 1e-12 && Math.abs(dot(a.back, a.up)) < 1e-12 && near(cross(a.right, a.up), a.back, 1e-12) && dot(a.up, up === "y" ? [0, 1, 0] : [0, 0, 1]) > 0; }
    ok("!! the view's axes are orthonormal and right-handed (right x up = back, toward the eye), their up on the world's up side, for both up axes", orth);
    const y = C.createCameraControls({ up: "y", yaw: 0.6, pitch: 0.25, distance: 3.2, target: [1, 2, 3], damping: 0 }).pose(), cp = Math.cos(0.25);
    const old = [1 + 3.2 * cp * Math.sin(0.6), 2 + 3.2 * Math.sin(0.25), 3 + 3.2 * cp * Math.cos(0.6)], z = C.createCameraControls({ up: "z", yaw: 0.6, pitch: 0.25, distance: 10, target: [1, 2, 3], damping: 0 }).pose();
    ok("!! THE EYE IS THE PAGES' OWN: up \"y\" is splat-gpu.html's old formula to the bit's neighbourhood, up \"z\" is render/orbitCamera.mjs's", near(y.eye, old, 1e-12) && near(z.eye, OC.eyeOf(OC.makeOrbitState({ yaw: 0.6, pitch: 0.25, distance: 10, target: [1, 2, 3] })), 1e-9));
    const mk = (o = {}) => C.createCameraControls({ yaw: 0.4, pitch: 0.2, distance: 5, target: [0.5, -1, 2], damping: 0, ...o });
    let c = mk(), p0 = c.pose(); c.orbit(0.5, 0.3).update(1); let p1 = c.pose();
    ok("!! ORBIT turns the eye about the target: the target and the distance kept, the eye moved", near(p1.target, p0.target) && Math.abs(len(sub(p1.eye, p1.target)) - 5) < 1e-12 && len(sub(p1.eye, p0.eye)) > 1);
    c = mk({ mode: "fly" }); p0 = c.pose(); c.look(0.5, -0.3).update(1); p1 = c.pose();
    ok("!! LOOK (fly) turns the view about the EYE: the eye kept, the target swung, the distance kept, the yaw and pitch changed", near(p1.eye, p0.eye, 1e-12) && !near(p1.target, p0.target, 1e-3) && Math.abs(p1.distance - 5) < 1e-12 && Math.abs(p1.yaw - 0.9) < 1e-12 && Math.abs(p1.pitch - (0.2 - 0.3)) < 1e-12);
    c = mk(); p0 = c.pose(); const ax = C.axesOf(0.4, 0.2); c.pan(0.1, 0).update(1); p1 = c.pose(); const d = sub(p1.eye, p0.eye);
    c.pan(0, 0.1).update(1); const d2 = sub(c.pose().eye, p1.eye);
    ok("!! PAN moves eye and target together ACROSS the view, by the distance's share: a drag right slides the camera left (the scene goes with the pointer), a drag down slides it up", near(d, sub(p1.target, p0.target)) && Math.abs(dot(d, ax.back)) < 1e-12 && Math.abs(dot(d, ax.right) + 0.5) < 1e-12 && Math.abs(dot(d2, ax.up) - 0.5) < 1e-12);
    c = mk({ mode: "fly" }); p0 = c.pose(); c.move(0, 0, 1).update(1); p1 = c.pose();
    ok("!! MOVE (fly) goes where the camera faces: forward 1 takes the eye 1 nearer the old target, eye and target together", Math.abs(len(sub(p1.eye, p0.eye)) - 1) < 1e-12 && Math.abs(len(sub(p0.target, p1.eye)) - 4) < 1e-12 && near(sub(p1.eye, p0.eye), sub(p1.target, p0.target)));
    c = mk({ minDistance: 1, maxDistance: 10 }); c.zoom(0.5).update(1); const z1 = c.pose().distance; c.zoom(0.01).update(1); const z2 = c.pose().distance; c.zoom(1e6).update(1); const z3 = c.pose().distance; c.zoom(-1).zoom(NaN).update(1);
    ok("!! ZOOM multiplies the distance and stays within [min, max]; a factor that is not a positive number is ignored", z1 === 2.5 && z2 === 1 && z3 === 10 && c.pose().distance === 10);
    c = mk({ fovY: 0.9, margin: 1.1 }); c.focus([3, 4, 5], 2).update(1); p1 = c.pose();
    ok("!! FOCUS fits the sphere: the target its centre, the view's direction kept, and the sphere's angular radius is asin(margin^-1 sin(fov/2)) -- a tenth inside the half field", near(p1.target, [3, 4, 5]) && Math.abs(p1.yaw - 0.4) < 1e-12 && Math.abs(Math.asin(2 / p1.distance) - Math.asin(Math.sin(0.45) / 1.1)) < 1e-12);
    c = mk(); c.orbit(0, 10).update(1); const top = c.pose().pitch; c.orbit(0, -20).update(1);
    ok("!! the pitch stops short of the poles by POLE_MARGIN either way, so the view's basis never collapses", Math.abs(top - (Math.PI / 2 - C.POLE_MARGIN)) < 1e-12 && Math.abs(c.pose().pitch + (Math.PI / 2 - C.POLE_MARGIN)) < 1e-12);
    const e1 = mk({ damping: 0.98 }), e2 = mk({ damping: 0.98 }); for (const e of [e1, e2]) e.orbit(1, 0.5).pan(0.2, 0.1).zoom(3);
    for (let k = 0; k < 10; k++) e1.update(0.01); e2.update(0.1); const a1 = e1.pose(), a2 = e2.pose(), share = (e1.now.yaw - 0.4) / 1;
    ok("!! THE EASING is PlayCanvas's, frame-rate independent: ten steps of 10 ms land where one of 100 ms does (yaw, pitch, target, distance), the share gone is 1 - 0.98^100", near([a1.yaw, a1.pitch, a1.distance, ...a1.target], [a2.yaw, a2.pitch, a2.distance, ...a2.target], 1e-9) && Math.abs(share - (1 - Math.pow(0.98, 100))) < 1e-9 && C.damp(0.98, 0.1) === 1 - Math.pow(0.98, 100));
    for (let k = 0; k < 200 && !e2.settled(); k++) e2.update(0.05);
    ok("!! ...it settles, exactly where the input put it, and with damping 0 it is there at once", e2.settled() && Math.abs(e2.pose().distance - 15) < 1e-3 && (() => { const z0 = mk(); z0.orbit(1, 0); z0.update(0.001); return z0.settled(); })());
    let bad = 0; for (const f of [() => C.createCameraControls({ up: "x" }), () => { mk().mode = "walk"; }]) try { f(); } catch { bad++; }
    ok("!! an up axis other than y or z, and a mode other than orbit or fly, are refused", bad === 2);
});

console.log("2. THE DOM (a fake element)");
await section(() => {
    const target = () => { const L = new Map(); return { L, addEventListener: (ev, fn) => { if (!L.has(ev)) L.set(ev, new Set()); L.get(ev).add(fn); }, removeEventListener: (ev, fn) => L.get(ev) && L.get(ev).delete(fn), fire: (ev, e) => { for (const fn of L.get(ev) || []) fn({ preventDefault() {}, ...e }); }, count: () => [...L.values()].reduce((t, s) => t + s.size, 0) }; };
    const el = target(), win = target(), c = C.createCameraControls({ yaw: 0, pitch: 0, distance: 4, damping: 0 }), b = C.bindCameraControls(el, c, { keyTarget: win, focusOn: () => ({ center: [9, 9, 9], radius: 1 }) });
    const drag = (id, x0, y0, x1, y1, extra = {}) => { el.fire("pointerdown", { pointerId: id, clientX: x0, clientY: y0, button: 0, ...extra }); el.fire("pointermove", { pointerId: id, clientX: x1, clientY: y1 }); el.fire("pointerup", { pointerId: id }); };
    drag(1, 100, 100, 150, 75); b.tick(0);
    ok("!! a left drag ORBITS: 50 px right and 25 up turn the yaw by -0.4 and the pitch by -0.2 (0.008 rad a pixel), the target kept", Math.abs(c.goal.yaw + 0.4) < 1e-12 && Math.abs(c.goal.pitch + 0.2) < 1e-12 && near(c.goal.target, [0, 0, 0]));
    const t0 = [...c.goal.target]; drag(2, 0, 0, 100, 0, { shiftKey: true }); const t1 = [...c.goal.target]; drag(3, 0, 0, 0, 100, { button: 2 });
    ok("!! a SHIFT-drag and a RIGHT drag PAN (the target moves, the yaw does not)", !near(t1, t0) && !near(c.goal.target, t1) && Math.abs(c.goal.yaw + 0.4) < 1e-12);
    el.fire("wheel", { deltaY: 100 }); const dw = c.goal.distance;
    ok("!! the WHEEL zooms: 100 units out multiply the distance by e^0.1", Math.abs(dw - 4 * Math.exp(0.1)) < 1e-12);
    el.fire("pointerdown", { pointerId: 7, clientX: 0, clientY: 0, button: 0 }); el.fire("pointerdown", { pointerId: 8, clientX: 100, clientY: 0, button: 0 }); el.fire("pointermove", { pointerId: 8, clientX: 200, clientY: 0 }); el.fire("pointerup", { pointerId: 7 }); el.fire("pointerup", { pointerId: 8 });
    ok("!! TWO FINGERS PINCH: spreading them from 100 to 200 px halves the distance (and orbits nothing)", Math.abs(c.goal.distance - dw / 2) < 1e-12 && Math.abs(c.goal.yaw + 0.4) < 1e-12 && b.state.dragging === 0);
    b.tick(0); const e0 = c.pose().eye; win.fire("keydown", { code: "KeyW" }); b.tick(0.5); const e1 = c.pose().eye; win.fire("keyup", { code: "KeyW" }); b.tick(0.5); const e2 = c.pose().eye;
    win.fire("keydown", { code: "KeyW", shiftKey: true }); b.tick(0.5); const e3 = c.pose().eye; win.fire("keyup", { code: "KeyW", shiftKey: false });
    ok("!! W FLIES forward at the fly speed x the distance per second while held, and stops when released; shift four times faster", Math.abs(len(sub(e1, e0)) - 0.5 * c.goal.distance) < 1e-9 && near(e2, e1) && Math.abs(len(sub(e3, e2)) - 4 * 0.5 * c.goal.distance) < 1e-9, `${len(sub(e1, e0))} ${len(sub(e2, e1))} ${len(sub(e3, e2))} at distance ${c.goal.distance}`);
    win.fire("keydown", { code: "KeyW", target: { tagName: "INPUT" } }); b.tick(1); const e4 = c.pose().eye; win.fire("keydown", { code: "KeyF" }); b.tick(0);
    ok("!! a key typed in a text field moves nothing; F FOCUSES on what focusOn gives", near(e4, e3) && near(c.goal.target, [9, 9, 9]) && Math.abs(c.goal.distance - 1.1 / Math.sin(0.45)) < 1e-9);
    c.mode = "fly"; const eye = c.pose().eye; drag(9, 0, 0, 40, 0); b.tick(0);
    ok("!! IN FLY MODE a drag LOOKS: the eye stays, the target swings", near(c.pose().eye, eye, 1e-9) && Math.abs(c.goal.yaw - (-0.4 - 0.32)) < 1e-12);
    const before = el.count() + win.count(); b.detach();
    ok("!! detach() removes every listener it added (element and window)", before >= 9 && el.count() === 0 && win.count() === 0, `${before} listeners before`);
});

console.log("3. THE PAGE (splat-gpu.html, headless)");
const skip = webgpuSkipReason(require);
if (skip) console.log(`  ----  skipped: ${skip}`);
else await section(async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), p = await browser.newPage({ viewport: { width: 900, height: 600 } }), errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/splat-gpu.html?n=3000&ease=0`);
    await p.waitForFunction(() => window.__splatGpu && window.__splatGpu.ready && window.__splatGpu.camera, null, { timeout: 90000 });
    const get = () => p.evaluate(() => { const c = window.__splatGpu.camera.controls, q = c.pose(); return { yaw: q.yaw, pitch: q.pitch, distance: q.distance, target: q.target, mode: c.mode,   // the DRAWN pose: the page must tick the controls
            hud: document.getElementById("hud").textContent }; });
    const a = await get(); await p.mouse.move(450, 400); await p.mouse.down(); await p.mouse.move(500, 400, { steps: 5 }); await p.mouse.up(); await new Promise((r) => setTimeout(r, 300)); const b = await get();
    await p.mouse.wheel(0, -200); await new Promise((r) => setTimeout(r, 200)); const c = await get();
    await p.evaluate(() => window.__splatGpu.camera.controls.zoom(5)); await new Promise((r) => setTimeout(r, 300)); await p.keyboard.press("KeyF"); await new Promise((r) => setTimeout(r, 200)); const d = await get();
    await p.keyboard.press("KeyC"); await new Promise((r) => setTimeout(r, 300)); const e = await get();
    await browser.close(); srv.close();
    ok("!! a mouse drag turns the camera (50 px right: the yaw down by 0.4), the wheel brings it nearer, F frames the cloud again, C switches to fly and the status line says so, with no page error", Math.abs(b.yaw - (a.yaw - 0.4)) < 1e-6 && c.distance < b.distance && Math.abs(d.distance - c.distance * 5) > 1e-3 && d.distance < c.distance * 5 && e.mode === "fly" && /FLY: drag to look/.test(e.hud) && /F to frame/.test(a.hud) && errors.length === 0, JSON.stringify({ a: a.yaw, b: b.yaw, c: c.distance, d: d.distance, mode: e.mode, errors: errors.slice(0, 2) }));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 17 mutants, each in a hard-linked copy of the tree: ALL 17 RED. 14 of render/cameraControls.mjs (the z-up eye's sign, look moving the eye, pan not
// scaled by the distance, fly moving backwards, focus by the tangent, no pole margin, a per-frame easing in place of PlayCanvas's per-millisecond one, zoom unclamped,
// the pinch inverted, shift no faster, typing in a field flying, detach() leaving listeners, a fly-mode drag orbiting, a right drag not panning); 3 of splat-gpu.html (the
// controls never ticked -- GREEN at first, as section 3 read where the camera was going, not where it is drawn; it reads the drawn pose now --, F not wired, C not wired).
