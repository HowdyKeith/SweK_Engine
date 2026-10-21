// WebGLEngine/render/clipmapTerrain.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SLICE 3 OF snowflow-lift: THE NESTED-RING CLIPMAP TERRAIN, WITH CDLOD MORPH, FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// One static vertex buffer and one draw call cover the world out to hundreds of metres: 8 square rings of the same lattice (160 quads a side), the spacing doubling each ring, each ring a square annulus
// (the innermost a solid square). A vertex carries only (grid i, ring level, grid j); WHERE it lands is decided from the camera position every frame (placeVertex), so nothing streams and nothing rebuilds.
// Two rules make it crack-free, both upstream's and both checked in the gate rather than repeated here:
//   1  each ring snaps its origin to TWICE its own spacing (so the lattice never slides under the geometry and its parity is stable);
//   2  vertices morph toward the next coarser lattice across the outer band of their ring (completes at 0.86 of the ring's extent), so at the ring boundary they sit exactly on the coarser ring's lattice.
// Each annulus's hole is cut HOLE_SHRINK cells smaller than the ring it surrounds, so consecutive rings always overlap.
//
// OURS: buildClipmap (upstream's clipmapMesh.js index logic as plain typed arrays, no Babylon), placeVertex (the CPU twin of placeClipmapVertex), bicubicHeight (the four-bilinear-tap B-spline fetch and a
// direct 16-tap reference), PLACE_KERNEL_WGSL (the placement as a compute kernel over storage buffers). NOT DONE: the beauty and depth passes that would draw it on a GPU in one call.
"use strict";

export const GRID_N = 160;
export const LEVELS = 8;
export const BASE_SPACING = 0.085;
export const HOLE_SHRINK = 3;

/**
 * The static mesh. positions: 3 per vertex (grid i, level, grid j); indices Uint32. Every level emits the full lattice; the annulus is expressed through which quads get indices.
 * Winding as upstream's (a,b,c / b,d,c on even quads, a,d,c / a,b,d on odd): see the gate for which way that faces in a right-handed scene.
 */
export function buildClipmap({ gridN = GRID_N, levels = LEVELS, holeShrink = HOLE_SHRINK } = {}) {
    if (gridN % 4 !== 0) throw new RangeError("clipmap: gridN must be divisible by 4");
    const HALF = gridN / 2, side = gridN + 1, vertsPerLevel = side * side, holeHalf = HALF / 2 - holeShrink;
    const holeQuads = (holeHalf * 2) * (holeHalf * 2), quadCount = gridN * gridN + (levels - 1) * (gridN * gridN - holeQuads);
    const positions = new Float32Array(vertsPerLevel * levels * 3), indices = new Uint32Array(quadCount * 6);
    let vi = 0, ii = 0;
    for (let level = 0; level < levels; level++) {
        const vBase = level * vertsPerLevel;
        for (let j = 0; j <= gridN; j++) { const gj = j - HALF; for (let i = 0; i <= gridN; i++) { positions[vi++] = i - HALF; positions[vi++] = level; positions[vi++] = gj; } }
        for (let j = 0; j < gridN; j++) {
            const gj = j - HALF;
            for (let i = 0; i < gridN; i++) {
                const gi = i - HALF;
                if (level > 0 && Math.max(Math.abs(gi), Math.abs(gi + 1), Math.abs(gj), Math.abs(gj + 1)) <= holeHalf) continue;
                const a = vBase + j * side + i, b = a + 1, c = a + side, d = c + 1;
                if (((i + j) & 1) === 0) { indices[ii++] = a; indices[ii++] = b; indices[ii++] = c; indices[ii++] = b; indices[ii++] = d; indices[ii++] = c; }
                else { indices[ii++] = a; indices[ii++] = d; indices[ii++] = c; indices[ii++] = a; indices[ii++] = b; indices[ii++] = d; }
            }
        }
    }
    return Object.freeze({ gridN, levels, holeShrink, positions, indices: ii === indices.length ? indices : indices.subarray(0, ii), triangles: ii / 3, vertices: vertsPerLevel * levels, vertsPerLevel });
}

