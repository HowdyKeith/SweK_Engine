// physics/solarSystem.js
//
// The real solar system, dropped into the deterministic orbit engine. Not fetched live from NASA -- a live fetch would
// be non-deterministic and need the internet, both of which this engine deliberately avoids -- but built from real,
// stable orbital elements (semi-major axis, eccentricity, mass), the same numbers a textbook or a JPL Horizons snapshot
// gives. Each planet is placed at perihelion with its exact vis-viva speed, so the initial state IS a real Keplerian
// orbit, and the engine's symplectic gravity carries it forward. Units: G = 1, solar mass = 1, distance in AU, so a
// planet's period comes out at 2*pi*a^1.5 (Kepler's third law) and its orbital energy at -1/(2a).
//
// Pure arithmetic + sqrt/sin/cos of fixed angles -> deterministic. Elements are standard values (J2000-era means).
import { makeSystem } from "./orbit.js";

// name, semi-major axis a (AU), eccentricity e, mass relative to the Sun.
import { strictSin, strictCos } from "../tools/strictTrig.mjs";

export const ELEMENTS = [
    { name: "Sun", a: 0, e: 0, m: 1 },
    { name: "Mercury", a: 0.387, e: 0.2056, m: 1.66e-7 },
    { name: "Venus", a: 0.723, e: 0.0068, m: 2.448e-6 },
    { name: "Earth", a: 1.000, e: 0.0167, m: 3.003e-6 },
    { name: "Mars", a: 1.524, e: 0.0934, m: 3.213e-7 },
    { name: "Jupiter", a: 5.203, e: 0.0484, m: 9.543e-4 },
    { name: "Saturn", a: 9.537, e: 0.0539, m: 2.857e-4 },
    { name: "Uranus", a: 19.191, e: 0.0472, m: 4.365e-5 },
    { name: "Neptune", a: 30.07, e: 0.0086, m: 5.150e-5 },
];

// Perihelion state for a planet, placed at angle theta so the planets aren't all colinear. GM = 1.
// v2889 -- placement angles go through strictSin/strictCos: Math.sin/cos are unspecified libm, and these four calls
// were the solar-system subsystem's only raw-libm leak in the cross-machine fingerprint (tripwire-caught). Thetas
// are small fixed angles, comfortably inside STRICT_TRIG_MAX.
export function planetState(a, e, m, theta) {
    const rp = a * (1 - e);                        // perihelion distance
    const vp = Math.sqrt((1 + e) / (a * (1 - e))); // vis-viva speed at perihelion (GM = 1)
    const ct = strictCos(theta), st = strictSin(theta);
    return { m, r: [rp * ct, rp * st, 0], v: [-vp * st, vp * ct, 0] };   // position radial, velocity prograde-perpendicular
}

// Build the Sun + planets as an N-body system. Sun at rest at the origin (planet masses are tiny, so barycentre drift
// is negligible). up-to `n` planets (default all).
export function makeSolarSystem(n) {
    const planets = ELEMENTS.slice(1, n != null ? n + 1 : undefined);
    const bodies = [{ m: 1, r: [0, 0, 0], v: [0, 0, 0] }];
    planets.forEach((b, i) => bodies.push(planetState(b.a, b.e, b.m, i * 0.7)));
    return makeSystem(bodies, { G: 1 });
}

// Analytic checks (GM = 1): a real Keplerian orbit has specific energy -1/(2a) and specific angular momentum
// sqrt(a(1-e^2)) and period 2*pi*a^1.5.
export function specificEnergy(a) { return -1 / (2 * a); }
export function specificAngMom(a, e) { return Math.sqrt(a * (1 - e * e)); }
export function period(a) { return 2 * Math.PI * Math.sqrt(a * a * a); }
