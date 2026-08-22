// physics/xpbd/muscleKey.mjs
//
// v3463 -- A MUSCLE BULGES BECAUSE IT CANNOT COMPRESS, AND THE MODULE SHIPS ITS OWN CONTROL.
//
// muscleVolume.js composes two constraints: a volume constraint on a closed mesh and a contraction that shortens
// flagged fibres. Its header says the belly bulges "because the volume constraint will not let the enclosed
// volume shrink". That is testable, and unusually the module provides the counterfactual itself -- opts.useVolume
// switches the volume constraint off, so the A and the B are both first-class rather than one being planted.
//
//     useVolume   volume/rest   length ratio   girth ratio
//     true        1.00000       0.6447         1.3671
//     false       0.52008       0.6139         1.1102
//
// With the constraint the volume is held to five decimals while the belly shortens 36% and thickens 37%.
// Without it the volume nearly HALVES and the girth barely moves -- the fibres just pull the mesh in.
//
// *** THE GIRTH RELATION IS APPROXIMATE AND IS LABELLED SO. *** For an incompressible ellipsoid of revolution,
// V = 4/3 pi a^2 c, so conserving V gives a proportional to 1/sqrt(c): a length ratio of 0.6447 predicts a girth
// ratio of 1.2455 against 1.3671 measured, 10% high. The belly does not stay an ellipsoid -- it barrels, putting
// more material at the waist than the ellipsoid model allows. Volume conservation is the EXACT key here; the
// girth law is a shape-dependent consequence and grading it tightly would be grading the mesh, not the physics.
//
// ARGUMENT SHAPES, CHECKED BEFORE MEASURING: buildMuscleBelly returns { pos, tris, n, edges } and NO batches --
// they come from colorConstraints. bellyShape returns { length, girth }, not axial/transverse. Both were wrong
// in the first attempt and both threw immediately, which is the good case: a wrong shape that throws costs a
// minute, and one that silently returns a number costs a round.

import { buildMuscleBelly, contractMuscle, muscleVolumeSubstep, bellyShape, enclosedVolume } from "./muscleVolume.js";
import { colorConstraints } from "./xpbd.js";

/** Contract a muscle belly and report what happened to its volume and its shape. */
export function contractionRun({
    subdiv = 2, elongation = 2.2, contraction = 0.3, activation = 1.0,
    useVolume = true, steps = 300, dt = 1 / 120, iterations = 8,
} = {}) {
    const b = buildMuscleBelly(subdiv, elongation);
    const batches = colorConstraints(b.edges);
    const state = {
        pos: Float64Array.from(b.pos),
        vel: new Float64Array(b.pos.length),
        invMass: new Float64Array(b.n).fill(1),
    };
    const restVol = enclosedVolume(state.pos, b.tris);
    const before = bellyShape(state.pos, b.n);

    contractMuscle(b.edges, activation, contraction);
    const volSeries = [];
    for (let s = 0; s < steps; s++) {
        muscleVolumeSubstep(state, b.edges, batches, b.tris, restVol, { dt, iterations, useVolume, gravity: [0, 0, 0] });
        volSeries.push(enclosedVolume(state.pos, b.tris));
    }
    const after = bellyShape(state.pos, b.n);
    const vol = volSeries[volSeries.length - 1];
    return {
        restVol, vol, volRatio: vol / restVol,
        lengthRatio: after.length / before.length,
        girthRatio: after.girth / before.girth,
        volSeries,
        finite: Number.isFinite(vol) && volSeries.every((v) => Number.isFinite(v)),
    };
}

/** Ellipsoid prediction: conserving 4/3 pi a^2 c means a scales as 1/sqrt(c). Approximate -- the belly barrels. */
export const ellipsoidGirthRatio = (lengthRatio) => 1 / Math.sqrt(lengthRatio);

/** The A/B the module provides itself. */
export function volumeConstraintEffect(opts = {}) {
    const on = contractionRun({ ...opts, useVolume: true });
    const off = contractionRun({ ...opts, useVolume: false });
    return {
        on, off,
        volumeHeld: Math.abs(on.volRatio - 1),
        volumeLostWithout: 1 - off.volRatio,
        bulgeOn: on.girthRatio - 1,
        bulgeOff: off.girthRatio - 1,
        bulgeAmplification: (on.girthRatio - 1) / (off.girthRatio - 1),
    };
}
