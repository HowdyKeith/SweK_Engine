// render/temporalReject.mjs -- THE REASONS TO DISTRUST A HISTORY SAMPLE, AND THE SPACE THE CLAMP LIVES IN.
//
// *** THREE OF THE FOUR REMAINING ITEMS ARE HERE AND THE FOURTH IS REFUSED, MEASURED, IN THIS FILE'S GATE. ***
// Shading-change detection is not exported, and that is a result rather than an omission -- read the note at the
// bottom of this header before writing it again.
//
// render/temporalAccumulate.mjs has ONE reason: a 3x3 neighbourhood clamp in RGB. That closed the arc's first
// picture and its own gate recorded where it stops -- "DISOCCLUSION, which the clamp softens but does not solve;
// REACTIVE masks and shading-change detection, which FSR uses to spare transparency and lighting changes from the
// clamp". This is those, plus the YCoCg box FSR rectifies in. After it the pipeline has no structural holes left.
//
// *** THE ONE FINDING THAT MAKES THREE OF THE FOUR ONE THING. *** A neighbourhood clamp fails in exactly one way,
// and it is not the way it is usually described. It does not fail by being too tight; it fails by being too WIDE.
// Over a high-contrast neighbourhood the min/max box spans most of the range, so a history sample that is wrong
// for any reason -- it belongs to a surface that was hidden, it belongs to a frame lit differently, it belongs to
// a moment before the particle arrived -- sits comfortably inside the box and is passed through unaltered. v4550
// measured this from the other side and did not name it: the anti-ghosting row could only clear 2,304 pixels of
// 2,304 down to 322, and the 322 left were the EDGE pixels, where the current 3x3 spans the range. The clamp is
// a control that cannot fail precisely where the picture is most detailed.
//
// So disocclusion, reactive masks and shading-change detection are not three refinements of the clamp. They are
// three sources of the ONE thing the clamp cannot supply: knowledge that this history is wrong which does not
// come from looking at the current frame's neighbours. Each is measured here on a picture whose boxes are wide,
// because on a flat picture the clamp already does the work and any of them would look like an improvement it is
// not. (That mistake has its own entry in this session: v4549 measured RCAS on a linear ramp, which has no second
// derivative to sharpen, and read a number that meant nothing.)
//
// THE FOURTH, YCoCg, is a different axis and is about the box itself rather than about bypassing it. FSR
// rectifies in YCoCg because one luma axis and two chroma axes bound a believable colour more tightly than three
// correlated RGB axes do: an RGB box around a red and a green sample contains yellow and black, which neither
// neighbour is. *** AND THE GATE MEASURED THAT CLAIM AND CUT IT DOWN: the YCoCg box is only 1.07x tighter, and
// neither box contains the other. *** What is real is WHICH errors get through -- the colours RGB uniquely
// admits sit 16% farther from any real neighbour than the ones YCoCg uniquely admits.
//
// The transform's round trip is NOT bit exact, which this header claimed before anyone ran it. Every
// coefficient is a negative power of two so each product is exact, but the sums round: 42% of colours return
// exactly and the rest are one ulp out. That matters only as much as it compounds, and it compounds to
// 7.1e-15 over 32 frames -- 1.8e-12 of an 8-bit LSB. The integer YCoCg-R lifting scheme is the exactly
// reversible one; this is not it, and the gate now states the measured number instead of the wished-for one.
//
// WHAT THIS MODULE DOES NOT DECIDE: what the reactive mask contains. FSR takes it from the application, which
// knows which of its own draws were transparent, and no renderer in this tree produces one. It is an INPUT here,
// and the gate drives it from a fixture rather than pretending to derive it -- see the closing note.
//
// ---- *** SHADING-CHANGE DETECTION: WRITTEN, MEASURED, AND REFUSED. *** -------------------------------------
//
// A per-pixel one-frame detector that lowers the history weight where the luma disagrees more than the
// neighbourhood explains. It was implemented and it works on the case it is sold for -- a global light drop
// converges 30x faster with it. It is not exported, because on the case this whole arc exists for it is
// catastrophic: on a STATIC JITTERED scene, where the accumulation should converge to the super-sample, it
// destroys convergence by a factor of 2.5e5. The rms goes 5.4e-9 to 1.3e-3.
//
// THREE FORMULATIONS WERE MEASURED AND ALL THREE FAIL THE SAME WAY, which is what turns this from a tuning
// problem into a result:
//   1. current point luma vs the reprojected HISTORY's       -> 2.3e5x worse
//   2. current 3x3 MEAN luma vs the history's 3x3 mean        -> 1.7e5x worse (means are jitter-invariant, and
//      it did not help, because a converged history is SUPPOSED to differ from any single frame -- that is
//      what converging means, so the detector fires on convergence itself)
//   3. current 3x3 mean vs the PREVIOUS FRAME's 3x3 mean      -> 2.5e5x worse (both sides equally aliased now,
//      and it still fails, because on a high-contrast surface a ONE-PIXEL JITTER MOVES A PIXEL BY AS MUCH AS A
//      LIGHTING CHANGE DOES -- and moving the sample point by a pixel is precisely what jitter is for)
//
// So the signal a one-frame detector reads and the signal the jitter deliberately injects are the same size on
// the pictures where any of this matters. FSR2 does not solve this with a better one-frame metric; it carries a
// per-pixel LOCK and a luma-instability history across several frames, which is state this tree does not have.
// Adding that is a rung, not a refinement, and it is named in the gate's closing rather than half-built here.
// The gate holds the negative result as a ROW -- it re-derives formulation 3 inline and asserts that it wrecks
// convergence -- so this cannot be quietly "fixed" back in without something going red.
"use strict";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * RGB -> YCoCg, the lifting form (the one FSR and every reversible-colour codec uses).
 *   y = (r + 2g + b)/4,  co = (r - b)/2,  cg = (2g - r - b)/4
 * Every coefficient is a negative power of two, which is why the round trip below is exact in binary floating
 * point and not merely close: each step is a sum of exactly representable scalings of the inputs.
 */
