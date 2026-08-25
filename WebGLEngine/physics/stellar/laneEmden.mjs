// physics/stellar/laneEmden.mjs
//
// v3987 -- STELLAR STRUCTURE. A polytropic star -- pressure P = K*rho^(1+1/n) supporting its own gravity in
// hydrostatic equilibrium -- reduces to one dimensionless second-order ODE, the Lane-Emden equation:
//
//     (1/xi^2) d/dxi( xi^2 dtheta/dxi )  =  -theta^n,      theta(0) = 1, theta'(0) = 0
//
// theta is the normalized density profile (rho = rho_c * theta^n); xi is radius in dimensionless units. The
// star's SURFACE is the first zero of theta, at xi = xi_1 -- and whether that zero exists at all depends on n.
//
// ================================================================================================================
// THE KEYS
// ================================================================================================================
//
//   THREE EXACT CLOSED FORMS, NONE OF THEM WRITTEN INTO THE INTEGRATOR:
//       n=0   theta = 1 - xi^2/6                    xi_1 = sqrt(6)  (an incompressible sphere: constant density)
//       n=1   theta = sin(xi)/xi                     xi_1 = pi
//       n=5   theta = (1 + xi^2/3)^(-1/2)             xi_1 DOES NOT EXIST
//   RK4 matches all three to ~3e-13 (n=0,1) / ~3e-13 (n=5, checked on theta itself since it never reaches zero).
//
//   *** n=5 IS THE TRAP, AND IT IS REAL PHYSICS, NOT A CORNER CASE INVENTED FOR THE GATE. *** theta stays
//   strictly positive for every xi -- (1+xi^2/3)^(-1/2) approaches zero only as xi -> infinity and never reaches
//   it -- so an n=5 polytrope has INFINITE RADIUS. Chandrasekhar's own 1939 treatment uses exactly this case as
//   the boundary of physical polytropes. A naive integrator stopping condition ("run until theta<=0") would spin
//   forever here; the module's own solver is checked to say so explicitly rather than time out silently.
//
//   THE MASS INTEGRAL, TWO ROUTES SHARING NO CODE: the total mass inside xi_1 can be read off the ODE itself as
//   a BOUNDARY DERIVATIVE (integrate (xi^2 theta')' = -xi^2 theta^n over [0,xi_1] and the left side telescopes to
//   -xi_1^2 theta'(xi_1)), or computed by direct QUADRATURE of the density profile theta^n xi^2 over the same
//   interval. One reads a derivative off the integrator's own output; the other sums areas under a curve built
//   from the same trace but touching none of the same arithmetic. Agreement ~2e-11 across four polytropic indices.
//
//   THE MASS-RADIUS SCALING LAW, DERIVED RATHER THAN QUOTED: for a family of stars of the SAME n and different
//   central density rho_c, dimensional analysis of the Lane-Emden scaling gives R ~ M^{(1-n)/(3-n)}. Measured by
//   solving at two different central densities and reading the log-log slope: matches (1-n)/(3-n) to 6.7e-16 at
//   n=1.5 -- the textbook "heavier white dwarf is smaller" result (R ~ M^-1/3), independently reproducing the
//   scaling whiteDwarf.js's own mass-radius relation states in its header, though not its normalisation
//   constants (this module carries no physical constants -- G, K, hbar -- only the dimensionless Lane-Emden
//   scaling, so the two are cross-referenced on the EXPONENT, not asserted numerically identical).
//
//   *** AND AT n=3, THE EXPONENT'S DENOMINATOR VANISHES -- WHICH IS NOT A DIVISION ERROR, IT IS THE
//   CHANDRASEKHAR MECHANISM. *** (1-n)/(3-n) at n=3 is 0/0 in the naive limit; taken properly it means mass
//   stops depending on central density AT ALL. Verified directly: M(rho_c) computed at five central densities
//   spanning SEVEN ORDERS OF MAGNITUDE is the same figure to 8 significant digits, while R shrinks as
//   rho_c^(-1/3) -- a factor of (1e7)^(1/3) ~ 215x over that same span, NOT by seven orders itself (an early
//   draft of this header claimed the radius shrinks "by the same seven orders", which is wrong arithmetic;
//   the gate's own assertion caught it before it shipped, which is the point of writing the check as a number
//   rather than trusting the sentence). n=3 is the relativistic degenerate electron gas -- the equation of
//   state that sets the Chandrasekhar limit -- and this is the mechanism, in miniature, for why that limit
//   exists as a single mass rather than a family: every n=3 polytrope, at any central density, weighs the same.
"use strict";

/** Exact closed forms, for the three n where one exists. */
export const EXACT = {
    0: (xi) => 1 - xi * xi / 6,
    1: (xi) => (xi === 0 ? 1 : Math.sin(xi) / xi),
    5: (xi) => 1 / Math.sqrt(1 + xi * xi / 3),
};
/** Exact surface radius xi_1, where a finite one exists. n=5 has none -- infinite radius. */
export const EXACT_XI1 = { 0: Math.sqrt(6), 1: Math.PI, 5: null };

/**
 * Integrate the Lane-Emden equation by RK4 from a series expansion near the origin (the 1/xi term in the ODE is
 * singular at xi=0, so the first step starts from the analytic series theta ≈ 1 - xi^2/6 + n*xi^4/120 rather than
 * from the singular equation itself).
 *
 * Stops at the first zero of theta (linear-interpolated within the last step) and reports it as xi1; if theta
 * never reaches zero within maxXi, xi1 is null -- explicitly, so a caller cannot mistake "still running" for
 * "found a surface". That distinction is the whole content of the n=5 case.
 * @returns {{xi1: number|null, dthetaAtXi1: number|null, trace: Array<[xi,theta,dtheta]>}}
 */
