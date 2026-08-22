// WebGLEngine/bz/bzwWorld.js — turn parsed .bzw blocks into a world.
//
// The adapter, in the same spirit as ev/esData.js: it reads what it understands, and bz/bzCoverage.js
// says out loud what it does not. Nothing here guesses.
//
// Round one covers the obstacles a classic BZFlag map is made of -- box, pyramid, base, teleporter, link,
// world, waterLevel, zone -- plus `define`/`group` instancing and the transform stack. The mesh family
// (mesh, arc, cone, sphere, tetra, meshbox, meshpyr) and the material family (material, textureMatrix,
// dynamicColor, physics) are not read, and are counted as ignored rather than silently dropped.
//
// Rules from src/bzfs (2.4 branch) that are easy to get wrong, and are pinned in bz/tools/bzw-selfcheck.mjs:
//
//   * `world { size N }` sets the world size to **2N**. CustomWorld::read multiplies by two before it
//     stores it. A map that says `size 400` is 800 units across, and its walls sit at +/-400.
//   * A box with no `size` is `_boxBase` x `_boxBase` x `_boxHeight`, and those are BZDB EXPRESSIONS --
//     `_boxHeight` is the string "6.0*_muzzleHeight". See bz/bzdb.js.
//   * `rot` / `rotation` is in DEGREES in the file and radians everywhere after.
//   * `size` on a box is a HALF-EXTENT in x and y and a FULL height in z: BZFlag builds a box from
//     +/-size[0], +/-size[1], and 0..size[2]. A 30x30 box is 60 units wide.
//   * `passable` is exactly `drivethrough` + `shootthrough`.
//   * A pyramid with a negative z size, or the `flipz` flag, hangs from its apex.
//   * A teleporter's default border is twice its x size, and its default size is derived from three
//     separate BZDB values with three different multipliers.

"use strict";

import { paramsOf, lastParams, hasFlag, nums, words } from "./bzwParse.js";
import { makeBZDB } from "./bzdb.js";
import { buildMesh, buildTetra, buildMeshBox, buildMeshPyr } from "./bzMesh.js";   // v2183 -- the mesh family
import { buildArc, buildCone, buildSphere } from "./bzShapes.js";                  // v2187 -- and the round ones
import { buildFamily, matrefOf, colorOfMaterial } from "./bzMaterial.js";          // v2187 -- the material family
import { doLinking } from "./bzLinks.js";                                          // v2188 -- teleporters that teleport

const DEG = Math.PI / 180;
const MAX_GROUP_DEPTH = 12;   // a group that instantiates itself is a map bug, not a reason to hang

// --- 4x4 transforms, row-major, applied to column vectors ------------------------------------------
function identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mul(a, b) {   // a * b
    const o = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
        o[r * 4 + c] = s;
    }
    return o;
}
function shiftM(x, y, z) { const m = identity(); m[3] = x; m[7] = y; m[11] = z; return m; }
function scaleM(x, y, z) { const m = identity(); m[0] = x; m[5] = y; m[10] = z; return m; }
function shearM(x, y, z) { const m = identity(); m[1] = x; m[2] = y; m[4] = z; return m; }   // BZFlag's shear layout
function spinM(degrees, nx, ny, nz) {
    const len = Math.hypot(nx, ny, nz);
    if (!len) return identity();
    const x = nx / len, y = ny / len, z = nz / len;
    const a = degrees * DEG, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [
        t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
        t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
        0, 0, 0, 1,
    ];
}
function apply(m, p) {
    return [
        m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
        m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
        m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
    ];
}

// The transform lines a location block may carry, in the order they appear. BZFlag appends each to a
// list and applies them in order, so a later `shift` moves what an earlier `scale` produced.
function readTransform(block, xforms) {
    let m = identity();
    let any = false;
    for (const l of block.lines) {
        let t = null;
        if (l.key === "shift") { const v = nums(l.params, 3); if (v) t = shiftM(v[0], v[1], v[2]); }
        else if (l.key === "scale") { const v = nums(l.params, 3); if (v) t = scaleM(v[0], v[1], v[2]); }
        else if (l.key === "shear") { const v = nums(l.params, 3); if (v) t = shearM(v[0], v[1], v[2]); }
        else if (l.key === "spin") { const v = nums(l.params, 4); if (v) t = spinM(v[0], v[1], v[2], v[3]); }
        else if (l.key === "xform") { const name = l.params[0]; const x = xforms && xforms[name]; if (x) t = x; }
        if (t) { m = mul(t, m); any = true; }
    }
    return any ? m : null;
}

