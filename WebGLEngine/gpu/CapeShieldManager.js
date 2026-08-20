// FILE: gpu/CapeShieldManager.js
// VERSION: v873 — Owns the list of active cape-shields.
//
// Hooked into the main engine render loop via two lines added to
// main.js (matching the rigSystem / worldLabels overlay pattern):
//
//   window.capeShieldManager?.update?.();
//   window.capeShieldManager?.drawOverlays?.(camera.viewProj, gl);
//
// Console API on window.capeShield for testing:
//   capeShield.spawn(x, y, z, opts?)   — spawn at world position
//   capeShield.spawnNear(opts?)        — spawn 5u in front of camera
//   capeShield.list()                  — list active shields
//   capeShield.destroy(id)             — remove one by id
//   capeShield.destroyAll()            — remove all
//
// v873 = visual + spawn/destroy. v874 will wire HP/damage to combat,
// integrate with engine lighting/shadows, and add kaiju-triggered
// spawning (e.g. low-HP kaiju summons a defensive shield).

import { CapeShield } from "./CapeShield.js";

export class CapeShieldManager {
    constructor({ gl }) {
        if (!gl) throw new Error("CapeShieldManager: gl required");
        this.gl = gl;
        this.shields = [];

        // v882 — Damage scaling. KAIJU_ATTACKS.damage values are tuned
        // for civilian HP (decimal, e.g. 0.45 for fireball). For shields
        // (HP 80-100) we scale by 100×. Beams use a per-second baseline
        // normalized against ice_ray's 0.4 damage value (BEAM_DOT_BASELINE
        // dmg/sec at attack.damage=0.4). Both scales are exposed via
        // capeShield.setDamageScale() / .setBeamDamageRate() for tuning.
        this.damageScale = 100;          // projectile damage = attack.damage × this
        this.beamDamageRate = 80;        // beam DoT = (attack.damage / 0.4) × this dmg/sec
        this._projectileKindCache = null;
    }

    // v882 — Lazy build projectileKind → attack entry map from KAIJU_ATTACKS.
    // Returns null if KAIJU_ATTACKS isn't exposed (e.g. boot race).
    _getProjectileKindCache() {
        if (this._projectileKindCache) return this._projectileKindCache;
        const ka = (typeof window !== "undefined") ? window.KAIJU_ATTACKS : null;
        if (!ka) return null;
        const cache = new Map();
        for (const [name, attack] of Object.entries(ka)) {
            if (attack?.projectileKind) cache.set(attack.projectileKind, { name, ...attack });
        }
        this._projectileKindCache = cache;
        return cache;
    }

    // v882 — Look up damage for a projectile based on its kind. Returns
    // scaled shield damage (number) or null if no attack data found.
    _projectileDamage(projectile) {
        const cache = this._getProjectileKindCache();
        if (!cache) return null;
        const a = cache.get(projectile.kind);
        if (!a || typeof a.damage !== "number") return null;
        return a.damage * this.damageScale;
    }

    // v882 — Look up beam damage per second for a given attack name.
    // Returns scaled dmg/sec or null. Default ice_ray (damage=0.4)
    // produces beamDamageRate dmg/sec; other beams scale proportionally.
    _beamDamagePerSec(beam) {
        const ka = (typeof window !== "undefined") ? window.KAIJU_ATTACKS : null;
        if (!ka || !beam?.attackName) return null;
        const a = ka[beam.attackName];
        if (!a || typeof a.damage !== "number") return null;
        return (a.damage / 0.4) * this.beamDamageRate;
    }

    spawn(opts = {}) {
        const shield = new CapeShield({ gl: this.gl, ...opts });
        this.shields.push(shield);
        return shield;
    }

    list() {
        return this.shields.map(s => ({
            id: s.id,
            position: s.position.slice(),
            facing:   s.facing.slice(),
            hp: s.hp, maxHp: s.maxHp,
            alive: s.alive,
            lifetimeSec: s.lifetimeSec,
            ageSec: (performance.now() - s.spawnedAt) / 1000,
        }));
    }

