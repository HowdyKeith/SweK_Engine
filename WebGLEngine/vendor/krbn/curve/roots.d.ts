export type QuadraticRoots = 
/** a ≈ b ≈ c ≈ 0: every x satisfies it (coincident constraint). */
{
    kind: "all";
}
/** No real root (negative discriminant, or a=b=0 with c≠0). */
 | {
    kind: "none";
}
/** Linear case (a ≈ 0): a single simple root. */
 | {
    kind: "single";
    x: number;
}
/** Real double root — the tangency / near-tangency case. */
 | {
    kind: "double";
    x: number;
}
/** Two distinct real roots, returned ascending. */
 | {
    kind: "two";
    x0: number;
    x1: number;
};
/**
 * Solve a·x² + b·x + c = 0 over the reals.
 *
 * The discriminant is classified against a tolerance *scaled by the magnitudes
 * of b² and 4ac*, so "double root" means the two roots coincide to relative
 * precision — this is what lets a line tangent to a conic report a clean double
 * root instead of two noisy nearly-equal ones (numerical-robustness.md).
 */
export declare function solveQuadratic(a: number, b: number, c: number): QuadraticRoots;
/**
 * Real roots of a·x³ + b·x² + c·x + d = 0, ascending. Length 1–3 for a genuine
 * cubic. Falls through to the quadratic/linear solvers when leading
 * coefficients vanish. Uses the trigonometric method for three real roots
 * (well-conditioned, no complex arithmetic) and Cardano for the single-real
 * case.
 */
export declare function solveCubicReal(a: number, b: number, c: number, d: number): number[];
/**
 * Real roots of a·x⁴ + b·x³ + c·x² + d·x + e = 0, ascending. Ferrari's method:
 * depress to y⁴ + p y² + q y + r, factor into two quadratics via a positive real
 * root of the resolvent cubic w³ + 2p w² + (p²−4r) w − q² = 0, then solve each
 * quadratic. Every root is finished with a couple of Newton steps on the original
 * polynomial for accuracy. The degree-4 case the ray–torus intersection needs
 * (numerical-robustness.md: closed-form where possible).
 */
export declare function solveQuarticReal(a: number, b: number, c: number, d: number, e: number): number[];
//# sourceMappingURL=roots.d.ts.map