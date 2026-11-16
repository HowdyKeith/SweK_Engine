# Stealth, crab and fly looming: six rounds (2026-11-15; every number here was produced by code in this tree; predictions are written BEFORE the rounds that test them)

Papers (supplied by Keith): **Santon et al. 2025**, "Stealth and deception: Adaptive motion camouflage in hunting broadclub cuttlefish", Science Advances 11:eadr3686; **Luan et al. 2022**, "A Looming Spatial Localization Neural Network Inspired by MLG1 Neurons in the Crab Neohelice", Frontiers in Neuroscience 15:787256; **Zhao et al. 2023**, "A fly inspired solution to looming detection for collision avoidance", iScience 26:106337. Earlier fly material: `brain/FLY_VISUAL_INPUTS_WIP.md`, `brain/FLY_RETINOTOPY_RF_WIP.md`, `brain/flyGfLoomModel.mjs`.

What each round is and its status (updated as the rounds finish):

| # | round | files | status |
|---|---|---|---|
| 1 | Santon's motion-detector analysis on synthetic treadmill stimuli | `brain/stealthMotion.mjs`, `brain/stealthMotion-selfcheck.mjs` | DONE (this section) |
| 2 | Zhao's EMD, LPLC2 and Giant Fiber model, and a variant with the LPLC2 units on the measured lattice | `brain/flyEmdLplc2Gf.mjs`, `-selfcheck.mjs` | DONE |
| 3 | Stealth stimuli on the fly models (predictions registered first) | `brain/stealthLoomStimuli.mjs`, `brain/stealthRound3-run.mjs`, `brain/stealthRound3-results.txt` | DONE: NOT SUPPORTED |
| 4 | Luan's crab MLG1 looming-localization network | `brain/crabMlg1.mjs`, `-selfcheck.mjs` | DONE (one paper result NOT reproduced) |
| 5 | Stealth stimuli on the crab model (predictions registered first) | `brain/stealthRound5-run.mjs`, `brain/stealthRound5-results.txt` | DONE: NOT SUPPORTED (opposite direction) |
| 7-11 | Held-out crab stripes, fly polarity, treadmill stimulus, FFI variants, ON-gain sweep | `brain/stealthRound7..11-run.mjs` and results files | DONE (see the sections below) |
| 6 | Warning margin against a camouflaged predator, in place of the Escape task (registered first) | `brain/stealthRound6-run.mjs`, `brain/stealthRound6-results.txt` | DONE: NOT SUPPORTED |

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

## Round 6 RESULTS (run 2026-11-15 with `node brain/stealthRound6-run.mjs`; raw table in `brain/stealthRound6-results.txt`)

Warning margin (milliseconds to collision at the first alarm; MISSED = no alarm):

| contrast | fly plain | fly moving | crab plain | crab moving |
|---|---|---|---|---|
| 1 | 183 | 183 | 2798 | 6131 |
| 0.6 | 183 | 183 | 2231 | 6131 |
| 0.4 | 183 | 183 | 1665 | 6131 |
| 0.2 | 183 | 183 | 1065 | 4165 |

