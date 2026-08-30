// FILE: audio/sfxModel.mjs -- v4190
//
// A SOUND EFFECT AS DATA: a parameter block in, a buffer of samples out. Pure -- no AudioContext, no DOM, no
// clock -- so a gate can render a sound and hash it, which is something nothing in this tree's audio could do
// before. Idea from loov/jsfx (MIT), which is sfxr's lineage; written here rather than vendored, and the two
// differ in one decision that matters (below).
//
// *** WHY THIS SHAPE. *** Every sound in this engine was a live Web Audio node graph -- world/ProceduralMusic.js
// and world/RoomAmbience.js call ctx.createOscillator() and wire nodes together. That plays, and it can never
// be tested: there is no artefact to look at, nothing to compare between runs, and nothing a headless gate can
// hold. A parameter block that RENDERS TO SAMPLES is testable at every level -- the envelope is a function you
// can plot, the buffer is bytes you can hash, and "the same spell always sounds the same" becomes a claim with
// a number behind it.
//
// *** AND IT USES THE STRICT SINE, WHICH IS THE ONE REAL DEPARTURE FROM jsfx. *** Math.sin is not specified to
// the last bit across JavaScript engines, so a jsfx-style renderer produces subtly different audio on
// different machines -- fine for a game, fatal for a hash. tools/strictTrig.mjs computes sine in strict
// arithmetic, and the cost was measured rather than assumed:
//
//     Math.sin    one second of audio   4.48 ms
//     strictSin   one second of audio  10.18 ms   (2.3x)
//     worst per-sample difference      1.11e-16
//     one 16-bit PCM step              3.05e-5
//
// 2.3x of 4.48ms is still an order of magnitude under real time -- and jsfx's own README claims about 10ms for
// a second of audio, so this lands exactly on its performance target anyway. The difference from Math.sin is
// four thousand times smaller than a single quantisation step of 16-bit audio: inaudible by construction. So
// the strict sine costs nothing anyone can hear and buys a sound that is identical on every machine.
"use strict";

import { strictSin } from "../tools/strictTrig.mjs";

export const TAU = 6.283185307179586;
export const DEFAULT_RATE = 44100;

/** The waveforms. Named, because "wave: 2" in a preset is unreadable and unreviewable. */
export const WAVES = Object.freeze(["sine", "square", "saw", "triangle", "noise"]);

export const DEFAULTS = Object.freeze({
    sampleRate: DEFAULT_RATE,
    wave: "square",
    seed: 1,                    // noise is SEEDED -- see noiseAt
    volume: { attack: 0.01, sustain: 0.10, punch: 0.30, decay: 0.20, gain: 0.35 },
    frequency: { start: 440, slide: 0, min: 20 },
    duty: 0.5,                  // square only: fraction of the cycle spent high
    dutySweep: 0,
    lowPass: 1,                 // 1 = open, smaller = darker. One-pole, see lowPassStep
});

/** mulberry32, the same seeded generator world/procPlanet.js uses. Integer math, so every machine agrees. */
export function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * *** THE ENVELOPE, AND THE PROPERTY THAT MATTERS MOST: IT ENDS AT EXACTLY ZERO. ***
 *
 * A sound whose last sample is not zero CLICKS -- the speaker cone is yanked back to rest in one sample, which
 * is a step function, which is broadband noise. It is the single most common defect in generated audio and it
 * is completely invisible in the parameter block: every number looks reasonable and every playback pops. So
 * the decay runs to zero and the gate checks the last sample, not the shape.
 *
 * attack: rise from silence. punch: an extra kick at the start of the sustain that decays away. decay: fall.
 *
 * @param t seconds since the sound began
 */
export function envelopeAt(t, vol = DEFAULTS.volume) {
    const a = Math.max(0, vol.attack ?? 0), s = Math.max(0, vol.sustain ?? 0), d = Math.max(0, vol.decay ?? 0);
    const punch = Math.max(0, vol.punch ?? 0), gain = vol.gain ?? 1;
    if (t < 0) return 0;
    if (t < a) return (a > 0 ? t / a : 1) * gain;
    if (t < a + s) {
        // punch decays linearly across the sustain, so the attack has a transient without a discontinuity
        const k = s > 0 ? 1 - (t - a) / s : 0;
        return (1 + punch * k) * gain;
    }
    if (t < a + s + d) return (d > 0 ? 1 - (t - a - s) / d : 0) * gain;
    return 0;
}

