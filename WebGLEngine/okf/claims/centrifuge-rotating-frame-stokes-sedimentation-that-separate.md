---
type: claim
title: "Centrifuge -- rotating-frame Stokes sedimentation that separates a mixture by the Svedberg coefficient"
description: "A centrifuge is mechanics, not chemistry -- and it is the same Stokes drag the thermal coupling already uses. A particle spun in a fluid feels a centrifugal force flinging it outwa"
tags: [settled, "swek-engine", v2690]
timestamp: v2690
---

# Centrifuge -- rotating-frame Stokes sedimentation that separates a mixture by the Svedberg coefficient

- **Status:** settled  
- **Since:** v2690

## Prediction

A centrifuge is mechanics, not chemistry -- and it is the same Stokes drag the thermal coupling already uses. A particle spun in a fluid feels a centrifugal force flinging it outward and a Stokes drag resisting the motion; in the overdamped limit they balance and it drifts outward at a terminal speed dr/dt = s*omega^2*r, where s = 2a^2(rho_p-rho_f)/9eta is the sedimentation coefficient. Because s grows with the square of size and with excess density, a mixture separates into bands by s -- the whole purpose of a centrifuge -- and every term is arithmetic, so it can be cross-architecture bit-identical.

## Why

physics/centrifuge.js. sedCoeff returns the Svedberg s; centrifugeStep advances each particle by the overdamped law dr/dt = s*omega^2*r, clamped to the tube; bandR reads the centre of each species\' band. Three species -- light-small, medium, heavy-big -- start mixed near the axis and separate as they spin. Only +,-,*,/, reusing the same Stokes drag as the strict thermal coupling.

## Measured

physics/centrifuge-selfcheck.mjs, 6 checks. Spun, the mixture bands out ordered by sedimentation coefficient (heavy outermost, light innermost); s scales as the square of radius (double a, quadruple s) and linearly with excess density; the radial speed is exactly s*omega^2*r; a neutrally buoyant particle (density equal to the fluid) does not sediment at all; a faster spin separates faster; and it is deterministic, arithmetic-only. Folded into the fingerprint as subsystem twenty-nine; a Lab scene and a preset drive it; master bd9492e5...

## Kill condition

physics/centrifuge-selfcheck.mjs. SABOTAGE: drop the square -- make s scale with a instead of a^2 -- and the a-squared law fails, because the quadratic dependence on size is exactly what lets a centrifuge resolve particles by size. Mechanics, not chemistry: no reaction, no rates, just centrifugal force against Stokes drag.

# Citations

- Code: physics/centrifuge.js (sedCoeff, centrifugeStep, bandR, radialSpeed) + physics/centrifuge-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 29), tools/ledger, tools/catalog + a Lab scene (three coloured species banding out) and a preset. Separation by sedimentation coefficient, cross-architecture.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
