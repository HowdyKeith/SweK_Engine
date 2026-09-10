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
        // *** THE BOUNDS TEST IS A HARD THRESHOLD ON A COMPUTED FLOAT, AND THAT IS A MEASURED CROSS-BACKEND
        // DIVERGENCE THIS ARC CARRIES. *** v4559: under fractional camera motion this function and its WGSL
        // kernel disagree by the full contrast of the content -- 8.6e-1 on a pixel-scale chequer -- because
        // at a speed that divides the texel evenly, hu lands EXACTLY on 1.0 for a whole column and f64 here
        // and f32 there fall on opposite sides. One mirror resets the ring; the other reprojects.
        //
        // FOUR REPAIRS WERE TRIED AND NONE HELD, which is recorded so a fifth is not guessed at:
        //   round -> floor for the fill index    a real tie bug (JS rounds half UP, WGSL half to EVEN) and
        //                                        it IS fixed below, but it was not this;
        //   a half-texel guard                   WORSE -- 0.5/h is exactly the first row's sample position;
        //   an integer test on the bilinear taps WORSE -- with no motion in y, floor(hv*h - 0.5) is exactly
        //                                        an integer for every row;
        //   computing the mirror's uv in f32     moved which column straddles, from the first row to the last.
        // The bilinear FETCH survives all of this because a floor off by one carries a compensating weight --
        // it is continuous across the boundary. A bounds test is a hard yes or no and is not, and any
        // threshold can be landed on exactly by a camera speed that is a simple fraction of a texel.
        //
        // It is left as it was rather than dressed with a fifth guess. render/temporalRingContent-selfcheck
        // holds the divergence as a measured row: it is bounded by the content's own contrast, and it is
        // invisible on smooth content, which is why six rounds of device-parity rows never saw it.
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

/**
 * The texel a uv lands in, for the fill count -- which is a nearest-texel question, not an interpolation one.
 *
 * *** floor(u*w), NOT round(u*w - 0.5), AND THE DIFFERENCE IS A CROSS-BACKEND DEFECT THIS ARC CARRIED FROM
 * v4553. *** The two agree except at an exact tie, and there JavaScript's Math.round goes half UP while
 * WGSL's round() goes half to EVEN: at u*w - 0.5 = 22.5 the CPU read texel 23 and the kernel read 22. Under
 * a fractional camera speed those ties come up constantly. It stayed invisible for six rounds because every
 * device row in the arc drove SMOOTH content or a still camera, where reading the neighbouring texel costs
 * almost nothing -- on a pixel-scale chequer it costs the full 8.6e-1 of contrast. floor(u*w) is the standard
 * texel index for a uv, has no tie to break, and is what render/temporalReject.mjs's disocclusion already
 * used; this was the one place in the arc that did it differently.
 */
export function nearestTexel(u, v, w, h) {
    const x = clamp(Math.floor(u * w), 0, w - 1), y = clamp(Math.floor(v * h), 0, h - 1);
    return y * w + x;
}

function sampleScalarFilled(buf, w, h, u, v) {
    return buf[nearestTexel(u, v, w, h)];
}

/**
 * How much of the frame actually HAS a window: the fraction of pixels whose ring is full.
 *
 * *** THE RING HAS A SPEED CEILING AND NOTHING MEASURED IT UNTIL v4557. *** The ring is 2*period frames deep
 * and every one of them is reprojected, so at a camera speed of v pixels per frame the window's footprint is
 * 2*period*v pixels. At period 8 and 2 px/frame that is 32 pixels; at 3 px/frame it is 48, and MEASURED on a
 * 48-pixel frame the fraction of pixels with a full ring goes 100% at rest, 83% at 0.5 px/frame, 67% at 1,
 * 33% at 1.5, and ZERO at 3 -- the whole mechanism is off and every consumer correctly reports "unknown",
 * which is exactly the answer v4553 built and exactly the answer nobody was reading. A caller that wants to
 * know whether the lock and the shading detector are doing anything at all asks this.
 */
export function ringCoverage(st) {
    const N = st.w * st.h;
    let full = 0;
    for (let i = 0; i < N; i++) if (st.filled[i] >= st.frames) full++;
    return { full, total: N, fraction: full / N };
}

