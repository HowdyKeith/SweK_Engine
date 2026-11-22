// WebGLEngine/render/gizmo.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// TRANSLATE, ROTATE AND SCALE GIZMOS AND A VIEW CUBE: THE MATHS, NO DOM, NO GPU. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `gizmos` (PlayCanvas src/extras/gizmo/:
// TranslateGizmo, RotateGizmo, ScaleGizmo, ViewCube). Keith: "Translate, rotate and scale gizmos, with a view cube and an infinite grid. It pairs naturally with the new camera
// controls." The drawing is render/gizmoOverlay.mjs (a 2D canvas over any page, WebGL2 or WebGPU); the grid is render/infiniteGrid.mjs. Everything here is pure.
//
//   THE CAMERA   a view (view-projection, its inverse, the eye, the vertical field of view, the viewport in CSS pixels, `zRange` "gl" (-1..1, the WebGL2 pages) or "zo" (0..1, WebGPU's
//                perspZO)): viewOf({ viewProj, eye, fovY, width, height, zRange }). project(view, p) -> [x, y] pixels (y down) and its depth; rayAt(view, x, y) -> { origin, dir }.
//   THE GIZMO    createGizmo({ mode: "translate" | "rotate" | "scale", space: "world" | "local", size (pixels, 96), snap: { translate, rotate (radians), scale } })
//                with a TRANSFORM { position, rotation (a unit quaternion [x, y, z, w]), scale }. It is drawn the same size on the screen wherever it stands: worldSize(view, position)
//                is `size` pixels in world units there.
//      handlesOf(gizmo, transform, view) -> the handles as screen geometry (what the overlay draws and what is hit): for translate, three AXES (x, y, z: a segment each), three
//                PLANES (xy, yz, zx: a small square each) and the VIEW-plane centre; for rotate, three RINGS about the axes and the VIEW ring about the line of sight; for scale, three
//                axes with boxes and the UNIFORM centre. Each { id, kind, axis or normal, points (pixels) }.
//      hit(gizmo, transform, view, x, y, tolerance = 8) -> the handle under the pointer (the nearest within `tolerance` pixels; a plane square or the centre when inside it), or null
//      begin(gizmo, transform, view, handleId, x, y) -> a drag; drag.update(x, y) -> the new transform; drag.delta -> what moved (a vector, an angle, or a ratio)
//                TRANSLATE ALONG AN AXIS: the point of the axis line nearest the pointer's ray, its change since the start. IN A PLANE: where the ray meets the plane through
//                the start, its change. ROTATE: where the ray meets the plane square to the axis through the centre, the signed angle swept from the start about the axis
//                (the view ring: about the line of sight). SCALE: along an axis, the nearest point's distance from the centre over the start's; uniform: the pointer's
//                distance from the centre on the screen over the start's. SNAPPING rounds the delta (a length, an angle, a ratio's step) before it is applied.
//                A ray parallel to the line or plane it must meet gives no move (the drag holds where it was) rather than a jump to infinity.
//   THE VIEW CUBE  viewCubeRegion(point in the cube's own space, edge = 0.3) -> the face, edge or corner a point on the cube's surface is in, as a vector of -1/0/+1 per axis (26
//                regions); viewCubePick(viewRotation, x, y) the same for a pointer at (x, y) in [-1, 1]^2 over the drawn cube (an orthographic view of a cube of half-side
//                1 turned by the camera's view rotation, 3 x 3). poseFor(region, up = "y" | "z") -> { yaw, pitch } that put the camera's eye on that side of the target, for
//                render/cameraControls.mjs (its eye is target + distance * back(yaw, pitch); poseFor inverts that back vector).
// Held by tools/ship/gizmo-selfcheck.mjs.
"use strict";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vec = Object.freeze({ sub, add, mul, dot, cross, len, norm });

