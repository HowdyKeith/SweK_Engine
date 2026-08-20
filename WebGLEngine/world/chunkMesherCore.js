// FILE: world/chunkMesherCore.js
// VERSION: v1 - round 43q
//
// Portable greedy mesher. No `this`, no DOM, no GL — pure number-pushing.
// Runs in both the main thread and a Web Worker (workers import ES
// modules in Chrome 80+ / Firefox 114+ / Safari 15+).
//
// Inputs: a chunk's voxel buffer + its 8 horizontal neighbors' buffers.
// Output: { verts, cols, aos } as Float32Arrays ready to upload as VBOs.
//
// Mesh format (matches voxelrenderer's expectations):
//   verts:  3 floats per vertex, world-space (already offset by cx*S, cz*S)
//   cols:   3 floats per vertex, RGB 0..1 (from palette by voxel id)
//   aos:    1 float per vertex, 0=darkest 1=full ambient (corner AO)
//   Each quad emits 6 vertices (2 triangles)

export const PALETTE = (() => {
    const p = [];
    p[1]  = [0.65, 0.65, 0.70];   // STONE
    p[2]  = [0.60, 0.50, 0.30];   // DIRT
    p[3]  = [0.30, 0.80, 0.30];   // GRASS
    p[4]  = [0.92, 0.85, 0.55];   // SAND
    p[5]  = [0.95, 0.97, 1.00];   // SNOW
    p[6]  = [0.22, 0.18, 0.16];   // ASH
    p[10] = [0.20, 0.45, 0.85];   // WATER
    p[11] = [0.25, 0.55, 0.95];   // FLOWING_WATER
    p[12] = [1.00, 0.55, 0.15];   // LAVA — emissive
    p[13] = [0.72, 0.86, 0.96];   // ICE — pale blue
    p[20] = [0.55, 0.85, 0.95];   // SCREEN
    p[30] = [0.85, 0.35, 0.85];   // MEMORY — emissive
    return p;
})();

// Round 30x — reusable scratch to kill per-quad / per-chunk allocation churn during remesh storms. meshChunk runs on a
// single thread at a time (the main thread and each worker get their own module instance) and is never reentrant, so
// module-level scratch is safe. Every buffer below is fully overwritten (or cleared) before it's read.
const _A = [0, 0, 0], _B = [0, 0, 0], _C = [0, 0, 0], _D = [0, 0, 0];   // emitQuad corner positions
const _pos = [0, 0, 0];                                                  // cornerAO sample position
let _maskScratch = new Int32Array(0);                                    // greedy face mask
let _usedScratch = new Uint8Array(0);                                    // greedy used-mask
function _maskBuf(n) { if (_maskScratch.length < n) _maskScratch = new Int32Array(n); return _maskScratch; }
function _usedBuf(n) { if (_usedScratch.length < n) _usedScratch = new Uint8Array(n); return _usedScratch; }

// Round 54 - stair-step smoothing as an overlay mesh. For each voxel
// V with its top exposed, if a horizontal neighbor at the same y is
// solid AND the cube one above that neighbor is solid, emit a slope
// quad bridging V's far edge up to the step-up's near-top edge.
//
// Direction conventions:
//   +dx: step at (x+1, y+1, z). Slope rises in +x.
//   -dx: step at (x-1, y+1, z). Slope rises in -x.
//   +dz: step at (x, y+1, z+1). Slope rises in +z.
//   -dz: step at (x, y+1, z-1). Slope rises in -z.
//
// Vertex winding is direction-specific so the cross product yields
// the correct outward normal (face points away from the step, up-and-
// toward the camera that's looking at the slope from V's side).
//
// v431 — how many voxels of vertical rise a single slope ramp may span.
// The original (round 54) only smoothed 1-voxel steps, so steep mountain
// faces still read as stacked blocks. Walking up to MAX_SLOPE_RISE lets a
// 2-3 voxel face become one smooth ramp. Higher = smoother but steeper/
// thinner ramp triangles; 3 is a good balance for mountain slopes.
const MAX_SLOPE_RISE = 3;

