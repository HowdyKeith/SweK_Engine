// WebGLEngine/bz/bzGeom.js — BZFlag obstacles as triangles.
//
// Round two. Round one built a world of numbers; this turns it into something a GPU can draw, and -- the
// part that matters here -- into something a test can check without a GPU at all.
//
// Geometry is one of the few things you can PROVE headlessly. A closed solid has every edge shared by
// exactly two triangles. If its winding is consistent and outward, the signed volume from the divergence
// theorem is positive and equal to the volume you can work out on paper. A box is 4*sx*sy*sz, a pyramid is
// a third of that. bz/tools/bzw-geom-selfcheck.mjs checks all of it. No renderer required, and no eye.
//
// Which is just as well, because some of these are not solids at all and must not pretend to be:
//
//   * a WALL is a one-sided plane in BZFlag (WallObstacle). We draw a quad. It is not closed.
//   * a BASE is usually flat: `size 30 30 0`. A zero-height box is a pad, not a box.
//   * the GROUND is a quad.
//
// Sizes follow round one's rules: `size` is a half-extent in x and y, and a full height in z, so a box
// spans -sx..+sx, -sy..+sy, 0..sz in its own frame, and `pos` is the centre of its base.

"use strict";

import { apply, mul, spinM, shiftM, identity } from "./bzwWorld.js";
import { meshTriangles } from "./bzMesh.js";   // v2183 -- the mesh family

// --- a tiny mesh builder ----------------------------------------------------------------------------
// positions and normals are flat Float64 triples; indices are triangles. Kept as plain arrays: the
// caller decides what typed array it wants, and a test wants neither.
function emptyMesh() { return { positions: [], normals: [], indices: [] }; }

function addTri(m, a, b, c) {
    const base = m.positions.length / 3;
    // The face normal comes from the winding, so a caller that lists a triangle backwards gets a normal
    // that points inward, and the selfcheck's volume test will say so.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) { m.positions.push(p[0], p[1], p[2]); m.normals.push(nx, ny, nz); }
    m.indices.push(base, base + 1, base + 2);
}

// A quad, wound so its normal follows the right hand from a->b->c->d.
function addQuad(m, a, b, c, d) { addTri(m, a, b, c); addTri(m, a, c, d); }

function mergeMesh(dst, src, meta) {
    const base = dst.positions.length / 3;
    for (const v of src.positions) dst.positions.push(v);
    for (const v of src.normals) dst.normals.push(v);
    for (const i of src.indices) dst.indices.push(i + base);
    if (meta) dst.parts.push({ ...meta, first: base, count: src.positions.length / 3 });
    return dst;
}

// --- the obstacle's own frame -> the world ------------------------------------------------------------
// An obstacle carries `pos`, `rotation` (radians, about z) and, if it came out of a group, a transform.
// The order is BZFlag's: build in local space, spin about z, shift to pos, then the group's transform.
function placement(o) {
    let m = identity();
    if (o.rotation) m = mul(spinM(o.rotation * 180 / Math.PI, 0, 0, 1), m);
    m = mul(shiftM(o.pos[0], o.pos[1], o.pos[2]), m);
    if (o.transform) m = mul(o.transform, m);
    return m;
}

