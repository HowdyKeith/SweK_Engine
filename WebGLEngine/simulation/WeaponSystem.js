// FILE: simulation/WeaponSystem.js
// Round 41 — player weapon arsenal. Single state holder + fire methods.
//
// Weapons (index, key, name):
//   1  Fist        — melee, 4u arc, 0.10 dmg, free, 0.4s CD
//   2  Sword       — heavy melee, 6u arc, 0.40 dmg, 5e, 0.7s CD
//   3  Pistol      — ranged single, 30u, 0.12 dmg, 10e, 0.3s CD
//   4  Big Gun     — ranged with mode + heat (single/burst/auto)
//   5  Grenade     — thrown AoE 8u, 0.50 dmg, 15e, 1s CD, ballistic
//
// Big gun:
//   - 3 modes cycled with B key when big gun selected
//   - Heat 0..100 — accumulates per shot, dissipates 12/s when not firing
//   - At 80: warning sting + visual
//   - At 100: explode → 0.50 dmg to player, 5u AoE damage to nearby kaiju,
//     weapon locked for 8s ("BROKEN — repair needed")

const WEAPONS = {
    fist: {
        index: 1, key: "Digit1", name: "FIST",
        type: "melee", arc: 4, damage: 0.10, energy: 0, cooldown: 0.4,
        verb: "punches",
    },
    sword: {
        index: 2, key: "Digit2", name: "SWORD",
        type: "melee", arc: 6, damage: 0.40, energy: 5, cooldown: 0.7,
        verb: "slashes",
    },
    pistol: {
        index: 3, key: "Digit3", name: "PISTOL",
        type: "ranged", range: 30, damage: 0.12, energy: 10, cooldown: 0.3,
        verb: "fires pistol at",
        beamColor: [0.95, 0.95, 0.5],
    },
    big_gun: {
        index: 4, key: "Digit4", name: "BIG GUN",
        type: "ranged_overheat", range: 50,
        // mode-specific config below; baseline values are mode 1 (single)
        modes: {
            single: { damage: 0.40, energy: 25, cooldown: 0.6, heat: 8 },
            burst:  { damage: 0.20, energy: 30, cooldown: 0.9, heat: 15, burstCount: 3, burstDelay: 0.08 },
            auto:   { damage: 0.10, energy: 8,  cooldown: 0.10, heat: 5 },
        },
        verb: "fires big gun at",
        beamColor: [1.0, 0.4, 0.1],
    },
    grenade: {
        index: 5, key: "Digit5", name: "GRENADE",
        type: "thrown", range: 30, damage: 0.50, energy: 15, cooldown: 1.0,
        aoe: 8,
        verb: "lobs a grenade at",
    },
    // Round 42 — chainsaw. Mash-Q for continuous-feel sustained damage.
    // Short arc, fast cycle, low per-tick damage but high DPS in melee.
    chainsaw: {
        index: 6, key: "Digit6", name: "CHAINSAW",
        type: "melee", arc: 3, damage: 0.10, energy: 2, cooldown: 0.18,
        verb: "saws into",
    },
    // Round 46 — rocket. Fire-and-forget straight projectile, big AoE.
    // Detonates on first kaiju hit / terrain hit / range timeout.
    rocket: {
        index: 7, key: "Digit7", name: "ROCKET",
        type: "missile",
        guided: false,
        speed: 50, range: 80, damage: 0.80, aoe: 12,
        energy: 30, cooldown: 1.6,
        color:  [1.0, 0.5, 0.1],
        verb: "launches a rocket at",
    },
    // Round 46 — guided missile. Camera attaches; mouse steers heading.
    // Slower than rocket but you can chase moving targets / dodge into
    // cover. Range 150u, lifetime 8s, big AoE.
    guided_missile: {
        index: 8, key: "Digit8", name: "GUIDED MISSILE",
        type: "missile",
        guided: true,
        speed: 22, range: 150, ttl: 8, damage: 1.00, aoe: 15,
        energy: 60, cooldown: 4.0,
        turnRateRad: 2.5,           // ~143°/sec — feels responsive
        color:  [0.4, 0.85, 1.0],
        verb: "launches a guided missile at",
    },
};

const HEAT_DISSIPATE = 12;        // per second of cooling when not firing
const HEAT_WARN = 80;
const HEAT_MAX = 100;
const BROKEN_LOCKOUT = 8.0;       // seconds of lockout after explosion

