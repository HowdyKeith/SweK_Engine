// WebGLEngine/bz/net/bzWorldAdapt.js — the world a server sent, in the shape the engine already speaks.
//
// `bz/bzwWorld.js` builds a world from a `.bzw` text file. Everything downstream -- collision, geometry,
// the pilot, the renderer -- takes that shape and nothing else. `bz/net/bzWorldSections.js` reads a world
// out of a server's binary database, in a shape that is *almost* the same and not the same.
//
// This is the twenty lines of difference, and the reason it is worth having: with it, the GPU Brain can
// drive on a map it has never seen. Without it, `brain/bzfsPilot.mjs` needs the server's `.bzw` handed to
// it, and "playing on a server whose map you do not have" is observing.
//
// WHAT THE WIRE GIVES AND THE FILE DOES NOT:
//
//   * THE WALLS. `bzfs::makeWalls` adds four at load, so they are in the database and not in the file. The
//     world's size falls out of them: a wall's `size[1]` is HALF the world, and there are four of them.
//     A `.bzw` says `world { size N }` and means 2N; a database says nothing and shows you the walls.
//   * TELEPORTER NAMES. A `.bzw` may leave them off; `GroupDefinition::makeTeleName` gives every one a
//     `/t<index>` before it packs. So the links that arrive are already resolved names, and `from 0` has
//     already become `/t0:f` -- see bz/bzLinks.js, and the correction it carries.
//
// WHAT THE FILE GIVES AND THE WIRE DOES NOT: `world { name }`, `flagHeight`, `options`, and
// the `.bzw` line number of anything. The database is the map the server is running, not the map somebody
// wrote. Where a field has no answer, this returns the honest one -- null, or the engine's default -- and
// never invents.
//
// arc, cone, sphere and tetra arrive as PARAMETERS. `bz/bzShapes.js` and `bz/bzMesh.js` already turn exactly
// those numbers into meshes, which is what upstream does too: ArcObstacle::makeMesh and its three siblings.

"use strict";

import { makeBZDB } from "../bzdb.js";
import { doLinking } from "../bzLinks.js";
import { makeMeshObstacle } from "../bzMesh.js";
import { buildArc, buildCone, buildSphere } from "../bzShapes.js";
import { identity, mul, apply, shiftM, scaleM, shearM, spinM } from "../bzwWorld.js";
import { TRANSFORM } from "./bzWorldSections.js";

// A wall's `size[1]` is half the world. Four of them, all the same, and the largest is the answer even if a
// map somehow disagrees with itself.
function worldSizeFromWalls(obstacles) {
    let half = 0;
    for (const o of obstacles) if (o.type === "wall" && o.size[1] > half) half = o.size[1];
    return half > 0 ? half * 2 : 800;      // `_worldSize`'s default, if a map has no walls at all
}

// The database's mesh is vertices and faces-by-index. `makeMeshObstacle` wants exactly that, and computes
// the planes, the extents and the box that lets `boundsOf` treat a mesh like anything else.
function adaptMesh(m) {
    const faces = m.faces.map((f) => ({
        v: f.v, n: f.n || [], t: f.t || [],
        driveThrough: !!f.driveThrough, shootThrough: !!f.shootThrough, ricochet: !!f.ricochet,
        material: f.material, phydrv: f.phydrv,
    }));
    const checks = m.checkPoints.map((c) => ({ type: c.type, p: c.p }));
    const o = makeMeshObstacle("mesh", m.vertices, faces, checks, m, { normals: m.normals, line: null });
    o.smoothBounce = !!m.smoothBounce;
    return o;
}

