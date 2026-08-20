import type { Camera, Vec3 } from "../math/types.js";
import type { HalfEdgeMesh } from "./halfedge.js";
import type { CurvatureField } from "./curvature.js";
import { type ZeroSetChain } from "./silhouette.js";
export interface SuggestiveOptions {
    /** D_w κ_r must exceed this to draw (filters weak/noisy contours). Default 0. */
    threshold?: number;
    /** width of the D_w κ_r band above `threshold` over which a contour fades in
     *  (its mean margin maps to a 0..1 `strength`, styling multiplies opacity) —
     *  so contours hovering at the threshold dissolve instead of popping under
     *  camera motion (temporal coherence). 0/absent = hard threshold. */
    fade?: number;
}
/**
 * Extract suggestive contours for `cam` as ordered world-space polylines: the
 * zero-set of radial curvature, kept only where the surface is front-facing
 * (n·v > 0) and D_w κ_r exceeds `threshold`.
 */
export declare function suggestiveContours(mesh: HalfEdgeMesh, cam: Camera, curv: CurvatureField, opts?: SuggestiveOptions): Vec3[][];
/** A suggestive-contour chain plus its 0..1 `strength` — how far its mean
 *  D_w κ_r clears the threshold relative to the fade band (1 when no band). */
export type SuggestiveChain = ZeroSetChain & {
    strength: number;
};
/** `suggestiveContours` with canonical orientation + identity keys (see
 *  `ZeroSetChain`) — what the mesh source uses to give each contour a stable
 *  `FeatureId` across frames — and a per-chain fade `strength`. */
export declare function suggestiveContourChains(mesh: HalfEdgeMesh, cam: Camera, curv: CurvatureField, opts?: SuggestiveOptions): SuggestiveChain[];
//# sourceMappingURL=suggestive.d.ts.map