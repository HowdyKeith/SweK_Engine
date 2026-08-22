// physics/xpbd/sampledField-selfcheck.mjs
//
// Run: node physics/xpbd/sampledField-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The sampled-field coupling drives particles from an external volumetric field -- a wind, a Doppler-velocity volume,
// any grid handed in from the world. Its correctness lives in the sampling. The headline check builds a grid from an
// affine field and samples it at fractional points: trilinear interpolation reproduces any affine field to machine
// epsilon, which is the property that separates real interpolation from nearest-neighbour. From there, a uniform
// field advects a particle along it, a rotational field curves it, and a point outside the grid clamps to the edge
// rather than reading past it. The sabotage collapses the trilinear blend to the nearest corner, and the affine check
// fails at once -- nearest-neighbour sampling is piecewise constant and cannot represent a slope.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { sampleVec, buildVectorGrid, sampledFieldSubstep } from "./sampledField.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const NX = 6, NY = 6, NZ = 6, OX = -1, OY = -1, OZ = -1, SP = 0.5;
const dims = { nx: NX, ny: NY, nz: NZ, ox: OX, oy: OY, oz: OZ, sp: SP };

// ---- 1. TRILINEAR EXACT: an affine field is reproduced to machine epsilon ----------------------------------
{
    const aff = (x, y, z) => [2 * x + 1, 3 * y - 2, x + z];
    const grid = buildVectorGrid(NX, NY, NZ, OX, OY, OZ, SP, aff);
    let maxErr = 0;
    for (const [x, y, z] of [[0.13, 0.27, -0.4], [0.8, -0.3, 0.55], [-0.6, 0.9, 0.2], [0.05, 0.05, 0.05]]) { const out = [0, 0, 0]; sampleVec(grid, NX, NY, NZ, OX, OY, OZ, SP, x, y, z, out); const ex = aff(x, y, z); maxErr = Math.max(maxErr, Math.abs(out[0] - ex[0]), Math.abs(out[1] - ex[1]), Math.abs(out[2] - ex[2])); }
    ok("!! trilinear sampling reproduces an affine field exactly", maxErr < 1e-12,
       "a grid filled from a linear field, sampled at fractional points, returns the analytic value to " + maxErr.toExponential(1) + " -- trilinear interpolation is exact on affine fields, which nearest-neighbour is not.");
}

// ---- 2. ADVECTION: a uniform field carries a particle along it ---------------------------------------------
{
    const field = { grid: buildVectorGrid(NX, NY, NZ, OX, OY, OZ, SP, () => [1, 0, 0]), dims };
    const st = { pos: new Float64Array(3), vel: new Float64Array(3), invMass: Float64Array.from([1]) };
    for (let s = 0; s < 30; s++) sampledFieldSubstep(st, field, { dt: 0.016, strength: 2 });
    ok("!! a uniform field carries the particle along its direction", st.pos[0] > 0.1 && Math.abs(st.pos[1]) < 1e-9 && Math.abs(st.pos[2]) < 1e-9,
       "a particle in a uniform +x wind is pushed to x " + st.pos[0].toFixed(3) + " with no drift in y or z -- it follows the field it was handed.");
}

// ---- 3. CIRCULATION: a rotational field curves the particle ------------------------------------------------
{
    const swirl = { grid: buildVectorGrid(NX, NY, NZ, OX, OY, OZ, SP, (x, y, z) => [-z, 0, x]), dims };
    const st = { pos: Float64Array.from([0.5, 0, 0]), vel: new Float64Array(3), invMass: Float64Array.from([1]) };
    const r0 = Math.sqrt(st.pos[0] ** 2 + st.pos[2] ** 2);
    for (let s = 0; s < 40; s++) sampledFieldSubstep(st, swirl, { dt: 0.016, strength: 1, damping: 0.02 });
    const r1 = Math.sqrt(st.pos[0] ** 2 + st.pos[2] ** 2);
    ok("!! a rotational field curves the particle around the centre", Math.abs(st.pos[2]) > 0.05 && Math.abs(r1 - r0) < 0.5,
       "in a swirl field the particle gains a z of " + st.pos[2].toFixed(3) + " while roughly holding its radius -- it circulates, carried by the sampled rotation.");
}

// ---- 4. CLAMP: sampling outside the grid clamps to the edge, no NaN ----------------------------------------
{
    const grid = buildVectorGrid(NX, NY, NZ, OX, OY, OZ, SP, (x) => [x, 0, 0]);
    const out = [0, 0, 0]; sampleVec(grid, NX, NY, NZ, OX, OY, OZ, SP, 999, -999, 999, out);
    // edge value at max x (grid spans to OX+(NX-1)*SP = 1.5): field there is x=1.5
    ok("!! a point outside the grid clamps to the edge rather than reading past it", out.every(Number.isFinite) && Math.abs(out[0] - 1.5) < 1e-12,
       "sampled far outside the grid the value clamps to the boundary cell (x field reads 1.5 at the +x edge) and stays finite -- no read past the array.");
}

// ---- 5. DETERMINISTIC --------------------------------------------------------------------------------------
{
    const run = () => { const swirl = { grid: buildVectorGrid(NX, NY, NZ, OX, OY, OZ, SP, (x, y, z) => [-z, 0.1, x]), dims }; const st = { pos: Float64Array.from([0.5, 0, 0, -0.3, 0.2, 0.1]), vel: new Float64Array(6), invMass: Float64Array.from([1, 1]) }; for (let s = 0; s < 30; s++) sampledFieldSubstep(st, swirl, { dt: 0.016, strength: 1.5, damping: 0.01 }); return hp(st.pos); };
    ok("!! two runs through the same field land byte-for-byte identical", run() === run(),
       "particles advected through the same sampled field reproduce exactly -- trilinear sampling is pure arithmetic with no order dependence.");
}

// ---- 6. PURE -----------------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "sampledField.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the sampler uses only +,-,*,/ and floor -- no transcendental", clean,
       "trilinear sampling and the advection are arithmetic and a floor, so an external field drives every machine to the same bits.");
}

console.log(fails ? "\nsampledField-selfcheck: " + fails + " FAILED" : "\nsampledField-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
