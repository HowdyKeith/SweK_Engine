// WebGLEngine/tools/subReservoirV4.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/subReservoirV4-selfcheck.mjs)
//
// THE RESERVOIRS OF RUNG 4a VERSION 4, "THE RING MAP AND THE FINE EDGE", AS REGISTERED IN brain/SUBMARINE_WIP.md ("RUNG 4a VERSION 4", written before this file). Version 3 (tools/subReservoirV3.mjs, which this file imports from and leaves as it is) fed every input cell a random mix of ALL
// sense features and stopped its factor grid at 0.999 of the edge. v4 changes exactly two things, one per arm:
//   FE  the FINE EDGE   the v3 relu arm R (random full-mix input, readout from the 64 output cells) with two finer factors, 0.9995 and 0.9999.
//   RM  the RING MAP    the same reservoir, the same grid, the same readout; only W_in differs: of the sense features only the heading rate (slot 5) and the compass flag (slot 14) are connected. The rate drives each PEN input cell (PEN_a, PEN_b) with +w on side R and -w on
//                       side L and no EPG cell; the flag drives each EPG input cell with +w and no PEN cell. w is ONE number per circuit, chosen so that the root-mean-square of the drive onto the input cells over the fitting dives equals that of the v3 random map for the SAME
//                       circuit (the matched-drive rule: the comparison is the STRUCTURE of the input, not its size). The side and the type are the cell's own record, which the controls (rewirings that keep the neurons) carry unchanged.
//   THE EDGE g* of an arm is found under THAT ARM'S OWN W_in (the cliff depends on the drive; a clarification of the registration made before any run: "g* found as in v3" means v3's procedure, on the arm's own input).
// Not used: the glomerulus number in the instance names, an anchor bump, a tanh arm, an all-cells readout (see the registration's NOT TESTED). Pure: no I/O, no clock, no Math.random.
"use strict";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as E from "./subHeadingEstimator.mjs";
import * as V3 from "./subReservoirV3.mjs";

export const CAP = V3.CAP, BLOWUP = V3.BLOWUP, LAMBDAS = V3.LAMBDAS;
export const FACTORS = Object.freeze([0.9, 0.97, 0.99, 0.995, 0.999, 0.9995, 0.9999]);
export const RATE_SLOT = E.YAW_FEATURE, FLAG_SLOT = E.NF - 1;
export const ARMS = Object.freeze({
    FE: Object.freeze({ id: "FE", unit: "relu", readAll: false, grid: "edge", input: "random", name: "fine edge, random full-mix input" }),
    RM: Object.freeze({ id: "RM", unit: "relu", readAll: false, grid: "edge", input: "ring", name: "ring map, side-coded rate and flag" }),
});
const PEN = new Set(["PEN_a", "PEN_b"]);

/** The random full-mix W_in of v3 (the circuit pilot's seeded hand weights): its first NI x NF numbers are the input rows (the vector is longer; the rest is the pilot's other weights, unused here). */
export const randomWeights = (circuit) => CS.createStatePolicy(circuit, "estimator").handWeights();

/** The ring map's W_in for weight `w`: NI x NF numbers, row a being the circuit's a-th input cell. A PEN input cell needs a side L or R (anything else throws: a silent zero would be a map with a hole). */
export function ringWeights(circuit, w = 1) {
    const R = CS.reservoirOf(circuit), NI = R.inputs.length, win = new Float64Array(NI * E.NF);
    for (let a = 0; a < NI; a++) {
        const cell = circuit.neurons[R.inputs[a]], cls = cell.cls || cell.layerName || cell.type;
        if (PEN.has(cls)) {
            if (cell.side !== "L" && cell.side !== "R") throw new Error(`subReservoirV4.ringWeights: input cell ${R.inputs[a]} (${cls}) has side ${JSON.stringify(cell.side)}, not L or R`);
            win[a * E.NF + RATE_SLOT] = cell.side === "R" ? w : -w;
        } else if (cls === "EPG") win[a * E.NF + FLAG_SLOT] = w;
    }
    return win;
}

/** The root-mean-square of the drive (W_in x, per input cell) over every tick of `dives`, for the weights `win`. 0 when there is no drive. */
export function rmsDrive(circuit, win, dives) {
    const NI = CS.reservoirOf(circuit).inputs.length; let sum = 0, cnt = 0;
    for (const d of dives) for (let t = 0; t < d.ticks; t++) for (let a = 0; a < NI; a++) { let s = 0; for (let f = 0; f < E.NF; f++) s += win[a * E.NF + f] * d.X[t * E.NF + f]; sum += s * s; cnt++; }
    return cnt > 0 ? Math.sqrt(sum / cnt) : 0;
}

/** The weight w of the ring map by the matched-drive rule: the rms drive of the random map over the fitting dives divided by that of the ring map at w = 1 (1 when the ring map has no drive). */
export function matchedWeight(circuit, dives) {
    const ring = rmsDrive(circuit, ringWeights(circuit, 1), dives), rnd = rmsDrive(circuit, randomWeights(circuit), dives);
    return ring > 0 ? rnd / ring : 1;
}

