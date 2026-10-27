// WebGLEngine/tools/subReservoirV5.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/subReservoirV5-selfcheck.mjs)
//
// THE RESERVOIRS OF RUNG 4a VERSION 5, "THE RING MAP WITHOUT THE FLAG", AS REGISTERED IN brain/SUBMARINE_WIP.md ("RUNG 4a VERSION 5", written before this file). v4's ring-map arm drove every EPG input cell with the compass flag (1 lit, 0 dark) and the scoring is on the dark ticks only: its output cells carried a large
// lit/dark step and no circuit of any wiring integrated. v5 takes the flag out and keeps the rest. Two arms, both flag-free, and both with ONLY the heading rate (slot 5) connected:
//   RMF  the ring map without the flag   +w on each PEN input cell (PEN_a, PEN_b) of side R, -w on each of side L; no EPG cell and no other cell receives any input.
//   RMU  the unsigned control            +w on EVERY PEN input cell whatever its side; the same matched-drive rule. It says whether the SIDE coding matters.
// Everything else is v4's: relu, g = factor x g* with g* found under the arm's own W_in on the 40 fitting dives, the seven factors, the ridge grid, the readout from the 64 output cells and a constant. w is the matched-drive weight: the rms of the drive onto the 88 input cells over the fitting dives equals that of the
// v3 random map for the SAME circuit. This file reuses v4's model, edge and scoring unchanged and adds the two maps, their windows and the in-sample skill that the signal check reads. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as E from "./subHeadingEstimator.mjs";
import * as V4 from "./subReservoirV4.mjs";

export const FACTORS = V4.FACTORS, LAMBDAS = V4.LAMBDAS, CAP = V4.CAP, BLOWUP = V4.BLOWUP, RATE_SLOT = V4.RATE_SLOT;
export const reservoirModel = V4.reservoirModel, edgeGain = V4.edgeGain, scoreWith = V4.scoreWith, targetRange = V4.targetRange, rmsDrive = V4.rmsDrive, randomWeights = V4.randomWeights;
export const ARMS = Object.freeze({
    RMF: Object.freeze({ id: "RMF", unit: "relu", readAll: false, grid: "edge", input: "signed", name: "ring map without the flag, side-coded rate" }),
    RMU: Object.freeze({ id: "RMU", unit: "relu", readAll: false, grid: "edge", input: "unsigned", name: "unsigned control, the same rate into every PEN cell" }),
});
export const SIGNAL_MIN = 0.05, SIGNAL_FAMILIES = Object.freeze(["er", "layer", "degree"]);
const PEN = new Set(["PEN_a", "PEN_b"]);

/** The flag-free W_in for weight `w`: NI x NF numbers, only the rate slot, only the PEN input cells. `signed`: +w on side R and -w on side L (RMF); else +w on every PEN input cell (RMU). A PEN input cell with no side throws in the signed map (a silent zero would be a hole). */
export function rateWeights(circuit, w = 1, { signed = true } = {}) {
    const R = CS.reservoirOf(circuit), NI = R.inputs.length, win = new Float64Array(NI * E.NF);
    for (let a = 0; a < NI; a++) {
        const cell = circuit.neurons[R.inputs[a]], cls = cell.cls || cell.layerName || cell.type;
        if (!PEN.has(cls)) continue;
        if (signed) {
            if (cell.side !== "L" && cell.side !== "R") throw new Error(`subReservoirV5.rateWeights: input cell ${R.inputs[a]} (${cls}) has side ${JSON.stringify(cell.side)}, not L or R`);
            win[a * E.NF + RATE_SLOT] = cell.side === "R" ? w : -w;
        } else win[a * E.NF + RATE_SLOT] = w;
    }
    return win;
}

/** The matched weight for an arm: the random map's rms drive over the fitting dives divided by the arm's map at w = 1 (1 when the map has no drive). */
export function matchedWeight(arm, circuit, dives) {
    const m = rmsDrive(circuit, rateWeights(circuit, 1, { signed: arm.input === "signed" }), dives), r = rmsDrive(circuit, randomWeights(circuit), dives);
    return m > 0 ? r / m : 1;
}

/** The W_in of an arm for a circuit at the matched weight. */
export const windowFor = (arm, circuit, fitDives) => rateWeights(circuit, matchedWeight(arm, circuit, fitDives), { signed: arm.input === "signed" });

/** v4's gains with the arm's own window: { settings: FACTORS x g*, gStar, status, inScale: 1, win }. NO STATE (persist false) has one setting and still gets the arm's input. `edge` may be handed over. */
export function gainsFor(arm, circuit, fitDives, { persist = true, rho = null, edge = null, win = null } = {}) {
    return V4.gainsFor(arm, circuit, fitDives, { persist, rho, edge, win: win || windowFor(arm, circuit, fitDives) });
}

/** The signal check of an arm over its records: { signal: true | false | null, mean, n } -- the mean in-sample skill (the fitting dives) over the ER, TYPE-BLOCK and DEGREE circuits, signal iff it is at least SIGNAL_MIN; null when a record lacks it. */
export function signalCheck(records) {
    const rs = records.filter((r) => SIGNAL_FAMILIES.includes(r.family));
    if (!rs.length || rs.some((r) => !r.fitScore || !Number.isFinite(r.fitScore.skill))) return { signal: null, mean: null, n: rs.length };
    const mean = rs.reduce((a, r) => a + r.fitScore.skill, 0) / rs.length;
    return { signal: mean >= SIGNAL_MIN, mean, n: rs.length };
}
