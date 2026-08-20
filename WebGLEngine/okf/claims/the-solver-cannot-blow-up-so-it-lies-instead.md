---
type: claim
title: "The solver cannot blow up, so it lies instead"
description: "Keith: 'can we add as topics, the Seven Millennium Prize Problems in Mathematics?' ONE OF THE SEVEN IS ALREADY RUNNING HERE EVERY FRAME. Navier-Stokes existence and smoothness asks"
tags: [settled, "swek-engine", v2563]
timestamp: v2563
---

# The solver cannot blow up, so it lies instead

- **Status:** settled  
- **Since:** v2563

## Prediction

Keith: 'can we add as topics, the Seven Millennium Prize Problems in Mathematics?' ONE OF THE SEVEN IS ALREADY RUNNING HERE EVERY FRAME. Navier-Stokes existence and smoothness asks: in 3D, do smooth solutions exist for all time, or can a smooth initial condition BLOW UP IN FINITE TIME? Nobody knows; $1M. (Poincare is the only one of the seven solved -- Perelman 2003, who declined the money AND the Fields Medal.) PREDICTION: fleshSph.js integrates Navier-Stokes with DT = 1/120 FIXED FOREVER (line 36) and nothing watches velocity, so it should be possible to blow the CFL condition and get a serene, finite, entirely fictional answer.

## Why

The Clay problem is about whether the TRUE solution can go infinite. A numerical solver has no such option: it always returns a number. If the CFL condition is violated, the neighbour search is looking at particles the particle never met, and the pressure gradient is assembled from the wrong ones -- but the arithmetic stays finite, so nothing flags it.

## Measured

CONFIRMED, AND WORSE THAN PREDICTED. h=0.3492, DT=1/120. Kick one particle: v=5 -> peak CFL 0.106 (fine). v=50 -> PEAK CFL 1.059, OVER. v=1e6 -> PEAK CFL 21189.8: the fastest particle crosses TWENTY-ONE THOUSAND SMOOTHING LENGTHS PER STEP, past every neighbour it was supposed to interact with -- AND EVERY VELOCITY IS FINITE. No NaN, no warning. The threshold is about 44 m/s in the flesh's own units; A KAIJU PUNCH DOES THAT. !! AND THE SECOND HALF, WHICH I GOT WRONG FIRST: THE FLESH DAMPS, so 120 steps after a 50 m/s kick the CFL reads 0.001 and the state is innocent. PEAK 1.06 -> SETTLED 0.001. THE MOMENT THAT BROKE THE PHYSICS IS ALREADY OVER AND IT LEFT NO MARK. A panel sampling CFL once a second would report a healthy solver straight through the frame that meant nothing.

## Kill condition

Show a CFL above 1 that produces a field measurably indistinguishable from a properly sub-stepped run -- that would mean the limit is not binding here and the number is theatre. The honest limit of this claim: it proves the SOLVER IGNORES the condition, NOT that any shipped scenario crosses it. Nothing in the engine has been observed above CFL 1 in normal play. It is a loaded gun, not a wound.

# Citations

- Code: physics/sph/cfl.js (cflNumber = max|v|*dt/h, cflStep, cflVerdict) + cfl-selfcheck.mjs (13 checks, gated). IT REPORTS, IT DOES NOT FIX: sub-stepping or clamping would move every determinism hash in the engine -- lockstep, cross-arch, replay validation -- and this engine does not break working things for a bite nobody has taken. A gated check PROVES measuring does not perturb (identical states after the report). simulation/euler/ has had cflDt() all along and uses it to choose its step; THE SPH NEVER HAD THE NUMBER AT ALL, so nobody could ask whether the flesh had crossed it. YOU CANNOT DECIDE ABOUT A NUMBER YOU HAVE NEVER SEEN.
- Page: `/flesh.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
