// fluid/vorticity.mjs -- v4440 -- vorticity confinement on the MAC grid, and the claim it was built to settle.
//
// *** THIS ROUND SET OUT TO BUILD A SMOKE SOLVER AND FOUND THE TREE HAS TWO FLUID SOLVERS ALREADY, WHICH IS
// THE FOURTH ABSENCE CLAIM OF MINE IN FOUR ROUNDS TO BE WRONG -- AND THE FIRST CAUGHT BEFORE ANY CODE WAS
// WRITTEN. *** I told Keith the tree had no grid smoke solver and no vortex particles. Measured with
// tools/ship/absenceScope.mjs: fluid/flip2d.mjs and fluid/flip3d.mjs are FLIP/PIC solvers on a staggered MAC
// grid with pressure projection and RK2 advection, unit-tested to the point of "divergence collapses after
// the pressure solve"; and fx/vorton/vorton.js is a VORTEX-PARTICLE method, which is exactly the technique I
// said was absent. `vorticity` and `confinement` really are zero in code. Nothing else was.
//
// ---- *** AND THE TREE ALREADY CONTAINED THE CLAIM THIS TECHNIQUE EXISTS TO ADDRESS, UNMEASURED *** --------
//
// fx/vorton/vorton.js's own header says its method is "divergence-free by construction, which is why it keeps
// the beautiful filamentary wisps A GRID SOLVER SMEARS AWAY." That is a comparative claim about a grid solver,
// written in a file that is not one -- and BOTH SIDES OF IT ARE IN THIS TREE. flip2d.mjs is the grid solver
// being described. Nobody had ever put the two in the same room.
//
// So the round is not "add smoke". It is: MEASURE HOW MUCH VORTICITY THE GRID ACTUALLY DESTROYS, implement
// the standard remedy (Fedkiw, Stam and Jensen 2001, read from the technique in mmacklin/sandbox's smoke demo
// -- MIT, C++/CUDA, NOT VENDORED for the toolchain reason v4432 and v4436 both gave), and measure what it
// gives back and what it costs.
//
// ---- *** WHAT IS EXACT HERE, AND IT IS THE PART WORTH HAVING *** ------------------------------------------
//
//   * THE CONFINEMENT FORCE IS PERPENDICULAR TO THE GRADIENT IT IS BUILT FROM, TO MACHINE PRECISION.
//     f = eps h (N x omega) with N the unit gradient of |omega|, so f . N = 0 identically -- the force pushes
//     ALONG a vortex sheet and never up the gradient. That is a cross product being a cross product, so it is
//     an exact zero rather than a tolerance, and an implementation that got the sign or the index order wrong
//     would not have it.
//   * THE DISCRETE CURL IS SECOND ORDER. Central differences on a MAC grid, against an analytic Taylor-Green
//     field whose curl is known in closed form, must converge at h^2 -- a rate rather than a value, so it
//     cannot be satisfied by a lucky constant.
//
// ---- *** AND WHAT IS MEASURED RATHER THAN ASSERTED, WHICH IS THE HONEST HALF *** ---------------------------
//
// CONFINEMENT IS NOT A RESTORATION AND THIS FILE DOES NOT PRETEND IT IS. It is a non-physical forcing term
// with a free parameter, eps, tuned by eye in every renderer that ships it. It injects energy: there is no
// conservation law it respects, and turning eps up far enough makes a fluid explode. So enstrophy decay is
// measured, the recovery is measured, and the energy injected is measured -- and the gate holds the ratio to
// a RANGE rather than asserting that what comes back equals what was lost, because it does not.

import { Flip2D } from "./flip2d.mjs";

"use strict";

/**
 * The z-vorticity at cell centre (i, j), central differences on the staggered grid.
 * u lives on vertical faces ((nx+1) x ny), v on horizontal faces (nx x (ny+1)), so the natural place for
 * omega = dv/dx - du/dy is the CELL CORNER. Taking it at the centre needs the four-face average, which is what
 * costs the extra term below and is why a naive one-sided version reads high near a shear layer.
 */
