// tools/roundhouse/handsBind.mjs
//
// v3850 -- THE GESTURE LAYER (face/MediaPipeHandTracker.js), GRADED. Opened by the barehands question:
// jaredrhod/barehands is a webcam hand-tracking board -- pinch-drag to move, hold-while-carrying to rotate,
// two hands to scale, a claw to force-pull -- and the question was what integrating it would mean here.
//
// *** IT MEANS ALMOST NOTHING AS CODE AND A GREAT DEAL AS AN ANSWER KEY, AND THAT IS THE ROUND. *** barehands
// is a Python stdlib server plus a three.js viewer under AGPL-3.0; this engine is neither, and vendoring a
// viewer into a physics tree buys a dependency and no measurement. What it actually supplies is A GESTURE
// CONTRACT -- a list of things a hand must be able to MEAN -- and this tree already had the layer that would
// have to carry it: computeHandMetrics, shipped at round 310 beside the face tracker, marked in its own header
// "pure metric computation (headless-testable)", and NEVER ONCE GRADED. Three files import that module and not
// one of them is a check. So the integration is: take barehands' vocabulary as the specification, and ask
// whether this tree's gesture layer holds the invariances that vocabulary silently depends on.
//
// *** THE INVARIANCES ARE NOT A STYLE PREFERENCE, THEY ARE WHAT THE GESTURES MEAN. *** "Hold while carrying to
// rotate" says: turning your hand must not change WHICH gesture you are making, only its orientation. "Pinch-
// drag" says: moving your hand across the frame must not re-classify it. If the classifier moves when the hand
// moves, the vocabulary is unusable, and every one of those statements is an EXACT geometric identity -- rigid
// motions preserve distances -- so it can be pinned at zero rather than to a tolerance.
//
// MEASURED, on the shipped module, four poses x (16 rotations about each of three axes + 16 translations):
//     rotation      0 disagreements / 192 poses
//     translation   0 disagreements /  64 poses
// EXACTLY ZERO, not small. Every classification bit -- fist, openPalm, pointing, the four folded flags and
// pinch.active -- is preserved by every rigid motion tested. THE FOLD TEST EARNS THIS HONESTLY: it compares
// dist(wrist,tip) against dist(wrist,pip), and a rigid motion preserves both distances exactly, so the
// inequality cannot turn over. Its own header calls this "rotation-tolerant" in a comment; that comment is now
// a graded claim instead of an assertion.
//
// *** AND THE HONEST NEGATIVE, WHICH IS THE FINDING WORTH MORE THAN THE PASS: THE SAME FUNCTION CONTAINS ONE
// CLASSIFIER THAT IS SCALE-INVARIANT AND ONE THAT IS NOT, AND THE ONE THAT IS NOT IS THE ONE barehands USES
// MOST. *** `folded` is a comparison between two distances, so a uniform scale multiplies both and the verdict
// stands -- measured 0 disagreements over 8 scales x 4 poses. `pinch.active` is a distance against an ABSOLUTE
// constant (pinchThreshold = 0.06 in normalized image units), so it has a critical scale and the scale is the
// user's distance from the camera. pinch.distance is exactly homogeneous of degree 1 (worst departure from
// s*d(1) is 2.1e-15 over the shipped sweep, floating-point noise), which makes the critical scale EXACT rather than
// empirical: s* = 0.06 / d(1). MEASURED, and each one verified to flip on either side of its own s*:
//
//     pose     d(1)        s* = 0.06/d(1)      what it means at the camera
//     open     0.146877      0.4085            reads pinched below ~41% of fixture size
//     point    0.146877      0.4085
//     fist     0.095370      0.6291            reads pinched below ~63% -- A FIST IS A FALSE PINCH WHEN FAR
//     pinch    0.017550      3.4188            stops reading pinched above ~342%
//
// *** SO "TAP" AND "PINCH-DRAG", barehands' TWO MOST-USED GESTURES, HAD A WORKING VOLUME AND NOTHING IN THE
// MODULE SAID SO. *** Lean back far enough and a closed fist crossed the pinch threshold on its own. v3850
// REPORTED THIS AND DID NOT FIX IT -- an absolute threshold on a normalized coordinate is a legitimate design
// with an undocumented precondition, and changing it moves shipped behaviour for every consumer, which was not
// that round's to do (v3679). IT WAS MEASURED SO IT COULD BE DECIDED, AND AT v4485 IT WAS.
//
// ================================================================================================================
// v4485 -- FIXED, ON KEITH'S CALL. pinch IS A RATIO TEST NOW, LIKE `folded` ALWAYS WAS
// ================================================================================================================
//
//     limit = pinchSpanFraction * dist(WRIST, MIDDLE_MCP)          default fraction 0.375
//
// THE SPAN HAD TO BE POSE-STABLE, NOT MERELY SIZE-PROPORTIONAL, AND THAT IS THE WHOLE DESIGN. Measured across
// the four poses, wrist->MIDDLE_MCP reads 0.160200 IDENTICALLY (it is the rigid palm), while wrist->MIDDLE_TIP
// -- the first "hand size" anyone reaches for -- collapses 0.278115 -> 0.131352 on a curl. A span that
// shortened when you closed your hand would make the pinch threshold depend on THE OTHER FINGERS, so a fist
// would move its own boundary. The palm also EXCLUDES THE THUMB, one of the two points being measured; a
// reference that moved with the gesture under test would be measuring itself.
//
// *** 0.375 IS DERIVED, NOT PICKED, WHICH IS WHAT MAKES THIS A GENERALIZATION RATHER THAN A RETUNE. ***
// 0.375 * 0.160200 = 0.060075 against the shipped 0.06 -- A 0.125% DIFFERENCE, and every fixture pose
// classifies EXACTLY as it did before at nominal size. Read anatomically it is a ~3.75cm thumb-index gap on a
// ~10cm palm; the fixture's palm:index ratio is 1.483 against ~1.389 for an adult hand, which is what licenses
// that reading. NOTE THE PROPORTION THAT IS *NOT* LICENSED: the fixture's knuckle row is 0.493 of its palm
// against ~0.800 real, SO A FRACTION CALIBRATED ON THE KNUCKLE SPAN WOULD HAVE BAKED A FIXTURE ERROR INTO A
// SHIPPED DEFAULT. That is why the span is the palm, and it is a fixture defect deciding a shipped constant --
// which has to be said out loud rather than discovered later.
//
// MEASURED, 12 scales x 4 poses spanning 0.25x to 4x:
//     pinchScaleDisagreements   9 / 48  ->  0 / 48        (absolute -> relative)
//     flips at the derived s*   4 / 4   ->  0 / 4
//     pinch.ratio (the distance in palms) drifts 2.8e-15 across the sweep -- the scale-free quantity
//     rigid invariance                                    STILL 0 / 256, and that is the one that could have
//         broken: the new predicate is a ratio of TWO distances, and a rigid motion preserves both.
//
// THE SWEEP ITSELF HAD TO BE WIDENED, AND THAT IS A FINDING. At 0.5..3 the `absolutethreshold` arm separated
// by only 2 of 32 and read as a weak defect. IT WAS A SWEEP THAT STOPPED BEFORE THE DEFECT HAPPENED -- three
// of the four critical scales (0.4085, 0.4085, 3.4188) sat outside it. A DEFECT MEASURED OUTSIDE THE RANGE
// WHERE IT OCCURS IS MEASURED AS ABSENT.
//
// AND ONE THING MOVED THAT IS REPORTED RATHER THAN ABSORBED: the flatdistance plant went 20 -> 21, because it
// flattens EVERY distance and that now includes the palm span the pinch limit is built from. The census SHAPE
// is unchanged -- still exactly one transform family sees it. A FIX THAT ADDS A DISTANCE ADDS IT TO THE
// PLANT'S REACH TOO.
//
// NOT CLAIMED: that 0.375 is right for a REAL hand. It is right for the shipped verdict at nominal size, the
// only continuity checkable without a camera. Confirming the fraction against real MediaPipe landmarks --
// where the palm span carries detector noise and foreshortens under perspective, neither of which a synthetic
// rigid fixture has -- IS NOT DONE HERE and is the named follow-up.
// NOT CLAIMED: that this removes every distance dependence. The span foreshortens when the palm turns edge-on
// to a real camera, and the fixture cannot show that because it rotates in true 3D with z preserved.
//
// ================================================================================================================
// THE PLANT, AND THE BLINDNESS CENSUS THAT IS THE REAL ARGUMENT FOR THIS DEVICE
// ================================================================================================================
//
// The defect: _dist3D DROPS ITS z TERM (`flatDistance`, declared in DEFAULT_OPTS, off by default). This is the
// most tempting real edit to that file -- MediaPipe's z is by far its noisiest output, dropping it looks like
// denoising, and every metric still returns a plausible number. MEASURED, against each arm's OWN untransformed
// reference so that what is graded is INVARIANCE and not a baseline offset between two metrics:
//
//     transform family                honest      planted     sees the plant?
//     rotation about x (tilt)          0/64       12/64       YES
//     rotation about y (turn)          0/64        8/64       YES
//     rotation about z (in-plane roll) 0/64        0/64       *** BLIND BY CONSTRUCTION ***
//     translation                      0/64        0/64       BLIND -- a shift changes no distance at all
//     uniform scale (fold family)      0/32        0/32       BLIND -- both distances scale together
//     mirror involution                0           0          BLIND -- a reflection is an isometry in 2D too
//
// ================================================================================================================
// v4026 -- THE SECOND PLANT, BECAUSE THE FIRST ONE LEFT translationDisagreements UNABLE TO FIRE
// ================================================================================================================
//
// The row above is correct and it is also an admission: translation reads 0/64 under BOTH arms, so the observable
// was a LOAD-BEARING NEGATIVE THAT NOTHING HAD SHOWN COULD FIRE -- knobGate's "an untested branch with a licence
// attached", one level up. `hands.span`, the knob that widens that sweep, was the only knob in the lab that moved
// no observable at any value in any mode, and the reason was this and not the knob.
//
// *** fixedAnchor IS THE EDIT THAT MAKES A CLASSIFICATION DEPEND ON WHERE THE HAND IS. *** The fold test
// references every finger to THE WRIST, and this file's own comment calls that "rotation-tolerant" -- it is also
// what makes it translation-invariant. Anchoring to a fixed point in the image instead is the same shape of
// tempting edit as flatDistance ("the wrist is the jitteriest joint in the chain, use the image centre"), and it
// leaves every metric returning a plausible number.
//
//     mode                         rigid   rotation   translation
//     honest                         0         0           0
//     flatdistance                  20        20           0        <- rotation only
//     fixedanchor (0.5, 0.5)        24         0          24        <- TRANSLATION ONLY
//
// *** THE TWO PLANTS ARE COMPLEMENTARY AT THE SHIPPED ANCHOR, AND THAT IS A PROPERTY OF THE ANCHOR RATHER THAN
// A STRUCTURAL FACT -- WHICH IS WHY THE ANCHOR IS A KNOB. *** Measured across positions:
//
//     anchor (0.5, 0.5)  near the hand      rotation  0    translation 24
//     anchor (0.5, 0.6)  ON the wrist       rotation  0    translation  8
//     anchor (0, 0)      image corner       rotation 15    translation  0
//     anchor (5, 5)      far away           rotation  1    translation  0
//
// A NEAR ANCHOR REACHES TRANSLATION AND IS BLIND TO ROTATION; A FAR ONE DOES THE OPPOSITE. Far away the anchor
// acts like a fixed DIRECTION rather than a point, and an ordering by distance along a nearly-parallel field
// survives a shift -- while the fingers sweeping through a large angle against it does not. Reported rather
// than tidied into one number, because "the plant reaches translation" is true of one anchor and false of
// another, and a census that stated only the shipped row would be claiming coverage it does not have.
//
// AND THE ROW AT (0.5, 0.6) IS THE ONE THAT ISOLATES THE MECHANISM: that is exactly where the wrist is placed,
// so the anchor STARTS at the wrist and still breaks translation invariance 8 times. IT IS THE FIXEDNESS AND
// NOT THE POSITION.
//
// ================================================================================================================
// v4027 -- THE LAST TWO NEGATIVES, AND ONE OF THEM WAS BLIND FOR A REASON NOBODY HAD MEASURED
// ================================================================================================================
//
// THE MIRROR INVOLUTION was the easy one. mirrorMaxDelta asserts that computing with mirror:true on a pose
// equals computing with mirror:false on its reflection, and this file's own gate says it "catches the mirror
// being applied to one side of a difference and not the other". `mirrorHalf` is that slip made a declared knob:
// keep mx() on the cursor, forget it on the grab point. 0 -> 0.127. Every gesture still returns a number in
// range, which is why it is the ordinary slip rather than an exotic one.
//
// *** IN-PLANE ROLL WAS THE INTERESTING ONE, AND THE FIRST ANSWER WAS WRONG. *** The census called it "BLIND BY
// CONSTRUCTION -- a 2D metric is EXACTLY invariant under rotation in the image plane". True of the metric, and
// it is NOT the reason the observable cannot move. `manhattan` replaces the Euclidean hypot with the taxicab
// sum -- a metric that is emphatically NOT rotation invariant -- and on the four committed poses it reads
// 0/64. MEASURED, the mechanism is MARGIN:
//
//     under z-rotation, the L1 fold DISTANCE swings   30-40%
//     under z-rotation, the L1 fold RATIO swings       6-10%     <- two distances from the SAME point in
//                                                                  nearly the SAME direction, so the
//                                                                  anisotropy largely cancels
//     closest fold decision on a committed pose        14-23% from its boundary
//
// A 6-10% perturbation cannot cross a 14% margin, so the plant is invisible -- and that is a statement about
// THE POSES, not about the metric. THE PREDICTION THAT FOLLOWS WAS TESTED: at a flexion where the margin is
// 0.01%, the same plant flips 69 of 80. So the sweep is repeated on a pose sitting ON the decision boundary,
// DERIVED BY BISECTION on the module's own verdict rather than typed, using whichever metric is active.
//
//     mode          committed inPlane   AT THE BOUNDARY   boundary flex   margin
//     honest              0/64             0/16            44.096 deg     1.06e-11 %
//     flatdistance        0/64             0/16            36.788 deg     7.25 %
//     fixedanchor         0/64             8/16            52.823 deg     8.80 %
//     manhattan           0/64            16/16            55.239 deg     11.1 %
//
// *** THE HONEST ARM SITS AT A MARGIN OF 1.06e-11 PERCENT AND STILL READS 0 OF 16, WHICH IS THE KEY RATHER THAN
// A CONVENIENCE. *** The Euclidean fold ratio varies 0.0000% under z-rotation -- exactly invariant, not nearly --
// so no margin however thin can make it flip. A boundary pose is the hardest case available to the honest metric
// and it is unmoved, which is what makes the planted 16/16 mean something.
//
// AND THE BOUNDARY POSE MAKES AN EXISTING PLANT VISIBLE IN A FAMILY IT COULD NOT PREVIOUSLY REACH: fixedanchor
// goes 0/64 to 8/16. flatdistance stays 0 in both, and that one IS structural -- z is constant under a rotation
// about z, so dropping it cannot change an in-plane verdict at any margin.
//
// THE BOUNDARY SWEEP IS REPORTED SEPARATELY and kept out of rigidDisagreements on purpose: it runs on a pose
// constructed to sit at the decision boundary, which is not one of the four committed gestures, and folding it
// into the headline would move a number that means "the vocabulary's own poses are invariant".
//
// *** FOUR OF THE FIVE TRANSFORM FAMILIES CANNOT SEE IT, AND THE BLIND ONE IS THE OBVIOUS ONE TO TEST WITH. ***
// A 2D metric is EXACTLY invariant under rotation in the image plane, so rolling your hand at the camera -- the
// first thing anyone does to check a hand tracker, and the motion barehands' two-hand rotate is built on --
// cannot detect a missing third dimension no matter how long you do it. Only tilting the hand TOWARD or AWAY
// from the camera can, and that is the motion "hold while carrying to rotate in 3D" actually needs.
//
// *** AND IT IS POSE-DEPENDENT IN A WAY THAT IS NOT ABOUT z EXTENT, WHICH IS THE PART I GOT WRONG FIRST. ***
// By pose, out-of-plane rotation only: open 0/32, point 0/32, fist 19/32, pinch 1/32. The obvious reading is
// "an open hand lies in the image plane so it has no z to lose" -- and the z-spans refute it: open 0.0300 but
// point 0.0980, THE SAME AS THE FIST, and point does not fire at all. What separates them is MARGIN. In `point`
// the index is fully extended and the other three fully curled, so every fold comparison sits far from its
// decision boundary and a distorted distance cannot push it over. The fist holds its fingers near the fold
// boundary, so it is the pose where a wrong distance changes a verdict. A DEFECT IS VISIBLE WHERE A DECISION IS
// CLOSE, NOT WHERE THE ERROR IS LARGE, and a census run only on committed poses would have called this device
// blind to its own plant.
//
// NOT CLAIMED: that face/MediaPipeHandTracker.js is correct. The MediaPipe landmarker itself, the webcam
// lifecycle, the preview canvas and the whole `start()/stop()` path are UNGRADED and ungradeable here -- they
// need a camera. This device grades computeHandMetrics, the one exported pure function, on a SYNTHETIC hand.
// NOT CLAIMED: that the fixture is a real hand. It is a kinematic chain -- four fingers of three phalanges
// curled by a per-finger flexion angle, plus a thumb -- and the poses were checked to classify as intended
// (open reads openPalm, fist reads fist, point reads pointing, pinch reads pinch) before anything was measured
// on them. THE KEYS DO NOT DEPEND ON IT BEING ANATOMICAL: rigid motions preserve distances for any point set,
// so the invariance claims hold for every hand, real or built. What the fixture buys is that the classifications
// being preserved are MEANINGFUL ones rather than degenerate.
// NOT CLAIMED: that this reaches barehands' code. Nothing here imports, vendors or executes it; it supplied the
// gesture contract this device grades against, and its licence and architecture stay on its own side.

