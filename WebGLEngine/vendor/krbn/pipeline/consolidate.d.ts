import type { Camera, Vec3 } from "../math/types.js";
import type { ElementId, FeatureType, Stroke } from "./types.js";
export interface ConsolidateOptions {
    /** max angle between lines to be considered collinear (degrees) */
    angleToleranceDeg: number;
    /** max perpendicular screen distance between the lines (px) */
    distanceTolerancePx: number;
    /** bridge collinear segments separated by no more than this along the line (px) */
    gapTolerancePx: number;
}
export declare const DEFAULT_CONSOLIDATE: ConsolidateOptions;
/** A merged line to be re-classified by the caller (which owns the scene). */
export interface MergedLine {
    /** sorted feature ids of the cluster's members — the minimal one anchors the
     *  merged stroke's identity across frames (temporal coherence): it survives
     *  membership churn at the cluster fringe as long as that member stays in */
    memberIds: string[];
    owner: ElementId;
    type: FeatureType;
    a: Vec3;
    b: Vec3;
}
export interface ConsolidateResult {
    /** strokes passed through unchanged (non-lines + singleton clusters) */
    singles: Stroke[];
    /** clusters of ≥2 collinear lines, reduced to merged 3-D segments */
    merged: MergedLine[];
}
/**
 * Partition strokes into those left alone and clusters of collinear lines merged
 * into 3-D segments. The caller re-classifies the merged segments.
 */
export declare function consolidateLines(strokes: readonly Stroke[], cam: Camera, opts?: ConsolidateOptions): ConsolidateResult;
//# sourceMappingURL=consolidate.d.ts.map