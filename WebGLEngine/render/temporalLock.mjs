// render/temporalLock.mjs -- PER-PIXEL STATE ACROSS FRAMES: a luma ring, a lock, and the shading detector
// v4552 proved a single frame cannot build.
//
// *** THIS RUNG EXISTS BECAUSE OF A NEGATIVE RESULT, AND IT IS THE ONE THAT ANSWERS IT. *** v4552 wrote a
// shading-change detector three different ways and refused all three: on a high-contrast surface a ONE-PIXEL
// JITTER MOVES A PIXEL BY AS MUCH AS A LIGHTING CHANGE DOES, so a one-frame difference cannot separate "the
// light changed" from "the sample moved", and moving the sample point by a pixel is precisely what jitter is
// for. That refusal is still in render/temporalReject-selfcheck.mjs section 5 and this module does not repeal
// it -- a one-frame detector is still refused. What changes is that a WINDOW can do what a frame cannot, and
// the reason is arithmetic rather than tuning:
//
//   MEASURED on a static scene under Halton jitter, worst |mean(window A) - mean(window B)| for adjacent
//   windows, against a light-drop signal of 0.2331:
//       window 1 frame  (v4552's detector)   residue 2.365e-1   -- signal-to-residue 0.99, hopeless
//       window 4 frames (FSR2's ring size)   residue 5.912e-2   -- 3.9
//       window 8 frames (THE PHASE COUNT)    residue 0.000e+0   -- exact
//
// *** AND IT IS NOT MONOTONIC IN THE WINDOW LENGTH, WHICH IS THE DESIGN RULE. *** Window 3 leaves 1.577e-1,
// WORSE than window 2's 1.182e-1. Averaging more frames does not help; averaging a WHOLE NUMBER OF JITTER
// PERIODS does, because the same phase offsets recur and contribute identically to both windows. So the ring
// length is not a taste parameter -- it is jitterPhaseCount(ratio) from render/jitter.mjs, and a caller who
// picks 4 because FSR2 does is choosing a detector with a fifth of the separation on this tree's sequence.
//
// TWO OUTPUTS, TWO JOBS, and they are not the same statistic:
//   * SHADING SHIFT is the sliding ring mean against a lagged copy of itself. Both sides are jitter-free, so
//     what survives is a change in the light. This is the detector.
//   * INSTABILITY is the spread WITHIN the ring. On a jittered edge it is large and legitimate -- it is the
//     jitter -- so it is NOT a shading detector and is not used as one. It is what kills a lock, which is the
//     job FSR2 gives it.
//
// THE LOCK is the other half. A feature THINNER THAN A PIXEL is caught by some jitter phases and missed by
// others; on the frames that miss it the current 3x3 has no trace of it, the neighbourhood clamp rejects the
// history that does, and the feature flickers out. A lock marks such a pixel when it IS caught -- a local luma
// extremum -- and relaxes the clamp for a few frames so the history survives the frames that miss. Locks that
// never die are worse than no locks, so the kill rules are part of the thing and are gated: a lock dies on
// disocclusion, on the surface leaving the screen, and when the ring says the pixel has gone unstable for a
// reason other than the feature.
"use strict";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The luma the ring stores -- render/temporalReject.mjs's, deliberately, so there is one definition. */
export { luma } from "./temporalReject.mjs";
import { luma as lumaOf } from "./temporalReject.mjs";

/**
 * The per-pixel ring. `frames` MUST be a whole number of jitter periods -- pass jitterPhaseCount(ratio) -- and
 * is refused otherwise, because a ring that is not is a detector with jitter left in it and no way to tell.
 */
export function makeLumaState(w, h, period) {
    if (!Number.isInteger(period) || period < 1) throw new Error("makeLumaState: period must be a positive integer -- pass jitterPhaseCount(ratio) from render/jitter.mjs");
    // *** THE RING IS TWO PERIODS, NOT ONE, AND THAT IS THE WHOLE MECHANISM. *** The detector compares the mean
    // of the newer period against the mean of the older one. Both halves span the same set of jitter phases, so
    // the jitter contributes IDENTICALLY to each and cancels in the difference -- exactly, not approximately.
    // An earlier draft kept one period and compared it to an exponential moving average of itself; that was an
    // implementation of something never measured, and it cost 1.0e5x on the static-convergence fixture because
    // an EMA is always still catching up and its lag is a permanent residual. The two-window form is what the
    // premise measurement actually established, so it is what is built.
    // the scratch pair is allocated once and swapped: pushLuma is called once per frame per sequence and this
    // gate runs a dozen sequences, so allocating a fresh ring each time made the garbage collector 10% of the
    // gate's runtime -- measured, when the gate came in over the sweep's 3,000 ms budget.
    return { w, h, period, frames: 2 * period, ring: new Float32Array(w * h * 2 * period),
             filled: new Uint8Array(w * h), n: 0,
             scratchRing: new Float32Array(w * h * 2 * period), scratchFilled: new Uint8Array(w * h) };
}

