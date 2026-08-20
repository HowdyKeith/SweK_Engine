// tools/roundhouse/uncertainty.mjs
//
// v3432 -- ONE DEVICE IN SIXTY-SIX REPORTS AN ERROR BAR.
//
// Every other device returns a point value, so "worst error 4.5e-15" and "0.617%" look like the same kind of
// statement. They are not: the first is floating-point noise on an exact identity and the second is a physical
// discrepancy. Without an error bar there is no way to ask the question that actually matters --
//
//     DO THESE TWO NUMBERS AGREE WITHIN THEIR UNCERTAINTY?
//
// which is what the coupling and value-match censuses have been answering with a hand-picked tolerance.
//
// *** WHAT IS AND IS NOT COMPUTABLE HERE. *** A statistical error bar needs a SAMPLE COUNT. 17 of the 53 cheap
// devices expose one; 36 do not, and for those an error bar cannot be manufactured -- a deterministic closed
// form has no sampling error at all, and inventing one would be worse than reporting none.
//
// So this computes an error bar ONLY where the device supplies the ingredients, and reports "none" everywhere
// else with the reason. A device whose observable is exact does not need an error bar; a device that samples
// and does not report its count is the gap worth closing.

/** Names a device might use for its sample count, in the order they are worth trying. */
const COUNT_KEYS = ["samples", "nTraj", "reps", "trials", "count", "points", "n", "N", "steps"];

/** Find a sample count in a device's output, or null if it does not expose one. */
export function sampleCount(out) {
    for (const k of COUNT_KEYS) {
        const v = out && out[k];
        if (typeof v === "number" && Number.isFinite(v) && v >= 2) return { n: v, key: k };
    }
    return null;
}

/**
 * Monte-Carlo standard error on a MEAN, given the sample count and a spread.
 * Returns null rather than a number when the ingredients are missing -- a null is honest and a zero would read
 * as "measured to be exact".
 */
export function standardError(spread, n) {
    if (!(typeof spread === "number") || !Number.isFinite(spread)) return null;
    if (!(typeof n === "number") || !(n >= 2)) return null;
    return spread / Math.sqrt(n);
}

/** Binomial standard error on a PROPORTION -- the right form when the observable is a rate or a fraction. */
export function binomialError(p, n) {
    if (!(p >= 0 && p <= 1) || !(n >= 2)) return null;
    return Math.sqrt(p * (1 - p) / n);
}

/**
 * Do two measurements agree within their combined uncertainty?
 *
 * THIS IS THE POINT OF THE WHOLE MODULE. A coupling currently passes or fails against a tolerance somebody
 * chose. With error bars the question becomes how many combined sigma apart the two values are, which is a
 * measurement rather than a preference.
 *
 * When either error is unknown it says so and REFUSES to judge, rather than falling back on a default tolerance
 * -- because a default tolerance is exactly the hand-picked number this replaces.
 */
export function agreeWithinError(a, errA, b, errB, sigmaLimit = 3) {
    if (errA == null || errB == null) {
        return { judged: false, reason: "at least one measurement has no error bar -- cannot judge agreement" };
    }
    const combined = Math.sqrt(errA * errA + errB * errB);
    if (!(combined > 0)) return { judged: false, reason: "combined error is zero -- both claimed exact" };
    const sigma = Math.abs(a - b) / combined;
    return { judged: true, sigma, agree: sigma <= sigmaLimit, combined,
             reason: `${sigma.toFixed(2)} sigma apart against a ${sigmaLimit} sigma limit` };
}

/** Which devices can report an error bar at all, and which cannot -- with the reason. */
export async function uncertaintyCensus(deviceNames, getDevice, skip = {}) {
    const withBar = [], without = [];
    for (const name of deviceNames) {
        if (skip[name]) continue;
        let d; try { d = await getDevice(name); } catch { continue; }
        let found = false;
        for (const mode of (d.modes || [null])) {
            let o; try { o = await d.build(mode ? { mode } : {}); } catch { continue; }
            if (sampleCount(o)) { found = true; break; }
        }
        (found ? withBar : without).push(name);
    }
    return { withBar, without, total: withBar.length + without.length };
}
