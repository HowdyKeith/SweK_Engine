---
type: claim
title: "Wind cloth -- the sampled field driving a constrained body, a flag that flaps but holds together"
description: "The sampled field last round pushed free particles, which simply go where the wind sends them. A cloth cannot: its edges hold it together, so wind and constraints must negotiate, a"
tags: [settled, "swek-engine", v2680]
timestamp: v2680
---

# Wind cloth -- the sampled field driving a constrained body, a flag that flaps but holds together

- **Status:** settled  
- **Since:** v2680

## Prediction

The sampled field last round pushed free particles, which simply go where the wind sends them. A cloth cannot: its edges hold it together, so wind and constraints must negotiate, and the fabric bellies out downwind and settles into the shape a flag takes in a steady breeze. This is the coupling doing what a coupling is for -- driving a deformable body, not carrying loose points -- and its real obligation is that the fabric holds together while the wind drives it.

## Why

physics/xpbd/windCloth.js. windClothSubstep samples the wind trilinearly at each node, adds it to gravity in the predict step, then runs the ordinary XPBD cloth solve; nothing about the solver changes, the wind is just another force. The measure is time-averaged because a flag flaps -- an instant is a random phase -- so the free edge's average position over the last steps is the steady belly.

## Measured

physics/xpbd/windCloth-selfcheck.mjs, 6 checks. A wind bellies the flag out of its plane while a calm one hangs flat; a stronger wind bellies it further, monotonically; the belly follows whichever way the wind blows; and -- the coupling's obligation -- even in a gale the worst edge strain stays under a quarter, the fabric stretching a little but not coming apart. The flag flaps chaotically yet reproduces byte-for-byte. Folded into the fingerprint as subsystem twenty-six (wind-cloth); master 0438bf2a...

## Kill condition

physics/xpbd/windCloth-selfcheck.mjs. SABOTAGE: zero the constraint correction so only the wind acts -- the flag tears off its pole, the worst strain blowing past a hundred, and the constraints-hold check fails. A COUPLING THAT DRIVES A BODY BUT IGNORES ITS CONSTRAINTS IS JUST WIND BLOWING DUST. A flapping flag is chaotic but still deterministic, like the granular pile.

# Citations

- Code: physics/xpbd/windCloth.js (windClothSubstep sampled-wind force + XPBD cloth solve, freeCentroid, maxStrain) + physics/xpbd/windCloth-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 26) and tools/ledger. The external field finally driving a body that answers back.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
