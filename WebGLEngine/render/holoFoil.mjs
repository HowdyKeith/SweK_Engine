// FILE: render/holoFoil.mjs
// VERSION: v4163 -- holographic foil: thin-film interference, a diffraction grating, and flakes. The CPU
// reference the GLSL is checked against, in the crtModel / swiftShaderModel pattern.
//
// The effect is jal-co/holosticker's (MIT) -- "PBR holofoil with view-dependent diffraction bands, thin-film
// iridescence, metallic flakes". None of their code is here; three.js is already vendored and svg-forge.html
// already extrudes an SVG into geometry, so what was missing was a MATERIAL, and a material is arithmetic.
//
// *** THE DIFFERENCE BETWEEN A HOLOFOIL AND A PICTURE OF A RAINBOW IS THAT THE HOLOFOIL MOVES. *** A hue ramp
// across a surface looks convincing in a screenshot and dead the moment anything rotates. So every colour here
// is a function of the VIEW ANGLE, and the gate's first assertion is that the same point on the same surface
// changes colour when the camera moves. That is a property a gradient cannot fake.
//
// *** AND IT IS THE REAL INTERFERENCE, NOT A HUE WHEEL, BECAUSE THE REAL ONE IS BARELY HARDER. ***
// Light reflecting off the top and bottom of a film of thickness d and index n travels an extra
//     OPD = 2 n d cos(theta_t)
// where theta_t is the refraction angle INSIDE the film (Snell from the incidence angle). The external
// reflection flips phase by pi, so a wavelength interferes constructively when OPD = (m + 1/2) lambda. Sampling
// that at three wavelengths gives RGB directly.
//
// This matters for one visible reason, and the FIRST DRAFT OF THIS COMMENT GOT IT WRONG, which is worth
// leaving in because it is the exact mistake a hue-wheel fake encodes. It said "as the view goes grazing the
// colour walks toward blue". MEASURED, at a 380 nm film: blue-minus-red runs 0.40 head-on and 0.21 at grazing
// -- LESS blue, not more. The hue does not walk anywhere; IT CYCLES.
//
// What is monotonic is the PATH. cos(theta_t) falls as the view opens, so the OPD shortens without ever
// reversing -- 1064, 1011, 915, 836, 779, 749 nm across cos 1.0 down to 0.1 -- and the hue therefore advances
// through the interference orders in ONE DIRECTION and never doubles back. That is the property a real film
// has and a hue wheel does not: a fake cycles whichever way its author wired it and reverses as often as not,
// which reads as "cheap sticker" without a viewer being able to say why. So the gate asserts THE MONOTONIC
// PATH, not a colour, because the colour is a consequence and the path is the physics.

/** Wavelengths sampled for R, G, B, in nanometres. Not arbitrary: near the peaks of the CIE response. */
export const LAMBDA_NM = [600, 550, 450];
/** Refractive index of the film. ~1.4 is a soap/oil/lacquer film; the knob exists because it moves the hue. */
export const DEFAULT_IOR = 1.4;
/** Film thickness in nm. A few hundred is where the first interference orders land in visible light. */
export const DEFAULT_THICKNESS_NM = 380;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Snell, returned as the COSINE inside the film, which is what the path length needs.
 * Total internal reflection cannot happen entering a denser medium, so no branch is needed here.
 */
export function refractionCos(cosIncident, ior = DEFAULT_IOR) {
    const ci = clamp01(Math.abs(cosIncident));
    const sinI2 = 1 - ci * ci;
    const sinT2 = sinI2 / (ior * ior);
    return Math.sqrt(Math.max(0, 1 - sinT2));
}

/** Optical path difference through the film, in nm. */
export function opticalPathDifference(cosIncident, { thicknessNm = DEFAULT_THICKNESS_NM, ior = DEFAULT_IOR } = {}) {
    return 2 * ior * thicknessNm * refractionCos(cosIncident, ior);
}

