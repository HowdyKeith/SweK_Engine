---
type: claim
title: "A GR-exact geodesic tracer reproduces the 4M/b light deflection and the 3 sqrt(3) M black-hole shadow"
description: "The last simulated-instrument benchmark, and the GR-exact one: light bending around a Schwarzschild black hole, integrated from the real null-geodesic orbit equation rather than th"
tags: [settled, "swek-engine", v2755]
timestamp: v2755
---

# A GR-exact geodesic tracer reproduces the 4M/b light deflection and the 3 sqrt(3) M black-hole shadow

- **Status:** settled  
- **Since:** v2755

## Prediction

The last simulated-instrument benchmark, and the GR-exact one: light bending around a Schwarzschild black hole, integrated from the real null-geodesic orbit equation rather than the pseudo-Newtonian potential. Far from the hole a ray bends by 4M/b, twice the Newtonian value -- the factor the 1919 eclipse measured to confirm general relativity -- and the tracer converges to it, reproducing even the second-order term 4M/b + (15 pi/4)(M/b)^2. Light with impact parameter below 3 sqrt(3) M is swallowed, and that critical value, the edge of the shadow the Event Horizon Telescope images, falls out of the metric to eleven digits. Nobody feeds the tracer these numbers.

## Why

physics/blackhole/geodesic.js: tracePhoton integrates d^2u/dphi^2 + u = 3 M u^2 with RK4, interpolating the escape crossing so the deflection is clean; captureThreshold bisects for the shadow edge; tracePath returns the ray path for drawing. weakDeflection, criticalImpact, and photonSphere give the analytic values. geodesic.html traces a fan of rays -- captured ones falling into the shadow, escaping ones bending, the tightest winding past the photon sphere.

## Measured

geodesic-selfcheck.mjs, 3 checks: at b=1000M the deflection is within 0.3 percent of 4M/b with the residual shrinking as 1/b; across b = 200, 100, 50 it matches the two-term GR series to under half a percent, so it is solving the geodesic not reciting the leading term; and the capture threshold matches 3 sqrt(3) M to about 1e-11, with light just inside swallowed and just outside escaping.

## Kill condition

physics/blackhole/geodesic-selfcheck.mjs. SABOTAGE: change the relativistic term in the orbit equation, which turns the bending back toward the Newtonian value and moves the shadow -- the exact discrepancy that made 1919 a test of Einstein over Newton -- and the checks fail. HONEST SCOPE: this is a BENCHMARK graded against GR's own closed forms, not an observation. Equatorial Schwarzschild geodesics -- no spin (Kerr), no redshift or Doppler beaming, no accretion disk; it is the light bending and the shadow size, which is what has exact analytic answers to grade against.

# Citations

- Code: physics/blackhole/geodesic.js + physics/blackhole/geodesic-selfcheck.mjs + geodesic.html. The GR-exact companion to the pseudo-Newtonian blackHole.js -- envelope item four, and the last of them.
- Page: `geodesic.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
