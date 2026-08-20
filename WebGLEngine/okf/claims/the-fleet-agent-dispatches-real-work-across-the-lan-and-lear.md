---
type: claim
title: The fleet agent dispatches real work across the LAN and learns from the times that come back
description: "The orchestrator stops reading the fleet and starts running it. It dispatches each task to a peer for real, the peer solves it and returns the result, and the scheduler learns that"
tags: [settled, "swek-engine", v2735]
timestamp: v2735
---

# The fleet agent dispatches real work across the LAN and learns from the times that come back

- **Status:** settled  
- **Since:** v2735

## Prediction

The orchestrator stops reading the fleet and starts running it. It dispatches each task to a peer for real, the peer solves it and returns the result, and the scheduler learns that peer\'s speed from how long the work actually took -- routing the next task better. Real work goes out, verifiable answers come back, and the loop that learns where the fast peers are beats both round-robin and a dispatch denied the timing feedback.

## Why

brain/agent/dispatch.js: solveTaskWork is a genuine flow-field solve returning a checkable integer; dispatchTasks picks a peer with the learned scheduler, executes via an injectable sendFn, and feeds the returned time back into the scheduler. In the gate sendFn runs in-process over a heterogeneous peer model; on the rig it is POST /work/solve on the chosen peer, and the time is the real measured solve time. Server routes: /work/solve (peer executor) and /fleet/dispatch (the orchestrator).

## Measured

brain/agent/dispatch-selfcheck.mjs, 4 checks over 120 dispatched tasks. Every result matches a fresh solve of the same task -- real work, verifiable answers. Learning from the returned times gives makespan 91.6 against a feedback-blind dispatch\'s 132.5 and round-robin\'s 129.1. And the dispatch replays identically for the same tasks.

## Kill condition

brain/agent/dispatch-selfcheck.mjs. SABOTAGE: cut the feedback line so the scheduler stops learning from what it dispatched, and its makespan collapses to the frozen one and below round-robin -- two checks fall. That is the proof the loop (dispatch, observe, route better) is what does the work. HONEST SCOPE: the loop and the work are proven in-process; the live LAN dispatch is rig-side, where sendFn is the real peer RPC.

# Citations

- Code: brain/agent/dispatch.js (solveTaskWork + dispatchTasks + dispatchLearned) + brain/agent/dispatch-selfcheck.mjs + the /work/solve and /fleet/dispatch server routes. The fleet agent, finally, running the fleet.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
