// WebGLEngine/brain/tunedRule.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/tunedRule-selfcheck.mjs)
//
// ROUND 8 of brain/NEEDS_AND_LIMITS.md, registered before this file existed: GUARDED-FILTER with its five parameters exposed. A seat (ctx) -> seat(st, obs) -> { surface, station, cap, pump, repair }.
// The filter's alpha, the trip's low / high / ramp (the surfacing charge falls linearly from `high` at the surface to `low` at `ramp` metres and below) and the depth cap as a fraction of collapse depth. THE DEFAULTS ARE GUARDED-FILTER EXACTLY.
// Pure: no clock, no Math.random, no file.
"use strict";
import * as T from "./needsTask.mjs";

export const DEFAULTS = Object.freeze({ alpha: T.FILTER_ALPHA, low: T.OBS_RULE.low, high: T.OBS_RULE.high, ramp: T.OBS_RULE.ramp, cap: T.HULL_DEPTH });
export const BOUNDS = Object.freeze({ alpha: [0.001, 0.02], low: [0.15, 0.6], high: [0.35, 0.95], ramp: [2, 20], cap: [0.6, 0.9] });
export const NAMES = Object.freeze(["alpha", "low", "high", "ramp", "cap"]);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** A parameter set inside the bounds, with high held at or above low. Unknown names and non-numbers are refused. */
export function normalise(p) {
    const out = { ...DEFAULTS };
    for (const [k, v] of Object.entries(p || {})) {
        if (!NAMES.includes(k)) throw new Error(`tunedRule.normalise: unknown parameter ${JSON.stringify(k)} (${NAMES.join(", ")})`);
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`tunedRule.normalise: ${k} must be a finite number, got ${v}`);
        out[k] = clamp(v, BOUNDS[k][0], BOUNDS[k][1]);
    }
    out.high = Math.max(out.high, out.low);
    return out;
}
/** The surfacing charge at a depth under parameters q. */
export const thresholdAt = (q, depth) => q.low + (q.high - q.low) * Math.max(0, Math.min(1, 1 - depth / q.ramp));

export function tunedSeat(params) {
    const q = normalise(params);
    return (ctx) => {
        let ema = null;
        return (st, obs) => {
            ema = ema === null ? obs.r.frac : ema + q.alpha * (obs.r.frac - ema);
            const r = obs.r, station = T.nearestFeasible(st, obs), atSurface = -st.pos[2] < T.RETURN_DEPTH;
            const pump = r.flood > 0.001 && ema > 0.1, repair = atSurface && r.damage > 0 && ema > 0.1;
            const surface = T.lastCall(obs) || !station || ema < thresholdAt(q, r.depth);
            return { surface, station, cap: q.cap, pump, repair };
        };
    };
}
