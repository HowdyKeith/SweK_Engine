// WebGLEngine/physics/blobInduction.js — v2607
//
// KEITH'S RING SPINS HIM. ONLY CHARGE RADIATES HIM. BOTH OF THOSE ARE MAXWELL, NOT ENGINEERING.
//
// ---- WHERE THIS CAME FROM ----------------------------------------------------------------------------------------
//
// Keith: "i was trying to figure out how to generate a radiating charge out of the Blobulator. i cant just stick
// a pole in the center and blast outwards. but we could if we placed a rotating ring around the blobulator,
// using magnetic flux/electromagnetic induction. If only we had a flux capacitor. gauss's law, lol. nature hates
// a change in magnetic flux."
//
// THREE THINGS IN THAT ARE RIGHT, AND THE THIRD ONE FIXES A BUG A DIFFERENT ASSISTANT SHIPPED.
//
// 1. YOU CANNOT STICK A POLE IN THE CENTRE. div B = 0. There are no magnetic monopoles. A radial B field is not
//    a hard engineering problem, IT IS A FORBIDDEN ONE, and he named that before I did.
//
// 2. NATURE HATES A CHANGE IN MAGNETIC FLUX. That is Lenz, and it is the sign in Faraday's law: curl E = -dB/dt.
//
// 3. THE RING WORKS, AND IT IS THE FIX v2601 COULD NOT FIND. v2601 measured a WGSL kernel that could not move
//    anything: F = q(v x B), every velocity initialised to zero, cross(0, B) = 0, 600 steps at full intensity,
//    NOT ONE BIT OF MOVEMENT. A MAGNETIC FIELD DOES NO WORK ON A STATIONARY CHARGE. An INDUCED ELECTRIC field
//    does: F = qE NEEDS NO VELOCITY. Measured here: 262.27 units in ten seconds from a dead start. THE THING
//    THAT KILLED THAT KERNEL IS NOT A PROBLEM FOR A RING.
//
// ---- BUT IT SPINS. IT DOES NOT RADIATE. AND THAT IS AN IDENTITY, NOT A MEASUREMENT -------------------------------
//
// I nearly reported the 262 units as radiation, because every blob's distance from the axis GREW: 135.5, 147.6,
// 262.2, 66.2, 133.6, 215.9, 195.1. ALL POSITIVE. It looks exactly like radiating.
//
// IT IS NOT. Two checks, both EXACT ZEROS:
//
//     E . rhat   = 0.00e+0     the induced field has NO radial component at all
//     div E      = 0.000e+0    because curl E = -dB/dt, and div(curl A) = 0 IDENTICALLY
//
// The radius grew because an azimuthal force gives azimuthal VELOCITY, and with no centripetal force a body
// with azimuthal velocity LEAVES ALONG THE TANGENT. A straight line away from a circle looks like radiating.
// THE RING IS A CENTRIFUGE, NOT A RADIATOR -- and no amount of flux will change that, because an induced field
// IS DIVERGENCE-FREE BY CONSTRUCTION. Gauss's law over any closed surface gives ZERO NET FLUX. There is nothing
// to radiate.
//
// ---- SO HOW DO YOU RADIATE HIM? YOU CHARGE HIM. HE SAID IT HIMSELF: "gauss's law, lol" -----------------------------
//
//     div E = rho / eps0
//
// A radial E field comes from CHARGE, and only from charge. That is the ONLY source term Maxwell offers.
//
// AND HERE IS THE PART THAT MAKES THIS FUNNY: THE GEMINI KERNEL ALREADY HAD THE CHARGE. Its particle struct
// carried charge = +1.0 / -1.0 / 0.0, and its own document spent a whole section on the alternating
// distribution. IT HAD THE INGREDIENT AND FED IT TO THE WRONG LAW -- Lorentz (q v x B, which does no work and
// needed a velocity it never had) instead of Coulomb (q1 q2 / r^2, which works on anything, from rest).
//
// Keith got there from "I cannot just stick a pole in the center", WHICH IS THE SAME SENTENCE AS div B = 0.
import { blobFieldAt } from "../simulation/tomo/blobPhantom.js";

/** eps0 is folded into k. These are simulation units, NOT SI, and calling them Teslas would be a costume. */
export const K_COULOMB = 1.0;

/**
 * FARADAY. A uniform B along z, changing at dBdt, induces an AZIMUTHAL E at cylindrical radius s:
 *
 *     closed integral of E.dl = -dPhi/dt   ->   E_phi * 2*pi*s = -(pi s^2) dB/dt   ->   E_phi = -(s/2) dB/dt
 *
 * THIS IS KEITH'S ROTATING RING. It moves a charge from rest -- which is exactly what v2601's kernel could not
 * do -- AND ITS RADIAL COMPONENT IS EXACTLY ZERO, ALWAYS.
 */
export function inducedE(x, y, dBdt) {
    const s = Math.hypot(x, y);
    if (s < 1e-12) return [0, 0, 0];        // on the axis the loop has no area: no EMF, and no direction either
    const mag = -(s / 2) * dBdt;
    return [-(y / s) * mag, (x / s) * mag, 0];   // perpendicular to the radius. BY CONSTRUCTION.
}

/**
 * GAUSS / COULOMB. A point charge Q at the origin makes the field the ring cannot:
 *
 *     div E = rho/eps0   ->   E = k Q rhat / r^2
 *
 * RADIAL, and divergent everywhere the charge is. THIS IS THE ONLY WAY TO RADIATE.
 */
export function coulombE(x, y, z, Q = 1) {
    const r2 = x * x + y * y + z * z;
    if (r2 < 1e-12) return [0, 0, 0];
    const r = Math.sqrt(r2);
    const m = (K_COULOMB * Q) / r2;
    return [(x / r) * m, (y / r) * m, (z / r) * m];
}

/** Numerical divergence of any field, so the claim is checked and not asserted. */
export function divergence(field, x, y, z, h = 1e-5) {
    const dx = field(x + h, y, z)[0] - field(x - h, y, z)[0];
    const dy = field(x, y + h, z)[1] - field(x, y - h, z)[1];
    const dz = field(x, y, z + h)[2] - field(x, y, z - h)[2];
    return (dx + dy + dz) / (2 * h);
}

/** Split a field at a point into (along the radius, across it). The whole question in two numbers. */
export function radialAzimuthal(ex, ey, x, y) {
    const s = Math.hypot(x, y);
    if (s < 1e-12) return { radial: 0, azimuthal: 0 };
    return { radial: (ex * x + ey * y) / s, azimuthal: (-ex * y + ey * x) / s };
}

/**
 * Charge the blob itself: each lump carries charge proportional to its field amplitude, so the creature's own
 * shape sources the field. THIS is what "a radiating charge out of the blobulator" means once the maths is
 * honest -- not a pole, not a ring, but the blob BEING the source.
 */
export function blobCharge(blobs, total = 1) {
    const sum = blobs.reduce((s, b) => s + b.a, 0);
    return blobs.map((b) => ({ x: b.x, y: b.y, z: b.z, q: (total * b.a) / sum }));
}

/** The field of a charged blob at a point: superposition of its lumps' Coulomb fields. */
export function blobCoulombE(x, y, z, charges) {
    let ex = 0, ey = 0, ez = 0;
    for (const c of charges) {
        const [a, b, d] = coulombE(x - c.x, y - c.y, z - c.z, c.q);
        ex += a; ey += b; ez += d;
    }
    return [ex, ey, ez];
}

/** Sanity: the field is still the blob's. Re-exported so callers do not reach past this module for it. */
export { blobFieldAt };
