// WebGLEngine/brain/residualAdvisor.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/residualAdvisor-selfcheck.mjs)
//
// ROUND 6 of brain/NEEDS_AND_LIMITS.md, registered before this file existed: GUARDED-FILTER (the rule) plus a small LEARNED RESIDUAL. A seat (ctx) -> seat(st, obs) -> { surface, station, cap, pump, repair }. The residual is a plain MLP (8 inputs, 12 tanh hidden,
// 2 outputs) whose output weights and biases START AT ZERO, so RESIDUAL(zero weights) is GUARDED-FILTER decision for decision. It can nudge two things only: the surfacing threshold (a shift of at most +-SHIFT_MAX on top of obsThreshold(depth)) and the depth cap (cut by at
// most CUT_MAX of the rule's cap, never raised). Station, pump and repair are the rule's. Pure: no clock, no Math.random, no file.
"use strict";
import * as T from "./needsTask.mjs";

export const N_IN = 8, N_HID = 12, N_OUT = 2;
export const SHIFT_MAX = 0.15, CUT_MAX = 0.4;
/** Weight layout: W1 (N_HID x N_IN, row-major), b1 (N_HID), W2 (N_OUT x N_HID), b2 (N_OUT). */
export const N_W1 = N_HID * N_IN, N_B1 = N_HID, N_W2 = N_OUT * N_HID, N_B2 = N_OUT, N_WEIGHTS = N_W1 + N_B1 + N_W2 + N_B2;
export const OUT_START = N_W1 + N_B1;   // index of the first output weight: from here to the end the zero start is exact

/** The zero start: hidden weights small and fixed (a seeded spread), output layer exactly zero. */
export function startWeights() {
    const w = new Float64Array(N_WEIGHTS);
    for (let i = 0; i < N_W1; i++) w[i] = 0.5 * Math.sin(1 + i * 2.399963);   // fixed, deterministic spread
    return w;
}
export const ZERO_WEIGHTS = Object.freeze(Array.from(startWeights()));

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/** The features of one situation: the filtered charge, the raw gauge, depth / collapse, flooding, damage, time fraction, unvisited feasible stations / 4, the nearest feasible station's depth / collapse. */
export function features(ema, st, obs, station) {
    const r = obs.r, cd = Math.max(1, r.collapseDepth);
    const open = obs.stations.reduce((a, q) => a + (!q.visited ? 1 : 0), 0);
    return [ema, r.frac, clamp(r.depth / cd, 0, 1.5), clamp(r.flood * 10, 0, 1), clamp(r.damage, 0, 1), clamp(obs.t / T.SECONDS, 0, 1), clamp(open / 4, 0, 1), station ? clamp(station.depth / cd, 0, 1.5) : 0];
}
/** The two outputs (threshold shift, cap cut) of the network at `w` on features `f`. Both are exactly 0 when the output weights are 0. */
export function forward(w, f) {
    const h = new Float64Array(N_HID);
    for (let j = 0; j < N_HID; j++) { let s = w[N_W1 + j]; for (let i = 0; i < N_IN; i++) s += w[j * N_IN + i] * f[i]; h[j] = Math.tanh(s); }
    const o = [0, 0];
    for (let k = 0; k < N_OUT; k++) { let s = w[OUT_START + N_W2 + k]; for (let j = 0; j < N_HID; j++) s += w[OUT_START + k * N_HID + j] * h[j]; o[k] = s; }
    return { shift: SHIFT_MAX * Math.tanh(o[0]), cut: CUT_MAX * Math.max(0, Math.tanh(o[1])) };
}

/** The seat. `w` is a weight vector of N_WEIGHTS numbers. */
export function residualSeat(w) {
    if (!w || w.length !== N_WEIGHTS) throw new Error(`residualAdvisor.residualSeat: ${N_WEIGHTS} weights expected, got ${w ? w.length : w}`);
    return (ctx) => {
        let ema = null, refill = 0;
        const stats = { ticks: 0, shiftSum: 0, cutSum: 0 };
        const seat = (st, obs) => {
            ema = ema === null ? obs.r.frac : ema + T.FILTER_ALPHA * (obs.r.frac - ema);
            const r = obs.r, station = T.nearestFeasible(st, obs), atSurface = -st.pos[2] < T.RETURN_DEPTH;
            const pump = r.flood > 0.001 && ema > 0.1, repair = atSurface && r.damage > 0 && ema > 0.1;
            const { shift, cut } = forward(w, features(ema, st, obs, station));
            stats.ticks++; stats.shiftSum += shift; stats.cutSum += cut;
            const surface = T.lastCall(obs) || !station || ema < T.obsThreshold(r.depth) + shift;
            return { surface, station, cap: T.HULL_DEPTH * (1 - cut), pump, repair };
        };
        Object.defineProperty(seat, "stats", { get: () => stats });
        return seat;
    };
}
