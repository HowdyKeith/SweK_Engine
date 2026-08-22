// WebGLEngine/physics/md/angles.js — v2643
//
// The 3-body angle term -- what gives a molecule its shape in space rather than just a chain length. Three atoms
// i-j-k with j at the vertex have a preferred angle; the term pushes the angle back toward it. This is why water is
// bent at 104.5 degrees and not a straight line.
//
// A textbook harmonic angle uses the angle theta itself, which needs acos -- a transcendental that would break the
// engine's cross-arch determinism. So this uses the COSINE-harmonic form, V = 1/2 k (cos t - cos t0)^2, a legitimate
// angle potential whose minimum is still at t0 but which is built from dot products and magnitudes only: arithmetic
// and sqrt, both IEEE-exact. The angle term is therefore deterministic across architectures like the rest of MD.
//
// The force must not translate or spin the molecule: the three atom forces sum to zero (no net force) and produce no
// net torque. Both fall out of the gradient because cos t depends only on the relative geometry, and the gate checks
// them directly.

// angles = [{ i, j, k, kang, cos0 }] with j the vertex atom; cos0 = cos(theta0). Returns { forces, pe }.
export function angleForces(pos, N, angles) {
    const forces = new Float64Array(3 * N);
    let pe = 0;
    for (const ang of angles) {
        const i = ang.i, j = ang.j, k = ang.k;
        const ax = pos[3 * i] - pos[3 * j], ay = pos[3 * i + 1] - pos[3 * j + 1], az = pos[3 * i + 2] - pos[3 * j + 2];
        const bx = pos[3 * k] - pos[3 * j], by = pos[3 * k + 1] - pos[3 * j + 1], bz = pos[3 * k + 2] - pos[3 * j + 2];
        const la = Math.sqrt(ax * ax + ay * ay + az * az);
        const lb = Math.sqrt(bx * bx + by * by + bz * bz);
        const dotab = ax * bx + ay * by + az * bz;
        const cosT = dotab / (la * lb);
        const dV = ang.kang * (cosT - ang.cos0);      // dV/d(cosT)
        pe += 0.5 * ang.kang * (cosT - ang.cos0) * (cosT - ang.cos0);

        // unit vectors
        const iax = ax / la, iay = ay / la, iaz = az / la;
        const ibx = bx / lb, iby = by / lb, ibz = bz / lb;
        // grad_i cosT = (1/la)(bhat - cosT*ahat);  grad_k cosT = (1/lb)(ahat - cosT*bhat)
        const gix = (ibx - cosT * iax) / la, giy = (iby - cosT * iay) / la, giz = (ibz - cosT * iaz) / la;
        const gkx = (iax - cosT * ibx) / lb, gky = (iay - cosT * iby) / lb, gkz = (iaz - cosT * ibz) / lb;
        // F = -dV * grad ; grad_j = -(grad_i + grad_k)
        forces[3 * i] += -dV * gix; forces[3 * i + 1] += -dV * giy; forces[3 * i + 2] += -dV * giz;
        forces[3 * k] += -dV * gkx; forces[3 * k + 1] += -dV * gky; forces[3 * k + 2] += -dV * gkz;
        forces[3 * j] += dV * (gix + gkx); forces[3 * j + 1] += dV * (giy + gky); forces[3 * j + 2] += dV * (giz + gkz);
    }
    return { forces, pe };
}
