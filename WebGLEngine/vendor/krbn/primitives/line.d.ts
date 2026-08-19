import type { AABB, Camera, Hit, Ray, Vec3 } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { ElementId, Feature, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
export declare class Line implements FeatureSource {
    readonly a: Vec3;
    readonly b: Vec3;
    readonly kind = "line";
    id: ElementId;
    autoNamed: boolean;
    constructor(a: Vec3, b: Vec3, id?: ElementId);
    bounds(): AABB;
    extractFeatures(_cam: Camera): Feature[];
    hatchRegions(_cam: Camera, _light: Light): HatchRegion[];
    /** A 1-D segment has zero cross-section: nothing to hit, so it never occludes. */
    raycast(_ray: Ray): Hit[];
    projectedSilhouettes(_cam: Camera): Curve2D[];
}
//# sourceMappingURL=line.d.ts.map