// Skip skipWater entirely - water never produces slopes (avoids
// awkward angled water surfaces).
export function meshSlopes(args) {
    const { voxels, neighbors, size: S, height: H, cx, cz } = args;
    const verts   = [];
    const normals = [];
    const cols    = [];
    const ox = cx * S;
    const oz = cz * S;

    // 4 horizontal neighbor offsets
    const DIRS = [
        [ 1, 0],   // +x
        [-1, 0],   // -x
        [ 0, 1],   // +z
        [ 0,-1],   // -z
    ];
    // 4 diagonal neighbor offsets (round 55 - corner caps)
    const DIAGS = [
        [ 1, 1],   // +x+z
        [-1, 1],   // -x+z
        [ 1,-1],   // +x-z
        [-1,-1],   // -x-z
    ];

    for (let y = 0; y < H - 1; y++) {
        for (let z = 0; z < S; z++) {
            for (let x = 0; x < S; x++) {
                const v = readVoxel(voxels, neighbors, S, H, x, y, z, false);
                if (!v) continue;
                // Skip water / lava - never slope these
                if (v === 10 || v === 11 || v === 12) continue;
                const above = readVoxel(voxels, neighbors, S, H, x, y + 1, z, false);
                if (above) continue;        // top not exposed

                // ---- Cardinal slopes (round 54) ----
                // Track which cardinals fired so the corner-cap pass
                // doesn't emit redundant caps where a cardinal already
                // covered V's top.
                let firedPlusX = false, firedMinusX = false;
                let firedPlusZ = false, firedMinusZ = false;
                for (const [dx, dz] of DIRS) {
                    const nVox = readVoxel(voxels, neighbors, S, H, x + dx, y, z + dz, false);
                    if (!nVox) continue;
                    if (nVox === 10 || nVox === 11) continue;     // water neighbor — skip
                    const stepUp = readVoxel(voxels, neighbors, S, H, x + dx, y + 1, z + dz, false);
                    if (!stepUp) continue;
                    if (stepUp === 10 || stepUp === 11) continue;
                    // v431 — walk up the neighbor column to find the full
                    // rise, so a steep 2-3 voxel face becomes one smooth
                    // ramp instead of one ramp + leftover vertical steps.
                    let rise = 1, crest = stepUp;
                    for (let r = 2; r <= MAX_SLOPE_RISE; r++) {
                        const up = readVoxel(voxels, neighbors, S, H, x + dx, y + r, z + dz, false);
                        if (!up || up === 10 || up === 11) break;
                        rise = r; crest = up;
                    }
                    emitSlopeQuad(verts, normals, cols, x + ox, y, z + oz, dx, dz, v, crest, rise);
                    if (dx ===  1) firedPlusX  = true;
                    if (dx === -1) firedMinusX = true;
                    if (dz ===  1) firedPlusZ  = true;
                    if (dz === -1) firedMinusZ = true;
                }

                // ---- Corner caps (round 55) ----
                // Emit only when the diagonal step-up exists AND neither
                // cardinal in that quadrant fired. Otherwise the cardinal
                // slope already smooths V's top in this direction.
                for (const [dx, dz] of DIAGS) {
                    // Skip if either cardinal in this quadrant emitted
                    if (dx ===  1 && firedPlusX)  continue;
                    if (dx === -1 && firedMinusX) continue;
                    if (dz ===  1 && firedPlusZ)  continue;
                    if (dz === -1 && firedMinusZ) continue;
                    const dStepUp = readVoxel(voxels, neighbors, S, H, x + dx, y + 1, z + dz, false);
                    if (!dStepUp) continue;
                    if (dStepUp === 10 || dStepUp === 11) continue;
                    emitCornerCap(verts, normals, cols, x + ox, y, z + oz, dx, dz, v, dStepUp);
                }
            }
        }
    }

    return {
        verts:   new Float32Array(verts),
        normals: new Float32Array(normals),
        cols:    new Float32Array(cols),
    };
}

