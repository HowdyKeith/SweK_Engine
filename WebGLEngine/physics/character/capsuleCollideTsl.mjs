// WebGLEngine/physics/character/capsuleCollideTsl.mjs -- v4632
//
// TASK BOARD #86. physics/character/capsuleCollide.mjs's depenetrateCapsule() (task #80), batched: one GPU
// invocation per capsule, all capsules in one dispatch, the SAME closest-point/closest-segment/deepest-
// triangle-per-pass algorithm as nodes instead of JS -- render/physicsTsl.mjs's own pattern (a CPU algorithm
// ported to TSL, a hand-kept CPU reference to grade it against), applied to this tree's own capsule math
// instead of inventing a new one.
//
// *** SCOPE, STATED PLAINLY, THE SAME WAY capsuleCollide.mjs's OWN HEADER STATES ITS. *** This tree has no
// GPU-traversable spatial structure anywhere (mesh/meshBVH.mjs's trianglesInBox is a CPU stack-based AABB
// descent; physics/spatial/agreement.mjs's own inventory of every spatial structure here -- AabbGrid, the ECS
// BVH, kdtree, neighborGrid, spatialGrid -- is CPU-only, confirmed by reading, not assumed), and none of
// render/physicsTsl.mjs's own shipped kernels do a GPU spatial query either (xpbdDevice's own gate says so by
// name: "a GPU pair finder... is unchecked"). So THIS FILE DOES NOT PORT trianglesInBox. The broad phase stays
// exactly what it already is -- a CPU call to the real bvh.trianglesInBox, per capsule, before the dispatch --
// and what runs on the GPU is the NARROW phase: given up to MAX_TRIS candidate triangles per capsule (already
// found, already close), resolve the capsule out of whichever one is deepest, same as the CPU function's own
// inner loop, batched across every capsule in the crowd at once. A full GPU BVH traversal is a real, separate,
// harder problem -- named here as future work, not solved by pretending this round's fixed candidate list is
// one.
//
// *** ONE RESTRUCTURING THE CPU FUNCTION'S OWN SHAPE DOES NOT NEED AND THIS ONE DOES. *** depenetrateCapsule
// re-queries trianglesInBox EVERY iteration, because the capsule moves between passes and the query box moves
// with it. A GPU thread cannot call back to the CPU mid-dispatch, so this kernel resolves against ONE fixed
// candidate list, packed once before the dispatch, for all `iterations` passes. tools/ship/
// capsuleCollideTsl-selfcheck.mjs's own CPU reference is held to the SAME fixed list (not a live BVH
// re-query), so the comparison is honest about what is actually being claimed: the depenetration MATH agrees
// with the CPU, not that GPU broad-phase agrees with CPU broad-phase (there is no GPU broad-phase here to
// disagree). A caller that wants the fixed list to stay a safe superset across every pass pads its own query
// box by iterations * radius * maxStepFrac before packing it -- this file does not do that padding itself,
// because it has no opinion on how a caller sources triangles, the same restraint capsuleCollide.mjs's own
// depenetrateCapsule has about who calls trianglesInBox.
//
// closestPointOnTriangle/closestSegmentSegment/segmentTriangleClosest below are capsuleCollide.mjs's own
// algorithms (Ericson, "Real-Time Collision Detection" 5.1.5 and 5.1.9 -- read there originally, not re-read
// here) as TSL nodes instead of JS: the SAME Voronoi-region walk and segment-segment closed form, restructured
// from early-return branches into BRANCHLESS arithmetic -- every case computed unconditionally, then combined
// with a backward cascade of select(cond, thenVal, accSoFar) calls, lowest-priority case first, so each
// higher-priority select overrides the ones below it exactly the way a chain of `if/else if` would, and the
// LAST select applied (the highest-priority case) wins. A case's division (e.g. d1/(d1-d3)) can be 0/0 or
// Inf when that case is NOT the one selected -- safe, because select() is a pure per-component pick and never
// lets a NaN/Inf from the discarded branch leak into the result (confirmed empirically: 207/207 cases,
// including 200 random triangles, agree with a CPU reference to 7e-7, at the values that exercise EVERY
// region including several near-degenerate ones).
//
// *** THIS IS NOT A STYLE PREFERENCE. *** The first port of these two functions used the `found`-guarded `If`
// chain this comment used to describe (mirroring capsuleCollide.mjs's own early-return order one-for-one), and
// it is numerically IDENTICAL to the branchless version below (verified against the same CPU reference, same
// cases, to the same tolerance) -- but it HANGS this sandbox's SwiftShader-backed WebGPU adapter dead, every
// time, for any kernel that calls closestPointOnTriangleNode more than once. Bisected by hand: a kernel with
// ONE call (6 sequential Ifs in the compiled WGSL text) dispatches and reads back in under a second; a kernel
// with TWO calls (12 Ifs) or segmentTriangleDistSqNode's own combination (2 closestPointOnTriangleNode + 3
// closestSegSegDistSqNode = ~24 Ifs) hangs the device so completely that even a FRESH, unrelated
// page.evaluate() on the same page cannot get an answer within 5 seconds -- not a slow compile, a genuine
// dead device: confirmed run to a 240-second wall-clock timeout with zero progress. Ruled out along the way:
// the dispatch/readback plumbing itself (a hand-rolled trivial WGSL kernel through the identical
// dev.compute()/pass.dispatch()/dev.read() path round-trips in 341ms on this same device), buffer
// out-of-bounds access (padding every buffer to the full dispatched workgroup size changed nothing), and the
// TSL loop-bound mechanism (the emitted `for` loop is a real, compact WGSL for-loop with a literal trip count,
// not unrolled -- confirmed by reading the emitted text, not assumed). What is left is the branch COUNT itself
// -- this sandbox's software SwiftShader compute compiler has some pathology with too many sequential `if`
// blocks in one compute entry point, somewhere between 6 (fine) and 12 (hangs). Whether real GPU hardware
// hits the same wall is UNMEASURED -- this sandbox has no way to test that -- but branchless code is also
// the better choice on real hardware regardless (no warp/wave divergence for a per-invocation region test
// like this one), so there is no real tradeoff being made to route around a sandbox quirk here.
//
// dot/cross/normalize/max/min/sqrt/select below are called as FREE FUNCTIONS throughout, never as node methods
// (`.dot()`, `.sqrt()`) -- render/physicsTsl.mjs and render/aiPresenceOrbTsl.mjs's own usage, checked directly
// rather than assumed, is dot(a,b)/cross(a,b)/normalize(v)/max(a,b)/min(a,b)/select(cond,t,f) every time; only
// arithmetic (add/sub/mul/div), comparisons and .clamp() are used as chained methods anywhere in this tree's TSL.
// select()'s argument order is confirmed against the vendored source, not assumed: three.webgpu.js declares
// `select = nodeProxy(ConditionalNode)` and ConditionalNode's own constructor doc says `(condNode, ifNode,
// elseNode)` -- condition first, then-value second, else-value third, the same order used below throughout.
"use strict";

