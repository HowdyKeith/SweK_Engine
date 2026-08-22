// =============================================================================
// FILE: /simulation/FPSShooter.js
// ROUND: 215
// =============================================================================
//
// First-person shooter mode. Sits on top of the engine's existing "fp"
// camera mode (ground-locked walk + jump + collision) and adds:
//
//   • Crosshair reticle (DOM, screen center)
//   • Weapon view overlay (procedural gun barrel drawn in DOM)
//   • Click / space-bar fire — raycasts from camera forward
//   • Hit detection against ANY ECS entity within range + cone
//   • Per-entity HP, damage, death → toast + particles
//   • Player health (takes damage from bots via takeDamage(amount))
//   • HUD: health, ammo, kills, level name
//   • Pickups (entities with kind ∈ pickup_kinds) — walked into to grant
//     ammo / health
//   • Optional Ollama-generated WAD level on start
//   • KPop toast + TTS on kill + level clear
//
// Raycasting strategy:
//   Iterate alive enemy entities, project (entity.pos - cam.pos) onto
//   camera forward, accept if 0 < along < range AND lateral perpendicular
//   distance < hit_radius. O(entities) — cheap for <500 entities. For
//   bigger battles v216 will add a spatial index.
//
// API:
//   const f = new FPSShooter({ camera, router, world, particles,
//                              ollamaLevelGen, kpop, ecsWorld });
//   await f.start({ wadLevel: "a small dungeon", spawnAtRoom: "main" });
//   f.tick(dt);
//   f.registerEnemy(entityId, { hp: 3, kind: "bot" });
//   f.takeDamage(0.2);
//   f.stop();
//
// Console:
//   window.fps.start({ wadLevel: "a tavern with two side rooms" })
//   window.fps.stop()
//   window.fps.health()        // current HP
//   window.fps.kills()         // total kill count
// =============================================================================

const HIT_RANGE     = 50;       // max raycast distance

// Round 249 — wall-breaking bullets. Bullets carve a hole in soft
// materials (wood, glass) but bounce off hard ones (stone, metal,
// dirt). Liquids (water/lava) don't block — bullets pass through.
// Voxel ids: AIR=0, STONE=1, DIRT=2, WOOD=3, METAL=4, GLASS=5
const BREAKABLE_BULLET = new Set([3 /*wood*/, 5 /*glass*/]);
// Round 250 — armor-piercing buff extends the set to include stone +
// dirt. Metal still bounces.
const BREAKABLE_BULLET_PEN = new Set([1 /*stone*/, 2 /*dirt*/, 3 /*wood*/, 5 /*glass*/]);
const VOXEL_DEBRIS_COLOR = {
    1: [0.55, 0.55, 0.55],   // stone — gray (unused; non-breakable)
    2: [0.45, 0.30, 0.20],   // dirt — brown
    3: [0.55, 0.35, 0.20],   // wood — warm brown
    4: [0.70, 0.70, 0.75],   // metal — silver
    5: [0.75, 0.90, 1.00],   // glass — pale cyan
};
const HIT_RADIUS    = 2.5;      // perpendicular forgiveness (round 215.1 — was 1.6, too tight)
const FIRE_COOLDOWN = 0.18;     // seconds between shots
const DEFAULT_HP    = 1.0;      // player health (1.0 = full)
const DEFAULT_AMMO  = 30;
const RELOAD_TIME   = 1.5;
const RELOAD_MAX    = 30;

// Default enemy registry — entities matching these kinds count as
// targets automatically at spawn time.
const ENEMY_KINDS_AUTO = new Set([
    "bot", "bot_grunt", "bot_sniper", "bot_heavy",
    "bot_miniboss",                                              // round 226
    "bot_kaiju_sky", "bot_kaiju_space", "bot_kaiju_cave",        // round 230
    "bot_kaiju_underground", "bot_kaiju_water",
    "bot_kaiju_hell", "bot_kaiju_tech",
    "bot_king_sky", "bot_king_space", "bot_king_cave",           // round 234
    "bot_king_underground", "bot_king_water",
    "bot_king_hell", "bot_king_tech",
    "kaiju_grunt",
]);

const PICKUP_KINDS = new Set([
    "wad_pickup_health",
    "wad_pickup_ammo",
    "wad_pickup_gravity",       // round 225
    "wad_pickup_key_red",        // round 229
    "wad_pickup_key_blue",       // round 229
    "wad_pickup_key_yellow",     // round 229
    "wad_pickup_kaiju",          // round 237
    "wad_pickup_o2",             // round 244
    "wad_pickup_bullet_pen",     // round 250
]);

export class FPSShooter {
    constructor({
        camera, router, world, particles, ollamaLevelGen,
        kpop = null, ecsWorld = null, audio = null,
        gravityWarp = null,                  // round 225 — injected from main.js
        spaceSuit = null,                    // round 236 — injected from main.js
        kaijuMode = null,                    // round 237 — injected from main.js
        visionModes = null,                  // round 244 — for battery refill
        botManager = null,                   // round 252 — for boss enrage hook
    }) {
        this.camera = camera;
        this.router = router;
        this.world  = world;
        this.particles = particles;
        this.ollamaLevelGen = ollamaLevelGen;
        this.kpop   = kpop;
        this.ecsWorld = ecsWorld;
        this.audio  = audio;
        this.gravityWarp = gravityWarp;
        this.spaceSuit = spaceSuit;
        this.kaijuMode = kaijuMode;
        this.visionModes = visionModes;
        this.botManager = botManager;

        this.active = false;
        this.health = DEFAULT_HP;
        this.ammo   = DEFAULT_AMMO;
        this.kills  = 0;
        this.shots  = 0;
        this.levelName = null;
        // Round 222 — dungeon progression
        this.levelNumber = 1;       // increments on exit transition
        this.totalKills  = 0;       // lifetime across all levels
        this.totalShots  = 0;
        this._levelStartMs = 0;
        this.reloading = false;
        this._reloadEndsAt = 0;
        this._fireCooldown = 0;
        this._lastDamageMs = 0;

        // Targets: entityId → { hp, maxHp, kind, name, deathCb? }
        this._enemies = new Map();
        // Pickups: entityId → { kind, value, x, z }
        this._pickups = new Map();

        this._prevCameraMode = null;
        this._hudEl     = null;
        this._reticleEl = null;
        this._gunEl     = null;
        this._damageFlashEl = null;

        this._onKey = this._handleKey.bind(this);
        this._onMouseDown = this._handleMouseDown.bind(this);
    }

