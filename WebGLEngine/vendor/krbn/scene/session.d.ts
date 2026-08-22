import type { Camera } from "../math/types.js";
import type { Feature, FeatureId } from "../pipeline/types.js";
import type { RenderResult } from "../pipeline/render.js";
import type { Scene } from "./scene.js";
/** A session-lifetime stroke identity (`${owner}/${type}#${n}`). */
export type PersistentId = string;
/** What one frame's reconciliation decided. */
export interface FrameCoherence {
    /** 0-based frame index within the session */
    frame: number;
    /** this frame's extraction id (anchor) → persistent id */
    ids: Map<FeatureId, PersistentId>;
    /** persistent ids first seen this frame */
    born: PersistentId[];
    /** persistent ids alive last frame, gone this frame */
    died: PersistentId[];
    /** persistent ids whose chain was reversed to match last frame's direction */
    reversed: PersistentId[];
}
export type FrameRenderResult = RenderResult & {
    coherence: FrameCoherence;
};
export declare class FrameSession {
    readonly scene: Scene;
    private frame;
    private tracks;
    private byAnchor;
    private counters;
    constructor(scene: Scene);
    /** Render one frame of the sequence; identical to `scene.render` plus the
     *  coherence report, with every stroke's `feature.id` rewritten to its
     *  persistent id. */
    render(cam: Camera): FrameRenderResult;
    /** The correspondence pass (exported for the pipeline via `Scene.render`'s
     *  `reconcileFeatures`; public so tests can drive it with synthetic frames). */
    reconcile(features: Feature[]): FrameCoherence;
}
//# sourceMappingURL=session.d.ts.map