// WebGLEngine/world/crashDamage.mjs -- v4530
//
// RACING CITY 7 -- DESTRUCTIBLE BUILDINGS. The city on the flat grid (world/raceTrack.mjs's trackWorld: CityGen's facade buildings
// on the free cells, one static box each in box3d for the car to hit) takes damage from the CAR. Nothing new is invented for the
// damage itself: it is the sandbox's own, through render/voxelDamage.mjs (v4520) -- blastAt carves a sphere, bursts the debris
// system's six cubes per voxel, charges the building the voxels it lost through CityGen's damageAt (one hit point per standing
// voxel, v4510; the crumble passes at 75 / 50 / 25 %, the topple at zero), and syncs the device's slots. What this module adds:
//
//   crashWorld(track, CityGen)            the flat track's world, city and rects, with the edit state the slots need.
//   buildingColliders(phys, rects)        the static boxes (physics/raceCar.mjs's addBuildings), remembered so a collapse can park one.
//   crashStep(g, car, surface, input)     one car step, then THE IMPACT TEST: the horizontal speed the car lost in that step. Above
//                                         CRASH.speedLoss with the car against a building's footprint, it is an impact: the blast
//                                         centre is the nearest point of the footprint pushed CRASH.bite into the wall at the
//                                         chassis' height, its radius grows with the speed lost, and the building is charged what it
//                                         lost. Below the threshold nothing happens, which is the other half of the contract.
//   revealRebar(world, removed, ...)      render/rebar.mjs's cage at voxel scale: rods every CRASH.cage.pitch voxels along x and y
//                                         (isRebar, the cage placed on the building's own corner). A voxel the cut exposed -- a solid
//                                         neighbour of a removed one -- that lies on a rod becomes REBAR_ID, so the crater's faces
//                                         show the steel where the rods were: dots where an x-rod is cut square-on, lines where a
//                                         vertical rod runs down the face. Oriented and placed, as the module's header promised.
//   collapse                              CityGen's topple at zero hit points erases the footprint and stamps rubble; this module then
//                                         PARKS the building's static box (setTransform to CRASH.park) so the car drives the rubble.
//                                         v4591 (task 80): with world/buildingTopple.mjs installed on the world (toppleWorld), the
//                                         topple raises the block above the ground floor as a box3d body on its remaining ground
//                                         floor instead, and the rubble is stamped through the body's final pose when it has fallen.
//   crashScene(device, state, debris, G, L)   the world's slots, the car in quat mode, the debris with its colour in the extras --
//                                         voxelDamage's damageScene with the car in the bodies' place.
//
// Run: node tools/ship/crashDamage-selfcheck.mjs
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import * as T from "./raceTrack.mjs";
import { CAR, createCar, stepCar, carPose, addBuildings, trackSurface } from "../physics/raceCar.mjs";
import { ROAD_Y } from "./raceTrack.mjs";
import { blastAt, syncDirty, debrisRecords, debrisLitPipelineDesc, DAMAGE } from "../render/voxelDamage.mjs";
import { editState, splitMesh, FLOATS } from "../render/voxelDeviceEdit.mjs";
import { miniWorld, SUN, raycastVoxels } from "../render/voxelDevice.mjs";
import { isRebar } from "../render/rebar.mjs";
import { litPipelineDesc, litBind } from "../render/litSphere.mjs";
import { bodyLitPipelineDesc } from "../render/voxelBodies.mjs";
import { boxMesh } from "../render/buildingLab.mjs";
import { carMesh, CAR_COLOURS } from "./raceReplayBake.mjs";

/** Material id 8, REBAR, in engine/MaterialRegistry.js and world/chunkMesherCore.js's PALETTE alike: the steel a cut reveals. A first
 *  draft took 7, which the registry already calls RUBBLE (CityGen's topple stamps it) and colours first -- the registry wins over
 *  the palette in render/voxelDevice.mjs's colourOf, so the steel drew as rubble and the topple's rubble counted as steel. */
