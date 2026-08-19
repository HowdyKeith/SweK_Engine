// FILE: /world/ProceduralMusic.js
// VERSION: v1 — round 286
//
// Adaptive procedural music — Web Audio synthesis, no asset files.
// Sibling to /world/biomeAmbience.js (outdoor biome SFX) and
// /world/RoomAmbience.js (per-room indoor drones, round 284). This
// adds melodic-and-rhythmic music on top of those ambient layers.
//
// Three modes, each with its own scale + tempo + density:
//
//   peaceful  — major pentatonic, 70 BPM, sparse 30% note density.
//               Plays during quiet exploration. Slow root drone +
//               occasional pentatonic phrases.
//
//   tense     — half-whole diminished, 100 BPM, 55% density.
//               Plays when the kaiju sandbox is active or any
//               combat-ish state. Tritone-leaning so it feels uneasy
//               without being a horror sting.
//
//   epic      — dorian mode, 130 BPM, 80% density + bass kick on the
//               downbeat. Plays during mission active or boss
//               encounters. Bigger sound, full bass+lead+kick layers.
//
// Mode selection is driven by an observer loop in tick() that looks
// at sandbox.isActive(), bossPhase state, mission state, and falls
// back to peaceful otherwise. Crossfades take 2-3 seconds — abrupt
// cuts feel cheap.
//
// Scheduling uses AudioContext.currentTime for sample-accurate
// timing — we schedule a 1-bar lookahead every 250ms via setInterval,
// not requestAnimationFrame, so beats stay tight even when frames hitch.
//
// Per-dungeon seed (passed from OllamaLevelGenerator's _lastLevel.seed)
// varies the melody-walk RNG so each dungeon sounds different but a
// given dungeon sounds consistent across visits.
//
// API:
//   const pm = new ProceduralMusic({ audio, kaijuSandbox, bossPhase,
//                                    sandboxGameplay, roomAmbience });
//   pm.start();
//   pm.tick(dt);                      // call every frame
//   pm.setMode("epic");               // manual override
//   pm.clearForcedMode();             // back to auto
//   pm.setEnabled(true|false);
//   pm.setSeed(123);                  // per-dungeon variation
//   pm.status();                      // {mode, forced, enabled, bpm}

// ---------------------------------------------------------------------
// Music theory tables — scale = semitone offsets from root
// ---------------------------------------------------------------------
const SCALES = {
    peaceful: [0, 2, 4, 7, 9],            // major pentatonic — friendly
    tense:    [0, 1, 3, 6, 8, 10],        // half-whole diminished — uneasy
    epic:     [0, 2, 3, 5, 7, 8, 10],     // dorian — heroic, slightly modal
};

const MODE_TEMPO = {                       // BPM
    peaceful: 70,
    tense:    100,
    epic:     130,
};

const MODE_NOTE_DENSITY = {                // fraction of 8th-notes that play
    peaceful: 0.30,
    tense:    0.55,
    epic:     0.80,
};

const MODE_ROOT_HZ = {                     // bass root frequency
    peaceful: 110,    // A2
    tense:    98,     // G2 — slightly darker
    epic:     65.4,   // C2 — big and low
};

const CROSSFADE_MS = 2500;

