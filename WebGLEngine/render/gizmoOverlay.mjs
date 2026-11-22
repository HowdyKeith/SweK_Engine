// WebGLEngine/render/gizmoOverlay.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GIZMO AND THE VIEW CUBE ON A PAGE. render/gizmo.mjs is the maths; this draws it on a 2D canvas laid over the page's own canvas (so it works over WebGL2 and WebGPU
// alike) and takes the pointer FIRST: a pointer-down on a handle or on the view cube is the gizmo's (render/cameraControls.mjs never sees it), anything else goes through to
// the camera as before.
//
//   const ov = createGizmoOverlay(canvas, { controls, up: "y", mode: "translate", space: "world", snap, onChange(transform), viewCube: true })
//   ov.transform = { position, rotation, scale }    what the gizmo moves (onChange is called with the new one on every move of a drag, and once more on release with `done`)
//   ov.draw(view)                                   each frame, with gizmo.viewOf({ viewProj, eye, fovY, width, height, zRange }) for the canvas's CSS size
//   ov.setMode("translate" | "rotate" | "scale"), ov.setSpace("world" | "local"), ov.visible = false, ov.detach()
//   keys (when the page has focus and no field does): 1 translate, 2 rotate, 3 scale, X world or local -- not W/E/R, which the camera's fly keys own
//   THE VIEW CUBE, top right: a click on a face, an edge or a corner turns the camera's goal (controls.goal.yaw, .pitch) to look from that side; the camera eases there as it
//   eases anywhere. The face under the pointer is lit.
//   ov.state: { hover, dragging, cubeHover } for a page or a gate.
// Held by tools/ship/gizmoOverlay-selfcheck.mjs (the page gizmo-demo.html in headless Chromium).
"use strict";
import * as G from "./gizmo.mjs";
import { axesOf as camAxes } from "./cameraControls.mjs";

const COLORS = { x: "#ef5b5b", y: "#6fd36f", z: "#5b8cff", view: "#d7dbe6", uniform: "#d7dbe6", xy: "#5b8cff", yz: "#ef5b5b", zx: "#6fd36f", hover: "#ffd84a" };
const FACES = [{ n: [1, 0, 0], label: "X" }, { n: [-1, 0, 0], label: "-X" }, { n: [0, 1, 0], label: "Y" }, { n: [0, -1, 0], label: "-Y" }, { n: [0, 0, 1], label: "Z" }, { n: [0, 0, -1], label: "-Z" }];

