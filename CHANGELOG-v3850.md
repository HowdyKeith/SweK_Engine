## v3850 -- KEITH ASKED ABOUT INTEGRATING barehands, AND THE ANSWER WAS THAT THERE IS ALMOST NOTHING TO INTEGRATE AND A GREAT DEAL TO MEASURE

The question was what integrating https://github.com/jaredrhod/barehands would mean here. *** THE HONEST ANSWER
IS THAT AS CODE IT MEANS NOTHING, AND THAT FINDING OUT WHY IS THE ROUND. *** barehands is a Python stdlib server
plus a three.js viewer under AGPL-3.0, driving glass cards on a board with your hands. This engine is neither a
server nor a viewer, and vendoring one into a physics tree buys a dependency and a licence and NOT ONE MEASURED
NUMBER. Nothing here imports it, and nothing should.

*** WHAT IT ACTUALLY SUPPLIES IS A SPECIFICATION, AND THIS TREE ALREADY HAD THE THING THE SPECIFICATION WOULD
LAND ON. *** barehands' gesture vocabulary -- tap, pinch-drag, hold-while-carrying to rotate, two hands to
scale, a claw to force-pull -- is a list of things a hand must be able to MEAN. face/MediaPipeHandTracker.js has
shipped `computeHandMetrics` since round 310, marked in its own header "pure metric computation
(headless-testable)", and *** IT WAS NEVER ONCE TESTED. *** Three files import that module and not one of them
is a check: the module itself, a demo, and main.js. THE FILE SAID "HEADLESS-TESTABLE" FOR FORTY ROUNDS AND
NOBODY TESTED IT HEADLESSLY, which is the same shape as v3729's "a measurement made and discarded is not
coverage" -- an invitation nobody accepted is not coverage either.

So the integration is: TAKE barehands' VOCABULARY AS THE ANSWER KEY, and ask whether this tree's gesture layer
holds the invariances that vocabulary silently depends on.

*** AND THEY ARE NOT STYLE PREFERENCES, THEY ARE WHAT THE GESTURES MEAN. *** "Hold while carrying to rotate"
says turning your hand must not change WHICH gesture you are making. "Pinch-drag" says moving it across the
frame must not re-classify it. Each is an EXACT geometric identity -- rigid motions preserve distances -- so it
pins at zero rather than at a tolerance.

NEW: tools/roundhouse/handsBind.mjs, tools/roundhouse/handsBind-selfcheck.mjs. Device `hands` (108th), four
modes, sixteen observables. One line in devices.mjs, one knob in the module under grade.

### WHAT THE SHIPPED MODULE GETS RIGHT, MEASURED

Four poses (open, fist, point, pinch) x three rotation axes x sixteen angles, plus sixteen translations each:

        rotation      0 disagreements / 192 transformed poses
        translation   0 disagreements /  64 transformed poses

EXACTLY ZERO, NOT SMALL. Every classification bit -- fist, openPalm, pointing, the four folded flags, pinch --
survives every rigid motion. THE FOLD TEST EARNS THIS HONESTLY: it compares dist(wrist,tip) against
dist(wrist,pip), and a rigid motion preserves both, so the inequality cannot turn over. The module's own header
calls that "rotation-tolerant" IN A COMMENT. It is a graded claim now instead of an assertion.

### THE HONEST NEGATIVE, WHICH IS WORTH MORE THAN THE PASS

*** ONE FUNCTION CONTAINS A SCALE-INVARIANT CLASSIFIER AND A SCALE-DEPENDENT ONE, AND THE SCALE-DEPENDENT ONE IS
THE ONE barehands USES MOST. *** `folded` is a comparison of two distances, so a uniform scale multiplies both
and the verdict stands -- 0 disagreements over 32 (pose, scale) pairs from 0.5x to 3x. `pinch.active` is a
distance against an ABSOLUTE constant (pinchThreshold = 0.06 in normalized image units), so it has a critical
scale, and that scale is the user's distance from the camera.

pinch.distance is exactly homogeneous of degree 1 (worst departure from s*d(1): 2.1e-15, floating-point noise),
so the critical scale is DERIVABLE rather than fitted: s* = 0.06 / d(1). Each was verified to flip on either
side of its own s*, so the algebra is not just algebra:

        pose     d(1)        s* = 0.06/d(1)     what it means at the camera
        open     0.146877      0.4085           reads pinched below ~41% of fixture size
        point    0.146877      0.4085
        fist     0.095370      0.6291           *** A CLOSED FIST IS A FALSE PINCH WHEN FAR ENOUGH AWAY ***
        pinch    0.017550      3.4188           stops reading pinched above ~342%

SO "TAP" AND "PINCH-DRAG" HAVE A WORKING VOLUME AND NOTHING IN THE MODULE SAYS SO. Lean back far enough and a
fist crosses the pinch threshold on its own.

