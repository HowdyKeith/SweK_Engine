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

## Round 5 REGISTRATION (written 2026-11-15 BEFORE any stripe stimulus is run through the crab model; results come in a later section)

**Question.** Does the stripe trick lower the crab MLG1 model's alarm to a looming ellipse, as it lowered the real crabs' response probability (Santon 2025 Figure 2, read off the plot, approximate: about 0.8 for the plain and static ellipses against about 0.58 for the moving stripes at Weber contrast 1)? A binary alarm model cannot give a probability, so only the DIRECTION is compared. Caveat that goes with every number: this implementation alarms on a RECEDING ball (Round 4, pinned), which the paper says it should not.
**Stimuli.** `loomingEllipse` on the crab's panorama (180 x 60 pixels = 360 x 120 degrees, 0.5 pixel/degree, 30 frames/s, step 1/30 s), the ellipse centred at azimuth 90 degrees (segment 4), elevation 0, horizontal extent from 3 to 37 pixels (6 to 74 degrees), Weber contrast 1, background grey 0.5 scaled to the model's 0 to 255 scale, stripes none / static / moving (4 cycles/s down, 3 cycles over its height), r/v 0.2 s and 0.4 s. The planar size law is used with a 144 degree field of view so that 1 degree is about 0.5 pixel for small sizes (the size is then slightly nonlinear for large angles; a stand-in). **Stated before the run, not tuned afterwards:** at the smallest sizes the stripe period is under 4 pixels and is under-sampled; nothing is done about it.
**Measures:** whether segment 4 alarms, the frame and the ellipse's angular size at the first alarm, the number of spike frames in segment 4, and the peak feed-forward term F in segment 4. The moving-stripe spike ratio = spikes with moving stripes over spikes on the plain ellipse.
**Predictions** (confidence in brackets):
1. The plain ellipse alarms at both r/v, in segment 4 (90%).
2. Static stripes also alarm at both r/v, with the alarm angular size within 30 percent of the plain one (70%).
3. Moving stripes SUPPRESS the response: at both r/v the alarm is absent, or comes at an angular size at least 30 percent larger than the plain ellipse's, or the spike ratio is 0.5 or less (60%). The reason: the stripes' motion drives the photoreceptor layer over the whole segment, which raises the feed-forward term F above its threshold T_FFI of about 15 and silences spikes.
4. The peak F with moving stripes is larger than with the plain ellipse at both r/v (80%).
5. The additional-segment prediction: no other segment alarms before segment 4 (the ellipse is at 90 degrees, its width up to 74 degrees; segments 3 to 5 may also alarm; the winner is the mean) (the located segment of the plain ellipse is within one segment of 4: 85%).
**Verdict rule.** SUPPORTED iff predictions 1, 2 and 3 all hold at both r/v. NOT SUPPORTED iff the moving-stripe alarm (present at BOTH r/v) is within 10 percent of the plain angular size and the spike ratio is 0.9 or more at either r/v: then this crab model is not fooled by the stripes, a miss against the animal, reported as such. Anything between is PARTLY. Predictions 4 and 5 are reported as hits or misses and do not decide.
**Said before the run:** the animal's 0.58 against 0.8 is a response probability over 55 crabs and the model is deterministic; the model's agreement or disagreement with it says which kind of mechanism (a feed-forward inhibition) is enough, nothing more.

## Round 5 RESULTS (run 2026-11-15 with `node brain/stealthRound5-run.mjs`; raw table in `brain/stealthRound5-results.txt`)

| r/v | stripes | alarm (seg 4) | size at alarm (deg) | spike frames in seg 4 | peak F seg 4 | winner |
|---|---|---|---|---|---|---|
| 0.2 s | none | yes, frame 64 | 13.2 | 47 | 14.1 | 4 |
| 0.2 s | static | yes, 77 | 17.6 | 34 | 35.3 | 4 |
| 0.2 s | moving | yes, 28 | 7.9 | 62 | 52.9 | 4 |
| 0.4 s | none | yes, 150 | 16.7 | 67 | 8.5 | 4 |
| 0.4 s | static | yes, 166 | 20.7 | 53 | 26.6 | 5 |
| 0.4 s | moving | yes, 50 | 7.6 | 111 | 57.1 | 4 |

Moving over plain: alarm size ratio 0.595 and 0.456, spike ratio 1.32 and 1.66. Static over plain: size ratio 1.325 and 1.235, spike ratio 0.72 and 0.79.

