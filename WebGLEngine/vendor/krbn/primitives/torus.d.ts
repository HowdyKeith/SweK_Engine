import type { AABB, Camera, Hit, Ray, Vec3 } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { ElementId, Feature, HatchFamily, HatchFieldOptions, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
export declare class Torus implements FeatureSource {
    readonly center: Vec3;
    readonly axis: Vec3;
    readonly majorRadius: number;
    readonly minorRadius: number;
    readonly kind = "torus";
    id: ElementId;
    autoNamed: boolean;
    private readonly frame;
    constructor(center: Vec3, axisVec: Vec3, majorRadius: number, minorRadius: number, id?: ElementId);
    bounds(): AABB;
    hatchRegions(cam: Camera, _light: Light): HatchRegion[];
    /** Exact curved direction field (§2.6): poloidal (tube) + toroidal circles
     *  (+ (1,1) diagonal loops as the third family for `triple`). */
    hatchField(cam: Camera, opts: HatchFieldOptions): HatchFamily[];
    extractFeatures(cam: Camera): Feature[];
    projectedSilhouettes(cam: Camera): Curve2D[];
    /** Closed-form ray–torus: a quartic in t (docs/DESIGN.md §2.3). */
    raycast(ray: Ray): Hit[];
    private silhouetteLoops;
}
//# sourceMappingURL=torus.d.ts.map