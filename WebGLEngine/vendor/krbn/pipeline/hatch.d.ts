import type { Vec2 } from "../math/types.js";
import type { HatchMode, HatchRegion } from "./types.js";
export type Segment = readonly [Vec2, Vec2];
export interface HatchOptions {
    /** overrides the tone-derived spacing */
    spacingPx?: number;
    /** clamp so a bad tone can't emit thousands of lines */
    minSpacingPx?: number;
}
/** The hatch angle set for a mode: 1 (single), 2 (cross), or 3 (triple) angles.
 *  Also used by the scene to draw one *tonal layer* per angle. */
export declare function hatchAngles(mode: HatchMode, angleDeg: number): number[];
/** Darker regions hatch tighter. tone 0 → 11px, tone 1 → 3px (slightly denser
 *  than the original 14→4 so tonal bands read more strongly). Shared with the
 *  scene so curved direction fields pick the same tone-driven spacing. */
export declare function toneToSpacing(tone: number): number;
/** One hatch line's clipped segments plus its stable identity within the region:
 *  `key` = angle-set index + the line's integer offset index from the region's
 *  anchor — so the same physical line keeps the same key (and hence the same
 *  wobble seed) from frame to frame, regardless of how many lines the region
 *  needs this frame or how visibility clipping splits them. */
export interface HatchLine {
    seg: Segment;
    key: string;
}
/** Generate keyed hatch lines filling a region. Line phase: offsets run through
 *  `region.anchorPx` (the projected object anchor) when present, so the family
 *  translates with the object under camera pan instead of being pinned to
 *  multiples of `spacing` from the screen origin (temporal coherence). */
export declare function generateHatchLines(region: HatchRegion, opts?: HatchOptions): HatchLine[];
/** Generate hatch segments filling a region (points-only view of
 *  `generateHatchLines`). */
export declare function generateHatch(region: HatchRegion, opts?: HatchOptions): Segment[];
/**
 * A swappable hatch-pattern generator. Replace this to change how a region is
 * filled (e.g. contour-following or stippled hatching) without touching the
 * scene, styling, or visibility clipping — the scene consumes `Segment[]` and
 * clips them to the visible surface regardless of how they were produced.
 */
export interface HatchStrategy {
    generate(region: HatchRegion, opts: HatchOptions): Segment[];
    /** Optional keyed variant: the scene prefers it when present, so each line's
     *  wobble seed follows the line's stable identity across frames instead of
     *  its emission order (temporal coherence). Strategies without it still work;
     *  their lines get enumeration-order keys. */
    generateLines?(region: HatchRegion, opts: HatchOptions): HatchLine[];
}
/** The built-in parallel-line hatch. */
export declare const defaultHatch: HatchStrategy;
//# sourceMappingURL=hatch.d.ts.map