# v4671 -- ONE PRE-DECLARED TEST OF THE TRANSPARENCY RESULT

Committed BEFORE the data is collected. v4669 and v4670 both measured on translucent content and
both said, in the record and in a gate row, that they were **first looks and not pre-registered
confirmations**, naming this round. This is it.

## WHAT IS BEING CONFIRMED

v4669, on frames 3–53 at alpha 0.5, dilation at its shipped default, shading off:

    DERIVED reactive mask vs no mask    +0.6673 dB    51 up / 0 down

Against +0.0820 dB and 18 losses on the same window with an opaque slab. The direction was
predicted in the tree for four rounds before the content existed — `reactiveGPU-selfcheck` since
v4657, v4665 and v4666 in as many words — but no statistic, threshold or window was fixed in
advance, so the number carries none of the credibility the rest of this arc's results do.

## THE TEST -- EXACTLY ONE PRIMARY

* **Design.** Paired A/B on the same frames: reactive mask ON against OFF, `slabalpha 0.5`,
  everything else at the page's defaults. The pipeline is deterministic — v4659, v4660, v4662 and
  v4667 each re-ran a window bit-identically — so the per-frame difference is signal.
* **Outcome.** `delta(f) = PSNR_on(f) - PSNR_off(f)`, in dB.
* **Hypothesis H5.** On translucent content the derived reactive mask improves the reconstruction:
  **mean delta > 0**.
* **Statistic.** A one-sided paired t-test **and** a one-sided sign test. **BOTH must clear
  p < 0.05**, the conjunction v4665 declared for the same reason: v4658's t-test cleared at
  twenty-one frames while its sign test did not, and the round could have quoted whichever it
  preferred.
* **Frames.** **54–98 at `startFrame 0`** — 45 frames, disjoint from the 3–53 that produced the
  first look, exactly as v4660 confirmed on 54–98 what v4659 found on 3–53.
* **Scene / camera.** `smooth` and `objects`, as every measurement in this arc.

## ONE SECONDARY, DECLARED HERE SO IT CANNOT BE FOUND AFTERWARDS

* **Secondary S2.** Does the APPLICATION-supplied mask remain *less reliable* than the derived one
  on the fresh window? v4670 found +0.9024 dB against +0.6673 with a head-to-head of 28 up and 23
  down — a larger mean and near-coin-flip reliability. Collected as the head-to-head sign split
  and reported beside the primary, **labelled secondary**, not used to decide H5, and with no
  p-value from it quoted as a result.

This needs two further arms (app ON, app OFF on the same window), collected in the same run.

## WHAT THIS CANNOT SETTLE

* **One alpha, one scene, one translucent quad.** 0.5 on one surface. Whether the effect scales
  with alpha, or survives overlapping translucent layers, stays unmeasured. A confirmation on a
  second frame window of the same trajectory is an out-of-sample test of the hypothesis, **not** a
  replication on independent content, and those are not the same claim — the point v4662's record
  had to make about its own fourth cell.
* **Anything about FSR2's API.** The app mask here is the crudest honest declaration — a flat
  coverage stencil. A real application's is authored. v4670 said so and this round does not
  revisit it.
* **Whether the two masks should be combined.** FSR2 takes both. Untested here and still the
  obvious next thing.

## OUTCOME -- H5 IS CONFIRMED AND REPLICATES; THE SECONDARY REVERSES

Collected after everything above was committed. Frames 54–98, 45 paired frames, alpha 0.5.

    mean delta  +0.6456 dB    sd 0.2574    45 up / 0 down    worst +0.02  best +1.19
    paired t = 16.824, df 44        ONE-SIDED p = 4.4e-21
    sign test 45/45                 ONE-SIDED p = 2.8e-14

**Both tests clear, as required.** And the effect size replicates almost exactly:

    first look,  frames  3-53   +0.6673 dB    51 up / 0 down
    confirming,  frames 54-98   +0.6456 dB    45 up / 0 down

Two disjoint windows, a difference of two hundredths of a dB, and **ninety-six frames without a
single one going the wrong way**. Nothing else in this arc has that record: dilation loses 8 of
51, the reactive mask on opaque content loses 18, and even the shading mask was only ever
measured over 21.

## SECONDARY S2 -- AND IT DOES NOT REPLICATE. IT INVERTS.

                              frames 3-53 (v4670)      frames 54-98 (here)
    DERIVED vs no mask        +0.6673   51 up /  0     +0.6456   45 up /  0
    APP     vs no mask        +0.9024   48 up /  3     +0.1793   24 up / 20
    APP vs DERIVED            +0.2351   28 up / 23     -0.4662    9 up / 36

v4670 reported the application-supplied mask with **the larger mean**, and framed the finding as
"FSR2's primary path is larger on average and less reliable". On a fresh window the mean advantage
is gone and the sign is reversed: the derived mask wins **36 of 45** head to head.

**The reliable half of v4670's claim survived and the headline half did not.** "Less reliable"
was right — 28/23 was already near a coin flip, and a near-coin-flip is exactly the statistic that
does not replicate. The +0.9024 dB was a property of frames 3–53.

This is what the secondary was declared for. Had v4670's number been carried forward as a
finding, this round would have been publishing a reversal instead of catching one — the same
failure v4659 walked into with eight predictors and v4660 spent a round undoing. The difference
is that this time the exposure was written down before the data existed.

**The record in `render/transparency-measurement.md` is not edited to match.** v4670's figures
were correctly measured on the window it named; they are superseded, not wrong, and a record
quietly rewritten to agree with a later round is a record nobody can audit.

## WHAT THIS STILL DOES NOT SETTLE

* **Why the app mask's advantage was window-specific.** Unmeasured. The obvious candidate is the
  same one v4670 named — it marks 11,130 pixels against the derived mask's 590, so its result
  should swing with whatever the background behind the slab is doing in a given stretch — but
  naming a mechanism is a separate measurement.
* **One alpha, one scene, one translucent quad,** and a second window of the **same trajectory**.
  An out-of-sample test of the hypothesis, not a replication on independent content.
* **Whether the two masks combined beat either.** FSR2 takes both. Still untested, and now more
  interesting than it was: the two disagree about 45 frames in opposite directions.
