// WebGLEngine/tools/ship/gateBudget.mjs -- v3212
//
// HOW LONG IS A GATE ALLOWED TO TAKE, AND WHO SAYS SO.
//
// *** THE 60s BUDGET WAS DERIVED ONCE AND NEVER RE-DERIVED. *** selfchecks.mjs states the rule in its own
// header -- "3x the slowest measured run is the headroom" -- from a slowest measured run of 19.4s. That was
// true when it was written. The lab has since grown roughly four hundred versions of instruments, and when the
// full suite was finally run end to end at v3211 it reported 41 of 597 FAILED, of which THIRTEEN WERE TIMEOUTS
// AND EIGHT OF THOSE PASS GIVEN ROOM.
//
// *** THE SHARPEST ONE IS windTunnel AT 63.3s. IT MISSES THE BUDGET BY THREE SECONDS AND HAS BEEN COUNTED AS A
// FAILING CHECK. *** A TIMEOUT IS NOT A FAILURE (v3076) -- and a budget that has drifted out of date manufactures
// failures wholesale, which is precisely how a suite teaches people to ignore it.
//
// THE SHAPE OF THE SUITE IS WHY A BLANKET RAISE IS THE WRONG ANSWER. Measured across the 556 gates that
// recorded a time in the v3211 run:
//
//     under 1s   473        1-5s   48        5-15s   24        15-30s   3        over 30s   8
//
// FOUR HUNDRED AND SEVENTY-THREE SUB-SECOND GATES AND A TAIL OF ABOUT TWENTY. Raising everything to 300s does
// nothing for 99% of the suite and turns a genuinely hung gate into a five-minute stall. TWO POPULATIONS, TWO
// BUDGETS -- which is this project's most repeated shape (two things wearing one label) pointed at its own
// runner.

/**
 * THE SLOWEST GATE THAT PASSED INSIDE THE OLD BUDGET, measured in the v3211 full-suite run.
 *
 * This is the number the default is DERIVED from, and it is stored rather than folded into the answer so the
 * derivation can be re-checked instead of trusted. gateBudget-selfcheck asserts the default really is 3x this,
 * and that no gate in the general population has crept past a third of it -- WHICH IS THE CHECK THAT WOULD HAVE
 * CAUGHT THE DRIFT THIS FILE EXISTS TO REPAIR, four hundred versions ago.
 */
// *** THE VALUE IS THE MEASUREMENT, NOT A TIDY VERSION OF IT. *** I first typed 47700 because that is what
// "47.7s" reads as, and gateBudget-selfcheck went red comparing it against the 47729 actually recorded. A
// ROUNDED MEASUREMENT IS A DIFFERENT NUMBER FROM THE MEASUREMENT, and the gate caught it on its first honest
// run -- which is the entire argument for checking a derivation against an independent record.
// *** v3913 -- RE-PINNED, BECAUSE THE GATE THIS NAMED HAD OUTGROWN THE BUDGET IT DEFINES. ***
// assumptionMap-selfcheck was measured at 47729ms in the v3211 run and stopwatch-measured at 284000ms now --
// SIX TIMES ITS RECORDED VALUE, and TWICE the 143s default derived from it. The constant that sets everyone
// else's budget named a gate that could no longer pass that budget, which is why four gates read as TIMEOUT on
// the rig while three of them were simply being killed.
//
// The re-pin is DERIVED, not chosen: every gate that had crept past the old line moved into the tail below
// (their measurements were already sitting in gate-timings.json), and this now names the slowest gate that is
// genuinely still in the general population. 1019 gates remain under it. THE DEFAULT BARELY MOVES -- 143.2s to
// 139.9s -- which is the point: the general population was never slow, it had eighteen tail gates hiding in it.
//
// The alternative was pinning to the observed worst, observableUnits at 131.9s, which would have made the
// default 396s for all 1019. This file's own header refuses that in advance: raising everything "turns a
// genuinely hung gate into a five-minute stall". TWO POPULATIONS, TWO BUDGETS -- so the fix is to put the tail
// gates in the tail, not to widen the budget for gates that never needed it.
//
// *** v4000 -- RE-PINNED AGAIN, AND THIS TIME THE RECORD WAS STALE IN BOTH DIRECTIONS AT ONCE. ***
// The independent check below went red: the observed worst in the general population is
// physics/nuclear/reactorControl-selfcheck.mjs at 60.6s, against a recorded 46.6s. And the gate this line
// NAMED had moved too -- flip3dBind now records 38.8s, not the 46639 written here. So the constant was
// carrying a number that no longer described the gate it named, AND naming a gate that was no longer the
// slowest. Both halves wrong, and only the second was visible.
//
// THE RE-PIN IS DERIVED, NOT CHOSEN, exactly as v3913's was: the value is read straight out of
// gate-timings.json, which selfchecks.mjs writes on a full run. That check's own instruction is followed to
// the letter -- "WHEN IT GOES RED THE ANSWER IS TO RAISE SLOWEST_GENERAL FROM THE NEW MEASUREMENT, NOT TO
// LOWER THIS LINE."
//
// The default moves 139.9s -> 181.9s. That is a real cost and it is the smaller one: reactorControl is
// genuinely in the general population, so the alternative is a gate that gets killed for being what it is.
// The tail table below is still where a gate belongs once it outgrows this, and v3913's rule stands --
// TWO POPULATIONS, TWO BUDGETS, rather than widening the budget for the 1100 gates that never needed it.
// *** v4075 -- RE-PINNED A THIRD TIME, AND THE GATE IT NAMES HAS NOW BEEN THE SLOWEST THREE ROUNDS RUNNING.
// *** 46.6s (v3913) -> 60.6s (v4000) -> 103.1s here, all the same gate: physics/nuclear/reactorControl.
// The value is READ OUT OF gate-timings.json rather than typed, exactly as v4000 and v3913 were, and the
// check's own instruction is followed to the letter -- "WHEN IT GOES RED THE ANSWER IS TO RAISE
// SLOWEST_GENERAL FROM THE NEW MEASUREMENT, NOT TO LOWER THIS LINE."
//
// The default moves 181.9s -> 309.4s. THAT IS A REAL COST AND IT IS STILL THE SMALLER ONE: reactorControl
// is genuinely in the general population -- point-reactor kinetics with six delayed-neutron precursor
// groups, bisected inhour roots checked against RK4 integration of the same seven ODEs -- so the
// alternative is a gate killed for being what it is.
//
// WHAT IS NOT DONE HERE: moving it to the tail table. v3913's rule is TWO POPULATIONS, TWO BUDGETS, and
// the tail is for gates whose cost is a FIXTURE (the Kelvin-Helmholtz cluster, 527-690s). A 103s gate in
// a table whose smallest entry is 49.9s would be the tail absorbing the general population instead of
// standing apart from it -- and then nothing would be left measuring what an ordinary gate costs.
// *** v4304 -- RAISED FROM THE RIG'S OWN RECORD, WHICH IS WHAT THE INSTRUCTION SAYS TO DO. *** The v4279
// gate-timings.json recorded opticsBind at 109,899 ms and menuScope at 109,708 ms in the general population,
// both above the 103,141 ms recorded here, and gateBudget-selfcheck has been red on exactly that line since
// (redCensus.RED_AT_V4279). The same pass raised nineteen MEASURED bases to their observed runtimes, per that
// table's own rule; the default budget moves from 309 s to 330 s with this line, and nothing else changes.
export const SLOWEST_GENERAL = { gate: "tools/roundhouse/opticsBind-selfcheck.mjs", ms: 109899 };

