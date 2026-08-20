// FILE: engine/audioBus.js
// VERSION: v1 — round 368
//
// Central audio bus. Replaces the absent JS-side audio (previously
// nothing) and the broken VBA-side audio (winmm.dll session routing
// issues). Built on Web Audio API which works in every modern browser
// without OS-level routing surprises.
//
// Two playback modes:
//
//   1. SYNTH — built-in synthesized SFX driven by oscillators. No
//      audio files needed; ships in code. 8 default voices cover the
//      Tama emotion set (happy, sad, alert, wave, feed, play, sleep,
//      speak) plus generic ping/boop/click.
//
//   2. FILE — drop a URL or AudioBuffer into the bus; it caches the
//      decoded buffer and plays on demand. Use for higher-quality
//      effects when you have the assets.
//
// Spatial:
//   playSpatial(name, x, y, z) — places the source in 3D using a
//   PannerNode with HRTF panning. Works for ambient + emitter-style
//   sounds. Caller passes world coords; the bus reads camera position
//   from window.camera if available.
//
// Master gain + mute:
//   setVolume(0..1) — master gain scalar
//   setMuted(bool) — bypasses the bus entirely
//   Persisted to localStorage.
//
// Resume-on-gesture:
//   Browsers suspend AudioContext until a user gesture. The bus
//   listens for the first click/keydown/touchstart and resumes
//   automatically. Calls before that resolve no-ops, not errors.

const STORAGE_KEY = "voxelengine.audio.v1";

/**
 * Built-in synth voices. Each is a function that takes the audioCtx +
 * a target gain node and returns the duration in ms.
 *
 * Designed to be short (50-400ms) and bright — pings, blips, chimes —
 * because they're triggered as event reactions, not background music.
 */
const VOICES = {
    // Generic
    ping:  (ctx, dst) => _tone(ctx, dst, [880],         "sine",    0.12, 0.3),
    boop:  (ctx, dst) => _tone(ctx, dst, [220],         "triangle", 0.18, 0.4),
    click: (ctx, dst) => _tone(ctx, dst, [1200],         "square",  0.04, 0.25),

    // Tama emotions
    happy: (ctx, dst) => _tone(ctx, dst, [523, 659, 784], "triangle", 0.25, 0.4),  // C-E-G major chord
    sad:   (ctx, dst) => _tone(ctx, dst, [330, 277, 220], "sine",     0.4,  0.35), // descending minor
    alert: (ctx, dst) => _tone(ctx, dst, [800, 600, 800], "square",   0.18, 0.55), // urgent siren bursts
    wave:  (ctx, dst) => _tone(ctx, dst, [659, 880],      "sine",     0.2,  0.4),
    feed:  (ctx, dst) => _tone(ctx, dst, [523, 698, 880, 1047], "triangle", 0.25, 0.45),  // fanfare
    play:  (ctx, dst) => _tone(ctx, dst, [440, 587, 440, 698], "square",  0.2,  0.4),
    sleep: (ctx, dst) => _tone(ctx, dst, [220, 165],      "sine",     0.5,  0.3),
    speak: (ctx, dst) => _tone(ctx, dst, [659],            "triangle", 0.06, 0.35), // single chirp
};

/**
 * Play a chord (or sequence) of tones with a linear-decay envelope.
 *
 * @param {AudioContext} ctx
 * @param {GainNode} dst        destination gain
 * @param {number[]} freqs      list of frequencies in Hz
 * @param {string} oscType      "sine" | "triangle" | "square" | "sawtooth"
 * @param {number} dur          per-note duration in seconds
 * @param {number} amp          per-note peak amplitude
 * @returns {number} total duration in ms
 */
function _tone(ctx, dst, freqs, oscType, dur, amp) {
    const t0 = ctx.currentTime;
    const stepDelay = freqs.length > 1 ? dur * 0.55 : 0;
    let lastEnd = t0;
    for (let i = 0; i < freqs.length; i++) {
        const start = t0 + i * stepDelay;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = oscType;
        osc.frequency.value = freqs[i];
        // Linear attack 5ms, linear decay to silence over `dur`
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(amp, start + 0.005);
        g.gain.linearRampToValueAtTime(0, start + dur);
        osc.connect(g);
        g.connect(dst);
        osc.start(start);
        osc.stop(start + dur + 0.01);
        const end = start + dur;
        if (end > lastEnd) lastEnd = end;
    }
    return (lastEnd - t0) * 1000;
}

