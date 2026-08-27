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
    const W = cam.viewport.width, H = cam.viewport.height;
    // *** v4045 -- ONE FOCAL LENGTH FOR BOTH AXES. THE OLD FORM USED TWO AND THE PANES NEVER LINED UP. ***
    // This was `[W/2 + (cx/cz)*f*(W/2), H/2 - (cy/cz)*f*(H/2)]` -- an effective focal length of f*W/2
    // horizontally against f*H/2 vertically, i.e. ANISOTROPIC by exactly W/H. At this page's 920x560 that is a
    // 1.643x horizontal stretch: a sphere projects as an ellipse, and the wider the viewport the worse it gets.
    //
    // MEASURED against Krbn's own projectionMatrix (vendor/krbn/math/camera.js, which uses a single
    // `fpx = H/2/tan(scale/2)` for both axes and is correct): the VERTICAL axis agreed to 0.0px, and the
    // HORIZONTAL was out by 32.3px at x=1 and 64.7px at x=2 -- growing linearly, ratio exactly 1.642 = 920/560.
    // krbn-compare.html's own "Honest scope" note claimed "its shader uses the same projection as the Krbn
    // side, so the two stay aligned across the wipe". IT WAS NOT AND THEY DID NOT, by a factor of 1.64, for
    // this page's whole life -- and because the WebGL shader repeated the same two-focal-length form, the two
    // panes agreed with EACH OTHER while both disagreed with Krbn, which is what made it invisible.
    const fpx = (H / 2) / Math.tan(cam.scale);
    return [W / 2 + (cx / cz) * fpx, H / 2 - (cy / cz) * fpx];
}

// Project a whole mesh -- the flat 2D point set Krbn draws from.
export function projectMesh(mesh, cam = KRBN_CAM) { return mesh.positions.map((p) => project(p, cam)); }

// The ray from the eye through a 2D screen point -- the inverse of the projection's DIRECTION (but not its depth).
export function rayThroughScreen(sx, sy, cam = KRBN_CAM) {
    const fwd = norm(sub(cam.target, cam.eye));
    const right = norm(cross(fwd, cam.up));
    const up = cross(right, fwd);
    const W = cam.viewport.width, H = cam.viewport.height;
    // v4045 -- MUST TRACK project() EXACTLY: this is its inverse, and the lift/export ray-cast the drawing back
    // onto the surface through it. Leaving this on the old two-focal-length form while project() moved to one
    // would put every lifted point on the wrong ray -- a silent, plausible-looking wrongness rather than a
    // crash. krbnCompare-selfcheck's round-trip check is what holds the two together.
    const fpx = (H / 2) / Math.tan(cam.scale);
    const a = (sx - W / 2) / fpx;               // cx/cz
    const b = (H / 2 - sy) / fpx;               // cy/cz
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
    const h = backProjectHit(sx, sy, mesh, cam);
    return h ? h.point : null;
}

/**
 * *** v4047 -- THE SAME RAY-CAST, BUT IT REMEMBERS WHERE IT LANDED, AND THAT IS WHAT MAKES THE DRAWING
 * RIGGABLE. *** backProject() above returns only a 3D point, which is enough to drape a stroke and useless
 * for animating one: a bare position has no relationship to the skeleton that moved it there.
 *
 * Returning the TRIANGLE and the BARYCENTRIC coordinates instead pins each stroke point to a place on the
 * SURFACE rather than a place in space -- and because linear blend skinning is LINEAR IN THE VERTEX POSITION,
 * a point at barycentric (u,v,w) of a triangle deforms to exactly the same blend of that triangle's three
 * deformed corners. So a stroke point needs NO weights of its own: re-blend it against the triangle's current
 * posed vertices and it follows the animation exactly, not approximately. That identity is the whole trick,
 * and it is why the rigged drawing is a rig rather than a resemblance.
 *
 * @returns {{point:number[], tri:number, bary:number[]}|null}
 */
export function backProjectHit(sx, sy, mesh, cam = KRBN_CAM) {
    const { origin, dir } = rayThroughScreen(sx, sy, cam);
    let best = Infinity, hit = null;
    for (let n = 0; n < mesh.triangles.length; n++) {
        const [i, j, k] = mesh.triangles[n];
        const A = mesh.positions[i], B = mesh.positions[j], C = mesh.positions[k];
        const t = rayTri(origin, dir, A, B, C);
        if (t === null || t >= best) continue;
        best = t;
        const p = [origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2]];
        hit = { point: p, tri: n, bary: baryOf(p, A, B, C) };
    }
    return hit;
}

/** Barycentric coordinates of p within triangle ABC, by the area (cross-product) method. */
function baryOf(p, A, B, C) {
    const v0 = sub(B, A), v1 = sub(C, A), v2 = sub(p, A);
    const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1);
    const d20 = dot(v2, v0), d21 = dot(v2, v1);
    const den = d00 * d11 - d01 * d01;
    if (!den) return [1, 0, 0];
    const v = (d11 * d20 - d01 * d21) / den;
    const w = (d00 * d21 - d01 * d20) / den;
    return [1 - v - w, v, w];
}

/** A point pinned to (tri, bary), evaluated against whatever `positions` currently holds. */
export function baryPoint(positions, triangle, bary) {
    const [i, j, k] = triangle, [u, v, w] = bary;
    const A = positions[i], B = positions[j], C = positions[k];
    return [u*A[0] + v*B[0] + w*C[0], u*A[1] + v*B[1] + w*C[1], u*A[2] + v*B[2] + w*C[2]];
}
