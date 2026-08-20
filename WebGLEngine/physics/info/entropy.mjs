// WebGLEngine/physics/info/entropy.mjs -- v3567
// ---------------------------------------------------------------------------------------------------------------
// INFORMATION THEORY -- a new lab branch, and the round where MY OWN PROPOSED KEY WOULD HAVE FAILED CORRECT
// SHIPPED CODE.
//
// I pitched this branch two rounds ago with a load-bearing negative I was pleased with: "a compressor reporting
// below the empirical entropy is broken, and this tree ships an RLE voxel codec -- a key that can fail on real
// engine code, not only on a fixture."
//
// *** IT IS WRONG, AND voxel/voxelRLE.js IS THE COUNTEREXAMPLE. *** On a layered chunk of exactly the shape that
// codec's own header describes -- bedrock, stone, dirt, air, 32 x 256 x 32 with Y fastest -- the ORDER-0 entropy
// of the voxel stream is 0.9315 bits/voxel, so a memoryless coder needs 30,525 bytes. RLE SPENDS 20,480. THIRTY-
// THREE PERCENT BELOW THE BOUND I PROPOSED AS THE FALSIFIER, AND THE CODEC IS LOSSLESS.
//
// THE REASON IS THE WHOLE POINT OF RLE: Shannon's source-coding bound is a floor for coding a MEMORYLESS source
// SYMBOL BY SYMBOL. A voxel column is nothing like memoryless -- it is long runs of one type, which is why the
// header says the Y-fastest index order "is the entire reason this compresses". RLE spends its bits on the
// CORRELATION, which order-0 entropy cannot see.
//
// *** A KEY THAT FIRES ON CORRECT CODE IS WORSE THAN NO KEY, because the first thing anybody does with it is
// weaken it -- and this one would have fired on the first real chunk it was ever shown. The proposal was tested
// BEFORE it was built into anything, which is the only reason it is a finding rather than a defect. ***
//
// ================================================================================================================
// THE HONEST REPLACEMENT, AND IT IS A BETTER KEY THAN THE ONE IT REPLACES
// ================================================================================================================
//
// Ask the bound of WHAT RLE ACTUALLY ENCODES. The codec emits (type, count) pairs and spends a FIXED 40 bits on
// each -- a Uint8 type and a Uint32 count, which is `runs * 5` in its own runStats(). The entropy of that PAIR
// STREAM is a real floor for any coder of those pairs, and it is measurable:
//
//     H(type) = 2.0000 bits    H(count) = 4.3554 bits    sum 6.3554 bits/run    against 40 bits/run spent
//
// So the shipped codec is not broken and never was -- it is spending **6.3x** what the run stream costs, and
// that number is HEADROOM, derived rather than guessed. It says a Huffman coder on the runs would pay for
// itself, and it says by how much. AN ENGINEERING NUMBER ABOUT SHIPPED CODE, which is what the branch was for.
//
// ================================================================================================================
// THE REST OF THE BRANCH, AND ITS KEYS ARE EXACT RATHER THAN TOLERANCED
// ================================================================================================================
//
//   H OF A UNIFORM ALPHABET IS EXACTLY log2(n), and of a deterministic source EXACTLY 0 -- not small, zero.
//   KRAFT EQUALITY IS EXACT IN FLOATING POINT, and that is not luck: 2^-l is a dyadic rational, and a sum of
//     powers of two is represented exactly in binary floating point. A complete prefix code sums to 1.0 to the
//     last bit, so the check needs NO TOLERANCE AT ALL.
//   HUFFMAN OPTIMALITY IS CHECKED BY EXHAUSTIVE SEARCH, not asserted. For a small alphabet every length vector
//     satisfying Kraft <= 1 is enumerated and the best expected length found. THE ANSWER KEY IS NOT ANOTHER
//     HUFFMAN -- it is brute force, sharing no code with the thing it grades.
//   BSC CAPACITY C(p) = 1 - H2(p) is closed form: C(0) = 1 and C(1/2) = 0 EXACTLY, and C(p) = C(1-p).
"use strict";
import { pathToFileURL } from "node:url";
import { encodeRLE, runStats, RLE_SX, RLE_SY, RLE_SZ } from "../../voxel/voxelRLE.js";

/** Shannon entropy in bits from a symbol sequence. */
export function entropy(symbols) {
    const c = new Map();
    for (const s of symbols) c.set(s, (c.get(s) || 0) + 1);
    const n = symbols.length;
    if (!n) return 0;
    let h = 0;
    for (const k of c.values()) { const p = k / n; h -= p * Math.log2(p); }
    return h;
}

export const maxEntropy = (n) => Math.log2(n);
export const binaryEntropy = (p) => (p <= 0 || p >= 1) ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
export const bscCapacity = (p) => 1 - binaryEntropy(p);

