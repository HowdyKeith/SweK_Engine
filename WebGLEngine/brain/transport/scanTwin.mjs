// FILE: brain/transport/scanTwin.mjs -- v4208
//
// THE WGSL SCANS, SIMULATED IN JS AT AN ARBITRARY WORKGROUP SIZE, SO A SHADER CAN BE FIXED ON A BOX WITH NO
// GPU.
//
// *** v4207's VALIDATOR FOUND THREE SHIPPED SHADERS THAT CANNOT RUN, AND THIS IS HOW THEY GET FIXED
// HONESTLY. *** scan.wgsl, mb-scan-blocks.wgsl and fused-single-workgroup.wgsl each declared
// @compute @workgroup_size(1024): four times WebGPU's default maxComputeInvocationsPerWorkgroup of 256, on
// a tree whose 27 requestDevice() calls never pass requiredLimits. The pipelines are rejected at
// createComputePipeline -- so the shader "compiles" and the failure surfaces elsewhere.
//
// The fix is not "write 256 and hope". Each shader assumed ONE ELEMENT PER THREAD, so shrinking the
// workgroup shrinks what it scans. MEASURED: the original Blelloch body run with 256 invocations instead of
// 1024 gets 507 of 1024 offsets WRONG, the first at index 512 -- exactly where a tree level needing 512
// threads runs out of them. A pipeline that will not build is visible; a scan that quietly returns wrong
// offsets is not, so the naive fix would have been worse than the bug it replaced. Every stage needs a
// strided loop, `for (i = thid; i < d; i += WG)`.
//
// *** SO THE ALGORITHM IS SIMULATED HERE FIRST, WITH BARRIERS AS PHASE BOUNDARIES, AND GRADED AGAINST
// primeTransport.js's exclusiveScan(). *** A workgroup barrier means every invocation finishes the phase
// before any begins the next, which in JS is exactly "loop over all threads, then move on". That makes the
// simulation faithful in the way that matters: it reproduces the read-write hazards a barrier exists to
// prevent, so a missing barrier shows up as a wrong answer here rather than as a vendor-specific glitch
// later.
//
// The WGSL and these functions must stay the same algorithm. tools/ship/scanLimits-selfcheck.mjs checks the
// shipped .wgsl text against them.
"use strict";

/**
 * Blelloch work-efficient exclusive scan over `n` elements using `wg` invocations.
 *
 * *** THE STRIDED LOOP IS THE WHOLE FIX. *** The original wrote `if (thid < d)`, which silently requires as
 * many threads as the widest level of the tree -- 512 of them for a 1024-element scan, and the shader asked
 * for 1024. `for (var i = thid; i < d; i += wg)` gives every thread its share of that level whatever wg is,
 * and reduces to the original when wg >= d.
 *
 * @param data Uint32Array of length n (a power of two), mutated in place
 * @param trace optional array collecting phase names, so a test can prove the barriers are where they claim
 */
export function blellochScan(data, wg, trace = null) {
    const n = data.length;
    if ((n & (n - 1)) !== 0) throw new RangeError(`blellochScan: n must be a power of two, got ${n}`);
    if (!(wg > 0)) throw new RangeError(`blellochScan: workgroup size must be positive, got ${wg}`);
    let offset = 1;
    // up-sweep (reduce)
    for (let d = n >> 1; d > 0; d >>= 1) {
        if (trace) trace.push(`barrier:up:${d}`);
        for (let thid = 0; thid < wg; thid++) {
            for (let i = thid; i < d; i += wg) {
                const ai = offset * (2 * i + 1) - 1, bi = offset * (2 * i + 2) - 1;
                data[bi] += data[ai];
            }
        }
        offset *= 2;
    }
    if (trace) trace.push("barrier:clear");
    data[n - 1] = 0;                                  // clear the root: this is what makes it EXCLUSIVE
    // down-sweep
    for (let d = 1; d < n; d *= 2) {
        offset >>= 1;
        if (trace) trace.push(`barrier:down:${d}`);
        for (let thid = 0; thid < wg; thid++) {
            for (let i = thid; i < d; i += wg) {
                const ai = offset * (2 * i + 1) - 1, bi = offset * (2 * i + 2) - 1;
                const t = data[ai];
                data[ai] = data[bi];
                data[bi] += t;
            }
        }
    }
    if (trace) trace.push("barrier:store");
    return data;
}

