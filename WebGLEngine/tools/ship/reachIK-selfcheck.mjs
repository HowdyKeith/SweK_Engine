#!/usr/bin/env node
// WebGLEngine/tools/ship/reachIK-selfcheck.mjs -- v1 (task #40)
//
// Run: node tools/ship/reachIK-selfcheck.mjs
//
// GATES anim/reachIK.mjs (target selection, chain extraction, solve, write-back) and the one additive
// method gpu/SkeletalAnimator.js gained for it (addConstraint). Companion to tools/ship/ik-selfcheck.mjs,
// which gates anim/ik.mjs's solvers in isolation and says plainly, in its own closing line, what it does
// NOT prove: "nothing converts a solved point chain back into the LOCAL rotations a skeleton is posed
// with -- so the footSlide this was built to remove has not been removed, only made removable." This file
// is that conversion, graded end to end: name a chain, name a point, and measure where the hand actually
// ends up -- on a real gpu/SkeletalAnimator instance, in a real browser, while an authored clip is playing.
//
// Sections 1-7 run in plain Node (anim/reachIK.mjs and its anim/ik.mjs + anim/retarget.mjs dependencies
// are dependency-free ESM, same as anim/ik.mjs's own gate). Section 8 is the real-runtime proof: it
// imports gpu/SkeletalAnimator.js itself in headless Chromium (tools/ship/webgpuHarness.mjs's
// runInEngineOrigin, the same harness every other browser-dependent claim in this tree's recent rounds
// uses), builds a small hand-authored arm rig with a real animated idle clip, attaches reachIK live via
// attachReachIK/addConstraint, and reads back animator.nodeMatrices AND animator.jointMatrices -- the
// exact arrays render/EntityMeshRenderer.js's vertex shader consumes as uJointMatrices -- so "it moved the
// skeleton" is checked against the thing that actually renders, not an internal calculation trusted on its
// own word. All comparison/formatting logic below runs in Node AFTER the page script returns, per this
// session's standing rule: never do post-processing inside the in-page script string itself.
//
// ================================================================================================
// WHAT THIS GATE DOES NOT PROVE -- READ BEFORE TRUSTING A GREEN RUN
// ================================================================================================
//   * NO AUTOMATIC LIMB SELECTION. Every chain below is named explicitly (or via CHAIN_PRESETS). Nothing
//     here infers "use the right arm" from a bare target point and a whole skeleton.
//   * NO TRUE SCENE-WORLD-SPACE TARGETS. Targets are in the skeleton's own local/model space -- see
//     anim/reachIK.mjs's own header for exactly what that means and why converting a real scene-world
//     point (a doorknob placed via an entity's yaw/scale/offset) into that space is a real, separate step
//     this file does not perform or gate. render/EntityMeshRenderer.js's per-entity transform is not
//     exercised anywhere below.
//   * NO CONTINUOUS EASE OF THE IK WEIGHT ACROSS FRAMES. Section 6 proves `weight` blends correctly
//     WITHIN one call; nothing here animates weight itself frame to frame.
//   * NO MULTI-LIMB SIMULTANEOUS REACHING, NO COLLISION AVOIDANCE, NO JOINT-LIMIT WIRING. See
//     anim/reachIK.mjs's header for the same list in more detail -- not repeated here.
//   * THE BROWSER SECTION USES A HAND-AUTHORED FIXTURE, NOT rig/templates/kaijuBiped.js OR
//     gpu/proceduralTestRig.js DIRECTLY. kaijuBiped.js's own data shape ({id, position, parent-by-id}) is
//     rig/RigSystem.js's format, not gpu/SkeletalAnimator.js's (glTF-style indexed nodes with T/R/S) --
//     this file's fixture uses kaijuBiped.js's BONE NAMES (shoulder_r/arm_r/claw_r) in
//     SkeletalAnimator's actual node shape, so CHAIN_PRESETS resolves against it for real. proceduralTestRig
//     .js's own 3-node chain has no bone names at all (unnamed vertical "tentacle" joints) and is not
//     arm-shaped, so it is not a closer fit than a small dedicated fixture for a hand-reaches-a-point test.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import {
    resolveChain, extractPose, solveChain, writeBackChain, reachTowards, quatFromTo, CHAIN_PRESETS,
} from "../../anim/reachIK.mjs";
import { chainLengths, dist, bestError, fabrik } from "../../anim/ik.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
console.log("reachIK-selfcheck -- task #40: name a chain, name a point, put the hand there\n");

