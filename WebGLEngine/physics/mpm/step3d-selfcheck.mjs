// WebGLEngine/physics/mpm/step3d-selfcheck.mjs -- v3841
//
// mpm3dBind proved the transfer identities lift; this proves the LOOP above them works. The key is the same one
// that graded the 2D step: whatever the block does internally, its centre of mass follows the analytic fall, and
// does not drift sideways -- now in three axes. Plus the 3x3 constitutive: undeformed material has no stress, the
// Cauchy stress is symmetric (angular-momentum balance in 3D), and an inverted particle says so with NaN rather
// than clamping. The LOOK -- a block tumbling in 3D -- is Keith's; the arithmetic is here.
//
// Run: node physics/mpm/step3d-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { restBlock3, step3, centreOfMass3, freeFall3Error, makeGrid3,
         quadWeightsGrad3, normalise3, applyBodyForce3, enforceWalls3, stressForces3 } from "./step3d.mjs";
import { firstPiola3, cauchy3, advanceF3, det3, mul3, I3 } from "./constitutive3.mjs";
import { quadWeights } from "./transfer3d.mjs";
import { lame } from "./constitutive.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const params = lame(500, 0.3);

// 1) THE FREE-FALL PARABOLA LIFTS TO 3D -- centre of mass follows the analytic discrete fall in y, no x/z drift.
{
    const ps = restBlock3({ n: 3, spacing: 0.4, x0: 4, y0: 6, z0: 4, m: 0.1, vol0: 0.064 });
    const r = freeFall3Error(ps, { steps: 120, dt: 1 / 240, gy: -9.81, params });
    ok(r.maxErr < 1e-9, "the centre of mass follows the analytic fall in y (max err " + r.maxErr.toExponential(2) + ")");
    ok(r.maxDrift < 1e-9, "no sideways drift in x or z (max " + r.maxDrift.toExponential(2) + ")");
}

// 2) 3x3 CONSTITUTIVE -- undeformed material has zero stress; an inverted particle returns NaN, not a clamp.
{
    ok(Math.max(...firstPiola3(I3, params).P.map(Math.abs)) === 0, "undeformed material (F = I) has zero first Piola stress");
    const inv = [-1, 0, 0, 0, 1, 0, 0, 0, 1];   // det = -1
    ok(Number.isNaN(firstPiola3(inv, params).P[0]), "an inverted particle (J <= 0) returns NaN, it does not clamp");
}

// 3) SYMMETRIC CAUCHY STRESS -- angular-momentum balance in 3D, on all three off-diagonal pairs.
{
    const F = [1.1, 0.05, 0, 0.02, 0.95, 0.03, 0, 0.01, 1.05];
    const { sigma } = cauchy3(F, params);
    const asym = Math.max(Math.abs(sigma[1] - sigma[3]), Math.abs(sigma[2] - sigma[6]), Math.abs(sigma[5] - sigma[7]));
    ok(asym < 1e-9, "the Cauchy stress is symmetric on all three pairs (worst " + asym.toExponential(2) + ")");
}

// 4) MOMENTUM -- gravity adds exactly M*g*dt of y-momentum per step; x and z momentum stay zero.
{
    const ps = restBlock3({ n: 3, spacing: 0.4, x0: 4, y0: 6, z0: 4, m: 0.1, vol0: 0.064 });
    const g = makeGrid3(16, 16, 16, 0.5), M = ps.length * 0.1, dt = 1 / 240, gy = -9.81, N = 60;
    for (let s = 0; s < N; s++) step3(ps, g, { dt, gy, params });
    let px = 0, py = 0, pz = 0; for (const p of ps) { px += p.m * p.vx; py += p.m * p.vy; pz += p.m * p.vz; }
    ok(Math.abs(py - M * gy * dt * N) < 1e-9, "total y-momentum equals M*g*dt*steps (the gravity impulse)");
    ok(Math.abs(px) < 1e-9 && Math.abs(pz) < 1e-9, "x and z momentum stay zero under pure gravity");
}

// 5) advanceF3 -- F <- (I + dt C) F; a zero affine leaves F untouched; a known C multiplies correctly.
{
    const F = [1.1, 0, 0, 0, 0.9, 0, 0, 0, 1];
    ok(JSON.stringify(advanceF3(F, [0, 0, 0, 0, 0, 0, 0, 0, 0], 0.01)) === JSON.stringify(F), "advanceF3 with zero C leaves F unchanged");
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0]; C[0] = 1;   // stretch xx
    const got = advanceF3(F, C, 0.5);                   // (1 + 0.5)*F row 0
    ok(near(got[0], 1.5 * 1.1), "advanceF3 applies (I + dt C) F correctly");
}

