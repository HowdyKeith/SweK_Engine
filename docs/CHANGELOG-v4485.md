## v4485 -- THE PINCH THRESHOLD SCALES WITH THE HAND NOW, WHICH IS THE CHANGE v3850 MEASURED AND REFUSED TO MAKE ON ITS OWN

v3850 found it and declined to fix it, on the rule that A ROUND MUST NOT MOVE A VERDICT IT IS NOT ABOUT (v3679):
`pinch.active` compared a distance against an ABSOLUTE constant, so it had a critical scale, and that scale is
the user's distance from the camera. It recorded the numbers instead. *** KEITH CALLED IT, SO THIS ROUND MAKES
THE CHANGE -- AND THE ONLY REASON THE CALL WAS DECIDABLE IS THAT v3850 HAD ALREADY MEASURED WHAT IT WOULD COST. ***

### THE FIX

    limit = pinchSpanFraction * dist(WRIST, MIDDLE_MCP)        default fraction 0.375

`folded` was always safe because it is a RATIO test -- a uniform scale multiplies both compared distances and
the verdict stands. pinch is one now too.

### THE SPAN IS THE LOAD-BEARING CHOICE, AND POSE-STABILITY IS WHY -- NOT PROPORTIONALITY

Any hand-sized distance scales correctly. Almost none of them are safe. MEASURED across the four fixture poses:

        wrist -> MIDDLE_MCP    0.160200  0.160200  0.160200  0.160200     <- RIGID, this is the palm
        wrist -> MIDDLE_TIP    0.278115  0.131352  0.131352  0.278115     <- COLLAPSES ON A CURL

*** A SPAN THAT SHORTENS WHEN YOU CLOSE YOUR HAND WOULD MAKE THE PINCH THRESHOLD DEPEND ON THE OTHER FINGERS,
SO A FIST WOULD MOVE ITS OWN PINCH BOUNDARY. *** That is circular, and wrist-to-fingertip is the first "hand
size" anyone reaches for. The palm also EXCLUDES THE THUMB -- one of the two points being measured -- because a
reference that moves with the gesture under test is measuring itself.

The span goes through `dist()` like every other distance in the function, so the declared defect knobs
(`flatDistance`, `manhattan`) reach it too rather than it being a privileged second metric.

### 0.375 IS DERIVED, NOT PICKED, AND THAT IS WHAT MAKES THIS A GENERALIZATION RATHER THAN A RETUNE

    0.375 * 0.160200 = 0.060075   against the shipped 0.06   -- A 0.125% DIFFERENCE

Every fixture pose classifies EXACTLY as it did before at nominal size, and now also at every other distance.
Read anatomically it is a ~3.75cm thumb-index gap on a ~10cm palm. The gate asserts this continuity, so IF THE
FRACTION IS EVER RETUNED THAT CHECK GOES RED -- a different decision from the one this round made, and one that
should have to be made deliberately.

*** AND THE REASON THE SPAN IS THE PALM AND NOT THE KNUCKLE ROW IS A FIXTURE DEFECT DECIDING A SHIPPED
CONSTANT, WHICH HAS TO BE SAID OUT LOUD. ***

        fixture palm : index   = 1.483     adult hand ~10.0cm : ~7.2cm = 1.389   <- CLOSE, licenses the number
        fixture knuckle : palm = 0.493     adult hand ~8.0cm : ~10.0cm = 0.800   <- THE FIXTURE PALM IS TOO NARROW

A fraction calibrated on the knuckle span (0.7595) would have baked that fixture error into a shipped default.

### MEASURED -- 12 scales x 4 poses spanning 0.25x to 4x

        pinchScaleDisagreements     9 / 48   ->   0 / 48        absolute -> relative
        flips at the derived s*     4 / 4    ->   0 / 4
        pinch.ratio (distance in PALMS) drifts 2.8e-15 across the whole sweep
        rigid invariance                                        STILL 0 / 256

That last line is the one that could have gone wrong and did not: the new predicate is a ratio of TWO
distances, and a rigid motion preserves both, so it stays exactly invariant.

### THE SWEEP WAS GRADING ITS OWN RANGE, AND THAT IS THIS ROUND'S SECOND CORRECTION

