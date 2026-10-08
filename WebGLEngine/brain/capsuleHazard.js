// brain/capsuleHazard.js -- a DEMO-SCOPED policy proving the GPU Brain's learning machinery (mlp.js's
// BatchedMLP, learn.js's MLPTrainer/loadDeepWeights/saveReplays) can genuinely train on capsule-vs-mesh
// collision geometry (physics/character/capsuleCollide.mjs), not just the coarse terrain-height grid every
// other policy in policy.js reads.
//
// *** WHY THIS IS A SEPARATE FILE FROM policy.js, AND WHY IT IS NOT WIRED INTO brain.js. *** Task board #87
// went looking for "feed capsule-collision features into the brain's live navigation policy" and found the
// premise wrong in a load-bearing way: kaiju -- the only entities brain.js governs -- live exclusively in
// world._heightAt voxel worlds and never touch world.colliderBVH or capsuleCollide.mjs at all (confirmed by
// reading simulation/BotManager.js's own header: a _heightAt world has no colliderBVH, and vice versa). Giving
// kaiju real capsule collision is a real subsystem build (meshing the voxel terrain into a BVH), tracked
// separately as its own task. This file proves the LEARNING PIPELINE end to end -- feature growth, weight
// migration, replay handling, CPU/GPU agreement -- against REAL capsule-collision geometry from a colliderBVH
// sandbox (Controller Lab, splat-walk), so that work is not starting from zero once the kaiju side exists.
//
// THE TASK: predict, from a CHEAP pre-scan of nearby triangles, whether stepping a capsule forward along a
// candidate direction will need a LARGE corrective push once the REAL (expensive, iterative) depenetration
// solve runs -- i.e. "is this direction hazardous", the same shape of question a navigation filter would ask
// before committing to a full solve for every candidate direction. Ground truth is capsuleCollide.mjs's own
// depenetrateCapsuleFixedTris (physics/character/capsuleCollide.mjs), the SAME reference function task #86's
// gate and task #88's Roundhouse device are already held to -- no fourth implementation of this physics.
"use strict";
import { closestPointOnTriangle, faceNormalToward, depenetrateCapsuleFixedTris } from "../physics/character/capsuleCollide.mjs";

const HORIZON = 6;          // world units -- a probe farther than this from every triangle reads as "clear"

/** Nearest triangle to `p` among `tris` ([[a,b,c],...]), as { dist, normalY }, or null if `tris` is empty. */
function nearestTriangle(p, tris) {
    let best = null, bestDist = Infinity;
    for (const [a, b, c] of tris) {
        const cp = closestPointOnTriangle(p, a, b, c);
        const d = Math.hypot(cp[0] - p[0], cp[1] - p[1], cp[2] - p[2]);
        if (d < bestDist) { bestDist = d; best = [a, b, c]; }
    }
    if (best === null) return { dist: Infinity, normalY: 1 };
    const n = faceNormalToward(best[0], best[1], best[2], p[0], p[1], p[2]);
    return { dist: bestDist, normalY: n[1] };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const near01 = (dist) => (dist === Infinity ? 0 : clamp01(1 - dist / HORIZON));

// ============================================================
// V1 -- the ORIGINAL, smaller feature set. Kept live (not just described in a comment) so this file's own
// selfcheck can generate genuinely V1-shaped training data and exercise loadDeepWeights' migration path
// against it -- the same way an actual feature-set growth in this codebase leaves the OLD shape briefly
// reachable in history, except here it stays reachable on purpose, for the demo.
//
// Feature vector (order matters, keep in sync with buildFeaturesV1):
//   0 nearestNear    0..1   1 - nearestDist/HORIZON -- how close the nearest triangle already is
//   1 nearestNormalY -1..1  the nearest triangle's oriented normal.y -- walkable (near 1) vs a wall (near 0)
//                            vs overhanging (negative)
//   2 crowded        0..1   min(1, triangle count / 6) -- more nearby geometry, more ways to catch an edge
//   3 towardness     0..1   (dot(moveDir, dir-to-nearest-triangle) + 1) / 2 -- heading AT it vs away from it
//   4 radiusNorm     0..1   capsule radius / 1.0 -- a bigger capsule clips sooner
//   5 bias           1.0
// ============================================================
export const CH_FEATURES_V1 = 6;

export function buildCapsuleHazardFeaturesV1(feet, radius, moveDir, tris) {
    const near = nearestTriangle(feet, tris);
    const toNearest = tris.length ? (() => {
        // recompute the nearest triangle's closest point once more for direction -- cheap (<=8 triangles),
        // and keeps nearestTriangle()'s own return shape flat rather than growing it just for this.
        let bestD = Infinity, bestCp = feet;
        for (const [a, b, c] of tris) {
            const cp = closestPointOnTriangle(feet, a, b, c);
            const d = Math.hypot(cp[0] - feet[0], cp[1] - feet[1], cp[2] - feet[2]);
            if (d < bestD) { bestD = d; bestCp = cp; }
        }
        const dx = bestCp[0] - feet[0], dz = bestCp[2] - feet[2];
        const len = Math.hypot(dx, dz) || 1;
        return [dx / len, dz / len];
    })() : [0, 0];
    const towardDot = moveDir[0] * toNearest[0] + moveDir[1] * toNearest[1];
    return [
        near01(near.dist),
        near.normalY,
        Math.min(1, tris.length / 6),
        (towardDot + 1) / 2,
        clamp01(radius),
        1.0,
    ];
}

export function buildCapsuleHazardWeightsV1() {
    // logit = 2.0*nearestNear - 1.5*nearestNormalY + 0.8*crowded + 1.2*towardness + 0.3*radiusNorm - 1.5
    // (a flat, walkable, distant, receding scene reads low-hazard; close + vertical + heading-at reads high)
    return Float32Array.from([2.0, -1.5, 0.8, 1.2, 0.3, -1.5]);
}

// ============================================================
// V2 -- GROWN feature set: three lateral/forward probes added before the final bias column, mirroring
// policy.js's own attack-policy history (ATK_FEATURES growing 13->15->16, bias always relocated to the new
// end). Existing V1 columns keep their exact meaning and order; nothing already there moves except the bias.
//
//   0-4  unchanged from V1 (nearestNear, nearestNormalY, crowded, towardness, radiusNorm)
//   5 leftNear       0..1  nearestNear probed from a point offset radius*1.5 to the LEFT of moveDir
//   6 rightNear      0..1  ...to the RIGHT -- left/right disagreeing is a corridor edge, not open ground
//   7 aheadNear      0..1  nearestNear probed one full step ahead along moveDir -- what's actually coming up
//   8 bias           1.0
// ============================================================
export const CH_FEATURES_V2 = 9;

export function buildCapsuleHazardFeaturesV2(feet, radius, moveDir, tris, stepDist = 1) {
    const v1 = buildCapsuleHazardFeaturesV1(feet, radius, moveDir, tris);
    const perp = [-moveDir[1], moveDir[0]];   // 90 degrees from moveDir in the XZ plane
    const off = radius * 1.5;
    const leftPt = [feet[0] + perp[0] * off, feet[1], feet[2] + perp[1] * off];
    const rightPt = [feet[0] - perp[0] * off, feet[1], feet[2] - perp[1] * off];
    const aheadPt = [feet[0] + moveDir[0] * stepDist, feet[1], feet[2] + moveDir[1] * stepDist];
    return [
        ...v1.slice(0, 5),
        near01(nearestTriangle(leftPt, tris).dist),
        near01(nearestTriangle(rightPt, tris).dist),
        near01(nearestTriangle(aheadPt, tris).dist),
        1.0,
    ];
}

export function buildCapsuleHazardWeightsV2() {
    const v1 = buildCapsuleHazardWeightsV1();
    // v1's own bias (index 5) is dropped here and re-appended at the new end (index 8) -- the exact
    // relocation loadDeepWeights' migration performs on a REAL old file, done once by hand for the fresh
    // hand-set prior so V1 and V2's hand policies agree on every column they share.
    return Float32Array.from([...v1.slice(0, 5), 0.5, 0.5, 1.0, v1[5]]);
}

// ============================================================
// Deep net: F -> H relu -> 1 sigmoid, DISTILLATION INIT identical in shape to policy.js's
// buildAttackLayersDeep -- hidden units 0/1 are +hand/-hand with output weights +1/-1, so relu(h0)-relu(h1)
// == hand.x for every input sign: the net starts EXACTLY equal to the hand-set linear prior and learns past
// it. H is 8, not attack's 16 -- this policy has 6-9 inputs against attack's 13-16, and CH_HIDDEN scales with
// CH_FEATURES the same way ATK_HIDDEN was chosen relative to ATK_FEATURES (roughly hidden ~= inputs).
// ============================================================
export const CH_HIDDEN = 8;

function seededRand(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);
}

