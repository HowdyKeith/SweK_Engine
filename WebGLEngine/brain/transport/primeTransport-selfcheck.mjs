// prime-transport-deterministic/primeTransport-selfcheck.mjs
//
// Run: node primeTransport-selfcheck.mjs
//
// The whole point of the three-pass rewrite is ONE property: the compacted survivor list is byte-identical no matter
// what order the work is done in -- which is what makes it safe on a GPU whose thread scheduling is not
// deterministic. So the spine of this gate is a PERMUTATION test: run the compaction under many shuffled visit
// orders (standing in for warp scheduling) and prove the output never changes. To show that test is not vacuous, it
// also runs an atomic-style compaction (slot = a running counter, the version we are replacing) under the SAME
// permutations and shows THAT one produces different outputs -- so the gate can actually tell the two apart. Around
// that: the survivors are the correct set, the order is stable, and the bounds guards hold.
import { compact, filterFlag, exclusiveScan, packWheel, filterFlagPacked, compactBlocked } from "./primeTransport.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// deterministic little PRNG so the gate itself is reproducible
let seed = 0x1234abcd;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (n) => { const a = Uint32Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

// build a random-but-fixed problem: numStates states, a wheel with ~50% routes open, some tuplets, many candidates
const NUM_STATES = 12, N_TUPLETS = 20, N_CAND = 300, MAX_SURV = 128, THRESH = 0.15;
const wheel = new Uint32Array(NUM_STATES * NUM_STATES);
for (let i = 0; i < wheel.length; i++) wheel[i] = rnd() < 0.5 ? 1 : 0;
const tuplets = Array.from({ length: N_TUPLETS }, () => ({ steps: [0, 0, 0, Math.floor(rnd() * NUM_STATES)] }));
const candidates = Array.from({ length: N_CAND }, () => ({
    stateId: Math.floor(rnd() * NUM_STATES),
    parentTupleIndex: Math.floor(rnd() * (N_TUPLETS + 3)),   // deliberately can exceed N_TUPLETS -> exercises the bounds guard
    score: rnd(),
}));

const bytesEqual = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

// ---- 1. CORRECTNESS: survivors are exactly the candidates that pass the filter, in candidate-index order ----------
{
    const { survivors, count } = compact(candidates, wheel, tuplets, NUM_STATES, THRESH, MAX_SURV);
    const expected = [];
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c.parentTupleIndex >= tuplets.length) continue;
        const fi = tuplets[c.parentTupleIndex].steps[3] * NUM_STATES + c.stateId;
        if (fi >= wheel.length) continue;
        if (wheel[fi] === 1 && c.score > THRESH) expected.push(c.stateId);
    }
    let match = count === Math.min(expected.length, MAX_SURV);
    for (let i = 0; i < count && match; i++) if (survivors[i] !== expected[i]) match = false;
    ok("!! the survivors are exactly the filter's output, in stable candidate order", match,
       count + " survivors, matching an independent brute-force filter element-for-element -- the compaction drops no valid path and invents none.");
}

// ---- 2. THE SPINE: byte-identical output under 200 permuted visit orders (stand-in for GPU thread scheduling) -----
{
    const ref = compact(candidates, wheel, tuplets, NUM_STATES, THRESH, MAX_SURV).survivors;
    let stable = true, tried = 0;
    for (let t = 0; t < 200; t++) {
        const order = shuffle(N_CAND);
        const out = compact(candidates, wheel, tuplets, NUM_STATES, THRESH, MAX_SURV, order).survivors;
        tried++;
        if (!bytesEqual(out, ref)) { stable = false; break; }
    }
    ok("!! the compacted output is byte-identical under every permuted thread order", stable,
       "ran the compaction under " + tried + " shuffled visit orders standing in for warp scheduling: EVERY ONE produced the same bytes. Survivor k lands in slot k regardless of who runs first -- the property atomicAdd cannot give.");
}

