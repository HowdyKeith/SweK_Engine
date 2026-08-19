---
type: claim
title: "Muscle belly -- a biological actuator composed from volume conservation and contractile fibres"
description: "A real muscle bulges as it shortens, because its volume is very nearly constant -- the length it loses along its axis has to go somewhere, and it goes out to the sides. That is two"
tags: [settled, "swek-engine", v2681]
timestamp: v2681
---

# Muscle belly -- a biological actuator composed from volume conservation and contractile fibres

- **Status:** settled  
- **Since:** v2681

## Prediction

A real muscle bulges as it shortens, because its volume is very nearly constant -- the length it loses along its axis has to go somewhere, and it goes out to the sides. That is two constraints this engine already has, composed: the volume constraint that conserves a closed mesh's enclosed volume, and the contraction that shortens a flagged fibre. Put the contractile fibres along the axis of an elongated closed mesh and fire them, and the belly must bulge; the bulge is not a separate effect but the conserved volume forced sideways.

## Why

physics/xpbd/muscleVolume.js. buildMuscleBelly elongates an icosphere and flags its mostly-axial edges as fibres; contractMuscle shortens their rest length by the activation; muscleVolumeSubstep solves the mesh edges then the single volume constraint. Neither constraint knows about the other -- the muscle behaviour emerges from running both. It composes two already-gated subsystems (volume-balloon and the muscle contraction) into a new one.

## Measured

physics/xpbd/muscleVolume-selfcheck.mjs, 6 checks. Firing the fibres shortens the belly along its axis; with the volume constraint the enclosed volume holds within 5 percent while WITHOUT it the belly collapses and loses over half its volume; the girth swells far more with conservation than without, because the extra bulge is exactly the displaced volume; a harder contraction bulges it further, monotonically. Two firings are byte-identical. Folded into the fingerprint as subsystem twenty-seven (muscle-belly); master 1613829e...

## Kill condition

physics/xpbd/muscleVolume-selfcheck.mjs. SABOTAGE: flag the lateral edges as fibres instead of the axial ones -- firing them squeezes the girth and the belly LENGTHENS, and the contract check fails, because a muscle that gets longer when it fires is not a muscle. The bulge is the conserved volume: turn the volume constraint off and the belly simply shrinks.

# Citations

- Code: physics/xpbd/muscleVolume.js (buildMuscleBelly axial-fibre flagging, contractMuscle, muscleVolumeSubstep composing edges + volume, bellyShape) + physics/xpbd/muscleVolume-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 27) and tools/ledger. Two constraints composed into a muscle.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
