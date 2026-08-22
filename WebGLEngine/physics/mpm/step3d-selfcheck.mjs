// WebGLEngine/physics/mpm/step3d-selfcheck.mjs -- v3841
//
// mpm3dBind proved the transfer identities lift; this proves the LOOP above them works. The key is the same one
// that graded the 2D step: whatever the block does internally, its centre of mass follows the analytic fall, and
// does not drift sideways -- now in three axes. Plus the 3x3 constitutive: undeformed material has no stress, the
// Cauchy stress is symmetric (angular-momentum balance in 3D), and an inverted particle says so with NaN rather
// than clamping. The LOOK -- a block tumbling in 3D -- is Keith's; the arithmetic is here.
//
// Run: node physics/mpm/step3d-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { restBlock3, step3, centreOfMass3, freeFall3Error, makeGrid3 } from "./step3d.mjs";
import { firstPiola3, cauchy3, advanceF3, det3, mul3, I3 } from "./constitutive3.mjs";
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

console.log(`step3d-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