The first run of `absolutethreshold` separated by only 2 of 32 and read like a weak defect. IT WAS A SWEEP THAT
STOPPED BEFORE THE DEFECT HAPPENED. The four critical scales are 0.4085 (open), 0.4085 (point), 0.6291 (fist)
and 3.4188 (pinch), and the inherited sweep ran 0.5..3 -- so only the FIST's fell inside it. Widened to 0.25..4
it brackets all four and separates 9 of 48. *** A DEFECT MEASURED OUTSIDE THE RANGE WHERE IT OCCURS IS MEASURED
AS ABSENT ***, and the give-away was that the number was small for no stated reason.

### WHAT ELSE MOVED, AND WHY IT IS REPORTED RATHER THAN QUIETLY ABSORBED

  * *** THE flatdistance PLANT WENT 20 -> 21. *** It flattens EVERY distance, and since this round that includes
    the palm span the pinch limit is built from -- so the pinch bit joins the fold bits in what it can disturb
    (the extra count is one more rotation of the fist). THE SHAPE OF THE CENSUS IS UNCHANGED: still exactly one
    transform family sees it, in-plane roll still blind, translation still blind. A FIX THAT ADDS A DISTANCE
    ADDS IT TO THE PLANT'S REACH TOO, and that is worth knowing rather than smoothing over.
  * THE OTHER THREE PLANTS ARE UNTOUCHED, verified: fixedanchor 24 rigid / 24 translation / 8 boundary,
    manhattan 16 boundary, mirrorhalf mirrorMaxDelta 0.127. This round did not move anyone else's negative.
  * THE SCALE MODE'S CLAIM MOVED from `foldScaleDisagreements` to `pinchScaleDisagreements`. The fold number has
    been 0 since the fold test was written and would go on being 0 whatever happened to pinch, so claiming on it
    made the mode's headline THE HALF THAT WAS NEVER IN DOUBT. Both are still asserted at 0 in the gate.
  * NEW MODE `absolutethreshold` (eighth), and it is A DIFFERENT ANIMAL FROM THE OTHER FOUR DEFECT MODES.
    flatdistance / fixedanchor / manhattan / mirrorhalf are TEMPTING EDITS NOBODY MADE -- hypotheticals planted
    to prove the keys can see them. This one is THE BEHAVIOUR THE TREE ACTUALLY SHIPPED until v4485, kept as a
    mode so the fix has a regression guard rather than a changelog entry. `flatdistance` stays the promoted
    plant: its blindness census is the stronger argument, and moving the promotion would shift this device's
    census entry for a reason unrelated to the census.
  * `pinch` gains `limit`, `span`, `ratio` and `relative` -- ADDITIVE, so no existing reader breaks. `ratio` is
    the scale-free quantity: pinchDist in palms, and `ratio < pinchSpanFraction` is exactly `active`.
  * `pinchRelative: false` restores the pre-v4485 comparison EXACTLY, so a caller who wants the old behaviour
    has it by name rather than by patching.

### THE DEGENERATE CASE, WHICH IS A GUARD AND NOT PADDING

A zero or non-finite palm span means the palm landmarks collapsed. Scaling by it would make the limit 0 and
NOTHING would ever read as pinched -- silently, and hardest exactly where tracking is already worst. It falls
back to the absolute threshold and SAYS SO in `pinch.relative`, which the gate checks.

### WHAT IS NOT CLAIMED

  * NOT that 0.375 is right for a REAL hand. It is right for the shipped verdict at nominal size, which is the
    only continuity checkable without a camera. *** CONFIRMING THE FRACTION AGAINST REAL MediaPipe LANDMARKS IS
    NOT DONE AND IS THE NAMED FOLLOW-UP *** -- a real palm span carries detector noise and foreshortens under
    perspective, and a synthetic rigid fixture has neither.
  * NOT that this removes every distance dependence. The span foreshortens when the palm turns edge-on to a real
    camera; the fixture cannot show that because it rotates in true 3D with z preserved.
  * NOT that the fixture is a real hand -- unchanged, and section 0 of the gate still checks the four poses
    classify as the gestures they are named for before anything is measured on them.