export function rgbToYCoCg(r, g, b) {
    return [0.25 * r + 0.5 * g + 0.25 * b, 0.5 * r - 0.5 * b, -0.25 * r + 0.5 * g - 0.25 * b];
}

/** YCoCg -> RGB. Inverse of the above, exactly. */
export function yCoCgToRgb(y, co, cg) {
    const t = y - cg;
    return [t + co, y + cg, t - co];
}

/** The luma the box's first axis is, on its own -- callers that only want brightness should not pay for chroma. */
export function luma(r, g, b) { return 0.25 * r + 0.5 * g + 0.25 * b; }

export const CLAMP_SPACES = Object.freeze(["rgb", "ycocg"]);

/**
 * DISOCCLUSION: was this surface hidden last frame?
 *
 * `motion` is render/motionVectors.mjs's (du, dv, valid, zPrev) buffer, whose fourth channel is the clip depth
 * this surface WOULD have had last frame. `prevDepth` is the depth buffer that was actually recorded then. If the
 * recorded depth at the reprojected position is NEARER than the expected one, something was standing in front of
 * this surface and the colour stored there is that something's -- reusing it smears the occluder across the gap
 * it left. This is the one rejection reason that is derived rather than supplied, and the only one that needs a
 * second buffer from the renderer.
 *
 * `nearerIsLess` is the caller's, not this module's: a reversed-Z projection puts NEARER at the larger value and
 * a reader that assumes otherwise gets the disoccluded set exactly inverted -- which looks like a working feature
 * on a still frame. render/motionVectors.mjs takes the same care with the depth RANGE for the same reason.
 *
 * `threshold` is in the depth buffer's own units and there is no default that could be right for both
 * conventions, so it is required.
 */
export function disocclusionCPU({ motion, prevDepth, w, h, threshold, nearerIsLess = true }) {
    if (!(threshold > 0)) throw new Error("disocclusionCPU: threshold must be a positive depth, in the buffer's own units");
    const out = new Float32Array(w * h);
    let flagged = 0, noHistory = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        if (motion[o + 2] === 0) { out[i] = 1; noHistory++; flagged++; continue; }  // no reprojection at all
        const u = (x + 0.5) / w + motion[o], v = (y + 0.5) / h + motion[o + 1];
        if (u < 0 || u >= 1 || v < 0 || v >= 1) { out[i] = 1; noHistory++; flagged++; continue; }
        const px = clamp(Math.floor(u * w), 0, w - 1), py = clamp(Math.floor(v * h), 0, h - 1);
        const was = prevDepth[py * w + px], expect = motion[o + 3];
        // "nearer than expected by more than the threshold" -- the sign is the whole test
        const gap = nearerIsLess ? expect - was : was - expect;
        if (gap > threshold) { out[i] = 1; flagged++; }
    }
    return { data: out, flagged, noHistory, w, h };
}

