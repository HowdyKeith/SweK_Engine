// WebGLEngine/bz/net/bzWorldSections.js — the ten manager sections, walked as far as they can be trusted.
//
// Round after round of this port has been able to check itself against a `.bzw` file on disk. This one
// cannot. A world database arrives from a server we do not have, in a format with no length prefixes and no
// section markers: ten manager sections back to back, each a `uint32` count and then its items, and if you
// misread one item by a single byte, everything after it is plausible garbage. There is no checksum inside,
// no magic between sections, and no way to resynchronise.
//
// So this file does the one thing that is safe: it reads what has been TRANSCRIBED from BZFlag's own
// packers, and where it reaches a record it has not transcribed, it STOPS AND SAYS WHICH ONE.
//
// It does not skip. It cannot skip: a record whose layout you do not know has no length you can compute.
// The temptation to "just advance past the materials" is exactly how a parser starts returning obstacles
// that look almost right, and there is no test in this tree or any other that would catch it.
//
// WHAT IS TRANSCRIBED, from src/game and src/obstacle on the 2.4 branch:
//
//   dynamicColors     name, then FOUR channels, each with a min and a max, three variable-length lists
//                     (sinusoids, clampUps, clampDowns) of three floats each, and a sequence whose two
//                     floats appear ONLY when its count is non-zero    (DynamicColor::unpack)
//   materials         name, mode byte, dynamic-colour index, four RGBA quads, shininess, alpha threshold,
//                     a UBYTE-counted texture list and a UBYTE-counted shader list  (BzMaterial::unpack)
//   textureMatrices   name, state byte, seventeen floats            (TextureMatrix::pack)
//   physicsDrivers    name, linear vec, six floats, death string    (PhysicsDriver::pack)
//   transforms        name, count, per-item: type byte, then an     (MeshTransform::pack)
//                     index int OR a vector (+ a float for spin)
//   links             count, then two strings each                  (LinkManager::pack)
//   waterLevel        a float, and an int material index if >= 0    (WorldInfo::packDatabase)
//   obstacles         wall, box, pyramid, base, teleporter, mesh,
//                     and arc, cone, sphere, tetra                  (each Obstacle::pack)
//   groupInstances    a group def name, THE FAKE STRING (see below), a transform, and a bit-field whose
//                     bits add fields                               (GroupInstance::unpack)
//   groupDefs         a name, ten obstacle lists, and its own group instances -- recursively
//   worldWeapons      a flag abbreviation, an origin, a direction, an initial delay, and a delay list
//   entryZones        a location, then THREE counts and then their three lists -- flags, teams, safety
//
// THE FAKE STRING, read carefully rather than not at all. `GroupInstance::pack` has no field for its
// material map, so it smuggles one inside the instance's NAME. `nboPackStdString` writes a `uint32` length
// and then that many bytes; the packer appends `1 + 4 + 8*count` bytes to the name -- a NUL, an `int32`
// count, and `count` pairs of `int32` -- and lets the length prefix carry them. The reader notices that the
// C string ends before the field does, and reads the tail. It is not a format. It is a length prefix used
// as a smuggling compartment, and once you have seen it, it is eleven lines.
//
// v2199 -- and there is nothing left. `worldWeapons` and `entryZones` are the last two, and with them the
// walk reaches the end of the database and says so by arriving rather than by stopping.
//
// v2199 -- all ten sections are transcribed. A world database now walks from its first byte to its last, and
// `bytesRead === database.length` is the assertion that says so. Nothing is skipped and nothing is guessed.
//
// arc, cone, sphere and tetra arrive as PARAMETERS, not as meshes, which is the good news: bz/bzShapes.js
// and bz/bzMesh.js already generate those shapes from exactly these numbers.

"use strict";

import { Reader } from "./bzPack.js";

// GroupDefinition::ObstacleTypes, in the order the lists are packed.
const OBSTACLE_TYPES = ["wall", "box", "pyramid", "base", "teleporter", "mesh", "arc", "cone", "sphere", "tetra"];

