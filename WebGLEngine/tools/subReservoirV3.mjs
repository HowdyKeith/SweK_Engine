// WebGLEngine/tools/subReservoirV3.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/subReservoirV3-selfcheck.mjs)
//
// THE RESERVOIRS OF RUNG 4a VERSION 3, "MATCHED GAIN", AS REGISTERED IN brain/SUBMARINE_WIP.md ("RUNG 4a VERSION 3", written before any v3 circuit was scored). Version 2 (tools/subHeadingEstimator.mjs, which this file leaves as it is) gave every wiring the same NOMINAL spectral radius; relu clipping makes the effective
// gain of a nominal radius different in every wiring (the real wiring forgot a pulse within a second at all three of v2's radii, its own edge of stability being near a nominal 1.18). Version 3 puts every wiring at its OWN edge and lets the held-out dives choose the distance below it.
//   THE UNITS    relu: h' = min(CAP, relu(s W_in x + g M h)); tanh: h' = tanh(s W_in x + g M h). M is the signed synapse-count matrix (Dale's law) of brain/pilotSubCircuitState.mjs's reservoirOf(), g = gain / (the spectral radius of M) so that `gain` is a NOMINAL RADIUS as in v2, W_in the seeded input weights
//                of the circuit pilot, no bias, reset at the start of a dive; s scales the drive (1 for relu; for tanh 1 / the root-mean-square of the drive onto the input cells over the fitting dives).
//   THE EDGE     g*, for a relu circuit: the largest nominal radius in [GAIN_FLOOR, GAIN_CEIL] at which the reservoir driven by the fitting dives never has a cell above BLOWUP at any tick (16 steps of geometric bisection); status `blowsAtFloor` or `neverBlows` when the interval has no edge.
//   THE ARMS     R (relu, g = a factor x g*, read from the 64 output cells and a constant), A (the same, read from all cells and a constant), T (tanh, g from a fixed grid, read from the output cells).
//   THE CAP      CAP is a guard against overflow, not a design: a relu activity above it is held at it and the ticks that did so are COUNTED (model.capHits()).
// A MODEL is { n, rho, init(), step(h, x), read(out, h), capHits() }, the interface tools/subHeadingEstimator.mjs works on (normalEquations, scoreReadouts, fitModel, estimatorPilot). Pure: no I/O, no clock, no Math.random.
"use strict";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as E from "./subHeadingEstimator.mjs";

export const CAP = 10000, BLOWUP = 1000, GAIN_FLOOR = 0.5, GAIN_CEIL = 8, BISECT_STEPS = 16;
export const FACTORS = Object.freeze([0.9, 0.97, 0.99, 0.995, 0.999]), TANH_GAINS = Object.freeze([0.5, 0.9, 0.99, 1.2, 1.6, 2.4, 4]), LAMBDAS = Object.freeze([1e-6, 1e-4, 1e-2, 1, 100, 1e4, 1e6]);
export const ARMS = Object.freeze({
    R: Object.freeze({ id: "R", unit: "relu", readAll: false, grid: "edge", name: "relu, edge-matched" }),
    A: Object.freeze({ id: "A", unit: "relu", readAll: true, grid: "edge", name: "relu, edge-matched, read from all cells" }),
    T: Object.freeze({ id: "T", unit: "tanh", readAll: false, grid: "fixed", name: "tanh" }),
});

/**
 * The circuit as a model: `unit` 'relu' or 'tanh'; `gain` the nominal radius (persist: false leaves the recurrence out: NO STATE); `rho` the spectral radius of M when already known; `readAll` reads every cell and a constant (N + 1 numbers) instead of the output cells and a constant;
 * `inScale` multiplies the drive. A relu cell above CAP is held at CAP and counted.
 */
export function reservoirModel(circuit, { unit = "relu", gain, rho = null, persist = true, readAll = false, inScale = 1 } = {}) {
    if (unit !== "relu" && unit !== "tanh") throw new Error(`subReservoirV3.reservoirModel: the unit must be relu or tanh, got ${JSON.stringify(unit)}`);
    if (!(gain >= 0) || !Number.isFinite(gain)) throw new Error(`subReservoirV3.reservoirModel: the gain must be a number of 0 or more, got ${gain}`);
    const P = CS.createStatePolicy(circuit, "estimator"), R = CS.reservoirOf(circuit), win = P.handWeights(), N = R.N, NI = R.inputs.length, no = R.outputs.length, E_ = R.E, relu = unit === "relu";
    const r = rho === null ? E.spectralRadius(R) : rho, g = persist && r > 0 ? gain / r : 0;
    const outStart = new Int32Array(N + 1); for (let k = 0; k < E_; k++) outStart[R.from[k] + 1]++;
    for (let j = 0; j < N; j++) outStart[j + 1] += outStart[j];
    const outTo = new Int32Array(E_), outGain = new Float64Array(E_), fill = outStart.slice(0, N);
    for (let k = 0; k < E_; k++) { const at = fill[R.from[k]]++; outTo[at] = R.to[k]; outGain[at] = g * R.sign[k] * R.mag[k]; }
    let hits = 0;
    return {
        n: (readAll ? N : no) + 1, rho: r, init: () => new Float64Array(N), capHits: () => hits,
        step(h, x) {
            const o = new Float64Array(N);
            if (g !== 0) for (let j = 0; j < N; j++) { const hj = h[j]; if (hj !== 0) for (let q = outStart[j]; q < outStart[j + 1]; q++) o[outTo[q]] += outGain[q] * hj; }
            for (let a = 0; a < NI; a++) { let sum = 0; const row = a * E.NF; for (let f = 0; f < E.NF; f++) sum += win[row + f] * x[f]; o[R.inputs[a]] += inScale * sum; }
            if (relu) { for (let i = 0; i < N; i++) { const v = o[i]; if (!(v > 0)) o[i] = 0; else if (v > CAP) { o[i] = CAP; hits++; } } } else for (let i = 0; i < N; i++) o[i] = Math.tanh(o[i]);
            return o;
        },
        read(out, h) { if (readAll) { for (let j = 0; j < N; j++) out[j] = h[j]; out[N] = 1; } else { for (let j = 0; j < no; j++) out[j] = h[R.outputs[j]]; out[no] = 1; } },
    };
}