    async start(opts = {}) {
        if (this.active) this.stop();
        // v1418 — optional attack hook: when set, the space/click primary attack routes here
        // (so the dungeon can fire the EQUIPPED weapon instead of always the hitscan).
        this._onFire = (typeof opts.onFire === "function") ? opts.onFire : null;

        // Optional: build a level via Ollama before entering FP mode
        if (opts.wadLevel && this.ollamaLevelGen) {
            const layout = await this.ollamaLevelGen.generate(opts.wadLevel);
            if (layout) {
                this.levelName = layout.name || opts.wadLevel;
            } else {
                this.levelName = opts.wadLevel + " (fallback)";
                // No level generated; the player will fight on open terrain
            }
        }

        // Snap camera into FP mode at spawn point. Prefer a generated
        // room center; else origin elevated slightly.
        if (this.camera) {
            this._prevCameraMode = this.camera.mode;
            const spawn = this._pickSpawn(opts.spawnAtRoom);
            this.camera.position.x = spawn.x;
            this.camera.position.y = spawn.y;
            this.camera.position.z = spawn.z;
            this.camera.yaw = 0;
            this.camera.pitch = -0.05;
            if (this.camera.setMode) this.camera.setMode("fp");
        }

        // Reset state
        this.active = true;
        this.health = DEFAULT_HP;
        this.ammo   = DEFAULT_AMMO;
        this.kills  = 0;
        this.shots  = 0;
        this.reloading = false;
        this._fireCooldown = 0;
        // Round 288 — start stamina + weapon-energy. Lazy-constructed
        // here so FPSShooter doesn't carry the import cost when FPS
        // mode is never used.
        if (!this.stamina) {
            try {
                const mod = await import("./FPSStamina.js");
                this.stamina = new mod.FPSStamina({
                    camera: this.camera,
                    fpsShooter: this,
                    kpop: this.kpop,
                    audio: this.audio,
                });
            } catch (e) {
                console.warn("[FPSShooter] FPSStamina unavailable:", e?.message ?? e);
            }
        }
        try { this.stamina?.start(); } catch (e) { console.warn("[FPSStamina.start]", e?.message ?? e); }
        // Round 222 — mark per-level start (for clear-time HUD)
        this._levelStartMs = performance.now();
        // Round 229 — keys + doors. Inventory carries the COLORS the
        // player has collected this level. Doors are a list of voxel
        // descriptors from OllamaLevelGenerator; FPSShooter opens them
        // on proximity if the matching key is held.
        this.keyInventory = new Set();
        // Round 242 — reset kaiju auto-trigger flag so each level
        // gets one clutch save when HP drops below 10%
        this._kaijuAutoTriggered = false;
        // Round 250 — bullet penetration buff ms. Bullets break stone +
        // dirt while > 0. Set by collecting wad_pickup_bullet_pen.
        this._bulletPenMs = 0;
        this._doors = this.ollamaLevelGen?.getLastDoors?.() || [];
        // Round 252 — initialize door HP and a voxel→door reverse lookup
        // so bullet hits can damage doors over multiple shots even
        // without the matching key. DOOR_HP default of 5 means ~1 magazine
        // tap; thick doors could specify their own hp in the schema later.
        this._doorVoxelLookup = new Map();
        for (const door of this._doors) {
            if (door.hp == null) door.hp = 5;
            if (door.maxHp == null) door.maxHp = door.hp;
            for (const v of (door.voxels || [])) {
                this._doorVoxelLookup.set(`${v.x},${v.y},${v.z}`, door);
            }
        }
        this._exitRequiresKeys = this.ollamaLevelGen?.getLastExit?.()?.requires_keys || [];
        // Round 232 — pressure plates. Snapshot from level gen so we
        // can do proximity detection + fire one-shot trigger actions.
        this._plates = this.ollamaLevelGen?.getLastPlates?.() || [];

        // Auto-register any current enemies in scene
        this._autoDiscoverEnemies();

        document.addEventListener("keydown", this._onKey);
        document.addEventListener("mousedown", this._onMouseDown);

        this._buildHud();
        this._announceLevelStart();
        // Round 219 — level-start sweep cue
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_level_start", 0.55);
        // Round 216 — auto-spawn bots if BotManager is wired and we have a
        // generated WAD layout. Bot density tuned so a small dungeon has
        // ~3-6 bots: enough to fight without overwhelming the player.
        if (opts.spawnBots !== false && typeof window !== "undefined" &&
            window.bots?.spawnFromLastLevel && this.ollamaLevelGen?._lastLevel) {
            try {
                window.bots.spawnFromLastLevel({ density: opts.botDensity ?? 0.7 });
            } catch (e) { /* bots optional */ }
        }
        // Round 219 — auto-register pickups from the WAD layout so they
        // become collectible (kind/value/position were stored by the
        // OllamaLevelGenerator when it spawned them).
        if (this.ollamaLevelGen?.getLastPickups) {
            for (const pu of this.ollamaLevelGen.getLastPickups()) {
                this.registerPickup(pu.id, {
                    kind: pu.kind, value: pu.value, x: pu.x, z: pu.z,
                });
            }
        }
        // Round 219 — track the exit portal location. Initially inactive
        // (no collision trigger); _checkExit is called from tick() after
        // _levelCleared fires.
        this._exitInfo = this.ollamaLevelGen?.getLastExit?.() || null;
        this._exitOpen = false;
        this._clearedAt = null;
        // Round 223 — pull teleporter portal pairs from the layout. Each
        // pair is two entities with mutual references; collision triggers
        // a teleport to the paired endpoint.
        this._portalPairs = this.ollamaLevelGen?.getLastPortalPairs?.() || [];
        this._portalCooldownMs = 0;
        this._lastUsedPortalId = null;
        // Round 224 — gravity. Save base gravity so we can restore on
        // stop, and start tracking the player's airborne state so we
        // can compute fall distance on landing.
        if (this.camera) {
            this._cameraBaseGravity = this.camera._gravity;
        }
        this._wasOnGround = true;
        this._fallStartY = this.camera?.position?.y ?? 0;
        this._currentGravityMult = 1.0;        // updated each tick from active room
        this._jumpPadCooldownMs = 0;            // prevent infinite bouncing
        this._lastUsedJumpPadId = null;
        console.log(`[FPS] start — level=${this.levelName || "open"} hp=${this.health.toFixed(2)} ammo=${this.ammo}`);
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        // Round 288 — tear down stamina HUD + listeners
        try { this.stamina?.stop(); } catch (e) { console.warn("[FPSStamina.stop]", e?.message ?? e); }
        // Round 225 — clean up any in-progress gravity warp so the canvas
        // doesn't stay rotated after exiting FPS mode
        if (this.gravityWarp?.isActive?.()) this.gravityWarp.deactivate();
        // Round 237 — clean up kaiju mode so the camera scale doesn't
        // persist into observer / kaiju_drive modes
        if (this.kaijuMode?.isActive?.()) this.kaijuMode.deactivate();
        // Round 224 — restore base gravity so other camera modes
        // (observer, kaiju_drive) aren't affected by FPS-level gravity
        if (this.camera && this._cameraBaseGravity != null) {
            this.camera._gravity = this._cameraBaseGravity;
        }
        if (this.camera && this._prevCameraMode && this.camera.setMode) {
            try { this.camera.setMode(this._prevCameraMode); } catch {}
        }
        this._prevCameraMode = null;
        document.removeEventListener("keydown", this._onKey);
        document.removeEventListener("mousedown", this._onMouseDown);
        this._onFire = null;   // v1418
        if (this._hudEl)     { this._hudEl.remove();     this._hudEl = null; }
        if (this._reticleEl) { this._reticleEl.remove(); this._reticleEl = null; }
        if (this._gunEl)     { this._gunEl.remove();     this._gunEl = null; }
        if (this._damageFlashEl) { this._damageFlashEl.remove(); this._damageFlashEl = null; }
        // Round 226 — clean up boss HP bar so it doesn't linger
        if (this._bossBarEl?.parentNode) {
            this._bossBarEl.parentNode.removeChild(this._bossBarEl);
            this._bossBarEl = null;
        }
        this._enemies.clear();
        this._pickups.clear();
    }

    // External hook: register an enemy entity to make it shootable. Bot
    // managers (v216) call this on every bot spawn.
    registerEnemy(entityId, opts = {}) {
        const hp = opts.hp ?? 1;
        this._enemies.set(entityId, {
            hp, maxHp: hp,
            kind: opts.kind ?? "bot",
            name: opts.name ?? null,
            deathCb: opts.onDeath ?? null,
            // Round 252 — enrage flag fires once when HP drops below
            // ENRAGE_THRESHOLD (default 25% of maxHp) for boss-tier
            // enemies. _damageEnemy invokes onEnrage when flipped.
            enraged: false,
        });
    }
    unregisterEnemy(entityId) { this._enemies.delete(entityId); }
    // v1417 — public hook so thrown weapons (dungeon) damage a registered enemy through
    // the normal damage/death/particle/onDeath flow.
    damageEnemy(entityId, amount) { try { this._damageEnemy(entityId, amount); } catch (e) {} }
    // v1430 — current enemy HP fraction (0..1), or null if unknown (for AI flee decisions).
    enemyHP(entityId) { const e = this._enemies.get(entityId); return e ? (e.maxHp ? e.hp / e.maxHp : 1) : null; }

    registerPickup(entityId, opts = {}) {
        this._pickups.set(entityId, {
            kind: opts.kind ?? "wad_pickup_health",
            value: opts.value ?? 0.25,
            x: opts.x ?? 0, z: opts.z ?? 0,
        });
    }

    // Bots inflict damage by calling this. amount is 0..1 fraction.
    takeDamage(amount, source = null) {
        if (!this.active) return;
        this.health = Math.max(0, this.health - amount);
        this._lastDamageMs = performance.now();
        this._flashDamage();
        // Round 219 — player hit SFX
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_hit_player", Math.min(1, amount * 3));
        // Round 242 — clutch auto-trigger of kaiju mode when health
        // drops below 10%. Once per level (reset in start()). The
        // half-damage + stomp give a real chance to recover. Only
        // fires if kaijuMode isn't already active and the player isn't
        // already dead (post-amount subtraction).
        if (this.health > 0 && this.health < 0.10 && !this._kaijuAutoTriggered) {
            if (this.kaijuMode && !this.kaijuMode.isActive?.()) {
                this._kaijuAutoTriggered = true;
                if (this.kpop?.warn) {
                    this.kpop.warn("⚡ LAST STAND — KAIJU MODE", "Health critical — emergency power-up").catch(()=>{});
                }
                this.kaijuMode.activate?.(8);   // shorter than pickup-triggered (12s)
            }
        }
        if (this.health <= 0) this._die(source);
    }

    tick(dt) {
        if (!this.active) return;

        // Round 288 — stamina + weapon-energy update
        if (this.stamina?.active) {
            try { this.stamina.tick(dt); }
            catch (e) { console.warn("[FPSStamina.tick]", e?.message ?? e); }
        }

        // Fire cooldown
        if (this._fireCooldown > 0) this._fireCooldown -= dt;
        // Round 250 — bullet penetration buff countdown
        if (this._bulletPenMs > 0) {
            this._bulletPenMs = Math.max(0, this._bulletPenMs - dt * 1000);
        }

        // Round 224 — apply per-room gravity zone (low-G, high-G), check
        // for fall damage on landing, and trigger jump pads if stepping
        // on one. All three live together because they share the camera
        // _gravity / _fpVelY / _fpOnGround state.
        // Round 225 — gravity warp runs BEFORE the others so its locked
        // Y / zero-G overrides take precedence over per-room gravity.
        if (this.gravityWarp?.tick) this.gravityWarp.tick(dt);
        this._updateGravityZone();
        this._checkFallDamage();
        this._checkJumpPads(dt);
        // Round 227 — environmental hazards (lava = damage over time)
        this._checkHazards(dt);

        // Reload completion
        if (this.reloading && performance.now() >= this._reloadEndsAt) {
            this.reloading = false;
            this.ammo = RELOAD_MAX;
            if (this.kpop?.info) this.kpop.info("Reloaded", "Magazine full").catch(()=>{});
        }

        // Pickup collision check
        this._checkPickups();

        // Round 229 — door proximity check (any unopened doors with
        // matching keys in inventory get carved open)
        this._checkDoors();
        // Round 232 — pressure-plate proximity check (one-shot trigger)
        this._checkPlates();

        // Round 219 — exit portal proximity check (only after level clear)
        if (this._exitOpen && this._exitInfo) {
            this._checkExit();
        }

        // Round 223 — teleporter portal proximity check
        if (this._portalPairs && this._portalPairs.length > 0) {
            this._checkPortals(dt);
        }

        // Level cleared? (no enemies left and a level is loaded)
        if (this.levelName && this._enemies.size === 0 && this.kills > 0) {
            this._levelCleared();
        }

        if (this._hudEl) this._updateHud();
    }

