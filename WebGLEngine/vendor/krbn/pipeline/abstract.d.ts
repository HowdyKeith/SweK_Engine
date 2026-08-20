import type { Curve2D } from "../curve/types.js";
import type { ElementId, Stroke } from "./types.js";
/** Projected screen extent (bounding-box diagonal, px) of a curve. */
export declare function screenExtent(curve: Curve2D): number;
/**
 * Effective feature-size cutoff for an element, given the base cutoff and the
 * element's importance (0..1). Importance 1 → cutoff 0 (never dropped);
 * importance 0 → the full base cutoff.
 */
export declare function cutoffFor(importance: number, baseCutoffPx: number): number;
export interface AbstractionOptions {
    /** base screen-size cutoff in px (0 disables thresholding) */
    minFeaturePx: number;
    /** importance lookup by owner (defaults to 0.5 if unknown) */
    importanceOf?: (owner: ElementId) => number;
}
/** A stroke whose extent lies in [cutoff, FADE_RATIO·cutoff) is kept but faded
 *  (opacity ramps 0→1 across the band), so zooming out dissolves small features
 *  instead of popping them — a stateless fade from a continuous quantity, no
 *  cross-frame state needed (temporal coherence). */
export declare const FADE_RATIO = 1.6;
/** Drop strokes whose projected extent falls below the importance-scaled cutoff;
 *  fade the ones just above it (see `FADE_RATIO`). */
export declare function applyAbstraction(strokes: readonly Stroke[], opts: AbstractionOptions): Stroke[];
/** Snap a 0..1 tone to `levels` discrete steps (k-level shading, §2.7). */
export declare function quantizeTone(tone: number, levels: number): number;
//# sourceMappingURL=abstract.d.ts.map