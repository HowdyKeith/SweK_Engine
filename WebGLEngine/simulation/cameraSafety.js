// FILE: simulation/cameraSafety.js
// VERSION: v1 — round 379
//
// Camera collision-safe positioning. Complements simulation/cameraClamp.js
// which only handles the "below the ground surface" case (camera drove
// off a cliff downward). This module handles the "inside solid terrain"
// case — teleports, scripted moves, and WAD spawn points that drop the
// camera right into a wall column or floor block.
//
// The classic failure mode: wad.voxelize() teleports the camera to the
// WAD's player_start coordinates, but the rounded voxel position lands
// on a wall voxel because the WAD coords were grid-aligned with the
// linedef. Result: black screen, camera looking out from inside a block.
//
// Strategy when the requested position is solid:
//   1. Walk UP through the voxel column looking for a 2-voxel-tall
//      gap (camera head + feet clearance).
//   2. If found within MAX_LIFT, snap there and return success.
//   3. If not found, walk OUTWARD on the X/Z plane (4-neighbour spiral)
//      probing each adjacent column with the same vertical walk-up.
//   4. If still nothing within MAX_RADIUS, return failure — caller
//      decides whether to abort the move or accept the unsafe position.
//
// Cost: in the common case (requested position is already clear) one
// voxel probe. Worst case (teleported into the middle of a wall stack)
// up to MAX_LIFT * MAX_RADIUS² probes ≈ 10*81 = 810. Still <1ms.

const DEFAULT_MAX_LIFT    = 16;    // walk up this many voxels looking for clearance
const DEFAULT_MAX_RADIUS  = 6;     // walk out this many voxels on X/Z if vertical fails
const DEFAULT_HEAD_HEIGHT = 2;     // voxels of vertical clearance the camera needs

/**
 * Read a voxel through whichever accessor the world exposes.
 * Returns 0 (AIR) for any out-of-bounds / unknown error.
 */
function _getVoxelAt(world, x, y, z) {
    if (!world) return 0;
    try {
        if (world.voxelAt) return world.voxelAt(x | 0, y | 0, z | 0);
        if (world.getVoxel) return world.getVoxel(x | 0, y | 0, z | 0);
    } catch { /* unloaded chunk etc. */ }
    return 0;
}

/**
 * Returns true if a stack of `headHeight` voxels starting at (x, y, z)
 * is all AIR. Used to verify there's room for the camera.
 */
function _columnClear(world, x, y, z, headHeight) {
    for (let dy = 0; dy < headHeight; dy++) {
        if (_getVoxelAt(world, x, y + dy, z) !== 0) return false;
    }
    return true;
}

/**
 * Find a safe camera position near (x, y, z). Returns an object
 *   { x, y, z, lifted, displaced, success }
 * where:
 *   lifted     — how many voxels we walked UP from the request
 *   displaced  — how many voxels we walked OUTWARD on X/Z
 *   success    — true if a clear column was found, false if we gave up
 *
 * @param {Object} world          voxel world with getVoxel or voxelAt
 * @param {number} x, y, z        requested position
 * @param {Object} [opts]
 * @param {number} [opts.maxLift=16]
 * @param {number} [opts.maxRadius=6]
 * @param {number} [opts.headHeight=2]
 */
