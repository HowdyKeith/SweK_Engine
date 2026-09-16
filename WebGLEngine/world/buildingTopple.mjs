// WebGLEngine/world/buildingTopple.mjs -- v4591 (task 80): a damaged building falls over as a Box3D body, then turns into debris
//
// Keith asked whether the buildings, which have rebar and take damage, could box3d fall over or turn into debris. Until this
// round a building at zero hit points VANISHED: world/CityGen.js's _topple erased its voxels in one tick and stamped a flat
// rubble log beside the footprint (a rotation done by arithmetic on voxel coordinates, sparsened by a seeded roll), and
// world/crashDamage.mjs parked its static box. Nothing fell; nothing was a body.
//
// THE RULE IS THE ONE A BUILDING ACTUALLY OBEYS: IT STANDS WHILE ITS CENTRE OF MASS IS OVER WHAT IS LEFT OF ITS GROUND FLOOR.
// When CityGen calls for the topple (hit points at zero -- crashDamage charges the rest when the car has taken the ground floor
// under CRASH.support), this module takes the STANDING block above the ground floor (physics/voxel/fracture.js's flood fill:
// the largest component anchored to the ground floor; anything cut loose bursts as debris) and makes it ONE dynamic box3d body
// -- a box of the block's extents with the block's voxel mass -- resting on the ground floor's remaining voxels, which become
// static STUBS (the support, rebar and all: the hinge), over a static slab at the road. No impulse is invented: gravity and
// box3d's contact solver decide. A block whose centre hangs past the stubs' edge tips over that edge and lands lying on its
// side (measured headless: a 4 x 10 x 4 block on a far-quarter stub is flat in 3.1 s, up.y 0.00, its centre 3.9 m past the
// face it fell toward); a block whose centre is still over its stubs stands on what is left, and says so. The car the block
// falls toward is a body too: it is pressed, not passed through.
//
// THEN IT TURNS INTO DEBRIS. When the body comes to rest (or after TOPPLE.rest.maxAge), its voxels are carried through its
// final pose -- rotateQ, the same quaternion the record was drawn with -- into world cells: every cell that is air becomes
// RUBBLE (MaterialRegistry's 7, the id CityGen's own topple stamps), every TOPPLE.debrisEvery-th voxel bursts through
// world/voxelDebrisSystem.js, the body is parked, and the slots are re-meshed. Between the fall and the shatter the block is
// drawn as the block: its voxels meshed once (render/voxelDevice.mjs's mesher on a mini world) into a fleet reserved in the
// crash scene, in the lit pipeline's quat mode, with the body's transform per frame -- so the windows fall with the wall.
//
// Deterministic: the block, the stubs and the fall are box3d state, and the rubble is a pure function of the final pose.
"use strict";
import { looseFragments, massProperties } from "../physics/voxel/fracture.js";
import { CRASH, footprint } from "./crashDamage.mjs";
import { syncDirty } from "../render/voxelDamage.mjs";
import { miniWorld, meshWorld } from "../render/voxelDevice.mjs";
import { rotateQ, bodyLitPipelineDesc } from "../render/voxelBodies.mjs";
import { litBind } from "../render/litSphere.mjs";
import { SUN } from "../render/voxelDevice.mjs";

export const TOPPLE = Object.freeze({
    density: 600,                 // kg per standing voxel (a cubic metre of masonry with rooms in it): a 4 x 10 x 4 block is 96 t, the car 1.2 t
    friction: 0.8,                // the stubs, the slab and the block
    slabHalf: 400,                // the static ground under the city, half-width; its top is the road (CRASH.groundY + 1)
    maxBodies: 3,                 // blocks in the air at once; the oldest shatters when a fourth falls
    minVoxels: 8,                 // a block smaller than this is crumbs: it bursts where it stands instead of becoming a body
    meshCap: 12000,               // vertices reserved per block fleet (a 6 x 12 x 6 building with facades meshes to a few thousand)
    rest: Object.freeze({ speed: 0.05, ticks: 30, minAge: 60, maxAge: 12 * 60 }),   // at rest: under `speed` for `ticks` in a row after minAge, or maxAge
    fallenUp: 0.5,                // a block whose up vector's y is under this has fallen; one above it stands on what is left, and stays a body
    rubbleId: 7,                  // MaterialRegistry's RUBBLE
    debrisEvery: 3,               // one debris burst per this many voxels of a shattering block (the pool is capped at 400)
    park: Object.freeze([0, -500, 0]),
});

const key = (x, z) => x + "," + z;

