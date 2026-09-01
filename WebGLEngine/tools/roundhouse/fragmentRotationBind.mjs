// tools/roundhouse/fragmentRotationBind.mjs
//
// FRACTURE FRAGMENTS AND THE INTERMEDIATE AXIS -- a three-file join that nothing in the roundhouse could reach.
// physics/voxel/fracture.js gives a FULL 3x3 inertia tensor per fragment, physics/quantum/rmt.js has the tree's
// one symmetric eigensolver, and physics/mechanics/freeRotation.mjs has Euler's equations. All three existed;
// until v3565 nothing had joined them, and the eigensolver had never been asked a question about a rigid body.
//
// *** THE LOAD-BEARING KEY IS THE ROTATED BOX, AND EVERYTHING ELSE RESTS ON IT. *** On a real fragment there is
// no independent answer to check against -- the tensor is whatever the break left. So: take an analytic DIAGONAL
// tensor, conjugate it by a KNOWN rotation to get a full tensor with products of inertia, diagonalise, and the
// eigenvalues must come back the ORIGINAL DIAGONAL. The answer is known before the eigensolver runs and the two
// routes share nothing -- one is a 3x3 matrix multiply, the other is tred2 + tql. Measured worst error 3.553e-15.
//
// *** THE PLANT IS THE LIMITATION THIS JOIN EXISTED TO REMOVE: assume the principal axes ARE the coordinate axes.
// *** Planted, the products of inertia are discarded before diagonalising -- which is exactly what v3562's
// instrument was stuck with, and exactly what a fracture fragment violates, since the break leaves its axes
// wherever it likes. Recovery error goes 3.553e-15 -> 1.090.
//
// AND BOTH STRUCTURAL FALSIFIERS ARE BLIND TO IT, WHICH IS THE WHOLE REASON THE ROTATED BOX IS GRADED.
// Discarding the off-diagonal terms leaves the DIAGONAL untouched, so:
//
//   TRACE INVARIANCE   tr(I) is the sum of the diagonal -- BIT-IDENTICAL under the plant, 15.000000000000 both.
//   THE TRIANGLE INEQUALITY   I1 <= I2 + I3 still holds: the planted spectrum 4.0897/4.4049/6.5053 is a
//                             perfectly valid body. It is just NOT THIS ONE.
//
// v4300 -- BOTH RE-RUN AND EXACT: honest 3.0000/5.0000/7.0000, planted 4.0897/4.4049/6.5053, trace
// 15.000000000000 in both arms. NEITHER IS IN THE FREEZE: the device emits rotatedBoxWorstErr (3.55e-15 ->
// 1.0897) and never the spectrum, and the freeze records the honest arm only -- so a PLANTED reading quoted in
// a header is unwatched twice over. That is the shape headerLadders.mjs looks for.
//
// A device carrying only the two structural checks would certify a fragment whose principal moments are wrong by
// 36% as a physically admissible rigid body -- which it is. That is the difference between "is a body" and "is
// THE body", and only a key with an independently known answer can tell them apart.
//
// THE CENSUS OBSERVABLES ARE REPORTED, NOT GRADED. fragmentCensus hands back principal moments already computed
// and never the raw tensor, so the planted reader cannot reach them and every census number is blind by
// construction. They are here to answer v3564's prose claim with a measurement -- does fracture actually generate
// intermediate-axis bodies -- and NOT as evidence about the plant. Saying so is the point: six of nine
// observables being bit-identical is only meaningful if it is clear WHICH of them could have moved.

import {
    tensorMatrix, principalMoments, rotationMatrix, conjugate, trace,
    isPhysicalSpectrum, fragmentCensus,
} from "../../physics/mechanics/fragmentRotation.mjs";

export const FRAGROT_OBSERVABLES = [
    "rotatedBoxWorstErr", "traceResidual", "spectrumPhysical",
    "censusTotal", "censusDistinct", "censusDegenerate",
    "censusWorstTraceResidual", "censusAllPhysical", "censusWorstSpread",
];

const DEF = { diag: [3, 5, 7], axis: [1, 2, 3], theta: 0.7, nx: 24, ny: 16, nz: 24, cell: 1, density: 1 };

// THE PLANT, in one place: the products of inertia are thrown away, so every tensor is read as though its
// principal axes were the coordinate axes.
const flatten = (I6) => [I6[0], I6[1], I6[2], 0, 0, 0];

