// WebGLEngine/physics/md/improper.js — v2648
//
// Improper terms -- what keep a group PLANAR or fix its CHIRALITY. A proper dihedral controls rotation about a bond;
// an improper instead holds four atoms in a fixed out-of-plane arrangement, so an sp2 carbon stays flat and a chiral
// centre keeps its handedness instead of inverting.
//
// The clean, deterministic form is a signed-volume restraint. The scalar triple product of three edges from atom l,
//     V6 = (r_i - r_l) . ( (r_j - r_l) x (r_k - r_l) )
// is six times the signed volume of the tetrahedron i-j-k-l. It is ZERO exactly when the four atoms are coplanar,
// and its sign is the chirality. A harmonic restraint 1/2 k (V6 - V0)^2 pulls the group to a target volume: V0 = 0
// for planarity, or a nonzero V0 for a fixed chirality. The gradient of a triple product is just another cross
// product, so the force is dot and cross products only -- no sqrt, no transcendental, fully deterministic.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// impropers = [{ i, j, k, l, kimp, v0 }].  v0 defaults to 0 (planarity). Returns { forces, pe }.
export function improperForces(pos, N, impropers) {
    const forces = new Float64Array(3 * N);
    let pe = 0;
    for (const im of impropers) {
        const i = im.i, j = im.j, k = im.k, l = im.l;
        const a = [pos[3 * i] - pos[3 * l], pos[3 * i + 1] - pos[3 * l + 1], pos[3 * i + 2] - pos[3 * l + 2]];
        const b = [pos[3 * j] - pos[3 * l], pos[3 * j + 1] - pos[3 * l + 1], pos[3 * j + 2] - pos[3 * l + 2]];
        const c = [pos[3 * k] - pos[3 * l], pos[3 * k + 1] - pos[3 * l + 1], pos[3 * k + 2] - pos[3 * l + 2]];
        const bxc = cross(b, c);
        const V6 = dot(a, bxc);                          // 6 * signed tetra volume
        const v0 = im.v0 || 0;
        const diff = V6 - v0;
        pe += 0.5 * im.kimp * diff * diff;
        const g = -im.kimp * diff;                       // F_x = g * dV6/dx
        // gradients of the triple product (each is a cross product of the other two edges)
        const gi = bxc;                                  // dV6/dr_i = b x c
        const gj = cross(c, a);                          // dV6/dr_j = c x a
        const gk = cross(a, b);                          // dV6/dr_k = a x b
        for (let d = 0; d < 3; d++) {
            const fi = g * gi[d], fj = g * gj[d], fk = g * gk[d];
            forces[3 * i + d] += fi; forces[3 * j + d] += fj; forces[3 * k + d] += fk;
            forces[3 * l + d] += -(fi + fj + fk);        // dV6/dr_l = -(dr_i + dr_j + dr_k), momentum-safe
        }
    }
    return { forces, pe };
}
