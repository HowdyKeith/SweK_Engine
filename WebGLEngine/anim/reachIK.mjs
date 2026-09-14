// WebGLEngine/anim/reachIK.mjs -- v1 (task #40)
//
// *** THE ORCHESTRATION LAYER anim/ik.mjs's OWN HEADER SAYS IS MISSING. *** Its words, quoted directly:
// "THE TREE CAN PLAY A POSE ON A SECOND SKELETON AND IT CAN MAKE ONE GO LIMP. IT CANNOT PUT A HAND ON A
// DOORKNOB." And tools/ship/ik-selfcheck.mjs's own closing line: "nothing converts a solved point chain
// back into the LOCAL rotations a skeleton is posed with -- so the footSlide this was built to remove has
// not been removed, only made removable." This file is that conversion, plus the target-selection and
// chain-extraction either side of it needs to be useful.
//
// ---- WHAT THIS DOES NOT ADD: A NEW SOLVER -------------------------------------------------------------------
//
// Every angle and every solved point in this file comes from anim/ik.mjs's already-gated math
// (twoBoneAngles, fabrik, ccd, chainLengths, bestError) or anim/retarget.mjs's already-gated forward-
// kinematics walk (hierarchyOrder, worldPositions, worldRotations, qMul, qConj) -- the same FK code
// v4244's retargeting and this file's own write-back both need, so it is reused rather than re-derived a
// third time. The only genuinely new math here is quatFromTo(), a standard "rotate this unit vector onto
// that one" construction with no free parameters -- not a solver, an alignment primitive every quaternion
// IK write-back needs and anim/retarget.mjs had no reason to export.
//
// ---- A SECOND IK STACK ALREADY EXISTED, UNDER DIFFERENT NAMES ----------------------------------------------
//
// gpu/SkeletalAnimator.js -- independently of anim/ik.mjs, and BEFORE it (round 293 vs v4253) -- already
// has setTwoBoneIK/_applyTwoBoneIK and setFabrikIK/_applyFabrik: its own closed-form two-bone solve, its
// own FABRIK, and a live pose-constraint pipeline (setLookAt/setTwoBoneIK/setFabrikIK all push onto
// this._poseConstraints, run once per update() AFTER clip sampling and BEFORE world-matrix compose,
// blended by a `weight` that slerps from identity). simulation/KaijuIK.js wires setTwoBoneIK into real
// gameplay (arm-aim at a ranged-attack target) TODAY. anim/retarget.mjs's own header (v4244, written
// before anim/ik.mjs) says so explicitly: "gpu/SkeletalAnimator.js is 1,216 lines with TRS composition,
// quaternion slerp, look-at, two-bone IK and FABRIK." anim/ik.mjs's header (v4253) says it grepped for
// "FABRIK, ccdIK, solveIK, inverseKinematic" and found nothing -- true of those exact strings, but
// SkeletalAnimator's names are "Fabrik" and "TwoBoneIK" (different case, different word), so the grep and
// the code silently missed each other. anim/ik.mjs's MATH is still independently derived (its header's "no
// line is taken from ossos" claim is unaffected -- SkeletalAnimator's solver isn't ossos's either), so
// there is nothing to un-write; but "nothing anywhere solved the inverse" is not quite true, and the
// honest fix is to say so here rather than let a second grep-blind-spot compound a first one.
//
// THIS FILE DELIBERATELY DOES NOT CALL SkeletalAnimator's _applyTwoBoneIK/_applyFabrik. The task this file
// answers is explicit that the write-back must go through anim/ik.mjs's OWN gated solver, not a third
// reimplementation -- and SkeletalAnimator's version, while it works and is production-wired, has never
// been graded against the closed form the way tools/ship/ik-selfcheck.mjs grades anim/ik.mjs. What IS
// reused from SkeletalAnimator is its live INTEGRATION POINT: this file adds one small additive public
// method, addConstraint(), so a reachIK constraint can register into the exact same _poseConstraints
// pipeline setTwoBoneIK/setFabrikIK already use -- composing with a playing clip through a mechanism this
// tree already ships and gameplay already depends on, rather than inventing a second one.
//
// ---- WHY twoBoneAngles ALONE CANNOT PLACE POINTS, AND WHAT THAT MEANS HERE -----------------------------------
//
// twoBoneAngles(l1, l2, D) returns two SCALAR angles -- the geometry of a triangle is fixed by three side
// lengths, but the triangle's ORIENTATION in 3-space (which way the elbow points) is not one of them. That
// is deliberate on anim/ik.mjs's part (see its own docstring), and turning those two angles into an actual
// 3-D pose needs a caller-supplied convention for the missing degree of freedom -- a "pole vector".
// gpu/SkeletalAnimator.js's setTwoBoneIK invents one (poleVector option, defaulting to the CURRENT mid-bone
// direction). Rather than inventing a second pole-vector convention here, solveChain() below calls
// anim/ik.mjs's fabrik() (or ccd()) to do the actual point placement for every chain length INCLUDING two
// bones -- fabrik already resolves the missing degree of freedom the same way SkeletalAnimator's default
// does (it starts from and preserves the CURRENT chain's plane) and tools/ship/ik-selfcheck.mjs's own
// section 1 already proves fabrik's placement agrees with twoBoneAngles' closed-form joint angle to under
// 1e-5 rad. solveChain() re-derives that same closed-form angle from the CURRENT chain's measured bone
// lengths and reports it alongside the solved points, and tools/ship/reachIK-selfcheck.mjs's own section 4
// checks the realized angle against it on a live rig -- so twoBoneAngles is genuinely exercised as the
// closed-form CHECK the two-bone case is graded against, exactly the role it already plays in
// tools/ship/ik-selfcheck.mjs, without this file re-inventing the embedding twoBoneAngles leaves open.
//
// ---- COORDINATE SPACE: READ THIS BEFORE PASSING A "WORLD-SPACE" POINT ----------------------------------------
//
// Everything below operates in the skeleton's own local/"model" space -- the space gpu/SkeletalAnimator.js
// computes nodeMatrices and jointMatrices in, walking from its roots with an IDENTITY parent matrix
// (SkeletalAnimator.js's update(), "2. Walk hierarchy -> world matrices", _composeNode(rootIdx,
// IDENTITY_MAT4)). render/EntityMeshRenderer.js's vertex shader applies an ADDITIONAL per-entity
// yaw/tilt/roll/scale/offset AFTER skinning (see its VS, "Round 53 -- yaw + tilt rotation" through the
// final `+ aOffset`) -- so a point that is genuinely world-space in the SCENE (a doorknob's actual
// position) is only equal to a bone's "world" position AS THIS FILE AND SkeletalAnimator.js BOTH USE THE
// TERM if that entity sits at the origin with identity rotation and unit scale. A caller with a real scene-
// world target and a placed entity must invert that entity's yaw/tilt/roll/scale/offset into model space
// before calling reachTowards, and map the result back afterwards. THIS FILE DOES NOT DO THAT CONVERSION.
// Named here because it is easy to miss: simulation/KaijuIK.js's existing _tryWireArm has the SAME gap
// already, silently -- its getTarget returns a raw scene-world attack-target position straight into
// SkeletalAnimator.setTwoBoneIK, which consumes it as model space. That is a pre-existing gap in the tree,
// not one introduced here, and out of this file's scope to fix (KaijuIK.js is gameplay wiring, not the
// skeleton/IK layer this task is about) -- but a caller of THIS file should not assume it is solved either.
//
// ---- WHAT IS NOT HERE, STATED PLAINLY ---------------------------------------------------------------------
//
//   * NO AUTOMATIC TARGET-TO-LIMB INFERENCE. resolveChain/reachTowards take an explicit bone-name chain
//     (or a CHAIN_PRESETS key). Deciding "the right hand is closer to the doorknob than the left" from a
//     bare world point and a whole skeleton is a reasonable stretch goal and was not attempted this round.
//   * NO CONTINUOUS EASE-IN/OUT OF THE IK WEIGHT OVER TIME. `weight` blends ONE CALL's solved pose toward
//     the chain's current local rotations (0 = untouched, 1 = fully overridden, between = slerped) --
//     genuinely tested below, not a stub -- but it is not itself animated across frames; a caller wanting a
//     smooth ramp-in as a hand approaches a doorknob must vary `weight` call-to-call itself.
//   * NO MULTI-LIMB / MULTI-TARGET COORDINATION. Each reachTowards() call solves one chain independently;
//     two calls whose chains share a bone (e.g. two "chains" both rooted at the spine) will fight, last
//     write wins, same as two independent SkeletalAnimator pose constraints touching the same bone would.
//   * NO COLLISION AVOIDANCE, NO JOINT LIMITS WIRED IN. anim/ik.mjs exports clampJointAngle for exactly
//     the angle-limit half of this; this file does not call it automatically. A caller can post-process
//     solveChain()'s output through it before writeBackChain() if a rig needs it.
//   * ON A REDUNDANT (>2-bone) CHAIN, THE SPECIFIC CONFIGURATION FABRIK/CCD CHOOSE IS NOT CONTROLLED HERE
//     -- tools/ship/ik-selfcheck.mjs's own section 4 already measured fabrik and ccd disagreeing by over
//     0.1 m on a redundant 4-bone chain while both still reach the target, and calls that CORRECT (more
//     joints than constraints means more than one valid pose). Nothing added here changes that.
"use strict";
import { chainLengths, dist, fabrik, ccd, twoBoneAngles, bestError } from "./ik.mjs";
import { qMul, qConj, hierarchyOrder, worldPositions, worldRotations } from "./retarget.mjs";