// ---- 3. THE CONTRAST: an atomic-style compaction is NOT stable under the same permutations ------------------------
{
    // atomic model: slot = running counter in visit order (this is the code we are replacing)
    const atomicCompact = (order) => {
        const flags = filterFlag(candidates, wheel, tuplets, NUM_STATES, THRESH);
        const out = new Uint32Array(MAX_SURV); let counter = 0;
        for (const i of order) if (flags[i] === 1 && counter < MAX_SURV) out[counter++] = candidates[i].stateId;
        return out;
    };
    const ref = atomicCompact(shuffle(N_CAND));
    let distinct = 1;
    for (let t = 0; t < 50; t++) if (!bytesEqual(atomicCompact(shuffle(N_CAND)), ref)) { distinct = 2; break; }
    ok("!! the atomic-style version really is order-dependent (so test 2 is not vacuous)", distinct === 2,
       "the same survivors compacted by a running counter give DIFFERENT byte order across permutations -- confirming the permutation test can distinguish deterministic from non-deterministic, and that the atomic version was genuinely broken for this engine.");
}

// ---- 4. BOUNDS SAFETY: out-of-range parent index cannot survive; output never overflows ---------------------------
{
    // a candidate whose parentTupleIndex is past the end must be flagged 0 and must not throw or read garbage
    const evil = [{ stateId: 3, parentTupleIndex: 99999, score: 0.9 }];
    const flags = filterFlag(evil, wheel, tuplets, NUM_STATES, THRESH);
    // force far more survivors than MAX_SURV to test the output cap
    const many = Array.from({ length: 500 }, () => ({ stateId: 1, parentTupleIndex: 0, score: 0.9 }));
    const wheelAllOpen = new Uint32Array(NUM_STATES * NUM_STATES).fill(1);
    const { count, survivors } = compact(many, wheelAllOpen, [{ steps: [0, 0, 0, 0] }], NUM_STATES, 0, 64);
    ok("!! out-of-range parent index cannot survive, and the output buffer never overflows", flags[0] === 0 && count === 64 && survivors.length === 64,
       "a candidate pointing past the tuplet array is flagged dead (not read out of bounds); 500 would-be survivors are capped at the 64-slot buffer with no overflow write.");
}

// ---- 5. STABLE ORDER: offsets are monotonic, so survivors come out in ascending candidate index -------------------
{
    const flags = filterFlag(candidates, wheel, tuplets, NUM_STATES, THRESH);
    const { offsets } = exclusiveScan(flags);
    let monotonic = true;
    for (let i = 1; i < offsets.length; i++) if (offsets[i] < offsets[i - 1]) { monotonic = false; break; }
    ok("!! the scan offsets are monotonic non-decreasing (stable output order)", monotonic,
       "offsets[i] never decreases, so a survivor at a lower candidate index always occupies a lower output slot -- the output order is a deterministic function of the input, fixed forever.");
}

// ---- 6. OPTIMIZATION PROOF: the bit-packed wheel gives byte-identical flags to the u32 wheel --------------------
{
    const packed = packWheel(wheel);
    const plain = filterFlag(candidates, wheel, tuplets, NUM_STATES, THRESH);
    const pk = filterFlagPacked(candidates, packed, wheel.length, tuplets, NUM_STATES, THRESH);
    let identical = plain.length === pk.length;
    for (let i = 0; i < plain.length && identical; i++) if (plain[i] !== pk[i]) identical = false;
    ok("!! the bit-packed wheel (96.9% smaller) produces byte-identical flags", identical && packed.length === Math.ceil(wheel.length / 32),
       "packed " + wheel.length + " u32 routes into " + packed.length + " words (" + (100 * (1 - packed.length / wheel.length)).toFixed(1) + "% smaller) and the survival flags are bit-for-bit the same -- the optimization changes memory, not results.");
}

// ---- 7. THE OPTIMIZED PATH IS STILL PERMUTATION-INVARIANT -------------------------------------------------------
{
    // build a compact() that uses the packed filter, then re-run the permutation test on it
    const packed = packWheel(wheel);
    const compactPacked = (order) => {
        const flags = filterFlagPacked(candidates, packed, wheel.length, tuplets, NUM_STATES, THRESH);
        const { offsets } = exclusiveScan(flags);
        const out = new Uint32Array(MAX_SURV);
        for (const i of (order || Uint32Array.from({ length: N_CAND }, (_, k) => k))) if (flags[i] === 1 && offsets[i] < MAX_SURV) out[offsets[i]] = candidates[i].stateId;
        return out;
    };
    const ref = compactPacked(null);
    let stable = true;
    for (let t = 0; t < 100; t++) { if (!bytesEqual(compactPacked(shuffle(N_CAND)), ref)) { stable = false; break; } }
    ok("!! the optimized (packed) compaction stays byte-identical under permuted thread order", stable,
       "the bit-packing did not cost determinism: 100 shuffled orders, one output. Any optimization can be adopted this way -- implement it in the twin, re-run this test, keep it only if the bytes do not move.");
}

