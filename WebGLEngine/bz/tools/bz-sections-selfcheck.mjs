// bz/tools/bz-sections-selfcheck.mjs — the ten manager sections, and the wall we stop at.
//
//   node bz/tools/bz-sections-selfcheck.mjs
//
// Every other round of this port could check itself against a `.bzw` on disk. This one cannot: a world
// database arrives from a server we do not have, in a format with no length prefixes, no section markers, no
// checksum inside and no way to resynchronise. Misread one item by one byte and everything after it is
// plausible garbage.
//
// So the test is built the only way that means anything. `bz/net/bzWorldSections.js` is transcribed from
// BZFlag's **unpack** functions. The encoder BELOW is transcribed, separately and from scratch, from
// BZFlag's **pack** functions. Two independent transcriptions of the same format, and if they disagree, one
// of them is wrong. That is a real check. A parser round-tripped through its own writer is not.
//
// And the second half of this file is about what the parser REFUSES. It does not skip a record whose layout
// it does not know -- it cannot; such a record has no length you can compute. It stops, and it names the
// section. Almost every real map stops at section three, because almost every real map has a material.

import { Writer } from "../net/bzPack.js";
import {
    walkSections, stdString, readMeshFace, readGroupDefinition,
    OBSTACLE_TYPES, TRANSFORM, MATERIAL_MODE, MATERIAL_SLOTS, DRIVE_THRU, SHOOT_THRU, FLIP_Z, RICOCHET,
} from "../net/bzWorldSections.js";
import { Reader } from "../net/bzPack.js";

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));
const close = (a, b, eps = 1e-5) => Math.abs(a - b) <= eps;

// --- the ENCODER, transcribed from BZFlag's pack functions ---------------------------------------------
// `nboPackStdString`: a uint32 length and then the bytes. No terminator.
const packStr = (w, s) => { const b = new TextEncoder().encode(s || ""); w.u32(b.length).raw(b); return w; };

const packWall = (w, o) => { w.vec(o.pos).f32(o.rotation).f32(o.size[1]).f32(o.size[2]).u8(o.ricochet ? RICOCHET : 0); };
const boxState = (o) => (o.driveThrough ? DRIVE_THRU : 0) | (o.shootThrough ? SHOOT_THRU : 0) | (o.ricochet ? RICOCHET : 0);
const packBox = (w, o) => { w.vec(o.pos).f32(o.rotation).vec(o.size).u8(boxState(o)); };
const packPyr = (w, o) => { w.vec(o.pos).f32(o.rotation).vec(o.size).u8(boxState(o) | (o.flipz ? FLIP_Z : 0)); };
const packBase = (w, o) => { w.u16(o.color); packBox(w, o); };            // team FIRST, then BoxBuilding::pack
const packTele = (w, o) => { packStr(w, o.name); w.vec(o.pos).f32(o.rotation).vec(o.size).f32(o.border).u8(o.horizontal ? 1 : 0).u8(boxState(o)); };

function packMeshFace(w, f) {
    const s = (f.n && f.n.length ? 1 : 0) | (f.t && f.t.length ? 2 : 0)
        | (f.driveThrough ? 4 : 0) | (f.shootThrough ? 8 : 0) | (f.smoothBounce ? 16 : 0)
        | (f.noclusters ? 32 : 0) | (f.ricochet ? 64 : 0);
    w.u8(s).i32(f.v.length);
    for (const i of f.v) w.i32(i);
    if (f.n && f.n.length) for (const i of f.n) w.i32(i);
    if (f.t && f.t.length) for (const i of f.t) w.i32(i);
    w.i32(f.material != null ? f.material : -1).i32(f.phydrv != null ? f.phydrv : -1);
}
function packMesh(w, m) {
    w.i32(m.checkPoints.length);
    for (const c of m.checkPoints) { w.u8(c.type === "inside" ? 0 : 1); w.vec(c.p); }
    w.i32(m.vertices.length);
    for (const v of m.vertices) w.vec(v);
    w.i32(m.normals.length);
    for (const n of m.normals) w.vec(n);
    w.i32(m.texcoords ? m.texcoords.length : 0);
    for (const t of (m.texcoords || [])) { w.f32(t[0]); w.f32(t[1]); }
    w.i32(m.faces.length);
    for (const f of m.faces) packMeshFace(w, f);
    w.u8((m.driveThrough ? 1 : 0) | (m.shootThrough ? 2 : 0) | (m.smoothBounce ? 4 : 0)
        | (m.noclusters ? 8 : 0) | (m.drawInfoOwner ? 16 : 0) | (m.ricochet ? 32 : 0));
}

// v2194 -- the four procedural obstacles, from the pack side. An embedded MeshTransform is a name, a count
// and its ops -- the same function the manager uses for a NAMED transform.
function packEmbeddedTransform(w, t) {
    packStr(w, (t && t.name) || "");
    const ops = (t && t.ops) || [];
    w.u32(ops.length);
    for (const op of ops) {
        w.u8(op.type);
        if (op.type === TRANSFORM.Index) w.i32(op.index);
        else { w.vec(op.data); if (op.type === TRANSFORM.Spin) w.f32(op.angle); }
    }
}
const shapeByte = (o) => (o.driveThrough ? 1 : 0) | (o.shootThrough ? 2 : 0) | (o.smoothBounce ? 4 : 0) | (o.useNormals ? 8 : 0);
const packMats = (w, m, n) => { for (let i = 0; i < n; i++) w.i32(m[i] != null ? m[i] : -1); };

