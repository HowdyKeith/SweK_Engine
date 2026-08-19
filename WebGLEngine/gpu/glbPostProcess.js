// FILE: gpu/glbPostProcess.js
// VERSION: v1 — round 364
//
// Post-process pass for parsed GLB meshes. Welds duplicate vertices,
// remaps companion per-vertex streams (normals, texCoords, colors) to
// match the welded position array, and (optionally) recomputes smooth
// face-area-weighted normals.
//
// SKIPS SKINNED MESHES. Welding away duplicate verts would also need to
// merge JOINTS_0/WEIGHTS_0 streams in a skinning-aware way (or per-joint
// duplicate verts get collapsed and skinning breaks). That's a real
// project; for now we just leave skinned meshes alone.
//
// The point: AI-generated meshes (Trellis 2, Hunyuan3D, etc.) often
// ship with duplicate vertices and crude per-face normals. A single
// weld+smooth pass turns "obviously generated" into "passably authored"
// at the cost of one O(n) pass at load time.

import { weld, recomputeNormals } from "../worker/meshPostProcessor.worker.js";

/**
 * Apply a vertex remap to a per-vertex attribute stream.
 *
 * @param {Float32Array|Uint8Array|null} stream  source stream (or null)
 * @param {Int32Array} remap                      old vertex idx → new vertex idx
 * @param {number} weldedCount                    new vertex count
 * @param {number} comps                          components per vertex (3 for normals, 2 for UVs, 4 for colors)
 * @returns {Float32Array|Uint8Array|null}        re-indexed stream, or null
 */
export function applyVertexRemap(stream, remap, weldedCount, comps) {
    if (!stream) return null;
    const Ctor = stream.constructor;
    const out  = new Ctor(weldedCount * comps);
    // First-write-wins: as we walk source vertices in order, the first
    // time a `remap[i]` slot appears, write its attributes. Subsequent
    // duplicates fall on the same slot and re-write the same values
    // (assuming positions matched, the attributes typically do too).
    const seen = new Uint8Array(weldedCount);
    for (let i = 0; i < remap.length; i++) {
        const dst = remap[i];
        if (seen[dst]) continue;
        seen[dst] = 1;
        for (let c = 0; c < comps; c++) {
            out[dst * comps + c] = stream[i * comps + c];
        }
    }
    return out;
}

/**
 * Post-process a parsed GLB mesh in-place-style (returns a new object).
 * Pass-through when `mesh` is skinned, when explicitly opted out, or
 * when post-process fails (mesh returned unchanged with a warning).
 *
 * @param {Object} mesh   parsed result from GLBParser.parse()
 * @param {Object} [opts]
 * @param {number} [opts.epsilon=1e-4]      weld tolerance in world units
 * @param {boolean} [opts.recomputeNormals=true] override file normals with welded smooth normals
 * @returns {Object} new mesh result with `_meshPostProcess` stats appended
 */
export function postProcessGlbMesh(mesh, opts = {}) {
    if (!mesh || !mesh.positions || !mesh.indices) {
        return mesh;
    }
    // Skinned meshes: skip. (See header comment.)
    if (mesh.skin || (mesh.joints && mesh.joints.length > 0)) {
        return { ...mesh, _meshPostProcess: { skipped: "skinned" } };
    }
    const epsilon       = opts.epsilon ?? 1e-4;
    const wantNormals   = opts.recomputeNormals !== false;
    try {
        const welded = weld(mesh.positions, mesh.indices, epsilon);
        const { remap, weldedCount, originalCount } = welded;
        // No-op weld: positions array unchanged, skip the work
        if (weldedCount === originalCount) {
            return {
                ...mesh,
                _meshPostProcess: {
                    welded: false, originalCount, weldedCount,
                    reduction: 0,
                },
            };
        }
        const newNormals = wantNormals
            ? recomputeNormals(welded.positions, welded.indices)
            : applyVertexRemap(mesh.normals, remap, weldedCount, 3);
        const newTexCoords = applyVertexRemap(mesh.texCoords, remap, weldedCount, 2);
        const newColors    = applyVertexRemap(mesh.colors,    remap, weldedCount, 4);
        return {
            ...mesh,
            positions: welded.positions,
            indices:   welded.indices,
            normals:   newNormals,
            texCoords: newTexCoords,
            colors:    newColors,
            _meshPostProcess: {
                welded: true,
                originalCount,
                weldedCount,
                reduction: 1 - (weldedCount / originalCount),
                recomputedNormals: !!wantNormals,
            },
        };
    } catch (e) {
        console.warn("[glbPostProcess] failed, returning unprocessed mesh:", e?.message ?? e);
        return { ...mesh, _meshPostProcess: { error: e?.message ?? String(e) } };
    }
}