/** The ground floor's remaining voxels as rectangles: runs along x per z row, then equal runs merged along z. */
export function supportRects(world, rect, groundY = CRASH.groundY) {
    const y = groundY + 1, runs = [];
    for (let z = rect.z; z < rect.z + rect.d; z++) {
        let x = rect.x;
        while (x < rect.x + rect.w) {
            if (!world.voxelAt(x, y, z)) { x++; continue; }
            let x1 = x; while (x1 < rect.x + rect.w && world.voxelAt(x1, y, z)) x1++;
            runs.push({ x0: x, x1, z0: z, z1: z + 1 }); x = x1;
        }
    }
    const out = [];
    for (const r of runs) { const last = out.find((o) => o.x0 === r.x0 && o.x1 === r.x1 && o.z1 === r.z0); if (last) last.z1 = r.z1; else out.push({ ...r }); }
    return out;
}

/**
 * The standing block of a footprint: the voxels above the ground floor in the largest component anchored to it, its extents, its
 * exact mass properties (fracture.js), and the pieces that are NOT it -- cut loose, or a smaller anchored tower -- which burst.
 */
export function standingBlock(world, rect, groundY = CRASH.groundY) {
    const nx = rect.w, ny = rect.h, nz = rect.d, grid = new Uint8Array(nx * ny * nz), ids = new Uint8Array(nx * ny * nz), at = (x, y, z) => (z * ny + y) * nx + x;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const id = world.voxelAt(rect.x + x, groundY + 1 + y, rect.z + z); if (id) { grid[at(x, y, z)] = 1; ids[at(x, y, z)] = id; } }
    const cc = looseFragments(grid, nx, ny, nz);
    // the block is the largest component anchored to the ground floor; with NO ground floor left nothing is anchored, and the
    // largest component of all is the block -- it has nothing under it and drops (a pancake, not a topple)
    let label = 0, best = 0; for (const l of cc.anchored) if (cc.sizes[l] > best) { best = cc.sizes[l]; label = l; }
    const dropped = !label; if (dropped) for (let l = 1; l <= cc.count; l++) if (cc.sizes[l] > best) { best = cc.sizes[l]; label = l; }
    const voxels = [], others = []; let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const k = at(x, y, z); if (!grid[k]) continue;
        const v = { x: rect.x + x, y: groundY + 1 + y, z: rect.z + z, id: ids[k] };
        if (cc.labels[k] === label && (y > 0 || dropped)) { voxels.push(v); for (let a = 0; a < 3; a++) { const c = [v.x, v.y, v.z][a]; if (c < min[a]) min[a] = c; if (c + 1 > max[a]) max[a] = c + 1; } }
        else if (cc.labels[k] !== label) others.push(v);
    }
    const mp = label ? massProperties(cc.labels, label, nx, ny, nz, 1, TOPPLE.density) : null;
    const centre = voxels.length ? [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] : null, half = voxels.length ? [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2] : null;
    return { voxels, others, centre, half, count: voxels.length, mass: voxels.length * TOPPLE.density, exact: mp ? { mass: mp.mass, com: [rect.x + mp.com[0], groundY + 1 + mp.com[1], rect.z + mp.com[2]], I: mp.I, voxels: mp.voxels } : null,
             components: cc.count, anchored: cc.anchored.length, loose: cc.loose.length, label, dropped };
}

/** The support polygon: the convex hull (monotone chain) of the stub rectangles' corners, as [[x, z], ...] counter-clockwise. */
export function supportHull(rects) {
    const pts = []; for (const r of rects) pts.push([r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]);
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = []; for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop(); return lower.concat(upper);
}

/** Is a point (x, z) over the support polygon -- inside the hull of what is left of the ground floor? A block whose centre is not will fall. */
export function overSupport(x, z, rects) {
    const hull = supportHull(rects); if (hull.length < 3) return hull.length ? rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) : false;
    for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false; }
    return true;
}

/** How many of the bodies in the air stand on what is left, and how many have fallen and wait to shatter. */
export function standingCount(t) { let standing = 0, fallen = 0, dropped = 0; for (const r of t.bodies) { if (r.fallen) fallen++; else if (r.dropped) dropped++; else standing++; } return { standing, fallen, dropped }; }

/** The topple state of a crash world. `debris` is a VoxelDebrisSystem or null; `onBlock(slot, mesh)` and `onFree(slot)` come from the scene. */
export function createTopple(g, { debris = null, spec = TOPPLE } = {}) {
    return { g, spec, debris, ground: null, bodies: [], slots: new Array(spec.maxBodies).fill(null), events: [], fallen: 0, shattered: 0, crumbs: 0, rubble: 0, burst: 0, tick: 0, onBlock: null, onFree: null };
}

