import type { AABB, Camera, Hit, Ray, Vec3 } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { ElementId, Feature, HatchMode, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
export interface PolygonStyle {
    hatchMode: HatchMode;
    hatchAngle: number;
}
export declare class Polygon implements FeatureSource {
    readonly vertices: readonly Vec3[];
    readonly normal: Vec3;
    readonly kind = "polygon";
    id: ElementId;
    autoNamed: boolean;
    private readonly style;
    private readonly frame;
    constructor(vertices: readonly Vec3[], id?: ElementId, style?: Partial<PolygonStyle>);
    bounds(): AABB;
    extractFeatures(_cam: Camera): Feature[];
    hatchRegions(cam: Camera, light: Light): HatchRegion[];
    /** Closed-form ray–plane hit, accepted only if inside the polygon. */
    raycast(ray: Ray): Hit[];
    projectedSilhouettes(cam: Camera): Curve2D[];
    /** Point-in-polygon in the face's own plane coordinates (2-D crossing test). */
    private containsPoint;
}
//# sourceMappingURL=polygon.d.ts.map