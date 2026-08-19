---
type: claim
title: The GPU brain can be marked against a wall that does not move
description: "The brain's own hit rate cannot measure its growth, because the game changes under it: 84% in v2540 and 79% in v2546 might mean it got worse, or that the world got harder. A growth"
tags: [open, "swek-engine", v2547]
timestamp: v2547
---

# The GPU brain can be marked against a wall that does not move

- **Status:** open  
- **Since:** v2547

## Prediction

The brain's own hit rate cannot measure its growth, because the game changes under it: 84% in v2540 and 79% in v2546 might mean it got worse, or that the world got harder. A growth chart needs a FIXED wall. brain/bench/bandit.mjs is one: fixed Bernoulli arms, fixed seed, fixed horizon. PREDICTION: wrapping the GPU brain as {name,reset,pick,update} and running it on `easy` puts it between uniform random (regret 4796) and UCB1 (213) -- and if it lands above random, the learner is not learning, which no in-game hit rate could have told us.

## Why

The brain is a CONTEXTUAL BANDIT -- it picks an option and finds out if it hit -- not an RL agent. CartPole-v1 (web-verified: +1/step, terminate beyond +/-12 degrees or +/-2.4, truncate 500, solved = avg >= 475 over 100 episodes) is the famous wall and the WRONG SHAPE: it needs sequential credit assignment, and the pole falls fifty steps after the bad action. A k-armed bandit is the brain's actual shape.

## Measured

The wall works and discriminates: on `easy`, UCB1 213 / Thompson 17 / eps-greedy 483 / random 4796. The brain itself is NOT MARKED YET -- brain.js is Deno-only (it will not import in Node), so it has to be run on the rig.

## Kill condition

Run the brain on INSTANCES.easy and INSTANCES.hard. If its regret is indistinguishable from uniform random, the claim that this measures anything about the brain survives but the brain fails. If regret varies wildly run to run on a FIXED seed, the wall is not fixed and this benchmark dies.

# Citations

- Code: RIG-ONLY for the brain itself. HONEST CORRECTION: this started as 'measure regret against the Lai-Robbins proven lower bound' and THE BOUND DOES NOT BITE AT PRACTICAL T. Measured: Thompson sits at 0.39x/0.43x/0.42x of the bound at T=1e3/1e4/1e5 -- BELOW A PROVEN LOWER BOUND, and NOT climbing, so 'the run is too short' is false. The theorem is fine (liminf E[N_i]/log T >= 1/d is asymptotic, and the o(1) is not small when log T is 11.5); my use of it was not. The ratio is kept as a labelled REFERENCE, never a score.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