// --- the shared location and obstacle properties ----------------------------------------------------
function readLocation(block, def) {
    const pos = nums(lastParams(block, "pos") || lastParams(block, "position"), 3) || [0, 0, 0];
    const size = nums(lastParams(block, "size"), 3) || def.slice();
    const rotRaw = lastParams(block, "rot") || lastParams(block, "rotation");
    const rot = rotRaw ? (parseFloat(rotRaw[0]) || 0) * DEG : 0;   // the file says degrees; we keep radians
    return { pos, size, rotation: rot };
}
function readObstacle(block) {
    const passable = hasFlag(block, "passable");
    return {
        driveThrough: passable || hasFlag(block, "drivethrough"),
        shootThrough: passable || hasFlag(block, "shootthrough"),
        ricochet: hasFlag(block, "ricochet"),
    };
}
function nameOf(block) { const p = lastParams(block, "name"); return p ? p[0] : null; }

// --- the obstacles ------------------------------------------------------------------------------------
function buildBox(block, db) {
    const d = [db.eval("_boxBase"), db.eval("_boxBase"), db.eval("_boxHeight")];
    return { type: "box", name: nameOf(block), ...readLocation(block, d), ...readObstacle(block), line: block.line };
}
function buildPyramid(block, db) {
    const d = [db.eval("_pyrBase"), db.eval("_pyrBase"), db.eval("_pyrHeight")];
    const loc = readLocation(block, d);
    // A negative z size means the same thing as the `flipz` flag: the pyramid hangs from its apex.
    const flipz = hasFlag(block, "flipz") || loc.size[2] < 0;
    loc.size = loc.size.map(Math.abs);
    return { type: "pyramid", name: nameOf(block), ...loc, flipz, ...readObstacle(block), line: block.line };
}
function buildBase(block, db) {
    const d = [db.eval("_baseSize"), db.eval("_baseSize"), 0];
    const colorP = lastParams(block, "color");
    const color = colorP ? parseInt(colorP[0], 10) : 0;
    const onCap = lastParams(block, "oncap");
    return {
        type: "base", name: nameOf(block), ...readLocation(block, d), ...readObstacle(block),
        // CustomBase::read rejects a colour outside 1..4 (CtfTeams). We record it and mark it invalid
        // rather than clamping it into somebody else's team.
        color: Number.isFinite(color) ? color : 0,
        colorValid: Number.isFinite(color) && color >= 1 && color <= 4,
        onCap: onCap ? onCap[0] : null,
        line: block.line,
    };
}
function buildTeleporter(block, db) {
    // Three BZDB values, three different multipliers (CustomGate's constructor).
    const d = [0.5 * db.eval("_teleportWidth"), db.eval("_teleportBreadth"), 2 * db.eval("_teleportHeight")];
    const loc = readLocation(block, d);
    const borderP = lastParams(block, "border");
    const border = borderP && Number.isFinite(parseFloat(borderP[0])) ? parseFloat(borderP[0]) : loc.size[0] * 2;
    const horizontal = hasFlag(block, "horizontal");
    return {
        type: "teleporter", name: block.arg || nameOf(block), ...loc, ...readObstacle(block),
        border, horizontal,
        // v2181 -- Teleporter::finalize grows the obstacle by its border: a vertical teleporter's real
        // breadth is size[1] + border and its real height is size[2] + border. `size` is the HOLE. Round
        // one stored only the hole, so every teleporter under-reported its own extent by a border.
        outerSize: horizontal ? loc.size.slice() : [loc.size[0], loc.size[1] + border, loc.size[2] + border],
        line: block.line,
    };
}
function buildLink(block) {
    const from = lastParams(block, "from"), to = lastParams(block, "to");
    return { type: "link", name: nameOf(block), from: from ? from[0] : null, to: to ? to[0] : null, line: block.line };
}
function buildZone(block) {
    const loc = readLocation(block, [0, 0, 0]);
    return {
        type: "zone", name: nameOf(block), ...loc,
        flags: paramsOf(block, "flag").flatMap((l) => l.params),
        teams: paramsOf(block, "team").flatMap((l) => l.params),
        safety: paramsOf(block, "safety").flatMap((l) => l.params),
        zoneFlags: paramsOf(block, "zoneflag").flatMap((l) => l.params),
        line: block.line,
    };
}

