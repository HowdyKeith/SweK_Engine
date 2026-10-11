// WebGLEngine/physics/character/capsuleGround.mjs -- v4543
//
// *** BACKLOG "terrain-controller" PIECE (3): THE GROUND IS NOT A FUNCTION OF (x, z). *** The entry has read
// "An overhang has two surfaces over one point and the oracle takes the topmost" since v4544, and v4539
// proved it cannot be closed from above: a bridge you walk under and a pillar you are stopped by present
// BYTE-IDENTICAL columns to a vertical ray, [5, 0] and [5, 0], because a ray never touches a side face.
// v4541 built the thing that does touch side faces. v4542 closed the same defect for VOXEL worlds by giving
// the probe the body. This is the two of them put together, for meshes.
//
// A ground oracle for physics/character/terrainWalk.mjs that takes the body's own height as a third
// argument: cast down from the body's reach for a CANDIDATE surface, then ask
// physics/character/capsuleMove.mjs whether a body of this size could actually stand on it. With no third
// argument it is meshGround, exactly, so nothing that never had a body changes.
//
//     shipped meshGround      capsuleGround, given the body
//     bridge, roof at 5       stops at x = 8.000     walks under to 20.000
//     pillar, solid           stops at x = 8.000     stopped at 7.583
//     tunnel with a deck      stops at x = 6.000     walks under to 20.000, and along the deck
//     roof at 1.8 (fits)      stops at x = 8.000     walks under to 20.000
//     roof at 1.7 (does not)  stops at x = 8.000     stopped at 7.667
//     doorway, body clipping  walks THROUGH to 20    stopped at 7.583
//
// *** THE SHIPPED ORACLE IS WRONG IN BOTH DIRECTIONS AND THE SAME NUMBER HIDES IT. *** It stops at 8.000
// whether the thing at x = 8 is a doorway, a wall, a tunnel you fit through or a roof you do not -- and on
// the one fixture where it does NOT stop, it walks a body straight through a doorframe. A rule that answers
// 8.000 for five different worlds is not being cautious; it is not reading the question.
//
// ---- SIX FORMULATIONS WERE BUILT AND FIVE DIED TO A FIXTURE THE ONE BEFORE IT DID NOT HAVE -------------
//
// This is the round's real content, so it is written down rather than smoothed over. Every one of these
// passed everything that existed when it was written.
//
//   1. CAST FROM THE BODY, TAKE THE HIT.                  v4539's candidate. Walks through the pillar,
//      because at x = 8.5 the ray STARTS INSIDE the stone and the first thing under it is the floor.
//   2. CAST FROM THE BODY, REFUSE IF THE CAPSULE AT THE HIT TOUCHES ANYTHING.
//      Separates bridge from pillar. *** REFUSES EVERY RAMP IN THE WORLD: *** a capsule placed at a surface
//      point penetrates any surface that is not horizontal, because its side sphere cuts the slope. The
//      first three fixtures were all flat floors, so nothing said so.
//   3. ...REFUSE IF DEPENETRATING IT MOVES IT SIDEWAYS.   Measured and discarded: resting on a 45-degree
//      ramp displaces 0.0828 sideways and a wall displaces 0.1 to 0.3. THE TWO RANGES OVERLAP. No threshold
//      exists, which is a fact about the quantity rather than about the tuning.
//   4. ...REFUSE IF THE DEEPEST PENETRATION EXCEEDS HALF THE RADIUS.
//      A 45-degree ramp penetrates 0.1172 and a roof 0.1 too low gives 0.1000. THE RANGES OVERLAP AGAIN.
//      Depth cannot separate "standing on a slope" from "wedged under a ceiling" either.
//   5. TEST THE BODY AT ITS OWN y, CLASSIFY CONTACTS BY DIRECTION, FALL BACK TO THE SKY WHEN OBSTRUCTED.
//      Twelve fixtures green. *** THEN A DOORWAY: *** a body whose shoulder clips the jamb is "obstructed",
//      falls back to the sky, the sky sees clear floor, and it walks THROUGH THE DOORFRAME. A fallback that
//      answers the question the refusal just refused is not a refusal.
//   6. TEST THE BODY AT THE CANDIDATE SURFACE, CLASSIFY BY DIRECTION, DESCEND OR RETURN null.
//      Seventeen of eighteen. The last was the internal-edge artefact -- see below.
//
// ---- AND THE LAST FAILURE WAS v4541'S OWN FINDING ARRIVING FROM THE OTHER SIDE -------------------------
//
// Formulation 6 classified EVERY contact, and a 26.6-degree ramp then refused ITSELF at x = 13.597, a
// 45-degree one at 13.504. Both are tessellation seams. The neighbour triangle's nearest feature to the
// capsule is the SHARED EDGE, so its push is steep, and a seam that bounds nothing reads as a wall. A
// 10-degree ramp climbs all the way, because it is too shallow for the edge to become the closest feature.
//
// v4541 measured the same artefact from the other direction -- summing every contact drifts a body 0.63 m
// sideways across a PERFECTLY FLAT floor -- and concluded deepest-first. *** THE SAME CONCLUSION HOLDS FOR
// CLASSIFYING AS FOR RESOLVING, AND FOR THE SAME REASON: *** the deepest contact is the surface; the rest
// are the mesh's own bookkeeping.
//
// ---- WHAT THIS DOES NOT DO, MEASURED RATHER THAN ASSUMED -------------------------------------------------
//
// *** IT DOES NOT MOUNT A STEP, AND NEITHER DOES capsuleMove. *** A body of radius 0.4 walking at a riser
// 0.4 high stops at x = 7.600 -- both here and in capsuleMove.moveCapsule, independently, which is the two
// authorities agreeing. It is not a defect in either: a body 0.4 wide standing at x = 7.9 GENUINELY overlaps
// a riser whose face is at x = 8, so there is no height an oracle could return that would help.
// terrainWalk's `stepHeight` is a POINT-BODY allowance -- it asks how far the ground may jump between two
// samples -- and a body with a radius mounts a step by being MOVED, not by being told a height.
// capsuleMove.moveCapsule rolls its bottom sphere over a 0.2 riser and is stopped by 0.4. So step-up for a
// capsule is a POLICY over contacts that nobody in this tree has built, which is exactly what
// capsuleMove-selfcheck's own tail says, and this round does not build it either.
//
// *** AND standable() ASKS WHETHER THE BODY IS TOUCHING SOMETHING, NOT WHETHER IT IS INSIDE SOMETHING. ***
// `contacts` is a SURFACE query. A capsule standing dead-centre in a wall thicker than its own DIAMETER
// touches neither face and reads CLEAR. Bisected on a slab: 0.79 thick reads blocked, 0.80 reads clear, and
// the capsule's diameter is 0.80 -- the boundary is the body's own size to the digit, the same shape v4541
// found when its tunnelling boundary turned out to be exactly the radius.
//
// THE WALK IS NOT AFFECTED AND THAT IS THE POINT OF SAYING IT THIS WAY: a body cannot REACH that cavity,
// because the faces stop it on the way in -- driven from both sides of the pillar, it ends at 7.583 heading
// east and 9.417 heading west, which is 8 - r and 9 + r. So this is a hazard for a body that is PLACED
// inside geometry (a spawn, a teleport, a moving platform closing on it) and not for one that walks. A
// containment test is a different query -- ray parity over a closed mesh -- and these fixtures are not
// closed solids, so it is named here rather than half-built.
//
// NO GRAVITY, NO VELOCITY, NO MOVING PLATFORMS: unchanged, and all three still belong to piece (1) and to
// capsuleMove's stated limits.
"use strict";
import { MeshBVH, trianglesFrom } from "../../mesh/meshBVH.mjs";
import { meshGround, slopeDeg } from "./terrainWalk.mjs";
import { capsuleOf, contacts } from "./capsuleMove.mjs";

