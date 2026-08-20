// =============================================================================
// FILE: /simulation/Weather.js
// ROUND: 245
// =============================================================================
//
// Weather overlays. Three types:
//
//   • rain  — falling pale-blue particles + slate-blue desaturation tint
//   • mist  — slight desaturation + brightness drop + cool tint; no particles
//   • snow  — slow drifting white particles + cool tint
//   • clear — nothing
//
// Triggers:
//   1) Explicit layout.weather field (from Ollama schema) — overrides everything
//   2) Time-of-day default (when no explicit field):
//        04-07 (dawn)   → mist
//        07-17 (day)    → clear
//        17-21 (dusk)   → rain
//        21-04 (night)  → clear
//
// The default mapping is conservative — most levels play clear. The
// Ollama prompt encourages explicit weather for atmospheric levels
// (ice dungeon → snow, swamp → mist, storm fortress → rain).
//
// Particles spawn around the player at ceiling height and fall through
// the play area. We spawn within a 12u horizontal radius so the rain
// always feels present without flooding the scene with particles. TTL
// is short so old particles vanish before they pile up.
//
// API:
//   const weather = new Weather({ camera, particles, ollamaLevelGen, fpsShooter });
//   weather.tick(dt);
//   weather.getKind();            // "clear" | "rain" | "mist" | "snow"
//   weather.getStats();           // { kind, particlesEmitted }
//   window.weather                — { kind, force, clear }
// =============================================================================

import { CanvasFilter } from "./CanvasFilter.js";

const FILTER_BY_KIND = {
    clear: null,
    rain:  "brightness(0.85) saturate(0.85) hue-rotate(200deg)",
    mist:  "brightness(0.92) saturate(0.75) contrast(0.95)",
    snow:  "brightness(1.05) saturate(0.80) hue-rotate(190deg)",
};

// Particle emission rates (particles/sec)
const RATE_RAIN = 60;
const RATE_SNOW = 25;

export class Weather {
    constructor({ camera, particles, ollamaLevelGen, fpsShooter = null, kpop = null } = {}) {
        this.camera = camera;
        this.particles = particles;
        this.ollamaLevelGen = ollamaLevelGen;
        this.fpsShooter = fpsShooter;
        this.kpop = kpop;

        this._kind = "clear";
        this._spawnTimer = 0;
        this._lastAnnouncedKind = null;
        this._forcedKind = null;     // overrides level + time when set
        this._stats = { particlesEmitted: 0, ticks: 0 };
    }

    getKind() { return this._kind; }
    getStats() { return { kind: this._kind, ...this._stats }; }

    // Manual override for testing / debug. Pass null to clear.
    force(kind) {
        if (kind != null && !(kind in FILTER_BY_KIND)) return false;
        this._forcedKind = kind;
        return true;
    }

    tick(dt) {
        this._stats.ticks++;
        // Resolve current weather kind
        const newKind = this._resolveKind();
        if (newKind !== this._kind) this._setKind(newKind);
        // Spawn particles for rain/snow
        if (this._kind === "rain") this._spawn(dt, RATE_RAIN, this._spawnRainDrop.bind(this));
        else if (this._kind === "snow") this._spawn(dt, RATE_SNOW, this._spawnSnowFlake.bind(this));
    }

    // ----- Internal -----------------------------------------------------

    _resolveKind() {
        // Priority: forced > level.weather > time-of-day default
        if (this._forcedKind != null) return this._forcedKind;
        const explicit = this.ollamaLevelGen?._lastLevel?.weather;
        if (explicit && explicit in FILTER_BY_KIND) return explicit;
        return this._timeOfDayDefault();
    }

    _timeOfDayDefault() {
        const hour = (typeof window !== "undefined" && window.time?.hour)
            ? window.time.hour() : null;
        if (hour == null) return "clear";
        if (hour >= 4 && hour < 7) return "mist";
        if (hour >= 17 && hour < 21) return "rain";
        return "clear";
    }

    _setKind(kind) {
        this._kind = kind;
        CanvasFilter.setSlot("weather", FILTER_BY_KIND[kind]);
        // Announce on change (skip the initial "clear" → "clear")
        if (kind !== this._lastAnnouncedKind && kind !== "clear") {
            this._lastAnnouncedKind = kind;
            if (this.kpop?.info) {
                const labels = { rain: "🌧 Rain begins", mist: "🌫 Mist rolls in", snow: "❄ Snow drifts down" };
                this.kpop.info(labels[kind] || kind, "").catch(()=>{});
            }
        } else if (kind === "clear") {
            this._lastAnnouncedKind = "clear";
        }
    }

    _spawn(dt, rate, emitOne) {
        if (!this.particles?.spawn || !this.camera?.position) return;
        this._spawnTimer += dt;
        const interval = 1 / rate;
        while (this._spawnTimer >= interval) {
            this._spawnTimer -= interval;
            emitOne();
            this._stats.particlesEmitted++;
        }
    }

    _spawnRainDrop() {
        const cx = this.camera.position.x, cy = this.camera.position.y, cz = this.camera.position.z;
        // Spawn in 12u radius around player at +10 above eye
        const ang = Math.random() * Math.PI * 2;
        const r   = Math.sqrt(Math.random()) * 12;
        const px  = cx + Math.cos(ang) * r;
        const pz  = cz + Math.sin(ang) * r;
        const py  = cy + 10;
        this.particles.spawn({
            x: px, y: py, z: pz,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -15 + (Math.random() - 0.5) * 2,
            vz: (Math.random() - 0.5) * 0.5,
            ttl: 0.9, size: 0.06,
            r: 0.70, g: 0.78, b: 0.92, a: 0.55,
            gravity: 0,
        });
    }

    _spawnSnowFlake() {
        const cx = this.camera.position.x, cy = this.camera.position.y, cz = this.camera.position.z;
        const ang = Math.random() * Math.PI * 2;
        const r   = Math.sqrt(Math.random()) * 12;
        const px  = cx + Math.cos(ang) * r;
        const pz  = cz + Math.sin(ang) * r;
        const py  = cy + 10;
        this.particles.spawn({
            x: px, y: py, z: pz,
            vx: (Math.random() - 0.5) * 1.5,    // wider drift than rain
            vy: -2.5 + (Math.random() - 0.5) * 0.8,
            vz: (Math.random() - 0.5) * 1.5,
            ttl: 3.0, size: 0.10,
            r: 0.95, g: 0.97, b: 1.00, a: 0.85,
            gravity: -0.4,                        // light updraft for drift feel
        });
    }
}