// Emit a slope quad (6 vertices, 2 triangles). Direction-specific
// winding so cross products produce outward normals. Bottom verts (at
// y+1) get the lower cube's palette color; top verts (at y+2) get the
// step-up cube's color. The FS interpolation across the quad gives a
// smooth color gradient — e.g., dirt at the base blending to grass at
// the crest, or stone blending to snow at high altitude.
function emitSlopeQuad(verts, normals, cols, x, y, z, dx, dz, lowerVoxel, upperVoxel, rise) {
    rise = rise || 1;
    const colLow  = PALETTE[lowerVoxel] || [1, 1, 1];
    const colHigh = PALETTE[upperVoxel] || colLow;
    const baseY = y + 1;
    const topY  = y + 1 + rise;        // v431 — variable crest height
    const invLen = 1 / Math.sqrt(rise * rise + 1);   // normal length for the slope angle
    let p0x, p0y, p0z, p1x, p1y, p1z, p2x, p2y, p2z, p3x, p3y, p3z;
    let nx, ny, nz;
    if (dx === 1) {
        // +x: slope rises x -> x+1, baseY -> topY. Normal (-rise, 1, 0)
        p0x = x;     p0y = baseY; p0z = z;
        p1x = x;     p1y = baseY; p1z = z + 1;
        p2x = x + 1; p2y = topY;  p2z = z + 1;
        p3x = x + 1; p3y = topY;  p3z = z;
        nx = -rise * invLen; ny = invLen; nz = 0;
    } else if (dx === -1) {
        // -x: slope rises x+1 -> x, baseY -> topY. Normal (+rise, 1, 0)
        p0x = x + 1; p0y = baseY; p0z = z;
        p1x = x;     p1y = topY;  p1z = z;
        p2x = x;     p2y = topY;  p2z = z + 1;
        p3x = x + 1; p3y = baseY; p3z = z + 1;
        nx = rise * invLen;  ny = invLen; nz = 0;
    } else if (dz === 1) {
        // +z: slope rises z -> z+1, baseY -> topY. Normal (0, 1, -rise)
        p0x = x;     p0y = baseY; p0z = z;
        p1x = x;     p1y = topY;  p1z = z + 1;
        p2x = x + 1; p2y = topY;  p2z = z + 1;
        p3x = x + 1; p3y = baseY; p3z = z;
        nx = 0; ny = invLen; nz = -rise * invLen;
    } else /* dz === -1 */ {
        // -z: slope rises z+1 -> z, baseY -> topY. Normal (0, 1, +rise)
        p0x = x;     p0y = baseY; p0z = z + 1;
        p1x = x + 1; p1y = baseY; p1z = z + 1;
        p2x = x + 1; p2y = topY;  p2z = z;
        p3x = x;     p3y = topY;  p3z = z;
        nx = 0; ny = invLen; nz = rise * invLen;
    }
    // Triangle 1: p0, p1, p2.  Triangle 2: p0, p2, p3.
    verts.push(p0x, p0y, p0z, p1x, p1y, p1z, p2x, p2y, p2z);
    verts.push(p0x, p0y, p0z, p2x, p2y, p2z, p3x, p3y, p3z);
    for (let k = 0; k < 6; k++) normals.push(nx, ny, nz);
    // Color: low for vertices at baseY, high (crest voxel) for vertices at topY.
    const useY = [p0y, p1y, p2y, p0y, p2y, p3y];
    for (let k = 0; k < 6; k++) {
        if (useY[k] === baseY) {
            cols.push(colLow[0], colLow[1], colLow[2]);
        } else {
            cols.push(colHigh[0], colHigh[1], colHigh[2]);
        }
    }
}

