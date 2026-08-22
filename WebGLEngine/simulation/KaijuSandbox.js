// FILE: simulation/KaijuSandbox.js
// VERSION: v1 — round 253 (kaiju vs city sandbox game mode)
//
// KaijuSandbox is a standalone game mode separate from the dungeon FPS
// loop. The player IS the kaiju. The world contains a procedural city
// (see world/CityGen.js). The core loop:
//
//   1. Player walks around. Voxels in a body cylinder around the
//      player's foot-to-head range get DESTROYED on contact.
//   2. Each destroyed voxel grants growth (size += GROWTH_PER_VOXEL).
//      The player's camera eye height scales up, the body cylinder
//      radius scales with it.
//   3. Taking damage (kaijuSandbox.takeDamage(n)) shrinks the player.
//      If size falls below MIN_SIZE, the kaiju is "DEFEATED".
//   4. HUD shows current size, voxels destroyed, % city demolished,
//      and a tier label ("HOUSE-SIZED" / "TOWER" / "SKYSCRAPER" / etc).
//
// Distinct from the existing KaijuMode (a 12-second buff in dungeon
// runs). This is a persistent mode with growth progression.

const STARTING_SIZE = 3.0;       // start slightly larger than human so you can stomp houses
const MIN_SIZE      = 1.5;       // below this = DEFEATED
const MAX_SIZE      = 140.0;     // 40-story skyscraper height
const GROWTH_PER_VOXEL = 0.025;  // 40 voxels = +1u size; one small house = ~5u
const DAMAGE_SHRINK    = 0.5;    // 1 damage = -0.5 size

// Round 254 — eating military entities grants a discrete growth bonus.
// Tanks are the bigger snack; planes are smaller but more numerous.
const GROWTH_PER_TANK  = 5;
const GROWTH_PER_PLANE = 3;

// Round 254 — military wave config. Tier label → { tanks, planes }.
// Empty for early tiers (the city is empty until you grow enough to
// matter — keeps the "no enemies = relaxed exploration" early phase).
const WAVES_BY_TIER = {
    "HUMAN":         { tanks: 0, planes: 0 },
    "GIANT":         { tanks: 0, planes: 0 },
    "HOUSE-SIZED":   { tanks: 2, planes: 0 },
    "TOWER-TALL":    { tanks: 3, planes: 1 },
    "SKYSCRAPER":    { tanks: 4, planes: 2 },
    "MEGAKAIJU":     { tanks: 6, planes: 3 },
    "CITY-DEVOURER": { tanks: 6, planes: 3 },
};
const WAVE_CHECK_INTERVAL_MS = 4000;   // re-evaluate wave every 4s

// Size-tier label thresholds (matched against current eye height)
const SIZE_TIERS = [
    [  3, "HUMAN"],
    [  6, "GIANT"],
    [ 12, "HOUSE-SIZED"],
    [ 24, "TOWER-TALL"],
    [ 48, "SKYSCRAPER"],
    [ 96, "MEGAKAIJU"],
    [Infinity, "CITY-DEVOURER"],
];

function sizeTier(size) {
    for (const [thresh, label] of SIZE_TIERS) {
        if (size < thresh) return label;
    }
    return "HUMAN";
}

export class KaijuSandbox {

    constructor({ camera, world, particles = null, audio = null, kpop = null, cityGen = null,
                   botManager = null, fpsShooter = null, router = null } = {}) {
        this.camera = camera;
        this.world  = world;
        this.particles = particles;
        this.audio  = audio;
        this.kpop   = kpop;
        this.cityGen = cityGen;
        this.router = router;             // round 256 — for civilian entity spawns
        // Round 254 — military integration
        this.botManager = botManager;
        this.fpsShooter = fpsShooter;
        this._origTakeDamage = null;
        this._militaryIds = new Set();
        this._lastWaveCheckMs = 0;

        this._active = false;
        this._size = STARTING_SIZE;
        this._voxelsDestroyed = 0;
        this._damageTaken = 0;
        this._cityVoxelTotal = 0;
        this._defeated = false;
        this._badgeEl = null;
        this._hudEl   = null;
        // saved camera state so stop() restores original config
        this._saved = null;
        // Round 254 — eaten counters (kills + growth boost)
        this._eaten = { tanks: 0, planes: 0, growthFromEating: 0, civilians: 0 };
        // Round 256 — burning cells & civilians
        this._burning = new Map();   // "x,y,z" → expiryMs
        this._civilians = [];        // [{ x, y, z, vx, vz, entityId }]
        this._lastFireTickMs = 0;
        this._lastCivilianSpawnCheckMs = 0;
    }