// The four procedural shapes. The database hands over the parameters `bz/bzShapes.js` was written to take;
// it takes them from a parsed `.bzw` block, so we hand it a block-shaped thing. That is the whole trick, and
// it is the reason those generators were written as pure functions of numbers rather than of text.
function fakeBlock(lines) { return { kind: "", lines: lines.map((l) => ({ key: l[0], params: l.slice(1).map(String), line: null })), line: null }; }
const flags = (o) => [
    ...(o.driveThrough ? [["drivethrough"]] : []),
    ...(o.shootThrough ? [["shootthrough"]] : []),
    ...(o.ricochet ? [["ricochet"]] : []),
];

function adaptArc(o, db) {
    const b = fakeBlock([
        ["position", ...o.pos], ["size", ...o.size], ["rotation", o.rotation * 180 / Math.PI],
        ["angle", o.sweepAngle], ["ratio", o.ratio], ["divisions", o.divisions], ...flags(o),
    ]);
    return buildArc(b, db, null);
}
function adaptCone(o, db) {
    const b = fakeBlock([
        ["position", ...o.pos], ["size", ...o.size], ["rotation", o.rotation * 180 / Math.PI],
        ["angle", o.sweepAngle], ["divisions", o.divisions], ...flags(o),
    ]);
    return buildCone(b, db, null);
}
function adaptSphere(o, db) {
    const b = fakeBlock([
        ["position", ...o.pos], ["size", ...o.size], ["rotation", o.rotation * 180 / Math.PI],
        ["divisions", o.divisions], ...(o.hemisphere ? [["hemi"]] : []), ...flags(o),
    ]);
    return buildSphere(b, db, null);
}
// A tetra arrives as four vertices, which is what `bz/bzMesh.js` builds one from. Four faces, wound away
// from the centroid, so every normal points out whatever order the vertices came in.
function adaptTetra(o) {
    const w = o.vertices;
    const centre = [0, 1, 2].map((k) => (w[0][k] + w[1][k] + w[2][k] + w[3][k]) / 4);
    const planeSign = (idx) => {
        const [a, b, c] = idx.map((i) => w[i]);
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        return n[0] * (centre[0] - a[0]) + n[1] * (centre[1] - a[1]) + n[2] * (centre[2] - a[2]);
    };
    const faces = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]].map((idx) => ({
        v: planeSign(idx) > 0 ? [idx[0], idx[2], idx[1]] : idx.slice(),
        n: [], t: [], driveThrough: !!o.driveThrough, shootThrough: !!o.shootThrough, ricochet: !!o.ricochet,
    }));
    const t = makeMeshObstacle("tetra", w, faces, [{ type: "inside", p: centre }], o, { line: null });
    return t;
}

// A `.bzw`-shaped world, from a database-shaped one. `walk` is what `bzWorldSections.walkSections` returned.
// v2198 -- GROUP INSTANCES. A `.bzw` writes `define`/`group`; a database packs the definitions once and an
// instance for each placement. `bz/bzwWorld.js` already expands the text form, and this expands the wire
// form the same way: walk the definition's obstacles, apply the instance's transform, recurse into nested
// instances, and refuse to loop forever.
//
// A `MeshTransform` is a list of ops applied IN ORDER, so each new op left-multiplies. An `Index` op names
// one of the world's named transforms (section five) by position -- which is why they had to be read even
// when nothing used them.
const MAX_GROUP_DEPTH = 12;

function transformMatrix(t, namedTransforms) {
    let m = identity();
    for (const op of (t && t.ops) || []) {
        let x = null;
        if (op.type === TRANSFORM.Shift) x = shiftM(op.data[0], op.data[1], op.data[2]);
        else if (op.type === TRANSFORM.Scale) x = scaleM(op.data[0], op.data[1], op.data[2]);
        else if (op.type === TRANSFORM.Shear) x = shearM(op.data[0], op.data[1], op.data[2]);
        else if (op.type === TRANSFORM.Spin) x = spinM(op.angle, op.data[0], op.data[1], op.data[2]);
        else if (op.type === TRANSFORM.Index) {
            const named = namedTransforms[op.index];
            if (named) x = transformMatrix(named, namedTransforms);
        }
        if (x) m = mul(x, m);
    }
    return m;
}

