# v4705 -- PRE-REGISTRATION: does a frame's spatial detail decide whether to generate it?

**Written before any frame has been harvested with its generated and
cross-faded dB recorded, and before any statistic below has been computed on
FSR data. The commit that carries this file contains NO data.** The statistic
and runner are committed WITH it as `tools/ship/frameGate.mjs`, gated on
synthetic frames by `tools/ship/frameGate-selfcheck.mjs`. That gate drives the
page only at slab speed x8, which this document does not declare, and prints
no advantage.

---

## 1. WHY THE FRAME, AND WHY THIS SIGNAL

Six hypotheses closed the PER-BLOCK gate (v4703's closing, and
`render/genGateVerdicts.mjs`). No per-block rule over the chain's own matching
errors was shown to transfer, fitted or not. A frame generator's actual
decision is made per FRAME: generate this one, or cross-fade it.

Motion is **not** the frame-level signal, and that is already measured. v4682
refuted displacement at every speed on `smooth`: 0 of 16 frames up across x1-x8,
with a curve that "falls, falls, RISES, falls". Testing a motion threshold
again would re-test a refuted hypothesis.

**The arc named its own frame-level suspect at v4683:** *"a cross-fade is
exactly right wherever the picture is flat, so a compensation's worth scales
with the spatial gradient."* `checker` read +0.107 dB, `smooth` -0.857 and
`zone` -0.965 at x4. This document tests that sentence, with its direction
fixed by v4683 and not by anything seen here.

## 2. THE SIGNAL AND THE TARGET

- **Signal, per frame:** the mean over the frame's blocks of the `laplacian`
  feature. It is the frame's high-frequency energy, computed from the frame the
  generator warps from, already produced by the chain before any middle frame
  exists. Found by NAME in `FEATURE_NAMES`. Nothing is fitted.
- **Target, per frame:** `genDb - cfDb`, the generated frame's PSNR minus the
  cross-faded frame's, both against the rendered middle frame. These are the two
  numbers the page's readout already prints. The harvest hook records them from
  v4705 on; no earlier cache carries them, and `frameRow` refuses a row that
  does not.

## 3. THE DATA -- A NEW HARVEST, AND WHAT HAS BEEN SEEN

All seven scenes at **x2 and x4**, frames up to 40, the same drive every learned
round used. The earlier caches cannot be reused: they carry no frame dB.

- **Seen:** frame-level dB on `smooth` (v4682, x1-x8), on `smooth`, `zone`
  and `checker` at x4 (v4683), and on `checker` at x1 and x2 (v4684), in those
  rounds' own windows. Among the three x4 means, the laplacian order puts
  `zone` second and the dB order puts it last: a three-point rank correlation
  of 0.5, which this design neither assumes nor needs.
- **Also seen:** v4697's pixel census of all seven scenes (|laplacian|,
  variance, edges, anisotropy), from the sampler and not from frames.
- **Not seen:** any frame-level dB on `bars`, `edges`, `noise` or `ramp` at
  any speed, and the within-scene relation between frame detail and advantage
  on ANY scene.

**The v4684 window defect is named in advance.** The slab translates out of
frame (11,130 pixels to 212 across a window at x2), so later frames carry less
moving content. The window is the harvest's, frames up to 40, identical for
every scene and speed. That within-scene change is exactly what clause (b)
ranks frames on, and it is not corrected for.

## 4. THE PRIMARY -- H7, TWO CLAUSES, BOTH SPEEDS

**H7: a frame's spatial detail decides whether generating it pays -- across
content AND within it.**

- **(a) ACROSS scenes:** over the seven scenes, Spearman's rho between each
  scene's mean frame laplacian and its mean `genDb - cfDb` is positive with an
  **exact** one-sided permutation p < `alpha`. That is all 5,040 orderings; at
  n = 7 it needs rho >= 0.7143 (p 0.0440), and 0.6786 gives p 0.0548.
- **(b) WITHIN scenes:** for each scene, Spearman's rho over its frames between
  frame laplacian and `genDb - cfDb`. Across the usable scenes, those rhos are
  greater than 0 by **paired t AND exact sign**, both at `p < alpha`, with a
  positive mean. A scene whose frame laplacian has a coefficient of variation
  under `cvFloor` is excluded, because a signal with no spread ranks nothing.
  Fewer than `minFolds` usable scenes (derived: five) makes (b) unreportable.

**H7 requires (a) AND (b) at x2 AND at x4**, an intersection-union test, level
alpha without correction.

| (a) across | (b) within | reading |
|---|---|---|
| holds | holds | detail decides at frame level: a frame gate on this signal is worth building |
| holds | fails | detail separates CONTENT, not frames: the decision is per scene, not per frame |
| fails | holds | detail ranks frames within a scene but its level shifts with content: the per-block pathology, one level up |
| fails | fails | the spatial gradient does not decide the frame; v4683's sentence is not supported |

## 5. CONTROLS

- **C17 (the columns):** the signal is read from the column named `laplacian`,
  found by name, so a reordering of the features cannot point it elsewhere.
- **C18 (the target is the readout's):** the harvested `genDb` and `cfDb` must
  equal what the page's readout prints for the same frame, to its printed
  precision. Checked in this round at x8 on one scene.
- **C19 (stale data refused):** a row without finite `genDb` and `cfDb` is
  refused rather than read as zero.
- **C12 (carried):** re-harvesting one scene at one speed must reproduce its
  rows exactly. Checked in the measurement round on the first declared scene
  and speed.

## 6. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S23 headroom:** per scene, the share of frames where generation wins, and
  the frame-level oracle's mean dB over the better fixed policy. If one policy
  wins every frame of a scene, no frame-level decision can help there.
- **S24:** each scene's mean advantage beside v4683's and v4684's figures where
  they overlap.
- **S25:** within-scene rhos individually, and the per-scene coefficient of
  variation of frame laplacian.

## 7. THE DECLARED CONSTANTS

Read by `declared(text, FRAME_KEYS)`.

```declared
scenes = zone smooth checker bars edges noise ramp
speeds = 2 4
alpha = 0.05
minFolds = 5
upto = 40
cvFloor = 0.01
```

## 8. WHAT THIS ROUND CANNOT CONCLUDE

- Anything about the block, which is closed.
- Anything beyond seven synthetic scenes at two speeds, or real hardware.
- The value of a frame gate in dB: H7 is whether the signal ranks, and a
  threshold on it would be a fitted parameter owing its own document.
