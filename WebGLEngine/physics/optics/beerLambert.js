// WebGLEngine/physics/optics/beerLambert.js — v3411
// ---------------------------------------------------------------------------------------------------------------
// THE BEER-LAMBERT LAW, AND THE CASE WHERE IT IS NOT TRUE.
//
// Light through an absorbing slab falls off exponentially: I = I0 exp(-mu x). The law is exact, it is the reason
// half-value layers are a useful way to talk about shielding, and it is ASSUMED EVERYWHERE IN THIS TREE AND
// TESTED NOWHERE -- radon() in ct.js computes the line integral of mu, which IS the Beer-Lambert exponent and is
// the entire premise of computed tomography. Nothing ever took the exponential, measured I/I0, or asked what
// happens when the assumption fails.
//
// *** AND IT FAILS FOR EVERY REAL X-RAY SOURCE. *** Beer-Lambert is exact for a MONOCHROMATIC beam. A real tube
// emits a spectrum, mu falls steeply with photon energy (roughly E^-3 in the photoelectric region), so the soft
// photons are absorbed first and WHAT SURVIVES IS HARDER THAN WHAT WENT IN. The effective attenuation therefore
// DECREASES WITH DEPTH: log(I0/I) is not linear in thickness, the line integral CT assumes is not the quantity
// being measured, and a uniform cylinder reconstructs with its edges brighter than its middle. That is cupping,
// and it is the dominant artefact in real CT.
//
// So this device grades three things that must hold exactly, and one thing that must fail -- and the failing one
// is the interesting half, because the tree contains a tomography instrument whose correctness depends on the
// failure NOT happening.
//
// THE MONOCHROMATIC CASE IS THE CONTROL. If the hardening test fired for a single-energy beam it would be
// measuring the integrator rather than the physics, so that case is checked to stay flat.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/** The law itself. Exact, monochromatic. */
export const transmit = (I0, mu, x) => I0 * Math.exp(-mu * x);

/** Optical depth: the dimensionless exponent, which is what a CT sinogram actually holds. */
export const opticalDepth = (mu, x) => mu * x;

/** Half-value layer: the thickness that removes exactly half. ln2/mu, no approximation. */
export const halfValueLayer = (mu) => Math.LN2 / mu;

/** A stack of slabs. The exponents ADD, which is why a line integral is the right object. */
export const transmitStack = (I0, slabs) =>
    I0 * Math.exp(-slabs.reduce((s, { mu, x }) => s + mu * x, 0));

// ---- the polychromatic case ------------------------------------------------------------------------------------
//
// mu(E) = photoelectric + Compton. The photoelectric term is the one that matters here: it falls as E^-3, so a
// beam that has crossed material is measurably harder than the one that entered.

/** Mass attenuation with a steep low-energy term. E in keV. */
export const muOfEnergy = (E, { photo = 6e5, compton = 0.02 } = {}) => photo / (E * E * E) + compton;

/** A crude bremsstrahlung-ish spectrum: rises from zero, falls to the tube voltage. Normalised to unit weight. */
export function spectrum({ kvp = 120, bins = 60, eMin = 20 } = {}) {
    const out = [];
    let total = 0;
    for (let i = 0; i < bins; i++) {
        const E = eMin + (kvp - eMin) * (i + 0.5) / bins;
        const w = Math.max(0, (kvp - E)) * E;          // zero at the endpoint, peaked in the middle
        out.push({ E, w });
        total += w;
    }
    return out.map((b) => ({ E: b.E, w: b.w / total }));
}

/** Transmitted intensity for a polychromatic beam: every energy attenuates by its own mu, then they sum. */
export function transmitPoly(x, { spec = null, mu = muOfEnergy, ...opts } = {}) {
    const s = spec || spectrum(opts);
    let out = 0;
    for (const b of s) out += b.w * Math.exp(-mu(b.E, opts) * x);
    return out;                                        // I/I0, since the weights sum to 1
}

/**
 * The EFFECTIVE attenuation a detector would report if it assumed Beer-Lambert:
 *
 *     mu_eff(x) = -ln(I/I0) / x
 *
 * For a monochromatic beam this is mu, at every thickness, exactly. For a polychromatic one it FALLS with x --
 * and that fall is beam hardening, measured rather than described.
 */
export const effectiveMu = (x, opts = {}) => -Math.log(transmitPoly(x, opts)) / x;

/** The same for a single energy, which must come back flat. The control. */
export function effectiveMuMono(x, E = 70, opts = {}) {
    const mu = muOfEnergy(E, opts);
    return -Math.log(Math.exp(-mu * x)) / x;
}

/**
 * Cupping: a uniform slab measured through its centre versus near its edge. In CT the ray through the middle of
 * a cylinder passes more material, hardens more, and reports a LOWER effective mu -- so the reconstruction dips
 * in the centre even though the object is uniform.
 */
export function cupping({ radius = 10, samples = 9, ...opts } = {}) {
    const rows = [];
    for (let i = 0; i < samples; i++) {
        const t = (i / (samples - 1)) * 0.95;            // fractional distance from the axis
        const chord = 2 * radius * Math.sqrt(1 - t * t); // path length through a uniform cylinder
        rows.push({ t, chord, muEff: effectiveMu(chord, opts) });
    }
    const centre = rows[0].muEff, edge = rows[rows.length - 1].muEff;
    return { rows, centre, edge, cupFraction: (edge - centre) / edge };
}
