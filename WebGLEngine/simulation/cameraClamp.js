// FILE: simulation/cameraClamp.js
// VERSION: v2 — round 405 (was v1 round 266)
//
// Shared utility used by every auto-camera mode (cruise, sandbox,
// demo sequences, FPS autopilot, replay) to prevent the camera from
// "presenting inside earth" — i.e., dropping below the surface at the
// camera's (x, z) and rendering the underside of a chunk.
//
// In round 256 KaijuSandbox baked its own version of this directly
// into _applySize(). Cruise, demo, and other auto-modes had no such
// guard, so a long downhill run could send the camera underground.
// This module collects the logic in one place; any mode that wants
// the protection calls clampCameraToSurface(camera, world, options).
//
// v2 (round 405): bilinear surface probe by default. The integer
// surfaceYAt path produced visible "stairs" when the camera moved
// across voxel boundaries on sloped terrain — every clamp tick
// snapped Y to a new integer + buffer. Bilinear blends the 4
// surrounding columns so the clamped Y varies smoothly.

const HEIGHT_SCAN_MAX = 80;     // probe from this Y downward

// Sample the top non-air voxel below `top` at integer (x, z). Returns
// null if nothing solid found within the scan budget (chunk unloaded,
// or genuinely empty column).
export function surfaceYAt(world, x, z, top = 60) {
    if (!world) return null;
    const get = world.voxelAt
        ? (xx, yy, zz) => world.voxelAt(xx | 0, yy | 0, zz | 0)
        : world.getVoxel
            ? (xx, yy, zz) => world.getVoxel(xx | 0, yy | 0, zz | 0)
            : null;
    if (!get) return null;
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const yTop = Math.min(HEIGHT_SCAN_MAX, top | 0);
    const yBot = -2;             // small buffer below 0 for sub-surface biomes
    for (let y = yTop; y >= yBot; y--) {
        const v = get(ix, y, iz);
        if (v && v !== 0) return y;
    }
    return null;
}

// v405 — bilinear-interpolated surface probe. Samples the 4 voxel
// columns around (x, z) and lerps their integer heights by fractional
// XZ. Returns a smooth float Y that tracks the surface continuously,
// or null if any of the 4 columns has no solid voxel within budget
// (treat as unloaded chunk — caller should leave the camera alone).
export function surfaceYAtBilinear(world, x, z, top = 60) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const h00 = surfaceYAt(world, ix,     iz,     top);
    const h10 = surfaceYAt(world, ix + 1, iz,     top);
    const h01 = surfaceYAt(world, ix,     iz + 1, top);
    const h11 = surfaceYAt(world, ix + 1, iz + 1, top);
    // If any neighbor is null (unloaded), bail to nearest-valid or null.
    if (h00 == null || h10 == null || h01 == null || h11 == null) {
        return h00 ?? h10 ?? h01 ?? h11 ?? null;
    }
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
}

// Clamp the camera's Y so it sits at least `minBuffer` above the
// surface directly under it. No-op when the surface can't be probed
// (unloaded chunks etc.) — better to leave the camera alone than to
// snap it somewhere wrong.
//
// Options:
//   minBuffer: vertical gap to maintain (default 2u, ~one voxel + a
//              bit). Higher values keep the camera further from the
//              ground for a wider-feeling shot.
//   maxLift:   never lift the camera more than this in a single call
//              (default 8u) so a teleport-style snap doesn't whip the
//              camera into orbit. The clamp will re-apply next frame.
//   bilinear:  default true (v405). Pass false to opt back into the
//              v1 integer-Y behavior.
//
// Returns the new camera Y, or the original if no change was applied.
export function clampCameraToSurface(camera, world, opts = {}) {
    if (!camera?.position || !world) return null;
    const minBuffer    = opts.minBuffer ?? 2;
    const maxLift      = opts.maxLift   ?? 8;
    const useBilinear  = opts.bilinear  !== false;     // default true
    const px = camera.position.x, pz = camera.position.z;
    // v441 — follow the SMOOTH procedural height when available so the
    // camera stops stair-stepping over voxel tops. This is what was making
    // auto-camera moves look steppy, especially under MC smooth terrain
    // where the visible surface is continuous but the voxel tops aren't.
    // The voxel probe stays as an anti-clip guard: if real geometry (a
    // building/structure) sits well above the smooth ground, defer to it.
    let smooth = null;
    try { if (typeof world._heightAt === "function") { const h = world._heightAt(px, pz); if (Number.isFinite(h)) smooth = h; } } catch {}
    const voxel = useBilinear
        ? surfaceYAtBilinear(world, px, pz, camera.position.y + 4)
        : surfaceYAt(world, px, pz, camera.position.y + 4);
    let sy;
    if (smooth != null) sy = (voxel != null && voxel - smooth > 3) ? voxel : smooth;
    else                sy = voxel;
    if (sy == null) return null;
    const minY = sy + 1 + minBuffer;
    if (camera.position.y < minY) {
        const targetY = Math.min(minY, camera.position.y + maxLift);
        // Ease small lifts so manual terrain-follow doesn't stair-step; a
        // big gap still snaps (anti-clip). v443 — callers can pass
        // ease:false (scripted auto-camera moves) to always snap, since the
        // tween itself provides the smooth motion and easing lags behind it.
        const gap = targetY - camera.position.y;
        const doEase = (opts.ease !== false) && gap <= 2.0;
        camera.position.y += doEase ? gap * 0.25 : gap;
        return camera.position.y;
    }
    return camera.position.y;
}

// Convenience: install a global hook so any auto-cam mode can call
// window._clampCameraToGround(camera) without importing the module.
// main.js calls this at startup once.
export function installGlobalClamp(world) {
    if (typeof window === "undefined") return;
    window._clampCameraToGround = (cam, opts) => clampCameraToSurface(cam, world, opts);
}
