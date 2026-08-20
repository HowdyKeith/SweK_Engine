// physics/whiteDwarf.js
//
// A white dwarf and its supernova, as real physics and nothing staged. A white dwarf is a dead stellar core held up not
// by heat but by electron degeneracy pressure -- the Pauli exclusion principle refusing to let electrons share a state.
// That single quantum fact produces two documented, computable things: a mass-radius relation that runs BACKWARDS (a
// heavier white dwarf is SMALLER, R proportional to M^-1/3), and a hard maximum mass, the Chandrasekhar limit near
// 1.44 solar masses, past which degeneracy pressure simply cannot win and the star collapses. A Type Ia supernova is
// exactly that: a white dwarf pushed over the Chandrasekhar limit, usually by stealing gas from a companion.
//
// This computes the real numbers. It does NOT fake a detonation with voxels -- the collapse here is the honest part, the
// threshold being crossed; the fireball would be a separate, clearly-labelled visual. Pure arithmetic + sqrt/cbrt ->
// deterministic, cross-arch.

export const R_SUN_KM = 695700;                                  // solar radius in km
export function chandrasekharMass(mu_e = 2) { return 5.826 / (mu_e * mu_e); }   // solar masses; ~1.457 for mu_e=2

// Mass-radius relation for a degenerate electron star (M in solar masses, mu_e mean molecular weight per electron).
// R/R_sun = k * M^-1/3 * sqrt(1 - (M/M_Ch)^4/3). The first factor is the non-relativistic degenerate scaling (heavier =
// smaller); the sqrt factor is the relativistic correction that drives the radius to zero at the Chandrasekhar mass.
// Returns radius in solar radii, or NaN if M is at/above M_Ch (no stable star exists -- it collapses).
export function radiusSolar(M, mu_e = 2) {
    const Mch = chandrasekharMass(mu_e);
    if (M >= Mch) return NaN;
    const rel = 1 - Math.pow(M / Mch, 4 / 3);
    return 0.0127 * Math.pow(M, -1 / 3) * Math.sqrt(rel);
}
export function radiusKm(M, mu_e = 2) { return radiusSolar(M, mu_e) * R_SUN_KM; }

// Is there a stable white dwarf at this mass, or does it collapse (supernova)?
export function isStable(M, mu_e = 2) { return M < chandrasekharMass(mu_e); }
export function collapses(M, mu_e = 2) { return M >= chandrasekharMass(mu_e); }

// Accreting from a companion: given a starting mass and an accretion rate per step, returns the mass history until it
// crosses the Chandrasekhar limit -- the run-up to a Type Ia. Deterministic.
export function accreteToLimit(M0, dM, mu_e = 2) {
    const Mch = chandrasekharMass(mu_e);
    const hist = []; let M = M0, n = 0;
    while (M < Mch && n < 100000) { hist.push({ M, R: radiusSolar(M, mu_e) }); M += dM; n++; }
    return { hist, crossedAt: M, steps: n, detonated: M >= Mch };
}
