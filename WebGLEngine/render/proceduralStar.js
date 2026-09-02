// WebGLEngine/render/proceduralStar.js — v3835 (a procedural star from the nebula skybox's own generator)
//
// The same seedable noise that bakes the nebula backdrop (render/nebulaSkybox.js) also bakes a star. This file
// imports that generator's fbm rather than growing a second copy -- one noise owner, two consumers -- and adds the
// star-specific shading on top: a blackbody-ish temperature colour, photosphere granulation (bright granule cells
// in darker lanes), and the classic linear LIMB-DARKENING law for the disc edge. Surface colour is a pure
// function of DIRECTION, so the star's cubemap is seamless exactly the way the skybox is.
//
// PURE: no Three, no GL, no DOM. bakeStarCubemap returns raw RGB byte faces (the photosphere); LIMB DARKENING is
// view-dependent and is applied by the front-door shader from the limbDarkening() law pinned here. Gated headless
// in render/proceduralStar-selfcheck.mjs.

import { fbm } from "./valueNoise.js";        // v4327 -- the SAME noise the skybox bakes with, from its own file
import { faceTexelDir } from "./cubeBake.js"; // v4327 -- the SAME cube geometry, likewise

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Blackbody-flavoured colour ramp: cooler stars are red, ~5800 K is white, hotter is blue. Anchored, interpolated.
// Monotone in the sense that matters -- red falls and blue rises as temperature climbs.
const TEMP_STOPS = [
    [3000, [1.00, 0.54, 0.24]],
    [4500, [1.00, 0.78, 0.55]],
    [5800, [1.00, 0.96, 0.92]],
    [7500, [0.82, 0.88, 1.00]],
    [12000, [0.66, 0.78, 1.00]],
];
export function temperatureColor(kelvin) {
    const k = Math.max(TEMP_STOPS[0][0], Math.min(TEMP_STOPS[TEMP_STOPS.length - 1][0], kelvin));
    for (let i = 1; i < TEMP_STOPS.length; i++) {
        if (k <= TEMP_STOPS[i][0]) {
            const [k0, c0] = TEMP_STOPS[i - 1], [k1, c1] = TEMP_STOPS[i];
            return lerp3(c0, c1, (k - k0) / (k1 - k0));
        }
    }
    return TEMP_STOPS[TEMP_STOPS.length - 1][1].slice();
}

// Linear limb darkening: brightness as a function of mu = cos(angle between the surface normal and the view). The
// disc centre (mu = 1) is full brightness; the edge (mu -> 0) falls to 1 - coeff. This is the law the star shader
// applies per fragment; it is pinned here so the GLSL is checkable against arithmetic.
export function limbDarkening(mu, coeff = 0.6) {
    const m = clamp01(mu);
    return 1 - coeff * (1 - m);
}

const DEFAULTS = {
    seed: 909,
    kelvin: 5800,
    octaves: 4,
    granFreq: 6.0,        // granulation cell frequency
    granDepth: 0.35,      // how much the granulation modulates brightness
    spotFreq: 1.6,        // low-frequency starspot field
    spotThreshold: 0.22,  // fbm below this darkens (a spot); 0 disables spots
    spotDepth: 0.55,      // how dark a spot gets
};
export function makeStarParams(opts = {}) { return { ...DEFAULTS, ...opts }; }

// Photosphere colour in a surface direction: temperature base, modulated by granulation and (optionally) a
// starspot. A PURE FUNCTION OF DIRECTION -> the cubemap has no seams.
export function starSurface(dir, P) {
    const base = temperatureColor(P.kelvin);
    const g = fbm(dir[0] * P.granFreq, dir[1] * P.granFreq, dir[2] * P.granFreq, P.seed, P.octaves);   // [0,1]
    let bright = 1 + (g - 0.5) * 2 * P.granDepth;   // granules above 1, lanes below
    if (P.spotThreshold > 0) {
        const s = fbm(dir[0] * P.spotFreq, dir[1] * P.spotFreq, dir[2] * P.spotFreq, P.seed ^ 0x51ab, P.octaves);
        if (s < P.spotThreshold) bright *= (1 - P.spotDepth * (1 - s / P.spotThreshold));
    }
    return [clamp01(base[0] * bright), clamp01(base[1] * bright), clamp01(base[2] * bright)];
}

// Bake the photosphere to six RGB faces (no limb darkening -- that is view-dependent and lives in the shader).
export function bakeStarCubemap(opts = {}) {
    const P = makeStarParams(opts), size = opts.size || 128, faces = [];
    for (let f = 0; f < 6; f++) {
        const buf = new Uint8ClampedArray(size * size * 3);
        for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
            const c = starSurface(faceTexelDir(f, i, j, size), P), o = (j * size + i) * 3;
            buf[o] = c[0] * 255; buf[o + 1] = c[1] * 255; buf[o + 2] = c[2] * 255;
        }
        faces.push(buf);
    }
    return { size, faces };
}
