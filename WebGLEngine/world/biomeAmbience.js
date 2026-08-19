// =============================================================================
// FILE: /world/biomeAmbience.js
// ROUND: 214
// =============================================================================
//
// Atmospheric ambient effects driven by the biome the player currently
// stands in. Adds visible LIFE to the existing biome surfaces:
//
//   tundra    — drifting snowflakes overhead falling slow
//   plains    — wind-blown dust motes near grass level
//   jungle    — falling leaves + occasional bird-call particles
//   mountains — wind-streak puffs of fast snow / sleet near peaks
//   volcano   — slow falling ash + occasional ember sparks
//
// Plus a biome-change watcher: the first time the player walks into a
// new biome in this session, a KPop toast announces it and (optionally)
// TTS speaks the biome name. Repeats only if player leaves and returns
// to a previously-seen biome AFTER a cooldown (so the toast doesn't
// spam when crossing a thin boundary).
//
// Hooks:
//   • Reads camera.position each tick (no per-frame voxel work)
//   • Spawns particles via particleSystem.spawn (existing API)
//   • Calls window.kpop.info() + window.kpop.speak() if available
//   • Listens to camera mode so it stays quiet during demos that
//     hijack the camera (lunar lander, ogre, asteroids, etc.)
//
// API:
//   const a = new BiomeAmbience({ camera, biomeMap, particles, kpop })
//   a.start();       // begin per-frame ticking
//   a.tick(dt);
//   a.stop();
//   a.setSpeechEnabled(true); // opt-in TTS narration
//
// Console:
//   window.biomeAmbience.setSpeechEnabled(true);
//   window.biomeAmbience.forceBiome("jungle");   // testing
// =============================================================================

const PARTICLE_RATE = {       // particles per second per biome
    tundra:    18,
    plains:     4,
    jungle:    14,
    mountains: 10,
    volcano:   12,
    // Round 280 — wet biomes detected via wetness overlay
    swamp:     20,             // dense mist + fireflies
    lake:       8,             // sparse vapor
};

const BIOME_LABELS = {
    tundra:    "❄ TUNDRA",
    plains:    "🌾 PLAINS",
    jungle:    "🌴 JUNGLE",
    mountains: "⛰ MOUNTAINS",
    volcano:   "🌋 VOLCANO",
    swamp:     "🐸 SWAMP",
    lake:      "💧 LAKE",
};

const BIOME_DESCRIPTIONS = {
    tundra:    "Pale cold flats. Watch your step on the ice.",
    plains:    "Open grasslands. Calm and unwatched.",
    jungle:    "Dense humid green. Things move in the canopy.",
    mountains: "High and stony. Snow caps glitter above the treeline.",
    volcano:   "Ash drifts on hot air. Lava flows just below the surface.",
    swamp:     "Heavy wet ground. The mist breathes between the trees.",
    lake:      "Still water mirrors the sky. Nothing breaks the surface — yet.",
};

// Cooldown before announcing the same biome again after re-entry.
const BIOME_REANNOUNCE_MS = 60_000;       // 60 seconds

export class BiomeAmbience {
    constructor({ camera, biomeMap, particles, kpop = null, world = null }) {
        this.camera = camera;
        this.biomeMap = biomeMap;
        this.particles = particles;
        this.kpop = kpop;
        this.world = world;

        this.active = false;
        this.currentBiome = null;       // last sampled biome at player pos
        this._forcedBiome = null;        // for console testing
        this._biomeFirstSeen = new Map();// biome → first-seen time (ms)
        this._biomeLastAnnounce = new Map();// biome → last announce time
        this._spawnAccumulator = 0;
        this._speechEnabled = false;
        this._counts = { ticks: 0, particles: 0, announcements: 0 };
        // Round 214 — biome change subscribers (other systems can react
        // to player biome transitions without polling)
        this._changeSubscribers = new Set();
    }

    start() { this.active = true; }
    stop()  { this.active = false; }

    setSpeechEnabled(on) { this._speechEnabled = !!on; }

