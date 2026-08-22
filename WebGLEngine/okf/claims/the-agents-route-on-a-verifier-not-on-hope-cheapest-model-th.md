---
type: claim
title: "The agents route on a verifier, not on hope -- cheapest model that passes a SweK gate wins, escalate only on failure"
description: "A mature agent does not ask which model is smartest; it routes to the cheapest model whose output survives a check, and escalates to a stronger one only when the check fails. escal"
tags: [settled, "swek-engine", v2764]
timestamp: v2764
---

# The agents route on a verifier, not on hope -- cheapest model that passes a SweK gate wins, escalate only on failure

- **Status:** settled  
- **Since:** v2764

## Prediction

A mature agent does not ask which model is smartest; it routes to the cheapest model whose output survives a check, and escalates to a stronger one only when the check fails. escalateRoute walks a cheap-to-strong chain, runs an injected verifier on each output, and returns the first passer -- or, if nobody passes, the strongest attempt FLAGGED unverified rather than trusted. The verifier is the adult in the room, and for SweK that verifier is a gate, a fingerprint, or a measured observable.

## Why

escalateRoute({task, chain, callModel, verify}) -- the same injectable callModel seam the roundhouse uses, so a mock drives it with no API key. The load-bearing line is the `if (pass)` after verify(): remove it and the router accepts the cheapest model always. Inspired by Agent-as-a-Router (arXiv 2606.22902), pointed at SweK's wall of verifiers.

## Measured

escalateRoute-selfcheck.mjs, 8 checks: cheapest passer chosen with 0 escalations; escalates cheap->mid->strong when the verifier demands it; stops at the first passer (no overpaying); returns FLAGGED-unverified when nobody passes; routing saved 19 of 20 cost units vs always calling the strongest; a route with no verifier is refused. SABOTAGE (`if (pass)` -> `if (true)`) makes it return cheap when it should escalate, and the gate catches it.

## Kill condition

tools/roundhouse/escalateRoute-selfcheck.mjs. HONEST SCOPE: this is the routing PRIMITIVE with mock models -- it proves the cheap->verify->escalate logic and cost accounting, not that a live model is good. Wiring it to anthropicCaller with a SweK gate as the verifier is the next step.

# Citations

- Code: tools/roundhouse/escalateRoute.mjs + escalateRoute-selfcheck.mjs.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
