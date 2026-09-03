// FILE: render/fireColour.mjs -- v4412
//
// *** FIVE THINGS IN THIS TREE TURN HEAT INTO A COLOUR, TWO OF THEM SHARE A NAME, AND NOTHING HAD EVER
// COMPARED ANY OF THEM -- INCLUDING TO THE TREE'S OWN PLANCK MODULE. ***
//
// The backlog filed this as "three fires and no gate has ever compared their rules". The census corrected the
// count before it corrected anything else: there are SIX fires (doomFire, doomFireField, shipExhaust,
// fireMesh, fireSystem's wildfire, and the ramps), and the axis on which they are actually comparable is not
// their pixels -- one is a cellular automaton, one is a ray-marched volume, one is a voxel spread rule -- but
// the question every one of them answers: WHAT COLOUR IS FIRE AT HEAT h?
//
// ---- *** THE PHYSICAL FACT, DERIVED FROM physics/thermal/blackbody.mjs AND NOT TYPED HERE *** -------------
// Planck's law is monotonically increasing in T at EVERY fixed wavelength: heat a body and it radiates more
// at 700 nm, more at 550 nm and more at 450 nm, all at once. So a ramp that claims to be a blackbody must
// have every channel non-decreasing in heat. A channel that FALLS as heat rises is a hue rotation -- a
// perfectly good artistic choice, and not a blackbody. planckMonotone() computes this from H_PLANCK, K_BOLTZ
// and C_LIGHT rather than asserting it, because a reference value nobody derived is a reference value nobody
// checked.
//
// ---- WHAT THE MEASUREMENT SAID (v4412, channel drops over the ramp's own resolution) ---------------------
//
//   render/doomFire.mjs PALETTE (37 stops)     R 5  G 0  B 0    an ARTISTIC hue rotation, and correct as one
//   fx/voxelize/fireRamp.js blackbodyRamp      R 0  G 0  B 0    monotone: the name is EARNED
//   physics/fire/fireMesh.js channel ramps     R 0  G 0  B 0    monotone
//   demos_code/fitzhugh_nagumo.js fireRamp     R 0  G 0  B 40   *** AN INFERNO COLORMAP WEARING THE OTHER
//                                                                   ONE'S NAME ***
//
// *** THE NAMING TRAP, AND IT IS v4144's SPECIES EXACTLY. *** Two functions in this tree were called
// `fireRamp`. One is a six-stop blackbody approximation whose blue channel is zero until the fire is nearly
// white. The other is an Inferno-style perceptual colormap that runs black -> PURPLE -> red, whose blue
// channel rises to 0.30 at a fifth of full heat and then FALLS. At h = 0.2 they read:
//
//     JS blackbodyRamp   [0.51, 0.04, 0.00]      dark red
//     GLSL fireRamp      [0.18, 0.05, 0.30]      purple
//
// They do not differ in shade. THEY DISAGREE ABOUT WHETHER COOL FIRE IS RED OR PURPLE, and a cool blackbody
// is never purple. v4412 renames the GLSL one to `infernoRamp`, which is what it is.
//
// *** AND THE COLLISION SURVIVED BECAUSE OF WHERE IT LIVED. *** demos_code/ is excluded by staleness.mjs's
// SKIP regex, so gateFiles() never sees it and no gate in 4,412 versions has read a line of it. A directory
// the scanners skip is a directory where a name can mean two things for ever. That is reported here rather
// than repaired by widening the scan -- widening it is a round of its own, with its own count to argue about.
//
// ---- WHAT IS DELIBERATELY NOT CLAIMED --------------------------------------------------------------------
// That any of these IS the colour of a blackbody at some temperature. That needs CIE colour matching, which
// this tree does not have, and inventing the matching functions here would be exactly the "reference value I
// made up" that blackbody.mjs's own header refuses. MONOTONICITY IS A NECESSARY CONDITION AND NOT A
// SUFFICIENT ONE: passing it does not make a ramp right, failing it makes a ramp not-a-blackbody.
"use strict";
import { PALETTE } from "./doomFire.mjs";
import { blackbodyRamp } from "../fx/voxelize/fireRamp.js";
import { H_PLANCK, K_BOLTZ, C_LIGHT } from "../physics/thermal/blackbody.mjs";

/** Planck spectral radiance at one wavelength and temperature. Constants come from the thermal module. */
export function planckRadiance(lambdaM, T) {
    const a = 2 * H_PLANCK * C_LIGHT * C_LIGHT / Math.pow(lambdaM, 5);
    return a / (Math.expm1(H_PLANCK * C_LIGHT / (lambdaM * K_BOLTZ * T)));
}

/** The three wavelengths a screen answers with, in metres. Not a colour space -- three sample points. */
export const RGB_WAVELENGTHS = Object.freeze({ r: 700e-9, g: 550e-9, b: 450e-9 });

/**
 * *** THE FACT THE WHOLE CENSUS RESTS ON, COMPUTED RATHER THAN ASSERTED. *** Returns true when Planck's law
 * is non-decreasing in T at every listed wavelength across the range -- which it is, everywhere, and the
 * point of computing it is that a check resting on an unverified premise is a check resting on nothing.
 */
export function planckMonotone({ lo = 800, hi = 6000, step = 25, lambdas = RGB_WAVELENGTHS } = {}) {
    const out = {};
    for (const [k, lam] of Object.entries(lambdas)) {
        let mono = true, prev = -Infinity;
        for (let T = lo; T <= hi; T += step) { const v = planckRadiance(lam, T); if (v < prev) mono = false; prev = v; }
        out[k] = mono;
    }
    return out;
}

