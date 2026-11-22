// WebGLEngine/tools/ship/gizmoOverlay-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gizmoOverlay-selfcheck.mjs      (under a minute: gizmo-demo.html in headless Chromium, ANGLE on SwiftShader)
//
// THE GIZMO ON A PAGE, HELD. render/gizmoOverlay.mjs over gizmo-demo.html, with real mouse events, and render/infiniteGrid.mjs's pixels:
//
//   1  PICKING         nothing picked, no gizmo; a click on a box picks it and shows its gizmo; a click on bare ground picks nothing
//   2  THE GIZMO WINS  dragging the x arrow to where x + 0.5 lands moves the box 0.5 along x AND THE CAMERA DOES NOT MOVE; dragging bare ground orbits the camera and
//                      leaves the box; key 2 and the x ring dragged from its y end to its z end turns the box 90 degrees about x; key 3 and the centre taken from
//                      20 to 50 pixels scales it 2.5 times
//   3  THE VIEW CUBE   a click on the cube turns the camera to look from the side clicked (render/gizmo.mjs poseFor of the region under the pointer)
//   4  THE GRID        on bare ground where the grid's CPU sum (gridAlphaCPU) says a line is strong, the pixel is the grid's, not the clear colour; where it says nothing,
//                      the pixel is exactly the clear colour; on a box, exactly the box -- the grid writes the plane's depth and hides behind what stands on it
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { gridAlphaCPU } from "../../render/infiniteGrid.mjs";
import { invert4 } from "../../render/gizmo.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

