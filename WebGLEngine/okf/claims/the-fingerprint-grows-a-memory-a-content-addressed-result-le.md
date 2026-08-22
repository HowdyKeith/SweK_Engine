---
type: claim
title: "The fingerprint grows a memory -- a content-addressed result ledger across versions and peers"
description: "The fingerprint compares live; the ledger PERSISTS it. Each subsystem result is recorded keyed by CONTENT -- a hash of the subsystem source plus the input scenario source -- so a n"
tags: [open, "swek-engine", v2658]
timestamp: v2658
---

# The fingerprint grows a memory -- a content-addressed result ledger across versions and peers

- **Status:** open  
- **Since:** v2658

## Prediction

The fingerprint compares live; the ledger PERSISTS it. Each subsystem result is recorded keyed by CONTENT -- a hash of the subsystem source plus the input scenario source -- so a new version or another machine can be compared against everything recorded before, and a fresh install starts already knowing the fleet baseline. The point is to tell an INTENDED change from a REGRESSION, and to never let a green come from a result nobody computed.

## Why

tools/ledger/ledger.mjs. keyFor hashes (name + subsystem source + scenario source): unchanged code -> unchanged key -> the result must still match (regression check); changed code -> new key -> a NEW entry, nothing stale collides. compareToLedger classifies each locally-computed result as MATCH / REGRESSION / NEW; it never fabricates a verdict for a result you did not hand it. mergeLedgers folds two machines\' ledgers together, preserving per-result provenance (machine, arch, version) and flagging any key that ends up with two result hashes. tools/ledger/LEDGER.json is the persisted baseline; GET /ledger and POST /ledger/merge share it across the fleet.

## Measured

tools/ledger/ledger-selfcheck.mjs, 6 checks. Spine: same source-key with a DIFFERENT result hash is flagged REGRESSION (a bug or a cross-arch divergence), while a changed source (new key) is NEW, not a regression -- so the ledger distinguishes an intended edit from a real break. Also: keys are content-addressed (source and scenario both fold in), MATCH is exact, merging two machines surfaces divergence with provenance intact, and no fresh results in means no verdicts out (compare, never skip). x86_64 baseline seeded (6 subsystems, holding across v2657 and v2658). RIG-ONLY to fully settle: the arm64 Mac records into the ledger and the merge confirms agreement or names the diverging subsystem.

## Kill condition

tools/ledger/ledger-selfcheck.mjs. SABOTAGE: key by name alone, dropping the source hash -- an intended code change is then misread as a REGRESSION instead of NEW, and the content-addressed-key check fails. WITHOUT CONTENT-ADDRESSING THE LEDGER CANNOT TELL A BUG FROM A DELIBERATE CHANGE, and it would either cry wolf on every edit or hide real regressions. And if the ledger ever returned a verdict for a result the caller did not compute, a green could come from cache instead of from running the gate -- a check not in the gate is not being run.

# Citations

- Code: tools/ledger/ledger.mjs (keyFor/keyFromContent content-addressed keys, record, compareToLedger, mergeLedgers, load/save + CLI record|check) + tools/ledger/ledger-selfcheck.mjs (6 checks, gated, sabotage-tested) + tools/ledger/LEDGER.json (persisted x86_64 baseline) + GET /ledger and POST /ledger/merge in ai-bridge/fingerprintBridge.js. The fingerprint, now with a persistent fleet-wide memory.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
