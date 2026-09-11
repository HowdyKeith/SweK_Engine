// WebGLEngine/physics/character/groundProbe.mjs -- v4539
//
// *** PIECE (3) CANNOT BE CLOSED FROM ABOVE, AND THAT IS A PROOF RATHER THAN A JUDGEMENT. ***
//
// Backlog item "terrain-controller" piece (3) reads: "THE GROUND IS A FUNCTION OF (x, z). An overhang has
// two surfaces over one point and the oracle takes the topmost; this will be the first thing wrong on a real
// mesh." It is right that the oracle takes the topmost. Everything else about the sentence is worth a round.
//
// ---- THE DEFECT IS REAL AND THE SYMPTOM IS NOT THE ONE FILED -------------------------------------------
//
// physics/character/terrainWalk.mjs's meshGround casts from y = top (1e4) straight down and takes the first
// hit. On a covered walkway -- floor at y = 0 over x,z in [0,20], roof at y = 5 over x in [8,20] -- it
// answers 0.00 at x = 2 and 6 and 5.00 at x = 9, 12 and 18. It returns THE ROOF the moment the walker steps
// under it. The body then stops dead at x = 8.0000 with blocked = true: AN OVERHANG READS AS A WALL, and you
// cannot walk under a bridge, into a doorway, or through a tunnel.
//
// NOT the slope test, which the entry's wording points at. Measured at the pin: the roof is horizontal, so
// `n[1] < cos` is `1 < 0.707` and FALSE, and contourSlide is never reached. It is the STEP test that fires,
// `rise > stepHeight` with rise = 5. A fix aimed at the slope logic would hit nothing.
//
// ---- AND THE OBVIOUS FIX IS EXACTLY AS WRONG, IN THE OTHER DIRECTION ------------------------------------
//
// Cast from the body's own height plus its step allowance instead of from the sky, and the walkway opens: the
// body walks from x = 2 to x = 20.0000 under the roof. Drive the SAME oracle at a solid pillar -- x in [8,9],
// z in [8,12], floor to y = 5, side faces and all -- and it walks from x = 2 to x = 20.0000 THROUGH FOUR
// SQUARE METRES OF SOLID STONE. The shipped oracle stops at x = 8.0000 there, correctly.
//
//   fixture   shipped        from the body
//   bridge    8.0000 WRONG   20.0000 correct
//   pillar    8.0000 correct 20.0000 WRONG
//
// The fix does not remove an error. It moves it, from a refusal that is merely annoying to a permission that
// puts a character inside the world. terrainWalk.mjs's own header calls refusing "the safe direction".
//
// ---- WHY NO DOWNWARD RULE CAN DO BETTER, WHICH IS THE ROUND ---------------------------------------------
//
// *** ENUMERATE EVERY HIT DOWN THE COLUMN AND THE TWO WORLDS ARE THE SAME WORLD. *** Build the pillar to the
// roof's own height and ask for every surface under a vertical ray:
//
//   bridge at (12, 10)  ->  [5, 0]      walk UNDER it
//   pillar at (8.5, 10) ->  [5, 0]      walk INTO it
//
// Byte-identical. A downward ray never touches a side face, and the side faces are the entire difference
// between a doorway and a wall. So no rule over downward casts separates them -- not one cast, not two, not
// the all-hits query a richer oracle would offer. The information is not being discarded by the oracle; it is
// not on the ray.
//
// Distinguishing them needs the swept volume of the body against the triangles it would pass through, which
// is backlog piece (2), CAPSULE AGAINST TRIANGLES, still open. *** PIECE (3) CANNOT BE HONESTLY CLOSED WHILE
// PIECE (2) IS OPEN, *** and this module exists to hold that measurement so the next person to reach for the
// obvious fix meets the pillar before the merge does.
//
// ---- TWO MORE THINGS THE ENTRY GETS WRONG --------------------------------------------------------------
//
// THERE IS A TELEPORT, in a branch the entry does not mention. stepTerrain's zero-wish early return sets the
// body's height straight to the oracle's answer, so a body standing still under the bridge is moved five
// metres onto the roof. And with stepHeight raised to 5 the walking path teleports too, gaining 5.0007 of
// surface distance against a budget of 0.0833 -- the "gains ground on contact" defect the module's own header
// refused once already.
//
// AND meshGround HAS NO CALLER OUTSIDE ITS OWN GATE. The one shipping consumer of terrainWalk.mjs builds its
// oracle through autoGround, which chooses between the height-function and lattice adapters -- both single
// valued BY CONSTRUCTION, since a height function has no second surface to discard. So piece (3) as filed is
// a latent defect in an unwired adapter. The LIVE instance of the same mistake is elsewhere, in the voxel
// stand-height probe the bot manager and the pathfinder pool both read, and it is measured in the round note
// rather than here: a gate that boots the engine is a gate the sweep cannot afford.
"use strict";
import { MeshBVH, trianglesFrom } from "../../mesh/meshBVH.mjs";
import { meshGround, stepTerrain } from "./terrainWalk.mjs";

const mesh = (quads) => {
    const pos = [], idx = [];
    for (const q of quads) {
        const o = pos.length;
        pos.push(q[0], q[1], q[2], q[3]);
        idx.push([o, o + 1, o + 2], [o, o + 2, o + 3]);
    }
    return new MeshBVH(trianglesFrom(pos, idx));
};

