// simulation/euler/euler2d.js -- compressible Euler. The solver for the flows the lattice is wrong for.
//
// WHY THIS EXISTS, in the engine's own measured numbers rather than on principle:
//   * SEDOV is a strong shock, Mach ten and upward. We measured our own lattice's Galilean error and wrote the rule
//     down: 0.40% at Mach 0.07, 2.51% at 0.12, 22.57% at 0.29 -- trust it below Mach 0.1. A blast is two orders of
//     magnitude past that, and D2Q9 has no energy, no temperature and no gamma to expand at anyway.
//   * SHARP-INTERFACE RT could not be had from the thermal lattice either, because Boussinesq DIFFUSES its interface
//     (thickness grows as sqrt(alpha*t)) and viscosity damps the short waves. That is not a bug in it; it is what the
//     method is.
// Euler answers both at once: a real gamma and a real energy equation make Sedov native, and it has no viscosity and
// no diffusivity AT ALL by construction, so an interface stays as sharp as the grid allows. This is what FLASH, Enzo
// and GIZMO actually are. The lattice keeps the low-Mach work it is verified excellent at; this takes the rest.
//
// Scheme: MUSCL-Hancock with minmod limiting and an HLLC Riemann solver, dimensionally split. Second order in smooth
// flow, non-oscillatory at shocks, and HLLC (unlike plain HLL) resolves the contact discontinuity -- which matters
// enormously for RT, where the contact IS the interface being measured.
"use strict";

const NV = 4;   // rho, rho*u, rho*v, E