/** The factor selfchecks.mjs's own header already committed to. Kept as a named constant, not a multiplication. */
export const HEADROOM = 3;

/** 3 x 103.1s. NOT typed: computed, so the two halves cannot drift apart. */
export const DEFAULT_BUDGET_MS = SLOWEST_GENERAL.ms * HEADROOM;

/**
 * THE TAIL, EACH ENTRY CARRYING THE MEASUREMENT IT WAS DERIVED FROM.
 *
 * Every `measuredMs` below is a real completion on an idle box with a 300s ceiling, recorded in the v3211
 * session. A NUMBER WITH ITS MEASUREMENT ATTACHED CAN BE CONTRADICTED BY A RE-MEASURE; a bare number cannot,
 * and that is the whole difference between this table and the constant it replaces.
 *
 * THE HEADROOM HERE IS 2x, NOT 3x, AND THE REASON IS THAT THESE ARE NOT GUESSES. The global 3x absorbs the fact
 * that the general population's slowest member is only approximately known and the machine may be busy. For
 * these twelve the completion time is measured directly, so 2x is ample and it keeps a genuine hang bounded --
 * 3x on a 280s gate would stall a suite for fourteen minutes before admitting anything was wrong.
 */
export const MEASURED = {
    // *** v4456 -- MEASURED BECAUSE IT HAD NO EVIDENCE AT ALL, WHICH IS THE STATE THIS TABLE EXISTS TO END. ***
    // physics/render/transmission-selfcheck.mjs was widened on the other branch (the chi+ and beta-G2 round)
    // from a gate that finished inside the quick sweep's 3000 ms cap to one that does not. The sweep kills it
    // at the cap with a 124, a 124 says nothing, and so it fell into "never run" -- the fourth state this
    // gate's own header calls the one that hides things. It is not slow by accident: it now integrates the
    // transmitted lobe over four G forms at several roughnesses, which is the measurement that round is FOR.
    //
    // FIVE RUNS, ALL EXIT 0: 20387, 20480, 15175, 15405, 13477 ms. The spread is load, not variance in the
    // gate -- the two twenty-second readings were taken while a ship verify was running on the same box. The
    // SLOWEST is recorded rather than the mean, because this is a budget and a budget set to the average of a
    // contended measurement re-creates the timeout it is meant to prevent.
    "physics/render/transmission-selfcheck.mjs": 20480,
    // *** v4173 -- MEASURED TO COMPLETION FOR THE FIRST TIME, WHICH UNRESOLVED'S OWN HEADER INSTRUCTS. ***
    // 1140363 ms, EXIT 0, all checks passing -- 87 devices, 306 modes, every one built. It had been listed
    // as "exceeded a 150s cap at v3924" ever since, on the 309 s DEFAULT.
    //
    // *** AND IT HAD TO BE MEASURED BECAUSE v4166 WAS ABOUT TO MAKE IT WORSE -- MY OWN DOING. *** Correcting
    // the runaway host scale from 8 to the honest 2.05 cut this gate's granted budget from 309*4.31 = 1334 s
    // to 309*2.05 = 634 s. Keith's last run did 1270 s of device work inside that 1334 s and still timed out
    // by a whisker; at 634 s it would have managed HALF. The inflated scale had been quietly rescuing a gate
    // whose real cost is four times the default, and correcting the scale did not break that -- IT REVEALED
    // IT. Both are true and the effect on the next run is the same, so it is fixed here rather than argued.
    "tools/roundhouse/corroborationCensus-selfcheck.mjs": 1140363,
    // *** v4171 -- MOVED OUT OF UNRESOLVED, WHICH IS WHAT THAT TABLE'S OWN HEADER INSTRUCTS. *** Both were
    // listed as "exceeded a 150s cap at v3924" and both have since been MEASURED TO COMPLETION in
    // gate-timings.json -- 255.9s and 288.0s, far above a skip's ~0.05s, and selfchecks excludes skipped runs
    // from the record. Left on the 309s default they had 1.21x and 1.07x of headroom, THE TWO THINNEST
    // MARGINS IN THE TREE, and shaderRefs duly timed out on Keith's rig this session. A DEFAULT IS NOT A
    // MEASUREMENT: it is what a gate gets while nobody knows, and these are no longer unknown.
    // *** v4304 -- #34, MEASURED TO COMPLETION TWICE. *** knobLiveness sat in the general population on the
    // 309 s default and was the slowest gate anybody had SEEN there: gate-timings.json records 291,628 ms from
    // Keith's rig (129 devices at 20 s), and gateBudget-selfcheck went red on exactly that line. Stopwatch-timed
    // to completion here at v4304: 179,345 ms, EXIT 0, all checks passing, in this sandbox's idle box. The
    // basis is the RIG'S figure, the larger of the two, because the rig is where the budget is spent; the
    // sandbox number is recorded so the ratio between the boxes (1.63x) is known rather than guessed.
    // *** AND THEN #38 MADE THE REAL-PLANT ASSERTION UNCONDITIONAL, WHICH CHANGES WHAT THE GATE IS. *** The
    // figures above are for the gate WITHOUT its section-3i live probeKnob pair (it was behind KNOB_REAL_PLANT=1).
    // Stopwatch-timed here with the pair on: 423,693 ms, EXIT 0 -- 244 s of stability builds on top. That is
    // the only measurement of the gate as it now ships, so it is the basis. The rig has no figure for this
    // shape yet; at the 1.63x ratio it would run ~690 s, inside the 847 s this basis buys, and the
    // gate-timings.json cross-check below will raise the basis again the day the rig records more.
    "tools/roundhouse/knobLiveness-selfcheck.mjs":   423693,

    // v4426 -- *** THE LAST THREE GATES IN THE TREE WITH NO EVIDENCE ABOUT THEIR OWN RUNTIME. ***
    // tools/ship/budgetEvidence-selfcheck.mjs has been red since v4279 asking for exactly this, and its
    // register line said SIXTY-SEVEN gates had none. The true figure, run today, is THREE -- the line had
    // drifted 22x and nothing forced it to move, which is this round's other half. All three were timed with
    // `date +%s%N` around a real run, to completion, and ALL THREE EXIT 0: none of them was slow because it
    // was broken, they were slow and therefore never swept, and never swept is why they had no evidence.
    "tools/roundhouse/modeDistinct-selfcheck.mjs":   379689,   // exit 0, MEASURED v4426
    "tools/ship/divineEye-selfcheck.mjs":             68395,   // exit 0, MEASURED v4426
    "tools/ship/traderPolicy-selfcheck.mjs":         38648,   // exit 0, MEASURED v4426
    // *** v4304 -- #15's REMAINDER. *** budgetEvidence-selfcheck named thirteen gates with no runtime evidence:
    // eleven the ship-time quick sweep kills at its 20 s cap every run (a 124 is not evidence) and the two new
    // this round. All thirteen were stopwatch-timed serially to EXIT 0 in this sandbox. Twelve are under
    // SLOWEST_GENERAL and went into gate-timings.json as the general population; redCensus is not -- it is the
    // census, it RUNS gates -- so it is measured here. Basis 140,941 ms, the run overlapping the last two minutes
    // of the knobLiveness stopwatch; the rig at 1.63x would be ~230 s, inside the 282 s this basis buys.
    "tools/ship/redCensus-selfcheck.mjs":            140941,
    "tools/ship/orphanTriage-selfcheck.mjs":         297764,
    "tools/ship/shaderRefs-selfcheck.mjs":           288017,
    "tools/ship/windTunnel-selfcheck.mjs":            63300,
    "simulation/lbm/inflow-selfcheck.mjs":           111804,
    "tools/ship/sheddingSpectrum-selfcheck.mjs":     120946,
    "tools/roundhouse/thermalScaling-selfcheck.mjs": 232051,
    "tools/roundhouse/labExport-selfcheck.mjs":      241111,
    "tools/roundhouse/pipeFlowKey-selfcheck.mjs":    250473,
    // *** v3941 -- MEASURED TO COMPLETION AT LAST, AND THE MEASUREMENT IS WHY IT COULD NEVER PASS. ***
    // valueMatch sat in UNRESOLVED on the 139.9s general default since v3924 ("exceeded a 150s cap; never
    // timed before that"). Stopwatch-timed on this box across three runs: 471s, 468s and 477s -- THREE AND A
    // HALF TIMES THE BUDGET IT WAS BEING KILLED AT. So on the rig it was never a slow gate, it was a gate
    // nobody had seen the end of, and A TIMEOUT IS NOT A FAILURE: the real failure it was carrying (34 open
    // matches on a shared small integer, the equal-one cluster outgrowing its own pairwise bookkeeping) was
    // invisible for as long as it was over budget. Same shape as labResults at v3853, and the fourth time
    // this table has found a hidden failure behind a missing entry rather than behind a bug.
    //
    // IT WILL OUTRUN THIS NUMBER, and that is recorded rather than papered over. valueMatch scans every
    // numeric observable of every scannable device and compares them PAIRWISE, so its cost grows with the
    // SQUARE of the lab -- the same growth corroborationCensus and labResults' entries already warn about,
    // and steeper. This is a real completion on a real box, not a ceiling.
    "tools/roundhouse/valueMatch-selfcheck.mjs":     833705,
    // *** v3973 -- THE FIFTH TIME THIS TABLE HAS HIDDEN A FAILURE BEHIND A MISSING ENTRY, AND THE SAME SHAPE
    // AS valueMatch DIRECTLY ABOVE. *** sensitivity sat in UNRESOLVED on the 139.9s general default since v3924
    // ("exceeded a 150s cap; never timed before that"). Stopwatch-timed on this box across three runs at v3973:
    // 176873ms, 170384ms and 156443ms -- median 170384ms, every run GREEN. So it was never a gate that could not
    // finish; it was a gate nobody had seen the end of, and for as long as it was over budget the REAL failure
    // it was carrying was invisible: its last check was failing 11 dead knobs against a cap of 8, and TEN OF
    // THOSE ELEVEN TURNED OUT TO BE ALIVE (tolerances and caps that a 1.1x nudge cannot move by construction).
    // A TIMEOUT IS NOT A FAILURE, which is exactly why an untimed slow gate can sit red for fifty rounds.
    //
    // THE SPREAD IS WIDE AND IS RECORDED AS SUCH: 156s to 177s, 13% across three runs on a quiet box, because
    // the cost is 30 devices x every mode x every knob and a few of those devices are themselves iterative. The
    // MEDIAN is what is written down; the 2x tail headroom this table applies covers the rest.
    "tools/roundhouse/sensitivity-selfcheck.mjs":    225004,
    "tools/ship/labDevices-selfcheck.mjs":           253635,
    "tools/roundhouse/rayleighOnset-selfcheck.mjs":  279845,
    // *** v3913 -- THE EIGHTEEN THAT HAD CREPT PAST THE GENERAL LINE, PLUS TWO MEASURED THIS ROUND. ***
    // Not one number here is invented: the seventeen below came straight out of gate-timings.json, which is the
    // record of what they ACTUALLY took in a full suite, and the three after them were stopwatch-timed on an
    // otherwise idle box this round. gateBudget-selfcheck had been red for exactly this -- "no gate in the
    // general population has crept past a third of the default" -- and the red was right for four hundred
    // versions while nobody moved the gates it was pointing at.
    "tools/roundhouse/observableUnits-selfcheck.mjs":     215814,
    "physics/thermal/stefan-selfcheck.mjs":               141746,
    "physics/sph/poolFixture-selfcheck.mjs":              119027,
    "tools/roundhouse/detectionMap-selfcheck.mjs":         99710,
    "tools/roundhouse/compose-selfcheck.mjs":              109896,
    "simulation/lbm/settleCurve-selfcheck.mjs":            89237,
    // v4075 -- RE-MEASURED after a timeout on Keith's rig: 91924ms here against the 76003ms recorded in the
    // v3211 session. The table's own rule is that "a number with its measurement attached CAN BE
    // CONTRADICTED BY A RE-MEASURE", and this is that contradiction -- the entry understated the gate by
    // 21%, so every budget derived from it was 21% short before any host factor was applied.
    // NOT raised beyond the measurement: assumptionMap was re-measured in the same round and came in
    // BELOW its entry (230.5s against 284s), and was left alone for exactly that reason. A table that is
    // only ever revised upward is a table that drifts toward never failing.
    "tools/roundhouse/hydrostatic-selfcheck.mjs":          132215,
    "tools/ship/doorKinds-selfcheck.mjs":                  100047,
    "physics/astroparticle/jeans-selfcheck.mjs":           98899,
    "tools/render-qa/terminatorOracle-selfcheck.mjs":      91559,
    "tools/roundhouse/zeroRangeSweep-selfcheck.mjs":       70538,
    "tools/roundhouse/stabilityBind-selfcheck.mjs":        86618,
    "tools/ship/ddaPrecisionReport-selfcheck.mjs":         108706,
    "physics/sph/tiltPower-selfcheck.mjs":                 65440,
    "physics/sph/wideTilt-selfcheck.mjs":                  64162,
    "physics/mesh/weightScaling-selfcheck.mjs":            85072,
    "tools/ship/loopSearch-selfcheck.mjs":                 98059,
    // MEASURED AT v3913, stopwatch-timed, each run alone:
    // assumptionMap PASSES at 284s. It was the SLOWEST_GENERAL pin at 47729ms and had grown 6x underneath it.
    "tools/roundhouse/assumptionMap-selfcheck.mjs":  333639,
    // *** census FAILS at 717s, AND THAT IS THE FINDING. *** It was reported as TIMEOUT, and a timeout is not a
    // failure -- but it is not a pass either, and here it was hiding a REAL RED for as long as the budget killed
    // it. A gate that cannot finish cannot tell you it is broken. The failure is not fixed here; it is now
    // VISIBLE, which is the prerequisite.
    "tools/roundhouse/census-selfcheck.mjs":         761728,
    // v3917 -- measured at 534s on the run that first made it pass: 66 declared mode plants, two builds each.
    "tools/roundhouse/plantDirection-selfcheck.mjs": 839022,
    // v3924 -- twoFBind was NEVER TIMED AND NEVER BUDGETED, so it silently took the 139.9s general default while
    // taking 249s. It passes when nothing is watching a clock and is killed by the ritual and the rig alike. It
    // is absent from gate-timings.json for the reason that matters: A GATE THAT COULD NOT FINISH LEAVES NO ENTRY,
    // so the record cannot contain the gates it most needs to describe.
    "tools/roundhouse/twoFBind-selfcheck.mjs":       506311,
    // v3924 -- measured to completion at 195s, and it PASSES. Another gate that was never timed, never budgeted,
    // and silently killed at 139.9s by every runner.
    "physics/sph/packingTransfer-selfcheck.mjs":     252000,
    // *** v3924 -- AND THIS ONE IS WHY SLOWEST_GENERAL IS STILL 46.6s. *** Timing the never-timed 55 put
    // materialKnobs at 131.9s into the GENERAL population, and gateBudget-selfcheck immediately said so: the
    // recorded slowest general gate was no longer the slowest anybody had seen. The lever that check invites is
    // to re-pin SLOWEST_GENERAL, which would take the default from 139.9s to 396s FOR EVERY GATE IN THE TREE --
    // six minutes granted to gates that finish in forty milliseconds, and every future regression hidden under
    // it. OF THE 24 NEWLY-TIMED GATES ONLY THIS ONE IS OVER 46.6s; THE NEXT IS 23s. It is the slow tail, not the
    // population, and the tail is what MEASURED is for. Measured to completion, and it PASSES.
    "physics/sph/materialKnobs-selfcheck.mjs":       179037,
    // configContract PASSES at 78s here, against 74400 in the timings -- two independent runs agreeing within a
    // few seconds. IT NEVER NEEDED A BIGGER BUDGET AT ALL: 78s fits inside the 143s default with room, so its
    // TIMEOUT on the rig was not this gate being slow. Recorded anyway because it was over the general line, and
    // the larger of the two readings is used -- a budget derived from the faster of two measurements is a budget
    // that fails on the slower one.
    "tools/roundhouse/configContract-selfcheck.mjs":  78000,
    // *** MEASURED AT v3904 BECAUSE A NEW CHECK TIMED OUT AND THE GATE TURNED OUT TO HAVE BEEN DYING ALL ALONG.
    // 1058s stopwatch-timed on an otherwise idle box, and IT PASSES -- all checks. A contended run earlier the
    // same hour gave 1085s; the SMALLER, cleaner number is recorded here and the larger one is written down
    // rather than averaged in. This gate was never in this table, so it ran against the 143s default, so it was
    // being KILLED IN EVERY FULL SUITE at a seventh of the time it needs. *** A TIMEOUT IS NOT A FAILURE AND IT
    // IS NOT A PASS EITHER -- IT IS THE GATE NEVER HAVING RUN, and gate-timings.json proves this one never has:
    // 1049 timed entries in the shipped record and levelClaim-selfcheck is in NONE of them. Not slow in the
    // record -- ABSENT FROM IT, which is what being killed looks like from the outside and is why no amount of
    // reading the timings would ever have surfaced it. I found it by adding a check and blaming the check, then
    // did the honest thing and ran the PRISTINE file: 1085s, before any edit of mine. The reportLines check
    // added at v3904 costs nothing measurable against an 18-minute fixture -- which is exactly why its live arm
    // is not driven, and why the two numbers here differ by 27s of contention rather than by anything I wrote.
    "physics/sph/levelClaim-selfcheck.mjs":         1058000,
    // *** MEASURED AT v3213 AND MOVED HERE FROM UNRESOLVED, WHICH IS WHAT THAT TABLE SAID SHOULD HAPPEN. ***
    // 573s on an idle box, and it PASSES. Its own header said ~90s. The antidote fired on its own round: the
    // line below in UNRESOLVED was DELETED, not edited in place.
    "tools/roundhouse/khMichalke-selfcheck.mjs":     670254,
    // *** MEASURED LESS PRECISELY THAN THE REST, AND SAYING SO IS THE POINT. *** It PASSES, but the run that
    // proved it was not stopwatch-timed: the start is known to the second (17:08:26) and the finish only to the
    // minute from the log's mtime, so this is ~690s +/- 30s rather than a figure like khMichalke's 572948.
    // A MEASUREMENT WITH A COARSER METHOD IS STILL A MEASUREMENT, but it is not the same KIND of number and
    // rounding it into the column beside the others would hide that. The 2x headroom swallows the uncertainty.
    "tools/roundhouse/khGrowthKey-selfcheck.mjs":    690000,
    // MEASURED AT v3214, stopwatch-timed: 527s, and it PASSES. Header said ~90s.
    // *** THREE OF THE FOUR "UNRESOLVED" GATES HAVE NOW BEEN MEASURED AND ALL THREE PASS. They were never
    // broken; they were being killed at 60s. The Kelvin-Helmholtz cluster is one fixture cost, not three bugs.
    "tools/roundhouse/khConvergence-selfcheck.mjs":  527111,
    // *** MEASURED 94.3s ON THIS TREE, AND IT TIMED OUT PAST 300s ON PRISTINE v3210 -- A THREE-FOLD
    // DISCREPANCY I AM RECORDING RATHER THAN AVERAGING AWAY. *** Two plausible causes and I have not separated
    // them: the lab-results baseline was re-frozen at v3211/v3212 (a re-freeze does less work than a full
    // comparison against a stale one), and the earlier run shared a box with other measurements. IT RE-RUNS
    // EVERY DEVICE AT EVERY MODE, so it grows with the lab and will outrun any number written down; the 2x
    // headroom on the SMALLER measurement is deliberately the conservative choice, because being killed is a
    // visible failure and a budget nobody notices is not.
    // *** v3941 -- WATCHED TO THE END ON ANOTHER BOX: 1033s, AND IT EXITS 1 WITH FIVE FAILURES NOBODY HAS SEEN. ***
    //
    // The entry above predicted this in as many words -- "it grows with the lab and will outrun any number
    // written down" -- and it has. 94282ms against 1033s is ELEVEN TIMES, so the 2x headroom is nowhere near,
    // and Keith's rig kills it at 189s every run. THE NUMBER IS NOT UPDATED HERE: that box is not this table's
    // box (measured against MEASURED it runs 0.34x to 0.94x depending on the gate, so it is not a proxy), and a
    // stopwatch from somewhere else is the exact defect hostScale.mjs exists to name. It wants re-timing where
    // the table lives.
    //
    // WHAT THE OVERRUN ACTUALLY COST IS NOT TIME, IT IS THE VERDICT -- the same sentence the entry below this
    // one records for reportingTools: "THE COST OF THE MISSING ENTRY WAS NOT SLOWNESS, IT WAS SILENCE." Run to
    // completion, this gate reports FIVE failures, every one of them the frozen lab-results baseline being
    // stale rather than anything broken:
    //   - figureeight/period energyDriftFrac and angMomDrift moved off their -1 sentinels to 8.6e-16 and 1.3e-15
    //   - five observables APPEARED: ct.absoluteGain, ct.absoluteOffset, windtunnel.solidFx, windtunnel.appliedFx,
    //     eccentric.inspiralTime
    //   - THE DEVICE ROSTER GREW BY 33 AND LOST NONE: adjoint, fft, thermostat, cfl, entropy, voxelize,
    //     stability, the eighteen mpm* devices, nbench, hands, flip2d, freesurface, flip3d, kerrladder,
    //     induction, multigrid3d, multigridgpu, melt, freeze, vaporize, crystallize
    //
    // So a budget five times too small did not merely hide a runtime -- IT HID THE GATE'S WHOLE ANSWER, and the
    // lab has grown by a third of its device count with the record that tracks it unable to say so. The gate's
    // own message names the fix (re-freeze with SWEK_FREEZE_LAB_RESULTS=1) and it is NOT run here: a re-freeze
    // writes this box's numbers into that baseline, which is the same borrowed-stopwatch mistake one level up,
    // and it is a one-way edit to a record. It belongs on the box that owns the table.
    "tools/roundhouse/labResults-selfcheck.mjs":      94282,
    // *** MEASURED AT v3853, STOPWATCH-TIMED ON AN IDLE BOX: 555s, AND IT PASSES. Its own header said
    // "~25s -- MEASURED". *** It spawns every row of reportingTools' REPORTING registry, so it grows
    // with the registry and the 25s was true of a much smaller one. THE COST OF THE MISSING ENTRY WAS
    // NOT SLOWNESS, IT WAS SILENCE: at 143s (the general default) the suite killed it, A TIMEOUT IS NOT
    // A FAILURE and NEVER RUN IS DISTINCT FROM PASS -- so the two real failures it was carrying went
    // unreported for as long as it has been over budget. This is the fourth gate the v3212 table has
    // caught being killed rather than broken.
    //
    // AND THE MEASUREMENT IS OF THE FIXED GATE, WHICH IS THE SMALLER NUMBER: v3853 also stopped section
    // 1 running every tool twice (562s with one run still red, 555s green), so this is not a budget
    // raised to fit a gate that was never trimmed.
    //
    // *** v4098 -- RE-PINNED: 555s -> 1302s, AND THE CAUSE IS THE SAME SHAPE AGAIN, ONE TOOL DEEP. ***
    // tools/roundhouse/knobLiveness.mjs sweeps the whole device registry with a 20s-per-device budget by
    // default, and the registry has grown to 129 devices. MEASURED TO COMPLETION, stopwatch, alone: 744s
    // (12m24s), exit 0, real output the whole way -- so it is not broken, it is registry-scaled, the same
    // finding gateBudget.mjs already carries for corroborationCensus/plantedCoverage/responseCensus/
    // libmSensitivity, just discovered on a TOOL this gate SPAWNS rather than on a `-selfcheck.mjs` gate
    // in this table. Given a matching per-tool cap override (toolFrontDoor-selfcheck.mjs's own
    // TOOL_CAP_OVERRIDE, 1500000ms -- roughly 2x the 744s measurement, this table's own MEASURED
    // convention), the WHOLE GATE now measures 1302s (21m42s) stopwatch, exit 0, all pass -- up from 555s
    // because it previously never waited long enough for knobLiveness to answer at all.
    "tools/ship/toolFrontDoor-selfcheck.mjs":        1450142,

    // ================================================================================================================
    // *** v3939 -- THE ROUNDHOUSE CENSUS CLUSTER, AND IT IS ONE DEVICE RATHER THAN FIVE GATES. ***
    // ================================================================================================================
    //
    // Keith ran the gate list from the rig and five of these reported TIMEOUT at the 180s budget. They are not
    // five problems, and the cause is not "108 devices, linearly slower". MEASURED, one default build per
    // device across the whole registry:
    //
    //     108 devices, 275.3s total     twof alone 195.7s     -- 71% OF EVERY CENSUS'S COST, ONE DEVICE
    //
    // twof's default mode runs a 12,000-step lattice (runTwoF steps: 12000). Every census builds every device
    // at its default, so all of them pay it. *** 195.7s ALONE EXCEEDS BOTH THE 143s LOCAL DEFAULT AND THE 180s
    // RIG BUDGET, so no gate that builds the whole registry can pass at any plausible budget. *** Cutting that
    // default would move a PHYSICS VERDICT -- inletDriftFrac at 500 steps is a transient where at 12,000 it is
    // converged -- and a round must not move a verdict it is not about, so the cost is accepted and measured
    // here instead. Keith has the number and the choice.
    //
    // MEASURED ON THIS BOX, wall-clock, each run to completion:
    "tools/roundhouse/configContract-selfcheck.mjs":  72509,
    "tools/roundhouse/compose-selfcheck.mjs":         109896,
    // *** v4136 -- WHERE THIS 278s ACTUALLY GOES, because "either a longer budget or a smaller fixture" is a
    // choice nobody could make without it. Keith's rig TIMED OUT at 557s (this entry x2) with the progress log
    // ending on "80/129 (last: twof)". Timed per device on this box: 250.9s total, and TWOF ALONE IS 178.1s --
    // 71% of the whole gate. kh is 20.6s, stability 16.4s; the top five are 90.4% and the remaining 124
    // devices share under 10% between them. So this is not a gate that grew evenly and it is not a slow host:
    // it is ONE DEVICE, and any budget conversation that does not start there is arithmetic about noise.
    //
    // NOT ACTED ON HERE, and that is deliberate. Shrinking twof's fixture inside assumptionMap would change
    // what gets classified, and the classification IS the verdict this gate exists to produce -- a round must
    // not move a verdict it is not about (this table's own rule, stated at the configContract entry above).
    // The measurement is recorded so the choice is informed; the choice is Keith's.
    "tools/roundhouse/assumptionMap-selfcheck.mjs":  333639,
    "tools/roundhouse/census-selfcheck.mjs":         761728,
    // *** NOT GIVEN A BUDGET, AND SAYING SO IS THE POINT: corroborationCensus ran past 1500s and was KILLED
    // rather than finishing, so there is no completion time to double. An entry here would be a guess wearing a
    // measurement's clothes -- the one thing this table exists to refuse. It keeps the default budget and stays
    // on the timeout list until somebody lets it finish and records what it actually costs. ***
    //
    // curriculum-selfcheck is deliberately absent too, for the opposite reason: it completes in 349ms. It timed
    // out on the rig against a tree where it did not, which is a rig question and not a budget one.

    // *** v3939 -- twoF-selfcheck JOINS THE TAIL, AND THE CHOICE BETWEEN THE TWO REMEDIES IS THE POINT. ***
    // gateBudget-selfcheck went red because the general population's observed worst is twoF-selfcheck at 92.8s
    // against a SLOWEST_GENERAL of 46.6s, and its message says to RAISE SLOWEST_GENERAL from the new reading.
    // *** THIS FILE'S OWN HEADER REFUSES THAT, in the paragraph beside the constant: "TWO POPULATIONS, TWO
    // BUDGETS -- the fix is to put the tail gates in the tail, not to widen the budget for gates that never
    // needed it." *** Two instructions in one file pointing opposite ways, and the header is the one with the
    // argument: raising the constant to 92.8s would triple the DEFAULT for all ~1100 gates to 278s and turn a
    // genuinely hung gate into a five-minute stall, which is the cost that paragraph exists to refuse.
    //
    // twoF is the same 12,000-step lattice that makes the census cluster expensive -- so it belongs beside
    // twoFBind-selfcheck (already here at 256s) rather than setting the pace for a thousand gates that finish
    // in milliseconds. MEASURED 92.8s, and it PASSES; it was never broken, only mis-populated.
    "tools/roundhouse/twoF-selfcheck.mjs":            177771,
    // *** v4060 -- claimTrace MOVES OUT OF UNRESOLVED, WHICH TOLD ME EXACTLY WHAT TO DO NEXT AND NAMED IT
    // BEFORE I DID IT: "THE NEXT STEP IS A SMALLER FIXTURE OR A PROFILE, NOT A BIGGER NUMBER." *** The v3913
    // note only knew a lower bound (>=1800000ms, no output, on an idle box) and refused to guess whether that
    // was a slow gate or a hung one. Profiled instead of re-guessed: instrumented claimTrace's own per-device
    // build loop and found ONE outlier accounts for 378,605ms of the total -- twof (twoFDevice, the LBM
    // two-frequency shedding device), building 3 modes at roughly 126s each. kh (55.2s) and stability (49.4s)
    // are the next two, and the other 36 traced devices total under 75s COMBINED. This is not a claimTrace
    // inefficiency to fix: twoFBind-selfcheck and twoF-selfcheck (both above, 249s and 92.8s) already carry the
    // identical build cost independently -- twof is a genuinely slow physics device by its own three separate
    // gates' agreement, not a defect claimTrace introduced.
    //
    // *** SO IT IS MEASURED, NOT SHRUNK, EXACTLY AS THE THREE KELVIN-HELMHOLTZ GATES WERE AT v3214: *** "THREE
    // OF THE FOUR GATES THAT READ AS TIMEOUT ... TURNED OUT TO BE FINE ONCE ALLOWED TO RUN." Given room,
    // claimTrace-selfcheck completes reliably: two full runs, stopwatch-timed end to end (the whole selfcheck
    // file, not just the imported function), at 551021ms and 555728ms. The higher of the two is recorded here,
    // matching the tree's own convention (valueMatch above records the worst of three runs, not an average).
    // IT WILL STAY SLOW: the cost is 39 devices' worth of real physics builds and shrinks only if a future round
    // narrows claimTrace's own scope (fewer devices per run) or twof's own build cost drops -- this number is a
    // measurement of today's lab, not a promise about tomorrow's.
    "tools/roundhouse/claimTrace-selfcheck.mjs":     604654,
    // *** v4090 -- stability MOVES OUT OF UNRESOLVED, WHERE IT HAD SAT SINCE v3924 AS "exceeded a 150s cap;
    // never timed before that". *** It was never a hung gate and never a broken one: measured to completion
    // TWICE, all checks passing both times, and the only reason it read as a timeout is that the ~139.9s general
    // default kills it about 40% of the way in. That is precisely the population this table exists for, and the
    // v3924 note beside it named the correct traffic in advance ("packingTransfer was, and moved out of this
    // list to MEASURED at 195s on the same round, which is what that traffic should look like").
    //
    // TWO RUNS, AND THE DIFFERENCE BETWEEN THEM IS RECORDED RATHER THAN AVERAGED AWAY: 235489ms run ALONE on an
    // otherwise idle box, and 260224ms on a run that OVERLAPPED another gate. The higher figure is the one
    // written here, matching this file's own convention two entries up (claimTrace: "The higher of the two is
    // recorded here", and valueMatch records the worst of three) -- for a BUDGET the observed worst is the
    // conservative choice, and a budget set from the fastest clean run is one that kills the gate the first time
    // the box is busy. *** THE CONTENTION IS NAMED BECAUSE THIS TREE HAS PAID FOR NOT NAMING IT: v4039 recorded
    // a kuramoto build reading 1064s inside a contended sweep against 19.4s in isolation, a 55x error that came
    // from nothing but a second measurement racing the first. *** 260224 is therefore a real upper reading and
    // not a clean-room runtime; the clean-room figure is 235489 and both are here so the next reader can tell
    // which question they are answering.
    //
    // *** v4099 -- RE-PINNED: 260224 -> 405628, GROWTH FROM A SECTION THAT DID NOT EXIST WHEN 260224 WAS
    // MEASURED. *** Keith's rig reported this gate TIMING OUT at a 182s budget; reproduced here, but not as a
    // hang -- REPRODUCED AS GENUINE GROWTH. A first attempt killed it at a hard 400s wall mid-section-7b with
    // every check up to that point PASSING, so re-run to completion at a 1200s budget: 405628ms, exit 0, all
    // checks pass. Section 7b (its own header: "ADDED BY A SECOND SURFACE THAT BUILT THIS SAME ROUND IN THE
    // SAME SANDBOX") adds a THIRD refinement axis on top of the ones this entry's 260224ms already accounted
    // for -- viscosityThreshold bisected at T=4 as well as T=1, a 4x-longer-horizon simulation the earlier
    // measurement never ran. Not broken, not hung: the gate grew a real section and the number describing it
    // had not been asked since.
    "physics/sph/stability-selfcheck.mjs":           405628,
};

