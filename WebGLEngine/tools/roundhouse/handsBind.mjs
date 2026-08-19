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
// *** SO "TAP" AND "PINCH-DRAG", barehands' TWO MOST-USED GESTURES, HAVE A WORKING VOLUME AND NOTHING IN THE
// MODULE SAYS SO. *** Lean back far enough and a closed fist crosses the pinch threshold on its own. This is
// REPORTED AND NOT CALLED A DEFECT: an absolute threshold on a normalized coordinate is a legitimate design
// with an undocumented precondition, and the fix (scale the threshold by a hand-span landmark distance) is a
// change to shipped behaviour that is not this round's to make. IT IS MEASURED SO IT CAN BE DECIDED.
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

export const HANDS_MODES = ["rigid", "scale", "mirror", "flatdistance"];

export const HANDS_OBSERVABLES = [
    "rigidDisagreements", "rotationDisagreements", "translationDisagreements",
    "outOfPlaneDisagreements", "inPlaneDisagreements", "posesSwept", "twoHandSpreadDrift",
    "foldScaleDisagreements", "pinchCriticalScale", "pinchHomogeneityErr", "pinchFlipsAtCritical",
    "scalesSwept", "mirrorMaxDelta", "mirrorPoses",
    "poses", "kind",
];

const DEF = { rotDeg: 40, rotStep: 5, span: 0.2, pinchThreshold: 0.06 };

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
    h.config = c;
    // *** THE VALIDATOR MUST LIST THE PLANT MODE. *** If `flatdistance` silently reverted to `rigid`, both arms
    // would read an identical number and the plant would fire at nothing -- v3806's lesson on flip2d, repeated
    // at v3845 on flip3d, and the only reason it was caught either time was that the two numbers matched to
    // every digit. It is cheaper to list the mode than to notice that.
    if (!HANDS_MODES.includes(h.mode)) h.mode = "rigid";
    if (!h.claim || !h.claim.observable) {
        h.claim =
            (h.mode === "rigid" || h.mode === "flatdistance") ? { observable: "rigidDisagreements", max: 0 } :
            h.mode === "scale" ? { observable: "foldScaleDisagreements", max: 0 } :
                                 { observable: "mirrorMaxDelta", max: 0 };
    }
    return h;
}

export async function buildHands(hyp, base = {}) {
    const h = handsDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config;
    // BOTH ARMS SHARE EVERY OTHER SETTING. The plant is one flag on the metric function; the fixture, the
    // sweep and the reference are byte-for-byte the same, which is what makes the comparison about the module.
    const flat = h.mode === "flatdistance";
    const opts = flat ? { flatDistance: true, pinchThreshold: c.pinchThreshold }
                      : { pinchThreshold: c.pinchThreshold };
    const metrics = (lm) => computeHandMetrics([lm], null, opts);

    if (h.mode === "rigid" || h.mode === "flatdistance") {
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
        };
    }

    if (h.mode === "scale") {
        const scales = [0.5, 0.6, 0.75, 0.9, 1.25, 1.5, 2, 3];
        let foldDis = 0, n = 0, homogErr = 0, flips = 0;
        let critical = 0;
        for (const name of POSE_NAMES) {
            const pose = handPose(POSES[name]);
            const ref = classify(metrics(place(pose)));
            const d1 = metrics(place(pose)).hands[0].pinch.distance;
            for (const s of scales) {
                n++;
                const cl = classify(metrics(place(pose, { s })));
                // the FOLD FAMILY only -- the first seven bits. pinch.active is deliberately excluded here:
                // it is the observable this mode exists to show is NOT scale-invariant.
                for (let i = 0; i < 7; i++) if (cl[i] !== ref[i]) foldDis++;
                const ds = metrics(place(pose, { s })).hands[0].pinch.distance;
                homogErr = Math.max(homogErr, Math.abs(ds - s * d1) / (s * d1));
            }
            // s* is DERIVED from the homogeneity, then VERIFIED to flip on either side of itself.
            const sStar = c.pinchThreshold / d1;
            if (name === "fist") critical = sStar;
            const below = metrics(place(pose, { s: sStar * 0.999 })).hands[0].pinch.active;
            const above = metrics(place(pose, { s: sStar * 1.001 })).hands[0].pinch.active;
            if (below === true && above === false) flips++;
        }
        return {
            kind: "scale",
            foldScaleDisagreements: foldDis, scalesSwept: n,
            pinchHomogeneityErr: homogErr, pinchCriticalScale: critical,
            pinchFlipsAtCritical: flips, poses: POSE_NAMES.length,
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
    plantMode: "flatdistance", plantFlips: "rigidDisagreements", plantKind: "mode",
    name: "hands-gesture-invariance",
    observables: HANDS_OBSERVABLES,
    build: buildHands,
    defaults: handsDefaults,
};

// ---- front door ------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
    const rigid = await buildHands({ mode: "rigid" });
    const flat = await buildHands({ mode: "flatdistance" });
    const scale = await buildHands({ mode: "scale" });
    const mir = await buildHands({ mode: "mirror" });
    console.log("[hands] THE GESTURE LAYER -- barehands' vocabulary as an answer key for computeHandMetrics\n");
    console.log("  RIGID (what 'pinch-drag' and 'hold while carrying to rotate' silently require)");
    console.log(`    rotation ${rigid.rotationDisagreements}, translation ${rigid.translationDisagreements}` +
        ` over ${rigid.posesSwept} poses -- EXACTLY zero, not small. A rigid motion preserves both distances`);
    console.log("    the fold test compares, so the verdict cannot turn over.");
    console.log(`    two-hand spread drift ${rigid.twoHandSpreadDrift.toExponential(2)} (REPORTED: a hypot carries roundoff)`);
    console.log("\n  SCALE -- the honest negative, and it lands on barehands' two most-used gestures");
    console.log(`    fold family ${scale.foldScaleDisagreements} disagreements over ${scale.scalesSwept} scales (a RATIO test: invariant)`);
    console.log(`    pinch.distance homogeneous to ${scale.pinchHomogeneityErr.toExponential(2)}, and ${scale.pinchFlipsAtCritical}/${scale.poses} poses`);
    console.log(`    flip at their own derived s* = threshold/d(1). A FIST BECOMES A PINCH below s*=${scale.pinchCriticalScale.toFixed(4)}.`);
    console.log("\n  MIRROR");
    console.log(`    max delta ${mir.mirrorMaxDelta} across ${mir.mirrorPoses} poses`);
    console.log("\n  THE PLANT -- _dist3D drops its z term, and FOUR OF FIVE TRANSFORM FAMILIES CANNOT SEE IT");
    console.log(`    rigidDisagreements ${rigid.rigidDisagreements} -> ${flat.rigidDisagreements}` +
        `   out-of-plane ${flat.outOfPlaneDisagreements}, IN-PLANE ROLL ${flat.inPlaneDisagreements}`);
    console.log("    In-plane roll is blind BY CONSTRUCTION: a 2D metric is exactly invariant under rotation in");
    console.log("    the image plane. Rolling your hand at the camera -- the first thing anyone tries -- can");
    console.log("    never detect a missing third dimension. Only tilting toward or away from it can.");
}
