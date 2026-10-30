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

## 67. ROUND 19 -- THE VERDICT: A DXC RUN TAKES r18u NATIVELY ON THE INTEL, AND THE GTX 1080 STAYS ON r15

**What arrived.**
- **One `realGpuRun --only denoise` per GPU,** at 167ba144 (v4851's release), with `SWEK_WEBGPU` naming node-webgpu 0.6.2.
  Committed byte for byte:
  - `render/denoise-rig-r19-intel-gen9.json`: natively "intel / gen-9 / D3D12 driver version 31.0.101.2137", in Chrome
    "intel / gen-9";
  - `render/denoise-rig-r19-gtx1080.json`: natively "nvidia / pascal / D3D12 driver version 32.0.15.8180", in Chrome
    "nvidia / pascal".
- **Every gate was green on both GPUs,** none near the 30-minute cap. Both reports name the native adapter, labelled
  native, beside Chrome's: section 65's "NO ADAPTER WAS SEEN" is gone.

| Gate | Intel gen-9 | GTX 1080 |
|---|---|---|
| exact | 69 s | 41 s |
| timing | 342 s | 248 s |
| compile | 390 s | 215 s |

**Section 66's five conditions, set by set.** The table below is no longer typed from the reports by hand:
`render/denoiseDevice-selfcheck.mjs`'s `rule66Entries` is the rule as code, it reads both committed reports, and the gate
holds `NATIVE_KERNELS_BY_ADAPTER` to what it derives. It prints these lines itself.

| Condition | r18t, Intel | r18u, Intel | r18t, 1080 | r18u, 1080 |
|---|---|---|---|---|
| 0. The compiler is DXC | yes: 10 of 10 "as shipped" dumps DXIL, package said DXC | yes | yes: 10 of 10 DXIL | yes |
| 1. K0 (b), native exact rows | 3 of 3 green | 3 of 3 green | 3 of 3 green | 3 of 3 green |
| 2. K1 against r12 under DXC | 9.02 x at 256 (r12's largest) | 14.01 x at 256 | 24.99 x at 1080p | 15.17 x at 1080p |
| 3. Against r15 under DXC | **0.951 x at 1024** | 1.590 x at 1024 | 1.076 x at 1080p | **0.653 x at 1080p** |
| 4. Against r15 under FXC, unpaired | 0.881 x at 1024 | 1.474 x at 1024 | **0.996 x at 1080p** | 0.605 x at 1080p |
| Qualifies | no, by 3 | **yes** | no, by 4 | no, by 3 |

- **The largest common sizes.** On the Intel r15 reached 1024 under both compilers (1080p predicted 1953 ms, over the
  1500 ms cap); r18u reached 1080p, so 3 and 4 are read at 1024. On the 1080 every set reached 1080p.
- **So `NATIVE_KERNELS_BY_ADAPTER` is `{ "win32/intel/gen-9": "r18u" }`.** The key is the one the Intel's timing gate
  printed. The 1080 gets no entry.
- **`DEFAULT_KERNELS` stays "r15"** for every FXC run, every other adapter, and every platform but win32. Nothing on the
  pinned 0.6.0 moves: its compiler is FXC.

**The predictions, fixed in section 66.**

| Set and GPU | Predicted under DXC | Measured | Predicted under FXC | Measured |
|---|---|---|---|---|
| r18u, Intel | 1.52 x | 1.590 x | 1.41 x | 1.474 x |
| r18t, Intel | 1.03 x | 0.951 x | 0.95 x | 0.881 x |
| r18t, GTX 1080 | 1.09 x | 1.076 x | 1.04 x | 0.996 x |
| r18u, GTX 1080 | 0.66 x | 0.653 x | 0.63 x | 0.605 x |

- **P1 is true.** The Intel's entry is r18u.
- **P2 is true, and for the predicted reason.** r18t cleared r15 under DXC on the 1080 and fell short of r15 under FXC.
  Section 66 predicted 1.04 x there; it measured 0.996 x.
- **P3 is true on both GPUs.** r15's pass on the device's clock was slower under DXC: 985.9 ms against 913.7 ms on the
  Intel at 1024, and 80.9 ms against 74.8 ms on the 1080 at 1080p. Condition 4 is what kept that from flattering a set.

**Reported, deciding nothing.**
- **The compile gate's kernel-level line at 64 x 64, under DXC.** On the Intel, r15's hidden kernel over r18t's was
  1.063 x and over r18u's 1.760 x. On the 1080 both read 0.712 x -- at 64 x 64, where the network-level ratios are
  also under 1 there (r18t 0.785 x, r18u 0.813 x).
- **FXC on the fused head variant `r13-fast-head`** (the compile gate's "use_dxc off" mode): 313 s to build and 1208 ms a
  pass on the Intel, 157 s and 22.8 ms on the 1080. Under DXC it builds in about 0.1 s (144 and 97 ms) and runs in 0.57 and 0.06 ms.
  r15's own fused head (`r15-head-apply`) built in 14 s and 9 s under FXC and ran exact. r13 is not a set anything runs.
- **r12 natively on the Intel** stops at 256 under both compilers: 512 is predicted at 2249 ms, over the cap.

**What the table does today.** `nativeKernelsFor(key, compiler)` was its only reader, and nothing outside its gate called
it. Section 68 gives it a caller, in the same version.

**Sabotages (v4852).** Each against the row it names, the gate run, restored byte-identical (md5 verified):
6 in all, each red by name:
- **T1, the table:** the Intel's entry swapped to r18t -> 2 red (the verdict row, and `nativeKernelsFor`'s).
- **T2, the table:** the 1080 given r18t as well -> 2 red (the same two).
- **T3, the rule:** condition 4 dropped -> 3 red (the verdict, "the rule discriminates", the predictions). Without it the
  1080 would have been given r18t, which is what condition 4 exists to stop.
- **T4, the rule:** the key read off section 61's line -> 3 red (the same three).
- **T5, the rule:** each ratio read at the SMALLEST size -> 2 red ("the rule discriminates", the predictions).
- **T6, P3:** r15 under DXC against FXC read at the smallest common size -> 1 red (the predictions). At 64 x 64 the
  Intel's r15 ran 4.705 ms under DXC and 4.713 under FXC: P3 holds at the size the rule names, not at every size.

**Not in this round.**
- Moving the pin, or any change to an FXC run.
- `PAGE_KERNELS_BY_ADAPTER`: section 63's, unchanged.

## 68. ROUND 20 -- THE NATIVE CALLER: A RUN IN NODE PICKS ITS SET AS THE PAGE DOES, AND SAYS WHY; FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 67 filled `NATIVE_KERNELS_BY_ADAPTER`, and nothing native read it. The page has picked its set by
adapter since section 63 (`pageAdapterKey`, then `pageKernelsFor`, then `createDeviceDenoiser`). A native run had no such
step: every native caller named its set or took `DEFAULT_KERNELS`.

**What changes. Built and run here first, on SwiftShader.**
- **`render/denoiseDevice.mjs`:**
  - `nativePick(adapter, { compiler, platform })` gives `{ key, kernels, why }`. The key is `nativeAdapterKey`'s; the set is
    `nativeKernelsFor`'s for that key and the run's compiler, which is read off the package with the device's flags
    (`tools/ship/headlessGpu.mjs`'s `nativeCompiler`), because the adapter cannot say. `why` names which of four answers it
    is: the table's set under DXC, a run that is not DXC, an adapter the table does not name, or no key.
  - A table set is only ever given under DXC, which builds every set (`nativeSetsFor`), so no pick is a set FXC cannot
    build. A first draft also fell back to `DEFAULT_KERNELS` when `nativeSetsFor` refused the pick; that branch could never
    run, and was removed rather than kept as a check that checks nothing.
  - `createNativeDenoiser(adapter, dev, net, { H, W, C, compiler, platform })` builds `createDeviceDenoiser` on that pick,
    and hands the pick back beside the denoiser.
- **`tools/denoiseDevice.mjs --which`** is the caller. It reads the package, the compiler and the adapter; prints the key, the
  set and why; builds that set; runs one pass on a fixed synthetic 64 x 64 input; and prints the pass's time and its worst
  relative difference from the f64 network on the CPU. It writes nothing. Its exit is 0 when the output is finite.
- **`render/denoiseDevice-selfcheck.mjs`:**
  - `nativePick` on the rig's two adapters, stubbed: the Intel under DXC takes r18u; the Intel under FXC or an unread
    compiler, the 1080, an adapter off win32, and no adapter all take r15, each with its reason.
  - `createNativeDenoiser` on this box's device, with a fixture table naming this adapter r18u under DXC: the denoiser it
    hands back is built on r18u's kernels. This box picks r15 whatever a caller does, so without the fixture a builder that
    ignored the pick would pass.
  - `--which` run as a child, as the rig runs it: its key and set are the gate's own `nativePick` on this adapter, and its
    pass is within 1e-4 of the f64 network.
- **The pilot here:** key `linux/google/swiftshader`, no entry, r15; one pass in about 0.4 s; worst relative difference
  1.05e-6.

**The predictions, fixed now.** On each GPU, `node tools/denoiseDevice.mjs --which` run twice: once as installed
(node-webgpu 0.6.0, the pin) and once with `SWEK_WEBGPU` naming 0.6.2.

| GPU | node-webgpu | Compiler | Key | Set | Why |
|---|---|---|---|---|---|
| Intel gen-9 | 0.6.0 | FXC | `win32/intel/gen-9` | r15 | the entry is for a DXC run |
| Intel gen-9 | 0.6.2 | DXC | `win32/intel/gen-9` | **r18u** | section 67's |
| GTX 1080 | 0.6.0 | FXC | `win32/nvidia/pascal` | r15 | no entry |
| GTX 1080 | 0.6.2 | DXC | `win32/nvidia/pascal` | r15 | no entry |

- **Q1:** each of the four runs prints exactly that key, set and reason, and exits 0.
- **Q2:** each pass is within 1e-4 of the f64 network.
- **A run that differs is a finding, not a retry.** The likeliest causes are a compiler read wrongly off the package, or a
  key the timing gate did not print.

**On the rig.** On each GPU, in the verified clone:
`node tools/denoiseDevice.mjs --which`; then `set SWEK_WEBGPU=%TEMP%\swek-webgpu-0.6.2\node_modules\webgpu`, the same
command again, and `set SWEK_WEBGPU=`. Send back the six printed lines from each GPU.

**Sabotages (v4852).** Six, against `render/denoiseDevice.mjs` and `tools/denoiseDevice.mjs`, each restored byte-identical:
- **U1:** `nativePick` reading every run as DXC -> 1 red (the pick row).
- **U2:** `nativePick` ignoring the table it is handed -> 1 red (the builder row).
- **U3:** `createNativeDenoiser` building `DEFAULT_KERNELS` -> 1 red (the builder row).
- **U4:** `nativePick` keyed with "win32" whatever the platform -> 1 red (the pick row).
- **U5:** `createNativeDenoiser` building r15 when it picked r18u -> 1 red (the builder row).
- **U6:** `--which` reading the compiler with `use_dxc` disabled -> **0 red here.** Linux has no D3D compiler, so the flags
  change nothing on this box. On the rig, Q1 reads the compiler line: 0.6.2 would print FXC and take r15 on the Intel.

**Not in this round.**
- Moving the pin. A native caller on 0.6.0 compiles with FXC and takes r15 on every adapter, so nothing pinned changes.
- Any caller other than `--which`. The engine has no native denoiser caller today.

**The outcome (v4853).** Each GPU ran `--which` as installed and with 0.6.2, at v4852. The output is committed as received,
`render/denoise-rig-r20-which.txt`, and `render/denoiseDevice-selfcheck.mjs` holds it: each run is parsed, held to the table
above, and each reason re-derived from `nativePick` on the adapter and compiler the line itself names.

| GPU | node-webgpu | Compiler | Set | Reason | Pass | Worst against the f64 network |
|---|---|---|---|---|---|---|
| Intel gen-9 | **0.6.1** | FXC | r15 | the entry is for a DXC run | 15.2 ms | 1.05e-6 |
| Intel gen-9 | 0.6.2 | DXC | **r18u** | section 67's | 10.7 ms | 1.05e-6 |
| GTX 1080 | 0.6.0 | FXC | r15 | no entry | 28.3 ms | 1.01e-6 |
| GTX 1080 | 0.6.2 | DXC | r15 | no entry | 6.0 ms | 1.01e-6 |

- **Q1 holds.** Every key, set, reason and compiler is the predicted one.
- **Q2 holds.** The worst pass is 1.05e-6 from the f64 network.
- **One thing the table did not foresee: the Intel's global install is 0.6.1, not the pinned 0.6.0.** It changes nothing
  here -- 0.6.0 and 0.6.1 both force FXC (section 64) -- but it means the Intel's "as installed" runs, its verifies among
  them, were not on the pin. The gate reads "before 0.6.2" for the as-installed row, not "0.6.0", and prints which package
  each GPU had.
- **The 1080's runs came from `C:\swek_src`,** a clone that has `--which`, so v4852 or later.
- **Sabotages (v4853):** the Intel's DXC prediction changed to r15; the 1080's DXC reason changed in the rig file; the Intel's
  DXC pass moved to 2e-4 in the rig file; the version test reading 0.6.1 as DXC-capable. Each 1 red, by name, restored
  byte-identical.

## 69. ROUND 21 -- MOVING THE PIN TO node-webgpu 0.6.2: THE WHOLE NATIVE SWEEP, HERE AND ON BOTH GPUS; FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 64 named the condition for moving the pin: a whole native sweep on 0.6.2, here and on the rig,
green and exact. Sections 65-68 ran the denoiser's native gates on 0.6.2 and nothing else. The pin is the whole tree's: every
gate that makes a node-webgpu device moves from FXC to DXC on D3D12 with it. Until it moves, sections 67 and 68 apply only
on a console with `SWEK_WEBGPU` set.

**What the pin is.** Two places name 0.6.0: `.claude/hooks/session-start.sh` (`npm install -g webgpu@0.6.0`, the
sandbox's install) and `tools/ship/headlessGpu.mjs`'s `LICENCES.nodeWebgpu`. On the rig it is whatever `npm install -g`
last put there -- section 68 found 0.6.1 on the Intel.

**What changes now. Built and run here first.**
- **`tools/ship/realGpuRun.mjs --native`** runs the whole native sweep: `nativeGateList` reads every gate's code (comments
  and strings stripped by `sourceScan.mjs`'s `codeOnly`) for headlessGpu's loader or one of its two compute runners, imported
  or called. 26 gates here. A call-only first draft found 22: four gates import a runner under another name.
- **Its browser flags are the gates' own,** as a verify runs them, unless `SWEK_LAUNCH_ARGS` names some. An FSR run hands
  every gate the hardware flags. Here that would redden SwiftShader-measured rows under both packages alike -- the 1080's
  old in-app run read 27 reds that way -- and bury the one thing this sweep asks.
- **`nativeSweepCompare(pinned, candidate)`** is the rule below, as code, held on fixtures in `realGpuRun-selfcheck.mjs`.

**The rule, fixed now.** The pin moves to 0.6.2 when all three hold:
- **H, here:** `realGpuRun --native` with `SWEK_WEBGPU` naming 0.6.2, against the same on the pin, at one commit: every
  gate holds by `nativeSweepCompare`.
- **I, on the Intel gen-9** and **N, on the GTX 1080:** the same pair of runs on each GPU, at one commit, with the pin as
  installed (0.6.0: the Intel first runs `npm install -g webgpu@0.6.0`) and with 0.6.2. Every gate holds.
- **A gate holds** when it is green under 0.6.2, or red under both packages with the same failing rows, compared by label
  (a row's text before its detail, whose numbers move run to run). That second case is a red 0.6.2 did not bring. It does
  not block the pin; it is named, and is its own work.
- **A gate fails the rule** when it is red under 0.6.2 and green under 0.6.0 (a regression), red under both with different
  rows (changed), or in one report and not the other. A gate stopped at `realGpuRun`'s 30-minute cap is a red with no rows.
- **"Exact" is each gate's own.** Section 64 said "exact, not the same": DXC's shaders are not FXC's bytes. Every exact row in
  the sweep already says what exactness it asks -- a twin cell for cell, a fused mirror, an f32 floor -- and keeps asking it.
- **"Section 64's wording, refined."** It said "green". Read literally, a gate red on the pin as well would block the pin
  forever for a reason that is not the pin's. The refinement is fixed here, before any rig run.

**Predictions, fixed now, deciding nothing.**
- **Q1, here: every gate holds.** The pilot below is H.
- **Q2, the 1080, and Q3, the Intel: every gate holds.** For the denoiser's gates, sections 65 and 67 already ran them on
  0.6.2, green on both GPUs. The other 22 have never run on D3D12 under DXC. The risk is rows that demand a CPU twin's bits:
  DXC may contract a multiply-add FXC kept apart. The denoiser's rows allow the fused mirror; whether the other 22's rows do
  is not read here, and those rows are where a regression would show.
- **Q4, reported, deciding nothing:** the denoiser's native timings. Section 67's P3 measured r15 about 7 % slower under DXC
  than FXC on both GPUs.

**What moving the pin does, once the rule holds.** The session-start hook installs 0.6.2 and `LICENCES.nodeWebgpu` says
0.6.2; the rig runs `npm install -g webgpu@0.6.2`. On win32, every native D3D12 gate compiles with DXC, and `nativePick`
gives the Intel r18u by default (section 67). The gates that time FXC keep doing so through their own flags (`use_dxc`
disabled). 0.6.2 carries Microsoft's DXC beside `dawn.node`; the verdict round reads its licence. The tree vendors nothing.

**On the rig.** On each GPU, in the verified clone, from a command prompt:
```
cd WebGLEngine
npm install -g webgpu@0.6.0
node tools/ship/realGpuRun.mjs --native --out native-sweep-0.6.0.json
set SWEK_WEBGPU=%TEMP%\swek-webgpu-0.6.2\node_modules\webgpu
node tools/ship/realGpuRun.mjs --native --out native-sweep-0.6.2.json
set SWEK_WEBGPU=
```
Send back both JSON files from each GPU.

**The pilot here: H holds.** `realGpuRun --native` on 0.6.0 (the pin) and on 0.6.2, at one commit (9d5b2d43; first taken at 694d8cd4, re-run when the writer began stamping generatedFrom), committed
as written: `tools/ship/native-sweep-r69-linux-0.6.0.json` and `-0.6.2.json`. On SwiftShader through Vulkan, the 26 gates are
26 green under both packages: 0 regressions, 0 changed reds, 0 unpaired. `realGpuRun-selfcheck.mjs` holds the pair to the rule.
- **A first pilot ran its two sweeps either side of a commit.** No gate's code changed between them, and the rule as written
  said "one commit" -- but `nativeSweepCompare` did not ask. It asks now, and the pilot was re-run on one commit.
- **What H cannot say.** There is no D3D12 here, so neither compiler ran: this box shows that 0.6.2's Dawn changes nothing the
  native gates ask on Vulkan. I and N are the question.

**Sabotages (v4853).** Against `tools/ship/realGpuRun.mjs`, each red by name, restored byte-identical:
- **X1:** `NATIVE_USE` call-only, missing the four gates that import a runner under another name -> 2 red.
- **X2:** `nativeGateList` reading comments and strings -> 2 red (this gate joins the sweep, by its strings).
- **X3:** the native sweep taking an FSR run's hardware flags -> 2 red.
- **X4:** a red under both packages holding whatever its rows -> 1 red.
- **X5:** a regression read as a held gate -> 1 red.
- **X6:** the rule not asking for one commit -> 1 red.

**Not in this round.** Moving the pin. That is the verdict round's, once H, I and N are read.

## 70. ROUND 21 -- THE VERDICT: THE PIN MOVES TO node-webgpu 0.6.2

**What arrived.** Two native sweeps per GPU, `realGpuRun --native` on the pin and on 0.6.2, at f36fee83 (v4853's release).
Committed as received: `tools/ship/native-sweep-r69-intel-gen9-0.6.0.json` and `-0.6.2.json`, and the same for `gtx1080`.
- **The Intel's first pinned sweep was a 0.6.2 sweep.** `SWEK_WEBGPU` was still set in that console, so the package loaded
  was 0.6.2 both times. The rule refused the pair -- two sweeps of one package -- and the pinned sweep was re-run at the same
  commit with `SWEK_WEBGPU` cleared. That refusal is why the rule asks for two packages, and it is not committed.

**Section 69's rule, read off all three boxes.** `nativeSweepCompare`, held in `tools/ship/realGpuRun-selfcheck.mjs`:

| Box | Commit | Green on 0.6.0 | Green on 0.6.2 | Regressions | Red on the pin, green on 0.6.2 |
|---|---|---|---|---|---|
| H, here (SwiftShader, Vulkan) | 9d5b2d43 | 26 of 26 | 26 of 26 | 0 | none |
| I, Intel gen-9 | f36fee83 | 23 of 26 | **26 of 26** | 0 | denoiseDevice, crossBackend, deviceCompute |
| N, GTX 1080 | f36fee83 | 24 of 26 | **26 of 26** | 0 | denoiseDevice, crossBackend |

- **H, I and N hold.** No gate is worse on 0.6.2 anywhere; no gate is red on both packages; nothing is unpaired.
- **So the pin moves to 0.6.2.**

**The predictions, fixed in section 69.**
- **Q1 (here) held.**
- **Q2 (the 1080) and Q3 (the Intel) held, and more than held.** The risk named -- rows that demand a CPU twin's bits under a
  compiler that may contract a multiply-add -- went the other way: the pin was the one whose bits parted. On the pin:
  - crossBackend read `hmcGpu.WGSL_HMC_PROBE` 2,047 of 16,384 floats apart on the Intel, and `splitSumWgsl.BRDF_LUT_WGSL`
    and `fresnelF82Wgsl.F82_TINT_WGSL` apart on the 1080; deviceCompute read the same probe apart on the Intel.
    Under DXC all three agree. Why DXC's bits meet the browser's and FXC's do not is not read here.
  - denoiseDevice stopped at `realGpuRun`'s 30-minute cap on the 1080, and on the Intel the native caller's child process
    died with exit 3221225477 (an access violation) under 0.6.0. Both are green on 0.6.2.
- **Q4, reported:** the denoiser's native timings move as section 67's P3 measured: r15 about 7 % slower under DXC.

**What moves.**
- **`tools/ship/headlessGpu.mjs`'s `LICENCES.nodeWebgpu.version` is 0.6.2,** and a `dxc` entry records the licence read
  from the package: DXC ships under the LLVM release licence (University of Illinois/NCSA), with its third-party notices,
  inside `dist/win32-*` beside `dawn.node`. The tree vendors nothing; the notices travel inside the npm package.
- **`.claude/hooks/session-start.sh` installs `webgpu@0.6.2`,** named once as `WEBGPU_PIN`, and its warm path now asks the
  installed version: a container cached on 0.6.0 used to read "already present" and keep it. `headlessGpu-selfcheck` holds
  the hook's pin to the record.
- **The rig installs 0.6.2:** `npm install -g webgpu@0.6.2`. From then on every native D3D12 run compiles with DXC, and
  `nativePick` gives the Intel r18u by default (section 67). The gates that time FXC keep doing so with `use_dxc` disabled.
- **Nothing in the denoiser's tables changes.** `NATIVE_KERNELS_BY_ADAPTER`, `PAGE_KERNELS_BY_ADAPTER` and `DEFAULT_KERNELS`
  are as sections 63 and 67 left them.

**Sabotages (v4856).** Each restored byte-identical:
- the Intel's pair read as 0.6.2 twice -> 1 red (the I/N row);
- the hook's `WEBGPU_PIN` set back to 0.6.0 -> 1 red (the pin row);
- the record's DXC licence spelled MIT -> 1 red (the licence row).

**Not in this round.** The text of the gates' own SKIP and refusal lines still names 0.6.0 where it describes what FXC did in
sections 57-60; those are records of what was measured, and stay.

## 71. ROUND 22 -- ON THE NEW PIN: THE DEFAULT PICKS, AND ROUND 16'S SHAPES NATIVELY UNDER DXC; FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 70 moved the pin to node-webgpu 0.6.2, so a native run on D3D12 now compiles with DXC as shipped,
with no `SWEK_WEBGPU`. Two things follow that no run has shown yet:
- **D, the defaults.** Sections 67 and 68 were read through `SWEK_WEBGPU`. On the pin itself, the Intel's native default
  should be r18u and the 1080's r15, with nothing set.
- **B, round 16's shapes.** They have stood aside on every D3D12 adapter since section 57: node-webgpu's FXC built none of
  them at 32 inputs, and section 66 kept them aside under DXC too, because the rig's DXC probe ran round 17's shapes only.
  Chrome's DXC built all ten and ran none faster (section 58). Natively under DXC they have never been asked.

**What changes now.** Nothing in the code. This section fixes the rule; the verdict round applies it.

**The pilot here (SwiftShader, Vulkan; no D3D compiler, so it says nothing about DXC).** `denoiseBuildProbe --probe r16
--native-only` on the pin: all ten shapes built (0.7 to 3.8 s), every one exact at 64 x 64, every cell the twin's, none
fused. On this CPU the fast kernel's pass was 66 ms and the tile shapes' 59 to 457 ms -- a CPU's times, deciding nothing.

**The rule, fixed now.**
- **D holds on a GPU** when its plain `realGpuRun --only denoise`, with `SWEK_WEBGPU` unset, reports node-webgpu 0.6.2 chosen by
  the resolver's list with compiler DXC; all three denoiser gates are green; and the timing gate's native ladder times all four
  of `TIMED_SETS`. And `node tools/denoiseDevice.mjs --which`, also unset, prints the GPU's key, compiler DXC, and the set
  section 67's table gives it: r18u on the Intel, r15 on the 1080, each within 1e-4 of the f64 network.
- **B holds on a GPU** when `node tools/denoiseBuildProbe.mjs --probe r16 --native-only` builds all ten shapes within the 180 s
  cap, each dump says DXIL, and every one is exact at 64 x 64.
- **If B holds on both GPUs,** conv2d's round-16 rows stop standing aside on D3D12 under DXC: `brain/conv2d-selfcheck.mjs`'s
  stand-aside narrows to FXC alone, as round 17's did in section 66. A shape that fails on either GPU keeps the stand-aside, and
  is named.
- **Speed decides nothing here.** Each shape's 64 x 64 pass is reported against the fast kernel's in the same run. A shape at
  least 1.05 x faster than the fast kernel on a GPU is named as the subject of a round 23, fixed before its run; none moves a set.

**Predictions, fixed now.**
- **D holds on both GPUs.** Sections 67 and 68 measured exactly these picks through `SWEK_WEBGPU`, and the pin is that package.
- **B holds on both GPUs.** DXC built round 18's tile-inline kernel in 0.15 to 0.21 s on both (section 67), and Chrome's DXC built
  all ten round-16 shapes in under 0.7 s each (section 58).
- **No round-16 shape is 1.05 x faster than the fast kernel natively.** Chrome's DXC ran every 32-input shape 1.15 to 6.63 x
  slower than the fast kernel (section 58), and the native passes have tracked Chrome's within about a quarter (section 65).

**On the rig.** On each GPU, after v4856 or later is pulled and `npm install -g webgpu@0.6.2` has run, from a console with
`SWEK_WEBGPU` cleared:
```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out real-gpu-denoise-r22.json
node tools/denoiseDevice.mjs --which
node tools/denoiseBuildProbe.mjs --probe r16 --native-only --out denoise-probe-r16-native-dxc.json
```
Send back both JSON files and the three `--which` lines from each GPU.

**Not in this round.** Retiring the FXC paths. With the pin on 0.6.2, FXC runs only where a gate asks for it by disabling
`use_dxc` (the timing gate's FXC ladder, the compile gate's "use_dxc off" mode); those stay, as the comparison every DXC
reading is held to.

## 72. ROUND 22 -- THE VERDICT: D AND B HOLD ON BOTH GPUS; ROUND 16'S STAND-ASIDE NARROWS TO FXC; TWO SHAPES NAME A ROUND 23 ON THE INTEL

**What arrived.** From each GPU at 0c5f68bb (v4858's release), with `SWEK_WEBGPU` cleared: `realGpuRun --only denoise`, the
three `--which` lines, and `denoiseBuildProbe --probe r16 --native-only`. The two probe reports are committed as received:
`render/denoise-probe-r16-native-dxc-0.6.2-intel-gen9.json` and `-gtx1080.json`.

**D holds on both GPUs.**
- Both runs report node-webgpu 0.6.2, chosen by the resolver's list, compiler DXC. All three denoiser gates are green (exact
  1/1, timing 2/2), and the timing gate's native ladder timed r12, r15, r18t and r18u.
- `--which` on the Intel: key win32/intel/gen-9, kernels r18u (section 67's entry, under DXC), worst 1.05e-6.
- `--which` on the 1080: key win32/nvidia/pascal, kernels r15 (no entry -- DEFAULT_KERNELS), worst 1.01e-6.
- Both within 1e-4 of the f64 network. The prediction held.

**B holds on both GPUs.** All ten of round 16's shapes built natively under DXC -- 1.3 s at worst on the Intel, 0.4 s on the
1080, against the 180 s cap. Every dump says DXC (DXIL), and every shape is exact at 64 x 64. The prediction held.

**So, as the rule fixed: round 16's device rows stop standing aside on D3D12 under DXC.** `brain/conv2d-selfcheck.mjs`'s
`nativeStandAside` exempts round 16 under DXC as it has exempted round 17 since section 66, so only FXC (or an unread compiler)
stands aside there. Round 17's inline-weight rows compare with round 16's hoisted tile again on D3D12 under DXC, as they always
have off D3D12. Section 5e's row is turned over to say so; two sabotages, each red by name: round 16 standing aside under DXC
again (1 red), and `r17Comparator` always "fast" (2 red: that row and the off-D3D12 row).

**Speed (decides nothing): the third prediction fails on the Intel.** Each 32-input shape's 64 x 64 pass against the fast
kernel's (fast-32) in the same run, device clock, 30 passes:

| Shape | Intel gen-9 | GTX 1080 |
|---|---|---|
| fast-32 (the fast kernel) | 1.152 ms | 0.101 ms |
| tile2-zero-32 | 0.939 ms -- **1.23 x faster** | 0.138 ms -- 0.73 x |
| tile1-skip-32 | 1.006 ms -- **1.15 x faster** | 0.104 ms -- 0.97 x |
| tile4-zero-32 | 1.277 ms -- 0.90 x | 0.141 ms -- 0.72 x |
| tile2g4-zero-32 | 1.490 ms -- 0.77 x | 0.103 ms -- 0.98 x |
| tile2g4-skip-32 | 1.529 ms -- 0.75 x | 0.118 ms -- 0.86 x |
| tile2-skip-32 | 1.428 ms -- 0.81 x | 0.160 ms -- 0.63 x |
| tile4-skip-32 | 2.082 ms -- 0.55 x | 0.176 ms -- 0.57 x |

The two 10-input shapes (tile2-zero-10, tile4-zero-10) do the first layer's 10 -> 32, a third of a 32 -> 32 layer's work, and
are not compared with a 32 -> 32 kernel. On the 1080 no shape is 1.05 x faster: the prediction held there. On the Intel two are,
and by the rule each is named as the subject of a round 23. Two things are said with them, because they bear on that round:
- **tile2-zero-32 is round 18's r18t kernel in all but name.** Its DXIL is the same length as r18t-tile-inline-3x3's (1,981
  lines, in the same run's compile gate), and section 67 timed r18t natively on this Intel at 0.95 x r15 at 1024 x 1024 under DXC.
- **The Intel's 64 x 64 readings move by a fifth between modes.** The same run's compile gate timed r18t's hidden kernel at
  1.23 x the fast kernel as shipped and 1.00 x with `use_dxc` -- one kernel, one compiler, two processes. A 64 x 64 margin on this
  GPU is a hypothesis.

## 73. ROUND 23 -- THE TWO SHAPES THE INTEL NAMED, AT THE SIZES A FRAME IS: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 72 named tile2-zero-32 and tile1-skip-32 on the Intel gen-9: each 1.05 x faster than the fast
kernel at 64 x 64, natively under DXC. Section 72 also says why a 64 x 64 margin there decides nothing. This round asks the
same probe at sizes a frame is, twice.

**What changes now.** Nothing in the code: `denoiseBuildProbe --probe r16 --sizes` already times every round-16 shape at any size
list (section 56's tool). This section fixes the rule.

**The pilot here (SwiftShader, Vulkan; no D3D compiler, so it says nothing about DXC).** `--probe r16 --native-only --sizes
64,256`: all ten built and exact at 64 x 64. At 256 x 256 the fast kernel took 798 ms a pass, tile2-zero-32 522 ms (1.53 x
faster), tile4-zero-32 463 ms (1.72 x) and tile1-skip-32 1,021 ms (0.78 x) -- a CPU's times, which say the probe runs at every
size and nothing about a GPU. 1024 x 1024 was not run here: a CPU device takes minutes a pass.

**The rule, fixed now.**
- **On the Intel,** `denoiseBuildProbe --probe r16 --native-only --sizes 64,256,1024` is run TWICE, one after the other, from the
  same clone and commit. A named shape **holds** when it is at least 1.05 x faster than fast-32 at 256 x 256 AND at 1024 x 1024,
  in BOTH runs, on the device's clock. Anything else and it is retired, named, with its four ratios.
- **On the 1080,** the same two runs, as the control: no shape there was 1.05 x faster at 64 x 64, and a shape that is at the
  larger sizes is reported, not acted on -- the 1080 named nothing in section 72.
- **A shape that holds names a round 24 and moves no set.** The Intel's set is r18u, whose hidden kernel ran 1.5 to 1.6 x r15's
  natively under DXC (section 67), and r15's hidden kernel is the fast kernel. So a shape that holds here has to beat r18u, not r15,
  before any set could change -- that comparison is round 24's, and would be fixed before its run.

**Predictions, fixed now.**
- **tile2-zero-32 is retired.** It is r18t's kernel, and r18t ran 0.95 x r15 at 1024 x 1024 natively on the Intel under DXC
  (section 67): at the larger sizes it should land within a few per cent of the fast kernel, not 5 % ahead.
- **tile1-skip-32 is retired.** Chrome's DXC ran every 32-input round-16 shape slower than the fast kernel at every size
  (section 58), and section 72's 1.15 x is a single 64 x 64 reading on the GPU whose 64 x 64 readings moved by a fifth.
- **No shape holds on the 1080.**

**On the rig.** On each GPU, from the verified clone at v4859 or later, `SWEK_WEBGPU` cleared:
```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/denoiseBuildProbe.mjs --probe r16 --native-only --sizes 64,256,1024 --out denoise-probe-r23-a.json
node tools/denoiseBuildProbe.mjs --probe r16 --native-only --sizes 64,256,1024 --out denoise-probe-r23-b.json
```
Send back both JSON files from each GPU. Don't commit or pull between the two runs.

**Not in this round.** Any change to a set, and the 10-input shapes: they do the first layer only, and section 72 does not
compare them with a 32 -> 32 kernel.

## 74. ROUND 23 -- THE VERDICT: NEITHER INTEL SHAPE HOLDS; ON THE 1080, r18t's KERNEL DOES, AND THAT NAMES ROUND 24

**What arrived.** Two `denoiseBuildProbe --probe r16 --native-only --sizes 64,256,1024` runs per GPU, back to back, at b2a4a1d2
(v4859's release), node-webgpu 0.6.2 under DXC. Committed as received: `render/denoise-probe-r23-a-intel-gen9.json` and `-b-`,
and the same for `gtx1080`. Round 22's two `realGpuRun --only denoise` reports, which section 75 reads, are committed beside
them as `render/denoise-rig-r22-intel-gen9.json` and `-gtx1080.json`.

**The rule.** A named shape holds when it is at least 1.05 x faster than fast-32 at 256 x 256 AND 1024 x 1024 in both runs.
Ratios are fast-32's pass over the shape's, device clock, at 64 / 256 / 1024:

| Shape | Intel, run a | Intel, run b | 1080, run a | 1080, run b |
|---|---|---|---|---|
| tile2-zero-32 (named) | 1.06 / 1.04 / 1.08 | 1.07 / 1.16 / 0.74 | 0.83 / **1.21 / 1.14** | 0.84 / **1.24 / 1.14** |
| tile1-skip-32 (named) | 1.01 / 0.99 / 0.77 | 0.89 / 0.72 / 0.56 | 1.12 / 1.17 / 1.02 | 1.10 / 1.18 / 1.01 |
| tile2g4-zero-32 | 0.83 / 0.67 / 0.54 | 0.70 / 0.62 / 0.40 | 1.16 / 1.14 / 1.02 | 1.14 / 1.15 / 1.03 |
| tile2-skip-32 | 1.23 / 1.14 / 0.86 | 1.02 / 0.96 / 0.62 | 0.73 / 1.02 / 1.03 | 0.71 / 1.01 / 1.06 |
| tile4-zero-32 | 0.79 / 0.62 / 0.47 | 0.90 / 0.61 / 0.27 | 0.88 / 1.01 / 0.95 | 0.85 / 1.02 / 0.81 |
| tile2g4-skip-32 | 0.85 / 0.73 / 0.56 | 0.74 / 0.58 / 0.41 | 0.98 / 1.03 / 0.96 | 1.00 / 1.09 / 0.96 |
| tile4-skip-32 | 0.72 / 0.69 / 0.55 | 0.61 / 0.62 / 0.41 | 0.66 / 0.86 / 0.88 | 0.66 / 0.88 / 0.88 |

**On the Intel, both named shapes are retired, as predicted.** tile2-zero-32 misses at 256 in run a (1.04) and at 1024 in run b
(0.74); tile1-skip-32 is slower than the fast kernel at every larger size in both runs -- section 72's 1.15 x was one 64 x 64
reading. Run b read slower than run a across the board on this GPU (tile4-zero-32 at 1024: 425 ms, then 784 ms), the second
time in two rounds that one Intel run has disagreed with the next by a fifth or more.

**On the 1080, the prediction "no shape holds" failed.** tile2-zero-32 is 1.21 and 1.14 x the fast kernel at 256 and 1024 in run
a, and 1.24 and 1.14 x in run b; it is slower only at 64 x 64, which is why section 72's 64 x 64 probe did not see it. By the rule
the 1080's result is reported and acts on nothing. What it says is not new: tile2-zero-32 is r18t's kernel (the same 2,029-line
DXIL), and section 67 timed r18t natively on this GPU at 1.076 x r15 under DXC at 1920 x 1080. The 1080 was refused an entry
then by condition 4 alone -- r18t had also to beat r15 under FXC. That is section 75's subject.

## 75. ROUND 24 -- THE 1080's NATIVE ENTRY, ASKED AGAIN WITHOUT CONDITION 4: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 66 gave a native run's table five conditions, and condition 4 asked a set to beat r15 under FXC
because "a native caller that moves to 0.6.2 changes its compiler as well as its set" -- it had to beat what that caller ran
then. Section 70 moved the pin to 0.6.2, and section 72 measured the result: with nothing set, every native run on D3D12 now
compiles with DXC. The caller condition 4 protected no longer exists; what a native caller runs today on the 1080 is r15 under
DXC, which is condition 3. On the 1080, condition 4 was the only one r18t failed (section 67), and section 74 has just measured
r18t's kernel ahead of the fast kernel at frame sizes on the same GPU.

**What changes now.** Nothing in the code. This section fixes the rule.

**The rule, fixed now.**
- **Section 66's conditions 0 to 3, unchanged; condition 4 dropped.** 0: the run's compiler is DXC. 1: the set's native K0 rows
  are green. 2: K1 against r12 natively under DXC (at least 2 x at the largest size both measured, at least 1 x at every size).
  3: at least 1.05 x as fast as r15 under DXC, at the largest size the set and r15 were both measured on the native ladder.
- **Twice.** On each GPU, `realGpuRun --only denoise` is run twice, one after the other, from the same clone and commit, with
  `SWEK_WEBGPU` cleared. A set qualifies on a GPU only when 0 to 3 hold in BOTH runs.
- **The 1080's entry.** If r18t or r18u qualifies there, `NATIVE_KERNELS_BY_ADAPTER` gains `"win32/nvidia/pascal"` with the
  qualifying set -- the one whose smaller condition-3 ratio of its two runs is the larger; a tie goes to r18u, as in section 66.
  If neither qualifies, the 1080 keeps no entry and DEFAULT_KERNELS (r15).
- **The Intel is the control and its entry is not re-decided.** Its two runs are reported against the same conditions. If r18u
  fails a condition there in either run, that is named as the subject of a later round, and the entry stays.
- **Every FXC run still gets DEFAULT_KERNELS,** as the table has always said: a run that disables `use_dxc` changes compiler,
  and nothing here measured a set under FXC.
- **The verdict round** moves `render/denoiseDevice-selfcheck.mjs`'s `rule66Entries` to the rule above (with condition 4 kept
  as a reported line, not a condition), derives the table from the committed round-24 reports, and names each change.

**Predictions, fixed now.**
- **r18t qualifies on the 1080 in both runs, and its entry is r18t.** Round 22's report, committed above, reads r18t at 1.088 x
  r15 under DXC at 1920 x 1080, K1 26.02 x at 1024 x 1024 and above 1 x at every size, all three denoiser gates green, compiler
  DXC. Section 67's run read 1.076 x. Both clear 1.05 by a margin of the size the two have differed by.
- **r18u does not qualify on the 1080** (0.653 x in round 22's report).
- **The Intel's control holds: r18u meets 0 to 3 in both runs** (round 22: 1.50 x at 1024 x 1024).
- **The margin is thin on the 1080:** 1.088 and 1.076 are within 4 % of the bar. A run that lands under it is the rule working,
  and the 1080 keeps r15.

**On the rig.** On each GPU, from the verified clone at v4860 or later, `SWEK_WEBGPU` cleared:
```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r24-a.json
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r24-b.json
```
Send back all four JSON files. Don't commit or pull between the two runs.

**Not in this round.** The page's table (section 63's, Chrome on Windows: r18t on the 1080 already), and any set under FXC.

## 76. ROUND 24 -- THE VERDICT, READ STRICTLY: THE 1080 KEEPS r15, BECAUSE BOTH GPUS' SECOND RUNS CRASHED

**What arrived.** Two `realGpuRun --only denoise` runs per GPU at 16e69a09 (v4860's release), `SWEK_WEBGPU` cleared, node-webgpu
0.6.2 under DXC. Committed as received: `render/denoise-rig-r24-a-intel-gen9.json` and `-b-`, and the same for `gtx1080`.

**Condition 3, where it was measured** (the set's median over r15's, device clock, at the largest common size):

| | Run a | Run b |
|---|---|---|
| r18t, GTX 1080 (1920 x 1080) | 1.086 x | 1.091 x |
| r18u, GTX 1080 | 0.659 x | 0.658 x |
| r18u, Intel gen-9 (1024 x 1024), the control | 1.514 x | 1.527 x |

**Both run b's crashed, with the same code.** Windows exit 3221225477 (0xC0000005, an access violation), in a native child:
- **On the 1080,** in the compile gate's "use_dxc off" mode -- FXC -- the r13-fast-head and r15-head-apply children exited with no
  result, and the gate went red on "every native child reported a result". The same gate's browser part said playwright was not
  installed, in the clone whose run a had run it; that is unexplained here and named.
- **On the Intel,** in the exact gate's round-20 row: the native caller (`tools/denoiseDevice.mjs --which`, r18u) exited with it.
None of these rows is one sections 66 and 75 name. The as-shipped DXIL row and every K0 row were green in all four runs.

**The gap, and the reading taken.** Sections 66 and 75 wrote condition 0 as "the compile gate's row ... is green" and condition 1
as "the set's native rows in the exact gate are green". `rule66Entries`, which applied section 66 from v4852, asks the WHOLE compile
gate and the WHOLE exact gate to be green. Read the prose's way, r18t qualifies in both 1080 runs and the 1080 takes it; read the
code's way, both run b's fail (the 1080's at condition 0, the Intel's at condition 1) and nothing qualifies in both. **The code's
reading is taken.** Choosing the reading that gives the new default, after the data, on runs whose own gates crashed, is the choice
a pre-registration exists to prevent. Keith's call, made after the four reports and both readings were laid out side by side.

**So:** `NATIVE_KERNELS_BY_ADAPTER` is unchanged -- `"win32/intel/gen-9": "r18u"` only -- and the 1080's native default stays r15.
`render/denoiseDevice-selfcheck.mjs` derives that from the four reports with section 75's rule (`rule66Entries(rep, { fxc: false })`,
condition 4 reported, not asked) and holds that a green run b would give r18t in both. Section 75's predictions: r18t on the 1080
held in run a and was not reached in run b; r18u not qualifying on the 1080 held; the Intel's control held in run a and failed
condition 1 in run b, by the crash. **What the conditions say about r18t is not in doubt; what two crashes in two run b's are is.**

## 77. ROUND 24b -- THE CRASH FIRST, THEN SECTION 75's TWO RUNS AGAIN, READ STRICTLY: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 76 kept the 1080 on r15 because both GPUs' second runs crashed with an access violation in a native
child. The rule's verdict waits on runs that do not crash, and nothing here can reproduce one: SwiftShader has no D3D12.

**What changes now.** Nothing in the code but section 76's rows. This section fixes the rule.

**Step 1, the crash, reported and deciding nothing.** On each GPU, the gate that crashed there, three times one after another:
`node render/denoiseCompile-selfcheck.mjs` on the 1080 and `node render/denoiseDevice-selfcheck.mjs` on the Intel. Each run's exit
code and its FAIL lines are reported. A crash that repeats in a gate run alone names round 25, about the crash, before any table moves.

**Step 2, the rule, fixed now.** Section 75's, unchanged in its conditions -- 0 to 3, condition 4 reported -- and section 76's reading
of 0 and 1: the whole compile gate and the whole exact gate green. Two `realGpuRun --only denoise` runs per GPU, one after the
other, from the same clone and commit, `SWEK_WEBGPU` cleared. A set qualifies on a GPU only when 0 to 3 hold in BOTH runs.
- If r18t (or r18u) qualifies on the 1080, `NATIVE_KERNELS_BY_ADAPTER` gains `"win32/nvidia/pascal"` with it -- the larger of the
  smaller condition-3 ratios of its two runs, a tie to r18u.
- If either run crashes again, no set qualifies, the 1080 stays on r15, and round 25 is the crash.
- The Intel is the control, as in section 75: its entry is not re-decided, and a failure there is named for a later round.

**Predictions, fixed now.**
- **Step 1: neither gate crashes in three runs alone.** Each crash was in a second run, minutes after a first that was clean on the
  same box. The one native crash on record before these, a Dawn futex crash in v4855's round, came from a second Dawn instance
  made late inside one gate, and went when the gate reused its own device; that is the nearest precedent, and it is not this one.
- **Step 2: neither run crashes, and r18t qualifies on the 1080 in both.** Its condition-3 ratio has read 1.076, 1.088, 1.086 and
  1.091 across sections 67, 72 and 76 -- four readings, every one over 1.05 by 2.5 % or more.
- **The Intel's control holds in both runs.**

**On the rig.** On each GPU, from the verified clone at v4861 or later, `SWEK_WEBGPU` cleared. Step 1 on the 1080:
```
cd WebGLEngine
set SWEK_WEBGPU=
node render/denoiseCompile-selfcheck.mjs
node render/denoiseCompile-selfcheck.mjs
node render/denoiseCompile-selfcheck.mjs
```
and on the Intel, the same three lines with `render/denoiseDevice-selfcheck.mjs`. Then step 2, on each GPU:
```
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r24b-a.json
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r24b-b.json
```
Send back the console output of step 1 and all four JSON files. Don't commit or pull between runs.

## 78. ROUND 24b -- THE VERDICT: NO CRASH, r18t HOLDS ON THE 1080 IN BOTH RUNS, AND THE 1080's NATIVE DEFAULT IS r18t

**What arrived.** Step 1's console output -- each crashing gate run alone three times -- and two `realGpuRun --only denoise` runs
per GPU at 2af5f7da (v4861's release), `SWEK_WEBGPU` cleared. Committed as received: `render/denoise-rig-r24b-step1.txt` and
`render/denoise-rig-r24b-{a,b}-{intel-gen9,gtx1080}.json`.

**Step 1: neither gate crashed alone, as predicted.** `denoiseDevice-selfcheck` on the Intel: ALL GREEN three times, the
native-caller row exit 0 each time. `denoiseCompile-selfcheck` on the 1080: ALL GREEN three times, "28 children, each with a result"
each time. Round 24's two crashes did not repeat; what caused them is not known, and is named here rather than guessed at.

**Step 2, section 77's rule, read strictly.** Every gate green in all four runs (exact 1/1, timing 2/2 each).

| | Run a | Run b | In both? |
|---|---|---|---|
| r18t, GTX 1080, against r15 under DXC at 1920 x 1080 | 1.080 x | 1.068 x | **yes** -- conditions 0 to 3 |
| r18u, GTX 1080 | 0.655 x | 0.651 x | no, condition 3 |
| r18u, Intel gen-9, at 1024 x 1024 (the control) | 1.526 x | 1.530 x | yes -- the control holds |
| r18t, Intel gen-9 | 0.951 x | 1.042 x | no, condition 3 |

**So: `NATIVE_KERNELS_BY_ADAPTER` gains `"win32/nvidia/pascal": "r18t"`.** A native run on the GTX 1080 under DXC now takes r18t;
under FXC it takes DEFAULT_KERNELS, as every FXC run does. The deciding ratio is the smaller of the two runs', 1.068 x -- 1.7 % over
the bar, the thinnest of the six readings r18t has had on this GPU (1.076, 1.088, 1.086, 1.091, 1.080, 1.068). Every one is over it.
`NATIVE_KERNELS_DECIDED_BY` names the section that put each entry in, so `nativePick`'s reason says "section 78's for
win32/nvidia/pascal" where it said "section 67's" for every entry. `render/denoiseDevice-selfcheck.mjs` derives the table from the
four reports, holds that one run under the bar or one red gate would leave the 1080 nothing, and holds the rows about what the rig
ran before this -- section 68's --which runs, round 19's verdict -- to the table as it stood then (`NATIVE_KERNELS_AT_V4852`).

**Every prediction of section 77's held:** no crash alone; no crash in either run; r18t on the 1080 in both; the Intel's control.

**What it does not change.** The page's table (section 63's, already r18t on the 1080 in Chrome), DEFAULT_KERNELS, and any FXC run.
The next native run of `denoiseDevice-selfcheck` on the 1080 builds r18t through the native caller where it built r15: that row
is held within 1e-4 of the f64 network, as r18t's K0 rows already are on that GPU.

## 79. ROUND 25 -- THE MESH ROUND: THE SHIPPED NETWORK ON THE ENGINE'S OWN GEOMETRY, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's two test sets has been rendered.

**Why this round.** Since section 34 the page has said the network was trained on families R and C and that nothing in
the arc says it works on any other scene. Every scene in the arc is spheres. Keith asked for the network on the engine's
own content. This round asks it, and asks nothing else.

> **Does the network the device ships beat the filter it ships, on scenes built from this engine's own geometry?**

**Nothing is trained or tuned.**
- The network is round 11's seed 1, as `render/denoise-net-r11.json` stores it: the file `denoise.html` loads, sha-256
  `f1a84d47db611e77a6c46dcca3bc2ed40d5756d0ca6480157b65b8bc2557e856`. `tools/denoiseStudy.mjs --harvest-mesh` decodes it
  with `decodeNet`, as the page does, and writes the hash beside the results.
- The filter is the setting that file names, tuned on round 11's 192 training scenes: sS 1, sN 1, sA 0.2, sI 4.
- The input is round 11's: 64 x 64, 4 samples, the nine channels and the emitter mask. The references are 1024 samples,
  each test image with a second one for C3.
- **One network, not three seeds' mean.** This is a deployment question, about what the page runs. Rounds 1-11 held each
  image's network error to the mean over seeds 1-3; here it is seed 1's alone.

**The two families, both new, both built from R.** `render/denoiseScenes.mjs`'s families V and M take family R's scene
for their own seed: the ground, the emitters, the sky, the camera, and every resting sphere's place, size and material,
exactly as R draws them. Then each resting sphere is replaced by a closed triangle mesh, inside the sphere's footprint
(a box of side 2 x radius at its centre, resting on the ground), with the sphere's material.
- **V, voxel structures.** A grid of 3-6 cells a side, grown from the bottom centre cell by random face neighbours until
  35-70% of it is filled. Meshed by `mesh/voxelMeshGreedy.js`, voxel-viewer.html's own buffer builder.
- **M, solids.** Half are lathed (`mesh/lathe.mjs`: 3-6 rows from the ground to 70-100% of the box's height, each of
  radius 30-100% of the sphere's, 48 segments). Half are extruded (`mesh/extrudePolygon.mjs`: a star-shaped polygon of
  3-8 points at 40-100% of the sphere's radius, stood upright, 50-100% of the box's height).
- **So the one thing that differs from the family the network was trained on is the shape:** flat faces, hard edges,
  and normals that jump. Materials, lights, sky and camera are R's.
- Every mesh is wound outward, because the tracer takes a hit's normal as it comes. The emitters stay spheres, because
  next-event estimation samples a sphere's solid angle. A conductor mesh carries an albedo of 0, which its shading never
  reads, because the tracer refuses a mesh entry without one; the gate renders one at 0 and at 1 and holds them equal.
- R's own draws are untouched. Its fingerprint over 40 scenes is the one computed from the module before V and M
  existed.

**Splits** (`SPLITS_MESH`), test sets only:

| Set | Family | Seeds |
|---|---|---|
| T1 -> **H1** | 12 of V | **36000-36011** |
| T2 -> **H2** | 12 of M | **37000-37011** |

No earlier split touched these seeds. C5 holds over the round's 72 render seeds.

**The statistic is section 6's, with section 28's test.**
- Per image, `d_i = ln relMSE(filter_i) - ln relMSE(net_i)`. Positive means the network won.
- Each hypothesis is supported iff the mean of d over its 12 images is > 0 and the exact one-sided sign-flip test's p is
  below its Holm threshold. Holm-Bonferroni runs over {H1, H2} at family alpha 0.05.

**Controls.**
- **C1, sanity, on each test set,** as section 7 first wrote it. There are no training images to decide it on, so it is
  decided here. Both methods must beat the noisy input on at least 11 of 12 images of each set, or the run is not
  reported.
- **C2, cited from round 11.** This round trains nothing, so it has no shuffled-target network of its own. C2 asks
  whether the statistic measures denoising or something the training made up, and that is a question about the network
  under test. Round 11's shuffled-target network lost to the filter by a mean d of -1.856: held.
  `denoiseStats.verdict`'s `c2Prior` carries it, and the gate holds it to round 11's file bit for bit.
- **C3, the reference floor, per set:** a set is not resolvable if the network is within 2 x of its floor on more than
  half of its images.
- **C4, determinism:** the forward pass, run twice over T1, gives the same output bit for bit.
- **C5:** the 72 render seeds are distinct.

**What each outcome buys.**
- **H1 and H2 supported:** the page's scope note may say the shipped network also beats the shipped filter on this
  engine's voxel structures and lathed and extruded solids, in R's materials, light and sky. It may not say more than
  that: no other material, light or sky has been tested.
- **One only:** the note may name that family alone.
- **Neither:** the page's note stands as it is. A round training on mesh scenes would be a later question, pre-registered
  on its own.
- **Not reported** (C1, C4 or C5 fired) or **not resolvable** (C3, or a cited C2 that had failed): nothing moves.

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 holds on both sets.
- **P2 and P3:** H1 and H2 are both supported.
  - The reasoning: the network predicts a kernel over real noisy samples from the same guide channels the filter weighs,
    and ten rounds found it failing where the MATERIALS and LIGHT changed (family C). Here only the shape changes.
- **P4:** each set's mean d is below round 11's H1 (0.548). The network was fitted to spheres' smoothly turning
  normals, and a voxel edge is a step it has not seen.
- All four are reported either way.

**Secondary, reported, never tested:** per-image d, each set's noisy error and floor, and time.

**What was seen first.**
- Everything in sections 1-78.
- **The scenes, on seeds outside every split (90001-90004):** a contact sheet at 48 samples, radiance and normals, R
  against V and M. It found two bugs, both fixed before this was written:
  - The voxel faces were first built by hand from `greedyMesh3d`'s quads. A quad's `pos` is its cell, not its face's
    plane, so every +x, +y and +z face sat inside its block, facing in, and conductors rendered black.
  - The extruded and lathed solids needed their winding checked. Every mesh is now held to a positive signed volume.
- **The pilot, on seeds 90100-90107, with NO network or filter:** brightness, the noisy input against a 256-sample
  reference, and time.

| family | mean radiance, median [range] | noisy relMSE vs 256 spp, median | 256 spp, median | triangles, median |
|---|---|---|---|---|
| R | 0.393 [0.284-0.799] | 0.0784 | 2.0 s | 0 |
| V | 0.387 [0.260-0.794] | 0.0879 | 6.5 s | 484 |
| M | 0.401 [0.274-0.796] | 0.0654 | 5.1 s | 870 |

  - V and M sit where R does, so relMSE's 0.01 offset treats them as it treats R.
  - A 1024-sample reference takes about 26 s for V and 20 s for M here.
- `render/denoiseStudy-selfcheck.mjs` runs the shipped pair on four 16 x 16 scenes of V and M outside every split, to
  hold the plumbing. It prints no error and no effect, and none was read.
- Nothing of either test set has been rendered.

**The command:** `node tools/denoiseStudy.mjs --harvest-mesh --cache <dir>` -> `render/denoise-results-mesh.json`.
- It refuses if the file exists.
- It runs here, about 25 minutes, and the file is committed byte for byte before it is read. Section 80 reads it.

## 80. ROUND 25 -- THE VERDICT: THE SHIPPED NETWORK BEATS THE SHIPPED FILTER ON BOTH OF THE ENGINE'S OWN GEOMETRIES

**What arrived.** `render/denoise-results-mesh.json`, written by `tools/denoiseStudy.mjs --harvest-mesh` at c4ff58d2 and
committed byte for byte (40a0ecbd, sha-256 `5a1eba21...`) before it was read. The shipped file it ran is the one section 79
named (sha-256 `f1a84d47...`). 1,318 s to render the 24 test scenes and their 48 references here, 14 s to measure.

**The run is reported: every control held.**
- **C1:** on both sets, the network and the filter each beat the noisy input on 12 of 12 images.
- **C2,** cited from round 11: held (mean d -1.856 there).
- **C3:** one V image of 12 within 2 x of its floor, none of M's: both resolvable.
- **C4:** the forward pass twice over T1, bit for bit. **C5:** 72 distinct render seeds.

| | H1: 12 of V, voxel structures | H2: 12 of M, lathed and extruded solids |
|---|---|---|
| mean d | **0.647** | **0.304** |
| images the network won | 10 of 12 | 7 of 12 |
| sign-flip p (Holm threshold) | 0.00098 (0.025) | 0.0181 (0.05) |
| sign test p, reported | 0.019 | 0.387 |
| **status** | **supported** | **supported** |

**So the page's scope note widens, as section 79 fixed:** the shipped network also beats the shipped filter on this engine's
voxel structures and its lathed and extruded solids, in family R's materials, light and sky. It says nothing more: no other
material, light or sky was tested, and the page still renders only R and C.

**H2 rests on size, not count, and that is said here rather than left in the table.**
- The network won 7 of 12, and by count alone (the sign test) that is p 0.39.
- The pre-registered test, section 28's sign-flip, weighs each image by how much it was won or lost. Three wins are large
  (1.463, 0.762, 0.722) and every loss is small (the largest -0.147), which is how it reaches p 0.018.
- That is the test the arc has used since round 9, and the result stands under it. A reader holding the network to
  winning MOST mesh solids would not find that here.

**The predictions.**
- **P1 held:** C1 held on both sets.
- **P2 and P3 held:** both supported.
- **P4 was half wrong.** I predicted each set's mean d would fall below round 11's H1 (0.548), because a voxel edge is a
  step the network had not seen. M's 0.304 is below it. **V's 0.647 is above it.** The voxel set's three largest wins
  (d 2.615, 2.086, 1.133) are its three noisiest images (noisy relMSE 0.71, 0.91, 0.65). There, the filter left 0.107-0.117
  and the network 0.008-0.034. The step the network had not seen did not cost it what I expected. Nothing here measured
  why.

**What it does not change.** `PAGE_KERNELS`, the native tables, `DEFAULT_KERNELS`, the shipped weights and the filter. It is
a finding about scope, and the page's note is the one thing that moves.

**Not in this round.** Other materials, lights or skies on these shapes. The path tracer page's own scenes. A network
trained on mesh scenes.

## 81. ROUND 26 -- HALF RESOLUTION, THEN FSR1: FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's test set has been rendered.

**Why this round.** Keith asked whether the arc would include FSR, and then for this round first.
- Every speed round so far has made the network's kernels faster. The other lever changes no arithmetic: trace and denoise
  a quarter of the pixels, then upscale.
- Section 54 puts a 1080p pass on the GTX 1080 at about 75-80 ms, and 30 frames a second needs 33. A quarter of that is
  about 20 ms, by arithmetic, if the picture survives the upscale. Time is not measured here.
- The tree's FSR1 is `fx/fsr/fsr.js`: EASU, then RCAS, transcribed from AMD's `ffx_fsr1.h` and held to its CPU reference.

> **Is a frame traced and denoised at half resolution, then upscaled by FSR1, closer to the reference than the frames it
> could be instead?**

**Nothing is trained or tuned.** The network is round 11's seed 1, from the file the page loads (section 79's sha-256).
The input is the arc's: 4 samples (or 1 for D), the nine channels, the emitter mask.

**The frames, per test image.** Each is judged against the same 64 x 64 reference, with a second for C3.

| Frame | Traced | Then |
|---|---|---|
| **A** | 64 x 64, 4 samples | denoised -- today's page; reported, never tested |
| **B, the candidate** | 32 x 32, 4 samples | denoised at 32 x 32, then FSR1 to 64 x 64 |
| **C** | the same frame as B | denoised, then bilinear to 64 x 64 -- FSR1's control |
| **D** | 64 x 64, 1 sample | denoised -- the SAME NUMBER OF SAMPLES as B |

- **The upscale's space.** FSR1 wants perceptual input in [0, 1], and radiance is neither. Per channel,
  t = (x / (1 + x))^(1 / 2.2): Reinhard, then a display gamma. The upscale runs on t, and the result is inverted exactly.
- **The clamp.** An upscaled t is clamped to [0, the brightest t of its frame], because RCAS overshoots a local peak
  unclamped. The same space and the same clamp apply to every upscale, so B and C differ by the filter alone.
- **RCAS** runs at sharpness 0.9 on `fsr.js`'s scale, which is AMD's default of 0.2 stops, with FSR1's denoise on: the
  frame it sharpens is a denoised path-traced frame with grain left in it.
- **Each input is traced on its own render seed:** `renderSeeds`' three, then 1-sample (seed x 8 + 4) and half-size
  (seed x 8 + 5). A's input is exactly the arc's own input for that scene; the gate holds it to `renderSplit`'s bit for bit.

**The split** (`SPLITS_FSR1`), one test set read by both hypotheses:

| Set | Scenes | Seeds |
|---|---|---|
| T1 -> H1 and H2 | 6 of R, 6 of C, each as its own family | **40000-40005** and **41000-41005** |

These are the families the network was trained on, so what changes is the resolution and nothing about the scenes. No
earlier split touched these seeds. C5 holds over the round's 60 render seeds.

**The hypotheses**, with section 6's statistic and section 28's test. `verdict()`'s `filter` column is the comparator and
its `net` column is B.
- **H1: B beats D.** At the same number of samples, half resolution plus FSR1 is closer to the reference than full
  resolution at 1 sample. Effect per image: `d = ln relMSE(D) - ln relMSE(B)`.
- **H2: B beats C.** FSR1 is closer than bilinear on the same denoised half-size frame. Effect: `d = ln relMSE(C) - ln relMSE(B)`.
- Each is supported iff its mean d is > 0 and its sign-flip p is below its Holm threshold, over {H1, H2} at 0.05.

**Controls.**
- **C1, on the test set, per hypothesis.** Both of its frames must beat that hypothesis's own un-denoised frame on at
  least 11 of 12: D's 1-sample input for H1, and B's half-size input upscaled bilinearly for H2.
- **C2:** cited from round 11, as in section 79.
- **C3:** B within 2 x of the floor on more than half the images makes that hypothesis not resolvable.
- **C4:** the candidate's chain, run twice, gives B bit for bit.
- **C5:** 60 distinct render seeds.

**What each outcome buys.**
- **H1 and H2 supported:** a round that times the half-size chain on the rig, and FSR1 on the GPU
  (`fx/fsr/fsrGPU.js`) after the denoiser, is next. The page could offer half resolution as a mode, measured.
- **H2 only:** FSR1 beats bilinear, but half resolution loses to tracing fewer samples at full size. At equal samples
  the full-size frame is the better spend, and the lever is not worth the round above.
- **H1 only:** half resolution is the better spend, but FSR1 adds nothing over bilinear on these frames.
- **Neither, not reported or not resolvable:** recorded as found. `denoise-fsr2-temporal` stays behind it.

**Predictions, fixed now, deciding nothing.**
- **P1: H2 is supported.** EASU follows an edge where bilinear smears across it.
- **P2: H1 is NOT supported.** Round 11's own record shows the shipped network at 1 sample has about 2.5 x its 4-sample
  error (median relMSE 0.0113 against 0.0046 on R), but a 64 x 64 picture holds its scene far more coarsely than a 1080p
  frame. At this size a sphere's silhouette is a few pixels, and half of them are lost to the upscale. My guess is that
  the lost edges cost more than the noise saved. **This test is harder on the upscaler than real use would be, and a
  result here says so about 64 x 64, not about 1080p.**
- **P3:** B's error is above A's on most images. The quarter has a price, and section 82 reports it.

**Secondary, reported, never tested.**
- **The price of the quarter:** d of A against B.
- **EASU alone, and RCAS without its denoise,** each against B.
- Per-image tables, every frame's noisy input error, the floor.

**What was seen first.**
- Everything in sections 1-80, including round 11's 1- and 16-sample secondary, read for P2 above.
- **The pilot, on two scenes outside every split (R 990001, C 990002), mechanics only, nothing scored against a reference:**
  - The transfer round-trips through float32 to 1.7e-5 relative at worst, over 1e-6 to 300.
  - Every upscale's output was finite.
  - An image takes 12-25 s to render here. The half-size denoise takes about 0.1 s, and each upscale under 0.04 s.
  - The clamp engaged: on R's scene, 251 of 12,288 values of the FSR1 upscale were held at the frame's brightest. That
    is RCAS's overshoot, as `fsr.js`'s gate predicts, and is reported here before the test set exists.
- `render/denoiseStudy-selfcheck.mjs` runs the chain on two 16 x 16 scenes outside every split, to hold the plumbing. It
  prints no error and no effect, and none was read.
- Nothing of the test set has been rendered.

**The command:** `node tools/denoiseStudy.mjs --harvest-fsr1 --cache <dir>` -> `render/denoise-results-fsr1.json`.
- It refuses if the file exists.
- About 4 minutes here. The file is committed byte for byte before it is read, and section 82 reads it.

## 82. ROUND 26 -- NOT REPORTED: C1 FIRED ON H2. DESCRIPTIVELY, HALF RESOLUTION LOST TO EVERY OTHER FRAME AT 64 x 64

**What arrived.** `render/denoise-results-fsr1.json`, written by `tools/denoiseStudy.mjs --harvest-fsr1` at c22a0295 and
committed byte for byte (c6dd56f5) before it was read. 254 s to render the 12 test images here, 10 s to measure.

**The run is not reported. Neither hypothesis is decided.**
- **C1 fired on H2.** C1 asks both of a hypothesis's frames to beat that hypothesis's own un-denoised frame on at least 11
  of 12 images. For H2 that frame is B's half-size input, upscaled bilinearly.
  - B (FSR1) beat it on 9 of 12, and C (bilinear) on 9 of 12.
  - **So on three images, denoising the half-size frame and then upscaling it did no better than upscaling its noise.**
    Section 7 wrote C1 for exactly that: "something upstream is broken".
- C1 held on H1: D on 12, B on 11. C2 (cited), C3 (no image near its floor), C4 and C5 held.
- Section 81's rule for this outcome: recorded as found, and `denoise-fsr2-temporal` stays behind it.

**What the file shows, reported and testing nothing.**

| | B (half size + FSR1) against | mean d (positive: B better) | images B won |
|---|---|---|---|
| H1's direction | D, full size at 1 sample | -0.493 | 2 of 12 |
| H2's direction | C, half size + bilinear | -0.180 | 3 of 12 |
| the price of the quarter | A, today's full size at 4 samples | -1.406 (about 4 x the error) | 0 of 12 |

- **RCAS made every image worse.** EASU alone had a lower error than EASU then RCAS on all 12 images (mean d 0.180 in
  EASU's favour). RCAS without its denoise was worse again, on all 12.
- **So, at 64 x 64, the half-size chain lost to every frame it was measured against,** and the sharpening half of FSR1
  cost more than it gave.

**The predictions,** read against the directions, since nothing was decided.
- **P1 (H2 supported) pointed the wrong way:** FSR1 lost to bilinear on 9 of 12.
- **P2 (H1 not supported) pointed the way it said:** B lost to D on 10 of 12.
- **P3 held:** B's error is above A's on all 12.

**What this does and does not say.**
- Section 81 fixed this caveat before the run: 64 x 64 holds a scene far more coarsely than a 1080p frame, so this test
  is harder on an upscaler than real use. It says nothing about 1080p.
- **A cause, not measured:** at half size the network sees every scene at twice the scale it was trained on, with its
  9 x 9 kernel covering twice the scene. C1's three failures are where that would bite. Nothing here tested it.
- **What stands:** the arc has no evidence that half resolution is a better spend than full resolution, at this size.
  The backlog's FSR2 and FSR3 entries stay behind it.

**What it does not change.** The page, the network, the filter, every kernel table.

**Not in this round, and logged in the backlog:** the same question at a frame size nearer real use (256 x 256 upscaled
from 128), with EASU alone as the candidate since RCAS hurt here; and a network trained at the scale it is run at.

## 83. ROUND 27 -- WINOGRAD F(2 x 2, 3 x 3) FOR THE HIDDEN LAYERS, UNDER A RESTATED EXACTNESS KEY: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Keith asked for it after the relaxed-exactness study (backlog `denoise-winograd`), second after round 26.
- The four 3 x 3 hidden layers are 92% of the network's multiply-adds: 30,528 of 33,120 a pixel.
- Winograd's F(2 x 2, 3 x 3) makes a 2 x 2 block of outputs from a 4 x 4 block of inputs in 16 multiplies an input and output
  channel pair. The direct sum takes 36, so that is 2.25 x fewer.
- It needs no hardware feature, so it runs on both GPUs, natively and in Chrome.
- **What it cannot do is add in the canonical order.** Every set so far adds b, then block by block, ky, kx, ci, one product
  at a time. Winograd adds other numbers, transformed ones, in another domain, then mixes sixteen sums. So no set before it is
  its twin, and the exactness key has to be restated. That is this section's first job.

**What changes. Built and piloted here first, on SwiftShader only.**
- **`brain/conv2d.mjs`: the Winograd kernel.**
  - `conv2dWinoWgsl(layer, { g4 })`, entry `k_conv_wino`. A thread is one 2 x 2 tile of outputs and `g4` vec4s of output
    channels, with 16 vec4 accumulators for each vec4.
  - A workgroup is 8 x 8 threads, so 16 x 16 outputs. Their 18 x 18 window is staged in workgroup memory four input channels
    at a time (5,184 B), zero outside the image. Winograd pads; it cannot skip a tap.
  - The filter transform U = G g G^T is done on the host (`winoFilter`): in f64 from the f32 weights, rounded to f32 once.
  - On the device: V = B^T d B, then M = M + v U over the input channels from zero, then A^T M A, the bias and the activation.
    Every coefficient on the device is +1 or -1, so M + v U is the kernel's only multiply-add.
  - The transformed weights are a read-only storage buffer at binding 3. At 32 -> 32 they are 64 KiB, the whole of a default
    uniform binding with no room for the bias. The uniform block holds H, W and the bias (`packWinoUniforms`).
  - `conv2dCpuWino` is its twin: the kernel's operations in the kernel's order, rounded to f32 after every one.
    `conv2dCpuWinoFma` is the fused mirror, M + v U rounded once.
  - `winoShape` holds 3 x 3 layers only, at 1, 2 or 4 vec4s a thread.
- **`render/denoiseDevice.mjs`: the set "r27w".**
  - r15 with every hidden 3 x 3 layer on the Winograd kernel at one vec4 a thread (`R27_KERNELS`), and r15's fused last pass.
  - `twinsOf(layer)` names the twin and mirror a layer is judged against: the Winograd pair for a Winograd layer, `conv2dCpu`'s
    for every other. The exact gate, the compile gate's job and `--measure-r27w` all ask it.
  - `denoiseTwin` takes a set.
  - `FXC_UNTRIED_SETS` is new and names r27w. `nativeSetsFor` leaves it out on a D3D12 adapter whose compiler is not DXC.
    Nobody has built it under FXC, and an FXC that never finishes a pipeline stops a gate for its whole budget (section 56).
    `FXC_UNBUILT_SETS` stays the sets FXC was seen to fail.
  - `TIMED_SETS` gains r27w, so both ladders time it beside r12, r15, r18t and r18u.
- **Why one vec4 a thread.** Two is 128 accumulator floats a thread. A gen-9 lane at SIMD8 has 128 registers, so two would
  spill there before anything else is counted. One is 64; the fast kernel keeps 32.
  This is arithmetic, not a measurement: the compile gate builds the one shape the set runs.
- **The gates.**
  - `brain/conv2d-selfcheck.mjs` section 5f, from the three matrices written in the gate, not the module's loops. The
    transform equals `conv2dForward` in f64 (worst 4.3e-16). The twin is that order, cell for cell. It is not `conv2dCpu`'s
    bits. An integer key is exact in any order, and the weight and uniform layout is as the header says.
  - Section 6 adds the device. On SwiftShader the kernel is its twin on every cell at 1, 2 and 4 vec4s, on odd sizes, partial
    blocks, partial vec4s and an image smaller than one workgroup, and the integer key gives `conv2dForward`'s bits.
  - The device rows run under DXC and off D3D12, and stand aside under FXC.
  - `render/denoiseDevice-selfcheck.mjs` adds:
    - K0w natively, on the large and small networks;
    - K0w in the browser;
    - a measured line, "native K0w for round 27's set ...", which `realGpuRun` keeps;
    - rows for r27w's layers, `twinsOf`, `FXC_UNTRIED_SETS`, and `--measure-r27w`'s source.
  - `render/denoiseTiming-selfcheck.mjs` times r27w on both ladders. It prints "r27w against r15", "against r18t" and
    "against r18u" at every size both measured, tagged section 83.
  - `render/denoiseCompile-selfcheck.mjs` adds r27w's hidden kernel to `DXC_VARIANTS`, judged against its own twin.
  - `tools/ship/wgslCorpus.mjs` adds it compile-only.
- **`tools/denoiseDevice.mjs --measure-r27w`:** K0w (a) on round 11's 24 test images, with D4 (below) in the file.

**What exactness means for r27w: the key, restated.**
- **Cells.** Every hidden cell is `conv2dCpuWino`'s or `conv2dCpuWinoFma`'s, given the device's own input to that layer. This
  is K0's rule with another twin: explained, not tolerated.
- **The last pass** is r15's, judged through the image against `kernelApplyCpu` on the twin's logits or the mirror's, within
  APPLY_TOL.
- **The image.** The device's image is within 1e-5 of the f64 network's on every value, relative, with a floor of 1e-12.
  - That is not a new bound. The exact gate has held every set's image to it since section 35, beside the cells.
  - What is new is its job. For every earlier set it was implied by the cells, since their twin was r15's. For r27w it is
    the only bridge between the set's cells and the shipped network, because its bits cannot be r15's.
  - So in `--measure-r27w` it is a criterion of its own, **D4**, beside section 35's D0 to D3.
- **K0w holds** when the cells, the last pass and the image hold:
  - **(a) here:** `--measure-r27w` on the 24 test images, D0 to D4, its output committed before it is read;
  - **(b) natively on each GPU under DXC:** the exact gate's K0w rows;
  - **(c) in Chrome on each GPU:** the exact gate's browser row for r27w.
- **The rows that held earlier sets to r15's bits do not apply to r27w,** and a row says why: its first layer differs from
  r15's on the same input.

**The pilot, here on SwiftShader. No threshold below was read from it.**
- **Six scenes outside every split,** R 980000-980002 and C 981000-981002, at 64 x 64, with the shipped network.
- **Every hidden cell was the Winograd twin's:** 3,145,728 cells, none fused, none unexplained. The last pass was within 5.5e-7
  of its twin's logits (APPLY_TOL 1e-5).
- **r27w's image against the f64 network:**

| Measure | r27w | r15 |
|---|---|---|
| Worst value | 2.98e-6 | 3.23e-6 |
| Worst difference over the image's largest value | 5.6e-7 | 5.9e-7 |
| relMSE against the reference | within 8.3e-8 of the f64 network's | within 1.8e-7 |

- r27w was nearer the f64 network than r15's exact path by every measure. The filter was beaten on the same images either
  way, and no image's d moved by more than 8.3e-8.
- **Why it is no worse.**
  - The filter transform is exact in f64 and rounded once.
  - Each of the sixteen sums has as many terms as there are input channels. The direct sum has nine times as many.
- **The gates, here.**
  - **The exact gate natively:** K0w held on the large network at 21 x 19 (4 x 12,768 hidden cells, every one the Winograd
    twin's, none fused) and on the small one.
  - **The exact gate in Chromium:** K0w held the same way.
  - **The image against the f64 network** stayed within the 1e-5 bound on every path.
  - **The timing gate:** a CPU's times, recorded and deciding nothing. Natively at 128 x 128, r27w was 1.006 x r15's pass and
    0.655 x r18t's. On the page it was 0.831 x and 0.600 x. At 64 x 64 it was 3.3 x r18u's natively; r18u's written-out block
    is slow on SwiftShader, as section 62 found.
  - **SwiftShader runs a workgroup's threads one after another on a CPU.** What a GPU does with 16 accumulators a thread is
    what the rig is for.

**The rule, fixed now.** The page's table (`PAGE_KERNELS_BY_ADAPTER`) and the native table (`NATIVE_KERNELS_BY_ADAPTER`) each give a
GPU r27w in place of its present entry -- r18u on the Intel gen-9, r18t on the GTX 1080, on both paths -- when r27w qualifies on
that GPU and path.
- **Twice, read strictly, as section 75.** On each GPU, `realGpuRun --only denoise` is run twice, one after the other, from the
  same clone and commit. r27w qualifies on a GPU and path only when every condition holds in BOTH runs.
- **Natively:**
  0. **The run's compiler is DXC,** and the whole compile gate is green (section 76's reading).
  1. **K0w (b):** the whole exact gate is green, and its measured line says r27w green.
  2. **K1 against r12 natively,** section 39's: at least 2 x at the largest size both measured, at least 1 x at every size.
  3. **At least 1.05 x as fast as the GPU's present native entry** (r18u on the Intel, r18t on the 1080), at the largest size
     both were measured on the native ladder. That is the entry's median over r27w's, on the device's clock: the "native: r27w
     against r18u" (or "r18t") line.
- **On the page:**
  1. **K0w (c):** r27w's browser row in the exact gate is green.
  2. **K1 against r12 on the page,** as above.
  3. **At least 1.05 x as fast as the GPU's present page entry,** as above, from the "page: r27w against ..." line.
- **The entry.** Where r27w qualifies, the GPU's entry on that path becomes r27w. Where it does not, the entry stays.
  - `DEFAULT_KERNELS` and `PAGE_KERNELS` stay r15 for every adapter the tables do not name.
  - A native run that is not DXC still gets `DEFAULT_KERNELS`.
- **A gate stopped by `realGpuRun`'s 30-minute cap reaches no verdict on its path.** A crash in either run means no entry
  moves on that GPU, as in section 76.
- **The threshold is section 61's, 1.05.**
- **The verdict section** writes the rule as code in the exact gate, beside `rule66Entries`, and derives any entry from the
  committed reports.

**Predictions, fixed now, deciding nothing.**
- **The arithmetic.**
  - At one vec4 a thread, a Winograd output costs 4 multiply-adds an input channel and output channel, plus 2 adds for its
    share of the input transform. The direct sum costs 9 multiply-adds.
  - So the hidden layers do 1.5 x fewer operations, if they are bound by arithmetic and nothing else changes.
  - **They are not bound by arithmetic alone.** Section 54 measured the fast kernel's hidden layers at about 24% of the 1080's
    f32 peak and 20% of the Intel's.
    - Counted in instructions with the loads included, an output channel of one pixel and one input channel costs the fast
      kernel about 11.5: 9 multiply-adds, and its share of a 9-tap window and 72 weight vec4s.
    - r27w's costs about 8: 4 multiply-adds, 2 transform adds and 2 loads. That is 1.4 x fewer, the same order.
    - The figures below are a ceiling, not an expectation.
  - Section 54's table puts the hidden layers at 75% of r15's page pass on the 1080 and 89% on the Intel. So at the ceiling,
    r27w's pass would be 1.33 x r15's on the 1080 and 1.42 x on the Intel.
  - Against the present entries, at their measured ratios to r15:
    - r18t on the 1080: 1.087 x on the page (section 63), 1.080 and 1.068 x natively (section 78);
    - r18u on the Intel: 1.524 x on the page (section 63), 1.590 x natively (section 67).

| GPU | r27w against its present entry, on the page | natively | Qualifies |
|---|---|---|---|
| GTX 1080 | 1.22 x r18t | 1.23-1.25 x | yes |
| Intel gen-9 | 0.93 x r18u | 0.89 x | no |

- **Said now:**
  - P1: r27w qualifies on the 1080, natively and on the page.
  - P2: it does not qualify on the Intel, on either path. r18u's written-out block is already 1.52-1.59 x r15 there, more than
    the ceiling above leaves r27w.
  - P3: K0w holds on both GPUs, natively and in Chrome, with some cells fused on the 1080, as r15's were.
  - P4: K0w (a) holds on all 24 test images, D4 among them, with r27w's image nearer the f64 network than r15's on most of them.
- **What could make P3 fail, said now.** A D3D12 compiler that reassociates the transforms' adds would make cells match neither
  twin. The direct kernels' sums kept their order on both GPUs (section 65). A straight-line transform is a different shape of
  code, and nothing here has seen what DXC does with it.

**Reported, deciding nothing.**
- **The compile gate's kernel-level line:** r27w's hidden kernel against r15's (r13-fast-3x3), r18t's and r18u's, at 64 x 64,
  natively under DXC.
- **Each GPU's ladders,** size by size, r27w against r15, r18t and r18u.
- **How many hidden cells fused,** natively and in Chrome.

**On the rig.**
- On each GPU, from a verified clone of `claude/tier-2-keys-patch-4lwhzk` at a commit carrying this section, `SWEK_WEBGPU`
  cleared:
```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r27-a.json
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r27-b.json
```
- Send back all four JSON files. Don't commit or pull between the two runs.
- **Each report is committed byte for byte** before it is read.

**Sabotages (v4868).** Twenty-one runs, each restored byte-identical and logged in its gate's header. None was 0 red.
- **`brain/conv2d-selfcheck.mjs`, W1-W10.**
  - The twin's transform with one sign flipped: 11 red.
  - The kernel's weights without the group offset: 9 red.
  - Its window origin a pixel right: 9 red.
  - Its second barrier removed: 8 red.
  - The twin summing the channels backwards: 9 red.
  - The guard on channels past Cout removed: 4 red, exactly the cases whose Cout is not a multiple of four.
  - The bias a float late: 10 red.
  - `winoShape` holding any odd k: 1 red.
  - The stand-aside without round 27's DXC exemption: 1 red.
- **W9 is the one worth reading.** It files the transformed weights at (j, i) for (i, j), in the kernel and the twin alike.
  - **Not one device cell row went red.** Both read the same wrong weights and agree cell for cell.
  - Five rows caught it: the order row and the layout row, written from the matrices, and the two integer keys, held to
    `conv2dForward`.
  - So a twin cannot be the only witness to its own order, and section 5f exists for that reason.
- **`render/denoiseDevice-selfcheck.mjs`, Y1-Y6.**
  - `kernelFor` never picking the Winograd kernel: 6 red, plus 2 in the timing gate.
  - `twinsOf` giving every layer the direct pair: 5 red. Every Winograd cell then reads as unexplained.
  - `nativeSetsFor` ignoring `FXC_UNTRIED_SETS`: 2 red, plus 2 in the timing gate.
  - The Winograd layers dispatched with half their z groups: 3 red.
  - `--measure-r27w` judging against the direct pair: 1 red, the source row.
  - `R27_KERNELS` at two vec4s: 1 red. K0w holds at two, so the configuration is held by name.
- **`render/denoiseTiming-selfcheck.mjs`, Y7:** the "r27w against" lines tagged section 61, 1 red.
- **`render/denoiseCompile-selfcheck.mjs`, Y8-Y9:** the job judged against `conv2dCpu`, 1 red; the variant at two vec4s, 1 red.

**Not in this round.**
- Two or four vec4s a thread, or the transformed weights in a uniform binding. Those are shapes for a later round, if r27w
  holds on one GPU and a probe says which.
- F(4 x 4, 3 x 3): 4 x fewer multiplies, at a precision cost nothing here has measured.
- Any change to `DEFAULT_KERNELS`, to an FXC run, or to the network.

## 84. ROUND 27 -- REPORTED HERE: K0w (a) HOLDS, r27w ON THE 24 TEST IMAGES

`node tools/denoiseDevice.mjs --measure-r27w` ran here on SwiftShader at 687dfd05, the commit carrying section 83, with no
cache, so it rendered the 24 test images itself: 863 s.
- **The output, unedited,** is `render/denoise-results-r27w.json`, committed at af3a3795 before it was read.
- **The kernels:** on every image the four hidden layers ran on the Winograd kernel (`wino`), and the head and the kernel
  apply as one pass (`k_head_apply`).

**K0w (a) holds. Every criterion, D0 to D4, is true.**

| Criterion | r27w |
|---|---|
| D0, the shipped file is the harvest's network | its f64 relMSE equals round 11's seed 1 on all 24 images, bit for bit |
| D1, the hidden layers | 12,582,912 conv cells, every one `conv2dCpuWino`'s: none fused, none unexplained |
| D2, the head and kernel pass | worst 5.6e-7 against `kernelApplyCpu` on the twin's logits or the mirror's (bound 1e-5); against the twin's alone 5.9e-7, the mirror's alone 1.0e-6 |
| D3, the verdict on the device | relMSE within 5.2e-7 of the f64 network's on every image (bound 1e-4); the primary filter beaten on 12 of 12 images of R and 12 of 12 of C, the same images as on the CPU |
| **D4, the restated key** | **the image within 1.43e-6 of the f64 network's on every value (bound 1e-5); median over images 9.1e-7** |

**Against r15 (section 47's run, the same 24 images).**
- r27w's relMSE was nearer the f64 network's than r15's on 19 of 24 images.
- The single farthest image is r27w's: 5.2e-7 against r15's worst of 3.8e-7.
- Both are three orders inside D3's bound. r15's file carries no per-value figure, so D4 has no r15 column.
- **P4 held as worded:** K0w (a) on all 24 images, D4 among them, r27w nearer on most of them.

**Reported, not a criterion.** A 64 x 64 image took a median of 345 ms (311-433) with r27w, read-back included, against
r15's 399 in section 47. This is SwiftShader, a CPU's time, and no evidence for section 83's rule.

**Still open:**
- K0w (b) and (c), K1, and section 83's rule on Keith's two GPUs. Those come from two runs on each GPU of
  `node tools/ship/realGpuRun.mjs --only denoise`, as section 83 says.
- Until then the tables are as they stand: r18u on the Intel, r18t on the 1080, r15 everywhere else.

## 85. ROUND 27 -- FOUR RIG RUNS ARRIVED FROM OLD COMMITS: NO VERDICT, AND THE RUNS ARE OWED AGAIN

**What arrived.** Four `realGpuRun --only denoise` reports, two per GPU, on 2026-10-16. They are committed byte for byte under
names that say what they are:

| File | Run at | The report's `commit` |
|---|---|---|
| `render/denoise-rig-r27-stale-intel-gen9-a.json` | 13:37 | 66a7ae38, v4863's release |
| `render/denoise-rig-r27-stale-intel-gen9-b.json` | 13:56 | 66a7ae38, v4863's release |
| `render/denoise-rig-r27-stale-gtx1080-a.json` | 13:19 | 2af5f7da, v4861's release |
| `render/denoise-rig-r27-stale-gtx1080-b.json` | 13:23 | 2af5f7da, v4861's release |

- **They were read before this commit.** They were opened in full when they arrived. They bear on no rule, for the reason below.

**Why they decide nothing.**
- Section 83's rule reads runs from a clone of `claude/tier-2-keys-patch-4lwhzk` at a commit carrying section 83: 687dfd05 or
  later. These ran on the rigs' existing checkouts, two and four versions before it.
- **The string "r27w" appears in none of the four.**
  - Every timing gate says "sets timed: r12, r15, r18t, r18u".
  - No exact gate prints the "native K0w for round 27's set" line.
  - No compile gate built the Winograd kernel.
- So K0w (b) and (c), K1 and section 83's conditions have no reading on either GPU. **No table moves.**

**One finding, reported and deciding nothing.**
- **The 1080's run a stopped its timing gate 39 s in, inside the native ladder.** realGpuRun records it as not ok, with no FAIL
  line. Its last measured line is "sets timed: r12, r15, r18t, r18u". Run b, five minutes later, completed in 246 s.
- The console was not sent, so the cause is unread.
- **It was a first run, and it was the timing gate.** Section 76's two crashes were in second runs, in the compile gate on the
  1080 and the exact gate on the Intel. Section 78's runs did not crash. This is v4861's code, and nothing in round 27 touched it.
- **Section 83's rule already covers it.** A crash in either of round 27's runs means no entry moves on that GPU.

**What the old code's runs repeat, for the record.**
- **The 1080, run b, natively under DXC:** r18t 1.092 x r15 at 1920 x 1080 (section 78 read 1.080 and 1.068).
- **The 1080 on the page:** r18t 1.101 x r15.
- **The Intel, natively at 1024 x 1024:** r18u 1.385 and 1.483 x r15 in runs a and b.
- **The Intel on the page:** r18u 1.560 and 1.561 x r15.
- Every exact gate was green on both GPUs.

**The runs again.** Section 83's rule is unchanged. Each new report must carry two checks before anything is read off it:
- its `commit` field names a commit on `claude/tier-2-keys-patch-4lwhzk` at 687dfd05 or later;
- its timing gate's "sets timed" line includes r27w.

## 86. ROUND 27 -- THE VERDICT: K0w HOLDS ON BOTH GPUS, AND r27w RUNS AT A THIRD OF THE SPEED OF EACH ONE'S PRESENT ENTRY. NO ENTRY MOVES

**What arrived.** Four `realGpuRun --only denoise` reports, two per GPU, run on 2026-10-16 at d11534e3 ("v4868: record the
release"), which is on main and descends from 687dfd05, the commit carrying section 83. They are committed byte for byte at
4bfe5757, before this section was written:

| File | Run at (UTC) | Gates |
|---|---|---|
| `render/denoise-rig-r27-a-intel-gen9.json` | 16:34 | exact, compile, timing: all green |
| `render/denoise-rig-r27-b-intel-gen9.json` | 16:58 | all green |
| `render/denoise-rig-r27-a-gtx1080.json` | 16:37 | all green |
| `render/denoise-rig-r27-b-gtx1080.json` | 16:46 | all green |

- **They were opened on arrival,** before that commit, for section 85's two checks. Both hold in all four: the `commit` field
  names d11534e3, and every timing gate's "sets timed" line reads "r12, r15, r18t, r18u, r27w".
- **No run crashed and no gate hit the 30-minute cap.** The longest gate was the Intel's run b timing gate, at 541 s.

**Section 83's rule, read strictly. Every condition must hold in both runs.**

| GPU, path | Present entry | 0: DXC, compile gate | 1: K0w | 2: K1 against r12, runs a / b | 3: r27w against the entry, runs a / b | Qualifies |
|---|---|---|---|---|---|---|
| Intel gen-9, native | r18u | DXC, green | 2 of 2 native rows, both runs | 5.12 / 4.82 x at 256 x 256 | **0.348 / 0.326 x** at 512 x 512 | no |
| Intel gen-9, page | r18u | -- | browser row green, both runs | 4.59 / 4.06 x at 256 x 256 | **0.338 / 0.369 x** at 512 x 512 | no |
| GTX 1080, native | r18t | DXC, green | 2 of 2 native rows, both runs | 7.80 / 7.85 x at 1024 x 1024 | **0.297 / 0.296 x** at 1920 x 1080 | no |
| GTX 1080, page | r18t | -- | browser row green, both runs | 7.68 / 7.71 x at 1024 x 1024 | **0.301 / 0.297 x** at 1920 x 1080 | no |

- On the Intel, 512 x 512 is the largest size both sets measured. r27w's ladder predicted 1,526-2,326 ms a pass at
  1024 x 1024, over the 1,500 ms cap, and skipped it.
- **Conditions 0 to 2 hold on every GPU, path and run. Condition 3 fails on every one,** by a factor of about three. Nothing
  here is near the 1.05 bar, and the two runs agree to within the Intel's run-to-run noise.
- **No entry moves.**
  - `NATIVE_KERNELS_BY_ADAPTER`: r18u on the Intel (section 67), r18t on the 1080 (section 78).
  - `PAGE_KERNELS_BY_ADAPTER`: r18u on the Intel, r18t on the 1080 (section 63).
  - r15 everywhere else. Neither table names r27w.

**The rule as code.** `rule83Entries` in `render/denoiseDevice-selfcheck.mjs`, beside `rule66Entries`, reads one report per
call. It takes the present entries from the tables as section 83 found them (`RULE83_AT`), not from the live tables.
- **The verdict row.** It reads the four committed reports: every gate green at d11534e3, conditions 0 to 2 held, condition 3
  failed on every GPU, path and run. Both live tables must equal what the rule derives, with no r27w in either.
- **The discrimination row.** It works on copies of the reports:
  - The 1080's two runs lifted to 1.100 x r18t natively give the 1080 r27w natively, and still nothing on the page.
  - One run lifted gives nothing.
  - One exact gate red fails condition 1.
  - Lifting r27w over r15 but not over r18t still fails condition 3. The bar is the present entry.
  - A skipped exact-gate row fails the page's K0w, not the native one.
  - A report whose timing gate did not time r27w has no key, which is section 85's check.
- **The predictions row,** below.
- **Sabotaged.** Seven runs, each restored byte-identical (md5) and logged in the gate's header as Z1-Z7. None was 0 red.
  - The bar at 0.25: 3 red, the verdict, the discrimination row and the predictions.
  - The present entry read as r15 whatever the table says: 1 red, the discrimination row. r27w is under r15 as well, so the
    verdict alone cannot tell the two apart. This is why the discrimination row lifts r15 alone.
  - The 1080's page entry set to r27w in `render/denoiseDevice.mjs`: 2 red, this verdict and section 63's.
  - A skipped exact-gate row not failing the page's K0w: 1 red.
  - Section 85's "sets timed" check dropped: 1 red.
  - The committed 1080 run b edited to 1.100 x r18t natively: 3 red.
  - "Both runs" read as "either run": 1 red.

**The predictions.**
- **P1 FAILED.** Section 83 predicted r27w at 1.22 x r18t on the 1080's page and 1.23-1.25 x natively. It measured 0.30 x on
  both, off by a factor of four.
- **P2 held, but not as reasoned.** The prediction was 0.93 x r18u on the page and 0.89 x natively, a near miss. The
  measurement was 0.33-0.37 x.
- **P3 held:** K0w on both GPUs, natively and in Chrome, in both runs.
  - Its aside was wrong. It said "with some cells fused on the 1080, as r15's were". The compile gate's job for the Winograd
    kernel read 131,072 plain, 0 fused, 0 unexplained, under DXC as shipped and with use_dxc, on both GPUs in both runs.
  - r15's hidden kernel (r13-fast-3x3) fused no cell on the 1080 either. The fused cells these reports show are the Intel's
    head kernels: 221,346 fused in r13-fast-head and in r14-head.
  - The failure section 83 named, a DXC that reassociates the transforms' adds, did not happen.
- **P4 held,** in section 84.

**Reported, deciding nothing.**
- **The compile gate's kernel-level line.** One hidden layer at 64 x 64, r15's kernel over r27w's, under DXC as shipped and with
  use_dxc:

  | GPU | Run a | Run b |
  |---|---|---|
  | GTX 1080 | 0.527 and 0.535 x | 0.532 and 0.534 x |
  | Intel | 0.427 and 0.370 x | 0.713 and 0.710 x |

  The Intel's two runs disagree by nearly two to one on a sub-3 ms kernel. The ladder below is the steadier reading.
- **The gap widens with size on the 1080.** Natively, r27w against r15 runs from 0.64 x at 64 x 64 to 0.32 x at
  1920 x 1080, the same in both runs. On the Intel it runs from 0.64-0.65 x at 64 x 64 to 0.45-0.48 x at 512 x 512.
- **Per 32 -> 32 hidden layer (layers 1 to 3), natively at the largest size:**
  - The 1080 at 1920 x 1080: r27w 68.3 ms, r18t 16.2 ms, r15 18.0 ms.
  - The Intel at 512 x 512, run a: r27w 104-107 ms, r18u 33-37 ms, r15 45-46 ms.
  - Counted at the direct sum's multiply-adds, that is about 555 GFLOP/s against r18t's 2,350 on the 1080, and about 45
    against r18u's 139 on the Intel.
- **The fused counts natively and in Chrome are unread.** Section 83 listed them as reported. The exact gate counts them (its
  K0 table), but `realGpuRun` keeps measured lines and FAIL lines, not that table. The compile gate's job is the only count
  these reports carry for r27w.
- **FXC.** r27w stood aside where `FXC_UNTRIED_SETS` says it should:
  - the FXC child timed r12 and r15 only;
  - the compile gate's use_dxc-off mode printed its stand-aside SKIP.
- **The Intel's run b was noisier throughout.** At 512 x 512, r15's native pass took 278 ms against run a's 172. Both runs fail
  condition 3 by a factor of three, so the noise bears on no condition.

**Why it is slow. Not measured here, and said as such.**
- **Section 83's instruction count was the wrong model.** It counted about 8 instructions an output channel, a pixel and an
  input channel against the fast kernel's 11.5, so about 0.7 x r15's time. The rig measured about 3.8 x r15's time per
  layer on the 1080 and about 2.3 x on the Intel.
- **Three differences in the code could each cost that much.** Nothing here separates them.
  1. **Redundant staging.** At 32 output channels and one vec4 a thread, r27w dispatches 8 z groups (`winoShape`: groups 8).
     Each stages and transforms the same 18 x 18 window for every input channel. r15's fast kernel covers all 32 output
     channels in one z group (`fastShape`: g4 8, groups 1), so it stages each window once.
  2. **Where the weights live.** r27w reads its transformed weights from a storage buffer: 16 vec4 loads an input channel a
     thread, 64 KiB in all, the whole of a default uniform binding. The fast kernel reads its 37 KB of weights from a uniform
     binding.
  3. **Registers.** A thread holds 16 vec4 accumulators and 16 transformed inputs, against the fast kernel's 8 vec4
     accumulators.
     So fewer threads can be in flight. The DXIL dumps (1,269-1,270 lines, no loops) say nothing about register allocation.

**What follows.**
- **Section 83 conditioned the next shapes on a result that did not come.** Two or four vec4s a thread, or the weights in a
  uniform binding, were "for a later round, if r27w holds on one GPU and a probe says which." It held on neither. So no round
  is owed, and the backlog's `denoise-winograd` is CLOSED.
- **The one optional probe is logged as `denoise-winograd-probe`.** It would time two and four vec4s a thread in the compile
  gate's kernel-level line on both GPUs.
  - Fewer z groups attack the first difference above and worsen the third.
  - To reach r18t, a shape would have to be about 3.4 x faster on the 1080, and 2.9-3.1 x on the Intel to reach r18u.
    Probing it costs little. Nothing here suggests the shape alone closes that gap.
- **The restated key held on hardware.** K0w now has a reading on both GPUs, natively and in Chrome. A twin of a kernel's
  own order, held to the f64 network at 1e-5 on every value, is a key any later non-canonical kernel can use. The backlog's
  `denoise-subgroup-reduction` waits on that, and now only on the features probe.
- **The tables stand as before:**
  - r18u on the Intel gen-9, natively and on the page;
  - r18t on the GTX 1080, natively and on the page;
  - r15 everywhere else, and `DEFAULT_KERNELS` and `PAGE_KERNELS` unchanged.

## 87. ROUND 28 -- THE DENOISER'S FXC PATHS RETIRED: FIXED BEFORE THE RIG RUNS IT

**Where this section comes from.** It was written as section 79, round 25, on the branch `ccr-6c3eeb7c-pxz6kx`. That branch was
labelled v4864 and never reached main. This file's section 79 and round 25 went to the mesh round (v4868) in the meantime. The
section is renumbered at the merge that ships it, v4871. Its text is unchanged except for the numbers, the version and one note
at the end. No rig has run it.

**Why.** Every FXC row since section 66 fed condition 4, and section 75 dropped condition 4. Both native defaults are now decided
under DXC (sections 67 and 78), and no FXC run decides anything. They still cost the most time in each denoise run. In round 24b
(run a), the compile gate's "use_dxc off" mode spent 301 s on the Intel and 127 s on the 1080 building one kernel,
r13-fast-head, under FXC. The timing gate's FXC child added 167 s and 131 s.

**What v4871 changes.**
- `render/denoiseCompile.mjs`'s `modeVariants`: a native mode whose compiler is FXC (read off the package with that mode's flags)
  builds the control kernel alone, `FXC_CONTROL_IDS` = r12-tiled-3x3. On 0.6.2 that is "use_dxc off". The other seven stand aside,
  not counted as unbuilt. DXC, and no D3D compiler (off win32), build all eight, as before.
- A package with no DXC of its own (0.6.0, 0.6.1), whose "as shipped" is FXC, gets the same single kernel and a line that says
  REFUSED: its native path needs 0.6.2.
- `render/denoiseTiming-selfcheck.mjs`: the FXC ladder is skipped by default with section 87's reason, where the plan would have
  run it.
- `SWEK_DENOISE_FXC=all` puts both back as they were.
- Nothing else changes: `NATIVE_KERNELS_BY_ADAPTER`, DEFAULT_KERNELS, the page's table, and every DXC row.

**The run.** On each GPU, with v4871 or later and `SWEK_WEBGPU` cleared:
`node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r28.json`, then `node tools/denoiseDevice.mjs --which`.

**Predicted, and deciding:**
1. All three denoise gates are green on both GPUs.
2. The compile gate's "use_dxc off" group is r12-tiled-3x3 alone: built, exact, its dump FXC (DXBC). Its section 87 line names the
   seven that stood aside.
3. The timing gate's "2b" says `SKIP  native FXC ladder: retired by section 87 ...`.
4. `--which` still says r18u on the Intel and r18t on the 1080.

If any of these fails, the verdict reverts the retirement (`modeVariants` and `fxcLadderSkip` back to building and running
everything) and says why.

**Predicted, reported, not deciding.** Each GPU's compile gate under 200 s on the Intel (365 and 385 s in round 24b) and under 120 s
on the 1080 (184 and 178 s). Each timing gate below the lower of its two round-24b runs (351 s Intel, 230 s 1080). A miss is named
in the verdict and does not revert anything: these are what the change is for, not what makes it safe.

**What cannot be checked here.** No mode on this box is FXC (SwiftShader, Linux), so the live single-kernel group and the live skip
are the rig's. Here they are held by fixtures (section 87's rows in both gates) and a source row in the timing gate. Sabotage F3
(section 4 counting eight kernels in every mode) is 0 RED on this box, and is named as such in the compile gate's header.

**Since this was written** (a note added at the merge, not a change to the rule):
- **Round 27 added r27w.** It added r27w's kernel to `DXC_VARIANTS` and r27w to both ladders, and r27w stands aside under FXC
  either way (`FXC_UNTRIED_SETS`). The DXC-only kernels are untouched by this section, as before.
- **The newest baseline is round 27's runs** (section 86). The timing predictions above are against round 24b's runs, so read
  the timing lines against these as well.
  - The compile gates took 421 and 455 s on the Intel and 211 and 227 s on the 1080.
  - The timing gates took 506 and 541 s on the Intel and 267 and 269 s on the 1080, with r27w's ladder in them.
  - Their FXC children took 292, 318, 141 and 144 s.

## 88. ROUND 28 -- THE VERDICT: SECTION 87's FOUR PREDICTIONS HOLD ON BOTH GPUS, AND THE FXC RETIREMENT STANDS

**What arrived.** One `realGpuRun --only denoise` per GPU, then `tools/denoiseDevice.mjs --which`, as section 87 asks, both on
2026-10-17 at 8490e721 ("v4871: record the release"). They are committed byte for byte at 0a8c4c48:
- `render/denoise-rig-r28-intel-gen9.json`;
- `render/denoise-rig-r28-gtx1080.json`;
- `render/denoise-rig-r28-which.txt`, the console with each GPU's `--which` lines, CRLF as the rig wrote it.

They were opened on arrival, as sections 85 and 86's were.

**The four deciding predictions.**

| Prediction | Intel gen-9 | GTX 1080 |
|---|---|---|
| 1. All three denoise gates green | exact, compile, timing: all green | all green |
| 2. FXC's group is r12-tiled-3x3 alone: built, exact, FXC (DXBC) | "1 of 1 built; dumps: 1 FXC (DXBC)"; 131,072 plain, 0 fused, 0 unexplained | the same |
| 3. The FXC ladder skipped with section 87's reason | "SKIP native FXC ladder: retired by section 87 (v4871)"; no FXC line timed | the same |
| 4. `--which` unchanged | r18u, section 67's, under DXC, within 1.05e-6 of the f64 network | r18t, section 78's, under DXC, within 1.01e-6 |

- **All four hold on both GPUs. The retirement stands.**
  - Under FXC, `modeVariants` builds r12-tiled-3x3 alone, as a control.
  - The timing gate's FXC ladder skips.
  - `SWEK_DENOISE_FXC=all` puts both back.
  - Nothing else changes.
- **Prediction 2's second sentence, read strictly.** It says the section 87 line "names the seven that stood aside". The line
  counts them instead: "the other 7 stand aside, not counted as unbuilt".
  - The code that prints it was written in the same commit as the prediction, and has always printed a count.
  - Read as the line that code prints, the prediction holds. Read as "lists seven names", it does not.
  - That is said here rather than decided quietly. Nothing else in the verdict turns on it.

**The rule as code.** Two rows in `render/denoiseDevice-selfcheck.mjs`, beside section 68's outcome row:
- **The verdict row** reads the committed files. Each `--which` line is parsed by `parseWhich` and re-derived by `nativePick` on
  the adapter and compiler it names.
- **The discrimination row** works on copies. All eight kernels built under FXC fails prediction 2. The FXC ladder run fails
  prediction 3. A `--which` naming r15 for the Intel fails prediction 4.
- **Sabotaged five ways (X1-X5),** each red by name, each file restored byte-identical by SHA-256.

**The first sabotage runner left two things broken, and neither showed in its red count.**
- It was killed by its caller's timeout during X4. A Python `finally` does not run on SIGTERM, so the `--which` rule was left
  without its kernels clause.
- It also wrote files back in text mode. The committed console came back with LF endings, and its md5 was "restored" against text
  it had already converted.
- `git status` showed the console. X4's next attempt, finding nothing to edit, showed the clause.
- Both were put back, and the console was compared byte for byte with the upload.
- The runner now reads and writes bytes and restores on SIGTERM. Every round 27 and round 28 rig file was re-checked against its
  upload, and all are identical.

**Reported, not deciding: what the retirement was for.** Every bound section 87 set is met.

| | Intel gen-9 | GTX 1080 |
|---|---|---|
| Compile gate | **50.1 s** (bound 200; round 24b 365 and 385; round 27 421 and 455) | **34.6 s** (bound 120; 184 and 178; 211 and 227) |
| Timing gate | **193.2 s** (bound 351; round 27 506 and 541) | **154.0 s** (bound 230; 267 and 269) |
| The whole denoise run | **328.3 s**, against 1,032.6 and 1,083.1 s in round 27 | **241.4 s**, against 530.3 and 552.3 s |

- On the Intel the whole run is about a third of round 27's, and on the 1080 under half. Round 27 timed r27w too, as this run does,
  so most of the gap is the FXC paths: the compile gate's seven retired FXC builds (r13-fast-head alone took 346 s on the Intel in
  round 27) and the timing gate's FXC child (292 and 318 s there). The rest is one run's conditions against another's.

**Also read off the same runs, deciding nothing.**
- **The tables, as they stand:**
  - On the Intel, r18u is 1.549x r15 natively at 1024 x 1024 and 1.530x on the page.
  - On the 1080, r18t is 1.081x r15 natively at 1920 x 1080 and 1.089x on the page.
- **r27w is where section 86 left it:** 0.388x r18u natively at 512 x 512 on the Intel, and 0.302x r18t at 1920 x 1080 on the 1080.
- **One stall.** The 1080's page ladder timed r27w at 1920 x 1080 at 684 ms a pass, with a 90th percentile of 7,623 ms over three
  passes.
  - Layer 3 took 340 ms and the head 186 ms, against 66 and 18 natively.
  - Round 27's two page runs read 250.4 and 248.3 ms at that size.
  - r27w is closed and nothing reads that figure, so it is recorded and not chased.

**What is next.** The FXC retirement owes nothing further. A native run under FXC still gets `DEFAULT_KERNELS`, and builds one
control kernel where it built eight.

## 89. ROUND 29 -- HALF RESOLUTION AT 256 x 256, EASU THE CANDIDATE: FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's test set has been rendered.

**Why this round.** Round 26 asked whether a half-size frame upscaled by FSR1 beats the frames it could be instead, at 64 x 64,
and was not reported (section 82). Descriptively, the half-size chain lost to every frame it was measured against.
- Section 81 fixed the caveat before that run: 64 x 64 holds a scene far more coarsely than real use, so a test there is
  harder on an upscaler than a real frame is. Section 82 could not separate a real loss from the size.
- This round asks the same question at 256 x 256, traced and denoised at 128 x 128. That is the nearest size this machine can
  render a reference for: 1,024 samples at 16 times round 26's pixels.
- The backlog's FSR2, FSR3 and learned-upscaler entries wait on this one (`denoise-halfres-at-scale`).

> **Is a frame traced and denoised at 128 x 128, then upscaled to 256 x 256 by EASU, closer to the reference than the frames
> it could be instead?**

**Nothing is trained or tuned.** The network is round 11's seed 1, from the file the page loads. Its sha-256 is written beside
the results. The input is the arc's: 4 samples (or 1 for D), the nine channels and the emitter mask.

**The frames, per test image.** Each is judged against the same 256 x 256 reference, with a second for C3.

| Frame | Traced | Then |
|---|---|---|
| **A** | 256 x 256, 4 samples | denoised -- today's page at this size; reported, never tested |
| **B, the candidate** | 128 x 128, 4 samples | denoised at 128 x 128, then EASU to 256 x 256 |
| **C** | the same frame as B | denoised, then bilinear to 256 x 256 -- EASU's control |
| **D** | 256 x 256, 1 sample | denoised -- the SAME NUMBER OF SAMPLES as B |

- **EASU alone, not FSR1.** EASU is FSR1's upscaling pass. RCAS, its sharpening pass, made every one of round 26's 12 images
  worse (section 82), so RCAS is not the candidate here. FSR1 whole, and RCAS without its denoise, are reported against B and
  never tested.
- **Everything else is section 81's, by the same code.**
  - The upscale's space: Reinhard, then a display gamma, inverted exactly.
  - The clamp to the frame's brightest value.
  - RCAS at sharpness 0.9 where it is reported.
  - Each input traced on its own render seed (`renderSeeds`' three, then seed x 8 + 4 and + 5).
- `runUpscaleStudy` takes the candidate as a parameter. Its default is still FSR1, and the gate holds round 26's chain
  unchanged.

**The split** (`SPLITS_HALFRES`), one test set read by both hypotheses:

| Set | Scenes | Seeds |
|---|---|---|
| T1 -> H1 and H2 | 6 of R, 6 of C, each as its own family | **42000-42005** and **43000-43005** |

These are the families the network was trained on. No earlier split touched these seeds, round 26's among them, and every one
is refused without `harvest`. C5 holds over the round's 60 render seeds.

**The hypotheses**, with section 6's statistic and section 28's test. `verdict()`'s `filter` column is the comparator and its
`net` column is B.
- **H1: B beats D.** At the same number of samples, half resolution plus EASU is closer to the reference than full resolution at
  1 sample. Effect per image: `d = ln relMSE(D) - ln relMSE(B)`.
- **H2: B beats C.** EASU is closer than bilinear on the same denoised half-size frame. Effect: `d = ln relMSE(C) - ln relMSE(B)`.
- Each is supported iff its mean d is > 0 and its sign-flip p is below its Holm threshold, over {H1, H2} at 0.05.

**Controls, section 81's, unchanged.**
- **C1, per hypothesis:** both of its frames must beat that hypothesis's own un-denoised frame on at least 11 of 12 images. For
  H1 that is D's 1-sample input; for H2, B's half-size input upscaled bilinearly. This is the control that fired on H2 in round
  26.
- **C2:** cited from round 11, as in sections 79 and 81.
- **C3:** B within 2 x of the floor on more than half the images makes that hypothesis not resolvable.
- **C4:** the candidate's chain, run twice, gives B bit for bit.
- **C5:** 60 distinct render seeds.

**What each outcome buys.**
- **H1 supported, with or without H2:** at this size, half resolution is the better spend of four samples a pixel.
  - The next round times the half-size chain on the rig, with EASU on the GPU after the denoiser.
  - `denoise-fsr2-temporal` comes off its blocker.
- **H2 only:** EASU beats bilinear, but the full-size frame at equal samples is the better spend. The half-resolution lever is
  not worth a rig round at this size.
- **Neither, not reported or not resolvable:** recorded as found, and the FSR entries stay behind it. If C1 fires on H2 again,
  `denoise-network-at-run-scale` becomes the next round.

**Predictions, fixed now, deciding nothing.**
- **P1: H1 is NOT supported, but the gap narrows from round 26's.**
  - There, B lost to D by a mean d of -0.493.
  - For B to beat D, the half-size chain must cost less than tracing at 1 sample does. Round 11's record puts that cost near
    2.5 x the 4-sample error on R (ln 0.9). Round 26's "price of the quarter" was 4 x (ln 1.406).
  - At 256 x 256 a silhouette spans four times the pixels it did at 64, so the upscale loses less. My guess is a price between
    the two, and a mean d in H1's direction between -0.4 and 0.
- **P2: H2 is supported, with a small d.** At 64 x 64, EASU and bilinear were close: FSR1 lost to bilinear by 0.180, and EASU
  beat FSR1 by 0.180. At 256, EASU's edge-following has more pixels to follow an edge across.
- **P3: B's error is above A's on every image,** and the price of the quarter is below round 26's 1.406.
- **P4: C1 holds on both hypotheses.** At 128 x 128 the network sees a scene at twice the scale it was trained on, not half
  as at 32 x 32.

**Secondary, reported, never tested.**
- **The price of the quarter:** d of A against B.
- **FSR1 whole, and RCAS without its denoise,** each against B (positive: EASU alone was better).
- Per-image tables, every frame's noisy input error, and the floor.

**What was seen first.**
- Everything in sections 1-88, including section 82's descriptive numbers, which P1 to P3 are written from.
- **The pilot, on two scenes outside every split (R 990003, C 990004), mechanics only, nothing scored against a reference:**
  - Rendering took 145 s for R. C took 359 s, but that run overlapped another gate's, so it is not a clean time.
  - Each 256 x 256 denoise took 4.9-5.5 s and each 128 x 128 one 1.3-1.5 s; the four upscales together under 0.5 s.
  - Every output was finite. The transfer round-trips through float32 to 1.9e-5 relative at worst, over 1e-6 to 300.
  - **EASU never needed the clamp:** 0 of 196,608 values on both scenes. FSR1 had 180 and 91 values held, which is RCAS's
    overshoot, as at 64 x 64.
- `render/denoiseStudy-selfcheck.mjs` runs the EASU chain on two 16 x 16 scenes outside every split, to hold the plumbing. It
  reads no number for its value.
- Nothing of the test set has been rendered.

**Sabotaged before the harvest.** Seven runs, each restored byte-identical by SHA-256, logged as D39-D40 and R45-R49 in the
gates' headers. None was 0 red.
- The split left out of the dataset refusal: 2 red.
- Its C half drawn as R: 1 red.
- B upscaled by FSR1 whatever the candidate: 1 red.
- The round at 128 x 128: 1 red.
- The harvest not passing the candidate: 1 red.
- C4's re-run hard-coded to FSR1: 1 red.
- The candidate guard removed: 1 red.

**The command:** `node tools/denoiseStudy.mjs --harvest-halfres --cache <dir>` -> `render/denoise-results-halfres.json`.
- It refuses if the file exists.
- By the pilot, about 45 minutes here. The file is committed byte for byte before it is read, and section 90 reads it.

**Also in this commit, and not part of the round's question.**
- **`rig-adapter-features-probe`:** each adapter's features, a fixed set of limits and its subgroup sizes are now in
  `realGpuRun`'s report, natively and in Chrome, with one console line per adapter. Sabotaged six ways, F1-F6.
  - On this box's SwiftShader both halves list `subgroups` and neither offers `shader-f16`.
  - The rig's next run reads both GPUs.
- **`denoise-r18t-margin-1080` is closed** from the committed reports. Section 63's single 1.087 x is now one of eleven page
  readings at 1920 x 1080, all between 1.073 and 1.101 x.

## 90. ROUND 29 -- NOT REPORTED: C1 FIRED ON H2 AGAIN, AND THIS TIME THE LOSS IS IN THE UPSCALE, AT LIGHT SOURCES

**What arrived.** `render/denoise-results-halfres.json`, written by `tools/denoiseStudy.mjs --harvest-halfres` at ccd2df60, the
commit carrying section 89. It took 3,509 s to render the 12 test images at 256 x 256 here and 165 s to measure. The file was
committed byte for byte at 0c242093 before it was read.

**The run is not reported. Neither hypothesis is decided.**
- **C1 fired on H2.** Both of H2's frames must beat B's half-size input upscaled bilinearly on at least 11 of 12 images. **C
  (bilinear) did on 12 of 12; B (EASU) on 9.**
- **That is the difference from round 26,** where both did on 9. Here the network's denoised half-size frame holds up through
  a bilinear upscale on every image. On three, it is the EASU step that ends up no better than upscaling the noise.
- C1 held on H1 (D 12, B 11). C2 (cited), C3 (no image near its floor), C4 and C5 (60 distinct render seeds) held.
- `render/denoiseStudy-selfcheck.mjs` re-derives the verdict from the file's own tables. Sabotaged R50-R53; R53 is 0 red by
  construction, as its note says.

**What the file shows, reported and testing nothing.**

| | B (half size + EASU) against | mean d (positive: B better) | images B won |
|---|---|---|---|
| H1's direction | D, full size at 1 sample | -0.302 (round 26: -0.493) | 8 of 12 |
| H2's direction | C, half size + bilinear | -0.237 | 8 of 12 |
| the price of the quarter | A, full size at 4 samples | -1.149 (round 26: -1.406) | 0 of 12 |

- **RCAS made every image worse again.** FSR1 whole lost to EASU alone on all 12 (mean d 0.130 in EASU's favour), and RCAS
  without its denoise lost on all 12 (0.213).

**The split, found after the file was committed, deciding nothing.**
- **Where the four losses are.** B lost to both comparators on R1, R4, C1 and C5. Those are exactly the four images with a bright
  light source in view.
  - Their references peak at radiance 16, 17, 30 and 37. No other image peaks above 8.7.
  - On those four, 86-98% of B's error lies within 2 px of an emitter pixel, which is 0.1-2.7% of the frame.
  - C's error sits there too (82-89%), but it is 1.5 to 6 times smaller (R4 1.45 x, C5 2.0 x, C1 2.4 x, R1 6.0 x).
- **The other eight,** seven with no emitter in view and R2 with a dim one (peak 8.7), go the other way:
  - B beat C on all eight (d +0.02 to +0.28);
  - B beat D on all eight (d +0.17 to +1.00).
- **How these were computed.** From the harvest's own cache, by re-running the half-size denoise and both upscales on each
  image. Each pixel's term of relMSE was attributed to whether it lies within 2 px of the emitter coverage channel.
  - This is a description of the twelve images the test was run on, not a test.
  - It was chosen after the result was read, so it decides nothing and supports nothing.
- **A reading, not measured as a cause.** The upscaler does not know where the emitter edge is. It interpolates an emitter's
  radiance (tens) into the dark pixels beside it, whose reference is near zero, and relMSE weighs those pixels most. EASU's
  edge-following carries the bright value further along an edge than bilinear does.

**The predictions,** read against the directions, since nothing was decided.
- **P1 (H1 not supported, gap narrowing) pointed the way it said.** The mean d went from -0.493 to -0.302, inside the -0.4 to 0
  it named.
- **P2 (H2 supported) pointed the wrong way** on the mean. It pointed the right way on the eight images without a bright
  emitter.
- **P3 held:** B above A on all 12, at a price of 1.149, below round 26's 1.406.
- **P4 (C1 holds on both) failed,** on H2, by the EASU arm alone.

**What follows, and a conflict between two things written before the run.**
- **Section 89 said:** "If C1 fires on H2 again, `denoise-network-at-run-scale` becomes the next round."
- **The backlog said, at round 26:** that entry is "only if half resolution still loses at a realistic size, and loses in the
  denoise rather than the upscale."
- This round lost in the upscale. The denoise held: C, the same denoised frame upscaled bilinearly, beat its noisy frame on 12
  of 12.
- **The two statements point different ways on this outcome, and the choice is Keith's.** Section 89's sentence was written
  without that distinction in view. The backlog's condition is the more specific one, and this round's data answer it.
- **Logged as `denoise-halfres-emitter-aware`, and recommended:**
  - Composite the emitter pixels at full resolution from the geometry. A pure emitter's radiance is its emission, so those
    pixels need no tracing and no noise.
  - Upscale the rest with the emitter mask refusing taps across it, as the network's kernel apply already does (section 21).
  - Pre-register it on new seeds at 256 x 256.
- **`denoise-fsr2-temporal`** now waits on that round.

**What it does not change.** The page, the network, the filter, every kernel table.

## 91. ROUND 30 -- THE EMITTERS TAKEN OUT OF THE UPSCALE: FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's test set has been rendered.

**Why this round.** Round 29 (section 90) was not reported: C1 fired on H2, because B (half size + EASU) beat its noisy frame on
only 9 of 12 images. Two descriptive findings came out of it, both chosen after the result was read, so neither decides anything.
- The half-size chain won every image without a bright light source in view, against both comparators.
- It lost every image with one. Nearly all of its error (86-98%) lay within 2 px of an emitter pixel: the upscaler carried an
  emitter's radiance (tens) into the dark pixels beside it, where the reference is near zero.

Keith chose this round over `denoise-network-at-run-scale`, since the loss was in the upscale, not the denoise. It is
`denoise-halfres-emitter-aware` in the backlog.

> **With the light sources taken out of the upscale and put back at full size from the geometry, is a frame traced and denoised
> at 128 x 128, then upscaled to 256 x 256 by EASU, closer to the reference than the frames it could be instead?**

**Nothing is trained or tuned.** The network is round 11's seed 1, from the file the page loads. Its sha-256 is written beside
the results. The input is the arc's: 4 samples (or 1 for D), the nine channels and the emitter mask.

**The emitter-aware chain** (`render/denoiseUpscale.mjs`'s `emitterAwareUpscale`), on a frame denoised at half size:
1. **Take the emitters out.** Every half-size pixel an emitter touches (its own mask, coverage > 0) is replaced from the pixels
   none touches. The fill goes ring by ring inward: each such pixel takes the mean of its 8-neighbours that were known after
   the previous ring, so the order pixels are visited does not matter. No emitter pixel's own value is ever read.
2. **Upscale the rest** with `upscale`, unchanged: the same transfer, the same clamp, EASU or bilinear from `fx/fsr/fsr.js`.
3. **Put the emitters back** at full size: each pixel becomes `E + (1 - cov) x` the upscaled value.
   - `cov` is the emitter coverage at 256 x 256: the arc's own mask, the one the network reads for A and D. It comes from the
     same 8 x 8 grid of primary rays per pixel (section 21).
   - `E` is the mean, over that same grid, of the emission each ray meets (`render/denoiseMask.mjs`'s `emitterRadiance`). It
     is 0 for a ray that meets anything else.
   - A camera ray that meets an emitter returns exactly its emission (`physics/render/pathTracer.mjs`: at depth 0, before any
     bounce). So a pixel the emitters cover whole is `E` there, with no noise and nothing traced.
     `render/denoiseMask-selfcheck.mjs` traces such pixels and holds the render to `E` bit for bit.
- **A fill, not a refusal of taps.** The backlog entry spoke of the mask refusing taps across it, as the network's kernel does
  (section 21). Built that way, EASU itself would have to change. The fill gets the same effect, with no EASU tap ever reading
  an emitter's radiance, while `fx/fsr/fsr.js` runs unmodified. That is how a shipped upscaler would be used.
- **The grid is the arc's, not a finer one.** At a rim pixel, the composite is only as good as an 8 x 8 grid's estimate of
  coverage. The grid's error there is a residual this round carries. A finer grid would have meant a different mask from the
  one A and D are given.
- **What the full-size guide would cost on the rig is not this round's question.** The arc computes the mask at full size on
  the CPU, at 64 rays a pixel, for every frame. A rig round would have to time the same thing on the GPU.

**The frames, per test image.** Each is judged against the same 256 x 256 reference, with a second for C3.

| Frame | Traced | Then |
|---|---|---|
| **A** | 256 x 256, 4 samples | denoised -- today's page at this size; reported, never tested |
| **B, the candidate** | 128 x 128, 4 samples | denoised, then the emitter-aware chain with EASU |
| **C** | the same frame as B | denoised, then the emitter-aware chain with bilinear -- EASU's control |
| **D** | 256 x 256, 1 sample | denoised -- the SAME NUMBER OF SAMPLES as B; unchanged from rounds 26 and 29 |

Reported beside them, never tested:
- round 29's plain EASU and plain bilinear, on the same denoised half-size frame;
- **D composited:** D with the same fill and composite at full size, and no upscale.

On an image with no emitter pixel at either size, the fill and the composite change nothing. There, B is round 29's chain bit
for bit, and so is C.

**The split** (`SPLITS_EMITTER`), one test set read by both hypotheses:

| Set | Scenes | Seeds |
|---|---|---|
| T1 -> H1 and H2 | 6 of R, 6 of C, each as its own family | **44000-44005** and **45000-45005** |

These are the families the network was trained on. No earlier split touched these seeds, rounds 26 and 29's among them, and
every one is refused without `harvest`. C5 holds over the round's 60 render seeds.

**The hypotheses**, with section 6's statistic and section 28's test. `verdict()`'s `filter` column is the comparator and its
`net` column is B. Both are read from one exported definition, `emitterSets`.
- **H1: B beats D.** At the same number of samples, half resolution through the emitter-aware chain is closer to the reference
  than full resolution at 1 sample. Effect per image: `d = ln relMSE(D) - ln relMSE(B)`.
- **H2: B beats C.** EASU is closer than bilinear inside the same chain, on the same denoised frame. Effect:
  `d = ln relMSE(C) - ln relMSE(B)`.
- Each is supported iff its mean d is > 0 and its sign-flip p is below its Holm threshold, over {H1, H2} at 0.05.

**Controls.**
- **C1, per hypothesis:** both of its frames must beat that hypothesis's own un-denoised frame on at least 11 of 12 images.
  - For H1, that is D's 1-sample input, as before.
  - **For H2, it is B's half-size input through the SAME emitter-aware bilinear chain.** In round 29 it was that input
    upscaled bilinearly. The change is so that C1 asks of both arms what it was written to ask: that the denoise does
    something. Against the plain upscale, the composite alone could carry an arm past C1 with the network contributing
    nothing.
- **C2:** cited from round 11, as in sections 79, 81 and 89.
- **C3:** B within 2 x of the floor on more than half the images makes that hypothesis not resolvable.
- **C4:** the candidate's whole chain, run twice, gives B bit for bit. That covers the network, the emitters' light from the
  geometry, the fill, EASU and the composite.
- **C5:** 60 distinct render seeds.
- **And a refusal, not a control:** the run stops, measuring nothing, if any image's composite coverage differs from the mask
  its full-size input carries.

**What each outcome buys.**
- **H1 supported, with or without H2:** at this size, half resolution with the emitters composited is the better spend of four
  samples a pixel.
  - The next round times the chain on the rig: the denoiser at half size, then the fill, EASU (or bilinear, if H2 fails) and
    the composite on the GPU.
  - `denoise-fsr2-temporal` comes off its blocker.
  - **One qualification, fixed now.** If B loses to D composited on the mean, the composite carried H1 and the half
    resolution did not. Then the next round is the composite at full size instead, logged as its own entry.
- **H2 only:** EASU beats bilinear with the emitters out, but the full-size frame at equal samples is the better spend. The
  half-resolution lever is not worth a rig round at this size.
- **Neither, not reported or not resolvable:** recorded as found, and the FSR entries stay behind it.
  - If C1 fires on H2 again with the emitters out, the next step depends on which arm failed. C failing (bilinear, the
    plainer upscale) puts the half-size denoise in question, and `denoise-network-at-run-scale` becomes next by its own
    condition. B alone failing puts EASU in question.

**Predictions, fixed now, deciding nothing.** Each is written from round 29's committed tables.
- **P1: H2 is supported.** I expect a mean d between +0.03 and +0.25, with B winning at least 10 of 12.
  - On round 29's eight images without a bright emitter, EASU beat bilinear on all eight (d +0.02 to +0.28, mean +0.116).
  - With the emitters out, the images with one should go the same way.
- **P2: H1 is supported.** I expect a mean d between +0.3 and +0.8, with B winning at least 11 of 12.
  - On the same eight, B beat D on all eight (d +0.17 to +1.00, mean +0.439).
  - On an image with a bright emitter, D's rim pixels are 1-sample noise between 0 and the emission. The composite's are an
    8 x 8 grid's estimate.
- **P3: C1 holds on both hypotheses, 12 of 12 for every arm.** In round 29 the denoised frames sat far below their noisy
  frames everywhere but at emitters (C 12 of 12; B's three misses were all emitter images).
- **P4: the aware chain beats plain EASU on every image with an emitter pixel in view.** On every image with none, at either
  size, it equals plain EASU exactly (d = 0) by construction.
- **P5: B's share of error within 2 px of an emitter is below 50% on all twelve images,** against round 29's 86-98% on its four
  bright-emitter images. It is below plain EASU's share on every image with an emitter in view.
- **P6: B beats D composited on the mean,** on at least 9 of 12, by less than H1's margin.
- **P7: the price of the quarter falls** to a mean between 0.3 and 0.8, with B's error still above A's on at least 10 of 12.
  - In round 29 it was 1.149. The four emitter images gave 10.48 of the 13.79 summed, and the other eight averaged 0.413.

**Secondary, reported, never tested.**
- **The price of the quarter:** d of A against B.
- **The aware chain against plain EASU:** d of round 29's chain against B.
- **D composited against B.**
- **The share of each frame's error within 2 px of an emitter pixel,** for B, C, plain EASU and D. This is section 90's
  descriptive split, now fixed in code (`nearEmitterShare`) before the run.
- **The number of emitter pixels in view per image,** and per-image tables, every noisy frame's error and the floor.

**What was seen first.**
- Everything in sections 1-90. That includes round 29's per-image tables, which P1 to P7 are written from.
- **The premise, on 30 scenes per family outside every split (R and C 990200-990229), at 32 x 32 against 256 samples.** On the
  21 scenes with at least two pixels covered whole, the reference over the geometry's `E` read 1.0000 on every whole pixel of
  17 of them. On the other 4, the lowest single whole pixel read 0.985 to 0.996: the grid said whole, but some jittered
  samples fell off the disc.
  - This compares the reference with the geometry, not any frame of the round.
  - It is the only comparison against a reference made before this commit.
- **The miniature's tables were printed once while building.** That is 16 x 16 on two scenes outside every split, against an
  8-sample reference.
  - On the C scene the aware chain read worse than plain EASU (0.589 against 0.277).
  - At 8 samples, that scene's rim pixels are not a reference. Its three emitter pixels have E 9.13, 11.82 and 1.61. Traced
    at 64 samples they read 6.5, 8.1 and 1.1; traced again at 4,096, they read 8.25, 11.60 and 1.58.
  - So the gap at 8 and 64 samples was the reference's noise. What is left, up to 10% at the first pixel, is the grid's own
    error at a rim: the residual described above.
  - That is also why the premise above was checked at 256 samples. Nothing from these numbers is in a prediction.
- **The pilot, on two scenes outside every split with emitters in view (R 990211, C 990214), mechanics only, nothing scored
  against a reference:**
  - Rendering took 270 s for R and 353 s for C.
  - The emitters' light from the geometry took 1.1-1.2 s at 256 x 256. Each 128 x 128 denoise took 1.5-1.6 s, each 256 x 256
    one 5.3-5.6 s. The fill took 6-10 ms, and both emitter-aware upscales together 0.17-0.28 s.
  - Emitter pixels at full size: R 2,955 whole and 236 at a rim, C 1,580 and 113. At half size, 832 and 439 were filled.
  - On both: the composite's coverage equalled the full-size input's mask, C4 held bit for bit, and every frame was finite.
    On every whole emitter pixel, B equalled E bit for bit.
  - **The network passes an emitter's radiance through.** The denoised half-size frame peaked at exactly E's peak (26.43 and
    41.46). After the fill it peaked at 0.98 and 1.49, the light beside the emitters. That is what EASU now reads.
- `render/denoiseStudy-selfcheck.mjs` runs the whole round on two 16 x 16 scenes outside every split, to hold the plumbing. It
  reads no number for its value.
- Nothing of the test set has been rendered.

**Sabotaged before the harvest.** Each run was restored byte-identical by SHA-256, and each is logged in its gate's header.
- **One went 0 red, and that is a finding:** R55, H2's noisy frame swapped for round 29's plain bilinear one.
  - The first draft's row compared the verdict alone. On two miniature images, C1's counts over either noisy frame come out
    the same.
  - The hypotheses' columns are now one exported function, held column by column by identity, with the run held to calling
    it.
  - Re-sabotaged as R55b, R59b and R62: 1 red each.
- **The other 18 of the first set of 19, by name:**
  - **`render/denoiseMask-selfcheck.mjs`:**
    - M9, the light averaged over the emitter rays only: 1 red.
    - M10, a tint read as one channel: 2 red.
    - M11, the centre ray alone: 1 red.
  - **`render/denoiseUpscale-selfcheck.mjs`:**
    - U7, the fill reading emitter pixels: 3 red.
    - U8, the fill in place, in scan order: 1 red.
    - U9, the composite without `1 - cov`: 1 red.
    - U10, the chain without its fill: 1 red.
    - U11, the share ignoring its reach: 1 red.
    - U12, only whole emitter pixels filled: 3 red.
  - **`render/denoiseScenes-selfcheck.mjs`:**
    - D41, the split out of the dataset refusal: 2 red, counting one in the study gate.
    - D42, its C half drawn as R: 1 red.
  - **`render/denoiseStudy-selfcheck.mjs`:**
    - R54, B through plain EASU: 2 red.
    - R56, C4 re-running plain EASU: 1 red.
    - R57, the round at 128: 1 red.
    - R58, the CLI running round 29's study: 1 red.
    - R59, H1 against D composited: 1 red.
    - R60, the mask refusal removed: 1 red.
    - R61, D composited without its fill: 1 red.

**The command:** `node tools/denoiseStudy.mjs --harvest-emitter --cache <dir>` -> `render/denoise-results-emitter.json`.
- It refuses if the file exists.
- By the pilot, about 65 minutes here: rendering dominates, as in round 29 (3,509 s), and the chain adds seconds an image.
- The file is committed byte for byte before it is read, and section 92 reads it.

## 92. ROUND 30 -- REPORTED, BOTH HYPOTHESES SUPPORTED: WITH THE EMITTERS COMPOSITED, HALF RESOLUTION IS THE BETTER SPEND AT 256 x 256

**What arrived.** `render/denoise-results-emitter.json`, written by `tools/denoiseStudy.mjs --harvest-emitter` at 5a2241e0, the
commit carrying section 91. It took 3,744 s to render the 12 test images at 256 x 256 here and 213 s to measure. The file was
committed byte for byte at d876dfce before it was read. Its network sha-256 is `render/denoise-net-r11.json`'s, the file the
page loads.

**The run is reported, and both hypotheses are supported.**

| | B (half size + emitter-aware EASU) against | mean d (positive: B better) | B won | sign-flip p | Holm threshold |
|---|---|---|---|---|---|
| **H1** | D, full size at 1 sample | **+0.694** | 12 of 12 | 0.00024 | 0.025 |
| **H2** | C, half size + emitter-aware bilinear | **+0.104** | 10 of 12 | 0.0022 | 0.05 |

- H1's p is 1/4096, the smallest a sign-flip test over 12 images can give.
- **Every control held.**
  - C1 held for all four arms at 12 of 12. On H1, B and D each beat D's 1-sample input. On H2, B and C each beat the half-size
    input through the same emitter-aware bilinear chain.
  - C2 is cited from round 11. C3: no image was near its floor on either hypothesis. C4 held, and C5 over 60 distinct render
    seeds.
- **`render/denoiseStudy-selfcheck.mjs` re-derives all of it from the file's own tables,** through `emitterSets`, the one
  definition of the hypotheses' columns. Beside that are four more rows: the network's sha-256, the bit-for-bit identities
  below, section 91's rule, and the seven predictions. Sabotaged R63-R68; none was 0 red.

**What it says, and where it stops.**
- At 256 x 256, take a frame traced and denoised at a quarter of the pixels and upscaled by EASU, with the light sources put
  back at full size from the geometry. On every one of 12 new images, it was closer to the reference than the full-size frame
  traced at the same number of samples. And EASU beat bilinear inside that chain.
- **Only four of the twelve images had an emitter in view:** R 44000, 44001, 44002 and 44004, with 30, 1,268, 950 and 1,715
  emitter pixels.
  - None of the six C scenes had an emitter pixel in view. That is how the scenes were drawn, not a choice. C's two lights are
    small (radius 0.15-0.3), at height 1.8-3.2.
  - On the other eight images the chain is round 29's, bit for bit, and a gate row holds that.
- **So this round is also a pre-registered test, on new seeds, of section 90's descriptive split,** and it held. The split
  below is descriptive and decides nothing:

  | | images | H1 mean d | H2 mean d |
  |---|---|---|---|
  | no emitter in view | 8 | +0.551 (+0.09 to +1.12) | +0.124 (-0.053 to +0.286) |
  | an emitter in view | 4 | +0.980 (+0.86 to +1.21) | +0.064 (-0.004 to +0.205) |

  - **H2's two losses** are R 44000 (-0.004, the image with 30 emitter pixels) and C 45000 (-0.053, no emitter in view).
  - So EASU lost to bilinear on one plain image. In round 29 it lost on none of eight.
- **256 x 256 is not 1080p.** Nothing here says what the chain costs on a GPU, including the full-size emitter coverage at 64
  rays a pixel that the composite needs. That is the next round's question.
- **The composite's residual is small where it was measured.** B's share of its error within 2 px of an emitter pixel was at
  most 2.4% (R 44004). On the same four images, plain EASU's share was 12-92% and D's 1-34%.

**Reported, testing nothing.**

| B against | mean d (positive: B better) | B won |
|---|---|---|
| round 29's plain EASU, on the same frame | +0.345 (0 exactly on the 8 without an emitter; +0.12, +1.01, +2.55 and +0.46 on the 4 with one) | 4 of 4 with an emitter |
| D composited (the same fill and composite at full size) | +0.626 | 12 of 12 |
| A, full size at 4 samples (the price of the quarter) | -0.327 (round 29: -1.149) | 0 of 12 |

- **The composite helps D too.** On the four images with an emitter, D composited beat D by d +0.01, +0.23, +0.42 and +0.16. B
  still beat D composited on all twelve, which is the qualification section 91 fixed. So the half resolution carried H1, not
  the composite alone.
- **The composite helps the noisy frame too.** On all four emitter images, H2's noisy frame improved on round 29's plain
  bilinear one: 0.0287 to 0.0282, 0.0201 to 0.0172, 0.0112 to 0.0079, and 0.0197 to 0.0174. That is why C1 now asks against
  it. Both denoised arms beat it on 12 of 12.

**The predictions: all seven held**, read off the file by the gate's last row.
- **P1, H2 supported:** +0.104, inside +0.03 to +0.25, on 10 of 12.
- **P2, H1 supported:** +0.694, inside +0.3 to +0.8, on 12 of 12.
- **P3, C1 at 12 of 12 for every arm:** it was.
- **P4:** the aware chain beat plain EASU on all four images with an emitter pixel, and equalled it exactly on the eight
  without.
- **P5:** B's share near an emitter was at most 0.024, below plain EASU's on all four.
- **P6:** B beat D composited on 12 of 12, by +0.626, below H1's +0.694.
- **P7:** the price of the quarter fell to 0.327, inside 0.3 to 0.8 but near its floor, with B's error above A's on all 12.
- **What none of them foresaw:** that none of the six C scenes would have a light in view. Every emitter case in this round
  is a white R light.

**What follows, by section 91's rule** (`rule92` in the gate): H1 is supported, and B is ahead of D composited on the mean.
- **The next round times the chain on the rig,** logged as `denoise-halfres-rig-timing`. At 1920 x 1080 output, that is:
  - the denoiser at 960 x 540;
  - the fill and composite in WGSL, gated against `render/denoiseUpscale.mjs`'s CPU reference;
  - EASU through `fx/fsr/fsrGPU.js`;
  - the full-size emitter coverage the composite needs.
  It is held against today's full-size page.
- **`denoise-fsr2-temporal` comes off its blocker.**
- **`denoise-network-at-run-scale` stays blocked.** The half-size denoise held: C beat its noisy frame on 12 of 12, as it did
  in round 29.
- **`denoise-halfres-emitter-aware` is closed.**

**What it does not change.** The page, the network, the filter, every kernel table. The emitter-aware chain is a CPU reference
until the rig round puts it on a GPU.

## 93. ROUND 31 -- THE HALF-SIZE CHAIN TIMED ON THE RIG AT 1920 x 1080: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 92 supported both hypotheses at 256 x 256: a frame traced and denoised at a quarter of the pixels,
its light sources filled out before EASU and put back at full size from the geometry, beat the full-size frame at equal samples
on 12 of 12 images. Its rule (`rule92`) sent the arc here, as `denoise-halfres-rig-timing`: does the saving survive at 1080p on
a GPU, once the fill, EASU, the composite and the coverage guide are paid for?

> **At 1920 x 1080 output, on each GPU, is round 30's chain -- the network at 960 x 540, the coverage at both sizes, the fill,
> EASU and the composite -- faster than today's page, the network at 1920 x 1080 with its mask?**

**What exists for it (committed before this section).**
- `render/denoiseUpscaleGPU.mjs`: the chain's kernels and their runner, through `gfx/device.js`. Coverage is
  `render/denoiseMask.mjs`'s `emitterRadiance`, 64 rays a pixel, over the scene's spheres. The fill is round 30's ring rule, run
  as a fixed number of ring passes, because a device cannot loop until nothing changes without a readback.
  `fillEmittersBounded` in `render/denoiseUpscale.mjs` is that bounded form's CPU reference. Then the transfer, `fx/fsr`'s EASU
  kernel, the clamp, the inverse and the composite, all on one encoder.
- `render/denoiseUpscaleGPU-selfcheck.mjs` holds every step to its CPU reference. On SwiftShader: coverage 1 ray different in 8
  frames, the fill within 1.2e-7, the whole chain within 2.3e-6 of `emitterAwareUpscale(..., "easu")`. Sabotaged G1-G9, T1-T4.
  The gate joins `realGpuRun --only denoise`, and on a GPU its section 4 also runs the rig's size.
- `denoise.html`'s "Time the half-size chain" (`timeHalfChain`) times both networks with the page's own `timingLadder`, on
  the page's kernel set for the adapter (r18u on the Intel, r18t on the 1080, section 63), and each step of the chain on its own.

**The arms, at 1920 x 1080 output.**
- **Today's page, `full`:** the network at 1920 x 1080, plus the coverage at 1920 x 1080. The network reads the coverage as its
  mask, so a GPU frame of today's page pays for it too.
- **The chain, `half`:** the network at 960 x 540, the coverage at 960 x 540 (its mask and the fill's), the coverage at 1920 x
  1080 (the composite's guide), the fill, and the transfer, EASU and the composite.
- **The scene is R 990000**, not a dataset seed. Its light covers 25,765 of the half-size frame's pixels, and the fill needs 87
  rings there (measured on the CPU). That is near the worst of the arc's: 77 for R 44004, 36 and 29 for R 44002 and 44001.
- **The fill's budget is 96 rings, every frame.** Every ring pass runs over every pixel whether it fills any or not, so the fill
  costs the same on any scene. A scene needing more than 96 would leave pixels at 0; the gate holds that it needed fewer.

**The clocks.** The networks are timed on the device's clock wherever the adapter offers timestamps, as every timing round
has been. The coverages and the transfer/EASU/composite step are also on the device's clock (one and three passes a frame). The
fill is 97 passes, more than `gfx/device.js` timestamps in one frame (30), so it is on the wall clock: `performance.now()` around
the frame and the queue's `onSubmittedWorkDone`. That includes the submit and the wait, so it can only overstate the fill. Each
sum names the clocks it was made of. A fifth number, every step of the chain in one frame on the wall clock, is reported as a
cross-check on the sum and decides nothing.

**The test.** On each GPU, two runs of `realGpuRun --only denoise`, at a commit carrying this section:
- **H (per GPU):** the ratio `full / half` is above 1.0 in both runs.
- **C1:** every denoise gate is green in both runs. That includes `render/denoiseUpscaleGPU-selfcheck.mjs`'s device rows:
  coverage, fill and chain held to the CPU on that GPU's own Chrome adapter.
- **C2:** the fill reaches every pixel in its 96 rings, and fills on fewer than 96.
- **C3:** both networks are on the device's clock. A run where either is on the wall clock has no verdict for that GPU.
- **C4, reported:** the two runs' ratios, and how far apart they are.

**Predicted, before any of it ran on a GPU** (from rounds 27-28's page ladders: the 1080's r18t at 1920 x 1080 is 73-75 ms a
pass; the Intel's r18u is 1.16-1.37 s):
- **GTX 1080:** H holds, with the ratio between 1.4 and 3.0. The network at 960 x 540 is 18-25 ms (a quarter of the pixels; a
  smaller frame uses the GPU less well). The coverages are 1-10 ms together, the fill 3-15 ms, the rest 1-3 ms.
- **Intel gen-9:** H holds, with the ratio between 2.0 and 4.0. The network is a larger share of its frame, so the fixed costs
  weigh less.
- **C2 holds** on both: the fill uses 87 rings at 960 x 540, as on the CPU.

**What each outcome does.**
- **H holds on both GPUs:** the half-size chain is cheaper than today's page at 1080p on both rigs, as well as better at equal
  samples (section 92). Then `denoise-fsr2-temporal` (temporal accumulation over the half-size chain) is the arc's next round,
  and putting the chain on the page as an option becomes a backlog item. The page itself does not change in this round.
- **H fails on a GPU:** the steps are named from the run, and the backlog records where the saving went -- the fill's fixed 97
  passes, the full-size coverage, or the network's poorer use of a smaller frame.
- **Nothing changes in either case:** the page, the network, the filter, every kernel table, and `fx/fsr`.

**Seen first, here, on SwiftShader -- a CPU's times, deciding nothing.** At the gate's pilot size (64 x 36 to 128 x 72) the
chain ran 2.0-2.1 x as fast as the full-size network alone, before the mask was counted on the page's side.
At 1920 x 1080, forced on SwiftShader once (`SWEK_HALFCHAIN_RIGSIZE=1`) to drive the rig's path: the fill filled on 87 of
its 96 rings, the CPU's count exactly, and every step of the chain was timed. The network at 1920 x 1080 was not: its pass was
predicted at 111 s, over the cap, so that run's section-93 row was red, and no ratio was made. On a GPU the pass is 0.07-1.4 s.

## 94. ROUND 31 -- THE VERDICT: THE HALF-SIZE CHAIN IS CHEAPER THAN TODAY'S PAGE AT 1080p ON BOTH GPUS

**What arrived.** Two `realGpuRun --only denoise` runs on each GPU, `SWEK_WEBGPU` cleared: the Intel gen-9 at 1c60b346 (the
commit that carried section 93), and the GTX 1080 at 77aaece5 (the same, plus one sentence of section 93). Committed as received
at 7706ce4c, before this section was written: `render/denoise-rig-r31-{a,b}-{intel-gen9,gtx1080}.json`.

**Section 93's rule, read off the reports.** `render/denoiseUpscaleGPU-selfcheck.mjs`'s section 5 re-derives every figure
here from those four files: their commits, every gate's verdict, and the chain gate's two `section 93:` lines.

| | Run a | Run b | H |
|---|---|---|---|
| GTX 1080 (r18t): today's page against the chain, at 1920 x 1080 | 92.2 / 64.1 ms = **1.439 x** | 89.5 / 60.5 ms = **1.479 x** | **holds** |
| Intel gen-9 (r18u) | 1,591.5 / 1,035.3 ms = **1.537 x** | 1,606.1 / 1,167.6 ms = **1.376 x** | **holds** |

- **C1:** every denoise gate was green in all four runs, the chain's own device rows among them.
- **C2:** the fill filled on 87 of its 96 rings in every run, the CPU's count, so it reached every pixel.
- **C3:** both networks were on the device's clock in every run.
- **C4, reported:** the 1080's two runs were 3% apart, and the Intel's 11%.

**So, by section 93's rule: `denoise-fsr2-temporal` is the arc's next round.** At 1080p the half-size chain is cheaper than
today's page on both rigs, as well as closer to the reference at equal samples (section 92). Putting the chain on the page as
an option becomes `denoise-halfres-page` in the backlog. Nothing changes in this round: the page, the network, the filter,
every kernel table, and `fx/fsr`.

**The predictions.** They decided nothing. Section 5's last row reads each one off the reports.
- **Held:** the 1080's ratio (1.4-3.0 predicted); its network at 960 x 540 (18.4 ms both runs, 18-25 predicted); its transfer,
  EASU and composite (1.0 ms, 1-3 predicted); and the 87 rings on both GPUs.
- **Missed:** the Intel's ratio, 1.376-1.537 against 2.0-4.0 predicted. The 1080's two coverages, 21.1-21.3 ms against 1-10.
  Its fill, 20.0-23.4 ms against 3-15.
- **Why they missed:** the chain's fixed costs were underestimated on both GPUs. The prediction for the Intel was that the
  network would be "a larger share of its frame, so the fixed costs weigh less". That was wrong: they weighed more.

**What it says, and where it stops.**
- **The chain's own steps cost more than the network they sit beside.** Both coverages, the fill, and the transfer, EASU and
  composite together were 42-46 ms against an 18 ms network on the 1080. On the Intel they were 728-821 ms against 308-347 ms.
  The chain kept its lead because the network at 1920 x 1080 costs about four times the one at 960 x 540 (72.7-75.2 ms
  against 18.4 on the 1080; 1,317-1,333 ms against 308-347 on the Intel).
- **The full-size coverage is part of today's page too.** It was 17 ms of the 1080's page and 274 ms of the Intel's, at 64
  rays a pixel. It is the mask the network reads, so the chain was not charged for it alone.
- **The fill was by the wall clock, and so can only be overstated.** The chain's steps in one frame, also by the wall clock,
  were 40.6-40.7 ms on the 1080 and 728-795 ms on the Intel. That cross-check is close to the sum of the parts.
- **The ratios are one scene's: R 990000, a large light, 87 rings.** Every ring pass runs over every pixel, so the fill costs
  the same on any scene with 96 rings budgeted. The coverage's cost scales with the number of spheres, and this scene's six are
  typical of family R.
- **`denoise-halfres-fixed-costs`** records the levers: a fill over the lights' bounding boxes, or one that stops once nothing
  is left, exact against `fillEmittersBounded`; and fewer coverage rays, which changes the guide and so is a new quality
  question, not the same chain made faster.

## 95. ROUND 32 -- THE TEMPORAL UPSCALE: ROUND 30's CHAIN OVER EIGHT JITTERED FRAMES, FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's test set has been rendered.

**Why this round.** Section 94's rule: the half-size chain is cheaper than today's page at 1080p on both rigs (round 31), as
well as better at equal samples (round 30). That made `denoise-fsr2-temporal` the next round: temporal reuse over the chain,
where real-time path tracing gets most of its samples. Keith chose the design: the history goes after the chain, at full size,
as FSR2 and TAA put it, so the shipped network never sees an input it was not trained on. And the half-size frames are jittered.

> **Over eight frames of a moving camera, each traced at half size and jittered, does accumulating round 30's chain at full
> size bring the measured frame closer to the reference than the same chain on that frame alone, and than full size at the
> same samples a frame, accumulated the same way?**

**Nothing is trained or tuned.** The network is round 11's seed 1, from the file the page loads; its sha-256 goes beside the
results.

**The sequence** (`render/denoiseTemporalUpscale.mjs`, on round 4's `render/denoiseTemporal.mjs`).
- Round 4's camera path: the camera orbits the scene's look point for `FRAMES` = 8 frames, 1.5-4 degrees a frame drawn per
  scene, and arrives at the scene's own eye. The measured frame is the last.
- **The jitter:** frame f's pixel grid is shifted by `JITTER[f]`, `render/jitter.mjs`'s first 8 centred Halton(2, 3) offsets,
  in that frame's own pixels. It is done through the path tracer's new `pixelOffset`, and through the same offset in
  `guideBuffers` and in the emitter coverage, so a jittered frame's albedo, normals and mask are its own. All three are
  default-off and held bit for bit at offset 0 by their own gates.
- Each frame, two renders: half size (128 x 128) at 4 samples, and full size (256 x 256) at 1 sample. A full-size pixel gets
  the same number of samples from either. The reference and second reference are 256 x 256 at 1,024 samples, from the
  measured frame's eye, unjittered.

**The arms, each against the measured frame's reference.**
- **Bt, the candidate.** Every frame goes through round 30's chain up to EASU: the shipped network at half size, the light
  sources filled out from that frame's own coverage, and EASU to full size. Then the frames are accumulated:
  1. each frame is resampled to its own unjittered grid. A half-size offset is twice that at full size (`halfShift`), and the
     resample is bilinear;
  2. the history is reprojected by round 4's rule (same object, same point, same facing) and clamped per channel to the
     current frame's 3 x 3 range;
  3. it is averaged with n = min(n + 1, 8).

  The light sources are composited once, after the accumulation, from the measured frame's unjittered `emitterRadiance`.
  Composited every frame, the history would carry their radiance through the clamp into the pixels beside them: the leak round
  30 took out of the upscale.
- **B1:** the same chain on the measured frame alone (its own jittered frame, resampled and composited), with no history. The
  measured frame's data is the same as Bt's, so H1 tests the history and nothing else.
- **Dt:** every frame at full size, 1 sample, denoised, accumulated the same way, not composited, as round 30's D was not.

**The test.**
- **H1:** Bt beats B1. **H2:** Bt beats Dt.
- d = ln relMSE(comparator) - ln relMSE(candidate); the sign-flip test; Holm over {H1, H2} at 0.05.
- **C1:** both frames of a hypothesis beat its noisy frame on 11 of 12.
  - H1's noisy frame: the measured frame's half-size input through the same fill, a bilinear upscale, its shift and the
    composite.
  - H2's: the measured frame's 1-sample input, shifted.
- **C2** is cited from round 11. **C3:** no image near its floor (the second reference).
- **C4:** the candidate's whole chain run again on the first image, bit for bit. **C5:** all 216 render seeds distinct.
- **The images:** `SPLITS_TEMPORALUP`, 6 new R scenes (46000-46005) and 6 new C scenes (47000-47005). Every seed is reserved.

**Reported, never tested:**
- Bt without the clamp.
- D1, the measured frame alone at full size, against Dt.
- Dt with the light sources composited.
- The history length: mean n, and the share of pixels at 8.

**What each outcome does.**
- **Both supported:** temporal reuse over the half-size chain holds at equal samples a frame. The accumulation goes to the
  device as one more pass of `render/denoiseUpscaleGPU.mjs` and is timed on the rig: `denoise-temporalup-device`.
- **H1 alone:** history helps the chain, but full size with the same history catches up, so the half-size lead was a
  single-frame effect. The backlog records it, and the page stays as it is.
- **H1 not supported:** the accumulation as built does not help. The backlog names the suspects: the resample's blur, the
  clamp, and eight frames being a quarter of FSR2's 32 phases at a 2x upscale.
- **Not reported (C1):** nothing is decided, and the backlog records which frame failed which noisy frame.
- **Nothing changes in any case:** the page, the network, the filter, every kernel table, `fx/fsr`.

**Predicted:**
- **P1, H1 supported:** mean d between +0.05 and +0.40, on at least 10 of 12.
- **P2, H2 supported:** mean d between +0.5 and +3.0, on at least 10 of 12. It is largest where a light is in view, where the
  1-sample full-size frames carry the most noise.
- **P3, C1:** holds on both hypotheses.
- **P4:** the clamp helps. Bt beats Bt-without-clamp on the mean.
- **P5:** the mean history length is between 3 and 7 frames.

**Seen first, on three scenes outside every split (R 990000, C 990001, R 990004), at 128 x 128 with a 256-sample reference.**
- The candidate beat B1 on all three, with d +0.08, +0.20 and +0.27.
- It beat Dt on all three, with d +0.28, +4.1 and +5.7. The last two have a large light in view, and there the 1-sample
  full-size frames stayed far from the reference however they were accumulated.
- The clamp helped on all three.
- The mean history was 3.7-5.6 frames.
- At 32 x 32, with a 32-sample reference, the same pilot had the candidate behind B1 on two of the three. The shifts were then
  checked and are held exact by the gate. What caused it at that size was not pinned down: resampling blur on a frame that
  small is a suspect, not a finding.

## 96. ROUND 32 -- REPORTED, BOTH HYPOTHESES SUPPORTED: THE HISTORY HELPS THE HALF-SIZE CHAIN, AND THE CHAIN KEEPS ITS LEAD

**What arrived.** `render/denoise-results-temporalup.json`, written by `tools/denoiseStudy.mjs --harvest-temporalup` at 75052a02,
the commit carrying section 95, and committed as written at 473a8927 before it was read. A container restart killed the first
run while it rendered the last image. It was run again against the same cache, at the same commit with a clean tree, so the
first eleven sequences were reused as rendered. The network's sha-256 in the file is the page's `render/denoise-net-r11.json`'s.

**The run is reported, and both hypotheses are supported.**

| | Bt (the temporal upscale) against | mean d (positive: Bt better) | Bt won | sign-flip p | Holm threshold |
|---|---|---|---|---|---|
| **H1** | B1, the same chain on the measured frame alone | **+0.259** | 12 of 12 | 0.00024 | 0.025 |
| **H2** | Dt, full size at 1 sample a frame, accumulated the same way | **+3.016** | 11 of 12 | 0.00073 | 0.05 |

- H1's p is 1/4096, the smallest a sign-flip test over 12 images can give.
- **Every control held.** C1 held at 12 of 12 for all four frames against their noisy frames. C2 is cited from round 11. C3:
  no image was near its floor. C4 held, and so did C5 over 216 distinct render seeds.
- **`render/denoiseStudy-selfcheck.mjs` re-derives all of it** from the file's own tables, through `temporalUpSets`, the one
  definition of the hypotheses' columns. It also holds the file's commit and network, section 95's rule as code, and the
  five predictions. Sabotaged R69-R72; none was 0 red.
- Geometric-mean relMSE:

  | frame | relMSE |
  |---|---|
  | Bt | 0.0026 |
  | B1 | 0.0033 |
  | Dt | 0.0524 |
  | H1's noisy frame | 0.0102 |
  | H2's noisy frame | 0.1930 |

**So, by section 95's rule: the accumulation goes to the device and is timed on the rig.** That is
`denoise-temporalup-device`: one more pass of `render/denoiseUpscaleGPU.mjs`, and the round after it on the rig. Nothing
changes in this round: the page, the network, the filter, every kernel table, `fx/fsr`.

**The predictions.** They decided nothing; the gate reads each off the file.
- **P1 held:** H1 at +0.259, inside +0.05 to +0.40, on 12 of 12.
- **P2 missed, narrowly:** H2 at +3.016, over its predicted +0.5 to +3.0. It was on 11 of 12, where at least 10 were
  predicted.
- **P3 held:** C1 on both hypotheses.
- **P4 held:** the clamp helped on the mean (d +0.463 against Bt without it), on 10 of 12. It hurt on R 46002 (-0.05) and
  R 46004 (-0.21).
- **P5 held:** the mean history was 4.2-6.0 frames. 33-58% of each image's pixels reached all 8.

**What it says, and where it stops.**
- **H2's size is the full-size 1-sample frames', not the candidate's.** On eight of the twelve images, H2's noisy frame was
  above 0.1 relMSE (0.14-1.33). Dt stayed close to it there: the shipped network does not take a 1-sample frame of those
  scenes near the reference, and eight frames of the same history barely moved it. D1 against Dt was d +0.068 on the mean,
  at most +0.36. On the other four, H2's d was +3.26, +0.03, +0.18 and -0.10. The one loss is C 47003, where Dt reached
  0.0017 against Bt's 0.0019.
- **The history did more for the half-size chain than for full size at the same samples:** +0.259 against +0.068. This is
  reported, not tested.
- **This is one camera move, from a cold start.** An eight-frame orbit of 1.5-4 degrees a frame, ending at the measured frame,
  with nothing in the scene moving. Disocclusion is only what the orbit uncovers. No moving object is tested, and nothing
  about a longer history.
- **Eight frames are a quarter of FSR2's 32 phases at a 2x upscale.** The history ran on the first 8 Halton offsets.
- **Nothing here is timed.** The accumulation is one reprojection, a 3 x 3 clamp and a blend a frame, and its cost on a GPU
  is the next round's to measure.

## 97. ROUND 33 -- ROUND 32's HISTORY ON THE DEVICE, TIMED ON THE RIG AT 1920 x 1080: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 96's rule: both hypotheses were supported, so the accumulation goes to the device and is timed.
Round 31 found the half-size chain cheaper than today's page at 1080p on both rigs (1.44-1.48 x on the GTX 1080, 1.38-1.54 x
on the Intel gen-9). It also found the chain's own steps cost more than its network.

> **At 1920 x 1080 output, on each GPU, is the half-size chain WITH round 32's history -- its first hits, the shift to the
> unjittered grid, the accumulation and the composite after it -- still faster than today's page?**

**What exists for it (committed before this section).**
- `render/denoiseUpscaleGPU.mjs` gains four kernels, each held to its CPU reference by
  `render/denoiseUpscaleGPU-selfcheck.mjs`'s section 6 on SwiftShader:
  - `FIRSTHITS_WGSL`, against round 4's `firstHits`: no sphere flipped at either eye, position and normal within 1.7e-4;
  - `SHIFT_WGSL`, against `shiftResample`;
  - `ACCUM_WGSL`, against `accumulateUpscaled`: given the CPU's first hits, the history length within 3.1e-5 and the light
    within 5.5e-7, clamped and not;
  - `FINAL_WGSL`, against `compositeEmitters`: within 4.4e-7.
- With its own first hits, the device's accumulation stays within 5.1e-5 of the CPU's history length and 2.6e-6 of its light.
- The accumulation binds five storage buffers, inside the eight a default WebGPU device allows. The gate holds the kernel's
  tolerances to round 4's, exactly. Sabotaged X1-X7: X5 is an equivalent mutant, named in the header, and X7 went 0 red until
  the constants row.
- `denoise.html`'s "Time the half-size chain" also times the history's four passes, and `timeHalfChain` returns their sum
  with the chain as `temporal`. On a GPU the gate's section 4 prints them in a `section 97:` line.

**The arms, at 1920 x 1080 output, on scene R 990000 as in section 93.**
- **Today's page, `full`:** the network at 1920 x 1080 and its mask at 1920 x 1080, as in section 93.
- **The chain with its history, `temporal`:** section 93's `half`, plus one frame of the history's four passes at 1920 x 1080.
  A frame of the temporal upscale costs exactly that, once its history is warm.

**The clocks:** as section 93's. The history's four passes are one pass each, so each is on the device's clock wherever the
adapter offers timestamps.

**The test.** On each GPU, two runs of `realGpuRun --only denoise`, at a commit carrying this section:
- **H (per GPU):** `full / temporal` is above 1.0 in both runs.
- **C1:** every denoise gate is green in both runs. That includes section 6's device rows, which hold the history to the CPU on
  that GPU's own Chrome adapter.
- **C2:** the fill reaches every pixel in its 96 rings.
- **C3:** both networks and the history's four passes are on the device's clock.
- **C4, reported:** the two runs' ratios and how far apart they are.

**Predicted, before any of it ran on a GPU** (from section 94's ledger):
- **The GTX 1080:** H holds, `full / temporal` between 1.3 and 1.5. The history's four passes are 1-4 ms together: one ray a
  pixel where the coverage is 64, and three passes over 2 million pixels.
- **The Intel gen-9:** H holds, between 1.25 and 1.55. Its four passes are 15-60 ms together.
- **C1 and C2 hold** on both.

**What each outcome does.**
- **H holds on both GPUs:** a frame of the temporal upscale is cheaper than today's page at 1080p on both rigs. It was also
  better at equal samples a frame at 256 x 256 (section 96). `denoise-halfres-page` then carries the history with the chain.
  It still waits on `denoise-halfres-fixed-costs`, or on Keith's call.
- **H fails on a GPU:** the history's passes are named from the run, and the backlog records what to make cheaper.
- **Nothing changes in either case:** the page's own denoise, the network, the filter, every kernel table, and `fx/fsr`.

**Seen first, here, on SwiftShader -- a CPU's times, deciding nothing:**
- at the pilot size (128 x 72), the history's passes were 1.4 ms (first hits), 0.6 ms (shift), 2.8 ms (accumulation) and
  0.6 ms (composite);
- section 4's rows hold their sum to the chain's.

## 98. ROUND 33 -- THE VERDICT: THE HISTORY KEEPS THE CHAIN CHEAPER ON THE INTEL; THE 1080 IS OWED ITS RUN b, WHOSE TIMING GATE DIED

**What arrived.** Two `realGpuRun --only denoise` runs on each GPU, `SWEK_WEBGPU` cleared, all four at e5908338 (the commit
that carried section 97). They were committed as received at 89fe435d, before this section was written:
`render/denoise-rig-r33-{a,b}-{intel-gen9,gtx1080}.json`.

**Section 97's rule, read off the reports.** `render/denoiseUpscaleGPU-selfcheck.mjs`'s section 7 re-derives every figure here
from those four files: their commit, every gate's verdict, and the chain gate's `section 93:` and `section 97:` lines.

| | Run a | Run b | H |
|---|---|---|---|
| Intel gen-9 (r18u): today's page against the chain with its history, at 1920 x 1080 | 1,369.1 / 1,029.2 ms = **1.330 x** | 1,410.7 / 1,071.7 ms = **1.316 x** | **holds** |
| GTX 1080 (r18t) | 92.3 / 65.7 ms = **1.405 x** | 92.7 / 62.6 ms = 1.482 x, **does not count** | **no verdict** |

- **C1:** every denoise gate was green in both Intel runs and in the 1080's run a. In the 1080's run b,
  `render/denoiseTiming-selfcheck.mjs` went red after 17.7 s with no FAIL line. Its output stops after its first three lines,
  which name the adapter, DXC and the sets to be timed, and before the first set's adapter line. In run a, on the same box, the
  same gate ran 124 s and printed 166 lines. The report holds no exit code, so the cause is not known here. The gate's process
  ended inside the native ladder, before any row. The chain's own gate was green in that run, so its ratio is printed above.
  By the rule it does not count.
- **C2:** the fill reached every pixel in 87 of its 96 rings in all four runs.
- **C3:** both networks and all four history passes were on the device's clock in all four runs.
- **C4, reported:** the Intel's two ratios were 1.1 % apart. The 1080's were 5.5 % apart, but run b does not count.

**So, by section 97's rule: H holds on the Intel, and the 1080 has no verdict.** The verdict waits on the 1080. Nothing
changes: the page, the network, the filter, every kernel table, and `fx/fsr`. `denoise-temporalup-device` stays open.

**What the 1080 is owed, fixed now, before it runs.** Section 97 asks for two runs at a commit carrying it, and the 1080's run a
is one. It is owed one run in place of run b. That run is at any later commit of this branch: each carries section 97
unchanged, and the chain's code is the same as at e5908338. The red run b stays committed as received.
- **If the new run counts** (every gate green, C2 and C3), H on the 1080 is read off run a and the new run. Section 97's
  outcomes then apply as written.
- **If its timing gate dies again,** the 1080 stays without a verdict, and the next round is that crash, as in sections 76-77.
- **Before it, once, reported and deciding nothing:** `node render/denoiseTiming-selfcheck.mjs` run alone, with its console
  output sent back. It shows whether the gate dies outside `realGpuRun`, and where.
- **Predicted:** no crash. The new run's ratio is between 1.3 and 1.5, as section 97 predicted. The one native crash like this
  on record, in section 76, did not repeat in section 78's four runs.

**The predictions.** They decided nothing. Section 7's last row reads each one off the reports, the 1080's run b as a report.
- **Held:** both GPUs' ratios (1.405 and 1.482 on the 1080, 1.3-1.5 predicted; 1.330 and 1.316 on the Intel, 1.25-1.55
  predicted). The 1080's history passes (1.92 and 1.88 ms, 1-4 predicted). C2, with 87 rings in all four runs.
- **Missed:** the Intel's history passes, 86.1 and 83.1 ms against 15-60 predicted. Also C1 on the 1080, by run b.
- **Why the Intel's cost missed:** the accumulation alone was 44.8 and 43.6 ms. For each of 2 million pixels it reads four
  bilinear taps of the previous history with their geometry, and the current frame's 3 x 3 neighbourhood. The 15-60 ms
  prediction was the 1080's 1-4 ms scaled by about 15 x, near the two networks' ratio (15-16 x in these runs). The history's
  passes cost 44 x the 1080's instead. The likely reason is that they move memory with little arithmetic, where the network is
  mostly arithmetic. This round does not measure that.

**What it says, and where it stops.**
- **On the Intel, the history costs 8 % of the chain's frame and a fifth of its lead.** The chain alone was 1.452 and 1.427 x
  in these runs, and 1.330 and 1.316 x with its history. Today's page minus the chain was 426 and 422 ms; the history was 86 and
  83 ms. On the 1080 the history was under 2 ms, 3 % of the chain's frame.
- **The ratios are one scene's: R 990000, as in section 94.** The history's four passes run over every pixel whatever the scene,
  so their cost does not change with the scene. The coverage's cost does, with the number of spheres.
- **One frame of history at steady state is what was timed.** A frame of the temporal upscale costs that once its history is
  full. The first frames after a cut cost the same and are noisier (section 96).

**On the rig.** On the GTX 1080, from a fresh clone of this branch, `SWEK_WEBGPU` cleared:
```
cd WebGLEngine
set SWEK_WEBGPU=
node render/denoiseTiming-selfcheck.mjs
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r33-b2.json
```
Send back the console output of the first line and the JSON file.

**Added before the 1080 ran, at Keith's call: the run is pinned to 468766f9.** Round 34 (section 99) changes
`render/denoiseUpscaleGPU.mjs`, so "any later commit" no longer has the chain's code unchanged. The owed run is made from a
checkout of 468766f9, this section's commit. The rule above is unchanged.
```
git checkout 468766f9
```

## 99. ROUND 34 -- THE FILL OVER THE LIGHTS' PIXELS ONLY, TIMED ON THE RIG AT 1920 x 1080: FIXED BEFORE THE RIG RUNS IT

**Why this round.** Section 94 found that the half-size chain's own steps cost more than its network. The fill was the largest
of them: 20-23 ms on the GTX 1080 and 300-323 ms on the Intel gen-9 in round 33's runs, for 96 ring passes over every one of
960 x 540 pixels. On R 990000, 25,765 of those pixels are the light's, 5.0 % of the frame (measured here on the CPU, 64 rays a
pixel), and they fill in 87 rings. The other 95 % are known, and every ring pass reads and copies them anyway.
`denoise-halfres-fixed-costs` names two levers. This round takes the exact one; the coverage lever is a quality question and
waits.

> **At 1920 x 1080 output, on each GPU, is the fill over the lights' pixels only faster than round 31's fill over the whole
> frame -- and by how much does it move the half-size chain against today's page?**

**What exists for it (committed before this section).** `render/denoiseUpscaleGPU.mjs` gains four kernels and
`fill(..., { list: true })`, also accepted by `chain`:
- `FILL_LIST_WGSL`, once over the frame: each pixel's ring is 0 if known, else UNKNOWN and its index goes on a list;
- `FILL_ARGS_WGSL`, one thread: the list's length as an indirect dispatch's workgroups, so nothing is read back to size the rings;
- `FILL_LISTRING_WGSL`, one ring over the list, in place: a pixel still UNKNOWN takes the mean of its 8-neighbours whose ring
  is below this one's. A neighbour filled in this ring reads as this ring or UNKNOWN, never below it, so the rule is round 31's
  with no copy of the known pixels and no ping-pong;
- `FILL_LISTLEFT_WGSL`: a pixel no ring reached is 0.

`render/denoiseUpscaleGPU-selfcheck.mjs`'s section 3 holds it, on SwiftShader here and on each GPU's own adapter in the rig's run:
- against `fillEmittersBounded`, at round 31's tolerance (1e-5): the same rings and pixels left, on a 24 x 20 frame and a 96 x 64
  one whose fill takes 16 rings, with rings to spare and short of them;
- against round 31's device fill: the same count in every ring, the same pixels left, values within 1e-6. On SwiftShader not
  one float differs, on any frame, nor in the four chains built on it. The two kernels add the same neighbours in the same order;
- on a frame of all emitter and one of none, and with the list's length read back, so a run of the rings in its place shows.
Sabotaged Y1-Y7. Y7 (the rings run whatever is asked) went 0 red until the list's length was read back.
`tools/ship/wgslCorpus.mjs` now accounts for the chain's thirteen kernels from rounds 31, 33 and 34. Those rounds had left them
out, and `crossBackend` and `harnessLiveness` were red on it; each kernel is now listed with the reason it is graded by its own
gate.

`time()` adds `fillList` and `wholeList`, and `timeHalfChain` adds `halfList` and `temporalList`: `half` and `temporal` with
`fillList` in the fill's place. The page's table has three more rows. On a GPU, the gate's section 4 prints a `section 99:`
line, and a checked list fill at 960 x 540 must reach every listed pixel in the ring fill's count of rings.

**The arms, at 1920 x 1080 output, on R 990000, as in sections 93 and 97.**
- **The ring fill, `fill`:** round 31's, 96 ring passes over 960 x 540 and its left pass.
- **The list fill, `fillList`:** the list pass, the args pass, 96 ring passes over the list and its left pass.
- Both by the wall clock (more than 30 passes), in the same run, on the same buffers, from the same frame.

**The test.** On each GPU, two runs of `realGpuRun --only denoise`, at a commit carrying this section:
- **H (per GPU):** `fillList` is below `fill` in both runs.
- **C1:** every denoise gate is green in both runs, the list fill's device rows among them.
- **C2:** the ring fill filled on fewer than 96 rings, and the checked list fill reached every listed pixel in the same count.
- **C3:** both networks on the device's clock, as in section 93.
- **Reported, deciding nothing:** `full / halfList` and `full / temporalList` beside section 97's two ratios, and the two
  runs' spread.

**Predicted, before any of it ran on a GPU:**
- **The GTX 1080:** H holds. `fillList` is 1-6 ms against `fill`'s 20-23. The list is 5 % of the frame, so its ring passes do
  about a twentieth of the work. What is left is the cost of 99 small passes. `full / halfList` is 1.9-2.3, against 1.45-1.53
  for `full / half`.
- **The Intel gen-9:** H holds. `fillList` is 15-80 ms against 300-323. `full / halfList` is 1.8-2.2 (round 33's `half` with the fill swapped, at both ends of these ranges).
- **C1 and C2 hold on both GPUs.** C1 on the 1080 is the least sure: its timing gate died in round 33's run b, and that is not
  understood yet.

**What each outcome does.**
- **H holds on both GPUs:** the list fill becomes the chain's fill, in a round of its own that changes the runner's default.
  The fill lever of `denoise-halfres-fixed-costs` is closed, and its coverage lever stays open.
- **H fails on a GPU:** that GPU's passes are named from the run, and the ring fill stays.
- **No verdict on a GPU** (a red gate, a short fill, a wall-clock network): its two runs are owed again.
- **Nothing changes in this round:** the chain's default fill, the page's own denoise, the network, every kernel table, and
  `fx/fsr`.

**Seen first, here, on SwiftShader -- a CPU's times, deciding nothing:** at the pilot size (64 x 36 half), the ring fill was
21.2-22.5 ms and the list fill 15.5-16.6 ms. Both are mostly the cost of the passes at that size. At the rig's size, run once
here with `SWEK_HALFCHAIN_RIGSIZE=1`: the ring fill 3,237 ms, the list fill 305 ms. The checked list fill listed 25,765 pixels,
the CPU's count, and reached all of them in 87 rings. That run's section 93 row was red only because SwiftShader's network at
1920 x 1080 is over the ladder's 5,000 ms cap, as it would be in any such run.

**On the rig.** The 1080's owed round-33 run first, from 468766f9 (section 98). Then, on each GPU, from a fresh clone of a
commit carrying this section:
```
cd WebGLEngine
set SWEK_WEBGPU=
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r34-a.json
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r34-b.json
```
Don't commit or pull between runs. Send back all four JSON files.

## 100. ROUND 34 -- THE VERDICT: THE LIST FILL HOLDS ON THE INTEL; THE 1080 HAS NO RUN, AND ITS ROUND-33 RUN DIED AGAIN

**What arrived.** Six files, committed as received at f04471ed before this section was written:
- the Intel gen-9's two round-34 runs at 3abe4471, the commit carrying section 99:
  `render/denoise-rig-r34-{a,b}-intel-gen9.json`;
- the GTX 1080's three `realGpuRun` runs, all at 468766f9:
  - b2, section 98's owed run: `render/denoise-rig-r33-b2-gtx1080.json`;
  - two more that arrived named r34 but were made from the same checkout: `render/denoise-rig-r33-extra-{a,b}-gtx1080.json`;
- the 1080's console from `render/denoiseTiming-selfcheck.mjs` run alone: `render/denoise-rig-r33-b2-gtx1080-timing-alone.txt`.

The 1080's clone was still on the detached checkout section 98 asked for. A `git pull` there does not move it, so every 1080 run
since then is at 468766f9 and carries no section 99 line. `render/denoiseUpscaleGPU-selfcheck.mjs`'s section 8 re-derives every
figure below from these files.

**Section 99's rule, read off the reports.**

| | Run a | Run b | H |
|---|---|---|---|
| Intel gen-9: the ring fill against the list fill, 960 x 540, R 990000 | 301.6 / **23.9 ms** | 302.8 / **23.0 ms** | **holds** |
| GTX 1080 | no run at a commit carrying section 99 | | **no verdict** |

- **C1:** every denoise gate was green in both Intel runs.
- **C2:** the ring fill filled on 87 rings in both. The checked list fill listed 25,765 pixels, the CPU's count, and reached
  all of them in the same 87 rings.
- **C3:** both networks were on the device's clock.
- **Reported:** with the list fill, the chain against today's page was 2.042 and 2.179 x on the Intel, against 1.472 and
  1.524 x with the ring fill in the same runs. With its history it was 1.829 and 1.928 x, against 1.358 and 1.397 x. A whole
  frame of the chain's steps fell from 649.7 and 646.8 ms to 389.9 and 382.3 ms.

**So, by section 99's rule: H holds on the Intel, and round 34 is owed on the 1080.** Nothing changes: the chain's default
fill, the page's denoise, the network, every kernel table, and `fx/fsr`.

**Section 98's owed run: b2, and its timing gate died again.** b2 is the 1080's first report at 468766f9 after section 98, by
its start time. Three of its four gates were red, none with a FAIL line:
- `render/denoiseDevice-selfcheck.mjs` after 20.2 s, its output stopping at the native adapter's line;
- `render/denoiseTiming-selfcheck.mjs` after 6.5 s, stopping after "sets timed", as in round 33's run b;
- `render/denoiseUpscaleGPU-selfcheck.mjs` after 2.1 s, with no line at all.

**So, by section 98's rule: the 1080 keeps no verdict for round 33, and the next round is the crash.** extra-a, run next at
the same commit, was green in every gate (1.308 x with the history). It is not the owed run. Reading it in would be choosing
the run after seeing the data, as section 76 declined to.

**The crash, as far as these files go.** On the 1080 the timing gate has died in 3 of 5 `realGpuRun` runs since round 33, at
17.7, 6.5 and 40.4 s, and once more run alone. Each time it stopped after its third line, with no FAIL line, and no exit
code was kept. The ladder prints its rows only once it returns, so the files say only that the process died somewhere inside
the native ladder. That ladder takes about two minutes on the 1080 in a green run. The other two gates in b2 dying too, the
browser's among them, may mean the device was not yet back from the crash before it, but nothing here shows that.

**The predictions.** On the Intel: the list fill was 23.0-23.9 ms (15-80 predicted) and `full / halfList` was 2.042-2.179
(1.8-2.2 predicted), so both held. On the 1080 none was reached. The 1080's ring fill was slower in its three runs (26.9-27.9
ms, against 19.9-23.4 in rounds 31 and 33), so its ratios fell to 1.339-1.345 x for the chain and 1.302-1.308 x with its
history. This is reported, deciding nothing.

## 101. ROUND 35 -- THE GTX 1080's NATIVE CRASH: WHERE AND HOW THE TIMING GATE DIES, FIXED BEFORE THE RIG RUNS IT

**Why this round.** Sections 98 and 100 leave the 1080 without a verdict for rounds 33 and 34. The reason is the same in both:
`render/denoiseTiming-selfcheck.mjs` dies inside its native ladder in most runs on that box. Until that is understood, every
round that asks the 1080 for a green denoise group can fail its C1 for a reason that is not the round's.

> **On the GTX 1080, where in the native ladder does the timing gate die, and with what exit code?**

**What exists for it (committed before this section).**
- `render/denoiseDevice.mjs`'s `timingLadder` takes a `trace` callback. It is called before each step: a size's adapter, its
  device, each set's build, each round's timing, the output check, and the release of the denoisers and of the device. It
  changes nothing the ladder does.
- `render/denoiseTiming-selfcheck.mjs` appends each trace line to a file, synchronously, before the step runs. The file is the
  one `SWEK_TIMING_TRACE` names, else one in the temp directory. Each line carries the time since the gate began and the
  process id. The gate prints the file's path before the ladder starts. A new row holds the trace to the ladder it ran: its
  start, a device asked for at every size measured, every set built there, and its return. On SwiftShader here: 48 lines, green.
- `tools/ship/realGpuRun.mjs` keeps each gate's exit status and signal and the last five lines of its stderr in the report.
  Until now the status was read for `ok` and dropped, and stderr was not kept at all.
- Sabotaged K1-K4, each 1 red.

**The test, on the GTX 1080.** From a clone on this branch's head, as below:
- **Step 1:** the timing gate alone, three times one after another, each with its own trace file and its exit code printed.
- **Step 2:** round 34's two runs (section 99), each with its own trace file. These are also the 1080's round-34 runs, read by
  section 99's rule as written. A red timing gate leaves them owed.

**What each outcome does.**
- **No crash in five runs:** the crash is not reproduced. Round 34 on the 1080 is read off step 2. The crash stays open in the
  backlog, named, with these traces as its record.
- **A crash whose trace ends on the same step every time:** that step is round 36's subject. For example, a requestDevice or a
  destroy would make round 36 change how the ladder makes or releases devices. That change is held to the same rows as today's
  ladder before the rig runs it.
- **Crashes ending on different steps:** named as such. Round 36 is a smaller probe that repeats one step, to find which one
  the process cannot survive.
- **The exit code** is reported either way. 3221225477 (0xC0000005) is an access violation inside native code, as in section 76.

**Predicted, before it runs:**
- At least one of the three alone runs dies. The gate died in 4 of the last 6 runs on that box.
- Each death exits 3221225477.
- Each trace's last line is a device step: a requestAdapter, a requestDevice or a destroy, not a timing round or a build. The
  ladder makes and releases a fresh device at every size (section 35). The nearest precedent, v4855's Dawn crash, came from a
  second Dawn instance made late inside one gate.

**Nothing else changes in this round:** every kernel, the page, the network, and every table.

**On the rig: the GTX 1080 only.** The Intel has nothing owed.
```
cd C:\SweK_r33
git fetch origin ccr-6c3eeb7c-pxz6kx
git checkout ccr-6c3eeb7c-pxz6kx
git pull origin ccr-6c3eeb7c-pxz6kx
git log -1 --oneline
cd WebGLEngine
set SWEK_WEBGPU=
set SWEK_TIMING_TRACE=%CD%\trace35-alone-1.txt
node render/denoiseTiming-selfcheck.mjs
echo %ERRORLEVEL%
set SWEK_TIMING_TRACE=%CD%\trace35-alone-2.txt
node render/denoiseTiming-selfcheck.mjs
echo %ERRORLEVEL%
set SWEK_TIMING_TRACE=%CD%\trace35-alone-3.txt
node render/denoiseTiming-selfcheck.mjs
echo %ERRORLEVEL%
set SWEK_TIMING_TRACE=%CD%\trace35-r34-a.txt
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r34-a-1080.json
set SWEK_TIMING_TRACE=%CD%\trace35-r34-b.txt
node tools/ship/realGpuRun.mjs --only denoise --out denoise-rig-r34-b-1080.json
set SWEK_TIMING_TRACE=
```
`git log -1 --oneline` must show this branch's latest commit, not 468766f9. Send back the console output with its three
`echo` lines, the five trace files and the two JSON files.

## 102. ROUNDS 34 AND 35 -- THE VERDICT: THE 1080 DID NOT CRASH IN FIVE RUNS, AND THE LIST FILL HOLDS ON BOTH GPUS

**What arrived.** Eight files from the GTX 1080, all at bc6fbed2, the branch head carrying sections 99-101. They were committed
as received at cbdb2c13, before this section was written:
- section 101's step 1: the timing gate run alone three times, with its console (`render/denoise-rig-r35-console-gtx1080.txt`)
  and three traces (`render/denoise-rig-r35-trace-alone-{1,2,3}-gtx1080.txt`);
- section 101's step 2, which is also round 34 on the 1080: two `realGpuRun --only denoise` runs
  (`render/denoise-rig-r34-{a,b}-gtx1080.json`) and their traces (`render/denoise-rig-r35-trace-r34-{a,b}-gtx1080.txt`).

`render/denoiseUpscaleGPU-selfcheck.mjs`'s section 9 re-derives every figure here from those files. Sabotaged A1-A5.

**Round 35, by section 101's rule: the crash is NOT REPRODUCED.**
- All three solo runs ended ALL GREEN with exit code 0. Each trace runs to "the ladder returned" and "the gate ends, 0 fail(s)",
  through all six sizes.
- In both `realGpuRun` runs every gate was green, and every gate's exit is now recorded: 0, with nothing on stderr.
- **The predictions all missed.** None of the five died, so there was no 0xC0000005 and no last device step.
- The crash stays open in the backlog (`denoise-1080-native-crash`), named, with these five traces as its record. The only
  abnormal behaviour in the five runs is below. It is reported, not proposed as the cause.

**Reported, deciding nothing.**
- **r27w at 1920 x 1080 stalled twice.** In run a's native ladder it took 15,100.6 ms a pass, against about 249 ms in the
  other four, nearly all of it in one layer (13,921.5 ms). That run's trace shows two of its timing rounds there taking about
  30 s each (75.3 -> 106.4 -> 136.7 s). In run b the page's r27w at the same size took 10,247.4 ms a pass. A GPU stall that long
  is the kind of event that could end a process, but nothing here shows the earlier deaths were one.
- **Run a's trace, as received, is not whole.** It stops at 149.4 s on "round 2 time r27w" at 1920 x 1080, yet that run's
  timing gate passed, including the row that reads the trace to its return. So the file read inside the run was whole and the
  one sent was not. That is unexplained here.

**Round 34 on the 1080, by section 99's rule, with section 101 naming these runs: H holds.**

| GPU | Ring fill (a / b) | List fill (a / b) | Chain against today's page with the list fill | H |
|---|---|---|---|---|
| Intel gen-9 (section 100) | 301.6 / 302.8 ms | 23.9 / 23.0 ms | 2.042 / 2.179 x | holds |
| GTX 1080 | 26.9 / 26.2 ms | **24.0 / 25.4 ms** | 1.424 / 1.395 x | **holds** |

C1 (every gate green), C2 (87 rings, 25,765 listed, 0 left) and C3 (both networks on the device's clock) held in both runs.

**So, by section 99's rule: the list fill becomes the chain's fill, in a round of its own** that changes the runner's
default and holds the change to today's rows. The fill lever of `denoise-halfres-fixed-costs` is closed; the coverage lever
stays open.

**The predictions for the 1080 missed, and by a lot.**
- **The list fill:** predicted 1-6 ms, measured 24.0 and 25.4 ms.
- **The ratio:** predicted 1.9-2.3 x, measured 1.424 and 1.395 x.
- **Why:** on the 1080 the fill was never the pixels. Cutting them to 5 % of the frame took 3-11 % off. What remains is about
  99 small passes, each a compute pass on its own, timed by the wall clock. On the Intel, where each ring pass over the frame
  cost about 3 ms, the same change was 13 x. A fill that runs its rings inside fewer passes is the lever this points to on the
  1080; the list fill does not reach it.

**Round 33 on the 1080, stated so it is not decided by default.** These two runs also carry section 97's line: the chain with
its history at 1.325 and 1.341 x, every gate green. Section 98 closed round 33 for the 1080 ("no verdict; the next round is
the crash"), and nothing in section 101 re-opened it. As in sections 76 and 100, it stays closed: the numbers are reported and
do not count.

**Nothing changes in this section:** the chain's default fill, the page, the network, every kernel table, and `fx/fsr`.

## 103. ROUND 36 -- THE LIST FILL BECOMES THE CHAIN'S DEFAULT, WITH ROUND 31'S RING FILL KEPT AS ITS REFERENCE

**Why now.** Section 102's rule: the list fill held on both GPUs, so it becomes the chain's fill, in a round of its own that
changes the runner's default and holds the change to today's rows. This is that round (`denoise-listfill-default`). It
measures nothing new, so it has no prediction to miss and no rig run to wait for. It is fixed here before its code.

**What changes, in `render/denoiseUpscaleGPU.mjs`:**
- `fill(...)` and `chain(...)` run the list fill unless asked `{ list: false }`, which runs round 31's ring fill. The ring fill
  stays, unchanged, as the reference the default is held to.
- `timeHalfChain`'s `half` and `temporal` sum the list fill (`fillList`), and the result says so: `fill: "list"`.
  `halfRing` and `temporalRing` are round 31's and round 33's sums with the ring fill (`fill`). `halfList` and `temporalList`
  go, as they would be `half` and `temporal` under a second name. A report with no `fill` key is from before this round, and its
  `half` and `temporal` are the ring fill's.
- The step keys do not change. `fill` and `whole` are still the ring fill's steps; `fillList` and `wholeList` the list fill's.

**What changes on the page (`denoise.html`'s "Time the half-size chain"):** the fill row, "the half-size chain in all", the
one-frame row and "the half-size chain with its history, in all" report the list fill. Round 31's ring fill keeps four rows
of its own, as the reference: its fill, its steps in one frame, its chain in all, and that with the history. 15 rows, not 14.
The status line's ratio is the default chain's, with the ring fill's beside it.

**What does NOT change: the lines the rig's reports carry.** Sections 94, 98, 100 and 102 read `section 93:`, `section 97:`
and `section 99:` lines out of committed reports. Each keeps its meaning from this round on: section 93's and 97's chain is
the ring fill's (`halfRing`, `temporalRing`), section 99's "with the list fill" is the list fill's (now `half`, `temporal`).
A new `section 103:` line names the default fill and gives its chain and ratio. The four lines are made by one function, and
the pilot-size row checks each line's figure against the sum it names, so a line cannot change meaning with no row red.

**The rows that hold the change (the gate's sections 3 and 4):**
1. `fill()` with nothing asked is the list fill: the same `listed` count, and the same floats, bit for bit, as
   `{ list: true }`, on all six of round 34's frames. `{ list: false }` lists nothing and stays fillEmittersBounded's.
2. `chain()` with nothing asked is the list fill's chain, bit for bit, on all four scenes. `{ list: false }` stays round 31's
   chain within 1e-3 of emitterAwareUpscale, and the default stays within 1e-6 of it.
3. At the pilot size the page's `half` is the half-size network plus coverage at both sizes, `fillList` and the rest;
   `temporal` that plus the history's four passes; `halfRing` and `temporalRing` the same with `fill`; `fill` is `"list"`;
   the table has 15 rows.
4. The four rig lines, made from the pilot's report, each carry the figure of the sum named above.

**Sabotages, by the byte-safe runner (B1-B6):** `fill()`'s default back to the ring fill; `chain()`'s the same; `half`
summing `fill`; `halfRing` summing `fillList`; the page without the ring fill's chain row; and section 93's line made from
`half`. Each must turn at least one row red. A sabotage that goes 0 red is a finding to fix before the round is committed.

**The rule.** The round holds when rows 1-4 pass on SwiftShader and every gate the branch runs stays as green as it was.
No rig run is owed: the kernels, their order and every timed step are round 34's, measured on both GPUs in sections 100 and
102. The next rig run of this gate checks rows 1-4 on that GPU as it goes.

**Nothing else changes:** the network, every kernel table, the kernels themselves, and `fx/fsr`.

## 104. ROUND 37 -- A FILL THAT RUNS EIGHT RINGS A PASS, IN TILES: FIXED BEFORE THE RIG RUNS IT

**The question.** Section 102 found the 1080's fill cost is passes, not pixels: the list fill cut the pixels it touches to
about 5 % of the frame and took 3-11 % off, leaving about 99 compute passes of roughly 0.25 ms each on the wall clock. Does a
fill that runs several rings in one pass, in workgroup memory, take the 1080's fill well below the list fill's, without
losing on the Intel? (`denoise-fill-fewer-passes`.)

**The fill, `fill(..., { tile: true })` and `chain(..., { tile: true })`.**
- One init pass turns the known flags into each pixel's ring: 0 if known, UNKNOWN (0xffffffff) if not.
- Then one pass per FILL_TILE_RINGS = 8 rings. Each workgroup of 16 x 16 threads loads a 32 x 32 tile into workgroup
  memory: its 16 x 16 interior and a halo of 8 on every side. It runs up to 8 rings there. Each ring is two phases split by
  barriers: every cell still UNKNOWN works out the mean of its 8-neighbours whose ring is below this one, and only then do
  the cells that found one take that value and this ring's number. It writes back the interior alone, ping-ponging the
  image and the rings between two buffers.
- A ring at a pixel reads only pixels one step away, so after k rings a value is exact wherever the tile holds every pixel
  within k of it. With a halo of 8 and at most 8 rings a pass, every interior pixel is exact. Cells outside the frame are
  a third mark that is never below any ring and is never filled, which is the CPU's bounds check.
- A left pass then zeroes each pixel still UNKNOWN and counts it.
- The sums run in the CPU's order, dy then dx, in f32, as the list fill's do, so the floats should be the list fill's bit
  for bit. Each interior fill counts in its ring's `filled`, once.
- The tile kernel counts its passes into a buffer that is read back (`tilePasses`). As round 34's Y7 showed, two fills that
  agree float for float cannot otherwise tell which one ran.
- At the chain's 96 rings: 14 passes (init, 12 tile passes, left), against the list fill's 99 and the ring fill's 97.

**Timed.** `time()` adds `fillTile` and `wholeTile` by the wall clock, as the list fill is timed (one clock across the
fills, though 14 passes would fit the device's 30). `timeHalfChain` adds `halfTile` and `temporalTile`. The page adds three
rows (18): the tile fill, the half-size chain with it, and that with the history. A `section 104:` line carries them for the
rig. The default stays the list fill (section 103) until this round's verdict says otherwise.

**The rows (the gate's sections 2-4).**
1. The tile kernel validates and holds its constants: 32 = 16 + 2 x 8, and 16 KB of workgroup memory, within WebGPU's
   default limit.
2. The tile fill is fillEmittersBounded's within 1e-5, with the same rings ring by ring and the same pixels left, on round
   34's six frames. It is also the list fill's bit for bit, on those six frames and on the 96 x 64 frame at 13 rings, where
   the last pass runs 5. `tilePasses` is ceil(maxRings / 8).
3. The chain with the tile fill is the list fill's chain, bit for bit, on all four scenes.
4. At the pilot size, `halfTile` is the half-size chain with `fillTile` in the fill's place and `temporalTile` that with the
   history. The page has 18 rows. The `section 104:` line carries both figures.

**The rig run.** On each GPU, in a fresh clone of a commit carrying this section, two
`realGpuRun --only denoise` runs, as in round 34.

**The rule (H37), per GPU, on the two runs' `section 104:` and `section 99:` lines.**
- **C1:** every gate is green.
- **C2:** the tile fill reaches every pixel: its rings equal the list fill's, and 0 are left.
- **H37 holds on a GPU** when, in both runs, the tile fill is at least 10 % faster than the list fill (fillTile <=
  0.9 x fillList).
- **What it buys:**
  - If it holds on the 1080 and the Intel's tile fill is no slower than its list fill in both runs, the tile fill
    becomes the default, in a round of its own, as round 36 was.
  - If it holds on one GPU only, it is reported and choosing the fill per adapter goes to the backlog.
  - If it holds on neither, the tile fill is kept as a measured negative, and the 1080's fill lever is closed.

**Predictions (stated so they can miss).**
- **GTX 1080:** the tile fill 2-10 ms against the list fill's 24-25. That is 14 passes at the ~0.25 ms each section 102
  implies, plus the tiles' work. H37 holds.
- **Intel gen-9:** a ring pass over the whole frame there cost about 3 ms. A tile pass reads the frame four times over
  (32^2 for 16^2) and does 8 rings of work in workgroup memory, so 12 of them could cost 10-60 ms against the list fill's
  23-24. H37 is not predicted either way on the Intel.
- Every gate is green on both.

**Sabotages, by the byte-safe runner (C1-C7):**
- a ring reading neighbours filled in the same ring (one barrier instead of two phases);
- a halo of 7 with 8 rings a pass;
- the cells outside the frame marked UNKNOWN;
- the interior fills not counted;
- the tile option running the list fill;
- `halfTile` summing `fillList`;
- the page without the tile fill's chain row.

Each must turn at least one row red.

**Nothing else changes:** the default fill (still the list fill), the network, every kernel table, and `fx/fsr`.

**Two corrections and one report, made before the round was committed and before anything was measured on a GPU.**
- The page has 18 rows, not 17: section 103's 15, and three more.
- Sabotage C1 as first written (`<=` for `<`) went 0 RED. Under two phases, no cell carries this ring's number while the
  means are taken, so `<=` changes nothing. The sabotage now does what its name says: one phase that writes as it goes and
  reads this ring's fills. That turns four rows red. Its control, one phase with `<`, is green, as it should be: that is the
  list fill's in-place rule. The two phases are kept so that no read of workgroup memory races a write; the answer does not
  need them.
- Reported, deciding nothing: on SwiftShader, a CPU emulating workgroup memory, the tile fill took 193.9 ms against the
  list fill's 11.4 ms at the pilot size.

## 105. ROUND 37 -- THE VERDICT: THE TILE FILL HOLDS ON THE GTX 1080 AND LOSES ON THE INTEL, SO THE DEFAULT STAYS THE LIST FILL

**What arrived.** Four reports: two `realGpuRun --only denoise` runs on each GPU, all at 3d2ae54c, the commit carrying
section 104 with its kernel fixed. They were committed as received at f8686aaf, before this section was written:
`render/denoise-rig-r37-{a,b}-{intel-gen9,gtx1080}.json`. 49e124cb also carried section 104, but its module did not load,
so no run at it could count; the rule counts 3d2ae54c alone. `render/denoiseUpscaleGPU-selfcheck.mjs`'s section 10
re-derives every figure here from the four files. Sabotaged D1-D5.

**C1 and C2 held in all four runs.**
- **C1:** every gate was green with exit 0.
- **C2:** the tile fill reached 87 rings, the list fill's count, in 12 passes, with 0 left.

**H37, by section 104's rule:**

| GPU | List fill (a / b) | Tile fill (a / b) | Tile / list | H37 | Chain against today's page, tile / list |
|---|---|---|---|---|---|
| GTX 1080 | 22.6 / 23.1 ms | **16.8 / 16.7 ms** | 0.743 / 0.723 | **holds** | 1.601 / 1.571 x against 1.454 / 1.417 x |
| Intel gen-9 | 22.3 / 24.6 ms | **67.3 / 68.9 ms** | 3.018 / 2.801 | **fails** | 1.935 / 1.978 x against 2.066 / 2.113 x |

**So, by the rule: it holds on one GPU only.** The default stays the list fill (section 103), and choosing the fill per
adapter goes to the backlog (`denoise-fill-per-adapter`). On the 1080 the tile fill takes about a quarter off the fill and
lifts the chain from about 1.44 x to 1.59 x against today's page. On the Intel it costs about three times the list fill.

**The predictions missed, both of them.**
- **GTX 1080:** predicted 2-10 ms, measured 16.8 and 16.7. The prediction priced a pass at the ~0.25 ms that the list fill's 99
  passes imply (22.6 ms). The tile fill's 14 passes cost about 1.2 ms each. So the tile passes' own work dominates, not their
  number: every pass loads every tile of the frame four times over (32^2 for 16^2) and runs 8 rings over all 1,024 cells,
  while the lights' pixels are about 5 % of the frame (25,765 of 518,400). The list fill touches that 5 % alone.
- **Intel gen-9:** "could cost 10-60 ms", measured 67.3 and 68.9. On the Intel, where the ring fill over the whole frame
  cost ~300 ms and the list fill 23, the pixels are the cost. A fill that works over the whole frame again, even in 12
  passes, loses to one that works over 5 % of it in 99.
- Every gate was green on both GPUs, as predicted.

**What this points to, reported and not decided here.** The two fills each cut one cost: the list fill the pixels, the tile
fill the passes. A tile fill dispatched only over the tiles that hold an unknown pixel would cut both. With a list of those
tiles, its length as an indirect dispatch as round 34 did, the work would scale with the lights and the passes would stay
at 12. That is `denoise-fill-listed-tiles`. It would be pre-registered against both fills as they are now.

**Nothing changes in this section:** the default fill (the list fill), the page, the network, every kernel table, and
`fx/fsr`.

## 106. ROUND 38 -- THE TILE FILL OVER THE LIGHTS' TILES ONLY: FIXED BEFORE THE RIG RUNS IT

**The question.** Section 105: the list fill cut the pixels, which is the Intel's cost, and the tile fill cut the passes,
which is the 1080's. Does a tile fill dispatched only over the tiles holding an unknown pixel cut both, and beat the
default list fill on both GPUs? (`denoise-fill-listed-tiles`.)

**The fill, `fill(..., { tile: "listed" })` and `chain(..., { tile: "listed" })`.**
- **The init pass** writes each pixel's ring into both ring buffers and its value into the second image. It also flags each
  16 x 16 tile holding an unknown pixel and appends it to a list, once.
- **One thread** writes the list's length as an indirect dispatch's workgroup count, as round 34's args kernel does.
- **The tile passes** are round 37's kernel, from the same template; round 37's own text is unchanged, byte for byte. Each
  workgroup reads its tile from the list and fills it, ping-ponging as before. There are 12 at 96 rings.
- **The left pass** is round 37's, over the frame. That makes 15 passes at 96 rings.
- **Why skipping is exact.** A tile with no unknown pixel when the fill starts never gets one, because a ring only turns
  UNKNOWN into a ring. Its pixels need no pass. Because the init pass wrote both buffers alike, whichever buffer the last pass
  leaves as the answer holds those tiles unchanged. The listed tiles are written by every pass. Their halos are read from the
  buffer the pass before left, and that buffer is exact for the listed tiles' interiors and unchanged elsewhere.
- **What is read back:** `tilesListed`, the list's length.

**Measured on the CPU, before this section was written, as a property of the fixture:** at 960 x 540 the rig's scene,
R 990000, has 25,765 pixels in view of its light (the rig's own count). They lie in **123 of the frame's 2,040 tiles, 6.0 %**.

**Timed.** `time()` adds `fillLTile` and `wholeLTile` by the wall clock. `timeHalfChain` adds `halfLTile` and
`temporalLTile`. The page gains three rows (21). A `section 106:` line carries them for the rig. The default stays the list
fill.

**The rows (the gate's sections 2-4).**
1. The listed tile kernel is the tile kernel's text with the tile read from the list. Every other line is the same, and round
   37's text is unchanged.
2. The listed tile fill is fillEmittersBounded's within 1e-5, and the list fill's and the tile fill's bit for bit. That holds
   on round 34's six frames and at 13 rings. `tilesListed` is the CPU's count of tiles with an unknown pixel, frame by frame.
3. The chain with it is the list fill's chain bit for bit, on all four scenes.
4. At the pilot size, `halfLTile` is the half-size chain with `fillLTile`, and the `section 106:` line carries it. The
   pilot's check lists exactly the CPU's count of tiles.

**The rig run.** On each GPU, two `realGpuRun --only denoise` runs, at a commit carrying this section.

**The rule (H38), per GPU, on the two runs' `section 106:` lines.**
- **C1:** every gate is green with exit 0.
- **C2:** the listed tile fill reaches the list fill's rings with 0 left, in 12 passes, over 123 tiles.
- **H38 holds on a GPU** when, in both runs, fillLTile <= 0.9 x fillList, the default.
- **What it buys:**
  - If it holds on both GPUs, the listed tile fill becomes the default, in a round of its own, and
    `denoise-fill-per-adapter` closes unbuilt.
  - If it holds on one GPU, `denoise-fill-per-adapter` goes ahead, naming each GPU's fastest fill from these runs.
  - If it holds on neither, it is kept as a measured negative and `denoise-fill-per-adapter` goes ahead with round 37's
    figures.

**Predictions (stated so they can miss).** Section 105's per-pass figures, split into a fixed cost and work that scales with
the tiles: about 0.25 ms fixed a pass, the rest of round 37's tile pass scaled by 6 %.
- **GTX 1080:** the listed tile fill 2-8 ms against the list fill's 22.6-23.1. H38 holds.
- **Intel gen-9:** 5-15 ms against 22.3-24.6. The init and left passes over the whole frame are most of it. H38 holds.
- So the listed tile fill becomes the default, and every gate is green on both.

**Sabotages, by the byte-safe runner (E1-E6):**
- the init pass writing the second ring buffer and not the second image;
- a tile listed by its column alone;
- the args kernel dispatching every tile (the tile fill again);
- the listed option running the tile fill;
- `halfLTile` summing `fillTile`;
- the page without the listed tile fill's chain row.

Each must turn at least one row red.

**Nothing else changes:** the default fill (still the list fill), round 37's tile kernel, the network, every kernel table,
and `fx/fsr`.

**Two corrections to the rows, made before the round was committed and before anything was measured on a GPU.** Both rows
went red on their first run here; the fill itself was bit for bit in every case.
- Row 1 asked round 37's kernel for 120 lines, a number written without counting. It has 90, and the row now holds it to
  that.
- Row 2 asked the frame with no unknown pixel for 1 tile pass, and read 0. No tile is listed there, so every tile pass
  dispatches no workgroup and none is counted. A frame with nothing to fill does no tile work, which is what the fill is
  for. The row now asks for 0 passes where no tile is listed.
- Reported, deciding nothing: at the pilot size on SwiftShader, the listed tile fill took 83.7 ms against the list fill's
  16.3, over 4 of the 12 tiles. That is a CPU's time.

## 107. ROUND 39 -- THE COVERAGE BOUNDED TO THE PIXELS THAT CAN SEE A LIGHT: FIXED BEFORE THE RIG RUNS IT

**The question.** The fill lever is being settled (sections 103-106), which leaves `denoise-halfres-fixed-costs`'s other
lever: the coverage. In round 37's runs (section 105) it is now the chain's largest step. The coverage at 1920 x 1080 took
247.6-252.8 ms on the Intel and 17.2-17.8 ms on the 1080; at 960 x 540, 59.9-66.4 and 4.3-4.6 ms. Every pixel traces 64 rays
against every sphere, though about 5 % of the frame can see a light. Does a coverage pass that skips the pixels no ray of
which can meet an emitter, with the same answer bit for bit, cut that cost at least in half on both GPUs?

**The bound, `coverage(..., { bound: true })` (COVERAGE_BOUND_WGSL).**
- **The test.** Before its 64 rays, a pixel compares its centre ray with each emitter sphere. It traces if the eye is inside
  or at the sphere (distance <= 1.001 r + 1e-4). It also traces if the angle from its centre ray to the sphere's centre is
  within all three of these together:
  - the sphere's angular radius, asin(r / d);
  - the pixel's half-diagonal on the image plane, times COVERAGE_BOUND_ARC = 1.6;
  - COVERAGE_BOUND_SLACK = 2e-3 rad.
- **Why the margins.** An arc is at most pi / 2 times its chord, and the chord is within the pixel on a plane at distance
  >= 1. f32's acos near 1 is good to about 5e-4.
- **Otherwise** the pixel writes 0 coverage and 0 emission, untraced. Those are the values its 64 rays would give, since no
  ray of it meets an emitter, and they are the same bits (+0).
- **Unchanged otherwise.** The kernel is round 31's text from one template, round 31's own unchanged byte for byte. A traced
  pixel runs the same code, so the answer is the same bits everywhere. `traced` counts the pixels traced.
- **The CPU twin**, `coverageMayHit`, makes the same test in f64.

**Measured on the CPU before this section was written, as properties of the fixtures and the rig's scene:**
- The twin traced every pixel `emitterRadiance` lights, missing none, on 13 views: R 44001, 44002, 44004 and 990000 at
  32 x 32, 64 x 64 and 128 x 72, and R 990000 at 960 x 540.
- At the rig's sizes it traces 27,023 of 518,400 pixels (5.2 %) at 960 x 540, and **106,709 of 2,073,600 (5.1 %) at
  1920 x 1080**.

**Timed.** `time()` adds `covHalfB` and `covFullB`: one pass each, on the device's clock where the device has one, as the
coverage is.
- It also compares the bounded coverage's last frames with round 31's, bit for bit at both sizes (`boundCheck.sameHalf`,
  `sameFull`), and reads back what each traced.
- `timeHalfChain` adds `fullBound` (today's page with the bounded mask; the page's own mask is this coverage at W x H),
  `halfBound` and `temporalBound` (the chain with its default fill and the bounded coverage).
- The page gains four rows (25). A `section 107:` line carries them for the rig.
- Nothing's default changes in this round.

**The rows (the gate's sections 2-4).**
1. The bounded kernel is round 31's text plus the bound, and round 31's own text is unchanged. It carries
   COVERAGE_BOUND_ARC and COVERAGE_BOUND_SLACK.
2. On the device, on the four scenes at both sizes, the bounded coverage is round 31's bit for bit. Its traced count is
   within 2 % of the twin's, and every pixel round 31's lights is traced. On the scene with the light behind the camera, it
   traces nothing.
3. The twin traces every lit pixel on the CPU views above.
4. At the pilot size, `halfBound` and `fullBound` are their sums, the page has 25 rows, `boundCheck` is bit for bit at both
   sizes, and the `section 107:` line carries the sums.

**The rig run.** On each GPU, two `realGpuRun --only denoise` runs, at a commit carrying this section.

**The rule (H39), per GPU, on the two runs' `section 107:` lines.**
- **C1:** every gate is green with exit 0.
- **C2:** at both sizes the bounded coverage is round 31's bit for bit (`sameHalf`, `sameFull`), and it traced 106,709 +-
  2 % at 1920 x 1080.
- **C3:** both coverages at both sizes are on the device's clock.
- **H39 holds on a GPU** when, in both runs, covFullB <= 0.5 x covFull.
- **What it buys:**
  - If it holds on both GPUs, the bounded coverage becomes the chain's and the page's mask, in a round of its own, and the
    coverage lever closes.
  - If it holds on one, it is reported and the coverage per adapter goes to the backlog.
  - If it holds on neither, it is a measured negative.
- **Reported, deciding nothing:** the chain's ratio against today's page, since the page's mask gets the same saving.

**Predictions (stated so they can miss).** The coverage's cost is its rays, so the bounded pass should cost about the
traced share of it, rounded up for 8 x 8 workgroups that hold both kinds of pixel, plus the bound's own test over the frame.
- **Intel gen-9:** covFullB 10-40 ms against covFull's ~250, and covHalfB 3-15 ms against ~63.
- **GTX 1080:** covFullB 1-4 ms against ~17.5, and covHalfB 0.3-1.5 ms against ~4.5.
- H39 holds on both, and every gate is green.

**Sabotages, by the byte-safe runner (F1-F6):**
- the slack and the arc factor dropped (`asin` alone);
- the bound tested against every sphere, not the emitters;
- the bound's skipped pixels writing the emitter's colour (1 for coverage);
- `coverage(..., { bound: true })` running round 31's kernel;
- `halfBound` summing `covFull`;
- the page without the bounded chain's row.

Each must turn at least one row red.

**Nothing else changes:** the default coverage, the fill, the network, every kernel table, and `fx/fsr`.

**One correction to the rows, made before the round was committed and before anything was measured on a GPU.** Row 1 held
the bound to 23 added lines, a number written without counting. It adds 20, and the row now holds it to that. The other
rows passed on their first run here, the device tracing exactly the twin's count on all eight views. Reported, deciding
nothing: at the pilot size on SwiftShader the bounded coverage at 128 x 72 took 4.7 ms against round 31's 51.3. That is a
CPU's time.

## 108. ROUND 40 -- THE GTX 1080's HIDDEN LAYERS SHARING THEIR INPUTS ACROSS A SUBGROUP: FIXED BEFORE THE RIG RUNS IT

**The question.** With the fill and the coverage in hand (sections 103-107), the network is the chain's largest cost on both
GPUs. On the 1080 it is r18t: ~18 ms at 960 x 540 and ~75 ms at 1920 x 1080 natively, its hidden layers at ~2.2-2.3
TFLOP/s, about a quarter of the GPU's peak. Of the backlog's levers for the network, `denoise-subgroup-reduction` is the one
that can be built and tested in this sandbox before the rig sees it: SwiftShader exposes `subgroups` here, natively and in
Chromium, and not `shader-f16`. Does a hidden-layer kernel that shares its input values across a subgroup, in place of
r18t's tile in workgroup memory, run the 1080's network faster than r18t, with every cell still explained?

**The kernel, `k_conv_sub` (brain/conv2d.mjs's `conv2dSubWgsl`), and the set `r40s`.**
- **A thread's work is r18t's:** 2 output rows (`rows: 2`, as r18t's 2 pixels) and all 32 output channels, as 8 vec4
  accumulators a row (`g4: 8`), from r18t's own uniform block of weights (`packTileUniforms` at 1 pixel, 8 vec4s).
- **The inputs are not staged.** A workgroup is 64 threads in a row. Each subgroup claims a span of columns through a
  workgroup atomic, so nothing assumes which threads share a subgroup or in what order. Each lane loads its own column. It
  gets its left and right neighbours' values with `subgroupShuffle`, and the subgroup's two edge lanes serve as halo only. A
  subgroup of S lanes writes S - 2 columns: 30 on the 1080, 2 on SwiftShader's 4. Every size is read from the
  `subgroup_size` builtin, and the host dispatches by the adapter's smallest subgroup size. A larger one leaves the
  workgroups past the image idle.
- **No barrier, and no workgroup memory but the atomic.**
- **The input rows are streamed** one at a time and fed to the output rows that use them. Every block's channels and taps are
  unrolled at generation, so no array is indexed at run time.
- **THE ORDER DOES NOT MOVE.** Each accumulator adds the bias, then block by block, ky, kx, ci. A row outside the image is
  skipped, as r18t skips it. A column outside adds the zero its lane loaded, as r18t's zero edge does. So the kernel is held
  to conv2dCpu, or its fused mirror, cell for cell, at zero. That is the key every set but r27w is held to; no restated
  tolerance is needed.
- **The set `r40s`** is r18t with every hidden layer the kernel holds on `k_conv_sub`, and r15's fused head. It needs the
  adapter's `subgroups` feature (SUBGROUP_SETS). On an adapter without it, the Intel gen-9 among them, it is left out by name
  and nothing else changes. Its devices request `subgroups` where the adapter offers it.

**Timed.** Both ladders, native and the page's, add `r40s` to TIMED_SETS where the adapter has subgroups. The sets keep
taking turns. New lines, `native: r40s against r18t at W x H` and `page: ...`, are r18t's median over r40s's, tagged section
108, beside a line against r15.

**The rows.**
1. `conv2dSubWgsl`'s shape, its refusals, and its uniform block (r18t's at 1 pixel, 8 vec4s, bit for bit).
2. On the device, natively and in Chromium, at odd sizes that leave partial spans and rows and blocks of fewer than 8
   channels: every cell is explained by conv2dCpu or its fused mirror, at zero.
3. `r40s`'s layers: every hidden layer on `sub`, the head on `head_apply`, and a layer the kernel cannot hold falling back
   to r15's kernel.
4. K0s: the whole pass on the device is the twin's, every layer's cells explained, natively and in the browser, under the
   key every set but r27w is held to.
5. An adapter without subgroups drops `r40s` by name, from the ladders and from any request.

**The rig run.** On each GPU, two `realGpuRun --only denoise` runs, at a commit carrying this section. On the Intel they
check that `r40s` stands aside by name and that the rest is unchanged.

**The rule (H40), on the GTX 1080, per path (native under DXC, and the page in Chrome).**
- **C1:** every gate is green with exit 0.
- **C2:** K0s holds on that path in both runs.
- **C3:** both sets' 1920 x 1080 passes are on the device's clock.
- **H40 holds on a path** when, in both runs, r40s is at least 1.05 x as fast as r18t at 1920 x 1080 (section 66's margin).
- **What it buys:**
  - If it holds on both paths, the 1080's two table entries (PAGE_KERNELS_BY_ADAPTER, NATIVE_KERNELS_BY_ADAPTER) move to
    r40s, in a round of its own.
  - If it holds on one, that path's entry moves in that round and the other stays r18t.
  - If it holds on neither, r40s is kept as a measured negative and the 1080's network lever goes back to the backlog.
- On the Intel nothing can move: `r40s` must stand aside by name, with every other line as before.

**Predictions (stated so they can miss).**
- **r40s against r18t at 1920 x 1080 on the 1080: 0.8-1.3 x, on both paths.** The kernel trades r18t's cooperative
  staging and two barriers a block for four global loads and eight shuffles a lane a block. It also gives up 2 of every 32
  lanes to halo. Which of those wins is not known from here. H40 is not predicted either way.
- Every gate is green on both GPUs. On the Intel, r40s stands aside.

**Sabotages, by the byte-safe runner (G1-G7):**
- the shuffle reading lane + kx instead of lane + kx - 1;
- a halo lane writing its column;
- the span taken as S, not S - 2;
- a row outside the image read from the image's edge row, not skipped (a row "added as zeros" would change only the
  sign of a zero, which the cell check does not see, so it would test nothing);
- the channel blocks summed out of order (cj before kx);
- `r40s` built on a device without subgroups;
- the ladder keeping `r40s` on an adapter without subgroups.

Each must turn at least one row red.

**Nothing else changes:** every table entry, the default fill and coverage, every other kernel, and `fx/fsr`.

**A correction to the kernel, made before anything was committed or measured on a GPU.** As first written, each subgroup
claimed its span of columns through a workgroup atomic. On SwiftShader that atomic returned 0 to every subgroup's first lane,
so every subgroup wrote the same columns and most cells came out wrong (6,688 of 7,904 at 19 x 13, 32 -> 32). A probe showed
SwiftShader's subgroups to be contiguous, aligned runs of a workgroup's threads (first indices 0, 4, 8, ...). So a subgroup
now takes the span its first thread's index names: that index over the subgroup size. WGSL does not promise that layout.
An adapter that broke it would turn the cell-for-cell rows red, on the rig as here, so it cannot pass unseen.

**And one case dropped from the conv2d gate.** At 4 rows and 8 vec4s, 128 accumulator floats a thread, the kernel crashed
SwiftShader's native pipeline build. The process died with a segmentation fault and no row, as written-out blocks of the fast
kernel did in section 59. `r40s` runs 2 rows, so that configuration is not a case. 4 rows are tested at 2 vec4s.

**Sabotages, by the byte-safe runner, before commit.** G1-G5 turned 8-10 rows red each, across the conv2d gate's device
cases, K0s natively and in the browser, and the small network. G6 turned 1 red (the refusal row) and G7 1 red (the ladder row
on an adapter with the feature hidden). G7 needed that row. This box's adapter has subgroups, so nothing exercised the ladder
standing aside, and a ladder that threw would have killed the gate with no FAIL line, which the runner counted as 0. The row
now catches the throw, and the runner now counts a gate that exits non-zero with no FAIL line as a crash, red.
Reported, deciding nothing: on SwiftShader at 64 x 64, r40s took about 9-10 x r18t's time on both ladders. Those are a CPU's
4-lane subgroups, half of every subgroup halo.


## 109. ROUND 41 -- THE INTEL'S HIDDEN LAYERS IN HALF PRECISION: FIXED BEFORE THE RIG RUNS IT

**The question.** On the Intel gen-9 the network is the half-size chain's largest cost by far: r18u at 960 x 540 took
274-283 ms in round 37's runs, against tens of ms for each other step once rounds 38-39 land. Gen-9 runs f16 arithmetic at
twice its f32 rate, and both its paths expose `shader-f16` (the features probe). Does r18u with its hidden layers' arithmetic
in f16 run the Intel's network faster, its image held to a bound against the f64 network that this section fixes before it
is run? (`denoise-f16-intel`.)

**This round's first measurements are on the rig.** SwiftShader exposes no `shader-f16`, natively or in Chromium, so the
f16 kernel cannot compile here. What can be held here is held: the f32 setting of the template is r18u's text byte for byte;
an emulation that reads the same packed f16 weights through `unpack2x16float` and computes in f32 runs on SwiftShader against
conv2dCpu on f16-rounded weights; and the twin, the packing and the bound are CPU rows. The f16 type tokens themselves -- the
tile, the accumulators, the literals, the conversions -- are first compiled and run on the Intel.

**The kernel: `conv2dFastAltWgsl(L, { reads: "f32", unroll: true, arith: "f16" })`, and the set `r41h`.**
- r18u's kernel, one block written out, with `enable f16;`. The input tile holds f16, converted once at the load. The 8
  accumulators are `vec4<f16>`, starting from the bias converted once. Every multiply-add is f16, and the output is written f32.
- The weights are rounded to f16 on the host and packed two vec4s of f16 to a uniform `vec4<u32>`, read with
  `bitcast<vec4<f16>>`. That is half r18u's weight bytes. Element 0 is the low half of the first u32, little-endian, as
  WebGPU is.
- `arith: "f16emu"` is the same kernel with f32 types, decoding the same packed words with `unpack2x16float`. It is a test
  instrument, never a set's kernel.
- **The set `r41h`** is r18u with every layer r18u runs on `fast_unroll` (all four 3 x 3 layers, the first with its 10
  channels) on the f16 kernel, called `fast_unroll_h`. The head is r15's fused `head_apply`, in f32: the softmax over 81
  logits stays f32. It needs the `shader-f16` feature, and `featureSetsFor` leaves it out by name wherever that is missing,
  the 1080 and SwiftShader among them. It is in FXC_UNTRIED_SETS, since FXC has no 16-bit types.

**Its twin and its key.**
- `conv2dCpuF16` does the kernel's order, the canonical one (b, then block by block, ky, kx, ci). Every input, weight and
  bias is rounded to f16 (`f16round`, ties to even) and every product and sum too. `conv2dCpuF16Fma` rounds each multiply-add
  once.
- **K0h:** every f16 layer's cells are the twin's or the mirror's, given the device's own input. The f32 head's image is
  within APPLY_TOL. And the bridge to f64: the image within **F16_IMAGE_TOL = 1e-2 relative** of the f64 network on every value.
- **Measured on the CPU before this section was written**, the r41h twin against the f64 network on the device gate's
  fixture (the large random network, 21 x 19): at most 1.75e-3 relative, 2.6e-4 on average. At 64 x 64, 3.45e-3. The
  shipped network on the ladder's input reached 1.25e-2 relative, but only on values near zero; its largest absolute
  difference is 3.4e-3. The bound holds the gate's fixture, at about 5.7 x its largest.
- The f32 twin, for comparison, is within 6.6e-7.

**What K0h does NOT settle.** Every other set is within f32 rounding of the network the arc measured; r41h's image is not.
Whether 1e-3-level differences move any denoise verdict -- the arc's d -- is not measured here. So **no table entry can move on
H41 alone:** if it holds, the quality question is a round of its own before the Intel's entries change.

**Timed.** Both ladders add `r41h` to TIMED_SETS where the adapter has `shader-f16`, with `r41h against r18u` and
`against r15` lines tagged section 109.

**The rows.**
1. `f16round` and `f16bits` on exact cases: ties to even, subnormals, 65504, and the overflow at 65520.
2. The template's f32 setting is r18u's text byte for byte.
3. The f16 kernel's text is r18u's line for line but for its types, its weight reads and its conversions.
4. The packed weights, decoded as `bitcast` would, are the f16-rounded weights.
5. On the device here, the emulation kernel is conv2dCpu on f16-rounded weights, cell for cell, on odd sizes and partial
   blocks.
6. The f16 twin is f16-valued, differs from the f32 twin, and is within the bound on the gate's fixture.
7. r41h's layers and features, its refusal on a device without the feature, and the ladder standing it aside.
8. K0h natively and in the browser, where the feature exists: the Intel. Here those rows SKIP by name.

**The rule (H41), on the Intel gen-9, per path (native under DXC, and the page in Chrome).**
- **C1:** every gate is green with exit 0.
- **C2:** K0h held on that path in both runs, read off its measured line.
- **C3:** both sets' 1920 x 1080 passes are on the device's clock.
- **H41 holds on a path** when, in both runs, r41h is at least 1.05 x as fast as r18u at 1920 x 1080.
- **What it buys:**
  - If it holds on either path, the next round measures r41h's quality on the arc's images, its d against r18u's, before any
    table entry moves.
  - If it holds on neither, r41h is kept as a measured negative and `denoise-f16-intel` closes.
  - If K0h fails, the fault is the kernel's, named by its rows, and it is fixed before any timing is read.

**Predictions (stated so they can miss).**
- **r41h against r18u at 1920 x 1080 on the Intel: 1.1-1.8 x, on both paths.** f16 doubles the ALU rate, but section 54 put
  the hidden layers at about a fifth of the f32 peak, so not all of the cost is arithmetic. The tile in f16 halves its
  workgroup memory, and the weights are half the bytes.
- K0h holds on both paths, and every gate is green on both GPUs. On the 1080, r41h stands aside.

**Sabotages, by the byte-safe runner (H1-H7):**
- the packing's halves swapped (zw for xy);
- a weight's vec4 index off by one within a pair;
- the packed weights not rounded to f16 first (truncated);
- the f32 setting changed;
- the twin rounding to f32, not f16;
- the bound widened to 1e-1;
- r41h built on a device without `shader-f16`.

Each must turn at least one row red here, or, where only the Intel can see it, the section says so.

**Nothing else changes:** every table entry, every other kernel, and `fx/fsr`.

**Two changes to the rows, made before the round was committed and before anything was measured on a GPU.**
- The kernel-text row's list of what an f16 line may carry was written too narrow and went red on the kernel as intended.
  It missed the `0.0h` literal and the store's `f32(...)` conversion, which are in the design above. The list now names them.
- Sabotage H4 (the f32 setting changed) could not have gone red as the rows stood. They compared the f32 setting with the
  default, which would change with it, and a cosmetic change moves no cell. So r18u's kernel text is now frozen by sha256 at
  both of its shapes. The hashes were taken at the commit before this round and after it alike, and they match.

**Sabotages, by the byte-safe runner, before commit: H1-H7 each turned at least one row red here.** H1 turned 4 rows red, H2 3,
H3 1, H4 1, H5 2, H6 1 and H7 1. H3 was caught only by the packing row: f16bits rounds the mantissa itself, so unrounded weights
mostly packed to the same words. H2 left the three-group 1 x 1 case alone, since it reads through the z-group index. As this
section says, no sabotage of the f16 kernel's own type tokens can be seen before the Intel compiles it.


## 110. ROUND 42 -- THE CHAIN'S "REST", SPLIT INTO ITS THREE PASSES: A MEASUREMENT, FIXED BEFORE THE RIG RUNS IT

**The question.** The step every round has called "rest" is three passes: the transfer at w x h (`toT`, which also finds the
frame's brightest t), EASU to W x H, and the composite at W x H. In round 37's runs it was 41.1-42.8 ms on the Intel at
960 x 540 -> 1920 x 1080 and 1.0 ms on the 1080. With rounds 38-41 aimed at the fill, the coverage and the network, it is the
Intel's next fixed cost beside the history's accumulation. Nothing has timed its passes apart. One of them is suspect by its
shape: `toT` finds the brightest t with an `atomicMax` that every one of its 518,400 threads sends to **the same 32-bit
word**. This round measures; it moves nothing.

**What is timed (`time()`, one pass each, on the device's clock where the device has one, as `rest` is):**
- `restToT` -- the transfer alone;
- `restEasu` -- EASU alone;
- `restComp` -- the composite alone;
- `restToTFree` -- **a diagnostic, never run in any chain**: the transfer with its `atomicMax` line removed (TO_T_FREE_WGSL,
  made from TO_T_WGSL by deleting that one line). `restToT - restToTFree` is what the single-word atomic costs.
- A `section 110:` line carries the four and `rest` beside them.

**The rows.**
1. TO_T_FREE_WGSL is TO_T_WGSL less exactly its `atomicMax` line, and nothing else.
2. At the pilot size each new step is one pass on `rest`'s clock, positive and finite, and the line carries them.
3. The chain's kernels, its sums and every earlier row are unchanged: the new steps are timed beside the chain, not in it.

**The rig run** is the same pair of runs per GPU as rounds 38-41, at a commit carrying this section.

**Reading it (no rule moves anything; this fixes how the next round is chosen).**
- On the Intel, with both runs' passes on the device's clock: the pass that is at least half of `restToT + restEasu +
  restComp` in both runs is the next round's target.
- If `restToT - restToTFree` is at least half of `restToT` in both runs, that target is the brightest t's reduction (a
  workgroup reduction, then one atomic a workgroup), whichever pass is largest.
- If no pass is half, the rest is reported as spread and dropped from the backlog's levers.

**Predictions (stated so they can miss), on the Intel at 960 x 540 -> 1920 x 1080.**
- EASU is the largest: 20-35 ms of the ~42. It runs 12 taps at each of 2,073,600 output pixels.
- The composite: 4-12 ms.
- `restToT`: 2-12 ms, of which the atomic is a third or more.
- On the 1080 the three sum to about its 1.0 ms. Nothing there is read.

**Sabotages, by the byte-safe runner (I1-I3):**
- TO_T_FREE_WGSL keeping the atomic;
- `restEasu` timing the composite;
- the split steps run inside the `rest` frame (no longer one pass each).

Each must turn at least one row red.

**Nothing else changes:** every kernel the chain runs, every sum, every table, and `fx/fsr`.

**Before commit.** I1-I3 each turned at least one row red. I2 (`restEasu` timing the composite) could not have gone red as the
rows were first written, because a time does not say which kernel made it. So the rest steps now record which of the
runner's pipelines they dispatched, through a wrapper on those five steps alone, so no other step's timing changes. The
split row holds each step to its kernel. Reported, deciding nothing: on SwiftShader at the pilot size the transfer took
0.48 ms and the transfer without its atomic 0.16 ms.


## 111. ROUNDS 38-42 -- THE VERDICTS: THE LISTED TILE FILL AND THE BOUNDED COVERAGE HOLD ON BOTH GPUS, THE SUBGROUP KERNEL LOSES, THE f16 KERNEL IS OWED, AND EASU IS NEXT

**What arrived.** Four reports: two `realGpuRun --only denoise` runs on each GPU, all at ce1cca35, the commit carrying
sections 106-110. They were committed as received at 2e80def5, before this section was written:
`render/denoise-rig-r42-{a,b}-{intel-gen9,gtx1080}.json`. **One of them was read first.** The Intel's run a was shown in
the session as it arrived, before the commit; the other three were committed unread. The rules were fixed in sections
106-110 before any of them ran, so the order changed nothing that could be chosen, but the method asks for the commit
first, and it was not first for that one.
- `render/denoiseUpscaleGPU-selfcheck.mjs`'s section 11 re-derives sections 106, 107 and 110 from the four files.
- `render/denoiseDevice-selfcheck.mjs` re-derives sections 108 and 109, each rule with fixtures that move it.

**C1 held in all four runs:** every gate green with exit 0, at ce1cca35.

**H38, by section 106's rule.** In every run the listed tile fill reached 87 rings, the list fill's count, in 12 passes over
123 tiles, with 0 left (C2).

| GPU | List fill (a / b) | Listed tile fill (a / b) | Listed / list | H38 |
|---|---|---|---|---|
| GTX 1080 | 31.1 / 24.9 ms | **17.1 / 17.5 ms** | 0.550 / 0.703 | **holds** |
| Intel gen-9 | 22.2 / 25.3 ms | **18.7 / 17.4 ms** | 0.842 / 0.688 | **holds** |

**So, by the rule: it holds on both GPUs.** The listed tile fill becomes the chain's default (`denoise-listedtile-default`), and
`denoise-fill-per-adapter` closes unbuilt.
- **The predictions missed, both of them.** The 1080 was predicted 2-8 ms and the Intel 5-15 ms; each took 17-19 ms. The
  prediction scaled the tile passes' work by the 6 % of tiles listed. On the 1080 the listed tile fill (17.1 / 17.5) costs
  what round 37's whole-frame tile fill did (16.8 / 16.7). So on that GPU its passes' fixed costs, not their tiles, are
  most of it. The prediction priced those at 0.25 ms a pass, and they are about 1.2 ms. H38 held on both, as predicted.
- **The fill is timed by the wall clock.** The 1080's list fill read 31.1 ms in run a, against 22.6-24.9 in its other three
  runs since round 37. Both runs still hold.

**H39, by section 107's rule.** In every run the bounded coverage was round 31's bit for bit at both sizes. It traced 106,709
(the 1080) and 106,622 (the Intel) at 1920 x 1080, both within 2 % (C2). Every coverage was on the device's clock (C3).

| GPU | covFull (a / b) | covFullB (a / b) | Bounded / full | covHalf (a / b) | covHalfB (a / b) | H39 |
|---|---|---|---|---|---|---|
| GTX 1080 | 17.08 / 16.86 ms | **1.22 / 1.23 ms** | 0.072 / 0.073 | 4.23 / 4.26 ms | 0.35 / 0.36 ms | **holds** |
| Intel gen-9 | 297.3 / 252.1 ms | **26.4 / 22.4 ms** | 0.089 / 0.089 | 76.4 / 62.9 ms | 6.67 / 5.61 ms | **holds** |

**So, by the rule: it holds on both GPUs.** The bounded coverage becomes the chain's and the page's mask
(`denoise-coverage-bound-default`), and the coverage lever closes.
- **All four predictions were met**, in both runs.
- **Reported, deciding nothing.**
  - The Intel traced 87 pixels fewer than the twin at 1920 x 1080, and 29 fewer at 960 x 540. Its output was bit for bit
    all the same, so no pixel it skipped had a ray meeting a light. The 1080 traced exactly the twin's counts.
  - The half-size chain with the bounded coverage, against today's page given the same mask: 1.454 / 1.641 x on the 1080
    and 3.015 / 3.496 x on the Intel.

**H40, by section 108's rule, on the GTX 1080.**
- C1, C2 and C3 held on both paths. K0s was green natively in both runs ("4 of 4 native rows"). In the browser its row
  passed, which prints no line: the gate was green and that row was not skipped. Both sets' 1920 x 1080 passes were on the
  device's clock.

| Path | r40s against r18t at 1920 x 1080 (a / b) | H40 |
|---|---|---|
| native (DXC) | **0.273 / 0.263 x** | **fails** |
| page (Chrome) | **0.269 / 0.266 x** | **fails** |

**So, by the rule: it fails on both paths.** r40s is kept as a measured negative. Both of the 1080's entries stay r18t, and
its network lever goes back to the backlog.
- **The prediction (0.8-1.3 x) missed:** r40s took 3.4-3.8 x r18t's time at every size from 128 x 128 up. Its hidden layers
  ran at about 500 GFLOP/s against r18t's 2,350, about 83 ms a layer against 16. The prediction said it did not know which
  side would win, and it was not close. The cause is not measured here. The kernel's 2 x 8 vec4 accumulators a thread with
  streamed rows, and the shuffles in place of one staged tile, are candidates. Neither is tested.
- On the Intel, r40s stood aside by name (no subgroups feature), as predicted.

**H41, by section 109's rule, on the Intel gen-9: NO VERDICT on either path.**
- **C1 held.** Every gate was green with exit 0.
- **C2 held.** K0h was green natively in both runs ("2 of 2 native rows"). In the browser its row passed: the gate was
  green and that row was not skipped. **The f16 kernel compiled and was exact on its first hardware.**
- **C3 was not met.** The ladder's 1500 ms cap skipped r41h's 1920 x 1080 pass on both paths in both runs. Its predicted
  pass times were 2192-2485 ms. With no pass at that size there is no ratio there, so the rule decides nothing.
- **What was measured, reported, deciding nothing:** r41h ran at **0.49-0.61 x** r18u's speed at every size it reached, 64 x 64
  to 1024 x 1024, on both paths and in both runs. At 1024 x 1024 that was 0.514 / 0.490 x natively and 0.522 / 0.516 x on
  the page. **The prediction, 1.1-1.8 x, missed at every size measured.**
- **What follows.** No table entry moves. `denoise-f16-intel` stays open, owed to a reading that can meet C3. A rerun as
  things stand cannot meet it, because the cap would skip the same pass again. The two ways on are:
  - a round that times r41h and r18u at 1920 x 1080 under a cap that admits them, fixed before it runs; or
  - closing the entry on these figures, as a judgement and not this rule's outcome.
  Neither is taken here.
- On the 1080, r41h stood aside by name (no shader-f16 feature), as predicted.

**Section 110's reading, on the Intel at 960 x 540 -> 1920 x 1080.** Every pass was on the device's clock.

| Run | rest | toT | EASU | composite | toT without its atomic | EASU's share of the three |
|---|---|---|---|---|---|---|
| a | 54.9 ms | 2.36 ms | **30.06 ms** | 22.67 ms | 2.40 ms | 0.546 |
| b | 44.4 ms | 1.56 ms | **25.74 ms** | 17.13 ms | 1.63 ms | 0.579 |

- **EASU is at least half of the three passes in both runs, so EASU is the next round's target** (section 110's first
  reading).
- **The single-word atomic costs nothing measurable.** The transfer without it took slightly longer in both runs. So the
  brightest t's reduction is not the target (the second reading).
- **The predictions, as made:**
  - EASU 20-35 ms: met in both runs.
  - The composite 4-12 ms: missed in both (22.7 and 17.1). It is the second largest pass, not a small one.
  - restToT 2-12 ms: met in run a (2.36) and missed in run b (1.56).
  - The atomic a third or more of the transfer: missed.
  - The 1080's three passes summing to about its 1.0 ms: met (1.006 and 1.003 against rest's 1.003 and 1.000).
- The Intel's rest read 54.9 and 44.4 ms, against 41.1-42.8 in round 37's runs. That is the run-to-run spread on that GPU.
  The coverage and the rest read high in run a, though the network at 1920 x 1080 did not (1228 against 1308 ms).

**A label that moved, reported and not changed.** realGpuRun now files `render/denoiseDevice-selfcheck.mjs` as a timing
gate, not an exact one: the summary reads "exact 1/1, timing 3/3", where round 37's read "exact 2/2, timing 2/2".
`categorize` reads the gate's source. Round 40's ladder-proxy row, which checks that the ladder stands r40s aside on an
adapter with the feature hidden, calls `timingLadder(`, and that call is what flips the label. The gate's rows are
unchanged, and no rule here reads the category.

**Sabotages, by the byte-safe runner (J1-J6), each restored byte-identical:** J1, H38 at 0.5 x, 1 red; J2, the traced
count read off the half size, 2 red; J3, EASU read off the composite's figure, 2 red; J4, H40's margin at 0.25 x, 2 red;
J5, C3 dropped, 1 red; J6, the chain's verdict read off round 37's reports, 7 red.

**What changes in this section: nothing in the code but the verdict rows.** The default fill and coverage, every kernel
table, the network and `fx/fsr` are as section 110 left them. The two defaults that H38 and H39 move to are the backlog's
`denoise-listedtile-default` and `denoise-coverage-bound-default`.

## 112. ROUND 43 -- THE LISTED TILE FILL BECOMES THE CHAIN'S DEFAULT, WITH THE LIST FILL AND THE RING FILL KEPT AS REFERENCES

**Why now.** Section 111, by section 106's rule: H38 held on both GPUs, so the listed tile fill becomes the chain's fill, in
a round of its own that changes the runner's default and holds the change to today's rows. This is that round
(`denoise-listedtile-default`), in round 36's shape (section 103). It measures nothing new, so it has no prediction to miss
and no rig run to wait for. It is fixed here before its code.

**What changes, in `render/denoiseUpscaleGPU.mjs`:**
- **`fill(...)` and `chain(...)` with nothing asked run the listed tile fill.** Every explicit option keeps its meaning:
  - `{ list: true }` runs round 34's list fill, as it always has;
  - `{ list: false }` runs round 31's ring fill;
  - `{ tile: true }` runs round 37's tile fill;
  - `{ tile: "listed" }` runs round 38's listed tile fill.
  So no caller that names its fill gets a different one. A caller that names none gets the new default.
- **`timeHalfChain`'s `half` and `temporal` sum the listed tile fill (`fillLTile`)**, and the result says so: `fill: "listedTile"`.
  - `halfList` and `temporalList` are new: the same two sums with the list fill (`fillList`), the reference.
  - `halfLTile` and `temporalLTile` go. They would be `half` and `temporal` under a second name, as `halfList` was in round 36.
  - `halfBound` and `temporalBound` are section 107's "chain with its default fill and the bounded coverage", so they now
    sum `fillLTile`.
- The step keys do not change. `fillList`, `fillLTile` and their `whole` steps keep their meanings.

**What changes on the page (`denoise.html`'s "Time the half-size chain"):**
- The default rows report the listed tile fill: the fill row, "the half-size chain in all", the one-frame row and "the
  half-size chain with its history, in all".
- Round 34's list fill takes the place of round 38's group as a reference with four rows: its fill, its steps in one frame,
  its chain in all, and that with the history. That makes 26 rows, not 25.
- The status line's ratio is the default chain's, with the list fill's beside it.

**What does NOT change: the lines the rig's reports carry.** Each keeps its meaning from this round on.
- Section 93's and 97's lines: the ring fill's chain.
- Section 99's "with the list fill": the list fill's chain, now `halfList` and `temporalList`.
- Section 103's line: the default fill by name and the default chain.
- Section 106's "with the listed tile fill": the listed tile fill's chain, now `half` and `temporal`.
- Section 107's line: the chain with the default fill and the bounded coverage. Its figure moves with the default, as its
  definition says.
- Sections 105 and 111 read committed reports from before this round, whose keys are as they were.
- The pilot-size row checks each line's figure against the sum it names, so no line can change meaning with no row red.

**The rows that hold the change (the gate's sections 3 and 4):**
1. **`fill()` with nothing asked is the listed tile fill.** It has the same `tilesListed`, the same `tilePasses` and the same
   floats, bit for bit, as `{ tile: "listed" }`, on all six of round 34's frames. `{ list: true }` is still round 34's (its
   `listed` count, no tiles listed), and `{ list: false }` lists nothing and stays fillEmittersBounded's.
2. **`chain()` with nothing asked is the listed tile fill's chain**, bit for bit, on all four scenes. It stays within 1e-6
   of emitterAwareUpscale, as the list fill's did.
3. **At the pilot size:**
   - the page's `half` is the half-size network, the coverage at both sizes, `fillLTile` and the rest;
   - `temporal` is that plus the history's four passes;
   - `halfList` and `temporalList` are the same with `fillList`;
   - `fill` is `"listedTile"`, and the table has 26 rows.
4. **The rig lines**, made from the pilot's report, each carry the figure of the sum named above.

**Sabotages, by the byte-safe runner (K1-K6):**
- `fill()`'s default back to the list fill;
- `chain()`'s the same;
- `{ list: true }` running the listed tile fill;
- `half` summing `fillList`;
- `halfList` summing `fillLTile`;
- the page without the list fill's chain row.
Each must turn at least one row red. A sabotage that goes 0 red is a finding to fix before the round is committed.

**The rule.** The round holds when rows 1-4 pass on SwiftShader and every gate the branch runs stays as green as it was.
No rig run is owed: the kernels, their order and every timed step are round 38's, measured on both GPUs in section 111.
The next rig run of this gate checks rows 1-4 on that GPU as it goes.

**Nothing else changes:** the coverage (section 107's default round is `denoise-coverage-bound-default`, after this one),
the network, every kernel table, the kernels themselves, and `fx/fsr`.

**Before commit.** Rows 1-4 passed on their first run here. K1-K6 each turned at least one row red and were restored
byte-identical: K1 1 red, K2 1, K3 5, K4 1, K5 1, K6 1.

## 113. ROUND 44 -- THE BOUNDED COVERAGE BECOMES THE CHAIN'S MASK AND THE PAGE'S, WITH ROUND 31'S KEPT AS THE REFERENCE

**Why now.** Section 111, by section 107's rule: H39 held on both GPUs, so the bounded coverage becomes the chain's and the
page's mask, and the coverage lever closes. This is that round (`denoise-coverage-bound-default`), in the shape of rounds 36
and 43 (sections 103 and 112). The bounded coverage is round 31's bit for bit, so no image moves. The round measures nothing
new, so it has no prediction to miss and no rig run to wait for. It is fixed here before its code.

**What changes, in `render/denoiseUpscaleGPU.mjs`:**
- **`coverage(S, w, h)` with nothing asked runs the bounded coverage** (`COVERAGE_BOUND_WGSL`, round 39). `{ bound: false }`
  runs round 31's, which stays unchanged as the reference. `{ bound: true }` keeps its meaning.
- **`timeHalfChain`'s defaults take the bounded coverage at both sizes,** and the result says so: `coverage: "bound"`.
  - `full` (today's page) is the network at W x H plus `covFullB`.
  - `half` and `temporal` are the chain on its default fill (the listed tile fill, section 112) with `covHalfB` and
    `covFullB`.
- **The reference keeps round 31's coverage:** `fullUnbound`, `halfUnbound` and `temporalUnbound` are new. They are the same
  three sums with `covHalf` and `covFull`.
- `fullBound`, `halfBound` and `temporalBound` go. They would be `full`, `half` and `temporal` under a second name.
- **The other references keep round 31's coverage,** so their figures stay comparable with every earlier round's: the ring
  fill's (`halfRing`, `temporalRing`), the tile fill's (`halfTile`, `temporalTile`) and the list fill's (`halfList`,
  `temporalList`).
- The step keys do not change. `covHalf` and `covFull` are round 31's; `covHalfB` and `covFullB` the bounded pass.

**What changes on the page (`denoise.html`'s "Time the half-size chain"):**
- The two coverage rows report the bounded coverage, with the pixels it traced. The rows that follow from them change with
  them: "today's page in all", "the half-size chain in all" and "with its history".
- Round 39's group of four rows becomes round 31's coverage as the reference: its coverage at both sizes, today's page with
  that mask, the chain with it, and that with the history. The table stays at 26 rows.
- The status line's ratio is the default page against the default chain, with round 31's coverage's beside it.

**What does NOT change: the lines the rig's reports carry.** Each keeps its meaning from this round on.
- **Section 93's line:** "today's page" is round 31's mask (`fullUnbound`) against the ring fill's chain (`halfRing`). Its
  ratio is the one sections 94 and 98 read.
- **Section 97's line:** the ring fill's chain with its history, against `fullUnbound`.
- **The ratios of sections 99, 104 and 106:** each fill's chain against today's page with round 31's mask (`fullUnbound`),
  as they were measured.
  - Section 106's "with the listed tile fill" is `halfUnbound` and `temporalUnbound`. That is the listed tile fill with
    round 31's coverage, which was `half` before this round.
- **Section 103's line:** the default fill by name, and the default chain against the default page. Both are bounded now,
  and the line names the coverage as well as the fill.
- **Section 107's line:** today's page "with it" (`full`), and the chain "with it" on the default fill (`half`). That is the
  sum section 107 defined.
- Sections 105 and 111 read committed reports, whose keys are as they were.
- The pilot-size row checks each line's figure against the sum it names.

**The rows that hold the change (the gate's sections 3 and 4):**
1. **`coverage()` with nothing asked is the bounded coverage.** On the four scenes at both sizes and on the light behind the
   camera, it has the same `traced` and the same bits as `{ bound: true }`. `{ bound: false }` traces 0, as round 31's
   kernel counts nothing, and is round 31's.
2. **At the pilot size:**
   - `full` is the network at W x H plus `covFullB`;
   - `half` is the network at w x h, `covHalfB`, `covFullB`, `fillLTile` and the rest, and `temporal` that plus the four
     history passes;
   - `fullUnbound`, `halfUnbound` and `temporalUnbound` are the same with `covHalf` and `covFull`;
   - `coverage` is `"bound"`, `fill` is `"listedTile"`, and the table has 26 rows.
3. **The rig lines**, made from the pilot's report, each carry the figure of the sum named above.

**Sabotages, by the byte-safe runner (L1-L7):**
- `coverage()`'s default back to round 31's;
- `{ bound: false }` running the bounded kernel;
- `full` summing `covFull`;
- `half` summing `covHalf`;
- `fullUnbound` summing `covFullB`;
- the page without round 31's mask's page row;
- section 93's line made from `full`.
Each must turn at least one row red. A sabotage that goes 0 red is a finding to fix before the round is committed.

**The rule.** The round holds when rows 1-3 pass on SwiftShader and every gate the branch runs stays as green as it was.
No rig run is owed: the kernel and every timed step are round 39's, measured on both GPUs in section 111.

**Nothing else changes:** the fill (section 112's), the network, every kernel table, the kernels themselves, and `fx/fsr`.
With this round both of `denoise-halfres-fixed-costs`'s levers are closed. The Intel's next fixed cost is EASU
(`denoise-easu-cost`).

**Before commit.** Rows 1-3 passed on their first run here. L1-L7 each turned at least one row red and were restored
byte-identical: L1, L3, L4, L5, L6 and L7 one red each.
- **L2, as first written, left the bounded kernel's `traced` buffer unbound.** The device threw before any row could judge
  it. It was red, but not by a row. Redone with the binding whole, it turned 2 rows red: round 39's and this round's, since
  round 31's pass counts nothing.


## 114. ROUND 45 -- r41h's 1080p PASS UNDER A CAP THAT ADMITS IT: SECTION 109's RULE, OWED AGAIN, FIXED BEFORE THE RIG RUNS IT

**Why now.** Section 111: H41 had no verdict. C3 asks for both sets' 1920 x 1080 passes on the device's clock, and the
ladder's 1500 ms cap skipped r41h's in all four readings, because its predicted passes were 2192-2485 ms. A rerun as things
stood could not meet C3. Keith chose the round that lifts the cap for that pass, over closing `denoise-f16-intel` on
section 111's figures.

**What changes, in `render/denoiseDevice.mjs`:**
- **`SET_CAP_MS = { r41h: 4000 }`**, a cap a pass for the sets that need one above the ladder's own. `timingLadder` reads a
  set's cap there and every other set's from `capMs`, as before.
- The default stays `capMs`. So the gate's native ladder, its page ladder and the page's own ladder (`denoise.html`) each
  take r41h's cap with no change of their own.
- **Why 4000.** r41h's largest predicted pass was 2485 ms, so 4000 is 1.6 x over it. That leaves room for run-to-run spread
  on the Intel; section 111's runs differed by up to 12 % at 1024 x 1024. It also stays under the gate's minutes: three
  timed passes and one warmup at about 2.4 s add about 10 s a path.
- **r18u keeps 1500 ms.** It ran its 1920 x 1080 pass in all four of section 111's readings (1121-1181 ms).
- **No other set's cap moves**, and no kernel, table or ladder size changes.

**The rows (the timing gate's arithmetic section, and the device gate):**
1. `SET_CAP_MS` is exactly `{ r41h: 4000 }`, and every set it names is in KERNEL_SETS.
2. On a fixture ladder, a set with a cap of its own is skipped only past that cap, and every other set at `capMs`. A
   prediction between the two runs r41h and skips another set.
3. The gate's "the cap skips only the sizes the last pass predicts past" row reads each set's own cap.

**The rig run.** **On the Intel gen-9: two `realGpuRun --only denoise` runs**, at a commit carrying this section, read by
**section 109's rule unchanged (H41)**:
- C1 every gate green with exit 0;
- C2 K0h on that path in both runs;
- C3 both sets' 1920 x 1080 passes on the device's clock;
- H41 holds on a path when r41h is at least 1.05 x as fast as r18u at 1920 x 1080 in both runs;
- what it buys is section 109's.

**On the GTX 1080 nothing is owed.** r41h needs `shader-f16`, which the 1080 does not offer, so it stands aside by name
whatever its cap. An optional run there checks rounds 43 and 44's defaults (sections 112-113) on hardware, which no rule
reads.

**Predictions (stated so they can miss).** From section 111's ratios, r41h at 0.49-0.61 x r18u at every size it ran, falling
slightly with size:
- **r41h against r18u at 1920 x 1080: 0.45-0.60 x, on both paths, in both runs. H41 fails on both paths**, so r41h is
  kept as a measured negative and `denoise-f16-intel` closes.
- r41h's 1920 x 1080 pass is 1900-2700 ms, under the new cap.
- Every gate is green.

**Sabotages, by the byte-safe runner (M1-M4):**
- `SET_CAP_MS` at 2000, which would still skip it;
- `timingLadder` reading `capMs` for every set;
- the gate's cap row reading `capMs` for every set;
- the cap given to r18u as well.
Each must turn at least one row red.

**Nothing else changes:** every kernel, every table entry, the ladder's sizes, every other set's cap, and `fx/fsr`.

**Before commit.** Rows 1-3 passed here, and the timing gate is green, with no r41h on SwiftShader. Two rows were added before
commit:
- **The mini ladder.** Rows 1 and 2 held the arithmetic and not the ladder's use of it. So a small real ladder now gives r15
  a cap of its own and r12 none, and reads which one ran. Its first spelling made a second `create` call, which round 19's
  one-create row turned red. It now reuses the native ladder's instance.
- **The cap lookup.** M3 (the gate's cap row reading CAP for every set) went 0 red as first written, because no set here
  has a cap of its own. So the lookup is now one function, with a row over section 111's r41h figures.

The sabotages, each restored byte-identical:
- M1, 2 red;
- M2, 1 red (the mini ladder's row);
- M3 redone, 1 red;
- M4, 2 red.

## 115. ROUND 46 -- EASU IN 2 x 2 QUADS, AND FUSED WITH THE COMPOSITE: FIXED BEFORE THE RIG RUNS IT

**The question.** Section 111, by section 110's reading: EASU is at least half of the rest's three passes on the Intel
(30.1 / 25.7 ms at 960 x 540 -> 1920 x 1080), and the composite is the second (22.7 / 17.1). This round is
`denoise-easu-cost`. Each EASU thread loads 12 texels and computes 12 lumas for one output pixel. The composite then reads
EASU's whole W x H buffer back, four floats a pixel, to write three. Does one pass that runs EASU four output pixels a thread
and composites in-register cost the Intel at most 0.8 x the two passes it replaces, with every output bit the same?

**Why a quad shares its loads exactly.** The chain upscales by exactly 2. An output column x maps to
`(x + 0.5) * w / W - 0.5`, which is `x / 2 - 0.25`. So the outputs 2q - 1 and 2q both have base texel q - 1. In f32 the
product and the quotient are exact at these sizes, since every value is a multiple of a quarter below 2^24. Rows do the
same. So the 2 x 2 outputs (2q - 1 .. 2q, 2r - 1 .. 2r) share one base texel and one 12-tap footprint.

**The kernels (`render/denoiseUpscaleGPU.mjs`, from one template, `easuQuadWgsl({ fused })`):**
- **Its text is EASU's own, sliced, never rewritten.** It takes `fx/fsr/fsrKernels.js`'s EASU_WGSL text: its uniform, its
  bindings and its four functions (`ld`, `lum`, `easuSet`, `easuTap`). From its `main` it takes the statements from the edge
  analysis through `let pix = ...;`, verbatim. `fx/fsr` itself does not change.
- **A thread is a quad.** It loads the 12 texels around base (q - 1, r - 1) once and computes their lumas once. Then, for
  each of its four outputs inside the frame, it computes that output's sub-texel offset with EASU's own expression and runs
  the sliced statements. The dispatch is (w + 1) x (h + 1) quads, so the frame's edge columns and rows are covered.
- **`EASU_QUAD_WGSL`** writes `pix` as EASU does: four floats a pixel, alpha 1.
- **`EASU_COMP_WGSL`** composites `pix` instead, with COMPOSITE_WGSL's own `fromT` (sliced from its text) and its own line:
  `emis + (1 - cov) x fromT(min(max(pix, 0), tMax))`. It writes three floats a pixel to the chain's output, and the `up`
  buffer is never written. The transfer still runs first, since it finds tMax.
- **Exact 2 x only.** The host refuses any other ratio by name. The chain's is always 2.
- No default changes in this round. The chain runs EASU and the composite as before.

**Timed (`time()`, one pass each, on rest's clock):** `restEasuQ`, the quad EASU alone, and `restEasuComp`, the fused pass.
The `section 115:` line carries them beside `restEasu` and `restComp`.

**The rows (the gate's sections 3 and 4):**
1. The template's text: the four functions and the sliced statements are EASU_WGSL's byte for byte, and `fromT` is
   COMPOSITE_WGSL's. EASU_WGSL's own text is unchanged (sha256).
2. On the device, on the four scenes and at odd half sizes (an odd w and h leave partial quads):
   - `EASU_QUAD_WGSL`'s buffer is EASU_WGSL's, bit for bit;
   - `EASU_COMP_WGSL`'s output is EASU then the composite, bit for bit;
   - `chain()`'s output is matched by the fused pass, bit for bit.
3. A ratio other than 2 is refused by name.
4. At the pilot size the two new steps are one pass each on rest's clock, each dispatching its own kernel alone, and the
   line carries them.

**The rig run.** The same two `realGpuRun --only denoise` runs on the Intel that section 114 asks for, at a commit carrying
both sections. They serve both rounds. On the 1080 the optional run reports the figures, and no rule reads them.

**The rule (H46), on the Intel gen-9, on the two runs' `section 115:` lines.**
- **C1:** every gate green with exit 0. That includes rows 1-4 on the Intel, so a pass that is not bit for bit there fails
  C1, and the kernel is at fault.
- **C2:** all four steps on the device's clock.
- **H46 holds** when, in both runs, restEasuComp <= 0.8 x (restEasu + restComp).
- **What it buys:**
  - If it holds, the fused pass becomes the chain's EASU and composite, in a round in the shape of rounds 43 and 44.
  - If not, it is kept as a measured negative, and `restEasuQ` against `restEasu` says whether the quads or the fusion
    failed.
- **Reported, deciding nothing:** restEasuQ / restEasu on both GPUs, and the 1080's figures.

**Predictions (stated so they can miss), on the Intel.**
- `restEasuQ` about 0.5-0.8 x `restEasu`. The loads and lumas fall to a quarter, while the arithmetic a pixel stays.
- `restEasuComp` 0.55-0.80 x `restEasu + restComp`. The composite's read of `up` and EASU's write of it go, and the
  composite's `pow`s stay. **H46 holds.**
- Every gate green, the kernels bit for bit on both GPUs.

**Sabotages, by the byte-safe runner (N1-N6):**
- the quad's base texel at q, not q - 1;
- an output's sub-texel offset taken from the quad's base, not its own;
- a quad's fourth output skipped;
- the fused pass compositing with its neighbour's coverage (as first written this was "without the clamp to tMax", which
  cannot go red: EASU's dering clamp keeps every output within its four nearest texels, so the clamp to tMax never binds
  on EASU's output);
- `restEasuComp` timing EASU_QUAD_WGSL;
- a ratio of 3 accepted.

Each must turn at least one row red.

**Nothing else changes:** every default, the network, every table, the fill, the coverage, and `fx/fsr`.

**Before commit.** Rows 1-4 passed here: on SwiftShader both kernels were bit for bit on all six fixtures (0 floats differ in
the buffer, the quad composite and the fused output). Two corrections were made before commit:
- The text row's pattern for the sliced statements first missed their trailing newline.
- The device script first used a template string inside the gate's own template literal.

The sabotages, each restored byte-identical:
- N1, 2 red; N2, 2 red; N3, 1 red; N4 (the neighbour's coverage), 2 red; N5, 1 red; N6, 2 red.
- Row 2 above names N4's change from "without the clamp to tMax", and why.
- Reported, deciding nothing: on SwiftShader at the pilot size the quad EASU took 1.42 ms against EASU's 1.84, and the fused
  pass 2.59 ms against EASU and the composite's 3.10. Those are a CPU's times.


## 116. ROUND 47 -- THE NETWORK AT 16 CHANNELS, ON ROUND 11's SCENES: FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's T1 or T2 has been rendered, and no network of this
round has been trained.

**The question.** Rounds 12-46 made the shipped network cheaper without changing a weight. It is still the chain's largest
cost on both GPUs: on the Intel, r18u at 960 x 540 took 283-306 ms in section 111's runs, against tens of ms for every other
step. `denoise-smaller-network` is the largest single lever, because the hidden layers' arithmetic goes with the square of
their width. It is also the one that reopens the quality question, which is why section 39 kept it out of every kernel
round. Keith chose it for this round.

> **Trained as the shipped network was trained, on the same scenes, does a network of half its width still beat the
> filter on new scenes of both families?**

**One deliberate change from round 11: the hidden layers are 16 channels, not 32 (`size: "w16"`, SHAPE_KERNEL_W16).**
- **What stays:** the same four 3 x 3 layers, the same 9 x 9 receptive field (the window the kernel weighs), and the same
  1 x 1 head of 81 taps. That makes 9,793 parameters with the mask, against 33,329.
- **The cost:** the hidden layers' arithmetic is about a quarter of the shipped network's. Measured here, a training step
  took 236 ms against 832 ms (0.28 x).
- **Everything else is round 11's,** option by option (render/denoiseStudy-selfcheck.mjs holds ROUND47 to ROUND11 except the
  names below):
  - the 192 training scenes (round 7's 96 of R and round 10's 96 of C, the same objects) and its 8 val scenes;
  - 4,500 steps, seeds 1, 2 and 3, Adam at 1e-3, zero-last init, the emitter mask;
  - the filter and its grid, tuned on the 192;
  - the sign-flip test, Holm over {H1, H2}, and C0-C5 with the stop before the tests.
- **H1 is new scenes of R; H2 is new scenes of C,** as in round 11.

**Splits (`SPLITS_R47`):**

| Split | Scenes | Seeds |
|---|---|---|
| train | round 11's 96 of R and 96 of C | 20000-20095 and 30000-30095 |
| val | round 11's 4 of R and 4 of C | 21000-21003 and 31000-31003 |
| T1 -> **H1** | 12 of R | **48000-48011** |
| T2 -> **H2** | 12 of C | **49000-49011** |

Both test ranges are new, and render/denoiseScenes-selfcheck.mjs refuses every test seed without the harvest's flag.

**Secondary (reported, never tested): the 32-channel network beside it** (`compareSize: { size: "large", train: TRAIN_LONG }`).
- This is round 11's network, trained again from nothing on the same scenes with the same schedule and seeds, and
  measured on this round's test images.
- Its statistics against the same filter are reported for both hypotheses. So what the narrowing costs is read on one set
  of images, not across rounds.
- The 1- and 16-sample inputs, val and time are reported, as always.

**What was seen first.**
- Everything in sections 1-115.
- **No pilot.** No network of this width has been trained on these scenes, and none of their figures has been seen. The one
  measurement is the step time above, on random data.
- Round 9 is the nearest evidence. There, round 8's small network (three layers of 16, a 7 x 7 field, 1,500 steps) won 11 of
  12 on held-out R with error 28 % above the large one's. This network has the large one's depth and field and its
  4,500 steps.

**Predictions (stated so they can miss).**
- **C0 and C1 hold** on the training images.
- **H1 supported:** mean d +0.30 to +0.50, against round 11's +0.548 for the large network on its own test set.
- **H2 supported:** mean d +0.40 to +0.70, against round 11's +0.765.
- **The w16 network's error 10-25 % above the large network's** on each family, on this round's own images (the secondary).

**The command:** `node tools/denoiseStudy.mjs --harvest-r47 --cache <dir> --workers 4` -> `render/denoise-results-r47.json`.
- It refuses if the file exists.
- It trains 10 networks: four of w16 (seeds 1-3, and C4's second seed 1), three shuffled-target ones of w16, and three large
  ones.
- It renders 224 scenes, plus the secondary inputs. Expect about 2.5-3 hours on this host and one resume past the
  background limit (sections 24 and 30).

**The outcomes:**
- **H1 and H2 supported:** the narrower network beats one filter on new scenes of both families it was trained on.
  - It goes to the device, in rounds of its own: the export, its kernel sets, the tables and the rig's timing.
  - The secondary's gap to the large network is reported beside it.
- **H1 only, or H2 only, or neither:** it does not go to the device. The large network on the same images says whether the
  narrowing lost what round 11's network had.
- **Not reported:** C0 or C1 fired on the training images, or C4 or C5 fired.

**Sabotages, by the byte-safe runner (O1-O5):**
- ROUND47 training the large network as its primary;
- T1 on round 11's test range (34000);
- SPLITS_R47 left out of the dataset refusal;
- the w16 network's hidden layers at 24 channels;
- the comparison network dropped.

Each must turn at least one row red.

**Nothing else changes:** the shipped network and every page and device path, every kernel table, and `fx/fsr`.

**Before commit.** Every new row passed on its first run here, and the miniature ran the w16 primary with the large network
beside it. O1-O5 each turned 1 row red and were restored byte-identical.

## 117. ROUND 48 -- THE ACCUMULATION's 3 x 3 CLAMP READ FROM A WORKGROUP TILE: FIXED BEFORE THE RIG RUNS IT

**The question.** Rounds 43-46 took the fill, the coverage and the rest in hand. On the Intel the history's four passes are
the chain's other fixed cost: 112.8 and 87.6 ms a frame at 1920 x 1080 in section 111's runs, against about 1.9 ms on the
1080. The accumulation is half of them in both runs (56.5 and 46.1 ms; 0.501 and 0.526). It reads 27 floats of the current
frame a pixel for its 3 x 3 clamp, and an 8 x 8 workgroup's neighbourhoods overlap almost wholly. Does an accumulation that
stages the current frame's 10 x 10 around each workgroup once, and clamps from that, cost the Intel at most 0.8 x
ACCUM_WGSL, with every output bit the same? (`denoise-history-cost`.)

**The kernel, `ACCUM_TILE_WGSL` (`accumTileWgsl()` in render/denoiseUpscaleGPU.mjs).** It is made from ACCUM_WGSL's text by
exactly three replacements (ACCUM_TILE_EDITS). Each must land once, or the generator refuses:
1. a workgroup array of 100 vec3s;
2. at the top of `main`, before its first return: every thread loads its share of the 10 x 10 around its workgroup (the
   pixels outside the frame are never read), then one `workgroupBarrier()`, then the bounds check as before;
3. the clamp's one load line, now reading the tile at the thread's own position plus (dx, dy).

Every other line is the accumulation's own: its reprojection, its taps, its history length and its blend. The clamp takes
min and max over the same nine values, so the result is the same bits.

**What changes elsewhere:**
- `accumulate(..., { tile: true })` runs it; nothing else does, and no chain or default moves.
- `time()` adds `accumT`, one pass on the accumulation's clock, and records the kernel it dispatched, as the rest steps do.
- The chain gate gains a `section 117:` line with `accum` and `accumT`.

**The rows (the gate's sections 2, 4 and 6):**
1. The kernel's text is ACCUM_WGSL with exactly its three edits. Three of ACCUM_WGSL's lines are gone and no other, one
   barrier sits before the first return, and the tile is read twice (the load and the clamp). An edit that does not land
   once is refused.
2. On the device, `accumulate` with the tile matches it without, bit for bit: the light, the history length and the
   composite. That holds clamped and unclamped on round 33's 64 x 64 sequence, and at 61 x 45 with the device's own hits,
   where the right and bottom tiles are partial. The clamp moves values there, so it is exercised.
3. At the pilot size `accumT` is one pass on the accumulation's clock and dispatches its own kernel alone, and the line
   carries both figures.

**The rig run.** The same two `realGpuRun --only denoise` runs on the Intel that sections 114 and 115 ask for, at a commit
carrying all three sections. They serve all three rounds. On the 1080 the optional run reports the figures, and no rule reads
them.

**The rule (H48), on the Intel gen-9, on the two runs' `section 117:` lines.**
- **C1:** every gate green with exit 0, rows 1-3 included on the Intel. So a kernel that is not bit for bit there fails C1,
  and the kernel is at fault.
- **C2:** both steps on the device's clock.
- **H48 holds** when, in both runs, accumT <= 0.8 x accum.
- **What it buys:**
  - If it holds, the tiled accumulation becomes the history's, in a round in the shape of rounds 43 and 44.
  - If not, it is a measured negative. The accumulation's cost is then the reprojected taps and the history's reads, not
    the clamp.

**Predictions (stated so they can miss).**
- **accumT 0.60-0.85 x accum on the Intel.** The clamp's reads are about 27 of a pixel's roughly 70 loads, and the tile costs
  one barrier and about 1.6 loads a pixel. **H48 is predicted to hold, narrowly.**
- On SwiftShader, before this section was written, the tiled pass took 16.6 ms against 6.6 at the pilot size. That is a
  CPU's time, where a barrier is costly, and it decides nothing.
- Every gate green, the kernel bit for bit on both GPUs.

**Sabotages, by the byte-safe runner (P1-P5):**
- the tile's columns loaded one to the right;
- the clamp reading the tile one column left;
- the barrier removed;
- `accumulate({ tile: true })` running the plain kernel;
- the `accumT` step timing the plain kernel.

Each must turn at least one row red, or the section says why it cannot.

**Nothing else changes:** every default, the chain, the network, every table, and `fx/fsr`.

**Before commit.** Rows 1-3 passed here, the kernel bit for bit at both sizes, clamped and not.
- **The sabotages, each restored byte-identical:** P1, 1 red; P2, 1 red; P3, 2 red; P5, 1 red.
- **P5 needed a record.** As drafted, `time()` recorded dispatched kernels for the rest steps alone. So `accumT` now records
  its own, and its row asks for it.
- **P4 went 0 red as first written.** The tiled run that secretly ran the plain kernel matched the plain run bit for bit,
  so nothing could see it. `accumulate` now returns the kernel it dispatched, and the row asks for it. Redone, P4 went red.


## 118. ROUND 47 -- REPORTED: H1 SUPPORTED, H2 SUPPORTED -- THE NETWORK AT 16 CHANNELS STILL BEATS THE FILTER ON BOTH FAMILIES

**What ran.** `node tools/denoiseStudy.mjs --harvest-r47 --cache <scratch> --workers 4` at c912e1ff, the commit carrying
section 116. It ran in one go, 13,423 s, from an empty cache (0 hits, 283 misses), with no resume. The rig's runs for rounds
45, 46 and 48 were not involved. `render/denoise-results-r47.json` was committed at 4e4f99ff as written, before any of it was
read. render/denoiseStudy-selfcheck.mjs section 12c re-derives the verdict from that file with the study's own `verdict()`.
The one input it carries in, not re-derives, is C2: the shuffled-target networks' errors are not kept in the file.

**The controls held, all of them.**
- **C0:** the three w16 networks fit the training images at 0.185, 0.177 and 0.188 x the noisy error (needs <= 0.8).
- **C1, on the training images:** the network beat the noisy input on 192 of 192 and the filter on 189 (needs 176).
- **C2:** the shuffled-target networks lost to the filter on H1's set by a mean d of -1.614 (needs <= 0).
- **C4:** seed 1 trained twice came out bit for bit.
- **C5:** 672 render seeds, all distinct.
- **The filter tuned on the 192 chose round 11's setting exactly:** sS 1, sN 1, sA 0.2, sI 4.

**H1 and H2, by the sign-flip test with Holm (section 116's rule):**

| | Network wins (of 12) | mean d | sign-flip p | (sign test p) | Status |
|---|---|---|---|---|---|
| **H1**, new scenes of R (48000) | 10 | **+0.376** | 0.0012 | (0.019) | **supported** |
| **H2**, new scenes of C (49000) | 11 | **+0.425** | 0.00049 | (0.0032) | **supported** |

Geometric means of relMSE on the test images:

| | noisy | filter | **w16 network**, seeds 1-3 | large network, seeds 1-3 (secondary) | floor |
|---|---|---|---|---|---|
| R (T1) | 0.0299 | 0.0072 | **0.0049** | 0.0044 | 0.00032 |
| C (T2) | 0.0125 | 0.0046 | **0.0030** | 0.0023 | 0.00010 |

**So, by section 116's rule: both supported.**
- The narrower network, trained as the shipped one was on the same scenes, beats the one filter on new scenes of both
  families it was trained on.
- It goes to the device, in the rounds `denoise-w16-device` names: the export, its kernel sets, the tables and the rig's
  timing.
- As section 11's outcome said of round 11, this claims nothing for any family outside R and C.

**What the narrowing costs, on the same images (the secondary, reported and never tested).**
- The 32-channel network, trained again here, won 12 of 12 on both sets: mean d +0.487 on R and +0.685 on C, each sign-flip
  p 0.00024. Round 11's network had +0.548 and +0.765 on its own test sets.
- The w16 network's error over the large one's, as a geometric mean of the seed-mean errors, is **1.117 x on R and 1.297 x on
  C**. On R it gives up a fifth of the large network's lead over the filter. On C it gives up over a third.
- Every other figure is in the file and decides nothing: the w16 network against the filter at 1 sample (0.0136 against
  0.0196 on R, 0.0050 against 0.0115 on C) and at 16 (0.0034 against 0.0043, and 0.0018 against 0.0029), and val
  (0.0043 against 0.0061).

**The predictions, as made.**
- **C0 and C1 hold:** met.
- **H1 +0.30 to +0.50:** met (+0.376). **H2 +0.40 to +0.70:** met (+0.425, near its floor).
- **The w16 error 10-25 % above the large network's:** met on R (11.7 %), **missed on C (29.7 %)**. The narrowing costs C
  more than R, which the prediction did not foresee.

**What this does NOT settle.**
- **Whether the gap matters on screen.** The verdict is against the filter, as every round's has been. The w16 network is
  measurably worse than the shipped one on both families, by the figures above. Whether to ship it in place of the shipped
  network, beside it, or only where the network is the bottleneck (the Intel) is the next round's question, decided before
  its timing is read.
- **The speed itself.** A training step here was 0.28 x the large one's, but no kernel has run it on either GPU. Its hidden
  layers are a quarter of the arithmetic; what the device kernels make of that is for the rig.

**Sabotages, by the byte-safe runner (Q1-Q3):** the verdict read off round 11's file, Q1; the rule's fixture shifted too
little to move it, Q2; and C's gap read as within its prediction, Q3. Each was restored byte-identical: Q1 turned 2 rows red, Q2 1
and Q3 1.

## 119. ROUND 49 -- THE w16 NETWORK EXPORTED, HELD ON THE DEVICE, AND TIMED NATIVELY: FIXED BEFORE THE RIG RUNS IT

**Why now.** Section 118, by section 116's rule: the w16 network beat the filter on both families, so it goes to the device.
Its error is 1.117 x the shipped network's on R and 1.297 x on C. So `denoise-w16-device` first asked which network a device
runs. **Keith chose: the w16 network on the Intel gen-9 only**, where the network is the chain's bottleneck (r18u at
960 x 540 took 283-306 ms in section 111's runs). The shipped network stays wherever it is fast enough: the 1080, about 18 ms.
Following the arc's rule that no table entry moves without the rig's measurement, this round builds, holds and times. The
Intel's entry moves in the round after it, if this one's rule holds.

**One finding first, from round 47's cache.** The 32-channel network section 118 compared against was trained again from
nothing, and its seed 1 has the shipped network's cache key (`net-8f65da8060752453-22465a5eb663642f`). Its 33,329 weights are
the shipped file's, bit for bit. So section 118's comparison network IS the shipped network, not a replica of it, and its
gap figures are against the network the page runs.

**What this round adds:**
- **The export.** `node tools/denoiseDevice.mjs --export-r47 --cache <round 47's cache> --key
  net-8f65da8060752453-5668b0251a72b854` wrote `render/denoise-net-r47-w16.json`, in the same record format as round 11's
  export. It holds the seed-1 w16 network, and the filter its harvest tuned (round 11's setting exactly). It refuses a record
  that is not the w16 shape. Read back, it is the cache's network bit for bit, 9,793 values.
- **On the device (render/denoiseDevice-selfcheck.mjs).** The exported network on r15 and on the round-18 sets the compiler
  builds natively (the Intel's r18u among them). Every hidden layer's cells are explained against conv2dCpu or its fused
  mirror, given the device's own input, and the fused head's image is within APPLY_TOL. That is the key the shipped network
  is held to. A `native K0 for round 49's w16 network` line carries it for the rig.
- **Timed (render/denoiseTiming-selfcheck.mjs).** After the shipped network's native ladder, a second native ladder times
  the w16 network on the same sets with the same cap and budget. `native: w16 against the shipped network on <set> at
  W x H` lines give the shipped network's median over the w16's, on the device's clock, tagged section 119. The page's
  ladder is unchanged: the page's network choice is the next round's.
- **Nothing moves:** every table, the page's network, every kernel and `fx/fsr`.

**Measured here, on SwiftShader, before this section was written:**
- every row green;
- the w16 network on r15, r18t and r18u within 5.8e-7 of the f64 network;
- the w16 network 1.4-2.6 x as fast as the shipped one at 64 x 64 and 128 x 128 (the cap stops a CPU there).

Those are a CPU's times, and they decide nothing.

**The rig run.** **On the Intel gen-9: two `realGpuRun --only denoise` runs** at a commit carrying this section.
- The runs Keith is making now are at 90ebf7f3, before it. They serve rounds 45, 46 and 48, and this round is owed its own.
- On the 1080 the same run is optional and reported.

**The rule (H49), on the Intel gen-9, natively.**
- **C1:** every gate green with exit 0.
- **C2:** the `native K0 for round 49's w16 network` line green on r18u in both runs.
- **C3:** both networks' 1920 x 1080 passes on r18u on the device's clock.
- **H49 holds** when, in both runs, the w16 network on r18u is at least 1.5 x as fast as the shipped network on r18u at
  1920 x 1080.
- **What it buys:**
  - If it holds, the Intel gen-9's entries run the w16 network: a network table beside the kernel tables, the page and the
    native caller each loading it by adapter key, in the next round.
  - If not, the w16 network stays exported and off every table, and the reason is read off the per-layer times.

**Predictions (stated so they can miss).**
- **The w16 network 2.5-3.5 x as fast as the shipped one on r18u at 1920 x 1080 on the Intel.** Its hidden layers are a
  quarter of the arithmetic. The head (81 taps from 16 channels instead of 32) and the kernel apply are a smaller share that
  does not fall as fast.
- **H49 holds.** Every gate green.

**Sabotages, by the byte-safe runner (R1-R4):**
- the device row judging the shipped network;
- the device row dropping r18u;
- the w16 ladder timing the shipped network;
- the w16 ladder leaving out r18u.

Each must turn at least one row red.

**Before commit.** Every row passed here. The sabotages R1-R4 each turned 1 row red and were restored byte-identical. Two of
the rows were widened before the sabotages ran, so that R2 and R4 could be seen:
- the device row asks for r18u wherever the compiler builds it;
- the ladder row asks that its network is the w16 shape and includes r18u wherever the shipped ladder ran it.

## 120. ROUND 50 -- A NETWORK TABLE BESIDE THE KERNEL TABLES, EMPTY UNTIL H49 FILLS IT: FIXED BEFORE ITS CODE

**Why now.** Keith's choice (section 119): the w16 network on the Intel gen-9 only. If H49 holds, the Intel's entries run it.
That needs what the arc has for kernels and not for networks: a table by adapter key that the page and the native caller each
read. This round builds that table empty. **No entry moves here.** Section 119's verdict fills the Intel's two entries by
H49's rule, or leaves them empty. The round measures nothing new, and it is fixed here before its code.

**What changes, in `render/denoiseDevice.mjs`:**
- **`NETWORKS`** names the arc's two exported networks by name: `shipped` is `render/denoise-net-r11.json`, and `w16` is
  `render/denoise-net-r47-w16.json`.
- **`PAGE_NETWORKS_BY_ADAPTER = {}` and `NATIVE_NETWORKS_BY_ADAPTER = {}`**, keyed as the kernel tables are, by
  `pageAdapterKey` and `nativeAdapterKey`. Both are empty this round.
- **`pageNetworkFor(key, table)` and `nativeNetworkFor(key, table)`** return the table's name for the key, else `shipped`.
  An unknown name is refused by name.

**What changes on the page (`denoise.html`):**
- **The page reads its adapter key before it loads a network**, and loads the file `pageNetworkFor` names. With the table
  empty, that is always the shipped network's file, as today.
- **The page says which network it runs**, beside the kernel set it already names.
- **A query parameter, `?net=w16`,** loads the named network whatever the table says. It is for the gates and the rig, so
  the page's own timing ladder can time the w16 network before any entry names it. An unknown name is refused on the page,
  by name.

**What changes in the gates.**
- The timing gate drives the page's ladder a second time with `?net=w16`, on the sets the page tables use. Its
  `page: w16 against the shipped network on <set> at W x H` lines are tagged section 120 and reported beside section 119's
  native ones.
- On the Intel, the rig's runs at a commit carrying this section give H49's page path too. H49's rule stays native, as
  section 119 fixed it, so the page figures are reported and decide nothing until the verdict reads them beside the native
  ones.

**The rows:**
1. `NETWORKS` names exactly the two files. Both tables are empty and frozen. Each function returns `shipped` for every key,
   names a fixture table's entry when it is in it, and refuses an unknown name.
2. The page with no parameter loads the shipped network and says so. With `?net=w16` it loads the w16 file and says so,
   and its denoise image is the w16 network's: section 119's device key on the page. With `?net=nope` it refuses by name.
3. The page's ladder under `?net=w16` times the w16 network. The pass's buffers are the w16 network's size, so the ladder
   cannot secretly time the shipped one.
4. Nothing else moves: every kernel table, every set, the chain, `fx/fsr`.

**Sabotages, by the byte-safe runner (S1-S5):**
- a table shipped with the Intel's entry filled;
- `pageNetworkFor` ignoring its table;
- the page loading the shipped file whatever it is asked;
- `?net=` accepting an unknown name;
- the page ladder timing the shipped network under `?net=w16`.

Each must turn at least one row red.

**The rule.** The round holds when rows 1-4 pass on SwiftShader and every gate stays as green as it was. No rig run is
owed of its own. The Intel runs owed to section 119 serve it if they are made at a commit carrying both sections.

**Before commit.**
- Every row passed on its first run here.
- On the page, the w16 network's image was within 8.9e-7 of its f64 image.
- The page's ladder under `?net=w16` timed it on r15, r18t and r18u, by name and by its 9,793 parameters.
- S1-S5 each turned rows red and were restored byte-identical: S1 2, S2 1, S3 2, S4 2, S5 2.

## 121. ROUNDS 45-50 ON THE INTEL -- NOT REPORTED: THE TIMING GATE DIED IN BOTH RUNS, AND A BUG OF MINE HID THE NATIVE LADDER'S ROWS SINCE ROUND 45

**What arrived.** Two `realGpuRun --only denoise` runs on the Intel gen-9 at d77592b2, which carries sections 114, 115, 117,
119 and 120. They were committed as received at 2a538594: `render/denoise-rig-r49-{a,b}-intel-gen9.json`. **Both were
shown in the session as they were uploaded, before that commit**, so the method's order (commit, then read) was not kept for
either.

**C1 fails in both runs. No rule in sections 114-120 gives a verdict on these runs.**
- **What failed:** the timing gate exited 1 in both runs: `FAIL !! the native ladder ran AbortError`, then a TypeError at
  render/denoiseTiming-selfcheck.mjs:583, reading `rows` of null.
- **What held:** the compile, device and chain gates were green with exit 0 in both.
- **The consequence:** every rule here asks for every gate green with exit 0, so none is read: H41 (section 114), H46
  (115), H48 (117) and H49 (119). Section 120's rows are SwiftShader's and owe no rig reading.

**Two faults, kept apart.**
- **The TypeError is mine: a bracing bug from round 45.**
  - Round 45 put its mini-ladder block between the native ladder's `if (err) ok(...)` and the `else { ... }` that holds the
    ladder's trace row, its paired rows, its report and its clock rows. Round 49 put another block in the same place.
  - That bound the `else` to the new block's condition. On the rig, where the ladder errored, the condition was false: the
    `else` ran with no ladder (`r` null) and threw.
  - **On SwiftShader, where the ladder did not error, the condition was true and the `else` never ran.** From round 45's
    commit (e171b422) to this section, the native ladder's own rows were skipped here, 38 of them, with every gate green.
    Rows that do not run cannot go red. The sabotage rounds since then (M, P, R and S) never touched those rows, so none
    could have seen it.
  - **Fixed here:** the `else` is back on its own `if`, with the later blocks after it. A flag set inside the `else` alone now
    backs a row that goes red whenever the ladder ran and its report did not. T1, a block put back between the `if` and its
    `else` as the two rounds put theirs, turns that row red. On SwiftShader the timing gate now passes 111 rows against
    73, the 38 restored rows among them.
- **The AbortError is the native ladder's own, and not yet explained.**
  - Both runs died about 180-190 s in, near the end of a ladder that took 193 s in section 111's runs.
  - **The leading suspect is round 45's cap.** With r41h allowed up to 4000 ms a pass, its 1920 x 1080 pass (predicted
    2192-2485 ms) runs for the first time. A single GPU submission over about 2 s meets Windows' GPU timeout (TDR), which
    resets the device. A reset device would reject the ladder's next call, which is what an AbortError from node-webgpu
    looks like.
  - **This is a suspicion, not a finding.** The trace file each run names (`swek-denoise-timing-trace-38456.txt` and
    `-47172.txt` under `%TEMP%`) holds the last step before the death, and settles it.

**Reported, deciding nothing (the chain gate was green, and its lines are whole).**

| | run a | run b |
|---|---|---|
| H46: restEasuComp / (restEasu + restComp) | 44.14 / 55.52 = **0.795** | 31.46 / 40.09 = **0.785** |
| ...the quads alone, restEasuQ / restEasu | 35.69 / 31.67 = 1.127 | 25.83 / 24.76 = 1.043 |
| H48: accumT / accum | 34.23 / 59.41 = **0.576** | 22.00 / 43.91 = **0.501** |

- **The fused pass sits just inside H46's 0.8 in both runs.** The quads alone are slower than EASU: the gain is the fusion's,
  not the quads'.
- **The tiled accumulation is well inside H48's 0.8.** That is outside section 117's predicted 0.60-0.85, on the fast side.
- **Section 119's C2 held:** `native K0 for round 49's w16 network on win32/intel/gen-9 ... r15 green; r18t green; r18u
  green`, in both runs.
- None of these is a verdict. The rules ask for a run whose every gate is green.

**What is owed.**
- **The two trace files from these runs**, to name the step the ladder died in.
- **Then, if the trace shows r41h's 1920 x 1080 pass:** the cap that made H41 measurable also makes it unrunnable on this
  GPU, since one submission cannot run that long. Whether to put r41h's cap back under the timeout (H41 then has no verdict
  for good, and `denoise-f16-intel` is closed on section 111's figures), or to time that pass another way, is Keith's call.
  Nothing is changed here until the trace has been read.
- **Then two more Intel runs**, at a commit carrying this section's fix and whatever the trace calls for.

## 122. ROUND 52 -- r41h's CAP PUT BACK UNDER THE GPU's TIMEOUT, AND `denoise-f16-intel` CLOSED AS A MEASURED NEGATIVE

**What the traces showed.** The two runs' timing traces are committed as received at 50945d36:
`render/denoise-rig-r49-a-trace-38456.txt` and `render/denoise-rig-r49-b-trace-47172.txt`, each named by the run whose
report names it. Both stop inside r41h's 1920 x 1080 timing:
- run a after r41h's round 1 began at 175.3 s, the device destroyed at 179.6 s;
- run b in its round 0 at 187.5 s, the device destroyed at 189.7 s.

In both, r18u's 1920 x 1080 round 0 completed first, at about 1.1 s a pass. So the device survived the shipped network's
1080p pass and died inside r41h's, at about 2.4 s a pass. That is the window in which Windows resets a GPU whose one
submission runs too long (TDR, near 2 s). Run a surviving one of r41h's rounds is what a limit that close to the pass's
length allows. **Section 121's suspicion is confirmed as far as the traces can confirm it:** the death is r41h's 1080p pass,
which round 45's 4000 ms cap admitted.

**Keith's decision:** put the cap back, and close `denoise-f16-intel`.
- **`SET_CAP_MS` is empty again.** Every set takes the ladder's 1500 ms cap. The table and `capSkip` stay, held on round 45's
  table as a fixture. A new row holds every entry to at most the ladder's cap, so no set can be given a pass that long
  again.
- **H41 can never meet its C3 on this GPU.** A 1920 x 1080 pass of r41h needs one submission longer than the GPU allows. So
  H41 has no verdict for good.
- **`denoise-f16-intel` closes as a measured negative, by Keith's judgement and not by H41's rule.**
  - What was measured: r41h at 0.49-0.61 x r18u at every size from 64 x 64 to 1024 x 1024, on both paths, in both of
    section 111's runs.
  - K0h held natively and in Chrome, so the f16 kernel was exact on its first hardware.
  - No table entry ever named it.

**What stays owed, unchanged by this section: two Intel runs** at a commit carrying it. Those runs read:
- H46 (section 115) and H48 (section 117), from the chain gate's lines;
- H49 (section 119), natively;
- section 120's page lines, reported.

Section 121's figures are not those runs. Nothing here changes how any of those rules reads.

**Sabotages, by the byte-safe runner (U1-U2):**
- the table given r41h's 4000 ms again;
- the cap lookup ignoring the table it is handed.

Each must turn at least one row red. Both did, 1 row each, restored byte-identical. The timing gate is green here.

## 123. ROUNDS 46, 48 AND 49 -- THE VERDICTS: ALL THREE HOLD ON THE INTEL

**What arrived.** Two `realGpuRun --only denoise` runs on the Intel gen-9 at 7b871372, the commit carrying sections 115, 117,
119, 120 and 122. They were committed as received at 1c31213c, **before either was read**. Every gate was green with exit
0 in both, so C1 holds for every rule here. Section 121's runs at d77592b2 do not count: their timing gate died.
- render/denoiseUpscaleGPU-selfcheck.mjs section 12 re-derives H46 and H48 from the two files.
- render/denoiseDevice-selfcheck.mjs re-derives H49. Each rule has fixtures that move it.

**H46, by section 115's rule: holds, at its edge.** Every step was on the device's clock (C2).

| run | restEasu | restComp | restEasuComp (fused) | fused / both | restEasuQ (quads alone) |
|---|---|---|---|---|---|
| a | 25.64 ms | 15.57 ms | 32.71 ms | **0.794** | 26.02 ms (1.015 x EASU) |
| b | 24.46 ms | 15.00 ms | 31.52 ms | **0.799** | 25.76 ms (1.053 x EASU) |

- **So the fused pass becomes the chain's EASU and composite**, as `denoise-easu-fused-default`, a round in the shape of rounds
  43-44. It saves about 8.5 ms a frame on the Intel at 1080p.
- **The quads alone are no faster than EASU.** The saving is the fusion's, the `up` buffer's write and read, not the shared
  footprint's.
- **Predictions:** the fused pass's 0.55-0.80 was met, at its edge. The quads' 0.5-0.8 x EASU **missed**.

**H48, by section 117's rule: holds.** Both steps were on the device's clock (C2). The tiled accumulation took **0.523 and
0.544 x** the accumulation (22.79 / 43.60 ms and 23.18 / 42.61 ms).
- **So the tiled accumulation becomes the history's**, as `denoise-accum-tile-default`. It saves about 20 ms a frame on the
  Intel.
- **The prediction (0.60-0.85) missed, on the fast side.** The clamp's 27 reads a pixel cost more than their share of the
  pass's loads, and one barrier cost less than predicted.

**H49, by section 119's rule, natively: holds.**
- C2: the w16 network's native K0 was green on r18u in both runs.
- C3: both 1920 x 1080 passes on r18u were on the device's clock. The shipped network took 1455.6 and 1358.4 ms; the w16
  network took 513.2 and 511.5 ms.
- **The w16 network was 2.836 and 2.656 x as fast as the shipped one** on r18u at 1920 x 1080 (needs 1.5 x).
- **So the Intel gen-9's two network entries name it**, as `denoise-w16-intel-entries`: `NATIVE_NETWORKS_BY_ADAPTER` and
  `PAGE_NETWORKS_BY_ADAPTER`, `win32/intel/gen-9` and `Windows/intel/gen-9` to `w16`. Both tables stay empty until that round.
- **The prediction (2.5-3.5 x) was met in both runs.**
- **The page (section 120, reported and deciding nothing):** 2.743 and 2.688 x on r18u at 1920 x 1080 in Chrome. That is the
  same gain on the path the page runs.

**Reported, deciding nothing.** The shipped network's native 1080p pass on r18u (1455.6 ms in run a) is within 50 ms of the
ladder's cap and about 0.5 s of the GPU's timeout. On this GPU the w16 network takes the network well clear of both.

**Sabotages, by the byte-safe runner (V1-V4), each restored byte-identical:**
- H46 at 0.79, not 0.8: 1 red;
- H48's tiled time read off the plain accumulation's figure: 2 red;
- H49 at 3.0 x, not 1.5: 1 red;
- H49 read at section 121's commit: 1 red.

## 124. ROUND 53 -- THE INTEL GEN-9's NETWORK ENTRIES NAME THE w16 NETWORK: FIXED BEFORE ITS CODE

**Why now.** Section 123, by section 119's rule: H49 held natively, at 2.836 and 2.656 x. So the Intel gen-9's two network
entries name the w16 network. This is that round (`denoise-w16-intel-entries`), in the shape of section 67's table rounds. It
measures nothing new, so it has no prediction to miss and no rig run to wait for. It is fixed here before its code.

**What changes, in `render/denoiseDevice.mjs`:**
- `NATIVE_NETWORKS_BY_ADAPTER` is `{ "win32/intel/gen-9": "w16" }`, and `PAGE_NETWORKS_BY_ADAPTER` is
  `{ "Windows/intel/gen-9": "w16" }`. Every other key still runs the shipped network, the 1080's among them.
- `NETWORKS_DECIDED_BY` names section 123 for both entries, as `NATIVE_KERNELS_DECIDED_BY` does for the kernel tables.
- **The native caller** (`tools/denoiseDevice.mjs --which` and the device gate's native-caller row) reads its network by
  `nativeNetworkFor`, as the page reads `pageNetworkFor`, and says which network it ran.

**What changes on the page:** nothing in its code. It already loads by `pageNetworkFor`. On the Intel in Chrome it will now
load the w16 network and say so: "network w16 (the table's for Windows/intel/gen-9)".

**What must not change: the lines the rig's reports carry.** With the Intel's page entry filled, a page ladder there with no
`?net=` would time the w16 network. That would change, with no row red, what every page line on the Intel has meant since
section 37. So every gate drive that measures the shipped network names it:
- the timing gate's first page ladder runs `denoise.html?net=shipped`, the second `?net=w16`, as section 120 has them
  compared;
- the chain gate's page drives (section 93's rig size and the pilot) run `?net=shipped`, so section 93's network figures
  stay the shipped network's.

**The rows:**
1. **The tables.** Each names exactly the Intel's key, with `w16`, decided by section 123. Every other key, the 1080's
   among them, runs the shipped network. Section 123's H49 row now holds the entries to its verdict, not to empty tables.
2. **The native caller** picks the network its key's entry names, prints it, and runs it.
3. **The page with no `?net=`** runs `pageNetworkFor` of its own key. Here that is SwiftShader's, so the shipped network, and
   the row says which key it read. On the rig's Intel the same row reads w16, and the page's image is held to that
   network's f64 image. The rig checks it on that GPU as it goes.
4. **Every gate drive that measures the shipped network asks for it by name,** and the timing gate's page ladders are
   checked by parameter count: the shipped network's 33,329, then the w16's 9,793.

**Sabotages, by the byte-safe runner (W1-W5):**
- the native entry given to the 1080;
- the page entry dropped;
- the native caller ignoring its network table;
- the timing gate's first page ladder without `?net=shipped`;
- the chain gate's page drive without `?net=shipped`.

Each must turn at least one row red.

**The rule.** The round holds when rows 1-4 pass on SwiftShader and every gate stays as green as it was. The next rig run of
the device gate checks row 3 on the Intel.

**Recorded after the code (round 53).** Rows 1-4 passed on SwiftShader on the first run, and the device, timing and chain
gates stayed green. The byte-safe runner turned every sabotage red and restored each file byte for byte:
- W1, the native entry given to the 1080: 2 red;
- W2, the page entry dropped: 2 red;
- W3, the native caller ignoring its network table: 1 red;
- W4, the timing gate's first page ladder without `?net=shipped`: 1 red;
- W5, the chain gate's page drive without `?net=shipped`: 1 red.

The round holds by its rule. `denoise-w16-intel-entries` is closed. Row 3 on the Intel waits on the next rig run of the
device gate.

## 125. ROUND 54 -- THE CHAIN's REST RUNS FUSED BY DEFAULT (`denoise-easu-fused-default`): FIXED BEFORE ITS CODE

Section 123 found H46 holding on the Intel: the quad EASU fused with the composite costs 0.794 and 0.799 of the two passes it
stands in for. Section 115's rule said that, on a hold, the fused pass becomes the chain's. This round makes it so, in the
shape of rounds 43 and 44: the new default, the old path kept as a named reference, and both held bit for bit.

**What changes:**
- `chain()` asked nothing about its rest runs the transfer and then `EASU_COMP_WGSL`, two passes in place of three.
  - `{ rest: "easu" }` runs the three passes as before: the reference.
  - At any ratio other than exactly 2 x, asked nothing, it runs the three passes. The fused pass refuses those ratios
    (round 46), so the fallback stands in for the refusal.
  - `{ rest: "fused" }` at such a ratio is refused by name.
  - The result names the rest that ran (`rest: "fused"` or `"easu"`), because two rests that agree bit for bit cannot
    otherwise say which ran (round 48's P4).
- `time()` gains one step, `restF`: the transfer and the fused pass in one frame, on rest's own clock, its kernels recorded
  (`toT`, `easuC`).
- `timeHalfChain` reports `rest: "fused"`. Its `half` and `temporal` take `restF` in `rest`'s place.
  - `halfTwoPass` and `temporalTwoPass` keep `rest`: they are the defaults of rounds 44-53, and the reference.
  - Every other reference sum (halfRing, halfTile, halfList, halfUnbound and their temporals) keeps `rest`, so each keeps
    the meaning a committed report gave it.
- The page shows the fused rest in the default's place and the three-pass rest with its two chains as a reference. That is
  three rows more, 29 in all.
- The rig's section 103 line names the rest as well as the fill and the coverage. A new section 125 line carries `rest`,
  `restF` and the three-pass chains.

**Rows (the chain gate):**
1. `chain()` asked nothing, on all four scenes, is `{ rest: "easu" }`'s chain bit for bit, says `rest: "fused"`, and every
   emitter pixel is reached. `{ rest: "easu" }` says `"easu"`.
2. On a 13 x 9 -> 39 x 27 frame, `chain()` asked nothing runs the three passes and says so. `{ rest: "fused" }` there is
   refused by name.
3. `restF` is one frame on rest's own clock, dispatching `toT` and `easuC`. `half` and `temporal` are their sums with `restF`,
   and `halfTwoPass` and `temporalTwoPass` the same sums with `rest`.
4. The page shows its 29 rows. The section 103 line names `rest fused`, and the section 125 line carries each figure it names.

**Sabotages, by the byte-safe runner (X1-X6):**
- X1: chain()'s default back to the three passes;
- X2: the result's `rest` always saying "fused";
- X3: the fallback dropped, so a ratio of 3 asked nothing is refused;
- X4: `half` summing `rest`;
- X5: `restF` timing the composite after the fused pass;
- X6: the page without the reference's chain row.

Each must turn at least one row red.

**The prediction.** None of timing. The kernel and its step are round 46's, and section 123 measured them. No rig run is owed.
On SwiftShader `half` falls by about `rest - restF`. That is reported, not asserted: a CPU's figures decide nothing.

**The rule.** The round holds when rows 1-4 pass, every gate stays as green as it was, and each sabotage goes red.

**Recorded after the code (round 54).** Rows 1-4 passed on SwiftShader on the first run, and the chain gate stayed ALL GREEN.
On all four scenes the default chain said "fused" and matched the three-pass chain bit for bit, tMax and all. At 13 x 9 ->
39 x 27 it ran the three passes, and `{ rest: "fused" }` there was refused by name. The pilot's figures, reported and not
asserted: `rest` 1.632 ms, `restF` 1.388 ms, both on the device's clock; the half-size chain fused 183.279 ms against
183.523 ms in three passes.

Every sabotage went red, and the runner restored each file byte for byte:
- X1, chain()'s default back to the three passes: 1 red;
- X2, the result's `rest` always "fused": 2 red;
- X3, the fallback dropped: 1 red;
- X4, `half` summing `rest`: 1 red;
- X5, `restF` timing the composite after the fused pass: 1 red;
- X6, the page without the reference's chain row: 1 red.

X3 needed a change to the gate before it could judge cleanly. As first written, the ratio-3 chain sat bare in the device
script, so X3's throw would have failed the whole drive and no single row would have judged it. The chain now sits in a
try, and its error lands in the ratio-3 row. The round holds by its rule, and `denoise-easu-fused-default` is closed.

## 126. ROUND 55 -- THE HISTORY's ACCUMULATION TILES BY DEFAULT (`denoise-accum-tile-default`): FIXED BEFORE ITS CODE

Section 123 found H48 holding on the Intel: the accumulation with its clamp read from a workgroup tile costs 0.523 and 0.544
of the plain pass. Section 117's rule said that, on a hold, the tiled pass becomes the history's. This round makes it so, in
the shape of rounds 43, 44 and 54.

**What changes:**
- `accumulate()` asked nothing runs `ACCUM_TILE_WGSL` (`tile` defaults to true). `{ tile: false }` runs `ACCUM_WGSL`: the
  reference. The result already names its kernel (round 48), so the default is held to having dispatched `accumT`.
- `timeHalfChain` reports `accumulation: "tiled"`. Its `temporal` takes `accumT` in `accum`'s place.
  - `temporalUntiled` keeps `accum`: the default of round 54, and the reference.
  - Every other history sum (temporalRing, temporalTile, temporalList, temporalUnbound, temporalTwoPass) keeps `accum`, so
    each keeps the meaning a committed report gave it.
- The page's history row shows `accumT` in `accum`'s place. The plain accumulation and its chain with history become a
  reference: two rows more, 31 in all.
- The rig's section 103 line names the accumulation. A new section 126 line carries `accum`, `accumT` and the two chains with
  history.

**Rows (the chain gate):**
1. `accumulate()` asked nothing, clamped and not, on round 33's fixture is `{ tile: false }`'s bit for bit (light, history
   length, composite), and so is the same call at 61 x 45. The kernels run are, in order: the plain reference, then the
   defaults (clamped, unclamped, with the device's own hits), `{ tile: true }`, the plain 61 x 45, and the default 61 x 45.
   That reads `accum, accumT, accumT, accumT, accumT, accum, accumT`.
2. Round 33's rows against accumulateUpscaled now judge the default, so the CPU's tolerances hold for the tiled pass.
3. `temporal` is its sum with `accumT`, and `temporalUntiled` the same with `accum`.
4. The page shows its 31 rows. The section 103 line names `accumulation tiled`, and the section 126 line carries each figure
   it names.

**Sabotages, by the byte-safe runner (Q1-Q6):**
- Q1: accumulate()'s default back to the plain pass;
- Q2: `{ tile: false }` running the tiled kernel;
- Q3: `temporal` summing `accum`;
- Q4: `temporalUntiled` summing `accumT`;
- Q5: the page without the reference's chain row;
- Q6: the section 103 line without the accumulation.

Each must turn at least one row red.

**The prediction.** None of timing. The kernel and its step are round 48's, and section 123 measured them. No rig run is owed.

**The rule.** The round holds when rows 1-4 pass, every gate stays as green as it was, and each sabotage goes red.

**Recorded after the code (round 55).** Rows 1-4 passed on SwiftShader on the first run, and the chain gate stayed ALL GREEN.
The default accumulation matched `{ tile: false }` bit for bit: clamped, unclamped, asked for by name, and at 61 x 45. The clamp
moved 17,362 values, so it was exercised. The kernels ran in the order the rows fixed.

The pilot's figures, reported and not asserted: `accum` 1.950 ms, `accumT` 8.160 ms, both on the device's clock; the chain
with its history 195.271 ms tiled against 189.060 ms untiled. On SwiftShader the tiled pass is the slower one, by about four
times. That is a CPU emulating workgroup memory, and it decides nothing: section 123 measured the Intel at 0.523 and 0.544.
A GPU on which the tile does not pay would show it in the section 126 line.

Every sabotage went red, and the runner restored each file byte for byte:
- Q1, accumulate()'s default back to the plain pass: 1 red;
- Q2, `{ tile: false }` running the tiled kernel: 1 red;
- Q3, `temporal` summing `accum`: 2 red;
- Q4, `temporalUntiled` summing `accumT`: 1 red;
- Q5, the page without the reference's chain row: 1 red;
- Q6, the section 103 line without the accumulation: 1 red.

The round holds by its rule, and `denoise-accum-tile-default` is closed.

## 127. ROUND 56 -- THE ENGINE's OWN GEOMETRY IN FAMILY C's MATERIALS AND LIGHT (`denoise-mesh-other-materials`): FIXED BEFORE ANY OF ITS TEST SCENES EXIST

Committed with the code that implements it. No scene of this round's two test sets has been rendered.

**Why this round.** Section 80 widened the page's scope to the engine's voxel structures and its lathed and extruded solids,
in family R's materials, light and sky, and only those. Ten rounds found the network failing where materials and light
changed, and section 80 changed only the shape. The two have not been crossed. This round crosses them, and asks nothing else.

> **Does the network the device ships beat the filter it ships, on the engine's own geometry in family C's materials and light?**

**Nothing is trained or tuned.** This is section 79's design, and every part of it below is section 79's unless it says so:
- the network is round 11's seed 1, from `render/denoise-net-r11.json` (sha-256 `f1a84d47...`), decoded as the page decodes it;
- the filter is the setting that file names;
- the input is 64 x 64 at 4 samples, with the nine channels and the emitter mask;
- the references are 1024 samples, each with a second one for C3;
- one network, not three seeds' mean.

**The two families, both new, both built from C.** `render/denoiseScenes.mjs`'s families VC and MC take family C's scene for
their own seed, exactly as C draws it:
- the Oren-Nayar ground;
- the two coloured emitters;
- the near-black sky;
- the camera;
- every resting sphere's place, size and material, whether rough-diffuse (`sigma`) or a dielectric reflector
  (`roughness`, `ior`).

Each resting sphere is then replaced by a closed triangle mesh, built exactly as round 25 built it, inside the sphere's
footprint and with the sphere's material:
- VC's meshes are V's voxel structures;
- MC's are M's lathed and extruded solids.

The shapes draw from a stream of their own, so C's draws are C's whatever VC and MC do.
- **So two things differ from the families the network was trained on, and each was varied alone before.** Shape was
  varied in section 79 (V and M, in R's materials). C's materials and light were trained on, in round 11. They have never
  met.
- Every mesh is wound outward, and the emitters stay spheres.
- A dielectric's albedo, like a conductor's, is never read, and the tracer refuses a mesh entry without one, so it is set
  to 0. The gate renders one dielectric mesh at 0 and at 1 and holds the two images equal.
- C's own draws are untouched. Its fingerprint over 40 scenes is still the one recorded before R existed.

**Splits** (`SPLITS_MESH_C`), test sets only:

| Set | Family | Seeds |
|---|---|---|
| T1 -> **H1** | 12 of VC | **50000-50011** |
| T2 -> **H2** | 12 of MC | **51000-51011** |

No earlier split touched these seeds. C5 holds over the round's 72 render seeds.

**The statistic is section 6's, with section 28's test, exactly as section 79 ran it.**
- Per image, `d_i = ln relMSE(filter_i) - ln relMSE(net_i)`. Positive means the network won.
- Each hypothesis is supported iff its mean d over 12 images is > 0 and its exact one-sided sign-flip p is below its Holm
  threshold. Holm-Bonferroni runs over {H1, H2} at family alpha 0.05.

**Controls:** C1-C5 as in section 79.
- **C1:** both methods beat the noisy input on at least 11 of 12 images of each set, or the run is not reported.
- **C2:** cited from round 11 (mean d -1.856, held).
- **C3:** a set is not resolvable if the network is within 2 x of its floor on more than half its images.
- **C4:** the forward pass twice over T1, bit for bit.
- **C5:** the 72 render seeds are distinct.

**What each outcome buys.**
- **H1 and H2 supported:** the page's scope note may say the shipped network also beats the shipped filter on these shapes
  in family C's materials, light and sky as well as R's. It may say nothing about any other material, light or sky.
- **One only:** the note may name that family alone.
- **Neither:** the note stays as section 80 left it, and the crossing is a recorded negative.
- **Not reported or not resolvable:** nothing moves.

**Not in this round: path-tracer.html's own scenes.** The backlog entry named them beside C's materials. They are
diagnostic scenes, not a family of scenes to sample:
- six fixed scenes with no seed;
- scalar albedos;
- sky light and no emitter in four of them;
- a furnace built to render flat, whose 4-sample input may already sit at its reference's floor.

C3 and the guide channels would need their own design for them, so they go to an entry of their own,
`denoise-pathtracer-page-scenes`, rather than into this round's test.

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 holds on both sets.
- **P2 and P3:** H1 and H2 are both supported. The network beat the filter on C's spheres (round 11's H2, mean d 0.765) and
  on R's meshes (section 80), and I expect the crossing to keep the sign of both.
- **P4:** each set's mean d is below C's 0.765, and MC's is below VC's. Section 80 had M (0.304) below V (0.647).
- All four are reported either way.

**Secondary, reported, never tested:** per-image d, each set's noisy error and floor, and time.

**What was seen first.**
- Everything in sections 1-126.
- **The pilot, on seeds 90200-90207, outside every split, with NO network or filter:** brightness, the noisy input against a
  256-sample reference, and time.

| family | mean radiance, median [range] | noisy relMSE vs 256 spp, median [range] | 256 spp, median | triangles, median |
|---|---|---|---|---|
| C | 0.160 [0.015-0.384] | 0.0119 [0.0027-0.1035] | 2.1 s | 0 |
| VC | 0.159 [0.006-0.368] | 0.0206 [0.0012-0.2073] | 7.1 s | 446 |
| MC | 0.163 [0.022-0.393] | 0.0134 [0.0014-0.0874] | 5.5 s | 692 |

  - VC and MC sit where C does, so relMSE's 0.01 offset treats them as it treats C.
  - C is about 2.5 x darker than R (section 79's pilot: 0.393), as round 11 found. So the offset weighs more here than it
    did in section 79, and that holds alike for the filter and the network.
- `render/denoiseScenes-selfcheck.mjs` section 17 holds the families on 60 scenes outside every split. VC and MC are C's
  scene, each mesh carries its sphere's material, a dielectric mesh's albedo is never read, and C's fingerprint is
  unchanged. `render/denoiseStudy-selfcheck.mjs` section 14b runs the shipped pair end to end on four 16 x 16 scenes of
  VC and MC outside every split. It prints no error and no effect, and none was read.
- Nothing of either test set has been rendered.

**The command:** `node tools/denoiseStudy.mjs --harvest-mesh-c --cache <dir>` -> `render/denoise-results-mesh-c.json`.
- It refuses if the file exists.
- It runs here. The file is committed byte for byte before it is read, and section 128 reads it.

## 129. ROUND 57 -- ACTIVATIONS STORED IN HALF PRECISION, ARITHMETIC IN f32 (`denoise-f16-storage`): FIXED BEFORE ITS CODE

**Why this round.** Keith asked for it, with the timing on either GPU or both. The backlog's own arithmetic expects little:
- the hidden layers move about 1 GB a 1024 x 1024 pass on the Intel, about 1.8 GB/s against about 34;
- they move about 2 GB a 1080p frame on the 1080, about 33 GB/s against its 320.

So neither looks bandwidth-bound. Section 122 found f16 ARITHMETIC (r41h) at about half r18u's speed on the Intel. This
round stores in f16 and computes in f32, so it asks whether halving the activations' traffic pays where halving the
arithmetic's precision did not.

**The set, r57p.** It is r18u's kernels exactly, with every hidden activation that passes between two written-out layers
stored as packed f16.
- Each `u32` word holds two channels:
  - `pack2x16float` on the store;
  - `unpack2x16float` on the tile's load;
  - the arithmetic, the weights and the bias stay r18u's f32.
- Layer 0 reads the f32 input, as r18u's does.
- Layers 1-3 read packed f16.
- Layers 0-2 write packed f16.
- Layer 3 writes f32, because r15's fused head (`k_head_apply`) reads it, and the head is unchanged.
- **No feature is needed.** `pack2x16float` and `unpack2x16float` are core WGSL on f32 values, so r57p runs on SwiftShader
  here and on both GPUs, natively and in Chrome. It stands aside under FXC by name with the other untried sets: FXC has not
  been tried on it.

**The exactness key, K0p.** It is K0 with one change: a layer that stores f16 is held to the f32 twin's value rounded to f16.
- **The twin:** `conv2dCpu` (or its fused mirror) over the device's own input, which for layers 1-3 is already f16 values,
  then each cell rounded to the nearest f16, ties to even. A layer that stores f32 is K0's, unchanged.
- **The tolerance:** WGSL lets a conversion to f16 take either of the two nearest values. So a stored cell is explained when
  it is the twin's rounding or the other f16 value bracketing the twin's f32 value. The gate counts the second kind.
  - Measured before this was written, on SwiftShader: `pack2x16float` gave round-to-nearest-even on 1,048,576 values of
    1,048,576, the halfway cases and f16's subnormals among them. So on SwiftShader the count must be zero.
  - On a GPU it is reported, not required.
- The head's image is within `APPLY_TOL` of the twin's head, as K0 asks.
- **The image's bound against the f64 network** is fixed from this box's run before any rig run, as section 109 fixed r41h's
  (`F16S_IMAGE_TOL`). It is the measured worst on the device gate's fixture times 5.7, round 41's margin, and the gate prints
  the measured worst.

**Hypotheses** (timing gate; the rig's two runs; the ladder's sizes; native and page paths):
- **H57:** on the Intel gen-9, r57p is at least 1.05 x as fast as r18u at 1920 x 1080. That must hold on both paths in both
  runs.
- **H57b:** on the GTX 1080, r57p is at least 1.05 x as fast as r18t, the 1080's entry, at 1920 x 1080. That too must hold
  on both paths in both runs. Against r18u, the kernel it is built on, it is reported.

**Conditions**, as section 109's:
- C1: every gate green;
- C2: K0p green natively and in the browser on that GPU;
- C3: the 1920 x 1080 row measured, not skipped, on both paths.

A GPU whose runs miss a condition has no verdict.

**What each outcome buys.**
- **H57 holds:** the Intel's two entries become r57p.
- **H57b holds:** the 1080's two entries become r57p.
- **A hypothesis fails:** that GPU's entries stay as they are, and r57p is a measured negative there.
- No rig run is asked of a GPU Keith does not run. Either GPU alone decides its own entries.

**Predictions, fixed now, deciding nothing.**
- **P1:** K0p holds natively and in the browser on both GPUs. The "other nearest" count is zero on both, because both
  vendors' converters round to nearest even.
- **P2:** H57 fails. r57p runs at 0.95-1.10 x r18u on the Intel, because the arithmetic above says it is not bandwidth-bound,
  and the unpack and pack are extra instructions in a compute-bound loop.
- **P3:** H57b fails. r57p runs below r18t on the 1080, as r18u does (0.657 x, section 67's reading).
- All three are reported either way.

**Sabotages planned (a byte-safe runner, each to go red before the commit):**
- a store packing the wrong half;
- the load reading channel c's word without its half select;
- layer 3 storing f16 for the head;
- the twin not rounding;
- r57p not standing aside under FXC;
- the bound widened tenfold.

## 128. ROUND 56 -- THE VERDICT: NEITHER HOLDS. THE SHIPPED NETWORK DOES NOT BEAT THE SHIPPED FILTER ON THE ENGINE's GEOMETRY IN FAMILY C's MATERIALS AND LIGHT

**What arrived.** `render/denoise-results-mesh-c.json` (sha-256 `4729a0ce...`).
- It was written by `tools/denoiseStudy.mjs --harvest-mesh-c` at debf6207, section 127's commit, and committed byte for
  byte (af3e0eb8) before it was read.
- The shipped file it ran is the one section 127 named (`f1a84d47...`).
- A container restart killed the first run partway. It was restarted at the same commit, from its cache (keyed by the
  commit and the tree's diff), and resumed.
- It took 1,512 s to render, and 15 s to measure.
  - **The time is not a clean figure.** The device and timing gates of round 57 ran beside the second half of the run, so
    this box was shared. Time is secondary and reported; it decides nothing.

**The run is reported. Every control held.**
- **C1:** on VC the network beat the noisy input on 11 of 12 and the filter on 12 of 12. On MC both beat it on 12 of 12.
  VC's 11 is the least C1 allows.
- **C2:** cited from round 11, mean d -1.856, held.
- **C3:** no image of either set within 2 x of its floor, so both sets are resolvable.
- **C4:** the forward pass twice over T1, bit for bit.
- **C5:** 72 distinct render seeds.

| | H1: 12 of VC, voxel structures | H2: 12 of MC, lathed and extruded solids |
|---|---|---|
| mean d | **-0.145** | **0.182** |
| images the network won | 5 of 12 | 9 of 12 |
| sign-flip p (Holm threshold) | 0.684 (0.05) | 0.0364 (0.025) |
| sign test p, reported | 0.806 | 0.073 |
| **status** | **not supported** | **not supported** |

**So the page's scope note stays as section 80 left it, as section 127 fixed.** The crossing is a recorded negative: on
the engine's own geometry in family C's materials, light and sky, the shipped network did not beat the shipped filter.
The note already says nothing of any other material, light or sky, and it says no more now.

**H2 fails on Holm, not on its sign.**
- Its p of 0.036 would have passed alone at 0.05.
- Holm takes the smaller p first, H2's, against 0.025, and 0.036 is above it. So H2 is not supported, and H1 cannot be.
- That is the test section 127 fixed, and it is read as fixed.
- On MC the network won 9 of 12, its losses small (the largest -0.204) and one win large (1.098). What MC shows is a
  lean, not a result.

**H1 turns on one image.**
- **VC's second scene, seed 50001.** The network's error is 0.867, about five times the noisy input's 0.161 and twenty
  times the filter's 0.042: d -3.02. It is the only image of either set on which the network did worse than the input it
  was given.
- **The other eleven** sum to a d of +1.29, but 6 of them are losses, so without that scene H1 still would not hold by
  count (5 of 11 won).
- Nothing measured why it fails there. The scene is reported, and no cause is proposed.

**The predictions.**
- **P1 held:** C1 held on both sets.
- **P2 and P3 FAILED:** neither hypothesis is supported. I expected the crossing to keep the sign of both the network's
  win on C's spheres and its win on R's meshes. On VC it did not, and on MC it did not pass its test.
- **P4 is half wrong.** Both means are below C's 0.765, as predicted. But MC's (0.182) is above VC's (-0.145), not below
  it. Section 80 had M below V, and in C's materials the order turned.

**What it does not change.** No kernel, table, weight or filter changes, and nor does the page's note. A round that trains
on mesh scenes in C's materials would be a later question, pre-registered on its own, and no backlog entry asks for it.

**Recorded after the code (round 57), before any rig run.**
- **K0p held on SwiftShader, natively and in the browser.** On the device gate's fixture every cell of the four storage
  layers matched the f16-rounded twin (12,768 of 12,768 a layer), with no other-nearest cell and none unexplained. The
  head's image is within `APPLY_TOL`. The small network matched every cell too.
- **The bound:** the image's worst against the f64 network is 1.78e-4. That times 5.7 is 1.01e-3, so `F16S_IMAGE_TOL` is
  held at 1e-3. The shipped network's image on the same input is 5.91e-4: within the bound, with less margin. That is
  reported here so a rig run near it is not a surprise.
- **SwiftShader's timing figures, reported and not asserted:** r57p at 1.027 x r18u natively and 0.994 x on the page at
  64 x 64. They are a CPU's figures.

Every sabotage went red, each file restored byte for byte. The plan named six; seven ran. "Layer 3 storing f16 for the
head" became F4 and F7, because that edit throws before any row can judge it.
- F1, the store packing a vec4's halves crossed: 3 red;
- F2, the load without its half select: 3 red;
- F3, the storing twin not rounding: 3 red;
- F4, a packed layer read back as f32: 3 red;
- F5, r57p not standing aside under FXC: 2 red;
- F6, the bound widened tenfold: 1 red;
- F7, r57p left out of the timed sets: 1 red.

**Owed:** `realGpuRun --only denoise`, twice, on either GPU or both (Keith's choice), at the commit carrying this section.
Committed byte for byte before it is read, and section 130 reads it.

## 130. ROUND 57 -- THE VERDICT ON THE INTEL: H57 HAS NO VERDICT. K0p WAS RED NATIVELY, AND THE FIGURES FALL SHORT OF 1.05 ANYWAY

**What arrived.** Two `realGpuRun --only denoise` reports from the Intel gen-9, runs a and b:
- `render/denoise-rig-r57-a-intel-gen9.json` (sha-256 `fe9b2352...`);
- `render/denoise-rig-r57-b-intel-gen9.json` (sha-256 `91a2a675...`).

Both ran at 1ae24f06, the commit carrying section 129. Both were committed byte for byte (5b2651ae) before they were read.
No 1080 run was made, so H57b has no reading.

**The conditions, by section 129's rule.**
- **C3 holds.** Both sets' 1920 x 1080 rows were measured on both paths in both runs, on the device's clock.
- **C1 and C2 fail.** In both runs the device gate was red on one row, K0p natively. The other three gates were green, and
  so was every other row of the device gate, K0p in the browser among them.
- **So H57 has no verdict.** That is the rule's word, and this section does not soften it.

**What K0p's red shows, and what it does not.**
- The two runs gave the same counts to the cell. On the first three storing layers, 3,038, 3,400 and 2,592 cells of
  12,768 a layer were the OTHER f16 value bracketing the f32 cell, not the one nearest to it. The key allows such a cell,
  and counts it. Section 129 predicted none.
- A count near a quarter of the cells is not ties. On this box, rounding every stored value toward zero instead of to
  nearest gives 9,145 such cells over the same three layers of the CPU twin. The rig gave 9,030. So the Intel's native
  `pack2x16float` very likely truncates. That is a reading, not a measurement of the converter.
- **What turned the row red is not in the report.** `realGpuRun` keeps a failing row's first 400 characters, and the row's
  line was cut inside the fourth layer's counts, before the head's figure and the image's. Truncation alone does not
  break the image bound on the CPU: 7.80e-4 against 1e-3. So the cut-off clause is most likely the fourth layer: cells
  unexplained where an f16 input is read. **That cause is not established**, and this section does not name one.
- In the browser, on the same GPU in Chrome, K0p was green in both runs. The browser's conversion therefore matched the
  rule there; how it rounds is not recorded, since a passing row prints no counts.

**The figures, reported because C3 holds.**

| r57p against r18u at 1920 x 1080 | run a | run b |
|---|---|---|
| native | 0.948 x | 1.021 x |
| page | 1.027 x | 1.037 x |

- None reaches H57's 1.05. Even had K0p held, H57 would have failed by its own number.
- Across the ladder, r57p ran 0.98-1.16 x r18u, both paths, both runs. Against r18t (not the Intel's entry) it ran
  1.36-1.81 x, as r18u does.

**The predictions.**
- **P1 FAILED.** K0p was red natively, and the other-nearest count was not zero.
- **P2 is held by its figures and missed by its range once.** I predicted H57 would fail with r57p at 0.95-1.10 x r18u.
  It did not reach 1.05; three of the four 1080p ratios fall in the range, and run a's native 0.948 falls just below it.
- **P3 has no reading.** No 1080 run was made.

**What it changes.** Nothing in the tables: the Intel's entries stay r18u.

**The gate is changed so the next red names its clause.** The native K0p row now also prints, on a line of its own:
- each layer's counts;
- the head's figure;
- the image's figure against the f64 network.

A truncated failing row then still has its reading in the report.

**The rows re-deriving this section** (render/denoiseDevice-selfcheck.mjs) were sabotaged red:
- V1, the rig reports' commit read as another: 1 red. As first written V1 went 0 red. With the device gate red, C1 was
  false whatever the commit, so the row now holds the commit on its own.
- V2, H57's rule without C1 and C2: 1 red.
- V3, H57's bound at 0.94: 2 red.

**Closed by Keith's judgement.** `denoise-f16-storage` closes as a measured negative on the Intel, as section 122 closed
`denoise-f16-intel`. That is his call, not H57's rule, which gave no verdict. No 1080 run is owed: on the 1080, r18u runs at
about 0.66 x r18t (section 67's reading), so r57p would need about 1.6 x r18u there for H57b to hold, and on the Intel it
ran within 5% of r18u. The set, its twin, its rows and its ladder lines stay in the tree, as r41h's did, and no table entry
names it.

## 131. ROUND 58 -- THE SHIPPED PAIR ON path-tracer.html's OWN SIX SCENES (`denoise-pathtracer-page-scenes`): FIXED BEFORE ANY OF ITS TEST IMAGES EXIST

Committed before the code that implements it, which follows in its own commit. No test image of this round has been rendered.

**Why this round.** Section 127 split these scenes off `denoise-mesh-other-materials`, because they are not a family to
sample. They are the path tracer page's validation scenes, each built to show one thing:
- furnace: a grey sphere in a white sky, which must look flat;
- gradient: the same sphere under a sky brightest overhead;
- pair: two spheres, one shadowing the other;
- enclosed: the furnace lit by an emitting shell instead of the sky, which must look identical to the furnace;
- rough: a GGX microfacet sphere in the white furnace, visibly dark;
- roughcomp: the same sphere with energy compensation, which must vanish.

> **On the path tracer page's own scenes, does the network the device ships beat the filter it ships?**

**Nothing is trained or tuned.** The network, the filter, the input, the references and the statistic are section 79's,
except where stated below.

**The scenes: family P.** `render/denoiseScenes.mjs`'s family P draws path-tracer.html's scenes exactly as the page
defines them:
- its `SCENES` object, with RHO 0.18 and roughcomp's table built as the page builds it (`buildTable(0.8, { K: 24, N: 140,
  M: 140 })`);
- its camera: eye (0, 0, 4), looking at the origin, 40 degrees;
- its default depth: 6 bounces, the page's slider default.

The scene is chosen by the seed: seed s draws scene (s mod 6), in the page's order above. The image is 64 x 64, the arc's
size, not the page's 128. The gate holds every scene's literal to path-tracer.html's text, so if the page changes, this
family no longer matches it and the gate says so.

**What is unusual, said before any test image exists.**
- **Six images, one test.** H1 is decided over 6 images, one per scene. The smallest one-sided sign-flip p over 6 is
  1/64 = 0.0156, so H1 can be supported only with nearly every image won. There is one hypothesis, so there is no Holm
  step: its threshold is 0.05.
- **Two of the six are one picture.** The pilot gave furnace and enclosed the same reference to the bit, as the page
  intends. In the test each is rendered on its own render seeds, so their inputs differ but their pictures do not. They
  stay in as two images, because the page shows both. That leaves five independent pictures, and this section says so
  now.
- **Scalar albedos and a rough sphere with no F0** go through `guideBuffers` as they stand: a scalar albedo as three equal
  channels, a microfacet hit with no F0 as 1.
- **Enclosed's camera sits inside its emitter.** The emitter mask runs as on any scene, and nothing is special-cased.

**Splits** (`SPLITS_PAGE`): T1 -> **H1**, 6 of P, seeds **52000-52005**, each scene once. (Corrected before any test
image was rendered: this first said "in order", but seed s draws scene s mod 6, so 52000 draws rough, then roughcomp,
furnace, gradient, pair, enclosed.) No earlier split
touched them. C5 holds over the 18 render seeds.

**H1** is supported iff the mean d over the 6 images is > 0 and the exact one-sided sign-flip p is < 0.05.

**Controls**, section 79's, scaled to 6:
- **C1:** both methods beat the noisy input on at least 5 of 6 images, or the run is not reported.
- **C2:** cited from round 11.
- **C3:** not resolvable if the network is within 2 x of its floor on more than 3 of 6.
- **C4:** the forward pass twice, bit for bit.
- **C5:** distinct render seeds.

**What each outcome buys.**
- **Supported:** the page's scope note may say the shipped network also beats the filter on the path tracer page's own
  six scenes. No more than that: those are six fixed scenes.
- **Not supported:** the note's "the path tracer's own scenes included" stays a statement of what was never shown, now
  with a measured negative under it.
- **Not reported or not resolvable:** nothing moves.

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 holds.
- **P2:** H1 is NOT supported. The network was trained on scenes lit by small visible emitters with an emitter mask that
  marks them. These are sky-lit, flat-shaded validation scenes, and the furnace pair's error is already small at 4
  samples (pilot: 3.8e-3), where the filter's smoothing is hard to beat.
- **P3:** the network's largest wins, if any, are on rough and roughcomp, the pilot's noisiest (relMSE 0.118 and 0.075).
- All three are reported either way.

**What was seen first.**
- Everything in sections 1-130.
- **The pilot, with NO network or filter:** the six scenes at 64 x 64, 8 bounces, with input and reference render seeds
  990801 and 990802, outside every split.

| scene | mean radiance (256 spp) | noisy relMSE vs 256 spp | time |
|---|---|---|---|
| furnace | 0.676 | 3.77e-3 | 0.6 s |
| gradient | 0.421 | 4.87e-2 | 0.7 s |
| pair | 0.429 | 4.13e-2 | 0.8 s |
| enclosed | 0.676 | 3.77e-3 | 0.9 s |
| rough | 0.807 | 1.18e-1 | 0.8 s |
| roughcomp | 1.001 | 7.47e-2 | 0.9 s |

  - Every image was finite.
  - The guide channels carried 0.18, 0.60, 0.35 and 0.70 as albedos, and 1 for the sky and the microfacet spheres.
  - The pilot ran at 8 bounces, the tracer's default. The round runs at 6, the page's.
- Nothing of the test set has been rendered.

**The code, gated before the harvest.**
- `verdict()` takes `c1Min` (11 unless a round says otherwise), and `runShippedStudy` runs the split's own test sets.
- `render/denoiseScenes-selfcheck.mjs` section 18 evaluates path-tracer.html's `SCENES` from the page's text and holds
  family P to it.
- `render/denoiseStudy-selfcheck.mjs` section 14c runs the shipped pair on the six scenes, on seeds outside every split.
- Sabotages D47-D50, R78-R80 and S81 each turned red. R79 needed the miniature's row to ask which C1 judged it.

**The command:** `node tools/denoiseStudy.mjs --harvest-page --cache <dir>` -> `render/denoise-results-page.json`.
- It refuses if the file exists.
- It runs here, in minutes.
- The file is committed byte for byte before it is read, and section 132 reads it.

## 132. ROUND 58 -- THE VERDICT: H1 SUPPORTED. THE SHIPPED NETWORK BEATS THE SHIPPED FILTER ON path-tracer.html's OWN SIX SCENES

**What arrived.** `render/denoise-results-page.json` (sha-256 `a3ac73d1...`). It was written by
`tools/denoiseStudy.mjs --harvest-page` at a32550c1, the commit carrying section 131's code, and committed byte for byte
(b50b3bd9) before it was read. The shipped file it ran is section 79's (`f1a84d47...`). It took 39 s to render and 5 s to
measure.

**The run is reported. Every control held.**
- **C1, at 5 of 6:** the network and the filter each beat the noisy input on 5 of 6. Each lost once, on the furnace.
- **C2:** cited from round 11.
- **C3:** no image within 2 x of its floor.
- **C4:** the forward pass twice, bit for bit.
- **C5:** 18 distinct render seeds.

| scene (seed) | d | noisy | network | filter | floor |
|---|---|---|---|---|---|
| rough (52000) | **0.833** | 1.22e-1 | 4.63e-3 | 1.07e-2 | 9.6e-4 |
| roughcomp (52001) | 0.489 | 7.17e-2 | 3.63e-3 | 5.92e-3 | 5.5e-4 |
| furnace (52002) | -0.012 | 4.87e-3 | 5.20e-3 | 5.14e-3 | 2.9e-5 |
| gradient (52003) | 0.807 | 4.53e-2 | 1.71e-3 | 3.83e-3 | 3.4e-4 |
| pair (52004) | 0.741 | 3.95e-2 | 2.11e-3 | 4.43e-3 | 3.2e-4 |
| enclosed (52005) | 0.021 | 3.87e-3 | 3.49e-3 | 3.57e-3 | 3.3e-5 |

- **H1: mean d 0.480, 5 of 6 won, sign-flip p 0.031 against 0.05: SUPPORTED.**
- The sign test is reported, not tested: p 0.109.

**So the page's scope note widens, as section 131 allowed.** It now says the shipped network beat the filter on the path
tracer page's own six scenes as that page draws them. It names the furnace, where both methods made the input worse, and
it still says nothing of any other material, light or sky.

**What the six say, beyond the verdict.**
- **The wins are on the four scenes that are not flat:** rough, gradient, pair and roughcomp, by about 2-2.3 x in relMSE.
- **The furnace and enclosed are ties.** They are the one picture lit two ways, as section 131 said. On the furnace both
  methods are a hair WORSE than the 4-sample input: the network 5.20e-3 and the filter 5.14e-3 against the input's
  4.87e-3. A flat grey disc in a white sky leaves nothing to denoise, and smoothing it only adds error. The test held,
  but those two images decide nothing.
- So the support rests on four images. With six, the smallest p is 1/64, and this one is 2/64. Section 131 said so before
  any image existed.

**The predictions.**
- **P1 held:** C1 held.
- **P2 FAILED.** I predicted H1 would not hold, because these are sky-lit validation scenes unlike the training families.
  It held, by margins (0.74-0.83 on three scenes) larger than section 80's M.
- **P3 is half right.** The largest win is on rough, as predicted, but roughcomp's (0.489) is only fourth, below gradient
  and pair.

**What it does not change.** No kernel, table, weight or filter changes, only the page's note.

## 133. ROUND 59 -- FSR3's FRAME GENERATION BETWEEN THE CHAIN's FRAMES (`denoise-fsr3-framegen`): FIXED BEFORE ITS CODE AND ITS TEST SCENES

Committed with the code that implements it. No scene of this round's test set has been rendered.

**Why this round.** Keith asked for FSR 1, 2 and 3 completed before FSR4 starts. For three.js scenes, FSR3's frame
generation has run v4736-v4812. On the path tracer's output it has not run. Round 32 (section 96) showed round 30's
half-size chain, accumulated over eight jittered frames, beats both of its arms. This round puts FSR3's generator between
two of that chain's frames:

> **Is a frame generated halfway between two of the chain's frames, along the scene's own motion, closer to a frame really
> traced there than the two cheaper frames that could be shown instead?**

**Nothing is trained or tuned.** The network is round 11's seed 1 (section 79's sha-256). The chain is round 32's
(section 95) exactly, at round 32's size, 256 x 256 (each frame traced at 128 x 128): each frame half size at 4 samples, denoised, filled, EASU to full size, shifted to its unjittered
grid, accumulated with the clamp, the light sources composited once. The generator is the one FSR3 runs on
fsr-three.html, as its defaults stand: `render/frameInterp.mjs`'s `interpolateFrameCPU`, the CPU reference the TSL
generator is held to. In detail:
- a per-pixel field (block 1), indexed by the newer frame;
- nearest-surface depth;
- `fill: { radius: 4, reach: 16, side: "blend" }` (prefer "farther"), `fsrFrameGenTsl.mjs`'s `makeFrameGen` default;
- t = 0.5.

**The sequence, per scene.** It is round 32's camera path: the orbit of FRAMES = 8 frames, arriving at the scene's eye,
each frame jittered by JITTER.
- **O6 and O7** are the chain's outputs after frames 6 and 7, accumulated through them, each composited with the light
  sources at its own eye, on its own unjittered grid. So O7 is round 32's Bt.
- **The midpoint eye** is halfway along the orbit's last step: the same ring and height, at the mean of frames 6's and
  7's angles.
- **The truth** is a full-size reference at 1024 samples from the midpoint eye, unjittered, with a second one for C3.

**The motion field: the scene's own.** It is what an engine hands FSR3, with no optical flow. For each pixel of O7's grid,
the first hit from eye 7 is projected into camera 6, by `reproject`'s own inversion of `pixelRay`. The pixel's vector is
its position in frame 7 less its position in frame 6. A sky pixel's direction is projected the same way, as a point at
infinity. Depth is the distance along camera 7's forward axis, with sky at 1e9.

**The arms, each against the truth:**
- **G**, the candidate: `interpolateFrameCPU({ prev: O6, cur: O7, flow, depthBlock: depth, block: 1, indexedBy: "cur",
  t: 0.5, fill })`.
- **X**: the cross-fade, `crossFadeCPU`, 0.5 O6 + 0.5 O7.
- **R**: repeating the older frame, O6.

**Hypotheses**, with section 6's statistic and section 28's test, Holm over the two at 0.05:
- **H1: G beats X**, `d = ln relMSE(X) - ln relMSE(G)`;
- **H2: G beats R**, `d = ln relMSE(R) - ln relMSE(G)`.

**The split** (`SPLITS_FRAMEGEN`): T1, 6 of R (**53000-53005**) and 6 of C (**54000-54005**), each as its own family. That
is round 32's split shape, on seeds no earlier split touched.

**Controls.**
- **C1, per hypothesis:** both of its arms beat the noisy frame on at least 11 of 12. The noisy frame is the newer frame's
  half-size input, bilinear to full size, shifted and composited (round 32's noisyHalf, at frame 7).
- **C2:** cited from round 11.
- **C3:** G within 2 x of the floor on more than half the images makes that hypothesis not resolvable.
- **C4:** G re-made from the same sequence, bit for bit.
- **C5:** distinct render seeds.

**Secondary, reported, never tested:**
- **Bmid1:** the chain on the midpoint frame alone, traced there (half size, 4 samples, denoised, filled, EASU,
  composited), with no history. It is the cost of not generating.
- G without the fill (its holes left black).
- The holes, and how many pixels the fill reached.
- The field's own check, on the geometry: each pixel's first hit from eye 7 against the hit from eye 6 at the pixel its
  vector points to, against the same pixel unmoved, as mean point distances. It was first written on the images, as O6
  moved along the field against O7. That reads the composited light sources, up to 30 x their surroundings, and a
  one-pixel rounding at a light's edge outweighed every other pixel: moved read WORSE than unmoved on the pilot while
  the geometry said the field was right.

**What each outcome buys.**
- **H1 and H2 supported:** FSR3's arrangement runs on the path tracer's output as it runs on fsr-three.html's. A device
  round, the generator's TSL pass after the chain on denoise.html, is next, then a rig timing round.
- **H2 only:** the generated frame beats showing the old one but not the cross-fade. That is fsrFrameGen-selfcheck's own
  finding on smooth content, now on path-traced frames, and the device round is not owed.
- **Neither, not reported or not resolvable:** recorded as found.

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 holds.
- **P2: H2 is supported.** Repeating O6 is half a step behind the truth, everywhere.
- **P3: H1 is supported, by less than H2.** The orbit's steps are 1.5-4 degrees, a few pixels at 256 x 256. The
  cross-fade doubles every edge by that much, and the generator moves the edge instead. fsr-three.html's margin over the
  cross-fade was +0.15 to +1.00 dB.
- **P4:** Bmid1, the midpoint traced alone, loses to G on most images. One frame's 4 samples without history is round 32's
  B1, which Bt beat on 12 of 12.
- All four are reported either way.

**What was seen first.**
- Everything in sections 1-132.
- **The pilot, on R 990901 and C 990902 outside every split, at 64 x 64 with 64-sample references, NO arm graded against
  them:**
  - every arm was finite;
  - the splat left 206 and 150 holes, and the fill reached all of them;
  - the field moved pixels 2.7 and 2.3 px on average, on orbit steps of 3.6 and 2.4 degrees;
  - moved along it, a pixel's surface point lay 0.048 and 0.019 from the newer frame's, against 0.129 and 0.065 unmoved;
  - an image took 2-3 s to render and 1-1.5 s to make its frames.
- Nothing of the test set has been rendered.

**The code, gated before the harvest.**
- `render/denoiseFrameGen.mjs` is gated by its own `render/denoiseFrameGen-selfcheck.mjs`:
  - the midpoint;
  - `projectTo` inverting `pixelRay`;
  - the field on the geometry;
  - G as `interpolateFrameCPU`'s own frame;
  - X as the cross-fade;
  - FRAMEGEN_FILL as `makeFrameGen`'s default, read off its text;
  - the seeds and the split.
- `render/denoiseStudy-selfcheck.mjs` section 14d covers the round and its command.
- Sabotages FG1-FG7, R84 and R85 each turned red.

**The command:** `node tools/denoiseStudy.mjs --harvest-framegen --cache <dir>` -> `render/denoise-results-framegen.json`.
- It refuses if the file exists.
- It runs here, about as long as round 32's harvest (35 minutes).
- The file is committed byte for byte before it is read, and section 134 reads it.

## 134. ROUND 59 -- NOT REPORTED: C1 FIRED. THE GENERATED FRAME CARRIES THE LIGHT SOURCES ACROSS THEIR SILHOUETTES

**What arrived.** `render/denoise-results-framegen.json` (sha-256 `6e58cb01...`).
- It was written by `--harvest-framegen` at 5f1f344c, the commit carrying section 133's code. It was committed byte for
  byte (1bfe900e) before it was read. The shipped file is section 79's (`f1a84d47...`).
- It took 6,057 s, about 8 minutes an image, against section 133's guess of 35 minutes in all. That guess was round 32's
  time, and this round's sequences cost about four times as much here. Nothing else ran beside it.

**The run is NOT REPORTED.** C1 fired on both hypotheses: the candidate G beat the noisy frame on only 5 of 12, where C1
needs 11. The comparators beat it on 12 (X) and 10 (R). C2-C5 held, and no image was near its floor.

| | H1: G against the cross-fade X | H2: G against repeating O6 |
|---|---|---|
| mean d (reported, decides nothing) | -1.728 | -1.103 |
| images G won | 2 of 12 | 3 of 12 |
| sign-flip p | 0.999 | 0.951 |

By section 133's rule nothing moves. The device round is not owed.

**What G did, measured on the test images after the verdict was fixed: descriptive, not a test.** These figures come from
the harvest's own cached sequences, re-made with the committed code.
- **G puts light where there is none.** In 8 of 12 images, between 79 and 1,293 of G's pixels are brighter than the truth
  by more than 1. On C 54000, the worst, 0.1% of the pixels carry 99% of G's error.
- **The mechanism**, from a pixel on a pilot scene outside the split (R 990923): a sky pixel at a light source's edge,
  where O6, O7 and the truth all read 0.59, comes out of the generator at 15.3.
  - Its vector is the sky's, -7.8 px. The sky moves faster across the screen than the light source in front of it.
  - So the gather's taps, half a vector back in O6 and half forward in O7, land on the light source as it stood in the
    other frame.
  - It is the generator's disocclusion error. Here it is fatal because the frames are linear radiance with light sources
    near 30, so one wrong tap costs about 1,800 in relMSE at that pixel.
  - The cross-fade never samples off its own pixel, so it cannot make this error.
- **It is not only the scale.** Graded in display space instead (round 26's transfer, Reinhard then gamma 2.2), G beats X
  on 4 of 12, is level on a fifth (C 54003), and loses on 7. fsr-three.html's frames were display frames all along, which
  is where its +0.15 to +1.00 dB over the cross-fade was measured.
- **Two checks that this is the generator's doing and not the code's:**
  - The field held on all 12. Moved along it, a pixel's surface point lay 0.004-0.019 from the newer frame's, against
    0.064-0.151 unmoved, on motions of 5-20 px.
  - G is `interpolateFrameCPU`'s own frame, which the round's gate holds bit for bit.
- **The fill is not the cause.** With its holes left black G was worse, not better: by a mean d of 0.248, the fill helped
  on 5 of 12.

**The predictions.**
- **P1 FAILED:** C1 did not hold, on either hypothesis.
- **P2 and P3** have no reading: the run is not reported. Descriptively, both point the other way.
- **P4 HELD, emphatically.** Bmid1, the midpoint traced alone, beat G on 11 of 12, by a mean d of 4.37. A traced frame's
  light sources are where the scene puts them.

**What it says for FSR3 on the path tracer.** The arrangement as fsr-three.html runs it does not carry over unchanged. The
light sources are the problem, and the arc already has the answer for that shape of problem:
- round 30 took the light sources out of the upscale and put them back from the geometry (section 91);
- v4755 composited FSR3's UI at the generated time instead of warping it.

A round that generates between light-free frames, and composites `emitterRadiance` from the geometry at the generated
time, is the next question. It is `denoise-fsr3-framegen`'s next step, pre-registered on its own and not this round.

## 135. THE RIG RUNS AT THE HEAD: THE 1080's OWED DENOISER RUNS, AND FSR 1-3 ON BOTH GPUs -- FIXED BEFORE THEY RUN

**Why.** Keith asked for FSR 1-3 completed at its best before FSR4. Three things are owed a GPU:
- the GTX 1080's native crash (`denoise-1080-native-crash`), never reproduced since section 102;
- the 1080's verdict on round 33's question (`denoise-temporalup-device`), which it has lacked since its run b died;
- one run of every FSR and frame-generation gate on a real GPU at the current head. The rig runs since v4778 have all
  been `--only denoise`.

**The runs, at the branch head, nothing pulled or committed between them:**
- **On the GTX 1080:** two `realGpuRun --only denoise` runs, a and b, each with `SWEK_TIMING_TRACE` naming a trace file of
  its own. Then one full `realGpuRun`, every gate.
- **On the Intel gen-9:** one full `realGpuRun`.

**R1, the crash.** If a 1080 run dies, its trace's last line names the step it died in. The JSON keeps its exit code and
its stderr's end. If neither run dies, "not reproduced" is recorded again with the head's commit.

**H135, round 33's question on the 1080 at today's defaults.** Today's defaults are the listed tile fill, the bounded
coverage, the fused rest and the tiled accumulation, with the shipped network. The question: is the half-size chain with
its history (`temporal`) cheaper than today's page (`full`) at 1920 x 1080?
- It holds when both runs count and the ratio full / temporal, read off each run's section 103 line, is above 1.0 in both.
- A run counts when every gate of `--only denoise` is green with exit 0, at the commit the runs were taken at, and both
  networks' 1080p rows are on the device's clock.
- If H135 holds, round 33's 1080 verdict is given at the head, and `denoise-temporalup-device`'s rig half is done.

**The FSR census, per GPU.** Every gate's kind is read from its source, as `realGpuRun` sorts them:
- **exact** gates must hold. A red exact row is a bug on that GPU, and a finding.
- **quality** rows should hold. A miss of a few hundredths of a dB is the margin; a large one is a finding.
- **timing** gates are the point of the run. Their figures are reported, and the cost-model rows say "NOT ASSERTED" on
  hardware, by v4778's decision.

**Predictions, fixed now, deciding nothing.**
- **P1:** neither 1080 run dies, as in section 102.
- **P2: H135 holds.** Section 98's run a gave 1.405 x at round 33's defaults, and every default since has been faster on
  the device's clock.
- **P3:** every exact gate holds on both GPUs, and any red falls in quality or timing.

**The reports are committed byte for byte before they are read.** Section 137 reads them. Section 136 is round 60's.

## 136. ROUND 60 -- FSR3's GENERATOR BETWEEN LIGHT-FREE FRAMES, THE LIGHT SOURCES PUT BACK AT THE GENERATED TIME: FIXED BEFORE ITS CODE AND ITS TEST SCENES

Committed with the code that implements it. No scene of this round's test set has been rendered.

**Why this round.** Section 134 found FSR3's generator carrying the light sources across their silhouettes. At a light's
edge the gather's taps land on the light as it stood in the other frame, and in linear radiance one such tap costs
~1,800 in relMSE. The arc has met this shape twice and answered it the same way both times:
- round 30 took the light sources out before the upscale and put them back from the geometry (section 91);
- v4755 composited FSR3's UI at the generated time instead of warping it (`fx/fsr/fsrFrameGenUi-selfcheck.mjs`).

This round does that for the generator.

> **Generated between the chain's frames with the light sources taken out, and the light sources put back where the
> geometry puts them at the generated time, is the frame closer to a frame traced there than the cheaper frames made the
> same way?**

**Everything is section 133's except the arrangement:**
- the network and the chain (256 x 256, each frame traced at 128 x 128);
- the sequence and the midpoint eye;
- the scene's own motion field;
- the generator with FRAMEGEN_FILL at t = 0.5;
- the truth, a 1024-sample frame from the midpoint eye, with a second one for C3.

**The arrangement.**
- **L6 and L7** are the chain's accumulations through frames 6 and 7, BEFORE the composite. Their light-source pixels are
  already filled from their neighbours before EASU (round 30's fill), so they hold no light source.
- **E_mid** is `emitterRadiance` from the midpoint eye at full size: the light sources' coverage and emission, from the
  geometry alone. Nothing is traced for it, and it is exact.
- **The three arms, each composited with E_mid the same way:**
  - **G'**, the candidate: `compositeEmitters(interpolateFrameCPU(L6, L7, ...), E_mid)`;
  - **X'**: `compositeEmitters(0.5 L6 + 0.5 L7, E_mid)`, the cross-fade;
  - **R'**: `compositeEmitters(L6, E_mid)`, the older frame held.

  So the arms differ ONLY in how the light-free frame between is made: warped, averaged, or held.

**Hypotheses**, section 6's statistic and section 28's test, Holm over the two at 0.05:
- **H1: G' beats X'**;
- **H2: G' beats R'**.

**The split** (`SPLITS_FRAMEGEN_LF`): 6 of R (**55000-55005**) and 6 of C (**56000-56005**), new seeds.

**Controls:** section 133's, with one change. The noisy frame is the newer frame's half-size input through the chain's
fill, bilinear upscale and shift, composited with E_mid, so it is treated as the arms are. C2-C5 are as before.

**Secondary, reported, never tested:**
- round 59's three arms on these images (G, X, R as shown, each frame's own lights);
- Bmid1;
- G' without its fill;
- the field's check;
- every arm graded in display space too (round 26's transfer), since fsr-three.html's frames were display frames.

**What each outcome buys.**
- **H1 and H2 supported:** FSR3's arrangement, with the light sources composited at the generated time, runs on the path
  tracer's output. The device round (the generator's TSL pass and the composite after the chain on denoise.html) and a
  rig timing round follow.
- **H2 only:** the generated frame beats holding the old one but not the cross-fade, on these motions. The device round
  is not owed.
- **Neither, not reported or not resolvable:** recorded as found. FSR3 on the path tracer is then a measured negative in
  both arrangements.

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 holds.
- **P2: H2 is supported.** Holding L6 is half a step behind everywhere, and the orbit moves pixels 5-20 px here.
- **P3: H1 is supported.** With the lights out, the generator's disocclusion errors are bounded by the scene's own
  radiance. The cross-fade doubles every edge by half the motion, 2.5-10 px.
- **P4:** G' beats round 59's G on every image. The light-source error section 134 measured is gone by construction.
- All four are reported either way.

**The code, gated before the harvest.**
- `frameGenFrames` returns the light-free arms beside round 59's, from the same L6 and L7. Round 59's O6 and O7 are those
  lit with their own eyes' light sources, bit for bit.
- `runFrameGenStudy({ arrangement: "lightFree" })` grades them, and grades every arm in display space as well.
- `render/denoiseFrameGen-selfcheck.mjs` section 5 holds G', X', R' and the noisy frame to their definitions, bit for bit.
- `render/denoiseStudy-selfcheck.mjs` section 14e covers the round and its command.
- Sabotages LF1-LF7 each turned red.
- Round 59's own gate rows and re-derivation are unchanged and green.

**The command:** `node tools/denoiseStudy.mjs --harvest-framegen-lf --cache <dir>` -> `render/denoise-results-framegen-lf.json`.
It refuses if the file exists. It runs here for about 100 minutes, as round 59's did. The file is committed byte for byte
before it is read, and section 138 reads it. Section 137 is kept for the rig reports section 135 asked for.

## 137. SECTION 135's RIG RUNS, READ: NO CRASH, H135 WITHOUT A VERDICT, EVERY EXACT GATE GREEN ON BOTH GPUs

**What arrived.** Six files, all at 0a4e6cbf. Five were committed byte for byte (8e7176ef) before they were read. Two
exceptions: each run's trace was shown to me by its upload before it was committed, so both were seen first.
- `render/denoise-rig-s135-a-gtx1080.json` and `-b-`: the two `--only denoise` runs on the 1080.
- `render/fsr-rig-s135-gtx1080.json` and `render/fsr-rig-s135-intel-gen9.json`: the full runs, 57 gates each.
- `render/denoise-rig-s135-a-trace-gtx1080.txt` and `-b-`: the runs' traces. Run b's came back after the rest.

**R1, the crash: not reproduced again.** No gate in any of the four reports died on a signal or without an exit
status. Both runs' traces walk the native ladder and the w16 ladder to their ends and end "the gate ends, 0 fail(s)".
Neither 1080 run died, nor did the full one. **P1 held.**

**H135: NO VERDICT, by section 135's own rule.**
- A run counts only when every `--only denoise` gate is green with exit 0. In both 1080 runs the device gate was red,
  on one row, K0p natively. So neither run counts.
- The figures, reported and deciding nothing: full / temporal read **1.998 x and 1.984 x**, the chain without its
  history 2.099 x and 2.085 x. The full 1080 run read 1.979 x, the Intel 2.923 x. Had the runs counted, H135 would have held.
- **This is my miss in writing section 135.** Round 57 had already shown K0p red natively on the Intel (section 130),
  and I wrote a counting rule that a red K0p row breaks, without asking whether the 1080 would show the same.
  **P2 has no reading.**

**K0p on the 1080: the same reading as the Intel's, cell for cell.**
- Its first three layers read 3038, 3400 and 2592 cells at the other nearest f16, and the fourth reads 0. No cell is
  unexplained, on either GPU.
- The image against the f64 network is 1.32e-3, against F16S_IMAGE_TOL's 1e-3.
- So the cell key holds on both vendors, and what fails is the image bound. That bound was set for a conversion that
  rounds to nearest.
- Two vendors giving identical counts says this is Direct3D's conversion, not the Intel's. The FSR gates' own probe
  reads "rtz" (toward zero) on both GPUs. Section 130 put it on the Intel; it belongs to the backend.
- `denoise-f16-storage` stays closed (Keith's call). The K0p row will stay red on every Direct3D rig run until its image
  bound follows the probed rule. That needs a derived bound, not 1.32e-3 read off this run. It is Keith's call whether
  to do that.

**The FSR census.** Both GPUs read "exact 20/20, quality 25/26, timing 9/11", the same rows red on each.
- **Exact: every gate held on both GPUs. P3 held.**
- **Quality:** the one red gate is `fsrTemporalHalfQuality`, on its four stall rows.
  - Of 12288 history values, 28 and 18 (1080) and 28 and 17 (Intel) sit outside the truncating stall bound, which
    allows 12.
  - These are the same 28 and 18 that v4778's rig run 13 read on the 1080, now matched on the Intel. They sit on no
    mask flip and touch no half subnormal.
  - The PSNR rows held on both GPUs. The miss is about two and a half times the allowance: a finding, not a margin.
  - It belongs to FSR2's half history, not to this arc. It is logged as `fsr2-half-stall-rig`.
- **Timing:** the device gate (K0p, above) and `snowGpuLive`.
  - snowGpuLive's live loop ran 7 and 3 frames in nine seconds, on adapter "google", a software adapter. Its browser
    did not land on the GPU, as with rig run 13's three gates before PARITY_ARGS.
  - That is the snow stack's launch, and is reported to Keith for `snow-d3d12-readings-from-the-rig`. It is not a GPU's figure.

## 138. ROUND 60 -- NOT REPORTED: C1 FIRED ON H2'S CONTROL. LIT AT THE GENERATED TIME THE GENERATOR LEAVES ITS LIGHT-SOURCE ERROR BEHIND, AND STILL LOSES TO THE CROSS-FADE IN LINEAR RADIANCE

**What arrived.** `render/denoise-results-framegen-lf.json` (sha-256 `8961b8cb...`).
- It was written by `--harvest-framegen-lf` at 3917dac6, the commit carrying section 136's code. It was committed byte
  for byte (4557bc30) before it was read.
- It took 5,158 s. Nothing else ran beside it.

**The run is NOT REPORTED.** C1 fired on H2 alone, and on its CONTROL: the held frame R' beat the noisy frame on 10 of 12,
where both arms need 11. The candidate G' beat the noisy frame on 11 of 12, and so passed its own C1 on both hypotheses.
C2-C5 held.

| | H1: G' against the cross-fade X' | H2: G' against the held frame R' |
|---|---|---|
| mean d (reported, decides nothing) | -0.221 | +0.431 |
| images G' won | 5 of 12 | 9 of 12 |
| sign-flip p (Holm threshold) | 0.890 (0.05) | 0.011 (0.025) |

- **H2 would have been supported**, had its control beaten the noisy frame once more. The rule is the rule, and section
  136 named this outcome "not reported": nothing moves.
- **That C1 can fire on a control arm here is a fault in my design, not in the run.** C1 was written for a denoiser and a
  filter, two methods that both start from the noisy frame. The held frame starts from the older frame, not the noisy
  one, so it has no reason to beat it. Section 136 carried section 133's C1 over without asking that, and it is said here
  so that a later round does not.

**What the light-free arrangement did, reported.**
- **It removed round 59's failure.** G' beat round 59's G on 10 of 12, by a mean d of 6.29. The other two (R 55001 and
  R 55002) are exact ties: no light source is in view there, so the two arrangements make the same frame. Section 134's
  light-source error is gone by construction, as predicted.
- **Against the cross-fade it still loses in linear radiance**, 5 of 12. Its largest losses are C 56004 (-1.48), C 56000
  (-0.87) and R 55001 (-0.85). The cross-fade blurs an edge that moves, and the generator moves the edge, but where it is
  wrong it is wrong by a whole surface.
- **In display space** (round 26's transfer, reported, never tested), G' beats the cross-fade on 8 of 12 by a mean d of
  0.106, and the held frame on 11 of 12 by 0.469. Round 59's shown arrangement there beat the cross-fade on 1 of 12.
- **The midpoint traced alone (Bmid1) beat G' on 10 of 12**, by a mean d of 0.83.
- **The fill helped on 12 of 12**, by a mean d of 1.36.

**The predictions.**
- **P1 FAILED:** C1 fired, on H2's control.
- **P2 and P3** have no reading. Descriptively, P2's sign held and P3's did not.
- **P4 FAILED as written:** "G' beats G on every image." It beat G on 10 and tied on 2. The ties are the two scenes with
  no light source in view, where nothing could differ, and P4 should have said "where a light source is in view".

**What it says.** On the path tracer's output in linear radiance, with the light sources put where the geometry puts them,
FSR3's generator does not beat a cross-fade between two of the chain's frames on orbits of 1.5-4 degrees a frame. It beats
holding the older frame, though the test that would have said so was not reported. Graded as a display shows it, it
edges the cross-fade, which is where fsr-three.html measured it. A round that pre-registers the display-space grading,
with C1 asked of the candidate alone, is the honest next question. It is Keith's call, not this section's, because it
would be chosen after seeing this round's display figures, and a new round on new seeds is the only fair way to ask it.

## 139. ROUND 61 -- THE LIGHT-FREE GENERATOR GRADED AS A DISPLAY SHOWS IT, C1 ASKED OF THE CANDIDATE ALONE: FIXED BEFORE ITS CODE AND ITS TEST SCENES

Committed with the code that implements it. No scene of this round's test set has been rendered.

**Why this round, and what it is not.** Keith asked for it after section 138. Section 138 said two things:
- in display space, round 60's G' beat the cross-fade on 8 of 12 and the held frame on 11 of 12;
- its C1 had been asked of a control that does not start from the noisy frame.

**This round was chosen after seeing those display figures.** So it asks its question on NEW scenes, and round 60's figures
are only the reason it is asked, never its evidence.

> **Graded as a display shows it, is FSR3's generator, between light-free chain frames lit at the generated time, closer
> to a frame traced there than the cross-fade and the held frame made the same way?**

**Everything is section 136's except two things:** the network, the chain, the sequence, the midpoint eye, the field, the
generator, FRAMEGEN_FILL, the light-free arrangement and its three arms (G', X', R'), and the truth.

1. **The grading space.** Every arm, the noisy frame, the truth and the second truth go through round 26's transfer
   (section 81) before relMSE: per channel, t = (x / (1 + x))^(1 / 2.2), Reinhard then gamma 2.2. This is the space
   fsr-three.html's frames were in. relMSE and its 0.01 offset are unchanged; C3's floor is the second truth's, in the
   same space.
2. **C1 asks the candidate alone.** G' must beat the noisy frame (lit at the midpoint, in display space) on at least 11 of
   12. The controls are not asked. A held frame does not start from the noisy frame, so whether it beats it says nothing
   about the run (section 138).

`verdict()` gains `c1Of`: "both" unless a round says "candidate".

**Hypotheses**, section 6's statistic and section 28's test, Holm over the two at 0.05:
- **H1: G' beats X'**;
- **H2: G' beats R'**.

**The split** (`SPLITS_FRAMEGEN_DISPLAY`): 6 of R (**57000-57005**) and 6 of C (**58000-58005**), new seeds.

**Controls:** C1 as above; C2-C5 as section 133's.

**Secondary, reported, never tested:**
- the same arms graded in linear radiance, as rounds 59 and 60 graded them;
- Bmid1 in display space;
- G' without its fill;
- the field's check.

**What each outcome buys.**
- **H1 and H2 supported:** FSR3's arrangement, lit at the generated time, runs on the path tracer's display output. The
  device round (the generator's TSL pass and the composite after the chain on denoise.html) and a rig timing round follow.
- **H2 only:** generating beats holding the older frame, but not the cross-fade. The page could offer the generated frame
  over a held one, and the device round is owed only if Keith asks for that.
- **Neither, not reported or not resolvable:** FSR3 on the path tracer closes as a measured negative in all three
  arrangements.

**Predictions, fixed now, deciding nothing, made knowing round 60's display figures.**
- **P1:** C1 holds. G' beat round 60's noisy frame on 11 of 12 in linear radiance.
- **P2: H2 is supported.** Round 60's display H2 was 11 of 12 at a mean d of 0.469.
- **P3: H1 is NOT supported.** Round 60's display H1 was 8 of 12 at a mean d of only 0.106. That is a lean, and 12 new
  scenes need not keep it at p < 0.025 or 0.05.
- All three are reported either way.

**The code, gated before the harvest.**
- `runFrameGenStudy({ arrangement: "lightFreeDisplay" })` grades in display space through `toDisplay`, which is
  `render/denoiseUpscale.mjs`'s `toPerceptual`, round 26's own. It reports the linear grading beside.
- `verdict()`'s `c1Of` is gated in `render/denoiseStats-selfcheck.mjs` section 9.
- `render/denoiseStudy-selfcheck.mjs` section 14f recomputes the miniature's display tables bit for bit.
- Sabotages DS1-DS6 each turned red.

**The command:** `node tools/denoiseStudy.mjs --harvest-framegen-display --cache <dir>` -> `render/denoise-results-framegen-display.json`.
It refuses if the file exists. About 90 minutes here. Committed byte for byte before it is read; section 140 reads it.

## 140. ROUND 61 -- NOT REPORTED: C1 FIRED ON THE CANDIDATE, 10 OF 12. HAD IT HELD, BOTH HYPOTHESES WOULD HAVE BEEN SUPPORTED

**What arrived.** `render/denoise-results-framegen-display.json` (sha-256 `f3060ab9...`).
- It was written by `--harvest-framegen-display` at 0a4e6cbf, the commit carrying section 139's code. It was committed
  byte for byte (93f5c81c) before it was read.
- It took 4,957 s. Nothing else ran beside it; Keith's rig reports arrived during it and were left unread until it had
  written.

**The run is NOT REPORTED.** C1, asked of the candidate alone, fired: G' beat the noisy frame in display space on 10 of
12, where it needs 11. C2-C5 held, and no image was near its floor.
- The two images it lost are C 58002 and C 58003, both dark C scenes, by 2.25e-3 against 1.94e-3 and 3.35e-3 against
  3.11e-3.
- On both, the cross-fade beat the noisy frame too, and the midpoint traced alone beat everything.

| | H1: G' against the cross-fade X' | H2: G' against the held frame R' |
|---|---|---|
| mean d (reported, decides nothing) | +0.287 | +0.606 |
| images G' won | 7 of 12 | 11 of 12 |
| sign-flip p (Holm threshold) | 0.038 (0.05) | 0.00049 (0.025) |

- **Had C1 held, both would have been supported.** H2's p is far under its threshold. H1's then takes the second threshold,
  0.05, and 0.038 is under it.
- C1 did not hold, and nothing moves.

**The predictions.**
- **P1 FAILED:** C1 fired, by one image.
- **P2 and P3** have no reading. Descriptively, P2's sign held, and P3, that H1 would NOT be supported, would have been wrong.

**Reported beside it.**
- Graded in linear radiance, the same arms gave H1 6 of 12 (mean d -0.116) and H2 11 of 12. Round 60's linear figures
  were 5 of 12 and 9 of 12.
- The midpoint traced alone beat G' on 12 of 12, by a mean d of 0.45.
- The fill helped on 12 of 12, by 2.92.

**What three rounds of FSR3 on the path tracer have found, and where this stops.** Sections 133, 136 and 139 were each
pre-registered before their scenes existed, and each came back not reported, for a different reason:
- round 59's generator carried the light sources across their silhouettes;
- round 60's control could not meet a C1 written for another kind of comparison;
- round 61's candidate missed C1 by one dark scene.

Across rounds 60 and 61, descriptively, the arrangement with the light sources lit at the generated time beats holding the
older frame on 20 of 24 scenes. Graded as a display shows it, it edges the cross-fade.

**No round has passed its own controls, and I do not propose a fourth that relaxes C1 after seeing where this one fell.**
That would be choosing the test by its outcome. The record stands as three not-reported rounds whose descriptive figures
lean one way. Whether FSR3 on the path tracer closes on that, or gets a round of a different kind, is Keith's call.
A different kind would be a larger test set fixed in advance, or a device timing round that asks whether a generated
frame is worth its cost at all.

## 141. K0p's IMAGE BOUND FOLLOWS THE DEVICE'S OWN STORE RULE, AND THE 1080's ROUND-33 RUNS AGAIN: FIXED BEFORE THEY RUN

**Why.** Section 137 found K0p red natively on both rig GPUs, on its image bound alone, with identical cell counts on the two
vendors. Keith asked for the bound fixed and the runs given again.

**What was found, before any change.**
- The CPU twin that converts each stored cell **toward zero** (`f16roundTZ`, brain/conv2d.mjs) lands 1.318e-3 from the
  f64 network on the device gate's fixture. Both GPUs read 1.32e-3.
- Its layers handed to the gate's own judge read 3038, 3400, 2592 and 0 cells at the other nearest. The rig read the same.
- So the rig's devices are the truncating twin, cell for cell on the counts. That can be said of these counts and this fixture;
  it is not shown for every cell value a device can see.

**The change, derived, not read off the run.**
- `F16S_IMAGE_TOL` was the nearest twin's figure × 5.7, held at 1e-3 (section 129).
- `F16S_IMAGE_TOL_RTZ` is the truncating twin's 1.318e-3 × 5.7 = 7.51e-3, held at **7.5e-3**.
- Which bound a device takes is read from its own cells by `f16StoreRule`:
  - **rn** when no cell took the other nearest;
  - **rtz** when every stored cell is the f32 cell (or its fused mirror's) truncated toward zero;
  - **mixed** otherwise, which keeps the round-to-nearest bound.
- A software adapter must still read rn with no other nearest, as before. The cell key (no cell unexplained) and
  k_head_apply's bound are unchanged.
- The gate holds the derivation, the rule on fixtures, and a simulated truncating device (rtz, 1.32e-3, within its bound;
  the same image under the nearest rule refused).
- **This is a change made after a run showed it was needed.** It does not reach back: sections 130 and 137 stand as written,
  read off the reports they read.

**The runs, all at one commit, nothing pulled or committed between them.**
- **On the GTX 1080:** two `realGpuRun --only denoise` runs, a and b, each with its own trace.
- **On the Intel gen-9:** two `realGpuRun --only denoise` runs, a and b.
- These are also round 63's runs (section 143): `--only denoise` carries its gate, so one session on each GPU answers both.
  The cost is that a red in round 63's gate stops a 1080 run counting for H141 too.

**H141, round 33's question on the 1080 again, by section 135's rule unchanged:**
- full / temporal, read off each 1080 run's section 103 line, is above 1.0 in both;
- a run counts when every `--only denoise` gate is green with exit 0, at the runs' commit, with both networks' 1080p rows
  on the device's clock.
- If H141 holds, `denoise-temporalup-device`'s rig half is done.

**R141, the bound on the device.** K0p natively is green on all four runs, and each run's reading names store rule rtz.

**Predictions, fixed now, deciding nothing.**
- **P1:** all four runs read store rule rtz, and the cell counts 3038 / 3400 / 2592 / 0 again.
- **P2:** H141 holds, near section 137's 1.99 x.
- **P3:** neither 1080 run dies.

**The reports are committed byte for byte before they are read.** Section 144 reads them; sections 142 and 143 are the two
FSR3 rounds Keith asked for.

## 142. ROUND 62 -- ROUND 61's ARRANGEMENT ON A TEST SET TWICE ITS SIZE: FIXED BEFORE ITS SCENES EXIST

**Why.** Section 140 left FSR3 on the path tracer with three not-reported rounds and declined to relax C1 after seeing where
round 61 fell. Keith asked for two rounds of a different kind. This is the first: the same test asked of more scenes, every
rule fixed before any of them is rendered. Section 143 is the second, a device timing round.

**What does not change from round 61 (section 139).**
- The arrangement: light-free frames L6 and L7. Every arm is lit with emitterRadiance at the generated time.
- The arms: the generator G', the cross-fade X', the held frame R', the noisy midpoint frame, and the midpoint traced alone.
- The grading is in display space (round 26's transfer) before relMSE, with linear radiance reported beside it.
- The sign-flip test (section 28), with Holm over H1 and H2. C2 is cited from round 54, and C3 is within 2 x of the floor.
- C1 is asked of the candidate alone.
- The frames are 256 x 256, at 4 spp in and 32 spp for the truth.
- The shipped network (r11 seed 1) and the fill: nothing is trained.

**What changes.**
- **The test set: 24 scenes**, 12 of R (seeds 59000-59011) and 12 of C (seeds 60000-60011). None of them has been rendered
  by any round. Section 28's exact sign-flip test enumerates every sign assignment, and 24 is the most it takes; that is why
  24, not more.
- **C1 at 22 of 24**, round 61's 11 of 12 in proportion. It is not relaxed. At this C1, round 61's own 10 of 12 would still
  have fired (20 of 24).

**The hypotheses, as round 61's.**
- **H1:** G' beats the cross-fade X'.
- **H2:** G' beats the held frame R'.

**What is reported beside the verdict, deciding nothing.**
- The figures per family, R and C. Round 61 lost its two C1 images on C.
- Linear radiance's H1 and H2.
- The midpoint traced alone against G'.
- The fill.
- G' against round 59's arrangement.

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 holds. This is the uncertain one: round 61 met 10 of 12, and this needs 22 of 24.
- **P2:** H2 is supported. Round 61 read 11 of 12, p 0.00049.
- **P3:** H1 is supported. Round 61 read 7 of 12, p 0.038, with a mean d of +0.287; twice the scenes at that effect would
  give a smaller p.
- **P4:** if C1 fires, it fires on C, as in round 61.

**The run.** `node tools/denoiseStudy.mjs --harvest-framegen-large`, on this box, detached. It writes
`render/denoise-results-framegen-large.json`, which is committed byte for byte before it is read, at about 10,000 s.
Section 145 is its verdict; section 144 reads section 141's rig runs.

## 143. ROUND 63 -- IS A GENERATED FRAME CHEAP ENOUGH TO BE WORTH IT ON THE DEVICE? FIXED BEFORE ITS CODE

**Why.** Rounds 59-62 ask whether a generated frame looks better than what it replaces. This one asks the other half: what it
costs on a real GPU against tracing the frame. A generated frame that costs as much as a traced one presents nothing extra.
Keith asked for both rounds.

**What is timed, at 1920 x 1080, on each rig GPU.**
- **T, a traced frame:** the half-size chain with its history, as section 103's line reports it ("with its history").
- **G, a generated frame,** in the light-free arrangement of rounds 60-62, is four parts summed:
  1. **the generator:** fx/fsr/fsrFrameGenTsl.mjs's makeFrameGen, as fsr-three.html runs it, with round 59's fill. It is fed
     a real scene's field at 1920 x 1080: eye 7's first hits projected into camera 6, as render/denoiseFrameGen.mjs's
     motionField computes it, on a scene seeded outside every split. It runs in the browser on three.js, on the wall clock
     after the queue drains, median of its passes.
  2. **the field on the device:** a new pass, render/denoiseFrameGenGPU.mjs's MOTION_WGSL. It turns the history's first
     hits at eye 7 (the chain's `hits` pass, already paid for in T) into the generator's motion and depth. It is held to
     motionField on the CPU, then timed.
  3. **the light at the generated time:** the bounded coverage at full size (`covFullB`, section 107's line).
  4. **the composite:** `restComp`, section 110's line.

**H63: G ≤ 0.25 × T on both GPUs, in both of each GPU's runs.**
- At 0.25, generating every other frame presents frames at 2T / (T + G) ≥ 1.6 x the traced rate for the same work.
- A run counts when every `--only denoise` gate is green with exit 0, all runs on one commit. All five figures must be in
  the run's own report.
- The four parts of G come from three clocks: the generator's wall clock, the device clock for MOTION_WGSL where the
  adapter has timestamps, and the device clocks of `covFullB` and `restComp`. A wall clock counts against G, never for it.

**What is reported beside it, deciding nothing.**
- Each part of G on its own.
- The generator's share of G.
- The field's holes at 1920 x 1080.
- G against the chain without its history.

**What this round does not ask.** Whether the generated frame is good enough to show: that is rounds 60-62's question.
Nor what an FSR3 frame costs with an optical flow; round 59's arrangement takes the scene's own field.

**Predictions, fixed now, deciding nothing.**
- **P1:** H63 holds on both GPUs.
- **P2:** G / T is 0.08-0.20 on the 1080 and 0.10-0.30 on the Intel. The 1080 read `covFullB` 1.23 ms and `restComp`
  0.34 ms against T at 37.5 ms (section 137); the generator is the unknown.
- **P3:** the generator is most of G on both GPUs.

**The runs: two `realGpuRun --only denoise` runs on each GPU, section 141's.** They are committed byte for byte before
they are read. Section 146 reads them; section 144 is section 141's rig runs, section 145 round 62's verdict.

## 145. ROUND 62 -- REPORTED: BOTH HYPOTHESES SUPPORTED. ON 24 SCENES THE LIGHT-FREE GENERATOR BEATS THE CROSS-FADE AND THE HELD FRAME, AS A DISPLAY SHOWS THEM

**What arrived.** `render/denoise-results-framegen-large.json` (sha-256 `13c12303...`).
- It was written by `--harvest-framegen-large` at 3d215c83, the commit carrying section 142's code, in 6,678 s.
- It was committed byte for byte (51f7605c) before it was read.
- A first start at b2c9e744 died at once on a missing import, before any scene was rendered. That was fixed at 3d215c83,
  with a gate row.

**The run is REPORTED.**
- **C1 held:** G' beat the noisy frame in display space on 23 of 24, where 22 were needed. The one it lost is C 60008.
- C2 is cited from round 54. C3: no image is near its floor. C4 (determinism) and C5 (distinct seeds) held.

| | H1: G' against the cross-fade X' | H2: G' against the held frame R' |
|---|---|---|
| mean d | +0.178 | +0.570 |
| images G' won | 17 of 24 (R 9 of 12, C 8 of 12) | 19 of 24 (R 10 of 12, C 9 of 12) |
| sign-flip p (Holm threshold) | 0.0479 (0.05) | 0.00007 (0.025) |
| status | **supported** | **supported** |

**The predictions, read as made.**
- **P1 held:** C1 held, 23 of 24.
- **P2 held:** H2 is supported.
- **P3 held:** H1 is supported, by a narrow margin: p 0.0479 against 0.05. Its mean d, +0.178, is smaller than round 61's +0.287.
- **P4 has no reading:** C1 did not fire. The one loss was on C, as P4 expected of a firing.

**What it says, and what it does not.**
- **On these scenes, graded as a display shows them, FSR3's generator between light-free frames, lit at the generated time,
  is the better frame to put between two traced ones.** It beats both a cross-fade and holding the older frame.
- **H1 is narrow, and only in display space.** Graded in linear radiance, G' beats the cross-fade on 12 of 24 (mean d
  -0.168), which is no win. H2 holds in both spaces (linear 19 of 24, mean d +0.425). The pre-registered grading is display
  space (section 139's reason: a display shows Reinhard and gamma, not radiance), and the verdict is in it. The linear figure
  is reported so that nobody reads H1 as more than it is.
- **This is the third round to ask H1 of this arrangement.**
  - Round 60 was not reported (C1 on its control); its display-space H1 read 8 of 12, described.
  - Round 61 was not reported (C1 on the candidate).
  - Round 62 is the first to pass its controls.
  - No round's C1 was relaxed, and round 62's test set was fixed before any of its scenes existed. Even so, a reader
    weighing the arc as a whole should know the question was asked three times.
- **A frame traced at the midpoint is still better.** The midpoint's own half-size frame, traced alone, beat G' on 16 of 24
  (mean d -0.290, the traced frame's way). A generated frame is the cheaper substitute, not the equal.
  Round 63 asks how much cheaper.
- The fill helped on 24 of 24 (mean d +2.82). G' beat round 59's arrangement on 13 of 24 (mean d +0.759).

**What changes.**
- `denoise-fsr3-framegen` keeps its quality answer: on the path tracer, the light-free generator is supported over both
  controls in display space.
- The entry stays open on round 63 (section 143), which asks whether it is cheap enough on the device to be worth it.
- No default moves: nothing ships a generated frame on the path tracer's page until round 63 has read.

## 144. SECTION 141's RIG RUNS, READ: K0p GREEN UNDER ITS STORE RULE, AND H141 HOLDS -- ROUND 33's 1080 VERDICT IS GIVEN

**What arrived.** Eight files, all at 3d215c83, committed byte for byte (0bffdc17) before the JSON was read. The upload
displayed the four traces before that commit.
- `render/denoise-rig-s141-a-gtx1080.json` and `-b-`: the two pre-registered 1080 runs.
- `-a-gtx10802.json` and `-b-gtx10802.json`: a second pair, also on the 1080 (adapter "nvidia pascal"), run after.
- The four traces.
- **No Intel run came back.** Section 141 asked for two Intel runs.

**R1, the crash: not reproduced.** No gate in any of the four reports died; every exit is status 0. Every trace walks both
ladders and ends "the gate ends, 0 fail(s)". **P3 held.**

**R141: K0p natively is green in all four 1080 runs.**
- Each reading names store rule rtz, with 12768 cells truncated on each storing layer.
- The counts are 3038 / 3400 / 2592 / 0 again. The image is 1.32e-3 against the truncating bound of 7.5e-3.
- **P1 held on the 1080**; it has no reading on the Intel.

**H141 HOLDS.** Both pre-registered 1080 runs count: every `--only denoise` gate is green with exit 0, at one commit, with
both networks' 1080p rows on the device's clock.
- full / temporal read **1.973 x and 1.992 x**, both above 1.0.
- The second pair read 1.961 x and 1.961 x, which agrees.
- **P2 held:** near section 137's 1.99 x.

**What this closes.** The half-size chain with its history is cheaper than today's page at 1920 x 1080 on the GTX 1080, as
it was on the Intel (section 98). `denoise-temporalup-device`'s rig half is done: round 33 has its verdict on both GPUs.
`denoise-1080-native-crash` has not been seen since section 101: twelve 1080 runs since, five in section 102, three in
section 137 and four here, and none died.

## 146. ROUND 63 -- H63 FAILS ON THE 1080: A GENERATED FRAME COSTS ABOUT 0.55 OF A TRACED ONE, NOT 0.25

**The runs.** These are section 144's four 1080 reports. The two pre-registered ones count, and so do the second pair.

| run | generator | field | covFullB | restComp | G | T | G / T |
|---|---|---|---|---|---|---|---|
| a | 19.900 | 0.353 | 1.221 | 0.341 | 21.815 | 37.982 | **0.574** |
| b | 18.300 | 0.353 | 1.217 | 0.356 | 20.226 | 38.088 | **0.531** |
| a (second pair) | 18.300 | 0.352 | 1.226 | 0.341 | 20.219 | 37.436 | 0.540 |
| b (second pair) | 18.700 | 0.355 | 1.218 | 0.356 | 20.629 | 37.234 | 0.554 |

All figures are ms. The generator is on the wall clock; the other three parts are on the device's clock.

**H63 FAILS.** It asked G ≤ 0.25 T on both GPUs, in both of each GPU's runs. The 1080's two pre-registered runs count and
read 0.574 and 0.531. No Intel run can change that, and none came back.

**The predictions, read as made.**
- **P1 FAILED.**
- **P2 FAILED:** 0.53-0.57 on the 1080, against 0.08-0.20.
- **P3 held:** the generator is 90-91 % of G.

**What it says.**
- **On the 1080 a generated frame costs about half a traced one.** Generating every other frame presents 2T / (T + G)
  ≈ **1.27-1.31 x** the traced rate for the same work, not the 1.6 x H63 asked.
- That is still more frames than tracing alone. It is not the near-doubling FSR3 is used for. And by section 145 the
  generated frame is the worse of the two frames it sits between: the traced midpoint beats it on 16 of 24.
- **The cost is the generator's: 18-20 ms of 20-22.** The field the device computes is 0.35 ms, and the light at the
  generated time with its composite is 1.6 ms.
- The generator is three.js's: fx/fsr/fsrFrameGenTsl.mjs, a chain of full-screen render passes timed on the wall clock.
  The arc's own passes are compute kernels on the device's clock.
- Whether 18 ms is the generator's cost or the way it is driven is not measured here. The field's holes at 1920 x 1080
  were 95,516 of 2,073,600 (4.6 %), which is not a large fill.

**What changes.**
- Nothing ships a generated frame on the path tracer's page.
- `denoise-fsr3-framegen` closes with both halves measured. The quality question is supported (section 145, narrowly
  against the cross-fade). The cost question failed (here).
- A cheaper generator, the same algorithm as compute passes on the device, would be a new entry and its own round.
  It is not proposed here; Keith decides whether it is worth one.

## 147. ROUND 64 -- THE SAME GENERATOR AS COMPUTE PASSES ON THE DEVICE: IS IT CHEAP ENOUGH NOW? FIXED BEFORE ITS CODE

**Why.** Section 146 found a generated frame costs 0.53-0.57 of a traced one on the 1080. Nearly all of that, 18-20 ms of
20-22, is the generator: three.js's chain of full-screen render passes, on the wall clock. Keith asked for a cheaper
generator. This round writes the same algorithm as compute passes, held to the same CPU reference, and asks section 143's
question again.

**The generator, as compute (render/denoiseFrameGenGPU.mjs).** It is render/frameInterp.mjs's interpolateFrameCPU with
fsr-three.html's settings, the ones rounds 59-62 graded: block 1, indexed by the newer frame, t = 0.5, and the fill of
radius 4, reach 16, side blend, the farther neighbour. Four passes:
1. **the depth splat:** each pixel's vector lands where its content is at t; atomicMin keeps the nearest depth there.
2. **the winner:** among the pixels that landed with that depth, atomicMin keeps the first in scan order. This is the CPU's
   tie rule exactly: strictly nearer, and the first writer stays.
3. **the fill:** each hole takes the farthest landed vector within 4 px, else within 16, reading only the splat's own mask,
   as fillHolesCPU's one pass does.
4. **the gather:** each pixel samples the older frame back along its vector and the newer forward, bilinear with clamped
   edges, and blends them at t.

It is held to interpolateFrameCPU on round 63's fixture, fed the device's own field:
- the landed mask the same at all but 1 in 10,000 pixels (a landing at a half-pixel rounds in f32 or f64);
- where the masks agree, every vector bit for bit;
- the frame within 1e-5 relative.

**What is timed, on each rig GPU, at 1920 x 1080.**
- **G₆₄** is the four passes on the device's clock where it has timestamps, plus round 63's field, `covFullB` and `restComp`.
- **T** is section 103's chain with its history, as round 63 read it.
- They are read by readH64, which is readH63 with the generator's line replaced by the compute generator's.

**H64: G₆₄ ≤ 0.25 × T on both GPUs, in both of each GPU's runs.**
- That is H63's threshold, unchanged: at least 1.6 x the traced rate presented.
- A run counts as in section 143: every `--only denoise` gate green with exit 0, at one commit.
- If only one GPU's runs come back, H64 gets no verdict on the other, and none overall unless the GPU that came back fails.

**What is reported beside it, deciding nothing.**
- Each pass's ms.
- The three.js generator's ms in the same run, so the two are compared on one machine at one commit.
- The holes, as round 63 read them.

**Predictions, fixed now, deciding nothing.**
- **P1:** H64 holds on the 1080.
- **P2:** the four passes take under 3 ms on the 1080. They are four full-screen compute passes, against the chain's
  four-pass history at 1.9 ms (section 98), and the fill reads 81 taps a hole on 4.6 % of the frame.
- **P3:** the Intel's G₆₄ / T is within 0.25 as well. Its chain is 10x the 1080's, and passes like these scale with it.

**The runs.** Two `realGpuRun --only denoise` on each GPU, at round 64's commit. They are committed byte for byte before they
are read. Section 149 reads them; section 148 is FSR4's first pre-registration.

## 148. FSR4, ROUND 65 -- A LEARNED UPSCALER IN EASU's PLACE: THE DESIGN, FIXED BEFORE ITS CODE, ITS TRAINING AND ITS SCENES

**Why.** Keith asked for FSR4 once FSR 1-3 were done at their best. They now are:
- FSR1/EASU is the half-size chain's upscale (rounds 26-31), on the device and timed;
- FSR2's temporal history is round 32's, on the device (round 33), its verdict on both GPUs (section 144);
- FSR3's frame generation is measured both ways (sections 145, 146, and round 64 running).

FSR4's step is that the upscale itself is learned. render/learned-preregistration.md (v4689) declined a learned upscaler
because the tree had no trained network on a device. It has one now: the denoiser, through the same conv kernels.

> **On the path tracer's half-size chain, does a small trained network that upscales 2x, guided by full-size albedo, normals
> and depth, bring the frame closer to the reference than EASU does at the same input?**

**What is learned, and what is not.**
- **The network, U** (render/learnedUpscale.mjs), predicts each full-size pixel as a normalised kernel over the 4 x 4
  half-size texels nearest it: KERNEL_TAPS-style, softmax weights, so it cannot add energy that is not in the input.
- U's input per full-size pixel:
  - the half-size denoised frame, bilinearly upsampled;
  - the full-size albedo, normals and depth (guideBuffers at full size, which the coverage pass already traces);
  - the pixel's sub-texel phase.
- Three 3 x 3 conv layers of 16 channels, then the 16-logit kernel head. That is about the shipped denoiser's size, so it
  runs on the same device kernels.
- **The light sources stay out of it,** as round 30 took them out of EASU: fill, upscale, composite at full size.
- **Nothing else changes:** the shipped denoiser at half size, the fill, the composite, all of render/denoiseUpscale.mjs's chain.

**Training, fixed now.**
- Families R and C. Training seeds 61000-61199 (100 R, 100 C) and validation 62000-62019, all new and reserved.
- Each image is the chain's half-size denoised, filled frame of a 256 x 256 scene (128 x 128 at 4 spp). Its target is the
  full-size reference at 32 spp, light-free.
- Loss: relMSE in display space (round 26's transfer), the grading rounds 61-62 used.
- Adam, the denoiser's TRAIN schedule, 3 seeds. The seed with the best validation loss is the candidate, chosen before any
  test scene exists.
- **C2's network:** the same training with targets shuffled across images, as round 11's C2.

**The test.**
- **24 new scenes:** 12 R (63000-63011) and 12 C (64000-64011), 256 x 256, the chain's single frame (round 30's B, no history).
- **H1:** the chain with U in EASU's place beats the chain with EASU.
- **H2:** it beats bilinear in EASU's place, the floor any upscaler must clear.
- The sign-flip test (24 is its limit), Holm over {H1, H2}, graded in display space.
- **C1:** U's chain beats the half-size noisy input upscaled bilinearly on 22 of 24.
- **C2:** the shuffled-target U does not beat EASU (mean d ≤ 0).
- **C3:** no image near its floor. **C4:** the candidate re-made bit for bit on the first image. **C5:** all seeds distinct.
- Reported beside it:
  - each family's figures;
  - linear radiance;
  - U against the full-size page (today's denoiser at full size, the cost T avoids);
  - the train/validation curves.

**What each outcome does.**
- **H1 supported:** U goes to the device as a kernel set beside EASU, and a device round times it against EASU's 0.6 ms on
  the 1080. A learned upscale that costs a full network pass may not be worth it; that is its own question, as round 63 was
  frame generation's.
- **H2 alone:** U learned to upscale but not as well as EASU's hand-written edges, and the backlog records it.
- **Neither:** a measured negative, and FSR4 stops at its first round unless Keith asks for a different design.

**Predictions, fixed now, deciding nothing.**
- **P1:** H2 is supported. Anything trained beats bilinear.
- **P2:** H1 is supported, by a mean d under 0.3. EASU is strong on these scenes' sphere edges, and the guides give U the
  same edges EASU infers.
- **P3:** C1 holds.

**What this section is.** The design, fixed before anything is written. The code, its gate rows, the training harvest and the
test harvest come in that order, each committed before the next runs, as rounds 1-12 did for the denoiser.

## 149. ROUND 64, THE INTEL's HALF -- H64 HOLDS THERE, BY A HAIR; THE 1080's RUNS ARE OWED

**What arrived.** Four `--only denoise` reports, all on the Intel gen-9 and all at df12b982, committed byte for byte
(1f59df80) before they were read.
- `render/denoise-rig-s147-a-intel-gen9.json` and `-b-` are the names section 147's commands give, so they are the
  pre-registered pair.
- `-a-intel-gen91.json` and `-b-intel-gen91.json` are a second pair. Their timestamps put them 35 minutes earlier.
- Every gate is green with exit 0 in all four. No 1080 report came back.

| run | compute generator | field | covFullB | restComp | G₆₄ | T | G₆₄ / T | three.js generator, same run |
|---|---|---|---|---|---|---|---|---|
| a | 57.612 | 10.446 | 23.381 | 16.130 | 107.569 | 433.718 | **0.248** | 180.6 |
| b | 49.881 | 10.719 | 21.953 | 15.487 | 98.040 | 446.970 | **0.219** | 161.9 |
| a (other pair) | 63.139 | 11.636 | 21.595 | 15.208 | 111.578 | 447.224 | 0.249 | 182.4 |
| b (other pair) | 62.138 | 11.009 | 21.202 | 15.051 | 109.400 | 447.809 | 0.244 | 195.4 |

All figures are ms, every part of G₆₄ on the device's clock.

**On the Intel, H64's condition holds in both pre-registered runs (0.248, 0.219), and in the other pair too.**
- **The margin is small:** run a is 0.002 under the threshold.
- **H64 has no verdict yet:** it needs the 1080's two runs.

**What it says so far.**
- **The compute generator is 2.9-3.2 x faster than three.js's on the same machine and run:** 50-63 ms against 162-195.
- **The fill and the gather are most of it** (39-56 ms of 50-63). The clear, the splat and the winner come to 10 ms.
- **P3 held on the Intel:** G₆₄ / T is within 0.25 there.
- **P2 has no reading:** it was the 1080's.
- **15,886 holes stay holes after the fill** at 1920 x 1080 (0.77 %): no landed vector within 16 px. interpolateFrameCPU
  leaves them too; the parity rows hold the two to each other. The generated frame is black there before the light
  composite. Rounds 59-62 graded the same rule at 256 x 256, where none was left.

**The 1080's two runs are owed**, at the same commit, by section 147's commands. Section 149 is completed when they are read.

## 150. ROUND 64 -- H64 HOLDS ON BOTH GPUs: WITH THE GENERATOR AS COMPUTE PASSES, A GENERATED FRAME COSTS 0.11 OF A TRACED ONE ON THE 1080 AND 0.22-0.25 ON THE INTEL

Section 149's second half. Section 148 is FSR4's design and keeps its number.

**What arrived.** Four `--only denoise` reports, all on the GTX 1080 and all at df12b982, committed byte for byte (93bfb8eb)
before they were read.
- `-a-gtx1080` and `-b-gtx1080` are section 147's names, so they are the pre-registered pair.
- `-a-gtx10801` and `-b-gtx10801` are an earlier pair. Every gate is green with exit 0 in all four.

| run | compute generator | field | covFullB | restComp | G₆₄ | T | G₆₄ / T | three.js generator, same run |
|---|---|---|---|---|---|---|---|---|
| a | 2.429 | 0.353 | 1.226 | 0.332 | 4.340 | 38.474 | **0.113** | 18.8 |
| b | 2.378 | 0.353 | 1.231 | 0.357 | 4.319 | 37.453 | **0.115** | 18.2 |
| a (earlier pair) | 2.424 | 0.353 | 1.228 | 0.356 | 4.361 | 37.712 | 0.116 | 17.8 |
| b (earlier pair) | 2.394 | 0.354 | 1.230 | 0.360 | 4.338 | 37.715 | 0.115 | 17.9 |

All figures are ms, every part of G₆₄ on the device's clock.

**H64 HOLDS.** Both GPUs' pre-registered pairs count. G₆₄ / T is 0.113 and 0.115 on the 1080 and 0.248 and 0.219 on the Intel
(section 149), each at or under 0.25. Every other pair agrees.

**The predictions, read as made.**
- **P1 held:** H64 holds on the 1080.
- **P2 held:** the four passes take 2.38-2.43 ms there, under 3. The fill is half of it, the gather a quarter.
- **P3 held:** the Intel is within 0.25, by 0.002 in its run a.

**What it says.**
- **The compute generator is 7.3-7.7 x faster than three.js's on the 1080, and 2.9-3.2 x on the Intel,** for the same
  algorithm, held to the same CPU reference.
- **Generating every other frame presents 2T / (T + G₆₄):**
  - **1.80 x the traced rate on the 1080**, against 1.27-1.31 x with three.js's generator (section 146);
  - 1.60-1.64 x on the Intel.
- **With section 145, both halves of FSR3 on the path tracer are now supported.**
  - Quality: in display space the generator beats the cross-fade (narrowly) and the held frame, on 24 scenes.
  - Cost: it presents 1.6-1.8 x the frames.
- **What section 145 also said still stands:** the traced midpoint is better than the generated one on 16 of 24. Generation
  is the cheaper substitute.
- **15,886 pixels (0.77 %) stay holes at 1920 x 1080,** and are black before the light composite. That is the algorithm's
  rule, the CPU's too, and rounds 59-62 never met it at 256 x 256.

**What changes.**
- `denoise-framegen-compute` is done.
- **Nothing ships by this round alone.** Putting a generated frame on path-tracer.html's page is a page change with its own
  questions: a pacing loop, and the holes past the reach. It is logged as `denoise-framegen-page`, and is Keith's call.

## 151. ROUND 66 -- WHAT A HOLE SHOULD SHOW, AND A FRAME PACER: FIXED BEFORE THEIR CODE AND ROUND 66's SCENES

**Why.** Section 150 left two things between the compute generator and path-tracer.html (`denoise-framegen-page`). Keith
asked for both:
- 0.77 % of a 1920 x 1080 generated frame has no vector within the reach and is black before the light composite;
- nothing yet presents a generated frame between two traced ones at an even rhythm.

### Part A: the holes, as a quality round

**The problem's size, measured before this section.** At 256 x 256 the generator's fill (radius 4, reach 16) leaves no hole
on rounds 59-62's scenes. Its reach is 16 pixels at any size, so the same disocclusion leaves holes at 1080p that it closes
at 256.
- Scaled by 256 / 1920, the fill is **radius 1, reach 2.** On round 63's scene (R 990914) that leaves 0.97 % holes at 256,
  against 0.77 % with the full fill at 1920 x 1080.
- On three more non-dataset scenes it leaves 0.81 %, 5.65 % and 0.60 %.
- So round 66 grades at 256 x 256 with the scaled fill: 1080p's hole geometry at a size a harvest can trace.

**The arms.** The light-free arrangement of rounds 60-62, the scaled generator, and four ways to fill what it leaves. Each
is composited with the light sources at the midpoint, as G' is.
- **Gh, the control:** holes left black, as today.
- **GhX, the first candidate:** holes from the cross-fade of L6 and L7, the frame that is safe where nothing is known.
- **GhC, the second candidate:** holes from L7, the newer frame. A disocclusion under an orbiting camera uncovers content
  the newer frame shows.
- **GhP**, holes from L6: reported only.

**The test.**
- **H1:** GhX beats Gh. **H2:** GhC beats GhX.
- Graded in display space, the sign-flip test, Holm over {H1, H2}.
- **C1**, asked of each hypothesis's candidate: it beats the noisy midpoint frame on 22 of 24.
- C2 is cited from round 54. C3: none near its floor. C4: the candidate re-made bit for bit. C5: the seeds distinct.

**The scenes.** 24 new ones: 12 R (65000-65011) and 12 C (66000-66011), 256 x 256, 4 spp in and 32 for the truth, all reserved.

**Reported beside it.**
- The holes' share per image.
- relMSE on the hole pixels alone, per arm.
- GhX against round 62's full-fill G' on the same scenes. That says what the scaled fill itself costs, which is not the
  question here.

**What each outcome does.**
- H2 supported: the generator fills holes from the newer frame.
- H1 alone: it fills them from the cross-fade.
- Neither: they stay black, and the backlog says so.
- The CPU reference and render/denoiseFrameGenGPU.mjs's gather take the rule together. The gather's parity rows hold them
  to each other, as before.

**Predictions, fixed now, deciding nothing.**
- **P1:** H1 is supported on 24 of 24. Black is the worst answer a hole can have.
- **P2:** H2 is supported, by a mean d under 0.05. The holes are 1 % of a frame.
- **P3:** C1 holds for GhX.

### Part B: the frame pacer -- the tree's own, driven by the path tracer's costs

**A correction before any code ran.** This part first described a new pacer. **The tree already has one:**
render/framePacer.mjs (v4743-v4756), FSR3's, with fx/fsr's gates behind it. It has:
- a display that refreshes at a fixed rate or when told (VRR);
- FSR3's "midpoint" policy, which holds the traced frame half an interval after the generated one, and is the rule written
  here first;
- a generation cost;
- judder, new images a second, and latency (`scheduleCPU`, `scheduleVrrCPU`, `pacingMetrics`).

Writing it here, I overwrote that file. It was restored from git before anything ran, and nothing of mine replaces it. Part B
is therefore no new code.

**What Part B does instead.** It drives the existing pacer with section 150's measured costs. The traced frame is T: 38.0 ms
on the 1080 and 447 ms on the Intel. Generation is G₆₄: 4.34 ms and 98-112 ms. Both use policy "midpoint" against "none".
- **On a 60 Hz display** (`scheduleCPU`, refresh 16.667 ms, pairs "two", which makeFsr3({ hold: 2 }) keeps), and **on a
  variable-refresh display** from 30 to 144 Hz (`scheduleVrrCPU`).
- Over 120 traced frames at a steady T, and with T jittered ±20 % from a fixed seed.

**Its rows, in render/denoiseFrameGenCost-selfcheck.mjs (they read the tree's pacer and assert only what follows from it):**
- On the 1080's costs, "midpoint" shows at least 1.6 x the new images a second "none" does, on both displays.
- Its latency is within T / 2 + G + one refresh of the traced frame's.
- Every present follows the readiness of what it shows: a schedule property the pacer's own gate holds, read here as well.
- The Intel's figures, and the judder of each, are reported and decide nothing.

**Not this round.** Wiring the pacer and the generator into path-tracer.html's own loop. That is the page change
`denoise-framegen-page` names; it follows these two pieces.

## 152. ROUND 66 -- REPORTED: A HOLE SHOULD SHOW THE CROSS-FADE. BLACK LOSES ON EVERY SCENE; THE NEWER FRAME DOES NOT BEAT THE CROSS-FADE

**What arrived.** `render/denoise-results-framegen-holes.json`.
- It was written by `--harvest-framegen-holes` at d3863c27, the commit carrying section 151's code, in 7,064 s.
- It was committed byte for byte (d8c7bf1a) before it was read.

**The run is REPORTED.**
- C1 held for both candidates: GhX and GhC each beat the noisy midpoint frame on 24 of 24.
- C2 is cited, C3 found none near its floor, and C4 (both candidates re-made bit for bit) and C5 held.

| | H1: GhX (cross-fade) against Gh (black) | H2: GhC (newer frame) against GhX |
|---|---|---|
| mean d | **+1.968** (R +2.78, C +1.15) | -0.011 |
| images the candidate won | **24 of 24** | 7 of 24 (R 4, C 3) |
| sign-flip p (Holm threshold) | 6.0e-8 (0.025) | 0.887 (0.05) |
| status | **supported** | **not supported** |

**The predictions, read as made.**
- **P1 held:** H1 is supported on 24 of 24.
- **P2 FAILED:** H2 is not supported. Its mean d is the cross-fade's way, though under P2's 0.05 in size.
- **P3 held:** C1 holds for GhX.

**Reported beside it.**
- **The scaled fill's holes:** 1.45 % of a frame on the mean, 0.48-2.99 % per scene.
- **relMSE on the hole pixels alone, the mean over scenes:**

  | Gh, black | GhX, the cross-fade | GhP, the older frame | GhC, the newer frame |
  |---|---|---|---|
  | 0.859 | 4.97e-4 | 8.06e-4 | 1.32e-3 |

  The cross-fade is the best of the three on the holes themselves. A hole's content is in neither frame for certain, and the
  mean of the two is the safer guess.
- **The older frame against the cross-fade:** the cross-fade is better on 17 of 24, by a mean d of 0.0004.
- **GhX against round 62's full fill G' on the same scenes:** GhX is better on all 24, by a mean d of 0.078. At 256 x 256 the
  scaled fill with the cross-fade in its holes beats the full fill's 4-to-16-pixel reach. Nothing was pre-registered on it,
  so it decides nothing; it suggests the reach's long searches at 256 take vectors from too far away.

**What changes, by section 151's rule.**
- **The generator fills what it leaves from the cross-fade.**
- interpolateFrameCPU gains `holes: "crossfade"` (default "zero", so fx/fsr's FSR3 gates and rounds 59-64 are unchanged).
- render/denoiseFrameGenGPU.mjs's gather writes the cross-fade in a hole.
- The cost gate's parity rows hold the two to each other on both fields, as before.
- On the path tracer's page this closes the 0.77 % of a 1080p frame left black.

## 153. FSR4 ROUND 65's CODE: FOUR DETAILS SECTION 148 LEFT OPEN, FIXED BEFORE THE TRAINING HARVEST RUNS

Section 152 is round 66's verdict, written when its harvest has read. The code section 148 called for now exists:
- render/learnedUpscale.mjs: U, its input, its apply, its loss, its training;
- render/learnedUpscaleStudy.mjs: the two harvests;
- `--harvest-upscale-train` and `--harvest-upscale-test`;
- their gates: render/learnedUpscale-selfcheck.mjs and render/learnedUpscaleStudy-selfcheck.mjs, on synthetic and non-dataset
  scenes only, every row sabotaged.

Writing it fixed four things section 148 had left open. None is a result; no scene of the round has been rendered.

1. **"Light-free" is the composite's.** The loss grades O = E + (1 - cov) U, the chain's own composite, against the full
   reference, in display space. U is then asked only for the light the light sources do not cover, which is what section 148
   meant by a light-free target. It needs no light-free reference, and the test grades the same composite.
2. **The depth guide is d / (1 + d) along the camera's forward axis,** 0 on sky. The **phase** is ±0.25 on each axis: where
   the pixel's centre falls in its half-size texel.
3. **An untrained U is the 4 x 4 box.** The head's weights start at zero, as the denoiser's zero-last.
   - Its parameter count is 6,656 (not "about the shipped denoiser's"; that one has 6,387).
   - A crop's taps are read from a two-texel window round it, so a crop is graded exactly as the whole frame would be at
     those pixels. A gate row holds this bit for bit.
4. **C2's shuffle** permutes the training references across images with no image keeping its own (seed 65). Each input
   keeps its own scene's light sources. Its U is trained on the candidate's seed.

**The order from here, each step committed before the next runs:**
1. this code;
2. `--harvest-upscale-train`, writing render/upscale-net-r65.json;
3. `--harvest-upscale-test`, writing render/denoise-results-upscale-learned.json;
4. the verdict.

## 154. FSR4 ROUND 65 -- NOT REPORTED: C1 AND C3. THE 32-SAMPLE TRUTH IS NOISIER THAN EVERY ARM, SO THE TEST COULD NOT RESOLVE THEM

**What arrived.**
- render/upscale-net-r65.json: the training harvest at 64756e00, committed at b9f2cdab. Its validation losses were 4.351e-3,
  4.488e-3 and 4.198e-3, so the candidate is seed 3. Its log was seen before its commit; no test scene had been rendered.
- render/denoise-results-upscale-learned.json: the test harvest at b9f2cdab, committed byte for byte (07fceeaa) before it
  was read.

**The run is NOT REPORTED, on two controls.**
- **C1 fired:** U's chain beat the noisy floor on 18 of 24, where 22 were needed.
- **C3 fired:** 23 of 24 images sit within 2 x of their floor, so neither hypothesis is resolvable.
  - The floor is relMSE between the two 32-sample references, in display space. Its mean is 5.50e-3.
  - The arms' means are U 4.90e-3, EASU 4.99e-3, bilinear 5.31e-3 and the noisy floor 6.15e-3.
  - Every arm is closer to one reference than the second reference is. The truth's own noise is the largest error in the
    table, and it hides differences of the size the round asked about.
- C2 held: the shuffled-target U lost to EASU on all 24, by a mean d of 1.11. So U learned from its targets, not from
  their noise.
- C4 and C5 held.

**Reported, deciding nothing.**

| | U against EASU | U against bilinear |
|---|---|---|
| images U won | 7 of 24 (R 2, C 5) | 14 of 24 (R 2, C 12) |
| mean d (display) | -0.053 (R -0.114, C +0.008) | +0.018 (R -0.065, C +0.100) |
| mean d (linear) | -0.111 | -0.064 |

EASU beat bilinear on 22 of 24.

**The predictions, read as made.**
- **P3 FAILED:** C1 did not hold.
- **P1 and P2 have no reading.** Descriptively, P1 (U beats bilinear) is half true: on C 12 of 12, on R 2 of 12. P2 (U beats
  EASU) is not seen at all.

**What it says.** Nothing is decided, and two things are owed.
- **This is my design's fault, and C3 caught it.**
  - Section 148 kept the 32-sample truth of rounds 59-62. Those rounds graded frames generated from noisy inputs, whose
    errors sat well above it.
  - Here every arm is the shipped denoiser's half-size output upscaled, and they all sit at or under the truth's own noise.
    I did not check the floor against the arms before fixing the design.
- U was also trained on 32-sample targets. Noisy targets are unbiased, but they slow what it can learn.

**What a next round would be, for Keith to decide.** It would not be a re-read of these 24.
- New test seeds, and a truth of 512 samples: about 16 x quieter, so the floor falls well under the arms.
- The same U, so the training's choice stands; or U retrained on 512-sample targets as well.

`fsr4-learned-upscaler` stays open on that decision.

## 155. FSR4 ROUND 67 -- U RETRAINED ON 512-SAMPLE TARGETS, TESTED AGAINST A 2048-SAMPLE TRUTH: FIXED BEFORE ITS CODE AND ITS SCENES

**Why.** Section 154's round could not resolve its arms: the 32-sample truth's own noise was above all of them. Keith chose
the second of its two options: U retrained on quieter targets, and tested again on new scenes against a quieter truth.

**The floor, measured before this section, on two non-dataset scenes at 256 x 256.** The table is display-space relMSE
against one reference.

| scene | spp | second reference (the floor) | EASU's chain | bilinear's | the noisy floor |
|---|---|---|---|---|---|
| R 990940 | 512 | 1.95e-4 | 8.74e-4 | 9.19e-4 | 3.62e-3 |
| C 990941 | 512 | 3.18e-3 | 6.12e-3 | 5.81e-3 | 9.63e-3 |

- On R, 512 samples puts the floor at 0.22 of EASU's error, so it resolves.
- On C, 512 leaves it at 0.52: within C3's 2 x, not resolvable. C's light reaches through glossy paths whose samples are rare.
- So the **test's truth is 2048 samples**, 4 x quieter again: C's floor near 8e-4 against arms near 6e-3.
- The **training targets are 512.** A noisy target is unbiased, so it slows learning and does not mislead it. At 512, 220
  training scenes cost about 4.4 hours; at 2048 they would cost about 18.

**What changes from round 65 (sections 148, 153).**
- **Training and validation targets: 512 samples,** on the same 200 + 20 scenes (61000-61199, 62000-62019). Those were
  never test scenes, and re-rendering them at 512 changes the targets alone.
- **U is retrained on seeds 1-3,** the candidate again the lowest validation loss, and C2's shuffled U on the candidate's
  seed. The results go to render/upscale-net-r67.json.
- **The test: 24 new scenes,** 12 R (67000-67011) and 12 C (68000-68011). The two references are each 2048 samples.
  The results go to render/denoise-results-upscale-learned-r67.json.

**What does not change.** U's shape and input, its loss (display space through the composite), the schedule, the
hypotheses (H1 against EASU, H2 against bilinear), the test, Holm, C1-C5, C1 at 22 of 24, and the grading.

**Predictions, fixed now, deciding nothing.**
- **P1:** C3 holds this time (no more than 12 of 24 within 2 x of the floor).
- **P2:** H2 is supported.
- **P3:** H1 is not supported. Section 154's descriptive figures had U losing to EASU on 17 of 24, and quieter targets alone
  are not likely to turn that.
- **P4:** C1 holds.

**The runs.** `node tools/denoiseStudy.mjs --harvest-upscale-train --round 67`, then `--harvest-upscale-test --round 67`.
Each is committed byte for byte before the next runs. Section 156 is the verdict.

## 156. FSR4 ROUND 67 -- REPORTED, NEITHER SUPPORTED: THE LEARNED UPSCALER TIES EASU, AND ITS EDGE OVER BILINEAR MISSES HOLM

**What arrived.**
- render/upscale-net-r67.json: the training harvest at dd00f88b, committed at 881fd267. Its validation losses were
  2.069e-3, 2.175e-3 and 2.656e-3, so the candidate is seed 1. Its log was seen before its commit; no test scene had been
  rendered.
- render/denoise-results-upscale-learned-r67.json: the test harvest at 881fd267, in 13,818 s, committed byte for byte
  (8d8a3c6d) before it was read.

**The run is REPORTED.** Every control held.
- **C1:** U beat the noisy floor on 24 of 24.
- **C2:** the shuffled U lost to EASU on 24 of 24, by a mean d of 1.90.
- **C3:** no image within 2 x of its floor. The 2048-sample floor is 0.19 of EASU's error at the worst.
- C4 and C5 held.
- The quieter truth did what section 155 fixed it to do: the floor's mean is 2.48e-4, against every arm near 2.3e-3.

| | H1: U against EASU | H2: U against bilinear |
|---|---|---|
| mean d (display) | -0.020 (R -0.006, C -0.034) | +0.027 (R +0.042, C +0.012) |
| images U won | 10 of 24 (R 5, C 5) | 16 of 24 (R 8, C 8) |
| sign-flip p (Holm threshold) | 0.868 (0.05) | 0.037 (0.025) |
| status | **not supported** | **not supported** |

- Holm takes the smaller p first. H2's 0.037 is over its threshold of 0.025, so neither is supported.
- **The mean display-space relMSE:** U 2.254e-3, EASU 2.252e-3, bilinear 2.310e-3, the noisy floor 4.85e-3.
- In linear radiance, H1 reads 6 of 24 (mean d -0.043) and H2 16 of 24 (+0.049). EASU beat bilinear on 17 of 24.

**The predictions, read as made.**
- **P1 held:** C3 held.
- **P2 FAILED:** H2 is not supported, though its sign held on 16 of 24 and p missed by 0.012.
- **P3 held:** H1 is not supported.
- **P4 held:** C1 holds.

**What it says.**
- **This round's learned upscaler is EASU's equal, not its better.** The two differ by 0.09 % in mean relMSE, with
  10 wins against 14.
- Trained on quiet targets, with guides EASU does not have, a 6,656-parameter U learned what EASU does by hand, and no more.
- **FSR4's step, as this arc built it, buys nothing on the path tracer's frames,** and it would cost a network pass where
  EASU costs 0.6 ms.
- Rounds 65 and 67 are the arc's FSR4. Round 65 could not resolve its arms; round 67 resolved them and found a tie.

**What changes.**
- `fsr4-learned-upscaler` is closed as a measured negative: U ties EASU at the round's size and training.
- What could change that is a design, not a re-read: a wider network, more training scenes, temporal input as FSR4's own
  network takes. Each would be its own round, and Keith's call.
- EASU stays the chain's upscale.

## 157. FSR4 ROUND 68 -- A LEARNED KERNEL OFFERED EASU, WIDER: FIXED BEFORE ITS CODE AND ITS SCENES

**Why.** Section 156 found round 67's U, a 4 x 4 kernel learned from a box, equal to EASU and no better. Keith asked for a
different FSR4 design. The one fixed here changes two things:
- **what U can choose from:** EASU's own output at the pixel, as a 17th tap beside the sixteen half-size texels. Where EASU is
  right, U can take it; where it is wrong, U can leave it;
- **how much it can hold:** 32 channels, not 16.

**A pilot, before this was fixed (synthetic discs, 300 steps, seeds 1-3, flat and textured).** The first draft of this section
started U_E **at** EASU: the 17th logit biased +8, 99.47 % of every pixel on EASU. It never left it -- every run ended at EASU's
error to four digits. Biases of 0 and -1.5, and once -3, fell into the same place: all weight on EASU's tap, the sixteen's
gradient gone with it. A bias of **-8** (the start the box, 2.1e-5 on EASU) fell into it in none of six runs, beat EASU in all
six, and ended with 36-47 % of the weight on EASU's tap. So that is the start fixed here, and a gate row holds the +8 failure.

**The network, U_E (render/learnedUpscale.mjs).**
- The same 12-channel input. Three 3 x 3 layers of **32**, then a 1 x 1 head of **17** logits.
- The softmax runs over U's sixteen half-size taps **and EASU's own light-free output at the pixel**, the 17th.
- At the start the head's weights are zero and the 17th logit's bias is -8: round 67's box start, with e^-8 / (16 + e^-8) =
  2.1e-5 on EASU. A gate row holds the figure.
- The pixel is still a convex mix of what EASU and the half-size frame give, so it adds no light that neither has.

**Training, as round 67's (section 155).**
- The same 200 + 20 scenes at 512 samples, seeds 1-3, the candidate chosen by validation, C2's U_E on shuffled targets.
- The examples can be cached on disk (`--cache <dir>`, render/denoiseCache.mjs, keyed by scene, size and samples, the directory
  stamped by the results file and the commit), so an interrupted harvest resumes where it stopped and renders nothing twice.
- The results go to render/upscale-net-r68.json.

**The test.**
- **24 new scenes:** 12 R (69000-69011) and 12 C (70000-70011), against two 2048-sample references.
- **H1:** U_E's chain beats EASU's.
- **H2:** U_E's chain beats round 67's U (render/upscale-net-r67.json's candidate) on the same scenes. That says whether the
  design moved anything.
- Display space, the sign-flip test, Holm, C1-C5 as before (C1 at 22 of 24, C2 the shuffled U_E against EASU).
- The results go to render/denoise-results-upscale-learned-r68.json.

**A change to the harvests' bookkeeping, fixed now.** The upscale harvests record the commit they **started at**, not the
HEAD when they finished. They load their code at the start, so that is the commit that ran, and work committed during a
harvest no longer misattributes its results. A gate row reads it off the command.

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 and C3 hold.
- **P2:** H1 is supported, by a mean d under 0.05. The synthetic pilot's margin was large, but round 67 says the path tracer's
  frames leave EASU less to fix.
- **P3:** H2 is supported.
- **P4:** the trained U_E puts between 20 % and 80 % of its weight on EASU's tap on the mean (the pilot: 36-47 %).

Section 158 is the verdict.

## 158. FSR4 ROUND 68'S VERDICT -- REPORTED; BOTH HYPOTHESES SUPPORTED AS THE TEST READS THEM, AND U_E IS EASU

**Where it ran, and one breach of the order.** Both harvests ran on Keith's rig at fe2f443a, the training and then the test, so
the test read the training file before it was committed (rounds 65 and 67 ran the test at a later commit carrying it). The test
file names the candidate and commit it read (seed 1, fe2f443a), and the committed training file says the same. **The results file
was shown to me when it was uploaded, before it was committed** (8d68c6e4, byte for byte, sha-256 5a7a65d8...). Nothing below was
changed after that: every number is section 157's test, re-derived by render/learnedUpscaleStudy-selfcheck.mjs section 8.

**The training.** All three seeds ended in one place: validation 1.9073e-3 for each, the same to 3e-11. The candidate is seed 1.

**The test, as fixed.**
- C1, C3, C4, C5 held; C2 held (the shuffled U_E lost to EASU on all 24, mean d -1.64).
- **H1, U_E against EASU: supported** -- 16 of 24, sign-flip p 0.0111 against Holm's 0.05.
- **H2, U_E against round 67's U: supported** -- 19 of 24, p 0.00063 against 0.025, mean d +0.098.

**What that means: nothing was learned.** U_E's chain equals EASU's to 4.2e-10 relative on every scene. H1's mean d is
**3.6e-11**. The softmax puts at least 99.99994 % of every scene's weight on EASU's tap. The committed candidate, run on a
scene of no split, does the same (99.999 %). H1's "support" is the sign of a residual 1e-8 of weight left on the sixteen taps,
consistently that way and far below anything visible. Section 157 fixed no smallest effect worth reporting. I add none after the
fact; I record instead that this support is not an improvement. H2 is the same comparison as EASU against round 67's U:
EASU beats it on the same 19 of 24, each scene's d the same to 1e-9. On these scenes round 67's U lost to EASU (2.60e-3 against
2.35e-3). On round 67's own it had tied (2.254e-3 against 2.252e-3).

**The predictions.**
- **P1 (C1 and C3 hold): held.**
- **P2 (H1 supported, mean d under 0.05): held as worded, vacuously.** The d is 3.6e-11.
- **P3 (H2 supported): held,** by EASU's margin, not by anything U_E learned.
- **P4 (20-80 % of the weight on EASU's tap): MISSED.** It is over 99.9999 %. The pilot had shown the attractor and moved the
  start to -8 to avoid it. At full scale (1500 steps, batch 4, 32-pixel crops of 220 path-traced scenes) training reached it
  anyway, from all three seeds.

**What follows.** EASU stays the chain's upscale. Three rounds have now tried to learn past it, and none did:
- round 65: not reported;
- round 67: a tie;
- round 68: a collapse onto it.

Offering EASU as a softmax choice cannot work as built: the per-pixel gradient on EASU's logit wins wherever EASU beats the
current mix, and that holds early everywhere. A further design would have to keep EASU out of the competition. For example, a
residual added to EASU with its scale held, or a loss on where EASU is wrong. That would be a new round, and none is fixed
here.

## 159. FSR4 ROUND 69 -- A HELD RESIDUAL ON EASU: FIXED BEFORE ITS SCENES

**Why.** Keith asked for section 158's residual design. Round 68's U_E could only choose between EASU and the half-size frame,
and the choice collapsed onto EASU. U_R does not choose; it corrects. Its pixel is EASU's own, scaled per channel:

**y = EASU · (1 + 0.5 tanh(r))**, r the network's 3-channel output.

- **No attractor to fall into.** There is no softmax. At r = 0 the gradient on r is the loss's gradient times 0.5 · EASU, at full
  strength. EASU is the start, not a choice that can win.
- **Held.** The correction is at most half of EASU either way on each channel. It cannot run away, go negative, or add light where
  EASU has none.
- **It sees what it corrects.** Its input is U's twelve channels and EASU's three (UPR_CHANNELS 15).

**The code was written before this section, and this section is fixed before any scene of round 69.** The order differs from
earlier rounds because a Bash fault left me unable to run anything for a time and I wrote the code then. Its gate rows, in
render/learnedUpscale-selfcheck.mjs section 6, hold:
- an untrained U_R is EASU bit for bit;
- any U_R stays within 0.5-1.5 times EASU;
- its gradient matches central differences (worst 7.5e-8);
- a crop gives the whole frame's loss and gradients;
- 300 steps on synthetic frames beat EASU.

**The network, U_R (render/learnedUpscale.mjs).** Three 3 x 3 layers of 32, then a 1 x 1 head of 3, its weights and biases zero.

**A pilot (synthetic discs, textured, 300 steps, seeds 1-3).**
- U_R beat EASU on every seed: 8.02e-3, 8.16e-3 and 7.85e-3 against EASU's 2.11e-2.
- It beat round 67's box U on every seed (1.35e-2, 1.31e-2, 2.31e-2).
- Its mean correction was 5.4-6.1 % of EASU.

Round 68's pilot also looked good and full scale collapsed, so the pilot decides nothing.

**Training, as round 68's.**
- The same 200 + 20 scenes at 512 samples, seeds 1-3, the candidate chosen by validation, and C2's U_R on shuffled targets.
- The results go to render/upscale-net-r69.json.

**The test.**
- **24 new scenes:** 12 R (71000-71011) and 12 C (72000-72011), against two 2048-sample references.
- **H1:** U_R's chain beats EASU's.
- **H2:** U_R's chain beats round 67's U.
- Display space, the sign-flip test, Holm, and C1-C5 as before.
- The results go to render/denoise-results-upscale-learned-r69.json, with each scene's mean |0.5 tanh r| (`residualSize`).

**New, after round 68: the smallest effect worth reporting, fixed now.** H1's support counts as an improvement only if U_R's mean
display relMSE is **at least 1 % below EASU's**. Round 68 was supported by a mean d of 3.6e-11, and section 158 had no rule to
call that nothing. If the test supports H1 by less, the verdict says so and EASU stays.

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 and C3 hold.
- **P2:** H1 is supported, and the mean relMSE is 1-10 % below EASU's.
  - The pilot's margin was far larger, but the path tracer's frames have far less for EASU to get wrong.
  - Round 67's U came within 0.1 % of EASU.
- **P3:** H2 is supported.
- **P4:** the mean correction on the test scenes is between 0.5 % and 20 % of EASU. It must not be at zero (a collapse) and
  not near the hold (saturating).

**The run.** On Keith's rig, as round 68's:
- `--harvest-upscale-train --round 69`;
- commit the training file;
- `--harvest-upscale-test --round 69` at that commit.

Section 160 is the verdict.

## 160. FSR4 ROUND 69'S VERDICT -- REPORTED; H1 NOT SUPPORTED: U_R MOVED OFF EASU AND DID NOT BEAT IT

**How it ran.** On Keith's rig, in section 159's order:
- the training at 7a85a917;
- its file committed unread (735cd305);
- the test at 735cd305.

The results file was shown to me when it was uploaded, before its commit (fff15384, byte for byte). Every number below is section
159's test, re-derived by render/learnedUpscaleStudy-selfcheck.mjs section 10.

**The training.** The seeds ended apart this time: validation 1.845e-3, 1.876e-3 and 1.837e-3. Round 68's three were the same
to 3e-11. The candidate is seed 3.

**The test, as fixed.**
- C1, C3, C4, C5 held; C2 held (the shuffled U_R lost to EASU on all 24, mean d -3.18).
- **H1, U_R against EASU: NOT SUPPORTED** -- 14 of 24, mean d +0.0067, sign-flip p 0.201.
- **H2, U_R against round 67's U: supported** -- 15 of 24, p 0.0092 against Holm's 0.025, mean d +0.063.
- **Section 159's 1 % rule:** U_R's mean display relMSE is 2.3120e-3 against EASU's 2.3107e-3, 0.06 % *above* it. The rule
  is not met, and would not have been had H1 passed.

**What it means.** The residual did what round 68 could not, and moved:
- its mean correction is 0.92 % of EASU, from 0.19 % to 2.50 % by scene;
- the seeds learned different corrections.

On the test scenes those corrections helped as often as they hurt. Descriptively, U_R did a little better on C (8 of 12, mean d
+0.020) and a little worse on R (6 of 12, mean d -0.007); no hypothesis was fixed on that split. H2's edge over round 67's U is
0.87 % of mean relMSE. On these scenes EASU itself beats round 67's U on 16 of 24.

**The predictions.**
- **P1 (C1 and C3 hold): held.**
- **P2 (H1 supported, 1-10 % below EASU): MISSED.** It is 0.06 % above.
- **P3 (H2 supported): held.**
- **P4 (mean correction 0.5-20 %): held,** at 0.92 %.

**What follows.** EASU stays the chain's upscale. Four FSR4 rounds have now been run on these 200 training scenes, each on new
test scenes:

| round | design | result |
|---|---|---|
| 65 | box start | not reported |
| 67 | box start, a cleaner truth | a tie |
| 68 | EASU offered | a collapse onto EASU |
| 69 | a held residual | a learned correction that does not generalise past EASU |

The validation loss fell below round 68's (1.837e-3 against 1.907e-3), and the test did not follow. A residual that fits the
200 training scenes better than EASU, and the test scenes no better, points at the data more than the design. These scenes give
EASU little to get wrong at a 2048-sample truth. More scenes, temporal input (FSR4's real input is a jittered history), or
another loss would each be a new round. None is fixed here.

## 161. FSR4 ROUND 70 -- A LEARNED CORRECTION OF THE TEMPORAL UPSCALE: FIXED BEFORE ITS CODE AND ITS SCENES

**Why.** Section 160 found four single-frame designs no better than EASU, and pointed at the input. Keith asked for the temporal
design. FSR2-4's real input is a jittered history, and the arc has one: round 32's Bt
(render/denoiseTemporalUpscale.mjs's accumulateUpscaled).
- Eight jittered half-size frames, each through the shipped denoiser, the emitter fill and EASU.
- Reprojected at full size, the history clamped to the current frame's 3 x 3 range, a running average.
- It beat the single-frame chain on 12 of 12 (section 96, mean d +0.259).

So a temporal FSR4's bar is **Bt, not EASU**. Bt's weak points are a learned upscaler's chance: the clamp's ghosting and
over-clamping, and the disocclusions that restart at one frame.

**The network, U_T (render/learnedUpscaleTemporal.mjs).** It uses section 159's held residual, put on the temporal frame instead of
EASU's:

**y = A · (1 + 0.5 tanh(r))**, A the light-free accumulation (Bt before its composite), r the network's 3-channel output.

- **Its input, 17 channels a full-size pixel:**
  - A, the clamped accumulation (0-2);
  - the same accumulation unclamped (3-5), so it can see where the clamp acted;
  - the current frame's EASU on the unjittered grid (6-8);
  - the history length n / 8 (9);
  - albedo (10-12) and normal (13-15);
  - depth as d / (1 + d) (16).
- Three 3 x 3 layers of 32, a 1 x 1 head of 3, its weights and biases zero, so an untrained U_T is Bt exactly.
- Trained as rounds 67-69 were: display-space relMSE of the composite, Adam, 1500 steps of 4 crops of 32, seeds 1-3, the
  candidate by validation, and C2's U_T on targets shuffled across the training sequences.

**The data.** Every example is a sequence: round 32's camera path (8 frames orbiting to the scene's eye), the frames at half
size at 4 samples on round 32's JITTER, references at the scene's eye.
- **Training and validation:** round 65's 200 + 20 scenes (61000-61199, 62000-62019), their sequences rendered here, the
  references at 512 samples.
- **Test:** 24 new scenes, 12 R (73000-73011) and 12 C (74000-74011), against two 2048-sample references.
- 256 x 256, as every FSR4 round.

**The test.**
- **H1:** U_T's chain beats Bt's -- the learned temporal upscale against the hand-written one.
- **H2:** U_T's chain beats B1's, the single-frame chain (EASU on the measured frame alone). This is expected from round 32. It
  says whether U_T keeps the history's lead.
- Display space, the sign-flip test, Holm, and C1-C5 as before (C1 at 22 of 24, the noisy floor the last frame's half-size input,
  bilinear and composited).
- **Section 159's rule, again:** H1 counts as an improvement only at a mean display relMSE at least 1 % below Bt's.
- The results go to render/denoise-results-upscale-temporal-r70.json, the nets to render/upscale-net-r70.json. Each scene's mean
  correction is recorded (P4).

**Predictions, fixed now, deciding nothing.**
- **P1:** C1 and C3 hold.
- **P2:** H1 is supported, 1-10 % below Bt. Bt has errors a learner can see (the clamp, the restarts), which EASU did not.
- **P3:** H2 is supported.
- **P4:** the mean correction is between 0.5 % and 20 % of Bt.

**The run.** On Keith's rig:
- `--harvest-upscale-temporal-train`;
- the training file committed unread;
- `--harvest-upscale-temporal-test` at that commit.

**A pilot, run after this section was fixed and before any scene of the round.** It changed nothing above.
- **Setup:** 16 training and 8 test sequences of non-dataset scenes at 64 x 64, references at 256 samples, 400 steps.
- **Result:** U_T beat Bt on 8, 7 and 7 of 8 for seeds 1-3. Mean relMSE 5.82e-3, 6.24e-3 and 5.84e-3, against Bt's 7.24e-3 (14-20 %
  below). Mean corrections 6.6-8.1 %.
- **Caveat:** at 64 x 64 the half-size frames are 32 x 32, and the denoiser does badly there. The noisy floor (6.64e-3) was BELOW
  Bt, which a 256 x 256 round 32 never saw.

Rounds 68 and 69 had good pilots too, so this decides nothing. Section 162 is the verdict.

## 162. FSR4 ROUND 70'S VERDICT -- REPORTED, BOTH SUPPORTED: THE LEARNED CORRECTION OF THE TEMPORAL UPSCALE BEATS IT BY 9.7 %

**How it ran.** On Keith's rig, in section 161's order:
- the training at 2daaa618;
- its file committed unread (a621735c);
- the test at a621735c.

The results file was shown to me when it was uploaded, before its commit (87127416, byte for byte). Every number below is section
161's test, re-derived by render/learnedUpscaleTemporal-selfcheck.mjs section 5.

**The training.** Validation 1.637e-3, 1.667e-3 and 1.658e-3 for seeds 1-3; the candidate is seed 1.

**The test, as fixed.**
- C1, C3, C4, C5 held; C2 held (the shuffled U_T lost to Bt on all 24, mean d -3.70).
- **H1, U_T against Bt: SUPPORTED** -- 20 of 24, sign-flip p 7.0e-6 against Holm's 0.05, mean d +0.099.
- **H2, U_T against the single-frame chain B1: supported** -- 22 of 24, p 4.8e-7, mean d +0.262.
- **Section 161's 1 % rule: met.** U_T's mean display relMSE is 1.7503e-3 against Bt's 1.9373e-3, **9.65 % below**. B1 is
  2.3226e-3.

**This is the first FSR4 round to beat its hand-written baseline.**

| round | input | result |
|---|---|---|
| 65 | one frame (box start) | not reported |
| 67 | one frame (box start, cleaner truth) | a tie |
| 68 | one frame, EASU offered | a collapse onto EASU |
| 69 | one frame, held residual | a tie |
| **70** | **the jittered history** | **9.7 % below the temporal upscale** |

The head is round 69's, and only the input changed. Section 160 read round 69 as pointing at the data, and this agrees: the
history gives the network errors it can see, which a single EASU'd frame did not.

**Descriptively, decided by nothing:**
- U_T won all 12 C scenes (11.5 % below Bt) and 8 of 12 R (3.2 %).
- Its four losses are R 73003, 73004, 73007 and 73011, each by under 2 %.
- The mean correction is 0.66 % of Bt (0.11-1.95 % by scene), largest on C. It is a small, consistent correction, not a
  reconstruction.

**The predictions.** All four held:
- **P1:** C1 and C3 held.
- **P2:** H1 supported, 1-10 % below Bt. 9.65 %, near the top of the range.
- **P3:** H2 supported.
- **P4:** the mean correction 0.5-20 %. 0.66 %, near the bottom.

**What it does not say.**
- **Nothing is timed.** U_T is three 3 x 3 layers of 32 at full size a frame, on top of Bt's own pass. Its cost on a GPU is a
  device round's to measure, as round 33 measured Bt's.
- **One camera move, from a cold start.** Round 32's eight-frame orbit, nothing in the scene moving. Disocclusion is only what
  the orbit uncovers.
- **One resolution, 256 x 256, 2x.** Nothing about 1080p, or about other ratios.
- **The shipped denoiser and EASU stay as they are.** U_T sits after Bt in the chain. Nothing on the page changes in this round.

**What follows.** Two backlog entries:
- `fsr4-temporal-device`: U_T as a compute pass after Bt's, timed on the rig;
- `fsr4-temporal-page`: path-tracer.html's view through it.

## 163. ROUND 71 -- U_T ON THE DEVICE: WHAT THE LEARNED TEMPORAL CORRECTION COSTS A FRAME. FIXED BEFORE ITS CODE

**Why.** Section 162 found U_T 9.65 % better than Bt and left it untimed. Keith asked for its device round. A correction is worth
running only if it costs less than the frame it corrects.

**U_T on the device (render/learnedUpscaleTemporalGPU.mjs).** Five compute passes at full size:
- U_T's four layers, each on brain/conv2d.mjs's fast kernel (r15's, the page's default): 17 -> 32, 32 -> 32 and 32 -> 32 at
  3 x 3 with ReLU, then 32 -> 3 at 1 x 1;
- the hold, y = A (1 + 0.5 tanh r), A read from the input's channels 0-2.

It is held to the CPU at 64 x 64 on a sequence of family R's seed 990914, outside every split (*corrected before the code
first ran: this line said 64 x 48, and temporalExample makes square frames*):
- each layer within 1e-5 relative of conv2dCpu (f32, the fast kernel's order) on the device's own input to it;
- the image within 1e-5 relative of the hold applied in f64 to the device's own r;
- the whole chain within 1e-4 relative of temporalUpscale in f64.

**What is timed, on each rig GPU, at 1920 x 1080.**
- **U** is the five passes, on the device's clock where it has timestamps, median of the timed passes.
- **T** is section 103's chain with its history, read off the same run's denoiseUpscaleGPU line, as rounds 63-64 read it.
- The gate is render/denoiseLearnedUpscaleGPU-selfcheck.mjs, in realGpuRun's denoise selection. readH71 reads a report.

**H71: U ≤ 0.25 x T on both GPUs, in both of each GPU's runs.** That is rounds 63-64's threshold: a quarter of a traced frame.
A run counts as there: every `--only denoise` gate green with exit 0, at one commit.

**Predictions, fixed now, deciding nothing.** The arc already has the numbers to predict this. On the 1080 at 1920 x 1080, r15's
fast kernel takes 17.7-18.3 ms for a 32 -> 32 3 x 3 layer and 5.85 ms for 10 -> 32 (section 141's runs, the denoiseTiming
lines). U_T has two 32 -> 32 layers, a 17 -> 32 one and a small head, at full size.
- **P1: H71 FAILS on the 1080.** U is about 45 ms (40-50): two layers at ~18, the first at ~10, the head and the hold ~1. U / T
  is about 1.2 (1.0-1.4): U_T costs MORE than the traced frame it corrects.
- **P2: H71 fails on the Intel too,** by a similar ratio.
- **P3:** every parity row is green on both GPUs.

**If H71 fails, what follows is fixed now.** U_T as trained is a quality result without a real-time place. A next round would cut its
cost by 4x or more, and each cut is a NEW network needing its own quality round (section 161's test again):
- U_T at half size (the correction's input and output at 960 x 540, upsampled), a quarter of the pixels;
- or 16 wide instead of 32, a quarter of the multiply-adds in the middle layers.
None of those is fixed here.

**The page (backlog fsr4-temporal-page), alongside and outside the hypothesis.** path-tracer.html gains a view of the temporal chain:
- the path-traced half-size frames on round 32's jitter through the shipped denoiser and EASU, in a worker;
- accumulated over the last 8 frames into Bt;
- U_T run on WebGPU where the page has it, else on the CPU;
- shown beside the single-frame chain and Bt, with each step's ms.

Its gate holds its sequence to temporalExample's construction and its U_T to temporalChain. It decides nothing in this round.

**The runs.** Two `realGpuRun --only denoise` on each GPU at round 71's commit, committed byte for byte before they are read.
Section 164 reads them.