/** Bilinear over one channel of a w*h scalar field, edge-clamped. */
function sampleScalar(buf, w, h, u, v, stride = 1, off = 0) {
    const x = u * w - 0.5, y = v * h - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (xx, yy) => buf[(clamp(yy, 0, h - 1) * w + clamp(xx, 0, w - 1)) * stride + off];
    return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy)
         + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
}

/**
 * Push this frame's luma, REPROJECTING the ring first.
 *
 * *** THE REPROJECTION IS NOT OPTIONAL AND IT IS THE THING MOST LIKELY TO BE LEFT OUT. *** A ring indexed by
 * screen position holds, for a moving camera, the luma of whatever surface happened to be at that pixel -- so
 * its mean is an average over different surfaces and its spread is the scene sliding past, not the pixel
 * changing. Both outputs then measure the camera. The gate drives this with a camera translation.
 *
 * `motion` is render/motionVectors.mjs's (du, dv, valid, zPrev). Where there is no history the ring is reset
 * to this frame's luma and marked unfilled, which is the same first-frame rule the rest of the arc keeps.
 */
export function pushLuma(st, { current, motion, w, h }) {
    const F = st.frames, N = w * h;
    const nextRing = st.scratchRing, nextFilled = st.scratchFilled;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        const l = lumaOf(current[o], current[o + 1], current[o + 2]);
        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const valid = motion ? motion[o + 2] !== 0 : true;
        const hu = u + (motion ? motion[o] : 0), hv = v + (motion ? motion[o + 1] : 0);
        const usable = st.n > 0 && valid && hu >= 0 && hu < 1 && hv >= 0 && hv < 1;
        if (!usable) {                          // no history for this surface -- start the ring at this frame
            for (let k = 0; k < F; k++) nextRing[i * F + k] = l;
            nextFilled[i] = 0;
            continue;
        }
        for (let k = 0; k < F - 1; k++) nextRing[i * F + k] = sampleScalar(st.ring, w, h, hu, hv, F, k + 1);
        nextRing[i * F + F - 1] = l;
        nextFilled[i] = Math.min(255, sampleScalarFilled(st.filled, w, h, hu, hv) + 1);
    }
    st.scratchRing = st.ring; st.scratchFilled = st.filled;    // swap, never allocate
    st.ring = nextRing; st.filled = nextFilled; st.n++;
    return st;
}

function sampleScalarFilled(buf, w, h, u, v) {
    const x = clamp(Math.round(u * w - 0.5), 0, w - 1), y = clamp(Math.round(v * h - 0.5), 0, h - 1);
    return buf[y * w + x];
}

/** The jitter-free sliding mean: any F consecutive frames span a whole number of periods. */
export function lumaMean(st) {
    const N = st.w * st.h, F = st.frames, P = st.period, out = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 0; for (let k = P; k < F; k++) m += st.ring[i * F + k]; out[i] = m / P; }
    return out;
}

/** The mean of the OLDER period -- one whole period ago, and therefore carrying the same jitter phases. */
export function lumaMeanPrev(st) {
    const N = st.w * st.h, F = st.frames, P = st.period, out = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 0; for (let k = 0; k < P; k++) m += st.ring[i * F + k]; out[i] = m / P; }
    return out;
}

/** Spread WITHIN the ring, as a mean absolute deviation. Large on a jittered edge, and legitimately so. */
export function lumaInstability(st) {
    const N = st.w * st.h, F = st.frames, P = st.period, out = new Float32Array(N), m = lumaMean(st);
    for (let i = 0; i < N; i++) { let a = 0; for (let k = P; k < F; k++) a += Math.abs(st.ring[i * F + k] - m[i]); out[i] = a / P; }
    return out;
}

/**
 * THE DETECTOR v4552 COULD NOT BUILD: the sliding mean against a lagged copy of itself, both jitter-free.
 * Returned in [0, 1] as a fraction of `scale` (a luma range; the caller's, because a detector normalised by
 * something this module invents is a detector nobody can reason about).
 *
 * A pixel whose ring is not yet full returns 0 -- not because nothing changed, but because nothing is known.
 * v4402's rule: an absence read as a pass is the failure this tree keeps finding.
 */
export function shadingShiftCPU(st, { scale = 1, strength = 1 } = {}) {
    const N = st.w * st.h, out = new Float32Array(N), m = lumaMean(st), p = lumaMeanPrev(st);
    let unknown = 0;
    for (let i = 0; i < N; i++) {
        if (st.filled[i] < st.frames) { out[i] = 0; unknown++; continue; }
        out[i] = clamp(strength * Math.abs(m[i] - p[i]) / (scale || 1), 0, 1);
    }
    return { data: out, unknown };
}