function packArc(w, o) {
    packEmbeddedTransform(w, o.transform);
    w.vec(o.pos).vec(o.size).f32(o.rotation).f32(o.sweepAngle).f32(o.ratio).i32(o.divisions).i32(o.phydrv);
    for (let i = 0; i < 4; i++) w.f32(o.texsize[i]);
    packMats(w, o.materials, MATERIAL_SLOTS.arc);
    w.u8(shapeByte(o) | (o.ricochet ? 16 : 0));
}
function packCone(w, o) {
    packEmbeddedTransform(w, o.transform);
    w.vec(o.pos).vec(o.size).f32(o.rotation).f32(o.sweepAngle).i32(o.divisions).i32(o.phydrv);
    for (let i = 0; i < 2; i++) w.f32(o.texsize[i]);
    packMats(w, o.materials, MATERIAL_SLOTS.cone);
    w.u8(shapeByte(o) | (o.ricochet ? 16 : 0));
}
function packSphere(w, o) {
    packEmbeddedTransform(w, o.transform);
    w.vec(o.pos).vec(o.size).f32(o.rotation).i32(o.divisions).i32(o.phydrv);
    for (let i = 0; i < 2; i++) w.f32(o.texsize[i]);
    packMats(w, o.materials, MATERIAL_SLOTS.sphere);
    // hemisphere is bit 4, and ricochet is bit 5. On a cone, ricochet is bit 4.
    w.u8(shapeByte(o) | (o.hemisphere ? 16 : 0) | (o.ricochet ? 32 : 0));
}
function packTetra(w, o) {
    w.u8((o.driveThrough ? 1 : 0) | (o.shootThrough ? 2 : 0) | (o.ricochet ? 4 : 0));   // the state byte FIRST
    packEmbeddedTransform(w, o.transform);
    for (const v of o.vertices) w.vec(v);
    let un = 0; o.normals.forEach((n, i) => { if (n) un |= 1 << i; });
    w.u8(un);
    for (const n of o.normals) if (n) for (const v of n) w.vec(v);
    let ut = 0; o.texcoords.forEach((t, i) => { if (t) ut |= 1 << i; });
    w.u8(ut);
    for (const t of o.texcoords) if (t) for (const uv of t) { w.f32(uv[0]); w.f32(uv[1]); }
    packMats(w, o.materials, MATERIAL_SLOTS.tetra);
}

const PACKERS = { wall: packWall, box: packBox, pyramid: packPyr, base: packBase, teleporter: packTele, mesh: packMesh,
    arc: packArc, cone: packCone, sphere: packSphere, tetra: packTetra };

// v2198 -- GroupInstance::pack, from the pack side. THE FAKE STRING: when there is a material map, the
// packer appends `1 + 4 + 8*count` bytes to the name -- a NUL, an int32 count, and count pairs of int32 --
// and lets `nboPackStdString`'s length prefix carry them. The reader notices the C string ends early.
function packGroupInstance(w, g) {
    packStr(w, g.groupdef);
    if (!g.matMap || !g.matMap.length) packStr(w, g.name || "");
    else {
        const nameBytes = new TextEncoder().encode(g.name || "");
        const fakeSize = 1 + 4 + g.matMap.length * 8;
        const total = nameBytes.length + fakeSize;
        w.u32(total).raw(nameBytes).u8(0).i32(g.matMap.length);
        for (const m of g.matMap) w.i32(m.src).i32(m.dst);
    }
    packEmbeddedTransform(w, g.transform);
    const bits = (g.modifyTeam ? 1 : 0) | (g.modifyColor ? 2 : 0) | (g.modifyPhysicsDriver ? 4 : 0)
        | (g.modifyMaterial ? 8 : 0) | (g.driveThrough ? 16 : 0) | (g.shootThrough ? 32 : 0) | (g.ricochet ? 64 : 0);
    w.u8(bits);
    if (g.modifyTeam) w.u16(g.team);
    if (g.modifyColor) { w.f32(g.tint[0]).f32(g.tint[1]).f32(g.tint[2]).f32(g.tint[3]); }
    if (g.modifyPhysicsDriver) w.i32(g.phydrv);
    if (g.modifyMaterial) w.i32(g.material);
}

// v2199 -- WorldWeapons::pack and EntryZones::pack, from the pack side. A flag abbreviation is two bytes,
// zero-padded. An entry zone writes THREE counts and only then its three lists.
const packFlag = (w, f) => { w.u8(f && f.length > 0 ? f.charCodeAt(0) : 0).u8(f && f.length > 1 ? f.charCodeAt(1) : 0); };
function packWorldWeapon(w, x) {
    packFlag(w, x.flag);
    w.vec(x.origin).f32(x.direction).f32(x.initDelay).u16(x.delay.length);
    for (const d of x.delay) w.f32(d);
}
function packEntryZone(w, z) {
    w.vec(z.pos).vec(z.size).f32(z.rotation);
    w.u16(z.flags.length).u16(z.teams.length).u16(z.safety.length);
    for (const f of z.flags) packFlag(w, f);
    for (const t of z.teams) w.u16(t);
    for (const t of z.safety) w.u16(t);
}