const IDQ = [0, 0, 0, 1];

function normVec(v) {
    const L = Math.hypot(v[0], v[1], v[2]);
    return L > 1e-12 ? [v[0] / L, v[1] / L, v[2] / L] : [0, 0, 0];
}

function toVec3(t) {
    if (!t) return null;
    if (Array.isArray(t) || t.length === 3) return [t[0], t[1], t[2]];
    if ("x" in t) return [t.x, t.y, t.z];
    return null;
}

/**
 * Quaternion carrying unit vector `from` onto unit vector `to` (xyzw). The one alignment primitive this
 * write-back needs that anim/retarget.mjs does not already export -- everything else here routes through
 * its qMul/qConj. Antiparallel inputs (180 degrees) pick an arbitrary perpendicular axis, same convention
 * gpu/SkeletalAnimator.js's own private _quatFromToVec3 uses for the same degenerate case.
 */
export function quatFromTo(from, to) {
    const f = normVec(from), t = normVec(to);
    const d = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];
    if (d > 0.999999) return [0, 0, 0, 1];
    if (d < -0.999999) {
        const ax = Math.abs(f[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const axis = normVec([f[1] * ax[2] - f[2] * ax[1], f[2] * ax[0] - f[0] * ax[2], f[0] * ax[1] - f[1] * ax[0]]);
        return [axis[0], axis[1], axis[2], 0];
    }
    const c = [f[1] * t[2] - f[2] * t[1], f[2] * t[0] - f[0] * t[2], f[0] * t[1] - f[1] * t[0]];
    const s = Math.sqrt((1 + d) * 2), inv = 1 / s;
    return [c[0] * inv, c[1] * inv, c[2] * inv, s * 0.5];
}

/** Spherical linear interpolation, xyzw, same shortest-path/near-parallel handling as every other slerp
 *  in this tree (gpu/SkeletalAnimator.js's private _quatSlerp, rig/rigMath.js's _quatSlerp) -- not shared
 *  code with either because neither is exported, but the same well-known formula, not a fourth invention. */
function slerp(a, b, u) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) { bb = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
    if (d > 0.9995) {
        const o = [a[0] + (bb[0] - a[0]) * u, a[1] + (bb[1] - a[1]) * u, a[2] + (bb[2] - a[2]) * u, a[3] + (bb[3] - a[3]) * u];
        const L = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
        return [o[0] / L, o[1] / L, o[2] / L, o[3] / L];
    }
    const th0 = Math.acos(Math.max(-1, Math.min(1, d))), th = th0 * u, s0 = Math.sin(th0);
    const s1 = Math.sin(th0 - th) / s0, s2 = Math.sin(th) / s0;
    return [a[0] * s1 + bb[0] * s2, a[1] * s1 + bb[1] * s2, a[2] * s1 + bb[2] * s2, a[3] * s1 + bb[3] * s2];
}

