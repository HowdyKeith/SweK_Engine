---
type: claim
title: The kernel that cannot move and the RNG that cannot repeat
description: "Keith brought back a second assistant's WGSL compute kernel for the blobarium: phase transitions by Kelvin, a neutron source, a magnetic field via the Lorentz force, and an alterna"
tags: [settled, "swek-engine", v2601]
timestamp: v2601
---

# The kernel that cannot move and the RNG that cannot repeat

- **Status:** settled  
- **Since:** v2601

## Prediction

Keith brought back a second assistant's WGSL compute kernel for the blobarium: phase transitions by Kelvin, a neutron source, a magnetic field via the Lorentz force, and an alternating +1/-1/0 charge distribution to make the blob polarize and split. TWO THINGS IN IT ARE MEASURABLY FATAL, AND ONE OF THEM IS NOT A BUG -- IT IS PHYSICS.

## Why

ITS RNG IS BUILT ON THE ONE FUNCTION v2599 PROVED IS NOT SPECIFIED: `sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123`, then fract. IEEE 754 specifies + - * / sqrt fma as CORRECTLY ROUNDED and merely RECOMMENDS sin. AND I FIRST MEASURED THIS WRONG AND MY OWN print STATEMENT SAID THE PUNCHLINE ANYWAY: I nudged sin by one DOUBLE ulp (2.2e-16), got 0.000000 movement, and printed 'ONE ULP IN, TOTAL DECORRELATION OUT' NEXT TO THE ZERO. A PRINT STATEMENT THAT STATES THE CONCLUSION WILL STATE IT WHETHER OR NOT IT IS TRUE.

## Measured

THE REDO, IN f32, WHICH IS WHAT A GPU ACTUALLY RUNS: f32 sin differs from f64 sin by up to 5.53e-5 over 5000 samples; times 43758.5453123 that is 2.4191 -- AND fract RETURNS 0..1, SO AN ERROR OF 2.42 WRAPS THE OUTPUT TWICE. The multiply IS an amplifier: not of a double's last bit (1e-11, nothing) but of f32's sin error, which it turns into MORE THAN THE ENTIRE OUTPUT RANGE. And ONE f32 ULP on the input moves the hash by 0.33545 at dot = 128.7 -- a THIRD of the range -- which the document's own vec3(127.1, 311.7, 74.7) reaches for any p in a 4-unit box, AND sin needs ARGUMENT REDUCTION at that magnitude, WHICH IS EXACTLY WHERE IMPLEMENTATIONS DISAGREE MOST. THAT IS VALERIU'S FINDING, ONE LEVEL DOWN AND MULTIPLIED BY 43758. AND THE SECOND, WHICH IS WORSE BECAUSE IT IS NOT A BUG: the document's own initParticleBuffer sets EVERY velocity to (0,0,0), and its own kernel applies `lorentz_force = p.charge * cross(p.velocity, B)`. F = q(v x B). v = 0. cross(0, B) = 0. Ran it exactly as written, 600 steps, ten seconds, sweep at FULL INTENSITY: velocity [0,0,0], position [0.5, 0.2, -0.3] -- EXACTLY WHERE IT STARTED, NOT ONE BIT MOVED. At its own ambient of 293.15 K the phase is LIQUID and THE LIQUID BRANCH IS EMPTY -- only GAS (above 1000 K) adds jitter -- SO NOTHING EVER GIVES IT A FIRST NUDGE. The document promises the blob 'will visibly tear away from a spherical state, spinning up into an expanding, undulating donut.' IT WILL SIT PERFECTLY STILL.

## Kill condition

A MAGNETIC FIELD DOES NO WORK ON A STATIONARY CHARGE. THAT IS NOT A TYPO TO FIX -- IT IS WHAT THE LORENTZ FORCE IS. Give the particles a starting velocity, or drive them with something that does work (a gradient, a thermal kick, a collision), and the sweep comes alive -- BUT THAT IS A FIX SOMEBODY HAS TO CHOOSE, NOT A DETAIL THAT WORKS BY DEFAULT.

# Citations

- Code: physics/kernelVerdict-selfcheck.mjs (7 checks, gated). AND WHAT IS RIGHT IN IT, SAID PLAINLY, BECAUSE A REVIEW THAT ONLY FINDS FAULTS IS NOT A REVIEW, IT IS A POSTURE: the 48-byte struct alignment is CORRECT (vec3+pad + vec3+pad + four f32 = 16+16+16), and that is the part people usually get wrong. The Lorentz formula is CORRECT. The charge-distribution reasoning is CORRECT -- same-charge particles would drift uniformly, alternating +1/-1 does set up shear. The instinct to move the loop into a compute kernel is CORRECT. IT IS A GOOD DOCUMENT WITH TWO HOLES, AND BOTH HOLES ARE THE SHAPE OF EVERYTHING ELSE THIS SESSION FOUND: SOMEBODY ASSERTED A BEHAVIOUR INSTEAD OF RUNNING IT. AND THE DEEPER POINT: THE DOCUMENT WANTS PARTICLES IN A GRID; SWEK'S BLOB IS SEVEN NUMBERS AND A CLOSED FORM. Both are legitimate. THEY ARE NOT THE SAME ANIMAL, AND THE KELVIN SLIDER MEANS A DIFFERENT THING IN EACH -- v2596 measured that the grid was ALREADY at D = 0.01141 with nobody's hand on the dial.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
