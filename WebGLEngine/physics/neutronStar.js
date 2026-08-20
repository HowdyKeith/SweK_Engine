// physics/neutronStar.js
//
// A neutron star, with real documented specs and nothing invented. It is a compact object -- the same relativistic
// gravity the black hole uses -- but it has a SURFACE instead of an event horizon, and where that surface sits relative
// to the relativistic special radii is the whole story. For the canonical 1.4-solar-mass, 11-km neutron star the numbers
// come out exactly as the literature has them: a Schwarzschild radius near 4 km, a compactness of about 0.2 (a fifth of
// the way to a black hole), an innermost stable circular orbit that sits JUST outside the surface, and a photon sphere
// that sits INSIDE it -- meaning a 1.4 M-sun neutron star is not quite compact enough to have a photon sphere in vacuum.
// Its maximum mass (the TOV limit) is real but equation-of-state-dependent, observed near 2.2-2.3 M-sun; we do not
// pretend to compute it from first principles, because honestly nobody can yet.
//
// GM_sun/c^2 = 1.4766 km is the one measured constant; everything else is arithmetic on it. Pure, deterministic.
import { schwarzschildRadius as bhRs, accel as bhAccel, circularSpeed as bhVc, makeParticle as bhMake } from "./blackHole.js";

export const GM_SUN_OVER_C2_KM = 1.4766;   // km per solar mass -- the compactness scale

export function schwarzschildRadiusKm(M) { return 2 * GM_SUN_OVER_C2_KM * M; }       // event-horizon radius (km)
export function compactness(M, R) { return GM_SUN_OVER_C2_KM * M / R; }              // GM/(Rc^2) = rs/(2R); BH horizon = 0.5
export function iscoKm(M) { return 6 * GM_SUN_OVER_C2_KM * M; }                       // innermost stable circular orbit = 3 rs
export function photonSphereKm(M) { return 3 * GM_SUN_OVER_C2_KM * M; }               // 1.5 rs
export function iscoOutsideSurface(M, R) { return iscoKm(M) > R; }                    // true for a canonical NS
export function photonSphereOutsideSurface(M, R) { return photonSphereKm(M) > R; }   // false for a canonical NS
export function escapeFraction(M, R) { return Math.sqrt(2 * compactness(M, R)); }     // v_esc / c at the surface

// Orbit around the neutron star, in geometric units where the Schwarzschild radius is 2 (matching blackHole.js). The
// surface sits at Rgeom = 2 * R/rs. A particle that drops below the surface IMPACTS it -- it does not vanish through a
// horizon, because a neutron star has a solid surface.
export function surfaceGeom(M, R) { return 2 * R / schwarzschildRadiusKm(M); }        // surface radius in rs=2 units

export function makeOrbit(rGeom, vFactor) { return { ...bhMake(rGeom, 1), r: [rGeom, 0], v: [0, vFactor * bhVc(rGeom, 1, 1, 2)], impacted: false, rMin: rGeom, t: 0 }; }

export function stepOrbit(p, dt, surface) {
    if (p.impacted) return p;
    const a0 = bhAccel(p.r, 1, 1, 2);
    p.r[0] += p.v[0] * dt + 0.5 * a0[0] * dt * dt;
    p.r[1] += p.v[1] * dt + 0.5 * a0[1] * dt * dt;
    const a1 = bhAccel(p.r, 1, 1, 2);
    p.v[0] += 0.5 * (a0[0] + a1[0]) * dt;
    p.v[1] += 0.5 * (a0[1] + a1[1]) * dt;
    p.t += dt;
    const rr = Math.sqrt(p.r[0] * p.r[0] + p.r[1] * p.r[1]);
    if (rr < p.rMin) p.rMin = rr;
    if (rr <= surface) p.impacted = true;   // hits the surface, not a horizon
    return p;
}
