// WebGLEngine/bz/bzMesh.js — the mesh family.
//
// Round four. The largest thing left in the .bzw format, and the one everything else in it turns into:
// `tetra`, `meshbox` and `meshpyr` are mesh obstacles too, and upstream so are `arc`, `cone` and `sphere`,
// which are procedural generators INTO this pipeline. Round five.
//
// The grammar (src/bzfs/CustomMesh.cxx, CustomMeshFace.cxx, 2.4 branch):
//
//   mesh
//     vertex x y z          -- indexed lists, in the order they appear
//     normal x y z
//     texcoord u v
//     inside x y z          -- check points; see below, they matter more than they look
//     outside x y z
//     face
//       vertices 0 1 2 3    -- a polygon, at least 3 indices
//       normals 0 1 2 3
//       texcoords 0 1 2 3
//       drivethrough / shootthrough / passable / ricochet   -- per face
//     endface
//     shift / scale / spin / shear / xform                  -- applied to the vertices
//   end
//
// Note `face` is closed by `endface`, not by `end`. bzwParse hands a mesh block's lines back flat, which is
// exactly what a line-oriented format gives you, so faces are reassembled here by scanning for the pair.
//
// TWO FACTS ABOUT MESH COLLISION THAT ARE NOT WHAT ANYONE WOULD GUESS, and are reproduced exactly:
//
//   * `MeshObstacle::inBox` IGNORES the tank's box. It tests the tank's MIDPOINT -- `p[2] + height/2` --
//     and nothing else. The tank's `dx`, `dy` and `angle` arrive as parameters and are marked UNUSED in
//     BZFlag's own source. So a mesh does not stop a tank the way a box does; its FACES do, and the mesh
//     volume only answers "am I inside this thing".
//   * `containsPoint` needs an `inside` or an `outside` point to answer at all. With neither,
//     `checkCount <= 0` and it returns FALSE for every point in the universe. A mesh that forgets to
//     declare one is a mesh you can drive through the middle of. That is upstream behaviour, not a bug
//     here, and bz/tools/bz-mesh-selfcheck.mjs asserts it rather than papering over it.
//
// The rule itself: from the query point, cast a ray at each `inside` point; if it crosses no face, the
// query point is inside. From each `outside` point, cast a ray at the query point; if it crosses no face,
// the query point is outside. If nothing decided, the answer is whether the mesh had any `outside` points
// at all -- `return hasOutsides`.

"use strict";

import { nums } from "./bzwParse.js";
import { apply, mul, identity } from "./bzwWorld.js";

const EPS = 1e-9;

// --- reading ------------------------------------------------------------------------------------------
function intList(params) {
    const out = [];
    for (const p of params) { const v = parseInt(p, 10); if (Number.isFinite(v)) out.push(v); }
    return out;
}

// A polygon's plane, from the first three vertices that are not collinear. Its normal is the winding's.
function planeOf(verts) {
    for (let i = 1; i + 1 < verts.length; i++) {
        const a = verts[0], b = verts[i], c = verts[i + 1];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const len = Math.hypot(n[0], n[1], n[2]);
        if (len > EPS) return [n[0] / len, n[1] / len, n[2] / len, -(n[0] / len * a[0] + n[1] / len * a[1] + n[2] / len * a[2])];
    }
    return null;   // a degenerate face: every vertex on one line
}

// Reassemble the `face` ... `endface` blocks from a mesh's flat parameter lines.
function readFaces(block, meshFlags) {
    const faces = [], errors = [];
    let cur = null;
    for (const l of block.lines) {
        if (l.key === "face") {
            if (cur) errors.push({ line: l.line, msg: "discarding incomplete mesh face" });
            cur = { v: [], n: [], t: [], ...meshFlags, line: l.line };
            continue;
        }
        if (l.key === "endface") {
            if (!cur) { errors.push({ line: l.line, msg: "extra 'endface' keyword found" }); continue; }
            if (cur.v.length >= 3) faces.push(cur);
            else errors.push({ line: cur.line, msg: "mesh faces need at least 3 vertices" });
            cur = null;
            continue;
        }
        if (!cur) continue;                       // a mesh-level line; handled by the caller
        if (l.key === "vertices") cur.v = intList(l.params);
        else if (l.key === "normals") cur.n = intList(l.params);
        else if (l.key === "texcoords") cur.t = intList(l.params);
        else if (l.key === "passable") { cur.driveThrough = true; cur.shootThrough = true; }
        else if (l.key === "drivethrough") cur.driveThrough = true;
        else if (l.key === "shootthrough") cur.shootThrough = true;
        else if (l.key === "ricochet") cur.ricochet = true;
    }
    if (cur) errors.push({ line: block.line, msg: 'mesh face without "endface"' });
    return { faces, errors };
}

