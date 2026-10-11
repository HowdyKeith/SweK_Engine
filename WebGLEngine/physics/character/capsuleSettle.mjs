// WebGLEngine/physics/character/capsuleSettle.mjs -- v4646
//
// *** A DIFFERENT CONTRACT FROM capsuleMove.mjs, NOT A SECOND COPY OF IT, AND THAT DISTINCTION WAS MEASURED
// RATHER THAN ASSUMED. ***
//
// physics/character/capsuleMove.mjs is SWEPT MOVEMENT: moveCapsule() substeps so the capsule axis never
// leaves the domain where the closest-point contact direction is defined, and depenetrate() is its internal
// primitive with that precondition. This file is the other shape: SETTLE A BODY THAT IS ALREADY OVERLAPPING,
// from wherever it is, with each push clamped so a deep overlap resolves over several frames instead of one
// snap. Nobody substeps a thousand crowd agents, and a GPU batch kernel cannot; this is what such a caller
// needs, and physics/character/capsuleCollideTsl.mjs is that kernel with this function as its CPU twin.
//
// ---- WHY THIS IS NOT THE DUPLICATE IT LOOKS LIKE ---------------------------------------------------------
//
// Ported from claude/shader-porting-swek-ozgvb0's physics/character/capsuleCollide.mjs (v4628), which was
// NOT brought whole: that module carries its own closestPointOnTriangle / closestSegmentSegment /
// segmentTriangleClosest, which are main's own closestOnTriangle / closestOnSegments / segmentTriangle under
// different names. Two copies of one closed-form geometry, each with its own gates, is backlog #24, #25 and
// #37, which this tree has already paid for three times. So the geometry here is IMPORTED and the only new
// code is the loop and the normal's orientation.
//
// *** THE FIRST READING OF THE TWO SAID MAIN WAS BROKEN, AND IT WAS THE MEASUREMENT THAT WAS WRONG. ***
// Driving main's depenetrate() and the branch's function from identical EMBEDDED starts on main's own
// fixtures, main left the body unmoved on 3 of 6 -- ramp26 (start y=1.0, still 1.0), ramp45 (3.5, still
// 3.5), and a slab with the axis exactly on the surface (-0.4, half-buried) -- reporting a degenerate
// contact on exactly those three, which looked like its own header's "(a) THE CLOSEST-POINT DIRECTION DOES
// NOT DEGRADE AT THE SURFACE. IT DIES" biting for real. It was not. depenetrate() is not the entry point.
// Driven the way a caller actually would -- moveCapsule() walking into the 26.6-degree ramp from open floor
// -- it climbs to (12.7781, 2.4401, 10) in 40 substeps and 112 passes with degenerate 0 and escaped false,
// and dropped 2.4 onto the slab it lands exactly at y=0. Main is sound, and the wrong reading is kept here
// because "I called the primitive outside its contract" is the thing a later reader will do again.
//
// ---- THE NORMAL IS ORIENTED, WHICH IS THE ONE PLACE main's faceNormal CANNOT BE USED AS-IS ---------------
//
// capsuleGround.mjs's faceNormal() flips a face normal to point UP (`n[1] < 0 ? -n : n`), because its
// question is slope. Depenetration's question is which way is OUT, so the normal must point at the BODY --
// on a ceiling those are opposite. The cross product and normalisation are still main's; only the sign test
// is here.
"use strict";
import { segmentTriangle } from "./capsuleMove.mjs";
import { faceNormal } from "./capsuleGround.mjs";

/** The up-component a contact normal must exceed to count as ground. ONE definition, exported, because the
 *  ported kernel restated it locally "so this file has no import-order dependency" -- and a constant restated
 *  for convenience is exactly how this tree ended up with two skip rules that agreed only by coincidence. */
export const GROUND_SUPPORT_NORMAL_Y = 0.5;

/** Contacts closer than this to the radius still count, so a body resting exactly on a surface keeps its
 *  contact instead of flickering between touching and not. The reference's own value. */
export const CONTACT_SKIN = 1e-4;

/** main's faceNormal, re-oriented to point at the body rather than at the sky. */
export function normalToward(tris, i, px, py, pz) {
    const n = faceNormal(tris, i);
    const d = (px - tris[i]) * n[0] + (py - tris[i + 1]) * n[1] + (pz - tris[i + 2]) * n[2];
    return d < 0 ? [-n[0], -n[1], -n[2]] : n;
}

/**
 * Settle a capsule out of a FIXED candidate triangle list -- the narrow phase, with the broad phase already
 * done by the caller. `tris` is flat, 9 floats per triangle, which is both mesh/meshBVH.mjs's own layout and
 * what the GPU kernel uploads, so the twin and the kernel read the identical bytes.
 *
 * Deepest triangle per pass, pushed along its oriented normal by at most `radius * maxStepFrac`. A pass that
 * finds nothing is a guarded no-op rather than a break, so the loop is visibly the same shape as the GPU
 * kernel's, which cannot break out of a uniform-count loop.
 */
export function settleCapsule(feet, radius, height, tris, opts = {}) {
    const { iterations = 4, groundNormalY = GROUND_SUPPORT_NORMAL_Y, maxStepFrac = 0.8,
            plantGroundedFlip = false } = opts;
    const segLo = radius, segHi = Math.max(radius, height - radius);
    const maxStep = radius * maxStepFrac;
    const midY = segLo + (segHi - segLo) / 2;
    let cx = feet[0], cy = feet[1], cz = feet[2];
    let grounded = false, contacts = 0;
    for (let iter = 0; iter < iterations; iter++) {
        const a = [cx, cy + segLo, cz], b = [cx, cy + segHi, cz];
        let deepestPen = -Infinity, deepestNormal = null;
        for (let i = 0; i + 8 < tris.length; i += 9) {
            const q = segmentTriangle(a, b, tris, i);
            if (q.dist >= radius + CONTACT_SKIN) continue;
            const pen = radius - q.dist;
            if (pen > deepestPen) { deepestPen = pen; deepestNormal = normalToward(tris, i, cx, cy + midY, cz); }
        }
        if (deepestNormal === null) continue;
        const push = Math.max(0, Math.min(deepestPen, maxStep));
        cx += deepestNormal[0] * push; cy += deepestNormal[1] * push; cz += deepestNormal[2] * push;
        contacts++;
        // `plantGroundedFlip` is the sabotage tools/roundhouse/capsuleDepenetrateBind.mjs plants: it inverts
        // the ground test WITHOUT touching the push, so position and contact count are blind to it and only a
        // gate reading `grounded` can see it. Threaded here rather than reimplemented there.
        const grounds = plantGroundedFlip ? deepestNormal[1] < groundNormalY : deepestNormal[1] > groundNormalY;
        if (grounds) grounded = true;
    }
    return { pos: [cx, cy, cz], grounded, contacts };
}