/**
 * The interval a ridge margin has to live in, composed from two measurements neither of which this module
 * makes. It is a feasibility question and the answer is sometimes NO.
 *
 *   LOWER BOUND -- `noiseFloor`, the ring mean's own error, which the CALLER measures for its own motion.
 *     Below it the detector reads resampling error as features. v4557 measured 1.2e-7 at rest and 8.4e-2 at
 *     1 px/frame of camera translation, so the floor is not a property of the tree, it is a property of how
 *     fast the camera is going.
 *   UPPER BOUND -- v4556's blind window is margin/contrast wide, so holding the blind fraction to
 *     `blindBudget` caps the margin at contrast * blindBudget.
 *
 * *** AND THE INTERVAL IS EMPTY MORE OFTEN THAN THE ARC'S FIXED 0.05 SUGGESTS. *** At 1 px/frame with a 5%
 * blind budget NOTHING is lockable at any contrast; at a 10% budget a feature needs contrast above 0.84. The
 * arc's margin of 0.05 sits below the floor at speeds above roughly half a pixel per frame, which is to say
 * that under ordinary camera motion every lock this arc places is partly reading its own resampling error.
 * That is stated here rather than in a comment somewhere because it is the reason this function exists.
 */
export function ridgeMarginBounds({ noiseFloor, contrast, blindBudget = 0.1, safety = 1.5 }) {
    if (!(noiseFloor >= 0)) throw new Error("ridgeMarginBounds: noiseFloor must be measured and non-negative, not assumed");
    if (!(contrast > 0)) throw new Error("ridgeMarginBounds: contrast must be positive -- the feature's, not the frame's");
    const lo = noiseFloor * safety;
    const hi = contrast * blindBudget;
    return {
        lo, hi,
        feasible: lo < hi,
        // the faintest feature that can be locked at all under this noise floor and blind budget
        minContrast: lo / blindBudget,
        // the margin to use when there is one: the bottom of the interval, since every unit above the floor
        // is blind window bought for nothing
        margin: lo < hi ? lo : null,
    };
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
export function ridgesCPU(lumaField, w, h, margin = 0.05, maxPlateau = 2) {
    const out = new Uint8Array(w * h), axisX = new Uint8Array(w * h), axisY = new Uint8Array(w * h);
    let n = 0;
    // *** THE WALK PAST TIES IS NOT A REFINEMENT, IT IS THE DIFFERENCE BETWEEN SEEING A FEATURE AND NOT. ***
    // v4556: a thin feature whose two covered pixels come out within `margin` of each other -- which is what
    // happens whenever it straddles a pixel boundary evenly -- is a strict extremum in NEITHER, and the whole
    // lock detector found ZERO of it at every scale and every band setting. MEASURED: two exactly equal
    // columns give 0 strict ridges against 14 for one column, and a 0.4 px line is invisible at 5.5% of
    // sub-pixel positions with contrast 0.9. The blind window is margin/contrast wide, so a LOW-contrast
    // feature is invisible for far more of the sweep -- at contrast 0.2 it is a quarter of all positions.
    // So the deciding neighbour is the first one that differs by more than `margin`, not the adjacent one.
    // maxPlateau 1 is exactly the old strict test and is kept reachable for that comparison.
    const decide = (i, step) => {
        const c = lumaField[i];
        for (let k = 1; k <= maxPlateau; k++) {
            const j = i + step * k;
            if (j < 0 || j >= w * h) return 0;
            const dv = lumaField[j] - c;
            if (dv > margin) return 1;
            if (dv < -margin) return -1;
        }
        return 0;                      // still inside a plateau at the bound: undecided, and NOT a ridge
    };
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const L = decide(i, -1), R = decide(i, 1), U = decide(i, -w), D = decide(i, w);
        const ridgeX = (L === -1 && R === -1) || (L === 1 && R === 1);
        const ridgeY = (U === -1 && D === -1) || (U === 1 && D === 1);
        // *** THE AXES COME OUT TOO, because which one fired is what "thin" means directionally: a ridge found
        // on the X axis is thin HORIZONTALLY, so its band is measured across x. coherentRidgesCPU needs that
        // and re-deriving it there would be a second definition of the test.
        if (ridgeX) axisX[i] = 1;
        if (ridgeY) axisY[i] = 1;
        if (ridgeX || ridgeY) { out[i] = 1; n++; }
    }
    return { data: out, count: n, axisX, axisY };
}