function makeEuler(opts = {}) {
    const nx = opts.nx || 128, ny = opts.ny || 128, gamma = opts.gamma == null ? 1.4 : opts.gamma;
    const gx = (opts.gravity && opts.gravity[0]) || 0, gy = (opts.gravity && opts.gravity[1]) || 0;
    // Boundaries are PER DIRECTION, because real problems need mixed ones. Rayleigh-Taylor is the case in point: it
    // must be periodic across x but WALLED in y -- wrap y as well and the hydrostatic pressure profile jumps across
    // the seam and the whole base state is nonsense before the instability gets a word in.
    const bc = opts.bc || "outflow";                 // "outflow" | "periodic" | "reflect"
    const bcX = opts.bcX || bc, bcY = opts.bcY || bc;
    const order = opts.order == null ? 2 : opts.order;   // 2 = MUSCL-Hancock (default) | 1 = plain Godunov
    const G = 2;                                     // ghost cells each side
    const NXT = nx + 2 * G, NYT = ny + 2 * G;
    const U = new Float64Array(NXT * NYT * NV);
    const idx = (i, j) => ((j + G) * NXT + (i + G)) * NV;   // i,j are INTERIOR indices

    function prim(k, out) {
        const r = U[k], u = U[k + 1] / r, v = U[k + 2] / r;
        const p = (gamma - 1) * (U[k + 3] - 0.5 * r * (u * u + v * v));
        out[0] = r; out[1] = u; out[2] = v; out[3] = p > 1e-12 ? p : 1e-12;
        return out;
    }
    function setCell(i, j, r, u, v, p) {
        const k = idx(i, j);
        U[k] = r; U[k + 1] = r * u; U[k + 2] = r * v;
        U[k + 3] = p / (gamma - 1) + 0.5 * r * (u * u + v * v);
    }
    if (opts.init) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const s = opts.init(i, j) || {};
        setCell(i, j, s.rho == null ? 1 : s.rho, s.u || 0, s.v || 0, s.p == null ? 1 : s.p);
    }
    function ghosts() {
        for (let j = -G; j < ny + G; j++) for (let g = 1; g <= G; g++) {
            const src = bcX === "periodic" ? nx - g : 0, dst = -g;
            for (let c = 0; c < NV; c++) U[idx(dst, j) + c] = U[idx(src, j) + c];
            if (bcX === "reflect") U[idx(dst, j) + 1] = -U[idx(src, j) + 1];
            const src2 = bcX === "periodic" ? g - 1 : nx - 1, dst2 = nx - 1 + g;
            for (let c = 0; c < NV; c++) U[idx(dst2, j) + c] = U[idx(src2, j) + c];
            if (bcX === "reflect") U[idx(dst2, j) + 1] = -U[idx(src2, j) + 1];
        }
        for (let i = -G; i < nx + G; i++) for (let g = 1; g <= G; g++) {
            const src = bcY === "periodic" ? ny - g : 0, dst = -g;
            for (let c = 0; c < NV; c++) U[idx(i, dst) + c] = U[idx(i, src) + c];
            if (bcY === "reflect") U[idx(i, dst) + 2] = -U[idx(i, src) + 2];      // wall: flip normal momentum
            const src2 = bcY === "periodic" ? g - 1 : ny - 1, dst2 = ny - 1 + g;
            for (let c = 0; c < NV; c++) U[idx(i, dst2) + c] = U[idx(i, src2) + c];
            if (bcY === "reflect") U[idx(i, dst2) + 2] = -U[idx(i, src2) + 2];
        }
    }
    const minmod = (a, b) => (a * b <= 0) ? 0 : (Math.abs(a) < Math.abs(b) ? a : b);

    // HLLC: three waves, so the CONTACT survives. Plain HLL smears it, and for RT the contact is the interface.
    const _fl = new Float64Array(NV), _fr = new Float64Array(NV);
    function fluxHLLC(rL, uL, vL, pL, rR, uR, vR, pR, out) {
        const aL = Math.sqrt(gamma * pL / rL), aR = Math.sqrt(gamma * pR / rR);
        const EL = pL / (gamma - 1) + 0.5 * rL * (uL * uL + vL * vL);
        const ER = pR / (gamma - 1) + 0.5 * rR * (uR * uR + vR * vR);
        const SL = Math.min(uL - aL, uR - aR), SR = Math.max(uL + aL, uR + aR);
        _fl[0] = rL * uL; _fl[1] = rL * uL * uL + pL; _fl[2] = rL * uL * vL; _fl[3] = uL * (EL + pL);
        _fr[0] = rR * uR; _fr[1] = rR * uR * uR + pR; _fr[2] = rR * uR * vR; _fr[3] = uR * (ER + pR);
        if (SL >= 0) { for (let c = 0; c < NV; c++) out[c] = _fl[c]; return; }
        if (SR <= 0) { for (let c = 0; c < NV; c++) out[c] = _fr[c]; return; }
        const SM = (pR - pL + rL * uL * (SL - uL) - rR * uR * (SR - uR)) / (rL * (SL - uL) - rR * (SR - uR));
        if (SM >= 0) {
            const f = rL * (SL - uL) / (SL - SM), pS = pL + rL * (SL - uL) * (SM - uL);
            const uS = [f, f * SM, f * vL, f * (EL / rL + (SM - uL) * (SM + pL / (rL * (SL - uL))))];
            for (let c = 0; c < NV; c++) out[c] = _fl[c] + SL * (uS[c] - [rL, rL * uL, rL * vL, EL][c]);
        } else {
            const f = rR * (SR - uR) / (SR - SM);
            const uS = [f, f * SM, f * vR, f * (ER / rR + (SM - uR) * (SM + pR / (rR * (SR - uR))))];
            for (let c = 0; c < NV; c++) out[c] = _fr[c] + SR * (uS[c] - [rR, rR * uR, rR * vR, ER][c]);
        }
    }
    // one dimensionally-split sweep. dir 0 = x, dir 1 = y (velocities swapped in and back out).
    const scratch = new Float64Array(NXT * NYT * NV);
    const pC = new Float64Array(4), pM = new Float64Array(4), pP = new Float64Array(4), fx = new Float64Array(NV);
    function sweep(dt, dir) {
        ghosts();
        scratch.set(U);
        const N = dir === 0 ? nx : ny, M = dir === 0 ? ny : nx;
        const at = (a, b) => dir === 0 ? idx(a, b) : idx(b, a);
        const su = dir === 0 ? 1 : 2, sv = dir === 0 ? 2 : 1;      // which momentum is "normal" this sweep
        const face = new Float64Array((N + 1) * NV);
        for (let m = 0; m < M; m++) {
            for (let n = -1; n < N; n++) {
                // MUSCL reconstruction to the face between n and n+1, minmod-limited
                const kC = at(n, m), kP = at(n + 1, m), kM = at(n - 1, m), kPP = at(n + 2, m);
                prim(kC, pC); prim(kM, pM); prim(kP, pP);
                const L = [0, 0, 0, 0], R = [0, 0, 0, 0];
                const qC = [pC[0], pC[su === 1 ? 1 : 2], pC[sv === 1 ? 1 : 2], pC[3]];
                const qM = [pM[0], pM[su === 1 ? 1 : 2], pM[sv === 1 ? 1 : 2], pM[3]];
                const qP = [pP[0], pP[su === 1 ? 1 : 2], pP[sv === 1 ? 1 : 2], pP[3]];
                const pPP = prim(kPP, new Float64Array(4));
                const qPP = [pPP[0], pPP[su === 1 ? 1 : 2], pPP[sv === 1 ? 1 : 2], pPP[3]];
                for (let c = 0; c < 4; c++) {
                    // order 1 -- plain Godunov: the cell average IS the face value, no reconstruction at all. Smears a
                    // contact badly, but gets the jump conditions exactly right, because those come from the flux and
                    // not from the reconstruction. It exists so the GPU kernel, which is deliberately first order, can
                    // be compared against this like for like rather than against a scheme it is not running.
                    if (order === 1) { L[c] = qC[c]; R[c] = qP[c]; continue; }
                    L[c] = qC[c] + 0.5 * minmod(qC[c] - qM[c], qP[c] - qC[c]);
                    R[c] = qP[c] - 0.5 * minmod(qP[c] - qC[c], qPP[c] - qP[c]);
                }
                if (L[0] < 1e-10) L[0] = 1e-10; if (R[0] < 1e-10) R[0] = 1e-10;
                if (L[3] < 1e-10) L[3] = 1e-10; if (R[3] < 1e-10) R[3] = 1e-10;
                fluxHLLC(L[0], L[1], L[2], L[3], R[0], R[1], R[2], R[3], fx);
                const fo = (n + 1) * NV;
                face[fo] = fx[0]; face[fo + 1] = fx[1]; face[fo + 2] = fx[2]; face[fo + 3] = fx[3];
            }
            for (let n = 0; n < N; n++) {
                const k = at(n, m), fL = n * NV, fR = (n + 1) * NV;
                scratch[k]      = U[k]      - dt * (face[fR]     - face[fL]);
                scratch[k + su] = U[k + su] - dt * (face[fR + 1] - face[fL + 1]);
                scratch[k + sv] = U[k + sv] - dt * (face[fR + 2] - face[fL + 2]);
                scratch[k + 3]  = U[k + 3]  - dt * (face[fR + 3] - face[fL + 3]);
            }
        }
        U.set(scratch);
    }
    function gravityKick(dt) {
        if (!gx && !gy) return;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const k = idx(i, j), r = U[k];
            const u = U[k + 1] / r, v = U[k + 2] / r;
            U[k + 1] += r * gx * dt; U[k + 2] += r * gy * dt;
            U[k + 3] += r * (gx * u + gy * v) * dt + 0.5 * r * (gx * gx + gy * gy) * dt * dt;
        }
    }
    // Strang splitting: x, y, y, x keeps it second order in time across the sweeps
    let flip = false;
    function step(dt) {
        gravityKick(dt * 0.5);
        if (flip) { sweep(dt, 1); sweep(dt, 0); } else { sweep(dt, 0); sweep(dt, 1); }
        flip = !flip;
        gravityKick(dt * 0.5);
    }
    function maxSpeed() {
        let s = 0; const p = new Float64Array(4);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            prim(idx(i, j), p);
            const a = Math.sqrt(gamma * p[3] / p[0]);
            s = Math.max(s, Math.abs(p[1]) + a, Math.abs(p[2]) + a);
        }
        return s;
    }
    function cflDt(cfl) { return (cfl == null ? 0.4 : cfl) / Math.max(1e-12, maxSpeed()); }
    function totals() {
        let mass = 0, energy = 0;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = idx(i, j); mass += U[k]; energy += U[k + 3]; }
        return { mass, energy };
    }
    const get = (i, j) => prim(idx(i, j), new Float64Array(4));
    return { step, cflDt, maxSpeed, totals, get, setCell, U, nx, ny, gamma, idx, prim };
}
export { makeEuler };
