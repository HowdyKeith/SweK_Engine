## v3851 -- THE PINCH THRESHOLD SCALES WITH THE HAND NOW, WHICH IS THE CHANGE v3850 MEASURED AND REFUSED TO MAKE ON ITS OWN

v3850 found it and declined to fix it, on the rule that A ROUND MUST NOT MOVE A VERDICT IT IS NOT ABOUT (v3679):
`pinch.active` compared a distance against an ABSOLUTE constant, so it had a critical scale, and that scale is
the user's distance from the camera. It put the numbers to Keith. *** KEITH CALLED IT, SO THIS ROUND MAKES THE
CHANGE -- AND THE ONLY REASON THE CALL WAS DECIDABLE IS THAT v3850 HAD ALREADY MEASURED WHAT IT WOULD COST. ***

### THE FIX

    limit = pinchSpanFraction * dist(WRIST, MIDDLE_MCP)        default fraction 0.375

`folded` was always safe because it is a RATIO test -- a uniform scale multiplies both compared distances and
the verdict stands. pinch is one now too.

### THE SPAN IS THE LOAD-BEARING CHOICE, AND POSE-STABILITY IS WHY -- NOT PROPORTIONALITY

Any hand-sized distance scales correctly. Almost none of them are safe. MEASURED across the four fixture poses:

        wrist -> MIDDLE_MCP    0.160200  0.160200  0.160200  0.160200     <- RIGID, this is the palm
        INDEX_MCP -> PINKY_MCP 0.079000  0.079000  0.079000  0.079000     <- also rigid
        wrist -> MIDDLE_TIP    0.278115  0.131352  0.131352  0.278115     <- COLLAPSES ON A CURL

*** A SPAN THAT SHORTENS WHEN YOU CLOSE YOUR HAND WOULD MAKE THE PINCH THRESHOLD DEPEND ON THE OTHER FINGERS,
SO A FIST WOULD MOVE ITS OWN PINCH BOUNDARY. *** That is circular, and it is the obvious choice (wrist to
fingertip is the first "hand size" anyone reaches for). The palm also EXCLUDES THE THUMB -- one of the two
points being measured -- because a reference that moves with the gesture under test is measuring itself.

### 0.375 IS DERIVED, NOT PICKED, AND THAT IS WHAT MAKES THIS A GENERALIZATION RATHER THAN A RETUNE

    0.375 * 0.160200 = 0.060075   against the shipped 0.06   -- A 0.125% DIFFERENCE

Every fixture pose classifies EXACTLY as it did before at nominal size (open / fist / point not pinched, pinch
pinched), and now also at every other distance. Read anatomically it is a ~3.75cm thumb-index gap on a ~10cm
palm. The gate asserts this continuity, so IF THE FRACTION IS EVER RETUNED THAT CHECK GOES RED -- which is a
different decision from the one this round made, and should have to be made deliberately.

*** AND THE REASON THE SPAN IS THE PALM AND NOT THE KNUCKLE ROW IS A FIXTURE DEFECT DECIDING A SHIPPED
CONSTANT, WHICH HAS TO BE SAID OUT LOUD. *** Calibrating the fraction requires the fixture's proportions to be
anatomically honest wherever the calibration touches them:

        fixture palm : index  = 1.483     adult hand ~10.0cm : ~7.2cm = 1.389    <- CLOSE, licenses the number
        fixture knuckle : palm = 0.493    adult hand ~8.0cm : ~10.0cm = 0.800    <- THE FIXTURE PALM IS TOO NARROW

A fraction calibrated on the knuckle span (0.7595) would have baked that fixture error into a shipped default.

### MEASURED, THE FIX -- 12 scales x 4 poses spanning 0.25x to 4x

        pinchScaleDisagreements     9 / 48   ->   0 / 48        absolute -> relative
        flips at the derived s*     4 / 4    ->   0 / 4
        a FIST reading as a pinch, swept 0.20x..1.50x in 0.01 steps:   43 scales  ->  0
        pinch.ratio (the distance measured in PALMS) drifts 2.8e-15 across the whole sweep
        rigid invariance                                       STILL 0 / 256

That last line is the one that could have gone wrong and did not: the new predicate is a ratio of TWO
distances, and a rigid motion preserves both, so it stays exactly invariant.

### THE SWEEP WAS GRADING ITS OWN RANGE, AND THAT IS THIS ROUND'S SECOND CORRECTION