export const REBAR_ID = 8;
export const CRASH = Object.freeze({
    speedLoss: 3,           // m/s of horizontal speed lost in ONE step (1/60 s) -- 180 m/s^2 of deceleration, a wall and nothing else
    minRadius: 1.2,         // the blast sphere at the threshold, in voxels
    radiusPer: 0.12,        // more radius per m/s lost above the threshold
    maxRadius: 3.5,
    bite: 0.6,              // how far into the wall the blast centre is pushed, so the sphere takes the face and not just its skin
    pad: 1.2,               // the footprint's reach for the against-a-building test (the chassis is 0.75 wide, 1.4 long)
    cage: Object.freeze({ pitch: 3, radius: 0.55, axes: "xy" }),   // rods every three voxels along x and up y, one voxel thick
    support: 0.3,           // a building whose ground floor stands on less than this share of its footprint has nothing left to stand on
    park: Object.freeze([0, -500, 0]),
    groundY: 0,             // trackWorld stamps the city with groundY 0: building voxels from y = 1
});
/**
 * v4822 -- ROOM FOR A CRATER IN EVERY SLOT. voxelDeviceEdit's default slot is a quarter more than its chunk needs today, at least 256
 * vertices, and greedy meshing makes this city's chunks SMALL (seed 1: 62 chunks, 18 to 852 vertices, 33k in all): a single
 * cataclysm into a 228-vertex chunk adds 174 and outgrows its 285-vertex slot, and an outgrown slot repacks the whole world into a
 * buffer bigger than the scene was built with -- the scene has to be built again. Measured at seed 1: with the defaults the FIRST
 * shell of a 12-cataclysm barrage repacked the world on every one of six different buildings; with these (a slot at least 1024
 * vertices and twice what its chunk needs) none of the six did, for 69k vertices of buffer instead of 33k (2.8 MB, the tail a run of
 * zero-area triangles that draw nothing). It is crashWorld's DEFAULT: a car crash outgrew a slot the same way (a NEIGHBOUR chunk with 54 vertices
 * of slack grew by a few at a seam, and the world repacked under race-crash.html's scene, which never answers state.outgrown -- the
 * scene was left stale, in 7 chunks under the old all-neighbours rule and 1 under the narrowed one, which is how the car-crash browser
 * rows noticed: they had passed because the stale chunks happened to be out of the camera's sight). Pass `{}` for the voxelDeviceEdit defaults.
 */
export const ROOMY = Object.freeze({ minSlot: 1024, headroom: 1.0 });
const NEIGHBOURS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The flat track's world with its city, plus the edit state (the slots) the device draws from. */
export function crashWorld(track, CityGen, opts = {}, slots = ROOMY) {
    const world = miniWorld();
    const { rects, city } = T.trackWorld(track, world, CityGen, opts);
    const state = editState(world, slots); world.editLog = [];   // from here on the world says where it was edited: render/voxelDamage.mjs's syncDirty re-meshes only the chunks an edit can reach
    return { world, rects, city, state, track, colliders: null, phys: null, parked: new Set(), impacts: [], debris: null };   // debris: a VoxelDebrisSystem a page may hang here, burst by every blast (crashInto and shellInto read it)
}

/** The buildings' static boxes in the physics world, remembered on `g` so a collapse can park the right one. */
export function buildingColliders(g, phys) {
    g.phys = phys; g.colliders = addBuildings(phys, g.rects, CRASH.groundY);
    return g.colliders;
}

/** The index of the building whose padded footprint holds the point, or -1. */
export function buildingHit(rects, pos, pad = CRASH.pad) {
    for (let i = 0; i < rects.length; i++) { const r = rects[i]; if (pos[0] >= r.x - pad && pos[0] <= r.x + r.w + pad && pos[2] >= r.z - pad && pos[2] <= r.z + r.d + pad) return i; }
    return -1;
}

/** The nearest point of the footprint to the car, pushed `bite` into the wall, at the car's height. */
export function contactPoint(r, pos, bite = CRASH.bite) {
    const cx = clamp(pos[0], r.x, r.x + r.w), cz = clamp(pos[2], r.z, r.z + r.d);
    const nx = pos[0] - cx, nz = pos[2] - cz, l = Math.hypot(nx, nz);
    if (l < 1e-9) return [pos[0], pos[1], pos[2]];   // already inside the footprint
    return [cx - nx / l * bite, pos[1], cz - nz / l * bite];
}

