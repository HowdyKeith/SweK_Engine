# v4662 -- DOES THE HARM FOLLOW THE HISTORY'S AGE OR THE SCENE'S POSITION?

Committed BEFORE the data is collected, for the reason
`render/reactive-preregistration.md` gives at length: a lead found by searching has to be
confirmed by a test that did no searching, and `git log` is what makes the ordering checkable
rather than asserted. Nothing above the OUTCOME section may be edited after the run.

## THE QUESTION, WHICH IS TWO ROUNDS OLD

v4658 measured the reactive mask making frames WORSE, and no round since has explained it:

    frames  3-53    14 of 51 harmed, worst -1.22 dB
    frames 54-98     3 of 45 harmed, worst -0.50 dB

v4659 refuted the jitter explanation (r = +0.17, and in the wrong direction). v4660 confirmed
that the mask helps less on wide-depth-gate frames -- and established that this does NOT explain
the harm, because the wide/narrow effect holds its size across both windows while the harm
nearly vanishes in the second.

What is left is the difference between the two windows themselves, and until v4661 that
difference was **two things at once.** `frame` fixed the scene AND counted the accumulations, so
frames 54-98 are simultaneously *later in the slab's travel* and *running on a history 53 frames
more converged*. No experiment could tell them apart. v4661 split the clocks.

## THE DESIGN -- THREE CELLS, AND THE THIRD IS NEW

|   | scene window | history age | status |
|---|---|---|---|
| **A** | 3-53 | 3-53 (grown with the scene) | measured at v4658 |
| **B** | 54-98 | 54-98 (grown with the scene) | measured at v4660 |
| **C** | 54-98 | **1-45 (EMPTY at scene 54)** | **this round** |

C is reached with `startFrame = 53`: at history age *f* the scene is at time *f + 53*, so ages
1..45 cover scene times 54..98 -- **exactly B's window**, on a fresh accumulator.

B and C therefore differ in the history's age and in nothing else. That is the comparison.

## THE HYPOTHESIS

**H2: the harm follows the HISTORY'S AGE.** A young accumulator holds a poorly converged image,
the mask compares against it, disagrees, and discards history that was worth keeping.

Predicted direction: **C is harmed more often than B.** A result in the other direction refutes
H2 and points at the scene's position instead.

## THE TEST -- EXACTLY ONE

* **Outcome.** Per frame, `delta(f) = PSNR_on(f) - PSNR_off(f)`; a frame is **harmed** when
  `delta < 0`. This is v4658's own definition of the thing being explained and is not re-chosen
  here to suit.
* **Statistic.** Fisher's exact test on the 2x2 of harmed/not-harmed by cell, **B against C**,
  **one-sided** in the predicted direction (C harmed more often than B).
* **Threshold.** p < 0.05.
* **Arms.** Each cell is run twice, `reactive: ON` and `reactive: OFF`, identical otherwise. The
  pipeline is deterministic -- v4659 and v4660 both re-ran windows bit-identically -- so the
  per-frame difference is signal.
* **Frames.** B: scene 54-98 at startFrame 0. C: scene 54-98 at startFrame 53. 45 frames each.
* **Scene / camera.** `smooth` and `objects`, as every measurement in this arc.

## THE CONTROL THAT HAS TO BE IN BOTH ARMS

**The shading mask is OFF in every run here, and that is not tidiness.** Its ring is
`2 * jitterPhaseCount` slots -- 64 at ratio 2 -- and it fills on the HISTORY's clock. In cell B
the ring is full from frame 64 on; in cell C it never fills at all, because C only ever reaches
age 45. Leaving it on would put a second difference between the two cells that is not the one
being tested, and it would be a difference in the same direction as the hypothesis. B is
therefore **re-collected with shading off** rather than reusing v4660's numbers, which were taken
with it on.

## WHAT THIS CANNOT SETTLE

* **The fourth cell does not exist.** Scene 3-53 on an OLD history would complete the 2x2, and
  there is no way to age the accumulator without advancing the scene. So this separates the two
  factors in ONE direction: it can show the history's age matters at a fixed scene window. If C
  looks like B, that is evidence the age does *not* drive the harm, which implicates the scene --
  but implicating is not measuring, and that would need a different control.
* **Why the slab's position would matter**, if it turns out to. Naming a mechanism is a separate
  measurement from showing the association, and this file will not be used to imply one.
* **Any of the other predictors.** v4659 tried eight against one window and reported the best;
  that is the mistake this whole procedure exists to avoid repeating.

## OUTCOME

NOT YET COLLECTED. Appended in a later commit, whichever way it falls.
