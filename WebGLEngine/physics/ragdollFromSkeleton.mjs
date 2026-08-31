// WebGLEngine/physics/ragdollFromSkeleton.mjs -- v4245
//
// DERIVE A RAGDOLL FROM A SKELETON THE ENGINE ACTUALLY LOADED, INSTEAD OF TYPING ONE OUT.
//
// #116 came from sunag/Oimo.js-Lab, and the assessment found nothing to take: that repository's two headline
// features are ragdolls and a BVH, and this tree already has both -- ragdoll.html builds eleven rigid bodies
// and ten joints through box3d, simulation/RagdollDismember.js works on the kaiju's particle skeleton, and
// the BVH shipped at #96 and grew a third query at v4235. Its LICENSE is upstream's ("Copyright (c) 2012-2014
// authors saharan / js version loth"), carried by the fork.
//
// *** WHAT THE ASSESSMENT FOUND INSTEAD WAS A GREP RESULT. *** Every call to jointSpherical, jointRevolute or
// jointWeld in the whole tree comes from ONE file:
//
//     ragdoll.html:175-177
//
// Everything else is a stub returning -1 (planarFallbackWorld.js, freeSpaceWorld.js, joltLoader.js), a
// conformance list (backendConformance.mjs), or a comment. The joint API is real -- vendor/box3d/box3d.wasm
// exports swk_joint_spherical, swk_joint_revolute and swk_joint_weld, and the page's supportsJoints() probe
// is sound -- and it is reachable from exactly one hand-authored demo whose eleven box positions and ten
// joint anchors are TYPED IN as world coordinates.
//
// Meanwhile gpu/SkeletalAnimator.js holds real bone hierarchies from real GLBs. Nothing connects them.
//
// ---- THE DERIVATION, AND THE ONE PLACE IT CANNOT BE DERIVED --------------------------------------------------
//
// A bone is a point plus a rotation; a RIGID BODY is a volume. The volume comes from the bone's SEGMENT --
// from its own head to its child's head -- which is why a ragdoll body sits BETWEEN two joints rather than at
// one. That makes the joint anchor free: it is the shared point, the child's head, and it is the same point
// the two bodies were both measured from. Nothing is typed.
//
// *** EXCEPT FOR A LEAF. *** A hand, a foot or a head has no child, so it has no segment and no length, and
// the derivation runs out. Something has to decide how long a hand is, and no amount of hierarchy walking
// will produce it. This file uses a fraction of the PARENT's length along the bone's own axis, declares that
// as LEAF_FACTOR, and the gate measures what changes when it moves -- because a guess that is measured is a
// different thing from a guess that is hidden.
//
// ---- AND THE CONVERSE, WHICH IS THE HALF THAT MAKES IT USEFUL ------------------------------------------------
//
// "Switch to ragdoll" is not what a hit reaction is. A hit reaction is a per-bone weight ramping from the
// animated pose toward the simulated one and back, so a character staggers and recovers rather than dropping
// like a bag. Nothing in this tree blends the two. blendPose() is that, and the gate checks the properties
// that make a blend a blend -- endpoints exact, monotone in between -- rather than that it looks right.
"use strict";
import { hierarchyOrder, worldPositions, worldRotations, restRotations, restTranslations, qMul, qConj, qAngle }
    from "../anim/retarget.mjs";
import { normaliseBoneName } from "../anim/retarget.mjs";
import { _quatSlerp } from "../rig/rigMath.js";

/** How long a leaf bone is, as a fraction of its parent's length. THE ONE NUMBER THAT IS NOT DERIVED. */
export const LEAF_FACTOR = 0.5;

/** How thick a limb is, as a fraction of its own length. Also a choice, also declared. */
export const RADIUS_FACTOR = 0.18;

/**
 * Every bone as a SEGMENT: where it starts, where it ends, and whether that end was derived or guessed.
 *
 * A bone with several children takes the FIRST as its tail. That is a real limitation and it is the pelvis
 * case -- a pelvis has a spine and two legs, and its "segment" is then the spine's. Reported by the gate
 * rather than papered over.
 */
