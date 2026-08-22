// WebGLEngine/mesh/greedyMesh3d.js — v2574
//
// FULL-3D GREEDY MESHING. All six face directions, merged into maximal rectangles.
//
// ---- WHY THIS AND NOT ONE OF THE THREE WE ALREADY HAD ---------------------------------------------------------
//
// v2572/v2573 counted them:
//
//   mesh/greedyMesher.js   v1        WORKS -- a flat 16x16 slab becomes ONE quad -- but 2.5D, TOP FACES ONLY,
//                                    and its own comment says so. NOT LIVE: its only importer is
//                                    mesh/chunkMeshBuilder.js, WHICH ITSELF HAS ZERO IMPORTERS. This line said
//                                    "Live, via mesh/chunkMeshBuilder.js" for as long as it has existed --
//                                    a liveness claim that checked ONE HOP and stopped. Reachability is
//                                    transitive; being imported by a file nothing loads is not being live.
//   voxel/greedyMesh.js    v2        THROWS on chunk.getIndex, which nothing in this tree defines. Its callers
//                                    are orphans. Dead.
//   voxel-viewer.html:208  inline    THE ONE A HUMAN ACTUALLY LOOKS AT. Culls hidden faces against a Set and
//                                    MERGES NOTHING: 576 faces / 1152 triangles for the slab v1 does in 1 quad.
//
// v1 CANNOT replace the viewer -- v1 gives you the top, the viewer needs all six. THEY DO DIFFERENT JOBS. The gap
// between them is full-3D greedy meshing, and this engine did not have it. That is the gap
// vercidium-patreon/meshing (MIT, C#, Part 1 of the Free Friday series) fills; the C# does not port, the
// algorithm does.
//
// ---- THE INVARIANT THAT MAKES THIS TESTABLE WITHOUT A GPU ------------------------------------------------------
//
// Panini had a gift: "the linear projection at Ez=0 belongs to both families" is a falsifiable identity, so the
// maths could be proven on a CPU. Greedy meshing has the same kind of gift, and it is stronger:
//
//     A GREEDY MESH MUST COVER EXACTLY THE SAME UNIT FACES AS A NAIVE MESH. NOT APPROXIMATELY. EXACTLY.
//
// Merging is a re-description of the same surface. If a merged quad covers a face the naive mesher did not emit,
// the mesh has grown a wall that is not there. If it misses one, the model has a hole. Both are exactly
// detectable by decomposing every quad back into unit faces and comparing SETS.
//
// "The voxels look right" is not a test -- a mesher that dropped one interior face would pass it every time.
// This module is gated on set equality against a naive reference, per direction, on five different shapes
// including a hollow shell and a random cloud.
//
// ---- THE ALGORITHM --------------------------------------------------------------------------------------------
//
// For each of the 6 face directions: sweep slice by slice along that axis. Build a 2D mask of which cells in this
// slice have a visible face in this direction. Then greedily consume the mask into maximal rectangles: find the
// first set cell, extend as far right as the run continues, then extend DOWN as many rows as match that full
// width, clear the rectangle, repeat. That is the classic 2D greedy pass; running it once per slice per direction
// is what makes it 3D.

const DIRS = [
    { n: [1, 0, 0], axis: 0, u: 1, v: 2 },   // +X   axis = the slice normal; u,v = the two in-plane axes
    { n: [-1, 0, 0], axis: 0, u: 1, v: 2 },  // -X
    { n: [0, 1, 0], axis: 1, u: 0, v: 2 },   // +Y
    { n: [0, -1, 0], axis: 1, u: 0, v: 2 },  // -Y
    { n: [0, 0, 1], axis: 2, u: 0, v: 1 },   // +Z
    { n: [0, 0, -1], axis: 2, u: 0, v: 1 },  // -Z
];

/**
 * @param {(x:number,y:number,z:number)=>boolean} solid  is this cell filled? MUST answer false outside the volume.
 * @param {[number,number,number]} dims  [sx, sy, sz]
 * @returns {Array<{pos:[number,number,number], normal:[number,number,number], du:[number,number,number], dv:[number,number,number], w:number, h:number}>}
 */
