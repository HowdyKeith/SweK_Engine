---
type: claim
title: "Physics Lab contrasts -- A/B pairs where the difference is the lesson, gated to actually differ"
description: "A single preset shows one state; the way you teach what a parameter DOES is to put two states side by side and flip between them. A friction of 0.1 against 0.9, a cold cloud agains"
tags: [settled, "swek-engine", v2692]
timestamp: v2692
---

# Physics Lab contrasts -- A/B pairs where the difference is the lesson, gated to actually differ

- **Status:** settled  
- **Since:** v2692

## Prediction

A single preset shows one state; the way you teach what a parameter DOES is to put two states side by side and flip between them. A friction of 0.1 against 0.9, a cold cloud against a boiling one, a muscle relaxed against fired -- the same scene, one value changed, flipped back and forth so the eye catches the difference. And a contrast whose two sides look the same is worse than none, so each pair must be proven to actually differ.

## Why

physics/labPresets.js gains CONTRASTS: pairs, each a scene and two sides differing in one parameter, with labels. The Lab lists them, loads a side, and an A/B button re-runs the scene on the other side; both sides go through the same applyPreset path as presets and links. Five pairs at first -- friction, diffusion temperature, centrifuge spin, muscle activation, balloon inflation.

## Measured

physicsLab-selfcheck.mjs, an added check runs both sides of every contrast and requires not only that each side is a real scene and finite, but that the two sides differ by more than three percent in their configuration -- a contrast has to contain a contrast. All five pass.

## Kill condition

physicsLab-selfcheck.mjs. SABOTAGE: set a pair\'s two sides to the same parameter and the check names it a weak contrast and fails, because flipping between two identical states teaches nothing. The pairs are proven to differ every ship, so every A/B flip in the Lab shows a real difference rather than a placebo. No new physics; master unchanged at bd9492e5.

# Citations

- Code: physics/labPresets.js (CONTRASTS: 5 A/B pairs) + physicsLab-selfcheck.mjs (contrast-differ check, sabotage-tested) + physics-lab.html (Contrast panel: pick a pair, flip A/B). The difference made the lesson, and proven to exist.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