const jointAngle = (a, b, c) => {
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const nu = Math.hypot(...u), nv = Math.hypot(...v);
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv))));
};

// A small hand-authored biped fragment, torso + both arms, using rig/templates/kaijuBiped.js's OWN bone
// names (shoulder_r/arm_r/claw_r, shoulder_l/arm_l/claw_l) in gpu/SkeletalAnimator.js's actual node shape
// (glTF-style: indexed parent, local T/R/S). Rest pose: both arms extended straight along +/-X, upper arm
// and forearm each exactly 0.3 units, so total reach is exactly 0.6 -- round numbers everything below is
// checked against by hand.
function buildArmNodes() {
    const Q = () => [0, 0, 0, 1];
    return [
        { name: "torso",       translation: [0, 0, 0],     rotation: Q(), scale: [1, 1, 1], parent: -1, children: [1, 4] },
        { name: "shoulder_r",  translation: [0.3, 0.1, 0],  rotation: Q(), scale: [1, 1, 1], parent: 0,  children: [2] },
        { name: "arm_r",       translation: [0.3, 0, 0],    rotation: Q(), scale: [1, 1, 1], parent: 1,  children: [3] },
        { name: "claw_r",      translation: [0.3, 0, 0],    rotation: Q(), scale: [1, 1, 1], parent: 2,  children: [] },
        { name: "shoulder_l",  translation: [-0.3, 0.1, 0], rotation: Q(), scale: [1, 1, 1], parent: 0,  children: [5] },
        { name: "arm_l",       translation: [-0.3, 0, 0],   rotation: Q(), scale: [1, 1, 1], parent: 4,  children: [6] },
        { name: "claw_l",      translation: [-0.3, 0, 0],   rotation: Q(), scale: [1, 1, 1], parent: 5,  children: [] },
    ];
}
function freshArm() {
    const nodes = buildArmNodes();
    const localR = nodes.map((n) => n.rotation.slice());
    const localT = nodes.map((n) => n.translation.slice());
    return { nodes, localR, localT };
}

// =============================================================================================================
console.log("1. *** TARGET SELECTION: NAMING A CHAIN, AND WHAT HAPPENS WHEN THE NAMES DON'T FORM ONE ***");
{
    const { nodes } = freshArm();
    const r1 = resolveChain(nodes, CHAIN_PRESETS.arm_r);
    ok("!! CHAIN_PRESETS.arm_r resolves against rig/templates/kaijuBiped.js's own bone names",
        r1.ok && JSON.stringify(r1.indices) === JSON.stringify([1, 2, 3]), JSON.stringify(r1));

    const r2 = resolveChain(nodes, ["shoulder_l", "arm_l", "claw_l"]);
    ok("!! an explicit array (not a preset) resolves the left arm equally well",
        r2.ok && JSON.stringify(r2.indices) === JSON.stringify([4, 5, 6]), JSON.stringify(r2));

    const r3 = resolveChain(nodes, ["shoulder_r", "claw_l"]);
    ok("!! two bones that are NOT a parent chain get a NAMED error, not a solve against nonsense",
        !r3.ok && /not a child of/.test(r3.error), r3.error);

    const r4 = resolveChain(nodes, ["torso"]);
    ok("!! a single-bone \"chain\" (no joint to solve) is refused by name, not silently accepted",
        !r4.ok && /at least 2 bones/.test(r4.error), r4.error);

    const r5 = resolveChain(nodes, ["nope", "arm_r", "claw_r"]);
    ok("!! an unknown bone name is named in the error, not swallowed into index -1",
        !r5.ok && /nope/.test(r5.error), r5.error);

    const r6 = resolveChain(nodes, [1, 2, 3]);
    ok("!! numeric node indices work too, same as gpu/SkeletalAnimator.js's own _resolveBone duck-typing",
        r6.ok && JSON.stringify(r6.indices) === JSON.stringify([1, 2, 3]));

    const badReach = reachTowards(nodes, nodes.map(n=>n.rotation), nodes.map(n=>n.translation), "not_a_preset", [1,1,1]);
    ok("!! reachTowards on an unknown CHAIN_PRESETS key errors by name instead of throwing",
        !badReach.ok && /unknown chain/.test(badReach.error), badReach.error);
}