/** The blast radius for a speed lost: the threshold's radius, growing with the loss, capped. */
export const blastRadius = (dv) => clamp(CRASH.minRadius + CRASH.radiusPer * (dv - CRASH.speedLoss), CRASH.minRadius, CRASH.maxRadius);

/**
 * Reveal the cage: every solid voxel of the building that the removed voxels expose and that lies on a rod becomes REBAR_ID.
 * The cage is placed on the building's own corner, one voxel in, so the rods pass through voxel centres.
 */
export function revealRebar(world, removed, rect) {
    const cage = { ...CRASH.cage, offset: [rect.x + 0.5, CRASH.groundY + 1.5, rect.z + 0.5] };
    const seen = new Set(); let n = 0;
    for (const v of removed) for (const [dx, dy, dz] of NEIGHBOURS) {
        const x = v.x + dx, y = v.y + dy, z = v.z + dz, k = x + "," + y + "," + z;
        if (seen.has(k)) continue; seen.add(k);
        if (x < rect.x || x >= rect.x + rect.w || z < rect.z || z >= rect.z + rect.d || y <= CRASH.groundY) continue;
        const id = world.voxelAt(x, y, z); if (!id || id === REBAR_ID) continue;
        if (isRebar(x + 0.5, y + 0.5, z + 0.5, cage)) { world.setVoxel(x, y, z, REBAR_ID); n++; }
    }
    return n;
}

/** Whether a voxel centre lies on the building's cage: the gate's independent reading of the same rule. */
export function onRod(rect, x, y, z) { return isRebar(x + 0.5, y + 0.5, z + 0.5, { ...CRASH.cage, offset: [rect.x + 0.5, CRASH.groundY + 1.5, rect.z + 0.5] }); }

/** The ground floor's standing share of the footprint: the support a building stands on. */
export function support(world, rect) { let n = 0; for (let x = rect.x; x < rect.x + rect.w; x++) for (let z = rect.z; z < rect.z + rect.d; z++) if (world.voxelAt(x, CRASH.groundY + 1, z)) n++; return n / (rect.w * rect.d); }

/**
 * The impact: the blast, the charge, the rebar, the collapse. The blast centre is the first SOLID voxel along the car's heading
 * from its bumper, pushed CRASH.bite further in -- a first draft blasted at the footprint's face, and every ram after the first
 * carved the air of the first crater while the static box still stopped the car. Two rules of this module's own, said plainly:
 * CityGen's crumble passes remove voxels it never charges, so here the building is charged for EVERY voxel that left its
 * footprint (the hit points are the standing voxels, v4510's own definition); and a building whose ground floor stands on less
 * than CRASH.support of its footprint is charged the rest, because a car takes the ground floor and the floors above do not stay
 * up on their own -- CityGen's topple does the falling either way.
 */
