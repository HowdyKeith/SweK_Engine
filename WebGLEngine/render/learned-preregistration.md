# v4689 -- PRE-REGISTRATION: a learned per-block gate on frame generation

**Written before any training run, any feature extraction, and any measurement.
The commit that carries this file contains NO data.** That is the rule v4660 and
v4684 set in this tree and the reason those rounds' results can be read at all.

---

## 1. WHY THIS QUANTITY, AND NOT "FSR4"

Twelve rounds of this arc produced one central negative result: **on fsr.html, a
generated frame LOSES to a cross-fade of the same two presented frames.** Three
named explanations were each refuted by measurement -- displacement across an 8x
range (v4682), field resolution from 576 to 36,864 cells (v4683), and accumulated
inputs (v4683's secondary). The variable that survived is **content spatial
frequency**: smooth -0.857 dB, zone plate -0.965 dB, pixel checker **+0.107 dB**.
Generation wins exactly where the picture has detail a cross-fade destroys.

That is a *decision problem*, and it is the honest thing to learn here. Not an
upscaler, and not FSR4: FSR4 replaces the whole hand-written chain with a trained
network, and nothing in this tree is within reach of that. What this round asks is
narrower and answerable:

> **Can a small network predict, per block and without ground truth, whether the
> generated block will beat a cross-fade there?**

If it can, the page can generate where generation helps and cross-fade elsewhere,
and the arc's central negative result becomes a routing problem rather than a wall.

## 2. WHAT THE TOOLS ACTUALLY ARE, WHICH CONSTRAINS THE SHAPE

Read before designing, not assumed:

- **`brain/learn.js`'s `MLPTrainer` has a SCALAR SIGMOID HEAD.** `z2` is one
  number, `L2.b[0]` is one bias, and the update is `p - r` with `p = sigmoid(z2)`
  -- binary cross-entropy against a reward in [0,1]. It is a bandit reward
  predictor. It cannot regress a vector and it cannot do 3-way classification
  without being rewritten. **So the learned quantity MUST be one number in [0,1]
  per sample.** The per-block binary gate above fits it exactly; a learned blend
  weight or a learned 3-way `source` choice would not.
- **`brain/mlp.js`'s `BatchedMLP` takes a RAW WebGPU device** -- it calls
  `d.createShaderModule` and `d.createComputePipeline` directly. Every runner in
  this render arc goes through `gfx/device.js` and never raw WebGPU. The inference
  path therefore needs a `gfx/device.js` runner over `MLP_LAYER_WGSL`, which is
  this round's build, or it needs a documented exception. It will get the runner.
- Neither module has ever touched the render path. This is their first use in it.

## 3. THE FEATURES, FIXED HERE

Per block of the generation field, all computable at inference time with **no
access to the true middle frame**. Any feature needing ground truth is
disqualified and none below uses it.

| # | feature | source |
|---|---|---|
| 1 | `sadApp` | `reconcileFlowCPU`'s packed output |
| 2 | `sadFlow` | same |
| 3 | `sadStill` | same |
| 4 | `|fx|` | reconciled flow, pixels |
| 5 | `|fy|` | same |
| 6 | block mean absolute Laplacian of `cur` | the spatial-frequency proxy the arc's finding points at |
| 7 | block variance of `cur` luma | a second, cruder frequency measure |
| 8 | block depth | `depthBlock` |
| 9 | hole fraction after the splat | `interpolateFrameCPU`'s hole mask |
| 10 | `source == APP` | one-hot of the reconcile choice |
| 11 | `source == FLOW` | one-hot |

Eleven features, one hidden layer, ReLU, scalar sigmoid out. Hidden width is
**16**, fixed here so it cannot be tuned against the answer.

**Standardisation:** each feature is centred and scaled by the mean and standard
deviation of the TRAINING set only, and those constants ship with the weights. A
scaler fitted on the held-out scene would leak it.

## 4. THE LABEL

For a block b on a frame with a known true middle frame:

    label(b) = 1 if MSE(generated block b) < MSE(cross-faded block b), else 0

Ground truth is used to make the label at TRAINING time only. Nothing at inference
time sees it. This is the standard shape and it is stated because the failure mode
-- a feature that smuggles the answer in -- is the one that makes a learned result
worthless, and section 3 is the list that has to be audited for it.

## 5. THE SPLIT, AND WHAT "HELD OUT" MEANS HERE

**TRAIN on `smooth` and `zone` only. MEASURE on `checker`, which no training
sample comes from.**

This is deliberately the hard direction. Generation LOSES on both training scenes
(-0.857 and -0.965 dB) and WINS on the held-out one (+0.107 dB). So the network
must generalise from two scenes where the answer is usually "no" to a scene where
the answer is often "yes". A network that has merely learned "say no" will score
well on its training distribution and fail here, which is exactly what a held-out
measurement is for.

**A network trained on a zone plate and a checker has learned the zone plate and
the checker.** That is why the checker is not in the training set.

## 6. THE PRIMARY -- ONE, DECLARED NOW

**Primary hypothesis H1:** on the held-out `checker` scene, gating generation by
the learned predictor beats ungated generation.

- **Population:** frames 6-38 of the checker scene at `slabspeed` x2, block 8, the
  page's default generator settings. Same window as v4684's pre-registration, and
  for the same reason: the slab is resident across all of it.
- **Statistic:** per-frame PSNR difference, `gated - ungated`, in dB.
- **Test:** paired t-test AND exact sign test, via `tools/ship/pairedStats.mjs`.
- **Threshold:** **BOTH p < 0.05 AND a positive mean.** The conjunction rule, as
  v4684 built it.
- **If either test fails, H1 is REFUTED.** Not "trending", not "promising".

## 7. CONTROLS, DECLARED NOW

- **C1 (positive control on the instrument):** an ORACLE gate, using the true
  label, must beat ungated generation by the same test. If the oracle does not
  win, the gating mechanism is broken and H1 is untestable -- the round stops and
  says so rather than reporting a null from a broken rig.
- **C2 (the "say no" control):** a constant predictor that always cross-fades.
  H1's network must beat THIS, not merely beat ungated generation. A network that
  has learned to always decline is a cross-fade with extra steps, and on these
  scenes that would score well.
- **C3 (predicted non-effect):** the gate must not change frames where the flow
  field declines everywhere -- a block with no vector is a hole either way.
- **C4 (parity):** the CPU forward pass and the `MLP_LAYER_WGSL` forward pass must
  agree to 1e-5 on the same weights and inputs, or no device number may be quoted.

## 8. WHAT WOULD MAKE THIS ROUND A FAILURE, WRITTEN DOWN IN ADVANCE

- The oracle control C1 fails -> the rig cannot express the decision; report that.
- H1 refuted -> **report it refuted.** The arc has published three refutations
  already and they are the most useful things in it.
- The network collapses to C2 -> report it as a collapse, not as a win over
  ungated generation. This is the single most likely failure and the one most
  easily mis-sold, which is why C2 exists and is declared here.
- Train accuracy high, held-out accuracy at chance -> report the gap. That is the
  result: it would mean the features carry scene identity rather than a mechanism.

## 9. SECONDARIES -- REPORTED, NEVER PROMOTED

- S1: the same test on `smooth` and `zone` (in-distribution). **Expected to be
  easier and therefore worth less.** It cannot stand in for H1.
- S2: which features the trained weights lean on.
- S3: held-out accuracy, AUC and base rate. Descriptive only.
- S4: device-vs-CPU timing. **No timing claim may be made at all** -- this
  container has served SwiftShader every time.

A secondary declared here is never promoted to a primary, whatever it reads.

## 10. WHAT THIS ROUND CANNOT CONCLUDE

- Nothing about FSR4. FSR4 is a trained network replacing the entire chain; this
  is an eleven-feature gate on one decision.
- Nothing about real hardware. SwiftShader is not a GPU.
- Nothing about scenes outside these three synthetic ones.
- Nothing about whether a BIGGER network would do better. Width 16 is fixed in
  section 3 precisely so that "try a bigger one until it works" is not available.
