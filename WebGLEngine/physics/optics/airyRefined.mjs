// physics/optics/airyRefined.mjs
//
// v2911 -- THE AIRY RING WAS GRADED AGAINST A ROUNDED CONSTANT, AND SCORED A PERFECT ZERO AGAINST IT.
//
// Two independent defects, discovered one round apart and compounding into a third:
//
// 1. THE ANSWER KEY IS ROUNDED. opticsBind grades rayleighFactor against the literal 1.22. The first dark ring
//    of a circular aperture sits at j(1,1)/pi where j(1,1) = 3.8317059702075123 is the first zero of the Bessel
//    function J1, so the true value is 1.2196698912665045. Grading against 1.22 puts a FLOOR of 2.706e-4 under
//    airyRingErrFrac: a perfect measurement would score 2.7e-4, and a worse measurement that happened to land
//    nearer 1.22 would score better. The device rewards being wrong in the right direction.
//
// 2. THE MEASUREMENT IS GRID-QUANTISED. firstMinimumAt returns sinThetas[i] -- the raw sample where the pattern
//    turns -- with no sub-sample refinement. v2908 deduced this from the outside (rayleighFactor is bit-identical
//    across wavelength while the underlying pattern moves in the 15th digit) and v2910 confirmed the consequence:
//    lambda moves NOTHING that optics.airy reports.
//
// 3. TOGETHER THEY PRODUCE A PERFECT SCORE. At nSamples = 3600 and 7200 a grid point falls exactly on
//    1.22*lambda/D, so rayleighFactor comes back as exactly 1.220000000 and airyRingErrFrac as EXACTLY ZERO.
//    The device reports flawless agreement with a constant that is wrong in the fourth digit. That is a
//    suspicious exact zero of precisely the kind v2898's census hunts, and the census never saw it because it
//    builds every device at its DEFAULT config -- nSamples 900, where the error reads 7.1e-4 and looks healthy.
//    v2910 stated "the sweep measures response at the default operating point" as a limitation; this is what
//    that limitation costs.
//
// THIS FILE CHANGES NOTHING BY ITSELF. Adopting it in opticsBind moves a graded observable and therefore needs
// BASELINE.md regenerated, which is a scoped round of its own. What is shipped here is the correct constant, a
// refined estimator, and the measurement showing how much they buy -- so the decision to regrade is made against
// numbers rather than against an argument.

/** First zero of the Bessel function J1. */
export const J1_FIRST_ZERO = 3.8317059702075123156;

/** The first dark ring of a circular aperture, in units of lambda/D. The value 1.22 is this, rounded. */
export const AIRY_FIRST_RING = J1_FIRST_ZERO / Math.PI;   // 1.2196698912665045

/**
 * Locate the first interior minimum to SUB-SAMPLE precision by fitting a parabola through the turning sample and
 * its two neighbours.
 *
 * Why a parabola and not something cleverer: near a smooth minimum any well-behaved function is locally
 * quadratic, the three samples that bracket the turn are exactly the data a quadratic needs, and the vertex has
 * a closed form. Higher-order fits would need more samples spanning more curvature and would trade a known small
 * bias for an unknown one.
 *
 * FIT THE INTENSITY, NOT THE AMPLITUDE -- AND THE FIRST VERSION OF THIS FILE GOT THAT BACKWARDS.
 *
 * It originally fitted sqrt(intensity), on the argument that "the Airy minimum is a true zero, so the intensity
 * is quadratic and nearly flat there while the amplitude crosses linearly and is better conditioned". The
 * selfcheck measured the two against each other and refuted it: intensity 2.06e-5, amplitude 1.78e-4, at the
 * same resolution. The reasoning was inverted. Near the first zero J1(x) is approximately J1'(x0)(x - x0), so
 * the INTENSITY, going as J1^2, is very nearly an exact parabola there -- which is the one shape a parabola fits
 * perfectly. The amplitude |J1| is a V with a corner at the zero, and fitting a parabola through a corner is
 * precisely what you should not do. The argument sounded like conditioning and was actually a claim about
 * smoothness, pointed the wrong way.
 *
 * Kept as a comment rather than quietly corrected because the plausible-sounding version is the one a reader
 * would reach for next.
 */
export function firstMinimumRefined(pattern, sinThetas) {
    for (let i = 2; i < pattern.length - 1; i++) {
        if (pattern[i] < pattern[i - 1] && pattern[i] <= pattern[i + 1]) {
            const y0 = pattern[i - 1], y1 = pattern[i], y2 = pattern[i + 1];
            const denom = y0 - 2 * y1 + y2;
            // A flat or non-convex triple has no vertex to speak of; fall back to the raw sample rather than
            // dividing by something near zero and inventing a position.
            if (!(Math.abs(denom) > 1e-300)) return sinThetas[i];
            const delta = 0.5 * (y0 - y2) / denom;          // vertex offset in samples, nominally within +/-0.5
            if (!(Math.abs(delta) <= 1)) return sinThetas[i];
            const h = sinThetas[i + 1] - sinThetas[i];
            return sinThetas[i] + delta * h;
        }
    }
    return null;
}

/** rayleighFactor with the refined estimator, and its error against the EXACT ring rather than a rounded one. */
export function airyMetrics(pattern, sinThetas, lambda, D) {
    const raw = (() => {
        for (let i = 2; i < pattern.length - 1; i++)
            if (pattern[i] < pattern[i - 1] && pattern[i] <= pattern[i + 1]) return sinThetas[i];
        return null;
    })();
    const refined = firstMinimumRefined(pattern, sinThetas);
    if (raw == null || refined == null) return null;
    const unit = lambda / D;
    const factorRaw = raw / unit, factorRefined = refined / unit;
    return {
        factorRaw, factorRefined,
        errRawVsRounded: Math.abs(factorRaw - 1.22) / 1.22,
        errRawVsExact: Math.abs(factorRaw - AIRY_FIRST_RING) / AIRY_FIRST_RING,
        errRefinedVsExact: Math.abs(factorRefined - AIRY_FIRST_RING) / AIRY_FIRST_RING,
    };
}
