// tools/roundhouse/conservation.mjs
//
// v3434 -- FORTY-THREE SELFCHECKS AUDIT A CONSERVED QUANTITY, EACH WITH ITS OWN LOOP AND ITS OWN TOLERANCE.
//
// Nucleon number in Bateman chains, momentum under periodic boundaries, mass in the fluid devices, energy in
// every integrator, phase-space volume in HMC, speed under a magnetic force. All the same question and no
// shared instrument, so each answers it slightly differently and none of them answers the part that matters.
//
// *** THE PART THAT MATTERS IS NOT HOW MUCH A QUANTITY DRIFTED, IT IS WHETHER THE DRIFT GROWS. ***
//
// Measured on the kepler device, same orbit, 4000 steps, energy relative to its initial value:
//
//     integrator   max|dE| first half   second half   growth
//     Verlet       2.72e-5              2.72e-5       1.000     <- BOUNDED. Oscillates forever, never widens
//     RK4          3.45e-10             4.74e-10      1.374     <- SECULAR. Fifty thousand times smaller and
//                                                                  getting worse
//
// An endpoint check ranks RK4 the better integrator by five orders of magnitude. Run it long enough and Verlet
// is the only one still describing an orbit. That distinction is invisible to every one of the forty-three
// hand-written checks, because they all compare the start against the end.
//
// EXACT IS REPORTED SEPARATELY FROM SMALL. A quantity that never changes a bit -- nucleon number in a Bateman
// chain, momentum under equal-and-opposite pair forces -- is conserved by CONSTRUCTION, and calling that
// "conserved to 1e-16" understates it and invites someone to loosen the tolerance later.
//
// THE HONEST LIMIT, stated because it bounds every verdict here: a short run cannot distinguish slow secular
// drift from bounded oscillation. The growth ratio over N steps only sees drift with a timescale under N. A
// verdict of BOUNDED means "no growth visible in this run", never "bounded forever", and boundedFor records how
// long the run actually was.

/** Was the quantity literally unchanged? Checked before any tolerance, because exact and small are different. */
export const isExact = (series) => series.length > 1 && series.every((v) => v === series[0]);

/**
 * Audit a time series of a supposedly conserved quantity.
 *
 * The verdict compares the worst excursion in the FIRST half of the run against the worst in the SECOND. A
 * symplectic integrator's error oscillates within an envelope, so the two halves match; a dissipative or
 * accumulating scheme widens, so the second exceeds the first.
 */
export function auditConservation(series, { growthLimit = 1.15 } = {}) {
    if (!Array.isArray(series) || series.length < 4) {
        return { verdict: "too-short", reason: "need at least four samples to compare halves" };
    }
    const q0 = series[0];
    if (isExact(series)) {
        return { verdict: "exact", maxDrift: 0, relDrift: 0, growth: 1, boundedFor: series.length,
                 reason: "every sample bit-identical to the first -- conserved by construction, not to a tolerance" };
    }

    const dev = series.map((v) => Math.abs(v - q0));
    const mid = Math.floor(series.length / 2);
    const firstHalf = Math.max(...dev.slice(0, mid));
    const secondHalf = Math.max(...dev.slice(mid));
    const growth = firstHalf > 0 ? secondHalf / firstHalf : (secondHalf > 0 ? Infinity : 1);
    const maxDrift = Math.max(firstHalf, secondHalf);
    const scale = Math.abs(q0) > 0 ? Math.abs(q0) : 1;

    const bounded = growth <= growthLimit;
    return {
        verdict: bounded ? "bounded" : "secular",
        maxDrift, relDrift: maxDrift / scale,
        firstHalf, secondHalf, growth,
        boundedFor: bounded ? series.length : null,
        reason: bounded
            ? `no growth over ${series.length} samples (${growth.toFixed(3)}x between halves) -- bounded FOR THIS RUN, ` +
              "which is not the same as bounded forever"
            : `worst excursion grew ${growth.toFixed(3)}x from the first half to the second -- accumulating`,
    };
}

/**
 * Compare two schemes on the same conserved quantity.
 * Reports the trap explicitly: a scheme can have a far SMALLER drift and a far WORSE long-run behaviour, and
 * ranking on drift alone gets it backwards.
 */
export function compareConservation(labelA, seriesA, labelB, seriesB, opts = {}) {
    const A = auditConservation(seriesA, opts), B = auditConservation(seriesB, opts);
    const smaller = (A.maxDrift ?? Infinity) <= (B.maxDrift ?? Infinity) ? labelA : labelB;
    const better = A.verdict === "secular" && B.verdict !== "secular" ? labelB
                 : B.verdict === "secular" && A.verdict !== "secular" ? labelA : null;
    return {
        [labelA]: A, [labelB]: B,
        smallerDrift: smaller, betterLongRun: better,
        rankingInverted: !!better && better !== smaller,
        reason: better && better !== smaller
            ? `${smaller} has the smaller drift and ${better} has the bounded one -- ranking on drift alone is backwards here`
            : "drift size and long-run behaviour agree on this pair",
    };
}