// Normals need the inverse transpose. Every transform we build from a .bzw is a composition of shift,
// spin, scale and shear -- so a general 3x3 inverse-transpose is the honest thing, not a shortcut that
// only works when the scale is uniform.
function normalMatrix(m) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (!det) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const inv = [
        (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
        (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
        (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
    ];
    // transpose of the inverse
    return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}

function transformMesh(m, xf) {
    if (!xf) return m;
    const nm = normalMatrix(xf);
    const out = { positions: [], normals: [], indices: m.indices.slice() };
    for (let i = 0; i < m.positions.length; i += 3) {
        const p = apply(xf, [m.positions[i], m.positions[i + 1], m.positions[i + 2]]);
        out.positions.push(p[0], p[1], p[2]);
        const n = [m.normals[i], m.normals[i + 1], m.normals[i + 2]];
        let x = nm[0] * n[0] + nm[1] * n[1] + nm[2] * n[2];
        let y = nm[3] * n[0] + nm[4] * n[1] + nm[5] * n[2];
        let z = nm[6] * n[0] + nm[7] * n[1] + nm[8] * n[2];
        const len = Math.hypot(x, y, z) || 1;
        out.normals.push(x / len, y / len, z / len);
    }
    return out;
}

// --- the primitives -----------------------------------------------------------------------------------
// A closed box in local space: -sx..sx, -sy..sy, 0..sz. Twelve triangles, wound outward.
function boxMesh(sx, sy, sz) {
    const m = emptyMesh();
    const [x0, x1, y0, y1, z0, z1] = [-sx, sx, -sy, sy, 0, sz];
    const p = (x, y, z) => [x, y, z];
    addQuad(m, p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1));   // +z
    addQuad(m, p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0), p(x0, y0, z0));   // -z
    addQuad(m, p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1));   // +x
    addQuad(m, p(x0, y1, z0), p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1));   // -x
    addQuad(m, p(x1, y1, z0), p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1));   // +y
    addQuad(m, p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1));   // -y
    return m;
}

// A square pyramid: base -sx..sx by -sy..sy at z=0, apex at (0,0,sz). `flipz` stands it on its point --
// the base moves to the top and the apex to the bottom, which is what a negative z size means too.
function pyramidMesh(sx, sy, sz, flipz) {
    const m = emptyMesh();
    const zb = flipz ? sz : 0, za = flipz ? 0 : sz;
    const a = [-sx, -sy, zb], b = [sx, -sy, zb], c = [sx, sy, zb], d = [-sx, sy, zb];
    const apex = [0, 0, za];
    if (flipz) {
        addQuad(m, a, b, c, d);                                                // base faces up
        addTri(m, apex, b, a); addTri(m, apex, c, b); addTri(m, apex, d, c); addTri(m, apex, a, d);
    } else {
        addQuad(m, d, c, b, a);                                                // base faces down
        addTri(m, a, b, apex); addTri(m, b, c, apex); addTri(m, c, d, apex); addTri(m, d, a, apex);
    }
    return m;
}

// A teleporter is an arch, not a slab. Two posts of width `border` in y, and a lintel between them.
// Teleporter::finalize: the outer breadth is origSize[1] + border and the outer height is origSize[2] +
// border. The hole is the original size, and it is what the two link faces cross.
//
// AND IT IS NOT ONE SOLID. It is three, glued face to face, so the union has edges shared by four
// triangles and is not a manifold. Saying "closed" of it would be a lie, so the builder hands back the
// three solids as well as the union, and the selfcheck checks each of them and the sum of their volumes.
// A renderer only wants the union; a proof wants the parts.
function teleporterMesh(sx, sy, sz, border) {
    const outerZ = sz + border, outerY = sy + border;
    const post = (yc) => transformMesh(boxMesh(sx, border / 2, outerZ), shiftM(0, yc, 0));
    const solids = [
        post(-(sy + border / 2)),                                              // left post
        post(+(sy + border / 2)),                                              // right post
        transformMesh(boxMesh(sx, sy, border), shiftM(0, 0, sz)),              // the lintel, spanning the hole
    ];
    const m = emptyMesh();
    for (const s of solids) mergeMesh(m, s);
    return { mesh: m, solids, outerY, outerZ };
}

// A base is usually flat (`size 30 30 0`). A flat base is a pad -- one quad -- and a raised one is a box.
function baseMesh(sx, sy, sz) {
    if (sz > 0) return boxMesh(sx, sy, sz);
    const m = emptyMesh();
    addQuad(m, [-sx, -sy, 0], [sx, -sy, 0], [sx, sy, 0], [-sx, sy, 0]);
    return m;
}

