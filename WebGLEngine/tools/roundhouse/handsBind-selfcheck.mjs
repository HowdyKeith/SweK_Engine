// tools/roundhouse/handsBind-selfcheck.mjs
//
// v3850 -- THE ANSWER KEY FOR THE hands DEVICE, BESIDE THE BIND IT GRADES (v3724's split). The registry-shape
// checks live in tools/ship/labDevices-selfcheck.mjs where every device's do; the geometry is here, and the
// instrument row's `gate` points HERE because deviceInstrumentMap takes a row's gate imports as the modules
// that row exercises.
//
// *** THE ARGUMENT OF THE ROUND IN ONE LINE: barehands' GESTURE VOCABULARY IS A SPECIFICATION, AND THE LAYER
// THAT WOULD HAVE TO CARRY IT HAS NEVER BEEN CHECKED. *** computeHandMetrics shipped at round 310 marked "pure
// metric computation (headless-testable)" and nothing ever tested it. Section 1 is what "pinch-drag" and "hold
// while carrying" silently require. Section 2 is the honest negative -- one classifier in that function is
// scale-invariant and one is not. Section 3 is the plant and the census of what cannot see it.
//
// WHEN A CHECK HERE GOES RED:
//   section 1 -> a rigid motion has started changing a gesture verdict, and THE BAR IS EXACTLY ZERO ON PURPOSE.
//     It is not a tolerance that can be loosened: the fold test compares two distances from a common point and
//     rigid motions preserve both, so any disagreement is a real break. If a future change makes a
//     classification depend on absolute position, MOVE THAT BIT TO THE REPORTED SET -- do not raise the bar.
//   section 2 -> `folded` has stopped being a pure ratio test, or pinch.distance has stopped being homogeneous.
//     The CRITICAL SCALE ITSELF IS NOT A DEFECT and must not be "fixed" to make a check pass; see its note.
//   section 3 -> the plant stopped separating. Check the fixture's poses still classify as intended FIRST: a
//     pose that has drifted away from its fold boundary goes blind to the plant without anything else moving.

import {
    buildHands, handsDevice, handsDefaults,
    handPose, place, rotate, classify, POSES, POSE_NAMES,
} from "./handsBind.mjs";
// *** THE MODULE UNDER GRADE IS IMPORTED HERE DIRECTLY, AND deviceInstrumentMap IS WHY. *** Its instrument row
// names this file as its gate, and the map takes a row's GATE IMPORTS as the modules that row exercises -- a
// gate that reaches the physics only through the bind shares NO module with the device it claims. It is not a
// formality: the checks below use it to assert THE DEVICE DRIVES THE SHIPPED FUNCTION rather than a copy.
import { computeHandMetrics } from "../../face/MediaPipeHandTracker.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (name, detail) => console.log("  ----  " + name + "   " + detail);

// ---- 0. THE FIXTURE MEANS WHAT IT SAYS ---------------------------------------------------------------------
// FIRST, because every number after this one is meaningless if `fist` does not read as a fist. A fixture that
// has drifted off its poses grades nothing and -- worse -- goes quietly BLIND to the plant in section 3.
console.log("0. THE FIXTURE -- do the four poses classify as the gestures they are named for?");
{
    const m = (n) => computeHandMetrics([place(handPose(POSES[n]))])?.hands?.[0];
    const open = m("open"), fist = m("fist"), point = m("point"), pinch = m("pinch");
    ok("!! the synthetic hand produces the four gestures barehands' vocabulary is built from",
        open.openPalm && !open.fist && fist.fist && !fist.openPalm && point.pointing && pinch.pinch.active,
        `open{openPalm ${open.openPalm}} fist{fist ${fist.fist}} point{pointing ${point.pointing}} ` +
        `pinch{active ${pinch.pinch.active}, d ${pinch.pinch.distance.toFixed(4)}} -- a kinematic chain, not a ` +
        `point cloud: each finger is three phalanges hinging by a per-finger flexion angle`);
    report("WHAT THE FIXTURE IS AND IS NOT",
        "It is NOT a real hand and the keys do not need it to be -- rigid motions preserve distances for ANY " +
        "point set, so section 1 holds for every hand, real or built. What being anatomical buys is that the " +
        "preserved classifications are MEANINGFUL ones rather than degenerate.");
}

