// WebGLEngine/tools/ship/gizmo-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gizmo-selfcheck.mjs      (a second)
//
// THE GIZMO MATHS, HELD. render/gizmo.mjs, against a real perspective camera (render/gpuDriven.mjs perspective and lookAt; WebGPU's 0..1 depth too):
//
//   1  THE CAMERA      a point projected and its pixel's ray pass within 1e-6 of each other, in both depth ranges; the gizmo is `size` pixels on the screen near or far
//   2  HITTING         the pointer on each handle's drawn geometry finds that handle (axes, planes, centre; rings; scale boxes and centre); off the gizmo, nothing
//   3  DRAGGING        the pointer taken from a handle to where a known world point lands moves the transform there: half a unit along x, a step in the xz plane,
//                      90 degrees about x (the y end of the ring to the z end), x scaled by 2 (and 3 in local space after a rotation); a snap rounds; a ray parallel
//                      to its plane holds the drag where it was
//   4  THE VIEW CUBE   the 26 regions of the cube's surface; a cube seen square-on picks the face, its corner the corner; poseFor puts render/cameraControls.mjs's
//                      eye on that side (its back vector is the region's direction), for "y" and "z" up
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import * as G from "../../render/gizmo.mjs";
import { perspective, lookAt } from "../../render/gpuDriven.mjs";
import { axesOf as camAxes } from "../../render/cameraControls.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const mul4 = (a, b) => { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const ZO = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1];
const W = 800, H = 500, FOV = 0.9;
const camera = (eye, target = [0, 0, 0], zRange = "gl") => { let vp = mul4(perspective(FOV, W / H, 0.1, 100), lookAt(eye, target)); if (zRange === "zo") vp = mul4(ZO, vp); return G.viewOf({ viewProj: vp, eye, fovY: FOV, width: W, height: H, zRange }); };
const close = (a, b, e = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < e);
const T0 = () => ({ position: [0, 0, 0], rotation: G.quat.identity(), scale: [1, 1, 1] });

console.log("gizmo-selfcheck -- translate, rotate and scale gizmos and a view cube\n");

console.log("1. THE CAMERA");
section(() => {
    let worst = 0;
    for (const z of ["gl", "zo"]) { const v = camera([3, 2.5, 4], [0.2, 0, 0], z); for (const p of [[0, 0, 0], [1, 0.5, -0.3], [-1.2, 0.8, 0.9]]) { const s = G.project(v, p), r = G.rayAt(v, s.x, s.y), t = G.vec.dot(G.vec.sub(p, r.origin), r.dir), q = G.vec.add(r.origin, G.vec.mul(r.dir, t)); worst = Math.max(worst, G.vec.len(G.vec.sub(q, p))); } }
    ok("!! a point projected, and the ray through its pixel, pass within 1e-6 of each other -- in WebGL2's -1..1 depth and WebGPU's 0..1", worst < 1e-6, `worst ${worst.toExponential(2)}`);
    const g = G.createGizmo({ size: 100 }), len = (v) => { const h = G.handlesOf(g, T0(), v).find((x) => x.id === "x"); return Math.hypot(h.points[1].x - h.points[0].x, h.points[1].y - h.points[0].y); };
    const near = camera([0, 0, 3]), far = camera([0, 0, 30]);
    ok("!! THE GIZMO IS THE SAME SIZE ON THE SCREEN NEAR AND FAR: its x axis, seen square-on, is `size` pixels long at 3 units and at 30", Math.abs(len(near) - 100) < 0.5 && Math.abs(len(far) - 100) < 0.5, `${len(near).toFixed(2)} and ${len(far).toFixed(2)} pixels`);
});

console.log("2. HITTING");
section(() => {
    const v = camera([3, 2.5, 4]), T = T0(), at = (g, id, f = 0.7) => { const h = G.handlesOf(g, T, v).find((x) => x.id === id), a = h.points[0], b = h.points[1] || a; return h.kind === "plane" ? { x: h.points.reduce((s, p) => s + p.x, 0) / 4, y: h.points.reduce((s, p) => s + p.y, 0) / 4 } : h.kind === "ring" ? h.points[11] : { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }; };
    const tr = G.createGizmo({ mode: "translate" }), ro = G.createGizmo({ mode: "rotate" }), sc = G.createGizmo({ mode: "scale" });
    const got = (g, ids) => ids.map((id) => { const p = at(g, id); return G.hit(g, T, v, p.x, p.y); });
    ok("!! TRANSLATE: the pointer on each axis, in each plane square and on the centre finds that handle", got(tr, ["x", "y", "z", "xy", "yz", "zx", "view"]).join() === "x,y,z,xy,yz,zx,view", got(tr, ["x", "y", "z", "xy", "yz", "zx", "view"]).join());
    ok("!! ROTATE: the pointer on each ring finds that ring, and on the outer one the view ring", got(ro, ["x", "y", "z", "view"]).join() === "x,y,z,view", got(ro, ["x", "y", "z", "view"]).join());
    const box = G.handlesOf(sc, T, v).find((h) => h.id === "y").box;
    ok("!! SCALE: each axis, its end box and the uniform centre", got(sc, ["x", "y", "z", "uniform"]).join() === "x,y,z,uniform" && G.hit(sc, T, v, box.x + 4, box.y - 4) === "y");
    const o = G.project(v, [0, 0, 0]);
    ok("!! off the gizmo, nothing: well clear of every handle, and just past the tolerance off an axis", G.hit(tr, T, v, o.x + 300, o.y + 200) === null && G.hit(tr, T, v, 5, 5) === null);
});

