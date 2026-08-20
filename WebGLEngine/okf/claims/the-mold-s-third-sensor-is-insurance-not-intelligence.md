---
type: claim
title: "The mold's third sensor is insurance, not intelligence"
description: "PREDICTED: Velfi/Vizza's slime mold uses TWO sensors (left/right, no centre) where v2552's moldReflex uses the classic THREE. A two-sensor agent cannot know it has ARRIVED -- nothi"
tags: [broken, "swek-engine", v2556]
timestamp: v2556
---

# The mold's third sensor is insurance, not intelligence

- **Status:** broken  
- **Since:** v2556

## Prediction

PREDICTED: Velfi/Vizza's slime mold uses TWO sensors (left/right, no centre) where v2552's moldReflex uses the classic THREE. A two-sensor agent cannot know it has ARRIVED -- nothing it samples is where it is going -- so on a food peak it should overshoot or orbit while the three-sensor settles.

## Why

Transcribed from her compute.wgsl: left/right samples, and 'if (left > right) turn left; else if (right > left) turn right; else { /* If equal, do nothing */ }'. No centre sample, no random-turn branch. Jones 2010 has both.

## Measured

WRONG, AND CLEANLY WRONG. On a smooth Gaussian peak: 2-sensor food 654.4, final taste 0.999; 3-sensor 657.9, 0.999. THE CENTRE SENSOR BUYS 0.5%. At the peak left == right, so it does nothing, drives straight, overshoots, the asymmetry flips, and it comes back -- AN ORBIT AT THE PEAK IS SETTLING. THEN THE REAL ANSWER: at a SYMMETRIC DEAD END (food behind, repellent ridge ahead, left and right identical by construction) the two-sensor agent DROVE THROUGH THE RIDGE TO x=35 AND KEPT GOING (best food 0.131) while the three-sensor turned around and came home (1.000). AND THE CAVEAT CUTS IN HER FAVOUR: on a noisy trail map written by thousands of agents, left == right fired 0 times in 2000 samples. HER DEAD BRANCH COSTS HER NOTHING. THE THIRD SENSOR IS INSURANCE AGAINST A SYMMETRY HER FIELD NEVER PRODUCES AND THIS ENGINE'S SMOOTH ANALYTIC chemoField DOES.

## Kill condition

Already dead as predicted -- the prediction was that the centre sensor would show up on a peak, and it does not. The surviving claim is narrower and testable: give v2552's moldReflex a NOISY field and the third sensor should stop paying for itself there too. If it still helps on noise, the dead-end explanation is incomplete.

# Citations

- Code: simulation/life/moldSensors-selfcheck.mjs (6 checks, gated). ALSO FOUND, and it is a comment rather than a bug: her turn is 'let target_angle = angle - TAU; let angle_diff = target_angle - angle; angle += min(turn_rate, abs(angle_diff)) * sign(angle_diff);' -- angle_diff is ALWAYS exactly -TAU, so abs() is always 6.283, so min(turn_rate, 6.283) IS ALWAYS turn_rate. The whole 'Calculate shortest path to turn left' collapses to 'angle -= turn_rate'. THE BEHAVIOUR IS CORRECT; THE COMMENT DESCRIBES AN ALGORITHM THAT IS NOT RUNNING.
- Page: `/slime-mold.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
