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

## 24. ROUND 7 -- THE HARVEST, INTERRUPTED, AND MADE RESUMABLE BEFORE IT RUNS AGAIN

Committed with the code that implements it, before the harvest runs again. No number from round 7's test scenes has
been seen.

**What happened.**
- Section 23's command started at 14:02Z from c1d86ab2, on a box about twice as slow as the one the gate budgets
  are recorded on.
- A background run in this environment is stopped at 2 hours. The harvest needs about 2.1 hours on this box, so it
  was stopped at 7200 s. Its last stage line was "measured" (5608 s), and it was working through the secondaries.
- The results file is written only when the run ends, so **nothing was written**.
- The log prints only stage names and times. The verdict was computed in memory and discarded unseen. No relMSE, no
  sign count, no control's value was printed or read.
- The test scenes were rendered inside that process and never left it. The scenes and render seeds are fixed, and the
  renderer is deterministic, so a second run renders the same images bit for bit. Nothing about them was learned that
  could inform a choice.

**One change, to how the run is executed. The study itself is unchanged.**
- `render/denoiseCache.mjs` keeps every expensive deterministic piece in a directory:
  - each rendered scene;
  - each tuned filter;
  - each trained network.
- Each piece is keyed by everything it depends on:
  - a scene by its family, seed, size, sample counts, whether it carries the second reference, and `--harvest`;
  - a filter by every bit of its training set;
  - a network by every bit of its training set and every training option.
- Control C4's second training of seed 1 is its own record, so a resumed run still compares two trainings.
- The directory is stamped with the round, the commit and the code's diff, and is refused by any other.
- Values are stored exactly: arrays as their own bytes, -0 and non-finite numbers tagged. Anything that could not be
  given back exactly is refused when it is saved.
- **Gated** (`render/denoiseCache-selfcheck.mjs`) on a miniature shaped like this round: family R, the mask, the
  kernel head, the A+B comparison, two secondaries that differ only in their input's samples. Stopped after training
  and resumed, it gives the uninterrupted run's verdict, tables, filter and secondaries **bit for bit**. 12 sabotages;
  11 red, and the twelfth is refused by a second line and red with both removed.

**The command:** `node tools/denoiseStudy.mjs --harvest-r7 --cache <dir>`.
- If a background limit stops it again, the same command is run again, and resumes.
- It still refuses if `render/denoise-results-r7.json` exists.
- The results file adds one field, `cache: { hits, misses }`: how much of the finishing run was read back from an
  earlier, interrupted one.
- Nothing in sections 3-11 or 23 changes: splits, seeds, network, training, filter grid, statistic, controls,
  outcomes.

The results will be section 25.

## 25. ROUND 7 -- NOT REPORTED: C1 FIRED ON THE FILTER, IN-DISTRIBUTION

`node tools/denoiseStudy.mjs --harvest-r7 --cache <dir>` at commit e911f5fb, 2026-10-08 16:37:20Z to 18:32Z
(6,886 s). It ran in one go: cache hits 0, misses 208, so nothing was read back from an earlier run. Its output,
unedited, is `render/denoise-results-r7.json`, committed at c5c1e6fe before any of the diagnosis below.

**Outcome: "not reported".**
- C1 fired on H1's set (family R). The **filter** beat the noisy input on 10 of 12 images, the network on 12 of 12;
  both need 11.
- On H2's set (family C), C1 held: network 11 of 12, filter 12 of 12.
- C0 (0.151 / 0.146 / 0.157), C2 (mean d -0.81), C4 and C5 (372 distinct render seeds) held.
- Per section 7, **nothing is claimed about H1 or H2.**
  - verdict() computed both statistics and they are in the file. Neither is a result.
  - T1 and T2 of this round are now spent.

**What failed.** Three sources were used:
- the two images themselves, read back from the harvest's cache after the results were committed (nothing rendered);
- the training and validation images, also from the cache;
- 48 family-R scenes OUTSIDE every split (980000-980047), rendered for this.

| Family-R images | the filter (sS 1, sN 1, sA 0.2, sI 4) loses to the noisy input |
|---|---|
| training split, 96 | 2 (20030, 20032) |
| val, 4 | 0 |
| T1, 12 | **2 (22003, 22011)** |
| outside every split, 48 | 0 |
| all 160 | 4 |

- **It is rare.** At 4 in 160 per image, a set of 12 draws two or more about one time in thirty. T1 drew two.
- **22011, a near-mirror.** A metal sphere of roughness 0.07 reflects the emitter beside it. The guides carry the
  sphere's F0 and its smooth normal, not what it reflects, so the filter averages the bright reflection into dark
  reflected pixels: true 0.06-0.12, filtered 0.31-0.48. Its metal pixels go from relMSE 0.0034 (noisy) to 0.0164.
  Round 3's narrow setting (sS 1, sN 0.3, sA 0.05, sI 1) gives 0.0092 on this image, below the noisy 0.0173.
- **22003, a dark horizon.** The sky at the horizon is 0.03. The filter brightens a row of sky pixels to 0.13, and
  its sky error goes from 0.0034 to 0.0114 because relMSE divides by r^2 + 0.01. The image has little noise to
  remove (0.014), so a small smear outweighs it, and the narrow setting does not save it either (0.0143).
- **This is round 5's failure in a milder form.** The tuned setting is wide because, averaged over 96 training
  scenes, wide wins. Then on the rare image whose detail none of the guides encode, it smears that detail, and
  relMSE punishes a smear in the dark heavily.
- **It is not a defect upstream of both methods.** The network beat the noisy input on all 12 images. C1, written as
  a sanity check, cannot tell a baseline's rare loss apart from a broken pipeline, so the run stops as the rules say.

**Secondary** (reported, never tested). Geometric-mean relMSE:

| | T1 (R) | T2 (C) |
|---|---|---|
| noisy | 0.0502 | 0.0185 |
| filter tuned on R | 0.0140 | 0.0065 |
| networks trained on R, seeds 1-3 | 0.0070-0.0073 | 0.0070-0.0089 |
| filter tuned on A+B (round 6's 24 scenes) -- it chose the same setting | 0.0140 | 0.0065 |
| networks trained on A+B, seeds 1-3 | 0.0066-0.0068 | 0.0089-0.0091 |
| 1-sample input: filter / networks | 0.0266 / 0.0171-0.0194 | 0.0121 / 0.0108-0.0132 |
| 16-sample input: filter / networks | 0.0058 / 0.0037-0.0041 | 0.0037 / 0.0045-0.0062 |
| the reference floor | 0.0005 | 0.0002 |

- val: noisy 0.0325, filter 0.0071, networks 0.0058-0.0063.
- Tuned on 96 scenes of R or on 24 of A and B, the filter chose the same setting.
- On family R, the networks trained on A+B came out no worse than those trained on R itself.

**What this buys.** Per section 7, no verdict. Section 23's question is still open.

**C1 has now stopped two rounds, both on the filter, not the pipeline.** Round 5 stopped on a family the filter
never saw. This round stopped in-distribution, on two rare images. Section 20 already said C1 should tell those
apart. A next round must say which of these it takes, as a new pre-registration with new test scenes:
- **Decide C1 before the tests, as C0 is.** Check on the TRAINING images that both methods beat the noisy input,
  and stop there if they do not. A sanity control then never spends a test set, and a baseline's rare loss on a
  test image counts as what it is: an image where the network beat the filter, or did not.
- **Keep C1 as written and run section 23 again on new test scenes.** At the rate measured above, it would stop a
  run again about one time in thirty on R's set alone.

**The arc so far, as its pre-registered verdicts read:**

| Round | Change | In-distribution | A family not trained on |
|---|---|---|---|
| 2 | residual network | not supported (2/12) | not supported (1/12) |
| 3 | kernel-predicting head | **supported** (10/12) | not supported (5/12) |
| 4 | + temporal history | **supported** (12/12) | not supported (5/12) |
| 5 | trained on A+B, tested on C | not reported (C1: the filter) | not reported |
| 6 | + the emitter mask | **supported** (11/12) | not supported (1/12) |
| 7 | trained on 96 randomized scenes (R) | not reported (C1: the filter) | not reported |

## 26. ROUND 8 -- C1 ON THE TRAINING IMAGES, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered.

**The question is section 23's, unchanged.**

> **Trained on a broad, randomized distribution of scenes instead of two fixed families, does the network beat the
> filter on a family that distribution never draws?**

**One deliberate change from round 7: where control C1 is decided.** Keith chose it from the two options section
25 named.
- **As written (section 7):** both methods must beat the noisy input on at least 11 of 12 images of EACH TEST SET.
  Twice it stopped a round, and both times because of the filter, not the pipeline (sections 20 and 25).
- **Now:** C1 is decided on the **training images**, right after C0 and before any test scene is rendered.
  - The filter, as tuned, and the network, as its per-image mean over seeds 1-3 (as on a test set), must each beat
    the noisy input on at least 11 in 12 of the 96 training images: **88**.
  - A tie is not a win.
  - If either falls short, the run is "not reported" and STOPS. Its test scenes are never rendered.
- **On the test sets, C1 is no longer applied.**
  - Each set's count of images where each method beats the noisy input is reported beside the hypotheses, never
    tested.
  - An image where the filter loses to the noisy input enters the sign test like any other image. It is simply an
    image the network won, or did not.
- **Why it is still a sanity check.** C1 exists to catch a broken pipeline that both methods share (section 7). A
  broken pipeline breaks the training images as surely as the test images, and there are 96 of those, not 12. What
  it no longer does is mistake a baseline's loss on a rare or unseen image for a broken pipeline.
- **What it gives up.** A failure that affects only the test images is no longer caught by C1. Against that:
  - the test and training images are built by the same call (`renderSplit`), which is gated;
  - C3 still bounds each test set by its reference floor.
- **In code:** `trainSanity()` and `C1_OF` in `render/denoiseStats.mjs`, and `verdict({ c1Train })`;
  `c1OnTraining` and the stop in `render/denoiseStudy.mjs`; `ROUND8`.
  - Gated with planted outcomes, including round 7's case: the filter under the noisy input on 2 of 12 test images is
    now REPORTED.
  - A miniature whose untrained network ties the noisy input everywhere stops before the real test seeds, which sit
    behind it with harvest off.
  - 12 sabotages, all red.

**Everything else is round 7's:**
- the training split (the same 96 scenes of R, 20000-20095) and val (21000-21003);
- the kernel network and its training (seeds 1, 2, 3), and the filter and its grid;
- the emitter mask and its rule;
- the statistic, C0 and C2-C5, Holm over {H1, H2}, and C2 on H1's set;
- the secondaries: the A+B comparison, 1- and 16-sample inputs, val.

**New test splits** (`SPLITS_R8`):

| Split | Scenes | Seeds |
|---|---|---|
| train, val | round 7's | 20000-20095, 21000-21003 |
| T1 -> **H1** | 12 of R | **24000-24011** |
| T2 -> **H2** | 12 of family C | **25000-25011** |

- No earlier split touched either test range.
- C5 holds over eight rounds: 1,002 render seeds.

**What was seen first. All of it is disclosed because none of it can be un-seen.**
- **Everything about the training split.** Round 7 trained on it, and section 25 diagnosed on it.
  - The code that makes the pieces before the tests (scenes, filter, networks) is unchanged since round 7 and seeded.
    This round's filter and networks will therefore be bit for bit round 7's.
  - Measured from round 7's cache before this was written: on the 96 training images the filter beats the noisy
    input on 94, and the network on 96. **The new C1 will hold.** That is deliberate: C1 is a sanity check, and its
    job is to fail only when something is broken.
- **Round 7's test statistics.** Its results file holds both, and they were read while diagnosing section 25:
  network wins 12 of 12 on H1 and 3 of 12 on H2. They are not results. This round's verdict is on new test scenes
  only.
- Nothing of either new test set has been rendered.

**The command:** `node tools/denoiseStudy.mjs --harvest-r8 --cache <dir>` -> `render/denoise-results-r8.json`.
- It refuses if the file exists.
- If a background limit stops it, the same command resumes it (section 24).

**The outcomes are section 23's:**
- **H1 and H2 supported:** breadth buys transfer. The network goes to the device, with the head widened past
  `COUT_MAX` 32.
- **H1 only:** a broad randomized set of this size does not buy transfer to a family outside its support.
- **H2 only:** recorded as found.
- **Neither:** recorded with the controls' numbers.
- **Not reported:** C0 or C1 fired on the training images, or C4 or C5 fired.

## 27. ROUND 8 -- REPORTED: H1 NOT SUPPORTED, H2 NOT SUPPORTED

`node tools/denoiseStudy.mjs --harvest-r8 --cache <dir>` at commit c1558028, 2026-10-08 19:04:46Z to 21:02:52Z
(7,086 s), in one run: cache hits 0, misses 208. Its output, unedited, is `render/denoise-results-r8.json`,
committed at 4f60e109 before anything below was read.

**Every control held.**

| Control | Result |
|---|---|
| C0 | 0.151 / 0.146 / 0.157 (needs <= 0.8 per seed) |
| **C1, on the training images** | network 96, filter 94 of 96 (needs 88), decided before any test scene existed |
| C2 | shuffled-target network: mean d -1.42 (needs <= 0) |
| C3 | no test image within 2x of its reference floor |
| C4, C5 | held; 372 distinct render seeds |

Reported, never tested: on the test sets, the network beat the noisy input on 12 and 11 images (H1, H2), the filter
on 12 and 12. Test-time C1 as section 7 wrote it would also have held this time.

**The hypotheses.**

| | Network wins (of 12) | mean d | one-sided p | Holm threshold | Status |
|---|---|---|---|---|---|
| H1, held-out R (24000) | 7 | +0.173 | 0.387 | 0.025 | **not supported** |
| H2, family C (25000) | 2 | -0.217 | 0.997 | 0.05 | **not supported** |

- **On held-out R the network is better on average, but not image by image.**
  - Geometric means: network 0.0062 (seeds 0.0059-0.0064), filter 0.0074, about 16% lower.
  - Its three large wins (d 0.58-0.74) are on the three noisiest images (noisy relMSE 0.075-0.141).
  - On the other nine, the two methods are close to even: |d| <= 0.25, and the network wins 4 of 9.
  - The sign test counts images, as section 6 fixed it, so 7 of 12 is not supported.
- **On family C the filter is better.** Geometric means: network 0.0040 (seeds 0.0037-0.0044), filter 0.0032. The
  filter wins 10 of 12 images.

**Secondary** (reported, never tested). Geometric-mean relMSE:

| | H1's set (R) | family C |
|---|---|---|
| noisy | 0.0357 | 0.0069 |
| filter tuned on R | 0.0074 | 0.0032 |
| networks trained on R, seeds 1-3 | 0.0059-0.0064 | 0.0037-0.0044 |
| filter tuned on A+B (round 6's 24 scenes) -- it chose the same setting | 0.0074 | 0.0032 |
| networks trained on A+B, seeds 1-3 | 0.0059-0.0063 | 0.0042-0.0044 |
| 1-sample input: filter / networks | 0.0174 / 0.0119-0.0138 | 0.0063 / 0.0055-0.0062 |
| 16-sample input: filter / networks | 0.0035 / 0.0038-0.0044 | 0.0021 / 0.0027-0.0034 |
| the reference floor | 0.0004 | 0.0001 |

- val: noisy 0.0325, filter 0.0071, networks 0.0058-0.0063.
- **96 scenes of R bought nothing over 24 of A and B, even on R.** Networks trained on A+B do as well on the R test
  images (0.0059-0.0063) as networks trained on R itself (0.0059-0.0064). The filter tuned on either chose the same
  setting.
- At 16 samples the filter is ahead on both sets. On family C, at 16 samples, both methods are worse than their
  input (noisy 0.0019): they were tuned and trained on 4-sample inputs.

**What this buys, per section 23: "Neither."**
- A broad randomized training set of this size does not make this network beat the filter on a family outside its
  support.
- On its own distribution, the network's advantage is confined to the noisiest images and does not reach a
  per-image majority.
- Round 7's test statistics (H1 12 of 12, section 26), from a different 12 images, were not a result. This round's
  are, and they say 7.

**The arc so far, as its pre-registered verdicts read:**

| Round | Change | In-distribution | A family not trained on |
|---|---|---|---|
| 2 | residual network | not supported (2/12) | not supported (1/12) |
| 3 | kernel-predicting head | **supported** (10/12) | not supported (5/12) |
| 4 | + temporal history | **supported** (12/12) | not supported (5/12) |
| 5 | trained on A+B, tested on C | not reported (C1: the filter) | not reported |
| 6 | + the emitter mask | **supported** (11/12) | not supported (1/12) |
| 7 | trained on 96 randomized scenes (R) | not reported (C1: the filter) | not reported |
| 8 | round 7, C1 on the training images | not supported (7/12) | not supported (2/12) |

- A 7,473-parameter kernel-predicting network beats the tuned filter image by image on narrow families it was
  trained on (A and B).
- On a broad family it is better on average but not image by image.
- It has not once beaten the filter on a family it never saw, trained narrow or broad.
- The network does not go to the device on these results. Section 9 asks for both hypotheses.

## 28. ROUND 9 -- THE LARGER NETWORK, TRAINED LONGER, TESTED BY SIZE -- FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered.

**The question is section 23's, unchanged.**

> **Trained on a broad, randomized distribution of scenes instead of two fixed families, does the network beat the
> filter on a family that distribution never draws?**

**Two deliberate changes from round 8, both asked for by Keith after section 27.** One is the method, one is the
analysis. The secondaries below separate them.

1. **A larger network, trained longer.**
   - **The network:** four 3 x 3 layers of 32 (ReLU), then the same 1 x 1 head to 81 logits and the same softmax kernel
     over the 9 x 9 window, with the mask's same-side rule.
     - Four 3 x 3 layers give a receptive field of exactly 9 x 9: the network sees the whole window whose weights it
       predicts. Round 8's three layers of 16 saw 7 x 7.
     - 33,329 parameters, against 7,473.
     - Its hidden width is the device kernel's `COUT_MAX`. The head's 81 still exceeds it.
     - In code: `SHAPE_KERNEL_LARGE`, `size: "large"`.
   - **The training:** 4,500 steps (`TRAIN_LONG`), three times round 8's 1,500.
     - Everything else is unchanged: batch 4, 32 x 32 crops, Adam (lr 1e-3), zero-last initialisation, seeds 1, 2, 3.
     - Zero-last makes the untrained large network exactly the small one: the 9 x 9 box mean, bit for bit.
     - A run's first 1,500 steps are round 8's schedule exactly. The stream draws the same crops, and Adam has no
       schedule.
     - 4,500 rather than more: on this box one large training of 4,500 steps takes about 1.3 hours, and four of them,
       side by side, must finish inside one background run (2 hours) to be kept (section 24).
   - Control C2's shuffled-target networks and C4's second training are the large network, trained the same way.
2. **The hypotheses are tested by how much each image is won or lost, not only by which way.**
   - The test is the exact one-sided sign-flip test of the mean of d (`signFlipUpper`):
     - d_i = ln relMSE(filter_i) - ln relMSE(network_i), as before;
     - p is the fraction of all 2^12 sign assignments s whose sum of s_i |d_i| reaches the observed sum of d_i;
     - sums that tie in exact arithmetic are not split by rounding.
   - Holm over {H1, H2} at 0.05 as before. A hypothesis is supported when Holm rejects and the mean of d is positive.
   - When every effect is the same size, it is the sign test exactly. A gate holds that bit for bit for every count.
   - A single large win cannot carry it alone. With one effect of +5 and eleven of -0.1, p = 0.5.
   - In code: `verdict({ test: "signflip" })`. Each hypothesis reports `pSign` beside the tested `p`.
   - **Chosen after round 8**, whose count of 7 of 12 missed an average advantage carried by its three noisiest
     images. So, applied to every reported round's results file before this was written:

| Round | | Network wins | sign test p | sign-flip p | Verdict either way |
|---|---|---|---|---|---|
| 2 | H1 / H2 | 2 / 1 of 12 | 0.9968 / 0.9998 | 0.9890 / 0.9998 | not supported / not supported |
| 3 | H1 / H2 | 10 / 5 | 0.0193 / 0.8062 | 0.0022 / 0.8250 | **supported** / not supported |
| 4 | H1 / H2 | 12 / 5 | 0.0002 / 0.8062 | 0.0002 / 0.8149 | **supported** / not supported |
| 6 | H1 / H2 | 11 / 1 | 0.0032 / 0.9998 | 0.0010 / 0.9941 | **supported** / not supported |
| 8 | H1 / H2 | 7 / 2 | 0.3872 / 0.9968 | 0.0522 / 0.9724 | not supported / not supported |

   - **It changes no earlier verdict.** Round 8's H1 comes closest: 0.052, against the 0.025 it would have needed.

**Everything else is round 8's:**
- the training split (the same 96 scenes of R) and val;
- the filter and its grid;
- the emitter mask and its rule;
- C0, C1 on the training images (88 of 96), C2-C5, and the stop before the tests.

**New test splits** (`SPLITS_R9`):

| Split | Scenes | Seeds |
|---|---|---|
| train, val | round 7's | 20000-20095, 21000-21003 |
| T1 -> **H1** | 12 of R | **26000-26011** |
| T2 -> **H2** | 12 of family C | **27000-27011** |

- No earlier split touched either test range.
- C5 holds over nine rounds.

**Secondary** (reported, never tested):
- **Round 8's small network,** trained exactly as round 8 trained it (1,500 steps), on the same test images. Each
  hypothesis's statistics for it are reported under both tests. This separates the network from the test.
- **The sign test,** beside every sign-flip p.
- 1- and 16-sample inputs, val, and time.
- Round 7-8's A+B comparison is dropped. It answered its question in sections 25 and 27.

**Executed in parallel, bit for bit.**
- Seven large trainings at about 1.3 hours each would not fit one after another.
- `render/denoisePool.mjs` trains up to four at once in worker threads. Every training is independent and seeded, and
  a worker runs the same `trainDenoiser` on an exact copy of the same images.
- Gated: the networks come back bit for bit the serial ones, in job order. A whole miniature study shaped like this
  round gives the same result with workers as without, even when the workers train only what a half-filled cache
  lacked.
- The results record the worker count beside the cache's counts.

**What was seen first.**
- Everything about the training split (rounds 7 and 8), and rounds 2-8's test statistics (above).
- **The pilot,** run before this was written on the 96 training images only, read from round 8's cache (nothing
  rendered). Each network was trained once, seed 1, with its training fit (C0's ratio) and C1's count every 1,500 steps:

| Steps | small network (7,473): training fit / beats noisy | large network (33,329): training fit / beats noisy |
|---|---|---|
| 1,500 | 0.1513 / 95 of 96 (round 8's seed 1, reproduced exactly) | 0.1286 / 96 of 96 |
| 3,000 | 0.1280 / 96 | 0.1158 / 96 |
| 4,500 | 0.1184 / 96 | -- (the harvest's own seed-1 training) |
| 6,000 | 0.1129 / 96 | -- |

- **Both changes help on the training images.** At 1,500 steps the large network fits 15% better than the small one,
  and longer training keeps helping both, by less each time.
- **C0 (<= 0.8) and C1 (88 of 96) hold** on seed 1 at every checkpoint.
- The large pilot was stopped at 3,000 steps, at 3,108 s. The harvest's seed-1 training repeats it bit for bit and
  goes on to 4,500. Its pace there, about 1 s a step beside the small pilot, is where the 1.3-hour figure above comes
  from.

- Nothing of either new test set has been rendered.

**The command:** `node tools/denoiseStudy.mjs --harvest-r9 --cache <dir> --workers 4` ->
`render/denoise-results-r9.json`.
- It refuses if the file exists.
- About 3.4 hours on this box, so expect one resume (section 24).

**The outcomes are section 23's:**
- **H1 and H2 supported:** breadth buys transfer. The network goes to the device, with the head widened past
  `COUT_MAX` 32.
- **H1 only:** a broad randomized set of this size does not buy transfer to a family outside its support, even for
  the larger network.
- **H2 only:** recorded as found.
- **Neither:** recorded with the controls' numbers.
- **Not reported:** C0 or C1 fired on the training images, or C4 or C5 fired.

## 29. ROUND 9 -- REPORTED: H1 SUPPORTED, H2 NOT SUPPORTED

`node tools/denoiseStudy.mjs --harvest-r9 --cache <dir> --workers 4` at commit 9fa022ec, run three times (section 24):
- **23:32Z (2026-10-08):** stopped at the 2-hour background limit, in the shuffled-target batch. By then it had kept
  the training renders, the filter, the four primary networks (5,655 s for the batch) and the test renders.
- **05:28Z:** resumed from the cache, which read everything back in 118 s. Lost to a container restart in the same
  batch.
- **06:01Z to 06:47:47Z:** resumed again and finished. Cache hits 129, misses 54.

Nothing was written or read before the last run ended. Its output, unedited, is `render/denoise-results-r9.json`,
committed at 809c478d before anything below was read.

**Every control held.**

| Control | Result |
|---|---|
| C0 | 0.0997 / 0.0966 / 0.1040 (needs <= 0.8) |
| C1, on the training images | network 96, filter 94 of 96 (needs 88) |
| C2 | shuffled-target network: mean d -1.91 (needs <= 0) |
| C3 | no test image within 2x of its reference floor |
| C4, C5 | held; 372 distinct render seeds |

Reported, never tested: on the test sets, both methods beat the noisy input on 12 of 12 images, on both sets.

**The hypotheses, by the sign-flip test (section 28):**

| | Network wins (of 12) | mean d | sign-flip p | (sign test p) | Holm threshold | Status |
|---|---|---|---|---|---|---|
| H1, held-out R (26000) | 11 | +0.739 | 0.0007 | (0.0032) | 0.025 | **supported** |
| H2, family C (27000) | 2 | -0.247 | 0.996 | (0.997) | 0.05 | **not supported** |

- **On held-out R the large network beats the filter, image by image and by a wide margin.** Geometric means:
  network 0.0055 (seeds 0.0055-0.0056), filter 0.0116, about 52% lower. Its one loss (d -0.16) is the
  second-least-noisy image.
- **On family C the filter is better.** Geometric means: network 0.0042 (seeds 0.0040-0.0044), filter 0.0033. The
  filter wins 10 of 12 images.
- **Both tests agree on both hypotheses.** The sign test alone would have given the same verdicts.

**Secondary** (reported, never tested). Geometric-mean relMSE:

| | H1's set (R) | family C |
|---|---|---|
| noisy | 0.0641 | 0.0090 |
| filter | 0.0116 | 0.0033 |
| **large network** (primary), seeds 1-3 | 0.0055-0.0056 | 0.0040-0.0044 |
| **small network** (round 8's, trained as round 8 trained it), seeds 1-3 | 0.0075-0.0080 | 0.0040-0.0054 |
| small network's statistics against the filter | 11 of 12; sign-flip p 0.012, sign p 0.0032 | 2 of 12; p 0.997 |
| 1-sample input: filter / large networks | 0.0344 / 0.0150-0.0159 | 0.0071 / 0.0055-0.0060 |
| 16-sample input: filter / large networks | 0.0043 / 0.0024-0.0026 | 0.0026 / 0.0037-0.0042 |
| the reference floor | 0.0005 | 0.0001 |

- val: noisy 0.0325, filter 0.0071, large networks 0.0038-0.0039.
- **What the larger network bought, on the same images:**
  - On R, its error is 28% below the small network's (0.0055 against 0.0077), and it is lower on all 12 images.
    Against the filter it is 52% below; the small network is 34% below.
  - On family C, 8% below the small network's, and still 1.28 x the filter's (the small network: 1.39 x).
- **What it did not buy: the verdict.** On these 12 test images of R the small network ALSO wins 11 of 12, and is
  supported by either test.
  - Round 8's 7 of 12 and this round's 11 of 12 are different sets of scenes. This set is about twice as noisy
    (noisy relMSE 0.064 against 0.036). Section 27 found the network's advantage concentrated on the noisiest
    images.
  - So neither deliberate change can be credited with H1 being supported in this round rather than in round 8.
- At 16 samples the large network is ahead of the filter on R (0.0025 against 0.0043), where round 8's small network
  was behind. On family C at 16 samples the large networks are worse than their own input (0.0037-0.0042 against
  0.0032); the filter is not (0.0026).

**What this buys, per section 23: "H1 only".**
- A broad randomized training set of this size does not make the network beat the filter on a family outside its
  support, at four times the size and three times the training.
- On its own distribution, the larger network beats the filter clearly, and beats the small network on every image.

**The arc so far, as its pre-registered verdicts read:**

| Round | Change | In-distribution | A family not trained on |
|---|---|---|---|
| 2 | residual network | not supported (2/12) | not supported (1/12) |
| 3 | kernel-predicting head | **supported** (10/12) | not supported (5/12) |
| 4 | + temporal history | **supported** (12/12) | not supported (5/12) |
| 5 | trained on A+B, tested on C | not reported (C1: the filter) | not reported |
| 6 | + the emitter mask | **supported** (11/12) | not supported (1/12) |
| 7 | trained on 96 randomized scenes (R) | not reported (C1: the filter) | not reported |
| 8 | round 7, C1 on the training images | not supported (7/12) | not supported (2/12) |
| 9 | 4x network, 3x training, sign-flip test | **supported** (11/12, p 0.0007) | not supported (2/12) |

- A kernel-predicting network beats the tuned filter on families it was trained on: narrow ones (rounds 3, 4, 6),
  and a broad one (round 9). Round 8's 7 of 12 on the broad family was one draw of twelve scenes, and round 9's
  secondary shows the same small network winning 11 of 12 on another.
- **In nine rounds it has never beaten the filter on a family it never saw.** That held trained narrow or broad, small
  or large, with or without history and the mask, by count or by size. On family C the filter has won 10 or more
  of 12 images in each of rounds 6, 8 and 9.
- The network does not go to the device on these results. Section 9 asks for both hypotheses.

## 30. ROUND 10 -- TRAINED ON FAMILY C, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered.

**The question changes, as Keith asked after section 29.**

> **Trained on the family it has never beaten the filter on, does the network beat the filter there? And does what it
> learns there carry to the randomized family R?**

Nine rounds found the network winning on what it was trained on and never on family C, which it was never trained on.
This round asks which of those it was: C unseen, or C hard.

**One deliberate change from round 9: the training split is 96 scenes of family C.**
- Everything else is round 9's:
  - the large network (33,329 parameters), 4,500 steps, seeds 1, 2, 3;
  - the filter and its grid, tuned on the training split, so now on C;
  - the emitter mask and its rule;
  - the sign-flip test, Holm over {H1, H2};
  - C0, C1 on the training images (88 of 96), C2-C5, and the stop before the tests.
- H1 is now in-distribution on C. H2 is the family not trained on, now R.
- C2's shuffled-target networks are trained on the C training split and measured on H1's set, as always.

**Splits** (`SPLITS_R10`):

| Split | Scenes | Seeds |
|---|---|---|
| train | 96 of family C | 30000-30095 |
| val | 4 of C | 31000-31003 |
| T1 -> **H1** | 12 of C | **32000-32011** |
| T2 -> **H2** | 12 of R | **33000-33011** |

- Every seed is on a range no earlier split touched.
- C5 holds over ten rounds: 1,446 render seeds.

**Secondary** (reported, never tested):
- **The other training, side by side:** the filter tuned, and the large network trained exactly as round 9 trained
  them, on round 9's 96 scenes of R (`compareTrainSplit`). Measured on the same test images, with their statistics
  against this round's filter under both tests. On C this is the network that lost to the filter in rounds 8 and 9,
  trained identically, against the one trained on C, image by image.
- The sign test beside every sign-flip p.
- 1- and 16-sample inputs, val, and time.

**What was seen first.**
- Everything in sections 1-29, including family C's test images in rounds 5-9 and every statistic on them.
- **The pilot,** on the 96 TRAINING scenes of C only, rendered for it before this was written:

| | on the 96 training scenes of C |
|---|---|
| noisy input, relMSE | median 0.0127, 10th-90th percentile 0.0031-0.0523 (R's training scenes: median 0.035) |
| the filter tuned on them | sS 1, sN 1, sA 0.2, **sI 1** (R's tuning chose sI 4); training fit 0.382; beats the noisy input on 96 of 96 |
| R's filter setting on them | training fit 0.409; beats the noisy input on 95 of 96 |
| the large network, seed 1, 1,500 steps | training fit 0.231; beats the noisy input on 96 of 96 |
| the large network, seed 1, 3,000 steps | training fit 0.205; beats the noisy input on 96 of 96 |

- **C0 and C1 will hold.** The network's fit is well under 0.8, and both methods clear 88 of 96.
- **C's images are less noisy than R's,** so there is less to remove. The filter's training fit is 0.38 here, against
  0.21 on R's training scenes.
- **On its training images the network already fits C far better than the filter does** (0.21 against 0.38). Rounds
  8 and 9 found a gap like that on the training set that did not hold on the test set, so this predicts nothing
  about H1.
- The 96 scenes took 1,518 s to render: about 16 s each, against R's 11.
- The large pilot ran 3,000 of the 4,500 steps. The harvest's seed-1 training repeats it bit for bit and goes on.

- Nothing of either new test set has been rendered.

**Executed with checkpoints inside each training.**
- This box trains at about 1.4 s a step, so one batch of four large trainings can take longer than a background run.
- Until now a network reached the cache only when its training finished.
- Now each training also keeps its whole state in the cache every 250 steps: weights, Adam's moments and step, the
  random stream's position, and the losses so far. A stopped run resumes each network where it was.
- Gated:
  - a training stopped and resumed IS the unbroken one, every weight and loss bit for bit;
  - a checkpoint one ulp off changes the result, so it is read;
  - a whole miniature study, with three trainings resumed part-way inside workers, gives the uninterrupted run's
    tables bit for bit.
- It changes no measured value.

**The command:** `node tools/denoiseStudy.mjs --harvest-r10 --cache <dir> --workers 4` ->
`render/denoise-results-r10.json`.
- It refuses if the file exists.
- About 5-7 hours at this box's pace, so expect several resumes (section 24).

**The outcomes:**
- **H1 and H2 supported:** trained on C, the network beats the filter on C, and what it learned carries to R. The
  network goes to the device, with the head widened past `COUT_MAX` 32.
- **H1 only:** C was unseen, not hard. The network wins wherever it has been trained, and transfers in neither
  direction.
- **H2 only:** recorded as found.
- **Neither:** family C is hard for this network even when trained on it. The filter's advantage on C does not
  come from the network never having seen C.
- **Not reported:** C0 or C1 fired on the training images, or C4 or C5 fired.

## 31. ROUND 10 -- REPORTED: H1 SUPPORTED, H2 NOT SUPPORTED

`node tools/denoiseStudy.mjs --harvest-r10 --cache <dir> --workers 4` at commit 0eb3451c, in two runs:
- **09:09Z:** stopped at the 2-hour background limit. It had kept the training renders and the filter, and had
  checkpointed the four primary trainings at steps 3,750-4,000 of 4,500.
- **12:09Z to 14:07:38Z, on another host:** the trainings resumed from their checkpoints (456 s to finish) and the
  run finished. Cache hits 101, misses 179.

Nothing was written or read before the second run ended. Its output, unedited, is `render/denoise-results-r10.json`,
committed at acb2b60b before anything below was read.

**Every control held.**

| Control | Result |
|---|---|
| C0 | 0.189 / 0.180 / 0.213 (needs <= 0.8) |
| C1, on the training images | network 96, filter 96 of 96 (needs 88) |
| C2 | shuffled-target network: mean d -2.16 (needs <= 0) |
| C3 | no test image within 2x of its reference floor |
| C4, C5 | held; 372 distinct render seeds |

Reported, never tested: on the test sets, both methods beat the noisy input on 12 of 12 images, on both sets.

**The hypotheses, by the sign-flip test:**

| | Network wins (of 12) | mean d | sign-flip p | (sign test p) | Holm threshold | Status |
|---|---|---|---|---|---|---|
| H1, held-out C (32000) | **12** | +0.551 | 0.0002 | (0.0002) | 0.025 | **supported** |
| H2, family R (33000), not trained on | 6 | +0.367 | 0.109 | (0.613) | 0.05 | **not supported** |

- **Trained on C, the network beats the filter on C on every image.**
  - Geometric means: network 0.0021 (seeds 0.0019-0.0022), filter tuned on C 0.0036, about 42% lower.
  - The smallest win is d +0.34.
- **On R, which it was not trained on, it does not.**
  - It wins 6 of 12. Its positive mean comes from R's four noisiest images (d +0.61 to +2.50).
  - It is also measured against a filter tuned on C, whose narrow setting (sI 1) suits R badly: 0.0109 on R, where
    the filter tuned on R gives 0.0068.
  - Against R's own filter (a secondary), the C-trained network is worse: 1.10 x its error, winning 4 of 12.

**Secondary: the other training, on the same images** (reported, never tested). Geometric-mean relMSE:

| | H1's set (C) | H2's set (R) |
|---|---|---|
| noisy | 0.0113 | 0.0360 |
| filter tuned on C (the primary) | 0.0036 | 0.0109 |
| filter tuned on R (round 9's) | 0.0036 | 0.0068 |
| **network trained on C** (the primary), seeds 1-3 | **0.0019-0.0022** | 0.0064-0.0083 |
| **network trained on R** (round 9's, retrained identically), seeds 1-3 | 0.0033-0.0036 | **0.0034** |
| R-trained network against the primary filter | 6 of 12; sign-flip p 0.34 | 12 of 12; p 0.0002 |
| 1-sample input: filter / C-trained networks | 0.0133 / 0.0039-0.0054 | 0.0339 / 0.0211-0.0237 |
| 16-sample input: filter / C-trained networks | 0.0021 / 0.0011 | 0.0039 / 0.0028-0.0029 |
| the reference floor | 0.0001 | 0.0003 |

- val (C): noisy 0.0132, filter 0.0045, networks 0.0034-0.0039.
- **Image by image, the training family decides it.**
  - On C, the C-trained network beats the R-trained one on all 12 images (error 40% lower).
  - On R, the R-trained network beats the C-trained one on all 12 (the C-trained one's error is 2.2 x).
- On C the R-trained network is level with the filter here (0.0034 against 0.0036, 6 of 12). In rounds 8 and 9 it was
  behind (2 of 12 each), against the filter tuned on R and on other scenes of C.
- Tuned on C or on R, the filter is the same on C (0.0036). Tuned on C, it is worse on R. The filter transfers better
  than the network, but it does not transfer for free.
- At 16 samples the C-trained network is ahead of the filter on both test sets (C: 0.0011 against 0.0021; R: 0.0028
  against 0.0039).

**What this buys, per section 30: "H1 only".**
- **Family C was unseen, not hard.** Trained on it, the network beats the filter there on every image, by a margin
  like R's.
- **It transfers in neither direction.** Trained on R it did not beat the filter on C (rounds 7-9). Trained on C it
  does not beat the filter on R, and against R's own filter it loses.

**The arc so far, as its pre-registered verdicts read:**

| Round | Change | Trained on | In-distribution | A family not trained on |
|---|---|---|---|---|
| 2 | residual network | A | not supported (2/12) | not supported (1/12) |
| 3 | kernel-predicting head | A | **supported** (10/12) | not supported (5/12) |
| 4 | + temporal history | A | **supported** (12/12) | not supported (5/12) |
| 5 | A+B, tested on C | A+B | not reported (C1: the filter) | not reported |
| 6 | + the emitter mask | A+B | **supported** (11/12) | not supported (1/12) |
| 7 | randomized family R | R | not reported (C1: the filter) | not reported |
| 8 | C1 on the training images | R | not supported (7/12) | not supported (2/12) |
| 9 | 4x network, 3x training, sign-flip test | R | **supported** (11/12) | not supported (2/12) |
| 10 | trained on family C | C | **supported** (12/12) | not supported (6/12) |

- **A kernel-predicting network beats a tuned hand-written filter on the family it was trained on.** That held for
  A, A+B, R and now C: in five of the eight rounds since the kernel head (3-10). Two of the other three were not
  reported, and the third (round 8, 7 of 12 on R) was one draw of scenes (section 29).
- **In ten rounds it has never beaten the filter on a family it was not trained on, in either direction.**
- The network does not go to the device on these results. Section 9 asks for both hypotheses.

## 32. ROUND 11 -- THE DEPLOYMENT ROUND: ONE NETWORK FOR BOTH FAMILIES, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered.

**The question changes, as Keith asked after section 31.**

> **Trained once on both families it is to be used on, does one network beat one filter, tuned on the same scenes,
> on new scenes of each?**

Ten rounds found the network beating the filter wherever it was trained and nowhere else, in either direction. This
round stops asking it to transfer. Section 9 sends the network to the device when both hypotheses hold. Here both test
families are ones it was trained on, so meeting that rule claims no transfer, and says nothing about a family outside
R and C.

**One deliberate change from round 10: the training split is round 7's 96 scenes of R and round 10's 96 of C,
together.**
- They are the same 192 scenes those rounds rendered and trained on; nothing about them is new.
- Everything else is round 10's:
  - the large network (33,329 parameters), 4,500 steps, seeds 1, 2, 3;
  - the filter and its grid, tuned on the training split, so now on all 192;
  - the emitter mask and its rule;
  - the sign-flip test, Holm over {H1, H2};
  - C0, C1 on the training images (now 176 of 192), C2-C5, and the stop before the tests.
- **H1 is new scenes of R; H2 is new scenes of C.** Both are in-distribution.
- One network and one filter setting for both families. Neither method is told which family an image comes from.
- C2's shuffled-target networks are trained on the 192 and measured on H1's set, as always.
- The schedule is not lengthened. 4,500 steps over 192 scenes draw each scene about half as often as rounds 9 and 10
  did. That is part of the change, and the pilot below says what it costs on the training images.

**Splits** (`SPLITS_R11`):

| Split | Scenes | Seeds |
|---|---|---|
| train | 96 of R and 96 of C | 20000-20095 (round 7's) and 30000-30095 (round 10's) |
| val | 4 of R and 4 of C | 21000-21003 and 31000-31003 (rounds 7 and 10's) |
| T1 -> **H1** | 12 of R | **34000-34011** |
| T2 -> **H2** | 12 of C | **35000-35011** |

- Every test seed is on a range no earlier split touched. The training and val scenes are earlier rounds', each drawn
  as the family it was drawn as then (the gate holds that).
- C5 holds over eleven rounds: 1,518 render seeds.

**Secondary** (reported, never tested):
- **Each family's own training, side by side.** The filter tuned, and the large network trained (seeds 1-3), on R's 96
  alone and on C's 96 alone -- the trainings round 10 ran as its comparison and as its primary. Measured on this
  round's test images:
  - their networks against this round's filter, under both tests;
  - **this round's networks against each family's own filter,** under both tests. A device that knew each image's
    family could run that family's filter instead; this says whether the one network beats that too.
- The sign test beside every sign-flip p.
- 1- and 16-sample inputs, val, and time.

**What was seen first.**
- Everything in sections 1-31, including both families' test images in rounds 5-10 and every statistic on them.
- **The pilot,** on the 192 TRAINING scenes only, before this was written. Its scenes are the ones rounds 7 and 10
  rendered, read from round 10's cache; round 10's filters and its seed-1 networks were read from there too.
  Each cell is the training fit (as C0 measures it, against the noisy input; lower is better), then how many images
  beat the noisy input:

| on the training scenes | all 192 | R's 96 | C's 96 |
|---|---|---|---|
| noisy input, relMSE median | 0.0203 | 0.0352 | 0.0127 |
| **the filter tuned on all 192:** sS 1, sN 1, sA 0.2, sI 4 | 0.294; 189 | 0.211; 94 | 0.409; 95 |
| C's own filter (round 10's, sI 1) | 0.361; 190 | 0.342; 94 | 0.382; 96 |
| round 10's network trained on R alone, seed 1, 4,500 steps | 0.204; 191 | 0.100; 96 | 0.419; 95 |
| round 10's network trained on C alone, seed 1, 4,500 steps | 0.207; 190 | 0.226; 94 | 0.189; 96 |
| **the large network on all 192,** seed 1, 1,500 steps | 0.196; 192 | 0.145; 96 | 0.265; 96 |
| the same, 3,000 steps | 0.174; 192 | 0.128; 96 | 0.238; 96 |

- **C0 and C1 will hold.** The network's fit is well under 0.8, and both methods clear 176 of 192.
- **Tuned on both families, the filter chooses R's setting exactly:** sI 4, as tuning on R alone chose in rounds 9
  and 10.
  - On C it fits 0.409, where C's own setting fits 0.382. So H2 is measured against a filter that is, on C, not the
    best filter for C.
  - That is what one filter for both families is. The secondary measures the network against C's own filter as
    well.
- **Trained on both, the network fits each family less well than that family's own network** (R 0.128 against 0.100;
  C 0.238 against 0.189, at 3,000 steps against 4,500), and better than either filter on either family. Rounds 8 and
  9 found training-set gaps that did not hold on the test sets, so none of this predicts H1 or H2.
- The pilot ran 3,000 of the 4,500 steps, at 0.58 s a step on this host. The harvest's seed-1 training repeats it
  bit for bit and goes on.
- **Each family's half hashes to the training set round 10 had** (R's to its comparison, C's to its primary). The
  harvest trains those networks again from nothing, in its own cache. Section 33 will say whether they came out bit
  for bit as round 10's.

- Nothing of either new test set has been rendered.

**The command:** `node tools/denoiseStudy.mjs --harvest-r11 --cache <dir> --workers 4` ->
`render/denoise-results-r11.json`.
- It refuses if the file exists.
- It trains 13 large networks: the primary four (C4's second training among them), three shuffled-target networks, and
  six for the two single-family trainings. Expect several resumes (sections 24 and 30).

**The outcomes:**
- **H1 and H2 supported:** one network, trained on both families, beats one filter on new scenes of each. It goes to
  the device, with the head widened past `COUT_MAX` 32, for scenes of the families it was trained on. The arc's record
  says nothing for any other family, and the device page will say so.
- **H1 only, or H2 only:** one network does not beat one filter on both families it was trained on. It does not go
  to the device. The single-family networks on the same images say whether that family's own training beat the
  filter there.
- **Neither:** recorded as found, with the single-family trainings beside it.
- **Not reported:** C0 or C1 fired on the training images, or C4 or C5 fired.

## 33. ROUND 11 -- THE HARVEST RAN WITHOUT ITS SECONDARY, AND HOW THE SECONDARY IS RUN

Written after the harvest and before its results file was read.

`node tools/denoiseStudy.mjs --harvest-r11 --cache <dir> --workers 4` at 88fa9228, in two runs:
- **16:19:57Z:** stopped at the 2-hour background limit, after the primary trainings, C0, C1 and the test renders,
  with the shuffled-target trainings checkpointed at steps 3,750-4,000 of 4,500.
- **18:20:08Z to 18:31:14Z:** resumed and finished. Its output, unedited, is `render/denoise-results-r11.json`,
  committed at 3cb567e7.

**What went wrong: section 32's secondary was not run.**
- The runner, `tools/denoiseStudy.mjs`, handed `runStudy` a round's options one by one. Round 11's new option,
  `compareTrainSplits`, was not among them, so the study ran as if no comparison training had been named.
- The gates ran `runStudy` with the option directly (section 12 of the study's gate), never through the runner. So
  the gates passed and the harvest did not do what they held.
- The second run ended 57 s after its measurements, which is how it was noticed.
- Nothing else depends on the option. The hypotheses, the controls and the other secondaries are as section 32 fixed
  them.

**What was seen.** The runner's last log line named the verdict, and the stage monitor's filter matched it. So "run
reported; H1 supported, H2 supported" was seen before the results file was committed. No number was seen. The runner
no longer logs any part of the verdict.

**The fix, gated before anything runs again.**
- The runner now hands the study a round's options whole, less the file it writes (`studyOptions`). It finds each
  command's round in one table (`HARVESTS`). Both are in `render/denoiseStudy.mjs`, which the runner imports.
- Gated (section 13 of the study's gate):
  - every round's command runs that round;
  - the study is handed every option the round names, and `runStudy` takes each by name;
  - the harvest branch logs nothing of the verdict.
- 5 sabotages, all red. One of them (R29) is the runner exactly as the harvest ran.

**The secondary run:** `node tools/denoiseStudy.mjs --secondary-r11 --cache <dir> --workers 4` ->
`render/denoise-results-r11-secondary.json`.
- It is round 11 in every option, writing its own file. The harvest's results are never overwritten.
- Its cache starts with every record the harvest made, hard-linked from the harvest's: the rendered scenes, the filter,
  and the primary and shuffled-target networks.
  - Those records were made at 88fa9228. Since then no code that makes them has changed. `render/`, `brain/` and
    `physics/` differ only in the results file, a gate, and the runner's table and `studyOptions` added to
    `render/denoiseStudy.mjs`, which no record reads.
  - Each record is keyed by every input and option it depends on. A record the fixed runner asked for differently
    would be missed and made again.
- So it should make exactly 8 things: each family's filter and its three networks. Its file records how many it made
  (cache misses).
- Its primary analysis is read back from the harvest's records, so it must equal the committed file bit for bit. That
  is checked and reported. It is not a second test.
- The secondary is what section 32 fixed. Nothing in it is chosen now.

**What follows.** Section 34 reports round 11 from both files: the hypotheses from the harvest's, the secondary from
the second. It also says whether each family's networks came out bit for bit as round 10's, which section 32 promised
for "section 33".

## 34. ROUND 11 -- REPORTED: H1 SUPPORTED, H2 SUPPORTED

Two files, both committed unedited before they were read (section 33):
- **The harvest:** `node tools/denoiseStudy.mjs --harvest-r11 --cache <dir> --workers 4` at 88fa9228, in two runs
  (16:19:57Z, stopped at the 2-hour limit; 18:20:08Z to 18:31:14Z). `render/denoise-results-r11.json`, committed at
  3cb567e7. The hypotheses and controls are from this file.
- **The secondary:** `node tools/denoiseStudy.mjs --secondary-r11 --cache <dir> --workers 4` at 768fdfdd, in one run
  (18:50:46Z to 20:25:39Z). `render/denoise-results-r11-secondary.json`, committed at e7edd957. Section 32's
  secondary is from this file.
- **As section 33 said it must:**
  - The secondary file's verdict, tables, filter and controls are the harvest's bit for bit, and so are its other
    secondaries.
  - It made exactly 8 things (cache misses 8, hits 472): each family's filter and its three networks.

**Every control held.**

| Control | Result |
|---|---|
| C0 | 0.161 / 0.153 / 0.166 (needs <= 0.8) |
| C1, on the training images | network 192, filter 189 of 192 (needs 176) |
| C2 | shuffled-target network: mean d -1.86 (needs <= 0) |
| C3 | no test image within 2x of its reference floor |
| C4, C5 | held; 672 distinct render seeds |

Reported, never tested: on the test sets, both methods beat the noisy input on 12 of 12 images, on both sets.

**The hypotheses, by the sign-flip test:**

| | Network wins (of 12) | mean d | sign-flip p | (sign test p) | Holm threshold | Status |
|---|---|---|---|---|---|---|
| H1, new scenes of R (34000) | **12** | +0.548 | 0.0002 | (0.0002) | 0.025 | **supported** |
| H2, new scenes of C (35000) | **12** | +0.765 | 0.0002 | (0.0002) | 0.05 | **supported** |

- **One network, trained on both families, beats one filter on every test image of each.**
  - On R: network 0.0039 (seeds 0.0038-0.0042), filter 0.0068, about 42% lower. The smallest win is d +0.08.
  - On C: network 0.0026 (all three seeds), filter 0.0056, about 53% lower. The smallest win is d +0.21.
  - Seed by seed: seed 3 loses one image of R; every other seed wins all 24.
- The filter is R's setting (sI 4), as the pilot found. On C, H2 is measured against a filter that is not the best
  filter for C. The secondary below measures the network against C's own filter as well.

**Geometric-mean relMSE on the test images** (reported, never tested):

| | H1's set (R) | H2's set (C) |
|---|---|---|
| noisy | 0.0367 | 0.0160 |
| filter tuned on all 192 (the primary; R's setting) | 0.0068 | 0.0056 |
| **network trained on all 192** (the primary), seeds 1-3 | **0.0038-0.0042** | **0.0026** |
| 1-sample input: filter / networks | 0.0177 / 0.0089-0.0118 | 0.0119 / 0.0042-0.0050 |
| 16-sample input: filter / networks | 0.0035 / 0.0020-0.0026 | 0.0040 / 0.0017-0.0020 |
| the reference floor | 0.0004 | 0.0001 |

- val (4 of R, 4 of C): on R, noisy 0.0325, filter 0.0071, network 0.0045; on C, noisy 0.0132, filter 0.0052,
  network 0.0034.

**Secondary: each family's own training, on the same images** (from the second file; reported, never tested).

| | H1's set (R) | H2's set (C) |
|---|---|---|
| filter tuned on R alone (sI 4) | 0.0068 -- the primary's setting | 0.0056 -- the primary's setting |
| filter tuned on C alone (sI 1) | 0.0125 | 0.0052 |
| network trained on R alone, seeds 1-3 | **0.0036-0.0038** | 0.0047-0.0052 |
| network trained on C alone, seeds 1-3 | 0.0073-0.0082 | **0.0025-0.0031** |
| network trained on both (the primary) | 0.0038-0.0042 | 0.0026 |

- **Against each family's own filter, the one network still wins every image.**
  - R's own filter is the primary filter: the same setting, so the same statistics as H1 and H2.
  - C's own filter is better than the primary filter on C (10 of 12 images; 0.0052 against 0.0056). The one network
    beats it on all 12 (mean d +0.69, sign-flip p 0.0002).
- **Against each family's own network, the one network loses little.**
  - On R, the R-only network is slightly better. The joint network's error is 1.07 x its own; the joint network is
    better on 1 image of 12.
  - On C, the two are level: the joint network's error is 0.96 x the C-only network's, and it is better on 4 of 12.
- **Each family's own network does not transfer**, as rounds 2-10 found:
  - trained on R, on C: 7 of 12 against the primary filter, sign-flip p 0.082;
  - trained on C, on R: 4 of 12, p 0.92.
  - On each family, the joint network beats the other family's network on all 12 images.
- **Each family's filter and three networks are round 10's, bit for bit.** Section 32 promised this check.
  - Round 10 trained them at 0eb3451c, its C networks resumed from checkpoints after a host move.
  - This run trained them again from nothing at 768fdfdd.
  - Every weight is the same, and so are both filter settings.

**What this buys, per section 32: "H1 and H2 supported".**
- One network, trained on both families it is to be used on, beats one filter, tuned on the same scenes, on new
  scenes of each. It also beats each family's own filter, and it is close to each family's own network.
- **Section 9's rule is met. The network goes to the device**, with the head widened past `COUT_MAX` 32, **for scenes
  of R and C.** The device page will say so.
- **No transfer is claimed.** This round tested no family the network was not trained on. Every round that did found
  it never beat the filter there.

**The arc, as its pre-registered verdicts read:**

| Round | Change | Trained on | In-distribution | A family not trained on |
|---|---|---|---|---|
| 2 | residual network | A | not supported (2/12) | not supported (1/12) |
| 3 | kernel-predicting head | A | **supported** (10/12) | not supported (5/12) |
| 4 | + temporal history | A | **supported** (12/12) | not supported (5/12) |
| 5 | A+B, tested on C | A+B | not reported (C1: the filter) | not reported |
| 6 | + the emitter mask | A+B | **supported** (11/12) | not supported (1/12) |
| 7 | randomized family R | R | not reported (C1: the filter) | not reported |
| 8 | C1 on the training images | R | not supported (7/12) | not supported (2/12) |
| 9 | 4x network, 3x training, sign-flip test | R | **supported** (11/12) | not supported (2/12) |
| 10 | trained on family C | C | **supported** (12/12) | not supported (6/12) |
| 11 | one network for both families | R+C | **supported** on R (12/12) and on C (12/12) | none tested |

- **A kernel-predicting network beats a tuned hand-written filter on the families it was trained on.** That held in
  six of the nine rounds since the kernel head (3-11). Two of the other three were not reported, and the third
  (round 8, 7 of 12 on R) was one draw of scenes (section 29).
- **It has never beaten the filter on a family it was not trained on,** in any round that tested one.
- **Trained on everything it is used on, it wins there**, at little cost against each family's own network.

## 35. ROUND 12 -- THE DEVICE ROUND, FIXED BEFORE THE SHIPPED NETWORK RUNS ON ANY TEST IMAGE

Committed with the code that implements it. The shipped network has not been run on the device on any test image.

**What this round is.** Section 34 sent round 11's network to the device, for scenes of R and C, as Keith asked. This
round tests no new hypothesis: nothing about the network changes. It asks whether the network on the device IS the
network the harvest measured, image by image, and it puts the network on a page beside the path tracer's.

**What ships.**
- **The network:** round 11's seed 1, the seed C4 trained twice. It is exported from the harvest's cache to
  `render/denoise-net-r11.json`:
  - every weight, as base64 float64;
  - the harvest's filter setting (sS 1, sN 1, sA 0.2, sI 4);
  - where it came from.
- **The device pass:** `render/denoiseDevice.mjs`, on any GPUDevice.
  - The four hidden layers run on `brain/conv2d.mjs`'s tiled kernel.
  - The 81-logit head runs on its direct kernel. `COUT_MAX` 32 limits only the tiled kernel's private accumulators;
    the direct kernel keeps one accumulator at a time and never had the limit. So the head needed neither widening
    nor splitting, which section 15 expected it would.
  - A new kernel, `k_apply`, does what `render/denoiseNet.mjs`'s kernelApply does, in f32:
    - a softmax over the 9 x 9 taps that are inside the image and on the pixel's side of the emitter mask;
    - the weighted noisy irradiance;
    - re-modulation by the albedo.
- **The page:** `denoise.html`, linked beside the Path Tracer on the front door.
  - It renders scenes of R and C only, with seeds outside every split; a dataset seed is refused.
  - It shows the noisy input, the filter, the network and a reference.
  - It runs the network on the viewer's device, or on the CPU without WebGPU, and says which.
  - It checks its own device output against the f64 network.
  - Above everything, it says the network was trained on R and C, and that no round found a network beating the
    filter on a family it was not trained on.

**Gated** (`render/denoiseDevice-selfcheck.mjs`, synthetic images and seeds outside every split):
- **On Dawn:**
  - every conv cell is the twin's or the fused mirror's, given the device's own input to that layer;
  - `k_apply` is within `APPLY_TOL` of its twin. That bound is 1e-5 relative, because WGSL's `exp` and division are
    not correctly rounded;
  - handed every logit plus 100, `k_apply` gives the same image;
  - the whole pass is the f64 network's within f32 rounding.
- **In Chromium:** the page runs the network on its own device, finds it the f64 network's within f32 rounding, and
  refuses a round 11 test seed.
- **11 sabotages, all red.** One of them (V11: the largest logit not subtracted before `exp`) went red only after a
  row was written for it. Until a logit passes about 88 it changes nothing measurable.
- **One device per job.** While this was built, a Dawn device reused after the JS thread had been busy for about a
  second crashed the process or hung. A fresh adapter and device per job, destroyed after, ran clean every time.

**What was seen first.**
- Everything in sections 1-34.
- The device pass on synthetic images, and the shipped network on two scenes outside every split (R 975600 and
  C 975700, 64 x 64, a 64-sample reference). None of these is a test image.
  - Logits ran from -56 to 12.
  - `k_apply` was 4.8e-7 and 5.5e-7 from its twin.
  - The device's image was 8.9e-7 and 9.5e-7 from the f64 network's.
  - The relMSE was the same to six digits.

**The criteria,** on round 11's 24 test images (12 of R, 12 of C), with the shipped network:
- **D0, the shipped file is the harvest's network:** on the CPU, in f64, its relMSE on every test image equals round
  11's seed-1 relMSE, bit for bit.
- **D1, the layers:** every conv cell on the device is the twin's or the fused mirror's, given the device's own input
  to that layer. None is unexplained.
- **D2, the kernel:** `k_apply` is within `APPLY_TOL` of its twin on every value.
- **D3, the verdict on the device:**
  - on every image, the device's relMSE is within 1e-4 relative of the f64 network's;
  - the device network beats the primary filter on exactly the images the f64 network does.
- **Reported, not criteria:** the time per 64 x 64 frame, and the adapter. This box's device is SwiftShader, a
  software device, so its times are a JIT's cost and not a GPU's.

**The command:** `node tools/denoiseDevice.mjs --measure-r12 --cache <dir>` -> `render/denoise-results-r12.json`.
- It refuses if the file exists.
- Its log says only that the file was written, and the file is committed before it is read.
- Its cache starts with the harvest's test renders, hard-linked (section 33's way), so the images are the harvest's.
  D0 would catch any that were not.
- Each image gets its own fresh device.

**The outcomes:**
- **D0-D3 hold:** the network is on the device, and the page is the round's deliverable.
- **D0 fails:** the shipped file is not the harvested network. Nothing else is read until it is.
- **D1, D2 or D3 fails:** the device pass is wrong somewhere. It is found and fixed, and the measurement repeated
  under a new section, never silently.

## 36. ROUND 12 -- REPORTED: THE NETWORK IS ON THE DEVICE

`node tools/denoiseDevice.mjs --measure-r12 --cache <dir>` at 41ab583e, in one run (21:20:50Z to 21:27:21Z).
- Its output, unedited, is `render/denoise-results-r12.json`, committed at ca25e327 before it was read.
- The cache served all 24 test images (hits 24, misses 0).

**Every criterion held.**

| Criterion | Result |
|---|---|
| D0, the shipped file is the harvest's network | its f64 relMSE equals round 11's seed 1 on all 24 images, bit for bit |
| D1, the layers | 20,545,536 conv cells, every one the twin's: none fused, none unexplained |
| D2, the kernel | worst 6.4e-7 relative to its twin (bound 1e-5) |
| D3, the verdict on the device | relMSE within 3.8e-7 of the f64 network's on every image (median 6.8e-8; bound 1e-4); it beats the primary filter on 12 of 12 images of R and 12 of 12 of C, the same images as on the CPU |

Reported, not a criterion:
- One 64 x 64 pass took 620-830 ms (median 702).
- The device is SwiftShader 5.0.0, a CPU running a JIT, so this says nothing about a GPU's time.
- The f64 network on the CPU, in node, takes about 0.4 s on the same image.

**What this buys, per section 35: "D0-D3 hold".**
- **The network is on the device.**
  - On every one of round 11's test images, the device gives the harvested network's answer: bit for bit through
    every conv layer, and within 6.4e-7 through the kernel.
  - Round 11's verdict, re-read from the device's own images, is unchanged.
- **The page, `denoise.html`, is the round's deliverable,** beside the Path Tracer, for scenes of R and C.
- **Section 9's outcome for "H1 and H2 supported" is now carried out:** the network runs through
  `brain/conv2d.mjs`'s kernels, on a page beside the path tracer's.

**What it has not shown.**
- **A GPU.** Every device in this container is SwiftShader. Speed on real hardware, and WebGPU on a real adapter, are
  unmeasured. Keith's rig is where the page meets one.
- **Any scene outside R and C.** In every round that tested a family the network was not trained on, it never beat
  the filter there. The page says so, and renders nothing else.
- **The path tracer's own scenes.** They are neither R nor C, so the page does not offer them.

## 37. ROUND 12 -- A GPU'S TIME, FOR THE RIG

Section 36 left one thing unshown: a GPU. Every device in this container is SwiftShader, so every time sections 35-36
printed was a CPU's. Keith asked for a timing measurement the rig can run. This is it. It is a measurement, not a
hypothesis: no number is pre-registered to beat.

**What is timed.**
- One pass of round 11's network (`render/denoise-net-r11.json`): the five conv layers and the kernel.
- A ladder of sizes, from the trained 64 x 64 through 128, 256, 512 and 1024 squares to a 1920 x 1080 frame. The
  network is fully convolutional and the kernel is per pixel, so any size runs. What a pass costs does not depend on
  what the image shows, so the input is synthetic (`timingInput`).
- **Two ways:**
  - natively, on node-webgpu's default adapter (on the rig, the GTX 1080 through D3D12);
  - through `denoise.html`'s own "Time the network", in the browser.

**How.** `render/denoiseDevice.mjs`'s `time()` and `timingLadder`.
- Each size gets a fresh device (section 35's hazard), with the storage limits raised to fit its largest buffer. A
  size whose buffer is over the adapter's limit is skipped, and says so.
- Two untimed passes come first (one natively), then timed ones until 30, or until 2 s of them once there are 3.
- Per size:
  - **wall clock:** submit to `queue.onSubmittedWorkDone()`, with no upload and no read-back;
  - **the device's clock:** the same span, and each pass's, from timestamp queries where the adapter offers them;
  - the median and the 10th-90th percentiles, and megapixels a second.
- The ladder stops before a size whose pass, predicted from the last median scaled by pixels, would take over 1.5 s.
  On SwiftShader that leaves 64 x 64 alone; on a GPU it should reach the 1080p frame.

**Gated** (`render/denoiseTiming-selfcheck.mjs`, a timing gate). The timer is asserted, never the time:
- the first size is measured, and every time is finite and positive;
- every skip says why, and the cap skips only what the last pass predicts past it;
- per timed pass, the device's span sits inside the wall clock and the layers inside the span (two 0.1 ms quanta
  allowed, since a browser rounds timestamps);
- timestamp queries are asked for wherever the adapter offers them;
- timing changes nothing: the image a timed pass wrote is an untimed run's, bit for bit.

**On the rig.** `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise.json` runs both denoiser gates.
- The runner now covers them, with the device gate as exact and the timing gate as timing.
- The report names every adapter they ran on. The native adapter is logged by the gate itself, since it does not go
  through the browser harness.
- `docs/real-hardware-fsr.md` says what to send back.

**On this box,** for scale and nothing else: 64 x 64 took about 640 ms natively and 510 ms in the browser, and the
three 32 -> 32 layers took most of it. That is SwiftShader, a CPU, and the report's first line says so.

## 38. ROUND 12 -- REPORTED: THE FIRST GPU (AN INTEL GEN-9)

Keith ran section 37's command, `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise.json`, at
6bf17197.
- **The machine.** Windows 11 (10.0.22631) with an Intel gen-9 integrated GPU, node v24.17.0. It is not the GTX 1080
  box section 37 named; Keith says it is a different computer.
- **The report.** It is `render/denoise-rig-r12-intel-gen9.json`, byte for byte as sent, committed at 193c8f86.
- **Read before it was committed.** The report arrived as an upload and was read on arrival, before that commit. Section
  37 pre-registered no number, so nothing in it can be steered by the order. The commit still keeps the file as sent.
- **An earlier attempt ran nothing.** Keith's checkout was on `main`, which has neither gate. `--only denoise` matched
  nothing, and the runner called that "NO ADAPTER WAS SEEN" and exited 0. It now says `NO GATE MATCHED`, names the
  commit and exits 1 (6bf17197, gated, sabotages E1-E3).

**Both gates held on a real GPU.**

| Gate | Kind | Adapters | Result |
|---|---|---|---|
| `render/denoiseDevice-selfcheck.mjs` | exact | intel gen-9 (Chrome, `--use-angle=d3d11`) | PASS, 12.3 s |
| `render/denoiseTiming-selfcheck.mjs` | timing | intel gen-9 through D3D12, driver 31.0.101.2137 (node-webgpu); intel gen-9 (Chrome) | PASS, 18.2 s |

- **The exact gate has no hardware exemption.** No row in it is scoped to a software adapter. So on this GPU every conv
  cell of every layer was the twin's or the fused mirror's, the kernel was within APPLY_TOL of its twin, and the page's
  run in Chrome was the f64 network's within f32 rounding. The gate prints no measured lines, so how many cells were
  fused is not in the report.
- **The timing gate asserts the timer, not the time.** All its rows held on this GPU:
  - the first size was measured, and every skip gave its reason;
  - the device's span sat inside the wall clock, and the layers inside the span, on every pass;
  - timestamp queries were asked for, and both the native device and the page offered them;
  - a timed pass wrote an untimed pass's image, bit for bit.

**The times.** These are medians on the device's clock, in ms a pass, with the wall clock in brackets.

| Size | Native (D3D12) | Page (Chrome) | Mpx/s native |
|---|---|---|---|
| 64 x 64 | 34.7 (36.1) | 36.8 (39.1) | 0.114 |
| 128 x 128 | 119.3 (120.6) | 134.6 (136.4) | 0.136 |
| 256 x 256 | 522.1 (523.6) | 553.5 (559.2) | 0.125 |
| 512 x 512 | skipped: predicted 2,095 ms | skipped: predicted 2,241 ms | -- |
| 1024 x 1024 | skipped: predicted 8,379 ms | skipped: predicted 8,963 ms | -- |
| 1920 x 1080 | skipped: predicted 16,570 ms | skipped: predicted 17,725 ms | -- |

- **Against SwiftShader.** At 64 x 64, about 18 times faster natively (section 37: about 640 ms) and 13-14 times in
  the browser (about 510 ms).
- **The page costs 6-13% more than native at every size,** on both clocks.
- **The cost is per pixel, not per pass.** Throughput is flat at 0.11-0.14 Mpx/s across a 16-fold range of sizes:
  128 x 128 took 3.4 times 64 x 64, and 256 x 256 took 4.4 times 128 x 128. A fixed per-dispatch overhead would
  have shown as rising throughput. That flatness is also why the ladder's linear predictions for the skipped sizes
  are believable -- though they are predictions, not measurements.
- **Where a pass goes.** The three 32 -> 32 layers take 73-79% of it, and the kernel 3.4-4.2%.
- **A quirk of one size.** At 256 x 256 natively, the per-layer medians sum to 547.8 ms, more than the span's median
  of 522.1. Those are medians of three passes, one of which ran to 649 ms. The gate holds the nesting per pass, where
  it held.

**What the arithmetic says.**
- The network's conv layers cost 33,120 multiply-adds a pixel (66,240 flops):
  - 10 -> 32, 3 x 3: 2,880;
  - three 32 -> 32, 3 x 3: 9,216 each;
  - 32 -> 81, 1 x 1: 2,592.
- **Measured throughput is about 8-9 GFLOP/s.** The 3 x 3 layers run at 8-11 GFLOP/s through the tiled kernel. The
  1 x 1 head runs at about 4.4 GFLOP/s through the direct one.
- **The report does not name the part.** "Gen-9" covers several Intel GPUs. If this is the common 24-EU part (HD
  520-630 class), its fp32 peak is roughly 0.4 TFLOP/s, and the kernels run at about 2% of it.
- **A 1080p frame is 137 GFLOP for this network.**
  - **On this GPU:** 30 frames a second needs 4.1 TFLOP/s, about ten times such a part's peak. No kernel, however
    good, makes this network real time at 1080p on this class of GPU. At peak it could manage about 450 x 450 at 30
    frames a second.
  - **On a GTX 1080** (about 8.9 TFLOP/s peak), 1080p at 30 frames a second needs about 46% of peak. That is possible
    in principle, and far from what these kernels achieve here.
- **Two separate levers.**
  - **The kernels' efficiency** is engineering, with up to about fifty times of headroom on paper. Candidate causes,
    none measured:
    - the tiled kernel's 32 accumulators are indexed by a loop variable, which usually puts them in memory rather
      than registers;
    - every multiply-add loads twice, once from the tile and once from the weights in storage;
    - bounds tests sit inside the innermost loops.
  - **The network's size** is modelling. A smaller network reopens the quality question, and would need its own
    pre-registered round against the filter.
- **The constraint a faster kernel works under.** D1 holds every device cell to the twin's sum, in the twin's order.
  A faster kernel that keeps each cell's order keeps D1. That includes registers sized at compile time, weights staged
  in workgroup memory, and several pixels a thread. One that reorders the sums -- vec4 dot products, split
  reductions -- would need D1 restated as a bound, before it runs.

**What this has not shown.**
- **A discrete GPU.** Keith offers the GTX 1080 box, and it needs no code change: the same branch and the same command.
  If its kernels run about as far from peak as these do, its ladder should reach the 1080p frame under the 1.5 s cap.
  That is a guess, and the run is the measurement.
- **Anything above 256 x 256 here.** Those rows are the ladder's predictions.
- **Upload, read-back and pipeline creation.** They are excluded by design (section 37): the span is the network
  alone.
- **The part's name and clock.** WebGPU's adapter info gives "intel / gen-9" and the driver, nothing finer.

## 39. ROUND 13 -- THE KERNEL-SPEED ROUND, FIXED BEFORE THE NEW KERNEL RUNS ON ANY GPU

Section 38 found the conv layers at 8-9 GFLOP/s on an Intel gen-9, about 2% of such a part's peak. It named two levers:
the kernels' efficiency and the network's size. Keith asked for a kernel-speed round while he runs the GTX 1080. This is
the first lever, under the constraint section 38 set: **no cell's summation order moves**, so D1's exactness criterion
stands unchanged.

**Order of events.** This section is committed before any GPU runs the new kernel.
- The GTX 1080 run under way as this is written is of round 12's kernels, at 1a9926d1. It is round 12's baseline on
  that box, not this round's measurement. Its report will be section 40.
  - It arrived while this round's gates were running: after this section was written, and before it was committed.
    The report is committed unedited at 0d56b279.
  - Nothing in this section was changed after reading it, except these two lines.
- Before this section, the kernel was built and piloted here, on SwiftShader only.
  - **Exactness:** every cell was the twin's, none fused and none unexplained. That held on four probe shapes (13 -> 4,
    32 -> 32, 10 -> 32 at 3 x 3; 32 -> 81 at 1 x 1) and on all five layers of the shipped network at 64 x 64.
  - **Speed:** one paired 64 x 64 pass was 2.8 times faster than round 12's.

  That is a CPU. It is not evidence for anything below, and the threshold below was chosen before the pilot ran.

**What changes.** `brain/conv2d.mjs` gains a third kernel, `conv2dFastWgsl`, generated for one layer at a time:
- Cin, Cout, k and the activation are written in as constants.
- Its weights and bias sit in one uniform block (`packFastUniforms`), as vec4s of four output channels. Every thread
  reads the same weight at the same moment, which suits a constant buffer.
- A thread keeps up to 32 output channels in registers, as eight named vec4 accumulators. The 81-logit head is split
  into three groups across the dispatch.
- The tap and the input channel are now the outer loops. Each input value is read from the tile once and added into
  all 32 channels. Round 12's tiled kernel re-read it for every channel.

Each accumulator still adds the bias, then block by block, ky, kx (in bounds) and ci, which is `conv2dCpu`'s order.
Interleaving different cells' additions changes no cell's sum, and a vec4's four lanes are four cells, each added on its
own. `render/denoiseDevice.mjs` gains two kernel sets:
- **"r12"** is round 12's kernels, unchanged;
- **"r13"** is the fast kernel on every layer it can hold, which is all five here.

`DEFAULT_KERNELS` stays "r12" until the rule below says otherwise. The network, its weights, `k_apply`, the page's scope
and every criterion of rounds 11-12 are unchanged.

**The paired ladder.** `timingLadder` now times both sets on the same device at each size, taking turns:
- three rounds, the order reversed each round (r12 r13, r13 r12, r12 r13), each set's passes pooled across the rounds;
- each set has its own 1.5 s cap, so the faster set may climb past where the slower one stops;
- the ladder's budget is 120 s.

The speedup at a size is round 12's median over round 13's, on the device's clock, or on the wall clock where the device
has no timestamp queries.

**K0 -- exact.** On every device the fast set runs on, every cell of every layer is the twin's or the fused mirror's,
given the device's own input to that layer. That is D1's rule, unchanged. It is measured three ways:
- **(a) Here,** SwiftShader natively, on round 11's 24 test images: `node tools/denoiseDevice.mjs --measure-r13`. Its
  output, `render/denoise-results-r13.json`, is committed before it is read. With it, D2 (the kernel within APPLY_TOL)
  and D3 (relMSE within 1e-4 of the f64 network's, and the primary filter beaten on exactly the same images), for the
  fast set.
- **(b) On each rig GPU natively,** by `render/denoiseDevice-selfcheck.mjs`'s synthetic images (the exact gate).
- **(c) In each rig browser,** the same synthetic network, cell for cell, in the page's own origin (the exact gate's new
  section).

**K1 -- faster.** Measured on each of Keith's GPUs (the Intel gen-9 machine and the GTX 1080 box), natively and in the
browser, by `render/denoiseTiming-selfcheck.mjs`'s paired ladder. On a GPU and path, K1 holds when:
- the speedup is **at least 2** at the largest size both sets measured there; and
- it is **at least 1** at every size both sets measured.

Why 2: below it, the gen-9's 1080p frame would move from about 17 s to no less than 8 s, still nowhere near
interactive, and not worth carrying a second kernel path. SwiftShader's speedup is reported and is never evidence.

**On the rig.**
- **One run per GPU,** of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r13.json`, at a commit
  carrying this round's code.
- **Each report is committed byte for byte** as sent.
- **Reruns.** A run is never repeated because of its numbers. It is repeated only if it did not reach the GPU (no
  adapter, a software adapter, a crash before any row ran), and then both reports are committed.

**The outcome rule.**
- **K0 fails anywhere** (one unexplained cell, on any device or path): the fast set does not become the default,
  whatever its speed. The unexplained cells are the finding: a device whose arithmetic within a cell is neither order.
- **K0 holds everywhere, and K1 holds on every GPU and path measured:** `DEFAULT_KERNELS` becomes "r13". The page and the
  device gate run the fast set, and round 12's stays as the reference the ladder times beside it.
- **K0 holds, and K1 fails on any GPU or path:** the default stays "r12", and the fast set stays for the next round.
  The report says where it fell short and by how much.
- **Whatever the outcome,** each GPU's achieved GFLOP/s and its 1080p prediction (or measurement, if the fast set reaches
  it) are reported, against section 38's figures.

**Not in this round.**
- Kernels that reorder a cell's sum (vec4 dot products along ci, split reductions, subgroup sums). They need D1
  restated as a bound, and that is a later round's pre-registration.
- A smaller network. That reopens the quality question, and would need its own round against the filter.
- Upload, read-back and pipeline creation, as in section 37.

## 40. ROUND 12 -- REPORTED: THE GTX 1080

Keith ran section 37's command on the GTX 1080 box at 1a9926d1 (section 38's commit).
- **The machine.** Windows 11 (10.0.22631), node v24.15.0, "nvidia pascal" through D3D12, driver 32.0.15.8180.
- **The report.** It is `render/denoise-rig-r12-gtx1080.json`, byte for byte as sent, committed at 0d56b279.
- **Read on arrival, before that commit,** as section 38's was. Section 37 pre-registered no number. Section 39 was
  written before the report arrived, and nothing in it changed after, apart from the two lines saying so.

**Both gates held, on a second real GPU.**

| Gate | Kind | Adapters | Result |
|---|---|---|---|
| `render/denoiseDevice-selfcheck.mjs` | exact | nvidia pascal (Chrome, `--use-angle=d3d11`) | PASS, 8.8 s |
| `render/denoiseTiming-selfcheck.mjs` | timing | nvidia pascal through D3D12 (node-webgpu); nvidia pascal (Chrome) | PASS, 24.8 s |

As on the Intel, the exact gate has no hardware exemption. So every conv cell of every layer was the twin's or the
fused mirror's on this GPU too. How many were fused is not in the report.

**The times.** These are medians on the device's clock, in ms a pass, with the wall clock in brackets.

| Size | Native (D3D12) | Page (Chrome) | Mpx/s native | Against the Intel (native) |
|---|---|---|---|---|
| 64 x 64 | 4.26 (4.55) | 4.63 (5.70) | 0.90 | 8.1 times |
| 128 x 128 | 8.91 (9.34) | 8.32 (9.70) | 1.75 | 13.4 times |
| 256 x 256 | 60.7 (61.1) | 59.7 (61.1) | 1.07 | 8.6 times |
| 512 x 512 | 239.9 (240.5) | 234.5 (235.5) | 1.09 | -- |
| 1024 x 1024 | 978.1 (978.5) | 947.1 (948.6) | 1.07 | -- |
| 1920 x 1080 | skipped: predicted 1,935 ms | skipped: predicted 1,877 ms | -- | -- |

- **The page matches native here.** It is within 5% of native from 256 x 256 up, and slightly faster on the device's
  clock. On the Intel it was 6-13% slower.
- **Throughput is flat from 256 x 256 up,** at 1.07-1.11 Mpx/s, so the ladder's 1080p prediction is believable. It is
  still a prediction.

**Where a pass goes.** This is GFLOP/s by layer, natively, from the per-layer times.

| Size | layer 0 (10 -> 32) | layers 1-3 (32 -> 32), each | layer 4, the head (32 -> 81, 1 x 1, direct) | head's share | kernel's share |
|---|---|---|---|---|---|
| 64 x 64 | 60 | 68 | 54 | 9% | 3% |
| 128 x 128 | 180 | 209 | 28 | 35% | 9% |
| 256 x 256 | 222 | 252 | 9 | 65% | 8% |
| 512 x 512 | 230 | 254-255 | 9 | 65% | 8% |
| 1024 x 1024 | 236 | 256-260 | 8 | 66% | 8% |

- **The 3 x 3 layers, on the tiled kernel, reach about 250 GFLOP/s.** That is about 2.8% of a GTX 1080's fp32 peak
  (about 8.9 TFLOP/s at boost): the same order as the Intel's 2-2.5%, on a GPU twenty-odd times faster.
- **The head, on the direct kernel, falls off a cliff between 128 x 128 and 256 x 256.** It drops from 54 GFLOP/s to
  8-9, thirty times slower per flop than the tiled layers. It takes 65-69% of every pass from there up. (The Intel
  showed no such cliff: its head ran at half its tiled layers' rate at every size.)
  - **A candidate cause, not measured:** the direct kernel reads each pixel's 32 inputs once for each of 81 output
    channels, from storage, with neighbouring threads 32 floats apart. That pattern lives on cache.
  - At 256 x 256 the head's output alone is 21 MB, and its input 8 MB, against this GPU's 2 MB of L2.
- **Had the head run at the tiled layers' rate,** the 1024 x 1024 pass would have taken about 350 ms instead of 978.
  That is arithmetic on these numbers, not a measurement.

**What it means.**
- **Real time is still far away.** 30 frames a second at 1080p needs 62 Mpx/s, and the GTX 1080 does about 1.1, 57
  times short.
- **The GPU is not the limit; the kernels are.** At this GPU's peak the network's 137 GFLOP 1080p frame takes about
  15 ms. Unlike on the Intel (section 38), real time at 1080p is within the GTX 1080's arithmetic.
- **Round 13 already covers the head.** Section 39's fast kernel runs all five layers, the head included, and reads
  each input once from workgroup memory instead of 81 times from storage. Section 39 fixed what its run decides before
  this report arrived. On this box, K1's largest common size will be 1024 x 1024, where round 12's pass is 978 ms.
  `k_apply`, 4-8% of a pass here, is unchanged by round 13.

**What it has not shown.**
- **A measured 1080p frame.** That row is a prediction.
- **The head's cliff, explained.** No profiler ran, so the cause above is a candidate.
- **The GPU's clocks or thermal state** during the run.

## 41. ROUND 13 -- REPORTED HERE: K0 (a), THE FAST SET ON THE 24 TEST IMAGES

`node tools/denoiseDevice.mjs --measure-r13 --cache <dir>` ran at 3fe9419a, the commit that carries section 39 and the
fast kernel, in one run (03:22:04Z to 03:32:48Z).
- Its output, unedited, is `render/denoise-results-r13.json`, committed at 70522e69 before it was read.
- The cache served all 24 test images (hits 24, misses 0), hard-linked from round 12's measurement cache.
- Every layer on every image ran on the fast kernel.

**K0 (a) holds.**

| Criterion | Result |
|---|---|
| D0, the shipped file is the harvest's network | its f64 relMSE equals round 11's seed 1 on all 24 images, bit for bit |
| D1, the layers | 20,545,536 conv cells, every one the twin's: none fused, none unexplained |
| D2, the kernel | worst 6.4e-7 relative to its twin (bound 1e-5) |
| D3, the verdict on the device | relMSE within 3.8e-7 of the f64 network's on every image (bound 1e-4); the primary filter beaten on 12 of 12 images of R and 12 of 12 of C, the same images as on the CPU |

- **The same figures as round 12's (section 36), to the digit.** They should be: if every cell of both sets is the
  twin's, the two sets hand `k_apply` the same logits, and it writes the same image.
- **Reported, not a criterion:** a 64 x 64 image took 371-489 ms here (median 408), with read-back, against round
  12's 620-830 ms (median 702). That is SwiftShader, and no evidence for K1.

**Still open:** K0 (b) and (c), and K1, on Keith's two GPUs. That is one run each of
`node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r13.json` on `claude/denoiser-kernel-speed`.

## 42. ROUND 13 -- REPORTED: K0 HOLDS EVERYWHERE; K1 HOLDS IN THE BROWSER AND FAILS NATIVELY; THE DEFAULT STAYS r12

Keith ran section 39's command once on each GPU, at 2be3abd2, which carries round 13's code.
- **The Intel gen-9 machine:** 13:17Z. The report is `render/denoise-rig-r13-intel-gen9.json`.
- **The GTX 1080 box:** 13:30Z. The report is `render/denoise-rig-r13-gtx1080.json`.

Both reports are committed byte for byte at b4bb4241. As before, they were read on arrival, before that commit. Section 39
fixed every criterion and the outcome rule before any GPU ran the fast kernel, and nothing below was chosen after.

**K0 holds everywhere.** The exact gate passed on both GPUs, and none of its rows is scoped to a software adapter:
- **(b) natively:** on both GPUs, every cell of the fast set's five layers was the twin's or the fused mirror's, given
  the device's own input;
- **(c) in the browser:** on both GPUs, both sets were judged cell for cell in the page's own origin, and both held;
- **(a) here:** section 41, on the 24 test images.

**K1: it holds in the browser and fails natively.** The speedup is round 12's median over round 13's, on the device's
clock.

| GPU | Path | Sizes both measured | Speedup at each | At the largest | K1 |
|---|---|---|---|---|---|
| Intel gen-9 | Chrome | 64, 128, 256 | 4.87, 6.39, 6.72 | 6.72 at 256 x 256 | **holds** |
| Intel gen-9 | native (node-webgpu, D3D12) | 64 | 0.03 | 0.03 at 64 x 64 | **fails** |
| GTX 1080 | Chrome | 64, 128, 256, 512, 1024 | 9.70, 5.81, 11.88, 12.91, 13.05 | 13.05 at 1024 x 1024 | **holds** |
| GTX 1080 | native (node-webgpu, D3D12) | 64 | 0.16 | 0.16 at 64 x 64 | **fails** |

**The outcome, by section 39's rule:** K0 holds, and K1 fails on two of the four GPU-and-path pairs. So
**`DEFAULT_KERNELS` stays "r12"**, and the fast set stays for the next round. The rule required every path, and it does
what it says. It does so even though the browser, the path `denoise.html` deploys on, gains 6.7 times on the Intel and
13 times on the GTX 1080.

**Where the native path fell short, and by how much.** The failure is one layer.

| Layer, 64 x 64, device clock (ms) | Intel native r12 | Intel native r13 | Intel Chrome r13 | 1080 native r12 | 1080 native r13 | 1080 Chrome r13 |
|---|---|---|---|---|---|---|
| layer 1 (32 -> 32, 3 x 3) | 7.274 | 0.852 | 1.288 | 0.983 | 0.131 | 0.103 |
| the head (32 -> 81, 1 x 1) | 4.391 | **1160.839** | 0.609 | 0.328 | **23.003** | 0.052 |
| the whole pass | 29.753 | 1164.968 | 6.142 | 3.736 | 23.527 | 0.480 |

- **The three 32 -> 32 layers on the fast kernel are 7.5-8.5 times faster natively, as in the browser.**
- **The fast kernel's head, natively, is pathological.** It is 1,900 times slower than the same kernel in Chrome on the
  Intel, and 440 times on the GTX 1080. Against round 12's direct kernel natively, it is 260 and 70 times slower. The
  WGSL is the same in both paths; the compiled result is not.
- **Native pipeline creation looks slow too, by inference only.** Section 37 excludes pipeline creation from the clocks,
  so these are the gates' wall times:
  - the native ladder spent its whole 120 s budget at the first size, so both sets were measured only at 64 x 64 there;
  - the exact gate took 498 s on the Intel and 176 s on the GTX 1080, against 12 s and 9 s in round 12;
  - the Intel's 498 s is close to `realGpuRun`'s 600 s per-gate timeout.
- **A candidate cause, not measured:** the two paths compile WGSL to D3D12 differently. Chrome and the node-webgpu build
  in the rig's checkout need not use the same Dawn, the same Tint, or the same HLSL compiler. The head is the one fast
  layer with k = 1 and three groups across the dispatch's z. No profiler or compiler log ran; this is a guess, and the
  next round would have to measure it.

**What the browser shows.**
- **The GTX 1080 measured a 1080p frame:** 150.4 ms on the device's clock, 13.6 Mpx/s, against round 12's predicted
  1,877 ms.
  - The conv layers ran at about 1,830 GFLOP/s, about 21% of the GPU's peak (section 40: 2.8%).
  - The head went from 648 ms at 1024 x 1024 to 8.7, 75 times faster: the strided re-reads section 40 blamed are gone.
- **The Intel gen-9:** from 128 x 128 up, the conv layers ran at 72-88 GFLOP/s (55 at 64 x 64). That is about 20% of a
  24-EU part's peak, if that is the part (section 38: 2-2.5%). 1024 x 1024 took 1,294 ms.
- **`k_apply` is now the bottleneck, and round 13 did not touch it.**
  - On the GTX 1080 it is 75.3 of the 150.4 ms at 1080p (50%), growing from 17% at 64 x 64.
  - On the Intel it is 28% at 1024 x 1024.
  - It reads 81 logits a pixel, with neighbouring threads 81 floats apart: the same pattern the head had.
- **Real time at 1080p, 30 frames a second, needs 33 ms.** The GTX 1080 in Chrome is now 4.5 times from it, against 57
  times in section 40. The conv layers alone are 75 ms, and `k_apply` is the other 75.

**What it has not shown.**
- **Why the native head is slow,** or why native pipeline creation is slow. No profiler or compiler log ran.
- **The native path above 64 x 64.** Its ladder's budget was spent there.
- **Anything about other browsers or drivers.** One Chrome and one node-webgpu build ran, on two Windows machines.

**What a next round would have to pre-register (nothing is decided here).**
- **Either the native head:** measure where its time goes, change it (another kernel for the head inside the r13 set, or
  the native compiler path), and re-run both paths on both GPUs against section 39's rule.
- **Or a rule for the page alone:** the page picks its own kernels, apart from node. That would be a new rule, made
  after seeing these numbers, so it needs its own fresh rig run. Section 39's measurements cannot satisfy a rule written
  after them.
- **And `k_apply`,** the next bottleneck in the browser: the same exactness discipline, against its twin within
  APPLY_TOL.

## 43. ROUND 14 -- THE NATIVE HEAD, A RULE FOR THE PAGE, AND k_apply: FIXED BEFORE ANY GPU RUNS THE NEW KERNELS

Keith asked for all three items section 42 named. This section is committed before any GPU runs the head kernel or
`k_apply_fast`.

**Built and piloted here first, on SwiftShader only:**
- The r14 set was exact: every conv cell the twin's, none fused, on the shipped network at 64 x 64, on a synthetic large
  network at 21 x 19 with the emitter mask, and on a small one at 13 x 11 without.
- `k_apply_fast` matched `k_apply`'s worst error to the digit on all three.
- SwiftShader's times are a CPU's, and no threshold below was chosen from them.

**One fact found before building.** node-webgpu 0.6.0's Windows package ships `d3dcompiler_47.dll`, which is FXC, and
not `dxcompiler.dll` or `dxil.dll`. Dawn's `use_dxc` switch only works when both of those are present. Chrome ships DXC.
So the leading candidate for section 42's native failure is the compiler. It is a candidate, and measurement A tests it.

**What changes.**
- **`brain/conv2d.mjs`: `conv2dHeadWgsl`,** a 1 x 1 kernel with no tile, no barrier and no groups across z:
  - a thread per pixel and vec4 of four output channels;
  - weights from a uniform block;
  - output written planar.

  At k = 1 its order is the twin's (b, then ci in order), so it is held to `conv2dCpu` cell for cell. A planar layer is
  read back channels last before it is judged.
- **`render/denoiseDevice.mjs`:**
  - **`k_apply_fast`** reads the logits planar, takes the 9 x 9 window from a 16 x 16 halo in workgroup memory, and
    recomputes the exponential instead of storing 81 of them. Its sums are `k_apply`'s, in `k_apply`'s order.
  - **The r14 set:** r13's fast kernel for the hidden layers; the head kernel for the last layer, when it is 1 x 1;
    then `k_apply_fast`.
  - **`PAGE_KERNELS`,** read by `denoise.html` alone, starts at "r12".
- **The paired ladder:** the page times r12, r13 and r14 in turns. Natively it times r12 and r14 only, with a 600 s
  budget, because each native fast pipeline took minutes to build.
- **`render/denoiseCompile-selfcheck.mjs`** (a timing gate) is measurement A.
- **`tools/ship/realGpuRun.mjs`** runs all three denoiser gates and allows each 30 minutes (section 42's 498 s against 600).

**A. The native head: where its time goes, and a change.**
- **The measurement, with no threshold.** The compile gate takes seven kernels:
  - round 12's tiled and direct kernels;
  - the fast kernel at 3 x 3 and as the head;
  - the head kernel;
  - `k_apply` and `k_apply_fast`.

  For each, on a synthetic layer at 64 x 64, it records the pipeline's build time (wall clock), the pass time (the
  device's clock), whether the output is exact, and what the compiler made of it, from Dawn's own dump: compiler, lines,
  loops, indexable temps and barriers. It measures three ways:
  - natively, as shipped (FXC on Windows);
  - natively under `use_dxc`, with DXC's two DLLs copied beside `dawn.node` for that run and removed after, where the box
    has them (a Chrome or the Playwright headless shell);
  - in Chrome.

  Each native kernel runs in its own process.
- **Three hypotheses, read off that gate's lines.** Each is reported as supported, not supported, or untested, and
  **none decides anything:**
  - **A1, the compiler.** On a GPU where the `use_dxc` run's dump says DXIL, the fast head runs natively at least 10
    times faster under DXC than under FXC. If that run's dump says DXBC, or the box has no DXC, A1 is untested there.
  - **A2, the change.** Natively under FXC, the head kernel is no slower than round 12's direct head at 64 x 64.
  - **A3, the build.** Natively under FXC, building the fast 3 x 3 pipeline takes at least 10 times longer than
    building round 12's tiled one.
- **The change, fixed now whatever A finds:** r14's head is the head kernel.

**B. A rule for the page alone.** `PAGE_KERNELS` is read only by `denoise.html`. It is decided from this round's run,
not round 13's.
- **A set qualifies** when, on both GPUs, in the browser:
  - K0 holds for it, cell for cell in the page's own origin (the exact gate's browser section); and
  - K1 holds for it against r12 in the page ladder: at least 2 times at the largest size it and r12 both measured, and
    at least 1 time at every size both measured.
- **`PAGE_KERNELS` becomes** the qualifying set, of r13 and r14, with the larger of the two GPUs' smaller speedups at
  those largest sizes. A tie goes to r14. If neither qualifies, it stays "r12".

**C. `k_apply`.** r14 runs `k_apply_fast`. It is held to `kernelApplyCpu` within APPLY_TOL, inside K0.
- **C1, reported and not deciding:** in the browser on each GPU, `k_apply_fast` is at least 2 times faster than
  `k_apply`. It is read from the ladder's split by pass, r14's against r13's, at the largest size both measured.
- **The whole pass decides,** through K1 and B.

**K0 for r14 holds** when every conv cell is the twin's or the fused mirror's, and the kernel apply is within APPLY_TOL,
in each of:
- (a) here: `node tools/denoiseDevice.mjs --measure-r14` on round 11's 24 test images, with D0-D3, its output committed
  before it is read;
- (b) natively on both GPUs (the exact gate);
- (c) in the browser on both GPUs (the exact gate's browser section).

The compile gate's exactness rows are further evidence: an r14 kernel that is not exact anywhere it ran fails K0.

**`DEFAULT_KERNELS`,** the rule section 39 used for r13: it becomes "r14" if K0 holds for r14 everywhere, and K1 holds
for r14 against r12 on every GPU and path, native and browser. Otherwise it stays "r12".

**On the rig.**
- **One run per GPU** of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r14.json`, on
  `claude/denoiser-round14`, at a commit carrying this round's code.
- **It may take half an hour or more on the Intel,** because native FXC builds took minutes each in round 13.
- **Each report is committed byte for byte.** A run is repeated only if it did not reach the GPU, and then both reports
  are committed.

**Not in this round.**
- Making node use DXC by default. If A1 is supported, that is the next round's decision.
- Kernels that reorder a cell's sum.
- A smaller network.

## 44. ROUND 14 -- REPORTED HERE: K0 (a), THE r14 SET ON THE 24 TEST IMAGES

`node tools/denoiseDevice.mjs --measure-r14 --cache <dir>` ran at 04023b33, the commit that carries section 43 and
the head kernel and `k_apply_fast`. It was one run of 695 s, ending 19:21:32Z.
- Its output, unedited, is `render/denoise-results-r14.json`, committed at a0cf964b before it was read.
- The cache served all 24 test images (hits 24, misses 0). It was hard-linked from round 12's measurement cache.
- On every image the four hidden layers ran on the fast kernel and the 81-logit head on the head kernel. The kernel
  apply was `k_apply_fast`.

**K0 (a) holds.**

| Criterion | Result |
|---|---|
| D0, the shipped file is the harvest's network | its f64 relMSE equals round 11's seed 1 on all 24 images, bit for bit |
| D1, the layers | 20,545,536 conv cells, every one the twin's: none fused, none unexplained. 7,962,624 of them are the head kernel's, read back planar and judged channels last |
| D2, the kernel | `k_apply_fast`'s worst is 6.4e-7 relative to its twin (bound 1e-5) |
| D3, the verdict on the device | relMSE within 3.8e-7 of the f64 network's on every image (bound 1e-4). The primary filter is beaten on 12 of 12 images of R and 12 of 12 of C, the same images as on the CPU |

- **The device's relMSE is round 13's and round 12's, bit for bit, on all 24 images.** D2 and D3 match theirs to the
  last digit too.
  - That is what both new kernels predict. The head kernel's cells are the twin's, so the logits are the same bits.
  - `k_apply_fast` sums in `k_apply`'s order, so it writes the same image from them.
  - It is a stronger result than D2 asks for: on these 24 images the new apply is not merely within APPLY_TOL of
    the old one; it is identical.
- **Reported, not a criterion:** a 64 x 64 image took 363-476 ms here (median 427), with read-back. Round 13 took a
  median of 408 ms and round 12 a median of 702. That is SwiftShader, a CPU, and no evidence for K1, B or C1.

**Still open:**
- K0 (b) and (c), K1, B, C1, and measurement A's three hypotheses, on Keith's two GPUs.
- That is one run each of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r14.json` on
  `claude/denoiser-round14`.

## 45. ROUND 14 -- REPORTED: THE GTX 1080; THE INTEL'S RUN NEVER REACHED ROUND 14

**What arrived.**
- **One report, from the GTX 1080:** `realGpuRun --only denoise` at 778e1f42, committed byte for byte at b617a22b as
  `render/denoise-rig-r14-gtx1080.json`.
- **A console log from the other box, the Intel's.** `git fetch origin claude/denoiser-round14` succeeded, but
  `git checkout claude/denoiser-round14` failed with "pathspec did not match": that clone fetches a named branch into
  FETCH_HEAD only.
  - So `realGpuRun` ran from the box's old checkout, which has no denoiser gates. `--only denoise` matched nothing, and
    that version still printed section 38's "NO ADAPTER WAS SEEN".
  - Its round-15 attempt failed the same way.
  - Section 43 repeats a run that did not reach the GPU, so the Intel is to run again, with commands that check out
    FETCH_HEAD. No report of the failed attempt exists to commit.

**The 1080's three gates.**

| Gate | Verdict | Time |
|---|---|---|
| exact (`denoiseDevice-selfcheck`) | green: K0 (b) natively and K0 (c) in the browser hold for r14 | 26 s |
| timing (`denoiseTiming-selfcheck`) | green | 124 s |
| compile (`denoiseCompile-selfcheck`, measurement A) | red, on one instrument row (below) | 187 s |

**K1 for r14 on the 1080 holds natively and in the browser.**

| Path | r14 against r12, device clock, by size (64 to 1024) | at the largest size both measured |
|---|---|---|
| native | 7.00, 7.82, 14.48, 15.22, 15.82 x | 15.82 x at 1024 x 1024 |
| browser | 8.83, 7.91, 14.58, 14.75, 15.01 x | 15.01 x at 1024 x 1024 |

- **Section 42's native failure is gone on this GPU.** Natively at 64 x 64, r14's head took 0.131 ms, where round 13's
  fast head took 23.0 ms. r14 reached 1080p natively, at 126.3 ms a pass.
- r13 in the browser: 9.69, 5.69, 11.40, 12.96 and 13.02 x. K1 holds for it here too.
- **At 1080p in the browser, r14 took 119.7 ms and r13 152.8 ms.** r14's head kernel was the slower head, at 41.5 ms
  against r13's 17.5. `k_apply_fast` was the faster apply, at 18.2 ms against 75.5.
- **C1 holds on the 1080:** `k_apply_fast` was 4.16 times faster than `k_apply` in the browser at 1080p.

**Measurement A on the 1080: half read, for two reasons in the instrument.**
- **No native time was recorded.** Every native child exited 0, Dawn's dump on its stdout, and no result line: on Windows
  a `process.exit()` right after the last `console.log` can end the process before a pipe write lands.
  - The gate's "built or said why" row counted each silent child as a kernel that said why, so it stayed green.
- **The red row was an instrument row.** It tested `findDxc` against a forward-slash path while `path.join` backslashes
  on Windows, so it is red on win32 only. And `findDxc` found no DXC on this box, so **A1 is untested on the 1080.**
- **Both fixed on `claude/denoiser-round14` before the Intel's run:**
  - the child writes its result to a file;
  - a child that ends without a result is a red row;
  - `findDxc` compares normalized paths and also searches Playwright's own Chromium builds;
  - sabotages X1 and X2 are each 1 red.
- **What the native dumps did record:** every kernel natively was compiled by FXC (DXBC).
  - round 13's fast head: 9,785 lines of DXBC;
  - round 14's head kernel: 97 lines;
  - `k_apply`: 85 indexable-temp lines, its private array of 81 in memory;
  - `k_apply_fast`: none.
- **The hypotheses, as section 43 fixed them:**
  - A2 and A3 read FXC's times off the compile gate, and it recorded none. Both are **unread on the 1080**.
  - The timing ladder's own native split points the same way as A2, but it is not A2's source: at 64 x 64 the head
    kernel took 0.131 ms and round 12's direct head 0.393.
  - The exact gate took 26 s here (round 13's took 498 s on the Intel). So natively on the 1080, no pipeline took
    minutes.
- **In Chrome at 64 x 64:**
  - every kernel built in 31-101 ms;
  - the fast 3 x 3 pass took 0.103 ms against the tiled kernel's 1.389;
  - the head kernel took 0.180 ms, against the fast head's 0.078 and the direct head's 0.604;
  - `k_apply_fast` took 0.127 ms and `k_apply` 0.129.

**Nothing moves yet.** Section 43's page rule needs both GPUs in the browser, and its default rule needs every GPU and
path. The Intel has neither.

## 46. ROUND 15 -- THE HEAD AND THE KERNEL APPLY IN ONE PASS: FIXED BEFORE ANY GPU RUNS IT

**Section 45 is held for round 14's verdict.** Keith's two round-14 rig runs were in progress while this section was
written, and neither report had been read. Nothing below was chosen from them. Round 14's reports and section 45 go on
`claude/denoiser-round14`, and that branch is merged here.

**Why this round.** In round 13's 1080p frame in Chrome on the 1080, the head took 17.4 ms and `k_apply` took 75.3 ms,
out of 150.4. On the Intel at 1024 x 1024 they took 140.7 ms and 368.3 ms, out of 1,294.5.
- Round 14 writes the head's 81 logits to storage, planar, and `k_apply_fast` reads them back in each of its three
  loops.
- At 1080p that buffer is 672 MB, the largest the pass allocates. It is written once and read three times a frame.
- This round keeps the logits in the thread that computes them.

**Built and piloted here first, on SwiftShader only:**
- r15's image was r14's, bit for bit, on the shipped network at 64 x 64 and 21 x 19, and on the exact gate's synthetic
  networks.
- The fused pass was within 5e-7 of its twin.
- The order probe (below) passed as built, at 5.0e-7. With the head's sum reversed it read 1.28e-1.
- SwiftShader's times are a CPU's, and no threshold below was chosen from them.

**What changes.**
- **`render/denoiseDevice.mjs`: `kernelHeadApplyWgsl`,** entry `k_head_apply`. It is the head and the kernel apply in one
  pass:
  - Each pixel's 81 logits are 21 named vec4 accumulators. Each lane is one cell, added b then ci in order: `k_head`'s
    sum, so the twin's.
  - The 81 taps are unrolled, so a tap's logit is a named lane, never an index into a private array.
  - Which taps are weighed is decided once, as `k_apply_fast` decides it.
  - Then `k_apply_fast`'s three sums run in its order, over the same 16 x 16 halo in workgroup memory.
- **The r15 set:** r13's fast kernel for the hidden layers, then `k_head_apply` for the last layer when it is the 1 x 1
  head of 81 logits. There is no separate apply pass and no logit buffer.
- **`judgeHeadApply`:** the fused pass's image against `kernelApplyCpu` on the head's twin logits and on its fused
  mirror's, both from the device's own input to the head. A value passes within `APPLY_TOL` of either.
- **`passBytes`:** the storage a pass allocates per set. At 1080p that is 1,756 MiB for r14 and 1,115 MiB for r15.
- **`render/denoiseCompile.mjs`: the order probe, and an eighth kernel for measurement A.** The probe is a head whose
  products are exact in f32 and whose sums are not:
  - every input is 1 + i/64, and every weight is 8192 + j/8, with j from -4 to 4;
  - so the twin's logits and the fused mirror's are the same bits;
  - adding in another order moves a logit by up to 0.19, which on the CPU pushes 99.9% of the image's values past
    `APPLY_TOL`.

  So **an image within `APPLY_TOL` on the probe says the head added in the twin's order**, whatever the compiler does
  with multiply-adds.
- **The ladders:**
  - the page times r12, r13, r14 and r15, with a 300 s budget (four sets take turns);
  - natively it times r12, r14 and r15, with 600 s;
  - each size's line gives each set's buffers, and r15's merged pass against r14's head plus `k_apply_fast`.
- **`tools/denoiseDevice.mjs --measure-r15`:** K0 (a) on round 11's 24 test images.

**What exactness means for r15, said before it is measured.** The head's cells are never stored, so they cannot be
judged one by one; on the 24 images that is 7,962,624 of section 44's 20,545,536 cells. What holds them instead:
- the image (D2 below);
- the order probe;
- the exact gate's row that, where no cell of r14 or r15 fused, r15's image is r14's bit for bit.

**K0 for r15 holds** when every one of these holds:
- the hidden layers: every cell the twin's or the fused mirror's, given the device's own input (D1);
- the fused pass: its image within `APPLY_TOL` of `kernelApplyCpu` on the twin's logits or the fused mirror's, from the
  device's own input to the head (D2);
- the order probe: within `APPLY_TOL` wherever it runs.

It must hold in each of:
- **(a) here:** `node tools/denoiseDevice.mjs --measure-r15` on round 11's 24 test images, with D0-D3, its output
  committed before it is read;
- **(b) natively on both GPUs:** the exact gate's r15 rows and its order probe, and the compile gate's native rows;
- **(c) in the browser on both GPUs:** the exact gate's browser section, and the compile gate's browser rows.

**Reported, deciding nothing:**
- **E, the same image.** Where no cell of either set fused, r15's image is r14's bit for bit (the exact gate). Here,
  the device's relMSE on each of the 24 images equals section 44's.
- **F1, the merged pass.** In the browser on each GPU, r15's head-and-kernel pass is at least 1.25 times faster than r14's
  head plus `k_apply_fast`, at the largest size both measured.
- **F2, the whole pass.** r15 against r14, on each GPU and path, at the largest size both measured.
- **F3, the memory.** `passBytes` at each size. It is arithmetic, not a measurement.

**The rules, each applied to round 15's run alone.** Round 15's run times every set the rules can choose, so section
43's rules decide from round 14's run (section 45) and these from round 15's; the later run's decision stands.
- **K1 for a set:** section 39's rule against r12, on the device's clock: at least 2 times at the largest size both
  measured, and at least 1 time at every size both measured.
- **`PAGE_KERNELS`** (section 43's rule B, with r15 added):
  - A set of r13, r14 and r15 qualifies when K0 and K1 hold for it on both GPUs in the browser.
  - Of the qualifying sets, the page takes the one whose smaller speedup across the two GPUs is largest.
  - A tie goes to the later round's set. If none qualifies, it is "r12".
- **`DEFAULT_KERNELS`** (section 39's rule, with r15 added):
  - A set of r14 and r15 qualifies when K0 holds for it everywhere, and K1 on every GPU and path, native and browser.
  - Of the qualifying sets, the default takes the one whose smallest speedup across every GPU and path is largest.
  - A tie goes to r15. If none qualifies, it is "r12".

**On the rig.**
- **One run per GPU** of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r15.json`, on
  `claude/denoiser-round15`, at a commit carrying this round's code.
- **A gate stopped by `realGpuRun`'s 30-minute cap reaches no verdict on its path.** K0 or K1 is then untested there,
  and no rule that needs it can move.
- **Each report is committed byte for byte.** A run is repeated only if it did not reach the GPU, and then both reports
  are committed.

**Not in this round.**
- Kernels that reorder a cell's sum.
- Lower precision.
- A smaller network.
- Reusing the hidden layers' buffers (ping-pong), which would change what the exact gate can read back.
- Node on DXC by default: section 43's A1 decides whether that is a round.

## 47. ROUND 15 -- REPORTED HERE: K0 (a), THE r15 SET ON THE 24 TEST IMAGES

`node tools/denoiseDevice.mjs --measure-r15 --cache <dir>` ran at 8e2d749e, the commit that carries section 46 and
`k_head_apply`. It was one run of 764 s, ending 21:09:29Z.
- Its output, unedited, is `render/denoise-results-r15.json`, committed at 6c2691d9 before it was read.
- The cache served all 24 test images (hits 24, misses 0). It was hard-linked from round 12's measurement cache.
- On every image the four hidden layers ran on the fast kernel, and the head and the kernel apply ran as one pass,
  `k_head_apply`.

**K0 (a) holds.**

| Criterion | Result |
|---|---|
| D0, the shipped file is the harvest's network | its f64 relMSE equals round 11's seed 1 on all 24 images, bit for bit |
| D1, the hidden layers | 12,582,912 conv cells, every one the twin's: none fused, none unexplained. The head's 7,962,624 are never stored (section 46) |
| D2, the head and kernel pass | worst 4.9e-7 relative to `kernelApplyCpu` on the twin's logits or the fused mirror's (bound 1e-5); against the twin's alone 6.4e-7, against the mirror's alone 7.6e-7 |
| D3, the verdict on the device | relMSE within 3.8e-7 of the f64 network's on every image (bound 1e-4). The primary filter is beaten on 12 of 12 images of R and 12 of 12 of C, the same images as on the CPU |

- **E: the device's relMSE equals section 44's, bit for bit, on all 24 images,** and so rounds 12's and 13's.
  - Against the twin's logits alone, the worst value is round 14's D2 to the digit, 6.4e-7.
  - That is what an identical image predicts: on SwiftShader nothing fuses, so `k_head_apply`'s logits are `k_head`'s
    bits, and it sums them in `k_apply_fast`'s order.
- **Reported, not a criterion:** a 64 x 64 image took 365-515 ms here (median 399), with read-back, against round 14's
  median of 427. That is SwiftShader, a CPU, and no evidence for K1, F1 or F2.

**Still open:**
- K0 (b) and (c) for r15, K1, F1-F2 and the two rules, on Keith's two GPUs.
- That is one run each of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r15.json` on
  `claude/denoiser-round15`.
- Section 45, round 14's verdict, is still held for its two reports.

## 48. ROUND 15 -- REPORTED: THE GTX 1080

**What arrived.** One report, from the GTX 1080: `realGpuRun --only denoise` at 4da876c3, committed byte for byte at
e1230aec as `render/denoise-rig-r15-gtx1080.json`. The Intel's attempt never checked round 15 out (section 45), and
it is to run again.

**The 1080's three gates.**

| Gate | Verdict | Time |
|---|---|---|
| exact | green: K0 (b) natively and K0 (c) in the browser hold for r15 and for r14 | 91 s |
| timing | green | 249 s |
| compile (measurement A) | red, on section 45's instrument row; its native half recorded no result, the same Windows fault | 197 s |

- Every r15 row of the exact gate passed natively and in the browser: the hidden layers cell for cell; the fused pass
  through its image; the order probe; the bias-plus-100 row; the no-mask row.
- **The order probe also passed in Chrome,** in the compile gate's browser half: 6.26e-7 against the twin's logits.
  - So on this GPU, natively and in the browser, the head inside `k_head_apply` added in the twin's order.
  - The same-bits row passed natively too. The report does not say whether any cell fused there, and so whether the
    row was binding.

**K1 for r15 on the 1080 holds natively and in the browser.**

| Path | r15 against r12, device clock, by size (64 to 1024) | at the largest size both measured |
|---|---|---|
| native | 4.31, 10.46, 23.51, 18.24, 26.16 x | 26.16 x at 1024 x 1024 |
| browser | 11.45, 11.34, 23.65, 24.27, 24.50 x | 24.50 x at 1024 x 1024 |

In the same run, r14 against r12 was 15.80 x natively and 15.11 x in the browser at 1024 x 1024, and r13 13.07 x in the
browser. So K1 holds for every set on this GPU.

**The reported measures.**
- **F1 holds on the 1080.** In the browser at 1080p, r15's head-and-kernel pass took 19.8 ms. r14's head and
  `k_apply_fast` took 50.2 + 18.2 = 68.4 ms. That is **3.46 times** faster, against a bound of 1.25.
  - By size it was 2.27, 2.60, 3.96, 4.11, 3.76 and 3.46 times.
  - Natively it was 0.60, 3.00, 4.57, 4.69, 4.44 and 4.26 times. The one ratio under 1, at 64 x 64, is two coarse
    readings: 0.328 ms against 0.197, on a native clock that steps in 0.066 ms.
- **F2, the whole pass at 1080p:**

  | Path | r14 | r15 | r15 faster by |
  |---|---|---|---|
  | browser | 128.4 ms | 80.3 ms | 1.60 x |
  | native | 127.1 ms | 76.2 ms | 1.67 x |

  Round 13's 1080p frame in Chrome was 150.4 ms.
- **F3:** at 1080p r14 allocates 1,756 MiB and r15 1,115 MiB.
- **Where r15's 1080p frame goes in the browser:** the four hidden layers 60.4 ms (6.0 + 18.2 + 18.2 + 18.0), and the
  head and kernel 19.8. The hidden layers are now three quarters of the frame.
- **In Chrome at 64 x 64 on the probe:** `k_head_apply` built in 2,012 ms, where the other kernels built in 16-117 ms.
  Its pass took 0.072 ms. The unrolled taps cost compile time once per pipeline.
- **Natively, FXC compiled `k_head_apply`** to 4,954 lines of DXBC with no indexable temp. That is the unrolled logits
  staying in registers, as built.

**Nothing moves yet.** Section 46's rules need both GPUs, so they wait for the Intel's runs of rounds 14 and 15. On the
1080 alone, every candidate set qualifies, and r15 has the largest speedup on every path.

## 49. ROUND 14 -- THE VERDICT: K0 AND K1 HOLD ON BOTH GPUS; BY SECTION 43 THE PAGE GOES TO r13 AND THE DEFAULT TO r14

Sections 46-48 are round 15's, on `claude/denoiser-round15`. This is round 14's verdict, numbered after them because it
was written after them.

**What arrived.**
- **The Intel's report:** `realGpuRun --only denoise` at b617a22b, committed byte for byte at 7846e7e2 as
  `render/denoise-rig-r14-intel-gen9.json`.
  - That commit carries round 14's kernels and gates as the 1080 ran them.
  - It does not carry section 45's compile-gate fixes.
- **Measurement A's native half, from the fixed compile gate at 3c881f35.** That is round 15's commit, which carries
  round 14's seven kernels unchanged.
  - On the 1080: `--only denoiseCompile`, committed at 1c6f8cf2.
  - On the Intel: its round-15 run, committed at 1c6f8cf2.

**The Intel's three gates at b617a22b.**

| Gate | Verdict | Time |
|---|---|---|
| exact | green: K0 (b) natively and K0 (c) in the browser hold for r14 | 46 s |
| timing | green | 191 s |
| compile | red: section 45's `findDxc` row (not yet fixed at that commit), and the dump row under `use_dxc` (below) | 821 s |

**K0 for r14 holds:** (a) section 44, (b) and (c) the exact gates on both GPUs.
- Every r14 kernel the compile gate built was exact wherever it ran.
- **In Chrome on the Intel the head kernel fused 221,346 of its 331,776 cells, with none unexplained.** This is the
  first path in the arc where the fused mirror was the answer rather than a possibility.

**K1 for r14 holds on every GPU and path.**

| GPU | Path | r14 against r12, device clock, by size | at the largest size both measured |
|---|---|---|---|
| GTX 1080 | native | 7.00, 7.82, 14.48, 15.22, 15.82 x | 15.82 x at 1024 x 1024 |
| GTX 1080 | browser | 8.83, 7.91, 14.58, 14.75, 15.01 x | 15.01 x at 1024 x 1024 |
| Intel gen-9 | native | 6.50, 7.00, 6.86 x | 6.86 x at 256 x 256 |
| Intel gen-9 | browser | 5.68, 6.31, 6.33 x | 6.33 x at 256 x 256 |

On the Intel, r12 stops at 256 x 256 (the 1.5 s cap). r14 reached 1024 x 1024: 1,089.9 ms natively and 1,376.5 ms in
the browser.

**C1 holds on both GPUs.** `k_apply_fast` was 4.16 times faster than `k_apply` in the browser on the 1080 at 1080p, and
3.03 times on the Intel at 1024 x 1024 (127.6 ms against 386.9).

**Measurement A,** at 64 x 64, each kernel's build (wall clock) and pass (device clock). Native is as shipped, under FXC.

| Kernel | 1080 native | Intel native | Chrome pass, 1080 / Intel |
|---|---|---|---|
| round 12's tiled 3 x 3 | 393 ms / 1.114 ms | 410 ms / 7.406 ms | 1.389 / 7.434 ms |
| the fast 3 x 3 | 3,869 ms / 0.131 ms | 7,104 ms / 0.786 ms | 0.103 / 1.078 ms |
| round 12's direct head | 266 ms / 0.393 ms | 220 ms / 4.456 ms | 0.420 / 4.378 ms |
| the fast head | **152,398 ms / 22.610 ms** | **431,073 ms / 1,428.095 ms** | 0.078 / 0.450 ms |
| the head kernel | 121 ms / 0.131 ms | 115 ms / 1.376 ms | 0.175 / 1.349 ms |
| `k_apply` | 84 ms / 0.131 ms | 115 ms / 1.114 ms | 0.127 / 1.172 ms |
| `k_apply_fast` | 215 ms / 0.066 ms | 178 ms / 0.393 ms | 0.125 / 0.416 ms |

- **Section 42's failure, measured kernel by kernel.** Natively the fast head took 2.5 and 7.2 minutes to build. Its
  passes ran 290 and 3,170 times slower than in Chrome, in 9,785 lines of DXBC. The head kernel, 97 lines, removes it.
- **A1 is untested on both GPUs.**
  - DXC's two DLLs were found: on the 1080 in Playwright's chromium-1243, and on the Intel in Chrome 154. The
    `use_dxc` runs built and ran.
  - But every one of their dumps was empty. The child handed Dawn two `enable-dawn-features` entries, and dawn.node
    keeps the last, so `use_dxc` replaced `dump_shaders`. This was reproduced here with `allow_unsafe_apis`.
  - With no dump, no run says DXIL, and section 43 makes that untested. The gate's own dump row went red on both
    GPUs, as it is there to.
  - The `use_dxc` times match FXC's: the fast head took 146 s and 22.6 ms on the 1080, and 357 s and 1,420 ms on the
    Intel. That suggests DXC compiled none of them, but it is a suggestion, not A1.
  - **Fixed:** one entry (`dawnFlags`), its own row, and sabotage D1, 1 red.
- **A2 is supported on both GPUs.** Natively under FXC, the head kernel took 0.131 ms against the direct head's 0.393 on
  the 1080, and 1.376 against 4.456 on the Intel.
- **A3 is supported on the Intel and not on the 1080.** Building the fast 3 x 3 took 17.3 times longer than the tiled
  kernel on the Intel, and 9.84 times on the 1080, under the bound of 10.

**The rules (section 43, applied to round 14's runs).**
- **B, the page.** Both candidate sets qualify, with K0 and K1 in the browser on both GPUs. The smaller of each set's
  two speedups, at the largest size it and r12 both measured:

  | Set | GTX 1080 | Intel gen-9 | Smaller |
  |---|---|---|---|
  | r13 | 13.02 x | 6.45 x | 6.45 x |
  | r14 | 15.01 x | 6.33 x | 6.33 x |

  **`PAGE_KERNELS` becomes "r13".** On the Intel's browser at 256 x 256, r13 ran 82.4 ms against r14's 84.0. r14's
  head kernel was the slower head there, at 26.6 ms against 8.8.
- **The default:** K0 holds for r14 everywhere, and K1 on every GPU and path. **`DEFAULT_KERNELS` becomes "r14".**
- **Both are set in `render/denoiseDevice.mjs` at this commit.** The exact gate's rows that meant round 12's kernels now
  name them, instead of reading the default. Sabotages V1 (the default left at r12) and V2 (the page given r14) are
  each 1 red.
- **Round 15's run times every set again, and section 46's rules read it.** The later run's decision stands (section
  50).

## 50. ROUND 15 -- THE VERDICT: K0 AND K1 HOLD ON BOTH GPUS; BY SECTION 46 THE PAGE AND THE DEFAULT BOTH GO TO r15

**What arrived.**
- **The Intel's report:** `realGpuRun --only denoise` at 3c881f35, committed byte for byte at 1c6f8cf2 as
  `render/denoise-rig-r15-intel-gen9.json`.
  - That commit carries round 15's kernels and gates, and section 45's compile-gate fixes.
  - It does not carry section 49's Dawn-flags fix.
- The 1080's round-15 report is section 48's.

**The Intel's three gates at 3c881f35.**

| Gate | Verdict | Time |
|---|---|---|
| exact | green: K0 (b) natively and K0 (c) in the browser hold for r15 and r14; r13 in the browser | 174 s |
| timing | green | 457 s |
| compile | red on one row only: the `use_dxc` dumps were empty (section 49's fault, fixed after this commit) | 896 s |

**K0 for r15 holds:**
- (a) section 47;
- (b) natively, the exact gates on both GPUs: the hidden layers cell for cell, the fused pass through its image, the
  order probe, the bias-plus-100 row and the no-mask row;
- (c) in the browser, the exact gates' browser sections on both GPUs.

The compile gate agrees wherever it measured `k_head_apply` on the probe:

| Where | Worst against the twin's logits |
|---|---|
| 1080, native, FXC and `use_dxc` | 6.26e-7 |
| 1080, Chrome | 6.26e-7 |
| Intel, native, FXC and `use_dxc` | 5.45e-7 |
| Intel, Chrome | 5.45e-7 |

- In Chrome on the Intel, round 14's head kernel fused most of its cells (section 49). The probe's products are exact,
  so fusing cannot move its logits, and its image says the head inside `k_head_apply` kept the twin's order there too.

**K1, every set against r12, round 15's runs, on the device's clock, at the largest size each set and r12 both measured.**

| GPU | Path | r13 | r14 | r15 | size |
|---|---|---|---|---|---|
| GTX 1080 | native | not timed | 15.80 x | 26.16 x | 1024 x 1024 |
| GTX 1080 | browser | 13.07 x | 15.11 x | 24.50 x | 1024 x 1024 |
| Intel gen-9 | native | not timed | 6.87 x | 10.76 x | 256 x 256 |
| Intel gen-9 | browser | 6.49 x | 6.33 x | 9.25 x | 256 x 256 |

Every set is at least 1 time at every size both measured. On the Intel, r15 against r12 was 8.92, 10.52 and 10.76 times
natively, and 8.05, 9.98 and 9.25 in the browser.

**The reported measures.**
- **F1 holds on both GPUs.** In the browser, r15's head-and-kernel pass against r14's head plus `k_apply_fast`, at the
  largest size both measured:
  - the 1080 at 1080p: 3.46 times;
  - the Intel at 1024 x 1024: **6.25 times** (90.6 ms against 442.7 + 123.7).
  - Natively: 4.26 and 8.75 times.
- **F2, the whole pass, r15 against r14:**

  | GPU | Size | Browser | Native |
  |---|---|---|---|
  | GTX 1080 | 1080p | 1.60 x | 1.67 x |
  | Intel gen-9 | 1024 x 1024 | 1.55 x (887.9 ms against 1,378.1) | 1.75 x (652.0 ms against 1,138.6) |

  Natively on the Intel, r15 reached 1080p at 1,283.8 ms, where r14 stopped (predicted 2,253 ms).
- **F3:** 1,115 MiB at 1080p against r14's 1,756.
- **Building `k_head_apply` costs seconds.** Natively under FXC it took 9.1 s on the 1080 and 20.9 s on the Intel; in
  Chrome 1.4 s and 2.9 s. That is the unrolled taps, paid once per pipeline. Its pass on the probe, natively, took
  0.131 and 0.393 ms.

**The rules (section 46, applied to round 15's runs).**
- **The page:** r13, r14 and r15 all qualify, with K0 and K1 in the browser on both GPUs. Their smaller speedups across
  the two GPUs are 6.49, 6.33 and **9.25** times. **`PAGE_KERNELS` becomes "r15".**
- **The default:** r14 and r15 qualify, with K0 everywhere and K1 on every GPU and path. Their smallest speedups across
  every GPU and path are 6.33 and **9.25** times. **`DEFAULT_KERNELS` becomes "r15".**
- **This supersedes section 49's r13 and r14.** Section 46 fixed that the later run's decision stands.
- **Both are set in `render/denoiseDevice.mjs` at this commit.** The exact gate's r15 row now asserts them, and V3 and V4
  are each 1 red.

**Where the time goes now.**
- On the 1080, a 1080p frame in Chrome takes 80.3 ms, against 150.4 in round 13. Its four hidden layers take 60.4 ms.
- On the Intel, a 1024 x 1024 frame in Chrome takes 887.9 ms, against r13's 1,346.0 and r14's 1,378.1. Its four hidden
  layers take 787.0 ms, 89% of it.
- The head and the kernel apply are no longer where a frame's time goes. The hidden 3 x 3 layers are.

**Still open.** A1 is untested on both GPUs (section 49). With the Dawn flags fixed, one more run of the compile gate on
either GPU would test it, though it decides nothing.

## 51. ROUNDS 14 AND 15 -- THE INTEL'S SECOND RUNS: THE SAME DECISIONS

**What arrived.** Keith ran both rounds on the Intel again, on request. Both reports are committed byte for byte beside
the first runs:

| Round | Commit run | File | Committed at |
|---|---|---|---|
| 14 | 1a8eae2c (with section 45's fixes) | `render/denoise-rig-r14-intel-gen9-run2.json` | d4d49e4f |
| 15 | 1c6f8cf2 | `render/denoise-rig-r15-intel-gen9-run2.json` | ed3815f8 |

Neither commit carries section 49's Dawn-flags fix, so neither can test A1. Sections 49 and 50 were read off the first
runs, as sections 43 and 46 fixed. These repeats check them and decide nothing.

**Every gate verdict repeats.** The exact gates were green (42 s and 192 s), and so were the timing gates. Each compile
gate was red on its dump row only: the `use_dxc` dumps were still empty.

**Every decision repeats.** Each rule was re-run with the second run in place of the first.

| Round | Rule | First run | Second run |
|---|---|---|---|
| 14 | page: r13 against r14, on the smaller GPU | 6.45 against 6.33 x: r13 | 6.58 against 6.02 x: r13 |
| 14 | default: K1 for r14 on every GPU and path | holds: r14 | holds: r14 (6.59 x native, 6.02 x browser) |
| 15 | page: r13, r14, r15, on the smaller GPU | 6.49, 6.33, 9.25 x: r15 | 6.47, 6.24, 9.59 x: r15 |
| 15 | default: r14, r15, across every GPU and path | 6.33, 9.25 x: r15 | 6.24, 9.59 x: r15 |

**What the second runs add.**
- **The Intel's native half of measurement A was recorded on round 14's own commit this time.** Section 45's
  result-file fix worked there.
  - Under FXC, the fast 3 x 3 took 13.9 times longer to build than the tiled kernel (19.0 in round 15's repeat), so A3
    is supported again.
  - The head kernel took 1.376 ms against the direct head's 4.325, so A2 is supported again.
- **The fast head under `use_dxc`** took 414 s to build and 1,345 ms a pass, against FXC's 359 s and 1,252 ms. As
  before, that is FXC-like, but with no dump it is not A1.
- **F1 on the Intel:** r15's merged pass was 6.87 times faster than r14's two in the browser at 1024 x 1024, and 10.40
  times natively.
- **F2 on the Intel:** the whole pass was 1.49 times faster in the browser and 2.05 times natively.
- **The box was busier for some of it, and the paired ratios held.** In round 14's repeat, r12's 64 x 64 pass in the
  browser took 44.2 ms against 30.0, and r14's native 1024 x 1024 took 1,807 ms against 1,090. The sets take turns on
  one device (section 39), and that is why the ratios barely moved.

**Still open:** A1. A compile-gate run at a commit with section 49's fix (5385886d or later on `claude/denoiser-round14`,
or 5b66968f or later here) would test it.

## 52. MEASUREMENT A1 ON THE INTEL: UNDER `use_dxc`, NODE-WEBGPU 0.6.0 STILL COMPILES WITH FXC

**What arrived.** `realGpuRun --only denoiseCompile` at 62d5e318 on the Intel, committed byte for byte at d3aab6a3 as
`render/denoise-rig-compile-intel-gen9.json`.
- This is the first compile-gate run with section 49's one-entry Dawn flags.
- The gate was **green**: every kernel built and exact, natively under both modes and in Chrome. Every native dump
  named its compiler.
- The 1080's run of the same is still to come.

**The `use_dxc` run compiled with FXC.**
- DXC's two DLLs were found in Chrome 154's directory and copied to `dist/win32-x64`. That is `dawn.node`'s own
  directory, checked here against the package. They were removed again afterwards.
- Even so, all eight `use_dxc` dumps say DXBC, and match FXC's line for line (the fast head: 9,785 lines).
- The times agree. Natively the fast head took 353 s to build and 1,330 ms a pass under `use_dxc`, and 386 s and
  1,471 ms as shipped. In Chrome it took 0.448 ms.
- **By section 43's own words** ("if that run's dump says DXBC ... A1 is untested there"), **A1 is untested on the
  Intel**. This time the dump says why.

**Why, as far as the binary shows.** Read from the strings in the shipped `win32-x64/dawn.node`, not from Dawn's source,
so it is an inference, not a test.
- The build contains the `use_dxc` toggle, its description and Dawn's DXC compile path. The description reads: "Use DXC
  instead of FXC for compiling HLSL when both dxcompiler.dll and dxil.dll is available."
- It contains no reference to `dxcompiler.dll` or `dxil.dll` outside that description, and no `DxcCreateInstance`.
- The one compiler it names for loading is `d3dcompiler_47.dll`, with `D3DCompile` and `D3DDisassemble`.
- So in this build DXC is never "available", and the toggle can never take effect, wherever the DLLs sit.

**What follows.**
- **Section 43 named "node on DXC by default" as a possible next round. With node-webgpu 0.6.0 it is not a matter of
  copying two DLLs:** it would need a Dawn built to load DXC.
- **The native failure that started this question is fixed anyway, by the kernels, not the compiler.**
  - Round 14's head kernel took 1.376 ms natively under FXC, against the direct head's 4.391.
  - Round 15's fused pass took 0.393 ms.
  - Against these, the fast head's 1,471 ms.
- **The compile gate keeps its `use_dxc` mode.** A future package that does load DXC will show DXIL in its dump, and A1
  becomes testable then.
- **A2 and A3 again on the Intel:**
  - the head kernel took 1.376 ms against 4.391;
  - the fast 3 x 3 took 15.8 times longer to build than the tiled kernel;
  - `k_head_apply` took 18.4 s to build natively and 3.1 s in Chrome.

## 53. MEASUREMENT A1 ON THE GTX 1080: THE SAME -- FXC UNDER `use_dxc`, SO A1 IS UNTESTED ON BOTH GPUS

**What arrived.** `realGpuRun --only denoiseCompile` at 67094ee8 on the 1080, with section 49's one-entry Dawn flags.
It is committed byte for byte at bc0379dd as `render/denoise-rig-compile-gtx1080-run2.json`, beside the 1080's first
compile-only run.

**What it says.**
- The gate was **green**.
- DXC's DLLs came from Playwright's chromium-1243 and were placed beside `dawn.node`.
- All eight `use_dxc` dumps say DXBC and match FXC's line for line.
- The fast head took 146 s to build and 22.872 ms a pass under `use_dxc`, against 151 s and 22.544 ms as shipped, and
  0.072 ms in Chrome.

**The verdict.**
- **A1 is untested on both GPUs.** Each GPU's dump says DXBC, which section 43 makes untested. Section 52's reading of
  the shipped `dawn.node` explains why, the same on both: that build has no DXC loader.
- **A2 is supported again on the 1080:** the head kernel took 0.131 ms against the direct head's 0.393.
- **A3 is not supported on the 1080 again:** the fast 3 x 3 took 9.23 times longer to build than the tiled kernel,
  under the bound of 10. With section 49's 9.84, that makes two 1080 readings under the bound, against four Intel
  readings over it, from 13.9 to 19.0.
- **`k_head_apply` on the 1080:** 8.7 s to build natively and 1.3 s in Chrome. Its pass on the probe took 0.131 ms
  natively and 0.072 ms in Chrome.

**Measurement A is now complete on both GPUs:**
- A1 is untested, and cannot be tested with node-webgpu 0.6.0;
- A2 is supported on both;
- A3 is supported on the Intel and not on the 1080.

None of it decides anything (section 43). The page and the default stay "r15" (section 50).

## 54. ROUND 16 -- THE HIDDEN LAYERS, SEVERAL PIXELS A THREAD: FIXED BEFORE ANY GPU RUNS IT

**Why this round.** Section 50 found where a frame's time goes after round 15: the four hidden 3 x 3 layers.

| GPU | Path | Size | Whole pass | Hidden layers | Their GFLOP/s |
|---|---|---|---|---|---|
| GTX 1080 | browser | 1080p | 80.3 ms | 60.4 ms, 75% | 2,096: about 24% of the part's 8.9 TFLOP/s |
| GTX 1080 | native | 1080p | 76.2 ms | 60.7 ms, 80% | 2,086 |
| Intel gen-9 | browser | 1024 x 1024 | 887.9 ms | 787.1 ms, 89% | 81: about 20% of a 24-EU part's 0.4 TFLOP/s, if that is the part |
| Intel gen-9 | native | 1024 x 1024 | 652.0 ms | 589.6 ms, 90% | 109 |

The figures are read off `render/denoise-rig-r15-gtx1080.json` and `render/denoise-rig-r15-intel-gen9.json`.

In round 13's fast kernel a thread is one pixel and 32 output channels. For each tap and input channel it reads:
- one value from the tile in workgroup memory;
- eight vec4s of weights from the uniform block.

It then does eight vec4 multiply-adds, so every weight read feeds one pixel. This round gives a thread several pixels,
so each weight read feeds all of them.

**Built and piloted here first, on SwiftShader only:**
- **The new kernel was tested at px 1, 2 and 4 with 2, 4 and 8 vec4s of channels.** That covered 25 layer cases, on odd
  sizes, at 3 x 3 and 1 x 1, in one z group and in up to 11. Every cell was the twin's, plain.
- **r16a's and r16b's layers and images were r15's, bit for bit.** That held on the exact gate's networks, natively and in
  Chromium.
- **SwiftShader's times are a CPU's.** There, r16a's and r16b's hidden layers took 1.05-1.14 times less time than
  r15's, at 64 x 64 and 128 x 128. The tile kernels' native pipelines took 1.1 and 1.5 s to build, against the fast
  kernel's 0.5. No threshold below was chosen from these numbers.

**What changes.**
- **`brain/conv2d.mjs`: the pixel-tiled kernel.**
  - It is generated by `conv2dTileWgsl(layer, { px, g4 })`, entry `k_conv_tile`, with `tileShape`, `packTileUniforms` and
    `tileWorkgroups`.
  - **The threads.** A workgroup is still 8 x 8 threads, and covers 8 px x 8 pixels. Pixel p of a thread is column
    p x 8 + its own x, so neighbouring threads still read neighbouring words of the tile.
  - **The accumulators.** A thread keeps g4 vec4s of output channels for each of its px pixels, as named variables.
  - **The weights.** They are the fast kernel's uniform block, with its vec4s of channels padded to whole groups of g4.
  - **The edges.** A tap that every one of a thread's pixels can take runs one branch. At the image's edge, a guarded
    branch skips the tap for each pixel it falls outside.
- **Two sets.** Each runs r15's `k_head_apply` for the last layer, and every other layer on the new kernel when it fits.
  If it does not fit, the layer runs r15's kernel for it.
  - **r16a ("tile2"):** 2 pixels x 8 vec4s (32 channels) a thread, so the network's 32 channels are one z group. For each
    tap and input channel a thread reads 2 tile values and 8 weight vec4s, and does 16 vec4 multiply-adds.
  - **r16b ("tile4"):** 4 pixels x 4 vec4s (16 channels) a thread, so the 32 channels are two z groups. It reads 4 and
    4, and does 16 multiply-adds. Each group loads its own tile.
- **The ladders.** Natively and on the page, the sets taking turns are now r12, r15, r16a and r16b (`TIMED_SETS`).
  - r12 stays first, the reference every speedup is read against.
  - r13 and r14 are decided (sections 49 and 50) and left out.
  - The budgets stay 600 s natively and 300 s on the page.
  - Each size's lines add r16a's and r16b's whole pass and four hidden layers against r15's.
- **Measurement A** adds the new kernel at both configurations on round 13's 32 -> 32 layer: `r16a-tile2-3x3` and
  `r16b-tile4-3x3`.
- **`tools/denoiseDevice.mjs --measure-r16a` and `--measure-r16b`:** K0 (a) on round 11's 24 test images.

**What exactness means for r16a and r16b, said before it is measured.**
- **Not one cell's order moves.** Each accumulator still adds b, then block by block, ky, kx (in bounds), then ci: the
  order `conv2dCpu` adds in.
- **A thread's pixels interleave their adds with each other's.** They are different cells, which is free (section 39).
- **So every hidden cell is held to the twin or the fused mirror, at zero,** given the device's own input to its layer.
- **The last pass is r15's,** judged through the image (section 46).

**K0 for r16a or r16b holds** when every one of these holds:
- **the hidden layers:** every cell the twin's or the fused mirror's, given the device's own input (D1);
- **the head and kernel pass:** within `APPLY_TOL`, as section 46's D2;
- **the order probe:** within `APPLY_TOL` wherever it runs. It runs the same `k_head_apply` as r15.

It must hold in each of:
- **(a) here:** `node tools/denoiseDevice.mjs --measure-r16a`, then `--measure-r16b`, on round 11's 24 test images,
  with D0-D3. Each output is committed before it is read.
- **(b) natively on both GPUs:** the exact gate's r16a and r16b rows, and the compile gate's native rows for the new
  kernel.
- **(c) in the browser on both GPUs:** the exact gate's browser section, and the compile gate's browser rows.

**Reported, deciding nothing:**
- **E, the same image.** Where no cell of r15 or the r16 set fused, the set's every hidden layer and its image are r15's,
  bit for bit (the exact gate). Here, the device's relMSE on each of the 24 images equals section 47's.
- **G1, the hidden layers.**
  - What is measured: r16a's and r16b's four hidden layers against r15's, on each GPU and path, on the device's clock,
    at the largest size both measured.
  - The prediction, said now and reported either way: on each GPU in the browser, the faster of the two is at least
    1.3 times as fast as r15's.
- **G2, the whole pass.** Each r16 set against r15, on each GPU and path, at the largest size both measured.
- **G3, the build.** The new kernel's pipeline build, natively under FXC and in Chrome, against the fast kernel's, from
  measurement A's rows. In the default set a slow native build is paid once per pipeline. It is reported, as section
  50 reported `k_head_apply`'s.
- **G4, the throughput.** Each set's hidden-layer GFLOP/s, per GPU and path. `passBytes` is the same for all three
  sets: the tile changes no buffer.

**The rules, each applied to round 16's run alone.** Round 16's run times every set these rules can choose. Section
46's rules decided from round 15's run (section 50), and these decide from round 16's. The later run's decision stands.
- **K1 for a set:** section 39's rule against r12, on the device's clock.
  - At least 2 times at the largest size both measured.
  - At least 1 time at every size both measured.
- **`PAGE_KERNELS`** (section 46's rule, over round 16's sets):
  - A set of r15, r16a and r16b qualifies when K0 and K1 hold for it on both GPUs in the browser.
  - Of the qualifying sets, the page takes the one whose smaller speedup across the two GPUs is largest.
  - A tie goes to the later set, in the order r15, r16a, r16b.
  - If none qualifies, it is "r12".
- **`DEFAULT_KERNELS`** (section 46's rule, over the same sets):
  - A set of r15, r16a and r16b qualifies when K0 holds for it everywhere, and K1 on every GPU and path, native and
    browser.
  - Of the qualifying sets, the default takes the one whose smallest speedup across every GPU and path is largest.
  - A tie goes to the later set, as above.
  - If none qualifies, it is "r12".

**On the rig.**
- **One run per GPU** of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r16.json`, on
  `claude/denoiser-round16`, at a commit carrying this round's code.
- **A gate stopped by `realGpuRun`'s 30-minute cap reaches no verdict on its path.** K0 or K1 is then untested there,
  and no rule that needs it can move.
- **Each report is committed byte for byte.** A run is repeated only if it did not reach the GPU, and then both reports
  are committed.

**Not in this round.**
- Kernels that reorder a cell's sum: splitting a cell's channels across threads, Winograd, or a matrix unit's
  accumulation order.
- Lower precision, subgroups, or a smaller network.
- Reusing the hidden layers' buffers (ping-pong).
- A third pixel configuration chosen after either GPU's run. A configuration the rig suggests is a later round, fixed
  before it runs.

## 55. ROUND 16 -- REPORTED HERE: K0 (a), r16a AND r16b ON THE 24 TEST IMAGES

`node tools/denoiseDevice.mjs --measure-r16a --cache <dir>` and `--measure-r16b --cache <dir>` ran at 4b8e9d92, the
commit that carries section 54 and the pixel-tiled kernel. They ran side by side:

| Set | Run | Ended |
|---|---|---|
| r16a | 545 s | 04:22:05Z |
| r16b | 599 s | 04:22:59Z |

- **The outputs, unedited,** are `render/denoise-results-r16a.json` and `render/denoise-results-r16b.json`. Both were
  committed at 242a7e1c before either was read.
- **Each cache served all 24 test images** (hits 24, misses 0). Each was hard-linked from round 12's measurement cache.
- **The kernels:** on every image the four hidden layers ran on the pixel-tiled kernel, tile2 for r16a and tile4 for
  r16b. The head and the kernel apply ran as one pass, `k_head_apply`.

**K0 (a) holds for both sets.**

| Criterion | r16a | r16b |
|---|---|---|
| D0, the shipped file is the harvest's network | its f64 relMSE equals round 11's seed 1 on all 24 images, bit for bit | the same |
| D1, the hidden layers | 12,582,912 conv cells, every one the twin's: none fused, none unexplained | the same |
| D2, the head and kernel pass | worst 4.9e-7 against `kernelApplyCpu` on the twin's logits or the fused mirror's (bound 1e-5); against the twin's alone 6.4e-7, against the mirror's alone 7.6e-7 | the same, to the digit |
| D3, the verdict on the device | relMSE within 3.8e-7 of the f64 network's on every image (bound 1e-4); the primary filter beaten on 12 of 12 images of R and 12 of 12 of C, the same images as on the CPU | the same |

- **E: on all 24 images, each set's device relMSE equals section 47's (r15's), bit for bit.** It therefore equals rounds
  12-14's too. D2 and D3 are section 47's to the digit.
  - That is what an unchanged order predicts. On SwiftShader nothing fuses, so every hidden cell is the twin's in both
    sets, and in r15 too.
  - The images are therefore the same bits.
- **Reported, not a criterion.** A 64 x 64 image took a median of 417 ms (364-596) with r16a and 418 ms (306-524) with
  r16b, read-back included, against r15's 399 in section 47.
  - The two ran at the same time on one CPU, and r15 ran alone.
  - This is SwiftShader, and no evidence for K1 or G1-G4.

**Still open:**
- K0 (b) and (c) for r16a and r16b, K1, G1-G4 and the two rules, on Keith's two GPUs.
- That is one run each of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r16.json` on
  `claude/denoiser-round16`.
- Until section 54's rules move them, the page and the default stay "r15" (section 50).

## 56. ROUND 16 ON THE RIG: EVERY GATE STOPPED AT 30 MINUTES ON BOTH GPUS -- NO VERDICT, AND A BUILD PROBE FIXED BEFORE IT RUNS

**What arrived.** One `realGpuRun --only denoise` report from each GPU, both at 362bd22d. They are committed byte for
byte at f857fd46:
- `render/denoise-rig-r16-gtx1080.json`;
- `render/denoise-rig-r16-intel-gen9.json`.

**What they say.**
- **All three denoiser gates were stopped at `realGpuRun`'s 30-minute cap on both GPUs:** compile, exact and timing,
  1,800 s each.
- **They are empty.** No gate printed a failing row or a measurement, except the compile gate's opening line naming
  the D3D12 compilers.
- **No adapter was logged.** These gates log one only when they open Chrome, or, in the timing gate, when the native
  ladder ends. So every gate was still in its native, node-webgpu part when it was stopped. The verdict line's "NO
  ADAPTER WAS SEEN" means that, not a missing GPU.
- **By section 54, a stopped gate reaches no verdict on its path. Nothing is decided by these runs.** The page and the
  default stay "r15" (section 50). Rerunning the same commit would end the same way, so it is not rerun.

**Where it stopped.**
- **The compile gate builds each kernel in its own process, capped at 15 minutes.**
  - Its first eight kernels built in about 3 minutes on the 1080 in round 15.
  - Its ninth is `r16a-tile2-3x3`, this round's kernel. So on the 1080, node-webgpu did not build the pixel-tiled
    kernel's pipeline in 15 minutes. It builds the fast kernel's in 3.7 s.
  - Everything else in the three gates that was new in round 16 builds the same kernel natively.
- **The stopped kernel's dump file, from the 1080, holds only Dawn's WGSL.** It is cut off at 8,192 bytes plus 81
  carriage returns: the child's output was block-buffered, and the rest was lost when the process was killed.
- **Dawn writes the generated HLSL and FXC's DXBC in one message, after the compile.** The fast kernel's dump from the
  same run shows that order.
- **So the dump cannot say whether Tint's HLSL step or FXC never finished.** Either way the pipeline was not built.
- **The fast kernel's dump does show what FXC is handed, and how:**
  - plain HLSL loops, with no unroll attributes;
  - compile flags `D3DCOMPILE_OPTIMIZATION_LEVEL0` and `D3DCOMPILE_IEEE_STRICTNESS`;
  - out came 537 lines of DXBC, with its six loops kept as loops and 42 temporaries.

**Two suspects.** The pixel-tiled kernel differs from the fast kernel in two ways:
- **the guarded copy:** a second copy of the channel loop for the image's edge, inside which each pixel's accumulators
  are updated under its own `if`;
- **the accumulators:** twice as many, 16 vec4s against 8.

**A kernel without the guarded copy: `edge: "zero"`.** `conv2dTileWgsl(layer, { px, g4, edge })` now takes `edge`.
- **"skip" is section 54's kernel, and the default.** Its WGSL is unchanged byte for byte: the generator gives the same
  text as at 362bd22d for every configuration tried.
- **"zero" adds every tap of an in-image row.** A tap outside the image adds the zero the tile holds there.
  - Adding a zero product is the skip except in the sign of a zero (sabotage P7).
  - `===` does not see the sign of a zero, and WGSL lets an implementation ignore it.
  - So "zero" is held to the same twin, cell for cell.
- **Piloted here, on SwiftShader only:**
  - every cell of every case was the twin's, and the edge-skip kernel's bits, with none differing even in the sign of a
    zero;
  - sabotage Z1, the tile's load no longer zeroing the taps left and right of the image, turns every edge-zero case red
    and no edge-skip case.

**The probe: `node tools/denoiseBuildProbe.mjs`.** It runs ten kernel shapes from `render/denoiseCompile.mjs`'s
`BUILD_PROBE`, each on round 13's layer at 64 x 64.
- **Natively, each in its own process, stopped at 180 s.** A shape the compiler cannot finish costs 180 s, not a run.
- **Then in Chrome,** each raced against the same 180 s.
- **Per shape:** whether it built, the build's time, one pass on the device's clock, whether every cell is the twin's
  or the fused mirror's, and the size of FXC's output.
- **The shapes, in order:**
  1. the fast kernel, the baseline;
  2. the candidates, all edge zero:
     - r16a's 2 pixels x 8 vec4s and r16b's 4 x 4 at 32 -> 32;
     - 2 x 4, the fast kernel's accumulator count;
     - r16a's and r16b's again on the first layer's 10 -> 32;
  3. the diagnostics, all edge skip: 1 pixel x 8 vec4s and 2 x 4, the guarded copy at the fast kernel's accumulator
     count;
  4. last, r16a's and r16b's kernels as section 54 shipped them.
- **On SwiftShader, here,** all ten built in 0.7-2.9 s, natively and in Chromium, and every one was exact. These are a
  CPU's times.

**What the probe's results may choose, fixed now, before it runs on either GPU.** The decisions are made separately for
r16a's configuration (2 pixels x 8 vec4s) and r16b's (4 x 4).
- **A shape "builds"** when, natively on both GPUs, it builds within the 180 s cap and is exact.
- **Section 54's kernel (edge skip) stays** if it builds.
- **Otherwise edge zero replaces it in that set,** if edge zero builds at both 32 -> 32 and 10 -> 32.
- **Otherwise that set leaves round 16:**
  - it is taken out of `TIMED_SETS` and out of section 54's rules;
  - what the probe shows goes to a later round, fixed before it runs.
- **Choosing nothing:** the diagnostic shapes (2 x 4 at either edge, and 1 x 8 at edge skip) and every Chrome row. They
  say what the compiler chokes on and whether Chrome's compiler shares it.
- **Then a fresh run decides.**
  - Any set whose kernel changes has its K0 (a) measured again here.
  - Both GPUs then run `realGpuRun --only denoise` again, at a commit carrying the choice.
  - Section 54's K0, K1, page and default rules decide from that run, unchanged.

**Before round 16 runs in full again, the instrument is mended so this cannot cost 90 silent minutes twice:**
- a gate the runner stops is reported as stopped, with the last lines it printed;
- a pipeline that does not build within a time limit becomes a named red row, not a hang.

## 57. ROUND 16 -- THE VERDICT: FXC BUILDS NO TILE SHAPE AT 32 INPUTS ON EITHER GPU; BY SECTION 56 BOTH SETS LEAVE THE ROUND

**What arrived.** One run of `node tools/denoiseBuildProbe.mjs` on each GPU, both at 7698a4cf. They are committed byte for
byte at ba3361db:
- `render/denoise-probe-r16-gtx1080.json`;
- `render/denoise-probe-r16-intel-gen9.json`.

**Natively: each shape in its own process, through node-webgpu's FXC, stopped at 180 s.**

| Shape | GTX 1080 | Intel gen-9 |
|---|---|---|
| fast kernel, 32 -> 32 (the baseline) | built in 3.5 s; 537 DXBC lines; pass 0.131 ms | built in 5.0 s; 537 lines; pass 0.786 ms |
| 2 px x 8 vec4s, edge zero, 32 -> 32 | stopped | stopped |
| 4 x 4, edge zero, 32 -> 32 | stopped | stopped |
| 2 x 4, edge zero, 32 -> 32 | stopped | stopped |
| 2 x 8, edge zero, 10 -> 32 | built in 144.8 s; 9,527 lines; pass 19.99 ms | stopped |
| 4 x 4, edge zero, 10 -> 32 | built in 37.7 s; 5,335 lines; pass 5.31 ms | built in 149.9 s; 5,335 lines; pass 206.4 ms |
| 1 x 8, edge skip, 32 -> 32 | stopped | stopped |
| 2 x 4, edge skip, 32 -> 32 | stopped | stopped |
| 2 x 8, edge skip (r16a's), 32 -> 32 | stopped | stopped |
| 4 x 4, edge skip (r16b's), 32 -> 32 | stopped | stopped |

Every shape that built was exact: every cell the twin's, none fused.

**Section 56's rule, applied.**
- **r16a's configuration (2 x 8).** Edge skip did not build on either GPU. Edge zero did not build at 32 -> 32 on either
  GPU. **r16a leaves round 16.**
- **r16b's configuration (4 x 4).** Edge skip did not build on either GPU. Edge zero built at 10 -> 32 on both, but not
  at 32 -> 32 on either. **r16b leaves round 16.**
- **So section 54's rules have no candidate.** The page and the default stay "r15" (section 50). **Round 16 is closed
  with no change to either.**

**What the diagnostic shapes say. They choose nothing.**
- **Neither suspect is the cause on its own.**
  - With one pixel, the fast kernel's accumulator count and the guarded copy (1 x 8, edge skip), it was stopped.
  - Without the guarded copy, at the fast kernel's accumulator count (2 x 4, edge zero), it was stopped too.
  - So what FXC chokes on is something every tile shape shares and the fast kernel does not.
- **The cost depends on the number of inputs, and the fast kernel's does not.**
  - At 10 inputs, two edge-zero shapes built; at 32, no tile shape did.
  - The two that built made 10 to 18 times the fast kernel's DXBC. The fast kernel's stays at 537 lines with its loops
    kept.
  - That points to FXC expanding the input-block loop for the tile kernel, as it does not for the fast kernel. This is
    not shown: the dumps of the two built shapes would show it.
- **The FXC-built tile kernels are far slower natively, not only slow to build.**
  - On 10 inputs, a third of the fast kernel's work, they ran 40 to 150 times slower on the 1080 (5.31 and 19.99 ms
    against 0.131 ms).
  - On the Intel, 4 x 4 at 10 inputs ran 260 times slower (206.4 ms against 0.786 ms).
  - So even a tile shape FXC builds is no use natively as written.

**The probe's Chrome half ran on SwiftShader, not on either GPU.**
- Both reports name the Chrome adapter "google / swiftshader".
- On Windows the browser harness's default flags ask for the SwiftShader adapter. `realGpuRun` hands its gates the hardware
  flags; the probe did not.
- So the Chrome rows say nothing about Chrome's D3D12 compiler, DXC, and section 56 gave them nothing to choose.
- The probe now launches Chrome with `realGpuRun`'s hardware flags and records them in its report.

**Carried out at this commit.**
- **`render/denoiseDevice.mjs`:** `KERNEL_SETS` is r12-r15 again, and `TIMED_SETS` is r12 and r15. The tile plumbing is
  gone from `kernelFor` and `createDeviceDenoiser`.
- **The gates:** the device gate's r16 rows, the timing gate's r16 lines and kinds, and the compile gate's two tile
  variants are removed. Each gate's round-16 sabotage log stays, marked as history.
- **`tools/denoiseDevice.mjs`:** `--measure-r16a` and `--measure-r16b` are removed. Their results, section 55's, stay
  committed.
- **`brain/conv2d.mjs` keeps the tile kernel and its edge option.**
  - `brain/conv2d-selfcheck.mjs` holds them on any adapter but D3D12, and on a D3D12 adapter says SKIP and why. Left as
    they were, its tile rows would have stopped a full Windows run as the denoiser gates were stopped.
  - The WGSL corpus's tile entry is compile-only, for the same reason.
  - `tools/denoiseBuildProbe.mjs` keeps its ten shapes, each under its cap.

**Not decided here; a later round's to fix before it runs.**
- Whether Chrome's DXC builds the tile kernel and runs it faster than the fast kernel. This could make a page-only set.
  The probe's Chrome half, now on the GPU, measures it: `node tools/denoiseBuildProbe.mjs --browser-only`.
- A tile kernel FXC can build. The two built shapes' dumps (`%TEMP%\swek-denoise-probe-dump-tile4-zero-10.txt` and
  `-tile2-zero-10.txt`) are where to look.
- Section 56's instrument mending: reporting a stopped gate with its last lines, and a time limit on native builds. It is
  carried to the next round that builds a new kernel natively.

## 58. ROUND 16 -- REPORTED: CHROME BUILDS EVERY TILE SHAPE AND RUNS NONE FASTER; WHAT FXC DOES WITH THEIR WEIGHTS

Round 16 is closed (section 57). This section reports measurements that decide nothing.

**What arrived.**
- **The probe's Chrome half on each GPU** (`--browser-only`, at 497e743f, with `realGpuRun`'s hardware flags):
  - `render/denoise-probe-r16-chrome-gtx1080.json` reports the adapter "nvidia / pascal";
  - `render/denoise-probe-r16-chrome-intel-gen9.json` reports "intel / gen-9".
- **Dawn's shader dumps** of the two tile shapes FXC built at 10 inputs in section 57's probes, from each GPU, under
  `render/denoise-probe-dumps/`. The Intel's 2 x 8 dump holds only the WGSL, because that build was stopped.
- All of it is committed byte for byte at e910f3f1.

**Chrome, through DXC, on the GPUs.**
- **Every shape built,** in 95-356 ms on the 1080 and 281-679 ms on the Intel.
- **Every shape was exact:** every cell the twin's, none fused.
- **One 64 x 64 pass on the device's clock.** Each tile shape is shown against the fast kernel at 32 -> 32:

| Shape | GTX 1080 | Intel gen-9 |
|---|---|---|
| fast kernel, 32 -> 32 | 0.103 ms | 1.092 ms |
| 2 x 8, edge zero | 0.138 ms, 1.34 x slower | 1.260 ms, 1.15 x slower |
| 4 x 4, edge zero | 0.189 ms, 1.83 x | 1.569 ms, 1.44 x |
| 2 x 4, edge zero | 0.218 ms, 2.11 x | 1.668 ms, 1.53 x |
| 1 x 8, edge skip | 0.410 ms, 3.96 x | 1.291 ms, 1.18 x |
| 2 x 4, edge skip | 0.438 ms, 4.24 x | 1.534 ms, 1.41 x |
| 2 x 8, edge skip (r16a's) | 0.589 ms, 5.69 x | 1.431 ms, 1.31 x |
| 4 x 4, edge skip (r16b's) | 0.686 ms, 6.63 x | 2.127 ms, 1.95 x |

- **No tile shape at 32 inputs was faster than the fast kernel on either GPU.**
  - Edge zero was faster than edge skip in five of the six pairs.
  - On the 1080 the gap was large: 0.138 against 0.589 ms at 2 x 8.
- **The 10-input shapes are not comparable to the fast kernel.** They do 10/32 of the fast kernel's work, and ran in 0.106
  and 0.186 ms on the 1080 and 0.480 and 0.526 ms on the Intel.
- **This is one small size.** At 64 x 64, most tile shapes launch half the fast kernel's workgroups, so on the 1080 these
  passes are partly a measure of how full the GPU is.
- **But the two shapes with the fast kernel's workgroup count were slower too:**
  - 2 x 4 edge zero: 2.11 and 1.53 times;
  - 1 x 8 edge skip: 3.96 and 1.18 times.
- **Whether a tile shape overtakes the fast kernel at 256 x 256 or 1080p is not measured.**

**FXC's code, from the dumps.** Both GPUs' dumps of the 4 x 4 shape have the same structure. They differ only in how Tint
wrote a few subtractions.
- **FXC unrolled nothing.** The kernel's six loops are all kept: the workgroup-memory zeroing, the input blocks, the
  tile load, ky, kx and the channel loop.
- **It declared 259 temporary registers (4 x 4) and 258 (2 x 8).** The fast kernel needs 42.
- **The cause is how it compiles a weight read.** The fast kernel reads a weight as one indexed operand,
  `CB0[1][r1.x + 0]`; its whole DXBC holds 11 `and` or `or` instructions. In the tile shapes, every weight read in the
  channel loop became a scan of the weight array:
  - compare the index with an element's position (`ieq`);
  - mask that element (`and`);
  - merge it into the result (`or`).
- **That comes to close to 500 steps a read:**

| Shape | Weight reads per channel step | `and` | `or` | `ieq` |
|---|---|---|---|---|
| 4 x 4 | 4 | 1,979 | 1,974 | 507 |
| 2 x 8 | 8 | 3,857 | 3,848 | 984 |

- **That explains the native passes in section 57,** 40 to 260 times the fast kernel's. With 32 inputs the weight array
  is 3.2 times as long, 2,304 vec4s against 720. That is consistent with FXC never finishing those builds. This is
  inferred, not shown.
- **What makes FXC do this is inferred, not shown.**
  - In every tile shape's HLSL, each weight read is first stored in a local, Tint's `float4 v_82 = asfloat(v_2[...])`,
    and then used for several pixels.
  - In the 1 x 8 shape it is stored and used once, and that shape was stopped too.
  - The fast kernel uses each read directly inside its multiply-add.
  - A tile kernel that reads every weight inline would test this.

**What this leaves for a later round. Nothing here is pre-registered.**
- Natively, the tile kernel as written cannot be used on D3D12 (section 57). An inline-weight version might build. That
  is untested.
- In Chrome, where nothing stops the build, it was slower than the fast kernel at the one size measured.
- So a round that returns to the tile kernel would first need its Chrome speed at the ladder's real sizes. The probe times
  only one 64 x 64 pass.

## 59. ROUND 17 -- TWO QUESTIONS, ONE PROBE: FIXED BEFORE IT RUNS ON EITHER GPU

**Why this round.** Section 58 left two questions, and Keith asked for both to be tried:
- **(2) Is the tile idea worth one more look?**
  - In section 58's dumps, every tile shape stored each weight read in a local, and FXC compiled each read into a scan of
    the whole weight array.
  - Does the tile kernel build under FXC when every pixel's multiply-add reads its weight itself, as the fast kernel's
    does?
  - And is any tile shape faster than the fast kernel in Chrome at a real size, not only at 64 x 64?
- **(3) Is the fast kernel itself faster written another way,** with every cell's order unchanged?

**What changes. Built and piloted here first, on SwiftShader only.**
- **`brain/conv2d.mjs`: `conv2dFastAltWgsl(layer, { reads, unroll })`,** with `fastAltShape` and `packFastAltUniforms`.
  It is the fast kernel's thread, bindings and dispatch, written two other ways:
  - **`reads: "vec4"`:** the tile holds a pixel's block of 8 channels as 2 vec4s, so a thread reads four channels in one
    load, then adds them a lane at a time, ci ascending.
  - **`unroll: true`:** within a block of 8 channels, every tap and channel is written out. The weights are packed block
    by block, so every weight read is `F.w[b][constant]`. Only the block index is clamped, and a weight read needs no
    loop counter and no index arithmetic of its own.
    - A tap outside the image is skipped by an `if`, as the fast kernel skips it with `continue`.
    - The loop over blocks stays a loop. Writing out all four of a 32-channel layer's blocks, 2,304 multiply-adds a thread,
      crashed SwiftShader's pipeline build here. One block, 576, builds.
- **`conv2dTileWgsl`'s `weights: "inline"`:** every pixel reads its weight where it uses it. "hoist" stays the default,
  byte for byte.
- **Every cell's order is unchanged:** b, then block by block, ky, kx (in bounds), ci. So every new shape is held to the
  twin, cell for cell. On SwiftShader every case was exact, and the fast kernel's bits:
  - 10 -> 32, 19 -> 11 (two whole blocks and a last of three), 13 -> 6, and 32 -> 81 in three groups;
  - each written out or not, f32 or vec4.
- **`render/denoiseCompile.mjs`:**
  - `BUILD_PROBE_R17`, seven shapes on round 13's 32 -> 32 layer:
    - the fast kernel;
    - vec4, written out, and both;
    - the tile kernel at 2 x 8 and 4 x 4 with edge zero and inline weights;
    - 1 x 8 with edge skip and inline weights, which is section 57's stopped 1 x 8 with its weights inline.
  - `measureSizes`, which builds a shape once and times it at each size, judging it at 64 x 64.
- **`tools/denoiseBuildProbe.mjs`:** `--probe r17` (the default) at `--sizes 64,256,1024`, natively, each shape in its own
  process stopped at 180 s, then in Chrome. `--probe r16` is section 56's.
- **The gates:**
  - `brain/conv2d-selfcheck.mjs` holds every new shape to the twin. On a D3D12 adapter its rows stand aside until this
    probe shows FXC builds them.
  - The corpus entry is compile-only.
  - Sabotages Q1-Q5: four red as built; Q4 0 red, as P7 was.
- **The pilot:** every shape built and was exact natively and in Chromium, at 64 and 128. Those times are a CPU's, and no
  threshold below was read from them.

**What the probe may choose, fixed now.**
- **A shape qualifies** when all three of these hold on both GPUs:
  1. **It builds natively within 60 s.** The gates build a kernel several times; the fast kernel took 3.5 and 5.0 s.
  2. **It is exact at 64 x 64,** natively and in Chrome.
  3. **At 1024 x 1024 in Chrome, its pass is at least 1.10 times as fast as the fast kernel's in the same probe,** on the
     device's clock.
- **The ranking.** The shapes that qualify are ranked by the smaller of their two GPUs' Chrome ratios at 1024. A tie goes
  to the later shape in the list.
- **Then a full run decides.**
  - At most the top two become round 17's sets: r15 with every hidden layer on the shape, or on the fast kernel where
    the shape does not fit.
  - They are built, gated and measured here (K0 (a)).
  - Then one `realGpuRun --only denoise` on each GPU decides by section 54's rules, unchanged: K0, K1 against r12, the
    page rule over r15 and the round-17 sets, and the default rule over every GPU and path.
- **If no shape qualifies,** round 17 ends. The page and the default stay "r15".
- **Reported, deciding nothing:**
  - every native build time and DXBC size;
  - the 256 x 256 ratios;
  - the native ratios at 1024. The default rule needs those in the full run, not here.

**On the rig.**
- **One run per GPU** of `node tools/denoiseBuildProbe.mjs --out denoise-build-probe-r17.json` on
  `claude/denoiser-round17`.
- **Each report is committed byte for byte** before it is read.

**Before a full run builds a new kernel natively,** section 56's instrument mending lands:
- a gate the runner stops is reported as stopped, with its last lines;
- a native build past a time limit is a named red row.

**Not in this round.**
- Kernels that reorder a cell's sum.
- Lower precision or subgroups.
- A third way of writing a kernel chosen after this probe's results: that is a later round.

## 60. ROUND 17 -- THE VERDICT: NO SHAPE QUALIFIES; THE PAGE AND THE DEFAULT STAY "r15"

**What arrived.**
- **Both GPUs' probe reports:** `node tools/denoiseBuildProbe.mjs` at 254436e5 (probe r17, sizes 64, 256 and 1024, the
  180 s cap), natively and then in Chrome with `realGpuRun`'s hardware flags (`--enable-unsafe-webgpu --use-angle=d3d11`):
  - `render/denoise-probe-r17-intel-gen9.json`: natively "intel / gen-9 / D3D12 driver version 31.0.101.2137", in Chrome
    "intel / gen-9";
  - `render/denoise-probe-r17-gtx1080.json`: natively "nvidia / pascal / D3D12 driver version 32.0.15.8180", in Chrome
    "nvidia / pascal".
- Both are committed byte for byte at 50fd55b8, before this section.
- Keith also sent another AI assistant's reading of the 1080's report. It is not a measurement and is not committed. It is
  weighed at the end of this section.

**Section 59's three conditions, shape by shape.** The baseline is the fast kernel in the same probe:
- natively it built in 5.16 s (Intel) and 3.45 s (1080);
- in Chrome at 1024 x 1024 its pass took 300.70 ms (Intel) and 9.059 ms (1080).

| Shape | 1. Native build within 60 s (Intel / 1080) | 2. Exact at 64 x 64 (natively / Chrome) | 3. Chrome at 1024 against the fast kernel (Intel / 1080) |
|---|---|---|---|
| fast, vec4 reads | 30.2 s / 17.8 s: yes | yes / yes | 1.46 x / **0.82 x: no** |
| fast, written out | **crashed / crashed** | not run / yes | 2.11 x / 0.57 x |
| fast, vec4 and written out | **crashed / crashed** | not run / yes | 1.47 x / 0.61 x |
| tile 2 x 8, edge zero, inline | **stopped at 180 s / stopped** | not run / yes | 1.14 x / 1.17 x |
| tile 4 x 4, edge zero, inline | **stopped / stopped** | not run / yes | 0.74 x / 0.97 x |
| tile 1 x 8, edge skip, inline | **stopped / stopped** | not run / yes | 0.98 x / 1.04 x |

- **No shape qualifies.**
  - The vec4 shape is the only one FXC built in time on both GPUs, and in Chrome at 1024 it was slower than the fast
    kernel on the 1080.
  - The 2 x 8 tile shape is the only one that passed the third condition on both GPUs. FXC built it on neither.
- **By section 59, round 17 ends. The page and the default stay "r15".** No set is added, and there is no full run. The
  instrument mending that section 59 required before a full run builds a new kernel natively is not needed this round.

**The native failures.**
- **Both written-out shapes crashed natively on both GPUs.** The child process ended with no result and nothing on stderr:
  - on the 1080, after 24.7 and 23.3 s, exit 3221225477 (0xC0000005, an access violation);
  - on the Intel, after 64.1 and 52.6 s, exit 3221226505 (0xC0000409, a fail-fast).
- **Where they crashed is not shown.** It could be FXC, the driver's compiler or Dawn. Dawn's dump of each run stayed in
  Keith's temp folder. It would show whether FXC returned its DXBC before the crash. It decides nothing.
- **Chrome built both in 1.2 to 4.4 s, and both were exact.** So the WGSL is valid and every cell's order is right. Only
  the native path cannot take it.
- **The written-out shapes write out one block of 8 channels:** 576 multiply-adds a thread. In section 59's pilot,
  SwiftShader built that and crashed on all four blocks. FXC crashed on the one block.
- **All three inline-weight tile shapes stopped at 180 s on both GPUs.** That includes the 1 x 8 shape, where each weight is
  read once.
  - Section 58's inferred trigger is refuted. FXC does not finish the tile kernel even when each multiply-add reads its own
    weight, as the fast kernel's does.
  - What stops it is not shown. A stopped build leaves no DXBC to read.

**Reported, deciding nothing.**
- **Native builds:**
  - the fast kernel: 5.16 / 3.45 s, 537 lines of DXBC, 6 loops;
  - vec4 reads: 30.2 / 17.8 s, 690 lines, 5 loops;
  - neither declares an indexable temporary.
- **Native ratios at 1024:** vec4 reads were 0.72 x on the Intel and 0.86 x on the 1080. So vec4 was slower natively too.
- **The 256 x 256 ratios,** against the fast kernel:

| Shape | Chrome, Intel | Chrome, 1080 | Natively, Intel | Natively, 1080 |
|---|---|---|---|---|
| vec4 reads | 1.23 x | 1.12 x | 0.98 x | 0.79 x |
| written out | 1.44 x | 0.49 x | crashed | crashed |
| vec4 and written out | 0.75 x | 0.74 x | crashed | crashed |
| tile 2 x 8, inline | 0.72 x | 1.26 x | stopped | stopped |
| tile 4 x 4, inline | 0.51 x | 1.01 x | stopped | stopped |
| tile 1 x 8, inline | 0.82 x | 1.17 x | stopped | stopped |

- **In Chrome, which way of writing the kernel is faster depends on the GPU.**
  - At 1024, written out was 2.11 x on the Intel and 0.57 x on the 1080. vec4 reads were 1.46 x and 0.82 x.
  - Every tile shape did better on the 1080 than on the Intel: 1 x 8 was 0.98 x on the Intel and 1.04 x on the 1080,
    4 x 4 0.74 x and 0.97 x.
  - Only the 2 x 8 tile shape was faster on both GPUs at 1024: 1.14 x and 1.17 x.
- **64 x 64 does not rank the shapes.** Their order there differs from their order at 1024 on both GPUs. For example, vec4
  reads in Chrome on the Intel were 0.90 x at 64 x 64 and 1.46 x at 1024. Section 58's single 64 x 64 pass could not have
  settled the tile question.

**The native device clock ticks in 65.536 µs.**
- **Every native pass time in both reports is a whole number of 65,536 ns.** On the 1080 at 64 x 64, the fast kernel's
  pass is 2 ticks and the vec4 shape's is 1. None of the 42 Chrome times is a whole number of ticks.
- **This fits Dawn's timestamp quantization being on in node-webgpu.** node-webgpu 0.6.0's binary names a
  `timestamp_quantization` toggle. That it is the cause is inferred: the engine neither sets nor reads it.
- **At 1024, every native pass is at least 136 ticks,** so a tick is under 1% and the ratios above stand.
- **At 64 x 64 on the 1080, a native pass is one or two ticks.** The vec4 shape's 2 x there is one tick against two, and
  means nothing.
- **`denoiseDevice`'s `gpu` time is one span a repetition,** from the first pass's start to the last pass's end. So its
  error is at most one tick a repetition, not one a pass. Whether that mattered at the ladder's smallest sizes in earlier
  rounds' native rows is not checked here.
- **Section 59's rule read only Chrome's times,** so none of this changes round 17.

**The other assistant's advice, weighed against the record.**
- **"Force DXC with `DAWN_FEATURES_ENABLE=use_dxc`, or `dawnToggles` in `requestDevice`."**
  - Sections 52 and 53 ran node-webgpu 0.6.0 with `use_dxc` on both GPUs, passed as node-webgpu takes Dawn's flags
    (`create(["enable-dawn-features=..."])`, as this probe passes `dump_shaders`). Both dumps still said FXC: that
    build loads no DXC.
  - node-webgpu's README puts Dawn's options in `create([...])`. Neither it nor the engine reads
    `DAWN_FEATURES_ENABLE` or a `dawnToggles` field. Not tried again.
- **"Unroll partially, a bounded chunk inside a normal loop."** That is what was built. The loop over blocks stays a loop,
  and one block of 8 channels is written out inside it. FXC crashed on that.
- **"vec4 is about 2 x faster; keep it as the production candidate."**
  - That 2 x is one clock tick against two.
  - At 256 and 1024, vec4 reads were slower natively on the 1080 (0.79 x, 0.86 x), and slower in Chrome at 1024 (0.82 x).
- **"FXC is an old 32-bit fxc.exe."** Dawn loads the D3D compiler as a library into the node process, which is x64 on both
  rigs.
- **The exit code for both rigs.** It quotes 3221225477, the 1080's. The Intel's is 3221226505.

**What this leaves for a later round. Nothing here is pre-registered.**
- **Natively on D3D12,** the fast kernel as written is still the only hidden-layer kernel that is both built in time and not
  slower.
- **A page-only set.** In Chrome, the 2 x 8 tile shape with inline weights was 1.14 and 1.17 x the fast kernel at 1024.
  Section 54's default rule covers every GPU and path, so a set used only in the page would need a rule of its own,
  fixed before it runs.
- **A kernel chosen by adapter in the page.** Writing the block out was 2.11 x on the Intel in Chrome and 0.57 x on the
  1080. No round has let the page choose a kernel by vendor.
- **A finer native clock.** Turning off the quantization natively would be an instrument change. It needs its own gate.

## 61. ROUND 18 -- THE PAGE CHOOSES ITS SET BY ADAPTER, FROM TWO CHROME-ONLY SETS; THE NATIVE CLOCK UNROUNDED: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 60 left three options for a later round, and Keith asked for all three:
1. **A set for the page only,** on round 17's 2 x 8 tile with inline weights: 1.14 and 1.17 x the fast kernel in Chrome
   at 1024, on both GPUs.
2. **The page choosing its kernel by GPU.** Writing a block out was 2.11 x on the Intel in Chrome and 0.57 x on the 1080.
3. **A native clock that is not rounded.** Every native time in round 17's probes was a whole number of 65,536 ns.

**What changes. Built and piloted here first, on SwiftShader only.**
- **Two sets in `render/denoiseDevice.mjs`,** each with r15's fused last pass (`k_head_apply`). Every other layer runs on
  the set's kernel when it fits, else on r15's kernel for it:
  - **"r18t":** brain/conv2d.mjs's pixel-tiled kernel at 2 pixels x 8 vec4s, edge zero, weights read where they are used.
    This is round 17's `tile2-zero-inline-32`. Its layers are named `tile_inline`.
  - **"r18u":** the fast kernel with a block of 8 channels written out, f32 reads. This is round 17's `fast-unroll-32`.
    Its layers are named `fast_unroll`.
  - `R18_KERNELS` holds each set's kernel and configuration.
- **Neither is built natively on D3D12.** node-webgpu's FXC stopped on r18t's kernel and crashed on r18u's (section 60).
  - `BROWSER_ONLY_SETS` names both. `nativeSetsFor(adapter, sets)` leaves them out when a native adapter's description
    names D3D12 (`isD3D12Native`).
  - On such an adapter, every native row for them prints SKIP: the exact gate's K0 rows and the native ladder's turns.
  - A browser's adapter is never asked. Chrome builds their kernels through DXC: in round 17's probe, each 32 -> 32 layer in 0.16 to 2.1 s.
- **The page chooses by adapter.**
  - `pageAdapterKey(info, navigator.userAgentData)` is "platform/vendor/architecture", for example
    "Windows/intel/gen-9".
  - Only Chromium browsers report a platform there. Any other browser makes no key.
  - `pageKernelsFor(key)` gives `PAGE_KERNELS_BY_ADAPTER`'s set for a key the table names, else `PAGE_KERNELS` ("r15").
  - The table is empty in this commit, so the page runs r15 everywhere until the rule below is read off the rig.
  - The page's caption names the set it ran. Its timing report carries the adapter's key (`pageKey`).
- **The ladders.**
  - Both now time r12, r15, r18t and r18u (`TIMED_SETS`), on the page always.
  - Natively, on a D3D12 adapter, they time r12 and r15 alone, as since section 57.
  - The budgets stay: 600 s natively and 300 s on the page.
  - Each size's lines now add each round-18 set against r15 on the device's clock.
- **The native clock.**
  - `tools/ship/headlessGpu.mjs` exports `FINE_CLOCK_FLAG`, `disable-dawn-features=timestamp_quantization`.
  - It is passed to `create()` in three places: the timing gate's native ladder, the compile gate's native children, and
    `tools/denoiseBuildProbe.mjs`.
  - **Shown here on SwiftShader.** By default the low 16 bits of every timestamp were zero. With the flag they were not.
    So section 60's inference holds on SwiftShader at least.
  - Two rows now hold that the native times are not all on the 65,536 ns grid, one in each gate: 0 of 153 times in the
    timing gate here, and 0 of 8 passes in the compile gate.
- **`tools/denoiseDevice.mjs --measure-r18t` and `--measure-r18u`:** K0 (a) on round 11's 24 test images.
- **The pilot.**
  - At 21 x 19, 64 x 64 and 37 x 70, natively on SwiftShader, both sets were exact. Every hidden cell was the twin's, plain.
  - Every hidden layer and the image were r15's, bit for bit.
  - The gates' rows found the same in Chromium.
  - **Pipeline builds on SwiftShader** took about 7 s for r18t, 26 s for r18u and 5 s for r15. r18u writes out four layers'
    blocks. That cost is SwiftShader's, a CPU's.
  - No threshold below was read from the pilot's times.

**What exactness means for r18t and r18u.** The same as section 54 said for r16a and r16b:
- not one cell's order moves: each cell adds b, then block by block, ky, kx (in bounds), ci;
- so every hidden cell is held to the twin or the fused mirror, at zero, given the device's own input;
- the last pass is r15's, judged through the image.

**K0 for r18t or r18u holds** when the hidden layers, the head and kernel pass, and the order probe hold, as section 54's
K0. It must hold in each of:
- **(a) here:** `--measure-r18t`, then `--measure-r18u`, on the 24 test images, with D0-D3. Each output is committed before
  it is read.
- **(b) natively where the adapter is not D3D12.** On the rig it is untested, and nothing below needs it.
- **(c) in the browser on each GPU:** the exact gate's section 5 rows for the set.

**The rule, fixed now: `PAGE_KERNELS_BY_ADAPTER`.** It is read off each GPU's round-18 run, in its page ladder (Chrome).
- **A set qualifies on a GPU** when all three hold there:
  1. **K0 (c):** the set's browser row in the exact gate is green on that GPU.
  2. **K1 against r12 in the browser on that GPU:** section 39's rule. At least 2 times at the largest size both measured,
     and at least 1 time at every size both measured.
  3. **At least 1.05 times as fast as r15.** At the largest size where the set and r15 were both measured on that GPU's
     page ladder, r15's median over the set's, on the device's clock. The ladder prints it as "rXX against r15".
- **That GPU's entry.**
  - The key is the `pageKey` the page reported on that GPU.
  - The set is the qualifying one with the larger ratio in 3. A tie goes to the later set, r18u.
  - If neither qualifies, or the run did not reach the page's ladder, or the report carries no key, the GPU gets no
    entry and its adapter runs `PAGE_KERNELS`.
- **`PAGE_KERNELS` stays "r15"** for every adapter the table does not name: other GPUs, other platforms, other browsers.
- **`DEFAULT_KERNELS` stays "r15".** The default rule needs K1 natively on every GPU, and neither round-18 set is built
  natively on D3D12.
- **The threshold was set knowing section 60's probe.** 1.05 is the smallest gain this round counts as worth a set for one
  adapter. The predictions below are fixed now and reported either way.

**Predictions, fixed now, deciding nothing.**
- **The arithmetic.** Section 54's table puts the hidden layers at 75% of r15's page pass on the 1080 and 89% on the Intel.
  If the network's hidden layers gain what round 17's single 32 -> 32 layer gained at 1024, the whole pass would be:

| Set | GTX 1080 | Intel gen-9 |
|---|---|---|
| r18t | 1.12 x r15 | 1.13 x |
| r18u | 0.64 x | 1.88 x |

- **So the expected table** is r18t on the 1080 and r18u on the Intel.
- **Said now:**
  - P1: r18t qualifies on both GPUs.
  - P2: r18u qualifies on the Intel and not on the 1080.
  - P3: the Intel's entry is r18u.
  - All three are reported either way.

**Reported, deciding nothing.**
- **Each round-18 set's four hidden layers against r15's,** per GPU, on the page, at the largest size both measured.
- **The native clock on the rig.** Whether the two gates' grid rows are green there, that is, whether Dawn's D3D12 path
  honours the toggle as its Vulkan path does here. If they are red, the flag did not reach the D3D12 device. That is an
  instrument finding and moves nothing above.
- **The native ladder's r15 against r12 at 64 x 64 and 128 x 128,** beside round 15's (`render/denoise-rig-r15-*.json`).
  Section 60 left open whether the rounding mattered there.

**After the rule is read.** The verdict section writes `PAGE_KERNELS_BY_ADAPTER` with the entries it gives. The exact
gate's "names no adapter" row becomes a row holding the verdict's table.

**On the rig.**
- **One run per GPU** of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r18.json`, on
  `claude/denoiser-round18`, at a commit carrying this section.
- **Each report is committed byte for byte** before it is read.
- **A gate stopped by `realGpuRun`'s 30-minute cap reaches no verdict on its path.** A rule that needs it cannot move.
- **Section 59's instrument mending is not needed.** It was required before a full run builds a new kernel natively, and
  this run builds no new kernel natively on D3D12.

**Sabotages.**
- **Fourteen runs, U1-U13 and U11b,** each restored and md5-verified, logged in each gate's header. Thirteen are red as
  built; U11 is 0 red.
  - **The set choice.** r18t or r18u never picking its kernel: 6 red each (U1, U2), the sets row, K0 natively and in the
    browser, the small network, and both ladders' different-kernels rows.
  - **The D3D12 stand-aside.** `nativeSetsFor` keeping every set, or `isD3D12Native` blind: 2 red each (U3, U4).
  - **The page's table.** A table ignored, a key without a platform, the table read without `Object.hasOwn`, the page
    hard-wired to r18t, its report without a key: 1 red each (U5-U8, U13).
  - **The clock.** The flag dropped from the timing gate's native device (U9) or the compile gate's children (U10): 1 red
    each, with every native time on the 65,536 ns grid (165 of 165; 8 of 8).
  - **The kernels' wiring.** The written-out layers packed as the fast kernel's: 4 red (U12). The tile layers dispatched
    with half the columns: 3 red (U11b).
- **U11 is 0 red, and is logged as a blind spot.** It dispatches the tile layers with the fast kernel's workgroup count,
  twice the columns. Every extra pixel is outside the image, so no cell moves. It wastes time, not exactness, and no gate
  here times it.

**Not in this round.**
- A default change, or any native use of r18t or r18u on D3D12.
- Measuring other browsers, platforms or GPUs. They run r15.
- A third kernel, or a set chosen after the rig's run. That is a later round.

## 62. ROUND 18 -- REPORTED HERE: K0 (a), r18t AND r18u ON THE 24 TEST IMAGES

`node tools/denoiseDevice.mjs --measure-r18t` and `--measure-r18u` ran here on SwiftShader, one after the other, with no
cache, so each rendered the 24 test images itself.

| Set | Run | Started at |
|---|---|---|
| r18t | 1,308 s | 9b33f2c2, the commit carrying section 61 |
| r18u | 1,737 s | 9b33f2c2. Its first run was stopped with the job that ran it, before it wrote anything, and it was run again. |

- **The outputs, unedited,** are `render/denoise-results-r18t.json` (committed at 4479d3b6) and
  `render/denoise-results-r18u.json` (e73991e4). Each was committed before it was read.
- **The kernels:** on every image the four hidden layers ran on the set's kernel, `tile_inline` for r18t and
  `fast_unroll` for r18u. The head and the kernel apply ran as one pass, `k_head_apply`.

**K0 (a) holds for both sets.**

| Criterion | r18t | r18u |
|---|---|---|
| D0, the shipped file is the harvest's network | its f64 relMSE equals round 11's seed 1 on all 24 images, bit for bit | the same |
| D1, the hidden layers | 12,582,912 conv cells, every one the twin's: none fused, none unexplained | the same |
| D2, the head and kernel pass | worst 4.9e-7 against `kernelApplyCpu` on the twin's logits or the fused mirror's (bound 1e-5); against the twin's alone 6.4e-7, against the mirror's alone 7.6e-7 | the same, to the digit |
| D3, the verdict on the device | relMSE within 3.8e-7 of the f64 network's on every image (bound 1e-4); the primary filter beaten on 12 of 12 images of R and 12 of 12 of C, the same images as on the CPU | the same |

- **On all 24 images, each set's device relMSE equals r15's (section 47), bit for bit.** That is what an unchanged
  order predicts. On SwiftShader nothing fuses, so every hidden cell is the twin's in r15, r18t and r18u alike.
- **Reported, not a criterion.** A 64 x 64 image took a median of 279 ms (241-360) with r18t and 956 ms (816-1,152) with
  r18u, read-back included, against r15's 399 in section 47. This is SwiftShader, a CPU's time, and no evidence for the
  page rule.

**Still open:**
- K0 (c), K1 and section 61's page rule on Keith's two GPUs, and the native clock rows there.
- That is one run each of `node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r18.json` on
  `claude/denoiser-round18`.
- Until section 61's rule fills it, `PAGE_KERNELS_BY_ADAPTER` is empty. The page runs "r15" everywhere, and so does the
  default.

## 63. ROUND 18 -- THE VERDICT: THE PAGE RUNS r18u ON THE INTEL AND r18t ON THE GTX 1080, IN CHROME ON WINDOWS; r15 EVERYWHERE ELSE

**What arrived.**
- **One `realGpuRun --only denoise` per GPU,** at 01429c8e, committed byte for byte at 227d3f83:
  - `render/denoise-rig-r18-intel-gen9.json`: natively "intel / gen-9 / D3D12 driver version 31.0.101.2137", in Chrome
    "intel / gen-9";
  - `render/denoise-rig-r18-gtx1080.json`: natively "nvidia / pascal / D3D12 driver version 32.0.15.8180", in Chrome
    "nvidia / pascal".
- **Every gate was green on both GPUs,** and none came near the 30-minute cap:

| Gate | Intel gen-9 | GTX 1080 |
|---|---|---|
| exact | 180 s | 97 s |
| timing | 243 s | 178 s |
| compile | 750 s | 368 s |

**Section 61's three conditions, set by set.**

| Condition | r18t, Intel | r18u, Intel | r18t, 1080 | r18u, 1080 |
|---|---|---|---|---|
| 1. K0 (c), the exact gate's browser row | green | green | green | green |
| 2. K1 against r12 in Chrome | 9.44 x at 256, at least 8.55 | 14.12 x at 256, at least 13.59 | 25.90 x at 1024, at least 9.09 | 15.29 x at 1024, at least 8.73 |
| 3. Against r15 at the largest size both measured | **1.026 x at 1024: under 1.05** | 1.524 x at 1024 | 1.087 x at 1080p | **0.657 x at 1080p** |
| Qualifies | no | **yes** | **yes** | no |

- **On K0 (c).** The report lists failing rows, not passing ones. The exact gate had no failing row on either GPU, and
  the harness logged its browser sessions on each GPU's own adapter. That is the same reading earlier rounds gave K0 (c).
- **By section 61's rule:**
  - the Intel's entry is r18u, the only set that qualified there;
  - the 1080's is r18t, the only set that qualified there.
- **So `PAGE_KERNELS_BY_ADAPTER` is `{ "Windows/intel/gen-9": "r18u", "Windows/nvidia/pascal": "r18t" }`.** The keys are
  the ones each GPU's page reported.
- **`PAGE_KERNELS` and `DEFAULT_KERNELS` stay "r15".** Every other adapter, platform and browser runs r15, and so does
  everything native.

**The predictions.**

| Set and GPU | Predicted, against r15 | Measured |
|---|---|---|
| r18t, GTX 1080 | 1.12 x | 1.087 x at 1080p |
| r18t, Intel | 1.13 x | 1.026 x at 1024 |
| r18u, Intel | 1.88 x | 1.524 x at 1024 |
| r18u, GTX 1080 | 0.64 x | 0.657 x at 1080p |

- **P1 is false.** r18t qualified on the 1080 only.
- **P2 and P3 are true.** r18u qualified on the Intel and not on the 1080, and the Intel's entry is r18u.
- **Both gains on the faster side fell short of the arithmetic,** which assumed the network's hidden layers would gain what
  round 17's single 32 -> 32 layer gained:

| Hidden layers, against r15's | Round 17's layer, Chrome at 1024 | Round 18's four, on the page |
|---|---|---|
| r18t, Intel | 1.14 x | 1.037 x at 1024 (857.2 ms against 888.9) |
| r18u, Intel | 2.11 x | 1.688 x at 1024 (526.4 against 888.9) |
| r18t, GTX 1080 | 1.17 x | 1.118 x at 1080p (55.2 against 61.7) |
| r18u, GTX 1080 | 0.57 x | 0.585 x at 1080p (105.5 against 61.7) |

**Reported, deciding nothing.**
- **The page's own image is 64 x 64,** and there the sets compare differently:
  - On the 1080, r18t's pass was 0.80 x r15's: 0.535 against 0.429 ms on the device's clock. It was slower at 128 too
    (0.96 x), and faster from 256 up.
  - On the Intel, r18u's was 1.67 x r15's at 64 x 64: 2.94 against 4.92 ms.
  - Section 61's rule reads the largest size both measured, so this moves nothing. On the 1080 it costs the page's 64 x 64
    denoise about 0.1 ms of GPU time against r15. The page's wall clock read 2.7 ms for every set there.
- **The Intel's head and kernel pass.** The same kernel, `k_head_apply`, took 97.6 ms after r18t's layers and 97.0 after
  r18u's, against 90.5 after r15's, at 1024. The 1080's agreed to within 0.9 ms. The cause is not shown. The Intel's
  1024 rows rest on 3 passes for r15 and r18t and 6 for r18u.
- **r18u climbed further on the Intel.** It measured 1080p (1,190 ms) where r15 stopped, predicted at 1,947 ms.
- **The native clock on the rig is unrounded.**
  - Both gates' grid rows were green on both GPUs.
  - None of the native device-clock medians the reports carry is a whole number of 65,536 ns: 0 of 8 on the Intel, 0 of 11
    on the 1080.
  - So Dawn's D3D12 path honours `timestamp_quantization` off, as its Vulkan path does here.
- **Native r15 against r12 at the small sizes, beside round 15's runs:**

| GPU, size | Round 15 | Round 18 |
|---|---|---|
| Intel, 64 x 64 | 8.92 x (second run 8.87) | 9.04 x |
| Intel, 128 x 128 | 10.52 x (10.25) | 10.63 x |
| 1080, 64 x 64 | 4.31 x | 9.17 x |
| 1080, 128 x 128 | 10.46 x | 10.92 x |

  - Three of the four agree to within 4%.
  - On the 1080 at 64 x 64, r15's own pass halved: from 1.049 to 0.515 ms on the device's clock, and from 1.292 to
    0.708 ms on the wall clock, which was never rounded. The rounding can move a span by one 65.5 µs tick at most, so it is
    not the cause. The cause is not shown.

**What changes.**
- `render/denoiseDevice.mjs`: `PAGE_KERNELS_BY_ADAPTER` holds the two entries above.
- **The exact gate's rows.**
  - The "names no adapter" row now holds the verdict's table.
  - The page row holds the set the table gives the page's own key: on this box, SwiftShader's key is not in the table, so
    r15; on either rig GPU, the table's set.
- **Sabotages V5-V7:**
  - V5, the table's entries swapped: 1 red.
  - V7, a third adapter added: 1 red.
  - V6, the page refusing the table's set for an adapter the table names: 0 red here. This box's adapter is not in the
    table. On the rig's GPUs the page row checks exactly that.

**What this leaves. Nothing here is pre-registered.**
- **The page's choice rests on one run per GPU.** r18t's 1.087 x on the 1080 cleared 1.05 by 0.037. A later run that reads
  it again would show whether the margin holds.
- **The page's own 64 x 64 image is where r18t is slower on the 1080.** A rule read at the page's working size would choose
  differently there.
- **Natively nothing changed.** The default stays r15, and FXC still builds neither round-18 set.

## 64. ROUND 19'S PROBE -- NODE-WEBGPU 0.6.2 SHIPS DXC AND A DAWN BUILT TO PREFER IT: WHAT THE RIG'S DUMP DECIDES, FIXED BEFORE IT RUNS

**Why now.** Sections 52 and 53 left A1 untested on both GPUs because node-webgpu 0.6.0's Dawn never loads DXC. Two
releases have shipped since: 0.6.1 on 2026-09-12 and 0.6.2 on 2026-10-02. If either loads DXC, the native gates could
build r18t's and r18u's kernels, which FXC stopped on or crashed on (section 60), and `DEFAULT_KERNELS` could leave
"r15". Keith asked for the cheap probe first: install, read the binary, rerun the `use_dxc` check, read the dump.

**What was read here.** Each version came from `npm pack` and was read without being run. The Dawn sources were read at
the revision each version's tag pins (node-webgpu's `third_party/dawn`). Nothing ran on Windows.

| | 0.6.0 | 0.6.1 | 0.6.2 |
|---|---|---|---|
| Dawn pinned at | 55c03af2 | 80ee0043 | 77f9a9aa |
| Built with DXC (`-DDAWN_USE_BUILT_DXC=ON`, `build/build.js`) | no | no | **yes** |
| win32-x64 `dawn.node` | 11,883,520 bytes | 11,816,448 | 12,177,408 |
| `use_dxc`'s description | "when both dxcompiler.dll and dxil.dll is available" | "when dxcompiler.dll is available" | the same as 0.6.1 |
| `DxcCreateInstance`, "DXC create library / compiler / validator" | no | no | **yes** |
| Dawn's DXC compile path (`CompileShaderDXC`) | yes | yes | yes |
| `d3dcompiler_47.dll` (FXC) | yes | yes | yes |
| DXC beside `dawn.node` in the package | no | no | **`dxcompiler.dll` 1.9.0.5517, no `dxil.dll`** |

- **0.6.0 and 0.6.1 can never use DXC.** Their Dawn was built without DXC. On D3D12, `PhysicalDeviceD3D12.cpp` then sets
  `ForceSet(UseDXC, false)`, whatever DLLs sit beside `dawn.node`.
  - **That is why sections 52 and 53 read DXBC.** It was not the DLLs; the toggle was forced off.
  - **So section 43's copied-DLL `use_dxc` run is retired.** On those packages it was always FXC under another name. Its
    Intel fast head alone took 353 s (section 52).
- **0.6.2 is built to prefer DXC.** Its `build.js` turns on built DXC for Windows, with this comment: "without built DXC,
  dawn forces d3d12 onto FXC, which was measured ~45x slower than DXC on a compute rasterizer and can hang the device
  ... with it, dawn prefers DXC wherever the adapter supports shader model 6.0+." node-webgpu's commit e996e2f, "Build and
  ship DXC on Windows (#20)", is in v0.6.2.
  - **Dawn's source at 77f9a9aa says the same.** With built DXC, `use_dxc` defaults on (`kWebGPUUseDXC`), and is forced off
    only below shader model 6.0.
  - **The compiler loads when the device is created.** If `dxcompiler.dll` will not load, device creation fails, with no
    fallback to FXC.
  - **No component loads `dxil.dll`.** The validator comes from `dxcompiler.dll`'s own `DxcCreateInstance` (the string "DXC
    create validator"). Chrome 156 runs this way too (v4821).
- **0.6.1 and 0.6.2 change more than DXC.**
  - 0.6.1 added the `index.js` wrapper that unmaps a device's buffers when it is destroyed.
  - 0.6.2 moved Dawn from 80ee0043 to 77f9a9aa, and built Linux on an older toolchain. Its linux-x64 `dawn.node` needs
    GLIBC 2.34, not 2.38, and is 21,526,416 bytes, not 19,003,456.
  - So the comparison below spans a different Dawn and toolchain, not DXC alone. Tint's SPIR-V differs too: r13-fast-3x3
    is 1,325 lines on 0.6.0 and 1,320 on 0.6.2, and r15-head-apply 14,906 and 14,612. Every kernel is exact on both.

**Here, on SwiftShader, 0.6.2 runs the denoiser exactly.** Linked into a scratch checkout of main at effe0c8c:

| Gate | 0.6.2 | 0.6.0 |
|---|---|---|
| `brain/conv2d-selfcheck.mjs` | green, 107 s | green, 94 s |
| `render/denoiseDevice-selfcheck.mjs` | green, 196 s | green, 177 s |
| `render/denoiseCompile-selfcheck.mjs` | green, 50 s; 8 of 8 kernels built and exact natively | green, 52 s; 8 of 8 |

- **The build probe too.** `tools/denoiseBuildProbe.mjs --native-only --dxc on --sizes 64` ran through `SWEK_WEBGPU` on
  0.6.2 and built all 7 of round 17's shapes, each exact at 64 x 64. That includes r18t's kernel (1.4 s) and r18u's
  (7.0 s).
- **None of this says anything about D3D12.** The native backend here compiles to SPIR-V, so the toggle does nothing.

**What changes in the tree.** The pin stays 0.6.0: `tools/ship/headlessGpu.mjs`'s `LICENCES` and the session-start hook.
- **`SWEK_WEBGPU=<absolute package directory>`** makes `resolveWebgpu` use that package, for one console.
  - A path that is not absolute, or holds no package, is refused, never passed over.
  - `realGpuRun` stops before any gate on a refusal. The compile gate turns a refusal into a red, not a skip.
  - Otherwise a run that asked for 0.6.2 could quietly measure the global 0.6.0, or report no native row at all and pass.
  - `realGpuRun`'s report records the package's version and how it was chosen.
- **`webgpuPackage(from)`** returns the package's directory, version and `dawn.node` directory, and whether DXC ships
  beside it. It resolves `from` to a file. Section 52's gate took `path.dirname(from)`, which for the bare specifier
  "webgpu" is ".".
- **The compile gate's native modes come from `nativeModes`.**
  - Where DXC ships beside `dawn.node`, three modes run from the package alone, with nothing copied: "as shipped",
    "use_dxc" and "use_dxc off".
  - Any other package runs "as shipped" alone.
  - One line per mode says how many kernels built, what their dumps say, the first reason any did not, and where its dumps
    are. Each dump file name carries the package's version.
  - The D3D12 dump row reads only kernels that built. A kernel whose device was never created has no dump and a reason.
- **`dawnFlags` merges disable entries as it merged enable ones** (section 49). "use_dxc off" is a disable entry, and the
  child's device already carries one, the fine clock. Unmerged, Dawn would keep the clock's entry and drop DXC's.
- **`tools/denoiseBuildProbe.mjs --dxc on|off`** asks Dawn for DXC natively, or forbids it, through the same flags. Its
  report records the package and what was asked.

**The rig run.** On each GPU, in the verified clone:

```
cd WebGLEngine
npm install --no-audit --no-fund --prefix "%TEMP%\swek-webgpu-0.6.2" webgpu@0.6.2
set SWEK_WEBGPU=%TEMP%\swek-webgpu-0.6.2\node_modules\webgpu
node tools/ship/realGpuRun.mjs --only denoiseCompile --out real-gpu-denoise-dxc-0.6.2.json
node tools/denoiseBuildProbe.mjs --native-only --dxc on --out denoise-build-probe-dxc-0.6.2.json
set SWEK_WEBGPU=
```

**Predicted before it runs.** Both GPUs support shader model 6.0 or above, so:
- **P1:** "as shipped" compiles with DXC, and its dumps match "use_dxc"'s.
- **P2:** "use_dxc off" compiles with FXC, and its times are FXC's from sections 52 and 53.
- **Consequence:** moving the pin to 0.6.2 would move every native D3D12 gate in the tree from FXC to DXC, not only the
  denoiser's.

**What it decides, fixed now.** Read from the compile gate's line for each mode.
- **C1, the load.** On a GPU, 0.6.2 loads DXC natively if both hold:
  - every kernel builds under "use_dxc";
  - every one of those dumps says DXIL.
  Any other outcome is a no on that GPU:
  - **devices not created,** with a reason naming DXC's loading (`EnsureDXCLibraries`, "DXC create ..."): 0.6.2 ships DXC,
    but it does not load on that machine. "As shipped" fails the same way.
  - **DXBC under "use_dxc":** Dawn forced DXC off, which it does only below shader model 6.0.
  - **some kernels DXIL and some not built:** DXC loads but does not build every kernel. The reasons are reported. It is a
    no for C1, not for A1.
- **A1, at last testable.** Where C1 holds, A1 (section 43) is read off the same run, from one package: the fast head's pass
  under "use_dxc" against "use_dxc off". It is supported at 10 x or more. If "use_dxc off" also says DXIL, there is no FXC
  run to compare against, and A1 stays untested.
- **C2, the shapes.** Where C1 holds, `denoiseBuildProbe --dxc on` must build r18t's kernel (`tile2-zero-inline-32`) and
  r18u's (`fast-unroll-32`), each within its 180 s cap, exact at 64 x 64, with a dump that says DXIL.
- **What follows.**
  - **If C1 and C2 hold on both GPUs,** a round 19 may do three things:
    - move the pin to 0.6.2, once a whole native sweep, here and on the rig, is green and exact on it. That is needed
      because of the consequence above. "Exact", not "the same": the shaders are not the same bytes, as shown above;
    - let the native gates build r18t and r18u on D3D12 when the run's compiler is DXC;
    - time them natively against r15.
    `DEFAULT_KERNELS` leaves "r15" only by a rule that round fixes before its run, as section 61 fixed the page's.
  - **If C1 holds and C2 fails,** the pin may still move for A1's sake. That round decides it.
  - **If C1 fails on both GPUs,** round 19 ends here. 0.6.2 is a quick no, as 0.6.0 was.
- **Nothing in this probe moves** `PAGE_KERNELS`, `PAGE_KERNELS_BY_ADAPTER`, `DEFAULT_KERNELS`, the native sets or the pin.

**Unchecked here.**
- Everything on D3D12. The loader is read from the strings and Dawn's source, and only the rig's dumps decide.
- Whether the rig's drivers accept DXIL checked by DXC's own validator, with no `dxil.dll`. Chrome 156 runs that way.
- 0.6.1 was not run anywhere. Its build says no.

## 65. ROUND 19'S PROBE -- THE VERDICT: 0.6.2 LOADS DXC ON BOTH GPUS, A1 IS SUPPORTED, AND BOTH ROUND-18 KERNELS BUILD NATIVELY

**What arrived.** On each GPU, through `SWEK_WEBGPU` naming node-webgpu 0.6.2, the two commands section 64 fixed. All four
files are committed byte for byte at 821ec075, before this section:

| GPU | `realGpuRun --only denoiseCompile` | `denoiseBuildProbe --native-only --dxc on` |
|---|---|---|
| Intel gen-9 | `render/denoise-rig-compile-dxc-0.6.2-intel-gen9.json` | `render/denoise-probe-r17-dxc-0.6.2-intel-gen9.json` |
| GTX 1080 | `render/denoise-rig-compile-dxc-0.6.2-gtx1080.json` | `render/denoise-probe-r17-dxc-0.6.2-gtx1080.json` |

- The Intel ran at 3f034b60 and the 1080 at b4adf472. They hold the same code: 3f034b60 is v4844's release record, and
  changes only `tools/ship/releases.json`.
- The build probe names each device: "intel / gen-9 / D3D12 driver version 31.0.101.2137" and "nvidia / pascal / D3D12
  driver version 32.0.15.8180". These are section 63's adapters, on the same drivers.
- The compile gate was **green** on both: 442 s on the Intel, 198 s on the 1080.
- **The 1080's report says "NO ADAPTER WAS SEEN -- this is not a hardware run". That is false.** Its native half ran on
  the 1080, on the device's clock. `realGpuRun` took adapter names only from the browser half, and Chrome did not run on
  that box. Round 19 names native adapters in the report; that change is not in this version.

**P1 and P2.**

| Prediction | Intel gen-9 | GTX 1080 |
|---|---|---|
| **P1:** "as shipped" compiles with DXC, and its dumps match "use_dxc"'s | **true**: 8 of 8 DXIL, each the same number of lines as under "use_dxc" | **true**: the same |
| **P2:** "use_dxc off" compiles with FXC, at FXC's times from sections 52 and 53 | **true**: 8 of 8 DXBC. The fast head took 367 s to build and 1,283 ms a pass, against section 52's 353 to 386 s and 1,330 to 1,471 ms | **true**: 8 of 8 DXBC. 160 s and 22.6 ms, against section 53's 146 to 151 s and 22.5 to 22.9 ms |

- **So the consequence section 64 named holds:** moving the pin to 0.6.2 moves every native D3D12 gate from FXC to DXC.

**What it decides, read as section 64 fixed it.**

| Condition | Intel gen-9 | GTX 1080 |
|---|---|---|
| **C1:** every kernel builds under "use_dxc", and every dump says DXIL | **holds**: 8 of 8 | **holds**: 8 of 8 |
| **A1:** the fast head's pass under "use_dxc" against "use_dxc off", supported at 10 x or more | **supported: 2,024 x** (0.634 against 1,283.473 ms) | **supported: 404 x** (0.056 against 22.637 ms) |
| **C2:** r18t's kernel (`tile2-zero-inline-32`) and r18u's (`fast-unroll-32`) build within 180 s, exact at 64 x 64, with a DXIL dump | **holds**: 1.0 s and 2.3 s to build | **holds**: 0.25 s and 1.35 s |

- **A1 was untested on both GPUs until now** (sections 52 and 53): 0.6.0's Dawn could not load DXC. It is supported on both,
  from one package, with no DLL copied.
- **Every other kernel in the probe built and was exact under DXC too:** all 7 of round 17's shapes on both GPUs, each
  within 2.4 s.
- **By section 64, C1 and C2 hold on both GPUs, so a round 19 may do its three things.** Round 19's own section fixes
  them before the rig runs anything.

**Reported, deciding nothing.**
- **DXC is not faster everywhere.** Leaving out the fast head, FXC's pass was the faster for 5 of the other 7 kernels on the
  Intel and 4 of 7 on the 1080. FXC's time over DXC's, from the compile gate (above 1 means DXC is faster):

| Kernel | Intel gen-9 | GTX 1080 |
|---|---|---|
| r12-tiled-3x3 | 1.00 | 0.78 |
| r13-fast-3x3 | **0.74** | 1.33 |
| r12-direct-head | 1.00 | 0.81 |
| r13-fast-head | **2,024** | **404** |
| r14-head | 1.03 | 0.76 |
| r12-apply | 0.93 | 1.43 |
| r14-apply-fast | 0.95 | 0.80 |
| r15-head-apply | **0.81** | **2.02** |

  - **r15's own two kernels run slower under DXC on the Intel:** the fast 3 x 3 took 1.012 ms against FXC's 0.745, and the
    fused head and apply 0.448 against 0.363. On the 1080 both run faster under DXC.
  - So moving the pin could slow r15 itself natively on the Intel. Any rule that moves a native default has to read r15
    under both compilers for that reason.
- **DXC builds far faster.** Under FXC the fast 3 x 3 took 6.8 s to build on the Intel and 3.6 s on the 1080, against
  0.11 and 0.09 s under DXC. The fused head and apply took 16.4 and 9.0 s, against 1.6 and 1.1 s.
- **"As shipped" built slower than "use_dxc" on the Intel**, for the same DXIL: 472 against 53 ms for r12-tiled-3x3, 3,885
  against 1,636 ms for r15-head-apply. "As shipped" runs first. The cause is not shown. On the 1080 the two modes built
  within 10 ms of each other, and r15-head-apply within 24.
- **Natively under DXC, round 17's shapes rank as they did in Chrome.** The pass's speed over the fast kernel's at 1024 x
  1024, on the device's clock:

| Shape | Chrome, round 17 (section 60) | Native DXC, this probe |
|---|---|---|
| r18t's (`tile2-zero-inline-32`), Intel | 1.14 x | 1.18 x |
| r18u's (`fast-unroll-32`), Intel | 2.11 x | 1.85 x |
| r18t's, GTX 1080 | 1.17 x | 1.14 x |
| r18u's, GTX 1080 | 0.57 x | 0.58 x |

  This is section 63's split, natively: r18u wins on the Intel and r18t on the 1080.
- **Every kernel was exact under all three modes on both GPUs.** The applies' worst errors were 4.59e-7 and 5.45e-7 on the
  Intel and 4.56e-7 and 6.26e-7 on the 1080, against `APPLY_TOL` 1e-5. On the Intel under DXC, 221,346 of the fast head's
  331,776 outputs matched the twin's fused-multiply-add rounding and the rest its plain rounding; none was unexplained.

**Unchecked here.**
- The dumps were read by the compile gate on the rig. Only its lines came back, not the dump files.
- Why "as shipped" built slower than "use_dxc" on the Intel.
- Whether a D3D12 adapter below shader model 6.0 would fall back to FXC with 0.6.2. Dawn's source says it would; neither
  rig GPU is one.

## 66. ROUND 19 -- A NATIVE RUN THAT COMPILES WITH DXC BUILDS AND TIMES r18t AND r18u, AND A NATIVE TABLE BY ADAPTER: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 65 read section 64's conditions off both GPUs: C1 and C2 hold on both. So a round 19 may do
the three things section 64 named. This round does two of them and fixes the rule for the third's consequence:
- **The native gates build r18t and r18u on D3D12 when the run's compiler is DXC.**
- **They time them natively against r15**, under DXC and, in the same run, against r15 under FXC.
- **The pin stays 0.6.0.** Moving it needs a whole native sweep on 0.6.2, green and exact, here and on the rig (section 64).
  That is a round of its own. Until then a DXC run is a console with `SWEK_WEBGPU` naming 0.6.2.
- **`DEFAULT_KERNELS` leaves "r15" only by the rule below,** fixed now, before the rig runs anything.

**What changes. Built and piloted here first, on SwiftShader only.**
- **The compiler, read off the package.** No adapter can say which compiler runs: on 0.6.2 the description is "D3D12
  driver version ..." under either. Only Dawn's shader dump says, and only a child process can read it (section 52).
  - `tools/ship/headlessGpu.mjs`'s `nativeCompiler` gives "DXC" on win32 for a package that ships `dxcompiler.dll` beside
    `dawn.node` and is 0.6.2 or later, unless the device's flags disable `use_dxc`. Any other win32 package gives "FXC";
    0.6.0 and 0.6.1 force `use_dxc` off whatever DLL sits there (section 64). Off win32 it gives none.
  - **The compile gate holds that prediction to the dump in the same run.** Its "as shipped" children dump every kernel,
    and a row is red unless the dumps say DXIL exactly when the package said DXC. That row is condition 0 below. It is
    what would catch an adapter below shader model 6.0, where Dawn forces FXC; neither rig GPU is one.
- **`render/denoiseDevice.mjs`.**
  - `BROWSER_ONLY_SETS` is renamed `FXC_UNBUILT_SETS`. Round 18 called r18t and r18u browser-only; section 65 built both
    natively.
  - `nativeSetsFor(adapter, sets, { compiler })` leaves them out only on a D3D12 adapter whose compiler is not DXC. No
    compiler named counts as FXC, the safe side, so every call that names none behaves as before.
  - `NATIVE_KERNELS_BY_ADAPTER` is new and empty. `nativeAdapterKey` makes "win32/<vendor>/<architecture>", and
    `nativeKernelsFor` gives the table's set for a DXC run on a named adapter, and `DEFAULT_KERNELS` otherwise.
- **The exact gate** builds r18t and r18u natively wherever `nativeSetsFor` allows. That is K0 (b) on the rig, untested
  since section 61. A refused `SWEK_WEBGPU` is red there now, not a skip.
- **The timing gate.**
  - Its native ladder times all four of `TIMED_SETS` under DXC, and prints the adapter's key for the table.
  - **A second native ladder, r12 and r15 under FXC,** runs in its own process from the same package, with `use_dxc`
    disabled and the fine clock in one merged entry (section 49). A device's compiler is fixed when it is created, so the
    two ladders cannot take turns on one device. Their ratio is unpaired, and its line says so.
  - The native "against r15" lines are tagged section 66. The page's stay section 61's.
- **The compile gate** adds r18t's and r18u's hidden-layer kernels as native variants, built only in a mode whose compiler
  is DXC and whose eight base kernels all dumped DXIL. Under FXC they stand aside and are not counted as unbuilt.
- **`brain/conv2d-selfcheck.mjs`** runs round 17's native rows under DXC. Round 16's shapes still stand aside on every D3D12
  adapter: the rig's DXC probe ran round 17's shapes only.
- **`tools/ship/realGpuRun.mjs`** names native adapters (section 65's 1080 report said "NO ADAPTER WAS SEEN"), keeps each
  gate's SKIP lines, and records the package's `dxcBeside` and predicted compiler.
- **The pilot, on SwiftShader (v4851).** Every gate carrying these changes is green here; no threshold below is read from
  these figures, which are a CPU's times and not a GPU's.
  - The exact gate: K0 natively holds for r14, r15, r18t and r18u (linux has no D3D compiler, so `nativeSetsFor` builds all
    four). The native adapter is named for realGpuRun: "google / swiftshader / SwiftShader driver 5.0.0 (SOFTWARE)".
  - The timing gate's native ladder, at 64 x 64 against r12: r15 2.63 x, r18t 3.53 x, r18u 1.00 x; against r15, tagged
    section 66: r18t 1.340 x, r18u 0.381 x. The key it prints is `linux/google/swiftshader`, and the compiler read off the
    package is none (node-webgpu 0.6.0, linux). The FXC child stands aside here: only a win32 package that ships DXC has an
    FXC to compare against.
  - The compile gate: condition 0 off win32 is NOT TESTED -- the package predicts no D3D compiler and none of the eight
    "as shipped" dumps names one. r18t's and r18u's hidden kernels stand aside in every native mode here (no DXC), and
    are built once as shipped, outside any mode's count, so their child path has run before the rig runs it.
  - conv2d: off D3D12 both rounds' native rows run as before; the DXC and FXC branches are held on stub adapters carrying
    the rig's own descriptions.

**What exactness means for r18t and r18u natively.** Section 61's, unchanged: the same twin, cell for cell, with a fused
multiply-add allowed where the twin explains it.

**The rule, fixed now: `NATIVE_KERNELS_BY_ADAPTER`.** It is read off each GPU's round-19 run, `realGpuRun --only
denoise` with `SWEK_WEBGPU` naming node-webgpu 0.6.2.
- **A set (r18t or r18u) qualifies natively on a GPU** when all five hold there:
  0. **The run's compiler is DXC.** The compile gate's row holding the package's prediction to the "as shipped" dumps is
     green, and the prediction is DXC.
  1. **K0 (b):** the set's native rows in the exact gate are green on that GPU.
  2. **K1 against r12 natively under DXC:** section 39's rule. At least 2 times at the largest size both measured, and at
     least 1 time at every size both measured. The native ladder prints it as "native: rXX against r12".
  3. **At least 1.05 times as fast as r15 under DXC.** At the largest size where the set and r15 were both measured on
     the native ladder, r15's median over the set's, on the device's clock. It prints as "native: rXX against r15".
  4. **At least 1.05 times as fast as r15 under FXC.** At the largest size where the set (on the DXC ladder) and r15 (on
     the FXC ladder) were both measured, r15's median over the set's, on the device's clock. It prints as "native: rXX
     against r15 under FXC ... unpaired".
- **That GPU's entry.** The key is the one the timing gate printed for that GPU. The set is the qualifying one with the
  larger ratio in 3. A tie goes to the later set, r18u. If neither qualifies, or the run did not reach the native ladder,
  or the report carries no key, the GPU gets no entry.
- **`DEFAULT_KERNELS` stays "r15"** for every FXC run, every adapter the table does not name, and every platform but
  win32. **The table applies to a DXC run only.** Until the pin moves, that is a console with `SWEK_WEBGPU` naming 0.6.2.
- **Why condition 4.** Section 65 measured r15's own kernels running slower under DXC on the Intel. A native caller that
  moves to 0.6.2 changes its compiler as well as its set, so the set has to beat what that caller runs today, r15 under
  FXC, and not only r15 under DXC.
- **Why it accepts an unpaired ratio.** Section 39's turn-taking cannot span two processes, and the compiler cannot change
  inside one. The rule reads the ratio as it is, and the line says so.
- **The threshold is section 61's, 1.05,** set knowing section 65's probe.
- **A gate stopped by `realGpuRun`'s 30-minute cap reaches no verdict on its path.** A condition that needs it cannot hold.

**Predictions, fixed now, deciding nothing.** They assume the native DXC passes run as Chrome's did in round 18 (section 65
found native DXC's kernel ratios within 0.26 of Chrome's), and they take r15 under FXC from round 18's native rows on 0.6.0
(section 63's run):

| Set, GPU | Against r15 under DXC | Against r15 under FXC | Qualifies |
|---|---|---|---|
| r18u, Intel | 1.52 x at 1024 (Chrome: 978.9 ms against 642.5) | 1.41 x (907.5 against 642.5) | **yes** |
| r18t, Intel | 1.03 x | 0.95 x | no |
| r18t, GTX 1080 | 1.09 x at 1920 x 1080 (82.6 against 75.9) | **1.04 x (78.8 against 75.9)** | no, by condition 4 |
| r18u, GTX 1080 | 0.66 x | 0.63 x | no |

- **P1:** the Intel's entry is r18u.
- **P2:** the 1080 gets no entry. r18t clears r15 under DXC but not r15 under FXC: natively on 0.6.0 the 1080's r15 ran
  faster than Chrome's.
- **P3:** r15 itself runs slower under DXC than under FXC on both GPUs at their largest common size.

**Reported, deciding nothing.**
- Each GPU's native ladders, size by size, under both compilers, and r15 under DXC against r15 under FXC.
- The compile gate's kernel-level line: r18t's and r18u's hidden kernels against r15's at 64 x 64, under DXC.

**After the rule is read.** The verdict round fills `NATIVE_KERNELS_BY_ADAPTER`. It changes no FXC run, so nothing on the
pinned 0.6.0 moves. Whether the pin moves is the next round's question, fixed before its run, and it needs the whole native
sweep on 0.6.2 first.

**On the rig.** On each GPU, in the verified clone, through `SWEK_WEBGPU` as in section 64:
`node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r19.json`. Expect the Intel's FXC ladder to take
minutes: FXC builds the fused head in 16 s there, at every size.

**Sabotages (v4851).** Each new row was broken on purpose, seen red BY NAME, restored byte-identical, and is logged beside
its row. 40 in all, none 0 red at the end:
- **tools/ship/headlessGpu-selfcheck.mjs (3):** versionAtLeast comparing parts as strings; nativeCompiler missing use_dxc
  inside a MERGED disable entry; noteNativeAdapter calling a record without isFallbackAdapter software.
- **render/denoiseDevice-selfcheck.mjs (5), against render/denoiseDevice.mjs:** nativeSetsFor dropping the round-18 sets
  under DXC; keeping them under FXC; isDxcCompiler matching any case; NATIVE_KERNELS_BY_ADAPTER shipping an entry;
  nativeKernelsFor reading the table without the compiler.
- **render/denoiseTiming-selfcheck.mjs (4):** the FXC child's flags as two disable entries; the unpaired ratio read at the
  smallest common size; every "against r15" line tagged section 61; nativePlan reading the compiler without the device's
  flags.
- **render/denoiseCompile-selfcheck.mjs (8):** r18t's cfg changed; condition 0's DXC case satisfied by one DXIL dump; its FXC
  case without "no DXIL"; a child with no dump counted as DXIL; the hidden kernels built on the prediction alone; the
  prediction forced to win32 beside SPIR-V dumps; the child looking up its kernel in VARIANTS alone; section 4 counting the
  hidden kernels in every mode.
- **brain/conv2d-selfcheck.mjs (7):** round 17's DXC exemption dropped; round 16 run under DXC; the comparator always
  hoisted; an unread compiler counted as DXC; round 17's SKIP line not naming the compiler; every adapter stood aside
  without DXC; the gate's device flags disabling use_dxc.
- **tools/ship/realGpuRun-selfcheck.mjs (13):** the native label removed; native records dropped; the native marker
  misspelled; "none" listed as an adapter; a missing `software` read as false; adapters deduplicated by name; parseRows,
  gateEntry or runGates dropping the SKIP lines (two first crashed the gate rather than reddening a row, and were redone);
  the platform hard-coded to win32; dxcBeside always null; no package read as FXC; the CLI writing an old record.
- **Found while building it:** conv2d's two inline-weight rows compared against the hoisted tile kernel, a round-16 shape,
  so a DXC run would have built round 16 natively after all; where round 16 stands aside they compare against the fast
  kernel's bits instead (forced on SwiftShader, green).

**Not in this round.**
- Moving the pin, or any change to an FXC run.
- `PAGE_KERNELS` and `PAGE_KERNELS_BY_ADAPTER`: the page's sets are section 63's, and Chrome's compiler did not change.
- Round 16's shapes natively on D3D12.
