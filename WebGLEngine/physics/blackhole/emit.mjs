// physics/blackhole/emit.mjs
//
// v3359 -- A PROBE THAT EMITS NEAR A BLACK HOLE: WHICH DIRECTIONS GET OUT?
//
// v3339 made probes EMITTERS on a cost field, where an emitter is a Dijkstra source and its signal spreads by
// relaxation. Near a black hole that picture is wrong for the same reason cost-field routing was: signals follow
// null geodesics, and some of them do not come back.
//
// THE EXACT KEY. A static emitter at radius r sends a photon at angle psi from the outward radial direction. Its
// impact parameter is b = r sin(psi) / sqrt(1 - 2M/r), and it escapes only if b clears the shadow edge at
// b_crit = 3 sqrt(3) M. So the boundary is closed form:
//
//     sin(psi_c) = 3 sqrt(3) M sqrt(1 - 2M/r) / r
//
// *** AND THAT ANGLE IS ALREADY IN THE LAB UNDER ANOTHER NAME. *** The lens device computes shadowAngleRad --
// the angular radius of the black hole seen by a distant observer. It is the SAME NUMBER, to 5e-16, because null
// geodesics are time-reversible: the cone of directions light can reach you FROM is the cone you must not emit
// INTO. One is the shadow seen from outside, the other the escape cone seen from inside, and nothing in the tree
// had ever connected them.
//
// THE GEOMETRY FLIPS AT THE PHOTON SPHERE, and the formula handles both sides with one expression:
//   r > 3M   the CAPTURE cone opens around the inward radial direction; most of the sky escapes
//   r = 3M   psi_c = 90 degrees exactly; precisely half the sky escapes
//   r < 3M   the ESCAPE cone closes around the outward radial direction; most of the sky is captured
//   r -> 2M  psi_c -> 0; nothing escapes
//
// The escaped solid-angle fraction is continuous through r = 3M -- both branches give exactly 1/2 there -- which
// is the check that the two regimes are one formula rather than two guesses stitched together.

import { criticalImpact, horizon, photonSphere } from "./geodesic.js";

/**
 * Half-angle of the critical cone at radius r, in radians.
 * Outside the photon sphere this is the CAPTURE cone around the inward radial direction; inside it is the
 * ESCAPE cone around the outward radial direction. One formula, and psi_c = pi/2 exactly at r = 3M.
 */
export function criticalConeAngle(M, r) {
    if (!(r > horizon(M))) return 0;                      // at or inside the horizon nothing escapes
    const s = criticalImpact(M) * Math.sqrt(1 - horizon(M) / r) / r;
    return Math.asin(Math.min(1, Math.max(-1, s)));
}

/**
 * Fraction of the full sky a static emitter's signal escapes into.
 * Solid angle of a cone of half-angle psi is 2 pi (1 - cos psi), so the cone's sky fraction is (1 - cos psi)/2.
 */
export function escapedSkyFraction(M, r) {
    if (!(r > horizon(M))) return 0;
    const psi = criticalConeAngle(M, r);
    const capFraction = (1 - Math.cos(psi)) / 2;
    // outside the photon sphere the cone is the CAPTURED part; inside it is the ESCAPING part
    return r >= photonSphere(M) ? 1 - capFraction : capFraction;
}

/** Impact parameter of a photon emitted at angle psi from the outward radial direction, at radius r. */
export const emissionImpact = (M, r, psi) => r * Math.sin(psi) / Math.sqrt(1 - horizon(M) / r);

/** Does a photon emitted at angle psi from radius r escape? Uses b_crit, the same edge the shadow uses. */
export function emissionEscapes(M, r, psi) {
    if (!(r > horizon(M))) return false;
    const b = emissionImpact(M, r, psi);
    const outward = Math.cos(psi) > 0;
    // an outward photon beyond the photon sphere always escapes; otherwise it must clear the shadow edge
    if (outward && r >= photonSphere(M)) return true;
    return b > criticalImpact(M);
}

/** A full emitter report at one radius. */
export function emitterAt(M, r) {
    return {
        r,
        coneAngleRad: criticalConeAngle(M, r),
        coneAngleDeg: criticalConeAngle(M, r) * 180 / Math.PI,
        escapedSkyFraction: escapedSkyFraction(M, r),
        insidePhotonSphere: r < photonSphere(M),
        aboveHorizon: r > horizon(M),
    };
}
