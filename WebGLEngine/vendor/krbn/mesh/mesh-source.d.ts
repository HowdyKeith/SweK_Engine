import type { AABB, Camera, Hit, Ray } from "../math/types.js";
import type { Curve2D } from "../curve/types.js";
import type { ElementId, Feature, HatchFamily, HatchFieldOptions, HatchRegion, Light } from "../pipeline/types.js";
import type { FeatureSource } from "../scene/feature-source.js";
import { HalfEdgeMesh, type BuildOptions, type MeshInput } from "./halfedge.js";
import { type CurvatureField } from "./curvature.js";
export interface MeshOptions extends BuildOptions {
    /** draw suggestive contours (needs the curvature precompute; off by default).
     *  `true` uses the default threshold; an object sets threshold and the fade
     *  band (`fade`: contours fade in over that D_w κ_r margin instead of popping
     *  at the threshold). (docs/DESIGN.md §3.3.5, §3.3.7) */
    suggestive?: boolean | {
        threshold?: number;
        fade?: number;
    };
    /** Escape hatch: skip the acceleration structure and linear-scan every triangle
     *  on each raycast. Results are identical by construction — the BVH is pure
     *  culling in front of an unchanged intersector (src/mesh/bvh.ts) — so this
     *  exists only for parity testing and for bisecting a suspected culling bug.
     *  Defaults to true (accelerated). */
    bvh?: boolean;
}
export declare class Mesh implements FeatureSource {
    readonly kind = "mesh";
    id: ElementId;
    autoNamed: boolean;
    readonly he: HalfEdgeMesh;
    private readonly aabb;
    private readonly suggestiveOpt;
    private _curv?;
    private readonly bvhEnabled;
    private _bvh?;
    /**
     * A *faceted* mesh — a hard-edged polyhedron (cube, gem, low-poly), where most
     * interior edges are creases. Its silhouette is the exact face-based contour
     * (not the smooth interpolated zero-set, which wanders across flat faces) and it
     * shades flat per face. A predominantly smooth mesh (sphere, torus, knot, the
     * gravity sheet — few or no creases) keeps the interpolated path unchanged.
     */
    private readonly faceted;
    /**
     * A *capped* solid — smooth walls meeting flat lids at crease rims (an extruded
     * rounded slab, the Slack tiles). Neither faceted (its walls are smooth) nor
     * plainly smooth (the shared-normal zero-set would wander a phantom contour across
     * the flat lids). Its contour — both the drawn outline and the fillable region —
     * is the **exact face-based contour**: a clean closed loop that hugs the real
     * rounded edges and joins the rim creases, so the hatch clips to real edges and the
     * outline never dangles. Shading stays smooth via the crease-aware corner normals,
     * which is what keeps the flat lids from doming. (The interpolated zero-set, even a
     * crease-aware one, is open arcs that leave gaps on a thin lid — hence the face
     * contour here.)
     */
    private readonly capped;
    constructor(input: MeshInput, opts?: MeshOptions, id?: ElementId);
    /** Curvature precompute, lazily (only when suggestive contours are requested). */
    curvature(): CurvatureField;
    bounds(): AABB;
    /** Self-occlusion depth tolerance for the exact depth-buffer QI (docs/DESIGN.md
     *  §3.3.6). A *smooth* mesh's silhouette is the interpolated zero-set, which
     *  floats off the flat facets by up to a facet's chord-sagitta, so a self-hit
     *  only counts as a genuine (separate-sheet) occlusion beyond ~an edge length.
     *  A *faceted* mesh has exactly-flat faces and its crease/silhouette points lie
     *  exactly on those facets — the raycast is exact — so it needs no such slack;
     *  the base analytic floor alone keeps the visible/hidden boundary crisp instead
     *  of smeared across a whole face. */
    selfNudge(): number;
    extractFeatures(cam: Camera): Feature[];
    /** The apparent contour used to seed QI crossings and bound hatch: the exact
     *  face-based outline for a faceted or capped solid, the interpolated zero-set for
     *  a plainly smooth mesh. */
    private silhouetteWorld;
    projectedSilhouettes(cam: Camera): Curve2D[];
    /** The fillable region(s): closed silhouette loops. The scene's per-sample clip
     *  carves the visible surface and shades it via this source's `raycast` normals. */
    hatchRegions(cam: Camera, _light: Light): HatchRegion[];
    /** Curvature-driven hatch: streamlines of the principal-direction field (dir1
     *  for family 0, dir2 for family 1). Returns `[]` on isotropic surfaces (e.g. a
     *  sphere), so the scene falls back to straight parallel hatch. (docs/DESIGN.md §2.6)
     *
     *  Temporal coherence: streamlines come from a static object-space
     *  `StreamlineAtlas` (traced once per density level, cached on the source —
     *  intrinsic geometry, like the curvature field). The camera only picks the
     *  atlas *level*; it never re-seeds, so lines cannot drift or pop under
     *  camera motion except at discrete level switches, which purely add or
     *  remove the finest level. */
    hatchField(cam: Camera, opts: HatchFieldOptions): HatchFamily[];
    private readonly _atlas;
    /** Level-0 (coarsest) atlas spacing: a quarter of the bounds diagonal — a
     *  view-independent reference density the LOD ladder halves from. */
    private atlasBaseSpacing;
    /** Convert a desired on-screen hatch spacing (px) to a world-space separation,
     *  by measuring screen pixels per world unit at the object centre. The probe
     *  runs along the camera's *right* axis, so the estimate is exact for ortho
     *  and, for perspective, depends only on the distance to the object — not on
     *  the view direction. That matters for the discrete atlas level: an orbit at
     *  constant distance must not jitter the demand across a level boundary. */
    private screenToWorldSpacing;
    /** The BVH over this mesh's triangles, built on first use. Static scaffold
     *  (docs/DESIGN.md §0.4): `he.positions` is readonly and never mutated, so one
     *  build lasts the instance's life. Lazy rather than eager because `Mesh` is
     *  public API — a consumer may only ever want `extractFeatures` /
     *  `projectedSilhouettes` and never cast a ray. Mirrors `curvature()` above. */
    private bvh;
    /** Möller–Trumbore ray–triangle intersection; interpolated crease-aware corner
     *  normals for shading, face normal for the front/back flag.
     *
     *  The BVH only narrows *which* faces are tested — it is pure culling in front of
     *  an unchanged intersector, offering candidates in ascending face index exactly
     *  as the old full scan visited them (see src/mesh/bvh.ts for why that ordering
     *  is load-bearing). Brute force is the same code path with a null candidate set,
     *  never a second implementation: that is what makes the parity tests meaningful. */
    raycast(ray: Ray): Hit[];
    /** `faces === null` ⇒ scan every face in index order (the pre-BVH behavior). */
    private intersectFaces;
}
//# sourceMappingURL=mesh-source.d.ts.map