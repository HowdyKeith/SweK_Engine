---
type: claim
title: "You cannot set kelvin, and my slider was worse than mislabelled"
description: "Keith brought back a second Gemini conversation where he said he had 'created a blobarium by transporting a blobulator into it, SETTING KELVIN'. Gemini congratulated him and produc"
tags: [settled, "swek-engine", v2600]
timestamp: v2600
---

# You cannot set kelvin, and my slider was worse than mislabelled

- **Status:** settled  
- **Since:** v2600

## Prediction

Keith brought back a second Gemini conversation where he said he had 'created a blobarium by transporting a blobulator into it, SETTING KELVIN'. Gemini congratulated him and produced a WGSL kernel: a Particle struct (position, velocity, temperature, phase, charge), phase thresholds at 100K/1000K, a neutron point-source, and a Lorentz force. NOBODY ASKED WHETHER THE BLOBARIUM HAS A KELVIN.

## Why

FIRST, THE PLAN IS FOR A DIFFERENT BLOB. Gemini's kernel assumes a PARTICLE FLUID -- `array<Particle>` at 48 bytes each, 'millions of elements simultaneously'. The blobarium has SEVEN CENTRES and a closed-form field. Adopting it means throwing away the exactness v2595 measured at 100.0% kept against the grid's 50.5%. (Credit where due: its struct alignment is CORRECT -- vec3+pad = 16, twice, then four f32s = 48 bytes, and floatsPerParticle 12 checks out.)

## Measured

THE KELVIN QUESTION, ANSWERED BY MEASUREMENT. Einstein's relation is D = kT/gamma -- IT IS THE FLUCTUATION-DISSIPATION THEOREM, and a temperature is a RATIO of random kicks to drag. So: shove one box3d body and let go. Speed each half-second: 1, 1, 1, 1. THERE IS NO DRAG. gamma = 0, so T = D*gamma/k has NO SOLUTION FOR FINITE T -- THE BLOBARIUM HAS NO TEMPERATURE TO NAME, only kicks with nothing to be in equilibrium with. AND IT IS WORSE INSIDE MY OWN CODE: a POSITION random walk (x += gauss*sqrt(2*D*dt), exactly what jitterCentres does) IS THE OVERDAMPED LIMIT -- IT ASSUMES gamma -> INFINITY. box3d has gamma = 0. MY WARMTH MODEL AND MY SOLVER ASSUME OPPOSITE PHYSICS, and nothing anywhere said so. THEN THE REAL DISASTER: blobarium.html:178 called `world.setTransform(ids[i], b.x, b.y, b.z)` -- THREE LOOSE NUMBERS. box3dLoader.js:49 is `setTransform(idx, p, q)` and dereferences p[0], p[1], p[2], q[0].. -- ARRAYS. So p was a NUMBER, p[0] was undefined, and the page fed undefined straight into the wasm. MEASURED: page's way -> position becomes [NaN, NaN, NaN]. Real way (id, [x,y,z], [quat]) -> [0.4, 0.2, 0.4]. DRAGGING THE WARMTH SLIDER TURNED THE BLOB'S POSITION INTO NaN AND MADE HIM VANISH. IT SHIPPED THAT WAY IN v2597, AND I EXPLICITLY TOLD KEITH TO GO DRAG IT.

## Kill condition

THE GATE IS THE STORY. v2597's blobarium gate pressed run, read 'D 0.00000 (cold)', counted 1517 lit pixels and declared the blobarium proven. IT NEVER DRAGGED THE WARMTH SLIDER. A CONTROL THAT CANNOT FAIL IS DECORATION -- AND A CONTROL NO TEST EVER TOUCHED IS WORSE: IT IS A TRAP YOU BUILT FOR THE PERSON WHO TRUSTS YOU. The gate now fills #temp, dispatches input, and asserts NO NaN in the status line AND that the peak stays above the floor WHILE THE BLOB IS BEING SHAKEN. Restore the v2597 call and 3 checks fail; before, ZERO did -- the gate watched the blob turn to NaN and called it a pass.

# Citations

- Code: blobarium.html (warmth fixed: setTransform(id, [x,y,z], [q]) with the QUATERNION READ BACK, not passed as identity -- identity would have silently UN-ROTATED him every frame, which would have looked like physics and been an assignment) + physics/blobarium-selfcheck.mjs (now 11 checks; drags the slider; sabotage-tested). The page now says plainly what the slider is NOT: not a Kelvin, and it cannot be, because gamma = 0. AND I GUESSED AT THREE INTERFACES IN ONE ROUND WHILE WRITING THE ROUND ABOUT NOT GUESSING: setVelocity(id, 1, 0, 0) when the CONTRACT says setVelocity(a, [2,0,1]); setTransform(id, x, y, z) twice, once in a probe and once -- shipped -- in the page itself. THE CONTRACT FILE AND box3dLoader.js WERE BOTH ON DISK THE WHOLE TIME. THE PATTERN IS NOT THAT I GUESS WHEN I LACK THE SOURCE. IT IS THAT I GUESS WHEN I FEEL FAMILIAR.
- Page: `/blobarium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
