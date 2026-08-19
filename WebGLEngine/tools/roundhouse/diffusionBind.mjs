// tools/roundhouse/diffusionBind.mjs
//
// v3293 -- SELF-DIFFUSION JOINS THE ROUNDHOUSE. Eighth promotion, and the first graded on an AGREEMENT key
// rather than a closed form.
//
// Every device promoted in this run so far grades a measurement against an analytic answer. This one has no
// analytic answer: there is no closed form for the self-diffusion coefficient of a Lennard-Jones fluid. What it
// has instead is TWO ROUTES THAT SHARE NO OBSERVABLE:
//
//   EINSTEIN     D = <|r(t) - r(0)|^2> / 6t          from POSITIONS, integrated over LONG times
//   GREEN-KUBO   D = (1/3) integral <v(0).v(t)> dt   from VELOCITIES, integrated over SHORT ones
//
// WHY THAT IS A REAL KEY AND NOT A SELF-COMPARISON: the equality is a THEOREM -- the MSD is the double time
// integral of the velocity autocorrelation -- so a disagreement is never "different physics" or "different
// regime", it is always a bug. And the two fail in OPPOSITE directions: Einstein is ruined by too short a
// trajectory, Green-Kubo by too coarse a timestep. A single error that fooled both would have to corrupt
// positions and velocities in exactly compensating ways.
//
// MEASURED: Einstein 0.8393, Green-Kubo 0.8603 -- 2.47% apart, which for MD transport coefficients from a
// 4-particle box is close agreement rather than a loose tolerance.
//
// THE PLANTED ERROR IS THE SHARPEST KIND FOR THIS SHAPE OF KEY. wrapMSD accumulates displacement WRAPPED into
// the periodic box -- the same wrapping the force calculation legitimately needs. Einstein collapses to 0.0771
// (a particle that teleports across the box every time it exits appears never to go anywhere) while Green-Kubo
// is COMPLETELY UNAFFECTED, because velocities do not wrap. Disagreement 2.47% -> 167%. One route breaks, the
// other does not, and the pair is what notices -- neither number alone looks obviously wrong.

import { diffusionPair } from "../../physics/md/diffusion.js";

export const DIFFUSION_OBSERVABLES = [
    "einsteinD", "greenKuboD", "disagreeFrac", "meanD", "steps", "dt", "N",
];

const DEF = { n: 4, L: 6.2, kT: 1.4, dt: 0.004, steps: 6000, seed: 17 };

function buildDiffusion({ mode = "pair", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const p = diffusionPair({
        n: c.n, L: c.L, kT: c.kT, dt: c.dt, steps: c.steps, seed: c.seed,
        ...(config.planted ? { wrapMSD: true } : {}),
    });
    const a = p.a.value, b = p.b.value, mean = (a + b) / 2;
    return {
        einsteinD: a, greenKuboD: b,
        disagreeFrac: Math.abs(a - b) / mean, meanD: mean,
        steps: p.detail.steps, dt: p.detail.dt, N: p.detail.N,
    };
}

export const diffusionDevice = {
    // v3400 -- READER PLANT: the dynamics run IDENTICALLY and only the MEASUREMENT is corrupted (the MSD is
    // accumulated from WRAPPED coordinates, so a particle that crosses the box reads as having come back). No
    // input to this simulation produces that failure, which is exactly pipe3d's case and why the kind exists.
    plantKind: "reader",
    modes: ["pair"],
    name: "self-diffusion-two-routes", observables: DIFFUSION_OBSERVABLES, build: buildDiffusion,
    defaults: ({ mode } = {}) => ({ mode: mode || "pair", config: { ...DEF } }),
};
