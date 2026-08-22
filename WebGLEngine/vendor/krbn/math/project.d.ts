import type { Curve2D } from "../curve/types.js";
import type { Vec3 } from "./types.js";
import type { Mat3 } from "./mat3.js";
import type { Proj } from "./camera.js";
/** Plane→screen homography H = P · Mp, Mp = [ (x̂,0) | (ŷ,0) | (origin,1) ]. */
export declare function planeToScreenHomography(P: Proj, xhat: Vec3, yhat: Vec3, origin: Vec3): Mat3;
/** Push a plane-space point conic through a homography into screen space. */
export declare function screenConicFromPlaneConic(H: Mat3, planeConic: Mat3): Curve2D | null;
/** Screen conic of a world circle (center, radius) with the given in-plane axes. */
export declare function projectCircle(P: Proj, center: Vec3, radius: number, xhat: Vec3, yhat: Vec3): Curve2D | null;
//# sourceMappingURL=project.d.ts.map