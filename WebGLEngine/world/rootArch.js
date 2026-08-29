// WebGLEngine/world/rootArch.js — v4077
// ---------------------------------------------------------------------------------------------------------------
// A PROCEDURAL ROOT/ARCH: a swept-tube spline with recursive tapering offshoots. Pure geometry -- no GL, no DOM,
// no Three -- so the SAME structure can be drawn on voxel terrain and on the planet by two different renderers,
// the same separation render/mossField.js and render/cloudField.js already keep between placement and drawing.
//
// Keith: could Sylva's (github.com/MengTo/sylva -- all-rights-reserved, so nothing of its CODE is used, only the
// idea of a procedural root/arch) geometry fold into the engine, alongside the moss it also showed. v4076 shipped
// moss and deliberately left this for its own round, naming it rather than dropping it silently; this is that
// round.
//
// *** ONE LANDMARK, NOT SCATTERED GROUND COVER, AND THAT IS A DELIBERATE DIFFERENCE FROM MOSS. *** A natural rock
// arch or an exposed root arching over ground is RARE in reality -- it is a landmark you notice, not a texture
// underfoot. So this builds ONE structure per call, placed once at world/planet init (world/rootArchPlace.js's
// consumers do not rebuild it as the camera moves the way render/vegetation.js or render/mossPatches.js do),
// rather than a scattered field of many.
//
// *** THE SWEEP, AND WHY THE FRAME IS PARALLEL-TRANSPORTED RATHER THAN RECOMPUTED AT EVERY SAMPLE. ***
// A circular cross-section is extruded along a path; naively rebuilding a "right/up" frame from the tangent at
// every sample independently is the textbook way to get a TWISTED tube, because two nearby-but-not-identical
// tangents can pick unrelated frames when computed from scratch. Here the frame is carried forward: at each new
// sample, ONLY the rotation that takes the OLD tangent to the NEW one is applied to the OLD frame (Rodrigues'
// formula), so the frame turns exactly as much as the path does and no more. This is the same species of problem
// world/planetSurface.js's tangentFrame() solves for a direction on a sphere, solved here for a moving point on
// a curve instead.
//
// *** EACH BRANCH IS ITS OWN CLOSED, CAPPED SOLID, SO world/spaceStructures.js's meshVolume() CAN GRADE IT. ***
// A cap disk closes both ends of every tapered tube, and meshVolume (imported, not re-derived) must be positive
// for a properly wound closed mesh -- exactly the check spaceStructures.js already uses for asteroids. WHAT THIS
// DOES NOT DO: a true boolean union where a branch meets its parent. Branches embed slightly into the trunk they
// grow from rather than blending into one seamless surface -- an accepted simplification for a thin offshoot
// against a much thicker trunk, stated rather than hidden, and irrelevant to whether each PIECE is itself sound.
//
// DETERMINISTIC: the one seeded PRNG this whole tree shares (world/procPlanet.js's mulberry32) drives every
// jittered control point and branch angle, so a seed names a structure exactly as it names a planet or a sky.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { rng } from "./procPlanet.js";
import { meshVolume } from "./spaceStructures.js";

const norm3 = (v) => { const n = 1 / (Math.hypot(v[0], v[1], v[2]) || 1); return [v[0] * n, v[1] * n, v[2] * n]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a, b, t) => add(scale3(a, 1 - t), scale3(b, t));

/** Quadratic Bezier point and (unnormalized) tangent through three control points. */
function bezier(p0, p1, p2, t) {
    const a = lerp3(p0, p1, t), b = lerp3(p1, p2, t);
    return lerp3(a, b, t);
}
function bezierTangent(p0, p1, p2, t) {
    return add(scale3(sub(p1, p0), 2 * (1 - t)), scale3(sub(p2, p1), 2 * t));
}

/** Rodrigues' rotation formula: rotate vector v about unit axis by angle (radians). */
function rotateVec(v, axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const kv = cross(axis, v), kd = dot(axis, v);
    return [
        v[0] * c + kv[0] * s + axis[0] * kd * (1 - c),
        v[1] * c + kv[1] * s + axis[1] * kd * (1 - c),
        v[2] * c + kv[2] * s + axis[2] * kd * (1 - c),
    ];
}