/** 4x4 column-major helpers. */
export function transform4(m, x, y, z, w = 1) { return [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w, m[3] * x + m[7] * y + m[11] * z + m[15] * w]; }
export function invert4(m) {
    const a = m, o = new Float64Array(16);
    o[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    o[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    o[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    o[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    o[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    o[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    o[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    o[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    o[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    o[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    o[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    o[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    o[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    o[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    o[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    o[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    const det = a[0] * o[0] + a[1] * o[4] + a[2] * o[8] + a[3] * o[12];
    if (!det) return null;
    for (let i = 0; i < 16; i++) o[i] /= det;
    return o;
}

/** Quaternions [x, y, z, w]. */
export const quat = Object.freeze({
    identity: () => [0, 0, 0, 1],
    axisAngle: (a, t) => { const n = norm(a), s = Math.sin(t / 2); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(t / 2)]; },
    mul: (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]],
    rotate: (q, v) => { const u = [q[0], q[1], q[2]], s = q[3], uv = cross(u, v), uuv = cross(u, uv); return add(v, add(mul(uv, 2 * s), mul(uuv, 2))); },
    normalize: (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; },
});

/** A camera as the gizmo needs it. */
export function viewOf({ viewProj, eye, fovY, width, height, zRange = "gl" }) {
    const inv = invert4(viewProj);
    if (!inv) throw new Error("gizmo.viewOf: the view-projection is not invertible");
    if (zRange !== "gl" && zRange !== "zo") throw new Error(`gizmo.viewOf: zRange is "gl" or "zo" (got ${zRange})`);
    return { viewProj, inv, eye: [...eye], fovY, width, height, zNear: zRange === "gl" ? -1 : 0 };
}
/** A world point on the screen: { x, y } in pixels (y down), depth the NDC z, behind true when it is behind the eye. */
export function project(view, p) {
    const q = transform4(view.viewProj, p[0], p[1], p[2], 1), w = q[3];
    return { x: (q[0] / w + 1) / 2 * view.width, y: (1 - q[1] / w) / 2 * view.height, depth: q[2] / w, behind: w <= 0 };
}
/** The pointer's ray: from the near plane through (x, y), unit direction. */
export function rayAt(view, x, y) {
    const nx = (x / view.width) * 2 - 1, ny = 1 - (y / view.height) * 2, a = transform4(view.inv, nx, ny, view.zNear, 1), b = transform4(view.inv, nx, ny, 1, 1);
    const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], p1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    return { origin: p0, dir: norm(sub(p1, p0)) };
}
/** `pixels` on the screen, in world units, at a point `distance` from the eye. */
export function worldPerPixel(view, p) { return (2 * len(sub(p, view.eye)) * Math.tan(view.fovY / 2)) / view.height; }

/** The parameter t along the line (o + t d, d unit) nearest the ray (r.origin + s r.dir); null when the two are parallel. */
export function lineNearRay(o, d, r) {
    const w = sub(o, r.origin), a = dot(d, d), b = dot(d, r.dir), c = dot(r.dir, r.dir), dd = dot(d, w), e = dot(r.dir, w), den = a * c - b * b;
    if (Math.abs(den) < 1e-9 * a * c) return null;
    return (b * e - c * dd) / den;
}
/** Where the ray meets the plane through p with normal n; null when parallel or behind. */
export function rayPlane(r, p, n) {
    const den = dot(n, r.dir);
    if (Math.abs(den) < 1e-9) return null;
    const t = dot(n, sub(p, r.origin)) / den;
    return t < 0 ? null : add(r.origin, mul(r.dir, t));
}

const AXES = Object.freeze({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }), PLANES = Object.freeze({ xy: ["x", "y", "z"], yz: ["y", "z", "x"], zx: ["z", "x", "y"] });
export const MODES = Object.freeze(["translate", "rotate", "scale"]);
export function createGizmo({ mode = "translate", space = "world", size = 96, snap = null } = {}) {
    if (!MODES.includes(mode)) throw new Error(`gizmo.createGizmo: mode is translate, rotate or scale (got ${mode})`);
    if (space !== "world" && space !== "local") throw new Error(`gizmo.createGizmo: space is world or local (got ${space})`);
    return { mode, space, size, snap: snap ? { ...snap } : null };
}
/** The gizmo's axes in world space: the world's, or the transform's own (space "local"; scale is always local). */
export function axesOf(gizmo, transform) {
    const local = gizmo.space === "local" || gizmo.mode === "scale";
    return Object.fromEntries(Object.entries(AXES).map(([k, a]) => [k, local ? norm(quat.rotate(transform.rotation, a)) : a]));
}
const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0; return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); };
const inPoly = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c; return c; };
const RING = 64;

/** The gizmo's handles as screen geometry. */
export function handlesOf(gizmo, transform, view) {
    const c = transform.position, s = gizmo.size * worldPerPixel(view, c), A = axesOf(gizmo, transform), P = (p) => project(view, p), out = [];
    const viewDir = norm(sub(c, view.eye));
    if (gizmo.mode === "translate" || gizmo.mode === "scale") {
        for (const k of ["x", "y", "z"]) out.push({ id: k, kind: "axis", axis: A[k], points: [P(c), P(add(c, mul(A[k], s)))], ...(gizmo.mode === "scale" ? { box: P(add(c, mul(A[k], s))) } : {}) });
    }
    if (gizmo.mode === "translate") {
        for (const [id, [u, v, n]] of Object.entries(PLANES)) { const a = 0.25 * s, b = 0.45 * s, q = [add(c, add(mul(A[u], a), mul(A[v], a))), add(c, add(mul(A[u], b), mul(A[v], a))), add(c, add(mul(A[u], b), mul(A[v], b))), add(c, add(mul(A[u], a), mul(A[v], b)))]; out.push({ id, kind: "plane", normal: A[n], points: q.map(P) }); }
        out.push({ id: "view", kind: "center", normal: viewDir, points: [P(c)], radius: 7 });
    }
    if (gizmo.mode === "scale") out.push({ id: "uniform", kind: "center", points: [P(c)], radius: 8 });
    if (gizmo.mode === "rotate") {
        const ring = (axis, r) => { const t = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(axis, t)), v = cross(axis, u); return Array.from({ length: RING + 1 }, (_, i) => { const a = (2 * Math.PI * i) / RING; return P(add(c, add(mul(u, r * Math.cos(a)), mul(v, r * Math.sin(a))))); }); };
        for (const k of ["x", "y", "z"]) out.push({ id: k, kind: "ring", axis: A[k], points: ring(A[k], s) });
        out.push({ id: "view", kind: "ring", axis: viewDir, points: ring(viewDir, 1.2 * s) });
    }
    return out;
}
/** The handle under the pointer, or null. Squares and centres win when the pointer is inside them; otherwise the nearest line within `tolerance` pixels. */
export function hit(gizmo, transform, view, x, y, tolerance = 8) {
    const p = { x, y }, H = handlesOf(gizmo, transform, view);
    for (const h of H) if (h.kind === "center" && Math.hypot(x - h.points[0].x, y - h.points[0].y) <= h.radius) return h.id;
    for (const h of H) if (h.kind === "plane" && inPoly(p, h.points)) return h.id;
    let best = null, bd = tolerance;
    for (const h of H) {
        if (h.kind !== "axis" && h.kind !== "ring") continue;
        for (let i = 0; i + 1 < h.points.length; i++) { const d = segDist(p, h.points[i], h.points[i + 1]); if (d <= bd) { bd = d; best = h.id; } }
        if (h.box && Math.max(Math.abs(x - h.box.x), Math.abs(y - h.box.y)) <= 6) return h.id;
    }
    return best;
}
const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

/** A drag of handle `id` begun at (x, y). update(x, y) returns the new transform (the start's when there is no move to make). */
export function begin(gizmo, transform, view, id, x, y) {
    const t0 = { position: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale] }, A = axesOf(gizmo, t0), c = t0.position, snap = gizmo.snap || {};
    const start = rayAt(view, x, y), H = handlesOf(gizmo, t0, view).find((h) => h.id === id);
    if (!H) throw new Error(`gizmo.begin: no handle ${id} in mode ${gizmo.mode}`);
    const drag = { id, mode: gizmo.mode, delta: null, view, update: null };
    if (gizmo.mode === "translate" && H.kind === "axis") {
        const a0 = lineNearRay(c, A[id], start);
        drag.update = (px, py) => { const t = lineNearRay(c, A[id], rayAt(drag.view, px, py)); if (a0 === null || t === null) return t0; const d = snapTo(t - a0, snap.translate); drag.delta = mul(A[id], d); return { ...t0, position: add(c, drag.delta) }; };
    } else if (gizmo.mode === "translate") {
        const n = H.normal, h0 = rayPlane(start, c, n);
        drag.update = (px, py) => { const h = rayPlane(rayAt(drag.view, px, py), c, n); if (!h0 || !h) return t0; let d = sub(h, h0); if (snap.translate) d = d.map((v) => snapTo(v, snap.translate)); drag.delta = d; return { ...t0, position: add(c, d) }; };
    } else if (gizmo.mode === "rotate") {
        const a = H.axis, h0 = rayPlane(start, c, a);
        drag.update = (px, py) => { const h = rayPlane(rayAt(drag.view, px, py), c, a); if (!h0 || !h) return t0; const v0 = sub(h0, c), v1 = sub(h, c); let ang = Math.atan2(dot(a, cross(v0, v1)), dot(v0, v1)); ang = snapTo(ang, snap.rotate); drag.delta = ang; return { ...t0, rotation: quat.normalize(quat.mul(quat.axisAngle(a, ang), t0.rotation)) }; };
    } else if (H.kind === "axis") {
        const k = ["x", "y", "z"].indexOf(id), a0 = lineNearRay(c, A[id], start);
        drag.update = (px, py) => { const t = lineNearRay(c, A[id], rayAt(drag.view, px, py)); if (!a0 || t === null) return t0; let r = t / a0; if (snap.scale) r = 1 + snapTo(r - 1, snap.scale); r = Math.max(1e-3, r); drag.delta = r; const sc = [...t0.scale]; sc[k] *= r; return { ...t0, scale: sc }; };
    } else {
        const o = project(view, c), d0 = Math.hypot(x - o.x, y - o.y) || 1;
        drag.update = (px, py) => { let r = Math.hypot(px - o.x, py - o.y) / d0; if (snap.scale) r = 1 + snapTo(r - 1, snap.scale); r = Math.max(1e-3, r); drag.delta = r; return { ...t0, scale: t0.scale.map((v) => v * r) }; };
    }
    return drag;
}

/** THE VIEW CUBE. The region (-1/0/+1 per axis) of a point on the surface of the cube [-1, 1]^3: within `edge` of a face's border a coordinate counts as on that side. */
export function viewCubeRegion(p, edge = 0.3) { return p.map((v) => (v > 1 - edge ? 1 : v < -(1 - edge) ? -1 : 0)); }
/** The region under (x, y) in [-1, 1]^2 (y up) over the drawn cube: an orthographic view of the cube [-1, 1]^3 turned by `viewRotation` (a 3 x 3, column-major: the world-to-view
 *  rotation), the view looking down -z, the drawing scaled so the cube's bounding sphere (radius sqrt 3) fills the square. Null when the pointer misses the cube. */
export function viewCubePick(viewRotation, x, y, edge = 0.3) {
    const R = viewRotation, S = Math.sqrt(3), o = [x * S, y * S, 10], d = [0, 0, -1];
    // into the cube's space: the transpose (inverse) of the rotation
    const toCube = (v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
    const O = toCube(o), D = toCube(d);
    let tn = -Infinity, tf = Infinity;
    for (let i = 0; i < 3; i++) { if (Math.abs(D[i]) < 1e-12) { if (Math.abs(O[i]) > 1) return null; continue; } let t1 = (-1 - O[i]) / D[i], t2 = (1 - O[i]) / D[i]; if (t1 > t2) [t1, t2] = [t2, t1]; tn = Math.max(tn, t1); tf = Math.min(tf, t2); }
    if (tn > tf || tf < 0) return null;
    return viewCubeRegion(add(O, mul(D, tn)), edge);
}
/** The yaw and pitch (render/cameraControls.mjs's) that put the eye on the side `region` points to: back = region, normalised. Straight up or down is held off the pole. */
export function poseFor(region, up = "y") {
    const b = norm(region);
    if (up === "z") return { yaw: Math.atan2(b[0], -b[1]), pitch: Math.asin(Math.max(-1, Math.min(1, b[2]))) };
    return { yaw: Math.atan2(b[0], b[2]), pitch: Math.asin(Math.max(-1, Math.min(1, b[1]))) };
}
/** The world-to-view rotation (3 x 3, column-major) of a camera looking from `back` (target to eye) with `worldUp`. */
export function viewRotationOf(back, worldUp = [0, 1, 0]) {
    const z = norm(back), x0 = cross(worldUp, z), x = len(x0) > 1e-6 ? norm(x0) : norm(cross([0, 0, 1], z)), y = cross(z, x);
    return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