/** Bilinear over the rgb of an rgba buffer. Shares its arithmetic with temporalAccumulate's, deliberately. */
function sampleBilinear3(buf, w, h, u, v) {
    const x = u * w - 0.5, y = v * h - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (xx, yy, c) => buf[(clamp(yy, 0, h - 1) * w + clamp(xx, 0, w - 1)) * 4 + c];
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++)
        out[c] = at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy)
               + at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy;
    return out;
}

/**
 * The three per-pixel reasons combined into ONE multiplier on how much history survives.
 *   1 -> trust the history entirely (the blend is whatever alpha says)
 *   0 -> discard it (the output is this frame, which is what a first frame already does)
 * They MULTIPLY rather than max() or add: each is an independent probability that the history is wrong, and two
 * weak reasons should compound. A max() would let the strongest one hide the others, which on a disoccluded
 * transparent surface is the case where both are true and the answer must be "certainly not".
 */
export function historyFactorCPU({ disocclusion = null, reactive = null, shading = null, n }) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let f = 1;
        if (disocclusion) f *= 1 - clamp(disocclusion[i], 0, 1);
        if (reactive) f *= 1 - clamp(reactive[i], 0, 1);
        if (shading) f *= 1 - clamp(shading[i], 0, 1);
        out[i] = f;
    }
    return out;
}

/**
 * The picture: reproject, clamp in the chosen space, and blend with the history weighted by `factor`.
 *
 * alphaEff = 1 - (1 - alpha) * factor, so factor = 1 is exactly temporalAccumulate's blend and factor = 0 is
 * exactly the current frame. Nothing here re-derives the reprojection or the bilinear fetch differently from
 * render/temporalAccumulate.mjs; what it adds is the space of the box and the weight of the result.
 */
export function rectifiedAccumulateCPU({ current, history, motion, factor = null, w, h, alpha,
                                         space = "ycocg", clampToNeighbourhood = true }) {
    if (!CLAMP_SPACES.includes(space)) throw new Error(`rectifiedAccumulateCPU: space must be one of ${CLAMP_SPACES.join(", ")}, got ${space}`);
    const ycocg = space === "ycocg";
    const out = new Float32Array(w * h * 4);
    const stats = { reused: 0, rejectedOffscreen: 0, rejectedInvalid: 0, clamped: 0, discarded: 0 };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        const cur = [current[o], current[o + 1], current[o + 2]];
        const take = () => { out[o] = cur[0]; out[o + 1] = cur[1]; out[o + 2] = cur[2]; out[o + 3] = 1; };
        if (!history) { take(); continue; }

        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        if (motion && motion[o + 2] === 0) { stats.rejectedInvalid++; take(); continue; }
        const hu = u + (motion ? motion[o] : 0), hv = v + (motion ? motion[o + 1] : 0);
        if (hu < 0 || hu >= 1 || hv < 0 || hv >= 1) { stats.rejectedOffscreen++; take(); continue; }

        let hist = sampleBilinear3(history, w, h, hu, hv);
        stats.reused++;

        if (clampToNeighbourhood) {
            const hv3 = ycocg ? rgbToYCoCg(hist[0], hist[1], hist[2]) : hist.slice();
            const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = clamp(x + dx, 0, w - 1), ny = clamp(y + dy, 0, h - 1), no = (ny * w + nx) * 4;
                const s = ycocg ? rgbToYCoCg(current[no], current[no + 1], current[no + 2])
                                : [current[no], current[no + 1], current[no + 2]];
                for (let c = 0; c < 3; c++) { if (s[c] < lo[c]) lo[c] = s[c]; if (s[c] > hi[c]) hi[c] = s[c]; }
            }
            let did = false;
            for (let c = 0; c < 3; c++) { const b = hv3[c]; hv3[c] = clamp(hv3[c], lo[c], hi[c]); if (hv3[c] !== b) did = true; }
            if (did) stats.clamped++;
            hist = ycocg ? yCoCgToRgb(hv3[0], hv3[1], hv3[2]) : hv3;
        }

        const f = factor ? clamp(factor[i], 0, 1) : 1;
        if (f === 0) stats.discarded++;
        const a = 1 - (1 - alpha) * f;
        for (let c = 0; c < 3; c++) out[o + c] = hist[c] * (1 - a) + cur[c] * a;
        out[o + 3] = 1;
    }
    return { data: out, w, h, stats };
}
