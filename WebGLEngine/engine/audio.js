// FILE: engine/audio.js
// Round 38 — composed EngineAudio. Procedural-first, no asset deps.
//
// Audio graph:
//   sfxGain ────┬──→ reverbDry ──→ master
//               └──→ reverb (cave/forest/open IR) ──→ reverbWet ──→ master
//   ambientGain ───→ master
//   master ──→ underwaterFilter ──→ compressor ──→ destination
//
// Voice tracking via this.activeSources (max 24); oldest stops when full.
// dt-aware update() drives footsteps, wind gusts, dynamic ambients, reverb.

export class EngineAudio {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this.ctx;

        // ----- gain nodes -----
        this.masterGain = ctx.createGain();   this.masterGain.gain.value  = 0.92;
        this.sfxGain    = ctx.createGain();   this.sfxGain.gain.value     = 0.85;
        this.ambientGain= ctx.createGain();   this.ambientGain.gain.value = 0.45;
        // v1513 — the wind bed gets its OWN gain, default 0, so the empty /
        // sandbox stage is SILENT at the source instead of start-loud-then-gated
        // (which got stuck on when AudioManager.update never ran). update() raises
        // it only in a real, non-isolated world.
        this.windGain   = ctx.createGain();   this.windGain.gain.value    = 0;
        this._windTarget = 0;

        // ----- reverb (wet/dry) -----
        this.reverb = ctx.createConvolver();
        this.reverbDry = ctx.createGain();    this.reverbDry.gain.value   = 1.0;
        this.reverbWet = ctx.createGain();    this.reverbWet.gain.value   = 0.0;

        // ----- underwater muffler (sits between master and compressor) -----
        this.underwaterFilter = ctx.createBiquadFilter();
        this.underwaterFilter.type = "lowpass";
        this.underwaterFilter.frequency.value = 22000;   // wide-open by default
        this.underwaterFilter.Q.value = 1.2;

        // ----- compressor -----
        this.compressor = ctx.createDynamicsCompressor();

        // ----- wire graph -----
        this.sfxGain.connect(this.reverbDry);
        this.sfxGain.connect(this.reverb);
        this.reverb.connect(this.reverbWet);
        this.reverbDry.connect(this.masterGain);
        this.reverbWet.connect(this.masterGain);
        this.ambientGain.connect(this.masterGain);
        this.windGain.connect(this.ambientGain);
        this.masterGain.connect(this.underwaterFilter);
        this.underwaterFilter.connect(this.compressor);
        this.compressor.connect(ctx.destination);

        // ----- voice tracking -----
        this.activeSources = new Set();
        this.maxVoices = 24;

        // ----- runtime state -----
        this.footstepTimer = 0;
        this.lastGust = 0;
        this.currentReverbAmount = 0;

        // ----- round 274 — speech ducking refcount + cached master -----
        this._undeducedMasterGain = this.masterGain.gain.value;
        this._duckCount = 0;
        this.isUnderwater = false;

        // ----- dynamic ambient handles (set by initDynamicAmbients) -----
        this.waterFlowGain = null;
        this.lavaCrackleGain = null;
        this.lowWindStarted = false;
        this.rainGain = null;

        // ----- impulse responses -----
        this.caveImpulse = this._createImpulse(3.2, 0.085);
        this.forestImpulse = this._createImpulse(1.4, 0.22);
        this.openImpulse = this._createImpulse(0.6, 0.45);
        this.reverb.buffer = this.openImpulse;     // default

        this._loaded = new Map();   // optional sample cache

        this._initDynamicAmbients();
        this._startLowWind();

        // Resume on first user gesture (Chrome requirement)
        const resume = () => ctx.resume();
        document.addEventListener("click", resume, { once: true });
        document.addEventListener("keydown", resume, { once: true });

