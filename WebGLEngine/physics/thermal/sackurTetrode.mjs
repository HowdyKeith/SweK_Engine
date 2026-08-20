// physics/thermal/sackurTetrode.mjs -- v3816
//
// THE SACKUR-TETRODE ENTROPY -- THE CLASSICAL IDEAL GAS THAT BOTH bec.mjs AND fermi.mjs BECOME WHEN IT IS HOT AND
// THIN. Every quantum gas has a phase-space density n*lambda^3 (n = N/V, lambda the thermal de Broglie wavelength);
// when it is small the particles are far apart compared to their wave packets and the statistics stop mattering,
// and the Bose and Fermi gases collapse onto ONE classical answer. That answer is Sackur-Tetrode:
//   S/(Nk) = ln( (V/N) / lambda^3 ) + 5/2 = ln( n_Q / n ) + 5/2,     n_Q = 1/lambda^3 the quantum concentration.
// The 5/2 is 3/2 (the translational energy's ln T) plus 1 (the ln(V/N) that Stirling's 1/N! -- indistinguishable
// atoms -- puts there instead of ln V). This module is the bridge, and it joins BOTH siblings: bec's condensation
// threshold and fermi's degeneracy are exactly where n*lambda^3 stops being small and this classical formula fails.
//
// *** THE KEYS, ALL EXACT AND NONE FED TO THE MODEL:
//   1. THE 5/2 CONSTANT and the ln(n_Q/n) form. At n*lambda^3 = 1 the entropy per particle is exactly 5/2.
//   2. THE FORMULA ANNOUNCES ITS OWN DEATH: S/(Nk) = 0 at n*lambda^3 = e^{5/2} = 12.1825, and NEGATIVE above it.
//      A negative absolute entropy is impossible, so the classical gas is telling you it has left its domain -- and
//      it has, long before: bec's threshold n*lambda^3 = zeta(3/2) = 2.612 arrives FIRST, so the quantum statistics
//      have already taken over while Sackur-Tetrode still reads a comfortable +1.5. The negative is a late alarm on
//      a fire that started earlier.
//   3. THE FIRST QUANTUM CORRECTION IS THE BRIDGE, AND ITS SIGN IS THE STATISTICS: PV/(NkT) = 1 -/+ n*lambda^3 /
//      2^{5/2}, MINUS for bosons (they cluster, a statistical attraction, lower pressure) and PLUS for fermions
//      (Pauli exclusion, a statistical repulsion, higher pressure). Both -> 1 as n*lambda^3 -> 0, the classical
//      ideal gas, and the sign is the only thing that remembers which gas it was. 2^{5/2} = 5.65685.
//
// *** THE LOAD-BEARING NEGATIVE IS THE GIBBS PARADOX: without Stirling's 1/N! the entropy is ln V, not ln(V/N),
// and it stops being EXTENSIVE -- doubling a box of gas then adds a spurious N k ln 2, the entropy of "mixing" a
// gas with itself. The indistinguishability that fixes it is the same 1/N! that turns the constant from 3/2 into
// 5/2. A plant dropping it is caught by extensivity. And the third law: this classical S -> -infinity as T -> 0
// (n*lambda^3 -> infinity), which no real entropy does -- the quantum gases it bridges go to 0 instead.
//
// BROWSER-SAFE: no imports at all beyond Math; no node builtins, no DOM.

// S/(Nk) for the monatomic ideal gas, as a function of the phase-space density phi = n*lambda^3.
export const sackurTetrode = (phi) => -Math.log(phi) + 5 / 2;

// The quantum concentration n_Q = 1/lambda^3 (the density at which phi = 1, the quantum/classical border).
export const quantumConcentration = (lambda) => 1 / (lambda * lambda * lambda);

// Where the classical entropy hits zero and then goes (impossibly) negative: phi = e^{5/2}.
export const NEG_ENTROPY_THRESHOLD = Math.exp(5 / 2);          // 12.18249396

// The first quantum correction to the equation of state. sign = -1 for bosons (attraction), +1 for fermions
// (exclusion). PV/(NkT) = 1 + sign * phi / 2^{5/2}. This is the leading term of the fugacity expansion, and it is
// the exchange interaction that pure classical statistics cannot see.
export const EXCHANGE_DENOM = Math.pow(2, 5 / 2);              // 2^{5/2} = 5.656854
export const quantumEOS = (phi, sign) => 1 + sign * phi / EXCHANGE_DENOM;

// The EXTENSIVE entropy with explicit V, N (Stirling's 1/N! folded in as V/N): S = N k [ ln((V/N)/lambda^3) + 5/2 ].
export const entropyExtensive = (V, N, lambda) => N * (Math.log((V / N) / (lambda * lambda * lambda)) + 5 / 2);

// The DISTINGUISHABLE (pre-Gibbs-fix) entropy, WITHOUT 1/N!: S = N k [ ln(V/lambda^3) + 3/2 ]. Non-extensive; kept
// only so the gate can show the Gibbs paradox firing, never a physical answer.
export const entropyDistinguishable = (V, N, lambda) => N * (Math.log(V / (lambda * lambda * lambda)) + 3 / 2);

// v3816 -- MEASURED by the gate, not trusted from this comment.
export const MEASURED_V3816 = {
    form: "S/(Nk) = ln(n_Q/n) + 5/2; = 5/2 exactly at n*lambda^3 = 1",
    negative_threshold: "S = 0 at n*lambda^3 = e^{5/2} = 12.1825, negative above -- the formula's own breakdown flag",
    quantum_first: "bec's zeta(3/2) = 2.612 arrives before e^{5/2}: statistics take over while S still reads +1.5",
    bridge: "PV/(NkT) = 1 -/+ n*lambda^3 / 2^{5/2}; minus bosons (cluster), plus fermions (exclude); both -> 1 classical",
    gibbs: "without 1/N! the entropy is non-extensive (V not V/N) -- doubling the box adds a spurious N k ln 2",
    third_law: "classical S -> -infinity as T -> 0, which the quantum gases it bridges never do (they -> 0)",
    note: "monatomic ideal gas, k_B = 1. The high-T, low-density limit of bec.mjs and fermi.mjs alike.",
};
