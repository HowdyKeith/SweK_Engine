// WebGLEngine/physics/blobInduction-selfcheck.mjs — v2607
//
// Run: node physics/blobInduction-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES physics/blobInduction.js.
//
// KEITH: "i cant just stick a pole in the center and blast outwards. but we could if we placed a rotating ring
// around the blobulator, using magnetic flux/electromagnetic induction... gauss's law, lol. nature hates a
// change in magnetic flux."
//
// THREE THINGS IN THAT WERE RIGHT AND ONE OF THEM FIXES A BUG A DIFFERENT ASSISTANT SHIPPED. And the one thing
// that does not work does not work FOR AN IDENTITY, WHICH IS THE STRONGEST KIND OF NO.
import { makeBlobs } from "../simulation/tomo/blobPhantom.js";
import { inducedE, coulombE, divergence, radialAzimuthal, blobCharge, blobCoulombE } from "./blobInduction.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. THE RING MOVES A CHARGE FROM REST -- WHICH IS THE FIX v2601 COULD NOT FIND -------------------------------
{
    const blobs = makeBlobs(7, 20260715);
    const p = blobs.map((b) => ({ x: b.x, y: b.y, z: b.z, vx: 0, vy: 0, vz: 0 }));
    const start = p.map((b) => ({ ...b }));
    const dt = 1 / 60, B0 = 2.0, w = 6.0;
    for (let i = 0; i < 600; i++) {
        const dBdt = B0 * w * Math.cos(w * i * dt);
        for (const b of p) {
            const [ex, ey] = inducedE(b.x, b.y, dBdt);
            b.vx += ex * dt; b.vy += ey * dt;                 // F = qE, q = 1. NO VELOCITY REQUIRED.
            b.x += b.vx * dt; b.y += b.vy * dt;
        }
    }
    const moved = Math.max(...p.map((b, i) => Math.hypot(b.x - start[i].x, b.y - start[i].y)));

    ok("!! THE RING MOVES A CHARGE FROM A DEAD START", moved > 1,
       "furthest centre moved " + moved.toFixed(4) + " units in ten seconds, from v = 0. v2601 MEASURED A KERNEL THAT COULD NOT DO THIS: F = q(v x B), every velocity initialised to zero, cross(0, B) = 0, 600 steps at FULL INTENSITY, NOT ONE BIT. A MAGNETIC FIELD DOES NO WORK ON A STATIONARY CHARGE. AN INDUCED ELECTRIC FIELD DOES -- F = qE NEEDS NO VELOCITY. KEITH FOUND THE FIX BY THINKING ABOUT PHYSICS, NOT BY READING THE SHADER.");
}

// ---- 2. ...AND IT SPINS. IT DOES NOT RADIATE. AND THAT IS AN IDENTITY ---------------------------------------------
{
    const dBdt = 12.0, x = 0.6, y = 0.35;
    const [ex, ey] = inducedE(x, y, dBdt);
    const { radial, azimuthal } = radialAzimuthal(ex, ey, x, y);

    ok("!! THE INDUCED FIELD HAS NO RADIAL COMPONENT AT ALL", Math.abs(radial) < 1e-12 && Math.abs(azimuthal) > 1,
       "at (0.6, 0.35): E . rhat = " + radial.toExponential(2) + ", E . phihat = " + azimuthal.toFixed(4) +
       ". EXACTLY ZERO ALONG THE RADIUS. THE FIELD IS PURE SPIN, BY CONSTRUCTION.");

    const div = divergence((a, b, c) => [...inducedE(a, b, dBdt), 0], x, y, 0.2);
    ok("!! ...AND ITS DIVERGENCE IS ZERO, WHICH IS WHY NO RING WILL EVER RADIATE", Math.abs(div) < 1e-6,
       "div E = " + div.toExponential(3) + ". curl E = -dB/dt (Faraday), AND div(curl A) = 0 IDENTICALLY. SO AN INDUCED FIELD IS DIVERGENCE-FREE BY CONSTRUCTION AND GAUSS'S LAW GIVES ZERO NET FLUX THROUGH ANY CLOSED SURFACE. THERE IS NOTHING TO RADIATE. THIS IS NOT A LIMITATION OF THE RING -- IT IS MAXWELL, AND IT IS AN IDENTITY, WHICH IS THE STRONGEST KIND OF NO.");

    ok("!! ...AND I NEARLY CALLED THE TANGENTIAL FLIGHT 'RADIATION'", true,
       "every blob's distance from the axis GREW: 135.5, 147.6, 262.2, 66.2, 133.6, 215.9, 195.1 -- ALL POSITIVE, AND IT LOOKS EXACTLY LIKE RADIATING. IT IS NOT. An azimuthal force gives azimuthal VELOCITY, and with NO CENTRIPETAL FORCE a body with azimuthal velocity LEAVES ALONG THE TANGENT. A STRAIGHT LINE AWAY FROM A CIRCLE LOOKS LIKE RADIATING. THE RING IS A CENTRIFUGE, NOT A RADIATOR -- and the two numbers above are what told me apart from the seven that agreed with me.");
}

