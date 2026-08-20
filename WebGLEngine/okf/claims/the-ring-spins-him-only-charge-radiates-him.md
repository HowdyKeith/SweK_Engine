---
type: claim
title: The ring spins him. Only charge radiates him.
description: "Keith: 'i was trying to figure out how to generate a radiating charge out of the Blobulator. i cant just stick a pole in the center and blast outwards. but we could if we placed a "
tags: [settled, "swek-engine", v2607]
timestamp: v2607
---

# The ring spins him. Only charge radiates him.

- **Status:** settled  
- **Since:** v2607

## Prediction

Keith: 'i was trying to figure out how to generate a radiating charge out of the Blobulator. i cant just stick a pole in the center and blast outwards. but we could if we placed a rotating ring around the blobulator, using magnetic flux/electromagnetic induction. If only we had a flux capacitor. gauss\'s law, lol. nature hates a change in magnetic flux.' THREE THINGS IN THAT ARE RIGHT, AND ONE OF THEM FIXES A BUG A DIFFERENT ASSISTANT SHIPPED.

## Why

(1) YOU CANNOT STICK A POLE IN THE CENTRE: div B = 0, there are no magnetic monopoles. A radial B field is not a hard engineering problem, IT IS A FORBIDDEN ONE, and he named that before I did. (2) NATURE HATES A CHANGE IN MAGNETIC FLUX -- that is Lenz, and it is the minus sign in curl E = -dB/dt. (3) THE RING WORKS, AND IT IS THE FIX v2601 COULD NOT FIND: v2601 measured a WGSL kernel that could not move anything because F = q(v x B) with every velocity initialised to zero -- cross(0, B) = 0, 600 steps at full intensity, NOT ONE BIT. A MAGNETIC FIELD DOES NO WORK ON A STATIONARY CHARGE. AN INDUCED ELECTRIC FIELD DOES: F = qE NEEDS NO VELOCITY. KEITH FOUND IT BY THINKING ABOUT PHYSICS, NOT BY READING THE SHADER.

## Measured

Faraday gives E_phi = -(s/2) dB/dt for uniform B along z. Driven at B = 2.0 sin(6t), the seven centres moved 262.27 units in ten seconds FROM A DEAD START -- the ring does what the Lorentz kernel could not. BUT IT SPINS, IT DOES NOT RADIATE, AND I NEARLY GOT THIS WRONG: every blob's distance from the axis GREW (135.5, 147.6, 262.2, 66.2, 133.6, 215.9, 195.1 -- ALL POSITIVE), WHICH LOOKS EXACTLY LIKE RADIATING. TWO CHECKS, BOTH EXACT ZEROS, SAID OTHERWISE: E . rhat = 0.00e+0 (NO radial component at all) and div E = 0.000e+0. The radius grew because an azimuthal force gives azimuthal VELOCITY, and with no centripetal force a body LEAVES ALONG THE TANGENT -- A STRAIGHT LINE AWAY FROM A CIRCLE LOOKS LIKE RADIATING. THE RING IS A CENTRIFUGE. And that is not a limitation of the ring: curl E = -dB/dt and div(curl A) = 0 IDENTICALLY, so an induced field is DIVERGENCE-FREE BY CONSTRUCTION and Gauss gives ZERO NET FLUX through any closed surface. THERE IS NOTHING TO RADIATE. AN IDENTITY IS THE STRONGEST KIND OF NO. SO HOW DO YOU RADIATE HIM? HE SAID IT HIMSELF -- 'gauss\'s law, lol'. div E = rho/eps0 IS THE ONLY SOURCE TERM MAXWELL OFFERS. Coulomb at the same point: E . rhat = 0.9245, E . phihat = 0.00e+0 -- THE EXACT MIRROR OF THE RING. AND THE FUNNY PART: THE GEMINI KERNEL ALREADY HAD THE CHARGE. Its struct carried +1.0/-1.0/0.0 and its document spent a whole section on the alternating distribution. IT HAD THE INGREDIENT AND FED IT TO THE WRONG LAW.

## Kill condition

Make the induced field radial -- the physically impossible one -- and 3 checks fail. Break Coulomb to 1/r instead of 1/r^2 and the far-field ratio catches it. THE FAR-FIELD CHECK IS THE ONE I LIKE: |E| at r=3 over |E| at r=6 = 4.002 against the inverse-square prediction of 4.000. SEVEN LUMPS SEEN FROM FAR ENOUGH AWAY ARE ONE CHARGE -- and that is v2606's lesson from the other end. Up close the seven lumps are NOT one sphere (the skin sits 75% past lump 0's own radius, held up by neighbours); FAR AWAY THEY ARE. THE SCALE DECIDES WHICH SIMPLIFICATION IS A LIE.

# Citations

- Code: physics/blobInduction.js (inducedE/coulombE/divergence/radialAzimuthal/blobCharge/blobCoulombE) + physics/blobInduction-selfcheck.mjs (10 checks, gated, TWO sabotages). blobCharge puts the charge ON THE CREATURE -- each lump carrying charge proportional to its amplitude, conserved to 1e-12 -- so the blob is his OWN source. NOT A POLE, NOT A RING, THE BLOB BEING THE SOURCE. That is what 'a radiating charge out of the blobulator' means once the maths is honest. NOT CLAIMING SI: K_COULOMB = 1 with eps0 folded in. THESE ARE SIMULATION UNITS, and calling them volts per metre would be the same costume as calling the warmth slider Kelvin without a viscosity -- v2605: PICK AN eta AND KELVIN BECOMES REAL; WITHOUT ONE IT IS A LABEL ON A NUMBER. Same rule, same discipline.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