export function boneSegments(nodes) {
    const ord = hierarchyOrder(nodes);
    const P = worldPositions(nodes, restRotations(nodes), restTranslations(nodes), ord);
    const W = worldRotations(nodes, restRotations(nodes), ord);
    const firstChild = new Array(nodes.length).fill(-1);
    const childCount = new Array(nodes.length).fill(0);
    nodes.forEach((n, i) => {
        if (n.parent >= 0) {
            childCount[n.parent]++;
            if (firstChild[n.parent] === -1) firstChild[n.parent] = i;
        }
    });
    const segs = [];
    for (let i = 0; i < nodes.length; i++) {
        const head = P[i];
        const c = firstChild[i];
        let tail, derived = true, len;
        if (c >= 0) {
            tail = P[c];
            len = Math.hypot(tail[0] - head[0], tail[1] - head[1], tail[2] - head[2]);
        } else {
            // *** THE LEAF. *** No child, so no measurable length. Take the parent's length, scaled, along
            // this bone's own local +X -- the axis a bone's translation is expressed in for these rigs.
            const p = nodes[i].parent;
            const plen = p >= 0 ? Math.hypot(head[0] - P[p][0], head[1] - P[p][1], head[2] - P[p][2]) : 1;
            len = plen * LEAF_FACTOR;
            const q = W[i];
            const dir = rotateX(q);
            tail = [head[0] + dir[0] * len, head[1] + dir[1] * len, head[2] + dir[2] * len];
            derived = false;
        }
        segs.push({ index: i, name: nodes[i].name, head, tail, length: len, derived, children: childCount[i] });
    }
    return segs;
}

/** The bone's own +X axis in world space -- the direction a limb points for a rig built this way. */
function rotateX(q) {
    const t = qMul(qMul(q, [1, 0, 0, 0]), qConj(q));
    return [t[0], t[1], t[2]];
}

/**
 * A rigid body per bone.
 *
 * *** THE OBVIOUS VERSION OF THIS IS WRONG, AND THE GATE MEASURED IT BEFORE THIS COMMENT WAS WRITTEN. *** A
 * box spanning head-to-tail is the natural answer and it puts FOUR OF TEN JOINT ANCHORS OUTSIDE THE BODY
 * THEY ATTACH TO on an ordinary humanoid: both shoulders and both hips. The cause is that a bone with several
 * children has only one tail -- a pelvis's segment runs to the spine, so the hips, which hang off its sides,
 * are nowhere near it. The solver then pulls on a point the box does not contain, which is a lever arm
 * nobody chose.
 *
 * So a body is the box enclosing every point it must REACH: its own head, its tail, and the head of EVERY
 * child. That is what makes ragdoll.html's chest and pelvis wide, done there by typing the numbers.
 *
 * *** AND v4248 RAN THE SIMULATION THIS ARGUMENT IS ABOUT, AND DID NOT CONFIRM IT. *** Three instruments
 * were tried against the naive bodies in a real box3d world: joint separation (the naive graph is TIGHTER
 * at rest), settling asymmetry after a drop (1.7x a chaos floor of 0.46 m, which is not a signal), and
 * settling asymmetry hanging from a pinned pelvis, where the floor is 9.5e-7 m and the two derivations
 * come out 0.0285 against 0.0286 -- indistinguishable. The enclosing box is not shown to be WRONG, and
 * it is no longer shown to be BETTER either. What the argument actually describes is a COLLISION VOLUME:
 * a body that does not reach its own joint leaves that region uncovered, so limbs pass through where a
 * torso should be. That is a contact question and nothing has measured it.
 *
 * Mass is proportional to VOLUME, so a thigh outweighs a forearm without anyone choosing a number.
 */
export function bodiesFromSegments(segs, density = 1000, attach = null) {
    return segs.map((s) => {
        const r = Math.max(1e-4, s.length * RADIUS_FACTOR);
        const pts = [s.head, s.tail, ...((attach && attach[s.index]) || [])];
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
        const pos = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
        const half = [0, 1, 2].map((k) => (hi[k] - lo[k]) / 2 + r);
        const volume = 8 * half[0] * half[1] * half[2];
        return { bone: s.index, name: s.name, pos, half, mass: volume * density, length: s.length,
                 reaches: pts.length };
    });
}

/** The points each bone's body must contain: the heads of all its children. */
export function attachPoints(nodes, segs) {
    const out = nodes.map(() => []);
    nodes.forEach((n, i) => { if (n.parent >= 0) out[n.parent].push(segs[i].head); });
    return out;
}

