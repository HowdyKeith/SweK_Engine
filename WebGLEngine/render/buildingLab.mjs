// WebGLEngine/render/buildingLab.mjs -- v4512
//
// *** THE BUILDING LAB: EVERY GRAMMAR PLACEMENT AS AN INSTANCED BOX THROUGH gpuDriven's RECORDS (buildings 4). *** world/
// buildingGrammar.mjs hands back one placement per cell; this module turns them into what render/gpuDriven.mjs draws: a unit
// cube in LAYOUTS.lit (positions, per-face normals, one colour) and a record per placement -- (x, y, z, size), the grammar's
// floors on the world's y -- with a tint index per kind in the record's extras, drawn by render/litSphere.mjs's lit pipeline
// (a uniform scale of a cube by rec.w is a cube; its normals are what they were). Corners, walls, party-wall blanks, stairs,
// roof caps and interior slabs each get a palette entry, so a seed and its party-wall sides read at a glance on
// building-lab.html, and tools/ship/buildingLab-selfcheck.mjs holds the drawn picture to the placement list: the cull twin's
// survivor count is the placement count, and every pixel's ray either hits the union of the boxes or it does not, on the CPU,
// the same answer the GPU gave, edge pixels aside.
"use strict";
import { buildingGrammar } from "../world/buildingGrammar.mjs";
import { EXTRA_FLOATS } from "./gpuDriven.mjs";

/** the palette, tint index = KINDS.indexOf(kind) + 1 (tint 0 keeps the mesh's own colour) */
export const KINDS = Object.freeze(["corner", "wall", "blank", "stairs", "roofCap", "interior"]);
export const KIND_TINTS = Object.freeze([[0.55, 0.55, 0.6], [0.85, 0.8, 0.7], [0.35, 0.33, 0.3], [0.95, 0.55, 0.25], [0.6, 0.25, 0.2], [0.75, 0.75, 0.78]]);
export function kindOf(p) { return p.stairs ? "stairs" : p.blank ? "blank" : p.role === "wall" ? "wall" : p.role === "corner" ? "corner" : p.role === "roofCap" ? "roofCap" : "interior"; }

/** a unit cube centred on the origin (span 1) in the lit layout: 24 vertices with per-face normals, 36 indices, CCW seen from outside */
export function boxMesh(color = [1, 1, 1, 1]) {
    const faces = [[[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
        [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
        [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]]];
    const positions = new Float32Array(24 * 3), normals = new Float32Array(24 * 3), indices = new Uint32Array(36);
    faces.forEach(([n, c], f) => { c.forEach((v, k) => { positions.set(v.map((x) => x * 0.5), (f * 4 + k) * 3); normals.set(n, (f * 4 + k) * 3); }); indices.set([f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3], f * 6); });
    return { positions, normals, indices, color };
}

/**
 * Records and extras for a grammar result: one instance per placement, centred so the building's middle is the origin, the
 * grammar's z (floors) on the world's y, x on x, y (depth) on z. `tile` is the cell size; `gap` shrinks each box so cells read.
 */
export function labRecords(grammar, { tile = 1, gap = 0.08 } = {}) {
    const { nx, ny, nz } = grammar.spec, n = grammar.placements.length, records = new Float32Array(n * 4), extras = new Float32Array(n * EXTRA_FLOATS), kinds = new Uint8Array(n);
    grammar.placements.forEach((p, i) => {
        const [x, y, z] = p.cell;
        records[i * 4] = (x - (nx - 1) / 2) * tile; records[i * 4 + 1] = (z - (nz - 1) / 2) * tile; records[i * 4 + 2] = (y - (ny - 1) / 2) * tile; records[i * 4 + 3] = tile * (1 - gap);
        const k = KINDS.indexOf(kindOf(p)); kinds[i] = k; extras[i * EXTRA_FLOATS + 1] = k + 1; extras[i * EXTRA_FLOATS + 3] = 0;
    });
    return { records, extras, kinds, count: n, halfSpan: [nx * tile / 2, nz * tile / 2, ny * tile / 2] };
}

/** the lab's building for a seed and knobs: the grammar and its records */
export function labBuilding(seed, overrides = {}, opts = {}) { const grammar = buildingGrammar(seed, overrides); return { grammar, ...labRecords(grammar, opts) }; }

/** does the ray from `eye` along unit `dir` hit the axis-aligned box centred at c with half extent h? the slab test; returns the nearest t or Infinity */
export function rayBox(eye, dir, c, h) {
    let t0 = -Infinity, t1 = Infinity;
    for (let k = 0; k < 3; k++) { const lo = c[k] - h, hi = c[k] + h; if (Math.abs(dir[k]) < 1e-12) { if (eye[k] < lo || eye[k] > hi) return Infinity; continue; }
        let a = (lo - eye[k]) / dir[k], b = (hi - eye[k]) / dir[k]; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; }
    return t1 < 0 ? Infinity : Math.max(t0, 0);
}

/** the CPU silhouette: for a camera on the +z axis at distance D looking at the origin with vertical fov, which pixels' rays hit any box */
export function silhouette(records, count, W, H, fov, D) {
    const t = Math.tan(fov / 2), aspect = W / H, mask = new Uint8Array(W * H), eye = [0, 0, D];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const d = [(i + 0.5 - W / 2) / (H / 2) * t, -(j + 0.5 - H / 2) / (H / 2) * t, -1]; const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
        for (let r = 0; r < count; r++) { if (rayBox(eye, d, [records[r * 4], records[r * 4 + 1], records[r * 4 + 2]], records[r * 4 + 3] * 0.5) < Infinity) { mask[j * W + i] = 1; break; } }
    }
    void aspect;
    return mask;
}
