import type { AABB, Camera, Hit, Ray, Vec3 } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { ElementId, Feature, HatchFamily, HatchFieldOptions, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
export declare class Cylinder implements FeatureSource {
    readonly base: Vec3;
    readonly axis: Vec3;
    readonly height: number;
    readonly radius: number;
    readonly kind = "cylinder";
    id: ElementId;
    autoNamed: boolean;
    constructor(base: Vec3, axisVec: Vec3, radius: number, id?: ElementId);
    private get top();
    bounds(): AABB;
    hatchRegions(cam: Camera, _light: Light): HatchRegion[];
    /** Exact curved direction field (§2.6): circumferential rings + axial rulings
     *  (+ 45° helices as the diagonal third family for `triple`). */
    hatchField(cam: Camera, opts: HatchFieldOptions): HatchFamily[];
    extractFeatures(cam: Camera): Feature[];
    projectedSilhouettes(cam: Camera): Curve2D[];
    /** Finite-solid raycast: lateral surface clipped to [0,h] plus the two caps. */
    raycast(ray: Ray): Hit[];
    /** The two points on the base rim where the silhouette rulings start, or null
     *  when the view is along the axis (silhouette degenerates to the rim). */
    private silhouetteBasePoints;
}
//# sourceMappingURL=cylinder.d.ts.map