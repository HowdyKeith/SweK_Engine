// tools/roundhouse/thermalBind.mjs
//
// v2817 -- roundhouse device: THERMAL CONVECTION (simulation/lbm/thermal2d.js). Two answer keys in one lab, which
// is why it was the strongest remaining candidate.
//
//   1. AN EMERGENT CONSTANT. Thermal diffusivity alpha = c_s^2 (tau_g - 1/2) is never written into the collision;
//      it falls out of the relaxation the same way viscosity did for the momentum field. Mode "diffuse" plants a
//      hot spot in a still fluid and MEASURES alpha from how the spot spreads -- the second moment of a diffusing
//      Gaussian grows as <r^2> = 4 alpha t in 2D -- then reports the fractional error against the theoretical
//      value. Nothing in the measurement consults tau_g.
//
//   2. A BIFURCATION WITH A KNOWN THRESHOLD. Rayleigh-Benard convection does NOTHING until the Rayleigh number
//      crosses a critical value: below it heat merely conducts, above it the layer overturns into rolls. That is
//      the same SHAPE as the shedding-onset device -- a threshold the loop can hunt and the physics can refuse --
//      and mode "convect" measures whether the layer is actually moving (peak speed, kinetic energy) at a chosen
//      Rayleigh number, so a claim about onset is settled by the flow rather than by the number fed in.
//
// SCOPE, stated: Boussinesq -- density is constant except in the buoyancy term. No compressible thermodynamics,
// no pressure work. The classical critical Rayleigh number assumes idealised boundaries and an infinite layer;
// a small periodic box with these walls will not reproduce it exactly, so the OBSERVABLE here is the measured
// motion, and any claim about a specific critical value is the caller's to make and the sim's to refuse.

import { makeThermal, diffusivityOf } from "../../simulation/lbm/thermal2d.js";

export const THERMAL_OBSERVABLES = [
    "alphaMeasured", "alphaTheory", "alphaErrFrac",
    "peakSpeed", "kineticEnergy", "convecting", "convectingIsThreshold", "rayleigh",
    "tempRange", "massDrift", "steps",
    "raCritMeasured", "raCritExact", "raCritErrFrac", "raSweep", "onsetAmplitudes",
];

// The diffuse mode needs a domain big enough that the hot spot never reaches a wall inside the measurement
// window, and walls held at ZERO temperature so they inject nothing. The first version used the default
// Thot=+0.5 / Tcold=-0.5, which makes the walls a heat SOURCE -- the spot then never spreads freely and the
// measured alpha came out 77-96% low. Free diffusion has to actually be free.
const DEF = { nx: 96, ny: 96, tau: 0.8, tauG: 0.8, steps: 360, gravity: 0, beta: 0 };

