// tools/roundhouse/spatialAgreementBind.mjs
//
// v3296 -- FIVE SPATIAL STRUCTURES MADE TO MEET. Eleventh promotion, and the key is EXACT SET EQUALITY -- no
// tolerance anywhere, which no other device in this run can say.
//
// This tree contains five independent spatial structures: physics/broadPhase.js (AabbGrid), core/ecs/aabbTree.js
// (a BVH), physics/spatial/kdtree.js, physics/md/neighborGrid.js and physics/sph/spatialGrid.js. Every one is
// gated, and EVERY GATE CHECKS IT AGAINST ITS OWN BRUTE FORCE IN ISOLATION. Not one referenced another.
//
// AND THE NAIVE VERSION OF THIS DEVICE WOULD HAVE BEEN WRONG. "They should all agree" produces a gate that fails
// forever on correct code, because the five answer TWO DIFFERENT QUESTIONS wearing similar names:
//
//     POINT-AND-RADIUS   kdtree.withinRadius, neighborPairs(cutoff), SpatialGrid(h)   an L2 SPHERE test
//     BOX OVERLAP        AabbGrid, AABBTree                                           an L-infinity BOX test
//
// THE EXACT RELATION THAT LETS THEM MEET: give every point a box of half-extent r/2. Two such boxes overlap
// exactly when the CHEBYSHEV distance is <= r; the sphere test fires when the EUCLIDEAN distance is <= r. Since
// |d|_2 <= r implies |d|_inf <= r, always:
//
//     SPHERE PAIRS is a SUBSET of BOX PAIRS
//
// That is geometry, not a tolerance. Three tiers of key, and all three are exact:
//   WITHIN the point family   all three structures must produce the IDENTICAL pair set. Measured: 462 = 462 = 462
//   WITHIN the box family     both must produce the IDENTICAL pair set. Measured: 912 = 912
//   ACROSS the families       sphere must be a strict subset of box. Measured: 462 of 912, the 450 extra being
//                             the box corners a sphere does not reach.
//
// A structure that returned a superset -- reporting pairs that are not neighbours -- would pass every isolated
// brute-force gate that only checked for MISSED pairs. Five-way exact equality is what closes that.

import {
    scene, compareAll, sameSet, isSubset, missing, extra, bruteBox,
    POINT_FAMILY, BOX_FAMILY,
} from "../../physics/spatial/agreement.mjs";

// *** v3902 -- THE DEVICE FEARED A SUPERSET AND REPORTED ONLY A BOOLEAN ABOUT IT. ***
//
// The header above ends on the reason this device exists: "A structure that returned a superset -- reporting
// pairs that are not neighbours -- would pass every isolated brute-force gate that only checked for MISSED
// pairs. Five-way exact equality is what closes that." That claim was carried by `boxFamilyAgrees`, a BOOLEAN,
// and a boolean is what the census reports as DECLARED BUT DEAD -- so the one failure mode this device was
// built to catch could not be graded by the sweep at all.
//
// `boxExtraPairs` and `boxMissingPairs` COUNT the two directions separately, and the asymmetry is the whole
// point: a missed pair is a bug every isolated gate already finds, an EXTRA pair is the one that hides. Both
// are 0 in the honest arm -- exact set equality, no tolerance -- so they are not a tolerance in disguise.
export const SPATIAL_OBSERVABLES = [
    "n", "r", "spherePairs", "boxPairs", "cornerPairs",
    "pointFamilyAgrees", "boxFamilyAgrees", "sphereSubsetOfBox",
    "pointMismatches", "boxMismatches",
    "boxExtraPairs", "boxMissingPairs",
];

const DEF = { n: 400, r: 1.2, seed: 7 };