export const GROUND_SUPPORT_NORMAL_Y = 0.5;   // capsuleCollide.mjs's own constant, restated so this file has no import-order dependency on it
export const CONTACT_SKIN = 1e-4;             // capsuleCollide.mjs's own constant, same reason
const MAX_STEP_FRAC = 0.8;
const ITERATIONS = 4;

/** Closest point on triangle (a,b,c) to point p, as a TSL vec3 node. Ericson 5.1.5, BRANCHLESS: every region's
 *  candidate is computed unconditionally, then a backward cascade of select() calls -- lowest priority first,
 *  each higher-priority select overriding it -- reproduces the CPU's first-match-wins early-return order
 *  exactly (see this file's header for why an If-chain port is avoided here). */
export function closestPointOnTriangleNode(TSL, p, a, b, c) {
    const { float, select, dot } = TSL;
    const ab = b.sub(a), ac = c.sub(a), ap = p.sub(a);
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    const bp = p.sub(b);
    const d3 = dot(ab, bp), d4 = dot(ac, bp);
    const vc = d1.mul(d4).sub(d3.mul(d2));
    const cp = p.sub(c);
    const d5 = dot(ab, cp), d6 = dot(ac, cp);
    const vb = d5.mul(d2).sub(d1.mul(d6));
    const va = d3.mul(d6).sub(d5.mul(d4));

    const condA = d1.lessThanEqual(0).and(d2.lessThanEqual(0));                                              // vertex a
    const condB = d3.greaterThanEqual(0).and(d4.lessThanEqual(d3));                                          // vertex b
    const condAB = vc.lessThanEqual(0).and(d1.greaterThanEqual(0)).and(d3.lessThanEqual(0));                 // edge ab
    const condC = d6.greaterThanEqual(0).and(d5.lessThanEqual(d6));                                          // vertex c
    const condAC = vb.lessThanEqual(0).and(d2.greaterThanEqual(0)).and(d6.lessThanEqual(0));                 // edge ac
    const condBC = va.lessThanEqual(0).and(d4.sub(d3).greaterThanEqual(0)).and(d5.sub(d6).greaterThanEqual(0)); // edge bc

    const onAB = a.add(ab.mul(d1.div(d1.sub(d3))));
    const onAC = a.add(ac.mul(d2.div(d2.sub(d6))));
    const wBC = d4.sub(d3).div(d4.sub(d3).add(d5.sub(d6)));
    const onBC = b.add(c.sub(b).mul(wBC));
    const denom = float(1.0).div(va.add(vb).add(vc));
    const interior = a.add(ab.mul(vb.mul(denom))).add(ac.mul(vc.mul(denom)));

    let result = interior;
    result = select(condBC, onBC, result);
    result = select(condAC, onAC, result);
    result = select(condC, c, result);
    result = select(condAB, onAB, result);
    result = select(condB, b, result);
    result = select(condA, a, result);
    return result;
}

