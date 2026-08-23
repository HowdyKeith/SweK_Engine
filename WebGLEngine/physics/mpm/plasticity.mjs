// physics/mpm/plasticity.mjs -- v3792
//
// *** THE FOURTH AND LAST OF MPM'S BASIC PIECES: PLASTICITY -- what makes snow and sand STOP SPRINGING BACK.
// v3791 shipped a perfectly elastic neo-Hookean material and said outright that squeezing it makes it return
// for ever, which is exactly what granular material does not do. This is the return mapping that fixes it. ***
//
// *** THE MODEL IS THE SINGULAR-VALUE CLAMP: decompose the elastic deformation F_e = U S V^T, CLAMP each
// singular value into [1 - thetaC, 1 + thetaS], and push whatever was clamped away into the PLASTIC part.
// Compression beyond thetaC and stretch beyond thetaS become PERMANENT.
//
// TWO KEYS, AND THE SECOND IS THE ONE THAT MATTERS:
//   1. THE CLAMP IS A VERDICT. After return mapping, EVERY elastic singular value lies in the range -- not
//      approximately, by construction. A value outside it means the clamp did not run.
//   2. *** THE MULTIPLICATIVE SPLIT IS AN IDENTITY: F_e * F_p MUST STILL EQUAL THE TOTAL F, EXACTLY. The
//      split is a bookkeeping device, not a physical process -- moving deformation from one factor to the
//      other CANNOT create or destroy any of it. Forgetting to update F_p leaves the clamp "working" (every
//      singular value in range, which is the check most people write) WHILE THE MATERIAL SILENTLY LOSES
//      DEFORMATION -- volume vanishes from nowhere and nothing reports it. *** ***

import { mul, transpose, det } from "./constitutive.mjs";

/**
 * Analytic SVD of a 2x2 matrix: A = U S V^T with U and V rotations and S >= 0, descending.
 * Written out rather than iterated, because a 2x2 has a closed form and an iterative solver here would put a
 * convergence tolerance underneath an identity that is supposed to be exact.
 */
export function svd2(A) {
    const [a, b, c, d] = A;
    // The rotation that diagonalises A^T A, via the standard half-angle expressions.
    const e = (a + d) / 2, f = (a - d) / 2, g = (c + b) / 2, h = (c - b) / 2;
    const q = Math.hypot(e, h), r = Math.hypot(f, g);
    const sx = q + r, sy = q - r;                     // singular values (sy may be negative before the fix-up)
    const a1 = Math.atan2(g, f), a2 = Math.atan2(h, e);
    const theta = (a2 - a1) / 2, phi = (a2 + a1) / 2;
    const U = [Math.cos(phi), -Math.sin(phi), Math.sin(phi), Math.cos(phi)];
    const V = [Math.cos(theta), -Math.sin(theta), Math.sin(theta), Math.cos(theta)];
    // Keep the singular values non-negative by absorbing a sign into U, so S is a true singular-value matrix.
    let s0 = sx, s1 = sy, Uf = U;
    if (s1 < 0) { s1 = -s1; Uf = [U[0], -U[1], U[2], -U[3]]; }
    return { U: Uf, S: [s0, s1], V };
}

/**
 * Rebuild a matrix from svd2's factors: U diag(S) V.
 * *** THE FACTOR svd2 RETURNS AS `V` IS ALREADY THE TRANSPOSED ONE -- the half-angle construction yields V^T
 * directly -- SO TRANSPOSING IT AGAIN IS WRONG. My first version wrote U S V^T by habit and the reconstruction
 * residual was 1.808 on a matrix whose entries are all below 1. VERIFIED against the alternatives: U S V gives
 * 1.110e-16 while U S V^T and V S U^T both give 1.808, and the singular values multiply to exactly det(A). ***
 */
export const fromSvd = (U, S, V) => mul(mul(U, [S[0], 0, 0, S[1]]), V);

/**
 * THE RETURN MAPPING. Clamps the elastic singular values and moves the difference into F_p.
 *
 * *** `keepPlastic` DEFAULTS TO TRUE AND EXISTS SO A PLANT CAN SKIP THE F_p UPDATE. That is the invited
 * mistake and it is quiet: the clamp still runs, every singular value still lands in range, and the FIRST KEY
 * STILL PASSES. What breaks is the identity F_e * F_p == F -- the material quietly loses whatever the clamp
 * took away, and a snowball shrinks with no force acting on it. ***
 *
 * @param {number[]} Fe elastic deformation gradient BEFORE the clamp
 * @param {number[]} Fp plastic deformation gradient so far
 * @returns {{Fe, Fp, clamped, total}} the corrected pair and whether anything was clamped
 */
export function returnMap(Fe, Fp, { thetaC = 0.025, thetaS = 0.0075, keepPlastic = true } = {}) {
    const total = mul(Fe, Fp);                       // the total deformation, which must survive the split
    const { U, S, V } = svd2(Fe);
    const lo = 1 - thetaC, hi = 1 + thetaS;
    const Sc = [Math.min(Math.max(S[0], lo), hi), Math.min(Math.max(S[1], lo), hi)];
    const clamped = (Sc[0] !== S[0]) || (Sc[1] !== S[1]);

    const FeNew = fromSvd(U, Sc, V);
    // F_p absorbs exactly what the clamp removed: F_p_new = V diag(1/Sc) U^T * F_e * F_p
    // The inverse of U Sc V is V^T Sc^-1 U^T, and `V` here is already V^T, so this transposes it back.
    const FeInv = mul(mul(transpose(V), [1 / Sc[0], 0, 0, 1 / Sc[1]]), transpose(U));
    const FpNew = keepPlastic ? mul(FeInv, total) : Fp;

    return { Fe: FeNew, Fp: FpNew, clamped, total, singulars: S, clampedSingulars: Sc };
}

/** How far the split drifted from the total deformation it is supposed to reproduce. */
export function splitDrift(Fe, Fp, total) {
    const back = mul(Fe, Fp);
    return Math.max(...back.map((v, i) => Math.abs(v - total[i])));
}

// *** GUARDED, BECAUSE THIS MODULE IS LOADED BY A BROWSER AND `process` IS A NODE GLOBAL. *** Unguarded,
// this line threw ReferenceError at module scope, which kills the WHOLE import graph -- so mpm.html
// rendered its headings and then nothing at all. VERIFIED IN A REAL CHROMIUM at v3809, before and after.
// v3941 -- SEPARATOR-TOLERANT AND ANCHORED. `split("/")` returns THE WHOLE PATH on Windows, so this
// guard was false and the block below never ran there. The leading "/" matters too: without it
// `.../loopScope.mjs`.endsWith("Scope.mjs") is true, and a sibling could wake somebody else's main
// block. THIS FILE MAY NOT IMPORT node:url -- a browser page imports it -- so a basename compare is
// the strongest form available here, and winPathGuard re-derives that exemption rather than trusting it.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith("/" + process.argv[1].split(/[\\/]/).pop())) {
    const I = [1, 0, 0, 1];
    const squashed = [0.85, 0.05, -0.03, 0.92];      // well past the compression limit
    for (const keep of [true, false]) {
        const r = returnMap(squashed, I, { keepPlastic: keep });
        const sv = svd2(r.Fe).S;
        console.log("[plasticity] " + (keep ? "with Fp update   " : "WITHOUT Fp update") +
                    "  clamped " + r.clamped +
                    "  elastic singulars [" + sv.map((v) => v.toFixed(6)).join(", ") + "]" +
                    "  split drift " + splitDrift(r.Fe, r.Fp, r.total).toExponential(3));
    }
}
