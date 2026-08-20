// WebGLEngine/physics/blackhole/probe.js -- v2875
//
// A PROBE ON A TIMELIKE GEODESIC: what a released instrument orbits, what it sees, and where it stops orbiting.
//
// geodesic.js already carries the LIGHT case -- null geodesics, the 1919 deflection 4M/b, the shadow at
// 3*sqrt(3)*M. This is the MATTER case, and it completes it. The two obey almost the same equation:
//
//     photon    d2u/dphi2 + u =           3 M u^2
//     probe     d2u/dphi2 + u = M/L^2  +  3 M u^2
//
// with u = 1/r. The ONLY difference is the Newtonian term M/L^2, and setting it to zero must reproduce the
// photon module EXACTLY -- which is a cross-instrument check this module can make against code it did not write.
// Everything relativistic lives in that 3 M u^2: delete it and you get a closed Kepler ellipse, keep it and the
// ellipse turns.
//
// THE EXACT KEYS, none of which is fed to the integrator:
//   PERIHELION PRECESSION   6 pi M / (a(1-e^2)) per orbit -- the 1915 result, 43 arcsec/century for Mercury.
//                           MEASURED here by finding successive perihelia in an integrated orbit; the detector
//                           knows no formula, it just looks for where r is smallest.
//   ISCO at r = 6M          the innermost stable circular orbit. Above it circular orbits are stable, below it
//                           they are not, and the boundary is exact.
//   L_isco = 2*sqrt(3)*M    the angular momentum at that orbit -- below it, no stable circular orbit EXISTS.
//   KEPLER III, EXACTLY     Omega = sqrt(M/r^3) for a circular orbit is EXACT in Schwarzschild, not approximate.
//                           A pleasing fact: the Newtonian relation survives unchanged in coordinate time.
//   GRAVITATIONAL REDSHIFT  1/sqrt(1-2M/r) for a static observer -- diverges at the horizon, which is the
//                           statement that the horizon is where the outside stops receiving anything.
//
// SCOPE: Schwarzschild, equatorial, G = c = 1, geometric units where a mass M has length M. Kerr probes would
// need frame dragging and are a separate instrument; kerr.js has the algebra but not the trajectories.
"use strict";

export const horizon = (M) => 2 * M;
export const iscoRadius = (M) => 6 * M;
export const iscoAngularMomentum = (M) => 2 * Math.sqrt(3) * M;
export const photonSphere = (M) => 3 * M;

/** Coordinate angular velocity of a circular orbit. EXACT in Schwarzschild -- Kepler III, unmodified. */
export const circularOmega = (M, r) => Math.sqrt(M / (r * r * r));

/** Coordinate period of a circular orbit: 2 pi sqrt(r^3 / M). Also exactly Keplerian. */
export const circularPeriod = (M, r) => 2 * Math.PI * Math.sqrt((r * r * r) / M);

/**
 * Gravitational redshift for a STATIC observer at r, relative to infinity: 1 + z = 1/sqrt(1 - 2M/r).
 * Returns Infinity at the horizon and NaN inside it -- a static observer cannot exist there, and saying NaN is
 * more honest than returning a number for an observer who cannot be standing still.
 */
export function redshift(M, r) {
    const f = 1 - 2 * M / r;
    if (f <= 0) return r <= 2 * M ? (r === 2 * M ? Infinity : NaN) : NaN;
    return 1 / Math.sqrt(f) - 1;
}

/** dtau/dt for a static observer: the rate a clock down there runs, seen from infinity. */
export function timeDilation(M, r) {
    const f = 1 - 2 * M / r;
    return f > 0 ? Math.sqrt(f) : (f === 0 ? 0 : NaN);
}

/** Angular momentum per unit mass for a circular orbit at r. Real only for r > 3M (the photon sphere). */
export function circularL(M, r) {
    const d = r - 3 * M;
    if (d <= 0) return NaN;
    return r * Math.sqrt(M / d);
}

/** Energy per unit mass for a circular orbit at r. */
export function circularE(M, r) {
    const d = r - 3 * M;
    if (d <= 0) return NaN;
    return (1 - 2 * M / r) / Math.sqrt(1 - 3 * M / r);
}

/** Is a circular orbit at r STABLE? True above the ISCO, false below. The boundary is exactly 6M. */
export const isStableCircular = (M, r) => r > 6 * M;