/** 1 / the root-mean-square of the drive (W_in x, summed over the features) onto the input cells over every tick of `dives`; 1 when the drive is zero. */
export function driveScale(circuit, dives) {
    const P = CS.createStatePolicy(circuit, "estimator"), R = CS.reservoirOf(circuit), win = P.handWeights(), NI = R.inputs.length; let sum = 0, cnt = 0;
    for (const d of dives) for (let t = 0; t < d.ticks; t++) for (let a = 0; a < NI; a++) { let s = 0; for (let f = 0; f < E.NF; f++) s += win[a * E.NF + f] * d.X[t * E.NF + f]; sum += s * s; cnt++; }
    const rms = cnt > 0 ? Math.sqrt(sum / cnt) : 0;
    return rms > 0 ? 1 / rms : 1;
}

/**
 * The edge of a relu circuit: { gain: g*, status, steps }. `status` is 'edge' (the largest non-blowing nominal radius found), 'blowsAtFloor' (even `floor` blows up: gain = floor) or 'neverBlows' (even `ceil` does not: gain = ceil).
 * A gain BLOWS UP when, driven by `dives`, any cell exceeds `bound` at any tick. `rho` is the spectral radius of M when known.
 */
export function edgeGain(circuit, dives, { rho = null, bound = BLOWUP, floor = GAIN_FLOOR, ceil = GAIN_CEIL, steps = BISECT_STEPS } = {}) {
    const r = rho === null ? E.spectralRadius(CS.reservoirOf(circuit)) : rho;
    const blows = (gain) => {
        const m = reservoirModel(circuit, { unit: "relu", gain, rho: r });
        for (const d of dives) { let h = m.init(); for (let t = 0; t < d.ticks; t++) { h = m.step(h, d.X.subarray(t * E.NF, t * E.NF + E.NF)); for (let i = 0; i < h.length; i++) if (h[i] > bound) return true; } }
        return false;
    };
    if (blows(floor)) return { gain: floor, status: "blowsAtFloor", steps: 0 };
    if (!blows(ceil)) return { gain: ceil, status: "neverBlows", steps: 0 };
    let lo = floor, hi = ceil;
    for (let i = 0; i < steps; i++) { const mid = Math.sqrt(lo * hi); if (blows(mid)) hi = mid; else lo = mid; }
    return { gain: lo, status: "edge", steps };
}

/**
 * The gains an arm tries for a circuit, with what was found on the way: { settings: [nominal radius], gStar (null unless an edge arm), status, inScale }.
 * Edge arms: FACTORS x g* (the edge is looked for on `fitDives`; `edge` may be passed when already found). The tanh arm: TANH_GAINS, with inScale = driveScale(circuit, fitDives). NO STATE (persist false) has no recurrence: one setting, nothing found.
 */
export function gainsFor(arm, circuit, fitDives, { persist = true, rho = null, edge = null } = {}) {
    if (!persist) return { settings: [1], gStar: null, status: "noRecurrence", inScale: arm.unit === "tanh" ? driveScale(circuit, fitDives) : 1 };
    if (arm.grid === "edge") { const e = edge || edgeGain(circuit, fitDives, { rho }); return { settings: FACTORS.map((f) => f * e.gain), gStar: e.gain, status: e.status, inScale: 1 }; }
    return { settings: [...TANH_GAINS], gStar: null, status: "fixedGrid", inScale: driveScale(circuit, fitDives) };
}

/** The scores of a fitted readout on a set of dives, as tools/subHeadingEstimator.mjs scoreFit gives them, and the number of ticks the relu cells were held at CAP while scoring: { rmse, none, oracle, skill, darkTicks, capHits }. */
export function scoreWith(model, readout, dives) {
    const sc = E.scoreReadouts(model, [Float64Array.from(readout)], dives), rmse = E.rmseOf(sc.sumSq[0], sc.dark), none = E.rmseOf(sc.none, sc.dark);
    return { rmse, none, oracle: E.rmseOf(sc.oracle, sc.dark), skill: none > 0 ? 1 - rmse / none : null, darkTicks: sc.dark, capHits: model.capHits() };
}
