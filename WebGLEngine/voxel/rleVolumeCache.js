// voxel/rleVolumeCache.js
//
// A 3D texture as a DERIVED CACHE of the RLE chunk (v3041). The RLE stays canonical. The volume is a byte
// buffer laid out in the order a 3D texture wants, produced FROM the RLE, thrown away and re-derived whenever
// it is wrong. Nothing reads voxels out of the volume to decide anything about the world; the volume exists so
// the GPU can read voxels without the CPU handing them over one at a time.
//
// THE ONE RULE THIS MODULE ENFORCES: a disagreement between the cache and its source is a FINDING, not a glitch.
// compareVolumeToRLE reports the first divergent (x,y,z) with expected and actual and DOES NOT WRITE ANYTHING.
// It does not re-derive, it does not "resynchronise", it does not repair. Re-deriving on divergence would mean
// the cache could never be observed wrong, which is the definition of a control that cannot fail: you would meet
// the same bug again with less information. Re-derivation is a separate, deliberate call (rleToVolume) that a
// caller makes AFTER it knows why.
//
// TWO READ PATHS, ON PURPOSE. rleToVolume BUILDS the volume via decodeRLE (a linear run walk).
// compareVolumeToRLE VERIFIES it via getRLEIndexed (a binary search over the prefix index). Those are different
// code paths through the same RLE, so the check has power over a bug in either one. Verifying with the same walk
// that built it would be a tautology dressed as a gate.
//
// THE INDEX-ORDER TRAP (the lesson rleWorldBridge-selfcheck was written to bake in). There are now FOUR orders
// in this tree:
//     world/chunk.js  (the real engine world)   idx = x + sx*z + sx*sz*y
//     voxel/voxelworld.js (a demo)              idx = x + y*sx + z*sx*sy
//     the RLE stack                             idx = (x*sz + z)*sy + y      (Y fastest; that IS the compression)
//     a 3D texture                              idx = x + dx*(y + dy*z)      (X fastest; what texelFetch wants)
// Get the transcode wrong and you get a volume that renders plausibly and is wrong everywhere. Worse: a COUNT of
// solid voxels is INVARIANT under an axis permutation, so a count check, a total, a histogram or a surface-area
// check all PASS on axis-swapped data. That is why the parity check below compares the voxel AT (x,y,z) and
// reports coordinates, and why the gate proves a count check would have missed the swap.
//
// Browser-safe: imports only sibling voxel modules, no DOM, no node builtins.

import { decodeRLE, getRLEIndexed, buildIndex, rleDims, rleIndex } from "./voxelRLE.js";

// Hardware ceiling. maxTextureDimension3D is commonly 2048 in WebGPU and MAX_3D_TEXTURE_SIZE is often lower in
// WebGL2. This is a PER-CHUNK or per-region cache, never one texture for a world; the guard exists so that
// mistake fails loudly here instead of silently at upload time. The real engine chunk is 16x64x16 = 16 KB.
export const DEFAULT_MAX_DIM = 2048;

// Texture order: X fastest, then Y, then Z. This is both what texelFetch(tex, ivec3(x,y,z)) indexes and the byte
// order texImage3D(width=dx, height=dy, depth=dz) expects, so one function serves both sides.
export function volumeIndex(x, y, z, dims) {
    return x + dims.dx * (y + dims.dy * z);
}

// Cheap content fingerprint of an RLE (FNV-1a over the run arrays). Its ONLY job is to answer "is this cache
// definitely stale?" -- a mismatch PROVES the source moved. A match proves nothing about parity: two different
// buffers can collide, and the fingerprint says nothing about whether the transcode was correct in the first
// place. That is what compareVolumeToRLE is for. Keeping those two claims apart is the whole point of having
// both; a fingerprint that gets treated as a verification is how a wrong cache gets called verified.
export function rleFingerprint(rle) {
    let h = 0x811c9dc5;
    const mix = (b) => { h ^= b & 0xff; h = Math.imul(h, 0x01000193) >>> 0; };
    const d = rleDims(rle);
    for (const v of [d.sx, d.sy, d.sz, rle.length]) { mix(v); mix(v >>> 8); mix(v >>> 16); mix(v >>> 24); }
    for (let r = 0; r < rle.types.length; r++) {
        mix(rle.types[r]);
        const c = rle.counts[r];
        mix(c); mix(c >>> 8); mix(c >>> 16); mix(c >>> 24);
    }
    return h >>> 0;
}

