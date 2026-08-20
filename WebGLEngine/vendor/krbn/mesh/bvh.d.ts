import type { AABB, Ray } from "../math/types.js";
import type { HalfEdgeMesh } from "./halfedge.js";
/**
 * Global override for the acceleration path. Deliberately module-level and absent
 * from src/index.ts: it exists for sweeps that must reach *every* mesh in a scene
 * they don't construct (see scripts/), which a per-Mesh option cannot express.
 *
 *   "on"     use the BVH (default; per-Mesh `bvh: false` still wins)
 *   "off"    linear-scan everything
 *   "verify" run BOTH paths on every raycast and throw on any divergence
 *
 * "verify" is the strongest check we have: the SVG byte-compare only sees rays
 * that reach a pixel, while this compares every raycast a render performs —
 * including any whose divergence would be latent today and load-bearing tomorrow.
 * It is also the only empirical answer to the one residual risk the pad cannot
 * cover: a near-coplanar ray that squeaks past |a| < EPS_ABS, where MT's accept
 * set is dominated by rounding amplified by 1/a and is not geometrically
 * characterizable. Astronomically unlikely; verified rather than assumed.
 *
 * `process.env` is not used anywhere in src/ (browser-targeted, sideEffects:false),
 * hence a typed setter rather than an env var.
 */
export type BvhMode = "on" | "off" | "verify";
export declare function setBvhMode(m: BvhMode): void;
export declare function getBvhMode(): BvhMode;
export interface TriangleBVH {
    /** [minx,miny,minz,maxx,maxy,maxz] per node. */
    readonly nodeBounds: Float64Array;
    /** leaf: index of its first prim in `primIndex`. interior: index of right child. */
    readonly nodeStart: Int32Array;
    /** >0 ⇒ leaf holding this many prims. 0 ⇒ interior (left child is always i+1). */
    readonly nodeCounts: Int32Array;
    /** face indices, permuted so each leaf's prims are contiguous. */
    readonly primIndex: Int32Array;
    readonly nodeCount: number;
    readonly maxDepth: number;
    /** ascending face indices hit by `ray`'s *infinite line*; valid until the next call. */
    candidates(ray: Ray): Int32Array;
}
/** Build the static BVH. O(N·depth) with small constants — single-digit ms at 10k
 *  triangles, once per mesh (see `Mesh.bvh()`, which builds lazily). */
export declare function buildTriangleBVH(he: HalfEdgeMesh, bounds: AABB): TriangleBVH;
//# sourceMappingURL=bvh.d.ts.map