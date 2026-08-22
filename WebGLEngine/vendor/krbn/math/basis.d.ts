import type { Basis, Vec3 } from "./types.js";
/**
 * Build a right-handed orthonormal basis at `origin` whose z axis is `normal`.
 * The in-plane x/y axes are chosen deterministically (stable across frames, so
 * seeded wobble and arc parametrization stay coherent — docs/DESIGN.md §4).
 */
export declare function basisFromNormal(origin: Vec3, normal: Vec3): Basis;
/**
 * Build a basis with a preferred in-plane x direction (projected onto the plane
 * and re-orthonormalized). Falls back to a stable arbitrary axis if `preferX`
 * is parallel to the normal.
 */
export declare function basisFromNormalAndX(origin: Vec3, normal: Vec3, preferX: Vec3): Basis;
/** Local (u, v) plane coordinates → world point on the basis plane. */
export declare function planePoint(b: Basis, u: number, v: number): Vec3;
/** World point → local (u, v) coordinates in the basis plane (drops normal component). */
export declare function toPlaneCoords(b: Basis, p: Vec3): [number, number];
//# sourceMappingURL=basis.d.ts.map