---
type: claim
title: "Agent arena -- a learned bandit that provably beats its baselines over deterministic episodes"
description: "The rung above the paramecium: not which way to crawl but which tactic to run an engagement. A deterministic grid arena -- an agent, a goal, threats on fixed patrols -- raced by fo"
tags: [settled, "swek-engine", v2729]
timestamp: v2729
---

# Agent arena -- a learned bandit that provably beats its baselines over deterministic episodes

- **Status:** settled  
- **Since:** v2729

## Prediction

The rung above the paramecium: not which way to crawl but which tactic to run an engagement. A deterministic grid arena -- an agent, a goal, threats on fixed patrols -- raced by four policies that rank by competence, with a learned epsilon-greedy bandit on top that picks among tactics (rush / flank / hold) and updates its values from reward. The learner must beat random, greedy and the hand reflex, must actually improve over the run, and must discover on its own that proactive flanking wins while rushing gets you caught -- and it does.

## Why

brain/agent/arena.js. Everything runs off a seed through SweK\'s LCG -- arenas, threat patrols, episodes -- so a run replays bit-identically. The policies are pure integer logic; the bandit is an incremental value update Q += alpha*(reward - Q) with epsilon exploration. Pure arithmetic throughout, no trig or pow, so as of v2730 it is folded into the cross-architecture fingerprint -- subsystem 45, master ff0792bc. It is the same module the page runs, so agent-arena.html shows the real Q-weights and the real learning curve, not a mockup.

## Measured

brain/agent/arena-selfcheck.mjs, 5 checks over 240 episodes. The ladder replays bit-identically from a seed. Totals rank random -10741, greedy 7735, reflex 8414, learned 11222 -- the learner clears the hand reflex by ~2800, measured. Its reward climbs from 38.5 early to 50.5 late. It values flank at +46 against rush -76 and picks flank 219 of 240 times. And a bandit that can learn scores 11222 against a frozen one\'s ~8000 on the same seeds.

## Kill condition

brain/agent/arena-selfcheck.mjs. SABOTAGE: remove the value update, and the bandit can no longer tell a good tactic from a bad one -- the learning curve flattens, the flank discovery fails, and it stops beating the frozen arm; four of the five checks fall. That is the proof the learning is what wins, not the scaffolding. HONEST SCOPE (on the page too): the ranking is a fact about THIS arena and this threat density, not a law -- change the world and it can change. This is a tactical selector over three hand-written tactics, not a learner of the tactics themselves.

# Citations

- Code: brain/agent/arena.js (arena + four-arm ladder + epsilon-greedy bandit) + brain/agent/arena-selfcheck.mjs (5 checks, sabotage-tested) + agent-arena.html (the honest command center: live Q-weights, learning curve, a real flanking engagement, all read from the run). The first thing in the agent conversation that survives its own gate.
- Page: `agent-arena.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
