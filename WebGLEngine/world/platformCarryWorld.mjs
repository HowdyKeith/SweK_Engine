// WebGLEngine/world/platformCarryWorld.mjs -- v4631
//
// Task board #84. physics/character/capsuleCollide.mjs's carryOnPlatform() (task #80) has been gated and
// correct since it shipped -- and, until this file, called from nowhere: nothing in this tree ever built a
// platform whose own frame-to-frame transform it could carry a rider through. This is that platform, twice
// over (a ferry that TRANSLATES across a gap, a turntable that ROTATES in place), because carryOnPlatform's
// own distinguishing feature over "just add the platform's position delta" is the rotation half -- a demo with
// only a translating platform would never actually exercise it live.
//
// THE SAME SHAPE AS THE OTHER TWO DEMOS' OWN WORLD MODULES: buildPlatformCarryWorld() plus a SPAWN, handed to
// camera.setWorld({colliderBVH}) so camera.js's already-shipped Stage B capsule path (task #13) does the
// falling/walking/jumping, unmodified. What is NEW here is that the collider is not static: platformBVHAt(t)
// rebuilds a fresh MeshBVH every call from the static pads (built once, cached) plus both platforms' OWN
// current-frame triangles, transformed into world space with the SAME qRotate/qConj carryOnPlatform itself
// uses (imported, not reinvented -- a second hand-rolled rotation could quietly disagree with the one the
// carry math actually runs on). At this triangle count (a double-digit total) a full rebuild every frame is
// cheap and easy to reason about; a real scene with a large static portion would want a proper static/dynamic
// BVH split instead, named here rather than quietly assumed away.
//
// THE VISUAL AND THE COLLIDER ARE, AGAIN, TWO SEPARATE THINGS BUILT FROM THE SAME NUMBERS -- but not the same
// TECHNIQUE this time. CONTROLLER LAB (task #82) carves static voxels as a visual stand-in because voxels
// cannot move. The two platforms here move and rotate, so their visual is a small flat splatMesh.mjs slabCloud
// (task #83's own rendering path, gpu/SplatScene.js) loaded ONCE per platform and repositioned every frame via
// the renderer's own per-layer setPosition/setRotation -- cheap, because a splat layer already carries its own
// transform, unlike a MeshBVH which has none and must be rebuilt. The static start/mid pads stay voxels, the
// same visual technique CONTROLLER LAB already established for geometry that never moves.
//
// ON-DECK MEMBERSHIP IS A SPATIAL TEST, NOT A CONTACT-IDENTITY ONE. depenetrateCapsule's own return value
// (grounded, groundNormal) names a NORMAL, not the object the contact belongs to -- camera.js and
// capsuleCollide.mjs are both unmodified by this file (see capsuleCollide.mjs's own two-line export of
// qConj/qRotate, the only change either file needed). Instead, onDeck() transforms the rider's own feet
// position into the platform's LOCAL space (as of the PREVIOUS frame, which is what the rider was actually
// resolved against) and checks it against the deck's own half-extents -- correct for a square deck under
// rotation because a point transformed into the deck's own frame reads the same local footprint regardless of
// which way the deck is currently facing in world space.
"use strict";
import { MeshBVH, trianglesFrom } from "../mesh/meshBVH.mjs";
import { qRotate, qConj, add as addV } from "../physics/character/capsuleCollide.mjs";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const START_PAD = { center: [0, 0, 0], halfExtents: [3, 3] };
export const MID_PAD = { center: [14.5, 0, 0], halfExtents: [2.5, 3] };

// Docked at nearX (spans [3,6], touching START_PAD's edge at x=3) for dockTime seconds, travels to farX
// (spans [9,12], touching MID_PAD's edge at x=12) over travelTime seconds, docks there, and reverses -- a
// ping-pong with a DWELL at each end, not continuous sine motion, so a player (or this file's own gate,
// driving a real Camera) always has a generous window to walk on before it starts moving.
export const FERRY = { halfExtents: [1.5, 1.5], nearX: 4.5, farX: 10.5, y: 0, z: 0, dockTime: 1.5, travelTime: 3.0 };
export const FERRY_CYCLE = 2 * (FERRY.dockTime + FERRY.travelTime);

// Apothem (centre-to-edge distance of a square) is 2.5 regardless of rotation, so MID_PAD's edge at x=17
// overlaps the turntable's own nearest point (at most x=19-2.5=16.5) at every rotation phase, not just some.
export const TURNTABLE = { center: [19, 0, 0], halfExtents: [2.5, 2.5], angularSpeed: 0.6 };

export const RESPAWN_Y = -10;   // fall this far below any platform and the demo resets you to SPAWN
// The corridor runs down +X (start pad -> ferry -> mid pad -> turntable). camera.js's own _moveFP has
// forward = (sin(yaw), -cos(yaw)) -- yaw=0 faces -Z, not +X -- so SPAWN faces +Z/2 (yaw = PI/2, where
// forward = (1,0)) rather than 0, or a player's first KeyW would walk them away from the whole level.
export const SPAWN = { x: START_PAD.center[0], y: START_PAD.center[1], z: START_PAD.center[2], yaw: Math.PI / 2 };

const IDENTITY_Q = [0, 0, 0, 1];

