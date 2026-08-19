---
type: claim
title: "The 2f drag-lift relation is not blocked by the boundary condition any more -- it is blocked by confinement raising the shedding onset"
description: "Textbook says drag oscillates at TWICE the lift frequency behind a shedding cylinder. This engine has failed to reproduce that since v2797, and the reason has now moved twice. v279"
tags: [open, "swek-engine", v2862]
timestamp: v2862
---

# The 2f drag-lift relation is not blocked by the boundary condition any more -- it is blocked by confinement raising the shedding onset

- **Status:** open  
- **Since:** v2862

## Prediction

Textbook says drag oscillates at TWICE the lift frequency behind a shedding cylinder. This engine has failed to reproduce that since v2797, and the reason has now moved twice. v2797 blamed run length. v2834 proved that wrong with arithmetic: a body-force-driven periodic channel couples shedding to drag to velocity to shedding, so the Reynolds number breathes and never settles -- every attempt drifted 12 to 21 percent. v2835 built a fixed-velocity inlet to break that loop. THE PREDICTION IS THAT THE INLET HOLDS AND THE REMAINING BLOCKER IS PHYSICS, NOT PLUMBING: with the velocity pinned from outside, the Reynolds number stops drifting, and whether a vortex street appears is then governed purely by how far confinement pushes the onset above the unconfined value of about 47.

## Why

simulation/lbm/twoFExperiment.mjs drives the gated Zou-He inlet from lbm2d.js, takes forces from the gated windTunnel solidForce, and takes frequencies from the gated sheddingSpectrum -- it computes no spectrum of its own, so it cannot grade itself. Three constraints bind at once and are all measured elsewhere: tau at or above about 0.54 or the inlet diverges, inlet speed at or below about 0.1 or lattice compressibility error stops being ignorable, and Reynolds above the onset, which confinement raises. The symmetry is deliberately broken with a small cylinder offset, because the von Karman instability IS a symmetry-breaking bifurcation and a perfectly symmetric discrete problem can sit on the unstable symmetric branch and report no shedding well past onset.

## Measured

THREE full runs at v2862. THE INLET HELD on both healthy runs: drift 0.15 and 0.11 percent, against the 12 to 21 percent that killed every earlier attempt -- the v2834 feedback loop is broken and v2835 did what it was built to do. NEITHER SHED. Not a wrong frequency, NO frequency, so the drag-over-lift ratio has no value at all. Run one Reynolds about 65 at 14.8 percent blockage; run two raised it to about 85 and broke the symmetry, growing lift amplitude fivefold from 0.023 to 0.115 -- the perturbation took but never sustained. That extends v2749: no shedding by Reynolds about 58 at 21 percent blockage there, none by about 85 at 16 percent here. RUN THREE BOUGHT REYNOLDS 120 BY GOING WIDER AND FASTER AND THE FIELD DIVERGED, with inlet speed exactly on the 0.1 validity ceiling and tau just above the measured 0.54 inlet floor. That is the envelope measured rather than assumed: with U pinned at its ceiling and tau at its floor, the only remaining lever for Reynolds is cylinder diameter, and diameter must grow with channel height to keep blockage low -- so buying Reynolds costs domain AREA, quadratically.

## Kill condition

simulation/lbm/twoFExperiment-selfcheck.mjs. It deliberately does NOT assert that 2f reproduces, because it did not. What it asserts is that the verdict REFUSES TO SCORE AN UNQUALIFIED RUN -- the failure mode here is not a wrong number, it is a confident number taken from a flow that never oscillated, and null over null can produce one. Disqualification is pinned for all four ways it happens: lift not sustained, no frequency resolved, inlet drifted, field diverged. SABOTAGE equivalent: a qualified run away from 2 must stay an HONEST NEGATIVE rather than being disqualified, or the design would only ever be able to confirm the textbook. HONEST SCOPE: this does NOT show 2f is false. The test still has not run under conditions where a vortex street exists.

# Citations

- Code: simulation/lbm/twoFExperiment.mjs + simulation/lbm/twoFExperiment-selfcheck.mjs. SETTLED BY a rig run derived from the divergence rather than guessed: tau 0.55 for margin over the 0.545 that blew up, inlet speed 0.09 for margin under the ceiling, and Reynolds bought with diameter at or above 20 in a channel at or above 200 tall for 10 percent blockage -- about Reynolds 108, at roughly four times the cell count of anything that fits a sandbox turn. It is not more steps, it is more cells.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