/**
 * Integrate the orbit u(phi) with RK4 on d2u/dphi2 = -u + M/L^2 + 3 M u^2.
 *
 * newtonian:true drops the 3 M u^2 term -- the LOAD-BEARING NEGATIVE. Without it the orbit must close exactly,
 * so any precession the integrator reports in that mode is the integrator lying rather than physics. The Kepler
 * instrument makes the same move with its apsidal-angle check.
 */
export function traceOrbit(M, L, u0, du0, { dphi = 1e-4, maxPhi = 200 * Math.PI, newtonian = false } = {}) {
    const gr = newtonian ? 0 : 1;
    const acc = (u) => -u + M / (L * L) + gr * 3 * M * u * u;
    let u = u0, du = du0, phi = 0;
    const perihelia = [];          // phi at each maximum of u (minimum of r)
    let prevU = u, prevDu = du;
    let captured = false;
    const uHorizon = 1 / (2 * M);
    let steps = 0;
    while (phi < maxPhi) {
        // RK4 on the pair (u, du)
        const k1u = du, k1d = acc(u);
        const k2u = du + 0.5 * dphi * k1d, k2d = acc(u + 0.5 * dphi * k1u);
        const k3u = du + 0.5 * dphi * k2d, k3d = acc(u + 0.5 * dphi * k2u);
        const k4u = du + dphi * k3d, k4d = acc(u + dphi * k3u);
        u += (dphi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
        du += (dphi / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
        phi += dphi;
        steps++;
        if (u >= uHorizon) { captured = true; break; }        // crossed the horizon: it is not coming back
        if (u <= 1e-12) break;                                 // escaped to infinity
        // a perihelion is where du changes + -> -, refined by linear interpolation on du
        if (prevDu > 0 && du <= 0) {
            const t = prevDu / (prevDu - du);
            perihelia.push(phi - dphi + t * dphi);
        }
        prevU = u; prevDu = du;
    }
    return { perihelia, captured, phiEnd: phi, uEnd: u, rEnd: u > 0 ? 1 / u : Infinity, steps };
}

/**
 * MEASURE the perihelion advance per orbit from an integrated trajectory.
 * The detector knows no formula -- it finds successive minima of r and asks how much more than 2 pi the angle
 * between them was.
 */
export function measuredPrecession(M, a, e, opts = {}) {
    const p = a * (1 - e * e);                 // semi-latus rectum
    const L = Math.sqrt(M * p);                // Newtonian L for that orbit; the GR term perturbs the path, not L
    const u0 = (1 + e) / p;                    // start AT perihelion: u maximal, du = 0
    const r = traceOrbit(M, L, u0, 0, { maxPhi: 40 * Math.PI, ...opts });
    if (r.perihelia.length < 2) return { ok: false, reason: "fewer than two perihelia found", ...r };
    const gaps = [];
    for (let i = 1; i < r.perihelia.length; i++) gaps.push(r.perihelia[i] - r.perihelia[i - 1]);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    return { ok: true, perOrbit: mean - 2 * Math.PI, gaps, orbits: gaps.length, L, p, captured: r.captured };
}

/** The closed form: 6 pi M / (a(1-e^2)) radians per orbit, to first order in M/p. */
export const precessionExact = (M, a, e) => (6 * Math.PI * M) / (a * (1 - e * e));

/**
 * Arcseconds per century, given an orbital period in days. This is the number that made the 1915 paper famous,
 * and it is pure unit conversion on top of the geometry above -- no new physics.
 */
export function arcsecPerCentury(radPerOrbit, periodDays) {
    const orbitsPerCentury = (365.25 * 100) / periodDays;
    return radPerOrbit * orbitsPerCentury * (180 / Math.PI) * 3600;
}

/**
 * Release a probe and let it fall INWARD. Returns whether it plunges through the horizon and the proper-time
 * cost. A probe with L below 2*sqrt(3)*M has no stable circular orbit available to it at any radius.
 */
export function plunges(M, L) { return L < iscoAngularMomentum(M); }

/**
 * Proper time to fall radially from rest at r0 to the horizon: (pi/2) * sqrt(r0^3 / (2M)) ... for the full fall
 * to r=0 it is (pi/2) sqrt(r0^3/(2M)). To the HORIZON it is the same integral truncated. Closed form for the
 * fall from rest at r0 all the way to r=0 -- FINITE, which is the whole point: the infalling clock records a
 * finite interval while a distant observer never sees the crossing at all.
 */
export function properTimeToCentre(M, r0) {
    if (!(r0 > 0) || !(M > 0)) return NaN;
    return (Math.PI / 2) * Math.sqrt((r0 * r0 * r0) / (2 * M));
}

// ---- TELEMETRY: what the probe actually SENDS BACK ---------------------------------------------------------------
//
// Everything above computes trajectories. None of it produced a READING -- the probe flew and reported nothing.
// This is the instrument half: fly the geodesic and record, at every step, what an onboard clock and an onboard
// spectrometer would say.
//
// AND THERE IS AN EXACT KEY WAITING IN IT, DISTINCT FROM THE ONE ALREADY HERE. timeDilation() above is for a
// STATIC observer holding station: dtau/dt = sqrt(1 - 2M/r). A probe in a CIRCULAR ORBIT at the same radius runs
// SLOWER STILL:
//
//     dtau/dt = sqrt(1 - 3M/r)      <- orbiting
//     dtau/dt = sqrt(1 - 2M/r)      <- held still at the same r
//
// TWO instead of THREE, and the difference is the orbital motion: the orbiting clock loses time to its speed as
// well as to the depth. At r = 3M the orbital factor reaches ZERO -- that is the photon sphere, where holding a
// circular orbit would require light speed, and a massive probe cannot.

/** dtau/dt for a probe in a CIRCULAR orbit at r. Exactly sqrt(1 - 3M/r); zero at the photon sphere. */
export function orbitalTimeDilation(M, r) {
    const f = 1 - 3 * M / r;
    return f > 0 ? Math.sqrt(f) : (f === 0 ? 0 : NaN);
}

/** Energy per unit mass for an orbit released at turning point r0 with angular momentum L. */
export function energyOf(M, L, r0) {
    const f = 1 - 2 * M / r0;
    return Math.sqrt(f * (1 + (L * L) / (r0 * r0)));
}

/**
 * FLY IT AND RECORD. Integrates u(phi) together with proper time tau and coordinate time t, so the telemetry is
 * a real log rather than a formula evaluated at sample points.
 *
 *     dtau/dphi = r^2 / L
 *     dt/dphi   = E r^2 / (L (1 - 2M/r))
 *
 * @returns {{samples: Array, captured: boolean, tau: number, t: number, turns: number}}
 */
export function flyProbe(M, { r0 = 20, L = null, turns = 2, dphi = 2e-4, sampleEvery = 40 } = {}) {
    const Luse = L == null ? circularL(M, r0) : L;
    if (!Number.isFinite(Luse)) return { samples: [], captured: false, tau: 0, t: 0, turns: 0, error: "no orbit at that radius" };
    const E = energyOf(M, Luse, r0);
    const acc = (u) => -u + M / (Luse * Luse) + 3 * M * u * u;
    let u = 1 / r0, du = 0, phi = 0, tau = 0, tCoord = 0, n = 0;
    const uH = 1 / (2 * M);
    const samples = [];
    const maxPhi = turns * 2 * Math.PI;
    while (phi < maxPhi) {
        const r = 1 / u;
        const f = 1 - 2 * M / r;
        // record BEFORE stepping, so the first sample is the release condition
        if (n % sampleEvery === 0) {
            samples.push({
                phi, r, tau, t: tCoord,
                redshift: f > 0 ? 1 / Math.sqrt(f) - 1 : Infinity,   // as seen from infinity, static-equivalent
                rate: tCoord > 0 ? tau / tCoord : 1,                  // cumulative dtau/dt the probe has logged
            });
        }
        const k1u = du, k1d = acc(u);
        const k2u = du + 0.5 * dphi * k1d, k2d = acc(u + 0.5 * dphi * k1u);
        const k3u = du + 0.5 * dphi * k2d, k3d = acc(u + 0.5 * dphi * k2u);
        const k4u = du + dphi * k3d, k4d = acc(u + dphi * k3u);
        u += (dphi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
        du += (dphi / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
        const rNew = 1 / u, fNew = 1 - 2 * M / rNew;
        tau += dphi * (rNew * rNew) / Luse;
        if (fNew > 0) tCoord += dphi * (E * rNew * rNew) / (Luse * fNew);
        phi += dphi; n++;
        if (u >= uH) return { samples, captured: true, tau, t: tCoord, turns: phi / (2 * Math.PI), L: Luse, E };
        if (u <= 1e-12) break;
    }
    return { samples, captured: false, tau, t: tCoord, turns: phi / (2 * Math.PI), L: Luse, E,
             meanRate: tCoord > 0 ? tau / tCoord : NaN };
}
