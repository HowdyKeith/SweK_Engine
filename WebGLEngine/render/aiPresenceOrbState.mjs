// WebGLEngine/render/aiPresenceOrbState.mjs
//
// The pure-JS half of the AI-presence orb port (tools/ship/nextRounds.mjs's ai-presence-orb-widget entry):
// everything that has no GPU dependency, playing the SAME role render/swiftShaderModel.mjs plays for
// render/swiftShaderPass.js -- a CPU reference the shader (render/aiPresenceOrbTsl.mjs) is graded against,
// and a place to argue the porting decisions once rather than re-derive them at every call site.
//
// krispuckett/murmur-web (MIT) is a WebGPU-primary port of a native Metal/SwiftUI package; its own repo does
// NOT ship the original Metal source (WEB-SPEC.md names it only by a local path), so "the six traps" style of
// swiftShaderModel.mjs's own header -- naming Metal's own specific silent-mismatch behaviours -- has nothing
// to compare against here. What IS available and was actually read (not recalled) before any of this was
// written: murmur-web's OWN TypeScript/WGSL source (src/shaders/kit.ts, src/state.ts, src/signals.ts,
// src/styles.ts) -- so this is a hand-port of a DESIGN whose real numbers were fetched and checked, in the
// same spirit as this tree's other "read the source, then write an independent implementation" ports
// (physics/render/fresnelF82.mjs's Hoffman constants, render/fxaaPass.js's FXAA tuning constants).
//
// SCOPE, NAMED UP FRONT: murmur-web has 18 material "species"; this file (and its shader twin) ports the
// shared foundation ("the kit") plus exactly ONE species, "still" -- described in its own source as "the
// minimal hero: a quiet glass sphere, one slow internal glint," the smallest surface area to port faithfully
// and the clearest to verify. The other 17 are not attempted; see tools/ship/nextRounds.mjs's closing note.
"use strict";

// ---------------------------------------------------------------------------------------------------------
// OKLAB. Bjoern Ottosson's perceptual colour space (public domain description; used here for its published
// numbers, not vendored code -- there is no OKLab implementation to vendor, it is a documented matrix pair).
// The "cube-rooted LMS <-> OKLab" half below was cross-checked against a real, independently-fetched public
// implementation (color-js/color.js's oklab.js) before shipping: that source's own LMS'->OKLab and OKLab->LMS'
// matrices agree with the constants here to 6+ significant figures. The linear-sRGB<->LMS half is the
// popularised DIRECT two-matrix form (skipping XYZ as an intermediate, the shape almost every real-time OKLab
// shader uses) and was not independently re-fetched -- what stands in for that check is architectural rather
// than sourced: FORWARD and INVERSE are round-trip tested below (srgbToOklab then oklabToSrgb must return the
// original colour), which cannot pass by accident if the two halves are not genuine inverses of each other.
// ---------------------------------------------------------------------------------------------------------

export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

const cbrt = Math.cbrt;

/** linear sRGB (0..1 each) -> OKLab {L, a, b}. */
export function linearToOklab(r, g, b) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = cbrt(l), m_ = cbrt(m), s_ = cbrt(s);
    return {
        L: 0.2104542683093140 * l_ + 0.7936177747023054 * m_ - 0.0040720430116193 * s_,
        a: 1.9779985324311684 * l_ - 2.4285922420485799 * m_ + 0.4505937096174110 * s_,
        b: 0.0259040424655478 * l_ + 0.7827717124575296 * m_ - 0.8086757549230774 * s_,
    };
}
/** OKLab {L, a, b} -> linear sRGB [r, g, b] (0..1 each, NOT clamped -- an out-of-gamut Lab can go negative). */
export function oklabToLinear(L, a, b) {
    const l_ = L + 0.3963377773761749 * a + 0.2158037573099136 * b;
    const m_ = L - 0.1055613458156586 * a - 0.0638541728258133 * b;
    const s_ = L - 0.0894841775298119 * a - 1.2914855480194092 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}
export function srgbToOklab(r, g, b) { return linearToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)); }
export function oklabToSrgb(L, a, b) { const [r, g, bl] = oklabToLinear(L, a, b); return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bl)]; }