// ---- 1. WHAT THE GESTURE VOCABULARY SILENTLY REQUIRES -------------------------------------------------------
console.log("\n1. RIGID INVARIANCE -- 'pinch-drag' means moving your hand must not re-classify it");
const rigid = await buildHands({ mode: "rigid" });
ok("!! no rigid motion changes any gesture verdict, and the bar is EXACTLY ZERO",
    !rigid.error && rigid.rigidDisagreements === 0,
    `${rigid.rotationDisagreements} rotation + ${rigid.translationDisagreements} translation disagreements over ` +
    `${rigid.posesSwept} transformed poses (${rigid.poses} poses x 3 axes x 16 angles, + 16 translations each). ` +
    `*** EXACT, NOT SMALL: the fold test compares dist(wrist,tip) against dist(wrist,pip) and a rigid motion ` +
    `preserves BOTH, so the inequality cannot turn over. The module's own header calls this "rotation-tolerant" ` +
    `in a comment -- that comment is a graded claim now. ***`);

ok("...and the in-plane and out-of-plane halves are BOTH clean on the shipped module",
    rigid.inPlaneDisagreements === 0 && rigid.outOfPlaneDisagreements === 0,
    `in-plane roll ${rigid.inPlaneDisagreements}, out-of-plane tilt/turn ${rigid.outOfPlaneDisagreements} -- ` +
    `they are counted APART because section 3 shows only one of them can see the plant`);

report("THE TWO-HAND SPREAD IS REPORTED, NOT PINNED AT ZERO",
    `drift ${rigid.twoHandSpreadDrift.toExponential(3)} under a rigid motion of the pair. barehands scales with ` +
    `this number, so it is worth measuring -- but unlike the classification bits it is a HYPOT OVER TRANSFORMED ` +
    `COORDINATES and carries roundoff (5.6e-17 translating, 1.1e-16 rotating in plane). Asserting it exactly ` +
    `zero would be asserting that rotation arithmetic is closed in binary64.`);

// ---- 2. THE HONEST NEGATIVE ---------------------------------------------------------------------------------
console.log("\n2. SCALE -- v3850 found one classifier scale-invariant and one not; v3851 fixed the second");
const scale = await buildHands({ mode: "scale" });
ok("!! the fold family is scale-invariant, because it is a RATIO test",
    !scale.error && scale.foldScaleDisagreements === 0,
    `${scale.foldScaleDisagreements} disagreements over ${scale.scalesSwept} (pose, scale) pairs spanning 0.5x to ` +
    `3x. A uniform scale multiplies both compared distances, so the verdict stands -- fist / openPalm / pointing ` +
    `and the four folded flags do not care how far away the user is`);

ok("!! pinch.distance is exactly homogeneous of degree 1, which is WHY an absolute threshold had a critical scale",
    scale.pinchHomogeneityErr < 1e-12,
    `worst departure from s*d(1) is ${scale.pinchHomogeneityErr.toExponential(3)} -- floating-point noise. So ` +
    `s* = pinchThreshold / d(1) was EXACT rather than fitted, and did not have to be searched for`);

// *** THE v3851 FIX, AND THE CHECK THAT WOULD CATCH IT BEING UNDONE ***
ok("!! *** pinch.active IS NOW SCALE-INVARIANT TOO -- it compares against a FRACTION OF THE PALM ***",
    scale.pinchScaleDisagreements === 0,
    `${scale.pinchScaleDisagreements} disagreements over ${scale.scalesSwept} (pose, scale) pairs spanning ` +
    `0.25x to 4x. limit = pinchSpanFraction * dist(WRIST, MIDDLE_MCP), so both sides of the comparison scale ` +
    `together and the verdict cannot turn over -- the same reason the fold family was always safe`);

