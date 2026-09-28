# v4702 -- PRE-REGISTRATION: can a rule with NOTHING FITTED rank the per-block decision?

**Written before the score below has been computed on any harvested block. The
commit that carries this file contains NO data.** The score, the per-scene
statistic and the test are committed WITH it as `tools/ship/genGateRule.mjs`,
gated on synthetic frames only by `tools/ship/genGateRule-selfcheck.mjs`.

---

## 1. WHY A RULE, AND WHY NOW

Five learned hypotheses have been measured. H1 and H2 were refuted, H3 was
unreportable, H4 and H5 were not supported. The last two had seeds that seed,
a statistic that does not pool, and in H5's case data nobody had seen. No
block-local feature set has been shown to rank the per-block decision on content
it did not train on. v4698 section 7 named the next question for exactly this
outcome: **whether the oracle's 0.32 dB is reachable by anything that does not
see the answer.**

Every failure so far was a failure to TRANSFER, and transfer is a learning
problem. A rule with no fitted parameter has nothing to transfer: there is no
weight, threshold, scaler or seed for a training scene to set. So a rule is not
a sixth feature set. It is a test of whether the per-block signal exists at all
once learning is taken away.

## 2. THE SCORE, FIXED NOW, AND WHERE IT COMES FROM

A cross-fade blends each pixel in place, which is exactly the hypothesis that
nothing moved. Generation warps along the chain's motion, so it should win
where motion explains the change between the two real frames better than
standing still does. The chain has already measured both before any middle
frame exists:

> **score = log( (sadStill + eps) / (min(sadApp, sadFlow) + eps) )**, `eps = 1e-6`

That is how much the best motion candidate reduces the prev-to-cur matching
error below the no-motion error. **Higher means generation is expected to win.**
It is the exact negation of the scale-free set's third column, the one v4695
called "the quantity the decision is about". So its direction was fixed by
that document before this one existed, and it is not chosen here.

The score reads three columns of the ABSOLUTE set and nothing else. It never
sees the label and never sees the middle frame.

## 3. THE DATA -- TWO CELLS ALREADY HARVESTED, AND WHAT HAS BEEN SEEN OF THEM

A rule needs no training data, so it can be scored on every block of every
scene. The two harvested cells are used as they are, and neither is
re-harvested:

- **x2** -- v4699's cache, seven scenes, the cell H4 was measured on.
- **x4** -- v4701's cache, seven scenes, the cell H5 was measured on.

**What has been seen:** on both cells, per-fold AUCs of LEARNED networks, the
per-scene base rates, and nothing else about these three columns in isolation.
**What has not been seen:** this score's AUC, on any scene, at either speed.
The learned networks consumed these columns among eleven; how a network used
them says nothing about how this fixed combination ranks, and no weight was
inspected.

## 4. THE STATISTIC

Per scene: **AUC of the score against the per-block label**, on the same block
population every learned arm used (finite in both feature sets). The scene is
the unit, for the reason v4698 gave: blocks within a scene are not independent.
Scene exclusion is v4698's rule (minority class under `minorityFloor`, from the
labels alone), and fewer than `minFolds` usable scenes, derived from `alpha`,
means that cell is not reportable.

## 5. THE PRIMARY -- H6

**H6: the parameter-free score ranks the per-block decision above chance, on
content in general, at both speeds.** For each cell, over its usable scenes,
`d = AUC - 0.5`, tested one-sided by **paired t AND exact sign** at `p < alpha`
with a **positive mean**. **H6 requires BOTH cells to clear**: an
intersection-union test over the two speeds, level alpha without correction.

The price is v4698's: seven scenes clear the sign test only at 7 of 7, per cell.
`edges` is named in advance. Every learned arm ranked it below chance at both
speeds, and if this score does too, H6 fails there by construction.

| x2 | x4 | reading |
|---|---|---|
| clears | clears | H6 supported: a signal exists that needs no learning, at both speeds |
| clears | fails | the signal exists at x2 and does not survive x4 -- or the reverse -- and H6 is not supported |
| fails | fails | block-local motion evidence, learned or fixed, does not rank the decision |

## 6. CONTROLS

- **C14 (blind):** the score is computed from the feature row alone.
  Permuting the labels leaves every score unchanged, and altering the
  scale-free columns leaves the result unchanged. Asserted in this round.
- **C15 (nothing fitted):** multiplying all three SADs by any positive `k`
  leaves the score unchanged up to `eps`. It has no scale to learn and no
  constant to tune. Asserted in this round.
- **C16 (the columns are the columns):** on every usable block of both cells,
  the score must equal the negated third column of the scale-free set, which
  the page computed from the same SADs by SEPARATE code (`featuresV2`), to
  within `columnTol`. Separate code, not independent evidence: it proves the
  column indices, which is all it is for. That proves the rule
  reads sadApp, sadFlow and sadStill and not three other columns. Asserted on
  synthetic frames through the real feature code in this round, and on the
  cached blocks in the next.
- **Cell identity:** each cache is only its cell if the run that harvested it
  recorded that speed. `checkCell` refuses otherwise.

## 7. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S20:** per-scene AUC of the score beside the recorded learned V1 and V2
  fold means at the same speed.
- **S21:** the thresholded rule, generate iff score > 0: the share of blocks it
  keeps against the oracle's base rate, and its per-block agreement with the
  label. **Still not a dB figure.**
- **S22:** each of sadApp, sadFlow and sadStill alone as a score, per scene.

## 8. WHAT COMES NEXT, DECLARED NOW

- **H6 supported** -> the next round measures the thresholded rule in dB on
  the page, against always-generate, always-cross-fade and the oracle. That
  would be the first time anything that does not see the answer is put to the
  0.32 dB question.
- **H6 not supported** -> block-local motion evidence does not rank the
  decision, with or without learning. The per-block gate at this block size is
  closed, and any further question is a different granularity or a different
  signal, not another rule over these columns.

## 9. THE DECLARED CONSTANTS

Read by `tools/ship/foldStats.mjs` `declared(text, RULE_KEYS)`. A missing key,
or one nothing reads, is refused.

```declared
scenes = zone smooth checker bars edges noise ramp
speeds = 2 4
alpha = 0.05
minFolds = 5
minorityFloor = 0.01
columnTol = 1e-4
```

`columnTol` is float32 room: the page stores both feature sets as float32, and
a log ratio near 20 carries an ulp of about 2e-6.

## 10. WHAT THIS ROUND CANNOT CONCLUDE

- Anything in dB. H6 is the ranking that any threshold would stand on.
- Anything beyond seven synthetic scenes at two speeds, or real hardware.
