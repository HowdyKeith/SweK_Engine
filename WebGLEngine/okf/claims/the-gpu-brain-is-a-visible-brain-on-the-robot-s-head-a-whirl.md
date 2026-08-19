---
type: claim
title: "The GPU brain is a visible brain on the robot's head -- a whirlpool that swirls while it solves"
description: "The robot avatar gets a brain. A bumpy brain cap is seated on the head top, with the antenna emerging through it, and inside it a whirlpool. When the GPU brain is idle the whirlpoo"
tags: [settled, "swek-engine", v2734]
timestamp: v2734
---

# The GPU brain is a visible brain on the robot's head -- a whirlpool that swirls while it solves

- **Status:** settled  
- **Since:** v2734

## Prediction

The robot avatar gets a brain. A bumpy brain cap is seated on the head top, with the antenna emerging through it, and inside it a whirlpool. When the GPU brain is idle the whirlpool sits dim and still; when the brain is solving the whirlpool swirls and the cap warms to a teal glow with a pulsing spark at its core. So the brain-idle line in the corner becomes a thing you can see on the robot -- the same avatar that already speaks and nods now shows you its mind turning.

## Why

ui/swekRobot.js. The brain group is part of the head, so it nods and spins with it; the whirlpool is an Archimedean spiral rotated by CSS only while a brainOn class is set. createSwekRobot polls /ai/brain/health on a timer and toggles that class -- live means the whirlpool turns. All of it is fail-safe: the poll is wrapped, and any error just leaves the whirlpool still. The antenna and its ping ripple moved up to sit above the new brain, ripple included.

## Measured

The robot module parses; the brain group, whirlpool, gyri and spark render into the head; the whirlpool path generates; setBrainActive toggles the class and the poll is wired to the health endpoint. check.mjs passes. This is a browser visual, so the swirl itself is rig-verify -- the structure and the wiring are proven headless, the animation is confirmed on the machine.

## Kill condition

Open the server page with the GPU brain solving: the whirlpool on the robot head must turn and the cap must glow; idle, it must sit still. HONEST SCOPE: the SVG shape and the health poll are proven headless; the actual swirl is a CSS animation only a browser runs, so it is confirmed on the rig like the WebGL pane and the dock swap. It reads the same /ai/brain/health as the dock brain, so the two always agree.

# Citations

- Code: ui/swekRobot.js: the botBrain group on the head (dome + gyri + whirlpool + spark), the swekWhirl CSS animation, setBrainActive, and the /ai/brain/health poll. The idle line in the corner is now a brain you can watch think.
- Page: `index.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
