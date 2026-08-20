// FILE: engine/AudioManager.js
// Round 38 — high-level audio interface. Block registry covers the 10
// voxel ids the engine actually uses. Throttled per-action so a kaiju
// destroying 30 voxels in one frame doesn't fire 30 spatial sounds.
// preload() tries fetch but procedural-fallback is fine.

import { EngineAudio } from "./audio.js";
import { EngineSpeech } from "./Speech.js";

export class AudioManager {
    constructor(opts = {}) {
        this.audio = new EngineAudio();
        this.camera = null;
        this.world = null;

        // Round 42 — TTS speech (Web Speech API). Auto-ducks sfx + ambient
        // while a line is being read. Falls back silently if browser lacks
        // speechSynthesis.
        this.speech = new EngineSpeech(this);

        // Throttle gates: per-action, in ms. Multiple voxel changes in
        // one frame collapse to ~22fps cap (45ms = ~22 plays/sec).
        this.lastAction = { place: 0, break: 0, hit: 0 };
        this.throttleMs = 45;
        this.lastHighlight = 0;

        // Block registry — covers every voxel id used by the engine.
        // Procedural sounds keyed by name; preload tries to fetch
        // sounds/{name}.wav and uses sample if present, falls back
        // to procedural otherwise.
        this.blockRegistry = {
            1:  { name: "stone",  place: "place_stone",  break: "break_stone",  hit: "hit", step: "step_stone" },
            2:  { name: "dirt",   place: "place_dirt",   break: "break_dirt",   hit: "hit", step: "step_dirt"  },
            3:  { name: "grass",  place: "place_grass",  break: "break_grass",  hit: "hit", step: "step_grass" },
            4:  { name: "sand",   place: "place_sand",   break: "break_sand",   hit: "hit", step: "step_dirt"  },
            5:  { name: "snow",   place: "place_snow",   break: "break_snow",   hit: "hit", step: "step_stone" },
            6:  { name: "ash",    place: "place_ash",    break: "break_ash",    hit: "hit", step: "step_dirt"  },
            10: { name: "water",  place: "place_water",  break: "break_water",  hit: "hit", step: "step_water" },
            12: { name: "lava",   place: "place_lava",   break: "break_lava",   hit: "hit", step: "step_lava"  },
            20: { name: "screen", place: "place_screen", break: "break_screen", hit: "hit", step: "step_stone" },
            30: { name: "memory", place: "place_memory", break: "break_memory", hit: "hit", step: "step_stone" },
        };

        // Optional setup
        if (opts.camera) this.setCamera(opts.camera);
        if (opts.world)  this.setWorld(opts.world);
    }

    setCamera(camera) { this.camera = camera; }
    setWorld(world)   { this.world = world; }

    // Round 274 — speech ducking. Passthrough to EngineAudio so callers
    // (kpop.speak, robot lip-sync) can fade the soundscape during talk.
    duckForSpeech(toRatio = 0.3) {
        try { this.audio.duck(toRatio); } catch {}
    }
    unduckSpeech() {
        try { this.audio.unduck(); } catch {}
    }
    registerBlock(id, cfg) { this.blockRegistry[id] = { ...cfg }; }

    // ====================== PRELOAD ==========================================
    // Optional. Tries to fetch sounds/{name}.wav for every unique sound name in
    // the registry. Procedural fallback used silently for any that 404.
    //
    // Round 120 — manifest gating. The browser logs failed fetches
    // unconditionally (we can't suppress the 404 banners from JS), so
    // making 27 doomed requests on every page load polluted the
    // console. Now we fetch `sounds/manifest.json` first — a list of
    // sample names actually present on disk — and only fetch those.
    // If the manifest is missing or empty, we go straight to procedural
    // mode with a single "no sample manifest" log line.
    async preload(onProgress = null) {
        const uniq = new Set();
        Object.values(this.blockRegistry).forEach(cfg => {
            if (cfg.place) uniq.add(cfg.place);
            if (cfg.break) uniq.add(cfg.break);
            if (cfg.step)  uniq.add(cfg.step);
        });
        uniq.add("hit");
        uniq.add("highlight");

        // Pull the manifest, falling through to procedural-only if absent
        let manifest = null;
        try {
            const r = await fetch("sounds/manifest.json", { cache: "no-store" });
            if (r.ok) manifest = await r.json();
        } catch {
            // Network error — same fall-through as no manifest
        }
        if (!manifest || !Array.isArray(manifest.samples) || manifest.samples.length === 0) {
            console.log("[AudioManager] no sample manifest — full procedural mode (27 procedural generators ready)");
            return { loaded: 0, failed: 0, total: 0, procedural: uniq.size };
        }

        // Only fetch samples present in manifest AND used by our registry
        const wanted = new Set(manifest.samples);
        const list = Array.from(uniq).filter(k => wanted.has(k)).map(k => [k, `sounds/${k}.wav`]);
        let loaded = 0, failed = 0;
        const total = list.length;
        await Promise.all(list.map(async ([key, url]) => {
            const ok = await this.audio.loadSound(key, url);
            if (ok) loaded++; else failed++;
            if (onProgress) onProgress({
                progress: Math.round(((loaded + failed) / total) * 100),
                loaded, failed, total, current: key,
            });
        }));
        const proceduralCount = uniq.size - loaded;
        console.log(`[AudioManager] preload: ${loaded}/${total} samples loaded, ${proceduralCount} procedural`);
        return { loaded, failed, total, procedural: proceduralCount };
    }

    listLoadedSamples() { return this.audio.listSamples(); }

