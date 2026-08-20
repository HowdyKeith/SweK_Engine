// WebGLEngine/physics/md/dihedrals.js — v2647
//
// The dihedral (torsion) term -- the 4-body angle around a bond, the last of the covalent force-field terms after
// bonds and angles. For atoms i-j-k-l it measures the twist between the plane i-j-k and the plane j-k-l, and it is
// what makes a chain resist rotating about the j-k bond (why a peptide backbone has preferred conformations).
//
// The standard proper-torsion potential is V = k (1 + cos(n phi - gamma)). That cos(n phi) looks like it needs a
// transcendental, which would break the engine's cross-arch determinism -- but cos(n phi) = T_n(cos phi), a
// Chebyshev polynomial, and sin(n phi) = sin(phi) U_{n-1}(cos phi). Both are built from cos phi and sin phi by a
// multiply-only recurrence, and cos phi, sin phi themselves come from dot and cross products of the bond vectors.
// So the whole torsion is arithmetic plus sqrt -- deterministic, no library trig.
//
// The forces use the Blondel-Karplus / GROMACS decomposition, in which the four atom forces sum to zero by
// construction. The gate verifies them against a finite difference of the potential, which catches any sign slip.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// cos(n phi) and sin(n phi) from c = cos phi, s = sin phi, via Chebyshev (T_n and U_{n-1}). Multiply-only.
function chebCosSin(c, s, n) {
    if (n <= 0) return [1, 0];
    if (n === 1) return [c, s];               // U_0 = 1
    let Tm1 = 1, Tm = c;                       // T_0, T_1
    let Um1 = 1, Um = 2 * c;                   // U_0, U_1
    for (let m = 2; m <= n; m++) {
        const Tn = 2 * c * Tm - Tm1; Tm1 = Tm; Tm = Tn;
        const Un = 2 * c * Um - Um1; Um1 = Um; Um = Un;
    }
    return [Tm, s * Um1];                      // cos(n phi) = T_n, sin(n phi) = s * U_{n-1}
}

// dihedrals = [{ i, j, k, l, kd, n, cosGamma?, sinGamma? }].
// V = kd (1 + cos(n phi - gamma)) = kd (1 + cos(n phi) cosGamma + sin(n phi) sinGamma).  gamma defaults to 0.
export function dihedralForces(pos, N, dihedrals) {
    const forces = new Float64Array(3 * N);
    let pe = 0;
    for (const d of dihedrals) {
        const i = d.i, j = d.j, k = d.k, l = d.l;
        // GROMACS conventions: b1 = ri - rj, b2 = rk - rj, b3 = rk - rl
        const b1 = [pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]];
        const b2 = [pos[3 * k] - pos[3 * j], pos[3 * k + 1] - pos[3 * j + 1], pos[3 * k + 2] - pos[3 * j + 2]];
        const b3 = [pos[3 * k] - pos[3 * l], pos[3 * k + 1] - pos[3 * l + 1], pos[3 * k + 2] - pos[3 * l + 2]];
        const n1 = cross(b1, b2), n2 = cross(b2, b3);
        const n1sq = dot(n1, n1), n2sq = dot(n2, n2);
        const b2len = Math.sqrt(dot(b2, b2));
        const denom = Math.sqrt(n1sq * n2sq);
        if (denom < 1e-12 || b2len < 1e-12) continue;            // collinear -> torsion undefined, skip
        const cphi = dot(n1, n2) / denom;
        const sphi = dot(cross(n1, n2), b2) / (denom * b2len);   // signed sin phi
        const cg = d.cosGamma == null ? 1 : d.cosGamma, sg = d.sinGamma == null ? 0 : d.sinGamma;
        const [cN, sN] = chebCosSin(cphi, sphi, d.n);
        pe += d.kd * (1 + cN * cg + sN * sg);
        // dV/dphi = -kd n ( sin(n phi) cosGamma - cos(n phi) sinGamma )
        const dVdphi = -d.kd * d.n * (sN * cg - cN * sg);

        const Fi = [-dVdphi * b2len / n1sq * n1[0], -dVdphi * b2len / n1sq * n1[1], -dVdphi * b2len / n1sq * n1[2]];
        const Fl = [dVdphi * b2len / n2sq * n2[0], dVdphi * b2len / n2sq * n2[1], dVdphi * b2len / n2sq * n2[2]];
        const p = dot(b1, b2) / (b2len * b2len), q = dot(b3, b2) / (b2len * b2len);
        const sv = [p * Fi[0] - q * Fl[0], p * Fi[1] - q * Fl[1], p * Fi[2] - q * Fl[2]];
        const Fj = [-Fi[0] + sv[0], -Fi[1] + sv[1], -Fi[2] + sv[2]];
        const Fk = [-Fl[0] - sv[0], -Fl[1] - sv[1], -Fl[2] - sv[2]];
        for (let c = 0; c < 3; c++) {
            forces[3 * i + c] += Fi[c]; forces[3 * j + c] += Fj[c];
            forces[3 * k + c] += Fk[c]; forces[3 * l + c] += Fl[c];
        }
    }
    return { forces, pe };
}
