// tools/roundhouse/stabilityBind.mjs -- v3783
//
// *** TIER 2. physics/sph/stability.mjs was ungraded, and its key is A DIRECTION RATHER THAN A VALUE:
// A CLOSED SYSTEM WITH NO ENERGY INPUT CANNOT GAIN MECHANICAL ENERGY. Gravity converts PE to KE and viscosity
// dissipates; nothing puts any back. So energyRatio -- final (KE+PE) over initial -- MUST NOT EXCEED 1, and
// anything above it is the solver INVENTING energy. That is a physical law the code is never told, and it is
// an INEQUALITY, so there is no tolerance to argue about. ***
//
// *** THE SHIPPED VISCOSITY FAILS IT, AND THAT IS NOT NEWS -- IT IS WHY viscosityThreshold EXISTS. What the
// device adds is that the numbers are RE-DERIVED EVERY RUN instead of sitting in MEASURED_V3542 as readings
// somebody once took -- which is exactly why this paragraph had to be re-measured at v4194. ***
//
// MEASURED at c=15, dt=1e-3, T=1 / T=2, WITH THE v3783 READING BESIDE IT:
//     visc 0.1    2.6897 / 4.1595     (was 2.7340 / 4.3305)   grows with T, as before
//     visc 0.3    1.2557 / 1.5962     (was 1.5497 / 1.5078)   *** DIRECTION REVERSED: it shrank, now it grows
//     visc 0.47   0.9194 / 0.9107     (was 0.7755 / 0.8182)   nearly flat, and flatter than before
//     visc 0.7    0.6385 / 0.6478     (was 0.6916 / 0.6094)   *** DIRECTION REVERSED: it shrank, now it grows
//     visc 1.5    0.3662 / 0.2282     (was 0.3461 / 0.2511)   shrinks with T, as before
// The cause is not this file: v4193 traced every moved SPH value in the lab to f350286's direct-indexed spatial
// grid and 1efe978's pinned equation of state. THE OLD NUMBERS ARE KEPT BESIDE THE NEW ONES rather than
// overwritten, because two of the five REVERSED and a bare refresh would have hidden that.
//
// *** AND THE MARGIN AT THE DEFAULT VISCOSITY HAS SHRUNK BY MOST OF WHAT IT HAD. *** The law is E(T)/E(0) <= 1
// and 0.47 is the device's default: it read 0.7755, 22.4% clear of the bound, and now reads 0.9194, 8.1% clear.
// Nothing is violated and no gate is red. IT IS RECORDED BECAUSE THE DIRECTION IS TOWARDS THE BOUND and the
// quantity is one this device exists to watch -- the same shape as plastic's budget sitting at 0.93 of 1.
//
// *** AND THE MODULE'S OWN SHARPEST FINDING IS REPORTED RATHER THAN GRADED: THE THRESHOLD DOES NOT SURVIVE
// REFINING THE HORIZON. At visc 0.1 the ratio GROWS with T (2.6897 -> 4.1595) while at 0.47 it is nearly flat
// (0.9194 -> 0.9107). A THRESHOLD THAT MOVES WITH RUN LENGTH IS NOT A CONSTANT OF THE SOLVER, so this device
// grades the DIRECTION and the RESPONSE, and leaves the threshold's numeric value to the module that already
// records how it drifts. THE CROSSING SURVIVES: 0.47 reads 1.0931 at T=4 (recorded 1.0631), still above 1. ***

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
