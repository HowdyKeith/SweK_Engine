// WebGLEngine/tools/subHeadingEstimator.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/subHeadingEstimator-selfcheck.mjs)
//
// THE ESTIMATOR OF RUNG 4a, VERSION 2 (brain/SUBMARINE_WIP.md, "THE ESTIMATOR" and its AMENDMENT, registered before this file was scored): a RESERVOIR (the fixed signed wiring of a circuit, read through brain/pilotSubCircuitState.mjs's arrays and its seeded input
// weights, which are UNCHANGED) whose READOUT IS FITTED BY RIDGE REGRESSION to a quantity the simulator knows, instead of being searched against a dive score. The reservoir's recurrent gain is set by its SPECTRAL RADIUS, swept, not searched.
//
//   TARGET     the CUMULATIVE heading change since the dive start, cum(t) = the sum of the wrapped one-tick changes of the true heading (an ungated integral: what a ring attractor is said to hold). The navigator-side quantity is delta(t) = cum(t) - cum(t_w), t_w the last tick the compass
//              was valid: THE WRAPPER HOLDS cum_hat(t_w) and subtracts it (a sample-and-hold a linear readout could not do for itself). delta is the true heading minus the heading the dropout shows, the quantity tools/subNavigator.mjs applies by turnWorld.
//   RECORD     dives are flown by the autopilot behind the ORACLE navigator (tools/subNavigator.mjs) through the dropout, so the vessel flies as if the heading were known; at every tick the estimator's SENSES (the pilots' 15 features of the world the dropout PRESENTS, with the
//              heading-error feature 4 zeroed -- it is the target minus the shown heading, which in a well-flown dive is nearly delta, so a stateless readout would read the answer off it -- and the compass flag as the 15th) are stored with cum, delta and the oracle's own estimate.
//   RESERVOIR  h' = relu(W_in x + g M h): M the signed synapse-count matrix (Dale's law), g = radius / (the spectral radius of M) so that the LINEAR dynamics have exactly that spectral radius, W_in the circuit pilot's seeded input weights on the input cells, no bias, reset at the start of a dive.
//              (brain/pilotSubCircuitState.mjs scales by the largest SINGULAR value instead, and the spectral radius of these matrices is only 0.19 to 0.62 of it: the memory of rung 4a's reservoirs was a couple of ticks, not the 20 the note said -- see the correction in the notes.)
//   FIT        for each radius: run the reservoir over the fitting dives, accumulate the normal equations of ridge regression from the output cells' activity (plus a constant) to cum over EVERY tick, solve for each lambda (Cholesky; lambda is RELATIVE: lambda x the mean diagonal);
//              choose (radius, lambda) by the RMSE of delta_hat over the DARK ticks of the held-out dives (ties to the smaller radius, then the smaller lambda); the readout is the one fitted on the fitting dives alone.
//   SCORE      the RMSE (radians) of delta_hat = cum_hat(t) - cum_hat(t_w) over the dark ticks of a set of dives, the RMSE of saying 0 (NONE) and of the oracle (ORACLE); skill = 1 - RMSE / RMSE(NONE).
//   IN THE LOOP  estimatorPilot(): the fitted estimator in the place of the oracle, applied only on dark ticks (`dropout(estimatorPilot(...))`), to fly the audits.
// A MODEL is { n (readout length), init() -> state, step(state, x) -> state, read(out, state) }: the circuit's reservoir (circuitModel) or ONE leaky unit fed the yaw-rate feature (leakyModel, the cheapest memory there is).
// WHAT IT IS NOT: how a fly integrates (the readout is a linear fit, not a circuit's own output); a pilot to ship; a model of a real gyro (the simulator's body rates are exact). Pure apart from the work it does: no I/O, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "../brain/subTask.mjs";
import * as A from "../brain/autopilotSub.mjs";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as D from "./subDropout.mjs";
import { navigator, headingRate } from "./subNavigator.mjs";

