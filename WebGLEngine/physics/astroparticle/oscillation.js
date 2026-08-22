// WebGLEngine/physics/astroparticle/oscillation.js — v3426
// ---------------------------------------------------------------------------------------------------------------
// TWO-FLAVOUR NEUTRINO OSCILLATION — where the interesting key is an identity that holds no matter how wrong
// everything else is.
//
// A neutrino produced as one flavour arrives as a superposition, and the survival probability is
//
//     P(nu_a -> nu_a) = 1 - sin^2(2 theta) sin^2( 1.267 * dm2[eV^2] * L[km] / E[GeV] )
//
// *** AND THAT 1.267 IS NOT A FITTED NUMBER. *** It is what dm2 L / (4 E) becomes once the units are the ones
// experimentalists actually use, and it comes out of hbar c and nothing else:
//
//     dm2 L / (4 E)  ->  (1 eV^2)(1 km) / (4 * 1 GeV) / (hbar c)  =  1.2669...
//
// So it is DERIVED HERE FROM hbar c AND NEVER TYPED. A constant typed in is a constant nobody can check; a
// constant derived is one the gate can re-derive and disagree with. This tree has been bitten by the other kind
// -- v3378's FBP gain looked like a filter constant and turned out to be a sampling ratio, and img2threejs's
// 0.85 was a threshold tuned on photographs of knives.
//
// *** THE THREE KEYS, AND WHY DROPPING THE 1.267 LEAVES TWO OF THEM BLIND. ***
//
//   UNITARITY   -- P(survive) + P(transition) = 1, EXACTLY, at every energy, baseline, angle and mass splitting.
//                  It is sin^2 + cos^2 written in physics notation, so it holds even if the phase is nonsense.
//                  A wrong conversion factor CANNOT break it.
//   AMPLITUDE   -- the deepest dip reaches exactly 1 - sin^2(2 theta), which depends on the MIXING ANGLE alone.
//                  The phase decides WHERE the dip is, not how deep, so a wrong 1.267 leaves this untouched too.
//   PHASE       -- the first oscillation minimum sits at L/E = pi / (2 * 1.267 * dm2). THIS is the only one of
//                  the three that can see the constant, and it is the one an experiment actually measures.
//
// Two of the three keys pass perfectly with the 1.267 deleted. That is not a flaw in the keys -- unitarity and
// amplitude are true statements and worth checking -- it is a demonstration that a suite can be green while the
// physics is wrong by a factor, and that the check which sees it has to be chosen deliberately.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

// ---- the constant, derived ---------------------------------------------------------------------------------
// hbar c in eV*m, from the defined SI values. hbar = h/2pi with h exact by definition of the kilogram, and c
// exact by definition of the metre, so this carries no experimental uncertainty at all.
export const H_PLANCK = 6.62607015e-34;      // J*s, exact (SI definition)
export const C_LIGHT = 299792458;            // m/s, exact (SI definition)
export const ELEM_CHARGE = 1.602176634e-19;  // C, exact (SI definition)

/** hbar*c expressed in eV*m: (h/2pi) * c / e. Every input is an exact SI constant. */
export const HBAR_C_EV_M = (H_PLANCK / (2 * Math.PI)) * C_LIGHT / ELEM_CHARGE;

/**
 * The oscillation coefficient, DERIVED. dm2 L / (4E) with dm2 in eV^2, L in km, E in GeV:
 *
 *     [eV^2][km] / [GeV]  =  eV^2 * 1e3 m / 1e9 eV  =  1e-6 * eV * m
 *
 * and dividing by 4 hbar c (in eV*m) leaves a pure number.
 */
export const OSC_COEFF = 1e-6 / (4 * HBAR_C_EV_M);

/** Survival probability. `coeff` is injectable ONLY so the gate can show what dropping it does. */
export function survival({ theta, dm2, L, E, coeff = OSC_COEFF }) {
    const phase = coeff * dm2 * L / E;
    const s2 = Math.sin(2 * theta);
    return 1 - s2 * s2 * Math.sin(phase) * Math.sin(phase);
}

/** Transition probability, computed INDEPENDENTLY rather than as 1 - survival, so unitarity is a real test. */
export function transition({ theta, dm2, L, E, coeff = OSC_COEFF }) {
    const phase = coeff * dm2 * L / E;
    const s2 = Math.sin(2 * theta);
    return s2 * s2 * Math.sin(phase) * Math.sin(phase);
}

/** The deepest the survival probability ever gets: set by the mixing angle alone. */
export const minSurvival = (theta) => 1 - Math.pow(Math.sin(2 * theta), 2);

/** L/E at the first oscillation maximum (deepest first dip), where the phase equals pi/2. */
export const firstMinimumLE = (dm2, coeff = OSC_COEFF) => (Math.PI / 2) / (coeff * dm2);

/** Scan L/E and return the first minimum found numerically, so the closed form above is checked against a search. */
export function findFirstMinimum({ theta, dm2, coeff = OSC_COEFF, loLE = 1, hiLE = 4000, samples = 200000 }) {
    let best = Infinity, bestLE = null;
    for (let i = 1; i <= samples; i++) {
        const LE = loLE + (hiLE - loLE) * i / samples;
        const p = survival({ theta, dm2, L: LE, E: 1, coeff });
        if (p < best) { best = p; bestLE = LE; }
        else if (bestLE !== null && p > best + 1e-12 && best < 0.999) break;   // passed the first dip
    }
    return { LE: bestLE, p: best };
}
