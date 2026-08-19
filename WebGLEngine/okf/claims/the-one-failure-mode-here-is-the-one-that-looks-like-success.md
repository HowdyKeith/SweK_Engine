---
type: claim
title: The one failure mode here is the one that looks like success
description: "v2563 built physics/sph/cfl.js and NOTHING EVER IMPORTED IT. Eighteen versions, and the only things touching it were its own selfcheck and a sentence on this page. That is the exac"
tags: [settled, "swek-engine", v2581]
timestamp: v2581
---

# The one failure mode here is the one that looks like success

- **Status:** settled  
- **Since:** v2581

## Prediction

v2563 built physics/sph/cfl.js and NOTHING EVER IMPORTED IT. Eighteen versions, and the only things touching it were its own selfcheck and a sentence on this page. That is the exact disease v2580 cured one round ago -- A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE -- sitting in the tree WHILE I NAMED IT. OPEN until Keith loads flesh.html and reads the number off the panel.

## Why

CFL = max|v| * dt / h. Above 1, the fastest particle crosses more than a smoothing length in a single step: IT TELEPORTS PAST THE NEIGHBOURS IT WAS SUPPOSED TO INTERACT WITH. And here is the part that earns the light: THE SOLVER DOES NOT BLOW UP. IT DOES NOT NaN. IT QUIETLY RETURNS A FIELD THAT IS FINITE, PLAUSIBLE, AND NOT A SOLUTION TO ANYTHING. THE ONE FAILURE MODE HERE IS THE ONE THAT LOOKS LIKE SUCCESS -- which is why it cannot be left to the eye.

## Measured

SANDBOX-CONFIRMED v2651: this page was in fact THROWING on load -- a temporal-dead-zone bug (posed and lastCost declared after the top-level await that build() runs across), canvas blank, CFL never shown. FIXED by hoisting both declarations. Now headless: no errors, 1.1M canvas pixels, CFL live and green (#6ee7a8) reading 0.069 -> 0.157 -> 0.108 -> 0.101 -> 0.194 as the fluid steps after Drop -- the failure mode that looks like success can no longer hide behind a blank page. THE CFL NUMBER IS NOW ON flesh.html'S LIVE LABEL -- the line Keith watched ticking while the render window stayed blank. Green under 0.5, amber to 1, RED AND 'NOT SOLVING NAVIER-STOKES' above it. Verified by driving the page's exact expression headlessly, with FleshSph constructed the way the selfcheck constructs it (BONES + {count:500, seed:42}) rather than the way I first guessed: cflNumber(sph.world ?? sph, sph.h, DT) -> courant 0.0031, maxSpeed 0.142 m/s, finite, GREEN. AND A REAL BUG CAME OUT OF WIRING IT: fleshSph.js had `const DT = 1 / 120` NOT EXPORTED, and cfl-selfcheck.mjs DECLARED ITS OWN COPY. TWO SOURCES OF TRUTH FOR THE NUMBER THAT DECIDES WHETHER THE VERDICT IS TRUE -- and if the solver's step had ever changed, THE CHECK WOULD HAVE GONE ON GRADING A STEP NOBODY WAS TAKING, and the disagreement would have looked like a pass. DT is exported now; the page and the gate both read the one value.

## Kill condition

Keith loads flesh.html in a fluid mode and the CFL field is missing, or reads NaN, or stays green while the flesh visibly explodes. The panel is also gated to SAY SO on a throw -- a silent catch would leave the light dark BECAUSE IT IS BROKEN, which is indistinguishable from the light being dark because everything is fine.

# Citations

- Code: flesh.html (live label) + physics/sph/cfl.js (v2563, unchanged) + physics/soft/fleshSph.js (DT exported) + cfl-selfcheck.mjs (4 more checks, and it now IMPORTS DT instead of re-declaring it). ALSO WORTH RECORDING: wiring this took THREE attempts because I guessed the anchor line's indentation twice -- 4 spaces, then 2, when the file said 2. THAT IS THE THIRD ROUND RUNNING WITH THE SAME REFLEX (v2578: a corner table transcribed by eye, 48 of 58 quads inside out; v2579: call sites assumed at 6 spaces, they were 4). It gets cheaper each time -- gate, then assert, now a failed anchor before anything was touched -- BUT IT IS THE SAME REFLEX, AND THE FIX IS ALWAYS TO READ THE LINE.
- Page: `/flesh.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
