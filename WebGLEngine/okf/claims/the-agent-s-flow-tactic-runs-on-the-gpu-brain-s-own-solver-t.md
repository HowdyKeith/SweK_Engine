---
type: claim
title: "The agent's flow tactic runs on the GPU brain's own solver -- the brain as executor"
description: "The agent no longer hand-codes its avoidance. One of its tactics asks the GPU brain to solve a flow field -- routing around the threats toward the goal -- and follows it. This is t"
tags: [settled, "swek-engine", v2730]
timestamp: v2730
---

# The agent's flow tactic runs on the GPU brain's own solver -- the brain as executor

- **Status:** settled  
- **Since:** v2730

## Prediction

The agent no longer hand-codes its avoidance. One of its tactics asks the GPU brain to solve a flow field -- routing around the threats toward the goal -- and follows it. This is the brain as the agent's executor: the bandit decides to use the field, the brain (its CPU-mirror solver here, the GPU on the fleet) computes it, the agent walks it. The field points to the goal, the agent reaches it by the field, and over many arenas the brain's field gets the agent caught less and scoring higher than a naive dash.

## Why

brain/agent/arena.js, solveArenaFlow + flowTacticFrom, on brain/flowfieldCpu.js -- FlowFieldSolverCPU, the exact solver the fleet posts, byte-for-byte the same field the GPU path produces. The threats\' patrol corridors become high-cost walls; a Dijkstra distance field to the goal gives a flow that bends around them. It is async (matching the GPU signature), so it is gated, not in the sync fingerprint.

## Measured

brain/agent/flow-selfcheck.mjs, 4 checks. The field points from the start toward the goal; the agent reaches the goal by following it; over 60 arenas the flow tactic is caught fewer times and scores higher than the greedy dash (in a wider run, 23 catches to 26 and 2613 reward to 2064 over 80); and the solve is deterministic, the same arena giving the same field every call.

## Kill condition

brain/agent/flow-selfcheck.mjs. SABOTAGE: invert the flow-following so the agent fights the field instead of riding it -- it walks away from the goal, reaches nothing, and loses to the dash. That is the proof the tactic is the brain\'s field doing the work, not the agent. HONEST SCOPE: the solver is the CPU mirror the fleet already uses; on the rig the GPU computes the identical field. The threats are encoded as a static cost from their patrol span, not re-solved every tick -- a per-tick solve is the next step.

# Citations

- Code: brain/agent/arena.js (solveArenaFlow + flowTacticFrom on FlowFieldSolverCPU) + brain/agent/flow-selfcheck.mjs (4 checks, sabotage-tested). The brain stops being a thing the agent watches and becomes the thing the agent runs on.
- Page: `agent-arena.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