/**
 * *** TARGET SELECTION, THE PART THIS ROUND SCOPES TO EXPLICIT NAMING. *** `boneNames` is root-to-end
 * order (e.g. ["shoulder_r", "arm_r", "claw_r"], matching rig/templates/kaijuBiped.js's own convention);
 * entries may be node indices instead of names. Verifies the chain is a real parent chain in `nodes`
 * (each bone the previous one's child) -- a caller passing two unrelated bones gets a named error, not a
 * pose solved against a chain that was never a chain.
 */
export function resolveChain(nodes, boneNames) {
    const indices = boneNames.map((b) => (typeof b === "number" ? b : nodes.findIndex((n) => n.name === b)));
    const missing = boneNames.filter((b, i) => indices[i] < 0 || indices[i] >= nodes.length);
    if (missing.length) return { ok: false, error: "bone(s) not found: " + missing.join(", "), indices: null };
    for (let i = 1; i < indices.length; i++) {
        if (nodes[indices[i]].parent !== indices[i - 1]) {
            return {
                ok: false, indices: null,
                error: `"${boneNames[i]}" (node ${indices[i]}) is not a child of "${boneNames[i - 1]}" ` +
                       `(node ${indices[i - 1]}) -- parent is node ${nodes[indices[i]].parent}, not a parent chain`,
            };
        }
    }
    if (indices.length < 2) return { ok: false, error: "a chain needs at least 2 bones to have a joint to solve", indices: null };
    return { ok: true, indices, error: null };
}

