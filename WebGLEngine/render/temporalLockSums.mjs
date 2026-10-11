// render/temporalLockSums.mjs -- THE LOCK'S TWO WINDOWS AS THREE RUNNING SUMS, in place of render/temporalLock.mjs's ring.
// Graded by render/temporalLockSums-selfcheck.mjs against the ring itself; the TSL port is render/temporalLockSumsTsl.mjs.
"use strict";
import { nearestTexel, ridgesCPU, luma as lumaOf } from "./temporalLock.mjs";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// *** WHY. *** The ring keeps every luma of two jitter periods so it can slide both windows one frame at a time.
// At a 2x upscale that is 64 floats a pixel -- 265 MB at 960x540 across the device's ping-pong pair -- and it is
// why fx/fsr/fsrTemporalTsl.mjs ships with the lock off. Neither of the ring's outputs needs the individual lumas:
// lumaMean is a period's SUM over P, and shadingShiftCPU is the difference of two such sums. So keep the sums.
//
// *** WHAT IT GIVES UP, MEASURED BEFORE IT WAS BUILT. *** The windows TUMBLE instead of sliding: `cur` accumulates
// the period in progress, and when it completes it becomes `prev` and the old `prev` becomes `prev2`. Both closed
// windows still span exactly one whole jitter period, so the jitter cancels in their difference exactly as it
// does in the ring's (render/temporalLockSums-selfcheck.mjs holds the still picture identical to the ring's).
// What changes is WHEN a change is seen: the ring's newer window moves every frame, the sums' only at a period
// boundary, so a light that changes mid-period is reported up to P - 1 frames later than the ring reports it.
// On the light-drop fixture at 2x that left 5.5-6.0 of summed error against the ring's 4.8 and no detector's 7.1.
// And lumaInstability, the spread WITHIN a window, is not carried: a sum has no spread. Nothing in the tree wires
// the instability kill (fx/fsr/fsrTemporalTsl.mjs: "its default is off").
//
// REPROJECTION IS THE RING'S: each sum is fetched bilinearly at the pixel's reprojected uv, the fill count at the
// nearest texel, and a pixel with no usable history restarts -- every frame of every window this frame's luma,
// which is the ring's "every slot this luma" written as sums.

/** Three per-pixel sums and a fill count. `period` must be jitterPhaseCount(ratio), as makeLumaState requires. */
export function makeLumaSums(w, h, period) {
    if (!Number.isInteger(period) || period < 1) throw new Error("makeLumaSums: period must be a positive integer -- pass jitterPhaseCount(ratio) from render/jitter.mjs");
    const N = w * h, f = () => new Float32Array(N);
    // `phase` is how many frames the window in progress holds AFTER the last push -- 0 just after a tumble
    return { w, h, period, phase: 0, n: 0, cur: f(), prev: f(), prev2: f(), filled: new Uint8Array(N),
             scratch: { cur: f(), prev: f(), prev2: f(), filled: new Uint8Array(N) } };
}

