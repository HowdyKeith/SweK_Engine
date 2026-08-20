import type { Vec2, Vec3 } from "../math/types.js";
/** FNV-1a string hash → uint32, for turning a stroke identity into a seed. */
export declare function hashSeed(s: string): number;
/**
 * Offset each vertex of `path` laterally by a seeded noise sampled at that
 * vertex's object-space arclength. `arclength[i]` is the cumulative world-space
 * distance to vertex i; `amount` is the wobble intensity (0 = ruler). Returns a
 * new path (endpoints participate, so strokes read as sketched, not clamped).
 */
export declare function applyWobble(path: readonly Vec2[], arclength: readonly number[], seed: number, amount: number): Vec2[];
/**
 * Densify a screen polyline (and its object-space companion) so no gap exceeds
 * `stepPx`. Needed before wobbling otherwise straight, sparsely-sampled runs have
 * no interior vertices for the noise to bend. Interpolation is linear in both
 * screen and object space — exact for the flat segments the sampler produces.
 */
export declare function densify(path: readonly Vec2[], points3: readonly (readonly [number, number, number])[], stepPx: number): {
    path: Vec2[];
    points3: [number, number, number][];
};
/** Cumulative world-space arclength of a 3-D sample sequence. */
export declare function arclengthOf(points: readonly (readonly [number, number, number])[]): number[];
/** Everything a wobble algorithm gets: the sampled screen run + its object-space
 *  companion (for coherence), the identity seed, and the intensity. */
export interface WobbleInput {
    path: readonly Vec2[];
    points3: readonly Vec3[];
    /** seed derived from element identity — shared across an element's features so
     *  its strokes join at common vertices */
    seed: number;
    /** 0 = ruler, ~1 = hero sketchy */
    amount: number;
}
/**
 * A swappable line-perturbation algorithm. Replace this to change the entire
 * "hand-drawn" character without touching visibility, styling, or the backend
 * (the layer only communicates through `WobbleInput` → screen polyline).
 */
export interface WobbleStrategy {
    apply(input: WobbleInput): Vec2[];
}
export interface WobbleParams {
    /** peak per-axis screen offset (px) at amount = 1 */
    amplitudePx?: number;
    /** spatial-noise cycles per world unit */
    frequency?: number;
    /** densify spacing so straight runs have interior vertices to bend */
    stepPx?: number;
}
/**
 * The built-in coherence-preserving wobble: each densified vertex is offset in
 * screen space by a seeded 3-D noise field sampled at its object-space position,
 * so any two strokes sharing a 3-D vertex receive the same offset and stay
 * joined. Tunable amplitude / frequency / density.
 */
export declare function createWobble(params?: WobbleParams): WobbleStrategy;
/** Default wobble strategy — the coherence-preserving spatial field. */
export declare const defaultWobble: WobbleStrategy;
//# sourceMappingURL=wobble.d.ts.map