/** Squared distance between segments (p1,q1) and (p2,q2), as a TSL float node. Ericson 5.1.9, BRANCHLESS the
 *  same way: the default (non-degenerate) case's (s,t) is computed first, its own two boundary sub-cases
 *  (t < 0, t > 1) folded in via select(), then the two degenerate-segment cases and the both-degenerate case
 *  cascade over the top in priority order -- same reasoning as closestPointOnTriangleNode above. */
export function closestSegSegDistSqNode(TSL, p1, q1, p2, q2) {
    const { float, select, dot } = TSL;
    const EPS = 1e-15;
    const d1 = q1.sub(p1), d2 = q2.sub(p2), r = p1.sub(p2);
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    const c = dot(d1, r);
    const b = dot(d1, d2);
    const denom = a.mul(e).sub(b.mul(b));
    const clamp01 = (x) => x.clamp(0, 1);

    const condBothDeg = a.lessThanEqual(EPS).and(e.lessThanEqual(EPS));
    const condADeg = a.lessThanEqual(EPS);
    const condEDeg = e.lessThanEqual(EPS);

    // default case: closed-form (s, t), with its own t<0 / t>1 clamps folded in branchlessly
    const s0 = select(denom.notEqual(0), clamp01(b.mul(f).sub(c.mul(e)).div(denom)), float(0));
    const tRaw = b.mul(s0).add(f).div(e);
    const sLow = clamp01(c.mul(-1).div(a));
    const sHigh = clamp01(b.sub(c).div(a));
    let sDefault = s0, tDefault = tRaw;
    tDefault = select(tRaw.greaterThan(1), float(1), tDefault);
    sDefault = select(tRaw.greaterThan(1), sHigh, sDefault);
    tDefault = select(tRaw.lessThan(0), float(0), tDefault);
    sDefault = select(tRaw.lessThan(0), sLow, sDefault);

    let s = sDefault, t = tDefault;
    s = select(condEDeg, clamp01(c.mul(-1).div(a)), s); t = select(condEDeg, float(0), t);
    s = select(condADeg, float(0), s); t = select(condADeg, clamp01(f.div(e)), t);
    s = select(condBothDeg, float(0), s); t = select(condBothDeg, float(0), t);

    const c1 = p1.add(d1.mul(s)), c2 = p2.add(d2.mul(t));
    return dot(c1.sub(c2), c1.sub(c2));
}