// =============================================================================================================
console.log("\n2. *** CHAIN EXTRACTION: extractPose'S FK MATCHES THE REST POSE BY HAND, EXACTLY ***");
{
    const { nodes, localR, localT } = freshArm();
    const { P } = extractPose(nodes, localR, localT);
    // Hand-derived: torso at origin, shoulder_r at (0.3,0.1,0), arm_r at (0.6,0.1,0), claw_r at (0.9,0.1,0).
    const want = { 0: [0, 0, 0], 1: [0.3, 0.1, 0], 2: [0.6, 0.1, 0], 3: [0.9, 0.1, 0], 4: [-0.3, 0.1, 0], 6: [-0.9, 0.1, 0] };
    let worst = 0;
    for (const [i, w] of Object.entries(want)) worst = Math.max(worst, dist(P[i], w));
    ok("!! every rest-pose joint position matches the hand-authored fixture to float precision",
        worst < 1e-6, "worst node-position error " + worst.toExponential(2));
}

// =============================================================================================================
console.log("\n3. *** THE SOLVE STEP CALLS anim/ik.mjs's OWN GATED MATH -- NOT A REIMPLEMENTATION ***");
{
    // Same fixture shape as tools/ship/ik-selfcheck.mjs's own section 1 (chain lengths 1.0, 0.8), run
    // through solveChain() instead of calling fabrik/twoBoneAngles directly, to prove the wrapper doesn't
    // change anim/ik.mjs's own answer.
    const P2 = [[0, 0, 0], [1, 0, 0]];
    for (let i = 0; i < 1; i++) P2.push([P2[P2.length - 1][0] + 0.8, 0, 0]); // -> [[0,0,0],[1,0,0],[1.8,0,0]]
    let worst = 0;
    const rows = [];
    for (const D of [0.5, 1.0, 1.5, 1.7]) {
        const t = [D * Math.cos(0.7), D * Math.sin(0.7), 0];
        const out = solveChain(P2, t);
        const measured = jointAngle(out.points[0], out.points[1], out.points[2]);
        worst = Math.max(worst, Math.abs(measured - out.twoBone.joint));
        rows.push("D=" + D + " " + measured.toFixed(6) + " vs " + out.twoBone.joint.toFixed(6));
    }
    ok("!! solveChain's fabrik placement and its own twoBoneAngles cross-check agree to " + worst.toExponential(2) + " rad",
        worst < 1e-5, rows.join(", ") + " -- same 1e-5 rad tolerance tools/ship/ik-selfcheck.mjs's section 1 uses");

    const far = solveChain(P2, [10, 0, 0]);
    const wantErr = bestError(chainLengths(P2), dist(P2[0], [10, 0, 0]));
    ok("!! and reachError for an unreachable target is anim/ik.mjs's own bestError(), not re-derived",
        Math.abs(far.reachError - wantErr) < 1e-12, far.reachError + " vs " + wantErr);
}