/**
 * *** EXACT IN FLOATING POINT, AND THAT IS A PROPERTY OF THE FORMAT RATHER THAN LUCK. *** 2^-l is a dyadic
 * rational, and a sum of powers of two is represented exactly in binary floating point, so a complete prefix
 * code sums to 1.0 TO THE LAST BIT. This check needs no tolerance -- and a tolerance here would hide a real
 * defect, because an INCOMPLETE code sums to strictly less than 1 by at least 2^-maxLen.
 */
export function kraftSum(lengths) {
    let s = 0;
    for (const l of lengths) s += Math.pow(2, -l);
    return s;
}

/** Huffman code LENGTHS for a weight vector. Lengths are all the keys need; the codewords are not the claim. */
/**
 * *** v3781 -- `mergeLargest` DEFAULTS TO FALSE AND EXISTS SO A PLANT CAN SIT ON THE ONE DECISION HUFFMAN
 * MAKES. The algorithm is "repeatedly merge the two SMALLEST weights"; merging the two LARGEST instead is the
 * classic misremembering, and IT STILL PRODUCES A VALID PREFIX CODE -- every leaf still gets a depth, the tree
 * is still binary, and THE KRAFT SUM IS STILL EXACTLY 1. Nothing about the code's VALIDITY gives it away.
 * WHAT BREAKS IS OPTIMALITY: the expected length leaves Shannon's [H, H+1) band, and only a key that knows
 * the entropy can see that -- which the tree builder never computes. ***
 */
export function huffmanLengths(weights, mergeLargest = false) {
    const n = weights.length;
    if (n === 0) return [];
    if (n === 1) return [1];                       // one symbol still costs a bit to send
    let nodes = weights.map((w, i) => ({ w, leaves: [i] }));
    const depth = new Array(n).fill(0);
    while (nodes.length > 1) {
        nodes.sort((a, b) => a.w - b.w || a.leaves[0] - b.leaves[0]);   // deterministic tie-break
        if (mergeLargest) nodes.reverse();          // v3781 -- the plant: take the two LARGEST instead
        const a = nodes.shift(), b = nodes.shift();
        for (const i of a.leaves) depth[i]++;
        for (const i of b.leaves) depth[i]++;
        nodes.push({ w: a.w + b.w, leaves: [...a.leaves, ...b.leaves] });
    }
    return depth;
}

export function expectedLength(weights, lengths) {
    const tot = weights.reduce((a, b) => a + b, 0);
    if (!tot) return 0;
    let L = 0;
    for (let i = 0; i < weights.length; i++) L += (weights[i] / tot) * lengths[i];
    return L;
}

/**
 * *** THE ANSWER KEY, AND IT IS NOT ANOTHER HUFFMAN. *** Enumerate EVERY length vector satisfying Kraft <= 1 up
 * to maxLen and return the smallest expected length. Brute force sharing no code with huffmanLengths, so
 * agreement is evidence rather than a restatement. Exponential, hence small alphabets only -- which is exactly
 * what makes it usable as a key rather than as an implementation.
 */
export function optimalExpectedLength(weights, maxLen = 6) {
    const n = weights.length;
    if (n <= 1) return { L: n === 1 ? 1 : 0, lengths: n === 1 ? [1] : [] };
    let best = Infinity, bestL = null;
    const cur = new Array(n);
    const rec = (i, kraft) => {
        if (kraft > 1 + 1e-15) return;
        if (i === n) {
            const L = expectedLength(weights, cur);
            if (L < best) { best = L; bestL = [...cur]; }
            return;
        }
        for (let l = 1; l <= maxLen; l++) { cur[i] = l; rec(i + 1, kraft + Math.pow(2, -l)); }
    };
    rec(0, 0);
    return { L: best, lengths: bestL };
}

/** A layered chunk of the shape voxelRLE's own header describes. The codec's home ground, not an easy case. */
export function layeredChunk({ sx = RLE_SX, sy = RLE_SY, sz = RLE_SZ } = {}) {
    const v = new Uint8Array(sx * sy * sz);
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
        const h = 60 + Math.round(8 * Math.sin(x * 0.3) + 6 * Math.cos(z * 0.21));
        for (let y = 0; y < sy; y++) v[(z * sx + x) * sy + y] = y < 2 ? 4 : y < h - 4 ? 1 : y < h ? 2 : 0;
    }
    return { v, sx, sy, sz };
}

export const RLE_BITS_PER_RUN = 40;               // Uint8 type + Uint32 count, which is runStats' `runs * 5`

/**
 * The two bounds, side by side -- and they disagree, which is the round.
 *
 * order0Bytes  what a MEMORYLESS symbol-by-symbol coder would need for the voxel stream. RLE BEATS THIS, and
 *              beating it is correct: RLE spends its bits on CORRELATION, which order-0 entropy cannot see.
 * runFloorBits H(type) + H(count) over the pair stream RLE actually emits -- a real floor for any coder of
 *              those pairs, and the one the shipped 40 bits/run should be compared against.
 */