    isActive()       { return this._active; }
    isDefeated()     { return this._defeated; }
    getSize()        { return this._size; }
    getVoxelsDestroyed() { return this._voxelsDestroyed; }
    getStats() {
        return {
            active: this._active,
            defeated: this._defeated,
            size: this._size,
            tier: sizeTier(this._size),
            voxelsDestroyed: this._voxelsDestroyed,
            damageTaken: this._damageTaken,
            cityVoxelTotal: this._cityVoxelTotal,
            percentDestroyed: this._cityVoxelTotal > 0
                ? Math.min(100, this._voxelsDestroyed / this._cityVoxelTotal * 100)
                : 0,
        };
    }

    // Activate sandbox mode. Generates a city if cityGen is supplied and
    // generateCity option is true (default). Otherwise assumes a city
    // is already built.
    start({ generateCity = true, cityOpts = {} } = {}) {
        if (this._active) return false;
        if (!this.camera || !this.world) return false;

        if (generateCity && this.cityGen?.generate) {
            this.cityGen.generate(cityOpts);
            this._cityVoxelTotal = this.cityGen.getTotalBuildingVoxels?.() ?? 0;
        }

        // Round 256 — store explicit ground reference for the
        // camera-clamp and ground-tracking logic. Previously derived
        // from _saved.pos.y minus STARTING_SIZE, which was fragile.
        this._groundY = cityOpts.groundY ?? 0;
        this._cityRadius = cityOpts.radius ?? 80;
        this._cityCenter = { x: cityOpts.centerX ?? 0, z: cityOpts.centerZ ?? 0 };

        // Save camera state
        this._saved = {
            eyeHeight:  this.camera._eyeHeight,
            walkSpeed:  this.camera._fpWalkSpeed,
            sprintSpeed: this.camera._fpSprintSpeed,
            pos:        { ...this.camera.position },
        };

        // Apply starting kaiju scale
        this._size = STARTING_SIZE;
        this._voxelsDestroyed = 0;
        this._damageTaken = 0;
        this._defeated = false;
        this.camera._eyeHeight = STARTING_SIZE;
        if (this.camera._fpWalkSpeed != null) this.camera._fpWalkSpeed = 8;
        if (this.camera._fpSprintSpeed != null) this.camera._fpSprintSpeed = 14;
        // Spawn at edge of city facing the center
        const radius = cityOpts.radius ?? 80;
        const centerX = cityOpts.centerX ?? 0;
        const centerZ = cityOpts.centerZ ?? 0;
        this.camera.position.x = centerX - radius - 10;
        this.camera.position.y = (cityOpts.groundY ?? 0) + STARTING_SIZE + 1;
        this.camera.position.z = centerZ;
        // face center: yaw such that fwd points +X
        if (this.camera.yaw != null) this.camera.yaw = Math.PI / 2;
        if (this.camera.pitch != null) this.camera.pitch = 0;

        this._buildBadge();
        this._buildHud();
        if (this.kpop?.success) {
            this.kpop.success("🦖 KAIJU SANDBOX", "Walk into the city. Crush buildings to grow.").catch(()=>{});
        }
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_level_start", 0.7);

        // Round 254 — patch fpsShooter.takeDamage to forward to this
        // sandbox's takeDamage instead of decrementing FPS health.
        // The original is saved for stop() to restore.
        if (this.fpsShooter?.takeDamage && !this._origTakeDamage) {
            this._origTakeDamage = this.fpsShooter.takeDamage.bind(this.fpsShooter);
            this.fpsShooter.takeDamage = (amount /*, source*/) => {
                this.takeDamage(amount);
            };
        }

        this._active = true;
        return true;
    }