// A rigid motion -- a shift, a z-spin, a uniform scale -- can be baked into `pos`/`rotation`/`size`, and the
// whole engine then sees one representation. Anything else is kept as a matrix and the obstacle is flagged
// `approx`, exactly as bz/bzwWorld.js does for the text form, and for the same reason: a sheared box is not
// a box.
function rigidZ(m) {
    if (Math.abs(m[2]) > 1e-9 || Math.abs(m[6]) > 1e-9 || Math.abs(m[8]) > 1e-9 || Math.abs(m[9]) > 1e-9) return null;
    const a = m[0], b = m[1], d = m[4], e = m[5], i = m[10];
    const sx = Math.hypot(a, d), sy = Math.hypot(b, e);
    if (sx < 1e-12 || sy < 1e-12 || Math.abs(i) < 1e-12) return null;
    if (Math.abs(sx - sy) > 1e-6 * sx) return null;
    if (Math.abs(a / sx - e / sy) > 1e-6 || Math.abs(d / sx + b / sy) > 1e-6) return null;
    return { angle: Math.atan2(d / sx, a / sx), scale: sx, scaleZ: i };
}

function placeObstacle(o, m) {
    const out = { ...o };
    if (o.type === "mesh") {
        out.vertices = o.vertices.map((v) => apply(m, v));
        out.checkPoints = o.checkPoints.map((c) => ({ type: c.type, p: apply(m, c.p) }));
        return out;
    }
    if (o.type === "arc" || o.type === "cone" || o.type === "sphere" || o.type === "tetra") {
        // These carry their own embedded transform; the instance's composes on top of it.
        out.instanceTransform = o.instanceTransform ? mul(m, o.instanceTransform) : m;
        return out;
    }
    const r = rigidZ(m);
    if (!r) { out.transform = m; out.approx = true; return out; }
    out.pos = apply(m, o.pos);
    out.rotation = (o.rotation || 0) + r.angle;
    out.size = [o.size[0] * r.scale, o.size[1] * r.scale, o.size[2] * r.scaleZ];
    if (o.outerSize) out.outerSize = [o.outerSize[0] * r.scale, o.outerSize[1] * r.scale, o.outerSize[2] * r.scaleZ];
    if (o.border != null) out.border *= r.scale;
    return out;
}

// Expand every instance into obstacles, in world space. Returns the flat list, plus what it refused.
function expandInstances(instances, groupDefs, namedTransforms, depth = 0, seen = new Set(), problems = []) {
    const out = [];
    if (depth > MAX_GROUP_DEPTH) { problems.push("group nesting deeper than " + MAX_GROUP_DEPTH); return { obstacles: out, problems }; }
    for (const inst of instances || []) {
        const def = groupDefs[inst.groupdef];
        if (!def) { problems.push(`group instance names "${inst.groupdef}", which no definition matches`); continue; }
        if (seen.has(inst.groupdef)) { problems.push(`group "${inst.groupdef}" instantiates itself`); continue; }
        const m = transformMatrix(inst.transform, namedTransforms);
        for (const o of def.obstacles) {
            const p = placeObstacle(o, m);
            // A group instance may override what it contains. Only the flags that reach collision are
            // applied; a tint and a material index change what a thing looks like, not what it is.
            if (inst.driveThrough) p.driveThrough = true;
            if (inst.shootThrough) p.shootThrough = true;
            if (inst.ricochet) p.ricochet = true;
            if (inst.modifyTeam && p.type === "base") { p.color = inst.team; p.colorValid = inst.team >= 1 && inst.team <= 4; }
            p.group = inst.groupdef;
            out.push(p);
        }
        const next = new Set(seen); next.add(inst.groupdef);
        const nested = expandInstances(def.instances, groupDefs, namedTransforms, depth + 1, next, problems);
        for (const o of nested.obstacles) out.push(placeObstacle(o, m));
    }
    return { obstacles: out, problems };
}

