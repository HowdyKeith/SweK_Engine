// WebGLEngine/bz/bzShapes.js — arc, cone and sphere.
//
// Round seven. The last three object types in the .bzw format, and they are not obstacles of their own:
// upstream they are `ArcObstacle`, `ConeObstacle` and `SphereObstacle`, each of which builds a MeshObstacle
// and hands it over. So do these. Round four built the pipeline; this is what pours into it.
//
// THE VERTICES ARE BZFLAG'S, EXACTLY. Every angle, radius, height and check point below is transcribed
// from src/obstacle/{ArcObstacle,ConeObstacle,SphereObstacle}.cxx on the 2.4 branch, including the ones
// that look like mistakes and are not:
//
//   * a sphere with `divisions 1` is an OCTAHEDRON. Ring i has 4(i+1) vertices at a vertical angle of
//     (pi/2)(divisions-i-1)/divisions, so one division puts four of them on the equator and two at the
//     poles. Its volume is exactly (4/3)*a*b*c, and bz/tools/bz-shapes-selfcheck.mjs asserts that number.
//   * a `cone` or `arc` that does not sweep a full circle puts its CHECK POINT off-centre -- a quarter of
//     the way along the mid-direction for a cone, half for an arc -- because the centre of a wedge's
//     bounding box is not inside the wedge. Get that wrong and `containsPoint` answers false for the whole
//     solid, and a tank drives through it.
//   * `ratio` is not an inner radius. The inner radius is `size[0] * (1 - ratio)`, so the DEFAULT of 1.0
//     means a solid pie, and 0 would mean a hoop of zero thickness.
//
// THE TRIANGULATION IS OURS, and equivalent. Upstream lays out `8*divisions^2` sphere faces by an index
// scheme that is a page of arithmetic; the surface it describes is the surface these vertices describe, and
// a mesh collides and contains by its surface. So the faces here are generated rather than transcribed, and
// the selfcheck proves what matters instead of what was typed: closed, outward-wound, and enclosing exactly
// the volume the polygon arithmetic says. A twelve-sided cone is not "about" a third of pi*a*b*h. It is
// exactly (1/3) * (1/2) * 12 * sin(2pi/12) * a * b * h, and the test says so to nine decimal places.

"use strict";

import { lastParams, hasFlag, nums } from "./bzwParse.js";
import { makeMeshObstacle } from "./bzMesh.js";
import { apply, identity } from "./bzwWorld.js";

const DEG = Math.PI / 180;
const MIN_SIZE = 1e-6;

// `divisions` defaults to 16, and to 4 for the box/pyramid forms (`meshbox`, `meshpyr`), which do not use
// it. `angle` is a SWEEP in degrees and defaults to a full circle; the object's `rotation` is where the
// sweep starts.
function readShape(block, defaultSize) {
    const pos = nums(lastParams(block, "pos") || lastParams(block, "position"), 3) || [0, 0, 0];
    const size = (nums(lastParams(block, "size"), 3) || defaultSize).map(Math.abs);
    const rotRaw = lastParams(block, "rot") || lastParams(block, "rotation");
    const rotation = rotRaw ? (parseFloat(rotRaw[0]) || 0) * DEG : 0;
    const dv = lastParams(block, "divisions");
    const sw = lastParams(block, "angle");
    const ra = lastParams(block, "ratio");
    const passable = hasFlag(block, "passable");
    return {
        pos, size, rotation,
        divisions: dv && Number.isFinite(parseInt(dv[0], 10)) ? Math.trunc(parseInt(dv[0], 10)) : 16,
        sweep: sw && Number.isFinite(parseFloat(sw[0])) ? parseFloat(sw[0]) : 360,
        ratio: ra && Number.isFinite(parseFloat(ra[0])) ? parseFloat(ra[0]) : 1.0,
        flipz: hasFlag(block, "flipz"),
        flags: {
            driveThrough: passable || hasFlag(block, "drivethrough"),
            shootThrough: passable || hasFlag(block, "shootthrough"),
            ricochet: hasFlag(block, "ricochet"),
        },
    };
}