ok("...and pinch.ratio, the distance measured in PALMS, is the scale-free quantity that makes that true",
    scale.pinchRatioDrift < 1e-12,
    `drift ${scale.pinchRatioDrift.toExponential(3)} across the whole sweep. `+
    `\`ratio < pinchSpanFraction\` IS \`active\`, so a caller can read the margin rather than re-deriving it`);

ok("!! the span is POSE-STABLE, which is the load-bearing property and not merely that it scales",
    (() => {
        const spans = POSE_NAMES.map((n) => computeHandMetrics([place(handPose(POSES[n]))]).hands[0].pinch.span);
        return spans.every((v) => Math.abs(v - spans[0]) < 1e-12);
    })(),
    `wrist->MIDDLE_MCP reads identically across open/fist/point/pinch (it is the rigid palm), where ` +
    `wrist->MIDDLE_TIP collapses 0.278115 -> 0.131352 on a curl. *** A SPAN THAT SHORTENED WHEN YOU CLOSED ` +
    `YOUR HAND WOULD MAKE THE PINCH THRESHOLD DEPEND ON THE OTHER FINGERS -- circular. *** It also excludes ` +
    `the THUMB, one of the two points being measured`);

ok("!! the default fraction is a GENERALIZATION of the shipped verdict, not a retune -- checked, not asserted",
    (() => {
        let same = 0;
        for (const n of POSE_NAMES) {
            const lm = place(handPose(POSES[n]));
            const now = computeHandMetrics([lm]).hands[0].pinch.active;
            const before = computeHandMetrics([lm], null, { pinchRelative: false }).hands[0].pinch.active;
            if (now === before) same++;
        }
        return same === POSE_NAMES.length;
    })(),
    `all ${POSE_NAMES.length} poses classify identically at nominal size to the pre-v3851 absolute comparison. ` +
    `0.375 * 0.160200 = 0.060075 against the shipped 0.06 -- a 0.125% difference. *** IF THIS GOES RED THE ` +
    `FRACTION HAS BEEN RETUNED, WHICH IS A DIFFERENT DECISION FROM THE ONE THIS ROUND MADE. ***`);

ok("!! a degenerate palm span FALLS BACK instead of dividing by it",
    (() => {
        const collapsed = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
        const h = computeHandMetrics([collapsed]).hands[0];
        return h.pinch.span === 0 && h.pinch.relative === false && h.pinch.limit === 0.06;
    })(),
    "a collapsed palm gives span 0; without the guard the limit would be 0 and NOTHING would ever read as " +
    "pinched -- silently, and hardest exactly where tracking is already worst. It falls back to the absolute " +
    "threshold and says so in `pinch.relative`");

report("*** WHAT v3850 SAID ABOUT THIS, AND WHY IT IS NOT A CONTRADICTION ***",
    "v3850 measured this defect and DECLINED to fix it -- 'a round must not move a verdict it is not about' " +
    "(v3679) -- and put it to Keith with the numbers. Keith called it. THAT IS THE DIFFERENCE BETWEEN A ROUND " +
    "REFUSING A CHANGE AND A ROUND BEING TOLD TO MAKE ONE, and the numbers v3850 recorded are what made the " +
    "call decidable rather than a preference.");

// ---- 3. MIRROR ----------------------------------------------------------------------------------------------
console.log("\n3. THE MIRROR INVOLUTION -- the webcam is a mirror and the module flips X to compensate");
const mir = await buildHands({ mode: "mirror" });
ok("computing with mirror:true equals computing with mirror:false on the reflected landmarks",
    !mir.error && mir.mirrorMaxDelta === 0,
    `max delta ${mir.mirrorMaxDelta} across ${mir.mirrorPoses} poses over cursor, grab point and pinch distance. ` +
    `x -> 1-x is an affine reflection, so it commutes with the midpoint that builds the grab point and preserves ` +
    `every distance -- this catches the mirror being applied to one side of a difference and not the other`);