const BUILDERS = { box: buildBox, pyramid: buildPyramid, base: buildBase, teleporter: buildTeleporter, link: buildLink, zone: buildZone };

// v2183 -- the mesh family. A mesh's vertices are put into WORLD space at build time: its own transform
// stack and its group's are applied to them here. So a mesh, unlike a box, never needs the `approx` flag --
// a sheared mesh is exactly a sheared mesh. The transform is passed in rather than baked afterwards.
const MESH_KINDS = new Set(["mesh", "tetra", "meshbox", "meshpyr", "arc", "cone", "sphere"]);
function buildMeshKind(block, db, xform, opts) {
    const local = readTransform(block, opts && opts.xforms);
    const m = xform && local ? mul(xform, local) : (xform || local);
    if (block.kind === "mesh") return buildMesh(block, db, m);
    if (block.kind === "tetra") return buildTetra(block, db, m);
    // v2187 -- arc, cone and sphere are not obstacles of their own upstream either: ArcObstacle,
    // ConeObstacle and SphereObstacle each build a MeshObstacle and hand it over. So do these.
    if (block.kind === "arc") return buildArc(block, db, m);
    if (block.kind === "cone") return buildCone(block, db, m);
    if (block.kind === "sphere") return buildSphere(block, db, m);
    const flags = readObstacle(block);
    if (block.kind === "meshbox") {
        const d = [db.eval("_boxBase"), db.eval("_boxBase"), db.eval("_boxHeight")];
        return buildMeshBox(readLocation(block, d), flags, m, block.line);
    }
    // meshpyr: a pyramid built as a mesh. Its `flipz` and negative-z rule are the pyramid's.
    const d = [db.eval("_pyrBase"), db.eval("_pyrBase"), db.eval("_pyrHeight")];
    const loc = readLocation(block, d);
    const flipz = hasFlag(block, "flipz") || loc.size[2] < 0;
    loc.size = loc.size.map(Math.abs);
    return buildMeshPyr(loc, flags, m, block.line, flipz);
}

