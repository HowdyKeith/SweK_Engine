# Stealth, crab and fly looming: six rounds (2026-11-15; every number here was produced by code in this tree; predictions are written BEFORE the rounds that test them)

Papers (supplied by Keith): **Santon et al. 2025**, "Stealth and deception: Adaptive motion camouflage in hunting broadclub cuttlefish", Science Advances 11:eadr3686; **Luan et al. 2022**, "A Looming Spatial Localization Neural Network Inspired by MLG1 Neurons in the Crab Neohelice", Frontiers in Neuroscience 15:787256; **Zhao et al. 2023**, "A fly inspired solution to looming detection for collision avoidance", iScience 26:106337. Earlier fly material: `brain/FLY_VISUAL_INPUTS_WIP.md`, `brain/FLY_RETINOTOPY_RF_WIP.md`, `brain/flyGfLoomModel.mjs`.

What each round is and its status (updated as the rounds finish):

| # | round | files | status |
|---|---|---|---|
| 1 | Santon's motion-detector analysis on synthetic treadmill stimuli | `brain/stealthMotion.mjs`, `brain/stealthMotion-selfcheck.mjs` | DONE (this section) |
| 2 | Zhao's EMD, LPLC2 and Giant Fiber model, and a variant with the LPLC2 units on the measured lattice | `brain/flyEmdLplc2Gf.mjs`, `-selfcheck.mjs` | DONE |
| 3 | Stealth stimuli on the fly models (predictions registered first) | `brain/stealthLoomStimuli.mjs`, `brain/stealthRound3-run.mjs`, `brain/stealthRound3-results.txt` | DONE: NOT SUPPORTED |
| 4 | Luan's crab MLG1 looming-localization network | `brain/crabMlg1.mjs`, `-selfcheck.mjs` | DONE (one paper result NOT reproduced) |
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

## Round 3 RESULTS (run 2026-11-15 with `node brain/stealthRound3-run.mjs`; raw table in `brain/stealthRound3-results.txt`)

Moving-stripe ratio = peak active-unit count on the moving-stripe ellipse over the plain one (static ratio likewise); the Giant Fiber spike counts and first-spike angle are in the raw table.

| detector | r/v 50 ms moving / static | r/v 100 ms moving / static | spikes plain → moving (50 ms, 100 ms) |
|---|---|---|---|
| A multiplicative | 0.756 / 0.885 | 1.000 / 0.955 | 18 → 10, 28 → 28 |
| B additive | 1.018 / 0.991 | 1.015 / 1.001 | 308 → 374, 434 → 598 |
| C surround (kappa 1) | 0.696 / 0.835 | 1.022 / 0.947 | 18 → 9, 22 → 22 |
| D lattice (57 units) | 0.667 / 0.667 | 1.000 / 1.000 | 30 → 15, 45 → 45 |

**VERDICT (by the rule written before the run): NOT SUPPORTED.** A's moving-stripe ratio is 1.000 at r/v 100 ms (the rule's line is 0.9 or more at either r/v). In this model the cuttlefish's moving stripes do NOT mask a looming ellipse from the LPLC2 array at the slower approach; at the fast approach (50 ms) they cut the peak by about a quarter and the spike count nearly in half, which is a partial effect, not the "at most 0.6" predicted.

**Predictions, hit or miss:** 1 MISS (0.756 and 1.000, not at most 0.6 at both). 2 HIT (static 0.885, 0.955 within 0.5 to 1.5). 3 MISS (the first spike comes at the same 57.3 degrees on plain and moving at both r/v; only the count falls at 50 ms). 4 HIT (additive 1.018 and 1.015, at least 1.0; it also answers the stripes with many more spikes, the additive unit being a motion detector, not a looming detector). 5 MISS on a strict reading (C 0.696 is below A's 0.756 at 50 ms, but C 1.022 is above A's 1.000 at 100 ms; the surround at kappa 1 changes little). 6 MISS (D 0.667 at 50 ms but 1.000 at 100 ms, not at most 0.8 at both). Hits 2 of 6; the stated confidences were 60 to 80 percent, so these predictions were overconfident.