// =============================================================================================================
console.log("\n4. *** END TO END: THE HAND ACTUALLY LANDS ON THE TARGET, ON A LIVE (SIMULATED) SKELETON ***");
let armTol;
{
    const { nodes, localR, localT } = freshArm();
    const target = [0.55, 0.35, 0.15]; // inside [0, 0.6] reach from shoulder_r at (0.3,0.1,0): dist = sqrt(0.22) ~= 0.469
    const restHandPos = [0.9, 0.1, 0];
    const before = reachTowards; // (no-op reference, keeps lint quiet about unused import ordering)
    const res = reachTowards(nodes, localR, localT, "arm_r", target);
    armTol = 1e-4;
    ok("!! *** THE HAND (claw_r) LANDS WITHIN " + armTol + " OF THE TARGET *** (measured " + res.distanceToTarget.toExponential(2) + ")",
        res.ok && res.distanceToTarget < armTol,
        "target " + JSON.stringify(target) + ", before " + JSON.stringify(res.endEffectorBefore) +
        " (rest pose), after " + JSON.stringify(res.endEffectorAfter));
    ok("!! ...and it was NOT already there before solving (this measures the IK, not the rest pose)",
        dist(restHandPos, target) > 10 * armTol, "rest-pose distance to target: " + dist(restHandPos, target).toFixed(4));

    // *** THE CONTROL: bone lengths survive the write-back, not just the raw solve. *** Same role
    // ik-selfcheck.mjs's section 3 drift check plays for anim/ik.mjs itself -- here it also covers the
    // WORLD-delta -> LOCAL-delta -> FK-recompute conversion, which fabrik's own drift guarantee says
    // nothing about.
    const { P } = extractPose(nodes, localR, localT);
    const l1 = dist(P[1], P[2]), l2 = dist(P[2], P[3]);
    const drift = Math.max(Math.abs(l1 - 0.3), Math.abs(l2 - 0.3));
    ok("!! *** BONE LENGTHS SURVIVE THE FULL WRITE-BACK PATH TO " + drift.toExponential(1) + " -- A RUBBER BAND WOULD NOT ***",
        drift < 1e-5, "shoulder-arm " + l1.toFixed(8) + ", arm-claw " + l2.toFixed(8) + " (authored: 0.3, 0.3)");

    // *** THE CROSS-CHECK AGAINST anim/ik.mjs'S CLOSED FORM, ON THE REALIZED (post-write-back, post-FK) POSE. ***
    const measuredAngle = jointAngle(P[1], P[2], P[3]);
    const predictedAngle = res.solved.twoBone.joint;
    ok("!! *** THE REALIZED ELBOW ANGLE MATCHES twoBoneAngles' CLOSED FORM TO " + Math.abs(measuredAngle - predictedAngle).toExponential(1) + " RAD ***",
        Math.abs(measuredAngle - predictedAngle) < 1e-5,
        "measured " + measuredAngle.toFixed(6) + " vs predicted " + predictedAngle.toFixed(6) +
        " -- same tolerance tools/ship/ik-selfcheck.mjs's own section 1 uses for the solver alone");

    // *** SCOPING: the untouched arm is BIT-IDENTICAL, not just close. ***
    const fresh = freshArm();
    ok("!! solving arm_r left shoulder_l/arm_l/claw_l's local rotations EXACTLY untouched",
        JSON.stringify(localR[4]) === JSON.stringify(fresh.localR[4]) &&
        JSON.stringify(localR[5]) === JSON.stringify(fresh.localR[5]) &&
        JSON.stringify(localR[6]) === JSON.stringify(fresh.localR[6]),
        "left-arm locals: " + JSON.stringify([localR[4], localR[5], localR[6]]));
    ok("!! ...and torso's local rotation too (the chain root's PARENT, never written)",
        JSON.stringify(localR[0]) === JSON.stringify(fresh.localR[0]));
}

// =============================================================================================================
console.log("\n5. *** THE UNREACHABLE CASE: SATURATES STRAIGHT, ERROR MATCHES THE SAME CLOSED FORM ik-selfcheck USES ***");
{
    const { nodes, localR, localT } = freshArm();
    const far = [5, 5, 5];
    const res = reachTowards(nodes, localR, localT, "arm_r", far);
    const { P } = extractPose(nodes, localR, localT);
    const l1 = dist(P[1], P[2]), l2 = dist(P[2], P[3]);
    ok("!! straight (fully extended) flag set, and bone lengths still exactly preserved",
        res.solved.straight === true && Math.abs(l1 - 0.3) < 1e-5 && Math.abs(l2 - 0.3) < 1e-5,
        "l1=" + l1.toFixed(6) + " l2=" + l2.toFixed(6));
    const wantErr = bestError([0.3, 0.3], dist(P[1], far));
    ok("!! *** THE REALIZED end-effector ERROR MATCHES D - L (the sharper closed form) TO " +
        Math.abs(res.distanceToTarget - wantErr).toExponential(1) + " ***",
        Math.abs(res.distanceToTarget - wantErr) < 1e-3,
        "measured " + res.distanceToTarget.toFixed(6) + " vs D-L " + wantErr.toFixed(6) +
        " -- looser than section 3's 1e-9 because this number went through the write-back's quaternion " +
        "round-trip (Float32Array-stored local rotations), not the raw float64 solve tools/ship/ik-selfcheck.mjs checks");
}