// ---- 4. THE PLANT, AND THE CENSUS OF WHAT CANNOT SEE IT -----------------------------------------------------
console.log("\n4. THE PLANT -- _dist3D drops its z term, the most tempting real edit to that file");
{
    const flat = await buildHands({ mode: "flatdistance" });

    ok("!! the plant is DECLARED in the shape the census adjudicates -- plantMode / plantFlips / plantKind",
        handsDevice.plantMode === "flatdistance" && handsDevice.plantFlips === "rigidDisagreements" &&
        handsDevice.plantKind === "mode" && handsDevice.modes.includes("flatdistance") &&
        handsDevice.modes[0] === "rigid",
        "modes " + JSON.stringify(handsDevice.modes) + ' -- *** "rigid" IS FIRST ON PURPOSE: the contract ' +
        "compares the plant against `modes.find(m => m !== plantMode)`, and rigidDisagreements EXISTS ONLY IN " +
        "THE RIGID BRANCH. With `scale` first the census would build an arm with no rigidDisagreements in it " +
        "and report this device DECLARED BUT DEAD. ***");

    ok("!! the DECLARED observable flips off an EXACT zero, so any movement at all is a violation",
        rigid.rigidDisagreements === 0 && flat.rigidDisagreements > 0,
        `rigidDisagreements ${rigid.rigidDisagreements} -> ${flat.rigidDisagreements} of ${flat.posesSwept} ` +
        `transformed poses. MediaPipe's z is by far its noisiest output and dropping it looks like denoising -- ` +
        `every metric still returns a plausible number, which is exactly why it is the defect worth planting`);

    ok("!! *** AND IN-PLANE ROLL IS BLIND TO IT BY CONSTRUCTION -- THE MOTION EVERYONE TESTS WITH ***",
        flat.inPlaneDisagreements === 0 && flat.outOfPlaneDisagreements > 0,
        `out-of-plane (tilt/turn) ${flat.outOfPlaneDisagreements}, IN-PLANE ROLL ${flat.inPlaneDisagreements}. ` +
        `A 2D metric is EXACTLY invariant under rotation in the image plane, so rolling your hand at the camera ` +
        `-- the first thing anyone does to check a hand tracker, and the motion barehands' two-hand rotate is ` +
        `built on -- CANNOT DETECT A MISSING THIRD DIMENSION no matter how long you do it. Only tilting toward ` +
        `or away from the camera can, which is the motion "hold while carrying to rotate in 3D" needs.`);

    ok("...and translation cannot see it either -- a shift changes no distance at all",
        flat.translationDisagreements === 0,
        `translation ${flat.translationDisagreements}, rotation ${flat.rotationDisagreements}: the whole of the ` +
        `plant's signal is in ONE of the five transform families this device sweeps`);

    report("THE FULL BLINDNESS CENSUS, MEASURED",
        "rotation about x 13/64 FIRES, about y 8/64 FIRES, about z (in-plane) 0/64 BLIND, translation 0/64 " +
        "BLIND, uniform scale 0/48 BLIND, mirror 0 BLIND. *** FOUR OF THE FIVE TRANSFORM FAMILIES CANNOT SEE " +
        "IT AND THE BLIND ONE IS THE OBVIOUS ONE TO TEST WITH. *** A device built only from the invariances " +
        "that are easiest to state would have certified this module against a defect that removes a third of " +
        "its input. (v3851 moved the total 20 -> 21: the plant flattens EVERY distance and that now includes " +
        "the palm span the pinch limit is built from, so the pinch bit joins what it can disturb. The SHAPE " +
        "of the census is unchanged -- still exactly one family sees it.)");

    report("*** AND IT IS POSE-DEPENDENT FOR A REASON THAT IS NOT z EXTENT -- THE PART THIS ROUND GOT WRONG FIRST",
        "By pose, all axes: open 0/48, point 0/48, fist 20/48, pinch 1/48. The obvious reading is 'an " +
        "open hand lies in the image plane so it has no z to lose', AND THE z-SPANS REFUTE IT: open 0.0300 but " +
        "point 0.0980, THE SAME AS THE FIST, and point does not fire at all. What separates them is MARGIN -- " +
        "in `point` the index is fully extended and the others fully curled, so every fold comparison sits far " +
        "from its boundary. A DEFECT IS VISIBLE WHERE A DECISION IS CLOSE, NOT WHERE THE ERROR IS LARGE.");

    // *** THE KNOB MUST NOT MOVE THE DEFAULT. *** v3845 lost most of a round to a tidied knob that changed the
    // shipped answer in the last ulp, and the give-away was that two numbers which should have matched to every
    // digit did not. Verified against the PRISTINE arithmetic rather than assumed.
    ok("!! the shipped default is BIT-IDENTICAL with the knob off -- verified against the three-argument path",
        (() => {
            let worst = 0, bits = 0;
            for (const name of POSE_NAMES) {
                const pose = handPose(POSES[name]);
                for (const axis of ["x", "y", "z"]) {
                    for (let d = -40; d <= 40; d += 5) {
                        const lm = place(rotate(pose, axis, d * Math.PI / 180));
                        const a = computeHandMetrics([lm]);                                  // default
                        const b = computeHandMetrics([lm], null, { flatDistance: false });   // explicit off
                        worst = Math.max(worst, Math.abs(a.hands[0].pinch.distance - b.hands[0].pinch.distance));
                        const ca = classify(a), cb = classify(b);
                        for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) bits++;
                    }
                }
            }
            return worst === 0 && bits === 0;
        })(),
        "*** _dist3D BRANCHES ON THE WHOLE CALL RATHER THAN ON A ZEROED dz, and that is not tidiness: " +
        "Math.hypot(dx,dy,0) and Math.hypot(dx,dy) are different operations over different argument counts and " +
        "are not obliged to agree in the last ulp. Writing it as `Math.hypot(dx,dy, flat ? 0 : dz)` would put " +
        "the knob INSIDE the default's arithmetic. A KNOB THAT CHANGES THE DEFAULT IS NOT A KNOB. ***");

    // *** THE SECOND DEFECT MODE: the pre-v3851 comparison, graded so a REGRESSION OF THIS ROUND'S FIX would
    // be caught. It is not the promoted plant (see the device descriptor for why) but it is not undeclared
    // either -- v3729's precedent: run the defects, promote one, and MEASURE the others rather than mention them.
    const absolute = await buildHands({ mode: "absolutethreshold" });
    ok("!! `absolutethreshold` restores the pre-v3851 comparison and VIOLATES the scale claim",
        scale.pinchScaleDisagreements === 0 && absolute.pinchScaleDisagreements > 0,
        `pinchScaleDisagreements ${scale.pinchScaleDisagreements} -> ${absolute.pinchScaleDisagreements} of ` +
        `${absolute.scalesSwept}, and flips at the derived s* ${scale.pinchFlipsAtCritical} -> ` +
        `${absolute.pinchFlipsAtCritical} of ${absolute.poses}. *** A FIST READS AS A PINCH BELOW s* = ` +
        `${absolute.pinchCriticalScale.toFixed(4)} UNDER THE OLD RULE AND AT NO SCALE UNDER THE NEW ONE ***`);

    ok("...and the fold family is untouched by it, so the two halves of the scale mode are separate claims",
        absolute.foldScaleDisagreements === 0,
        `fold ${absolute.foldScaleDisagreements} in both arms -- it was ALWAYS a ratio test, and a mode that ` +
        `moved it too would not isolate what v3851 actually changed`);

    ok("...and the validator LISTS the plant mode, so it cannot silently revert",
        handsDefaults({ mode: "flatdistance" }).mode === "flatdistance" &&
        handsDefaults({ mode: "absolutethreshold" }).mode === "absolutethreshold" &&
        handsDefaults({ mode: "nonsense-mode" }).mode === "rigid",
        "v3806 lost a round to a validator that reverted its plant in silence and v3845 nearly repeated it -- " +
        "both arms then read an IDENTICAL number and the plant fires at nothing. The DEFAULT is untouched: " +
        "handsDefaults still returns `rigid`");
}

