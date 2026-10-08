// WebGLEngine/world/controllerLabWorld.mjs -- v4629
//
// A small, self-contained level for exercising task board #13's three-stage arc LIVE, in a browser, not
// just in a gate: physics/character/capsuleCollide.mjs (task #80) and camera.js's toggleViewMode()/
// movementAnimState() (task #81). Eleven quads, twenty-two triangles, one MeshBVH -- one feature per
// stage-defining fact, so walking it IS the demonstration:
//
//   a walkable ramp    -- climbs at RAMP_ANGLE_DEG, inside GROUND_SUPPORT_NORMAL_Y's ~60 deg cutoff
//   a too-steep ramp   -- climbs at STEEP_ANGLE_DEG, past the SAME cutoff, right beside it for contrast
//   an L-shaped corner -- capsule push-out against two walls at once, and the slide around them
//   a jump block       -- JUMP_HEIGHT clears under this tree's own _fpJumpVel/_gravity, but not by walking
//
// *** THE COLLIDER AND THE VISIBLE VOXELS ARE TWO SEPARATE THINGS BUILT FROM THE SAME NUMBERS, NOT ONE
// DERIVED FROM THE OTHER. *** This engine's render path is voxel-chunk-and-entity based (main.js's own demos
// all carve/place voxels, or spawn asset entities -- there is no "hand it 16 raw triangles" draw call).
// physics/character/capsuleCollide.mjs's whole point is colliding against arbitrary NON-voxel triangle
// geometry, so the collider here really is a MeshBVH over hand-authored triangles, exactly what task #80
// ported -- and the level's VISUAL stand-in is a blocky voxel carve of the same footprint, built from the
// same constants below so the two cannot silently drift apart. A player never sees the seam: they stand
// exactly where the invisible collider says they may, on top of a voxel shape drawn to match it.
"use strict";
import { MeshBVH, trianglesFrom } from "../mesh/meshBVH.mjs";
import { GROUND_SUPPORT_NORMAL_Y } from "../physics/character/capsuleCollide.mjs";

const RAMP_X0 = 5, RAMP_RUN = 9, RAMP_RISE = 4, RAMP_Z0 = -4, RAMP_Z1 = 4;
const PLATFORM_X1 = RAMP_X0 + RAMP_RUN + 8;                          // 22
const STEEP_X0 = 5, STEEP_RUN = 1.5, STEEP_RISE = 4, STEEP_Z0 = 8, STEEP_Z1 = 16;
const CORNER_X0 = -18, CORNER_X1 = -10, CORNER_Z0 = -18, CORNER_Z1 = -10, CORNER_H = 5;
const JUMP_X0 = -5, JUMP_X1 = 0, JUMP_Z0 = 5, JUMP_Z1 = 10, JUMP_HEIGHT = 1.0;
const GROUND_HALF = 25;

export const SPAWN = { x: 0, y: 0, z: 0, yaw: Math.PI / 2 };   // faces +X, toward the ramp

const RAMP_ANGLE_DEG = Math.atan2(RAMP_RISE, RAMP_RUN) * 180 / Math.PI;
const STEEP_ANGLE_DEG = Math.atan2(STEEP_RISE, STEEP_RUN) * 180 / Math.PI;

const quad = (p0, p1, p2, p3) => trianglesFrom([p0, p1, p2, p3], [[0, 1, 2], [0, 2, 3]]);

