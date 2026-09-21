// render/reactive.mjs -- THE LAST INPUT THE FACTOR PASS ACCEPTS AND NOTHING IN THIS TREE PRODUCED.
//
// render/temporalRejectWgsl.mjs's FACTOR kernel multiplies three independent reasons the history might be
// wrong: DISOCCLUSION (v4593 gave it a producer), SHADING (v4654 gave it one, render/temporalLock.mjs's) and
// REACTIVE. The third has been a binding with no source since v4594 -- fsr.html passed null, every gate
// passed a zeroed buffer, and temporalRejectGPU's own closing line said so: "nothing in this tree produces a
// reactive mask at all".
//
// ---- WHAT REACTIVITY IS, AND WHY IT IS NOT THE OTHER TWO ------------------------------------------------------
//
// FSR2 takes a reactive mask from the APPLICATION, which marks the pixels it knows are unreliable -- particles,
// additive and alpha-blended surfaces, anything drawn without writing the depth and motion the reprojection is
// built on. Those pixels reproject perfectly and still carry the wrong history, because the buffers describe
// the surface BEHIND the effect rather than the effect.
//
// This module does not have an application to ask, so it derives the same thing from what the frame already
// has, which is FSR2's own "auto-reactive" idea: *** A PIXEL IS REACTIVE WHERE THE COLOUR DISAGREES WITH ITS
// REPROJECTED HISTORY AND THE DEPTH SAYS THE REPROJECTION WAS SOUND. ***
//
// The depth gate is the whole design, and without it this is a second disocclusion detector wearing another
// name: where the surface genuinely changed, the colour disagrees too, and a mask that fired there would
// double-count a reason the factor pass already multiplies in. What is left after the gate is the case neither
// of the other two can see -- same surface, correctly followed, different colour.
//
// *** AND IT IS NOT THE SHADING MASK EITHER, WHICH IS A DIFFERENT INSTRUMENT ON PURPOSE. *** render/temporal
// Lock.mjs compares the newer half of a jitter-free LUMA ring against the older half over 2*period frames: a
// slow, sustained change in the light, measured where the jitter cancels exactly. This is ONE frame and all
// three channels. A particle that appears and vanishes inside a period is invisible to the ring and obvious
// here; a light that brightens over fifty frames is the reverse. They overlap and neither contains the other,
// which is why the factor pass multiplies rather than maxes.
//
// ---- WHAT IT REFUSES ------------------------------------------------------------------------------------------
//
//   * NO HISTORY, NO ANSWER. On the first frame, and at any pixel whose motion is invalid or reprojects off
//     the frame, the answer is 0 and NOT 1. Those pixels are already fully handled by the disocclusion mask,
//     which writes 1 for exactly that case; writing 1 here as well would multiply the same reason twice and
//     discard a history the chain had already decided to discard. `noHistory` counts them so a caller can see
//     the size of the set this module declined to judge.
//   * THE THRESHOLD IS THE CALLER'S, in the depth buffer's own units, for the reason disocclusionCPU refuses a
//     default: a [0,1] projection and a [-1,1] one do not share a scale.
//   * `scale` IS THE CALLER'S TOO -- the colour range the content spans. A detector normalised by something
//     this module invented is a detector nobody can reason about, which is render/temporalLock.mjs's rule.
"use strict";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Bilinear over the rgb of an rgba buffer -- the same arithmetic temporalReject's sampler uses, deliberately. */
function sample3(buf, w, h, u, v) {
    const x = u * w - 0.5, y = v * h - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (xx, yy, c) => buf[(clamp(yy, 0, h - 1) * w + clamp(xx, 0, w - 1)) * 4 + c];
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
        const a = at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx;
        const b = at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx;
        out[c] = a * (1 - fy) + b * fy;
    }
    return out;
}

/**
 * The reactive mask on the CPU: the ground truth the WGSL is held to.
 *
 * Returns { data, flagged, noHistory, w, h } -- `data` in [0,1], `flagged` the count at or above 0.05 (a
 * reported figure, not a threshold the mask itself applies), `noHistory` the pixels declined for having no
 * sound reprojection to compare against.
 */
export function reactiveCPU({ current, history, motion, prevDepth, w, h, threshold, scale = 1,
                              nearerIsLess = true, strength = 1 }) {
    if (!(threshold > 0)) throw new Error("reactiveCPU: threshold must be a positive depth, in the buffer's own units -- the same refusal disocclusionCPU makes, and for the same reason: a [0,1] projection and a [-1,1] one do not share a scale");
    if (!(scale > 0)) throw new Error(`reactiveCPU: scale must be positive -- got ${scale}. It is the colour range the content spans and it is the CALLER's, because a detector normalised by a number this module invented is one nobody can reason about.`);
    const out = new Float32Array(w * h);
    let flagged = 0, noHistory = 0;
    if (!history) return { data: out, flagged: 0, noHistory: w * h, w, h };   // frame one: nothing to disagree with
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        // NO HISTORY, NO ANSWER -- 0 and not 1. See the header: the disocclusion mask already writes 1 here.
        if (motion[o + 2] === 0) { noHistory++; continue; }
        const u = (x + 0.5) / w + motion[o], v = (y + 0.5) / h + motion[o + 1];
        if (u < 0 || u >= 1 || v < 0 || v >= 1) { noHistory++; continue; }
        // *** THE DEPTH GATE, WHICH IS THE WHOLE DESIGN. *** Where the surface genuinely changed, the colour
        // disagrees too; firing there would report a disocclusion under another name and multiply one reason
        // into the factor twice.
        const px = clamp(Math.floor(u * w), 0, w - 1), py = clamp(Math.floor(v * h), 0, h - 1);
        const gap = nearerIsLess ? motion[o + 3] - prevDepth[py * w + px] : prevDepth[py * w + px] - motion[o + 3];
        if (gap > threshold) { noHistory++; continue; }                       // disocclusion's business, not this
        const h3 = sample3(history, w, h, u, v);
        // all three channels, because a particle can be chromatic without moving the luma at all -- which is
        // exactly the case the luma ring cannot see
        let d = 0;
        for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(current[o + c] - h3[c]));
        const r = clamp(strength * d / scale, 0, 1);
        out[i] = r;
        if (r >= 0.05) flagged++;
    }
    return { data: out, flagged, noHistory, w, h };
}
