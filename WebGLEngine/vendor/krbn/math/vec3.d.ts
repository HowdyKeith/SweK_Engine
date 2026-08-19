import type { Vec3 } from "./types.js";
export declare const vec3: (x: number, y: number, z: number) => Vec3;
export declare const ZERO3: Vec3;
export declare function add(a: Vec3, b: Vec3): Vec3;
export declare function sub(a: Vec3, b: Vec3): Vec3;
export declare function scale(a: Vec3, s: number): Vec3;
export declare function neg(a: Vec3): Vec3;
/** Fused a + s*b — common enough (ray marching, lerps) to name explicitly. */
export declare function addScaled(a: Vec3, b: Vec3, s: number): Vec3;
export declare function dot(a: Vec3, b: Vec3): number;
export declare function cross(a: Vec3, b: Vec3): Vec3;
export declare function length(a: Vec3): number;
export declare function lengthSq(a: Vec3): number;
export declare function distance(a: Vec3, b: Vec3): number;
/**
 * Normalize. Returns the zero vector unchanged (caller decides if that is a
 * degenerate input); we deliberately do not throw here so hot paths stay
 * branch-light — degeneracy is handled at the geometric layer with named
 * tolerances, not by scattering guards through the algebra.
 */
export declare function normalize(a: Vec3): Vec3;
export declare function lerp(a: Vec3, b: Vec3, t: number): Vec3;
/** Any unit vector orthogonal to `a` (a must be non-zero). Stable choice: cross
 *  with whichever world axis is least aligned, avoiding a near-zero cross. */
export declare function anyPerpendicular(a: Vec3): Vec3;
export declare function approxEqual(a: Vec3, b: Vec3, eps: number): boolean;
//# sourceMappingURL=vec3.d.ts.map