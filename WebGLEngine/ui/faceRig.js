// WebGLEngine/ui/faceRig.js -- v3117
//
// THE RIGGED HEAD, DRIVEN BY THE WHOLE FACE.
//
// v3114 wired blendshapes to the little SVG robot: jawOpen -> mouth, a smile -> "cheer". Two channels out of
// fifty-two, because two is all the robot has. thead.html is a different proposition -- a hinged jaw, tilting
// brows, scaling eyes and a curving mouth, all continuous -- and until v3117 THE ONLY WAY IN WAS FIVE NAMED
// MOODS. A face has no moods. It has coefficients.
//
// SO THE HEAD GAINED channels(), AND THIS IS THE ONE OWNER THAT FILLS IT. Same rule as ui/faceExpression.js and
// ui/knownState.js and ui/brainWiring.js before them: written as a module on the first line, because the last
// three times a judgement like this was written inline it had to be extracted a round later.
//
// *** THE FAILURE IS WORSE HERE THAN ANYWHERE IT HAS BEEN BEFORE. *** When the face is lost, every coefficient
// stops arriving. Mapped naively that is brow 0, curve 0, eye 1, jaw 0 -- A PERFECTLY COMPOSED NEUTRAL FACE.
// The robot's version of this bug looked like a calm robot; the HEAD's version looks like a person choosing to
// be still, which is more convincing and therefore a worse lie. That is why losing the signal changes the WIRE
// COLOUR rather than the pose: a face can be calm, but no face is amber.
//
// WHAT IS DELIBERATELY NOT MAPPED. MediaPipe emits ~52 coefficients and this rig has five channels. The
// temptation is to average lots of inputs into each one -- more inputs "using more of the data" -- and it is
// wrong: cheekPuff and noseSneer folded into a brow tilt make the brow move for reasons a viewer cannot read,
// which is noise wearing the costume of detail. EACH CHANNEL TAKES THE FEWEST COEFFICIENTS THAT GENUINELY
// DRIVE IT, and the rest are left alone until there is somewhere honest to put them.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** NAMED lookup. Category ORDER is a property of the model file -- an index would silently remap on a model update. */
function score(bs, name) {
    if (!bs || !Array.isArray(bs.categories)) return null;
    for (const c of bs.categories) if (c && c.categoryName === name) return Number(c.score) || 0;
    return null;
}
/** Both sides or nothing: one side alone is a tracking artifact, not an expression. */
function pair(bs, l, r) {
    const a = score(bs, l), b = score(bs, r);
    return (a == null || b == null) ? null : (a + b) / 2;
}

/**
 * Map a MediaPipe blendshape set onto the head's five channels.
 * Exported separately from the driver so it can be tested without a head, a camera or a browser.
 */
export function mapBlendShapes(bs) {
    const jaw = score(bs, "jawOpen");
    const smile = pair(bs, "mouthSmileLeft", "mouthSmileRight");
    const frown = pair(bs, "mouthFrownLeft", "mouthFrownRight");
    const browUp = score(bs, "browInnerUp");
    const browDn = pair(bs, "browDownLeft", "browDownRight");
    const blink = pair(bs, "eyeBlinkLeft", "eyeBlinkRight");
    const wide = pair(bs, "eyeWideLeft", "eyeWideRight");
    const pucker = score(bs, "mouthPucker");
    const funnel = score(bs, "mouthFunnel");

    return {
        jaw: jaw == null ? 0 : clamp(jaw, 0, 1),
        // SIGNED, from the DIFFERENCE of two opposing groups. Smile and frown both being high is a face caught
        // mid-change, and the difference is the honest answer -- taking the max would make it flicker between
        // two poses at every frame where they cross.
        mouthCurve: (smile == null && frown == null) ? 0 : clamp((smile || 0) - (frown || 0), -1, 1),
        brow: (browUp == null && browDn == null) ? 0 : clamp(((browUp || 0) - (browDn || 0)) * 0.4, -0.4, 0.4),
        // A BLINK CLOSES THE EYE, so it SUBTRACTS. Reading blink as "eye activity" and opening the eye on it --
        // an easy mistake, since the coefficient rises when the eye shuts -- would invert the whole channel.
        eye: clamp(1 + (wide || 0) * 0.3 - (blink || 0) * 0.35, 0.6, 1.4),
        o: Math.max(pucker || 0, funnel || 0) > 0.5,
    };
}

/** Head pose from the 4x4 transform the tracker already computes and nothing has ever read. */
export function mapHeadPose(matrix) {
    if (!matrix || !matrix.data || matrix.data.length < 16) return null;
    const m = matrix.data;
    // Yaw and pitch from the rotation basis. Roll is available and is NOT used: the rig has no roll, and
    // inventing one from a channel the head cannot show would be a number with nowhere to go.
    return { yaw: clamp(Math.atan2(-m[2], m[0]), -1, 1), pitch: clamp(Math.asin(clamp(m[6], -1, 1)), -1, 1) };
}

/**
 * Drive window.sweKHead (or any object with channels/signalLost/look) from a tracker.
 * @returns { stop, state } -- state is "live" | "noface" | "unavailable", the same vocabulary as v3114.
 */
export function attachFaceRig(head, tracker, opts = {}) {
    const hz = opts.hz || 15;                  // the RIG does not need detect rate; the tracker already runs hot
    let timer = null, state = null;

    const setState = (next) => {
        if (next === state) return;
        state = next;
        // SIGNAL LOST IS NOT AN EXPRESSION -- see the header. The colour says it; the pose never could.
        try { head.signalLost(next !== "live"); } catch {}
        if (next !== "live") { try { head.channels(null); } catch {} }
        if (typeof opts.onState === "function") { try { opts.onState(next); } catch {} }
    };

    const tick = () => {
        let snap = null;
        try { snap = tracker && tracker.snapshot ? tracker.snapshot() : null; } catch { snap = null; }
        if (!snap || !snap.active) return setState("unavailable");
        if (!snap.blendShapes) return setState("noface");
        setState("live");
        // v3125 -- TAGGED "face" SO THE AUTHORING GAIN CANNOT REACH IT. A caption saying a line is loud must
        // not exaggerate a real jaw; measured data is ground truth and is never dialled up.
        try { head.channels(mapBlendShapes(snap.blendShapes), "face"); } catch {}
        const pose = mapHeadPose(snap.transform);
        if (pose && typeof head.look === "function") { try { head.look(pose.yaw, pose.pitch); } catch {} }
    };

    timer = setInterval(tick, Math.max(1, Math.round(1000 / hz)));
    tick();
    return {
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
            // Teardown says UNAVAILABLE rather than tidying to neutral -- stopping is not seeing, and a head
            // left composed would be claiming a face nobody is reading.
            setState("unavailable");
            try { head.autoLook(true); } catch {}
        },
        state() { return state; },
    };
}