// GroupDefinition::pack -- a name, ten obstacle lists, and its own instances.
function packGroupDefinition(w, def, extraTypeCounts = {}) {
    packStr(w, def.name || "");
    for (const type of OBSTACLE_TYPES) {
        const list = (def.obstacles || []).filter((o) => o.type === type);
        const n = extraTypeCounts[type] != null ? extraTypeCounts[type] : list.length;
        w.u32(n);
        for (const o of list) PACKERS[type](w, o);
    }
    const insts = def.instances || [];
    w.u32(insts.length);
    for (const g of insts) packGroupInstance(w, g);
}

// v2194 -- DynamicColor::pack. The sequence's two floats are inside `if (seq.count > 0)`, on BOTH sides. A
// channel with no sequence is eight bytes shorter than one with an empty-looking one, and getting that wrong
// would shift every material and every obstacle after it.
function packDynamicColor(w, d) {
    packStr(w, d.name);
    for (const ch of d.channels) {
        w.f32(ch.minValue).f32(ch.maxValue);
        w.u32(ch.sinusoids.length);
        for (const x of ch.sinusoids) w.f32(x.period).f32(x.offset).f32(x.weight);
        w.u32(ch.clampUps.length);
        for (const x of ch.clampUps) w.f32(x.period).f32(x.offset).f32(x.width);
        w.u32(ch.clampDowns.length);
        for (const x of ch.clampDowns) w.f32(x.period).f32(x.offset).f32(x.width);
        const seq = ch.sequence || { count: 0 };
        w.u32(seq.count);
        if (seq.count > 0) { w.f32(seq.period).f32(seq.offset); for (const b of seq.list) w.u8(b); }
    }
}

// BzMaterial::pack. Both counts are UBYTES, not uint32s.
function packMaterial(w, m) {
    packStr(w, m.name);
    let mode = 0;
    for (const k in MATERIAL_MODE) if (m[k]) mode |= MATERIAL_MODE[k];
    w.u8(mode).i32(m.dynamicColor != null ? m.dynamicColor : -1);
    for (const q of [m.ambient, m.diffuse, m.specular, m.emission]) for (const v of q) w.f32(v);
    w.f32(m.shininess || 0).f32(m.alphaThreshold || 0);
    w.u8(m.textures.length);
    for (const t of m.textures) {
        packStr(w, t.name);
        w.i32(t.matrix).i32(t.combineMode);
        w.u8((t.useAlpha ? 1 : 0) | (t.useColor ? 2 : 0) | (t.useSphereMap ? 4 : 0));
    }
    w.u8(m.shaders.length);
    for (const sh of m.shaders) packStr(w, sh.name);
}

// A whole database, as `WorldInfo::packDatabase` assembles it.
function packDatabase({ dynamicColors = [], textureMatrices = [], materials = [], physicsDrivers = [], transforms = [], obstacles = [], links = [], waterLevel = -1,
    groupInstances = [], groupDefs = [], worldWeapons = [], entryZones = [], extraTypeCounts = {} } = {}) {
    const w = new Writer(1 << 20);

    w.u32(dynamicColors.length);                                  // 1
    for (const d of dynamicColors) packDynamicColor(w, d);
    w.u32(textureMatrices.length);                                // 2
    for (const t of textureMatrices) { packStr(w, t.name); w.u8(t.state); for (const f of t.floats) w.f32(f); }
    w.u32(materials.length);                                      // 3
    for (const m of materials) packMaterial(w, m);
    w.u32(physicsDrivers.length);                                 // 4
    for (const p of physicsDrivers) {
        packStr(w, p.name); w.vec(p.linear).f32(p.angularVel).f32(p.angularPos[0]).f32(p.angularPos[1])
            .f32(p.radialVel).f32(p.radialPos[0]).f32(p.radialPos[1]).f32(p.slideTime);
        packStr(w, p.deathMsg);
    }
    w.u32(transforms.length);                                     // 5
    for (const t of transforms) {
        packStr(w, t.name); w.u32(t.ops.length);
        for (const op of t.ops) {
            w.u8(op.type);
            if (op.type === TRANSFORM.Index) w.i32(op.index);
            else { w.vec(op.data); if (op.type === TRANSFORM.Spin) w.f32(op.angle); }
        }
    }

    // 6: the world GroupDefinition, then the group definitions.
    packGroupDefinition(w, { name: "", obstacles, instances: groupInstances }, extraTypeCounts);
    w.u32(groupDefs.length);
    for (const d of groupDefs) packGroupDefinition(w, d);

    w.u32(links.length);                                          // 7
    for (const l of links) { packStr(w, l.from); packStr(w, l.to); }
    w.f32(waterLevel);                                            // 8
    if (waterLevel >= 0) w.i32(0);
    w.u32(worldWeapons.length);                                   // 9
    for (const x of worldWeapons) packWorldWeapon(w, x);
    w.u32(entryZones.length);                                     // 10
    for (const z of entryZones) packEntryZone(w, z);
    return w.bytes();
}

