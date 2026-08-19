// voxel/voxelAO.js
//
// Corner ambient occlusion from neighbour voxels (v2775). The classic voxel-AO trick: a face vertex looks
// darker when the voxels wrapping that corner on the AIR side are solid. For each corner we sample three
// air-side neighbours -- the two edge voxels along the face's tangent axes and the diagonal corner voxel -- and
// fold them into the standard level:
//     level = (side1 && side2) ? 0 : 3 - (side1 + side2 + corner)      // 0 darkest .. 3 open
// The (side1 && side2) special case is the sharp interior crease: if both edges are walled the corner is fully
// dark regardless of the diagonal. Returned as 0..1 (level/3) to drop straight into the renderer's aos array.
//
// Browser-safe: imports only voxelRLE (getRLE, now dim-aware).

import { getRLE } from "./voxelRLE.js";

// The two tangent unit axes perpendicular to an axis-aligned normal.
export function tangents(n) {
    if (n[0] !== 0) return [[0, 1, 0], [0, 0, 1]];   // normal along X -> tangents Y, Z
    if (n[1] !== 0) return [[1, 0, 0], [0, 0, 1]];   // along Y -> X, Z
    return [[1, 0, 0], [0, 1, 0]];                    // along Z -> X, Y
}

// AO for one face corner. cornerPos = the grid vertex (integer coords on the face plane). n = outward face
// normal (unit, axis-aligned). (du,dw) in {-1,+1} = the corner's lean along the two tangent axes (which corner
// of the quad this is). Works for unit faces AND greedy-span corners: the solid voxel touching this corner is
// derived from the grid vertex, so a tall side span's top and bottom corners sample at their own heights.
export function vertexAO(rle, cornerPos, n, du, dw, isSolid) {
    const [u, w] = tangents(n);
    // solid voxel touching this corner from inside the quad: step half a unit back along -n and back along the
    // corner's inward lean, then floor to voxel coords.
    const S = [
        Math.floor(cornerPos[0] - 0.5 * n[0] - 0.5 * (du * u[0] + dw * w[0])),
        Math.floor(cornerPos[1] - 0.5 * n[1] - 0.5 * (du * u[1] + dw * w[1])),
        Math.floor(cornerPos[2] - 0.5 * n[2] - 0.5 * (du * u[2] + dw * w[2])),
    ];
    const A = [S[0] + n[0], S[1] + n[1], S[2] + n[2]];   // air voxel just outside the face
    const occ = (ox, oy, oz) => (isSolid(getRLE(rle, A[0] + ox, A[1] + oy, A[2] + oz)) ? 1 : 0);
    const s1 = occ(du * u[0], du * u[1], du * u[2]);                         // edge voxel along u
    const s2 = occ(dw * w[0], dw * w[1], dw * w[2]);                         // edge voxel along w
    const cr = occ(du * u[0] + dw * w[0], du * u[1] + dw * w[1], du * u[2] + dw * w[2]);   // diagonal
    const level = (s1 && s2) ? 0 : 3 - (s1 + s2 + cr);
    return level / 3;
}