/** The static slab under the city, once: its top at the road, so a body that leaves its stubs has something to land on. */
export function ensureGround(t) {
    if (t.ground !== null) return t.ground;
    const y = CRASH.groundY + 1;
    t.ground = t.g.phys.addBox({ type: "static", pos: [0, y - 0.5, 0], half: [t.spec.slabHalf, 0.5, t.spec.slabHalf] }); t.g.phys.setFriction(t.ground, t.spec.friction);
    return t.ground;
}

/** Install the topple on a crash world: CityGen's _topple on this city now raises a body instead of stamping rubble. Returns the state. */
export function toppleWorld(g, opts = {}) {
    const t = createTopple(g, opts); g.topple = t;
    g.city._topple = (b, fromDirection = null) => { beginTopple(t, b, fromDirection); };
    return t;
}

const rectIndex = (g, b) => g.rects.findIndex((r) => r.x === b.x && r.z === b.z);

/**
 * The topple itself, for a CityGen building `b` (or a bare rect with `index` -1): the block above the ground floor becomes a body on
 * the stubs; the loose pieces burst; the building's static box is parked. Returns the body record, or null with a reason.
 */
export function beginTopple(t, b, fromDirection = null, rect = null) {
    const g = t.g, i = rect ? g.rects.indexOf(rect) : rectIndex(g, b); rect = rect || g.rects[i];
    if (b) b.state = "toppled";
    const before = footprint(g.world, rect).solid, block = standingBlock(g.world, rect), stubs = supportRects(g.world, rect);
    // the pieces that are not the block: cut loose by the blast, or a smaller tower -- they burst now and leave the world
    for (const v of block.others) { g.world.setVoxel(v.x, v.y, v.z, 0); if (t.debris && t.burst % t.spec.debrisEvery === 0) t.debris.spawn(v.x, v.y, v.z, v.id); t.burst++; }
    for (const v of block.voxels) g.world.setVoxel(v.x, v.y, v.z, 0);
    const sync = syncDirty(g.state);
    if (i >= 0 && g.colliders && g.colliders[i] != null && !g.parked.has(i)) { g.phys.setTransform(g.colliders[i], t.spec.park.slice()); g.parked.add(i); }
    if (block.count < t.spec.minVoxels) {
        // crumbs: rubble where they stood, a burst, no body
        let rubble = 0; for (const v of block.voxels) { if (!g.world.voxelAt(v.x, v.y, v.z)) { g.world.setVoxel(v.x, v.y, v.z, t.spec.rubbleId); rubble++; } if (t.debris) t.debris.spawn(v.x, v.y, v.z, v.id); }
        if (rubble) syncDirty(g.state); t.rubble += rubble; t.burst += block.count; t.crumbs++;
        t.events.push({ kind: "crumbs", building: i, voxels: block.count, before, rubble, reason: `under ${t.spec.minVoxels} voxels stand above the ground floor` }); return null;
    }
    ensureGround(t);
    const stubBodies = stubs.map((s) => { const id = g.phys.addBox({ type: "static", pos: [(s.x0 + s.x1) / 2, CRASH.groundY + 1.5, (s.z0 + s.z1) / 2], half: [(s.x1 - s.x0) / 2, 0.5, (s.z1 - s.z0) / 2] }); g.phys.setFriction(id, t.spec.friction); return id; });
    const volume = 8 * block.half[0] * block.half[1] * block.half[2], density = block.mass / volume;
    const body = g.phys.addBox({ type: "dynamic", pos: block.centre.slice(), half: block.half.slice(), density }); g.phys.setFriction(body, t.spec.friction);
    const local = block.voxels.map((v) => [v.x + 0.5 - block.centre[0], v.y + 0.5 - block.centre[1], v.z + 0.5 - block.centre[2], v.id]);
    const over = overSupport(block.centre[0], block.centre[2], stubs);
    if (t.bodies.length >= t.spec.maxBodies) shatter(t, t.bodies[0]);
    let slot = t.slots.indexOf(null); if (slot < 0) slot = 0;
    const rec = { building: i, body, stubs: stubBodies, stubRects: stubs, local, centre: block.centre, half: block.half, radius: Math.hypot(block.half[0], block.half[1], block.half[2]), mass: block.mass, count: block.count, exact: block.exact,
                  born: t.tick, restTicks: 0, slot, pose: { pos: block.centre.slice(), quat: [0, 0, 0, 1] }, over, dropped: block.dropped, fallen: false, from: fromDirection, mesh: null };
    t.bodies.push(rec); t.slots[slot] = rec; t.fallen++;
    t.events.push({ kind: block.dropped ? "drop" : "topple", building: i, voxels: block.count, mass: block.mass, loose: block.others.length, stubs: stubs.length, support: stubs.reduce((a, s) => a + (s.x1 - s.x0) * (s.z1 - s.z0), 0) / (rect.w * rect.d), over, chunks: sync.chunks.length });
    if (t.onBlock) { rec.mesh = blockMesh(rec); t.onBlock(slot, rec.mesh); }
    return rec;
}

