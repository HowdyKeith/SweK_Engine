// WebGLEngine/physics/obbOverlap.js — v2639
//
// The narrow phase. The broad-phase (broadPhase.js) hands back candidate pairs whose world AABBs touch; this
// confirms the real collision. Once a voxel body rotates, its cover boxes are ORIENTED boxes, so the correct test
// is OBB-vs-OBB by the Separating Axis Theorem: two convex boxes miss if and only if one of 15 axes separates them
// (3 face normals of each box + 9 edge-edge cross products). Faces alone are not enough -- two tilted boxes can
// clear each other on an edge-edge axis while every face axis still overlaps.
//
// WHY THIS MATTERS BEYOND correctness: SAT here uses only +, -, *, and abs on doubles. Those are IEEE-754 exact and
// bit-identical on every platform, so this collision test is CROSS-ARCH DETERMINISTIC BY CONSTRUCTION -- no host
// transcendental, no WASM. It is the pure-JS, lockstep-safe collision path that runs anywhere box3d cannot load, and
// its determinism is provable by the same grep guarantee as strict-libm: no Math.sin/cos/tan/etc. anywhere in it.
//
// An OBB is { center:[x,y,z], half:[x,y,z], axes:[u0,u1,u2] } with u0,u1,u2 the box's orthonormal world axes.
// obbFromPosed({center,half,quat}) builds one from a posed cover box (voxelPose output).

import { rotateByQuat } from "./voxelPose.js";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const EPS = 1e-12;   // guards the parallel-edge case, where a cross-product axis is near zero (Ericson)

export function obbFromPosed(box) {
    const q = box.quat || [0, 0, 0, 1];
    return {
        center: box.center,
        half: box.half,
        axes: [rotateByQuat(q, [1, 0, 0]), rotateByQuat(q, [0, 1, 0]), rotateByQuat(q, [0, 0, 1])],
    };
}

// SAT overlap test for two OBBs. Returns true if they intersect. Ericson, Real-Time Collision Detection 4.4.1.
export function obbOverlap(a, b) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const AbsR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] = dot(a.axes[i], b.axes[j]);

    // translation, expressed in a's frame
    const tw = [b.center[0] - a.center[0], b.center[1] - a.center[1], b.center[2] - a.center[2]];
    const t = [dot(tw, a.axes[0]), dot(tw, a.axes[1]), dot(tw, a.axes[2])];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) AbsR[i][j] = Math.abs(R[i][j]) + EPS;

    const ae = a.half, be = b.half;
    let ra, rb;

    // L = A0, A1, A2
    for (let i = 0; i < 3; i++) {
        ra = ae[i];
        rb = be[0] * AbsR[i][0] + be[1] * AbsR[i][1] + be[2] * AbsR[i][2];
        if (Math.abs(t[i]) > ra + rb) return false;
    }
    // L = B0, B1, B2
    for (let j = 0; j < 3; j++) {
        ra = ae[0] * AbsR[0][j] + ae[1] * AbsR[1][j] + ae[2] * AbsR[2][j];
        rb = be[j];
        if (Math.abs(t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]) > ra + rb) return false;
    }
    // L = A0 x B0..B2
    ra = ae[1] * AbsR[2][0] + ae[2] * AbsR[1][0]; rb = be[1] * AbsR[0][2] + be[2] * AbsR[0][1];
    if (Math.abs(t[2] * R[1][0] - t[1] * R[2][0]) > ra + rb) return false;
    ra = ae[1] * AbsR[2][1] + ae[2] * AbsR[1][1]; rb = be[0] * AbsR[0][2] + be[2] * AbsR[0][0];
    if (Math.abs(t[2] * R[1][1] - t[1] * R[2][1]) > ra + rb) return false;
    ra = ae[1] * AbsR[2][2] + ae[2] * AbsR[1][2]; rb = be[0] * AbsR[0][1] + be[1] * AbsR[0][0];
    if (Math.abs(t[2] * R[1][2] - t[1] * R[2][2]) > ra + rb) return false;
    // L = A1 x B0..B2
    ra = ae[0] * AbsR[2][0] + ae[2] * AbsR[0][0]; rb = be[1] * AbsR[1][2] + be[2] * AbsR[1][1];
    if (Math.abs(t[0] * R[2][0] - t[2] * R[0][0]) > ra + rb) return false;
    ra = ae[0] * AbsR[2][1] + ae[2] * AbsR[0][1]; rb = be[0] * AbsR[1][2] + be[2] * AbsR[1][0];
    if (Math.abs(t[0] * R[2][1] - t[2] * R[0][1]) > ra + rb) return false;
    ra = ae[0] * AbsR[2][2] + ae[2] * AbsR[0][2]; rb = be[0] * AbsR[1][1] + be[1] * AbsR[1][0];
    if (Math.abs(t[0] * R[2][2] - t[2] * R[0][2]) > ra + rb) return false;
    // L = A2 x B0..B2
    ra = ae[0] * AbsR[1][0] + ae[1] * AbsR[0][0]; rb = be[1] * AbsR[2][2] + be[2] * AbsR[2][1];
    if (Math.abs(t[1] * R[0][0] - t[0] * R[1][0]) > ra + rb) return false;
    ra = ae[0] * AbsR[1][1] + ae[1] * AbsR[0][1]; rb = be[0] * AbsR[2][2] + be[2] * AbsR[2][0];
    if (Math.abs(t[1] * R[0][1] - t[0] * R[1][1]) > ra + rb) return false;
    ra = ae[0] * AbsR[1][2] + ae[1] * AbsR[0][2]; rb = be[0] * AbsR[2][1] + be[1] * AbsR[2][0];
    if (Math.abs(t[1] * R[0][2] - t[0] * R[1][2]) > ra + rb) return false;

    return true;   // no separating axis found -> the boxes overlap
}

