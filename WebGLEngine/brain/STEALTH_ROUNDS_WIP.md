# Stealth, crab and fly looming: six rounds (2026-11-15; every number here was produced by code in this tree; predictions are written BEFORE the rounds that test them)

Papers (supplied by Keith): **Santon et al. 2025**, "Stealth and deception: Adaptive motion camouflage in hunting broadclub cuttlefish", Science Advances 11:eadr3686; **Luan et al. 2022**, "A Looming Spatial Localization Neural Network Inspired by MLG1 Neurons in the Crab Neohelice", Frontiers in Neuroscience 15:787256; **Zhao et al. 2023**, "A fly inspired solution to looming detection for collision avoidance", iScience 26:106337. Earlier fly material: `brain/FLY_VISUAL_INPUTS_WIP.md`, `brain/FLY_RETINOTOPY_RF_WIP.md`, `brain/flyGfLoomModel.mjs`.

What each round is and its status (updated as the rounds finish):

| # | round | files | status |
|---|---|---|---|
| 1 | Santon's motion-detector analysis on synthetic treadmill stimuli | `brain/stealthMotion.mjs`, `brain/stealthMotion-selfcheck.mjs` | DONE (this section) |
| 2 | Zhao's EMD, LPLC2 and Giant Fiber model, and a variant with the LPLC2 units on the measured lattice | | |
| 3 | Stealth stimuli on the fly models (predictions registered first) | | |
| 4 | Luan's crab MLG1 looming-localization network | | |
| 5 | Stealth stimuli on the crab model (predictions registered first) | | |
| 6 | The Escape task against a camouflaged predator (registered first) | | |

## Round 1: Santon's motion-detector analysis (DONE)

**What it is.** The paper's argument is that a broadclub cuttlefish stalking a crab passes dark stripes downward across its head and arms, and that this generates a strong downward motion that overwhelms the radially expanding motion of the approach. It supports this with (a) a treadmill experiment (55 crabs, expanding dark ellipses with no stripes, static stripes or downward-moving stripes at 4 Hz, Weber contrast 0.2 to 1) and (b) an elementary-motion-detector analysis of the stimuli and of filmed hunts. `brain/stealthMotion.mjs` is (b) as code: the receiver's filtering (spatial acuity about 1 cycle/degree, temporal limit 60 Hz, each a Gaussian at the sigma that cuts the limit frequency to 1%), the paper's detector `h = (l0 - l1)(l0 - r1) - (r0 - r1)(r0 - l1)` on adjacent pixels, the statistics R (resultant vector alignment) and M (resultant motion strength), and a generator for the three treadmill stimuli.

**Result on the synthetic stimuli** (10 s expansion from 10 to 53 x 74 degrees, 120 frames/s as the monitor, 0.5 degrees/pixel; 3 s at 60 frames/s gives the same picture):

| stimulus | R | M | total strength | net motion |
|---|---|---|---|---|
| plain expanding ellipse | 0.000 | 0 | 1,634 | 0 |
| static stripes | 0.041 | 189 | 4,624 | slightly down |
| moving stripes (4 Hz down) | 0.972 (0.92 at 3 s) | 93,575 (25,558 at 3 s) | 96,306 | straight down |
| paper | 0, 0.09, 0.92 | 0.11, 740, 25,067 | not given | |