/**
 * v2577 -- THE TAGGED VARIANT, and it is not an optional nicety.
 *
 * voxel-viewer.html:215 reads `for (const [x, y, z, c] of voxels)` -- FOUR elements, where c is a PALETTE INDEX.
 * greedyMesh3d takes a BOOLEAN predicate and therefore CANNOT SEE COLOUR, so it would cheerfully merge a red
 * voxel and a blue voxel into one quad and paint the result a single colour. THAT IS A SILENT CORRUPTION: it
 * does not throw, it does not warn, and it looks like a texturing bug.
 *
 * So the mask carries a TAG, and a run only continues while the tag MATCHES. Same sweep, one more equality.
 *
 * @param {(x:number,y:number,z:number)=>number} tagAt  0 (or falsy) = empty; any other value = a material tag.
 * @param {[number,number,number]} dims
 * @returns quads, each carrying the `tag` every cell it covers shares.
 */
export function greedyMesh3dTagged(tagAt, dims) {
    const quads = [];
    for (const d of DIRS) {
        const { axis, u, v, n } = d;
        const uSize = dims[u], vSize = dims[v], aSize = dims[axis];
        for (let a = 0; a < aSize; a++) {
            const mask = new Int32Array(uSize * vSize);   // 0 = no face here; otherwise THE TAG
            let any = false;
            for (let vi = 0; vi < vSize; vi++) {
                for (let ui = 0; ui < uSize; ui++) {
                    const c = [0, 0, 0];
                    c[axis] = a; c[u] = ui; c[v] = vi;
                    const t = tagAt(c[0], c[1], c[2]);
                    if (!t) continue;
                    if (tagAt(c[0] + n[0], c[1] + n[1], c[2] + n[2])) continue;   // occluded by ANY material
                    mask[ui + vi * uSize] = t;
                    any = true;
                }
            }
            if (!any) continue;
            for (let vi = 0; vi < vSize; vi++) {
                for (let ui = 0; ui < uSize;) {
                    const t = mask[ui + vi * uSize];
                    if (!t) { ui++; continue; }
                    let w = 1;
                    while (ui + w < uSize && mask[ui + w + vi * uSize] === t) w++;   // === t, NOT just truthy
                    let h = 1;
                    grow: while (vi + h < vSize) {
                        for (let k = 0; k < w; k++) if (mask[ui + k + (vi + h) * uSize] !== t) break grow;
                        h++;
                    }
                    for (let dv = 0; dv < h; dv++) for (let du = 0; du < w; du++) mask[ui + du + (vi + dv) * uSize] = 0;
                    const pos = [0, 0, 0];
                    pos[axis] = a; pos[u] = ui; pos[v] = vi;
                    const duv = [0, 0, 0], dvv = [0, 0, 0];
                    duv[u] = 1; dvv[v] = 1;
                    quads.push({ pos, normal: n, du: duv, dv: dvv, w, h, tag: t });
                    ui += w;
                }
            }
        }
    }
    return quads;
}

export function greedyMesh3d(solid, dims) {
    const quads = [];
    for (const d of DIRS) {
        const { axis, u, v, n } = d;
        const uSize = dims[u], vSize = dims[v], aSize = dims[axis];

        for (let a = 0; a < aSize; a++) {
            // THE MASK: which cells in this slice show a face in this direction? A face is visible when the cell
            // is solid and its NEIGHBOUR IN THAT DIRECTION IS NOT. That neighbour check is the only place
            // "outside the volume" matters, and solid() must answer false there -- a solid() that reads out of
            // bounds and returns garbage produces a mesh with no outer walls, which looks like a lighting bug.
            const mask = new Uint8Array(uSize * vSize);
            let any = false;
            for (let vi = 0; vi < vSize; vi++) {
                for (let ui = 0; ui < uSize; ui++) {
                    const c = [0, 0, 0];
                    c[axis] = a; c[u] = ui; c[v] = vi;
                    if (!solid(c[0], c[1], c[2])) continue;
                    const nb = [c[0] + n[0], c[1] + n[1], c[2] + n[2]];
                    if (solid(nb[0], nb[1], nb[2])) continue;
                    mask[ui + vi * uSize] = 1;
                    any = true;
                }
            }
            if (!any) continue;

            // THE GREEDY PASS. Consume the mask into maximal rectangles.
            for (let vi = 0; vi < vSize; vi++) {
                for (let ui = 0; ui < uSize;) {
                    if (!mask[ui + vi * uSize]) { ui++; continue; }
                    // extend along u while the run continues
                    let w = 1;
                    while (ui + w < uSize && mask[ui + w + vi * uSize]) w++;
                    // extend along v only while the ENTIRE width matches -- a partial row would leave a notch,
                    // and a rectangle with a notch is not a rectangle
                    let h = 1;
                    grow: while (vi + h < vSize) {
                        for (let k = 0; k < w; k++) if (!mask[ui + k + (vi + h) * uSize]) break grow;
                        h++;
                    }
                    for (let dv = 0; dv < h; dv++) for (let du = 0; du < w; du++) mask[ui + du + (vi + dv) * uSize] = 0;

                    const pos = [0, 0, 0];
                    pos[axis] = a; pos[u] = ui; pos[v] = vi;
                    const duv = [0, 0, 0], dvv = [0, 0, 0];
                    duv[u] = 1; dvv[v] = 1;
                    quads.push({ pos, normal: n, du: duv, dv: dvv, w, h });
                    ui += w;
                }
            }
        }
    }
    return quads;
}