// include/global.h -- map object flags.
const DRIVE_THRU = 1 << 0, SHOOT_THRU = 1 << 1, FLIP_Z = 1 << 2, RICOCHET = 1 << 3;

// MeshTransform::TransformType
const TRANSFORM = { Shift: 0, Scale: 1, Shear: 2, Spin: 3, Index: 4 };

class Stop extends Error {
    constructor(section, reason) { super(`${section}: ${reason}`); this.section = section; this.reason = reason; }
}

// `nboPackStdString` is a uint32 length and then the bytes. No terminator.
function stdString(r) {
    const n = r.u32();
    if (n > 1 << 20) throw new Stop("string", `a ${n}-byte string is not a string`);
    return new TextDecoder().decode(r.raw(n));
}

// --- the records we have transcribed ------------------------------------------------------------------
//
// DynamicColor::unpack. Four channels -- r, g, b, a -- and each one is a min, a max, three variable-length
// lists of three floats, and a sequence. The sequence is the trap: its two floats appear ONLY when its count
// is non-zero, so a channel with no sequence is eight bytes shorter than one with an empty-looking one.
function readChannelList(r, fields) {
    const n = r.u32();
    if (n > 1 << 16) throw new Stop("dynamicColors", `a list of ${n} is not a list`);
    const out = [];
    for (let i = 0; i < n; i++) { const o = {}; for (const f of fields) o[f] = r.f32(); out.push(o); }
    return out;
}
function readDynamicColor(r) {
    const name = stdString(r);
    const channels = [];
    for (let c = 0; c < 4; c++) {
        const ch = { minValue: r.f32(), maxValue: r.f32() };
        ch.sinusoids = readChannelList(r, ["period", "offset", "weight"]);
        ch.clampUps = readChannelList(r, ["period", "offset", "width"]);
        ch.clampDowns = readChannelList(r, ["period", "offset", "width"]);
        const count = r.u32();
        if (count > 1 << 16) throw new Stop("dynamicColors", `a sequence of ${count} is not a sequence`);
        // The two floats are inside the `if (size > 0)`. A zero count means they are not there at all.
        ch.sequence = count > 0 ? { count, period: r.f32(), offset: r.f32(), list: [...r.raw(count)] } : { count: 0 };
        channels.push(ch);
    }
    return { name, channels };
}

// BzMaterial::unpack. Two UBYTE counts, not uint32s: a material may have at most 255 textures and 255
// shaders, and the byte that says how many is a byte.
const MATERIAL_MODE = { noCulling: 1 << 0, noSorting: 1 << 1, noRadar: 1 << 2, noShadow: 1 << 3, occluder: 1 << 4, groupAlpha: 1 << 5, noLighting: 1 << 6 };
const rgba = (r) => [r.f32(), r.f32(), r.f32(), r.f32()];
function readMaterial(r) {
    const name = stdString(r);
    const mode = r.u8();
    const m = {
        name,
        noCulling: !!(mode & MATERIAL_MODE.noCulling), noSorting: !!(mode & MATERIAL_MODE.noSorting),
        noRadar: !!(mode & MATERIAL_MODE.noRadar), noShadow: !!(mode & MATERIAL_MODE.noShadow),
        occluder: !!(mode & MATERIAL_MODE.occluder), groupAlpha: !!(mode & MATERIAL_MODE.groupAlpha),
        noLighting: !!(mode & MATERIAL_MODE.noLighting),
        dynamicColor: r.i32(),
        ambient: rgba(r), diffuse: rgba(r), specular: rgba(r), emission: rgba(r),
        shininess: r.f32(), alphaThreshold: r.f32(),
        textures: [], shaders: [],
    };
    const tCount = r.u8();
    for (let i = 0; i < tCount; i++) {
        const t = { name: stdString(r), matrix: r.i32(), combineMode: r.i32() };
        const st = r.u8();
        t.useAlpha = !!(st & (1 << 0));
        t.useColor = !!(st & (1 << 1));
        t.useSphereMap = !!(st & (1 << 2));
        m.textures.push(t);
    }
    const sCount = r.u8();
    for (let i = 0; i < sCount; i++) m.shaders.push({ name: stdString(r) });
    return m;
}

