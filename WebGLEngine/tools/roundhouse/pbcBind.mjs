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
// *** v3845 -- THE PLANT WAS HERE ALL ALONG AND THE CENSUS COULD NOT SEE IT. *** This device has computed
// wrapWRONG since v3301 and reported it as `plantedForceDiff`, and plantedCoverage HAS LISTED pbc AS UNCOVERED
// FOR FIVE HUNDRED VERSIONS. The reason is one word boundary: readsPlantedKnob tests /\bplanted\b/ against the
// bind's code, and `plantedForceDiff` does not match it -- the identifier continues into `F`, so the \b fails.
// A REAL, LIVE, MEASURED PLANT WAS INVISIBLE TO THE CENSUS BUILT TO FIND PLANTS, and every reader of that
// report has been told to go and write one.
//
// *** THIS IS "REACHABLE AND FINDABLE ARE TWO DIFFERENT EDITS" (v3766) IN ITS PUREST FORM YET -- the previous
// instances hid a device behind a dynamic import or left a mode off a list, and this one hides a plant behind
// a CAPITAL LETTER. *** The fix is not to rename the observable into matching a regex, which would be writing
// code to satisfy a scanner; it is to declare the plant the way the census actually adjudicates plants -- as a
// MODE whose named observable must flip, verified by building both arms. The plant did not change. What
// changed is that the tree can now be asked about it.
//
// MEASURED, the two arms: worstForceDiff 2.331e-15 -> 1.0489, A SEPARATION OF 4.5e14 -- and the plant's value
// is the size of the forces themselves (max |force| 0.9934). THE PLANT IS THE SIZE OF THE ANSWER, which is
// what the header below has said since v3301 -- now on the record in a form the census reads.
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
    // *** THE VALIDATOR MUST LIST THE PLANT MODE, or the plant silently reverts and both arms read an
    // IDENTICAL number -- v3806 lost a round to exactly that on flip2d. Anything unrecognised is the honest
    // mode, and `wrapwrong` is recognised. ***
    if (!PBC_MODES.includes(mode)) mode = "agreement";
    const c = { ...DEF, ...config };
    const f = jitteredFluid(c);
    const box = makeBox({ L: c.L, cutoff: c.cutoff });

    // THE PLANT SITS ON THE ROUTE UNDER TEST, NOT ON THE ANSWER KEY. `agreement` grades minimum-image against
    // the explicit image shell; `wrapwrong` grades the SAME shell against a minimum-image step that never
    // applies the minimum-image displacement, so the wrong pairs interact entirely. The key does not move.
    const pbc = mode === "wrapwrong"
        ? wrapWRONG(f.pos, f.N, 1, 1, box)
        : computeForcesPBC(f.pos, f.N, 1, 1, box);
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

export const PBC_MODES = ["agreement", "wrapwrong"];

export const pbcDevice = {
    // "agreement" stays FIRST so the mode-plant contract compares the plant against the mode that owns the key.
    modes: PBC_MODES,
    plantMode: "wrapwrong", plantFlips: "worstForceDiff", plantKind: "mode",
    name: "periodic-minimum-image", observables: PBC_OBSERVABLES, build: buildPbc,
    defaults: ({ mode } = {}) => ({ mode: PBC_MODES.includes(mode) ? mode : "agreement", config: { ...DEF } }),
};

export { makeBox };
