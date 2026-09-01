#!/usr/bin/env node
// tools/ship/haptics-selfcheck.mjs -- v4213
//
// Run: node tools/ship/haptics-selfcheck.mjs      (no device, no browser)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/haptics.mjs and ui/hapticsPlay.js.
//
// *** MEASURED BEFORE THIS ROUND: THE TREE CONTAINED ZERO HAPTICS. *** No navigator.vibrate, no
// hapticActuator, anywhere -- while v4212 had just shipped engine/xrInput.mjs with edge detection on trigger
// and squeeze and nothing to answer a press with.
//
// THE INTERESTING PART IS NOT THE TABLE OF EFFECTS. IT IS THAT THE TWO PLAYBACK APIS DISAGREE ABOUT WHAT A
// HAPTIC IS, and each conversion loses something different:
//
//   navigator.vibrate(pattern)              an array of ms alternating on/off. NO INTENSITY.
//   hapticActuator.pulse(intensity, ms)     one buzz with an intensity. NO RHYTHM.
//
// Toward vibrate, intensity is discarded -- lossy, but honestly so. Toward pulse, the rhythm must be rebuilt
// as a SCHEDULE, because *** A LOOP OF pulse() CALLS DOES NOT QUEUE: each supersedes the last, so three
// pulses in a row play ONE buzz and the pattern is silently gone. *** That is the direction where the naive
// implementation is not merely lossy but produces a plausible wrong result -- it runs, it buzzes, it is
// wrong -- so it gets the most assertions below.
import {
    EFFECTS, NAMES, MAX_TOTAL_MS, durationOf, validateEffect, toVibratePattern, toPulseSchedule,
    effect, scaleIntensity,
} from "../../ui/haptics.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("haptics-selfcheck -- the vocabulary, and the two APIs that cannot express each other\n");

// ---- 1. EVERY SHIPPED EFFECT IS WELL FORMED ---------------------------------------------------------------
console.log("1. every effect in the table is valid by the same rule a caller's own effect would be");
{
    ok("the table is non-empty", NAMES.length >= 8, NAMES.length + " effects");
    let bad = [];
    for (const n of NAMES) { const p = validateEffect(EFFECTS[n]); if (p.length) bad.push(n + ": " + p.join("; ")); }
    ok("!! *** every built-in effect passes validateEffect -- the table is held to the rule it publishes ***",
        bad.length === 0, bad.join(" | "));
    let longest = 0, longestName = "";
    for (const n of NAMES) { const d = durationOf(EFFECTS[n]); if (d > longest) { longest = d; longestName = n; } }
    ok("!! no effect outlasts MAX_TOTAL_MS -- feedback that outlives the action it answers is a notification, "
       + "not feedback", longest <= MAX_TOTAL_MS, "longest is " + longestName + " at " + longest + "ms of " + MAX_TOTAL_MS);
    ok("...and the longest is comfortably short, not merely inside the limit", longest < 250, longest + "ms");
    ok("unknown names return null rather than a default buzz", effect("nope") === null && effect("success") !== null);
    // A borrowed guard: the limit must be able to REFUSE something, or it is decoration.
    ok("!! MAX_TOTAL_MS actually refuses an over-long effect",
        validateEffect([{ intensity: 1, ms: MAX_TOTAL_MS + 1, gap: 0 }]).some((p) => /MAX_TOTAL_MS/.test(p)));
}

// ---- 2. validateEffect REFUSES THE THINGS IT CLAIMS TO -----------------------------------------------------
console.log("\n2. the validator refuses each malformed shape, so it is a check rather than a formality");
{
    ok("an empty effect is refused", validateEffect([]).length > 0);
    ok("a non-array is refused", validateEffect(null).length > 0 && validateEffect({}).length > 0);
    ok("a zero-length buzz is refused", validateEffect([{ intensity: 1, ms: 0 }]).some((p) => /positive ms/.test(p)));
    ok("an intensity above 1 is refused", validateEffect([{ intensity: 1.5, ms: 10 }]).some((p) => /outside 0\.\.1/.test(p)));
    ok("a negative intensity is refused", validateEffect([{ intensity: -0.1, ms: 10 }]).some((p) => /outside 0\.\.1/.test(p)));
    ok("a negative gap is refused", validateEffect([{ intensity: 1, ms: 10, gap: -5 }]).some((p) => /negative gap/.test(p)));
    ok("!! a TRAILING gap is refused -- it is silence after the last buzz that nobody waits for",
        validateEffect([{ intensity: 1, ms: 10, gap: 50 }]).some((p) => /trailing gap/.test(p)));
    ok("a well-formed two-step effect passes", validateEffect([{ intensity: 0.5, ms: 10, gap: 40 }, { intensity: 1, ms: 20, gap: 0 }]).length === 0);
}

