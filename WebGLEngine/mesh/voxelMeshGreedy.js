// WebGLEngine/mesh/voxelMeshGreedy.js — v2578
//
// Builds voxel-viewer.html's EXACT buffer contract using greedyMesh3dTagged instead of one quad per face.
//
// ---- THE CONTRACT IS NOT NEGOTIABLE ---------------------------------------------------------------------------
//
// voxel-viewer.html:235 returns { positions: Float32Array, normals: Float32Array, colors: Float32Array,
// indices: Uint32Array, bounds }. Its consumer at :449 and :699 uploads those straight to the GPU. THIS MODULE
// RETURNS THE SAME SHAPE OR IT IS NOT A DROP-IN, and a mesher that is not a drop-in behind a flag is a rewrite
// of the page pretending to be a flag.
//
// Voxels are [x, y, z, c] -- FOUR elements, c is a PALETTE INDEX. That is why this uses the TAGGED mesher: a
// colour-blind one merges a red voxel with a blue one and paints the result a single colour, silently.
//
// ---- WINDING IS THE PART THAT CANNOT BE EYEBALLED --------------------------------------------------------------
//
// The page's FACES table pairs each normal with FOUR VERTICES IN A SPECIFIC ORDER, and pushes
// (base, base+1, base+2, base, base+2, base+3). Get the order wrong and every triangle faces inward: THE MODEL
// RENDERS INSIDE OUT, or vanishes under backface culling, or lights from the wrong side.
//
// This module reuses the page's own vertex order per direction rather than re-deriving it, and the gate proves
// the result: FOR EVERY QUAD, THE GEOMETRIC NORMAL -- cross(v1-v0, v2-v0), computed from the vertices actually
// emitted -- MUST POINT THE SAME WAY AS THE DECLARED NORMAL. That is exact, it is arithmetic, and it does not
// need a screenshot. An inside-out mesh cannot pass it.
import { greedyMesh3dTagged } from "./greedyMesh3d.js";

// The page's palette, and its clamp: PALETTE[max(0, min(7, c|0))] || PALETTE[0].
const PALETTE = [
    [0.55, 0.55, 0.58], [0.45, 0.72, 0.36], [0.62, 0.47, 0.31], [0.85, 0.82, 0.72],
    [0.30, 0.52, 0.82], [0.82, 0.36, 0.32], [0.90, 0.78, 0.30], [0.75, 0.75, 0.80],
];

/**
 * DERIVE the winding. Do not transcribe it.
 *
 * The first version of this file carried a hand-written per-direction corner table, copied off the page's FACES
 * array by eye. THE GATE MEASURED 48 OF 58 QUADS FACING THE WRONG WAY. Six directions, each with a right answer
 * and a wrong one, and I got most of them wrong -- which is exactly what transcription does.
 *
 * The rule is not a lookup, it is arithmetic: emitting corners (0,0) -> (1,0) -> (1,1) -> (0,1) traverses the
 * quad in the sense of du x dv. If that cross product points ALONG the face normal, the winding is already
 * counter-clockwise seen from outside. If it points AGAINST, the same four corners in reverse are.
 *
 * ONE LINE OF ALGEBRA REPLACES SIX GUESSES, AND THE GATE PROVES IT PER QUAD RATHER THAN PER DIRECTION.
 */
function cornerOrder(du, dv, n) {
    const cross = [
        du[1] * dv[2] - du[2] * dv[1],
        du[2] * dv[0] - du[0] * dv[2],
        du[0] * dv[1] - du[1] * dv[0],
    ];
    const along = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2];
    return along > 0
        ? [[0, 0], [1, 0], [1, 1], [0, 1]]
        : [[0, 0], [0, 1], [1, 1], [1, 0]];
}

/**
 * @param {Array<[number,number,number,number]>} voxels  [x, y, z, colourIndex]
 * @returns {{positions:Float32Array, normals:Float32Array, colors:Float32Array, indices:Uint32Array, bounds:*}}
 */
export function buildVoxelMeshGreedy(voxels) {
    if (!Array.isArray(voxels) || voxels.length === 0) {
        return {
            positions: new Float32Array(0), normals: new Float32Array(0),
            colors: new Float32Array(0), indices: new Uint32Array(0),
            bounds: { min: [0, 0, 0], max: [0, 0, 0] },
        };
    }

    // Tag = colourIndex + 1, because 0 means EMPTY to the mesher and palette index 0 is a real colour. Off by
    // one here and every voxel of colour 0 vanishes -- a hole that looks like a content bug.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const tags = new Map();
    for (const v of voxels) {
        const key = v[0] + "," + v[1] + "," + v[2];
        tags.set(key, (Math.max(0, Math.min(7, v[3] | 0))) + 1);
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i]); }
    }
    const dims = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
    const tagAt = (x, y, z) => tags.get((x + lo[0]) + "," + (y + lo[1]) + "," + (z + lo[2])) || 0;

    const quads = greedyMesh3dTagged(tagAt, dims);
    const positions = [], normals = [], colors = [], indices = [];

    for (const q of quads) {
        const order = cornerOrder(q.du, q.dv, q.normal);
        const col = PALETTE[q.tag - 1] || PALETTE[0];
        const base = positions.length / 3;

        // The face plane. A voxel at integer (x,y,z) spans [-0.5, +0.5] around its centre, exactly as the page's
        // FACES table does, so a +X face sits at x + 0.5 and a -X face at x - 0.5.
        for (const [a, b] of order) {
            const p = [
                q.pos[0] + lo[0] + q.du[0] * a * q.w + q.dv[0] * b * q.h + (q.normal[0] > 0 ? 0.5 : -0.5) * Math.abs(q.normal[0]),
                q.pos[1] + lo[1] + q.du[1] * a * q.w + q.dv[1] * b * q.h + (q.normal[1] > 0 ? 0.5 : -0.5) * Math.abs(q.normal[1]),
                q.pos[2] + lo[2] + q.du[2] * a * q.w + q.dv[2] * b * q.h + (q.normal[2] > 0 ? 0.5 : -0.5) * Math.abs(q.normal[2]),
            ];
            // A quad spans w x h CELLS, and a cell's face runs from -0.5 to +0.5 of its own centre -- so the
            // in-plane extent runs from -0.5 to (w - 0.5). Without this the mesh is half a voxel small on two
            // sides of every quad, which at w=1 is invisible and at w=16 is a visible gap.
            p[0] -= q.du[0] * 0.5 + q.dv[0] * 0.5;
            p[1] -= q.du[1] * 0.5 + q.dv[1] * 0.5;
            p[2] -= q.du[2] * 0.5 + q.dv[2] * 0.5;
            positions.push(p[0], p[1], p[2]);
            normals.push(q.normal[0], q.normal[1], q.normal[2]);
            colors.push(col[0], col[1], col[2]);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        colors: new Float32Array(colors),
        indices: new Uint32Array(indices),
        bounds: { min: [lo[0] - 0.5, lo[1] - 0.5, lo[2] - 0.5], max: [hi[0] + 0.5, hi[1] + 0.5, hi[2] + 0.5] },
        quadCount: quads.length,
    };
}