// ---- THE LOCK -----------------------------------------------------------------------------------------------

export function makeLockState(w, h) { return { w, h, life: new Float32Array(w * h) }; }

/**
 * A new lock where the pixel is a strict local luma extremum ALONG EITHER AXIS -- brighter (or darker) than
 * both horizontal neighbours, or than both vertical ones, by more than `margin`.
 *
 * *** ALONG AN AXIS, NOT AGAINST ALL EIGHT NEIGHBOURS, AND THE DIFFERENCE IS THE WHOLE DETECTOR. *** The first
 * draft asked for a strict 3x3 extremum and found NOTHING on a vertical line one pixel wide -- of course it
 * did: the pixels directly above and below a lit pixel on a vertical line are equally lit, so no pixel on any
 * straight thin feature is ever brighter than all eight. It measured 1.00x against no lock at all and looked
 * like a working feature that simply did not help. A thin feature is thin in ONE direction; testing both axes
 * separately is what "thin" means, and it catches a vertical line horizontally, a horizontal line vertically,
 * and an isolated dot on both.
 */
/**
 * The ridge test over a SCALAR luma field: a strict extremum along either axis by more than `margin`.
 * One definition, two callers -- newLocksCPU wraps it for an rgba frame and lockCandidatesFromRing for the
 * ring's jitter-free mean, which is the input that actually works.
 */
export function ridgesCPU(lumaField, w, h, margin = 0.05) {
    const out = new Uint8Array(w * h);
    let n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const c = lumaField[i];
        const l = lumaField[i - 1], r = lumaField[i + 1], u = lumaField[i - w], d = lumaField[i + w];
        const ridgeX = (c - l > margin && c - r > margin) || (l - c > margin && r - c > margin);
        const ridgeY = (c - u > margin && c - d > margin) || (u - c > margin && d - c > margin);
        if (ridgeX || ridgeY) { out[i] = 1; n++; }
    }
    return { data: out, count: n };
}

/**
 * DEPTH RIDGES: the same ridge test, run over the depth buffer instead of over luma.
 *
 * *** THIS IS THE THING v4553 SECTION 5 SAID LUMA CANNOT DO, AND IT IS THE SAME FIVE LINES. *** That row
 * measured a luma lock detector locking 1,340 of 2,304 pixels on a chequer at the pixel scale and making the
 * ghost 26% worse, and concluded there is no luma-only test separating a thin bright feature from a texture at
 * the pixel scale -- because at that scale they are the same signal. They are not the same signal in DEPTH: a
 * wire is nearer than both its neighbours and a painted texture is on the surface, at its neighbours' depth.
 *
 * WHAT THE RIDGE TEST SEPARATES, measured on four depth fields of one column each (16x16, margin 0.02):
 *     a WIRE, nearer than both neighbours            14 ridges
 *     a SLOT, farther than both -- a gap showing through   14 ridges
 *     a SILHOUETTE EDGE, differing from ONE side      0 ridges
 *     a TILTED SURFACE, monotone across the row       0 ridges
 * The last two are why this is a ridge test and not a depth-discontinuity test. Every object boundary in a
 * scene is a depth discontinuity; locking them all would relax the clamp along every silhouette, which is
 * exactly where ghosting lives. A ridge is thin BY CONSTRUCTION.
 *
 * Both directions are kept. A slot is as much a thin feature as a wire -- a slit of background showing between
 * two surfaces is destroyed by a neighbourhood clamp the same way -- so restricting to "nearer" would refuse a
 * real case to no benefit.
 *
 * `margin` is in the DEPTH BUFFER'S OWN UNITS and there is no default that could be right, for the same reason
 * render/temporalReject.mjs's disocclusion threshold has none: a [0,1] projection and a [-1,1] one do not share
 * a scale, and a reversed-Z buffer does not share a sign convention either (though the sign does not matter
 * here, since both directions count).
 */
export function depthRidgesCPU(depth, w, h, margin) {
    if (!(margin > 0)) throw new Error("depthRidgesCPU: margin must be a positive depth, in the buffer's own units");
    return ridgesCPU(depth, w, h, margin);
}

/**
 * Two candidate masks ANDed: a pixel locks only where both agree.
 *
 * *** AND, NOT OR, AND THE MEASUREMENT SAYS WHY. *** OR would union the luma detector's 1,834 false positives
 * back in and give away everything the depth gate buys. The cost of AND is real and is named in the gate: a
 * thin feature PAINTED on a flat wall has no depth ridge, so it is refused, and the 4.00x a luma-only lock
 * buys on that picture goes with it. Depth separates GEOMETRY from TEXTURE, which is a different cut than THIN
 * from NOT THIN, and a painted line and a pixel-scale texture remain the same thing to every buffer this
 * pipeline carries.
 */
