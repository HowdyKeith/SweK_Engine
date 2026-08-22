---
type: claim
title: "Asteroid impact -- the real chain (approach, entry, energy, crater), no theatre"
description: "An asteroid hitting a planet, built from only the parts that are real. Gravity focuses the approach so the planet catches asteroids from a disc wider than itself, and focuses slow "
tags: [settled, "swek-engine", v2715]
timestamp: v2715
---

# Asteroid impact -- the real chain (approach, entry, energy, crater), no theatre

- **Status:** settled  
- **Since:** v2715

## Prediction

An asteroid hitting a planet, built from only the parts that are real. Gravity focuses the approach so the planet catches asteroids from a disc wider than itself, and focuses slow ones more. By energy conservation nothing lands slower than the escape speed. Crossing the thin atmosphere a small body sheds most of its speed while a large one barely notices, because drag deceleration goes as one over the radius. The delivered energy is one-half m v-squared, and the crater grows as roughly the cube root of that energy.

## Why

physics/impact.js, four honest stages. The vacuum approach (gravitational focusing, an escape-speed floor, the bent trajectory) is add/subtract/multiply/divide and square root only, so it is fingerprinted as subsystem 43. The atmospheric entry uses an exponential density and the crater law a fractional power, so those are gated but deliberately left out of the bit-identity set.

## Measured

physics/impact-selfcheck.mjs, 6 checks. The capture radius is 1.73 planet-radii at approach speed 1 and 3.0 at half that; an asteroid from rest still lands at the escape speed; a half-metre pebble leaves the atmosphere at a tenth of its entry speed while a half-kilometre asteroid keeps 99.8 percent; a 500-metre rock arrives with 3e20 joules, about 75000 megatons; a thousandfold energy makes a crater only 7.6 times wider. New master f4b6bfce...

## Kill condition

physics/impact-selfcheck.mjs. SABOTAGE: switch off gravitational focusing -- reduce the capture radius to the planet's own width -- and the focusing check fails, because a planet really does reach out past its edge to pull impactors in. HONEST SCOPE: no fireball, shockwave or debris cloud is simulated -- those are theatre; what is here is the approach, the entry selectivity, the energy and the crater size, each a real number.

# Citations

- Code: physics/impact.js (focusing approach + drag entry + energy + crater scaling) + physics/impact-selfcheck.mjs (6 checks, sabotage-tested) + fingerprint subsystem 43 (the vacuum approach) + a Physics Lab scene with an aim slider that drops the asteroid inside or outside the capture radius. Real chain, no theatre, and the cross-architecture line drawn exactly where the maths crosses it.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
