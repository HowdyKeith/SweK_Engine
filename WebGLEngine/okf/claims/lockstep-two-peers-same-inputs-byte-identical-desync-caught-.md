---
type: claim
title: "Lockstep -- two peers, same inputs, byte-identical; desync caught at the frame; 700x headless"
description: "Two machines can run the same simulation together over a network by sending only their inputs -- a few numbers a frame -- and each simulating the whole world, but only if both comp"
tags: [settled, "swek-engine", v2704]
timestamp: v2704
---

# Lockstep -- two peers, same inputs, byte-identical; desync caught at the frame; 700x headless

- **Status:** settled  
- **Since:** v2704

## Prediction

Two machines can run the same simulation together over a network by sending only their inputs -- a few numbers a frame -- and each simulating the whole world, but only if both compute byte-for-byte the same result from the same inputs. That is the property the engine has spent its life proving, and lockstep is where it pays off. The other half is a per-frame checksum: both machines hash their state and compare, and the first frame the hashes differ is the frame the desync happened. The same headless step that keeps two peers in sync also replays a recorded match, lets a lagging peer catch up, and runs hundreds of times faster than realtime with no render.

## Why

physics/lockstep.js on the deterministic N-body engine. makeSession, stepFrame (apply this frame\'s impulses, step, hash the state via the dual-runtime hash), runTimeline, firstDivergence (the first frame two hash streams differ), verifyLockstep. Inputs are impulses on bodies; both peers simulate every body; the per-frame state hash is the checksum two peers exchange.

## Measured

physics/lockstep-selfcheck.mjs, 5 checks. Two peers on the same 600-frame timeline stay byte-identical every frame; an extra impulse on one peer at frame 250 is caught at exactly frame 250; a recorded timeline replays bit-for-bit; a peer 400 frames behind fast-forwards through its queue and lands on the identical state; and the session runs tens of thousands of frames a second headless -- hundreds of times realtime -- in +,-,*,/ and sqrt. Folded into the fingerprint as subsystem thirty-eight; a Lockstep self-test button on verify.html runs it in the browser; master 11f5de0c...

## Kill condition

physics/lockstep-selfcheck.mjs. SABOTAGE: blind the desync detector so it always reports in-sync, and the exact-frame check fails -- an undetected desync is the precise silent failure lockstep exists to prevent. A checksum that never fires is worse than none, because it lies.

# Citations

- Code: physics/lockstep.js (makeSession, stepFrame, runTimeline, firstDivergence, verifyLockstep) + physics/lockstep-selfcheck.mjs (5 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 38), tools/ledger, tools/catalog + a Lockstep self-test button on verify.html. Deterministic lockstep with per-frame desync localisation; the LAN transport is rig-side, the protocol and checksum are here.
- Page: `verify.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
