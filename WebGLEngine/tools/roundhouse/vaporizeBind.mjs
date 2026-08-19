// WebGLEngine/tools/roundhouse/vaporizeBind.mjs -- v3620
//
// THE VAPORIZE DEVICE. Three modes, and the third is the one the round exists for.
//
//   "key"       -- Clausius-Clapeyron against steam-table vapour pressures, WITH ITS OWN ACCURACY REPORTED.
//                  Exact at the anchor (which proves nothing on its own), and graded on the points it was not
//                  fitted to.
//   "ratio"     -- the expansion ratio by TWO routes that share no formula: ideal gas (RT/P over a molar volume)
//                  and tabulated saturated densities. They agree at 1 atm and DIVERGE near critical, which is
//                  what makes the agreement a reading about the regime rather than a tautology.
//   "trilemma"  -- mass, volume, density: pick two. One number r decides every penalty, AND r GOES TO EXACTLY 1
//                  AT THE CRITICAL POINT, where all three schemes coincide and in-place gasification is exact.
//                  THAT IS THE CONTROL: the trap is distance from critical, not the voxel scheme.
//
// ================================================================================================================
// *** v3850 -- PLANTED WITH THE SINGLE MOST COMMON ERROR IN THERMODYNAMICS: CELSIUS WHERE KELVIN BELONGS. ***
// ================================================================================================================
//
// expansionRatio is (R*T/P) / (M/rho), and T there is ABSOLUTE. Writing 100 instead of 373.15 is a defect
// nobody would defend and everybody has shipped -- it does not throw, it does not go negative, it produces a
// perfectly ordinary-looking expansion ratio, and the only thing wrong with it is that it is a factor of 3.73
// small at the boiling point and a DIFFERENT factor small everywhere else.
//
// *** THE PLANT SITS ON ONE OF THE TWO ROUTES AND LEAVES THE OTHER ALONE, WHICH IS WHY routeGap IS THE RIGHT
// OBSERVABLE. *** `ratioMeasured` comes from tabulated saturated densities and never touches T; `ratioIdeal`
// comes from the ideal-gas law and is where the plant lives. So the answer key does not move and the whole
// excursion belongs to the route under test -- a plant that moved BOTH would be measuring nothing.
//
// MEASURED, the two arms: routeGap 1.5898e-2 -> 7.2775e-1, a separation of 45.8x, with ratioIdeal going
// 1628.2919 -> 436.3639 while ratioMeasured STAYS AT 1602.8108 to every digit.
//
// *** "ratio" IS modes[0] ON PURPOSE. *** probeModePlant compares the plant against modes.find(m => m !==
// plantMode), so the primary must own the declared observable -- routeGap exists only in the ratio branch.
// With "key" first the census would build an arm with no routeGap in it and report this device DECLARED BUT
// DEAD, exactly as mpmrefine read from v3802 to v3849. THE DEFAULT IS UNTOUCHED: vaporizeDefaults still
// returns "key".
//
// NOT PLANTED, AND THE REASON IS WORTH RECORDING: the obvious plant on the `key` mode -- a wrong latent heat --
// IS INVISIBLE AT THE ANCHOR BY CONSTRUCTION, because at T = T0 the exponent is zero whatever L is, so
// anchorRel stays EXACTLY 0. That is this device's own stated lesson ("exact at the anchor, which proves
// nothing on its own") and it makes anchorRel unusable as a plant observable. Measured for the record:
// specific-for-molar L sends worstAwayRel to 3.9e+65, which is not a plausible defect but a detonation, and a
// halved L to 1.40e+1. NEITHER WAS SHIPPED -- a plant should look like a mistake somebody could make and not
// notice, and both of those are visible from orbit.
//
// NO GAS DYNAMICS ARE BUILT AND THE DEVICE CANNOT BE ASKED FOR ANY. What it grades is the ARITHMETIC OF THE
// TRANSITION -- how much gas a given amount of condensate becomes, and what a type-per-voxel grid must give up
// to draw it.
"use strict";
import {
    WATER, SATURATION, satPressure, keyAccuracy, expansionRatio, densityRatio, representationChoices, voxelCost,
} from "../../physics/thermal/vaporize.mjs";

// "ratio" FIRST: routeGap lives only in that branch and the contract compares against modes[0].
export const VAPORIZE_MODES = ["ratio", "key", "trilemma", "celsius"];

