// WebGLEngine/ui/faceExpressionSet.js -- v4110
//
// A NAMED EXPRESSION, NOT TWO BOOLEANS -- THE SHARED PRIMITIVE BEHIND EVERY "WHAT FACE IS THIS" CONSUMER.
//
// v3114's ui/faceExpression.js reads exactly TWO signals (jawOpen -> mouth, smile -> cheer) and wires them
// straight onto one robot. That was right for what it was for, and it is not a classifier: there is no way to
// ask it "which expression is this" and get an answer with a name. Keith wants cat reactions mapped to
// expressions, and the same question again for an avatar mirror -- THREE CONSUMERS OF ONE JUDGEMENT. Writing
// the recipes a third time in a third page is the second-copy defect this tree keeps paying for, so the
// judgement lives here, once, as a PURE FUNCTION over blendshapes.
//
// *** PURE ON PURPOSE, AND THAT IS WHAT MAKES IT GATEABLE. *** classify() takes a blendshape bag and returns a
// verdict. No camera, no DOM, no timers. So its gate drives every expression to its face with synthetic
// coefficients and never needs a browser or a webcam -- which is the only way a claim like "a sneer is not
// read as a smile" can be CHECKED rather than asserted.
//
// *** THE NAMES ARE QUOTED FROM MEDIAPIPE'S OWN SOURCE, NOT REMEMBERED. *** kBlendshapeNames in
// mediapipe/tasks/cc/vision/face_landmarker/face_blendshapes_graph.cc, fetched and read this round. That
// mattered immediately, see REFUSED below.
//
// *** WHAT THIS REFUSES TO DETECT, AND WHY THE REFUSAL IS THE FINDING. ***
// The feature request came from reading MeowCV (reinesana/MeowCV, MIT), which detects "shock, tongue, and
// glare". SHOCK AND GLARE MAP CLEANLY ONTO REAL BLENDSHAPES. *** TONGUE DOES NOT EXIST IN MEDIAPIPE'S SET AT
// ALL. *** ARKit's 52 include tongueOut; MediaPipe's 52 spend that slot on `_neutral` instead and stop at
// noseSneerRight -- I counted the quoted list, it is exactly 52 with no tongue anywhere in it. MeowCV gets its
// tongue from LANDMARK GEOMETRY (its README says "lightweight geometric algorithms"), a different input than
// this module takes. So tongue is REFUSED HERE BY NAME rather than approximated: an inner-lip-gap heuristic
// dressed up as "tongue" would be a detector that fires on a wide-open mouth and calls it something else, and
// v2579's rule is that a flag which lies is worse than no flag. The refusal is DATA (REFUSED below), not a
// sentence in a comment, so a consumer can show it and a gate can check it is still honest.
"use strict";

/**
 * MediaPipe Face Landmarker's blendshape category names, verbatim from kBlendshapeNames. Exported so a
 * consumer -- and the gate -- can check a recipe against the REAL vocabulary instead of a plausible-looking
 * string. A typo'd blendshape name silently scores null forever, which reads as "that expression never
 * happens" and is invisible without this list to check against.
 */
export const BLENDSHAPE_NAMES = [
    "_neutral", "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
    "cheekPuff", "cheekSquintLeft", "cheekSquintRight", "eyeBlinkLeft", "eyeBlinkRight",
    "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft",
    "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
    "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen", "jawRight", "mouthClose",
    "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel",
    "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight",
    "mouthPucker", "mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower",
    "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight",
    "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight",
];

/**
 * Expressions this module will NOT claim, each with the reason. Exported as data so a page can SHOW the gap
 * rather than silently lacking the feature, and so a gate can assert the reason still holds.
 */
export const REFUSED = [
    {
        name: "tongue",
        why: "MediaPipe's blendshape set has no tongueOut -- ARKit does, MediaPipe spends that slot on " +
             "_neutral. Detecting it from an inner-lip gap would fire on any wide-open mouth and call it a " +
             "tongue, which is a detector that lies rather than one that is missing.",
        wouldNeed: "face-mesh landmark geometry (a different input than this module takes), and even then " +
                   "the mesh has no tongue vertices to measure",
    },
];

/** One category's score, by NAME. Never by index: the order is a property of the model file. */
export function score(blendShapes, name) {
    if (!blendShapes || !Array.isArray(blendShapes.categories)) return null;
    for (const c of blendShapes.categories) if (c && c.categoryName === name) return Number(c.score) || 0;
    return null;
}

