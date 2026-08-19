---
type: claim
title: "Position-based fluids -- a real density solver for the fluid slot, made deterministic by sorted sums"
description: "The fluid coupling shipped with a placeholder incompressibility (particles that just refuse to overlap). This drops the real Macklin-Muller PBF density solver into that slot: press"
tags: [settled, "swek-engine", v2671]
timestamp: v2671
---

# Position-based fluids -- a real density solver for the fluid slot, made deterministic by sorted sums

- **Status:** settled  
- **Since:** v2671

## Prediction

The fluid coupling shipped with a placeholder incompressibility (particles that just refuse to overlap). This drops the real Macklin-Muller PBF density solver into that slot: pressure from density, where an over-packed region has a positive density constraint and the projection spreads it back to rest. Its kernels are polynomial, so no transcendental; its one numerical trap is that density is a floating-point sum over neighbours, and sum order changes the last bit.

## Why

physics/xpbd/pbf.js. poly6 and the spiky gradient are built with h^9 and h^6 formed by multiplication (no Math.pow, a libm call). Each particle carries C_i = rho_i/rho0 - 1; pbfProject computes lambda per particle then the position correction dp_i = (1/rho0) sum (lambda_i + lambda_j) gradW. The determinism hinge: buildNeighbors collects each particle's neighbours in whatever order the spatial hash walked them, then SORTS the list into a canonical order, so the density sum is the same bits on every machine regardless of how a parallel binning collected them.

## Measured

physics/xpbd/pbf-selfcheck.mjs, 6 checks. The projection relaxes a compressed blob from density RMS error 1.9 toward 0.06 -- real pressure from real density. Two runs are byte-identical; neighbours built from 30 scrambled particle walks give byte-identical positions, because the sorted list is canonical. The poly6 and spiky kernels match their closed forms to 1e-12 and cut off at h. Heavy compression stays finite over 40 projections. Folded into the fingerprint as subsystem seventeen (pbf-fluid); master c74eff73... The coupling bench is now linked from server.html.

## Kill condition

physics/xpbd/pbf-selfcheck.mjs. SABOTAGE: remove the neighbour-list sort -- the raw collection order (which follows the bucket walk) leaks into the density sums and the order-independence check fails. FLOATING-POINT SUMS ARE NOT ASSOCIATIVE, SO AN UNSORTED NEIGHBOUR LIST MAKES THE FLUID DEPEND ON THREAD SCHEDULING. This PBF solver plugs into the fluid-fluid slot of the fluid-mesh coupling; the GPU port is rig-only.

# Citations

- Code: physics/xpbd/pbf.js (poly6/spiky polynomial kernels, buildNeighbors with canonical sort, pbfProject density projection) + physics/xpbd/pbf-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 17) and tools/ledger + couple.html linked from server.html. A real fluid for the fluid slot, deterministic to the bit.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