export function createGizmoOverlay(target, { controls = null, up = "y", mode = "translate", space = "world", snap = null, size = 96, onChange = null, viewCube = true, cubeSize = 96 } = {}) {
    const doc = target.ownerDocument, cv = doc.createElement("canvas"), ctx = cv.getContext("2d");
    cv.className = "gizmo-overlay"; cv.style.cssText = "position:absolute;pointer-events:none;z-index:4";
    target.parentNode.insertBefore(cv, target.nextSibling);
    const self = { gizmo: G.createGizmo({ mode, space, size, snap }), transform: { position: [0, 0, 0], rotation: G.quat.identity(), scale: [1, 1, 1] }, visible: true, state: { hover: null, dragging: null, cubeHover: null }, view: null };
    let drag = null;
    const place = () => { const r = target.getBoundingClientRect(), pr = target.offsetParent ? target.offsetParent.getBoundingClientRect() : { left: 0, top: 0 }, d = Math.min(2, doc.defaultView.devicePixelRatio || 1);
        cv.style.left = `${target.offsetLeft}px`; cv.style.top = `${target.offsetTop}px`; cv.style.width = `${r.width}px`; cv.style.height = `${r.height}px`;
        if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
        return { w: r.width, h: r.height, d, ox: r.left, oy: r.top, pr }; };
    const cubeBox = (w) => ({ x: w - cubeSize - 10, y: 10, s: cubeSize });
    const cubeRot = () => { if (!controls) return null; const p = controls.pose ? controls.pose() : controls.now; return G.viewRotationOf(camAxes(p.yaw, p.pitch, up).back, up === "z" ? [0, 0, 1] : [0, 1, 0]); };
    const cubeAt = (x, y, w) => { if (!viewCube || !controls) return null; const b = cubeBox(w); if (x < b.x || x > b.x + b.s || y < b.y || y > b.y + b.s) return null; const u = ((x - b.x) / b.s) * 2 - 1, v = 1 - ((y - b.y) / b.s) * 2; return G.viewCubePick(cubeRot(), u, v); };
    const local = (e) => { const r = target.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }; };
    const on = [], listen = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); on.push([t, ev, fn, opt]); };
    // CAPTURE on the page's own canvas: these run before render/cameraControls.mjs's listeners there, and stop them when the pointer is the gizmo's
    listen(target, "pointerdown", (e) => {
        if (!self.visible || !self.view) return;
        const p = local(e), region = cubeAt(p.x, p.y, p.w);
        if (region) { const pose = G.poseFor(region, up); controls.goal.yaw = pose.yaw; controls.goal.pitch = pose.pitch; e.stopImmediatePropagation(); e.preventDefault(); self.state.lastCube = region.join(); return; }
        const h = G.hit(self.gizmo, self.transform, self.view, p.x, p.y);
        if (!h) return;
        drag = G.begin(self.gizmo, self.transform, self.view, h, p.x, p.y); self.state.dragging = h;
        try { target.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
        e.stopImmediatePropagation(); e.preventDefault();
    }, { capture: true });
    listen(target, "pointermove", (e) => {
        const p = local(e);
        if (drag) { drag.view = self.view; self.transform = drag.update(p.x, p.y); if (onChange) onChange(self.transform, { delta: drag.delta, handle: drag.id }); e.stopImmediatePropagation(); return; }
        if (!self.visible || !self.view) return;
        self.state.cubeHover = (cubeAt(p.x, p.y, p.w) || null)?.join() ?? null;
        self.state.hover = self.state.cubeHover ? null : G.hit(self.gizmo, self.transform, self.view, p.x, p.y);
    }, { capture: true });
    const end = (e) => { if (!drag) return; drag = null; self.state.dragging = null; if (onChange) onChange(self.transform, { done: true }); e.stopImmediatePropagation(); };
    listen(target, "pointerup", end, { capture: true }); listen(target, "pointercancel", end, { capture: true });
    listen(doc.defaultView, "keydown", (e) => {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
        const m = { Digit1: "translate", Digit2: "rotate", Digit3: "scale" }[e.code];
        if (m) self.setMode(m); else if (e.code === "KeyX") self.setSpace(self.gizmo.space === "world" ? "local" : "world");
    });
    self.setMode = (m) => { self.gizmo = G.createGizmo({ ...self.gizmo, mode: m }); self.state.hover = null; };
    self.setSpace = (s) => { self.gizmo = G.createGizmo({ ...self.gizmo, space: s }); };
    self.draw = (view) => {
        self.view = view; const L = place();
        ctx.setTransform(L.d, 0, 0, L.d, 0, 0); ctx.clearRect(0, 0, L.w, L.h);
        if (!self.visible) return;
        const H = G.handlesOf(self.gizmo, self.transform, view), cz = G.project(view, self.transform.position).depth, col = (h) => (self.state.dragging === h.id || (!self.state.dragging && self.state.hover === h.id) ? COLORS.hover : COLORS[h.id]);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const h of H) {
            ctx.strokeStyle = ctx.fillStyle = col(h);
            if (h.kind === "axis") {
                const [a, b] = h.points; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                if (h.box) ctx.fillRect(b.x - 5, b.y - 5, 10, 10);
                else { const ang = Math.atan2(b.y - a.y, b.x - a.x); ctx.beginPath(); ctx.moveTo(b.x + 12 * Math.cos(ang), b.y + 12 * Math.sin(ang)); ctx.lineTo(b.x + 6 * Math.cos(ang + 2.2), b.y + 6 * Math.sin(ang + 2.2)); ctx.lineTo(b.x + 6 * Math.cos(ang - 2.2), b.y + 6 * Math.sin(ang - 2.2)); ctx.closePath(); ctx.fill(); }
            } else if (h.kind === "plane") { ctx.globalAlpha = 0.45; ctx.beginPath(); h.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
            else if (h.kind === "center") { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.points[0].x, h.points[0].y, h.radius, 0, 2 * Math.PI); ctx.stroke(); }
            else if (h.kind === "ring") {
                ctx.lineWidth = 2.5;
                for (let i = 0; i + 1 < h.points.length; i++) { const a = h.points[i], b = h.points[i + 1], back = h.id !== "view" && (a.depth + b.depth) / 2 > cz; ctx.globalAlpha = back ? 0.25 : 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
                ctx.globalAlpha = 1;
            }
        }
        if (viewCube && controls) drawCube(L.w);
    };
    function drawCube(w) {
        const R = cubeRot(), b = cubeBox(w), S = Math.sqrt(3), half = b.s / 2, cx = b.x + half, cy = b.y + half;
        const toView = (p) => [R[0] * p[0] + R[3] * p[1] + R[6] * p[2], R[1] * p[0] + R[4] * p[1] + R[7] * p[2], R[2] * p[0] + R[5] * p[1] + R[8] * p[2]], scr = (v) => [cx + (v[0] / S) * half, cy - (v[1] / S) * half];
        const faces = FACES.map((f) => ({ ...f, z: toView(f.n)[2] })).filter((f) => f.z > 1e-6).sort((a, c) => a.z - c.z), hover = self.state.cubeHover;
        ctx.font = "bold 12px ui-sans-serif, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (const f of faces) {
            const n = f.n, k = n.findIndex((v) => v !== 0), u = [0, 0, 0], v = [0, 0, 0]; u[(k + 1) % 3] = 1; v[(k + 2) % 3] = 1;
            const corner = (a, c) => scr(toView(n.map((x, i) => x + a * u[i] + c * v[i])));
            const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], lit = hover && hover.split(",").map(Number).every((x, i) => x === n[i]);
            ctx.fillStyle = lit ? "#4a5f86" : `rgba(40,52,74,${0.55 + 0.4 * f.z})`; ctx.strokeStyle = "#8ea2c8"; ctx.lineWidth = 1;
            ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
            const c0 = scr(toView(n)); ctx.fillStyle = COLORS["xyz"[k]]; ctx.fillText(f.label, c0[0], c0[1]);
        }
    }
    self.detach = () => { for (const [t, ev, fn, opt] of on.splice(0)) t.removeEventListener(ev, fn, opt); cv.remove(); };
    self.canvas = cv;
    return self;
}
