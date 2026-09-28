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
// ---- WHAT IT IS NOT COMPENSATED FOR, AND THE HYPOTHESIS THAT PREDICTED IT WOULD MATTER --------------------
//
// *** THIS MASK HAS NO JITTER COMPENSATION, AND v4659 EXPECTED THAT TO BE THE DEFECT. IT IS NOT. ***
// It compares ONE jittered frame against a reprojected history, so on paper the sub-pixel offset should read
// as reactivity -- unlike render/temporalLock.mjs's ring, whose two halves span the same whole phase periods
// so the jitter cancels exactly. v4658 had measured this mask making 14 of 51 frames WORSE, one by 1.22 dB,
// and jitter was the stated suspicion.
//
// MEASURED, by pairing each frame's PSNR delta with the offset fsr.html prints for that same frame:
//
//     |j|, the offset from the pixel centre        r = +0.17   p = 0.54
//     |j_cur - j_prev|, the frame-to-frame step    r = +0.06   p = 0.67
//     mean |j| over the HARMED frames  0.343
//     mean |j| over the HELPED frames  0.401
//
// The sign is BACKWARDS from the hypothesis -- more jitter goes with more benefit, not less -- and neither
// magnitude is anything. The harm v4658 found is real and reproducible (the pipeline is deterministic; the
// fifty-one figures re-run bit-identical) and IT IS STILL UNEXPLAINED. This block says so rather than
// leaving the absence of a note to read as an absence of a problem. Adding jitter compensation here would
// be a change made against a refuted hypothesis.
//
// ---- WHAT IT REFUSES ------------------------------------------------------------------------------------------
//
//   * NO HISTORY, NO ANSWER. On the first frame, and at any pixel whose motion is invalid or reprojects off
//     the frame, the answer is 0 and NOT 1. Those pixels are already fully handled by the disocclusion mask,
//     which writes 1 for exactly that case; writing 1 here as well would multiply the same reason twice and
//     discard a history the chain had already decided to discard. `noHistory` counts them so a caller can see
//     the size of the set this module declined to judge -- and since v4659 `declinedInvalid`,
//     `declinedOffscreen` and `declinedDepth` say WHICH, because the depth-gated third of that set is not a
//     pixel without history at all and reacting to it as though it were is the mistake the sum invites.
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
 * Returns { data, flagged, noHistory, declinedInvalid, declinedOffscreen, declinedDepth, w, h }.
 * `data` is in [0,1]; `flagged` the count at or above 0.05 (a reported figure, not a threshold the mask
 * itself applies).
 *
 * *** THE THREE DECLINES ARE COUNTED SEPARATELY, AND UNTIL v4659 THEY WERE ONE NUMBER UNDER A NAME THAT
 * FITS TWO OF THEM. *** `noHistory` is their SUM and keeps its meaning for every caller that had it, but a
 * pixel with invalid motion, a pixel that reprojects off the frame, and a pixel the DEPTH GATE turned away
 * are three different events, and the third is not "no history" at all -- that pixel has a history, the
 * history is sound, and this module declined it because the disagreement is disocclusion's to report. A
 * caller reading the sum cannot tell a frame where the reprojection collapsed from a frame where the gate
 * did its job, and those want opposite reactions. It is the same defect render/temporalRejectWgsl.mjs's
 * disocclusion mask has already been through once: one mask value written for three reasons, recoverable
 * only by counting them as they happen, which is why THAT kernel grew atomics rather than a second pass.
 *
 * The identity noHistory === declinedInvalid + declinedOffscreen + declinedDepth holds on both mirrors and
 * is a gate row on both, because a sum that stops matching its parts is how a split silently half-lands.
 */
/**
 * The single place noHistory is computed. It is DERIVED from the three declines and never accumulated beside
 * them: a fourth counter incremented at the same three sites is a fourth chance to miss one, and BOTH return
 * paths go through here so neither can restate it.
 */
function tally(data, flagged, declinedInvalid, declinedOffscreen, declinedDepth, w, h) {
    return { data, flagged, noHistory: declinedInvalid + declinedOffscreen + declinedDepth,
             declinedInvalid, declinedOffscreen, declinedDepth, w, h };
}

export function reactiveCPU({ current, history, motion, prevDepth, w, h, threshold, scale = 1,
                              nearerIsLess = true, strength = 1 }) {
    if (!(threshold > 0)) throw new Error("reactiveCPU: threshold must be a positive depth, in the buffer's own units -- the same refusal disocclusionCPU makes, and for the same reason: a [0,1] projection and a [-1,1] one do not share a scale");
    if (!(scale > 0)) throw new Error(`reactiveCPU: scale must be positive -- got ${scale}. It is the colour range the content spans and it is the CALLER's, because a detector normalised by a number this module invented is one nobody can reason about.`);
    const out = new Float32Array(w * h);
    let flagged = 0, declinedInvalid = 0, declinedOffscreen = 0, declinedDepth = 0;
    // frame one: nothing to disagree with. Every pixel is declined, and INVALID is the honest bucket -- there
    // is no motion to follow anywhere, which is not the same as following it off the frame. It goes through
    // the SAME derivation the main return uses rather than restating w*h beside it: the rule below is that
    // noHistory is never written next to its own parts, and an early return is not an exemption from it.
    if (!history) { declinedInvalid = w * h; return tally(out, 0, declinedInvalid, 0, 0, w, h); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        // NO HISTORY, NO ANSWER -- 0 and not 1. See the header: the disocclusion mask already writes 1 here.
        if (motion[o + 2] === 0) { declinedInvalid++; continue; }
        const u = (x + 0.5) / w + motion[o], v = (y + 0.5) / h + motion[o + 1];
        if (u < 0 || u >= 1 || v < 0 || v >= 1) { declinedOffscreen++; continue; }
        // *** THE DEPTH GATE, WHICH IS THE WHOLE DESIGN. *** Where the surface genuinely changed, the colour
        // disagrees too; firing there would report a disocclusion under another name and multiply one reason
        // into the factor twice.
        const px = clamp(Math.floor(u * w), 0, w - 1), py = clamp(Math.floor(v * h), 0, h - 1);
        const gap = nearerIsLess ? motion[o + 3] - prevDepth[py * w + px] : prevDepth[py * w + px] - motion[o + 3];
        if (gap > threshold) { declinedDepth++; continue; }                   // disocclusion's business, not this
        const h3 = sample3(history, w, h, u, v);
        // all three channels, because a particle can be chromatic without moving the luma at all -- which is
        // exactly the case the luma ring cannot see
        let d = 0;
        for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(current[o + c] - h3[c]));
        const r = clamp(strength * d / scale, 0, 1);
        out[i] = r;
        if (r >= 0.05) flagged++;
    }
    return tally(out, flagged, declinedInvalid, declinedOffscreen, declinedDepth, w, h);
}