/**
 * Thin-film reflectance at the three sampled wavelengths.
 *
 * The half-wave shift from the external reflection is the `+ PI` -- drop it and every colour is the complement
 * of what a film actually shows, which is the kind of wrong that still looks pretty.
 */
export function thinFilmRGB(cosIncident, opts = {}) {
    const d = opticalPathDifference(cosIncident, opts);
    return LAMBDA_NM.map((lam) => 0.5 + 0.5 * Math.cos((2 * Math.PI * d) / lam + Math.PI));
}

/**
 * A diffraction grating's contribution: line spacing g sends wavelength lambda to sin(theta) = m*lambda/g, so at
 * a given view angle each wavelength is brightened by how near it sits to an order.
 */
export function diffractionRGB(sinTheta, { gratingNm = 1200, order = 1, sharpness = 12 } = {}) {
    return LAMBDA_NM.map((lam) => {
        const peak = (order * lam) / gratingNm;          // sin(theta) where this wavelength lands
        const dx = Math.abs(Math.abs(sinTheta) - peak);
        return Math.exp(-sharpness * sharpness * dx * dx);
    });
}

/** Deterministic value hash. Integer-lattice, so a flake stays put on the SURFACE rather than swimming. */
export function hash2(x, y, seed = 0) {
    let h = Math.imul(Math.floor(x) | 0, 374761393) ^ Math.imul(Math.floor(y) | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Metallic flakes.
 *
 * *** KEYED ON SURFACE POSITION, NEVER ON THE SCREEN. *** Flakes seeded from screen coordinates crawl across
 * the object as it turns -- the surface appears to be sliding underneath its own sparkle, which reads as
 * noise rather than glitter. Each flake also carries its own normal tilt, so they light up one at a time
 * instead of the whole field flashing together, which is what makes it look like foil and not like static.
 */
export function flakeAt(u, v, cosIncident, { density = 40, seed = 1, coverage = 0.12, tightness = 24 } = {}) {
    const gx = u * density, gy = v * density;
    const cell = hash2(gx, gy, seed);
    if (cell > coverage) return 0;
    const tilt = hash2(gx, gy, seed + 977) * 2 - 1;      // this flake's own facing, in [-1, 1]
    const align = 1 - Math.abs(cosIncident - (0.5 + 0.5 * tilt));
    return Math.pow(clamp01(align), tightness);
}

/** Schlick, so the foil brightens at grazing angles as any real coating does. */
export function fresnel(cosIncident, f0 = 0.04) {
    const c = 1 - clamp01(Math.abs(cosIncident));
    return f0 + (1 - f0) * c * c * c * c * c;
}

/**
 * The whole foil at one point.
 *
 * `cosIncident` is dot(normal, viewDir). `u`,`v` are SURFACE coordinates. Returns linear RGB in [0, 1]:
 * *** CLAMPED, BECAUSE THREE ADDITIVE LAYERS ON A BASE COLOUR BLOW OUT. *** An unclamped holo looks
 * spectacular on a dark logo and turns a light one into a white blob, which is the failure that gets blamed
 * on the artwork.
 */
export function holoFoil({ cosIncident = 1, u = 0, v = 0, base = [0.5, 0.5, 0.5],
                           thicknessNm = DEFAULT_THICKNESS_NM, ior = DEFAULT_IOR,
                           filmStrength = 0.6, gratingStrength = 0.35, flakeStrength = 0.8,
                           gratingNm = 1200, density = 40, seed = 1, coverage = 0.12 } = {}) {
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosIncident * cosIncident));
    const film = thinFilmRGB(cosIncident, { thicknessNm, ior });
    const grate = diffractionRGB(sinTheta, { gratingNm });
    const flake = flakeAt(u, v, cosIncident, { density, seed, coverage });
    const f = fresnel(cosIncident);
    return [0, 1, 2].map((k) => clamp01(
        base[k] * (1 - filmStrength * f) +
        film[k] * filmStrength * f +
        grate[k] * gratingStrength * f +
        flake * flakeStrength));
}
