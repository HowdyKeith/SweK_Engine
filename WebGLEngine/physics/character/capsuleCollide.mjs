// WebGLEngine/physics/character/capsuleCollide.mjs -- v4628
//
// *** THE PIECE physics/character/terrainWalk.mjs NAMES AND DOES NOT BUILD. *** Its own header: "capsule-
// against-triangle depenetration -- what you need for overhangs, thin walls, ceilings and stepping onto a
// floating platform -- is a different problem with a different shape, and mesh/meshBVH.mjs's trianglesInBox
// is the query it would be built on. Not started here." This is that different problem, built on that query.
//
// TASK BOARD #80. Read (not copied -- no source was vendored or transcribed) from hh-hang/three-player-
// controller (MIT): capsule-vs-mesh collision via a bounds tree per collider, walking the closest triangle
// each frame and pushing the capsule segment out along the contact normal, sub-stepped so a deep penetration
// resolves over several frames rather than one large snap. Ground detection there is a center raycast down
// with a cylindrical-volume fallback for edges a single ray would miss (stair nosings, ledges); a hit counts
// as standable only if the triangle normal's up-component exceeds GROUND_SUPPORT_NORMAL_Y = 0.5 (~60 degrees
// from vertical), tested PER TRIANGLE rather than on some averaged/smoothed surface -- arbitrary uneven mesh
// terrain is the stated design target, not a flat plane. Moving platforms carry a rider through the
// platform's own frame-to-frame position/rotation delta.
//
// WHAT IS PORTED HERE IS THE ALGORITHM, IN THIS TREE'S OWN FLAT-ARRAY STYLE, NOT THE REFERENCE'S CODE:
// closestPointOnTriangle and closestSegmentSegment below are the standard closed-form solutions from
// computational geometry (Ericson, "Real-Time Collision Detection") that any capsule-vs-mesh collider is
// built from, reimplemented directly against mesh/meshBVH.mjs's own triangle buffer layout and trianglesInBox
// query -- the same "take the structure, not the three.js binding" rule meshBVH.mjs's own header states.
//
// SCOPE, STATED PLAINLY: segmentTriangleClosest below is the standard game-collision approximation (closest
// point on the triangle to each capsule endpoint, plus closest points between the capsule segment and each of
// the triangle's three edges, minimum of the five) -- correct whenever the true closest pair lies on a
// triangle vertex, edge, or either capsule endpoint, which is every case a radius-based depenetration query
// needs. It is not the fully general segment-vs-triangle-interior distance (a segment that pierces a large
// triangle's interior without either endpoint being the nearest point to any edge is not covered), which does
// not arise for a capsule radius small relative to the geometry it walks -- the same regime every reference
// controller built on this technique assumes.
"use strict";

/** hh-hang/three-player-controller's own name and value: a triangle is standable if its normal's up-component clears this. */
export const GROUND_SUPPORT_NORMAL_Y = 0.5;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Closest point on triangle (a,b,c) to point p. Ericson section 5.1.5 -- the Voronoi-region walk over the
 * triangle's vertices, edges and face, none of which needs a square root until the final distance.
 */
export function closestPointOnTriangle(p, a, b, c) {
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a.slice();

    const bp = sub(p, b);
    const d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b.slice();

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));

    const cp = sub(p, c);
    const d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c.slice();

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return add(b, scale(sub(c, b), w));
    }

    const denom = 1 / (va + vb + vc);
    return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

/** Closest points between segments (p1,q1) and (p2,q2). Ericson section 5.1.9. Returns {c1, c2, distSq}. */
export function closestSegmentSegment(p1, q1, p2, q2) {
    const EPS = 1e-15;
    const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    let s, t;
    if (a <= EPS && e <= EPS) { s = 0; t = 0; }
    else if (a <= EPS) { s = 0; t = clamp01(f / e); }
    else {
        const c = dot(d1, r);
        if (e <= EPS) { t = 0; s = clamp01(-c / a); }
        else {
            const b = dot(d1, d2);
            const denom = a * e - b * b;
            s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = clamp01(-c / a); }
            else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
        }
    }
    const c1 = add(p1, scale(d1, s)), c2 = add(p2, scale(d2, t));
    return { c1, c2, distSq: dot(sub(c1, c2), sub(c1, c2)) };
}

