// simulation/lbm/thermal2d.js -- giving the fluid a temperature.
//
// The plain lattice carries one distribution: mass and momentum. It has no temperature, which is why Sedov-Taylor was
// refused last round. This adds a SECOND distribution, g, which carries internal energy the same way f carries
// momentum: it advects with the flow, it relaxes toward its own equilibrium, and its diffusivity falls out of its own
// relaxation time exactly as viscosity falls out of f's. The two are coupled by buoyancy -- hot fluid is lighter, so
// temperature pushes on momentum, and momentum carries temperature around. That loop is convection.
//
// BE PRECISE ABOUT WHAT THIS IS AND IS NOT. This is the Boussinesq model: density variation is ignored everywhere
// except in the buoyancy term. It buys temperature, convection, and buoyancy-driven instability -- Rayleigh-Benard and
// Rayleigh-Taylor. It does NOT buy compressible thermodynamics: there is still no gamma and no pressure work, so
// SEDOV-TAYLOR IS STILL OUT OF REACH and is still not claimed. A blast needs a fully compressible thermal lattice
// (D2Q37 or a coupled compressible scheme), which is a bigger step than this one.
//
// The test this earns is worth as much as the channel was. Rayleigh-Benard convection has an exact critical number:
// heat a layer of fluid from below and NOTHING happens -- the heat just conducts through -- until the Rayleigh number
// crosses 1708, and then the fluid spontaneously organises into rolls. Nobody tells the solver about 1708. If the
// temperature and the buoyancy are real, that number has to emerge on its own.
//
// The constants come from lbm2d.js rather than being retyped, so the thermal lattice and the verified isothermal one
// can never drift apart.
"use strict";
import { E, W, OPP, SPEC, CS2, Q, equilibrium } from "./lbm2d.js";

const diffusivityOf = (tauG) => CS2 * (tauG - 0.5);       // exactly the shape of viscosityOf -- same physics, other field
// same story here: derive from the shared CS2 rather than retyping the numbers, so the thermal lattice and the
// isothermal one can never disagree about what the speed of sound is
const _T1 = 1 / CS2, _T2 = 1 / (2 * CS2 * CS2), _T3 = 1 / (2 * CS2);
function thermalEq(i, T, ux, uy) {
    const eu = E[i][0] * ux + E[i][1] * uy, u2 = ux * ux + uy * uy;
    return W[i] * T * (1 + _T1 * eu + _T2 * eu * eu - _T3 * u2);   // T rides the flow
}