function readTextureMatrix(r) {
    const name = stdString(r);
    const state = r.u8();
    const f = [];
    for (let i = 0; i < 17; i++) f.push(r.f32());
    return { name, state, floats: f };
}

function readPhysicsDriver(r) {
    const name = stdString(r);
    const linear = r.vec();
    const angularVel = r.f32();
    const angularPos = [r.f32(), r.f32()];
    const radialVel = r.f32();
    const radialPos = [r.f32(), r.f32()];
    const slideTime = r.f32();
    const deathMsg = stdString(r);
    return { name, linear, angularVel, angularPos, radialVel, radialPos, slideTime, deathMsg };
}

function readTransform(r) {
    const name = stdString(r);
    const count = r.u32();
    const ops = [];
    for (let i = 0; i < count; i++) {
        const type = r.u8();
        if (type === TRANSFORM.Index) ops.push({ type, index: r.i32() });
        else {
            const data = r.vec();
            const op = { type, data };
            if (type === TRANSFORM.Spin) op.angle = r.f32();
            ops.push(op);
        }
    }
    return { name, ops };
}

// --- the obstacles -------------------------------------------------------------------------------------
const stateOf = (b) => ({ driveThrough: !!(b & DRIVE_THRU), shootThrough: !!(b & SHOOT_THRU), ricochet: !!(b & RICOCHET) });

function readWall(r) {
    const pos = r.vec(), angle = r.f32(), breadth = r.f32(), height = r.f32(), s = r.u8();
    return { type: "wall", pos, rotation: angle, size: [0, breadth, height], ...stateOf(s) };
}
function readBox(r) {
    const pos = r.vec(), angle = r.f32(), size = r.vec(), s = r.u8();
    return { type: "box", pos, rotation: angle, size, ...stateOf(s) };
}
function readPyramid(r) {
    const pos = r.vec(), angle = r.f32(), size = r.vec(), s = r.u8();
    return { type: "pyramid", pos, rotation: angle, size, ...stateOf(s), flipz: !!(s & FLIP_Z) };
}
function readBase(r) {
    // BaseBuilding::pack packs its TEAM first, and then delegates to BoxBuilding::pack.
    const team = r.u16();
    const b = readBox(r);
    return { ...b, type: "base", color: team, colorValid: team >= 1 && team <= 4 };
}
function readTeleporter(r) {
    const name = stdString(r);
    const pos = r.vec(), angle = r.f32(), size = r.vec(), border = r.f32();
    const horizontal = !!r.u8();
    const s = r.u8();
    return { type: "teleporter", name, pos, rotation: angle, size, border, horizontal, ...stateOf(s),
        outerSize: horizontal ? size.slice() : [size[0], size[1] + border, size[2] + border] };
}

// MeshFace::unpack. Its state byte decides whether normals and texcoords follow the vertex indices, which is
// why a mesh cannot be skipped without being read.
function readMeshFace(r) {
    const s = r.u8();
    const hasNormals = !!(s & (1 << 0)), hasTexcoords = !!(s & (1 << 1));
    const n = r.i32();
    if (n < 0 || n > 1 << 16) throw new Stop("mesh", `a face with ${n} vertices is not a face`);
    const v = [];
    for (let i = 0; i < n; i++) v.push(r.i32());
    const nrm = [];
    if (hasNormals) for (let i = 0; i < n; i++) nrm.push(r.i32());
    const tex = [];
    if (hasTexcoords) for (let i = 0; i < n; i++) tex.push(r.i32());
    const material = r.i32();
    const phydrv = r.i32();
    return {
        v, n: nrm, t: tex, material, phydrv,
        driveThrough: !!(s & (1 << 2)), shootThrough: !!(s & (1 << 3)),
        smoothBounce: !!(s & (1 << 4)), noclusters: !!(s & (1 << 5)), ricochet: !!(s & (1 << 6)),
    };
}

