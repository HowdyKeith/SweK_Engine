// voxel/rleRegionVolume.js
//
// ONE TEXTURE SPANNING A WINDOW OF CHUNKS (v3045). The ray-march pass takes a single volume, and a world does
// not fit in one 3D texture -- that is the v2783 blocker this closes. The answer is not one texture per world
// and not one texture per chunk: it is a REGION, an nx by nz window of chunks around the camera, stitched into
// one volume that is still derived, still invalidatable, still verified against the canonical RLE chunks it came
// from. 4x4 chunks of 16x64x16 is 64x64x64 = 256 KB, comfortably inside every maxTextureDimension3D.
//
// THE NEW TRAP, and it is worse than the old one. The volume cache had ONE index order to get right. A region
// has that plus a PLACEMENT: which chunk goes in which slot, and where inside the region each chunk's voxels
// land. Both can be wrong in ways that still produce a plausible-looking landscape:
//
//   * transpose the chunk grid (cx and cz swapped) and you get terrain, in the wrong arrangement, with every
//     chunk boundary mismatched against the world the physics uses.
//   * copy each chunk in as one contiguous block and it is wrong everywhere, because the region's X stride is
//     nx*chunkSize, not chunkSize. A chunk's rows must be interleaved into the region, not memcpy'd.
//
// And as before, a SOLID COUNT survives all of it. Both mistakes move voxels without creating or destroying any.
// So compareRegionToChunks walks every voxel and reports world coordinates AND the chunk that should have
// supplied it. It writes nothing and repairs nothing, same contract as compareVolumeToRLE.
//
// MISSING CHUNKS ARE NOT AIR, EVEN THOUGH THEY READ AS AIR. A window around a camera will routinely include
// chunks that have not streamed in yet. They fill with 0 because a marcher must see something, but the region
// RECORDS them in `missing` -- because "sky" and "not loaded yet" look identical to a renderer and mean opposite
// things to everything else. A caller that draws a region with holes and never knows it is the exact shape of
// bug that gets diagnosed as a terrain generation problem.
//
// Browser-safe: imports only sibling voxel modules.

import { rleDims, buildIndex, getRLEIndexed } from "./voxelRLE.js";
import { volumeIndex, DEFAULT_MAX_DIM } from "./rleVolumeCache.js";

export const chunkKey = (cx, cz) => cx + "," + cz;

export function regionDims(opts) {
    const { chunkSize, chunkHeight, nx, nz } = opts;
    return { dx: nx * chunkSize, dy: chunkHeight, dz: nz * chunkSize };
}

// Where a chunk sits inside the region, in voxels. Deliberately its own named function: this mapping is the
// thing that goes wrong, so it exists once, is exported, and is what the gate sabotages.
export function chunkOrigin(cx, cz, opts) {
    return { ox: (cx - opts.originCx) * opts.chunkSize, oz: (cz - opts.originCz) * opts.chunkSize };
}

export function chunkInRegion(cx, cz, opts) {
    const dcx = cx - opts.originCx, dcz = cz - opts.originCz;
    return dcx >= 0 && dcz >= 0 && dcx < opts.nx && dcz < opts.nz;
}

/**
 * Build the region volume. `chunks` is an iterable of { cx, cz, rle } (or a Map keyed by chunkKey).
 * opts: { originCx, originCz, nx, nz, chunkSize, chunkHeight, maxDim }
 * Returns { data, dx, dy, dz, ...opts, present: [keys], missing: [keys] }.
 */
export function regionVolumeFromChunks(chunks, opts) {
    const { nx, nz, chunkSize, chunkHeight } = opts;
    if (!(nx > 0 && nz > 0 && chunkSize > 0 && chunkHeight > 0)) throw new Error("regionVolumeFromChunks: nx/nz/chunkSize/chunkHeight must all be positive");
    const d = regionDims(opts);
    const maxDim = opts.maxDim || DEFAULT_MAX_DIM;
    if (d.dx > maxDim || d.dy > maxDim || d.dz > maxDim) {
        throw new Error("regionVolumeFromChunks: region " + d.dx + "x" + d.dy + "x" + d.dz + " exceeds maxDim " + maxDim +
            " -- shrink the window (nx/nz), do not grow the texture");
    }

    const list = chunks instanceof Map ? [...chunks.values()] : [...chunks];
    const byKey = new Map();
    for (const c of list) if (chunkInRegion(c.cx, c.cz, opts)) byKey.set(chunkKey(c.cx, c.cz), c);

    const data = new Uint8Array(d.dx * d.dy * d.dz);
    const present = [], missing = [];

    for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
            const cx = opts.originCx + i, cz = opts.originCz + j;
            const key = chunkKey(cx, cz);
            const c = byKey.get(key);
            if (!c) { missing.push(key); continue; }        // stays 0 -- and is RECORDED, see the header
            present.push(key);

            const cd = rleDims(c.rle);
            if (cd.sx !== chunkSize || cd.sy !== chunkHeight || cd.sz !== chunkSize) {
                throw new Error("regionVolumeFromChunks: chunk " + key + " is " + cd.sx + "x" + cd.sy + "x" + cd.sz +
                    ", region expects " + chunkSize + "x" + chunkHeight + "x" + chunkSize);
            }
            const { ox, oz } = chunkOrigin(cx, cz, opts);
            const prefix = buildIndex(c.rle);
            // ROW BY ROW, never a block copy: the region's X stride is nx*chunkSize, so a chunk's rows are not
            // contiguous in the destination even though they are contiguous in the source.
            for (let z = 0; z < chunkSize; z++)
                for (let y = 0; y < chunkHeight; y++)
                    for (let x = 0; x < chunkSize; x++)
                        data[volumeIndex(ox + x, y, oz + z, d)] = getRLEIndexed(c.rle, prefix, x, y, z);
        }

    return { data, ...d, originCx: opts.originCx, originCz: opts.originCz, nx, nz, chunkSize, chunkHeight, present, missing };
}