/**
 * Closest points between capsule segment (p0,p1) and triangle (a,b,c). Five candidates -- see the header's
 * SCOPE note for exactly what this does and does not cover -- minimum distance wins.
 */
export function segmentTriangleClosest(p0, p1, a, b, c) {
    let bestSeg = null, bestTri = null, bestDistSq = Infinity;
    const consider = (onSeg, onTri) => {
        const d = dot(sub(onSeg, onTri), sub(onSeg, onTri));
        if (d < bestDistSq) { bestDistSq = d; bestSeg = onSeg; bestTri = onTri; }
    };
    consider(p0, closestPointOnTriangle(p0, a, b, c));
    consider(p1, closestPointOnTriangle(p1, a, b, c));
    for (const [ea, eb] of [[a, b], [b, c], [c, a]]) {
        const r = closestSegmentSegment(p0, p1, ea, eb);
        if (r.distSq < bestDistSq) { bestDistSq = r.distSq; bestSeg = r.c1; bestTri = r.c2; }
    }
    return { onSeg: bestSeg, onTri: bestTri, distSq: bestDistSq };
}

function triAt(bvh, tri) {
    const i = tri * 9, t = bvh.tris;
    return [[t[i], t[i + 1], t[i + 2]], [t[i + 3], t[i + 4], t[i + 5]], [t[i + 6], t[i + 7], t[i + 8]]];
}

/** The triangle's face normal, oriented toward (tx,ty,tz) -- correct for a wall or ceiling, not just a floor.
 *  Exported for tools/ship/capsuleCollideTsl-selfcheck.mjs (task #86): the CPU reference a GPU port is graded
 *  against needs the REAL function, not a second copy that could quietly drift from this one. */
export function faceNormalToward(a, b, c, tx, ty, tz) {
    let n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (dot(n, [tx - a[0], ty - a[1], tz - a[2]]) < 0) n = [-n[0], -n[1], -n[2]];
    return n;
}

/**
 * Push a vertical capsule (feet at `feet`, given radius and total height) out of the triangles in `bvh` it
 * overlaps. Each pass resolves against the SINGLE DEEPEST-PENETRATING triangle in range -- matching the
 * reference's own description ("finds the closest triangle each frame and pushes... along the contact
 * normal"), singular, not every candidate at once -- capped at maxStep = radius * 0.8 (the reference's own
 * cap, so a deep penetration resolves over several passes instead of one large snap that could push the
 * capsule through a second, thinner wall on the far side). A corner (two contacts at once) still resolves:
 * whichever wall is deeper wins this pass, the other is deeper RELATIVE TO THE NEW POSITION next pass, and
 * `iterations` gives it the chance to run.
 *
 * *** RESOLVING EVERY CANDIDATE TRIANGLE IN ONE PASS, RATHER THAN JUST THE DEEPEST, WAS TRIED AND IS WRONG.
 * *** Any triangulated floor has adjacent triangles meeting at a shared edge, and a capsule resting near that
 * seam is in range of BOTH triangles from the same query at once. Measured: a capsule embedded 0.15 units
 * into a two-triangle floor quad, resting exactly on the diagonal seam, resolved to +0.15 -- past the surface
 * and out the other side -- because the second triangle's push added on top of the first's instead of the
 * pass stopping once ONE triangle had already resolved the (single, physically real) contact. The maxStep
 * cap failed the same way for the same reason: a deep-but-still-in-range embedding near a seam converged in
 * one pass instead of several, because the second triangle's own (now smaller, but still nonzero) penetration
 * bought it a second push in the pass the cap was supposed to limit to one. Resolving only the deepest
 * candidate per pass makes both bugs structurally impossible rather than special-cased away.
 *
 * `grounded` is true iff any pass's resolved contact had a normal whose Y exceeded GROUND_SUPPORT_NORMAL_Y --
 * standing is a CONSEQUENCE of penetration resolution against a floor triangle, the same way it is in most
 * sweep-and-resolve controllers; probeGround below is the separate, predictive check for a caller that wants
 * to know about an edge or gap before it causes a fall, which this function does not attempt.
 *
 * *** A CONTACT TEST OF dist < radius, WITH NO MARGIN, IS UNSTABLE AT THE ONE STATE A RESTING CAPSULE
 * ACTUALLY LIVES IN. *** A capsule at rest settles to EXACTLY dist === radius (this call resolves it there
 * and nothing pushes it further). The next call finds dist >= radius -- not a penetration by that test -- so
 * it reports NO contact and `grounded: false`, even though the capsule has not moved and is still touching
 * the floor. A caller integrating gravity on `!grounded` then nudges it a hair below the surface, which IS a
 * penetration next call, which resolves it back to exactly dist === radius, which is unguarded again the call
 * after that -- `grounded` flickers every other call. Measured live: camera.js's own jump, which only fires
 * on `keys.has("Space") && this._fpOnGround`, silently did nothing on roughly half of all frames a standing
 * player could have pressed it on. CONTACT_SKIN gives contact detection (not the push) a small margin --
 * the same "skin width" every production capsule controller (Unity's CharacterController included) carries
 * for exactly this reason -- so a dist a hair over radius still counts as touching, at zero push.
 */