    // ====================== BLOCK ACTIONS ====================================

    placeBlock(x, y, z, type = 3) {
        if (!this.camera) return;
        const now = performance.now();
        if (now - this.lastAction.place < this.throttleMs) return;
        this.lastAction.place = now;
        const cfg = this.blockRegistry[type] || this.blockRegistry[1];
        this.audio.playSpatial(cfg.place, x, y, z, this.camera);
    }

    breakBlock(x, y, z, type = 1) {
        if (!this.camera) return;
        const now = performance.now();
        if (now - this.lastAction.break < this.throttleMs) return;
        this.lastAction.break = now;
        const cfg = this.blockRegistry[type] || this.blockRegistry[1];
        this.audio.playSpatial(cfg.break, x, y, z, this.camera);
    }

    hitBlock(x, y, z, type = 1) {
        if (!this.camera) return;
        const cfg = this.blockRegistry[type] || this.blockRegistry[1];
        this.audio.playSpatial(cfg.hit, x, y, z, this.camera);
    }

    highlightBlock(x, y, z) {
        if (!this.camera) return;
        const now = performance.now();
        if (now - this.lastHighlight < 80) return;
        this.lastHighlight = now;
        this.audio.playProcedural("highlight", 0.28);
    }

    playFootstep(blockType = 3) {
        const cfg = this.blockRegistry[blockType] || this.blockRegistry[3];
        this.audio.playProcedural(cfg.step, 0.68);
    }

    triggerDanger(level = 1) { this.audio.triggerDanger(level); }

    // ====================== UPDATE ===========================================

    // Pulls proximity factors from world+camera and forwards to engine.
    // Called once per frame from main loop.
    update(dt, extras = {}) {
        if (!this.camera) return;
        const ctx = { ...extras };
        if (this.world) {
            ctx.waterProximity = this.world.getWaterProximity?.(this.camera.position) ?? 0;
            ctx.lavaProximity  = this.world.getLavaProximity?.(this.camera.position)  ?? 0;
            ctx.caveFactor     = this.world.getCaveFactor?.(this.camera.position)     ?? 0;
            ctx.isUnderwater   = this.world.isUnderwater?.(this.camera.position)      ?? false;
        }
        this.audio.update(this.camera, dt, ctx);
    }

    // ====================== VOLUME ===========================================
    setMasterVolume(v)  { this.audio.setMasterVolume(v); this._masterVolume  = v; }
    setSFXVolume(v)     { this.audio.setSFXVolume(v);    this._sfxVolume     = v; }
    setAmbientVolume(v) { this.audio.setAmbientVolume(v);this._ambientVolume = v; }

    // v855 — Generic group setter/getter the settingsHub sliders call.
    // Previously these were silently no-oping because the method
    // signature didn't exist. Routes to the specific setter + also
    // relays MUSIC group to audioBus.setMusicVolume so the new music
    // layer responds to the same slider. Accepts: "master" | "sfx" |
    // "music" | "ambient" (music + ambient share the audioBus music
    // gain since they're both the background pad).
    setVolume(group, v) {
        v = Math.max(0, Math.min(1, +v));
        const g = String(group || "").toLowerCase();
        switch (g) {
            case "master":  this.setMasterVolume(v); break;
            case "sfx":     this.setSFXVolume(v); break;
            case "music":
            case "ambient": this.setAmbientVolume(v);
                            // Also relay to the audioBus music layer
                            // so the music slider drives the new pad.
                            try {
                                const a = window.audio;
                                if (a && typeof a.setMusicVolume === "function") a.setMusicVolume(v);
                                else if (a && a.then) a.then(api => api?.setMusicVolume?.(v));
                            } catch {}
                            this._musicVolume = v;
                            break;
            default: /* silent ignore */ break;
        }
    }
    currentVolume(group) {
        const g = String(group || "").toLowerCase();
        switch (g) {
            case "master":  return this._masterVolume  ?? 1.0;
            case "sfx":     return this._sfxVolume     ?? 1.0;
            case "music":
            case "ambient": return this._musicVolume   ?? this._ambientVolume ?? 1.0;
            default: return 1.0;
        }
    }

    // v855 — Music control passthroughs so the same audioManager API
    // covers both ambient (EngineAudio's ambientGain) AND the new
    // procedural music pad (audioBus.startMusic). The settingsHub +
    // any UI button can drive both through one API.
    startMusic(name = "ambient_pad") {
        try {
            const a = window.audio;
            if (a && typeof a.startMusic === "function") return a.startMusic(name);
            if (a && a.then) return a.then(api => api?.startMusic?.(name));
        } catch {}
        return null;
    }
    stopMusic() {
        try {
            const a = window.audio;
            if (a && typeof a.stopMusic === "function") return a.stopMusic();
            if (a && a.then) return a.then(api => api?.stopMusic?.());
        } catch {}
        return null;
    }

    stopAll() { this.audio.stopAll(); try { this.stopMusic(); } catch {} }

    // ====================== SPEECH (TTS) — round 42 ==========================
    speak(text, opts)   { this.speech?.speak(text, opts); }
    say(text)           { this.speech?.say(text); }
    warn(text)          { this.speech?.warn(text); }
    alert(text)         { this.speech?.alert(text); }
    announce(text)      { this.speech?.announce(text); }
    stopSpeech()        { this.speech?.stop(); }
    muteSpeech()        { this.speech?.mute(); }
    unmuteSpeech()      { this.speech?.unmute(); }
    setSpeechEnabled(b) { this.speech?.setEnabled(b); }
}