// --- the world ------------------------------------------------------------------------------------------
function buildWorld(parsed, opts = {}) {
    const db = makeBZDB(opts.bzdb);
    // v2187 -- the named things, first, because an object may point at one. `transform` is the only member
    // of the family that is genuinely HANDLED: a named transform IS the transform stack, it only needed
    // somewhere to look the name up. The rest are recorded and not simulated, and the coverage report says so.
    const family = buildFamily(parsed);
    if (!opts.xforms) opts = { ...opts, xforms: family.transforms };
    const world = { name: null, size: db.eval("_worldSize"), flagHeight: db.eval("_flagHeight"), noWalls: false, freeCtfSpawns: false };
    const obstacles = [], links = [], zones = [], options = [], ignored = [];
    let waterLevel = null;

    // `world` first: it sets _worldSize, and a box that follows might lean on it.
    for (const b of parsed.blocks) {
        if (b.kind !== "world") continue;
        const n = nameOf(b); if (n) world.name = n;
        const sz = lastParams(b, "size");
        if (sz && Number.isFinite(parseFloat(sz[0]))) {
            // CustomWorld::read: `_size *= 2.0` before it is stored. `size 400` is an 800-unit world.
            world.size = parseFloat(sz[0]) * 2;
            db.set("_worldSize", world.size);
        }
        const fh = lastParams(b, "flagheight");
        if (fh && Number.isFinite(parseFloat(fh[0]))) { world.flagHeight = parseFloat(fh[0]); db.set("_flagHeight", world.flagHeight); }
        world.noWalls = hasFlag(b, "nowalls");
        world.freeCtfSpawns = hasFlag(b, "freectfspawns");
    }

    // These are not obstacles. `buildFamily` has already read them, and the coverage report counts them as
    // handled or recorded. Letting them fall through to `ignored` would have the world report five things it
    // read as five things it did not -- which is precisely the direction a coverage instrument must not lie.
    const NON_OBSTACLE = new Set(["material", "transform", "texturematrix", "dynamiccolor", "physics", "weapon"]);

    const emit = (block, xform, groupName) => {
        if (NON_OBSTACLE.has(block.kind)) return;
        if (MESH_KINDS.has(block.kind)) {
            const mo = buildMeshKind(block, db, xform, opts);
            if (!mo) { ignored.push({ type: block.kind, line: block.line, reason: "not enough vertices" }); return; }
            if (mo.parseErrors) parsed.errors.push(...mo.parseErrors);
            if (groupName) mo.group = groupName;
            attachMaterial(mo, block, family);
            obstacles.push(mo);
            return;
        }
        const build = BUILDERS[block.kind];
        if (!build) { ignored.push({ type: block.kind, line: block.line }); return; }
        const o = build(block, db);
        const local = readTransform(block, opts.xforms);
        const m = xform && local ? mul(xform, local) : (xform || local);
        if (m) bake(o, m);
        if (groupName) o.group = groupName;
        attachMaterial(o, block, family);
        if (o.type === "link") links.push(o);
        else if (o.type === "zone") zones.push(o);
        else obstacles.push(o);
    };

    // `group <name>` instantiates a `define`d block, carrying its own location and transform stack.
    const instantiate = (block, xform, depth, seen) => {
        const def = parsed.defines[block.arg];
        if (!def) { ignored.push({ type: "group", line: block.line, reason: `undefined group "${block.arg}"` }); return; }
        if (depth > MAX_GROUP_DEPTH || seen.has(block.arg)) { ignored.push({ type: "group", line: block.line, reason: "recursive group" }); return; }

        // A group's own block is a location: pos, rot, size, plus a transform stack.
        const loc = readLocation(block, [1, 1, 1]);
        let m = identity();
        m = mul(shiftM(loc.pos[0], loc.pos[1], loc.pos[2]), m);
        if (loc.rotation) m = mul(spinM(loc.rotation / DEG, 0, 0, 1), m);
        const local = readTransform(block, opts.xforms);
        if (local) m = mul(m, local);
        const total = xform ? mul(xform, m) : m;

        const next = new Set(seen); next.add(block.arg);
        for (const inner of def.blocks) {
            if (inner.kind === "group") instantiate(inner, total, depth + 1, next);
            else emit(inner, total, block.arg);
        }
    };

    for (const b of parsed.blocks) {
        if (b.kind === "world") continue;
        if (b.kind === "options") { options.push(...b.lines.map((l) => [l.raw, ...l.params].join(" "))); continue; }
        if (b.kind === "waterlevel") {
            const h = lastParams(b, "height");
            waterLevel = h && Number.isFinite(parseFloat(h[0])) ? parseFloat(h[0]) : 0;
            continue;
        }
        if (b.kind === "group") { instantiate(b, null, 0, new Set()); continue; }
        emit(b, null, null);
    }

    const approx = obstacles.filter((o) => o.approx).length;
    // v2188 -- resolve every link into a destination per teleporter FACE, and fall the rest through to
    // BZFlag's passthru rule: a face with nowhere to go goes to the opposite face of its own teleporter.
    // Which is why `link` could be ignored for eight rounds without anybody noticing a doorway was solid.
    const linking = doLinking(links, obstacles.filter((o) => o.type === "teleporter"));
    return { world, obstacles, links, zones, options, waterLevel, ignored, approx, linking,
        materials: family.materials, transforms: family.transforms,
        textureMatrices: family.textureMatrices, dynamicColors: family.dynamicColors,
        physics: family.physics, weapons: family.weapons,
        errors: parsed.errors, includes: parsed.includes, bzdb: db };
}

