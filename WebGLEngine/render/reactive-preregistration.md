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
* **Frames.** **54 to 98 inclusive -- 45 frames**, disjoint from the 3-53 that produced the
  lead. Fixed by the design probe below and written here BEFORE any outcome was collected; see
  `git log` for the ordering. 21 of them are narrow and 24 wide, so neither group is a handful.
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

## THE DESIGN PROBE -- RUN, AND ITS RESULT

One probe collected the GROUPING variable only -- the declined counts over frames 54-163 -- and
never read `dTmp`. Its question is whether the two groups still exist past frame 53 at all (the
slab is moving, and if it leaves the frame the groups collapse). That is a question about
whether the design is valid, not about the effect, and looking at it does not spend the test.

**Result, over frames 54-163:**

    declined = 212   24 frames
    declined = 106   21 frames
    declined = 0     65 frames
    invalid or offscreen non-zero on any frame:  NO

The two groups survive to **frame 98** and then the count falls to zero and stays there: the
slab has walked out of the depth gate's reach, so past that point the grouping variable does not
exist and there is nothing to split. The 65 zero-count frames are therefore excluded -- by the
rule the section above already fixed ("a frame whose count is neither of those two values is
excluded"), on a variable collected without looking at any outcome, and not by a choice made
after seeing which way the deltas fell.

The alternation is also still near-perfect here (212 106 212 106 ... with the occasional
doubled run), a hundred frames after v4649 first recorded it and still with no measured cause.

## OUTCOME -- H IS CONFIRMED

Collected after everything above was committed. Frames 54-98, both arms, 45 frames kept and
none excluded.

    NARROW (106)   n=21   mean +0.7457 dB   sd 0.6446   19 up / 1 down
    WIDE   (212)   n=24   mean +0.4029 dB   sd 0.3552   22 up / 2 down

    difference (narrow - wide)  =  +0.3428 dB
    Welch t = 2.166   df = 30.2   ONE-SIDED p = 0.0192

**H is confirmed at the pre-declared threshold**, and the effect size replicates almost exactly:

    v4659, frames  3-53 (discovery)   narrow 0.586   wide 0.235   difference 0.351 dB
    v4660, frames 54-98 (confirming)  narrow 0.746   wide 0.403   difference 0.343 dB

Two disjoint samples, two nearly identical differences, the second from a test that did no
searching. The wide/narrow split is a real property of this content and not the residue of
trying eight predictors.

## AND IT DOES NOT EXPLAIN WHAT IT WAS FOUND WHILE LOOKING FOR

This search began at v4659 with one question: **why does the reactive mask make 14 of 51 frames
WORSE, one by 1.22 dB?** H was confirmed. That question is still open, and the confirming sample
is what makes it clear:

    frames 3-53   14 of 51 harmed, worst -1.22 dB
    frames 54-98   3 of 45 harmed, worst -0.50 dB

The harm nearly vanishes in the later segment **while the wide/narrow effect stays exactly the
same size.** So the split predicts a difference in how much the mask HELPS, which is present in
both segments; it does not predict the HARM, which is concentrated in the early frames and is
still unaccounted for. A round that reported "confirmed, p = 0.019" and stopped would have left
a reader believing the original defect had been explained. It has not been.

The obvious next suspicion is that the early frames are the ones where the accumulator has not
yet converged, so the history the mask is judging is itself poor. That is a story, not a
measurement, and it is written here as a candidate for the next test and not as a conclusion --
the same restraint `tools/ship/fsrPageObjects-selfcheck.mjs` asks for around the 212/106
alternation, whose cause this file also does not claim to know.

## WHAT THIS DOES NOT ESTABLISH

* **Why the count alternates.** Confirming H says the alternation PREDICTS the size of the
  benefit. It says nothing about what causes a 2:1 alternation, which v4649 measured and left
  unexplained and which this file does not claim to have solved.
* **A different scene.** The 45 confirming frames are a later segment of the SAME trajectory
  through the SAME content. That is a genuine out-of-sample test of the hypothesis on frames
  that played no part in forming it -- it is not a replication on independent content, and the
  two are not the same claim.
* **The other direction.** The test was one-sided by declaration. It could only ever confirm
  narrow > wide; a large effect the other way would have been reported as a refutation.
