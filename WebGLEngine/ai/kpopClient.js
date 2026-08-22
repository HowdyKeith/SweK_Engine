// FILE: ai/kpopClient.js
// Round 97 — KPopListener bridge client.
//
// Talks to the ai-bridge's /kpop/* endpoints, which relay to the
// PowerShell KPopListener (v9.3+) via the named pipe
// \\.\pipe\KPopListenerPipe. The PowerShell side renders WinRT or
// BurntToast notifications, and the engine never sees Windows
// pipes directly — it just POSTs JSON to localhost.
//
// Listener payload contract (matches KPopListener.ps1 v9.3
// Process-Json):
//   {
//     "Title":     "string",
//     "Message":   "string",
//     "ToastType": "Info|Success|Warning|Error",
//     "Progress":  -1   (or 0..100)
//   }
// "Command":"STOP" shuts the listener down gracefully.
//
// Design points:
//   • Default disabled. The engine should not surface errors when
//     the listener isn't running. Caller must opt in via setEnabled
//     (SettingsPanel toggle wires this).
//   • All methods async and non-throwing. They resolve with
//     { ok: bool, error?: string } so callers can chain without
//     try/catch boilerplate.
//   • probeStatus() polls /kpop/status and caches the result for a
//     short window so a long-disabled-listener doesn't get hit on
//     every toast call.
//   • Convenience helpers (info/success/warn/error) just wrap toast
//     with the appropriate ToastType. progress() sets Progress 0..100.

export class KPopClient {
    constructor({ bridgeBase = "" } = {}) {
        // Empty bridgeBase = same-origin. Engine is served from the
        // bridge in the standard setup, so this is the default.
        this.bridgeBase = bridgeBase;
        this._enabled = false;
        this._lastStatus = null;
        this._lastStatusTime = 0;
        // Status cache lifetime. Don't hammer the bridge with status
        // probes — once per 8 seconds is plenty for a UI indicator.
        this._statusCacheMs = 8000;
        // Round 163 — mute flag. When true, toasts are SUPPRESSED at
        // the client level (no HTTP roundtrip, no beep). Distinct from
        // _enabled, which gates whether the listener is even being
        // used. Mute persists across sessions via localStorage.
        let restoredMuted = false;
        try {
            const v = localStorage.getItem("voxelengine.kpopMuted");
            restoredMuted = v === "1" || v === "true";
        } catch {}
        this._muted = restoredMuted;
        // Round 272 — restore browser-TTS route preference
        let restoredBrowser = false;
        try {
            const v = localStorage.getItem("voxelengine.kpopUseBrowserTTS");
            restoredBrowser = v === "1";
        } catch {}
        this._useBrowserTTS = restoredBrowser;
        this._bttsLoaded = false;
        this._btts = null;
        // v1031 — restore local-bridge-TTS route preference (route D: /tts/speak, SAPI/Piper)
        let restoredLocal = false;
        try { restoredLocal = localStorage.getItem("voxelengine.kpopUseLocalTts") === "1"; } catch {}
        this._useLocalTts = restoredLocal;
    }

    setEnabled(on) {
        this._enabled = !!on;
        if (this._enabled) {
            // Best-effort startup probe — surface the result via console
            // so the user can see whether the listener is reachable.
            this.probeStatus().then((s) => {
                if (s.running) {
                    console.log("[kpop] listener online — toasts enabled" + (this._muted ? " (muted)" : ""));
                } else {
                    console.warn("[kpop] toasts enabled but listener unreachable; payloads will fail with 503 until KPopListener.ps1 is started");
                }
            }).catch(() => {});
        }
    }

    isEnabled() { return this._enabled; }

    // Round 163 — mute / unmute. Muting drops toast() calls entirely
    // so no notification is fired AND no beep plays. Persisted so the
    // user doesn't have to re-mute every session.
    setMuted(b) {
        this._muted = !!b;
        try { localStorage.setItem("voxelengine.kpopMuted", this._muted ? "1" : "0"); } catch {}
    }
    isMuted() { return !!this._muted; }