export class WeaponSystem {

    constructor(opts = {}) {
        this.kaijuManager = opts.kaijuManager ?? null;
        this.playerEnergy = opts.playerEnergy ?? null;
        this.playerCombat = opts.playerCombat ?? null;
        this.particles    = opts.particles ?? null;
        this.audio        = opts.audioManager ?? null;

        // State
        this.current = "fist";
        this.lastFire = -Infinity;
        this.heat = 0;
        this.bigGunMode = "single";       // single | burst | auto
        this.brokenUntil = 0;             // performance.now() until weapon usable

        // Burst state
        this._burstQueue = [];            // [{ fireT: timestamp, ... }]
    }

    select(name) {
        if (!WEAPONS[name]) return false;
        this.current = name;
        console.log(`[Weapon] selected ${WEAPONS[name].name}`);
        return true;
    }

    selectByIndex(idx) {
        for (const [name, cfg] of Object.entries(WEAPONS)) {
            if (cfg.index === idx) return this.select(name);
        }
        return false;
    }

    cycleBigGunMode() {
        if (this.current !== "big_gun") return;
        const order = ["single", "burst", "auto"];
        const i = order.indexOf(this.bigGunMode);
        this.bigGunMode = order[(i + 1) % order.length];
        console.log(`[Weapon] big gun mode → ${this.bigGunMode}`);
    }

    // Per-frame state update — heat dissipation, queued burst shots.
    tick(dt, camera) {
        if (!camera) return;
        // Cool the gun
        if (this.heat > 0) {
            this.heat = Math.max(0, this.heat - HEAT_DISSIPATE * dt);
        }
        // Process queued burst shots
        const now = performance.now();
        while (this._burstQueue.length && this._burstQueue[0].fireT <= now) {
            const q = this._burstQueue.shift();
            this._executeShot(camera, q.cfg, q.modeCfg);
        }
    }

    isBroken() { return performance.now() < this.brokenUntil; }
    brokenTimeLeft() { return Math.max(0, (this.brokenUntil - performance.now()) / 1000); }

    // Status snapshot for cockpit UI
    snapshot() {
        return {
            current: this.current,
            currentName: WEAPONS[this.current]?.name ?? "?",
            heat: this.heat,
            heatFrac: this.heat / HEAT_MAX,
            heatWarn: this.heat >= HEAT_WARN,
            bigGunMode: this.bigGunMode,
            broken: this.isBroken(),
            brokenLeft: this.brokenTimeLeft(),
        };
    }

    // Main fire entry. Called from main.js on click or Q.
    fire(camera) {
        if (!camera) return false;
        if (this.isBroken()) {
            console.log(`[Weapon] BROKEN — ${this.brokenTimeLeft().toFixed(1)}s lockout`);
            return false;
        }
        const cfg = WEAPONS[this.current];
        const now = performance.now();
        const cooldownMs = (cfg.cooldown ?? 0.5) * 1000;
        if (this.current === "big_gun") {
            const modeCfg = cfg.modes[this.bigGunMode];
            if (now - this.lastFire < modeCfg.cooldown * 1000) return false;
            return this._fireBigGun(camera, cfg, modeCfg);
        }
        if (now - this.lastFire < cooldownMs) return false;

        // Energy gate — Round 31: also honor the recharge lockout so the
        // post-crash freeze pauses weapon fire too (uniform with carve/sprint).
        if (this.playerEnergy && cfg.energy > 0 && (this.playerEnergy.current < cfg.energy || this.playerEnergy._cooldownLockout > 0)) {
            this.playerEnergy._deny?.();
            return false;
        }

        this.lastFire = now;
        if (cfg.energy > 0 && this.playerEnergy) {
            this.playerEnergy.current = Math.max(0, this.playerEnergy.current - cfg.energy);
        }

        // Round 31 polish — FOV kick scaled by weapon weight (heavier = bigger punch
        // that eases back). Subtle game-feel; no-op if the camera predates fovKick.
        const _kickDeg = { melee: 1, ranged: 2, thrown: 2.5, missile: 5 }[cfg.type] || 2;
        try { camera.fovKick && camera.fovKick(_kickDeg * Math.PI / 180, cfg.type === "missile" ? 220 : 150); } catch (e) {}

        if (cfg.type === "melee")     return this._fireMelee(camera, cfg);
        if (cfg.type === "ranged")    return this._fireRanged(camera, cfg);
        if (cfg.type === "thrown")    return this._fireThrown(camera, cfg);
        if (cfg.type === "missile")   return this._fireMissile(camera, cfg);
        return false;
    }