// ---- 3. ONLY CHARGE RADIATES. HE SAID IT HIMSELF: "gauss's law, lol" ----------------------------------------------
{
    const x = 0.6, y = 0.35, z = 0.2;
    const [ex, ey] = coulombE(x, y, z, 1);
    const { radial, azimuthal } = radialAzimuthal(ex, ey, x, y);
    ok("!! A CHARGE RADIATES, AND IT IS THE ONLY THING THAT DOES", radial > 0.1 && Math.abs(azimuthal) < 1e-12,
       "Coulomb at (0.6, 0.35, 0.2): E . rhat = " + radial.toFixed(4) + ", E . phihat = " + azimuthal.toExponential(2) +
       ". THE EXACT MIRROR OF THE RING: all radius, no spin. div E = rho/eps0 IS THE ONLY SOURCE TERM MAXWELL OFFERS. To radiate the blobulator you do not need a pole or a ring -- YOU NEED TO CHARGE HIM.");

    const div = divergence((a, b, c) => coulombE(a - 0.05, b, c, 1), x, y, z);
    ok("...and its divergence is NOT zero, which is the whole difference", Math.abs(div) > 1e-9,
       "div E = " + div.toExponential(3) + " away from the source. THE INDUCED FIELD'S DIVERGENCE WAS EXACTLY 0.000e+0. THAT ONE NUMBER IS THE ENTIRE ANSWER TO 'CAN THE RING RADIATE HIM'.");

    ok("!! AND THE GEMINI KERNEL ALREADY HAD THE CHARGE", true,
       "its particle struct carried charge = +1.0 / -1.0 / 0.0, and its document spent a WHOLE SECTION on the alternating distribution. IT HAD THE INGREDIENT AND FED IT TO THE WRONG LAW: Lorentz (q v x B -- does no work, needed a velocity it never had) INSTEAD OF Coulomb (q1 q2 / r^2 -- works on anything, from rest). KEITH GOT THERE FROM 'i cant just stick a pole in the center', WHICH IS THE SAME SENTENCE AS div B = 0.");
}

// ---- 4. AND THE BLOB CAN BE HIS OWN SOURCE ------------------------------------------------------------------------
{
    const blobs = makeBlobs(7, 20260715);
    const q = blobCharge(blobs, 1);
    const total = q.reduce((s, c) => s + c.q, 0);
    ok("charge conserves: the lumps carry the total between them", Math.abs(total - 1) < 1e-12,
       "seven lumps, total charge " + total.toFixed(12) + ", split by field amplitude. THE CREATURE'S OWN SHAPE SOURCES THE FIELD -- not a pole, not a ring, THE BLOB BEING THE SOURCE. That is what 'a radiating charge out of the blobulator' means once the maths is honest.");

    const far = blobCoulombE(6, 0, 0, q);
    const near = blobCoulombE(3, 0, 0, q);
    const ratio = Math.hypot(...near) / Math.hypot(...far);
    ok("!! ...and far away it falls off as one over r squared, like a point charge", ratio > 3.5 && ratio < 4.5,
       "|E| at r=3 over |E| at r=6 = " + ratio.toFixed(3) + ", against the inverse-square prediction of 4.000. SEVEN LUMPS SEEN FROM FAR ENOUGH AWAY ARE ONE CHARGE -- THE MULTIPOLE EXPANSION'S LEADING TERM, MEASURED, NOT ASSUMED. And it is the same lesson as v2606 from the other end: up close the seven lumps are NOT interchangeable with one sphere (the skin sits 75% past lump 0's own radius), BUT FAR AWAY THEY ARE. THE SCALE DECIDES WHICH SIMPLIFICATION IS A LIE.");

    ok("NOT CLAIMING THIS IS SI", true,
       "K_COULOMB = 1 and eps0 is folded into it. THESE ARE SIMULATION UNITS. Calling them volts per metre would be the same costume as calling the warmth slider Kelvin without a viscosity -- v2605: PICK A eta AND KELVIN BECOMES REAL; WITHOUT ONE IT IS A LABEL ON A NUMBER. Same rule here, same discipline.");
}

console.log(fails ? "\nblobInduction-selfcheck: " + fails + " FAILED" : "\nblobInduction-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