/** Named shortcuts matching rig/templates/kaijuBiped.js's bone ids. NOT limb inference -- see header --
 *  just spares spelling the array out for the common biped case. */
export const CHAIN_PRESETS = {
    arm_r: ["shoulder_r", "arm_r", "claw_r"],
    arm_l: ["shoulder_l", "arm_l", "claw_l"],
    leg_r: ["thigh_r", "shin_r", "foot_r"],
    leg_l: ["thigh_l", "shin_l", "foot_l"],
};

/**
 * *** CHAIN EXTRACTION. *** World-space (== model-space, see header) positions AND rotations for EVERY
 * node, from the CURRENT local T/R -- via anim/retarget.mjs's own FK walk (hierarchyOrder/worldPositions/
 * worldRotations), not a re-derivation. Full hierarchy, not just the requested chain, because the chain's
 * own root bone's position/rotation still depends on whatever is above it (a shoulder depends on the
 * torso). This is what turns "the live skeleton's current pose" into the `points` array
 * twoBoneAngles/fabrik/ccd need -- called fresh every time so it reads whatever pose the animator is
 * CURRENTLY in (mid-clip, mid-blend, already-idle-swayed), never a cached rest pose.
 */
export function extractPose(nodes, localR, localT) {
    const order = hierarchyOrder(nodes);
    return { P: worldPositions(nodes, localR, localT, order), W: worldRotations(nodes, localR, order), order };
}

/**
 * *** THE SOLVE STEP. *** Calls anim/ik.mjs's OWN gated fabrik()/ccd() to place points -- no solver math
 * of any kind lives in this file. `opts.solver` selects "ccd" (default "fabrik"); every other opts field
 * passes straight through to it (tol, maxIter, lengths). For a 2-bone chain the realized joint angle is
 * additionally checked against anim/ik.mjs's twoBoneAngles() closed form -- see header for why that is a
 * cross-check rather than the placement method.
 */
export function solveChain(points, target, opts = {}) {
    const solver = opts.solver === "ccd" ? ccd : fabrik;
    const lengths = chainLengths(points);
    const result = solver(points, target, opts);
    const D = dist(points[0], target);
    const out = { ...result, lengths, reachError: bestError(lengths, D) };
    if (points.length === 3) {
        const Dclamped = Math.min(lengths[0] + lengths[1], D);
        out.twoBone = twoBoneAngles(lengths[0], lengths[1], Dclamped);
    }
    return out;
}

/**
 * *** THE WRITE-BACK STEP. *** Converts solved WORLD points into LOCAL rotation deltas and writes them
 * into `localR` IN PLACE, one bone at a time from the chain root, RECOMPUTING the pose (extractPose again)
 * after each bone so bone i+1's delta is measured against bone i's ALREADY-WRITTEN rotation rather than a
 * stale snapshot -- gpu/SkeletalAnimator.js's own (independently-written, un-gated) _applyFabrik settled
 * on the identical rule for the identical reason (its own comment: "without this, every child bone after
 * the first gets a stale delta"), and it is followed here rather than re-derived.
 *
 * `weight` (0..1) slerps each affected bone's local rotation from where it already was (an authored
 * clip's sampled pose, if this runs from a pose constraint) toward the solved orientation -- 1.0 fully
 * overrides the chain, 0.0 is a no-op. Bone TRANSLATIONS are never touched: IK here is rotation-only, by
 * construction, the same invariant fabrik/ccd preserve (bone lengths do not change).
 */