console.log("3. DRAGGING");
section(() => {
    const v = camera([3, 2.5, 4]), T = T0(), px = (p) => G.project(v, p), start = (g, id) => { const h = G.handlesOf(g, T, v).find((x) => x.id === id); return h.kind === "plane" ? { x: h.points.reduce((s, p) => s + p.x, 0) / 4, y: h.points.reduce((s, p) => s + p.y, 0) / 4 } : h.points[1] ? { x: (h.points[0].x + h.points[1].x) / 2, y: (h.points[0].y + h.points[1].y) / 2 } : h.points[0]; };
    const tr = G.createGizmo({ mode: "translate" }), s0 = start(tr, "x"), wp = G.rayAt(v, s0.x, s0.y), t0 = G.lineNearRay([0, 0, 0], [1, 0, 0], wp), to = px([t0 + 0.5, 0, 0]);
    const d1 = G.begin(tr, T, v, "x", s0.x, s0.y), r1 = d1.update(to.x, to.y);
    ok("!! ALONG AN AXIS: the pointer taken from the x axis to where x + 0.5 lands moves the transform 0.5 along x and nowhere else", close(r1.position, [0.5, 0, 0], 1e-6), JSON.stringify(r1.position));
    const sp = start(tr, "zx"), h0 = G.rayPlane(G.rayAt(v, sp.x, sp.y), [0, 0, 0], [0, 1, 0]), to2 = px(G.vec.add(h0, [0.3, 0, -0.2])), r2 = G.begin(tr, T, v, "zx", sp.x, sp.y).update(to2.x, to2.y);
    ok("!! IN A PLANE: the zx square dragged to where its grab point + (0.3, 0, -0.2) lands moves the transform by exactly that, y untouched", close(r2.position, [0.3, 0, -0.2], 1e-6), JSON.stringify(r2.position));
    const g2 = G.createGizmo({ mode: "translate", snap: { translate: 0.25 } }), r3 = G.begin(g2, T, v, "x", s0.x, s0.y).update(px([t0 + 0.6, 0, 0]).x, px([t0 + 0.6, 0, 0]).y);
    ok("!! A SNAP ROUNDS: 0.6 along x with a step of 0.25 is 0.5", close(r3.position, [0.5, 0, 0], 1e-9));
    const ro = G.createGizmo({ mode: "rotate" }), s = G.worldPerPixel(v, [0, 0, 0]) * ro.size, a = px([0, s, 0]), b = px([0, 0, s]), d4 = G.begin(ro, T, v, "x", a.x, a.y), r4 = d4.update(b.x, b.y);
    const yTo = G.quat.rotate(r4.rotation, [0, 1, 0]);
    ok("!! ROTATE: the x ring taken from its y end to its z end turns the transform 90 degrees about x (y goes to z)", Math.abs(d4.delta - Math.PI / 2) < 1e-6 && close(yTo, [0, 0, 1], 1e-6), `${(d4.delta * 180 / Math.PI).toFixed(4)} degrees`);
    const g5 = G.createGizmo({ mode: "rotate", snap: { rotate: Math.PI / 12 } }), c5 = px([0, s * Math.cos(1.3), s * Math.sin(1.3)]), d5 = G.begin(g5, T, v, "x", a.x, a.y); d5.update(c5.x, c5.y);
    ok("!! ...and a snap of 15 degrees rounds 74.5 degrees to 75", Math.abs(d5.delta - 5 * Math.PI / 12) < 1e-9, `${(d5.delta * 180 / Math.PI).toFixed(2)}`);
    const scg = G.createGizmo({ mode: "scale" }), m = start(scg, "x"), wr = G.rayAt(v, m.x, m.y), ta = G.lineNearRay([0, 0, 0], [1, 0, 0], wr), e6 = px([2 * ta, 0, 0]), r6 = G.begin(scg, T, v, "x", m.x, m.y).update(e6.x, e6.y);
    ok("!! SCALE ALONG AN AXIS: the pointer taken to twice the grab point's distance along x doubles x's scale and nothing else", close(r6.scale, [2, 1, 1], 1e-6), JSON.stringify(r6.scale));
    const Tr = { ...T0(), rotation: G.quat.axisAngle([0, 1, 0], Math.PI / 2), scale: [1, 1, 1] }, xl = G.quat.rotate(Tr.rotation, [1, 0, 0]), hl = G.handlesOf(scg, Tr, v).find((h) => h.id === "x"), ml = { x: (hl.points[0].x + hl.points[1].x) / 2, y: (hl.points[0].y + hl.points[1].y) / 2 };
    const tl = G.lineNearRay([0, 0, 0], xl, G.rayAt(v, ml.x, ml.y)), el = px(G.vec.mul(xl, 3 * tl)), r7 = G.begin(scg, Tr, v, "x", ml.x, ml.y).update(el.x, el.y);
    ok("!! SCALE IS ALONG THE OBJECT'S OWN AXES: turned a quarter about y, its x axis is world -z; dragged to three times, its x scale is 3", close(r7.scale, [3, 1, 1], 1e-6) && Math.abs(hl.axis[2] + 1) < 1e-9, JSON.stringify(r7.scale));
    const o = px([0, 0, 0]), u0 = { x: o.x + 20, y: o.y }, r8 = G.begin(scg, T, v, "uniform", u0.x, u0.y).update(o.x + 50, o.y);
    ok("!! UNIFORM SCALE: the pointer 20 then 50 pixels from the centre scales by 2.5 on every axis", close(r8.scale, [2.5, 2.5, 2.5], 1e-9));
    const side = camera([5, 0.0, 0.0]), sv = G.project(side, [0, 0, 0]), d9 = G.begin(tr, T, side, "zx", sv.x, sv.y + 1);
    const r9 = d9.update(sv.x + 40, sv.y + 10);
    ok("!! A RAY PARALLEL TO ITS PLANE HOLDS THE DRAG (seen edge-on the zx plane gives no move, not a jump to infinity)", r9.position.every(Number.isFinite) && close(r9.position, [0, 0, 0]), JSON.stringify(r9.position));
});

