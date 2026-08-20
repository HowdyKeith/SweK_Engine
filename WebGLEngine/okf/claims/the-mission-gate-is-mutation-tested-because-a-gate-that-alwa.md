---
type: claim
title: "The mission gate is mutation-tested, because a gate that always opens is not a gate"
description: "Endless Sky missions are gated by conditions -- to accept, to complete, to fail -- and the failure mode of a port is not a crash but a gate that quietly always opens. Every mission"
tags: [settled, "swek-engine", v2864]
timestamp: v2864
---

# The mission gate is mutation-tested, because a gate that always opens is not a gate

- **Status:** settled  
- **Since:** v2864

## Prediction

Endless Sky missions are gated by conditions -- to accept, to complete, to fail -- and the failure mode of a port is not a crash but a gate that quietly always opens. Every mission then offers, everything completes, and the game looks like it works while being unplayable. So the gate is not tested by checking that missions offer; it is tested by MUTATING the condition and requiring the verdict to change.

## Why

ev/esConditions.js evaluates the condition expressions and ev/esMissions.js applies them at the accept, complete and fail points. The gate is evaluated at each, not once at offer time, because to fail must be able to trip on a jump that happens long after acceptance.

## Measured

ev/tools/es-gates-selfcheck.mjs, 18 checks, all passing, including that to fail trips on a jump and that an UNGATED mission still accepts and completes on arrival -- the negative control, since a gate that refuses everything is as broken as one that permits everything. Alongside it ev/tools/es-missions-selfcheck.mjs runs 99 checks over the mission lifecycle.

## Kill condition

ev/tools/es-gates-selfcheck.mjs. Make the evaluator return true unconditionally and the mutation checks fail while a naive offer-count check would still pass. HONEST SCOPE, AND IT IS STATED BY THE GATE ITSELF: the whole-game counts over Endless Sky's real data are SKIPPED unless ES_DATA_DIR is set. What is proven here is the lifecycle and the gate logic on synthetic missions; running it across the shipped campaign needs the game data and is a rig job.

# Citations

- Code: ev/esConditions.js + ev/esMissions.js + ev/tools/es-gates-selfcheck.mjs + ev/tools/es-missions-selfcheck.mjs.
- Page: `ev.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