/** The first frame at the path's start: any unit vector perpendicular to the tangent, picked deterministically. */
function initialFrame(tangent) {
    const ref = Math.abs(tangent[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
    const right = norm3(cross(ref, tangent));
    const up = norm3(cross(tangent, right));
    return { right, up };
}

/**
 * A closed, capped, tapered tube along a quadratic-Bezier path. `r0`/`r1` are the radius at the start and end;
 * `sides` is the cross-section polygon's vertex count; `samples` is how many rings the tube is built from.
 * Returns { positions, normals, indices, vertexCount, triangleCount }, the SAME shape
 * world/spaceStructures.js's asteroidMesh returns.
 */
export function sweptTube(p0, p1, p2, { r0 = 0.4, r1 = 0.12, sides = 8, samples = 14 } = {}) {
    const rings = [];   // each ring: { center, right, up, r }
    let tangent = norm3(bezierTangent(p0, p1, p2, 0));
    let frame = initialFrame(tangent);
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const center = bezier(p0, p1, p2, t);
        const newTangent = norm3(bezierTangent(p0, p1, p2, t));
        if (i > 0) {
            const c = Math.max(-1, Math.min(1, dot(tangent, newTangent)));
            const angle = Math.acos(c);
            if (angle > 1e-9) {
                const axis = norm3(cross(tangent, newTangent));
                frame = { right: norm3(rotateVec(frame.right, axis, angle)), up: norm3(rotateVec(frame.up, axis, angle)) };
            }
        }
        tangent = newTangent;
        rings.push({ center, right: frame.right, up: frame.up, r: r0 + (r1 - r0) * t, tangent });
    }

    const positions = [], normals = [];
    // ring vertices, one normal ring later derived from the tube's own radial direction (cheap and correct for
    // a circular cross-section: the outward normal at a ring vertex IS the radial direction there).
    const ringVertIdx = [];
    for (const ring of rings) {
        const idxRow = [];
        for (let s = 0; s < sides; s++) {
            const a = (s / sides) * Math.PI * 2;
            const rad = add(scale3(ring.right, Math.cos(a)), scale3(ring.up, Math.sin(a)));
            const p = add(ring.center, scale3(rad, ring.r));
            idxRow.push(positions.length / 3);
            positions.push(p[0], p[1], p[2]);
            normals.push(rad[0], rad[1], rad[2]);
        }
        ringVertIdx.push(idxRow);
    }
    const indices = [];
    for (let i = 0; i < rings.length - 1; i++) {
        for (let s = 0; s < sides; s++) {
            const s2 = (s + 1) % sides;
            const a = ringVertIdx[i][s], b = ringVertIdx[i][s2], c = ringVertIdx[i + 1][s], d = ringVertIdx[i + 1][s2];
            indices.push(a, b, c,  b, d, c);
        }
    }
    // cap disks -- close the tube so meshVolume() is a real closed-solid claim, not a divergence-theorem sum
    // over an open shell that happens to return a number.
    const capCenter = (ring, sign) => {
        const idx = positions.length / 3;
        positions.push(ring.center[0], ring.center[1], ring.center[2]);
        const n = scale3(ring.tangent, sign);
        normals.push(n[0], n[1], n[2]);
        return idx;
    };
    const startCap = capCenter(rings[0], -1);
    for (let s = 0; s < sides; s++) {
        const s2 = (s + 1) % sides;
        indices.push(startCap, ringVertIdx[0][s2], ringVertIdx[0][s]);
    }
    const endCap = capCenter(rings[rings.length - 1], 1);
    const last = rings.length - 1;
    for (let s = 0; s < sides; s++) {
        const s2 = (s + 1) % sides;
        indices.push(endCap, ringVertIdx[last][s], ringVertIdx[last][s2]);
    }

    return {
        positions: new Float32Array(positions), normals: new Float32Array(normals),
        indices: new Uint32Array(indices),
        vertexCount: positions.length / 3, triangleCount: indices.length / 3,
        startPoint: rings[0].center, endPoint: rings[last].center, endTangent: rings[last].tangent,
    };
}

/**
 * Merge several {positions,normals,indices} meshes into one, offsetting each's indices past the ones before it.
 * Returns per-mesh {vertexStart,vertexCount,indexStart,indexCount} alongside the merge, so a caller (or a gate)
 * can slice out any ONE branch's own indices from the merged buffers afterward -- e.g. to compute that single
 * branch's own meshVolume(), rather than only ever being able to check the combined structure as a whole.
 */
function mergeMeshes(meshes) {
    let vCount = 0, iCount = 0;
    for (const m of meshes) { vCount += m.positions.length / 3; iCount += m.indices.length; }
    const positions = new Float32Array(vCount * 3), normals = new Float32Array(vCount * 3), indices = new Uint32Array(iCount);
    const spans = [];
    let vOff = 0, iOff = 0;
    for (const m of meshes) {
        positions.set(m.positions, vOff * 3); normals.set(m.normals, vOff * 3);
        for (let k = 0; k < m.indices.length; k++) indices[iOff + k] = m.indices[k] + vOff;
        spans.push({ vertexStart: vOff, vertexCount: m.positions.length / 3, indexStart: iOff, indexCount: m.indices.length });
        vOff += m.positions.length / 3; iOff += m.indices.length;
    }
    return { positions, normals, indices, vertexCount: vCount, triangleCount: indices.length / 3, spans };
}

/** One branch's own indices, LOCAL to its own vertex range (0-based), so meshVolume() can be run on it alone. */
export function branchIndices(merged, span) {
    const out = new Uint32Array(span.indexCount);
    for (let k = 0; k < span.indexCount; k++) out[k] = merged.indices[span.indexStart + k] - span.vertexStart;
    return out;
}

/**
 * THE FULL STRUCTURE: one main arch, plus recursive tapering offshoots. Deterministic from `seed`. `span` and
 * `height` describe the MAIN arch in world units; everything downstream (branch length, radius, depth) scales
 * from them, so a caller can grow a small root or a tall arch from the same function.
 *
 * Returns the merged mesh (same shape as sweptTube/asteroidMesh) plus `branchCount` (>= 1, the main arch counts
 * as one) and `landingPoint` (the far end of the main arch, useful for a caller placing something at its foot).
 */
export function rootArch(seed, opts = {}) {
    const span = opts.span ?? 6, height = opts.height ?? 3.2;
    const baseRadius = opts.baseRadius ?? 0.4, tipRadius = opts.tipRadius ?? 0.1;
    const branchesPerLevel = opts.branchesPerLevel ?? 2, maxDepth = opts.maxDepth ?? 2;
    const sides = opts.sides ?? 8, samples = opts.samples ?? 14;

    const r = rng(seed >>> 0);
    const rnd = (a, b) => a + r() * (b - a);

    const p0 = [-span / 2, 0, 0];
    const p1 = [rnd(-0.6, 0.6), height * rnd(0.85, 1.15), rnd(-0.8, 0.8)];
    const p2 = [span / 2, 0, rnd(-0.4, 0.4)];
    const main = sweptTube(p0, p1, p2, { r0: baseRadius, r1: baseRadius * 0.7, sides, samples });
    const meshes = [main];
    const meta = [{ depth: 0, r0: baseRadius, r1: baseRadius * 0.7, length: span }];   // depth 0 = the main arch

    // recursive offshoots: a handful of points along a parent branch's own path, each growing a shorter,
    // thinner tube that veers off at a jittered angle. Scale (radius AND length) drops by a fixed factor per
    // depth level, which is what makes "the branches get smaller" a measurable property rather than a look --
    // and `meta` below (paired 1:1 with `meshes`) is what lets a gate MEASURE that on the output, not just
    // trust that this loop does what its comment says.
    const SCALE_PER_LEVEL = 0.55;
    function grow(parentP0, parentP1, parentP2, r0, depth) {
        if (depth > maxDepth) return;
        const n = Math.round(rnd(branchesPerLevel * 0.6, branchesPerLevel * 1.4));
        for (let i = 0; i < n; i++) {
            const t = rnd(0.25, 0.75);
            const base = bezier(parentP0, parentP1, parentP2, t);
            const tan = norm3(bezierTangent(parentP0, parentP1, parentP2, t));
            const frame = initialFrame(tan);
            const veerAngle = rnd(0.6, 1.4) * (r() < 0.5 ? -1 : 1);
            const veer = norm3(add(scale3(tan, Math.cos(veerAngle)), scale3(frame.up, Math.sin(veerAngle))));
            const len = (span * 0.35) * Math.pow(SCALE_PER_LEVEL, depth - 1);
            const bp0 = base;
            const bp1 = add(base, scale3(add(veer, [0, 0.4, 0]), len * 0.5));
            const bp2 = add(base, scale3(veer, len));
            const rr0 = r0 * SCALE_PER_LEVEL, rr1 = rr0 * 0.5;
            if (rr0 < 0.01) continue;   // refuses to build a branch too thin to see rather than emitting a sliver
            const tube = sweptTube(bp0, bp1, bp2, { r0: rr0, r1: rr1, sides: Math.max(5, sides - depth), samples: Math.max(6, samples - depth * 3) });
            meshes.push(tube);
            meta.push({ depth, r0: rr0, r1: rr1, length: len });
            grow(bp0, bp1, bp2, rr0, depth + 1);
        }
    }
    grow(p0, p1, p2, baseRadius, 1);

    const merged = mergeMeshes(meshes);
    // one entry per branch, pairing this round's OWN metadata with mergeMeshes' vertex/index spans -- so a gate
    // can both check "radius shrinks with depth" from `meta` alone AND run meshVolume() on any single branch by
    // slicing the merged buffers at its `span`, without re-deriving either from the combined structure.
    const branches = meshes.map((_, i) => ({ ...meta[i], span: merged.spans[i] }));
    return { positions: merged.positions, normals: merged.normals, indices: merged.indices,
             vertexCount: merged.vertexCount, triangleCount: merged.triangleCount,
             branchCount: meshes.length, branches, landingPoint: main.endPoint };
}

export { meshVolume };   // re-exported so a consumer needs one import for placement AND the closed-solid check