// ---- 3. TOWARD navigator.vibrate: INDEX PARITY IS THE WHOLE CONTRACT ---------------------------------------
console.log("\n3. *** toVibratePattern: even indices BUZZ, odd indices PAUSE -- one element out of phase plays "
    + "the rhythm INSIDE OUT ***");
{
    const one = toVibratePattern([{ intensity: 1, ms: 25, gap: 0 }]);
    ok("a single step is a single number", one.length === 1 && one[0] === 25, JSON.stringify(one));
    ok("!! *** and it does NOT end with a trailing pause -- that is time the caller waits for nothing ***",
        one.length === 1);

    const two = toVibratePattern([{ intensity: 0.4, ms: 14, gap: 70 }, { intensity: 0.9, ms: 22, gap: 0 }]);
    ok("!! *** a two-step effect is [buzz, pause, buzz] -- length 3, not 4 ***",
        two.length === 3 && two[0] === 14 && two[1] === 70 && two[2] === 22, JSON.stringify(two));

    const three = toVibratePattern(EFFECTS.error);
    ok("the three-tap error is [buzz, pause, buzz, pause, buzz] -- length 5",
        three.length === 5, JSON.stringify(three));
    // The parity claim, asserted as parity rather than as a literal: buzzes are the even slots.
    const buzzes = three.filter((_, i) => i % 2 === 0);
    const pauses = three.filter((_, i) => i % 2 === 1);
    ok("!! every EVEN index is one of the effect's buzz durations",
        buzzes.every((v) => EFFECTS.error.some((s) => s.ms === v)) && buzzes.length === 3, JSON.stringify(buzzes));
    ok("!! every ODD index is one of its gaps",
        pauses.every((v) => EFFECTS.error.some((s) => s.gap === v)) && pauses.length === 2, JSON.stringify(pauses));
    // *** The sum is the same number durationOf reports. If they disagreed, one of them is lying about the
    // effect's length and the caller cannot know which. ***
    ok("!! the pattern's total equals durationOf -- the two ways of measuring an effect agree",
        three.reduce((a, b) => a + b, 0) === durationOf(EFFECTS.error),
        three.reduce((a, b) => a + b, 0) + " vs " + durationOf(EFFECTS.error));

    // THE LOSS, NAMED. A light and a heavy impact must still be distinguishable on a device with no
    // intensity, or the vocabulary is meaningless there.
    const light = toVibratePattern(EFFECTS.impactLight);
    const heavy = toVibratePattern(EFFECTS.impactHeavy);
    ok("!! *** intensity IS discarded here -- the Vibration API has none -- so light and heavy MUST differ in "
       + "DURATION or they would be indistinguishable on a phone ***",
        light[0] !== heavy[0] && heavy[0] > light[0], "light " + light[0] + "ms vs heavy " + heavy[0] + "ms");
}

// ---- 4. TOWARD pulse(): THE SCHEDULE, AND WHY A LOOP WOULD BE WRONG ----------------------------------------
console.log("\n4. *** toPulseSchedule: pulse() DOES NOT QUEUE, so the rhythm becomes separately timed calls ***");
{
    const s = toPulseSchedule(EFFECTS.success);
    ok("one entry per step", s.length === EFFECTS.success.length);
    ok("!! *** the first pulse is at t=0 and the second is NOT -- if both were at 0 the second would "
       + "supersede the first and only one buzz would be felt ***",
        s[0].at === 0 && s[1].at > 0, JSON.stringify(s.map((p) => p.at)));
    // The offset must be the first buzz PLUS its gap, not just the gap: the actuator is busy during the buzz.
    const expected = EFFECTS.success[0].ms + EFFECTS.success[0].gap;
    ok("!! the second pulse starts after the first buzz AND its gap -- scheduling only the gap would overlap "
       + "the two, which is the same collapse in slower motion",
        s[1].at === expected, s[1].at + " vs " + expected);

    const e = toPulseSchedule(EFFECTS.error);
    let monotonic = true;
    for (let i = 1; i < e.length; i++) if (!(e[i].at > e[i - 1].at)) monotonic = false;
    ok("!! every pulse in a three-step effect starts strictly after the one before", monotonic,
        JSON.stringify(e.map((p) => p.at)));
    let noOverlap = true;
    for (let i = 1; i < e.length; i++) if (e[i].at < e[i - 1].at + e[i - 1].ms) noOverlap = false;
    ok("!! *** and no pulse begins before the previous one has FINISHED -- an overlap is the collapse this "
       + "whole function exists to avoid ***", noOverlap);

    // Intensity survives this direction. That is the point of carrying it in the vocabulary at all.
    ok("!! *** intensity IS preserved toward pulse() -- which is why the vocabulary carries it even though "
       + "the vibrate path cannot use it; a vocabulary limited to the weaker API stays limited forever ***",
        toPulseSchedule(EFFECTS.impactHeavy)[0].intensity === 1
        && toPulseSchedule(EFFECTS.impactLight)[0].intensity < 1);

    // The last pulse must end exactly when durationOf says the effect ends -- the two views agree here too.
    const last = e[e.length - 1];
    ok("!! the schedule ends exactly when durationOf says it does",
        last.at + last.ms === durationOf(EFFECTS.error), (last.at + last.ms) + " vs " + durationOf(EFFECTS.error));
}