export function crashInto(g, i, pre, post, dv, ctx = {}, at = post.pos) {
    const rect = g.rects[i], radius = blastRadius(dv), f = pre.forward, dir = [f[0], 0, f[2]];
    const hit = raycastVoxels(g.world, [at[0], at[1], at[2]], dir, rect.w + rect.d + 4);
    const point = hit && hit.x >= rect.x && hit.x < rect.x + rect.w && hit.z >= rect.z && hit.z < rect.z + rect.d ? [hit.x + 0.5 + dir[0] * CRASH.bite, at[1], hit.z + 0.5 + dir[2] * CRASH.bite] : contactPoint(rect, at);
    const b = g.city.buildingAt(rect.x + 0.5, rect.z + 0.5), hpBefore = b ? b.hp : null, standingBefore = footprint(g.world, rect).solid;
    // charged from the first building layer (groundY + 1): a first draft passed groundY itself, and the floor voxels UNDER the
    // building -- laid by trackWorld, not the building's own -- were charged to it, eleven hit points the footprint never held
    const blast = blastAt(g.state, { debris: ctx.debris || g.debris || null, city: g.city, groundY: CRASH.groundY + 1 }, point, radius);
    const charged = blast.buildings.find((row) => row.building === b) || null;
    let crumbled = 0, collapsed = false;
    if (b && b.state !== "toppled") {
        const standing = footprint(g.world, rect).solid, gone = standingBefore - standing - (charged ? charged.lost : 0);
        if (gone > 0) { crumbled = gone; g.city.damageAt(rect.x + 0.5, rect.z + 0.5, gone, { x: dir[0], z: dir[2] }); }
        if (b.state !== "toppled" && support(g.world, rect) < CRASH.support && b.hp > 0) { collapsed = true; g.city.damageAt(rect.x + 0.5, rect.z + 0.5, b.hp, { x: dir[0], z: dir[2] }); }
    }
    const rebar = b && b.state !== "toppled" ? revealRebar(g.world, blast.removed, rect) : 0;
    const sync = syncDirty(g.state);
    const toppled = !!(b && b.state === "toppled");
    if (toppled && g.colliders && g.colliders[i] != null && !g.parked.has(i)) { g.phys.setTransform(g.colliders[i], CRASH.park.slice()); g.parked.add(i); }
    const rec = { building: i, dv, speedBefore: Math.hypot(pre.vel[0], pre.vel[2]), point, radius, deepened: !!hit, removed: blast.removed.length, lost: charged ? charged.lost : 0, crumbled, collapsed,
                  hpBefore, hp: b ? b.hp : null, maxHp: b ? b.maxHp : null, state: b ? b.state : null, toppled, rebar, debris: blast.debris,
                  chunks: blast.sync.chunks.length + sync.chunks.length, ms: blast.ms };
    g.impacts.push(rec);
    return rec;
}

/**
 * v4822 -- the same wall, hit by a turret shell instead of a car (physics/turret.mjs's stepShells building event, brain/
 * gunnerPolicy.mjs's turretTick). A shell already has the one thing crashInto had to raycast for: an exact point. So this
 * is crashInto's body from the blast down, unchanged, keyed on a point + radius + a caller-picked direction instead of a
 * raycast refined from a car's pre/post pose -- the same blastAt, the same crumble-beyond-the-blast bookkeeping, the same
 * support collapse, the same rebar reveal, the same park-the-collider-on-topple. THE TWO ARE MEANT TO MOVE TOGETHER: a
 * rule that changes what happens when a building takes a blast belongs in both, or the wall behaves differently depending
 * on what hit it for a reason nobody chose.
 */
export function shellInto(g, i, point, radius, dir, ctx = {}) {
    const rect = g.rects[i];
    const b = g.city.buildingAt(rect.x + 0.5, rect.z + 0.5), hpBefore = b ? b.hp : null, standingBefore = footprint(g.world, rect).solid;
    const blast = blastAt(g.state, { debris: ctx.debris || g.debris || null, city: g.city, groundY: CRASH.groundY + 1 }, point, radius);
    const charged = blast.buildings.find((row) => row.building === b) || null;
    let crumbled = 0, collapsed = false;
    if (b && b.state !== "toppled") {
        const standing = footprint(g.world, rect).solid, gone = standingBefore - standing - (charged ? charged.lost : 0);
        if (gone > 0) { crumbled = gone; g.city.damageAt(rect.x + 0.5, rect.z + 0.5, gone, dir); }
        if (b.state !== "toppled" && support(g.world, rect) < CRASH.support && b.hp > 0) { collapsed = true; g.city.damageAt(rect.x + 0.5, rect.z + 0.5, b.hp, dir); }
    }
    const rebar = b && b.state !== "toppled" ? revealRebar(g.world, blast.removed, rect) : 0;
    const sync = syncDirty(g.state);
    const toppled = !!(b && b.state === "toppled");
    if (toppled && g.colliders && g.colliders[i] != null && !g.parked.has(i)) { g.phys.setTransform(g.colliders[i], CRASH.park.slice()); g.parked.add(i); }
    const rec = { building: i, point, radius, removed: blast.removed.length, lost: charged ? charged.lost : 0, crumbled, collapsed,
                  hpBefore, hp: b ? b.hp : null, maxHp: b ? b.maxHp : null, state: b ? b.state : null, toppled, rebar, debris: blast.debris,
                  chunks: blast.sync.chunks.length + sync.chunks.length, ms: blast.ms };
    g.impacts.push(rec);
    return rec;
}

