# v4684 -- PRE-REGISTERED: THE CONFIRMATION v4683 ASKED FOR, AT A CELL v4683 COULD NOT USE

Committed BEFORE the statistics module exists and before any window longer than four frames has been driven.
`tools/ship/fsrPageField-selfcheck.mjs` closes by naming this round:

> A PRE-REGISTERED CONFIRMATION ON THE CHECKER, which is what the one positive cell above asks for and is
> not. Four frames, mean +0.107 dB, one frame down: a paired test over 45 frames with the statistic and
> threshold fixed in advance is the round this names.

## THE FIRST LOOK, AND WHY THIS IS NOT A REPLICATION OF IT

v4683, `checker` scene, `objects` camera, slab speed ×4, block field, presented inputs, frames 2–5:

| frame | delta (generated − cross-fade) |
|---|---|
| 2 | −0.43 dB |
| 3 | **+0.55** |
| 4 | **+0.28** |
| 5 | **+0.03** |

Mean **+0.107 dB**, 3 of 4 up. No statistic, threshold or window was fixed in advance, so it carries none of
the credibility this tree's confirmed results do.

*** AND ×4 CANNOT SUPPORT A CONFIRMATION WINDOW, WHICH IS MEASURED AND NOT ASSUMED. *** The page prints the
slab's pixel count every frame. Driven on `checker` with the generator off:

| speed | slab pixels, frames 1–12 | last frame with a slab |
|---|---|---|
| ×1 | 11236, 11130, … stable | past 60 |
| ×2 | 11236 ×5, then 11130 … | **38** |
| ×4 | 11236, 11236, 11130, 11130, 11236, 11130, **10176, 9222, 8268, 7420, 6466, 5512** | **17** |

At ×4 the slab starts leaving the frame at frame 7 and is gone by 18. A 45-frame window there would spend
three quarters of its length on a scene with **no moving object at all**, which is not the thing being
confirmed — and the shrinking slab from frame 7 is itself a possible contributor to the ×4 first look that
nothing has separated out.

**So the confirmation must move cells, and that makes it a fresh prediction rather than a replication.** The
arc therefore has a positive first look at a cell it cannot confirm, and this record says so rather than
quietly confirming a neighbour and presenting it as the same result.

## THE PRIMARY -- EXACTLY ONE

* **Design.** One page drive. `checker`, `objects`, slab speed **×2**, `genfield: block`, `gensource:
  presented`, both masks off, dilation at its shipped default. The generated frame and the cross-fade are
  computed from the **same** pair of presented frames on every frame, so the two arms are paired by
  construction and no second drive is needed.
* **Window.** Scene frames **6–38 inclusive — 33 paired frames.** Both ends are derived, not chosen: 6 is the
  first frame disjoint from the 2–5 first look, and 38 is the last frame at which the ×2 slab is still on
  screen by the table above.
* **Outcome.** `delta(f) = PSNR_generated(f) − PSNR_crossfade(f)`, in dB, against a reference rendered at
  scene time `f − 0.5`.
* **Hypothesis H1.** On high-frequency content the generated frame beats the cross-fade: **mean delta > 0**.
* **Statistic.** A one-sided paired t-test **and** a one-sided exact sign test. **BOTH must clear p < 0.05.**
  The conjunction is v4665's rule and is declared here for the reason v4658 established: that round's t-test
  cleared at twenty-one frames while its sign test did not, and the round could have quoted whichever it
  preferred.
* **AND THE STATISTICS MUST BE RECOMPUTABLE.** v4658, v4660, v4665 and v4671 all computed their p-values in
  throwaway drivers and quoted them in prose, so **not one of those numbers is reproducible by any gate in
  this tree.** This round ships `tools/ship/pairedStats.mjs` with its own gate, and that gate must reproduce
  v4665's published sign test — 43 of 51, p = 3.4e-7 — from the counts alone. If it cannot, either the module
  or the published number is wrong, and finding out which is worth more than this round's primary.

## SECONDARIES, DECLARED HERE SO THEY CANNOT BE FOUND AFTERWARDS

* **S1 — power.** The same test on `checker` at **×1**, scene frames **6–50 (45 frames)**, where the slab is
  resident throughout. Reported beside the primary, **not** used to decide H1, and no p-value from it quoted
  as the result.
* **S2 — content specificity.** The same window and speed on **`smooth`**, whose option text reads "nothing to
  recover". Predicted **negative**. If `smooth` also came out positive, the effect is not about spatial
  frequency and H1 would be uninterpretable whatever its p-value.
* **S3 — a predicted NON-effect.** The slab's pixel count is **constant to within one step** across the
  primary window (11236 or 11130 by the table above), so the window does not silently become a no-slab scene
  partway through. If it moves, the window is measuring the slab leaving.

## WHAT WOULD FALSIFY THE ROUND

Either test failing at ×2. The honest outcome then is that the arc has **one unconfirmed positive first look**
at a cell the rig cannot re-drive, and no confirmed case anywhere of frame generation beating a cross-fade on
this page — which is a smaller claim than v4683's closing line implies and would be stated as such.

## WHAT IS NOT BEING TESTED

Held-out content (the checker is the scene the effect was found on, and a confirmation on the same scene at a
different speed is not a generalisation claim), the device, the search block size, and whether any of this
survives on content that is not a synthetic test pattern.