import { computeHandMetrics } from "../../face/MediaPipeHandTracker.js";

import { pathToFileURL } from "node:url";
export const HANDS_MODES = ["rigid", "scale", "mirror", "flatdistance", "fixedanchor", "manhattan", "mirrorhalf", "absolutethreshold"];

export const HANDS_OBSERVABLES = [
    "rigidDisagreements", "rotationDisagreements", "translationDisagreements",
    "outOfPlaneDisagreements", "inPlaneDisagreements", "posesSwept", "twoHandSpreadDrift",
    "foldScaleDisagreements", "pinchScaleDisagreements", "pinchCriticalScale", "pinchHomogeneityErr",
    "pinchFlipsAtCritical", "pinchRatioDrift", "scalesSwept", "mirrorMaxDelta", "mirrorPoses",
    "inPlaneBoundaryDisagreements", "boundaryFlexDeg", "boundaryMarginPct", "inPlaneBoundarySwept",
    "poses", "kind",
];

const DEF = { rotDeg: 40, rotStep: 5, span: 0.2, pinchThreshold: 0.06, anchorX: 0.5, anchorY: 0.5 };

const D = Math.PI / 180;

// ---- the fixture ------------------------------------------------------------------------------------------
// A kinematic hand rather than a scatter of points: each finger is three phalanges hinging by a per-finger
// flexion angle, so `fist` is a real curl and not a relabelled cloud. Exported because a fixture built twice is
// two claims about one experiment (v3729's rule, and it caught a real error there).

