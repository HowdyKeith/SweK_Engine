import type { Camera, Vec2, Vec3 } from "../math/types.js";
import type { HatchFieldCurve } from "../pipeline/types.js";
/** Screen distance between two world points (for spacing-driven curve counts). */
export declare function screenDist(cam: Camera, a: Vec3, b: Vec3): number;
/** How many iso-curves to fit across `screenSpan` px at `spacingPx`, clamped. */
export declare function curveCount(screenSpan: number, spacingPx: number, min: number, max: number): number;
/** One iso-parameter value of a dyadic ladder (see `dyadicLadder`). */
export interface LadderStop {
    /** the iso-parameter, in (0,1) (open) or [0,1) (periodic) */
    t: number;
    /** stable identity — the dyadic fraction, e.g. "3/8" */
    key: string;
}
/**
 * Dyadic iso-parameter ladder — temporal coherence for analytic hatch fields
 * (docs/DESIGN.md §3.3.7). Instead of `round(span/spacing)` evenly re-spaced
 * values (which *move every curve* whenever the camera changes the count),
 * iso-values live on a fixed dyadic grid: level 0 = {1/2} (open) or {0}
 * (periodic), and each level adds the midpoints between existing values — so
 * the union over levels 0..L is evenly spaced, refining never moves a curve,
 * and each value's fraction is a stable identity for wobble seeding.
 *
 * The density demand is **rounded to the nearest complete level** — partial
 * levels are never emitted. A partially-arrived interleaving level cannot look
 * right in a still: faded by opacity it reads as gray/black banding, by weight
 * as thick/thin banding, and arriving line-by-line as pair/gap spacing — the
 * artifact just moves channels (this was tried; see ROADMAP Phase-2 item 6.5).
 * The cost is a discrete switch when a *zoom* crosses a level boundary;
 * smoothing that transition is cross-frame-state territory (a session-side
 * crossfade), not a per-frame concern.
 *
 * `min`/`max` are *approximate* curve-count clamps, honoured as ladder levels:
 * counts are 2^(L+1)−1 (open) / 2^L (periodic).
 */
export declare function dyadicLadder(desired: number, opts?: {
    periodic?: boolean;
    min?: number;
    max?: number;
}): LadderStop[];
/** Tag a field curve with its ladder identity (in place, for chaining). */
export declare function tagCurve(curve: HatchFieldCurve, key: string): HatchFieldCurve;
/**
 * A world-space circle as field samples: center + radius in the plane (ex, ey),
 * with the outward normal at each sample computed by `normalAt(point)`. The loop
 * is closed (first sample repeated) so the scene can chain it end to end.
 */
export declare function circleCurve(center: Vec3, ex: Vec3, ey: Vec3, radius: number, normalAt: (p: Vec3, cosT: number, sinT: number) => Vec3, segments: number): HatchFieldCurve;
/**
 * A sampled world-space parametric curve p(t), t ∈ [0, 1], with a per-point
 * outward normal — for the diagonal iso-curves (helices, spiral generators,
 * (1,1) torus loops) that are neither circles nor segments. The exactness lives
 * in the caller's `at`, which evaluates the surface parametrization directly.
 */
export declare function paramCurve(at: (t: number) => {
    p: Vec3;
    n: Vec3;
}, segments: number): HatchFieldCurve;
/**
 * A world-space straight segment a→b as field samples, with a constant normal
 * (rulings/generators keep the same surface normal along their length).
 */
export declare function segmentCurve(a: Vec3, b: Vec3, normal: Vec3, segments: number): HatchFieldCurve;
export type { Vec2 };
//# sourceMappingURL=hatch-field.d.ts.map