    destroy(id) {
        const i = this.shields.findIndex(s => s.id === id);
        if (i < 0) return false;
        this.shields[i].destroy();
        this.shields.splice(i, 1);
        return true;
    }

    destroyAll() {
        for (const s of this.shields) s.destroy();
        this.shields.length = 0;
    }

    // Called once per frame from main render loop
    update() {
        for (const s of this.shields) s.update();

        // v875 — Player-missile collision. Each frame, if there's an
        // active missile, check whether its position is inside any
        // shield's AABB; if so, apply damage + impact deformation +
        // consume the missile. AABB is computed from shield's current
        // worldPos bounds (deformation-aware).
        try {
            const ms = (typeof window !== "undefined") ? window._missileSystem : null;
            const m = ms?.active;
            if (m && m.pos) {
                for (const s of this.shields) {
                    if (!s.alive) continue;
                    if (this._missileHitsShield(s, m)) {
                        // direction = missile velocity normalized
                        const vlen = Math.hypot(m.vel.x, m.vel.y, m.vel.z) || 1;
                        const dir = [m.vel.x / vlen, m.vel.y / vlen, m.vel.z / vlen];
                        s.applyImpact([m.pos.x, m.pos.y, m.pos.z], dir, 0.5);
                        s.takeDamage(25);
                        // Consume missile
                        ms.active = null;
                        try { ms._savedCamera && (window.camera.mode = ms._savedCamera.mode); } catch {}
                        break;
                    }
                }
            }
        } catch {}

        // v878 — Kaiju-projectile collision. Iterate window.projectileManager.projectiles
        // and check each live projectile against each live shield's AABB.
        // FRIENDLY FIRE PROTECTION: a kaiju's own projectile is NOT blocked
        // by its own shield (ownerKaijuId === attachedToKaijuId skip), so
        // a kaiju summoning a defensive shield can still fire OUT through it.
        // Effect: enables kaiju-vs-kaiju shield combat — shield on kaiju A
        // can deflect a projectile fired by kaiju B.
        try {
            const pm = (typeof window !== "undefined") ? window.projectileManager : null;
            if (pm?.projectiles?.size) {
                for (const p of pm.projectiles.values()) {
                    if (!p.alive || !p.position) continue;
                    for (const s of this.shields) {
                        if (!s.alive) continue;
                        // Friendly fire skip
                        if (s.attachedToKaijuId != null
                            && p.ownerKaijuId === s.attachedToKaijuId) continue;
                        if (this._projectileHitsShield(s, p)) {
                            const v = p.velocity || { x: 0, y: 0, z: 0 };
                            const vlen = Math.hypot(v.x, v.y, v.z) || 1;
                            const dir = [v.x / vlen, v.y / vlen, v.z / vlen];
                            s.applyImpact([p.position.x, p.position.y, p.position.z], dir, 0.6);
                            // v882 — damage from KAIJU_ATTACKS data (e.g. fireball 0.45→45, plasma 0.55→55); fallback 30
                            const dmg = this._projectileDamage(p) ?? 30;
                            s.takeDamage(dmg);
                            p.alive = false;     // consume — won't reach its target
                            break;               // this projectile is done; move to next
                        }
                    }
                }
            }
        } catch {}

        // v879 — Beam-vs-shield collision. Iterate kaijuManager._activeBeams
        // (Map keyed by owner kaiju ID). Each beam is a continuous ray
        // from source to target while it lives. For each beam: ray-AABB
        // test against each shield, with friendly-fire skip (key = owner
        // kaiju ID). On hit: continuous DoT damage (40 dmg/sec scaled by
        // dt) + small applyImpact each frame so the shield ripples while
        // being beamed.
        try {
            const km = (typeof window !== "undefined") ? window.kaijuManager : null;
            const beams = km?._activeBeams;
            if (beams && beams.size > 0) {
                const nowMs = performance.now();
                // Track dt since last update for DoT damage calculation
                const dtSec = this._lastBeamUpdate
                    ? Math.min(0.1, (nowMs - this._lastBeamUpdate) / 1000)
                    : 0.016;     // 16ms first frame
                this._lastBeamUpdate = nowMs;

                for (const [kid, beam] of beams) {
                    // Skip expired beams (same logic as the beam-ribbon renderer)
                    if (beam.expiresAt && nowMs > beam.expiresAt) continue;
                    if (!beam.source || !beam.target) continue;
                    for (const s of this.shields) {
                        if (!s.alive) continue;
                        // Friendly fire: kaiju's own beam doesn't hit its own shield
                        if (s.attachedToKaijuId != null
                            && kid === s.attachedToKaijuId) continue;
                        const hit = this._beamHitsShield(s, beam);
                        if (hit) {
                            // Direction = source→target normalized
                            const dx = beam.target.x - beam.source.x;
                            const dy = beam.target.y - beam.source.y;
                            const dz = beam.target.z - beam.source.z;
                            const dlen = Math.hypot(dx, dy, dz) || 1;
                            const dir = [dx / dlen, dy / dlen, dz / dlen];
                            // v882 — DoT rate from KAIJU_ATTACKS (ice_ray 0.4→80, lightning 0.05→10); fallback 40
                            const dmgPerSec = this._beamDamagePerSec(beam) ?? 40;
                            s.takeDamage(dmgPerSec * dtSec);
                            // Mild impact deformation each frame at hit point (ripples shield)
                            s.applyImpact([hit.x, hit.y, hit.z], dir, 0.10);
                        }
                    }
                }
            } else {
                this._lastBeamUpdate = null;   // reset on no-beams so dt restarts fresh
            }
        } catch {}

        // v875 — Auto-trigger: poll kaiju + spawn shield on low-HP if enabled
        if (this._autoTrigger?.enabled) {
            this._autoTriggerTick();
        }

        // Reap dead
        for (let i = this.shields.length - 1; i >= 0; i--) {
            if (!this.shields[i].alive) {
                this.shields[i].destroy();
                this.shields.splice(i, 1);
            }
        }
    }

