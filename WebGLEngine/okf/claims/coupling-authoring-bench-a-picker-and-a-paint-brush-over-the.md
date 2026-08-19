---
type: claim
title: "Coupling authoring bench -- a picker and a paint brush over the verified couplings, no physics in the UI"
description: "Because every coupling is the same shape -- a map handed to one modulation pass -- the authoring tools fall out of a registry: a picker that lists the couplings, sliders built from"
tags: [settled, "swek-engine", v2669]
timestamp: v2669
---

# Coupling authoring bench -- a picker and a paint brush over the verified couplings, no physics in the UI

- **Status:** settled  
- **Since:** v2669

## Prediction

Because every coupling is the same shape -- a map handed to one modulation pass -- the authoring tools fall out of a registry: a picker that lists the couplings, sliders built from each coupling's parameters, and a brush that paints the per-node field the coupling reads. The danger is a UI that reimplements the physics and drifts from what is gated. The fix is a registry that holds only metadata and a faithful delegate to the verified module, and a page that holds no math at all.

## Why

physics/xpbd/couplingRegistry.js lists each coupling with its label, driver (field-painted vs stress-driven), kind (temporary/permanent/selective), parameter ranges, and a substep that DELEGATES to the gated module (modulatedSubstep with thermal/muscle maps, plasticSubstep for plasticity). couple.html imports that registry and builds its picker, sliders, and brush from it, then drives the same substeps the gates exercise -- so what you author is bit-identical to what the fingerprint proves.

## Measured

physics/xpbd/registry-selfcheck.mjs, 6 checks. Every registry coupling run through the registry equals its module called directly, byte-for-byte -- the registry delegates, it holds no physics. Slider metadata is well-formed (ranges ordered, defaults inside them). The registry covers exactly the fingerprinted couplings (thermal, muscle, plastic). Field-driven couplings name the field the brush paints while plasticity names none. Lookups resolve; the registry file contains no solver math. couple.html is rig-only (runs from the engine root); all three couplings step cleanly and finitely through its exact code paths. Master unchanged (38f2fcbc) -- an index and a UI add no new computation.

## Kill condition

physics/xpbd/registry-selfcheck.mjs. SABOTAGE: hardcode a parameter inside a registry substep so it diverges from its module -- the faithful-delegation check fails. IF THE REGISTRY COMPUTES ANYTHING THE MODULE DOES NOT, IT IS A SECOND COPY OF THE PHYSICS AND WILL DRIFT. couple.html is rig-only and unverifiable in the sandbox, so the registry it reads is gated instead.

# Citations

- Code: physics/xpbd/couplingRegistry.js (metadata + faithful delegates) + physics/xpbd/registry-selfcheck.mjs (6 checks, gated, sabotage-tested) + couple.html (rig-only picker + field-paint brush + live preview, builds itself from the registry). The authoring layer: set fields and pick maps, never reimplement the physics.
- Page: `couple.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
