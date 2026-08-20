import type { AABB, Camera, Hit, Ray, Vec3 } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { ElementId, Feature, HatchFamily, HatchFieldOptions, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
export declare class Cone implements FeatureSource {
    readonly apex: Vec3;
    readonly axis: Vec3;
    readonly height: number;
    readonly baseRadius: number;
    readonly kind = "cone";
    id: ElementId;
    autoNamed: boolean;
    private readonly cosA;
    private readonly sinA;
    private readonly tanA;
    private readonly slant;
    constructor(apex: Vec3, axisVec: Vec3, baseRadius: number, id?: ElementId);
    get baseCenter(): Vec3;
    bounds(): AABB;
    hatchRegions(cam: Camera, _light: Light): HatchRegion[];
    /** Exact curved direction field (§2.6): circumferential rings + apex generators
     *  (+ spiral generators as the diagonal third family for `triple`). */
    hatchField(cam: Camera, opts: HatchFieldOptions): HatchFamily[];
    extractFeatures(cam: Camera): Feature[];
    projectedSilhouettes(cam: Camera): Curve2D[];
    /** Closed-form ray–cone hit on the forward nappe within [0,H], plus the base cap. */
    raycast(ray: Ray): Hit[];
    /** Endpoints (on the base rim) of the two silhouette generators, or [] when
     *  the view is inside the cone's angular cone-of-silhouette (e.g. along axis). */
    private silhouetteGenerators;
}
//# sourceMappingURL=cone.d.ts.map