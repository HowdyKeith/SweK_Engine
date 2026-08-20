import type { Vec3 } from "./types.js";
/** Row-major 4x4 (16 entries). */
export type Mat4 = readonly number[];
export declare function mat4(...m: number[]): Mat4;
/** Symmetric 4×4 from its upper triangle (row-major fill of the mirror). */
export declare function symmetric4(m00: number, m01: number, m02: number, m03: number, m11: number, m12: number, m13: number, m22: number, m23: number, m33: number): Mat4;
export declare function get4(m: Mat4, r: number, c: number): number;
export declare function transpose4(m: Mat4): Mat4;
export declare function mulM4(a: Mat4, b: Mat4): Mat4;
/** M · (v, w) as a homogeneous 4-vector. */
export declare function mulVec4(m: Mat4, x: number, y: number, z: number, w: number): [number, number, number, number];
/** Gradient direction (∇ of Pᵀ Q P = 2 Q P) at a point on a quadric — the surface normal. */
export declare function quadricNormal(q: Mat4, p: Vec3): Vec3;
export declare function det4(m: Mat4): number;
/**
 * Adjugate (transpose of the cofactor matrix). adj(Q) is the dual quadric; for
 * an invertible Q it is det(Q)·Q⁻¹. Symmetric when Q is symmetric.
 */
export declare function adjugate4(m: Mat4): Mat4;
//# sourceMappingURL=mat4.d.ts.map