/**
 * The naive reference: one unit face per visible cell face. This is not dead weight -- IT IS THE ORACLE. The
 * greedy mesh is only trustworthy because this exists to disagree with it.
 */
export function naiveFaces(solid, dims) {
    const out = [];
    for (let x = 0; x < dims[0]; x++) {
        for (let y = 0; y < dims[1]; y++) {
            for (let z = 0; z < dims[2]; z++) {
                if (!solid(x, y, z)) continue;
                for (const d of DIRS) {
                    if (solid(x + d.n[0], y + d.n[1], z + d.n[2])) continue;
                    out.push({ pos: [x, y, z], normal: d.n });
                }
            }
        }
    }
    return out;
}

/** Decompose greedy quads back into the unit faces they claim to cover, as a Set of strings. */
export function quadsToUnitFaces(quads) {
    const s = new Set();
    for (const q of quads) {
        for (let j = 0; j < q.h; j++) {
            for (let i = 0; i < q.w; i++) {
                const p = [
                    q.pos[0] + q.du[0] * i + q.dv[0] * j,
                    q.pos[1] + q.du[1] * i + q.dv[1] * j,
                    q.pos[2] + q.du[2] * i + q.dv[2] * j,
                ];
                s.add(p.join(",") + "|" + q.normal.join(","));
            }
        }
    }
    return s;
}

/** The same, for naive faces. */
export function facesToSet(faces) {
    const s = new Set();
    for (const f of faces) s.add(f.pos.join(",") + "|" + f.normal.join(","));
    return s;
}

/**
 * v2575 -- ADAPT THE SPARSE CONVENTION.
 *
 * This tree speaks THREE chunk languages and nobody wrote that down:
 *
 *   { voxels: Uint8Array, size, height }   dense grid      mesh/greedyMesher.js (v1)
 *   [[x,y,z], ...]                          sparse list     world/VoxelWorld.js, voxel-viewer.html:208
 *   { size, height, getIndex() }            ...nothing else on earth. Only voxel/greedyMesh.js (v2) reads it,
 *                                           and NO CHUNK IN THIS TREE DEFINES getIndex. v2 does not merely
 *                                           throw -- IT SPEAKS A LANGUAGE NOTHING SPEAKS.
 *
 * greedyMesh3d takes a solid(x,y,z) PREDICATE rather than an array, which is why it does not care. This adapter
 * is the bridge for the sparse list, and it is separate from the mesher on purpose: a mesher that knew about
 * chunk formats would need a fourth change the next time someone invents a fifth format.
 *
 * The offset exists because sparse lists have NEGATIVE coordinates (VoxelWorld runs x,z from -5 to +5) and a
 * mask indexed from zero does not. Returning it, rather than silently shifting the geometry, is the difference
 * between a mesh in the right place and a mesh that is quietly five units from where the caller thinks it is.
 */
export function solidFromBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
        return { solid: () => false, dims: [0, 0, 0], offset: [0, 0, 0] };
    }
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const set = new Set();
    for (const b of blocks) {
        set.add(b[0] + "," + b[1] + "," + b[2]);
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b[i]); hi[i] = Math.max(hi[i], b[i]); }
    }
    const dims = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
    // solid() answers in LOCAL coordinates and MUST answer false outside -- greedyMesh3d asks about the cells
    // just past every boundary, and a true there produces a mesh with no outer walls.
    const solid = (x, y, z) =>
        x >= 0 && y >= 0 && z >= 0 && x < dims[0] && y < dims[1] && z < dims[2] &&
        set.has((x + lo[0]) + "," + (y + lo[1]) + "," + (z + lo[2]));
    return { solid, dims, offset: lo };
}