// Everything a mesh obstacle is. Vertices are in WORLD space by the time this returns: the mesh's own
// transform stack and its group's are applied here, which is why a mesh -- unlike round three's box --
// never needs the `approx` flag. A sheared mesh is still exactly a sheared mesh.
function makeMeshObstacle(kind, verts, faces, checks, flags, extra = {}) {
    const out = {
        type: "mesh", kind,
        vertices: verts,
        faces: faces.map((f) => ({ ...f, plane: planeOf(f.v.map((i) => verts[i])) })).filter((f) => f.plane),
        checkPoints: checks,
        driveThrough: !!flags.driveThrough, shootThrough: !!flags.shootThrough, ricochet: !!flags.ricochet,
        ...extra,
    };
    // pos/size exist so the rest of the engine (bounds, the camera, the coverage report) can treat a mesh
    // like any other obstacle without special-casing. They describe its box, not its shape.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of verts) for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; }
    out.pos = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]];
    out.size = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, hi[2] - lo[2]];
    out.rotation = 0;
    out.extents = { lo, hi };
    return out;
}

function buildMesh(block, db, xform) {
    const verts = [], normals = [], texcoords = [], checks = [];
    const flags = { driveThrough: false, shootThrough: false, ricochet: false };
    // A mesh's lines and its faces' lines arrive in one flat list, and `drivethrough` is a legal word in
    // both. Reading it without watching for face/endface makes one open face open the whole mesh -- which
    // is exactly what the first draft did, and what bz-mesh-selfcheck caught.
    let inFace = false;
    for (const l of block.lines) {
        if (l.key === "face") { inFace = true; continue; }
        if (l.key === "endface") { inFace = false; continue; }
        if (inFace) continue;
        if (l.key === "vertex") { const v = nums(l.params, 3); if (v) verts.push(v); }
        else if (l.key === "normal") { const v = nums(l.params, 3); if (v) normals.push(v); }
        else if (l.key === "texcoord") { const v = nums(l.params, 2); if (v) texcoords.push(v); }
        else if (l.key === "inside") { const v = nums(l.params, 3); if (v) checks.push({ type: "inside", p: v }); }
        else if (l.key === "outside") { const v = nums(l.params, 3); if (v) checks.push({ type: "outside", p: v }); }
        else if (l.key === "passable") { flags.driveThrough = true; flags.shootThrough = true; }
        else if (l.key === "drivethrough") flags.driveThrough = true;
        else if (l.key === "shootthrough") flags.shootThrough = true;
        else if (l.key === "ricochet") flags.ricochet = true;
    }
    const { faces, errors } = readFaces(block, flags);
    const m = xform || identity();
    const worldVerts = verts.map((v) => apply(m, v));
    const worldChecks = checks.map((c) => ({ type: c.type, p: apply(m, c.p) }));
    const o = makeMeshObstacle("mesh", worldVerts, faces, worldChecks, flags, { normals, texcoords, line: block.line });
    o.parseErrors = errors;
    return o;
}

