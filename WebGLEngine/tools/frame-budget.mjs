// WebGLEngine/tools/frame-budget.mjs — v2550
//
// WHERE DOES THE FRAME ACTUALLY GO?
//
// Run: node tools/frame-budget.mjs
//
// This exists because of a specific near-miss. Handed Wald et al., "Faster Isosurface Ray Tracing using Implicit
// KD-Trees" (IEEE TVCG 11(5), 2005) -- a real paper, correct, 84 citations -- plus a summary recommending
// speculative raycasting, dual contouring, temporal reprojection and TAA for the popping problem. All of it aimed
// at making isosurface extraction faster and smoother.
//
// THEN I MEASURED THE FRAME:
//
//     SPH step                      5.306ms   81%
//     hybridGrid (build the field)  0.827ms   13%
//     marchScalarField              0.397ms    6%
//
// THE ISOSURFACE IS SIX PERCENT. Make the marcher INFINITELY FAST and the frame gets 6% shorter. Every technique
// in that stack optimises the 6%. The paper is correct and it is not about this engine's problem.
//
// And the measured detail underneath is the more interesting half. Wald's key idea is that a kd-tree annotated
// with per-node min/max lets you skip every subtree that cannot contain the isovalue, because "the isosurface is
// only located within a small subset of all cells". Measured here: 75.9% of cells are empty, 24.1% straddle the
// surface. That sounds like a big prize until you notice WHY it is only 76% and not 99%:
//
//     fitGrid ALREADY FITS THE BOX TO THE BONES. 28x10x10 = 2,187 cells, not 28^3 = 21,952.
//
// A 10x skip, already taken, by a different route. Wald's volumes are 256^3 CT cubes where the surface really is
// under 1% of cells and a tree is the only way through. This is a fitted sleeve around a limb. THE SAME IDEA WAS
// ALREADY IMPLEMENTED, EARLIER IN THE PIPELINE, AND BETTER SUITED TO THIS SHAPE.
//
// And the disanalogy that matters most: HIS VOLUMES ARE STATIC. Build the tree once, browse isovalues forever.
// This field changes every frame, so a per-frame tree build is the v2536 mistake in a new hat -- and the cheapest
// expression of the idea, a block min/max pass, MEASURED 0.095ms to save at most 0.362ms of a 0.476ms march.
// It would win. It would win 2% of a frame.
//
// SO THE RULE THIS FILE ENFORCES: TEST THE PAPER AGAINST THE PROFILE BEFORE ADOPTING IT. A technique that halves
// a stage worth 6% buys 3%. Amdahl does not care how good the paper is.
"use strict";

import { FleshSph, hybridGrid } from "../physics/soft/fleshSph.js";
import { fitGrid } from "../physics/soft/boneField.js";
import { marchScalarField } from "../simulation/MarchingCubes.js";

const limb = (a) => [
    { a: [0, 0, 0], b: [1, 0, 0], r: 0.3 },
    { a: [1, 0, 0], b: [1 + Math.cos(a), Math.sin(a), 0], r: 0.26 },
];

/** median of the middle, after warmup: a mean would let one GC pause write the conclusion. */
function med(fn, warm = 8, runs = 15) {
    for (let i = 0; i < warm; i++) fn();
    const t = [];
    for (let i = 0; i < runs; i++) { const a = performance.now(); fn(); t.push(performance.now() - a); }
    t.sort((x, y) => x - y);
    return t[t.length >> 1];
}

/** @returns {{stages: Array<[string, number]>, total: number, cells: {empty, boundary}}} */
export function profileFlesh(count = 500, fine = 28) {
    const rest = limb(0);
    const f = new FleshSph(rest, { count, seed: 42 });
    for (let i = 0; i < 80; i++) f.step(limb(-0.6 * Math.sin(i * 0.05)));
    const g = fitGrid(rest, fine, 0.16);

    const tSph = med(() => f.step(rest));
    const tField = med(() => hybridGrid(rest, f, g, 12, { blend: 0.16, strength: 0.12 }));
    const field = hybridGrid(rest, f, g, 12, { blend: 0.16, strength: 0.12 });
    const tMarch = med(() => marchScalarField(field, g.dimX, g.dimY, g.dimZ, 0, { origin: g.origin, cellSize: g.cellSize }));

    // How much of the grid is Wald's "empty space"? A cell is empty when all 8 corners are on one side: the
    // marcher emits nothing, having paid 8 samples to find out.
    const { dimX, dimY, dimZ } = g;
    const at = (x, y, z) => field[(z * dimY + y) * dimX + x];
    let empty = 0, boundary = 0;
    for (let z = 0; z < dimZ - 1; z++) for (let y = 0; y < dimY - 1; y++) for (let x = 0; x < dimX - 1; x++) {
        let lo = 0;
        for (let i = 0; i < 8; i++) if (at(x + (i & 1), y + ((i >> 1) & 1), z + ((i >> 2) & 1)) < 0) lo++;
        if (lo === 0 || lo === 8) empty++; else boundary++;
    }
    return {
        stages: [["SPH step", tSph], ["hybridGrid (build the field)", tField], ["marchScalarField", tMarch]],
        total: tSph + tField + tMarch,
        cells: { empty, boundary, dims: [dimX, dimY, dimZ] },
    };
}

if (process.argv[1] && process.argv[1].endsWith("frame-budget.mjs")) {
    const p = profileFlesh(500, 28);
    console.log("\n  WHERE THE FRAME ACTUALLY GOES (500 particles, hybrid skin)\n");
    for (const [name, t] of p.stages)
        console.log("  " + name.padEnd(30) + t.toFixed(3) + "ms   " + (100 * t / p.total).toFixed(0) + "%");
    console.log("  " + "".padEnd(30) + "------");
    console.log("  " + "total".padEnd(30) + p.total.toFixed(3) + "ms");

    const march = p.stages[2][1], marchShare = march / p.total;
    console.log("\n  The grid is " + p.cells.dims.join("x") + " = " + (p.cells.empty + p.cells.boundary) + " cells: " +
                (100 * p.cells.boundary / (p.cells.empty + p.cells.boundary)).toFixed(1) + "% boundary, " +
                (100 * p.cells.empty / (p.cells.empty + p.cells.boundary)).toFixed(1) + "% empty.");
    console.log("  fitGrid already fits the box to the bones -- that is Wald's empty-space skip, taken earlier");
    console.log("  and better suited to a limb than a kd-tree over a 256^3 cube.");
    console.log("\n  BEFORE ADOPTING ANY ISOSURFACE PAPER: it optimises " + (100 * marchShare).toFixed(0) + "% of this frame.");
    console.log("  Halving that stage buys " + (100 * marchShare / 2).toFixed(0) + "%. Amdahl does not care how good the paper is.");
    console.log("  The bottleneck is the SPH, and v2536 measured that the spatial grid LOSES below ~1000");
    console.log("  particles -- so at 500 this is brute force BY MEASUREMENT, not by neglect.");
}
