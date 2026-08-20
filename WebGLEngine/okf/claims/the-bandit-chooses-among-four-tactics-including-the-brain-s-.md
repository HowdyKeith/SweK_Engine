---
type: claim
title: "The bandit chooses among four tactics including the brain's per-tick flow -- and is not fooled"
description: "Two steps that complete the single-agent story. First, the flow field re-solves every tick with the threats at their CURRENT positions -- moving walls -- so the agent routes around"
tags: [settled, "swek-engine", v2731]
timestamp: v2731
---

# The bandit chooses among four tactics including the brain's per-tick flow -- and is not fooled

- **Status:** settled  
- **Since:** v2731

## Prediction

Two steps that complete the single-agent story. First, the flow field re-solves every tick with the threats at their CURRENT positions -- moving walls -- so the agent routes around where the danger IS, not its whole corridor. Second, the bandit now chooses among four tactics with that per-tick flow on the menu, evaluates the brain fairly against the hand tactics, commits to whichever it valued highest, and beats the baselines once converged. Notably it is NOT fooled into always taking the fancy option: which tactic wins shifts with the run, and the bandit follows the reward, not the label.

## Why

brain/agent/arena.js: solveArenaFlowPerTick caches a Dijkstra solve per distinct threat configuration (a handful, not one per step) and flowTacticPerTick reads the field for the current tick; runLadderAsync + makeBandit4 run the epsilon-greedy bandit over rush/flank/hold/flow. Async (the solver matches the GPU signature), so gated, not in the sync fingerprint -- which is unchanged at ff0792bc, since the sync tactics ignore the new tick argument.

## Measured

Per-tick beats static: over 60 arenas it is caught 17 times to the static field\'s 19 and the dash\'s 21, scoring 1993 to 1621 to 1254. brain/agent/ladder4-selfcheck.mjs (5 checks): the async ladder replays bit-identically; once converged the learner beats reflex > greedy > random on late average; all four tactics including flow are tried; the bandit commits to its highest-Q tactic (flow leads early, flank overtakes with more data); it improves across the run. brain/agent/flow-selfcheck.mjs gained a per-tick-beats-static check.

## Kill condition

brain/agent/ladder4-selfcheck.mjs. SABOTAGE: make the bandit pick at random instead of exploiting its value estimates, and it never commits to its best tactic -- the convergence check fails, because exploiting what it learned is the whole point. The check compares CONVERGED performance, not the total, because the total also pays for exploring four tactics -- an honest comparison, not a rigged one. HONEST SCOPE: the winner is not fixed; the gate asserts convergence, not a name. Threats are re-solved per tick but the agent does not yet anticipate their next move.

# Citations

- Code: brain/agent/arena.js (solveArenaFlowPerTick + flowTacticPerTick + runLadderAsync + makeBandit4) + brain/agent/ladder4-selfcheck.mjs (5 checks, sabotage-tested) + the per-tick check in flow-selfcheck.mjs + agent-arena.html now running the four-tactic async ladder with a live brain-flow engagement. The brain is on the menu, evaluated, and chosen only when it wins.
- Page: `agent-arena.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