    stop() {
        if (!this._active) return;
        this._active = false;
        // Round 254 — restore fpsShooter.takeDamage
        if (this._origTakeDamage && this.fpsShooter) {
            this.fpsShooter.takeDamage = this._origTakeDamage;
            this._origTakeDamage = null;
        }
        // Round 254 — despawn any remaining military bots
        this._despawnAllMilitary();
        // Round 256 — despawn civilians + clear fires
        this._despawnAllCivilians();
        this._burning.clear();
        // Restore camera
        if (this._saved && this.camera) {
            if (this._saved.eyeHeight != null)  this.camera._eyeHeight  = this._saved.eyeHeight;
            if (this._saved.walkSpeed != null)  this.camera._fpWalkSpeed = this._saved.walkSpeed;
            if (this._saved.sprintSpeed != null) this.camera._fpSprintSpeed = this._saved.sprintSpeed;
            if (this._saved.pos) {
                this.camera.position.x = this._saved.pos.x;
                this.camera.position.y = this._saved.pos.y;
                this.camera.position.z = this._saved.pos.z;
            }
        }
        this._removeBadge();
        this._removeHud();
        if (this.kpop?.info) {
            this.kpop.info("Kaiju Sandbox ended",
                `${this._voxelsDestroyed} voxels · ${this._eaten.tanks} tanks · ${this._eaten.planes} planes`).catch(()=>{});
        }
    }

    // Called externally — e.g. console: window.kaijuCity.damage(5)
    // Future rounds: tank shells / plane bombs call this.
    takeDamage(amount = 1) {
        if (!this._active || this._defeated) return;
        this._damageTaken += amount;
        this._size = Math.max(MIN_SIZE - 0.01, this._size - amount * DAMAGE_SHRINK);
        if (this.camera) this.camera._eyeHeight = Math.max(MIN_SIZE, this._size);
        if (this._size < MIN_SIZE) {
            this._onDefeated();
        } else if (this.kpop?.warn) {
            this.kpop.warn(`💥 -${amount}`, `Shrunk to ${this._size.toFixed(1)}u`).catch(()=>{});
        }
    }

    tick(dt) {
        if (!this._active || this._defeated) return;
        this._stompCity();
        this._tickFire(dt);                // round 256
        this._tickCivilians(dt);           // round 256
        this._checkEatenMilitary();
        this._maintainWaves();
        this._applySize();
        this._updateHud();
        // Round 285 — gameplay loop: pickups, heroes, missions
        if (this.gameplay?.enabled) {
            try { this.gameplay.tick(dt); } catch (e) { console.warn("[gameplay.tick]", e?.message ?? e); }
        }
    }

    // ---------------------------------------------------------------
    // Round 256 — burning cells / fire visuals

    _addBurningCell(x, y, z) {
        const key = `${x},${y},${z}`;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        this._burning.set(key, now + 5000);   // 5s burn
    }

    _tickFire(dt) {
        if (this._burning.size === 0) return;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        // Throttle particle emission to ~30 puffs/sec total across all cells
        if (now - this._lastFireTickMs < 33) return;
        this._lastFireTickMs = now;
        // Expire old burns FIRST (independent of particle availability —
        // burns must time out even if no particle system is wired)
        for (const [key, expiry] of this._burning) {
            if (now > expiry) this._burning.delete(key);
        }
        if (!this.particles?.spawn) return;
        // Spawn fire particles for a random subset of burning cells
        // each frame. With 100s of burning cells, emitting from every
        // one each frame would flood; sample ~10 per tick.
        const keys = [...this._burning.keys()];
        const sampleCount = Math.min(10, keys.length);
        for (let i = 0; i < sampleCount; i++) {
            const idx = Math.floor(Math.random() * keys.length);
            const [xs, ys, zs] = keys[idx].split(",").map(Number);
            // Flame core (orange)
            this.particles.spawn({
                x: xs + 0.5 + (Math.random() - 0.5) * 0.5,
                y: ys + 0.3 + Math.random() * 0.5,
                z: zs + 0.5 + (Math.random() - 0.5) * 0.5,
                vx: (Math.random() - 0.5) * 0.6,
                vy: 1.2 + Math.random() * 1.5,
                vz: (Math.random() - 0.5) * 0.6,
                ttl: 0.5, size: 0.32,
                r: 1.0, g: 0.55 + Math.random() * 0.30, b: 0.10, a: 0.9,
            });
            // Smoke trailing (less frequent)
            if (Math.random() < 0.35) {
                this.particles.spawn({
                    x: xs + 0.5, y: ys + 1.0,
                    z: zs + 0.5,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: 1.5 + Math.random() * 1.0,
                    vz: (Math.random() - 0.5) * 0.4,
                    ttl: 1.2, size: 0.40,
                    r: 0.25, g: 0.22, b: 0.20, a: 0.55,
                });
            }
        }
    }