**VERDICT: NOT SUPPORTED in substance; the rule's letter gives PARTLY, and the rule had a gap.** Prediction 3 is falsified in DIRECTION: the moving stripes made the model alarm at a much SMALLER size (about half) and with more spikes, the opposite of the animal's lower response. The rule as I wrote it called NOT SUPPORTED only when the moving-stripe alarm is within 10 percent of the plain one; a result in the opposite direction fell between SUPPORTED and that condition, which I did not foresee. I report the substance: this crab model is not masked by the stripes, it is triggered by them.
**Predictions:** 1 HIT (alarms at both r/v, winner segment 4). 2 MISS at 0.2 s (static size ratio 1.325 against the 1.30 line) and HIT at 0.4 s (1.235), so MISS overall by the "both" wording. 3 MISS (opposite direction). 4 HIT (peak F 52.9 and 57.1 against 14.1 and 8.5). 5 HIT (the plain ellipse's winner is segment 4 at both r/v).
**Said as inference, NOT tested:** the downward motion of the stripes drives the photoreceptor layer in every segment cell from the first frame, so the grouping layer's potential m rises early and the alarm comes while the ellipse is still small; F does rise above its threshold (T_FFI about 15.3) later, but the alarm has already happened by then (spikes are counted before it). That the feed-forward inhibition is too slow to stop an alarm that is triggered at the start is a reading of the table, not an experiment. A different stripe onset (stripes fading in) was not tried.
**What it does not say:** nothing about the animal beyond direction; the model alarms on a receding ball too (Round 4), so its alarm is not a looming detector in this implementation, and the stripes' result may reflect that. The stimulus is a looming ellipse, the 144 degree planar size law is a stand-in, and the stripe period is under-sampled at the smallest sizes (said before the run).

## Round 6 REGISTRATION (written 2026-11-15 BEFORE the contrast sweep below is run through any detector)

**What "the Escape task" can and cannot mean here, said first.** The Escape task in this tree (`tools/subVestibularTasks.mjs` 4b-E; `brain/FISH_ESCAPE_PREREAD.md`) is a submarine dive with a pressure pulse and no vision, and the fish pilot has no escape output; so there is nothing in the tree for a camouflaged predator to be run through as an escape. Round 6 is therefore the part that can be measured: **does the cuttlefish's display (a looming ellipse with moving stripes, at a range of contrasts) cost a detector its warning time, and does that warning fall under the time an escape needs?** It says nothing about the zebrafish pilot or the connectome.
**Definition.** Warning margin = the time to collision at the detector's first alarm (fly: the Giant Fiber's first spike; crab: the first alarm of segment 4), in milliseconds, or MISSED. An escape needs a margin of at least T_min: **T_min = 100 ms for the fly and 300 ms for the crab. Both are ASSUMED here, chosen before the run, not taken from a paper** (the tree holds no number for either animal's escape time); the verdict is reported with T_min stated and the margins are given raw so a different T_min can be read off.
**Stimuli.** The Round 3 stimulus (fly, 200 x 150 frame, r/v 100 ms) and the Round 5 stimulus (crab panorama, r/v 0.4 s); Weber contrast 1, 0.6, 0.4, 0.2; stripes none and moving (4 cycles/s down). **Detectors:** the multiplicative fly array (Round 2, A) and the crab network (Round 4).
**Predictions** (confidence in brackets):
1. Fly A, plain ellipse: the margin does not grow as the contrast falls (monotone non-increasing; MISSED counts as lowest), and it is MISSED at contrast 0.2 (60%).
2. Fly A: the moving stripes do not rescue a missed detection: wherever the plain ellipse is MISSED, the moving-stripe one is MISSED too (60%).
3. Crab, plain ellipse: the margin does not grow as the contrast falls and it is MISSED at contrast 0.2 (60%; the paper's low-contrast ball is missed).
4. Crab with moving stripes: an alarm at EVERY contrast including 0.2 (the stripes trigger the alarm whatever the ellipse's contrast, from Round 5) (60%): the display would then ALERT the crab model to a predator it would otherwise miss.
5. At contrast 1 the plain ellipse's margin is at least T_min for both detectors (85%).
**Verdict rule (per detector).** CAMOUFLAGED if at some contrast the plain ellipse's margin is at least T_min and the moving-stripe margin is MISSED or under T_min, or lower by 20 percent or more; BETRAYS if at some contrast the moving stripes are detected where the plain ellipse is MISSED, or give a margin 20 percent or more LONGER; otherwise NEUTRAL. **Overall: SUPPORTED iff at least one detector is CAMOUFLAGED and none BETRAYS; NOT SUPPORTED if no detector is CAMOUFLAGED.** My prior that the overall result is SUPPORTED: 15 percent (Rounds 3 and 5 pointed the other way). Predictions 1 to 5 are reported as hits and misses and do not decide.