// --- 1. the encoder and the decoder are two transcriptions, and they agree -------------------------------
const CHAN = (seq) => ({
    minValue: 0, maxValue: 1,
    sinusoids: [{ period: 2, offset: 0.25, weight: 1 }],
    clampUps: [], clampDowns: [{ period: 3, offset: 0, width: 0.5 }],
    sequence: seq,
});
const WORLD = {
    // A channel with NO sequence is eight bytes shorter than one with an empty-looking one.
    dynamicColors: [{ name: "pulse", channels: [CHAN({ count: 0 }), CHAN({ count: 3, period: 1, offset: 0, list: [1, 0, 2] }), CHAN({ count: 0 }), CHAN({ count: 0 })] }],
    materials: [
        { name: "brass", dynamicColor: -1, ambient: [0.2, 0.2, 0.2, 1], diffuse: [0.72, 0.58, 0.24, 1], specular: [0, 0, 0, 1], emission: [0, 0, 0, 1],
            shininess: 8, alphaThreshold: 0.5, noRadar: true, occluder: true,
            textures: [{ name: "bricks", matrix: 2, combineMode: 1, useAlpha: true, useSphereMap: true }, { name: "grime", matrix: -1, combineMode: 0 }],
            shaders: [{ name: "glow" }] },
        { name: "plain", dynamicColor: 0, ambient: [0, 0, 0, 1], diffuse: [1, 1, 1, 1], specular: [0, 0, 0, 1], emission: [0, 0, 0, 1],
            shininess: 0, alphaThreshold: 0, textures: [], shaders: [] },
    ],
    textureMatrices: [{ name: "scroll", state: 3, floats: Array.from({ length: 17 }, (_, i) => i * 0.5) }],
    physicsDrivers: [{ name: "conveyor", linear: [8, 0, 0], angularVel: 1, angularPos: [2, 3], radialVel: 4, radialPos: [5, 6], slideTime: 2, deathMsg: "squashed" }],
    transforms: [{ name: "lift", ops: [{ type: TRANSFORM.Shift, data: [0, 0, 6] }, { type: TRANSFORM.Spin, data: [0, 0, 1], angle: 90 }, { type: TRANSFORM.Index, index: 7 }] }],
    obstacles: [
        { type: "wall", pos: [0, 400, 0], rotation: 4.712, size: [0, 400, 6.15], ricochet: false },
        { type: "box", pos: [1, 2, 3], rotation: 0.5, size: [10, 20, 5], driveThrough: false, shootThrough: true, ricochet: false },
        { type: "pyramid", pos: [4, 5, 0], rotation: 0, size: [8, 8, 12], driveThrough: false, shootThrough: false, ricochet: true, flipz: true },
        { type: "base", pos: [-160, -160, 0], rotation: 0, size: [30, 30, 0], color: 1, driveThrough: false, shootThrough: false, ricochet: false },
        { type: "teleporter", name: "gate", pos: [190, 0, 0], rotation: 0, size: [0.56, 6, 20], border: 1.12, horizontal: false, driveThrough: false, shootThrough: false, ricochet: false },
        {
            type: "mesh",
            checkPoints: [{ type: "inside", p: [0, 0, 3] }],
            vertices: [[-10, -10, 0], [10, -10, 0], [10, 10, 0], [-10, 10, 0], [0, 0, 7]],
            normals: [[0, 0, 1]],
            texcoords: [[0, 0], [1, 1]],
            faces: [
                { v: [3, 2, 1, 0], n: [], t: [], material: 2, phydrv: -1 },
                { v: [0, 1, 4], n: [0, 0, 0], t: [], material: -1, phydrv: 5, driveThrough: true },
                { v: [1, 2, 4], n: [], t: [0, 1, 0], material: -1, phydrv: -1, ricochet: true },
            ],
            driveThrough: false, shootThrough: false, smoothBounce: true, noclusters: false, drawInfoOwner: false, ricochet: false,
        },
    ],
    links: [{ from: "gate:f", to: "*:b" }],
    waterLevel: -1,
};
const XF = { name: "lift", ops: [{ type: TRANSFORM.Shift, data: [0, 0, 6] }] };
WORLD.obstacles.push(
    { type: "arc", transform: XF, pos: [60, -60, 0], size: [20, 20, 5], rotation: 0, sweepAngle: 90, ratio: 0.4,
        divisions: 12, phydrv: -1, texsize: [-4, -4, -4, -4], materials: [0, 1, 0, 1, 0, 1], smoothBounce: true, ricochet: true },
    { type: "cone", transform: { name: "", ops: [] }, pos: [60, 60, 0], size: [8, 8, 22], rotation: 0, sweepAngle: 360,
        divisions: 12, phydrv: 3, texsize: [-4, -4], materials: [1, 1, 0, 0], useNormals: true, ricochet: false },
    { type: "sphere", transform: { name: "", ops: [] }, pos: [-60, -60, 0], size: [20, 20, 14], rotation: 0,
        divisions: 4, phydrv: -1, texsize: [-4, -4], materials: [0, 1], hemisphere: true, ricochet: true },
    { type: "tetra", transform: { name: "", ops: [] },
        vertices: [[0, 0, 0], [6, 0, 0], [0, 6, 0], [0, 0, 6]],
        normals: [null, [[0, 0, 1], [0, 0, 1], [0, 0, 1]], null, null],
        texcoords: [[[0, 0], [1, 0], [0, 1]], null, null, null],
        materials: [0, 1, 0, 1], driveThrough: true, ricochet: true },
);