/**
 * v4822 -- `shells` cataclysm-size shells at ONE building, from a shooter standing at `from` ([x, z]): the wall's face as that shooter
 * sees it, the height and the sideways offset marching through a fixed pattern so the barrage chews the face rather than the same
 * voxels. Deterministic (no random), through shellInto exactly as turretTick calls it. It is what race-brain.html's ?shell=N puts in
 * front of a person and what the gates put in front of a repack -- one definition of "a barrage", so what the page shows is what
 * the gate measured.
 */
export function barrage(g, i, { shells = 12, from = [0, 0], radius = blastRadius(40) } = {}) {
    const r = g.rects[i], dx = r.x + r.w / 2 - from[0], dz = r.z + r.d / 2 - from[1], l = Math.hypot(dx, dz) || 1, out = [];
    for (let k = 0; k < shells; k++) {
        const y = 1.5 + ((k * 3) % Math.max(1, r.h - 1)), side = ((k * 5) % 7 - 3) * 0.8, face = contactPoint(r, [from[0], y, from[1]]);
        out.push(shellInto(g, i, [face[0] - dz / l * side, y, face[2] + dx / l * side], radius, { x: dx / l, z: dz / l }));
    }
    return out;
}

/** One step of the car, then the impact test on the speed it lost. */
export function crashStep(g, car, surface, input, ctx = {}, dt = CAR.dt) {
    // stepCar's returned pose is the one its forces were computed FROM (the pose before the step), so the pose after is read
    // again: the first draft compared that pre-step pose with itself and measured a speed loss of exactly zero at every wall
    const pre = carPose(g.phys, car), r = stepCar(g.phys, car, surface, input, dt), post = carPose(g.phys, car);
    const dv = Math.hypot(pre.vel[0] - post.vel[0], pre.vel[2] - post.vel[2]);
    let impact = null;
    if (dv >= CRASH.speedLoss) {
        // the bumper, not the centre: the chassis stops a half-length plus box3d's contact skin short of the wall
        const f = pre.forward, bumper = [pre.pos[0] + f[0] * CAR.half[2], pre.pos[1], pre.pos[2] + f[2] * CAR.half[2]];
        let i = buildingHit(g.rects, bumper); if (i < 0) i = buildingHit(g.rects, pre.pos, CRASH.pad + CAR.half[2]);
        if (i >= 0) impact = crashInto(g, i, pre, post, dv, ctx, bumper);
    }
    return { ...r, pose: post, dv, impact };
}

/** A lane `from` metres long before a building's -x face, clear of every other footprint: the approach the gate and the page ram along. */
export function laneBefore(rects, i, from) {
    const r = rects[i], x0 = r.x - from - 2, x1 = r.x, z0 = r.z - 1, z1 = r.z + r.d + 1;
    for (let j = 0; j < rects.length; j++) { if (j === i) continue; const o = rects[j]; if (o.x + o.w > x0 && o.x < x1 && o.z + o.d > z0 && o.z < z1) return null; }
    return { x: r.x - from, z: r.z + r.d / 2, yaw: Math.PI / 2, i };
}

/** The first building with a clear lane before its -x face, or -1. */
export function rammable(rects, from = 8) { for (let i = 0; i < rects.length; i++) if (laneBefore(rects, i, from)) return i; return -1; }

/** Place the car at the lane's start facing +x and launch it at `speed` m/s. */
export function launch(g, i, { speed = 15, from = 8 } = {}) {
    const lane = laneBefore(g.rects, i, from); if (!lane) throw new Error(`crashDamage: building ${i} has no clear lane before its -x face`);
    const car = createCar(g.phys, { x: lane.x, z: lane.z, yaw: lane.yaw, groundY: ROAD_Y });
    g.phys.setVelocity(car.body, [speed, 0, 0]);
    return { car, lane };
}

