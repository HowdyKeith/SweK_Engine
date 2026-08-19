import type { Camera, Vec2, Vec3 } from "../math/types.js";
import type { Curve } from "../curve/types.js";
import type { Curve2D } from "../curve/types.js";
export interface FeatureCurveModel {
    t0: number;
    t1: number;
    closed: boolean;
    /** 3-D point at parameter t (t in [t0, t1]). */
    point3(t: number): Vec3;
    /** projected screen curve, for computing crossings with occluder silhouettes */
    screen: Curve2D;
    /** feature parameter at a screen point, or null if it does not fall on the curve */
    paramOf(pt: Vec2): number | null;
    /**
     * Natural sample parameters, if the curve is already a discrete polyline (the
     * vertex params 0…n). Present ⇒ the curve is piecewise-linear and emit samples
     * it *at these vertices* rather than adaptively re-sampling `point3` — which
     * would be both wasteful and lossy (a re-sample can skip vertices and alias a
     * symmetric shape flat). Absent ⇒ an analytic curve, sampled adaptively.
     */
    knots?: readonly number[];
}
export declare function buildFeatureModel(curve: Curve, cam: Camera): FeatureCurveModel;
//# sourceMappingURL=feature-curve.d.ts.map