export function curlAt(sim, i, j) {
    const { nx, ny, h, u, v } = sim;
    if (i < 0 || j < 0 || i >= nx || j >= ny) return 0;
    // dv/dx at the cell centre: average the two horizontal faces of this cell, differenced against neighbours.
    const vC = 0.5 * (v[sim.vi(i, j)] + v[sim.vi(i, j + 1)]);
    const vL = i > 0 ? 0.5 * (v[sim.vi(i - 1, j)] + v[sim.vi(i - 1, j + 1)]) : vC;
    const vR = i < nx - 1 ? 0.5 * (v[sim.vi(i + 1, j)] + v[sim.vi(i + 1, j + 1)]) : vC;
    const uC = 0.5 * (u[sim.ui(i, j)] + u[sim.ui(i + 1, j)]);
    const uD = j > 0 ? 0.5 * (u[sim.ui(i, j - 1)] + u[sim.ui(i + 1, j - 1)]) : uC;
    const uU = j < ny - 1 ? 0.5 * (u[sim.ui(i, j + 1)] + u[sim.ui(i + 1, j + 1)]) : uC;
    const span = (i > 0 && i < nx - 1) ? 2 * h : h;
    const spanY = (j > 0 && j < ny - 1) ? 2 * h : h;
    return (vR - vL) / span - (uU - uD) / spanY;
}

/** The whole field, cell-centred, as a Float64Array of nx*ny. */
export function curlField(sim) {
    const w = new Float64Array(sim.nx * sim.ny);
    for (let j = 0; j < sim.ny; j++) for (let i = 0; i < sim.nx; i++) w[i + j * sim.nx] = curlAt(sim, i, j);
    return w;
}

/** Enstrophy: the sum of omega^2 over the grid. The standard scalar measure of how much vorticity is present,
 *  and the one that falls when a solver smears -- a signed total would cancel a vortex pair to zero. */
export const enstrophy = (sim, w = curlField(sim)) => w.reduce((s, x) => s + x * x, 0);

/** Kinetic energy on the faces, for measuring what confinement injects. */
export function kineticEnergy(sim) {
    let e = 0;
    for (let n = 0; n < sim.u.length; n++) e += sim.u[n] * sim.u[n];
    for (let n = 0; n < sim.v.length; n++) e += sim.v[n] * sim.v[n];
    return 0.5 * e;
}

/**
 * The confinement force at a cell, Fedkiw et al. 2001.
 *   N = grad|omega| / ||grad|omega|||        f = eps * h * (N x omega)
 * In 2D omega points out of the plane, so N x omega = (N_y * omega, -N_x * omega).
 * Returns [fx, fy, Nx, Ny] so a check can assert f . N = 0 without recomputing N.
 */
export function confinementAt(sim, w, i, j, eps) {
    const { nx, ny, h } = sim;
    const mag = (a, b) => Math.abs(w[a + b * nx]);
    if (i <= 0 || j <= 0 || i >= nx - 1 || j >= ny - 1) return [0, 0, 0, 0];
    const gx = (mag(i + 1, j) - mag(i - 1, j)) / (2 * h);
    const gy = (mag(i, j + 1) - mag(i, j - 1)) / (2 * h);
    const len = Math.hypot(gx, gy);
    if (len < 1e-20) return [0, 0, 0, 0];
    const Nx = gx / len, Ny = gy / len;
    const om = w[i + j * nx];
    return [eps * h * (Ny * om), eps * h * (-Nx * om), Nx, Ny];
}

/** Apply confinement to the face velocities for one step. Returns the energy it added. */
export function applyConfinement(sim, dt, eps) {
    const w = curlField(sim);
    const before = kineticEnergy(sim);
    const du = new Float64Array(sim.u.length), dv = new Float64Array(sim.v.length);
    for (let j = 1; j < sim.ny - 1; j++) {
        for (let i = 1; i < sim.nx - 1; i++) {
            const [fx, fy] = confinementAt(sim, w, i, j, eps);
            if (fx === 0 && fy === 0) continue;
            // Split the cell-centred force onto its own two faces each side -- the transpose of the averaging
            // curlAt does, so the force lands where the velocity it acts on actually lives.
            du[sim.ui(i, j)] += 0.5 * fx * dt; du[sim.ui(i + 1, j)] += 0.5 * fx * dt;
            dv[sim.vi(i, j)] += 0.5 * fy * dt; dv[sim.vi(i, j + 1)] += 0.5 * fy * dt;
        }
    }
    for (let n = 0; n < sim.u.length; n++) sim.u[n] += du[n];
    for (let n = 0; n < sim.v.length; n++) sim.v[n] += dv[n];
    return kineticEnergy(sim) - before;
}

