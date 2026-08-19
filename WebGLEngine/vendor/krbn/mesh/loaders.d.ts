import type { MeshInput } from "./halfedge.js";
/**
 * Parse an STL (binary or ASCII, auto-detected) into a `MeshInput` triangle soup.
 *
 * Accepts raw bytes (`ArrayBuffer`/`Uint8Array`, e.g. from `readFileSync`) or an
 * ASCII string. The winding of each triangle is repaired against its facet's
 * stored normal and zero-area facets are dropped, so the result is safe to feed
 * straight to `new Mesh(input, { weldEps })` — pick `weldEps` to reconstruct the
 * shared topology (a few thousandths of the model's size is usually right).
 */
export declare function parseSTL(data: ArrayBuffer | Uint8Array | string): MeshInput;
/**
 * Parse a Wavefront OBJ (the geometry subset) into a `MeshInput`.
 *
 * Accepts the text or its raw bytes. Reads `v` (vertices) and `f` (faces),
 * skipping everything else (`vt`/`vn`/`vp`, `g`/`o`/`s`, `usemtl`/`mtllib`,
 * comments). Face vertices may be `v`, `v/vt`, `v/vt/vn`, or `v//vn` — only the
 * vertex index is used; indices are 1-based, and negative indices count back from
 * the vertices seen so far. Faces with more than three vertices (quads, n-gons)
 * are fan-triangulated, and zero-area triangles are dropped.
 *
 * Unlike STL, OBJ ships a shared vertex table, so the topology is already there —
 * `weldEps` is optional (use it only to *decimate*, not to reconstruct adjacency).
 */
export declare function parseOBJ(data: string | ArrayBuffer | Uint8Array): MeshInput;
//# sourceMappingURL=loaders.d.ts.map