/** Push this frame's luma, reprojecting the sums first; tumbles the windows when the period in progress completes. */
export function pushLumaSums(st, { current, motion, w, h }) {
    const P = st.period, nx = st.scratch, phase = st.phase;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        const l = lumaOf(current[o], current[o + 1], current[o + 2]);
        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const valid = motion ? motion[o + 2] !== 0 : true;
        const hu = u + (motion ? motion[o] : 0), hv = v + (motion ? motion[o + 1] : 0);
        const usable = st.n > 0 && valid && hu >= 0 && hu < 1 && hv >= 0 && hv < 1;   // pushLuma's test, and its v4559 caveat
        if (!usable) {
            nx.cur[i] = l * (phase + 1); nx.prev[i] = l * P; nx.prev2[i] = l * P; nx.filled[i] = 0;
            continue;
        }
        // render/temporalLock.mjs's bilinear fetch, its four taps found once for all three sums, and its nearestTexel
        const bx = hu * w - 0.5, by = hv * h - 0.5, x0 = Math.floor(bx), y0 = Math.floor(by), fx = bx - x0, fy = by - y0;
        const cx0 = clamp(x0, 0, w - 1), cx1 = clamp(x0 + 1, 0, w - 1), cy0 = clamp(y0, 0, h - 1), cy1 = clamp(y0 + 1, 0, h - 1);
        const t00 = cy0 * w + cx0, t10 = cy0 * w + cx1, t01 = cy1 * w + cx0, t11 = cy1 * w + cx1;
        const bil = (B) => B[t00] * (1 - fx) * (1 - fy) + B[t10] * fx * (1 - fy) + B[t01] * (1 - fx) * fy + B[t11] * fx * fy;
        nx.cur[i] = bil(st.cur) + l;
        nx.prev[i] = bil(st.prev);
        nx.prev2[i] = bil(st.prev2);
        nx.filled[i] = Math.min(255, st.filled[nearestTexel(hu, hv, w, h)] + 1);
    }
    const old = { cur: st.cur, prev: st.prev, prev2: st.prev2, filled: st.filled };
    if (phase + 1 === P) {                       // the period in progress is complete: it becomes prev, prev becomes prev2
        st.prev2 = nx.prev; st.prev = nx.cur; st.cur = old.prev2; st.cur.fill(0);
        st.scratch = { cur: old.cur, prev: old.prev, prev2: nx.prev2, filled: old.filled };
        st.phase = 0;
    } else {
        st.cur = nx.cur; st.prev = nx.prev; st.prev2 = nx.prev2;
        st.scratch = { cur: old.cur, prev: old.prev, prev2: old.prev2, filled: old.filled };
        st.phase = phase + 1;
    }
    st.filled = nx.filled; st.n++;
    return st;
}

/**
 * Whether a pixel's two closed windows hold only frames of its own surface: it has `filled + 1` frames since its
 * history last restarted, and the windows reach back `phase + 2 * period`. *** EXACT, WHERE THE RING'S TEST IS ONE
 * FRAME CONSERVATIVE, AND THAT MATTERS HERE. *** shadingShiftCPU asks filled >= 2P, one frame more than 2P real
 * frames need, which costs the ring one frame. The same off-by-one on the sums costs a WHOLE PERIOD -- the windows
 * only close at a boundary -- and the prototype measured exactly that before it was found.
 */
export const sumsKnown = (st, i) => st.filled[i] + 1 >= st.phase + 2 * st.period;

/** lumaMean's field from the sums: the last CLOSED period's mean. Like lumaMean it does not look at the fill count. */
export function lumaSumsMean(st) {
    const N = st.w * st.h, P = st.period, out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = st.prev[i] / P;
    return out;
}

/** shadingShiftCPU from the sums: the last closed period against the one before. Unknown reads 0, as the ring's does. */
export function lumaSumsShiftCPU(st, { scale = 1, strength = 1 } = {}) {
    const N = st.w * st.h, P = st.period, out = new Float32Array(N);
    let unknown = 0;
    for (let i = 0; i < N; i++) {
        if (!sumsKnown(st, i)) { out[i] = 0; unknown++; continue; }
        out[i] = clamp(strength * Math.abs(st.prev[i] / P - st.prev2[i] / P) / (scale || 1), 0, 1);
    }
    return { data: out, unknown };
}

/** ringCoverage for the sums. */
export function sumsCoverage(st) {
    const N = st.w * st.h;
    let full = 0;
    for (let i = 0; i < N; i++) if (sumsKnown(st, i)) full++;
    return { full, total: N, fraction: full / N };
}

/** render/temporalLock.mjs's lockCandidatesFromRing over the sums' mean -- the same ridge test on the last closed period. */
export function lockCandidatesFromSums(st, { margin = 0.05 } = {}) {
    return ridgesCPU(lumaSumsMean(st), st.w, st.h, margin);
}