    // ---------------------------------------------------------------
    // Round 256 — civilians fleeing the kaiju
    //
    // Civilians are lightweight entities — { x, y, z, vx, vz, entityId }.
    // They spawn near building centers when the kaiju enters their
    // detection radius, run in the opposite direction from the kaiju
    // at high speed, and despawn when they reach the city perimeter
    // (or get eaten). No combat, no hit points — they're flavor +
    // small growth on contact.

    _tickCivilians(dt) {
        if (!this.router?.exec) return;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        // Periodically refresh civilian roster
        if (now - this._lastCivilianSpawnCheckMs > 1500) {
            this._lastCivilianSpawnCheckMs = now;
            this._maintainCivilians();
        }
        if (this._civilians.length === 0) return;
        const px = this.camera.position.x;
        const pz = this.camera.position.z;
        // Body cylinder XZ for eat detection
        const bodyR = Math.max(1.5, Math.sqrt(this._size) * 0.65);
        const bodyR2 = bodyR * bodyR;
        // Update each civilian
        for (let i = this._civilians.length - 1; i >= 0; i--) {
            const c = this._civilians[i];
            // Flee vector — opposite from kaiju
            const dx = c.x - px, dz = c.z - pz;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.001) continue;
            const fleeX = dx / dist, fleeZ = dz / dist;
            // Round 285 — SandboxGameplay may modulate speed by behavior
            // (cower=0, hero=0, leader=slower, flee=normal/herded-boost).
            // Default speed is 8 (original); gameplay returns 0..N.
            const baseSpeed = 8;
            const speed = (this.gameplay?.enabled && this.gameplay?._modulateCivilianStep)
                ? this.gameplay._modulateCivilianStep(c, baseSpeed, dt, px, pz)
                : baseSpeed;
            c.x += fleeX * speed * dt;
            c.z += fleeZ * speed * dt;
            c.y = (this._groundY ?? 0) + 1;     // walk along ground
            // Update entity transform if we have ecs
            try {
                this.router.exec({
                    type: "entity:move",
                    id: c.entityId,
                    x: c.x, y: c.y, z: c.z,
                });
            } catch {}
            // Eat check (kaiju body cylinder)
            if (dx * dx + dz * dz < bodyR2) {
                this._eatCivilian(c, i);
                continue;
            }
            // Despawn if past city edge
            const cxOff = c.x - (this._cityCenter?.x ?? 0);
            const czOff = c.z - (this._cityCenter?.z ?? 0);
            if (cxOff * cxOff + czOff * czOff > (this._cityRadius + 20) ** 2) {
                this._despawnCivilian(c, i);
            }
        }
    }

    _maintainCivilians() {
        if (!this.cityGen?.buildings || this.cityGen.buildings.length === 0) return;
        const target = Math.min(20, this.cityGen.buildings.length);
        // Spawn missing
        while (this._civilians.length < target) {
            this._spawnCivilian();
        }
    }

    _spawnCivilian() {
        // Pick a random building, spawn civilian at its corner
        const buildings = this.cityGen?.buildings ?? [];
        if (buildings.length === 0) return null;
        const b = buildings[Math.floor(Math.random() * buildings.length)];
        const x = b.x + b.w / 2 + (Math.random() - 0.5) * 4;
        const z = b.z + b.d / 2 + (Math.random() - 0.5) * 4;
        const y = (this._groundY ?? 0) + 1;
        // Use router.exec entity:spawnMesh with a small primitive
        let entityId = null;
        try {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "wad_pickup_health",   // reuse small mesh as civilian placeholder
                kind: "civilian",
                x, y, z,
                scale: 0.5,
            });
            entityId = r?.id ?? null;
        } catch {}
        const c = { x, y, z, vx: 0, vz: 0, entityId };
        this._civilians.push(c);
        return c;
    }

    _despawnCivilian(c, idx) {
        try {
            if (c.entityId != null) this.router.exec({ type: "entity:despawn", id: c.entityId });
        } catch {}
        this._civilians.splice(idx, 1);
    }

    _eatCivilian(c, idx) {
        this._eaten.civilians = (this._eaten.civilians ?? 0) + 1;
        // Tiny growth — civilians are snacks, not meals
        this._voxelsDestroyed += Math.round(0.5 / GROWTH_PER_VOXEL);
        try {
            if (c.entityId != null) this.router.exec({ type: "entity:despawn", id: c.entityId });
        } catch {}
        this._civilians.splice(idx, 1);
        // Round 308 — civilian ragdoll. The body flings UP+AWAY from the
        // kaiju (camera position when kaiju mode is active). Direction
        // computed from kaiju→civilian vector; mostly upward bias because
        // a kaiju stepping on you reads as a vertical squish + scatter.
        const fx = c.x - this.camera.position.x;
        const fz = c.z - this.camera.position.z;
        const flen = Math.hypot(fx, fz) || 1;
        const hitDir = {
            x: (fx / flen) * 0.7,
            y: 0.55,                              // strong upward component
            z: (fz / flen) * 0.7,
        };
        // Normalize the composite direction
        const dlen = Math.hypot(hitDir.x, hitDir.y, hitDir.z) || 1;
        hitDir.x /= dlen; hitDir.y /= dlen; hitDir.z /= dlen;
        if (typeof window !== "undefined" && window.civilianRagdolls?.spawn) {
            try {
                window.civilianRagdolls.spawn({
                    x: c.x, y: c.y + 0.5, z: c.z,
                    hitDir,
                    hitMag: 1.0,
                    scale: 0.5,
                });
            } catch (e) {
                console.warn("[KaijuSandbox] civilian ragdoll spawn failed:", e?.message ?? e);
            }
        }
        // Subtle audio + particles
        if (this.particles?.spawn) {
            for (let i = 0; i < 8; i++) {
                this.particles.spawn({
                    x: c.x, y: c.y + 0.5, z: c.z,
                    vx: (Math.random() - 0.5) * 3,
                    vy: 1 + Math.random() * 2,
                    vz: (Math.random() - 0.5) * 3,
                    ttl: 0.5, size: 0.18,
                    r: 0.85, g: 0.20, b: 0.20, a: 0.85,
                    gravity: 10,
                });
            }
        }
    }

    _despawnAllCivilians() {
        for (const c of this._civilians) {
            try {
                if (c.entityId != null) this.router.exec({ type: "entity:despawn", id: c.entityId });
            } catch {}
        }
        this._civilians = [];
    }

    // ---------------------------------------------------------------
    // Round 254 — military wave management

    // Re-evaluate the wave roster every WAVE_CHECK_INTERVAL_MS. Spawns
    // missing units up to the tier's target count. Despawning is NOT
    // automatic — units killed by the kaiju are removed from
    // _militaryIds via _checkEatenMilitary, then the next wave check
    // refills the slots.
    _maintainWaves() {
        if (!this.botManager?.spawn) return;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (now - this._lastWaveCheckMs < WAVE_CHECK_INTERVAL_MS) return;
        this._lastWaveCheckMs = now;
        const tier = this.getStats().tier;
        const target = WAVES_BY_TIER[tier] ?? { tanks: 0, planes: 0 };

        // Count currently alive military by kind. botManager.bots may
        // have despawned some (killed by FPS — though FPS isn't active
        // here — or by being eaten). Reconcile.
        const alive = { tanks: 0, planes: 0 };
        for (const id of this._militaryIds) {
            const b = this.botManager.bots?.get(id);
            if (!b) { this._militaryIds.delete(id); continue; }
            if (b.spec?.kaijuOrigin) continue;
            if (b.spec?.flying) alive.planes++;
            else if (b.spec?.military) alive.tanks++;
        }
        // Spawn missing tanks
        for (let i = alive.tanks; i < target.tanks; i++) this._spawnMilitary("bot_tank");
        // Spawn missing planes
        for (let i = alive.planes; i < target.planes; i++) this._spawnMilitary("bot_plane");
    }

    _spawnMilitary(kind) {
        if (!this.botManager?.spawn || !this.camera?.position) return null;
        // Spawn at the city edge but on the OPPOSITE side from the
        // player so they have to approach. Pick a random point on a
        // circle of radius cityRadius+10 around the city center.
        const cityCenter = this.cityGen?._lastStamp ?? { centerX: 0, centerZ: 0, radius: 80 };
        const angle = Math.random() * Math.PI * 2;
        const r = (cityCenter.radius ?? 80) + 10;
        const x = (cityCenter.centerX ?? 0) + Math.cos(angle) * r;
        const z = (cityCenter.centerZ ?? 0) + Math.sin(angle) * r;
        try {
            const id = this.botManager.spawn({ x, z, kind });
            if (id != null) this._militaryIds.add(id);
            return id;
        } catch {
            return null;
        }
    }

    _despawnAllMilitary() {
        if (!this.botManager) { this._militaryIds.clear(); return; }
        for (const id of this._militaryIds) {
            try {
                if (this.botManager.bots?.has(id)) {
                    this.botManager._onBotKilled?.(id);
                }
            } catch {}
        }
        this._militaryIds.clear();
    }

    // Round 254 — eat detection. A military bot is "eaten" when it's
    // inside the kaiju body cylinder. Award growth bonus and despawn.
    _checkEatenMilitary() {
        if (!this.botManager?.bots || !this.camera?.position) return;
        const px = this.camera.position.x;
        const pz = this.camera.position.z;
        const footY = this.camera.position.y - this._size;
        const headY = this.camera.position.y;
        const radius = Math.max(2, Math.floor(Math.sqrt(this._size) * 0.65) + 1);
        const r2 = radius * radius;
        for (const id of [...this._militaryIds]) {
            const b = this.botManager.bots.get(id);
            if (!b) { this._militaryIds.delete(id); continue; }
            // Distance from player (XZ)
            const dx = b.x - px, dz = b.z - pz;
            if (dx * dx + dz * dz > r2) continue;
            // Y range — planes can be at altitude but if you're tall
            // enough your head reaches them
            if (b.y < footY - 1 || b.y > headY + 1) continue;
            // EAT IT
            this._onEaten(b);
            this._militaryIds.delete(id);
            try { this.botManager._onBotKilled?.(id); } catch {}
        }
    }

    _onEaten(bot) {
        const isPlane = bot.spec?.flying;
        const growth = isPlane ? GROWTH_PER_PLANE : GROWTH_PER_TANK;
        // Add growth via voxelsDestroyed equivalent so the same formula
        // applies. growth / GROWTH_PER_VOXEL = voxels-worth-equivalent.
        this._voxelsDestroyed += Math.round(growth / GROWTH_PER_VOXEL);
        this._eaten.growthFromEating += growth;
        if (isPlane) this._eaten.planes++;
        else this._eaten.tanks++;
        if (this.kpop?.success) {
            const label = isPlane ? "✈ PLANE EATEN" : "🚙 TANK EATEN";
            this.kpop.success(label, `+${growth.toFixed(0)}u growth`).catch(()=>{});
        }
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_kill", 0.7);
        // Burst of debris particles at the bot's position
        if (this.particles?.spawn) {
            for (let i = 0; i < 20; i++) {
                this.particles.spawn({
                    x: bot.x, y: bot.y, z: bot.z,
                    vx: (Math.random() - 0.5) * 10,
                    vy: 2 + Math.random() * 5,
                    vz: (Math.random() - 0.5) * 10,
                    ttl: 0.7, size: 0.30,
                    r: isPlane ? 0.75 : 0.40, g: isPlane ? 0.75 : 0.45, b: isPlane ? 0.80 : 0.30, a: 0.9,
                    gravity: 14,
                });
            }
        }
    }

    // ---------------------------------------------------------------

    // Each tick, destroy any building voxels inside the kaiju body
    // cylinder. Radius scales with size (cube-root-ish so it doesn't
    // explode too fast). Skip the GROUND layer so the player has a
    // floor to walk on.
    _stompCity() {
        if (!this.world?.setVoxel || !this.world?.voxelAt || !this.camera?.position) return;
        const px = Math.floor(this.camera.position.x);
        const pz = Math.floor(this.camera.position.z);
        // Body cylinder Y range — from feet (camera.y - size) up to head
        const footY = this.camera.position.y - this._size;
        const yMin = Math.floor(footY) + 1;   // +1 to spare the ground voxel underfoot
        const yMax = Math.floor(this.camera.position.y);
        // Body radius — scales sub-linearly with size so a 100u kaiju is
        // about 4u wide. At STARTING_SIZE=3, radius=1.
        const radius = Math.max(1, Math.floor(Math.sqrt(this._size) * 0.65));
        // Round 256 — look-ahead in facing direction. Sample voxels in
        // a forward strip beyond the body radius so walls just ahead
        // get pre-destroyed before the camera moves into them. Avoids
        // the "kaiju phases into wall" feel.
        let fwdX = 0, fwdZ = 0;
        if (this.camera.yaw != null) {
            fwdX = Math.sin(this.camera.yaw);
            fwdZ = Math.cos(this.camera.yaw);
        }
        const lookAhead = 2;   // 2 extra voxels in the facing direction
        let brokenThisTick = 0;
        for (let dx = -radius - lookAhead; dx <= radius + lookAhead; dx++) {
            for (let dz = -radius - lookAhead; dz <= radius + lookAhead; dz++) {
                // Skip if outside body cylinder AND outside the
                // forward look-ahead strip
                const inBody = (dx * dx + dz * dz) <= (radius + 0.5) * (radius + 0.5);
                let inLookAhead = false;
                if (!inBody) {
                    // Project (dx, dz) onto fwd direction; positive = ahead
                    const proj = dx * fwdX + dz * fwdZ;
                    const perp = Math.abs(dx * fwdZ - dz * fwdX);   // lateral distance
                    inLookAhead = proj > 0 && proj <= radius + lookAhead && perp <= radius;
                }
                if (!inBody && !inLookAhead) continue;
                for (let vy = yMin; vy <= yMax; vy++) {
                    let v;
                    try { v = this.world.voxelAt(px + dx, vy, pz + dz); } catch { continue; }
                    if (v === 0) continue;
                    // Skip liquids — kaiju doesn't "destroy" water
                    if (v === 10 || v === 11 || v === 12) continue;
                    try { this.world.setVoxel(px + dx, vy, pz + dz, 0); } catch {}
                    this._voxelsDestroyed++;
                    brokenThisTick++;
                    // Round 275 — building HP. Each destroyed voxel
                    // inside a building footprint counts as 1 hp of
                    // damage. CityGen.damageAt() handles crumble
                    // thresholds + topple at 0hp + cascade to neighbors.
                    // We skip when looking at ground voxels (y == groundY).
                    if (this.cityGen?.damageAt && vy > 0) {
                        // Pass direction = away from kaiju so the
                        // topple falls outward when the building dies.
                        const dirX = (px + dx) - px;
                        const dirZ = (pz + dz) - pz;
                        this.cityGen.damageAt(px + dx, pz + dz, 1.0,
                            { x: dirX, z: dirZ });
                    }
                    // Round 256 — record destroyed cell as "burning"
                    // (~5s). Tick adds fire particles per burning cell.
                    this._addBurningCell(px + dx, vy, pz + dz);
                    // Debris particle (occasional)
                    if (this.particles?.spawn && Math.random() < 0.08) {
                        this.particles.spawn({
                            x: px + dx + 0.5, y: vy + 0.5, z: pz + dz + 0.5,
                            vx: (Math.random() - 0.5) * 6,
                            vy: 2 + Math.random() * 3,
                            vz: (Math.random() - 0.5) * 6,
                            ttl: 0.6, size: 0.30,
                            r: 0.55, g: 0.45, b: 0.35, a: 0.85,
                            gravity: 14,
                        });
                    }
                }
            }
        }
        if (brokenThisTick > 0 && this.audio?.playProcedural) {
            const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
            if (!this._lastRumbleMs || now - this._lastRumbleMs > 350) {
                this._lastRumbleMs = now;
                try { this.audio.playProcedural("fps_kill", 0.4); } catch {}
            }
        }
    }

    // Apply the size formula to update camera eye height. Also lifts
    // the camera Y if growth pushed the eye below the foot — keeps the
    // foot on the ground as size grows.
    _applySize() {
        const growth = this._voxelsDestroyed * GROWTH_PER_VOXEL;
        const shrink = this._damageTaken * DAMAGE_SHRINK;
        this._size = Math.max(MIN_SIZE - 0.01, Math.min(MAX_SIZE, STARTING_SIZE + growth - shrink));
        if (this._size < MIN_SIZE) {
            this._onDefeated();
            return;
        }
        if (this.camera) {
            // Round 256 — explicit camera-Y formula. Foot anchored at
            // groundY + 1 (top of ground voxel). Eye at foot + size.
            // This prevents the camera from "presenting inside earth"
            // even if physics or another system tried to drop the Y.
            const eyeY = (this._groundY ?? 0) + 1 + this._size;
            this.camera.position.y = eyeY;
            this.camera._eyeHeight = this._size;
        }
    }

    _onDefeated() {
        if (this._defeated) return;
        this._defeated = true;
        if (this.kpop?.warn) {
            this.kpop.warn("☠ DEFEATED",
                `Crushed at size ${this._size.toFixed(1)}u after ${this._voxelsDestroyed} voxels`).catch(()=>{});
        }
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_low_hp", 1.0);
    }

    // ---------------------------------------------------------------
    // HUD

    _buildBadge() {
        if (typeof document === "undefined") return;
        this._removeBadge();
        const el = document.createElement("div");
        el.id = "kaiju-sandbox-badge";
        Object.assign(el.style, {
            position: "fixed",
            left: "50%", top: "60px",
            transform: "translateX(-50%)",
            background: "rgba(20,12,30,0.92)",
            color: "#fe6",
            padding: "10px 22px",
            borderRadius: "22px",
            fontFamily: "monospace",
            fontSize: "13px",
            letterSpacing: "2px",
            border: "2px solid #f6c",
            boxShadow: "0 0 24px rgba(255,100,200,0.55)",
            zIndex: "9100",
            pointerEvents: "none",
        });
        el.textContent = "🦖 KAIJU SANDBOX";
        document.body.appendChild(el);
        this._badgeEl = el;
    }

    _removeBadge() {
        if (this._badgeEl?.parentNode) {
            try { this._badgeEl.parentNode.removeChild(this._badgeEl); } catch {}
        }
        this._badgeEl = null;
    }

    _buildHud() {
        if (typeof document === "undefined") return;
        this._removeHud();
        const el = document.createElement("div");
        el.id = "kaiju-sandbox-hud";
        Object.assign(el.style, {
            position: "fixed",
            left: "12px", bottom: "12px",
            background: "rgba(8,12,20,0.92)",
            border: "1px solid #f6c",
            borderRadius: "6px",
            padding: "10px 14px",
            color: "#cfd",
            fontFamily: "monospace",
            fontSize: "12px",
            lineHeight: "1.5",
            zIndex: "9050",
            pointerEvents: "none",
            minWidth: "280px",
        });
        document.body.appendChild(el);
        this._hudEl = el;
        this._updateHud();
    }

    _updateHud() {
        if (!this._hudEl) return;
        const s = this.getStats();
        const sizeColor = s.size > 60 ? "#fc6" : s.size > 24 ? "#9cf" : "#cfc";
        const tierColor = s.tier === "MEGAKAIJU" || s.tier === "CITY-DEVOURER" ? "#fc6" : "#cfd";
        // Round 254/256 — eaten military counter + civilians (only show when > 0)
        const eatenLine = (this._eaten.tanks > 0 || this._eaten.planes > 0 || this._eaten.civilians > 0)
            ? `<div style="color:#fc9;">🚙 ${this._eaten.tanks} tanks · ✈ ${this._eaten.planes} planes · 🏃 ${this._eaten.civilians ?? 0} civilians</div>`
            : "";
        // Round 256 — fires currently burning
        const fireLine = this._burning.size > 0
            ? `<div style="color:#f96;">🔥 ${this._burning.size} cells burning</div>`
            : "";
        this._hudEl.innerHTML =
            `<div style="color:#fe6; font-weight:bold; letter-spacing:1.2px;">🦖 KAIJU</div>` +
            `<div style="color:${sizeColor};">SIZE: <b>${s.size.toFixed(1)}u</b>  ` +
            `<span style="color:${tierColor};">${s.tier}</span></div>` +
            `<div>VOXELS DESTROYED: <b>${s.voxelsDestroyed}</b></div>` +
            `<div>CITY: <b>${s.percentDestroyed.toFixed(0)}%</b> demolished` +
            (s.damageTaken > 0 ? `  ·  <span style="color:#f88;">DMG ${s.damageTaken.toFixed(1)}</span>` : "") +
            `</div>` +
            eatenLine +
            fireLine +
            (this._defeated ? `<div style="color:#f44; font-weight:bold; margin-top:4px;">☠ DEFEATED</div>` : "");
    }

    _removeHud() {
        if (this._hudEl?.parentNode) {
            try { this._hudEl.parentNode.removeChild(this._hudEl); } catch {}
        }
        this._hudEl = null;
    }
}