// Derive the cache. This is the ONLY function that writes a whole volume, and it always reads the RLE to do it.
// opts.maxDim overrides the hardware ceiling guard.
export function rleToVolume(rle, opts = {}) {
    const d = rleDims(rle);
    const dx = d.sx, dy = d.sy, dz = d.sz;
    const maxDim = opts.maxDim || DEFAULT_MAX_DIM;
    if (dx > maxDim || dy > maxDim || dz > maxDim) {
        throw new Error("rleToVolume: " + dx + "x" + dy + "x" + dz + " exceeds maxDim " + maxDim +
            " -- a 3D texture cache is per-chunk or per-region, never one texture per world");
    }
    const flat = decodeRLE(rle);                       // RLE order (Y fastest)
    const data = new Uint8Array(dx * dy * dz);
    const dims = { dx, dy, dz };
    for (let z = 0; z < dz; z++)
        for (let y = 0; y < dy; y++)
            for (let x = 0; x < dx; x++)
                data[volumeIndex(x, y, z, dims)] = flat[rleIndex(x, y, z, d)];
    return { data, dx, dy, dz, srcFingerprint: rleFingerprint(rle), derivedAt: null };
}

// Read the cache the way the shader does, INCLUDING the out-of-bounds behaviour: the fragment shader's inBounds
// guard returns 0 (air) outside the volume, so this does too. A mirror that disagreed with the shader at the
// edges would make every boundary comparison a lie.
export function volumeAt(vol, x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= vol.dx || y >= vol.dy || z >= vol.dz) return 0;
    return vol.data[volumeIndex(x, y, z, vol)];
}

// Is the cache definitely out of date? See rleFingerprint: true is a proof, false is not.
export function isStale(vol, rle) {
    return vol.srcFingerprint !== rleFingerprint(rle);
}

// THE PARITY CHECK. Position-sensitive, coordinate-reporting, read-only.
//
// opts.maxReport (default 1) -- how many divergences to collect before stopping. The default is one because the
// first one is the finding; the rest are usually the same bug repeated and cost a full walk to collect.
// opts.region -- {x0,y0,z0,w,h,d} to check a sub-box only (after a region update, say).
//
// Returns { ok, checked, nonAirVolume, nonAirRLE, mismatches, first }.
//
// v3155 -- THE CORRECTNESS CHECK IS `expected !== actual`: EXACT TYPE EQUALITY, and it takes NO predicate
// because it does not need one. The cache stores raw voxel TYPES, not a solidity decision, so there is no
// "notion of solid" baked into it to disagree with -- and exact equality is STRICTLY STRONGER than any
// predicate comparison would be. *** ADDING AN isSolid PARAMETER HERE WOULD BE A DOWNGRADE DRESSED AS A FIX:
// it would let a caller ask a WEAKER question and get a pass where the types actually differ. *** The counts
// below are reported for the
// express purpose of showing that they can AGREE while ok is false: that is the axis-permutation trap made
// visible rather than argued about.
export function compareVolumeToRLE(vol, rle, opts = {}) {
    const d = rleDims(rle);
    if (vol.dx !== d.sx || vol.dy !== d.sy || vol.dz !== d.sz) {
        return {
            ok: false, checked: 0, nonAirVolume: -1, nonAirRLE: -1, mismatches: [],
            first: null,
            reason: "dimension mismatch: volume " + vol.dx + "x" + vol.dy + "x" + vol.dz +
                    " vs rle " + d.sx + "x" + d.sy + "x" + d.sz,
        };
    }
    const maxReport = opts.maxReport == null ? 1 : opts.maxReport;
    const r = opts.region;
    const x0 = r ? r.x0 : 0, y0 = r ? r.y0 : 0, z0 = r ? r.z0 : 0;
    const x1 = r ? r.x0 + r.w : vol.dx, y1 = r ? r.y0 + r.h : vol.dy, z1 = r ? r.z0 + r.d : vol.dz;

    const prefix = buildIndex(rle);                    // the OTHER read path -- binary search, not the run walk
    const mismatches = [];
    let checked = 0, nonAirVolume = 0, nonAirRLE = 0;

    for (let z = z0; z < z1; z++)
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const expected = getRLEIndexed(rle, prefix, x, y, z);
                const actual = vol.data[volumeIndex(x, y, z, vol)];
                checked++;
                // v3155 -- THESE COUNT NON-AIR, AND THEY ARE NAMED FOR IT. They were solidRLE / solidVolume,
                // which coincides with non-air under the default predicate and diverges under any other: a
                // caller for whom type 5 is air would read a "solid" figure that includes it. The numbers were
                // always correct; the LABEL claimed a judgement the count does not make.
                if (expected !== 0) nonAirRLE++;
                if (actual !== 0) nonAirVolume++;
                if (expected !== actual && mismatches.length < maxReport) {
                    mismatches.push({ x, y, z, expected, actual });
                    if (mismatches.length >= maxReport && !opts.countAll) {
                        return { ok: false, checked, nonAirVolume: -1, nonAirRLE: -1, mismatches, first: mismatches[0] };
                    }
                }
            }
    return {
        ok: mismatches.length === 0, checked, nonAirVolume, nonAirRLE,
        mismatches, first: mismatches[0] || null,
    };
}