// MeshObstacle::unpack. The texture coordinates are SKIPPED by length -- eight bytes each -- and that skip
// quietly swallows the "hidden drawInfo data" the packer smuggles in as extra texcoords. Reproduced, because
// the reader is what the wire agreed to.
function readMesh(r) {
    const checkCount = r.i32();
    if (checkCount < 0 || checkCount > 1 << 16) throw new Stop("mesh", `${checkCount} check points is not a number of check points`);
    const checkPoints = [];
    for (let i = 0; i < checkCount; i++) {
        const type = r.u8();
        checkPoints.push({ type: type === 0 ? "inside" : "outside", p: r.vec() });
    }
    const vertexCount = r.i32();
    const vertices = [];
    for (let i = 0; i < vertexCount; i++) vertices.push(r.vec());
    const normalCount = r.i32();
    const normals = [];
    for (let i = 0; i < normalCount; i++) normals.push(r.vec());

    const texcoordCount = r.i32();
    r.raw(8 * texcoordCount);                     // skipped by length, drawInfo and all

    const faceSize = r.i32();
    const faces = [];
    for (let i = 0; i < faceSize; i++) faces.push(readMeshFace(r));

    const s = r.u8();
    const mesh = {
        type: "mesh", kind: "mesh", vertices, normals, checkPoints, faces,
        driveThrough: !!(s & (1 << 0)), shootThrough: !!(s & (1 << 1)),
        smoothBounce: !!(s & (1 << 2)), noclusters: !!(s & (1 << 3)),
        drawInfoOwner: !!(s & (1 << 4)), ricochet: !!(s & (1 << 5)),
    };
    return mesh;
}

// v2194 -- the four procedural obstacles. Each begins with an embedded MeshTransform -- which is a name, a
// count, and its ops -- and ends with a run of material indices whose LENGTH DEPENDS ON THE SHAPE. An arc has
// six faces to paint (top, bottom, inside, outside, and two end faces); a cone has four; a sphere has two;
// a tetra has one per face. Get that count wrong and the state byte lands on a material index.
const MATERIAL_SLOTS = { arc: 6, cone: 4, sphere: 2, tetra: 4 };

// The transform embedded in an obstacle is a whole MeshTransform, name and all.
function readEmbeddedTransform(r) { return readTransform(r); }

const shapeState = (b) => ({
    driveThrough: !!(b & (1 << 0)), shootThrough: !!(b & (1 << 1)),
    smoothBounce: !!(b & (1 << 2)), useNormals: !!(b & (1 << 3)),
});
function readMatIndices(r, n) { const out = []; for (let i = 0; i < n; i++) out.push(r.i32()); return out; }

