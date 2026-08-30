// FILE: audio/sfxPlay.js -- v4190
//
// The browser half of audio/sfxModel.mjs: rendered samples into an AudioBuffer and out of the speakers.
// Everything that decides what a sound IS lives in the model; this file only moves bytes.
"use strict";

import { renderSfx, renderPreset, PRESETS, THEMES, THEME_NAMES, DEFAULT_RATE } from "./sfxModel.mjs";

/**
 * *** THE THROTTLE DECISION, PURE, SO IT CAN BE GATED WITHOUT WAITING. ***
 *
 * A hover sound wired to pointermove fires per pointer sample -- dozens a second across a list, which is not
 * a sound but a texture, and an unpleasant one. tiks throttles exactly this. Keeping the decision separate
 * from the clock means a gate checks it with two numbers instead of sleeping.
 *
 * `lastAt` of null means it has never played, which always allows -- never "0 milliseconds ago".
 */
export function throttleAllows(lastAt, now, ms) {
    if (!(ms > 0)) return true;
    if (lastAt === null || lastAt === undefined) return true;
    return (now - lastAt) >= ms;
}

/**
 * *** AN AudioContext CANNOT BE CREATED BEFORE A GESTURE, AND PRETENDING OTHERWISE IS THE CLASSIC BUG. ***
 * Every browser starts a context in the "suspended" state unless it was made during a user gesture, and a
 * suspended context accepts every call you make, reports no error, and plays nothing. So the context is
 * created lazily on the first play() and resumed each time -- and `ready` reports the truth rather than
 * assuming it.
 */
export class SfxPlayer {
    constructor(opts = {}) {
        this.ctx = null;
        this.gain = null;
        this.volume = opts.volume ?? 0.8;
        this.rate = opts.sampleRate || DEFAULT_RATE;
        this.cache = new Map();      // key -> AudioBuffer, so a sound renders once and plays many times
        this.rendered = 0;           // how many renders actually happened, for the page to show
        this.played = 0;
        this.suppressed = 0;         // plays refused by the throttle or the mute, so a page can see them

        this.theme = opts.theme || "plain";
        this.muted = !!opts.muted;
        this.throttleMs = opts.throttleMs ?? 0;     // 0 = every call plays
        this._lastAt = new Map();                   // per SOUND, so a click right after a hover still lands

        // *** prefers-reduced-motion IS A PROXY HERE, AND THAT IS WORTH SAYING. *** There is no standard
        // "prefers-reduced-sound" query. tiks uses the motion one, on the reading that both are about sensory
        // load, and this follows it -- but it is an inference about what a reader wants, not a preference they
        // expressed, so it is one flag away from being switched off.
        this.respectReducedMotion = opts.respectReducedMotion !== false;
    }

    /** Does this reader want less? The same query ui/stateOrb.js, ui/textMorph.js and ui/domAnimate.js ask. */
    get reducedMotion() {
        try { return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; }
        catch { return false; }
    }

    /** Whether a play would be heard at all, and why not. Reported rather than silently swallowed. */
    wouldPlay(name, now = (typeof performance !== "undefined" ? performance.now() : Date.now())) {
        if (this.muted) return { ok: false, why: "muted" };
        if (this.respectReducedMotion && this.reducedMotion) return { ok: false, why: "prefers-reduced-motion" };
        if (!throttleAllows(this._lastAt.has(name) ? this._lastAt.get(name) : null, now, this.throttleMs)) {
            return { ok: false, why: `throttled (${this.throttleMs}ms)` };
        }
        return { ok: true };
    }

    setMuted(v) { this.muted = !!v; return this.muted; }
    setTheme(t) {
        if (!THEMES[t]) throw new Error(`SfxPlayer: no theme "${t}" (have: ${THEME_NAMES.join(", ")})`);
        // a theme change makes every cached buffer wrong -- serving the old ones would retune nothing
        this.theme = t; this.cache.clear();
        return t;
    }

    get ready() { return !!this.ctx && this.ctx.state === "running"; }

    _ensure() {
        if (!this.ctx) {
            const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
            if (!AC) return null;
            this.ctx = new AC({ sampleRate: this.rate });
            this.gain = this.ctx.createGain();
            this.gain.gain.value = this.volume;
            this.gain.connect(this.ctx.destination);
        }
        // resume every time: a context can be suspended again by the browser (a backgrounded tab) long after
        // it was first started, and a player that only resumed once goes quiet forever when that happens
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        return this.ctx;
    }

    /** Turn rendered float samples into an AudioBuffer. */
    _buffer(samples, sampleRate) {
        const ctx = this._ensure();
        if (!ctx || !samples.length) return null;
        const buf = ctx.createBuffer(1, samples.length, sampleRate);
        buf.getChannelData(0).set(samples);
        return buf;
    }

    /**
     * Render (or reuse) and play a named preset.
     *
     * *** THE MUTE IS REAL NOW. *** This comment used to say "or null if muted" while the class had no mute
     * at all -- a comment describing a feature that did not exist, which is worse than no comment because a
     * reader stops looking.
     *
     * @returns the AudioBufferSourceNode, or null when muted, throttled, or the audio device is unavailable
     */
    play(name, over = null) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const verdict = this.wouldPlay(name, now);
        if (!verdict.ok) { this.suppressed++; return null; }
        const ctx = this._ensure();
        if (!ctx) return null;
        this._lastAt.set(name, now);
        // an override or a theme makes a DIFFERENT sound, so neither may be served from the preset's slot
        const key = (over ? name + ":" + JSON.stringify(over) : name) + "@" + this.theme;
        let buf = this.cache.get(key);
        if (!buf) {
            const r = renderPreset(name, over || {}, this.theme);
            buf = this._buffer(r.samples, r.sampleRate);
            if (!buf) return null;
            this.cache.set(key, buf);
            this.rendered++;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.gain);
        src.start();
        this.played++;
        return src;
    }

    /** Play an arbitrary parameter block, for a tuning page or a spell whose sound is not a preset. */
    playParams(params) {
        const ctx = this._ensure();
        if (!ctx) return null;
        const r = renderSfx(params);
        const buf = this._buffer(r.samples, r.sampleRate);
        if (!buf) return null;
        this.rendered++;
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(this.gain); src.start();
        this.played++;
        return src;
    }

    setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.gain) this.gain.gain.value = this.volume; }

    /** Release the audio device. A page that leaves a context open holds hardware it is not using. */
    dispose() {
        try { if (this.ctx) this.ctx.close(); } catch {}
        this.ctx = null; this.gain = null; this.cache.clear();
    }
}

export { PRESETS };
