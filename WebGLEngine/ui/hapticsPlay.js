// ui/hapticsPlay.js -- v4213 -- the wiring for ui/haptics.mjs: navigator.vibrate and XR haptic actuators.
//
// Everything that can be reasoned about lives in ui/haptics.mjs (pure, gated in node). What is HERE is the
// part that genuinely needs a device: the platform calls, and the scheduling that a pulse-based actuator
// requires.
//
// *** EVERY HAPTIC API IN A BROWSER FAILS SILENTLY, AND THAT IS THE DESIGN PROBLEM. ***
//   - navigator.vibrate does not exist on iOS Safari at all. No error; the call is simply absent.
//   - Where it exists, it returns FALSE without a prior user gesture, and returning false is the only signal.
//   - An XR controller may expose gamepad.hapticActuators as an EMPTY ARRAY -- present, iterable, useless.
//   - pulse() returns a Promise that can reject on a controller that went away mid-buzz.
// So `supported()` reports WHY rather than a flat boolean, and every play path returns what it actually did.
// A UI that wants to offer a "haptics" toggle needs to know the difference between "off" and "impossible".

import { effect, toVibratePattern, toPulseSchedule, scaleIntensity, validateEffect } from "./haptics.mjs";

let _strength = 1;      // global scale, 0..1
let _enabled = true;
let _timers = [];       // pending scheduled pulses, so a new effect can cancel the old one

/** 0..1. Applied to intensity only -- see scaleIntensity's note on why duration is not touched. */
export function setStrength(k) { _strength = Math.min(1, Math.max(0, Number(k) || 0)); }
export function setEnabled(on) { _enabled = !!on; if (!on) cancel(); }
export function isEnabled() { return _enabled; }

/** Stop anything scheduled. Called on a new effect and when a session ends. */
export function cancel() {
    for (const t of _timers) { try { clearTimeout(t); } catch {} }
    _timers = [];
    try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0); } catch {}
}

/**
 * What is actually available here, and why not.
 * Three answers rather than one, for the same reason engine/xrSession.mjs's describeSupport separates them.
 */
export function supported(nav = (typeof navigator !== "undefined" ? navigator : null)) {
    const out = { vibrate: false, reason: "" };
    if (!nav) { out.reason = "no navigator (not a browser)"; return out; }
    if (typeof nav.vibrate !== "function") {
        out.reason = "navigator.vibrate is absent -- iOS Safari has never shipped the Vibration API";
        return out;
    }
    out.vibrate = true;
    out.reason = "navigator.vibrate is present (it still returns false before the first user gesture)";
    return out;
}

/**
 * Play on the PHONE path.
 * @returns { ok, played, reason } -- `played` is what navigator.vibrate actually returned, which is the only
 *          signal the platform gives and is FALSE before a user gesture even on a device that works.
 */
export function vibrate(name, nav = (typeof navigator !== "undefined" ? navigator : null)) {
    if (!_enabled) return { ok: false, played: false, reason: "haptics disabled" };
    const steps = effect(name);
    if (!steps) return { ok: false, played: false, reason: "unknown effect: " + name };
    const sup = supported(nav);
    if (!sup.vibrate) return { ok: false, played: false, reason: sup.reason };
    const pattern = toVibratePattern(steps);
    let played = false;
    try { played = nav.vibrate(pattern) !== false; } catch (e) { return { ok: false, played: false, reason: e && e.message }; }
    return {
        ok: true, played, pattern,
        reason: played ? "vibrated" : "navigator.vibrate returned false -- usually no user gesture yet",
    };
}

/**
 * Play on an XR CONTROLLER.
 *
 * *** THE RHYTHM IS REBUILT AS SEPARATELY TIMED CALLS BECAUSE pulse() DOES NOT QUEUE. *** Firing an effect's
 * pulses in a loop plays exactly one buzz -- the last -- and the pattern is silently gone. toPulseSchedule
 * gives each pulse an `at`, and each one is a setTimeout.
 *
 * @param source an XRInputSource (or anything with .gamepad.hapticActuators)
 */
export function pulse(name, source) {
    if (!_enabled) return { ok: false, reason: "haptics disabled" };
    const steps = effect(name);
    if (!steps) return { ok: false, reason: "unknown effect: " + name };
    const acts = source && source.gamepad && source.gamepad.hapticActuators;
    // Present but EMPTY is the common case on controllers without motors, and it is not an error.
    if (!acts || !acts.length || typeof acts[0].pulse !== "function") {
        return { ok: false, reason: "this input source exposes no haptic actuator" };
    }
    const act = acts[0];
    const schedule = toPulseSchedule(scaleIntensity(steps, _strength));
    cancel();
    for (const p of schedule) {
        const fire = () => { try { const r = act.pulse(p.intensity, p.ms); if (r && r.catch) r.catch(() => {}); } catch {} };
        if (p.at === 0) fire();
        else _timers.push(setTimeout(fire, p.at));
    }
    return { ok: true, pulses: schedule.length, reason: "scheduled " + schedule.length + " pulse(s)" };
}

/**
 * Play wherever it can: the controller if one was given and has a motor, otherwise the phone.
 * Returns the first path that reported ok, or the last reason if none did.
 */
export function play(name, source = null) {
    if (source) { const r = pulse(name, source); if (r.ok) return r; }
    return vibrate(name);
}

/** Exposed so a page can add its own effect and have it checked the same way the built-ins are. */
export { validateEffect };

export default { play, vibrate, pulse, cancel, supported, setStrength, setEnabled, isEnabled, validateEffect };
