// WebGLEngine/anim/retarget.mjs -- v4244
//
// PLAY A CLIP AUTHORED FOR ONE SKELETON ON A DIFFERENT SKELETON.
//
// The idea is sunag/three.js-tba (MIT, 2025), which is two things: a binary animation container claiming
// ~84% off JSON, and retargeting. The container is REFUSED -- v4228 gave six of this tree's own formats a
// versioned magic through engine/binaryHeader.mjs and a seventh container is the least interesting thing
// available. The retargeting is the part the tree cannot do at all.
//
// ---- WHAT WAS ALREADY HERE, AND WHY IT IS NOT THIS ----------------------------------------------------------
//
// gpu/SkeletalAnimator.js is 1,216 lines with TRS composition, quaternion slerp, look-at, two-bone IK and
// FABRIK. It is a deep animation stack. What it cannot do is play a clip authored against skeleton A on
// skeleton B. rig/RigSystem.js:752 uses the word "retargeted", but attachEntityRig binds a rig to a MESH --
// it needs JOINTS_0/WEIGHTS_0 and a skin -- and does not map one skeleton's channels onto another's. There
// is no bone-name table anywhere in the tree: nothing says that this rig's "upper arm" is that rig's
// "UpperArm.L".
//
// ---- THE THREE THINGS THAT MAKE IT HARD, AND ONLY ONE OF THEM IS THE OBVIOUS ONE ----------------------------
//
// 1. NAMES. Rigs disagree about spelling, separators, case and prefixes. Cheap to fix and not the interesting
//    part, but it has to happen first or nothing else can be measured.
//
// 2. *** REST POSES. THIS IS THE ONE THAT BREAKS THE NAIVE ANSWER. *** A clip does not store "where the arm
//    is". It stores a bone's LOCAL rotation, which only means something relative to the rest pose it was
//    authored against. Copy a T-pose clip's quaternions onto an A-pose rig and every bone is wrong by the
//    angle between the two rest poses -- the arms end up below the floor, and nothing in the data looks
//    malformed. The gate measures that error rather than describing it.
//
//    The fix is to transfer the DELTA FROM REST, in WORLD space, and convert back to local afterwards:
//
//        D(b)          = Ws_anim(b) * inverse(Ws_rest(b))        the rotation the source bone underwent
//        Wt_anim(b)    = D(b) * Wt_rest(b)                       the same rotation applied to the target
//        Rt_local(b)   = inverse(Wt_anim(parent)) * Wt_anim(b)   back to the local frame the animator wants
//
//    Doing it in world space is what makes it survive bones whose LOCAL AXES differ, which is the usual case
//    between two rigs from different tools and is invisible in the local-space formulation.
//
// 3. BONE LENGTHS. Rotations carry over unchanged -- an elbow bent 40 degrees is bent 40 degrees on any arm.
//    ROOT TRANSLATION DOES NOT. A walk authored for a 1.8 m skeleton, replayed unscaled on a 1.2 m one, moves
//    the small skeleton the tall one's distance per step and the feet slide. The scale is a ratio of skeleton
//    heights, and the gate measures the slide with and without it instead of asserting the ratio is right.
//
// A bone present in the source and absent in the target is DROPPED, and dropping it is correct -- there is
// nowhere to put it. A bone present in the target and absent in the source KEEPS ITS REST POSE, which is also
// correct and is the case that silently produces a limp twist bone if you forget it. Both are reported by
// name rather than counted, because "3 bones unmapped" is not something a caller can act on.
"use strict";
import { _quatMul } from "../rig/rigMath.js";

/** Conjugate of a unit quaternion, which for a rotation is its inverse. */
export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];

/** Wrapper over rigMath's offset-based multiply, so this file reads in plain arrays. */
export function qMul(a, b) {
    const out = new Float32Array(4);
    _quatMul(a, 0, b, 0, out, 0);
    return [out[0], out[1], out[2], out[3]];
}

/** Rotate a vector by a quaternion: q * (v,0) * q'. */
export function qRot(q, v) {
    const t = qMul(qMul(q, [v[0], v[1], v[2], 0]), qConj(q));
    return [t[0], t[1], t[2]];
}

/** The angle between two rotations, in radians -- the number every comparison below reports. */
export function qAngle(a, b) {
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, d));
}

/**
 * *** NAME NORMALISATION, WHICH IS DELIBERATELY DUMB. ***
 *
 * Strips a tool prefix ("mixamorig:Hips"), lowercases, and removes separators, so Upper_Arm_L, upperArm.L and
 * mixamorig:UpperArmL all land on "upperarml". It does NOT try to understand anatomy: "left arm" and "arm
 * left" stay different, and a rig that calls the same bone "bone_014" is beyond it. That limit is the point --
 * a mapper that guesses is worse than one that reports what it could not match.
 */
export function normaliseBoneName(n) {
    return String(n || "").replace(/^[A-Za-z0-9]+:/, "").toLowerCase().replace(/[\s._\-]/g, "");
}

/**
 * Match bones between two skeletons by normalised name.
 * Returns the map plus BOTH unmatched lists by name, because which side a bone is missing from decides what
 * happens to it.
 */
export function autoMap(srcNodes, dstNodes) {
    const byName = new Map();
    dstNodes.forEach((n, j) => {
        const k = normaliseBoneName(n.name);
        if (k && !byName.has(k)) byName.set(k, j);
    });
    const map = new Map();
    const unmatchedSrc = [];
    const usedDst = new Set();
    srcNodes.forEach((n, i) => {
        const j = byName.get(normaliseBoneName(n.name));
        if (j === undefined) unmatchedSrc.push(n.name);
        else { map.set(i, j); usedDst.add(j); }
    });
    const unmatchedDst = dstNodes.filter((_, j) => !usedDst.has(j)).map((n) => n.name);
    return { map, unmatchedSrc, unmatchedDst };
}

