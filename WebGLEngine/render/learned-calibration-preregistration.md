# v4692 -- PRE-REGISTRATION: is the conservatism a THRESHOLD or the FEATURES?

**Written before any threshold is computed, any AUC is measured, and any weights
are retrained. The commit that carries this file contains NO data.**

---

## 1. WHAT v4691 MEASURED, AND WHY THIS ROUND IS LEGITIMATE

v4691's pre-registered test refuted H1: the learned gate scored +0.0530 dB against
ungated generation on the held-out `checker` (paired t p=0.144, exact sign p=0.636,
16 of 33 frames up), and the bar was both p<0.05 and a positive mean.

The controls said what kind of failure it was:

- **C1**, the oracle using the true label, won by **+0.3191 dB, 33 of 33 frames
  up** (t p=2.4e-9). The decision is real and is worth about a third of a dB here.
- **C2**, always-cross-fade, was *beaten* by the network (+0.0733 dB, t p=1.8e-4).
  So the network did not collapse to declining.
- And the shape: **the oracle keeps 437.6 of 576 blocks; the network keeps 122.2.**
  It is roughly four times too conservative, and its predicted-positive rate (21%)
  sits well below even its own training base rate (43.55%).

*** THE OPERATING POINT WAS NEVER CHOSEN. *** `tau = 0.5` was a default nobody
tested -- it is the number a sigmoid falls out at, not a decision. Re-testing after
a disappointing result is exactly what pre-registration exists to prevent, so the
rule that makes this round honest is stated here and enforced in section 4: **the
threshold is chosen without the held-out scene ever being looked at.** If it were
chosen on the checker this would be a different round and a worthless one.

## 2. THE TWO EXPLANATIONS, AND THEY ARE DISTINGUISHABLE

- **E1 -- CALIBRATION.** The network *ranks* blocks usefully but sits at the wrong
  operating point. A threshold chosen on training-scene data fixes it.
- **E2 -- REPRESENTATION.** The eleven features do not carry the mechanism to
  unseen content at all, and the ranking on the checker is near chance. Then no
  threshold helps, and the conservatism was never the problem.

These make opposite predictions about one threshold-free number: **the held-out
AUC** -- the probability the network scores a randomly chosen winning block above a
randomly chosen losing one. E1 predicts AUC comfortably above 0.5; E2 predicts
about 0.5. AUC is declared here as the **diagnostic**, not as the primary, because
a ranking that is good does not by itself put dB on the board.

## 3. THE SPLIT, TIGHTENED

v4691 trained on `smooth` + `zone` and held out `checker`. That leaves nowhere to
choose a threshold without touching either the training rows the weights already
memorised or the held-out scene itself. So the split becomes three-way:

| slice | scenes | used for |
|---|---|---|
| TRAIN | `smooth` | fitting the weights and the feature scaler |
| VALIDATION | `zone` | choosing the threshold, and nothing else |
| HELD OUT | `checker` | the measurement, looked at ONCE |

The weights are **retrained** on `smooth` alone. The scaler is refitted on `smooth`
alone. `zone` is still a training-side scene -- it is not held out -- and its only
job is to supply an operating point.

## 4. HOW THE THRESHOLD IS CHOSEN -- FIXED NOW, NO SEARCH

**Primary rule: RATE MATCHING.** Choose the smallest `tau` such that the predicted-
positive rate on VALIDATION equals or exceeds the VALIDATION base rate.

It is parameter-free, it has no search, and it is the direct correction for the
defect v4691 measured: a predictor that keeps 21% of blocks where the truth says
about 44% is mis-calibrated, and matching the rate is the one fix that does not
smuggle in a tuning knob. **No other rule may be substituted after seeing the
result.**

*Declared secondary (S5): the accuracy-maximising tau over a grid on VALIDATION.*
It is a search, it has a free parameter, and it is reported and never promoted.

## 5. THE PRIMARY -- H2, DECLARED NOW

**H2:** with `tau` chosen by rate matching on VALIDATION, gating beats ungated
generation on the HELD-OUT `checker`.

- **Population:** frames 6-38 of the checker scene at `slabspeed` x2, block 8 --
  the same window v4691 used, read out of the pre-registration rather than
  restated in the gate (v4691's own 0-RED taught that).
- **Statistic:** per-frame PSNR difference, `gated - ungated`, in dB.
- **Test:** paired t-test AND exact sign test, `tools/ship/pairedStats.mjs`.
- **Threshold:** **BOTH p < 0.05 AND a positive mean.**
- **If either fails, H2 is REFUTED.**

## 6. CONTROLS

- **C1 (carried forward):** the ORACLE must still beat ungated generation. If it
  does not, the rig changed and H2 is untestable.
- **C2 (carried forward):** the gate must still beat always-cross-fade.
- **C4 (carried forward):** CPU and `MLP_LAYER_WGSL` forward passes to 1e-5.
- **C5 (new): THE THRESHOLD NEVER SAW THE HELD-OUT SCENE.** The tau-selection
  function is given VALIDATION rows only, structurally -- it takes no argument
  that could carry checker rows, exactly as `features()` takes no ground truth.
- **C6 (new): A POSITIVE CONTROL ON THE TAU MACHINERY.** Rate matching applied to
  the ORACLE's own scores must reproduce the oracle's keep rate. If the mechanism
  cannot hit a rate it is handed, any tau it returns is meaningless and the round
  reports that instead of a null.

## 7. WHAT WOULD MAKE THIS ROUND A FAILURE, IN ADVANCE

- **AUC near 0.5 on held-out** -> E2. Report it. That is a *more* important finding
  than H2 would have been: it would say the eleven features carry scene identity
  rather than a mechanism, and it would retire the whole feature set rather than
  its operating point.
- **H2 refuted with AUC well above 0.5** -> the ranking transfers and the dB does
  not. Report both; that is a real and specific result about how little a good
  ranking is worth when the per-block gains are small.
- **Rate matching keeps nearly everything** -> the gate degenerates into ungated
  generation and H2 becomes untestable in the other direction. Name it as a
  collapse, do not report the resulting near-zero difference as a finding.
- **C6 fails** -> the tau machinery is broken; fix it or report it, do not measure
  through it.

## 8. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S5:** accuracy-maximising tau (section 4).
- **S6:** held-out AUC, accuracy, and the keep rate against the oracle's.
- **S7:** the same test in-distribution on `zone`. Easier, and worth less.
- **S8:** whether retraining on `smooth` alone (a smaller set) changed the
  in-distribution behaviour -- a confound this round introduces on purpose and
  must therefore report.

## 9. WHAT THIS ROUND CANNOT CONCLUDE

- Nothing about FSR4.
- Nothing about a **bigger** network or a **different** feature set: the width is
  still the 16 fixed in v4689 section 3, and the eleven features are unchanged.
  This round moves the operating point and nothing else, so that a result can be
  attributed to the operating point and nothing else.
- Nothing about real hardware. SwiftShader is not a GPU.
- Nothing about scenes outside these three.
