// tools/roundhouse/stabilityBind.mjs -- v3783
//
// *** TIER 2. physics/sph/stability.mjs was ungraded, and its key is A DIRECTION RATHER THAN A VALUE:
// A CLOSED SYSTEM WITH NO ENERGY INPUT CANNOT GAIN MECHANICAL ENERGY. Gravity converts PE to KE and viscosity
// dissipates; nothing puts any back. So energyRatio -- final (KE+PE) over initial -- MUST NOT EXCEED 1, and
// anything above it is the solver INVENTING energy. That is a physical law the code is never told, and it is
// an INEQUALITY, so there is no tolerance to argue about. ***
//
// *** THE SHIPPED VISCOSITY FAILS IT, AND THAT IS NOT NEWS -- IT IS WHY viscosityThreshold EXISTS. MEASURED at
// c=15, dt=1e-3: visc 0.1 reads 2.7340 at T=1 and 4.3305 at T=2; 0.3 reads 1.5497 / 1.5078; 0.47 reads
// 0.7755 / 0.8182; 0.7 reads 0.6916 / 0.6094; 1.5 reads 0.3461 / 0.2511. What the device adds is that these
// are RE-DERIVED EVERY RUN instead of sitting in MEASURED_V3542 as numbers somebody once took. ***
//
// *** AND THE MODULE'S OWN SHARPEST FINDING IS REPORTED RATHER THAN GRADED: THE THRESHOLD DOES NOT SURVIVE
// REFINING THE HORIZON. At visc 0.1 the ratio GROWS with T (2.7340 -> 4.3305) while at 0.47 it is nearly flat
// (0.7755 -> 0.8182). A THRESHOLD THAT MOVES WITH RUN LENGTH IS NOT A CONSTANT OF THE SOLVER, so this device
// grades the DIRECTION and the RESPONSE, and leaves the threshold's numeric value to the module that already
// records how it drifts. ***

import { energyRatio, mechanicalEnergy, MEASURED_V3542 } from "../../physics/sph/stability.mjs";

export const STABILITY_OBSERVABLES = [
    "ratio", "createsEnergy", "viscosity", "horizon",
    "ratioLadder", "respondsToViscosity", "monotoneInViscosity", "spanAcrossViscosity",
    "ratioShort", "ratioLong", "horizonDrift", "driftsWithHorizon",
];

export const STABILITY_MODES = ["response", "direction", "horizon", "deafknob"];

const DEF = { visc: 0.47, c: 15, T: 1.0, dt: 1 / 1000 };
const VISC_LADDER = [0.1, 0.3, 0.47, 0.7, 1.5];

export function stabilityDefaults(hyp) {
    const h = { mode: "response", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.visc = Math.min(10, Math.max(0.01, num(c.visc, DEF.visc)));
    c.c = Math.min(60, Math.max(2, num(c.c, DEF.c)));
    c.T = Math.min(4, Math.max(0.25, num(c.T, DEF.T)));       // each unit of T is 1000 steps at the default dt
    c.dt = Math.min(1 / 200, Math.max(1e-4, num(c.dt, DEF.dt)));
    h.config = c;
    if (!STABILITY_MODES.includes(h.mode)) h.mode = "response";
    return h;
}

export async function buildStability(hyp, base = {}) {
    const h = stabilityDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    // *** THE PLANT: "deafknob" HANDS EVERY RUN THE SHIPPED VISCOSITY WHATEVER THE CALLER ASKED FOR -- a knob
    // that reaches the caller's API and NOT the solver. This tree's most repeated UI shape ("a control that
    // does nothing") in a physics setting: nothing throws, every run completes, every number is finite, and
    // the ONLY tell is that the answer stops depending on the input. ***
    const viscOf = (v) => (h.mode === "deafknob" ? 0.1 : v);
    const out = { viscosity: c.visc, horizon: c.T };

    if (h.mode === "horizon") {
        // The module's own finding, re-derived: does the verdict hold when the run gets longer?
        out.ratioShort = energyRatio({ visc: viscOf(c.visc), c: c.c, T: 1.0, dt: c.dt });
        out.ratioLong = energyRatio({ visc: viscOf(c.visc), c: c.c, T: 2.0, dt: c.dt });
        out.horizonDrift = Math.abs(out.ratioLong - out.ratioShort) / Math.max(out.ratioShort, 1e-12);
        out.driftsWithHorizon = out.horizonDrift > 0.2;
        return out;
    }

    if (h.mode === "direction") {
        // *** THE LAW, AS AN INEQUALITY. No tolerance: a ratio above 1 is energy that came from nowhere. ***
        out.ratio = energyRatio({ visc: viscOf(c.visc), c: c.c, T: c.T, dt: c.dt });
        out.createsEnergy = !(out.ratio <= 1);
        return out;
    }

    // "response" and "deafknob": the ratio must FALL as viscosity RISES. More damping, less energy left.
    const rows = VISC_LADDER.map((v) => ({ visc: v, ratio: energyRatio({ visc: viscOf(v), c: c.c, T: c.T, dt: c.dt }) }));
    out.ratioLadder = rows;
    out.ratio = rows.find((r) => r.visc === c.visc) ? rows.find((r) => r.visc === c.visc).ratio : rows[0].ratio;
    out.monotoneInViscosity = rows.every((r, i) => i === 0 || r.ratio <= rows[i - 1].ratio + 1e-9);
    out.spanAcrossViscosity = rows[0].ratio / rows[rows.length - 1].ratio;
    // *** A BINARY, AND IT IS THE ONE THE PLANT BREAKS: does the answer depend on the knob at all? ***
    out.respondsToViscosity = out.spanAcrossViscosity > 2;
    return out;
}

export const stabilityDevice = {
    modes: STABILITY_MODES,
    // "response" is FIRST so the mode-plant contract compares the plant against the mode that owns the ladder.
    plantMode: "deafknob", plantFlips: "spanAcrossViscosity", plantKind: "mode",
    plantNull: 1, plantNullWhy:
        "spanAcrossViscosity is the RATIO of response across the swept viscosity, so a knob that does nothing gives exactly 1 -- the null, not an ideal. A responsive knob is merely FAR from 1 (7.90 here) with no particular target, which is why this declares the value the plant COLLAPSES ONTO rather than one it moves away from",
    name: "sph-energy-stability", observables: STABILITY_OBSERVABLES,
    build: buildStability, defaults: stabilityDefaults,
};
