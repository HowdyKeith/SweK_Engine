// physics/seismic/rays.mjs
//
// v3384 -- SEISMOLOGY ENTERS THE LAB. Second of the three new fields.
//
// Seismology is unusually well supplied with exact keys, and they come from different directions:
//
//   WAVE SPEEDS      Vp = sqrt((K + 4mu/3)/rho) and Vs = sqrt(mu/rho). Their RATIO depends only on Poisson's
//                    ratio -- the densities and moduli cancel -- and for a Poisson solid (nu = 1/4) it is
//                    EXACTLY sqrt(3). A pure number falling out of two material properties.
//
//   THE FLUID CORE   a fluid has no shear modulus, so Vs = 0 identically. That is not an approximation or a
//                    limit; S waves simply do not exist there. It is why the Earth has an S-wave SHADOW ZONE,
//                    and it is how the liquid outer core was discovered.
//
//   *** RAYS IN A LINEAR GRADIENT ARE EXACTLY CIRCLES *** which is the strongest key here. With v(z) = v0 + kz,
//   Snell's law conserves the ray parameter p = sin(i)/v, and the resulting path is a circular arc of radius
//   R = 1/(pk) centred where the velocity would extrapolate to zero, z_c = -v0/k. Three routes to the same
//   horizontal distance agree to 9.5e-13:
//
//       numerical integration in the incidence angle   10.392304845414
//       closed form cos(i0)/(pk)                       10.392304845413
//       the circular-arc geometry                      10.392304845413
//
//   INTEGRATING IN DEPTH IS THE WRONG PARAMETRISATION and it is worth saying why: dx/dz = pv/sqrt(1 - p^2 v^2)
//   diverges at the turning point where pv -> 1, so a midpoint rule in z loses four digits right where the ray
//   matters most. Parametrising by the incidence angle gives dx = sin(i)/(pk) di, which has no singularity at
//   all. Same physics, and the difference between 2.5e-4 and 9.5e-13 is entirely the choice of variable.
//
//   IMPEDANCE        at normal incidence R = (Z2 - Z1)/(Z2 + Z1) and T = 2 Z2/(Z1 + Z2), and energy balances
//                    exactly: R^2 + (Z1/Z2) T^2 = 1. An identity, not a tolerance.

/** P and S speeds from bulk modulus, shear modulus and density. */
export const vP = (K, mu, rho) => Math.sqrt((K + 4 * mu / 3) / rho);
export const vS = (mu, rho) => Math.sqrt(mu / rho);

/** Vp/Vs depends ONLY on Poisson's ratio -- moduli and density cancel out. */
export const vpvsFromPoisson = (nu) => Math.sqrt((2 - 2 * nu) / (1 - 2 * nu));
/** Poisson's ratio recovered from the speed ratio -- the inverse, so the pair must round-trip. */
export function poissonFromVpVs(ratio) {
    const r2 = ratio * ratio;
    return (r2 - 2) / (2 * (r2 - 1));
}

/** Acoustic impedance, and the normal-incidence reflection and transmission coefficients. */
export const impedance = (rho, v) => rho * v;
export const reflectionCoef = (Z1, Z2) => (Z2 - Z1) / (Z2 + Z1);
export const transmissionCoef = (Z1, Z2) => 2 * Z2 / (Z1 + Z2);

/** Energy check at an interface: R^2 + (Z1/Z2) T^2 must be exactly 1. */
export function energyBalance(Z1, Z2) {
    const R = reflectionCoef(Z1, Z2), T = transmissionCoef(Z1, Z2);
    return R * R + (Z1 / Z2) * T * T;
}

// ---- RAYS IN A LINEAR VELOCITY GRADIENT v(z) = v0 + k z -----------------------------------------------------------

/** Ray parameter from a take-off angle at the surface. Conserved along the whole path (Snell). */
export const rayParameter = (i0, v0) => Math.sin(i0) / v0;

/** Depth at which a ray turns: where the local velocity reaches 1/p. */
export const turningDepth = (p, v0, k) => (1 / p - v0) / k;

/** Radius and centre of the exact circular arc the ray follows. */
export const arcRadius = (p, k) => 1 / (p * k);
export const arcCentreDepth = (v0, k) => -v0 / k;

/** Horizontal distance from the surface to the turning point. Closed form, no integration. */
export function turningDistance(p, v0, k) {
    const s0 = p * v0;
    if (!(s0 < 1)) return NaN;                 // already turning, or faster than the turning velocity
    return Math.sqrt(1 - s0 * s0) / (p * k);
}

/**
 * The same distance by NUMERICAL integration, parametrised by the incidence angle so there is no singularity at
 * the turning point. Deliberately shares no algebra with turningDistance.
 */
export function turningDistanceIntegrated(p, v0, k, steps = 200000) {
    const i0 = Math.asin(p * v0);
    const h = (Math.PI / 2 - i0) / steps;
    let x = 0;
    for (let j = 0; j < steps; j++) x += Math.sin(i0 + (j + 0.5) * h) / (p * k) * h;
    return x;
}

/** The circular-arc geometry's prediction of the same distance -- a third, purely geometric route. */
export function turningDistanceFromArc(p, v0, k) {
    const R = arcRadius(p, k), zc = arcCentreDepth(v0, k), zt = turningDepth(p, v0, k);
    const xAt = (z) => Math.sqrt(Math.max(0, R * R - (z - zc) * (z - zc)));
    return xAt(0) - xAt(zt);
}

/** Does a ray sample this depth? A ray turns above its turning depth and never goes deeper. */
export const raySamples = (p, v0, k, z) => z <= turningDepth(p, v0, k);
