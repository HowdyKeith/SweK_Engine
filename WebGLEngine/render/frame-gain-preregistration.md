# v4714 -- PRE-REGISTRATION: does motion's gain over standing still, summed over the FRAME, say when to generate it?

**Written before the score below has been computed on any harvested frame, and
before either declared cell has been harvested at all. The commit that carries
this file contains NO data.** The score, the per-scene statistic and the test
are committed WITH it as `tools/ship/frameGain.mjs`. The gate
`tools/ship/frameGain-selfcheck.mjs` checks them on synthetic frames, and drives
the page only at x1, which this document does not declare.

---

## 1. WHERE THE FRAME ARC STANDS, AND WHY THIS SCORE

Four frame-level hypotheses have been measured. H7 found that spatial detail
does not decide. H8 to H10 found that occlusion does not either, because the
direction a holed frame goes depends on the geometry that made the hole. v4706
found **headroom**: at x4 a frame oracle would gain +0.368 dB on `ramp` and
+0.232 on `smooth`. Nothing tested so far reaches it.

Both frame signals tested so far describe the PICTURE: its detail and its holes.
Neither describes the thing a cross-fade gets wrong. A cross-fade blends each
pixel in place, which amounts to assuming nothing moved. Generation warps along
the chain's motion. Whether warping pays depends on how much better motion
explains the change between the two presented frames than standing still does.
The chain measures both of those before any middle frame exists. **That is
v4702's score (H6).** H6 asked it of each BLOCK and found it ranked the
per-block decision BACKWARDS on five scenes of seven. Its closing said the
signal was real, that its sign depended on the scene, and that the question was
closed *at this block size*. The frame was never asked.

## 2. THE SCORE, FIXED NOW, AND WHAT IS NEW ABOUT IT

Over a frame's blocks `b`, using the chain's own per-block SADs (genGate's
columns, found by name):

> **gain = log( (Σ_b sadStill + eps) / (Σ_b min(sadApp, sadFlow) + eps) )**, `eps = 1e-6`

- **The direction is not chosen here.** Higher means generation is expected to
  win. v4695 fixed this direction for the third scale-free column, and v4702
  fixed it for H6. `eps` is H6's constant, imported rather than copied.
- **Summed, then the ratio, rather than the mean of H6's block scores.** This is
  not a choice made to escape H6's result. It is what the frame-level question
  is: over the whole frame, how much matching error does motion remove? v4703
  found that 63-68% of `edges`'s blocks have all three SADs at eps and score
  exactly 0. A mean of block scores counts those blocks. A sum gives them
  weight zero, because they contribute nothing to either total. The gate proves
  that adding such blocks leaves the score bit-identical.
- On a one-block frame the score IS H6's block score, and the gate checks that
  equality, so the two are the same quantity at two granularities.

## 3. THE CELLS -- NEITHER HAS BEEN HARVESTED

| cell | speed | slab moves | upscale |
|---|---|---|---|
| forward | x4 | along x (the default) | 3x |
| vertical | x4 | vertically (`slabdir = z`) | 2x (the default) |

- **x4** is where v4706 found the headroom: `ramp` and `smooth` won 17 and 19
  of 39 frames there. A score can only rank a decision that varies. What was
  seen at x4 is the ADVANTAGE, at upscale 2x on forward motion, and that cell
  is not declared.
- **Two geometries, because H10 is why.** A frame signal that holds on one
  geometry has not been shown to be a signal. Each cell is one geometry, and
  the hypothesis needs both.
- **Neither cell has been harvested, at any setting, by any round.** Every
  per-block harvest before v4709 ran forward at upscale 2x, because until
  v4709's fix the harvest never reset the page. The frame caches cover
  forward x1, x2, x4 and x8 at 2x, forward x8 at 1.5x and 3x, and vertical x8
  at 2x. The gate derives that list from the committed result files and
  checks each declared cell against it.

## 4. THE STATISTIC AND THE PRIMARY -- H11

Per scene: Spearman's rho, on midranks, between each frame's `gain` and its
advantage `genDb - cfDb`. A scene whose `gain` has a coefficient of variation
below `cvFloor` has no ranking to test and is excluded.

**H11: in BOTH declared cells, within scenes, frames with more gain are the
frames where generation does better.** Over each cell's usable scenes, the
rhos are greater than zero by **paired t AND exact sign**, both at
`p < alpha`, with a positive mean. The test is one-sided and the cells are
combined by intersection-union: H11 is supported only if both cells clear.

**Named in advance:**

- **The price.** One scene against the direction in either cell gives 6 of 7,
  exact p 0.0625, and fails it.
- **The reason to expect it to fail.** H6's score went backwards at block
  level. If the frame-level rhos also lean negative, H6's shape has replicated
  at the granularity the decision is made at, and the sign is not a block
  artefact. The negation is NOT tested here. The v4703 closing requires a
  negation to get its own document and fresh data, and this is not that
  document.
- **The route by which it cannot answer.** Fewer than `minFolds` usable scenes
  in either cell means H11 is **not reported**.
- **Reading table:**
  - both cells clear: frame-level compensation gain transfers across these two
    geometries, and H6's failure belonged to the block;
  - one cell clears: the result is reported as that cell's outcome, as v4708
    and v4710 did, and it is not promoted;
  - neither cell clears: the frame arc has no predictor over the chain's own
    measurements, and the next question is not another column of them.

## 5. CONTROLS

- **C23 (the cells are the cells):** in the measurement round, every forward
  x4 3x frame's dB must differ from v4706's forward x4 2x frame, and every
  vertical x4 frame's dB from the same forward x4 frame. That shows the ratio
  and the direction were honoured on the declared cells themselves.
- **C12 (carried):** re-harvesting the first declared scene of the first
  declared cell reproduces every row. The measurement gate runs it every time.
- **The runner reads real rows:** in this round, a drive at x1, forward, 2x,
  which is not declared, must reproduce v4708's cached rows. Every frame must
  also yield a finite gain. No gain is correlated with anything at x1, and
  none is printed.

## 6. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S35:** per-scene rhos, mean gain and wins in each cell.
- **S36:** the across-scene rho of mean gain against mean advantage in each
  cell. It is printed and has no test attached.
- **S37:** the mean of H6's per-block scores, per frame. Its within-scene rho
  is printed beside `gain`'s, to show whether summing changed the sign.

## 7. THE DECLARED CONSTANTS

Each cell is `speed/slabdir/ratio`.

```declared
scenes = zone smooth checker bars edges noise ramp
cells = 4/x/3 4/z/2
alpha = 0.05
minFolds = 5
upto = 40
cvFloor = 0.01
```

## 8. WHAT THIS ROUND CANNOT CONCLUDE

- Anything at all about H11. No declared frame exists.
- A frame gate's value in dB, which is a threshold this document does not
  fix.
- Anything about a third geometry, a real camera path, or real hardware.
