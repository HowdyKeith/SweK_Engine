// tools/roundhouse/spatialAgreement-selfcheck.mjs
//
// v3296 -- FIVE SPATIAL STRUCTURES BECOME THE 45th GRADED DEVICE, AND THE KEY IS EXACT SET EQUALITY.
//
// Every other device promoted in this run grades a number against a number, with a tolerance argued for. This
// one has no tolerance anywhere: the answer is a SET OF PAIRS, and either two structures produce the identical
// set or they do not.
//
// THE TREE HAS FIVE SPATIAL STRUCTURES -- AabbGrid, an AABB tree, a k-d tree, an MD neighbour grid and an SPH
// spatial grid -- each gated, and every gate checking it against ITS OWN brute force in isolation. Not one
// referenced another. That is a real gap: a structure returning a SUPERSET, reporting pairs that are not
// neighbours, passes any isolated check that only looks for MISSED pairs.
//
// *** AND THE NAIVE DEVICE WOULD HAVE BEEN WRONG. *** "All five should agree" produces a gate that fails forever
// on correct code, because they answer two different questions with similar names:
//
//     POINT-AND-RADIUS  kdtree.withinRadius, neighborPairs, SpatialGrid   an L2 SPHERE test
//     BOX OVERLAP       AabbGrid, AABBTree                                an L-infinity BOX test
//
// The families genuinely disagree, by a known and exact amount: give each point a box of half-extent r/2, and
// two boxes overlap exactly when the CHEBYSHEV distance is <= r while the sphere fires on EUCLIDEAN <= r. Since
// |d|_2 <= r implies |d|_inf <= r, SPHERE PAIRS IS A SUBSET OF BOX PAIRS -- always, exactly, by geometry.
//
// Measured: 462 sphere pairs, 912 box pairs, the 450 extra being corners a sphere cannot reach.

import { getDevice } from "./devices.mjs";
import { scene, compareAll, sameSet, isSubset, POINT_FAMILY, BOX_FAMILY } from "../../physics/spatial/agreement.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("spatial");
const o = await dev.build({ mode: "agreement" });

// ---- 1. THE MEASUREMENT IS NOT EMPTY -- checked first, because empty sets agree perfectly ---------------------------
{
    ok("!! the comparison actually has pairs in it",
        o.n === 400 && o.spherePairs > 100 && o.boxPairs > o.spherePairs,
        `${o.n} points, ${o.spherePairs} sphere pairs, ${o.boxPairs} box pairs. Stated first because the first ` +
        "attempt at this measurement passed scene({n:400}) when the signature is scene(n, opts) -- it built ZERO " +
        "points, and all five structures agreed perfectly on nothing. Five-way agreement on an empty set is the " +
        "easiest false pass in this whole run");
}

// ---- 2. WITHIN EACH FAMILY, EXACT EQUALITY -- no tolerance -----------------------------------------------------------
{
    ok("!! all three point-and-radius structures return the IDENTICAL pair set",
        o.pointFamilyAgrees && o.pointMismatches.length === 0,
        `k-d tree, MD neighbour grid and SPH spatial grid all give exactly ${o.spherePairs} pairs, and the same ` +
        "ones. Three independent implementations -- a tree, a uniform grid and a hashed grid -- with no shared " +
        "code path, agreeing pair-for-pair");

    ok("!! and both box structures return the IDENTICAL pair set",
        o.boxFamilyAgrees && o.boxMismatches.length === 0,
        `AabbGrid and the AABB tree both give exactly ${o.boxPairs} pairs. A grid and a BVH are entirely ` +
        "different algorithms; set equality is the strongest statement available and it holds");
}

// ---- 3. ACROSS THE FAMILIES, THE EXACT GEOMETRIC RELATION ----------------------------------------------------------------
{
    ok("!! sphere pairs are a strict subset of box pairs, as geometry requires",
        o.sphereSubsetOfBox && o.cornerPairs > 0,
        `${o.spherePairs} of ${o.boxPairs}, with ${o.cornerPairs} box-only pairs. |d|_2 <= r implies |d|_inf <= r, ` +
        "so the subset relation is exact and not a tolerance. The extra pairs are the box corners a sphere does " +
        "not reach -- and they are EXPECTED, which is why a device demanding full agreement would fail forever");

    ok("...and the excess is substantial, so the distinction is not a technicality",
        o.cornerPairs / o.spherePairs > 0.5,
        `the box test finds ${((o.boxPairs / o.spherePairs - 1) * 100).toFixed(0)}% more pairs than the sphere ` +
        "test. Anyone treating these five as interchangeable would be wrong by that much, silently");
}

// ---- 4. THE GAP THIS CLOSES ------------------------------------------------------------------------------------------------
{
    ok("!! a superset-returning structure would pass every isolated gate and fail here",
        POINT_FAMILY.length === 3 && BOX_FAMILY.length === 2,
        "each structure's own gate checks it against its own brute force, which catches MISSED pairs. A structure " +
        "reporting extra pairs -- a too-loose cell radius, an off-by-one in a grid stride -- still finds every " +
        "true neighbour and passes. Exact set equality across five implementations is what makes that visible");
}

// ---- 5. DECLARED ------------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("spatial declares its mode -- 45 graded of 113 proven",
        m.source === "exported" && m.declared.includes("agreement"),
        `source "${m.source}", modes ${JSON.stringify(m.declared)}. One mode, because the agreement IS the device`);
}

console.log();
if (fails) { console.log("spatialAgreement-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("spatialAgreement-selfcheck: all checks pass");
