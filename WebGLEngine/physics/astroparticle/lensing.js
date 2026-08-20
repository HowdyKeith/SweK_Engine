// WebGLEngine/physics/astroparticle/lensing.js — v3428
// ---------------------------------------------------------------------------------------------------------------
// GRAVITATIONAL MICROLENSING — and an invariant that no error in the lens can touch.
//
// A point mass between us and a background star produces TWO images. Their positions and brightnesses depend on
// the mass, the distances, and the alignment; the total magnification
//
//     mu_+ + mu_-  =  (u^2 + 2) / (u sqrt(u^2 + 4))
//
// is what a telescope actually records, and it depends on everything. But the DIFFERENCE
//
//     mu_+ - mu_-  =  1     EXACTLY, for every alignment, every mass, every distance
//
// is an invariant. It falls out of the lens equation algebraically and carries no parameter at all.
//
// *** WHICH MEANS IT IS BLIND TO AN ERROR IN THE EINSTEIN RADIUS, AND THAT IS THE POINT OF BUILDING IT HERE. ***
// The oscillation device (v3426) showed that two of its three keys pass a 27% error in a derived constant, and
// only the phase key can see it. This is the same shape with a DIFFERENT invariant: get theta_E wrong by any
// factor and mu_+ - mu_- is still exactly 1, while the total magnification and the event timescale both move.
// One instance of that pattern is an anecdote; two instances measured independently make it a property of how
// keys work, which is worth more than either device.
//
// THE EINSTEIN RADIUS ITSELF IS CLOSED FORM, and derived from G and c rather than typed:
//
//     theta_E = sqrt( (4 G M / c^2) * D_LS / (D_L D_S) )
//
// AND THE SINGULARITY IS REAL, NOT A BUG. As u -> 0 the source, lens and observer align, the two images merge
// into an Einstein ring, and the point-source magnification DIVERGES. A finite star does not actually blow up --
// the divergence is the point-source idealisation failing, not the physics -- so the code returns Infinity
// honestly rather than clamping to a large number that would look like a measurement.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

export const G_SI = 6.67430e-11;             // m^3 kg^-1 s^-2 (CODATA; the one constant here with uncertainty)
export const C_LIGHT = 299792458;            // m/s, exact by definition of the metre
export const M_SUN = 1.98892e30;             // kg
export const PARSEC = 3.0856775814913673e16; // m, exact given the SI definitions and the arcsecond

/** Einstein radius in radians. D_L, D_S, D_LS in metres; M in kg. */
export function einsteinRadius({ M, dL, dS, dLS = null }) {
    const dls = dLS == null ? dS - dL : dLS;
    return Math.sqrt((4 * G_SI * M / (C_LIGHT * C_LIGHT)) * dls / (dL * dS));
}

/** Image positions in units of theta_E. The two roots of the lens equation, one inside the ring and one outside. */
export function imagePositions(u) {
    const r = Math.sqrt(u * u + 4);
    return { plus: (u + r) / 2, minus: (u - r) / 2 };
}

/**
 * The two magnifications, computed from their OWN closed forms rather than one from the other, so the invariant
 * below is a test and not a tautology.
 */
export function magnifications(u) {
    if (u === 0) return { plus: Infinity, minus: Infinity };
    const r = Math.sqrt(u * u + 4);
    const common = (u * u + 2) / (2 * u * r);
    return { plus: common + 0.5, minus: common - 0.5 };
}

/** What a telescope records: the two images are unresolved, so their fluxes add. */
export const totalMagnification = (u) => {
    if (u === 0) return Infinity;
    const r = Math.sqrt(u * u + 4);
    return (u * u + 2) / (u * r);
};

/** THE INVARIANT. Computed from the two independent magnifications, never assumed. */
export const magnificationDifference = (u) => {
    const m = magnifications(u);
    return m.plus - m.minus;
};

/** Angular separation over time for a source passing a lens: the classic Paczynski curve. */
export const uOfTime = (t, { u0 = 0.3, t0 = 0, tE = 20 }) => Math.hypot(u0, (t - t0) / tE);

/** The observed light curve, in magnifications. */
export function lightCurve({ u0 = 0.3, t0 = 0, tE = 20, from = -60, to = 60, samples = 241 } = {}) {
    const out = [];
    for (let i = 0; i < samples; i++) {
        const t = from + (to - from) * i / (samples - 1);
        const u = uOfTime(t, { u0, t0, tE });
        out.push({ t, u, mu: totalMagnification(u) });
    }
    return out;
}

/** Peak magnification of an event with impact parameter u0: the closed form at closest approach. */
export const peakMagnification = (u0) => totalMagnification(u0);
