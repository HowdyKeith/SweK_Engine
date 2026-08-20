// FILE: ai/BrowserTTS.js
// VERSION: v1 — round 271
//
// Wraps window.speechSynthesis so the engine can route speech through
// browser-side TTS instead of (or in addition to) the PowerShell
// System.Speech bridge. Three reasons this matters:
//
//   1. **Cross-platform**: works wherever the browser does, no
//      PowerShell listener required. Useful for demos in just-Chrome.
//   2. **Browser-played audio**: the audio comes out of the browser
//      tab, so it respects browser mute, OS audio routing for the
//      Chrome process, etc.
//   3. **onboundary events**: the browser fires events at word
//      boundaries with the charIndex of the current word. This lets
//      the lip-sync system stay in step with actual speech timing
//      (browser TTS may speak faster or slower than our estimate).
//
// The audio still isn't a MediaStream so we can't AnalyserNode-tap
// it — that's the eventual Path C (PowerShell-side WAV → fetch →
// Web Audio). But for now, browser TTS + phoneme-curve mouth is a
// significant upgrade over text-length-timer mouth.
//
// API:
//   const tts = new BrowserTTS();
//   tts.available();           // → boolean
//   tts.listVoices();           // → array of available voices
//   tts.setVoice("M1", name);   // map M1 to a specific voice
//   await tts.speak(text, opts);
//      opts: { Voice: "M1"|"M2", rate, pitch, volume,
//              onBoundary: (e) => {...} }

const VOICE_FALLBACKS = {
    M1: [/female/i, /samantha/i, /lily/i, /victoria/i, /zira/i, /^en-us/i],
    M2: [/male/i, /david/i, /alex/i, /^en-gb/i, /^en/i],
};

export class BrowserTTS {
    constructor() {
        this.synth = (typeof window !== "undefined") ? window.speechSynthesis : null;
        this.voices = [];
        this.mappedVoices = { M1: null, M2: null };
        this._loadVoices();
        // Voices load asynchronously in Chrome on first access. Listen
        // for the voiceschanged event to re-pick once they're ready.
        if (this.synth?.addEventListener) {
            this.synth.addEventListener("voiceschanged", () => this._loadVoices());
        }
    }

    available() {
        return !!(this.synth && typeof SpeechSynthesisUtterance !== "undefined");
    }

    _loadVoices() {
        if (!this.synth?.getVoices) return;
        this.voices = this.synth.getVoices() || [];
        // Auto-pick best M1/M2 from fallback patterns
        for (const [tag, patterns] of Object.entries(VOICE_FALLBACKS)) {
            if (this.mappedVoices[tag]) continue;       // user already set
            for (const pat of patterns) {
                const v = this.voices.find((x) => pat.test(x.name) || pat.test(x.lang));
                if (v) { this.mappedVoices[tag] = v; break; }
            }
            // Last-resort fallback — first voice
            if (!this.mappedVoices[tag] && this.voices.length > 0) {
                this.mappedVoices[tag] = this.voices[0];
            }
        }
    }

    listVoices() {
        return this.voices.map((v) => ({ name: v.name, lang: v.lang, isDefault: v.default }));
    }

    setVoice(tag, nameOrIndex) {
        let voice = null;
        if (typeof nameOrIndex === "number") {
            voice = this.voices[nameOrIndex] ?? null;
        } else if (typeof nameOrIndex === "string") {
            voice = this.voices.find((v) => v.name === nameOrIndex) ?? null;
        }
        if (voice) {
            this.mappedVoices[tag] = voice;
            console.log(`[BrowserTTS] ${tag} → ${voice.name} (${voice.lang})`);
            return true;
        }
        return false;
    }

    speak(text, opts = {}) {
        if (!this.available()) {
            return Promise.resolve({ error: "speechSynthesis unavailable" });
        }
        if (!text) return Promise.resolve({ error: "no text" });
        if (typeof window !== "undefined" && window._swekMuted === true) return Promise.resolve({ muted: true });
        return new Promise((resolve) => {
            const u = new SpeechSynthesisUtterance(text);
            const tag = opts.Voice || "M1";
            const voice = this.mappedVoices[tag];
            if (voice) u.voice = voice;
            u.rate   = opts.rate   ?? 1.0;
            u.pitch  = opts.pitch  ?? (tag === "M2" ? 0.85 : 1.1);
            u.volume = opts.volume ?? 1.0;
            const t0 = performance.now();
            const boundaries = [];
            u.onboundary = (e) => {
                const evt = {
                    charIndex: e.charIndex ?? 0,
                    elapsed: performance.now() - t0,
                    name: e.name,
                };
                boundaries.push(evt);
                if (opts.onBoundary) {
                    try { opts.onBoundary(evt); } catch (err) { console.warn("[BrowserTTS] onBoundary threw:", err); }
                }
            };
            u.onend   = () => resolve({ ok: true, durationMs: performance.now() - t0, boundaries });
            u.onerror = (e) => resolve({ ok: false, error: e.error });
            try { this.synth.speak(u); }
            catch (e) { resolve({ ok: false, error: e?.message ?? String(e) }); }
        });
    }

    cancel() {
        try { this.synth?.cancel(); } catch {}
    }
}

let _singleton = null;
export function getBrowserTTS() {
    if (!_singleton) _singleton = new BrowserTTS();
    return _singleton;
}

export function installBrowserTTSConsoleAPI() {
    if (typeof window === "undefined") return;
    const tts = getBrowserTTS();
    window.btts = {
        available: () => tts.available(),
        voices:    () => tts.listVoices(),
        set:       (tag, name) => tts.setVoice(tag, name),
        test:      (text = "Hello world. This is a test of browser-side speech synthesis.") =>
                    tts.speak(text, { Voice: "M1" }),
        speak:     (text, opts) => tts.speak(text, opts || {}),
        cancel:    () => tts.cancel(),
        mapped:    () => ({
            M1: tts.mappedVoices.M1?.name ?? null,
            M2: tts.mappedVoices.M2?.name ?? null,
        }),
    };
    console.log("[btts] browser TTS ready. `btts.test()` to hear it, `btts.voices()` to list voices.");
}