export function buildCapsuleHazardLayers(features, handW, seed = 2601) {
    const H = CH_HIDDEN, F = features;
    const hand = handW ?? (F === CH_FEATURES_V1 ? buildCapsuleHazardWeightsV1() : buildCapsuleHazardWeightsV2());
    const rnd = seededRand(seed);
    const W1 = new Float32Array(H * F);
    const b1 = new Float32Array(H);
    for (let i = 0; i < F; i++) {
        W1[0 * F + i] = hand[i];
        W1[1 * F + i] = -hand[i];
    }
    for (let o = 2; o < H; o++)
        for (let i = 0; i < F; i++) W1[o * F + i] = rnd() * 0.30;
    const W2 = new Float32Array(1 * H);
    const b2 = new Float32Array(1);
    W2[0] = 1.0; W2[1] = -1.0;
    // Unlike buildAttackLayersDeep's own precedent (small random output weights here too), these stay exactly
    // zero: the random INPUT weights above (W1) still give units 2..H-1 real learning capacity once training
    // starts, but a zero initial CONTRIBUTION is what makes relu(h0)-relu(h1) == hand.x the WHOLE story at
    // init, not an approximation of it -- this policy's own section-1 gate holds it to that literally.
    for (let o = 2; o < H; o++) W2[o] = 0;
    return [
        { nIn: F, nOut: H, W: W1, b: b1, act: "relu" },
        { nIn: H, nOut: 1, W: W2, b: b2, act: "sigmoid" },
    ];
}

/**
 * The ground-truth label a training sample is held to: does stepping the capsule forward by `stepDist` along
 * `moveDir` (unit XZ vector) need a real corrective push once depenetrateCapsuleFixedTris actually resolves
 * it? `hazard` is 1/0 (the binary reward MLPTrainer/OnlineTrainer trains against, same shape as every other
 * policy in policy.js), `pushDist` is the underlying continuous measurement it is thresholded from.
 */
export function capsuleHazardLabel(feet, radius, height, moveDir, tris, stepDist = 1, opts = {}) {
    const { iterations = 4, hazardFrac = 0.4 } = opts;
    const stepped = [feet[0] + moveDir[0] * stepDist, feet[1], feet[2] + moveDir[1] * stepDist];
    const r = depenetrateCapsuleFixedTris(stepped, radius, height, tris, { iterations });
    const pushDist = Math.hypot(r.pos[0] - stepped[0], r.pos[1] - stepped[1], r.pos[2] - stepped[2]);
    return { hazard: pushDist > hazardFrac * radius ? 1 : 0, pushDist, resolved: r };
}
