---
type: claim
title: "The neighbour grid makes MD scale, and changes nothing while doing it"
description: "The all-pairs force loop is quadratic; with a cutoff most pairs are too far to matter. This buckets atoms into cells of side equal to the cutoff, so each atom only checks its own c"
tags: [settled, "swek-engine", v2646]
timestamp: v2646
---

# The neighbour grid makes MD scale, and changes nothing while doing it

- **Status:** settled  
- **Since:** v2646

## Prediction

The all-pairs force loop is quadratic; with a cutoff most pairs are too far to matter. This buckets atoms into cells of side equal to the cutoff, so each atom only checks its own cell and the 26 around it -- turning the force loop linear for a uniform system, the same spatial-hash idea as the rigid-body broad-phase.

## Why

physics/md/neighborGrid.js. With the cell side equal to the cutoff, any two atoms closer than the cutoff differ by at most one cell in each axis, so they are always in the 27-cell neighbourhood -- no within-cutoff pair can be missed. Cell indexing is floor(x/cutoff), arithmetic only, so the neighbour set is deterministic. computeForcesGrid reuses the exact LJ law from md.js so there is one force law, not two.

## Measured

Across 30 scenes of 150 atoms the grid pair set equals the brute-force within-cutoff set EXACTLY -- no pair missed, none invented. Grid forces match the brute-force forces to zero difference, and the energy matches. The neighbour set is byte-identical run to run. And it prunes hard: 19 pairs where the all-pairs count is 19900.

## Kill condition

physics/md/neighborGrid-selfcheck.mjs. SABOTAGE: search only the atom own cell instead of the 27-cell neighbourhood -- the pair set no longer equals brute force, because within-cutoff pairs that straddle a cell boundary are dropped. A NEIGHBOUR GRID THAT MISSES A PAIR IS A FORCE SILENTLY SET TO ZERO. A speedup must change the speed, not the answer.

# Citations

- Code: physics/md/neighborGrid.js (neighborPairs/computeForcesGrid) + physics/md/neighborGrid-selfcheck.mjs (4 checks, gated, sabotage-tested, brute-force cross-checked). MD force field: LJ + bonds + angles + Coulomb, now scalable.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
