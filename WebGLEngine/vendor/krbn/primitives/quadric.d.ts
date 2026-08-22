import type { AABB, Basis, Camera, Hit, Ray, Vec3 } from "../math/types.js";
import type { Curve2D, ConicParams } from "../curve/types.js";
import type { ElementId, Feature, HatchFamily, HatchFieldOptions, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
import type { Mat4 } from "../math/mat4.js";
import { type Proj } from "../math/camera.js";
export declare class Quadric implements FeatureSource {
    /** symmetric 4×4; Pᵀ Q P = 0 for homogeneous P = (x, y, z, 1). */
    readonly Q: Mat4;
    readonly kind = "quadric";
    id: ElementId;
    autoNamed: boolean;
    private readonly aabb;
    constructor(Q: Mat4, aabb: AABB, id?: ElementId);
    bounds(): AABB;
    hatchRegions(cam: Camera, light: Light): HatchRegion[];
    /** Closed-form ray–quadric intersection: substitute P(t) = O + tD into Pᵀ Q P. */
    raycast(ray: Ray): Hit[];
    extractFeatures(cam: Camera): Feature[];
    projectedSilhouettes(cam: Camera): Curve2D[];
    /** Polar plane of the eye: π = Q·e, e = (eye,1) for perspective, (dir,0) ortho. */
    private polarPlane;
    private silhouetteObjectSpace;
}
/**
 * Restrict a quadric to a plane: the plane section is a conic, obtained as
 * Cin = Mpᵀ Q Mp where Mp = [ x̂ | ŷ | origin ] maps in-plane (u,v,1) to world.
 * The organizing operation behind both silhouettes (§2.2, polar plane) and
 * intersection-curve features (§2.5, an arbitrary cutting plane).
 */
export declare function quadricPlaneConic(Q: Mat4, plane: Basis): ConicParams;
/** Apparent outline in screen (pixel) coordinates: dual C* = P · adj(Q) · Pᵀ. */
export declare function outlineScreenConic(Q: Mat4, P: Proj): Curve2D | null;
/**
 * A sphere configuration that also carries its parametrization. The `Quadric`
 * base gives the exact conic silhouette and closed-form raycast; the explicit
 * center/radius/axis add what a bare quadric matrix cannot express — the
 * iso-parameter hatch field (parallels + meridians + a tilted third family).
 */
export declare class Sphere extends Quadric {
    readonly center: Vec3;
    readonly radius: number;
    /** pole axis of the (u,v) chart — parallels are circles about it */
    readonly axis: Vec3;
    constructor(center: Vec3, radius: number, id?: ElementId, axis?: Vec3);
    /** Exact curved direction field (§2.6): latitude parallels + pole-to-pole
     *  meridians (+ parallels about a 45°-tilted axis as the third family for
     *  `triple`). Every curve is an exact circle; the normal is radial. */
    hatchField(cam: Camera, opts: HatchFieldOptions): HatchFamily[];
}
/** A sphere: |p - center|² = radius². */
export declare function sphere(center: Vec3, radius: number, id?: ElementId): Sphere;
/**
 * An axis-aligned ellipsoid configuration; like `Sphere`, the explicit
 * center/radii carry the parametrization the bare quadric matrix cannot
 * express. The (θ, φ) chart's iso-curves are exact ellipses, and the outward
 * normal is the exact gradient ((x−cx)/a², (y−cy)/b², (z−cz)/c²).
 */
export declare class Ellipsoid extends Quadric {
    readonly center: Vec3;
    readonly radii: Vec3;
    constructor(center: Vec3, radii: Vec3, id?: ElementId);
    /** Exact curved direction field (§2.6): parallels + meridians of the (θ, φ)
     *  chart (+ its pole-to-pole diagonal spirals as the third family for
     *  `triple`). Every sample carries the exact gradient normal. */
    hatchField(cam: Camera, opts: HatchFieldOptions): HatchFamily[];
}
/** An axis-aligned ellipsoid with the given semi-axis radii. */
export declare function ellipsoid(center: Vec3, radii: Vec3, id?: ElementId): Ellipsoid;
//# sourceMappingURL=quadric.d.ts.map