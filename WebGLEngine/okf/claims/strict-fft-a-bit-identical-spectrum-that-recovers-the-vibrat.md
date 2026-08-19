---
type: claim
title: "Strict FFT -- a bit-identical spectrum that recovers the vibration eigenfrequencies"
description: "A Fourier transform is the tool a physicist reaches for to ask what frequencies are in a signal, but it is built from cosines and sines of 2 pi k / N -- the transcendentals that di"
tags: [settled, "swek-engine", v2697]
timestamp: v2697
---

# Strict FFT -- a bit-identical spectrum that recovers the vibration eigenfrequencies

- **Status:** settled  
- **Since:** v2697

## Prediction

A Fourier transform is the tool a physicist reaches for to ask what frequencies are in a signal, but it is built from cosines and sines of 2 pi k / N -- the transcendentals that disagree across machines -- so an ordinary FFT is not reproducible to the bit. Compute the twiddle factors once from the strict-trig core the engine proves bit-identical, and the radix-2 butterflies that do the work become pure arithmetic over that table: a fast transform whose every bit is reproducible, a spectrum you can publish and have someone else recompute exactly.

## Why

physics/fft.js. An iterative radix-2 Cooley-Tukey FFT: a bit-reversal permutation, then log2(N) stages of butterflies over a twiddle table filled once by strictCos and strictSin. fft, ifft (scaled by 1/N), spectrum (magnitudes), and peakBin. Only the twiddles touch a transcendental, and they come from the strict core, so the whole transform is cross-architecture.

## Measured

physics/fft-selfcheck.mjs, 5 checks. The inverse recovers the signal to 1e-12; a pure cosine at bin k peaks at bin k; Parseval holds, time energy equalling frequency energy to 1e-12; and -- the test that earns it a place beside the physics -- the FFT of one mass\'s motion in the vibrating chain lands on the analytic normal-mode frequency to within a frequency bin, for several modes. Deterministic, pure butterflies. Folded into the fingerprint as subsystem thirty-four; master 41fcf0f2...

## Kill condition

physics/fft-selfcheck.mjs. SABOTAGE: skip the bit-reversal permutation that orders the butterfly inputs and the transform scrambles -- the inverse no longer recovers the signal, the cosine\'s peak wanders off its bin, and the mode-recovery fails. The transform is a specific ordered computation, not a bag of multiplies; the ordering is load-bearing.

# Citations

- Code: physics/fft.js (fft, ifft, spectrum, peakBin -- radix-2 with strict-trig twiddles) + physics/fft-selfcheck.mjs (5 checks, gated, sabotage-tested, one of them recovering the vibration eigenfrequencies) + folded into tools/fingerprint (subsystem 34), tools/ledger, tools/catalog. A bit-identical spectrum -- the groundwork for a strict zeta.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
