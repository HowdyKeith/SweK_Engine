// tools/krbn/sceneMeshes.js
//
// The geometry behind the Krbn-compare scene picker. Each scene returns a MeshInput ({ positions, triangles }) so the
// compare page and the OBJ export work identically whichever one is chosen. Three are real and deterministic here: the
// blobulator's emitted mesh, the Gaussian-splat cloud (the same LCG and ellipsoids as swek-splat.krbn.ts), and the
// ragdoll rig (the same joints and bones as swek-ragdoll.krbn.ts). Flesh is left out for now -- its scene loads a marched
// swek-flesh.obj that isn't in the tree, so it needs that mesh wired before it can join the picker.

import { blobMeshInput } from "../krbnEmit.mjs";
import { makeBlobs } from "../../simulation/tomo/blobPhantom.js";
import { greedyMesh3d } from "../../mesh/greedyMesh3d.js";

// --- small mesh primitives ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };

function sphereMesh(c, radii, rings = 4, seg = 6) {
    const [rx, ry, rz] = Array.isArray(radii) ? radii : [radii, radii, radii];
    const positions = [], triangles = [], w = seg + 1;
    for (let i = 0; i <= rings; i++) { const ph = Math.PI * i / rings; for (let j = 0; j <= seg; j++) { const th = 2 * Math.PI * j / seg; positions.push([c[0] + rx * Math.sin(ph) * Math.cos(th), c[1] + ry * Math.sin(ph) * Math.sin(th), c[2] + rz * Math.cos(ph)]); } }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = i * w + j; triangles.push([a, a + 1, a + w], [a + 1, a + w + 1, a + w]); }
    return { positions, triangles };
}

function cylinderMesh(a, b, r, seg = 6) {
    const axis = norm(sub(b, a));
    let up = Math.abs(axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const u = norm(cross(axis, up)), v = cross(axis, u);
    const positions = [], triangles = [];
    for (const c of [a, b]) for (let j = 0; j <= seg; j++) { const th = 2 * Math.PI * j / seg; positions.push([c[0] + r * (Math.cos(th) * u[0] + Math.sin(th) * v[0]), c[1] + r * (Math.cos(th) * u[1] + Math.sin(th) * v[1]), c[2] + r * (Math.cos(th) * u[2] + Math.sin(th) * v[2])]); }
    const w = seg + 1;
    for (let j = 0; j < seg; j++) { const p0 = j, p1 = j + 1, p2 = w + j, p3 = w + j + 1; triangles.push([p0, p1, p2], [p1, p3, p2]); }
    return { positions, triangles };
}

function merge(meshes) {
    const positions = [], triangles = [];
    for (const m of meshes) { const off = positions.length; for (const p of m.positions) positions.push(p); for (const t of m.triangles) triangles.push([t[0] + off, t[1] + off, t[2] + off]); }
    return { positions, triangles };
}

// --- flesh: a capsule field over the ragdoll's bones, marched with the same mesher as the blob --------
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// signed distance to a capsule (segment a-b, radius r): negative inside.
function capsuleSDF(p, a, b, r) {
    const pa = sub(p, a), ba = sub(b, a);
    const h = Math.max(0, Math.min(1, dot3(pa, ba) / (dot3(ba, ba) || 1)));
    const d = [pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h];
    return Math.hypot(d[0], d[1], d[2]) - r;
}
// smooth union of two SDFs (polynomial smin), blend k.
function smin(a, b, k) { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b * (1 - h) + a * h - k * h * (1 - h); }

// the 11 bone capsules, same segments as the ragdoll rig.
function fleshBones() {
    const P = (x, y, z) => [x, z, y - 6.3], addv = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
    const bones = [
        [P(0, 5.8, 0), addv(P(0, 5.8, 0), [0, 0, 0.92]), 0.34],   // pelvis -> chest
        [P(0, 6.94, 0), addv(P(0, 6.94, 0), [0, 0, 0.2]), 0.14],  // neck
        [P(0, 7.32, 0), addv(P(0, 7.32, 0), [0, 0, 0.02]), 0.27], // head
    ];
    for (const s of [-1, 1]) {
        bones.push([P(s * 0.42, 6.72, 0), addv(P(s * 0.42, 6.72, 0), [s * 0.62, 0, 0]), 0.15]);   // upper arm
        bones.push([P(s * 1.06, 6.72, 0), addv(P(s * 1.06, 6.72, 0), [s * 0.7, 0, 0]), 0.115]);   // forearm
        bones.push([P(s * 0.22, 5.76, 0), addv(P(s * 0.22, 5.76, 0), [0, 0, -0.84]), 0.17]);      // thigh
        bones.push([P(s * 0.22, 4.88, 0), addv(P(s * 0.22, 4.88, 0), [0, 0, -0.84]), 0.14]);      // shin
    }
    return bones;
}

// march an occupancy field with greedyMesh3d and stitch the quads into a MeshInput (the blob's exact pattern).
function marchField(solid, n, toWorld) {
    const quads = greedyMesh3d((x, y, z) => (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) ? false : solid(x, y, z), [n, n, n]);
    const positions = [], triangles = [], index = new Map();
    const vid = (x, y, z, ox = 0, oy = 0, oz = 0) => { x += ox; y += oy; z += oz; const k = x + "," + y + "," + z; let i = index.get(k); if (i === undefined) { i = positions.length; positions.push(toWorld(x, y, z)); index.set(k, i); } return i; };
    for (const q of quads) {
        const [px, py, pz] = q.pos, [ux, uy, uz] = q.du, [vx, vy, vz] = q.dv;
        const corner = (su, sv) => vid(px + ux * su, py + uy * su, pz + uz * su, vx * sv, vy * sv, vz * sv);
        const a = corner(0, 0), b = corner(q.w, 0), c = corner(q.w, q.h), d = corner(0, q.h);
        triangles.push([a, b, c], [a, c, d]);
    }
    return { positions, triangles };
}

// The skin: smooth-union of the bone capsules, marched. Same voxel mesher as the blob (blocky, honest); the .krbn scene
// uses true marching cubes for a smooth surface, which is a fidelity upgrade, not a different idea.
export function fleshMesh(n = 40) {
    const bones = fleshBones(), K = 0.16;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const [a, b, r] of bones) for (const p of [a, b]) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] - r - K); hi[i] = Math.max(hi[i], p[i] + r + K); }
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const side = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) + 0.3, cell = side / n;
    const origin = [center[0] - side / 2, center[1] - side / 2, center[2] - side / 2];
    const toWorld = (x, y, z) => [origin[0] + x * cell, origin[1] + y * cell, origin[2] + z * cell];
    const fieldSDF = (p) => { let d = capsuleSDF(p, bones[0][0], bones[0][1], bones[0][2]); for (let i = 1; i < bones.length; i++) d = smin(d, capsuleSDF(p, bones[i][0], bones[i][1], bones[i][2]), K); return d; };
    const solid = (x, y, z) => fieldSDF(toWorld(x, y, z)) <= 0;
    return marchField(solid, n, toWorld);
}

