// WebGLEngine/physics/mpm/heteroMaterial-selfcheck.mjs — v3840
//
// mpmcouple proved two bodies of the SAME material stop and conserve momentum. This proves the harder claim: two
// DIFFERENT materials on one grid couple correctly -- momentum still conserved across the pair, and each body
// deforms by ITS OWN stiffness, the soft one far more than the stiff one. Plus the guarantee that turning the new
// per-particle material OFF (no p.mat) reproduces the global-params behaviour exactly, so nothing shipped moved.
// The LOOK -- a soft block splatting against a stiff one -- is Keith's; the arithmetic is here.
//
// Run: node physics/mpm/heteroMaterial-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { restBlock, step } from "./step.mjs";
import { makeGrid } from "./transfer.mjs";
import { lame } from "./constitutive.mjs";
import { materialBlock, totalPx, meanDeformation, byTag, centroidX } from "./heteroMaterial.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const H = 0.5;
const soft = lame(80, 0.3), stiff = lame(2000, 0.3), GLOBAL = lame(500, 0.3);

// Run a soft (moving right) + stiff (moving left) head-on collision on one shared grid, no gravity/walls.
function collide(steps = 240) {
    const A = materialBlock({ n: 4, spacing: 0.25, x0: 3, y0: 4, m: 0.1, vol0: 0.0625, vx: 3, mat: soft, tag: "A" });
    const B = materialBlock({ n: 4, spacing: 0.25, x0: 6, y0: 4, m: 0.1, vol0: 0.0625, vx: -3, mat: stiff, tag: "B" });
    const ps = A.concat(B), g = makeGrid(16, 16, H), px0 = totalPx(ps);
    for (let i = 0; i < steps; i++) step(ps, g, { dt: 1 / 240, gy: 0, params: GLOBAL, plastic: false, walls: null });
    return { ps, px0, pxEnd: totalPx(ps) };
}

// 1) MOMENTUM CONSERVED across two DIFFERENT materials, to machine precision (no external force).
{
    const r = collide();
    ok(Math.abs(r.pxEnd - r.px0) < 1e-9, "total momentum is conserved across the soft/stiff collision (drift " + (r.pxEnd - r.px0).toExponential(2) + ")");
    ok(near(r.px0, 0), "the setup starts at zero net momentum (equal, opposite)");
}

// 2) EACH BODY DEFORMS BY ITS OWN STIFFNESS -- the soft block far more than the stiff one. This is what proves the
//    two materials are genuinely different and coupled, not one global material.
{
    const r = collide();
    const dSoft = meanDeformation(byTag(r.ps, "A")), dStiff = meanDeformation(byTag(r.ps, "B"));
    ok(dSoft > dStiff * 5, "the soft body deforms far more than the stiff one (soft " + dSoft.toFixed(3) + " vs stiff " + dStiff.toFixed(3) + ")");
    ok(dStiff >= 0 && dStiff < 0.05, "the stiff body barely deforms");
}

// 3) NO PASS-THROUGH -- the soft body stays left of the stiff body; the shared grid excludes them.
{
    const r = collide();
    ok(centroidX(byTag(r.ps, "A")) < centroidX(byTag(r.ps, "B")), "the bodies do not pass through each other");
}

// 4) BACKWARD COMPATIBILITY -- a particle with NO p.mat behaves exactly as the global params. Two identical runs,
//    one via p.mat = GLOBAL, one with no mat and params = GLOBAL, must give identical F.
{
    const g1 = makeGrid(16, 16, H), g2 = makeGrid(16, 16, H);
    const withMat = materialBlock({ n: 4, spacing: 0.25, x0: 4, y0: 6, m: 0.1, vol0: 0.0625, vx: 0, mat: GLOBAL, tag: "m" });
    const noMat = restBlock({ n: 4, spacing: 0.25, x0: 4, y0: 6, m: 0.1, vol0: 0.0625 });
    for (let i = 0; i < 60; i++) { step(withMat, g1, { dt: 1 / 240, gy: -9.81, params: GLOBAL, plastic: true }); step(noMat, g2, { dt: 1 / 240, gy: -9.81, params: GLOBAL, plastic: true }); }
    let identical = true;
    for (let k = 0; k < withMat.length; k++) for (let c = 0; c < 4; c++) if (!near(withMat[k].F[c], noMat[k].F[c], 1e-12)) identical = false;
    ok(identical, "per-particle mat = global params reproduces the no-mat path exactly (nothing shipped moved)");
}

// 5) DETERMINISM.
{
    const a = collide(120).pxEnd, b = collide(120).pxEnd;
    ok(a === b, "the collision is deterministic");
}

// ---- CONTROL: the coupling comes from the SHARED grid. Give each body its own grid and they pass straight
// through -- so the no-pass-through result above is real, not an artefact of the setup. ----
{
    const A = materialBlock({ n: 4, spacing: 0.25, x0: 3, y0: 4, m: 0.1, vol0: 0.0625, vx: 3, mat: soft, tag: "A" });
    const B = materialBlock({ n: 4, spacing: 0.25, x0: 6, y0: 4, m: 0.1, vol0: 0.0625, vx: -3, mat: stiff, tag: "B" });
    const ga = makeGrid(16, 16, H), gb = makeGrid(16, 16, H);
    for (let i = 0; i < 240; i++) { step(A, ga, { dt: 1 / 240, gy: 0, params: GLOBAL, plastic: false }); step(B, gb, { dt: 1 / 240, gy: 0, params: GLOBAL, plastic: false }); }
    ok(centroidX(A) > centroidX(B), "control: on SEPARATE grids the bodies pass through -- the shared grid is what excludes them");
}

console.log(`heteroMaterial-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
