import type { Camera, Vec3 } from "../math/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
import type { Feature, Stroke } from "./types.js";
/** Scene diameter, for scaling the depth/parameter tolerances. */
export declare function sceneScale(sources: readonly FeatureSource[]): number;
/**
 * Is the world point `p` hidden by any surface in the scene? An exact depth-buffer
 * test (docs/DESIGN.md §3.3.6): cast the *primary* ray — from the eye through `p`'s
 * pixel — and ask whether any surface is hit strictly nearer than `p`. `p`'s own
 * surface registers at its own depth (`t ≈ dp`) and so never self-occludes; a
 * genuinely nearer surface — the front of a fold, or another object — is caught by
 * an exact `t < dp` comparison. No ray-nudge heuristic.
 *
 * A source's own hits near the point are "self" and don't occlude it: excluded up
 * to a per-owner depth tolerance. Smooth analytic surfaces still need a small floor
 * (`EPS_NUDGE_REL·scale`) because a raycast's grazing tangent root at a silhouette
 * is only good to ~that precision (a torus is a quartic); a *faceted* mesh declares
 * a larger one (`selfNudge`, ≈ its edge length) since a silhouette point on one
 * triangle can be a chord-sagitta nearer than the next facet. Occlusion by *other*
 * sources is compared exactly.
 */
export declare function isOccluded(p: Vec3, cam: Camera, sources: readonly FeatureSource[], scale: number, owner?: FeatureSource, ownerTol?: number): boolean;
/** Classify one feature curve into visible/hidden intervals against the scene. */
export declare function classifyFeature(feature: Feature, cam: Camera, sources: readonly FeatureSource[], scale?: number, owner?: FeatureSource): Stroke;
/**
 * Run stage 2 over a whole scene: every source's features, classified against all.
 *
 * `reconcile` is the temporal-coherence seam (docs/DESIGN.md §3.3.7): it sees the
 * complete feature list for this frame *after* id assignment and *before*
 * classification, and may mutate features in place — remap `id`s to persistent
 * identities, reverse a chain's polyline to match last frame's direction. It runs
 * here (not on strokes) because a direction fix is a cheap array reversal before
 * visibility, but an interval-flipping surgery after.
 */
export declare function classifyScene(sources: readonly FeatureSource[], cam: Camera, reconcile?: (features: Feature[]) => void): Stroke[];
//# sourceMappingURL=visibility.d.ts.map