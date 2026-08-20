---
type: claim
title: "Detection knows how to separate -- the contact is the minimum push that works"
description: "The narrow phase said whether two oriented boxes collide. This says how to part them: the contact normal and penetration depth, the minimum translation vector. It is the same 15-ax"
tags: [settled, "swek-engine", v2640]
timestamp: v2640
---

# Detection knows how to separate -- the contact is the minimum push that works

- **Status:** settled  
- **Since:** v2640

## Prediction

The narrow phase said whether two oriented boxes collide. This says how to part them: the contact normal and penetration depth, the minimum translation vector. It is the same 15-axis theorem read differently -- instead of stopping at the first separating axis, take the axis of LEAST overlap. Moving one body by depth times normal just clears the collision.

## Why

obbContact in physics/obbOverlap.js walks the same 6 face plus 9 edge-edge axes, normalises each (the one sqrt is IEEE-exact, so it stays cross-arch deterministic), and returns the least-overlap axis as the normal with its overlap as the depth, oriented to point from a toward b. Degenerate parallel-edge axes are skipped as redundant with a face axis.

## Measured

The test is the property itself: across 300 overlapping rotated pairs, moving b by the full MTV just clears the overlap and moving a hair less keeps it -- so the depth is exact and the normal is the true separating direction, including the edge-edge cases where the minimum axis is a cross product. The normal is unit length and points a to b, the axis-aligned case gives the exact depth, and hit agrees with the boolean test on all 400 pairs.

## Kill condition

physics/obbContact-selfcheck.mjs. SABOTAGE: take the MAX-overlap axis instead of the min -- the push-apart check fails, because pushing by too large a depth overshoots and a hair less is already separated. THE MINIMUM TRANSLATION VECTOR IS THE ONE THAT MOVES THE BODY THE LEAST WHILE STILL SEPARATING IT; any larger vector is a lie about how deep the contact is.

# Citations

- Code: physics/obbOverlap.js (obbContact + cross) + physics/obbContact-selfcheck.mjs (4 checks, gated, sabotage-tested). Detection to resolution in one theorem: the collision pipeline can now push bodies apart, deterministically, with no box3d.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