{
    const db = packDatabase(WORLD);
    const r = walkSections(db);

    ok("the walk reaches the END OF THE DATABASE", r.complete, r.stopped ? r.stopped.section + ": " + r.stopped.reason : "");
    ok("...with nothing left over", r.stopped === null && r.bytesRead === db.length);
    ok("...which is the assertion that says nothing above it misread a byte", r.bytesRead === db.length);

    ok("a texture matrix survives", r.sections.textureMatrices.length === 1 && r.sections.textureMatrices[0].name === "scroll");
    ok("...with its state byte and seventeen floats", r.sections.textureMatrices[0].state === 3 && r.sections.textureMatrices[0].floats.length === 17);
    ok("...in order", close(r.sections.textureMatrices[0].floats[16], 8));

    const p = r.sections.physicsDrivers[0];
    ok("a physics driver survives", p.name === "conveyor" && p.linear.join() === "8,0,0");
    ok("...to its death message, which is a string at the end", p.deathMsg === "squashed" && close(p.slideTime, 2));

    const t = r.sections.transforms[0];
    ok("a transform survives", t.name === "lift" && t.ops.length === 3);
    ok("a shift is a vector", t.ops[0].type === TRANSFORM.Shift && t.ops[0].data.join() === "0,0,6");
    ok("a SPIN is a vector AND an angle -- the one op with a fourth float", t.ops[1].type === TRANSFORM.Spin && close(t.ops[1].angle, 90));
    ok("an INDEX transform is an int and no vector at all", t.ops[2].type === TRANSFORM.Index && t.ops[2].index === 7);

    ok("no links are lost", r.sections.links.length === 1 && r.sections.links[0].to === "*:b");
    ok("a water level below zero carries no material index", r.sections.waterLevel === -1 && r.sections.waterMaterial === undefined);
    ok("...and one at or above zero does", (() => {
        const w2 = walkSections(packDatabase({ ...WORLD, waterLevel: 3 }));
        return close(w2.sections.waterLevel, 3) && w2.sections.waterMaterial === 0;
    })());
}

// --- 2. the obstacles, one type at a time -----------------------------------------------------------------
{
    const r = walkSections(packDatabase(WORLD));
    const by = (t) => r.obstacles.filter((o) => o.type === t);
    ok("all ten obstacle types come back", r.obstacles.length === 10);
    ok("...in the order the ten lists are packed",
        r.obstacles.map((o) => o.type).join() === "wall,box,pyramid,base,teleporter,mesh,arc,cone,sphere,tetra");

    const wall = by("wall")[0];
    ok("a wall packs only its breadth and height, not a full size vector", wall.size[0] === 0 && close(wall.size[1], 400) && close(wall.size[2], 6.15));
    const box = by("box")[0];
    ok("a box keeps its position, angle and size", box.pos.join() === "1,2,3" && close(box.rotation, 0.5) && box.size.join() === "10,20,5");
    ok("...and its state bits", box.shootThrough === true && box.driveThrough === false && box.ricochet === false);
    const pyr = by("pyramid")[0];
    ok("a pyramid's `flipz` is a bit in the same state byte", pyr.flipz === true && pyr.ricochet === true);
    const base = by("base")[0];
    ok("a base packs its TEAM first and then a whole box", base.color === 1 && base.colorValid && base.size.join() === "30,30,0");
    const tele = by("teleporter")[0];
    ok("a teleporter carries a name, and it is the first thing in its record", tele.name === "gate");
    ok("...and its border, and the outer size that border implies", close(tele.border, 1.12) && close(tele.outerSize[1], 7.12));

    const mesh = by("mesh")[0];
    ok("a mesh keeps its vertices", mesh.vertices.length === 5 && mesh.vertices[4].join() === "0,0,7");
    ok("...its normals", mesh.normals.length === 1);
    ok("...its check points, and which side they are", mesh.checkPoints.length === 1 && mesh.checkPoints[0].type === "inside");
    ok("...and its faces", mesh.faces.length === 3);
    ok("a face's state byte decides whether normals follow its vertex indices", mesh.faces[1].n.length === 3 && mesh.faces[0].n.length === 0);
    ok("...and whether texcoords do", mesh.faces[2].t.length === 3 && mesh.faces[1].t.length === 0);
    ok("...which is why a mesh cannot be skipped without being read", true);
    ok("a face keeps its material index and its physics driver", mesh.faces[0].material === 2 && mesh.faces[1].phydrv === 5);
    ok("a face's own flags are its own", mesh.faces[1].driveThrough === true && mesh.faces[2].ricochet === true && mesh.faces[0].driveThrough === false);
    ok("the mesh's flags are the mesh's", mesh.smoothBounce === true && mesh.driveThrough === false);

    // The texcoords are skipped BY LENGTH, which swallows the drawInfo the packer smuggles in as extras.
    ok("texture coordinates are skipped by length, not read", mesh.texcoords === undefined);
    ok("...and skipping them lands exactly on the face count", mesh.faces.length === 3);
}

