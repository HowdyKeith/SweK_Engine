---
type: claim
title: "Verification console -- the fingerprint and peer attestation as buttons, in the browser"
description: "Every verification tool has been a .mjs run from a terminal -- the fingerprint, the attestation, the compare. For the person driving the engine, and for anyone judging it, the hone"
tags: [settled, "swek-engine", v2703]
timestamp: v2703
---

# Verification console -- the fingerprint and peer attestation as buttons, in the browser

- **Status:** settled  
- **Since:** v2703

## Prediction

Every verification tool has been a .mjs run from a terminal -- the fingerprint, the attestation, the compare. For the person driving the engine, and for anyone judging it, the honest question is where the button is. So the fingerprint is made to run in the browser and given a console with buttons: run the fingerprint, save this machine\'s attestation, load a peer\'s and prove byte agreement -- no terminal. The one node-only piece in the way was the hash, so the hash is rewritten in pure JavaScript, byte-for-byte identical, and the master does not change; it just becomes clickable.

## Why

tools/sha256.mjs (a pure-JS FIPS 180-4 sha256) and tools/hash.mjs (hashFloats/hashInts on DataView, no Buffer) replace node crypto in tools/fingerprint/fingerprint.mjs; the CLI blocks are guarded so the modules import cleanly in a browser. verify.html imports computeFingerprint and compareAttestations and binds three buttons; the attestation saves as a JSON file a peer can load. The compare localises any divergence to the exact subsystem, in the page, in colour.

## Measured

tools/hashConsistency-selfcheck.mjs, 5 checks. The pure-JS sha256 matches the FIPS empty-string and \'abc\' vectors; the whole-engine master computed through the pure-JS path is byte-identical to the terminal build (79d664a8...); hashFloats is stable and label-sensitive; verify.html imports the real functions and binds its buttons; and the hash is deterministic. The command-line fingerprint and the clickable one agree to the bit.

## Kill condition

tools/hashConsistency-selfcheck.mjs. SABOTAGE: corrupt one round constant of the sha256, and the FIPS vectors and the canonical master both break -- the pure-JS hash has to be exactly sha256 or the browser fingerprint would silently disagree with the terminal, the precise hidden divergence the engine exists to catch.

# Citations

- Code: tools/sha256.mjs + tools/hash.mjs (dual-runtime hashing) + guarded CLI blocks in tools/fingerprint/fingerprint.mjs and attest.mjs + verify.html (the console: run fingerprint, save attestation, compare peer) + tools/hashConsistency-selfcheck.mjs (5 checks, gated, sabotage-tested). Every verification tool now has a button; the rig attestation is a click on each machine.
- Page: `verify.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
