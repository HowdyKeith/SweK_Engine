---
type: claim
title: The GPU brain was a word in the claims; now it is a concept you can open
description: "The OKF bundle described the engine's CLAIMS and DOCS, but not its SUBSYSTEMS. The GPU brain was the subject of ten claims and a word scattered across the bundle, with nothing you "
tags: [settled, "swek-engine", v2632]
timestamp: v2632
---

# The GPU brain was a word in the claims; now it is a concept you can open

- **Status:** settled  
- **Since:** v2632

## Prediction

The OKF bundle described the engine's CLAIMS and DOCS, but not its SUBSYSTEMS. The GPU brain was the subject of ten claims and a word scattered across the bundle, with nothing you could point to and say this is the brain. This makes it -- and six other subsystems -- first-class OKF concepts (type: component).

## Why

emitOKF.mjs now emits a component concept per declared subsystem: GPU Brain, box3d Physics, OKF Service, Peer Services Registry, strict-libm, Fracture Engine, Incremental Update. Each carries a description, an OKF `resource` field pointing at the key file it lives in, and links to the claims that reference it (found by matching keywords against each claim name + where). The brain concept points at brain/brain.js and links its ten claims. Served live at /okf/components/gpu-brain.md.

## Measured

The bundle went from 3 concept kinds (claim, doc, system) to 4 -- adding 7 component concepts + a components index, 327 internal links all resolving. The consumer and the service still pass unchanged (OKF consumers tolerate a new type), and the LAN console picks it up through the same brief.

## Kill condition

okf-selfcheck.mjs gained a check: every component concept's resource MUST resolve to a real file in the tree, and the GPU Brain MUST be present and linked to at least one claim. SABOTAGE: point the brain component at brain/nonexistent-brain.js -> the check fails. A COMPONENT THAT DESCRIBES CODE THAT ISN'T THERE IS A LIE THE KNOWLEDGE BASE TELLS ABOUT ITSELF.

# Citations

- Code: tools/okf/emitOKF.mjs (COMPONENTS declaration + componentDoc + emission) + tools/okf/okf-selfcheck.mjs (6th check, gated, phantom-file sabotage). The engine now models its own parts, not just its promises.
- Page: `/okf/components/gpu-brain.md`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
