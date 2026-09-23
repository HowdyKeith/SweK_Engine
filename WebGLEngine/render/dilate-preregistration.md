# v4665 -- IS FSR2's DILATION PASS WORTH HAVING, ON THIS CONTENT?

Committed BEFORE the data is collected. `git log` is what makes that ordering checkable rather
than asserted; nothing above the OUTCOME section may be edited after the run.

## WHY THIS IS A REAL QUESTION AND NOT A FORMALITY

v4664 built the pass and showed on a fixture that it removes **112 spurious disocclusions and
leaves 0** — every one of them an artefact of a silhouette pixel carrying the background's zPrev.
That is a correct description of the mechanism and it is **not** evidence that the picture
improves. The gate says so in its own closing line.

Three things could each be true instead:

* the disocclusions it removes were **already harmless**, because the history factor downstream
  weighted them into insignificance;
* it removes spurious ones and **adds** real errors, by giving a background pixel the
  foreground's motion and reprojecting it to the wrong place;
* the effect is **real but smaller than the frame-to-frame spread**, which v4656 measured as the
  reason an unpaired reading cannot see an effect this size at all.

## THE TEST -- EXACTLY ONE PRIMARY

* **Design.** Paired A/B on the same frames: `dilate: ON` and `dilate: OFF`, everything else
  identical and at the page's defaults. Deterministic pipeline — v4659, v4660 and v4662 each
  re-ran a window bit-identically — so the per-frame difference is signal, not run-to-run noise.
* **Outcome.** `delta(f) = PSNR_dilate_on(f) - PSNR_dilate_off(f)`, in dB.
* **Hypothesis H4.** Dilation improves the reconstruction: **mean delta > 0**.
* **Statistic.** A one-sided paired t-test **and** a one-sided sign test. **BOTH must clear
  p < 0.05 for H4 to be confirmed.** This is declared in advance because v4658 learned it the
  hard way: at twenty-one frames its t-test cleared and its sign test did not, and the round
  could have quoted whichever it preferred. Requiring both removes that choice before the data
  exists.
* **Frames.** Scene 3–53, at `startFrame 0` — 51 frames. This is the window v4663 localised the
  reactive mask's harm to, and the window whose silhouette population dilation acts on.
* **Scene / camera.** `smooth` and `objects`, as every measurement in this arc.
* **Masks.** Shading OFF (its ring never fills inside this window, so it is all zeros here
  anyway — measured at v4662, identical to four decimals). Reactive ON, the page's default.

## ONE SECONDARY, DECLARED HERE SO IT CANNOT BE FOUND LATER

v4663 established that the reactive mask's whole effect — help and harm — lives in about **one
percent of the picture**, the ring at the moving slab's silhouette. That is exactly the
population dilation rewrites. So:

* **Secondary S1.** With dilation ON, does the reactive mask still harm 14 of 51 frames?
  Collected as a **count**, reported beside the primary, and **labelled secondary**. It is not
  used to decide H4 and no p-value from it is quoted as a result. Declaring it here is what stops
  it becoming a finding discovered after the fact — the mistake v4659 made with eight predictors
  and v4660 had to spend a whole round correcting.

This needs two further arms (dilate ON with reactive OFF, to pair against dilate ON with reactive
ON), and those are collected in the same run.

## WHAT THIS CANNOT SETTLE

* **Whether dilation is right in general.** One scene, one camera, one slab, one upscale ratio.
  FSR2 ships this pass for content this page does not have — thin geometry, fast motion, foliage
  — and a null result here would say nothing about those.
* **Whether the LOCKS and the REACTIVE MASK should read dilated data.** In FSR2 they do. In this
  tree the lock ring and the reactive mask now read `motionUsed` alongside the clip test, which
  is a wiring choice v4664 made and did not measure separately. A per-consumer breakdown is a
  different experiment.
* **Anything about the harm's cause.** Three explanations are already spent (the jitter, the
  wide/narrow split, the history's age). If S1 shows the harm surviving dilation untouched, that
  is a fourth thing it is not; if it shows the harm gone, that is an association on one window
  and not a mechanism.

## OUTCOME

NOT YET COLLECTED. Appended in a later commit, whichever way it falls.