    fire() {
        if (!this.active) return null;
        if (this._fireCooldown > 0 || this.reloading || this.ammo <= 0) return null;

        // Round 288 — weapon energy gates fire damage + cooldown.
        // When energy is low, the shot still fires but at reduced
        // effect (panic-fire behavior). consumeFire() returns
        // { gimped, damageMul, cooldownMul }.
        let damageMul = 1, cooldownMul = 1, gimped = false;
        if (this.stamina?.active) {
            const r = this.stamina.consumeFire();
            damageMul   = r.damageMul;
            cooldownMul = r.cooldownMul;
            gimped      = r.gimped;
        }
        this._fireCooldown = FIRE_COOLDOWN * cooldownMul;
        // Stash on instance so the hit-resolution path can multiply
        // base damage. Cleared at end of fire().
        this._shotDamageMul = damageMul;
        this.ammo--;
        this.shots++;
        // Round 219 — fire SFX (procedural noise burst + descending sawtooth)
        // Round 288 — gimped shot uses a softer/lower volume so the
        // player hears the difference.
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_fire", gimped ? 0.45 : 0.8);

        const cam = this.camera;
        if (!cam) return null;

        // Camera forward direction
        const cy = Math.cos(cam.yaw),  sy = Math.sin(cam.yaw);
        const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
        const fwd = { x: sy * cp, y: -sp, z: cy * cp };
        const origin = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

        // Tracer particles
        if (this.particles?.spawn) {
            for (let i = 0; i < 5; i++) {
                const t = i / 5;
                this.particles.spawn({
                    x: origin.x + fwd.x * (3 + t * 6),
                    y: origin.y + fwd.y * (3 + t * 6) - 0.4,
                    z: origin.z + fwd.z * (3 + t * 6),
                    ttl: 0.15,
                    size: 0.18 - t * 0.05,
                    r: 1.0, g: 0.9, b: 0.4, a: 0.8,
                });
            }
        }

        // Find closest enemy hit
        const hit = this._raycastEnemies(origin, fwd, HIT_RANGE);
        // Round 249 — voxel-aware raycast for wall-breaking. Step along
        // the ray and check for solid voxels in front of any enemy hit.
        // BREAKABLE materials get carved out (1-voxel hole + small
        // particle puff). UNBREAKABLE materials block the bullet (stop
        // ray, sparks visual). The enemy hit only registers if it's
        // closer than the wall.
        const wallHit = this._raycastVoxelHit(origin, fwd, hit ? Math.hypot(hit.pos.x - origin.x, hit.pos.y - origin.y, hit.pos.z - origin.z) : HIT_RANGE);
        if (wallHit) {
            // Round 252 — door HP: if this voxel belongs to a door,
            // route the hit to door damage instead of voxel break. Wood
            // doors crack open over ~5 hits even without the key.
            const doorAtHit = this._doorVoxelLookup?.get(`${wallHit.x},${wallHit.y},${wallHit.z}`);
            if (doorAtHit && !doorAtHit.opened) {
                this._damageDoor(doorAtHit, 1, wallHit);
            } else if (wallHit.breakable) {
                this._breakVoxel(wallHit.x, wallHit.y, wallHit.z, wallHit.voxelId);
                this._spawnWallSparks(wallHit, fwd);
            } else {
                this._spawnWallSparks(wallHit, fwd);
            }
        } else if (hit) {
            // Round 288 — energy-gated damage. If we fired a "gimped"
            // shot (low weapon energy), damage was halved by stamina's
            // consumeFire(). _shotDamageMul is stashed on the shooter.
            this._damageEnemy(hit.entityId, 1.0 * (this._shotDamageMul ?? 1));
        }
        // Muzzle flash
        if (this.particles?.spawn) {
            for (let i = 0; i < 6; i++) {
                this.particles.spawn({
                    x: origin.x + fwd.x * 1.2 + (Math.random()-0.5)*0.3,
                    y: origin.y + fwd.y * 1.2 - 0.3,
                    z: origin.z + fwd.z * 1.2 + (Math.random()-0.5)*0.3,
                    vx: fwd.x * 4 + (Math.random()-0.5)*1.5,
                    vy: 0.5 + Math.random(),
                    vz: fwd.z * 4 + (Math.random()-0.5)*1.5,
                    ttl: 0.2, size: 0.28,
                    r: 1.0, g: 0.7, b: 0.2, a: 0.85,
                });
            }
        }
        return hit;
    }

    startReload() {
        if (!this.active || this.reloading || this.ammo === RELOAD_MAX) return;
        this.reloading = true;
        this._reloadEndsAt = performance.now() + RELOAD_TIME * 1000;
        if (this.kpop?.info) this.kpop.info("Reloading…", "1.5s").catch(()=>{});
    }

    health_value() { return this.health; }
    kills_value()  { return this.kills; }

    // ------------------------------------------------------------------------

    _raycastEnemies(origin, fwd, maxRange) {
        let bestHit = null;
        let bestAlong = Infinity;
        for (const [entityId, info] of this._enemies) {
            const pos = this._getEntityPos(entityId);
            if (!pos) continue;
            const dx = pos.x - origin.x;
            const dy = pos.y - origin.y;
            const dz = pos.z - origin.z;
            const along = dx * fwd.x + dy * fwd.y + dz * fwd.z;
            if (along < 0.5 || along > maxRange) continue;
            // Lateral distance squared = |perp|² = |delta|² - along²
            const dist2 = dx*dx + dy*dy + dz*dz;
            const lat2 = Math.max(0, dist2 - along * along);
            if (lat2 < HIT_RADIUS * HIT_RADIUS && along < bestAlong) {
                bestAlong = along;
                bestHit = { entityId, info, along, pos };
            }
        }
        return bestHit;
    }

    // Round 249 — step along ray, find first non-empty voxel within
    // maxRange. Returns { x, y, z, voxelId, breakable } or null.
    // Step size 0.4 means a 1-voxel block is sampled ~2-3 times so we
    // never tunnel through walls.
    // Round 250 — if bullet penetration buff is active, stone + dirt
    // count as breakable too.
    _raycastVoxelHit(origin, fwd, maxRange) {
        if (!this.world?.voxelAt) return null;
        const breakSet = this._bulletPenMs > 0 ? BREAKABLE_BULLET_PEN : BREAKABLE_BULLET;
        const STEP = 0.4;
        const steps = Math.ceil(maxRange / STEP);
        for (let i = 1; i <= steps; i++) {
            const t = i * STEP;
            const x = Math.floor(origin.x + fwd.x * t);
            const y = Math.floor(origin.y + fwd.y * t);
            const z = Math.floor(origin.z + fwd.z * t);
            let v;
            try { v = this.world.voxelAt(x, y, z); } catch { continue; }
            // 0 = air; 10 = water; 11 = flowing water; 12 = lava
            // Treat liquids as non-blocking (bullet passes through)
            if (v === 0 || v === 10 || v === 11 || v === 12) continue;
            return { x, y, z, voxelId: v, breakable: breakSet.has(v) };
        }
        return null;
    }

    // Round 249 — break a voxel by setting it to air. Emits a puff of
    // material-colored debris particles. Tries to keep the visual
    // consistent with the wall's color.
    // Round 252 — bullet-damaged doors. Doors take HP damage per hit
    // and visually crack/open at thresholds. When hp reaches 0, the
    // door is carved (same end-state as key-opening) but the key
    // requirement is bypassed. The wall_sparks visual still plays so
    // the player sees the hit feedback.
    _damageDoor(door, dmg, wallHit) {
        if (door.opened) return;
        door.hp = Math.max(0, (door.hp ?? 5) - dmg);
        // Wood splinter particles
        if (this.particles?.spawn) {
            const cx = wallHit.x + 0.5, cy = wallHit.y + 0.5, cz = wallHit.z + 0.5;
            for (let i = 0; i < 6; i++) {
                this.particles.spawn({
                    x: cx, y: cy, z: cz,
                    vx: (Math.random() - 0.5) * 4,
                    vy: 1 + Math.random() * 2,
                    vz: (Math.random() - 0.5) * 4,
                    ttl: 0.4, size: 0.18,
                    r: 0.55, g: 0.35, b: 0.20, a: 0.9,
                    gravity: 12,
                });
            }
        }
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_hit_player", 0.25);
        // Damage feedback toast (throttled — only at 50% and 0%)
        const halfMark = Math.floor(door.maxHp / 2);
        if (door.hp === halfMark && this.kpop?.info) {
            this.kpop.info(`${door.color?.toUpperCase() ?? "WOOD"} door cracking`, "Half splintered").catch(()=>{});
        }
        if (door.hp <= 0) {
            // Carve the door — same as key-opening logic
            for (const v of door.voxels) {
                try { this.world.setVoxel(v.x, v.y, v.z, 0); } catch {}
            }
            door.opened = true;
            // Remove voxels from lookup so future hits at these positions
            // are normal wall hits (which will pass through air, then
            // ramp on, etc.)
            for (const v of door.voxels) {
                this._doorVoxelLookup.delete(`${v.x},${v.y},${v.z}`);
            }
            if (this.kpop?.success) {
                this.kpop.success(`${door.color?.toUpperCase() ?? "WOOD"} door SHOT DOWN`, "No key needed").catch(()=>{});
            }
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_exit_open", 0.55);
        }
    }