function readArc(r) {
    const transform = readEmbeddedTransform(r);
    const pos = r.vec(), size = r.vec();
    const angle = r.f32(), sweepAngle = r.f32(), ratio = r.f32();
    const divisions = r.i32(), phydrv = r.i32();
    const texsize = [r.f32(), r.f32(), r.f32(), r.f32()];      // four, for an arc
    const materials = readMatIndices(r, MATERIAL_SLOTS.arc);
    const b = r.u8();
    return { type: "arc", kind: "arc", transform, pos, size, rotation: angle, sweepAngle, ratio, divisions, phydrv, texsize, materials, ...shapeState(b), ricochet: !!(b & (1 << 4)) };
}
function readCone(r) {
    const transform = readEmbeddedTransform(r);
    const pos = r.vec(), size = r.vec();
    const angle = r.f32(), sweepAngle = r.f32();               // a cone has no `ratio`
    const divisions = r.i32(), phydrv = r.i32();
    const texsize = [r.f32(), r.f32()];                        // two, for a cone
    const materials = readMatIndices(r, MATERIAL_SLOTS.cone);
    const b = r.u8();
    return { type: "cone", kind: "cone", transform, pos, size, rotation: angle, sweepAngle, divisions, phydrv, texsize, materials, ...shapeState(b), ricochet: !!(b & (1 << 4)) };
}
function readSphere(r) {
    const transform = readEmbeddedTransform(r);
    const pos = r.vec(), size = r.vec();
    const angle = r.f32();                                     // and no sweep at all
    const divisions = r.i32(), phydrv = r.i32();
    const texsize = [r.f32(), r.f32()];
    const materials = readMatIndices(r, MATERIAL_SLOTS.sphere);
    const b = r.u8();
    // A sphere's state byte has one bit nobody else has: `hemisphere`, and it sits where ricochet sits on a
    // cone. Reading a sphere with a cone's bit table would silently turn every dome into a ricochet surface.
    return { type: "sphere", kind: "sphere", transform, pos, size, rotation: angle, divisions, phydrv, texsize, materials,
        ...shapeState(b), hemisphere: !!(b & (1 << 4)), ricochet: !!(b & (1 << 5)) };
}
// TetraBuilding::pack puts its STATE BYTE FIRST, before the transform. It is the only one that does.
function readTetra(r) {
    const b = r.u8();
    const transform = readEmbeddedTransform(r);
    const vertices = [r.vec(), r.vec(), r.vec(), r.vec()];
    const useNormals = r.u8();
    const normals = [];
    for (let v = 0; v < 4; v++) normals.push((useNormals & (1 << v)) ? [r.vec(), r.vec(), r.vec()] : null);
    const useTexcoords = r.u8();
    const texcoords = [];
    for (let v = 0; v < 4; v++) texcoords.push((useTexcoords & (1 << v)) ? [[r.f32(), r.f32()], [r.f32(), r.f32()], [r.f32(), r.f32()]] : null);
    const materials = readMatIndices(r, MATERIAL_SLOTS.tetra);
    return { type: "tetra", kind: "tetra", transform, vertices, normals, texcoords, materials,
        driveThrough: !!(b & (1 << 0)), shootThrough: !!(b & (1 << 1)), ricochet: !!(b & (1 << 2)) };
}

const OBSTACLE_READERS = {
    wall: readWall, box: readBox, pyramid: readPyramid, base: readBase, teleporter: readTeleporter, mesh: readMesh,
    arc: readArc, cone: readCone, sphere: readSphere, tetra: readTetra,
};

// GroupDefinition::pack -- a name, then ten lists, then the nested group instances.
function readGroupDefinition(r) {
    const name = stdString(r);
    const obstacles = [];
    for (const type of OBSTACLE_TYPES) {
        const count = r.u32();
        if (count > 1 << 20) throw new Stop("obstacles", `${count} ${type}s is not a number of ${type}s`);
        const reader = OBSTACLE_READERS[type];
        if (count > 0 && !reader)
            throw new Stop("obstacles", `this world has ${count} ${type}${count === 1 ? "" : "s"}, and \`${type}\` is not transcribed yet`);
        for (let i = 0; i < count; i++) obstacles.push(reader(r));
    }
    const groupCount = r.u32();
    if (groupCount > 1 << 16) throw new Stop("obstacles", `${groupCount} group instances is not a number of them`);
    const instances = [];
    for (let i = 0; i < groupCount; i++) instances.push(readGroupInstance(r));
    return { name, obstacles, instances };
}

