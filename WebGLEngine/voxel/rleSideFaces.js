// voxel/rleSideFaces.js
//
// The clean next step (v2770): the +-X and +-Z side faces, straight off the runs. The +-Y faces fell out of a
// single column's run boundaries. A side face needs TWO columns compared -- a solid voxel has a +X face exactly
// where its +X neighbour is air. But we do not compare voxel by voxel: we MERGE the two columns' run lists, the
// way you merge two sorted lists, and wherever one column is solid over a y-span while the other is not, that
// whole span is one face. So an exposed wall a hundred voxels tall is ONE quad, not a hundred -- the run-merge
// hands you greedy meshing on the vertical axis for free. Cost is O(runs of the two columns), not O(256).
//
// columnRunLists materialises each column's runs from the single RLE stream in one pass (splitting any run that
// crosses a column seam). Then adjacent columns are merged: (x,z) vs (x+1,z) for the X faces, (x,z) vs (x,z+1)
// for the Z faces. Internal faces only -- the chunk's outer walls depend on the neighbour chunk, exactly like the
// +-Y top/bottom edges did.

import { RLE_SX, RLE_SY, RLE_SZ, rleIndex, rleDims } from "./voxelRLE.js";

// Per-column run lists: cols[x*SZ+z] = [{type, y0, y1}, ...] covering y in [0, SY). One pass over the RLE stream.
// Dims read off the rle object (stamped by encodeRLE), defaulting to 32x256x32.
export function columnRunLists(rle) {
    const { sx, sy, sz } = rleDims(rle);
    const cols = Array.from({ length: sx * sz }, () => []);
    let off = 0;
    for (let r = 0; r < rle.types.length; r++) {
        const t = rle.types[r];
        let s = off, e = off + rle.counts[r];
        off = e;
        while (s < e) {                                   // split the run across any column seams it crosses
            const col = (s / sy) | 0;
            const segEnd = Math.min(e, (col + 1) * sy);
            cols[col].push({ type: t, y0: s - col * sy, y1: segEnd - col * sy });
            s = segEnd;
        }
    }
    return cols;
}

// Merge two columns over y; call emitA(y0,y1) where A is solid and B is not, emitB(y0,y1) where B is solid and A
// is not. O(runsA + runsB).
function mergeColumns(A, B, isSolid, emitA, emitB) {
    let ia = 0, ib = 0;
    while (ia < A.length && ib < B.length) {
        const ra = A[ia], rb = B[ib];
        const y0 = ra.y0 > rb.y0 ? ra.y0 : rb.y0;
        const y1 = ra.y1 < rb.y1 ? ra.y1 : rb.y1;
        if (y0 < y1) {
            const sA = isSolid(ra.type), sB = isSolid(rb.type);
            if (sA && !sB) emitA(y0, y1);
            else if (sB && !sA) emitB(y0, y1);
        }
        if (ra.y1 <= rb.y1) ia++; else ib++;
    }
}

// All internal +-X and +-Z faces as greedy vertical spans: {x, z, y0, y1, dir} with dir in "+x","-x","+z","-z".
export function sideFacesFromRLE(rle, isSolid) {
    const { sx, sz } = rleDims(rle);
    const cols = columnRunLists(rle);
    const col = (x, z) => cols[x * sz + z];
    const faces = [];
    for (let x = 0; x < sx - 1; x++) for (let z = 0; z < sz; z++) {
        mergeColumns(col(x, z), col(x + 1, z), isSolid,
            (y0, y1) => faces.push({ x, z, y0, y1, dir: "+x" }),
            (y0, y1) => faces.push({ x: x + 1, z, y0, y1, dir: "-x" }));
    }
    for (let x = 0; x < sx; x++) for (let z = 0; z < sz - 1; z++) {
        mergeColumns(col(x, z), col(x, z + 1), isSolid,
            (y0, y1) => faces.push({ x, z, y0, y1, dir: "+z" }),
            (y0, y1) => faces.push({ x, z: z + 1, y0, y1, dir: "-z" }));
    }
    return faces;
}

// Expand greedy spans to one entry per voxel face, for comparison against a voxel scan.
export function expandSpans(spans) {
    const out = [];
    for (const s of spans) for (let y = s.y0; y < s.y1; y++) out.push({ x: s.x, y, z: s.z, dir: s.dir });
    return out;
}

// Reference: internal +-X / +-Z faces found by touching every voxel.
export function sideFacesBrute(flat, isSolid) {
    const faces = [];
    for (let x = 0; x < RLE_SX; x++) for (let z = 0; z < RLE_SZ; z++) for (let y = 0; y < RLE_SY; y++) {
        if (!isSolid(flat[rleIndex(x, y, z)])) continue;
        if (x + 1 < RLE_SX && !isSolid(flat[rleIndex(x + 1, y, z)])) faces.push({ x, y, z, dir: "+x" });
        if (x - 1 >= 0 && !isSolid(flat[rleIndex(x - 1, y, z)])) faces.push({ x, y, z, dir: "-x" });
        if (z + 1 < RLE_SZ && !isSolid(flat[rleIndex(x, y, z + 1)])) faces.push({ x, y, z, dir: "+z" });
        if (z - 1 >= 0 && !isSolid(flat[rleIndex(x, y, z - 1)])) faces.push({ x, y, z, dir: "-z" });
    }
    return faces;
}

export function sideKey(f) { return f.x + "," + f.y + "," + f.z + "," + f.dir; }
