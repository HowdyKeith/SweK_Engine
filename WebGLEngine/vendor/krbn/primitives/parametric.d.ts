import type { AABB, Camera, Hit, Ray, Vec3 } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { ElementId, Feature, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
import { type SampleOptions } from "../curve/sample.js";
/** A curve x = f(t), t ∈ [t0, t1], sampled adaptively to a polyline per frame. */
export declare class ParametricCurve implements FeatureSource {
    readonly f: (t: number) => Vec3;
    readonly t0: number;
    readonly t1: number;
    readonly kind: string;
    id: ElementId;
    autoNamed: boolean;
    private readonly opts;
    constructor(f: (t: number) => Vec3, t0: number, t1: number, id?: ElementId, opts?: SampleOptions, kind?: string);
    bounds(): AABB;
    extractFeatures(cam: Camera): Feature[];
    hatchRegions(_cam: Camera, _light: Light): HatchRegion[];
    raycast(_ray: Ray): Hit[];
    projectedSilhouettes(_cam: Camera): Curve2D[];
}
/**
 * A Bézier curve carried *exactly* as control points (analytic until emit).
 * Sampling happens in the emit stage; extractFeatures hands over the `bezier`
 * carrier untouched.
 */
export declare class BezierCurve implements FeatureSource {
    readonly control: readonly Vec3[];
    readonly kind = "bezier";
    id: ElementId;
    autoNamed: boolean;
    constructor(control: readonly Vec3[], id?: ElementId);
    bounds(): AABB;
    extractFeatures(_cam: Camera): Feature[];
    eval(t: number): Vec3;
    hatchRegions(_cam: Camera, _light: Light): HatchRegion[];
    raycast(_ray: Ray): Hit[];
    projectedSilhouettes(_cam: Camera): Curve2D[];
}
/** A helix around `axis` through `center`, given radius, pitch (rise/turn), turns. */
export declare function helix(center: Vec3, radius: number, pitch: number, turns: number, id?: ElementId): ParametricCurve;
/** A function plot y = g(x) in the z = 0 plane over [x0, x1]. */
export declare function functionPlot(g: (x: number) => number, x0: number, x1: number, id?: ElementId): ParametricCurve;
//# sourceMappingURL=parametric.d.ts.map