**VERDICT: NOT SUPPORTED.** No detector is CAMOUFLAGED (T_min 100 ms fly, 300 ms crab, both assumed). Fly: NEUTRAL, the margin is identical at every contrast and with or without the moving stripes. Crab: BETRAYS, the moving stripes give a margin 2.2 to 3.9 times LONGER than the plain ellipse's at every contrast (the crab network alarms to the stripes early), so in this model the display warns the prey more, not less.
**Predictions:** 1 MISS (the fly array is never missed, even at contrast 0.2; the margin is constant, which satisfies "non-increasing" but not "missed at 0.2"). 2 untested (nothing was missed, so the condition is vacuous). 3 MISS (the crab's plain margin falls steadily, 2798, 2231, 1665, 1065 ms, but it is never missed, even at 0.2). 4 HIT (alarms at every contrast with the stripes). 5 HIT (183 and 2798 ms against T_min).
**Two readings to hold loosely.** (a) The fly array's insensitivity to contrast over 0.2 to 1 is probably the assumed luminance scale (0 to 255 grey levels against thresholds L0 = L1 = 2): a dim edge still clears a threshold of 2 grey levels. It is not a finding about a fly; a different scale or a noise floor would change it (NOT TESTED). (b) The crab margins are long (seconds) because the model alarms while the ellipse is under 20 degrees (Rounds 4 and 5), and it alarms on a receding ball; they are not a measure of a crab's real warning time.
**The whole series in one line:** across Rounds 3, 5 and 6, none of the three models (Zhao's fly array, its surround and lattice variants, Luan's crab network) is fooled by the cuttlefish's moving stripes the way the real crabs were; the fly array is partly fooled at the fast approach only (Round 3, 0.756), and the crab network is alerted by them. That is a statement about these model implementations with their assumptions, not about the animals.

## Series NOT CHECKED (all rounds)
The authors' code for Zhao and Luan; the recorded hunting videos and the animal data beyond the figures read off the plot; Wu et al. 2016 for LC4's receptive field; ModelDB for W_i1; the lattice-to-angle calibration (5 degrees per column is assumed); T_min (assumed); a surround strength other than kappa 1; stripe onset other than at the first frame; whether the crab model's receding-ball alarm is a transcription error of mine or a property of the equations as printed.

## Open items followed up (2026-11-15; `brain/openItems1-run.mjs`, `brain/openItems2-run.mjs`, raw tables `brain/openItems1-results.txt`, `brain/openItems2-results.txt`). EXPLORATORY: none of this was registered first, so it carries no verdict, only observations.

**1. The fly array's contrast insensitivity (Round 6) IS the assumed luminance scale.** Margin of the multiplicative array at r/v 100 ms: lumScale 255: 183 ms at contrast 1 and 0.2, plain and moving; 25: 183 (peak count falls at 0.2); 5: 183 at contrast 1, 153 plain and 163 moving at 0.2; 1 (luminance 0 to 1 as given): 153 plain and 163 moving at contrast 1... and MISSED at 0.2 for both. So with the scale the paper's thresholds (L0 = L1 = 2, OFF cutoff 0.05) are most plausibly in, the array loses the stimulus at contrast 0.2, and the moving stripes neither hide it nor reveal it (both missed; at the larger scales the stripes' margin differs by 6 percent at most). The Round 6 fly verdict (NEUTRAL, no camouflage) holds at every scale tried; the margin-versus-contrast curve does not, and should be quoted only with its lumScale.
**2. The surround strength (Round 3, detector C).** kappa 5, 20, 100 reproduce A exactly (no unit is inhibited); stronger inhibition (smaller kappa): moving-stripe ratio at r/v 50 ms 0.696 (1), 0.707 (0.3), 0.821 (0.1), 0.837 (0.03); at 100 ms 1.022, 1.072, 1.028, 1.021. A stronger surround makes the ratio at 50 ms RISE and never brings it below 0.69 or the 100 ms ratio below 1. The Round 3 verdict does not depend on the made-up kappa over 0.03 to 100.
**3. The lattice scale (Round 3, detector D).** Degrees per column 3 / 5 / 8: moving-stripe ratio at 50 ms 0.875 / 0.667 / undefined (the plain ellipse activates no unit with 29 placed units); at 100 ms 1.000 at all three. The 100 ms ratio of 1.000 is robust to the calibration; the 50 ms value is not (0.875 to 0.667).
**4. The crab model's receding alarm: a candidate cause, found by experiment.** The grouping layer multiplies a pixel's summed value by its neighbourhood mean, and the product is positive for BOTH a darkening and a brightening; so an expanding dark ball (darkening edge) and a receding one (brightening edge) look alike. A new parameter `polarity` ("both" as printed, "off" counting only pixels whose summed value is negative, "on" the opposite; gated, 9 mutants, 8 red, 1 equivalent: S exactly 0 adds nothing) shows: with "off" the approaching ball alarms at the same frame (262) as before and the RECEDING ball does not alarm; with "on" the reverse. **That is a variant, not a finding that the paper's model is OFF-selective: I have not seen the authors' code and the paper's equations as printed (read in Round 4) do not say so.** NOT TESTED: whether "off" is what the authors implemented.
**5. The Round 5 stripes with the OFF-only crab model (exploratory).** r/v 0.2 s: plain alarm at 13.2 degrees; static stripes NO alarm; moving stripes 14.3 degrees (8 percent larger, spikes 35 against 47). r/v 0.4 s: plain 16.7 degrees; static 29.9 (+79 percent, spikes 23 against 67); moving 20.7 (+24 percent, spikes 67 against 67). So with the OFF-only layer the moving stripes DELAY the alarm modestly (no longer trigger it early) and the STATIC stripes delay or remove it more, which is the opposite of the animal (static about equal to plain). Contrast sweep at r/v 0.4 (margins ms, plain / moving): 1: 2798 / 2265; 0.6: 2231 / 2265; 0.4: 1665 / 2265; 0.2: 1065 / 2265: the moving stripes cost margin only at contrast 1 and ADD margin at low contrast. A fade-in of the stripes (30 or 60 frames) does not change the OFF-only result (alarm 14.3 and 20.7 degrees) and does not help the "both" model (alarm at 6 to 12 degrees, early). The Round 5 and 6 verdicts above stand as registered; this is a second model variant that did them differently, reported, not substituted.
**6. Not doable here.** Wu et al. 2016 (LC4's receptive field) and ModelDB (W_i1): `elifesciences.org` does not resolve in this session (it is outside the allowed hosts; I stopped trying), and ModelDB was never allowed. Both need the user to supply the paper or the code, or to allow the host. The Round 6 T_min values remain assumptions; no paper in the tree gives them.

## Rounds 7, 8 and 9 REGISTRATION (written 2026-11-15 BEFORE any of the three is run; all three are registered together so that no result can shape another's prediction)

**What can and cannot be done now.** Of the six suggested next rounds, the three that need no new input are registered here: (7) the darkening-only crab model on HELD-OUT stripe stimuli, (8) a darkening-only (and a brightening-only) fly array, (9) the paper's own exponential-expansion treadmill stimulus through the crab model. NOT started, and why: the filmed-hunt frame sequences (need the videos), Wu 2016 (needs the paper or the host), the trained 4b-E pilot (no champion weights in the tree).
**Honesty about Round 7.** The darkening-only crab model was first seen on the Round 5 stimuli (r/v 0.2 and 0.4 s, azimuth 90, 4 Hz). Predictions on those would be fitting. Round 7 therefore uses stimuli the variant has not seen: other r/v (0.1, 0.3, 0.6 s), another azimuth (270 degrees, segment 12), and the wild stripe rate (2.2 Hz) as well as 4 Hz. The exploratory pattern (moving stripes delay modestly; static stripes delay more) is the hypothesis being generalisation-tested.

### Round 7: held-out stripe stimuli, crab model with polarity "off"
Stimulus: `loomingEllipse` on the 180 x 60 panorama as in Round 5 (144 degree field, 30 frames/s, 3 to 37 pixels, Weber contrast 1) centred at pixel 135 (azimuth 270), r/v 0.1, 0.3, 0.6 s, stripes none / static / moving at 4 Hz and 2.2 Hz. Measure: alarm of segment 12; the ellipse's angular size at the alarm; spike frames in segment 12. Size ratio = size with stripes over plain.
1. The plain ellipse alarms at all three r/v, winner within one segment of 12 (85%).
2. Moving stripes delay or remove the alarm: size ratio at least 1.10 or no alarm in at least 5 of the 6 cells (three r/v x two rates) (65%).
3. Static stripes stay near the plain ellipse, as in the animal: size ratio between 0.8 and 1.25 at all three r/v (35%).
4. Static stripes delay MORE than moving stripes at 4 Hz at two or three of the three r/v (55%).
5. The receding plain ellipse does not alarm with "off" and does alarm with "both" at all three r/v (80%).
**Verdict:** ANIMAL-LIKE iff 2 and 3 hold; GENERALISES (the exploratory pattern holds but static is not like the animal) iff 2 holds and 3 fails; FAILS iff 2 fails. 4 and 5 are hits or misses.

### Round 8: polarity in the fly array
Change: a `polarity` parameter on `brain/flyEmdLplc2Gf.mjs` ("both" as now, "off" keeps only the OFF path (darkening) of the half-detectors, "on" only the ON path), gated with mutants before the run. Stimulus and measures as Round 3 (looming ellipse, r/v 50 and 100 ms, contrast 1, none / static / moving; multiplicative array A at lumScale 255; peak active-unit count, spike count, first-spike angular size).
1. "off" responds to the plain looming ellipse (a DARK ellipse on grey) with a peak count within 30 percent of "both" (75%).
2. "on" responds much less: its plain-ellipse peak at most half of "off" (60%).
3. Moving-stripe ratio with "off": at most 0.756 (A's) at 50 ms r/v (50%) and at least 0.9 at 100 ms r/v (65%).
4. The stripes' light bands (brightening where a dark band leaves) feed the ON path: "on" moving-stripe peak is larger than "on" plain-ellipse peak at both r/v (60%).
**Verdict:** the stripes MASK the "off" array iff its moving-stripe ratio is at most 0.6 at BOTH r/v; NOT SUPPORTED otherwise. Hits and misses reported for 1 to 4.

### Round 9: the paper's own stimulus, an exponentially expanding ellipse (10 s)
Change: `loomingEllipse` gets an option `widths` (the horizontal extent in pixels at each frame) so any size law can be used; gated before the run. Stimulus: the ellipse expands exponentially from 14 x 10 degrees to 74 x 53 degrees over 10 s (300 frames at 30 per second; horizontal extent 7 to 37 pixels, the panorama's 0.5 pixel per degree) at azimuth 90, contrast 1, stripes none / static / moving 4 Hz; crab network with polarity "both" and "off". Measure: time of the first alarm of segment 4 (seconds), spike frames; also the contracting ellipse (the sequence reversed, plain).
1. "both": all three alarm, the moving stripes earliest (alarm time at most 0.7 of the plain's) (65%).
2. "off": the plain ellipse alarms; the moving stripes alarm later than the plain ellipse or not at all (60%); the static stripes within 15 percent of the plain's alarm time (40%).
3. The contracting plain ellipse alarms with "both" and not with "off" (70%).
**Verdict (animal-like):** "off" is ANIMAL-LIKE iff the plain and static alarm times agree within 15 percent AND the moving stripes alarm at least 15 percent later or not at all. The paper's own number (response probability about 0.8, 0.8, 0.58, read off the plot) cannot be matched by a deterministic model; only this pattern is compared.

## Round 7 RESULTS (`node brain/stealthRound7-run.mjs`, raw `brain/stealthRound7-results.txt`): FAILS
Alarm angular size, darkening-only crab model, azimuth 270, plain / static / moving 4 Hz / moving 2.2 Hz: r/v 0.1 s: 11.9 / 30.6 (x2.57) / 22.7 (x1.90) / no alarm; 0.3 s: 13.6 / 30.6 (x2.25) / 14.1 (x1.04) / 31.5 (x2.32); 0.6 s: 17.6 / 29.3 (x1.67) / 11.8 (x0.67) / 20.1 (x1.14). Receding plain: no alarm with "off" at all three; with "both" it alarms at 0.3 and 0.6 s but NOT at 0.1 s.
**Verdict (rule written before): FAILS** (prediction 2 missed: moving stripes delayed or removed the alarm in 4 of the 6 cells, the rule needed 5; at 0.6 s with 4 Hz they alarm EARLIER, x0.67). Predictions: 1 HIT (alarms, winner 12). 2 MISS (4 of 6). 3 MISS (static x1.67 to 2.57, not 0.8 to 1.25). 4 HIT (static delays more than moving at 3 of 3). 5 MISS (the "both" model did not alarm on the receding ellipse at r/v 0.1 s). The exploratory Round 5 pattern did not generalise cleanly: the static stripes delay the alarm strongly and the moving ones inconsistently, and the effect depends on r/v and stripe rate.

## Round 8 RESULTS (polarity in the fly array; `node brain/stealthRound8-run.mjs`, raw `brain/stealthRound8-results.txt`): SUPPORTED, with caveats
Gate first: `polarity` on `flyEmdLplc2Gf.mjs` (section 6c; 6 mutants, all red). Peak active-unit count (plain / static / moving) and the moving-stripe ratio: **both** r/v 50 ms 1300 / 1150 / 983 (0.756); 100 ms 1820 / 1738 / 1820 (1.000). **off** (darkening only) 50 ms 1300 / 0 / 160 (**0.123**); 100 ms 1820 / 626 / 754 (**0.414**). **on** (brightening only): plain 0 at both r/v; static 1150 and 1565, moving 983 and 1820.
**Verdict: SUPPORTED** by the rule (off-array moving-stripe ratio at most 0.6 at both r/v). Predictions: 1 HIT (off plain = both plain exactly: the dark ellipse is a pure OFF stimulus here). 2 HIT (on plain 0). 3 MISS (at most 0.756 at 50 ms: 0.123, yes; at least 0.9 at 100 ms: 0.414, no). 4 HIT, but trivially (on plain 0).
**Caveats said plainly.** (a) STATIC stripes mask the off-only array too (0.000 and 0.344), unlike the animal's static stripes, so this is not the cuttlefish's motion trick specifically: any stripe pattern that adds bright bands inside the dark ellipse cuts the OFF-path response here. (b) In the full array the same stripes hardly matter because the ON path carries the light bands; that the masking vanishes when both paths are present is an observation, and WHY the off-only array loses its response is an inference I have not tested (candidate: the bright bands' edges give OFF-path motion in the null direction inside the arms). (c) An array that has lost its ON path is not the fly's: T4 and T5 both exist. A single-polarity detector is a thought experiment.

## Round 9 RESULTS (exponential expansion, 10 s; `node brain/stealthRound9-run.mjs`, raw `brain/stealthRound9-results.txt`): NOT animal-like
`loomingEllipse` gained `widths` (gated, 10 mutants, all red after one row). Crab network, alarm time of segment 4 (plain / static / moving): **both** 3.17 s / 3.93 s (x1.24) / 0.30 s (x0.09); **off** 3.17 s / 7.13 s (x2.25) / 2.03 s (x0.64). The contracting plain ellipse alarms with "both" (0.57 s) and not with "off".
**Verdict: "off" is NOT ANIMAL-LIKE** (static is 2.25 times later than plain, not within 15 percent; moving stripes alarm EARLIER than plain, not later). Predictions: 1 HIT. 2 MISS (off moving earlier, off static not within 15 percent). 3 HIT.
**Across Rounds 7 to 9:** the darkening-only crab model removes the receding-ball alarm (a property worth keeping) but does not reproduce the animal's static-equals-plain-above-moving pattern on either the collision-course stimulus (Rounds 5, 7) or the paper's own exponential stimulus (Round 9); static stripes delay it more than moving stripes in all three. The fly array loses its response to a stripe-filled ellipse only when its ON path is removed (Round 8).

## Next rounds still open (need input I do not have)
Filmed-hunt frame sequences; Wu 2016 (LC4 receptive field); a trained 4b-E pilot. Possible without input: a crab-model variant with a spatially pooled or temporally extended feed-forward inhibition (the only mechanism in the paper's model that distinguishes whole-field motion from a looming object), and a two-polarity fly array with the ON path's gain lowered (a continuum between "both" and "off").

## Rounds 10 and 11 REGISTRATION (written 2026-11-15 BEFORE either is run; registered together)

### Round 10: feed-forward inhibition (FFI) variants in the crab model
**Why.** The paper's FFI is the only mechanism in the network that tells whole-field motion from a looming object; in the present implementation it is a per-segment sum of |P(t-1)| over that segment's pixels, persistence a_ffi1 0.5, threshold T_FFI about 15.3. If the stripes' downward motion is what the animal responds to by NOT alarming, a wider or longer FFI might supply it. **Variants** (new parameter `ffiPool`: "segment" as now, or "global": F's drive is the sum of |P(t-1)| over ALL 16 segments divided by (16 x pixels per segment), the same previous-frame quantity): S segment (baseline), G global, E segment with persistence a_ffi1 0.9, GE global with persistence 0.9; each with polarity "both" and "off": 8 variants.
**Stimuli (held out: none was used in Rounds 5, 7 or 9).** The Round 5 construction at azimuth 180 (pixel 90, segment 8), r/v 0.15 and 0.5 s, contrast 1, stripes none / static / moving at 4 Hz, plus the receding plain ellipse. Measure: alarm of segment 8, the ellipse's angular size at the alarm, spike frames. Size ratio = with stripes over plain.
**Predictions** (confidence):
1. Pooled FFI barely helps the moving stripes: for "both", G's moving-stripe size ratio is within 15 percent of S's at both r/v (65%): a stripe pattern in one segment adds little to a whole-field average.
2. Longer persistence delays the moving-stripe alarm: E's moving size ratio is at least 15 percent above S's (polarity "both") at both r/v (55%).
3. Plain alarms are kept in at least 6 of the 8 variants at both r/v (60%).
4. The receding plain ellipse does not alarm in every "off" variant (80%).
**Verdict.** A variant is ANIMAL-LIKE iff at both r/v: the plain ellipse alarms, static stripes' size ratio is between 0.85 and 1.2, moving stripes alarm at a ratio of at least 1.15 or not at all, and the receding ellipse does not alarm. **SUPPORTED iff at least one of the 8 variants is ANIMAL-LIKE; NOT SUPPORTED if none is** (my expectation: 65 percent that none is). Predictions 1 to 4 are hits and misses.

### Round 11: ON-gain sweep of the fly array
**Change.** A parameter `onGain` (default 1) multiplying the ON path of the EMD (0 is the same as polarity "off"); gated with mutants before the run. **Stimuli and measures:** Round 3 (looming ellipse r/v 50 and 100 ms, none / static / moving, multiplicative array, lumScale 255), onGain 1, 0.5, 0.25, 0.1, 0.03, 0. Peak active-unit count, moving-stripe ratio and static-stripe ratio.
**Predictions:**
1. The moving-stripe ratio at 100 ms r/v does not rise as the gain falls (monotone non-increasing from gain 1 to gain 0, ties allowed) (60%).
2. Masking (ratio at most 0.6) at BOTH r/v appears for gain 0.1 and below and is absent (ratio over 0.6 at 100 ms) at gain 0.5 and above (50%).
3. The plain ellipse's peak count is within 5 percent of its gain-1 value at every gain (85%): the dark ellipse is a pure OFF stimulus.
4. The static-stripe ratio is within 0.15 of the moving-stripe ratio at every gain and r/v (50%): the masking is not specific to the stripes' motion.
**Verdict.** The masking is a GRADED effect of the ON path iff prediction 1 holds AND both ratios are at most 0.6 at gain 0.03; otherwise NOT SUPPORTED (it is an all-or-nothing effect of removing the path, or not monotone). The gain g* (the largest gain with both ratios at most 0.6) is reported.

## Round 10 RESULTS (FFI variants, crab model; `node brain/stealthRound10-run.mjs`, raw `brain/stealthRound10-results.txt`): NOT SUPPORTED
Gate first: `ffiPool` ("global": every segment's feed-forward drive is the mean over all 16 segments of the previous-frame |P|), 9 mutants, all red after one row (signed vs absolute sum). Held-out stimulus: azimuth 180, r/v 0.15 and 0.5 s. Alarm size ratio with stripes (static / moving) and the receding ellipse:
| variant | r/v 0.15 | r/v 0.5 | receding |
|---|---|---|---|
| S, G, GE with "both" (identical) | x1.30 / x0.57 | x1.15 / x0.37 | alarms |
| E ("both", persistence 0.9) | x1.30 / x0.57 | x1.15 / x0.37 | no alarm at 0.15, alarms at 0.5 |
| S, G, GE with "off" (identical) | none / x1.51 | x2.36 / x0.84 | no alarm |
| E "off" | none / none | none / none | no alarm |
**Verdict: NOT SUPPORTED, 0 of 8 variants ANIMAL-LIKE.** Predictions: 1 HIT (pooling changes nothing: G equals S in every cell, to the digit). 2 MISS (longer persistence changed the "both" moving ratio not at all: x0.57 and x0.37 as S). 3 HIT (every variant's plain ellipse alarms at both r/v). 4 HIT (no "off" variant alarms on the receding ellipse).
**What the table says, labelled.** (a) The feed-forward inhibition, pooled or not, does not set the alarm size in the "both" model at all: the alarm comes before F has risen (inference; the F trace was not tabulated for these runs). (b) The only variant that makes stripes matter is "off" with persistence 0.9, and there EVERY stripe pattern, static or moving, removes the alarm: masking by stripes in general, again not the animal's static-equals-plain pattern. (c) The moving stripes' alarm is early (x0.57, x0.37) in all four "both" variants: the earlier Round 5 and 9 finding, confirmed on a third azimuth.

## Round 11 RESULTS (ON-gain sweep, fly array; `node brain/stealthRound11-run.mjs`, raw `brain/stealthRound11-results.txt`): NOT SUPPORTED
Gate first: `onGain` (the ON path's gain; it enters the detector twice, the path and its own delayed copy, so the ON-path motion scales as gain squared; 8 mutants, 7 red, 1 equivalent `+ 0`). Moving-stripe ratio (peak count) at r/v 50 / 100 ms: gain 1: 0.756 / 1.000; 0.5: 0.756 / 1.000; 0.25: 0.746 / 1.000; 0.1: 0.679 / 1.000; 0.03: 0.677 / 0.987; 0: 0.123 / 0.414. Static ratio: 0.885 / 0.955 at gain 1, 0.829 / 0.955 at 0.1, 0.734 / 0.921 at 0.03, 0.000 / 0.344 at 0.
**Verdict: NOT SUPPORTED** (rule: graded iff monotone AND both ratios at most 0.6 at gain 0.03; the 0.03 ratios are 0.677 and 0.987; g* does not exist, no gain above 0 gives masking at both r/v). Predictions: 1 HIT (non-increasing at 100 ms r/v: 1.000 down to 0.414). 2 MISS (no gain at or above 0.03 masks at both r/v). 3 HIT (the plain peak is identical at every gain: the dark ellipse is pure OFF). 4 HIT (static within 0.15 of moving everywhere; the gain-0.1 cell at 50 ms differs by exactly 0.150, on the line).
**Reading.** The masking in Round 8 is not a graded property of the ON path: it needs the ON path essentially removed (the ratio jumps between gain 0.03 and 0 at both r/v, 0.677 to 0.123 and 0.987 to 0.414). Because the ON-path motion scales as the gain squared, gain 0.03 is a 1000-fold reduction and still leaves the array unmasked at 100 ms. An all-or-nothing effect fits "the stripes' light bands are carried entirely by the ON path"; that is an inference, the ON-path contributions were not inspected separately.

## Series summary after Round 11
Eleven rounds. Of the registered tests: Round 3 NOT SUPPORTED, 5 NOT SUPPORTED (opposite sign), 6 NOT SUPPORTED, 7 FAILS, 8 SUPPORTED (with the ON path removed), 9 NOT animal-like, 10 NOT SUPPORTED, 11 NOT SUPPORTED. The one positive result needs an array without its ON path. No model variant tried reproduces the animal's pattern (static about plain, moving lower) on any stimulus. Still needing input: filmed-hunt frames, Wu 2016, the trained 4b-E pilot.

## Wu et al. 2016 read (2026-11-16; eLife 5:e21022, the paper and its figures PDF supplied by Keith; text extracted with pdftotext and Figure 6 and its supplement viewed)
**Answer to the open item "LC4's receptive field": the paper does NOT give one.** What it does give, by section:
* **Anatomy.** LC4 is the only LC type with processes in lobula layer Lo1 (all but LC4, LC12 and LC18 reach Lo5). LC dendrites of each type form a retinotopic array covering the whole lobula; arbors are multicolumnar, "about 10 (LC10a) to over 60 (LC11) visual columns" of about 750 per eye, overlapping, not tiled; "the distinct arbor spreads of different LC cells determine the spatial extent over which their specific response properties are computed" (the authors' proposal). **LC4's and LPLC2's own column counts are in Supplementary file 1A, which is not in the PDFs supplied.** Figure 6 supplement 1 shows MCFO arbors of both (LC4 as a few compact patches; LPLC2 in the lobula as long, extended arbors, more elongated than the others, a visual impression only, not a measurement).
* **Giant Fiber link.** The Discussion says LC4 activation "might evoke a jumping response via activation of the Giant Fiber", citing Strausfeld and Bassemir 1983 for ColA and "LC4 (K von Reyn and GM Card, personal communication, September 2016)" as GF presynaptic partners. Five types (LC4, LC6, LC15, LPLC1, LPLC2) drive highly penetrant jumping when activated; LPLC2 activation gave jumping and backward walking in about equal numbers; LC4 and LPLC1 jumped more in the single-fly assay than in the arena.
* **Physiology.** Two-photon calcium imaging was done for LC6, LC16 (dark looming, tuned to SLOWER looming speeds, specific to dark objects) and LC11 (small moving objects) only. **No LC4 or LPLC2 responses are reported.**
**Consequences for this series.** (1) The lattice calibration stays an assumption (5 degrees per column): this paper offers only that a type's arbor spans several to over 60 columns. (2) LC4's receptive field and LPLC2's size selectivity must come from elsewhere: von Reyn et al. 2017 (Neuron) and Klapoetke 2017 (already read, LPLC2) are the candidates; neither was supplied for LC4. (3) The paper supports the premise of Rounds 2 and 3 that LC4 and LPLC2 are looming-related Giant Fiber inputs (activation evidence), not the model's receptive-field geometry.
