// physics/xpbd/sampledFieldKey.mjs
//
// v3463 -- GRADING THE EXTERNAL-FIELD SAMPLER, AND THE KEY IS AN ANALYTIC IDENTITY RATHER THAN A TOLERANCE.
//
// sampledField.js is the coupling that reaches outside the engine: a world-supplied 3D grid of vectors -- the
// shape a radar return or a Doppler-velocity volume takes -- sampled at each particle and applied as a force.
// Its header states a falsifiable property: "Trilinear reproduces any affine field exactly, which
// nearest-neighbour cannot", and clamps out-of-range reads to the grid edge. Three edges, none of them the
// tautology of grading the sampler against the sampler:
//
//   AFFINE IDENTITY   build the grid from an affine field a.x+b, sample at interior points, compare to the
//                     ANALYTIC value. Trilinear is a multilinear interpolant, so an affine field is reproduced
//                     to machine epsilon (2.7e-15) -- not because the reference re-runs the sampler, but because
//                     the algebra says a multilinear blend of affine corners IS the affine value.
//   NODE IDENTITY     sample AT a grid node and the interpolation weight collapses to 1 on that node, so the
//                     stored value comes back to the bit. A wrong index or a botched fraction breaks it.
//   CLAMP IDENTITY    sample OUTSIDE the grid and the read lands on the nearest edge node exactly, never past
//                     it. The failure this refuses is a memory read past the array or a wrong edge.
//
// *** THE PLANTED FAULT IS NEAREST-NEIGHBOUR, AND IT IS HONEST: at a grid NODE nearest-neighbour and trilinear
// return the SAME value (both read that node), so the plant is invisible exactly where a hand-check would look,
// and shows only BETWEEN nodes -- affine error 8.2e-1 against trilinear's 2.7e-15, fourteen orders. *** Same
// discipline as the compliance key at one iteration and the modulate key at one frame: the two agree at the
// special points and part everywhere else, so a plant that differed at a node would be changing something other
// than the interpolation it claims to.
//
// An INTEGER grid (spacing 1, origin 0) is used so the node and clamp identities are exact by construction: at
// an integer coordinate the fractional part is exactly 0 and the corner weight is exactly 1, with no float
// division to leave a residue.

import { sampleVec, buildVectorGrid } from "./sampledField.js";

const NX = 5, NY = 6, NZ = 7, SP = 1, OX = 0, OY = 0, OZ = 0;

// Three independent linear forms, one per component -- a fully affine vector field with no cross terms, which
// trilinear reproduces exactly. The coefficients are unremarkable on purpose (a round field would make the
// negative control's error land on a value another device might collide with).
const A = [[0.37, -0.81, 0.53, 1.1], [0.22, 0.44, -0.6, -0.4], [-0.15, 0.31, 0.27, 2.2]];
const affine = (x, y, z) => A.map((r) => r[0] * x + r[1] * y + r[2] * z + r[3]);

function makeGrid() { return buildVectorGrid(NX, NY, NZ, OX, OY, OZ, SP, affine); }

// A deterministic interior-point walk -- fixed seed so the worst error is reproducible across machines.
function* interiorPoints(n = 3000) {
    let s = 98765;
    const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let t = 0; t < n; t++) yield [r() * (NX - 1), r() * (NY - 1), r() * (NZ - 1)];
}

// The planted sampler: nearest-neighbour instead of trilinear. Everything else identical.
function nearest(grid, x, y, z, out) {
    let gx = x, gy = y, gz = z;
    if (gx < 0) gx = 0; else if (gx > NX - 1) gx = NX - 1;
    if (gy < 0) gy = 0; else if (gy > NY - 1) gy = NY - 1;
    if (gz < 0) gz = 0; else if (gz > NZ - 1) gz = NZ - 1;
    const o = ((Math.round(gz) * NY + Math.round(gy)) * NX + Math.round(gx)) * 3;
    out[0] = grid[o]; out[1] = grid[o + 1]; out[2] = grid[o + 2];
    return out;
}

