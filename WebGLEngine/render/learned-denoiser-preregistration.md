# The denoiser arc -- PRE-REGISTRATION: can a small convolutional network denoise this tree's path tracer on scenes it never saw?

**Written before any scene is generated, any image is rendered for the dataset, any network is trained and any
error is measured. The commit that carries this file contains NO data.** It is committed with the layer the
network is built from (`brain/conv2d.mjs`, gated by `brain/conv2d-selfcheck.mjs` on synthetic inputs only). The
next round commits the scene generator, the hand-written filter, the network and its trainer, and the statistic
below as CODE, each gated on synthetic data, before a single dataset image exists. The round after that harvests
and measures. That is the rule v4660, v4684 and v4698 set in this tree, and it is why their results can be read.

The one number measured before writing this is not outcome data: the CPU path tracer's throughput on a scene outside
the dataset (four spheres, 48 x 48), 0.585 M paths/s at 64 spp. It sets the sizes below and nothing else.

---

## 1. WHY THIS TARGET, AND WHAT THE LAST LEARNED ARC TEACHES IT

The learned frame-generation gate (v4689-v4703, `render/genGateVerdicts.mjs`) ended with six hypotheses refuted,
not supported, or not reported. The decision was worth having -- the oracle won +0.3191 dB on 33 of 33 frames -- but
**nothing learned on one scene's content transferred to another's**: validation AUC 0.4214, worse than a coin. The
features were hand-made and the scenes were few.

A path-tracer denoiser removes the reason that arc could not get more data. **Ground truth is renderable.** The
answer for any scene is the same scene at many more samples, so there is no limit on training scenes and no
question about what the right output was. The transfer question does not go away, and this design puts it
first-class: one held-out set from the training family, and one from a family the network has never seen.

## 2. THE QUESTION

> **On scenes it was not trained on, does a small convolutional network reduce the error of a 4-sample render
> against a 1024-sample reference by more than a hand-written edge-aware filter given the same inputs?**

The baseline is not "no denoising". Any smoothing beats raw noise. The bar is a filter a person would write without
learning anything, given the same guide buffers and tuned on the same training scenes.

## 3. THE DATA, FIXED HERE

All images are **64 x 64**, rendered by `physics/render/pathTracer.mjs`'s `render({ rgb: true })` -- the shipped
CPU tracer, not a copy. Each scene draws its random numbers from its own seed; the noisy input and the reference
use **different** render seeds, so their noise is independent.

- **Input:** 4 samples per pixel.
- **Reference:** 1024 samples per pixel.
- **Second reference (test scenes only):** another independent 1024-sample render, for control C3.

**Two scene families**, from one generator with a family switch:

- **Family A (training family).** A ground sphere, 3 to 6 Lambertian spheres of random albedo, radius and position,
  one spherical emitter of random strength 4 to 12, a gradient sky, and the eye on a ring around the scene looking
  at its centre.
- **Family B (transfer family).** The same generator, with three differences, none seen in training:
  - half the spheres are microfacet (`roughness` 0.1 to 0.5);
  - the sky is a hard-band sky instead of a gradient;
  - the emitter is half the size, so its noise is harsher.