function adaptWorld(walk, opts = {}) {
    if (!walk || !walk.obstacles || !walk.obstacles.length)
        return { ok: false, reason: walk && walk.stopped ? `the world database stopped at "${walk.stopped.section}": ${walk.stopped.reason}` : "no obstacles in the world database" };

    const db = makeBZDB(opts.bzdb);
    const size = worldSizeFromWalls(walk.obstacles);
    db.set("_worldSize", size);

    // v2198 -- the world group's own obstacles, plus every group instance expanded into world space.
    const namedTransforms = walk.sections.transforms || [];
    const expanded = expandInstances(walk.instances, walk.groupDefs || {}, namedTransforms);
    const all = walk.obstacles.concat(expanded.obstacles);

    const obstacles = [];
    let unsupported = null;
    for (const o of all) {
        switch (o.type) {
            case "wall": break;                     // the walls ARE the boundary; the physics uses world.size
            case "box": case "pyramid": case "base":
                obstacles.push({ ...o, name: null, line: null });
                break;
            case "teleporter":
                // `outerSize` came off the wire already, because `Teleporter::finalize` grows the obstacle.
                obstacles.push({ ...o, line: null });
                break;
            case "mesh": obstacles.push(adaptMesh(o)); break;
            case "arc": { const m = adaptArc(o, db); if (m) obstacles.push(m); break; }
            case "cone": { const m = adaptCone(o, db); if (m) obstacles.push(m); break; }
            case "sphere": { const m = adaptSphere(o, db); if (m) obstacles.push(m); break; }
            case "tetra": obstacles.push(adaptTetra(o)); break;
            default: unsupported = o.type; break;
        }
    }
    if (unsupported) return { ok: false, reason: `the world database has a \`${unsupported}\` and this adapter has no shape for it` };

    const links = (walk.sections.links || []).map((l) => ({ from: l.from, to: l.to, line: null }));
    const teles = obstacles.filter((o) => o.type === "teleporter");
    const linking = doLinking(links, teles);

    return {
        ok: true,
        world: {
            // The database is the map the server is RUNNING, not the map somebody wrote. It has no name and
            // no flagHeight, and this says so rather than making them up.
            name: null, size, flagHeight: null,
            noWalls: !walk.obstacles.some((o) => o.type === "wall"),
            freeCtfSpawns: false,
        },
        obstacles, links, linking,
        // What a group instance asked for and this adapter would not guess at. Empty on a map without groups.
        groupProblems: expanded.problems,
        // v2199 -- entryZones IS section ten, and it is read now. A `.bzw` writes `team 1` as text and this
        // engine keeps it as text; the wire packs a uint16. `spawnZonesFor` compares with `Number()`, so both
        // work -- but a zone from the wire is stringified anyway, so the two sources are indistinguishable
        // downstream. That is the whole point of an adapter.
        zones: (walk.sections.entryZones || []).map((z) => ({
            pos: z.pos, size: z.size, rotation: z.rotation,
            teams: z.teams.map(String), flags: z.flags.slice(), zoneFlags: [], safety: z.safety.map(String),
            line: null,
        })),
        options: [],
        waterLevel: walk.sections.waterLevel != null && walk.sections.waterLevel >= 0 ? walk.sections.waterLevel : null,
        materials: {}, transforms: {},
        // Read, kept, and not simulated -- exactly as the `.bzw` side reports them.
        worldWeapons: walk.sections.worldWeapons || [],
        ignored: [], approx: obstacles.filter((o) => o.approx).length, errors: [], includes: [],
        bzdb: db,
        source: "world database",
    };
}

export { adaptWorld, worldSizeFromWalls, adaptMesh, adaptTetra, expandInstances, transformMatrix, MAX_GROUP_DEPTH };