const PALM = 0.16;
const FINGER_CHAINS = [
    { name: "index",  mcp: 5,  x: -0.035, seg: [0.050, 0.032, 0.026] },
    { name: "middle", mcp: 9,  x: -0.008, seg: [0.055, 0.035, 0.028] },
    { name: "ring",   mcp: 13, x:  0.019, seg: [0.050, 0.032, 0.026] },
    { name: "pinky",  mcp: 17, x:  0.044, seg: [0.040, 0.026, 0.022] },
];

/** The 21 MediaPipe landmarks for one hand, in a wrist-origin frame with +y along the fingers and +z out of
 *  the palm. `flex` is a per-finger flexion angle in radians; each successive joint adds another `flex`, which
 *  is what turns a straight finger into a curl. `thumbTo` brings the thumb tip to a named landmark (a pinch). */
export function handPose({ flex = [0, 0, 0, 0], thumbTo = null } = {}) {
    const p = new Array(21);
    p[0] = { x: 0, y: 0, z: 0 };                                  // WRIST
    FINGER_CHAINS.forEach((f, i) => {
        let cur = { x: f.x, y: PALM, z: 0 };
        p[f.mcp] = { ...cur };
        for (let k = 0; k < 3; k++) {
            const a = flex[i] * (k + 1);                           // cumulative: MCP, PIP then DIP each bend
            cur = { x: cur.x, y: cur.y + f.seg[k] * Math.cos(a), z: cur.z - f.seg[k] * Math.sin(a) };
            p[f.mcp + 1 + k] = { ...cur };
        }
    });
    p[1] = { x: -0.045, y: 0.035, z: 0.012 };                      // THUMB_CMC
    p[2] = { x: -0.075, y: 0.075, z: 0.022 };                      // THUMB_MCP
    p[3] = { x: -0.088, y: 0.108, z: 0.028 };                      // THUMB_IP
    p[4] = { x: -0.092, y: 0.136, z: 0.030 };                      // THUMB_TIP
    if (thumbTo != null) {
        const t = p[thumbTo];
        p[4] = { x: t.x + 0.010, y: t.y - 0.012, z: t.z + 0.008 };
        p[3] = { x: (p[2].x + p[4].x) / 2, y: (p[2].y + p[4].y) / 2, z: (p[2].z + p[4].z) / 2 };
    }
    return p;
}

