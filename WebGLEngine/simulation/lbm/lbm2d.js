// simulation/lbm/lbm2d.js -- the lattice Boltzmann method, owned rather than borrowed.
//
// FluidX3D is the fastest LBM code there is and it is genuinely excellent, but it is free for NON-COMMERCIAL use only
// and its author has said integration into other packages is not planned. A portfolio built to get someone hired
// cannot lean on that. The algorithm underneath it, though, is not anybody's property: LBM is published physics, and
// it is exactly the kind of thing this engine has taken and owned before -- like the Voronoi fracture.
//
// So this is D2Q9 BGK from the equations up: collide, stream, halfway bounce-back walls, Guo forcing. Nothing is
// copied and nothing is approximated for looks. The point of doing it this way is the test at the end: pressure-driven
// flow in a channel has an EXACT analytic answer (a parabola), and so does the fluid's viscosity as a function of the
// relaxation time. If the code is really solving Navier-Stokes, it must reproduce both without being told either.
// If it is merely producing swirls that look like fluid, it will not. That is the difference between a simulation and
// an effect, and it is measurable.
//
// Pure maths, no GPU, no browser -- it runs and verifies in a terminal. The WebGPU compute path is built from these
// same constants (simulation/lbm/lbmShader.js) so the two can never drift apart.
"use strict";

// D2Q9: the nine directions a population can move on a square lattice, their weights, and their opposites.
const E = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
// Specular reflection: flip the y-component and keep the x-component. A population arriving up-right leaves
// down-right, carrying its tangential momentum with it -- a FREE-SLIP wall, which stops the flow crossing without
// dragging on it. Bounce-back reverses both components and so applies no-slip instead.
const SPEC = [0, 1, 4, 3, 2, 8, 7, 6, 5];
const CS2 = 1 / 3;                       // lattice speed of sound squared
const Q = 9;

// the physics the whole thing hangs on: viscosity is not a parameter you set, it FALLS OUT of the relaxation time
function viscosityOf(tau) { return CS2 * (tau - 0.5); }
function tauFor(nu) { return nu / CS2 + 0.5; }

// v2455 -- these coefficients ARE the speed of sound, and they used to be typed in as 3, 4.5 and 1.5 while CS2 sat
// above them as a separate literal. That made CS2 a constant that DESCRIBED the lattice without DEFINING it: change
// it and viscosityOf would cheerfully report a viscosity the fluid did not have, while the fluid carried on with the
// hard-coded numbers. A sabotage test found it -- corrupting CS2 changed nothing at all, which is how a constant
// proves it is decorative. Now there is one source of truth and the identities are written out, so the arithmetic is
// checkable rather than trusted: 1/cs^2 = 3, 1/(2 cs^4) = 4.5, 1/(2 cs^2) = 1.5.
const _C1 = 1 / CS2;                 // 3
const _C2 = 1 / (2 * CS2 * CS2);     // 4.5
const _C3 = 1 / (2 * CS2);           // 1.5
function equilibrium(i, rho, ux, uy) {
    const eu = E[i][0] * ux + E[i][1] * uy, u2 = ux * ux + uy * uy;
    return W[i] * rho * (1 + _C1 * eu + _C2 * eu * eu - _C3 * u2);
}