const CONTACT_SKIN = 1e-4;

export function depenetrateCapsule(feet, radius, height, bvh, opts = {}) {
    const { iterations = 4, groundNormalY = GROUND_SUPPORT_NORMAL_Y, maxStepFrac = 0.8 } = opts;
    const segLo = radius, segHi = Math.max(radius, height - radius);
    const maxStep = radius * maxStepFrac;
    let cx = feet[0], cy = feet[1], cz = feet[2];
    let grounded = false, groundNormal = null, contacts = 0;

    // The capsule's own overall center (segment midpoint) is used to ORIENT every push normal below -- see
    // the long comment at the normal computation for why the closest-point-relative direction this used to
    // use is unsafe, and why this fixed reference point is not.
    const midY = segLo + (segHi - segLo) / 2;

    for (let iter = 0; iter < iterations; iter++) {
        const segBot = [cx, cy + segLo, cz], segTop = [cx, cy + segHi, cz];
        // *** THE QUERY BOX NEEDS THE SAME CONTACT_SKIN MARGIN THE PER-TRIANGLE DISTANCE TEST BELOW ALREADY
        // HAS, AND MISSING IT HERE REOPENS THE EXACT FLICKER THAT MARGIN EXISTS TO CLOSE. *** A capsule
        // resting exactly on a surface has its lowest point (cy) exactly AT that surface, with zero margin --
        // so a triangle sitting exactly at the query box's own edge is one float rounding away from being
        // ruled OUT by mesh/meshBVH.mjs's trianglesInBox (a strict AABB-vs-AABB test) before the per-triangle
        // check below ever runs. Measured live: cy computed as position.y - eyeHeight, with position.y itself
        // computed as an earlier cy + eyeHeight -- 2.7 - 1.7 is 1.0000000000000002 in IEEE 754, not 1.0 --
        // put cy a hair ABOVE a flat surface at y=1.0 on alternating frames, which is enough for lo[1] > the
        // touching triangle's own bounding box top and drop it from the candidate list entirely: `grounded`
        // flickered every other call again, this time from the broad phase rather than the narrow one.
        const skin = CONTACT_SKIN;
        const lo = [cx - radius - skin, cy - skin, cz - radius - skin];
        const hi = [cx + radius + skin, cy + height + skin, cz + radius + skin];
        const tris = bvh.trianglesInBox(lo, hi);

        let deepestPen = -Infinity, deepestNormal = null;
        for (const tri of tris) {
            const [a, b, c] = triAt(bvh, tri);
            const { onSeg, onTri, distSq } = segmentTriangleClosest(segBot, segTop, a, b, c);
            const dist = Math.sqrt(distSq);
            if (dist >= radius + CONTACT_SKIN) continue;
            const pen = radius - dist;   // may be a hair negative, within the skin margin -- that's still a touch
            if (pen > deepestPen) {
                deepestPen = pen;
                // *** THIS USED TO BE dist > 1e-9 ? scale(sub(onSeg, onTri), 1 / dist) : faceNormalToward(...),
                // AND THE CLOSEST-POINT-RELATIVE BRANCH IS WRONG-SIGNED THE MOMENT THE CONTACT POINT ITSELF
                // HAS TUNNELED THROUGH THE SURFACE. *** (onSeg - onTri) / dist assumes onSeg -- the closest
                // point ON THE CAPSULE -- is on the physically expected side of the triangle. A capsule
                // falling fast enough (one frame's gravity integration outrunning a thin floor -- exactly
                // what a real frame hitch on real hardware causes, not a hypothetical) lands its BOTTOM
                // point on the far side, and the vector from the floor up to that now-inverted point points
                // DOWN, not up -- so the "push" moves the capsule FURTHER through the floor, not back out.
                // Measured live, not guessed: a 22-triangle level's flat ground plane (two triangles sharing
                // the query point's exact diagonal seam), a capsule landing at feet.y = -0.48 (segBot 0.08
                // BELOW the plane, radius 0.4) resolved to feet.y = -1.76 over 4 iterations -- each pass
                // pushing DEEPER, not out, because onSeg sat below onTri every time.
                //
                // The capsule's own CENTER (segment midpoint), not the closest contact point, is what
                // orients the push now, unconditionally. It is far more resistant to the same failure: the
                // center is `height/2` from either cap, so it is still on the correct side of a thin surface
                // (a floor, the top of the jump block) even when the capsule's much nearer BOTTOM tip has
                // already tunneled through it. For a WALL, orientation only depends on X/Z (the capsule has
                // no lateral offset along its own axis), so this is IDENTICAL to the old behaviour there --
                // the fix changes only the case it was built to fix.
                deepestNormal = faceNormalToward(a, b, c, cx, cy + midY, cz);
            }
        }
        if (deepestNormal === null) break;   // converged: nothing left in range to resolve

        const push = Math.max(0, Math.min(deepestPen, maxStep));   // a within-skin touch pushes by zero
        cx += deepestNormal[0] * push; cy += deepestNormal[1] * push; cz += deepestNormal[2] * push;
        contacts++;
        if (deepestNormal[1] > groundNormalY) { grounded = true; groundNormal = deepestNormal; }
    }
    return { pos: [cx, cy, cz], grounded, groundNormal, contacts };
}