    // ---- core ---------------------------------------------------------

    // Returns { running: bool, stale: bool, pipe: string }. Cached
    // briefly to avoid spamming the bridge.
    async probeStatus({ force = false } = {}) {
        if (!force && this._lastStatus && (Date.now() - this._lastStatusTime) < this._statusCacheMs) {
            return this._lastStatus;
        }
        try {
            const r = await fetch(this.bridgeBase + "/kpop/status", { cache: "no-cache" });
            if (!r.ok) {
                this._lastStatus = { running: false, error: `HTTP ${r.status}` };
            } else {
                this._lastStatus = await r.json();
            }
        } catch (e) {
            this._lastStatus = { running: false, error: e?.message ?? String(e) };
        }
        this._lastStatusTime = Date.now();
        return this._lastStatus;
    }

    // Send a toast payload. Payload may include any extra fields the
    // listener understands — they pass through verbatim. Title is
    // the only field the bridge validates; everything else is the
    // listener's contract.
    async toast(payload) {
        if (!this._enabled) return { ok: false, error: "kpop disabled" };
        // Round 274 — toast on/off toggle via KPop panel bread button.
        // When off, we silently no-op so callers don't error out.
        if (this._toastsOff) {
            return { ok: true, suppressed: true };
        }
        if (this._muted) return { ok: true, muted: true };   // Round 163
        if (!payload || typeof payload.Title !== "string" || payload.Title.length === 0) {
            return { ok: false, error: "Title required" };
        }
        // v1185 — circuit breaker. When the listener is down, the browser logs a
        // 503 for every toast POST. So while known-down (backoff up to 5 min), skip
        // the fetch entirely and just record the state — no doomed request, no noise.
        if (this._downCooldown === undefined) { this._downCooldown = 0; this._downAt = 0; this._down = false; }
        const _now = Date.now();
        if (this._down && (_now - this._downAt) < this._downCooldown) {
            return { ok: false, suppressed: true, down: true };
        }
        const _report = (ok, reason, hint) => { try { if (window.serviceStatus) window.serviceStatus.set("kpop", { label: "KPop listener", ok, reason, hint }); } catch (e) {} };
        try {
            const r = await fetch(this.bridgeBase + "/kpop/toast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || r.status === 503) {
                this._down = true; this._downAt = _now; this._downCooldown = Math.min((this._downCooldown || 0) + 30000, 300000);
                _report(false, "not running (503)", "start KPopListener.ps1");
            } else if (this._down) {
                this._down = false; this._downCooldown = 0; _report(true, "running");
            } else { _report(true, "running"); }
            return { ok: r.ok, status: r.status, ...j };
        } catch (e) {
            this._down = true; this._downAt = _now; this._downCooldown = Math.min((this._downCooldown || 0) + 30000, 300000);
            _report(false, "unreachable", "start KPopListener.ps1");
            return { ok: false, error: e?.message ?? String(e) };
        }
    }

    // Force the breaker open so the next toast probes the listener again.
    recheck() { this._down = false; this._downCooldown = 0; this._downAt = 0; }

    // ---- convenience helpers -----------------------------------------

    info(title, message)    { return this.toast({ Title: title, Message: message ?? "", ToastType: "Info"    }); }
    success(title, message) { return this.toast({ Title: title, Message: message ?? "", ToastType: "Success" }); }
    warn(title, message)    { return this.toast({ Title: title, Message: message ?? "", ToastType: "Warning" }); }
    error(title, message)   { return this.toast({ Title: title, Message: message ?? "", ToastType: "Error"   }); }

    // Progress 0..100. Listener renders a BurntToast progress bar.
    progress(title, percent, message = "") {
        const pct = Math.max(0, Math.min(100, Math.round(percent)));
        return this.toast({ Title: title, Message: message, ToastType: "Info", Progress: pct });
    }

