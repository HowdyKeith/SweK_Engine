// voxel/rleSurface.js
//
// Fast surface detection straight off the run boundaries (v2769). Your insight: because the chunk is encoded
// Y-fastest, every run boundary is a place where the voxel type changes -- and a visible horizontal face is
// exactly a place where a solid voxel meets air. So we do NOT scan 262,144 voxels looking for exposed faces; we
// walk the ~4,000 run boundaries, and at each boundary where one side is solid and the other is not, we emit a
// +Y (top) or -Y (bottom) face. That is the surface, for free, as a side effect of how the data was stored.
//
// This gives the ±Y faces directly (the tops and undersides -- the bulk of a terrain's visible surface). The ±X
// and ±Z faces still need adjacent COLUMNS compared, which is a run-vs-run merge between neighbouring columns --
// cheaper than a voxel scan but not free; that is a later step. What this proves is the core of your idea: the
// run boundaries ARE the vertical surface, and reading them is O(runs), not O(voxels).

import { RLE_SX, RLE_SY, RLE_SZ, rleIndex, rleDims } from "./voxelRLE.js";

// inverse of rleIndex = (x*SZ + z)*SY + y
export function rleUnindex(idx) {
    const y = idx % RLE_SY;
    const c = (idx / RLE_SY) | 0;
    const z = c % RLE_SZ;
    const x = (c / RLE_SZ) | 0;
    return [x, y, z];
}

// Walk the run boundaries; emit a ±Y face wherever solid meets not-solid within a column. isSolid(type)->bool.
// A boundary that lands at y===0 is the seam between two DIFFERENT columns (not vertical neighbours), so it is
// skipped. Returns {x, y, z, dir} with dir +1 for a top face, -1 for a bottom face. O(runs). Reads the chunk
// dims off the rle object (stamped by encodeRLE), defaulting to 32x256x32.
export function yFacesFromRLE(rle, isSolid) {
    const { sy, sz } = rleDims(rle);
    const faces = [];
    if (rle.types.length === 0) return faces;
    let off = rle.counts[0];
    for (let r = 1; r < rle.types.length; r++) {
        const below = rle.types[r - 1], above = rle.types[r];   // below = last voxel of run r-1, above = first of run r
        const y = off % sy;                                     // dim-aware unindex of the boundary
        const c = (off / sy) | 0;
        const z = c % sz;
        const x = (c / sz) | 0;
        if (y > 0) {                                            // same column -> real vertical neighbours
            const sB = isSolid(below), sA = isSolid(above);
            if (sB && !sA) faces.push({ x, y: y - 1, z, dir: 1 });   // top of the solid below
            else if (!sB && sA) faces.push({ x, y, z, dir: -1 });    // underside of the solid above
        }
        off += rle.counts[r];
    }
    return faces;
}

// Reference: the same faces found by touching every voxel. Used only to prove the fast path -- this is the O(N)
// cost the run-boundary walk avoids.
export function yFacesBrute(flat, isSolid) {
    const faces = [];
    for (let x = 0; x < RLE_SX; x++) for (let z = 0; z < RLE_SZ; z++) for (let y = 0; y < RLE_SY - 1; y++) {
        const cur = flat[rleIndex(x, y, z)], up = flat[rleIndex(x, y + 1, z)];
        if (isSolid(cur) && !isSolid(up)) faces.push({ x, y, z, dir: 1 });
        else if (!isSolid(cur) && isSolid(up)) faces.push({ x, y: y + 1, z, dir: -1 });
    }
    return faces;
}

// canonical key so two face lists can be compared regardless of order
export function faceKey(f) { return f.x + "," + f.y + "," + f.z + "," + f.dir; }