/**
 * depenetrateCapsule above, held to a FIXED candidate list instead of a live bvh.trianglesInBox() re-query --
 * the CPU twin of physics/character/capsuleCollideTsl.mjs's depenetrateCapsulesNode, which cannot call back to
 * the CPU mid-dispatch and so resolves against ONE fixed list for every iteration (see that file's own header).
 * Exported so every caller that needs the GPU kernel's exact semantics -- tools/ship/capsuleCollideTsl-
 * selfcheck.mjs and tools/roundhouse/capsuleDepenetrateBind.mjs -- shares ONE implementation rather than two or
 * three that could quietly drift apart.
 *
 * Two differences from depenetrateCapsule, both deliberate: (1) `triangles` is a plain array of [a,b,c] vertex
 * triples rather than a bvh + trianglesInBox() query. (2) a no-find iteration is `continue`, not `break` --
 * depenetrateCapsule stops early because a live re-query means a later iteration could only ever find the SAME
 * candidates again once none remain; the fixed-list kernel has no such guarantee against a caller's own list,
 * and this reference stays behaviourally identical to the GPU kernel's own unconditional iteration count, not
 * merely equivalent in the common case.
 *
 * `opts.plantGroundedFlip`: a KNOB plant, not a nudged constant -- flips the grounded comparison from
 * `normal.y > groundNormalY` to `normal.y < groundNormalY`, the exact inversion tools/roundhouse/
 * capsuleDepenetrateBind.mjs's own header sabotage-verifies against. `pos` and `contacts` are BLIND to it (the
 * push itself never reads the comparison), which is the honest thing to say about it up front rather than
 * leave a reader to discover by sweeping every observable.
 */