// `tetra`: four vertices, four triangles. Its check point is the centroid, which is what TetraBuilding
// gets upstream -- a tetrahedron has no other sensible interior point to nominate.
function buildTetra(block, db, xform) {
    const verts = [];
    const flags = { driveThrough: false, shootThrough: false, ricochet: false };
    for (const l of block.lines) {
        if (l.key === "vertex") { const v = nums(l.params, 3); if (v) verts.push(v); }
        else if (l.key === "passable") { flags.driveThrough = true; flags.shootThrough = true; }
        else if (l.key === "drivethrough") flags.driveThrough = true;
        else if (l.key === "shootthrough") flags.shootThrough = true;
        else if (l.key === "ricochet") flags.ricochet = true;
    }
    if (verts.length < 4) return null;                 // "Not creating tetrahedron, not enough vertices"
    const m = xform || identity();
    const w = verts.slice(0, 4).map((v) => apply(m, v));
    const centre = [0, 1, 2].map((k) => (w[0][k] + w[1][k] + w[2][k] + w[3][k]) / 4);
    // Wind each face away from the centroid, so every normal points out.
    const tri = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]].map((idx) => {
        const p = planeOf(idx.map((i) => w[i]));
        if (!p) return null;
        const d = p[0] * centre[0] + p[1] * centre[1] + p[2] * centre[2] + p[3];
        return { v: d > 0 ? [idx[0], idx[2], idx[1]] : idx.slice(), n: [], t: [], ...flags };
    }).filter(Boolean);
    return makeMeshObstacle("tetra", w, tri, [{ type: "inside", p: centre }], flags, { line: block.line });
}

// `meshbox` and `meshpyr` are CustomArc(true) and CustomCone(true): a box and a pyramid, built as MESHES.
// The distinction is not cosmetic -- a mesh obstacle collides by its faces and its midpoint, not the way a
// `box` does -- and reproducing that difference is the whole point of routing them through here.
function boxCorners(pos, size, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const out = [];
    for (const z of [0, size[2]]) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const dx = sx * size[0], dy = sy * size[1];
        out.push([pos[0] + dx * c - dy * s, pos[1] + dx * s + dy * c, pos[2] + z]);
    }
    return out;   // 0..3 bottom, 4..7 top
}
function buildMeshBox(loc, flags, xform, line) {
    const m = xform || identity();
    const v = boxCorners(loc.pos, loc.size, loc.rotation).map((p) => apply(m, p));
    const faces = [
        { v: [4, 5, 6, 7] }, { v: [3, 2, 1, 0] },            // +z, -z
        { v: [1, 2, 6, 5] }, { v: [3, 0, 4, 7] },            // +x, -x
        { v: [2, 3, 7, 6] }, { v: [0, 1, 5, 4] },            // +y, -y
    ].map((f) => ({ ...f, n: [], t: [], ...flags }));
    const centre = [0, 1, 2].map((k) => v.reduce((a, p) => a + p[k], 0) / 8);
    return makeMeshObstacle("meshbox", v, faces, [{ type: "inside", p: centre }], flags, { line });
}
function buildMeshPyr(loc, flags, xform, line, flipz) {
    const m = xform || identity();
    const zb = flipz ? loc.size[2] : 0, za = flipz ? 0 : loc.size[2];
    const c = Math.cos(loc.rotation), s = Math.sin(loc.rotation);
    const base = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
        const dx = sx * loc.size[0], dy = sy * loc.size[1];
        return [loc.pos[0] + dx * c - dy * s, loc.pos[1] + dx * s + dy * c, loc.pos[2] + zb];
    });
    const apex = [loc.pos[0], loc.pos[1], loc.pos[2] + za];
    const v = [...base, apex].map((p) => apply(m, p));
    const faces = (flipz
        ? [{ v: [0, 1, 2, 3] }, { v: [4, 1, 0] }, { v: [4, 2, 1] }, { v: [4, 3, 2] }, { v: [4, 0, 3] }]
        : [{ v: [3, 2, 1, 0] }, { v: [0, 1, 4] }, { v: [1, 2, 4] }, { v: [2, 3, 4] }, { v: [3, 0, 4] }]
    ).map((f) => ({ ...f, n: [], t: [], ...flags }));
    const centre = [0, 1, 2].map((k) => (base[0][k] + base[1][k] + base[2][k] + base[3][k] + apex[k]) / 5)
        .map((x, k) => (k === 2 ? (apex[2] + base[0][2]) / 2 : x));
    return makeMeshObstacle("meshpyr", v, faces, [{ type: "inside", p: apply(m, centre) }], flags, { line });
}

