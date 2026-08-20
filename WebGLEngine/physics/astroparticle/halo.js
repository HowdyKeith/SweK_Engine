// WebGLEngine/physics/astroparticle/halo.js — v3426
// ---------------------------------------------------------------------------------------------------------------
// GALAXY ROTATION CURVES — and the honest version of the dark-matter claim, which is narrower than the usual one.
//
// *** WHAT THIS MEASURES IS A DISCREPANCY. IT DOES NOT DETECT ANYTHING. *** The observation is that orbital
// speeds in the outskirts of spiral galaxies stay flat where the visible mass says they should fall. That is a
// statement about GRAVITY AND LIGHT: there is more enclosed mass than the luminous matter accounts for, by a
// factor this file computes. Whether the extra mass is a particle, or whether gravity is different at low
// acceleration, is NOT something a rotation curve can settle -- and a device that printed "dark matter detected"
// would be claiming a conclusion its data cannot reach.
//
// So the keys here are about the arithmetic of enclosed mass, which is exact, and the size of the gap, which is
// measured. Nothing else.
//
// THE EXACT IDENTITY WORTH BUILDING ON. For a singular isothermal sphere, rho(r) = v0^2 / (4 pi G r^2), the
// enclosed mass is
//
//     M(r) = integral 4 pi r^2 rho dr = v0^2 r / G      exactly
//
// so the circular speed sqrt(GM/r) is EXACTLY v0 AT EVERY RADIUS. A flat rotation curve is not something the
// isothermal halo approximates -- it is what it IS, identically, and any deviation in the code is arithmetic
// rather than physics. That makes it the right control for the numerical integrator used on the profiles that
// have no closed form.
//
// AND THE KEPLERIAN CASE IS THE OTHER CONTROL: outside all the mass, v must fall as r^-1/2. If a halo model
// cannot reproduce Keplerian falloff when the halo is switched off, it is not the halo doing the work.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/** G in astronomer's units: kpc, solar masses, km/s. v^2 = G M / r comes out in (km/s)^2. */
export const G_ASTRO = 4.30091e-6;      // kpc * (km/s)^2 / Msun

/** Circular speed from enclosed mass. The whole subject in one line. */
export const vCirc = (M, r) => Math.sqrt(G_ASTRO * M / r);

// ---- profiles -------------------------------------------------------------------------------------------------

/** A point mass (or anything entirely inside r): the Keplerian control. */
export const mPoint = (M) => () => M;

/**
 * Singular isothermal sphere. M(r) = v0^2 r / G EXACTLY, so vCirc is exactly v0 at every radius.
 * This is the identity the numerical integrator is checked against.
 */
export const mIsothermal = (v0) => (r) => v0 * v0 * r / G_ASTRO;

/**
 * NFW profile: rho = rho_s / (x (1+x)^2) with x = r/rs. The enclosed mass has a closed form,
 *     M(r) = 4 pi rho_s rs^3 [ ln(1+x) - x/(1+x) ]
 * and unlike the isothermal case the rotation curve PEAKS and then falls slowly -- which is why NFW and a flat
 * curve are different claims rather than the same one.
 */
export const mNFW = (rhoS, rs) => (r) => {
    const x = r / rs;
    return 4 * Math.PI * rhoS * rs * rs * rs * (Math.log(1 + x) - x / (1 + x));
};

/** An exponential disk, as the luminous component. Enclosed mass of a thin exponential disk, approximated by the
 *  spherical-equivalent integral: adequate for a mass-discrepancy statement and NOT a disk dynamics model. */
export const mDisk = (Md, rd) => (r) => Md * (1 - Math.exp(-r / rd) * (1 + r / rd));

/** Add mass components. Enclosed masses add; speeds do not. */
export const mSum = (...fs) => (r) => fs.reduce((s, f) => s + f(r), 0);

// ---- the measurement ------------------------------------------------------------------------------------------

/** Numerically integrate 4 pi r^2 rho(r) dr, so a profile with no closed form can still be used. */
export function enclosedNumeric(rho, r, { steps = 20000 } = {}) {
    let s = 0;
    const h = r / steps;
    for (let i = 0; i < steps; i++) {
        const a = (i + 0.5) * h;
        s += 4 * Math.PI * a * a * rho(a) * h;
    }
    return s;
}

/** Rotation curve for any enclosed-mass function. */
export const curve = (mOf, radii) => radii.map((r) => ({ r, v: vCirc(mOf(r), r) }));

/**
 * THE DISCREPANCY, WHICH IS THE ONLY THING THIS FILE CLAIMS. Given the luminous mass and an observed flat speed,
 * how much enclosed mass is missing at radius r, and what factor is that?
 */
export function massDiscrepancy({ mVisible, vObserved, r }) {
    const needed = vObserved * vObserved * r / G_ASTRO;
    const seen = mVisible(r);
    return { needed, seen, missing: needed - seen, factor: needed / seen };
}
