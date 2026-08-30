// FILE: render/transitionModel.mjs -- v4204
//
// THE TREE'S OWN TRANSITIONS, IN JS, SO THE SPEC'S ENDPOINT LAW CAN BE MEASURED RATHER THAN ASSERTED.
//
// shaders/transitions/*.glsl are the shipped ones and render/transitionPass.js runs them. These are the same
// functions in JavaScript -- the crtModel.js / crtPass.js discipline of v4119, for the same reason: a shader
// can only be looked at, and a claim about what it outputs is worth what a measurement of it is worth.
//
// *** AND THE THING BEING MEASURED IS A LAW THE SPEC STATES AND NOTHING ENFORCES. *** "When progress is 0.0,
// exclusively the from texture must be rendered. When progress is 1.0, exclusively the to texture." A GLSL
// compiler cannot check that. A text scanner cannot check that. It is a property of the FUNCTION, so it takes
// evaluating the function, and a transition that fails it pops at the start or end of every single play.
//
// Each model takes (uv, ctx) where ctx is { progress, ratio, getFromColor, getToColor } -- deliberately the
// same four names the shader gets, so the two implementations read alike and drift is visible.
"use strict";

const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** GLSL smoothstep, including its behaviour when edge0 > edge1 -- which swekIris relies on to invert. */
export function smoothstep(e0, e1, x) {
    const t = clamp01((x - e0) / (e1 - e0 || 1e-30));
    return t * t * (3 - 2 * t);
}

export function crossfade(uv, ctx) {
    return mix(ctx.getFromColor(uv), ctx.getToColor(uv), ctx.progress);
}

export function wipe(uv, ctx, { direction = [1, 0], softness = 0.05 } = {}) {
    const r = ctx.ratio;
    const p = [(uv[0] - 0.5) * r, uv[1] - 0.5];
    let dx = direction[0] * r + 1e-6, dy = direction[1] + 1e-6;
    const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    const extent = 0.5 * (Math.abs(dx) * r + Math.abs(dy)) * 2;
    const t = (p[0] * dx + p[1] * dy) / Math.max(extent, 1e-6) + 0.5;
    const front = ctx.progress * (1 + 2 * softness) - softness;
    // Reversed edges: the factor is 1 where the wipe has already passed. See swekWipe.glsl for what the
    // other order costs -- an error of 1.0 at both endpoints, at every aspect ratio.
    return mix(ctx.getFromColor(uv), ctx.getToColor(uv), smoothstep(front + softness, front - softness, t));
}

export function iris(uv, ctx, { centre = [0.5, 0.5], softness = 0.03 } = {}) {
    const r = ctx.ratio;
    const p = [(uv[0] - centre[0]) * r, uv[1] - centre[1]];
    const far = [Math.max(centre[0], 1 - centre[0]) * r, Math.max(centre[1], 1 - centre[1])];
    const maxR = Math.hypot(far[0], far[1]);
    const rad = ctx.progress * (maxR + softness * 2) - softness;
    return mix(ctx.getFromColor(uv), ctx.getToColor(uv), smoothstep(rad + softness, rad - softness, Math.hypot(p[0], p[1])));
}

/** name -> model, matching shaders/transitions/<name>.glsl. The gate checks the two lists agree. */
export const MODELS = Object.freeze({ swekCrossfade: crossfade, swekWipe: wipe, swekIris: iris });