**Why, said as inference (labelled; not tested here):** at the slower approach the expanding edge of the ellipse sweeps across many pixels per frame and the stripes' downward motion does not remove the edge's outward motion from the up arm; at the fast approach the stripes occupy a larger share of the arms' motion. This was not isolated by a further experiment.

**What this does NOT say:** it says nothing about the fly or the crab; it says one particular detector model (Zhao 2023's, with an assumed luminance scale and an assumed surround strength) is only partly fooled. The surround strength kappa was made up, so C is a direction, not a result; the lattice degrees-per-column is an assumption (5). The stimulus is a looming ellipse on a collision course, not the paper's treadmill ellipse.

**Gate:** `flyEmdLplc2Gf-selfcheck.mjs` gained section 6b (surround: null equals plain, huge kappa equals plain, kappa 0 lowers the peak and the peak is monotone in kappa, bad options refused). Mutants of the surround code: 15, 14 red, 1 equivalent.

## Round 2 (DONE): Zhao 2023's EMD, LPLC2 and Giant Fiber model

`brain/flyEmdLplc2Gf.mjs` (pure, no authors' code read): per-pixel high-pass and rectified, low-passed ON/OFF paths, half-detectors on neighbouring pixels, cross-shaped LPLC2 fields (multiplicative or additive), and a leaky integrate-and-fire Giant Fiber driven by N_act dN_act/dt. **What holds (gate rows):** silent for bars, edges, gratings, receding and contracting squares; active for looming, constant-edge-speed and outward cross motion; the additive control answers a bar and a grating; first spike at a nearly constant angular size across r/v (CV under 0.15) and its time linear in r/v; the first-spike size grows with the field side (34.4, 41.7, 48.3, 57.3 degrees for 60 to 120 pixels). The 57-unit lattice variant (units at the measured LPLC2 positions, 5 degrees per column assumed) is silent for a bar, fires for a loom and its active centroid lands within 20 pixels of the loom centre at five positions.
**What does NOT agree with the paper:** first-spike size about 49 degrees (46 to 52), the paper's 34; no firing at r/v 10 ms (the paper fires from 10 ms; the square moves 5 pixels per frame, beyond the detector's range). The luminance scale (0 to 255) and the units of N_act dN_act/dt are assumptions. **Gate:** `node brain/flyEmdLplc2Gf-selfcheck.mjs`, 74 mutants (70 red, 1 equivalent, 3 invalid strings; five survivors closed), plus 15 for the surround code.
**NOT CHECKED:** the authors' MATLAB, the robot and real-video tests.

## Round 4 (DONE): Luan 2022's MLG1 crab model

`brain/crabMlg1.mjs`: 16 segments of 37.5 degrees over a 360 degree strip, each with the photoreceptor-persistence, lateral-inhibition, grouping (3x3 mean product over omega), adaptive coefficient c(t), sigmoid, feed-forward inhibition, spike and alarm layers (eq. 1 to 20, Table 1), plus a winner-take-all over the first alarming segments (eq. 21, 22). **What holds:** a static scene gives M 0.5 and no spike; the approaching ball is localised to its segment at azimuth 0, 45, 90, 180, 270 (segments 0, 2, 4, 8, 12); 5 degrees off gives the same segment within one; the alarm distance grows with size and speed; a darker ball alarms earlier and a low-contrast one not at all; a whole-scene flicker is suppressed by the feed-forward inhibition (under 5 percent of the spikes); a drifting texture alone does not alarm.
**What is NOT reproduced, said plainly:** a RECEDING ball alarms in this implementation (within 12 frames), against the paper's report that it does not, and this survived mu 3, n_sp 6, the printed inhibition sign and the printed |G~| form of eq. 12; pinned as a negative finding, cause unknown (candidates not isolated: the first-frame handling, the 3x3 kernel details, the assumed thresholded sum m; none tested). Round 5 results must carry this caveat. **Gate:** `node brain/crabMlg1-selfcheck.mjs`; 82 mutants, 14 first-pass survivors, all but the equivalent ones closed (see the gate header). **NOT CHECKED:** the authors' code, their camera panoramas, the Colias robot, the physiological recordings.
