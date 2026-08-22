import type { AABB, Vec3 } from "./types.js";
export declare function aabbFromCenterRadius(center: Vec3, radius: number): AABB;
export declare function aabbFromPoints(points: readonly Vec3[]): AABB;
export declare function aabbCenter(b: AABB): Vec3;
export declare function aabbUnion(a: AABB, b: AABB): AABB;
//# sourceMappingURL=aabb.d.ts.map