console.log("gizmoOverlay-selfcheck -- the gizmo, the view cube and the grid on a page\n");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
const p = await browser.newPage({ viewport: { width: 900, height: 600 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/gizmo-demo.html?ease=0&gputimer=0`);
await p.waitForFunction(() => window.__gizmoDemo && (window.__gizmoDemo.ready || window.__gizmoDemo.error), null, { timeout: 60000 });
const frame = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const S = () => p.evaluate(() => { const s = window.__gizmoDemo, c = s.controls.pose(); return { sel: s.selected, visible: s.overlay.visible, mode: s.overlay.gizmo.mode, box: JSON.parse(JSON.stringify(s.boxes.map((b) => ({ position: b.position, rotation: b.rotation, scale: b.scale })))), cam: { yaw: c.yaw, pitch: c.pitch, target: c.target, distance: c.distance } }; });
const drag = async (a, b) => { await p.mouse.move(a.x, a.y); await p.mouse.down(); for (let k = 1; k <= 6; k++) await p.mouse.move(a.x + (b.x - a.x) * k / 6, a.y + (b.y - a.y) * k / 6); await p.mouse.up(); await frame(); };
const close = (a, b, e) => a.every((v, i) => Math.abs(v - b[i]) < e);

console.log("1. PICKING");
await section(async () => {
    const s0 = await S();
    const c0 = await p.evaluate(async () => { const G = await import("/render/gizmo.mjs"), s = window.__gizmoDemo; return G.project(s.overlay.view, s.boxes[0].position); });
    await p.mouse.click(c0.x, c0.y); await frame(); const s1 = await S();
    const bare = await p.evaluate(() => { const s = window.__gizmoDemo; for (let y = 560; y > 300; y -= 10) for (let x = 880; x > 600; x -= 10) if (s.pick(x, y) < 0) return { x, y }; return null; });
    await p.mouse.click(bare.x, bare.y); await frame(); const s2 = await S();
    await p.mouse.click(c0.x, c0.y); await frame(); const s3 = await S();
    ok("!! nothing picked and no gizmo at first; a click on a box picks it and shows its gizmo; a click on bare ground picks nothing; a click on the box again picks it", s0.sel === -1 && !s0.visible && s1.sel === 0 && s1.visible && s2.sel === -1 && !s2.visible && s3.sel === 0 && errors.length === 0, JSON.stringify([s0.sel, s1.sel, s2.sel, s3.sel, errors[0] || ""]));
});

console.log("2. THE GIZMO WINS THE POINTER");
await section(async () => {
    const before = await S();
    const pts = await p.evaluate(async () => { const G = await import("/render/gizmo.mjs"), s = window.__gizmoDemo, o = s.overlay, c = o.transform.position, h = G.handlesOf(o.gizmo, o.transform, o.view).find((x) => x.id === "x"), m = { x: (h.points[0].x + h.points[1].x) / 2, y: (h.points[0].y + h.points[1].y) / 2 };
        const t0 = G.lineNearRay(c, [1, 0, 0], G.rayAt(o.view, m.x, m.y)), to = G.project(o.view, [c[0] + t0 + 0.5, c[1], c[2]]); return { m, to }; });
    await drag(pts.m, pts.to); const after = await S(), d = after.box[0].position.map((v, i) => v - before.box[0].position[i]);
    ok("!! THE x ARROW DRAGGED TO WHERE x + 0.5 LANDS MOVES THE BOX 0.5 ALONG x -- AND THE CAMERA DOES NOT MOVE (the gizmo takes the pointer before render/cameraControls.mjs)", close(d, [0.5, 0, 0], 0.02) && JSON.stringify(after.cam) === JSON.stringify(before.cam), `moved ${d.map((v) => v.toFixed(4)).join(", ")}; camera yaw ${before.cam.yaw.toFixed(4)} -> ${after.cam.yaw.toFixed(4)}`);
    const bare = await p.evaluate(() => { const s = window.__gizmoDemo; for (let y = 560; y > 300; y -= 10) for (let x = 880; x > 600; x -= 10) if (s.pick(x, y) < 0) return { x, y }; return null; });
    await drag(bare, { x: bare.x - 120, y: bare.y }); const orb = await S();
    ok("!! dragging bare ground orbits the camera and leaves the box where it was", Math.abs(orb.cam.yaw - after.cam.yaw) > 0.1 && JSON.stringify(orb.box[0]) === JSON.stringify(after.box[0]), `yaw ${after.cam.yaw.toFixed(3)} -> ${orb.cam.yaw.toFixed(3)}`);
    await p.keyboard.press("Digit2"); await frame();
    const rp = await p.evaluate(async () => { const G = await import("/render/gizmo.mjs"), o = window.__gizmoDemo.overlay, c = o.transform.position, s = G.worldPerPixel(o.view, c) * o.gizmo.size; const at = (t) => G.project(o.view, [c[0], c[1] + s * Math.cos(t), c[2] + s * Math.sin(t)]); return { mode: o.gizmo.mode, a: at(Math.PI / 6), b: at(2 * Math.PI / 3) }; });   // 30 to 120 degrees round the x ring: points no other ring passes through
    await drag(rp.a, rp.b); const ro = await S(), q = ro.box[0].rotation, yTo = [2 * (q[0] * q[1] - q[2] * q[3]), 1 - 2 * (q[0] * q[0] + q[2] * q[2]), 2 * (q[1] * q[2] + q[0] * q[3])];
    ok("!! KEY 2 AND THE x RING DRAGGED FROM ITS y END TO ITS z END TURN THE BOX 90 DEGREES ABOUT x (from 30 to 120 degrees round it: its y axis now along z)", rp.mode === "rotate" && close(yTo, [0, 0, 1], 0.03), `y goes to (${yTo.map((v) => v.toFixed(3)).join(", ")})`);
    await p.keyboard.press("Digit3"); await frame();
    const cc = await p.evaluate(async () => { const G = await import("/render/gizmo.mjs"), o = window.__gizmoDemo.overlay; return { mode: o.gizmo.mode, c: G.project(o.view, o.transform.position) }; }), s3 = (await S()).box[0].scale;
    await drag({ x: Math.round(cc.c.x) + 0.5 + 0, y: Math.round(cc.c.y) + 0.5 - 4 }, { x: Math.round(cc.c.x) + 0.5, y: Math.round(cc.c.y) + 0.5 - 10 }); const sc = (await S()).box[0].scale;
    const r = sc.map((v, i) => v / s3[i]);
    ok("!! KEY 3 AND THE CENTRE TAKEN FURTHER FROM ITSELF SCALES THE BOX EVENLY, by the ratio of the pointer's distances from the centre", cc.mode === "scale" && r.every((v) => Math.abs(v - r[0]) < 1e-9) && r[0] > 1.5, `ratio ${r.map((v) => v.toFixed(3)).join(", ")}`);
});

console.log("3. THE VIEW CUBE");
await section(async () => {
    const want = await p.evaluate(async () => { const G = await import("/render/gizmo.mjs"), C = await import("/render/cameraControls.mjs"), s = window.__gizmoDemo, w = s.overlay.view.width, b = { x: w - 96 - 10, y: 10, s: 96 }, pose = s.controls.pose();
        const R = G.viewRotationOf(C.axesOf(pose.yaw, pose.pitch, "y").back), at = { x: b.x + b.s * 0.5, y: b.y + b.s * 0.5 }, region = G.viewCubePick(R, 0, 0); return { at, region, pose: G.poseFor(region, "y") }; });
    await p.mouse.click(want.at.x, want.at.y); await frame(); await frame();
    const got = await p.evaluate(() => { const c = window.__gizmoDemo.controls.pose(); return { yaw: c.yaw, pitch: c.pitch }; });
    const pitchWant = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, want.pose.pitch));
    ok("!! A CLICK ON THE VIEW CUBE TURNS THE CAMERA TO LOOK FROM THE SIDE CLICKED (the region under the pointer, through poseFor; held off the pole as the camera holds it)", Math.abs(Math.atan2(Math.sin(got.yaw - want.pose.yaw), Math.cos(got.yaw - want.pose.yaw))) < 1e-6 && Math.abs(got.pitch - pitchWant) < 1e-6, `region ${want.region.join(",")}: yaw ${got.yaw.toFixed(4)} (want ${want.pose.yaw.toFixed(4)}), pitch ${got.pitch.toFixed(4)}`);
});

console.log("4. THE GRID");
await section(async () => {
    await p.evaluate(() => { Object.assign(window.__gizmoDemo.boxes[0], { position: [-1.6, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }); window.__gizmoDemo.select(-1);   // back on the ground: the scale above sank half of it below
    window.__gizmoDemo.controls.goal.yaw = 0.7; window.__gizmoDemo.controls.goal.pitch = 0.12; }); await frame();   // low enough that the horizon is on the screen
    const on = await p.evaluate(async () => { const s = window.__gizmoDemo; s.gridOn = true; const c = await s.capture(); return { ...c, vp: s.viewProj, eye: s.eye }; });
    const off = await p.evaluate(async () => { const s = window.__gizmoDemo; s.gridOn = false; const c = await s.capture(); s.gridOn = true; return c; });
    const picks = await p.evaluate(() => { const s = window.__gizmoDemo, out = []; for (let y = 3; y < 600; y += 7) for (let x = 3; x < 900; x += 7) { const k = s.pick(x + 0.5, y + 0.5), inner = k >= 0 && [[4, 0], [-4, 0], [0, 4], [0, -4]].every(([dx, dy]) => s.pick(x + 0.5 + dx, y + 0.5 + dy) === k); out.push(k < 0 ? -1 : inner ? k : -2); } return out; });   // -2: a box's edge (where it meets the ground the two depths are one: not judged)
    const inv = invert4(on.vp), P = { invViewProj: inv, eye: on.eye, up: "y", cell: 0.5, major: 10, fade: 25, zRange: "gl" }, at = (img, x, y) => { const o = ((on.h - 1 - y) * on.w + x) * 4; return [img[o], img[o + 1], img[o + 2]]; };
    const dbg = []; let strong = 0, strongShown = 0, empty = 0, emptyExact = true, onBox = 0, boxExact = true, k = 0, sky = 0, skyExact = true;
    for (let y = 3; y < 600; y += 7) for (let x = 3; x < 900; x += 7, k++) {
        const a = at(on.px, x, y), b = at(off.px, x, y), same = a.every((v, i) => v === b[i]);
        if (picks[k] === -2) continue;
        { const nx = ((x + 0.5) / on.w) * 2 - 1, ny = 1 - ((y + 0.5) / on.h) * 2, T = (z) => [1, 3].map((r) => inv[r] * nx + inv[4 + r] * ny + inv[8 + r] * z + inv[12 + r]), a0 = T(-1), a1 = T(1); if (a1[0] / a1[1] > a0[0] / a0[1]) { if (picks[k] < 0) { sky++; if (!same) skyExact = false; } continue; } }
        if (picks[k] >= 0) { if (!same) dbg.push([x, y, a.join(), b.join()]); onBox++; if (!same) boxExact = false; continue; }
        const al = gridAlphaCPU(P, x, y, on.w, on.h), around = [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => gridAlphaCPU(P, x + dx, y + dy, on.w, on.h) === 0);
        if (al > 0.6) { strong++; if (a.some((v, i) => Math.abs(v - b[i]) > 25)) strongShown++; }
        else if (al === 0 && around) { empty++; if (!same) emptyExact = false; }
    }
    ok("!! WHERE THE GRID'S CPU SUM SAYS A LINE IS STRONG, THE PIXEL IS THE GRID'S (more than 25 levels from the grid-less frame) -- nine in ten at least", strong >= 10 && strongShown >= 0.9 * strong, `${strongShown} of ${strong}`);
    ok("!! where it says nothing (and nothing beside it), the pixel is the grid-less frame's exactly", empty > 1000 && emptyExact, `${empty} pixels`);
    ok("!! ABOVE THE HORIZON NOTHING: the sky is the grid-less frame's exactly (the plane behind the eye is not drawn)", sky > 200 && skyExact, `${sky} pixels`);
    ok("!! ON A BOX THE PIXEL IS THE BOX'S EXACTLY (its edges, where it meets the ground, not judged): the grid writes the plane's depth and hides behind what stands on it", onBox > 100 && boxExact, `${onBox} pixels; ${JSON.stringify(dbg.slice(0, 6))}`);
});

await browser.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 5 mutants of render/gizmoOverlay.mjs: 4 RED -- listening without the capture phase (GREEN at first: the page made the overlay before binding the camera, so
// order alone let it win; gizmo-demo.html now binds the camera first, as a page adding a gizmo would), no stopImmediatePropagation on a handle, the cube click setting no goal,
// keys switching nothing. ONE STAYS GREEN: the drag reading the view it began with instead of the current one -- equivalent while the camera holds still, which the gizmo itself
// ensures during a drag; recorded, not hidden. 3 of render/infiniteGrid.mjs's GLSL: ALL RED -- no depth written, the sky not discarded (GREEN at first: the camera saw no sky;
// the grid section now looks low enough to), lines not a pixel wide.