/**
 * Average of a left/right pair, or null if EITHER side is missing. A one-sided reading is a tracking artifact
 * -- faceExpression.js's own rule, kept identical here rather than re-decided.
 */
export function pair(blendShapes, left, right) {
    const a = score(blendShapes, left), b = score(blendShapes, right);
    if (a == null || b == null) return null;
    return (a + b) / 2;
}

/** A signal is either a single name or an [left, right] pair; resolve it to one number or null. */
function signal(bs, ref) {
    return Array.isArray(ref) ? pair(bs, ref[0], ref[1]) : score(bs, ref);
}

/**
 * *** THE RECIPES. *** Each expression is `all` (every signal must clear its threshold -- the expression's
 * score is the WEAKEST of them, so a recipe is only as strong as its least-present part) and optionally `not`
 * (signals that must stay BELOW a ceiling, which is what stops near-neighbours colliding).
 *
 * The `not` clauses are not decoration. smile and glare share no signals, but SNEER and SMILE both raise the
 * mouth corners, and SHOCK and SAD both raise the inner brow -- without a ceiling each pair reads as the
 * other at the wrong moment. Each one below is there because the two expressions it separates are genuinely
 * confusable, and the gate drives exactly those confusions.
 */
export const RECIPES = [
    {
        name: "smile", emoji: "\u{1F63A}",
        all: [{ ref: ["mouthSmileLeft", "mouthSmileRight"], min: 0.40 }],
        not: [{ ref: ["browDownLeft", "browDownRight"], max: 0.55 }],
        note: "mouth corners up, and not scowling while doing it",
    },
    {
        name: "shock", emoji: "\u{1F640}",
        all: [
            { ref: ["eyeWideLeft", "eyeWideRight"], min: 0.30 },
            { ref: "jawOpen", min: 0.35 },
        ],
        not: [{ ref: ["mouthSmileLeft", "mouthSmileRight"], max: 0.45 }],
        note: "eyes wide AND jaw dropped -- either alone is ordinary; a wide-eyed grin is a smile, not a shock",
    },
    {
        name: "glare", emoji: "\u{1F63C}",
        all: [
            { ref: ["eyeSquintLeft", "eyeSquintRight"], min: 0.35 },
            { ref: ["browDownLeft", "browDownRight"], min: 0.35 },
        ],
        not: [{ ref: ["mouthSmileLeft", "mouthSmileRight"], max: 0.40 }],
        note: "narrowed eyes under a lowered brow -- the smile ceiling is what separates a glare from a squinty laugh",
    },
    {
        name: "angry", emoji: "\u{1F63E}",
        all: [
            { ref: ["browDownLeft", "browDownRight"], min: 0.45 },
            { ref: ["noseSneerLeft", "noseSneerRight"], min: 0.25 },
        ],
        not: [{ ref: ["mouthSmileLeft", "mouthSmileRight"], max: 0.40 }],
        note: "brow down WITH a sneer -- brow-down alone is concentration, which is not anger",
    },
    {
        name: "sad", emoji: "\u{1F63F}",
        all: [
            { ref: ["mouthFrownLeft", "mouthFrownRight"], min: 0.30 },
            { ref: "browInnerUp", min: 0.30 },
        ],
        not: [{ ref: "jawOpen", max: 0.45 }],
        note: "corners down and inner brow up -- the jaw ceiling keeps a dropped-jaw shock out of this bucket",
    },
    {
        name: "kiss", emoji: "\u{1F63D}",
        all: [{ ref: "mouthPucker", min: 0.50 }],
        not: [{ ref: "jawOpen", max: 0.35 }],
        note: "pucker without an open jaw -- an open pucker is a funnel (talking), not a kiss",
    },
    {
        name: "puff", emoji: "\u{1F638}",
        all: [{ ref: "cheekPuff", min: 0.35 }],
        note: "cheeks out; no near-neighbour needs excluding, so no ceiling is invented for one",
    },
    {
        name: "wink", emoji: "\u{1F63B}",
        // Deliberately NOT a pair(): a wink is the ASYMMETRY, so this recipe reads each eye on its own and the
        // scorer below handles the xor. Expressed as a custom test because no min/max on an average can say
        // "one but not both" -- and averaging is exactly what would turn a wink into a half-scored blink.
        custom: (bs) => {
            const l = score(bs, "eyeBlinkLeft"), r = score(bs, "eyeBlinkRight");
            if (l == null || r == null) return null;
            const hi = Math.max(l, r), lo = Math.min(l, r);
            if (hi < 0.50 || lo > 0.25) return 0;      // both open, or both shut = a blink, not a wink
            return hi - lo;                             // the asymmetry itself IS the confidence
        },
        note: "one eye shut while the other stays open -- the asymmetry is the signal, so it cannot be a pair average",
    },
];

