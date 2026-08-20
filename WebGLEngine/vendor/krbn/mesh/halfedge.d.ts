import type { Vec3 } from "../math/types.js";
export type Tri = readonly [number, number, number];
export interface MeshInput {
    positions: readonly Vec3[];
    /** CCW when viewed from outside, so face normals point outward */
    triangles: readonly Tri[];
}
export interface BuildOptions {
    /** dihedral above this (radians) tags an interior edge as a crease. Default 30°. */
    creaseAngle?: number;
    /** weld vertices closer than this before building topology (0 = off). */
    weldEps?: number;
}
/** One undirected edge with its adjacency and precomputed angle tags. */
export interface EdgeInfo {
    /** endpoints, v0 < v1 */
    v0: number;
    v1: number;
    /** the half-edge indices on this edge (one if boundary, two if interior) */
    halfEdges: number[];
    boundary: boolean;
    /** unsigned angle between the two adjacent face normals (radians); 0 on a
     *  boundary or between coplanar faces */
    dihedral: number;
    /** convex ridge (true) vs concave valley (false); meaningless on a boundary */
    convex: boolean;
    /** dihedral > creaseAngle and not a boundary */
    crease: boolean;
}
export declare class HalfEdgeMesh {
    readonly positions: readonly Vec3[];
    readonly triangles: readonly Tri[];
    readonly heFrom: Int32Array;
    readonly heTo: Int32Array;
    readonly heNext: Int32Array;
    readonly heFace: Int32Array;
    readonly heTwin: Int32Array;
    readonly faceNormals: Vec3[];
    readonly faceAreas: number[];
    readonly vertexNormals: Vec3[];
    /** Crease-aware shading normals, one per half-edge (corner `3f+k` = the normal at
     *  vertex `tri[f][k]` as seen from face `f`). Faces joined across non-crease
     *  interior edges form a smoothing group and share a normal; a crease or boundary
     *  starts a new group, so a vertex sitting on a hard edge gets a *distinct* normal
     *  per side. This is what lets an extruded solid's flat lid shade flat while its
     *  rounded walls stay smooth — without tagging every wall facet as a drawn crease.
     *  On a mesh with no creases every corner collapses to `vertexNormals[v]`. */
    readonly cornerNormals: Vec3[];
    readonly edges: EdgeInfo[];
    readonly boundaryEdgeCount: number;
    readonly nonManifoldEdgeCount: number;
    /** Area fraction of the largest planar smoothing group (0 = no flat facets, up to
     *  1 = a flat sheet). Distinguishes a capped/flat-faceted solid from an organic
     *  mesh; `mesh-source` thresholds it to pick the silhouette regime. */
    readonly flatFacetFraction: number;
    private constructor();
    static build(input: MeshInput, opts?: BuildOptions): HalfEdgeMesh;
    get vertexCount(): number;
    get faceCount(): number;
    get edgeCount(): number;
    private _meanEdge;
    /** Mean edge length — the natural length scale of the tessellation (used e.g.
     *  to size the self-occlusion tolerance for grazing mesh silhouettes). */
    get meanEdgeLength(): number;
    /** V − E + F (2 for a closed genus-0 surface). */
    eulerCharacteristic(): number;
    /** Watertight ⇔ every edge has two adjacent faces. */
    get isClosed(): boolean;
    creases(): EdgeInfo[];
    boundaries(): EdgeInfo[];
    /** Centroid of a face (handy for outward-normal checks / seeding). */
    faceCentroid(f: number): Vec3;
}
//# sourceMappingURL=halfedge.d.ts.map