    // v875 — AABB test for missile-vs-shield. Compute shield's current
    // world-space bounding box from sim.worldPos, expand slightly (cape
    // is a 2D surface; need depth tolerance for the missile's radius),
    // and check missile position is inside.
    _missileHitsShield(shield, missile) {
        return this._pointInShieldAABB(shield, missile.pos.x, missile.pos.y, missile.pos.z, 0.5);
    }

    // v878 — Same AABB test for kaiju projectiles. Larger expansion
    // since projectiles can be bigger (tree, rock spike, plasma ball).
    _projectileHitsShield(shield, projectile) {
        // Approximate projectile radius from scale (~1.0 default for trees, smaller for laser bolts)
        const radius = Math.max(0.5, (projectile.scale ?? 1.0) * 0.8);
        return this._pointInShieldAABB(shield, projectile.position.x, projectile.position.y, projectile.position.z, radius);
    }

    _pointInShieldAABB(shield, x, y, z, expand) {
        const wp = shield.sim?.worldPos;
        if (!wp) return false;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < wp.length; i += 3) {
            if (wp[i + 0] < minX) minX = wp[i + 0];
            if (wp[i + 1] < minY) minY = wp[i + 1];
            if (wp[i + 2] < minZ) minZ = wp[i + 2];
            if (wp[i + 0] > maxX) maxX = wp[i + 0];
            if (wp[i + 1] > maxY) maxY = wp[i + 1];
            if (wp[i + 2] > maxZ) maxZ = wp[i + 2];
        }
        return (
            x >= minX - expand && x <= maxX + expand &&
            y >= minY - expand && y <= maxY + expand &&
            z >= minZ - expand && z <= maxZ + expand
        );
    }

    // v879 — Compute shield's world-space AABB once (used by beam slab test).
    // Returns {minX, maxX, minY, maxY, minZ, maxZ, ok:true} or {ok:false}.
    _shieldAABB(shield) {
        const wp = shield.sim?.worldPos;
        if (!wp) return { ok: false };
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < wp.length; i += 3) {
            if (wp[i + 0] < minX) minX = wp[i + 0];
            if (wp[i + 1] < minY) minY = wp[i + 1];
            if (wp[i + 2] < minZ) minZ = wp[i + 2];
            if (wp[i + 0] > maxX) maxX = wp[i + 0];
            if (wp[i + 1] > maxY) maxY = wp[i + 1];
            if (wp[i + 2] > maxZ) maxZ = wp[i + 2];
        }
        return { ok: true, minX, maxX, minY, maxY, minZ, maxZ };
    }

    // v879 — Ray-AABB intersection using the slab method. Tests whether
    // the line segment (beam.source → beam.target) intersects the shield's
    // AABB; returns the entry point in world space if it does, null otherwise.
    //
    // Slab method: for each axis, compute t-range where the ray is inside
    // the slab. Global tmin/tmax = intersection of all axis ranges.
    //   If tmin > tmax: ray misses the box.
    //   If tmax < 0 or tmin > segment_length: box is behind / past the segment.
    //   Else: entry point = source + dir * max(0, tmin).
    _beamHitsShield(shield, beam) {
        const aabb = this._shieldAABB(shield);
        if (!aabb.ok) return null;
        // Expand AABB by beam half-width for tolerance (default 0.4u)
        const EXP = 0.4;
        const minX = aabb.minX - EXP, maxX = aabb.maxX + EXP;
        const minY = aabb.minY - EXP, maxY = aabb.maxY + EXP;
        const minZ = aabb.minZ - EXP, maxZ = aabb.maxZ + EXP;

        const ox = beam.source.x, oy = beam.source.y, oz = beam.source.z;
        const dx = beam.target.x - ox;
        const dy = beam.target.y - oy;
        const dz = beam.target.z - oz;
        const segLen = Math.hypot(dx, dy, dz);
        if (segLen < 1e-6) return null;

        // Slab method
        const _slab = (o, d, lo, hi) => {
            if (Math.abs(d) < 1e-8) {
                // Ray parallel to slab: hit only if origin is inside it
                if (o < lo || o > hi) return null;
                return [-Infinity, Infinity];
            }
            const t1 = (lo - o) / d;
            const t2 = (hi - o) / d;
            return t1 < t2 ? [t1, t2] : [t2, t1];
        };
        const sx = _slab(ox, dx, minX, maxX); if (!sx) return null;
        const sy = _slab(oy, dy, minY, maxY); if (!sy) return null;
        const sz = _slab(oz, dz, minZ, maxZ); if (!sz) return null;

        const tmin = Math.max(sx[0], sy[0], sz[0]);
        const tmax = Math.min(sx[1], sy[1], sz[1]);

        if (tmin > tmax) return null;
        if (tmax < 0 || tmin > 1) return null;     // segment param t∈[0,1]; outside = miss

        // Entry point along segment
        const tHit = Math.max(0, tmin);
        return {
            x: ox + dx * tHit,
            y: oy + dy * tHit,
            z: oz + dz * tHit,
        };
    }

    // v875 — Auto-trigger state
    _autoTriggerInit() {
        if (this._autoTrigger) return;
        this._autoTrigger = {
            enabled: false,
            thresholdEnergy: 0.30,       // spawn when kaiju energy <= 30% of max (default kaiju energy starts ~1.0)
            poller: null,
            shieldedKaiju: new Set(),    // kaiju IDs we've already shielded (don't double-spawn)
            lastCheck: 0,
            checkIntervalMs: 1000,       // check once per second
        };
    }

    _autoTriggerTick() {
        const now = performance.now();
        if (now - this._autoTrigger.lastCheck < this._autoTrigger.checkIntervalMs) return;
        this._autoTrigger.lastCheck = now;
        const km = (typeof window !== "undefined") ? window.kaijuManager : null;
        if (!km?.kaiju?.values) return;
        for (const k of km.kaiju.values()) {
            if (this._autoTrigger.shieldedKaiju.has(k.id)) continue;
            const energy = (typeof k.energy === "number") ? k.energy : 1.0;
            if (energy <= this._autoTrigger.thresholdEnergy && energy > 0) {
                // Spawn a shield attached to this kaiju
                this.spawn({
                    position: [k.position.x, k.position.y + 1, k.position.z],
                    facing:   [0, 0, 1],
                    color:    [0.45, 0.65, 1.0, 0.75],
                    hp:       80,
                    lifetimeSec: 12,             // shield expires after 12s
                    attachedToKaijuId: k.id,
                });
                this._autoTrigger.shieldedKaiju.add(k.id);
                try { console.log(`[CapeShield] auto-spawned shield for kaiju ${k.id} (${k.name}, energy=${energy.toFixed(2)})`); } catch {}
            }
        }
    }

    drawOverlays(viewProj, gl) {
        for (const s of this.shields) s.drawOverlays(viewProj, gl || this.gl);
    }

    // v881 — Render all shields into the active shadow framebuffer.
    // Called from main.js inside the shadowPass.bind()/unbind() block.
    renderDepth(lightVP, gl) {
        for (const s of this.shields) s.renderDepth(lightVP, gl || this.gl);
    }
}