    // Sample biome at current camera position; returns biome name or null
    biomeAtCamera() {
        if (this._forcedBiome) return this._forcedBiome;
        if (!this.camera?.position || !this.biomeMap?.getBiomeAt) return null;
        const x = this.camera.position.x | 0;
        const z = this.camera.position.z | 0;
        const base = this.biomeMap.getBiomeAt(x, z);
        // Round 280 — wetness overlay. Plains and jungle cells with
        // high wetness are reported as "swamp" or "lake" so the
        // ambience system can show the matching label and particles.
        // Mirrors the threshold logic in BiomePainter so the visual
        // and the announcement stay aligned.
        if ((base === "plains" || base === "jungle") && this.biomeMap.getWetness) {
            const wet = this.biomeMap.getWetness(x, z);
            if (wet > 0.85) return "lake";
            if (wet > 0.65) return "swamp";
        }
        return base;
    }

    // Subscribe to biome changes. Callback receives (newBiome, oldBiome).
    onBiomeChange(fn) {
        this._changeSubscribers.add(fn);
        return () => this._changeSubscribers.delete(fn);
    }

    forceBiome(name) { this._forcedBiome = name; this._tickBiomeChange(); }
    clearForce()     { this._forcedBiome = null; this._tickBiomeChange(); }

    tick(dt) {
        if (!this.active) return;
        this._counts.ticks++;

        // 1. Detect biome transitions
        this._tickBiomeChange();

        // 2. Spawn ambient particles at the configured rate
        const biome = this.currentBiome;
        if (!biome || !this.particles?.spawn) return;
        const rate = PARTICLE_RATE[biome] ?? 0;
        if (rate <= 0) return;
        this._spawnAccumulator += rate * dt;
        while (this._spawnAccumulator >= 1) {
            this._spawnAccumulator -= 1;
            this._spawnAmbientParticle(biome);
            this._counts.particles++;
        }
    }

    _tickBiomeChange() {
        const newBiome = this.biomeAtCamera();
        if (newBiome === this.currentBiome) return;
        const oldBiome = this.currentBiome;
        this.currentBiome = newBiome;
        this._spawnAccumulator = 0;
        if (!newBiome) return;
        // First-seen or re-announce after cooldown?
        const now = performance.now();
        const lastSeen = this._biomeLastAnnounce.get(newBiome) ?? 0;
        const cooldownPassed = (now - lastSeen) > BIOME_REANNOUNCE_MS;
        const firstTime = !this._biomeFirstSeen.has(newBiome);
        if (firstTime) this._biomeFirstSeen.set(newBiome, now);
        if (firstTime || cooldownPassed) {
            this._announce(newBiome);
            this._biomeLastAnnounce.set(newBiome, now);
            this._counts.announcements++;
        }
        // Notify subscribers
        for (const fn of this._changeSubscribers) {
            try { fn(newBiome, oldBiome); } catch (e) {}
        }
    }

    _announce(biome) {
        const label = BIOME_LABELS[biome] || biome;
        const desc  = BIOME_DESCRIPTIONS[biome] || "";
        // Toast via KPop if available; falls back to console
        if (this.kpop?.info) {
            this.kpop.info(`Entered: ${label}`, desc).catch(() => {});
        }
        // Optional TTS narration through KPop's PowerShell speech bridge
        if (this._speechEnabled && this.kpop?.speak) {
            this.kpop.speak({ Voice: "M1", Text: `You have entered the ${biome}.` }).catch(() => {});
        }
        console.log(`[BiomeAmbience] entered ${label}`);
    }

