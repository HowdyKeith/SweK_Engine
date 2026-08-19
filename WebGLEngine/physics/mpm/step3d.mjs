// WebGLEngine/physics/mpm/step3d.mjs -- v3841 (the full 3D MPM loop: the piece above the transfer)
//
// mpm3dBind (v3804) established that the three TRANSFER identities lift to 3D, and said outright it was NOT 3D
// MPM -- no grid step, no stress, no loop. This is that loop, ported mechanically from the 2D step (v3794): p2g3
// -> normalise -> stress forces on the 27-node stencil -> gravity -> g2p3 -> advance F (3x3) -> advect. The one
// key that graded the 2D loop grades this one: the CENTRE OF MASS FOLLOWS THE ANALYTIC FALL, whatever the block
// does internally. PURE: no GL, no Three, no DOM. Gated in physics/mpm/step3d-selfcheck.mjs.

import { makeGrid3, p2g3, g2p3 } from "./transfer3d.mjs";
import { firstPiola3, advanceF3 } from "./constitutive3.mjs";

export { makeGrid3 };

// Quadratic B-spline weights AND their derivatives on one axis (the 2D forces used the 2D twin of this).
export function quadWeightsGrad3(x, h) {
    const xi = x / h, base = Math.floor(xi - 0.5), fx = xi - base;
    return {
        base,
        w: [0.5 * (1.5 - fx) * (1.5 - fx), 0.75 - (fx - 1) * (fx - 1), 0.5 * (fx - 0.5) * (fx - 0.5)],
        dw: [(fx - 1.5) / h, (-2 * (fx - 1)) / h, (fx - 0.5) / h],
    };
}

const idx3 = (g, i, j, k) => (k * (g.ny + 1) + j) * (g.nx + 1) + i;

// Grid momentum -> velocity, in place. After this the grid holds VELOCITY (v3794's lesson, in 3D).
export function normalise3(g) {
    for (let q = 0; q < g.n; q++) { const m = g.mass[q]; if (m > 0) { g.mvx[q] /= m; g.mvy[q] /= m; g.mvz[q] /= m; } }
    g.normalised = true;
    return g;
}

// A uniform body force (gravity) on the VELOCITY field: v += g*dt at every node that carries mass.
export function applyBodyForce3(g, gx, gy, gz, dt) {
    for (let q = 0; q < g.n; q++) if (g.mass[q] > 0) { g.mvx[q] += gx * dt; g.mvy[q] += gy * dt; g.mvz[q] += gz * dt; }
    return g;
}

// Zero the normal velocity in a slab of `lo`/`hi` cells at each boundary (a box). floorOnly keeps only the -y wall.
export function enforceWalls3(g, { lo = 1, hi = 1, sticky = false, floorOnly = false } = {}) {
    const clampAxis = (comp, i, nMax) => {
        if (i < lo) { if (sticky) { g.mvx[comp] = g.mvy[comp] = g.mvz[comp] = 0; } return true; }
        if (i > nMax - hi) { if (sticky) { g.mvx[comp] = g.mvy[comp] = g.mvz[comp] = 0; } return true; }
        return false;
    };
    for (let k = 0; k <= g.nz; k++) for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) {
        const q = idx3(g, i, j, k);
        if (g.mass[q] <= 0) continue;
        if (!floorOnly && i < lo && g.mvx[q] < 0) g.mvx[q] = 0;
        if (!floorOnly && i > g.nx - hi && g.mvx[q] > 0) g.mvx[q] = 0;
        if (j < lo && g.mvy[q] < 0) g.mvy[q] = 0;
        if (!floorOnly && j > g.ny - hi && g.mvy[q] > 0) g.mvy[q] = 0;
        if (!floorOnly && k < lo && g.mvz[q] < 0) g.mvz[q] = 0;
        if (!floorOnly && k > g.nz - hi && g.mvz[q] > 0) g.mvz[q] = 0;
    }
    return g;
}

