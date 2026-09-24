# v4698 -- PRE-REGISTRATION: does the scale-free set transfer, fold by fold, over seven scenes?

**Written before any feature, label, base rate or AUC is computed on the four
scenes v4697 added, and before any fold of this design is run. The commit that
carries this file contains NO data.** The statistic and the runner it names are
committed WITH it -- `tools/ship/foldStats.mjs` and `tools/ship/genGateFolds.mjs`
-- and are gated on synthetic data only, so the analysis is fixed as code and
not just as prose before anything is measured through it.

---

## 1. WHY THIS IS A NEW PRE-REGISTRATION AND NOT v4695 RE-RUN

v4696 stopped on control C8: v4695's primary, POOLED leave-one-scene-out AUC,
ranked blocks scored by different models fitted to different priors, and a
shuffled-label run reproduced it (0.2451). v4696 said what a sound test needs:
*"a statistic that does not pool across models with different priors, enough
seeds to carry an error bar, and more than three scenes."* v4697 supplied the
scenes. This document supplies the other two -- and a fourth thing v4696 did not
know it needed, found while writing this one:

*** THE SEED NEVER SEEDED THE TRAINING. *** `brain/learn.js`'s `MLPTrainer.step()`
drew its minibatches from `Math.random`. Every learned round since v4689 seeded
the INITIAL WEIGHTS and nothing after them. Measured on synthetic rows before
this document existed: two runs with the same seed shared **0 of 192** weights,
worst |dW| **4.98**. So "the seed stays 7" in v4695 section 2 held nothing fixed
past initialisation, and v4696's v1-against-v2 comparison was two draws, not one
draw with one thing changed. The trainer now takes an `rng`; it defaults to
`Math.random` looked up at call time, so the live brain is unchanged.

**v4689, v4692 and v4695 are left standing, not edited to agree.** Their
results were recorded as measured; what changes is that this design's seeds
mean what they say.

## 2. WHAT HAS ALREADY BEEN SEEN

Declared so that nothing here can pretend to be blind where it is not:

- **Seen:** v4696's per-fold AUCs on `smooth`, `zone`, `checker` (trained on two
  scenes, unseeded sampling, pooled design) and those three scenes' base rates,
  0.634, 0.237 and 0.753.
- **Seen:** v4697's pixel census of all seven scenes -- variance, |laplacian|,
  edge-pixel fraction, anisotropy -- computed on the sampler, not on any frame
  the generator produced.
- **NOT seen:** any feature vector, any label, any base rate or any AUC on
  `bars`, `edges`, `noise` or `ramp`. No page drive has harvested them.

## 3. THE DESIGN

Leave one scene out over all seven: train on six, score the seventh, seven
folds. One harvest per scene, the same page settings every learned round has
used. Four ARMS per fold per seed, all on the identical block population:

| arm | features | training labels |
|---|---|---|
| `V2` | the scale-free eleven | true |
| `V1` | the absolute eleven | true |
| `SHUF_A` | the scale-free eleven | permuted, stream A |
| `SHUF_B` | the scale-free eleven | permuted, stream B |

- The scale-free set is **v4696's corrected form**: feature 5 is
  `laplacian / (sqrt(variance) + sqrt(frameMeanVariance) + eps)`, not v4695's
  `laplacian / (sqrt(variance) + eps)`, which v4696 measured moving by 1.50e+5
  under a 4x brightness scaling.
- **A block is used only if it is finite in BOTH sets**, so every arm scores
  the same blocks and an arm difference is a feature difference.
- The seed drives initialisation AND minibatch sampling AND, in the shuffled
  arms, the permutation -- through separate streams, so `SHUF_A` and `SHUF_B`
  differ in their permutation and in nothing else, and `V2` and `SHUF_A` share
  their initialisation and sampling stream.
- The scaler and the weights are fitted on the fold's six training scenes only.

## 4. THE STATISTIC

**The unit of replication is the fold.** Blocks within a scene share texels,
frames and a camera path; 22,464 of them are not 22,464 observations, and the
Mann-Whitney variance v4695 declared would have reported an error bar for a
different experiment. Each fold contributes one number per arm:

> **A(fold, arm) = the mean, over the declared seeds, of that fold's held-out AUC.**

AUC within one fold is scored by one model per seed, so a fold's prior and its
score band cannot enter it -- the property the pooled statistic lacked.

**Fold exclusion, decided from held-out LABELS alone before any score is read:**
a fold whose minority class is below `minorityFloor` of its blocks is excluded
and reported by name. An AUC on a nearly one-class fold measures a handful of
blocks. `ramp` is named here in advance as the likeliest candidate: a cross-fade
of a linear gradient may be close to exact, so its labels may be one-sided.

