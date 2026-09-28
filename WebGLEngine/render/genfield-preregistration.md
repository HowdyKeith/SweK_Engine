# v4683 -- PRE-REGISTERED: IS THE BLOCK GRID WHAT IS COSTING THE PAGE ITS FRAME GENERATION?

Committed BEFORE the control exists and before any number is collected. `tools/ship/fsrPageGen-selfcheck.mjs`
section 4 ends by printing this suspect and asserting nothing about it, because it had fixture evidence and no
page measurement:

> render/holeFill-selfcheck.mjs's slab scene, exact field: block 1 reads 36.79 dB, block 2 36.79, block 4
> 35.58, block 8 31.48, block 16 29.18 -- against a cross-fade of 31.66. **AT BLOCK 8 THE WARP ALREADY LOSES
> ON THE FIXTURE, by 0.18 dB.** The +9.91 dB result is the WALL scene, which has no silhouette: uniform
> motion, where the block grid costs nothing.

v4682 refuted the displacement explanation across an 8× range of speed. This is the remaining one.

## THE CHANGE -- DECLARED HERE

A `genfield` control on `fsr.html` with two settings:

* **`block` (the default)** — exactly what v4681 and v4682 measured: `render/flowReconcile.mjs`'s field on an
  8-pixel grid, 576 blocks at the display resolution.
* **`pixel`** — the **application's per-pixel** motion field, negated into the generator's forward sense, used
  at every pixel whose `valid` channel is set; the containing block's reconciled vector is used where it is
  not. The block flow is still computed, so the colour flow still answers for anything the application cannot.

*** THE SEARCH BLOCK IS NOT SHRUNK, AND THAT IS DELIBERATE. *** v4673 measured that a block matcher's patch
must stay large — a 2×2 SAD on a smoothed field is nearly flat, and three pyramid levels at a small patch made
the answer WORSE than one. Shrinking the search block would change two things at once and would test the
matcher rather than the grid. The application's field is already per-pixel and needs no search at all.

## THE HYPOTHESES

* **H1 — the primary.** At slab speed **×4** the per-pixel field's mean delta against the cross-fade is
  **positive**, and at least **3 of the 4** measured frames are up. ×4 is named in advance because it is the
  cell where v4682 measured 3.61 px of displacement — the fixtures' regime — with the block field reading
  −0.857 dB.
* **H2.** At **every** speed the per-pixel field's mean delta is **above** the block field's. A field that
  helped at one speed and hurt at another would not be evidence about the grid.
* **H3 — a predicted NON-effect.** The `block` arm's deltas are **unchanged** from v4682's table
  (−0.455, −1.003, −0.857, −1.097 dB mean at ×1, ×2, ×4, ×8). The control defaults to `block` and nothing else
  moves; if they shift, the arriving control changed something it should not have and H1 is not interpretable.

## WHAT WOULD FALSIFY THE ROUND

H1 failing. The honest outcome then is to report that **neither** displacement nor the block grid explains the
page's deficit, and that the remaining difference between this page and the fixtures is the one thing both
earlier records have named and neither has tested: **the inputs are accumulated frames**, so the "motion"
between them is not the scene's motion but the accumulator's response to it. That would be a finding about
measuring frame generation downstream of a temporal upscaler, and it would close this arc on an honest open
question rather than a result.

H2 failing while H1 passes is a half-result and would be labelled one cell, not a curve.

## WHAT IS NOT BEING TESTED

* A paired statistical test. Four frames per cell is a sign.
* The search block size, for the reason above.
* Whether the per-pixel field is what FSR3 uses. FSR3 reprojects game motion vectors at full resolution and
  uses optical flow to catch what they miss, which is what the `pixel` setting approximates; this record
  claims a measurement on this page, not fidelity to AMD's pass.