/**
 * COHERENT RIDGES: a ridge whose BAND, measured across its own thin direction, is at most `maxBand` pixels.
 *
 * *** THIS IS WHAT SEPARATES A PAINTED THIN LINE FROM A PIXEL-SCALE TEXTURE, AND IT NEEDS NO NEW BUFFER. ***
 * v4554 closed by saying an object-ID or material channel was what could do this. That was wrong, and the
 * reason is worth keeping: a painted line and a painted chequer are BOTH albedo on one flat surface, so they
 * share depth, normal, material and draw call. Every per-pixel buffer a renderer writes gives them the same
 * answer. What differs is not what they are made of but their SHAPE -- a line is one pixel across, and a
 * texture at the pixel scale is ridges everywhere.
 *
 * MEASURED on the ring's jitter-free mean, margin 0.05, over a 48x48 frame:
 *     a 0.4 px painted line     46 ridges, ALL of band 1
 *     a 1.13 px chequer       1873 ridges, of which 93 have band 1 -- a 20x cut with the line untouched
 * Two things that did NOT work are recorded so they are not tried again: an object ID (above), and the ridge's
 * run length ALONG its direction, which fails because it measures runs of the MASK rather than of the feature
 * -- 690 of the chequer's 713 ridges run 16 pixels or more.
 *
 * `maxBand` is the width in pixels and is REQUIRED. The scan is bounded at maxBand + 1 in each direction, which
 * is all that is needed to answer "longer than maxBand" and is what makes the WGSL mirror a local test.
 */
export function coherentRidgesCPU(field, w, h, margin, maxBand, maxPlateau = 2) {
    if (!Number.isInteger(maxBand) || maxBand < 1) throw new Error("coherentRidgesCPU: maxBand must be an integer >= 1, the ridge band's width in pixels");
    // a plateau of width p makes a band of at least p, so a maxBand below maxPlateau refuses every feature the
    // plateau walk exists to find -- caught here rather than left as a pair of numbers that quietly disagree
    if (maxBand < maxPlateau) throw new Error(`coherentRidgesCPU: maxBand ${maxBand} is below maxPlateau ${maxPlateau}, which rejects every plateau-detected feature`);
    const r = ridgesCPU(field, w, h, margin, maxPlateau);
    const out = new Uint8Array(w * h);
    let n = 0;
    // the run containing i, bounded: step out until the mask stops or the budget runs out
    const runLen = (mask, i, step, limit) => {
        let len = 1;
        for (let k = 1; k <= limit; k++) { const j = i + step * k; if (j < 0 || j >= w * h || !mask[j]) break; len++; }
        for (let k = 1; k <= limit; k++) { const j = i - step * k; if (j < 0 || j >= w * h || !mask[j]) break; len++; }
        return len;
    };
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!r.data[i]) continue;
        // an X-ridge is thin across x, so its band runs along x; a Y-ridge's band runs along y
        let band = Infinity;
        if (r.axisX[i]) band = Math.min(band, runLen(r.axisX, i, 1, maxBand));
        if (r.axisY[i]) band = Math.min(band, runLen(r.axisY, i, w, maxBand));
        if (band <= maxBand) { out[i] = 1; n++; }
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
            // *** THE SECOND COPY OF THE SAME INDEX, AND IT WAS STILL IN THE CONDEMNED FORM. *** v4559 fixed
            // the ring's fill index and left this one; round(t - 0.5) and floor(t) agree for every f64 value
            // JavaScript can produce, so nothing went red, but two spellings of one law is how the ring's
            // version drifted away from the kernel's in the first place. Named once, above.
            carried = Math.max(0, lockSt.life[nearestTexel(hu, hv, w, h)] - 1);
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