export const VAPORIZE_OBSERVABLES = [
    "anchorRel", "worstAwayRel", "criticalRel", "ratioIdeal", "ratioMeasured", "routeGap",
    "ratioSpan", "r", "massFactor", "volumeFactor", "voxelCost", "blockSide", "criticalRatio",
    // *** v3850 -- COMPLETED. These keys were RETURNED BY THE BUILDER AND NEVER DECLARED, and nothing
    // caught it because this device was not in labDevices-selfcheck's observable-honesty check --
    // that list held 17 devices and none of the thermal four. Planting them put them in it. An
    // UNDECLARED OBSERVABLE IS INVISIBLE TO EVERY CONSUMER THAT READS THE LIST RATHER THAN THE CODE,
    // which is the whole reason the list exists. ***
    "kind", "T", "note", "rows", "allPenaltiesEqualR",
];

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export function vaporizeDefaults(hyp = {}) {
    const h = { ...hyp }, c = { ...(h.config || {}) };
    // BOUNDED to the saturation table's own range: outside it the tabulated anchors do not exist, and
    // extrapolating them would be inventing reference data.
    c.T = Math.min(SATURATION[SATURATION.length - 1].T, Math.max(SATURATION[0].T, num(c.T, 373.15)));
    // THE VALIDATOR MUST LIST THE PLANT MODE, or `celsius` reverts to `key` and the plant fires at nothing.
    if (!VAPORIZE_MODES.includes(h.mode)) h.mode = "key";
    h.config = c;
    return h;
}

/** Nearest tabulated row -- the device never interpolates between external anchors and calls it data. */
const rowFor = (T) => SATURATION.reduce((a, b) => (Math.abs(b.T - T) < Math.abs(a.T - T) ? b : a));

function keyRun() {
    const acc = keyAccuracy();
    const anchor = acc.find((a) => a.T === WATER.Tboil);
    const away = acc.filter((a) => a.T !== WATER.Tboil);
    const pc = satPressure(WATER.Tcrit);
    return {
        anchorRel: anchor.rel, worstAwayRel: Math.max(...away.map((a) => a.rel)),
        criticalRel: Math.abs(pc - WATER.Pcrit) / WATER.Pcrit,
        rows: acc.map((a) => ({ T: a.T, cc: a.cc, known: a.known, rel: a.rel })),
        note: "EXACT AT THE ANCHOR BY CONSTRUCTION -- the away rows are the evidence",
    };
}

function ratioRun(c, { planted = false } = {}) {
    const row = rowFor(c.T);
    const measured = densityRatio(row);
    // *** THE PLANT: T in CELSIUS where the ideal-gas law wants KELVIN. The tabulated route below never
    // touches T, so the answer key is untouched and the excursion is the ideal route's alone. ***
    const Tused = planted ? row.T - 273.15 : row.T;
    const ideal = expansionRatio({ T: Tused, P: satPressure(row.T), rhoLiquid: row.liq });
    const span = densityRatio(SATURATION[0]) / densityRatio(SATURATION[SATURATION.length - 1]);
    return {
        T: row.T, ratioIdeal: ideal, ratioMeasured: measured,
        routeGap: Math.abs(ideal - measured) / measured, ratioSpan: span,
        note: "TWO ROUTES SHARING NO FORMULA. They agree far from critical and diverge near it, so the " +
            "agreement is a reading about the regime rather than a restatement.",
    };
}

function trilemmaRun(c) {
    const row = rowFor(c.T), r = densityRatio(row);
    const ch = representationChoices(r), cost = voxelCost(r);
    const crit = SATURATION[SATURATION.length - 1];
    return {
        T: row.T, r,
        massFactor: ch.inPlaceAsGas.massFactor, volumeFactor: ch.inPlaceDense.volumeFactor,
        voxelCost: cost.voxels, blockSide: cost.side,
        allPenaltiesEqualR: ch.penalties.every((p) => p === r),
        criticalRatio: densityRatio(crit),
        note: "ONE NUMBER DECIDES EVERY PENALTY, and it is EXACTLY 1 at the critical point -- where all three " +
            "schemes coincide and in-place gasification is exact on the same grid.",
    };
}

export function buildVaporize(hyp, base = {}) {
    const h = vaporizeDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    if (h.mode === "ratio") return { kind: "ratio", ...ratioRun(h.config) };
    // The plant runs the SAME row and the SAME pressure -- only the temperature handed to the ideal-gas route
    // changes -- so the separation belongs to the defect and not to a second fixture.
    if (h.mode === "celsius") return { kind: "celsius", ...ratioRun(h.config, { planted: true }) };
    if (h.mode === "trilemma") return { kind: "trilemma", ...trilemmaRun(h.config) };
    return { kind: "key", ...keyRun() };
}

export const vaporizeDevice = {
    modes: VAPORIZE_MODES,
    plantMode: "celsius", plantFlips: "routeGap", plantKind: "mode",
    name: "vaporize-gasification",
    observables: VAPORIZE_OBSERVABLES,
    build: buildVaporize,
    defaults: vaporizeDefaults,
    saturation: SATURATION,
    water: WATER,
};
