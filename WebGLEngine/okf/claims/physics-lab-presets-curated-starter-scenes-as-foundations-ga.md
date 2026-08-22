---
type: claim
title: "Physics Lab presets -- curated starter scenes as foundations, gated so none can rot"
description: "A Lab that opens to a blank balloon asks a user to know what to build; a Lab that opens to a menu of working configurations gives them a foundation to build ON. Each preset should "
tags: [settled, "swek-engine", v2689]
timestamp: v2689
---

# Physics Lab presets -- curated starter scenes as foundations, gated so none can rot

- **Status:** settled  
- **Since:** v2689

## Prediction

A Lab that opens to a blank balloon asks a user to know what to build; a Lab that opens to a menu of working configurations gives them a foundation to build ON. Each preset should be a genuine starting point for a regime -- a body-temperature aquarium, a boiling diffusion, a steep sand pile -- and, because a starter that no longer works is worse than none, each should be proven to run.

## Why

physics/labPresets.js holds the presets as pure data -- a scene, the slider values, a camera, whether the skin is on -- shared by physics-lab.html (which renders them as a dropdown and applies them through the same restore path the URL save/load uses) and the gate. The Blobarium page now links straight into its own aquarium preset in the Lab, so the two halves of the same physics are one click apart.

## Measured

physicsLab-selfcheck.mjs, an added check runs every preset through the scene helpers and confirms it names a real scene and produces a finite, working state -- all nine pass. The dropdown and the cross-link are rig-only UI over that gated list.

## Kill condition

physicsLab-selfcheck.mjs. SABOTAGE: point a preset at a scene that does not exist and the check names it and fails, because a foundation that opens to a broken start is a trap. The presets are data checked against the real scenes every ship, so the menu is always a menu of things that work. No new computation; master unchanged at f8708b8e.

# Citations

- Code: physics/labPresets.js (9 curated presets, pure data) + physicsLab-selfcheck.mjs (preset validity check, sabotage-tested) + physics-lab.html (preset dropdown, applyPreset) + a Physics Lab cross-link from blobarium.html into the aquarium preset. Foundations to build on, proven to work.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
