// WebGLEngine/physics/md/coulomb.js — v2645
//
// Electrostatics -- the long-range force between charged atoms. The molecule format already carries a charge sign
// per atom; this turns those charges into forces. Coulomb's law: F = ke q_i q_j / r^2 along the line between the
// atoms, attractive for opposite charges and repulsive for like ones, and its potential V = ke q_i q_j / r.
//
// As a vector the force on i is ke q_i q_j / r^3 times (pos_i - pos_j), and r^3 = r^2 * sqrt(r^2). The one sqrt is
// IEEE-exact, so Coulomb stays deterministic across architectures. This is the direct O(N^2) sum with an optional
// cutoff; true long-range electrostatics in a periodic box needs Ewald, which is a later layer -- for a molecule or
// a cluster in open space the direct sum is exact.

// charges: Float64Array(N). ke: Coulomb constant (units-dependent; 1 in reduced units). Returns { forces, pe }.
export function coulombForces(pos, N, charges, ke, cutoff2) {
    const forces = new Float64Array(3 * N);
    let pe = 0;
    for (let i = 0; i < N; i++) {
        const qi = charges[i];
        if (qi === 0) continue;
        for (let j = i + 1; j < N; j++) {
            const qj = charges[j];
            if (qj === 0) continue;
            const dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2];
            const r2 = dx * dx + dy * dy + dz * dz;
            if (cutoff2 && r2 > cutoff2) continue;
            const r = Math.sqrt(r2);
            const invr = 1 / r;
            pe += ke * qi * qj * invr;                      // V = ke q_i q_j / r
            const f = (ke * qi * qj) * invr / r2;           // ke q_i q_j / r^3  = force coefficient
            forces[3 * i] += f * dx; forces[3 * i + 1] += f * dy; forces[3 * i + 2] += f * dz;
            forces[3 * j] -= f * dx; forces[3 * j + 1] -= f * dy; forces[3 * j + 2] -= f * dz;
        }
    }
    return { forces, pe };
}