// ---- the analytic field the discrete curl is graded against ------------------------------------------------
//
// Taylor-Green: u = sin(kx) cos(ky), v = -cos(kx) sin(ky), whose curl is exactly +2k sin(kx) sin(ky):
//   dv/dx = +k sin(kx) sin(ky),  du/dy = -k sin(kx) sin(ky),  omega = dv/dx - du/dy = 2k sin(kx) sin(ky).
// *** THE FIRST VERSION WROTE -2k AND THE CONVERGENCE TEST CAUGHT IT IMMEDIATELY -- but what identified it as
// a SIGN rather than a discretisation error was the SIZE: the error sat flat at 25.1 across four resolutions,
// which is exactly 2 x 4pi, twice the curl amplitude. An error that does not fall with h is not a truncation
// error, and one that equals twice the signal is the signal with the wrong sign. THE CODE WAS RIGHT AND THE
// REFERENCE WAS WRONG, which is the direction nobody checks first. ***
// It is divergence-free in closed form, so it also gives the pressure projection nothing to do -- which is
// what makes it a clean test of the CURL rather than of the solver around it.
export const TG = Object.freeze({
    u: (x, y, k) => Math.sin(k * x) * Math.cos(k * y),
    v: (x, y, k) => -Math.cos(k * x) * Math.sin(k * y),
    curl: (x, y, k) => 2 * k * Math.sin(k * x) * Math.sin(k * y),
});

/** Stamp Taylor-Green onto a fresh sim's faces at the positions those faces actually occupy. */
export function taylorGreen(nx, ny, k = 1, { h = 1 / nx } = {}) {
    const sim = new Flip2D(nx, ny, { h });
    for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) sim.u[sim.ui(i, j)] = TG.u(i * h, (j + 0.5) * h, k);
    for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) sim.v[sim.vi(i, j)] = TG.v((i + 0.5) * h, j * h, k);
    return sim;
}

// ---- *** SEMI-LAGRANGIAN ADVECTION, WHICH IS THE "GRID SOLVER" THE VORTON HEADER MEANS *** -----------------
//
// The tree's FLIP/PIC solvers are ALREADY a partial answer to this problem -- carrying velocity on particles
// is how FLIP avoids the smearing a pure grid suffers -- so "a grid solver smears away" is a claim about the
// semi-Lagrangian scheme (Stam 1999), which the tree did not have. It is added here because without it there
// is nothing for confinement to correct and nothing for the vorton claim to be measured against. Backtrace
// each face by dt along the interpolated velocity, sample the old field there, write it back.

const sampleFace = (field, w, hgt, gx, gy) => {
    const i = Math.max(0, Math.min(w - 2, Math.floor(gx)));
    const j = Math.max(0, Math.min(hgt - 2, Math.floor(gy)));
    const fx = Math.max(0, Math.min(1, gx - i)), fy = Math.max(0, Math.min(1, gy - j));
    return (1 - fx) * (1 - fy) * field[i + j * w] + fx * (1 - fy) * field[i + 1 + j * w] +
           (1 - fx) * fy * field[i + (j + 1) * w] + fx * fy * field[i + 1 + (j + 1) * w];
};

export function advectSemiLagrangian(sim, dt) {
    const { nx, ny, h } = sim;
    const u0 = Float32Array.from(sim.u), v0 = Float32Array.from(sim.v);
    const uAt = (gx, gy) => sampleFace(u0, nx + 1, ny, gx, gy);
    const vAt = (gx, gy) => sampleFace(v0, nx, ny + 1, gx, gy);
    for (let j = 0; j < ny; j++) {
        for (let i = 0; i <= nx; i++) {
            const uu = u0[sim.ui(i, j)], vv = vAt(i - 0.5, j + 0.5);
            sim.u[sim.ui(i, j)] = uAt(i - (uu * dt) / h, j - (vv * dt) / h);
        }
    }
    for (let j = 0; j <= ny; j++) {
        for (let i = 0; i < nx; i++) {
            const vv = v0[sim.vi(i, j)], uu = uAt(i + 0.5, j - 0.5);
            sim.v[sim.vi(i, j)] = vAt(i - (uu * dt) / h, j - (vv * dt) / h);
        }
    }
}

/** Run n steps of pure advection, optionally with confinement, reporting enstrophy and energy each step. */
export function run(sim, { steps = 40, dt = 0.01, eps = 0 } = {}) {
    const hist = [{ step: 0, enstrophy: enstrophy(sim), energy: kineticEnergy(sim), injected: 0 }];
    let injectedTotal = 0;
    for (let s = 1; s <= steps; s++) {
        if (eps > 0) injectedTotal += applyConfinement(sim, dt, eps);
        advectSemiLagrangian(sim, dt);
        hist.push({ step: s, enstrophy: enstrophy(sim), energy: kineticEnergy(sim), injected: injectedTotal });
    }
    return hist;
}