*** THIS IS REPORTED AND DELIBERATELY NOT FIXED. *** An absolute threshold on a normalized coordinate is a
legitimate design with an UNDOCUMENTED PRECONDITION, pinchThreshold is already a caller-visible option, and the
fix (scale it by a hand-span landmark distance) changes shipped gesture behaviour for every existing consumer.
A ROUND MUST NOT MOVE A VERDICT IT IS NOT ABOUT (v3679). It is measured so it can be DECIDED rather than
discovered by a user leaning back in their chair. KEITH'S CALL, with the numbers in hand.

### THE PLANT, AND THE CENSUS THAT IS THE REAL ARGUMENT FOR THE DEVICE

The defect: `_dist3D` DROPS ITS z TERM (`flatDistance`, declared in DEFAULT_OPTS, off by default). It is the
most tempting real edit to that file -- MediaPipe's z is by far its noisiest output, dropping it LOOKS LIKE
DENOISING, and every metric still returns a plausible number. Measured, each arm against ITS OWN untransformed
reference:

        transform family                  honest      planted     sees it?
        rotation about x (tilt)            0/64       12/64       YES
        rotation about y (turn)            0/64        8/64       YES
        rotation about z (in-plane roll)   0/64        0/64       *** BLIND BY CONSTRUCTION ***
        translation                        0/64        0/64       BLIND -- a shift changes no distance
        uniform scale (fold family)        0/32        0/32       BLIND -- both distances scale together
        mirror involution                  0           0          BLIND -- a reflection is an isometry in 2D too

*** FOUR OF THE FIVE TRANSFORM FAMILIES CANNOT SEE IT, AND THE BLIND ONE IS THE OBVIOUS ONE TO TEST WITH. *** A
2D metric is EXACTLY invariant under rotation in the image plane, so rolling your hand at the camera -- the
first thing anyone does to check a hand tracker, and the motion barehands' two-hand rotate is built on -- CANNOT
DETECT A MISSING THIRD DIMENSION no matter how long you do it. Only tilting toward or away from the camera can,
which is precisely the motion "hold while carrying to rotate in 3D" needs.

### THE THING THIS ROUND GOT WRONG FIRST, TWICE, AND BOTH CORRECTIONS ARE THE FINDING

*** (1) THE FIRST MEASUREMENT WAS COMPARING TWO DIFFERENT METRICS AND CALLING IT AN INVARIANCE BREAK. *** The
planted arm was referenced to the HONEST arm's untransformed pose, so it read 44/63 on the fist -- and that
number is a BASELINE OFFSET between two metrics, not a statement about invariance. What the vocabulary needs is
that MOVING THE HAND DOES NOT CHANGE THE VERDICT, which is one metric compared with itself. Corrected, it reads
20/256, and only then does the in-plane/out-of-plane split mean anything. A NUMBER THAT MOVED IS NOT YET A
MEASUREMENT OF THE THING THAT WAS SUPPOSED TO MOVE.

*** (2) THE POSE DEPENDENCE IS NOT ABOUT z EXTENT, WHICH IS THE EXPLANATION I REACHED FOR AND THE DATA REFUSED.
*** By pose, out-of-plane only: open 0/32, point 0/32, fist 19/32, pinch 1/32. The obvious reading is "an open
hand lies in the image plane so it has no z to lose" -- AND THE z-SPANS REFUTE IT: open 0.0300 but point 0.0980,
THE SAME AS THE FIST, and point does not fire at all. What separates them is MARGIN. In `point` the index is
fully extended and the other three fully curled, so every fold comparison sits far from its decision boundary
and a distorted distance cannot push it over. The fist holds its fingers NEAR the boundary. *** A DEFECT IS
VISIBLE WHERE A DECISION IS CLOSE, NOT WHERE THE ERROR IS LARGE *** -- and a census run only on committed poses
would have reported this device blind to its own plant.

### THE KNOB, AND v3845's LESSON APPLIED WITHOUT HAVING TO RELEARN IT

`_dist3D` branches on THE WHOLE CALL rather than on a zeroed dz. `Math.hypot(dx,dy,0)` and `Math.hypot(dx,dy)`
are different operations over different argument counts and are not obliged to agree in the last ulp; writing it
as `Math.hypot(dx, dy, flat ? 0 : dz)` would put the knob INSIDE the default's arithmetic. A KNOB THAT CHANGES
THE DEFAULT IS NOT A KNOB. VERIFIED rather than assumed: 204 transformed poses, default path against the
explicit-off path, max |pinch.distance| delta 0 and 0 classification bits differing.

And the validator LISTS the plant mode, so `flatdistance` cannot silently revert to `rigid` and fire at nothing
-- v3806's flip2d lesson, repeated at v3845 on flip3d, and cheaper to list than to notice.

