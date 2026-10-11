# v4711 -- PRE-REGISTRATION: do holed frames lose on occlusion geometry nobody has harvested?

**Written before any frame with the slab moving vertically has been harvested.
The commit that carries this file contains NO data.** v4711 also adds that
motion to `fsr.html` (`slabdir`), and the statistic is v4709's, imported by
`tools/ship/frameVertical.mjs` and not rewritten. The gate
`tools/ship/frameVertical-selfcheck.mjs` drives the page only at x1, which this
document does not declare.

---

## 1. WHY NEW GEOMETRY

Across the three cells the holed-frame contrast has been read at (v4708's x8 at
upscale 2x, and v4710's 1.5x and 3x), holed frames lost to clean ones in 20 of
21 scene-cells. H9 was nonetheless not supported: at 1.5x `checker` reversed,
6 of 7 fails the exact sign test, and H9 needed both ratios.

All three cells share ONE occlusion geometry: the slab moving along x, WITH the
dolly, disoccluding its vertical edges. A resolution change re-renders those
frames without moving that geometry, and v4709's document said so. **The page
now has a second geometry.** With `slabdir = z` the slab moves VERTICALLY,
ACROSS the dolly, and disoccludes its horizontal edges. That occlusion geometry
has never been harvested, at any speed, for any scene.

The default direction is along x. In it every added term is `sx * 0`, exactly
zero, so the default page is bit-identical to every figure before v4711. The
three frame-level measurement gates' C12 re-harvests go through the page on
the default path and reproduce their caches bit for bit (117 frames).

## 2. THE CELL

**x8, slab moving vertically, upscale at the page default.** x8 is the only
speed at which the forward path had holes at all (x1 had none), and the slab
moves at the same rate, just in another direction. The seven scenes are the
page's.

## 3. THE STATISTIC AND THE PRIMARY -- H10

v4709's, unchanged and imported. Per scene: frames whose hole fraction is
exactly nonzero against frames whose is exactly zero; the contrast is clean
mean `genDb - cfDb` minus holed mean; a scene with fewer than `minGroup`
frames on either side is excluded.

**H10: on vertical slab motion at x8, holed frames lose more than clean ones.**
Over the usable scenes the contrast is greater than zero by **paired t AND
exact sign**, both at `p < alpha`, with a positive mean. One cell, so no
intersection-union.

**Named in advance:**

- The price is v4707's: one scene against the direction fails 6 of 7.
  `checker` is named, because it reversed at 1.5x.
- The slab crosses its own height in about five frames at x8. If it leaves the
  view before carrying holes in at least `minGroup` frames in three or more
  scenes, fewer than five are usable, H10 is **not reported**, and the outcome
  is stated as unanswerable rather than as a null.

## 4. CONTROLS

- **C22 (the direction is honoured):** at x1, a speed this document does not
  declare, a harvest with no extra setting must reproduce v4708's cached rows,
  and one with only `slabdir = z` must move every frame's dB. Run in this round.
  In the measurement round, the vertical x8 rows must differ from v4708's
  forward x8 rows frame by frame.
- **C12 (carried):** re-harvesting the first declared scene reproduces every
  row. Run by the measurement gate every time it runs.
- **Default inert:** the default direction reproduces the three earlier
  frame-level caches bit for bit, through the page.

## 5. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S32:** per scene, holed and clean frame counts and means.
- **S33:** how many frames carry holes on vertical motion against forward x8.
- **S34:** per-scene headroom.

## 6. THE DECLARED CONSTANTS

```declared
scenes = zone smooth checker bars edges noise ramp
speed = 8
slabdir = z
alpha = 0.05
minFolds = 5
upto = 40
minGroup = 2
```

## 7. WHAT THIS ROUND CANNOT CONCLUDE

- Why holed frames lose.
- Anything about a third geometry, a real camera path, or real hardware.
- A frame gate's value in dB.