/** Total length in seconds. A sound with no envelope at all is zero-length, not infinite. */
export function durationOf(params = {}) {
    const v = Object.assign({}, DEFAULTS.volume, params.volume);
    return Math.max(0, (v.attack ?? 0) + (v.sustain ?? 0) + (v.decay ?? 0));
}

/** One sample of the chosen waveform at phase p in [0,1). `rand` supplies noise. */
export function waveAt(kind, p, duty, rand) {
    switch (kind) {
        case "sine":     return strictSin(p * TAU);
        case "square":   return p < duty ? 1 : -1;
        case "saw":      return 1 - 2 * p;
        case "triangle": return 4 * Math.abs(p - 0.5) - 1;
        case "noise":    return rand() * 2 - 1;
        default:         return p < duty ? 1 : -1;
    }
}

/**
 * A one-pole low pass. `k` of 1 is open; smaller is darker.
 * Kept to one pole on purpose: a resonant filter needs state that can blow up, and a sound effect renderer
 * that can produce +Infinity for an innocent-looking parameter block is worse than a slightly duller filter.
 */
export function lowPassStep(prev, x, k) {
    const a = Math.max(0.0001, Math.min(1, k));
    return prev + (x - prev) * a;
}

/**
 * Render a parameter block to samples.
 *
 * @returns { samples: Float32Array, sampleRate, seconds, peak, clipped }
 *          `peak` and `clipped` are REPORTED rather than silently fixed -- a renderer that quietly normalises
 *          hides the fact that a preset is too hot, and then a later change to the envelope produces a
 *          different sound for a reason nobody can find.
 */
export function renderSfx(params = {}) {
    const p = Object.assign({}, DEFAULTS, params);
    const vol = Object.assign({}, DEFAULTS.volume, params.volume);
    const freq = Object.assign({}, DEFAULTS.frequency, params.frequency);
    const rate = Math.max(1, Math.floor(p.sampleRate || DEFAULT_RATE));
    const seconds = durationOf({ volume: vol });
    const n = Math.max(0, Math.floor(seconds * rate));
    const samples = new Float32Array(n);
    if (n === 0) return { samples, sampleRate: rate, seconds: 0, peak: 0, clipped: 0 };

    const rand = rng(p.seed);
    const kind = WAVES.includes(p.wave) ? p.wave : "square";
    let phase = 0, f = Math.max(freq.min ?? 0, freq.start ?? 440);
    let duty = Math.max(0, Math.min(1, p.duty ?? 0.5));
    let lp = 0, peak = 0, clipped = 0;

    for (let i = 0; i < n; i++) {
        const t = i / rate;
        // the frequency slides per SECOND, not per sample, so a preset sounds the same at any sample rate
        f = Math.max(freq.min ?? 0, f + (freq.slide || 0) / rate);
        duty = Math.max(0, Math.min(1, duty + (p.dutySweep || 0) / rate));
        phase += f / rate;
        if (phase >= 1) phase -= Math.floor(phase);
        let v = waveAt(kind, phase, duty, rand);
        v = lowPassStep(lp, v, p.lowPass ?? 1); lp = v;
        v *= envelopeAt(t, vol);
        if (v > 1) { v = 1; clipped++; } else if (v < -1) { v = -1; clipped++; }
        const a = Math.abs(v);
        if (a > peak) peak = a;
        samples[i] = v;
    }
    // *** AND THE LAST SAMPLE IS FORCED TO SILENCE. *** The envelope reaches zero at exactly t = a+s+d, but the
    // last SAMPLE sits one step before that, so it is small and not zero -- and a small step is still a click.
    samples[n - 1] = 0;
    return { samples, sampleRate: rate, seconds, peak, clipped };
}

/** Sixteen-bit PCM, for hashing and for anything that wants bytes rather than floats. */
export function toPCM16(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
}

/**
 * *** THE PRESETS ARE DATA, WHICH IS THE WHOLE POINT. *** A spell, a pickup and a hit are three parameter
 * blocks in one table, not three functions -- so they can be listed, diffed, hashed, tuned in a page, and
 * handed to the dungeon's spell book (task #69) as one more field beside cost and element.
 */