// Round 55 - corner-cap slope. Fills the outside-corner gap that the
// cardinal pass misses: V at (x,y,z), top exposed, diagonal step-up at
// (x+dx, y+1, z+dz), no cardinal step-ups in (dx, 0) or (0, dz).
// Geometry: 4 corners of V's top + the diagonal step-up's near-top
// corner. Two triangles fold along the diagonal v0-v2.
//
// Vertex order per diagonal so cross products yield outward-up normals:
//   (+1,+1):  v0=(x,y+1,z),    v1=(x+1,y+1,z),   v2=(x+1,y+2,z+1), v3=(x,y+1,z+1)
//             tris: (v0,v2,v1) normal (0,1,-1);  (v0,v3,v2) normal (-1,1,0)
//   (-1,+1):  v0=(x+1,y+1,z),  v1=(x,y+1,z),     v2=(x,y+2,z+1),   v3=(x+1,y+1,z+1)
//             tris: (v0,v1,v2) normal (0,1,-1);  (v0,v2,v3) normal (+1,1,0)
//   (+1,-1):  v0=(x,y+1,z+1),  v1=(x+1,y+1,z+1), v2=(x+1,y+2,z),   v3=(x,y+1,z)
//             tris: (v0,v1,v2) normal (0,1,+1);  (v0,v2,v3) normal (-1,1,0)
//   (-1,-1):  v0=(x+1,y+1,z+1),v1=(x,y+1,z+1),   v2=(x,y+2,z),     v3=(x+1,y+1,z)
//             tris: (v0,v2,v1) normal (0,1,+1);  (v0,v3,v2) normal (+1,1,0)
function emitCornerCap(verts, normals, cols, x, y, z, dx, dz, lowerVoxel, upperVoxel) {
    const colLow  = PALETTE[lowerVoxel] || [1, 1, 1];
    const colHigh = PALETTE[upperVoxel] || colLow;
    const ROOT2_INV = 0.7071067811865475;
    let v0, v1, v2, v3;        // each is [x, y, z]
    let t1Order, t2Order;      // index triples into [v0,v1,v2,v3]
    let n1x, n1y, n1z, n2x, n2y, n2z;
    if (dx === 1 && dz === 1) {
        v0 = [x,     y + 1, z    ];
        v1 = [x + 1, y + 1, z    ];
        v2 = [x + 1, y + 2, z + 1];
        v3 = [x,     y + 1, z + 1];
        t1Order = [0, 2, 1]; t2Order = [0, 3, 2];
        n1x = 0;            n1y = ROOT2_INV; n1z = -ROOT2_INV;
        n2x = -ROOT2_INV;   n2y = ROOT2_INV; n2z = 0;
    } else if (dx === -1 && dz === 1) {
        v0 = [x + 1, y + 1, z    ];
        v1 = [x,     y + 1, z    ];
        v2 = [x,     y + 2, z + 1];
        v3 = [x + 1, y + 1, z + 1];
        t1Order = [0, 1, 2]; t2Order = [0, 2, 3];
        n1x = 0;          n1y = ROOT2_INV; n1z = -ROOT2_INV;
        n2x = ROOT2_INV;  n2y = ROOT2_INV; n2z = 0;
    } else if (dx === 1 && dz === -1) {
        v0 = [x,     y + 1, z + 1];
        v1 = [x + 1, y + 1, z + 1];
        v2 = [x + 1, y + 2, z    ];
        v3 = [x,     y + 1, z    ];
        t1Order = [0, 1, 2]; t2Order = [0, 2, 3];
        n1x = 0;           n1y = ROOT2_INV; n1z = ROOT2_INV;
        n2x = -ROOT2_INV;  n2y = ROOT2_INV; n2z = 0;
    } else /* dx === -1 && dz === -1 */ {
        v0 = [x + 1, y + 1, z + 1];
        v1 = [x,     y + 1, z + 1];
        v2 = [x,     y + 2, z    ];
        v3 = [x + 1, y + 1, z    ];
        t1Order = [0, 2, 1]; t2Order = [0, 3, 2];
        n1x = 0;          n1y = ROOT2_INV; n1z = ROOT2_INV;
        n2x = ROOT2_INV;  n2y = ROOT2_INV; n2z = 0;
    }
    const baseY = y + 1;
    const pushVert = (vArr, nx, ny, nz) => {
        verts.push(vArr[0], vArr[1], vArr[2]);
        normals.push(nx, ny, nz);
        if (vArr[1] === baseY) cols.push(colLow[0],  colLow[1],  colLow[2]);
        else                   cols.push(colHigh[0], colHigh[1], colHigh[2]);
    };
    const verts4 = [v0, v1, v2, v3];
    pushVert(verts4[t1Order[0]], n1x, n1y, n1z);
    pushVert(verts4[t1Order[1]], n1x, n1y, n1z);
    pushVert(verts4[t1Order[2]], n1x, n1y, n1z);
    pushVert(verts4[t2Order[0]], n2x, n2y, n2z);
    pushVert(verts4[t2Order[1]], n2x, n2y, n2z);
    pushVert(verts4[t2Order[2]], n2x, n2y, n2z);
}

