# v4683 -- THE FIELD'S RESOLUTION IS NOT IT EITHER, AND WHAT IS

`render/genfield-preregistration.md` is committed separately and **is not edited by this file**. Every number
here is reproduced by `node tools/ship/fsrPageField-selfcheck.mjs`.

## SECTION 1 -- THE PRE-REGISTERED TEST

`objects` camera, masks off, presented inputs, four generated frames per cell. Delta is the generated frame's
PSNR minus the cross-fade's, both against a reference rendered at the half-integer scene time.

| scene | speed | field | cells | deltas (dB) | mean | up |
|---|---|---|---|---|---|---|
| smooth | ×1 | block 8 | 576 | -0.38, -0.82, -0.25, -0.37 | **-0.455** | 0/4 |
| smooth | ×1 | per-pixel | 36,864 | -0.42, -0.69, -0.70, -0.40 | **-0.552** | 0/4 |
| smooth | ×4 | block 8 | 576 | -0.85, -0.89, -0.84, -0.85 | **-0.857** | 0/4 |
| smooth | ×4 | per-pixel | 36,864 | -1.02, -1.09, -1.06, -1.13 | **-1.075** | 0/4 |

* **H1 — REFUTED.** At the declared cell (×4, per-pixel) the mean is −1.075 dB and 0 of 4 frames are up. The
  bar was a positive mean **and** 3 of 4 up.
* **H2 — REFUTED, and in the opposite direction.** The per-pixel field is **worse** at both speeds.
  `render/holeFill-selfcheck.mjs` reads **+5.13 dB** for block 1 over block 8 on its fixture; sixty-four times
  the field resolution makes this page worse.
* **H3 — CONFIRMED**, as the predicted non-effect. The block arm reproduces v4682's means exactly (−0.455,
  −0.857), so two new selects on the page moved nothing they default away from.

## SECTION 2 -- SECONDARY, UNDECLARED: THE ACCUMULATED INPUTS

The pre-registration named this as what a failure would **leave**, not as a test, so it is labelled secondary
and was not used to settle H1. `gensource: clean` interpolates between two reference renders instead of two
presented frames, removing the accumulator, the resolve and RCAS from the inputs.

| speed | presented | clean | difference |
|---|---|---|---|
| ×1 | -0.455 | **-0.433** | 0.022 dB |
| ×4 | -0.857 | **-0.835** | 0.022 dB |

The control fires — the per-frame deltas differ and the displacement moves 0.96 → 0.91 px — and the mean does
not move. **The accumulator is not what it is losing to.**

So all three explanations this arc offered are refuted: **displacement** (v4682, across an 8× range), **field
resolution** (H1/H2), and **accumulated inputs** (here).

## SECTION 3 -- SECONDARY, UNDECLARED: THE FIRST POSITIVE READING ON A PICTURE

The page's own `scene` control is the variable nobody had varied. Every figure this arc took on the page was
taken on `smooth`, whose option text reads *"nothing to recover"*.

| scene | speed | field | deltas (dB) | mean | up |
|---|---|---|---|---|---|
| smooth | ×4 | block 8 | -0.85, -0.89, -0.84, -0.85 | -0.857 | 0/4 |
| zone plate | ×4 | block 8 | -1.16, -0.99, -0.98, -0.73 | -0.965 | 0/4 |
| **pixel checker** | ×4 | block 8 | -0.43, **+0.55**, **+0.28**, **+0.03** | **+0.107** | **3/4** |

**On the pixel checker the generated frame beats the cross-fade.** That is the first positive frame-generation
reading on a real picture anywhere in this tree.

*** AND IT IS A TENTH OF A dB WITH ONE FRAME DOWN. *** It is a direction, not a result. A pre-registered paired
measurement on that scene, with the statistic and threshold fixed in advance, is a round of its own and this
record does not stand in for it.

The mechanism is the obvious one and the ordering supports it: a cross-fade of two offset copies is exactly
right wherever the picture is flat and wrong in proportion to how fast it changes, so a motion compensation's
worth scales with the spatial gradient. And the per-pixel field's sign flips with the scene for the same
reason — on the zone plate it is **better** (−0.965 → −0.512 dB) where on smooth it is worse.

## WHAT IS STILL OPEN

* A pre-registered confirmation on the checker.
* Why sixty-four times the field resolution *hurts* on smooth content — the reverse of the fixture's +5.13 dB.
  Measured here, not explained.
* The search block, still 8 in every cell: `render/opticalFlow.mjs`'s patch must stay large, so the matcher's
  own granularity was deliberately not varied and is therefore not measured.
* The device. The whole FSR3 path from reconciliation to pixels is CPU, so a generated frame costs a readback
  and this page pays it every frame.