// v2198 -- GroupInstance::unpack.
//
// `name` is packed with `nboPackStdString`, so it is a `uint32` length and then that many bytes. If the C
// string ends before the field does -- `strlen(name.c_str()) != name.size()` -- the bytes after the first
// NUL are the material map: an `int32` count and then `count` pairs of `int32`. Everything about that is a
// hack, and the source says so in a comment. Reading it is eleven lines; refusing to read it cost this port
// three rounds of calling it a smuggling route.
function readGroupInstance(r) {
    const groupdef = stdString(r);

    const len = r.u32();
    if (len > 1 << 20) throw new Stop("groupInstances", `a ${len}-byte name is not a name`);
    const raw = r.raw(len);
    let nul = 0;
    while (nul < len && raw[nul] !== 0) nul++;
    const name = new TextDecoder().decode(raw.subarray(0, nul));

    const matMap = [];
    if (nul < len) {
        // The tail begins one byte past the terminator. `nboUseErrorChecking(false)` upstream: a truncated
        // map is silently ignored, so a count that overruns the field is a map that packed nothing.
        const t = new Reader(raw, nul + 1);
        try {
            const count = t.i32();
            if (count >= 0 && count <= (t.left / 8)) for (let i = 0; i < count; i++) matMap.push({ src: t.i32(), dst: t.i32() });
        } catch (e) { /* upstream turns error checking OFF for exactly this read */ }
    }

    const transform = readTransform(r);   // a whole MeshTransform: a name, a count, its ops

    const bits = r.u8();
    const g = {
        groupdef, name, matMap, transform,
        modifyTeam: !!(bits & (1 << 0)), modifyColor: !!(bits & (1 << 1)),
        modifyPhysicsDriver: !!(bits & (1 << 2)), modifyMaterial: !!(bits & (1 << 3)),
        driveThrough: !!(bits & (1 << 4)), shootThrough: !!(bits & (1 << 5)), ricochet: !!(bits & (1 << 6)),
    };
    // Four bits, four optional fields, in this order.
    if (g.modifyTeam) g.team = r.u16();
    if (g.modifyColor) g.tint = [r.f32(), r.f32(), r.f32(), r.f32()];
    if (g.modifyPhysicsDriver) g.phydrv = r.i32();
    if (g.modifyMaterial) g.material = r.i32();
    return g;
}

// v2199 -- WorldWeapons::pack. A world weapon is a turret: a flag type (two bytes of abbreviation, zero
// padded), where it stands, which way it points, how long before its first shot, and the cycle of delays it
// repeats. Nothing fires here; the record is read because the database does not end until it has been.
function readWorldWeapon(r) {
    const flag = flagAbbrev(r);
    const origin = r.vec();
    const direction = r.f32();
    const initDelay = r.f32();
    const n = r.u16();
    if (n > 1 << 12) throw new Stop("worldWeapons", `a delay list of ${n} is not a delay list`);
    const delay = [];
    for (let i = 0; i < n; i++) delay.push(r.f32());
    return { flag, origin, direction, initDelay, delay };
}

// FlagType::pack -- two bytes of the abbreviation, and a zero byte for a flag that has none.
function flagAbbrev(r) {
    const a = r.u8(), b = r.u8();
    let s = "";
    if (a) s += String.fromCharCode(a);
    if (b) s += String.fromCharCode(b);
    return s;
}

// EntryZones::pack. A `WorldFileLocation` -- a position, a size, a rotation -- and then THREE counts before
// any of their three lists. Read one count, read its list, read the next, and everything after is garbage:
// the counts come first, together, and the lists follow in the same order.
function readEntryZone(r) {
    const pos = r.vec(), size = r.vec(), rotation = r.f32();
    const nFlags = r.u16(), nTeams = r.u16(), nSafety = r.u16();
    if (nFlags > 1 << 12 || nTeams > 64 || nSafety > 64) throw new Stop("entryZones", "an entry zone's lists are not lists");
    const flags = [], teams = [], safety = [];
    for (let i = 0; i < nFlags; i++) flags.push(flagAbbrev(r));
    for (let i = 0; i < nTeams; i++) teams.push(r.u16());
    for (let i = 0; i < nSafety; i++) safety.push(r.u16());
    return { pos, size, rotation, flags, teams, safety };
}

