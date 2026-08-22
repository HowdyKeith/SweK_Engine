// WebGLEngine/physics/mpm/constitutive3.mjs -- v3841 (the 2D constitutive lifted to 3x3)
//
// The 3D transfer (v3804) proved the identities lift. This is the next mechanical lift: the Neo-Hookean stress and
// the F update in 3x3 instead of 2x2. 3x3 matrices are row-major flat [xx xy xz; yx yy yz; zx zy zz], matching
// transfer3d's APIC C. The one thing that is not just "more indices" is the inverse-transpose F^-T -- a 2x2 is
// four lines, a 3x3 is the cofactor matrix over the determinant -- so it is written out rather than hidden behind
// a solver, exactly as the 2D version argued. PURE. Gated with step3d in physics/mpm/step3d-selfcheck.mjs.

export const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function det3(F) {
    return F[0] * (F[4] * F[8] - F[5] * F[7]) - F[1] * (F[3] * F[8] - F[5] * F[6]) + F[2] * (F[3] * F[7] - F[4] * F[6]);
}

export function mul3(A, B) {
    return [
        A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7], A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
        A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7], A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
        A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7], A[6] * B[2] + A[7] * B[5] + A[8] * B[8],
    ];
}

export const transpose3 = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];

// F^-T = cofactor(F) / det(F). (F^-1 = adj/det = cofactorᵀ/det, so F^-T = cofactor/det.)
export function invTranspose3(F, J) {
    const j = J === undefined ? det3(F) : J;
    return [
        (F[4] * F[8] - F[5] * F[7]) / j, -(F[3] * F[8] - F[5] * F[6]) / j, (F[3] * F[7] - F[4] * F[6]) / j,
        -(F[1] * F[8] - F[2] * F[7]) / j, (F[0] * F[8] - F[2] * F[6]) / j, -(F[0] * F[7] - F[1] * F[6]) / j,
        (F[1] * F[5] - F[2] * F[4]) / j, -(F[0] * F[5] - F[2] * F[3]) / j, (F[0] * F[4] - F[1] * F[3]) / j,
    ];
}

// First Piola-Kirchhoff stress of the Neo-Hookean model in 3D: P = mu(F - F^-T) + lambda ln(J) F^-T. An inverted
// particle (J <= 0) has no stress and SAYS SO with NaN rather than clamping -- exactly the 2D contract.
export function firstPiola3(F, { mu, lambda }) {
    const J = det3(F);
    if (!(J > 0)) return { P: new Array(9).fill(NaN), J };
    const Fit = invTranspose3(F, J), lnJ = Math.log(J), P = new Array(9);
    for (let i = 0; i < 9; i++) P[i] = mu * (F[i] - Fit[i]) + lambda * lnJ * Fit[i];
    return { P, J };
}

// Cauchy stress sigma = (1/J) P Fᵀ -- SYMMETRIC for this model, which is angular-momentum balance in 3D. Used by
// the gate to check sigma_ij == sigma_ji on all three off-diagonal pairs.
export function cauchy3(F, params) {
    const { P, J } = firstPiola3(F, params);
    if (!(J > 0)) return { sigma: new Array(9).fill(NaN), J };
    const M = mul3(P, transpose3(F));
    return { sigma: M.map((v) => v / J), J };
}

// Advance the deformation gradient one step: F <- (I + dt C) F, with C the APIC affine matrix.
export function advanceF3(F, C, dt) {
    const M = [1 + dt * C[0], dt * C[1], dt * C[2], dt * C[3], 1 + dt * C[4], dt * C[5], dt * C[6], dt * C[7], 1 + dt * C[8]];
    return mul3(M, F);
}