// 6) A RESTING BLOCK STAYS PUT -- no gravity, no initial velocity: the centre of mass does not move and F stays
//    at the identity (the loop invents no motion).
{
    const ps = restBlock3({ n: 3, spacing: 0.4, x0: 4, y0: 6, z0: 4, m: 0.1, vol0: 0.064 });
    const g = makeGrid3(16, 16, 16, 0.5), c0 = centreOfMass3(ps);
    for (let s = 0; s < 60; s++) step3(ps, g, { dt: 1 / 240, gy: 0, params });
    const c = centreOfMass3(ps);
    let maxF = 0; for (const p of ps) for (let i = 0; i < 9; i++) maxF = Math.max(maxF, Math.abs(p.F[i] - I3[i]));
    ok(near(c.x, c0.x, 1e-9) && near(c.y, c0.y, 1e-9) && near(c.z, c0.z, 1e-9), "a resting block's centre of mass does not move");
    ok(maxF < 1e-9, "a resting block's deformation gradient stays at the identity");
}

// 7) matrix basics -- mul3(I, A) = A; det3 of a known matrix.
{
    const A = [2, 0, 1, 0, 3, 0, 1, 0, 2];
    ok(JSON.stringify(mul3(I3, A)) === JSON.stringify(A), "mul3 with the identity is a no-op");
    ok(det3(A) === 2 * (3 * 2 - 0) - 0 + 1 * (0 - 3 * 1), "det3 matches the cofactor expansion");
}

// 8) DETERMINISM.
{
    const a = freeFall3Error(restBlock3({ n: 3 }), { steps: 40, params }).maxErr;
    const b = freeFall3Error(restBlock3({ n: 3 }), { steps: 40, params }).maxErr;
    ok(a === b, "the 3D step is deterministic");
}

// 9) quadWeightsGrad3 -- (a) matches transfer3d's own trusted quadWeights (the "2D twin" claim in the header,
//    already exercised through every p2g3/g2p3 mass-conserving transfer) on both base and w, for several
//    non-grid-aligned points; (b) partition of unity: w sums to 1; (c) its derivative sums to 0 (the derivative
//    of a constant is zero); (d) dw actually IS the derivative of w -- checked against a central finite
//    difference small enough not to cross the floor() breakpoint that shifts `base`.
{
    const h = 0.5;
    for (const x of [1.03, 2.47, 5.91, 8.2]) {
        const a = quadWeightsGrad3(x, h), b = quadWeights(x, h);
        ok(a.base === b.base, "quadWeightsGrad3 base matches transfer3d.quadWeights at x=" + x);
        ok(near(a.w[0], b.w[0]) && near(a.w[1], b.w[1]) && near(a.w[2], b.w[2]),
           "quadWeightsGrad3 weights match transfer3d.quadWeights at x=" + x);
        ok(near(a.w[0] + a.w[1] + a.w[2], 1, 1e-12), "!!quadWeightsGrad3 weights sum to 1 (partition of unity) at x=" + x);
        ok(near(a.dw[0] + a.dw[1] + a.dw[2], 0, 1e-9), "!!quadWeightsGrad3 gradients sum to 0 (derivative of a constant) at x=" + x);
    }
    // finite-difference check of dw against w, well inside a cell so base does not jump under +-eps
    const x0 = 4.13, eps = 1e-4;
    const w0 = quadWeightsGrad3(x0, h), wp = quadWeightsGrad3(x0 + eps, h), wm = quadWeightsGrad3(x0 - eps, h);
    ok(w0.base === wp.base && w0.base === wm.base, "the finite-difference probe stays within one cell (base unchanged)");
    for (let i = 0; i < 3; i++) {
        const fd = (wp.w[i] - wm.w[i]) / (2 * eps);
        ok(near(fd, w0.dw[i], 1e-4), "!!quadWeightsGrad3 dw[" + i + "] matches the central finite difference of w (" + fd.toFixed(6) + " vs " + w0.dw[i].toFixed(6) + ")");
    }
}

// 10) normalise3 -- momentum -> velocity, in place, ONLY where mass > 0; zero-mass nodes are left untouched.
{
    const g = makeGrid3(2, 2, 2, 1);
    g.mass[0] = 2; g.mvx[0] = 5; g.mvy[0] = -3; g.mvz[0] = 1;      // massed node
    g.mass[1] = 0; g.mvx[1] = 7; g.mvy[1] = 7; g.mvz[1] = 7;       // massless node -- must be left alone
    normalise3(g);
    ok(near(g.mvx[0], 2.5) && near(g.mvy[0], -1.5) && near(g.mvz[0], 0.5), "!!normalise3 divides momentum by mass at a massed node");
    ok(g.mvx[1] === 7 && g.mvy[1] === 7 && g.mvz[1] === 7, "normalise3 leaves a zero-mass node untouched");
    ok(g.normalised === true, "normalise3 sets the normalised flag");
}