const quatUp = (q) => { const [x, y, z, w] = q; return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]; };

/** One tick after the world stepped: the bodies' poses read back, the rest test, the shatter of what has settled. Returns the shattered records. */
export function stepTopple(t, tick = t.tick + 1) {
    t.tick = tick; if (!t.bodies.length) return [];
    const xf = t.g.phys.readTransforms(), vel = t.g.phys.readVelocities(), out = [];
    for (const rec of t.bodies.slice()) {
        const o = rec.body * 7; rec.pose = { pos: [xf[o], xf[o + 1], xf[o + 2]], quat: [xf[o + 3], xf[o + 4], xf[o + 5], xf[o + 6]] };
        const sp = Math.hypot(vel[rec.body * 3], vel[rec.body * 3 + 1], vel[rec.body * 3 + 2]), age = tick - rec.born;
        rec.restTicks = sp < t.spec.rest.speed ? rec.restTicks + 1 : 0; rec.speed = sp; rec.up = quatUp(rec.pose.quat); rec.fallen = rec.up[1] < t.spec.fallenUp;
        // a block that stands on what is left STAYS a body (the car can still push it over); one that has fallen over, or dropped with
        // nothing under it (a pancake), shatters once it rests -- or at maxAge, or off the world
        const settled = (rec.fallen || rec.dropped) && ((age >= t.spec.rest.minAge && rec.restTicks >= t.spec.rest.ticks) || age >= t.spec.rest.maxAge);
        if (settled || rec.pose.pos[1] < CRASH.groundY - 5) { shatter(t, rec); out.push(rec); }
    }
    return out;
}

/** The body's voxels through its final pose into the world as rubble, a share of them as debris; the body parked, the slot freed. */
export function shatter(t, rec) {
    const g = t.g, { pos, quat } = rec.pose, world = g.world; let rubble = 0, burst = 0, lost = 0;
    for (let k = 0; k < rec.local.length; k++) {
        const l = rec.local[k], r = rotateQ(quat, [l[0], l[1], l[2]]), wx = Math.floor(pos[0] + r[0]), wy = Math.floor(pos[1] + r[1]), wz = Math.floor(pos[2] + r[2]);
        if (wy < CRASH.groundY + 1 || wy >= world.chunkHeight) { lost++; continue; }
        if (!world.voxelAt(wx, wy, wz)) { world.setVoxel(wx, wy, wz, t.spec.rubbleId); rubble++; }
        if (t.debris && k % t.spec.debrisEvery === 0) { t.debris.spawn(wx, wy, wz, l[3]); burst++; }
    }
    const sync = syncDirty(g.state);
    g.phys.setType(rec.body, "static"); g.phys.setTransform(rec.body, t.spec.park.slice());
    t.bodies.splice(t.bodies.indexOf(rec), 1); t.slots[rec.slot] = null; if (t.onFree) t.onFree(rec.slot);
    t.shattered++; t.rubble += rubble; t.burst += burst;
    t.events.push({ kind: "shatter", building: rec.building, at: t.tick, age: t.tick - rec.born, up: rec.up ? rec.up.map((v) => +v.toFixed(3)) : null, fell: !!rec.fallen, dropped: !!rec.dropped, rubble, burst, lost, chunks: sync.chunks.length });
    return { rubble, burst, lost };
}

