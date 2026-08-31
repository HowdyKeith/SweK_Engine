// ui/haptics.mjs -- v4213 -- haptic effects as DATA, and the two incompatible APIs that have to play them.
//
// *** MEASURED BEFORE BUILDING: THIS TREE CONTAINED ZERO HAPTICS. *** No navigator.vibrate, no
// hapticActuators, on any surface. Meanwhile v4212 shipped engine/xrInput.mjs with edge detection on trigger
// and squeeze and NO WAY TO ANSWER A PRESS, and phone.html is a touch UI on a device that has had a vibrator
// since 2010.
//
// Idea from lochie/web-haptics (MIT), the way ui/springMotion.js took its idea from sileo and
// ui/domAnimation.mjs took its idea from animatelo: THE VOCABULARY IS THE VALUABLE PART, not the library.
// web-haptics ships React/Vue/Svelte bindings; this tree ships none of those frameworks. What survives the
// translation is the observation that "success", "warning" and "impact" are NAMED, REUSABLE PATTERNS rather
// than magic numbers sprinkled at call sites.
//
// *** THE FINDING THAT MAKES THIS MORE THAN A TABLE OF NUMBERS: THE TWO PLAYBACK APIS DO NOT AGREE ABOUT
// WHAT A HAPTIC IS, AND NEITHER CAN EXPRESS THE OTHER. ***
//
//   navigator.vibrate(pattern)  takes an ARRAY OF MILLISECONDS that alternates on, off, on, off...
//                               IT HAS NO INTENSITY AT ALL. Every buzz is full strength.
//   XR hapticActuator.pulse(intensity, duration)   takes ONE pulse with an intensity in 0..1.
//                               IT HAS NO RHYTHM AT ALL. One call is one buzz.
//
// So a single vocabulary has to survive being flattened in two DIFFERENT lossy directions: toward vibrate()
// the intensities are lost, and toward pulse() the rhythm has to be rebuilt as a SCHEDULE of separately timed
// calls, because a loop of pulse() calls does not queue -- each one supersedes the last and you feel only the
// final buzz. Both conversions are pure functions here, so the gate can prove what each one loses instead of
// the loss being discovered on a device.
//
// This module has NO navigator, NO DOM and NO timers. ui/hapticsPlay.js is the wiring.

/**
 * An effect is a list of STEPS. Each step is a buzz of `intensity` (0..1) for `ms`, followed by `gap` ms of
 * silence. Intensity is carried even though navigator.vibrate cannot use it, because the XR path can -- a
 * vocabulary that only described what the weaker API supports would be permanently limited by it.
 */
export const EFFECTS = Object.freeze({
    // A single, very short tick. The most-used effect by far: list scrolling, a value snapping to a detent.
    selection:     [{ intensity: 0.35, ms: 10, gap: 0 }],
    // Impacts differ in WEIGHT, which is intensity and duration together -- a heavier impact is not merely a
    // longer one, and modelling it as duration alone is what makes synthetic haptics feel like buzzing.
    impactLight:   [{ intensity: 0.35, ms: 12, gap: 0 }],
    impactMedium:  [{ intensity: 0.60, ms: 18, gap: 0 }],
    impactHeavy:   [{ intensity: 1.00, ms: 26, gap: 0 }],
    // Notifications are RHYTHMS. Two rising taps read as "done"; three sharp ones read as "no".
    success:       [{ intensity: 0.45, ms: 14, gap: 70 }, { intensity: 0.85, ms: 22, gap: 0 }],
    warning:       [{ intensity: 0.70, ms: 20, gap: 90 }, { intensity: 0.70, ms: 20, gap: 0 }],
    error:         [{ intensity: 1.00, ms: 16, gap: 55 }, { intensity: 1.00, ms: 16, gap: 55 }, { intensity: 1.00, ms: 30, gap: 0 }],
    // VR-specific: the answer to a trigger pull, and to picking something up.
    trigger:       [{ intensity: 0.50, ms: 14, gap: 0 }],
    grab:          [{ intensity: 0.75, ms: 30, gap: 0 }],
    release:       [{ intensity: 0.30, ms: 12, gap: 0 }],
});

export const NAMES = Object.freeze(Object.keys(EFFECTS));

/**
 * OUR ceiling, not a browser's.
 *
 * Browsers do cap vibration, but the caps differ and are not something this file can measure, so no number is
 * claimed on their behalf. This limit exists for a different and checkable reason: HAPTIC FEEDBACK THAT
 * OUTLASTS THE ACTION IT ANSWERS STOPS BEING FEEDBACK AND BECOMES A NOTIFICATION. Anything past about a
 * second is a buzzing phone, not a tap. The gate asserts every shipped effect is inside it.
 */
export const MAX_TOTAL_MS = 1000;

