---
type: claim
title: "Reproducibility harness -- the verification spine pointed at anyone's computation"
description: "Everything the fingerprint does for SweK's physics, generalised to any computation. You supply probes -- named functions returning arrays of numbers -- and the harness hashes each,"
tags: [settled, "swek-engine", v2706]
timestamp: v2706
---

# Reproducibility harness -- the verification spine pointed at anyone's computation

- **Status:** settled  
- **Since:** v2706

## Prediction

Everything the fingerprint does for SweK's physics, generalised to any computation. You supply probes -- named functions returning arrays of numbers -- and the harness hashes each, rolls a master, and packages an attestation two machines compare to prove byte agreement. Its headline power is catching what breaks reproducibility more than any architecture gap: hidden non-determinism. Run a probe a few times, and if its hash is not identical every run, it is reaching for Math.random, the clock, or unordered iteration -- a bug the author usually cannot see. And it is standalone: three files, no engine.

## Why

tools/repro/harness.js. fingerprintProbes hashes each probe and rolls a master via the same portable sha256 as the engine; checkDeterminism runs each probe several times and flags any whose hash varies; attestProbes and compareAttestations give the cross-machine proof with per-probe localisation. It imports only hash.mjs and sha256.mjs, so it drops into any project.

## Measured

tools/repro/harness-selfcheck.mjs, 5 checks. It fingerprints arbitrary probes into a master; it flags the Math.random and clock probes as non-deterministic while passing an honest sum; comparing two machines is identical-or-names-the-diverging-probe; it imports only the portable hash (standalone); and it is itself deterministic. A Reproducibility check button on verify.html runs it on sample computations in the browser. A tool, so the master is unchanged.

## Kill condition

tools/repro/harness-selfcheck.mjs. SABOTAGE: make the determinism check run each probe only once, so it can never see variation and calls everything reproducible -- and the detection test fails, because a reproducibility checker that cannot catch Math.random is no checker at all.

# Citations

- Code: tools/repro/harness.js (fingerprintProbes, checkDeterminism, attestProbes, compareAttestations, EXAMPLE_PROBES) + tools/repro/harness-selfcheck.mjs (5 checks, gated, sabotage-tested) + a Reproducibility check button on verify.html. The verification spine as a standalone tool for anyone's computation.
- Page: `verify.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
