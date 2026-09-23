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

## OUTCOME -- H4 IS CONFIRMED, AND IT IS THE LARGEST EFFECT THIS ARC HAS MEASURED

Collected after everything above was committed. Frames 3–53, 51 paired frames.

    mean delta   +1.7992 dB      sd 1.9086      43 up / 8 down
    worst -2.43 dB               best +6.52 dB
    paired t = 6.732, df 50      ONE-SIDED p = 7.9e-9
    sign test 43/51              ONE-SIDED p = 3.4e-7

**Both tests clear, as the pre-registration required.** Dilation moved a median of 426 pixels
per frame — 0.97% of the picture.

Against the arc's other two switchable features, measured the same way on the same page:

    shading mask    +0.117 dB    (v4656, 21/21 up)
    reactive mask   +0.400 dB    (v4658, 37/14)
    DILATION        +1.799 dB    (here,  43/8)

Four and a half times the reactive mask and fifteen times the shading mask. That is what a
missing *structural* pass looks like next to two refinements: FSR2 runs dilation before depth
clip for a reason, and this tree had been feeding every downstream consumer undilated data since
those consumers were written.

It is not free. **Eight frames are worse, one by 2.43 dB** — a larger single-frame loss than the
reactive mask's worst (1.22 dB). Giving a background pixel the foreground's motion sends its
history somewhere the background never went, and on some frames that costs more than the spurious
disocclusions it removes. The mean is decisive; the variance is real and is not smoothed over
here.

## SECONDARY S1 -- THE TWO FEATURES OVERLAP, AND DILATION SUBSUMES MOST OF THE REACTIVE MASK

Declared in advance, reported as a count, **not used to decide H4**:

    the reactive mask, dilation OFF   14 of 51 frames worse   mean +0.4004 dB
    the reactive mask, dilation ON    18 of 51 frames worse   mean +0.0820 dB

With dilation on, the reactive mask's benefit **nearly vanishes** — a fifth of what it was — and
it harms *more* frames rather than fewer.

That is coherent with v4663 rather than surprising: v4663 localised the mask's entire effect,
help and harm alike, to about one percent of the picture at the moving slab's silhouette, and
dilation rewrites exactly that population first. Most of what the mask was buying, dilation has
already bought. What is left of the mask is the part that was going the wrong way.

**This does not say the reactive mask should be removed.** It says that on THIS content the two
overlap, and FSR2 ships both because its reactive mask exists for shader-animated and transparent
content — particles, foliage — which this page does not have and which dilation cannot help with
at all. A null on one scene is not a verdict on the feature.

## WHAT THIS DOES NOT ESTABLISH

* **Whether dilation is right in general.** One scene, one camera, one slab, one upscale ratio.
* **Which consumer the gain came from.** v4664 routed the clip test, the lock ring and the
  reactive mask to the dilated field together. A per-consumer breakdown is a different experiment
  and nothing here separates them. **— ANSWERED AT v4666, see below.**
* **Why eight frames lose.** The same shape of question three refuted hypotheses have already
  been spent on for the reactive mask, and it is not answered here for this one either.
* **That the default should change.** The page still ships dilation OFF, because every figure in
  its prose and in five gates was measured on that arm. Moving the default is a separate round
  with its own re-measurement, not a consequence of this one.


---

# v4666 -- WHICH CONSUMER THE GAIN CAME FROM

**Exploratory, and labelled so.** This is a decomposition of an effect already confirmed under
pre-registration above, not a new hypothesis test. The clip-only arm is a paired A/B of the same
design as the primary and its statistics are quoted on that basis; the contrast between the two
dilated arms is a **post-hoc** comparison and is reported as one.

v4664 routed three consumers to the dilated field in a single change — the clip chain
(disocclusion, the rectify pass, and the depth **record** kept for next frame), the lock ring,
and the reactive mask. The +1.80 dB was their sum. A control now scopes the mask separately.

    clip chain only   vs baseline   +1.7231 dB   t = 5.87  p = 1.7e-7   sign 41/51  p = 7.4e-6
    both consumers    vs baseline   +1.7992 dB   t = 6.73  p = 7.9e-9   sign 43/51  p = 3.4e-7
    adding the mask   to the clip   +0.0761 dB   t = 1.38  p = 8.7e-2   sign 29/50  p = 1.6e-1

**The clip chain carries 96% of the gain.** Giving the reactive mask the dilated field as well is
worth +0.076 dB and clears **neither** test — 29 frames up against 21 down is close to a coin
flip. v4664 routed all three together; for the mask that choice was not justified by measurement,
and now it has been measured. It is not *harmful* — the point estimate is positive — it is simply
not distinguishable from nothing on this content.

The lock ring is deliberately not in the switch, and that is a measurement rather than an
oversight: it feeds `shadingShift`, and the shading mask is OFF in every arm these figures were
taken on. Its ring is `2 * jitterPhaseCount` slots and never fills inside scene 3–53 anyway,
which v4662 measured as identical to four decimals. A third option would be a control that cannot
move its own number.

## AND THE REACTIVE MASK'S VALUE COLLAPSES EITHER WAY

    the mask is worth, no dilation                +0.4004 dB   14 of 51 frames worse
    the mask is worth, dilation on the clip only  +0.0059 dB   26 of 51 frames worse
    the mask is worth, dilation on the mask too   +0.0820 dB   18 of 51 frames worse

Once the clip chain is dilated, the mask is worth **six thousandths of a dB** and harms half the
frames it touches. Feeding it dilated motion recovers it to +0.082 — a fifth of its undilated
value, and still not separable from zero.

This sharpens v4665's secondary rather than replacing it: the overlap is not between dilation and
the mask *in general*, it is specifically that **the clip chain's dilation is what removes the
mask's job**. The mask was earning its +0.400 dB by catching silhouette pixels whose history the
clip test was mishandling; dilation makes the clip test handle them correctly, and there is
nothing left to catch.

As at v4665, this is not a case for deleting the mask. FSR2 ships it for shader-animated and
transparent content — particles, foliage — that this page does not contain and that dilation
cannot help with at all.

## WHAT v4666 STILL DOES NOT SETTLE

* **The eight frames dilation loses**, one by 2.43 dB. Unchanged and unexplained.
* **Whether the mask would earn its keep on content that has what it is for.** This page has no
  particles and no transparency; the measurement above says what the mask is worth *here*, on a
  scene built to exercise object motion, and nothing more.
* **Whether the default should move.** Still a separate round with its own re-measurement.
