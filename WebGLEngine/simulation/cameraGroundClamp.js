// FILE: simulation/cameraGroundClamp.js
// VERSION: v2 — round 404 (was v1 round 266)
//
// Shared utility: keep an auto-driven camera from clipping below the
// terrain. KaijuSandbox shipped this in round 256 (eye anchored at
// groundY + size + 1), but cruise/asteroids/missile-command/autopilot
// all set camera.y independently and didn't have the same guard, so
// hilly biomes could put the camera mid-rock.
//
// USAGE — call once per frame at the END of whatever sets the camera:
//
//   import { clampCameraToGround } from "./cameraGroundClamp.js";
//   ...
//   clampCameraToGround(this.camera, this.world, { minClearance: 3 });
//
// The clamp is RAISE-ONLY: if camera Y is already above terrain it's
// untouched, so manual descents from the player remain unaffected.
//
// v2 (round 404): added terrainTopBilinear() and used it by default in
// clampCameraToGround. The v1 path probed a single voxel column,
// returning an integer height — that caused visible "stairs" when the
// camera moved across voxel boundaries on sloped terrain. Bilinear
// interpolation between the 4 surrounding columns smooths the camera
// track without sacrificing the engine's voxel-blocky rendering.

const PROBE_TOP_Y = 80;       // tallest terrain we expect (snow caps ~75)
const PROBE_BOTTOM_Y = -2;

/**
 * Find terrain top at (x, z) by scanning voxels down from PROBE_TOP_Y.
 * Returns Y of the highest solid voxel (or PROBE_BOTTOM_Y if none).
 * Uses world.voxelAt (round 80 helper) when available, else getVoxel.
 */
export function terrainTopAt(world, x, z) {
    if (!world) return PROBE_BOTTOM_Y;
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const probe = world.voxelAt
        ? (xx, yy, zz) => world.voxelAt(xx, yy, zz)
        : world.getVoxel
            ? (xx, yy, zz) => world.getVoxel(xx, yy, zz)
            : null;
    if (!probe) return PROBE_BOTTOM_Y;
    for (let y = PROBE_TOP_Y; y >= PROBE_BOTTOM_Y; y--) {
        try {
            const v = probe(ix, y, iz);
            if (v && v !== 10 && v !== 11) {
                // Skip water/flowing water — camera over a lake should
                // not clamp to the water surface, just to whatever's
                // under it. (Lakes are usually shallow; sub-water
                // gameplay is its own mode.)
                return y;
            }
        } catch { /* out-of-chunk lookup; treat as air */ }
    }
    return PROBE_BOTTOM_Y;
}

/**
 * v404 — Bilinear-interpolated terrain top. Probes the 4 voxel columns
 * surrounding (x, z) and lerps their integer heights based on the
 * fractional XZ position. Returns a smooth float Y that varies
 * continuously as the camera moves across voxel boundaries.
 *
 * Cost: 4 vertical scans per call. Each scan is ≤82 voxel lookups
 * (PROBE_TOP_Y - PROBE_BOTTOM_Y). Still negligible — order of 300
 * lookups per frame for the camera column. Compared to the chunk
 * mesher's millions, it's a rounding error.
 *
 * Note this hides cliffs at sub-voxel resolution: a 1-voxel-wide cliff
 * with a 10-unit height drop will bilinear into a 30-degree ramp over
 * one voxel. That's a feature, not a bug, for camera smoothness. If
 * cliff-edge detection matters for some mode, sample with `bilinear:
 * false` to get the v1 integer behavior back.
 */
export function terrainTopBilinear(world, x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const h00 = terrainTopAt(world, ix,     iz    );
    const h10 = terrainTopAt(world, ix + 1, iz    );
    const h01 = terrainTopAt(world, ix,     iz + 1);
    const h11 = terrainTopAt(world, ix + 1, iz + 1);
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
}

/**
 * Raise camera.position.y so it sits at least `minClearance` above the
 * terrain at the camera's (x, z) column. Idempotent and cheap (one
 * vertical scan per call). Safe to call every frame.
 *
 * v2 (round 404): uses bilinear interpolation by default. Pass
 * `bilinear: false` to opt back into the v1 single-column behavior
 * (faster but produces "stairs" on sloped terrain).
 *
 * Returns true if the camera was raised, false if it was already clear.
 */
export function clampCameraToGround(camera, world, opts = {}) {
    if (!camera?.position || !world) return false;
    const minClearance = opts.minClearance ?? 2.5;
    const useBilinear  = opts.bilinear !== false;     // default true
    // v1242 — prefer the SMOOTH procedural height when the world exposes it, so the
    // camera follows the continuous surface instead of stepping over voxel tops.
    let top = null;
    try { if (typeof world._heightAt === "function") { const h = world._heightAt(camera.position.x, camera.position.z); if (Number.isFinite(h)) top = h; } } catch {}
    if (top == null) {
        top = useBilinear
            ? terrainTopBilinear(world, camera.position.x, camera.position.z)
            : terrainTopAt(world, camera.position.x, camera.position.z);
    }
    const floor = top + minClearance;
    if (camera.position.y < floor) {
        // v1242 — EASE the lift instead of a hard snap (the snap is what made the
        // auto-move camera "walk up stairs" each voxel boundary). A big gap (teleport /
        // anti-clip) still snaps; small per-frame gaps glide. Callers can force the
        // old behavior with ease:false.
        const gap = floor - camera.position.y;
        if (opts.ease === false || gap > 2.5) camera.position.y = floor;
        else camera.position.y += gap * 0.25;
        return true;
    }
    return false;
}
