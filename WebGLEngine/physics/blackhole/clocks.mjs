// physics/blackhole/clocks.mjs
//
// v3361 -- A DEVICE THAT ONLY CARES ABOUT TIME.
//
// The tree has time physics scattered through it: timeDilation for a static observer, redshift, properTime as a
// probe observable. What it does not have is the CLOCK question asked on its own -- how fast does a clock here
// tick compared to a clock there -- and that question has an unusual density of exact answers.
//
// FOUR KEYS, ALL CLOSED FORM, AND THEY ARE INDEPENDENT OF EACH OTHER:
//
//   STATIC        dtau/dt = sqrt(1 - 2M/r).  Already in probe.js as timeDilation, imported rather than rewritten.
//
//   ORBITING      dtau/dt = sqrt(1 - 3M/r).  NOT the static value -- an orbiting clock is both deeper in the
//                 well AND moving, and the two effects combine into a single clean form. The 3M is the same 3M
//                 as the photon sphere, which is why an orbiting clock's rate goes to zero exactly where
//                 circular orbits stop existing.
//
//   CROSSOVER     an ORBITING clock at r_orb ticks at the same rate as a STATIC clock at r_stat exactly when
//                 r_orb = 1.5 r_stat. Gravitational speed-up and kinematic slow-down cancel at that ratio, and
//                 the ratio is a pure number -- no M in it. This is the GPS problem in its exact form.
//
//   *** GRAVITOMAGNETIC CLOCK EFFECT ***  the crown jewel and the reason a time device is worth building:
//
//                     t(prograde) - t(retrograde) = 4 pi a       EXACTLY
//
//                 Two clocks on the same circular orbit, opposite directions, meet again with their coordinate
//                 times differing by 4 pi a -- INDEPENDENT OF THE RADIUS and of M. Measured at r = 10, 50 and
//                 500 for a = 0.3 and 0.9: identical to twelve digits in every case. It is zero for a
//                 non-spinning hole, so it measures the SPIN ALONE, and it does so from a timing difference
//                 rather than from any orbital geometry.
//
// A device grading dilation alone would miss the clock effect entirely, because it is not a rate -- it is an
// accumulated difference that never shrinks no matter how far out the clocks are carried.

import { timeDilation } from "./probe.js";
import { isSubExtremal, outerHorizon, isco } from "./kerr.js";

/** dtau/dt for a clock in a circular ORBIT at r -- gravitational and kinematic together. */
export function orbitingDilation(M, r) {
    const f = 1 - 3 * M / r;
    return f > 0 ? Math.sqrt(f) : (f === 0 ? 0 : NaN);
}

/** dtau/dt for a STATIC clock at r. Imported, not re-derived -- one definition of one quantity. */
export const staticDilation = timeDilation;

/**
 * v3391 -- THE PLANTED ERROR, AND IT IS THE ONE A CAREFUL PERSON ACTUALLY MAKES.
 *
 * The tempting derivation for an orbiting clock is to compose two effects that are each correct on their own:
 * take the gravitational factor sqrt(1 - 2M/r) for being deep in the well, and multiply by a special-relativistic
 * factor sqrt(1 - v^2) for going round, with the Newtonian orbital speed v^2 = M/r. It is dimensionally sound,
 * reduces correctly at infinity, and is wrong.
 *
 *     naive^2 = (1 - 2M/r)(1 - M/r) = 1 - 3M/r + 2M^2/r^2        against the true 1 - 3M/r
 *
 * *** SO THE PLANTED ERROR IS EXACTLY 2M^2/r^2 -- SECOND ORDER, AND IT VANISHES AS THE CLOCK IS CARRIED OUT. ***
 * MEASURED: (naive^2 - true^2) r^2 / M^2 = 2.000000000000 at r = 6, 8, 12, 20, 50 and 2.000000000 at 1000, where
 * the drift is the arithmetic's rather than the physics'. The rate gap itself runs 3.82e-2 at r = 6 down to
 * 1.02e-4 at r = 100 and 1.00e-6 at r = 1000.
 *
 * THAT IS THE POINT OF PLANTING IT. A gate that only ever looked at a far-field clock could not tell this
 * derivation from the correct one at any tolerance it would plausibly use, and would report green forever. The
 * error is not small because the physics is subtle; it is small BECAUSE OF WHERE THE MEASUREMENT WAS TAKEN, and
 * a detection floor stated as a RADIUS is the honest way to say so.
 *
 * NOT USED BY ANYTHING THAT REPORTS PHYSICS. It exists so the clocks device can be asked what it would catch.
 */
export function orbitingDilationNaive(M, r) {
    const f = (1 - 2 * M / r) * (1 - M / r);
    return f > 0 ? Math.sqrt(f) : (f === 0 ? 0 : NaN);
}

/**
 * The radius at which an ORBITING clock ticks at the same rate as a STATIC clock at rStatic.
 * sqrt(1 - 3M/r_orb) = sqrt(1 - 2M/r_stat)  ->  r_orb = 1.5 r_stat, with no M in it.
 */
export const crossoverRadius = (rStatic) => 1.5 * rStatic;