    _spawnAmbientParticle(biome) {
        if (!this.particles?.spawn || !this.camera?.position) return;
        const cp = this.camera.position;
        // Spawn within a 60u box around the camera, mostly overhead
        const rx = (Math.random() - 0.5) * 60;
        const rz = (Math.random() - 0.5) * 60;
        const x = cp.x + rx;
        const z = cp.z + rz;
        switch (biome) {
            case "tundra": {
                // Slow snowflake from overhead
                this.particles.spawn({
                    x, y: cp.y + 25 + Math.random() * 10, z,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: -0.6 - Math.random() * 0.3,
                    vz: (Math.random() - 0.5) * 0.5,
                    ttl: 8 + Math.random() * 4,
                    size: 0.25 + Math.random() * 0.15,
                    r: 1.0, g: 1.0, b: 1.0, a: 0.85,
                });
                break;
            }
            case "plains": {
                // Wind-blown dust mote, low and slow
                this.particles.spawn({
                    x, y: cp.y + 1 + Math.random() * 3, z,
                    vx: 0.6 + Math.random() * 0.4,
                    vy: 0.1 + Math.random() * 0.1,
                    vz: 0.1 + (Math.random() - 0.5) * 0.6,
                    ttl: 2.5 + Math.random() * 1.5,
                    size: 0.18,
                    r: 0.9, g: 0.85, b: 0.65, a: 0.55,
                });
                break;
            }
            case "jungle": {
                // Falling leaf — green/yellow, drifting
                const tint = Math.random();
                this.particles.spawn({
                    x, y: cp.y + 12 + Math.random() * 8, z,
                    vx: (Math.random() - 0.5) * 1.2,
                    vy: -0.9 - Math.random() * 0.4,
                    vz: (Math.random() - 0.5) * 1.2,
                    ttl: 4 + Math.random() * 2,
                    size: 0.35,
                    r: tint < 0.7 ? 0.4 + Math.random()*0.2 : 0.9,
                    g: 0.7 + Math.random() * 0.2,
                    b: 0.2,
                    a: 0.85,
                });
                break;
            }
            case "mountains": {
                // Wind-driven sleet streak, fast lateral drift
                this.particles.spawn({
                    x, y: cp.y + 20 + Math.random() * 15, z,
                    vx: 2.5 + Math.random() * 1.5,
                    vy: -1.2 - Math.random() * 0.5,
                    vz: 0,
                    ttl: 2 + Math.random() * 1,
                    size: 0.2,
                    r: 0.95, g: 0.97, b: 1.0, a: 0.75,
                });
                break;
            }
            case "volcano": {
                // Slow falling ash, with rare embers
                const ember = Math.random() < 0.12;
                this.particles.spawn({
                    x, y: cp.y + 22 + Math.random() * 10, z,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.4 - Math.random() * 0.2,
                    vz: (Math.random() - 0.5) * 0.4,
                    ttl: 5 + Math.random() * 3,
                    size: 0.22 + Math.random() * 0.12,
                    r: ember ? 1.0 : 0.25,
                    g: ember ? 0.55 : 0.22,
                    b: ember ? 0.15 : 0.20,
                    a: 0.8,
                });
                break;
            }
            // Round 280 — wet biomes. Painted as overlays on plains/
            // jungle by BiomePainter; the particle effects help sell
            // the "you're in a wet area" feeling beyond the voxel
            // colour change.
            case "swamp": {
                // Drifting fog motes near ground level + occasional
                // green firefly. Slow horizontal drift, slight bob.
                const firefly = Math.random() < 0.08;
                this.particles.spawn({
                    x, y: cp.y + 0.5 + Math.random() * 2.5, z,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: 0.05 + Math.random() * 0.08,
                    vz: (Math.random() - 0.5) * 0.3,
                    ttl: 5 + Math.random() * 3,
                    size: firefly ? 0.18 : 0.45,
                    r: firefly ? 0.50 : 0.40,
                    g: firefly ? 0.95 : 0.55,
                    b: firefly ? 0.40 : 0.45,
                    a: firefly ? 0.95 : 0.35,
                });
                break;
            }
            case "lake": {
                // Light water-vapor mist hovering just above the
                // surface + rare faint ripple-sound particle (visual
                // only — actual audio is later). Particles drift up
                // and dissipate.
                this.particles.spawn({
                    x, y: cp.y + 1 + Math.random() * 3, z,
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: 0.2 + Math.random() * 0.2,
                    vz: (Math.random() - 0.5) * 0.2,
                    ttl: 4 + Math.random() * 2,
                    size: 0.30 + Math.random() * 0.15,
                    r: 0.75, g: 0.85, b: 0.95, a: 0.40,
                });
                break;
            }
        }
    }

    getStats() {
        return {
            active: this.active,
            currentBiome: this.currentBiome,
            seen: [...this._biomeFirstSeen.keys()],
            ...this._counts,
        };
    }
}