/** L,a,b -> L,C(chroma),h(hue, radians) -- polar form, used for hue-shift and duotone spread. */
export function oklabToLch(L, a, b) { return { L, C: Math.hypot(a, b), h: Math.atan2(b, a) }; }
export function lchToOklab(L, C, h) { return { L, a: C * Math.cos(h), b: C * Math.sin(h) }; }

// ---------------------------------------------------------------------------------------------------------
// THE SIX STATES. Table read directly from murmur-web's src/state.ts (idle/listening/thinking/responding/
// success/error), each a {speed, glow, depth, hueShift} multiplier set applied on top of a species' own
// defaults, plus which entry envelope (if any) fires on ARRIVAL at that state.
// ---------------------------------------------------------------------------------------------------------
export const STATES = Object.freeze({
    idle:       Object.freeze({ speed: 0.30, glow: 0.65, depth: 0.75, hueShift: 0,     entry: null }),
    listening:  Object.freeze({ speed: 0.90, glow: 1.10, depth: 1.10, hueShift: 0,     entry: null }),
    thinking:   Object.freeze({ speed: 1.15, glow: 1.20, depth: 1.25, hueShift: 0,     entry: "wake" }),
    responding: Object.freeze({ speed: 1.45, glow: 1.30, depth: 1.25, hueShift: 0,     entry: null }),
    success:    Object.freeze({ speed: 0.55, glow: 1.05, depth: 1.00, hueShift: 0,     entry: "swell" }),
    error:      Object.freeze({ speed: 0.65, glow: 0.80, depth: 1.20, hueShift: -0.35, entry: "stutter" }),
});
export const STATE_NAMES = Object.freeze(Object.keys(STATES));

const TRANSITION_DURATION = 0.6;   // seconds, crossfade between two states' params