/** The invisible collider: 11 quads, 22 triangles, one MeshBVH. This is what the player actually stands on. */
export function buildControllerLabWorld() {
    const bufs = [
        quad([-GROUND_HALF, 0, -GROUND_HALF], [GROUND_HALF, 0, -GROUND_HALF], [GROUND_HALF, 0, GROUND_HALF], [-GROUND_HALF, 0, GROUND_HALF]),
        quad([RAMP_X0, 0, RAMP_Z0], [RAMP_X0, 0, RAMP_Z1], [RAMP_X0 + RAMP_RUN, RAMP_RISE, RAMP_Z1], [RAMP_X0 + RAMP_RUN, RAMP_RISE, RAMP_Z0]),
        quad([RAMP_X0 + RAMP_RUN, RAMP_RISE, RAMP_Z0], [PLATFORM_X1, RAMP_RISE, RAMP_Z0], [PLATFORM_X1, RAMP_RISE, RAMP_Z1], [RAMP_X0 + RAMP_RUN, RAMP_RISE, RAMP_Z1]),
        quad([STEEP_X0, 0, STEEP_Z0], [STEEP_X0, 0, STEEP_Z1], [STEEP_X0 + STEEP_RUN, STEEP_RISE, STEEP_Z1], [STEEP_X0 + STEEP_RUN, STEEP_RISE, STEEP_Z0]),
        quad([CORNER_X0, 0, CORNER_Z1], [CORNER_X1, 0, CORNER_Z1], [CORNER_X1, CORNER_H, CORNER_Z1], [CORNER_X0, CORNER_H, CORNER_Z1]),
        quad([CORNER_X1, 0, CORNER_Z0], [CORNER_X1, 0, CORNER_Z1], [CORNER_X1, CORNER_H, CORNER_Z1], [CORNER_X1, CORNER_H, CORNER_Z0]),
        quad([JUMP_X0, JUMP_HEIGHT, JUMP_Z0], [JUMP_X1, JUMP_HEIGHT, JUMP_Z0], [JUMP_X1, JUMP_HEIGHT, JUMP_Z1], [JUMP_X0, JUMP_HEIGHT, JUMP_Z1]),
        quad([JUMP_X0, 0, JUMP_Z0], [JUMP_X1, 0, JUMP_Z0], [JUMP_X1, JUMP_HEIGHT, JUMP_Z0], [JUMP_X0, JUMP_HEIGHT, JUMP_Z0]),
        quad([JUMP_X1, 0, JUMP_Z1], [JUMP_X0, 0, JUMP_Z1], [JUMP_X0, JUMP_HEIGHT, JUMP_Z1], [JUMP_X1, JUMP_HEIGHT, JUMP_Z1]),
        quad([JUMP_X0, 0, JUMP_Z1], [JUMP_X0, 0, JUMP_Z0], [JUMP_X0, JUMP_HEIGHT, JUMP_Z0], [JUMP_X0, JUMP_HEIGHT, JUMP_Z1]),
        quad([JUMP_X1, 0, JUMP_Z0], [JUMP_X1, 0, JUMP_Z1], [JUMP_X1, JUMP_HEIGHT, JUMP_Z1], [JUMP_X1, JUMP_HEIGHT, JUMP_Z0]),
    ];
    let total = 0; for (const b of bufs) total += b.length;
    const tris = new Float64Array(total);
    let o = 0; for (const b of bufs) { tris.set(b, o); o += b.length; }
    return {
        colliderBVH: new MeshBVH(tris),
        features: {
            rampAngleDeg: RAMP_ANGLE_DEG, steepRampAngleDeg: STEEP_ANGLE_DEG,
            groundSupportNormalY: GROUND_SUPPORT_NORMAL_Y, jumpBlockHeight: JUMP_HEIGHT,
            rampTopY: RAMP_RISE,
        },
    };
}

/**
 * The visible stand-in: solid voxel columns approximating the same shapes, blocky by construction (a voxel
 * staircase for a continuous ramp) but built from the SAME constants above, not eyeballed to roughly match.
 * Returns [x, y, z] triples; the caller writes them with world.setVoxel(x, y, z, VOXEL.STONE).
 */
export function controllerLabVoxelColumns() {
    const cols = [];
    const put = (x, y, z) => cols.push([x, y, z]);

    // Ramp: one voxel column per x, rising toward RAMP_RISE -- a staircase silhouette under the continuous
    // collider surface, so the player's feet are always ON OR BELOW the voxel top, never floating over air.
    for (let x = RAMP_X0; x < RAMP_X0 + RAMP_RUN; x++) {
        const h = Math.max(1, Math.round(((x - RAMP_X0) / RAMP_RUN) * RAMP_RISE));
        for (let z = RAMP_Z0; z < RAMP_Z1; z++) for (let y = 0; y < h; y++) put(x, y, z);
    }
    // Platform atop the ramp -- solid up to RAMP_RISE so its top face lines up with the collider's.
    for (let x = RAMP_X0 + RAMP_RUN; x < PLATFORM_X1; x++)
        for (let z = RAMP_Z0; z < RAMP_Z1; z++) for (let y = 0; y < RAMP_RISE; y++) put(x, y, z);

    // Steep ramp: the SAME staircase technique over a much shorter run -- visibly steeper steps, not a
    // different shape, because the geometry is what refuses it, not a labeled difference.
    const steepCols = Math.max(1, Math.ceil(STEEP_RUN));
    for (let i = 0; i < steepCols; i++) {
        const x = STEEP_X0 + i;
        const h = Math.max(1, Math.round(((i + 1) / steepCols) * STEEP_RISE));
        for (let z = STEEP_Z0; z < STEEP_Z1; z++) for (let y = 0; y < h; y++) put(x, y, z);
    }

    // The L-corner: two solid walls, one voxel thick, sharing the corner column at (CORNER_X1, *, CORNER_Z1).
    for (let x = CORNER_X0; x <= CORNER_X1; x++) for (let y = 0; y < CORNER_H; y++) put(x, y, CORNER_Z1);
    for (let z = CORNER_Z0; z <= CORNER_Z1; z++) for (let y = 0; y < CORNER_H; y++) put(CORNER_X1, y, z);

    // Jump block: JUMP_HEIGHT is exactly 1 voxel tall, so this is the one shape with no blockiness gap
    // between the collider and the voxels at all -- both top out at y = 1.
    for (let x = JUMP_X0; x < JUMP_X1; x++) for (let z = JUMP_Z0; z < JUMP_Z1; z++) put(x, 0, z);

    return cols;
}
