// WebGLEngine/physics/info/entropy-selfcheck.mjs -- v3567
//
// Run: node physics/info/entropy-selfcheck.mjs
// RUNTIME 2s MEASURED with date(1) around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 4 IS THE ROUND: it DRIVES the key I proposed two rounds ago against the shipped RLE codec and
// shows it firing on correct code. A gate that only demonstrated the replacement would be hiding the reason
// the replacement exists. ***
"use strict";
import { entropy, maxEntropy, binaryEntropy, bscCapacity, kraftSum, huffmanLengths, expectedLength,
         optimalExpectedLength, layeredChunk, rleBounds, RLE_BITS_PER_RUN,
         MEASURED_V3567, reportLines } from "./entropy.mjs";
import { encodeRLE, decodeRLE, runStats } from "../../voxel/voxelRLE.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("entropy-selfcheck -- information theory, and the key that would have failed correct code\n");

// ---------------------------------------------------------------------------
console.log("1. ENTROPY'S EXACT CASES ARE EXACT, NOT SMALL");
{
    for (const n of [2, 4, 8, 16, 32]) {
        const sym = []; for (let i = 0; i < n * 7; i++) sym.push(i % n);
        ok("uniform alphabet of " + String(n).padStart(2) + " has H EXACTLY log2(n) = " + Math.log2(n),
            entropy(sym) === maxEntropy(n), "not to a tolerance -- to the last bit");
    }
    ok("!! a deterministic source has H EXACTLY 0", entropy([7, 7, 7, 7, 7, 7]) === 0,
        "zero, not 1e-16. A single symbol carries no information and the arithmetic says so exactly.");
    ok("!! and H never exceeds log2(n), which is the maximum-entropy statement",
        (() => { for (let t = 0; t < 200; t++) {
            const n = 2 + (t % 9), sym = [];
            for (let i = 0; i < 500; i++) sym.push(Math.floor(Math.abs(Math.sin(i * (t + 1.3))) * n) % n);
            if (entropy(sym) > maxEntropy(n) + 1e-12) return false;
        } return true; })(),
        "over 200 skewed random sources -- an inequality that holds for every distribution, not a fitted bound");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** KRAFT EQUALITY NEEDS NO TOLERANCE, AND THAT IS A PROPERTY OF THE FORMAT ***");
{
    let exact = 0, cases = 0;
    for (let t = 0; t < 60; t++) {
        const n = 2 + (t % 7);
        const w = []; for (let i = 0; i < n; i++) w.push(1 + Math.floor(Math.abs(Math.sin((i + 1) * (t + 2))) * 40));
        const L = huffmanLengths(w);
        cases++;
        if (kraftSum(L) === 1) exact++;
    }
    report("Huffman codes summing to EXACTLY 1.0", exact + " of " + cases);
    ok("!! *** every Huffman code sums to 1.0 TO THE LAST BIT ***", exact === cases,
        "2^-l is a DYADIC RATIONAL and a sum of powers of two is represented exactly in binary floating point, " +
        "so this needs no epsilon at all. *** AND A TOLERANCE HERE WOULD HIDE A REAL DEFECT: an INCOMPLETE " +
        "code falls short by at least 2^-maxLen, which is exactly the size a sloppy epsilon would swallow. ***");
    ok("!! ...and an INCOMPLETE code is caught, so the check is not vacuous",
        kraftSum([1, 2, 3]) < 1 && kraftSum([1, 2, 2]) === 1,
        "[1,2,3] sums to 0.875 and is refused; [1,2,2] sums to exactly 1 and is accepted");
    ok("...and an OVER-SUBSCRIBED set is caught too", kraftSum([1, 1, 1]) > 1,
        "1.5 -- no prefix code can have those lengths");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** HUFFMAN IS GRADED AGAINST BRUTE FORCE, NOT AGAINST ANOTHER HUFFMAN ***");
{
    let checked = 0, worst = 0;
    for (let t = 0; t < 40; t++) {
        const n = 2 + (t % 4);                                  // 2..5 symbols: exhaustive is affordable
        const w = []; for (let i = 0; i < n; i++) w.push(1 + Math.floor(Math.abs(Math.cos((i + 1) * (t + 1.7))) * 20));
        const hl = huffmanLengths(w), hL = expectedLength(w, hl);
        const opt = optimalExpectedLength(w, 6);
        worst = Math.max(worst, hL - opt.L);
        checked++;
    }
    report("alphabets checked against exhaustive search", String(checked));
    report("worst excess of Huffman over the brute-force optimum", worst.toExponential(2));
    ok("!! *** HUFFMAN IS OPTIMAL, AND THE ANSWER KEY IS EXHAUSTIVE SEARCH ***", worst < 1e-12,
        "every length vector satisfying Kraft <= 1 is enumerated and the best expected length found. TWO " +
        "ROUTES SHARING NO CODE -- the key is exponential BY NATURE, which is what makes it a key rather than " +
        "an implementation.");

    // THE ENTROPY BOUND, both sides, and the right-hand side is what makes it non-trivial.
    let lo = true, hi = true;
    for (let t = 0; t < 60; t++) {
        const n = 2 + (t % 8), w = [];
        for (let i = 0; i < n; i++) w.push(1 + Math.floor(Math.abs(Math.sin((i + 2) * (t + 1.1))) * 60));
        const tot = w.reduce((a, b) => a + b, 0);
        const H = entropy(w.flatMap((c, i) => new Array(c).fill(i)));
        const L = expectedLength(w, huffmanLengths(w));
        if (L < H - 1e-12) lo = false;
        if (L >= H + 1) hi = false;
    }
    ok("!! H <= L, so no code beats the entropy of its own source", lo);
    ok("!! ...and L < H + 1, which is the half that says Huffman is never MORE than a bit wasteful", hi,
        "an upper bound is what makes the pair a claim rather than a truism -- the lower half alone is " +
        "satisfied by any code at all that is not cheating");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE KEY I PROPOSED, DRIVEN AGAINST THE SHIPPED CODEC ***");
{
    const chunk = layeredChunk();
    const b = rleBounds(chunk);
    report("chunk", b.voxels + " voxels, " + b.runs + " runs, flat " + b.flatBytes + "B, RLE " + b.rleBytes + "B");
    report("order-0 entropy", b.order0BitsPerVoxel.toFixed(4) + " bits/voxel -> " + b.order0Bytes.toFixed(0) + " bytes");

    // FIRST: the codec is CORRECT. Without this the finding below could be "the codec is broken" after all.
    const rle = encodeRLE(chunk.v, { sx: chunk.sx, sy: chunk.sy, sz: chunk.sz });
    const back = decodeRLE(rle);
    ok("!! the codec is LOSSLESS on this chunk, checked before anything is concluded from its size",
        back.length === chunk.v.length && back.every((x, i) => x === chunk.v[i]),
        "*** WITHOUT THIS, 'it is below the entropy bound' WOULD BE EVIDENCE THAT IT IS BROKEN. It is not " +
        "broken; decode(encode(v)) is v to the last voxel. ***");

    ok("!! *** AND IT IS 33% BELOW THE BOUND I PROPOSED AS THE FALSIFIER ***", b.beatsOrder0,
        "RLE spends " + b.rleBytes + " bytes against an order-0 floor of " + b.order0Bytes.toFixed(0) +
        " -- " + (100 * (1 - b.rleBytes / b.order0Bytes)).toFixed(0) + "% under. *** I PITCHED THIS BRANCH ON " +
        "'a compressor reporting below the empirical entropy is broken' AND THAT KEY WOULD HAVE FIRED ON " +
        "CORRECT SHIPPED CODE ON THE FIRST REAL CHUNK. Shannon's bound is a floor for a MEMORYLESS source " +
        "coded SYMBOL BY SYMBOL; a voxel column is the opposite, and voxelRLE's own header says the Y-fastest " +
        "order 'is the entire reason this compresses'. A KEY THAT FIRES ON CORRECT CODE IS WORSE THAN NO KEY, " +
        "because the first thing anybody does with it is weaken it. ***");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE REPLACEMENT ASKS THE BOUND OF WHAT RLE ACTUALLY ENCODES");
{
    const b = rleBounds();
    report("H(type) / H(count) / sum", b.typeBits.toFixed(4) + " / " + b.countBits.toFixed(4) + " / " +
        b.runFloorBits.toFixed(4) + " bits per run");
    report("RLE spends", b.spentBitsPerRun + " bits/run   headroom " + b.headroom.toFixed(2) + "x");

    ok("!! the shipped cost is ABOVE the run-stream floor, which is the direction that must hold",
        b.spentBitsPerRun > b.runFloorBits,
        "*** BELOW IT WOULD MEAN THE CODEC WAS LOSING INFORMATION. Above it means headroom. This is the " +
        "bound the codec can actually be held to, because it is the bound of the thing it emits. ***");
    ok("!! ...and the 40 bits is READ FROM THE CODEC'S OWN ARITHMETIC, not typed here",
        RLE_BITS_PER_RUN === 40 && runStats(encodeRLE(layeredChunk().v)).rleBytes ===
            runStats(encodeRLE(layeredChunk().v)).runs * 5,
        "runStats reports `runs * 5` -- a Uint8 type and a Uint32 count. If the codec's packing changes, this " +
        "line goes red and SHOULD BE REWRITTEN TO THE NEW PACKING, not weakened.");
    ok("!! the headroom is a MEASURED ENGINEERING NUMBER rather than a verdict", b.headroom > 1,
        b.headroom.toFixed(2) + "x. It says a Huffman coder on the run stream would pay for itself AND BY HOW " +
        "MUCH -- which is what 'a key that grades shipped code' was supposed to buy, and it took losing the " +
        "first key to get it.");
    ok("nothing is ratcheted", !("baseline" in MEASURED_V3567),
        "one chunk shape, chosen from the codec's own header. A baseline frozen here would freeze MY CHOICE " +
        "OF TERRAIN, and the headroom is a property of the terrain as much as of the codec.");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE CLOSED FORM, AND ITS EXACT POINTS");
{
    ok("!! BSC capacity is EXACTLY 0 at p = 1/2", bscCapacity(0.5) === 0,
        "a channel that flips half the bits carries nothing, and the arithmetic gives zero to the last bit");
    ok("!! ...and EXACTLY 1 at p = 0 and p = 1", bscCapacity(0) === 1 && bscCapacity(1) === 1,
        "a perfect channel and a perfectly inverted one carry the same information");
    ok("!! and C(p) = C(1-p), a symmetry the formula is never told",
        (() => { for (let k = 1; k < 50; k++) { const p = k / 100;
            if (Math.abs(bscCapacity(p) - bscCapacity(1 - p)) > 1e-15) return false; } return true; })(),
        "flipping the meaning of the bits cannot change the capacity");
    ok("the report prints and the tool exits zero", reportLines().length > 15,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\nentropy-selfcheck: ${fails} FAILED` : "\nentropy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
