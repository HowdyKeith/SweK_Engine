// FILE: simulation/CentipedeManager.js
// VERSION: v1 - round 50
//
// Owns the list of active Centipedes. Handles spawn (allocate entities,
// init pos), tick (advance + push entity:move), hit (split chain, spawn
// new head entity), and clear (despawn all). Plug in to main tick loop
// AFTER world tick so terrain queries reflect current state.
//
// Public surface:
//   spawn({ x, z, segmentCount }) -> Centipede
//   hit(centipedeId, segIdx) -> ok?
//   list() -> [...]
//   clear()
//   tick(dt)

import { Centipede } from "./Centipede.js";
import { voxelsToObj } from "../utils/voxelsToObj.js";
// v767 — round 30 named attack registry. Maps family names (laser,
// fireball, ...) to {shape, color, damage, range, ...}. CentipedeManager
// resolves entries from this registry inside _tickAttack; absence
// falls back to the legacy {projectile, beam, aoe} shape names.
import { KAIJU_ATTACKS, attacksForKind, getAttack } from "./kaijuAttacks.js";
// v769 — status effects (acid DoT, slow, disabled). Applied at attack
// time when the registry entry has a statusEffect block.
import { applyEffect as applyStatusEffect } from "./statusEffects.js";

// v737 — Gemini insect variety pool. Each segment of a centipede chain
// picks a random kind from this pool so the visible body shows a mix of
// beetle/scorpion/spider/ant/etc instead of identical orange boxes.
// Prewarmed via /ai/asset/pool on first spawn; cached server-side so
// subsequent engine boots don't re-call Gemini.
const INSECT_PROMPTS = [
    "beetle blocky cartoon",
    "scorpion blocky cartoon",
    "spider blocky cartoon",
    "ant blocky cartoon",
    "caterpillar blocky cartoon",
    "wasp blocky cartoon",
    "centipede segment cartoon",
    "millipede segment cartoon",
];

export class CentipedeManager {
    constructor({ router, world, assetLoader }) {
        this.router = router;
        this.world = world;
        this.assetLoader = assetLoader || null;
        this.centipedes = new Map();   // id -> Centipede
        // v737 — insect pool. Empty until _prewarmInsectPool resolves.
        this._insectKinds = [];          // ["gem_beetle", ...] installed asset IDs
        this._insectPromptToName = {};   // for HUD/debug
        this._poolReady = false;
        this._poolStarting = false;
        // v759 — KaijuManager-style attack delegation. Off by default; the
        // city-attack demo enables this via setAttackPolicy({enabled:true})
        // to make centipedes fire at registered _extraRangedTargets through
        // ProjectileManager (real engine projectiles + voxel carve), with
        // beam + AoE families spawned natively. Replaces the demo's own
        // attack loop. Independent per-chain via c._nextAttackMs.
        this._attackPolicy = {
            enabled: false,
            fireInterval: [3000, 5500],   // ms range between fires per chain
            fireRange: 60,                 // max target distance for engagement
            families: ["projectile", "beam", "aoe"],
            beamDamage: 1,
            aoeDamage: 1,
            aoeRadius: 8,
            // Event publisher for "kaiju_ranged_attack" — set by main.js if available
            events: null,
        };
        // v760 — hunt mode: centipede chases + eats targets (pedestrians).
        // Mutually exclusive with combat: when hunting, attacks should be
        // disabled by the demo. targetProvider returns an array of live
        // {x, z, ref} candidates each tick. onEat is called for each kill.
        this._huntPolicy = {
            enabled: false,
            targetProvider: null,   // () => Array<{x, z, ref?}>
            eatRadius: 1.6,
            onEat: null,            // (target) => void  (e.g. despawn + VFX)
        };
        this._surfaceY = (x, z) => {
            // Top-down voxel scan, identical to OgreScenario._surfaceY.
            // Round 57 - returns null when scan finds nothing (chunk not
            // loaded or fully air column). Callers fall back to keeping
            // their previous Y, which avoids the "centipede drops to y=30
            // when entering an unloaded chunk and appears to fly through
            // terrain when the chunk loads back in".
            const xi = Math.floor(x), zi = Math.floor(z);
            for (let y = 80; y > 0; y--) {
                const v = world?.getVoxel?.(xi, y, zi);
                if (v != null && v !== 0 && v !== 10 && v !== 11) return y + 1;
            }
            return null;
        };
    }

