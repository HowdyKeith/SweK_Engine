import type { ElementId } from "../pipeline/types.js";
import type { FeatureSource } from "./feature-source.js";
import type { Role, StyleOverride } from "../pipeline/style.js";
export interface ElementOptions {
    importance?: number;
    role?: Role;
    style?: StyleOverride;
    /** When `false`, the element still participates fully in the pipeline —
     *  it occludes other elements and is occluded by them (hidden-line, hatch
     *  clipping) — but emits *no strokes of its own* to the final output. Useful
     *  for splitting one scene into per-colour SVG layers for multi-pen plotting:
     *  render once per colour, muting the other colours, and every layer keeps
     *  correct visibility against the whole scene. Default `true`. */
    output?: boolean;
}
export declare class Element {
    readonly source: FeatureSource;
    readonly id: ElementId;
    importance: number;
    role: Role;
    styleOverride: StyleOverride;
    /** Emit this element's own strokes to the output? (It always still occludes.) */
    output: boolean;
    constructor(source: FeatureSource, opts?: ElementOptions);
    /** Set importance (0..1); optionally the semantic role. Chainable. */
    setImportance(value: number, opts?: {
        role?: Role;
    }): this;
    setRole(role: Role): this;
    /** Toggle whether this element emits its own strokes (it still occludes).
     *  Chainable. See {@link ElementOptions.output}. */
    setOutput(value: boolean): this;
    /** Merge per-element style overrides. Chainable. */
    style(override: StyleOverride): this;
}
//# sourceMappingURL=element.d.ts.map