// physics/mpm/constitutive.mjs -- v3791
//
// *** THE THIRD OF MPM'S FOUR PIECES: THE CONSTITUTIVE MODEL -- the part that makes material RESIST
// deformation. v3789 built the transfer and v3790 the grid step, and both were honest that a block would
// simply fall because NOTHING PRODUCED STRESS. This is that missing half. Still no plasticity, so this
// material is perfectly elastic: squeeze it and it springs back for ever. ***
//
// *** THE KEYS ARE ANALYTIC STRESSES FOR DEFORMATIONS WHOSE ANSWER IS KNOWN IN CLOSED FORM, WHICH IS RARER
// THAN IT SOUNDS -- most constitutive checks are "does it look springy".
//   1. UNDEFORMED MEANS UNSTRESSED. F = I gives EXACTLY zero stress, to round-off. Not a tolerance: a model
//      that puts stress in undisturbed material is broken, and this is the cheapest test that finds it.
//   2. PURE DILATION HAS A CLOSED FORM. For neo-Hookean with F = s*I in 2D, J = s^2 and the Cauchy stress is
//      isotropic with sigma = (mu/J)(s^2 - 1) + (lambda/J) J ln J, so the SHEAR components are exactly zero
//      and the two normal components are exactly EQUAL. Both are verdicts.
//   3. THE CAUCHY STRESS IS SYMMETRIC. sigma_xy == sigma_yx exactly, which is ANGULAR MOMENTUM BALANCE
//      expressed pointwise -- and it is destroyed by writing P*F instead of P*F^T, BUT ONLY ON A DEFORMATION
//      THAT IS NEITHER DIAGONAL NOR PURE SHEAR. See cauchy()'s header: the two obvious fixtures are blind. ***

/** 2x2 matrices as flat [a, b, c, d] = [[a,b],[c,d]]. Small and explicit beats a matrix library here. */
export const I2 = [1, 0, 0, 1];
export const mul = (A, B) => [A[0]*B[0] + A[1]*B[2], A[0]*B[1] + A[1]*B[3],
                              A[2]*B[0] + A[3]*B[2], A[2]*B[1] + A[3]*B[3]];
export const transpose = (A) => [A[0], A[2], A[1], A[3]];
export const det = (A) => A[0] * A[3] - A[1] * A[2];
export const addScaled = (A, B, s) => [A[0] + s*B[0], A[1] + s*B[1], A[2] + s*B[2], A[3] + s*B[3]];

/** Lame parameters from Young's modulus and Poisson's ratio -- the form every textbook states. */
export function lame(E, nu) {
    return { mu: E / (2 * (1 + nu)), lambda: E * nu / ((1 + nu) * (1 - 2 * nu)) };
}

/**
 * FIRST PIOLA-KIRCHHOFF STRESS for the fixed-corotated / neo-Hookean family, 2D.
 *   P = mu (F - F^-T) + lambda ln(J) F^-T
 * This is the compressible neo-Hookean form; F^-T is written out rather than inverted generally, because a
 * 2x2 inverse is four lines and a general solver here would hide a singular J behind a library.
 */
export function firstPiola(F, { mu, lambda }) {
    const J = det(F);
    if (!(J > 0)) return { P: [NaN, NaN, NaN, NaN], J };   // inverted material has no stress: SAY SO, do not clamp
    // F^-T for a 2x2: inverse is (1/J)[d,-b;-c,a], so the transpose of that is (1/J)[d,-c;-b,a]
    const Fit = [F[3] / J, -F[2] / J, -F[1] / J, F[0] / J];
    const lnJ = Math.log(J);
    const P = [
        mu * (F[0] - Fit[0]) + lambda * lnJ * Fit[0],
        mu * (F[1] - Fit[1]) + lambda * lnJ * Fit[1],
        mu * (F[2] - Fit[2]) + lambda * lnJ * Fit[2],
        mu * (F[3] - Fit[3]) + lambda * lnJ * Fit[3],
    ];
    return { P, J };
}