    spawn(opts = {}) {
        // v737 — kick off insect-pool prewarm in the background on first
        // spawn. Doesn't block: if pool isn't ready by the time we render
        // body segments, they fall back to centipede_body. Once pool
        // arrives, future spawns get varied kinds.
        this._prewarmInsectPool();
        // v738 — install cylinder mesh for centipede_leg assetId on first
        // spawn so legs look like sticks instead of small boxes. Idempotent.
        this._ensureLegMeshInstalled();

        const x = opts.x ?? (Math.random() - 0.5) * 80;
        const z = opts.z ?? (Math.random() - 0.5) * 80;
        const segmentCount = Math.max(2, Math.min(20, opts.segmentCount ?? 8));
        const c = new Centipede({
            surfaceY: this._surfaceY,
            x, z,
            yaw: Math.random() * Math.PI * 2,
            segmentCount,
            wanderRadius: opts.wanderRadius,    // round 58 - optional override
        });
        // Spawn head entity
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "centipede_head",
                kind: "centipede_head",
                x: c.x, y: c.y, z: c.z,
                scale: 1.2,
            });
            c.headEntityId = r?.id ?? null;
            // Spawn body segments
            for (let k = 0; k < c.segments.length; k++) {
                const seg = c.segments[k];
                // v737 — pick a random insect kind from the Gemini pool
                // (if ready), else fall back to the default body kind.
                let segKind = "centipede_body";
                let segAssetId = "centipede_body";
                if (this._poolReady && this._insectKinds.length > 0) {
                    const pick = this._insectKinds[k % this._insectKinds.length];
                    segKind = pick;
                    segAssetId = pick;
                }
                const sr = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: segAssetId,
                    kind: segKind,
                    x: seg.x, y: seg.y, z: seg.z,
                    scale: 1.0,
                });
                seg.entityId = sr?.id ?? null;
                // v734 — spawn left + right legs for this segment. Initial
                // position from legPositions; subsequent positions pushed
                // every tick. centipede_leg uses the procedural primitive
                // mesh (entityVisuals gives it size/color via the kind).
                const lp = c.legPositions(k);
                const lL = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "centipede_leg", kind: "centipede_leg",
                    x: lp.lx, y: lp.ly, z: lp.lz, scale: 0.45,
                });
                const lR = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "centipede_leg", kind: "centipede_leg",
                    x: lp.rx, y: lp.ry, z: lp.rz, scale: 0.45,
                });
                seg.legL = lL?.id ?? null;
                seg.legR = lR?.id ?? null;
            }
        }
        this.centipedes.set(c.id, c);
        console.log(`[Centipede] spawned #${c.id}: ${c.segments.length + 1} units at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
        return c;
    }

    hit(centipedeId, segIdx) {
        const c = this.centipedes.get(centipedeId);
        if (!c) return false;
        // segIdx -1 means "hit the head" -> the entire centipede dies and
        // every segment becomes a new ungrouped chain.
        if (segIdx === -1 || segIdx == null) {
            // Head death: the whole centipede dies. Despawn all entities.
            this._despawn(c);
            this.centipedes.delete(c.id);
            console.log(`[Centipede] #${c.id} head killed -> chain destroyed`);
            return true;
        }
        const result = c.splitAt(segIdx);
        if (!result) return false;
        const { deadSeg, newCentipede, newHeadLegL, newHeadLegR } = result;
        // Despawn the hit segment's entity + its legs
        if (this.router && deadSeg.entityId != null) {
            this.router.exec({ type: "entity:despawn", id: deadSeg.entityId });
        }
        // v734 — clean up the dead segment's legs too
        if (this.router) {
            if (deadSeg.legL != null) this.router.exec({ type: "entity:despawn", id: deadSeg.legL });
            if (deadSeg.legR != null) this.router.exec({ type: "entity:despawn", id: deadSeg.legR });
            // v734 — the new head (promoted body segment) loses its legs
            if (newHeadLegL != null) this.router.exec({ type: "entity:despawn", id: newHeadLegL });
            if (newHeadLegR != null) this.router.exec({ type: "entity:despawn", id: newHeadLegR });
        }
        // Promote first tail entity to "centipede_head" by despawn + respawn
        // with the head kind. Cosmetic only — the underlying simulation
        // doesn't care, but the visual now matches its role.
        if (newCentipede && this.router) {
            const oldHeadEntityId = newCentipede.headEntityId;
            if (oldHeadEntityId != null) {
                this.router.exec({ type: "entity:despawn", id: oldHeadEntityId });
            }
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "centipede_head",
                kind: "centipede_head",
                x: newCentipede.x, y: newCentipede.y, z: newCentipede.z,
                scale: 1.2,
            });
            newCentipede.headEntityId = r?.id ?? null;
        }
        if (newCentipede) {
            this.centipedes.set(newCentipede.id, newCentipede);
            console.log(`[Centipede] #${c.id} split at segment ${segIdx} -> new chain #${newCentipede.id} (${newCentipede.segments.length + 1} units)`);
        } else {
            console.log(`[Centipede] #${c.id} hit at last segment ${segIdx}, tail truncated`);
        }
        // If parent is now headless or empty, finalize it
        if (c.segments.length === 0) {
            // Head still alive but body gone — keep as a solo head for now
            // so the player can finish it off. Future round may auto-despawn.
        }
        return true;
    }

    _despawn(c) {
        if (!this.router) return;
        if (c.headEntityId != null) {
            this.router.exec({ type: "entity:despawn", id: c.headEntityId });
        }
        for (const seg of c.segments) {
            if (seg.entityId != null) {
                this.router.exec({ type: "entity:despawn", id: seg.entityId });
            }
            // v734 — despawn each segment's leg pair too
            if (seg.legL != null) this.router.exec({ type: "entity:despawn", id: seg.legL });
            if (seg.legR != null) this.router.exec({ type: "entity:despawn", id: seg.legR });
        }
    }

    // v738 — install a stick-shaped cylinder mesh for centipede_leg
    // assetId on first spawn. Without this, legs render as small primitive
    // boxes (chunky). Hexagonal cylinder tall along Y so it looks like a
    // leg dropping downward from the body segment.
    _ensureLegMeshInstalled() {
        if (this._legMeshInstalled) return;
        if (!this.assetLoader?.installOBJText) return;
        this._legMeshInstalled = true;
        // Hexagonal cylinder, radius 0.18, height 1.0 (y -0.5 to 0.5).
        // Pre-scaled to fit centipede_leg's existing scaleFor() value (0.45).
        const SIDES = 8, R = 0.18, H = 0.5;
        const vLines = [];
        const fLines = [];
        // Bottom ring (y = -H), then top ring (y = +H)
        for (let i = 0; i < SIDES; i++) {
            const a = (i / SIDES) * Math.PI * 2;
            vLines.push(`v ${(R*Math.cos(a)).toFixed(3)} ${-H.toFixed(3)} ${(R*Math.sin(a)).toFixed(3)}`);
        }
        for (let i = 0; i < SIDES; i++) {
            const a = (i / SIDES) * Math.PI * 2;
            vLines.push(`v ${(R*Math.cos(a)).toFixed(3)} ${H.toFixed(3)} ${(R*Math.sin(a)).toFixed(3)}`);
        }
        // Caps: add center verts for top + bottom
        vLines.push(`v 0 ${-H.toFixed(3)} 0`);   // SIDES*2 + 1 (bottom center)
        vLines.push(`v 0 ${H.toFixed(3)} 0`);    // SIDES*2 + 2 (top center)
        const botCenter = SIDES * 2 + 1;
        const topCenter = SIDES * 2 + 2;
        // Side quads (OBJ 1-indexed). v1..VSIDES are bottom ring, v(S+1)..v(2S) are top.
        for (let i = 0; i < SIDES; i++) {
            const b1 = i + 1;
            const b2 = ((i + 1) % SIDES) + 1;
            const t1 = SIDES + i + 1;
            const t2 = SIDES + ((i + 1) % SIDES) + 1;
            // CCW from outside: b1, b2, t2, t1
            fLines.push(`f ${b1} ${b2} ${t2} ${t1}`);
        }
        // Bottom triangle fan (CCW from below = outward facing)
        for (let i = 0; i < SIDES; i++) {
            const b1 = i + 1;
            const b2 = ((i + 1) % SIDES) + 1;
            fLines.push(`f ${botCenter} ${b2} ${b1}`);
        }
        // Top triangle fan (CCW from above = outward facing)
        for (let i = 0; i < SIDES; i++) {
            const t1 = SIDES + i + 1;
            const t2 = SIDES + ((i + 1) % SIDES) + 1;
            fLines.push(`f ${topCenter} ${t1} ${t2}`);
        }
        const obj = `# centipede_leg (v738 stick)\n${vLines.join("\n")}\n${fLines.join("\n")}\n`;
        try {
            this.assetLoader.installOBJText("centipede_leg", obj);
            console.log("[CentipedeManager] installed cylinder leg mesh");
        } catch (e) {
            console.warn("[CentipedeManager] leg mesh install failed:", e.message);
        }
    }

    // v737 — fetch a small pool of Gemini-generated insect voxel models
    // and install each as a named asset. Lazy + non-blocking: returns
    // immediately, populates this._insectKinds + this._poolReady once
    // installs finish. Cached server-side so subsequent boots are instant.
    async _prewarmInsectPool() {
        if (this._poolReady || this._poolStarting) return;
        if (!this.assetLoader?.installOBJText) return;
        this._poolStarting = true;
        try {
            const r = await fetch("/ai/asset/pool", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompts: INSECT_PROMPTS }),
            });
            const j = await r.json();
            if (!j.ok || !Array.isArray(j.items)) {
                console.warn("[CentipedeManager] pool fetch failed:", j.error || "unknown");
                this._poolStarting = false;
                return;
            }
            for (const it of j.items) {
                if (!it.voxels || it.voxels.length === 0) continue;
                const safe = (it.prompt || "insect").toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 24);
                const kind = "gem_" + safe;
                const objText = voxelsToObj(it.voxels);
                try {
                    await this.assetLoader.installOBJText(kind, objText);
                    this._insectKinds.push(kind);
                    this._insectPromptToName[it.prompt] = kind;
                } catch (e) {
                    console.warn(`[CentipedeManager] install ${kind} failed:`, e.message);
                }
            }
            this._poolReady = this._insectKinds.length > 0;
            console.log(`[CentipedeManager] insect pool ready: ${this._insectKinds.length} kinds (${this._insectKinds.join(", ")})`);
        } catch (e) {
            console.warn("[CentipedeManager] prewarm error:", e.message);
        }
        this._poolStarting = false;
    }

    clear() {
        for (const c of this.centipedes.values()) this._despawn(c);
        this.centipedes.clear();
        console.log(`[Centipede] cleared all chains`);
    }

    list() {
        const out = [];
        for (const c of this.centipedes.values()) {
            out.push({
                id: c.id,
                segments: c.segments.length,
                x: c.x.toFixed(1),
                z: c.z.toFixed(1),
                yaw: c.yaw.toFixed(2),
                parentId: c.parentId,
            });
        }
        return out;
    }

    tick(dt) {
        if (this.centipedes.size === 0) return;
        for (const c of this.centipedes.values()) {
            c.tick(dt);
            // v759 — attack delegation tick
            if (this._attackPolicy?.enabled) this._tickAttack(c, dt);
            // v760 — hunt delegation tick (chase + eat targets)
            if (this._huntPolicy?.enabled) this._tickHunt(c, dt);
            if (!this.router) continue;
            // Push entity:move for head + each segment
            if (c.headEntityId != null) {
                this.router.exec({
                    type: "entity:move",
                    id: c.headEntityId,
                    x: c.x, y: c.y, z: c.z,
                    yaw: c.headYaw(),
                });
            }
            for (let k = 0; k < c.segments.length; k++) {
                const seg = c.segments[k];
                if (seg.entityId == null || seg.hp <= 0) continue;
                this.router.exec({
                    type: "entity:move",
                    id: seg.entityId,
                    x: seg.x, y: seg.y, z: seg.z,
                    yaw: c.segmentYaw(k),
                });
                // v734 — animate legs along with segment
                // v741 — pass tiltZ (roll) so legs tilt outward
                if (seg.legL != null || seg.legR != null) {
                    const lp = c.legPositions(k);
                    if (seg.legL != null) {
                        this.router.exec({
                            type: "entity:move", id: seg.legL,
                            x: lp.lx, y: lp.ly, z: lp.lz, yaw: lp.lyaw, tiltZ: lp.lroll,
                        });
                    }
                    if (seg.legR != null) {
                        this.router.exec({
                            type: "entity:move", id: seg.legR,
                            x: lp.rx, y: lp.ry, z: lp.rz, yaw: lp.ryaw, tiltZ: lp.rroll,
                        });
                    }
                }
            }
        }
    }

    // v759 — attack delegation API. Demos call this to enable kaiju-style
    // ranged attacks. Targets come from window._extraRangedTargets (the
    // hook used by KaijuManager._findRangedTarget). Mirrors KaijuManager's
    // attack-family pattern (projectile/beam/aoe) but routes through the
    // engine's ProjectileManager directly so projectiles get real ballistic
    // physics + voxel carve + civ splash. Beam + AoE are visualized in
    // ECS-native entities so the existing rendering + scale-fade applies.
    setAttackPolicy(opts) {
        Object.assign(this._attackPolicy, opts || {});
    }

    // v760 — hunt mode API. Demos call this with a targetProvider function
    // that returns an array of live target candidates each tick (e.g. the
    // city demo's pedestrian boids array). The centipede heads toward the
    // nearest target and "eats" any within eatRadius — onEat is invoked
    // with the target ref so the demo can despawn it + show VFX.
    setHuntPolicy(opts) {
        Object.assign(this._huntPolicy, opts || {});
        // When disabling hunt, clear all chains' hunt targets so they resume wander
        if (opts && opts.enabled === false) {
            for (const c of this.centipedes.values()) {
                if (c.setHuntTarget) c.setHuntTarget(null);
            }
        }
    }

    _tickHunt(c, dt) {
        if (!c || !c.alive || !this._huntPolicy.targetProvider) return;
        let targets;
        try { targets = this._huntPolicy.targetProvider() || []; }
        catch { targets = []; }
        if (!Array.isArray(targets) || targets.length === 0) {
            if (c.setHuntTarget) c.setHuntTarget(null);
            return;
        }
        // Find nearest target to HEAD — used for steering direction
        let nearest = null, bestD2 = Infinity;
        for (const t of targets) {
            if (!t || typeof t.x !== "number" || typeof t.z !== "number") continue;
            const dx = t.x - c.x, dz = t.z - c.z;
            const d2 = dx*dx + dz*dz;
            if (d2 < bestD2) { bestD2 = d2; nearest = t; }
        }
        if (!nearest) {
            if (c.setHuntTarget) c.setHuntTarget(null);
            return;
        }
        if (c.setHuntTarget) c.setHuntTarget(nearest.x, nearest.z);

        // v761 — body-segment eat-radius. Scan ALL segments (head + body)
        // against ALL live targets. Any segment within eatRadius of any
        // target counts as an eat. Lets the chain damage things it brushes
        // past, not just things directly in front of the head.
        const eatR2 = this._huntPolicy.eatRadius * this._huntPolicy.eatRadius;
        if (!this._huntPolicy.onEat) return;
        // Build the list of segment positions: head first, then body segments.
        // Use a stack-allocated descriptor to avoid object churn in the hot path.
        const segPositions = [{ x: c.x, z: c.z }];
        if (Array.isArray(c.segments)) {
            for (const seg of c.segments) {
                if (seg && seg.hp > 0 && typeof seg.x === "number") {
                    segPositions.push({ x: seg.x, z: seg.z });
                }
            }
        }
        // For each target, check if any segment is within eat radius.
        // We snapshot the target list because onEat may splice the underlying array.
        const targetsSnap = targets.slice();
        for (const t of targetsSnap) {
            if (!t || typeof t.x !== "number") continue;
            for (const sp of segPositions) {
                const dx = t.x - sp.x, dz = t.z - sp.z;
                if (dx*dx + dz*dz < eatR2) {
                    try { this._huntPolicy.onEat(t); } catch (e) {
                        console.warn("[centipede hunt] onEat threw:", e?.message);
                    }
                    break;   // don't double-count one target across multiple segments
                }
            }
        }
    }

    _tickAttack(c, dt) {
        if (!c || c.headEntityId == null) return;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (!c._nextAttackMs) {
            const [lo, hi] = this._attackPolicy.fireInterval;
            c._nextAttackMs = now + lo + Math.random() * (hi - lo);
            return;
        }
        if (now < c._nextAttackMs) return;

        // Pick target from registered extras
        const targets = (typeof window !== "undefined" && Array.isArray(window._extraRangedTargets))
                        ? window._extraRangedTargets : [];
        if (targets.length === 0) {
            // Re-arm with a shorter delay so we don't burn cycles
            c._nextAttackMs = now + 1500;
            return;
        }
        const range2 = this._attackPolicy.fireRange * this._attackPolicy.fireRange;
        let nearest = null, bestD2 = range2;
        for (const t of targets) {
            if (!t || typeof t.x !== "number") continue;
            const dx = t.x - c.x, dz = t.z - c.z;
            const d2 = dx*dx + dz*dz;
            if (d2 < bestD2) { bestD2 = d2; nearest = t; }
        }
        if (!nearest) {
            c._nextAttackMs = now + 1500;
            return;
        }

        // v767 (round 30) — resolve named attack from registry, fall back
        // to legacy shape-name behavior. families can be either
        //   ["projectile", "beam", "aoe"]                   (legacy shape names)
        //   ["fireball", "magic_orb", "radiation"]          (registry attack names)
        //   or a mix.
        // For a registry entry, range + fireInterval override the policy
        // defaults so attacks feel mechanically distinct (a flamethrower
        // engages closer + faster than a meteor strike).
        const families = this._attackPolicy.families || ["projectile"];
        const familyName = families[Math.floor(Math.random() * families.length)];
        const attack = getAttack(familyName);   // null if it's a legacy shape name

        // If the attack defines its own range, re-validate the target
        // against that range — a meteor reaches farther than acid spit,
        // and we shouldn't ever fire if we picked an attack that can't
        // hit the nearest target.
        if (attack && typeof attack.range === "number") {
            const aRange2 = attack.range * attack.range;
            const dx = nearest.x - c.x, dz = nearest.z - c.z;
            if (dx*dx + dz*dz > aRange2) {
                // Try again sooner — we may have moved into range later
                c._nextAttackMs = now + 800;
                return;
            }
        }

        try {
            const shape = attack ? attack.shape : familyName;
            if (shape === "projectile") this._fireProjectile(c, nearest, attack);
            else if (shape === "beam")  this._fireBeam(c, nearest, attack);
            else if (shape === "aoe")   this._fireAoE(c, nearest, attack);
        } catch (e) {
            console.warn("[centipede] attack failed:", e?.message);
        }

        // Publish event (same shape as KaijuManager so downstream FX
        // subscribers like kaijuAttackFx fire for centipedes too)
        if (this._attackPolicy.events?.publish) {
            try {
                this._attackPolicy.events.publish({
                    type: "kaiju_ranged_attack",
                    kaijuId: c.id, kaijuName: "Centipede", kaijuKind: "centipede",
                    attackName: familyName, verb: attack?.verb || "attacks",
                    targetName: nearest.name ?? null,
                    targetType: nearest._type,
                    fromX: c.x, fromY: c.y + 2, fromZ: c.z,
                    toX: nearest.x, toY: nearest.y ?? 0, toZ: nearest.z,
                    x: c.x, y: c.y + 2, z: c.z,
                });
            } catch {}
        }

        // v767 — per-attack fireInterval overrides the policy default
        // so each family has its own cadence.
        const [lo, hi] = (attack && Array.isArray(attack.fireInterval))
                        ? attack.fireInterval
                        : this._attackPolicy.fireInterval;
        c._nextAttackMs = now + lo + Math.random() * (hi - lo);
    }

    _fireProjectile(c, target, attack = null) {
        const pm = (typeof window !== "undefined") ? window.projectileManager : null;
        if (!pm?.launch) return;
        // v767 — use registry params when provided, fall back to v759 defaults
        const kind  = attack?.projectileKind  || "fireball";
        const scale = attack?.projectileScale ?? 0.6;
        const trail = attack?.trail           ?? "smoke";
        const burstCount    = attack?.burstCount    || 1;
        const burstSpacing  = attack?.burstSpacingMs || 80;
        // v769 — status effect application. Done at launch so the
        // gameplay feels like the moment-of-fire matters (in line with
        // how beams already apply damage immediately).
        if (attack?.statusEffect && target) {
            try { applyStatusEffect(target, attack.statusEffect); } catch {}
        }
        // Single shot is the common case — issue immediately, no setTimeout
        const launchOne = () => {
            try {
                pm.launch({
                    from: { x: c.x, y: (c.y ?? 0) + 2, z: c.z },
                    to:   { x: target.x, y: target.y ?? 1, z: target.z },
                    kind, scale,
                    ownerKaijuId: c.id,
                    damageMul: 1.0,
                    trail,
                });
            } catch {}
        };
        launchOne();
        // Burst attacks (guns, quill_barrage) fire N rounds with small
        // delays. We capture target.x/z at launch time, so even if the
        // target moves the burst converges on its initial position —
        // matches how a real gun burst behaves.
        for (let i = 1; i < burstCount; i++) {
            setTimeout(launchOne, i * burstSpacing);
        }
    }

    _fireBeam(c, target, attack = null) {
        // Damage immediately (beam = instant)
        const damage = attack?.damage ?? this._attackPolicy.beamDamage;
        if (target.applyDamage) target.applyDamage(damage);
        // v769 — apply status effect on hit (if the attack defines one)
        if (attack?.statusEffect && target) {
            try { applyStatusEffect(target, attack.statusEffect); } catch {}
        }
        // Visual: single stretched obelisk entity from head to target
        if (!this.router) return;
        const dx = target.x - c.x, dz = target.z - c.z;
        const len = Math.sqrt(dx*dx + dz*dz);
        if (len < 0.01) return;
        const midX = (c.x + target.x) / 2;
        const midZ = (c.z + target.z) / 2;
        const midY = (c.y ?? 0) + 2 - 0.5;
        const yaw = Math.atan2(dx, dz);
        // v767 — registry params for thickness + fade duration. Colors not
        // currently used by entity:spawnMesh but kind name carries flavor
        // through to FX subscribers.
        const thickness = attack?.beamScaleXY ?? 0.18;
        const fadeMs    = attack?.beamFadeMs  ?? 250;
        const beamKind  = attack ? `kaiju_${attack.shape}_${(attack.color || "").slice(1, 4)}` : "kaiju_beam_bead";
        try {
            const r = this.router.exec({
                type: "entity:spawnMesh", assetId: "obelisk", kind: beamKind,
                x: midX, y: midY, z: midZ, scale: thickness, yaw,
                scaleX: thickness, scaleY: thickness, scaleZ: len * 0.5,
            });
            const id = r?.id;
            if (id != null) {
                this._scheduleFadeDespawn(id, fadeMs, { scaleX: thickness, scaleY: thickness, scaleZ: len * 0.5 });
            }
        } catch {}
    }

    _fireAoE(c, target, attack = null) {
        // v767 — registry overrides for radius / damage / particle count
        const radius   = attack?.aoeRadius     ?? this._attackPolicy.aoeRadius;
        const damage   = attack?.damage        ?? this._attackPolicy.aoeDamage;
        const bursts   = attack?.aoeBursts     ?? 12;
        const partKind = attack?.aoeParticleKind || "kaiju_plasma";
        const radius2 = radius * radius;
        // Damage every registered target within radius of slam center
        const targets = (typeof window !== "undefined" && Array.isArray(window._extraRangedTargets))
                        ? window._extraRangedTargets.slice() : [];
        for (const t of targets) {
            if (!t || typeof t.x !== "number" || !t.applyDamage) continue;
            const dx = t.x - target.x, dz = t.z - target.z;
            if (dx*dx + dz*dz <= radius2) {
                try { t.applyDamage(damage); } catch {}
                // v769 — apply status effect to each target inside the AoE.
                // sonic_scream slows, emp_burst disables, etc. The effect
                // expires per-target so timing is independent.
                if (attack?.statusEffect) {
                    try { applyStatusEffect(t, attack.statusEffect); } catch {}
                }
            }
        }
        // Visual: configurable burst count. Each fades via scaleX/Y/Z over 600ms.
        if (!this.router) return;
        for (let i = 0; i < bursts; i++) {
            const a = (i / bursts) * Math.PI * 2;
            const r = 0.5 + Math.random() * (radius * 0.4);
            const px = target.x + Math.cos(a) * r;
            const pz = target.z + Math.sin(a) * r;
            try {
                const r2 = this.router.exec({
                    type: "entity:spawnMesh", assetId: "obelisk", kind: partKind,
                    x: px, y: 0.4, z: pz, scale: 0.18,
                });
                const id = r2?.id;
                if (id != null) {
                    this._scheduleFadeDespawn(id, 600, { scaleX: 0.18, scaleY: 0.18, scaleZ: 0.18 });
                }
            } catch {}
        }
    }

    // v759 — schedule scale-fade despawn via entity:rescale + entity:despawn.
    // Uses entity:rescale (existing in core/commandRouter.js) so the entity
    // visually shrinks to zero before being despawned. Independent setTimeout
    // chain — does not block the tick loop.
    _scheduleFadeDespawn(id, lifeMs, baseScale) {
        if (!this.router || id == null) return;
        const startMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
        const tick = () => {
            const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
            const t = (now - startMs) / lifeMs;
            if (t >= 1) {
                try { this.router.exec({ type: "entity:despawn", id }); } catch {}
                return;
            }
            const factor = 1 - t;
            try {
                this.router.exec({
                    type: "entity:rescale", id,
                    scaleX: (baseScale.scaleX ?? 0.18) * factor,
                    scaleY: (baseScale.scaleY ?? 0.18) * factor,
                    scaleZ: (baseScale.scaleZ ?? 0.18) * factor,
                });
            } catch {}
            // Use rAF if available, else setTimeout
            if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(tick);
            else setTimeout(tick, 16);
        };
        if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(tick);
        else setTimeout(tick, 16);
    }
}