    // Round 46 — delegate to MissileSystem. Set via setMissileSystem
    // from main.js; missing → console warn + spend nothing.
    setMissileSystem(ms) { this.missileSystem = ms; }

    _fireMissile(camera, cfg) {
        if (!this.missileSystem) {
            console.warn("[Weapon] no missileSystem wired");
            return false;
        }
        const fwd = this._forward(camera);
        const ok = this.missileSystem.fire({
            from: { x: camera.position.x, y: camera.position.y - 0.3, z: camera.position.z },
            fwd, cfg,
            yaw: camera.yaw, pitch: camera.pitch,
        });
        if (!ok) {
            console.log(`[Weapon] missile launch refused (already in flight?)`);
        }
        return ok;
    }

    // ------- per-type fire logic -------

    _fireMelee(camera, cfg) {
        // Hit nearest live kaiju within `cfg.arc` of camera position
        const k = this._nearestKaijuWithin(camera.position, cfg.arc);
        if (k) {
            // Round 305 — hit direction = camera→kaiju (swing away from player)
            const dx = k.position.x - camera.position.x;
            const dy = k.position.y - camera.position.y;
            const dz = k.position.z - camera.position.z;
            this._damageKaiju(k, cfg.damage, {
                dir: { x: dx, y: dy, z: dz },
                hitPos: { x: k.position.x, y: k.position.y, z: k.position.z },
            });
            console.log(`[Weapon] ${cfg.verb} ${k.name} — ${k.energy.toFixed(2)} hp`);
            this._spawnImpactBurst(k.position, [1, 0.9, 0.5]);
        } else {
            console.log(`[Weapon] ${cfg.name} — no target in range`);
        }
        return true;
    }

    _fireRanged(camera, cfg) {
        // Forward raycast against kaiju (3u perpendicular tolerance)
        const fwd = this._forward(camera);
        let hit = null, hitT = cfg.range;
        if (this.kaijuManager?.kaiju) {
            for (const k of this.kaijuManager.kaiju.values()) {
                if (!k.isAlive || !k.isAlive()) continue;
                const dx = k.position.x - camera.position.x;
                const dy = k.position.y - camera.position.y;
                const dz = k.position.z - camera.position.z;
                const t = dx * fwd.x + dy * fwd.y + dz * fwd.z;
                if (t < 0 || t > cfg.range) continue;
                const px = dx - fwd.x * t, py = dy - fwd.y * t, pz = dz - fwd.z * t;
                const perp = Math.sqrt(px * px + py * py + pz * pz);
                if (perp < 3.0 && t < hitT) { hit = k; hitT = t; }
            }
        }
        const endX = camera.position.x + fwd.x * hitT;
        const endY = camera.position.y + fwd.y * hitT;
        const endZ = camera.position.z + fwd.z * hitT;
        this._spawnBeam(camera.position, fwd, hitT, cfg.beamColor);
        if (hit) {
            // Round 305 — hit direction = bullet forward
            this._damageKaiju(hit, cfg.damage, {
                dir: fwd,
                hitPos: { x: endX, y: endY, z: endZ },
            });
            this._spawnImpactBurst({ x: endX, y: endY, z: endZ }, [1, 1, 1]);
            console.log(`[Weapon] ${cfg.verb} ${hit.name} — ${hit.energy.toFixed(2)} hp`);
        }
        return true;
    }