/** half-extent of the finest ring / of the whole clipmap, metres */
export const innerExtent = (gridN = GRID_N, baseSpacing = BASE_SPACING) => (gridN / 2) * baseSpacing;
export const outerExtent = (gridN = GRID_N, baseSpacing = BASE_SPACING, levels = LEVELS) => (gridN / 2) * baseSpacing * Math.pow(2, levels - 1);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** The CPU twin of placeClipmapVertex: where a vertex (grid i, grid j, ring level) lands for a camera at camXZ. Returns { x, z, spacing, morph } (world xz). */
export function placeVertex(gi, gj, level, camXZ, baseSpacing = BASE_SPACING, gridHalfN = GRID_N / 2) {
    const spacing = baseSpacing * Math.pow(2, level), snap = spacing * 2;
    const ox = Math.floor(camXZ[0] / snap) * snap, oz = Math.floor(camXZ[1] / snap) * snap;
    let lx = gi * spacing, lz = gj * spacing;
    const extent = gridHalfN * spacing, cheb = Math.max(Math.abs(lx), Math.abs(lz)) / extent, morph = clamp01((cheb - 0.70) / 0.16);
    const cx = Math.floor(gi * 0.5) * 2 * spacing, cz = Math.floor(gj * 0.5) * 2 * spacing;
    lx = lx + (cx - lx) * morph; lz = lz + (cz - lz) * morph;
    return { x: ox + lx, z: oz + lz, spacing: spacing * (1 + morph), morph };
}

/** the ring's snapped origin for a camera: floor(cam / 2 spacing) * 2 spacing */
export const ringOrigin = (level, camXZ, baseSpacing = BASE_SPACING) => { const snap = baseSpacing * Math.pow(2, level) * 2; return [Math.floor(camXZ[0] / snap) * snap, Math.floor(camXZ[1] / snap) * snap]; };

/** Place every vertex of a mesh into `out` (4 floats each: x, z, spacing, morph); the reference path a page without a vertex stage uses. */
export function placeAll(mesh, camXZ, out = new Float32Array(mesh.vertices * 4), baseSpacing = BASE_SPACING) {
    const half = mesh.gridN / 2, p = mesh.positions;
    for (let v = 0; v < mesh.vertices; v++) { const r = placeVertex(p[v * 3], p[v * 3 + 2], p[v * 3 + 1], camXZ, baseSpacing, half); out[v * 4] = r.x; out[v * 4 + 1] = r.z; out[v * 4 + 2] = r.spacing; out[v * 4 + 3] = r.morph; }
    return out;
}

/**
 * Bicubic B-spline height fetch by the four-bilinear-tap trick (upstream's sampleHeightBicubic). `h` is a Float32Array(res*res) of heights; bilinear taps clamp to the edge and sit at texel centres.
 * bicubicDirect is the 16-tap reference of the same cubic B-spline, for the gate.
 */
export function bicubicHeight(h, res, u, v) {
    const bil = (uu, vv) => { const px = Math.min(res - 1, Math.max(0, uu * res - 0.5)), py = Math.min(res - 1, Math.max(0, vv * res - 0.5)), x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(res - 1, x0 + 1), y1 = Math.min(res - 1, y0 + 1), fx = px - x0, fy = py - y0;
        return (h[y0 * res + x0] * (1 - fx) + h[y0 * res + x1] * fx) * (1 - fy) + (h[y1 * res + x0] * (1 - fx) + h[y1 * res + x1] * fx) * fy; };
    const cx = u * res - 0.5, cy = v * res - 0.5, bx = Math.floor(cx), by = Math.floor(cy), fx = cx - bx, fy = cy - by;
    const w = (f) => { const f2 = f * f, f3 = f2 * f; return [(1 - 3 * f + 3 * f2 - f3) / 6, (4 - 6 * f2 + 3 * f3) / 6, (1 + 3 * f + 3 * f2 - 3 * f3) / 6, f3 / 6]; };
    const wx = w(fx), wy = w(fy), s0x = wx[0] + wx[1], s1x = wx[2] + wx[3], s0y = wy[0] + wy[1], s1y = wy[2] + wy[3];
    const o0x = (bx + 0.5 - 1 + wx[1] / s0x) / res, o1x = (bx + 0.5 + 1 + wx[3] / s1x) / res, o0y = (by + 0.5 - 1 + wy[1] / s0y) / res, o1y = (by + 0.5 + 1 + wy[3] / s1y) / res;
    const t00 = bil(o0x, o0y), t10 = bil(o1x, o0y), t01 = bil(o0x, o1y), t11 = bil(o1x, o1y);
    return (t00 * (1 - s1x) + t10 * s1x) * (1 - s1y) + (t01 * (1 - s1x) + t11 * s1x) * s1y;
}
export function bicubicDirect(h, res, u, v) {
    const cx = u * res - 0.5, cy = v * res - 0.5, bx = Math.floor(cx), by = Math.floor(cy), fx = cx - bx, fy = cy - by;
    const w = (f) => { const f2 = f * f, f3 = f2 * f; return [(1 - 3 * f + 3 * f2 - f3) / 6, (4 - 6 * f2 + 3 * f3) / 6, (1 + 3 * f + 3 * f2 - 3 * f3) / 6, f3 / 6]; };
    const wx = w(fx), wy = w(fy), at = (x, y) => h[Math.min(res - 1, Math.max(0, y)) * res + Math.min(res - 1, Math.max(0, x))];
    let acc = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) acc += wx[i] * wy[j] * at(bx - 1 + i, by - 1 + j);
    return acc;
}

