// WebGLEngine/brain/pilotNeedsCircuit.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/pilotNeedsCircuit-selfcheck.mjs)
//
// THE PIECE 4 PILOT OF THE SURVEY RUN, AS REGISTERED IN brain/NEEDS_AND_LIMITS.md ("Round 3" and "Amendment 1", written before this file): a SEAT (brain/needsTask.mjs) whose only memory is a circuit's wiring. The circuit DECIDES -- whether to surface, which station, how deep, the pump, the repair -- and
// brain/needsTask.mjs's flyDecision flies those decisions with the autopilot every rule pilot uses, so a score measures the decisions.
//
//   decision = RULE + RESIDUAL. The rule is brain/needsTask.mjs's GUARDED-OBS (the best STATELESS rule: the surfacing charge a function of the depth alone). With every circuit output at zero the pilot IS that rule, decision for decision (a gate row), so training starts from it and any gain over it is a gain a
//   stateless pilot could not have had:  surface iff the last call or no feasible station or  10 (obsThreshold(depth) - charge reading) + o0 > 0;  station = argmax over the feasible unvisited of (-distance/200 + o_k);  cap = clamp(0.9 + 0.05 o4, 0.6, 0.95) of the collapse depth;
//   pump iff (flood > 0.001 and charge > 0.1 ? 1 : -1) + 2 o5 > 0;  repair iff (at the surface, damaged, charge > 0.1 ? 1 : -1) + 2 o6 > 0  (the factor 2 is Amendment 2: with the registered factor 1 an output of at most 1 could switch a rule's pump OFF but never ON).  The charge is the READING the pilot is handed (the noisy gauge, when there is one).
//   THE CIRCUIT is the rung 4a reservoir (brain/pilotSubCircuitState.mjs's update with 21 features and 7 outputs, the recurrent weights FIXED):  h' = relu(b + W_in x + sigma M h),  M the signed synapse-count matrix scaled to largest singular value 1, sigma one trained scalar (start 0.95, clamped to [0, 1]); the readout is
//   o = clamp(b_out + W_out h[output cells], -1, 1). It steps ONCE A SECOND (every STEP_TICKS control ticks, the first call included); the outputs are held between steps. The state starts at zero for every pilot made (a run).
//   weights  [ W_in: 21 x inputs ][ bias: N ][ sigma: 1 ][ W_out: 7 x outputs ][ b_out: 7 ]   (for the fly's heading loop 21 x 88 + 148 + 1 + 7 x 64 + 7 = 2,452)
//   FEATURES (21, each in [-1, 1]): charge, strain (depth over the CURRENT collapse depth, at most 1.2, over 1.2), damage, flood x 10 (at most 1), depth/60, time/600; then for each of the three stations in the scenario's order: distance/200 (at most 1), cos and sin of the bearing relative to the boat's heading, the
//   station's depth/60, visited. A station's `unreachable` flag is NOT a feature.
//   THE VARIANTS: persist false (NO STATE: no recurrence, the state zero before every update) and withheld true (the first four features -- charge, strain, damage, flood -- set to zero; the rule underneath still reads the gauge).
// Pure: no I/O, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./needsTask.mjs";
import { reservoirOf, largestSingularValue, STATE_INIT } from "./pilotSubCircuitState.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

export const FEATURES = 21, OUTPUTS = 7, STEP_TICKS = 30, GLOBALS = 6, PER_STATION = 5, NEEDS_FEATURES = 4;
export const SCALE = Object.freeze({ depth: 60, time: 600, dist: 200, flood: 10, strainMax: 1.2 });
export const CAP_RESIDUAL = Object.freeze({ base: 0.9, per: 0.05, lo: 0.6, hi: 0.95 }), SURFACE_GAIN = 10, STATION_SCALE = 200, SWITCH_GAIN = 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** The 21 features of a state and an observation into `out` (a Float64Array(21), returned). `withheld` zeroes the first four (the needs). */
export function featuresOf(st, obs, out = new Float64Array(FEATURES), { withheld = false } = {}) {
    const r = obs.r, heading = S.attitude(st).heading;
    out[0] = r.frac; out[1] = Math.min(r.strain === undefined ? r.depth / r.collapseDepth : r.strain, SCALE.strainMax) / SCALE.strainMax; out[2] = r.damage; out[3] = Math.min(1, r.flood * SCALE.flood);
    out[4] = r.depth / SCALE.depth; out[5] = obs.t / SCALE.time;
    for (let k = 0; k < 3; k++) {
        const q = obs.stations[k], o = GLOBALS + k * PER_STATION;
        if (!q) { for (let j = 0; j < PER_STATION; j++) out[o + j] = 0; continue; }
        const dx = q.x - st.pos[0], dy = q.y - st.pos[1], rel = Math.atan2(-dy, dx) - heading;   // cos and sin are periodic: no wrap is needed
        out[o] = Math.min(1, Math.hypot(dx, dy) / SCALE.dist); out[o + 1] = Math.cos(rel); out[o + 2] = Math.sin(rel); out[o + 3] = q.depth / SCALE.depth; out[o + 4] = q.visited ? 1 : 0;
    }
    for (let i = 0; i < FEATURES; i++) out[i] = clamp(fin(out[i]), -1, 1);
    if (withheld) for (let i = 0; i < NEEDS_FEATURES; i++) out[i] = 0;
    return out;
}

