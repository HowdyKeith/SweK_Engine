---
type: claim
title: A reason that expired is a habit
description: "REAL RIGID-BODY PHYSICS IS BIT-IDENTICAL ACROSS INSTRUCTION SETS. The wasm spec mandates IEEE-754 semantics for f32/f64, so box3d stepped 600 ticks on Galaxina (x86_64) and on the "
tags: [open, "swek-engine", v2570]
timestamp: v2570
---

# A reason that expired is a habit

- **Status:** open  
- **Since:** v2570

## Prediction

REAL RIGID-BODY PHYSICS IS BIT-IDENTICAL ACROSS INSTRUCTION SETS. The wasm spec mandates IEEE-754 semantics for f32/f64, so box3d stepped 600 ticks on Galaxina (x86_64) and on the M-series Mac (arm64) SHOULD hash the same. 'Should' is the reason to measure it. OPEN until Keith runs `node tools/crossarch-box3d.mjs` on both machines -- there is ONE architecture in this sandbox and no amount of cleverness makes that two.

## Why

tools/crossarch-flesh.mjs (v2546) hashes SPH -- OUR float arithmetic in OUR JS. This hashes BOX3D -- Erin Catto's solver doing constraint iteration and contact resolution, compiled by clang. Different question, and the harder one.

## Measured

NOT YET -- and the interesting part is why it took until now. v2546's own header says: 'WHY THIS AND NOT THE BOX3D TEST: box3d.wasm is not in the tree yet, and box3dLoader's planar fallback answers the same questions the real one does -- so running the box3d cross-arch test today would silently test the fallback.' TRUE IN v2546. FALSE SINCE v2560, when clang built the wasm in this sandbox. FOURTEEN VERSIONS OF A REASON THAT HAD EXPIRED, sitting in a comment, being re-read as if it were still a fact. SECOND TIME THIS SESSION: v2560 found FIVE versions of 'rig-only: emsdk CDN 403s' written without anyone ever asking whether emsdk was the only road to wasm (it was not -- clang targets wasm32 natively). A REASON THAT EXPIRED IS A HABIT. THE DIFFERENCE BETWEEN A BLOCKER AND A HABIT IS WHETHER ANYONE HAS RE-CHECKED IT SINCE WRITING IT DOWN. What IS proven, in the gate: the scene hashes IDENTICALLY twice on one machine (or the cross-arch question is unaskable), a 1e-7 nudge to ONE of 25 bodies CHANGES the hash (a hash that cannot change is decoration, and an insensitive harness printing the same string everywhere would look exactly like a triumphant 'bit-identical'), and the stack SETTLES with its lowest body at y=0.4996 against a half-extent of 0.5 -- real contact resolution, which is where a divergence would show, not free fall, where every architecture agrees because nothing is being decided.

## Kill condition

Different `state=` on x86_64 and arm64. First suspects IN ORDER: (1) THE TWO MACHINES RAN DIFFERENT BYTES -- the Mac PULLS the wasm from Galaxina over the fleet (192.168.10.8:8787), so the harness prints the wasm's OWN sha256 FIRST and if those differ nothing else means anything; (2) fma contraction, clang fusing a*b+c on one target and not the other; (3) libm transcendentals -- sqrt is exact per IEEE, sin/cos/exp are not mandated bit-exact. NOTE THE ORDER: THE LIKELIEST FAILURE IS NOT A PHYSICS BUG, IT IS COMPARING TWO BUILDS AND CALLING IT TWO ARCHITECTURES.

# Citations

- Code: tools/crossarch-box3d.mjs (the harness Keith runs on BOTH) + tools/crossarchBox3d-selfcheck.mjs (7 checks, gated). The gate CANNOT answer the cross-arch question -- one architecture here -- so it proves the harness would NOTICE, which is the only honest thing a single machine can contribute. It also RUNS the harness and compares the hash it PRINTS to the hash the gate computed: comparing source text would grep the PROSE of the scene rather than the scene, and reformatting could fake agreement.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