/**
 * CAUCHY STRESS from the first Piola-Kirchhoff: sigma = (1/J) P F^T.
 *
 * *** `useF` EXISTS SO A PLANT CAN WRITE P*F INSTEAD OF P*F^T. That is not an arbitrary scramble -- it is the
 * slip the formula invites, because P and F are the same shape and the product is defined either way.
 *
 * *** AND WHICH FIXTURE YOU CHOOSE DECIDES WHETHER YOU CAN SEE IT AT ALL, WHICH IS THE FINDING OF THIS ROUND.
 * MEASURED at E=1000, nu=0.3:
 *   PURE STRETCH or DILATION -- THE PLANT IS COMPLETELY INVISIBLE, max |sigma difference| 0.0000. A diagonal F
 *     IS ITS OWN TRANSPOSE, so P*F and P*F^T are the SAME PRODUCT. *** DILATION IS THE STANDARD SANITY CHECK
 *     FOR A CONSTITUTIVE MODEL AND IT CANNOT SEE THIS BUG AT ALL. ***
 *   PURE SHEAR -- the stress changes by 15.3846 but SYMMETRY SURVIVES (asymmetry 0 in both arms): the plant
 *     merely SWAPS THE DIAGONAL, so a symmetry check passes while sigma_xx and sigma_yy are on the wrong axes.
 *   COMPOSED (a stretch then a shear) -- asymmetry 0 -> 72.6, and a general F gives 86.6.
 * SO SYMMETRY IS A REAL KEY AND IT NEEDS A DEFORMATION THAT IS NEITHER DIAGONAL NOR PURELY DEVIATORIC. ***
 */
export function cauchy(F, params, { useF = false } = {}) {
    const { P, J } = firstPiola(F, params);
    if (!Number.isFinite(J) || !(J > 0)) return { sigma: [NaN, NaN, NaN, NaN], J };
    const M = useF ? mul(P, F) : mul(P, transpose(F));
    return { sigma: [M[0] / J, M[1] / J, M[2] / J, M[3] / J], J };
}

/** Update the deformation gradient by the velocity gradient over dt: F <- (I + dt*C) F. */
export function advanceF(F, C, dt) {
    const A = [1 + dt * C[0], dt * C[1], dt * C[2], 1 + dt * C[3]];
    return mul(A, F);
}

/**
 * *** NEO-HOOKEAN STRAIN ENERGY DENSITY. Psi = mu/2 (I1 - 2) - mu ln J + lambda/2 (ln J)^2 in 2D.
 * ADDED AT v3797 BECAUSE ITS ABSENCE LOOKED LIKE A PHYSICS DEFECT. A collapsing ELASTIC column measured on
 * KE + PE alone appeared to CREATE 85% MORE ENERGY between samples -- 25.459 rising to 47.114 -- which reads
 * exactly like an unstable integrator. It is not: the column was STORING energy as strain on compression and
 * RELEASING it on rebound, and KE + PE cannot see the store. THE ENERGY WAS NEVER MISSING; THE ACCOUNTING WAS.
 * With plasticity ON the effect nearly vanishes (worst apparent rise 1.7e-3) because a yielding material does
 * not hold much strain -- WHICH IS WHY THE OMISSION COULD HAVE SHIPPED UNNOTICED ON THE DEFAULT FIXTURE. ***
 */
export function strainEnergy(F, { mu, lambda }) {
    const J = det(F);
    if (!(J > 0)) return NaN;                       // an inverted particle has no defined strain energy
    const I1 = F[0] * F[0] + F[1] * F[1] + F[2] * F[2] + F[3] * F[3];   // trace(F^T F)
    const lnJ = Math.log(J);
    return mu / 2 * (I1 - 2) - mu * lnJ + lambda / 2 * lnJ * lnJ;
}

/** Handy fixtures whose stress is known in closed form. */
export const deformations = {
    identity: () => I2.slice(),
    dilation: (s) => [s, 0, 0, s],
    shear: (g) => [1, g, 0, 1],
    stretchX: (s) => [s, 0, 0, 1],
};

// *** GUARDED, BECAUSE THIS MODULE IS LOADED BY A BROWSER AND `process` IS A NODE GLOBAL. *** Unguarded,
// this line threw ReferenceError at module scope, which kills the WHOLE import graph -- so mpm.html
// rendered its headings and then nothing at all. VERIFIED IN A REAL CHROMIUM at v3809, before and after.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const p = lame(1000, 0.3);
    const show = (name, F, opts) => {
        const { sigma, J } = cauchy(F, p, opts);
        console.log("[constitutive] " + name.padEnd(22) + " J " + J.toFixed(4) +
                    "  sigma [" + sigma.map((v) => v.toFixed(4)).join(", ") + "]" +
                    "  asym " + Math.abs(sigma[1] - sigma[2]).toExponential(2));
    };
    show("undeformed", deformations.identity());
    show("dilation 1.1", deformations.dilation(1.1));
    show("shear 0.2", deformations.shear(0.2));
    show("shear 0.2 (P*F plant)", deformations.shear(0.2), { useF: true });
}