// BZFlag's walls are one-sided planes (WallObstacle), so this is a quad and not a solid. makeWalls puts
// four of them at +/-worldSize/2, facing inward, `_wallHeight` tall. The n-sided branch beside it upstream
// sits behind `if (0)` and has for years; we build the four.
function wallMesh(halfBreadth, height) {
    const m = emptyMesh();
    addQuad(m, [0, -halfBreadth, 0], [0, halfBreadth, 0], [0, halfBreadth, height], [0, -halfBreadth, height]);
    return m;
}

function groundMesh(half) {
    const m = emptyMesh();
    addQuad(m, [-half, -half, 0], [half, -half, 0], [half, half, 0], [-half, half, 0]);
    return m;
}

// --- the four walls, as bzfs makes them ------------------------------------------------------------------
// addWall(0, +halfSize, 0, 1.5pi, halfSize, h) and its three rotations. `worldSize` is already the doubled
// value from `world { size N }`, so the walls sit at +/-N.
function makeWalls(world, db) {
    if (world.noWalls) return [];
    const size = world.size, half = size / 2;
    const h = db.eval("_wallHeight");
    const at = (x, y, rot) => ({ type: "wall", pos: [x, y, 0], rotation: rot, size: [0, half, h], driveThrough: false, shootThrough: false, ricochet: false });
    return [
        at(0, half, 1.5 * Math.PI),
        at(half, 0, Math.PI),
        at(0, -half, 0.5 * Math.PI),
        at(-half, 0, 0),
    ];
}

// --- a whole world ----------------------------------------------------------------------------------------
// One indexed mesh, with a `parts` list saying which vertices belong to which obstacle. The renderer wants
// the buffers; the tests want the parts.
const TEAM_COLORS = { 1: [0.85, 0.2, 0.2], 2: [0.2, 0.35, 0.9], 3: [0.9, 0.8, 0.2], 4: [0.25, 0.75, 0.3] };
const TYPE_COLORS = { box: [0.62, 0.55, 0.45], pyramid: [0.45, 0.32, 0.25], teleporter: [0.15, 0.9, 0.75], wall: [0.5, 0.5, 0.55], ground: [0.2, 0.45, 0.2], mesh: [0.52, 0.48, 0.60] };

function obstacleMesh(o) {
    // A mesh's vertices are already in world space -- bzwWorld applies its transform stack at build time --
    // so it comes with its own triangles and `placement` must not touch it. See placedMesh().
    if (o.type === "mesh") return meshTriangles(o);
    if (o.type === "box") return boxMesh(o.size[0], o.size[1], o.size[2]);
    if (o.type === "pyramid") return pyramidMesh(o.size[0], o.size[1], o.size[2], !!o.flipz);
    if (o.type === "base") return baseMesh(o.size[0], o.size[1], o.size[2]);
    if (o.type === "teleporter") return teleporterMesh(o.size[0], o.size[1], o.size[2], o.border).mesh;
    if (o.type === "wall") return wallMesh(o.size[1], o.size[2]);
    return null;
}

function colorOf(o) {
    // v2187 -- a `matref` beats the type's colour. A base's team colour beats even that: a red base drawn
    // in a mapper's brown is a base nobody can find.
    if (o.type === "base") return TEAM_COLORS[o.color] || [0.6, 0.6, 0.6];
    if (Array.isArray(o.color) && o.color.length === 3) return o.color;
    return TYPE_COLORS[o.type] || [0.7, 0.7, 0.7];
}

// A mesh's faces may each point at their own material, so a mesh's colours are per-vertex and not per-part.
// Returns null when nothing on the mesh has a material of its own, and the caller uses one colour for all.
function meshFaceColors(o, fallback) {
    if (!o.faces || !o.faces.some((f) => f.color)) return null;
    const out = [];
    for (const f of o.faces) {
        const c = f.color || fallback;
        for (let k = 0; k < f.v.length; k++) out.push(c[0], c[1], c[2]);
    }
    return out;
}