/**
 * Install the manager + console API. Call from main.js after the
 * GL context is available:
 *   import { installCapeShieldManager } from './gpu/CapeShieldManager.js';
 *   installCapeShieldManager(gl);
 * After this, window.capeShieldManager + window.capeShield are ready
 * and the main render loop should be calling:
 *   window.capeShieldManager.update();
 *   window.capeShieldManager.drawOverlays(camera.viewProj, gl);
 */
export function installCapeShieldManager(gl) {
    if (typeof window === "undefined") return null;
    if (window.capeShieldManager) return window.capeShieldManager;
    const mgr = new CapeShieldManager({ gl });
    mgr._autoTriggerInit();
    window.capeShieldManager = mgr;

    // Console API
    window.capeShield = {
        // Spawn at explicit world position
        spawn(x, y, z, opts = {}) {
            const shield = mgr.spawn({ position: [x, y, z], ...opts });
            return { id: shield.id, position: shield.position.slice() };
        },

        // Spawn 5 units in front of the current camera, facing back at camera
        spawnNear(opts = {}) {
            const cam = window.camera;
            if (!cam) return { ok: false, error: "no window.camera" };
            // Camera forward — derive from yaw/pitch if exposed, or use camera direction
            let fwd = [0, 0, -1];
            if (cam.forward) {
                fwd = [cam.forward[0], cam.forward[1], cam.forward[2]];
            } else if (typeof cam.yaw === "number") {
                const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
                const cp = (typeof cam.pitch === "number") ? Math.cos(cam.pitch) : 1;
                const sp = (typeof cam.pitch === "number") ? Math.sin(cam.pitch) : 0;
                fwd = [sy * cp, -sp, -cy * cp];
            }
            const flen = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1;
            fwd = [fwd[0] / flen, fwd[1] / flen, fwd[2] / flen];
            const dist = opts.distance || 5;
            const px = (cam.position?.x ?? 0) + fwd[0] * dist;
            const py = (cam.position?.y ?? 0) + fwd[1] * dist + 0.5;  // slightly above eye level
            const pz = (cam.position?.z ?? 0) + fwd[2] * dist;
            // Shield faces camera (opposite of fwd)
            const shield = mgr.spawn({
                position: [px, py, pz],
                facing:   [-fwd[0], -fwd[1], -fwd[2]],
                ...opts,
            });
            return { id: shield.id, position: shield.position.slice(), facing: shield.facing.slice() };
        },

        // v875 — Attach a shield to a kaiju by ID. Shield will follow
        // the kaiju each frame, positioned between kaiju and camera.
        attachToKaiju(kaijuId, opts = {}) {
            const km = window.kaijuManager;
            const k = km?.kaiju?.get?.(kaijuId);
            if (!k) return { ok: false, error: "no kaiju with id " + kaijuId };
            const shield = mgr.spawn({
                position: [k.position.x, k.position.y + 1, k.position.z],
                facing:   [0, 0, 1],
                attachedToKaijuId: kaijuId,
                ...opts,
            });
            return { id: shield.id, kaijuId, kaijuName: k.name };
        },

        // v875 — Apply impact damage to a specific shield (test helper)
        damage(shieldId, amount) {
            const s = mgr.shields.find(s => s.id === shieldId);
            if (!s) return { ok: false, error: "no shield " + shieldId };
            s.takeDamage(amount);
            return { id: shieldId, hp: s.hp, alive: s.alive };
        },

        // v875 — Auto-trigger: poll kaiju + spawn defensive shields on low-HP
        autoTriggerKaiju: {
            enable(thresholdEnergy = 0.30) {
                mgr._autoTrigger.enabled = true;
                mgr._autoTrigger.thresholdEnergy = thresholdEnergy;
                console.log(`[CapeShield] auto-trigger enabled — kaiju shield spawns at energy <= ${thresholdEnergy}`);
                return mgr._autoTrigger;
            },
            disable() {
                mgr._autoTrigger.enabled = false;
                console.log("[CapeShield] auto-trigger disabled");
                return mgr._autoTrigger;
            },
            status() { return { ...mgr._autoTrigger, shieldedKaiju: [...mgr._autoTrigger.shieldedKaiju] }; },
            // Forget the "already shielded" set so kaiju can be re-shielded
            forget() {
                mgr._autoTrigger.shieldedKaiju.clear();
                return { ok: true };
            },
        },

        list:       () => mgr.list(),
        destroy:    (id) => mgr.destroy(id),
        destroyAll: () => mgr.destroyAll(),
        count:      () => mgr.shields.length,

        // v882 — Tune damage scaling from KAIJU_ATTACKS data
        setDamageScale(n = 100) {
            mgr.damageScale = Math.max(1, Math.min(1000, n));
            console.log("[CapeShield] projectile damage scale →", mgr.damageScale, "(attack.damage × this)");
            return mgr.damageScale;
        },
        setBeamDamageRate(n = 80) {
            mgr.beamDamageRate = Math.max(1, Math.min(500, n));
            console.log("[CapeShield] beam DoT baseline →", mgr.beamDamageRate, "dmg/sec at attack.damage=0.4");
            return mgr.beamDamageRate;
        },
        // v882 — Show what each attack does to a shield given current scales
        damageStats() {
            const ka = window.KAIJU_ATTACKS;
            if (!ka) { console.warn("[CapeShield] KAIJU_ATTACKS not exposed yet"); return []; }
            const rows = [];
            for (const [name, a] of Object.entries(ka)) {
                if (typeof a.damage !== "number") continue;
                const proj = a.projectileKind
                    ? +(a.damage * mgr.damageScale).toFixed(1)
                    : "—";
                const beam = a.family === "beam"
                    ? +((a.damage / 0.4) * mgr.beamDamageRate).toFixed(1) + " dmg/sec"
                    : "—";
                rows.push({ attack: name, family: a.family, raw: a.damage, projectileHit: proj, beamDoT: beam });
            }
            console.table(rows);
            return rows;
        },

        // v878 — debug helper: show what kaiju projectiles are currently
        // flying + which shield (if any) they're closest to. Useful for
        // confirming projectile collision is detecting incoming attacks.
        projectilesInFlight() {
            const pm = window.projectileManager;
            if (!pm?.projectiles) return [];
            const out = [];
            for (const p of pm.projectiles.values()) {
                if (!p.alive) continue;
                out.push({
                    id: p.id,
                    kind: p.kind,
                    ownerKaijuId: p.ownerKaijuId,
                    pos: [
                        p.position.x.toFixed(1),
                        p.position.y.toFixed(1),
                        p.position.z.toFixed(1),
                    ],
                    speed: Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z).toFixed(1),
                });
            }
            return out;
        },
    };

    try {
        console.log("[CapeShield] manager installed v875 — capeShield.spawnNear() · .attachToKaiju(id) · .autoTriggerKaiju.enable()");
    } catch {}
    return mgr;
}
