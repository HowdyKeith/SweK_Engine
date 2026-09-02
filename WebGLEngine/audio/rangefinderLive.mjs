// WebGLEngine/audio/rangefinderLive.mjs -- v4301
//
// THE BROWSER HALF of audio/rangefinder.mjs: play the chirp out of the speaker, record the microphone for
// the listen window, hand the samples to profile(). Everything that needs an AudioContext is here so that
// the file that decides what an echo is never touches one.
//
// *** THREE THINGS A PHONE DOES TO A MICROPHONE THAT WOULD SILENTLY KILL THIS. *** Echo cancellation removes
// exactly the signal we are listening for (it is, after all, the speaker's own output coming back); noise
// suppression treats a 5 ms ultrasonic burst as noise; automatic gain control changes the level between
// the direct path and the echo. All three are requested OFF. A browser may ignore the request; the
// direct-path peak's presence in the profile is how a caller can tell whether it did.
//
// No number from this file is a measurement until it has been taken in a room with a rig. The gate for
// this module reads its source; the DSP it calls is gated numerically in rangefinder-selfcheck.mjs.
"use strict";
import { chirp, profile, DEFAULTS, maxRange } from "./rangefinder.mjs";

export class LiveRangefinder {
    constructor(ctx) {
        this.ctx = ctx || null; this.stream = null; this.source = null; this.tap = null;
        this.last = null;
    }
    _ctx() {
        if (this.ctx) return this.ctx;
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Ctor) throw new Error("rangefinderLive: no AudioContext");
        this.ctx = new Ctor(); return this.ctx;
    }
    /** Ask for the microphone with the three processors OFF. */
    async open() {
        const ctx = this._ctx();
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        this.source = ctx.createMediaStreamSource(this.stream);
        return this.stream;
    }
    /**
     * One ping: emit the chirp, capture `listenSeconds`, return the range profile. Ranges are metres from
     * the speaker; `directPath` is the sample the clock was set from.
     */
    async ping({ f0 = DEFAULTS.f0, f1 = DEFAULTS.f1, chirpSeconds = DEFAULTS.chirpSeconds, listenSeconds = DEFAULTS.listenSeconds, gain = 0.8, ...opts } = {}) {
        if (!this.source) throw new Error("rangefinderLive: open() the microphone first");
        const ctx = this.ctx, sampleRate = ctx.sampleRate;
        if (f1 >= sampleRate / 2) throw new Error(`rangefinderLive: ${f1} Hz is above Nyquist at ${sampleRate} Hz`);
        if (ctx.state === "suspended") await ctx.resume();
        const ref = chirp({ f0, f1, seconds: chirpSeconds, sampleRate });
        const buf = ctx.createBuffer(1, ref.length, sampleRate); buf.getChannelData(0).set(ref);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(ctx.destination);

        // capture through a ScriptProcessor: available everywhere, and the listen window is milliseconds
        const want = Math.round(listenSeconds * sampleRate), chunks = []; let got = 0;
        const proc = ctx.createScriptProcessor(1024, 1, 1);
        const done = new Promise((resolve) => {
            proc.onaudioprocess = (e) => {
                if (got >= want) return;
                const d = e.inputBuffer.getChannelData(0); chunks.push(Float32Array.from(d)); got += d.length;
                if (got >= want) resolve();
            };
        });
        this.source.connect(proc); proc.connect(ctx.destination);   // a ScriptProcessor only runs when connected
        src.start();
        await done;
        try { this.source.disconnect(proc); proc.disconnect(); } catch {}
        const rx = new Float64Array(got); let at = 0; for (const c of chunks) { rx.set(c, at); at += c.length; }
        const p = profile(rx.subarray(0, want), ref, { sampleRate, ...opts });
        this.last = { sampleRate, listenSeconds, maxMetres: maxRange(listenSeconds), directPath: p.directPath, detections: p.detections };
        return this.last;
    }
    close() {
        try { this.stream?.getTracks().forEach((t) => t.stop()); } catch {}
        this.stream = null; this.source = null;
    }
}
