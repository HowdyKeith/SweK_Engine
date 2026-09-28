# v4695 -- PRE-REGISTRATION: can a SCALE-FREE feature set transfer across content?

**Written before any new feature is computed, any fold is run, and any AUC is
measured. The commit that carries this file contains NO data.**

---

## 1. THE MECHANISM THIS ROUND IS ACTING ON

v4693 measured that the eleven features do not transfer:

- base rate **0.6343** on `smooth`, **0.2367** on `zone` -- the per-block answer
  moves by nearly 3x between two training-side scenes;
- **validation AUC 0.4214**, worse than a coin, on a scene not trained on;
- and on the held-out `checker` the gate kept 0.01% of blocks -- a threshold
  chosen elsewhere landed nowhere.

*** THE SUSPECTED CAUSE IS THAT FIVE OF THE ELEVEN CARRY ABSOLUTE MAGNITUDES. ***
`sadApp`, `sadFlow`, `sadStill`, `laplacian` and `variance` are all in the units
of the picture, and those units change with the content. But the LABEL is a
comparison -- does the generated block beat the cross-faded one -- and a
comparison is scale-free. So a network given absolutes has to infer the scene's
scale before it can use them, and inferring the scene's scale IS learning scene
identity. That is a mechanism, it predicts exactly what v4693 measured, and it is
falsifiable: make the features scale-free and the transfer should improve.

## 2. THE NEW FEATURE SET, FIXED NOW

Eleven again, so that width and count are held constant and only the *kind* of
feature changes. `eps = 1e-6` throughout. Frame-relative terms are divided by the
mean of that quantity over the SAME FRAME, which is available at inference time
and costs one pass.

| # | feature | why it is scale-free |
|---|---|---|
| 1 | `log((sadFlow + eps) / (sadApp + eps))` | a ratio of two errors in the same units |
| 2 | `log((sadStill + eps) / (sadApp + eps))` | how much any motion helps at all |
| 3 | `log((min(sadApp,sadFlow) + eps) / (sadStill + eps))` | the compensation gain -- the quantity the decision is about |
| 4 | `hypot(fx, fy) / block` | displacement in block units, not pixels |
| 5 | `laplacian / (sqrt(variance) + eps)` | high-frequency content per unit contrast |
| 6 | `variance / frameMeanVariance` | this block's detail relative to THIS frame |
| 7 | `laplacian / frameMeanLaplacian` | same, for the frequency proxy |
| 8 | `holeFrac` | already a fraction |
| 9 | depth rank within the frame, in [0,1] | a rank, not a value |
| 10 | `srcIsApp` | one-hot |
| 11 | `srcIsFlowBeat` | one-hot |

Hidden width stays **16**, the trainer stays `MLPTrainer`, the seed stays 7. This
round changes the feature set and nothing else, so a result can be attributed to
the feature set and nothing else.

## 3. THE DESIGN: LEAVE ONE SCENE OUT, AND THERE ARE ONLY THREE

fsr.html has exactly three scenes: `zone`, `smooth`, `checker`. So the design is
three folds -- train on two, score the third -- and the held-out block scores from
all three folds are POOLED into one ranking.

*** THREE SCENES IS THE WHOLE POPULATION AND THREE FOLDS CANNOT SUPPORT A CLAIM
ABOUT CONTENT IN GENERAL. *** v4693's closing line already said two training-side
scenes are not a distribution; three is not a distribution either. What this
design can do is compare two feature sets on identical folds with everything else
held constant, and that is all it is being asked to do.

## 4. THE STATISTIC, AND WHY IT IS NOT dB THIS TIME

**The primary is pooled leave-one-scene-out AUC**, not a PSNR difference.
v4693 showed why: a gate whose ranking is at chance cannot be rescued by any
threshold, so the ranking is the precondition and the dB is downstream of it.
Measuring dB first would spend a page drive to learn something AUC says for free.

Significance on AUC uses the Mann-Whitney normal approximation against the null
AUC = 0.5, with variance `n_pos * n_neg * (n_pos + n_neg + 1) / 12`. With tens of
thousands of pooled blocks the approximation is sound, and it is declared here so
it cannot be chosen afterwards.

## 5. THE PRIMARY -- H3, DECLARED NOW

**H3: the scale-free set transfers, and transfers better than the absolute set.**

Both clauses are required:

- **(a)** pooled held-out AUC of the NEW set is above 0.5 at **p < 0.05** by the
  test in section 4; **and**
- **(b)** pooled held-out AUC of the NEW set is **strictly greater** than that of
  the OLD set computed on the **identical folds, trainer, seed and split**.

**If either clause fails, H3 is REFUTED.**

## 6. CONTROLS

- **C7 (the comparison is the comparison):** the OLD set run through this exact
  pipeline must land near or below 0.5, reproducing v4693's direction. If it does
  not, the pipeline is not the pipeline that produced v4693 and clause (b) is
  comparing two different things.
- **C8 (the instrument cannot manufacture signal):** a SHUFFLED-label run must
  score pooled AUC within 0.02 of 0.5. If shuffling produces signal, every number
  here is an artefact of the harness.
- **C9 (no fold may hide behind the pool):** the three per-fold AUCs are reported
  individually. A pooled number carried by one fold is a different finding from a
  set that transfers, and pooling must not conceal which it is.
- **C5 (carried forward):** no fold's weights or scaler may see its own held-out
  scene. Structural, as before.

## 7. WHAT WOULD MAKE THIS ROUND A FAILURE, IN ADVANCE

- **The new set is also at chance** -> the features were not the problem either,
  and the per-block decision may not be predictable from block-local statistics at
  all. **That is the most important outcome available here** and it would retire
  the approach rather than the feature set -- the next question would be whether
  the oracle's 0.32 dB is reachable by anything that does not see the answer.
- **New beats old but both sit below 0.5** -> report both numbers and call it what
  it is: less bad is not transfer.
- **C8 fails** -> stop and report the harness, measure nothing through it.
- **One fold carries the pool** -> report per-fold, do not average over it.

## 8. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S9:** per-scene base rates under the new features (they do not change -- the
  label is unchanged -- so this is a consistency check, not a result).
- **S10:** which of the eleven the weights lean on.
- **S11:** the dB measurement on the held-out checker, IF and only if clause (a)
  passes. If the ranking is at chance there is nothing for a threshold to do and
  the drive is not worth its minutes.

## 9. WHAT THIS ROUND CANNOT CONCLUDE

- Nothing about content beyond these three synthetic scenes.
- Nothing about FSR4.
- Nothing about a bigger network: width 16, trainer, and seed are all held fixed
  from v4689 so that the feature set is the only moving part.
- Nothing about real hardware. SwiftShader is not a GPU.
