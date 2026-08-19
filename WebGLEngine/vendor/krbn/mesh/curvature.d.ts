import type { Vec3 } from "../math/types.js";
import type { HalfEdgeMesh } from "./halfedge.js";
export interface VertexCurvature {
    /** principal curvatures, |κ1| ≥ |κ2| */
    k1: number;
    k2: number;
    /** unit principal directions (tangent), for κ1 and κ2 */
    dir1: Vec3;
    dir2: Vec3;
}
export interface CurvatureField {
    perVertex: VertexCurvature[];
    /** derivative-of-curvature tensor per vertex, 4 unique coefficients (a,b,c,d) in
     *  the (dir1,dir2) frame — the rate of change of the shape operator */
    dcurv: [number, number, number, number][];
    /** mixed-Voronoi area assigned to each vertex */
    pointAreas: number[];
    mean(v: number): number;
    gaussian(v: number): number;
}
/** Per-vertex principal curvatures + directions and the curvature-derivative
 *  tensor, area-weighted from per-face least-squares fits. */
export declare function computeCurvature(mesh: HalfEdgeMesh): CurvatureField;
//# sourceMappingURL=curvature.d.ts.map