### WHAT IS NOT CLAIMED

  * NOT that face/MediaPipeHandTracker.js is correct. The MediaPipe landmarker, the webcam lifecycle, the
    preview canvas and the whole start()/stop() path are UNGRADED and ungradeable without a camera. This device
    grades `computeHandMetrics` -- the one exported pure function, which is also the only part the three
    consuming files actually read. gradedCoverage moves by ONE MODULE and the honest reading of that is "this
    module now has a key", not "this module is verified".
  * NOT that the fixture is a real hand. It is a kinematic chain -- four fingers of three phalanges curled by a
    per-finger flexion angle, plus a thumb -- and section 0 of the gate checks the four poses classify as the
    gestures they are named for BEFORE anything is measured on them, because a fixture that has drifted off its
    poses grades nothing and goes quietly blind to the plant. THE KEYS DO NOT DEPEND ON IT BEING ANATOMICAL:
    rigid motions preserve distances for any point set. What the fixture buys is that the preserved
    classifications are MEANINGFUL rather than degenerate.
  * NOT that this reaches barehands. Nothing imports, vendors or executes it. It supplied the gesture contract
    and its AGPL-3.0 code and Python/three.js architecture stay on its own side.
  * NOT a second key from the two-hand spread. It is REPORTED (drift 5.6e-17 translating, 1.1e-16 rotating in
    plane) and not pinned at zero: unlike the classification bits it is a hypot over transformed coordinates and
    carries roundoff, so asserting it exact would be asserting that rotation arithmetic is closed in binary64.

### GATE STATE, MEASURED ON THIS PATCH

  * tools/roundhouse/handsBind-selfcheck.mjs -- 17 checks, all pass, exit 0. Auto-discovered by
    tools/ship/selfchecks.mjs (write `foo-selfcheck.mjs` anywhere and it is gated), so it needs no list entry.
  * registry resolves: 108 devices, `hands` -> hands-gesture-invariance, registryName stamped.
  * knobGate.checkMode REFUSES an undeclared mode on this device and ACCEPTS `flatdistance` -- the guard that
    three devices in this tree still cannot engage does engage here.
  * plantedCoverage.probeModePlant: ok true, rigidDisagreements 0 -> 20.
  * deviceModes-selfcheck: all checks pass; `hands` lands in the EXPORTED set, not the UNGUARDED list.

  * detectionMap-selfcheck: PASSES every structural check; its ONE failure ("every device that declares a plant
    has one that moves something") is PRE-EXISTING and cannot be this device's. Its candidate set is built by
    readsPlantedKnob, `readsPlantedKnob("handsBind")` is FALSE, and the candidate total is 38 BEFORE AND AFTER
    this patch -- `hands` is not in the population that check counts, so it cannot be the one dead plant in it.
  * *** PRE-EXISTING AND NOT THIS PATCH'S: capabilityCard-selfcheck FAILS 1 on the PRISTINE v3849 extract. ***
    Verified by stashing this patch and re-running -- identical failure, identical message ("the card publishes
    the DECLARED kind and no row is left guessing"). NOT FIXED HERE, and it is reported rather than quietly
    left: a gate already red before a round arrives is that round's to NAME, not to absorb.
  * A RELATED PRE-EXISTING BLINDNESS, NOTED BECAUSE IT LOOKS LIKE THIS PATCH'S BUG AND IS NOT: capabilityCard
    reports `plantDeclared: false` for `hands` -- AND FOR flip3d, hydrostatic, flip2d, mpmrefine AND gyroscope,
    i.e. for EVERY mode-shaped plant in the tree. Its column is fed by readsPlantedKnob, which greps the bind's
    code for the literal `planted`, so it counts KNOB plants only; mode plants are adjudicated by
    probeModePlant, which passes here. The card's 38 is a count of knob plants wearing the name of all of them.
    *** THAT IS A REAL GAP AND IT IS SOMEBODY'S ROUND, NOT THIS ONE'S: *** a tree that declares two plant shapes
    and counts one of them under a name that says "all" will keep reporting mode-planted devices as bare.
  * NOT RUN TO COMPLETION HERE, AND SAID PLAINLY RATHER THAN OMITTED: plantedCoverage-selfcheck. It exceeded
    600s and then 1800s on this container against the tree's OWN 143s budget for it -- and detectionMap, which
    carries the same 143s budget and the same 108-device sweep, also overran here. THE BOX IS SLOWER THAN THE
    ONE gateBudget WAS MEASURED ON; this is not evidence about the patch. What rules the patch out as a cause:
    all four of this device's modes together take 14ms (rigid 8.5, scale 1.3, mirror 0.2, flatdistance 3.6),
    and `hands` is not in that census's knob-plant population at all. VERIFY ON A NORMAL RIG BEFORE SHIPPING --
    an unrun gate is not a passing one (v3420: NEVER RUN IS DISTINCT FROM PASS, and also distinct from FAIL).
