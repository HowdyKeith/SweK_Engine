// WebGLEngine/brain/plannerCircuitSeat.mjs -- UNNUMBERED (the version is chosen at ship time). Round 42 of brain/NEEDS_AND_LIMITS.md (registered before this file existed).
//
// A CIRCUIT BUILT ON THE PLANNER. The base is the shipped seat's planner (plannerPerturbed.perturbedSeat on the -0.04 constants, by value, in the
// standard profile); a plain relu net 24 -> H -> 7 holds residuals on its decisions, stepped once a second (STEP_TICKS). The 24 features are the 21 of
// pilotNeedsCircuit.featuresOf plus a one-hot of the planner's station position k < 3 in obs.stations. With the readout at zero the seat IS the
// shipped seat, decision for decision -- the gate holds that on full dives at both gauges.
//
// plannerPerturbed.mjs is NOT edited: the planner's look-ahead values are private to its closure, and the only slice of them this seat reads is the
// station the public decision carries.
"use strict";
import * as T from "./needsTask.mjs";
import * as U from "./tunedRule.mjs";
import * as P from "./pilotNeedsCircuit.mjs";
import * as Q from "./plannerPerturbed.mjs";
import * as SS from "./surveySeat.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";
import { STATE_INIT } from "./pilotSubCircuitState.mjs";

export const BASE_FEATURES = P.FEATURES, STATION_ONEHOT = 3, FEATURES = BASE_FEATURES + STATION_ONEHOT, OUTPUTS = P.OUTPUTS, STEP_TICKS = P.STEP_TICKS, HIDDEN = 84;
/** Round 43: the look-ahead features, read off the planner's last plan (plannerPerturbed's read-only `plan` getter). */
export const LOOKAHEAD = 11, FEATURES_LA = FEATURES + LOOKAHEAD, PLAN_AGE_S = 120;
/**
 * Round 43's eleven look-ahead features into out[offset..offset+10], all 0 with no plan:
 * L1 best value of any scored order (nearest-first included); L2 the nearest-first value; L3 = L1 - L2; L4-L6 for k = 0..2 of obs.stations the best value of
 * a permutation STARTING at k (0 if none); L7-L9 the masks; L10 best minus second best (0 with one order); L11 min(1, (t - plan.t) / 120).
 */
export function lookaheadFeatures(plan, obs, out, offset = 0) {
    for (let i = 0; i < LOOKAHEAD; i++) out[offset + i] = 0;
    if (!plan || !plan.values) return out;
    const entries = Object.entries(plan.values), vals = entries.map(([, v]) => v).sort((a, b) => b - a);
    if (!vals.length) return out;
    const best = vals[0], near = plan.values.nearest ?? 0;
    out[offset] = best; out[offset + 1] = near; out[offset + 2] = best - near;
    for (let k = 0; k < STATION_ONEHOT; k++) {
        let m = -Infinity;
        for (const [key, v] of entries) if (key !== "nearest" && Number(key.split(">")[0]) === k) m = Math.max(m, v);
        if (m > -Infinity) { out[offset + 3 + k] = m; out[offset + 6 + k] = 1; }
    }
    out[offset + 9] = vals.length > 1 ? best - vals[1] : 0;
    out[offset + 10] = Math.min(1, Math.max(0, (obs.t - plan.t) / PLAN_AGE_S));
    return out;
}
/** The base constants, BY VALUE: the Round 8 constants with low -0.04 (equal to SURVEY_CONSTANTS today; pinned so a later seat change does not move this base silently). */
export const BASE_04 = Object.freeze({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.04 });
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const feasible = (s, r) => !s.visited && s.depth - T.CAPTURE.depth + 0.5 <= T.HULL_DEPTH * r.collapseDepth;   // needsTask's own feasibility test, as circuitSeat.makeSeat

/**
 * The seat factory (ctx) => seat for one dive, from a stepper `sp` whose step(x) returns the 7 outputs in [-1, 1]. The planner seat is built from the
 * dive's ctx (its rollouts read ctx.model) and called on EVERY tick. The returned seat carries `outputs`, `steps`, `overrides` (ticks whose station
 * differs from the planner's) and `planner` (the base seat, for its stats).
 */