// `opts.walls` adds the four walls; `opts.ground` adds the floor. Both are off by default, because a test
// that wants to check a box is closed does not want a quad in the way.
function buildWorldMesh(w, opts = {}) {
    const out = { positions: [], normals: [], indices: [], parts: [], colors: [] };
    const list = [...w.obstacles];
    if (opts.walls) list.push(...makeWalls(w.world, w.bzdb));
    if (opts.ground) list.push({ type: "ground", pos: [0, 0, 0], rotation: 0, size: [w.world.size / 2, w.world.size / 2, 0] });

    for (const o of list) {
        const local = o.type === "ground" ? groundMesh(o.size[0]) : obstacleMesh(o);
        if (!local) continue;
        const placed = o.type === "mesh" ? local : transformMesh(local, placement(o));
        const before = out.positions.length / 3;
        mergeMesh(out, placed, { type: o.type, kind: o.kind || null, group: o.group || null, line: o.line || null, material: o.material || null });
        const c = colorOf(o);
        const perFace = o.type === "mesh" ? meshFaceColors(o, c) : null;
        if (perFace && perFace.length === (out.positions.length / 3 - before) * 3) out.colors.push(...perFace);
        else for (let i = before; i < out.positions.length / 3; i++) out.colors.push(c[0], c[1], c[2]);
    }
    return out;
}

// --- what a test can prove -------------------------------------------------------------------------------
// The divergence theorem over a closed, outward-wound surface: V = (1/6) * sum of dot(a, cross(b, c)).
// Negative means the winding is inside out. Zero-ish means it is not a solid.
function signedVolume(m) {
    let v = 0;
    for (let i = 0; i < m.indices.length; i += 3) {
        const a = i0(m, m.indices[i]), b = i0(m, m.indices[i + 1]), c = i0(m, m.indices[i + 2]);
        v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    return v / 6;
}
function i0(m, i) { return [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]; }

// A closed manifold: every undirected edge is shared by exactly two triangles, and every directed edge
// appears exactly once (which is what "consistently wound" means). Vertices are welded by position first,
// because addTri duplicates them for flat normals.
function manifoldCheck(m, eps = 1e-6) {
    const key = (p) => p.map((v) => Math.round(v / eps) * eps).join(",");
    const ids = new Map();
    const vid = [];
    for (let i = 0; i < m.positions.length / 3; i++) {
        const k = key(i0(m, i));
        if (!ids.has(k)) ids.set(k, ids.size);
        vid.push(ids.get(k));
    }
    const directed = new Map(), undirected = new Map();
    for (let i = 0; i < m.indices.length; i += 3) {
        const t = [vid[m.indices[i]], vid[m.indices[i + 1]], vid[m.indices[i + 2]]];
        for (let e = 0; e < 3; e++) {
            const a = t[e], b = t[(e + 1) % 3];
            const d = a + ">" + b, u = Math.min(a, b) + "-" + Math.max(a, b);
            directed.set(d, (directed.get(d) || 0) + 1);
            undirected.set(u, (undirected.get(u) || 0) + 1);
        }
    }
    const boundary = [...undirected.values()].filter((n) => n !== 2).length;
    const doubled = [...directed.values()].filter((n) => n !== 1).length;
    return { closed: boundary === 0, consistent: doubled === 0, boundaryEdges: boundary, doubledEdges: doubled, vertices: ids.size, triangles: m.indices.length / 3 };
}

export {
    emptyMesh, addTri, addQuad, mergeMesh, transformMesh, normalMatrix, placement,
    boxMesh, pyramidMesh, teleporterMesh, baseMesh, wallMesh, groundMesh,
    makeWalls, buildWorldMesh, obstacleMesh, colorOf, meshFaceColors, signedVolume, manifoldCheck,
    TEAM_COLORS, TYPE_COLORS,
};
if (typeof module !== "undefined" && module.exports)
    module.exports = { emptyMesh, addTri, addQuad, mergeMesh, transformMesh, normalMatrix, placement, boxMesh, pyramidMesh, teleporterMesh, baseMesh, wallMesh, groundMesh, makeWalls, buildWorldMesh, obstacleMesh, colorOf, meshFaceColors, signedVolume, manifoldCheck, TEAM_COLORS, TYPE_COLORS };