// 11) applyBodyForce3 -- adds EXACTLY g*dt to velocity at every node that carries mass; massless nodes untouched.
{
    const g = makeGrid3(2, 2, 2, 1);
    g.mass[0] = 3; g.mvx[0] = 0.2; g.mvy[0] = 0.4; g.mvz[0] = -0.1;
    g.mass[1] = 0; g.mvx[1] = 1; g.mvy[1] = 1; g.mvz[1] = 1;
    const gx = 0, gy = -9.81, gz = 2, dt = 1 / 240;
    applyBodyForce3(g, gx, gy, gz, dt);
    ok(near(g.mvx[0], 0.2 + gx * dt) && near(g.mvy[0], 0.4 + gy * dt) && near(g.mvz[0], -0.1 + gz * dt),
       "!!applyBodyForce3 adds exactly g*dt to velocity at a massed node");
    ok(g.mvx[1] === 1 && g.mvy[1] === 1 && g.mvz[1] === 1, "applyBodyForce3 leaves a massless node untouched");
}

// 12) enforceWalls3 -- zeroes the INWARD normal velocity of a massed node inside the wall slab; leaves an
//     interior node (not in any slab) alone, whichever direction it moves; leaves an OUTWARD-moving node at a
//     wall alone too (only velocity heading further INTO the wall is clamped).
{
    const idx = (g, i, j, k) => (k * (g.ny + 1) + j) * (g.nx + 1) + i;
    // default box: lo = hi = 1, all six faces active
    {
        const g = makeGrid3(4, 4, 4, 1);
        const lowX = idx(g, 0, 2, 2), interior = idx(g, 2, 2, 2), highX = idx(g, 4, 2, 2);
        const lowY = idx(g, 2, 0, 2);
        g.mass[lowX] = 1; g.mvx[lowX] = -2;      // moving further into the -x wall -- must clamp to 0
        g.mass[interior] = 1; g.mvx[interior] = -2; g.mvy[interior] = 3;  // nowhere near a wall -- must be untouched
        g.mass[highX] = 1; g.mvx[highX] = -2;    // at the +x wall but moving INWARD (negative) -- not outward, so untouched
        g.mass[lowY] = 1; g.mvy[lowY] = 4;       // at the -y wall but moving AWAY (positive) -- must be untouched
        enforceWalls3(g, {});
        ok(g.mvx[lowX] === 0, "!!enforceWalls3 clamps a node moving further into the -x wall");
        ok(g.mvx[interior] === -2 && g.mvy[interior] === 3, "!!enforceWalls3 leaves an interior node (crossing no wall) alone");
        ok(g.mvx[highX] === -2, "enforceWalls3 leaves a wall-slab node moving inward (not outward) alone");
        ok(g.mvy[lowY] === 4, "!!enforceWalls3 leaves a -y wall node moving AWAY from the wall alone");

        const g2 = makeGrid3(4, 4, 4, 1);
        const highX2 = idx(g2, 4, 2, 2);
        g2.mass[highX2] = 1; g2.mvx[highX2] = 2;  // at the +x wall, moving further OUT (positive) -- must clamp
        enforceWalls3(g2, {});
        ok(g2.mvx[highX2] === 0, "!!enforceWalls3 clamps a node moving further out through the +x wall");
    }
    // floorOnly: only the -y wall is enforced; the -x wall (which would otherwise clamp) is ignored
    {
        const g = makeGrid3(4, 4, 4, 1);
        const lowY = idx(g, 2, 0, 2), lowX = idx(g, 0, 2, 2);
        g.mass[lowY] = 1; g.mvy[lowY] = -5;
        g.mass[lowX] = 1; g.mvx[lowX] = -5;
        enforceWalls3(g, { floorOnly: true });
        ok(g.mvy[lowY] === 0, "!!enforceWalls3 floorOnly still clamps the -y floor");
        ok(g.mvx[lowX] === -5, "!!enforceWalls3 floorOnly leaves the -x wall unclamped");
    }
}