        console.log("[EngineAudio] initialized — procedural-first, voices capped at " + this.maxVoices);
    }

    // ====================== SPEECH DUCKING ===================================
    // Round 274 — when the robot or OLLAMA is speaking, drop the master
    // gain so the speech is intelligible over the engine soundscape.
    // Reference-counted so overlapping callers don't pop the audio.

    duck(toRatio = 0.3) {
        this._duckCount++;
        if (this._duckCount !== 1) return;
        const now = this.ctx.currentTime;
        try {
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setTargetAtTime(this._undeducedMasterGain * toRatio, now, 0.08);
        } catch {}
    }

    unduck() {
        if (this._duckCount <= 0) { this._duckCount = 0; return; }
        this._duckCount--;
        if (this._duckCount > 0) return;
        const now = this.ctx.currentTime;
        try {
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setTargetAtTime(this._undeducedMasterGain, now, 0.15);
        } catch {}
    }

    // ====================== IMPULSE / REVERB =================================

    _createImpulse(durSec, decayFactor) {
        const length = Math.floor(this.ctx.sampleRate * durSec);
        const buf = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buf.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * decayFactor));
            }
        }
        return buf;
    }

    setReverbAmount(amount, type = "open") {
        this.currentReverbAmount = Math.max(0, Math.min(1, amount));
        const now = this.ctx.currentTime;
        // Wet ramps to 0.75× amount, dry attenuates with amount (max 0.4 cut)
        this.reverbWet.gain.setTargetAtTime(this.currentReverbAmount * 0.75, now, 0.4);
        this.reverbDry.gain.setTargetAtTime(1.0 - this.currentReverbAmount * 0.4, now, 0.4);
        // Switch impulse
        const buf =
            type === "cave"   ? this.caveImpulse :
            type === "forest" ? this.forestImpulse : this.openImpulse;
        if (this.reverb.buffer !== buf) this.reverb.buffer = buf;
    }

    setUnderwater(flag) {
        if (this.isUnderwater === flag) return;
        this.isUnderwater = flag;
        const target = flag ? 720 : 22000;
        this.underwaterFilter.frequency.setTargetAtTime(
            target, this.ctx.currentTime, 0.5,
        );
    }

    // ====================== AMBIENT LOOPS ====================================

    _startLowWind() {
        if (this.lowWindStarted) return;
        this.lowWindStarted = true;
        const ctx = this.ctx;
        const noise = ctx.createBufferSource();
        const size = ctx.sampleRate * 15;
        const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
        noise.buffer = buffer;
        noise.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 340;
        noise.connect(filter).connect(this.windGain);
        noise.start();
    }

    _initDynamicAmbients() {
        const ctx = this.ctx;

        // Water flow loop — gain at 0 by default, scales with proximity
        this.waterFlowGain = ctx.createGain();
        this.waterFlowGain.gain.value = 0;
        const waterNoise = ctx.createBufferSource();
        const wsize = ctx.sampleRate * 12;
        const wbuf = ctx.createBuffer(1, wsize, ctx.sampleRate);
        const wdata = wbuf.getChannelData(0);
        for (let i = 0; i < wsize; i++) {
            wdata[i] = (Math.random() * 2 - 1) * Math.exp(-(i % (wsize * 0.09)) / (wsize * 0.14));
        }
        waterNoise.buffer = wbuf;
        waterNoise.loop = true;
        const wfilter = ctx.createBiquadFilter();
        wfilter.type = "lowpass";
        wfilter.frequency.value = 720;
        waterNoise.connect(wfilter).connect(this.waterFlowGain).connect(this.ambientGain);
        waterNoise.start();

        // Lava crackle loop
        this.lavaCrackleGain = ctx.createGain();
        this.lavaCrackleGain.gain.value = 0;
        const lavaNoise = ctx.createBufferSource();
        const lsize = ctx.sampleRate * 8;
        const lbuf = ctx.createBuffer(1, lsize, ctx.sampleRate);
        const ldata = lbuf.getChannelData(0);
        for (let i = 0; i < lsize; i++) {
            ldata[i] = (Math.random() * 2 - 1) * (0.6 + Math.sin(i * 0.008) * 0.4);
        }
        lavaNoise.buffer = lbuf;
        lavaNoise.loop = true;
        const lfilter = ctx.createBiquadFilter();
        lfilter.type = "bandpass";
        lfilter.frequency.value = 950;
        lfilter.Q.value = 0.8;
        lavaNoise.connect(lfilter).connect(this.lavaCrackleGain).connect(this.ambientGain);
        lavaNoise.start();

        // Rain loop — gain at 0 by default, scales with rainIntensity
        this.rainGain = ctx.createGain();
        this.rainGain.gain.value = 0;
        const rainNoise = ctx.createBufferSource();
        const rsize = ctx.sampleRate * 8;
        const rbuf = ctx.createBuffer(1, rsize, ctx.sampleRate);
        const rdata = rbuf.getChannelData(0);
        for (let i = 0; i < rsize; i++) rdata[i] = Math.random() * 2 - 1;
        rainNoise.buffer = rbuf;
        rainNoise.loop = true;
        const rfilter = ctx.createBiquadFilter();
        rfilter.type = "lowpass";
        rfilter.frequency.value = 2800;
        rainNoise.connect(rfilter).connect(this.rainGain).connect(this.ambientGain);
        rainNoise.start();

        // Round 40 — ocean wash ambient bed. Pink-noise-like loop low-passed
        // for soft surf hiss. Gain at 0 by default; setOceanIntensity()
        // toggles it when entering/leaving sea env.
        this.oceanGain = ctx.createGain();
        this.oceanGain.gain.value = 0;
        const oceanNoise = ctx.createBufferSource();
        const osize = ctx.sampleRate * 10;
        const obuf = ctx.createBuffer(1, osize, ctx.sampleRate);
        const odata = obuf.getChannelData(0);
        // Generate slow-pulsing wash: noise * sine envelope
        for (let i = 0; i < osize; i++) {
            const env = 0.55 + Math.sin(i * 0.00012) * 0.35 + Math.sin(i * 0.00043) * 0.18;
            odata[i] = (Math.random() * 2 - 1) * env;
        }
        oceanNoise.buffer = obuf;
        oceanNoise.loop = true;
        const ofilter = ctx.createBiquadFilter();
        ofilter.type = "lowpass";
        ofilter.frequency.value = 540;
        ofilter.Q.value = 0.5;
        oceanNoise.connect(ofilter).connect(this.oceanGain).connect(this.ambientGain);
        oceanNoise.start();
    }

    // Round 40 — ocean ambient toggle. Called when env switches to/from
    // sea. Smooth ramp over 1.5s avoids click.
    setOceanIntensity(v) {
        if (!this.oceanGain) return;
        const ctx = this.ctx;
        v = Math.max(0, Math.min(1, v));
        this.oceanGain.gain.cancelScheduledValues(ctx.currentTime);
        this.oceanGain.gain.setTargetAtTime(v * 0.65, ctx.currentTime, 0.5);
    }

    setWaterProximity(p) {
        if (!this.waterFlowGain) return;
        const target = Math.max(0, Math.min(0.55, p * 0.55));
        this.waterFlowGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);
    }

    setLavaProximity(p) {
        if (!this.lavaCrackleGain) return;
        const target = Math.max(0, Math.min(0.48, p * 0.48));
        this.lavaCrackleGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    }

    setRainIntensity(p) {
        if (!this.rainGain) return;
        const target = Math.max(0, Math.min(0.65, p * 0.65));
        this.rainGain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.2);
    }

    triggerWindGust() {
        if (this.ctx.currentTime - this.lastGust < 7) return;
        this.lastGust = this.ctx.currentTime;
        const ctx = this.ctx;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.72, ctx.currentTime + 0.7);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 4);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(220, ctx.currentTime);
        filter.frequency.linearRampToValueAtTime(1100, ctx.currentTime + 3.5);
        const noise = ctx.createBufferSource();
        const size = ctx.sampleRate * 5;
        const buf = ctx.createBuffer(1, size, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
        noise.buffer = buf;
        noise.connect(filter).connect(gain).connect(this.ambientGain);
        noise.start();
    }

    // ====================== VOICE MANAGEMENT =================================

    _addSource(src) {
        if (this.activeSources.size >= this.maxVoices) {
            const oldest = this.activeSources.values().next().value;
            if (oldest) try { oldest.stop(0); } catch (_) {}
        }
        this.activeSources.add(src);
        src.onended = () => {
            this.activeSources.delete(src);
            try { src.disconnect(); } catch (_) {}
        };
    }

    // ====================== PROCEDURAL SYNTH =================================

    playSynth(start, f1, f2, dur, wave = "sawtooth", vol = 1) {
        const ctx = this.ctx;
        // Round 120 — small random pitch/duration jitter so repeated
        // sounds (placing 10 stones, footsteps) don't read as identical
        // copies. ±7% frequency, ±5% duration. Identity to the listener
        // is preserved (still recognizably a "stone place") but the
        // tedium is gone.
        const fJitter = 0.93 + Math.random() * 0.14;
        const dJitter = 0.95 + Math.random() * 0.10;
        const _f1 = f1 * fJitter;
        const _f2 = f2 * fJitter;
        const _dur = dur * dJitter;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(_f1, start);
        osc.frequency.linearRampToValueAtTime(_f2, start + _dur);
        gain.gain.setValueAtTime(vol, start);
        gain.gain.linearRampToValueAtTime(0.001, start + _dur + 0.08);
        osc.connect(gain).connect(this.sfxGain);
        osc.start(start);
        osc.stop(start + _dur + 0.3);
        this._addSource(osc);
    }

    playNoiseBurst(start, dur, vol = 1, cutoff = 1400) {
        const ctx = this.ctx;
        // Round 120 — same jitter philosophy for noise bursts. ±10%
        // cutoff frequency drifts the timbral focus per play; ±8%
        // duration shifts the perceptual envelope.
        const cutJitter = 0.90 + Math.random() * 0.20;
        const durJitter = 0.92 + Math.random() * 0.16;
        const _cutoff = cutoff * cutJitter;
        const _dur = dur * durJitter;
        const size = Math.max(1, Math.floor(ctx.sampleRate * _dur));
        const buf = ctx.createBuffer(1, size, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < size; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * 0.28));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = _cutoff;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, start);
        gain.gain.linearRampToValueAtTime(0.001, start + _dur);
        noise.connect(filter).connect(gain).connect(this.sfxGain);
        noise.start(start);
        this._addSource(noise);
    }

    playProcedural(type, volume = 1.0) {
        const t = this.ctx.currentTime;
        switch (type) {
            // -------- PLACE --------
            case "place_stone":  this.playSynth(t, 140, 520, 0.13, "sawtooth", volume); break;
            case "place_dirt":   this.playSynth(t, 120, 380, 0.15, "triangle", volume); break;
            case "place_grass":  this.playSynth(t, 180, 620, 0.11, "sawtooth", volume); break;
            case "place_sand":   this.playNoiseBurst(t, 0.18, volume * 0.7, 1500); break;
            case "place_snow":   this.playNoiseBurst(t, 0.15, volume * 0.5, 2200); break;
            case "place_ash":    this.playNoiseBurst(t, 0.16, volume * 0.6, 1300); break;
            case "place_water":
                this.playSynth(t, 180, 920, 0.38, "sine", volume * 0.9);
                this.playNoiseBurst(t + 0.05, 0.45, volume * 0.65, 1800);
                break;
            case "place_lava":
                this.playSynth(t, 60, 180, 0.85, "sawtooth", volume * 0.75);
                this.playNoiseBurst(t + 0.1, 0.7, volume * 0.8, 680);
                this.playSynth(t + 0.4, 240, 420, 0.45, "square", volume * 0.4);
                break;
            case "place_screen":
            case "place_memory": this.playSynth(t, 660, 1320, 0.18, "sine", volume * 0.6); break;

            // -------- BREAK --------
            case "break_stone":  this.playNoiseBurst(t, 0.28, volume * 0.95, 650); break;
            case "break_dirt":   this.playNoiseBurst(t, 0.22, volume * 0.9,  800); break;
            case "break_grass":  this.playNoiseBurst(t, 0.18, volume * 0.85, 1100); break;
            case "break_sand":   this.playNoiseBurst(t, 0.2, volume * 0.8, 1700); break;
            case "break_snow":   this.playNoiseBurst(t, 0.16, volume * 0.7, 2400); break;
            case "break_ash":    this.playNoiseBurst(t, 0.22, volume * 0.85, 900); break;
            case "break_water":
                this.playNoiseBurst(t, 0.32, volume * 0.85, 2400);
                this.playSynth(t + 0.03, 620, 240, 0.25, "triangle", volume * 0.7);
                break;
            case "break_lava":
                this.playSynth(t, 60, 180, 0.85, "sawtooth", volume * 0.75);
                this.playNoiseBurst(t + 0.1, 0.7, volume * 0.8, 680);
                break;
            case "break_screen":
            case "break_memory": this.playSynth(t, 1320, 220, 0.2, "square", volume * 0.6); break;

            // -------- HIT --------
            case "hit":
                this.playNoiseBurst(t, 0.05, volume * 0.75, 1800);
                this.playSynth(t + 0.01, 880, 340, 0.07, "square", volume * 0.6);
                break;

            // -------- STEPS --------
            case "step_stone":  this.playSynth(t, 520, 160, 0.13, "square", volume * 0.7); break;
            case "step_dirt":   this.playNoiseBurst(t, 0.09, volume * 0.6, 950); break;
            case "step_grass":  this.playNoiseBurst(t, 0.085, volume * 0.55, 1050); break;
            case "step_water":
                this.playNoiseBurst(t, 0.18, volume * 0.75, 1650);
                this.playSynth(t + 0.02, 420, 880, 0.16, "sine", volume * 0.6);
                break;
            case "step_lava":
                this.playSynth(t, 90, 240, 0.22, "sawtooth", volume * 0.65);
                this.playNoiseBurst(t + 0.08, 0.25, volume * 0.55, 520);
                break;

            // -------- UI --------
            case "highlight":   this.playSynth(t, 1100, 1800, 0.035, "sine", volume * 0.35); break;

            // ===== OGRE ARC SOUNDS (round 6) ============================
            // Defender turret fire — distinct pop per type
            case "ogre_mg_fire":
                this.playSynth(t, 380, 220, 0.05, "square", volume * 0.45);
                this.playNoiseBurst(t + 0.005, 0.05, volume * 0.35, 2400);
                break;
            case "ogre_missile_fire":
                this.playNoiseBurst(t, 0.32, volume * 0.55, 600);
                this.playSynth(t, 90, 180, 0.4, "sawtooth", volume * 0.4);
                break;
            case "ogre_railgun_fire":
                // Sharp whip-crack with descending tail
                this.playSynth(t, 1800, 380, 0.1, "sawtooth", volume * 0.65);
                this.playNoiseBurst(t + 0.005, 0.18, volume * 0.5, 3200);
                break;
            // OGRE attacks
            case "ogre_plasma_fire":
                // Sci-fi zap — rising sine then resonant tail
                this.playSynth(t, 280, 720, 0.18, "sine", volume * 0.55);
                this.playSynth(t + 0.02, 420, 280, 0.14, "triangle", volume * 0.4);
                break;
            case "ogre_laser_fire":
                // Quick coherent zap
                this.playSynth(t, 1400, 1100, 0.09, "sawtooth", volume * 0.55);
                this.playSynth(t, 2200, 1800, 0.07, "square", volume * 0.3);
                break;
            case "ogre_artillery_fire":
                // Heavy thump on launch
                this.playSynth(t, 60, 30, 0.35, "triangle", volume * 0.85);
                this.playNoiseBurst(t, 0.35, volume * 0.6, 320);
                break;
            case "ogre_artillery_impact":
                // Big boom
                this.playSynth(t, 90, 38, 0.55, "sawtooth", volume * 1.0);
                this.playNoiseBurst(t, 0.55, volume * 0.85, 480);
                this.playNoiseBurst(t + 0.05, 0.4, volume * 0.55, 1600);
                break;
            // ===== ROUND 40 — new OGRE/audio coverage ============
            case "ogre_gas_blast":
                // Wet hiss + thump — toxic cloud release
                this.playNoiseBurst(t, 0.55, volume * 0.7, 2200);
                this.playSynth(t, 140, 80, 0.45, "sawtooth", volume * 0.55);
                this.playSynth(t + 0.15, 280, 180, 0.35, "triangle", volume * 0.35);
                break;
            case "ogre_breach":
                // Sub hull breach — air rush + low gurgle
                this.playNoiseBurst(t, 0.8, volume * 0.85, 380);
                this.playSynth(t, 70, 30, 0.95, "sawtooth", volume * 0.65);
                this.playNoiseBurst(t + 0.4, 0.5, volume * 0.55, 1200);
                break;
            case "ogre_mine_pop":
                // Sharp metallic click + small boom
                this.playSynth(t, 1800, 600, 0.05, "square", volume * 0.45);
                this.playNoiseBurst(t + 0.015, 0.18, volume * 0.7, 700);
                this.playSynth(t + 0.02, 110, 50, 0.22, "sawtooth", volume * 0.5);
                break;
            case "ogre_plane_strafe":
                // Doppler-ish sweep — fast descending pulse
                this.playSynth(t, 1400, 380, 0.16, "sawtooth", volume * 0.55);
                this.playNoiseBurst(t, 0.12, volume * 0.45, 1800);
                break;
            case "ogre_internal_explosion":
                // Muffled cascade boom from inside chassis
                this.playSynth(t, 110, 45, 0.45, "triangle", volume * 0.75);
                this.playNoiseBurst(t + 0.02, 0.4, volume * 0.6, 750);
                break;
            case "ogre_torpedo_launch":
                // Pressurized whoosh + propulsion start
                this.playNoiseBurst(t, 0.35, volume * 0.6, 1100);
                this.playSynth(t + 0.05, 240, 420, 0.4, "sawtooth", volume * 0.4);
                break;
            case "ogre_pilot_eject":
                // Pyrotechnic seat-pop + receding whine
                this.playSynth(t, 580, 1200, 0.08, "square", volume * 0.55);
                this.playNoiseBurst(t + 0.01, 0.15, volume * 0.55, 2200);
                this.playSynth(t + 0.05, 1100, 380, 0.55, "sawtooth", volume * 0.4);
                break;
            case "ogre_parachute_deploy":
                // Soft fabric ruffle
                this.playNoiseBurst(t, 0.35, volume * 0.5, 1400);
                break;
            // Wave + phase events
            case "ogre_phase_transition":
                // Dramatic descending sting
                this.playSynth(t, 220, 680, 0.18, "sawtooth", volume * 0.5);
                this.playSynth(t + 0.12, 680, 90, 0.55, "sawtooth", volume * 0.45);
                break;
            case "ogre_wave_start":
                // Rising klaxon — three ascending tones
                this.playSynth(t,         330, 330, 0.18, "square", volume * 0.55);
                this.playSynth(t + 0.22,  440, 440, 0.18, "square", volume * 0.55);
                this.playSynth(t + 0.44,  660, 660, 0.32, "square", volume * 0.65);
                break;
            case "ogre_wave_clear":
                // Major-arpeggio fanfare
                this.playSynth(t,        523, 523, 0.18, "sine", volume * 0.6);   // C
                this.playSynth(t + 0.18, 659, 659, 0.18, "sine", volume * 0.6);   // E
                this.playSynth(t + 0.36, 784, 784, 0.4,  "sine", volume * 0.7);   // G
                this.playSynth(t + 0.36, 1047,1047,0.4,  "sine", volume * 0.4);   // C high
                break;
            // Unit events
            case "ogre_defender_death":
                this.playNoiseBurst(t, 0.32, volume * 0.85, 700);
                this.playSynth(t, 220, 60, 0.4, "sawtooth", volume * 0.4);
                break;
            case "ogre_trample":
                // Massive stomp
                this.playSynth(t, 70, 28, 0.45, "triangle", volume * 1.0);
                this.playNoiseBurst(t, 0.32, volume * 0.7, 280);
                break;
            case "ogre_minion_spawn":
                // Mechanical clunk
                this.playSynth(t, 140, 90, 0.12, "square", volume * 0.5);
                this.playNoiseBurst(t + 0.02, 0.1, volume * 0.4, 800);
                break;
            case "ogre_minion_death":
                this.playSynth(t, 380, 80, 0.18, "sawtooth", volume * 0.45);
                break;
            case "ogre_hq_damaged":
                // Alarm warning
                this.playSynth(t, 880, 880, 0.1, "square", volume * 0.55);
                this.playSynth(t + 0.12, 880, 440, 0.18, "square", volume * 0.45);
                break;
            // UI/economy
            case "ogre_buy":
                // Confirm chime
                this.playSynth(t, 660, 990, 0.08, "sine", volume * 0.45);
                this.playSynth(t + 0.06, 990, 1320, 0.1, "sine", volume * 0.4);
                break;
            case "ogre_select":
                this.playSynth(t, 880, 1320, 0.04, "sine", volume * 0.35);
                break;
            case "ogre_move_command":
                this.playSynth(t, 660, 880, 0.06, "triangle", volume * 0.35);
                break;
            // End of game
            case "ogre_win":
                // Triumphant rise
                this.playSynth(t,        523, 523, 0.2, "sine", volume * 0.55);
                this.playSynth(t + 0.2,  659, 659, 0.2, "sine", volume * 0.55);
                this.playSynth(t + 0.4,  784, 784, 0.2, "sine", volume * 0.6);
                this.playSynth(t + 0.6, 1047,1047, 0.6, "sine", volume * 0.65);
                this.playSynth(t + 0.6,  784, 784, 0.6, "sine", volume * 0.4);
                break;
            case "ogre_lose":
                // Descending dirge
                this.playSynth(t,        330, 330, 0.4, "sawtooth", volume * 0.55);
                this.playSynth(t + 0.35, 277, 277, 0.4, "sawtooth", volume * 0.55);
                this.playSynth(t + 0.7,  220, 110, 1.0, "sawtooth", volume * 0.7);
                this.playNoiseBurst(t + 0.7, 1.2, volume * 0.4, 280);
                break;
            case "ogre_shield_break":
                // Glassy shatter — high to low cascade
                this.playSynth(t, 1800, 1800, 0.05, "sine", volume * 0.5);
                this.playSynth(t + 0.05, 2400, 600, 0.3, "sine", volume * 0.55);
                this.playNoiseBurst(t + 0.05, 0.45, volume * 0.5, 2400);
                break;

            // ===== Round 219 — FPS / WAD level sound vocabulary ========
            case "fps_fire":
                // Crisp gunshot — quick noise pop with bandpassed timbre
                this.playNoiseBurst(t, 0.08, volume * 0.95, 1800);
                this.playSynth(t, 320, 80, 0.06, "sawtooth", volume * 0.45);
                break;
            case "fps_kill":
                // Plucked string ping for the kill — short, tonal
                this.playPluckedString(t, 240, 0.45, volume * 0.7);
                break;
            case "fps_hit_player":
                // Player took damage — low thump
                this.playSynth(t, 110, 60, 0.18, "triangle", volume * 0.8);
                this.playNoiseBurst(t, 0.18, volume * 0.55, 420);
                break;
            case "fps_reload":
                // Mechanical click-shuffle
                this.playSynth(t, 380, 280, 0.08, "square", volume * 0.5);
                this.playSynth(t + 0.18, 280, 380, 0.07, "square", volume * 0.5);
                this.playNoiseBurst(t + 0.4, 0.1, volume * 0.4, 1200);
                break;
            case "fps_pickup_health":
                // FM-bell shimmer — bright, rewarding
                this.playFMBell(t, 660, 7, 6, 0.5, volume * 0.55);
                this.playSynth(t, 880, 1320, 0.18, "sine", volume * 0.3);
                break;
            case "fps_pickup_ammo":
                // Quick FM ping for ammo
                this.playFMBell(t, 880, 5, 4, 0.3, volume * 0.5);
                break;
            case "fps_level_clear":
                // Triumphant FM-bell ascending phrase
                this.playFMBell(t,        523, 2, 4, 0.5, volume * 0.6);
                this.playFMBell(t + 0.25, 659, 2, 5, 0.5, volume * 0.65);
                this.playFMBell(t + 0.5,  784, 2, 6, 0.9, volume * 0.7);
                break;
            case "fps_exit_open":
                // Portal opening — ascending sweep + shimmer
                this.playSweep(t, 220, 880, 1.2, "sine", volume * 0.45);
                this.playFMBell(t + 0.6, 1320, 7, 8, 0.8, volume * 0.4);
                break;
            case "fps_level_start":
                // Brief descending sweep — "begin"
                this.playSweep(t, 1200, 320, 0.6, "sawtooth", volume * 0.4);
                break;
            // v538 — CS bomb voices. cs_beep is the iconic short tick the
            // round manager fires at an accelerating cadence while planted;
            // cs_planted is a two-note confirmation when the plant completes.
            case "cs_beep":
                this.playSynth(t, 1850, 1850, 0.06, "square", volume * 0.6);
                break;
            case "cs_planted":
                this.playSynth(t, 660, 660, 0.10, "square", volume * 0.5);
                this.playSynth(t + 0.12, 990, 990, 0.14, "square", volume * 0.5);
                break;

            default:            this.playNoiseBurst(t, 0.12, volume * 0.6, 1200);
        }
    }

    // ====================== Round 219 — extended generators ==================
    //
    // FM bell — classic Chowning FM with carrier:modulator ratio. The
    // index parameter controls how many sidebands are produced. Ratio 7:1
    // sounds bell-like; ratio 2:1 sounds brass-like. Used by fps_kill,
    // fps_pickup_health, fps_level_clear cues.
    //
    // playFMBell(start, carrierFreq, ratio, index, dur, vol)
    playFMBell(start, carrierFreq = 440, ratio = 7, index = 5, dur = 0.5, vol = 0.5) {
        const ctx = this.ctx;
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const ampGain = ctx.createGain();

        carrier.type = "sine";
        carrier.frequency.value = carrierFreq;
        modulator.type = "sine";
        modulator.frequency.value = carrierFreq * ratio;
        // Modulation depth scales with carrier so the timbre stays
        // recognizable across pitch
        modGain.gain.value = carrierFreq * index;

        modulator.connect(modGain).connect(carrier.frequency);

        // Sharp attack + exponential decay (bell envelope)
        ampGain.gain.setValueAtTime(0, start);
        ampGain.gain.linearRampToValueAtTime(vol, start + 0.005);
        ampGain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        carrier.connect(ampGain).connect(this.sfxGain);
        carrier.start(start);
        modulator.start(start);
        carrier.stop(start + dur + 0.05);
        modulator.stop(start + dur + 0.05);
        this._addSource(carrier);
    }

    // Karplus-Strong plucked string — short noise burst through a
    // resonant lowpass with exponential decay. Used by fps_kill.
    //
    // playPluckedString(start, freq, decay, vol)
    playPluckedString(start, freq = 220, decay = 0.5, vol = 0.5) {
        const ctx = this.ctx;
        const len = Math.max(1, Math.floor(ctx.sampleRate / freq));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = freq * 6;
        filter.Q.value = 1.2;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + decay);

        src.connect(filter).connect(gain).connect(this.sfxGain);
        src.start(start);
        src.stop(start + decay + 0.1);
        this._addSource(src);
    }

    // Frequency sweep — useful for portal/exit/level-transition events.
    //
    // playSweep(start, fromHz, toHz, dur, wave, vol)
    playSweep(start, fromHz = 220, toHz = 880, dur = 0.6, wave = "sine", vol = 0.4) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(fromHz, start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, toHz), start + dur);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.02);
        gain.gain.linearRampToValueAtTime(0.001, start + dur);
        osc.connect(gain).connect(this.sfxGain);
        osc.start(start);
        osc.stop(start + dur + 0.05);
        this._addSource(osc);
    }


    // ====================== SPATIAL ==========================================
    // Round 41 — HRTF spatial: if a preloaded sample exists, route through
    // a PannerNode for true 3D positioning (left/right + front/back via
    // HRTF impulse responses, distance falloff via inverse model). If no
    // sample, fall back to the original distance-attenuated procedural
    // synth. Both paths cost the same when sound is out of audible range.

    _updateListener(camera) {
        if (!camera?.position) return;
        const l = this.ctx.listener;
        // setPosition is deprecated; positionX/Y/Z is the modern API
        if (l.positionX) {
            l.positionX.value = camera.position.x;
            l.positionY.value = camera.position.y;
            l.positionZ.value = camera.position.z;
        } else if (l.setPosition) {
            l.setPosition(camera.position.x, camera.position.y, camera.position.z);
        }
        // Forward + up vectors. If camera exposes them, use them; else
        // derive from yaw/pitch.
        let fx = 0, fy = 0, fz = -1, ux = 0, uy = 1, uz = 0;
        if (camera.forward) {
            fx = camera.forward.x; fy = camera.forward.y; fz = camera.forward.z;
        } else if (camera.yaw != null) {
            const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
            const cp = (camera.pitch != null) ? Math.cos(camera.pitch) : 1;
            const sp = (camera.pitch != null) ? Math.sin(camera.pitch) : 0;
            // Engine yaw convention: yaw=0 → -Z
            fx = sy * cp; fy = sp; fz = -cy * cp;
        }
        if (camera.up) { ux = camera.up.x; uy = camera.up.y; uz = camera.up.z; }
        if (l.forwardX) {
            l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
            l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
        } else if (l.setOrientation) {
            l.setOrientation(fx, fy, fz, ux, uy, uz);
        }
    }

    playSpatial(type, wx, wy, wz, camera, options = {}) {
        if (!camera?.position) return;
        const dx = wx - camera.position.x;
        const dy = wy - camera.position.y;
        const dz = wz - camera.position.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 140) return;

        const vol = (options.volume ?? 1.0);

        // If a preloaded sample exists for this sound, use HRTF path.
        const buf = this._loaded?.get?.(type);
        if (buf) {
            this._updateListener(camera);
            const panner = this.ctx.createPanner();
            panner.panningModel = "HRTF";
            panner.distanceModel = "inverse";
            panner.refDistance = 8;
            panner.maxDistance = 140;
            panner.rolloffFactor = 1.85;
            if (panner.positionX) {
                panner.positionX.value = wx;
                panner.positionY.value = wy;
                panner.positionZ.value = wz;
            } else if (panner.setPosition) {
                panner.setPosition(wx, wy, wz);
            }
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const gain = this.ctx.createGain();
            gain.gain.value = vol;
            src.connect(gain).connect(panner).connect(this.sfxGain);
            src.start(0);
            src.stop(this.ctx.currentTime + buf.duration + 0.05);
            this._addSource(src);
            return;
        }

        // Procedural fallback — distance-attenuated volume only.
        const falloff = Math.pow(Math.max(0, 1 - dist / 140), 1.85);
        if (falloff > 0.05) this.playProcedural(type, falloff * vol);
    }

    // Round 41 — directional cone emitter. For sounds with axis (lava
    // vents, OGRE cannon muzzle, plane engines). Caller passes a unit
    // direction; HRTF panner uses cone gain to attenuate listeners outside
    // the cone.
    playDirectional(type, wx, wy, wz, camera, dir, innerAngle = 60, outerAngle = 140) {
        if (!camera?.position) return;
        const dist = Math.hypot(wx - camera.position.x, wy - camera.position.y, wz - camera.position.z);
        if (dist > 140) return;
        const buf = this._loaded?.get?.(type);
        if (!buf) {
            // No sample — fall through to standard procedural (no cone)
            this.playSpatial(type, wx, wy, wz, camera);
            return;
        }
        this._updateListener(camera);
        const panner = this.ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 8;
        panner.maxDistance = 140;
        panner.rolloffFactor = 1.85;
        panner.coneInnerAngle = innerAngle;
        panner.coneOuterAngle = outerAngle;
        panner.coneOuterGain  = 0.3;
        if (panner.positionX) {
            panner.positionX.value = wx; panner.positionY.value = wy; panner.positionZ.value = wz;
            panner.orientationX.value = dir.x; panner.orientationY.value = dir.y; panner.orientationZ.value = dir.z;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(panner).connect(this.sfxGain);
        src.start(0);
        src.stop(this.ctx.currentTime + buf.duration + 0.05);
        this._addSource(src);
    }

    // ====================== DANGER ===========================================

    triggerDanger(level = 1) {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = level === 2 ? 160 : 240;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 1.3);
        this._addSource(osc);
    }

    // ====================== SAMPLE LOAD (optional) ===========================

    async loadSound(key, url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const arrayBuffer = await res.arrayBuffer();
            const buf = await this.ctx.decodeAudioData(arrayBuffer);
            this._loaded.set(key, buf);
            return true;
        } catch (e) {
            // procedural fallback — silently degrade
            return false;
        }
    }

    hasSample(key) { return this._loaded.has(key); }

    listSamples() { return Array.from(this._loaded.keys()); }

    // ====================== UPDATE ===========================================

    // Caller passes proximity factors (0..1) computed in main.js per frame.
    update(camera, dt, ctx = {}) {
        if (!camera) return;
        // v1000 — exclusive-isolation stages (blank sandbox / rigged showcase)
        // stay silent: zero the ambient wind bed (the click-triggered whoosh) and
        // skip wind gusts / footsteps / dynamic ambients. Race-free (runs every
        // frame once audio exists) and leaves the master/mute state untouched.
        if (typeof window !== "undefined" && window._demoIsolation === "exclusive") {
            if (this._ambientPreIsoGain == null) this._ambientPreIsoGain = this.ambientGain.gain.value;
            this.ambientGain.gain.value = 0;
            if (this._windTarget !== 0) { this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15); this._windTarget = 0; }
            return;
        } else if (this._ambientPreIsoGain != null) {
            this.ambientGain.gain.value = this._ambientPreIsoGain;
            this._ambientPreIsoGain = null;
        }
        // v1513 — the wind bed starts silent (windGain 0); bring it up only in a
        // real (non-isolated) world. Silent-by-default = no startup whoosh and
        // nothing to get "stuck on" if this update() is late or skipped.
        if (this._windTarget !== 1) { this.windGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.6); this._windTarget = 1; }
        const {
            waterProximity = 0,
            lavaProximity  = 0,
            caveFactor     = 0,
            rainIntensity  = 0,
            biomeId        = 0,
            isUnderwater   = false,
        } = ctx;

        // Footsteps — gated on horizontal speed > 5.5
        this.footstepTimer += dt;
        const speed = Math.hypot(camera.velocity?.x || 0, camera.velocity?.z || 0);
        if (speed > 5.5 && this.footstepTimer > 0.32) {
            this.playProcedural("step_grass", 0.65);   // overridden by caller via playFootstep
            this.footstepTimer = 0;
        }

        // Wind gust — framerate-independent
        this.lastGust += dt;
        if (this.lastGust > 7 && Math.random() < 0.48 * dt) {
            this.triggerWindGust();
            this.lastGust = 0;
        }

        // Dynamic ambients
        this.setWaterProximity(waterProximity);
        this.setLavaProximity(lavaProximity);
        this.setRainIntensity(rainIntensity);

        // Reverb — combine cave (primary) + water (secondary), cap at 1
        const reverbAmount = Math.min(1.0, caveFactor * 0.85 + waterProximity * 0.3);
        const reverbType =
            caveFactor > 0.6 ? "cave" :
            biomeId === 1   ? "forest" : "open";
        this.setReverbAmount(reverbAmount, reverbType);

        // Underwater
        this.setUnderwater(isUnderwater);
    }

    // ====================== VOLUME & LIFECYCLE ===============================

    setMasterVolume(v)  { this.masterGain.gain.value  = Math.max(0, Math.min(1, v)); }
    setSFXVolume(v)     { this.sfxGain.gain.value     = Math.max(0, Math.min(1, v)); }
    setAmbientVolume(v) { this.ambientGain.gain.value = Math.max(0, Math.min(1, v)); }

    stopAll() {
        for (const src of [...this.activeSources]) {
            try { src.stop(0); } catch (_) {}
        }
        this.activeSources.clear();
    }
}
