// tools/roundhouse/entropyBind.mjs -- v3781
//
// *** TIER 2. physics/info/entropy.mjs was ungraded, and it holds something rare in this tree: A THEOREM AS A
// KEY. Shannon's source-coding theorem says an optimal prefix code's expected length satisfies
//
//     H <= L < H + 1
//
// and the two sides are computed by CODE THAT SHARES NOTHING. huffmanLengths() is a greedy merge over weights
// that NEVER TAKES A LOGARITHM; entropy() sums -p log2 p and never builds a tree. TWO ROUTES, NO SHARED
// CONSTANT -- which after ct, the interferometer, kepler and the thermostat is worth saying out loud. ***
//
// *** AND THE COMPANION KEY IS DELIBERATELY BLIND, WHICH IS THE POINT OF REPORTING BOTH. The Kraft sum
// (sum of 2^-l) is EXACTLY 1 for any complete prefix code, and it stays exactly 1 when the tree is built
// WRONG -- measured, 1.000000000000 in both arms of the plant below. VALIDITY AND OPTIMALITY ARE DIFFERENT
// CLAIMS: Kraft answers "is this a code at all", Shannon answers "is it a good one", and a check that asked
// only the first would pass a tree built by the opposite rule. ***

import { entropy, maxEntropy, binaryEntropy, kraftSum, huffmanLengths, expectedLength } from "../../physics/info/entropy.mjs";

export const ENTROPY_OBSERVABLES = [
    "H", "expectedLen", "excessOverH", "shannonHolds", "kraftSum", "kraftHolds",
    "uniformH", "uniformExact", "maxH", "belowMax", "binaryAtHalf", "symbols",
];

export const ENTROPY_MODES = ["coding", "bounds", "mergelargest"];

// The textbook weight set, so a reader can check the arithmetic against any information-theory chapter.
const DEF = { weights: [45, 13, 12, 16, 9, 5], uniformN: 8 };

export function entropyDefaults(hyp) {
    const h = { mode: "coding", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    if (!Array.isArray(c.weights) || c.weights.length < 2 || !c.weights.every((w) => Number.isFinite(w) && w > 0)) {
        c.weights = DEF.weights.slice();
    }
    c.uniformN = Math.min(1024, Math.max(2, (Number(c.uniformN) || DEF.uniformN) | 0));
    h.config = c;
    if (!ENTROPY_MODES.includes(h.mode)) h.mode = "coding";
    return h;
}

/** H in bits, written out from the weights -- never imported from the module under test. */
function entropyOf(weights) {
    const tot = weights.reduce((a, b) => a + b, 0);
    return -weights.reduce((s, w) => { const p = w / tot; return s + p * Math.log2(p); }, 0);
}

export async function buildEntropy(hyp, base = {}) {
    const h = entropyDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const out = { symbols: c.weights.length };

    if (h.mode === "bounds") {
        // *** THE EXACT VALUES, WHICH THE MODULE IS NEVER TOLD. A uniform distribution over n symbols has
        // H = log2(n) EXACTLY -- not approximately, and not to a tolerance. ***
        const uni = new Array(c.uniformN).fill(1);
        out.uniformH = entropy(uni.flatMap((_, i) => [i]));   // one occurrence of each symbol = uniform
        out.uniformExact = Math.abs(out.uniformH - Math.log2(c.uniformN)) < 1e-12;
        out.maxH = maxEntropy(c.weights.length);
        out.H = entropyOf(c.weights);
        // H <= log2(n) for ANY distribution, with equality only when uniform -- an inequality, not a value.
        out.belowMax = out.H <= out.maxH + 1e-12;
        out.binaryAtHalf = binaryEntropy(0.5);                // exactly 1 bit, the definition of a fair coin
        return out;
    }

    // *** "mergelargest" IS THE PLANT AND IT RUNS THIS BRANCH -- see huffmanLengths' own header. ***
    const lens = huffmanLengths(c.weights, h.mode === "mergelargest");
    const H = entropyOf(c.weights);
    const L = expectedLength(c.weights, lens);
    out.H = H;
    out.expectedLen = L;
    out.excessOverH = L - H;
    // *** A BAND, NOT A TOLERANCE. Shannon's theorem gives BOTH sides: a code cannot beat H, and an optimal
    // one cannot waste a whole bit. Checking only the upper side would pass a code that claimed to beat the
    // entropy, which is impossible and would mean the entropy was computed wrong. ***
    out.shannonHolds = L >= H - 1e-12 && L < H + 1;
    out.kraftSum = kraftSum(lens);
    out.kraftHolds = Math.abs(out.kraftSum - 1) < 1e-12;
    return out;
}

export const entropyDevice = {
    // *** v4035 -- DECLARED, BECAUSE THE ELEMENTWISE LADDER IS THE ONE TRANSFORMATION THIS QUANTITY IGNORES. ***
    // `weights` ARE SYMBOL FREQUENCIES, AND SHANNON ENTROPY DOES NOT CARE HOW MANY TIMES YOU COUNTED.
    // H(p) depends on the normalised distribution, so multiplying every frequency by ten is the identity on
    // every observable here -- MEASURED BIT-IDENTICAL. The array ladder scales, so it was asking the one
    // question this device is provably blind to, and reported the knob dead for being right.
    // The alternatives change the SHAPE instead: uniform is maximum entropy (H = log2(6) = 2.5850 exactly),
    // and the skewed one is far from it (H = 0.6651). Both move H, expectedLen and excessOverH.
    knobChoices: { weights: [[45, 13, 12, 16, 9, 5], [1, 1, 1, 1, 1, 1], [90, 5, 2, 1, 1, 1]] },

    modes: ENTROPY_MODES,
    // "coding" is FIRST so the mode-plant contract compares the plant against the mode that owns the band.
    plantMode: "mergelargest", plantFlips: "excessOverH", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "excessOverH is the code's expected length minus the source entropy; Huffman's bound is an excess below 1 bit and the ideal is 0, reached only by a dyadic source. Merging the LARGEST nodes instead of the smallest takes it 2.01e-2 -> 1.94, straight through the bound",
    name: "shannon-source-coding", observables: ENTROPY_OBSERVABLES,
    build: buildEntropy, defaults: entropyDefaults,
};
