// WebGLEngine/physics/md/md.js — v2641
//
// Molecular dynamics: point atoms moving under a pair potential. The engine already REPRESENTS molecules
// (molFormat/molGenerator: positions in Angstroms + element ids + van der Waals radii); this makes them MOVE.
//
// The pair potential is Lennard-Jones -- hard-core repulsion plus van der Waals attraction:
//     V(r) = 4e[ (s/r)^12 - (s/r)^6 ]
// The trick that keeps it deterministic: everything is a function of r^2 = dot(dr,dr), and (s/r)^6 = (s^2/r^2)^3,
// (s/r)^12 = (s^2/r^2)^6, so the force needs only multiply and divide -- NO sqrt, NO pow, NO transcendental. The
// force is therefore IEEE-exact and bit-identical across architectures, same discipline as strict-libm and the SAT
// narrow phase. Integration is velocity Verlet, which is symplectic (energy stays bounded, no secular drift) and
// exactly time-reversible.

// Coefficient k such that the LJ force on atom i from atom j is  k * (pos_i - pos_j).
// k = 24e (2 (s^2/r^2)^6 - (s^2/r^2)^3) / r^2.  k>0 repels (close), k<0 attracts (far), k=0 at the minimum.
export function ljCoeff(r2, eps, sig2) {
    const s2 = sig2 / r2;          // (sigma/r)^2
    const s6 = s2 * s2 * s2;       // (sigma/r)^6
    const s12 = s6 * s6;           // (sigma/r)^12
    return (24 * eps * (2 * s12 - s6)) / r2;
}

export function ljPotential(r2, eps, sig2) {
    const s2 = sig2 / r2;
    const s6 = s2 * s2 * s2;
    return 4 * eps * (s6 * s6 - s6);
}

// The separation r0 where the force is zero (the potential minimum), squared: r0^2 = 2^(1/3) * sigma^2.
// Hardcoded literal (not Math.cbrt) so NO transcendental appears anywhere in this file -- the grep guarantee is total.
export const LJ_RMIN2_OVER_SIG2 = 1.2599210498948732;   // 2^(1/3), used by callers/tests, never in the force path

// All-pairs forces with a squared cutoff. Uniform eps/sigma for the core (mixing rules are a caller concern).
// Returns { forces: Float64Array(3N), pe }. O(N^2); a neighbour grid can replace the inner loop for large N.
export function computeForces(pos, N, eps, sig2, cutoff2) {
    const forces = new Float64Array(3 * N);
    let pe = 0;
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2];
            const r2 = dx * dx + dy * dy + dz * dz;
            if (cutoff2 && r2 > cutoff2) continue;
            const k = ljCoeff(r2, eps, sig2);
            forces[3 * i] += k * dx; forces[3 * i + 1] += k * dy; forces[3 * i + 2] += k * dz;   // on i, along +dr
            forces[3 * j] -= k * dx; forces[3 * j + 1] -= k * dy; forces[3 * j + 2] -= k * dz;   // on j, equal & opposite
            pe += ljPotential(r2, eps, sig2);
        }
    }
    return { forces, pe };
}

export function kinetic(vel, masses) {
    let ke = 0;
    for (let i = 0; i < masses.length; i++) {
        const vx = vel[3 * i], vy = vel[3 * i + 1], vz = vel[3 * i + 2];
        ke += 0.5 * masses[i] * (vx * vx + vy * vy + vz * vz);
    }
    return ke;
}

// One velocity-Verlet step. state = { pos, vel, forces, masses, pe }. forceFn(pos) -> { forces, pe }.
// Symplectic and time-reversible: from (x, -v) it retraces the trajectory it came in on.
export function velocityVerlet(state, dt, forceFn) {
    const { pos, vel, forces, masses } = state;
    const N = masses.length;
    const half = 0.5 * dt;
    for (let i = 0; i < N; i++) {
        const invm = 1 / masses[i];
        for (let d = 0; d < 3; d++) {
            const k = 3 * i + d;
            const a = forces[k] * invm;
            pos[k] += (vel[k] + half * a) * dt;   // drift with a half-kick folded in
            vel[k] += half * a;                    // first half-kick
        }
    }
    const next = forceFn(pos);
    for (let i = 0; i < N; i++) {
        const invm = 1 / masses[i];
        for (let d = 0; d < 3; d++) {
            const k = 3 * i + d;
            vel[k] += half * next.forces[k] * invm;   // second half-kick with the new force
        }
    }
    state.forces = next.forces;
    state.pe = next.pe;
    return state;
}
