// WebGLEngine/physics/render/occlusion-selfcheck.mjs -- v3469
//
// Run: node physics/render/occlusion-selfcheck.mjs
//
// Three keys, and none of them is a picture:
//
//   1. A spherical occluder of radius r at distance d along the normal leaves EXACTLY rho * (1 - (r/d)^2).
//   2. Doubling d divides the blocked fraction by EXACTLY FOUR -- the inverse-square law falling out of
//      geometry, with nobody typing an exponent.
//   3. A sphere placed BEHIND the shading point changes the answer BY NOTHING. That is the `t > 0` test, and
//      it is the most-made mistake in ray tracing.
"use strict";
import { rng, cosineSampleHemisphere, createCoordinateSystem, toWorld } from "./furnace.mjs";
import { furnaceOccluded, capPrediction, raySphere, occluded } from "./occlusion.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const RHO = 0.18, S = 400000;
const wire = { rng, sampler: cosineSampleHemisphere, frame: createCoordinateSystem, toWorld };
const run = (spheres, opts = {}) => furnaceOccluded(RHO, S, { seed: 5, spheres, ...wire, ...opts });

/* ------------------------------------------------------------------------------------------------------------
 * 0. THE INTERSECTION ITSELF, BEFORE ANY INTEGRAL
 * --------------------------------------------------------------------------------------------------------- */
{
    const hit = raySphere([0, 0, 0], [0, 1, 0], [0, 3, 0], 1);
    ok("!! a ray fired at a sphere three units away enters it at exactly t = 2", Math.abs(hit - 2) < 1e-12,
       `t = ${hit}. Checked before anything integrates it: if the intersection were wrong, every number below would be measuring the wrong geometry and still look self-consistent.`);
    ok("!! *** and a sphere BEHIND the ray returns null, which is the whole `t > 0` test ***",
       raySphere([0, 0, 0], [0, 1, 0], [0, -3, 0], 1) === null &&
       raySphere([0, 0, 0], [0, 1, 0], [0, -3, 0], 1, { noTMin: true }) !== null,
       "the quadratic has REAL ROOTS either way -- the sphere is on the line, just the wrong side of the origin. WITHOUT THE POSITIVITY TEST THE MATHS IS FINE AND THE PICTURE IS WRONG, which is exactly why it survives a visual check.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE CLOSED FORM
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [[1, 2], [1, 4], [1, 1.5], [0.5, 3]].map(([r, d]) => {
        const got = run([{ centre: [0, d, 0], radius: r }]);
        return { r, d, got, want: capPrediction(RHO, r, d) };
    });
    for (const x of rows) say(`r=${x.r} d=${x.d}: ${x.got.toFixed(6)} against rho*(1-(r/d)^2) = ${x.want.toFixed(6)}`);
    ok("!! *** THE OCCLUDED FURNACE LANDS ON rho * (1 - (r/d)^2), AND THE LOOP IS NEVER TOLD THAT NUMBER ***",
       rows.every((x) => Math.abs(x.got - x.want) / x.want < 4e-3),
       "The cap of half-angle asin(r/d) removes pi sin^2(alpha) of an integral whose total is pi. FOUR GEOMETRIES, ONE FORMULA -- a single (r,d) could be matched by several wrong laws; four cannot, and the 0.5/3 row shares no r or d with any other.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE INVERSE-SQUARE LAW, DERIVED RATHER THAN TYPED
 * --------------------------------------------------------------------------------------------------------- */
{
    const blocked = (d) => (RHO - run([{ centre: [0, d, 0], radius: 1 }])) / RHO;
    const b2 = blocked(2), b4 = blocked(4), b8 = blocked(8);
    say(`blocked fraction at d = 2 / 4 / 8: ${b2.toFixed(5)} / ${b4.toFixed(5)} / ${b8.toFixed(5)}`);
    ok("!! *** DOUBLING THE DISTANCE DIVIDES THE BLOCKED FRACTION BY EXACTLY FOUR ***",
       Math.abs(b2 / b4 - 4) < 0.08 && Math.abs(b4 / b8 - 4) < 0.08,
       `ratios ${(b2 / b4).toFixed(4)} and ${(b4 / b8).toFixed(4)} against a predicted 4.0000. *** NOBODY TYPED AN EXPONENT ANYWHERE IN THIS FILE. It is the same fact the lesson makes about area lights -- you never apply a distance falloff to them because the RAY COUNT already encodes it -- turned from an explanation into a measurement. An implementation that also multiplied by 1/d^2 would double-count and this ratio would read 16. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE PARAMETER THAT MUST NOT MATTER
 * --------------------------------------------------------------------------------------------------------- */
{
    const front = [{ centre: [0, 2, 0], radius: 1 }];
    // *** OFF-AXIS ON PURPOSE, AND MY FIRST FIXTURE WAS NOT. A behind-sphere at [0,-3,0] is directly under the
    // front one, so the cone of directions whose LINE reaches it (half-angle asin(1/3) = 19.5 degrees about the
    // vertical) LIES ENTIRELY INSIDE THE FRONT SPHERE'S OWN SHADOW (asin(1/2) = 30 degrees). The planted bug had
    // nothing left to darken and the check passed a broken intersection routine. THE FIXTURE HID THE PLANT, and
    // the fix is a harder fixture rather than a louder assertion -- v3453 and v3468, a third time.
    //
    // At [2,-2,0] the reachable cone is centred on (-1,1,0)/sqrt2, FORTY-FIVE DEGREES off the normal and well
    // clear of the front sphere's cap, so a negative root has somewhere to show.
    const behind = { centre: [2, -2, 0], radius: 1 };
    const a = run(front);
    const b = run([...front, behind]);
    const planted = run([...front, behind], { noTMin: true });
    say(`with the front occluder ${a.toFixed(6)} | plus one BEHIND ${b.toFixed(6)} | same, with no t>0 test ${planted.toFixed(6)}`);

    ok("!! *** A SPHERE BEHIND THE SHADING POINT CHANGES THE ANSWER BY NOTHING -- BIT FOR BIT ***", a === b,
       "not 'within tolerance': IDENTICAL, because the rays that would reach it are never cast. An exact invariance is worth more than a close one -- there is no tolerance to argue about and no fixture size that makes it weaker.");

    ok("!! *** AND DROPPING THE t > 0 TEST BREAKS IT, WHICH IS WHAT MAKES THE INVARIANCE A CHECK ***",
       planted < a * 0.999,
       `${planted.toFixed(6)} against ${a.toFixed(6)}, ${((1 - planted / a) * 100).toFixed(1)}% too dark. *** THE PLANT IS INVISIBLE TO SECTIONS 1 AND 2 -- with no sphere behind the point there is nothing for a negative root to find, so every number above is unchanged by it. A geometry key needs a fixture with something in the wrong half-space, and a scene of one sphere overhead would have certified this bug. ***`);

    ok("...and an EMPTY scene still reads the plain albedo, so occlusion did not cost the original key",
       Math.abs(run([]) / RHO - 1) < 1e-9,
       `${run([]).toFixed(6)}. v3467's furnace still holds with the occlusion machinery in the path -- if it did not, the new code would have broken the old answer and the new keys would be measuring a different renderer than the one that passed before.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. `occluded` ITSELF: THE .some() OVER A LIST, AND THE OPTS PASSTHROUGH, CHECKED DIRECTLY -- NOT ONLY THROUGH
 *    furnaceOccluded's MONTE CARLO ESTIMATE, WHICH COULD HIDE A WRONG COMBINATOR BEHIND SAMPLING NOISE.
 * --------------------------------------------------------------------------------------------------------- */
{
    const O = [0, 0, 0], DIR = [0, 1, 0];
    const front = { centre: [0, 3, 0], radius: 1 };     // dead ahead, blocks
    const miss = { centre: [5, 3, 0], radius: 1 };       // off to the side, never on this ray
    const behind = { centre: [0, -3, 0], radius: 1 };    // on the line, but behind the origin

    ok("!! occluded is false against an empty occluder list", occluded(O, DIR, []) === false,
       "no spheres, nothing to intersect -- the base case any .some()-based combinator must get right.");

    ok("!! occluded is true when exactly one sphere in a MULTI-sphere list actually blocks",
       occluded(O, DIR, [miss, front]) === true,
       "raySphere returns null for `miss` and a hit for `front`; .some() must return true on the SECOND element even though the first is null -- an .every() or an unconditional `[0]` read would get this wrong.");

    ok("!! occluded is false when NO sphere in a multi-sphere list blocks", occluded(O, DIR, [miss, behind]) === false,
       "neither the off-axis sphere nor the one behind the origin lies on the forward ray; every element must be tried and none should count as a block.");

    ok("!! *** occluded forwards opts to EVERY raySphere call, not just some of them ***",
       occluded(O, DIR, [behind]) === false && occluded(O, DIR, [behind], { noTMin: true }) === true,
       "with no opts the behind-sphere is correctly ignored (t > 0 test); passed { noTMin: true } it must flip to occluded, because occluded's own job is nothing more than passing that option through to raySphere for every candidate -- dropping the opts argument anywhere in the chain would leave this always false.");

    ok("...and occluded still finds the block when the blocking sphere is not the first element checked",
       occluded(O, DIR, [behind, miss, front]) === true,
       "three candidates, only the third blocks -- confirms the scan does not stop or decide early on the first two nulls.");
}

console.log(fails ? "\nocclusion-selfcheck: " + fails + " FAILED" : "\nocclusion-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
