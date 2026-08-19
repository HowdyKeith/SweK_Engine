// tools/roundhouse/hydrostaticBind.mjs
//
// v3294 -- CAN THE FLUID HOLD UP A COLUMN OF ITS OWN WATER? Ninth promotion, and the one with the most
// instructive history in the tree.
//
// THE FILE'S OWN RECORD, which is why it was worth wiring: physicsSuite noted at v2494 that "THE SPH BACKEND
// PASSES 3 GREEN GATES AND CANNOT HOLD UP A COLUMN OF WATER", and blamed a soft equation of state. A later
// session (v2881) announced that diagnosis WRONG -- and then RETRACTED that at v2883, because it had read a
// one-line summary and missed the note twenty lines down which already contained the correction. It made the
// original error and reported the fix as a discovery.
//
// SO THIS DEVICE DOES NOT PROMOTE A FINDING. It re-measures numbers the file already recorded, which is the
// only useful thing left to do with a question that has been answered twice and mis-answered twice.
//
// WHAT REPRODUCES EXACTLY (recorded v2881, re-measured v3294, drift <= 0.1%):
//     ideal EOS, restDensity = the actual packing (144)   retained 0.632
//     tait gamma=7, c=8 / 15 / 25                          retained 1.845 / 1.842 / 1.844
//
// AND THE FINDING THAT MATTERS -- TAIT DOES NOT FIX IT, TAIT EXPANDS THE COLUMN TO 184%. The v2494 diagnosis
// named a proper equation of state as the fix; measured, it makes the column blow apart instead of collapse.
// Both are failures to sit still, and swapping one for the other is not progress. That is what the file means by
// "it did not go the way the note predicted".
//
// ONE ROW IS DELIBERATELY NOT GRADED. The mis-stated-density case (restDensity 400 against a lattice delivering
// 144) recorded 0.156, and re-measuring gives 0.090. That is not drift -- the column is STILL FALLING at the
// measurement point: 0.156 at 1200 steps, 0.090 at 1500, 0.038 at 1800. A collapse in progress has no settled
// height, so no fixed number describes it and pinning one would be inventing a constant for a transient. What
// IS stable about that row is the direction, and that is what gets asserted.

import { makeColumn, settle, MEASURED_V2881 } from "../../physics/sph/hydrostatic.mjs";

export const HYDROSTATIC_OBSERVABLES = [
    "retained", "collapsed", "expanded", "finite",
    "restDensity", "packedDensity", "densityMismatch", "startHeight", "endHeight",
];

const DEF = { steps: 1500, dt: 1 / 1000 };

function buildHydrostatic({ mode = "matched", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const spec =
        mode === "tait" ? { eos: "tait", restDensity: 144, soundSpeed: config.soundSpeed || 15 } :
        mode === "mismatched" ? { eos: "ideal", restDensity: 400 } :
        { eos: "ideal", restDensity: 144 };

    const col = makeColumn(spec);
    const r = settle(col, { steps: c.steps, dt: c.dt });
    return {
        retained: r.retained, collapsed: r.collapsed, expanded: r.expanded, finite: r.finite,
        restDensity: r.restDensity, packedDensity: r.packedDensity,
        densityMismatch: Math.abs(r.restDensity - r.packedDensity) / r.packedDensity,
        startHeight: r.startHeight, endHeight: r.endHeight,
    };
}

export const hydrostaticDevice = {
    modes: ["matched", "tait", "mismatched"],
    name: "sph-hydrostatic-column", observables: HYDROSTATIC_OBSERVABLES, build: buildHydrostatic,
    defaults: ({ mode } = {}) => ({ mode: mode || "matched", config: { ...DEF } }),
};

export { MEASURED_V2881 };