// --- the walk -------------------------------------------------------------------------------------------
// Every section, in `WorldInfo::packDatabase`'s order. Returns what it got, and where it stopped.
function walkSections(database) {
    const r = new Reader(database);
    const out = { sections: {}, obstacles: [], instances: [], groupDefs: {}, stopped: null, bytesRead: 0 };

    const countedOrStop = (name, reader) => {
        const count = r.u32();
        if (count > 1 << 20) throw new Stop(name, `a count of ${count} is not a count`);
        if (count > 0 && !reader)
            throw new Stop(name, `this world has ${count} of them, and the record is not transcribed yet`);
        const items = [];
        for (let i = 0; i < count; i++) items.push(reader(r));
        out.sections[name] = items;
        return items;
    };

    try {
        // 1. dynamic colours.
        countedOrStop("dynamicColors", readDynamicColor);
        // 2. texture matrices.
        countedOrStop("textureMatrices", readTextureMatrix);
        // 3. materials. This was the wall until v2194, and it is where almost every real map stopped,
        //    because almost every real map has a material.
        countedOrStop("materials", readMaterial);
        // 4. physics drivers.
        countedOrStop("physicsDrivers", readPhysicsDriver);
        // 5. transforms.
        countedOrStop("transforms", readTransform);

        // 6. obstacles: the world group, then the group definitions. GroupDefinitionMgr::pack.
        const world = readGroupDefinition(r);
        out.obstacles = world.obstacles;
        out.instances = world.instances;
        const defCount = r.u32();
        if (defCount > 1 << 16) throw new Stop("obstacles", `${defCount} group definitions is not a number of them`);
        out.groupDefs = {};
        for (let i = 0; i < defCount; i++) { const d = readGroupDefinition(r); out.groupDefs[d.name] = d; }
        out.sections.obstacles = out.obstacles;
        out.sections.groupInstances = out.instances;
        out.sections.groupDefs = out.groupDefs;

        // 7. links.
        const linkCount = r.u32();
        const links = [];
        for (let i = 0; i < linkCount; i++) links.push({ from: stdString(r), to: stdString(r) });
        out.sections.links = links;

        // 8. water level, and its material index if there is water.
        const waterLevel = r.f32();
        out.sections.waterLevel = waterLevel;
        if (waterLevel >= 0) out.sections.waterMaterial = r.i32();

        // 9. world weapons, and 10. entry zones. The last two, and the end of the database.
        countedOrStop("worldWeapons", readWorldWeapon);
        countedOrStop("entryZones", readEntryZone);

        // The database ends here. If it does not, something above read the wrong number of bytes and the
        // walk that "succeeded" is a walk through somebody else's memory.
        if (r.left !== 0) throw new Stop("end", `${r.left} bytes left over after the last section`);
        out.stopped = null;
    } catch (e) {
        if (e instanceof Stop) out.stopped = { section: e.section, reason: e.reason };
        else out.stopped = { section: "unknown", reason: "ran off the end of the database: " + e.message };
    }

    out.bytesRead = r.at;
    // v2199 -- complete means COMPLETE: every section read, and not one byte left over.
    out.complete = !!out.obstacles.length && out.stopped === null && out.bytesRead === database.length;
    return out;
}

export {
    walkSections, stdString, readDynamicColor, readMaterial, readTextureMatrix, readPhysicsDriver, readTransform,
    readWall, readBox, readPyramid, readBase, readTeleporter, readMesh, readMeshFace, readGroupDefinition,
    readArc, readCone, readSphere, readTetra, readGroupInstance, readWorldWeapon, readEntryZone, flagAbbrev, MATERIAL_SLOTS,
    OBSTACLE_TYPES, OBSTACLE_READERS, TRANSFORM, MATERIAL_MODE, DRIVE_THRU, SHOOT_THRU, FLIP_Z, RICOCHET, Stop,
};
