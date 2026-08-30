// tools/roundhouse/pipe3dBind.mjs
//
// v2817 -- roundhouse device: the 3D PIPE (simulation/lbm/lbm3d.js), and the reason it matters is not novelty.
//
// THE 3D SOLVER HAD NO SELFCHECK AT ALL. Every other simulation in this tree is graded; lbm3d.js was carrying a
// D3Q19 collision and streaming with nothing checking it, which is exactly the kind of thing that drifts quietly
// because nobody looks. Wiring it as a device gives it its first answer key.
//
// AND THE ANSWER KEY IS OLDER THAN THE ENGINE. Drive a fluid down a circular pipe and the steady profile is
// Hagen-Poiseuille: u(r) = F (R^2 - r^2) / (4 nu), a paraboloid, exact since 1840 and written nowhere in the
// solver. The centreline speed F R^2 / (4 nu) and the profile SHAPE are two independent things to be wrong
// about, so both are measured: centrelineErrFrac against the closed form, and profileRms against the whole
// parabola sampled across the diameter.
//
// Modes:
//   "profile" -- steady pipe flow. Observables: measured vs theoretical centreline speed, profile rms, the
//                measured viscosity implied by the profile, and mass drift.
//   "noslip"  -- the same pipe, reporting the speed AT the wall, which halfway bounce-back must hold at zero.
//                A solver that leaks through its walls fails here while still looking parabolic in the middle.

import { makeLBM3D, viscosityOf3 } from "../../simulation/lbm/lbm3d.js";

export const PIPE_OBSERVABLES = [
    "centrelineMeasured", "centrelineTheory", "centrelineErrFrac",
    "profileRms", "nuImplied", "nuTheory", "nuErrFrac",
    "wallSpeed", "massDrift", "steps", "radius",
    "flowMeasured", "flowTheory", "flowErrFrac", "profileCells", "planted",
];

const DEF = { nx: 6, ny: 25, nz: 25, tau: 0.8, F: 1e-5, steps: 3000 };

