---
type: claim
title: "The brain on the robot's head gets a glass dome with lights that flash and cast a glow over it"
description: "The naked brain from v2734 goes under glass. The brain shrinks and drops lower, carved into the forehead so it has room to breathe, and a semi-transparent dome caps it with the ant"
tags: [settled, "swek-engine", v2736]
timestamp: v2736
---

# The brain on the robot's head gets a glass dome with lights that flash and cast a glow over it

- **Status:** settled  
- **Since:** v2736

## Prediction

The naked brain from v2734 goes under glass. The brain shrinks and drops lower, carved into the forehead so it has room to breathe, and a semi-transparent dome caps it with the antenna emerging through the top. Inside the dome three coloured lights flash in rotation on a periodic cycle, each throwing a soft glow halo down over the brain -- so even when the GPU brain is idle the head has the mesmerising, lit-terrarium look of the hologram scenes, and when the brain solves the whirlpool still swirls inside it.

## Why

ui/swekRobot.js. The brain group now holds a dome interior, a smaller brain seated low, the whirlpool (re-centred and shrunk), three glow halos and three light cores, a glass dome path, and a shine highlight -- all inside the head group, so it nods and spins with the robot. The lights are pure CSS: three staggered flash animations (0, 1.2s, 2.4s offsets on a 3.6s cycle) rotate which light is lit, each halo pulsing a glow over the brain beneath it. The antenna and its ping ripple moved up to clear the taller dome.

## Measured

The robot module parses and check.mjs passes; the assembled brain group is well-formed SVG -- seven circles (the spark, three halos, three cores) and six paths (dome interior, brain, gyrus, whirlpool, glass, shine). The flash timing is periodic and staggered so exactly one light leads at a time.

## Kill condition

Open the server page and watch the robot head: the three dome lights must flash in rotation and cast a moving glow over the brain, idle or not; with the GPU brain solving, the whirlpool inside must also swirl. HONEST SCOPE: the SVG shape is proven headless; the flashing and the swirl are CSS animations only a browser runs, so they are confirmed on the rig like the other brain visuals. The lights are periodic for now -- a real trigger (a solve tick, a peer arriving) could drive them later.

# Citations

- Code: ui/swekRobot.js: the botBrain group rebuilt with a glass dome (botDomeGlass), glow halos (botDomeHalo) and light cores (botDomeLight), the swekDomeHalo/swekDomeCore flash animations, and the smaller re-centred whirlpool. The brain the agent runs on now sits under glass, lit.
- Page: `index.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