// Voxel lookup that crosses chunk boundaries via the neighbors object.
// neighbors[key] = Uint8Array of voxels OR null. Key is "dx,dz" where
// (dx,dz) is offset from local chunk: (-1,0)=west, (1,0)=east etc.
// Returns 0 (air) when out of range or when a neighbor isn't loaded.
function readVoxel(local, neighbors, S, H, lx, ly, lz, skipWater) {
    if (ly < 0 || ly >= H) return 0;
    let dx = 0, dz = 0;
    if (lx < 0)       { dx = -1; lx += S; }
    else if (lx >= S) { dx =  1; lx -= S; }
    if (lz < 0)       { dz = -1; lz += S; }
    else if (lz >= S) { dz =  1; lz -= S; }
    let buf;
    if (dx === 0 && dz === 0) buf = local;
    else buf = neighbors[dx + "," + dz];
    if (!buf) return 0;
    const n = buf[lx + S * (lz + S * ly)];
    if (skipWater && (n === 10 || n === 11)) return 0;
    return n;
}

// Sample for slice/face passes — same as readVoxel but expressed in the
// (slice, i, j, d) coord system the greedy outer loop uses.
function sampleSlice(local, neighbors, S, H, slice, i, j, d, skipWater) {
    let lx, ly, lz;
    if (d === 0)      { lx = slice; ly = i; lz = j; }
    else if (d === 1) { ly = slice; lz = i; lx = j; }
    else              { lz = slice; lx = i; ly = j; }
    return readVoxel(local, neighbors, S, H, lx, ly, lz, skipWater);
}

// Per-corner AO. Uses readVoxel for cross-chunk neighbor lookups.
function cornerAO(local, neighbors, S, H, d, u, v, slice, sign, cu, cv, offsets, skipWater) {
    const outSlice = sign > 0 ? slice + 1 : slice;
    const pos = _pos;
    const samp = (du, dv) => {
        pos[0] = 0; pos[1] = 0; pos[2] = 0;
        pos[d] = outSlice;
        pos[u] = cu + du;
        pos[v] = cv + dv;
        return readVoxel(local, neighbors, S, H, pos[0], pos[1], pos[2], skipWater) ? 1 : 0;
    };
    const s1 = samp(offsets[0][0], offsets[0][1]);
    const s2 = samp(offsets[1][0], offsets[1][1]);
    const sc = samp(offsets[2][0], offsets[2][1]);
    let ao;
    if (s1 && s2) ao = 3;
    else ao = s1 + s2 + sc;
    return (3 - ao) / 3;
}