    _breakVoxel(x, y, z, voxelId) {
        if (!this.world?.setVoxel) return;
        try { this.world.setVoxel(x, y, z, 0); } catch {}
        // Round 250/251 — voxel rubble: if the cell directly below is
        // air, drop a RUBBLE voxel (id 7, round 251) there. Gives broken
        // material a visible pile at the foot of the wall. RUBBLE is
        // visually distinct from natural DIRT (id 2) — darker, cooler
        // brown-gray — so destruction reads as destruction.
        try {
            const below = this.world.voxelAt(x, y - 1, z);
            if (below === 0) this.world.setVoxel(x, y - 1, z, 7);
        } catch {}
        if (!this.particles?.spawn) return;
        const [pr, pg, pb] = VOXEL_DEBRIS_COLOR[voxelId] || [0.7, 0.7, 0.7];
        for (let i = 0; i < 8; i++) {
            this.particles.spawn({
                x: x + 0.5 + (Math.random() - 0.5) * 0.6,
                y: y + 0.5 + (Math.random() - 0.5) * 0.6,
                z: z + 0.5 + (Math.random() - 0.5) * 0.6,
                vx: (Math.random() - 0.5) * 4,
                vy: 1 + Math.random() * 2,
                vz: (Math.random() - 0.5) * 4,
                ttl: 0.4 + Math.random() * 0.3,
                size: 0.18 + Math.random() * 0.10,
                r: pr, g: pg, b: pb, a: 0.85,
                gravity: 12,    // debris falls
            });
        }
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_hit_player", 0.18);
    }

    // Round 249 — spark/puff at a wall hit point. Either a true spark
    // (unbreakable) or a debris burst (breakable, already handled in
    // _breakVoxel) — this method handles only the spark case.
    _spawnWallSparks(wallHit, fwd) {
        if (!this.particles?.spawn) return;
        if (wallHit.breakable) return;   // _breakVoxel handles the visual
        const cx = wallHit.x + 0.5, cy = wallHit.y + 0.5, cz = wallHit.z + 0.5;
        for (let i = 0; i < 6; i++) {
            // Reflected sparks: roughly opposite to bullet direction,
            // spread in a cone
            const spread = 0.8;
            this.particles.spawn({
                x: cx, y: cy, z: cz,
                vx: -fwd.x * 3 + (Math.random() - 0.5) * spread * 5,
                vy: 1.5 + (Math.random() - 0.5) * spread * 3,
                vz: -fwd.z * 3 + (Math.random() - 0.5) * spread * 5,
                ttl: 0.25, size: 0.10,
                r: 1.0, g: 0.85, b: 0.4, a: 0.95,
                gravity: 8,
            });
        }
    }

    _damageEnemy(entityId, amount) {
        const info = this._enemies.get(entityId);
        if (!info) return;
        // Round 231 — invulnerable enemies (e.g. boss in phase 2 while
        // minions are alive) still emit a hit particle but take no HP.
        // The player gets visual feedback "you hit it" without breaking
        // the phase mechanic.
        if (info.invulnerable) {
            // Tiny puff so the player knows the hit registered but glanced
            const pos = this._getEntityPos(entityId);
            if (pos && this.particles?.spawn) {
                for (let i = 0; i < 4; i++) {
                    this.particles.spawn({
                        x: pos.x + (Math.random()-0.5)*0.6,
                        y: pos.y + 1.2,
                        z: pos.z + (Math.random()-0.5)*0.6,
                        vx: (Math.random()-0.5)*2,
                        vy: 1 + Math.random(),
                        vz: (Math.random()-0.5)*2,
                        ttl: 0.4, size: 0.30,
                        r: 0.8, g: 0.8, b: 1.0, a: 0.6,
                    });
                }
            }
            return;
        }
        info.hp -= amount;
        // Round 252 — boss enrage at low HP. Mini-bosses and king-tier
        // kaiju get a one-time fire-rate boost + visual cue when HP
        // drops below 25%. The BotManager is notified so it can shorten
        // the bot's fireInterval; we also push a KPop warning so the
        // player knows the boss escalated.
        if (!info.enraged && info.maxHp >= 8 && info.hp <= info.maxHp * 0.25 && info.hp > 0) {
            info.enraged = true;
            if (this.botManager?._boost) {
                try { this.botManager._boost(entityId, { fireMul: 0.70 }); } catch {}
            }
            if (this.kpop?.warn) {
                this.kpop.warn("⚠ ENRAGED", "The boss accelerates...").catch(()=>{});
            }
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_low_hp", 0.8);
        }
        // Impact particles at enemy position
        const pos = this._getEntityPos(entityId);
        if (pos && this.particles?.spawn) {
            for (let i = 0; i < 12; i++) {
                this.particles.spawn({
                    x: pos.x + (Math.random()-0.5)*0.4,
                    y: pos.y + 1 + (Math.random()-0.5)*0.4,
                    z: pos.z + (Math.random()-0.5)*0.4,
                    vx: (Math.random()-0.5)*4,
                    vy: 1 + Math.random()*2,
                    vz: (Math.random()-0.5)*4,
                    ttl: 0.5, size: 0.25,
                    r: 1.0, g: 0.4, b: 0.3, a: 0.85,
                });
            }
        }
        if (info.hp <= 0) {
            this._killEnemy(entityId, info);
        }
    }

    _killEnemy(entityId, info) {
        // Round 226 — capture position BEFORE despawn so we can drop loot
        // for mini-boss kills
        const isBoss = info.kind === "bot_miniboss" ||
                       (typeof info.kind === "string" && info.kind.startsWith("bot_king_"));
        let bossPos = null;
        if (isBoss) {
            bossPos = this._getEntityPos(entityId);
        }
        this._enemies.delete(entityId);
        this.kills++;
        // Round 219 — kill SFX (plucked string ping)
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_kill", 0.6);
        // Despawn the entity. Bot managers can override this via deathCb.
        if (info.deathCb) {
            try { info.deathCb(entityId); } catch {}
        } else if (this.router?.exec) {
            try { this.router.exec({ type: "entity:despawn", id: entityId }); } catch {}
        }
        // Kill notification
        if (this.kpop?.info) {
            const label = info.name || info.kind || "enemy";
            this.kpop.info("Kill", `${label} eliminated (${this.kills} total)`).catch(()=>{});
        }
        // Round 226 — mini-boss death: emphasised cues + a guaranteed
        // gravity-warp pickup drop at the boss's xz so the next minute
        // of gameplay has a wild moment in it.
        if (isBoss) {
            if (this.audio?.playProcedural) {
                // Big bell phrase, then sweep, layered for impact
                this.audio.playProcedural("fps_level_clear", 1.0);
                setTimeout(() => this.audio.playProcedural("fps_exit_open", 0.8), 350);
            }
            if (this.kpop?.success) {
                this.kpop.success("⚔ MINI-BOSS DOWN", `LV ${this.levelNumber} cleared its champion`).catch(()=>{});
            }
            if (this.kpop?.speak) {
                this.kpop.speak({ Voice: "M1", Text: "Mini-boss eliminated." }).catch(()=>{});
            }
            this._spawnBossLoot(bossPos, info.kind);
        }
        console.log(`[FPS] kill #${this.kills}: ${info.name || info.kind || entityId}${isBoss ? " (MINI-BOSS)" : ""}`);
    }