// ---- 5. THE DEVICE CONTRACT ---------------------------------------------------------------------------------
console.log("\n5. THE DEVICE CONTRACT");
{
    const flat = await buildHands({ mode: "flatdistance" });
    const absolute = await buildHands({ mode: "absolutethreshold" });
    ok("every key measured in every mode is declared",
        [rigid, scale, mir, flat, absolute].every((o) => Object.keys(o).every((k) => handsDevice.observables.includes(k))),
        `${handsDevice.observables.length} declared observables across ${handsDevice.modes.length} modes`);

    ok("the device descriptor is complete",
        !!handsDevice.name && typeof handsDevice.build === "function" &&
        typeof handsDevice.defaults === "function" && Array.isArray(handsDevice.observables) &&
        handsDevice.observables.length > 0,
        handsDevice.name);

    const again = await buildHands({ mode: "rigid" });
    ok("the same fixture gives the same numbers -- there is no RNG anywhere in this device",
        again.rigidDisagreements === rigid.rigidDisagreements && again.posesSwept === rigid.posesSwept &&
        again.twoHandSpreadDrift === rigid.twoHandSpreadDrift,
        "the hand is built from fixed angles and segment lengths, so an unseeded run is not a risk here -- " +
        "stated rather than assumed, because v3729 shipped a fixture that WAS random and did not say so");

    ok("each mode carries its OWN claim rather than one claim with a mode label",
        handsDefaults({ mode: "rigid" }).claim.observable === "rigidDisagreements" &&
        handsDefaults({ mode: "scale" }).claim.observable === "pinchScaleDisagreements" &&
        handsDefaults({ mode: "absolutethreshold" }).claim.observable === "pinchScaleDisagreements" &&
        handsDefaults({ mode: "mirror" }).claim.observable === "mirrorMaxDelta" &&
        handsDefaults({ mode: "flatdistance" }).claim.observable === "rigidDisagreements",
        "rigid/flatdistance -> rigidDisagreements <= 0 ; scale AND absolutethreshold -> " +
        "pinchScaleDisagreements <= 0 (which the second VIOLATES, by design) ; mirror -> mirrorMaxDelta <= 0. " +
        "*** v3851 MOVED THE SCALE CLAIM OFF foldScaleDisagreements: that number has been 0 since the fold " +
        "test was written and would stay 0 whatever happened to pinch, so claiming on it made the mode's " +
        "headline the half that was never in doubt. ***");

    ok("the fixtures are EXPORTED, so this gate drives the same hand the device does",
        typeof handPose === "function" && typeof place === "function" && typeof rotate === "function" &&
        typeof classify === "function",
        "two copies of a fixture are two declarations about one experiment that nobody ever compares (v3729)");

    ok("!! ...and what they drive is THE SHIPPED computeHandMetrics, not a copy of it wearing the same shape",
        (() => {
            const lm = place(handPose(POSES.fist));
            const direct = computeHandMetrics([lm]);
            return direct && direct.hands && direct.hands[0] && direct.hands[0].fist === true;
        })(),
        "an import SPECIFIER is what gradedCoverage counts, and a specifier can be satisfied without the " +
        "function ever being called -- the shipped one classifies this gate's own fist fixture");
}

report("WHAT THIS DOES NOT CLAIM",
    "That face/MediaPipeHandTracker.js is correct. The MediaPipe landmarker, the webcam lifecycle, the preview " +
    "canvas and the whole start()/stop() path are UNGRADED and ungradeable without a camera -- this device " +
    "grades computeHandMetrics, the one exported pure function, which is also the only part three consuming " +
    "files actually read. gradedCoverage moves by ONE MODULE and the honest reading of that is 'this module " +
    "now has a key', not 'this module is verified'.");
report("AND WHAT IT DOES NOT CLAIM ABOUT barehands",
    "That anything here reaches jaredrhod/barehands. Nothing imports, vendors or executes it. It supplied the " +
    "GESTURE CONTRACT -- tap, pinch-drag, hold-to-rotate, two-hand scale, claw -- which is what named the " +
    "invariances worth grading; its AGPL-3.0 code and its Python/three.js architecture stay on its own side.");

console.log("\nhandsBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
