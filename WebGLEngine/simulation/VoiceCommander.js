// =============================================================================
// FILE: /simulation/VoiceCommander.js
// ROUND: 218
// =============================================================================
//
// Voice control for the engine. Captures the microphone via Web Audio
// API + Web Speech Recognition, parses commands, and routes them to
// existing engine APIs (fps, bots, world, ollamaLevel). Includes a
// lightweight energy-based VAD so "BANG" is recognized as soon as the
// user finishes saying it, rather than waiting for a recognition turn
// to time out.
//
// Recognized commands (all case-insensitive, partial match OK):
//
//   "bang" / "shoot" / "fire" / "pew"      → fps.fire()
//   "reload" / "reload now"                → fpsShooter.startReload()
//   "spawn bot" / "spawn a bot"            → bots.spawnAtPlayer()
//   "clear bots" / "clear all bots"        → bots.clear()
//   "stop firing" / "ceasefire"            → no-op confirmation toast
//   "place stone at X Y Z"                 → world.setVoxel(x,y,z,STONE)
//   "place dirt at X Y Z"                  → world.setVoxel(x,y,z,DIRT)
//   "regenerate world" / "fresh world"     → world.regenerate()
//   "what biome" / "where am I"            → speaks current biome
//   "level <description>"                  → ollamaLevel.generate(desc)
//
// Design choices:
//   • Uses Web Speech Recognition with continuous=true, interimResults=true
//     so we can react to partial transcripts (e.g. "bang" before the
//     user keeps talking).
//   • Web Audio VAD measures RMS volume from the same mic stream the
//     recognizer is hearing. We use it ONLY for the visual indicator
//     (not to gate sending) since speech recognition has its own VAD.
//   • Visual indicator: small fixed-position pill bottom-left that
//     shows current state (idle / listening / recognized: "...").
//   • All commands optionally confirm via the engine's existing audio
//     (procedural beep through engineAudio if available, else web-audio
//     tone osc).
//
// API:
//   const vc = new VoiceCommander({
//       fps: window.fps, bots: window.bots, world, ollamaLevelGen,
//       camera, biomeMap, kpop, audioContext: null
//   });
//   vc.start();   // requests mic permission + starts continuous listening
//   vc.stop();
//
// Console:
//   window.voice.start()
//   window.voice.stop()
//   window.voice.test("bang")    // simulate a transcript without mic
//   window.voice.toggle()
// =============================================================================