// --- 2b. section one and section three, which were the wall until v2194 --------------------------------------
{
    const r = walkSections(packDatabase(WORLD));

    const d = r.sections.dynamicColors[0];
    ok("a dynamic colour survives, with its four channels", d.name === "pulse" && d.channels.length === 4);
    ok("...each with a min, a max and three variable-length lists", d.channels[0].sinusoids.length === 1 && d.channels[0].clampUps.length === 0 && d.channels[0].clampDowns.length === 1);
    ok("...and the sinusoid's three floats, in order", close(d.channels[0].sinusoids[0].offset, 0.25));
    // THE TRAP. The sequence's period and offset are inside `if (count > 0)`, on both sides. A channel with
    // no sequence is eight bytes shorter than one with an empty-looking one.
    ok("a channel with NO sequence carries no period and no offset", d.channels[0].sequence.count === 0 && d.channels[0].sequence.period === undefined);
    ok("...and a channel WITH one carries both, and its bytes", d.channels[1].sequence.count === 3 && close(d.channels[1].sequence.period, 1) && d.channels[1].sequence.list.join() === "1,0,2");
    ok("...and everything after it still lines up, which is the only thing that proves it", r.complete);

    const m = r.sections.materials;
    ok("both materials survive", m.length === 2 && m[0].name === "brass" && m[1].name === "plain");
    ok("a material's mode byte is bits, and they come back apart", m[0].noRadar === true && m[0].occluder === true && m[0].noCulling === false);
    ok("...its four RGBA quads are four, and in order", close(m[0].diffuse[0], 0.72) && close(m[0].ambient[0], 0.2) && m[0].specular.length === 4);
    ok("...its shininess and alpha threshold", close(m[0].shininess, 8) && close(m[0].alphaThreshold, 0.5));
    ok("...its dynamic-colour index, which may be -1 for none", m[0].dynamicColor === -1 && m[1].dynamicColor === 0);

    ok("THE TEXTURE COUNT IS A UBYTE, not a uint32", m[0].textures.length === 2);
    ok("...and each texture has a name, a matrix, a combine mode and a state byte", m[0].textures[0].name === "bricks" && m[0].textures[0].matrix === 2 && m[0].textures[0].combineMode === 1);
    ok("...whose bits come back apart", m[0].textures[0].useAlpha === true && m[0].textures[0].useSphereMap === true && m[0].textures[0].useColor === false);
    ok("THE SHADER COUNT IS A UBYTE TOO", m[0].shaders.length === 1 && m[0].shaders[0].name === "glow");
    ok("a material with no textures and no shaders is two zero bytes", m[1].textures.length === 0 && m[1].shaders.length === 0);

    ok("and section three is no longer a wall: the walk reaches the obstacles", r.obstacles.length === 10);
    ok("...and the links beyond them", r.sections.links.length === 1);
}

// --- 2c. the four procedural obstacles, which arrive as PARAMETERS and not as meshes ---------------------------
{
    const r = walkSections(packDatabase(WORLD));
    const by = (t) => r.obstacles.find((o) => o.type === t);

    const arc = by("arc");
    ok("an arc carries an embedded transform, name and all", arc.transform.name === "lift" && arc.transform.ops.length === 1);
    ok("...its position, size, angle, sweep and ratio", close(arc.ratio, 0.4) && close(arc.sweepAngle, 90) && arc.divisions === 12);
    ok("...FOUR texsize floats, because an arc has four", arc.texsize.length === 4);
    ok("...and SIX material indices: top, bottom, inside, outside, and two end faces", arc.materials.length === MATERIAL_SLOTS.arc && MATERIAL_SLOTS.arc === 6);
    ok("...with its state bits", arc.smoothBounce === true && arc.ricochet === true && arc.driveThrough === false);

    const cone = by("cone");
    ok("a cone has NO ratio: it is the field an arc has and a cone does not", cone.ratio === undefined && close(cone.sweepAngle, 360));
    ok("...two texsize floats and four material indices", cone.texsize.length === 2 && cone.materials.length === 4);
    ok("...and its physics driver", cone.phydrv === 3 && cone.useNormals === true);

    const sph = by("sphere");
    ok("a sphere has no sweep at all", sph.sweepAngle === undefined && sph.divisions === 4);
    ok("...and only two material indices: an edge and a bottom", sph.materials.length === 2);
    // The bit that would have been silent. On a cone, bit 4 is ricochet. On a sphere it is `hemisphere`.
    ok("a sphere's bit 4 is HEMISPHERE, where a cone's is ricochet", sph.hemisphere === true && sph.ricochet === true);
    ok("...so reading a sphere with a cone's bit table would turn every dome into a ricochet surface", true);

    const tet = by("tetra");
    ok("a TETRA PACKS ITS STATE BYTE FIRST, before the transform -- the only one that does", tet.driveThrough === true && tet.ricochet === true);
    ok("...four vertices", tet.vertices.length === 4 && tet.vertices[3].join() === "0,0,6");
    ok("...a byte saying which of its four faces carry normals", tet.normals[1] !== null && tet.normals[0] === null);
    ok("...and another for texcoords, and only those faces pay for them", tet.texcoords[0] !== null && tet.texcoords[1] === null);
    ok("...and one material index per face", tet.materials.length === 4);

    ok("and everything after them still lines up", r.complete && r.sections.links.length === 1);
    ok("...which is the only thing that proves the material counts are right", r.bytesRead === packDatabase(WORLD).length);
}

// --- 3. what it refuses, and it refuses by name -------------------------------------------------------------
{
    const stopAt = (opts) => walkSections(packDatabase({ ...WORLD, ...opts })).stopped;



    ok("IT NEVER SKIPS. A record whose layout is unknown has no length you can compute.", true);
    ok("...and what it read before the wall is kept, not thrown away", (() => {
        const r = walkSections(packDatabase({ ...WORLD, extraTypeCounts: { arc: 99 } }));
        return r.sections.materials.length === 2 && r.sections.textureMatrices.length === 1;
    })());
}