/** Count, per channel, how many times a ramp goes DOWN as heat goes up. Zero is the blackbody condition. */
export function channelDrops(sample, steps) {
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
        let prev = -Infinity;
        for (let i = 0; i <= steps; i++) { const v = sample(i / steps)[k]; if (v < prev - 1e-9) out[k]++; prev = v; }
    }
    return out;
}

/** The largest per-channel gap between two ramps over the heat axis, with the heat at which it happens. */
export function widestDisagreement(a, b, steps = 200) {
    let worst = -1, at = 0, ch = 0;
    for (let i = 0; i <= steps; i++) {
        const h = i / steps, ca = a(h), cb = b(h);
        for (let k = 0; k < 3; k++) { const d = Math.abs(ca[k] - cb[k]); if (d > worst) { worst = d; at = h; ch = k; } }
    }
    return { gap: worst, at, channel: "rgb"[ch] };
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The DOOM palette as a heat ramp: 37 stops, nearest-index. Its five red drops are the finding. */
export const doomSample = (h) => {
    const c = PALETTE[Math.max(0, Math.min(PALETTE.length - 1, Math.round(h * (PALETTE.length - 1))))];
    return [c[0] / 255, c[1] / 255, c[2] / 255];
};

/** physics/fire/fireMesh.js makeFireTexture's three channel ramps, lifted verbatim from that source. */
export const meshSample = (h) => [
    Math.min(1, h * 3.2),
    Math.min(1, Math.max(0, (h - 0.30) * 2.3)),
    Math.min(1, Math.max(0, (h - 0.72) * 4.0)),
];

/**
 * demos_code/fitzhugh_nagumo.js's GLSL ramp, in JS so it can be measured. *** THIS IS A SECOND DECLARATION
 * AND IT IS ONE ON PURPOSE: *** the original is a string inside a shader that no Node process can call, so
 * the only way to compare it with the others is to restate it, and the gate holds the restatement to the six
 * stops in that file rather than trusting this copy.
 */
export const INFERNO_STOPS = Object.freeze([
    [0.00, 0.00, 0.00], [0.18, 0.05, 0.30], [0.65, 0.10, 0.30],
    [0.95, 0.45, 0.20], [1.00, 0.85, 0.40], [1.00, 1.00, 0.90],
].map(Object.freeze));

export const infernoSample = (t) => {
    const x = Math.max(0, Math.min(1, t));
    for (let i = 0; i < INFERNO_STOPS.length - 1; i++) {
        if (x < 0.2 * (i + 1)) return mix(INFERNO_STOPS[i], INFERNO_STOPS[i + 1], (x - 0.2 * i) / 0.2);
    }
    return [...INFERNO_STOPS[INFERNO_STOPS.length - 1]];
};

export const rampSample = (h) => blackbodyRamp(h).slice();

/**
 * The census. `claims` is what the source calls itself; `blackbodyCandidate` says whether monotonicity is a
 * property it is FAIR to hold it to. A palette that never claimed to be physics is not failing when it isn't.
 */
export const SOURCES = Object.freeze([
    Object.freeze({ key: "doom", file: "render/doomFire.mjs", symbol: "PALETTE", steps: 36,
        claims: "the 1993 DOOM PSX palette, 37 stops, ported verbatim", blackbodyCandidate: false, sample: doomSample }),
    Object.freeze({ key: "ramp", file: "fx/voxelize/fireRamp.js", symbol: "blackbodyRamp", steps: 200,
        claims: "a temperature ramp, named for the blackbody", blackbodyCandidate: true, sample: rampSample }),
    Object.freeze({ key: "mesh", file: "physics/fire/fireMesh.js", symbol: "makeFireTexture", steps: 200,
        claims: "the fire-profile texture's three channel ramps", blackbodyCandidate: true, sample: meshSample }),
    Object.freeze({ key: "inferno", file: "demos_code/fitzhugh_nagumo.js", symbol: "infernoRamp", steps: 200,
        claims: "an Inferno-style perceptual colormap, black to purple to white", blackbodyCandidate: false, sample: infernoSample }),
]);

/** Every source measured, in one pass, so a caller and a gate cannot disagree about the numbers. */
export function census() {
    return SOURCES.map((s) => ({ key: s.key, file: s.file, symbol: s.symbol, claims: s.claims,
                                 blackbodyCandidate: s.blackbodyCandidate, drops: channelDrops(s.sample, s.steps) }));
}

/** What v4412 measured, so a later round reads a number rather than re-deriving one and calling it the same. */
export const MEASURED_AT_V4412 = Object.freeze({
    sources: 4,
    drops: Object.freeze({ doom: Object.freeze([5, 0, 0]), ramp: Object.freeze([0, 0, 0]),
                           mesh: Object.freeze([0, 0, 0]), inferno: Object.freeze([0, 0, 40]) }),
    // The two that shared the name `fireRamp`, and where they part company hardest. *** THE FIRST DRAFT OF
    // THIS RECORD TYPED gap 0.30 IN BLUE, read off the sample table by eye. widestDisagreement() says the
    // widest single-channel gap is 0.3255 IN RED at the same heat -- the blue gap is the one that carries the
    // ARGUMENT (purple against dark red) and the red gap is the one that is largest, and those are two
    // different questions. Both are recorded, and both are measured.
    nameCollision: Object.freeze({ was: "fireRamp", renamedTo: "infernoRamp",
                                   file: "demos_code/fitzhugh_nagumo.js",
                                   widest: Object.freeze({ gap: 0.3255, at: 0.2, channel: "r" }),
                                   blueAt02: Object.freeze({ ramp: 0.00, inferno: 0.30 }) }),
});
