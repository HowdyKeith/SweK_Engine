// WebGLEngine/ui/faceExpression.js -- v3114
//
// THE BLENDSHAPES WERE ALREADY BEING COMPUTED AND NOTHING READ THEM.
//
// face/MediaPipeFaceTracker.js has always passed outputFaceBlendshapes and always exposed blendShapes on its
// snapshot. Nothing in the tree consumed them. That is v3104's shape exactly -- the answer sitting in the
// variable while the next line reaches past it -- and here the cost is already paid: the coefficients come back
// from every detect whether or not anybody looks.
//
// face-mirror.html draws a 2D canvas mirror. The SweK robot is a separate surface driven by brainWiring. This
// module is the ONE OWNER that joins them, written as a module from the start because v3112 hand-rolled the
// same kind of guard twice and v3113 had to extract it.
//
// *** FACE-UNKNOWN AND BRIDGE-UNKNOWN ARE DIFFERENT UNKNOWNS. ***
//
// The robot already has brainUnknown, and reusing it here would be the two-things-one-label shape this tree
// keeps paying for. "The roundhouse is unreachable" and "the camera cannot see you" are separate facts with
// separate fixes -- one sends you to the server, the other to the lighting. So this module NEVER touches the
// brain classes and marks its own state on the element instead.
//
// AND A LOST FACE MUST NOT READ AS A CALM ONE. If the tracker stops, or the user steps out of frame, every
// blendshape simply stops arriving -- which, mapped naively, is a face with a closed mouth and no smile. That
// is indistinguishable from someone sitting still, and it is v3093's law in a new place: A SURFACE THAT CANNOT
// SEE MUST SAY SO, not fall back to the most innocent-looking value in its range.
//
// WHAT IT DELIBERATELY DOES NOT DO: no smoothing across the unknown boundary, and no "last known expression"
// held while the face is gone. A stale expression shown as current is the same lie v3113 refused to cache.

/** MediaPipe returns [{ categoryName, score }]. NAMED lookup, never an index: the category ORDER is a property
 *  of the model file, and a model update that reorders them would silently remap every expression. */
function score(blendShapes, name) {
    if (!blendShapes || !Array.isArray(blendShapes.categories)) return null;
    for (const c of blendShapes.categories) if (c && c.categoryName === name) return Number(c.score) || 0;
    return null;
}

/** Average of the two sides, or null if either is missing -- a one-sided smile is a tracking artifact. */
function pair(blendShapes, left, right) {
    const a = score(blendShapes, left), b = score(blendShapes, right);
    if (a == null || b == null) return null;
    return (a + b) / 2;
}

export const FACE_STATES = ["live", "noface", "unavailable"];

/**
 * Drive a SweK robot from a face tracker's blendshapes.
 *
 * @param bot      the object from createSwekRobot()
 * @param tracker  anything with snapshot() -> { active, blendShapes }
 * @param opts     { hz, jawOpen, smile, onState }
 * @returns        { stop, state }
 */
export function attachFaceExpression(bot, tracker, opts = {}) {
    const hz = opts.hz || 12;                       // the ROBOT does not need 60Hz; the tracker already runs hot
    const JAW = opts.jawOpen != null ? opts.jawOpen : 0.35;
    // TWO thresholds, not one. A single threshold on a noisy continuous signal flickers on every frame that
    // lands near it -- the smile would strobe. Rise high, fall low.
    const SMILE_ON = opts.smile != null ? opts.smile : 0.45, SMILE_OFF = SMILE_ON - 0.15;
    const el = bot && bot.el;
    let timer = null, smiling = false, state = null;

    const setState = (next) => {
        if (next === state) return;
        state = next;
        if (el) el.dataset.face = next;
        // NEVER the brain classes. Those belong to brainWiring and mean something else entirely.
        if (el && el.classList) el.classList.toggle("faceUnknown", next !== "live");
        if (typeof opts.onState === "function") { try { opts.onState(next); } catch {} }
    };

    const tick = () => {
        let snap = null;
        try { snap = tracker && tracker.snapshot ? tracker.snapshot() : null; } catch { snap = null; }

        if (!snap || !snap.active) { setState("unavailable"); return; }      // tracker off or thrown
        const bs = snap.blendShapes;
        if (!bs) { setState("noface"); return; }                            // running, nobody in frame

        setState("live");
        // jawOpen -> the mouth the robot already has. Continuous, and the one unambiguous mapping in the set.
        const jaw = score(bs, "jawOpen");
        if (jaw != null && el && el.classList) el.classList.toggle("mouthOpen", jaw >= JAW);

        // smile -> cheer, with hysteresis and edge-triggering, because play() is a one-shot animation and
        // re-firing it every tick would restart it forever.
        const sm = pair(bs, "mouthSmileLeft", "mouthSmileRight");
        if (sm != null) {
            if (!smiling && sm >= SMILE_ON) { smiling = true; try { bot.play("cheer", 1600); } catch {} }
            else if (smiling && sm <= SMILE_OFF) { smiling = false; }
        }
    };

    timer = setInterval(tick, Math.max(1, Math.round(1000 / hz)));
    tick();
    return {
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
            // STOPPING IS NOT SEEING. Leaving the robot mid-expression would claim a face that is no longer
            // being read, so teardown says unavailable rather than tidying back to neutral.
            setState("unavailable");
            if (el && el.classList) el.classList.remove("mouthOpen");
        },
        state() { return state; },
    };
}