function buildSpatial({ mode = "agreement", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const pts = scene(c.n, { seed: c.seed });
    const res = compareAll(pts, c.r);

    // *** THE PLANT IS THE HALF-EXTENT, AND IT IS THE MISTAKE THE GEOMETRY INVITES. *** The relation that lets
    // the two families meet is a box of half-extent r/2: two such boxes overlap exactly when the CHEBYSHEV
    // distance is <= r. Give every point a box of half-extent r INSTEAD -- the obvious reading of "a box of
    // size r" -- and the boxes overlap when |d|_inf <= 2r, which is EXACTLY bruteBox(pts, 2r). So the planted
    // structure is produced by the SHIPPED brute force at twice the radius rather than by a reimplementation
    // here, and the sabotage stays in the bind: physics/spatial/agreement.mjs is imported unchanged, which is
    // the rule plasticBind states in the same words.
    const boxSets = mode === "supersetbox"
        ? BOX_FAMILY.map(() => bruteBox(pts, 2 * c.r))
        : BOX_FAMILY.map((k) => res[k]);

    const pointBad = POINT_FAMILY.filter((k) => !sameSet(res[k], res.bruteSphere));
    const boxBad = BOX_FAMILY.filter((k, i) => !sameSet(boxSets[i], res.bruteBox));

    // COUNTED OVER THE WHOLE FAMILY, in both directions. `extra` is what an isolated gate cannot see.
    //
    // *** THE ARGUMENT ORDER IS (expected, got) AND I HAD IT BACKWARDS ON THE FIRST WRITE. *** The plant
    // reported boxMissingPairs = 10168 and boxExtraPairs = 0, WHICH IS IMPOSSIBLE ON ITS FACE: a superset
    // cannot miss anything. The asymmetry the plant was built to expose is what exposed the swap instead --
    // a defect that produces a self-contradictory reading is cheap, and one that produces a plausible one is
    // not, which is the argument for planting an ASYMMETRIC defect rather than a symmetric one.
    let boxExtra = 0, boxMissing = 0;
    for (const set of boxSets) {
        boxExtra += extra(res.bruteBox, set).length;      // in `set`, not in the reference -- INVENTED pairs
        boxMissing += missing(res.bruteBox, set).length;  // in the reference, not in `set` -- MISSED pairs
    }

    return {
        n: res.n, r: res.r,
        spherePairs: res.bruteSphere.size, boxPairs: res.bruteBox.size,
        cornerPairs: res.bruteBox.size - res.bruteSphere.size,
        pointFamilyAgrees: pointBad.length === 0,
        boxFamilyAgrees: boxBad.length === 0,
        sphereSubsetOfBox: isSubset(res.bruteSphere, res.bruteBox),
        pointMismatches: pointBad, boxMismatches: boxBad,
        boxExtraPairs: boxExtra, boxMissingPairs: boxMissing,
    };
}

export const spatialAgreementDevice = {
    modes: ["agreement", "supersetbox"],
    name: "spatial-five-way-agreement", observables: SPATIAL_OBSERVABLES, build: buildSpatial,
    // *** v3902 -- IT REFUSES AN UNDECLARED MODE NOW, AND IT USED TO HAND THE NAME STRAIGHT BACK. ***
    // The old line was `mode: mode || "agreement"`, which returns ANY truthy name as though the device offered
    // it -- deviceModes-selfcheck's `checkMode(d, "zzz_not_a_mode_zzz")` saw acceptance, and `spatial` sat on
    // that gate's UNGUARDED_BASELINE. Guarding it was the PLANT'S PRECONDITION and not a side errand: v3806's
    // lesson, quoted in that gate, is that a validator which silently rewrites the mode makes both arms read
    // an identical number, so the plant appears to fire and changes nothing.
    // *** AND I WALKED INTO EXACTLY THAT ON splatBind THIS SAME ROUND *** -- a second copy of the mode list
    // inside its defaults() coerced the new plant mode to the primary and the two arms came back bit-identical.
    // The lesson was written down at v3806 and cost a debugging round anyway at v3902.
    // NULL, NOT A COERCION: beamBind returns null for an undeclared mode and that is the behaviour the gate
    // calls correct -- coercing to the primary passes the same check while still answering a question nobody
    // asked.
    defaults: ({ mode } = {}) => {
        const m = mode ?? "agreement";
        return ["agreement", "supersetbox"].includes(m) ? { mode: m, config: { ...DEF } } : null;
    },
    // `boxExtraPairs` 0 -> the count below. NOT `boxFamilyAgrees`, which is the boolean this device has always
    // carried and which the census cannot grade; NOT `boxMissingPairs`, which stays EXACTLY 0 under this plant
    // because a superset misses nothing -- and a declaration pointed at an observable that does not move is
    // the dead declaration v3849 and v3852 each cost a round to.
    plantMode: "supersetbox", plantFlips: "boxExtraPairs", plantKind: "knob",
};