* **What agrees with the paper:** the order and size of R: a radially symmetric expansion cancels to R = 0; the stripes' downward motion aligns the whole field (R about 0.92 to 0.97); the net vector of the moving stripes points straight down; a lower contrast gives a weaker signal.
* **What does NOT agree, said plainly:** the moving over static M ratio here is 135 at 3 s and 495 at 10 s, not the paper's 34, because the synthetic static stripes give an M of about 190 where the paper's gave 740, and because M is a sum over frames (it grows with the duration; the paper's pixel scale, frame count, video size and noise floor are not known). The paper's M values are in arbitrary units and are not comparable in size. Only the ordering and the order of magnitude of the ratio are gated.
* **A bug the gate caught in the first draft:** the stripes moved UP instead of down (the phase had the wrong sign); the stealth result would have been reversed. The gate pins the direction three ways (bars, a 14-pixel shift of the dark bands, the net vector).
* **An assumption, said plainly:** the paper gives the temporal blur rule (60 Hz reduced to 1%) and names the spatial acuity limit ("about 1 cycle/degree") without a rule; the same 1%-at-the-limit rule is used for space here.

**Gate:** `node brain/stealthMotion-selfcheck.mjs` (about 4 s), 47 mutants: 45 red, 1 equivalent and argued, 1 invalid string; the first pass left nine real survivors, each closed by its own row.

**NOT CHECKED:** the authors' MATLAB; the recorded hunting videos (leaf display R 0.09 M 341, stripe display R 0.56 M 3,034), which a synthetic ellipse is not; the crab's behaviour (Figure 2: response probability about 0.8 for the plain and static ellipses against about 0.58 for the moving stripes at the highest contrast, read off the plot, approximate), which is not part of this module and is used in Round 5.

## Round 3 REGISTRATION (written 2026-11-15 BEFORE any stripe stimulus is run through a fly model; the run, the verdict and the results come in a later section)

**Question.** The cuttlefish's stripe trick was shown to lower a crab's response to an expanding cue. Does the same trick lower the response of the fly's looming detector, the LPLC2 array, as the model of Round 2 describes it? This extends the paper to a different animal; it is a prediction about a model, not about a fly.

**Stimuli** (`brain/stealthLoomStimuli.mjs`): a dark ellipse (74 : 53) looming on a collision course at r/v 50 and 100 ms from 6 to 105 pixels in the 200 x 150 frame (118 x 103 degrees), Weber contrast 1, in three versions: plain, with static stripes (3 cycles down its height, attached to it), with stripes moving DOWN at 4 cycles/second.
**Detectors** (`brain/flyEmdLplc2Gf.mjs`): (A) the paper's multiplicative LPLC2 array, one unit per pixel; (B) the additive control; (C) the multiplicative array with a surround inhibition added (a unit is inhibited when the motion energy in a ring around its receptive field exceeds kappa = 1 times the outward motion in its arms: this is how Klapoetke et al. 2017 describe the LPLC2 cell's inhibition by motion at the edge of its field, with a made-up strength, so its result is only a direction); (D) the multiplicative array with the units at the 57 measured lattice positions (the right eye).
**Measures:** the peak number of active units (N_act, scaled to the pixel-array equivalent for D), the Giant Fiber's spike count, and the angular size at its first spike (if any). The ratio of a measure for the moving stripes to the plain ellipse is called the moving-stripe ratio.

**Predictions** (each with its direction; my confidence in brackets):
1. **(A, multiplicative)** the moving stripes LOWER the peak N_act: moving-stripe ratio **at most 0.6 at both r/v** (65%). The reason: the stripes' downward motion is the null direction of the up arm's directional input, and the unit needs all four arms.
2. **(A)** the static stripes leave the response about as it is: ratio between **0.5 and 1.5** (70%): they expand with the ellipse, their edges are outward motion.
3. **(A)** the Giant Fiber's first spike on the moving stripes is **later in angular size by more than 10 degrees, or absent** (60%).
4. **(B, additive)** the moving stripes do NOT lower the response: ratio **at least 1.0** (70%): an additive unit answers any directional motion.
5. **(C, surround)** the moving-stripe ratio is **no larger than A's** at both r/v (80%): extra inhibition cannot help the stripes' target.
6. **(D, lattice)** the same direction as 1: moving-stripe ratio **at most 0.8 at both r/v** (55%): only 57 units, so noisier.

**Verdict rule.** SUPPORTED iff predictions 1 and 6 both hold; PARTLY if 1 holds and 6 fails (the lattice variant is too sparse to say); NOT SUPPORTED if A's moving-stripe ratio is **0.9 or more at either r/v**: then the cuttlefish's stripes would not mask a looming ellipse from this detector, and that is reported as the result. Predictions 2 to 5 are reported as hits or misses and do not decide the verdict.
**Said before the run:** a model's answer says nothing about a fly or a crab; it says which of three detector designs the stripes would fool. The Zhao model's own authors note that it lacks the inhibitory surround Klapoetke measured, which is why C is in the test.