// v2182 -- BAKE A RIGID TRANSFORM INTO THE OBSTACLE.
//
// Round one stored a group's transform alongside the obstacle and left `pos` and `rotation` in the group's
// LOCAL frame. Geometry coped, because it applies the transform. Collision did not, because it reads `pos`.
// A tank drove straight through every corridor in arena.bzw, and nothing noticed until something tried to
// drive around in there.
//
// Almost every group in a .bzw is a rigid motion: a `position`, a `rotation` about z, sometimes a uniform
// `scale`. Those we BAKE -- pos, rotation and size move into the world frame and the transform is dropped,
// so every reader downstream sees one representation and cannot disagree about it. A transform that is not
// rigid (a shear, a non-uniform scale, a spin about anything but z) cannot be expressed as pos+rotation, so
// it is KEPT, the obstacle is flagged `approx`, and the world counts it. The geometry of those is exact;
// their collision is the axis-aligned lie of their local box, and saying so is better than not knowing.
function rigidZ(m) {
    // A z-rotation with a uniform scale looks like [c -s 0; s c 0; 0 0 k] with k == scale.
    const [a, b, , , d, e, , , , , i] = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10]];
    if (Math.abs(m[2]) > 1e-9 || Math.abs(m[6]) > 1e-9 || Math.abs(m[8]) > 1e-9 || Math.abs(m[9]) > 1e-9) return null;
    const sx = Math.hypot(a, d), sy = Math.hypot(b, e);
    if (sx < 1e-12 || sy < 1e-12) return null;
    if (Math.abs(sx - sy) > 1e-6 * sx) return null;                       // non-uniform in the plane
    if (Math.abs(i) < 1e-12) return null;
    if (Math.abs((a / sx) - (e / sy)) > 1e-6 || Math.abs((d / sx) + (b / sy)) > 1e-6) return null;   // a shear
    return { angle: Math.atan2(d / sx, a / sx), scale: sx, scaleZ: i, t: [m[3], m[7], m[11]] };
}

function bake(o, m) {
    const r = rigidZ(m);
    if (!r) { o.transform = m; o.approx = true; return; }
    o.pos = apply(m, o.pos);
    o.rotation = (o.rotation || 0) + r.angle;
    o.size = [o.size[0] * r.scale, o.size[1] * r.scale, o.size[2] * r.scaleZ];
    if (o.outerSize) o.outerSize = [o.outerSize[0] * r.scale, o.outerSize[1] * r.scale, o.outerSize[2] * r.scaleZ];
    if (o.border != null) o.border *= r.scale;
}

// An object's `matref`, and a mesh face's. A material that does not exist leaves the colour alone: an
// obstacle keeps the colour its TYPE gives it, because a box pointing at a missing material is a map the
// author got wrong, not a black box.
function attachMaterial(o, block, family) {
    const name = matrefOf(block.lines);
    if (name) {
        o.material = name;
        const c = colorOfMaterial(family.materials, name);
        if (c) o.color = c;
    }
    if (!o.faces) return;
    // A mesh's faces carry their own. bzwParse hands a mesh's lines back flat, so a face's `matref` is
    // reassembled the same way its `vertices` are.
    let inFace = -1, faceRef = null;
    for (const l of block.lines) {
        if (l.key === "face") { inFace++; faceRef = null; continue; }
        if (l.key === "endface") { if (faceRef && o.faces[inFace]) { o.faces[inFace].material = faceRef; const c = colorOfMaterial(family.materials, faceRef); if (c) o.faces[inFace].color = c; } continue; }
        if (inFace >= 0 && l.key === "matref" && l.params[0]) faceRef = l.params[0];
    }
}

// The world's extent, so a caller can frame a camera and a test can check a map fits inside its walls.
function boundsOf(w) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const o of w.obstacles) {
        if (o.extents) {   // a mesh: its vertices are already in world space, and they are the answer
            for (let k = 0; k < 3; k++) { if (o.extents.lo[k] < lo[k]) lo[k] = o.extents.lo[k]; if (o.extents.hi[k] > hi[k]) hi[k] = o.extents.hi[k]; }
            continue;
        }
        // A teleporter's true extent includes its border (Teleporter::finalize); everything else is `size`.
        const ext = o.outerSize || o.size;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            // A box's `size` is a half-extent in x and y, and a full height in z.
            const c = Math.cos(o.rotation || 0), s = Math.sin(o.rotation || 0);
            const dx = sx * ext[0], dy = sy * ext[1];
            for (const z of [0, ext[2]]) {
                let p = [o.pos[0] + dx * c - dy * s, o.pos[1] + dx * s + dy * c, o.pos[2] + z];
                if (o.transform) p = apply(o.transform, p);
                for (let i = 0; i < 3; i++) { if (p[i] < lo[i]) lo[i] = p[i]; if (p[i] > hi[i]) hi[i] = p[i]; }
            }
        }
    }
    return { lo, hi };
}

export { buildWorld, boundsOf, identity, mul, apply, shiftM, scaleM, shearM, spinM, MAX_GROUP_DEPTH };
if (typeof module !== "undefined" && module.exports)
    module.exports = { buildWorld, boundsOf, identity, mul, apply, shiftM, scaleM, shearM, spinM, MAX_GROUP_DEPTH };