// Face-only test (6 axes) -- NOT a correct OBB test; kept so the gate can show the 9 edge-edge axes are load-bearing.
export function obbOverlapFacesOnly(a, b) {
    const tw = [b.center[0] - a.center[0], b.center[1] - a.center[1], b.center[2] - a.center[2]];
    const proj = (axis, box) => Math.abs(dot(axis, box.axes[0])) * box.half[0] + Math.abs(dot(axis, box.axes[1])) * box.half[1] + Math.abs(dot(axis, box.axes[2])) * box.half[2];
    for (const box of [a, b]) for (const axis of box.axes) {
        if (Math.abs(dot(tw, axis)) > proj(axis, a) + proj(axis, b)) return false;
    }
    return true;
}

// Contact resolution: the Minimum Translation Vector. Returns { hit, normal, depth } where normal points from a
// toward b and moving b by depth*normal just separates the pair. The MTV is the axis of LEAST overlap among the
// same 15 SAT axes -- so detection and resolution are the same theorem. Cross-product axes are normalised (the one
// sqrt here is IEEE-exact, so this stays cross-arch deterministic); degenerate parallel-edge axes are skipped as
// redundant with a face axis.
export function obbContact(a, b) {
    const d = [b.center[0] - a.center[0], b.center[1] - a.center[1], b.center[2] - a.center[2]];
    let bestDepth = Infinity, bestNormal = null;
    const proj = (n, box) => Math.abs(dot(n, box.axes[0])) * box.half[0] + Math.abs(dot(n, box.axes[1])) * box.half[1] + Math.abs(dot(n, box.axes[2])) * box.half[2];
    const consider = (L) => {
        const len2 = L[0] * L[0] + L[1] * L[1] + L[2] * L[2];
        if (len2 < EPS) return true;                     // parallel edges -> redundant with a face axis, skip
        const inv = 1 / Math.sqrt(len2);
        const n = [L[0] * inv, L[1] * inv, L[2] * inv];
        const dist = dot(n, d);
        const overlap = proj(n, a) + proj(n, b) - Math.abs(dist);
        if (overlap <= 0) return false;                  // a separating axis -> no contact
        if (overlap < bestDepth) { bestDepth = overlap; bestNormal = dist < 0 ? [-n[0], -n[1], -n[2]] : n; }
        return true;
    };
    for (const L of a.axes) if (!consider(L)) return { hit: false };
    for (const L of b.axes) if (!consider(L)) return { hit: false };
    for (const u of a.axes) for (const v of b.axes) if (!consider(cross(u, v))) return { hit: false };
    return { hit: true, normal: bestNormal, depth: bestDepth };
}
