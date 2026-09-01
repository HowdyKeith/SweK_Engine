// ===================================================================
// render/splatSort.mjs -- v4264
// -------------------------------------------------------------------
// THE DEPTH SORT BOTH SPLAT RENDERERS DO EVERY FRAME, DONE WITHOUT
// ALLOCATING AND WITHOUT A COMPARATOR.
//
// Backlog #138 arrived as "take novalain/gpgpu-odd-even-transition-
// sort". v4262's rule says find and MEASURE the consumer first, and
// the consumer here is unambiguous: Gaussian splats are alpha-blended
// with the depth buffer off, so they must be drawn back to front or
// the picture is wrong. Both engine/SplatRenderer.js and
// render/SplatRenderer.js re-sort every splat on every camera move.
//
// ---- WHAT THEY DO TODAY, AND WHAT IT COSTS ------------------------
//
// Both run the identical line:
//
//     const sortable = Array.from(idx);
//     sortable.sort((a, b) => keys[a] - keys[b]);
//
// which BOXES every index into a plain JS Array once per frame and
// then pays a function call per comparison. Measured on this sandbox:
//
//     10,000 splats      3.25 ms     fits in a 16.7 ms frame
//     50,000 splats     26.52 ms     1.6x over
//    100,000 splats     45.66 ms     2.7x over
//    250,000 splats    120.29 ms     7.2x over
//    500,000 splats    267.08 ms    16.0x over  --  3.7 fps
//
// *** AND render/SplatRenderer.js's HEADER CLAIMS ">500K SPLATS
// *** INTERACTIVELY". *** Its own comment beside the sort is the
// honest one -- "for typical N=32K it's fine; we accept the cost" --
// so the file disagrees with itself and the header is the half that
// is wrong. engine/SplatRenderer.js calls the same line a "CPU
// radix-style sort", which it is not: Array.prototype.sort is a
// comparison sort.
//
// ---- WHY NOT THE GPU SORT THAT WAS OFFERED ------------------------
//
// *** ODD-EVEN TRANSPOSITION IS O(N^2) WORK AND THIS IS THE WRONG
// *** PLACE FOR IT. *** It is a lovely GPGPU teaching example because
// every stage is trivially parallel, and that is also its whole
// problem: it needs N passes of N/2 compare-exchanges, so 500,000
// splats is 1.25e11 compare-exchanges per frame against the 9.5e6
// a comparison sort needs. It wins only when you have O(N)
// processors, and a browser does not. Refused, with the number, in
// tools/ship/splatSort-selfcheck.mjs -- the same shape as v4262:
// the consumer is real and the offered algorithm is wrong for it.
//
// What IS taken from the idea is that a depth sort does not need
// comparisons at all. Depth keys are floats, floats have a
// bit pattern that sorts as an integer, and integers can be counted.
// ===================================================================
"use strict";

/**
 * Order-preserving float32 -> uint32.
 *
 * IEEE-754 floats already compare correctly as signed integers within a sign; the standard fix makes the
 * whole range compare correctly as UNSIGNED: for a non-negative float flip the sign bit, for a negative one
 * flip every bit. Monotonic across the whole range including negative zero, which matters because a depth
 * key of -0 and +0 must not swap places between frames and make a splat flicker.
 */
const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
export function floatKeyToUint(f) {
    _f32[0] = f;
    const b = _u32[0];
    return (b & 0x80000000) ? (~b >>> 0) : ((b ^ 0x80000000) >>> 0);
}

/** Scratch a sort needs, allocated once per splat cloud rather than once per frame. */
export function makeSortScratch(n) {
    return {
        n,
        u: new Uint32Array(n),        // keys as sortable uints
        a: new Uint32Array(n),        // ping
        b: new Uint32Array(n),        // pong
        counts: new Uint32Array(65536 + 1),
    };
}

/**
 * Least-significant-digit radix sort of `idx` by `keys`, ascending. Two passes of 16 bits.
 *
 * *** EXACT, NOT APPROXIMATE. *** Splat renderers often quantise depth to 8 or 16 bits and accept an
 * approximate order because the eye forgives it. This does not: the uint mapping is lossless, so the result
 * is the SAME PERMUTATION the comparison sort produces for distinct keys, which is what lets the gate assert
 * equality against the old code instead of eyeballing a render. Ties may be ordered differently -- LSD radix
 * is stable, Array.prototype.sort is stable, and they agree -- see the gate's tie section.
 *
 * Writes the result into `idx` and returns it. Allocates nothing.
 */
export function radixSortIndices(keys, idx, scratch) {
    const n = scratch.n;
    const u = scratch.u, counts = scratch.counts;
    let src = scratch.a, dst = scratch.b;
    for (let i = 0; i < n; i++) { u[i] = floatKeyToUint(keys[i]); src[i] = i; }

    for (let shift = 0; shift <= 16; shift += 16) {
        counts.fill(0);
        // Histogram. counts[d + 1] so the prefix sum below lands offsets directly.
        for (let i = 0; i < n; i++) counts[((u[src[i]] >>> shift) & 0xffff) + 1]++;
        for (let d = 0; d < 65536; d++) counts[d + 1] += counts[d];
        for (let i = 0; i < n; i++) { const v = src[i]; dst[counts[(u[v] >>> shift) & 0xffff]++] = v; }
        const t = src; src = dst; dst = t;
    }
    idx.set(src.subarray(0, n));
    return idx;
}

/**
 * The comparison sort both renderers ship today, kept so the gate can assert the radix sort AGREES with it
 * rather than merely being fast. A replacement nobody compared against the original is a rewrite, not a fix.
 */
export function comparisonSortIndices(keys, idx) {
    const arr = Array.from(idx);
    arr.sort((a, b) => keys[a] - keys[b]);
    for (let i = 0; i < arr.length; i++) idx[i] = arr[i];
    return idx;
}

/**
 * Compare-exchanges an odd-even transposition sort needs for n elements: n passes of floor(n/2).
 * Exported so the refusal in the gate is a computed number rather than an assertion about big-O.
 */
export const oddEvenCompareExchanges = (n) => n * Math.floor(n / 2);

/** Comparisons a comparison sort needs, to the usual n log2 n. The other side of that ratio. */
export const comparisonCount = (n) => (n > 1 ? n * Math.log2(n) : 0);