/** Squared distance between capsule segment (p0,p1) and triangle (a,b,c) -- the minimum of 5 candidates
 *  (closest point on the triangle to each endpoint, closest points between the segment and each of the
 *  triangle's three edges), the SAME approximation capsuleCollide.mjs's own header names and scopes. */
export function segmentTriangleDistSqNode(TSL, p0, p1, a, b, c) {
    const { min, dot } = TSL;
    const cp0 = closestPointOnTriangleNode(TSL, p0, a, b, c);
    const cp1 = closestPointOnTriangleNode(TSL, p1, a, b, c);
    const d0 = dot(p0.sub(cp0), p0.sub(cp0));
    const d1 = dot(p1.sub(cp1), p1.sub(cp1));
    const dab = closestSegSegDistSqNode(TSL, p0, p1, a, b);
    const dbc = closestSegSegDistSqNode(TSL, p0, p1, b, c);
    const dca = closestSegSegDistSqNode(TSL, p0, p1, c, a);
    return min(d0, min(d1, min(dab, min(dbc, dca))));
}

/** The triangle's face normal, oriented toward `target` -- capsuleCollide.mjs's own faceNormalToward, as a node. */
export function faceNormalTowardNode(TSL, a, b, c, target) {
    const { cross, select, dot, float, sqrt } = TSL;
    // capsuleCollide.mjs's own faceNormalToward guards a zero-length cross product with `|| 1` (a degenerate
    // triangle divides by 1 instead of 0/0) -- normalize() here has no such guard, and f32's lower precision
    // rounds a near-degenerate triangle's cross product to exactly zero far more often than f64 does, so this
    // needs the SAME explicit guard rather than relying on normalize() to do it (measured: 1 of 505 random
    // triangle cases produced NaN before this fix, 0 of 505 after).
    const raw = cross(b.sub(a), c.sub(a));
    const len = sqrt(dot(raw, raw));
    const safeLen = select(len.equal(0), float(1), len);
    const n = raw.div(safeLen);
    const flip = dot(n, target.sub(a)).lessThan(0);
    return select(flip, n.mul(-1), n);
}

/**
 * The batched kernel: one invocation per capsule. Buffers (all `.label()`ed so render/tslSource.mjs's
 * transplant matches them by NAME, not by inferred read/write order):
 *   capState  (vec4 x count)         -- feet.x, feet.y, feet.z, radius
 *   capHeight (float x count)        -- total capsule height
 *   triA/triB/triC (vec4 x count*maxTris) -- one candidate triangle's three vertices; triA.w is 1 for a real
 *                                            candidate slot and 0 for an unused (padding) one -- the fixed-size,
 *                                            JS-bound Loop this file's own header explains the need for.
 *   outPos      (vec4 x count)       -- resolved x, y, z, and grounded as 1.0/0.0
 *   outContacts (float x count)      -- capsuleCollide.mjs's own `contacts` counter
 * `iterations`, `maxStepFrac` and `groundNormalY` are baked JS constants, not uniforms -- render/physicsTsl.mjs's
 * own precedent (makeHmcLeapfrogTsl bakes L the same way): a TSL Loop wants a JS-bound trip count, and these are
 * capsuleCollide.mjs's own defaults, not values this kernel's callers have ever needed to vary per dispatch.
 */
