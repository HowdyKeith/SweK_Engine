---
type: claim
title: "Fleet + per-tick agent fold into the fingerprint, and the scheduler runs on real LAN solve-times"
description: "Two closes. The fleet scheduler and the per-tick flow agent are pure enough to join the cross-architecture fingerprint, so the whole agent ladder -- tactic, executor, four-tactic b"
tags: [settled, "swek-engine", v2733]
timestamp: v2733
---

# Fleet + per-tick agent fold into the fingerprint, and the scheduler runs on real LAN solve-times

- **Status:** settled  
- **Since:** v2733

## Prediction

Two closes. The fleet scheduler and the per-tick flow agent are pure enough to join the cross-architecture fingerprint, so the whole agent ladder -- tactic, executor, four-tactic bandit, fleet orchestrator -- is now provably bit-identical across machines, not just measured. And the fleet scheduler no longer runs on synthetic speeds: it builds its model from the brains' real reported solve-times and the kinds they handle, so on the fleet it schedules the actual pool by the times it really posts.

## Why

The fleet is pure arithmetic already. The per-tick flow uses a hypotenuse in the field normalisation, which is not guaranteed bit-identical across architectures -- but the agent discretises the field to a cardinal move by comparing the two components, and that comparison is invariant to the shared positive scaling, so the agent\'s INTEGER path is stable and that is what fpArenaPerTick hashes, not the floats. FlowFieldSolverCPU gained a solveSync path (it never awaited anything) so the fingerprint can run it inline. fleetFromTelemetry turns /ai/brain/fleet entries (solveMsEwma + kinds) into the speed model; fetchFleetTelemetry pulls it live.

## Measured

Folding both moved the master from ff0792bc to 485fd849 at 47 subsystems, deterministic across repeated computes. The per-tick trace and the fleet ladder both hash stably; the sync per-tick field matches the async one bit-for-bit. fleet-selfcheck gained a fifth check: from four brains\' reported solve-times and handled kinds it derives a real speed model and still beats greedy on makespan.

## Kill condition

tools/fingerprint/fingerprint-selfcheck.mjs (coverage now includes agent-pertick and fleet-agent) + brain/agent/fleet-selfcheck.mjs. If the per-tick path were not architecture-stable the fingerprint would diverge across the fleet -- re-run it on every box and the master must match. HONEST SCOPE: the live telemetry fetch is rig-side; the sandbox gates the wiring with sample telemetry. Solve-times still describe cost, not a running task graph -- the scheduler reads them, it does not yet dispatch real work.

# Citations

- Code: tools/fingerprint/fingerprint.mjs (fpArenaPerTick + fpFleet) + brain/flowfieldCpu.js (solveSync) + brain/agent/arena.js (solveArenaFlowPerTickSync + perTickFlowTrace) + brain/agent/fleet.js (fleetFromTelemetry + fetchFleetTelemetry) + fleet-selfcheck\'s telemetry check. The agent ladder is now cross-architecture end to end, and the orchestrator reads the real fleet.
- Page: `fleet-arena.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
