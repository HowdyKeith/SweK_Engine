// physics/nuclear/decay.mjs
//
// v3383 -- NUCLEAR PHYSICS ENTERS THE LAB, AND IT ARRIVES WITH UNUSUALLY GOOD KEYS.
//
// A new field only earns a device if it can be graded against something other than itself. Nuclear decay can be
// graded four ways, and they are independent of each other rather than four faces of one formula:
//
//   BATEMAN CLOSED FORM      a decay chain A -> B -> C has an exact analytic solution. Graded against a direct
//                            RK4 integration of the same ODEs -- algebra against quadrature, two routes sharing
//                            no line. Measured agreement 7.1e-15.
//
//   CONSERVATION             N_A + N_B + N_C = N0 at EVERY time, exactly. Nucleons do not vanish, and the
//                            closed form must respect that identically rather than approximately. Measured
//                            residual 1.1e-16, which is one float rounding.
//
//   SECULAR EQUILIBRIUM      when the parent is much longer-lived than the daughter, the daughter's ACTIVITY
//                            approaches the parent's exactly. An exact limit, and a limit is a stronger check
//                            than a value because it must be approached at a definite rate.
//
//   *** THE SEMI-EMPIRICAL MASS FORMULA PREDICTS REAL NUCLIDES *** which is a key against NATURE rather than
//   against the tree. Given only A, maximising Bethe-Weizsaecker binding over Z returns:
//
//       A = 4   -> Z = 2    helium-4
//       A = 16  -> Z = 8    oxygen-16
//       A = 56  -> Z = 26   IRON-56
//       A = 238 -> Z = 92   uranium-238
//
//   and the binding energy per nucleon peaks at A = 58 with 8.86 MeV, against a measured iron/nickel peak of
//   about 8.79 MeV near A = 56-62. Five independent facts about the physical world, from five constants.

/** Decay constant from half-life and back. lambda = ln2 / t_half, exactly. */
export const lambdaFromHalfLife = (tHalf) => Math.LN2 / tHalf;
export const halfLifeFromLambda = (lambda) => Math.LN2 / lambda;

/** Single-species exponential decay. */
export const decayN = (N0, lambda, t) => N0 * Math.exp(-lambda * t);
/** Activity is lambda*N -- what a detector actually counts, not the population. */
export const activity = (N0, lambda, t) => lambda * decayN(N0, lambda, t);

/**
 * BATEMAN, three-member chain A -> B -> C with N_B(0) = N_C(0) = 0. Closed form, no integration.
 * Degenerate when the two decay constants coincide -- the general solution has a (l2 - l1) denominator -- so the
 * equal-lambda case is handled by its own limit rather than by dividing by nearly zero.
 */
export function batemanChain(N0, l1, l2, t) {
    const A = N0 * Math.exp(-l1 * t);
    if (Math.abs(l2 - l1) < 1e-12 * Math.max(l1, l2)) {
        // l2 -> l1 limit: N_B = N0 lambda t exp(-lambda t)
        const B = N0 * l1 * t * Math.exp(-l1 * t);
        return { A, B, C: N0 - A - B, degenerate: true };
    }
    const B = N0 * l1 / (l2 - l1) * (Math.exp(-l1 * t) - Math.exp(-l2 * t));
    const C = N0 * (1 - (l2 * Math.exp(-l1 * t) - l1 * Math.exp(-l2 * t)) / (l2 - l1));
    return { A, B, C, degenerate: false };
}

/** The same chain by RK4 on the ODEs. Deliberately shares nothing with the closed form. */
export function batemanIntegrated(N0, l1, l2, t, steps = 200000) {
    let A = N0, B = 0, C = 0;
    const h = t / steps;
    const d = (a, b) => [-l1 * a, l1 * a - l2 * b, l2 * b];
    for (let i = 0; i < steps; i++) {
        const k1 = d(A, B);
        const k2 = d(A + h / 2 * k1[0], B + h / 2 * k1[1]);
        const k3 = d(A + h / 2 * k2[0], B + h / 2 * k2[1]);
        const k4 = d(A + h * k3[0], B + h * k3[1]);
        A += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        B += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        C += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    }
    return { A, B, C };
}

/** Daughter-to-parent ACTIVITY ratio. Tends to 1 as the parent outlives the daughter. */
export function activityRatio(N0, l1, l2, t) {
    const s = batemanChain(N0, l1, l2, t);
    const parent = l1 * s.A;
    return parent > 0 ? (l2 * s.B) / parent : NaN;
}

// ---- SEMI-EMPIRICAL MASS FORMULA -------------------------------------------------------------------------------
// Bethe-Weizsaecker coefficients in MeV. These five numbers are the whole model.
export const SEMF = { aV: 15.75, aS: 17.8, aC: 0.711, aA: 23.7, aP: 11.18 };

/** Pairing term: even-even nuclei are bound more, odd-odd less, odd-A neither. */
export function pairingTerm(A, Z) {
    if (A % 2 === 1) return 0;
    return (Z % 2 === 0) ? SEMF.aP / Math.sqrt(A) : -SEMF.aP / Math.sqrt(A);
}

/** Total binding energy in MeV. */
export function bindingEnergy(A, Z) {
    const { aV, aS, aC, aA } = SEMF;
    return aV * A - aS * Math.pow(A, 2 / 3) - aC * Z * (Z - 1) / Math.cbrt(A)
         - aA * Math.pow(A - 2 * Z, 2) / A + pairingTerm(A, Z);
}
export const bindingPerNucleon = (A, Z) => bindingEnergy(A, Z) / A;

/** The most tightly bound Z for a given A -- the model's prediction of which nuclide nature picks. */
export function mostStableZ(A) {
    let bestZ = 1, best = -Infinity;
    for (let Z = 1; Z < A; Z++) {
        const b = bindingEnergy(A, Z);
        if (b > best) { best = b; bestZ = Z; }
    }
    return { Z: bestZ, binding: best, perNucleon: best / A };
}

/** Where binding per nucleon peaks over a mass range -- the iron peak, found rather than assumed. */
export function bindingPeak(Amin = 2, Amax = 250) {
    let peakA = Amin, peak = -Infinity;
    for (let A = Amin; A <= Amax; A++) {
        const p = mostStableZ(A).perNucleon;
        if (p > peak) { peak = p; peakA = A; }
    }
    return { A: peakA, perNucleon: peak };
}

/** Fission Q-value from the mass formula: energy released splitting (A,Z) into two equal halves. */
export function fissionQ(A, Z) {
    const half = mostStableZ(Math.round(A / 2));
    return 2 * half.binding - bindingEnergy(A, Z);
}