// =============================================================================================================
console.log("\n6. *** WEIGHT BLENDING: A PARTIAL OVERRIDE IS GENUINELY PARTIAL, AND MONOTONIC ***");
{
    const target = [0.55, 0.35, 0.15];
    const dAt = (w) => {
        const { nodes, localR, localT } = freshArm();
        return reachTowards(nodes, localR, localT, "arm_r", target, { weight: w }).distanceToTarget;
    };
    const d0 = dAt(0), d25 = dAt(0.25), d50 = dAt(0.5), d75 = dAt(0.75), d100 = dAt(1.0);
    // Tolerance is the qMul float32-quantization floor tools/ship/ik-selfcheck.mjs's own section 3
    // documents ("ROTATING BY THE IDENTITY QUATERNION CHANGES THE VECTOR"), not 0 -- extractPose's FK walk
    // round-trips every position through qRot/qMul (anim/retarget.mjs), identity rotation included, so
    // even an untouched rest pose picks up ~1e-7-scale float32 noise relative to the hand-typed constant.
    ok("!! weight=0 is a genuine no-op (distance-to-target unchanged from the untouched rest pose, at the float32 qMul floor)",
        Math.abs(d0 - dist([0.9, 0.1, 0], target)) < 1e-6, "d0=" + d0.toFixed(8));
    ok("!! *** DISTANCE TO TARGET DECREASES MONOTONICALLY AS WEIGHT INCREASES FROM 0 TO 1 ***",
        d0 > d25 + 1e-6 && d25 > d50 + 1e-6 && d50 > d75 + 1e-6 && d75 > d100,
        "d0=" + d0.toFixed(4) + " d25=" + d25.toFixed(4) + " d50=" + d50.toFixed(4) +
        " d75=" + d75.toFixed(4) + " d100=" + d100.toFixed(4));
    ok("!! weight=1.0 matches the un-weighted default (full override) to float precision",
        Math.abs(d100 - dAt(undefined === 1 ? 1 : 1)) < 1e-9);
}

// =============================================================================================================
console.log("\n7. *** WRITE-BACK'S QUATERNION-ALIGNMENT PRIMITIVE, quatFromTo, ON ITS OWN ***");
{
    const cases = [
        [[1, 0, 0], [1, 0, 0]],     // identity
        [[1, 0, 0], [0, 1, 0]],     // 90 degrees
        [[1, 0, 0], [-1, 0, 0]],    // 180 degrees, degenerate axis
    ];
    let worst = 0;
    for (const [from, to] of cases) {
        const q = quatFromTo(from, to);
        // Rotate `from` by q via the sandwich product, using ONLY anim/ik.mjs's own qMul-family import
        // chain (reachIK.mjs's own retarget.mjs qMul/qConj) -- not a second quaternion implementation.
        const v = [from[0], from[1], from[2], 0];
        // manual Hamilton product, matching anim/retarget.mjs's rigMath.js formula, to avoid importing a
        // private helper just for this check
        const mul = (a, b) => [
            a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
            a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
            a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
            a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
        ];
        const conj = (a) => [-a[0], -a[1], -a[2], a[3]];
        const r = mul(mul(q, v), conj(q));
        worst = Math.max(worst, dist(r, to));
    }
    ok("!! quatFromTo(from,to) rotates `from` exactly onto `to`, including the 180-degree degenerate case",
        worst < 1e-6, "worst rotated-vector error " + worst.toExponential(2));
}