// Command grammar — regex / contains tests. Order matters: more specific
// first. Each entry: { name, match: fn(lowerText) → match object | null,
//                       run: (matchObj, ctx) → void }
function buildCommands() {
    return [
        {
            name: "next_level",
            match: (t) => /\b(next|skip).{0,8}(level|dungeon)\b/.test(t) ? { hit: "next" } : null,
            run: (_, ctx) => {
                // Force exit-triggered on the FPSShooter instance, which
                // makes _checkExit fire the onExitEntered callback even
                // when enemies are still alive. main.js wires that
                // callback to generate the next level.
                const inst = ctx.fpsShooterInstance;
                if (!inst) return;
                inst._exitOpen = true;       // bypass "must be cleared" gate
                inst._exitInfo = inst._exitInfo || { id: 0, x: ctx.camera?.position?.x ?? 0, z: ctx.camera?.position?.z ?? 0 };
                inst._exitTriggered = false; // allow re-trigger if already cleared
                if (inst._onExitEnteredCb) {
                    try { inst._onExitEnteredCb(); inst._exitTriggered = true; } catch {}
                }
            },
        },
        {
            name: "fire",
            match: (t) => /\b(bang|shoot|fire|pew)\b/.test(t) ? { hit: "fire" } : null,
            run: (_, ctx) => ctx.fps?.fire?.(),
        },
        {
            name: "reload",
            match: (t) => /\breload\b/.test(t) ? { hit: "reload" } : null,
            run: (_, ctx) => {
                if (ctx.fps?.start) {
                    // FPSShooter exposes startReload through the instance; use module access
                    const inst = ctx.fpsShooterInstance;
                    inst?.startReload?.();
                }
            },
        },
        {
            name: "spawn_bot",
            match: (t) => /\bspawn\b.*\b(bot|enemy|grunt|sniper|heavy)\b/.test(t) ? { kind: "auto" } : null,
            run: (m, ctx) => {
                if (!ctx.bots?.spawnAtPlayer) return;
                let kind = "bot_grunt";
                if (m?.kind === "auto") {
                    // Could parse "sniper" / "heavy" out of the text
                    const text = ctx.lastTranscript || "";
                    if (/sniper/i.test(text)) kind = "bot_sniper";
                    else if (/heavy/i.test(text)) kind = "bot_heavy";
                }
                ctx.bots.spawnAtPlayer({ kind });
            },
        },
        {
            name: "clear_bots",
            match: (t) => /\bclear\b.*\b(bots?|enemies?)\b/.test(t) ? { hit: "clear" } : null,
            run: (_, ctx) => ctx.bots?.clear?.(),
        },
        {
            name: "stop_fps",
            match: (t) => /\b(stop|exit|quit|cease).*\b(fps|fire|game|fighting)\b/.test(t) ? { hit: "stop" } : null,
            run: (_, ctx) => ctx.fps?.stop?.(),
        },
        {
            name: "place_voxel",
            match: (t) => {
                const m = t.match(/place (\w+) at (-?\d+)[\s,]+(-?\d+)[\s,]+(-?\d+)/);
                if (!m) return null;
                return { material: m[1], x: +m[2], y: +m[3], z: +m[4] };
            },
            run: (m, ctx) => {
                if (!ctx.world?.setVoxel) return;
                const mats = { stone: 1, dirt: 2, grass: 3, sand: 4, snow: 5, ash: 6, water: 10, lava: 12 };
                const id = mats[m.material] ?? 1;
                ctx.world.setVoxel(m.x, m.y, m.z, id);
            },
        },
        {
            name: "regenerate",
            match: (t) => /\b(regenerate|reset|fresh)\b.*\bworld\b/.test(t) ? { hit: "regen" } : null,
            run: (_, ctx) => ctx.world?.regenerate?.(),
        },
        {
            name: "what_biome",
            match: (t) => /\b(what biome|where am i|where am i at|current biome)\b/.test(t) ? { hit: "biome" } : null,
            run: (_, ctx) => {
                if (!ctx.camera?.position || !ctx.biomeMap?.getBiomeAt) return;
                const biome = ctx.biomeMap.getBiomeAt(ctx.camera.position.x | 0, ctx.camera.position.z | 0);
                if (ctx.kpop?.speak) ctx.kpop.speak({ Voice: "M1", Text: `You are in the ${biome}.` }).catch(()=>{});
                if (ctx.kpop?.info) ctx.kpop.info("Biome", biome).catch(()=>{});
            },
        },
        {
            name: "level_generate",
            match: (t) => {
                // "level <description>" or "generate level <description>"
                const m = t.match(/^(?:generate\s+)?level\s+(.+)/);
                if (!m) return null;
                return { description: m[1].trim() };
            },
            run: (m, ctx) => {
                if (!ctx.ollamaLevelGen?.generate) return;
                ctx.ollamaLevelGen.generate(m.description).catch(()=>{});
            },
        },
    ];
}

export class VoiceCommander {
    constructor({
        fps = null, bots = null, world = null,
        ollamaLevelGen = null, camera = null, biomeMap = null,
        kpop = null,
        fpsShooterInstance = null,   // raw instance (for startReload etc.)
    } = {}) {
        this.fps = fps;
        this.bots = bots;
        this.world = world;
        this.ollamaLevelGen = ollamaLevelGen;
        this.camera = camera;
        this.biomeMap = biomeMap;
        this.kpop = kpop;
        this.fpsShooterInstance = fpsShooterInstance;

        this.active = false;
        this.recognition = null;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.vadFrame = null;
        this.lastTranscript = "";
        this.lastCommand = null;
        this.commands = buildCommands();

        this._statusEl = null;
        this._levelEl = null;
        this._counts = { recognized: 0, commandsRun: 0, errors: 0 };
        this._recentlyFired = new Map();   // command name → last fire ms (debounce)

        this._initRecognition();
        this._buildIndicator();
    }

    _initRecognition() {
        const SR = (typeof window !== "undefined") &&
                   (window.SpeechRecognition || window.webkitSpeechRecognition);
        if (!SR) {
            console.warn("[voice] Web Speech Recognition not available in this browser");
            return;
        }
        this.recognition = new SR();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = "en-US";

        this.recognition.onresult = (e) => {
            let transcript = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
            }
            transcript = transcript.toLowerCase().trim();
            if (!transcript) return;
            this.lastTranscript = transcript;
            this._updateIndicator(`"${transcript}"`);
            this._tryParse(transcript);
        };

        this.recognition.onerror = (e) => {
            this._counts.errors++;
            console.warn("[voice] recognition error:", e.error || e);
            // 'no-speech' is normal; only show real errors
            if (e.error && e.error !== "no-speech") {
                this._updateIndicator(`error: ${e.error}`, "#f44");
            }
        };

