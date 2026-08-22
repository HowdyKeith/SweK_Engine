---
type: claim
title: "Three-body figure-eight -- a stable choreography on the orbit engine, bit-identical"
description: "The three-body problem has no general closed-form solution, but it has some exact periodic solutions, and the loveliest is the figure-eight: three equal masses chasing one another "
tags: [settled, "swek-engine", v2701]
timestamp: v2701
---

# Three-body figure-eight -- a stable choreography on the orbit engine, bit-identical

- **Status:** settled  
- **Since:** v2701

## Prediction

The three-body problem has no general closed-form solution, but it has some exact periodic solutions, and the loveliest is the figure-eight: three equal masses chasing one another around a single figure-eight curve forever, never colliding, never escaping, each a third of a period behind the next on the same track. It exists only for one precise set of initial conditions -- Simo\'s numbers -- and it runs on exactly the N-body gravity and symplectic velocity-Verlet the orbit subsystem already provides, so it is +,-,*,/ and sqrt, bit-identical across machines.

## Why

physics/figureEight.js. Only the magic initial conditions (positions and velocities from Simo, total momentum zero, G and all masses one) and the period 6.32591; the integration is orbit.js unchanged. That the whole three-body dance is just initial conditions on the existing engine is the point -- the orbit subsystem was built N-body for exactly this.

## Measured

physics/figureEight-selfcheck.mjs, 4 checks. After one period the three masses return to their start to 2e-3 (periodic); a third of a period in, body one reaches the origin where body three began, to 3e-3 (the choreography -- one shared curve, evenly spaced in time); energy holds to 1e-5 and angular momentum to 1e-9 over the period; and it is deterministic and pure. Folded into the fingerprint as subsystem thirty-seven; a Lab scene traces the eight with three trails and a preset opens it overhead; master 79d664a8...

## Kill condition

physics/figureEight-selfcheck.mjs. SABOTAGE: nudge one initial coordinate and the eight unravels -- the periodic-return and choreography checks fail, because the figure-eight is a knife-edge solution that exists only at the exact numbers. A perturbed start is a different, non-periodic three-body tangle.

# Citations

- Code: physics/figureEight.js (makeFigureEight, FIG8_PERIOD, on orbit.js) + physics/figureEight-selfcheck.mjs (4 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 37), tools/ledger, tools/catalog + a Lab scene (three trailed bodies on one curve) and a preset. The three-body choreography, cross-architecture on the orbit engine.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