export function depenetrateCapsuleFixedTris(feet, radius, height, triangles, opts = {}) {
    const { iterations = 4, groundNormalY = GROUND_SUPPORT_NORMAL_Y, maxStepFrac = 0.8, plantGroundedFlip = false } = opts;
    const segLo = radius, segHi = Math.max(radius, height - radius);
    const maxStep = radius * maxStepFrac;
    let cx = feet[0], cy = feet[1], cz = feet[2];
    let grounded = false, contacts = 0;
    const midY = segLo + (segHi - segLo) / 2;
    for (let iter = 0; iter < iterations; iter++) {
        const segBot = [cx, cy + segLo, cz], segTop = [cx, cy + segHi, cz];
        let deepestPen = -Infinity, deepestNormal = null;
        for (const [a, b, c] of triangles) {
            const { distSq } = segmentTriangleClosest(segBot, segTop, a, b, c);
            const dist = Math.sqrt(distSq);
            if (dist >= radius + CONTACT_SKIN) continue;
            const pen = radius - dist;
            if (pen > deepestPen) { deepestPen = pen; deepestNormal = faceNormalToward(a, b, c, cx, cy + midY, cz); }
        }
        if (deepestNormal === null) continue;   // a no-find leaves state unchanged either way -- written as continue,
        const push = Math.max(0, Math.min(deepestPen, maxStep));   // not break, so it is visibly equivalent to the
        cx += deepestNormal[0] * push; cy += deepestNormal[1] * push; cz += deepestNormal[2] * push;   // GPU kernel's own
        contacts++;                                                                                    // no-break, guarded-noop loop
        const grounds = plantGroundedFlip ? deepestNormal[1] < groundNormalY : deepestNormal[1] > groundNormalY;
        if (grounds) grounded = true;
    }
    return { pos: [cx, cy, cz], grounded, contacts };
}

/**
 * The reference's ground check: a center raycast down, falling back to a ring of probes at `ringFrac` of the
 * capsule radius for an edge or gap (a stair nosing, the lip of a platform) a single ray would miss. Returns
 * the nearest STANDABLE hit ({ point, normal, dist }), or null if nothing under the capsule qualifies.
 */
export function probeGround(center, radius, bvh, opts = {}) {
    const { rayUp = 2, maxDist = 5, groundNormalY = GROUND_SUPPORT_NORMAL_Y, ringSamples = 8, ringFrac = 0.85 } = opts;
    const originY = center[1] + rayUp;
    const cast = (x, z) => {
        const hit = bvh.raycastFirst(x, originY, z, 0, -1, 0, rayUp + maxDist);
        if (!hit) return null;
        const [a, b, c] = triAt(bvh, hit.tri);
        const n = faceNormalToward(a, b, c, x, originY, z);
        return { point: hit.point, normal: n, dist: hit.t - rayUp, standable: n[1] > groundNormalY };
    };
    const center0 = cast(center[0], center[2]);
    if (center0 && center0.standable) return center0;
    let best = null;
    for (let i = 0; i < ringSamples; i++) {
        const a = (i / ringSamples) * Math.PI * 2;
        const hit = cast(center[0] + Math.cos(a) * radius * ringFrac, center[2] + Math.sin(a) * radius * ringFrac);
        if (hit && hit.standable && (!best || hit.dist < best.dist)) best = hit;
    }
    return best;
}

// Exported for world/platformCarryWorld.mjs (task #84): it needs the SAME quaternion rotation this file's own
// carryOnPlatform uses, to bake a moving/rotating platform's own triangles into world space each frame -- not
// a second, independently-reinvented rotation function that could quietly disagree with this one.
export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qRotate(q, v) {
    const [qx, qy, qz, qw] = q;
    const tx = 2 * (qy * v[2] - qz * v[1]), ty = 2 * (qz * v[0] - qx * v[2]), tz = 2 * (qx * v[1] - qy * v[0]);
    return [
        v[0] + qw * tx + (qy * tz - qz * ty),
        v[1] + qw * ty + (qz * tx - qx * tz),
        v[2] + qw * tz + (qx * ty - qy * tx),
    ];
}

/**
 * The reference's applyDynamicSupportCarry: carry a rider through a platform's own frame-to-frame position
 * AND rotation delta. `prevXform`/`curXform` are {p:[x,y,z], q:[x,y,z,w]} snapshots of the platform's own
 * transform at the start and end of the frame. Take the rider's offset in the platform's local space as of
 * the PREVIOUS frame, then re-apply that same local offset under the CURRENT frame's transform -- a rider
 * standing still on the platform's own deck stays at the same local point on it through any translation or
 * rotation, exactly as standing on a real moving floor does.
 */
export function carryOnPlatform(pos, prevXform, curXform) {
    const local = qRotate(qConj(prevXform.q), sub(pos, prevXform.p));
    return add(curXform.p, qRotate(curXform.q, local));
}