export function makePlannerSeat(sp, { params = BASE_04, plan = SS.planOf("standard"), base = null, lookahead = false } = {}) {
    // `base` (a seat factory) replaces the planner for the gate, which drives the override and the one-hot with a planner whose station it chooses
    base = base || Q.perturbedSeat(params, {}, plan); const q = U.normalise(params, U.WIDE_BOUNDS);
    return (ctx) => {
        const planner = base(ctx), x = new Float64Array(lookahead ? FEATURES_LA : FEATURES), xb = x.subarray(0, BASE_FEATURES);
        let y = new Float64Array(OUTPUTS), n = 0, steps = 0, overrides = 0, ema = null;
        const seat = (st, obs) => {
            const d = planner(st, obs), r = obs.r;
            ema = ema === null ? r.frac : ema + q.alpha * (r.frac - ema);   // the planner's filter, by the same formula and alpha
            const pk = d.station ? obs.stations.indexOf(d.station) : -1;
            if (n % STEP_TICKS === 0) {
                P.featuresOf(st, obs, xb);
                for (let k = 0; k < STATION_ONEHOT; k++) x[BASE_FEATURES + k] = pk === k ? 1 : 0;
                if (lookahead) lookaheadFeatures(planner.plan || null, obs, x, FEATURES);   // Round 43: read AFTER the planner decided this tick
                y = sp.step(x); steps++;
            }
            n++;
            // the planner's station scores its residual (0 past k = 2); every other feasible open station k < 3 scores -1 plus its residual; the argmax wins, ties to the planner's
            let station = d.station, bs = d.station ? (pk >= 0 && pk < STATION_ONEHOT ? y[1 + pk] : 0) : -Infinity;
            for (let k = 0; k < Math.min(STATION_ONEHOT, obs.stations.length); k++) {
                const s = obs.stations[k];
                if (k === pk || !feasible(s, r)) continue;
                const sc = -1 + y[1 + k];
                if (sc > bs) { bs = sc; station = s; }
            }
            if (station !== d.station) overrides++;
            const atSurface = -st.pos[2] < T.RETURN_DEPTH;
            const surface = T.lastCall(obs) || !station || P.SURFACE_GAIN * (U.thresholdAt(q, r.depth) - ema) + y[0] > 0;
            const cap = clamp(q.cap + P.CAP_RESIDUAL.per * y[4], P.CAP_RESIDUAL.lo, P.CAP_RESIDUAL.hi);
            const pump = ((r.flood > 0.001 && ema > 0.1) ? 1 : -1) + P.SWITCH_GAIN * y[5] > 0, repair = ((atSurface && r.damage > 0 && ema > 0.1) ? 1 : -1) + P.SWITCH_GAIN * y[6] > 0;
            return { surface, station, cap, pump, repair };
        };
        Object.defineProperty(seat, "outputs", { get: () => y });
        Object.defineProperty(seat, "steps", { get: () => steps });
        Object.defineProperty(seat, "overrides", { get: () => overrides });
        Object.defineProperty(seat, "planner", { get: () => planner });
        return seat;
    };
}

/**
 * The policy: a plain relu net 24 -> `hidden` -> 7, createPlainPolicy's shape and init with 24 features. Weights [ W1: hidden x 24 ][ b1: hidden ]
 * [ W2: 7 x hidden ][ b2: 7 ]; the readout (W2, b2) starts at zero, so the untrained pilot is the planner seat.
 */
export function createPlannerPolicy(hidden = HIDDEN, name = "planner-circuit", init = STATE_INIT, seatOpts = {}) {
    if (!Number.isInteger(hidden) || hidden < 1) throw new Error(`plannerCircuitSeat.createPlannerPolicy: hidden must be a whole number of at least 1, got ${JSON.stringify(hidden)}`);
    const H = hidden, F = seatOpts.lookahead ? FEATURES_LA : FEATURES, OFF_B1 = H * F, OFF_W2 = OFF_B1 + H, OFF_B2 = OFF_W2 + OUTPUTS * H, WEIGHT_COUNT = OFF_B2 + OUTPUTS;
    function handWeights() {
        const w = new Float32Array(WEIGHT_COUNT), rng = mulberry(init.seed);
        for (let i = 0; i < OFF_B1; i++) w[i] = gauss(rng) * init.inScale * init.inputGain;
        for (let i = 0; i < H; i++) w[OFF_B1 + i] = init.bias;
        return w;
    }
    const stepper = (w) => {
        const h = new Float64Array(H), out = new Float64Array(OUTPUTS);
        return { step(x) {
            for (let i = 0; i < H; i++) { let sum = w[OFF_B1 + i]; const row = i * F; for (let f = 0; f < F; f++) sum += w[row + f] * x[f]; h[i] = sum > 0 ? sum : 0; }
            for (let o = 0; o < OUTPUTS; o++) { let sum = w[OFF_B2 + o]; const row = OFF_W2 + o * H; for (let j = 0; j < H; j++) sum += w[row + j] * h[j]; out[o] = clamp(fin(sum), -1, 1); }
            return Float64Array.from(out);
        } };
    };
    const seatFor = (w) => makePlannerSeat(stepper(w), seatOpts);
    function mutate(w, sigma, rng, maxK = 4) {
        const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
        for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
        return o;
    }
    return { name, kind: "planner-plain", hidden: H, features: F, WEIGHT_COUNT, offsets: Object.freeze({ B1: OFF_B1, W2: OFF_W2, B2: OFF_B2 }), handWeights, seatFor, pilotFor: (w) => T.flyDecision(seatFor(w)), mutate, stepper };
}

/** Round 43: the look-ahead policy, 35 -> 84 -> 7 (3,619 weights), the readout starting at zero, on the look-ahead seat. */
export const createLookaheadPolicy = (hidden = HIDDEN, name = "lookahead-circuit", init = STATE_INIT) => createPlannerPolicy(hidden, name, init, { lookahead: true });
