// WebGLEngine/brain/circuitSeat.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/DECISION_CIRCUIT_VS_TWIN_WIP.md, the trainer tools/ship/trainDecisionCircuit.mjs, the study tools/ship/takeDecisionCircuit.mjs, the gate brain/circuitSeat-selfcheck.mjs)
//
// THE DECISION CIRCUIT, RE-BASED ON THE SEAT'S OWN RULE (decision D1 of the registration). brain/pilotNeedsCircuit.mjs (Round 3) decides as RULE + RESIDUAL, but its rule is GUARDED-OBS -- a stateless surfacing rule with no gauge filter -- which scores about 0.3 on the noisy far kinds where the shipped
// seat's rule scores 0.82; a circuit started there would have to climb to a level the rule starts at. THIS module keeps the circuit (the Round 3 features, reservoir, readout and cadence, imported from pilotNeedsCircuit.mjs, not copied) and changes the rule underneath: the TUNED rule at the seat's constants
// (brain/surveySeat.mjs SURVEY_CONSTANTS, the Round 8 constants with the low trip point lowered by 0.06; brain/tunedRule.mjs the wide bounds), including its filter of the charge gauge (alpha 0.001, a single leaky unit).
//
//   decision = RULE + RESIDUAL, with the circuit's 7 outputs y (each in [-1, 1], held between its steps, one a second):
//     surface   iff the last call, or no feasible station, or  10 (threshold(depth) - filtered charge) + y0 > 0         (the rule: filtered charge below the threshold at this depth)
//     station   the feasible unvisited station of the best score  -distance / 200 + y(1 + k)   for the k-th station of the scenario (k < 3), ties to the first       (the rule: the nearest, y = 0)
//     cap       clamp(rule cap + 0.05 y4, 0.6, 0.95)
//     pump      iff  (flooding and filtered charge over 0.1 ? 1 : -1) + 2 y5 > 0           repair  iff  (at the surface, damaged and filtered charge over 0.1 ? 1 : -1) + 2 y6 > 0
//   **With every output at zero the seat IS brain/tunedRule.mjs tunedSeat(SURVEY_CONSTANTS, WIDE_BOUNDS) -- the switchboard's `rule-low06` -- decision for decision**: the gate holds it on dives of every kind, with and without the noisy gauge.
//   The filter is advanced on EVERY call (as the rule's is), the circuit steps every 30th; neither reads the true charge, only the observation's.
//
// THE THREE POLICIES, each with the contract tools/ship/trainNeedsCircuit.mjs's search() uses (handWeights, mutate, pilotFor, WEIGHT_COUNT):
//   reservoir  persist true   the Round 3 reservoir over the fly's heading-loop circuit, with its memory  (the registration's `circuit-cx`)
//   reservoir  persist false  the same, its state zeroed before every update                              (`circuit-nostate`)
//   plain      a relu net 21 -> H -> 7 with H = matchedHidden(weight count of the reservoir) and NO recurrence, on the same features and the same cadence (`circuit-plain`)
// Every policy starts with its readout at ZERO, so the untrained pilot is the rule. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as T from "./needsTask.mjs";
import * as P from "./pilotNeedsCircuit.mjs";
import * as U from "./tunedRule.mjs";
import * as S from "./surveySeat.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";
import { STATE_INIT } from "./pilotSubCircuitState.mjs";

export const BASE_PARAMS = S.SURVEY_CONSTANTS, BASE_BOUNDS = U.WIDE_BOUNDS;
export const FEATURES = P.FEATURES, OUTPUTS = P.OUTPUTS, STEP_TICKS = P.STEP_TICKS;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** The hidden width of a plain net 21 -> H -> 7 whose weight count is nearest the reservoir's: H = round((count - 7) / 29). (29 H + 7 weights.) */
export const matchedHidden = (weightCount) => Math.max(1, Math.round((weightCount - OUTPUTS) / (FEATURES + 1 + OUTPUTS)));
export const plainCount = (hidden) => hidden * (FEATURES + 1 + OUTPUTS) + OUTPUTS;

/**
 * The seat of one dive: (st, obs) -> a decision, from a stepper `sp` whose step(x) returns the 7 outputs. The rule's filter is built here, fresh for the dive. `withheld` zeroes the first four features (the needs) as in Round 3.
 * The returned seat has `outputs` (the last held vector) and `steps` (the number of circuit steps made).
 */