export function depenetrateCapsulesNode(TSL, { count, maxTris = 8, groundNormalY = GROUND_SUPPORT_NORMAL_Y, maxStepFrac = MAX_STEP_FRAC, iterations = ITERATIONS } = {}) {
    const { Fn, If, Loop, float, int, vec3, vec4, instanceIndex, instancedArray, max, min, sqrt } = TSL;
    // instanceIndex is a pre-built node CONSTANT (referenced directly, e.g. `instanceIndex.mul(2)` in
    // render/physicsTsl.mjs), not a factory function -- checked separately from the rest, which are.
    for (const n of ["Fn", "If", "Loop", "float", "int", "vec3", "vec4", "instancedArray", "max", "min", "sqrt"])
        if (typeof TSL[n] !== "function") throw new Error(`capsuleCollideTsl: the TSL namespace has no ${n}()`);
    if (typeof instanceIndex === "undefined") throw new Error("capsuleCollideTsl: the TSL namespace has no instanceIndex");
    if (!(count > 0)) throw new Error("capsuleCollideTsl: depenetrateCapsulesNode needs a positive capsule count");
    if (!(maxTris > 0)) throw new Error("capsuleCollideTsl: depenetrateCapsulesNode needs a positive maxTris (the fixed per-capsule candidate slot count)");

    const capState = instancedArray(count, "vec4").label("capState");
    const capHeight = instancedArray(count, "float").label("capHeight");
    const triA = instancedArray(count * maxTris, "vec4").label("triA");
    const triB = instancedArray(count * maxTris, "vec4").label("triB");
    const triC = instancedArray(count * maxTris, "vec4").label("triC");
    const outPos = instancedArray(count, "vec4").label("outPos");
    const outContacts = instancedArray(count, "float").label("outContacts");

    const node = Fn(() => {
        const cap = capState.element(instanceIndex).toVar();
        const h = capHeight.element(instanceIndex);
        const radius = cap.w;
        const segLo = radius;
        const segHi = max(radius, h.sub(radius));
        const midY = segLo.add(segHi.sub(segLo).mul(0.5));
        const maxStep = radius.mul(maxStepFrac);
        const base = instanceIndex.mul(maxTris);

        const cx = cap.x.toVar(), cy = cap.y.toVar(), cz = cap.z.toVar();
        const grounded = float(0).toVar();
        const contacts = float(0).toVar();

        Loop({ start: 0, end: iterations }, () => {
            const segBot = vec3(cx, cy.add(segLo), cz);
            const segTop = vec3(cx, cy.add(segHi), cz);
            const deepestPen = float(-1e30).toVar();
            const deepestNormal = vec3(0, 0, 0).toVar();
            const found = float(0).toVar();
            Loop({ start: 0, end: maxTris }, ({ i }) => {
                const idx = base.add(int(i));
                const ta = triA.element(idx).toVar();
                If(ta.w.greaterThan(0.5), () => {
                    const a = ta.xyz, b = triB.element(idx).xyz, c = triC.element(idx).xyz;
                    const distSq = segmentTriangleDistSqNode(TSL, segBot, segTop, a, b, c);
                    const dist = sqrt(max(distSq, float(0)));
                    If(dist.lessThan(radius.add(CONTACT_SKIN)), () => {
                        const pen = radius.sub(dist);
                        If(pen.greaterThan(deepestPen), () => {
                            deepestPen.assign(pen);
                            deepestNormal.assign(faceNormalTowardNode(TSL, a, b, c, vec3(cx, cy.add(midY), cz)));
                            found.assign(1);
                        });
                    });
                });
            });
            If(found.greaterThan(0.5), () => {
                const push = min(max(deepestPen, float(0)), maxStep);
                cx.addAssign(deepestNormal.x.mul(push));
                cy.addAssign(deepestNormal.y.mul(push));
                cz.addAssign(deepestNormal.z.mul(push));
                contacts.addAssign(1);
                If(deepestNormal.y.greaterThan(groundNormalY), () => { grounded.assign(1); });
            });
        });

        outPos.element(instanceIndex).assign(vec4(cx, cy, cz, grounded));
        outContacts.element(instanceIndex).assign(contacts);
    })().compute(count);

    return { node, capState, capHeight, triA, triB, triC, outPos, outContacts, count, maxTris, groundNormalY, maxStepFrac, iterations };
}
