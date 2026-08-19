import type { Vec2 } from "../math/types.js";
/**
 * Depth-emphasis multiplier for a stroke at camera-space `depth`, relative to the
 * focal plane `refDepth` (eye→target). Nearer than the focus ⇒ bolder (> 1),
 * farther ⇒ thinner (< 1), clamped. A perception cue, independent of the hand
 * knob — it applies even to ruler-clean (`wobble: 0`) lines.
 */
export declare function depthEmphasis(depth: number, refDepth: number): number;
export interface WidthInput {
    /** the final (post-wobble) screen polyline */
    path: readonly Vec2[];
    /** stroke identity seed (shared with wobble so a stroke's hand is consistent) */
    seed: number;
    /** the emphasis weight to modulate (role/importance already baked in) */
    baseWidth: number;
    /** 0 = uniform ruler width, ~1 = full pencil character (the `wobble` knob) */
    amount: number;
}
/**
 * A swappable stroke-width profile. Replace this to change how a line breathes
 * (e.g. a dry-brush or a marker) without touching the emit or backend layers —
 * they only consume the per-vertex width array.
 */
export interface WidthStrategy {
    widths(input: WidthInput): number[];
}
export interface WidthParams {
    taperFrac?: number;
    endFloor?: number;
    pressureAmp?: number;
    pressureFreq?: number;
}
/**
 * The built-in pencil profile: a smooth thin→thick→thin taper at the ends times a
 * seeded 1-D pressure noise along the (screen) arclength, blended in by `amount`
 * so a stroke with `wobble: 0` stays perfectly uniform.
 */
export declare function createWidth(params?: WidthParams): WidthStrategy;
/** Default width strategy — the pencil taper + pressure profile. */
export declare const defaultWidth: WidthStrategy;
//# sourceMappingURL=width.d.ts.map