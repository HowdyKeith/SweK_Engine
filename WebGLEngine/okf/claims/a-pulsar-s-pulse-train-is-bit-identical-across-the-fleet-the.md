---
type: claim
title: "A pulsar's pulse train is bit-identical across the fleet -- the most precise clock in nature, ticking the same on every box"
description: "A neutron star spins, sweeps two beams, and pulses each time one crosses the line of sight; it spins down, so the period lengthens. The pulse arrival times solve the standard timin"
tags: [settled, "swek-engine", v2745]
timestamp: v2745
---

# A pulsar's pulse train is bit-identical across the fleet -- the most precise clock in nature, ticking the same on every box

- **Status:** settled  
- **Since:** v2745

## Prediction

A neutron star spins, sweeps two beams, and pulses each time one crosses the line of sight; it spins down, so the period lengthens. The pulse arrival times solve the standard timing model -- phase f0*t + 0.5*fdot*t*t, pulse n at phase n -- with a quadratic that needs only arithmetic and one square root, both correctly rounded under IEEE-754. So the whole pulse train is the same to the bit on every architecture, and it is folded into the fingerprint. Real pulsars are among the most precise clocks in the universe; this one keeps the same time on every machine in the fleet.

## Why

physics/pulsar/pulsar.js: pulseArrivalTimes solves the timing quadratic; phaseAt confirms each arrival lands on a whole turn; the beam direction for the on-screen sweep uses trig and is gated. fingerprint.mjs hashes the arrival times as the pulsar subsystem. The page shows the spinning star flaring as a beam crosses the sight line and the pulse train ticking, with the period drift read out.

## Measured

pulsar-selfcheck.mjs, 4 checks over 200 pulses: the train replays identically, the rotational phase is a whole number of turns at every arrival to about 1e-11, the interval lengthens across the train as the star spins down, and t0 is exactly 0 because sqrt of a perfect square is exact. The fold took the fingerprint to 49 subsystems and moved the master to fc1a4056.

## Kill condition

physics/pulsar/pulsar-selfcheck.mjs and a fleet fingerprint check. SABOTAGE: drop the spin-down term and space the pulses evenly; the phase then no longer lands on a whole turn at each pulse and two checks fail -- the timing residual astronomers use to catch a wrong pulsar model. If a box computes the train differently its master diverges. HONEST SCOPE: the fingerprinted train is the arithmetic timing model; the rotating-beam visual uses trig and stays off the hash, as trig should.

# Citations

- Code: physics/pulsar/pulsar.js (pulseArrivalTimes + phaseAt + spin-down) + physics/pulsar/pulsar-selfcheck.mjs + the pulsar subsystem in the fingerprint + pulsar.html. A clock made of a collapsing star, and it reads the same on every box in the fleet.
- Page: `pulsar.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
