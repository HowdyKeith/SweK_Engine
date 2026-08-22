---
type: claim
title: "Fluid-mesh coupling -- two-way pressure, the capstone: fluid caves the mesh and the mesh holds the fluid"
description: "The fourth coupling and the first that flows both ways. Fluid pressure should cave a mesh AND the mesh boundary should hold the fluid out -- and these are not two forces but one co"
tags: [settled, "swek-engine", v2670]
timestamp: v2670
---

# Fluid-mesh coupling -- two-way pressure, the capstone: fluid caves the mesh and the mesh holds the fluid

- **Status:** settled  
- **Since:** v2670

## Prediction

The fourth coupling and the first that flows both ways. Fluid pressure should cave a mesh AND the mesh boundary should hold the fluid out -- and these are not two forces but one constraint. A fluid particle and a mesh node closer than the contact distance get a unilateral distance constraint whose correction is split by inverse mass, so both move: the fluid particle out, the mesh node in. Two-way coupling is momentum, not a special case.

## Why

physics/xpbd/fluid.js. findCrossContacts discovers the fluid-mesh contact set across the two particle buffers and SORTS it (the self-collision determinism rule), so the bipartite set is a pure function of both positions. solveCrossContacts pushes each pair apart unilaterally, moving BOTH sides by inverse mass. fluidMeshSubstep predicts both bodies, solves the mesh cloth, keeps the fluid incompressible (particle-particle contact), then the two-way contacts, then finalizes both. The fluid here is a minimal incompressible blob; a full PBF/SPH solver plugs into the same fluid-fluid slot.

## Measured

physics/xpbd/fluid-selfcheck.mjs, 6 checks. A contact moves both sides split by inverse mass -- equal masses move equally, a four-times-heavier mesh node moves a quarter as far -- out to exactly the contact distance. The fluid load caves the mesh center down; the mesh holds the fluid bulk far above where it would free-fall unsupported. The sorted cross-contacts are order-free across 40 scrambled walks and the coupled step reproduces byte-for-byte; a single contact matches its closed form to 1e-12. Folded into the fingerprint as subsystem sixteen (fluid-mesh); master 5de178a5... Added to the coupling registry (driver body) so it appears in couple.html.

## Kill condition

physics/xpbd/fluid-selfcheck.mjs. SABOTAGE: drop the mesh half of the contact correction -- the fluid slides off a static wall, and the two-way check and the caving check both fail. A CONTACT THAT MOVES ONLY ONE SIDE IS A WALL, NOT A COUPLING. The fluid-fluid and fluid-mesh contact solves are graph-colored and atomic-free; GPU port is rig-only.

# Citations

- Code: physics/xpbd/fluid.js (findCrossContacts sorted cross-set discovery, solveCrossContacts two-way unilateral, fluidMeshSubstep coupled loop) + physics/xpbd/fluid-selfcheck.mjs (6 checks, gated, sabotage-tested) + couplingRegistry.js entry (driver body) + couple.html fluid mode + folded into tools/fingerprint (subsystem 16) and tools/ledger. The fourth coupling -- the mesh and the fluid finally move each other.
- Page: `couple.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
