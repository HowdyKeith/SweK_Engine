// physics/thermal/fermi.mjs -- v3815
//
// THE DEGENERATE FERMI GAS -- THE MIRROR OF BOSE-EINSTEIN CONDENSATION. Bosons at low temperature pile into ONE
// ground state (bec.mjs); fermions cannot share a state at all (Pauli), so at T = 0 they stack up the energy
// ladder to a sharp ceiling, the Fermi energy, and STILL push -- a degeneracy pressure that survives to absolute
// zero. That pressure is what holds up a white dwarf, and physics/whiteDwarf.js already computes the astrophysical
// consequence (the Chandrasekhar mass, the backwards mass-radius law); THIS file is the microscopic thermodynamics
// underneath it, and the P proportional to n^{5/3} it derives is exactly the non-relativistic polytrope that
// whiteDwarf's R proportional to M^{-1/3} scaling rides on.
//
// The statistics differ from the Bose case by ONE SIGN in the denominator -- e^x + 1 instead of e^x - 1 -- and
// that sign turns Riemann's zeta into Dirichlet's ETA (the alternating zeta): the Fermi integral is
// INT_0^inf x^{s-1}/(e^x + 1) dx = Gamma(s) eta(s) = Gamma(s) (1 - 2^{1-s}) zeta(s), where the Bose integral was
// Gamma(s) zeta(s). So this round reuses the SAME Gamma and the SAME real-s zeta (v3812) as bec.mjs, wrapped in
// the alternating factor. k_B = 1 throughout.
//
// *** THE KEYS, ALL EXACT AND NONE FED TO THE MODEL:
//   1. THE FERMI INTEGRAL = Gamma(s) eta(s). At s = 2 it is exactly pi^2/12; at half-integer s it needs the real-s
//      zeta v3812 added. Graded three ways: the quadrature, Gamma*eta, and eta's own alternating sum.
//   2. T = 0: the average energy per fermion is (3/5) E_F and the pressure is (2/5) n E_F -- the Fermi sphere
//      filled solid. Both are pure fractions, and together they give P = (2/3)(U/V) and the n^{5/3} polytrope.
//   3. THE SOMMERFELD HEAT CAPACITY C_V/(Nk) = (pi^2/2)(T/T_F), LINEAR in T, whose coefficient descends from the
//      Sommerfeld-expansion pi^2/6 = zeta(2). Only the sliver of electrons within ~kT of the Fermi surface can be
//      excited, a fraction ~T/T_F, which is the whole reason a metal's electrons barely heat.
//
// *** THE LOAD-BEARING NEGATIVE IS A REAL PRE-QUANTUM PARADOX: classical equipartition says every electron carries
// (3/2)k, so a metal's 10^23 conduction electrons should dominate its heat capacity. They do not -- the measured
// electronic term is ~(pi^2/2)(T/T_F), a hundredth of that at room temperature because T_F ~ 10^4-10^5 K. The
// resolution IS the Fermi statistics; a plant using the classical constant instead of the linear law is caught by
// orders of magnitude at low T. And it is the Fermi MIRROR of bec's negative: there the classical gas failed to
// CONDENSE, here it fails to STAY COLD.
//
// BROWSER-SAFE: imports ../md/maxwellSpeed.mjs and ../zeta.js; no node builtins, no DOM.

import { gammaFn } from "../md/maxwellSpeed.mjs";     // Gamma
import { zeta } from "../zeta.js";                    // real-s zeta (v3812)

// The Dirichlet eta (alternating zeta): eta(s) = (1 - 2^{1-s}) zeta(s) = sum (-1)^{n-1}/n^s. At s = 1 the prefactor
// is 0 and zeta(1) diverges; the removable value is the alternating harmonic series, eta(1) = ln 2.
export const etaDirichlet = (s) => (s === 1 ? Math.LN2 : (1 - Math.pow(2, 1 - s)) * zeta(s));

