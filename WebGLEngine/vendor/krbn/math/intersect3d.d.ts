import type { Ray, Vec3 } from "./types.js";
/** Parameter t where a ray meets a plane (origin + normal), or null if parallel. */
export declare function rayPlaneT(ray: Ray, planeOrigin: Vec3, planeNormal: Vec3): number | null;
/** Point where a ray meets a plane, or null if parallel. */
export declare function rayPlanePoint(ray: Ray, planeOrigin: Vec3, planeNormal: Vec3): Vec3 | null;
/**
 * Parameter u along segment/line a + u·(b−a) at the point of closest approach to
 * a ray. When the ray is the projection of an actual point on the line the two
 * meet and this is exact; `residual` is their distance (near 0 for a true hit).
 */
export declare function rayLineClosestU(ray: Ray, a: Vec3, b: Vec3): {
    u: number;
    residual: number;
} | null;
//# sourceMappingURL=intersect3d.d.ts.map