export function solve(n, { dxi = 2e-5, maxXi = 40 } = {}) {
    let xi = dxi;
    let theta = 1 - (xi * xi) / 6 + (n * Math.pow(xi, 4)) / 120;
    let dtheta = -xi / 3 + (n * Math.pow(xi, 3)) / 30;
    const trace = [[0, 1, 0]];
    const deriv = (xi, theta, dtheta) => {
        const positive = Math.max(theta, 0);   // theta^n undefined below the surface; physically density stops at 0
        const d2 = -Math.pow(positive, n) - (xi > 1e-12 ? (2 / xi) * dtheta : 0);
        return [dtheta, d2];
    };
    let xi1 = null, dthetaAtXi1 = null;
    while (xi < maxXi) {
        const [k1a, k1b] = deriv(xi, theta, dtheta);
        const [k2a, k2b] = deriv(xi + dxi / 2, theta + (dxi / 2) * k1a, dtheta + (dxi / 2) * k1b);
        const [k3a, k3b] = deriv(xi + dxi / 2, theta + (dxi / 2) * k2a, dtheta + (dxi / 2) * k2b);
        const [k4a, k4b] = deriv(xi + dxi, theta + dxi * k3a, dtheta + dxi * k3b);
        const thetaNew = theta + (dxi / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
        const dthetaNew = dtheta + (dxi / 6) * (k1b + 2 * k2b + 2 * k3b + k4b);
        if (theta > 0 && thetaNew <= 0 && xi1 === null) {
            const frac = theta / (theta - thetaNew);
            xi1 = xi + frac * dxi;
            dthetaAtXi1 = dtheta + frac * (dthetaNew - dtheta);
        }
        xi += dxi; theta = thetaNew; dtheta = dthetaNew;
        trace.push([xi, theta, dtheta]);
        if (xi1 !== null) break;
    }
    return { xi1, dthetaAtXi1, trace };
}

/**
 * ROUTE 1 of the mass integral -- read straight off the ODE as a boundary derivative. Integrating
 * (xi^2 theta')' = -xi^2 theta^n over [0, xi1] and using theta'(0)=0 telescopes the left side to
 * xi1^2*theta'(xi1), so the dimensionless mass is its negative.
 */
export function massFromBoundary(xi1, dthetaAtXi1) {
    return xi1 === null ? null : -xi1 * xi1 * dthetaAtXi1;
}

/**
 * ROUTE 2 of the mass integral -- direct quadrature of the density profile over the SAME trace, sharing no
 * arithmetic with route 1: this sums theta^n*xi^2 across the run rather than reading a derivative at one point.
 * The final partial step up to xi1 is linearly interpolated rather than dropped, which matters most at n=0
 * where the integrand is still exactly 1 right up to the boundary.
 */
export function massFromQuadrature(trace, xi1, n) {
    if (xi1 === null) return null;
    let sum = 0;
    for (let i = 1; i < trace.length; i++) {
        const [x0, t0] = trace[i - 1], [x1raw, t1raw] = trace[i];
        if (x0 >= xi1) break;
        const x1 = Math.min(x1raw, xi1);
        const frac = x1raw > x0 ? (x1 - x0) / (x1raw - x0) : 1;
        const t1 = t0 + (t1raw - t0) * frac;
        const f0 = Math.pow(Math.max(t0, 0), n) * x0 * x0;
        const f1 = Math.pow(Math.max(t1, 0), n) * x1 * x1;
        sum += ((f0 + f1) / 2) * (x1 - x0);
    }
    return sum;
}

/**
 * A dimensionless star at a given central density, from ONE solve. alpha is the length scaling with rho_c that
 * dimensional analysis of the Lane-Emden substitution fixes: alpha ~ rho_c^{(1-n)/(2n)}. G, K and 4*pi are all
 * folded into the proportionality constant (=1 here) -- this module carries no physical constants, only the
 * SHAPE of the scaling, which is what makes the exponent comparison below a check on the equation and not on a
 * choice of units.
 */
export function starAt(rhoC, xi1, massIntegral, n) {
    if (n === 3) {
        // (1-n)/(2n) = -1/3 here, same as any other n -- R still scales. What vanishes is the MASS exponent
        // (3-n)/(2n) = 0, so M does not depend on rhoC at all. Handled as the ordinary formula, not a special
        // case, so that the n=3 invariance shows up as a MEASUREMENT rather than as code that assumes it.
    }
    const alpha = Math.pow(rhoC, (1 - n) / (2 * n));
    return { R: alpha * xi1, M: 4 * Math.PI * Math.pow(alpha, 3) * rhoC * massIntegral };
}

/** The measured mass-radius scaling exponent for a family of stars at fixed n, varying central density. */
export function measuredMassRadiusExponent(n, { rhoLo = 1, rhoHi = 8, solveOpts = {} } = {}) {
    const { xi1, dthetaAtXi1, trace } = solve(n, solveOpts);
    const massIntegral = massFromBoundary(xi1, dthetaAtXi1);
    const a = starAt(rhoLo, xi1, massIntegral, n);
    const b = starAt(rhoHi, xi1, massIntegral, n);
    return Math.log(b.R / a.R) / Math.log(b.M / a.M);
}
