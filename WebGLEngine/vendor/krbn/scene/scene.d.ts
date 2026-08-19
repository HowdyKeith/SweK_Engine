import type { Camera } from "../math/types.js";
import type { ElementId, Feature, Light } from "../pipeline/types.js";
import type { FeatureSource } from "./feature-source.js";
import type { SampleOptions } from "../curve/sample.js";
import type { SvgOptions } from "../backend/svg.js";
import type { RenderResult } from "../pipeline/render.js";
import type { StyleOverride, StyleSpec } from "../pipeline/style.js";
import { Element, type ElementOptions } from "./element.js";
import { type HatchStrategy } from "../pipeline/hatch.js";
import { type WobbleStrategy } from "../pipeline/wobble.js";
import { type WidthStrategy } from "../pipeline/width.js";
export interface SceneOptions {
    light?: Light;
    /** scene-wide default style, overridden per element */
    style?: StyleOverride;
    sample?: SampleOptions;
    svg?: SvgOptions;
    /** swappable line-perturbation algorithm (defaults to value-noise wobble) */
    wobble?: WobbleStrategy;
    /** swappable stroke-width profile (defaults to the pencil taper + pressure) */
    width?: WidthStrategy;
    /** swappable hatch-pattern generator (defaults to parallel-line hatch) */
    hatch?: HatchStrategy;
    /** stage-3 abstraction (off by default) */
    abstraction?: AbstractionSettings;
}
export interface HighlightOptions {
    /** stroke weight of the highlighted outline (default: 1.6× the element weight) */
    weight?: number;
    color?: string;
    /** when true, occluded parts are drawn dashed (x-ray) instead of dropped */
    dashWhenHidden?: boolean;
    /** optional thick, semi-transparent "marker" halo drawn under the crisp outline */
    halo?: {
        weight?: number;
        opacity?: number;
        color?: string;
    };
}
/** Per-call render options (as opposed to the authoring-time `SceneOptions`). */
export interface RenderCallOptions {
    /** temporal-coherence hook: may remap ids / reverse chains in place, after id
     *  assignment and before visibility classification (see `classifyScene`) */
    reconcileFeatures?: (features: Feature[]) => void;
}
export interface AbstractionSettings {
    /** drop features whose projected extent < this many px (importance-scaled); 0 = off */
    minFeaturePx?: number;
    /** snap hatch tone to this many discrete levels; 0/undefined = off */
    toneLevels?: number;
    /** merge near-collinear overlapping line strokes into one (§2.7); off by default */
    consolidate?: boolean;
}
export declare class Scene {
    readonly elements: Element[];
    private readonly byId;
    private readonly highlights;
    private readonly kindCounts;
    light: Light;
    defaultStyle: StyleOverride;
    sample: SampleOptions | undefined;
    svgOptions: SvgOptions | undefined;
    wobble: WobbleStrategy;
    width: WidthStrategy;
    hatch: HatchStrategy;
    abstraction: AbstractionSettings;
    constructor(opts?: SceneOptions);
    /** Add a feature source to the scene; returns its element for configuration. */
    add(source: FeatureSource, opts?: ElementOptions): Element;
    sources(): FeatureSource[];
    /**
     * Emphasize an element: its features are re-extracted and drawn heavier and
     * *on top of everything* (docs/DESIGN.md §2.8). With `dashWhenHidden`, occluded
     * parts are dashed rather than dropped — an x-ray highlight.
     */
    highlight(el: Element, opts?: HighlightOptions): this;
    /**
     * Add the intersection curve of two elements as a first-class feature
     * (docs/DESIGN.md §2.5). Supports quadric ∩ plane, quadric ∩ quadric (radical-
     * plane conic where the quadratic parts match, otherwise the traced quartic),
     * and plane ∩ plane. `emphasis: 'bold'` draws the waterline heavier.
     */
    intersect(a: Element, b: Element, opts?: {
        emphasis?: "bold" | "normal";
        style?: StyleOverride;
    }): Element;
    private sectionsFor;
    /** Fully-resolved style for an owner: base ← role ← scene default ← element. */
    resolveSpec(owner: ElementId): StyleSpec;
    /** Run the whole pipeline and return strokes, render strokes, and SVG.
     *  `opts.reconcileFeatures` is the temporal-coherence seam — see
     *  `classifyScene`; a `FrameSession` supplies it to carry identity across
     *  frames. A bare `render(cam)` stays a pure function of the camera. */
    render(cam: Camera, opts?: RenderCallOptions): RenderResult;
    /** Convenience: render directly to an SVG string. */
    toSVG(cam: Camera): string;
}
//# sourceMappingURL=scene.d.ts.map