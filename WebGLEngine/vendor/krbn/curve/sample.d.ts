import type { Vec2, Vec3 } from "../math/types.js";
export interface SampleOptions {
    /** max allowed screen deviation of the chord from the true curve, in pixels */
    tolerancePx: number;
    /** recursion guard */
    maxDepth: number;
    /**
     * Force uniform subdivision to at least this depth (2^minDepth segments) before
     * the deviation test can stop. Guards against *midpoint aliasing*: a curve that
     * is symmetric about an interval's centre has its midpoint sitting on the chord
     * (deviation ≈ 0), so a single-midpoint test would wrongly declare it flat and
     * collapse an oscillation (or a symmetric Bézier) to a straight line. A small
     * floor breaks that symmetry so the adaptive pass sees the real shape. Default 0
     * (pure adaptive) for curves with no such symmetry — e.g. conic emit sampling.
     */
    minDepth?: number;
}
export declare const DEFAULT_SAMPLE: SampleOptions;
export interface SampleResult {
    ts: number[];
    points: Vec3[];
}
/**
 * Sample `f` over [t0, t1] so the projected polyline is flat to `tolerancePx`.
 * `project` maps an object-space point to screen pixels (the flatness metric).
 * Returns object-space points at the chosen parameters (ordered, endpoints included).
 */
export declare function adaptiveSample(f: (t: number) => Vec3, t0: number, t1: number, project: (p: Vec3) => Vec2, opts?: SampleOptions): SampleResult;
/** de Casteljau evaluation of a Bézier curve of any degree at parameter t ∈ [0,1]. */
export declare function deCasteljau(control: readonly Vec3[], t: number): Vec3;
//# sourceMappingURL=sample.d.ts.map