export const TAIL_HEADROOM = 2;

/**
 * *** THE ONES THAT DID NOT FINISH, AND THEY GET NO BUDGET AT ALL. ***
 *
 * These four ran past a 300s ceiling on an idle box and never returned a verdict. I DO NOT KNOW HOW LONG THEY
 * NEED, so writing a number for them would be inventing a measurement -- the same fabrication this project
 * refuses when a claim's config is unknown. They stay on the default and TIME OUT LOUDLY, which is the correct
 * outcome for work nobody has characterised.
 *
 * *** WHEN ONE OF THESE IS MEASURED TO COMPLETION, IT MOVES INTO MEASURED ABOVE AND ITS LINE HERE IS DELETED,
 * NOT EDITED IN PLACE. *** Naming the correct response in advance is the only thing that has reliably stopped a
 * threshold being loosened in this tree.
 */
export const UNRESOLVED = {
    // *** v3924 -- TEN GATES THAT EXCEEDED A 150s CAP AND HAVE NOT YET BEEN MEASURED TO COMPLETION. ***
    //
    // They were found by timing the 55 gates that had NEITHER a recorded time NOR a MEASURED budget -- a
    // population that existed because gate-timings.json CANNOT CONTAIN A GATE THAT DID NOT FINISH. Asked which
    // gates run over the default with no budget, the record answered ZERO, and that zero was a property of the
    // file. twoFBind is 249s and appears nowhere in it.
    //
    // The cap was 150s, just above the 139.9s general default, because that is all it takes to answer "does it
    // fit". IT IS NOT A RUNTIME. A LOWER BOUND IS NOT A MEASUREMENT -- the rule this table was created for --
    // so none of these gets a number in MEASURED until it has been watched to the end. packingTransfer was, and
    // moved out of this list to MEASURED at 195s on the same round, which is what that traffic should look like.
    // v4090 -- stability's line WAS HERE and is DELETED rather than edited, exactly as the paragraph above this
    // table instructs. It is measured to completion in MEASURED now (260224ms, all checks passing, two runs).
    "tools/roundhouse/libmSensitivity-selfcheck.mjs":
        "exceeded a 150s cap at v3924; never timed before that. RE-ATTEMPTED with a 2400s (40 minute) budget " +
        "on a device registry that has since grown to 129 devices (up from whatever count v3924 measured " +
        "against) and STILL DID NOT COMPLETE -- 2400s is now a measured LOWER BOUND, not a runtime. Its own " +
        "cost model explains why: three builds per device/mode (base, a determinism control, and the " +
        "perturbed rebuild), which is the same registry-scaling shape as corroborationCensus, plantedCoverage " +
        "and responseCensus below. Still not measured to completion",
    "tools/roundhouse/plantedCoverage-selfcheck.mjs":
        "exceeded a 150s cap at v3924. It builds two arms of every declared plant across the whole registry, so its cost tracks the plant census rather than any fixture of its own",
    "tools/roundhouse/responseCensus-selfcheck.mjs":
        "exceeded a 150s cap at v3924. Another registry-wide census; cost grows with the device count",

    // *** v3941 -- A DIFFERENT REASON FOR THE SAME ANSWER: THESE TWO CANNOT BE MEASURED HERE AT ALL. ***
    // Everything above overran a cap. These two SKIP, for want of a rasteriser this box cannot supply, and
    // until v3941 they were carrying their SKIP TIMES in gate-timings.json as though those were runtimes --
    // 55ms and 56ms, which is how long it takes each of them to say "I did not run". selfchecks now excludes a
    // skipped run from the record, and the two false entries were removed rather than replaced with a guess.
    // A LOWER BOUND IS NOT A MEASUREMENT and neither is a skip; an absent entry and a skip time are different
    // claims, and only one of them is true. They move to MEASURED when a box with a rasteriser runs them.
    "render/holoPicture-selfcheck.mjs":
        "skips without a rasteriser, so this box has never run it to completion. Its former 55ms entry was the SKIP time, removed at v3941",
    "render/holoAgree-selfcheck.mjs":
        "skips without a rasteriser, so this box has never run it to completion. Its former 56ms entry was the SKIP time, removed at v3941",
};