// Mulberry32 PRNG so per-dungeon seeds give reproducible melodies
function _mulberry32(seed) {
    let s = seed >>> 0;
    return function() {
        s = (s + 0x6D2B79F5) | 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class ProceduralMusic {
    constructor({
        audio = null,
        kaijuSandbox = null,
        bossPhase = null,
        sandboxGameplay = null,
        roomAmbience = null,
        seed = 1337,
    }) {
        this.audio = audio;
        this.sandbox = kaijuSandbox;
        this.bossPhase = bossPhase;
        this.sandboxGameplay = sandboxGameplay;
        this.roomAmbience = roomAmbience;
        this.enabled = true;
        this.active = false;
        this._ctx = null;
        this._master = null;
        this._currentMode = null;       // null until first state evaluation
        this._forcedMode  = null;
        this._seed = seed;
        this._rng = _mulberry32(seed);
        this._lastModeCheck = 0;
        // Per-mode synth state. Each entry: { gain, schedulerId, voices: [...] }
        this._modeLayers = new Map();
        // Note scheduler bookkeeping
        this._nextBeatTime = 0;
        this._beatCounter = 0;
        // The melody is a 16-step pattern of scale-degree indices.
        // Regenerated on mode change so the same dungeon-seed still
        // produces different phrases per mode.
        this._melodyPattern = [];
    }

    start() {
        this.active = true;
        // AudioContext stays unbuilt until first user gesture / mode
        // switch — browsers refuse to construct AC during page load.
    }

    stop() {
        this.active = false;
        for (const [mode, layer] of this._modeLayers.entries()) {
            if (layer.intervalId) clearInterval(layer.intervalId);
            try { layer.gain?.disconnect(); } catch {}
            this._modeLayers.delete(mode);
        }
        if (this._ctx) {
            try { this._ctx.close(); } catch {}
            this._ctx = null;
        }
    }

    setEnabled(on) {
        this.enabled = !!on;
        if (this._master) {
            try { this._master.gain.value = this.enabled ? 0.35 : 0; } catch {}
        }
    }

    setMode(mode) {
        if (!SCALES[mode]) {
            console.warn(`[ProceduralMusic] unknown mode "${mode}" — try: ${Object.keys(SCALES).join(", ")}`);
            return;
        }
        this._forcedMode = mode;
        this._applyMode(mode);
    }

    clearForcedMode() {
        this._forcedMode = null;
    }

    setSeed(seed) {
        this._seed = seed;
        this._rng = _mulberry32(seed);
        // Regenerate melody for the active mode so the change is audible
        if (this._currentMode) this._regenerateMelody(this._currentMode);
    }

    status() {
        return {
            enabled: this.enabled,
            active:  this.active,
            mode:    this._currentMode,
            forced:  this._forcedMode,
            bpm:     this._currentMode ? MODE_TEMPO[this._currentMode] : null,
            seed:    this._seed,
            audioStarted: !!this._ctx,
        };
    }

    // -----------------------------------------------------------------
    // Tick — observers map systems → music mode
    // -----------------------------------------------------------------
    tick(dt) {
        if (!this.active || !this.enabled) return;
        const now = performance.now();
        if (now - this._lastModeCheck < 500) return;
        this._lastModeCheck = now;
        const targetMode = this._forcedMode ?? this._evaluateAutoMode();
        if (targetMode !== this._currentMode) {
            this._applyMode(targetMode);
        }
    }

    _evaluateAutoMode() {
        // Priority order: boss > mission > sandbox-combat > peaceful
        const bossPhase = this.bossPhase?.getPhase?.();
        if (bossPhase && bossPhase !== "idle") return "epic";
        // Mission active = epic (mission is always tense + dramatic)
        if (this.sandboxGameplay?._mission) return "epic";
        // Kaiju sandbox running but no mission = tense (combat-ready)
        if (this.sandbox?.isActive?.()) return "tense";
        // Room ambience hints: hot/vacuum rooms feel tense even quiet
        const kind = this.roomAmbience?.status?.()?.kind;
        if (kind === "hot" || kind === "vacuum") return "tense";
        return "peaceful";
    }

    // -----------------------------------------------------------------
    // Web Audio plumbing
    // -----------------------------------------------------------------
    _ensureContext() {
        if (this._ctx) return this._ctx;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this._ctx = new AC();
            this._master = this._ctx.createGain();
            this._master.gain.value = this.enabled ? 0.35 : 0;
            // Light reverb-ish — short delay + feedback for spaciousness
            const delay = this._ctx.createDelay();
            delay.delayTime.value = 0.18;
            const feedback = this._ctx.createGain();
            feedback.gain.value = 0.25;
            this._master.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            // Dry+wet to destination
            this._master.connect(this._ctx.destination);
            delay.connect(this._ctx.destination);
            return this._ctx;
        } catch (e) {
            console.warn("[ProceduralMusic] AudioContext create failed:", e?.message ?? e);
            return null;
        }
    }

    _regenerateMelody(mode) {
        const scale = SCALES[mode];
        // 16-step random walk on scale degrees, centered on the root
        const pattern = [];
        let deg = 0;
        for (let i = 0; i < 16; i++) {
            // Steps of -1 / 0 / +1 / +2 weighted toward small motion
            const r = this._rng();
            const step = r < 0.20 ? -1 : r < 0.50 ? 0 : r < 0.85 ? 1 : 2;
            deg = Math.max(-scale.length, Math.min(scale.length * 2, deg + step));
            pattern.push(deg);
        }
        this._melodyPattern = pattern;
    }

    // Create the layer (oscillators, gains, scheduler) for a mode.
    // Returns { gain, intervalId, voices, scale } — held in this._modeLayers.
    _buildLayer(mode) {
        const ctx = this._ctx;
        if (!ctx) return null;
        const out = ctx.createGain();
        out.gain.value = 0;     // crossfade-in
        out.connect(this._master);

        const scale = SCALES[mode];
        const rootHz = MODE_ROOT_HZ[mode];
        const bpm = MODE_TEMPO[mode];
        const beatSec = 60 / bpm;
        // 8th-note grid → twice per beat
        const stepSec = beatSec / 2;

        // Bass drone — always on for this layer
        const bassOsc = ctx.createOscillator();
        bassOsc.type = mode === "epic" ? "sawtooth" : "triangle";
        bassOsc.frequency.value = rootHz;
        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = "lowpass";
        bassFilter.frequency.value = mode === "epic" ? 400 : 220;
        const bassGain = ctx.createGain();
        bassGain.gain.value = 0.25;
        bassOsc.connect(bassFilter); bassFilter.connect(bassGain); bassGain.connect(out);
        bassOsc.start();

        // Slow LFO on bass filter for movement
        const bassLfo = ctx.createOscillator();
        bassLfo.frequency.value = 0.15;
        const bassLfoGain = ctx.createGain();
        bassLfoGain.gain.value = 80;
        bassLfo.connect(bassLfoGain); bassLfoGain.connect(bassFilter.frequency);
        bassLfo.start();

        // Pad — sustained two-note interval (root + fifth) at mid octave
        const padOsc1 = ctx.createOscillator();
        padOsc1.type = "sine";
        padOsc1.frequency.value = rootHz * 2;
        const padOsc2 = ctx.createOscillator();
        padOsc2.type = "sine";
        padOsc2.frequency.value = rootHz * 3;     // perfect fifth above the octave
        const padGain = ctx.createGain();
        padGain.gain.value = 0.10;
        padOsc1.connect(padGain); padOsc2.connect(padGain); padGain.connect(out);
        padOsc1.start(); padOsc2.start();

        const voices = [bassOsc, bassLfo, padOsc1, padOsc2];

        // Note scheduler — every 250ms, schedule the next 4 steps
        // (~ half a bar of lookahead).
        this._regenerateMelody(mode);
        // Anchor to context time so different modes don't drift apart
        if (this._nextBeatTime === 0) {
            this._nextBeatTime = ctx.currentTime + 0.1;
        }
        const intervalId = setInterval(() => {
            if (!this._ctx) return;
            const now = this._ctx.currentTime;
            const lookahead = 0.30;     // schedule 300ms ahead
            while (this._nextBeatTime < now + lookahead) {
                this._scheduleStep(mode, scale, rootHz, this._nextBeatTime, out);
                this._nextBeatTime += stepSec;
                this._beatCounter++;
            }
        }, 250);

        return {
            gain: out, intervalId, voices, scale, mode,
            stop: () => {
                clearInterval(intervalId);
                for (const v of voices) {
                    try { v.stop(); } catch {}
                    try { v.disconnect(); } catch {}
                }
                try { out.disconnect(); } catch {}
            },
        };
    }

    _scheduleStep(mode, scale, rootHz, t, outGain) {
        const ctx = this._ctx;
        if (!ctx) return;
        const density = MODE_NOTE_DENSITY[mode];
        // Melody — pick from the 16-step pattern
        const step = this._beatCounter % this._melodyPattern.length;
        const deg = this._melodyPattern[step];
        if (this._rng() < density) {
            const scaleLen = scale.length;
            const octShift = Math.floor((deg + scaleLen * 4) / scaleLen) - 4;
            const degMod   = ((deg % scaleLen) + scaleLen) % scaleLen;
            const semitones = scale[degMod] + octShift * 12;
            // Lead is 3 octaves above root
            const freq = rootHz * 8 * Math.pow(2, semitones / 12);
            this._pluck(freq, t, mode === "epic" ? 0.32 : 0.22, 0.12, outGain);
        }
        // Kick on downbeat for epic mode
        if (mode === "epic" && (this._beatCounter % 4 === 0)) {
            this._kick(t, outGain);
        }
        // Hat on offbeat for tense + epic
        if (mode !== "peaceful" && (this._beatCounter % 2 === 1)) {
            this._hat(t, outGain);
        }
    }

    _pluck(freq, t, duration, gainPeak, out) {
        const ctx = this._ctx;
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const g = ctx.createGain();
        // Quick attack, exponential decay
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gainPeak, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(g); g.connect(out);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    _kick(t, out) {
        const ctx = this._ctx;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(g); g.connect(out);
        osc.start(t);
        osc.stop(t + 0.20);
    }

    _hat(t, out) {
        const ctx = this._ctx;
        // Noise via tiny buffer source
        const buf = ctx.createBuffer(1, 4096, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        src.connect(hp); hp.connect(g); g.connect(out);
        src.start(t);
        src.stop(t + 0.08);
    }

    _applyMode(mode) {
        const ctx = this._ensureContext();
        if (!ctx) return;
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const fadeSec = CROSSFADE_MS / 1000;
        // Fade out all other modes
        for (const [otherMode, layer] of this._modeLayers.entries()) {
            if (otherMode === mode) continue;
            try {
                layer.gain.gain.cancelScheduledValues(now);
                layer.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
                setTimeout(() => {
                    layer.stop();
                    this._modeLayers.delete(otherMode);
                }, CROSSFADE_MS + 100);
            } catch {}
        }
        // Build and fade in target
        let layer = this._modeLayers.get(mode);
        if (!layer) {
            layer = this._buildLayer(mode);
            if (!layer) return;
            this._modeLayers.set(mode, layer);
        }
        try {
            layer.gain.gain.cancelScheduledValues(now);
            layer.gain.gain.linearRampToValueAtTime(1.0, now + fadeSec);
        } catch {}
        this._currentMode = mode;
        console.log(`[ProceduralMusic] mode → ${mode} (${MODE_TEMPO[mode]} BPM)`);
    }
}
