# v4720 -- PRE-REGISTRATION: does H14's weaker backwards ranking replicate at x2, and does its split between the geometries?

**Written before either declared cell has been harvested. The commit that
carries this file contains NO data.** The statistic is H14's, imported by
`tools/ship/frameSwayRep.mjs`. The gate `tools/ship/frameSwayRep-selfcheck.mjs`
drives the page only at x1, which this document does not declare.

---

## 1. WHAT H14 LEFT

On the `sway` path at x4, the slab stays whole in view in every scored frame.
There, motion's gain over standing still still ranked frames BACKWARDS in
**13 of 14** scene-cells, at **57%** and **65%** of the strength H11 had on the
linear path. H14 was not supported:

- the forward cell cleared 7 of 7;
- the vertical cell stopped at 6 of 7, with `bars` against it.

A pattern seen at one speed, clearing on one geometry, is one observation. The
question here is whether it replicates.

## 2. THE CELLS, AND WHY THE RATIO IS 3

`sway` at **x2**, on both geometries, at **upscale 3x**. The speed changes and
the path does not.

**The ratio is not the default, and the reason is computed.** Vertically the
sway has no camera term. Its triangle wave rises at exactly the linear speed
until the first turn, which at x2 is t = 8.18. So at upscale 2x, frames **2
to 8** of every vertical scene would sit on the same path as H12's vertical
x2 cell, which has been harvested and read. That is **7** of each scene's 39
frames already seen. At 3x no linear vertical x2 frame has ever been
harvested, and the forward sway never coincides with the linear path, because
it carries the camera's track. So every declared frame is unseen. The gate
derives both counts from `render/slabPath.mjs` and the committed results.

Turns at x2 fall at t = 8.18 and 24.55, so frames 9 and 25 are excluded
(H14's rule, from the path alone).

## 3. THE STATISTIC AND THE PRIMARY -- H15

H14's, unchanged and imported. Per scene, Spearman's rho of H11's `gain`
against `genDb - cfDb` over the non-turn frames is multiplied by `direction`.
Each cell then needs a one-sided paired t AND exact sign at `p < alpha`, and
the cells are combined by intersection-union.

**H15: on the sway path at x2, within scenes, frames with more gain are the
frames where generation does worse, on both geometries.** `direction` is the
sign recorded by the hypothesis this replicates (`replicates` below), and the
gate reads it from that hypothesis's result.

**Named in advance:**

- **The price.** One scene against the direction in either cell fails it.
  Two scenes have gone against it before: `bars` (H14 vertical) and `zone`
  (H11 on both geometries, H12 forward). Neither is excluded.
- **The route by which it cannot answer.** If the slab does not stay whole in
  view (C25), H15 is **not reported**.
- **Reading table:**
  - **supported:** the weaker ranking replicates at a second speed on both
    geometries. It becomes the first frame-level result in this arc to be
    supported, and the next document may ask what threshold on it, if any,
    beats a fixed policy.
  - **forward clears again and vertical does not:** the split H14 showed
    replicates, and is reported as a description, not promoted.
  - **neither clears, rhos leaning negative:** the direction holds and the
    strength does not replicate.
  - **neither clears, rhos near zero:** H14's ranking was x4's.

## 4. CONTROLS

- **C25 (carried):** in every non-turn frame of every declared scene, the
  slab holds at least 90% of its scene-cell's first-frame slab blocks.
- **C26 (reversal, in the picture):** in every declared scene-cell, the slab's
  screen centroid along its axis must peak or trough within 1.5 frames of each
  turn in the window. This is computed from the harvested depth column, and
  it proves the path was honoured on the declared cells. It replaces
  comparing against a linear twin, which does not exist for the vertical
  cell.
- **C12 (carried):** re-harvesting the first declared scene of the first
  declared cell reproduces every row.

## 5. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S43:** each cell's rho beside H14's at x4, same geometry. This shows
  whether the forward/vertical split recurs, cell by cell.
- **S44:** the partial given frame index, as in H14's S40.

## 6. THE DECLARED CONSTANTS

```declared
scenes = zone smooth checker bars edges noise ramp
cells = 2/x/3 2/z/3
path = sway
direction = -1
replicates = H14
alpha = 0.05
minFolds = 5
upto = 40
cvFloor = 0.01
```

## 7. WHAT THIS ROUND CANNOT CONCLUDE

- Anything about H15. No declared frame exists.
- A threshold, and a frame gate's value in dB.