// Greedy merge over a binary mask; calls `emit(i, j, w, h, code)` for
// each merged rectangle. Mask values: 0 = no face, positive = +d face,
// negative = -d face (signed code).
function greedy(mask, w, h, emit) {
    const area = w * h;
    const used = _usedBuf(area); used.fill(0, 0, area);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const idx = i + j * w;
            const v = mask[idx];
            if (!v || used[idx]) continue;
            let rw = 1;
            while (i + rw < w && mask[idx + rw] === v && !used[idx + rw]) rw++;
            let rh = 1;
            outer:
            while (j + rh < h) {
                for (let k = 0; k < rw; k++) {
                    if (mask[idx + k + rh * w] !== v || used[idx + k + rh * w]) break outer;
                }
                rh++;
            }
            for (let y = 0; y < rh; y++) {
                for (let x = 0; x < rw; x++) {
                    used[idx + x + y * w] = 1;
                }
            }
            emit(i, j, rw, rh, v);
        }
    }
}

// Push 6 vertices (2 tris) for a quad. Uses cornerAO at each of the 4
// corners. Sign of code determines winding + face direction.
function emitQuad(verts, cols, aos, local, neighbors, S, H, cx, cz, d, u, v, slice, i, j, w, h, code, skipWater) {
    const A = _A, B = _B, C = _C, D = _D;
    const dPos = slice + 1;
    A[d] = dPos; B[d] = dPos; C[d] = dPos; D[d] = dPos;
    A[u] = i;     B[u] = i + w;
    C[u] = i + w; D[u] = i;
    A[v] = j;     B[v] = j;
    C[v] = j + h; D[v] = j + h;
    const ox = cx * S;
    const oz = cz * S;
    A[0] += ox; A[2] += oz;
    B[0] += ox; B[2] += oz;
    C[0] += ox; C[2] += oz;
    D[0] += ox; D[2] += oz;

    const absCode = code < 0 ? -code : code;
    const col = PALETTE[absCode] || [1, 1, 1];
    const sign = code > 0 ? 1 : -1;

    const aoA = cornerAO(local, neighbors, S, H, d, u, v, slice, sign, i,     j,     [[-1,  0], [ 0, -1], [-1, -1]], skipWater);
    const aoB = cornerAO(local, neighbors, S, H, d, u, v, slice, sign, i + w, j,     [[ 0,  0], [-1, -1], [ 0, -1]], skipWater);
    const aoC = cornerAO(local, neighbors, S, H, d, u, v, slice, sign, i + w, j + h, [[ 0, -1], [-1,  0], [ 0,  0]], skipWater);
    const aoD = cornerAO(local, neighbors, S, H, d, u, v, slice, sign, i,     j + h, [[-1, -1], [ 0,  0], [-1,  0]], skipWater);

    if (code > 0) {
        // Round 132 — ANISOTROPIC FLIP. The classic voxel AO bug is the
        // "bright square bleeding into dark square" along the shared
        // diagonal. When the sum of AO along one diagonal differs from
        // the other, flipping the triangle split avoids the artifact —
        // interpolation crosses the diagonal where AO is more uniform.
        // Compare aoA+aoC (current A-C diagonal) vs aoB+aoD (B-D diag).
        // If B-D is more uniform (sum higher OR closer to mean), flip.
        const flip = (aoA + aoC) < (aoB + aoD);
        if (!flip) {
            verts.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2],
                       A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
            aos.push(aoA, aoB, aoC, aoA, aoC, aoD);
        } else {
            verts.push(A[0], A[1], A[2], B[0], B[1], B[2], D[0], D[1], D[2],
                       B[0], B[1], B[2], C[0], C[1], C[2], D[0], D[1], D[2]);
            aos.push(aoA, aoB, aoD, aoB, aoC, aoD);
        }
    } else {
        const flip = (aoA + aoC) < (aoB + aoD);
        if (!flip) {
            verts.push(A[0], A[1], A[2], C[0], C[1], C[2], B[0], B[1], B[2],
                       A[0], A[1], A[2], D[0], D[1], D[2], C[0], C[1], C[2]);
            aos.push(aoA, aoC, aoB, aoA, aoD, aoC);
        } else {
            verts.push(A[0], A[1], A[2], D[0], D[1], D[2], B[0], B[1], B[2],
                       B[0], B[1], B[2], D[0], D[1], D[2], C[0], C[1], C[2]);
            aos.push(aoA, aoD, aoB, aoB, aoD, aoC);
        }
    }
    for (let k = 0; k < 6; k++) {
        cols.push(col[0], col[1], col[2]);
    }
}

