import type { Camera } from "../math/types.js";
import type { HatchMode, RenderStroke, RenderStyle, Stroke } from "./types.js";
import { type WobbleStrategy } from "./wobble.js";
import { type WidthStrategy } from "./width.js";
import { type SampleOptions } from "../curve/sample.js";
export interface HatchSpec {
    mode: HatchMode;
    /** hatch angle in degrees */
    angle: number;
    /** line spacing in px; if omitted, derived from the region tone */
    spacingPx?: number;
    /**
     * Use the primitive's exact curved direction field (rings/rulings/poloidal…)
     * when it offers one. Defaults to `true`; set `false` to force straight
     * parallel hatch even on a cylinder/cone/torus. (docs/DESIGN.md §2.6)
     */
    field?: boolean;
}
export interface StyleSpec {
    weight: number;
    color: string;
    /** 0 = ruler, ~1 = hero sketchy */
    wobble: number;
    /**
     * When false, suppress variable stroke width even if `wobble > 0`: strokes stay
     * constant-weight polylines instead of filled ribbons. This is the plotter-safe
     * mode — a single-pen plotter traces centrelines and ignores width entirely, so
     * ribbons (and every other width representation) are meaningless to it. Wobble on
     * the centreline is unaffected. Defaults to `true`. (docs/DESIGN.md §4)
     */
    variableWidth: boolean;
    /** how hidden runs are drawn */
    hidden: "ghost" | "drop";
    ghostOpacity: number;
    hiddenDash: number[];
    visibleDash?: number[];
    hatch: HatchSpec | null;
    /** stroke weight of hatch lines */
    hatchWeight: number;
    /** opacity of hatch lines (kept < 1 so cross-hatch layers read as tone) */
    hatchOpacity: number;
}
export type StyleOverride = Partial<StyleSpec>;
export type Role = "subject" | "context" | "default";
/** Engine defaults (a restrained technical-drawing look). */
export declare const BASE_STYLE: StyleSpec;
/** Role-driven default overrides (§2.8: context is quieter, subject is bolder). */
export declare const ROLE_STYLE: Record<Role, StyleOverride>;
/** Merge style layers over the base (later layers win). */
export declare function resolveStyle(...layers: readonly (StyleOverride | undefined)[]): StyleSpec;
export interface IntervalStyles {
    visible: RenderStyle;
    hidden: RenderStyle | null;
}
/** Turn a resolved spec into the two concrete render styles (visible / hidden). */
export declare function toRenderStyles(spec: StyleSpec): IntervalStyles;
/** Emit a classified stroke as styled, wobbled render strokes. */
export declare function emitStyledStroke(stroke: Stroke, cam: Camera, spec: StyleSpec, opts?: SampleOptions, wobble?: WobbleStrategy, width?: WidthStrategy): RenderStroke[];
//# sourceMappingURL=style.d.ts.map