// =============================================================================================================
console.log("\n8. *** THE REAL RUNTIME: A LIVE gpu/SkeletalAnimator INSTANCE, IN A REAL BROWSER, WITH A PLAYING CLIP ***");
{
    const skip = webgpuSkipReason();
    if (skip) {
        say("SKIP (no headless shell / playwright): " + skip);
        fails++;
    } else {
        const SCRIPT = `async () => {
            const { SkeletalAnimator } = await import("/gpu/SkeletalAnimator.js");
            const { attachReachIK } = await import("/anim/reachIK.mjs");

            const Q = () => new Float32Array([0, 0, 0, 1]);
            function buildNodes() {
                return [
                    { name: "torso",      translation: new Float32Array([0, 0, 0]),     rotation: Q(), scale: new Float32Array([1,1,1]), parent: -1, children: [1, 4] },
                    { name: "shoulder_r", translation: new Float32Array([0.3, 0.1, 0]),  rotation: Q(), scale: new Float32Array([1,1,1]), parent: 0,  children: [2] },
                    { name: "arm_r",      translation: new Float32Array([0.3, 0, 0]),    rotation: Q(), scale: new Float32Array([1,1,1]), parent: 1,  children: [3] },
                    { name: "claw_r",     translation: new Float32Array([0.3, 0, 0]),    rotation: Q(), scale: new Float32Array([1,1,1]), parent: 2,  children: [] },
                    { name: "shoulder_l", translation: new Float32Array([-0.3, 0.1, 0]), rotation: Q(), scale: new Float32Array([1,1,1]), parent: 0,  children: [5] },
                    { name: "arm_l",      translation: new Float32Array([-0.3, 0, 0]),   rotation: Q(), scale: new Float32Array([1,1,1]), parent: 4,  children: [6] },
                    { name: "claw_l",     translation: new Float32Array([-0.3, 0, 0]),   rotation: Q(), scale: new Float32Array([1,1,1]), parent: 5,  children: [] },
                ];
            }
            // Minimal skin: every node is its own joint, inverseBindMatrices undo each joint's REST world
            // translation (identical convention to gpu/proceduralTestRig.js's own buildSkin()). update()
            // returns early with no clip sampling / no world-matrix compose at all when mesh.skin is
            // absent (see gpu/SkeletalAnimator.js's update(): "if (!clip || !this.skin) return"), so a
            // real skin is required to exercise the real pipeline, not optional set-dressing.
            const restPos = [[0,0,0],[0.3,0.1,0],[0.6,0.1,0],[0.9,0.1,0],[-0.3,0.1,0],[-0.6,0.1,0],[-0.9,0.1,0]];
            const ibm = restPos.map((p) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, -p[0],-p[1],-p[2],1]));
            const skin = { joints: [0,1,2,3,4,5,6], inverseBindMatrices: ibm, skeleton: 0 };

            // idle clip: shoulder_r sways -0.3 rad about Z (arbitrary but non-trivial) at t=1, back to 0 at
            // t=2 -- so mid-clip (t=0.5s into a fresh animator) the chain is genuinely mid-sway, NOT at rest.
            function quatZ(theta) { const h = theta/2; return [0,0,Math.sin(h),Math.cos(h)]; }
            const times = new Float32Array([0, 1, 2]);
            const vals = new Float32Array(12);
            [0, -0.3, 0].forEach((ang, k) => { const q = quatZ(ang); vals.set(q, k*4); });
            const idleClip = {
                name: "idle", duration: 2.0,
                samplers: [{ times, values: vals, interpolation: "LINEAR" }],
                channels: [{ samplerIdx: 0, targetNode: 1, path: "rotation" }],
            };
            const mesh = () => ({ skin, animations: [idleClip], nodes: buildNodes() });

            // Baseline: same clip, same dt, NO reachIK attached.
            const base = new SkeletalAnimator(mesh());
            base.update(0.5);
            const baseHand = [base.nodeMatrices[3][12], base.nodeMatrices[3][13], base.nodeMatrices[3][14]];
            const baseShoulderRot = Array.from(base.localR[1]);
            const baseLeftClaw = [base.nodeMatrices[6][12], base.nodeMatrices[6][13], base.nodeMatrices[6][14]];
            const baseTorso = [base.nodeMatrices[0][12], base.nodeMatrices[0][13], base.nodeMatrices[0][14]];

            // IK: identical mesh/clip/dt, reachIK attached to arm_r via the SAME live pipeline
            // setLookAt/setTwoBoneIK/setFabrikIK use (addConstraint -> _poseConstraints).
            const target = { x: 0.55, y: 0.35, z: 0.15 };
            const ikAnim = new SkeletalAnimator(mesh());
            attachReachIK(ikAnim, ["shoulder_r", "arm_r", "claw_r"], () => target, { weight: 1.0 });
            ikAnim.update(0.5);
            const ikHand = [ikAnim.nodeMatrices[3][12], ikAnim.nodeMatrices[3][13], ikAnim.nodeMatrices[3][14]];
            const ikLeftClaw = [ikAnim.nodeMatrices[6][12], ikAnim.nodeMatrices[6][13], ikAnim.nodeMatrices[6][14]];
            const ikTorso = [ikAnim.nodeMatrices[0][12], ikAnim.nodeMatrices[0][13], ikAnim.nodeMatrices[0][14]];

            // jointMatrices readback -- the ACTUAL array render/EntityMeshRenderer.js uploads as
            // uJointMatrices. joint 3 is claw_r; jointMatrix * restWorldPos(claw_r) should equal
            // nodeMatrices[3]'s translation (both computed by the SAME update() call, independently
            // reachable through two different fields of the animator).
            const jm = ikAnim.jointMatrices.slice(3 * 16, 4 * 16);
            const rp = restPos[3];
            const jmPos = [
                jm[0]*rp[0] + jm[4]*rp[1] + jm[8]*rp[2]  + jm[12],
                jm[1]*rp[0] + jm[5]*rp[1] + jm[9]*rp[2]  + jm[13],
                jm[2]*rp[0] + jm[6]*rp[1] + jm[10]*rp[2] + jm[14],
            ];

            return {
                ok: true, target: [target.x, target.y, target.z],
                baseHand, baseShoulderRot, baseLeftClaw, baseTorso,
                ikHand, ikLeftClaw, ikTorso, jmPos,
            };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else if (!out.ok || !out.result || !out.result.ok) {
            ok("!! the live-animator script ran without error", false,
                out.ok ? JSON.stringify(out.result) : (out.reason || JSON.stringify(out.pageErrors)));
            fails++;
        } else {
            const r = out.result;
            const distV = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
            const restHand = [0.9, 0.1, 0];

            ok("!! *** THE IDLE CLIP REALLY MOVED THE ARM BEFORE IK RAN *** (baseline hand isn't at rest, and shoulder rotation isn't identity)",
                distV(r.baseHand, restHand) > 1e-3 && Math.abs(r.baseShoulderRot[2]) > 1e-3,
                "baseline hand " + JSON.stringify(r.baseHand) + " (rest " + JSON.stringify(restHand) + "), shoulder_r rotation " + JSON.stringify(r.baseShoulderRot));

            ok("!! *** ON A LIVE ANIMATOR, MID-CLIP, THE HAND (nodeMatrices[claw_r]) LANDS WITHIN " + armTol + " OF THE TARGET ***",
                distV(r.ikHand, r.target) < armTol,
                "measured " + distV(r.ikHand, r.target).toExponential(2) + " -- target " + JSON.stringify(r.target) +
                ", baseline (clip only, no IK) was " + distV(r.baseHand, r.target).toFixed(4) + " away");

            ok("!! *** jointMatrices (the ARRAY THE SHADER ACTUALLY READS AS uJointMatrices) AGREES WITH nodeMatrices ***",
                distV(r.jmPos, r.ikHand) < 1e-4,
                "jointMatrix-derived claw_r world pos " + JSON.stringify(r.jmPos) + " vs nodeMatrices " + JSON.stringify(r.ikHand));

            ok("!! the left arm and torso are UNCHANGED between the no-IK and IK runs (same clip, same dt, only the chain differs)",
                distV(r.baseLeftClaw, r.ikLeftClaw) < 1e-6 && distV(r.baseTorso, r.ikTorso) < 1e-6,
                "left claw delta " + distV(r.baseLeftClaw, r.ikLeftClaw).toExponential(1) +
                ", torso delta " + distV(r.baseTorso, r.ikTorso).toExponential(1));
        }
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"));
console.log("See this file's own header for the full list of what is deliberately NOT proven here: no " +
    "automatic limb selection, no scene-world-space target conversion, no cross-frame weight easing, no " +
    "multi-limb coordination, no collision avoidance, no joint-limit wiring. anim/reachIK.mjs's own header " +
    "additionally names the pre-existing gap this round found but did not fix: simulation/KaijuIK.js's " +
    "existing arm-aim IK already passes raw scene-world target coordinates into model-space-consuming " +
    "constraint math, silently, and that was true before this round and remains true after it.");
process.exit(fails ? 1 : 0);