/** Total wall-clock length of an effect, gaps included but a trailing gap ignored (it is silence at the end). */
export function durationOf(steps) {
    if (!Array.isArray(steps) || !steps.length) return 0;
    let total = 0;
    for (let i = 0; i < steps.length; i++) {
        total += Math.max(0, steps[i].ms || 0);
        if (i < steps.length - 1) total += Math.max(0, steps[i].gap || 0);
    }
    return total;
}

/**
 * Is this a well-formed effect? Returns a list of problems, empty when fine.
 * Separated from the table so a CALLER's ad-hoc effect gets the same checking the built-ins do.
 */
export function validateEffect(steps) {
    const problems = [];
    if (!Array.isArray(steps) || steps.length === 0) return ["an effect must be a non-empty array of steps"];
    steps.forEach((s, i) => {
        if (!s || typeof s !== "object") { problems.push(`step ${i} is not an object`); return; }
        if (!(s.ms > 0)) problems.push(`step ${i} has no positive ms`);
        if (!(s.intensity >= 0 && s.intensity <= 1)) problems.push(`step ${i} intensity ${s.intensity} is outside 0..1`);
        if (s.gap != null && !(s.gap >= 0)) problems.push(`step ${i} has a negative gap`);
    });
    const total = durationOf(steps);
    if (total > MAX_TOTAL_MS) problems.push(`total ${total}ms exceeds MAX_TOTAL_MS ${MAX_TOTAL_MS}`);
    // A trailing gap is silence after the last buzz: it delays nothing and confuses durationOf's readers.
    if (steps.length && steps[steps.length - 1].gap) problems.push("the last step has a trailing gap, which is silence nobody waits for");
    return problems;
}

/**
 * ---- LOSSY DIRECTION ONE: toward navigator.vibrate ---------------------------------------------------------
 *
 * Returns [onMs, offMs, onMs, offMs, ...]. *** INDEX PARITY IS THE WHOLE CONTRACT AND IT IS EASY TO INVERT: ***
 * even indices vibrate, odd indices pause. A pattern built one element out of phase does not fail, it plays
 * the RHYTHM INSIDE OUT -- the gaps buzz and the buzzes are silent -- which on a device reads as "the haptics
 * feel wrong" and is almost impossible to debug by feel.
 *
 * The array ENDS ON A BUZZ. A trailing pause is time the browser spends doing nothing while the caller waits.
 *
 * INTENSITY IS DISCARDED HERE, and that is not a bug to be fixed later: the Vibration API has no intensity.
 * A caller that needs the difference between a light and a heavy tap on a phone has to express it in DURATION,
 * which is why the impact effects differ in both.
 */
export function toVibratePattern(steps) {
    const out = [];
    for (let i = 0; i < steps.length; i++) {
        out.push(Math.max(0, Math.round(steps[i].ms || 0)));
        const gap = Math.max(0, Math.round(steps[i].gap || 0));
        if (i < steps.length - 1) out.push(gap);
    }
    return out;
}

/**
 * ---- LOSSY DIRECTION TWO: toward XR hapticActuator.pulse ---------------------------------------------------
 *
 * Returns [{ at, intensity, ms }, ...] -- a SCHEDULE, with `at` in milliseconds from the start.
 *
 * *** A LOOP OF pulse() CALLS DOES NOT QUEUE. *** Each call supersedes the one before, so firing three pulses
 * in a row plays exactly one buzz -- the last -- and the rhythm is silently gone. The rhythm has to be rebuilt
 * as separately timed calls, which is what `at` is for. This is the direction where the naive implementation
 * is not merely lossy but produces a plausible-looking wrong result: it runs, it buzzes, and it is wrong.
 */
export function toPulseSchedule(steps) {
    const out = [];
    let at = 0;
    for (let i = 0; i < steps.length; i++) {
        const ms = Math.max(0, steps[i].ms || 0);
        out.push({ at, intensity: Math.min(1, Math.max(0, steps[i].intensity ?? 1)), ms });
        at += ms + (i < steps.length - 1 ? Math.max(0, steps[i].gap || 0) : 0);
    }
    return out;
}

/** Look an effect up by name. Unknown names return null rather than a default buzz -- see hapticsPlay.js. */
export function effect(name) {
    return Object.prototype.hasOwnProperty.call(EFFECTS, name) ? EFFECTS[name] : null;
}

/**
 * Scale an effect's intensity, for a global "haptic strength" setting.
 * Durations are NOT scaled: shortening a buzz to make it weaker changes what it MEANS (a short heavy tap and
 * a long light one are different signals), and on the vibrate path -- which has no intensity -- scaling
 * duration would be the only visible effect, so a strength slider would silently become a speed slider.
 */
export function scaleIntensity(steps, k) {
    const f = Math.min(1, Math.max(0, k));
    return steps.map((s) => ({ ...s, intensity: Math.min(1, Math.max(0, (s.intensity ?? 1) * f)) }));
}

export default { EFFECTS, NAMES, MAX_TOTAL_MS, durationOf, validateEffect, toVibratePattern, toPulseSchedule, effect, scaleIntensity };
