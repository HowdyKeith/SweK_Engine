// WebGLEngine/physics/particle/invariants.mjs -- v3425
//
// FOUR-MOMENTUM KINEMATICS, WHICH IS THE SUBSTRATE EVERY OTHER ASTROPARTICLE QUESTION SITS ON.
//
// *** THE POINT OF THIS FILE IS ONE SENTENCE: THE INVARIANT MASS OF A SYSTEM DOES NOT CHANGE WHEN YOU BOOST IT.
// *** s = (sum E)^2 - |sum p|^2 is the same number in every frame, and that is not a tolerance -- it is an
// identity, checkable to the last bit. Almost everything anybody wants to ask about a cosmic-ray collision is
// really "what is s here", and almost every way of getting it wrong is really "I added lab-frame energies".
//
// EVERYTHING IS PARAMETERISED BY beta RATHER THAN RAPIDITY, so gamma = 1/sqrt(1 - beta^2) and the whole file is
// +,-,*,/ and sqrt. NO TRANSCENDENTAL -- deterministic and cross-arch, foldable into the fingerprint. Rapidity
// would have been algebraically tidier (boosts just add) and would have cost a tanh and an atanh for it; the
// composition law below recovers that additivity from arithmetic instead.
//
// UNITS ARE LEFT TO THE CALLER AND c = 1 THROUGHOUT. Mixing a c into some terms and not others is the classic
// way this algebra goes wrong, so there is no c to mix.

/** gamma from beta. Refuses |beta| >= 1: there is no frame moving at the speed of light to boost into. */
export function gammaOf(beta) {
    const b2 = beta * beta;
    if (!(b2 < 1)) return NaN;
    return 1 / Math.sqrt(1 - b2);
}

/** A massive particle of mass m moving with speed beta along a unit direction. */
export function fromMassBeta(m, beta, dir = [1, 0, 0]) {
    const g = gammaOf(beta), p = g * m * beta;
    const n = norm(dir);
    return { E: g * m, px: p * n[0], py: p * n[1], pz: p * n[2] };
}

/** A massless particle (photon) of energy E along a unit direction: |p| = E exactly. */
export function massless(E, dir = [1, 0, 0]) {
    const n = norm(dir);
    return { E, px: E * n[0], py: E * n[1], pz: E * n[2] };
}

function norm(d) {
    const L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    return L === 0 ? [0, 0, 0] : [d[0] / L, d[1] / L, d[2] / L];
}

export const add = (...ps) => ps.reduce((a, p) => ({ E: a.E + p.E, px: a.px + p.px, py: a.py + p.py, pz: a.pz + p.pz }),
                                        { E: 0, px: 0, py: 0, pz: 0 });

/** m^2 = E^2 - |p|^2 for one four-momentum. Returns the SQUARE: near-massless systems make the root lossy. */
export const massSq = (p) => p.E * p.E - (p.px * p.px + p.py * p.py + p.pz * p.pz);

/** The Mandelstam s of a system: the invariant mass squared of the sum. THE quantity this file exists for. */
export const invariantS = (ps) => massSq(add(...ps));

/**
 * *** THE SAME s BY THE EXPANDED FORM, AND IT IS NOT THE SAME NUMBER WHEN THE ENERGIES ARE FAR APART. ***
 * s = m1^2 + m2^2 + 2(E1 E2 - p1.p2) is algebraically identical to squaring the sum, and numerically it is a
 * different thing entirely: summing first ADDS A 1e-12 GeV PHOTON TO A 1e11 GeV PROTON, and the photon is
 * twenty-three orders below the ulp of the proton, so IT VANISHES BEFORE THE SQUARING EVER HAPPENS. The whole
 * interaction is the cross term, and the naive route throws it away and returns a clean, plausible m_p^2.
 *
 * This is not a tolerance question and it is not a small error: it is total loss of the physics, and it is
 * silent. The expanded form keeps E1 E2 as a PRODUCT of two well-scaled numbers, which is exactly the term that
 * matters. Use this one whenever the energies span orders; they agree to machine precision when they do not.
 */