// --- the ray, and what a mesh contains -----------------------------------------------------------------
// MeshFace::intersect: where a ray meets a face's plane, and only if it lands inside the polygon. `t` is in
// units of the ray's direction vector, so BZFlag's `0 < t <= 1` means "between the two points".
function rayFace(origin, dir, face, verts) {
    const pl = face.plane;
    const denom = pl[0] * dir[0] + pl[1] * dir[1] + pl[2] * dir[2];
    if (Math.abs(denom) < EPS) return -1;                       // parallel
    const t = -(pl[0] * origin[0] + pl[1] * origin[1] + pl[2] * origin[2] + pl[3]) / denom;
    if (t <= 0 || t > 1) return -1;
    const p = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
    return pointInPolygon(p, face.v.map((i) => verts[i]), pl) ? t : -1;
}

// The polygon is planar; drop the axis its normal is largest along and test in 2D.
function pointInPolygon(p, poly, pl) {
    const ax = Math.abs(pl[0]), ay = Math.abs(pl[1]), az = Math.abs(pl[2]);
    const [i, j] = az >= ax && az >= ay ? [0, 1] : (ay >= ax ? [0, 2] : [1, 2]);
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const pa = poly[a], pb = poly[b];
        if ((pa[j] > p[j]) !== (pb[j] > p[j])
            && p[i] < ((pb[i] - pa[i]) * (p[j] - pa[j])) / (pb[j] - pa[j]) + pa[i]) inside = !inside;
    }
    return inside;
}

// MeshObstacle::containsPointNoOctree, reproduced. With no check points it answers false for every point in
// the universe, which is upstream behaviour and is the reason a mesh without an `inside` is a mesh you can
// drive through the middle of.
function meshContainsPoint(mesh, point) {
    if (!mesh.checkPoints.length) return false;
    // v2187 -- a point outside the mesh's own box cannot be inside its faces, and asking costs one compare
    // instead of a ray against every one of them. A 128-face dome made that difference measurable.
    const e = mesh.extents;
    if (e) for (let k = 0; k < 3; k++) if (point[k] < e.lo[k] || point[k] > e.hi[k]) return false;
    let hasOutsides = false;
    for (const c of mesh.checkPoints) {
        if (c.type === "inside") {
            const dir = [c.p[0] - point[0], c.p[1] - point[1], c.p[2] - point[2]];
            if (!anyFaceHit(mesh, point, dir)) return true;
        } else {
            hasOutsides = true;
            const dir = [point[0] - c.p[0], point[1] - c.p[1], point[2] - c.p[2]];
            if (!anyFaceHit(mesh, c.p, dir)) return false;
        }
    }
    return hasOutsides;
}
function anyFaceHit(mesh, origin, dir) {
    for (const f of mesh.faces) if (rayFace(origin, dir, f, mesh.vertices) > 0) return true;
    return false;
}

// --- geometry ------------------------------------------------------------------------------------------
// Fan-triangulate every face. A face's normals may be given per-vertex; if not, the plane's will do, which
// is what a hard-edged obstacle wants anyway.
function meshTriangles(mesh) {
    const positions = [], normals = [], indices = [];
    for (const f of mesh.faces) {
        const base = positions.length / 3;
        for (let k = 0; k < f.v.length; k++) {
            const v = mesh.vertices[f.v[k]];
            positions.push(v[0], v[1], v[2]);
            const n = (f.n.length === f.v.length && mesh.normals && mesh.normals[f.n[k]]) ? mesh.normals[f.n[k]] : f.plane;
            normals.push(n[0], n[1], n[2]);
        }
        for (let k = 1; k + 1 < f.v.length; k++) indices.push(base, base + k, base + k + 1);
    }
    return { positions, normals, indices };
}

export {
    buildMesh, buildTetra, buildMeshBox, buildMeshPyr, makeMeshObstacle,
    meshContainsPoint, meshTriangles, rayFace, pointInPolygon, planeOf, readFaces, boxCorners,
};
if (typeof module !== "undefined" && module.exports)
    module.exports = { buildMesh, buildTetra, buildMeshBox, buildMeshPyr, makeMeshObstacle, meshContainsPoint, meshTriangles, rayFace, pointInPolygon, planeOf, readFaces, boxCorners };
