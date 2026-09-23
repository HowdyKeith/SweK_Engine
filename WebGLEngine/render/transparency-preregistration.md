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

## OUTCOME

NOT YET COLLECTED. Appended in a later commit, whichever way it falls.
