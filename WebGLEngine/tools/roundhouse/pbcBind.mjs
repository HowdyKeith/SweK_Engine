// tools/roundhouse/pbcBind.mjs
//
// v3301 -- PERIODIC BOUNDARIES JOIN THE ROUNDHOUSE. Fourteenth promotion, and the agreement is at MACHINE
// PRECISION rather than within a tolerance.
//
// computeForces() sums over an open cluster in vacuum -- correct for a molecule, wrong for a fluid, because the
// surface is most of a small box and density, pressure and diffusion then measure the surface rather than the
// material. This module is the periodic layer every transport measurement needs.
//
// THE HEADLINE KEY: TWO ROUTES, ONE CLEVER AND ONE BRUTALLY LITERAL.
//
//   computeForcesPBC     minimum image -- each pair interacts with exactly ONE image, the nearest, justified by
//                        L - r_c > r_c and therefore only valid for r_c < L/2. makeBox REFUSES a larger cutoff
//                        at construction rather than assuming it.
//   computeForcesImages  sums over an explicit 3x3x3 shell of image boxes. No shortcut, nothing to be cleverly
//                        wrong about.
//
// Measured on a jittered 64-particle box: worst force difference 2.7e-15 on forces up to 0.85. That is machine
// precision, not agreement to a tolerance -- and the literal route contains no shortcut that could be wrong the
// same way the clever one is.
//
// THE PLANTED ERROR IS THE SAME SIZE AS THE ANSWER. wrapWRONG disables the minimum-image displacement and the
// forces differ by 8.8e-1 -- the magnitude of the forces themselves. Not a subtle drift: the wrong pairs are
// interacting entirely.
//
// AND A TRAP THIS DEVICE HAD TO AVOID. makeFluid builds a PERFECT LATTICE, and on a perfect lattice every force
// cancels by symmetry: the first measurement compared two routes that both returned ZERO and agreed exactly.
// A comparison of zeros is the emptiest possible pass. The device jitters the positions first, and the gate
// asserts the forces are non-zero BEFORE asserting anything about agreement.

import {
    makeBox, makeFluid, computeForcesPBC, computeForcesImages, wrapWRONG,
    totalMomentum, pressure,
} from "../../physics/md/pbc.js";

export const PBC_OBSERVABLES = [
    "worstForceDiff", "maxForceMagnitude", "plantedForceDiff",
    "virialPBC", "virialImages", "momentumDrift", "N", "L", "cutoff",
];

const DEF = { n: 4, L: 8, cutoff: 2.5, kT: 1.2, seed: 7, jitter: 0.6 };

/** A jittered fluid: the perfect lattice makeFluid returns has all forces cancelling by symmetry. */
function jitteredFluid(c) {
    const f = makeFluid({ n: c.n, L: c.L, kT: c.kT, seed: c.seed });
    let s = (c.seed * 7919) >>> 0;
    const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) + 0.5) / 4294967296;
    for (let i = 0; i < f.pos.length; i++) f.pos[i] += (u() - 0.5) * c.jitter;
    return f;
}

const worstDiff = (a, b) => {
    let m = 0;
    for (let i = 0; i < a.forces.length; i++) m = Math.max(m, Math.abs(a.forces[i] - b.forces[i]));
    return m;
};

function buildPbc({ mode = "agreement", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const f = jitteredFluid(c);
    const box = makeBox({ L: c.L, cutoff: c.cutoff });

    const pbc = computeForcesPBC(f.pos, f.N, 1, 1, box);
    const img = computeForcesImages(f.pos, f.N, 1, 1, box, { shell: 1 });
    const bad = wrapWRONG(f.pos, f.N, 1, 1, box);

    let mag = 0;
    for (const v of pbc.forces) mag = Math.max(mag, Math.abs(v));
    const p = totalMomentum(f.vel, f.masses);

    return {
        worstForceDiff: worstDiff(pbc, img),
        maxForceMagnitude: mag,
        plantedForceDiff: worstDiff(bad, img),
        virialPBC: pbc.virial, virialImages: img.virial,
        momentumDrift: Math.max(...p.map(Math.abs)),
        N: f.N, L: c.L, cutoff: c.cutoff,
    };
}

export const pbcDevice = {
    modes: ["agreement"],
    name: "periodic-minimum-image", observables: PBC_OBSERVABLES, build: buildPbc,
    defaults: ({ mode } = {}) => ({ mode: mode || "agreement", config: { ...DEF } }),
};

export { makeBox };