/** The ferry's own {p, q} at time t -- pure function of t, no rotation (q is always identity). */
export function ferryTransformAt(t) {
    const phase = ((t % FERRY_CYCLE) + FERRY_CYCLE) % FERRY_CYCLE;
    const { dockTime, travelTime, nearX, farX, y, z } = FERRY;
    let x;
    if (phase < dockTime) x = nearX;
    else if (phase < dockTime + travelTime) x = nearX + (farX - nearX) * (phase - dockTime) / travelTime;
    else if (phase < 2 * dockTime + travelTime) x = farX;
    else x = farX + (nearX - farX) * (phase - (2 * dockTime + travelTime)) / travelTime;
    return { p: [x, y, z], q: IDENTITY_Q };
}

/** The turntable's own {p, q} at time t -- pure rotation about its own fixed centre, no translation. */
export function turntableTransformAt(t) {
    const half = (TURNTABLE.angularSpeed * t) / 2;
    return { p: TURNTABLE.center.slice(), q: [0, Math.sin(half), 0, Math.cos(half)] };
}

/** Is worldPos within halfExtents of xform's own local origin, in xform's own local XZ plane (within eps of
 *  its local y=0 deck)? The rotation-aware test a plain world-space AABB would get wrong the moment a square
 *  deck is not axis-aligned. */
export function onDeck(worldPos, xform, halfExtents, eps = 0.35) {
    const local = qRotate(qConj(xform.q), sub(worldPos, xform.p));
    return Math.abs(local[0]) <= halfExtents[0] && Math.abs(local[2]) <= halfExtents[1] && Math.abs(local[1]) <= eps;
}

function padTriangles(center, halfExtents) {
    const [hx, hz] = halfExtents, [cx, cy, cz] = center;
    const a = [cx - hx, cy, cz - hz], b = [cx + hx, cy, cz - hz], c = [cx + hx, cy, cz + hz], d = [cx - hx, cy, cz + hz];
    return [[a, b, c], [a, c, d]];
}

/** A deck's own two triangles, LOCAL footprint (halfExtents at local y=0) baked into world space via xform --
 *  the same {p, q} shape, and the same qRotate/qConj, carryOnPlatform() itself runs the rider's position
 *  through, so the geometry a rider stands on and the math that carries them agree by construction. */
function deckTrianglesAt(xform, halfExtents) {
    const [hx, hz] = halfExtents;
    const local = [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz]];
    const world = local.map((p) => addV(xform.p, qRotate(xform.q, p)));
    return [[world[0], world[1], world[2]], [world[0], world[2], world[3]]];
}

const STATIC_TRIANGLES = [...padTriangles(START_PAD.center, START_PAD.halfExtents), ...padTriangles(MID_PAD.center, MID_PAD.halfExtents)];

/** The static pads' own visual stand-in -- solid voxel columns over each pad's integer footprint at y=0, the
 *  SAME "two things built from the same numbers" technique CONTROLLER LAB's own controllerLabVoxelColumns()
 *  established (task #82). Returns [x, y, z] triples for world.setVoxel(x, y, z, VOXEL.STONE). The ferry and
 *  turntable are NOT here -- voxels cannot move, so they get a splat-deck visual instead (this file's own
 *  header). Call world.flatten({floorY: -1}) first, NOT {floorY: 0}: floorY 0 would blanket-fill a solid
 *  floor under the GAP too (world.js's own flatten fills one layer across every chunk unconditionally when
 *  floorY >= 0), silently erasing the whole reason a moving platform is needed. A negative floorY skips that
 *  fill entirely, leaving a clean, empty world for these columns to be the only floor in. */
export function platformCarryVoxelColumns() {
    const cols = [];
    for (const pad of [START_PAD, MID_PAD]) {
        const [cx, , cz] = pad.center, [hx, hz] = pad.halfExtents;
        for (let x = Math.floor(cx - hx); x < Math.ceil(cx + hx); x++)
            for (let z = Math.floor(cz - hz); z < Math.ceil(cz + hz); z++)
                cols.push([x, 0, z]);
    }
    return cols;
}

/** Rebuilds a fresh MeshBVH for time t: the static pads (unchanged, but a full rebuild is simplest and cheap
 *  at this triangle count -- see this file's own header) plus both platforms' own triangles at t's transform.
 *  Returns the transforms too, so a caller (this file's own gate, or main.js's demo tick()) doesn't have to
 *  recompute them a second time to know what it just built the collider from. */
export function platformWorldAt(t) {
    const ferryXform = ferryTransformAt(t);
    const turntableXform = turntableTransformAt(t);
    const triangles = [
        ...STATIC_TRIANGLES,
        ...deckTrianglesAt(ferryXform, FERRY.halfExtents),
        ...deckTrianglesAt(turntableXform, TURNTABLE.halfExtents),
    ];
    const flat = { positions: [], indices: [] };
    for (const [a, b, c] of triangles) {
        const base = flat.positions.length;
        flat.positions.push(a, b, c);
        flat.indices.push([base, base + 1, base + 2]);
    }
    const colliderBVH = new MeshBVH(trianglesFrom(flat.positions, flat.indices));
    return { colliderBVH, ferryXform, turntableXform, triangleCount: colliderBVH.count };
}

export function buildPlatformCarryWorld() {
    return { ...platformWorldAt(0), SPAWN };
}
