// tools/roundhouse/fermiBind.mjs
//
// THE DEGENERATE FERMI GAS JOINS THE ROUNDHOUSE -- the mirror of bec, and the fourth thermal rung. Bosons pile
// into one ground state; fermions cannot share a state at all, so at T = 0 they stack the energy ladder to a
// sharp ceiling and STILL push. That degeneracy pressure is what holds up a white dwarf.
//
// *** THE CROSS-MODULE KEY IS ONE SIGN IN A DENOMINATOR, AND IT IS EXACT. *** The Bose integral runs over
// e^x - 1 and the Fermi integral over e^x + 1. That single sign turns Riemann's zeta into Dirichlet's ETA:
//
//     INT_0^inf x^(s-1)/(e^x + 1) dx     Gamma(s) eta(s)
//     ------------------------------  =  ---------------  =  eta(s)/zeta(s)  =  1 - 2^(1-s)
//     INT_0^inf x^(s-1)/(e^x - 1) dx     Gamma(s) zeta(s)
//
// The denominator of that ratio is BLACKBODY'S boseIntegral -- the same quadrature debye's low-T slope rides on
// -- so mirrorRatio is a number this module and a radiation module compute jointly and neither owns. Measured
// 0.500000000000 at s=2, 0.750000000000 at s=3, against 1 - 2^(1-s) to within 1e-14. A quadrature that drifted
// on either side would break the ratio while both integrals still looked individually plausible.
//
// *** THE PLANT IS A REAL PRE-QUANTUM PARADOX, AND IT IS THE SAME SHAPE AS debye's EINSTEIN. *** Classical
// equipartition says every electron carries (3/2)k, so a metal's 10^23 conduction electrons should dominate its
// heat capacity. THEY DO NOT. Only the sliver within ~kT of the Fermi surface can be excited -- a fraction
// ~T/T_F -- so the electronic term is (pi^2/2)(T/T_F), LINEAR in T rather than constant. With T_F ~ 10^4-10^5 K
// the classical answer is measured here at 304x too large at T/T_F = 0.001. plantKind METHOD: the statistics are
// swapped, the inputs and readings are not.
//
// AND THE T = 0 STRUCTURE IS BLIND TO IT, WHICH IS WHY BOTH HALVES ARE GRADED. The Fermi sphere filled solid
// gives <E> = (3/5)E_F and P = (2/5)n E_F and therefore P = (2/3)(U/V) and the n^{5/3} polytrope -- pure
// fractions, none of them thermal, all bit-identical under a heat-capacity plant. A device that only checked the
// ground state would certify a gas whose electrons heat like billiard balls.

import {
    fermiIntegral, fermiIntegralClosed, etaDirichlet,
    groundEnergyPerParticle, degeneracyPressure, POLYTROPE_EXPONENT,
    fermiCv, classicalCv, sommerfeldCoefficient,
} from "../../physics/thermal/fermi.mjs";
import { boseIntegral } from "../../physics/thermal/blackbody.mjs";
import { zeta } from "../../physics/zeta.js";

export const FERMI_OBSERVABLES = [
    "fermiInt2", "fermiInt2Closed", "fermiInt2Rel",
    "mirrorRatio", "mirrorPredicted", "mirrorRel",
    "groundFraction", "pressureFraction", "pressureOverEnergyDensity", "polytropeExponent",
    "cvLow", "cvHigh", "sommerfeldLinearityRel", "classicalOverFermi",
];

const DEF = { s: 3, tLow: 0.001, tHigh: 0.002 };

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

function buildFermi({ mode = "degenerate", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT: classical equipartition replaces Fermi-Dirac statistics. Every electron carries (3/2)k, which is
    // what everyone believed before the quantum theory of metals and what measurement refused.
    const cv = config.planted ? () => classicalCv() : fermiCv;

    const q2 = fermiIntegral(2);
    const ratio = fermiIntegral(c.s) / boseIntegral(c.s);

    const lo = cv(c.tLow), hi = cv(c.tHigh);

    return {
        // Three routes to the same integral: quadrature, Gamma(s)eta(s), and eta's alternating form inside it.
        fermiInt2: q2, fermiInt2Closed: fermiIntegralClosed(2), fermiInt2Rel: rel(q2, fermiIntegralClosed(2)),

        // The one-sign mirror, with the denominator computed by blackbody.
        mirrorRatio: ratio,
        // eta(s)/zeta(s) from the two FUNCTIONS, not from the algebraic shortcut. The first draft wrote
        // eta/(eta/(1-2^(1-s))), which simplifies to the closed form and therefore only LOOKED derived -- a
        // second route that is secretly the first route is worse than no second route, because it reports
        // agreement it never tested.
        mirrorPredicted: etaDirichlet(c.s) / zeta(c.s),
        mirrorRel: rel(ratio, etaDirichlet(c.s) / zeta(c.s)),

        // T = 0: pure fractions, and blind to any thermal plant.
        groundFraction: groundEnergyPerParticle(1),
        pressureFraction: degeneracyPressure(1, 1),
        pressureOverEnergyDensity: degeneracyPressure(1, 1) / groundEnergyPerParticle(1),
        polytropeExponent: POLYTROPE_EXPONENT,

        // Sommerfeld: LINEAR in T, so doubling T doubles C_V exactly. Constant under the plant, so the ratio is 1.
        cvLow: lo, cvHigh: hi,
        sommerfeldLinearityRel: rel(hi / lo, c.tHigh / c.tLow),
        // The SIZE of the paradox, and it is blind to the plant BY CONSTRUCTION: it always compares the classical
        // answer against the honest Sommerfeld one, because it is reporting a fixed physical fact rather than
        // discriminating. Stated here so nobody reads its stillness as a gap.
        classicalOverFermi: classicalCv() / fermiCv(c.tLow),
    };
}

const FERMI_MODES = ["degenerate"];   // v4074 -- the single source `modes` and `defaults()` both read

export const fermiDevice = {
    plantKind: "method",
    modes: FERMI_MODES,
    name: "degenerate-fermi-gas-vs-equipartition",
    observables: FERMI_OBSERVABLES,
    build: buildFermi,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "degenerate"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: FERMI_MODES.includes(mode) ? mode : FERMI_MODES[0], config: { ...DEF } }),
};