/** The four poses barehands' vocabulary is built from. Each was checked to classify as intended BEFORE being
 *  measured on -- a fixture whose `fist` does not read as a fist grades nothing. */
export const POSES = {
    open:  { flex: [0, 0, 0, 0] },                                  // open palm: clap, claw-open
    fist:  { flex: [75 * D, 78 * D, 78 * D, 75 * D] },              // the claw / carry
    point: { flex: [0, 78 * D, 78 * D, 75 * D] },                   // aim
    pinch: { flex: [22 * D, 0, 0, 0], thumbTo: 8 },                 // tap, pinch-drag
};

export const POSE_NAMES = Object.keys(POSES);

/** Wrist-frame -> normalized image coords (y DOWN, as MediaPipe reports). `s` scales about the wrist, which is
 *  what makes the scale sweep a pure similarity rather than a reshape. */
export function place(p, { s = 1, cx = 0.5, cy = 0.6 } = {}) {
    return p.map((q) => ({ x: cx + q.x * s, y: cy - q.y * s, z: q.z * s }));
}

/** Rigid rotation about the wrist. z is the VIEW axis, so "z" is in-plane roll and x/y are out-of-plane. */
export function rotate(p, axis, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return p.map((q) =>
        axis === "z" ? { x: q.x * c - q.y * s, y: q.x * s + q.y * c, z: q.z } :
        axis === "y" ? { x: q.x * c + q.z * s, y: q.y, z: -q.x * s + q.z * c } :
                       { x: q.x, y: q.y * c - q.z * s, z: q.y * s + q.z * c });
}

