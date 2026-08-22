---
type: claim
title: "Pendulum wave -- tuned oscillators that scramble and re-synchronise, exact via the strict-trig core"
description: "A row of pendulums whose lengths are tuned so the longest does k swings a cycle, the next k+1, the next k+2, released together, starts in step, fans into a travelling wave, folds i"
tags: [settled, "swek-engine", v2694]
timestamp: v2694
---

# Pendulum wave -- tuned oscillators that scramble and re-synchronise, exact via the strict-trig core

- **Status:** settled  
- **Since:** v2694

## Prediction

A row of pendulums whose lengths are tuned so the longest does k swings a cycle, the next k+1, the next k+2, released together, starts in step, fans into a travelling wave, folds into two groups and finer patterns, and at the cycle end snaps back into step because every pendulum has completed a whole number of swings at once. The re-synchronisation is the phenomenon, and it is exact only if each pendulum keeps its frequency exactly -- which an Euler step does not, but an exact harmonic rotation does.

## Why

physics/pendulumWave.js. Each pendulum at small amplitude is a simple harmonic oscillator; each step rotates its (theta, v) through the angle omega*dt exactly, which is perfect for SHM and re-syncs to the bit. That rotation needs a cos and a sin of omega*dt, computed ONCE per pendulum from the strict-trig core the engine already proves bit-identical -- so the per-step loop is only +,-,*,/, and the wave is cross-architecture. The strict core built long ago makes another subsystem possible.

## Measured

physics/pendulumWave-selfcheck.mjs, 5 checks. The angle spread is wide at half a cycle and back to near zero at a full cycle (it scrambles and re-synchronises); at half a cycle the row splits into two groups at plus and minus the amplitude; each pendulum holds its amplitude to 1e-9 mid-cycle (the exact rotation conserves energy); the frequencies climb one swing at a time, the fastest 34/20 of the slowest; and it is deterministic with a pure-arithmetic loop. Folded into the fingerprint as subsystem thirty-one; a Lab scene draws the row and a preset opens it; master accf3832...

## Kill condition

physics/pendulumWave-selfcheck.mjs. SABOTAGE: detune the frequencies off their whole numbers (an n-dependent offset) and the re-sync smears -- the spread at the full cycle is no longer small, because pendulums that do not complete whole swings together never come back into step. The whole-number tuning is the wave; without it there is only drift.

# Citations

- Code: physics/pendulumWave.js (makePendulumWave, pendulumStep exact-rotation, angleSpread, maxAngle) + physics/pendulumWave-selfcheck.mjs (5 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 31), tools/ledger, tools/catalog + a Lab scene (the row, k adjustable) and a preset. Re-synchronising harmonic oscillators, cross-architecture on the strict-trig core.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