/**
 * The placement as a compute kernel. Bindings: 0 out (rw f32, 4 per vertex: x, z, spacing, morph), 1 params (uniform: camXZ.xy, baseSpacing, gridHalfN), 2 verts (ro f32, 3 per vertex: grid i, level, grid j).
 * Dispatch ceil(n / 64).
 */
export const PLACE_KERNEL_WGSL = /* wgsl */ `
struct Params { camXZ: vec2f, baseSpacing: f32, gridHalfN: f32 };
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<uniform> U: Params;
@group(0) @binding(2) var<storage, read> verts: array<f32>;

struct ClipmapVertex {
    worldXZ: vec2f,
    spacing: f32,
    morph: f32,
};

// ---- upstream lib/clipmap.wgsl placeClipmapVertex, body unchanged
fn placeClipmapVertex(
    grid: vec2f,
    level: f32,
    camXZ: vec2f,
    baseSpacing: f32,
    gridHalfN: f32
) -> ClipmapVertex {
    let spacing = baseSpacing * exp2(level);
    let snap = spacing * 2.0;
    let origin = floor(camXZ / snap) * snap;
    var local = grid * spacing;
    let extent = gridHalfN * spacing;
    let cheb = max(abs(local.x), abs(local.y)) / extent;
    let morph = clamp((cheb - 0.70) / 0.16, 0.0, 1.0);
    let coarseGrid = floor(grid * 0.5) * 2.0;
    let coarseLocal = coarseGrid * spacing;
    local = mix(local, coarseLocal, morph);
    var out: ClipmapVertex;
    out.worldXZ = origin + local;
    out.spacing = spacing * (1.0 + morph);
    out.morph = morph;
    return out;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&verts) / 3u) { return; }
    let r = placeClipmapVertex(vec2f(verts[i * 3u], verts[i * 3u + 2u]), verts[i * 3u + 1u], U.camXZ, U.baseSpacing, U.gridHalfN);
    outBuf[i * 4u] = r.worldXZ.x;
    outBuf[i * 4u + 1u] = r.worldXZ.y;
    outBuf[i * 4u + 2u] = r.spacing;
    outBuf[i * 4u + 3u] = r.morph;
}
`;

export function reportLines(m = null) {
    const g = m || { gridN: GRID_N, levels: LEVELS, vertices: (GRID_N + 1) * (GRID_N + 1) * LEVELS, triangles: null };
    const L = ["[clipmapTerrain] " + g.levels + " nested rings of " + g.gridN + " quads, spacing doubling from " + BASE_SPACING + " m: " + g.vertices + " vertices in one buffer, out to " + outerExtent(g.gridN, BASE_SPACING, g.levels).toFixed(0) + " m"];
    L.push("  ring origins snap to 2 x spacing; vertices morph to the coarser lattice from 0.70 to 0.86 of the ring extent; holes shrunk by " + HOLE_SHRINK + " cells so rings overlap");
    return L;
}
