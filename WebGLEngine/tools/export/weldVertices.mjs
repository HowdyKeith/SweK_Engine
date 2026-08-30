// FILE: tools/export/weldVertices.mjs
// VERSION: v4163 -- merge duplicate vertices. One of exactly two stages worth taking from boona13/glb-shrink.
//
// *** THE OTHER FIVE STAGES WOULD DAMAGE A VOXEL EXPORT, WHICH IS WHY THIS IS A FUNCTION AND NOT A PIPELINE. ***
// glb-shrink (MIT) runs: strip extensions, weld, simplify with meshoptimizer, re-bake SMOOTH normals, WebP the
// textures, Draco-encode, write. Against what tools/export/voxelGlb.mjs actually emits:
//   weld            -- YES. Voxel meshes share vertices heavily; that is this file.
//   Draco-encode    -- YES, and it is the big win: quantised integer positions are what voxel geometry IS.
//   simplify        -- NO. Decimating a voxel mesh destroys the blocky silhouette that IS the model.
//   smooth normals  -- NO, ACTIVELY WRONG. Voxels want flat per-face normals; smoothing melts them.
//   WebP textures   -- no-op. voxelGlb writes POSITION + COLOR_0 and no TEXCOORD_0 at all.
//
// *** AND WELDING CARRIES THE SAME HAZARD AS THE NORMAL RE-BAKE, ONE LEVEL DOWN. *** The obvious weld keys on
// POSITION, and on a flat-shaded cube that is a disaster: a cube has 8 corners and 24 vertices, because each
// corner appears three times carrying three different face normals. Weld on position and 24 becomes 8, every
// corner gets one averaged normal, and the cube renders SMOOTH -- the exact damage rejecting the normal re-bake
// was meant to avoid, arriving through the stage that looked safe. So the key is the WHOLE VERTEX: position,
// normal and colour. Two vertices merge only when nothing distinguishes them.
//
// The real saving on voxel geometry comes from co-planar quads sharing edge vertices -- same position, same
// normal, same colour -- which is exactly what greedy meshing produces a lot of.

/** Grid the key snaps to. Positions from a voxel mesher are already exact, so this exists for meshes that have
 *  been through a float transform, not to merge things that differ. A coarser value would start welding
 *  vertices that are genuinely apart. */
export const DEFAULT_EPSILON = 1e-6;

const q = (v, eps) => Math.round(v / eps);

/**
 * Weld a mesh's duplicate vertices.
 *
 * Takes and returns the flat arrays voxelGlb.writeGlb speaks: { positions, normals, colors, uvs, indices }.
 * `normals`, `colors`, `uvs` are optional; whichever are present take part in the key AND are rewritten.
 *
 * Returns { positions, normals, colors, uvs, indices, before, after, removed, ratio }.
 */
export function weld(mesh, { epsilon = DEFAULT_EPSILON, keyOn = null } = {}) {
    const positions = mesh.positions || [];
    const count = Math.floor(positions.length / 3);
    const normals = mesh.normals && mesh.normals.length ? mesh.normals : null;
    const colors = mesh.colors && mesh.colors.length ? mesh.colors : null;
    const uvs = mesh.uvs && mesh.uvs.length ? mesh.uvs : null;
    // WHAT COUNTS AS "THE SAME VERTEX" IS A DECISION, SO IT IS NAMED. The default is everything present --
    // anything less is a request to discard a distinction the mesh is currently making.
    const use = keyOn || { position: true, normal: !!normals, color: !!colors, uv: !!uvs };

    const map = new Map();
    const remap = new Int32Array(count);
    const outP = [], outN = [], outC = [], outU = [];
    for (let i = 0; i < count; i++) {
        const parts = [];
        if (use.position) parts.push(q(positions[i * 3], epsilon), q(positions[i * 3 + 1], epsilon), q(positions[i * 3 + 2], epsilon));
        if (use.normal && normals) parts.push(q(normals[i * 3], epsilon), q(normals[i * 3 + 1], epsilon), q(normals[i * 3 + 2], epsilon));
        if (use.color && colors) parts.push(q(colors[i * 3], epsilon), q(colors[i * 3 + 1], epsilon), q(colors[i * 3 + 2], epsilon));
        if (use.uv && uvs) parts.push(q(uvs[i * 2], epsilon), q(uvs[i * 2 + 1], epsilon));
        const key = parts.join(",");
        const hit = map.get(key);
        if (hit !== undefined) { remap[i] = hit; continue; }
        const ni = outP.length / 3;
        map.set(key, ni);
        remap[i] = ni;
        outP.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        if (normals) outN.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
        if (colors) outC.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
        if (uvs) outU.push(uvs[i * 2], uvs[i * 2 + 1]);
    }
    const idxIn = mesh.indices && mesh.indices.length
        ? mesh.indices
        : Array.from({ length: count }, (_, i) => i);   // unindexed input becomes indexed, which is half the saving
    const indices = Array.from(idxIn, (v) => remap[v]);
    const after = outP.length / 3;
    return {
        positions: outP,
        normals: normals ? outN : undefined,
        colors: colors ? outC : undefined,
        uvs: uvs ? outU : undefined,
        indices,
        before: count, after, removed: count - after,
        ratio: count ? after / count : 1,
        keyedOn: Object.entries(use).filter(([, v]) => v).map(([k]) => k),
    };
}

/** Does a weld preserve the surface exactly? Every triangle must still reference a vertex whose position,
 *  normal and colour are unchanged. A weld that passes this changed the STORAGE and not the MODEL. */
export function weldIsLossless(before, after, { epsilon = DEFAULT_EPSILON } = {}) {
    const bi = before.indices && before.indices.length ? before.indices
        : Array.from({ length: Math.floor((before.positions || []).length / 3) }, (_, i) => i);
    if (bi.length !== after.indices.length) return { ok: false, why: "triangle count changed" };
    const same = (a, ai, b, bj, n) => {
        for (let k = 0; k < n; k++) if (q(a[ai * n + k], epsilon) !== q(b[bj * n + k], epsilon)) return false;
        return true;
    };
    for (let t = 0; t < bi.length; t++) {
        const o = bi[t], w = after.indices[t];
        if (!same(before.positions, o, after.positions, w, 3)) return { ok: false, why: "position moved at triangle index " + t };
        if (before.normals && after.normals && !same(before.normals, o, after.normals, w, 3)) return { ok: false, why: "normal changed at index " + t };
        if (before.colors && after.colors && !same(before.colors, o, after.colors, w, 3)) return { ok: false, why: "colour changed at index " + t };
    }
    return { ok: true, why: "every triangle references an identical vertex" };
}
