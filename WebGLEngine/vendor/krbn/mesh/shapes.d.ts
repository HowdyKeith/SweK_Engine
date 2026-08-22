import type { Vec2, Vec3 } from "../math/types.js";
import type { MeshInput } from "./halfedge.js";
/** Translate every vertex of a mesh by `off` (for composing scenes). */
export declare function translate(mi: MeshInput, off: Vec3): MeshInput;
/** Rotate every vertex of a mesh about `axis` (unit) by `angle` (for composing). */
export declare function rotate(mi: MeshInput, axis: Vec3, angle: number): MeshInput;
/** Regular tetrahedron inscribed in the cube (centre at origin). 4 faces, 6 edges. */
export declare function tetrahedron(): MeshInput;
/** Axis-aligned cube [-1,1]³ as 12 triangles with shared corners. */
export declare function cube(): MeshInput;
/** A flat n×n grid of quads on the z=0 plane, side length `size` centred at
 *  origin — an open surface (has a boundary), for boundary/normal tests. */
export declare function grid(n?: number, size?: number): MeshInput;
/** Closed UV sphere of radius `R` (poles are single vertices). Star-shaped from
 *  the origin, so faces are oriented outward. */
export declare function uvSphere(R?: number, nu?: number, nv?: number): MeshInput;
/** Open circular tube (lateral surface only) of radius `R`, height `H`, axis +z,
 *  centred at the origin. Has top/bottom boundary loops. */
export declare function tube(R?: number, H?: number, n?: number, rings?: number): MeshInput;
/** Closed torus (axis +z), major radius `R`, tube radius `r`. `nu` toroidal /
 *  `nv` poloidal segments. Oriented outward (normal points away from the tube). */
export declare function torusMesh(R?: number, r?: number, nu?: number, nv?: number): MeshInput;
/** A "rubber-sheet" gravity well: a square grid sheet dipped downward by a smooth
 *  funnel z(r) = −depth / (1 + (r/a)²) — the spacetime-curvature picture. Open
 *  surface (has a boundary); curvature is concentrated in the dip. */
export declare function gravitySheet(R?: number, n?: number, depth?: number, a?: number): MeshInput;
/** An organic "blob": a sphere whose radius is modulated by a smooth sinusoidal
 *  field, giving convex bumps and concave dimples (curvature hatch + suggestive
 *  contours have something to work with). Star-shaped ⇒ oriented outward. */
export declare function bumpyBlob(R?: number, amp?: number, fu?: number, fv?: number, nu?: number, nv?: number): MeshInput;
/** A closed tube swept along a trefoil knot, with a parallel-transport frame whose
 *  residual twist (holonomy) is distributed so the tube closes seamlessly. */
export declare function knotTube(tubeR?: number, nSeg?: number, nTube?: number, s?: number): MeshInput;
/** Extrude a simple polygon `profile` (in the z=0 plane, any winding) straight up
 *  to `height` along +z: a flat lid, a flat floor, and one wall quad per profile
 *  edge. The caps are ear-clipped, so **non-convex** profiles (an L, a star, a
 *  gear) extrude correctly, not just convex ones. Corners become vertical **crease**
 *  edges and the rim is a 90° crease, so a sharp-cornered profile reads faceted;
 *  a finely-sampled **rounded** profile instead gives smooth walls under a flat lid
 *  — the crease-aware corner normals keep the flat top from being averaged into the
 *  walls (see `HalfEdgeMesh.cornerNormals`). Oriented outward for either winding. */
export declare function extrude(profile: readonly Vec2[], height: number): MeshInput;
//# sourceMappingURL=shapes.d.ts.map