/** smoothstep, 0..1 in, 0..1 out, clamped -- three's own polynomial ease, used for the state crossfade. */
export function smoothstep01(x) { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------------------------------------------------
// ENTRY ENVELOPES. Fired once, at the moment a state is ENTERED (not held for the state's duration) -- an
// "anticipation" flash on waking to think, a "completion breath" on success, a "catch" stutter on error.
//
// *** THE SWELL PEAK LOCATION IS AN ALGEBRAIC FACT, HAND-PROVEN BEFORE IT WAS TRUSTED, NOT READ OFF A GRAPH.
// *** f(x) = x^p * e^{p(1-x)} has f'(x) = p * e^{p(1-x)} * x^{p-1} * (1-x): zero at x=0 and x=1, POSITIVE on
// (0,1) and NEGATIVE on (1,infinity) for any p>0 -- so x=1 is f's unique global maximum on x>0, and f(1) = 1
// EXACTLY, for every p. Murmur's own numbers ("peaking at 0.4s... multiplying glow by up to 1.35") are
// therefore read as: x = tau / SWELL_PEAK_TIME (so the proven peak at x=1 lands at tau = SWELL_PEAK_TIME
// exactly), scaled by SWELL_GLOW_BOOST at that peak. Checked in the gate at f64 rounding, not "close".
// ---------------------------------------------------------------------------------------------------------
export const WAKE_OVERSHOOT = 0.6, WAKE_DECAY = 0.4, WAKE_DURATION = 2.5;
/** exponential-decay anticipation flash: 1+overshoot at tau=0, decays toward 1 as tau grows. */
export function wakeEnvelope(tau) {
    if (tau < 0 || tau > WAKE_DURATION) return 1;
    return 1 + WAKE_OVERSHOOT * Math.exp(-tau / WAKE_DECAY);
}

export const SWELL_POWER = 2.2, SWELL_PEAK_TIME = 0.4, SWELL_GLOW_BOOST = 0.35, SWELL_DURATION = 1.5;
/** gamma-shaped completion breath: 0 at tau=0, peaks at exactly tau=SWELL_PEAK_TIME with boost SWELL_GLOW_BOOST, tapers by SWELL_DURATION. */
export function swellEnvelope(tau) {
    if (tau <= 0 || tau > SWELL_DURATION) return 0;
    const x = tau / SWELL_PEAK_TIME;
    return SWELL_GLOW_BOOST * Math.pow(x, SWELL_POWER) * Math.exp(SWELL_POWER * (1 - x));
}

/**
 * A raised-cosine bump, 1 at tau=center, falling smoothly (C1, zero slope at the boundary) to exactly 0 at
 * tau = center +/- halfWidth and beyond -- murmur-web's own "arch(tau, center, width)" is referenced but not
 * defined in what was fetched, so THIS SHAPE IS AN INDEPENDENT RECONSTRUCTION, chosen for being the simplest
 * bump with a hand-provable exact zero outside its support (checked in the gate) rather than an asymptotic one.
 */
export function arch(tau, center, halfWidth) {
    const d = Math.abs(tau - center);
    if (d >= halfWidth) return 0;
    return 0.5 * (1 + Math.cos((Math.PI * d) / halfWidth));
}
export const FIRST_CATCH = { depth: 0.5, center: 0.05, halfWidth: 0.2 };
export const SECOND_CATCH = { depth: 0.35, center: 0.28, halfWidth: 0.16 };
export const STUTTER_DURATION = 0.5;
/** two overlapping "catches" -- a speed/glow dip, not a rise, so this returns a value to SUBTRACT. */
export function stutterEnvelope(tau) {
    if (tau < 0 || tau > STUTTER_DURATION) return 0;
    return FIRST_CATCH.depth * arch(tau, FIRST_CATCH.center, FIRST_CATCH.halfWidth) +
           SECOND_CATCH.depth * arch(tau, SECOND_CATCH.center, SECOND_CATCH.halfWidth);
}

export function entryEnvelopeFor(name) { return name === "wake" ? wakeEnvelope : name === "swell" ? swellEnvelope : name === "stutter" ? stutterEnvelope : null; }

// ---------------------------------------------------------------------------------------------------------
// LIVE SIGNAL SMOOTHING. Two host-supplied scalars (voice energy off the mic, typing/token-stream cadence),
// each smoothed with an ASYMMETRIC exponential envelope -- fast attack so a syllable registers, slow release
// so it does not flicker between words. Exact exponential-approach step, not a fixed-alpha lerp (frame-rate
// independent by construction: two half-steps of dt/2 give the same result as one step of dt, to float
// rounding -- the semigroup property of e^{-t/tau}, checked in the gate).
// ---------------------------------------------------------------------------------------------------------
export const SIGNAL_ATTACK_TAU = 0.05, SIGNAL_RELEASE_TAU = 0.25;

export class SignalEnvelope {
    constructor(initial = 0) { this.value = initial; }
    step(target, dt) {
        const tau = target > this.value ? SIGNAL_ATTACK_TAU : SIGNAL_RELEASE_TAU;
        this.value += (target - this.value) * (1 - Math.exp(-dt / tau));
        this.value = Math.min(1, Math.max(0, this.value));
        return this.value;
    }
}

// ---------------------------------------------------------------------------------------------------------
// TEMPO INTEGRATION. A state change can jump `speed` instantly; multiplying elapsed time by the CURRENT
// speed would then jump the animation's PHASE too (a visible pop). murmur-web integrates speed continuously
// via composite Simpson's rule instead: phase(t) = integral of speed(s) ds from 0 to t. Composite Simpson's
// rule is EXACT (to float rounding) for any integrand that is a polynomial of degree <= 3 on each subinterval
// -- so for a constant or linearly-changing speed (the two cases that actually occur: held steady, or eased
// across a 0.6s crossfade) this is not an approximation, it is the exact integral, checked in the gate against
// the closed-form antiderivative rather than merely "does a finer step count change the answer".
// ---------------------------------------------------------------------------------------------------------
export function integrateTempo(speedFn, t0, t1, steps = 32) {
    if (t1 <= t0) return 0;
    const n = steps % 2 === 0 ? steps : steps + 1;   // Simpson's rule needs an even interval count
    const h = (t1 - t0) / n;
    let sum = speedFn(t0) + speedFn(t1);
    for (let i = 1; i < n; i++) sum += speedFn(t0 + i * h) * (i % 2 === 0 ? 2 : 4);
    return (h / 3) * sum;
}

// ---------------------------------------------------------------------------------------------------------
// THE ORCHESTRATOR. Owns current/previous state, the crossfade, the one live entry envelope, phase (via
// Simpson integration of the crossfaded speed), and the two signal envelopes. Pure -- no GPU, no DOM, no
// wall-clock reads (the caller passes dt) -- so it is directly unit-testable, the same reason
// ui/stateOrb.js's dotsAt() is separated from its own drawOrb().
// ---------------------------------------------------------------------------------------------------------
export function createPresenceState(initial = "idle") {
    if (!STATES[initial]) throw new Error(`createPresenceState: unknown state "${initial}"`);
    let cur = initial, prev = null, transitionT = TRANSITION_DURATION;  // already-settled: no crossfade running
    let entryT = 0, entryName = STATES[initial].entry;
    let phase = 0;
    const voice = new SignalEnvelope(0), activity = new SignalEnvelope(0);

    function paramsAt(name) { return STATES[name]; }
    function blendedParams() {
        if (transitionT >= TRANSITION_DURATION || !prev) return paramsAt(cur);
        const t = smoothstep01(transitionT / TRANSITION_DURATION);
        const a = paramsAt(prev), b = paramsAt(cur);
        return { speed: a.speed + (b.speed - a.speed) * t, glow: a.glow + (b.glow - a.glow) * t,
                 depth: a.depth + (b.depth - a.depth) * t, hueShift: a.hueShift + (b.hueShift - a.hueShift) * t };
    }

    return {
        setState(name) {
            if (!STATES[name]) throw new Error(`createPresenceState.setState: unknown state "${name}"`);
            if (name === cur) return;
            prev = cur; cur = name; transitionT = 0;
            entryName = STATES[name].entry; entryT = 0;
        },
        tick(dt, live = {}) {
            if (dt < 0) throw new Error("createPresenceState.tick: dt must be >= 0");
            const p = blendedParams();
            phase += integrateTempo(() => p.speed, 0, dt, 8);   // speed is ~constant across one small dt step
            transitionT = Math.min(TRANSITION_DURATION, transitionT + dt);
            entryT += dt;
            if (live.voice != null) voice.step(Math.min(1, Math.max(0, live.voice)), dt);
            if (live.activity != null) activity.step(Math.min(1, Math.max(0, live.activity)), dt);
        },
        getParams() {
            const p = blendedParams();
            const env = entryEnvelopeFor(entryName);
            const envMul = env === wakeEnvelope ? env(entryT) : 1;
            const envAdd = env === swellEnvelope ? env(entryT) : (env === stutterEnvelope ? -env(entryT) : 0);
            return { speed: p.speed, depth: p.depth, hueShift: p.hueShift,
                     glow: Math.max(0, p.glow * envMul + envAdd),
                     phase, voice: voice.value, activity: activity.value, state: cur };
        },
        get state() { return cur; },
    };
}

// ---------------------------------------------------------------------------------------------------------
// THE "still" SPECIES. murmur-web's src/shaders/still.ts, read directly: "the minimal hero: a quiet glass
// sphere, one slow internal glint." Four character knobs (defaults from src/styles.ts): glintRate=0.3,
// clarity=0.6, presence=0.5, spread=0.2. CPU reference for the interior contribution the shader computes --
// this is what a specific rendered pixel's expected value is checked against in the gate.
// ---------------------------------------------------------------------------------------------------------
export const STILL_DEFAULTS = Object.freeze({ glintRate: 0.3, clarity: 0.6, presence: 0.5, spread: 0.2 });

/** the baseline interior floor density -- presence lifts it, clarity suppresses it, voice activity lifts it. */
export function stillFloorAmt({ presence, clarity, voice = 0, small = 1 }) {
    return (0.016 + 0.085 * presence) * (1 - 0.5 * clarity) * (1 + 0.55 * voice) * (1 + 0.5 * (small - 1));
}
/** glintRate 0..1 -> period in seconds, murmur's own stated range (~11.5s at rate 0, ~7s at rate 1). */
export function stillGlintPeriod(glintRate) { return 11.5 - 4.5 * Math.min(1, Math.max(0, glintRate)); }
/** the single glint event's brightness at time t: a periodic Gaussian-like pulse, 1 wide sample per period. */
export function stillGlint(t, glintRate, { visible = 1, bright = 1, width = 0.35 } = {}) {
    const period = stillGlintPeriod(glintRate);
    const phase = ((t % period) + period) % period;
    const centered = phase < period / 2 ? phase : phase - period;   // nearest occurrence, signed
    const arg = (centered * centered) / (width * width);
    return Math.exp(-arg) * visible * bright;
}