export function gateLocks(a, b) {
    const out = new Uint8Array(a.length);
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] && b[i]) { out[i] = 1; n++; }
    return { data: out, count: n };
}

/**
 * Lock candidates from ONE frame. Kept, and kept measured, because it is what a tree without a ring would
 * write -- and section 3 of the gate shows it finds ZERO pixels on a line 0.4 px wide. That is not a tuning
 * failure: most jitter phases miss a sub-pixel feature entirely, so on most frames there is nothing to find,
 * and the frames that do catch it are exactly the ones that do not need help.
 */
export function newLocksCPU({ current, w, h, margin = 0.05 }) {
    const f = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) f[i] = lumaOf(current[i * 4], current[i * 4 + 1], current[i * 4 + 2]);
    return ridgesCPU(f, w, h, margin);
}

/**
 * Lock candidates from the RING's jitter-free mean, which is the input a lock detector needs and the second
 * thing this rung's state buys. On the 0.4 px line it finds the line's whole column where the single frame
 * found nothing.
 *
 * *** AND IT DOES NOT SOLVE THE FALSE POSITIVES, WHICH IS STATED HERE RATHER THAN DISCOVERED LATER. *** On a
 * chequer at the pixel scale the ring mean is NOT flat -- a +/-0.5 px jitter cannot average away structure at
 * 1.13 px -- so 1,322 of 2,304 pixels still read as ridges against 1,972 from a single frame. There is no
 * luma-only test that separates "a thin bright feature" from "a texture at the pixel scale", because at the
 * pixel scale they are the same signal. The gate measures what that costs (26% more ghost on such a picture)
 * and the domain is named rather than papered over: locks are for features against a background that is not
 * itself at the pixel scale.
 */
export function lockCandidatesFromRing(st, { margin = 0.05 } = {}) {
    return ridgesCPU(lumaMean(st), st.w, st.h, margin);
}

/**
 * Advance the locks one frame: reproject, decay, kill, and set the new ones.
 *
 * *** THE KILL RULES ARE THE FEATURE, NOT ITS TRIMMING. *** A lock relaxes the clamp, which is the one control
 * standing between the history and a ghost; a lock that outlives its reason turns off anti-ghosting for that
 * pixel and keeps it off. So a lock dies on disocclusion, dies where the reprojection has no history, and dies
 * where the ring says the pixel is unstable for a reason the feature does not explain.
 */
export function advanceLocks(lockSt, { motion, disocclusion = null, instability = null, newLocks = null,
                                       w, h, life = 4, instabilityKill = Infinity }) {
    const next = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const valid = motion ? motion[o + 2] !== 0 : true;
        const hu = u + (motion ? motion[o] : 0), hv = v + (motion ? motion[o + 1] : 0);
        let carried = 0;
        if (valid && hu >= 0 && hu < 1 && hv >= 0 && hv < 1) {
            const px = clamp(Math.round(hu * w - 0.5), 0, w - 1), py = clamp(Math.round(hv * h - 0.5), 0, h - 1);
            carried = Math.max(0, lockSt.life[py * w + px] - 1);
        }
        if (disocclusion && disocclusion[i] > 0) carried = 0;
        if (instability && instability[i] > instabilityKill) carried = 0;
        next[i] = newLocks && newLocks[i] ? life : carried;
    }
    lockSt.life = next;
    return lockSt;
}

/**
 * Which pixels a lock state currently holds, as a 0/1 mask.
 *
 * *** THIS IS ALSO HOW A DEPTH RIDGE IS REMEMBERED, AND THAT IS WHY THERE IS NO SECOND MECHANISM. *** A single
 * frame's depth finds ZERO ridges on a feature thinner than a pixel, for exactly the reason v4553 recorded
 * about luma: most jitter phases miss it entirely. What is wanted is "was this a depth ridge anywhere in the
 * last period", and that is a lock with life = jitterPhaseCount(ratio) -- reprojected, decayed and killed by
 * the same rules, which a separate ridge-memory would have had to re-derive. So render/temporalDepthLock's
 * gate runs advanceLocks twice: once over the depth ridges with life = P to remember them, and once over the
 * gated candidates to hold the actual lock.
 */
export function activeMask(lockSt) {
    const out = new Uint8Array(lockSt.w * lockSt.h);
    let n = 0;
    for (let i = 0; i < out.length; i++) if (lockSt.life[i] > 0) { out[i] = 1; n++; }
    return { data: out, count: n };
}

/** Per-pixel clamp relaxation in [0, 1]: 1 where a lock is fresh, falling to 0 as it expires. */
export function lockRelaxation(lockSt, { life = 4 } = {}) {
    const out = new Float32Array(lockSt.w * lockSt.h);
    for (let i = 0; i < out.length; i++) out[i] = clamp(lockSt.life[i] / life, 0, 1);
    return out;
}