export function thermalDefaults(hyp) {
    const h = { mode: "diffuse", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.nx = Math.min(160, Math.max(24, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(160, Math.max(12, num(c.ny, DEF.ny) | 0));
    // tau below 0.51 is unstable; above 2 the sim is treacle and measures nothing in the step budget
    c.tau = Math.min(2, Math.max(0.51, num(c.tau, DEF.tau)));
    c.tauG = Math.min(2, Math.max(0.51, num(c.tauG, DEF.tauG)));
    c.steps = Math.min(20000, Math.max(100, num(c.steps, DEF.steps) | 0));
    c.gravity = Math.min(1e-2, Math.max(0, num(c.gravity, DEF.gravity)));
    c.beta = Math.min(10, Math.max(0, num(c.beta, DEF.beta)));
    h.config = c;
    // v3145 -- "rayleigh" JOINS THE DECLARED LIST. It was refused here, by the very clamp v3144 taught
    // checkMode to read: defaults() replaced it with "diffuse" and the new branch below never ran. My own
    // guard, working on me one round after I shipped it -- which is the cheapest possible way to find that a
    // new mode needs declaring.
    if (!["diffuse", "convect", "rayleigh"].includes(h.mode)) h.mode = "diffuse";
    return h;
}

// second moment of the temperature field about its centroid -- the number that grows as 4 alpha t
function secondMoment(sim) {
    let tot = 0, cx = 0, cy = 0;
    for (let y = 1; y < sim.ny - 1; y++) for (let x = 0; x < sim.nx; x++) {
        const w = Math.max(0, sim.T[sim.idx(x, y)]);
        tot += w; cx += w * x; cy += w * y;
    }
    if (tot <= 0) return null;
    cx /= tot; cy /= tot;
    let m2 = 0;
    for (let y = 1; y < sim.ny - 1; y++) for (let x = 0; x < sim.nx; x++) {
        const w = Math.max(0, sim.T[sim.idx(x, y)]);
        m2 += w * ((x - cx) ** 2 + (y - cy) ** 2);
    }
    return m2 / tot;
}

export async function buildThermal(hyp, base = {}) {
    const h = thermalDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "diffuse") {
        // a hot spot in still fluid, no gravity: pure diffusion, so alpha is the only thing acting
        const cx = c.nx / 2, cy = c.ny / 2;
        const sim = makeThermal({
            nx: c.nx, ny: c.ny, tau: c.tau, tauG: c.tauG, gravity: 0, beta: 0,
            Thot: 0, Tcold: 0,                                   // walls inject nothing: this must be FREE diffusion
            init: (x, y) => ({ T: Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2)) / (2 * 4 * 4)) }),
        });
        const warm = Math.max(40, Math.floor(c.steps * 0.15));   // let the lattice settle before timing the spread
        for (let t = 0; t < warm; t++) sim.step();
        const m0 = secondMoment(sim);
        const t0 = warm;
        for (let t = warm; t < c.steps; t++) sim.step();
        const m1 = secondMoment(sim);
        if (m0 == null || m1 == null || !(m1 > m0)) return { error: "diffusion-not-measurable (spot vanished or did not spread)" };
        // <r^2> = 4 alpha t in 2D -> alpha = d<r^2>/dt / 4
        const alphaMeasured = (m1 - m0) / (4 * (c.steps - t0));
        const alphaTheory = diffusivityOf(c.tauG);
        let mn = Infinity, mx = -Infinity;
        for (let k = 0; k < c.nx * c.ny; k++) { const v = sim.T[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
        return {
            alphaMeasured, alphaTheory,
            alphaErrFrac: alphaTheory > 0 ? Math.abs(alphaMeasured - alphaTheory) / alphaTheory : undefined,
            tempRange: mx - mn, steps: c.steps,
        };
    }

    // convect: heated from below, buoyancy on. Measure whether the layer is actually MOVING.
    if (h.mode === "rayleigh") {
        // v3145 -- THE ACTUAL BIFURCATION. Everything needed was already in thermal2d.js: heated floor and
        // cooled ceiling (Tw = y === 0 ? Thot : Tcold), Guo forcing, the buoyancy coupling, AND the Rayleigh
        // number itself -- computed at line ~100 and NEVER REPORTED by this bind. Fourth time this session a
        // measurement existed and nothing reached for it.
        //
        // *** WHAT WAS MISSING WAS A SEED, AND THAT EXISTED TOO. *** The base state is perfectly symmetric and
        // the solver is deterministic, so ux stays EXACTLY zero forever and the instability has nothing to grow
        // from. That is why v3105 measured "peak is LINEAR in gravity" and found no bifurcation: convection
        // could not start at any Ra. opts.init(x,y) has always accepted a perturbed field; nothing passed one.
        //
        // THE ORDER PARAMETER IS THE SATURATED AMPLITUDE, and the key needs no closed form of ours: a
        // SUPERCRITICAL PITCHFORK satisfies A^2 ~ (Ra - Ra_c), so a straight line through A^2 against Ra hits
        // zero AT Ra_c. Nothing is thresholded and no critical value is typed -- it is READ OFF THE FIT.
        const RA_CRIT_EXACT = 1707.762;    // Chandrasekhar, rigid-rigid. EXTERNAL -- not a rearrangement of ours.
        const ny = c.ny, nx = c.nx;
        const pts = [];
        for (const gravity of (Array.isArray(h.gravities) && h.gravities.length >= 3 ? h.gravities : [7.5e-4, 8.5e-4, 9.5e-4, 1.05e-3])) {
            const sim = makeThermal({
                nx, ny, tau: c.tau, tauG: c.tauG, gravity, beta: 1, Thot: 0.5, Tcold: -0.5,
                // A linear conduction profile PLUS one sinusoidal roll -- the mode linear theory says goes
                // unstable first. Seeding noise instead would make the answer depend on the noise.
                init: (x, y) => ({ T: 0.5 - y / (ny - 1) + 0.02 * Math.sin(2 * Math.PI * x / nx) * Math.sin(Math.PI * y / (ny - 1)), ux: 0, uy: 0 }),
            });
            for (let i = 0; i < c.steps; i++) sim.step();
            let umax = 0;
            for (let k = 0; k < nx * ny; k++) umax = Math.max(umax, Math.hypot(sim.ux[k], sim.uy[k]));
            pts.push({ Ra: sim.Ra, A2: umax * umax, amp: umax });
        }
        const n = pts.length;
        const sx = pts.reduce((a, q) => a + q.Ra, 0), sy = pts.reduce((a, q) => a + q.A2, 0);
        const sxx = pts.reduce((a, q) => a + q.Ra * q.Ra, 0), sxy = pts.reduce((a, q) => a + q.Ra * q.A2, 0);
        const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        // A NON-POSITIVE SLOPE MEANS THE AMPLITUDE IS NOT GROWING WITH Ra, so there is no pitchfork to read a
        // critical value from. Returning a number anyway would be an intercept of a line through noise.
        const raCritMeasured = slope > 0 ? -((sy - slope * sx) / n) / slope : null;
        return {
            raCritMeasured, raCritExact: RA_CRIT_EXACT,
            raCritErrFrac: raCritMeasured == null ? null : Math.abs(raCritMeasured - RA_CRIT_EXACT) / RA_CRIT_EXACT,
            raSweep: pts.map((q) => Math.round(q.Ra)),
            onsetAmplitudes: pts.map((q) => q.amp),
            steps: c.steps,
        };
    }

    const sim = makeThermal({
        nx: c.nx, ny: c.ny, tau: c.tau, tauG: c.tauG, gravity: c.gravity, beta: c.beta,
        Thot: 0.5, Tcold: -0.5,
        init: (x, y) => ({ T: 0.5 - (y / (c.ny - 1)) + 0.01 * Math.sin(2 * Math.PI * x / c.nx) }),
    });
    const m0 = sim.mass ? sim.mass() : 1;
    for (let t = 0; t < c.steps; t++) sim.step();
    const m1 = sim.mass ? sim.mass() : 1;
    let peak = 0, ke = 0, cells = 0;
    for (let y = 1; y < c.ny - 1; y++) for (let x = 0; x < c.nx; x++) {
        const k = sim.idx(x, y), s = Math.hypot(sim.ux[k], sim.uy[k]);
        if (!isFinite(s)) return { error: "simulation-diverged (lower gravity/beta or raise tau)" };
        if (s > peak) peak = s;
        ke += s * s; cells++;
    }
    const out = {
        peakSpeed: peak,
        kineticEnergy: cells ? ke / cells : 0,
        // v3105 -- THIS IS A FIXED CUTOFF ON A LINEAR RESPONSE, NOT A BIFURCATION, and the name oversells it.
        // MEASURED: peak speed is LINEAR in gravity across a 50x range -- peak/g spans 8.66 to 9.67, an 11.6%
        // spread -- so nothing crosses a threshold and organises. What `convecting` actually reports is
        // "g exceeded about 1.15e-5", which is a statement about the INPUT wearing the name of an emergent
        // phenomenon. Rayleigh-Benard onset needs heated-bottom / cooled-top walls this setup does not impose.
        // Kept under its existing name because consumers read it, and told the truth about here and in
        // tools/roundhouse/thermalScaling-selfcheck.mjs rather than quietly renamed.
        convecting: peak > 1e-4,
        convectingIsThreshold: true,
        massDrift: m0 > 0 ? Math.abs(m1 - m0) / m0 : undefined,
        steps: c.steps,
    };
    if (typeof sim.rayleigh === "function") out.rayleigh = sim.rayleigh();
    else if (typeof sim.rayleigh === "number") out.rayleigh = sim.rayleigh;
    return out;
}

export const thermalDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    // v3315 -- "convect" WAS ACCEPTED BY buildThermal AND ABSENT FROM THIS LIST, so the device could run it and
    // nothing could find it: every census, sweep and placement battery reads `modes`, so an undeclared mode is
    // invisible to all of them. thermalScaling's note said the device "does NOT have a graded bifurcation" and
    // that adding one was a change to the SIMULATION -- but the simulation was here, unlisted, along with the
    // observables that grade it (convecting, convectingIsThreshold, raCritMeasured). The missing piece was one
    // string in one array.
    modes: ["diffuse", "convect", "rayleigh"], name: "thermal-convection", observables: THERMAL_OBSERVABLES, build: buildThermal, defaults: thermalDefaults };
