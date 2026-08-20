// tools/krbn/krbnCompare.js
//
// The bridge for an "our obj vs Krbn" comparison, and the proof of what Krbn hands back. Krbn is a renderer that takes a
// 3D scene and a perspective camera and draws a flat SVG -- a technical line drawing. So the answer to "is it flat or can
// we bring it back into a 3D view" is: the OUTPUT is flat, and it cannot be lifted back to 3D, because the projection
// throws depth away. But we do not need to lift it. The 3D lives UPSTREAM: the same mesh (positions + triangles) that
// Krbn draws is a mesh our own engine renders directly. That shared mesh is the bridge -- no TypeScript-to-3D function is
// needed to recover 3D from Krbn, because the 3D was never lost on the input side, only on the output side.
//
// And because everything is deterministic, "frame N of our obj" and "frame N of Krbn" are the SAME geometry rendered two
// ways -- which is exactly what makes a frame-by-frame A/B wipe an honest comparison rather than two things that merely
// look alike. This module holds the shared geometry, the projection Krbn uses to flatten it, and the gate that shows the
// flattening is one-way.

// The Krbn camera, copied from portfolio/krbn/swek-splat.krbn.ts.
export const KRBN_CAM = { eye: [7.5, 5.5, 4.0], target: [0, 0, 0], up: [0, 0, 1], scale: Math.PI / 4.2, viewport: { width: 720, height: 560 } };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const m = Math.sqrt(dot(a, a)) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };

// A deterministic little mesh -- stand-in for "our obj". Fixed seed, because a drawing you cannot reproduce is not one
// you can diff (Krbn's own principle). Returns { positions: Vec3[], triangles: [i,i,i][] } -- exactly Krbn's MeshInput.
export function sharedMesh(seed = 20250716) {
    let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const positions = [], triangles = [];
    const N = 24;
    for (let i = 0; i < N; i++) {
        const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), r = 1 + rnd();
        positions.push([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)]);
    }
    for (let i = 0; i < N - 2; i++) triangles.push([i, i + 1, i + 2]);
    return { positions, triangles };
}

// Project a 3D point through the perspective camera to 2D screen pixels -- what Krbn does to draw its SVG. Returns null
// for points behind the camera. This is where depth is discarded: a point's screen position depends only on the ray it
// lies on, not how far along it sits.
export function project(p, cam = KRBN_CAM) {
    const fwd = norm(sub(cam.target, cam.eye));
    const right = norm(cross(fwd, cam.up));
    const up = cross(right, fwd);
    const rel = sub(p, cam.eye);
    const cx = dot(rel, right), cy = dot(rel, up), cz = dot(rel, fwd);
    if (cz <= 1e-6) return null;
    const f = 1 / Math.tan(cam.scale);
    const W = cam.viewport.width, H = cam.viewport.height;
    return [W / 2 + (cx / cz) * f * (W / 2), H / 2 - (cy / cz) * f * (H / 2)];
}

// Project a whole mesh -- the flat 2D point set Krbn draws from.
export function projectMesh(mesh, cam = KRBN_CAM) { return mesh.positions.map((p) => project(p, cam)); }

// The ray from the eye through a 2D screen point -- the inverse of the projection's DIRECTION (but not its depth).
export function rayThroughScreen(sx, sy, cam = KRBN_CAM) {
    const fwd = norm(sub(cam.target, cam.eye));
    const right = norm(cross(fwd, cam.up));
    const up = cross(right, fwd);
    const f = 1 / Math.tan(cam.scale), W = cam.viewport.width, H = cam.viewport.height;
    const a = (sx - W / 2) / (f * W / 2);       // cx/cz
    const b = (H / 2 - sy) / (f * H / 2);       // cy/cz
    const dir = norm([a * right[0] + b * up[0] + fwd[0], a * right[1] + b * up[1] + fwd[1], a * right[2] + b * up[2] + fwd[2]]);
    return { origin: cam.eye.slice(), dir };
}

// Moller-Trumbore ray-triangle intersection: returns the ray parameter t of the hit, or null.
function rayTri(o, d, a, b, c) {
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-9) return null;
    const inv = 1 / det, tv = sub(o, a), u = dot(tv, p) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) return null;
    const q = cross(tv, e1), v = dot(d, q) * inv;
    if (v < -1e-6 || u + v > 1 + 1e-6) return null;
    const t = dot(e2, q) * inv;
    return t > 1e-6 ? t : null;
}

// BACK-PROJECT a flat 2D point onto the 3D mesh: cast the ray and take the nearest surface hit. This is the "ingest back
// to 3D" -- the flat stroke lifted onto the surface it was drawn from. It works BECAUSE we have the geometry and camera;
// the depth the projection discarded is put back by the mesh the ray strikes. Returns the 3D point, or null on a miss.
export function backProject(sx, sy, mesh, cam = KRBN_CAM) {
    const { origin, dir } = rayThroughScreen(sx, sy, cam);
    let best = Infinity, hit = null;
    for (const [i, j, k] of mesh.triangles) {
        const t = rayTri(origin, dir, mesh.positions[i], mesh.positions[j], mesh.positions[k]);
        if (t !== null && t < best) { best = t; hit = [origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2]]; }
    }
    return hit;
}