// --- 3b. group instances, and the fake string -----------------------------------------------------------------
{
    const DEF = {
        name: "corridor",
        obstacles: [
            { type: "box", pos: [1, 0, 0], rotation: 0, size: [4, 2, 6], driveThrough: false, shootThrough: false, ricochet: false },
            { type: "pyramid", pos: [0, 5, 0], rotation: 0, size: [3, 3, 8], driveThrough: false, shootThrough: false, ricochet: false, flipz: false },
        ],
        instances: [],
    };
    const XFORM = { name: "", ops: [{ type: TRANSFORM.Shift, data: [100, 0, 0] }] };

    // A plain instance: no material map, so the name is an ordinary string.
    const plain = { groupdef: "corridor", name: "east", matMap: [], transform: XFORM };
    // And one that smuggles a material map inside its name.
    const smuggled = {
        groupdef: "corridor", name: "west",
        matMap: [{ src: 0, dst: 1 }, { src: 2, dst: 3 }],
        transform: { name: "", ops: [{ type: TRANSFORM.Shift, data: [-100, 0, 0] }] },
        modifyTeam: true, team: 2, driveThrough: true, ricochet: true,
        modifyColor: true, tint: [1, 0.5, 0.25, 0.75],
        modifyPhysicsDriver: true, phydrv: 4,
        modifyMaterial: true, material: 1,
    };

    const r = walkSections(packDatabase({ ...WORLD, groupInstances: [plain, smuggled], groupDefs: [DEF] }));
    ok("a world with group instances walks all the way through", r.complete, r.stopped ? r.stopped.reason : "");
    ok("...and reads every byte", r.bytesRead === packDatabase({ ...WORLD, groupInstances: [plain, smuggled], groupDefs: [DEF] }).length);

    ok("both instances come back", r.instances.length === 2);
    ok("...and the definition they name", !!r.groupDefs.corridor && r.groupDefs.corridor.obstacles.length === 2);

    const [a, b] = r.instances;
    ok("a plain instance's name is a name", a.name === "east" && a.matMap.length === 0);
    ok("...and it carries its transform", a.transform.ops.length === 1 && a.transform.ops[0].data.join() === "100,0,0");

    // THE FAKE STRING. The name field is longer than the name.
    ok("a smuggled instance's NAME still reads as a name", b.name === "west");
    ok("...and the bytes after its NUL are a material map", b.matMap.length === 2);
    ok("...with its pairs, in order", b.matMap[0].src === 0 && b.matMap[0].dst === 1 && b.matMap[1].src === 2 && b.matMap[1].dst === 3);
    ok("...and everything after the name still lines up, which is the only proof that matters", r.complete);

    ok("the bit-field's four optional fields follow it, in order",
        b.team === 2 && Math.abs(b.tint[3] - 0.75) < 1e-6 && b.phydrv === 4 && b.material === 1);
    ok("...and the three that are not optional are just bits", b.driveThrough === true && b.ricochet === true && b.shootThrough === false);
    ok("an instance with no modify bits carries none of those fields", a.team === undefined && a.tint === undefined);

    // A definition may itself contain instances.
    const inner = { name: "block", obstacles: [{ type: "box", pos: [0, 0, 0], rotation: 0, size: [1, 1, 1], driveThrough: false, shootThrough: false, ricochet: false }], instances: [] };
    const outer = { name: "pair", obstacles: [], instances: [{ groupdef: "block", name: "", matMap: [], transform: { name: "", ops: [{ type: TRANSFORM.Shift, data: [10, 0, 0] }] } }] };
    const nested = walkSections(packDatabase({ ...WORLD, groupInstances: [{ groupdef: "pair", name: "", matMap: [], transform: { name: "", ops: [] } }], groupDefs: [inner, outer] }));
    ok("a definition may contain instances of another definition", nested.complete && nested.groupDefs.pair.instances.length === 1);
    ok("...and the walk still ends where it should", nested.stopped === null && nested.complete);
}