/** The pilot family of a circuit: { N, NI, NO, WEIGHT_COUNT, offsets, handWeights(), seatFor(w), pilotFor(w), mutate(w, sigma, rng, maxK), stepper(w) }. opts: persist (default true), withheld (default false). */
export function createNeedsPolicy(circuit, name = "circuit", opts = {}, init = STATE_INIT) {
    const persist = opts.persist !== false, withheld = !!opts.withheld, res = reservoirOf(circuit), { N, E, from, to, inputs, outputs } = res, NI = inputs.length, NO = outputs.length;
    const OFF_B = FEATURES * NI, OFF_SIGMA = OFF_B + N, OFF_W2 = OFF_SIGMA + 1, OFF_B2 = OFF_W2 + OUTPUTS * NO, WEIGHT_COUNT = OFF_B2 + OUTPUTS, sigmaMax = largestSingularValue(res);
    const gain = Float64Array.from(res.mag, (m, k) => (sigmaMax > 0 ? (res.sign[k] * m) / sigmaMax : 0));
    const outStart = new Int32Array(N + 1); for (let k = 0; k < E; k++) outStart[from[k] + 1]++;
    for (let j = 0; j < N; j++) outStart[j + 1] += outStart[j];
    const outTo = new Int32Array(E), outGain = new Float64Array(E), fill = outStart.slice(0, N);
    for (let k = 0; k < E; k++) { const at = fill[from[k]]++; outTo[at] = to[k]; outGain[at] = gain[k]; }

    function handWeights() {
        const w = new Float32Array(WEIGHT_COUNT), rng = mulberry(init.seed);
        for (let i = 0; i < OFF_B; i++) w[i] = gauss(rng) * init.inScale;
        for (let i = 0; i < N; i++) w[OFF_B + i] = init.bias;
        w[OFF_SIGMA] = init.sigma0;
        return w;
    }
    /** One reservoir update, into `h` from `hPrev` and the features `x`. */
    function updateInto(w, x, hPrev, h) {
        const sigma = clamp(fin(w[OFF_SIGMA]), 0, 1);
        for (let i = 0; i < N; i++) h[i] = w[OFF_B + i];
        if (persist) for (let j = 0; j < N; j++) { const hj = hPrev[j]; if (hj > 0) { const sh = sigma * hj; for (let q = outStart[j]; q < outStart[j + 1]; q++) h[outTo[q]] += outGain[q] * sh; } }
        for (let a = 0; a < NI; a++) { let sum = 0; const row = a * FEATURES; for (let f = 0; f < FEATURES; f++) sum += w[row + f] * x[f]; h[inputs[a]] += init.inputGain * sum; }
        for (let i = 0; i < N; i++) if (!(h[i] > 0)) h[i] = 0;
        return h;
    }
    const readout = (w, h) => { const y = new Float64Array(OUTPUTS); for (let o = 0; o < OUTPUTS; o++) { let sum = w[OFF_B2 + o]; const row = OFF_W2 + o * NO; for (let j = 0; j < NO; j++) sum += w[row + j] * h[outputs[j]]; y[o] = clamp(fin(sum), -1, 1); } return y; };
    /** A stepper: step(x) -> the 7 outputs after one reservoir update (the state kept inside), `state()` the cells' activity. For the gate and the trainer. */
    const stepper = (w) => { let h = new Float64Array(N), spare = new Float64Array(N); return { step(x) { updateInto(w, x, h, spare); const t = h; h = spare; spare = t; return readout(w, h); }, state: () => h }; };

    /** The seat of the weights: (ctx) -> (st, obs) -> decision. `seat.outputs` is the last held output vector, `seat.steps` the number of reservoir updates made. */
    const seatFor = (w) => (ctx) => {
        const sp = stepper(w), x = new Float64Array(FEATURES); let y = new Float64Array(OUTPUTS), n = 0, steps = 0;
        const seat = (st, obs) => {
            if (n % STEP_TICKS === 0) { featuresOf(st, obs, x, { withheld }); y = sp.step(x); steps++; }
            n++;
            const r = obs.r, atSurface = -st.pos[2] < T.RETURN_DEPTH;
            // the feasible unvisited station of the best score (the rule's distance score plus the circuit's residual), ties to the first
            let best = null, bs = -Infinity;
            for (let k = 0; k < obs.stations.length; k++) { const q = obs.stations[k]; if (q.visited || !(q.depth - T.CAPTURE.depth + 0.5 <= T.HULL_DEPTH * r.collapseDepth)) continue; const sc = -Math.hypot(q.x - st.pos[0], q.y - st.pos[1]) / STATION_SCALE + (k < 3 ? y[1 + k] : 0); if (sc > bs) { bs = sc; best = q; } }
            const surface = T.lastCall(obs) || !best || SURFACE_GAIN * (T.obsThreshold(r.depth) - r.frac) + y[0] > 0;
            const cap = clamp(CAP_RESIDUAL.base + CAP_RESIDUAL.per * y[4], CAP_RESIDUAL.lo, CAP_RESIDUAL.hi);
            const pump = ((r.flood > 0.001 && r.frac > 0.1) ? 1 : -1) + SWITCH_GAIN * y[5] > 0, repair = ((atSurface && r.damage > 0 && r.frac > 0.1) ? 1 : -1) + SWITCH_GAIN * y[6] > 0;
            return { surface, station: best, cap, pump, repair };
        };
        Object.defineProperty(seat, "outputs", { get: () => y }); Object.defineProperty(seat, "steps", { get: () => steps });
        return seat;
    };
    const pilotFor = (w) => T.flyDecision(seatFor(w));
    function mutate(w, sigma, rng, maxK = 4) {
        const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
        for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
        o[OFF_SIGMA] = clamp(o[OFF_SIGMA], 0, 1);
        return o;
    }
    return { name, persist, withheld, N, NI, NO, E, WEIGHT_COUNT, offsets: Object.freeze({ B: OFF_B, SIGMA: OFF_SIGMA, W2: OFF_W2, B2: OFF_B2 }), handWeights, seatFor, pilotFor, mutate, stepper };
}
