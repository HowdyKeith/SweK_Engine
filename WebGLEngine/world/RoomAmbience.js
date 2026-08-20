// FILE: /world/RoomAmbience.js
// VERSION: v1 — round 284
//
// Per-room procedural ambient soundscape for dungeons. Sits parallel
// to /world/biomeAmbience.js (round 214) which handles outdoor biome
// ambient (snow, wind, leaves). This handles INDOOR room kinds —
// dungeon rooms produced by OllamaLevelGenerator.
//
// Each room has a derived "kind" based on its layout fields:
//   wet      — water > 0 (cistern, flooded corridor, sewer)
//   hot      — floor === "lava" or contains lava pools
//   open     — ceiling === null (outdoor courtyard inside the dungeon)
//   vacuum   — atmosphere === "vacuum" (space/moon rooms)
//   thin     — atmosphere === "thin" (martian / high altitude)
//   stone    — default (any other indoor stone-walled room)
//
// Each kind plays a procedural Web Audio drone (filtered noise + LFO)
// plus occasional sparse "blips" (water drips, wind gusts, etc.).
// Crossfades over 800ms when the player walks between rooms. No asset
// files — everything is synthesized.
//
// API:
//   const ra = new RoomAmbience({ camera, ollamaLevelGen, audio });
//   ra.start();
//   ra.tick(dt);    // call every frame
//   ra.stop();
//   ra.setEnabled(false);
//
// Console:
//   window.roomAmbience.setEnabled(true)
//   window.roomAmbience.forceKind("wet")     // testing
//   window.roomAmbience.status()             // current room + kind

const ROOM_KINDS = ["stone", "wet", "hot", "open", "vacuum", "thin"];

// One-line description for each kind, shown on first entry via KPop
const ROOM_LABELS = {
    stone:  "🪨 stone chamber",
    wet:    "💧 wet chamber",
    hot:    "🔥 hot chamber",
    open:   "🌌 open chamber",
    vacuum: "🌑 vacuum",
    thin:   "🌫 thin air",
};

const CROSSFADE_MS    = 800;
const RECHECK_MS      = 500;     // re-evaluate which room the player is in
const REANNOUNCE_MS   = 30_000;  // floor toast cooldown per kind

export class RoomAmbience {
    constructor({ camera, ollamaLevelGen, audio = null, kpop = null }) {
        this.camera = camera;
        this.ollamaLevelGen = ollamaLevelGen;
        this.audio = audio;
        this.kpop = kpop;
        this.enabled = true;
        this.active  = false;
        this._lastCheckMs = 0;
        this._currentRoomId = null;
        this._currentKind = null;
        this._forcedKind = null;
        this._layers = new Map();       // kind → { gain, oscillators... }
        this._ctx = null;
        this._masterGain = null;
        this._blipTimer = 0;
        this._lastAnnounce = new Map(); // kind → ms
    }

    start() {
        this.active = true;
        // Lazy-init the AudioContext on first user gesture. Browsers
        // refuse to construct one during page load.
    }

    stop() {
        this.active = false;
        if (this._ctx) {
            try { this._ctx.close(); } catch {}
            this._ctx = null;
        }
        this._layers.clear();
    }

    setEnabled(on) {
        this.enabled = !!on;
        if (this._masterGain) {
            try { this._masterGain.gain.value = this.enabled ? 0.5 : 0; } catch {}
        }
    }

    forceKind(kind) {
        if (!ROOM_KINDS.includes(kind)) {
            console.warn("[RoomAmbience] unknown kind:", kind, "— valid:", ROOM_KINDS);
            return;
        }
        this._forcedKind = kind;
        this._applyKind(kind, /* fadeMs */ 200);
    }

    clearForced() {
        this._forcedKind = null;
    }

    status() {
        return {
            active: this.active,
            enabled: this.enabled,
            roomId: this._currentRoomId,
            kind: this._currentKind,
            forced: this._forcedKind,
            audioStarted: !!this._ctx,
        };
    }

    // -----------------------------------------------------------------
    // Room detection
    // -----------------------------------------------------------------
    _whichRoom() {
        const layout = this.ollamaLevelGen?._lastLevel;
        if (!layout?.rooms?.length || !this.camera?.position) return null;
        const cx = this.camera.position.x;
        const cz = this.camera.position.z;
        for (const r of layout.rooms) {
            if (cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.d) {
                return r;
            }
        }
        return null;
    }

