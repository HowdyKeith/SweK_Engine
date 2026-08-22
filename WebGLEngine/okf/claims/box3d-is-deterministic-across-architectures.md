---
type: claim
title: Box3D is deterministic across architectures
description: "A recording made on the <b>Intel Mac (x86_64)</b> replays on the <b>M-series Mac (arm64)</b> with every embedded state hash matching."
tags: [open, "swek-engine", v2500]
timestamp: v2500
---

# Box3D is deterministic across architectures

- **Status:** open  
- **Since:** v2500

## Prediction

A recording made on the <b>Intel Mac (x86_64)</b> replays on the <b>M-series Mac (arm64)</b> with every embedded state hash matching.

## Why

This is Box3D's headline claim, and the only honest test of it needs two different instruction sets. Two x86 boxes agreeing proves almost nothing.

## Kill condition

One mismatched hash and the cross-arch claim is dead -- which would be a genuine upstream finding, worth an issue with the recording attached.

# Citations

- Code: record.mjs on the Intel Mac, then validate.mjs on your mother's M-series.
- Page: `/box3d-info.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