export const NF = 15, YAW_FEATURE = 5, MAX_TICKS = Math.round(T.SECONDS / T.DT);
export const RADII = Object.freeze([0.9, 0.99, 0.999]), LEAKY_SIGMAS = Object.freeze([0.95, 0.99, 0.999, 0.9999]), LAMBDAS = Object.freeze([1e-6, 1e-4, 1e-2, 1, 100]);   // lambda is relative to the mean diagonal of the normal equations
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The estimator's senses for a (presented) state into `out` (15 numbers, the layout of the circuit pilot's input weights): the HEADING RATE of the vessel in slot 5 (rad/s over 0.2, the scale of the pilots' yaw-rate feature, clamped to +-15) and the compass flag in slot 14; every other slot 0.
 * The heading rate is the angular-velocity signal a heading system is said to be driven by (subNavigator.headingRate: exact, computed from the body rates and the attitude, and unchanged by the dropout's turn of the world); the circuit's whole job is to integrate it.
 */
export function sensesInto(out, state, target, current, valid) {
    out.fill(0);
    out[YAW_FEATURE] = Math.max(-15, Math.min(15, headingRate(state) / 0.2)); out[NF - 1] = valid ? 1 : 0;
    return out;
}

/**
 * The dives of `set` flown ONCE through one dropout wrapper (so their windows are the ones every other pilot meets on the set) by the autopilot behind the oracle navigator, recorded:
 * [{ ticks, X (Float32, ticks x 15), cum (the cumulative heading change), delta (the true heading minus the shown one), oracle (the oracle navigator's estimate of delta, 0 when the compass is valid), valid (1 | 0) }].
 */
export function recordSet(set, dropoutOpts = {}) {
    const nav = navigator(A.pilot()), dives = [], x = new Float64Array(NF);
    let rec = null, trueHeading = 0, previous = 0;
    const recorder = (state, tgt, current, aux) => {
        const valid = !(aux && aux.compassValid === 0), t = rec.ticks++;
        sensesInto(x, state, tgt, current, valid);
        const cmd = nav(state, tgt, current, aux);
        rec.X.set(x, t * NF); rec.valid[t] = valid ? 1 : 0;
        rec.cum[t] = t === 0 ? 0 : rec.cum[t - 1] + wrap(trueHeading - previous);
        rec.delta[t] = wrap(trueHeading - S.attitude(state).heading); rec.oracle[t] = wrap(nav.last.estimate - nav.last.shown);
        previous = trueHeading;
        return cmd;
    };
    const w = D.dropout(recorder, dropoutOpts), outer = (state, tgt, current) => { trueHeading = S.attitude(state).heading; return w(state, tgt, current); };
    for (const sc of set) {
        rec = { ticks: 0, X: new Float32Array(MAX_TICKS * NF), cum: new Float32Array(MAX_TICKS), delta: new Float32Array(MAX_TICKS), oracle: new Float32Array(MAX_TICKS), valid: new Uint8Array(MAX_TICKS) };
        T.fly(outer, sc);
        const n = rec.ticks; dives.push({ ticks: n, X: rec.X.slice(0, n * NF), cum: rec.cum.slice(0, n), delta: rec.delta.slice(0, n), oracle: rec.oracle.slice(0, n), valid: rec.valid.slice(0, n) });
    }
    return dives;
}

/** Solve (A + lambda I) x = b for a symmetric positive semi-definite A (n x n, row-major) by Cholesky; throws when the matrix is not positive definite even with lambda. */
export function ridgeSolve(A, b, n, lambda) {
    const L = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let s = A[i * n + j] + (i === j ? lambda : 0);
            for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
            if (i === j) { if (!(s > 0)) throw new Error(`subHeadingEstimator.ridgeSolve: the matrix is not positive definite at row ${i} (pivot ${s})`); L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j];
        }
    }
    const y = new Float64Array(n), x = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
    return x;
}

/**
 * The spectral radius of the signed count matrix of a reservoir (brain/pilotSubCircuitState.mjs reservoirOf()), by power iteration from a fixed start: the mean log growth of the norm over the last half of `steps` steps. 0 for a matrix whose iterate dies (no edges, or nilpotent).
 * Exact for a matrix with a real dominant eigenvalue; for a complex pair the norm oscillates and the mean growth is accurate to about 1 / steps.
 */
export function spectralRadius(res, steps = 4000) {
    const N = res.N; let v = Float64Array.from({ length: N }, (_, i) => 0.5 + ((i * 7919) % 101) / 101), acc = 0, cnt = 0;
    for (let it = 0; it < steps; it++) {
        const o = new Float64Array(N); for (let k = 0; k < res.E; k++) o[res.to[k]] += res.sign[k] * res.mag[k] * v[res.from[k]];
        let n = 0; for (let i = 0; i < N; i++) n += o[i] * o[i];
        n = Math.sqrt(n); if (!(n > 0)) return 0;
        for (let i = 0; i < N; i++) v[i] = o[i] / n;
        if (it >= steps / 2) { acc += Math.log(n); cnt++; }
    }
    return Math.exp(acc / cnt);
}

