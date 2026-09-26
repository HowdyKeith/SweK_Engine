# v4722 -- PRE-REGISTRATION: when the chain's two motion estimates disagree, does generation do worse?

**Written before either declared cell has been harvested, and before this
frame signal has been correlated with anything on any frame. The commit that
carries this file contains NO data.** The statistic is committed with it as
`tools/ship/frameDisagree.mjs`. The gate
`tools/ship/frameDisagree-selfcheck.mjs` checks it on synthetic frames and on
already-committed rows at x1, which this document does not declare. It reads
only the signal's spread there, never its relation to the advantage.

---

## 1. WHY A DIFFERENT SIGNAL

Three frame signals have been tested, and none has passed:

- a frame's spatial detail (H7);
- its holes (H8 to H10);
- motion's gain over standing still (H11 to H15). That one leaned backwards
  on every speed, geometry and path tried, but was never consistent enough to
  clear both cells.

All three describe the picture or the motion. None describes whether the
chain's motion is TRUSTWORTHY.

## 2. THE SIGNAL, FIXED NOW

The chain holds two motion estimates per block:

- the application's vector, which is the geometry's own motion, computed from
  the model matrices;
- a colour flow, found by searching for the best-matching block.

The reconciler keeps the application's vector unless the colour flow beats it
ON MERIT. `srcIsFlowBeat` marks the blocks where it did. The frame's signal is
the **fraction of its blocks where the colour flow beat the application's
vector**, the column found by name.

**The direction is fixed by the physics, before any data: more disagreement
means generation does WORSE.** The application's vector is the true motion.
When a colour match beats it, the match is usually false: repeated texture,
disocclusion, or aliasing. A frame warped along false vectors places its
content wrongly at the midpoint.

**What has been seen of this column.** It was one of eleven per-block inputs
to the learned gates of H1 to H5, which were refuted or unsupported at block
level. The page's readout prints its per-frame count. Its relation to a
frame's advantage has never been computed, at any cell. At x1, which is not
declared, the gate reads only its spread: it varies within every scene, with
a coefficient of variation of **0.147** to **0.866**.

## 3. THE CELLS -- NEITHER HAS BEEN HARVESTED

`sway` at **x4, upscale 3x**, on both geometries. Sway keeps the slab whole
in view, so the window's clock does not carry the result (v4717 to v4721).
x4 is where v4706 found frame headroom.

The ratio is 3 so that every frame is unseen. The x4 sway cells at 2x are
H14's. The vertical sway walks the linear path until its first turn, and
linear vertical x4 has never been harvested at 3x. The forward sway never
walks the linear path. Turn frames are excluded, as in H14.

## 4. THE STATISTIC AND THE PRIMARY -- H16

Per scene, over the non-turn frames: Spearman's rho of the signal against
`genDb - cfDb`, multiplied by `direction`. A scene whose signal has a
coefficient of variation below `cvFloor` is excluded. Each cell needs a
one-sided paired t AND exact sign at `p < alpha`, and the cells are combined
by intersection-union. The one-cell test is H12's, imported.

**H16: on the sway path at x4, within scenes, frames where the chain's two
motion estimates disagree more are the frames where generation does worse,
on both geometries.**

**A qualifier fixed in advance: H16 must be a DIFFERENT signal.**
Disagreement and H11's gain both read the chain's SADs. If, within scenes,
the signal and the gain rank frames alike -- mean |rho| over the scene-cells
above `distinctMax` -- then H16 is reported as **not distinct from gain**,
and it is not supported whatever the test says.

**Named in advance:**

- **The price.** One scene against it in either cell fails it.
- **The route by which it cannot answer.** Fewer than `minFolds` scenes with
  spread in either cell means H16 is **not reported**.
- **Reading table:**
  - **supported:** vector disagreement is the first frame signal in this arc
    that ranks the decision on both geometries. The next document may ask
    what threshold on it beats a fixed policy.
  - **clears but not distinct:** it is gain measured again, and is reported
    so.
  - **not supported:** vector disagreement does not rank the frame decision
    here.

## 5. CONTROLS

- **C25, C26 (carried):** the slab stays whole in every non-turn frame, and it
  reverses in the picture at every turn, in every declared scene-cell.
- **C12 (carried):** re-harvesting the first declared scene of the first
  declared cell reproduces every row.

## 6. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S45:** per scene, the signal's rho with the gain, which is the
  qualifier's input.
- **S46:** per scene, the partial given frame index.
- **S47:** each scene's mean signal against its mean advantage, across
  scenes, with no test.

## 7. THE DECLARED CONSTANTS

```declared
scenes = zone smooth checker bars edges noise ramp
cells = 4/x/3 4/z/3
path = sway
signal = srcIsFlowBeat
direction = -1
distinctMax = 0.7
alpha = 0.05
minFolds = 5
upto = 40
cvFloor = 0.01
```

## 8. WHAT THIS ROUND CANNOT CONCLUDE

- Anything about H16. No declared frame exists.
- Why the colour flow wins where it wins.
- A threshold, and a frame gate's value in dB.
