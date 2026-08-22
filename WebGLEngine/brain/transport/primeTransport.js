// prime-transport-deterministic/primeTransport.js
//
// The CPU reference twin of the Prime Transport compaction step -- and the Node / WebGL2 fallback path.
//
// Prime Transport is a constrained beam-search layer for a GPU "brain": at each thinking step a set of prime
// candidates (next states) is filtered by a wheel (a routing-constraint matrix) against the surviving tuplets
// (validated history), and the survivors become the candidates for the next step. The hard part is compaction --
// turning the sparse "which candidates survived" into a dense list -- WITHOUT using atomics.
//
// WHY NOT atomics. The obvious GPU compaction is `slot = atomicAdd(&count, 1)` per survivor. It is thread-safe, but
// the slot a survivor lands in depends on WHICH THREAD'S ADD FIRED FIRST, and GPU warp scheduling is not
// deterministic -- it varies run-to-run and card-to-card. Same input, same survivors, DIFFERENT ORDER. For an
// engine whose whole premise is bit-identical output on every machine, that is poison.
//
// THE FIX: three-pass stream compaction (flag -> exclusive prefix sum -> scatter). Each candidate index i writes a
// 0/1 survival flag at its OWN fixed position; an exclusive prefix sum turns those flags into offsets, where
// offsets[i] is the count of survivors strictly before i; then each survivor scatters to surviving[offsets[i]].
// Because offsets[i] is fully determined by the flags -- not by processing order -- survivor k lands in the SAME
// slot no matter what order the passes visit indices in. That is the determinism the atomic version cannot give.
//
// This file is the CPU twin: the same three passes in plain integer arithmetic. It is the reference the WGSL port
// (shaders/*.wgsl) must match, it is the fallback the Node and WebGL2 runtimes use directly, and it is the thing
// the gate can actually run to prove the property. Every operation is integer add/compare -- no float, no atomics,
// no order dependence.

// candidates: array of { stateId:u32, parentTupleIndex:u32, score:f32 }
// tuplets:    array of { steps: [u32,u32,u32,u32] }   (the surviving history; steps[3] is the most recent state)
// wheelMatrix: Uint32Array, flattened numStates x numStates routing constraints (1 = route allowed)
// Returns Uint32Array of 0/1, one per candidate, at the candidate's own index (stable).
export function filterFlag(candidates, wheelMatrix, tuplets, numStates, threshold) {
    const n = candidates.length;
    const flags = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        const c = candidates[i];
        const p = c.parentTupleIndex >>> 0;
        if (p >= tuplets.length) { flags[i] = 0; continue; }              // BUG-1 FIX: guard against active_tuplets length, not candidate length
        const lastValid = tuplets[p].steps[3] >>> 0;
        const fi = lastValid * numStates + (c.stateId >>> 0);
        if (fi >= wheelMatrix.length) { flags[i] = 0; continue; }         // guard the wheel index too (num_states from a real value, no sqrt)
        const allowed = wheelMatrix[fi] === 1;
        flags[i] = (allowed && c.score > threshold) ? 1 : 0;
    }
    return flags;
}

// ---- OPTIMIZATION: bit-packed wheel matrix ------------------------------------------------------------------------
// A boolean routing matrix wastes 31 of every 32 bits as a u32 array. Packing it to one bit per route cuts its VRAM
// footprint by ~96.9%, so a much larger state space fits in cache. This is determinism-safe: bitwise shift/mask are
// exact integer ops, so the packed path produces byte-identical flags to the unpacked one -- which the gate proves.
export function packWheel(matrix) {
    const words = new Uint32Array((matrix.length + 31) >>> 5);
    for (let i = 0; i < matrix.length; i++) if (matrix[i] === 1) words[i >>> 5] |= (1 << (i & 31));
    return words;
}

// Same as filterFlag, but reads the wheel from a bit-packed array. wheelLen is the LOGICAL length (numStates^2).
export function filterFlagPacked(candidates, packedWheel, wheelLen, tuplets, numStates, threshold) {
    const n = candidates.length, flags = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        const c = candidates[i], p = c.parentTupleIndex >>> 0;
        if (p >= tuplets.length) { flags[i] = 0; continue; }
        const lastValid = tuplets[p].steps[3] >>> 0;
        const fi = lastValid * numStates + (c.stateId >>> 0);
        if (fi >= wheelLen) { flags[i] = 0; continue; }
        const allowed = ((packedWheel[fi >>> 5] >>> (fi & 31)) & 1) === 1;
        flags[i] = (allowed && c.score > threshold) ? 1 : 0;
    }
    return flags;
}

