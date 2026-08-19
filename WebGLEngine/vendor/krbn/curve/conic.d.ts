import type { Vec2 } from "../math/types.js";
import type { Mat3 } from "../math/mat3.js";
import type { ConicParams } from "./types.js";
export declare function conicToMatrix(k: ConicParams): Mat3;
export declare function matrixToConic(m: Mat3): ConicParams;
/** Circle (x-cx)² + (y-cy)² = r². */
export declare function circle(cx: number, cy: number, r: number): ConicParams;
/** Axis-aligned ellipse centered at (cx,cy) with semi-axes (rx,ry). */
export declare function ellipseAxisAligned(cx: number, cy: number, rx: number, ry: number): ConicParams;
/** Evaluate the conic polynomial at (x, y). Zero ⇒ on the curve. */
export declare function evaluateConic(k: ConicParams, x: number, y: number): number;
/** A parametric line P(t) = point + t · dir (dir need not be unit). */
export interface Line2 {
    point: Vec2;
    dir: Vec2;
}
/** Homogeneous line a·x + b·y + c = 0. */
export interface HomLine2 {
    a: number;
    b: number;
    c: number;
}
/** Homogeneous line → parametric line (nearest point to origin + perpendicular dir). */
export declare function homLineToParametric(l: HomLine2): Line2;
export interface LineConicHit {
    /** parameter along the line: P(t) = line.point + t · line.dir */
    t: number;
    point: Vec2;
}
export type LineConicResult = 
/** the line lies entirely on (a component of) the conic */
{
    kind: "contained";
}
/** no real intersection */
 | {
    kind: "none";
}
/** tangency — a single point of double contact */
 | {
    kind: "tangent";
    hit: LineConicHit;
}
/** one crossing (degenerate quadratic: line meets an unbounded/degenerate conic once) */
 | {
    kind: "one";
    hit: LineConicHit;
}
/** two distinct crossings */
 | {
    kind: "two";
    hits: [LineConicHit, LineConicHit];
};
export declare function intersectLineConic(line: Line2, k: ConicParams): LineConicResult;
export type DegenerateSplit = {
    kind: "lines";
    lines: HomLine2[];
} | {
    kind: "point";
    p: Vec2;
} | {
    kind: "empty";
};
export declare function splitDegenerateConic(conic: Mat3): DegenerateSplit;
export interface IntersectionPoint {
    point: Vec2;
    /** true when the two conics touch here (tangency / double contact) */
    tangent: boolean;
}
export type ConicConicResult = 
/** the conics are the same curve (share infinitely many points) */
{
    kind: "coincident";
}
/** no real common points */
 | {
    kind: "none";
}
/** up to four real intersection points */
 | {
    kind: "points";
    points: IntersectionPoint[];
};
export declare function intersectConicConic(k1: ConicParams, k2: ConicParams): ConicConicResult;
//# sourceMappingURL=conic.d.ts.map