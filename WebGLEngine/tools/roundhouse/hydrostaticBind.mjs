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
// WHAT REPRODUCES (recorded v2881, re-measured v3294 at drift <= 0.1%, RE-MEASURED v4194):
//     ideal EOS, restDensity = the actual packing (144)   retained 0.6324    (recorded 0.632 -- holds)
//     tait gamma=7, c=8 / 15 / 25                          retained 1.8237 / 1.8199 / 1.8265
//                                                          (recorded 1.845 / 1.842 / 1.844)
//
// *** AND "drift <= 0.1%" IS THE CLAIM THAT DIED, BY AN ORDER OF MAGNITUDE. *** The Tait rows have moved 1.2%,
// 1.2% and 1.0% against the values this header has carried since v3294, so a bound stated as a tenth of a
// percent is now wrong by a factor of twelve. The ideal-EOS row is untouched at 0.6324, which is the useful
// half of the result: THE COLLAPSE REPRODUCES AND THE EXPANSION DOES NOT, because only the Tait path runs
// through the equation of state that 1efe978 pinned and the neighbour ordering that f350286 changed -- the two
// commits v4193 traced every moved SPH value in the lab to. The spread ACROSS c is 0.36% today, so the rows are
// still tight with respect to each other; what moved is where they all sit.
//
// AND THE FINDING THAT MATTERS -- TAIT DOES NOT FIX IT, TAIT EXPANDS THE COLUMN TO 182%. The v2494 diagnosis
// named a proper equation of state as the fix; measured, it makes the column blow apart instead of collapse.
// Both are failures to sit still, and swapping one for the other is not progress. That is what the file means by
// "it did not go the way the note predicted".
//
// ================================================================================================================
// v3845 -- PLANTED, AND THE ROUND SPENT MOST OF ITSELF LEARNING WHICH OBSERVABLE COULD CARRY ONE
// ================================================================================================================
//
// *** `retained` IS SATURATED AND CANNOT HOLD A PLANT. That is the finding, and it is why this device reached
// v3845 unplanted. *** Height retention is an END STATE: under the ideal EOS the column collapses and under
// Tait it blows apart, and once it has done either, a method defect of any plausible size lands in the same
// place. TWO CANDIDATES WERE BUILT AND MEASURED BEFORE THIS WAS BELIEVED RATHER THAN ARGUED:
//
//     rho0 ASSUMED as the nominal m/d^3 = 160 instead of the measured packing 144.34
//                                              retained 0.6324 -> 0.6220   (1.6%, and still `collapsed`)
//     Tait B missing its /gamma (B = rho0 c^2, the classic, injected as c -> c*sqrt(gamma))
//                                              retained 1.8418 -> 1.8352   (0.4%, and still `expanded`)
//
// THOSE FOUR NUMBERS ARE A DATED RECORD OF v3845'S EXPERIMENT AND ARE LEFT AS THEY WERE MEASURED. Neither
// candidate was shipped, so neither can be re-run from this file, and the honest Tait baseline they were taken
// against (1.8418) has since moved to 1.8199 -- re-deriving a percentage from a baseline the experiment never
// saw would invent a measurement. The ARGUMENT does not depend on the digits: both defects are real, both are
// invisible to `retained`, and that is why the plant is declared against densityMismatch. The live half of it
// IS re-derived every run -- hydrostatic-selfcheck rebuilds the rho0=160 candidate and prints 1.7% today.
//
// Both are REAL defects and both are INVISIBLE to the device's headline observable. A plant declared against
// `retained` would have been technically live -- the census only asks that the number MOVE -- and would have
// certified this device as covered on a 0.4% wobble. *** THE CENSUS ASKS "DID IT MOVE"; A PLANT HAS TO ANSWER
// "WOULD THE GATE HAVE CAUGHT IT", AND THOSE COME APART EXACTLY HERE. ***
//
// *** SO THE PLANT SITS ON THE ONE THING THIS DEVICE ACTUALLY ASSERTS AND THE ONE OBSERVABLE WITH RANGE:
// densityMismatch. *** The recorded row is "ideal, restDensity = the actual packing (144)", and the whole
// v2484 / v2494 / v2881 / v2883 history is about that number being MEASURED rather than assumed. The plant
// drops makeColumn's interior filter, so the packing is averaged over all 686 particles instead of the 441
// interior ones -- and the surface particles read LOW, because an SPH density is a kernel sum and a particle
// at the free surface has half a neighbourhood. THE SURFACE DEFICIT GETS REPORTED AS THE LATTICE'S DENSITY.
//
// MEASURED, the two arms: packedDensity 144.339 -> 140.326, densityMismatch 2.345e-3 -> 2.618e-2. AN 11.1x
// SEPARATION ACROSS A 1e-2 BAR -- the recorded 144 goes from agreeing with the lattice to 0.23% to missing it
// by 2.6%. `retained` DOES NOT MOVE AT ALL in this arm (0.6324 both ways) and that is deliberate: `matched`
// hands makeColumn an explicit restDensity of 144, so the WORLD IS IDENTICAL and the plant perturbs only the
// measurement being graded. A PLANT THAT MOVED THE PHYSICS TOO WOULD NOT ISOLATE THE CLAIM.
//
// NOT CLAIMED: that this grades the solver. It grades the PROBE -- whether the number this file re-measures is
// the number it recorded -- which is the only thing a device built to re-measure a settled question can grade.
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
    // *** THE VALIDATOR MUST LIST THE PLANT MODE, or `surfacedensity` reverts to `matched`, both arms read an
    // identical number and the plant fires at nothing -- v3806's flip2d lesson. ***
    if (!HYDROSTATIC_MODES.includes(mode)) mode = "matched";
    const c = { ...DEF, ...config };
    const spec =
        mode === "tait" ? { eos: "tait", restDensity: 144, soundSpeed: config.soundSpeed || 15 } :
        mode === "mismatched" ? { eos: "ideal", restDensity: 400 } :
        // `surfacedensity` is `matched` with the probe's interior filter dropped: SAME WORLD, same restDensity,
        // same settle -- only the packing measurement changes, which is what isolates the claim.
        mode === "surfacedensity" ? { eos: "ideal", restDensity: 144, surfacePacking: true } :
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

