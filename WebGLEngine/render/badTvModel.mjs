// FILE: render/badTvModel.mjs -- v4182
//
// CPU reference for render/badTvPass.js, ported from felixturner/bad-tv-shader (MIT (c) Felix Turner).
//
// *** IT DOES NOT OVERLAP render/crtModel.js, AND THE SPLIT IS THE WHOLE REASON TO HAVE BOTH. *** crtModel
// does OPTICS -- curvature, scanline count, aperture mask, vignette, bleed, tint -- which is what the TUBE
// does to a signal that arrived intact. This does SIGNAL: horizontal tearing from a tracking error, and
// vertical roll. One is glass and phosphor; the other is the broadcast failing before the glass ever sees it.
// SweK's CRT today is a perfect picture on a bad tube, which is why it reads as a filter rather than a set.
//
// ---- *** THE ORDER THEY COMPOSE IN IS PHYSICAL, NOT A PREFERENCE *** --------------------------------------
// Signal damage FIRST, then tube optics on the damaged signal. A tube cannot un-tear a torn signal, and it
// certainly cannot scan a line it never received. Applied the other way round the scanlines would be laid
// down on an undistorted image and then smeared sideways along with it -- which no CRT has ever done, and
// which looks like a wobbling grille rather than a broken transmission. COMPOSE_ORDER below states it and the
// gate asserts callers follow it.
//
// ---- THE CUBE IS THE CHARACTER, AND IT IS THE FIRST THING A TIDY-UP WOULD DESTROY --------------------------
// The original computes:  offset = offset*distortion * offset*distortion * offset
// which is offset^3 * distortion^2. Written as a product of five terms it looks like a typo begging to be
// "simplified" to offset * distortion. It is not: CUBING makes small noise values almost nothing and large
// ones very large, so the picture sits nearly still and then tears hard. Linear, it would wobble constantly
// and never tear -- a different effect wearing the same knobs.
"use strict";

import { snoise2 } from "../shaders/ashimaNoise.mjs";

/** The original's uniform defaults, kept exactly. */
export const DEFAULTS = Object.freeze({
    distortion: 3.0,      // thick tearing
    distortion2: 5.0,     // fine grain
    speed: 0.2,           // how fast the distortion pattern travels vertically
    rollSpeed: 0.1,       // vertical roll
});

/** Fixed frequencies from the original -- not exposed as uniforms there, so named here rather than buried. */
export const COARSE_FREQ = 3.0;    // the thick tear's noise frequency
export const FINE_FREQ = 50.0;     // the fine grain's
export const COARSE_GAIN = 0.2;    // scales the coarse noise BEFORE the cube
export const FINE_GAIN = 0.001;    // scales the fine noise after its distortion2 multiply

/**
 * *** THE ORDER A CALLER MUST COMPOSE THESE IN. *** Signal first, optics second. Exported as data so the gate
 * can check it rather than trusting a sentence in a comment.
 */
export const COMPOSE_ORDER = Object.freeze(["badTv", "crt"]);

/**
 * The horizontal offset applied to row v at time t. Depends ONLY on the row -- x never enters -- which is
 * exactly why the artifact is horizontal TEARING and not a general warp.
 */
export function offsetAt(v, time, knobs = {}) {
    const distortion = knobs.distortion ?? DEFAULTS.distortion;
    const distortion2 = knobs.distortion2 ?? DEFAULTS.distortion2;
    const speed = knobs.speed ?? DEFAULTS.speed;
    const yt = v - time * speed;
    let offset = snoise2(yt * COARSE_FREQ, 0) * COARSE_GAIN;
    // offset^3 * distortion^2 -- see the note above on why this is not offset * distortion
    offset = offset * distortion * offset * distortion * offset;
    offset += snoise2(yt * FINE_FREQ, 0) * distortion2 * FINE_GAIN;
    return offset;
}

/** fract, GLSL's -- which for a negative input returns a POSITIVE fraction, unlike a bare % in JavaScript. */
export function fract(x) { return x - Math.floor(x); }

/**
 * Where the pixel at (u, v) samples the source at time t.
 *
 * Both axes are wrapped with fract: the tear wraps around the screen edge rather than clamping, and the roll
 * wraps top to bottom. Using a JavaScript % here instead would return a NEGATIVE value for a negative input
 * and sample outside the texture, which reads as a black band rolling through the picture.
 */
export function sampleAt(u, v, time, knobs = {}, strength = 1) {
    const rollSpeed = knobs.rollSpeed ?? DEFAULTS.rollSpeed;
    // Level 11 -- `strength` is the spatial field's value at this pixel (render/strengthField.mjs): both
    // displacements scale by it BEFORE the wrap, so 0 is the identity and 1 is the scalar effect exactly.
    return [fract(u + offsetAt(v, time, knobs) * strength), fract(v - time * rollSpeed * strength)];
}

/**
 * How far, in UV, the worst row is torn at this moment. For a caller deciding texture wrapping, and for
 * anyone who wants to know whether a knob setting is about to throw the picture off the screen.
 */
export function maxTear(time, knobs = {}, samples = 256) {
    let worst = 0;
    for (let i = 0; i < samples; i++) {
        const o = Math.abs(offsetAt(i / samples, time, knobs));
        if (o > worst) worst = o;
    }
    return worst;
}
