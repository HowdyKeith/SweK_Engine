---
type: claim
title: "The roundhouse loop crystallizes on the measured observable, and an agreeable evaluator cannot force it"
description: "The proposer/builder/evaluator loop is wired around the shedding-onset harness so that its exit is a physics check, not a handshake. The proposer states a falsifiable claim about a"
tags: [settled, "swek-engine", v2750]
timestamp: v2750
---

# The roundhouse loop crystallizes on the measured observable, and an agreeable evaluator cannot force it

- **Status:** settled  
- **Since:** v2750

## Prediction

The proposer/builder/evaluator loop is wired around the shedding-onset harness so that its exit is a physics check, not a handshake. The proposer states a falsifiable claim about a measurable observable, the builder runs the real simulation, and the loop crystallizes only when the number the sim produced satisfies the claim. The evaluator interprets and steers the next proposal but is not the stopping oracle. So the classic failure -- two models nodding at each other until it feels settled -- cannot happen: an evaluator that agrees with everything still cannot make the loop crystallize while the sim says the flow is steady.

## Why

tools/roundhouse/roundhouse.mjs: crystallized() checks the measured observable against the claim and never sees the evaluator; the loop returns only when that verdict is done. The model-calling seam is injectable, like shedOnset's engine seams -- a mock caller in the gate, the Anthropic SDK on the rig via anthropicCaller with a hot proposer system prompt and a cold evaluator one. The builder is never a model; it runs the bound sim and returns measured numbers.

## Measured

roundhouse-selfcheck.mjs, 3 checks over a mock lattice that sheds only above a force threshold: the loop climbs the force and crystallizes on the round where the sim actually sheds; an evaluator returning done every round cannot crystallize a steady flow; and the crystallization test flips purely on the measured sheds flag. The mock keeps it to milliseconds -- no API, no minutes-long run.

## Kill condition

tools/roundhouse/roundhouse-selfcheck.mjs. SABOTAGE: wire the exit to the evaluator's opinion instead of the physics verdict, and the agreeable evaluator crystallizes on a steady run -- the echo chamber the design exists to prevent -- which the gate refuses. HONEST SCOPE: the real loop with live models is a rig job -- the gate proves the loop LOGIC and the stopping criterion with a mock caller; the Anthropic-SDK path is drafted and documented but run on the machine, and a full onset study is minutes of real sim per round.

# Citations

- Code: tools/roundhouse/roundhouse.mjs (loop + crystallized + anthropicCaller) + tools/roundhouse/roundhouse-selfcheck.mjs. The automated experimentalist: it stops on what the sim measured, not on what the models agreed.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
