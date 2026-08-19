// FILE: ai/AudioAnalyser.js
// VERSION: v1 — round 271
//
// Web Audio AnalyserNode wrapper that turns an HTMLAudioElement (or
// AudioBuffer) into a per-frame amplitude reading. Drives lip-sync
// from the ACTUAL audio playing, not a synthetic curve. This is
// the "Path C" of audio-driven lip-sync — used when an audio source
// is available; the engine falls back to PhonemeMouth's text-derived
// curve when no audio is available.
//
// Typical wiring:
//   1. Some TTS path generates a WAV/MP3 (PowerShell could be modified
//      to write to a file then HTTP serve it; or a future browser-side
//      TTS WASM library could return an AudioBuffer)
//   2. Code creates `new AudioAnalyser({ audioElement })`
//   3. `analyser.start()` begins amplitude sampling
//   4. Each frame, code calls `analyser.getAmplitude()` → 0..1
//      and feeds that to the mouth animation
//   5. `analyser.stop()` when audio ends
//
// API:
//   const an = new AudioAnalyser({ audioElement });
//   an.start();
//   const amp = an.getAmplitude();  // RMS energy 0..1
//   an.stop();
//
// Implementation: AnalyserNode in 'time' domain → RMS → normalize.
// FFT size 512 = small latency (~10ms at 48kHz), enough resolution
// for amplitude tracking. We don't care about frequency content for
// lip-sync — just envelope.

const FFT_SIZE = 512;
const MIN_RMS = 0.0;     // below this is silence (mouth closes)
const MAX_RMS = 0.45;    // above this is fully open

let _sharedCtx = null;
function _audioContext() {
    if (_sharedCtx) return _sharedCtx;
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    _sharedCtx = new Ctor();
    return _sharedCtx;
}

export class AudioAnalyser {
    constructor({ audioElement = null, audioBuffer = null } = {}) {
        this.audioElement = audioElement;
        this.audioBuffer  = audioBuffer;
        this.ctx     = null;
        this.analyser = null;
        this.source  = null;
        this.buf     = null;            // reusable Float32Array for samples
        this._running = false;
    }

    start() {
        if (this._running) return true;
        const ctx = _audioContext();
        if (!ctx) {
            console.warn("[AudioAnalyser] no AudioContext available");
            return false;
        }
        if (ctx.state === "suspended") {
            // Will resume on first user-initiated play, but try anyway.
            try { ctx.resume(); } catch {}
        }
        this.ctx = ctx;
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = FFT_SIZE;
        this.buf = new Float32Array(this.analyser.fftSize);
        if (this.audioElement) {
            try {
                this.source = ctx.createMediaElementSource(this.audioElement);
            } catch (e) {
                console.warn("[AudioAnalyser] createMediaElementSource failed (already wired?):", e);
                return false;
            }
            this.source.connect(this.analyser);
            this.analyser.connect(ctx.destination);    // pass-through to speakers
        } else if (this.audioBuffer) {
            this.source = ctx.createBufferSource();
            this.source.buffer = this.audioBuffer;
            this.source.connect(this.analyser);
            this.analyser.connect(ctx.destination);
            this.source.start();
        } else {
            console.warn("[AudioAnalyser] no source provided");
            return false;
        }
        this._running = true;
        return true;
    }

    // RMS amplitude in [0..1] from the most recent frame of samples.
    getAmplitude() {
        if (!this._running || !this.analyser) return 0;
        this.analyser.getFloatTimeDomainData(this.buf);
        let sumSquared = 0;
        for (let i = 0; i < this.buf.length; i++) {
            sumSquared += this.buf[i] * this.buf[i];
        }
        const rms = Math.sqrt(sumSquared / this.buf.length);
        const normalized = (rms - MIN_RMS) / (MAX_RMS - MIN_RMS);
        return Math.max(0, Math.min(1, normalized));
    }

    stop() {
        if (!this._running) return;
        this._running = false;
        try { this.source?.disconnect(); } catch {}
        try { this.analyser?.disconnect(); } catch {}
        this.source = null;
        this.analyser = null;
        this.buf = null;
    }
}
