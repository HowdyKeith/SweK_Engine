// WebGLEngine/render/probeFit.mjs -- v4515 (Probes 2: the occupancy-fit box)
//
// *** THE PROBE GRID FITTED TO WHERE THE SPLATS ARE, NOT TO THE CLOUD'S EXTREMES. *** render/splatProbes.mjs (v4513) lays
// its grid over cloudBounds(cloud, margin): the min and max of every splat centre. A real splat scene has outliers -- sky
// blobs, floaters, a stray splat metres from the room -- and one of them stretches the box, so a dense grid at a fixed
// spacing spends most of its probes on empty air. This module fits the box to OCCUPANCY instead, through the volume
// physics/splat/splatMesh.mjs already rasterises for the collider:
//
//   occupancyBox(cloud, opts)      rasterise the cloud at cellSize; the occupied voxels are those at or above `threshold`;
//                                  on each axis the box runs from the `trim` quantile of occupied voxels to the 1 - trim
//                                  quantile (so a voxel that is one of thousands cannot stretch it), plus `apron` cells each
//                                  side, in world units. Returns { min, max, volume, occupied, kept } -- `kept` is the count
//                                  of occupied voxels inside the box, which the gate holds at 1 - 2 * trim per axis or more.
//   solidProbes(grid, volume)      a flag per probe: 1 where the probe's own voxel is at or above the threshold -- a probe
//                                  INSIDE a splat sees the splat's colour in every direction and would bake a black or a
//                                  flat cell that the trilinear sample then bleeds into its neighbours.
//   bakeFitted(grid, flags, ...)   bake the OPEN probes only (no cube faces rendered from inside a splat), then fill each
//                                  solid probe with the coefficients of its nearest open probe by world distance, first index
//                                  on a tie. Returns { baked, filled, source } -- source[i] is the probe a solid one copied.
//   fitProbeGrid(cloud, opts)      the three together, unbaked: { grid, box, flags, solid, open } for the page and the gate.
//
// The threshold is splatMesh's ISO (0.5) by default, so "solid" here is the same word the collider uses: a probe is solid
// where the collider's surface nets would put it inside. Not claimed: any cluster analysis beyond the quantile (two dense
// rooms far apart still share one box), and any probe placement finer than the grid's spacing.
"use strict";
import { createVolume, rasterise, getDensity, voxelOf, DEFAULT_RASTER, ISO } from "../physics/splat/splatMesh.mjs";
import { probeGrid, probeIndex, projectCubeSH, renderCubeFaces, PROBES } from "./splatProbes.mjs";

export const FIT = Object.freeze({ cellSize: 0.1, threshold: ISO, apron: 1, trim: 0.01 });

/** the value at quantile q (0..1) of a sorted integer array: the element at floor(q * (n - 1)) */
export function quantileOf(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]; }

export function occupancyBox(cloud, opts = {}) {
    const o = { ...FIT, ...opts }, vol = createVolume({ cellSize: o.cellSize }), raster = { ...DEFAULT_RASTER, ...(o.raster || {}) };
    rasterise(vol, cloud, raster);
    const axes = [[], [], []];
    for (const [k, d] of vol.cells) { if (d < o.threshold) continue; const [x, y, z] = k.split(",").map(Number); axes[0].push(x); axes[1].push(y); axes[2].push(z); }
    const occupied = axes[0].length;
    if (!occupied) return { min: null, max: null, volume: vol, occupied: 0, kept: 0, lo: null, hi: null };
    const lo = [0, 0, 0], hi = [0, 0, 0];
    for (let a = 0; a < 3; a++) { const s = axes[a].slice().sort((p, q) => p - q); lo[a] = quantileOf(s, o.trim) - o.apron; hi[a] = quantileOf(s, 1 - o.trim) + o.apron; }
    let kept = 0;
    for (let i = 0; i < occupied; i++) if (axes[0][i] >= lo[0] && axes[0][i] <= hi[0] && axes[1][i] >= lo[1] && axes[1][i] <= hi[1] && axes[2][i] >= lo[2] && axes[2][i] <= hi[2]) kept++;
    // voxel v spans [v, v + 1) cells: the box runs from the low voxel's near face to the high voxel's far face
    const min = lo.map((v, a) => vol.origin[a] + v * o.cellSize), max = hi.map((v, a) => vol.origin[a] + (v + 1) * o.cellSize);
    return { min, max, volume: vol, occupied, kept, lo, hi };
}

/** 1 where the probe sits in a voxel at or above the threshold */
export function solidProbes(grid, volume, threshold = FIT.threshold) {
    const flags = new Uint8Array(grid.total);
    for (let i = 0; i < grid.total; i++) { const [x, y, z] = voxelOf(volume, grid.positions[i * 3], grid.positions[i * 3 + 1], grid.positions[i * 3 + 2]); if (getDensity(volume, x, y, z) >= threshold) flags[i] = 1; }
    return flags;
}

/** the nearest open probe to probe i by world distance, first index on a tie; -1 when none is open */
export function nearestOpen(grid, flags, i) {
    const px = grid.positions[i * 3], py = grid.positions[i * 3 + 1], pz = grid.positions[i * 3 + 2]; let best = Infinity, at = -1;
    for (let j = 0; j < grid.total; j++) { if (flags[j]) continue; const dx = grid.positions[j * 3] - px, dy = grid.positions[j * 3 + 1] - py, dz = grid.positions[j * 3 + 2] - pz, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; at = j; } }
    return at;
}

/** bake the open probes, fill the solid ones from their nearest open neighbour */
export function bakeFitted(grid, flags, radianceOf, faceSize = PROBES.faceSize) {
    grid.coefficients = new Array(grid.total); const source = new Int32Array(grid.total).fill(-1); let baked = 0, filled = 0;
    for (let i = 0; i < grid.total; i++) {
        if (flags[i]) continue;
        const pos = [grid.positions[i * 3], grid.positions[i * 3 + 1], grid.positions[i * 3 + 2]];
        grid.coefficients[i] = projectCubeSH(renderCubeFaces(pos, radianceOf, faceSize), faceSize); source[i] = i; baked++;
    }
    for (let i = 0; i < grid.total; i++) {
        if (!flags[i]) continue;
        const j = nearestOpen(grid, flags, i);
        grid.coefficients[i] = j < 0 ? Array.from({ length: 9 }, () => [0, 0, 0]) : grid.coefficients[j].map((c) => c.slice()); source[i] = j; filled++;
    }
    return { baked, filled, source };
}

export function fitProbeGrid(cloud, opts = {}) {
    const o = { spacing: PROBES.spacing, ...opts }, box = occupancyBox(cloud, o);
    if (!box.min) throw new Error("probeFit: the cloud rasterises to no occupied voxel at this threshold -- nothing to fit a box to");
    const grid = probeGrid({ min: box.min, max: box.max }, o.spacing), flags = solidProbes(grid, box.volume, o.threshold ?? FIT.threshold);
    let solid = 0; for (const f of flags) solid += f;
    return { grid, box, flags, solid, open: grid.total - solid };
}
export { probeIndex };