function makeLBM(opts = {}) {
    const nx = opts.nx || 64, ny = opts.ny || 32;
    const tau = opts.tau == null ? 0.8 : opts.tau;
    const gx = (opts.force && opts.force[0]) || 0, gy = (opts.force && opts.force[1]) || 0;
    const n = nx * ny;
    const f = new Float64Array(n * Q), fp = new Float64Array(n * Q);
    const solid = new Uint8Array(n);
    const rho = new Float64Array(n), ux = new Float64Array(n), uy = new Float64Array(n);
    const idx = (x, y) => y * nx + x;
    // walls: the top and bottom rows are solid, so the fluid is a channel. Halfway bounce-back puts the true no-slip
    // surface midway between the last fluid node and the wall node -- which is why the analytic comparison uses y+0.5.
    if (opts.channel !== false) for (let x = 0; x < nx; x++) { solid[idx(x, 0)] = 1; solid[idx(x, ny - 1)] = 1; }
    if (opts.solidAt) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (opts.solidAt(x, y)) solid[idx(x, y)] = 1;
    // start at rest, or wherever the caller says -- initialised AT equilibrium, so nothing rings on the first step
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const k = idx(x, y);
        const s0 = opts.init ? opts.init(x, y) : null;
        const r0 = (s0 && s0.rho != null) ? s0.rho : 1, vx0 = (s0 && s0.ux) || 0, vy0 = (s0 && s0.uy) || 0;
        rho[k] = r0; ux[k] = vx0; uy[k] = vy0;
        for (let i = 0; i < Q; i++) f[k * Q + i] = equilibrium(i, r0, vx0, vy0);
    }

    function macro(k) {
        let r = 0, mx = 0, my = 0;
        for (let i = 0; i < Q; i++) { const fi = f[k * Q + i]; r += fi; mx += fi * E[i][0]; my += fi * E[i][1]; }
        rho[k] = r;
        // the half-force correction. Without it the measured velocity is wrong by exactly g/2 and the parabola sits low.
        ux[k] = r > 0 ? mx / r + gx * 0.5 : 0;
        uy[k] = r > 0 ? my / r + gy * 0.5 : 0;
    }
    function step() {
        const cf = 1 - 1 / (2 * tau);                       // Guo's forcing prefactor
        for (let k = 0; k < n; k++) {
            if (solid[k]) {
                const R = opts.slip ? SPEC : OPP;                         // free-slip walls, or no-slip: the caller decides
                for (let i = 0; i < Q; i++) fp[k * Q + i] = f[k * Q + R[i]];
                continue;
            }
            macro(k);
            const r = rho[k], vx = ux[k], vy = uy[k];
            for (let i = 0; i < Q; i++) {
                const feq = equilibrium(i, r, vx, vy);
                const eu = E[i][0] * vx + E[i][1] * vy;
                // Guo forcing: the correct way to push a lattice fluid. A naive push gets the viscosity subtly wrong.
                const Fi = W[i] * cf * r * (3 * ((E[i][0] - vx) * gx + (E[i][1] - vy) * gy) + 9 * eu * (E[i][0] * gx + E[i][1] * gy));
                fp[k * Q + i] = f[k * Q + i] - (f[k * Q + i] - feq) / tau + Fi;
            }
        }
        for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {          // stream: every population walks one cell
            for (let i = 0; i < Q; i++) {
                const tx = (x + E[i][0] + nx) % nx;                            // periodic along the channel
                let ty = y + E[i][1];
                if (opts.periodicY) ty = (ty + ny) % ny;                       // doubly periodic: needed for shear-layer tests
                else if (ty < 0 || ty >= ny) continue;
                f[idx(tx, ty) * Q + i] = fp[idx(x, y) * Q + i];
            }
        }
        // v2835 -- FIXED INFLOW / OUTFLOW. Absent opts.inflow this block never runs and the solver is exactly the
        // periodic channel it always was.
        //
        // WHY IT EXISTS: a body-force-driven periodic channel cannot hold a steady Reynolds number while a body
        // sheds, because shedding modulates the drag, the drag sets the velocity, and the velocity sets the
        // shedding -- the three are coupled and Re breathes. v2834 traced the failure of the f_drag = 2 f_lift
        // measurement to exactly that. Pinning the velocity from OUTSIDE breaks the loop, which is why every
        // standard rig for this measurement uses a driven inlet.
        //
        // The inlet is Zou-He: the three populations that would have arrived from upstream are unknown after
        // streaming, and are reconstructed from the imposed velocity rather than guessed. The outlet is a
        // zero-gradient copy -- crude, but it lets a vortex leave without reflecting it back up the channel,
        // which a naive wall would do and would poison the very signal being measured.
        if (opts.inflow) {
            const uOf = typeof opts.inflow === "function" ? opts.inflow
                      : typeof opts.inflow.u === "function" ? opts.inflow.u
                      : () => (typeof opts.inflow === "number" ? opts.inflow : opts.inflow.u || 0);
            for (let y = 0; y < ny; y++) {
                const kIn = idx(0, y);
                if (!solid[kIn]) {
                    const uin = uOf(y), vin = 0;
                    const b = kIn * Q;
                    // known after streaming at a west boundary: 0,2,3,4,6,7 -- unknown: 1,5,8 (the +x movers)
                    const f0 = f[b + 0], f2 = f[b + 2], f3 = f[b + 3], f4 = f[b + 4], f6 = f[b + 6], f7 = f[b + 7];
                    const r = (f0 + f2 + f4 + 2 * (f3 + f6 + f7)) / (1 - uin);
                    f[b + 1] = f3 + (2 / 3) * r * uin;
                    f[b + 5] = f7 - 0.5 * (f2 - f4) + (1 / 6) * r * uin + 0.5 * r * vin;
                    f[b + 8] = f6 + 0.5 * (f2 - f4) + (1 / 6) * r * uin - 0.5 * r * vin;
                }
                // OUTLET: a Zou-He PRESSURE boundary holding rho = 1, which is the standard partner for a
                // velocity inlet. The first version copied the whole distribution from the neighbour column --
                // a zero-gradient outlet -- and that was WRONG in a way that only showed up where the stability
                // margin is thin: at tau=0.6 it behaved, but at tau=0.515 the mid-channel speed reached FOUR
                // TIMES the inlet velocity and the run blew up. Copying every population conserves nothing, so
                // the outlet quietly pumped the channel. Reconstructing only the three unknown (-x) movers from
                // a fixed density lets a vortex leave without inventing fluid behind it.
                const kOut = idx(nx - 1, y);
                if (!solid[kOut]) {
                    const b = kOut * Q;
                    const f0 = f[b + 0], f1 = f[b + 1], f2 = f[b + 2], f4 = f[b + 4], f5 = f[b + 5], f8 = f[b + 8];
                    const rOut = 1;
                    const uOut = -1 + (f0 + f2 + f4 + 2 * (f1 + f5 + f8)) / rOut;
                    f[b + 3] = f1 - (2 / 3) * rOut * uOut;
                    f[b + 7] = f5 + 0.5 * (f2 - f4) - (1 / 6) * rOut * uOut;
                    f[b + 6] = f8 - 0.5 * (f2 - f4) - (1 / 6) * rOut * uOut;
                }
            }
        }

        for (let k = 0; k < n; k++) if (!solid[k]) macro(k);
        return { rho, ux, uy };
    }
    function mass() { let m = 0; for (let k = 0; k < n; k++) if (!solid[k]) m += rho[k]; return m; }
    return { step, mass, get f() { return f; }, rho, ux, uy, solid, nx, ny, tau, idx,
        nu: viscosityOf(tau), force: [gx, gy], Q, E, W, OPP };
}
export { makeLBM, equilibrium, viscosityOf, tauFor, E, W, OPP, SPEC, CS2, Q };
