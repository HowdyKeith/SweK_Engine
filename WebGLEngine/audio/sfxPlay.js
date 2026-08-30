// FILE: audio/sfxPlay.js -- v4190
//
// The browser half of audio/sfxModel.mjs: rendered samples into an AudioBuffer and out of the speakers.
// Everything that decides what a sound IS lives in the model; this file only moves bytes.
"use strict";

import { renderSfx, renderPreset, PRESETS, DEFAULT_RATE } from "./sfxModel.mjs";

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
        this.cache = new Map();      // name/key -> AudioBuffer, so a sound renders once and plays many times
        this.rendered = 0;           // how many renders actually happened, for the page to show
        this.played = 0;
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

    /** Render (or reuse) and play a named preset. Returns the AudioBufferSourceNode, or null if muted/unavailable. */
    play(name, over = null) {
        const ctx = this._ensure();
        if (!ctx) return null;
        // an override makes a DIFFERENT sound, so it must not be served from the preset's cache slot
        const key = over ? name + ":" + JSON.stringify(over) : name;
        let buf = this.cache.get(key);
        if (!buf) {
            const r = over ? renderPreset(name, over) : renderPreset(name);
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