/** A floor with a roof over half of it: the thing you must be able to walk UNDER. */
export function bridgeMesh({ span = 20, roofFrom = 8, roofY = 5 } = {}) {
    return mesh([
        [[0, 0, 0], [span, 0, 0], [span, 0, span], [0, 0, span]],
        [[roofFrom, roofY, 0], [span, roofY, 0], [span, roofY, span], [roofFrom, roofY, span]],
    ]);
}

/**
 * The same floor with a solid pillar instead: the thing you must be stopped BY.
 *
 * *** ITS TOP SITS AT THE BRIDGE'S ROOF HEIGHT ON PURPOSE. *** That is what makes the two columns identical
 * from above and turns the comparison from a suggestion into a proof.
 */
export function pillarMesh({ span = 20, x0 = 8, x1 = 9, z0 = 8, z1 = 12, topY = 5 } = {}) {
    return mesh([
        [[0, 0, 0], [span, 0, 0], [span, 0, span], [0, 0, span]],
        [[x0, topY, z0], [x1, topY, z0], [x1, topY, z1], [x0, topY, z1]],
        [[x0, 0, z0], [x0, topY, z0], [x0, topY, z1], [x0, 0, z1]],
        [[x1, 0, z0], [x1, topY, z0], [x1, topY, z1], [x1, 0, z1]],
        [[x0, 0, z0], [x1, 0, z0], [x1, topY, z0], [x0, topY, z0]],
        [[x0, 0, z1], [x1, 0, z1], [x1, topY, z1], [x0, topY, z1]],
    ]);
}

/**
 * Every surface a vertical ray meets through (x, z), highest first.
 *
 * Walks raycastFirst repeatedly, dropping the origin just under each hit.
 *
 * *** THE FIRST DRAFT OF THIS COMMENT HAD THE NUDGE EXACTLY BACKWARDS, AND ITS SABOTAGE IS WHAT SAID SO. ***
 * It claimed `nudge` must CLEAR meshBVH's `t > EPS` (EPS = 1e-9) or the loop would re-report the surface it
 * just left. Driven: nudge 0, 1e-15, 1e-12, 1e-9, 1e-6, 1e-3, 0.5 and 2 all return the same two surfaces, and
 * only 6 breaks it -- by starting the next ray BELOW the floor and skipping it. Zero works for the very
 * reason the comment gave for it failing: a ray starting exactly on a surface returns t = 0, which `t > EPS`
 * REJECTS, so the loop descends past it without help. The hazard is a nudge too LARGE to stay above the next
 * surface, not one too small to leave the last. Sabotage C is aimed there now and the row that catches it is
 * the surface COUNT in section 3.
 */
export function columnHits(bvh, x, z, { from = 1e4, nudge = 1e-6, max = 32 } = {}) {
    const out = [];
    let y = from;
    for (let k = 0; k < max; k++) {
        const h = bvh.raycastFirst(x, y, z, 0, -1, 0, Infinity);
        if (!h) break;
        out.push(h.point[1]);
        y = h.point[1] - nudge;
    }
    return out;
}

/** The candidate fix, kept here so a check can CONVICT it rather than describe it. */
export function fromBodyGround(bvh, { stepHeight = 0.5, lift = 1e-6 } = {}) {
    const sky = meshGround(bvh);
    return (wx, wz, yRef) => {
        if (!Number.isFinite(yRef)) return sky(wx, wz);
        const h = bvh.raycastFirst(wx, yRef + stepHeight + lift, wz, 0, -1, 0, Infinity);
        if (!h) return null;
        const i = h.tri * 9, t = bvh.tris;
        const e1 = [t[i + 3] - t[i], t[i + 4] - t[i + 1], t[i + 5] - t[i + 2]];
        const e2 = [t[i + 6] - t[i], t[i + 7] - t[i + 1], t[i + 8] - t[i + 2]];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const L = Math.hypot(n[0], n[1], n[2]) || 1;
        n = [n[0] / L, n[1] / L, n[2] / L];
        if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
        return { y: h.point[1], n };
    };
}

/** Drive stepTerrain east from `start` and report where it ends up. `bodyAware` feeds the oracle the body's y. */
export function walkEast(bvh, oracle, { start = [2, 0, 10], frames = 400, bodyAware = false, stepHeight = 0.5 } = {}) {
    let at = start.slice(), blockedAt = null;
    for (let i = 0; i < frames; i++) {
        const g = bodyAware ? (x, z) => oracle(x, z, at[1]) : oracle;
        const r = stepTerrain({ pos: at, ground: g, wish: [1, 0], dt: 1 / 60, speed: 5, stepHeight });
        if (r.blocked && blockedAt === null) blockedAt = r.pos[0];
        at = r.pos;
    }
    return { x: at[0], y: at[1], blockedAt };
}

/**
 * *** RE-DERIVED BY tools/ship/groundProbe-selfcheck.mjs ON EVERY RUN. *** Readings of this tree at v4539.
 */
export const PROBE_AT_V4539 = Object.freeze({
    bridgeShippedX: 8,          // an overhang reads as a wall
    bridgeFixedX: 20,           // and the obvious fix opens it
    pillarShippedX: 8,          // ...correctly, here
    pillarFixedX: 20,           // and the same fix walks through solid stone
    columnsIdentical: true,     // [5, 0] and [5, 0] -- the proof that no downward rule separates them
    roofY: 5,
    stepTestFires: true,        // the STEP test, not the slope test the entry's wording points at
    meshGroundShippingCallers: 0,
    liveProbeAnswer: 21,        // world/surfaceProbe.mjs's standHeightAt, for a body standing at y = 1
    liveProbeShouldBe: 1,

});