export function findSafePosition(world, x, y, z, opts = {}) {
    const maxLift    = opts.maxLift    ?? DEFAULT_MAX_LIFT;
    const maxRadius  = opts.maxRadius  ?? DEFAULT_MAX_RADIUS;
    const headHeight = opts.headHeight ?? DEFAULT_HEAD_HEIGHT;
    const ix = Math.round(x), iz = Math.round(z), iyStart = Math.round(y);

    // Phase 1 — walk UP in the requested column. Cheapest case: the
    // position is already clear and we return on the first iteration.
    for (let lift = 0; lift <= maxLift; lift++) {
        if (_columnClear(world, ix, iyStart + lift, iz, headHeight)) {
            // v455 — preserve the EXACT (fractional) requested position when
            // it's already clear; only add the integer lift to Y when we had
            // to raise the camera out of an obstruction. Snapping x/y/z to
            // voxel centers here quantized smooth scripted camera tweens into
            // the visible voxel "stair-stepping" during auto-camera moves.
            // (WASD is smooth because it never routes through this clamp.)
            return {
                x: x, y: y + lift, z: z,
                lifted: lift, displaced: 0, success: true,
            };
        }
    }

    // Phase 2 — spiral OUTWARD on X/Z, repeating the vertical walk-up
    // at each neighbouring column. The spiral generator yields cells
    // in (Manhattan) ring order so we find the closest clear column.
    for (let r = 1; r <= maxRadius; r++) {
        for (const [dx, dz] of _ringCells(r)) {
            const cx = ix + dx;
            const cz = iz + dz;
            // For each neighbour column, try the requested Y first then walk up
            for (let lift = 0; lift <= maxLift; lift++) {
                if (_columnClear(world, cx, iyStart + lift, cz, headHeight)) {
                    return {
                        x: cx + 0.5, y: iyStart + lift, z: cz + 0.5,
                        lifted: lift, displaced: r, success: true,
                    };
                }
            }
        }
    }

    // Phase 3 — gave up. Return the original position with success=false
    // so the caller can decide what to do (abort the move, or accept it
    // and let the user manually escape).
    return {
        x: ix + 0.5, y: iyStart, z: iz + 0.5,
        lifted: 0, displaced: 0, success: false,
    };
}

/**
 * Generator-style: yields (dx, dz) pairs at Manhattan-distance r,
 * walking the perimeter of an r-radius square. Order is consistent
 * so adjacent rings don't re-visit cells.
 */
function _ringCells(r) {
    const out = [];
    // Top row left→right
    for (let dx = -r; dx <= r; dx++) out.push([dx,  r]);
    // Right column top-1→bottom+1
    for (let dz = r - 1; dz >= -r + 1; dz--) out.push([ r, dz]);
    // Bottom row right→left
    for (let dx = r; dx >= -r; dx--) out.push([dx, -r]);
    // Left column bottom-1→top+1
    for (let dz = -r + 1; dz <= r - 1; dz++) out.push([-r, dz]);
    return out;
}

/**
 * Move a camera to (x, y, z), snapping to a safe nearby position if
 * the request would land it inside solid terrain. Returns the result
 * object from findSafePosition so callers can inspect lift/displace.
 *
 * @param {Object} camera  must expose camera.position.{x,y,z}
 * @param {Object} world
 * @param {number} x, y, z requested position
 * @param {Object} [opts]
 * @param {boolean} [opts.warnOnAdjust=true]   log to console when displaced
 */
export function safeMoveCamera(camera, world, x, y, z, opts = {}) {
    const warn = opts.warnOnAdjust !== false;
    const result = findSafePosition(world, x, y, z, opts);
    if (camera?.position) {
        camera.position.x = result.x;
        camera.position.y = result.y;
        camera.position.z = result.z;
    }
    if (warn && (result.lifted > 0 || result.displaced > 0)) {
        const why = !result.success
            ? "no clear position within search radius — best-effort applied"
            : `lifted ${result.lifted} voxels, displaced ${result.displaced} on X/Z`;
        console.log(`[cameraSafety] requested (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}) — ${why}`);
    }
    return result;
}

/**
 * Install window._safeMoveCamera so any module can route through the
 * safety check without importing this file. Main.js calls this at
 * startup; other modules use:
 *   if (window._safeMoveCamera) window._safeMoveCamera(cam, x, y, z);
 *   else { cam.position.x = x; ... }   // fallback
 */
export function installGlobalSafeMove(world) {
    if (typeof window === "undefined") return;
    window._safeMoveCamera = (camera, x, y, z, opts) =>
        safeMoveCamera(camera, world, x, y, z, opts);
    window._findSafePosition = (x, y, z, opts) =>
        findSafePosition(world, x, y, z, opts);
}
