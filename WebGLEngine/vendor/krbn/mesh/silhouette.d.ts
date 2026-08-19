import type { Camera, Vec3 } from "../math/types.js";
import type { HalfEdgeMesh } from "./halfedge.js";
/**
 * A chained zero-set contour in **canonical orientation** with a per-frame
 * identity anchor (temporal coherence, docs/DESIGN.md §3.3.7).
 *
 * - **Direction is intrinsic**: the chain is oriented so the positive-g side
 *   (front-facing, for a silhouette) lies consistently to one side of the walk —
 *   a geometric vote over the whole chain, independent of which edge happens to
 *   be the anchor and of face-iteration order. Small camera motion cannot flip a
 *   contour's parameterization direction.
 * - **Start and `key` are the minimal crossed mesh edge** along the chain: unique
 *   within a frame and stable *while that edge stays crossed*. The anchor can
 *   churn as the contour sweeps the mesh; frame-to-frame correspondence
 *   (coherence step 3) remaps anchors to persistent identities.
 *
 * Known limits of the stateless vote (measured on a 200-frame sweep): direction
 * can flip exactly at topological events (a loop splitting/merging/dying) and on
 * tiny grazing loops (≲12 crossings) where the vote is noise-dominated — both
 * are correspondence's job to smooth, not this module's.
 */
export interface ZeroSetChain {
    /** ordered world-space points; a closed loop repeats its first point last */
    pts: Vec3[];
    /** identity anchor: the minimal crossed mesh edge ("lo_hi") along the chain */
    key: string;
    closed: boolean;
    /** the crossed mesh edges ("lo_hi") in walk order, parallel to `pts` — lets a
     *  caller aggregate per-crossing data over the chain (e.g. suggestive-contour
     *  strength) or match chains by crossed-edge overlap */
    nodes: string[];
}
/**
 * Extract the mesh silhouette for `cam` as canonically oriented, identity-keyed
 * chains. Closed contours come back as loops (first point repeated at the end);
 * contours that run into a mesh boundary come back as open paths.
 */
export declare function silhouetteChains(mesh: HalfEdgeMesh, cam: Camera): ZeroSetChain[];
/** Points-only view of `silhouetteChains` (same canonical order). */
export declare function silhouetteLoops(mesh: HalfEdgeMesh, cam: Camera): Vec3[][];
/**
 * The silhouette of a *faceted* mesh (a polyhedron with hard edges). Here the
 * interpolated zero-set is the wrong tool — averaged corner normals make it wander
 * across the flat faces instead of landing on the edges. The exact contour of a
 * polyhedron is simply the set of edges whose two faces disagree on facing (one
 * front, one back); a silhouette edge is therefore always a real mesh edge (a
 * crease). Returned as ordered world-space polylines (loops for a closed solid).
 */
export declare function facetedSilhouetteLoops(mesh: HalfEdgeMesh, cam: Camera): Vec3[][];
/** A canonically oriented vertex-index chain with a stable identity anchor:
 *  its canonical first *edge* ("a_b"). A vertex can sit on several chains (a
 *  cube corner joins three crease arcs) but an edge belongs to exactly one, so
 *  the anchor is unique; for view-independent edge sets (creases, boundaries)
 *  it is fully stable across frames. */
export interface VertexChain {
    vertices: number[];
    /** identity anchor: the chain's canonical first edge, "a_b" */
    key: string;
    closed: boolean;
}
/** Chain undirected vertex-index edges into canonically oriented vertex chains,
 *  breaking at endpoints/junctions (degree ≠ 2) so each chain is a simple arc or
 *  loop. Shared by the faceted silhouette and the mesh source's crease/boundary
 *  features. */
export declare function chainVertexEdges(edges: ReadonlyArray<readonly [number, number]>): VertexChain[];
/**
 * The chained zero-set of a per-vertex scalar field `g` on the mesh — the shared
 * machinery behind both the silhouette (g = n·toEye) and suggestive contours
 * (g = radial curvature). `accept(lo, hi, s)` optionally filters a crossing on
 * edge lo→hi at parameter s (e.g. suggestive contours keep only crossings that are
 * front-facing and have increasing radial curvature); rejected crossings are
 * dropped, so contours are trimmed to the accepted region.
 */
export declare function zeroSetLoops(mesh: HalfEdgeMesh, g: Float64Array, accept?: (lo: number, hi: number, s: number) => boolean): Vec3[][];
/** `zeroSetLoops` with canonical orientation + identity keys (see `ZeroSetChain`). */
export declare function zeroSetChains(mesh: HalfEdgeMesh, g: Float64Array, accept?: (lo: number, hi: number, s: number) => boolean): ZeroSetChain[];
//# sourceMappingURL=silhouette.d.ts.map