export function pipeDefaults(hyp) {
    const h = { mode: "profile", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // 3D is nx*ny*nz*19 doubles per buffer -- bounded hard so a proposal cannot exhaust memory or time
    c.nx = Math.min(16, Math.max(4, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(41, Math.max(11, num(c.ny, DEF.ny) | 0));
    c.nz = Math.min(41, Math.max(11, num(c.nz, DEF.nz) | 0));
    c.tau = Math.min(2, Math.max(0.55, num(c.tau, DEF.tau)));
    c.F = Math.min(1e-3, Math.max(1e-7, num(c.F, DEF.F)));
    c.steps = Math.min(20000, Math.max(200, num(c.steps, DEF.steps) | 0));
    h.config = c;
    if (!["profile", "noslip"].includes(h.mode)) h.mode = "profile";
    return h;
}

export async function buildPipe(hyp, base = {}) {
    const h = pipeDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const cy = (c.ny - 1) / 2, cz = (c.nz - 1) / 2;
    const R = Math.min(cy, cz) - 1;                       // one cell of solid margin all round
    const inPipe = (x, y, z) => ((y - cy) ** 2 + (z - cz) ** 2) <= R * R;

    const sim = makeLBM3D({
        nx: c.nx, ny: c.ny, nz: c.nz, tau: c.tau, force: [c.F, 0, 0],
        solidAt: (x, y, z) => !inPipe(x, y, z),           // everything outside the pipe is wall
    });
    const m0 = sim.mass();
    for (let t = 0; t < c.steps; t++) sim.step();
    const m1 = sim.mass();
    if (!isFinite(m1) || m1 <= 0) return { error: "simulation-diverged (raise tau or lower the drive)" };

    const nu = viscosityOf3(c.tau);
    const xs = Math.floor(c.nx / 2);
    const at = (y, z) => sim.ux[sim.idx(xs, y, z)];

    // centreline: the closed form is F R^2 / (4 nu)
    const centrelineMeasured = at(Math.round(cy), Math.round(cz));
    const centrelineTheory = c.F * R * R / (4 * nu);

    // v3393 -- *** THE PLANT HERE IS A READER PLANT, NOT A KNOB PLANT, AND THE DIFFERENCE IS DECLARED RATHER
    // THAN BLURRED. *** Every plant before this one perturbs a physics knob and lets the whole path from knob
    // to observable be graded, which is plantedError.mjs's second design rule. This one CANNOT: the failure it
    // reproduces is "the solver got the peak right and the shape wrong", and no input to an LBM produces that.
    // So it substitutes the READ -- every cell returns the MEASURED centreline speed, a PLUG PROFILE -- while
    // the simulation, the theory and the comparator are all untouched.
    //
    // THE MEASURED CENTRELINE IS USED, NOT THE THEORETICAL ONE, SO THE BLIND KEY DOES NOT MOVE BY ONE ULP.
    // Planting the theory value would have made centrelineErrFrac exactly zero, which LOOKS like blindness and
    // is actually a different (better-scoring) run. Bit-identical is the claim worth making.
    const read = c.planted ? ((y, z) => (inPipe(0, y, z) ? centrelineMeasured : 0)) : at;

    // profile across the diameter in z, compared to the whole paraboloid
    let se = 0, sref = 0, n = 0, wallMax = 0;
    for (let z = 0; z < c.nz; z++) {
        const y = Math.round(cy);
        const r2 = (z - cz) ** 2;
        if (r2 <= R * R) {
            const theory = c.F * (R * R - r2) / (4 * nu);
            const meas = read(y, z);
            se += (meas - theory) ** 2; sref += theory * theory; n++;
        } else if (Math.abs(z - cz) <= R + 1.5) {
            wallMax = Math.max(wallMax, Math.abs(read(y, z)));   // just outside: must be held at zero
        }
    }

    // v3091 -- A SECOND ANSWER KEY THAT CAN DISAGREE WITH THE FIRST.
    //
    // nuImplied looked like an independent check and is not one. It inverts the SAME closed form the centreline
    // is graded against -- nuImplied = F R^2 / (4 u_m) against centrelineTheory = F R^2 / (4 nu) -- so writing
    // x = u_m / u_theory gives nuImplied/nu = 1/x and nuErrFrac = |1-x|/x. That is centrelineErrFrac restated:
    // measured at e/(1-e) to within 3e-15 across five configurations including a viscosity change. ONE
    // MEASUREMENT, REPORTED TWICE, and the second copy cannot fail while the first passes.
    //
    // THE VOLUMETRIC FLOW RATE IS A DIFFERENT QUESTION ABOUT THE SAME FIELD. Q = integral of u over the cross
    // section, closed form pi F R^4 / (8 nu), and the reason it is independent is WHERE IT LOOKS: the centreline
    // check samples one cell at r = 0 and is completely blind at the wall, while Q's integrand u(r) * 2 pi r
    // VANISHES at r = 0 and peaks near r = R/sqrt(2). A profile with the correct peak and the wrong shape passes
    // the centreline check and fails this one. That is the whole point of a second key, and it is why profileRms
    // is not a substitute either -- an unweighted RMS residual is a goodness-of-fit number, not a physical
    // quantity with its own analytic value that an engineer would care about independently.
    //
    // Summed over the FULL 2D cross section, not the diameter line: a 1D scan cannot see an asymmetry between
    // the y and z axes, and this lattice has separate ny and nz.
    let qMeas = 0, cells = 0;
    for (let y = 0; y < c.ny; y++) {
        for (let z = 0; z < c.nz; z++) {
            if ((y - cy) ** 2 + (z - cz) ** 2 <= R * R) { qMeas += read(y, z); cells++; }
        }
    }
    const flowTheory = Math.PI * c.F * R * R * R * R / (8 * nu);
    const out = {
        centrelineMeasured, centrelineTheory,
        centrelineErrFrac: centrelineTheory > 0 ? Math.abs(centrelineMeasured - centrelineTheory) / centrelineTheory : undefined,
        profileRms: n > 0 && sref > 0 ? Math.sqrt(se / n) / Math.sqrt(sref / n) : undefined,
        nuTheory: nu,
        // invert the closed form: the profile implies a viscosity, which must match the one tau sets
        nuImplied: centrelineMeasured > 0 ? c.F * R * R / (4 * centrelineMeasured) : undefined,
        massDrift: m0 > 0 ? Math.abs(m1 - m0) / m0 : undefined,
        radius: R, steps: c.steps,
        // dA = 1 in lattice units, so the sum IS the integral
        flowMeasured: qMeas, flowTheory, profileCells: cells, planted: !!c.planted,
        flowErrFrac: flowTheory > 0 ? Math.abs(qMeas - flowTheory) / flowTheory : undefined,
    };
    if (out.nuImplied != null) out.nuErrFrac = Math.abs(out.nuImplied - nu) / nu;
    if (h.mode === "noslip") out.wallSpeed = wallMax;
    return out;
}

export const pipeDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    // v3393 -- DECLARED, because no census can DERIVE it: from outside, a knob plant and a reader plant look
    // identical (a config key goes in, numbers change). The distinction is about WHERE the perturbation enters,
    // and only the author of the plant knows. THE TWO ARE NEVER SUMMED INTO ONE COVERAGE NUMBER.
    plantKind: "reader",
    // v4096 -- NAMED, THE SAME COMPLETION v3851/v4088-v4095 gave the rest of this family. MEASURED, profile
    // mode both arms: centrelineErrFrac bit-identical at 0.0269 (the blind key, deliberately -- see the comment
    // above), profileRms 0.0454 -> 0.655, flowErrFrac 0.0498 -> 0.930. flowErrFrac is the sharper signal and
    // the one the file's own comment argues is independent of the centreline check by construction (it looks
    // where the centreline check is blind), so it is the declared target.
    planted: { knob: "planted", observable: "flowErrFrac",
               note: "every cell reads the measured centreline speed (a plug profile) instead of its own value -- the peak is right, the shape is gone, and flowTheory's integral over the cross section catches what a single-point centreline check cannot" },
    modes: ["profile", "noslip"], name: "hagen-poiseuille-pipe-3d", observables: PIPE_OBSERVABLES, build: buildPipe, defaults: pipeDefaults };