// Main entry. Args:
//   { voxels, neighbors, size, height, cx, cz, skipWater }
// Returns:
//   { verts: Float32Array, cols: Float32Array, aos: Float32Array }
export function meshChunk(args) {
    const { voxels, neighbors, size: S, height: H, cx, cz, skipWater } = args;
    const verts = [];
    const cols = [];
    const aos = [];
    const dims = [S, H, S];

    for (let d = 0; d < 3; d++) {
        const u = (d + 1) % 3;
        const v = (d + 2) % 3;
        const sliceMax = dims[d];
        const maskW = dims[u], maskH = dims[v];
        const maskArea = maskW * maskH;
        const mask = _maskBuf(maskArea);

        // v3069 -- START AT -1. This loop compared slice vs slice+1 for slice = 0..sliceMax-1, which means:
        //   * the boundary at -1 | 0 was NEVER SAMPLED, so every -d face on the chunk's lower wall was missing;
        //   * and slice = sliceMax-1 emitted a -d face owned by the voxel at sliceMax -- a face belonging to the
        //     NEIGHBOUR chunk, which that neighbour also draws.
        // So every chunk omitted its own lower wall and drew its upper neighbour's instead. In a full world those
        // overlap at every seam: doubled geometry and z-fighting along every chunk boundary.
        //
        // IT HID BECAUSE THE TWO ERRORS CANCEL. On the terrain fixture -Z was missing 95 at z=0 and gained 95 at
        // z=16 -- net zero, totals clean. -X was missing 30 and gained 50, and that leftover +20 is the only
        // reason v2794 noticed anything at all. An aggregate is invariant under a shift, which is the same lesson
        // the axis-swap taught the volume cache: a count cannot see geometry that MOVED.
        for (let slice = -1; slice < sliceMax; slice++) {
            mask.fill(0, 0, maskArea);
            for (let j = 0; j < maskH; j++) {
                for (let i = 0; i < maskW; i++) {
                    const a = sampleSlice(voxels, neighbors, S, H, slice,     i, j, d, skipWater);
                    const b = sampleSlice(voxels, neighbors, S, H, slice + 1, i, j, d, skipWater);
                    const idx = i + j * maskW;
                    // A face is owned by the voxel it belongs to, and only faces owned by THIS chunk may be
                    // emitted. +d is owned by `slice`, -d by `slice + 1`.
                    // KEEP THE FLOOR SKIP. Starting at -1 also sampled y = -1 | 0, which restored 256 downward
                    // quads per chunk at the world floor -- geometry greedy has always deliberately omitted
                    // because it can never be seen, and exactly what v2795 optimised away on the RLE side. The
                    // boundary fix must not smuggle that back in: this is a horizontal-seam bug, and the floor
                    // is not a seam.
                    const floorPlane = (d === 1 && slice === -1);
                    if (a && !b) { if (slice >= 0) mask[idx] = a; }
                    else if (!a && b) { if (slice + 1 < sliceMax && !floorPlane) mask[idx] = -b; }
                }
            }
            greedy(mask, maskW, maskH, (i, j, w, h, code) => {
                emitQuad(verts, cols, aos, voxels, neighbors, S, H, cx, cz, d, u, v, slice, i, j, w, h, code, skipWater);
            });
        }
    }

    // Round 54 - alongside the cube mesh, build a stair-step smoothing
    // overlay mesh. Cheap: one extra pass over the voxel array with
    // 4-neighbor checks. Empty for chunks without stair patterns.
    const slopes = meshSlopes(args);

    return {
        verts: new Float32Array(verts),
        cols:  new Float32Array(cols),
        aos:   new Float32Array(aos),
        slopeVerts:   slopes.verts,
        slopeNormals: slopes.normals,
        slopeCols:    slopes.cols,
    };
}
