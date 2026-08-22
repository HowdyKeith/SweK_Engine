// FILE: editor/voxelSelectionRaycast.js
// VERSION: v2 - FACE-AWARE DDA PICKER

export function raycastVoxel(world, origin, direction, maxDist = 100) {

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = direction.x > 0 ? 1 : -1;
    const stepY = direction.y > 0 ? 1 : -1;
    const stepZ = direction.z > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / (direction.x || 0.00001));
    const tDeltaY = Math.abs(1 / (direction.y || 0.00001));
    const tDeltaZ = Math.abs(1 / (direction.z || 0.00001));

    // v2583 -- FIXED: `origin.x % 1` IS NOT THE FRACTIONAL PART OF A NEGATIVE NUMBER.
    //
    // JavaScript's % keeps the sign of the dividend: -4.5 % 1 === -0.5, NOT 0.5. So for a ray starting at
    // x = -4.5 heading +x, this line computed tMaxX = tDelta * (1 - (-0.5)) = tDelta * 1.5, when the true
    // distance to the next boundary is 0.5. THREE TIMES TOO FAR. The x axis then LOSES RACES IT SHOULD WIN, and
    // the traversal walks a different line through the grid: measured against a dense-sample oracle, a diagonal
    // from (-4.5,-2.5,-3.5) SKIPPED THE VOXEL AT z=-3 ENTIRELY.
    //
    // AND IT WAS INVISIBLE TO EVERY AXIS-ALIGNED TEST, because a wrong tMax on a straight ray changes WHEN the
    // step happens, not WHICH voxel is entered. It only shows on a diagonal, where tMax is what DECIDES THE
    // ORDER BETWEEN AXES. This picker hits the right voxel for a camera looking down +x at a world in positive
    // coordinates -- which is every test anyone would think to write.
    //
    // world/VoxelWorld.js RUNS x AND z FROM -5 TO +5. Half of that world is in the broken half of this line.
    //
    // x - Math.floor(x) is the fractional part for ALL reals, which is what Amanatides & Woo 1987 means by it.
    const fracX = origin.x - Math.floor(origin.x);
    const fracY = origin.y - Math.floor(origin.y);
    const fracZ = origin.z - Math.floor(origin.z);
    let tMaxX = tDeltaX * (stepX > 0 ? (1 - fracX) : fracX);
    let tMaxY = tDeltaY * (stepY > 0 ? (1 - fracY) : fracY);
    let tMaxZ = tDeltaZ * (stepZ > 0 ? (1 - fracZ) : fracZ);

    let dist = 0;

    let lastStep = { x: 0, y: 0, z: 0 };

    for (; dist < maxDist; ) {

        const voxel = world.voxelAt(x, y, z);

        if (voxel) {

            return {
                x,
                y,
                z,
                face: lastStep   // IMPORTANT: face normal direction
            };
        }

        if (tMaxX < tMaxY) {
            if (tMaxX < tMaxZ) {
                x += stepX;
                dist = tMaxX;
                tMaxX += tDeltaX;
                lastStep = { x: -stepX, y: 0, z: 0 };
            } else {
                z += stepZ;
                dist = tMaxZ;
                tMaxZ += tDeltaZ;
                lastStep = { x: 0, y: 0, z: -stepZ };
            }
        } else {
            if (tMaxY < tMaxZ) {
                y += stepY;
                dist = tMaxY;
                tMaxY += tDeltaY;
                lastStep = { x: 0, y: -stepY, z: 0 };
            } else {
                z += stepZ;
                dist = tMaxZ;
                tMaxZ += tDeltaZ;
                lastStep = { x: 0, y: 0, z: -stepZ };
            }
        }
    }

    return null;
}