export function makeSeat(sp, { withheld = false, params = BASE_PARAMS, bounds = BASE_BOUNDS } = {}) {
    const q = U.normalise(params, bounds), x = new Float64Array(FEATURES);
    let y = new Float64Array(OUTPUTS), n = 0, steps = 0, ema = null;
    const seat = (st, obs) => {
        const r = obs.r;
        ema = ema === null ? r.frac : ema + q.alpha * (r.frac - ema);   // the rule's filter of the charge gauge, advanced on every call
        if (n % STEP_TICKS === 0) { P.featuresOf(st, obs, x, { withheld }); y = sp.step(x); steps++; }
        n++;
        const atSurface = -st.pos[2] < T.RETURN_DEPTH;
        // the feasible unvisited station of the best score (the rule's distance score plus the circuit's residual), ties to the first; feasible is brain/needsTask.mjs's own test
        let best = null, bs = -Infinity;
        for (let k = 0; k < obs.stations.length; k++) {
            const s = obs.stations[k];
            if (s.visited || !(s.depth - T.CAPTURE.depth + 0.5 <= T.HULL_DEPTH * r.collapseDepth)) continue;
            const sc = -Math.hypot(s.x - st.pos[0], s.y - st.pos[1]) / P.STATION_SCALE + (k < 3 ? y[1 + k] : 0);
            if (sc > bs) { bs = sc; best = s; }
        }
        const surface = T.lastCall(obs) || !best || P.SURFACE_GAIN * (U.thresholdAt(q, r.depth) - ema) + y[0] > 0;
        const cap = clamp(q.cap + P.CAP_RESIDUAL.per * y[4], P.CAP_RESIDUAL.lo, P.CAP_RESIDUAL.hi);
        const pump = ((r.flood > 0.001 && ema > 0.1) ? 1 : -1) + P.SWITCH_GAIN * y[5] > 0, repair = ((atSurface && r.damage > 0 && ema > 0.1) ? 1 : -1) + P.SWITCH_GAIN * y[6] > 0;
        return { surface, station: best, cap, pump, repair };
    };
    Object.defineProperty(seat, "outputs", { get: () => y }); Object.defineProperty(seat, "steps", { get: () => steps });
    return seat;
}

/** The pilot family of a RESERVOIR over `circuit`: pilotNeedsCircuit's policy with the seat replaced by the re-based one. opts: persist (default true), withheld (default false). */
export function createReservoirPolicy(circuit, name = "circuit", opts = {}, init = STATE_INIT) {
    const base = P.createNeedsPolicy(circuit, name, opts, init), withheld = !!opts.withheld;
    const seatFor = (w) => (ctx) => makeSeat(base.stepper(w), { withheld });
    return { ...base, kind: "reservoir", seatFor, pilotFor: (w) => T.flyDecision(seatFor(w)) };
}

/** The pilot family of a PLAIN relu net 21 -> `hidden` -> 7 (no recurrence), on the same features and cadence. Weights [ W1: hidden x 21 ][ b1: hidden ][ W2: 7 x hidden ][ b2: 7 ]; the readout (W2, b2) starts at zero. */
export function createPlainPolicy(hidden, name = "plain", opts = {}, init = STATE_INIT) {
    if (!Number.isInteger(hidden) || hidden < 1) throw new Error(`circuitSeat.createPlainPolicy: hidden must be a whole number of at least 1, got ${JSON.stringify(hidden)}`);
    const H = hidden, withheld = !!opts.withheld, OFF_B1 = H * FEATURES, OFF_W2 = OFF_B1 + H, OFF_B2 = OFF_W2 + OUTPUTS * H, WEIGHT_COUNT = OFF_B2 + OUTPUTS;
    function handWeights() {
        const w = new Float32Array(WEIGHT_COUNT), rng = mulberry(init.seed);
        for (let i = 0; i < OFF_B1; i++) w[i] = gauss(rng) * init.inScale * init.inputGain;
        for (let i = 0; i < H; i++) w[OFF_B1 + i] = init.bias;
        return w;
    }
    const stepper = (w) => {
        const h = new Float64Array(H), out = new Float64Array(OUTPUTS);
        return { step(x) {
            for (let i = 0; i < H; i++) { let sum = w[OFF_B1 + i]; const row = i * FEATURES; for (let f = 0; f < FEATURES; f++) sum += w[row + f] * x[f]; h[i] = sum > 0 ? sum : 0; }
            for (let o = 0; o < OUTPUTS; o++) { let sum = w[OFF_B2 + o]; const row = OFF_W2 + o * H; for (let j = 0; j < H; j++) sum += w[row + j] * h[j]; out[o] = clamp(fin(sum), -1, 1); }
            return Float64Array.from(out);
        } };
    };
    const seatFor = (w) => (ctx) => makeSeat(stepper(w), { withheld });
    function mutate(w, sigma, rng, maxK = 4) {
        const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
        for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
        return o;
    }
    return { name, kind: "plain", persist: false, withheld, hidden: H, WEIGHT_COUNT, offsets: Object.freeze({ B1: OFF_B1, W2: OFF_W2, B2: OFF_B2 }), handWeights, seatFor, pilotFor: (w) => T.flyDecision(seatFor(w)), mutate, stepper };
}

/** The three registered families over a circuit: { cx (persist), nostate, plain } with the plain net's width matched to the reservoir's weight count. */
export function familiesOf(circuit) {
    const cx = createReservoirPolicy(circuit, "cx", { persist: true }), nostate = createReservoirPolicy(circuit, "nostate", { persist: false }), plain = createPlainPolicy(matchedHidden(cx.WEIGHT_COUNT), "plain");
    return { cx, nostate, plain };
}