console.log("4. THE VIEW CUBE");
section(() => {
    const regions = new Set(); for (let a = 0; a < 3; a++) for (const s of [-1, 1]) for (let u = -1; u <= 1; u += 0.1) for (let w = -1; w <= 1; w += 0.1) { const p = [0, 0, 0]; p[a] = s; p[(a + 1) % 3] = u; p[(a + 2) % 3] = w; regions.add(G.viewCubeRegion(p).join()); }
    ok("!! THE CUBE'S SURFACE HAS 26 REGIONS: 6 faces, 12 edges, 8 corners", regions.size === 26 && !regions.has("0,0,0") && [...regions].filter((r) => r.split(",").filter((v) => v !== "0").length === 1).length === 6 && [...regions].filter((r) => r.split(",").filter((v) => v !== "0").length === 3).length === 8);
    const front = G.viewRotationOf([0, 0, 1]), iso = G.viewRotationOf([1, 1, 1]);
    ok("!! seen square-on from +z, the middle of the drawing is the +z face, its upper right the (+x, +y, +z) corner, its right edge the (+x, +z) edge, and past the cube nothing", G.viewCubePick(front, 0, 0).join() === "0,0,1" && G.viewCubePick(front, 0.55, 0.55).join() === "1,1,1" && G.viewCubePick(front, 0.55, 0).join() === "1,0,1" && G.viewCubePick(front, 0.99, 0.99) === null);
    ok("!! seen from the (1, 1, 1) corner, the middle of the drawing is that corner", G.viewCubePick(iso, 0, 0).join() === "1,1,1");
    let worst = 0;
    for (const up of ["y", "z"]) for (const r of [[1, 0, 0], [0, 0, -1], [1, 1, 0], [-1, 1, 1], [0, -1, 1], [1, -1, -1]]) { const p = G.poseFor(r, up), b = camAxes(p.yaw, p.pitch, up).back, n = G.vec.norm(r); worst = Math.max(worst, G.vec.len(G.vec.sub(b, n))); }
    ok("!! poseFor PUTS render/cameraControls.mjs's EYE ON THAT SIDE: its back vector (target to eye) is the region's direction, for y up and z up", worst < 1e-9, `worst ${worst.toExponential(2)}`);
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: (filled in below)
