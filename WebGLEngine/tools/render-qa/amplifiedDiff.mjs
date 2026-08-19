// WebGLEngine/tools/render-qa/amplifiedDiff.mjs
// VERSION: v1 -- v3252
//
// SHOW THE RESIDUAL, AMPLIFIED, BECAUSE A NEAR-MATCH IS INVISIBLE AT 1x.
//
// TAKEN FROM Infatoshi/netherite (see [[external-repos]]), which rewrote Minecraft 1.11.2 in C and CUDA and
// bit-verified it against the real game. Its receipt for the inventory screen is the technique:
//
//     "my inventory screen minus Minecraft's, AMPLIFIED 80x so you can see anything at all.
//      112,796 pixels. 442 differ, each by 0.3%"
//
// *** THAT IS THIS TREE'S OWN RULE -- SHOW THE RESIDUAL RATHER THAN CLAIM A MATCH -- APPLIED TO PIXELS. ***
// render-qa already gates numerically and already refuses to conflate too-different with SUSPICIOUSLY IDENTICAL
// (regionFracInRange gates both ends, on the grounds that two backends agreeing perfectly may mean one is
// frozen). What it could not do is let a person SEE a 0.3% difference. Two images that differ by a third of a
// percent look like the same image, and "looks fine" is exactly the verdict this project spends its rounds
// refusing to accept.
//
// THE NUMBERS COME OUT WITH THE PICTURE, AND THAT IS DELIBERATE. An amplified image alone is a rumour: 80x makes
// noise look like a defect, and a reader with no counts cannot tell one pixel at 40% from four hundred at 0.3%.
// diffStats returns both, and the page prints both beside the image.

/** Bytes per pixel for an RGBA buffer. Named rather than inlined so the arithmetic below reads as pixels. */
const RGBA = 4;

/**
 * Per-pixel absolute difference between two RGBA buffers, amplified.
 *
 * @param {Uint8ClampedArray|Uint8Array} a
 * @param {Uint8ClampedArray|Uint8Array} b
 * @param {{ gain?: number, alpha?: number }} opts  gain: the amplification (netherite used 80)
 * @returns {{ out: Uint8ClampedArray, stats: object }}
 *
 * *** THE OUTPUT IS SATURATED, NOT SCALED, AND THE STATS SAY SO. *** Multiplying a difference by 80 pushes
 * anything above 3/255 to full white, so the IMAGE cannot distinguish a small difference from a large one --
 * it only answers WHERE. maxDelta answers HOW MUCH, and it is computed BEFORE the gain, from the raw bytes.
 * An amplified picture read as a magnitude is the mistake this function exists to make impossible.
 */
export function amplifiedDiff(a, b, { gain = 80, alpha = 255 } = {}) {
    if (!a || !b) throw new TypeError("amplifiedDiff needs two pixel buffers");
    if (a.length !== b.length) {
        // SIZE MISMATCH IS NOT A DIFFERENCE, IT IS A DIFFERENT PICTURE. Returning a diff over the shorter of the
        // two would compare a crop against an original and call the missing part "identical".
        throw new RangeError("amplifiedDiff: buffers differ in length (" + a.length + " vs " + b.length +
                             ") -- that is a size mismatch, not a pixel difference");
    }
    const n = a.length;
    const out = new Uint8ClampedArray(n);
    let differing = 0, maxDelta = 0, sumDelta = 0;

    for (let i = 0; i < n; i += RGBA) {
        // ALPHA IS EXCLUDED FROM THE COMPARISON. A fully transparent pixel can carry any colour at all, so two
        // renders that agree on every visible pixel can differ wildly in the RGB under alpha=0 -- and reporting
        // that as a rendering difference would be reporting a fact about undefined data.
        const dr = Math.abs(a[i] - b[i]), dg = Math.abs(a[i + 1] - b[i + 1]), db = Math.abs(a[i + 2] - b[i + 2]);
        const d = Math.max(dr, dg, db);
        if (d > 0) { differing++; sumDelta += d; if (d > maxDelta) maxDelta = d; }
        out[i] = dr * gain; out[i + 1] = dg * gain; out[i + 2] = db * gain; out[i + 3] = alpha;
    }

    const pixels = n / RGBA;
    return {
        out,
        stats: {
            pixels, differing, gain,
            // FRACTIONS AND COUNTS BOTH, because "442 of 112,796" and "0.39%" answer different questions and a
            // reader given only one will invent the other.
            differingFrac: pixels ? differing / pixels : 0,
            maxDelta,                                  // 0-255, RAW -- the gain is not applied
            maxDeltaPct: maxDelta / 255,
            meanDeltaOverDiffering: differing ? sumDelta / differing : 0,
            // *** IDENTICAL IS REPORTED AS ITS OWN STATE. *** render-qa already treats two backends agreeing
            // perfectly as suspicious rather than good (regionFracInRange gates both ends), and a diff that
            // returned an all-black image with no flag would hide exactly that.
            identical: differing === 0,
        },
    };
}

/**
 * A one-line receipt in netherite's own shape, for logs and gates.
 * "112,796 pixels. 442 differ, each by up to 0.3% (80x amplified)"
 */
export function diffReceipt(stats) {
    if (!stats) return "no diff";
    if (stats.identical) {
        // WORDED AS A FINDING, NOT AS A PASS. Two renderers producing byte-identical output is either excellent
        // news or a sign that one of them is not running, and this line must not decide which.
        return stats.pixels.toLocaleString() + " pixels, ZERO differ -- identical. Verify both sources actually rendered.";
    }
    return stats.pixels.toLocaleString() + " pixels. " + stats.differing.toLocaleString() + " differ (" +
           (stats.differingFrac * 100).toFixed(3) + "%), each by up to " +
           (stats.maxDeltaPct * 100).toFixed(2) + "% -- shown at " + stats.gain + "x";
}