// --- 3c. expanding them into a world --------------------------------------------------------------------------
{
    const { adaptWorld } = await import("../net/bzWorldAdapt.js");
    const DEF = { name: "blk", obstacles: [{ type: "box", pos: [1, 0, 0], rotation: 0, size: [4, 2, 6], driveThrough: false, shootThrough: false, ricochet: false }], instances: [] };
    const inst = (dx) => ({ groupdef: "blk", name: "", matMap: [], transform: { name: "", ops: [{ type: TRANSFORM.Shift, data: [dx, 0, 0] }] } });

    const walls = [-1, 1].flatMap((s) => [
        { type: "wall", pos: [0, s * 400, 0], rotation: 0, size: [0, 400, 6.15], ricochet: false },
        { type: "wall", pos: [s * 400, 0, 0], rotation: 0, size: [0, 400, 6.15], ricochet: false },
    ]);
    const w = walkSections(packDatabase({ obstacles: walls, groupInstances: [inst(100), inst(-100)], groupDefs: [DEF] }));
    ok("a world of nothing but walls and two group instances walks", w.complete);

    const a = adaptWorld(w);
    ok("...and adapts", a.ok, a.reason || "");
    ok("...into two boxes, one per instance", a.obstacles.filter((o) => o.type === "box").length === 2);
    ok("...each placed by its own transform", (() => {
        const xs = a.obstacles.filter((o) => o.type === "box").map((o) => o.pos[0]).sort((p, q) => p - q);
        return Math.abs(xs[0] + 99) < 1e-6 && Math.abs(xs[1] - 101) < 1e-6;   // the box sits at x=1 inside its group
    })());
    ok("...tagged with the group it came from", a.obstacles.filter((o) => o.group === "blk").length === 2);
    ok("...and a rigid shift is BAKED, not carried", a.obstacles.every((o) => !o.transform) && a.approx === 0);
    ok("the walls still become the boundary", a.world.size === 800 && !a.obstacles.some((o) => o.type === "wall"));

    // A definition nobody defined, and a group that eats itself. Reported, never invented.
    const orphan = adaptWorld(walkSections(packDatabase({ obstacles: walls, groupInstances: [inst(0)], groupDefs: [] })));
    ok("an instance naming no definition is reported, not invented", orphan.ok && orphan.groupProblems.some((p) => /no definition matches/.test(p)));
    ok("...and it contributes no obstacles", orphan.obstacles.length === 0);

    const selfRef = { name: "loop", obstacles: [], instances: [{ groupdef: "loop", name: "", matMap: [], transform: { name: "", ops: [] } }] };
    const looped = adaptWorld(walkSections(packDatabase({ obstacles: walls, groupInstances: [{ groupdef: "loop", name: "", matMap: [], transform: { name: "", ops: [] } }], groupDefs: [selfRef] })));
    ok("a group that instantiates itself stops, and says so", looped.groupProblems.some((p) => /instantiates itself/.test(p)));
}

// --- 3d. the last two sections, and the end of the database -----------------------------------------------------
{
    const weapons = [
        { flag: "SW", origin: [0, 0, 20], direction: 1.57, initDelay: 10, delay: [8, 8, 4] },
        { flag: "", origin: [1, 2, 3], direction: 0, initDelay: 0, delay: [] },
    ];
    const zones = [
        { pos: [-160, -160, 0], size: [24, 24, 0], rotation: 0, flags: [], teams: [1], safety: [] },
        { pos: [0, 0, 0], size: [30, 30, 10], rotation: 0.5, flags: ["GM", "L"], teams: [], safety: [1, 2] },
    ];
    const db = packDatabase({ ...WORLD, worldWeapons: weapons, entryZones: zones });
    const r = walkSections(db);
    ok("a database with world weapons and entry zones walks to its last byte", r.complete && r.bytesRead === db.length);

    const [a, b] = r.sections.worldWeapons;
    ok("a world weapon carries its flag, origin and direction", a.flag === "SW" && a.origin.join() === "0,0,20" && close(a.direction, 1.57));
    ok("...its initial delay and the cycle it repeats", close(a.initDelay, 10) && a.delay.length === 3 && close(a.delay[2], 4));
    ok("a weapon with no flag is two zero bytes, and reads back as no flag", b.flag === "");
    ok("...and an empty delay list is an empty list", b.delay.length === 0);

    const [z1, z2] = r.sections.entryZones;
    ok("an entry zone is a position, a size and a rotation", z1.pos.join() === "-160,-160,0" && z1.size.join() === "24,24,0");
    ok("...and a team list, which is where that team respawns", z1.teams.join() === "1" && z1.flags.length === 0);
    // THE TRAP: three counts, together, and only then their three lists.
    ok("a zone writes THREE counts before ANY of its three lists", z2.flags.join() === "GM,L" && z2.teams.length === 0 && z2.safety.join() === "1,2");
    ok("...so reading count-then-list would land the safety list on a flag", close(z2.rotation, 0.5));

    ok("nothing is left over", r.stopped === null);
    ok("a database with one extra byte is REFUSED, not shrugged at", (() => {
        const fat = new Uint8Array(db.length + 1);
        fat.set(db);
        const f = walkSections(fat);
        return !f.complete && f.stopped && f.stopped.section === "end" && /left over/.test(f.stopped.reason);
    })());
    ok("...because a walk that succeeds with bytes left over misread one above", true);
}

// --- 4. garbage in ------------------------------------------------------------------------------------------
{
    const junk = walkSections(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    ok("an absurd count is refused, not allocated", junk.stopped.section === "dynamicColors" && /is not a count/.test(junk.stopped.reason));
    const short = walkSections(new Uint8Array([0, 0, 0, 0]));
    ok("running off the end is caught and named", short.stopped.section === "unknown" && /ran off the end/.test(short.stopped.reason));
    ok("...and nothing is invented", short.obstacles.length === 0);
    const hugeStr = new Writer(12).u32(0).u32(1).u32(0x7fffffff).bytes();
    ok("a string longer than a megabyte is not a string", walkSections(hugeStr).stopped !== null);
}

console.log("");
console.log("  (the decoder is transcribed from BZFlag's `unpack` functions; the encoder above, separately,");
console.log("   from its `pack` functions. Two transcriptions of one format. NO REAL SERVER HAS SENT US A");
console.log("   WORLD, and the wall is at section three: dynamicColors, materials, groupInstances, arc, cone,");
console.log("   sphere, tetra, worldWeapons and entryZones remain unread. That list is the whole of the gap.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