export class AudioBus {
    constructor() {
        this._ctx     = null;       // AudioContext (lazy)
        this._master  = null;       // master GainNode
        this._buffers = new Map();   // name → AudioBuffer (for file path)
        this._urls    = new Map();   // name → URL (registered but not yet loaded)
        this._muted   = false;
        this._volume  = 1.0;
        this._resumed = false;
        this._ambient = null;        // v914 — looping ambient source (stoppable)
        this._loadPersisted();
        this._registerResumeHandlers();
    }

    _loadPersisted() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const state = JSON.parse(raw);
                if (typeof state.volume === "number") this._volume = state.volume;
                if (typeof state.muted === "boolean") this._muted  = state.muted;
            }
        } catch {}
    }

    _persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                volume: this._volume,
                muted:  this._muted,
            }));
        } catch {}
    }

    _ensureCtx() {
        if (this._ctx) return this._ctx;
        if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) {
            return null;
        }
        const Ctor = window.AudioContext || window.webkitAudioContext;
        this._ctx    = new Ctor();
        this._master = this._ctx.createGain();
        this._master.gain.value = this._muted ? 0 : this._volume;
        this._master.connect(this._ctx.destination);
        return this._ctx;
    }

    _registerResumeHandlers() {
        if (typeof window === "undefined") return;
        const resume = () => {
            const ctx = this._ensureCtx();
            if (ctx && ctx.state === "suspended") {
                ctx.resume().catch(() => {});
            }
            this._resumed = true;
        };
        ["click", "keydown", "touchstart"].forEach(ev => {
            window.addEventListener(ev, resume, { once: true });
        });
    }

    /**
     * Trigger a synth voice OR a loaded file by name.
     *
     * @param {string} name      voice or registered file name
     * @param {Object} [opts]
     * @param {number} [opts.volume=1]   per-call amplitude scalar
     * @returns {number}                   estimated duration in ms (0 if no audio)
     */
    play(name, opts = {}) {
        if (this._muted) return 0;
        const ctx = this._ensureCtx();
        if (!ctx) return 0;
        const dst = ctx.createGain();
        dst.gain.value = opts.volume ?? 1;
        dst.connect(this._master);

        // File-buffered path
        if (this._buffers.has(name)) {
            const src = ctx.createBufferSource();
            src.buffer = this._buffers.get(name);
            src.connect(dst);
            src.start();
            return Math.round(src.buffer.duration * 1000);
        }
        // Synth path
        if (VOICES[name]) {
            return Math.round(VOICES[name](ctx, dst));
        }
        // Unknown — fall back to ping
        return Math.round(VOICES.ping(ctx, dst));
    }

    /**
     * v914 — loop a preloaded buffer as an ambient track. Stops any
     * previous ambient first. The buffer must already be in _buffers
     * (callers register()+preload() before calling). Returns true if started.
     */
    loopClip(name, opts = {}) {
        const ctx = this._ensureCtx();
        if (!ctx || !this._buffers.has(name)) return false;
        this.stopAmbient();
        const dst = ctx.createGain();
        dst.gain.value = opts.volume ?? 0.7;
        dst.connect(this._master);
        const src = ctx.createBufferSource();
        src.buffer = this._buffers.get(name);
        src.loop = true;
        src.connect(dst);
        src.start();
        this._ambient = { src, gain: dst };
        return true;
    }

    /** v914 — stop the looping ambient track, if any. */
    stopAmbient() {
        try {
            if (this._ambient) {
                this._ambient.src.stop();
                this._ambient.src.disconnect();
                this._ambient.gain.disconnect();
            }
        } catch {}
        this._ambient = null;
    }

    /**
     * Play a sound at a 3D position with HRTF panning. The
     * AudioListener position is expected to be kept current by
     * updateListener() being called from the main render loop;
     * that path is more accurate for long-running sounds than the
     * play-time snapshot the older code used.
     */
    playSpatial(name, x, y, z, opts = {}) {
        if (this._muted) return 0;
        const ctx = this._ensureCtx();
        if (!ctx) return 0;

        // Defensive: if updateListener has never run, do a one-shot
        // listener-position snapshot from window.camera so the very
        // first spatial sound isn't centred at origin.
        if (window.camera?.position && ctx.listener?.positionX
            && ctx.listener.positionX.value === 0
            && ctx.listener.positionY.value === 0
            && ctx.listener.positionZ.value === 0) {
            this.updateListener(window.camera);
        }

        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 1;
        panner.maxDistance = 1000;
        panner.rolloffFactor = 1;
        if (panner.positionX) {
            panner.positionX.value = x;
            panner.positionY.value = y;
            panner.positionZ.value = z;
        } else {
            // older Safari
            panner.setPosition(x, y, z);
        }
        const dst = ctx.createGain();
        dst.gain.value = opts.volume ?? 1;
        panner.connect(dst);
        dst.connect(this._master);

        if (this._buffers.has(name)) {
            const src = ctx.createBufferSource();
            src.buffer = this._buffers.get(name);
            src.connect(panner);
            src.start();
            return Math.round(src.buffer.duration * 1000);
        }
        if (VOICES[name]) {
            return Math.round(VOICES[name](ctx, panner));
        }
        return Math.round(VOICES.ping(ctx, panner));
    }

    /**
     * Register a URL or AudioBuffer under a name. URLs are lazy-loaded
     * on first play; AudioBuffers are stored immediately.
     */
    async register(name, urlOrBuffer) {
        if (urlOrBuffer instanceof AudioBuffer) {
            this._buffers.set(name, urlOrBuffer);
            return;
        }
        if (typeof urlOrBuffer === "string") {
            this._urls.set(name, urlOrBuffer);
            // Lazy load on first use to avoid network upfront
            return;
        }
        throw new Error("audioBus.register: pass URL string or AudioBuffer");
    }

    /** Force-load a registered URL into the buffer cache. */
    async preload(name) {
        const url = this._urls.get(name);
        if (!url || this._buffers.has(name)) return false;
        const ctx = this._ensureCtx();
        if (!ctx) return false;
        try {
            const buf = await fetch(url).then(r => r.arrayBuffer());
            const decoded = await ctx.decodeAudioData(buf);
            this._buffers.set(name, decoded);
            return true;
        } catch (e) {
            console.warn(`[audioBus] preload(${name}) failed: ${e?.message ?? e}`);
            return false;
        }
    }

    setVolume(v) {
        this._volume = Math.max(0, Math.min(1, +v || 0));
        if (this._master) this._master.gain.value = this._muted ? 0 : this._volume;
        this._persist();
        return this._volume;
    }
    getVolume() { return this._volume; }

    setMuted(b) {
        this._muted = !!b;
        if (this._master) this._master.gain.value = this._muted ? 0 : this._volume;
        this._persist();
        return this._muted;
    }
    isMuted() { return this._muted; }

    /**
     * Update the AudioListener position + orientation from a camera.
     * Call this once per frame for accurate spatial audio on long-
     * running emitters (ambient loops, sustained tones). Without it,
     * PannerNode panning stays frozen at whatever the camera position
     * was when the sound was first triggered.
     *
     * @param {Object} camera   must expose camera.position.{x,y,z}.
     *                            camera.yaw / camera.pitch are read if
     *                            available for HRTF forward/up vectors.
     */
    updateListener(camera) {
        if (!camera?.position) return;
        const ctx = this._ctx;
        if (!ctx?.listener) return;
        const lis = ctx.listener;

        // Position — set on the newer AudioParam form when available,
        // fall back to the deprecated setPosition for old Safari.
        if (lis.positionX) {
            lis.positionX.value = camera.position.x;
            lis.positionY.value = camera.position.y;
            lis.positionZ.value = camera.position.z;
        } else if (typeof lis.setPosition === "function") {
            lis.setPosition(camera.position.x, camera.position.y, camera.position.z);
        }

        // Orientation — only meaningful for HRTF panning. yaw=0 looks
        // toward -Z in the engine's convention (matches camera.js).
        // forward = (-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))
        // up      = world Y for simplicity (no roll on the camera here)
        if (typeof camera.yaw === "number") {
            const yaw   = camera.yaw;
            const pitch = camera.pitch ?? 0;
            const cy = Math.cos(yaw),  sy = Math.sin(yaw);
            const cp = Math.cos(pitch), sp = Math.sin(pitch);
            const fx = -sy * cp;
            const fy =  sp;
            const fz = -cy * cp;
            if (lis.forwardX) {
                lis.forwardX.value = fx; lis.forwardY.value = fy; lis.forwardZ.value = fz;
                lis.upX.value      = 0;  lis.upY.value      = 1;  lis.upZ.value      = 0;
            } else if (typeof lis.setOrientation === "function") {
                lis.setOrientation(fx, fy, fz, 0, 1, 0);
            }
        }
    }

    /** Names of available synth voices + registered files. */
    listVoices() {
        return [...Object.keys(VOICES), ...this._buffers.keys(), ...this._urls.keys()];
    }

    // ─── v855: Music / ambient loop layer ───────────────────────────
    //
    // Procedural ambient pad — no asset files needed. Three sustained
    // oscillators tuned to a minor chord with slow detune LFO so the
    // pad breathes naturally. Low volume by default (0.25) so it sits
    // under SFX. Music gain is parallel to master under the master
    // gain — master slider still affects total output; music slider
    // scales independently below it.
    //
    // startMusic("ambient_pad") — starts the loop (idempotent: calling
    //   while playing is a no-op)
    // stopMusic() — fades out over 1s + cleans up
    // setMusicVolume(v) — 0..1, persists
    _ensureMusicGain() {
        const ctx = this._ensureCtx();
        if (!ctx) return null;
        if (this._musicGain) return this._musicGain;
        this._musicGain = ctx.createGain();
        this._musicGain.gain.value = (this._musicVolume != null) ? this._musicVolume : 0.25;
        this._musicGain.connect(this._master);
        return this._musicGain;
    }
    startMusic(name = "ambient_pad") {
        if (this._music && this._music.playing) return { ok: true, name: this._music.name };
        const ctx = this._ensureCtx();
        if (!ctx) return { ok: false, error: "no audio context" };
        const dst = this._ensureMusicGain();
        if (!dst) return { ok: false, error: "no music gain" };
        if (name !== "ambient_pad") {
            return { ok: false, error: `unknown music voice "${name}" (only "ambient_pad" supported)` };
        }
        // Build the pad: 3 oscillators on Dm9 (D F A C E) — pick D F A
        // for a warm minor triad. Detune LFOs add subtle wobble.
        const freqs = [146.83, 174.61, 220.00];   // D3, F3, A3
        const oscs = [];
        const lfos = [];
        const gains = [];
        for (let i = 0; i < freqs.length; i++) {
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freqs[i];
            // Subtle detune to keep voices from beating uniformly
            osc.detune.value = (i - 1) * 4;
            // Slow LFO on detune for breathing
            lfo.type = "sine";
            lfo.frequency.value = 0.08 + i * 0.03;   // 0.08, 0.11, 0.14 Hz
            lfoGain.gain.value = 8;                   // ±8 cents
            lfo.connect(lfoGain);
            lfoGain.connect(osc.detune);
            // Per-osc gain (softer for higher voices)
            oscGain.gain.value = 0.18 - i * 0.04;
            osc.connect(oscGain);
            oscGain.connect(dst);
            osc.start();
            lfo.start();
            oscs.push(osc);
            lfos.push(lfo);
            gains.push(oscGain);
        }
        // Smooth fade-in to avoid click
        const now = ctx.currentTime;
        dst.gain.cancelScheduledValues(now);
        dst.gain.setValueAtTime(0, now);
        const target = (this._musicVolume != null) ? this._musicVolume : 0.25;
        dst.gain.linearRampToValueAtTime(target, now + 1.5);
        this._music = { playing: true, name, oscs, lfos, gains };
        return { ok: true, name };
    }
    stopMusic() {
        if (!this._music || !this._music.playing) return { ok: true, alreadyStopped: true };
        const ctx = this._ctx;
        const dst = this._musicGain;
        if (!ctx || !dst) return { ok: false, error: "no audio context" };
        const now = ctx.currentTime;
        const fadeMs = 1000;
        // Fade out then stop oscillators after fade completes
        dst.gain.cancelScheduledValues(now);
        dst.gain.setValueAtTime(dst.gain.value, now);
        dst.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
        const { oscs, lfos } = this._music;
        setTimeout(() => {
            try { oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch {} }); } catch {}
            try { lfos.forEach(l => { try { l.stop(); l.disconnect(); } catch {} }); } catch {}
            // Restore gain so a subsequent startMusic isn't silent
            if (this._musicGain && ctx) {
                this._musicGain.gain.setValueAtTime(
                    (this._musicVolume != null) ? this._musicVolume : 0.25,
                    ctx.currentTime,
                );
            }
        }, fadeMs + 50);
        this._music.playing = false;
        return { ok: true, fading: true };
    }
    setMusicVolume(v) {
        v = Math.max(0, Math.min(1, +v || 0));
        this._musicVolume = v;
        if (this._musicGain) {
            const ctx = this._ctx;
            if (ctx) {
                this._musicGain.gain.cancelScheduledValues(ctx.currentTime);
                this._musicGain.gain.setValueAtTime(v, ctx.currentTime);
            } else {
                this._musicGain.gain.value = v;
            }
        }
        return v;
    }
    getMusicVolume() { return this._musicVolume ?? 0.25; }
    isMusicPlaying() { return !!(this._music && this._music.playing); }
}

let _singleton = null;
export function getAudioBus() {
    if (!_singleton) _singleton = new AudioBus();
    return _singleton;
}

/** Test-only — reset singleton between unit tests. */
export function _resetAudioBus() { _singleton = null; }