    _classifyRoom(room) {
        if (!room) return null;
        // Order matters — most specific first
        if (room.atmosphere === "vacuum")       return "vacuum";
        if (room.atmosphere === "thin")         return "thin";
        if ((room.water ?? 0) > 0)              return "wet";
        if (room.floor === "lava")              return "hot";
        if (Array.isArray(room.pools)) {
            for (const p of room.pools) if (p.kind === "lava") return "hot";
        }
        if (room.ceiling == null)               return "open";
        return "stone";
    }

    // -----------------------------------------------------------------
    // Web Audio drone construction
    // -----------------------------------------------------------------
    _ensureContext() {
        if (this._ctx) return this._ctx;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this._ctx = new AC();
            this._masterGain = this._ctx.createGain();
            this._masterGain.gain.value = this.enabled ? 0.5 : 0;
            this._masterGain.connect(this._ctx.destination);
            return this._ctx;
        } catch (e) {
            console.warn("[RoomAmbience] AudioContext create failed:", e?.message ?? e);
            return null;
        }
    }

    // Pink-noise approximation via filtered white-noise buffer source.
    // Returns the node — caller wires up filtering + gain on top.
    _makeNoiseSource(durationSec = 4) {
        const ctx = this._ctx;
        const buf = ctx.createBuffer(1, ctx.sampleRate * durationSec, ctx.sampleRate);
        const data = buf.getChannelData(0);
        // Voss-McCartney-ish trick: layered random walk approximating 1/f noise.
        // Cheap, no FFT, decent perceptual quality.
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < data.length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        return src;
    }

    // Build a layer for a given kind. Returns { gain, sources[], stop }.
    _buildLayer(kind) {
        const ctx = this._ctx;
        if (!ctx) return null;
        const out = ctx.createGain();
        out.gain.value = 0;     // ramp in via crossfade
        out.connect(this._masterGain);

        const sources = [];
        const _spawn = (configure) => {
            const src = this._makeNoiseSource();
            const result = configure(src) || src;
            src.start();
            sources.push(src);
            return result;
        };

        if (kind === "stone") {
            // Low rumble — heavy low-pass on pink noise
            _spawn((src) => {
                const lp = ctx.createBiquadFilter();
                lp.type = "lowpass";
                lp.frequency.value = 220;
                lp.Q.value = 0.7;
                const g = ctx.createGain();
                g.gain.value = 0.65;
                src.connect(lp); lp.connect(g); g.connect(out);
            });
        } else if (kind === "wet") {
            // Dripping cavern — narrow low-pass + tonal LFO on a band-pass
            _spawn((src) => {
                const lp = ctx.createBiquadFilter();
                lp.type = "lowpass";
                lp.frequency.value = 380;
                const g = ctx.createGain();
                g.gain.value = 0.40;
                src.connect(lp); lp.connect(g); g.connect(out);
            });
            // Subtle high "drip-ready" shimmer
            _spawn((src) => {
                const bp = ctx.createBiquadFilter();
                bp.type = "bandpass";
                bp.frequency.value = 2600;
                bp.Q.value = 4.0;
                const g = ctx.createGain();
                g.gain.value = 0.18;
                src.connect(bp); bp.connect(g); g.connect(out);
            });
        } else if (kind === "hot") {
            // Lava hiss — heavy high-shelf, fluctuating gain via LFO
            _spawn((src) => {
                const hp = ctx.createBiquadFilter();
                hp.type = "highpass";
                hp.frequency.value = 800;
                const g = ctx.createGain();
                g.gain.value = 0.55;
                src.connect(hp); hp.connect(g); g.connect(out);
            });
            // Low rumble (magma chamber under foot)
            _spawn((src) => {
                const lp = ctx.createBiquadFilter();
                lp.type = "lowpass";
                lp.frequency.value = 90;
                const g = ctx.createGain();
                g.gain.value = 0.80;
                src.connect(lp); lp.connect(g); g.connect(out);
            });
        } else if (kind === "open") {
            // Outdoor wind through stone — mid-band noise + slow LFO on gain
            _spawn((src) => {
                const bp = ctx.createBiquadFilter();
                bp.type = "bandpass";
                bp.frequency.value = 800;
                bp.Q.value = 0.6;
                const g = ctx.createGain();
                g.gain.value = 0.55;
                src.connect(bp); bp.connect(g); g.connect(out);
                // Slow gain LFO so the wind ebbs and flows
                const lfo = ctx.createOscillator();
                lfo.frequency.value = 0.12;
                const lfoGain = ctx.createGain();
                lfoGain.gain.value = 0.30;
                lfo.connect(lfoGain); lfoGain.connect(g.gain);
                lfo.start();
                sources.push(lfo);
            });
        } else if (kind === "vacuum") {
            // Near-silence with extremely subtle 70Hz hum (suit electronics)
            const osc = ctx.createOscillator();
            osc.frequency.value = 70;
            const g = ctx.createGain();
            g.gain.value = 0.06;
            osc.connect(g); g.connect(out);
            osc.start();
            sources.push(osc);
        } else if (kind === "thin") {
            // Sparse high band-pass — distant thin wind
            _spawn((src) => {
                const bp = ctx.createBiquadFilter();
                bp.type = "bandpass";
                bp.frequency.value = 1800;
                bp.Q.value = 1.2;
                const g = ctx.createGain();
                g.gain.value = 0.35;
                src.connect(bp); bp.connect(g); g.connect(out);
            });
        }
        return {
            gain: out,
            sources,
            stop: () => {
                for (const s of sources) {
                    try { s.stop(); } catch {}
                    try { s.disconnect(); } catch {}
                }
                try { out.disconnect(); } catch {}
            },
        };
    }

    _applyKind(kind, fadeMs = CROSSFADE_MS) {
        const ctx = this._ensureContext();
        if (!ctx) return;
        // Resume on first call — required after construction in Chrome
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }
        // Fade out everything except the target
        const now = ctx.currentTime;
        const fadeSec = Math.max(0.05, fadeMs / 1000);
        for (const [otherKind, layer] of this._layers.entries()) {
            if (otherKind === kind) continue;
            try {
                layer.gain.gain.cancelScheduledValues(now);
                layer.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
                // Tear down 100ms after the fade to free oscillators
                setTimeout(() => {
                    layer.stop();
                    this._layers.delete(otherKind);
                }, fadeMs + 100);
            } catch {}
        }
        // Fade in the target (build if needed)
        let layer = this._layers.get(kind);
        if (!layer) {
            layer = this._buildLayer(kind);
            if (!layer) return;
            this._layers.set(kind, layer);
        }
        try {
            layer.gain.gain.cancelScheduledValues(now);
            layer.gain.gain.linearRampToValueAtTime(1.0, now + fadeSec);
        } catch {}
    }

    // -----------------------------------------------------------------
    // Public tick
    // -----------------------------------------------------------------
    tick(dt) {
        if (!this.active || !this.enabled) return;
        const now = performance.now();
        if (now - this._lastCheckMs < RECHECK_MS) return;
        this._lastCheckMs = now;
        if (this._forcedKind) {
            if (this._currentKind !== this._forcedKind) {
                this._applyKind(this._forcedKind);
                this._currentKind = this._forcedKind;
            }
            return;
        }
        const room = this._whichRoom();
        if (!room) {
            // Out of any room — fade to silence (no layer)
            if (this._currentKind) {
                const ctx = this._ensureContext();
                if (ctx) {
                    const t = ctx.currentTime;
                    for (const layer of this._layers.values()) {
                        try { layer.gain.gain.linearRampToValueAtTime(0, t + CROSSFADE_MS / 1000); } catch {}
                    }
                }
                this._currentKind = null;
                this._currentRoomId = null;
            }
            return;
        }
        if (room.id === this._currentRoomId) return;
        const kind = this._classifyRoom(room);
        this._currentRoomId = room.id;
        if (kind !== this._currentKind) {
            this._applyKind(kind);
            this._currentKind = kind;
            // Optional: announce kind change via KPop toast (debounced)
            const last = this._lastAnnounce.get(kind) ?? 0;
            if (this.kpop?.info && now - last > REANNOUNCE_MS) {
                try { this.kpop.info(ROOM_LABELS[kind] ?? kind); } catch {}
                this._lastAnnounce.set(kind, now);
            }
        }
    }
}