/**
 * Hillis-Steele INCLUSIVE scan over `n` elements using `wg` invocations, as mb-scan-blocks.wgsl does it.
 *
 * *** THE READ AND THE WRITE ARE SEPARATE PHASES AND THAT IS NOT OPTIONAL. *** Every element reads
 * s[i - off] and then writes s[i]; without a barrier between, a thread can read a slot another thread has
 * already advanced, and the scan comes out too large in a pattern that depends on scheduling. The original
 * had that right at one element per thread; the strided version must hold each thread's reads in a private
 * array across the barrier, which is what `t` is.
 */
export function hillisSteeleInclusive(data, wg, trace = null) {
    const n = data.length;
    if (!(wg > 0)) throw new RangeError(`hillisSteeleInclusive: workgroup size must be positive, got ${wg}`);
    const perThread = Math.ceil(n / wg);
    const t = new Uint32Array(wg * perThread);
    for (let off = 1; off < n; off <<= 1) {
        if (trace) trace.push(`barrier:read:${off}`);
        for (let thid = 0; thid < wg; thid++) {
            let k = 0;
            for (let i = thid; i < n; i += wg, k++) t[thid * perThread + k] = i >= off ? data[i - off] : 0;
        }
        if (trace) trace.push(`barrier:write:${off}`);
        for (let thid = 0; thid < wg; thid++) {
            let k = 0;
            for (let i = thid; i < n; i += wg, k++) data[i] += t[thid * perThread + k];
        }
    }
    return data;
}

/** The exclusive scan mb-scan-blocks produces: inclusive minus the element's own value. */
export function blockBases(counts, wg) {
    const n = counts.length;
    const s = Uint32Array.from(counts);
    hillisSteeleInclusive(s, wg);
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = s[i] - counts[i];
    return out;
}

/** Pad a flag array up to the next power of two with zeros, which is what the shared array holds. */
export function padToPow2(flags) {
    let n = 1;
    while (n < flags.length) n *= 2;
    const out = new Uint32Array(Math.max(n, 1));
    out.set(flags);
    return out;
}

/** How many invocations a scan of `n` elements needs, given a device's per-workgroup limit. */
export function workgroupSizeFor(n, limit = 256) {
    return Math.min(limit, Math.max(1, n));
}

/**
 * The FUSED shader's algorithm: filter into shared memory, inclusive scan, scatter -- all strided.
 *
 * *** THE FILTER VERDICT IS CARRIED PER ELEMENT, NOT RECOMPUTED AT THE SCATTER. *** With one element per
 * thread a single `passed` scalar survived from filter to scatter. With four, four verdicts must cross two
 * scan barriers, which is what `passed` and `myState` are for in the WGSL. Recomputing the predicate at the
 * scatter instead would make the write depend on a SECOND evaluation rather than on the one the scan
 * counted, and any disagreement puts a survivor in a slot nothing reserved.
 *
 * @param flags   Uint32Array of filter verdicts, one per candidate (what the WGSL computes inline)
 * @param states  Uint32Array of state ids, parallel to flags
 */
export function fusedCompact(flags, states, wg, maxSurvivors) {
    const n = flags.length;
    let N = 1;
    while (N < n) N *= 2;
    const perThread = Math.ceil(N / wg);
    const shared = new Uint32Array(N);
    const passed = new Uint32Array(wg * perThread);
    const myState = new Uint32Array(wg * perThread);
    // filter phase
    for (let thid = 0; thid < wg; thid++) {
        let k = 0;
        for (let i = thid; i < N; i += wg, k++) {
            const p = i < n ? flags[i] : 0;
            passed[thid * perThread + k] = p;
            myState[thid * perThread + k] = i < n ? states[i] : 0;
            shared[i] = p;
        }
    }
    hillisSteeleInclusive(shared, wg);
    // scatter phase
    const out = new Uint32Array(maxSurvivors);
    for (let thid = 0; thid < wg; thid++) {
        let k = 0;
        for (let i = thid; i < N; i += wg, k++) {
            if (passed[thid * perThread + k] === 1) {
                const slot = shared[i] - 1;
                if (slot < maxSurvivors) out[slot] = myState[thid * perThread + k];
            }
        }
    }
    return out;
}
