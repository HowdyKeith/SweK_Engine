---
type: claim
title: "The flaky gate had two causes, and the diagnostic I built told them apart"
description: "v2618 shipped only on the second try -- the first stopped at step 5 when two RL trainers (dock-hazard ~20s, occlusion-bptt ~18.5s standalone) TIMED OUT at 60s. A flaky gate is wors"
tags: [settled, "swek-engine", v2619]
timestamp: v2619
---

# The flaky gate had two causes, and the diagnostic I built told them apart

- **Status:** settled  
- **Since:** v2619

## Prediction

v2618 shipped only on the second try -- the first stopped at step 5 when two RL trainers (dock-hazard ~20s, occlusion-bptt ~18.5s standalone) TIMED OUT at 60s. A flaky gate is worse than no gate, so I said I would close it. I did NOT just re-run and call it fixed.

## Why

FIRST CAUSE: transient pollution. I had run several manual browser drivers (moddrive, agree, kelvindrive) right before the ship; a leaked chromium next to a memory-heavy BPTT trainer on a 4 GB box is swap thrash, and swap thrash is how a 20s check becomes a 60s timeout. The suite run CLEAN passes 158/158 in ~300s -- the trainers were victims, not culprits. Fix: render/holoAgree-selfcheck.mjs now reaps its browser in a finally (b.close inside the driver AND a pkill outside it), because A CHECK THAT LEAVES A PROCESS BEHIND IS A CHECK THAT SABOTAGES THE NEXT ONE.

## Measured

SECOND: a timeout could not tell contention from a hang. TIMED OUT alone sends you hunting a bug in a check that is fine. So the suite now appends the machine state to a timeout: free memory and the count of REAL browser processes (by executable name, not a cmdline grep that matches its own counting). It earned its keep the same round: a DIFFERENT check, ai-bridge/freshMachine, timed out -- and the diagnosis read free 3574MB, 0 stray browsers, which said NOT CONTENTION. It was right: freshMachine PROVISIONS a fresh machine (apt/npm install + a spawned server) and ran the full 130s when the package cache was cold. That is a rig test wearing a selfcheck costume.

## Kill condition

freshMachine moved to the SKIP map with its reason -- RIG-ONLY, fresh-machine provisioning belongs where a cold machine is the whole point, not in a 60s fast-suite budget where it flakes on cache temperature. Suite now 158/158, 3 skipped with reasons. A MESSAGE THAT TELLS YOU WHERE TO LOOK HAD BETTER BE RIGHT: the browser count is by comm not cmdline, so the diagnosis cannot report a stray that is only itself counting.

# Citations

- Code: render/holoAgree-selfcheck.mjs (browser reaped in finally) + tools/ship/selfchecks.mjs (timeout appends free-memory + real-browser-count; freshMachine SKIPped with reason). The v2618 flake was transient, but the FRAGILITY was real: a browser check that can leak, and a timeout that could not say why. Both closed. Re-running until green is not fixing a flaky gate -- it is training yourself to ignore it.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