/**
 * The circuit as a model at one spectral radius: h' = relu(W_in x + g M h), g = radius / spectralRadius(M) (persist: false is NO STATE: the recurrent term is left out), W_in the seeded input weights of the circuit pilot on its input cells, read from the output cells plus a constant.
 * `rho` may be passed when the radius of M is already known (it does not depend on the sweep).
 */
export function circuitModel(circuit, radius, persist = true, rho = null) {
    const P = CS.createStatePolicy(circuit, "estimator"), R = CS.reservoirOf(circuit), win = P.handWeights(), N = R.N, NI = R.inputs.length, no = R.outputs.length, E = R.E;
    const r = rho === null ? spectralRadius(R) : rho, g = persist && r > 0 ? radius / r : 0;
    const outStart = new Int32Array(N + 1); for (let k = 0; k < E; k++) outStart[R.from[k] + 1]++;
    for (let j = 0; j < N; j++) outStart[j + 1] += outStart[j];
    const outTo = new Int32Array(E), outGain = new Float64Array(E), fill = outStart.slice(0, N);
    for (let k = 0; k < E; k++) { const at = fill[R.from[k]]++; outTo[at] = R.to[k]; outGain[at] = g * R.sign[k] * R.mag[k]; }
    return {
        n: no + 1, rho: r, init: () => new Float64Array(N),
        step(h, x) {
            const o = new Float64Array(N);
            if (g !== 0) for (let j = 0; j < N; j++) { const hj = h[j]; if (hj > 0) for (let q = outStart[j]; q < outStart[j + 1]; q++) o[outTo[q]] += outGain[q] * hj; }
            for (let a = 0; a < NI; a++) { let sum = 0; const row = a * NF; for (let f = 0; f < NF; f++) sum += win[row + f] * x[f]; o[R.inputs[a]] += sum; }
            for (let i = 0; i < N; i++) if (!(o[i] > 0)) o[i] = 0;
            return o;
        },
        read(out, h) { for (let j = 0; j < no; j++) out[j] = h[R.outputs[j]]; out[no] = 1; },
    };
}
/** ONE leaky unit fed the yaw-rate feature: g' = sigma g + x[5]; read as [g, 1]. */
export function leakyModel(sigma) {
    return { n: 2, init: () => new Float64Array(1), step: (g, x) => { const o = new Float64Array(1); o[0] = sigma * g[0] + x[YAW_FEATURE]; return o; }, read(out, g) { out[0] = g[0]; out[1] = 1; } };
}

/** The normal equations of the regression from the model's reading to cum over EVERY tick of the dives: { A (n x n), b (n), ticks }. */
export function normalEquations(model, dives) {
    const n = model.n, A = new Float64Array(n * n), b = new Float64Array(n), z = new Float64Array(n); let ticks = 0;
    for (const d of dives) {
        let h = model.init();
        for (let t = 0; t < d.ticks; t++) {
            h = model.step(h, d.X.subarray(t * NF, t * NF + NF)); model.read(z, h);
            for (let i = 0; i < n; i++) { const zi = z[i]; b[i] += zi * d.cum[t]; for (let j = 0; j <= i; j++) A[i * n + j] += zi * z[j]; }
            ticks++;
        }
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) A[i * n + j] = A[j * n + i];
    return { A, b, ticks };
}

/**
 * The squared error of delta_hat = cum_hat(t) - cum_hat(t_w) over the DARK ticks of the dives for each readout in `readouts` (a list of Float64Array), where cum_hat(t_w) is the estimate held at the last valid tick (at the first tick when the dive starts dark),
 * the dark-tick count, and the squared sizes of delta and of the oracle's miss: { sumSq[], none, oracle, dark }.
 */
export function scoreReadouts(model, readouts, dives) {
    const n = model.n, z = new Float64Array(n), sumSq = new Float64Array(readouts.length), pred = new Float64Array(readouts.length), held = new Float64Array(readouts.length); let none = 0, oracle = 0, dark = 0;
    for (const d of dives) {
        let h = model.init(), started = false;
        for (let t = 0; t < d.ticks; t++) {
            h = model.step(h, d.X.subarray(t * NF, t * NF + NF)); model.read(z, h);
            for (let r = 0; r < readouts.length; r++) { let p = 0; const wv = readouts[r]; for (let i = 0; i < n; i++) p += wv[i] * z[i]; pred[r] = p; }
            if (d.valid[t] === 1 || !started) { for (let r = 0; r < readouts.length; r++) held[r] = pred[r]; started = true; if (d.valid[t] === 1) continue; }
            dark++; const y = d.delta[t]; none += y * y; const o = d.oracle[t] - y; oracle += o * o;
            for (let r = 0; r < readouts.length; r++) { const e = pred[r] - held[r] - y; sumSq[r] += e * e; }
        }
    }
    return { sumSq, none, oracle, dark };
}
export const rmseOf = (sumSq, n) => (n > 0 ? Math.sqrt(sumSq / n) : null);

