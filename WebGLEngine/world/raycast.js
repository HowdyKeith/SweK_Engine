// FILE: world/raycast.js
// VERSION: v1 - DDA VOXEL RAYCAST

export function raycastVoxel(world, origin, dir, maxDist = 12) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));

    const frac = v => v - Math.floor(v);

    let tMaxX = dir.x > 0
        ? (1 - frac(origin.x)) * tDeltaX
        : frac(origin.x) * tDeltaX;

    let tMaxY = dir.y > 0
        ? (1 - frac(origin.y)) * tDeltaY
        : frac(origin.y) * tDeltaY;

    let tMaxZ = dir.z > 0
        ? (1 - frac(origin.z)) * tDeltaZ
        : frac(origin.z) * tDeltaZ;

    let dist = 0;
    let normal = { x: 0, y: 0, z: 0 };

    while (dist <= maxDist) {
        if (world.voxelAt(x, y, z)) {
            return { x, y, z, normal };
        }

        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            x += stepX;
            dist = tMaxX;
            tMaxX += tDeltaX;
            normal = { x: -stepX, y: 0, z: 0 };
        }
        else if (tMaxY < tMaxZ) {
            y += stepY;
            dist = tMaxY;
            tMaxY += tDeltaY;
            normal = { x: 0, y: -stepY, z: 0 };
        }
        else {
            z += stepZ;
            dist = tMaxZ;
            tMaxZ += tDeltaZ;
            normal = { x: 0, y: 0, z: -stepZ };
        }
    }

    return null;
}