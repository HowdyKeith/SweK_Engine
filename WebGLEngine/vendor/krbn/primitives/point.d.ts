import type { AABB, Camera, Hit, Ray, Vec3 } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { ElementId, Feature, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
export type PointMark = "cross" | "plus" | "dot";
export interface PointOptions {
    /** mark glyph (default 'cross' = ×) */
    mark?: PointMark;
    /** mark size in px (default 7) */
    sizePx?: number;
}
export declare class Point implements FeatureSource {
    readonly position: Vec3;
    readonly kind = "point";
    id: ElementId;
    autoNamed: boolean;
    private readonly mark;
    private readonly sizePx;
    constructor(position: Vec3, opts?: PointOptions, id?: ElementId);
    bounds(): AABB;
    extractFeatures(cam: Camera): Feature[];
    hatchRegions(_cam: Camera, _light: Light): HatchRegion[];
    raycast(_ray: Ray): Hit[];
    projectedSilhouettes(_cam: Camera): Curve2D[];
    /** World units per screen pixel at the point's depth (ortho + perspective). */
    private worldPerPx;
}
//# sourceMappingURL=point.d.ts.map