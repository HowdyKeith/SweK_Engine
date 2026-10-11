# v4718 -- PRE-REGISTRATION: does motion's gain rank frames backwards when the slab never leaves the view?

**Written before any frame on the new slab path has been harvested at a
declared cell. The commit that carries this file contains NO data.** v4718
also gives `fsr.html` that path (`slabpath = sway`). The statistic is committed
with it as `tools/ship/frameSway.mjs`, and the gate
`tools/ship/frameSway-selfcheck.mjs` drives the page only at x1, which this
document does not declare.

---

## 1. WHAT v4717 LEFT OPEN

Motion's gain over standing still ranked frames BACKWARDS at x4 (H11, 12 of 14
scene-cells) and again at x2 (H12, 13 of 14). Partialling out the frame's
position removed 39% of the forward mean rho and 68% of the vertical, and what
remained cleared neither cell (H13). A partial correlation removes a monotone
trend and nothing else. It cannot say whether the ranking belongs to the
signal or to the window.

## 2. WHAT THE WINDOW WAS

The slab is 2.4 units wide and 4 units from the eye, under 2.19 units of
half-view. On the page's only path it moves in a straight line, and at x4 it
leaves the view:

- in H11's forward cell it starts to leave at frame **7** and is gone by frame
  **18**;
- in the vertical cell it starts at frame **6** and is gone by frame **17**;
- so it is in only **16** and **15** of each scene's 39 frames.

The gate counts this from H11's committed rows: a block is slab where its
depth is nearer than the midpoint of the two planes. H11 therefore compared
frames with the slab against frames without it, in window order.

## 3. THE NEW PATH -- `sway`

`render/slabPath.mjs` computes the slab's offset for the page and for this
analysis, so the two cannot disagree.

- **`linear`** is the default. It is exactly the old expression, including how
  it is associated, and the six frame-level measurement gates' C12 re-harvests
  reproduce their caches through it bit for bit.
- **`sway`** moves the slab at the SAME speed but reverses it. The path is a
  triangle wave of amplitude 0.9, centred on the camera's track along the
  slab's axis. The slab's half-width is 1.2 and the half-view 2.19, so it
  stays whole in the view.
- **Turns.** A frame whose interval `(t - 1, t]` contains a turn has motion
  that is not linear between its two presented frames. That is a known
  interpolation failure, and a different question. Those frames are EXCLUDED,
  and which ones they are is computed from the path before any data exist.

## 4. THE CELLS -- NEITHER HAS BEEN HARVESTED

`sway` at **x4, upscale 2x**, on **both geometries** (`slabdir = x` and `z`).
x4 is where H11 saw the pattern, and the path is the only thing changed. No
harvest in any round has used the path, because it did not exist.

## 5. THE STATISTIC AND THE PRIMARY -- H14

H12's, imported: per scene, Spearman's rho of H11's `gain` against
`genDb - cfDb` over the non-turn frames, multiplied by `direction`, then a
one-sided paired t AND exact sign at `p < alpha` in each cell. The cells are
combined by intersection-union.

**H14: with the slab in view in every frame, within scenes, frames with more
gain are the frames where generation does worse, on both geometries.**
`direction` is the sign H12 recorded, and the gate reads it from H12's result.

**Named in advance:**

- **The price.** One scene against it in either cell gives 6 of 7, and fails.
  `zone` went against it in H11 on both geometries and in H12 on forward
  motion.
- **The route by which it cannot answer.** If the slab does not stay whole in
  view (C25 below), the cell does not test what this document says, and H14 is
  **not reported**.
- **Reading table:**
  - **supported:** the backwards ranking is not the window. It holds with the
    slab present throughout, and something about a frame's motion gain goes
    with generation doing worse.
  - **not supported, rhos near zero:** the ranking WAS the window; H11-H13
    were measuring slab presence.
  - **not supported, rhos leaning negative:** a weaker version survives. It is
    reported as a description and not promoted.

## 6. CONTROLS

- **C25 (the slab stays in view):** in the measurement round, every non-turn
  frame of every declared scene must hold at least 90% of that scene-cell's
  first-frame slab block count. In this round the page is driven at x1, which
  is not declared: the linear path must reproduce v4708's cached rows, and the
  sway path must move every frame's dB and keep the slab whole.
- **C12 (carried):** re-harvesting the first declared scene of the first
  declared cell reproduces every row.
- **Default inert:** the linear path reproduces every frame-level cache
  through the page, bit for bit.

## 7. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S40:** per scene, the partial given frame index beside the raw rho. On a
  path without the clock, the two should be close.
- **S41:** how many frames the turns excluded, per cell.
- **S42:** the raw rho on sway beside H11's on the linear path, same speed and
  geometry.

## 8. THE DECLARED CONSTANTS

Each cell is `speed/slabdir/ratio`, and `path` applies to every cell.

```declared
scenes = zone smooth checker bars edges noise ramp
cells = 4/x/2 4/z/2
path = sway
direction = -1
alpha = 0.05
minFolds = 5
upto = 40
cvFloor = 0.01
```

## 9. WHAT THIS ROUND CANNOT CONCLUDE

- Anything about H14. No declared frame exists.
- Anything about frames at a turn. They are excluded, not studied.
- A mechanism, and a frame gate's value in dB.