function makeThermal(opts = {}) {
    const nx = opts.nx || 64, ny = opts.ny || 32;
    const tau = opts.tau == null ? 0.8 : opts.tau;         // momentum relaxation -> viscosity
    const tauG = opts.tauG == null ? 0.8 : opts.tauG;      // energy relaxation -> thermal diffusivity
    const gravity = opts.gravity == null ? 0 : opts.gravity;
    const beta = opts.beta == null ? 0 : opts.beta;        // thermal expansion
    const Thot = opts.Thot == null ? 0.5 : opts.Thot, Tcold = opts.Tcold == null ? -0.5 : opts.Tcold;
    const n = nx * ny;
    const f = new Float64Array(n * Q), fp = new Float64Array(n * Q);
    const g = new Float64Array(n * Q), gp = new Float64Array(n * Q);
    const solid = new Uint8Array(n), rho = new Float64Array(n), ux = new Float64Array(n), uy = new Float64Array(n), T = new Float64Array(n);
    const idx = (x, y) => y * nx + x;
    // Walls by default (hot floor, cold ceiling). Optional doubly-periodic box: a pure-diffusion measurement needs no
    // walls, because walls held at a temperature drain heat vertically and quietly inflate the number being measured.
    if (opts.walls !== false) for (let x = 0; x < nx; x++) { solid[idx(x, 0)] = 1; solid[idx(x, ny - 1)] = 1; }
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const k = idx(x, y), s0 = opts.init ? opts.init(x, y) : null;
        rho[k] = 1; ux[k] = (s0 && s0.ux) || 0; uy[k] = (s0 && s0.uy) || 0; T[k] = (s0 && s0.T != null) ? s0.T : 0;
        for (let i = 0; i < Q; i++) { f[k * Q + i] = equilibrium(i, rho[k], ux[k], uy[k]); g[k * Q + i] = thermalEq(i, T[k], ux[k], uy[k]); }
    }
    const cf = 1 - 1 / (2 * tau);
    function step() {
        for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            const k = idx(x, y), b = k * Q;
            if (solid[k]) {
                const Tw = y === 0 ? Thot : Tcold;
                const R = opts.slip ? SPEC : OPP;                           // free-slip, or no-slip
                for (let i = 0; i < Q; i++) {
                    fp[b + i] = f[b + R[i]];
                    // A wall either HOLDS a temperature (anti-bounce-back, Dirichlet -- what Rayleigh-Benard needs) or
                    // it lets none through at all (bounce-back, zero flux -- adiabatic). Rayleigh-Taylor needs the
                    // second: an initial-value problem where the walls must not feed the instability they are watching.
                    gp[b + i] = opts.adiabatic ? g[b + OPP[i]] : (-g[b + OPP[i]] + 2 * W[i] * Tw);
                }
                continue;
            }
            let r = 0, mx = 0, my = 0, t = 0;
            for (let i = 0; i < Q; i++) { const fi = f[b + i]; r += fi; mx += fi * E[i][0]; my += fi * E[i][1]; t += g[b + i]; }
            T[k] = t;
            // BUOYANCY: the whole coupling, in one line. Hot fluid is lighter, so it is pushed up.
            const ay = gravity * beta * t;
            rho[k] = r;
            const vx = r > 0 ? mx / r : 0, vy = r > 0 ? my / r + ay * 0.5 : 0;   // half-force correction, as always
            ux[k] = vx; uy[k] = vy;
            for (let i = 0; i < Q; i++) {
                const eu = E[i][0] * vx + E[i][1] * vy;
                const Fi = W[i] * cf * r * (3 * (E[i][1] - vy) * ay + 9 * eu * E[i][1] * ay);   // Guo, vertical only
                fp[b + i] = f[b + i] - (f[b + i] - equilibrium(i, r, vx, vy)) / tau + Fi;
                gp[b + i] = g[b + i] - (g[b + i] - thermalEq(i, t, vx, vy)) / tauG;
            }
        }
        for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            for (let i = 0; i < Q; i++) {
                const tx = (x + E[i][0] + nx) % nx;
                let ty = y + E[i][1];
                if (opts.periodicY) ty = (ty + ny) % ny;
                else if (ty < 0 || ty >= ny) continue;
                f[idx(tx, ty) * Q + i] = fp[idx(x, y) * Q + i];
                g[idx(tx, ty) * Q + i] = gp[idx(x, y) * Q + i];
            }
        }
        for (let k = 0; k < n; k++) if (!solid[k]) { let t = 0; for (let i = 0; i < Q; i++) t += g[k * Q + i]; T[k] = t; }
        return { rho, ux, uy, T };
    }
    // Rayleigh number: the ratio of buoyant driving to the two things that damp it. H is the fluid depth.
    const H = ny - 2, nu = CS2 * (tau - 0.5), alpha = diffusivityOf(tauG);
    const Ra = Math.abs(gravity * beta * (Thot - Tcold) * H * H * H / (nu * alpha));
    function kinetic() { let e = 0; for (let k = 0; k < n; k++) if (!solid[k]) e += ux[k] * ux[k] + uy[k] * uy[k]; return Math.sqrt(e / n); }
    return { step, kinetic, rho, ux, uy, T, solid, nx, ny, idx, tau, tauG, nu, alpha, Ra, H, Thot, Tcold };
}
export { makeThermal, thermalEq, diffusivityOf };
