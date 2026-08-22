---
type: claim
title: "The brain's handicap is memory, not sensors"
description: "Keith: 'Can the gpu brain try and legally cheat? I dont want to cheat, i just want our GPU Brain not to lose.' PREDICTION: it cannot win in 2D, because the mold's rule IS the optim"
tags: [open, "swek-engine", v2557]
timestamp: v2557
---

# The brain's handicap is memory, not sensors

- **Status:** open  
- **Since:** v2557

## Prediction

Keith: 'Can the gpu brain try and legally cheat? I dont want to cheat, i just want our GPU Brain not to lose.' PREDICTION: it cannot win in 2D, because the mold's rule IS the optimal policy for its sensor -- sample three, take the best, nothing left to learn (v2556 showed even TWO sensors beat every bandit). But 3D is a game the rule does not generalise into for free: 'left/forward/right' is a PLANE concept, and in 3D someone must guess a cone size. The bandit does not guess; it just has more arms.

## Why

If the loss were about INFORMATION, giving the bandit more axes or more arms would close it. If it is about the MODEL, it will not.

## Measured

3D food peak, 26 Fibonacci-sphere directions, 900 steps. THE MOLD'S RULE DOES NOT SURVIVE THE TRIP: cone-of-3 -- the direct translation of left/forward/right -- scored 0.0 food, 0.000 best. TOTAL FAILURE. THE NUMBER THREE WAS A FACT ABOUT PLANES. Cone-of-5 scored 575.5/0.999, cone-of-9 580.8/1.000. AND THE BRAIN STILL LOST: UCB1 14.8/0.212, beating random (0.0) but nowhere near the mold. SO THE LOSS IS NOT ABOUT INFORMATION. A bandit assumes STATIONARY arms -- that arm 7 has a fixed payout you can average toward. IN A MOVING BODY EVERY ARM CHANGES EVERY STEP: 'which way is best' depends on where you are, so by the time you have averaged four pulls of arm 7, arm 7 means something else. THE MOLD RE-SENSES FROM SCRATCH AND CARRIES NO STALE HISTORY. THE BANDIT'S MEMORY IS ITS HANDICAP.

## Kill condition

Race the CONTEXTUAL brain -- brain.js's policy MLP, which takes state -- against the mold in freeSpaceWorld on the rig, where Deno runs. If context closes the gap, the finding is confirmed and the legal cheat is real. IF IT STILL LOSES, the problem is deeper than the bandit's memory and this claim is wrong.

# Citations

- Code: physics/freeSpaceWorld.js + upAxis-selfcheck.mjs (7 checks, gated) + dimensionality() as the 11th call in backendConformance's CONTRACT. THE ANSWER TO 'is everything a 2d plain': YES, and it was never the creature's fault -- planarFallbackWorld.js:12 does `vel = [v[0], 0, v[2]]`, DISCARDING v[1] AT THE DOOR. Push a body up at 5 m/s for a second and it moves 0.0000. !! AND v2553's CONFORMANCE CHECKER PASSED THAT WORLD FOR FOUR VERSIONS: it contains a deliberate 'silently drops z' fake and CATCHES it, but every velocity test only ever pushed x and z. THE SAME HOLE WAS OPEN FOR UP THE WHOLE TIME, in the file whose own comment says an untested axis is an axis a backend is free to ignore. Now a world must DECLARE planar or spatial and the checker PUSHES IT UP AND MEASURES -- a planar world claiming 'spatial' fails. RIG-ONLY: the GPU brain is Deno-only and is NOT the thing that lost here; bandit.mjs's UCB1 is CONTEXT-FREE, and the brain is contextual (v2547).
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