    // Round 226 — spawn a gravity-warp pickup at the boss's last
    // position so the player gets a guaranteed power-up as a reward.
    // Round 242 — king-tier bosses ALSO drop a kaiju totem (next to
    // the gravity pickup, offset 1.5u so the player can see both).
    // Legacy bot_miniboss drops only the gravity pickup.
    _spawnBossLoot(bossPos, bossKind = null) {
        if (!bossPos || !this.router?.exec) return;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "wad_pickup_gravity",
            kind: "wad_pickup_gravity",
            x: bossPos.x, y: bossPos.y, z: bossPos.z,
            scale: 0.8, yaw: 0,
        });
        if (r?.ok && r.id != null) {
            this.registerPickup(r.id, {
                kind: "wad_pickup_gravity", value: 8,
                x: bossPos.x, z: bossPos.z,
            });
            if (this.kpop?.info) {
                this.kpop.info("Boss dropped a gravity warp", "Walk to it to collect").catch(()=>{});
            }
        }
        // Round 242 — kings additionally drop the kaiju totem
        const isKing = typeof bossKind === "string" && bossKind.startsWith("bot_king_");
        if (isKing) {
            const tx = bossPos.x + 1.5, tz = bossPos.z;
            const tr = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "wad_pickup_kaiju",
                kind: "wad_pickup_kaiju",
                x: tx, y: bossPos.y, z: tz,
                scale: 0.95, yaw: 0,
            });
            if (tr?.ok && tr.id != null) {
                this.registerPickup(tr.id, {
                    kind: "wad_pickup_kaiju", value: 12,
                    x: tx, z: tz,
                });
                if (this.kpop?.success) {
                    this.kpop.success("⚡ Kaiju trophy", "The king's power is yours").catch(()=>{});
                }
            }
        }
    }

    _checkExit() {
        if (!this._exitInfo || !this.camera?.position) return;
        if (this._exitTriggered) return;
        const dx = this._exitInfo.x - this.camera.position.x;
        const dz = this._exitInfo.z - this.camera.position.z;
        if (dx*dx + dz*dz < 2.0 * 2.0) {
            // Round 229 — sealed exits: if the exit declared
            // requires_keys, suppress trigger until those keys are
            // held. Throttle the warning toast so we don't spam.
            const needed = this._exitRequiresKeys || [];
            const missing = needed.filter(k => !this.keyInventory.has(k));
            if (missing.length > 0) {
                if (!this._exitSealedToastAt || performance.now() - this._exitSealedToastAt > 2500) {
                    this._exitSealedToastAt = performance.now();
                    if (this.kpop?.warn) {
                        this.kpop.warn("Exit sealed", `Need ${missing.join(", ")} key${missing.length > 1 ? "s" : ""}`).catch(()=>{});
                    }
                    if (this.audio?.playProcedural) this.audio.playProcedural("fps_hit_player", 0.3);
                }
                return;
            }
            this._exitTriggered = true;
            if (this.kpop?.success) {
                this.kpop.success("Through the portal", "Generating next level…").catch(()=>{});
            }
            if (this.kpop?.speak) {
                this.kpop.speak({ Voice: "M1", Text: "Transitioning." }).catch(()=>{});
            }
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_exit_open", 0.7);
            if (this._onExitEnteredCb) {
                try { this._onExitEnteredCb(); } catch (e) {}
            }
        }
    }

    // Round 229 — open doors when the player is close AND has the
    // matching key. The door descriptor lists its constituent voxels;
    // we carve them back to AIR via world.setVoxel, mark opened=true,
    // and fire feedback (toast + sound). Door consumption is OFF by
    // default: keeping the key means the player can re-open the same
    // color elsewhere. Easier to design and forgives backtracking.
    _checkDoors() {
        if (!this._doors || this._doors.length === 0) return;
        if (!this.camera?.position || !this.world?.setVoxel) return;
        const cx = this.camera.position.x, cz = this.camera.position.z;
        for (const door of this._doors) {
            if (door.opened) continue;
            const dx = door.x - cx, dz = door.z - cz;
            if (dx*dx + dz*dz > 2.5 * 2.5) continue;
            if (!this.keyInventory.has(door.color)) {
                // Throttle "locked" toasts per door
                const last = door._lockedToastAt || 0;
                if (performance.now() - last > 2200) {
                    door._lockedToastAt = performance.now();
                    if (this.kpop?.warn) {
                        this.kpop.warn(`${door.color.toUpperCase()} door`, `Locked — find the ${door.color} key`).catch(()=>{});
                    }
                }
                continue;
            }
            // Has the key — carve the door open
            for (const v of door.voxels) {
                try { this.world.setVoxel(v.x, v.y, v.z, 0); } catch {}
            }
            door.opened = true;
            if (this.kpop?.success) {
                this.kpop.success(`${door.color.toUpperCase()} door opened`, "Passage clear").catch(()=>{});
            }
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_exit_open", 0.55);
        }
    }

    // Round 232 — pressure plate proximity check. Each plate is
    // one-shot: once triggered=true, it's inert. Triggering fires
    // the associated action (open_wall / spawn_bots / reveal_pickup /
    // drop_floor). Action mechanics that need world state changes
    // (carve voxels, register a pickup) happen inline; spawn_bots is
    // delegated to a registered callback (main.js wires it to
    // BotManager.spawn so FPSShooter doesn't need a direct reference
    // to the bot system).
    _checkPlates() {
        if (!this._plates || this._plates.length === 0) return;
        if (!this.camera?.position) return;
        const cx = this.camera.position.x, cz = this.camera.position.z;
        for (const plate of this._plates) {
            if (plate.triggered) continue;
            const dx = plate.x - cx, dz = plate.z - cz;
            if (dx*dx + dz*dz > 1.4 * 1.4) continue;
            plate.triggered = true;
            this._firePlateAction(plate);
        }
    }

    onPlateAction(fn) { this._onPlateActionCb = fn; }

    _firePlateAction(plate) {
        console.log(`[FPS] plate ${plate.id} triggered — action=${plate.action}`);
        // Feedback that something happened, regardless of action
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_exit_open", 0.4);
        if (this.kpop?.info) {
            this.kpop.info("🔘 Plate triggered", plate.action.replace("_", " ")).catch(()=>{});
        }

        const t = plate.target || { x: plate.x, z: plate.z };

        switch (plate.action) {
            case "open_wall": {
                // Carve a 3-wide × 3-tall opening centered at target.
                // We don't know which axis the wall runs along, so
                // try X-axis first (sweep along X at the target z).
                if (!this.world?.setVoxel) return;
                const tx = (t.x | 0), tz = (t.z | 0);
                // Find the y to carve at — roughly the player's floor
                // height. Use camera position − 1.5 for feet height.
                const baseY = Math.floor((this.camera?.position?.y ?? 7) - 1.5);
                for (let dy = 0; dy < 3; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        try { this.world.setVoxel(tx + dx, baseY + dy, tz, 0); } catch {}
                    }
                }
                if (this.kpop?.success) {
                    this.kpop.success("Wall opened", "A passage appears").catch(()=>{});
                }
                break;
            }
            case "drop_floor": {
                if (!this.world?.setVoxel) return;
                const tx = (t.x | 0), tz = (t.z | 0);
                const baseY = Math.floor((this.camera?.position?.y ?? 7) - 1.6);
                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = 0; dy >= -3; dy--) {
                            try { this.world.setVoxel(tx + dx, baseY + dy, tz + dz, 0); } catch {}
                        }
                    }
                }
                if (this.kpop?.warn) {
                    this.kpop.warn("Floor collapses", "Don't fall in").catch(()=>{});
                }
                break;
            }
            case "reveal_pickup": {
                if (!this.router?.exec) return;
                const tx = t.x ?? plate.x;
                const tz = t.z ?? plate.z;
                const ty = (this.camera?.position?.y ?? 7) - 1;
                const r = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "wad_pickup_health",
                    kind: "wad_pickup_health",
                    x: tx, y: ty, z: tz,
                    scale: 0.7, yaw: 0,
                });
                if (r?.ok && r.id != null) {
                    this.registerPickup(r.id, {
                        kind: "wad_pickup_health", value: 0.3,
                        x: tx, z: tz,
                    });
                    if (this.kpop?.success) {
                        this.kpop.success("Hidden cache revealed", "Health pack appeared").catch(()=>{});
                    }
                }
                break;
            }
            case "spawn_bots":
            default: {
                // Delegate to the registered callback so FPSShooter
                // doesn't need to know about BotManager
                if (this._onPlateActionCb) {
                    try { this._onPlateActionCb({ action: "spawn_bots", target: t, plate }); } catch {}
                }
                if (this.kpop?.warn) {
                    this.kpop.warn("⚠ Ambush!", "Hostiles incoming").catch(()=>{});
                }
                break;
            }
        }
    }

    // Round 219 — subscribe to exit-portal entry (player walked into the
    // open exit). main.js uses this to generate the next level.
    onExitEntered(fn) { this._onExitEnteredCb = fn; }

    // Round 223 — paired teleporter portal proximity check. Each pair
    // has endpoints a and b; stepping within 1.5u of one teleports the
    // player to the other side and starts a 1.2s cooldown so they don't
    // immediately re-trigger at the destination. Y stays roughly the
    // same (camera will re-snap to terrain on next FP tick).
    _checkPortals(dt) {
        if (!this.camera?.position) return;
        if (this._portalCooldownMs > 0) {
            this._portalCooldownMs -= dt * 1000;
            return;
        }
        const cx = this.camera.position.x, cz = this.camera.position.z;
        for (const pair of this._portalPairs) {
            for (const [thisSide, otherSide] of [["a","b"],["b","a"]]) {
                const here = pair[thisSide], there = pair[otherSide];
                if (!here || !there) continue;
                const dx = here.x - cx, dz = here.z - cz;
                if (dx*dx + dz*dz < 1.5 * 1.5) {
                    // Teleport
                    this.camera.position.x = there.x;
                    this.camera.position.z = there.z;
                    this._portalCooldownMs = 1200;     // prevent loop at destination
                    this._lastUsedPortalId = here.id;
                    if (this.audio?.playProcedural) {
                        // Reuse the exit_open sweep for the teleport whoosh
                        this.audio.playProcedural("fps_exit_open", 0.55);
                    }
                    if (this.kpop?.info) {
                        this.kpop.info("Teleporter", `Translated to ${otherSide.toUpperCase()}`).catch(()=>{});
                    }
                    return;   // only one teleport per tick
                }
            }
        }
    }

    // Round 224 — per-room gravity zones. Each room may carry a
    // gravity multiplier (room.gravity, default 1.0, range 0.3 - 2.0).
    // Low-G rooms feel moon-like; jumps go higher, falls land softer.
    // High-G rooms feel heavy; jumps barely clear ledges, falls hurt
    // more. We multiply the camera's _gravity scalar — keeping the
    // jump velocity constant means jump height scales naturally with
    // physics: h = v²/(2g).
    _updateGravityZone() {
        if (!this.camera || this._cameraBaseGravity == null) return;
        const layout = this.ollamaLevelGen?._lastLevel;
        let mult = 1.0;
        if (layout?.rooms?.length) {
            const cx = this.camera.position.x, cz = this.camera.position.z;
            for (const r of layout.rooms) {
                if (cx >= r.x && cx < r.x + r.w &&
                    cz >= r.z && cz < r.z + r.d) {
                    mult = typeof r.gravity === "number" ? r.gravity : 1.0;
                    break;
                }
            }
        }
        // Clamp to a sane range so a stray bad value can't softlock
        mult = Math.max(0.2, Math.min(3.0, mult));
        // Ease toward the target so transitions across thresholds feel
        // gradual rather than snapping
        this._currentGravityMult += (mult - this._currentGravityMult) * 0.15;
        this.camera._gravity = this._cameraBaseGravity * this._currentGravityMult;
    }

    // Round 224 — fall damage. Track airborne→landed transitions and
    // apply damage proportional to drop distance and current gravity.
    // Short drops (< 4 voxels) are free; bigger falls scale linearly.
    _checkFallDamage() {
        const onGround = this.camera?._fpOnGround;
        if (onGround == null) return;
        if (this._wasOnGround && !onGround) {
            // Just left the ground — remember y so we can compute drop
            this._fallStartY = this.camera.position.y;
        } else if (!this._wasOnGround && onGround) {
            // Just landed — apply damage if drop big enough
            const dropped = this._fallStartY - this.camera.position.y;
            if (dropped > 4.0) {
                // Heavier gravity = more painful landings
                const gravFactor = Math.max(0.5, Math.min(2.0, this._currentGravityMult));
                const dmg = ((dropped - 4.0) / 12) * gravFactor;
                const clampedDmg = Math.max(0.02, Math.min(1.0, dmg));
                this.takeDamage(clampedDmg, "fall");
                if (this.kpop?.info) {
                    this.kpop.info("Hard landing", `Fell ${dropped.toFixed(1)}u · -${Math.round(clampedDmg*100)}% HP`).catch(()=>{});
                }
            }
        }
        this._wasOnGround = onGround;
    }

    // Round 224 — jump pads. When the player walks onto a pad, give
    // the camera an upward velocity boost. The pad's effect interacts
    // with the active gravity zone: in low-G, a jump pad launches the
    // player very high; in high-G, it gives a short hop.
    _checkJumpPads(dt) {
        if (this._jumpPadCooldownMs > 0) {
            this._jumpPadCooldownMs -= dt * 1000;
            return;
        }
        const pads = this.ollamaLevelGen?.getLastJumpPads?.();
        if (!pads || pads.length === 0) return;
        if (!this.camera?._fpOnGround) return;     // only trigger from the ground
        const cx = this.camera.position.x, cz = this.camera.position.z;
        for (const pad of pads) {
            const dx = pad.x - cx, dz = pad.z - cz;
            if (dx*dx + dz*dz < 1.2 * 1.2) {
                // Launch. 22 m/s in 1G ≈ 13 voxels high; in 0.4G ≈ 33
                // voxels high (good for reaching upper-floor alcoves).
                this.camera._fpVelY = 22;
                this.camera._fpOnGround = false;
                this._fallStartY = this.camera.position.y;
                this._jumpPadCooldownMs = 500;
                this._lastUsedJumpPadId = pad.id;
                if (this.audio?.playProcedural) {
                    this.audio.playProcedural("fps_level_start", 0.4);
                }
                if (this.kpop?.info) {
                    this.kpop.info("Jump pad", `Launched`).catch(()=>{});
                }
                return;
            }
        }
    }

    // Round 227 — environmental hazards. Currently: standing on or in
    // a LAVA voxel (id 12) deals damage over time. Water and other
    // voxels don't hurt (yet). The check samples the voxel just below
    // the camera's feet (eye_y - 1.5) so wading shallow lava also
    // counts as "in lava" — not just standing on the surface.
    _checkHazards(dt) {
        if (!this.camera?.position || !this.world?.voxelAt) return;
        const pos = this.camera.position;
        const fx = Math.floor(pos.x);
        const fz = Math.floor(pos.z);
        const fy = Math.floor(pos.y - 1.5);   // approximate feet height
        let inLava = false;
        try {
            const a = this.world.voxelAt(fx, fy,     fz);
            const b = this.world.voxelAt(fx, fy + 1, fz);
            if (a === 12 || b === 12) inLava = true;
        } catch {}
        if (inLava) {
            // 18% HP/sec damage while in lava — survivable for a couple
            // seconds, lethal if you stand still
            const dmg = 0.18 * dt;
            this._lavaDamageBuffer = (this._lavaDamageBuffer || 0) + dmg;
            // Apply in chunks of 0.05 so the damage flash + audio fire
            // periodically (not 60 times/sec)
            if (this._lavaDamageBuffer >= 0.05) {
                this.takeDamage(this._lavaDamageBuffer, "lava");
                this._lavaDamageBuffer = 0;
                if (this.kpop?.info && performance.now() - (this._lavaToastAt || 0) > 1500) {
                    this._lavaToastAt = performance.now();
                    this.kpop.info("🔥 LAVA", "Get out — burning HP").catch(()=>{});
                }
            }
        } else {
            this._lavaDamageBuffer = 0;
        }
    }

    _checkPickups() {
        if (this._pickups.size === 0 || !this.camera?.position) return;
        const cx = this.camera.position.x, cz = this.camera.position.z;
        // Round 252 — magnetic pickups: collection radius widens as
        // player HP drops. At full HP, default 1.8u radius; at 25% HP,
        // up to 4.5u. The universe pulls things toward you when you're
        // desperate. Below 25% the multiplier maxes (doesn't keep
        // expanding to absurd ranges).
        const lowHpBoost = this.health < 0.25
            ? 2.5
            : (this.health < 0.5 ? 1.5 + (0.5 - this.health) * 4 : 1.0);
        const radius = 1.8 * lowHpBoost;
        const r2 = radius * radius;
        for (const [id, pu] of [...this._pickups]) {
            const pos = this._getEntityPos(id);
            const x = pos?.x ?? pu.x, z = pos?.z ?? pu.z;
            const dx = x - cx, dz = z - cz;
            if (dx*dx + dz*dz < r2) {
                this._collectPickup(id, pu);
            }
        }
    }

    _collectPickup(id, pu) {
        this._pickups.delete(id);
        if (this.router?.exec) {
            try { this.router.exec({ type: "entity:despawn", id }); } catch {}
        }
        if (pu.kind === "wad_pickup_health") {
            this.health = Math.min(1, this.health + (pu.value ?? 0.25));
            // Round 236 — health packs also refill suit oxygen and a
            // chunk of jetpack fuel. In space environments this is the
            // single-pickup-multiple-stats compromise we live with so
            // dungeons don't need separate "O2 cans".
            // Round 244 — health packs ALSO refill vision battery 50%
            // (paired with the new battery-drain mechanic).
            if (this.spaceSuit?.refillO2) this.spaceSuit.refillO2(0.50);
            if (this.spaceSuit?.refillFuel) this.spaceSuit.refillFuel(0.30);
            if (this.visionModes?.refillBattery) this.visionModes.refillBattery(0.50);
            if (this.kpop?.info) this.kpop.info("Health pack", `+${Math.round((pu.value ?? 0.25)*100)}%${this.spaceSuit ? " · O₂/fuel/battery topped" : ""}`).catch(()=>{});
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_pickup_health", 0.7);
        } else if (pu.kind === "wad_pickup_ammo") {
            this.ammo = Math.min(RELOAD_MAX * 3, this.ammo + (pu.value ?? 15));
            if (this.kpop?.info) this.kpop.info("Ammo pack", `+${pu.value ?? 15}`).catch(()=>{});
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_pickup_ammo", 0.6);
        } else if (pu.kind === "wad_pickup_gravity") {
            // Round 225 — trigger a gravity warp. Duration carried by
            // the pickup value (seconds). Kind defaults to "random" so
            // each gravity pickup is a surprise.
            const durationSec = Math.max(2, Math.min(15, pu.value ?? 6));
            if (this.gravityWarp?.activate) {
                this.gravityWarp.activate("random", durationSec);
            }
            if (this.kpop?.info) this.kpop.info("Gravity warp", `Down changes for ${durationSec.toFixed(1)}s`).catch(()=>{});
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_pickup_health", 0.5);
            if (this.kpop?.speak) this.kpop.speak({ Voice: "M1", Text: "Gravity warp." }).catch(()=>{});
        } else if (pu.kind === "wad_pickup_kaiju") {
            // Round 237 — kaiju mode: scale the player up to building-
            // size for ~12 seconds. Tiny enemies still shoot, but you
            // can stomp them by walking close. Duration carried by
            // pu.value (seconds).
            const durationSec = Math.max(4, Math.min(30, pu.value ?? 12));
            if (this.kaijuMode?.activate) {
                this.kaijuMode.activate(durationSec);
            }
            // KPop / audio handled inside KaijuMode.activate so the
            // ceremony is consistent whether triggered by pickup or
            // by the console window.kaiju.activate() shortcut.
        } else if (pu.kind === "wad_pickup_o2") {
            // Round 244 — O₂ regulator: halves O₂ drain for N seconds.
            // Value carries the duration; clamped 10-180s.
            const durationSec = Math.max(10, Math.min(180, pu.value ?? 60));
            if (this.spaceSuit?.activateRegulator) {
                this.spaceSuit.activateRegulator(durationSec);
            }
            // Audio + KPop already handled inside activateRegulator
        } else if (pu.kind === "wad_pickup_bullet_pen") {
            // Round 250 — armor-piercing buff. Bullets break stone +
            // dirt in addition to wood + glass for N seconds.
            const durationSec = Math.max(10, Math.min(120, pu.value ?? 30));
            this._bulletPenMs += durationSec * 1000;
            if (this.kpop?.success) {
                this.kpop.success("⚡ ARMOR-PIERCING", `Stone walls break for ${durationSec}s`).catch(()=>{});
            }
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_pickup_health", 0.7);
        } else if (pu.kind === "wad_pickup_key_red"
                || pu.kind === "wad_pickup_key_blue"
                || pu.kind === "wad_pickup_key_yellow") {
            // Round 229 — colored key collection. Keys persist in the
            // inventory for the rest of the level so the player can
            // unlock matching doors / sealed exits later.
            const color = pu.kind.slice("wad_pickup_key_".length);
            this.keyInventory.add(color);
            if (this.kpop?.info) {
                this.kpop.info(`Picked up ${color} key`, `Inventory: ${[...this.keyInventory].join(", ")}`).catch(()=>{});
            }
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_pickup_ammo", 0.7);
        }
    }

    _autoDiscoverEnemies() {
        // Sweep current ECS world for entities of known enemy kinds.
        if (!this.ecsWorld) return;
        try {
            // ECS world should have an entity-by-kind index OR getAllEntities
            const entities = this.ecsWorld.getAllEntities?.() || [];
            for (const id of entities) {
                const kind = this.ecsWorld.getKind?.(id);
                if (kind && ENEMY_KINDS_AUTO.has(kind)) {
                    this.registerEnemy(id, { kind, hp: 2 });
                }
            }
        } catch (e) { /* ECS API absent — silent */ }
    }

    _getEntityPos(entityId) {
        if (!this.ecsWorld?.getComponent) return null;
        try { return this.ecsWorld.getComponent(entityId, "Position"); }
        catch { return null; }
    }

    _pickSpawn(roomId) {
        const layout = this.ollamaLevelGen?._lastLevel;
        if (!layout?.rooms?.length) {
            return { x: 0, y: (this.world?._heightAt?.(0,0) ?? 5) + 2, z: 0 };
        }
        let r = roomId ? layout.rooms.find(x => x.id === roomId) : null;
        if (!r) r = layout.rooms[0];
        const cx = r.x + r.w / 2;
        const cz = r.z + r.d / 2;
        const baseY = (this.world?._heightAt?.(cx, cz) ?? 5);
        return { x: cx, y: baseY + 2, z: cz };
    }

    _announceLevelStart() {
        if (!this.kpop?.info) return;
        const title = this.levelName ? `Entering: ${this.levelName}` : "FPS mode";
        this.kpop.info(title, "Click to fire · R to reload · ESC stops").catch(()=>{});
        if (this.kpop?.speak && this.levelName) {
            this.kpop.speak({ Voice: "M1", Text: `Entering ${this.levelName}. Hostiles in the area.` }).catch(()=>{});
        }
    }

    _levelCleared() {
        // Latched announcement; clear flag prevents repeated firing
        if (this._clearedAt) return;
        this._clearedAt = performance.now();
        const elapsedSec = Math.max(0.1, (this._clearedAt - (this._levelStartMs || this._clearedAt)) / 1000);
        const accuracy = this.shots > 0 ? Math.round((this.kills / this.shots) * 100) : 0;
        // Round 222 — accumulate lifetime totals
        this.totalKills += this.kills;
        this.totalShots += this.shots;
        if (this.kpop?.success) {
            this.kpop.success(`Cleared: ${this.levelName}`,
                `LV ${this.levelNumber} · ${this.kills} kills · ${this.shots} shots · ${accuracy}% acc · ${elapsedSec.toFixed(1)}s`).catch(()=>{});
        }
        if (this.kpop?.speak) {
            this.kpop.speak({ Voice: "M1", Text: `Level ${this.levelNumber} cleared. Standing by.` }).catch(()=>{});
        }
        // Round 222 — on-screen summary card. Auto-removes after 4.5s.
        this._showLevelClearCard({
            level: this.levelNumber, name: this.levelName,
            kills: this.kills, shots: this.shots, accuracy,
            timeSec: elapsedSec,
        });
        // Round 219 — flip the exit-open flag so tick() proximity check
        // triggers level advance when player walks into the portal
        this._exitOpen = true;
        // Round 219 — level-clear FM bell phrase + exit-portal sweep
        if (this.audio?.playProcedural) {
            this.audio.playProcedural("fps_level_clear", 0.8);
            // Slight delay before the portal open cue so the bell phrase
            // has time to land first
            setTimeout(() => this.audio.playProcedural("fps_exit_open", 0.7), 700);
        }
        // Round 219 — notify exit entity to activate (if one was spawned)
        if (this._onLevelClearedCb) {
            try { this._onLevelClearedCb(); } catch (e) {}
        }
        console.log(`[FPS] LV ${this.levelNumber} cleared (${this.levelName}) — ${this.kills} kills, ${this.shots} shots, ${accuracy}% acc, ${elapsedSec.toFixed(1)}s`);
    }

    // Round 222 — on-screen summary card after a level clears. Shows
    // the standard run stats (level, kills, accuracy, time) for ~4.5s
    // with a fade.
    _showLevelClearCard(s) {
        if (typeof document === "undefined") return;
        const card = document.createElement("div");
        card.id = "fps-clear-card";
        Object.assign(card.style, {
            position: "fixed",
            left: "50%", top: "22%",
            transform: "translate(-50%, -50%)",
            minWidth: "360px",
            padding: "16px 24px",
            background: "rgba(8,16,8,0.92)",
            border: "1.5px solid #4a4",
            borderRadius: "6px",
            color: "#cfd",
            fontFamily: "monospace",
            fontSize: "13px",
            textAlign: "center",
            zIndex: "9100",
            pointerEvents: "none",
            opacity: "0",
            transition: "opacity 600ms ease-out",
            boxShadow: "0 0 24px rgba(80,200,120,0.30)",
        });
        card.innerHTML =
            `<div style="font-size:18px; color:#4f8; letter-spacing:2px; margin-bottom:6px;">LEVEL ${s.level} CLEARED</div>` +
            `<div style="color:#aab; font-size:11px; margin-bottom:8px;">${s.name || ""}</div>` +
            `<div style="display:flex; justify-content:space-around; gap:24px;">` +
                `<div><div style="color:#fc9; font-size:18px;">${s.kills}</div><div style="font-size:9px; color:#888;">KILLS</div></div>` +
                `<div><div style="color:#9cf; font-size:18px;">${s.accuracy}%</div><div style="font-size:9px; color:#888;">ACCURACY</div></div>` +
                `<div><div style="color:#cfc; font-size:18px;">${s.timeSec.toFixed(1)}s</div><div style="font-size:9px; color:#888;">TIME</div></div>` +
            `</div>`;
        document.body.appendChild(card);
        requestAnimationFrame(() => { card.style.opacity = "1"; });
        setTimeout(() => { card.style.opacity = "0"; }, 4000);
        setTimeout(() => { if (card.parentNode) card.parentNode.removeChild(card); }, 4700);
    }

    // Round 219 — subscribe to level-cleared events (used by exit-portal
    // wiring in main.js to open the portal so the player can advance).
    onLevelCleared(fn) {
        this._onLevelClearedCb = fn;
    }

    _die(source) {
        if (this._diedAt) return;
        this._diedAt = performance.now();
        if (this.kpop?.warn) {
            this.kpop.warn("Down", `You took fatal damage. Press R to respawn.`).catch(()=>{});
        }
        if (this.kpop?.speak) {
            this.kpop.speak({ Voice: "M1", Text: "Operator down." }).catch(()=>{});
        }
    }

    // ------------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------------

    _buildHud() {
        // HUD bottom-center
        const hud = document.createElement("div");
        hud.id = "fps-hud";
        Object.assign(hud.style, {
            position: "fixed", bottom: "10px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.78)", color: "#cfc",
            padding: "6px 16px", borderRadius: "6px",
            fontFamily: "monospace", fontSize: "13px",
            zIndex: "9100", pointerEvents: "none",
            minWidth: "320px", textAlign: "center",
        });
        document.body.appendChild(hud);
        this._hudEl = hud;

        // Crosshair
        const ret = document.createElement("div");
        Object.assign(ret.style, {
            position: "fixed", left: "50%", top: "50%",
            width: "18px", height: "18px",
            marginLeft: "-9px", marginTop: "-9px",
            pointerEvents: "none",
            zIndex: "9101",
        });
        ret.innerHTML =
            `<div style="position:absolute; left:7px; top:0; width:4px; height:18px; background:rgba(180,255,180,0.9); border:1px solid rgba(0,0,0,0.7);"></div>` +
            `<div style="position:absolute; top:7px; left:0; height:4px; width:18px; background:rgba(180,255,180,0.9); border:1px solid rgba(0,0,0,0.7);"></div>`;
        document.body.appendChild(ret);
        this._reticleEl = ret;

        // Gun "barrel" — diagonal line from bottom-right corner
        const gun = document.createElement("div");
        Object.assign(gun.style, {
            position: "fixed", right: "30%", bottom: "0",
            width: "120px", height: "180px",
            backgroundImage: "linear-gradient(135deg, rgba(40,40,50,0.85) 0%, rgba(60,60,80,0.85) 35%, rgba(40,40,50,0.85) 60%, transparent 70%)",
            clipPath: "polygon(55% 100%, 100% 80%, 100% 100%, 100% 100%, 60% 100%)",
            pointerEvents: "none",
            zIndex: "9099",
        });
        document.body.appendChild(gun);
        this._gunEl = gun;

        // Damage flash overlay
        const flash = document.createElement("div");
        Object.assign(flash.style, {
            position: "fixed", top: "0", left: "0",
            width: "100%", height: "100%",
            background: "rgba(255,0,0,0)",
            transition: "background 0.6s ease-out",
            pointerEvents: "none",
            zIndex: "9098",
        });
        document.body.appendChild(flash);
        this._damageFlashEl = flash;
    }

    _flashDamage() {
        if (!this._damageFlashEl) return;
        this._damageFlashEl.style.background = "rgba(255,0,0,0.35)";
        setTimeout(() => {
            if (this._damageFlashEl) this._damageFlashEl.style.background = "rgba(255,0,0,0)";
        }, 80);
    }

    _updateHud() {
        if (!this._hudEl) return;
        const hpPct = Math.round(this.health * 100);
        const hpColor = this.health < 0.3 ? "#f44" : this.health < 0.6 ? "#fb4" : "#cfc";
        const ammoStr = this.reloading ? "RELOADING…" : `${this.ammo} / ${RELOAD_MAX}`;
        const levelStr = this.levelName ? `· ${this.levelName}` : "";
        const enemiesLeft = this._enemies.size;
        // Round 222 — show level depth (multi-floor span) when present
        const depth = this.ollamaLevelGen?.getLastLevelDepth?.() || 0;
        const depthStr = depth > 0 ? ` · ${depth}-floor` : "";
        // Round 224 — gravity badge when player is in a non-1.0G zone
        let gravStr = "";
        if (Math.abs(this._currentGravityMult - 1.0) > 0.1) {
            const g = this._currentGravityMult.toFixed(1);
            const gColor = this._currentGravityMult < 0.9 ? "#9cf" : "#fc6";
            const gLabel = this._currentGravityMult < 0.9 ? "LOW-G" : "HIGH-G";
            gravStr = ` <span style="color:${gColor};">⬇ ${gLabel} (${g}×)</span>`;
        }
        // Round 229 — keys held (colored dots) + sealed-exit badge
        let keyStr = "";
        if (this.keyInventory && this.keyInventory.size > 0) {
            const colorMap = { red: "#f44", blue: "#4af", yellow: "#fc4" };
            const dots = [...this.keyInventory].map(c =>
                `<span style="color:${colorMap[c] || '#fff'};">⚿</span>`).join("");
            keyStr = ` &nbsp;${dots}`;
        }
        let sealedStr = "";
        if (this._exitRequiresKeys?.length > 0) {
            const missing = this._exitRequiresKeys.filter(k => !this.keyInventory.has(k));
            if (missing.length > 0) {
                sealedStr = ` <span style="color:#f88;">🔒 ${missing.join("+")}</span>`;
            } else {
                sealedStr = ` <span style="color:#9f9;">🔓 unlocked</span>`;
            }
        }
        // Round 251 — bullet penetration buff indicator. Shows when the
        // player has armor-piercing rounds active.
        let penStr = "";
        if (this._bulletPenMs > 0) {
            const sec = (this._bulletPenMs / 1000).toFixed(1);
            penStr = ` <span style="color:#fc6;">⚡ AP ${sec}s</span>`;
        }
        this._hudEl.innerHTML =
            `<span style="color:#9cf;">📜 LV ${this.levelNumber}${depthStr}</span> &nbsp;|&nbsp; ` +
            `<span style="color:${hpColor};">❤ ${hpPct}%</span> &nbsp;` +
            `<span style="color:#ffd;">🔫 ${ammoStr}</span> &nbsp;` +
            `<span style="color:#fc9;">☠ ${this.kills} kills</span> &nbsp;` +
            `<span style="color:#aaa;">enemies: ${enemiesLeft}</span>${gravStr}${keyStr}${sealedStr}${penStr}` +
            `<div style="font-size:10px; color:#777; margin-top:3px;">click fire · R reload · ESC exit ${levelStr}</div>`;
        // Round 226 — boss HP bar across the top of the screen when a
        // mini-boss is alive in the current level. Scans _enemies for
        // any "bot_miniboss" entry and shows its hp/maxHp.
        this._updateBossBar();
    }

    _updateBossBar() {
        let boss = null;
        // Round 234 — boss can be any king kaiju, not just bot_miniboss.
        // Look for entries whose kind starts with "bot_king_" or matches
        // the legacy bot_miniboss.
        for (const [id, info] of this._enemies) {
            if (info.kind === "bot_miniboss" || (typeof info.kind === "string" && info.kind.startsWith("bot_king_"))) {
                boss = info; break;
            }
        }
        if (!boss) {
            if (this._bossBarEl?.parentNode) {
                this._bossBarEl.parentNode.removeChild(this._bossBarEl);
                this._bossBarEl = null;
            }
            return;
        }
        if (!this._bossBarEl) {
            const bar = document.createElement("div");
            bar.id = "fps-boss-bar";
            Object.assign(bar.style, {
                position: "fixed",
                left: "50%", top: "100px",
                transform: "translateX(-50%)",
                width: "min(540px, 70vw)",
                padding: "6px 10px 8px",
                background: "rgba(28,4,28,0.92)",
                border: "1px solid #f4a",
                borderRadius: "6px",
                color: "#fcc",
                fontFamily: "monospace",
                fontSize: "11px",
                letterSpacing: "1px",
                textAlign: "center",
                zIndex: "8700",
                pointerEvents: "none",
                boxShadow: "0 0 18px rgba(255,80,160,0.35)",
            });
            document.body.appendChild(bar);
            this._bossBarEl = bar;
        }
        const pct = Math.max(0, Math.min(100, Math.round((boss.hp / boss.maxHp) * 100)));
        let fillColor = pct > 60 ? "#f4a" : pct > 30 ? "#fc6" : "#f44";
        // Round 234 — derive the display label from the king kaiju's
        // kingLabel (BotManager copies it onto the bot when spawning;
        // fps wiring puts it on the _enemies entry via .name). Falls
        // back to "MINI-BOSS" if no label was supplied (legacy).
        const bossName = boss.name || "MINI-BOSS";
        let label = `⚔ ${bossName}`;
        let suffix = `${boss.hp.toFixed(1)} / ${boss.maxHp.toFixed(0)} HP (${pct}%)`;
        if (boss.invulnerable) {
            fillColor = "#888";
            label = `⚔ ${bossName} &nbsp;<span style="color:#9cf;">⟲ RETREATED</span>`;
            const minionsLeft = this._countMinions();
            suffix = `<span style="color:#fc6;">Clear ${minionsLeft} minion${minionsLeft !== 1 ? "s" : ""} to expose the boss</span>`;
        }
        this._bossBarEl.innerHTML =
            `<div style="margin-bottom:4px;"><b>${label}</b> &nbsp;·&nbsp; <span style="color:#aab;">${suffix}</span></div>` +
            `<div style="height:10px; background:#2a0820; border-radius:5px; overflow:hidden;">` +
              `<div style="width:${pct}%; height:100%; background:${fillColor}; transition:width 0.2s, background 0.4s;"></div>` +
            `</div>`;
    }

    // Round 231 — count "kaiju" minions (non-boss enemies) for the
    // boss bar's "clear N minions" status. Cheap O(enemies); usually
    // small.
    _countMinions() {
        let n = 0;
        for (const info of this._enemies.values()) {
            if (info.kind !== "bot_miniboss") n++;
        }
        return n;
    }

    _handleKey(e) {
        if (!this.active) return;
        const k = e.key.toLowerCase();
        if (k === "r") this.startReload();
        if (k === "escape") this.stop();
        if (k === " ") { e.preventDefault(); if (this._onFire) this._onFire(); else this.fire(); }
    }

    _handleMouseDown(e) {
        if (!this.active) return;
        if (e.button === 0) { if (this._onFire) this._onFire(); else this.fire(); }
    }
}
