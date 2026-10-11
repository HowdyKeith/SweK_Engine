# v4682 -- PRE-REGISTERED: IS THERE A SPEED AT WHICH FRAME GENERATION PAYS ON THIS PAGE?

Committed BEFORE the control exists and before any number is collected. `tools/ship/fsrPageGen-selfcheck.mjs`
closes by naming this round:

> WHETHER FRAME GENERATION IS WORTH ANYTHING ON CONTENT THAT MOVES. This page's slab travels 0.055 world
> units a frame and its camera dollies slowly, so the whole window runs under 1.3 px of mean displacement --
> the regime where a cross-fade wins by construction. A page control for the slab's SPEED would turn this
> one negative reading into a curve, and it does not exist.

## THE READING THIS IS ABOUT

v4681, `objects` camera, both masks off, dilation at its shipped default, four consecutive frames:

| frame | generated | cross-fade | delta | mean motion |
|---|---|---|---|---|
| 2 | 33.24 dB | 33.62 dB | **-0.38** | 0.80 px |
| 3 | 34.37 | 35.19 | **-0.82** | 1.26 px |
| 4 | 35.10 | 35.35 | **-0.25** | 0.89 px |
| 5 | 34.68 | 35.05 | **-0.37** | 0.89 px |

Four of four down. The fixtures in `render/frameInterp-selfcheck.mjs` read **+9.91 dB** at 3.2 px of
displacement, so the two results are not in conflict -- they are at opposite ends of a curve nobody has drawn.

## THE CHANGE -- DECLARED HERE

A `slabspeed` control on `fsr.html` multiplying `SLAB_DX`: **×1 (the default), ×2, ×4, ×8**. Nothing else
changes. ×1 must reproduce v4681 exactly.

## THE HYPOTHESES

* **H1 -- the primary.** There is a speed among the four at which the generated frame **beats** the cross-fade
  on **at least 3 of the 4 measured frames**. The 3-of-4 bar is declared here because four frames cannot carry
  a paired test and a bare majority of four is a coin flip; unanimity minus one is the most a window this short
  can honestly assert.
* **H2.** The mean delta is **monotonically non-decreasing** in speed across the four settings. A curve that
  wandered would mean the speed is not the variable that governs this, and H1 would then be one lucky cell.
* **H3.** The crossover -- the lowest speed whose mean delta is positive -- happens at a **mean displacement
  between 1.3 px and 4.0 px**. Below 1.3 is where v4681 already measured a loss; the fixtures win at 3.2, so a
  crossover above 4.0 would mean something other than displacement is carrying the page's deficit.
* **H4 -- a predicted NON-effect, declared so it cannot be presented as a surprise.** At ×1 the four deltas are
  **unchanged** from the table above, to the printed two decimals. The multiplier defaults to 1 and nothing
  else moves; if they shift, the control has changed something it should not have and H1 is not interpretable.

## WHAT WOULD FALSIFY THE ROUND

H1 failing at every speed. The honest outcome then is to report that this page's frame generation loses across
an 8× range of displacement, and that the gap to the fixtures is therefore **not** explained by displacement
alone -- which would point at the accumulated inputs, the block size, or the block-resolution field, and would
be a larger finding than a crossover.

H2 failing while H1 passes is a reportable half-result: a positive cell without a trend is not a curve, and it
would be labelled as one cell.

## WHAT IS NOT BEING TESTED

* A paired statistical test. Four frames per speed is a sign, not a p-value, and this record does not pretend
  otherwise; a pre-registered paired measurement over 45+ frames is a separate round.
* Block size, which v4678 measured as dominating on a silhouette and which this page does not vary.
* The accumulated inputs. Both frames the generator reads have been through temporal accumulation and RCAS;
  the cross-fade carries the same handicap, so the **difference** is fair and the absolute dB are not.