/** Put an existing car back at the lane's start and launch it again (the wasm world is one per module: bodies are reused, never re-added). */
export function relaunch(g, car, i, { speed = 15, from = 8 } = {}) {
    const lane = laneBefore(g.rects, i, from); if (!lane) throw new Error(`crashDamage: building ${i} has no clear lane before its -x face`);
    const q = [0, Math.sin(lane.yaw / 2), 0, Math.cos(lane.yaw / 2)];
    g.phys.setTransform(car.body, [lane.x, ROAD_Y + CAR.half[1] + CAR.restLength + CAR.wheelRadius, lane.z], q); g.phys.setVelocity(car.body, [speed, 0, 0]);
    car.prevQ = q; car.steps = 0; car.last = null;
    return lane;
}

/** Full throttle at a point: the ram driver. */
export function ramDriver(target, { steerGain = 2.5 } = {}) {
    return (pose) => { const dx = target[0] - pose.pos[0], dz = target[2] - pose.pos[2], a = Math.atan2(dx, dz) - pose.yaw, w = Math.atan2(Math.sin(a), Math.cos(a)); return { throttle: 1, steer: clamp(steerGain * w, -1, 1), brake: 0 }; };
}

/** Run `steps` with a fixed input, folding the physics hash; returns the impacts that happened. */
export function ram(g, car, surface, { steps = 120, input = { throttle: 1, steer: 0, brake: 0 }, ctx = {} } = {}) {
    let h = 0x811c9dc5; const impacts = []; let pose = null;
    for (let s = 0; s < steps; s++) { const r = crashStep(g, car, surface, input, ctx); pose = r.pose; if (r.impact) impacts.push(r.impact); h = foldHash(h, g.phys.stateHash()); }
    return { impacts, pose, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
}
function foldHash(h, v) { for (let k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 0xff; h = Math.imul(h, 0x01000193); } return h; }

/** The voxels standing in a footprint by id, and the rebar among them: the gate's reading of a building's state. */
export function footprint(world, rect, h = rect.h) {
    let solid = 0, rebar = 0; const ids = new Map();
    for (let x = rect.x; x < rect.x + rect.w; x++) for (let z = rect.z; z < rect.z + rect.d; z++) for (let y = CRASH.groundY + 1; y <= CRASH.groundY + h; y++) { const id = world.voxelAt(x, y, z); if (!id) continue; solid++; if (id === REBAR_ID) rebar++; ids.set(id, (ids.get(id) || 0) + 1); }
    return { solid, rebar, ids };
}

/** The world's bounding sphere from its chunks: { centre, radius }, the record the world mesh is drawn as. */
export function worldSphere(world) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; const cs = world.chunkSize || 16;
    for (const c of world.chunks.values()) { x0 = Math.min(x0, c.cx * cs); x1 = Math.max(x1, (c.cx + 1) * cs); z0 = Math.min(z0, c.cz * cs); z1 = Math.max(z1, (c.cz + 1) * cs); }
    const y1 = world.chunkHeight || 64, centre = [(x0 + x1) / 2, y1 / 2, (z0 + z1) / 2];
    return { centre, radius: Math.hypot(x1 - x0, y1, z1 - z0) / 2 + 1 };
}

/**
 * *** THE WORLD IS ONE RECORD, AND A RECORD IS A SPHERE THE CULL TESTS. *** Every device scene of the sandbox rounds draws the
 * world as one record at the origin with scale 1 (voxelScene, editScene, damageScene, and this branch's replayScene and
 * terrainScene) -- and gpuDriven's cull reads that record's w as the sphere's RADIUS. A camera whose frustum does not hold the
 * origin culls the whole world, and this round's gate found it: looking at a crater 55 m from the origin, both backends drew no
 * world at all, and two frames that should have differed by six steel voxels were identical because neither held a building.
 * Here the world is recorded as gpuDriven's own contract reads it: a unit-space mesh (positions less the world's centre, over its
 * radius) drawn at the world's centre with scale = radius, so the cull sphere IS the world. The slots write world-space floats
 * (remeshChunks, through state.vbuf), so state.vbuf is a proxy that rescales positions on their way to the device. The other
 * scenes keep the origin record; they are named in the roadmap, not touched here.
 *
 * v4822 -- NAMED ONCE, because race-brain.html draws the same world the same way now (worldFleet below) and the unit-space
 * arithmetic is exactly the thing two copies would drift on. Returns { centre, radius, mesh, record, install } -- the mesh to
 * build the fleet from, the [centre, radius] record to draw it at, and install(vbuf) to point state.vbuf at the scene's own
 * vertex buffer once the scene exists. A chunk that outgrows its slot repacks the world (voxelDeviceEdit's remeshChunks), and
 * the repack is bigger than the buffer the scene was built with: the proxy does NOT write it past the end -- it sets
 * state.outgrown and skips it, and the caller builds a new scene from a new worldUnit(state), the only thing that can fix it.
 */