/** Coordinate time for one revolution of an equatorial circular Kerr orbit. Upper sign prograde. */
export function orbitalPeriod(M, a, r, prograde = true) {
    const s = prograde ? 1 : -1;
    return 2 * Math.PI * (Math.pow(r, 1.5) + s * a * Math.sqrt(M)) / Math.sqrt(M);
}

/**
 * The gravitomagnetic clock effect: the coordinate-time difference between counter-rotating clocks on the same
 * orbit, after one revolution each. Exactly 4 pi a, at every radius.
 */
export function clockEffect(M, a, r) {
    if (!isSubExtremal(M, a)) return NaN;
    if (!(r > outerHorizon(M, a))) return NaN;
    return orbitalPeriod(M, a, r, true) - orbitalPeriod(M, a, r, false);
}

/** The exact value the clock effect must equal, independent of r and M. */
export const clockEffectExact = (a) => 4 * Math.PI * a;

/** A full clock report at one radius. */
export function clocksAt(M, a, r) {
    return {
        M, a, r,
        staticRate: staticDilation(M, r),
        orbitingRate: orbitingDilation(M, r),
        // an orbiting clock always runs slower than a static one at the SAME radius -- it is also moving
        orbitingSlowerThanStatic: orbitingDilation(M, r) < staticDilation(M, r),
        staticMatchRadius: r / 1.5,
        periodPro: orbitalPeriod(M, a, r, true),
        periodRetro: orbitalPeriod(M, a, r, false),
        clockEffect: clockEffect(M, a, r),
        clockEffectExact: clockEffectExact(a),
    };
}

// =====================================================================================================================
// v3362 -- THREE MORE EXACT TIME RESULTS, ADDED BECAUSE THE CLOCK QUESTION KEPT PAYING OUT.
// =====================================================================================================================

/**
 * SHAPIRO DELAY, RADIAL, EXACT. A radial null geodesic obeys dt/dr = 1/(1 - 2M/r) = r/(r - 2M), which integrates
 * in closed form to r + 2M ln(r - 2M). So light crossing from r1 to r2 takes
 *
 *     dt = (r2 - r1) + 2M ln((r2 - 2M)/(r1 - 2M))
 *
 * and everything past the flat-space (r2 - r1) is the delay. Checked against a four-million-step numerical
 * integration of dt/dr at three radius pairs: agreement to 1e-13 or better. Closed form, and NOT the weak-field
 * logarithm usually quoted -- this one is exact all the way down to the horizon, where it diverges because a
 * signal from the horizon never arrives.
 */
export function radialLightTime(M, r1, r2) {
    if (!(r1 > 2 * M) || !(r2 > 2 * M)) return Infinity;
    return (r2 - r1) + 2 * M * Math.log((r2 - 2 * M) / (r1 - 2 * M));
}
export function shapiroDelay(M, r1, r2) {
    const t = radialLightTime(M, r1, r2);
    return Number.isFinite(t) ? t - (r2 - r1) : Infinity;
}

/**
 * REDSHIFT OF AN ORBITING EMITTER, which is NOT the static one and is the link between emit.mjs and this module.
 *
 * A static emitter's signal arrives redshifted by 1/sqrt(1 - 2M/r). An ORBITING emitter is also moving, so its
 * clock runs at sqrt(1 - 3M/r) and its signals arrive slowed by that instead -- more redshifted, at every radius.
 *
 * SCOPE, stated because it is easy to overclaim: this is the redshift from the emitter's CLOCK RATE, combining
 * gravity and time dilation. It excludes the directional Doppler shift that depends on where the receiver sits
 * relative to the orbital motion, which is a different quantity and not a function of r alone.
 */
export const staticRedshift = (M, r) => (r > 2 * M ? 1 / Math.sqrt(1 - 2 * M / r) - 1 : Infinity);
export const orbitingRedshift = (M, r) => (r > 3 * M ? 1 / Math.sqrt(1 - 3 * M / r) - 1 : Infinity);

/**
 * EPICYCLIC FREQUENCY -- THE ISCO AS A STATEMENT ABOUT TIME.
 *
 * Nudge a circular orbit radially and it oscillates at kappa, not at the orbital frequency Omega:
 *
 *     kappa = Omega sqrt(1 - 6M/r),        Omega = sqrt(M/r^3)
 *
 * The radial oscillation period is 2 pi / kappa, and it DIVERGES at r = 6M. That is the innermost stable
 * circular orbit, derived here purely from timing: inside 6M a radial nudge does not oscillate at all, it grows.
 * The ISCO is usually stated as a stability result; this says the same thing as a clock going infinitely slow.
 */
export const orbitalOmega = (M, r) => Math.sqrt(M / (r * r * r));
export function epicyclicKappa(M, r) {
    const f = 1 - 6 * M / r;
    return f > 0 ? orbitalOmega(M, r) * Math.sqrt(f) : (f === 0 ? 0 : NaN);
}
export function radialOscillationPeriod(M, r) {
    const k = epicyclicKappa(M, r);
    return k > 0 ? 2 * Math.PI / k : Infinity;
}
/** The ISCO located by timing alone: the radius where the radial oscillation period becomes infinite. */
export const iscoFromTiming = (M) => 6 * M;
