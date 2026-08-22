// WebGLEngine/physics/obbContact-selfcheck.mjs — v2640
//
// Run: node physics/obbContact-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The contact is only correct if acting on it works: pushing a body by depth*normal must make the overlap vanish,
// and pushing by a hair less must leave them overlapping. That single property -- checked on rotated pairs, where
// the minimum axis is often an edge-edge cross product -- pins the depth AND the normal at once. The rest confirms
// the normal is a unit vector pointing a->b, that contact agrees with the boolean test on hit/miss, and that the
// known axis-aligned case gives the exact depth.
import { obbOverlap, obbContact } from "./obbOverlap.js";
import { rotateByQuat } from "./voxelPose.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const qZ = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const axesFromQ = (q) => [rotateByQuat(q, [1, 0, 0]), rotateByQuat(q, [0, 1, 0]), rotateByQuat(q, [0, 0, 1])];
const move = (box, n, s) => ({ center: [box.center[0] + n[0] * s, box.center[1] + n[1] * s, box.center[2] + n[2] * s], half: box.half, axes: box.axes });

// ---- 1. AXIS-ALIGNED: KNOWN DEPTH AND NORMAL ---------------------------------------------------------------------
{
    const a = { center: [0, 0, 0], half: [1, 1, 1], axes: I };
    const b = { center: [1.5, 0, 0], half: [1, 1, 1], axes: I };   // overlap on x = (1+1) - 1.5 = 0.5
    const c = obbContact(a, b);
    ok("!! axis-aligned overlap gives the exact depth and axis normal", c.hit && near(c.depth, 0.5) && near(Math.abs(c.normal[0]), 1) && near(c.normal[1], 0) && near(c.normal[2], 0),
       "unit cubes 1.5 apart overlap by 0.5 along x; contact depth " + (c.depth || 0).toFixed(3) + ", normal on x. The base case is a plain interval overlap.");
}

// ---- 2. THE PUSH-APART PROPERTY (the whole point), on rotated pairs -------------------------------------------------
{
    let good = true, tested = 0;
    for (let i = 0; i < 30; i++) {
        const qa = qZ(0.21 * i), qb = [Math.sin(0.13 * i) * 0.5, Math.sin(0.09 * i) * 0.4, Math.cos(0.13 * i) * 0.5, Math.cos(0.09 * i) * 0.4];
        const a = { center: [0, 0, 0], half: [1, 0.7, 1.3], axes: axesFromQ(qa) };
        for (let d = 0.2; d < 2.4; d += 0.2) {
            const b = { center: [d, d * 0.4, d * 0.25], half: [1.1, 0.9, 0.8], axes: axesFromQ(qb) };
            const c = obbContact(a, b);
            if (!c.hit) continue;
            tested++;
            const justOut = move(b, c.normal, c.depth + 1e-5);    // push exactly past contact -> must separate
            const justIn = move(b, c.normal, c.depth - 1e-5);     // a hair short -> must still overlap
            if (obbOverlap(a, justOut)) good = false;             // still overlapping after a full push -> depth too small
            if (!obbOverlap(a, justIn)) good = false;             // already separated before the push -> depth too big
        }
    }
    ok("!! pushing by depth*normal separates the pair, and a hair less does not", good && tested > 20,
       "across " + tested + " overlapping rotated pairs, moving b by the full MTV just clears the overlap and moving a hair less keeps it -- so the depth is EXACT and the normal is the true separating direction, including edge-edge cases.");
}

// ---- 3. THE NORMAL IS A UNIT VECTOR POINTING a -> b ---------------------------------------------------------------
{
    const a = { center: [0, 0, 0], half: [1, 1, 1], axes: axesFromQ(qZ(0.6)) };
    const b = { center: [1.2, 0.3, 0], half: [1, 1, 1], axes: axesFromQ(qZ(-0.4)) };
    const c = obbContact(a, b);
    const len = Math.hypot(c.normal[0], c.normal[1], c.normal[2]);
    const towardB = (b.center[0] - a.center[0]) * c.normal[0] + (b.center[1] - a.center[1]) * c.normal[1] + (b.center[2] - a.center[2]) * c.normal[2];
    ok("!! the contact normal is unit length and points from a toward b", near(len, 1) && towardB > 0,
       "|normal| = " + len.toFixed(6) + ", and it points along b - a (dot " + towardB.toFixed(3) + " > 0) -- so b is pushed away from a, not into it.");
}

// ---- 4. CONTACT AGREES WITH THE BOOLEAN TEST ON HIT/MISS ----------------------------------------------------------
{
    let good = true, hits = 0, misses = 0;
    for (let k = 0; k < 400; k++) {
        const a = { center: [0, 0, 0], half: [1, 0.6, 1.2], axes: axesFromQ(qZ(k * 0.11)) };
        const b = { center: [(k % 9) * 0.4 - 1.2, (k % 5) * 0.5 - 1, (k % 4) * 0.6 - 0.6], half: [0.9, 1.0, 0.7], axes: axesFromQ(qZ(k * 0.07 + 1)) };
        const hit = obbContact(a, b).hit, bool = obbOverlap(a, b);
        if (hit !== bool) good = false;
        if (bool) hits++; else misses++;
    }
    ok("!! obbContact.hit matches obbOverlap on every pair", good && hits > 10 && misses > 10,
       "over 400 pairs (" + hits + " hits, " + misses + " misses) contact and the boolean test never disagree -- resolution sees exactly the collisions detection does.");
}

console.log(fails ? "\nobbContact-selfcheck: " + fails + " FAILED" : "\nobbContact-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