### GATE STATE

  * handsBind-selfcheck: 39 checks, all pass, exit 0 (32 before this round).
  * registry 129 devices; `hands` now eight modes; knobGate.checkMode accepts `absolutethreshold` and refuses an
    undeclared mode; probeModePlant ok, rigidDisagreements 0 -> 21.
  * deviceModes-selfcheck: all checks pass, `hands` still guarded and not in the UNGUARDED list.
  * gestureVfx-selfcheck: all checks pass -- ui/gestureVfx.js reads `hands[0].pinch.active` and the added fields
    are additive, so its triggers are unmoved.
  * zeroRangeFull-selfcheck: ALL GREEN. It grades properties OF THE RECORDED SWEEP rather than re-running it, so
    the eighth mode does not invalidate it. NOTE FOR WHOEVER NEXT REGENERATES THAT RECORD: its `hands` entry
    reads `modes: 7, builds: 287` and is now stale by one mode. Named rather than silently left.
  * *** AND THAT NOTE WAS INCOMPLETE, WHICH THE VERIFY CAUGHT AND THIS ROUND DID NOT. *** A SECOND derived
    record went red on arrival: tools/roundhouse/zeroControl-selfcheck.mjs, whose coercion census this round's
    handsBind.mjs moved -- 17759 -> 17800 swept points, 5612 -> 5619 coerced, 1225 -> 1228 collapsed ranges.
    Repaired in a follow-up commit ("Repair the two reds main's v4485 brought with it"), which attributed it
    properly rather than raising the bar: with handsBind.mjs alone reverted the census re-derives to the old
    record EXACTLY, and the ratio it carries is unmoved at 31.6%.
    *** THE METHOD ERROR IS WORTH MORE THAN THE MISS. *** This round DID go looking for derived records a new
    mode would invalidate, found zeroRangeFull, and reported it -- by grepping the registers that mention
    `hands` BY NAME. zeroControl names nothing; it sweeps everything. A SEARCH FOR MY OWN DEVICE'S NAME IS THE
    WRONG INSTRUMENT FOR "WHAT RECORDS DOES A NEW MODE INVALIDATE", and it returns a confident, incomplete
    answer -- which is worse than returning nothing, because it was written up as though it were the whole set.
  * plantedCoverage-selfcheck: ALL CHECKS PASS, exit 0, RUN TO COMPLETION on the ported tree -- 935s against a
    stated budget of 143s, this box being slower. `hands` is among the 124 binds with a live planted error
    (floor 17). *** THIS BULLET WAS WRONG AS FIRST WRITTEN AND THE CORRECTION IS THE POINT OF SAYING SO: it
    read "RUN TO COMPLETION THIS TIME (484s) ... Verdict below" AND THERE WAS NO VERDICT BELOW. *** 484s was a
    DIFFERENT RUN ON A DIFFERENT TREE -- the stale v3849 build, where this gate FAILED 2 (pre-existing: the
    identical two failures reproduce on a pristine v3849 with nothing applied). Quoting a failing run's timing
    under the word "verdict" and then omitting the verdict is the shape this project keeps finding: reachable
    and findable are two different things, in prose. The number above is the run this round actually rests on.

### AND THE ONE IT DID REPEAT, ONE LAYER DOWN: THIS FILE WAS WRITTEN TO THE REPOSITORY ROOT

*** THE SAME STALENESS THAT NEARLY REVERTED v3852 AND v4027 ALSO PUT THIS FILE IN THE WRONG DIRECTORY. *** It
was written to the root because THAT IS WHERE THE v3849 EXTRACT KEEPS ITS CHANGELOGS -- and main had since moved
them to docs/, where its four siblings already lived. tools/ship/rootLayout-selfcheck.mjs requires every root
file to be justified by name, and docs/CHANGELOG.md's own opening paragraph states the rule this broke:
"history goes in docs/". Moved there by the same follow-up commit that repaired zeroControl.

THE PORT ONTO CURRENT main WAS DONE CAREFULLY FOR THE CODE AND NOT FOR THE CONVENTIONS AROUND IT. Re-deriving
the calibration on main's fixture was the right instinct applied to one file; where the changelog goes, and
which frozen records a new mode moves, are the same question about the rest of the tree, and neither was asked.

### THE HISTORY THIS ROUND ALMOST REPEATED, AND DID NOT

*** THE FIX WAS FIRST WRITTEN AGAINST v3849 AND WOULD HAVE REVERTED v3852 AND v4027. *** The work was done from
a v3849 build while main had moved to v4484, and the v3850 device had since gained three more negatives
(fixedanchor, manhattan, mirrorhalf) and grown from 435 lines to 532. Merging the v3849-based branch would have
DELETED THREE PLANTS SOMEBODY ELSE ADDED -- the fifth patch in this tree's history to erase a round, and the
same shape devices.mjs already carries a v3433 note about. It was caught by opening the pull request and
reading `mergeable_state: dirty` rather than by any check. THE PORT IS ONTO CURRENT main, and the calibration
was RE-DERIVED on main's fixture rather than carried over: palmSpan 0.160200, fraction 0.374532, all four poses
classifying identically -- the same numbers, confirmed rather than assumed.