// Exclusive prefix sum. offsets[i] = number of survivors strictly before i. total = number of survivors.
// This is a serial scan on the CPU (the WGSL uses a Blelloch work-efficient scan); both yield the identical result
// because an exclusive prefix sum is a pure function of the flag array, independent of evaluation order.
export function exclusiveScan(flags) {
    const n = flags.length, offsets = new Uint32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) { offsets[i] = sum; sum += flags[i]; }
    return { offsets, total: sum };
}

// Scatter each survivor to its predetermined slot. `visitOrder` lets the gate PROVE order-independence: whatever
// order we visit indices in, a survivor at i always lands at offsets[i], so the output is byte-identical.
export function scatter(candidates, flags, offsets, maxSurvivors, visitOrder) {
    const out = new Uint32Array(maxSurvivors);
    const order = visitOrder || defaultOrder(flags.length);
    for (const i of order) {
        if (flags[i] === 1) {
            const slot = offsets[i];
            if (slot < maxSurvivors) out[slot] = candidates[i].stateId >>> 0;   // BUG-2b FIX: guard the output write against the buffer size
        }
    }
    return out;
}

function defaultOrder(n) { const o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = i; return o; }

// The full deterministic compaction. Returns the dense survivor list and its length.
export function compact(candidates, wheelMatrix, tuplets, numStates, threshold, maxSurvivors, visitOrder) {
    const flags = filterFlag(candidates, wheelMatrix, tuplets, numStates, threshold);
    const { offsets, total } = exclusiveScan(flags);
    const survivors = scatter(candidates, flags, offsets, maxSurvivors, visitOrder);
    return { survivors, count: Math.min(total, maxSurvivors), flags, offsets };
}

// ---- MULTI-WORKGROUP compaction: the fused shader scaled past one workgroup ---------------------------------------
// When N > 1024 the fused shader runs multiple workgroups, and how each workgroup's block of survivors is placed in
// the GLOBAL output decides determinism. Two ways to assign each block its base offset:
//   mode "atomic": each block claims its chunk with an atomicAdd, i.e. in whatever order the blocks are SCHEDULED.
//                  -> base depends on scheduling -> global order is NON-deterministic. (The "deterministic!" claim.)
//   mode "scan":   an exclusive scan over the per-block counts, in FIXED block-index order.
//                  -> base is a pure function of the counts -> global order is deterministic at any scale.
// `blockOrder` stands in for workgroup scheduling; the gate permutes it to expose the difference.
export function compactBlocked(candidates, wheelMatrix, tuplets, numStates, threshold, maxSurvivors, blockSize, mode, blockOrder) {
    const n = candidates.length;
    const flags = filterFlag(candidates, wheelMatrix, tuplets, numStates, threshold);
    const nBlocks = Math.ceil(n / blockSize);
    const localOffset = new Uint32Array(n), blockCount = new Uint32Array(nBlocks);
    for (let b = 0; b < nBlocks; b++) {
        let sum = 0;
        for (let i = b * blockSize; i < Math.min(n, (b + 1) * blockSize); i++) { localOffset[i] = sum; sum += flags[i]; }
        blockCount[b] = sum;
    }
    const base = new Uint32Array(nBlocks);
    if (mode === "scan") { let s = 0; for (let b = 0; b < nBlocks; b++) { base[b] = s; s += blockCount[b]; } }
    else { let s = 0; for (const b of (blockOrder || defaultOrder(nBlocks))) { base[b] = s; s += blockCount[b]; } }  // "atomic"
    const out = new Uint32Array(maxSurvivors);
    for (let i = 0; i < n; i++) if (flags[i] === 1) {
        const slot = base[(i / blockSize) | 0] + localOffset[i];
        if (slot < maxSurvivors) out[slot] = candidates[i].stateId >>> 0;
    }
    return out;
}