        this.recognition.onend = () => {
            // Auto-restart when active (continuous mode sometimes ends after ~30s)
            if (this.active) {
                try { this.recognition.start(); } catch {}
            }
        };
    }

    async _startVAD() {
        try {
            this.audioContext = this.audioContext ||
                new (window.AudioContext || window.webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.microphone.connect(this.analyser);
            this._tickVAD();
        } catch (e) {
            console.warn("[voice] VAD mic stream failed:", e?.message ?? e);
        }
    }

    _tickVAD() {
        if (!this.active || !this.analyser) return;
        const buf = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (this._levelEl) {
            const pct = Math.min(100, rms * 1.5);
            this._levelEl.style.width = pct + "%";
            this._levelEl.style.background = rms > 22 ? "#4f8" : "#446";
        }
        this.vadFrame = requestAnimationFrame(() => this._tickVAD());
    }

    async start() {
        if (this.active) return;
        if (!this.recognition) {
            this._updateIndicator("no Web Speech support", "#f44");
            return false;
        }
        this.active = true;
        await this._startVAD();
        try { this.recognition.start(); } catch (e) {}
        this._updateIndicator("listening…", "#4f8");
        console.log("[voice] active — say BANG to fire, SPAWN BOT, REGENERATE WORLD, LEVEL <desc>, etc.");
        return true;
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        try { this.recognition?.stop(); } catch {}
        if (this.vadFrame) cancelAnimationFrame(this.vadFrame);
        this._updateIndicator("off", "#888");
    }

    toggle() { return this.active ? this.stop() : this.start(); }

    // Manual test entry — simulate a transcript
    test(transcript) {
        this.lastTranscript = transcript.toLowerCase();
        this._updateIndicator(`(test) "${this.lastTranscript}"`);
        this._tryParse(this.lastTranscript);
    }

    _tryParse(transcript) {
        const ctx = {
            fps: this.fps, bots: this.bots, world: this.world,
            ollamaLevelGen: this.ollamaLevelGen, camera: this.camera,
            biomeMap: this.biomeMap, kpop: this.kpop,
            fpsShooterInstance: this.fpsShooterInstance,
            lastTranscript: this.lastTranscript,
        };
        for (const cmd of this.commands) {
            const matchData = cmd.match(transcript);
            if (matchData) {
                // Debounce — don't fire same command more than 4 times/sec
                const now = performance.now();
                const last = this._recentlyFired.get(cmd.name) ?? 0;
                if (now - last < 250) return;
                this._recentlyFired.set(cmd.name, now);

                this._counts.commandsRun++;
                this.lastCommand = cmd.name;
                this._updateIndicator(`→ ${cmd.name}`, "#fc4");
                try {
                    cmd.run(matchData, ctx);
                } catch (e) {
                    console.warn(`[voice] command ${cmd.name} threw:`, e?.message ?? e);
                }
                return;
            }
        }
        this._counts.recognized++;
    }

    _buildIndicator() {
        if (typeof document === "undefined") return;
        const root = document.createElement("div");
        root.id = "voice-commander-hud";
        Object.assign(root.style, {
            position: "fixed", bottom: "60px", left: "16px",
            background: "rgba(0,0,0,0.78)", color: "#cfc",
            padding: "6px 10px", borderRadius: "12px",
            fontFamily: "monospace", fontSize: "11px",
            zIndex: "8550", minWidth: "180px",
            border: "1px solid #2a4",
            // Round 263c — hidden by default; voice state mirrored in
            // STATUS panel. The level meter is the only thing that
            // would benefit from staying visible, but the user's
            // feedback was "this goes into STATUS" so we honor that.
            display: "none",
        });
        root.innerHTML =
            `<span style="color:#cf8;">🎤 voice</span> ` +
            `<span id="voice-status">off</span>` +
            `<div style="margin-top:4px; height:4px; background:#222; border-radius:2px; overflow:hidden;">` +
            `<div id="voice-level" style="height:100%; width:0%; background:#446; transition:width 0.05s;"></div>` +
            `</div>`;
        document.body.appendChild(root);
        this._statusEl = document.getElementById("voice-status");
        this._levelEl  = document.getElementById("voice-level");
    }

    _updateIndicator(text, color) {
        if (!this._statusEl) return;
        this._statusEl.textContent = text;
        if (color) this._statusEl.style.color = color;
    }

    getStats() {
        return {
            active: this.active,
            lastTranscript: this.lastTranscript,
            lastCommand: this.lastCommand,
            ...this._counts,
        };
    }
}
