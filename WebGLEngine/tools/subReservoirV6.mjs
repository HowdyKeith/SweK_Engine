// WebGLEngine/tools/subReservoirV6.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/subReservoirV6-selfcheck.mjs)
//
// THE RESERVOIRS OF RUNG 4a VERSION 6, "THE GLOMERULUS-SHIFT MAP", AS REGISTERED IN brain/RUNG_4A_V6_SHIFT_MAP_WIP.md (written and committed, d9243ffd, before this file). v5's flag-free side-coded map (RMF) had no heading
// representation to move: every version started the reservoir at zero. v6 starts each dive with a BUMP on the EPG cells, placed by the angle of each cell's protocerebral-bridge glomerulus, and keeps RMF's input exactly:
//   SB  the shift map with a bump   EPG cell i starts at A x max(0, cos(angle_i)); every other cell at 0.
//   SF  the flat start              every EPG cell starts at the mean of SB's EPG start (the same total); every other cell at 0.
//   THE NUMBERING (from the Delta7 names, registration section 1): angle(R_k) = 45 x ((k - 1) mod 8) degrees, angle(L_k) = angle(R_(9-k)).
//   A in {1, 4} x r (r the v3 random map's rms drive over the fitting dives); g* by v4's edge procedure under the arm's input AND its start at 4r; settings FACTORS x g* crossed with the two amplitudes, factor-major.
// Everything else is v4's and v5's: the model (only `init` differs), relu, the cap, the readout, the matched weight. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as E from "./subHeadingEstimator.mjs";
import * as V3 from "./subReservoirV3.mjs";
import * as V4 from "./subReservoirV4.mjs";
import * as V5 from "./subReservoirV5.mjs";

export const FACTORS = V4.FACTORS, LAMBDAS = V4.LAMBDAS, CAP = V4.CAP, BLOWUP = V4.BLOWUP, RATE_SLOT = V4.RATE_SLOT, AMPS = Object.freeze([1, 4]), SIGNAL_MIN = V5.SIGNAL_MIN;
export const MOVE_MIN_DEG = 10, MECH_TICKS = 60;
export const scoreWith = V4.scoreWith, targetRange = V4.targetRange, rmsDrive = V4.rmsDrive, randomWeights = V4.randomWeights, signalCheck = V5.signalCheck;
export const ARMS = Object.freeze({
    SB: Object.freeze({ id: "SB", unit: "relu", readAll: false, start: "bump", input: "signed", name: "shift map, a bump start and the side-coded rate" }),
    SF: Object.freeze({ id: "SF", unit: "relu", readAll: false, start: "flat", input: "signed", name: "flat start (the control for the bump), the same rate" }),
});

