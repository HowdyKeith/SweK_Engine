// FILE: simulation/WeatherSystem.js
// VERSION: v1
//
// Round 32 — weather + day/night. Drives sun rotation around the sky
// over a 5-minute cycle; layers a state machine on top: clear,
// cloudy, rain, snow, storm. State transitions happen every 60-120
// seconds with biased random selection. Rain/snow particles spawn
// around the camera; storm flashes briefly brighten ambient light
// (handled via setColors on the SkyRenderer).
//
// All state is owned here — main.js just calls tick() each frame and
// reads sunDir/horizon/zenith for the renderer.

const STATES = ["clear", "cloudy", "rain", "snow", "storm"];

// Per-state visual params
const STATE_VISUALS = {
    clear:  { horizon: [0.65, 0.78, 0.92], zenith: [0.30, 0.55, 0.85], fogStrength: 1.0 },
    cloudy: { horizon: [0.62, 0.65, 0.70], zenith: [0.45, 0.50, 0.58], fogStrength: 1.4 },
    rain:   { horizon: [0.40, 0.45, 0.52], zenith: [0.25, 0.30, 0.38], fogStrength: 2.0 },
    snow:   { horizon: [0.78, 0.82, 0.90], zenith: [0.60, 0.68, 0.78], fogStrength: 1.6 },
    storm:  { horizon: [0.25, 0.28, 0.35], zenith: [0.12, 0.15, 0.22], fogStrength: 2.5 },
    blizzard: { horizon: [0.90, 0.92, 0.96], zenith: [0.78, 0.82, 0.88], fogStrength: 3.2 },  // v502 — white-out
};

// Particle counts per second (for rain/snow). Particles spawn in a
// horizontal area around the camera and fall.
const RAIN_PER_SEC = 80;
const SNOW_PER_SEC = 35;
const STORM_FLASH_INTERVAL_MIN = 4.0;     // seconds between flashes
const STORM_FLASH_INTERVAL_MAX = 9.0;

const DAY_CYCLE_SECONDS = 300;             // 5-minute full day/night cycle

export class WeatherSystem {
    constructor(opts = {}) {
        // Time of day: 0..1 fraction of cycle. 0.25 = sunrise, 0.5 =
        // noon, 0.75 = sunset, 0 = midnight. Start at noon.
        this.timeOfDay = opts.startTime ?? 0.5;
        this.cycleSeconds = opts.cycleSeconds ?? DAY_CYCLE_SECONDS;

        this.state = "clear";
        this._stateAge = 0;
        this._nextStateChange = this._pickStateDuration();

        // Storm flash timing
        this._flashTimer = 0;
        this._nextFlash  = this._pickFlashInterval();
        this._flashIntensity = 0;       // 0..1, decays each frame

        // Particle accumulators (so we spawn fractional rates correctly)
        this._rainAccum = 0;
        this._snowAccum = 0;

        // Outputs
        this.sunDir = [0, 1, 0];
        this.horizonColor = STATE_VISUALS.clear.horizon.slice();
        this.zenithColor  = STATE_VISUALS.clear.zenith.slice();
        this.fogStrength  = 1.0;

        // Event hook for narrative/cinematic
        this.events = opts.events ?? null;

        // Optional reference systems
        this.particles = opts.particles ?? null;
        this.biomeMap = opts.biomeMap ?? null;
    }

    tick(delta, camera) {
        // Time-of-day advances continuously
        this.timeOfDay = (this.timeOfDay + delta / this.cycleSeconds) % 1;

        // State machine — random transitions every 60-120s
        this._stateAge += delta;
        if (this._stateAge >= this._nextStateChange) {
            const old = this.state;
            this.state = this._pickNextState(camera);
            this._stateAge = 0;
            this._nextStateChange = this._pickStateDuration();
            if (this.state !== old) {
                console.log(`[Weather] ${old} → ${this.state}`);
                if (this.events?.publish) {
                    this.events.publish({
                        type: "weather_change",
                        prev: old, next: this.state,
                        x: camera?.position?.x ?? 0,
                        y: camera?.position?.y ?? 0,
                        z: camera?.position?.z ?? 0,
                    });
                }
                // v856 — engine event for the v849 Twitch broadcast hook
                // + v855 audio cue (ping). Fires only on actual transitions
                // (handled by the !== old guard above), not on idempotent
                // setState calls.
                try {
                    window.dispatchEvent(new CustomEvent("engine:weatherChanged", {
                        detail: { kind: this.state, prev: old },
                    }));
                } catch {}
            }
        }

        // Compute sun direction from time-of-day (rotates around X axis)
        // Noon = sun overhead (+Y), midnight = below (-Y), dawn/dusk on horizon
        const t = this.timeOfDay;
        const angle = t * Math.PI * 2 - Math.PI / 2;   // 0=midnight, π=noon
        this.sunDir = [
            0,
            Math.sin(angle),       // +1 noon, -1 midnight, 0 dawn/dusk
            Math.cos(angle),
        ];

        // Sky colors — base from weather state, modulated by time-of-day.
        // Night darkens, dawn/dusk warmly tints horizon when sun is at
        // or just above the horizon (sunY in [-0.1, 0.4]).
        const v = STATE_VISUALS[this.state];
        const sunY = this.sunDir[1];
        const dayness = Math.max(0, sunY);   // 0..1 (night..noon)
        // Warm tint peaks at sunY=0 (dawn/dusk), tapers to zero by
        // sunY=-0.1 (deep night) or sunY=+0.25 (mid-morning).
        let dawnDuskTint = 0;
        if (sunY > -0.1 && sunY < 0.25) {
            dawnDuskTint = Math.max(0, 1 - 4 * Math.abs(sunY));
        }
        const baseH = v.horizon, baseZ = v.zenith;
        // Night multiplier: full color at noon, 25% at midnight
        const nightMul = 0.25 + 0.75 * dayness;
        // Dawn/dusk warm tint added to horizon
        const dawnR = 0.40 * dawnDuskTint;
        const dawnG = 0.20 * dawnDuskTint;
        this.horizonColor = [
            Math.min(1, baseH[0] * nightMul + dawnR),
            Math.min(1, baseH[1] * nightMul + dawnG),
            Math.min(1, baseH[2] * nightMul),
        ];
        this.zenithColor = [
            baseZ[0] * nightMul,
            baseZ[1] * nightMul,
            baseZ[2] * nightMul,
        ];

        // Storm flash — brief screen-wide brightening
        if (this.state === "storm") {
            this._flashTimer += delta;
            if (this._flashTimer >= this._nextFlash) {
                this._flashTimer = 0;
                this._nextFlash = this._pickFlashInterval();
                this._flashIntensity = 1.0;
                if (this.events?.publish) {
                    this.events.publish({
                        type: "weather_thunder",
                        x: camera?.position?.x ?? 0, y: 60, z: camera?.position?.z ?? 0,
                    });
                }
            }
            // Decay
            if (this._flashIntensity > 0) {
                this._flashIntensity = Math.max(0, this._flashIntensity - delta * 4);
                // Apply flash to horizon: white-ish for the duration
                this.horizonColor = [
                    Math.min(1, this.horizonColor[0] + 0.7 * this._flashIntensity),
                    Math.min(1, this.horizonColor[1] + 0.7 * this._flashIntensity),
                    Math.min(1, this.horizonColor[2] + 0.7 * this._flashIntensity),
                ];
            }
        }

        this.fogStrength = v.fogStrength;

        // Particle spawning
        if (camera && this.particles?.spawn) {
            if (this.state === "rain" || this.state === "storm") {
                this._spawnRain(delta, camera);
            } else if (this.state === "snow" || this.state === "blizzard") {
                this._spawnSnow(delta, camera);
            }
        }
    }

