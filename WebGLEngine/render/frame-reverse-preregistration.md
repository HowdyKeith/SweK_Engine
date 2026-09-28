# v4716 -- PRE-REGISTRATION: does motion's gain rank frames BACKWARDS at a speed it was not seen at, and is that more than the window's clock?

**Written before either declared cell has been harvested, and before any
statistic below has been computed on any frame. The commit that carries this
file contains NO data.** The statistic is committed with it as
`tools/ship/frameReverse.mjs`, and the gate `tools/ship/frameReverse-selfcheck.mjs`
checks it on synthetic frames and on already-committed rows only.

---

## 1. WHY THE NEGATION, AND WHY IT IS ALLOWED NOW

H11 (v4715) asked whether a frame's summed gain of motion over standing still
ranks the frames where generation beats a cross-fade. It was not supported, and
it failed the way v4714 said it might: **12 of 14** scene-cells ranked
BACKWARDS, with mean rho **-0.412** on forward motion and **-0.397** on
vertical, and the same scene as the lone exception in both. That is the first
frame-level pattern in this arc to keep its sign across the two geometries.

v4703 set the rule this document follows: a negation needs its own document and
data it has not seen. H11's cells are therefore FORBIDDEN here. The direction is
not chosen: it is the sign H11 recorded in both cells, and the gate reads it from
H11's committed result.

## 2. THE CONFOUND, AND THE SECOND QUESTION IT FORCES

v4705's document named a defect in the harvest window: the slab leaves the view
partway through it, so a frame's motion and its advantage change TOGETHER over
time. A backwards ranking could be that clock and nothing else. A gate that read
the gain would then be reading the frame number.

So there are two questions, and both are declared here:

- **H12 (the negation, transferred):** within scenes, frames with more gain are
  the frames where generation does WORSE.
- **H13 (beyond the clock):** the same, after the frame's position in the window
  is partialled out. The statistic is the partial Spearman correlation of gain
  and advantage given frame index:
  `(r_ga - r_gf * r_af) / sqrt((1 - r_gf^2) * (1 - r_af^2))`, with every `r`
  Spearman's on midranks. A scene where either variable is perfectly ranked by
  frame index has no partial correlation, and is excluded.

## 3. THE SCORE -- H11's, IMPORTED

`gain = log((Σ sadStill + eps) / (Σ min(sadApp, sadFlow) + eps))` per frame,
from `tools/ship/frameGain.mjs`, unchanged. The advantage is `genDb - cfDb`.

## 4. THE CELLS -- NEITHER HAS BEEN HARVESTED

| cell | speed | slab moves | upscale |
|---|---|---|---|
| forward | x2 | along x | 3x |
| vertical | x2 | vertically | 2x |

- **x2, not x4.** H11 saw the pattern at x4. If the ranking belongs to the
  signal, it should hold at another speed, and at x2 the slab stays in view
  longer, which weakens the clock this document is worried about.
- **One cell per geometry,** as in H11.
- **Neither cell has been harvested by any round.** The gate derives the list
  from every committed frame result, H11's included, and adds every pre-v4709
  harvest at the page defaults.

## 5. THE TESTS

Both hypotheses use the same test on different per-scene numbers. The test runs
over each cell's usable scenes, on the rhos multiplied by `direction`. It needs
**paired t AND exact sign**, both at `p < alpha`, with a positive mean. It is
one-sided, and it needs BOTH cells (intersection-union).

**Named in advance:**

- **The price.** One scene against the direction in either cell fails it (6 of 7,
  p 0.0625). H11's exception was the same scene, `zone`, in both geometries.
  If it reverses again here, each cell reaches 6 of 7 at best, and neither H12
  nor H13 can clear. This is stated rather than designed around: excluding
  `zone` now would pick the scenes after seeing the data.
- **The route by which it cannot answer.** Fewer than `minFolds` usable scenes in
  either cell means that hypothesis is **not reported**.
- **Reading table:**
  - **H12 and H13 both supported:** the backwards ranking transfers to a new
    speed on both geometries, and it is not the window's clock.
  - **H12 supported, H13 not:** it transfers, but nothing here separates it
    from frame position. A gate built on it would be reading the clock.
  - **H12 not supported:** the pattern was x4's, and H13 is reported without
    interpretation.

## 6. CONTROLS

- **C24 (the cells are the cells):** in the measurement round, no frame in
  either cell may carry the dB v4706 read at forward x2 2x.
- **C12 (carried):** re-harvesting the first declared scene of the first declared
  cell reproduces every row.
- **The runner's inputs are H11's:** the gain comes from H11's own function, and
  the harvest path is the one v4715's C12 and C23 proved on both settings.

## 7. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S38:** per-scene raw and partial rhos, and `r_gf` and `r_af`: how strongly
  each variable follows the clock.
- **S39:** the raw rho at x2 beside H11's at x4, for each scene and geometry.

## 8. THE DECLARED CONSTANTS

Each cell is `speed/slabdir/ratio`. `direction` is the sign the rhos are
multiplied by before the one-sided test, and it must be the sign H11 observed.

```declared
scenes = zone smooth checker bars edges noise ramp
cells = 2/x/3 2/z/2
direction = -1
alpha = 0.05
minFolds = 5
upto = 40
cvFloor = 0.01
```

## 9. WHAT THIS ROUND CANNOT CONCLUDE

- Anything about H12 or H13. No declared frame exists.
- A mechanism. Even if H13 is supported, the partial correlation removes a
  MONOTONE trend in frame order and nothing else.
- A frame gate's value in dB.