/**
 * Position-sensitive parity of a region against the chunks it claims to be made of. Read-only; reports the first
 * divergence with region coordinates, the chunk that owns them, and the local coordinates inside that chunk --
 * because "wrong at (37,12,45)" is not actionable until you know which chunk was supposed to supply it.
 * A chunk listed in `missing` is expected to read AIR, and that is checked too: a hole that quietly filled with
 * something is exactly as wrong as a voxel that changed.
 */
export function compareRegionToChunks(vol, chunks, opts = vol) {
    const list = chunks instanceof Map ? [...chunks.values()] : [...chunks];
    const byKey = new Map();
    for (const c of list) byKey.set(chunkKey(c.cx, c.cz), c);
    const d = { dx: vol.dx, dy: vol.dy, dz: vol.dz };

    let checked = 0, nonAir = 0;
    for (let j = 0; j < opts.nz; j++)
        for (let i = 0; i < opts.nx; i++) {
            const cx = opts.originCx + i, cz = opts.originCz + j;
            const key = chunkKey(cx, cz);
            const c = byKey.get(key);
            const { ox, oz } = chunkOrigin(cx, cz, opts);
            const prefix = c ? buildIndex(c.rle) : null;
            for (let z = 0; z < opts.chunkSize; z++)
                for (let y = 0; y < opts.chunkHeight; y++)
                    for (let x = 0; x < opts.chunkSize; x++) {
                        const expected = c ? getRLEIndexed(c.rle, prefix, x, y, z) : 0;
                        const actual = vol.data[volumeIndex(ox + x, y, oz + z, d)];
                        checked++;
                        // v3155 -- COUNTS NON-AIR, AND IS NAMED FOR IT. `solid` claimed a judgement the count
                        // does not make: it coincides with non-air under the default predicate and diverges
                        // under any other. The correctness check below is `expected !== actual` -- EXACT TYPE
                        // EQUALITY, needing no predicate and strictly stronger than one.
                        if (actual !== 0) nonAir++;
                        if (expected !== actual) {
                            return {
                                ok: false, checked, nonAir: -1,
                                first: {
                                    rx: ox + x, ry: y, rz: oz + z, expected, actual,
                                    chunk: key, local: { x, y, z }, loaded: !!c,
                                },
                            };
                        }
                    }
        }
    return { ok: true, checked, nonAir, first: null };
}

export function describeRegion(res) {
    if (res.ok) return "region parity ok: " + res.checked + " voxels agree";
    const f = res.first;
    return "DIVERGED at region (" + f.rx + "," + f.ry + "," + f.rz + ") = chunk " + f.chunk +
        " local (" + f.local.x + "," + f.local.y + "," + f.local.z + ")" +
        (f.loaded ? "" : " [that chunk is NOT LOADED, so it should read air]") +
        ": expected " + f.expected + ", region holds " + f.actual +
        "   [region NOT repaired -- find out why first]";
}

// A region is a window, so it moves. This is the cheap test for "did the window move or the contents change":
// same origin + same present set + same chunk fingerprints means the existing texture is still the right one.
// As always, agreement here is NOT parity -- it only says nothing we track has changed.
export function regionSignature(vol, fingerprints) {
    const parts = [vol.originCx, vol.originCz, vol.nx, vol.nz, vol.chunkSize, vol.chunkHeight];
    for (let j = 0; j < vol.nz; j++)
        for (let i = 0; i < vol.nx; i++) {
            const key = chunkKey(vol.originCx + i, vol.originCz + j);
            parts.push(key + ":" + (fingerprints && fingerprints.get ? (fingerprints.get(key) ?? "-") : "-"));
        }
    return parts.join("|");
}

// Which region window should be centred on a world position. Kept here rather than in the renderer so the page,
// the gate and the live loop cannot each pick a slightly different window.
export function windowFor(worldX, worldZ, opts) {
    const cx = Math.floor(worldX / opts.chunkSize), cz = Math.floor(worldZ / opts.chunkSize);
    return {
        originCx: cx - (opts.nx >> 1), originCz: cz - (opts.nz >> 1),
        nx: opts.nx, nz: opts.nz, chunkSize: opts.chunkSize, chunkHeight: opts.chunkHeight,
    };
}
