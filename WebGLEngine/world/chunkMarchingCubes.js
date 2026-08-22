// FILE: world/chunkMarchingCubes.js
// VERSION: v434 — smooth (marching-cubes) terrain meshing.
//
// Opt-in alternative to the blocky greedy mesher. Builds a smoothed
// occupancy field from the voxel grid (corner-averaged 0..1, isovalue
// 0.5) and runs marching cubes to produce a rounded isosurface.
//
// IMPORTANT: the voxel data is NOT touched. Collision, physics, raycast
// and gameplay still read the blocky grid — only the visible mesh
// changes. Output matches the renderer's chunk VAO layout: world-space
// positions (loc 0), per-vertex material colors (loc 1), flat AO=1
// (loc 2). Lighting + shadows come for free from the chunk shader's
// derivative-based normals, so no normal attribute is needed.

import { marchScalarField } from "../simulation/MarchingCubes.js";

// Voxel ids that get marched: stone/dirt/grass/sand/snow/ash + lava.
// Water (10,11) keeps its own renderer; specials (screen 20, memory 30)
// are billboards — both are skipped so MC only rounds real terrain.
const MC_SOLID = new Set([1, 2, 3, 4, 5, 6, 12]);
export function isMcSolidId(id) { return MC_SOLID.has(id | 0); }

/**
 * Build a marching-cubes mesh for one chunk.
 *
 * @param {Object} o
 * @param {(wx:number,wy:number,wz:number)=>number} o.solidSample voxel id (0=air) at a world coord
 * @param {(wx:number,wy:number,wz:number)=>number[]} o.colorAt    rgb [0..1] for a surface vertex
 * @param {number} o.X0  chunk world origin x
 * @param {number} o.Z0  chunk world origin z
 * @param {number} o.S   chunk size (x and z)
 * @param {number} o.H   chunk height (y)
 * @returns {{positions:Float32Array,colors:Float32Array,aos:Float32Array,count:number}}
 */
export function meshChunkMC(o) {
    const { solidSample, colorAt, X0, Z0, S, H } = o;

    const solid = (wx, wy, wz) => {
        if (wy < 0) return 1;     // below the floor = solid → caps the underside
        if (wy >= H) return 0;
        return MC_SOLID.has(solidSample(wx, wy, wz) | 0) ? 1 : 0;
    };

    // Only march the vertical band that actually holds surface, instead of
    // all H layers (most of a column is air or buried).
    let yLo = H, yHi = -1;
    for (let lz = 0; lz < S; lz++) {
        for (let lx = 0; lx < S; lx++) {
            for (let y = 0; y < H; y++) {
                if (solid(X0 + lx, y, Z0 + lz)) { if (y < yLo) yLo = y; if (y > yHi) yHi = y; }
            }
        }
    }
    const empty = { positions: new Float32Array(0), colors: new Float32Array(0), aos: new Float32Array(0), count: 0 };
    if (yHi < yLo) return empty;

    const y0 = Math.max(0, yLo - 2);
    const y1 = Math.min(H, yHi + 3);

    // Grid points: [X0..X0+S] (S+1 wide), [y0..y1], [Z0..Z0+S].
    const dimX = S + 1, dimZ = S + 1, dimY = (y1 - y0) + 1;
    const idx = (x, y, z) => z * dimX * dimY + y * dimX + x;

    // Corner-averaged occupancy. A grid point is the shared corner of up to
    // 8 voxels; density = fraction solid → a smooth 0..1 gradient. The
    // polygonizer treats values BELOW the isovalue as "inside", so we store
    // (1 - density): solid corners read low (inside the object) and the
    // emitted triangles wind CCW-outward (correct for BACK-face culling).
    const field = new Float32Array(dimX * dimY * dimZ);
    for (let gz = 0; gz < dimZ; gz++) {
        const wz = Z0 + gz;
        for (let gy = 0; gy < dimY; gy++) {
            const wy = y0 + gy;
            for (let gx = 0; gx < dimX; gx++) {
                const wx = X0 + gx;
                let s = 0;
                s += solid(wx - 1, wy - 1, wz - 1) + solid(wx, wy - 1, wz - 1);
                s += solid(wx - 1, wy,     wz - 1) + solid(wx, wy,     wz - 1);
                s += solid(wx - 1, wy - 1, wz)     + solid(wx, wy - 1, wz);
                s += solid(wx - 1, wy,     wz)     + solid(wx, wy,     wz);
                field[idx(gx, gy, gz)] = 1 - (s / 8);
            }
        }
    }

    const march = marchScalarField(field, dimX, dimY, dimZ, 0.5, { origin: [X0, y0, Z0], cellSize: 1 });
    const posSrc = march.positions;
    const n = posSrc.length / 3;
    if (n === 0) return empty;

    const positions = posSrc instanceof Float32Array ? posSrc : new Float32Array(posSrc);
    const colors = new Float32Array(n * 3);
    const aos = new Float32Array(n).fill(1.0);
    for (let i = 0; i < n; i++) {
        const c = colorAt(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]) || [0.5, 0.5, 0.5];
        colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    }
    return { positions, colors, aos, count: n };
}