/**
 * *** THE CEILING IS DERIVED, BECAUSE THE ONE I TYPED LAST ROUND WENT FALSE IN A SINGLE ROUND. ***
 *
 * v3212 clamped the bridge at 900s and justified it as "above the largest budget the table can currently
 * produce (560s)". Then khMichalke was measured at 573s, whose x2 budget is 1146s -- ABOVE THE CEILING MEANT TO
 * SIT ABOVE IT. A number that was true when written and is checked by nothing is exactly the defect the last two
 * rounds have been about, committed in the sentence that described the defect.
 *
 * So the ceiling is now COMPUTED from the table with room to grow, and gateBudget-selfcheck asserts the
 * relationship rather than the number.
 */
export function maxBudgetMs() {
    const biggest = Math.max(DEFAULT_BUDGET_MS, ...Object.values(MEASURED).map((m) => m * TAIL_HEADROOM));
    return Math.ceil(biggest * 1.5 / 60000) * 60000;   // 1.5x the largest, rounded up to a whole minute
}

/** The budget for one gate: its measured allowance if it has one, otherwise the derived default. */
export function budgetFor(rel) {
    const key = String(rel).replace(/\\/g, "/");
    const m = MEASURED[key];
    return m ? m * TAIL_HEADROOM : DEFAULT_BUDGET_MS;
}

/** Why a gate has the budget it has -- so a report can say "measured" rather than leaving a number unexplained. */
export function budgetReason(rel) {
    const key = String(rel).replace(/\\/g, "/");
    if (MEASURED[key]) return "measured " + (MEASURED[key] / 1000).toFixed(1) + "s, x" + TAIL_HEADROOM;
    if (UNRESOLVED[key]) return "UNRESOLVED (no measurement) -- on the default deliberately";
    return "default " + (DEFAULT_BUDGET_MS / 1000).toFixed(0) + "s (" + HEADROOM + "x the slowest general gate)";
}