    _fireBigGun(camera, cfg, modeCfg) {
        const now = performance.now();
        // Energy gate
        const e = modeCfg.energy ?? 0;
        if (e > 0 && this.playerEnergy && this.playerEnergy.current < e) {
            this.playerEnergy._deny?.();
            return false;
        }
        if (e > 0 && this.playerEnergy) {
            this.playerEnergy.current = Math.max(0, this.playerEnergy.current - e);
        }
        this.lastFire = now;
        // Round 31 polish — bigger FOV punch for the big gun (scaled a touch by heat mode).
        try { camera.fovKick && camera.fovKick((4 + (modeCfg.heat || 0) * 0.1) * Math.PI / 180, 180); } catch (e) {}

        // Heat accumulation — overflow triggers explosion
        this.heat += modeCfg.heat;
        if (this.heat >= HEAT_MAX) {
            this._explode(camera);
            return true;
        }
        if (this.heat >= HEAT_WARN) {
            // Warning hit — audio + console
            console.warn(`[Weapon] BIG GUN OVERHEATING — ${this.heat.toFixed(0)}/${HEAT_MAX}`);
            if (this.audio?.triggerDanger) this.audio.triggerDanger(2);
        }

        // Schedule shots — single fires immediately; burst queues 3
        if (this.bigGunMode === "burst") {
            const burstCount = modeCfg.burstCount ?? 3;
            const delay = (modeCfg.burstDelay ?? 0.08) * 1000;
            for (let i = 0; i < burstCount; i++) {
                this._burstQueue.push({
                    fireT: now + i * delay,
                    cfg, modeCfg,
                });
            }
        } else {
            this._executeShot(camera, cfg, modeCfg);
        }
        return true;
    }

    _executeShot(camera, cfg, modeCfg) {
        const fwd = this._forward(camera);
        let hit = null, hitT = cfg.range;
        if (this.kaijuManager?.kaiju) {
            for (const k of this.kaijuManager.kaiju.values()) {
                if (!k.isAlive || !k.isAlive()) continue;
                const dx = k.position.x - camera.position.x;
                const dy = k.position.y - camera.position.y;
                const dz = k.position.z - camera.position.z;
                const t = dx * fwd.x + dy * fwd.y + dz * fwd.z;
                if (t < 0 || t > cfg.range) continue;
                const px = dx - fwd.x * t, py = dy - fwd.y * t, pz = dz - fwd.z * t;
                const perp = Math.sqrt(px * px + py * py + pz * pz);
                if (perp < 3.5 && t < hitT) { hit = k; hitT = t; }
            }
        }
        const endX = camera.position.x + fwd.x * hitT;
        const endY = camera.position.y + fwd.y * hitT;
        const endZ = camera.position.z + fwd.z * hitT;
        this._spawnBeam(camera.position, fwd, hitT, cfg.beamColor);
        if (hit) {
            // Round 305 — hit direction = beam forward
            this._damageKaiju(hit, modeCfg.damage, {
                dir: fwd,
                hitPos: { x: endX, y: endY, z: endZ },
            });
            this._spawnImpactBurst({ x: endX, y: endY, z: endZ }, [1, 0.6, 0.2], 12);
        }
    }

    _explode(camera) {
        console.error(`[Weapon] BIG GUN EXPLODED — locked for ${BROKEN_LOCKOUT}s`);
        this.heat = 0;
        this.brokenUntil = performance.now() + BROKEN_LOCKOUT * 1000;
        // Damage player
        if (this.playerEnergy?.applyDamage) {
            this.playerEnergy.applyDamage(50);
        }
        // 5u AoE damage to nearby kaiju
        if (this.kaijuManager?.kaiju) {
            for (const k of this.kaijuManager.kaiju.values()) {
                if (!k.isAlive || !k.isAlive()) continue;
                const dx = k.position.x - camera.position.x;
                const dy = k.position.y - camera.position.y;
                const dz = k.position.z - camera.position.z;
                if (dx * dx + dy * dy + dz * dz < 25) {
                    // Round 305 — radial outward direction (kaiju from blast)
                    this._damageKaiju(k, 0.30, {
                        dir: { x: dx, y: dy, z: dz },
                        hitPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
                    });
                }
            }
        }
        // Particle burst from camera
        if (this.particles?.spawn) {
            for (let i = 0; i < 40; i++) {
                const a = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const speed = 6 + Math.random() * 4;
                this.particles.spawn({
                    x: camera.position.x, y: camera.position.y, z: camera.position.z,
                    vx: Math.sin(phi) * Math.cos(a) * speed,
                    vy: Math.cos(phi) * speed,
                    vz: Math.sin(phi) * Math.sin(a) * speed,
                    ttl: 1.2, size: 0.7,
                    r: 1.0, g: 0.4, b: 0.1, a: 1.0,
                    gravity: -2, sprite: 4,
                });
            }
        }
        if (this.audio?.triggerDanger) this.audio.triggerDanger(2);
    }