export function worldUnit(state) {
    const { centre, radius } = worldSphere(state.world);
    const unit = (positions) => { const out = Float32Array.from(positions); for (let i = 0; i < out.length; i += 3) { out[i] = (out[i] - centre[0]) / radius; out[i + 1] = (out[i + 1] - centre[1]) / radius; out[i + 2] = (out[i + 2] - centre[2]) / radius; } return out; };
    // the mesh is read back from state.vertexData, the CURRENT slots, and not from state.mesh: that is the pack the state was BORN with
    // (editState / a repack refresh it, an in-place edit does not), so a scene built from it after a few shells drew the city as it was
    // before them -- the toppled building standing again. Found by forcing a rebuild with no repack behind it (raceTurret-selfcheck.mjs).
    const cur = splitMesh(state.vertexData, state.capacity), mesh = { ...cur, positions: unit(cur.positions) }, record = Float32Array.from([centre[0], centre[1], centre[2], radius]);
    const install = (vbuf) => {
        const bytes = state.vertexData.byteLength; state.outgrown = false;
        state.vbuf = { write(data, byteOffset = 0) {
            if (byteOffset + data.byteLength > bytes) { state.outgrown = true; return; }
            const out = Float32Array.from(data); for (let i = 0; i < out.length; i += FLOATS) { out[i] = (out[i] - centre[0]) / radius; out[i + 1] = (out[i + 1] - centre[1]) / radius; out[i + 2] = (out[i + 2] - centre[2]) / radius; }
            vbuf.write(out, byteOffset);
        } };
    };
    return { centre, radius, mesh, record, install };
}

/**
 * v4822 -- the world as a world/kenneyKit.mjs kitScene extra fleet (race-brain.html's shape: the kit's tiles and trucks, the
 * world, the turrets). Pass it in `extraFleets`, then call `.install(scene)` once the scene exists. kitScene reads name, mesh,
 * pipeline, bind, records and extras and ignores the rest, so install rides on the same object.
 */
export function worldFleet(state, { light = SUN } = {}) {
    const wu = worldUnit(state);
    return {
        name: "world", mesh: wu.mesh, pipeline: litPipelineDesc({ cull: "none" }), bind: litBind(light), records: wu.record, extras: new Float32Array(4),
        install(scene) { const f = scene.fleets.find((q) => q.name === "world"); if (!f) throw new Error("crashDamage.worldFleet: the scene has no fleet named world"); wu.install(f.vbuf); },
    };
}

/**
 * v4822 -- the debris a carve bursts, as a kitScene extra fleet (race-brain.html): render/voxelDamage.mjs's debrisRecords() and
 * debrisLitPipelineDesc() (the cubes, the colour of the voxel each came from in the extras), `cap` records all parked until
 * placeDebris() writes the live particles over them each frame. Visual only: the particles are a VoxelDebrisSystem hung on the city as
 * `g.debris` (shellInto and crashInto both read it), they never reach cityHash or a physics body, and Math.random is in their burst, so
 * two runs of one race draw different cubes and play one race.
 */
export function debrisFleet({ light = SUN, cap = DAMAGE.debrisCap } = {}) {
    const parked = debrisRecords({ getInstanceData: () => ({ count: 0, data: [] }) }, cap);
    return { name: "debris", mesh: boxMesh([1, 1, 1, 1]), pipeline: debrisLitPipelineDesc(), bind: litBind(light), records: parked.records, extras: parked.extras };
}

