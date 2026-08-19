---
type: claim
title: "One fingerprint proves the whole engine is bit-identical across machines"
description: "Every deterministic subsystem -- strict-libm, the MD force field, OBB collision, Ewald electrostatics, Prime Transport search -- is separately gated as reproducible. The fingerprin"
tags: [open, "swek-engine", v2653]
timestamp: v2653
---

# One fingerprint proves the whole engine is bit-identical across machines

- **Status:** open  
- **Since:** v2653

## Prediction

Every deterministic subsystem -- strict-libm, the MD force field, OBB collision, Ewald electrostatics, Prime Transport search -- is separately gated as reproducible. The fingerprint ties them into ONE number: run a fixed scenario through each, hash the result, fold into a master hash. Same master on Galaxina (x86_64) and the M-series Mac (arm64) = the entire engine computed bit-identical across architectures, proven in one command.

## Why

tools/fingerprint/fingerprint.mjs runs a fixed, arithmetic-only scenario through each subsystem (the SETUP itself avoids library Math.sin/cos so it cannot differ across machines for the wrong reason -- e.g. the MD angle cos0 is a hard literal). It serialises each result to explicit little-endian bytes and SHA-256s them, then folds the five subsystem hashes into a master. tools/fingerprint/BASELINE.md records the x86_64 reference.

## Measured

RIG-ONLY to settle: the harness runs here and the gate proves it is STABLE (identical master across repeated runs, so any cross-machine diff is real), COMPLETE (all five subsystems folded in, each a 256-bit hash), DISTINCT (no subsystem is a no-op), and SENSITIVE (zeroing any one subsystem moves the master). A non-deterministic subsystem is shown to fail the stability check, so it is not vacuous. x86_64 master = 347be10159ee6db7012b392fe33c3f5831be6efa2368c56cc20ec1aa03b23e05. Settles when the arm64 Mac produces the SAME master.

## Kill condition

tools/fingerprint/fingerprint-selfcheck.mjs. SABOTAGE: inject Math.random into one subsystem -- the stability check fails. If the arm64 master DIFFERS from the x86_64 baseline, the per-subsystem hashes say exactly which science diverged -- that is the fingerprint doing its job, not failing. A subsystem left out of the master would let a science drift undetected.

# Citations

- Code: tools/fingerprint/ (fingerprint.mjs harness across strict-libm + MD + collision + Ewald + Prime Transport, fingerprint-selfcheck.mjs [5 checks, gated, sabotage-tested, auto-discovered], BASELINE.md x86_64 reference). The one number that turns a pile of separately-verified sciences into a single whole-engine reproducibility claim.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