    _fireThrown(camera, cfg) {
        // Lob a grenade — ballistic arc forward + up. Splash damage on
        // first surface hit OR after fixed flight time.
        const fwd = this._forward(camera);
        const speed = 18;
        const upBoost = 4;
        const px = camera.position.x;
        const py = camera.position.y;
        const pz = camera.position.z;
        const vx = fwd.x * speed;
        const vy = fwd.y * speed + upBoost;
        const vz = fwd.z * speed;
        const ttl = 1.5;
        // Visual: tumbling green particle
        if (this.particles?.spawn) {
            this.particles.spawn({
                x: px, y: py, z: pz, vx, vy, vz,
                ttl, size: 0.7,
                r: 0.4, g: 0.9, b: 0.3, a: 1.0,
                gravity: 12, sprite: 4,
            });
        }
        // Compute landing position with simple ballistic projection
        // (camera frame's gravity matches particle's 12 u/s²)
        const t = ttl;
        const lx = px + vx * t;
        const ly = py + vy * t - 0.5 * 12 * t * t;
        const lz = pz + vz * t;
        // Schedule the explosion via setTimeout-equivalent: just damage now
        // since particle physics is independent. Damage applied at landing
        // coordinates. Use a small delay via a flagged timer:
        setTimeout(() => this._grenadeDetonate(lx, ly, lz, cfg), ttl * 1000);
        return true;
    }

