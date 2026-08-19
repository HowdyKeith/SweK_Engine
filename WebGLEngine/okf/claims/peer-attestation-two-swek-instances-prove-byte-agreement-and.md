---
type: claim
title: "Peer attestation -- two SweK instances prove byte agreement and name where they diverge"
description: "The fingerprint proves a machine agrees with itself; the cross-architecture claim -- that Galaxina and an arm64 Mac compute the same physics to the bit -- has been a human comparin"
tags: [settled, "swek-engine", v2698]
timestamp: v2698
---

# Peer attestation -- two SweK instances prove byte agreement and name where they diverge

- **Status:** settled  
- **Since:** v2698

## Prediction

The fingerprint proves a machine agrees with itself; the cross-architecture claim -- that Galaxina and an arm64 Mac compute the same physics to the bit -- has been a human comparing two hex masters by eye. That should be a first-class operation between two instances, and it should do the thing eyeballing a master cannot: when the two disagree, say WHICH subsystem diverged, so a cross-architecture bug is a named culprit, not a mystery in a 64-character string.

## Why

tools/fingerprint/attest.mjs. Each machine emits an attestation -- its per-subsystem hashes, the master, and a label of which machine it is. compareAttestations diffs two attestations subsystem by subsystem and reports identical-or-not, which subsystems diverged, and which are missing from one side (an older peer). A CLI emits this machine\'s attestation or compares two files, exiting non-zero on any divergence, so the pairwise proof can run in a script. Transport is the caller\'s -- the LAN, a file, a paste -- because the compare is the part that must be exactly right.

## Measured

tools/fingerprint/attest-selfcheck.mjs, 5 checks. Two attestations of the same computation are called identical across all subsystems and the master; changing one subsystem hash makes the compare name exactly that subsystem and no other; a peer missing a subsystem is flagged as missing rather than passed on a shorter list; the attestation covers every subsystem; and it is deterministic. A tool, not a physics subsystem, so the master is unchanged.

## Kill condition

tools/fingerprint/attest-selfcheck.mjs. SABOTAGE: make the compare look only at the master and stop recording which subsystems differ, and the localisation check fails -- because \'the masters differ\' is a strictly weaker tool than \'thermal-diffusion differs\'. The value is not the yes/no; it is the name of the culprit.

# Citations

- Code: tools/fingerprint/attest.mjs (attestation, compareAttestations, peerVerify, verdict, CLI) + tools/fingerprint/attest-selfcheck.mjs (5 checks, gated, sabotage-tested). Automated peer byte-comparison with per-subsystem localisation; LAN transport is the rig-side piece.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