export function writeBackChain(nodes, localR, localT, indices, solvedPoints, weight = 1.0) {
    const w = Math.max(0, Math.min(1, weight));
    if (w <= 0) return;
    for (let i = 0; i < indices.length - 1; i++) {
        const { P, W } = extractPose(nodes, localR, localT);
        const boneIdx = indices[i];
        const curDir = normVec([P[indices[i + 1]][0] - P[boneIdx][0], P[indices[i + 1]][1] - P[boneIdx][1], P[indices[i + 1]][2] - P[boneIdx][2]]);
        const newDir = normVec([solvedPoints[i + 1][0] - P[boneIdx][0], solvedPoints[i + 1][1] - P[boneIdx][1], solvedPoints[i + 1][2] - P[boneIdx][2]]);
        const dWorld = quatFromTo(curDir, newDir);
        const parentIdx = nodes[boneIdx].parent;
        const parentWorld = parentIdx >= 0 ? W[parentIdx] : IDQ;
        // world' = dWorld * world  =>  local' = parentWorld^-1 * dWorld * parentWorld * local  (parent unchanged this step)
        const dLocalFull = qMul(qMul(qConj(parentWorld), dWorld), parentWorld);
        const dLocal = w >= 1 ? dLocalFull : slerp(IDQ, dLocalFull, w);
        const cur = localR[boneIdx];
        const next = qMul(dLocal, [cur[0], cur[1], cur[2], cur[3]]);
        localR[boneIdx][0] = next[0]; localR[boneIdx][1] = next[1]; localR[boneIdx][2] = next[2]; localR[boneIdx][3] = next[3];
    }
}

/**
 * *** THE WHOLE THING. *** Name a chain (bone names/indices, or a CHAIN_PRESETS key) and a target point in
 * the skeleton's own local/model space (see header). Extracts the chain's current pose, solves it through
 * anim/ik.mjs, writes the result back into `localR` in place, and reports before/after end-effector
 * positions so a caller (or a gate) can measure how close it landed without re-deriving FK itself.
 */
export function reachTowards(nodes, localR, localT, chain, target, opts = {}) {
    const boneNames = Array.isArray(chain) ? chain : CHAIN_PRESETS[chain];
    if (!boneNames) return { ok: false, error: `unknown chain "${chain}" -- not an array and not in CHAIN_PRESETS` };
    const t = toVec3(target);
    if (!t) return { ok: false, error: "target must be [x,y,z] or {x,y,z}" };
    const resolved = resolveChain(nodes, boneNames);
    if (!resolved.ok) return resolved;
    const { indices } = resolved;
    const before = extractPose(nodes, localR, localT);
    const points = indices.map((i) => before.P[i]);
    const solved = solveChain(points, t, opts);
    writeBackChain(nodes, localR, localT, indices, solved.points, opts.weight ?? 1.0);
    const after = extractPose(nodes, localR, localT);
    const endIdx = indices[indices.length - 1];
    return {
        ok: true, boneNames, indices, solved, target: t,
        endEffectorBefore: points[points.length - 1],
        endEffectorAfter: after.P[endIdx],
        distanceToTarget: dist(after.P[endIdx], t),
    };
}

/**
 * Attach as a LIVE pose constraint on a real gpu/SkeletalAnimator instance, through its own constraint
 * pipeline (addConstraint -- see that file's own addition alongside setLookAt/setTwoBoneIK/setFabrikIK) so
 * this runs in the same post-clip-sample, pre-world-compose pass, composing with whatever clip is
 * currently playing rather than a second, competing pipeline. `getTarget(animator)` is called once per
 * frame; return null/undefined to skip the frame (the chain just plays its clip that frame, untouched).
 */
export function attachReachIK(animator, chain, getTarget, opts = {}) {
    if (typeof animator?.addConstraint !== "function") {
        throw new Error("attachReachIK: animator has no addConstraint() -- see gpu/SkeletalAnimator.js");
    }
    const constraint = {
        type: "reachIK", chain, getTarget, opts,
        apply: (a) => {
            const target = getTarget(a);
            if (!target) return;
            reachTowards(a.nodes, a.localR, a.localT, chain, target, opts);
        },
    };
    return animator.addConstraint(constraint);
}