/** The eight bits a gesture vocabulary actually reads. All of them are preserved by every rigid motion, so
 *  they can be compared for EQUALITY rather than closeness -- there is no tolerance to argue about. */
export function classify(m) {
    const h = m && m.hands && m.hands[0];
    if (!h) return null;
    return [h.fist, h.openPalm, h.pointing,
        h.folded.index, h.folded.middle, h.folded.ring, h.folded.pinky, h.pinch.active];
}

const differs = (a, b) => !a || !b || a.some((v, i) => v !== b[i]);

// ---- the device -------------------------------------------------------------------------------------------

export function handsDefaults(hyp) {
    const h = { mode: "rigid", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.rotDeg = Math.min(80, Math.max(5, num(c.rotDeg, DEF.rotDeg)));
    c.rotStep = Math.min(20, Math.max(1, num(c.rotStep, DEF.rotStep)));
    c.span = Math.min(0.4, Math.max(0.02, num(c.span, DEF.span)));
    c.pinchThreshold = Math.min(0.5, Math.max(1e-3, num(c.pinchThreshold, DEF.pinchThreshold)));
    // *** THE ANCHOR IS A KNOB BECAUSE WHICH INVARIANCE THE PLANT REACHES DEPENDS ON IT, and that is a
    // measurement rather than a preference. Deliberately unclamped in range: a far anchor is the interesting
    // case, not an invalid one. ***
    c.anchorX = num(c.anchorX, DEF.anchorX);
    c.anchorY = num(c.anchorY, DEF.anchorY);
    h.config = c;
    // *** THE VALIDATOR MUST LIST THE PLANT MODE. *** If `flatdistance` silently reverted to `rigid`, both arms
    // would read an identical number and the plant would fire at nothing -- v3806's lesson on flip2d, repeated
    // at v3845 on flip3d, and the only reason it was caught either time was that the two numbers matched to
    // every digit. It is cheaper to list the mode than to notice that.
    if (!HANDS_MODES.includes(h.mode)) h.mode = "rigid";
    if (!h.claim || !h.claim.observable) {
        h.claim =
            (h.mode === "rigid" || h.mode === "flatdistance" || h.mode === "fixedanchor" || h.mode === "manhattan")
                ? { observable: "rigidDisagreements", max: 0 } :
            h.mode === "mirrorhalf" ? { observable: "mirrorMaxDelta", max: 0 } :
            // *** v4485 -- THE SCALE CLAIM MOVES TO pinchScaleDisagreements. foldScaleDisagreements has been 0
            // since the fold test was written and would go on being 0 whatever happened to pinch, so claiming
            // on it made the mode's headline the half that was never in doubt. pinch is what this round fixed,
            // so it is what the claim rests on -- and `absolutethreshold` is graded against the SAME claim so
            // that it VIOLATES it. Both numbers are still asserted at 0 in the gate. ***
            (h.mode === "scale" || h.mode === "absolutethreshold")
                ? { observable: "pinchScaleDisagreements", max: 0 } :
                                 { observable: "mirrorMaxDelta", max: 0 };
    }
    return h;
}

/**
 * v4027 -- THE FLEXION AT WHICH THE FOLD DECISION SITS ON ITS BOUNDARY, DERIVED BY BISECTION ON THE MODULE'S
 * OWN VERDICT rather than typed. The census's own lesson is that "A DEFECT IS VISIBLE WHERE A DECISION IS
 * CLOSE, NOT WHERE THE ERROR IS LARGE" -- the four committed poses sit 14% to 23% from their fold boundary, and
 * nothing that perturbs the ratio by less than that can be seen on them. This finds the place where it can.
 *
 * Bisects on `folded.index` flipping as the fingers curl, USING WHATEVER METRIC THE CALLER HAS SELECTED, so the
 * boundary is the active metric's own and not a constant carried over from another one.
 */
function boundaryFlex(metrics, lo = 0.2, hi = 1.6, iters = 40) {
    const foldedAt = (fx) => {
        const m = metrics(place(handPose({ flex: [fx, fx, fx, fx] })));
        return !!(m && m.hands && m.hands[0] && m.hands[0].folded.index);
    };
    if (foldedAt(lo) === foldedAt(hi)) return null;      // no crossing in the bracket: REFUSED, not guessed
    for (let i = 0; i < iters; i++) {
        const mid = (lo + hi) / 2;
        if (foldedAt(mid) === foldedAt(lo)) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

export async function buildHands(hyp, base = {}) {
    const h = handsDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config;
    // BOTH ARMS SHARE EVERY OTHER SETTING. The plant is one flag on the metric function; the fixture, the
    // sweep and the reference are byte-for-byte the same, which is what makes the comparison about the module.
    const flat = h.mode === "flatdistance";
    // v4026 -- THE SECOND PLANT, AND IT EXISTS BECAUSE THE FIRST ONE COULD NOT REACH translationDisagreements.
    // flatdistance drops the z term, and the census above records translation as 0/64 under BOTH arms with the
    // reason: "a shift changes no distance at all". That is correct and it leaves the observable a
    // LOAD-BEARING NEGATIVE THAT NOTHING HAD SHOWN COULD FIRE. fixedanchor references the fold test to a point
    // in the image instead of to the wrist, which is the one edit that makes a classification depend on WHERE
    // THE HAND IS.
    const anchored = h.mode === "fixedanchor";
    // v4027 -- THE THIRD AND FOURTH PLANTS, for the last two families nothing could reach.
    const taxicab = h.mode === "manhattan";
    const halfMirror = h.mode === "mirrorhalf";
    // v4485 -- NOT A PLANT IN THE SAME SENSE AS THE FOUR ABOVE: `absolutethreshold` restores the PRE-v4485
    // comparison (a constant instead of a fraction of the palm), so it is the defect THIS ROUND FIXED, kept as
    // a declared mode so a regression of the fix is caught rather than discovered. See the device descriptor.
    const absolute = h.mode === "absolutethreshold";
    const opts = absolute ? { pinchRelative: false, pinchThreshold: c.pinchThreshold }
               : flat ? { flatDistance: true, pinchThreshold: c.pinchThreshold }
               : anchored ? { fixedAnchor: { x: c.anchorX, y: c.anchorY, z: 0 }, pinchThreshold: c.pinchThreshold }
               : taxicab ? { manhattan: true, pinchThreshold: c.pinchThreshold }
               : halfMirror ? { mirrorHalf: true, pinchThreshold: c.pinchThreshold }
                          : { pinchThreshold: c.pinchThreshold };
    const metrics = (lm) => computeHandMetrics([lm], null, opts);

    if (h.mode === "rigid" || h.mode === "flatdistance" || h.mode === "fixedanchor" || h.mode === "manhattan") {
        let rotDis = 0, transDis = 0, outDis = 0, inDis = 0, n = 0;
        for (const name of POSE_NAMES) {
            const pose = handPose(POSES[name]);
            // *** EACH ARM IS REFERENCED TO ITS OWN UNTRANSFORMED POSE. *** Comparing the planted arm against
            // the HONEST reference measures a baseline offset between two different metrics and reports it as
            // an invariance break -- it read 44/63 on the fist that way, and the number was meaningless. What
            // the vocabulary needs is that MOVING THE HAND DOES NOT CHANGE THE VERDICT, which is a statement
            // about one metric compared with itself.
            const ref = classify(metrics(place(pose)));
            if (!ref) return { error: "fixture-did-not-classify (the pose produced no hand)" };
            for (const axis of ["x", "y", "z"]) {
                for (let d = -c.rotDeg; d <= c.rotDeg; d += c.rotStep) {
                    if (d === 0) continue;
                    n++;
                    if (differs(classify(metrics(place(rotate(pose, axis, d * D)))), ref)) {
                        rotDis++;
                        if (axis === "z") inDis++; else outDis++;
                    }
                }
            }
            for (const dx of [-c.span, -c.span / 2, c.span / 2, c.span]) {
                for (const dy of [-c.span, -c.span / 2, c.span / 2, c.span]) {
                    n++;
                    if (differs(classify(metrics(place(pose, { cx: 0.5 + dx, cy: 0.6 + dy }))), ref)) transDis++;
                }
            }
        }
        // *** v4027 -- IN-PLANE ROLL AT THE DECISION BOUNDARY. *** The four committed poses cannot see a
        // metric that is not rotation-invariant, and the reason is MARGIN rather than symmetry: measured, the
        // L1 fold DISTANCE swings 30-40% under z-rotation while the fold RATIO -- two distances from the same
        // point in nearly the same direction, so the anisotropy largely cancels -- swings only 6-10%, against a
        // closest margin of 14%. At a flexion where the margin is 0.01% the same plant flips 69 of 80. So the
        // sweep is repeated on a pose sitting ON the boundary, derived by bisection on the module's own verdict.
        //
        // AND THE HONEST ARM STAYS EXACTLY 0 THERE, WHICH IS THE KEY RATHER THAN A CONVENIENCE: the Euclidean
        // fold ratio varies 0.0000% under z-rotation -- exactly invariant, not nearly -- so no margin however
        // thin can make it flip. A boundary pose is the hardest case for the honest metric and it is unmoved.
        let bDis = 0, bN = 0, bFlex = null, bMargin = null;
        {
            const fx = boundaryFlex(metrics);
            if (fx !== null) {
                bFlex = fx * 180 / Math.PI;
                const bp = handPose({ flex: [fx, fx, fx, fx] });
                const bref = classify(metrics(place(bp)));
                if (bref) {
                    for (let d = -c.rotDeg; d <= c.rotDeg; d += c.rotStep) {
                        if (d === 0) continue;
                        bN++;
                        if (differs(classify(metrics(place(rotate(bp, "z", d * D)))), bref)) bDis++;
                    }
                }
                // How close the decision actually is, so "on the boundary" is a measurement and not a label.
                const m0 = metrics(place(bp));
                const w = place(bp)[0], pts = place(bp);
                const dTip = Math.hypot(pts[8].x - w.x, pts[8].y - w.y, pts[8].z - w.z);
                const dPip = Math.hypot(pts[6].x - w.x, pts[6].y - w.y, pts[6].z - w.z);
                bMargin = Math.abs(dTip / dPip - 1) * 100;
                void m0;
            }
        }

        // Two-hand spread under a rigid motion of the PAIR -- barehands scales with it. REPORTED, NOT PINNED AT
        // ZERO: unlike the classification bits this is a hypot over transformed coordinates, so it carries
        // floating-point roundoff (measured 5.6e-17 under translation, 1.1e-16 under in-plane rotation) and
        // asserting it exact would be asserting that rotation arithmetic is closed in binary64.
        const L = handPose(POSES.open), R = handPose(POSES.open);
        const refSpread = computeHandMetrics([place(L, { cx: 0.32, cy: 0.55 }), place(R, { cx: 0.68, cy: 0.55 })], null, opts).twoHand.spread;
        let spreadDrift = 0;
        for (const dx of [-0.1, 0, 0.1]) {
            for (const dy of [-0.1, 0, 0.1]) {
                const m = computeHandMetrics([place(L, { cx: 0.32 + dx, cy: 0.55 + dy }), place(R, { cx: 0.68 + dx, cy: 0.55 + dy })], null, opts);
                spreadDrift = Math.max(spreadDrift, Math.abs(m.twoHand.spread - refSpread));
            }
        }
        return {
            kind: flat ? "flatdistance" : "rigid",
            rigidDisagreements: rotDis + transDis,
            rotationDisagreements: rotDis, translationDisagreements: transDis,
            outOfPlaneDisagreements: outDis, inPlaneDisagreements: inDis,
            posesSwept: n, poses: POSE_NAMES.length, twoHandSpreadDrift: spreadDrift,
            // The boundary sweep is REPORTED SEPARATELY and deliberately kept out of rigidDisagreements: it runs
            // on a pose constructed to sit at the decision boundary, which is not one of the four committed
            // gestures, and folding it into the headline count would move a number that means "the vocabulary's
            // own poses are invariant".
            inPlaneBoundaryDisagreements: bDis, inPlaneBoundarySwept: bN,
            boundaryFlexDeg: bFlex === null ? -1 : bFlex,
            boundaryMarginPct: bMargin === null ? -1 : bMargin,
        };
    }

    if (h.mode === "scale" || h.mode === "absolutethreshold") {
        // *** THE SWEEP MUST BRACKET EVERY POSE'S CRITICAL SCALE OR IT GRADES ITS OWN RANGE. *** The old sweep
        // ran 0.5..3 and the four s* values are 0.4085 (open), 0.4085 (point), 0.6291 (fist) and 3.4188
        // (pinch) -- so only the FIST's fell inside it and `absolutethreshold` separated by just 2 of 32. That
        // is not a weak defect, it is a sweep that stops before the defect happens. 0.25..4 brackets all four.
        const scales = [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];
        let foldDis = 0, pinchDis = 0, n = 0, homogErr = 0, flips = 0;
        let critical = 0, ratioDrift = 0;
        for (const name of POSE_NAMES) {
            const pose = handPose(POSES[name]);
            const ref = classify(metrics(place(pose)));
            const base0 = metrics(place(pose)).hands[0];
            const d1 = base0.pinch.distance, r1 = base0.pinch.ratio;
            for (const s of scales) {
                n++;
                const cl = classify(metrics(place(pose, { s })));
                // the FOLD FAMILY: the first seven bits. It was ALWAYS scale-invariant -- it is a ratio test.
                for (let i = 0; i < 7; i++) if (cl[i] !== ref[i]) foldDis++;
                // *** AND NOW THE EIGHTH BIT TOO (v4485). *** Until this round pinch.active was the one
                // classifier here that scale could turn over. It is counted SEPARATELY rather than folded into
                // the seven because the two claims have different histories: one has always held, the other
                // had to be fixed, and a single number would hide which.
                if (cl[7] !== ref[7]) pinchDis++;
                const hs = metrics(place(pose, { s })).hands[0];
                homogErr = Math.max(homogErr, Math.abs(hs.pinch.distance - s * d1) / (s * d1));
                // the RATIO is the scale-free quantity the fix introduces -- pinchDist measured in palms.
                ratioDrift = Math.max(ratioDrift, Math.abs(hs.pinch.ratio - r1) / r1);
            }
            // s* is DERIVED from the homogeneity, then VERIFIED to flip on either side of itself.
            const sStar = c.pinchThreshold / d1;
            if (name === "fist") critical = sStar;
            const below = metrics(place(pose, { s: sStar * 0.999 })).hands[0].pinch.active;
            const above = metrics(place(pose, { s: sStar * 1.001 })).hands[0].pinch.active;
            if (below === true && above === false) flips++;
        }
        return {
            kind: absolute ? "absolutethreshold" : "scale",
            foldScaleDisagreements: foldDis, pinchScaleDisagreements: pinchDis, scalesSwept: n,
            pinchHomogeneityErr: homogErr, pinchCriticalScale: critical,
            pinchFlipsAtCritical: flips, pinchRatioDrift: ratioDrift, poses: POSE_NAMES.length,
        };
    }

    // mirror: computing with mirror:true on a pose must equal computing with mirror:false on its reflection.
    let worst = 0, mp = 0;
    for (const name of POSE_NAMES) {
        const b = place(handPose(POSES[name]));
        const f = b.map((q) => ({ ...q, x: 1 - q.x }));
        const a1 = computeHandMetrics([b], null, { ...opts, mirror: true });
        const a2 = computeHandMetrics([f], null, { ...opts, mirror: false });
        mp++;
        worst = Math.max(worst,
            Math.abs(a1.cursor.x - a2.cursor.x), Math.abs(a1.cursor.y - a2.cursor.y),
            Math.abs(a1.hands[0].grab.point.x - a2.hands[0].grab.point.x),
            Math.abs(a1.hands[0].grab.point.y - a2.hands[0].grab.point.y),
            Math.abs(a1.hands[0].pinch.distance - a2.hands[0].pinch.distance));
    }
    return { kind: "mirror", mirrorMaxDelta: worst, mirrorPoses: mp, poses: POSE_NAMES.length };
}

export const handsDevice = {
    // *** "rigid" IS FIRST ON PURPOSE. *** probeModePlant compares the plant against
    // `modes.find(m => m !== plantMode)`, and rigidDisagreements EXISTS ONLY IN THE RIGID BRANCH. With "scale"
    // first the census would build an arm with no rigidDisagreements in it and report this device DECLARED BUT
    // DEAD -- which is what mpmrefine reads today and what v3845 had to reorder flip3d to avoid.
    modes: HANDS_MODES,
    // *** v4485 -- `absolutethreshold` IS A DECLARED MODE AND DELIBERATELY NOT THE PROMOTED PLANT. *** The
    // schema carries one plantMode, and flatdistance keeps it: its blindness census is the stronger argument,
    // and moving the promotion would shift this device's census entry for a reason unrelated to the census.
    // The distinction that matters is that absolutethreshold IS NOT A HYPOTHETICAL -- the other four modes are
    // tempting edits nobody made, and this one is the behaviour the tree actually shipped until v4485. It is
    // graded in the gate (section 4) so the fix has a regression guard rather than a changelog entry.
    plantMode: "flatdistance", plantFlips: "rigidDisagreements", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "rigidDisagreements counts poses where a rigid transform is not reproduced, ideally 0 across all 256 swept; flatdistance produces 20, and it is specifically the OUT-OF-PLANE ones that break (20) while inPlaneDisagreements stays 0 -- which is what a flattened distance would do",
    name: "hands-gesture-invariance",
    observables: HANDS_OBSERVABLES,
    build: buildHands,
    defaults: handsDefaults,
};

// ---- front door ------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const rigid = await buildHands({ mode: "rigid" });
    const flat = await buildHands({ mode: "flatdistance" });
    const scale = await buildHands({ mode: "scale" });
    const mir = await buildHands({ mode: "mirror" });
    const abs = await buildHands({ mode: "absolutethreshold" });
    console.log("[hands] THE GESTURE LAYER -- barehands' vocabulary as an answer key for computeHandMetrics\n");
    console.log("  RIGID (what 'pinch-drag' and 'hold while carrying to rotate' silently require)");
    console.log(`    rotation ${rigid.rotationDisagreements}, translation ${rigid.translationDisagreements}` +
        ` over ${rigid.posesSwept} poses -- EXACTLY zero, not small. A rigid motion preserves both distances`);
    console.log("    the fold test compares, so the verdict cannot turn over.");
    console.log(`    two-hand spread drift ${rigid.twoHandSpreadDrift.toExponential(2)} (REPORTED: a hypot carries roundoff)`);
    console.log("\n  SCALE -- v3850's honest negative, FIXED at v4485 (Keith's call, with the numbers)");
    console.log(`    fold family ${scale.foldScaleDisagreements} disagreements over ${scale.scalesSwept} (pose, scale) pairs -- a RATIO test, always was`);
    console.log(`    *** pinch ${scale.pinchScaleDisagreements} -- IT IS A RATIO TEST NOW TOO: limit = 0.375 * dist(WRIST, MIDDLE_MCP) ***`);
    console.log(`    the old absolute rule flips ${abs.pinchScaleDisagreements}/${abs.scalesSwept} over the same sweep and ${abs.pinchFlipsAtCritical}/${abs.poses} poses at their own s*.`);
    console.log(`    A FIST no longer becomes a pinch by being far away (s*=${abs.pinchCriticalScale.toFixed(4)} used to do that).`);
    console.log(`    pinch.ratio -- the distance in PALMS -- drifts ${scale.pinchRatioDrift.toExponential(2)} across 0.25x..4x.`);
    console.log("    0.375 is DERIVED: 0.375 * 0.160200 = 0.060075 vs the shipped 0.06, a 0.125% difference, so");
    console.log("    every pose classifies exactly as before at nominal size. A GENERALIZATION, NOT A RETUNE.");
    console.log("\n  MIRROR");
    console.log(`    max delta ${mir.mirrorMaxDelta} across ${mir.mirrorPoses} poses`);
    console.log("\n  THE PLANT -- _dist3D drops its z term, and FOUR OF FIVE TRANSFORM FAMILIES CANNOT SEE IT");
    console.log(`    rigidDisagreements ${rigid.rigidDisagreements} -> ${flat.rigidDisagreements}` +
        `   out-of-plane ${flat.outOfPlaneDisagreements}, IN-PLANE ROLL ${flat.inPlaneDisagreements}`);
    console.log("    In-plane roll is blind BY CONSTRUCTION: a 2D metric is exactly invariant under rotation in");
    console.log("    the image plane. Rolling your hand at the camera -- the first thing anyone tries -- can");
    console.log("    never detect a missing third dimension. Only tilting toward or away from it can.");
}
