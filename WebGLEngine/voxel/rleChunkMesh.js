// voxel/rleChunkMesh.js
//
// The live-swap drop-in (v2776): a meshChunk-shaped function that produces the renderer's {verts,cols,aos}
// from the RLE surface->mesh->AO pipeline, SEAMLESS across chunk boundaries. The single-chunk demo hid the one
// hard part -- rleMesh emits INTERNAL faces only, so a naive tiled swap leaves holes at every chunk edge. The
// fix: build a PADDED (S+2) x H x (S+2) chunk whose 1-voxel ring is filled from the neighbours (via the same
// readVoxel the greedy mesher uses), RLE-mesh THAT, and keep only the faces whose solid voxel is in the real
// chunk. The boundary faces then fall out as ordinary internal solid/air boundaries, and corner AO at the edges
// samples the real neighbour voxels for free -- no seams, correct cross-chunk shading.
//
// Same signature/output contract as world/chunkMesherCore.js meshChunk, so the worker can pick either. Slope
// overlay arrays come back empty (the RLE path draws faces, not stair-step slopes). Worker-safe: imports only
// voxel modules, no DOM, no Node builtins.

import { encodeRLE, rleIndex, SOLID_NONZERO } from "./voxelRLE.js";
import { rleMesh } from "./rleMesh.js";
import { rleMeshOptimized } from "./rleMeshOpt.js";   // v2795 - floor-skip + AO-preserving +-Y merge (opt-in)
import { rleMeshToRenderMesh } from "./rleRenderMesh.js";

// Cross-chunk voxel lookup, identical semantics to world/chunkMesherCore.js readVoxel: real-chunk order
// idx = lx + S*(lz + S*ly); neighbours keyed "dx,dz"; air (0) out of vertical range or when a neighbour is null.
function readVoxel(local, neighbors, S, H, lx, ly, lz, skipWater) {
    if (ly < 0 || ly >= H) return 0;
    let dx = 0, dz = 0;
    if (lx < 0) { dx = -1; lx += S; } else if (lx >= S) { dx = 1; lx -= S; }
    if (lz < 0) { dz = -1; lz += S; } else if (lz >= S) { dz = 1; lz -= S; }
    const buf = (dx === 0 && dz === 0) ? local : (neighbors ? neighbors[dx + "," + dz] : null);
    if (!buf) return 0;
    const n = buf[lx + S * (lz + S * ly)];
    if (skipWater && (n === 10 || n === 11)) return 0;
    return n;
}


// args: { voxels, neighbors, size, height, cx, cz, skipWater, palette }. Returns the meshChunk contract plus
// empty slope arrays. isSolid defaults to non-zero-is-solid.
export function meshChunkRLE(args, isSolid = SOLID_NONZERO) {
    const { voxels, neighbors, size: S, height: H, cx = 0, cz = 0, skipWater = false, palette = {} } = args;

    // padded chunk: real voxels shifted to 1..S / 1..H, a one-voxel shell on ALL sides. The X/Z shell is the
    // neighbour chunks (via readVoxel); the Y shell is air (readVoxel returns 0 past [0,H) -- world floor below,
    // sky above), so floor/ceiling faces emit exactly like wall faces. Filled in RLE Y-fastest order.
    const PSX = S + 2, PSY = H + 2, PSZ = S + 2, pdims = { sx: PSX, sy: PSY, sz: PSZ };
    const padded = new Uint8Array(PSX * PSY * PSZ);
    for (let px = 0; px < PSX; px++)
        for (let pz = 0; pz < PSZ; pz++)
            for (let py = 0; py < PSY; py++)
                padded[rleIndex(px, py, pz, pdims)] = readVoxel(voxels, neighbors, S, H, px - 1, py - 1, pz - 1, skipWater);

    const rle = encodeRLE(padded, pdims);
    // v2795 - opt-in optimised path: drop the never-visible world floor (padded y===1 is world y===0) and greedy-
    // merge AO-uniform +-Y faces. Default OFF so the proven v2776 output is unchanged unless asked for.
    const mesh = args.optimize
        ? rleMeshOptimized(rle, isSolid, { skipFloorY: 1, mergeY: true, computeAO: true,
              keepFace: (x, y, z) => x >= 1 && x <= S && y >= 1 && y <= H && z >= 1 && z <= S })
        : rleMesh(rle, isSolid);
    // world coords: padded (px,py,pz) -> world (cx*S + px-1, py-1, cz*S + pz-1). Keep only faces whose solid voxel
    // is a REAL chunk voxel (1..S, 1..H, 1..S) so the neighbour/air shell's own faces are dropped.
    const r = rleMeshToRenderMesh(mesh, rle, {
        palette, isSolid, computeAO: true,
        offset: [cx * S - 1, -1, cz * S - 1],
        keepVoxel: (vx, vy, vz) => vx >= 1 && vx <= S && vy >= 1 && vy <= H && vz >= 1 && vz <= S,
    });

    return { verts: r.verts, cols: r.cols, aos: r.aos, slopeVerts: new Float32Array(0), slopeNormals: new Float32Array(0), slopeCols: new Float32Array(0) };
}
