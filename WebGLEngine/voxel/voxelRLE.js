// voxel/voxelRLE.js
//
// Run-length-encoded voxel chunks (v2768). A 32 x 256 x 32 chunk is 262,144 voxels -- 256 KB as a flat Uint8Array
// per chunk, which is a lot once you hold a world of them. But those TALL 256-high columns are almost all runs:
// bedrock, then a long run of stone, then dirt, then a very long run of air. RLE turns each column into a handful
// of (type, count) pairs. The index order is column-major with Y FASTEST, so a whole vertical column is one
// contiguous span and the vertical runs are as long as possible -- that is the entire reason this compresses.
//
// Can it be RUNTIME data, not just storage? Yes, with the access pattern matched to the shape:
//   - read / stream / mesh a chunk: stay RLE. A prefix index gives O(log runs) point queries, and the runs map
//     straight onto greedy meshing (a vertical run of one type is one tall quad). Distant, read-only chunks live
//     compressed for almost nothing.
//   - heavy random EDITING of one chunk: decode that chunk to a flat array (O(1) writes), re-encode on eviction.
// So the honest rule is: RLE for the many quiet chunks, flat for the one you are carving. It is a memory win of
// tens of times on terrain, and a LOSS on incompressible noise (a run is 5 bytes; all-different voxels make it
// worse than flat) -- which the gate states plainly rather than hides.

/**
 * v3154 -- THE ONE DEFINITION OF SOLID, in the module every voxel path already imports.
 *
 * There were SIX independent copies of `(t) => t !== 0` across voxel/: two in rleBrickMap (fixed at v3153),
 * one in rleChunkMesh, TWO IN rleRenderMesh -- the same file building the predicate once for the mesh and
 * again for the AO split -- and two in rleWorldBridge. Identical today, and nothing holding them so.
 *
 * *** THE COST IS NOT TIDINESS. *** v3153 measured what happens when two of them disagree: the SAME brick map
 * reported "EXACT, none optimistic" under one predicate and "UNSAFE, 1 of 144 bricks hold a solid" under
 * another. A mesher and a brick map that disagree about what counts as solid produce a world where the
 * geometry you can SEE and the geometry a ray can HIT are different sets, and nothing reports it.
 *
 * It lives HERE because voxelRLE imports nothing from voxel/ -- it is the base, so every path can reach this
 * without a cycle, and rleBrickMap re-exports it so v3153's callers keep working.
 */
export const SOLID_NONZERO = (t) => t !== 0;

export const RLE_SX = 32, RLE_SY = 256, RLE_SZ = 32, RLE_N = RLE_SX * RLE_SY * RLE_SZ;   // 262144 (default chunk)

// Dimensions carried ON an rle object (stamped by encodeRLE). Falls back to the module 32x256x32 defaults so
// every existing 32x256x32 caller that never passes dims keeps working unchanged.
export function rleDims(rle) {
    return { sx: (rle && rle.sx) || RLE_SX, sy: (rle && rle.sy) || RLE_SY, sz: (rle && rle.sz) || RLE_SZ };
}

// Linear index with Y FASTEST: idx = (x*SZ + z)*SY + y. Iterating idx runs straight up a column, so a column of
// one material is a single run. dims optional -> defaults to the module constants (back-compat).
export function rleIndex(x, y, z, dims) {
    const sy = dims ? dims.sy : RLE_SY, sz = dims ? dims.sz : RLE_SZ;
    return (x * sz + z) * sy + y;
}

// Encode a flat Uint8Array (length sx*sy*sz, in rleIndex order) into parallel type/count arrays. The dims are
// stamped onto the result so the surface/mesh stack can read them without being told again.
export function encodeRLE(voxels, dims) {
    const d = dims || { sx: RLE_SX, sy: RLE_SY, sz: RLE_SZ };
    if (voxels.length === 0) return { types: new Uint8Array(0), counts: new Uint32Array(0), length: 0, sx: d.sx, sy: d.sy, sz: d.sz };
    const types = [], counts = [];
    let cur = voxels[0], n = 1;
    for (let i = 1; i < voxels.length; i++) {
        if (voxels[i] === cur) n++;
        else { types.push(cur); counts.push(n); cur = voxels[i]; n = 1; }
    }
    types.push(cur); counts.push(n);
    return { types: Uint8Array.from(types), counts: Uint32Array.from(counts), length: voxels.length, sx: d.sx, sy: d.sy, sz: d.sz };
}

// Decode back to a flat array. Lossless: decode(encode(v)) deep-equals v.
export function decodeRLE(rle, out) {
    out = out || new Uint8Array(rle.length);
    let i = 0;
    for (let r = 0; r < rle.types.length; r++) {
        const t = rle.types[r], c = rle.counts[r];
        out.fill(t, i, i + c);
        i += c;
    }
    return out;
}

// A running-offset walk -- O(runs). Correct, but for random access build the index below.
export function getRLE(rle, x, y, z) {
    const target = rleIndex(x, y, z, rleDims(rle));
    let off = 0;
    for (let r = 0; r < rle.types.length; r++) { off += rle.counts[r]; if (target < off) return rle.types[r]; }
    return 0;
}

// Prefix-sum index (cumulative counts) for O(log runs) point queries -- this is what makes RLE viable at runtime.
export function buildIndex(rle) {
    const prefix = new Uint32Array(rle.types.length + 1);
    for (let r = 0; r < rle.types.length; r++) prefix[r + 1] = prefix[r] + rle.counts[r];
    return prefix;
}
export function getRLEIndexed(rle, prefix, x, y, z) {
    const target = rleIndex(x, y, z, rleDims(rle));
    let lo = 0, hi = rle.types.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (prefix[mid + 1] <= target) lo = mid + 1; else hi = mid; }
    return rle.types[lo];
}

// voxels-per-run: higher is better. In BYTES a run costs 5 (u8 type + u32 count) vs 1 per flat voxel, so the
// byte-level win is (length) / (runs*5).
export function runStats(rle) {
    return { runs: rle.types.length, voxelsPerRun: rle.length / Math.max(rle.types.length, 1),
             flatBytes: rle.length, rleBytes: rle.types.length * 5, byteRatio: rle.length / Math.max(rle.types.length * 5, 1) };
}