const quadMesh = (quads) => {
    const pos = [], idx = [];
    for (const q of quads) { const o = pos.length; pos.push(q[0], q[1], q[2], q[3]); idx.push([o, o + 1, o + 2], [o, o + 2, o + 3]); }
    return new MeshBVH(trianglesFrom(pos, idx));
};

/** A flat approach and a ramp of `deg`, which is the fixture formulations 2, 3, 4 and 6 all died on. */
export function rampMesh({ deg = 26.6, span = 20, foot = 8 } = {}) {
    const rise = (span - foot) * Math.tan(deg * Math.PI / 180);
    return quadMesh([
        [[0, 0, 0], [foot, 0, 0], [foot, 0, span], [0, 0, span]],
        [[foot, 0, 0], [span, rise, 0], [span, rise, span], [foot, 0, span]],
    ]);
}

/** A flat roof at `y` over half the floor: the headroom fixture, where 1.8 fits a 1.8 body and 1.7 does not. */
export function roofMesh({ y = 1.7, span = 20, from = 8 } = {}) {
    return quadMesh([
        [[0, 0, 0], [span, 0, 0], [span, 0, span], [0, 0, span]],
        [[from, y, 0], [span, y, 0], [span, y, span], [from, y, span]],
    ]);
}

/** A step with a RISER -- the thing a point body climbs and a body with a radius does not. */
export function lipMesh({ h = 0.4, span = 20, at = 8 } = {}) {
    return quadMesh([
        [[0, 0, 0], [at, 0, 0], [at, 0, span], [0, 0, span]],
        [[at, h, 0], [span, h, 0], [span, h, span], [at, h, span]],
        [[at, 0, 0], [at, h, 0], [at, h, span], [at, 0, span]],
    ]);
}