    _grenadeDetonate(x, y, z, cfg) {
        const aoe2 = cfg.aoe * cfg.aoe;
        let killed = 0;
        if (this.kaijuManager?.kaiju) {
            for (const k of this.kaijuManager.kaiju.values()) {
                if (!k.isAlive || !k.isAlive()) continue;
                const dx = k.position.x - x;
                const dy = k.position.y - y;
                const dz = k.position.z - z;
                if (dx * dx + dy * dy + dz * dz < aoe2) {
                    // Round 305 — radial outward from detonation
                    this._damageKaiju(k, cfg.damage, {
                        dir: { x: dx, y: dy, z: dz },
                        hitPos: { x, y, z },
                    });
                    if (k.energy <= 0) killed++;
                }
            }
        }
        // Boom particles — orange ring
        if (this.particles?.spawn) {
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2;
                this.particles.spawn({
                    x, y, z,
                    vx: Math.cos(a) * 8, vy: 3, vz: Math.sin(a) * 8,
                    ttl: 1.0, size: 0.85,
                    r: 1.0, g: 0.5, b: 0.1, a: 1.0,
                    gravity: -2, sprite: 4,
                });
            }
        }
        console.log(`[Weapon] grenade detonated at (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}) — ${killed} kaiju killed`);
    }

    // ------- helpers -------

    _forward(camera) {
        const fwd = camera.getForwardVector
            ? camera.getForwardVector()
            : { x: Math.sin(camera.yaw), y: 0, z: -Math.cos(camera.yaw) };
        const len = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
        return { x: fwd.x / len, y: fwd.y / len, z: fwd.z / len };
    }

    _nearestKaijuWithin(pos, arc) {
        if (!this.kaijuManager?.kaiju) return null;
        const arc2 = arc * arc;
        let best = null, bestD2 = arc2;
        for (const k of this.kaijuManager.kaiju.values()) {
            if (!k.isAlive || !k.isAlive()) continue;
            const dx = k.position.x - pos.x;
            const dy = k.position.y - pos.y;
            const dz = k.position.z - pos.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; best = k; }
        }
        return best;
    }

    _damageKaiju(k, dmg, hitInfo = null) {
        const wasAlive = (k.energy ?? 1) > 0;
        k.energy = Math.max(0, (k.energy ?? 1) - dmg);
        k._lastDamageTime = k.age;
        k._lastPlayerHitTime = k.age;
        k._playerRef = window._playerRef;
        // Round 305 — stash hit direction/magnitude for the ragdoll
        // integration. If this hit finishes the kaiju, RagdollIntegration
        // converts these into an initialVelocity instead of the v300/v301
        // random small kick. Direction is "from attacker toward kaiju",
        // so the ragdoll falls AWAY from the source of damage.
        if (hitInfo && hitInfo.dir) {
            // Normalize defensively — callers may pass un-normalized fwd
            const d = hitInfo.dir;
            const len = Math.hypot(d.x ?? d[0], d.y ?? d[1], d.z ?? d[2]) || 1;
            k._lastHitDir = {
                x: (d.x ?? d[0]) / len,
                y: (d.y ?? d[1]) / len,
                z: (d.z ?? d[2]) / len,
            };
            k._lastHitMag = dmg;
            k._lastHitAge = k.age;     // for staleness checks downstream
            // v840 — world-space hit position. WeaponSystem doesn't always
            // know a precise impact point, so use the kaiju's position
            // adjusted in the direction of the source (slight offset toward
            // attacker). This gives RagdollIntegration's closest-bone
            // selection something better than "kaiju center".
            if (hitInfo.pos) {
                k._lastHitPos = { x: hitInfo.pos.x, y: hitInfo.pos.y, z: hitInfo.pos.z };
            } else {
                // Best-effort: kaiju center + slight offset toward attacker
                k._lastHitPos = {
                    x: k.position.x - k._lastHitDir.x * 1.5,
                    y: k.position.y + 1.5,
                    z: k.position.z - k._lastHitDir.z * 1.5,
                };
            }
        }
        if (wasAlive && k.energy <= 0 && this.playerCombat) {
            this.playerCombat.creditKill(k);
        }
        // v856 — fire engine:kaijuDefeated for the v849 Twitch broadcast
        // hook + v855 audio cue (alert siren). Detail includes kind +
        // who killed it (best-effort — playerCombat is the most common
        // path). Fires only on the killing blow (wasAlive transitions
        // to !alive), not on every hit.
        if (wasAlive && k.energy <= 0) {
            try {
                window.dispatchEvent(new CustomEvent("engine:kaijuDefeated", {
                    detail: {
                        kind: k.kind || k.type || "kaiju",
                        by:   this.playerCombat ? "player" : (k._lastDamageSource || "unknown"),
                        position: k.position ? { x: k.position.x, y: k.position.y, z: k.position.z } : null,
                    },
                }));
            } catch {}
        }
        // Round 270 — floating damage number above the kaiju. Yellow
        // for normal hits, brighter/larger for the killing blow.
        if (window.damageNumbers?.show && k.position) {
            const killing = wasAlive && k.energy <= 0;
            window.damageNumbers.show(
                k.position.x, k.position.y + 1.5, k.position.z,
                Math.round(dmg * 100),
                {
                    color: killing ? "#ffe066" : "#fff5b8",
                    prefix: "-",
                    size: killing ? 24 : 16,
                    durationMs: killing ? 1500 : 850,
                }
            );
        }
        // Round 270 — pulse the minimap so the player can spot where
        // damage is landing even if it's off-screen behind them.
        if (window._wadMap?.addPulse && k.position) {
            window._wadMap.addPulse(k.position.x, k.position.z, {
                color: (wasAlive && k.energy <= 0) ? "#ffe066" : "#fff5b8",
                radius: 8,
                durationMs: 700,
            });
        }
    }

    _spawnBeam(from, fwd, len, color) {
        if (!this.particles?.spawn) return;
        const [r, g, b] = color ?? [0.95, 0.95, 0.5];
        const speed = 50;
        const flight = len / speed;
        for (let i = 0; i < 8; i++) {
            const tt = i / 8;
            this.particles.spawn({
                x: from.x + fwd.x * tt * len,
                y: from.y - 0.4 + fwd.y * tt * len,
                z: from.z + fwd.z * tt * len,
                vx: fwd.x * speed, vy: fwd.y * speed, vz: fwd.z * speed,
                ttl: flight * (1 - tt) + 0.12,
                size: 0.4,
                r, g, b, a: 1.0,
                gravity: 0, sprite: 2,
            });
        }
    }

    _spawnImpactBurst(pos, color, n = 6) {
        if (!this.particles?.spawn) return;
        const [r, g, b] = color ?? [1, 1, 1];
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.spawn({
                x: pos.x, y: pos.y, z: pos.z,
                vx: Math.cos(a) * 4, vy: 2 + Math.random() * 2, vz: Math.sin(a) * 4,
                ttl: 0.6, size: 0.5,
                r, g, b, a: 0.9, gravity: 8, sprite: 2,
            });
        }
    }
}

// Export for inspectors / tests
WeaponSystem.WEAPONS = WEAPONS;