    // Round 100 — voiced speech via System.Speech. Posts to /kpop/speak
    // which writes a {Voice, Text} payload to the pipe; the v26 shim's
    // Process-Message routes those to Speak-Voiced. Two characters
    // available: "M1" (female) and "M2" (male) — used by PalChat for
    // M1↔M2 dialogue exchanges.
    //
    // Round 272 — opt-in BrowserTTS route. When `this._useBrowserTTS`
    // is true, the call goes through window.speechSynthesis instead of
    // the PowerShell bridge. Audio plays in the browser tab; word-
    // boundary events are forwarded to onBoundary so the lip-sync can
    // re-time against actual speech rather than the text-length
    // estimate. PipAvatar.speak wraps this method and triggers the
    // visual mouth animation regardless of route.
    //
    // Toggle via console: `kpop.useBrowser(true)` (sticky in
    // localStorage across reloads).
    async speak({ Voice = "M1", Text = "", VoiceProfile = null, onBoundary = null } = {}) {
        if (!this._enabled) return { ok: false, error: "kpop disabled" };
        if (!Text || typeof Text !== "string") {
            return { ok: false, error: "Text required" };
        }
        // Round 274 — TTS mute toggle via the KPop panel speaker button.
        // We still return ok so PipAvatar visuals (mouth animation,
        // zoom) fire as usual — only the audio is suppressed.
        if (this._ttsMuted) {
            return { ok: true, muted: true };
        }
        // v1031 — route D: local bridge TTS (/tts/speak, SAPI/Piper from the
        // doc/tts bridge). Renders a WAV the browser plays, giving one
        // consistent local voice across clients regardless of the PowerShell
        // listener. Falls back to browser TTS if the bridge call fails.
        if (this._useLocalTts) {
            const r = await this._speakLocal({ Voice, Text });
            if (r && r.ok) return r;
            return this._speakBrowser({ Voice, Text, VoiceProfile, onBoundary });
        }
        if (this._useBrowserTTS) {
            return this._speakBrowser({ Voice, Text, VoiceProfile, onBoundary });
        }
        // Round 274 — auto-fallback to BrowserTTS when the PowerShell
        // bridge is unreachable. Detected via a fetch error or a 503;
        // once tripped, we flip _useBrowserTTS so subsequent calls go
        // direct to BrowserTTS instead of repeating the failed bridge
        // request. The user can still flip back with kpop.useBrowser(false)
        // once their listener is running.
        try {
            const r = await fetch(this.bridgeBase + "/kpop/speak", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ Voice, Text }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok && r.status === 503) {
                console.warn("[kpop] PowerShell bridge unreachable (503) — auto-switching to BrowserTTS for this session");
                this._useBrowserTTS = true;
                return this._speakBrowser({ Voice, Text, VoiceProfile, onBoundary });
            }
            return { ok: r.ok, status: r.status, ...j };
        } catch (e) {
            console.warn(`[kpop] bridge unreachable (${e?.message ?? e}) — auto-switching to BrowserTTS`);
            this._useBrowserTTS = true;
            return this._speakBrowser({ Voice, Text, VoiceProfile, onBoundary });
        }
    }

    // Round 272 — BrowserTTS route. Lazy-imports the BrowserTTS module
    // so the kpopClient doesn't pull in window.speechSynthesis until
    // it's actually used. Forwards VoiceProfile.pitch/rate so per-NPC
    // voice profiles from BotManager render distinctly.
    async _speakBrowser({ Voice, Text, VoiceProfile, onBoundary }) {
        try {
            if (!this._bttsLoaded) {
                const mod = await import("./BrowserTTS.js");
                this._btts = mod.getBrowserTTS();
                this._bttsLoaded = true;
            }
            const opts = { Voice, onBoundary };
            if (VoiceProfile) {
                if (typeof VoiceProfile.pitch === "number") opts.pitch = VoiceProfile.pitch;
                if (typeof VoiceProfile.rate  === "number") opts.rate  = VoiceProfile.rate;
            }
            const r = await this._btts.speak(Text, opts);
            return { ok: r.ok ?? true, route: "browser", ...r };
        } catch (e) {
            return { ok: false, error: e?.message ?? String(e) };
        }
    }

    // v1031 — route D: fetch a WAV from the local TTS bridge (/tts/speak,
    // SAPI or Piper per the bridge's tts.json config) and play it in-page.
    // Mouth animation is driven separately by PipAvatar's duration estimate,
    // so a plain Audio playback is enough here. Voice (M1/M2) maps to a small
    // rate offset; the actual voice/engine is chosen in the TTS panel.
    async _speakLocal({ Voice = "M1", Text = "" } = {}) {
        try {
            const body = { text: Text, wav: true };
            if (Voice === "M2") body.rate = -1;   // nudge the male turn a touch slower; bridge default voice otherwise
            const r = await fetch(this.bridgeBase + "/tts/speak", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.ok || !j.wav) return { ok: false, error: j.error || ("tts bridge " + r.status) };
            const url = /^https?:/i.test(j.wav) ? j.wav : (this.bridgeBase + j.wav);
            try {
                const audio = new Audio(url);
                audio.play().catch(e => console.warn("[kpop] local-tts play() rejected:", e?.message ?? e));
            } catch (e) { return { ok: false, error: "audio: " + (e?.message ?? e) }; }
            return { ok: true, route: "local", wav: url, engine: j.engine };
        } catch (e) {
            return { ok: false, error: e?.message ?? String(e) };
        }
    }

    // Toggle route D (local bridge TTS). Sticky in localStorage. Returns state.
    useLocalTts(on) {
        const v = (on === undefined) ? !this._useLocalTts : !!on;
        this._useLocalTts = v;
        try { localStorage.setItem("voxelengine.kpopUseLocalTts", v ? "1" : "0"); } catch {}
        console.log(`[kpop] speech route: ${v ? "LOCAL BRIDGE TTS (/tts/speak — SAPI/Piper)" : "default (PowerShell / browser)"}`);
        return v;
    }

    // Toggle the browser-TTS route. Sticky in localStorage so a session
    // preference survives reloads. Returns the new state.
    useBrowser(on) {
        const v = (on === undefined) ? !this._useBrowserTTS : !!on;
        this._useBrowserTTS = v;
        try { localStorage.setItem("voxelengine.kpopUseBrowserTTS", v ? "1" : "0"); } catch {}
        console.log(`[kpop] speech route: ${v ? "BROWSER TTS (window.speechSynthesis)" : "PowerShell System.Speech via bridge"}`);
        return v;
    }

    // Round 272 — request a WAV from the PowerShell bridge. Synth runs
    // System.Speech with SetOutputToWaveFile so the audio doesn't play
    // through the OS speakers; instead, the bridge returns a URL that
    // can be loaded into an HTMLAudioElement for browser playback +
    // Web Audio AnalyserNode amplitude tap (real audio-driven lip-sync,
    // "Path C" of the audio lip-sync stack).
    //
    // Returns: { ok, url, durationMs } or { ok: false, error }
    async speakWav({ Voice = "M1", Text = "" } = {}) {
        if (!Text) return { ok: false, error: "Text required" };
        try {
            const r = await fetch(this.bridgeBase + "/kpop/speak-wav", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ Voice, Text }),
            });
            const j = await r.json().catch(() => ({}));
            return { ok: r.ok, status: r.status, ...j };
        } catch (e) {
            return { ok: false, error: e?.message ?? String(e) };
        }
    }

    // Send the STOP command. After this the listener exits — only
    // useful when wrapping up or troubleshooting.
    shutdown() {
        return this.toast({ Title: "STOP", Message: "engine-initiated shutdown", Command: "STOP" });
    }
}