// ---- drawing: the block meshed once, a fleet reserved per slot, the body's transform per frame -------------------------------------
/** The block's voxels meshed on a mini world, interleaved as gpuDriven's lit layout (p3 colour4 n3) in the body's unit space. */
export function blockMesh(rec, cap = TOPPLE.meshCap) {
    const mini = miniWorld(), off = 2;   // the block at (2, 2, 2) in its mini world: air on every side, the mesher sees every face
    const min = [Infinity, Infinity, Infinity]; for (const l of rec.local) for (let a = 0; a < 3; a++) if (l[a] < min[a]) min[a] = l[a];
    for (const l of rec.local) mini.setVoxel(Math.round(l[0] - min[0] - 0.5) + off, Math.round(l[1] - min[1] - 0.5) + off, Math.round(l[2] - min[2] - 0.5) + off, l[3]);
    const m = meshWorld(mini).mesh, n = Math.min(m.positions.length / 3, cap), data = new Float32Array(cap * 10), R = rec.radius;
    for (let i = 0; i < n; i++) {
        const o = i * 10;
        data[o] = (m.positions[i * 3] - off + min[0] - 0.5) / R; data[o + 1] = (m.positions[i * 3 + 1] - off + min[1] - 0.5) / R; data[o + 2] = (m.positions[i * 3 + 2] - off + min[2] - 0.5) / R;
        data[o + 3] = m.colors[i * 4]; data[o + 4] = m.colors[i * 4 + 1]; data[o + 5] = m.colors[i * 4 + 2]; data[o + 6] = m.colors[i * 4 + 3];
        data[o + 7] = m.normals[i * 3]; data[o + 8] = m.normals[i * 3 + 1]; data[o + 9] = m.normals[i * 3 + 2];
    }
    return { data, count: n, radius: R, truncated: m.positions.length / 3 > cap };
}

/** An empty mesh of `cap` vertices: the fleet's reservation, overwritten through its vertex buffer when a block falls. */
export function reservedMesh(cap = TOPPLE.meshCap) {
    const indices = new Uint32Array(cap); for (let i = 0; i < cap; i++) indices[i] = i;
    return { positions: new Float32Array(cap * 3), normals: new Float32Array(cap * 3), colors: new Float32Array(cap * 4), indices, color: [1, 1, 1, 1] };
}

/** The crash scene's extras: one fleet per slot in quat mode, a record per slot parked until a block takes it. */
export function sceneExtras(t, G, L, { light = SUN, cap = TOPPLE.meshCap } = {}) {
    const n = t.spec.maxBodies, park = t.spec.park;
    return {
        count: n,
        fleets: Array.from({ length: n }, (_, k) => ({ name: "block" + k, lods: [{ name: "only", mesh: reservedMesh(cap) }], layout: G.LAYOUTS.lit, pipeline: bodyLitPipelineDesc(), bind: litBind(light) })),
        fill(rec, ext, at) { for (let k = 0; k < n; k++) { const r = t.slots[k], o = (at + k) * 4; if (r) { rec.set([r.pose.pos[0], r.pose.pos[1], r.pose.pos[2], r.radius], o); ext.set(r.pose.quat, o); } else { rec.set([park[0], park[1], park[2], 1], o); ext.set([0, 0, 0, 1], o); } } },
    };
}

/** Bind the topple to a built crash scene: a falling block's mesh goes into its slot's reserved vertex buffer. `base` is the first block fleet's index. */
export function bindScene(t, sc, base = sc.extrasBase) {
    const scene = sc.scene || sc;   // crashScene's result, or the gpuDriven scene itself
    t.onBlock = (slot, mesh) => { const f = scene.fleets[base + slot]; if (!f || !f.vbuf) throw new Error(`buildingTopple: no reserved fleet at ${base + slot} for slot ${slot}`); f.vbuf.write(mesh.data, 0); };
    t.onFree = null;
    for (const r of t.bodies) if (!r.mesh) { r.mesh = blockMesh(r); t.onBlock(r.slot, r.mesh); }
    return t;
}

/** The front door. */
export function reportLines() {
    return [
        "[buildingTopple] a building stands while its centre of mass is over what is left of its ground floor: at the topple the block above the ground floor is one dynamic box3d body on the remaining ground-floor voxels as static stubs, and gravity decides",
        `  ${TOPPLE.density} kg per voxel, friction ${TOPPLE.friction}, ${TOPPLE.maxBodies} blocks in the air at once; at rest (under ${TOPPLE.rest.speed} m/s for ${TOPPLE.rest.ticks} ticks, or ${TOPPLE.rest.maxAge / 60} s) the block shatters: rubble (id ${TOPPLE.rubbleId}) through its final pose, a debris burst per ${TOPPLE.debrisEvery} voxels`,
        "  the block is drawn as the block: meshed once into a reserved fleet, the body's transform per frame in the quat mode; pieces cut loose by the blast burst at once",
    ];
}
