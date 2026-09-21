# v4660 -- ONE PRE-DECLARED TEST OF v4659's LEAD

This file is committed BEFORE the confirming data is collected. That ordering is the whole
point of it, and `git log` is what makes the claim checkable rather than asserted. Nothing
below may be edited after the run; the outcome goes in a separate section appended by a
separate commit, whichever way it falls.

## WHY A PRE-REGISTRATION AT ALL

v4659 searched for an explanation of the harm v4658 measured -- the reactive mask makes 14 of
51 frames worse, one by 1.22 dB -- and reported this:

> Frames with the wider (212-pixel) depth-gated set average +0.235 dB against +0.586 for the
> narrow (106) ones, Welch t = 1.97, p = 0.056, and 10 of the 14 harmed frames sit in the wide
> group.

**That number is worth nothing as it stands, and v4659 said so.** It was the best of EIGHT
predictors tried against the same 51 frames:

    flagged, declined, declinedInvalid, declinedOffscreen, declinedDepth, p50, p90, p99

Under eight independent tests the smallest p-value from pure noise averages around 1/9 = 0.11,
so 0.056 is barely better than what noise hands you for free. Reporting it as a finding would
be the same defect as quoting the t-test at 21 frames and not the sign test -- the mistake
v4658 recorded in its own closing. A lead found by searching has to be confirmed by a test that
did no searching.

## THE HYPOTHESIS

**H:** the reactive mask's benefit is SMALLER on frames where its depth-gated decline set is the
wide one than on frames where it is the narrow one.

The direction is predicted, not read off the data: wide, then less benefit. A result in the
opposite direction refutes H even if it is large and significant.

## THE TEST -- EXACTLY ONE

* **Design.** Paired A/B on the same frames: `reactive: ON` and `reactive: OFF`, everything
  else identical. The pipeline is deterministic -- v4659 re-ran frames 3-53 and reproduced them
  bit-identically -- so the per-frame difference is signal, not run-to-run noise.
* **Outcome variable.** `delta(f) = PSNR_on(f) - PSNR_off(f)`, in dB, from the page's `dTmp`.
* **Grouping variable.** The frame's `declinedDepth` as the page's `reactstat` readout prints
  it, split at the median of the two values the content produces. A frame whose count is
  neither of those two values is excluded, and the exclusion is reported.
* **Statistic.** Welch's two-sample t-test on `delta`, WIDE group against NARROW group,
  **one-sided** in the predicted direction (narrow > wide).
* **Threshold.** p < 0.05. Anything above it does not confirm H.
* **Frames.** 54 onward, disjoint from the 3-53 that produced the lead. The exact upper bound
  is set by the design probe (below) and written in before the outcome is collected.
* **Scene / camera.** `smooth` and `objects` -- the same content v4659 measured, deliberately,
  so that the only thing changed is which frames.

## WHAT IS NOT BEING TESTED

* The other seven predictors. They are not re-run and no p-value for them is reported here.
  Adding any of them back turns this into the same multiple-comparison search it exists to
  check.
* Any story about WHY the count alternates. `tools/ship/fsrPageObjects-selfcheck.mjs` has said
  since v4649 that the pixel-boundary explanation is unmeasured and that "a 2:1 ratio is not
  what 2.42 px/frame would obviously give". Confirming H would say the alternation PREDICTS the
  harm; it would not say what causes the alternation, and this file will not be used to imply
  it does.
* The jitter hypothesis, which v4659 refuted (r = +0.17, wrong direction) and which is recorded
  in `render/reactive.mjs`'s header.

## THE DESIGN PROBE

Before the run, one probe collects the GROUPING variable only -- the declined counts over the
fresh frames -- and never reads `dTmp`. Its question is whether the two groups still exist past
frame 53 at all (the slab is moving, and if it leaves the frame the groups collapse). That is a
question about whether the design is valid, not about the effect, and looking at it does not
spend the test. The probe's output is recorded below with the outcome.

## OUTCOME

NOT YET COLLECTED. Appended in a later commit, whichever way it falls.