// The Fermi-Dirac integral INT_0^inf x^{s-1}/(e^x + 1) dx, via x = t^2 (dx = 2t dt) so the s = 3/2 sqrt-cusp at
// the origin is smoothed the same way blackbody's Bose integral is. The e^x + 1 denominator never vanishes, so
// there is no singularity to regularise -- the substitution is only for quadrature accuracy at half-integer s.
export function fermiIntegral(s, { tMax = 9, steps = 400000 } = {}) {
    // t -> 0 limit of 2 t^{2s-1}/(e^{t^2}+1): the denominator -> 2 (no cancellation, unlike the Bose case), so the
    // integrand -> 0 for every s > 1/2. (This is the whole numerical difference from blackbody's boseIntegral.)
    const f = (t) => (t <= 0 ? 0 : 2 * Math.pow(t, 2 * s - 1) / (Math.exp(t * t) + 1));
    const h = tMax / steps;
    let sum = f(0) + f(tMax);
    for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * f(i * h);
    return (h / 3) * sum;
}
// The closed form of that integral, reached through Gamma and the alternating zeta.
export const fermiIntegralClosed = (s) => gammaFn(s) * etaDirichlet(s);

// The complete Fermi-Dirac function f_s(z) = (1/Gamma(s)) INT_0^inf x^{s-1}/(z^{-1} e^x + 1) dx, the finite-fugacity
// generalisation of the z = 1 integral above (f_s(1) = eta(s)). Unlike the Bose polylog it is valid for ALL z > 0,
// not just z <= 1 -- a degenerate Fermi gas has z >> 1 -- so it is written as the integral, not a series, with the
// upper limit reaching past the Fermi step at t ~ sqrt(ln z). This is what chemicalPotential.mjs inverts for mu(T).
export function fermiFunction(s, z, { steps = 400000 } = {}) {
    if (z <= 0) return 0;
    const tMax = Math.max(9, Math.sqrt(Math.max(0, Math.log(z))) + 5);
    const f = (t) => (t <= 0 ? 0 : 2 * Math.pow(t, 2 * s - 1) / (Math.exp(t * t) / z + 1));
    const h = tMax / steps;
    let sum = f(0) + f(tMax);
    for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * f(i * h);
    return (h / 3) * sum / gammaFn(s);
}

// Density -> Fermi energy: E_F = (hbar^2/2m)(3 pi^2 n)^{2/3}. The dimensionless coefficient is (3 pi^2)^{2/3}.
export const fermiEnergyCoefficient = () => Math.pow(3 * Math.PI * Math.PI, 2 / 3);

// T = 0 thermodynamics per fermion (in units of E_F, and pressure in units of n E_F).
export const groundEnergyPerParticle = (EF) => (3 / 5) * EF;      // <E> = 3/5 E_F
export const degeneracyPressure = (n, EF) => (2 / 5) * n * EF;    // P = 2/5 n E_F  (= 2/3 * U/V)
export const POLYTROPE_EXPONENT = 5 / 3;                          // P proportional to n^{5/3} since E_F ~ n^{2/3}

// Low-temperature (Sommerfeld) heat capacity, LINEAR in T: C_V/(Nk) = (pi^2/2)(T/T_F).
export const sommerfeldCoefficient = () => Math.PI * Math.PI / 2; // pi^2/2
export const fermiCv = (ToverTF) => (Math.PI * Math.PI / 2) * ToverTF;

// THE CLASSICAL NEGATIVE: equipartition gives a constant (3/2) Nk, independent of T -- the paradox.
export const classicalCv = () => 3 / 2;

// The Fermi-Dirac occupation 1/(e^{(E-EF)/T} + 1); a step at T = 0, softened over ~T around E_F.
export function occupation(E, EF, T) {
    if (T <= 0) return E < EF ? 1 : (E > EF ? 0 : 0.5);
    return 1 / (Math.exp((E - EF) / T) + 1);
}

// v3815 -- MEASURED by the gate, not trusted from this comment.
export const MEASURED_V3815 = {
    fermi_integral: "INT x^{s-1}/(e^x+1) dx = Gamma(s) eta(s); at s=2 exactly pi^2/12 = 0.8224670334",
    eta_is_alternating_zeta: "eta(s) = (1-2^{1-s}) zeta(s) = sum (-1)^{n-1}/n^s; eta(1) = ln 2",
    ground_state: "<E> = 3/5 E_F, P = 2/5 n E_F, so P = 2/3 U/V and P ~ n^{5/3} (whiteDwarf's polytrope)",
    sommerfeld: "C_V/(Nk) = (pi^2/2)(T/T_F), linear; coefficient from Sommerfeld's pi^2/6 = zeta(2)",
    classical_negative: "equipartition says 3/2 Nk constant; measured electronic term ~1/100 of it at room T",
    note: "ideal Fermi gas, k_B=1, spin g=2 folded into E_F. Non-relativistic. The mirror of bec.mjs.",
};
