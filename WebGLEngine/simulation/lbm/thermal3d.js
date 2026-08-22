// simulation/lbm/thermal3d.js -- heat in three dimensions.
//
// The same move as the 2D thermal lattice, made in 3D: a SECOND distribution, g, carrying internal energy the way f
// carries momentum. It rides the flow, relaxes toward its own equilibrium, and its diffusivity falls out of its own
// relaxation time. One line couples them -- hot fluid is lighter -- and that loop is convection.
//
// The prize is worth being precise about, because it is a stronger claim than it first sounds. The critical Rayleigh
// number for a layer heated from below is 1707.76 -- and it is THE SAME NUMBER IN THREE DIMENSIONS AS IN TWO. That is
// not a coincidence or a convenience: the mode that goes unstable first is a two-dimensional roll, so a 3D fluid,
// given the freedom to convect any way it likes, must still choose to break at exactly the number a 2D one does.
// Nothing in this file contains 1708. The 3D lattice has to find it independently, with three dimensions of freedom
// it could have used to find something else.
//
// Boussinesq, exactly as in 2D: temperature and buoyancy, no gamma and no pressure work. Sedov stays with Euler.
"use strict";
import { E3, W3, OPP3, Q3, equilibrium3 } from "./lbm3d.js";
import { CS2 } from "./lbm2d.js";   // one source of truth for the speed of sound across all three lattices

const _G1 = 1 / CS2, _G2 = 1 / (2 * CS2 * CS2), _G3 = 1 / (2 * CS2);   // derived, never typed (v2455)
const diffusivityOf3 = (tauG) => CS2 * (tauG - 0.5);
function thermalEq3(i, T, ux, uy, uz) {
    const e = E3[i];
    const eu = e[0] * ux + e[1] * uy + e[2] * uz, u2 = ux * ux + uy * uy + uz * uz;
    return W3[i] * T * (1 + _G1 * eu + _G2 * eu * eu - _G3 * u2);
}

function makeThermal3D(opts = {}) {
    const nx = opts.nx || 24, ny = opts.ny || 24, nz = opts.nz || 18;
    const tau = opts.tau == null ? 0.8 : opts.tau, tauG = opts.tauG == null ? 0.8 : opts.tauG;
    const gravity = opts.gravity == null ? 0 : opts.gravity, beta = opts.beta == null ? 0 : opts.beta;
    const Thot = opts.Thot == null ? 0.5 : opts.Thot, Tcold = opts.Tcold == null ? -0.5 : opts.Tcold;
    const n = nx * ny * nz;
    const f = new Float64Array(n * Q3), fp = new Float64Array(n * Q3);
    const g = new Float64Array(n * Q3), gp = new Float64Array(n * Q3);
    const solid = new Uint8Array(n), rho = new Float64Array(n);
    const ux = new Float64Array(n), uy = new Float64Array(n), uz = new Float64Array(n), T = new Float64Array(n);
    const idx = (x, y, z) => (z * ny + y) * nx + x;
    // z is up: hot floor at z=0, cold ceiling at z=nz-1. x and y are periodic, so the layer is effectively infinite.
    if (opts.walls !== false) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { solid[idx(x, y, 0)] = 1; solid[idx(x, y, nz - 1)] = 1; }
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const k = idx(x, y, z), s0 = opts.init ? opts.init(x, y, z) : null;
        rho[k] = 1; ux[k] = (s0 && s0.ux) || 0; uy[k] = (s0 && s0.uy) || 0; uz[k] = (s0 && s0.uz) || 0;
        T[k] = (s0 && s0.T != null) ? s0.T : 0;
        for (let i = 0; i < Q3; i++) { f[k * Q3 + i] = equilibrium3(i, 1, ux[k], uy[k], uz[k]); g[k * Q3 + i] = thermalEq3(i, T[k], ux[k], uy[k], uz[k]); }
    }
    const cf = 1 - 1 / (2 * tau);
    function step() {
        for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            const k = idx(x, y, z), b = k * Q3;
            if (solid[k]) {
                const Tw = z === 0 ? Thot : Tcold;
                for (let i = 0; i < Q3; i++) {
                    fp[b + i] = f[b + OPP3[i]];                                            // bounce-back -> no-slip
                    gp[b + i] = opts.adiabatic ? g[b + OPP3[i]] : (-g[b + OPP3[i]] + 2 * W3[i] * Tw);   // anti-bounce-back -> the wall holds a temperature
                }
                continue;
            }
            let r = 0, mx = 0, my = 0, mz = 0, t = 0;
            for (let i = 0; i < Q3; i++) { const fi = f[b + i]; r += fi; mx += fi * E3[i][0]; my += fi * E3[i][1]; mz += fi * E3[i][2]; t += g[b + i]; }
            T[k] = t;
            const az = gravity * beta * t;                    // buoyancy, along z. The entire coupling.
            rho[k] = r;
            const vx = r > 0 ? mx / r : 0, vy = r > 0 ? my / r : 0, vz = r > 0 ? mz / r + az * 0.5 : 0;
            ux[k] = vx; uy[k] = vy; uz[k] = vz;
            for (let i = 0; i < Q3; i++) {
                const e = E3[i];
                const eu = e[0] * vx + e[1] * vy + e[2] * vz;
                const Fi = W3[i] * cf * r * (_G1 * (e[2] - vz) * az + _G2 * 2 * eu * e[2] * az);   // Guo, vertical only
                fp[b + i] = f[b + i] - (f[b + i] - equilibrium3(i, r, vx, vy, vz)) / tau + Fi;
                gp[b + i] = g[b + i] - (g[b + i] - thermalEq3(i, t, vx, vy, vz)) / tauG;
            }
        }
        for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            const src = idx(x, y, z) * Q3;
            for (let i = 0; i < Q3; i++) {
                const tx = (x + E3[i][0] + nx) % nx, ty = (y + E3[i][1] + ny) % ny;
                let tz = z + E3[i][2];
                if (opts.periodicZ) tz = (tz + nz) % nz; else if (tz < 0 || tz >= nz) continue;
                f[idx(tx, ty, tz) * Q3 + i] = fp[src + i];
                g[idx(tx, ty, tz) * Q3 + i] = gp[src + i];
            }
        }
        for (let k = 0; k < n; k++) if (!solid[k]) { let t = 0; for (let i = 0; i < Q3; i++) t += g[k * Q3 + i]; T[k] = t; }
        return { rho, ux, uy, uz, T };
    }
    const H = nz - 2, nu = CS2 * (tau - 0.5), alpha = diffusivityOf3(tauG);
    const Ra = Math.abs(gravity * beta * (Thot - Tcold) * H * H * H / (nu * alpha));
    function kinetic() { let e = 0; for (let k = 0; k < n; k++) if (!solid[k]) e += ux[k]*ux[k] + uy[k]*uy[k] + uz[k]*uz[k]; return Math.sqrt(e / n); }
    return { step, kinetic, rho, ux, uy, uz, T, solid, nx, ny, nz, idx, nu, alpha, Ra, H };
}
export { makeThermal3D, thermalEq3, diffusivityOf3 };