export function rleBounds(chunk = layeredChunk()) {
    const rle = encodeRLE(chunk.v, { sx: chunk.sx, sy: chunk.sy, sz: chunk.sz });
    const st = runStats(rle);
    const H0 = entropy(Array.from(chunk.v));
    const Ht = entropy(Array.from(rle.types)), Hc = entropy(Array.from(rle.counts));
    return {
        voxels: chunk.v.length, runs: st.runs, rleBytes: st.rleBytes, flatBytes: st.flatBytes,
        order0BitsPerVoxel: H0, order0Bytes: H0 * chunk.v.length / 8,
        beatsOrder0: st.rleBytes < H0 * chunk.v.length / 8,
        typeBits: Ht, countBits: Hc, runFloorBits: Ht + Hc,
        spentBitsPerRun: RLE_BITS_PER_RUN,
        headroom: RLE_BITS_PER_RUN / (Ht + Hc),
    };
}

export const MEASURED_V3567 = {
    myProposedKeyWasWrong:
        "*** I PITCHED THIS BRANCH ON 'a compressor reporting below the empirical entropy is broken', AND IT " +
        "WOULD HAVE FAILED voxel/voxelRLE.js ON THE FIRST REAL CHUNK. *** Order-0 entropy of a layered chunk is " +
        "0.9315 bits/voxel = 30,525 bytes; RLE spends 20,480. THIRTY-THREE PERCENT BELOW THE BOUND, AND THE " +
        "CODEC IS LOSSLESS. Shannon's bound is a floor for coding a MEMORYLESS source SYMBOL BY SYMBOL, and a " +
        "voxel column is the opposite of memoryless -- the codec's own header says the Y-fastest order 'is the " +
        "entire reason this compresses'. A KEY THAT FIRES ON CORRECT CODE IS WORSE THAN NO KEY, because the " +
        "first thing anybody does with it is weaken it. Tested BEFORE it was built into anything.",
    theReplacement:
        "Ask the bound of WHAT RLE ACTUALLY ENCODES. It emits (type, count) pairs at a FIXED 40 bits each " +
        "(Uint8 + Uint32, its own runStats' `runs * 5`), and the entropy of that pair stream is a real floor: " +
        "H(type) 2.0000 + H(count) 4.3554 = 6.3554 bits/run. The codec spends 6.3x that. NOT A DEFECT -- " +
        "HEADROOM, derived rather than guessed, and it says a Huffman coder on the runs would pay for itself " +
        "and by how much. AN ENGINEERING NUMBER ABOUT SHIPPED CODE, which is what the branch was for.",
    kraftIsExact:
        "Kraft equality needs NO TOLERANCE and that is a property of the format: 2^-l is a dyadic rational and " +
        "a sum of powers of two is exact in binary floating point, so a complete prefix code sums to 1.0 to the " +
        "last bit. A tolerance here would HIDE a real defect -- an incomplete code falls short by at least " +
        "2^-maxLen, which is exactly the size a sloppy epsilon would swallow.",
    optimalityIsBruteForced:
        "Huffman is graded against EXHAUSTIVE SEARCH over every length vector satisfying Kraft <= 1, not " +
        "against another Huffman. Two routes sharing no code, and the key is exponential BY NATURE -- which is " +
        "what makes it a key rather than an implementation.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const L = [];
    const b = rleBounds();
    L.push("[entropy] Information theory -- and the key I proposed would have failed correct shipped code");
    L.push("");
    L.push("  voxel/voxelRLE.js on a layered chunk (its own header's shape): " + b.voxels + " voxels, " +
           b.runs + " runs");
    L.push("    flat " + b.flatBytes + " bytes    RLE " + b.rleBytes + " bytes");
    L.push("");
    L.push("  THE KEY I PITCHED -- 'below the empirical entropy means broken':");
    L.push("    order-0 entropy " + b.order0BitsPerVoxel.toFixed(4) + " bits/voxel -> " +
           b.order0Bytes.toFixed(0) + " bytes for a MEMORYLESS coder");
    L.push("    RLE spends " + b.rleBytes + " bytes  ->  " +
           (b.beatsOrder0 ? "*** " + (100 * (1 - b.rleBytes / b.order0Bytes)).toFixed(0) +
            "% BELOW THE BOUND, AND THE CODEC IS LOSSLESS ***" : "above it"));
    L.push("    Shannon's bound is a floor for a MEMORYLESS source coded SYMBOL BY SYMBOL. A voxel column is");
    L.push("    the opposite, and the codec's own header says so. THE KEY WAS WRONG, NOT THE CODEC.");
    L.push("");
    L.push("  THE HONEST BOUND -- ask what RLE actually encodes:");
    L.push("    H(type) " + b.typeBits.toFixed(4) + " + H(count) " + b.countBits.toFixed(4) +
           " = " + b.runFloorBits.toFixed(4) + " bits/run");
    L.push("    RLE spends a FIXED " + b.spentBitsPerRun + " bits/run (Uint8 + Uint32)");
    L.push("    HEADROOM " + b.headroom.toFixed(2) + "x -- not a defect, a measured engineering number:");
    L.push("    a Huffman coder on the run stream would pay for itself, and this says by how much.");
    L.push("");
    L.push("  " + MEASURED_V3567.kraftIsExact);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