/** Trilinear reproduces an affine field to machine epsilon; nearest-neighbour does not. */
export function affineReproduction() {
    const grid = makeGrid(), out = [0, 0, 0], nn = [0, 0, 0];
    let affineErr = 0, nnAffineErr = 0;
    for (const [x, y, z] of interiorPoints()) {
        sampleVec(grid, NX, NY, NZ, OX, OY, OZ, SP, x, y, z, out);
        nearest(grid, x, y, z, nn);
        const ex = affine(x, y, z);
        for (let c = 0; c < 3; c++) {
            affineErr = Math.max(affineErr, Math.abs(out[c] - ex[c]));
            nnAffineErr = Math.max(nnAffineErr, Math.abs(nn[c] - ex[c]));
        }
    }
    return { affineErr, nnAffineErr };
}

/** Sampling AT a grid node returns that node's stored value to the bit. */
export function nodeIdentity() {
    const grid = makeGrid(), out = [0, 0, 0];
    let nodeErr = 0;
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        sampleVec(grid, NX, NY, NZ, OX, OY, OZ, SP, i, j, k, out);
        const o = ((k * NY + j) * NX + i) * 3;
        for (let c = 0; c < 3; c++) nodeErr = Math.max(nodeErr, Math.abs(out[c] - grid[o + c]));
    }
    return { nodeErr };
}

/** Sampling OUTSIDE the grid clamps to the nearest edge node exactly, never reading past it. */
export function clampIdentity() {
    const grid = makeGrid(), out = [0, 0, 0];
    // each: an out-of-range query and the edge node it must land on
    const cases = [
        [-3, 2, 2, 0, 2, 2], [NX + 4, 2, 2, NX - 1, 2, 2],
        [2, -9, 2, 2, 0, 2], [2, NY + 8, 2, 2, NY - 1, 2],
        [2, 2, -6, 2, 2, 0], [2, 2, NZ + 5, 2, 2, NZ - 1],
    ];
    let clampErr = 0;
    for (const [x, y, z, ei, ej, ek] of cases) {
        sampleVec(grid, NX, NY, NZ, OX, OY, OZ, SP, x, y, z, out);
        const o = ((ek * NY + ej) * NX + ei) * 3;
        for (let c = 0; c < 3; c++) clampErr = Math.max(clampErr, Math.abs(out[c] - grid[o + c]));
    }
    return { clampErr };
}

/** The honest-plant check: nearest-neighbour AGREES with trilinear at every node and only parts between them. */
export function nearestNeighbourPlant() {
    const grid = makeGrid(), tri = [0, 0, 0], nn = [0, 0, 0];
    let nnNodeErr = 0;
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        sampleVec(grid, NX, NY, NZ, OX, OY, OZ, SP, i, j, k, tri);
        nearest(grid, i, j, k, nn);
        for (let c = 0; c < 3; c++) nnNodeErr = Math.max(nnNodeErr, Math.abs(tri[c] - nn[c]));
    }
    const { affineErr, nnAffineErr } = affineReproduction();
    return { nnNodeErr, nnAffineErr, affineErr, agreesAtNodes: nnNodeErr === 0, partsBetween: nnAffineErr > 1e6 * Math.max(affineErr, 1e-300) };
}

/** The graded keys in the shape the xpbd device mode reports. */
export function sampledKeys() {
    const a = affineReproduction();
    const n = nodeIdentity();
    const c = clampIdentity();
    return {
        affineErr: a.affineErr,
        nodeErr: n.nodeErr,
        clampErr: c.clampErr,
        nnAffineErr: a.nnAffineErr,
        affineExact: a.affineErr < 1e-10,
        beatsNearest: a.nnAffineErr > 1e6 * Math.max(a.affineErr, 1e-300),
    };
}