/** The angle in DEGREES of a glomerulus name ("R3" -> 90, "L6" -> 90 = angle(R3)); null for anything else. */
export function glomerulusAngle(g) {
    const m = /^([LR])(\d+)$/.exec(String(g)); if (!m) return null;
    const k = Number(m[2]), r = m[1] === "R" ? k : 9 - k;
    return 45 * ((((r - 1) % 8) + 8) % 8);
}
/** Each neuron's angle in RADIANS if it is an EPG cell with a glomerulus in its instance name, else null. */
export function epgAngles(circuit) {
    return circuit.neurons.map((n) => {
        if (n.cls !== "EPG") return null;
        const m = /_([LR]\d+)$/.exec(String(n.instance)); if (!m) return null;
        const a = glomerulusAngle(m[1]); return a === null ? null : (a * Math.PI) / 180;
    });
}
/** The start of a dive for an arm ("bump" or "flat") at amplitude `amp`: a Float64Array of the circuit's N cells. A circuit with no EPG angle is refused. */
export function startOf(kind, circuit, amp) {
    const ang = epgAngles(circuit), N = circuit.neurons.length, s = new Float64Array(N), epg = ang.map((a, i) => (a === null ? -1 : i)).filter((i) => i >= 0);
    if (!epg.length) throw new Error("subReservoirV6.startOf: the circuit has no EPG cell with a glomerulus");
    if (kind !== "bump" && kind !== "flat") throw new Error(`subReservoirV6.startOf: the start is bump or flat, got ${JSON.stringify(kind)}`);
    for (const i of epg) s[i] = amp * Math.max(0, Math.cos(ang[i]));
    if (kind === "flat") { const m = epg.reduce((t, i) => t + s[i], 0) / epg.length; for (const i of epg) s[i] = m; }
    return s;
}
/** v4's reservoir model with every dive starting at `start` instead of 0 (a fresh copy each dive). Nothing else differs. */
export function modelWithStart(circuit, opts, start) {
    const m = V4.reservoirModel(circuit, opts);
    return { ...m, init: () => Float64Array.from(start) };
}
/** v4's edge procedure with the model started at `start`: { gain: g*, status, steps }. */
export function edgeGainStart(circuit, dives, { win, rho = null, start, bound = BLOWUP, floor = V3.GAIN_FLOOR, ceil = V3.GAIN_CEIL, steps = V3.BISECT_STEPS } = {}) {
    const r = rho === null ? E.spectralRadius(CS.reservoirOf(circuit)) : rho;
    const blows = (gain) => {
        const m = modelWithStart(circuit, { unit: "relu", gain, rho: r, win }, start);
        for (const d of dives) { let h = m.init(); for (let t = 0; t < d.ticks; t++) { h = m.step(h, d.X.subarray(t * E.NF, t * E.NF + E.NF)); for (let i = 0; i < h.length; i++) if (h[i] > bound) return true; } }
        return false;
    };
    if (blows(floor)) return { gain: floor, status: "blowsAtFloor", steps: 0 };
    if (!blows(ceil)) return { gain: ceil, status: "neverBlows", steps: 0 };
    let lo = floor, hi = ceil;
    for (let i = 0; i < steps; i++) { const mid = Math.sqrt(lo * hi); if (blows(mid)) hi = mid; else lo = mid; }
    return { gain: lo, status: "edge", steps };
}
/** The input map: v5's RMF (signed) at v5's matched weight. */
export const windowFor = (circuit, fitDives) => V5.windowFor(V5.ARMS.RMF, circuit, fitDives);
/** The amplitude scale r of a circuit: the v3 random map's rms drive over the fitting dives. */
export const ampScale = (circuit, fitDives) => rmsDrive(circuit, randomWeights(circuit), fitDives);
/** The settings: [{ gain, amp, factor }] FACTORS x g* (factor-major) crossed with AMPS x r; NO STATE (gStar null): one gain (1, which v4's model ignores without recurrence) and both amplitudes. */
export function settingsOf(gStar, r) {
    if (gStar === null) return AMPS.map((a) => ({ gain: 1, amp: a * r, factor: null }));
    return FACTORS.flatMap((f) => AMPS.map((a) => ({ gain: f * gStar, amp: a * r, factor: f })));
}
/** The angle in DEGREES of the EPG population vector of a state h (null when no EPG cell is active). */
export function popAngle(angles, h) {
    let x = 0, y = 0; for (let i = 0; i < h.length; i++) if (angles[i] !== null && h[i] > 0) { x += h[i] * Math.cos(angles[i]); y += h[i] * Math.sin(angles[i]); }
    return x === 0 && y === 0 ? null : (Math.atan2(y, x) * 180) / Math.PI;
}
/** The registered rule: the bump moves with the turn iff the two angles have opposite signs and each is at least MOVE_MIN_DEG from 0. */
export const movesWithTurn = (plus, minus) => plus !== null && minus !== null && Math.sign(plus) === -Math.sign(minus) && Math.abs(plus) >= MOVE_MIN_DEG && Math.abs(minus) >= MOVE_MIN_DEG;
/** The mechanism check for a model made at a setting: from the start, a constant rate of +1 and then (separately) -1 in the rate slot for MECH_TICKS ticks: { plus, minus, moves } (angles in degrees). */
export function mechanism(circuit, model) {
    const ang = epgAngles(circuit), run = (rate) => { let h = model.init(); const x = new Float64Array(E.NF); x[RATE_SLOT] = rate; for (let t = 0; t < MECH_TICKS; t++) h = model.step(h, x); return popAngle(ang, h); };
    const plus = run(1), minus = run(-1);
    return { plus, minus, moves: movesWithTurn(plus, minus) };
}
