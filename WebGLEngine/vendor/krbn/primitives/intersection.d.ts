import type { AABB, Vec3 } from "../math/types.js";
import type { Curve } from "../curve/types.js";
import type { Mat4 } from "../math/mat4.js";
import type { ElementId, Feature, HatchRegion, Light } from "../pipeline/types.js";
import type { Camera, Ray, Hit } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
export interface Section {
    curve: Curve;
    bounds: AABB;
}
/** A curve (or curves) where two surfaces meet, as a `FeatureSource`. A 1-D curve
 *  does not occlude, so raycast / silhouettes are empty (like a Line). A quartic
 *  intersection may have more than one loop, hence a list of sections. */
export declare class IntersectionCurve implements FeatureSource {
    readonly id: ElementId;
    private readonly sections;
    constructor(sections: Section | Section[] | null, id: ElementId);
    bounds(): AABB;
    extractFeatures(_cam: Camera): Feature[];
    hatchRegions(_cam: Camera, _light: Light): HatchRegion[];
    raycast(_ray: Ray): Hit[];
    projectedSilhouettes(_cam: Camera): Curve2D[];
}
/** quadric ∩ plane → conic section (null if the plane misses the surface). */
export declare function intersectQuadricPlane(Q: Mat4, planePoint: Vec3, planeNormal: Vec3): Section | null;
/**
 * quadric ∩ quadric, general. Uses the radical-plane shortcut when the quadratic
 * parts match (sphere ∩ sphere and equal-shape quadrics → an exact conic), and
 * otherwise traces the quartic (`intersectQuadricQuadric`). Returns 0, 1, or 2
 * section curves.
 */
export declare function intersectQuadrics(Q1: Mat4, Q2: Mat4, b1: AABB, b2: AABB): Section[];
/**
 * quadric ∩ quadric → the quartic space curve, as sampled polyline(s). No exact
 * low-degree carrier exists for a quartic, so it is traced: sweep cutting planes;
 * in each plane both quadrics section to conics whose *exact* intersections
 * (conic∩conic kernel) are points on the quartic. Points are then chained into
 * one or more polyline loops (docs/DESIGN.md §2.5).
 */
export declare function intersectQuadricQuadric(Q1: Mat4, Q2: Mat4, b1: AABB, b2: AABB): Section[];
/** plane ∩ plane → a line, clipped to ±`extent` about the closest point. */
export declare function intersectPlanes(pA: Vec3, nA: Vec3, pB: Vec3, nB: Vec3, extent: number): Section | null;
//# sourceMappingURL=intersection.d.ts.map