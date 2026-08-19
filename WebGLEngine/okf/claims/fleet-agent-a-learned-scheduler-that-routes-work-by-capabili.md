---
type: claim
title: "Fleet agent -- a learned scheduler that routes work by capability and provably beats round-robin"
description: "The distributed thread becomes a scheduler with a goal. A stream of tasks, each of a kind, is routed across brains with heterogeneous per-kind speeds -- one fast at nav, another at"
tags: [settled, "swek-engine", v2732]
timestamp: v2732
---

# Fleet agent -- a learned scheduler that routes work by capability and provably beats round-robin

- **Status:** settled  
- **Since:** v2732

## Prediction

The distributed thread becomes a scheduler with a goal. A stream of tasks, each of a kind, is routed across brains with heterogeneous per-kind speeds -- one fast at nav, another at render -- and the goal is the lowest makespan, when the last brain finishes. The naive schedulers ignore capability: round-robin just cycles, greedy only balances queue length, so both hand slow work to slow brains. The learned scheduler learns each brain\'s speed per kind from the times it observes and routes each task to whoever finishes it soonest, specialising fast brains onto their strong kinds -- and it beats all three.

## Why

brain/agent/fleet.js. makeFleet gives each brain a genuine strength (one kind it is fast at); a task stream is routed by four schedulers; makespan is the max brain finish time. The learned scheduler keeps a time-per-kind estimate per brain, updated toward each observed time (the same incremental update the bandit uses), and picks argmin over brains of current-load-plus-estimated-time. Pure arithmetic, so as of v2733 it is folded into the cross-architecture fingerprint -- subsystem, master 485fd849.

## Measured

brain/agent/fleet-selfcheck.mjs, 4 checks over 30 fleets. The schedule replays bit-identically. Avg makespan ranks random 122.8, round-robin 111.5, greedy 93.6, learned 72.5 -- the learner clears load-balancing greedy by about 22 percent by routing on capability, not queue length. It matches the true-fastest brain on 76 percent of kinds against a one-in-five chance. And a scheduler that learns beats an identical frozen one, 72.5 to 95.0.

## Kill condition

brain/agent/fleet-selfcheck.mjs. SABOTAGE: remove the speed update, and the scheduler is stuck with a flat prior -- it collapses to plain load-balancing, stops specialising, and stops beating greedy; three of the four checks fall. That is the proof that learning who is fast at what is what wins, not the routing scaffold. HONEST SCOPE: this is a fact about a fleet with a real spread of speeds -- a homogeneous fleet has nothing to specialise and the learner only ties greedy. Tasks are costed, not executed; wiring it to real brain solve-times on the LAN is the next step.

# Citations

- Code: brain/agent/fleet.js (fleet + task stream + four schedulers + makespan) + brain/agent/fleet-selfcheck.mjs (4 checks, sabotage-tested) + fleet-arena.html (the makespan ladder, the learned specialisation matrix, the load balance, all from the run). The distributed capability turned into an orchestrator that measures its brains and routes to their strengths.
- Page: `fleet-arena.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
