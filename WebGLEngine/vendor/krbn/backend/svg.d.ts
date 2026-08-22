import type { RenderStroke } from "../pipeline/types.js";
export interface SvgOptions {
    /** background fill; null/undefined → transparent */
    background?: string | null;
    /** decimal places for coordinates (smaller files vs. precision) */
    precision?: number;
    /**
     * Pen-plotter / SVG→G-code mode. Every stroke is emitted as a single-line
     * **`<path>`** centreline (`M … L …`) with a constant `stroke-width` — never a
     * `<polyline>` and never a filled variable-width **ribbon** (which a pen would
     * trace as a double outline or try to fill). One open path per stroke, so a
     * plotter draws each line exactly once. Dashes and colours are preserved; the
     * calligraphic taper/pressure is dropped (it has no meaning for a fixed pen).
     */
    centerline?: boolean;
}
/**
 * A group of strokes composited together at a single opacity. SVG flattens the
 * group before applying `opacity`, so semi-transparent members that overlap do
 * NOT compound (used for the highlight halo — see scene.ts §2.8).
 */
export interface SvgGroup {
    opacity: number;
    strokes: readonly RenderStroke[];
}
export type SvgItem = RenderStroke | SvgGroup;
/** Render styled strokes (and opacity groups) to a standalone SVG document. */
export declare function renderItemsSVG(items: readonly SvgItem[], viewport: {
    width: number;
    height: number;
}, opts?: SvgOptions): string;
/** Render styled strokes to a standalone SVG document string. */
export declare function renderStrokesSVG(strokes: readonly RenderStroke[], viewport: {
    width: number;
    height: number;
}, opts?: SvgOptions): string;
//# sourceMappingURL=svg.d.ts.map