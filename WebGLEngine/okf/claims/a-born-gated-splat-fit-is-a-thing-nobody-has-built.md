---
type: claim
title: "A Born-gated splat fit is a thing nobody has built"
description: "Gaussian splatting has been taken to BOTH ENDS of tomography and not the middle. Straight-ray X-ray CT: R2-Gaussian (NeurIPS 2024, Ruyi-Zha/r2_gaussian, VERIFIED LIVE). Strong diff"
tags: [open, "swek-engine", v2534]
timestamp: v2534
---

# A Born-gated splat fit is a thing nobody has built

- **Status:** open  
- **Since:** v2534

## Prediction

Gaussian splatting has been taken to BOTH ENDS of tomography and not the middle. Straight-ray X-ray CT: R2-Gaussian (NeurIPS 2024, Ruyi-Zha/r2_gaussian, VERIFIED LIVE). Strong diffuse scattering: GS-DOT (arXiv 2604.23675, Apr 2026), which says outright it uses diffusion equations rather than ray functions. <b>Coherent weak scattering -- Born/Rytov with an Ewald-sphere construction -- I did not find.</b> That is exactly where wavefront-tomo lives.

## Why

Splatting is an OPTIMISATION: you fit primitives to measurements. The Born approximation says WHERE that fit is physically meaningful at all. wavefront-tomo already exports bornError -- a solver that knows when its own approximation fails. That is the natural gate on a splat fit: do not trust these Gaussians, the physics is invalid here. Nobody attaches an honesty gate to a splat optimiser, and we already wrote one.

## Kill condition

A single paper doing Born/Rytov-regime diffraction tomography with Gaussian primitives kills the novelty half outright. And even if novel, it dies if a Born-gated fit is no better than an ungated one on the same synthetic phantom -- the gate has to EARN its place, not just exist.

# Citations

- Code: NOT SEARCHED PROPERLY. Two web searches is not a literature review, and this is a large fast-moving field. This claim is recorded as 'I did not find it', NOT as 'it does not exist'. R2-Gaussian also found a previously-unknown INTEGRATION BIAS in standard 3DGS for X-ray -- so 'absorption is additive, just delete the radix sort' (my first instinct) would have produced a plausible WRONG volume.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
