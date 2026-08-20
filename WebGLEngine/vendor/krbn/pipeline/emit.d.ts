import type { Camera, Vec2, Vec3 } from "../math/types.js";
import type { RenderStroke, RenderStyle, Stroke } from "./types.js";
import type { Proj } from "../math/camera.js";
import { type FeatureCurveModel } from "./feature-curve.js";
import { type SampleOptions } from "../curve/sample.js";
/**
 * Adaptively sample one interval of a feature model, returning both the screen
 * polyline and the object-space points (the latter drives arclength-anchored
 * wobble). Shared by the minimal emit here and the full styling pass.
 */
export declare function sampleInterval(model: FeatureCurveModel, t0: number, t1: number, P: Proj, opts?: SampleOptions): {
    path: Vec2[];
    points3: Vec3[];
};
export interface EmitStyle {
    visible: RenderStyle;
    /** null → hidden runs are dropped entirely instead of ghosted */
    hidden: RenderStyle | null;
}
/** A restrained default: solid dark for visible, faint dashed for hidden. */
export declare const DEFAULT_EMIT_STYLE: EmitStyle;
/** Emit one classified stroke as one render stroke per (styled) interval. */
export declare function emitStroke(stroke: Stroke, cam: Camera, style?: EmitStyle, opts?: SampleOptions): RenderStroke[];
/** Emit a whole classified scene (flattened). */
export declare function emitScene(strokes: readonly Stroke[], cam: Camera, style?: EmitStyle, opts?: SampleOptions): RenderStroke[];
//# sourceMappingURL=emit.d.ts.map