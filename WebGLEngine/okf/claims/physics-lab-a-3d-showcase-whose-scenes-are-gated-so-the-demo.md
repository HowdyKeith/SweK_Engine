---
type: claim
title: "Physics Lab -- a 3D showcase whose scenes are gated so the demo cannot rot"
description: "The engine has twenty-seven deterministic physics subsystems but only the cloth-field and fluid couplings were ever demoable, in couple.html. The newer 3D physics -- the volume bal"
tags: [settled, "swek-engine", v2682]
timestamp: v2682
---

# Physics Lab -- a 3D showcase whose scenes are gated so the demo cannot rot

- **Status:** settled  
- **Since:** v2682

## Prediction

The engine has twenty-seven deterministic physics subsystems but only the cloth-field and fluid couplings were ever demoable, in couple.html. The newer 3D physics -- the volume balloon, the composed muscle, the wind-driven flag -- had no showcase. A single bench should run them live and draw them in 3D -- eight scenes (the seven physics couplings plus the Blobarium aquarium) now: the balloon, the composed muscle, the wind-driven flag, a granular pile finding its angle of repose, an anisotropic cloth stretching along its soft direction, particles swirling in a sampled field, and the Blobarium's thermal coupling where a temperature drives Brownian motion and is read back from the wander -- and because a demo that quietly stops working is worse than none, its scenes are gated: driven headless every ship.

## Why

physics-lab.html is a rig-only page (its ES imports of ./physics/xpbd/* resolve only from the engine root, like couple.html and server.html), holding no physics of its own -- it only renders the gated modules in a rotating 3D projection with a per-scene slider. physicsLab-selfcheck.mjs drives the same eight scene configurations headless and asserts they behave. The seven physics scenes are cross-architecture bit-identical (the diffusion scene was moved onto the strict-libm Gaussian in v2686); the aquarium scene runs on box3d WASM on the rig and on the planar-fallback world -- which the lockstep gate proves deterministic -- everywhere the WASM is not built.

## Measured

physicsLab-selfcheck.mjs, 10 checks. The aquarium's collision holds the bodies apart -- the nearest pair stays past a body diameter, true only because the collision resolves overlaps -- while warmth grows the cloud, deterministically. The balloon inflates and deflates; the muscle bulges when fired; the flag holds under a quarter strain; the pile heaps steeper with more friction; the anisotropic cloth gives more along its soft direction; the swirl circulates; the diffusion scene couples warmth to Brownian motion so a warmer setpoint reads back hotter (cross-architecture via the strict-libm Gaussian); every scene stays finite; and the XPBD scenes replay byte-for-byte. Wired into server.html beside the Coupling Bench.

## Kill condition

physicsLab-selfcheck.mjs. SABOTAGE: freeze a scene -- make the balloon ignore its inflation slider -- and the inflate/deflate check fails. A SHOWCASE WHOSE SCENES HAVE QUIETLY STOPPED WORKING IS WORSE THAN NO SHOWCASE, so the scenes are gated exactly like the physics they display. No new computation -- master unchanged at 1613829e.

# Citations

- Code: physics-lab.html (rig-only 3D bench: balloon / muscle / flag / pile / stretch / swirl / diffusion / aquarium scenes, rotating projection, per-scene slider, bodies drawn at collision radius) + physicsLab-selfcheck.mjs (10 checks, gated, sabotage-tested) + a link wired into server.html. Consolidation: the physics made visible without becoming unverified.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