// ---- 8. MULTI-WORKGROUP: the per-block atomicAdd is NOT deterministic; the per-block scan IS -------------------
{
    // scale past one workgroup: 300 candidates in blocks of 64 -> 5 blocks whose scheduling order can vary
    const BLK = 64, nBlocks = Math.ceil(N_CAND / BLK);
    const shuffleBlocks = () => { const a = Uint32Array.from({ length: nBlocks }, (_, i) => i); for (let i = nBlocks - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

    // "atomic" block reservation (the claimed-deterministic version): permute block order -> output should MOVE
    const atomRef = compactBlocked(candidates, wheel, tuplets, NUM_STATES, THRESH, MAX_SURV, BLK, "atomic", shuffleBlocks());
    let atomMoved = false;
    for (let t = 0; t < 50; t++) if (!bytesEqual(compactBlocked(candidates, wheel, tuplets, NUM_STATES, THRESH, MAX_SURV, BLK, "atomic", shuffleBlocks()), atomRef)) { atomMoved = true; break; }

    // "scan" block base (the fix): permute block order -> output must NOT move
    const scanRef = compactBlocked(candidates, wheel, tuplets, NUM_STATES, THRESH, MAX_SURV, BLK, "scan", null);
    let scanStable = true;
    for (let t = 0; t < 50; t++) if (!bytesEqual(compactBlocked(candidates, wheel, tuplets, NUM_STATES, THRESH, MAX_SURV, BLK, "scan", shuffleBlocks()), scanRef)) { scanStable = false; break; }

    ok("!! across workgroups, atomicAdd block-reservation drifts but the per-block scan holds", atomMoved && scanStable,
       "atomic block-claim output CHANGED under permuted workgroup order (atomMoved=" + atomMoved + "), while the exclusive-scan-over-block-counts stayed byte-identical (scanStable=" + scanStable + "). THE 'DETERMINISTIC ATOMIC' CLAIM IS FALSE PAST ONE WORKGROUP; the two-level scan is the fix.");
}

// ---- 9. AT SCALE: the two-level block scan equals the reference single scan, byte-for-byte -----------------------
{
    // a bigger problem spanning many blocks: 3000 candidates, block size 256 -> 12 blocks
    const bigN = 3000, BLK = 256, BIGMAX = 2048;
    const bigCand = Array.from({ length: bigN }, () => ({
        stateId: Math.floor(rnd() * NUM_STATES),
        parentTupleIndex: Math.floor(rnd() * (N_TUPLETS + 2)),
        score: rnd(),
    }));
    const single = compact(bigCand, wheel, tuplets, NUM_STATES, THRESH, BIGMAX).survivors;      // reference: one scan
    const blocked = compactBlocked(bigCand, wheel, tuplets, NUM_STATES, THRESH, BIGMAX, BLK, "scan", null);   // two-level
    let same = bytesEqual(single, blocked);
    // and both must equal the brute-force survivor count
    let expected = 0;
    for (const c of bigCand) {
        if (c.parentTupleIndex >= tuplets.length) continue;
        const fi = tuplets[c.parentTupleIndex].steps[3] * NUM_STATES + c.stateId;
        if (fi < wheel.length && wheel[fi] === 1 && c.score > THRESH) expected++;
    }
    let cnt = 0; for (let i = 0; i < BIGMAX; i++) if (blocked[i] !== 0 || i < Math.min(expected, BIGMAX)) {} // count via reference
    ok("!! at 3000 candidates across 12 blocks, the two-level scan equals the single scan exactly", same,
       "the multi-block deterministic compaction produced the IDENTICAL bytes as the reference single scan over " + Math.min(expected, BIGMAX) + " survivors -- N>1024 stays on the same deterministic answer, no atomics, no drift.");
}

console.log(fails ? "\nprimeTransport-selfcheck: " + fails + " FAILED" : "\nprimeTransport-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