/** The expression when nothing else clears its bar. Named so a consumer never has to test for null. */
export const NEUTRAL = "neutral";

/**
 * Score ONE recipe. Returns null when a signal it needs is absent (unknown, NOT zero -- a missing category
 * means the model did not report it, which is a different fact from "the muscle is at rest"), 0 when a bar is
 * not cleared, and the weakest required signal otherwise.
 */
export function scoreRecipe(recipe, blendShapes) {
    if (recipe.custom) return recipe.custom(blendShapes);
    let weakest = 1;
    for (const need of recipe.all || []) {
        const v = signal(blendShapes, need.ref);
        if (v == null) return null;                      // cannot judge this expression at all
        if (v < need.min) return 0;                      // bar not cleared
        if (v < weakest) weakest = v;
    }
    for (const veto of recipe.not || []) {
        const v = signal(blendShapes, veto.ref);
        if (v == null) return null;
        if (v > veto.max) return 0;                      // a near-neighbour is louder; this is not it
    }
    return weakest;
}

/**
 * *** THE WHOLE JUDGEMENT, IN ONE PURE CALL. *** Returns
 *   { name, score, ranked:[{name,score}...], usable }
 * `usable` is false when the blendshape bag is absent or unreadable -- and in that case name is null rather
 * than "neutral", because A FACE THAT CANNOT BE SEEN IS NOT A CALM FACE. That distinction is v3114's own law
 * ("a lost face must not read as a calm one") and it is why this returns null instead of the innocent value.
 */
export function classify(blendShapes) {
    if (!blendShapes || !Array.isArray(blendShapes.categories) || !blendShapes.categories.length) {
        return { name: null, score: 0, ranked: [], usable: false };
    }
    const ranked = [];
    for (const r of RECIPES) {
        const s = scoreRecipe(r, blendShapes);
        if (s != null && s > 0) ranked.push({ name: r.name, score: s, emoji: r.emoji });
    }
    // Sort by strength, then by recipe order for a stable tie -- an unstable sort would let two equally-scored
    // expressions alternate frame to frame and flicker the consumer.
    ranked.sort((a, b) => (b.score - a.score) || (RECIPES.findIndex((x) => x.name === a.name) - RECIPES.findIndex((x) => x.name === b.name)));
    if (!ranked.length) return { name: NEUTRAL, score: 0, ranked: [], usable: true };
    return { name: ranked[0].name, score: ranked[0].score, ranked, usable: true };
}

/**
 * The stateful wrapper: the same judgement, held still enough to drive a UI.
 *
 * *** TWO SEPARATE STABILISERS, BECAUSE THEY FIX TWO DIFFERENT FLICKERS. *** `enter` is a bar the NEW
 * expression must clear to take over (so a 0.41 smile does not displace a 0.40 smile), and `holdMs` is a floor
 * on how long the current one stays regardless (so a momentary blink mid-smile does not blank the reaction).
 * v3114 used a two-threshold hysteresis for the same reason on one boolean; this is that idea for a set.
 */
export function makeExpressionReader(opts = {}) {
    const enter = opts.enter != null ? opts.enter : 0.05;   // margin the challenger must beat the holder by
    const holdMs = opts.holdMs != null ? opts.holdMs : 600;
    const now = opts.now || (() => Date.now());
    let current = null, currentScore = 0, since = 0, lastUsable = false;

    return {
        /** Feed a blendshape bag; get back the STABLE verdict plus the raw one. */
        read(blendShapes) {
            const raw = classify(blendShapes);
            lastUsable = raw.usable;
            const t = now();
            if (!raw.usable) {
                // Unreadable clears the state outright rather than holding a stale expression: a reaction left
                // on screen after the face is gone is the stale-cache lie v3113 refused.
                current = null; currentScore = 0; since = t;
                return { name: null, score: 0, usable: false, raw };
            }
            if (current === null) { current = raw.name; currentScore = raw.score; since = t; }
            else if (raw.name !== current) {
                const held = t - since;
                if (held >= holdMs && raw.score >= currentScore + enter) { current = raw.name; currentScore = raw.score; since = t; }
            } else { currentScore = raw.score; }
            return { name: current, score: currentScore, usable: true, raw };
        },
        get state() { return { name: current, score: currentScore, usable: lastUsable }; },
        reset() { current = null; currentScore = 0; since = 0; lastUsable = false; },
    };
}