/**
 * A wall with a gap in it. *** THE FIXTURE THAT KILLED FORMULATION 5, *** which fell back to the sky when
 * the body was obstructed: a body whose shoulder clips the jamb was refused, the sky then answered clear
 * floor, and it walked THROUGH the doorframe.
 */
export function doorwayMesh({ span = 20, x0 = 8, x1 = 9, gapLo = 9, gapHi = 11, h = 5 } = {}) {
    const q = [[[0, 0, 0], [span, 0, 0], [span, 0, span], [0, 0, span]]];
    for (const [z0, z1] of [[0, gapLo], [gapHi, span]]) {
        q.push([[x0, 0, z0], [x0, h, z0], [x0, h, z1], [x0, 0, z1]]);
        q.push([[x1, 0, z0], [x1, h, z0], [x1, h, z1], [x1, 0, z1]]);
        q.push([[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]]);
    }
    q.push([[x0, 0, gapLo], [x0, h, gapLo], [x1, h, gapLo], [x1, 0, gapLo]]);
    q.push([[x0, 0, gapHi], [x0, h, gapHi], [x1, h, gapHi], [x1, 0, gapHi]]);
    return quadMesh(q);
}

/** A deck over a floor: two walkable storeys over one (x, z), which is piece (3)'s sentence exactly. */
export function tunnelMesh({ span = 20, deckY = 3, from = 6, to = 14 } = {}) {
    return quadMesh([
        [[0, 0, 0], [span, 0, 0], [span, 0, span], [0, 0, span]],
        [[from, deckY, 0], [to, deckY, 0], [to, deckY, span], [from, deckY, span]],
    ]);
}

/** A wall of a chosen thickness, for the containment limit: its middle reads clear at 0.80 and not at 0.79. */
export function slabMesh({ thick = 1, span = 20, at = 10, h = 5 } = {}) {
    const a = at - thick / 2, b = at + thick / 2;
    return quadMesh([
        [[0, 0, 0], [span, 0, 0], [span, 0, span], [0, 0, span]],
        [[a, 0, 0], [a, h, 0], [a, h, span], [a, 0, span]],
        [[b, 0, 0], [b, h, 0], [b, h, span], [b, 0, span]],
        [[a, h, 0], [b, h, 0], [b, h, span], [a, h, span]],
    ]);
}

