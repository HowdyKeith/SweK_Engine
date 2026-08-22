import type { Vec3 } from "./types.js";
/** Row-major 3x3: [ m00,m01,m02, m10,m11,m12, m20,m21,m22 ]. */
export type Mat3 = readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];
export declare const IDENTITY3: Mat3;
export declare function mat3(m00: number, m01: number, m02: number, m10: number, m11: number, m12: number, m20: number, m21: number, m22: number): Mat3;
/** Symmetric matrix from its upper triangle — the natural conic constructor. */
export declare function symmetric(m00: number, m01: number, m02: number, m11: number, m12: number, m22: number): Mat3;
export declare function get(m: Mat3, r: number, c: number): number;
/** Column r of the matrix. */
export declare function col(m: Mat3, c: number): Vec3;
/** Row r of the matrix. */
export declare function row(m: Mat3, r: number): Vec3;
export declare function addM(a: Mat3, b: Mat3): Mat3;
export declare function scaleM(a: Mat3, s: number): Mat3;
export declare function transpose(m: Mat3): Mat3;
export declare function mulM(a: Mat3, b: Mat3): Mat3;
/** M · v (v as a column vector). */
export declare function mulVec(m: Mat3, v: Vec3): Vec3;
/** Bilinear form aᵀ M b — the conic membership test when a = b = point. */
export declare function quadForm(m: Mat3, a: Vec3, b: Vec3): number;
export declare function det(m: Mat3): number;
/**
 * Adjugate (classical adjoint) = transpose of the cofactor matrix.
 * For a symmetric M the adjugate is symmetric too. Central to splitting a
 * degenerate conic: adj of a rank-2 line-pair conic is the (rank-1) matrix of
 * their intersection point.
 */
export declare function adjugate(m: Mat3): Mat3;
/** trace(a · b) without forming the full product — used in det(A + λB) expansion. */
export declare function traceMul(a: Mat3, b: Mat3): number;
/** Cross-product matrix [v]_× such that [v]_× w = v × w. Antisymmetric. */
export declare function skew(v: Vec3): Mat3;
export declare function frobeniusNorm(m: Mat3): number;
//# sourceMappingURL=mat3.d.ts.map