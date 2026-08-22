import type { Camera } from "../math/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
import type { RenderStroke, Stroke } from "./types.js";
import type { SampleOptions } from "../curve/sample.js";
import { type EmitStyle } from "./emit.js";
import { type SvgOptions } from "../backend/svg.js";
export interface RenderOptions {
    style?: EmitStyle;
    sample?: SampleOptions;
    svg?: SvgOptions;
}
/** Full pipeline result, so callers can inspect intermediate stages. */
export interface RenderResult {
    strokes: Stroke[];
    renderStrokes: RenderStroke[];
    svg: string;
}
export declare function renderScene(sources: readonly FeatureSource[], cam: Camera, opts?: RenderOptions): RenderResult;
/** Convenience: scene → SVG string. */
export declare function renderSceneSVG(sources: readonly FeatureSource[], cam: Camera, opts?: RenderOptions): string;
//# sourceMappingURL=render.d.ts.map