/** The face normal of triangle `i`, oriented upward -- winding is not read, per capsuleMove's (d). */
export function faceNormal(tris, i) {
    const e1 = [tris[i + 3] - tris[i], tris[i + 4] - tris[i + 1], tris[i + 5] - tris[i + 2]];
    const e2 = [tris[i + 6] - tris[i], tris[i + 7] - tris[i + 1], tris[i + 8] - tris[i + 2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const L = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / L, n[1] / L, n[2] / L];
    return n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
}

/**
 * Can a body of this size stand with its feet at (x, y, z)?
 *
 * *** THE DEEPEST CONTACT IS CLASSIFIED AND THE REST ARE NOT, AND THAT IS NOT AN OPTIMISATION. *** See the
 * header: classifying every contact makes a ramp refuse itself at its own tessellation seam. Returns the
 * reason rather than a boolean, so a gate can say WHICH of the three things stopped a body.
 */
export function standable(bvh, x, y, z, { radius = 0.4, height = 1.8, maxSlopeDeg = 45 } = {}) {
    const cos = Math.cos(maxSlopeDeg * Math.PI / 180) - 1e-12;   // the same one-ulp allowance stepTerrain uses
    const c = contacts(bvh, capsuleOf([x, y, z], { radius, height }));
    if (c.degenerate.length) return { ok: false, why: "inside", depth: c.degenerate[0].depth, n: null };
    let deepest = null;
    for (const h of c.hits) if (!deepest || h.depth > deepest.depth) deepest = h;
    if (!deepest || deepest.depth <= 1e-9) return { ok: true, why: "clear", depth: 0, n: null };
    if (deepest.n[1] >= cos) return { ok: true, why: "resting", depth: deepest.depth, n: deepest.n };
    // a push that is not upward-within-the-limit is a wall or a ceiling, and the sign says which
    return { ok: false, why: deepest.n[1] < -cos ? "ceiling" : "wall", depth: deepest.depth, n: deepest.n };
}

/**
 * A ground oracle that knows the body.
 *
 * `(wx, wz, yRef)`. With `yRef` finite it descends from the body's reach through the surfaces under
 * (wx, wz) and returns the first one the body could stand on, or null -- which stepTerrain reads as
 * `blocked`, the honest answer for "there is no ground here you could be on". With `yRef` absent it is
 * meshGround, byte for byte, which is what lets this ship without re-deriving a single existing reading.
 *
 * `stepUp` is the CALLER'S step allowance and defaults to stepTerrain's own default rather than a number
 * invented here; `maxSlopeDeg` likewise. A probe that chose its own would be answering a question the
 * controller is not asking -- v4542's rule, and v4541's sabotage C is aimed at exactly this shape.
 */
export function capsuleGround(bvh, {
    radius = 0.4, height = 1.8, stepUp = 0.5, maxSlopeDeg = 45, maxSurfaces = 8, top = 1e4,
} = {}) {
    const sky = meshGround(bvh, { top });
    const g = (wx, wz, yRef) => {
        if (!Number.isFinite(yRef)) return sky(wx, wz);
        let from = yRef + stepUp + 1e-6;
        for (let k = 0; k < maxSurfaces; k++) {
            const hit = bvh.raycastFirst(wx, from, wz, 0, -1, 0, Infinity);
            if (!hit) return null;
            const y = hit.point[1];
            if (standable(bvh, wx, y, wz, { radius, height, maxSlopeDeg }).ok) {
                return { y, n: faceNormal(bvh.tris, hit.tri * 9) };
            }
            from = y - 1e-6;                     // that surface is not one this body can use; keep descending
        }
        return null;
    };
    // *** THE SKY ORACLE IS EXPOSED RATHER THAN HIDDEN, so a gate can compare the two on one mesh without
    // building a second BVH and wondering whether the meshes matched. ***
    g.sky = sky;
    return g;
}

/** Every surface under (x, z), with the verdict for a body of this size on each. The instrument. */
export function surfacesUnder(bvh, x, z, { radius = 0.4, height = 1.8, maxSlopeDeg = 45, from = 1e4, max = 16 } = {}) {
    const out = [];
    let y = from;
    for (let k = 0; k < max; k++) {
        const hit = bvh.raycastFirst(x, y, z, 0, -1, 0, Infinity);
        if (!hit) break;
        const sy = hit.point[1];
        const v = standable(bvh, x, sy, z, { radius, height, maxSlopeDeg });
        out.push({ y: sy, slope: +slopeDeg(faceNormal(bvh.tris, hit.tri * 9)).toFixed(4), ok: v.ok, why: v.why });
        y = sy - 1e-6;
    }
    return out;
}

/**
 * *** RE-DERIVED BY tools/ship/capsuleGround-selfcheck.mjs ON EVERY RUN. *** Readings at v4543.
 */
export const GROUND_AT_V4543 = Object.freeze({
    at: "v4543",
    radius: 0.4, height: 1.8, stepUp: 0.5, maxSlopeDeg: 45,
    // *** THE SHIPPED ORACLE ANSWERS 8.000 FOR FIVE DIFFERENT WORLDS. ***
    skyStopsAt: 8,
    skyWorldsWithThatAnswer: 5,   // bridge, pillar, roof-that-fits, roof-that-does-not, solid wall
    skyWalksThroughDoorframe: 20, // and on the sixth it walks a body straight through the jamb
    bridgeX: 20,                  // and what the body-aware oracle answers on each
    pillarX: 7.583,
    roofFitsX: 20,                // roof at 1.8, body 1.8
    roofTooLowX: 7.667,           // roof at 1.7
    doorwayJambX: 7.583,
    tunnelFloorX: 20,
    tunnelDeckX: 13.917,
    headroomFits: 1.8,            // the boundary is the body's own height, to the digit
    headroomFitsNot: 1.7,
    // the six formulations, five of which died to a fixture the one before it did not have
    formulations: 6,
    seamStall266: 13.597,         // classify EVERY contact and a 26.6-degree ramp refuses itself at a seam
    seamStall45: 13.504,
    // step-up: both authorities agree, independently
    riserMounted: 0.2,            // capsuleMove.moveCapsule rolls over this
    riserRefused: 0.4,            // ...and is stopped by this, at 7.6, exactly where the oracle stops
    riserStopX: 7.6,
    // containment: contacts is a SURFACE query, and a body fits inside a wall thicker than its diameter
    containBlockedThick: 0.79,
    containClearThick: 0.8,       // = 2 * radius, to the digit
    walkedInFromEast: 7.583,      // but a body cannot WALK there: 8 - r
    walkedInFromWest: 9.417,      // ...and 9 + r
    // backward compatibility: with no body, byte for byte the old adapter
    identicalProbes: 660,
});
