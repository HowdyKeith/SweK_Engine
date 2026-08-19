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
// NO GAS DYNAMICS ARE BUILT AND THE DEVICE CANNOT BE ASKED FOR ANY. What it grades is the ARITHMETIC OF THE
// TRANSITION -- how much gas a given amount of condensate becomes, and what a type-per-voxel grid must give up
// to draw it.
"use strict";
import {
    WATER, SATURATION, satPressure, keyAccuracy, expansionRatio, densityRatio, representationChoices, voxelCost,
} from "../../physics/thermal/vaporize.mjs";

export const VAPORIZE_OBSERVABLES = [
    "anchorRel", "worstAwayRel", "criticalRel", "ratioIdeal", "ratioMeasured", "routeGap",
    "ratioSpan", "r", "massFactor", "volumeFactor", "voxelCost", "blockSide", "criticalRatio",
];

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export function vaporizeDefaults(hyp = {}) {
    const h = { ...hyp }, c = { ...(h.config || {}) };
    // BOUNDED to the saturation table's own range: outside it the tabulated anchors do not exist, and
    // extrapolating them would be inventing reference data.
    c.T = Math.min(SATURATION[SATURATION.length - 1].T, Math.max(SATURATION[0].T, num(c.T, 373.15)));
    if (!["key", "ratio", "trilemma"].includes(h.mode)) h.mode = "key";
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

function ratioRun(c) {
    const row = rowFor(c.T);
    const measured = densityRatio(row);
    const ideal = expansionRatio({ T: row.T, P: satPressure(row.T), rhoLiquid: row.liq });
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
    if (h.mode === "trilemma") return { kind: "trilemma", ...trilemmaRun(h.config) };
    return { kind: "key", ...keyRun() };
}

export const vaporizeDevice = {
    modes: ["key", "ratio", "trilemma"],
    name: "vaporize-gasification",
    observables: VAPORIZE_OBSERVABLES,
    build: buildVaporize,
    defaults: vaporizeDefaults,
    saturation: SATURATION,
    water: WATER,
};