**Minimum folds:** the one-sided exact sign test cannot reach p < 0.05 below
**five** observations (1/32 = 0.03125 at five; 1/16 at four). `minFolds` is
therefore 5, and `tools/ship/foldStats.mjs` DERIVES it from `alpha` and refuses
to run if the number below disagrees. If fewer than five folds are usable, H4
is **not reported** in either direction.

## 5. THE PRIMARY -- H4

**H4: the scale-free set transfers to unseen content, and transfers better than
the absolute set.** Over the usable folds:

- **(a)** `d = A(V2) - A(SHUF_A)` -- the scale-free set beats its own
  shuffled-label twin; **and**
- **(b)** `e = A(V2) - A(V1)` -- the scale-free set beats the absolute set.

Each clause is tested one-sided by **paired t AND exact sign**, both at
`p < alpha`, with a **positive mean**, via `tools/ship/pairedStats.mjs`'s
`pairedBoth`. H4 requires BOTH clauses -- an intersection-union test, level
alpha without correction, because it rejects only when every component does.

*** THE PRICE OF THIS DESIGN, STATED BEFORE IT IS PAID: *** with seven folds the
sign test clears only at 7 of 7 (1/128); 6 of 7 is 8/128 = 0.0625 and does not.
**One fold moving the wrong way fails a clause.** That is what an effect
consistent across content looks like at this sample size, and it is the claim
being tested. A clause that fails is reported as **not supported**, never as
"trending".

The four outcomes, interpreted in advance:

| (a) | (b) | reading |
|---|---|---|
| clears | clears | H4 supported: the scale-free set transfers, and better than the absolute one |
| clears | fails | something transfers, but scale-freeness is not shown to be why |
| fails | clears | less bad is not transfer -- report both and call it that |
| fails | fails | the features were not the problem either; see section 7 |

## 6. CONTROLS

- **C10 (the statistic is not v4696's trap):** v4696's synthetic mechanism --
  groups with coin-flip rankings, different priors and different score bands --
  must NOT clear clause (a) through this statistic, while a genuine within-fold
  signal of the same size MUST. Asserted by `tools/ship/foldStats-selfcheck.mjs`
  in this round, on synthetic data, before any real fold exists.
- **C11 (the harness cannot manufacture signal):** `g = A(SHUF_A) - A(SHUF_B)`
  must clear in NEITHER direction by the clause test. Two-sided on purpose: a
  one-sided check is blind to its mirror, which v4696 and v4697 each found in
  their own gates. **If C11 fires, stop, report the harness, and report nothing
  measured through it.**
- **C12 (the seed seeds):** re-running one fold, one arm, one seed must
  reproduce its AUC bit for bit. If it does not, the seeds are not replicates
  of anything and H4 is not reported.
- **C5 (carried):** no fold's scaler or weights see its own held-out scene.
  Checked on the runner's `trainedOn` record, not on its source text.

## 7. WHAT WOULD MAKE THIS ROUND A FAILURE, IN ADVANCE

- **Both clauses fail** -> with seeds that seed and a statistic that does not
  pool, the per-block decision is not shown to be predictable from block-local
  statistics on unseen content. That would retire the approach, not the feature
  set, and the next question would be whether the oracle's 0.32 dB is reachable
  by anything that does not see the answer.
- **C11 fires** -> the harness, not the features, is what is measured.
- **Fewer than five usable folds** -> the design cannot answer; nothing is
  reported and the exclusion reasons are.
- **Any per-fold number that one fold carries** is visible in the table of
  per-fold means, which is always reported.

## 8. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S12:** A(fold, arm) for every fold and arm, including excluded folds'
  label counts.
- **S13:** the across-seed standard deviation of each fold's AUC per arm -- the
  noise floor, which the NEXT design needs for a power calculation this one
  could not make.
- **S14:** the rank correlation, over the usable folds, between the V2-V1
  advantage and v4697's |laplacian| per scene. Seven points at most; a
  description, not a test.
- **Pooled AUC is RETIRED and is not computed.** Reporting a number already
  shown to be an artefact invites reading it.

## 9. THE DECLARED CONSTANTS

Read by `tools/ship/foldStats.mjs` `declared()`. A key missing here, or one
nothing reads, is refused. `seeds` has ten entries so that each fold's mean has
an error bar; seed 7 has no privileged status.

```declared
scenes = zone smooth checker bars edges noise ramp
seeds = 1 2 3 4 5 6 7 8 9 10
alpha = 0.05
minFolds = 5
minorityFloor = 0.01
steps = 4000
hidden = 16
lr = 0.05
batch = 32
upto = 40
speed = 2
```

`hidden`, `lr`, `batch` and `steps` are v4689's, unchanged since; `upto` and
`speed` are the harvest v4696 used.

## 10. WHAT THIS ROUND CANNOT CONCLUDE

- Nothing about content in general. Seven synthetic scenes are seven points
  chosen to span an axis, not a sample of anything.
- Nothing about FSR4, a bigger network, or a different trainer.
- Nothing about real hardware. SwiftShader is not a GPU.
