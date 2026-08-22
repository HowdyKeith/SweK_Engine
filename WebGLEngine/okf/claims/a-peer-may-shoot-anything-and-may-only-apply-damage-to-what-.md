---
type: claim
title: A peer may SHOOT anything and may only APPLY damage to what it owns
description: "The obvious way to write co-op combat is to let the client that fired a shot decide what it hit and how much it hurt. That is also how a single bad or edited client rewrites everyo"
tags: [settled, "swek-engine", v2864]
timestamp: v2864
---

# A peer may SHOOT anything and may only APPLY damage to what it owns

- **Status:** settled  
- **Since:** v2864

## Prediction

The obvious way to write co-op combat is to let the client that fired a shot decide what it hit and how much it hurt. That is also how a single bad or edited client rewrites everyone else's game. The rule this port is built on instead: firing is unrestricted, but DAMAGE IS AN ADDRESSED EVENT that only the owner of the target may apply, and ownership is not negotiable by the sender. A peer that claims a kill on a ship it does not own must be refused wholesale, not clamped or averaged.

## Why

ev/esAuthority.js assigns ownership and ev/esCombat.js routes damage as an event to the owner rather than applying it locally. The asymmetry is deliberate: permissive on intent, strict on effect.

## Measured

ev/tools/es-damage-selfcheck.mjs, 53 checks, all passing -- the whole file exists to defend this one rule. Includes the refusal path (damage from a non-owner is rejected wholesale rather than partially honoured) and that a browser cannot pack a wing it does not own.

## Kill condition

ev/tools/es-damage-selfcheck.mjs. Let a non-owner apply damage directly and the refusal checks fail. THE SABOTAGE THAT MATTERS is partial trust -- accepting a non-owner's damage but clamping it -- because that looks reasonable, passes a naive test, and still lets a bad client grind anyone down.

# Citations

- Code: ev/esAuthority.js + ev/esCombat.js + ev/tools/es-damage-selfcheck.mjs + ev/tools/es-coop-selfcheck.mjs (29 checks).
- Page: `ev.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
