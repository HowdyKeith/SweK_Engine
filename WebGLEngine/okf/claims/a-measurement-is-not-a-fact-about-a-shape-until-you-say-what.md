---
type: claim
title: A measurement is not a fact about a shape until you say what measured it
description: "Keith: 'what about the stefan banach-tarski paradox? i know it's been solved but what to point it out as a thing.' IT IS NOT SOLVED -- IT IS A THEOREM AND IT IS TRUE. A ball cuts i"
tags: [settled, "swek-engine", v2562]
timestamp: v2562
---

# A measurement is not a fact about a shape until you say what measured it

- **Status:** settled  
- **Since:** v2562

## Prediction

Keith: 'what about the stefan banach-tarski paradox? i know it's been solved but what to point it out as a thing.' IT IS NOT SOLVED -- IT IS A THEOREM AND IT IS TRUE. A ball cuts into five pieces and reassembles by rigid motions into two identical balls. What saves it is that THE PIECES HAVE NO VOLUME -- not zero, NONE; they are non-measurable. AND IT CANNOT HAPPEN HERE: the construction needs uncountably many choices and FLOATS ARE COUNTABLE, so every set this engine can represent is measurable BY CONSTRUCTION. The paradox is unreachable from a finite machine. PREDICTION: the engine loses volume anyway -- not by paradox, by DISCRETISATION -- and v2538's claim that 'the hybrid preserves volume' should therefore be measurable and possibly wrong.

## Why

Banach-Tarski is the sharpest possible statement that VOLUME IS AN ASSUMPTION YOU ARE ENTITLED TO, NOT A FACT ABOUT SHAPES. This engine is entitled to it because of floats. That entitlement says nothing about whether the pipeline USES it correctly.

## Measured

I ALMOST SHIPPED THE WRONG STORY. The first pass compared the marched mesh to the field's CELL COUNT: errors to -9.76%, NOT MONOTONIC in resolution (32 beat 48). The obvious headline was 'marching cubes does not conserve volume'. THAT HEADLINE WAS AN ARTEFACT OF THE RULER. Calibrated against A SPHERE WHOSE VOLUME IS KNOWN (r=0.8, analytic 2.14466): marched mesh 2.13754 (-0.33%), cell count 2.12609 (-0.87%). THE MESH IS MORE ACCURATE THAN THE THING I WAS CALLING TRUTH -- cell-counting is a STAIRCASE, marching cubes INTERPOLATES THE CROSSING. The non-monotonicity was the ruler wobbling, not the mesh. AT flesh.html's OWN GRID (cells=28, read from line 123): mesh 0.62996 vs field 0.62860, 0.22% apart, MESH CLOSED WITH ZERO BOUNDARY EDGES. v2538's claim survives.

## Kill condition

Already settled, but the honest limit: the sphere calibration proves the MARCHER, not the FIELD. If hybridGrid's blend produced a field whose zero-crossing is not where the flesh actually is, both rulers would agree with each other and both would be wrong. THAT would need a third measurement -- particle count times particle volume -- and it is not built.

# Citations

- Code: physics/soft/volume.js (meshVolume by tetrahedra-to-origin, EXACT for a closed surface; fieldVolume by cell count; meshClosure by directed-edge parity) + volume-selfcheck.mjs (9 checks, gated). THE LESSON, WHICH IS BANACH-TARSKI'S AT THE ORDINARY END: TWO RULERS DISAGREEING TELLS YOU THEY DISAGREE, NOT WHICH ONE IS LYING. The only way to know was a shape whose answer exists independently of the machinery. meshClosure exists because meshVolume() RETURNS A NUMBER FOR AN OPEN MESH and that number is meaningless -- A NUMBER IS NOT A VOLUME UNTIL SOMETHING CHECKS THE SURFACE IS CLOSED.
- Page: `/flesh.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