export const HYDROSTATIC_MODES = ["matched", "tait", "mismatched", "surfacedensity"];

export const hydrostaticDevice = {
    // "matched" stays FIRST: it owns the recorded row the plant breaks, and the plant runs its world exactly.
    modes: HYDROSTATIC_MODES,
    // *** `densityMismatch` AND NOT `retained`: see the header. retained is an END STATE and swallows a 7x
    // error in the Tait coefficient. ONE PLANT TESTS ONE CLAIM, and it has to test one that can be seen.
    // v4130 -- RELABELED. plantMode/plantFlips are both declared and plantMode is in this device's own modes
    // list, so plantedCoverage.mjs's declaredPlantMode()/probeModePlant() path takes this device BEFORE the
    // reader path ever runs and grades it as a mode-plant regardless of the label here -- MEASURED,
    // densityMismatch 2.345e-3 -> 2.618e-2 under mode "surfacedensity", matching the header's own quoted figures
    // exactly.
    plantMode: "surfacedensity", plantFlips: "densityMismatch", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "densityMismatch is a fractional disagreement between packed and rest density, ideally 0; reading surface density instead of the interior takes it 2.35e-3 -> 2.62e-2",
    name: "sph-hydrostatic-column", observables: HYDROSTATIC_OBSERVABLES, build: buildHydrostatic,
    defaults: ({ mode } = {}) => ({ mode: HYDROSTATIC_MODES.includes(mode) ? mode : "matched", config: { ...DEF } }),
};

export { MEASURED_V2881 };
