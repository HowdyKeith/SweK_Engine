---
type: claim
title: The launcher race is closed
description: "An auto-update now closes the old window with <b>'handoff -- the new build has the baton'</b>, not 'exited with code -1' and a pause forever."
tags: [open, "swek-engine", v2514]
timestamp: v2514
---

# The launcher race is closed

- **Status:** open  
- **Since:** v2514

## Prediction

An auto-update now closes the old window with <b>'handoff -- the new build has the baton'</b>, not 'exited with code -1' and a pause forever.

## Why

Two processes fought over one flag file: the updater wrote it, and the new server deleted it within a second -- before the old window's batch could read it. Both sides now check the flag's AGE instead, and nobody deletes a flag they did not write.

## Kill condition

If an update still ends in code -1, the freshness window is wrong or something else is eating the flag.

# Citations

- Code: Galaxina. Trigger an auto-update and watch the old window.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
