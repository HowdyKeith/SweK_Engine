# v4682 -- THE SPEED CURVE, AND THE PRIMARY HYPOTHESIS IS REFUTED

`render/genspeed-preregistration.md` is committed separately and **is not edited by this file**. Every number
here is reproduced by `node tools/ship/fsrPageGen-selfcheck.mjs`, section 4.

## THE CURVE

`objects` camera, both masks off, dilation at its shipped default, four generated frames per speed. Delta is
the generated frame's PSNR minus the cross-fade's, both against a reference rendered at the half-integer scene
time.

| slab speed | deltas (dB) | mean | up | displacement (px mean) | unreachable pixels |
|---|---|---|---|---|---|
| ×1 | -0.38, -0.82, -0.25, -0.37 | **-0.455** | 0/4 | 0.96 | 0, 0, 0, 0 |
| ×2 | -0.89, -1.03, -1.09, -1.00 | **-1.003** | 0/4 | 1.82 | 0, 0, 0, 0 |
| ×4 | -0.85, -0.89, -0.84, -0.85 | **-0.857** | 0/4 | 3.61 | 0, 0, 0, 0 |
| ×8 | -1.18, -1.18, -1.04, -0.99 | **-1.097** | 0/4 | 6.89 | 0, 8, 88, 96 |

## THE HYPOTHESES, AS DECLARED

* **H1 — REFUTED.** There is no speed among the four at which the generated frame beats the cross-fade.
  Sixteen frames across an 8× range of speed and **not one of them positive**.
* **H2 — REFUTED.** The mean delta is not monotone: it falls, falls, **rises**, falls. Speed is not even the
  axis this varies along.
* **H3 — NOT EVALUABLE.** There is no crossover to locate.
* **H4 — CONFIRMED**, as the predicted non-effect. ×1 reproduces v4681's four deltas to the printed digit, so
  the control is the identity where it says it is and the other three cells are comparable to it.

## WHAT THE REFUTATION MEANS, WHICH THE RECORD DECLARED IN ADVANCE

> The honest outcome then is to report that this page's frame generation loses across an 8× range of
> displacement, and that the gap to the fixtures is therefore **not** explained by displacement alone — which
> would point at the accumulated inputs, the block size, or the block-resolution field, and would be a larger
> finding than a crossover.

At ×8 the page runs at **6.89 px** of mean displacement — more than double the **3.2 px** at which
`render/frameInterp-selfcheck.mjs` reads **+9.91 dB** — and still reads −1.097 dB. **v4681's diagnosis was
wrong.** That round attributed the deficit to the page simply being too slow; it is not the speed.

## THE SUSPECT WITH FIXTURE EVIDENCE BEHIND IT: THE BLOCK SIZE

Already measured, `render/holeFill-selfcheck.mjs`'s slab scene with an exact field:

| block | dB | vs cross-fade (31.66) |
|---|---|---|
| 1 | 36.79 | +5.13 |
| 2 | 36.79 | +5.13 |
| 4 | 35.58 | +3.92 |
| **8** | **31.48** | **-0.18** |
| 16 | 29.18 | -2.48 |

**At block 8 the warp already loses to the cross-fade on the fixture.** The +9.91 dB figure comes from the
**wall** scene, which has no silhouette at all: uniform motion, where the block grid costs nothing because
every block holds the same vector. This page has a silhouette and uses block 8.

That is a hypothesis with fixture evidence and **no page measurement**. The page has no block-size control, so
section 4 prints these numbers and asserts nothing about them. Adding the control is the next round.

## A SECOND READING, SMALLER AND ALSO PRE-DECLARED NOWHERE

At ×8 the hole filler starts leaving pixels unreachable (0, 8, 88, 96), which is
`render/holeFill-selfcheck.mjs` section 4's finding — the radius must grow with the displacement and the pass
does not work it out for the caller — arriving on a picture for the first time. The page passes radius 8 and at
×8 that is no longer enough. Labelled secondary; it is far too small to account for a 1 dB deficit that is
already present at ×1 where nothing is unreachable.

## WHAT IS STILL NOT TESTED

A paired statistical test (four frames per speed is a sign, not a p-value), the block size, and the
accumulated inputs. Both frames the generator reads have been through temporal accumulation and RCAS; the
cross-fade carries the same handicap, so the **difference** is fair and the absolute dB are not.
