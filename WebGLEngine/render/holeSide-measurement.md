# v4679 -- THE RESULT OF THE PRE-REGISTERED SIDE-RULE REPLACEMENT

`render/holeSide-preregistration.md` is committed separately and **is not edited by this file**. It states the
mechanism, the four hypotheses and the 1 dB threshold before any of this was collected. Every number here is
reproduced by `node render/flowReconcile-selfcheck.mjs`'s sibling, `render/holeFill-selfcheck.mjs`, section 7.

## THE TABLE

PSNR on the originally-holed pixels, against the frame really rendered at t = 0.5. A slab at half the wall's
distance slides across it; the motion field is the scene's own knowledge at block 1, so the flow's error is
deliberately absent.

### slab travel 8.786 px (hole strip 4.39 px), 256 holes

| radius | `derived` | abstained | `depth` | abstained | unfilled (both) |
|---|---|---|---|---|---|
| 2 | 25.5876 dB | 128 | **28.0808 dB** | 128 | 0 |
| 4 | **EXACT** | 0 | **EXACT** | 0 | 0 |
| 8 | EXACT | 0 | EXACT | 0 | 0 |
| 12 | EXACT | 0 | EXACT | 0 | 0 |

### slab travel 17.573 px (hole strip 8.79 px), 576 holes

| radius | `derived` | abstained | `depth` | abstained | unfilled (both) |
|---|---|---|---|---|---|
| 2 | 26.9644 dB | 128 | 27.8653 dB | 128 | 320 |
| **4** | **24.7571 dB** | 256 | **25.8220 dB** | 256 | 64 |
| 8 | 32.1432 dB | 64 | 33.5039 dB | 64 | 0 |
| 12 | EXACT | 0 | EXACT | 0 | 0 |

## THE HYPOTHESES, AS DECLARED

* **H1 — CONFIRMED.** `depth` is exact wherever the heuristic already was, so it is a replacement and not a
  trade.
* **H2 — CONFIRMED, and the margin is reported because it is thin.** The declared primary cell is 17.573 px at
  radius 4: **24.7571 → 25.8220 dB, +1.0648**, against a threshold of 1 dB declared in advance. It clears by
  **0.0648 dB — 6.5% of the threshold**. That is a pass by the rule that was written down, and a threshold
  that nearly bound is evidence about how the threshold was chosen, so both facts are stated together.
* **H3 — REFUTED, and the way it is refuted matters more than the direction.** The prediction was that the
  abstention count at radius 4 would fall below 256. It is **256 under both rules**, and **the two sets of
  abstaining pixels share not one pixel**: 256 are the heuristic's alone and 256 are the depth test's alone.
  A record that compared only the counts would have reported no effect at all. Every one of the depth test's
  abstentions holds the **occluder's** vector rather than the background's, so its cause is the vector search
  failing to reach across an 8.79 px hole at radius 4 — not the side decision.
* **H4 — CONFIRMED, as a predicted non-effect.** The unfilled count is identical under both rules at every
  radius (320/320, 64/64, 0/0, 0/0). Declared in advance so it could not be presented as a discovery, and it
  is what makes H2 interpretable: the two rules are compared on the same pixels.

## ONE SECONDARY, LABELLED

Not pre-registered: at radius 2 on the **slow** scene the depth test gains **+2.4932 dB** (25.5876 → 28.0808),
larger than the primary. It is reported beside the primary and not in place of it — the record named one cell,
and this is a different one.

## THE DEVIATION FROM THE PRE-REGISTERED DECISION RULE

The record said: *"H2 clearing 1 dB ⇒ make it the default."* H2 cleared. **The default was not changed, and
this is a deviation, not an omission.**

`side: "depth"` requires two inputs `side: "derived"` does not. Making it the default would make
`fillHolesCPU` throw for every caller that has not been updated; and the only way to avoid that — falling back
to `derived` when the buffers are absent — is a silent switch between two rules that this very table shows
differ by 1.06 dB. A silent switch between two measurably different rules is the one thing this tree refuses
outright, and a pre-registered decision rule does not outrank that.

What shipped instead: `depth` is documented as the rule a caller holding depth buffers should pass, the guard
names both what it is and what it needs, and a gate row asserts the default is unchanged and says why. The
decision rule should have anticipated the input requirement; it did not, and that is a defect in the
pre-registration rather than in the result.

## WHAT IS STILL NOT TESTED

Rotation, scale, a non-planar occluder, an estimated motion field, and `fsr.html`, which still calls none of
this. The radius still carries the job of finding the background vector, and section 4 of the gate measures
that the shipped default of 4 is 6 dB wrong for an occluder moving 17.6 px.