// A sweep is clamped to +/-360 and, if negative, reversed: the start angle moves and the sweep is made
// positive. A sweep whose magnitude is a whole number of turns is a closed circle, and its last vertex is
// its first.
function normalizeSweep(rotation, sweepDeg) {
    let a = Math.max(-360, Math.min(360, sweepDeg)) * DEG;
    let r = rotation;
    if (a < 0) { r += a; a = -a; }
    const isCircle = Math.abs(Math.PI - (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) < MIN_SIZE;
    return { start: r, sweep: a, isCircle };
}

// --- cone ---------------------------------------------------------------------------------------------
// An elliptical base at `pos.z`, an apex at `pos.z + size[2]`. `flipz` stands it on its point.
function buildCone(block, db, xform) {
    const s = readShape(block, [db.eval("_pyrBase"), db.eval("_pyrBase"), db.eval("_pyrHeight")]);
    const { start, sweep, isCircle } = normalizeSweep(s.rotation, s.sweep);
    if (s.divisions <= Math.trunc((sweep + MIN_SIZE) / Math.PI)) return null;   // too few to close the sweep
    if (s.size.some((v) => v < MIN_SIZE)) return null;

    const m = xform || identity();
    const n = s.divisions;
    const [sx, sy, sz] = s.size;
    const zb = s.flipz ? sz : 0, za = s.flipz ? 0 : sz;

    const rim = [];
    const count = isCircle ? n : n + 1;
    for (let i = 0; i < count; i++) {
        const ang = start + (sweep / n) * i;
        rim.push([s.pos[0] + Math.cos(ang) * sx, s.pos[1] + Math.sin(ang) * sy, s.pos[2] + zb]);
    }
    const baseC = [s.pos[0], s.pos[1], s.pos[2] + zb];
    const apex = [s.pos[0], s.pos[1], s.pos[2] + za];

    const verts = [...rim, baseC, apex];
    const iBase = rim.length, iApex = rim.length + 1;
    const faces = [];
    const wind = s.flipz ? (a, b, c) => [a, c, b] : (a, b, c) => [a, b, c];
    for (let i = 0; i + 1 < count || (isCircle && i < count); i++) {
        const j = (i + 1) % count;
        if (!isCircle && j === 0) break;
        faces.push({ v: wind(iBase, j, i) });    // the base, facing down
        faces.push({ v: wind(i, j, iApex) });    // the flank, facing out
    }
    if (!isCircle) {
        // A wedge has two flat sides, from the base centre to the apex.
        faces.push({ v: wind(iBase, 0, iApex) });
        faces.push({ v: wind(count - 1, iBase, iApex) });
    }

    // A wedge's bounding-box centre is not inside it, so the check point moves.
    const check = isCircle
        ? [s.pos[0], s.pos[1], s.pos[2] + 0.5 * sz]
        : (() => { const dir = start + 0.5 * sweep; return [s.pos[0] + Math.cos(dir) * sx * 0.25, s.pos[1] + Math.sin(dir) * sy * 0.25, s.pos[2] + 0.5 * sz]; })();

    return finish("cone", verts, faces, check, s, m, block.line);
}

// --- arc ----------------------------------------------------------------------------------------------
// A ring segment, or a pie if `ratio` is 1. Inner radius = size[0] * (1 - ratio); the y radius is scaled by
// the same `squish = size[1] / size[0]`, so an arc is elliptical in exactly the way a cone is.
function buildArc(block, db, xform) {
    const s = readShape(block, [db.eval("_boxBase"), db.eval("_boxBase"), db.eval("_boxHeight")]);
    const { start, sweep, isCircle } = normalizeSweep(s.rotation, s.sweep);
    if (s.divisions <= Math.trunc((sweep + MIN_SIZE) / Math.PI)) return null;
    if (s.ratio < 0 || s.ratio > 1) return null;

    let inrad = s.size[0] * (1 - s.ratio), outrad = s.size[0];
    if (inrad > outrad) { const t = inrad; inrad = outrad; outrad = t; }
    if (outrad < MIN_SIZE || outrad - inrad < MIN_SIZE) return null;
    const isPie = inrad < MIN_SIZE;
    const squish = s.size[1] / s.size[0];
    const h = s.size[2];

    const m = xform || identity();
    const n = s.divisions;
    const count = isCircle ? n : n + 1;
    const ring = (rad, z) => {
        const out = [];
        for (let i = 0; i < count; i++) {
            const ang = start + (sweep / n) * i;
            out.push([s.pos[0] + Math.cos(ang) * rad, s.pos[1] + Math.sin(ang) * rad * squish, s.pos[2] + z]);
        }
        return out;
    };

    const verts = [], faces = [];
    const quad = (a, b, c, d) => faces.push({ v: [a, b, c, d] });

    if (isPie) {
        const bot = ring(outrad, 0), top = ring(outrad, h);
        const cb = verts.push(...bot, ...top, [s.pos[0], s.pos[1], s.pos[2]], [s.pos[0], s.pos[1], s.pos[2] + h]) - 2;
        const ct = cb + 1;
        for (let i = 0; i < (isCircle ? count : count - 1); i++) {
            const j = (i + 1) % count;
            faces.push({ v: [cb, j, i] });                            // bottom, facing down
            faces.push({ v: [ct, count + i, count + j] });            // top, facing up
            quad(i, j, count + j, count + i);                         // the outer wall
        }
        if (!isCircle) {
            quad(cb, 0, count + 0, ct);
            quad(count - 1, cb, ct, count + count - 1);
        }
    } else {
        const ob = ring(outrad, 0), ot = ring(outrad, h), ib = ring(inrad, 0), it = ring(inrad, h);
        verts.push(...ob, ...ot, ...ib, ...it);
        const OB = 0, OT = count, IB = 2 * count, IT = 3 * count;
        for (let i = 0; i < (isCircle ? count : count - 1); i++) {
            const j = (i + 1) % count;
            quad(OB + i, OB + j, OT + j, OT + i);                     // outer wall
            quad(IT + i, IT + j, IB + j, IB + i);                     // inner wall, facing in
            quad(OT + i, OT + j, IT + j, IT + i);                     // the top
            quad(IB + i, IB + j, OB + j, OB + i);                     // the bottom
        }
        if (!isCircle) {
            // The two end caps. Their winding is forced by the faces they share an edge with: the bottom
            // face runs ob->ib along the start, so the cap must run ib->ob, or the two disagree about which
            // side is out. manifoldCheck calls that a doubled directed edge, and it caught exactly this.
            quad(OT, IT, IB, OB);
            quad(IT + count - 1, OT + count - 1, OB + count - 1, IB + count - 1);
        }
    }

    // THE CHECK POINT MUST BE INSIDE THE SOLID, and for a ring that is not the centre and not half the outer
    // radius: both of those are in the hole. `containsPoint` casts a ray from the query point AT the check
    // point and calls the query point inside if the ray crosses no face -- so a check point sitting in a
    // ring's hole makes the whole world "inside" it, because a quarter-ring's hole is not enclosed at all.
    // The first draft put a pie's `radius * 0.5` on a ring, and every tank in arena.bzw was inside an arch
    // in Sussex. Mid-wall it is.
    const r = isPie ? 0.5 * outrad : 0.5 * (inrad + outrad);
    const dir = isCircle ? start : start + 0.5 * sweep;
    const check = [s.pos[0] + Math.cos(dir) * r, s.pos[1] + Math.sin(dir) * r * squish, s.pos[2] + 0.5 * h];
    if (isCircle && isPie) { check[0] = s.pos[0]; check[1] = s.pos[1]; }   // a full pie's axis is inside it

    return finish("arc", verts, faces, check, s, m, block.line);
}

// --- sphere -------------------------------------------------------------------------------------------
// An octahedron, subdivided. Ring i (0-based, from the top) has 4(i+1) vertices at a vertical angle of
// (pi/2)(divisions-i-1)/divisions, so `divisions 1` really is an octahedron and `divisions 4` -- the
// default -- is 128 triangles. A `hemi` keeps the top half and closes it with a disc.
function buildSphere(block, db, xform) {
    const s = readShape(block, [db.eval("_boxBase"), db.eval("_boxBase"), db.eval("_boxBase")]);
    const rad = lastParams(block, "radius");
    if (rad && Number.isFinite(parseFloat(rad[0]))) { const r = Math.abs(parseFloat(rad[0])); s.size = [r, r, r]; }
    const hemi = hasFlag(block, "hemi") || hasFlag(block, "hemisphere");
    if (s.divisions < 1 || s.size.some((v) => v < MIN_SIZE)) return null;

    const m = xform || identity();
    const D = s.divisions;
    const [sx, sy, sz] = s.size;
    const P = s.pos;

    // The top pole, then ring 0 .. ring D-1. Ring D-1 is the equator (v_angle 0).
    const verts = [[P[0], P[1], P[2] + sz]];
    const ringStart = [];
    for (let i = 0; i < D; i++) {
        ringStart.push(verts.length);
        const cnt = 4 * (i + 1);
        const va = (Math.PI / 2) * (D - i - 1) / D;
        for (let j = 0; j < cnt; j++) {
            const ha = (Math.PI * 2) * j / cnt + s.rotation;
            verts.push([P[0] + sx * Math.cos(ha) * Math.cos(va), P[1] + sy * Math.sin(ha) * Math.cos(va), P[2] + sz * Math.sin(va)]);
        }
    }

    const faces = [];
    // The cap: the pole to ring 0 (four vertices).
    for (let j = 0; j < 4; j++) faces.push({ v: [0, ringStart[0] + j, ringStart[0] + (j + 1) % 4] });
    // Between rings. Ring i has 4(i+1) vertices and ring i+1 has 4(i+2): each of the four octants gains one.
    for (let i = 0; i + 1 < D; i++) {
        stitch(faces, ringStart[i], 4 * (i + 1), ringStart[i + 1], 4 * (i + 2), false);
    }

    const eq = ringStart[D - 1], eqN = 4 * D;
    if (hemi) {
        // Close the bottom with a disc, facing down.
        const c = verts.push([P[0], P[1], P[2]]) - 1;
        for (let j = 0; j < eqN; j++) faces.push({ v: [c, eq + (j + 1) % eqN, eq + j] });
    } else {
        // Mirror everything below the equator.
        const mirrorOf = new Map();
        const lower = [];
        for (let i = D - 2; i >= 0; i--) {
            const st = verts.length;
            const cnt = 4 * (i + 1);
            for (let j = 0; j < cnt; j++) { const v = verts[ringStart[i] + j]; verts.push([v[0], v[1], 2 * P[2] - v[2]]); }
            lower.push({ start: st, count: cnt });
        }
        const bottom = verts.push([P[0], P[1], P[2] - sz]) - 1;
        let prevStart = eq, prevCount = eqN;
        for (const r of lower) { stitch(faces, r.start, r.count, prevStart, prevCount, true); prevStart = r.start; prevCount = r.count; }
        for (let j = 0; j < 4; j++) faces.push({ v: [bottom, prevStart + (j + 1) % 4, prevStart + j] });
        void mirrorOf;
    }

    const check = [P[0], P[1], hemi ? P[2] + 0.5 * sz : P[2]];
    return finish("sphere", verts, faces, check, s, m, block.line);
}

// Sew a ring of `an` vertices to a ring of `bn`, where bn = an + 4: one extra vertex per octant. Walk both
// rings together, and where the larger ring runs ahead, spend the extra vertex on a fan triangle. This is
// the standard octahedral stitch; upstream writes the same surface with a page of index arithmetic.
// `flip` reverses the winding, for the mirrored lower half.
function stitch(faces, aStart, an, bStart, bn, flip) {
    const p = an / 4, q = bn / 4;                 // q === p + 1: one extra vertex per octant
    const push = (x, y, z) => faces.push({ v: flip ? [x, z, y] : [x, y, z] });
    for (let o = 0; o < 4; o++) {
        for (let k = 0; k < q; k++) {
            const b0 = bStart + (o * q + k) % bn;
            const b1 = bStart + (o * q + k + 1) % bn;
            // At k === p the smaller ring has run out and `a0` wraps onto the next octant's corner, which
            // is the vertex the two octants share. That is the extra triangle the subdivision pays for.
            const a0 = aStart + (o * p + Math.min(k, p)) % an;
            push(a0, b0, b1);
            if (k < p) push(a0, b1, aStart + (o * p + k + 1) % an);
        }
    }
}

function finish(kind, verts, faces, check, s, m, line) {
    const w = verts.map((v) => apply(m, v));
    const f = faces.map((x) => ({ ...x, n: [], t: [], ...s.flags }));
    const o = makeMeshObstacle(kind, w, f, [{ type: "inside", p: apply(m, check) }], s.flags, { line });
    o.divisions = s.divisions;
    return o;
}

export { buildArc, buildCone, buildSphere, readShape, normalizeSweep, MIN_SIZE };
if (typeof module !== "undefined" && module.exports)
    module.exports = { buildArc, buildCone, buildSphere, readShape, normalizeSweep, MIN_SIZE };