// Internal stress forces scattered to the 27-node stencil. stressOf(F, p) -> { P } (3x3). With the reference F0 =
// identity, the scatter is -vol0 * P . gradW at each node. Adds directly to the velocity field as f/m * dt.
export function stressForces3(particles, g, stressOf, dt) {
    const f = [new Float64Array(g.n), new Float64Array(g.n), new Float64Array(g.n)];
    for (const p of particles) {
        const { P } = stressOf(p.F, p);
        if (!P || !Number.isFinite(P[0])) continue;                 // an inverted particle contributes NOTHING, loudly
        const X = quadWeightsGrad3(p.x, g.h), Y = quadWeightsGrad3(p.y, g.h), Z = quadWeightsGrad3(p.z, g.h);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
            const i = X.base + a, j = Y.base + b, k = Z.base + c;
            if (i < 0 || j < 0 || k < 0 || i > g.nx || j > g.ny || k > g.nz) continue;
            const gx = X.dw[a] * Y.w[b] * Z.w[c], gy = X.w[a] * Y.dw[b] * Z.w[c], gz = X.w[a] * Y.w[b] * Z.dw[c];
            const q = idx3(g, i, j, k);
            f[0][q] -= p.vol0 * (P[0] * gx + P[1] * gy + P[2] * gz);
            f[1][q] -= p.vol0 * (P[3] * gx + P[4] * gy + P[5] * gz);
            f[2][q] -= p.vol0 * (P[6] * gx + P[7] * gy + P[8] * gz);
        }
    }
    for (let q = 0; q < g.n; q++) { const m = g.mass[q]; if (m > 0) { g.mvx[q] += (f[0][q] / m) * dt; g.mvy[q] += (f[1][q] / m) * dt; g.mvz[q] += (f[2][q] / m) * dt; } }
    return g;
}

// One full 3D MPM step.
export function step3(ps, g, { dt = 1 / 240, gx = 0, gy = -9.81, gz = 0, params, plastic = false, walls = null, noForces = false } = {}) {
    p2g3(ps, g, { affine: true });
    normalise3(g);
    if (!noForces) stressForces3(ps, g, (F, p) => firstPiola3(F, (p && p.mat) || params), dt);
    applyBodyForce3(g, gx, gy, gz, dt);
    if (walls) enforceWalls3(g, walls);
    g2p3(ps, g, { affine: true });
    for (const p of ps) {
        p.F = advanceF3(p.F, p.C, dt);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    return ps;
}

// An n x n x n block of particles at rest, F = identity.
export function restBlock3({ n = 4, spacing = 0.4, x0 = 2, y0 = 4, z0 = 2, m = 0.1, vol0 = 0.064 } = {}) {
    const ps = [];
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
        ps.push({ x: x0 + a * spacing, y: y0 + b * spacing, z: z0 + c * spacing, vx: 0, vy: 0, vz: 0,
                  m, vol0, F: [1, 0, 0, 0, 1, 0, 0, 0, 1], C: [0, 0, 0, 0, 0, 0, 0, 0, 0] });
    }
    return ps;
}

export function centreOfMass3(ps) {
    let x = 0, y = 0, z = 0, M = 0;
    for (const p of ps) { x += p.m * p.x; y += p.m * p.y; z += p.m * p.z; M += p.m; }
    return { x: x / M, y: y / M, z: z / M };
}

// Run n free-fall steps (no walls) and report how far the centre of mass strayed from the analytic discrete fall
// in y, and how far it drifted in x and z (which must stay put). The analytic value is the SYMPLECTIC one --
// g*dt^2*n(n+1)/2 -- matching the 2D key, not the textbook g*t^2/2.
export function freeFall3Error(ps, { steps = 120, dt = 1 / 240, gy = -9.81, params, plastic = false } = {}) {
    const g = makeGrid3(16, 16, 16, 0.5), c0 = centreOfMass3(ps);
    let maxErr = 0, maxDrift = 0;
    for (let s = 1; s <= steps; s++) {
        step3(ps, g, { dt, gy, params, plastic });
        const c = centreOfMass3(ps), want = c0.y + gy * dt * dt * (s * (s + 1) / 2);
        maxErr = Math.max(maxErr, Math.abs(c.y - want));
        maxDrift = Math.max(maxDrift, Math.abs(c.x - c0.x), Math.abs(c.z - c0.z));
    }
    return { maxErr, maxDrift };
}