/**
 * Fit one family of models: for every setting (a radius for a circuit, a sigma for the leaky unit), the normal equations on `fitDives`, a readout for every lambda (relative to the mean diagonal), the dark-tick RMSE of each on `selDives`; the best (ties to the smaller setting,
 * then the smaller lambda) is returned with its readout: { setting, lambda, readout, selRmse, candidates: [{ setting, lambda, rmse }] }. `makeModel(setting)` builds the model; `settings` and `lambdas` are the grids.
 */
export function fitModel(makeModel, settings, lambdas, fitDives, selDives) {
    let best = null; const candidates = [];
    for (const setting of settings) {
        const model = makeModel(setting), { A, b } = normalEquations(model, fitDives); let tr = 0; for (let i = 0; i < model.n; i++) tr += A[i * model.n + i]; tr /= model.n;
        // a setting whose activity overflows (a relu reservoir can run away) has no usable normal equations: its candidates score Infinity and cannot be chosen
        let readouts; try { readouts = lambdas.map((l) => ridgeSolve(A, b, model.n, l * tr)); } catch (e) { readouts = null; }
        const sc = readouts ? scoreReadouts(model, readouts, selDives) : null;
        lambdas.forEach((lambda, r) => {
            const raw = sc ? rmseOf(sc.sumSq[r], sc.dark) : Infinity, rmse = Number.isFinite(raw) ? raw : Infinity; candidates.push({ setting, lambda, rmse });
            if (best === null || rmse < best.selRmse - 1e-15) best = { setting, lambda, readout: readouts ? Array.from(readouts[r]) : new Array(model.n).fill(0), selRmse: rmse };
        });
    }
    return { ...best, candidates };
}
/** The scores of a fitted readout on a set of dives: { rmse, none, oracle (all RMSEs in radians over the dark ticks), skill (1 - rmse / none), darkTicks }. */
export function scoreFit(makeModel, fit, dives) {
    const sc = scoreReadouts(makeModel(fit.setting), [Float64Array.from(fit.readout)], dives), rmse = rmseOf(sc.sumSq[0], sc.dark), none = rmseOf(sc.none, sc.dark);
    return { rmse, none, oracle: rmseOf(sc.oracle, sc.dark), skill: none > 0 ? 1 - rmse / none : null, darkTicks: sc.dark };
}
/** The NONE and ORACLE rows alone (no model): the RMSE of saying 0 and of the oracle navigator, over the dark ticks. */
export function referenceScores(dives) {
    let none = 0, oracle = 0, dark = 0;
    for (const d of dives) for (let t = 0; t < d.ticks; t++) { if (d.valid[t] === 1) continue; dark++; none += d.delta[t] ** 2; oracle += (d.oracle[t] - d.delta[t]) ** 2; }
    return { none: rmseOf(none, dark), oracle: rmseOf(oracle, dark), darkTicks: dark };
}

/**
 * `inner` ((state, target, current, aux) -> controls) behind the FITTED ESTIMATOR in the place of the oracle navigator: the model runs on the senses of the presented world every tick (reset when the target object changes); on a valid tick the pilot is handed the world as it came and the
 * estimate cum_hat is HELD; on a dark tick the world is turned by delta_hat = cum_hat - the held one. Exposes `last` ({ estimate }) for the gate.
 */
export function estimatorPilot(model, readout, inner) {
    const x = new Float64Array(NF), z = new Float64Array(model.n); let target = null, h = model.init(), held = 0, started = false;
    const wrapped = (state, tgt, current, aux = null) => {
        if (tgt !== target) { target = tgt; h = model.init(); started = false; }
        const valid = !(aux && aux.compassValid === 0);
        sensesInto(x, state, tgt, current, valid); h = model.step(h, x); model.read(z, h);
        let cumHat = 0; for (let i = 0; i < model.n; i++) cumHat += readout[i] * z[i];
        if (valid || !started) { held = cumHat; started = true; if (valid) { wrapped.last = { estimate: 0 }; return inner(state, tgt, current, aux); } }
        const est = cumHat - held; wrapped.last = { estimate: est };
        const seen = D.turnWorld(state, current, est);
        return inner(seen.state, tgt, seen.current, aux);
    };
    wrapped.last = { estimate: 0 };
    return wrapped;
}
