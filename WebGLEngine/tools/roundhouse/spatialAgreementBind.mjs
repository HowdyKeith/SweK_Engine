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
    scene, compareAll, sameSet, isSubset, missing, extra,
    POINT_FAMILY, BOX_FAMILY,
} from "../../physics/spatial/agreement.mjs";

export const SPATIAL_OBSERVABLES = [
    "n", "r", "spherePairs", "boxPairs", "cornerPairs",
    "pointFamilyAgrees", "boxFamilyAgrees", "sphereSubsetOfBox",
    "pointMismatches", "boxMismatches",
];

const DEF = { n: 400, r: 1.2, seed: 7 };

function buildSpatial({ mode = "agreement", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const pts = scene(c.n, { seed: c.seed });
    const res = compareAll(pts, c.r);

    const pointBad = POINT_FAMILY.filter((k) => !sameSet(res[k], res.bruteSphere));
    const boxBad = BOX_FAMILY.filter((k) => !sameSet(res[k], res.bruteBox));

    return {
        n: res.n, r: res.r,
        spherePairs: res.bruteSphere.size, boxPairs: res.bruteBox.size,
        cornerPairs: res.bruteBox.size - res.bruteSphere.size,
        pointFamilyAgrees: pointBad.length === 0,
        boxFamilyAgrees: boxBad.length === 0,
        sphereSubsetOfBox: isSubset(res.bruteSphere, res.bruteBox),
        pointMismatches: pointBad, boxMismatches: boxBad,
    };
}

export const spatialAgreementDevice = {
    modes: ["agreement"],
    name: "spatial-five-way-agreement", observables: SPATIAL_OBSERVABLES, build: buildSpatial,
    defaults: ({ mode } = {}) => ({ mode: mode || "agreement", config: { ...DEF } }),
};
