import type { HatchFieldCurve, HatchSample } from "../pipeline/types.js";
import type { HalfEdgeMesh } from "./halfedge.js";
import type { CurvatureField } from "./curvature.js";
export interface MeshHatchOptions {
    /** target world-space separation between adjacent streamlines */
    spacing: number;
    /** which principal family: 0 = max-curvature direction, 1 = min */
    family: 0 | 1;
    /** samples of already-placed streamlines (a coarser atlas level): new
     *  streamlines seed *between* them, refining without moving what exists */
    occupied?: readonly HatchSample[];
}
/** Trace evenly-spaced streamlines of a principal-curvature direction field over
 *  the mesh; returns them as hatch field curves (world samples with normals), or
 *  `[]` if the surface is too isotropic to define a field. */
export declare function meshHatchField(mesh: HalfEdgeMesh, curv: CurvatureField, opts: MeshHatchOptions): HatchFieldCurve[];
/**
 * A static, object-space, multi-resolution set of streamlines. Level k holds
 * only the streamlines *added* at spacing `baseSpacing / 2^k`, seeded around
 * everything coarser — so refining never moves an existing line. A frame asks
 * for the union of levels 0..k for its desired screen density; under camera
 * motion the drawn set changes only at discrete level switches (and then only
 * by *adding/removing the finest level*), never by re-seeding.
 *
 * The atlas is intrinsic geometry (like the curvature field it traces), so it
 * lives on the source and is built lazily per level — computing it inside a
 * per-frame call is caching, not view-dependent state.
 */
export declare class StreamlineAtlas {
    private readonly mesh;
    private readonly curv;
    readonly baseSpacing: number;
    private readonly family;
    readonly maxLevels: number;
    private readonly levels;
    private readonly occupied;
    constructor(mesh: HalfEdgeMesh, curv: CurvatureField, baseSpacing: number, family: 0 | 1, maxLevels?: number);
    /** The complete level whose density best matches the demand: round(log2
     *  (base/desired)), clamped to the ladder. Discrete on purpose — a partially
     *  drawn interleaving level cannot look right in a still (faded by opacity it
     *  banded gray/black, by weight thick/thin, arriving line-by-line it paired
     *  lines with gaps — the artifact just moves channels; all were tried).
     *  Smoothing a zoom-driven level *switch* is cross-frame-state territory (a
     *  session-side crossfade), not a per-frame concern. */
    levelFor(desiredSpacing: number): number;
    /** All streamlines of levels 0..levelFor(desiredSpacing), with stable keys
     *  (`m<family>:<level>:<i>`). Levels are traced once and cached; the camera
     *  only selects how many complete levels to draw. */
    curvesFor(desiredSpacing: number): HatchFieldCurve[];
}
//# sourceMappingURL=mesh-hatch.d.ts.map