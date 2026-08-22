// simulation/lbm/lbm3d.js -- the lattice in three dimensions, where the engine actually lives.
//
// D3Q19. Nineteen velocities: one sitting still, six through the faces, twelve through the edges. The corners of the
// cube are left out, which is what distinguishes D3Q19 from D3Q27 -- and they can be left out because what a lattice
// actually needs is enough symmetry to recover the Navier-Stokes equations, not every direction imaginable. D3Q19 has
// exactly enough. That is not a shortcut; it is the whole art of the method.
//
// The weights and the speed of sound are NOT retyped from the 2D lattice: 1/3 for the rest state, 1/18 through each
// face, 1/36 through each edge -- and cs^2 = 1/3, the same as D2Q9, which is not a coincidence but a consequence of
// using the same Gauss-Hermite quadrature. Everything derives from CS2 the way v2455 made the 2D lattice do it, after
// discovering that its constant had been decorative for twelve rounds.
//
// The prize is the same shape as the one that started this arc. A channel gave us Poiseuille's parabola exactly. A
// PIPE gives Hagen-Poiseuille -- a paraboloid, u(r) = F (R^2 - r^2) / 4nu -- exact since 1840, and written nowhere in
// this file. If the 3D lattice is real, it has to find it the same way the 2D one did.
"use strict";
import { CS2 } from "./lbm2d.js";   // one source of truth for the speed of sound, across both lattices

// 0 rest | 1-6 faces | 7-18 edges
const E3 = [
    [0, 0, 0],
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0],
    [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1],
    [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1],
];
const W3 = [1 / 3,
    1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18,
    1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const Q3 = 19;
// opposite direction for each velocity -- derived by search rather than typed, so it cannot be typed wrong
const OPP3 = E3.map(e => E3.findIndex(o => o[0] === -e[0] && o[1] === -e[1] && o[2] === -e[2]));

const _K1 = 1 / CS2, _K2 = 1 / (2 * CS2 * CS2), _K3 = 1 / (2 * CS2);   // 3, 4.5, 1.5 -- derived, never typed
const viscosityOf3 = (tau) => CS2 * (tau - 0.5);
function equilibrium3(i, rho, ux, uy, uz) {
    const eu = E3[i][0] * ux + E3[i][1] * uy + E3[i][2] * uz;
    const u2 = ux * ux + uy * uy + uz * uz;
    return W3[i] * rho * (1 + _K1 * eu + _K2 * eu * eu - _K3 * u2);
}

function makeLBM3D(opts = {}) {
    const nx = opts.nx || 24, ny = opts.ny || 24, nz = opts.nz || 8;
    const tau = opts.tau == null ? 0.8 : opts.tau;
    const F = opts.force || [0, 0, 0];
    const n = nx * ny * nz;
    const f = new Float64Array(n * Q3), fp = new Float64Array(n * Q3);
    const solid = new Uint8Array(n);
    const rho = new Float64Array(n), ux = new Float64Array(n), uy = new Float64Array(n), uz = new Float64Array(n);
    const idx = (x, y, z) => (z * ny + y) * nx + x;
    if (opts.solidAt) for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++)
        if (opts.solidAt(x, y, z)) solid[idx(x, y, z)] = 1;
    for (let k = 0; k < n; k++) { rho[k] = 1; for (let i = 0; i < Q3; i++) f[k * Q3 + i] = W3[i]; }
    const cf = 1 - 1 / (2 * tau);
    function step() {
        for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            const k = idx(x, y, z), b = k * Q3;
            if (solid[k]) { for (let i = 0; i < Q3; i++) fp[b + i] = f[b + OPP3[i]]; continue; }   // bounce-back: no-slip
            let r = 0, mx = 0, my = 0, mz = 0;
            for (let i = 0; i < Q3; i++) { const fi = f[b + i]; r += fi; mx += fi * E3[i][0]; my += fi * E3[i][1]; mz += fi * E3[i][2]; }
            // half-force correction, exactly as in 2D: the force acts across the step, so the velocity is mid-step
            const vx = r > 0 ? mx / r + F[0] * 0.5 : 0, vy = r > 0 ? my / r + F[1] * 0.5 : 0, vz = r > 0 ? mz / r + F[2] * 0.5 : 0;
            rho[k] = r; ux[k] = vx; uy[k] = vy; uz[k] = vz;
            for (let i = 0; i < Q3; i++) {
                const e = E3[i];
                const eu = e[0] * vx + e[1] * vy + e[2] * vz;
                // Guo forcing, three-dimensional
                const Fi = W3[i] * cf * r * (
                    _K1 * ((e[0] - vx) * F[0] + (e[1] - vy) * F[1] + (e[2] - vz) * F[2]) +
                    _K2 * 2 * eu * (e[0] * F[0] + e[1] * F[1] + e[2] * F[2]));
                fp[b + i] = f[b + i] - (f[b + i] - equilibrium3(i, r, vx, vy, vz)) / tau + Fi;
            }
        }
        for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            const src = idx(x, y, z) * Q3;
            for (let i = 0; i < Q3; i++) {
                const tx = (x + E3[i][0] + nx) % nx, ty = (y + E3[i][1] + ny) % ny, tz = (z + E3[i][2] + nz) % nz;
                f[idx(tx, ty, tz) * Q3 + i] = fp[src + i];
            }
        }
        return { rho, ux, uy, uz };
    }
    function mass() { let m = 0; for (let k = 0; k < n; k++) if (!solid[k]) m += rho[k]; return m; }
    return { step, mass, rho, ux, uy, uz, solid, nx, ny, nz, idx, tau, nu: viscosityOf3(tau) };
}
export { makeLBM3D, equilibrium3, viscosityOf3, E3, W3, OPP3, Q3 };