// ---- 5. THE STRENGTH SCALE TOUCHES INTENSITY AND NOT DURATION ---------------------------------------------
console.log("\n5. a strength setting must not quietly become a speed setting");
{
    const half = scaleIntensity(EFFECTS.error, 0.5);
    ok("intensity is halved", half.every((s, i) => Math.abs(s.intensity - EFFECTS.error[i].intensity * 0.5) < 1e-12));
    ok("!! *** durations and gaps are UNTOUCHED -- shortening a buzz to weaken it changes what it MEANS, and "
       + "on the vibrate path (which has no intensity) it would be the ONLY visible effect, so the strength "
       + "slider would silently become a speed slider ***",
        half.every((s, i) => s.ms === EFFECTS.error[i].ms && (s.gap || 0) === (EFFECTS.error[i].gap || 0)));
    ok("the vibrate pattern is therefore identical at any strength",
        JSON.stringify(toVibratePattern(half)) === JSON.stringify(toVibratePattern(EFFECTS.error)));
    ok("scaling is clamped at both ends", scaleIntensity(EFFECTS.error, 5)[0].intensity === 1
        && scaleIntensity(EFFECTS.error, -1)[0].intensity === 0);
    ok("scaling does not mutate the frozen table", EFFECTS.error[0].intensity === 1);
}

// ---- 6. THE PLAY PATHS REPORT WHY, BECAUSE EVERY HAPTIC API FAILS SILENTLY ---------------------------------
console.log("\n6. *** every browser haptic API fails silently, so each path reports WHY ***");
{
    const play = await import("../../ui/hapticsPlay.js");
    const sup = play.supported(null);
    ok("with no navigator at all it says so rather than throwing", sup.vibrate === false && /no navigator/.test(sup.reason));
    const ios = play.supported({});
    ok("!! *** navigator without .vibrate is named as the iOS Safari case, not reported as a flat failure ***",
        ios.vibrate === false && /iOS Safari/.test(ios.reason), ios.reason);
    const okNav = play.supported({ vibrate: () => true });
    ok("...and a present API is reported present, with the user-gesture caveat stated",
        okNav.vibrate === true && /user gesture/.test(okNav.reason));

    // vibrate() returning FALSE is the platform's only signal that nothing happened.
    let got = null;
    const r1 = play.vibrate("success", { vibrate: (p) => { got = p; return true; } });
    ok("a successful vibrate reports played:true and the pattern it sent",
        r1.ok && r1.played === true && JSON.stringify(got) === JSON.stringify(toVibratePattern(EFFECTS.success)),
        JSON.stringify(got));
    const r2 = play.vibrate("success", { vibrate: () => false });
    ok("!! *** vibrate() returning FALSE is surfaced, not swallowed -- it is the ONLY signal the platform "
       + "gives that nothing happened, and it is what you get before the first user gesture ***",
        r2.ok === true && r2.played === false && /user gesture/.test(r2.reason), r2.reason);
    const r3 = play.vibrate("nosucheffect", { vibrate: () => true });
    ok("an unknown effect is refused by name rather than played as something else", !r3.ok && /unknown effect/.test(r3.reason));

    // The XR path: an actuator array that is PRESENT BUT EMPTY is the common no-motor controller.
    const noAct = play.pulse("success", { gamepad: { hapticActuators: [] } });
    ok("!! a controller whose hapticActuators array is present but EMPTY is handled -- that is a real "
       + "controller without motors, not an error", !noAct.ok && /no haptic actuator/.test(noAct.reason));
    ok("a source with no gamepad at all is handled", !play.pulse("success", {}).ok);
    ok("a null source is handled", !play.pulse("success", null).ok);

    const fired = [];
    const fakeSrc = { gamepad: { hapticActuators: [{ pulse: (i, ms) => { fired.push([i, ms]); return Promise.resolve(true); } }] } };
    const rp = play.pulse("impactHeavy", fakeSrc);
    ok("a single-step effect fires immediately, with its intensity and duration",
        rp.ok && fired.length === 1 && fired[0][0] === 1 && fired[0][1] === EFFECTS.impactHeavy[0].ms,
        JSON.stringify(fired));
    // A rejecting pulse (controller went away mid-buzz) must not become an unhandled rejection.
    let threw = false;
    try { play.pulse("impactHeavy", { gamepad: { hapticActuators: [{ pulse: () => Promise.reject(new Error("gone")) }] } }); }
    catch { threw = true; }
    ok("!! a pulse() that REJECTS -- the controller went away mid-buzz -- does not throw or leave an "
       + "unhandled rejection", !threw);
    let syncThrew = false;
    try { play.pulse("impactHeavy", { gamepad: { hapticActuators: [{ pulse: () => { throw new Error("boom"); } }] } }); }
    catch { syncThrew = true; }
    ok("...and neither does one that throws synchronously", !syncThrew);

    // disabled means disabled, on both paths
    play.setEnabled(false);
    ok("!! disabling stops BOTH paths, not just the one the caller happened to use",
        !play.vibrate("success", { vibrate: () => true }).ok && !play.pulse("success", fakeSrc).ok);
    play.setEnabled(true);
    ok("...and re-enabling restores them", play.vibrate("success", { vibrate: () => true }).ok);
    play.cancel();
}

console.log("\nhaptics-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
