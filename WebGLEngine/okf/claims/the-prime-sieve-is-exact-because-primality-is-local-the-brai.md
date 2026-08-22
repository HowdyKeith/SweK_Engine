---
type: claim
title: "The prime sieve is exact because primality is local. The brain's field is global."
description: "Keith: 'Can we look at the prime gates for your brain?' -- after the Prime Transport Architecture doc, 'Mapping prime sieving onto state search architecture', and 'that is interest"
tags: [settled, "swek-engine", v2615]
timestamp: v2615
---

# The prime sieve is exact because primality is local. The brain's field is global.

- **Status:** settled  
- **Since:** v2615

## Prediction

Keith: 'Can we look at the prime gates for your brain?' -- after the Prime Transport Architecture doc, 'Mapping prime sieving onto state search architecture', and 'that is interesting'. A prime sieve is a GATE: it eliminates candidates (multiples) you never examine. Beam search is the same shape -- keep the top-K frontier, gate out the rest. Does that gate fit the brain's search?

## Why

I MEASURED IT AND GOT TWO THINGS WRONG ON THE WAY. (1) My first Dijkstra SORTED THE WHOLE HEAP ON EVERY POP and reported 109ms against beam 12ms -- THAT 109ms WAS MY BUG, NOT THE ALGORITHM; the brain real Dijkstra runs 0.58ms with a proper heap (v2156). I nearly shipped my own bad heap as a finding. (2) I assumed the grid was TOO SMALL TO PRUNE -- WRONG: with a proper heap the frontier PEAKS AT 818 NODES on the 64^2 grid, ~20% of 4096 cells. THE GATE ABSOLUTELY CAN CLOSE. My instinct was backwards.

## Measured

The brain does not compute one path -- it computes a DISTANCE FIELD, a distance-to-goal for EVERY cell, because entities all over the grid navigate by its gradient (v2156: cost scales with cells, quality is cos 0.797 / 37 deg -- a whole-grid direction comparison). Beam K=200 vs exact Dijkstra, five seeds: goal distance ALWAYS OPTIMAL, and 1886/2060/2200/2252/2164 cells SUBOPTIMAL -- 46 to 55% of the reachable field WRONG-BUT-FINITE. Zero unreached; every one of those ~2000 cells is a place an entity might stand, reading a distance too large and NAVIGATING ALONG A CORRUPTED GRADIENT. IF YOU CHECK ONLY THE GOAL, THE GATE LOOKS LOSSLESS -- the most dangerous kind of wrong, because it passes the test you are most likely to run.

## Kill condition

Sabotage: claim beam is lossless (threshold 0.99) -> 1 fails. THE ANSWER: A PRIME SIEVE IS EXACT because PRIMALITY IS LOCAL -- you verify one number without consulting any other, so gating out multiples never wrongly eliminates a prime. SHORTEST-PATH DISTANCE IS GLOBAL -- a cell correct distance can run through a node the beam pruned to reach some OTHER cell. YOU CANNOT GATE A GLOBAL COMPUTATION THE WAY YOU SIEVE A LOCAL ONE AND STAY EXACT. THE ANALOGY BREAKS ON THE MATH, NOT THE SCALE. Same shape as v2137: the fancy mechanism (GPU there, beam here) loses to plain exact Dijkstra NOT because it is bad but because THE BRAIN PROBLEM DOES NOT HAVE THE STRUCTURE THE MECHANISM EXPLOITS.

# Citations

- Code: brain/primeGate-selfcheck.mjs (6 checks, gated, sabotage-tested). AND WHAT I DO NOT HAVE: the Prime Transport doc itself is NOT in my context. Notes say it is beam search with a transition mask, active_tuplets[index] indexes the tuplet array by the CANDIDATE index (bounds hazard), atomicAdd makes output order non-deterministic (the sin-RNG disease) -- BUT NOTES ARE NOT THE DOC. Those two bugs are unconfirmed against the real text until Keith zips it. This gate measures THE BRAIN, which I can see; it is not a review of a document I cannot.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
