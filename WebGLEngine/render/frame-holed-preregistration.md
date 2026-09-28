# v4709 -- PRE-REGISTRATION: do frames with any occlusion lose, on frames re-rendered at another resolution?

**Written before any frame at upscale 1.5x or 3x has been harvested. The commit
that carries this file contains NO data.** The statistic and runner are
committed WITH it as `tools/ship/frameHoled.mjs`, gated on synthetic frames by
`tools/ship/frameHoled-selfcheck.mjs`. That gate drives the page once, at x1,
which this document does not declare, to prove the ratio control is honoured.

---

## 1. WHAT THIS REPLICATES, AND THE FORM IT BORROWS

v4708 measured H8 and could not report it: at x1 the splat left no holes, and
H8 was declared as two speeds. Its **x8 cell** met its own declared test (all
seven within-scene rhos negative, sign 7/7, t p 7.4e-4), and it was **not
promoted**. v4708's secondary S27 said what that cell was made of. Holes appear
in only 2-7 of 39 frames per scene, and those frames lose far more: `zone`
-1.708 dB holed against -0.350 clean, `edges` -1.841 against -0.103.

H9 tests exactly that description: **frames with any hole lose more than
frames with none.** The binary form was taken FROM v4708's secondary, and this
section says so. It was not derived independently.

## 2. WHERE THE FRESH DATA COMES FROM -- AND WHAT IS NOT FRESH ABOUT IT

The page's slab speeds are spent for this signal. x1 leaves no holes, x8
produced the observation, and **x2 and x4 are forbidden** by v4707's document
"now or later", because the signal was chosen after looking there. Of the other
axes:

- **translucent slab** is "colour but no depth", which would remove the
  occlusion being tested;
- **dilation** changes the motion field, which is part of what makes the holes;
- **upscale ratio** re-renders every presented frame at another internal
  resolution while leaving the scene geometry alone.

**H9 runs at x8 with the ratio at 1.5x and at 3x.** Every presented frame and
every dB is new. *** WHAT IS NOT NEW: *** occlusion is geometry, and the
geometry is v4708's, so WHICH frames carry holes is largely known in advance.
H9 therefore tests whether holed frames lose *at another resolution*: the
effect's robustness, not its discovery. A confirmation of the geometry itself
would need a camera path nobody has harvested, and this document does not
claim one.

The ratio control has never been set by a harvest. This page once shipped a
control that silently did nothing (`startframe` as a `<select>`), so **C21**
drives the page at x1, a speed this document does not declare, and requires
the presented frames' dB to move when only the ratio moves. The measurement
round checks it again on the declared cells, against v4708's ratio-2 x8 cache.

## 3. THE STATISTIC

Per scene, at each ratio: the frames whose hole fraction is exactly nonzero
against the frames whose is exactly zero. No threshold is chosen. The contrast
is **clean mean `genDb - cfDb` minus holed mean**, so positive is the
hypothesis. A scene with fewer than `minGroup` frames on either side has no
contrast and is excluded. Fewer than `minFolds` usable scenes, derived as five,
leaves that ratio unreportable.

## 4. THE PRIMARY -- H9

**H9: within a scene, frames that carry any occlusion lose more than frames
that carry none, at upscale 1.5x AND at 3x.** At each ratio, over the usable
scenes, the contrast is greater than zero by **paired t AND exact sign**, both
at `p < alpha`, with a positive mean. **Both ratios must clear**, an
intersection-union test, level alpha without correction.

**Named in advance:** at x8 some scenes had as few as 2 holed frames (`bars`,
2). If a ratio moves a scene below `minGroup`, it is excluded, and fewer than
five usable scenes makes that ratio unreportable, so H9 is not reported.

## 5. CONTROLS

- **C21 (the ratio is honoured):** at an undeclared speed, the harvested dB must
  change when only the ratio changes. Checked in this round at x1; checked
  again in the measurement round, on the declared cells, against v4708's
  ratio-2 x8 cache.
- **C12 (carried):** re-harvesting the first declared scene at the first
  declared ratio reproduces every row. Run by the measurement gate every run.
- **C19, C20 (carried):** no row without finite frame dB, and the hole fraction
  read from the column named `holeFrac`.

## 6. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S29:** per scene and ratio, holed and clean frame counts and means.
- **S30:** whether the same frame indices are holed at 1.5x, 2x (v4708) and 3x,
  which section 2 predicts they largely are.
- **S31:** per-scene headroom at both ratios.

## 7. THE DECLARED CONSTANTS

```declared
scenes = zone smooth checker bars edges noise ramp
speed = 8
ratios = 1.5 3
alpha = 0.05
minFolds = 5
upto = 40
minGroup = 2
```

## 8. WHAT THIS ROUND CANNOT CONCLUDE

- Why holed frames lose. H9 is the effect's robustness across resolution.
- Anything about new geometry, x2, x4, or real hardware.
- A frame gate's value in dB.
