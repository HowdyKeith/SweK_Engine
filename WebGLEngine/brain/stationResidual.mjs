// WebGLEngine/brain/stationResidual.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/stationResidual-selfcheck.mjs)
//
// ROUND 10 of brain/NEEDS_AND_LIMITS.md, registered before this file existed: the tuned rule (brain/tunedRule.mjs: filter, trip, cap, pump, repair, all unchanged) with the NEXT STATION chosen by
//   score = -distance + SCALE x extra,   over the unvisited feasible stations, the FIRST maximum winning ties,
// where `extra` is tanh of a small per-station MLP (the learned residual) or a fixed linear preference (the control). With extra = 0 the choice is the first nearest station, exactly needsTask.nearestFeasible's.
// The MLP: 8 inputs, 8 tanh hidden, 1 output; the output weights and bias start at ZERO, so the seat at the start is the tuned rule dive for dive. Pure: no clock, no Math.random, no file.
"use strict";
import * as T from "./needsTask.mjs";
import * as A from "./advisorChip.mjs";
import * as U from "./tunedRule.mjs";

export const N_IN = 8, N_HID = 8, SCALE = 100;
export const N_W1 = N_HID * N_IN, N_B1 = N_HID, N_W2 = N_HID, N_B2 = 1, N_WEIGHTS = N_W1 + N_B1 + N_W2 + N_B2;
export const OUT_START = N_W1 + N_B1;   // the first output weight; from here to the end the zero start is exact
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function startWeights() { const w = new Float64Array(N_WEIGHTS); for (let i = 0; i < N_W1; i++) w[i] = 0.5 * Math.sin(1 + i * 2.399963); return w; }
const dist = (st, q) => Math.hypot(q.x - st.pos[0], q.y - st.pos[1]);

/** The eight features of candidate `q` among the open feasible `open`; `dmin` the nearest one's distance; `isCurrent` whether q was last tick's choice. */
export function features(st, obs, ema, q, open, dmin, isCurrent) {
    const d = dist(st, q), cd = Math.max(1, obs.r.collapseDepth);
    let other = Infinity;
    for (const o of open) if (o !== q) other = Math.min(other, Math.hypot(o.x - q.x, o.y - q.y));
    return [clamp(d / 200, 0, 3), dmin > 0 ? clamp(d / dmin, 0, 4) / 4 : 0, clamp(q.depth / cd, 0, 1.5), clamp(1 - obs.t / T.SECONDS, 0, 1), ema, isCurrent ? 1 : 0, clamp(open.length / 4, 0, 1), Number.isFinite(other) ? clamp(other / 200, 0, 3) : 0];
}
/** The learned extra (in [-1, 1]) for features f under weights w; exactly 0 when the output weights are 0. */
export function netExtra(w, f) {
    let out = w[OUT_START + N_W2];
    for (let j = 0; j < N_HID; j++) { let s = w[N_W1 + j]; for (let i = 0; i < N_IN; i++) s += w[j * N_IN + i] * f[i]; out += w[OUT_START + j] * Math.tanh(s); }
    return Math.tanh(out);
}
/** The fixed linear preference of the control: a x (depth over collapse depth) + b x (distance to the nearest other open station / 200 m), clipped to [-1, 1]. */
export const linExtra = (lin, f) => clamp(lin.a * f[2] + lin.b * f[7], -1, 1);

/**
 * The seat. `params` are the tuned rule's parameters (normalised under U.WIDE_BOUNDS); `choice` is { w } (the net) or { lin: { a, b } } (the control) or {} / null (nearest-first). The seat carries `stats` { ticks, switches }.
 */
export function stationSeat(params, choice = null) {
    const q = U.normalise(params, U.WIDE_BOUNDS), w = choice && choice.w ? choice.w : null, lin = choice && choice.lin ? choice.lin : null;
    if (w && w.length !== N_WEIGHTS) throw new Error(`stationResidual.stationSeat: ${N_WEIGHTS} weights expected, got ${w.length}`);
    return (ctx) => {
        let ema = null, current = null;
        const stats = { ticks: 0, switches: 0 };
        const seat = (st, obs) => {
            ema = ema === null ? obs.r.frac : ema + q.alpha * (obs.r.frac - ema);
            const r = obs.r, atSurface = -st.pos[2] < T.RETURN_DEPTH;
            const pump = r.flood > 0.001 && ema > 0.1, repair = atSurface && r.damage > 0 && ema > 0.1;
            const open = obs.stations.filter((s) => !s.visited && A.feasible(s, r));
            let station = null;
            if (open.length) {
                let dmin = Infinity; for (const s of open) dmin = Math.min(dmin, dist(st, s));
                let bestScore = -Infinity;
                for (const s of open) {
                    let extra = 0;
                    if (w || lin) { const f = features(st, obs, ema, s, open, dmin, s === current); extra = w ? netExtra(w, f) : linExtra(lin, f); }
                    const score = -dist(st, s) + SCALE * extra;
                    if (score > bestScore) { bestScore = score; station = s; }
                }
            }
            stats.ticks++; if (station !== current) { if (current !== null && station !== null) stats.switches++; current = station; }
            const surface = T.lastCall(obs) || !station || ema < U.thresholdAt(q, r.depth);
            return { surface, station, cap: q.cap, pump, repair };
        };
        Object.defineProperty(seat, "stats", { get: () => stats });
        return seat;
    };
}
