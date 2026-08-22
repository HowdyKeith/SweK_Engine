---
type: claim
title: "Muscle -- a neural activation signal shrinks fiber rest length, turning data into motion"
description: "The third coupling, and the one that makes a passive mesh a machine: a per-node activation signal -- the same field the brain emits when a spike travels an SVO path -- shortens the"
tags: [settled, "swek-engine", v2668]
timestamp: v2668
---

# Muscle -- a neural activation signal shrinks fiber rest length, turning data into motion

- **Status:** settled  
- **Since:** v2668

## Prediction

The third coupling, and the one that makes a passive mesh a machine: a per-node activation signal -- the same field the brain emits when a spike travels an SVO path -- shortens the rest length of the fibers it touches, so the signal does mechanical work. Selective (only flagged fibers respond) and temporary (recompute from base means it relaxes when the signal stops, unlike plasticity).

## Why

physics/xpbd/muscle.js. muscleModulate is a map on the modulation spine: for a fiber flagged muscle, rest = rest0 * (1 - contraction * activation_edge), activation_edge the mean of the two node activations; passive constraints are returned at base. Because the spine recomputes rest from rest0 every frame, a fiber contracts under signal and relaxes fully when the signal drops -- no set taken. markRowFibers designates the actuating band of a strip.

## Measured

physics/xpbd/muscle-selfcheck.mjs, 6 checks. A fully activated fiber shortens to exactly its contracted rest and pulls its free end in. Dropping activation to zero relaxes it back to rest exactly (the plasticity contrast). Firing the top band of a pinned strip curls its tip one way and the bottom band curls it the other, straddling the relaxed pose -- the signal chooses the direction of motion. A body with no fibers flagged behaves identically whether the field is full or zero. Order-free across 40 shuffled scans; the map matches rest0*(1 - contraction*activation) to 1e-12. Folded into the fingerprint as subsystem fifteen (muscle-actuator, a strip crawled by a travelling contraction band); master 38f2fcbc...

## Kill condition

physics/xpbd/muscle-selfcheck.mjs. SABOTAGE: remove the muscle-flag guard so passive structure contracts too -- the selectivity check fails, because A COUPLING THAT CONTRACTS EVERYTHING IS A GLOBAL SHRINK, NOT A MUSCLE. The activation field is produced by the GPU brain; this coupling is the wire from signal to motion. GPU port: a per-node signal texture read in a pre-solve pass (rig-only).

# Citations

- Code: physics/xpbd/muscle.js (muscleModulate signal-to-contraction map on the spine, markRowFibers) + physics/xpbd/muscle-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 15) and tools/ledger. Bio-AI coupling -- the brain's signals become mechanical work.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
