// WebGLEngine/physics/md/bonds.js — v2642
//
// Bonded forces -- the layer that turns a gas of Lennard-Jones atoms into a MOLECULE. A harmonic bond is a spring
// between two atoms: V = 1/2 k (r - r0)^2, pulling them back to the rest length r0. With bonds, a diatomic stays a
// diatomic and a chain stays a chain, instead of the atoms drifting apart under van der Waals alone.
//
// Unlike the LJ core, a bond needs the actual distance r, so there is a sqrt here. sqrt is IEEE-754 correctly
// rounded -- deterministic across architectures -- so the bonded force is still bit-identical everywhere; it is only
// the transcendentals (sin/cos/exp/log/pow) that break cross-arch determinism, and there are none.
//
// A diatomic bond oscillates at omega = sqrt(k / mu), mu = m1 m2 / (m1 + m2). That analytic frequency is the gate's
// centrepiece: the simulated molecule must vibrate at exactly the rate theory predicts.

// Harmonic bond forces. bonds = [{ i, j, k, r0 }]. Returns { forces: Float64Array(3N), pe }.
export function bondForces(pos, N, bonds) {
    const forces = new Float64Array(3 * N);
    let pe = 0;
    for (const b of bonds) {
        const i = b.i, j = b.j;
        const dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        const r = Math.sqrt(r2);               // IEEE-exact; the only non-multiply op, still deterministic
        const dr = r - b.r0;
        pe += 0.5 * b.k * dr * dr;
        const f = (-b.k * dr) / r;             // force coefficient: F_on_i = f * (pos_i - pos_j)
        forces[3 * i] += f * dx; forces[3 * i + 1] += f * dy; forces[3 * i + 2] += f * dz;
        forces[3 * j] -= f * dx; forces[3 * j + 1] -= f * dy; forces[3 * j + 2] -= f * dz;
    }
    return { forces, pe };
}

// Compose several force terms (e.g. LJ + bonds) into one forceFn(pos) -> { forces, pe } for the integrator.
export function combine(...fns) {
    return (pos) => {
        let forces = null, pe = 0;
        for (const fn of fns) {
            const c = fn(pos);
            if (!forces) forces = c.forces.slice();
            else for (let k = 0; k < forces.length; k++) forces[k] += c.forces[k];
            pe += c.pe;
        }
        return { forces, pe };
    };
}

// Reduced mass of a bonded pair -- the effective mass of its vibration.
export function reducedMass(m1, m2) { return (m1 * m2) / (m1 + m2); }
