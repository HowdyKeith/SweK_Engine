// voxel/voxelDDA.js
//
// Voxel ray marcher core (v2782) -- the heart of a parallax voxel ray-marched renderer. Amanatides & Woo grid
// traversal: given a ray, step voxel-by-voxel along it (never skipping or double-counting a cell) and return the
// first SOLID voxel, the face it was entered through (the normal, for shading/parallax), and the distance t.
//
// This is the exact logic a GLSL fragment ray-marcher will run per pixel; keeping it here as pure JS means it
// can be gated against a brute-force reference (identical visited-voxel sequence + first hit + face) before the
// shader port -- an equivalence gate, the same discipline used for the RLE mesher.
//
// Pure math, no imports -- browser/worker-safe. Direction is normalized internally so t is in world units.

// isSolid(x,y,z) -> bool. onVisit(x,y,z) optional, called for each voxel entered (for gating / debug). Returns
// { hit, vx, vy, vz, nx, ny, nz, t, steps } -- normal points back toward the ray (outward face of the hit voxel).
export function traverseDDA(ox, oy, oz, dx, dy, dz, isSolid, maxSteps = 256, onVisit = null) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;   // t to cross one full voxel along each axis
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    // distance (in voxels) from the origin to the first cell boundary in each step direction
    const bx = stepX > 0 ? (x + 1 - ox) : (ox - x);
    const by = stepY > 0 ? (y + 1 - oy) : (oy - y);
    const bz = stepZ > 0 ? (z + 1 - oz) : (oz - z);
    let tMaxX = dx !== 0 ? bx * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? by * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? bz * tDeltaZ : Infinity;

    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < maxSteps; i++) {
        if (onVisit) onVisit(x, y, z);
        if (isSolid(x, y, z)) return { hit: true, vx: x, vy: y, vz: z, nx, ny, nz, t, steps: i };
        // advance to the nearest next voxel boundary
        if (tMaxX <= tMaxY && tMaxX <= tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
        else if (tMaxY <= tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
    }
    return { hit: false, vx: x, vy: y, vz: z, nx: 0, ny: 0, nz: 0, t, steps: maxSteps };
}

// Convenience: collect the ordered voxel sequence a ray visits (up to maxSteps), ignoring solidity. Used by the
// gate as the thing the brute-force reference must reproduce.
export function marchVoxels(ox, oy, oz, dx, dy, dz, maxSteps = 64) {
    const out = [];
    traverseDDA(ox, oy, oz, dx, dy, dz, () => false, maxSteps, (x, y, z) => out.push([x, y, z]));
    return out;
}
