// physics/blackhole/emit-selfcheck.mjs
//
// v3359 -- A PROBE THAT EMITS NEAR A BLACK HOLE, AND THE IDENTITY NOBODY HAD CONNECTED.
//
// fieldSpace made probes EMITTERS on a cost field: an emitter is a Dijkstra source and its signal spreads by
// relaxation. That picture fails near a black hole for the same reason cost-field routing did -- signals follow
// null geodesics, and some do not come back.
//
// THE EXACT KEY. A static emitter at r sends a photon at angle psi from the outward radial direction; its impact
// parameter is b = r sin(psi)/sqrt(1 - 2M/r) and it escapes only if b clears b_crit = 3 sqrt(3) M. So
//
//     sin(psi_c) = 3 sqrt(3) M sqrt(1 - 2M/r) / r
//
// *** AND THAT NUMBER WAS ALREADY IN THE LAB UNDER ANOTHER NAME. *** The lens device computes shadowAngleRad,
// the angular radius of the hole seen by a distant observer. It is the SAME ANGLE to 5e-16, because null
// geodesics are time-reversible: the cone light can reach you FROM is the cone you must not emit INTO. Two
// devices, one quantity, no shared code -- and the connection existed for versions without being drawn.
//
// THE GEOMETRY FLIPS AT THE PHOTON SPHERE and ONE formula covers both sides:
//     r > 3M   CAPTURE cone around the inward radial direction, most of the sky escapes
//     r = 3M   psi_c = 90 degrees exactly, precisely half the sky escapes
//     r < 3M   ESCAPE cone around the outward radial direction, most of the sky is captured
// Continuity through r = 3M is the check that this is one formula rather than two guesses stitched together.

import { criticalConeAngle, escapedSkyFraction, emitterAt, emissionEscapes, emissionImpact } from "./emit.mjs";
import { criticalImpact, photonSphere, horizon } from "./geodesic.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const M = 1;

// ---- 1. THE EXACT ANGLES ----------------------------------------------------------------------------------------
{
    ok("!! at the photon sphere the cone is exactly 90 degrees and exactly half the sky escapes",
        Math.abs(criticalConeAngle(M, photonSphere(M)) - Math.PI / 2) < 1e-12 &&
        Math.abs(escapedSkyFraction(M, photonSphere(M)) - 0.5) < 1e-12,
        `psi_c = ${(criticalConeAngle(M, 3) * 180 / Math.PI).toFixed(6)} degrees at r = 3M, escaped sky ` +
        `${escapedSkyFraction(M, 3).toFixed(9)}. At the photon sphere light can circle, so the boundary between ` +
        "escape and capture is the tangent plane -- half the sky, exactly");

    ok("!! at the ISCO the cone is exactly 45 degrees",
        Math.abs(Math.sin(criticalConeAngle(M, 6)) - 1 / Math.SQRT2) < 1e-12,
        `sin(psi_c) at r = 6M is ${Math.sin(criticalConeAngle(M, 6)).toFixed(12)} against 1/sqrt(2) = ` +
        `${(1 / Math.SQRT2).toFixed(12)}. A probe parked at the innermost stable orbit loses a 45-degree cone ` +
        "of every direction it might broadcast in");

    ok("...and nothing escapes at the horizon",
        escapedSkyFraction(M, horizon(M)) === 0 && criticalConeAngle(M, horizon(M)) === 0,
        "the cone closes to zero at r = 2M. A guard rather than a limit -- the formula would return NaN from " +
        "sqrt of a negative below the horizon, and returning 0 says the right thing instead of throwing");
}

// ---- 2. THE IDENTITY WITH THE SHADOW -- two devices, one quantity ------------------------------------------------
{
    const { getDevice } = await import("../../tools/roundhouse/devices.mjs");
    const shadow = await (await getDevice("lens")).build({ mode: "shadow" });
    const cone = criticalConeAngle(M, shadow.rObs);
    ok("!! the escape cone IS the black-hole shadow angle, to machine precision",
        Math.abs(cone - shadow.shadowAngleRad) < 1e-12,
        `lens/shadow gives ${shadow.shadowAngleRad.toFixed(12)} at rObs = ${shadow.rObs}; the escape cone gives ` +
        `${cone.toFixed(12)}. Difference ${Math.abs(cone - shadow.shadowAngleRad).toExponential(1)}. Null ` +
        "geodesics are time-reversible, so the cone light reaches you FROM is the cone you must not emit INTO. " +
        "The lens device computes it looking in; this computes it looking out; nothing had connected them");
}

// ---- 3. ONE FORMULA, NOT TWO -- continuity through the photon sphere -------------------------------------------------
{
    const below = escapedSkyFraction(M, 3 - 1e-4), at = escapedSkyFraction(M, 3), above = escapedSkyFraction(M, 3 + 1e-4);
    ok("!! the escaped sky fraction is continuous across r = 3M, where the geometry flips",
        Math.abs(below - at) < 1e-4 && Math.abs(above - at) < 1e-4 && below < at && at < above,
        `${below.toFixed(9)} just inside, ${at.toFixed(9)} at, ${above.toFixed(9)} just outside. Inside 3M the ` +
        "cone is the ESCAPING directions; outside it is the CAPTURED ones -- opposite meanings, and the fraction " +
        "passes through 1/2 without a step. A discontinuity here would mean the two branches were guessed " +
        "separately rather than derived from one expression");

    ok("...and it rises monotonically with radius, all the way out",
        [2.5, 3, 4, 6, 10, 20, 100].every((r, i, a) => i === 0 || escapedSkyFraction(M, r) > escapedSkyFraction(M, a[i - 1])),
        "0.084% escapes at r = 2.001M, 50% at 3M, 85.4% at the ISCO, 99.93% at 100M. Getting further away is the " +
        "only thing that helps a transmitter, and the curve says by how much");
}

// ---- 4. THE PER-DIRECTION TEST AGREES WITH THE CONE ------------------------------------------------------------------
{
    const r = 10;
    const psi = criticalConeAngle(M, r);
    // just inside and just outside the capture cone, measured from the INWARD radial direction
    const inCone = Math.PI - psi * 0.9, outCone = Math.PI - psi * 1.1;
    ok("!! a direction inside the capture cone does not escape, one outside does",
        emissionEscapes(M, r, outCone) && !emissionEscapes(M, r, inCone),
        `at r = ${r}M the capture cone half-angle is ${(psi * 180 / Math.PI).toFixed(3)} degrees around the ` +
        "inward radial. Testing a single emission direction uses the impact parameter directly, so it agrees " +
        "with the cone by construction -- stated as a consistency check, not as independent evidence");

    ok("...and any outward direction beyond the photon sphere escapes",
        [0, 0.3, 1.0, 1.4].every((p) => emissionEscapes(M, 10, p)),
        "beyond r = 3M the effective potential falls off outward, so an outward-going photon has no turning " +
        "point to meet. That is why the cone is drawn around the INWARD direction out here");
}

console.log();
if (fails) { console.log("emit-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("emit-selfcheck: all checks pass");
