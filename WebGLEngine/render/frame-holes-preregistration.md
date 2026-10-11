# v4707 -- PRE-REGISTRATION: are the frames generation loses the frames with the most occlusion?

**Written before any frame at slab speed x1 or x8 has been harvested with its
dB, and before hole fraction has been compared with generation's advantage on
ANY data. The commit that carries this file contains NO data.** The statistic
and runner are committed WITH it as `tools/ship/frameHoles.mjs`, gated on
synthetic frames by `tools/ship/frameHoles-selfcheck.mjs`.

---

## 1. WHERE THIS COMES FROM -- INCLUDING THE PART THAT CONSTRAINS IT

v4706 measured H7 and found "neither": a frame's spatial detail does not decide
whether generating it pays. It also found the first **frame-level headroom**
this arc has seen. At x4, `ramp` wins 17 of 39 frames and `smooth` 19, and a
frame oracle would gain +0.368 and +0.232 dB over the better fixed policy. Some
frames within a scene go one way and some the other.

**Occlusion is the textbook way frame interpolation fails.** Pixels one frame
shows and the other hides cannot be warped from anywhere. The chain measures it
per block as `holeFrac`, the share the splat could not cover, before the middle
frame exists. So H8's direction comes from that physics: **more holes, worse
generation.**

**The constraint:** this signal was chosen AFTER v4706's within-scene pattern
was seen. There the laplacian's within-scene rhos leaned negative, and v4706's
gate named v4684's slab-exit confound as a possible cause. Hole fraction was
never computed against advantage there. But a signal chosen after looking at
data must not be tested on that data, so **x2 and x4 are not used for H8 in
either direction, now or later.**

## 2. THE CELLS -- x1 AND x8, AND WHAT HAS BEEN SEEN OF THEM

- **Seen:** frame-level dB on `smooth` at x1 and x8 (v4682, four frames each)
  and on `checker` at x1 (v4684, frames 6-38). Never hole fraction, never any
  within-scene relation.
- **Not seen:** anything at frame level for the other five scenes at either
  speed.

## 3. THE SIGNAL, THE TARGET, AND WHY THERE IS NO ACROSS-SCENE CLAUSE

- **Signal, per frame:** the mean over blocks of `holeFrac`, found by name.
- **Target, per frame:** `genDb - cfDb`, as v4705 defined it and the page's
  readout prints it.

All seven scenes share ONE camera path and ONE slab; only the texture differs.
Occlusion is geometry, so each scene's hole-fraction sequence is close to the
same sequence, and the texture moves it only through the reconciler's choice of
vector. An across-scene clause would rank seven nearly equal numbers, and it is
not declared. The question is WITHIN a scene, which is where v4706 found the
headroom.

## 4. THE PRIMARY -- H8

**H8: within a scene, the frames with more occlusion are the frames where
generation does worse.** At each declared speed, for each scene, Spearman's rho
over its frames between hole fraction and `genDb - cfDb`. Over the usable
scenes, `-rho` is greater than zero by **paired t AND exact sign**, both at
`p < alpha`, with a positive mean. **The sign is part of the hypothesis: a
positive relation fails H8.** A scene whose hole fraction has a coefficient of
variation under `cvFloor`, or a mean of zero, is excluded. Fewer than `minFolds`
usable scenes, derived as five, leaves that speed unreportable.

**H8 requires both x1 and x8 to clear**, an intersection-union test, level
alpha without correction.

**Named in advance as a way this can fail to answer:** at x1 the slab moves
slowly, and if the splat leaves almost no holes, every scene falls under the
floor. x1 is then unreportable, so H8 is not reported, and that outcome is
stated as such rather than read as a null.

## 5. CONTROLS

- **C20 (the column):** the signal reads the column named `holeFrac`, found by
  name, and nothing else in the row.
- **C12 (carried):** re-harvesting the first declared scene at the first
  declared speed must reproduce every row exactly. Run by the measurement gate
  every time it runs.
- **C19 (carried):** a row without finite frame dB is refused.
- **Fresh cells:** the declared speeds must share nothing with v4705's, which is
  checked against that document, not restated.

## 6. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S26:** per-scene headroom at x1 and x8, as v4706's S23.
- **S27:** per-scene rhos individually, and each scene's hole-fraction spread.
- **S28:** how similar the seven scenes' hole sequences are, which section 3
  predicts are nearly identical.

## 7. THE DECLARED CONSTANTS

Read by `declared(text, FRAME_KEYS)`, v4705's schema.

```declared
scenes = zone smooth checker bars edges noise ramp
speeds = 1 8
alpha = 0.05
minFolds = 5
upto = 40
cvFloor = 0.01
```

## 8. WHAT THIS ROUND CANNOT CONCLUDE

- A frame gate's value in dB. H8 is whether the signal ranks frames; a threshold
  would be a fitted parameter owing its own document.
- Anything at x2 or x4, which this document forbids itself.
- Anything beyond seven synthetic scenes, or real hardware.