/** Parent-before-child ordering, so a world transform can be built in one pass. */
export function hierarchyOrder(nodes) {
    const out = [], seen = new Set();
    const visit = (i) => {
        if (seen.has(i)) return;
        const p = nodes[i].parent;
        if (p >= 0) visit(p);
        seen.add(i); out.push(i);
    };
    nodes.forEach((_, i) => visit(i));
    return out;
}

/** World-space rotation of every bone, from its local rotations. Rest pose if you pass the rest locals. */
export function worldRotations(nodes, locals, order = null) {
    const ord = order || hierarchyOrder(nodes);
    const W = new Array(nodes.length);
    for (const i of ord) {
        const p = nodes[i].parent;
        const l = locals[i];
        W[i] = p >= 0 ? qMul(W[p], l) : [l[0], l[1], l[2], l[3]];
    }
    return W;
}

/** World-space POSITION of every bone, which is what a bone length or a foot slide is measured from. */
export function worldPositions(nodes, locals, trans, order = null) {
    const ord = order || hierarchyOrder(nodes);
    const W = new Array(nodes.length), P = new Array(nodes.length);
    for (const i of ord) {
        const p = nodes[i].parent, l = locals[i], t = trans[i];
        if (p >= 0) {
            W[i] = qMul(W[p], l);
            const r = qRot(W[p], t);
            P[i] = [P[p][0] + r[0], P[p][1] + r[1], P[p][2] + r[2]];
        } else {
            W[i] = [l[0], l[1], l[2], l[3]];
            P[i] = [t[0], t[1], t[2]];
        }
    }
    return P;
}

/** The rest local rotations / translations a skeleton was authored with. */
export const restRotations = (nodes) => nodes.map((n) => [n.rotation[0], n.rotation[1], n.rotation[2], n.rotation[3]]);
export const restTranslations = (nodes) => nodes.map((n) => [n.translation[0], n.translation[1], n.translation[2]]);

/**
 * *** THE NAIVE ANSWER, WRITTEN OUT SO IT CAN BE MEASURED RATHER THAN WARNED ABOUT. ***
 * Copy the source's local rotations straight across. Correct if and only if the two rest poses are identical
 * and the bones' local axes agree -- and it looks entirely reasonable in the data either way.
 */
export function retargetNaive(srcNodes, dstNodes, map, srcAnimLocal) {
    const out = restRotations(dstNodes);
    for (const [i, j] of map) out[j] = [...srcAnimLocal[i]];
    return out;
}

/**
 * *** THE REAL ONE: transfer the delta from rest, in world space. ***
 *
 * Unmapped TARGET bones keep their rest local rotation, so a twist bone the source never had stays where the
 * artist put it rather than collapsing to identity.
 */
export function retargetPose(srcNodes, dstNodes, map, srcAnimLocal) {
    const srcRest = restRotations(srcNodes), dstRest = restRotations(dstNodes);
    const srcOrd = hierarchyOrder(srcNodes), dstOrd = hierarchyOrder(dstNodes);
    const WsRest = worldRotations(srcNodes, srcRest, srcOrd);
    const WsAnim = worldRotations(srcNodes, srcAnimLocal, srcOrd);
    const WtRest = worldRotations(dstNodes, dstRest, dstOrd);

    const srcOf = new Map();
    for (const [i, j] of map) srcOf.set(j, i);

    const WtAnim = new Array(dstNodes.length);
    const out = new Array(dstNodes.length);
    for (const j of dstOrd) {
        const i = srcOf.get(j);
        if (i === undefined) {
            // No source bone: keep the rest LOCAL rotation, and let it ride on whatever its parent now does.
            const p = dstNodes[j].parent;
            WtAnim[j] = p >= 0 ? qMul(WtAnim[p], dstRest[j]) : [...dstRest[j]];
            out[j] = [...dstRest[j]];
            continue;
        }
        const D = qMul(WsAnim[i], qConj(WsRest[i]));       // what the source bone actually did
        WtAnim[j] = qMul(D, WtRest[j]);                     // the same thing, done to the target's rest
        const p = dstNodes[j].parent;
        out[j] = p >= 0 ? qMul(qConj(WtAnim[p]), WtAnim[j]) : [...WtAnim[j]];
    }
    return out;
}

/**
 * The height of a skeleton in its rest pose: the vertical span of its bone positions.
 * Crude on purpose -- a named "head" bone would be better and would need the anatomy this file refuses to
 * guess at. The gate reports the ratio it derives so a caller can override it.
 */
export function restHeight(nodes) {
    const P = worldPositions(nodes, restRotations(nodes), restTranslations(nodes));
    let lo = Infinity, hi = -Infinity;
    for (const p of P) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
    return hi - lo;
}

/** The factor a root translation must be multiplied by so a step lands where the target's legs can reach. */
export function rootScale(srcNodes, dstNodes) {
    const hs = restHeight(srcNodes), hd = restHeight(dstNodes);
    return hs > 1e-9 ? hd / hs : 1;
}

/**
 * *** FOOT SLIDE: the number that says whether the root scale was right. ***
 *
 * A planted foot should not move. Sample the clip, take the world position of the foot bone at each frame,
 * and report how far it travels while it is meant to be planted. Scaling the root by the height ratio should
 * cut this; NOT scaling it leaves the target dragged along at the source's stride.
 */
export function footSlide(nodes, frames, footIdx) {
    let worst = 0;
    let prev = null;
    for (const f of frames) {
        const P = worldPositions(nodes, f.locals, f.trans);
        const p = P[footIdx];
        if (prev) worst = Math.max(worst, Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]));
        prev = p;
    }
    return worst;
}