/**
 * *** WHAT KIND OF JOINT IS THIS? *** Read off the bone's role, which is read off its name.
 *
 * Deliberately a small table and deliberately NOT clever: an elbow and a knee bend one way and stop, a
 * shoulder and a hip rotate every way inside a cone, and everything else is a weld with give. A bone the
 * table does not recognise gets a WELD, which is the conservative answer -- a joint that is too stiff looks
 * wrong, and a joint that is too free puts a knee through a shin.
 */
export const JOINT_TABLE = Object.freeze([
    { match: /elbow|forearm|lowerarm/, type: "revolute", axis: [0, 0, 1], limit: [0, 145] },
    { match: /knee|shin|calf|lowerleg/, type: "revolute", axis: [1, 0, 0], limit: [-145, 0] },
    { match: /shoulder|upperarm/, type: "spherical", axis: [-1, 0, 0], limit: 90 },
    { match: /hip|thigh|upperleg/, type: "spherical", axis: [0, -1, 0], limit: 60 },
]);

export function classifyJoint(boneName) {
    const k = normaliseBoneName(boneName);
    for (const r of JOINT_TABLE) if (r.match.test(k)) return { type: r.type, axis: r.axis, limit: r.limit };
    return { type: "weld", axis: null, limit: null, hertz: 8, damping: 0.5 };
}

/**
 * The joint graph: one joint per parent link, ANCHORED AT THE CHILD'S HEAD.
 *
 * That anchor is the whole reason this is a derivation and not a transcription. The child's head is the point
 * the parent's segment ends at and the child's segment begins at, so both bodies were measured from it and
 * the anchor cannot drift from the geometry. In ragdoll.html it is a typed-in world coordinate that has to be
 * kept in step with eleven typed-in box positions by hand.
 */
export function jointsFromSegments(nodes, segs) {
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i].parent;
        if (p < 0) continue;
        const c = classifyJoint(nodes[i].name);
        out.push({
            name: nodes[i].name, parentBone: p, childBone: i,
            anchor: [...segs[i].head],
            type: c.type, axis: c.axis, limit: c.limit,
        });
    }
    return out;
}

/** The whole thing, from a skeleton to something the box3d joint API can be handed. */
export function ragdollFromSkeleton(nodes, opts = {}) {
    const segs = boneSegments(nodes);
    const attach = attachPoints(nodes, segs);
    return {
        segments: segs,
        bodies: bodiesFromSegments(segs, opts.density ?? 1000, attach),
        joints: jointsFromSegments(nodes, segs),
    };
}

/**
 * *** BLEND THE SIMULATED POSE BACK INTO THE ANIMATED ONE, PER BONE. ***
 *
 * A hit reaction is not a switch. It is a weight per bone: 0 keeps the animation, 1 hands the bone to the
 * solver, and the interesting values are in between and moving. Rotations are slerped, because a linear blend
 * of quaternions leaves the unit sphere and shortens the bone -- the same scale dip SkeletalAnimator's round
 * 292 note records for its own matrix lerp.
 *
 * @param weights number, or an array of one weight per bone
 */
export function blendPose(animLocal, physLocal, weights) {
    const out = new Array(animLocal.length);
    for (let i = 0; i < animLocal.length; i++) {
        const w = Math.max(0, Math.min(1, typeof weights === "number" ? weights : (weights[i] ?? 0)));
        if (w === 0) { out[i] = [...animLocal[i]]; continue; }
        if (w === 1) { out[i] = [...physLocal[i]]; continue; }
        const t = new Float32Array(4);
        _quatSlerp(Float32Array.from(animLocal[i]), Float32Array.from(physLocal[i]), w, t);
        out[i] = [t[0], t[1], t[2], t[3]];
    }
    return out;
}

/** How far a blended pose sits from each end, in radians. The gate's monotonicity is read off this. */
export function blendDistance(animLocal, physLocal, blended) {
    let toAnim = 0, toPhys = 0;
    for (let i = 0; i < blended.length; i++) {
        toAnim = Math.max(toAnim, qAngle(blended[i], animLocal[i]));
        toPhys = Math.max(toPhys, qAngle(blended[i], physLocal[i]));
    }
    return { toAnim, toPhys };
}