/** The W_in of an arm for a circuit: the random map (arm.input 'random') or the ring map at the matched weight. */
export const windowFor = (arm, circuit, fitDives) => (arm.input === "ring" ? ringWeights(circuit, matchedWeight(circuit, fitDives)) : randomWeights(circuit));

/** v3's reservoirModel with W_in a parameter (`win`, NI x NF; the random map by default): h' = min(CAP, relu(s W_in x + g M h)) or tanh; a relu cell above CAP is held at CAP and counted. With the random map it is v3's model bit for bit. */
export function reservoirModel(circuit, { unit = "relu", gain, rho = null, persist = true, readAll = false, inScale = 1, win = null } = {}) {
    if (unit !== "relu" && unit !== "tanh") throw new Error(`subReservoirV4.reservoirModel: the unit must be relu or tanh, got ${JSON.stringify(unit)}`);
    if (!(gain >= 0) || !Number.isFinite(gain)) throw new Error(`subReservoirV4.reservoirModel: the gain must be a number of 0 or more, got ${gain}`);
    const R = CS.reservoirOf(circuit), W = win || randomWeights(circuit), N = R.N, NI = R.inputs.length, no = R.outputs.length, E_ = R.E, relu = unit === "relu";
    if (W.length < NI * E.NF) throw new Error(`subReservoirV4.reservoirModel: W_in has ${W.length} numbers, at least ${NI * E.NF} wanted (the input rows come first; the circuit pilot's weight vector carries more after them)`);
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
            for (let a = 0; a < NI; a++) { let sum = 0; const row = a * E.NF; for (let f = 0; f < E.NF; f++) sum += W[row + f] * x[f]; o[R.inputs[a]] += inScale * sum; }
            if (relu) { for (let i = 0; i < N; i++) { const v = o[i]; if (!(v > 0)) o[i] = 0; else if (v > CAP) { o[i] = CAP; hits++; } } } else for (let i = 0; i < N; i++) o[i] = Math.tanh(o[i]);
            return o;
        },
        read(out, h) { if (readAll) { for (let j = 0; j < N; j++) out[j] = h[j]; out[N] = 1; } else { for (let j = 0; j < no; j++) out[j] = h[R.outputs[j]]; out[no] = 1; } },
    };
}

/** v3's edge procedure (16 steps of geometric bisection on [floor, ceil], a gain blows up when any cell passes `bound` at any tick of `dives`) under the arm's own W_in `win`: { gain: g*, status, steps }. */
export function edgeGain(circuit, dives, { win = null, rho = null, bound = BLOWUP, floor = V3.GAIN_FLOOR, ceil = V3.GAIN_CEIL, steps = V3.BISECT_STEPS } = {}) {
    const r = rho === null ? E.spectralRadius(CS.reservoirOf(circuit)) : rho;
    const blows = (gain) => {
        const m = reservoirModel(circuit, { unit: "relu", gain, rho: r, win });
        for (const d of dives) { let h = m.init(); for (let t = 0; t < d.ticks; t++) { h = m.step(h, d.X.subarray(t * E.NF, t * E.NF + E.NF)); for (let i = 0; i < h.length; i++) if (h[i] > bound) return true; } }
        return false;
    };
    if (blows(floor)) return { gain: floor, status: "blowsAtFloor", steps: 0 };
    if (!blows(ceil)) return { gain: ceil, status: "neverBlows", steps: 0 };
    let lo = floor, hi = ceil;
    for (let i = 0; i < steps; i++) { const mid = Math.sqrt(lo * hi); if (blows(mid)) hi = mid; else lo = mid; }
    return { gain: lo, status: "edge", steps };
}

/** The gains an arm tries for a circuit: { settings: FACTORS x g*, gStar, status, inScale: 1, win }. NO STATE (persist false) has no recurrence: one setting, nothing found (its `win` is still the arm's, so it gets the same input). `edge` may be passed when already found. */
export function gainsFor(arm, circuit, fitDives, { persist = true, rho = null, edge = null, win = null } = {}) {
    const W = win || windowFor(arm, circuit, fitDives);
    if (!persist) return { settings: [1], gStar: null, status: "noRecurrence", inScale: 1, win: W };
    const e = edge || edgeGain(circuit, fitDives, { win: W, rho });
    return { settings: FACTORS.map((f) => f * e.gain), gStar: e.gain, status: e.status, inScale: 1, win: W };
}

export const scoreWith = V3.scoreWith;

/** What the audit's target does, for the report (registered reading g): { maxAbs, overPi } -- the largest |cumulative heading change| over the dives and the share of dives whose largest |cumulative change| exceeds pi. */
export function targetRange(dives) {
    let maxAbs = 0, over = 0;
    for (const d of dives) { let m = 0; for (let t = 0; t < d.ticks; t++) { const a = Math.abs(d.cum[t]); if (a > m) m = a; } if (m > maxAbs) maxAbs = m; if (m > Math.PI) over++; }
    return { maxAbs, overPi: dives.length ? over / dives.length : 0 };
}