The first run of `absolutethreshold` separated by only 2 of 32 and read like a weak defect. IT WAS A SWEEP THAT
STOPPED BEFORE THE DEFECT HAPPENED. The four critical scales are 0.4085 (open), 0.4085 (point), 0.6291 (fist)
and 3.4188 (pinch), and v3850's sweep ran 0.5..3 -- so only the FIST's fell inside it. Widened to 0.25..4 it
brackets all four and separates 9 of 48. *** A DEFECT MEASURED OUTSIDE THE RANGE WHERE IT OCCURS IS MEASURED AS
ABSENT ***, and the give-away was that the number was small for no stated reason.

### WHAT ELSE MOVED, AND WHY IT IS REPORTED RATHER THAN QUIETLY ABSORBED

  * *** THE PLANT'S COUNT WENT 20 -> 21. *** `flatDistance` flattens EVERY distance, and since this round that
    includes the palm span the pinch limit is built from -- so the pinch bit joins the fold bits in what the
    plant can disturb (the extra count is one more rotation of the fist). THE SHAPE OF THE CENSUS IS UNCHANGED:
    still exactly one transform family sees it, in-plane roll still blind, translation still blind. A FIX THAT
    ADDS A DISTANCE ADDS IT TO THE PLANT'S REACH TOO, and that is worth knowing rather than smoothing over.
  * THE SCALE MODE'S CLAIM MOVED from `foldScaleDisagreements` to `pinchScaleDisagreements`. The fold number has
    been 0 since the fold test was written and would go on being 0 whatever happened to pinch, so claiming on it
    made the mode's headline THE HALF THAT WAS NEVER IN DOUBT. Both are still asserted at 0 in the gate.
  * NEW MODE `absolutethreshold` -- the pre-v3851 comparison, graded, so a REGRESSION OF THIS ROUND'S FIX would
    be caught rather than discovered. It is the device's SECOND defect mode; `flatdistance` stays the promoted
    plant because its blindness census is the stronger argument and leaving it promoted keeps this device's
    census entry from moving for a reason unrelated to the census. v3729's precedent: run the defects, promote
    one, MEASURE the others rather than mention them.
  * `pinch` gains `limit`, `span`, `ratio` and `relative` -- ADDITIVE, so no existing reader breaks. `ratio` is
    the scale-free quantity: pinchDist in palms, and `ratio < pinchSpanFraction` is exactly `active`.
  * `pinchRelative: false` restores the pre-v3851 comparison EXACTLY (verified against `distance < 0.06` on
    every swept pose), so a caller who wants the old behaviour has it by name rather than by patching.

### THE DEGENERATE CASE, WHICH IS A GUARD AND NOT PADDING

A zero or non-finite palm span means the palm landmarks collapsed. Dividing by it would make the limit 0 and
NOTHING would ever read as pinched -- silently, and hardest exactly where tracking is already worst. It falls
back to the absolute threshold and SAYS SO in `pinch.relative`, which the gate checks.

### WHAT IS NOT CLAIMED

  * NOT that 0.375 is right for a REAL hand. It is right for the shipped verdict at nominal size, which is the
    only continuity checkable without a camera. *** CONFIRMING THE FRACTION AGAINST REAL MediaPipe LANDMARKS IS
    NOT DONE AND IS THE NAMED FOLLOW-UP *** -- a real palm span carries detector noise and foreshortens under
    perspective, and a synthetic rigid fixture has neither.
  * NOT that this removes every distance dependence. The span foreshortens when the palm turns edge-on to a real
    camera; the fixture cannot show that because it rotates in true 3D with z preserved.
  * NOT that the fixture is a real hand -- unchanged from v3850, and section 0 of the gate still checks the four
    poses classify as the gestures they are named for before anything is measured on them.

### GATE STATE

  * handsBind-selfcheck: 25 checks, all pass, exit 0 (was 19 at v3850).
  * registry 108, `hands` resolves, modes now five; knobGate.checkMode accepts `absolutethreshold` and refuses
    an undeclared mode; probeModePlant ok, rigidDisagreements 0 -> 21.
  * deviceModes-selfcheck: all checks pass, `hands` still in the EXPORTED set and not the UNGUARDED list.
  * MediaPipeHandTracker still constructs and imports clean in node; defaults read flatDistance false,
    pinchRelative true, pinchSpanFraction 0.375.
  * UNCHANGED FROM v3850 AND STILL NOT THIS PATCH'S: capabilityCard-selfcheck 1 FAIL and detectionMap-selfcheck
    1 FAIL are PRE-EXISTING on pristine v3849 (verified by stashing). plantedCoverage-selfcheck still does not
    complete on this container against its own 143s budget; this device's five modes total well under a second.
    AN UNRUN GATE IS NOT A PASSING ONE -- run it on a normal rig.