**The splits** (scene seeds are drawn from disjoint integer ranges, fixed in the generator's code next round):

| Split | Family | Scenes | Use |
|---|---|---|---|
| train | A | 24 | network training and filter tuning |
| val | A | 4 | watched, never used to choose anything; reported |
| T1 | A | 12 | held out, in-family test |
| T2 | B | 12 | held out, transfer test |

## 4. THE INPUTS AND THE OUTPUT

Per pixel, at the camera ray's first hit, from `pathTracer.mjs`'s own `intersect()`:

- **Albedo** (3 channels): the hit material's base colour. Sky pixels: 1.
- **Normal** (3 channels): the hit normal. Sky pixels: 0.
- **Noisy irradiance** (3 channels): the 4-sample radiance divided by max(albedo, 0.01) per channel. This
  **albedo demodulation** is fixed here because it is what makes texture not the network's problem.

That is **9 input channels**, channels last, as `brain/conv2d.mjs` takes them. The network outputs 3 channels of
denoised irradiance, and the final image is that output times the albedo.

## 5. THE NETWORK AND ITS TRAINING, FIXED HERE

- **Layers:** four `brain/conv2d.mjs` layers, k = 3: 9 -> 16 (relu) -> 16 (relu) -> 16 (relu) -> 3 (none).
  - Receptive field: 9 x 9.
  - Parameters: 6,387 (1,312 + 2,320 + 2,320 + 435).
  - The output is ADDED to the noisy irradiance (a residual), so an untrained network is the identity plus noise
    rather than a black image.
- **Loss:** relative MSE (section 6's metric), on the final image.
- **Optimizer:** Adam, learning rate 1e-3, beta 0.9 / 0.999, epsilon 1e-8.
- **Steps:** 1,500, a batch of 4 random 32 x 32 crops of training images.
  - No early stopping; nothing is chosen on val.
- **Initialisation:** He-normal weights, zero biases.
- **Seeds:** three, {1, 2, 3}. **The seed must seed EVERYTHING random in training** -- initial weights, crop
  positions, batch order. v4698 found `MLPTrainer` seeded only the weights, and two runs with one seed shared 0 of
  192 of them. Control C4 holds this.
- **Training runs on the CPU,** against `conv2dBackward`, in f64. The device kernels are for inference, later.

## 6. THE METRIC AND THE STATISTIC

**Metric.** Per image, relative MSE over every pixel and channel:
`relMSE = mean( (y - r)^2 / (r^2 + 0.01) )`, with r the 1024-sample reference.

**Per-image effect.** For test image i:
`d_i = ln relMSE(filter_i) - ln relMSE(net_i)`, where net_i's relMSE is the mean over the three seeds' errors.
Positive means the network won.

**H1 (in-family).** On T1, the network beats the filter.
- Supported iff the mean of d_i over the 12 images is > 0 **and** the exact one-sided sign test on the 12 signs
  gives p below its Holm threshold.

**H2 (transfer).** The same test on T2.

**Multiplicity.** Holm-Bonferroni over {H1, H2} at family alpha 0.05:
- the smaller p is held to 0.025, the other to 0.05;
- with 12 images, 10 of 12 positive gives p = 0.0193 and 9 of 12 gives p = 0.0730.

## 7. CONTROLS -- each can make the run report "not resolvable" instead of a verdict

- **C1, sanity.** Both the network and the filter must beat the noisy input itself, on at least 11 of 12 images of
  each test set. If either does not, something upstream is broken and no verdict is reported.
- **C2, shuffled targets.** A network trained identically on noisy inputs paired with the references of OTHER
  training scenes (a fixed permutation) must NOT beat the filter on T1 (mean d <= 0). If it does, the statistic is
  measuring something other than denoising -- the v4696 shape, where a shuffled run reproduced the primary.
- **C3, reference floor.** Per test image, the relMSE between the two independent references is that image's
  floor. If the network's relMSE is within 2x of its floor on more than half of a test set, the references cannot
  rank the methods there, and that hypothesis is reported "not resolvable".
- **C4, determinism.** Training with one seed twice gives bit-identical weights, or the seeds mean nothing.
- **C5, independent noise.** The input and reference render seeds of every image are distinct, asserted in code.

## 8. THE HAND-WRITTEN FILTER, FIXED HERE

A joint (cross) bilateral filter on the demodulated noisy irradiance, re-modulated by albedo after.
- **Window:** 9 x 9, the network's own receptive field.
- **Weights:** Gaussian in pixel distance, normal difference, albedo difference and irradiance difference.
- **Tuning:** four sigmas, chosen by grid search on the 24 TRAINING scenes only, minimising mean ln relMSE. The grid
  is fixed in its code next round. It gets exactly the data the network gets and nothing more.

## 9. WHAT EACH OUTCOME BUYS

- **H1 and H2 supported:** the network goes to the device -- inference through `brain/conv2d.mjs`'s kernels -- and to
  a page beside the path tracer's.
- **H1 only:** the network denoises its own family and not a new one. Transfer is the next round's subject, with
  this round's T2 never re-analysed for it.
- **Neither:** recorded as such, with the controls' numbers, and the arc stops until something changes the input.

## 10. SECONDARY -- reported, never tested, never used to choose

- 1-sample and 16-sample inputs through the same trained networks.
- Per-seed results.
- Per-image tables.
- val's numbers.
- Training and inference time.

## 11. CLARIFICATIONS FIXED IN ROUND 2 -- STILL BEFORE ANY DATA

Writing sections 3-8 as code (`render/denoiseScenes.mjs`, `render/denoiseFilter.mjs`, `brain/convNet.mjs`,
`render/denoiseNet.mjs`, `render/denoiseStats.mjs`, each gated on synthetic data only) found places where the prose
above left a choice open. Each is closed here, in the commit that carries the code, and no dataset image exists yet:
`renderImages()` refuses every dataset seed without `{ harvest: true }`, and nothing in this round passes it.

1. **Base colour, everywhere it is divided out.**
   - Lambertian surfaces: `albedo`.
   - Microfacet surfaces: `F0`, their colour in this tracer (white where absent).
   - The sky and emitters: 1. Section 4 named only the sky; an emitter has no surface colour either, and its
     albedo of 0 would have been floored to 0.01 and multiplied its radiance by 100.
2. **Guide buffers** come from each pixel's CENTRE ray; the noisy radiance averages its jittered samples.
   - An emitter hit keeps its surface normal; only the sky's normal is 0.
3. **Channel order:** [irradiance rgb, albedo rgb, normal xyz]. `remodulate` multiplies by the same floored albedo
   `inputChannels` divided by.
4. **The scene generator's numbers,** in the code:
   - the ground is a sphere of radius 100 centred 100 below the origin, albedo 0.3-0.7 per channel;
   - spheres have radius 0.25-0.7, rest on the ground, are kept apart, and sit within |x|, |z| <= 1.6;
   - the emitter has albedo 0, strength 4-12, at height 2.5-3.5;
   - the gradient sky is a + b (y + 1) / 2, with a 0.05-0.2 and b 0.2-0.6;
   - the band sky is hi above a horizon h and lo below, with h -0.1-0.3, hi 0.4-0.8 and lo 0.02-0.1;
   - the eye sits on a ring of radius 4-5 at height 1-2, looking at (0, 0.4, 0);
   - in family B, every second sphere placed is microfacet.
5. **Render seeds:** a scene seed s renders its input with 8s + 1, its reference with 8s + 2 and its second
   reference with 8s + 3. All 156 are distinct across the dataset (C5, asserted in the gate).
6. **The filter's irradiance term** compares ln(1 + irradiance), so one sigma serves dim and bright regions.
   - A sigma of Infinity switches its term off.
   - The grid is sS {1, 2, 4}, sN {0.1, 0.3, 1}, sA {0.05, 0.2, 1}, sI {0.25, 1, 4, Infinity}: 108 settings.
   - Ties go to the earliest setting.
7. **Training draws.** After the initial weights, each crop of each step draws the image, then the crop's x corner,
   then its y corner, from the same stream. The batch's loss and gradient are the means of its crops'.
8. **Control C2's permutation:** training image i (in seed order) is paired with the reference of image
   (i + 1) mod 24. That is a fixed derangement: no image keeps its own reference. It is trained with the same three
   seeds as the primary network.
9. **Control C3's "more than half"** of 12 means 7 or more.
10. **The run-level outcomes.**
    - "not reported": C1, C4 or C5 fired. Nothing about H1 or H2 is claimed.
    - "not resolvable": C2 fired.
    - A hypothesis can also be "not resolvable" alone, through C3.

## 12. THE HARVEST -- RUN ONCE, NOT REPORTED (C1)

`node tools/denoiseStudy.mjs --harvest` at commit b023baa4, 2026-10-07 22:17-22:35Z (1,090 s). Its output,
unedited, is `render/denoise-results.json`.

- **Outcome: "not reported".** C1 fired on T1: the network beat the noisy input on 9 of 12 images, and 11 are
  needed. The filter beat it on 12 of 12. C2 (mean d -3.89), C4 (bit-identical retrain) and C5 held.
- Per section 7, **nothing is claimed about H1 or H2.** T1 and T2 have now been seen. No fix is ever measured on
  them.
- What the tables show: on every test image, every seed's network is within about 1% of the noisy input. The tuned
  filter (sS 1, sN 0.3, sA 0.05, sI 1) cut relMSE about 5x.

**Diagnosis, on the TRAINING split only** (24 scenes re-rendered from their seeds; val, T1 and T2 not touched):

| Probe (seed 1, 1,500 steps, the pre-registered batch and crop) | Train relMSE, net / noisy (geometric mean) |
|---|---|
| the pre-registered network, lr 1e-4 / 1e-3 / 1e-2 | 1.007 / 0.998 / 1.000 |
| one linear 3 x 3 residual layer, zero-initialised, lr 1e-3 | 0.426 |
| a hand-set 3 x 3 box blur of the irradiance (no guides) | 1.109 |
| the pre-registered network, last layer's weights zero | **0.182** |
| the pre-registered network, last layer's He weights x 0.01 | **0.176** |

- **The cause is the initialisation section 5 fixed.** He-normal weights in the residual's LAST layer add large
  random noise to the image at step 0. The training loss starts at 0.050 against the identity's 0.016.
- Adam's first ~50 steps undo that noise, and the network settles in the "add nothing" basin. The training loss
  then holds at 0.0163 for the remaining ~1,450 steps at all three learning rates.
- The same network, with only its last layer started at (or near) zero, fits the training set to 0.18x the noisy
  error.
- **The rest of the pipeline is sound:**
  - the inputs are tame: demodulated irradiance median 0.37, p99.9 1.37, max 9.1;
  - 6 of 16 units in layer 3 never fire, and the other layers have no dead units;
  - fireflies do not dominate: the worst 1% of pixel-channels carry 22% of the noisy input's error;
  - a convex model learns.

Section 9's "neither" outcome does not apply: no hypothesis was tested. Any next round is a new pre-registration.
It must use new T1 and T2 scenes from seed ranges disjoint from every range above, and it is recorded beside this
one, not in place of it.

## 13. THE RE-RUN -- AMENDED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of the re-run's T1 or T2 has been rendered: `renderImages()`
refuses their seeds without `{ harvest: true }`, and nothing but the re-run's command passes it. Section 12's run
stands as recorded; this is a second study beside it, not a replacement.

**What was seen first.** The 24 training scenes, during section 12's diagnosis. The rules below were chosen knowing
those numbers. No other scene was looked at, and val's numbers in round 1's file were never used for anything.

**Three changes. Everything else in sections 3-11 holds as written.**

1. **Initialisation.** He-normal weights are drawn for every layer from the run's seeded stream, exactly as in round
   1, and then the LAST layer's weights are set to zero (its biases were already zero).
   - An untrained network is therefore exactly the identity.
   - Every later draw (image choice, crop corners) is the one round 1 made.
   - In code: `render/denoiseNet.mjs`, `INIT = "zero-last"`.
2. **Control C0, training fit.** After the three networks are trained, and BEFORE a test scene is rendered: per seed,
   take the geometric mean over the 24 training images of relMSE(network) / relMSE(noisy input).
   - C0 holds when every seed's is at most **0.8**.
   - If it fires, the run is "not reported", it STOPS, and its test scenes are never rendered. A failed fit cannot
     spend a test set again.
   - The bar is loose on purpose: section 12's probe measured 0.18 for this initialisation and 1.00 for round 1's,
     so C0 would have stopped round 1 before T1 and T2.
   - In code: `trainFit()` and `C0_MAX_RATIO` in `render/denoiseStats.mjs`, and the stop in
     `render/denoiseStudy.mjs`.
3. **New test sets.**
   - T1: family A, scene seeds 5000-5011.
   - T2: family B, scene seeds 6000-6011.
   - Neither range overlaps any earlier split, and C5 holds over both rounds together: 76 scenes, 228 distinct render
     seeds.
   - train (1000-1023) and val (2000-2003) are round 1's.
   - In code: `SPLITS_R2` in `render/denoiseScenes.mjs`.

**The command:** `node tools/denoiseStudy.mjs --harvest-r2`.
- It writes `render/denoise-results-r2.json`.
- It refuses to start if that file exists, so a harvest's results are never overwritten.
- Round 1's run is `--harvest-r1` (it was `--harvest` at b023baa4), which refuses for the same reason.

**The outcomes and what each buys:** section 9's, unchanged. C0 is one more way to "not reported".

## 14. THE RE-RUN -- REPORTED: H1 NOT SUPPORTED, H2 NOT SUPPORTED

`node tools/denoiseStudy.mjs --harvest-r2` at commit b8e475fb, 2026-10-07 23:26Z to 2026-10-08 00:12Z (2,729 s).
Its output, unedited, is `render/denoise-results-r2.json`.

**Every control held.**

| Control | Result |
|---|---|
| C0, train fit per seed | 0.182 / 0.214 / 0.181 (bar 0.8) |
| C1 | network 12 of 12 and filter 12 of 12 against the noisy input, on T1 and on T2 |
| C2 | shuffled-target network mean d -3.91 |
| C3 | 0 of 12 images within 2x of the floor on either set |
| C4 | bit-identical retrain |
| C5 | distinct render seeds |

**The hypotheses.**

| | Network wins (of 12) | mean d | one-sided p | Holm threshold | Status |
|---|---|---|---|---|---|
| H1, in-family (T1, seeds 5000-5011) | 2 | -0.111 | 0.9968 | 0.025 | **not supported** |
| H2, transfer (T2, seeds 6000-6011) | 1 | -0.184 | 0.9998 | 0.05 | **not supported** |

- **The network denoises.** Against the 4-sample input it cut relMSE by roughly 5x on T1 and 3-4x on T2, on every
  image.
- **It does it worse than the hand-written filter.** Taking the geometric mean over images, the filter's error is
  about 11% lower than the network's on T1 and about 17% lower on T2.
- The gap is larger on the family the network never trained on.
- The filter wins on 10 of 12 T1 images and 11 of 12 T2 images.

**Secondary** (reported, never tested, never used to choose). Geometric-mean relMSE, filter vs the three seeds'
networks:

| Input | T1: filter / networks | T2: filter / networks |
|---|---|---|
| 1 sample | 0.0097 / 0.0126-0.0146 | 0.0507 / 0.0502-0.0665 |
| 16 samples | 0.0016 / 0.0015-0.0017 | 0.0071 / 0.0070-0.0083 |

- val (4 scenes): the networks' relMSE was below the filter's on 3 of 4 scenes for every seed.
- Per-seed spread is visible: seed 3 is the best network on almost every image.
- Wall time on this box: training 1,166 s for four networks; the shuffled-target networks 813 s.

**What this buys, per section 9: "Neither".** The result is recorded as such, with the controls' numbers above, and
the arc stops until something changes the input.

- The network is not taken to the device, and no page is built for it.
- The pre-registered question has its answer. At 64 x 64, 4 samples, 6,387 parameters, 1,500 steps and 24 training
  scenes, a small convolutional network learns to denoise this tracer, and a tuned joint bilateral filter given the
  same guide buffers does it better, in-family and across families.
- What "something changes the input" could mean is a new pre-registration's question, not this one's: more training
  scenes, more steps, a wider network, a kernel-predicting output, or temporal inputs. None of them is chosen by
  looking at these test sets, which are now spent too.

## 15. ROUND 3 -- THE KERNEL-PREDICTING NETWORK, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered. Sections 12-14 stand
as recorded.

**The question.** Section 14 found that a network which predicts a correction to the irradiance learns to denoise
but loses to the filter, by more on the family it never saw. The filter's output is a weighted average of real
samples in a 9 x 9 window. So:

> **If the network predicts the weights of that average itself, per pixel, does it beat the same filter on scenes
> it was not trained on?**

**One deliberate change: the output head.** Everything else in sections 3-11 and 13 holds as written: the scenes,
inputs, splits, metric, statistic, controls (C0-C5, with C0's bar at 0.8), seeds, optimiser, steps, batch, crop,
the zero-last initialisation, and the filter and its tuning.

- **The network:** round 2's three hidden layers, unchanged (9 -> 16 -> 16 -> 16, 3 x 3, relu), then a **1 x 1 layer
  to 81 logits** per pixel.
  - 7,329 parameters, against round 2's 6,387. The 1 x 1 head keeps the change to the output's meaning rather than
    to capacity.
- **The output:**
  - a softmax over the logits of the taps inside the image gives each pixel weights over its 9 x 9 window (the
    filter's window);
  - the output irradiance is the weighted sum of the NOISY demodulated irradiance, one kernel shared by r, g and b;
  - it is re-modulated by the pixel's albedo, as before.
  - The output is always a convex combination of real samples.
- **Initialisation:** zero-last, as section 13. An untrained network is therefore the 9 x 9 box mean.
- In code: `head: "kernel"` in `render/denoiseNet.mjs` (`SHAPE_KERNEL`, `KERNEL_RADIUS`, `KERNEL_TAPS`).

**New test sets.**
- T1: family A, scene seeds 7000-7011.
- T2: family B, scene seeds 8000-8011.
- Neither range overlaps anything earlier. C5 holds over all three rounds: 100 scenes, 300 distinct render seeds.
- train (1000-1023) and val (2000-2003) are unchanged.
- In code: `SPLITS_R3`.

**What was seen first: the TRAINING scenes only.** A pilot trained one kernel network (seed 1, the full schedule) on
the 24 training scenes to confirm the head learns before committing to it. Training fit, geometric mean of
relMSE / noisy:

| Method | Train fit |
|---|---|
| kernel network, seed 1 | 0.141 |
| round 2's residual network, seed 1 | 0.182 |
| the tuned filter | 0.192 |

Round 2's residual also fit the training set better than the filter and lost on test, so this predicts nothing
about H1 or H2. It was used only to confirm that C0 can pass. No other choice was made from it. The 9 x 9 window and
the 1 x 1 head were fixed before it ran.

**Secondary** (reported, never tested, never used to choose):
- round 2's residual network, trained identically on the same scenes with the same three seeds, measured on this
  round's T1 and T2 beside the kernel network;
- the 1- and 16-sample inputs as before;
- val;
- per seed;
- time.

**The command:** `node tools/denoiseStudy.mjs --harvest-r3` -> `render/denoise-results-r3.json`. It refuses if the
file exists.

**The outcomes, per section 9:**
- **H1 and H2 supported:** the kernel network goes to the device. Its 81-wide output needs `brain/conv2d.mjs`'s
  device kernels widened past `COUT_MAX` 32, or the head split into three passes.
- **H1 only:** transfer is still the open subject.
- **Neither:** recorded, and section 16 is the temporal round, already chosen as the next change.

## 16. ROUND 3 -- REPORTED: H1 SUPPORTED, H2 NOT SUPPORTED

`node tools/denoiseStudy.mjs --harvest-r3` at commit 899caac3, 2026-10-08 01:30:36Z to 02:11:31Z (2,455 s). Its
output, unedited, is `render/denoise-results-r3.json`.

**A first attempt** started at 01:07:47Z from the same commit. A container restart killed it at 272 s, after the
training scenes were rendered and the filter was tuned, before any network was trained or any test scene rendered.
It wrote nothing and nothing from it was read. The run is deterministic, so the second attempt is the same
computation from the start.

**Every control held.**

| Control | Result |
|---|---|
| C0, train fit per seed | 0.141 / 0.134 / 0.137 (bar 0.8) |
| C1 | network 12 of 12 and filter 12 of 12 against the noisy input, on T1 and on T2 |
| C2 | shuffled-target network mean d -2.38 |
| C3 | 0 of 12 images within 2x of the floor on either set |
| C4 | bit-identical retrain |
| C5 | distinct render seeds |

**The hypotheses.**

| | Network wins (of 12) | mean d | one-sided p | Holm threshold | Status |
|---|---|---|---|---|---|
| H1, in-family (T1, seeds 7000-7011) | 10 | +0.191 | 0.0193 | 0.025 | **supported** |
| H2, transfer (T2, seeds 8000-8011) | 5 | -0.064 | 0.806 | 0.05 | **not supported** |

- **In-family, the kernel-predicting network beats the tuned filter.** Its relMSE is about 20% below the filter's
  (geometric means 0.0020 vs 0.0025), with every seed at 0.0020-0.0021.
- **On the family it never saw, it does not.**
  - Geometric means: network 0.0142, filter 0.0133. The filter wins on 7 of 12 images.
  - The spread across seeds is wide: 0.0122 / 0.0146 / 0.0154.

**Secondary** (reported, never tested, never used to choose). Geometric-mean relMSE on this round's test images:

| | T1 | T2 |
|---|---|---|
| round 2's residual network, same training, same seeds | 0.0029-0.0032 | 0.0146-0.0185 |
| this round's kernel network | 0.0020-0.0021 | 0.0122-0.0154 |
| 1-sample input: filter / kernel networks | 0.0076 / 0.0057-0.0064 | 0.0640 / 0.0501-0.0618 |
| 16-sample input: filter / kernel networks | 0.0013 / 0.0011-0.0012 | 0.0048 / 0.0049-0.0054 |

- val: filter 0.0024, networks 0.0019-0.0020.
- On the same scenes, the head alone moved the network from behind the filter to ahead of it in-family.

**What this buys, per section 15: "H1 only".** The kernel network denoises its own family better than the filter
and does not carry that to a new one; transfer is still the open subject.
- The network does not go to the device on this result alone. Section 9 asks for both hypotheses.
- Section 17, the temporal round, was fixed before this section's numbers were read, and is unchanged by them.

## 17. ROUND 4 -- THE TEMPORAL ROUND, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it, on its own branch. No scene of this round's T1 or T2 has been rendered.
Section 15 called this round "section 16". Round 3's results take that number, so this one is 17.

**Fixed before round 3's verdict was known.** This section was written while round 3's harvest was still running,
so nothing below was chosen from round 3's numbers. The head is round 3's kernel head whatever round 3 found:
blending real samples is how a temporal denoiser is built, and the history makes the case stronger.

**The question.**

> **Given the frames before the one it denoises, accumulated through the same reprojection, does a small network
> beat the hand-written filter on scenes it was not trained on?**

The history front-end is SHARED: both methods receive the same accumulated irradiance. The question is what each does
with it.

**Sequences.** Each scene becomes 8 frames (`render/denoiseTemporal.mjs`).
- **The orbit:** the camera orbits the scene's look point on the scene's own ring and height. It steps a per-scene
  angle of 1.5-4 degrees per frame, in a per-scene direction, drawn from a stream of its own, so the scene is
  unchanged.
- **The last frame is the measured one.** Its eye IS the scene's, so its 4-sample input and 1024-sample reference
  are exactly the images rounds 1-3 measured for that seed.
- **The seven history frames** are new 4-sample renders, with render seeds 1e7 + 8 s + f, distinct from every
  8 s + k.

**The front-end, identical for both methods.**
- Each pixel's centre-ray first hit is projected into the previous frame's camera (the exact inverse of
  `pixelRay`).
- Of its four bilinear taps, only those that saw the same object, within 3 pixel footprints of the same point
  (stretched at grazing angles), with normals within cosine 0.9, are kept and renormalised.
- A pixel with no valid tap restarts its history. Sky pixels carry none.
- The accumulation is a running average: n = min(n_prev + 1, 8), A = A_prev + (I - A_prev) / n.

**The methods.**
- **The filter:** section 8's joint bilateral filter, unchanged, applied to the accumulated irradiance. It is tuned
  on the 24 training sequences over the same 108-setting grid.
- **The network:** round 3's kernel network, with the first layer widened to **13 input channels**:
  - [accumulated irradiance, albedo, normal] -- the nine channels every method reads;
  - the measured frame's own noisy irradiance (3);
  - the history length / 8 (1).
- Its 81 weights blend the accumulated irradiance over the 9 x 9 window. 7,905 parameters. Zero-last
  initialisation; training exactly as section 5 (1,500 steps, batch 4, 32 x 32 crops, seeds 1, 2, 3).

**Splits.**
- T1: family A, scene seeds 9000-9011.
- T2: family B, scene seeds 10000-10011.
- Neither range overlaps anything earlier. C5 holds over four rounds' measured frames (124 scenes, 372 seeds).
- Train (1000-1023) and val (2000-2003) are unchanged; their measured frames are the earlier rounds' images.

**Controls.**
- C0-C5 as before. C1 and the metric are measured against the measured frame's own 4-sample input.
- **C6 (new), history:** on the TRAINING images, before any test scene is rendered, the geometric mean of
  relMSE(accumulation) / relMSE(noisy frame) must be at most 0.8. If it fires, the run is "not reported" and stops,
  like C0, without rendering its tests.
- C5 now counts every history frame's render seed.

**The statistic:** sections 6 and 7, unchanged.

**What was seen first: the TRAINING sequences only.** A pilot rendered the 24 training sequences and trained one
temporal network (seed 1). Training fit, geometric mean of relMSE / noisy frame:

| Method | Train fit |
|---|---|
| accumulation alone | 0.188 (C6 holds) |
| the filter on it, tuned | 0.169 |
| the temporal kernel network | 0.134 (C0 holds) |

This confirmed that C0 and C6 can pass and chose nothing else. Training fit has not predicted a test verdict in
this arc.

**Secondary** (reported, never tested, never used to choose):
- the accumulation alone on T1 and T2;
- section 8's filter re-tuned on the training scenes' single frames and applied to the measured frame alone;
- the kernel network trained on the single frames (round 3's setup, the same three seeds), on the same measured
  frames;
- 1- and 16-sample sequences;
- val, per seed, and time.

**The command:** `node tools/denoiseStudy.mjs --harvest-r4` -> `render/denoise-results-r4.json`. It refuses if the
file exists.

**The outcomes, per section 9:**
- **H1 and H2 supported:** the temporal network goes to the device beside the path tracer's page.
- **H1 only:** transfer stays the open subject.
- **Neither:** recorded with the controls' numbers. The arc stops until a new pre-registration changes the input.

## 18. ROUND 4 (TEMPORAL) -- REPORTED: H1 SUPPORTED, H2 NOT SUPPORTED

`node tools/denoiseStudy.mjs --harvest-r4` at commit 17da0750 (its code is ebfb1e2a's, where section 17 was
committed), 2026-10-08 02:21:06Z to 03:04:24Z (2,597 s). Its output, unedited, is `render/denoise-results-r4.json`.

**Every control held.**

| Control | Result |
|---|---|
| C6, history | the accumulation brought the training images to 0.188 x the noisy error (bar 0.8) |
| C0, train fit per seed | 0.134 / 0.127 / 0.125 |
| C1 | network 12 of 12 and filter 12 of 12 against the measured frame's noisy input, on T1 and on T2 |
| C2 | shuffled-target network mean d -1.93 |
| C3 | 0 of 12 images near the floor on either set |
| C4 | bit-identical retrain |
| C5 | 520 render seeds, all distinct: 52 scenes x 10 |

**The hypotheses.**

| | Network wins (of 12) | mean d | one-sided p | Holm threshold | Status |
|---|---|---|---|---|---|
| H1, in-family (T1, seeds 9000-9011) | 12 | +0.193 | 0.00024 | 0.025 | **supported** |
| H2, transfer (T2, seeds 10000-10011) | 5 | -0.076 | 0.806 | 0.05 | **not supported** |

- **In-family, the temporal kernel network beats the filter given the same history on every image.** Geometric
  means: network 0.0024, filter 0.0029. Every seed is at 0.0024.
- **On the family it never saw, it does not.**
  - Geometric means: network 0.0119, filter 0.0110. The filter wins on 7 of 12 images.
  - The two worst images go the filter's way by about 40%.

**Secondary** (reported, never tested, never used to choose). Geometric-mean relMSE on this round's measured frames:

| | T1 | T2 |
|---|---|---|
| the noisy measured frame | 0.0137 | 0.0717 |
| the accumulation alone | 0.0031 | 0.0140 |
| filter, no history (re-tuned on single frames: sS 1, sN 0.3, sA 0.05, sI 1) | 0.0028 | 0.0247 |
| filter on the accumulation (sS 1, sN 0.1, sA 0.05, sI 0.25) | 0.0029 | 0.0110 |
| kernel network, no history (round 3's setup, seeds 1-3) | 0.0022-0.0023 | 0.0228-0.0277 |
| kernel network on the accumulation (this round) | 0.0024 | 0.0114-0.0121 |
| 1-sample sequences: filter / networks | 0.0052 / 0.0044-0.0048 | 0.0404 / 0.0342-0.0363 |
| 16-sample sequences: filter / networks | 0.0024 / 0.0018-0.0019 | 0.0043 / 0.0055-0.0062 |

- val: filter 0.0021, networks 0.0017-0.0018.
- **On family A's measured frames, the history bought neither method anything**: the filter is 0.0028 without it and
  0.0029 with it, the network 0.0022-0.0023 without it and 0.0024 with it.
- **On family B the history roughly halved both methods' error,** and the accumulation alone beat both single-frame
  methods there.
- None of this was tested. It says where to look, not what is true.

**What this buys, per section 17: "H1 only".**
- The pattern of rounds 3 and 4 is the same. A kernel-predicting network beats the hand-written filter on the family
  it was trained on (10 of 12, then 12 of 12) and does not on a family it never saw (5 of 12 both times).
- Transfer stays the open subject.
- The network does not go to the device on this result. Section 9 asks for both hypotheses.

## 19. ROUND 5 -- THE THIRD FAMILY, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered.

**The question.** Rounds 3 and 4 found the same thing twice: a kernel-predicting network beats the filter on the
family it was trained on, and not on one it never saw.

> **Trained on two families, does the network beat the filter on a third that neither it nor the filter was ever
> tuned on?**

**One deliberate change from round 3: the training set's composition.**
- Round 3 trained and tuned on 24 scenes of family A. This round trains and tunes on **12 scenes of A and 12 of B**:
  A 1000-1011 (round 1's first twelve) and B 11000-11011 (new).
- Still 24, so the variety changes and the amount does not.
- Everything else is round 3's (sections 3-11, 13 and 15):
  - single frames; the kernel-predicting network (7,329 parameters); zero-last initialisation;
  - 1,500 steps, batch 4, 32 x 32 crops, seeds 1, 2, 3;
  - the filter and its 108-setting grid;
  - the metric, the statistic, and controls C0-C5.

**Family C** (`makeScene("C", seed)`, its own code path and stream):
- the ground and every even sphere **rough diffuse** (Oren-Nayar; sigma 0.2-0.5 for the ground, 0.3-0.7 for spheres);
- every odd sphere a **glossy dielectric reflector** (roughness 0.03-0.1, ior 1.4-1.7);
- **two emitters** of radius 0.15-0.3, one warm (1 : 0.7 : 0.4) and one cool (0.4 : 0.6 : 1), strength 18-42;
- a near-black uniform sky (0.01-0.05);
- A's and B's camera ring.

Neither material, the coloured lights nor the dark sky occurs in A or B. A gate pins a fingerprint of 80 A and B
scenes, recorded before C existed, to show those two families are unchanged.

**Set on scenes outside every split, before this section:**
- **The emitter strength.** At 6-14, C's mean radiance was 0.07, against A's 0.25 and B's 0.24 (16 scenes each,
  seeds from 950100). Under relMSE's 0.01 offset, a dark family would have been easy rather than unseen. At 18-42
  it is 0.19.
- **The noise and floor.** On four C scenes (from 950010), the 4-sample input's relMSE was 0.004-0.027 and the
  reference floor 0.0001-0.0003, the same order as A's.

**Splits** (`SPLITS_R5`). A split may now name a family per seed.

| Split | Scenes | Seeds |
|---|---|---|
| train | 12 A + 12 B | A 1000-1011, B 11000-11011 |
| val | 2 A + 2 B | A 2000-2001, B 12000-12001 |
| T1 -> **H1** (held-out A and B) | 6 A + 6 B | A 13000-13005, B 14000-14005 |
| T2 -> **H2** (the third family) | 12 C | 15000-15011 |

- Every new seed is on a range no earlier split touched.
- C5 holds over five rounds' scenes.
- C2's shuffled-target network is measured on H1's set, as before.
- Holm is over {H1, H2}.

**What was seen first: the training scenes only.** A pilot rendered the 24 training scenes, tuned the filter and
trained one network (seed 1). Training fit, geometric mean of relMSE / noisy:

| Method | All 24 | A | B |
|---|---|---|---|
| filter (sS 1, sN 1, sA 0.2, sI 4) | 0.203 | 0.185 | 0.222 |
| network, seed 1 | 0.121 | 0.157 | 0.092 |

It confirmed that C0 can pass and chose nothing else. Training fit has not predicted a test verdict in this arc.

**Secondary** (reported, never tested, never used to choose):
- the filter and three networks tuned and trained on **round 3's 24 scenes of A alone**, measured on this round's
  T1 and T2, to show what the mixed training changed;
- 1- and 16-sample inputs;
- val, per seed, and time.

**The command:** `node tools/denoiseStudy.mjs --harvest-r5` -> `render/denoise-results-r5.json`. It refuses if the
file exists.

**The outcomes:**
- **H1 and H2 supported:** with two families behind it, the network transfers to a third. It goes to the device,
  through `brain/conv2d.mjs`'s kernels with the head widened past `COUT_MAX` 32, beside the path tracer's page.
- **H1 only:** variety of this size does not buy transfer; the in-family result stands.
- **H2 only:** recorded as found. The network transfers but does not beat the filter on the mix it trained on.
- **Neither:** recorded with the controls' numbers. The arc stops until a new pre-registration changes the input.

## 20. ROUND 5 -- NOT REPORTED: C1 FIRED ON THE THIRD FAMILY

`node tools/denoiseStudy.mjs --harvest-r5` at commit 8671ea45, 2026-10-08 03:55:38Z to 04:43:04Z (2,846 s). Its
output, unedited, is `render/denoise-results-r5.json`.

**Outcome: "not reported".**
- C1 fired on H2's set (family C). The **filter** beat the noisy input on 6 of 12 images and the network on 10 of 12;
  both need 11.
- C0 (0.121 / 0.118 / 0.122), C2 (mean d -1.75), C4 and C5 held.
- Per section 7, **nothing is claimed about H1 or H2.**
  - verdict() computed both statistics and they are in the file. Neither is a result.
  - T1 and T2 of this round are now spent.

**What failed, diagnosed on family-C scenes OUTSIDE every split** (seeds 950200-950207, not the test set):

| | frames with a visible emitter (3 of 8) | frames without one (5 of 8) |
|---|---|---|
| the A+B-tuned filter (sS 1, sN 1, sA 0.2, sI 4), relMSE | 0.50-0.95 | below the noisy input in all 5 |
| its error in SKY pixels | 99% | 0-5% |
| the noisy input, relMSE | 0.007-0.09 | 0.008-0.04 |
| round 3's A-only setting (sS 1, sN 0.3, sA 0.05, sI 1) | 0.005-0.05, no blow-up | -- |

- **The mechanism.** An emitter and the sky both carry albedo guide 1, so the albedo term cannot separate them. The
  normal term is weak at sN = 1, and the irradiance term is weak at sI = 4. A coloured emitter of strength 18-42 is
  therefore averaged into neighbouring sky pixels of 0.01-0.05. relMSE divides by r^2 + 0.01 there, and the error
  explodes.
- **Why A and B never showed it.** Their skies are bright (0.05-0.8), so the same smear costs little, and the
  tuning on A+B chose the wide setting.
- **This is not a defect upstream of both methods.** It is the hand-written filter's tuned setting failing on a
  configuration it never saw. C1, written as a sanity check, cannot tell that apart from a broken pipeline, so the
  run stops as the rules say.
- The network also fell below the noisy input on 2 of the 12 images.

**Secondary** (reported, never tested). Geometric-mean relMSE:

| | T1 (A+B) | T2 (C) |
|---|---|---|
| noisy | 0.0315 | 0.0148 |
| filter tuned on A+B | 0.0062 | 0.0406 |
| networks trained on A+B, seeds 1-3 | 0.0040-0.0042 | 0.0069-0.0080 |
| filter tuned on A only (round 3's setting) | 0.0071 | 0.0053 |
| networks trained on A only, seeds 1-3 | 0.0054-0.0061 | 0.0054-0.0066 |
| 1-sample input: filter / networks | 0.0134 / 0.0089-0.0093 | 0.0498 / 0.0068-0.0095 |
| 16-sample input: filter / networks | 0.0035 / 0.0025-0.0026 | 0.0368 / 0.0056-0.0078 |

- val: filter 0.0051, networks 0.0037-0.0039.
- On family C, the networks trained on A alone were no worse than those trained on A+B.

**What this buys.** Per section 7, no verdict. The question of section 19 is still open, and so is transfer.

A next round could take either of these, as a new pre-registration with new test scenes, and must say which:
- **Give both methods a guide that separates emitters and sky from surfaces** (an emission mask, or first-hit
  depth). The filter can then refuse to mix them, and so can the network.
- **Keep the inputs and change C1:** it cannot distinguish "the baseline fails on a new family" from "the pipeline
  is broken", and it should.

## 21. ROUND 6 -- THE EMITTER MASK, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered.

**The question is section 19's, unchanged.**

> **Trained on two families, does the network beat the filter on a third that neither was ever trained or tuned on?**

Round 5 could not answer it. The filter, tuned on A+B, averaged family C's coloured emitters into its near-black sky
(section 20).

**One deliberate change from round 5: an emitter mask, given to both methods, with one rule for both.**
- **The mask** (`render/denoiseMask.mjs`, `emitterCoverage`) is the fraction of each pixel an emitter covers, from an
  even 8 x 8 grid of rays across the pixel, so it takes values k / 64.
  - It is a deterministic guide, like albedo and normal, not part of the render.
  - It is appended as a tenth input channel, after the nine every method reads.
- **The rule:** a pixel is never averaged with a neighbour whose mask value differs.
  - The filter applies it to its 9 x 9 window.
  - The kernel-predicting network applies it to its 9 x 9 kernel: the softmax runs over the taps on the pixel's own
    side. The network also reads the mask as an input (its first layer takes 10 channels: 7,473 parameters).
- An all-zero mask changes neither method, bit for bit.
- Everything else is round 5's, including C1 as written:
  - the A+B training split and the family-C generator;
  - the network, its initialisation and training;
  - the filter and its 108-setting grid, tuned on the training scenes WITH the mask;
  - the statistic and the controls C0-C5.

**Why coverage and not a 0/1 centre-ray mask.** Measured on family-C scenes OUTSIDE every split (950200-950207,
the frames section 20 diagnosed on), before this section was written:
- With a 0/1 mask, round 5's setting still failed on all three frames with a visible emitter (0.24, 0.14 and 0.17
  against noisy 0.021, 0.007 and 0.11).
- The error moved to the emitter's **rim**: pixels whose centre ray misses the emitter but whose samples hit it.
  They are bright, carry mask 0 like the sky beside them, and smear into it.
- With coverage, the rim carries its own value, and the same frames came to 0.0072, 0.0063 and 0.057.

**Splits** (`SPLITS_R6`).
- Train and val are round 5's.
- H1: 6 A (16000-16005) + 6 B (17000-17005).
- H2: 12 of family C (18000-18011).
- Every test seed is on a range no earlier split touched. C5 holds over six rounds.

**What was seen first.**
- **The 24 training scenes, with the mask.**
  - The filter's tuning chose sS 1, sN 1, sA 0.2, sI 4 (round 5's setting), with a training fit of 0.203.
  - One network (seed 1) fit 0.125, so C0 can pass.
- **A design check on the eight non-dataset C frames.** With that tuned setting and the coverage mask, the filter
  beat the noisy input on all eight. On one (950204) the margin was thin: 0.0062 against 0.0066.
  - C1 may still fire. If it does, the run stops as the rules say.
  - Nothing was tuned on family C.

**Secondary** (reported, never tested, never used to choose):
- both methods WITHOUT the mask (the filter re-tuned and three networks trained on the same scenes' nine channels),
  on the same test images, to show what the mask changed;
- 1- and 16-sample inputs;
- val, per seed, and time.

**The command:** `node tools/denoiseStudy.mjs --harvest-r6` -> `render/denoise-results-r6.json`. It refuses if the
file exists.

**The outcomes:** section 19's, unchanged.

## 22. ROUND 6 -- REPORTED: H1 SUPPORTED, H2 NOT SUPPORTED

`node tools/denoiseStudy.mjs --harvest-r6` at commit 88666304, 2026-10-08 06:05:46Z to 06:55:18Z (2,972 s). Its
output, unedited, is `render/denoise-results-r6.json`.

**Every control held.**

| Control | Result |
|---|---|
| C0, train fit per seed | 0.125 / 0.121 / 0.129 |
| C1, H1's set | network 12 of 12, filter 11 of 12 against the noisy input |
| C1, family C | network 11 of 12, filter **12 of 12** -- round 5's failure did not recur |
| C2 | shuffled-target network mean d -1.91 |
| C3 | 0 near the floor |
| C4 | bit-identical retrain |
| C5 | distinct render seeds |

**The hypotheses.**

| | Network wins (of 12) | mean d | one-sided p | Holm threshold | Status |
|---|---|---|---|---|---|
| H1, held-out A+B (16000 / 17000) | 11 | +0.443 | 0.0032 | 0.025 | **supported** |
| H2, family C (18000) | 1 | -0.222 | 0.9998 | 0.05 | **not supported** |

- **On the families it trained on, the network beats the filter.** Geometric means: network 0.0040, filter 0.0062
  (on the A half 0.0027 vs 0.0030; on the B half 0.0059 vs 0.0129). Every seed is at 0.0038-0.0041.
- **On the third family, trained on two others, it does not.** Geometric means: network 0.0061, filter 0.0049. The
  filter wins on 11 of 12 images, and all three seeds land at 0.0061.

**Secondary** (reported, never tested). Geometric-mean relMSE:

| | H1's set | family C |
|---|---|---|
| the filter WITHOUT the mask (the same tuned setting) | 0.0062 | 0.0253 |
| the networks WITHOUT the mask | 0.0036-0.0039 | 0.0060-0.0073 |
| 1-sample input: filter / networks | 0.0157 / 0.0087-0.0096 | 0.0104 / 0.0081-0.0083 |
| 16-sample input: filter / networks | 0.0038 / 0.0024-0.0026 | 0.0031 / 0.0050-0.0051 |

- **Without the mask**, the filter blew up on the same kind of image round 5 found: 0.13-1.22 on the six family-C
  frames with a visible emitter.
- **With the mask**, the filter has no blow-up, and on family C it is the better method.
- The mask moved the networks little: on family C, 0.0060-0.0073 without it and 0.0061 with it.

**What this buys, per section 19: "H1 only".** Variety of this size -- two families, 24 scenes -- does not buy
transfer to a third. The in-family result stands for the fourth time (rounds 3, 4 and 6; round 5's was not
reported).

**The arc so far, as its pre-registered verdicts read:**

| Round | Change | In-distribution | A family not trained on |
|---|---|---|---|
| 2 | residual network | not supported (2/12) | not supported (1/12) |
| 3 | kernel-predicting head | **supported** (10/12) | not supported (5/12) |
| 4 | + temporal history | **supported** (12/12) | not supported (5/12) |
| 5 | trained on A+B, tested on C | not reported (C1: the filter) | not reported |
| 6 | + the emitter mask | **supported** (11/12) | not supported (1/12) |

- A small kernel-predicting network beats a tuned hand-written filter on scenes like the ones it was trained on.
- It has not once beaten that filter on a family of scenes it never saw.
- The network does not go to the device on these results. Section 9 asks for both hypotheses.

## 23. ROUND 7 -- THE RANDOMIZED FAMILY, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered.

**The question.**

> **Trained on a broad, randomized distribution of scenes instead of two fixed families, does the network beat the
> filter on a family that distribution never draws?**

Rounds 3, 4 and 6 found that the kernel network wins in-distribution and never on a family it did not see. Round 6
trained on two fixed families. This round asks whether breadth changes that.

**One deliberate change from round 6: the training split.**
- Round 6's 24 scenes of A and B are replaced by **96 scenes of family R**, a randomized generator.
- This round changes the training set's variety AND its amount together, on purpose. The question is whether a broad
  randomized set buys transfer. If it does, a later round can separate the two.
- Everything else is round 6's:
  - single frames, the emitter mask and its rule;
  - the kernel network (10 input channels, 7,473 parameters), zero-last initialisation, training (1,500 steps,
    batch 4, 32 x 32 crops, seeds 1, 2, 3);
  - the filter and its grid, tuned on the training split;
  - the statistic and controls C0-C5.

**Family R** (`makeScene("R", seed)`, its own code path and stream). Every scene draws its own mix:

| | Drawn |
|---|---|
| Ground | Lambertian, albedo 0.2-0.8 per channel |
| Spheres | 2-8 of radius 0.15-0.8, resting, within abs(x), abs(z) <= 2 |
| Sphere materials | Lambertian (albedo 0.05-0.95, two in three) or a microfacet conductor (roughness 0.05-0.8, F0 0.2-1, one in three) |
| Emitters | 1-2 white, radius 0.15-0.5, sharing a power (radius^2 x strength) of 0.4-3 -- A's, B's and C's span -- strength at most 30 |
| Sky | gradient, band or uniform (0.1-0.8), a third each |
| Camera | ring of radius 3.5-5.5, height 0.7-2.5, field of view 40 |

- R's menu covers families A and B.
- **It never draws anything that makes family C what it is:** no rough-diffuse surface, no dielectric, no coloured
  emitter, no sky below 0.02. A gate asserts this over 300 scenes.
- Family C is unchanged: its fingerprint is pinned, recorded before R existed.

**Set on scenes outside every split, before this section.**

| R draft | Mean radiance (A: 0.25) | Noisy relMSE |
|---|---|---|
| 1-3 emitters of strength 3-30, half the spheres metal | 0.96 | up to 10x A's |
| emitters drawn as power, metals one in three, strength capped at 30 (as fixed above) | 0.37 (median 0.32) | median 0.031, between A's ~0.014 and B's ~0.05-0.07 |

- The metals made the noise: the tracer's light sampling skips microfacet surfaces, so a metal lit by a small bright
  emitter is reached only by bounces.
- One scene in twelve still carried fireflies (relMSE 1.09, 90% of it in ten pixel-channels). That is the tracer,
  not a defect, and it stays in R.

**Splits** (`SPLITS_R7`).

| Split | Scenes | Seeds |
|---|---|---|
| train | 96 of R | 20000-20095 |
| val | 4 of R | 21000-21003 |
| T1 -> **H1** | 12 of R | 22000-22011 |
| T2 -> **H2** | 12 of family C | 23000-23011 |

- Every seed is on a range no earlier split touched.
- C5 holds over seven rounds.
- Holm is over {H1, H2}. C2 is measured on H1's set.

**A defect found and fixed while building this round, before any data.**
- The comparison training split (the secondary below) was rendered without the mask. Its 9-channel networks then
  read the 10-channel test images at the wrong stride and returned FINITE errors, so nothing caught it.
- Round 5's comparison ran without a mask and was unaffected.
- `denoise()` now refuses an input whose width is not the network's, and a gate row holds the comparison render to
  the mask.

**What was seen first: the 96 training scenes only.**
- The noisy input's relMSE: median 0.035, 10th-90th percentile 0.010-0.131.
- The filter's tuning chose sS 1, sN 1, sA 0.2, sI 4 (round 6's setting), with a training fit of 0.211.
- One network (seed 1) fit 0.151, so C0 can pass.
- Nothing else was chosen from it. Nothing of family C was rendered for this round.

**Secondary** (reported, never tested, never used to choose):
- the filter and three networks tuned and trained on **round 6's 24 scenes of A and B** (with the mask), measured on
  this round's test images -- the direct comparison of training distributions on the same family-C images;
- 1- and 16-sample inputs;
- val, per seed, and time.

**The command:** `node tools/denoiseStudy.mjs --harvest-r7` -> `render/denoise-results-r7.json`. It refuses if the
file exists.

**The outcomes:**
- **H1 and H2 supported:** breadth buys transfer. The network goes to the device, with the head widened past
  `COUT_MAX` 32.
- **H1 only:** a broad randomized set of this size does not buy transfer to a family outside its support.
- **H2 only:** recorded as found.
- **Neither:** recorded with the controls' numbers.