// --- the scenes --------------------------------------------------------------------------------------
export function blobMesh() { return blobMeshInput(makeBlobs(), { n: 24 }); }

// The Gaussian-splat cloud: same LCG, same anisotropic ellipsoids, same seed as swek-splat.krbn.ts.
export function splatMesh() {
    let s = 20250716; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const N = 44, parts = [];
    for (let i = 0; i < N; i++) {
        const core = i < N * 0.55, r = core ? 1.5 : 3.0;
        const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), rad = r * Math.cbrt(rnd());
        const c = [rad * Math.sin(ph) * Math.cos(th), rad * Math.sin(ph) * Math.sin(th), rad * Math.cos(ph) * 0.62];
        const radii = [0.30 + rnd() * (core ? 0.34 : 0.20), 0.22 + rnd() * (core ? 0.30 : 0.16), 0.16 + rnd() * (core ? 0.24 : 0.13)];
        parts.push(sphereMesh(c, radii, 3, 5));
    }
    return merge(parts);
}

// The ragdoll rig: the same joints (spheres) and bones (cylinders) as swek-ragdoll.krbn.ts.
export function ragdollMesh() {
    const P = (x, y, z) => [x, z, y - 6.3];
    const add = (start, dir, r) => cylinderMesh(P(...start), [P(...start)[0] + dir[0], P(...start)[1] + dir[1], P(...start)[2] + dir[2]], r);
    const parts = [];
    parts.push(cylinderMesh(P(0, 5.8, 0), [P(0, 5.8, 0)[0], P(0, 5.8, 0)[1], P(0, 5.8, 0)[2] + 0.92], 0.3));   // pelvis->chest
    parts.push(sphereMesh(P(0, 7.32, 0), 0.245));                                                                // head
    parts.push(cylinderMesh(P(0, 6.94, 0), [P(0, 6.94, 0)[0], P(0, 6.94, 0)[1], P(0, 6.94, 0)[2] + 0.2], 0.085)); // neck
    for (const s of [-1, 1]) {
        parts.push(add([s * 0.42, 6.72, 0], [s * 0.62, 0, 0], 0.135));   // upper arm
        parts.push(add([s * 1.06, 6.72, 0], [s * 0.7, 0, 0], 0.105));    // forearm
        parts.push(sphereMesh(P(s * 0.42, 6.72, 0), 0.115));             // shoulder
        parts.push(sphereMesh(P(s * 1.06, 6.72, 0), 0.09));             // elbow
        parts.push(add([s * 0.22, 5.76, 0], [0, 0, -0.84], 0.155));      // thigh
        parts.push(add([s * 0.22, 4.88, 0], [0, 0, -0.84], 0.125));      // shin
        parts.push(sphereMesh(P(s * 0.22, 5.76, 0), 0.125));            // hip
        parts.push(sphereMesh(P(s * 0.22, 4.88, 0), 0.1));             // knee
    }
    return merge(parts);
}

export const SCENES = { blob: blobMesh, splat: splatMesh, ragdoll: ragdollMesh, flesh: () => fleshMesh() };
export function sceneMesh(name) { const f = SCENES[name] || SCENES.blob; return f(); }