/** this frame's particles into a dynamic kit scene, `base` = the record index of the fleet's first cube; the number of live ones */
export function placeDebris(scene, base, debris, cap = DAMAGE.debrisCap) {
    const d = debrisRecords(debris, cap);
    scene.kitRecords.set(d.records, base * 4); scene.kitExtras.set(d.extras, base * 4);
    return d.count;
}

/** The fleets: the world's slots (record 0), the car in quat mode (record 1), the debris (the rest). state.vbuf is the slots' buffer. */
export function crashScene(device, state, debris, G, L, { light = SUN, cap = DAMAGE.debrisCap, colour = CAR_COLOURS[0], extras = null } = {}) {   // extras: v4591
    // v4591 (task 80): `extras` = { count, fleets, fill(rec, ext, at) } -- world/buildingTopple.mjs's reserved block fleets ride behind the debris, one record each
    const xn = extras ? extras.count : 0, count = 2 + cap + xn, fleetOf = new Uint32Array(count); fleetOf[1] = 1; for (let i = 2; i < 2 + cap; i++) fleetOf[i] = 2; for (let k = 0; k < xn; k++) fleetOf[2 + cap + k] = 3 + k;
    const wu = worldUnit(state), { centre, radius } = wu, worldMesh = wu.mesh;
    const rec = new Float32Array(count * 4), ext = new Float32Array(count * 4); rec.set(wu.record, 0);
    const carRec = new Float32Array([0, -500, 0, 1]), carExt = new Float32Array([0, 0, 0, 1]);
    const fill = () => { rec.set(carRec, 4); ext.set(carExt, 4); const d = debrisRecords(debris, cap); rec.set(d.records, 8); ext.set(d.extras, 8); if (extras) extras.fill(rec, ext, 2 + cap); };
    fill(); const buffer = device.backend === "webgpu" ? device.buffer({ data: rec, usage: "storage" }) : null;   // v4520: a moving source brings a buffer
    const records = { count, cpu: () => { fill(); return rec; }, ...(buffer ? { buffer } : {}) }, headings = { cpu: () => { fill(); if (buffer) buffer.write(rec); return ext; } };
    const fleets = [
        { name: "world", lods: [{ name: "only", mesh: worldMesh }], layout: G.LAYOUTS.lit, pipeline: litPipelineDesc({ cull: "none" }), bind: litBind(light) },
        { name: "car", lods: [{ name: "only", mesh: carMesh(colour) }], layout: G.LAYOUTS.lit, pipeline: bodyLitPipelineDesc(), bind: litBind(light) },
        { name: "debris", lods: [{ name: "only", mesh: boxMesh([1, 1, 1, 1]) }], layout: G.LAYOUTS.lit, pipeline: debrisLitPipelineDesc(), bind: litBind(light) },
        ...(extras ? extras.fleets : []),
    ];
    const sc = G.makeGpuDrivenScene(device, { fleets, fleetOf, thresholds: [], records, headings });
    wu.install(sc.fleets[0].vbuf);   // the proxy: the slots' world-space floats rescaled to the record's unit space on the way to the device
    state.scene = sc;
    const setCar = (pose) => { carRec.set([pose.pos[0], pose.pos[1], pose.pos[2], 1]); carExt.set(pose.quat); };
    return { scene: sc, setCar, count, centre, radius, extrasBase: 3 };
}

export { trackSurface };

export function reportLines() {
    return [
        `crashDamage: a car that loses ${CRASH.speedLoss} m/s in one step against a building blasts it through voxelDamage (radius ${CRASH.minRadius} + ${CRASH.radiusPer}/m/s, at most ${CRASH.maxRadius}), CityGen charges the hit points, the debris bursts`,
        `the cut reveals rebar.mjs's cage at voxel scale (rods every ${CRASH.cage.pitch} voxels along x and y) as palette id ${REBAR_ID}; at zero hit points CityGen topples the building and its static box is parked -- or, with world/buildingTopple.mjs installed (v4591), the block above the ground floor falls as a box3d body first`,
    ];
}