    _spawnRain(delta, camera) {
        const rate = (this.state === "storm") ? RAIN_PER_SEC * 1.5 : RAIN_PER_SEC;
        this._rainAccum += rate * delta;
        const toSpawn = Math.floor(this._rainAccum);
        this._rainAccum -= toSpawn;
        for (let i = 0; i < toSpawn; i++) {
            // Rain spawns in a 50-unit-radius horizontal ring around camera,
            // 30-50 units above. Falls straight down at 25 m/s.
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 50;
            const x = camera.position.x + Math.cos(angle) * radius;
            const z = camera.position.z + Math.sin(angle) * radius;
            const y = camera.position.y + 30 + Math.random() * 20;
            this.particles.spawn({
                x, y, z,
                vx: 0, vy: -25, vz: 0,
                ttl: 1.8,
                size: 0.18,
                r: 0.6, g: 0.75, b: 0.95, a: 0.7,
                gravity: 0,        // already at terminal velocity
                sprite: 2,         // SPARK — works as a bright streak
            });
        }
    }

    _spawnSnow(delta, camera) {
        const blizzard = this.state === "blizzard";
        this._snowAccum += (blizzard ? SNOW_PER_SEC * 3.5 : SNOW_PER_SEC) * delta;
        const toSpawn = Math.floor(this._snowAccum);
        this._snowAccum -= toSpawn;
        for (let i = 0; i < toSpawn; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 40;
            const x = camera.position.x + Math.cos(angle) * radius;
            const z = camera.position.z + Math.sin(angle) * radius;
            const y = camera.position.y + 25 + Math.random() * 15;
            // Snow drifts laterally + falls slow; a blizzard drives it sideways
            const drift = blizzard ? 6.0 : 1.0;
            this.particles.spawn({
                x, y, z,
                vx: (Math.random() - 0.5) * drift,
                vy: blizzard ? -6.5 : -3.5,
                vz: (Math.random() - 0.5) * drift,
                ttl: 6.0,
                size: 0.3,
                r: 1.0, g: 1.0, b: 1.0, a: 0.85,
                gravity: 0,
                sprite: 0,         // CIRCLE
            });
        }
    }

    _pickStateDuration() { return 60 + Math.random() * 60; }
    _pickFlashInterval() {
        return STORM_FLASH_INTERVAL_MIN +
            Math.random() * (STORM_FLASH_INTERVAL_MAX - STORM_FLASH_INTERVAL_MIN);
    }

    _pickNextState(camera) {
        // Sample biome at camera position to bias snow vs rain
        let coldBias = 0;
        if (this.biomeMap && camera?.position) {
            const b = this.biomeMap.getBiomeAt(
                Math.floor(camera.position.x), Math.floor(camera.position.z)
            );
            if (b === "tundra" || b === "mountains") coldBias = 1;
        }
        const r = Math.random();
        // Weights: clear 35%, cloudy 25%, rain or snow 25%, storm 15%
        if (r < 0.35) return "clear";
        if (r < 0.60) return "cloudy";
        if (r < 0.85) return coldBias ? "snow" : "rain";
        return "storm";
    }

    timeOfDayLabel() {
        const t = this.timeOfDay;
        if (t < 0.05 || t > 0.95) return "midnight";
        if (t < 0.20) return "predawn";
        if (t < 0.30) return "dawn";
        if (t < 0.45) return "morning";
        if (t < 0.55) return "noon";
        if (t < 0.70) return "afternoon";
        if (t < 0.80) return "dusk";
        return "evening";
    }
}