function buildFragRot({ mode = "fragments", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const planted = !!config.planted;
    const read = (I6) => principalMoments(planted ? flatten(I6) : I6);

    // ---- the rotated box: the only place an independent answer exists -------------------------------------
    const known = [c.diag[0], c.diag[1], c.diag[2], 0, 0, 0];
    const full = conjugate(known, rotationMatrix(c.axis, c.theta));
    const recovered = read(full);
    const rotatedBoxWorstErr = Math.max(...recovered.map((x, i) => Math.abs(x - c.diag[i])));

    // ---- the two structural checks, on the same tensor ----------------------------------------------------
    const traceResidual = Math.abs(recovered.reduce((s, x) => s + x, 0) - trace(planted ? flatten(full) : full));
    const spectrumPhysical = isPhysicalSpectrum(recovered) ? 1 : 0;

    // ---- the census over real fragments -------------------------------------------------------------------
    const cen = fragmentCensus({ nx: c.nx, ny: c.ny, nz: c.nz, cell: c.cell, density: c.density });
    const rows = cen.rows || [];
    // *** THE CENSUS IS REPORTED, NOT GRADED THROUGH THE PLANT, AND THAT IS STATED RATHER THAN LEFT TO LOOK
    // OTHERWISE. *** fragmentCensus returns each fragment's principal moments already computed and does NOT hand
    // back the raw tensor, so there is nothing here to re-read through the planted route. A first draft mapped
    // rows through `read()` anyway; with no I6 on a row that silently fell back to the module's own answer -- a
    // line that LOOKED like it graded the census and graded nothing. Deleted rather than left in.
    //
    // What these rows are worth is a different thing: they answer v3564's prose claim -- does fracture actually
    // GENERATE intermediate-axis bodies? -- with a measurement over real fragments.
    const worstTrace = rows.reduce((w, r) => Math.max(w, r.traceResidual || 0), 0);

    return {
        rotatedBoxWorstErr, traceResidual, spectrumPhysical,
        censusTotal: cen.total, censusDistinct: cen.distinct, censusDegenerate: cen.degenerate,
        censusWorstTraceResidual: worstTrace,
        censusAllPhysical: rows.every((r) => r.physical) ? 1 : 0,
        censusWorstSpread: rows.reduce((w, r) => Math.max(w, r.spread || 0), 0),
    };
}

const FRAGMENTROTATION_MODES = ["fragments"];   // v4074 -- the single source `modes` and `defaults()` both read

export const fragmentRotationDevice = {
    // *** v4035 -- DECLARED, BECAUSE THE ELEMENTWISE LADDER IS THE ONE TRANSFORMATION THIS QUANTITY IGNORES. ***
    // `axis` IS A DIRECTION. Scaling it by 1.5 gives the same axis, so knobLiveness's array ladder moved
    // nothing at any rung and reported the knob dead -- MEASURED BIT-IDENTICAL at [1,2,3] and [1.5,3,4.5].
    // That invariance is the rotation being a rotation, not a defect, and the honest perturbation is a
    // DIFFERENT DIRECTION rather than a longer vector. Three that are not parallel to the default and not
    // to each other: two coordinate axes and a face diagonal.
    knobChoices: { axis: [[1, 2, 3], [0, 0, 1], [1, 0, 0], [1, 1, 0]] },

    plantKind: "method",
    // v4102 -- NAMED, THE SAME COMPLETION v3851/v4088-v4101 gave the rest of this family. MEASURED, both arms:
    // rotatedBoxWorstErr 3.55e-15 -> 1.090, matching the header exactly. traceResidual stays bit-identical
    // (15.0 both) and spectrumPhysical stays valid (1) under the plant, which the header names as the whole
    // reason this device exists -- a body carrying only the two structural checks would certify a fragment
    // whose principal moments are wrong by 36% as physically admissible.
    planted: { knob: "planted", observable: "rotatedBoxWorstErr",
               note: "products of inertia discarded before diagonalising, so every tensor is read as though its principal axes were the coordinate axes -- exactly what a fracture fragment violates, since the break leaves its axes wherever it likes" },
    modes: FRAGMENTROTATION_MODES,
    name: "fracture-fragments-intermediate-axis",
    observables: FRAGROT_OBSERVABLES,
    build: buildFragRot,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "fragments"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: FRAGMENTROTATION_MODES.includes(mode) ? mode : FRAGMENTROTATION_MODES[0], config: { ...DEF } }),
};