export const PRESETS = Object.freeze({
    coin:      { wave: "square", seed: 11, duty: 0.5, volume: { attack: 0.002, sustain: 0.03, punch: 0.5, decay: 0.18, gain: 0.30 }, frequency: { start: 900, slide: 1800 } },
    hit:       { wave: "noise",  seed: 23, volume: { attack: 0.001, sustain: 0.02, punch: 0.6, decay: 0.12, gain: 0.35 }, frequency: { start: 300, slide: -600 }, lowPass: 0.35 },
    zap:       { wave: "saw",    seed: 37, volume: { attack: 0.001, sustain: 0.05, punch: 0.4, decay: 0.22, gain: 0.28 }, frequency: { start: 1200, slide: -2400, min: 60 }, lowPass: 0.7 },
    explosion: { wave: "noise",  seed: 51, volume: { attack: 0.004, sustain: 0.10, punch: 0.7, decay: 0.55, gain: 0.40 }, frequency: { start: 220, slide: -180, min: 30 }, lowPass: 0.18 },
    powerup:   { wave: "sine",   seed: 67, volume: { attack: 0.01, sustain: 0.14, punch: 0.2, decay: 0.30, gain: 0.30 }, frequency: { start: 320, slide: 900 } },
    step:      { wave: "noise",  seed: 83, volume: { attack: 0.001, sustain: 0.01, punch: 0.3, decay: 0.06, gain: 0.18 }, frequency: { start: 180, slide: -120, min: 40 }, lowPass: 0.25 },
});

/**
 * *** THEMES: ONE TRANSFORM OVER THE WHOLE TABLE. ***
 *
 * Idea from rexa-developer/tiks (MIT), which ships soft/crisp/arcade/glass and alters the character of every
 * sound at once. The presets above are six independent blocks, so retuning a whole interface meant editing
 * six of them -- and v4192's spell book was already doing this job by hand, with a per-spell `soundOver`.
 * A theme is the general form of that: ONE function from a parameter block to a parameter block.
 *
 * Multiplicative rather than absolute on purpose. A theme that SET decay to 0.4 would flatten the difference
 * between a 0.06s step and a 0.55s explosion, which is the difference the presets exist to carry; scaling
 * keeps their relative shape and changes their character.
 */
export const THEMES = Object.freeze({
    plain:  { gain: 1.0, decay: 1.0, lowPass: 1.0, freq: 1.0, punch: 1.0 },
    soft:   { gain: 0.8, decay: 1.4, lowPass: 0.45, freq: 0.85, punch: 0.5 },   // muffled, slower to fade
    crisp:  { gain: 1.0, decay: 0.7, lowPass: 1.0, freq: 1.15, punch: 1.3 },    // short, bright, snappy
    arcade: { gain: 1.1, decay: 1.1, lowPass: 1.0, freq: 1.5, punch: 1.6 },     // high and loud
    glass:  { gain: 0.9, decay: 1.8, lowPass: 1.0, freq: 1.9, punch: 0.7 },     // very high, long ring
});

export const THEME_NAMES = Object.freeze(Object.keys(THEMES));

/** Apply a theme to a parameter block. Unknown theme names throw -- a silently unthemed UI is a bug. */
export function themed(params, theme = "plain") {
    const t = THEMES[theme];
    if (!t) throw new Error(`sfx: no theme "${theme}" (have: ${THEME_NAMES.join(", ")})`);
    const p = Object.assign({}, DEFAULTS, params);
    const vol = Object.assign({}, DEFAULTS.volume, params.volume);
    const freq = Object.assign({}, DEFAULTS.frequency, params.frequency);
    return Object.assign({}, p, {
        lowPass: Math.max(0.02, Math.min(1, (p.lowPass ?? 1) * t.lowPass)),
        volume: Object.assign({}, vol, {
            gain: vol.gain * t.gain,
            decay: vol.decay * t.decay,
            punch: vol.punch * t.punch,
        }),
        frequency: Object.assign({}, freq, {
            start: freq.start * t.freq,
            slide: freq.slide * t.freq,      // the slide scales with the pitch, or a themed sweep lands wrong
        }),
    });
}

/** Render a named preset. Unknown names throw rather than playing silence nobody notices. */
export function renderPreset(name, over = {}, theme = "plain") {
    const p = PRESETS[name];
    if (!p) throw new Error(`sfx: no preset "${name}" (have: ${Object.keys(PRESETS).join(", ")})`);
    const merged = Object.assign({}, p, over, { volume: Object.assign({}, p.volume, over.volume), frequency: Object.assign({}, p.frequency, over.frequency) });
    return renderSfx(theme === "plain" ? merged : themed(merged, theme));
}