// 13) stressForces3 -- (a) zero stress adds no force at all; (b) a non-finite P (inverted particle) is skipped
//     entirely, loudly, per the module's own comment; (c) SELF-EQUILIBRATION: the internal force a single
//     particle scatters to its 27-node stencil sums to zero on every axis (Newton's third law -- stress moves
//     material relative to itself, it cannot accelerate the centre of mass), using a uniform-mass grid so the
//     summed velocity delta is proportional to the summed force.
{
    const mkParticle = (F) => ({ x: 4.3, y: 4.6, z: 4.1, vol0: 0.1, F });
    // (a) zero stress
    {
        const g = makeGrid3(8, 8, 8, 1);
        for (let q = 0; q < g.n; q++) g.mass[q] = 1;
        const before = g.mvx.slice();
        stressForces3([mkParticle(I3)], g, () => ({ P: new Array(9).fill(0) }), 1 / 240);
        let changed = false;
        for (let q = 0; q < g.n; q++) if (g.mvx[q] !== before[q] || g.mvy[q] !== 0 || g.mvz[q] !== 0) changed = true;
        ok(!changed, "!!stressForces3 with zero stress adds no force anywhere");
    }
    // (b) inverted particle (non-finite P) contributes nothing
    {
        const g = makeGrid3(8, 8, 8, 1);
        for (let q = 0; q < g.n; q++) g.mass[q] = 1;
        stressForces3([mkParticle(I3)], g, () => ({ P: new Array(9).fill(NaN) }), 1 / 240);
        let touched = false;
        for (let q = 0; q < g.n; q++) if (g.mvx[q] !== 0 || g.mvy[q] !== 0 || g.mvz[q] !== 0) touched = true;
        ok(!touched, "!!stressForces3 skips a particle whose stress is non-finite (an inverted particle)");
    }
    // (c) self-equilibration for a real, nonzero, asymmetric stress
    {
        const g = makeGrid3(8, 8, 8, 1);
        for (let q = 0; q < g.n; q++) g.mass[q] = 1;
        const P = [3, 1, -0.5, 0.2, -2, 0.7, 0.4, -0.3, 1.5];
        stressForces3([mkParticle(I3)], g, () => ({ P }), 1 / 240);
        let sx = 0, sy = 0, sz = 0;
        for (let q = 0; q < g.n; q++) { sx += g.mvx[q]; sy += g.mvy[q]; sz += g.mvz[q]; }
        ok(near(sx, 0, 1e-9) && near(sy, 0, 1e-9) && near(sz, 0, 1e-9),
           "!!stressForces3's internal force on a single particle sums to zero over its stencil (self-equilibrating, sums " +
           sx.toExponential(2) + ", " + sy.toExponential(2) + ", " + sz.toExponential(2) + ")");
    }
    // (d) EXACT VALUE at one specific stencil node, formed independently from the module's own stated formula
    //     f = -vol0 * P . gradW, using quadWeightsGrad3 (already verified above) to get the trusted gradient
    //     components. This pins down which P component pairs with which gradient axis -- (c) alone cannot,
    //     since a term that sums to zero over the whole stencil can still have its sign or axis swapped.
    {
        const g = makeGrid3(8, 8, 8, 1);
        for (let q = 0; q < g.n; q++) g.mass[q] = 1;
        const part = mkParticle(I3);
        const P = [3, 1, -0.5, 0.2, -2, 0.7, 0.4, -0.3, 1.5];
        const dt = 1 / 240;
        const X = quadWeightsGrad3(part.x, g.h), Y = quadWeightsGrad3(part.y, g.h), Z = quadWeightsGrad3(part.z, g.h);
        const a = 1, b = 1, c = 1;   // an interior stencil node
        const i = X.base + a, j = Y.base + b, k = Z.base + c;
        const gx = X.dw[a] * Y.w[b] * Z.w[c], gy = X.w[a] * Y.dw[b] * Z.w[c], gz = X.w[a] * Y.w[b] * Z.dw[c];
        const wantFx = -part.vol0 * (P[0] * gx + P[1] * gy + P[2] * gz);
        const wantFy = -part.vol0 * (P[3] * gx + P[4] * gy + P[5] * gz);
        const wantFz = -part.vol0 * (P[6] * gx + P[7] * gy + P[8] * gz);
        stressForces3([part], g, () => ({ P }), dt);
        const q = (k * (g.ny + 1) + j) * (g.nx + 1) + i;
        ok(near(g.mvx[q], wantFx * dt, 1e-12) && near(g.mvy[q], wantFy * dt, 1e-12) && near(g.mvz[q], wantFz * dt, 1e-12),
           "!!stressForces3 matches -vol0*P.gradW exactly at one stencil node (pins the P-to-axis coupling, not just the total)");
    }
}

console.log(`step3d-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
