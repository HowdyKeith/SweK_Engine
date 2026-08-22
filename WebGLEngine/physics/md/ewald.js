// WebGLEngine/physics/md/ewald.js — v2650
//
// Ewald summation -- electrostatics for a PERIODIC system, the last non-bonded term. A raw sum of q_i q_j / r over a
// periodic lattice does not converge (it is conditionally convergent, the 1/r tail fights the growing shell count).
// Ewald splits each 1/r into a short-range part screened by a Gaussian, which converges fast in real space, and the
// complement, which converges fast in reciprocal space:
//
//     E = E_real + E_recip + E_self
//     E_real  = 1/2 sum_{i,j,n}' q_i q_j erfc(alpha r) / r          (r = |r_ij + nL|, n' skips i=j at n=0)
//     E_recip = (2 pi / V) sum_{k!=0} exp(-k^2/4 alpha^2)/k^2 |S(k)|^2,  S(k) = sum_j q_j exp(i k.r_j)
//     E_self  = -(alpha/sqrt(pi)) sum_j q_j^2
//
// Every transcendental here is a DETERMINISTIC one: erfc and exp from strictExpErf, sin and cos from strictTrig. So
// the whole sum is bit-identical across architectures -- the reason strict-libm was built. The forces are the
// analytic gradient of the same three parts; the gate verifies them against a finite difference and validates the
// energy against the Madelung constant of rock salt.
import { strictExp, strictErfc } from "../../tools/strictExpErf.mjs";
import { strictSin, strictCos } from "../../tools/strictTrig.mjs";

const SQRT_PI = 1.7724538509055159;

// pos: Float64Array 3N (Cartesian, a cubic box of side L, charges may sit anywhere). q: length-N charges.
// opts: { alpha, kmax, rcut }. Returns { energy, forces, parts:{ eReal, eRecip, eSelf } }.
/**
 * *** v3852 -- `noSelf` DEFAULTS FALSE AND EXISTS SO A PLANT CAN SIT ON THE TERM THAT CARRIES NO FORCE. ***
 * E_self = -(alpha/sqrt(pi)) sum q^2 is a CONSTANT: it does not depend on any position, so it contributes
 * nothing to any gradient. Omitting it is the canonical Ewald mistake precisely because of that -- EVERY
 * FORCE TEST STILL PASSES, every trajectory is still right, and only the ENERGY is wrong. It is also the term
 * that makes the total independent of alpha, so dropping it turns a splitting parameter into a knob that
 * changes the answer. Every existing figure is unchanged at the default.
 */
export function ewald(pos, q, N, L, opts = {}) {
    const alpha = opts.alpha != null ? opts.alpha : 5 / L;
    const kmax = opts.kmax != null ? opts.kmax : 8;
    const rcut = opts.rcut != null ? opts.rcut : L;
    const rcut2 = rcut * rcut;
    const V = L * L * L;
    const forces = new Float64Array(3 * N);
    const twoA = 2 * alpha / SQRT_PI, a2 = alpha * alpha;

    // ---- real space, over explicit periodic images ----
    let eReal = 0;
    const nImg = Math.max(1, Math.ceil(rcut / L));
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const bx = pos[3 * i] - pos[3 * j], by = pos[3 * i + 1] - pos[3 * j + 1], bz = pos[3 * i + 2] - pos[3 * j + 2];
            const qq = q[i] * q[j];
            for (let nx = -nImg; nx <= nImg; nx++) for (let ny = -nImg; ny <= nImg; ny++) for (let nz = -nImg; nz <= nImg; nz++) {
                if (i === j && nx === 0 && ny === 0 && nz === 0) continue;
                const dx = bx + nx * L, dy = by + ny * L, dz = bz + nz * L;
                const r2 = dx * dx + dy * dy + dz * dz;
                if (r2 >= rcut2) continue;
                const r = Math.sqrt(r2), ec = strictErfc(alpha * r);
                eReal += 0.5 * qq * ec / r;                                  // 1/2: (i,j) and (j,i) both looped
                const fs = qq * (ec / r + twoA * strictExp(-a2 * r2)) / r2;  // full (not 1/2) -> force on i
                forces[3 * i] += fs * dx; forces[3 * i + 1] += fs * dy; forces[3 * i + 2] += fs * dz;
            }
        }
    }

    // ---- self energy (constant, no force) ----
    let sumq2 = 0; for (let i = 0; i < N; i++) sumq2 += q[i] * q[i];
    const eSelf = opts.noSelf ? 0 : -alpha / SQRT_PI * sumq2;   // v3852 -- the plant drops the constant

    // ---- reciprocal space ----
    let eRecip = 0;
    const twoPiL = 2 * Math.PI / L, four_a2 = 4 * a2, preE = 2 * Math.PI / V, preF = 4 * Math.PI / V;
    const cosA = new Float64Array(N), sinA = new Float64Array(N);
    for (let nx = -kmax; nx <= kmax; nx++) for (let ny = -kmax; ny <= kmax; ny++) for (let nz = -kmax; nz <= kmax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        if (nx * nx + ny * ny + nz * nz > kmax * kmax) continue;     // spherical shell in k-space
        const kx = twoPiL * nx, ky = twoPiL * ny, kz = twoPiL * nz, k2 = kx * kx + ky * ky + kz * kz;
        const Ak = strictExp(-k2 / four_a2) / k2;
        let sre = 0, sim = 0;
        for (let j = 0; j < N; j++) {
            const arg = kx * pos[3 * j] + ky * pos[3 * j + 1] + kz * pos[3 * j + 2];
            const c = strictCos(arg), s = strictSin(arg);
            cosA[j] = c; sinA[j] = s; sre += q[j] * c; sim += q[j] * s;
        }
        eRecip += Ak * (sre * sre + sim * sim);
        const common = preF * Ak;
        for (let i = 0; i < N; i++) {
            const g = common * q[i] * (sim * cosA[i] - sre * sinA[i]);   // F_i = -preF q_i Ak k [Im(S)cos - Re(S)sin]
            forces[3 * i] -= g * kx; forces[3 * i + 1] -= g * ky; forces[3 * i + 2] -= g * kz;
        }
    }
    eRecip *= preE;

    return { energy: eReal + eSelf + eRecip, forces, parts: { eReal, eRecip, eSelf } };
}