// Human-readable finding. Used by the page and the gate so they cannot describe the same divergence differently.
export function describeMismatch(res) {
    if (res.reason) return "REFUSED: " + res.reason;
    if (res.ok) return "parity ok: " + res.checked + " voxels agree";
    const m = res.first;
    return "DIVERGED at (" + m.x + "," + m.y + "," + m.z + "): rle says " + m.expected + ", cache says " + m.actual +
           "  [checked " + res.checked + " so far; cache NOT repaired -- find out why first]";
}

// --- Region updates -------------------------------------------------------------------------------------
// A voxel edit invalidates a box, not the world. This derives just that box FROM THE RLE, in the sub-block byte
// order texSubImage3D wants (x fastest within the box, then y, then z). Upload bandwidth stays proportional to
// what actually changed. Direction is one-way, always: RLE -> region -> texture. There is no path back.

export function regionFromRLE(rle, region) {
    const d = rleDims(rle);
    const { x0, y0, z0, w, h, d: dd } = region;
    if (x0 < 0 || y0 < 0 || z0 < 0 || w <= 0 || h <= 0 || dd <= 0 ||
        x0 + w > d.sx || y0 + h > d.sy || z0 + dd > d.sz) {
        throw new Error("regionFromRLE: region (" + x0 + "," + y0 + "," + z0 + ") " + w + "x" + h + "x" + dd +
                        " is not inside " + d.sx + "x" + d.sy + "x" + d.sz);
    }
    const prefix = buildIndex(rle);
    const data = new Uint8Array(w * h * dd);
    for (let z = 0; z < dd; z++)
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++)
                data[x + w * (y + h * z)] = getRLEIndexed(rle, prefix, x0 + x, y0 + y, z0 + z);
    return { x0, y0, z0, w, h, d: dd, data };
}

// Write a derived region into the CPU mirror of the cache. The GPU side does the same write with texSubImage3D;
// keeping both in one place is what lets the parity check speak for both.
export function applyRegion(vol, patch) {
    const { x0, y0, z0, w, h, d, data } = patch;
    if (x0 < 0 || y0 < 0 || z0 < 0 || x0 + w > vol.dx || y0 + h > vol.dy || z0 + d > vol.dz) {
        throw new Error("applyRegion: patch does not fit the volume");
    }
    for (let z = 0; z < d; z++)
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++)
                vol.data[volumeIndex(x0 + x, y0 + y, z0 + z, vol)] = data[x + w * (y + h * z)];
    return vol;
}

// After a region update the cache's source has moved on, so re-stamp the fingerprint. Deliberately SEPARATE from
// applyRegion: stamping is a claim that this volume now corresponds to that rle, and a caller that patched the
// wrong box should not have that claim made on its behalf. Parity is still the only thing that proves it.
export function restamp(vol, rle) {
    vol.srcFingerprint = rleFingerprint(rle);
    return vol;
}

export function solidCount(vol) {
    let n = 0;
    for (let i = 0; i < vol.data.length; i++) if (vol.data[i] !== 0) n++;
    return n;
}
