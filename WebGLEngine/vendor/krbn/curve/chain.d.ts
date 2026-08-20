import type { Vec3 } from "../math/types.js";
export interface ChainOptions {
    /** gap threshold as a multiple of the median nearest-neighbour distance */
    gapFactor?: number;
    /** minimum points for a chain to be kept */
    minPoints?: number;
}
/** Order a point cloud into one or more polyline chains (closed where the ends meet). */
export declare function chainPoints(points: readonly Vec3[], opts?: ChainOptions): Vec3[][];
//# sourceMappingURL=chain.d.ts.map