export function invariantSPair(a, b) {
    return massSq(a) + massSq(b) + 2 * (a.E * b.E - (a.px * b.px + a.py * b.py + a.pz * b.pz));
}

/**
 * Lorentz boost along x by beta. The MIXING IS THE PHYSICS: energy and the along-axis momentum rotate into each
 * other, and the transverse components do not move at all.
 *
 * `wrong: true` keeps the momentum transformation and leaves the energy alone -- E' = gamma E rather than
 * gamma(E - beta p). *** THAT IS THE PLAUSIBLE WRONG DERIVATION, NOT A NUDGED CONSTANT: it is what you write if
 * you think of the boost as "scale everything by gamma", it is EXACTLY RIGHT AT beta = 0, and it breaks the mass
 * shell and the invariance together. ***
 */
export function boostX(p, beta, { wrong = false } = {}) {
    const g = gammaOf(beta);
    return {
        E: wrong ? g * p.E : g * (p.E - beta * p.px),
        px: g * (p.px - beta * p.E),
        py: p.py, pz: p.pz,
    };
}

/** Relativistic velocity addition. Boosting by b1 then b2 is ONE boost by this. */
export const addBeta = (b1, b2) => (b1 + b2) / (1 + b1 * b2);

/**
 * The lab-frame energy at which a head-on collision with a massless particle of energy Eg first opens a channel
 * whose products have total mass mOut, for a target of mass mIn. CLOSED FORM, and it is a genuinely independent
 * route to the same number the s-bisection finds.
 *
 * Head-on: s = mIn^2 + 2 Eg (E + p). Threshold s = mOut^2 gives E + p = (mOut^2 - mIn^2)/(2 Eg) = x, and since
 * p = sqrt(E^2 - mIn^2) that inverts to E = (x^2 + mIn^2)/(2x).
 */
/**
 * *** s FOR A HEAD-ON PHOTON COLLISION, CARRYING THE MASS INSTEAD OF RECOVERING IT -- AND THIS IS THE ONLY ONE
 * OF THE THREE ROUTES THAT SURVIVES THE REAL PROBLEM. *** At a cosmic-ray energy of 1e11 GeV the general vector
 * route dies TWICE, and both deaths are silent:
 *
 *   BUILDING the four-momentum, p = sqrt(E^2 - m^2) rounds to E exactly, because m^2 is twenty-three orders
 *   below E^2. The particle is then ON THE MASSLESS SHELL, and E^2 - p^2 recovers ZERO rather than m^2.
 *   SUMMING it with the photon, E + Eg rounds to E, because Eg is below the ulp of E. THE PHOTON VANISHES
 *   BEFORE THE SQUARING EVER HAPPENS, and s comes back as a clean, plausible number with no interaction in it.
 *
 * Measured: squaring the sum returns EXACTLY 0.0 at that energy. Not a tolerance, not a small error -- total
 * loss of the physics, silently. This form keeps m^2 as the literal it was given and Eg*(E + p) as a product of
 * well-scaled numbers, which are the two terms that matter.
 */
export function sHeadOnPhoton(mIn, E, Eg) {
    const p = Math.sqrt(Math.max(0, E * E - mIn * mIn));
    return mIn * mIn + 2 * Eg * (E + p);
}

export function thresholdHeadOn(mIn, mOut, Eg) {
    const x = (mOut * mOut - mIn * mIn) / (2 * Eg);
    return (x * x + mIn * mIn) / (2 * x);
}

/**
 * *** THE NAIVE CENTRE-OF-MASS ENERGY, EXPORTED SO IT CAN BE MEASURED RATHER THAN WARNED ABOUT. *** Adding the
 * lab energies is right in the centre-of-mass frame and nowhere else. It agrees with sqrt(s) EXACTLY when
 * nothing is moving and diverges without bound as the boost grows -- told apart by HOW IT SCALES, not by size.
 */
export const naiveEcm = (ps) => ps.reduce((a, p) => a + p.E, 0);
