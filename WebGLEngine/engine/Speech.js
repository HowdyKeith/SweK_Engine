// FILE: engine/Speech.js
// Round 42 — Web Speech API wrapper for TTS announcements. Queueable,
// throttled, voice-preference-aware. Hooks into AudioManager so SFX can
// duck while a line is read.
//
// Public API:
//   speak(text, opts) — queue an utterance
//   say(text)         — neutral tone
//   warn(text)        — lower pitch / slower
//   alert(text)       — "Alert!" prefix, higher pitch
//   announce(text)    — louder, slightly slower (level/wave announcements)
//   stop()            — cancel queue
//   mute() / unmute() / setEnabled(bool)
//   setVoice(name)    — substring match against available voices
//   listVoices()      — log all to console
//
// opts: { pitch=1.0, rate=1.0, volume=0.95, emotion=null, prefix=null }
//
// Browser support: every desktop browser + recent mobile. The voices
// list arrives asynchronously, so we listen for `voiceschanged` and
// refresh the preferred voice on the first event.

export class EngineSpeech {
    constructor(audioManager) {
        this.synth = (typeof window !== "undefined" && window.speechSynthesis) || null;
        this.audioManager = audioManager ?? null;
        this.voices = [];
        this.currentVoice = null;
        this.queue = [];
        this.isSpeaking = false;
        this.enabled = true;
        this.muted = false;
        // Per-event throttle so spam can't fire 20 utterances in a frame
        this._lastSpeakAt = 0;
        this.minIntervalMs = 250;
        // Volume the AudioManager goes back to after ducking
        this._duckRestoreSFX = 0.85;
        this._duckRestoreAmbient = 0.45;

        if (!this.synth) {
            console.warn("[EngineSpeech] window.speechSynthesis unavailable; speech disabled");
            this.enabled = false;
            return;
        }
        this._loadVoices();
        // Voices populate async on Chrome
        this.synth.addEventListener?.("voiceschanged", () => this._loadVoices());
        console.log("[EngineSpeech] ready");
    }

    _loadVoices() {
        if (!this.synth) return;
        this.voices = this.synth.getVoices() || [];
        // Preference order: en-US female English voices, then any en-US,
        // then any English, then anything.
        const find = (pred) => this.voices.find(pred);
        this.currentVoice =
            find(v => /Samantha|Karen|Ava|Allison|Susan/i.test(v.name) && v.lang.startsWith("en")) ||
            find(v => /Daniel|Alex|Tom|David/i.test(v.name) && v.lang.startsWith("en")) ||
            find(v => v.lang === "en-US") ||
            find(v => v.lang.startsWith("en")) ||
            this.voices[0] || null;
    }

    setVoice(name) {
        if (typeof name === "number") {
            this.currentVoice = this.voices[name] || this.currentVoice;
            return;
        }
        if (!name) return;
        const lower = name.toLowerCase();
        const found = this.voices.find(v => v.name.toLowerCase().includes(lower));
        if (found) this.currentVoice = found;
    }

    listVoices() {
        if (!console.table) return this.voices;
        console.table(this.voices.map((v, i) => ({
            i, name: v.name, lang: v.lang, default: v.default,
        })));
        return this.voices;
    }

    // Master toggle (persists; off by default if browser doesn't have synth)
    setEnabled(b) { this.enabled = !!b; if (!b) this.stop(); }
    mute()        { this.muted = true; this.stop(); }
    unmute()      { this.muted = false; }

    speak(text, opts = {}) {
        if (!this.synth || !this.enabled || this.muted || !text) return;
        const now = performance.now();
        if (now - this._lastSpeakAt < this.minIntervalMs) {
            // Coalesce burst: drop if too soon to last utterance
            return;
        }
        this._lastSpeakAt = now;

        const prefix = opts.prefix ?? "";
        const u = new SpeechSynthesisUtterance(prefix + text);
        if (this.currentVoice) u.voice = this.currentVoice;
        u.pitch  = opts.pitch  ?? 1.0;
        u.rate   = opts.rate   ?? 1.0;
        u.volume = opts.volume ?? 0.95;

        // Emotion shortcuts
        const e = opts.emotion;
        if (e === "warning")   { u.pitch = 0.85; u.rate = 0.92; }
        else if (e === "alert")    { u.pitch = 1.22; u.rate = 1.08; }
        else if (e === "announce") { u.pitch = 0.95; u.rate = 0.95; u.volume = 1.0; }
        else if (e === "calm")     { u.pitch = 0.92; u.rate = 0.88; }

        u.onstart = () => {
            this.isSpeaking = true;
            // Duck SFX + ambient while reading
            const am = this.audioManager;
            if (am?.audio?.sfxGain && am?.audio?.ambientGain) {
                this._duckRestoreSFX     = am.audio.sfxGain.gain.value;
                this._duckRestoreAmbient = am.audio.ambientGain.gain.value;
                const t = am.audio.ctx.currentTime;
                am.audio.sfxGain.gain.setTargetAtTime(this._duckRestoreSFX * 0.35, t, 0.12);
                am.audio.ambientGain.gain.setTargetAtTime(this._duckRestoreAmbient * 0.45, t, 0.12);
            }
        };
        u.onend = () => {
            this.isSpeaking = false;
            const am = this.audioManager;
            if (am?.audio?.sfxGain && am?.audio?.ambientGain) {
                const t = am.audio.ctx.currentTime;
                am.audio.sfxGain.gain.setTargetAtTime(this._duckRestoreSFX, t, 0.25);
                am.audio.ambientGain.gain.setTargetAtTime(this._duckRestoreAmbient, t, 0.25);
            }
            this._processQueue();
        };
        u.onerror = (err) => {
            this.isSpeaking = false;
            // Swallow — common in some browsers; just continue queue
            this._processQueue();
        };

        this.queue.push(u);
        if (!this.isSpeaking) this._processQueue();
    }

    _processQueue() {
        if (!this.synth) return;
        if (this.queue.length === 0 || this.isSpeaking) return;
        try { this.synth.speak(this.queue.shift()); } catch {}
    }

    // ---- convenience wrappers (these all go through speak) ----
    say(text)      { this.speak(text); }
    warn(text)     { this.speak(text, { emotion: "warning" }); }
    alert(text)    { this.speak(text, { emotion: "alert", prefix: "Alert. " }); }
    announce(text) { this.speak(text, { emotion: "announce" }); }
    calm(text)     { this.speak(text, { emotion: "calm" }); }

    stop() {
        if (!this.synth) return;
        this.synth.cancel();
        this.queue.length = 0;
        this.isSpeaking = false;
    }
}
