// physics/thermal/chemicalPotential.mjs -- v3817
//
// THE FINITE-TEMPERATURE CHEMICAL POTENTIAL -- THE ONE THREAD THAT TIES bec, fermi AND sackurTetrode TOGETHER.
// Fix the density n. The same constraint sets the fugacity z = e^{mu/kT} at every temperature:
//   n lambda^3  =  z              (classical, Maxwell-Boltzmann)
//   n lambda^3  =  g_{3/2}(z)     (bosons)      -- bec's Bose function
//   n lambda^3  =  f_{3/2}(z)     (fermions)    -- fermi's Fermi function
// and since lambda ~ T^{-1/2}, the left side grows as the gas cools (n lambda^3 ~ T^{-3/2}), driving z up and with
// it mu = kT ln z. The THREE gases answer that one constraint with three different functions, and where they
// diverge is the quantum-degeneracy scale. This module inverts the constraint and reads mu off ln z.
//
// *** THE CROSSOVER IS THE SIGN CHANGE OF mu, at z = 1, and it happens at a DIFFERENT phase-space density for each:
//     classical  mu = 0 at  n lambda^3 = 1
//     bosons     mu = 0 at  n lambda^3 = g_{3/2}(1) = zeta(3/2) = 2.6124   (this IS bec's condensation; mu pins at 0)
//     fermions   mu = 0 at  n lambda^3 = f_{3/2}(1) = eta(3/2)  = 0.7651   (mu keeps climbing, to +E_F)
//   ORDERED Bose > classical > Fermi, and that order IS the statistics: at fixed n and T the fugacities go
//   z_Fermi > z_classical > z_Bose (Pauli exclusion pushes mu UP, Bose attraction pulls it DOWN), so a boson gas
//   reaches mu = 0 only at a much higher density than a Fermi gas does.
//
// *** THE TWO ZERO-TEMPERATURE ENDS ARE OPPOSITE. Bosons: mu rises to 0 at Tc and STAYS 0 (the condensate holds it
// there) -- mu is NEVER positive, because a positive mu would make some Bose occupation 1/(e^{(e-mu)/kT}-1) negative.
// Fermions: mu climbs THROUGH zero to +E_F, and the Sommerfeld expansion gives mu(T)/E_F = 1 - (pi^2/12)(T/T_F)^2 +
// ..., whose coefficient pi^2/12 is exactly eta(2) = the Fermi integral at s = 2 (fermi.mjs). Classical statistics
// see neither ceiling nor floor and would let mu run off to +infinity -- which is why they fail at low T.
//
// BROWSER-SAFE: imports ./bec.mjs and ./fermi.mjs; no node builtins, no DOM.

import { boseFunction, criticalDensity } from "./bec.mjs";      // g_s(z) (z <= 1) and zeta(3/2)
import { fermiFunction, etaDirichlet } from "./fermi.mjs";       // f_s(z) (all z) and eta

export const muOverKT = (z) => Math.log(z);                      // mu/kT = ln z, the whole reduction

// The three crossover densities where mu = 0 (z = 1).
export const CROSSOVER_CLASSICAL = 1;
export const crossoverBose = () => criticalDensity();            // zeta(3/2)
export const crossoverFermi = () => etaDirichlet(1.5);           // eta(3/2)

// Classical: z = n lambda^3 outright.
export const fugacityClassical = (D) => D;

// Bosons: invert g_{3/2}(z) = D on z in (0, 1]; at or beyond zeta(3/2) the gas has condensed and z is pinned at 1.
export function fugacityBose(D, { iters = 90 } = {}) {
    if (D >= criticalDensity()) return 1;                        // condensed: mu = 0
    let lo = 0, hi = 1;
    for (let i = 0; i < iters; i++) { const m = 0.5 * (lo + hi); if (boseFunction(1.5, m) < D) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
}

// Fermions: invert f_{3/2}(z) = D for z in (0, infinity), bisecting in u = ln z so the degenerate z >> 1 is reachable.
export function fugacityFermi(D, { iters = 80, steps = 40000 } = {}) {
    let lo = -40, hi = 40;
    for (let i = 0; i < iters; i++) { const u = 0.5 * (lo + hi); if (fermiFunction(1.5, Math.exp(u), { steps }) < D) lo = u; else hi = u; }
    return Math.exp(0.5 * (lo + hi));
}

// The Sommerfeld low-temperature chemical potential of the Fermi gas, mu/E_F to leading order.
export const SOMMERFELD_MU_COEFF = Math.PI * Math.PI / 12;       // = eta(2) = fermi integral at s = 2
export const sommerfeldMu = (ToverTF) => 1 - SOMMERFELD_MU_COEFF * ToverTF * ToverTF;

// The Fermi phase-space density at reduced temperature t = T/T_F: n lambda^3 = (4/3 sqrt(pi)) t^{-3/2}
// (so that mu/E_F -> 1 as t -> 0). Inverting f_{3/2} at this density and taking t ln z gives the EXACT mu(T)/E_F.
export const fermiDensityFromT = (t) => (4 / (3 * Math.sqrt(Math.PI))) * Math.pow(t, -1.5);
export function muFermiOverEF(t) {
    const z = fugacityFermi(fermiDensityFromT(t));
    return t * Math.log(z);
}

// v3817 -- MEASURED by the gate, not trusted from this comment.
export const MEASURED_V3817 = {
    crossover_densities: "mu=0 at n lambda^3 = 1 (classical), zeta(3/2)=2.6124 (Bose), eta(3/2)=0.7651 (Fermi)",
    ordering: "at fixed n,T: z_Fermi > z_classical > z_Bose -> mu_Fermi > mu_classical > mu_Bose (exclusion up, attraction down)",
    bose_ceiling: "Bose mu <= 0 always; pins at 0 below Tc (condensate). Positive mu would give negative occupation",
    fermi_sommerfeld: "mu(T)/E_F = 1 - (pi^2/12)(T/T_F)^2 + ...; coefficient pi^2/12 = eta(2), and mu -> +E_F at T=0",
    classical_bridge: "all three -> mu/kT = ln(n lambda^3) as n lambda^3 -> 0 (sackurTetrode's regime)",
    note: "ideal gas, k_B=1, monatomic. The crossover is z passing through 1; the statistics set where.",
};
